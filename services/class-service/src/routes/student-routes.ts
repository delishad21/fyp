// routes/student-routes.ts
import { Router } from "express";
import {
  verifyAccessToken,
  verifyTeacherOfStudentOrSelf,
} from "../middleware/access-control";
import {
  getAttemptableSchedulesForStudent,
  getStudentAttemptsScheduleSummary,
  getStudentProfile,
} from "../controller/students-controller";

const router = Router();

/** GET /students/:studentId/attemptable-schedules — teacher/admin or the student
 * /me is supported via middleware
 */
router.get(
  "/:studentId/attemptable-schedules",
  verifyAccessToken,
  verifyTeacherOfStudentOrSelf,
  getAttemptableSchedulesForStudent
);

/**
 * GET /students/:studentId/profile — class-agnostic student profile
 * Auth: student themself OR a teacher of the student (or admin via middleware)
 */
router.get(
  "/:studentId/profile",
  verifyAccessToken,
  verifyTeacherOfStudentOrSelf,
  getStudentProfile
);

/**
 * GET /students/:studentId/schedule-summary
 * Supports ":studentId" = "me"
 */
router.get(
  "/:studentId/schedule-summary",
  verifyAccessToken,
  verifyTeacherOfStudentOrSelf,
  getStudentAttemptsScheduleSummary
);

export default router;
