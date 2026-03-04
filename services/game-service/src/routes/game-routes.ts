import { Router } from "express";
import {
  getClassLeaderboard,
  getServiceHealth,
  getTopLeaderboardRows,
} from "../controller/game-controller";

const router = Router();

router.get("/health", getServiceHealth);
router.get("/classes/:classId/leaderboard", getClassLeaderboard);
router.get("/classes/:classId/leaderboard/top", getTopLeaderboardRows);

export default router;
