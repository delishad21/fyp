import { Router } from "express";
import {
  verifyAccessToken,
  verifyStudentOnly,
  verifyAttemptOwnerOrPrivileged,
  verifyTeacherOfAttemptStudent,
  verifyTeacherOfSchedule,
  verifyTeacherOfStudent,
  verifyTeacherOfStudentOrSelf,
} from "../middleware/access-control";
import {
  postAttemptSpec,
  startAttempt,
  submitAttemptAnswers,
  finalizeAttempt,
  getAttemptById,
  listMyAttempts,
  listAttemptsForStudent,
  deleteAttempt,
  getScheduledQuizStatsInternal,
  listAttemptsForSchedule,
  listAttemptsForScheduleByStudent,
  getStudentAttemptsInternal,
  getAttemptsForScheduleByStudentInternal,
} from "../controller/quiz-attempt-controller";

const router = Router();

/**
 * Routes under prefix: /attempt  (mounted in index.ts)
 * NOTE: See comment on /spec/:quizId — handler currently reads quizId from body.
 */

/** POST /attempt/spec/:quizId — Build render-safe attempt spec (eligibility-checked) */
router.post("/spec/:quizId", verifyAccessToken, postAttemptSpec);

/** POST /attempt — Start attempt (student only), writes snapshot */
router.post("/", verifyAccessToken, verifyStudentOnly, startAttempt);

/** GET /attempt/my — List attempts for current user (Used for students) */
router.get("/my", verifyAccessToken, listMyAttempts);

/** PATCH /attempt/:attemptId/answers — Save answers (owner or privileged) */
router.patch(
  "/:attemptId/answers",
  verifyAccessToken,
  verifyAttemptOwnerOrPrivileged,
  submitAttemptAnswers
);

/** POST /attempt/:attemptId/finish — Finalize attempt (owner or privileged) */
router.post(
  "/:attemptId/finish",
  verifyAccessToken,
  verifyAttemptOwnerOrPrivileged,
  finalizeAttempt
);

/** GET /attempt/:attemptId — Read single attempt (owner or privileged) */
router.get(
  "/:attemptId",
  verifyAccessToken,
  verifyAttemptOwnerOrPrivileged,
  getAttemptById
);

/// GET /attempt/quiz/schedule/:scheduleId — Attempts for a schedule (teacher/admin)
router.get(
  "/quiz/schedule/:scheduleId",
  verifyAccessToken,
  verifyTeacherOfSchedule,
  listAttemptsForSchedule
);

/** GET /attempt/student/:studentId — Attempts for a student (teacher/admin) */
router.get(
  "/student/:studentId",
  verifyAccessToken,
  verifyTeacherOfStudent,
  listAttemptsForStudent
);

/** GET /attempt/schedule/:scheduleId/student/:studentId — Attempts for a student within a schedule (teacher or self) */
router.get(
  "/schedule/:scheduleId/student/:studentId",
  verifyAccessToken,
  verifyTeacherOfStudentOrSelf,
  listAttemptsForScheduleByStudent
);

/** DELETE /attempt/:attemptId — Soft-invalidate attempt (teacher/admin) */
router.delete(
  "/:attemptId",
  verifyAccessToken,
  verifyTeacherOfAttemptStudent,
  deleteAttempt
);

/**
 * POST /attempt/internal/scheduled-quiz-stats
 * Purpose: S2S endpoint for class-service to obtain schedule-level stats.
 * Guarded by x-quiz-secret header in controller.
 */
router.post("/internal/scheduled-quiz-stats", getScheduledQuizStatsInternal);

/**
 * POST /attempt/internal/student
 * Purpose: S2S endpoint to fetch all attempts for a given student (no pagination).
 * Guarded by x-quiz-secret header in controller.
 */
router.post("/internal/student", getStudentAttemptsInternal);

/**
 * POST /attempt/internal/schedule-student
 * Purpose: S2S endpoint to fetch all attempts for a given (scheduleId, studentId).
 * Guarded by x-quiz-secret header in controller.
 */
router.post(
  "/internal/schedule-student",
  getAttemptsForScheduleByStudentInternal
);

export default router;
