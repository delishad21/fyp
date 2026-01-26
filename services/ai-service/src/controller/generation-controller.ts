import { Response } from "express";
import { Types } from "mongoose";
import {
  GenerationJobModel,
  IGenerationConfig,
} from "../models/generation-job-model";
import { DocumentParserService } from "../services/document-parser";
import { QuizGeneratorService } from "../services/quiz-generator";
import { QuizServiceClient } from "../services/quiz-service-client";
import { CustomRequest } from "../middleware/auth";
import fs from "fs/promises";

// Service instances (singleton-like)
const documentParser = new DocumentParserService();
const quizGenerator = new QuizGeneratorService();
const quizServiceClient = new QuizServiceClient();

/**
 * Make quiz names unique by appending numbers if duplicates exist
 */
function makeNamesUnique(
  quizNames: string[],
  existingNames: string[],
): string[] {
  const allNames = new Set(existingNames);
  const uniqueNames: string[] = [];

  for (let quizName of quizNames) {
    let finalName = quizName;
    let counter = 2;

    // Check if name exists (in existing DB or in current batch)
    while (allNames.has(finalName)) {
      finalName = `${quizName} ${counter}`;
      counter++;
    }

    allNames.add(finalName);
    uniqueNames.push(finalName);
  }

  return uniqueNames;
}

/** ---------- Public API Endpoints ---------- */

/**
 * @route  POST /generate
 * @auth   verifyAccessToken + verifyIsTeacher
 *
 * @input
 *   File: multipart/form-data 'document' (PDF, DOCX, or TXT) - OPTIONAL
 *   Body: {
 *     instructions: string (REQUIRED),
 *     numQuizzes: number (10-20),
 *     educationLevel: 'primary-1' | 'primary-2' | ... | 'primary-6',
 *     questionsPerQuiz: number (5-20),
 *     subject?: string,
 *     topic?: string,
 *     timerSettings?: JSON object
 *   }
 *
 * @notes
 *   - Instructions are required - main generation prompt
 *   - File upload is optional - can be used as reference material
 *   - AI decides quiz types (basic/rapid/crossword mix or extracts details from instructions)
 *   - Education level determines age-appropriate content for Singapore Primary Schools
 *   - Creates a generation job in 'pending' status
 *   - Processing happens asynchronously in background
 *   - Job ID is returned immediately for status polling
 *
 * @returns 200 {
 *   ok: true,
 *   jobId: string,
 *   message: "Generation job started"
 * }
 *
 * @errors
 *   400 invalid configuration (no instructions, numQuizzes out of range)
 *   401 unauthenticated (no teacherId in token)
 *   500 internal server error
 */
export async function startGeneration(req: CustomRequest, res: Response) {
  try {
    const teacherId = req.teacherId;
    if (!teacherId) {
      return res.status(401).json({ ok: false, message: "Unauthorized" });
    }

    // Instructions are now required
    const instructions = req.body.instructions?.trim();
    if (!instructions) {
      return res.status(400).json({
        ok: false,
        message: "Instructions are required for quiz generation",
      });
    }

    // Files are now optional (up to 5)
    const files = req.files as Express.Multer.File[] | undefined;

    // Parse configuration from request body
    const config: IGenerationConfig = {
      instructions,
      numQuizzes: parseInt(req.body.numQuizzes) || 10,
      educationLevel: req.body.educationLevel || "primary-1",
      questionsPerQuiz: parseInt(req.body.questionsPerQuiz) || 10,
      subject: req.body.subject,
      topic: req.body.topic,
      timerSettings: req.body.timerSettings
        ? JSON.parse(req.body.timerSettings)
        : undefined,
    };

    // Validate configuration
    if (config.numQuizzes < 1 || config.numQuizzes > 20) {
      return res.status(400).json({
        ok: false,
        message: "Number of quizzes must be between 1 and 20",
      });
    }

    const validLevels = [
      "primary-1",
      "primary-2",
      "primary-3",
      "primary-4",
      "primary-5",
      "primary-6",
    ];
    if (!validLevels.includes(config.educationLevel)) {
      return res.status(400).json({
        ok: false,
        message: "Invalid education level. Must be primary-1 through primary-6",
      });
    }

    // Create generation job
    const jobData: any = {
      teacherId: new Types.ObjectId(teacherId),
      status: "pending",
      config,
      progress: {
        current: 0,
        total: config.numQuizzes,
      },
    };

    // Add document metadata if files are provided
    if (files && files.length > 0) {
      jobData.documentMeta = files.map((file) => ({
        filename: file.filename,
        originalName: file.originalname,
        size: file.size,
        mimetype: file.mimetype,
        storagePath: file.path,
        uploadedAt: new Date(),
      }));
    }

    const job = new GenerationJobModel(jobData);
    await job.save();

    // Start processing in background (non-blocking)
    processGenerationJob(job._id.toString()).catch((err) => {
      console.error("Background job processing error:", err);
    });

    res.json({
      ok: true,
      jobId: job._id.toString(),
      message: "Generation job started",
    });
  } catch (error) {
    console.error("Start generation error:", error);
    res.status(500).json({
      ok: false,
      message: "Failed to start generation",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

/**
 * @route  GET /api/generate/:jobId
 * @auth   authMiddleware (authenticated teacher, must own the job)
 *
 * @input
 *   Params: { jobId: string }
 *
 * @notes
 *   - Returns job status: pending, processing, completed, or failed
 *   - Includes progress (current/total quizzes)
 *   - Returns generated quizzes when status is 'completed'
 *   - Each quiz has status: draft, approved, or rejected
 *   - Verifies job ownership (teacherId must match)
 *   - Does not return full extracted text (filtered out)
 *   - JobID is returned to frontend after generation is started.
 *   - Frontend polls this endpoint to get status and results.
 *
 * @returns 200 {
 *   ok: true,
 *   job: {
 *     id: string,
 *     status: 'pending' | 'processing' | 'completed' | 'failed',
 *     progress: { current: number, total: number },
 *     config: IGenerationConfig,
 *     results?: {
 *       total: number,
 *       successful: number,
 *       failed: number,
 *       quizzes: IDraftQuiz[]
 *     },
 *     error?: string,
 *     createdAt: Date,
 *     startedAt?: Date,
 *     completedAt?: Date
 *   }
 * }
 *
 * @errors
 *   400 invalid job ID (not a valid ObjectId)
 *   404 job not found (or not owned by teacher)
 *   500 internal server error
 */
export async function getGenerationStatus(req: CustomRequest, res: Response) {
  try {
    const { jobId } = req.params;
    const teacherId = req.teacherId;

    if (!jobId || !Types.ObjectId.isValid(jobId)) {
      return res.status(400).json({ ok: false, message: "Invalid job ID" });
    }

    const job = await GenerationJobModel.findOne({
      _id: new Types.ObjectId(jobId),
      teacherId: new Types.ObjectId(teacherId),
    });

    if (!job) {
      return res.status(404).json({ ok: false, message: "Job not found" });
    }

    res.json({
      ok: true,
      job: {
        id: job._id,
        status: job.status,
        progress: job.progress,
        config: job.config,
        results: job.results,
        error: job.error,
        createdAt: job.createdAt,
        startedAt: job.startedAt,
        completedAt: job.completedAt,
      },
    });
  } catch (error) {
    console.error("Get generation status error:", error);
    res.status(500).json({
      ok: false,
      message: "Failed to get generation status",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

/**
 * @route  GET /api/generate
 * @auth   authMiddleware (any authenticated teacher)
 *
 * @input
 *   Query: {
 *     limit?: number (default: 10),
 *     skip?: number (default: 0)
 *   }
 *
 * @notes
 *   - Returns all generation jobs for the authenticated teacher
 *   - Jobs are sorted by creation date (newest first)
 *   - Supports pagination via limit/skip parameters
 *   - Does not include full extracted text (filtered out for performance)
 *   - Returns pagination metadata including total count and hasMore flag
 *
 * @returns 200 {
 *   ok: true,
 *   jobs: IGenerationJob[],
 *   pagination: {
 *     total: number,
 *     limit: number,
 *     skip: number,
 *     hasMore: boolean
 *   }
 * }
 *
 * @errors
 *   500 internal server error
 */
export async function getGenerationJobs(req: CustomRequest, res: Response) {
  try {
    const teacherId = req.teacherId;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = parseInt(req.query.skip as string) || 0;

    const jobs = await GenerationJobModel.find({
      teacherId: new Types.ObjectId(teacherId),
    })
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(skip)
      .select("-extractedText"); // Don't return full text

    const total = await GenerationJobModel.countDocuments({
      teacherId: new Types.ObjectId(teacherId),
    });

    res.json({
      ok: true,
      jobs,
      pagination: {
        total,
        limit,
        skip,
        hasMore: skip + jobs.length < total,
      },
    });
  } catch (error) {
    console.error("Get generation jobs error:", error);
    res.status(500).json({
      ok: false,
      message: "Failed to get generation jobs",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

/**
 * @route  PATCH /api/generate/:jobId/quizzes/:tempId
 * @auth   authMiddleware (authenticated teacher, must own the job)
 *
 * @input
 *   Params: { jobId: string, tempId: string }
 *   Body: {
 *     name?: string,
 *     subject?: string,
 *     topic?: string,
 *     items?: any[],
 *     totalTimeLimit?: number | null,
 *     ... (any IDraftQuiz fields)
 *   }
 *
 * @notes
 *   - Updates a draft quiz within a generation job
 *   - Only quizzes with status 'draft' should be edited
 *   - tempId is the temporary UUID assigned during generation
 *   - Updates timestamp (updatedAt) on modification
 *   - Allows teacher to refine AI-generated content before approval
 *   - Verifies job ownership before allowing updates
 *
 * @returns 200 {
 *   ok: true,
 *   quiz: IDraftQuiz
 * }
 *
 * @errors
 *   400 invalid job ID (not a valid ObjectId)
 *   404 job not found, quiz not found
 *   500 internal server error
 */
export async function updateDraftQuiz(req: CustomRequest, res: Response) {
  try {
    const { jobId, tempId } = req.params;
    const teacherId = req.teacherId;
    const updates = req.body;

    if (!jobId || !Types.ObjectId.isValid(jobId)) {
      return res.status(400).json({ ok: false, message: "Invalid job ID" });
    }

    const job = await GenerationJobModel.findOne({
      _id: new Types.ObjectId(jobId),
      teacherId: new Types.ObjectId(teacherId),
    });

    if (!job || !job.results) {
      return res.status(404).json({ ok: false, message: "Job not found" });
    }

    // Find and update the specific quiz
    const quizIndex = job.results.quizzes.findIndex((q) => q.tempId === tempId);
    if (quizIndex === -1) {
      return res.status(404).json({ ok: false, message: "Quiz not found" });
    }

    const targetQuiz = job.results.quizzes[quizIndex];
    if (!targetQuiz) {
      return res.status(404).json({ ok: false, message: "Quiz not found" });
    }

    // Update quiz fields
    Object.assign(targetQuiz, {
      ...updates,
      updatedAt: new Date(),
    });

    await job.save();

    res.json({
      ok: true,
      quiz: job.results.quizzes[quizIndex],
    });
  } catch (error) {
    console.error("Update draft quiz error:", error);
    res.status(500).json({
      ok: false,
      message: "Failed to update draft quiz",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

/**
 * @route  POST /api/generate/:jobId/approve
 * @auth   authMiddleware (authenticated teacher, must own the job)
 *
 * @input
 *   Params: { jobId: string }
 *   Body: { quizIds: string[] } (array of tempIds to approve)
 *
 * @notes
 *   - Approves selected draft quizzes and saves them to quiz-service
 *   - Only quizzes with status 'draft' are eligible for approval
 *   - Transforms draft format to quiz-service format
 *   - Calls quiz-service /quiz/batch endpoint with authorization header
 *   - Updates approved quizzes with savedQuizId and status 'approved'
 *   - Partial success supported: some quizzes may save while others fail
 *   - Saved quiz IDs are MongoDB ObjectIds from quiz-service
 *
 * @returns 200 {
 *   ok: true,
 *   message: string,
 *   savedQuizIds: string[],
 *   errors: any[]
 * }
 *
 * @errors
 *   400 invalid job ID, no quizzes selected, no valid quizzes to approve
 *   401 unauthorized (no auth header)
 *   404 job not found
 *   500 internal server error, quiz-service error
 */
export async function approveQuizzes(req: CustomRequest, res: Response) {
  try {
    const { jobId } = req.params;
    const teacherId = req.teacherId;
    const authHeader = req.headers.authorization;
    const { quizIds } = req.body; // Array of tempIds to approve

    if (!authHeader) {
      return res.status(401).json({ ok: false, message: "Unauthorized" });
    }

    if (!teacherId) {
      return res
        .status(401)
        .json({ ok: false, message: "Unauthorized: teacherId missing" });
    }

    if (!jobId || !Types.ObjectId.isValid(jobId)) {
      return res.status(400).json({ ok: false, message: "Invalid job ID" });
    }

    if (!Array.isArray(quizIds) || quizIds.length === 0) {
      return res
        .status(400)
        .json({ ok: false, message: "No quizzes selected" });
    }

    const job = await GenerationJobModel.findOne({
      _id: new Types.ObjectId(jobId),
      teacherId: new Types.ObjectId(teacherId),
    });

    if (!job || !job.results) {
      return res.status(404).json({ ok: false, message: "Job not found" });
    }

    // Get selected quizzes
    const selectedQuizzes = job.results.quizzes.filter(
      (q) => quizIds.includes(q.tempId) && q.status === "draft",
    );

    if (selectedQuizzes.length === 0) {
      return res
        .status(400)
        .json({ ok: false, message: "No valid quizzes to approve" });
    }

    // Fetch existing quiz names from the user's database
    const existingNames =
      await quizServiceClient.getExistingQuizNames(authHeader);

    // Get the names of quizzes to be created
    const quizNames = selectedQuizzes.map((q) => q.name);

    // Make names unique by appending numbers if needed
    const uniqueNames = makeNamesUnique(quizNames, existingNames);

    // Transform quizzes to quiz-service format with unique names
    const quizzesToCreate = selectedQuizzes.map((quiz, index) => {
      const baseQuiz: any = {
        quizType: quiz.quizType,
        name: uniqueNames[index] || quiz.name,
        subject: quiz.subject,
        topic: quiz.topic,
        totalTimeLimit: quiz.totalTimeLimit,
      };

      // Crossword quizzes use 'entries' field, others use 'items'
      if (quiz.quizType === "crossword") {
        baseQuiz.entries = (quiz as any).entries || quiz.items || [];
      } else {
        baseQuiz.items = quiz.items;
      }

      return baseQuiz;
    });

    // Call quiz-service to create quizzes
    const result = await quizServiceClient.createQuizzesBatch(
      quizzesToCreate,
      teacherId as string, // Safe: already checked above
    );

    // Update job with saved quiz IDs
    for (let i = 0; i < selectedQuizzes.length; i++) {
      const quiz = selectedQuizzes[i];
      if (!quiz) continue;

      const quizIndex = job.results.quizzes.findIndex(
        (q) => q.tempId === quiz.tempId,
      );

      if (quizIndex !== -1 && result.quizIds[i]) {
        const targetQuiz = job.results.quizzes[quizIndex];
        if (targetQuiz) {
          targetQuiz.status = "approved";
          targetQuiz.savedQuizId = new Types.ObjectId(result.quizIds[i]);
        }
      }
    }

    await job.save();

    res.json({
      ok: true,
      message: `${result.quizIds.length} quizzes saved successfully`,
      savedQuizIds: result.quizIds,
      errors: result.errors,
    });
  } catch (error) {
    console.error("Approve quizzes error:", error);
    res.status(500).json({
      ok: false,
      message: "Failed to approve quizzes",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

/**
 * @route  DELETE /api/generate/:jobId
 * @auth   authMiddleware (authenticated teacher, must own the job)
 *
 * @input
 *   Params: { jobId: string }
 *
 * @notes
 *   - Deletes a generation job and all associated data
 *   - Removes the uploaded document file from storage
 *   - Removes job document from MongoDB
 *   - Does NOT delete approved quizzes from quiz-service (they persist)
 *   - Continues even if file deletion fails (job still removed from DB)
 *   - Verifies job ownership before deletion
 *
 * @returns 200 {
 *   ok: true,
 *   message: "Generation job deleted"
 * }
 *
 * @errors
 *   400 invalid job ID (not a valid ObjectId)
 *   404 job not found (or not owned by teacher)
 *   500 internal server error
 */
export async function deleteGenerationJob(req: CustomRequest, res: Response) {
  try {
    const { jobId } = req.params;
    const teacherId = req.teacherId;

    if (!jobId || !Types.ObjectId.isValid(jobId)) {
      return res.status(400).json({ ok: false, message: "Invalid job ID" });
    }

    const job = await GenerationJobModel.findOne({
      _id: new Types.ObjectId(jobId),
      teacherId: new Types.ObjectId(teacherId),
    });

    if (!job) {
      return res.status(404).json({ ok: false, message: "Job not found" });
    }

    // Delete uploaded files if they exist
    if (job.documentMeta && job.documentMeta.length > 0) {
      for (const doc of job.documentMeta) {
        try {
          await fs.unlink(doc.storagePath);
          console.log(`Deleted file: ${doc.filename}`);
        } catch (err) {
          console.error(`Failed to delete file ${doc.filename}:`, err);
          // Continue even if file deletion fails
        }
      }
    }

    await GenerationJobModel.deleteOne({ _id: job._id });

    res.json({
      ok: true,
      message: "Generation job deleted",
    });
  } catch (error) {
    console.error("Delete generation job error:", error);
    res.status(500).json({
      ok: false,
      message: "Failed to delete generation job",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

/** ---------- Private Background Processing ---------- */

/**
 * @internal
 * @async
 *
 * @notes
 *   - Background job processor that runs asynchronously after job creation
 *   - Handles three main phases:
 *     1. Document parsing (PDF/DOCX/TXT) → extractedText
 *     2. Quiz generation using OpenAI GPT-5 mini → draft quizzes
 *     3. Result aggregation and job completion
 *   - Updates job status throughout: pending → processing → completed/failed
 *   - Progress updates saved to database for real-time polling
 *   - Errors caught and stored in job.error field
 *   - Non-blocking: caller receives jobId immediately
 *   - Uses DocumentParserService for text extraction
 *   - Uses QuizGeneratorService for LLM-based generation
 *
 * @param jobId MongoDB ObjectId string of the generation job
 *
 * @errors
 *   - All errors caught and logged
 *   - Job status set to 'failed' with error message
 *   - Continues processing remaining quizzes if some fail
 */
async function processGenerationJob(jobId: string) {
  try {
    const job = await GenerationJobModel.findById(jobId);
    if (!job) {
      console.error("Job not found:", jobId);
      return;
    }

    // Update status to processing
    job.status = "processing";
    job.startedAt = new Date();
    await job.save();

    let contentForGeneration = job.config.instructions;

    // Parse documents if provided (can handle multiple files)
    if (job.documentMeta && job.documentMeta.length > 0) {
      console.log(`Parsing ${job.documentMeta.length} document(s)...`);
      const parsedTexts: string[] = [];

      for (const doc of job.documentMeta) {
        console.log(`Parsing document: ${doc.filename}`);
        const parsed = await documentParser.parseDocument(
          doc.storagePath,
          doc.mimetype,
        );
        parsedTexts.push(`\n\n=== ${doc.originalName} ===\n${parsed.text}`);
        console.log(`Document parsed: ${parsed.metadata.wordCount} words`);
      }

      const combinedText = parsedTexts.join("\n");
      job.extractedText = combinedText;
      await job.save();

      console.log(`All documents parsed: ${job.documentMeta.length} file(s)`);

      // Combine instructions with all document contents
      contentForGeneration = `${job.config.instructions}\n\nReference Material:${combinedText}`;
    } else {
      console.log("Generating from instructions only (no documents provided)");
    }

    // Fetch quiz structure AND AI generation rules from quiz service
    console.log("Fetching quiz structure and AI generation rules...");
    const structureAndRules =
      await quizServiceClient.getQuizStructureAndRules("");
    console.log("Quiz structure and rules fetched successfully");

    // Generate quizzes with the rules from quiz service
    console.log("Generating quizzes...");

    // Debounce saves to prevent parallel save conflicts
    let saveTimeout: NodeJS.Timeout | null = null;
    let lastSavePromise: Promise<void> = Promise.resolve();

    const saveProgress = () => {
      // Clear existing timeout
      if (saveTimeout) {
        clearTimeout(saveTimeout);
      }

      // Debounce: save after 500ms of no new updates
      saveTimeout = setTimeout(async () => {
        // Wait for any previous save to complete
        await lastSavePromise;

        // Perform the save
        lastSavePromise = (async () => {
          try {
            await job.save();
            console.log(
              `Progress: ${job.progress.current}/${job.progress.total}`,
            );
          } catch (error) {
            console.error("Error saving progress:", error);
          }
        })();

        await lastSavePromise;
      }, 500);
    };

    const generatedQuizzes = await quizGenerator.generateQuizzes(
      contentForGeneration,
      job.config,
      structureAndRules,
      async (progressArray) => {
        // Update progress in memory
        job.progress.current = progressArray.filter(
          (p) => p.status === "completed" || p.status === "failed",
        ).length;
        job.progress.total = progressArray.length;

        // Store individual quiz progress
        (job.progress as any).quizzes = progressArray.map((p) => ({
          tempId: p.tempId,
          quizNumber: p.quizNumber,
          status: p.status,
          error: p.error,
          retryCount: p.retryCount,
        }));

        // Debounced save (won't execute in parallel)
        saveProgress();
      },
    );

    // Final save after generation completes
    if (saveTimeout) {
      clearTimeout(saveTimeout);
    }
    await lastSavePromise;
    await job.save();
    console.log(
      `Final progress save: ${job.progress.current}/${job.progress.total}`,
    );

    // Update job with results
    job.results = {
      total: job.config.numQuizzes,
      successful: generatedQuizzes.length,
      failed: job.config.numQuizzes - generatedQuizzes.length,
      quizzes: generatedQuizzes.map((quiz) => {
        // Debug log for crossword quizzes
        if (quiz.quizType === "crossword") {
          const crosswordQuiz = quiz as any;
          console.log("🔍 SAVING CROSSWORD TO JOB:", {
            tempId: quiz.tempId,
            name: quiz.name,
            entriesCount:
              crosswordQuiz.entries?.length || crosswordQuiz.items?.length || 0,
            hasEntries: !!crosswordQuiz.entries || !!crosswordQuiz.items,
            firstEntry: crosswordQuiz.entries?.[0] || crosswordQuiz.items?.[0],
          });
        }

        // Build result object, only including error if it exists
        const result: any = {
          tempId: quiz.tempId,
          quizType: quiz.quizType,
          name: quiz.name,
          subject: quiz.subject,
          topic: quiz.topic,
          items: quiz.items,
          totalTimeLimit: quiz.totalTimeLimit,
          status: quiz.status || "draft",
          retryCount: quiz.retryCount || 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        // Add optional crossword fields
        if (quiz.entries) result.entries = quiz.entries;
        if (quiz.grid) result.grid = quiz.grid;
        if (quiz.placedEntries) result.placedEntries = quiz.placedEntries;

        // Add error only if it exists
        if (quiz.error) result.error = quiz.error;

        return result;
      }),
    };

    job.status = "completed";
    job.completedAt = new Date();
    await job.save();

    console.log(
      `Generation completed: ${generatedQuizzes.length}/${job.config.numQuizzes} quizzes created successfully`,
    );
  } catch (error) {
    console.error("Processing error:", error);

    try {
      const job = await GenerationJobModel.findById(jobId);
      if (job) {
        job.status = "failed";
        job.error = error instanceof Error ? error.message : "Unknown error";
        job.completedAt = new Date();
        await job.save();
      }
    } catch (updateError) {
      console.error("Failed to update job status:", updateError);
    }
  }
}

/**
 * @route  GET /api/generate/jobs
 * @auth   authMiddleware (authenticated teacher)
 *
 * @notes
 *   - Returns all generation jobs for the teacher
 *   - Simpler version without pagination parameters
 *   - Used by frontend to list jobs in sidebar
 *
 * @returns 200 {
 *   ok: true,
 *   jobs: IGenerationJob[]
 * }
 */
export async function listJobs(req: CustomRequest, res: Response) {
  try {
    const teacherId = req.teacherId;

    const jobs = await GenerationJobModel.find({
      teacherId: new Types.ObjectId(teacherId),
    })
      .sort({ createdAt: -1 })
      .limit(50) // Reasonable limit for sidebar display
      .select("-extractedText"); // Don't return full text

    // Transform jobs to match frontend interface
    const transformedJobs = jobs.map((job) => ({
      id: job._id.toString(),
      status: job.status,
      progress: job.progress,
      config: job.config,
      results: job.results,
      error: job.error,
      createdAt: job.createdAt,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
    }));

    res.json({
      ok: true,
      jobs: transformedJobs,
    });
  } catch (error) {
    console.error("List jobs error:", error);
    res.status(500).json({
      ok: false,
      message: "Failed to list jobs",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

/**
 * @route  GET /api/generate/jobs/pending
 * @auth   authMiddleware (authenticated teacher)
 *
 * @notes
 *   - Returns count of jobs with pending draft quizzes
 *   - Used for badge display in UI
 *
 * @returns 200 {
 *   ok: true,
 *   count: number
 * }
 */
export async function getPendingJobsCount(req: CustomRequest, res: Response) {
  try {
    const teacherId = req.teacherId;

    const jobs = await GenerationJobModel.find({
      teacherId: new Types.ObjectId(teacherId),
      status: "completed",
      "results.quizzes": { $exists: true, $ne: [] },
    }).select("results.quizzes.status");

    // Count jobs that have at least one draft quiz
    const pendingJobs = jobs.filter((job) =>
      job.results?.quizzes.some((q) => q.status === "draft"),
    );

    res.json({
      ok: true,
      count: pendingJobs.length,
    });
  } catch (error) {
    console.error("Get pending jobs count error:", error);
    res.status(500).json({
      ok: false,
      message: "Failed to get pending jobs count",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

/**
 * @route  DELETE /api/generate/cleanup
 * @auth   authMiddleware (authenticated teacher)
 *
 * @notes
 *   - Deletes old completed jobs where all quizzes are approved/rejected
 *   - Jobs must be older than 30 days
 *   - Only deletes jobs owned by the authenticated teacher
 *
 * @returns 200 {
 *   ok: true,
 *   deleted: number,
 *   message: string
 * }
 */
export async function cleanupOldJobs(req: CustomRequest, res: Response) {
  try {
    const teacherId = req.teacherId;
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Find old completed jobs
    const jobs = await GenerationJobModel.find({
      teacherId: new Types.ObjectId(teacherId),
      status: "completed",
      createdAt: { $lt: thirtyDaysAgo },
    });

    // Filter to jobs where all quizzes are approved or rejected
    const jobsToDelete = jobs.filter((job) => {
      if (!job.results?.quizzes || job.results.quizzes.length === 0) {
        return true; // Delete jobs with no quizzes
      }
      return job.results.quizzes.every(
        (q) => q.status === "approved" || q.status === "rejected",
      );
    });

    // Delete jobs and their files
    let deletedCount = 0;
    for (const job of jobsToDelete) {
      // Delete uploaded files if they exist
      if (job.documentMeta && job.documentMeta.length > 0) {
        for (const doc of job.documentMeta) {
          try {
            await fs.unlink(doc.storagePath);
          } catch (err) {
            console.warn(`Failed to delete file ${doc.storagePath}:`, err);
          }
        }
      }

      await GenerationJobModel.findByIdAndDelete(job._id);
      deletedCount++;
    }

    res.json({
      ok: true,
      deleted: deletedCount,
      message: `Cleaned up ${deletedCount} old job(s)`,
    });
  } catch (error) {
    console.error("Cleanup old jobs error:", error);
    res.status(500).json({
      ok: false,
      message: "Failed to cleanup old jobs",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
