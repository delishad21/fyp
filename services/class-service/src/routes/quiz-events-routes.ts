import { Router } from "express";
import { handleQuizEvent } from "../controller/quiz-events-controller";
import { verifySharedSecret } from "../middleware/access-control";

const router = Router();

/**
 * Routes mounted at root: /  (index.ts)
 * S2S webhook receiver for quiz-service outbox events.
 * Auth is enforced inside controller via x-quiz-secret.
 */

/** POST /internal/quiz-events — Receive and process quiz events (S2S) */
router.post("/internal/quiz-events", verifySharedSecret, handleQuizEvent);

export default router;
