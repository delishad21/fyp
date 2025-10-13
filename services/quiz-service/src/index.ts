import express from "express";
import cors from "cors";
import { Request, Response, NextFunction } from "express";

import quizzesRoutes from "./routes/quiz-routes";
import quizMetaRoutes from "./routes/quiz-meta-routes";
import quizAttemptRoutes from "./routes/quiz-attempt-routes";
import path from "path";

const app = express();

/**
 * Server bootstrap
 * - JSON/urlencoded parsing
 * - CORS
 * - Route mounting (prefixes below)
 * - Static files (/uploads)
 * - 404 and error handlers
 *
 * Route prefixes (affect full paths in route files):
 *   • /quiz/meta → quizMetaRoutes
 *   • /quiz      → quizzesRoutes
 *   • /attempt   → quizAttemptRoutes
 */

// ─────────────────────────── Core middleware ────────────────────────────────
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cors());
// TODO: if you need stricter CORS, configure allowed origins/methods/headers.

// ───────────────────────────── Route mounting ───────────────────────────────
app.use("/quiz/meta", quizMetaRoutes); // Must come before /quiz to avoid shadowing
app.use("/quiz", quizzesRoutes);
app.use("/attempt", quizAttemptRoutes);

// ─────────────────────────────── Health root ────────────────────────────────
app.get("/", (req, res, next) => {
  console.log("Sending Greetings!");
  res.json({
    message: "Hello World from quiz-service",
  });
});

// ───────────────────────────── Static hosting ───────────────────────────────
app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

// ────────────────────────────── 404 passthrough ────────────────────────────
interface ErrorWithStatus extends Error {
  status?: number;
}
app.use((req, res, next) => {
  const error: ErrorWithStatus = new Error("Route Not Found");
  error.status = 404;
  next(error);
});

// ───────────────────────────── Error handler ────────────────────────────────
app.use(
  (error: ErrorWithStatus, req: Request, res: Response, next: NextFunction) => {
    res.status(error.status || 500);
    res.json({
      error: {
        message: error.message,
      },
    });
  }
);

export default app;
