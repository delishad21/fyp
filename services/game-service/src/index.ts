import cors from "cors";
import express, { NextFunction, Request, Response } from "express";
import path from "path";
import gameRoutes from "./routes/game-routes";

const app = express();

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cors());

const avatarAssetDir =
  String(process.env.GAME_AVATAR_ASSET_DIR || "").trim() ||
  path.resolve(__dirname, "../assets/avatar");
app.use("/avatar-assets", express.static(avatarAssetDir, { maxAge: "1h" }));
app.use("/api/game/avatar-assets", express.static(avatarAssetDir, { maxAge: "1h" }));

app.use("/", gameRoutes);
app.use("/api/game", gameRoutes);

app.get("/", (_req, res) => {
  res.json({ message: "Hello from game-service" });
});

interface ErrorWithStatus extends Error {
  status?: number;
}

app.use((_req, _res, next) => {
  const error: ErrorWithStatus = new Error("Route Not Found");
  error.status = 404;
  next(error);
});

app.use(
  (error: ErrorWithStatus, _req: Request, res: Response, _next: NextFunction) => {
    res.status(error.status || 500).json({ error: { message: error.message } });
  }
);

export default app;
