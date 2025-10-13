import express from "express";

import {
  handleSignIn,
  confirmEmail,
  verifyPassword,
  handleForgetPassword,
  getVerifyEmailStatus,
  completePasswordReset,
  getPasswordResetStatus,
  resendConfirmation,
} from "../controller/teacher-auth-controller";
import { verifyTeacherAccessToken } from "../middleware/access-control";

/**
 * @prefix  /teacher/auth
 * @routes
 *   POST /sign-in                  → handleSignIn (public)
 *   POST /forget-password          → handleForgetPassword (public)
 *   GET  /forget-password/status   → getPasswordResetStatus (public)
 *   POST /forget-password/reset    → completePasswordReset (public)
 *   POST /verify-password          → verifyPassword (requires verifyTeacherAccessToken)
 *   PATCH /verify-email            → confirmEmail (public)
 *   GET  /verify-email/status      → getVerifyEmailStatus (public)
 *   PATCH /verify-email/resend     → resendConfirmation (public)
 *   POST /email-change/resend      → resendConfirmation (public)
 * @notes  - Mounted via app.use("/teacher/auth", teacherAuthRoutes).
 *         - Public endpoints intentionally avoid leaking account existence.
 *         - Access tokens issued by /sign-in are teacher-scoped.
 */

const router = express.Router();

router.post("/sign-in", handleSignIn);

router.post("/forget-password", handleForgetPassword);

router.get("/forget-password/status", getPasswordResetStatus);

router.post("/forget-password/reset", completePasswordReset);

router.post("/verify-password", verifyTeacherAccessToken, verifyPassword);

router.patch("/verify-email", confirmEmail);

router.get("/verify-email/status", getVerifyEmailStatus);

router.patch("/verify-email/resend", resendConfirmation);

router.post("/email-change/resend", resendConfirmation);

export default router;
