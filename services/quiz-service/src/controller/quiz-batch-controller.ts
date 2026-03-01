/**
 * Batch Quiz Creation Controller
 * Handles bulk quiz creation from AI service
 */

import { Request, Response } from "express";
import { QuizBaseModel } from "../model/quiz-base-model";
import { Types } from "mongoose";
import { sharedSecret } from "../utils/class-svc-client";
import { resolveSubjectColorHex } from "../utils/quiz-meta-utils";
import { isQuizType } from "../model/quiz-shared";
import { UserQuizMetaModel } from "../model/quiz-meta-model";
import { buildDefaultMetaSeed, norm } from "../utils/quiz-meta-utils";

async function upsertOwnerTopics(ownerId: string, topics: string[]) {
  const cleaned = topics.map((t) => String(t || "").trim()).filter(Boolean);
  if (cleaned.length === 0) return;

  const doc = await UserQuizMetaModel.findOne({ owner: ownerId });
  if (!doc) {
    const seed = buildDefaultMetaSeed();
    const existing = new Set(seed.topics.map((t) => norm(t.label)));
    const mergedTopics = [...seed.topics];
    for (const topic of cleaned) {
      if (!existing.has(norm(topic))) {
        mergedTopics.push({ label: topic });
        existing.add(norm(topic));
      }
    }

    await UserQuizMetaModel.create({
      owner: ownerId,
      subjects: seed.subjects,
      topics: mergedTopics,
    });
    return;
  }

  const existing = new Set((doc.topics || []).map((t) => norm(t.label)));
  let changed = false;

  for (const topic of cleaned) {
    if (!existing.has(norm(topic))) {
      doc.topics.push({ label: topic });
      existing.add(norm(topic));
      changed = true;
    }
  }

  if (changed) {
    await doc.save();
  }
}

/**
 * @route   POST /quiz/batch
 * @auth    verifyAccessToken
 * @input   Body: {
 *           quizzes: Array<{
 *             quizType: "basic" | "rapid" | "crossword",
 *             name?: string,
 *             subject?: string,
 *             topic?: string,
 *             totalTimeLimit?: number | null,
 *             items?: Array<QuizItem>,
 *             entries?: Array<CrosswordEntry>,
 *             grid?: CrosswordGrid
 *           }>
 *         }
 * @logic   1) Validate quizzes array (required, non-empty, max 20 items).
 *          2) Process each quiz sequentially:
 *             - Validate quiz type (basic/rapid/crossword).
 *             - Create QuizBase document with provided data.
 *             - Set rootQuizId to self for initial version.
 *             - Track successful quiz IDs and errors.
 *          3) Return results with success count and any errors encountered.
 * @returns 200 {
 *           ok: true,
 *           success: boolean,
 *           message: string,
 *           quizIds: string[],
 *           errors?: Array<{ index: number, error: string }>,
 *           results: Array<{ quizId?: string, error?: string, index: number }>
 *         }
 * @errors  400 missing/invalid quizzes array or exceeds 20 item limit
 *          401 unauthenticated
 *          500 server error
 */
export async function createQuizzesBatch(req: Request, res: Response) {
  try {
    const { quizzes } = req.body;
    const userId = (req as any).user?.sub;

    if (!userId) {
      return res.status(401).json({
        ok: false,
        message: "Unauthorized",
      });
    }

    if (!Array.isArray(quizzes) || quizzes.length === 0) {
      return res.status(400).json({
        ok: false,
        message: "Invalid request: quizzes array is required",
      });
    }

    if (quizzes.length > 20) {
      return res.status(400).json({
        ok: false,
        message: "Maximum 20 quizzes per batch",
      });
    }

    const results: { quizId?: string; error?: string; index: number }[] = [];
    const savedQuizIds: string[] = [];
    const errors: any[] = [];
    const savedTopics: string[] = [];

    // Process each quiz
    for (let i = 0; i < quizzes.length; i++) {
      try {
        const quizData = quizzes[i];

        // Validate quiz type
        if (!isQuizType(quizData.quizType)) {
          throw new Error(`Invalid quiz type: ${quizData.quizType}`);
        }

        // Create quiz document
        const quizDoc = await QuizBaseModel.create({
          owner: new Types.ObjectId(userId),
          quizType: quizData.quizType,
          rootQuizId: new Types.ObjectId(), // Generate new root ID
          version: 1, // Initial version
          status: "active",
          name: quizData.name || `Quiz ${i + 1}`,
          subject: quizData.subject || "General",
          subjectColorHex: "#6366f1", // Default color
          topic: quizData.topic || "General",
          totalTimeLimit: quizData.totalTimeLimit ?? null,
          items: quizData.items || [],
          entries: quizData.entries || [],
          grid: quizData.grid || undefined,
          wordsPerQuiz: quizData.wordsPerQuiz,
          entriesBank: quizData.entriesBank || [],
          questionCount: quizData.questionCount,
          operators: quizData.operators || [],
          timePerQuestion: quizData.timePerQuestion,
          choicesPerQuestion: quizData.choicesPerQuestion,
          operationSettings: quizData.operationSettings,
        });

        // Set rootQuizId to self for first version
        quizDoc.rootQuizId = quizDoc._id;
        await quizDoc.save();

        savedQuizIds.push(quizDoc._id.toString());
        if (quizDoc.topic) savedTopics.push(String(quizDoc.topic));
        results.push({
          quizId: quizDoc._id.toString(),
          index: i,
        });
      } catch (error) {
        console.error(`Error creating quiz ${i}:`, error);
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";

        errors.push({
          index: i,
          error: errorMessage,
        });

        results.push({
          error: errorMessage,
          index: i,
        });
      }
    }

    if (savedTopics.length > 0) {
      await upsertOwnerTopics(userId, savedTopics);
    }

    // Return results
    res.json({
      ok: true,
      success: savedQuizIds.length > 0,
      message: `${savedQuizIds.length} of ${quizzes.length} quizzes created successfully`,
      quizIds: savedQuizIds,
      errors: errors.length > 0 ? errors : undefined,
      results,
    });
  } catch (error) {
    console.error("Batch quiz creation error:", error);
    res.status(500).json({
      ok: false,
      message: "Failed to create quizzes in batch",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

/**
 * @route   POST /quiz/batch/internal
 * @auth    x-quiz-secret header (service-to-service authentication)
 * @input   Body: {
 *           userId: string (required),
 *           quizzes: Array<{
 *             quizType: "basic" | "rapid" | "crossword",
 *             name?: string,
 *             subject?: string,
 *             topic?: string,
 *             totalTimeLimit?: number | null,
 *             items?: Array<QuizItem>,
 *             entries?: Array<CrosswordEntry>,
 *             grid?: CrosswordGrid
 *           }>
 *         }
 * @logic   1) Validate shared secret from x-quiz-secret header.
 *          2) Validate userId and quizzes array (required, non-empty, max 20).
 *          3) Process each quiz sequentially:
 *             - Validate quiz type (basic/rapid/crossword).
 *             - Resolve subject color from user's existing subjects via resolveSubjectColorHex.
 *             - Create QuizBase document with provided data.
 *             - Set rootQuizId to self for initial version.
 *             - Track successful quiz IDs and errors.
 *          4) Return results with success count and any errors encountered.
 * @returns 200 {
 *           ok: true,
 *           success: boolean,
 *           message: string,
 *           quizIds: string[],
 *           errors?: Array<{ index: number, error: string }>,
 *           results: Array<{ quizId?: string, error?: string, index: number }>
 *         }
 * @errors  400 missing userId or invalid quizzes array or exceeds 20 item limit
 *          401 invalid or missing shared secret
 *          500 server error
 * @note    This endpoint is for internal service-to-service communication only.
 *          Used by AI service to create quizzes on behalf of users.
 */
export async function createQuizzesBatchInternal(req: Request, res: Response) {
  try {
    // Validate shared secret
    const secret = sharedSecret();
    if (!secret || req.header("x-quiz-secret") !== secret) {
      return res.status(401).json({ ok: false, message: "Unauthorized" });
    }

    const { quizzes, userId } = req.body;

    if (!userId) {
      return res.status(400).json({
        ok: false,
        message: "userId is required",
      });
    }

    if (!Array.isArray(quizzes) || quizzes.length === 0) {
      return res.status(400).json({
        ok: false,
        message: "Invalid request: quizzes array is required",
      });
    }

    if (quizzes.length > 20) {
      return res.status(400).json({
        ok: false,
        message: "Maximum 20 quizzes per batch",
      });
    }

    const results: { quizId?: string; error?: string; index: number }[] = [];
    const savedQuizIds: string[] = [];
    const errors: any[] = [];
    const savedTopics: string[] = [];

    // Process each quiz
    for (let i = 0; i < quizzes.length; i++) {
      try {
        const quizData = quizzes[i];

        // Validate quiz type
        if (!isQuizType(quizData.quizType)) {
          throw new Error(`Invalid quiz type: ${quizData.quizType}`);
        }

        // Resolve subject color from user's existing subjects
        const subject = quizData.subject || "General";
        const subjectColorHex = await resolveSubjectColorHex(userId, subject);

        // Create quiz document
        const quizDoc = await QuizBaseModel.create({
          owner: new Types.ObjectId(userId),
          quizType: quizData.quizType,
          rootQuizId: new Types.ObjectId(), // Generate new root ID
          version: 1, // Initial version
          status: "active",
          name: quizData.name || `Quiz ${i + 1}`,
          subject,
          subjectColorHex,
          topic: quizData.topic || "General",
          totalTimeLimit: quizData.totalTimeLimit ?? null,
          items: quizData.items || [],
          entries: quizData.entries || [],
          grid: quizData.grid || undefined,
          wordsPerQuiz: quizData.wordsPerQuiz,
          entriesBank: quizData.entriesBank || [],
          questionCount: quizData.questionCount,
          operators: quizData.operators || [],
          timePerQuestion: quizData.timePerQuestion,
          choicesPerQuestion: quizData.choicesPerQuestion,
          operationSettings: quizData.operationSettings,
        });

        // Set rootQuizId to self for first version
        quizDoc.rootQuizId = quizDoc._id;
        await quizDoc.save();

        savedQuizIds.push(quizDoc._id.toString());
        if (quizDoc.topic) savedTopics.push(String(quizDoc.topic));
        results.push({
          quizId: quizDoc._id.toString(),
          index: i,
        });
      } catch (error) {
        console.error(`Error creating quiz ${i}:`, error);
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";

        errors.push({
          index: i,
          error: errorMessage,
        });

        results.push({
          error: errorMessage,
          index: i,
        });
      }
    }

    if (savedTopics.length > 0) {
      await upsertOwnerTopics(userId, savedTopics);
    }

    // Return results
    res.json({
      ok: true,
      success: savedQuizIds.length > 0,
      message: `${savedQuizIds.length} of ${quizzes.length} quizzes created successfully`,
      quizIds: savedQuizIds,
      errors: errors.length > 0 ? errors : undefined,
      results,
    });
  } catch (error) {
    console.error("Internal batch quiz creation error:", error);
    res.status(500).json({
      ok: false,
      message: "Failed to create quizzes in batch",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
