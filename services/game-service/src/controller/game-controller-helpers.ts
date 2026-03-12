import { Request } from "express";
import { GameStudentStatsModel } from "../model/stats/game-student-stats-model";
import { toClassObjectId } from "../utils/mongo-utils";
import { GameClassStateModel } from "../model/class/game-class-state-model";
import { ymdInTZ } from "../utils/date-utils";
import { GameAttemptModel } from "../model/events/game-attempt-model";
import { GameStudentInventoryModel } from "../model/rewards/game-student-inventory-model";
import {
  CosmeticSlot,
  buildBadgeRenderUrl,
  getBadgeById,
  parseDynamicBadgeId,
} from "../rewards/default-catalog";

export type CanonicalBlock = {
  attemptId: string;
  score: number;
  maxScore: number;
  finishedAt: Date;
  subject?: string;
  topic?: string;
};

export type LeaderboardRow = {
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

export type LeaderboardPeriod = "overall" | "week" | "month";

type ClassRosterRow = {
  userId: string;
  displayName?: string | null;
};

export function buildBadgePayload(classId: string, badgeId: string) {
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

export function toPct(score: number, maxScore: number) {
  if (maxScore <= 0) return 0;
  return (score / maxScore) * 100;
}

export function toWholeScore(value: unknown) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n);
}

export function parseLimit(input: unknown, fallback = 3) {
  const n = Number(input);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.min(10, Math.trunc(n)));
}

export function parsePeriod(input: unknown): LeaderboardPeriod {
  const v = String(input || "").trim().toLowerCase();
  if (v === "week") return "week";
  if (v === "month") return "month";
  return "overall";
}

export function keyFromDayIndex(idx: number) {
  const dt = new Date(idx * 86400000);
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const d = String(dt.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function weekStartKeyForDateKey(dateKey: string) {
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

export function getAuthHeader(req: Request): string | null {
  const header = req.headers.authorization;
  if (Array.isArray(header)) {
    const first = header[0];
    return typeof first === "string" && first.trim() ? first.trim() : null;
  }
  if (typeof header === "string" && header.trim()) return header.trim();
  return null;
}

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

export async function buildLeaderboardRows(
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
      overallScore: toWholeScore(overallScore),
      avgScorePct,
      participationPct,
      participationCount,
      currentStreak,
      bestStreakDays: Number(row.bestStreakDays || 0),
      lastStreakDate: row.lastStreakDate ? new Date(row.lastStreakDate) : null,
    };
  });
}

export function leaderboardSort(a: LeaderboardRow, b: LeaderboardRow) {
  if (b.overallScore !== a.overallScore) return b.overallScore - a.overallScore;
  if (b.currentStreak !== a.currentStreak) return b.currentStreak - a.currentStreak;
  return a.userId.localeCompare(b.userId);
}

export function withRanks(rows: LeaderboardRow[]) {
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

export function hasStudentInState(
  students: Record<string, boolean> | Map<string, boolean> | undefined,
  studentId: string
) {
  if (!students) return false;
  if (students instanceof Map) return students.has(studentId);
  return !!students[studentId];
}

export type { CosmeticSlot };
