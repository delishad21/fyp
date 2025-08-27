import express from "express";

import {
  handleSignIn,
  handleVerifyToken,
  confirmEmail,
  verifyPassword,
  handleForgetPassword,
  getVerifyEmailStatus,
  completePasswordReset,
  getPasswordResetStatus,
  resendConfirmation,
} from "../controller/webapp-auth-controller";
import { verifyAccessToken } from "../middleware/access-control";

const router = express.Router();

router.post("/sign-in", handleSignIn);

router.post("/forget-password", handleForgetPassword);

router.get("/forget-password/status", getPasswordResetStatus);

router.post("/forget-password/reset", completePasswordReset);

router.get("/verify-token", verifyAccessToken, handleVerifyToken);

router.post("/verify-password", verifyAccessToken, verifyPassword);

router.patch("/verify-email", confirmEmail);

router.get("/verify-email/status", getVerifyEmailStatus);

router.patch("/verify-email/resend", resendConfirmation);

router.post("/email-change/resend", resendConfirmation);

export default router;
