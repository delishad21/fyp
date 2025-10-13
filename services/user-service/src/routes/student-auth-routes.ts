import { Router } from "express";
import { verifyStudentAccessToken } from "../middleware/access-control";
import {
  studentSignIn,
  studentChangePassword,
} from "../controller/student-auth-controller";

/**
 * @prefix  /student/auth
 * @routes
 *   POST /sign-in          → studentSignIn (public)
 *   POST /change-password  → studentChangePassword (requires verifyStudentAccessToken)
 * @notes  - Mounted via app.use("/student/auth", studentAuthRoutes).
 *         - Tokens issued by /sign-in encode role=student and include teacherId/mustChangePassword claims.
 */

const router = Router();

router.post("/sign-in", studentSignIn);
router.post(
  "/change-password",
  verifyStudentAccessToken,
  studentChangePassword
);

export default router;
