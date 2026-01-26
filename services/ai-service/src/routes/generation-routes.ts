import { Router } from "express";
import {
  startGeneration,
  getGenerationStatus,
  getGenerationJobs,
  updateDraftQuiz,
  approveQuizzes,
  deleteGenerationJob,
  listJobs,
  getPendingJobsCount,
  cleanupOldJobs,
} from "../controller/generation-controller";
import { verifyAccessToken, verifyIsTeacher } from "../middleware/auth";
import { uploadMultiple } from "../utils/multer-config";

const router = Router();

/**
 * Routes (mounted at root / in index.ts)
 * Keep more specific/static paths before dynamic (/:id).
 */

/** POST /generate — Start quiz generation job (with optional file uploads, up to 5 files) */
router.post(
  "/",
  verifyAccessToken,
  verifyIsTeacher,
  uploadMultiple.array("documents", 5),
  startGeneration,
);

/** GET /generate — List all generation jobs with pagination */
router.get("/", verifyAccessToken, verifyIsTeacher, getGenerationJobs);

/** GET /generate/jobs — Sidebar job list (simpler version) */
router.get("/jobs", verifyAccessToken, verifyIsTeacher, listJobs);

/** GET /generate/jobs/pending — Count of jobs with pending drafts */
router.get(
  "/jobs/pending",
  verifyAccessToken,
  verifyIsTeacher,
  getPendingJobsCount,
);

/** DELETE /generate/cleanup — Cleanup old completed jobs (30+ days) */
router.delete("/cleanup", verifyAccessToken, verifyIsTeacher, cleanupOldJobs);

/** GET /generate/:jobId — Get status and results of a specific job */
router.get("/:jobId", verifyAccessToken, verifyIsTeacher, getGenerationStatus);

/** PATCH /generate/:jobId/quizzes/:tempId — Update a draft quiz */
router.patch(
  "/:jobId/quizzes/:tempId",
  verifyAccessToken,
  verifyIsTeacher,
  updateDraftQuiz,
);

/** POST /generate/:jobId/approve — Approve and save selected quizzes */
router.post(
  "/:jobId/approve",
  verifyAccessToken,
  verifyIsTeacher,
  approveQuizzes,
);

/** DELETE /generate/:jobId — Delete a generation job */
router.delete(
  "/:jobId",
  verifyAccessToken,
  verifyIsTeacher,
  deleteGenerationJob,
);

export default router;
