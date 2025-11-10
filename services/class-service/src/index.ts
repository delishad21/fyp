import express from "express";
import cors from "cors";
import { Request, Response, NextFunction } from "express";
import path from "path";
import classRoutes from "./routes/class-routes";
import scheduleRoutes from "./routes/schedule-routes";
import classStudentRoutes from "./routes/class-student-routes";
import imageRoutes from "./routes/image-routes";
import quizEventRoutes from "./routes/quiz-events-routes";
import helperRoutes from "./routes/helper-routes";
import studentsRoutes from "./routes/student-routes";

const app = express();

/**
 * App setup: parsers, CORS
 */
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cors());

/**
 * Route mounts (prefix → router)
 * - /internal/quiz-events  → quizEventRoutes (mounted at root)
 * - /classes               → classRoutes, studentRoutes, scheduleRoutes
 * - /helper                → helperRoutes (S2S helpers)
 * - /uploads               → static files
 * - /upload                → imageRoutes (mounted at "/")
 */

app.use(quizEventRoutes);
app.use("/classes", classRoutes);
app.use("/classes", classStudentRoutes);
app.use("/classes", scheduleRoutes);
app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));
app.use("/helper", helperRoutes);
app.use("/students", studentsRoutes);
app.use("/", imageRoutes);

/** GET / — simple health check */
app.get("/", (req, res) => {
  console.log("Sending Greetings!");
  res.json({ message: "Hello World from class-service" });
});

interface ErrorWithStatus extends Error {
  status?: number;
}

/** 404 handler for unmatched routes */
app.use((req, res, next) => {
  const error: ErrorWithStatus = new Error("Route Not Found");
  error.status = 404;
  next(error);
});

/** Error serializer */
app.use(
  (error: ErrorWithStatus, req: Request, res: Response, next: NextFunction) => {
    res.status(error.status || 500).json({ error: { message: error.message } });
  }
);

export default app;
