import { Request, Response } from "express";
import { GameStudentStatsModel } from "../model/stats/game-student-stats-model";
import { toClassObjectId } from "../utils/mongo-utils";
import { GameClassStateModel } from "../model/class/game-class-state-model";
import { ymdInTZ } from "../utils/date-utils";

type CanonicalBlock = {
  attemptId: string;
  score: number;
  maxScore: number;
  finishedAt: Date;
  subject?: string;
  topic?: string;
};

type LeaderboardRow = {
  userId: string;
  displayName: string;
  photoUrl: string | null;
  className: string;
  overallScore: number;
  avgScorePct: number;
  participationPct: number;
  participationCount: number;
  currentStreak: number;
  bestStreakDays: number;
  lastStreakDate: Date | null;
};

function toPct(score: number, maxScore: number) {
  if (maxScore <= 0) return 0;
  return (score / maxScore) * 100;
}

function parseLimit(input: unknown, fallback = 3) {
  const n = Number(input);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.min(10, Math.trunc(n)));
}

function computeCurrentStreak(lastStreakDate: Date | null | undefined, streakDays: number, timezone: string) {
  if (!lastStreakDate) return 0;

  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);

  const todayKey = ymdInTZ(now, timezone);
  const yesterdayKey = ymdInTZ(yesterday, timezone);
  const lastKey = ymdInTZ(new Date(lastStreakDate), timezone);

  if (lastKey === todayKey || lastKey === yesterdayKey) {
    return Number(streakDays || 0);
  }
  return 0;
}

async function buildLeaderboardRows(classId: string): Promise<LeaderboardRow[]> {
  const classObjId = toClassObjectId(classId);

  const [statsRows, classState] = await Promise.all([
    GameStudentStatsModel.find({ classId: classObjId })
      .select({
        studentId: 1,
        overallScore: 1,
        streakDays: 1,
        bestStreakDays: 1,
        lastStreakDate: 1,
        canonicalBySchedule: 1,
      })
      .lean<
        Array<{
          studentId: string;
          overallScore?: number;
          streakDays?: number;
          bestStreakDays?: number;
          lastStreakDate?: Date | null;
          canonicalBySchedule?: Record<string, CanonicalBlock>;
        }>
      >(),
    GameClassStateModel.findOne({ classId })
      .select({ name: 1, timezone: 1, schedules: 1 })
      .lean<{
        name?: string;
        timezone?: string;
        schedules?: Record<string, { startDate?: Date }>;
      } | null>(),
  ]);

  const className = String(classState?.name || "");
  const timezone = String(classState?.timezone || "Asia/Singapore");

  const now = new Date();
  const eligibleAssigned = Object.values(classState?.schedules || {}).filter(
    (s) => s?.startDate && new Date(s.startDate) <= now
  ).length;

  return statsRows.map((row) => {
    const canonicalRows = Object.values(row.canonicalBySchedule || {});
    const participationCount = canonicalRows.length;

    const sums = canonicalRows.reduce(
      (acc, can) => {
        acc.sumScore += Number(can?.score || 0);
        acc.sumMax += Number(can?.maxScore || 0);
        return acc;
      },
      { sumScore: 0, sumMax: 0 }
    );

    const avgScorePct = toPct(sums.sumScore, sums.sumMax);
    const participationPct =
      eligibleAssigned > 0
        ? (Math.min(participationCount, eligibleAssigned) / eligibleAssigned) * 100
        : 0;

    const currentStreak = computeCurrentStreak(
      row.lastStreakDate,
      Number(row.streakDays || 0),
      timezone
    );

    return {
      userId: String(row.studentId),
      displayName: String(row.studentId),
      photoUrl: null,
      className,
      overallScore: Number(row.overallScore || 0),
      avgScorePct,
      participationPct,
      participationCount,
      currentStreak,
      bestStreakDays: Number(row.bestStreakDays || 0),
      lastStreakDate: row.lastStreakDate ? new Date(row.lastStreakDate) : null,
    };
  });
}

function leaderboardSort(a: LeaderboardRow, b: LeaderboardRow) {
  if (b.overallScore !== a.overallScore) return b.overallScore - a.overallScore;
  if (b.currentStreak !== a.currentStreak) return b.currentStreak - a.currentStreak;
  return a.userId.localeCompare(b.userId);
}

function withRanks(rows: LeaderboardRow[]) {
  const sorted = rows.slice().sort(leaderboardSort);
  let seen = 0;
  let rank = 0;
  let prev: LeaderboardRow | null = null;

  return sorted.map((row) => {
    seen += 1;
    if (
      !prev ||
      prev.overallScore !== row.overallScore ||
      prev.currentStreak !== row.currentStreak
    ) {
      rank = seen;
    }
    prev = row;
    return { rank, ...row };
  });
}

function hasStudentInState(
  students: Record<string, boolean> | Map<string, boolean> | undefined,
  studentId: string
) {
  if (!students) return false;
  if (students instanceof Map) return students.has(studentId);
  return !!students[studentId];
}

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

export async function getClassLeaderboard(req: Request, res: Response) {
  try {
    const classId = String(req.params.classId || "");
    if (!classId) {
      return res.status(400).json({ ok: false, message: "Missing classId" });
    }

    const rows = await buildLeaderboardRows(classId);

    const sorted = withRanks(rows);

    return res.status(200).json({
      ok: true,
      data: sorted,
    });
  } catch (e: any) {
    const message = typeof e?.message === "string" ? e.message : "Internal error";
    const status = message.includes("Invalid classId") ? 400 : 500;
    return res.status(status).json({ ok: false, message });
  }
}

export async function getTopLeaderboardRows(req: Request, res: Response) {
  try {
    const classId = String(req.params.classId || "");
    if (!classId) {
      return res.status(400).json({ ok: false, message: "Missing classId" });
    }

    const limit = parseLimit(req.query.limit, 3);
    const rows = await buildLeaderboardRows(classId);

    const topOverallScore = rows
      .slice()
      .sort(leaderboardSort)
      .slice(0, limit)
      .map((r) => ({
        userId: r.userId,
        displayName: r.displayName,
        photoUrl: r.photoUrl,
        className: r.className,
        overallScore: r.overallScore,
        avgScorePct: r.avgScorePct,
        participationPct: r.participationPct,
      }));

    const topParticipation = rows
      .slice()
      .sort((a, b) => {
        if (b.participationPct !== a.participationPct) {
          return b.participationPct - a.participationPct;
        }
        if (b.participationCount !== a.participationCount) {
          return b.participationCount - a.participationCount;
        }
        return a.userId.localeCompare(b.userId);
      })
      .slice(0, limit)
      .map((r) => ({
        userId: r.userId,
        displayName: r.displayName,
        photoUrl: r.photoUrl,
        className: r.className,
        participationPct: r.participationPct,
        participationCount: r.participationCount,
      }));

    const topStreak = rows
      .slice()
      .sort((a, b) => {
        if (b.currentStreak !== a.currentStreak) return b.currentStreak - a.currentStreak;
        if (b.bestStreakDays !== a.bestStreakDays) return b.bestStreakDays - a.bestStreakDays;
        return a.userId.localeCompare(b.userId);
      })
      .slice(0, limit)
      .map((r) => ({
        userId: r.userId,
        displayName: r.displayName,
        photoUrl: r.photoUrl,
        className: r.className,
        currentStreak: r.currentStreak,
      }));

    return res.status(200).json({
      ok: true,
      data: {
        topOverallScore,
        topParticipation,
        topStreak,
      },
    });
  } catch (e: any) {
    const message = typeof e?.message === "string" ? e.message : "Internal error";
    const status = message.includes("Invalid classId") ? 400 : 500;
    return res.status(status).json({ ok: false, message });
  }
}

export async function getClassStudentProfile(req: Request, res: Response) {
  try {
    const classId = String(req.params.classId || "");
    const studentId = String(req.params.studentId || "");

    if (!classId) {
      return res.status(400).json({ ok: false, message: "Missing classId" });
    }
    if (!studentId) {
      return res.status(400).json({ ok: false, message: "Missing studentId" });
    }

    const classObjId = toClassObjectId(classId);

    const [classState, stats, rankedRows] = await Promise.all([
      GameClassStateModel.findOne({ classId })
        .select({ name: 1, timezone: 1, students: 1 })
        .lean<{
          name?: string;
          timezone?: string;
          students?: Record<string, boolean>;
        } | null>(),
      GameStudentStatsModel.findOne({ classId: classObjId, studentId })
        .select({
          overallScore: 1,
          bestStreakDays: 1,
          lastStreakDate: 1,
          canonicalBySchedule: 1,
        })
        .lean<{
          overallScore?: number;
          bestStreakDays?: number;
          lastStreakDate?: Date | null;
          canonicalBySchedule?: Record<
            string,
            { score?: number; maxScore?: number; finishedAt?: Date }
          >;
        } | null>(),
      buildLeaderboardRows(classId).then(withRanks),
    ]);

    if (!classState) {
      return res.status(404).json({ ok: false, message: "Class not found" });
    }

    const onRoster = hasStudentInState(classState.students as any, studentId);
    if (!onRoster) {
      const hasProjectedData =
        !!stats || rankedRows.some((r) => String(r.userId) === studentId);
      if (!hasProjectedData) {
        return res
          .status(404)
          .json({ ok: false, message: "Student not found in class" });
      }
    }

    const row = rankedRows.find((r) => String(r.userId) === studentId);
    const canonicalRows = Object.values(stats?.canonicalBySchedule || {});
    const canonicalSums = canonicalRows.reduce(
      (acc, can) => {
        acc.sumScore += Number(can?.score || 0);
        acc.sumMax += Number(can?.maxScore || 0);
        return acc;
      },
      { sumScore: 0, sumMax: 0 }
    );

    const fallbackOverallScore = Number(stats?.overallScore || 0);
    const fallbackParticipationCount = canonicalRows.length;
    const fallbackAvgScorePct = toPct(canonicalSums.sumScore, canonicalSums.sumMax);

    return res.status(200).json({
      ok: true,
      data: {
        classId,
        className: String(classState.name || ""),
        timezone: String(classState.timezone || "Asia/Singapore"),
        studentId,
        rank: typeof row?.rank === "number" ? row.rank : null,
        overallScore:
          typeof row?.overallScore === "number" ? row.overallScore : fallbackOverallScore,
        participationCount:
          typeof row?.participationCount === "number"
            ? row.participationCount
            : fallbackParticipationCount,
        participationPct:
          typeof row?.participationPct === "number" ? row.participationPct : 0,
        avgScorePct:
          typeof row?.avgScorePct === "number" ? row.avgScorePct : fallbackAvgScorePct,
        currentStreak: typeof row?.currentStreak === "number" ? row.currentStreak : 0,
        bestStreakDays:
          typeof row?.bestStreakDays === "number"
            ? row.bestStreakDays
            : Number(stats?.bestStreakDays || 0),
        lastStreakDate: row?.lastStreakDate || stats?.lastStreakDate || null,
      },
    });
  } catch (e: any) {
    const message = typeof e?.message === "string" ? e.message : "Internal error";
    const status = message.includes("Invalid classId") ? 400 : 500;
    return res.status(status).json({ ok: false, message });
  }
}
