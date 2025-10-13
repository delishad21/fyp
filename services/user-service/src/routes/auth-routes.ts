import { Router } from "express";
import { CustomRequest, verifyAccessToken } from "../middleware/access-control";

const router = Router();

/**
 * GET /auth/me
 * Verifies the bearer token and returns the normalized user identity.
 * Works for students, teachers, and admins.
 */
router.get("/me", verifyAccessToken, (req: CustomRequest, res) => {
  // req.user is populated by verifyAccessToken
  const { id, username, email, role, teacherId, isAdmin, mustChangePassword } =
    req.user!;
  res.json({
    id,
    username,
    email,
    role,
    teacherId,
    isAdmin,
    mustChangePassword,
  });
});

/**
 * Optional: light-weight "is alive" for tokens
 * Returns 204 if token valid, 401 otherwise.
 */
router.head("/verify", verifyAccessToken, (_req, res) => res.sendStatus(204));

export default router;
