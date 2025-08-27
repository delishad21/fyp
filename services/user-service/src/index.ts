import express from "express";
import cors from "cors";
import { Request, Response, NextFunction } from "express";

import userRoutes from "./routes/webapp-user-routes";
import authRoutes from "./routes/webapp-auth-routes";

const app = express();

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cors()); // config cors so that front-end can use

app.use("/webapp/users", userRoutes);
app.use("/webapp/auth", authRoutes);

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
