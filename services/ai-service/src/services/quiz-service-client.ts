import axios from "axios";

const QUIZ_SERVICE_URL =
  process.env.QUIZ_SERVICE_URL || "http://localhost:7302";

export interface QuizStructureAndRules {
  quizTypes: string[];
  schemas: Record<
    string,
    {
      description: string;
      schema: any;
      validation: any;
      aiPromptingRules: {
        systemPrompt: string;
        formatInstructions: string;
        examples: any[];
      };
    }
  >;
  validation: {
    general: {
      maxQuestions: number;
      maxOptions: number;
      requiredFields: string[];
    };
    timing: Record<string, string>;
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
      const message =
        error instanceof Error
          ? error.message
          : "Unknown error while fetching quiz structure and rules";
      throw new Error(
        `Failed to fetch quiz structure and rules from quiz-service: ${message}`,
      );
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
