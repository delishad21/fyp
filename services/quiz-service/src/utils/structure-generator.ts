/**
 * Quiz Structure & Rules Generator
 * Dynamically generates schema information and AI prompting rules
 * from actual quiz type definitions
 *
 * This is the single source of truth for quiz structure and AI generation rules.
 * When you update quiz types or add new ones, update the respective quiz-*.ts files
 * and this generator will automatically include the changes.
 */

import { QUIZ_TYPES } from "../model/quiz-shared";
import { BASIC_QUIZ_AI_METADATA } from "../model/quiz-types/quiz-basic";
import { CROSSWORD_BANK_QUIZ_AI_METADATA } from "../model/quiz-types/quiz-crossword-bank";
import { RAPID_QUIZ_AI_METADATA } from "../model/quiz-types/quiz-rapid";
import { RAPID_ARITHMETIC_QUIZ_AI_METADATA } from "../model/quiz-types/quiz-rapid-arithmetic";
import { CROSSWORD_QUIZ_AI_METADATA } from "../model/quiz-types/quiz-crossword";
import { TRUE_FALSE_QUIZ_AI_METADATA } from "../model/quiz-types/quiz-true-false";

/**
 * Generate quiz structure and AI generation rules from actual type definitions
 * This replaces the old hardcoded structure with dynamic imports
 */
export function generateQuizStructureAndRules() {
  return {
    quizTypes: [...QUIZ_TYPES],

    // Schema definitions from quiz type files
    schemas: {
      basic: BASIC_QUIZ_AI_METADATA,
      rapid: RAPID_QUIZ_AI_METADATA,
      crossword: CROSSWORD_QUIZ_AI_METADATA,
      "rapid-arithmetic": RAPID_ARITHMETIC_QUIZ_AI_METADATA,
      "crossword-bank": CROSSWORD_BANK_QUIZ_AI_METADATA,
      "true-false": TRUE_FALSE_QUIZ_AI_METADATA,
    },

    // General validation rules (apply to all types)
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
        "rapid-arithmetic": "Per-question timeLimit from quiz config",
        "crossword-bank": "Single totalTimeLimit or null",
        "true-false": "Per-question timeLimit (5-60 seconds)",
      },
    },

    // Usage instructions for AI service
    usage: {
      overview:
        "This structure defines all quiz types, their schemas, validation rules, and AI prompting guidelines",
      workflow: [
        "1. Select quiz type based on content and user requirements",
        "2. Use the schema definition to understand required fields and structure",
        "3. Apply the aiPromptingRules for that quiz type to generate appropriate content",
        "4. Follow validation rules to ensure data integrity",
        "5. Return JSON matching the schema structure exactly",
      ],
      tips: [
        "Always use the formatInstructions from aiPromptingRules in your prompts",
        "Reference the examples to show expected output format",
        "Apply education level considerations (age-appropriate vocabulary and complexity)",
        "For crossword quizzes, never try to generate grid layout - it's done server-side",
      ],
    },
  };
}
