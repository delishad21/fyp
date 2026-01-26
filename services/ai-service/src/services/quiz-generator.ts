import OpenAI from "openai";
import { IGenerationConfig } from "../models/generation-job-model";
import { v4 as uuidv4 } from "uuid";
import axios from "axios";
import { QuizStructureAndRules } from "./quiz-service-client";

export interface GeneratedQuiz {
  tempId: string;
  quizType: "basic" | "rapid" | "crossword";
  name: string;
  subject: string;
  topic: string;
  items: any[];
  totalTimeLimit?: number | null;
  // Crossword-specific fields
  entries?: any[];
  grid?: any[][];
  placedEntries?: any[];
  // Status tracking
  status?: "pending" | "generating" | "draft" | "failed";
  error?: string;
  retryCount?: number;
}

export interface QuizGenerationProgress {
  tempId: string;
  quizNumber: number;
  status: "pending" | "generating" | "completed" | "failed";
  error?: string;
  retryCount: number;
}

export class QuizGeneratorService {
  private openai: OpenAI;
  private model: string;
  private readonly MAX_RETRIES = 5;
  private readonly PARALLEL_LIMIT: number; // Number of quizzes to generate in parallel

  constructor() {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY environment variable is required");
    }
    this.openai = new OpenAI({ apiKey });

    // GPT-5 mini: $0.25/1M input, $2.00/1M output tokens
    // Supports prompt caching (90% discount: $0.025/1M for cached inputs)
    this.model = process.env.OPENAI_MODEL || "gpt-5-mini";

    // Configurable parallel limit (default: 10)
    this.PARALLEL_LIMIT = parseInt(process.env.AI_PARALLEL_LIMIT || "10", 10);
  }

  /**
   * Generate multiple quizzes in parallel with retry logic
   */
  async generateQuizzes(
    contentOrInstructions: string,
    config: IGenerationConfig,
    structureAndRules: QuizStructureAndRules,
    onProgress?: (progress: QuizGenerationProgress[]) => void,
  ): Promise<GeneratedQuiz[]> {
    const chunks = this.splitContent(contentOrInstructions, config.numQuizzes);
    const requestedTypes = this.detectRequestedQuizTypes(config.instructions);

    // Initialize progress tracking for all quizzes
    const progressTracking: QuizGenerationProgress[] = [];
    for (let i = 0; i < config.numQuizzes; i++) {
      progressTracking.push({
        tempId: uuidv4(),
        quizNumber: i + 1,
        status: "pending",
        retryCount: 0,
      });
    }

    // Report initial progress
    if (onProgress) {
      onProgress([...progressTracking]);
    }

    // Generate quizzes in parallel
    const results = await this.generateInParallel(
      config.numQuizzes,
      chunks,
      requestedTypes,
      config,
      structureAndRules,
      progressTracking,
      onProgress,
    );

    return results.filter((r) => r !== null) as GeneratedQuiz[];
  }

  /**
   * Generate quizzes in parallel with concurrency limit
   */
  private async generateInParallel(
    count: number,
    chunks: string[],
    requestedTypes: string[],
    config: IGenerationConfig,
    structureAndRules: QuizStructureAndRules,
    progressTracking: QuizGenerationProgress[],
    onProgress?: (progress: QuizGenerationProgress[]) => void,
  ): Promise<(GeneratedQuiz | null)[]> {
    const results: (GeneratedQuiz | null)[] = new Array(count).fill(null);
    const queue: number[] = Array.from({ length: count }, (_, i) => i);
    const inProgress = new Set<number>();

    const processNext = async (): Promise<void> => {
      if (queue.length === 0) return;

      const index = queue.shift()!;
      inProgress.add(index);

      try {
        const chunk = chunks[index % chunks.length];
        if (!chunk) {
          results[index] = null;
          return;
        }

        const quizType = this.selectQuizType(
          requestedTypes,
          index,
          config.subject,
        );
        const progress = progressTracking[index];

        if (!progress) {
          results[index] = null;
          return;
        }

        // Update status to generating
        progress.status = "generating";
        if (onProgress) {
          onProgress([...progressTracking]);
        }

        // Generate with retries
        const quiz = await this.generateWithRetry(
          chunk,
          {
            ...config,
            quizType: quizType as "basic" | "rapid" | "crossword",
            quizNumber: index + 1,
          },
          structureAndRules,
          progress,
          onProgress ? () => onProgress([...progressTracking]) : undefined,
        );

        results[index] = quiz;
        progress.status = quiz ? "completed" : "failed";

        if (onProgress) {
          onProgress([...progressTracking]);
        }
      } catch (error) {
        console.error(`Failed to generate quiz ${index + 1}:`, error);
        const progress = progressTracking[index];
        if (progress) {
          progress.status = "failed";
          progress.error =
            error instanceof Error ? error.message : "Unknown error";
        }
        results[index] = null;

        if (onProgress) {
          onProgress([...progressTracking]);
        }
      } finally {
        inProgress.delete(index);
      }
    };

    // Process quizzes with controlled concurrency
    while (queue.length > 0 || inProgress.size > 0) {
      // Start new tasks up to the parallel limit
      while (inProgress.size < this.PARALLEL_LIMIT && queue.length > 0) {
        processNext();
      }

      // Wait for at least one task to complete
      if (inProgress.size > 0) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }

    return results;
  }

  /**
   * Generate a single quiz with retry logic
   */
  private async generateWithRetry(
    content: string,
    config: IGenerationConfig & {
      quizNumber: number;
      quizType: "basic" | "rapid" | "crossword";
    },
    structureAndRules: QuizStructureAndRules,
    progress: QuizGenerationProgress,
    onRetry?: () => void,
  ): Promise<GeneratedQuiz | null> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < this.MAX_RETRIES; attempt++) {
      try {
        progress.retryCount = attempt;
        if (onRetry && attempt > 0) {
          onRetry();
        }

        const quiz = await this.generateSingleQuiz(
          content,
          config,
          structureAndRules,
        );
        quiz.tempId = progress.tempId;
        quiz.status = "draft";
        quiz.retryCount = attempt;
        return quiz;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error("Unknown error");
        console.error(
          `Attempt ${attempt + 1}/${this.MAX_RETRIES} failed for quiz ${config.quizNumber}:`,
          lastError.message,
        );

        // Wait before retrying (exponential backoff)
        if (attempt < this.MAX_RETRIES - 1) {
          await new Promise((resolve) =>
            setTimeout(resolve, Math.pow(2, attempt) * 1000),
          );
        }
      }
    }

    // All retries failed
    progress.error =
      lastError?.message || "Generation failed after multiple retries";
    return null;
  }

  /**
   * Generate a single quiz from content chunk
   * Uses AI prompting rules from quiz service (each quiz type has its own defined rules and formatting instructions)
   */
  private async generateSingleQuiz(
    content: string,
    config: IGenerationConfig & {
      quizNumber: number;
      quizType: "basic" | "rapid" | "crossword";
    },
    structureAndRules: QuizStructureAndRules,
  ): Promise<GeneratedQuiz> {
    const prompt = this.buildPrompt(content, config, structureAndRules);

    const response = await this.openai.chat.completions.create({
      model: this.model,
      messages: [
        {
          role: "system",
          content: this.getSystemPrompt(config, structureAndRules),
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      response_format: { type: "json_object" },
    });

    const content_text = response.choices[0]?.message?.content;
    if (!content_text) {
      throw new Error("No response from OpenAI");
    }

    const parsed = JSON.parse(content_text);

    // Validate and transform the response
    return await this.transformToQuizFormat(parsed, config);
  }

  /**
   * Build the prompt for quiz generation with education level
   * Now uses AI prompting rules from quiz service when available
   */
  private buildPrompt(
    content: string,
    config: IGenerationConfig & {
      quizNumber: number;
      quizType: "basic" | "rapid" | "crossword";
    },
    structureAndRules: QuizStructureAndRules,
  ): string {
    // Map education level to age-appropriate description
    const levelDescriptions: Record<string, string> = {
      "primary-1": "7-year-old children (Primary 1 Singapore)",
      "primary-2": "8-year-old children (Primary 2 Singapore)",
      "primary-3": "9-year-old children (Primary 3 Singapore)",
      "primary-4": "10-year-old children (Primary 4 Singapore)",
      "primary-5": "11-year-old children (Primary 5 Singapore)",
      "primary-6": "12-year-old children (Primary 6 Singapore)",
    };

    const targetAudience =
      levelDescriptions[config.educationLevel] || "primary school students";

    let prompt = `Generate a ${config.quizType} quiz with ${config.questionsPerQuiz} questions appropriate for ${targetAudience}.\n\n`;
    prompt += `IMPORTANT: Questions must be age-appropriate in vocabulary, complexity, and concepts for ${targetAudience}.\n\n`;

    // Add batch awareness and variety instructions for multiple quiz generation
    if (config.numQuizzes > 1) {
      prompt += `\n===== BATCH CONTEXT =====\n`;
      prompt += `This is Quiz #${config.quizNumber} of ${config.numQuizzes} quizzes being generated.\n`;
      prompt += `Each quiz must be UNIQUE and DIVERSE. Apply these variety strategies:\n`;
      prompt += `- Use different question formulations and linguistic styles\n`;
      prompt += `- Focus on different aspects or subtopics within the content\n`;
      prompt += `- Vary the difficulty distribution and question types\n`;
      prompt += `- Approach the material from different angles or perspectives\n\n`;
    }

    prompt += `Instructions/Content:\n${content.slice(0, 8000)}\n\n`; // Limit content length

    prompt += `\n===== QUIZ TITLE =====\n`;
    prompt += `Generate a creative, descriptive title for the 'name' field.\n`;
    if (config.subject || config.topic) {
      const contextParts = [];
      if (config.subject) contextParts.push(config.subject);
      if (config.topic) contextParts.push(config.topic);
      prompt += `Context: This quiz is about ${contextParts.join(" - ")}.\n`;
      prompt += `Example titles: "${config.subject || "Subject"} Fundamentals", "Exploring ${config.topic || "Topic"}", "${config.topic || "Topic"} Challenge"\n`;
    }
    prompt += `\n`;

    const formatConfig: { subject?: string; topic?: string } = {};
    if (config.subject) formatConfig.subject = config.subject;
    if (config.topic) formatConfig.topic = config.topic;
    prompt += this.getFormatInstructions(
      config.quizType,
      structureAndRules,
      formatConfig,
    );

    return prompt;
  }

  /**
   * Get system prompt based on config (education level aware)
   * Uses AI prompting rules from quiz service when available
   */
  private getSystemPrompt(
    config: IGenerationConfig & {
      quizType: "basic" | "rapid" | "crossword";
      quizNumber: number;
    },
    structureAndRules: QuizStructureAndRules,
  ): string {
    // Try to use system prompt from quiz service rules
    if (structureAndRules && "schemas" in structureAndRules) {
      const schema = structureAndRules.schemas[config.quizType];
      if (schema && "aiPromptingRules" in schema) {
        // Enhance with education level
        const levelDescriptions: Record<string, string> = {
          "primary-1": "7-year-old children (Primary 1 Singapore)",
          "primary-2": "8-year-old children (Primary 2 Singapore)",
          "primary-3": "9-year-old children (Primary 3 Singapore)",
          "primary-4": "10-year-old children (Primary 4 Singapore)",
          "primary-5": "11-year-old children (Primary 5 Singapore)",
          "primary-6": "12-year-old children (Primary 6 Singapore)",
        };
        const targetLevel =
          levelDescriptions[config.educationLevel] || "primary school students";

        // Add batch awareness for variety
        const batchContext =
          config.numQuizzes > 1
            ? ` IMPORTANT: You are generating quiz ${config.quizNumber} of ${config.numQuizzes}. Each quiz in this batch must be unique and diverse. Use different question styles, perspectives, and aspects of the content to ensure variety across all quizzes.`
            : "";

        return `${schema.aiPromptingRules.systemPrompt} Target audience: ${targetLevel}.${batchContext}`;
      }
    }

    // Fallback to local prompts
    const levelDescriptions: Record<string, string> = {
      "primary-1":
        "7-year-old children (Primary 1 Singapore) - use simple vocabulary and basic concepts",
      "primary-2":
        "8-year-old children (Primary 2 Singapore) - use simple vocabulary with slightly more complexity",
      "primary-3":
        "9-year-old children (Primary 3 Singapore) - use grade-appropriate vocabulary",
      "primary-4":
        "10-year-old children (Primary 4 Singapore) - can handle more abstract concepts",
      "primary-5":
        "11-year-old children (Primary 5 Singapore) - preparing for PSLE, advanced concepts",
      "primary-6":
        "12-year-old children (Primary 6 Singapore) - PSLE level, comprehensive understanding",
    };

    const targetLevel =
      levelDescriptions[config.educationLevel] || "primary school students";

    const basePrompt = `You are an expert educational content creator specializing in creating high-quality, age-appropriate assessment questions for ${targetLevel}. `;

    // Add batch awareness for variety (same as above)
    const batchContext =
      config.numQuizzes > 1
        ? ` IMPORTANT: You are generating quiz ${config.quizNumber} of ${config.numQuizzes}. Each quiz in this batch must be unique and diverse. Use different question styles, perspectives, and aspects of the content to ensure variety across all quizzes.`
        : "";

    switch (config.quizType) {
      case "basic":
        return (
          basePrompt +
          `Create diverse quiz questions including multiple choice, open-ended, and context items. Ensure questions test understanding at an appropriate level for ${targetLevel}. Use vocabulary and concepts suitable for their age.` +
          batchContext
        );
      case "rapid":
        return (
          basePrompt +
          `Create fast-paced multiple choice questions suitable for timed quizzes at ${targetLevel}. Questions should be clear, concise, and age-appropriate.` +
          batchContext
        );
      case "crossword":
        return (
          basePrompt +
          `Create crossword puzzle entries with clear clues and single-word or short-phrase answers appropriate for ${targetLevel}. Use vocabulary they would know.` +
          batchContext
        );
    }
  }

  /**
   * Get format instructions based on quiz type
   * Uses AI prompting rules from quiz service (single source of truth)
   */
  private getFormatInstructions(
    quizType: string,
    structureAndRules: QuizStructureAndRules,
    config?: { subject?: string; topic?: string },
  ): string {
    // Use format instructions from quiz service rules (always available via client fallback)
    if (
      "schemas" in structureAndRules &&
      structureAndRules.schemas[quizType as "basic" | "rapid" | "crossword"]
    ) {
      const schema =
        structureAndRules.schemas[quizType as "basic" | "rapid" | "crossword"];
      if (schema && "aiPromptingRules" in schema) {
        return schema.aiPromptingRules.formatInstructions;
      }
    }

    // This should never happen as quiz-service-client provides a fallback
    // But if it does, return a minimal instruction to fail gracefully
    return "\n\nReturn a valid JSON object with quiz structure.";
  }

  /**
   * Transform LLM response to quiz format
   */
  private async transformToQuizFormat(
    parsed: any,
    config: IGenerationConfig & {
      quizNumber: number;
      quizType: "basic" | "rapid" | "crossword";
    },
  ): Promise<GeneratedQuiz> {
    const tempId = uuidv4();
    const quizType = config.quizType;

    // Add IDs to all items/options/answers
    let items = this.addItemIds(parsed.items || parsed.entries || [], quizType);

    // Enforce hard limit of 10 entries for crossword (quiz service constraint)
    if (quizType === "crossword" && items.length > 10) {
      console.warn(
        `Crossword has ${items.length} entries, limiting to 10 (quiz service max)`,
      );
      items = items.slice(0, 10);
    }

    // Debug log for crossword entries
    if (quizType === "crossword") {
      console.log("CROSSWORD GENERATION:", {
        quizNumber: config.quizNumber,
        rawEntriesCount: (parsed.items || parsed.entries || []).length,
        processedItemsCount: items.length,
        firstEntry: items[0],
        allEntries: items,
      });
    }

    const timeLimit = parsed.totalTimeLimit || this.getDefaultTimeLimit(config);
    const validTimeLimit = timeLimit && !isNaN(timeLimit) ? timeLimit : null;

    // Always use user-provided subject/topic from config - AI should never generate these
    const subject = config.subject?.trim() || "General";
    const topic = config.topic?.trim() || "General";

    // Name: Use AI-generated name, or create from subject/topic
    let name = parsed.name?.trim();
    if (!name || name === "Quiz" || name.length < 3) {
      name = this.generateQuizName(subject, topic);
    }

    const baseQuiz: any = {
      tempId,
      quizType,
      name,
      subject,
      topic,
      items,
      totalTimeLimit: validTimeLimit,
    };

    // For crossword quizzes, generate the grid immediately
    if (quizType === "crossword" && items.length > 0) {
      try {
        console.log("GENERATING CROSSWORD GRID:", {
          entriesCount: items.length,
          entries: items.slice(0, 2),
        });

        const gridResult = await this.generateCrosswordGrid(items);

        baseQuiz.entries = gridResult.entries;
        baseQuiz.grid = gridResult.grid;
        baseQuiz.placedEntries = gridResult.entries;
        // Keep items as empty array for schema validation
        baseQuiz.items = [];

        console.log("CROSSWORD GRID GENERATED:", {
          gridSize: gridResult.grid?.length || 0,
          entriesPlaced: gridResult.entries.filter(
            (e: any) => e.positions?.length > 0,
          ).length,
          totalEntries: gridResult.entries.length,
        });
      } catch (error) {
        console.error("Crossword grid generation failed:", error);
        // Keep entries as items if grid generation fails
        baseQuiz.entries = items;
        baseQuiz.items = [];
      }
    }

    return baseQuiz;
  }

  /**
   * Generate a meaningful quiz name when AI doesn't provide one
   */
  private generateQuizName(subject?: string, topic?: string): string {
    if (subject && topic) {
      return `${subject}: ${topic} Quiz`;
    }
    if (subject) {
      return `${subject} Quiz`;
    }
    if (topic) {
      return `${topic} Assessment`;
    }
    return `General Quiz`;
  }

  /**
   * Add unique IDs to all items and their sub-elements
   */
  private addItemIds(items: any[], quizType: string): any[] {
    return items.map((item: any) => {
      const baseItem = {
        ...item,
        id: item.id || uuidv4(),
      };

      // Add IDs to options (for MC)
      if (baseItem.options && Array.isArray(baseItem.options)) {
        baseItem.options = baseItem.options.map((opt: any) => ({
          ...opt,
          id: opt.id || uuidv4(),
        }));
      }

      // Add IDs to answers (for open-ended) and ensure answerType is set
      if (baseItem.answers && Array.isArray(baseItem.answers)) {
        baseItem.answers = baseItem.answers.map((ans: any) => {
          const answerType =
            ans.answerType || this.determineAnswerType(baseItem.text || "");

          const answer: any = {
            ...ans,
            id: ans.id || uuidv4(),
            answerType,
          };

          // Preserve type-specific fields if provided by AI
          if (answerType === "fuzzy") {
            answer.similarityThreshold = ans.similarityThreshold ?? 0.85;
          } else if (answerType === "keywords") {
            answer.keywords = ans.keywords || [];
            answer.minKeywords =
              ans.minKeywords ?? Math.ceil((ans.keywords?.length || 0) * 0.6);
          } else if (answerType === "list") {
            answer.listItems = ans.listItems || [];
            answer.requireOrder = ans.requireOrder ?? false;
            answer.minCorrectItems =
              ans.minCorrectItems ?? (ans.listItems?.length || 0);
          }

          return answer;
        });
      }

      // For crossword entries
      if (quizType === "crossword" && !baseItem.type) {
        return {
          id: baseItem.id,
          answer: (baseItem.answer || "").toUpperCase().replace(/\s+/g, ""),
          clue: baseItem.clue || "",
          positions: [],
          direction: null,
        };
      }

      return baseItem;
    });
  }

  /**
   * Get default time limit based on configuration
   */
  private getDefaultTimeLimit(config: IGenerationConfig): number | null {
    if (config.timerSettings?.type === "none") {
      return null;
    }

    if (
      config.timerSettings?.type === "custom" &&
      config.timerSettings.defaultSeconds
    ) {
      return config.timerSettings.defaultSeconds;
    }

    // Default: 2 minutes per question
    const questionsPerQuiz = Number(config.questionsPerQuiz) || 10;
    return questionsPerQuiz * 120;
  }

  /**
   * Intelligently determine answer type for open-ended questions
   * Fallback for when AI doesn't specify answerType
   */
  private determineAnswerType(questionText: string): string {
    const lowerQ = questionText.toLowerCase();

    // List questions: "name three...", "list five...", "what are the..."
    if (
      /\b(name|list|identify|give|state)\s+(three|four|five|several|all|some|examples?|the)\b/.test(
        lowerQ,
      )
    ) {
      return "list";
    }

    // Keyword questions: "explain", "describe", "why", "how"
    if (
      /\b(explain|describe|why|how|discuss|compare|analyze|elaborate)\b/.test(
        lowerQ,
      )
    ) {
      return "keywords";
    }

    // Exact questions: capital, who invented, dates, names
    if (
      /\b(capital|who\s+(invented|discovered|wrote)|what\s+year|date|name\s+of)\b/.test(
        lowerQ,
      )
    ) {
      return "exact";
    }

    // Default: fuzzy (handles typos for most questions)
    return "fuzzy";
  }

  /**
   * Generate crossword grid by calling quiz-service internal endpoint
   */
  private async generateCrosswordGrid(
    entries: any[],
  ): Promise<{ grid: any[][]; entries: any[] }> {
    const quizServiceUrl =
      process.env.QUIZ_SERVICE_URL || "http://quiz-service:5002";

    const words = entries.map((e: any) => e.answer);
    const clues = entries.map((e: any) => e.clue);

    try {
      const response = await axios.post(
        `${quizServiceUrl}/quiz/internal/generate-crossword`,
        {
          words,
          clues,
          gridSize: 20,
        },
        {
          timeout: 10000,
          headers: {
            "Content-Type": "application/json",
          },
        },
      );

      if (response.data?.ok && response.data?.grid && response.data?.entries) {
        return {
          grid: response.data.grid,
          entries: response.data.entries.map((entry: any, idx: number) => ({
            id: entries[idx]?.id || entry.id,
            answer: entry.answer,
            clue: entry.clue,
            positions: entry.positions || [],
            direction: entry.direction || null,
          })),
        };
      }

      throw new Error("Invalid response from crossword generator");
    } catch (error) {
      console.error("Crossword grid generation error:", error);
      // Return entries without grid on failure
      return {
        grid: [],
        entries: entries.map((entry: any) => ({
          id: entry.id,
          answer: entry.answer,
          clue: entry.clue,
          positions: [],
          direction: null,
        })),
      };
    }
  }

  /**
   * Detect all quiz types mentioned in user instructions (called once)
   */
  private detectRequestedQuizTypes(instructions: string): string[] {
    const lowerInstructions = instructions.toLowerCase();
    const requestedTypes: string[] = [];

    if (
      lowerInstructions.includes("crossword") ||
      lowerInstructions.includes("cross word") ||
      lowerInstructions.includes("puzzle")
    ) {
      requestedTypes.push("crossword");
    }

    if (
      lowerInstructions.includes("rapid") ||
      lowerInstructions.includes("quick") ||
      lowerInstructions.includes("fast-paced") ||
      lowerInstructions.includes("multiple choice only")
    ) {
      requestedTypes.push("rapid");
    }

    if (
      lowerInstructions.includes("basic") ||
      lowerInstructions.includes("standard") ||
      lowerInstructions.includes("mixed questions")
    ) {
      requestedTypes.push("basic");
    }

    return requestedTypes;
  }

  /**
   * Select quiz type based on detected types and current index (called per quiz)
   */
  private selectQuizType(
    requestedTypes: string[],
    index: number,
    subject?: string,
  ): string {
    // If multiple types requested, distribute them across quizzes
    if (requestedTypes.length > 1) {
      return requestedTypes[index % requestedTypes.length] || "basic";
    }

    // If single type requested, use it for all quizzes
    if (requestedTypes.length === 1) {
      return requestedTypes[0] || "basic";
    }

    // If no specific type mentioned, use intelligent distribution
    return this.intelligentQuizTypeSelection(index, subject);
  }

  /**
   * Intelligently select quiz type - AI decides the mix
   * Creates a balanced distribution of basic, rapid, and crossword quizzes
   */
  private intelligentQuizTypeSelection(
    index: number,
    subject?: string,
  ): string {
    // Check if subject is math-related (crosswords don't work well for math)
    const isMathSubject =
      subject &&
      /^(math|mathematics|algebra|geometry|calculus|arithmetic|trigonometry)$/i.test(
        subject.trim(),
      );

    if (isMathSubject) {
      // Math distribution: 60% basic, 40% rapid (no crosswords)
      const mathDistribution = [
        "basic",
        "basic",
        "rapid",
        "basic",
        "rapid",
        "basic",
        "basic",
        "rapid",
        "basic",
        "rapid",
      ];
      return mathDistribution[index % mathDistribution.length] || "basic";
    }

    // Default distribution: 50% basic, 30% rapid, 20% crossword
    // This ensures variety while prioritizing comprehensive assessment (basic)
    const distribution = [
      "basic",
      "basic",
      "rapid",
      "basic",
      "crossword",
      "basic",
      "rapid",
      "basic",
      "rapid",
      "crossword",
    ];
    return distribution[index % distribution.length] || "basic";
  }

  /**
   * Split content into chunks with improved variety
   * Uses overlapping windows and shuffled paragraph sampling
   */
  private splitContent(text: string, numChunks: number): string[] {
    const paragraphs = text.split(/\n\n+/).filter((p) => p.trim().length > 0);

    if (paragraphs.length === 0) {
      return [text];
    }

    const chunks: string[] = [];

    // Strategy 1: If we have more paragraphs than chunks, use overlapping windows
    if (paragraphs.length >= numChunks * 2) {
      const windowSize = Math.ceil((paragraphs.length / numChunks) * 1.2); // 20% overlap
      const step = Math.floor(paragraphs.length / numChunks);

      for (let i = 0; i < numChunks; i++) {
        const start = i * step;
        const end = Math.min(start + windowSize, paragraphs.length);
        const chunk = paragraphs.slice(start, end).join("\n\n");
        if (chunk.trim().length > 0) {
          chunks.push(chunk);
        }
      }
    }
    // Strategy 2: If paragraphs ~ chunks, do sequential distribution
    else if (paragraphs.length >= numChunks) {
      const chunkSize = Math.ceil(paragraphs.length / numChunks);
      for (let i = 0; i < numChunks; i++) {
        const start = i * chunkSize;
        const end = Math.min(start + chunkSize, paragraphs.length);
        const chunk = paragraphs.slice(start, end).join("\n\n");
        if (chunk.trim().length > 0) {
          chunks.push(chunk);
        }
      }
    }
    // Strategy 3: If few paragraphs, use round-robin distribution with variety markers
    else {
      // Distribute paragraphs round-robin and add position markers for variety
      const chunkBuilders: string[][] = Array.from(
        { length: numChunks },
        () => [],
      );
      paragraphs.forEach((para, idx) => {
        const targetChunk = chunkBuilders[idx % numChunks];
        if (targetChunk) {
          targetChunk.push(para);
        }
      });

      chunkBuilders.forEach((paraList, idx) => {
        if (paraList.length > 0) {
          // Add a subtle marker to encourage variety based on position
          const varietyHint = `[Focus Area ${idx + 1}/${numChunks}]\n`;
          chunks.push(varietyHint + paraList.join("\n\n"));
        }
      });
    }

    // Ensure we have enough chunks
    while (chunks.length < numChunks && chunks.length > 0) {
      // Instead of exact repetition, create variations by combining chunks
      const idx = chunks.length % chunks.length;
      const nextIdx = (chunks.length + 1) % chunks.length;
      const combined = `${chunks[idx]}\n\n[Alternative Perspective]\n\n${chunks[nextIdx]}`;
      chunks.push(combined);
    }

    return chunks;
  }
}
