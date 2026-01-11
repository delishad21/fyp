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
 * ":studentId" may be "me", which is resolved inside the controller.
 */
router.get(
  "/:studentId/attemptable-schedules",
  verifyAccessToken,
  verifyTeacherOfStudentOrSelf,
  getAttemptableSchedulesForStudent
);

/**
 * GET /students/:studentId/profile
 *
 * Current behaviour:
 *  - Returns a profile scoped to the student's "primary" class, assuming the
 *    invariant that each student belongs to only one class in the system.
 *
 * Design note:
 *  - There are plans to make this endpoint truly class-agnostic / multi-class
 *    once we support students in multiple classes. When that happens, the
 *    implementation in getStudentProfile will be revisited.
 *
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
