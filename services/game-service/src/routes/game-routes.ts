import { Router } from "express";
import {
  getClassLeaderboard,
  getClassStudentProfile,
  getServiceHealth,
  getTopLeaderboardRows,
} from "../controller/game-controller";

const router = Router();

router.get("/health", getServiceHealth);
router.get("/classes/:classId/leaderboard", getClassLeaderboard);
router.get("/classes/:classId/leaderboard/top", getTopLeaderboardRows);
router.get("/classes/:classId/students/:studentId/profile", getClassStudentProfile);

export default router;
