import express from "express";
import cors from "cors";
import { Request, Response, NextFunction } from "express";

import authRoutes from "./routes/auth-routes";
import teacherUserRoutes from "./routes/teacher-user-routes";
import teacherAuthRoutes from "./routes/teacher-auth-routes";
import studentUserRoutes from "./routes/student-user-routes";
import studentAuthRoutes from "./routes/student-auth-routes";

const app = express();

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cors()); // config cors so that front-end can use

app.use("/auth", authRoutes);
app.use("/teacher/users", teacherUserRoutes);
app.use("/teacher/auth", teacherAuthRoutes);
app.use("/student/users", studentUserRoutes);
app.use("/student/auth", studentAuthRoutes);

app.get("/", (req, res, next) => {
  console.log("Sending Greetings!");
  res.json({
    message: "Hello World from user-service",
  });
});

interface ErrorWithStatus extends Error {
  status?: number;
}

// Handle When No Route Match Is Found
app.use((req, res, next) => {
  const error: ErrorWithStatus = new Error("Route Not Found");
  error.status = 404;
  next(error);
});

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
