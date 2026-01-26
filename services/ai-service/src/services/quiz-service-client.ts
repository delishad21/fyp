import axios from "axios";

const QUIZ_SERVICE_URL =
  process.env.QUIZ_SERVICE_URL || "http://localhost:7302";

export interface QuizStructureAndRules {
  quizTypes: string[];
  schemas: {
    basic?: {
      description: string;
      schema: any;
      validation: any;
      aiPromptingRules: {
        systemPrompt: string;
        formatInstructions: string;
        examples: any[];
      };
    };
    rapid?: {
      description: string;
      schema: any;
      validation: any;
      aiPromptingRules: {
        systemPrompt: string;
        formatInstructions: string;
        examples: any[];
      };
    };
    crossword?: {
      description: string;
      schema: any;
      validation: any;
      aiPromptingRules: {
        systemPrompt: string;
        formatInstructions: string;
        examples: any[];
      };
    };
  };
  validation: {
    general: {
      maxQuestions: number;
      maxOptions: number;
      requiredFields: string[];
    };
    timing: {
      basic: string;
      rapid: string;
      crossword: string;
    };
  };
  usage?: {
    overview: string;
    workflow: string[];
    tips: string[];
  };
}

export class QuizServiceClient {
  /**
   * Get quiz structure and AI generation rules from quiz-service
   * Returns the combined schema and prompting information from actual quiz type definitions
   */
  async getQuizStructureAndRules(
    authHeader: string,
  ): Promise<QuizStructureAndRules> {
    try {
      const response = await axios.get(
        `${QUIZ_SERVICE_URL}/quiz/structure-and-rules`,
        {
          headers: {
            Authorization: authHeader,
          },
          timeout: 10000,
        },
      );

      return response.data.structureAndRules;
    } catch (error) {
      console.error("Failed to fetch quiz structure and rules:", error);
      return this.getDefaultStructureAndRules();
    }
  }

  /**
   * Get default structure and rules as ultimate fallback
   */
  private getDefaultStructureAndRules(): QuizStructureAndRules {
    return {
      quizTypes: ["basic", "rapid", "crossword"],
      schemas: {
        basic: {
          description: "Basic quiz with mixed question types",
          schema: {},
          validation: { maxItems: 20, minItems: 1 },
          aiPromptingRules: {
            systemPrompt:
              "Create educational assessment questions for students.",
            formatInstructions: "Return valid JSON.",
            examples: [],
          },
        },
        rapid: {
          description: "Fast-paced multiple choice quiz",
          schema: {},
          validation: { maxItems: 20, minItems: 1 },
          aiPromptingRules: {
            systemPrompt: "Create fast-paced multiple choice questions.",
            formatInstructions: "Return valid JSON.",
            examples: [],
          },
        },
        crossword: {
          description: "Crossword puzzle quiz",
          schema: {},
          validation: { maxEntries: 10, minEntries: 5 },
          aiPromptingRules: {
            systemPrompt: "Create crossword puzzle entries.",
            formatInstructions: "Return valid JSON.",
            examples: [],
          },
        },
      },
      validation: {
        general: {
          maxQuestions: 20,
          maxOptions: 6,
          requiredFields: ["name", "subject", "topic", "quizType"],
        },
        timing: {
          basic: "Single totalTimeLimit or null",
          rapid: "Per-question timeLimit (5-60 seconds)",
          crossword: "Single totalTimeLimit or null",
        },
      },
    };
  }

  /**
   * Get existing quiz names for the authenticated user
   */
  async getExistingQuizNames(authHeader: string): Promise<string[]> {
    try {
      const response = await axios.get(`${QUIZ_SERVICE_URL}/quiz`, {
        headers: {
          Authorization: authHeader,
        },
        params: {
          page: 1,
          pageSize: 1000, // Get all quizzes to check names
        },
        timeout: 10000,
      });

      const rows = response.data?.rows || [];
      return rows.map((row: any) => row.name || "").filter(Boolean);
    } catch (error) {
      console.error("Failed to fetch existing quiz names:", error);
      return [];
    }
  }

  /**
   * Create quizzes in bulk (service-to-service)
   */
  async createQuizzesBatch(
    quizzes: any[],
    userId: string,
  ): Promise<{ success: boolean; quizIds: string[]; errors: any[] }> {
    try {
      const secret =
        process.env.QUIZ_WEBHOOK_SECRET || process.env.CLASS_SHARED_SECRET;
      if (!secret) {
        throw new Error(
          "QUIZ_WEBHOOK_SECRET or CLASS_SHARED_SECRET not configured",
        );
      }

      const response = await axios.post(
        `${QUIZ_SERVICE_URL}/quiz/internal/batch-create`,
        { quizzes, userId },
        {
          headers: {
            "Content-Type": "application/json",
            "x-quiz-secret": secret,
          },
          timeout: 60000, // Longer timeout for batch operations
        },
      );

      return response.data;
    } catch (error: any) {
      console.error("Failed to create quizzes in batch:", error);
      throw new Error(
        error.response?.data?.message || "Failed to create quizzes",
      );
    }
  }
}
