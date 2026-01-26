import express from "express";
import cors from "cors";
import { Request, Response, NextFunction } from "express";
import generationRoutes from "./routes/generation-routes";

const app = express();

/**
 * App setup: parsers, CORS
 */
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cors());

/**
 * Route mounts (prefix → router)
 * - /  -> generationRoutes (mounted at root for consistent proxy pattern)
 */
app.use("/", generationRoutes);

/** GET / — simple health check */
app.get("/", (req, res) => {
  console.log("Sending Greetings!");
  res.json({ message: "Hello World from ai-service" });
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
    res.status(error.status || 500).json({
      error: {
        message: error.message,
        stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
      },
    });
  },
);

export default app;
