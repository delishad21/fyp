// routes/teacher-students-routes.ts
import { Router } from "express";
import {
  bulkCreateStudentsHandler,
  bulkDeleteStudentsHandler,
  createStudent,
  deleteStudent,
  listMyStudents,
  teacherResetStudentPassword,
  updateStudent,
} from "../controller/student-user-controller";
import { verifyTeacherAccessToken } from "../middleware/access-control";

/**
 * @prefix  /student/users
 * @auth    verifyTeacherAccessToken (teacher or admin)
 * @routes
 *   POST   /create
 *          - Create a single student under the authenticated teacher.
 *          - Body: { name, username, email? }
 *          - Returns created student and a temporary password.
 *
 *   GET    /me
 *          - List all students owned by the authenticated teacher (admin: N/A).
 *
 *   POST   /:studentId/reset-password
 *          - Generate and set a new temporary password for a specific student.
 *          - Teacher must own the student; admins bypass ownership.
 *
 *   POST   /bulk-create?includePasswords=true|false
 *          - Create up to N students in one request (see controller MAX_BATCH).
 *          - Body: { students: { name, username, email? }[] }
 *          - Optional query includePasswords to echo generated temp passwords.
 *          - Validates rows; rejects duplicates and conflicts atomically.
 *
 *   POST   /bulk-delete
 *          - Delete up to N students by id (see controller MAX_BULK_DELETE).
 *          - Body: { studentIds: string[] }
 *          - Teacher can delete only their own; admin can delete any.
 *          - Returns which ids were deleted vs. not found/forbidden.
 *
 *   PATCH  /:studentId
 *          - Update student profile fields (name, username, email, flags).
 *          - Teacher must own the student; admins can update any.
 *
 *   DELETE /:studentId
 *          - Hard-delete a student.
 *          - Teacher must own the student; admins can delete any.
 *
 * @notes
 *   - Username must be unique; email is optional but validated if provided.
 *   - Temp passwords are bcrypt-hashed and flagged with mustChangePassword.
 *   - All endpoints require a valid teacher/admin JWT (verifyTeacherAccessToken).
 *   - Mounted via: app.use("/student/users", studentUserRoutes)
 */

const router = Router();

router.post("/create", verifyTeacherAccessToken, createStudent);

router.get("/me", verifyTeacherAccessToken, listMyStudents);

router.post(
  "/:studentId/reset-password",
  verifyTeacherAccessToken,
  teacherResetStudentPassword
);

router.post(
  "/bulk-create",
  verifyTeacherAccessToken,
  bulkCreateStudentsHandler
);

router.post(
  "/bulk-delete",
  verifyTeacherAccessToken,
  bulkDeleteStudentsHandler
);

router.patch("/:studentId", verifyTeacherAccessToken, updateStudent);
router.delete("/:studentId", verifyTeacherAccessToken, deleteStudent);

export default router;
