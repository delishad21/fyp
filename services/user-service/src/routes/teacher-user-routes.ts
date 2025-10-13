import express from "express";

import {
  createUserRequest,
  deleteUser,
  getAllUsers,
  getUser,
  updateUser,
  deleteCreateUserRequest,
  updateEmailRequest,
} from "../controller/teacher-user-controller";
import {
  verifyIsAdmin,
  verifyIsOwnerOrAdmin,
  verifyTeacherAccessToken,
} from "../middleware/access-control";

/**
 * @prefix  /teacher/users
 * @routes
 *   GET    /                     → getAllUsers            (verifyIsAdmin)
 *   POST   /                     → createUserRequest      (public)
 *   DELETE /:email               → deleteCreateUserRequest (testing-only)
 *   GET    /:id                  → getUser                (verifyIsOwnerOrAdmin)
 *   PATCH  /me                   → updateUser             (verifyTeacherAccessToken)
 *   POST   /me/email-change/request → updateEmailRequest  (verifyTeacherAccessToken)
 *   DELETE /:id                  → deleteUser             (verifyIsOwnerOrAdmin)
 * @notes  - Mounted via app.use("/teacher/users", teacherUserRoutes).
 *         - Public endpoints avoid leaking secrets/OTP codes; codes are sent via email only.
 *         - Owner-or-admin checks ensure teachers can see their own profile while admins can manage all.
 */

const router = express.Router();

// Was: verifyTeacherAccessToken, verifyIsAdmin
router.get("/", verifyIsAdmin, getAllUsers);

router.post("/", createUserRequest);

// For testing, used to delete createUserRequests
router.delete("/:email", deleteCreateUserRequest);

// Was: verifyTeacherAccessToken, verifyIsOwnerOrAdmin
router.get("/:id", verifyIsOwnerOrAdmin, getUser);

// Still needs teacher/admin, not just auth
router.patch("/me", verifyTeacherAccessToken, updateUser);

router.post(
  "/me/email-change/request",
  verifyTeacherAccessToken,
  updateEmailRequest
);

// Was: verifyTeacherAccessToken, verifyIsOwnerOrAdmin
router.delete("/:id", verifyIsOwnerOrAdmin, deleteUser);

export default router;
