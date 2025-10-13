import { Router } from "express";
import {
  addStudents,
  getStudentById,
  getStudents,
  removeStudent,
} from "../controller/student-controller";
import {
  verifyAccessToken,
  verifyClassOwnerOrAdmin,
} from "../middleware/access-control";

const router = Router();

/**
 * Routes under prefix: /classes  (mounted in index.ts)
 * Only class owner/admin can manage students.
 */

/** POST /classes/:id/students — Add students to a class */
router.post(
  "/:id/students",
  verifyAccessToken,
  verifyClassOwnerOrAdmin,
  addStudents
);

/** GET /classes/:id/students — List students in a class */
router.get(
  "/:id/students",
  verifyAccessToken,
  verifyClassOwnerOrAdmin,
  getStudents
);

/** GET /classes/:id/students/:studentId — Get one student record in the class */
router.get(
  "/:id/students/:studentId",
  verifyAccessToken,
  verifyClassOwnerOrAdmin,
  getStudentById
);

/** DELETE /classes/:id/students/:studentId — Remove a student from the class */
router.delete(
  "/:id/students/:studentId",
  verifyAccessToken,
  verifyClassOwnerOrAdmin,
  removeStudent
);

export default router;
