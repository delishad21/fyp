// routes/classes.ts
import { Router } from "express";
import {
  addStudents,
  getStudentById,
  getStudents,
  removeStudent,
  getStudentAttemptsScheduleSummaryforClass,
} from "../controller/class-student-controller";
import {
  verifyAccessToken,
  verifyClassOwnerOrAdmin,
  verifyTeacherOfStudent,
} from "../middleware/access-control";

const router = Router();

/** POST /classes/:id/students — Add students to a class (owner/teacher/admin) */
router.post(
  "/:id/students",
  verifyAccessToken,
  verifyClassOwnerOrAdmin,
  addStudents
);

/** GET /classes/:id/students — List students in a class (owner/teacher/admin) */
router.get(
  "/:id/students",
  verifyAccessToken,
  verifyClassOwnerOrAdmin,
  getStudents
);

/** GET /classes/:id/students/:studentId — Teacher-only (or admin) */
router.get(
  "/:id/students/:studentId",
  verifyAccessToken,
  verifyTeacherOfStudent,
  getStudentById
);

/** GET /classes/:id/students/:studentId/schedule-summary — Teacher-and-student */
router.get(
  "/:id/students/:studentId/schedule-summary",
  verifyAccessToken,
  verifyTeacherOfStudent,
  getStudentAttemptsScheduleSummaryforClass
);

/** DELETE /classes/:id/students/:studentId — Remove student (owner/teacher/admin) */
router.delete(
  "/:id/students/:studentId",
  verifyAccessToken,
  verifyClassOwnerOrAdmin,
  removeStudent
);

export default router;
