/**
 * Quiz Structure & Rules Controller
 * Provides schema and AI generation rules for quiz generation
 */

import { Request, Response } from "express";
import { generateQuizStructureAndRules } from "../utils/structure-generator";

/**
 * @route   GET /quiz/structure-and-rules
 * @auth    none (public endpoint for service-to-service communication)
 * @input   none
 * @logic   Returns comprehensive schema, validation, and AI prompting information:
 *          1) Quiz type definitions (basic, rapid, crossword)
 *          2) Schema definitions for each type including:
 *             - Required and optional fields
 *             - Type information and constraints
 *             - Nested schemas for items/entries
 *          3) Validation rules (limits, constraints)
 *          4) AI prompting rules for each quiz type:
 *             - System prompts
 *             - Format instructions
 *             - Examples
 *          Structure is dynamically generated from actual quiz type files.
 * @returns 200 {
 *           ok: true,
 *           structureAndRules: {
 *             quizTypes: string[],
 *             schemas: Record<QuizType, {
 *               description: string,
 *               schema: object,
 *               validation: object,
 *               aiPromptingRules: {
 *                 systemPrompt: string,
 *                 formatInstructions: string,
 *                 examples: any[]
 *               }
 *             }>,
 *             validation: object,
 *             usage: object
 *           }
 *         }
 * @errors  500 server error
 * @note    This endpoint is the single source of truth for quiz structure
 *          and AI generation rules. It's actively used by the AI service
 *          during quiz generation. Schema and rules come directly from
 *          quiz type definition files (quiz-basic.ts, quiz-rapid.ts, etc.),
 *          making maintenance centralized and reducing duplication.
 */
export async function getQuizStructureAndRules(req: Request, res: Response) {
  try {
    const structureAndRules = generateQuizStructureAndRules();

    res.json({
      ok: true,
      structureAndRules,
    });
  } catch (error) {
    console.error("Get quiz structure and rules error:", error);
    res.status(500).json({
      ok: false,
      message: "Failed to get quiz structure and rules",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
