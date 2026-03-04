import { Request, Response } from "express";

export function getServiceHealth(_req: Request, res: Response) {
  return res.status(200).json({
    ok: true,
    data: {
      service: "game-service",
      status: "healthy",
      version: "v0",
      timestamp: new Date().toISOString(),
    },
  });
}

export function getClassLeaderboard(req: Request, res: Response) {
  return res.status(501).json({
    ok: false,
    code: "NOT_IMPLEMENTED",
    message: "Class leaderboard is not implemented yet.",
    data: {
      classId: String(req.params.classId || ""),
    },
  });
}

export function getTopLeaderboardRows(req: Request, res: Response) {
  return res.status(501).json({
    ok: false,
    code: "NOT_IMPLEMENTED",
    message: "Top leaderboard rows are not implemented yet.",
    data: {
      classId: String(req.params.classId || ""),
    },
  });
}
