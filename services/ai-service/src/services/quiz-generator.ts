import {
  IGenerationConfig,
  IPlanningPassAnalytics,
  IQuizAnalytics,
  IQuizAttemptAnalytics,
  IQuizAnalyticsTotals,
} from "../models/generation-job-model";
import { v4 as uuidv4 } from "uuid";
import axios from "axios";
import { QuizStructureAndRules } from "./quiz-service-client";
import {
  AIModelDescriptor,
  getConfiguredProviderApiKey,
  resolveSelectedAIModel,
} from "./ai-model-catalog";
import {
  generateJsonWithModel,
  LLMCallMetrics,
  LLMGenerationError,
  LLMTokenUsage,
} from "./llm-client";

type AIGeneratedQuizType = "basic" | "rapid" | "crossword" | "true-false";

interface BatchPlanQuizItem {
  quizNumber: number;
  quizType: AIGeneratedQuizType;
  focus: string;
  angle: string;
  mustCover: string[];
  avoidOverlap: string[];
  titleHint?: string;
  topicHint?: string;
}

interface BatchGenerationPlan {
  quizzes: BatchPlanQuizItem[];
}

export interface QuizBatchGenerationResult {
  quizzes: GeneratedQuiz[];
  planning: IPlanningPassAnalytics;
}

export interface GeneratedQuiz {
  tempId: string;
  quizType: AIGeneratedQuizType;
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
  analytics?: IQuizAnalytics;
}

export interface QuizGenerationProgress {
  tempId: string;
  quizNumber: number;
  status: "pending" | "generating" | "completed" | "failed";
  error?: string;
  retryCount: number;
  analytics: IQuizAnalytics;
}

export class QuizGeneratorService {
  private readonly MAX_RETRIES = 5;
  private readonly MAX_PLANNING_RETRIES: number = 3;
  private readonly PARALLEL_LIMIT: number; // Number of quizzes to generate in parallel

  constructor() {
    // Configurable parallel limit (default: 10)
    this.PARALLEL_LIMIT = parseInt(process.env.AI_PARALLEL_LIMIT || "10", 10);
    this.MAX_PLANNING_RETRIES = Math.max(
      1,
      parseInt(process.env.AI_PLANNING_MAX_RETRIES || "3", 10),
    );
  }

  /**
   * Two-pass generation:
   * Pass 1) Build a batch blueprint in a single LLM call.
   * Pass 2) Generate each quiz in parallel, guided by its blueprint item.
   */
  async generateQuizzes(
    contentOrInstructions: string,
    config: IGenerationConfig,
    structureAndRules: QuizStructureAndRules,
    onProgress?: (progress: QuizGenerationProgress[]) => void,
    precomputedChunks?: string[],
  ): Promise<QuizBatchGenerationResult> {
    const selectedModel = this.resolveRuntimeModel(config);
    const chunks =
      Array.isArray(precomputedChunks) && precomputedChunks.length > 0
        ? precomputedChunks
        : this.splitContent(contentOrInstructions, config.numQuizzes);
    const requestedTypes = this.resolveRequestedQuizTypes(
      config,
      structureAndRules,
    );
    const quizTypePlan = this.buildQuizTypePlan(config.numQuizzes, requestedTypes);
    const planning = await this.buildBatchPlan(
      contentOrInstructions,
      chunks,
      config,
      quizTypePlan,
      selectedModel,
    );

    // Initialize progress tracking for all quizzes
    const progressTracking: QuizGenerationProgress[] = [];
    for (let i = 0; i < config.numQuizzes; i++) {
      progressTracking.push({
        tempId: uuidv4(),
        quizNumber: i + 1,
        status: "pending",
        retryCount: 0,
        analytics: this.createEmptyQuizAnalytics(),
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
      quizTypePlan,
      planning.plan.quizzes,
      config,
      selectedModel,
      structureAndRules,
      progressTracking,
      onProgress,
    );

    return {
      quizzes: results.filter((r) => r !== null) as GeneratedQuiz[],
      planning: planning.analytics,
    };
  }

  /**
   * Generate quizzes in parallel with concurrency limit
   */
  private async generateInParallel(
    count: number,
    chunks: string[],
    quizTypePlan: AIGeneratedQuizType[],
    planItems: BatchPlanQuizItem[],
    config: IGenerationConfig,
    selectedModel: { descriptor: AIModelDescriptor; apiKey: string },
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

        const quizType = quizTypePlan[index] || quizTypePlan[0] || "basic";
        const planItem = planItems[index];
        if (!planItem) {
          throw new Error(
            `Planning pass returned incomplete blueprint: missing plan item for quiz ${index + 1}.`,
          );
        }
        const runtimeConfig = this.buildPerQuizRuntimeConfig(
          config,
          quizType as AIGeneratedQuizType,
          index + 1,
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
          this.buildGuidedContent(chunk, planItem, planItems),
          runtimeConfig,
          selectedModel,
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

  private buildPerQuizRuntimeConfig(
    config: IGenerationConfig,
    quizType: AIGeneratedQuizType,
    quizNumber: number,
  ): IGenerationConfig & {
    quizNumber: number;
    quizType: AIGeneratedQuizType;
  } {
    const normalizedSubject = String(config.subject || "").trim();
    if (!normalizedSubject) {
      throw new Error(
        `Quiz #${quizNumber} (${quizType}) missing required selected subject.`,
      );
    }

    return {
      instructions: String(config.instructions || ""),
      numQuizzes: Number(config.numQuizzes) || 1,
      quizTypes: Array.isArray(config.quizTypes)
        ? [...config.quizTypes]
        : [quizType],
      educationLevel: config.educationLevel,
      questionsPerQuiz: Number(config.questionsPerQuiz) || 10,
      ...(config.aiModel ? { aiModel: config.aiModel } : {}),
      subject: normalizedSubject,
      ...(config.timerSettings
        ? { timerSettings: { ...config.timerSettings } }
        : {}),
      quizType,
      quizNumber,
    };
  }

  private async buildBatchPlan(
    contentOrInstructions: string,
    chunks: string[],
    config: IGenerationConfig,
    quizTypePlan: AIGeneratedQuizType[],
    selectedModel: { descriptor: AIModelDescriptor; apiKey: string },
  ): Promise<{ plan: BatchGenerationPlan; analytics: IPlanningPassAnalytics }> {
    const planningStartedAtMs = Date.now();
    const planningContext = this.buildPlanningContext(contentOrInstructions, chunks);
    const planningAttempts: Array<{
      success: boolean;
      provider: "openai" | "anthropic" | "gemini";
      model: string;
      llmLatencyMs: number;
      usage: LLMTokenUsage;
      error?: string;
    }> = [];

    let lastMessage = "Failed to build batch plan";

    for (let attempt = 0; attempt < this.MAX_PLANNING_RETRIES; attempt++) {
      const attemptStartedAtMs = Date.now();
      try {
        const planned = await generateJsonWithModel({
          provider: selectedModel.descriptor.provider,
          apiKey: selectedModel.apiKey,
          model: selectedModel.descriptor.model,
          systemPrompt: this.buildPlanningSystemPrompt(config, quizTypePlan),
          userPrompt: this.buildPlanningUserPrompt(
            planningContext,
            config,
            quizTypePlan,
          ),
        });

        planningAttempts.push({
          success: true,
          provider: planned.metrics.provider,
          model: planned.metrics.model,
          llmLatencyMs: planned.metrics.llmLatencyMs,
          usage: planned.metrics.usage,
        });

        const normalizedItems = this.normalizeBatchPlan(
          planned.parsed,
          config.numQuizzes,
          quizTypePlan,
        );
        const aggregated = this.computePlanningAnalyticsTotals(planningAttempts);

        return {
          plan: { quizzes: normalizedItems },
          analytics: {
            success: true,
            fallbackUsed: false,
            attemptCount: aggregated.attemptCount,
            successfulAttempts: aggregated.successfulAttempts,
            retryCount: aggregated.retryCount,
            provider: planned.metrics.provider,
            model: planned.metrics.model,
            llmLatencyMs: aggregated.llmLatencyMs,
            usage: aggregated.usage,
            startedAt: new Date(planningStartedAtMs),
            completedAt: new Date(),
            planItemCount: normalizedItems.length,
          },
        };
      } catch (error) {
        const llmError = error instanceof LLMGenerationError ? error : null;
        const metrics = llmError?.metrics;
        lastMessage =
          error instanceof Error ? error.message : "Failed to build batch plan";

        planningAttempts.push({
          success: false,
          provider: metrics?.provider || selectedModel.descriptor.provider,
          model: metrics?.model || selectedModel.descriptor.model,
          llmLatencyMs: metrics?.llmLatencyMs || Date.now() - attemptStartedAtMs,
          usage: metrics?.usage || {
            inputTokens: 0,
            outputTokens: 0,
            totalTokens: 0,
          },
          error: lastMessage,
        });

        if (attempt < this.MAX_PLANNING_RETRIES - 1) {
          console.warn(
            `[QuizGenerator] Planning pass attempt ${attempt + 1}/${this.MAX_PLANNING_RETRIES} failed. Retrying:`,
            lastMessage,
          );
          await new Promise((resolve) =>
            setTimeout(resolve, Math.pow(2, attempt) * 1000),
          );
        }
      }
    }

    const aggregated = this.computePlanningAnalyticsTotals(planningAttempts);
    const planningFailureMessage = `Planning pass failed after ${this.MAX_PLANNING_RETRIES} attempt(s): ${lastMessage}`;

    console.error("[QuizGenerator]", planningFailureMessage, {
      attempts: aggregated.attemptCount,
      retries: aggregated.retryCount,
      llmLatencyMs: aggregated.llmLatencyMs || Date.now() - planningStartedAtMs,
      usage: aggregated.usage,
    });

    throw new Error(planningFailureMessage);
  }

  private buildPlanningSystemPrompt(
    config: IGenerationConfig,
    quizTypePlan: AIGeneratedQuizType[],
  ): string {
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
    return [
      "You are an expert educational assessment planner for quiz generation.",
      `Plan ${config.numQuizzes} distinct quizzes for ${targetAudience}.`,
      `Subject is fixed to "${config.subject}" and cannot be changed.`,
      "Return ONLY valid JSON (no markdown).",
      "The plan must reduce duplication across quizzes and maximize topical/skill coverage.",
      "Source documents may contain irrelevant or off-topic sections; prioritize relevance to teacher instructions, subject, and level.",
      "Ignore unrelated context rather than forcing it into the plan.",
      `Quiz type assignments are pre-locked: ${quizTypePlan
        .map((type, index) => `${index + 1}:${type}`)
        .join(", ")}.`,
    ].join(" ");
  }

  private buildPlanningUserPrompt(
    planningContext: string,
    config: IGenerationConfig,
    quizTypePlan: AIGeneratedQuizType[],
  ): string {
    return [
      `Create a generation blueprint for ${config.numQuizzes} quizzes.`,
      "Return JSON with this exact top-level shape:",
      '{"quizzes":[{"quizNumber":1,"quizType":"basic","focus":"...","angle":"...","mustCover":["..."],"avoidOverlap":["..."],"titleHint":"...","topicHint":"..."}]}',
      "Rules:",
      `- quizzes array length must be exactly ${config.numQuizzes}.`,
      "- quizNumber must be sequential from 1..N.",
      "- quizType for each quiz must exactly match the pre-locked assignment.",
      "- planning context can include noisy or irrelevant material; use only instruction-relevant evidence.",
      "- if context conflicts with teacher instructions, prioritize teacher instructions and subject/level constraints.",
      "- focus should be concise (3-8 words), concrete, and unique across quizzes.",
      "- angle should describe the pedagogical approach/style (short phrase).",
      "- mustCover should list 1-3 concepts/skills to prioritize.",
      "- avoidOverlap should list 1-3 things to avoid repeating from other quizzes.",
      "- titleHint/topicHint should be concise and not include numbering/progress markers.",
      `- respect subject "${config.subject}", education level "${config.educationLevel}", and requested count ${config.questionsPerQuiz} questions per quiz.`,
      `Pre-locked quiz type assignments: ${quizTypePlan
        .map((type, index) => `${index + 1}:${type}`)
        .join(", ")}.`,
      "",
      "Planning context:",
      planningContext,
    ].join("\n");
  }

  private buildPlanningContext(
    contentOrInstructions: string,
    chunks: string[],
  ): string {
    const contextParts: string[] = [];
    const maxChunkCount = Math.min(chunks.length, 10);
    const maxCharsPerChunk = 1200;

    contextParts.push(
      `Teacher instructions (full or truncated):\n${String(
        contentOrInstructions || "",
      ).slice(0, 4000)}`,
    );

    for (let i = 0; i < maxChunkCount; i++) {
      const chunk = chunks[i];
      if (!chunk) continue;
      contextParts.push(
        `Context slice ${i + 1}:\n${chunk.slice(0, maxCharsPerChunk)}`,
      );
    }

    return contextParts.join("\n\n").slice(0, 16000);
  }

  private normalizeBatchPlan(
    parsed: any,
    numQuizzes: number,
    quizTypePlan: AIGeneratedQuizType[],
  ): BatchPlanQuizItem[] {
    const rawCandidates = Array.isArray(parsed?.quizzes)
      ? parsed.quizzes
      : Array.isArray(parsed?.plan?.quizzes)
        ? parsed.plan.quizzes
        : null;

    if (!rawCandidates || rawCandidates.length === 0) {
      throw new Error("Planning pass returned empty quizzes array.");
    }

    const sanitized: BatchPlanQuizItem[] = [];
    const seenFocus = new Set<string>();

    for (let i = 0; i < Math.max(1, numQuizzes); i++) {
      const quizNumber = i + 1;
      const expectedType = quizTypePlan[i] || quizTypePlan[0] || "basic";
      const byNumber = rawCandidates.find(
        (candidate: any) => Number(candidate?.quizNumber) === quizNumber,
      );
      if (!byNumber) {
        throw new Error(
          `Planning pass missing blueprint item for quizNumber ${quizNumber}.`,
        );
      }
      const raw = byNumber;

      const rawType = String(raw?.quizType || "").trim();
      if (rawType !== expectedType) {
        throw new Error(
          `Planning pass quizType mismatch for quizNumber ${quizNumber}: expected "${expectedType}", got "${rawType || "<empty>"}".`,
        );
      }

      const focus = String(raw?.focus || "")
        .trim()
        .replace(/\s+/g, " ")
        .slice(0, 80);
      if (!focus) {
        throw new Error(
          `Planning pass missing required focus for quizNumber ${quizNumber}.`,
        );
      }
      const normalizedFocusKey = focus.toLowerCase();
      if (seenFocus.has(normalizedFocusKey)) {
        throw new Error(
          `Planning pass focus must be unique across quizzes. Duplicate focus: "${focus}".`,
        );
      }
      seenFocus.add(focus.toLowerCase());

      const angle =
        String(raw?.angle || "")
          .trim()
          .replace(/\s+/g, " ")
          .slice(0, 80);
      if (!angle) {
        throw new Error(
          `Planning pass missing required angle for quizNumber ${quizNumber}.`,
        );
      }

      const toStrictShortStringArray = (
        value: unknown,
        fieldName: "mustCover" | "avoidOverlap",
      ): string[] => {
        const values = this.normalizeStringArray(value)
          .slice(0, 3)
          .map((entry) => entry.slice(0, 80));
        if (values.length === 0) {
          throw new Error(
            `Planning pass missing required ${fieldName} for quizNumber ${quizNumber}.`,
          );
        }
        return values;
      };

      const mustCover = toStrictShortStringArray(raw?.mustCover, "mustCover");
      const avoidOverlap = toStrictShortStringArray(
        raw?.avoidOverlap,
        "avoidOverlap",
      );
      const titleHint = String(raw?.titleHint || "").trim().slice(0, 120) || undefined;
      const topicHint = String(raw?.topicHint || "").trim().slice(0, 120) || undefined;

      sanitized.push({
        quizNumber,
        quizType: rawType as AIGeneratedQuizType,
        focus,
        angle,
        mustCover,
        avoidOverlap,
        ...(titleHint ? { titleHint } : {}),
        ...(topicHint ? { topicHint } : {}),
      });
    }

    return sanitized;
  }

  private buildGuidedContent(
    baseContent: string,
    planItem: BatchPlanQuizItem,
    allPlanItems: BatchPlanQuizItem[],
  ): string {
    const otherFocuses = allPlanItems
      .filter((item) => item.quizNumber !== planItem.quizNumber)
      .slice(0, 8)
      .map((item) => `${item.quizNumber}: ${item.focus}`)
      .join("; ");

    const mustCoverText =
      planItem.mustCover.length > 0
        ? planItem.mustCover.join("; ")
        : "No additional must-cover constraints";
    const avoidText =
      planItem.avoidOverlap.length > 0
        ? planItem.avoidOverlap.join("; ")
        : "Avoid repeating exact stems or only changing numbers";

    const titleHint = planItem.titleHint
      ? `- title hint: ${planItem.titleHint}\n`
      : "";
    const topicHint = planItem.topicHint
      ? `- topic hint: ${planItem.topicHint}\n`
      : "";

    return [
      "===== PLANNING PASS BLUEPRINT (MANDATORY) =====",
      `This quiz must follow blueprint item #${planItem.quizNumber}.`,
      `- quiz type: ${planItem.quizType}`,
      `- focus: ${planItem.focus}`,
      `- angle/style: ${planItem.angle}`,
      `- must cover: ${mustCoverText}`,
      `- avoid overlap: ${avoidText}`,
      `${titleHint}${topicHint}`.trim(),
      `Other quiz focuses in this batch (do not duplicate): ${otherFocuses || "N/A"}`,
      "You must prioritize this blueprint while staying faithful to source context.",
      "Source context can contain unrelated sections; use only parts relevant to teacher instructions and this quiz blueprint.",
      "",
      "===== SOURCE CONTEXT =====",
      baseContent,
    ]
      .filter((line) => line.length > 0)
      .join("\n");
  }

  /**
   * Generate a single quiz with retry logic
   */
  private async generateWithRetry(
    content: string,
    config: IGenerationConfig & {
      quizNumber: number;
      quizType: AIGeneratedQuizType;
    },
    selectedModel: { descriptor: AIModelDescriptor; apiKey: string },
    structureAndRules: QuizStructureAndRules,
    progress: QuizGenerationProgress,
    onRetry?: () => void,
  ): Promise<GeneratedQuiz | null> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < this.MAX_RETRIES; attempt++) {
      const attemptStartedAtMs = Date.now();
      try {
        progress.retryCount = attempt;
        if (onRetry && attempt > 0) {
          onRetry();
        }

        const generated = await this.generateSingleQuiz(
          content,
          config,
          selectedModel,
          structureAndRules,
        );

        this.appendAttemptAnalytics(progress, {
          attemptNumber: attempt + 1,
          success: true,
          provider: generated.llmMetrics.provider,
          model: generated.llmMetrics.model,
          llmLatencyMs: generated.llmMetrics.llmLatencyMs,
          usage: generated.llmMetrics.usage,
          startedAt: new Date(attemptStartedAtMs),
          completedAt: new Date(),
        });

        const quiz = generated.quiz;
        quiz.tempId = progress.tempId;
        quiz.status = "draft";
        quiz.retryCount = attempt;
        quiz.analytics = progress.analytics;
        return quiz;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error("Unknown error");
        const llmError = error instanceof LLMGenerationError ? error : null;
        const metrics = llmError?.metrics;
        const usage: LLMTokenUsage = metrics?.usage || {
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
        };

        this.appendAttemptAnalytics(progress, {
          attemptNumber: attempt + 1,
          success: false,
          provider: metrics?.provider || selectedModel.descriptor.provider,
          model: metrics?.model || selectedModel.descriptor.model,
          llmLatencyMs: metrics?.llmLatencyMs || Date.now() - attemptStartedAtMs,
          usage,
          startedAt: new Date(attemptStartedAtMs),
          completedAt: new Date(),
          error: lastError.message,
        });

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
      quizType: AIGeneratedQuizType;
    },
    selectedModel: { descriptor: AIModelDescriptor; apiKey: string },
    structureAndRules: QuizStructureAndRules,
  ): Promise<{ quiz: GeneratedQuiz; llmMetrics: LLMCallMetrics }> {
    const prompt = this.buildPrompt(content, config, structureAndRules);
    const generated = await generateJsonWithModel({
      provider: selectedModel.descriptor.provider,
      apiKey: selectedModel.apiKey,
      model: selectedModel.descriptor.model,
      systemPrompt: this.getSystemPrompt(config, structureAndRules),
      userPrompt: prompt,
    });

    // Validate and transform the response
    return {
      quiz: await this.transformToQuizFormat(generated.parsed, config),
      llmMetrics: generated.metrics,
    };
  }

  private resolveRuntimeModel(config: IGenerationConfig): {
    descriptor: AIModelDescriptor;
    apiKey: string;
  } {
    const descriptor = resolveSelectedAIModel(config.aiModel);
    if (!descriptor) {
      throw new Error(
        "AI generation is currently unavailable. No model API keys are configured.",
      );
    }

    const apiKey = getConfiguredProviderApiKey(descriptor.provider);
    if (!apiKey) {
      throw new Error(
        `Selected model provider '${descriptor.provider}' is not configured.`,
      );
    }

    return { descriptor, apiKey };
  }

  private createEmptyQuizAnalytics(): IQuizAnalytics {
    return {
      attempts: [],
      totals: {
        attemptCount: 0,
        successfulAttempts: 0,
        retryCount: 0,
        llmLatencyMs: 0,
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
      },
    };
  }

  private appendAttemptAnalytics(
    progress: QuizGenerationProgress,
    attempt: IQuizAttemptAnalytics,
  ): void {
    const current = progress.analytics || this.createEmptyQuizAnalytics();
    const attempts = [...current.attempts, attempt];
    const totals = this.computeQuizAnalyticsTotals(attempts);
    progress.analytics = {
      attempts,
      totals,
    };
  }

  private computeQuizAnalyticsTotals(
    attempts: IQuizAttemptAnalytics[],
  ): IQuizAnalyticsTotals {
    return {
      attemptCount: attempts.length,
      successfulAttempts: attempts.filter((a) => a.success).length,
      retryCount: Math.max(
        0,
        attempts.length - attempts.filter((a) => a.success).length,
      ),
      llmLatencyMs: attempts.reduce((sum, a) => sum + (a.llmLatencyMs || 0), 0),
      inputTokens: attempts.reduce(
        (sum, a) => sum + (a.usage?.inputTokens || 0),
        0,
      ),
      outputTokens: attempts.reduce(
        (sum, a) => sum + (a.usage?.outputTokens || 0),
        0,
      ),
      totalTokens: attempts.reduce(
        (sum, a) => sum + (a.usage?.totalTokens || 0),
        0,
      ),
    };
  }

  private computePlanningAnalyticsTotals(
    attempts: Array<{
      success: boolean;
      llmLatencyMs: number;
      usage: LLMTokenUsage;
    }>,
  ): {
    attemptCount: number;
    successfulAttempts: number;
    retryCount: number;
    llmLatencyMs: number;
    usage: LLMTokenUsage;
  } {
    const attemptCount = attempts.length;
    const successfulAttempts = attempts.filter((a) => a.success).length;
    return {
      attemptCount,
      successfulAttempts,
      retryCount: Math.max(0, attemptCount - successfulAttempts),
      llmLatencyMs: attempts.reduce((sum, a) => sum + (a.llmLatencyMs || 0), 0),
      usage: {
        inputTokens: attempts.reduce(
          (sum, a) => sum + (a.usage?.inputTokens || 0),
          0,
        ),
        outputTokens: attempts.reduce(
          (sum, a) => sum + (a.usage?.outputTokens || 0),
          0,
        ),
        totalTokens: attempts.reduce(
          (sum, a) => sum + (a.usage?.totalTokens || 0),
          0,
        ),
      },
    };
  }

  /**
   * Build the prompt for quiz generation with education level
   * Now uses AI prompting rules from quiz service when available
   */
  private buildPrompt(
    content: string,
    config: IGenerationConfig & {
      quizNumber: number;
      quizType: AIGeneratedQuizType;
    },
    structureAndRules: QuizStructureAndRules,
  ): string {
    const expectedQuestionCount = this.getExpectedQuestionCount(
      config.quizType,
      config.questionsPerQuiz,
    );

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

    let prompt = `Generate a ${config.quizType} quiz with exactly ${expectedQuestionCount} questions appropriate for ${targetAudience}.\n\n`;
    prompt += `IMPORTANT: Questions must be age-appropriate in vocabulary, complexity, and concepts for ${targetAudience}.\n\n`;
    prompt += `STRICT REQUIREMENT: Return exactly ${expectedQuestionCount} entries in the quiz items list. Do not return more or fewer.\n\n`;
    prompt += `COUNT VALIDATION (MANDATORY BEFORE YOU RESPOND):\n`;
    prompt += `- If your output structure uses 'items', the 'items' array length MUST be exactly ${expectedQuestionCount}.\n`;
    prompt += `- If your output structure uses 'entries', the 'entries' array length MUST be exactly ${expectedQuestionCount}.\n`;
    prompt += `- Perform a final self-check and fix the count before returning.\n`;
    prompt += `- Return only the final corrected JSON object.\n\n`;

    if (config.quizType === "crossword" && config.questionsPerQuiz > 10) {
      prompt += `NOTE: Crossword quizzes support a maximum of 10 entries. Use exactly 10 entries.\n\n`;
    }

    // Add batch awareness and variety instructions for multiple quiz generation
    if (config.numQuizzes > 1) {
      prompt += `\n===== BATCH CONTEXT =====\n`;
      prompt += `This is Quiz #${config.quizNumber} of ${config.numQuizzes} quizzes being generated.\n`;
      prompt += `Each quiz must be UNIQUE and DIVERSE. Apply these variety strategies:\n`;
      prompt += `- Use different question formulations and linguistic styles\n`;
      prompt += `- Focus on different aspects or subtopics within the content\n`;
      prompt += `- Vary the difficulty distribution and question types\n`;
      prompt += `- Approach the material from different angles or perspectives\n\n`;
      prompt += `IMPORTANT OUTPUT RULE: Do NOT include batch numbering, index markers, or progress markers in "name" or "topic" (e.g., "Quiz 2", "#3", "(2/5)", "Quiz 4").\n\n`;
    }

    prompt += `Instructions/Content:\n${content.slice(0, 8000)}\n\n`; // Limit content length

    prompt += `\n===== QUIZ TITLE =====\n`;
    prompt += `Generate a creative, descriptive title for the 'name' field.\n`;
    prompt += `Title rules: plain human-readable title, no numbering/progress markers, no parenthesized batch labels.\n`;
    prompt += `METADATA COMPLIANCE RULES:\n`;
    prompt += `- "name" must not contain quiz numbering markers (forbidden examples: "Quiz 2", "#3", "(2/5)", "4/5").\n`;
    prompt += `- "topic" must be concise and content-based (prefer 1-2 words, maximum 4 words unless absolutely necessary).\n`;
    prompt += `- "topic" must not contain numbering/progress markers.\n`;
    prompt += `- If any rule is violated, rewrite before returning the final JSON.\n`;
    if (config.subject) {
      prompt += `The subject is fixed to "${config.subject}". Keep the subject value exactly as "${config.subject}".\n`;
      prompt += `Generate a specific topic label based on quiz content and set it in the "topic" field.\n`;
      prompt += `Topic rules: prefer 1-2 words; use >2 words only when absolutely necessary for clarity; never include numbering/progress markers.\n`;
      prompt += `Example titles: "${config.subject} Fundamentals", "${config.subject} Challenge", "${config.subject} Practice"\n`;
    }
    prompt += `Context relevance rule: uploaded documents may include unrelated content. Use only evidence relevant to the teacher instructions, subject, level, and blueprint focus.\n`;

    if (config.quizType === "true-false") {
      prompt += `\n===== TRUE/FALSE QUALITY RULES =====\n`;
      prompt += `- Every item MUST include a non-empty question/statement text.\n`;
      prompt += `- Every item MUST include explicit boolean correctness for True/False (never omit correctness).\n`;
      prompt += `- Ensure the answer key is not one-sided: include a balanced mix of True and False correct answers.\n`;
      prompt += `- Do NOT make all items have True as correct.\n`;
      prompt += `- Keep statements clear, specific, and fact-checkable.\n`;
    }
    if (config.quizType === "basic") {
      prompt += `\n===== OPEN-ENDED ANSWER TYPE RULES =====\n`;
      prompt += `- Allowed open answerType values are ONLY: "exact", "keywords", and "list".\n`;
      prompt += `- Do NOT use answerType "fuzzy".\n`;
      prompt += `- For answerType "exact", provide one or more accepted answers in "text" (any one accepted text can be correct).\n`;
      prompt += `- For answerType "keywords", include at least one keyword and set minKeywords to 1 or higher (never 0).\n`;
      prompt += `- For answerType "keywords", "keywords" must be an array of plain strings (no objects).\n`;
      prompt += `- For answerType "list", include at least one list item and set minCorrectItems to 1 or higher.\n`;
      prompt += `- For answerType "list", "listItems" must be an array of plain strings (no objects like { "text": "..." }).\n`;
      prompt += `- For answerType "keywords" and "list", do not rely on "text" for grading; put grading data in keywords/listItems fields.\n`;
    }
    prompt += `\n`;

    prompt += this.getFormatInstructions(config.quizType, structureAndRules);

    return prompt;
  }

  /**
   * Get system prompt based on config (education level aware)
   * Uses AI prompting rules from quiz service when available
   */
  private getSystemPrompt(
    config: IGenerationConfig & {
      quizType: AIGeneratedQuizType;
      quizNumber: number;
    },
    structureAndRules: QuizStructureAndRules,
  ): string {
    const expectedQuestionCount = this.getExpectedQuestionCount(
      config.quizType,
      config.questionsPerQuiz,
    );

    if (!structureAndRules || !("schemas" in structureAndRules)) {
      throw new Error(
        `Missing quiz schema rules for system prompt resolution (quizType "${config.quizType}").`,
      );
    }
    const schema = structureAndRules.schemas[config.quizType];
    const baseSystemPrompt = String(schema?.aiPromptingRules?.systemPrompt || "").trim();
    if (!baseSystemPrompt) {
      throw new Error(
        `Missing AI system prompt in quiz-service schema for quizType "${config.quizType}".`,
      );
    }

    // Enhance canonical system prompt with runtime constraints.
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

    const batchContext =
      config.numQuizzes > 1
        ? ` IMPORTANT: You are generating quiz ${config.quizNumber} of ${config.numQuizzes}. Each quiz in this batch must be unique and diverse. Use different question styles, perspectives, and aspects of the content to ensure variety across all quizzes.`
        : "";

    const fixedSubject = config.subject?.trim();
    const subjectConstraint = fixedSubject
      ? ` Subject is fixed to "${fixedSubject}" and must not be changed.`
      : "";
    const topicConstraint =
      ' Generate a concise content-based "topic" label for each quiz and include it in the output. Prefer 1-2 words and keep to at most 4 words unless a longer phrase is essential.';
    const namingConstraint =
      ' Do not include batch numbers/progress markers in "name" or "topic" (e.g. "Quiz 2", "(2/5)", "#3", "4/5").';
    return `${baseSystemPrompt} Target audience: ${targetLevel}.${batchContext} You MUST return exactly ${expectedQuestionCount} questions/entries (array length must match exactly).${subjectConstraint}${topicConstraint}${namingConstraint}`;
  }

  /**
   * Get format instructions based on quiz type
   * Uses AI prompting rules from quiz service (single source of truth)
   */
  private getFormatInstructions(
    quizType: string,
    structureAndRules: QuizStructureAndRules,
  ): string {
    // Use format instructions from quiz service rules.
    if ("schemas" in structureAndRules && structureAndRules.schemas[quizType]) {
      const schema = structureAndRules.schemas[quizType];
      if (schema && "aiPromptingRules" in schema) {
        const formatInstructions = schema.aiPromptingRules.formatInstructions;
        if (String(formatInstructions || "").trim().length > 0) {
          return formatInstructions;
        }
      }
    }

    throw new Error(
      `Missing AI format instructions for quiz type "${quizType}" from quiz-service structure rules.`,
    );
  }

  /**
   * Transform LLM response to quiz format
   */
  private async transformToQuizFormat(
    parsed: any,
    config: IGenerationConfig & {
      quizNumber: number;
      quizType: AIGeneratedQuizType;
    },
  ): Promise<GeneratedQuiz> {
    const tempId = uuidv4();
    const quizType = config.quizType;
    const expectedQuestionCount = this.getExpectedQuestionCount(
      quizType,
      config.questionsPerQuiz,
    );

    // Add IDs to all items/options/answers
    let items = this.addItemIds(parsed.items || parsed.entries || [], quizType);

    // Enforce hard limit of 10 entries for crossword (quiz service constraint)
    if (quizType === "crossword" && items.length > 10) {
      console.warn(
        `Crossword has ${items.length} entries, limiting to 10 (quiz service max)`,
      );
      items = items.slice(0, 10);
    }

    items = this.enforceQuestionCount(items, expectedQuestionCount, config);

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

    // Subject is teacher-selected and fixed.
    const subject = String(config.subject || "").trim();
    if (!subject) {
      throw new Error(
        `Quiz #${config.quizNumber} (${config.quizType}) missing required selected subject.`,
      );
    }

    // Topic must be generated by the model.
    const topic = this.resolveGeneratedTopic(parsed);

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

    this.validateGeneratedMetadata(name, topic, config);
    if (quizType === "true-false") {
      this.validateTrueFalseBalance(items, config);
    }

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

  private resolveGeneratedTopic(parsed: any): string {
    const rawTopic = String(parsed?.topic ?? "").trim();
    if (rawTopic) {
      return rawTopic;
    }
    throw new Error("Generated quiz is missing required topic.");
  }

  private parseBooleanLike(value: unknown): boolean | undefined {
    if (typeof value === "boolean") return value;
    if (typeof value === "number") {
      if (value === 1) return true;
      if (value === 0) return false;
      return undefined;
    }
    if (typeof value === "string") {
      const normalized = value.trim().toLowerCase();
      if (
        normalized === "true" ||
        normalized === "t" ||
        normalized === "yes" ||
        normalized === "y" ||
        normalized === "1"
      ) {
        return true;
      }
      if (
        normalized === "false" ||
        normalized === "f" ||
        normalized === "no" ||
        normalized === "n" ||
        normalized === "0"
      ) {
        return false;
      }
    }
    return undefined;
  }

  private normalizeStringArrayEntry(entry: unknown): string | null {
    if (typeof entry === "string") {
      const normalized = entry.trim();
      return normalized.length > 0 ? normalized : null;
    }
    if (typeof entry === "number" || typeof entry === "boolean") {
      const normalized = String(entry).trim();
      return normalized.length > 0 ? normalized : null;
    }
    if (entry && typeof entry === "object") {
      const raw = entry as Record<string, unknown>;
      const candidateFields = [
        "text",
        "value",
        "label",
        "item",
        "name",
        "answer",
      ];
      for (const field of candidateFields) {
        const candidate = raw[field];
        if (typeof candidate === "string") {
          const normalized = candidate.trim();
          if (normalized.length > 0) return normalized;
        }
        if (typeof candidate === "number" || typeof candidate === "boolean") {
          const normalized = String(candidate).trim();
          if (normalized.length > 0) return normalized;
        }
      }
    }
    return null;
  }

  private normalizeStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value
      .map((entry) => this.normalizeStringArrayEntry(entry))
      .filter((entry): entry is string => Boolean(entry));
  }

  private extractTrueFalseText(raw: any): string {
    const candidates = [
      raw?.text,
      raw?.question,
      raw?.statement,
      raw?.prompt,
      raw?.title,
    ];
    for (const candidate of candidates) {
      const text = String(candidate ?? "").trim();
      if (text.length > 0) return text;
    }
    return "";
  }

  private containsBatchMarker(value: string): boolean {
    const v = String(value || "");
    return (
      /\bquiz\s*#?\s*\d+\b/i.test(v) ||
      /\(\s*\d+\s*\/\s*\d+\s*\)/.test(v) ||
      /#\s*\d+\b/.test(v) ||
      /\b\d+\s*\/\s*\d+\b/.test(v)
    );
  }

  private validateGeneratedMetadata(
    name: string,
    topic: string,
    config: IGenerationConfig & {
      quizNumber: number;
      quizType: AIGeneratedQuizType;
    },
  ): void {
    const trimmedName = String(name || "").trim();
    const trimmedTopic = String(topic || "").trim();

    if (!trimmedName) {
      throw new Error(
        `Quiz #${config.quizNumber} (${config.quizType}) generated empty name.`,
      );
    }

    if (!trimmedTopic) {
      throw new Error(
        `Quiz #${config.quizNumber} (${config.quizType}) generated empty topic.`,
      );
    }

    if (this.containsBatchMarker(trimmedName) || this.containsBatchMarker(trimmedTopic)) {
      throw new Error(
        `Quiz #${config.quizNumber} (${config.quizType}) generated metadata with numbering markers in name/topic.`,
      );
    }

  }

  private validateTrueFalseBalance(
    items: any[],
    config: IGenerationConfig & {
      quizNumber: number;
      quizType: AIGeneratedQuizType;
    },
  ): void {
    const trueCorrectCount = items.reduce((count, item) => {
      const trueOpt = (item?.options || []).find(
        (o: any) =>
          String(o?.text ?? "")
            .trim()
            .toLowerCase() === "true",
      );
      return count + (trueOpt?.correct ? 1 : 0);
    }, 0);

    const falseCorrectCount = items.length - trueCorrectCount;
    if (items.length > 1 && (trueCorrectCount === 0 || falseCorrectCount === 0)) {
      throw new Error(
        `Quiz #${config.quizNumber} (${config.quizType}) generated one-sided answer key.`,
      );
    }
  }

  /**
   * Add unique IDs to all items and their sub-elements
   */
  private addItemIds(items: any[], quizType: string): any[] {
    return items.flatMap((item: any) => {
      const baseItem = {
        ...item,
        id: item.id || uuidv4(),
      };
      const normalizedItemType = String(baseItem.type || "")
        .trim()
        .toLowerCase();

      // True/False questions are always MC with exactly two fixed options.
      if (quizType === "true-false") {
        const inferTrueCorrect = (): boolean | undefined => {
          const directCandidates = [
            baseItem.correctAnswer,
            baseItem.answer,
            baseItem.correct,
            baseItem.isTrue,
            baseItem.isCorrectTrue,
            baseItem.label,
          ];
          for (const candidate of directCandidates) {
            const parsed = this.parseBooleanLike(candidate);
            if (typeof parsed === "boolean") return parsed;
          }

          if (Array.isArray(baseItem.options)) {
            const t = baseItem.options.find(
              (o: any) =>
                String(o?.text ?? "")
                  .trim()
                  .toLowerCase() === "true",
            );
            const f = baseItem.options.find(
              (o: any) =>
                String(o?.text ?? "")
                  .trim()
                  .toLowerCase() === "false",
            );
            const tCorrect = this.parseBooleanLike(t?.correct);
            const fCorrect = this.parseBooleanLike(f?.correct);
            if (
              typeof tCorrect === "boolean" &&
              typeof fCorrect === "boolean" &&
              tCorrect !== fCorrect
            ) {
              return tCorrect;
            }
            if (typeof tCorrect === "boolean") return tCorrect;
            if (typeof fCorrect === "boolean") return !fCorrect;
          }
          return undefined;
        };

        const trueCorrect = inferTrueCorrect();
        if (typeof trueCorrect !== "boolean") {
          throw new Error(
            `True/False item is missing explicit boolean answer correctness.`,
          );
        }
        const text = this.extractTrueFalseText(baseItem);
        if (!text) {
          throw new Error(`True/False item is missing question text.`);
        }
        return {
          id: baseItem.id,
          type: "mc",
          text,
          timeLimit: Number(baseItem.timeLimit) || 10,
          image: baseItem.image ?? null,
          options: [
            { id: `${baseItem.id}:true`, text: "True", correct: trueCorrect },
            {
              id: `${baseItem.id}:false`,
              text: "False",
              correct: !trueCorrect,
            },
          ],
        };
      }

      // Add IDs to options (for MC)
      if (baseItem.options && Array.isArray(baseItem.options)) {
        baseItem.options = baseItem.options.map((opt: any) => ({
          ...opt,
          id: opt.id || uuidv4(),
        }));
      }

      // Add IDs to answers (for open-ended) and ensure answerType is set
      if (baseItem.answers && Array.isArray(baseItem.answers)) {
        let invalidOpenItem = false;
        const normalizedAnswers = baseItem.answers.map((ans: any) => {
          const normalizedText = String(ans.text || "").trim();
          const candidateType = String(ans.answerType || "")
            .trim()
            .toLowerCase();
          const answerType: "exact" | "keywords" | "list" | null =
            candidateType === "exact" ||
            candidateType === "keywords" ||
            candidateType === "list"
              ? (candidateType as "exact" | "keywords" | "list")
              : null;

          if (!answerType) {
            invalidOpenItem = true;
            return null;
          }

          if (answerType === "exact" && normalizedText.length === 0) {
            invalidOpenItem = true;
            return null;
          }

          const answer: any = {
            id: ans.id || uuidv4(),
            answerType,
            caseSensitive: !!ans.caseSensitive,
            // Keep text only for exact answers; keywords/list should grade via their own fields.
            text: answerType === "exact" ? normalizedText : "",
          };

          // Preserve type-specific fields if provided by AI
          if (answerType === "keywords") {
            const keywords = this.normalizeStringArray(ans.keywords);
            if (keywords.length === 0) {
              invalidOpenItem = true;
              return null;
            }

            answer.keywords = keywords;

            const rawMinKeywords = Number(ans.minKeywords);
            const defaultMin = Math.ceil((keywords.length || 0) * 0.6);
            const normalizedMin = Number.isFinite(rawMinKeywords)
              ? Math.floor(rawMinKeywords)
              : defaultMin;
            answer.minKeywords = Math.max(
              1,
              keywords.length > 0
                ? Math.min(normalizedMin, keywords.length)
                : normalizedMin,
              );
          } else if (answerType === "list") {
            const listItems = this.normalizeStringArray(ans.listItems);
            if (listItems.length === 0) {
              invalidOpenItem = true;
              return null;
            }

            answer.listItems = listItems;
            answer.requireOrder = ans.requireOrder ?? false;
            const rawMinCorrectItems = Number(ans.minCorrectItems);
            const defaultMinCorrectItems = listItems.length || 1;
            const normalizedMinCorrectItems = Number.isFinite(rawMinCorrectItems)
              ? Math.floor(rawMinCorrectItems)
              : defaultMinCorrectItems;
            answer.minCorrectItems = Math.max(
              1,
              listItems.length > 0
                ? Math.min(normalizedMinCorrectItems, listItems.length)
                : normalizedMinCorrectItems,
            );
          }

          return answer;
        });

        const compactAnswers = normalizedAnswers.filter(Boolean);
        if (
          normalizedItemType === "open" &&
          (invalidOpenItem || compactAnswers.length === 0)
        ) {
          return [];
        }
        baseItem.answers = compactAnswers;
      }

      // For crossword entries
      if (quizType === "crossword" && !baseItem.type) {
        return [
          {
            id: baseItem.id,
            answer: (baseItem.answer || "").toUpperCase().replace(/\s+/g, ""),
            clue: baseItem.clue || "",
            positions: [],
            direction: null,
          },
        ];
      }

      return [baseItem];
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
   * Compute the effective expected question count for this quiz.
   * Crossword is capped to 10 due quiz-service constraints.
   */
  private getExpectedQuestionCount(
    quizType: AIGeneratedQuizType,
    requested: number,
  ): number {
    const normalized = Math.max(1, Number(requested) || 10);
    if (quizType === "crossword") {
      return Math.min(normalized, 10);
    }
    return normalized;
  }

  /**
   * Question-count enforcement:
   * - If model returns too many, truncate to expected count.
   * - If model returns too few, keep as-is (prompt-level constraints are primary),
   *   but reject empty outputs so they still enter retry flow.
   */
  private enforceQuestionCount(
    items: any[],
    expectedCount: number,
    config: IGenerationConfig & {
      quizNumber: number;
      quizType: AIGeneratedQuizType;
    },
  ): any[] {
    if (items.length > expectedCount) {
      console.warn(
        `Quiz #${config.quizNumber} (${config.quizType}) produced ${items.length} items, truncating to ${expectedCount}.`,
      );
      return items.slice(0, expectedCount);
    }

    if (items.length === 0) {
      throw new Error(
        `Quiz #${config.quizNumber} (${config.quizType}) produced 0 items.`,
      );
    }

    if (items.length < expectedCount) {
      console.warn(
        `Quiz #${config.quizNumber} (${config.quizType}) produced ${items.length} items (requested ${expectedCount}); keeping underfilled output.`,
      );
    }

    return items;
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

  private isAIGeneratedQuizType(type: string): type is AIGeneratedQuizType {
    return (
      type === "basic" ||
      type === "rapid" ||
      type === "crossword" ||
      type === "true-false"
    );
  }

  private resolveRequestedQuizTypes(
    config: IGenerationConfig,
    structureAndRules: QuizStructureAndRules,
  ): AIGeneratedQuizType[] {
    const allowed = new Set(
      (structureAndRules.quizTypes || []).filter((t) =>
        this.isAIGeneratedQuizType(t),
      ) as AIGeneratedQuizType[],
    );

    const requestedRaw = Array.isArray(config.quizTypes) ? config.quizTypes : [];
    const requested = requestedRaw.filter((t) => this.isAIGeneratedQuizType(t));
    const dedupRequested = Array.from(new Set(requested));
    const requestedAllowed = dedupRequested.filter((t) => allowed.has(t));

    if (requestedAllowed.length > 0) {
      return requestedAllowed;
    }

    const fallbackOrder: AIGeneratedQuizType[] = [
      "basic",
      "rapid",
      "crossword",
      "true-false",
    ];
    const allowedByFallback = fallbackOrder.filter(
      (t) => allowed.size === 0 || allowed.has(t),
    );
    return allowedByFallback.length > 0 ? allowedByFallback : ["basic"];
  }

  /**
   * Build a deterministic, even quiz-type plan over N quizzes.
   * Example: types=[basic,rapid,crossword], N=5 => [basic,rapid,crossword,basic,rapid]
   */
  private buildQuizTypePlan(
    numQuizzes: number,
    selectedTypes: AIGeneratedQuizType[],
  ): AIGeneratedQuizType[] {
    const types: AIGeneratedQuizType[] =
      selectedTypes.length > 0 ? selectedTypes : ["basic"];
    return Array.from(
      { length: Math.max(1, numQuizzes) },
      (_, index) => types[index % types.length] || "basic",
    );
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
