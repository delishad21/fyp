import { Request, Response } from "express";
import { GameStudentStatsModel } from "../model/stats/game-student-stats-model";
import { toClassObjectId } from "../utils/mongo-utils";
import { GameClassStateModel } from "../model/class/game-class-state-model";
import { ymdInTZ } from "../utils/date-utils";
import { GameAttemptOutcomeModel } from "../model/events/game-attempt-outcome-model";
import { GameAttemptModel } from "../model/events/game-attempt-model";
import { GameRewardGrantModel } from "../model/rewards/game-reward-grant-model";
import { GameStudentInventoryModel } from "../model/rewards/game-student-inventory-model";
import {
  buildBadgeRenderUrl,
  CosmeticSlot,
  getBadgeById,
  getCosmeticById,
  getEmptyEquippedSlots,
  parseDynamicBadgeId,
  resolveAvatarAssetUrl,
} from "../rewards/default-catalog";

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

function buildBadgePayload(classId: string, badgeId: string) {
  const badge = getBadgeById(badgeId);
  if (!badge) return null;
  return {
    id: badge.id,
    name: badge.name,
    description: badge.description,
    color: badge.color,
    kind: badge.kind || parseDynamicBadgeId(badge.id)?.kind || "static",
    engraving: badge.engraving || parseDynamicBadgeId(badge.id)?.engraving || null,
    imageUrl: buildBadgeRenderUrl(classId, badge.id),
  };
}

function toPct(score: number, maxScore: number) {
  if (maxScore <= 0) return 0;
  return (score / maxScore) * 100;
}

function parseLimit(input: unknown, fallback = 3) {
  const n = Number(input);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.min(10, Math.trunc(n)));
}

type LeaderboardPeriod = "overall" | "week" | "month";

function parsePeriod(input: unknown): LeaderboardPeriod {
  const v = String(input || "").trim().toLowerCase();
  if (v === "week") return "week";
  if (v === "month") return "month";
  return "overall";
}

function keyFromDayIndex(idx: number) {
  const dt = new Date(idx * 86400000);
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const d = String(dt.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function weekStartKeyForDateKey(dateKey: string) {
  const [y, m, d] = String(dateKey || "")
    .split("-")
    .map((n) => Number(n));
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) {
    return dateKey;
  }
  const utc = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
  const dow = utc.getUTCDay();
  const diff = (dow + 6) % 7;
  const dayIdx = Math.floor(Date.UTC(y, (m || 1) - 1, d || 1) / 86400000);
  return keyFromDayIndex(dayIdx - diff);
}

function getAuthHeader(req: Request): string | null {
  const header = req.headers.authorization;
  if (Array.isArray(header)) {
    const first = header[0];
    return typeof first === "string" && first.trim() ? first.trim() : null;
  }
  if (typeof header === "string" && header.trim()) return header.trim();
  return null;
}

type ClassRosterRow = {
  userId: string;
  displayName?: string | null;
};

async function fetchClassRosterDisplayNameMap(
  classId: string,
  authHeader: string | null
): Promise<Map<string, string>> {
  const classSvcBase = String(process.env.CLASS_SVC_URL || "").replace(/\/+$/, "");
  if (!classSvcBase || !authHeader) return new Map();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000);

  try {
    const url = `${classSvcBase}/classes/${encodeURIComponent(classId)}/students-roster`;
    const resp = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: authHeader,
        Accept: "application/json",
      },
      signal: controller.signal,
    });

    if (!resp.ok) return new Map();
    const json = (await resp.json().catch(() => null)) as
      | { ok?: boolean; data?: ClassRosterRow[] }
      | null;
    if (!json?.ok || !Array.isArray(json.data)) return new Map();

    return new Map(
      json.data.map((row) => [
        String(row.userId),
        String(row.displayName || row.userId),
      ])
    );
  } catch {
    return new Map();
  } finally {
    clearTimeout(timeout);
  }
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

async function buildLeaderboardRows(
  classId: string,
  authHeader: string | null = null,
  period: LeaderboardPeriod = "overall"
): Promise<LeaderboardRow[]> {
  const classObjId = toClassObjectId(classId);

  const [statsRows, classState, displayNameByStudentId] = await Promise.all([
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
    fetchClassRosterDisplayNameMap(classId, authHeader),
  ]);

  const inventories = await GameStudentInventoryModel.find({ classId })
    .select({ studentId: 1, avatarUrl: 1 })
    .lean<Array<{ studentId: string; avatarUrl?: string | null }>>();
  const avatarByStudentId = new Map<string, string | null>(
    inventories.map((row) => [String(row.studentId), row.avatarUrl || null])
  );

  const className = String(classState?.name || "");
  const timezone = String(classState?.timezone || "Asia/Singapore");

  const now = new Date();
  const todayKey = ymdInTZ(now, timezone);
  const currentWeekStartKey = weekStartKeyForDateKey(todayKey);
  const currentMonthKey = String(todayKey || "").slice(0, 7);
  const eligibleAssigned = Object.values(classState?.schedules || {}).filter(
    (s) => s?.startDate && new Date(s.startDate) <= now
  ).length;

  const scheduleContributions = new Map<string, number>();
  for (const [scheduleId, schedule] of Object.entries(classState?.schedules || {})) {
    const contribution = Number((schedule as any)?.contribution);
    scheduleContributions.set(
      scheduleId,
      Number.isFinite(contribution) ? contribution : 100
    );
  }

  const periodMetricsByStudent = new Map<
    string,
    { overallScore: number; sumScore: number; sumMax: number; participationCount: number }
  >();
  if (period === "week" || period === "month") {
    const rangeDays = period === "week" ? 16 : 80;
    const cutoff = new Date(Date.now() - rangeDays * 86400000);
    const attempts = await GameAttemptModel.find({
      classId,
      valid: true,
      finishedAt: { $gte: cutoff },
    })
      .select({ studentId: 1, scheduleId: 1, score: 1, maxScore: 1, finishedAt: 1 })
      .lean<
        Array<{
          studentId?: string;
          scheduleId?: string;
          score?: number;
          maxScore?: number;
          finishedAt?: Date;
        }>
      >();

    const bestByStudentSchedule = new Map<
      string,
      { studentId: string; scheduleId: string; score: number; maxScore: number }
    >();
    for (const attempt of attempts) {
      const finishedAt = attempt.finishedAt ? new Date(attempt.finishedAt) : null;
      if (!finishedAt) continue;

      const dayKey = ymdInTZ(finishedAt, timezone);
      const inPeriod =
        period === "week"
          ? weekStartKeyForDateKey(dayKey) === currentWeekStartKey
          : String(dayKey || "").slice(0, 7) === currentMonthKey;
      if (!inPeriod) continue;

      const studentId = String(attempt.studentId || "");
      const scheduleId = String(attempt.scheduleId || "");
      if (!studentId || !scheduleId) continue;

      const score = Number(attempt.score || 0);
      const maxScore = Number(attempt.maxScore || 0);
      const key = `${studentId}::${scheduleId}`;
      const prev = bestByStudentSchedule.get(key);
      if (!prev || score > prev.score) {
        bestByStudentSchedule.set(key, {
          studentId,
          scheduleId,
          score,
          maxScore,
        });
      }
    }

    for (const best of bestByStudentSchedule.values()) {
      const contribution = Number(scheduleContributions.get(best.scheduleId) || 100);
      const pct = best.maxScore > 0 ? best.score / best.maxScore : 0;
      const cur = periodMetricsByStudent.get(best.studentId) || {
        overallScore: 0,
        sumScore: 0,
        sumMax: 0,
        participationCount: 0,
      };
      cur.overallScore += pct * contribution;
      cur.sumScore += best.score;
      cur.sumMax += best.maxScore;
      cur.participationCount += 1;
      periodMetricsByStudent.set(best.studentId, cur);
    }
  }

  return statsRows.map((row) => {
    let participationCount = 0;
    let sumScore = 0;
    let sumMax = 0;
    let overallScore = Number(row.overallScore || 0);

    if (period === "overall") {
      const canonicalRows = Object.values(row.canonicalBySchedule || {});
      participationCount = canonicalRows.length;
      const sums = canonicalRows.reduce(
        (acc, can) => {
          acc.sumScore += Number(can?.score || 0);
          acc.sumMax += Number(can?.maxScore || 0);
          return acc;
        },
        { sumScore: 0, sumMax: 0 }
      );
      sumScore = sums.sumScore;
      sumMax = sums.sumMax;
    } else {
      const metric = periodMetricsByStudent.get(String(row.studentId));
      participationCount = Number(metric?.participationCount || 0);
      sumScore = Number(metric?.sumScore || 0);
      sumMax = Number(metric?.sumMax || 0);
      overallScore = Number(metric?.overallScore || 0);
    }

    const avgScorePct = toPct(sumScore, sumMax);
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
      displayName:
        displayNameByStudentId.get(String(row.studentId)) || String(row.studentId),
      photoUrl: avatarByStudentId.get(String(row.studentId)) || null,
      className,
      overallScore,
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

    const period = parsePeriod(req.query.period);
    const rows = await buildLeaderboardRows(classId, getAuthHeader(req), period);

    const sorted = withRanks(rows);

    return res.status(200).json({
      ok: true,
      data: sorted,
      meta: { period },
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

    const period = parsePeriod(req.query.period);
    const limit = parseLimit(req.query.limit, 3);
    const rows = await buildLeaderboardRows(classId, getAuthHeader(req), period);

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
        period,
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

    const [classState, stats, inventory, rankedRows] = await Promise.all([
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
      GameStudentInventoryModel.findOne({ classId, studentId })
        .select({
          avatarUrl: 1,
          avatarSpec: 1,
          ownedBadgeIds: 1,
          displayBadgeIds: 1,
          ownedCosmeticIds: 1,
          equipped: 1,
          scoreThresholdProgress: 1,
        })
        .lean<{
          avatarUrl?: string | null;
          avatarSpec?: unknown;
          ownedBadgeIds?: string[];
          displayBadgeIds?: string[];
          ownedCosmeticIds?: string[];
          equipped?: Partial<Record<CosmeticSlot, string | null>>;
          scoreThresholdProgress?: {
            pointsPerReward?: number | null;
            nextThresholdPoints?: number | null;
          } | null;
        } | null>(),
      buildLeaderboardRows(classId, getAuthHeader(req)).then(withRanks),
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
    const ownedBadgeIds = Array.isArray(inventory?.ownedBadgeIds)
      ? inventory.ownedBadgeIds.map((id) => String(id))
      : [];
    const displayBadgeIds = Array.isArray(inventory?.displayBadgeIds)
      ? inventory.displayBadgeIds.map((id) => String(id))
      : [];
    const normalizedDisplayBadgeIds = displayBadgeIds
      .filter((badgeId) => ownedBadgeIds.includes(badgeId))
      .slice(0, 4);
    const displayBadges = normalizedDisplayBadgeIds
      .map((badgeId) => buildBadgePayload(classId, badgeId))
      .filter(Boolean);

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
        avatarUrl: inventory?.avatarUrl || row?.photoUrl || null,
        avatarSpec: inventory?.avatarSpec || null,
        badges: normalizedDisplayBadgeIds,
        ownedBadgeIds,
        displayBadgeIds: normalizedDisplayBadgeIds,
        displayBadges,
        cosmetics: Array.isArray(inventory?.ownedCosmeticIds)
          ? inventory?.ownedCosmeticIds
          : [],
        equipped: inventory?.equipped || getEmptyEquippedSlots(),
        scoreThresholdProgress: inventory?.scoreThresholdProgress
          ? {
              pointsPerReward: Number(
                inventory.scoreThresholdProgress.pointsPerReward || 0
              ),
              nextThresholdPoints: Number(
                inventory.scoreThresholdProgress.nextThresholdPoints || 0
              ),
            }
          : null,
      },
    });
  } catch (e: any) {
    const message = typeof e?.message === "string" ? e.message : "Internal error";
    const status = message.includes("Invalid classId") ? 400 : 500;
    return res.status(status).json({ ok: false, message });
  }
}

export async function getStudentAttemptOutcome(req: Request, res: Response) {
  try {
    const classId = String(req.params.classId || "").trim();
    const studentId = String(req.params.studentId || "").trim();
    const attemptId = String(req.params.attemptId || "").trim();

    if (!classId) {
      return res.status(400).json({ ok: false, message: "Missing classId" });
    }
    if (!studentId) {
      return res.status(400).json({ ok: false, message: "Missing studentId" });
    }
    if (!attemptId) {
      return res.status(400).json({ ok: false, message: "Missing attemptId" });
    }

    const outcome = await GameAttemptOutcomeModel.findOne({
      classId,
      studentId,
      attemptId,
    })
      .select({
        classId: 1,
        studentId: 1,
        scheduleId: 1,
        attemptId: 1,
        attemptVersion: 1,
        quizScore: 1,
        quizMaxScore: 1,
        overallScoreBefore: 1,
        overallScoreAfter: 1,
        rankBefore: 1,
        rankAfter: 1,
        processedAt: 1,
      })
      .lean<{
        classId: string;
        studentId: string;
        scheduleId: string;
        attemptId: string;
        attemptVersion: number;
        quizScore?: number;
        quizMaxScore?: number;
        overallScoreBefore?: number;
        overallScoreAfter?: number;
        rankBefore?: number | null;
        rankAfter?: number | null;
        processedAt?: Date;
      } | null>();

    if (!outcome) {
      const attemptRow = await GameAttemptModel.findOne({ attemptId })
        .select({ classId: 1, studentId: 1 })
        .lean<{ classId?: string; studentId?: string } | null>();

      if (
        attemptRow &&
        (String(attemptRow.classId || "") !== classId ||
          String(attemptRow.studentId || "") !== studentId)
      ) {
        return res.status(404).json({
          ok: false,
          message: "Attempt does not belong to this class/student",
        });
      }

      return res.status(200).json({
        ok: true,
        data: {
          classId,
          studentId,
          attemptId,
          ready: false,
        },
      });
    }

    const [rewardRows, inventory] = await Promise.all([
      GameRewardGrantModel.find({
        classId,
        studentId,
        triggerAttemptId: attemptId,
        source: { $in: ["score_threshold", "rule"] },
      })
        .select({
          rewardId: 1,
          rewardType: 1,
          thresholdPoints: 1,
          grantedAt: 1,
        })
        .sort({ grantedAt: 1, _id: 1 })
        .lean<
          Array<{
            rewardId: string;
            rewardType: "cosmetic" | "badge";
            thresholdPoints?: number | null;
            grantedAt?: Date;
          }>
        >(),
      GameStudentInventoryModel.findOne({ classId, studentId })
        .select({
          scoreThresholdProgress: 1,
        })
        .lean<{
          scoreThresholdProgress?: {
            pointsPerReward?: number | null;
            nextThresholdPoints?: number | null;
          } | null;
        } | null>(),
    ]);

    const rewards = rewardRows
      .map((row) => {
        const rewardId = String(row.rewardId || "");
        if (!rewardId) return null;

        const cosmetic = getCosmeticById(rewardId);
        if (cosmetic) {
          return {
            rewardId,
            rewardType: "cosmetic" as const,
            thresholdPoints: Number(row.thresholdPoints || 0),
            grantedAt: row.grantedAt || new Date(),
            reward: {
              id: cosmetic.id,
              name: cosmetic.name,
              description: cosmetic.description,
              color: cosmetic.color,
              slot: cosmetic.slot,
              assetPath: cosmetic.assetPath,
              assetUrl: resolveAvatarAssetUrl(cosmetic.assetPath),
            },
          };
        }

        const badge = getBadgeById(rewardId);
        if (badge) {
          return {
            rewardId,
            rewardType: "badge" as const,
            thresholdPoints: Number(row.thresholdPoints || 0),
            grantedAt: row.grantedAt || new Date(),
            reward: {
              id: badge.id,
              name: badge.name,
              description: badge.description,
              color: badge.color,
              engraving:
                badge.engraving || parseDynamicBadgeId(badge.id)?.engraving || null,
              imageUrl: buildBadgeRenderUrl(classId, badge.id),
            },
          };
        }

        return null;
      })
      .filter(Boolean);

    const rankBefore =
      typeof outcome.rankBefore === "number" ? Number(outcome.rankBefore) : null;
    const rankAfter =
      typeof outcome.rankAfter === "number" ? Number(outcome.rankAfter) : null;
    const overallScoreBefore = Number(outcome.overallScoreBefore || 0);
    const overallScoreAfter = Number(outcome.overallScoreAfter || 0);

    const rankDelta =
      typeof rankBefore === "number" && typeof rankAfter === "number"
        ? rankBefore - rankAfter
        : null;

    return res.status(200).json({
      ok: true,
      data: {
        classId,
        studentId,
        scheduleId: outcome.scheduleId,
        attemptId,
        attemptVersion: Number(outcome.attemptVersion || 1),
        ready: true,
        quizScore: Number(outcome.quizScore || 0),
        quizMaxScore: Number(outcome.quizMaxScore || 0),
        overallScoreBefore,
        overallScoreAfter,
        overallScoreDelta: overallScoreAfter - overallScoreBefore,
        rankBefore,
        rankAfter,
        rankDelta,
        rewards,
        scoreThresholdProgress: inventory?.scoreThresholdProgress
          ? {
              pointsPerReward: Number(
                inventory.scoreThresholdProgress.pointsPerReward || 0
              ),
              nextThresholdPoints: Number(
                inventory.scoreThresholdProgress.nextThresholdPoints || 0
              ),
            }
          : null,
        processedAt: outcome.processedAt || null,
      },
    });
  } catch (e: any) {
    const message = typeof e?.message === "string" ? e.message : "Internal error";
    const status = message.includes("Invalid classId") ? 400 : 500;
    return res.status(status).json({ ok: false, message });
  }
}
