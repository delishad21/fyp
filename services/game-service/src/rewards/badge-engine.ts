import mongoose, { ClientSession } from "mongoose";
import { GameBadgeConfigModel } from "../model/rewards/game-badge-config-model";
import { GameBadgePeriodAwardModel } from "../model/rewards/game-badge-period-award-model";
import { GameStudentStatsModel } from "../model/stats/game-student-stats-model";
import { GameRewardGrantModel } from "../model/rewards/game-reward-grant-model";
import { GameStudentNotificationModel } from "../model/rewards/game-student-notification-model";
import { GameClassStateModel } from "../model/class/game-class-state-model";
import { GameAttemptModel } from "../model/events/game-attempt-model";
import {
  buildMonthlyTopBadgeId,
  buildOverallThresholdBadgeId,
  buildStreakThresholdBadgeId,
  buildWeeklyTopBadgeId,
  parseDynamicBadgeId,
} from "./default-catalog";
import { toClassObjectId } from "../utils/mongo-utils";
import { ymdInTZ, dayIndex } from "../utils/date-utils";
import { ensureStudentInventory } from "./reward-engine";

type BadgeConfig = {
  classId: string;
  weeklyTopEnabled: boolean;
  monthlyTopEnabled: boolean;
  overallScoreThresholdEnabled: boolean;
  streakThresholdEnabled: boolean;
  overallScoreThresholdStep: number;
  streakThresholdStep: number;
};

const DEFAULT_BADGE_CONFIG: Omit<BadgeConfig, "classId"> = {
  weeklyTopEnabled: false,
  monthlyTopEnabled: true,
  overallScoreThresholdEnabled: true,
  streakThresholdEnabled: true,
  overallScoreThresholdStep: 1000,
  streakThresholdStep: 25,
};

const MAX_DISPLAY_BADGES = 4;

function normalizeStep(value: unknown, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return Math.max(1, Math.floor(fallback));
  return Math.max(1, Math.floor(parsed));
}

function normalizeUnique(values: string[]) {
  return Array.from(
    new Set(values.map((v) => String(v || "").trim()).filter(Boolean))
  );
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
  return keyFromDayIndex(dayIndex(dateKey) - diff);
}

function monthKeyForDateKey(dateKey: string) {
  return String(dateKey || "").slice(0, 7);
}

function shiftMonth(monthKey: string, offset: number) {
  const [yearStr, monthStr] = String(monthKey || "").split("-");
  const y = Number(yearStr);
  const m = Number(monthStr);
  if (!Number.isFinite(y) || !Number.isFinite(m)) return monthKey;
  const dt = new Date(Date.UTC(y, (m || 1) - 1 + offset, 1));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}`;
}

function isThresholdBadgeId(id: string) {
  const parsed = parseDynamicBadgeId(id);
  return parsed?.kind === "overall_threshold" || parsed?.kind === "streak_threshold";
}

function todayKeys(now: Date, timezone: string) {
  const todayKey = ymdInTZ(now, timezone);
  const currentWeekStart = weekStartKeyForDateKey(todayKey);
  const previousWeekStart = keyFromDayIndex(dayIndex(currentWeekStart) - 7);
  const currentMonth = monthKeyForDateKey(todayKey);
  const previousMonth = shiftMonth(currentMonth, -1);
  return {
    todayKey,
    currentWeekStart,
    previousWeekStart,
    currentMonth,
    previousMonth,
  };
}

export async function ensureBadgeConfig(classId: string, session?: ClientSession) {
  await GameBadgeConfigModel.updateOne(
    { classId },
    {
      $setOnInsert: {
        classId,
        ...DEFAULT_BADGE_CONFIG,
        updatedAt: new Date(),
        updatedBy: null,
      },
    },
    { upsert: true, session }
  );
}

export async function getBadgeConfig(
  classId: string,
  session?: ClientSession
): Promise<BadgeConfig> {
  await ensureBadgeConfig(classId, session);

  const query = GameBadgeConfigModel.findOne({ classId })
    .select({
      classId: 1,
      weeklyTopEnabled: 1,
      monthlyTopEnabled: 1,
      overallScoreThresholdEnabled: 1,
      streakThresholdEnabled: 1,
      overallScoreThresholdStep: 1,
      streakThresholdStep: 1,
    })
    .lean<Partial<BadgeConfig> | null>();

  if (session) query.session(session);
  const row = await query;

  return {
    classId,
    weeklyTopEnabled: row?.weeklyTopEnabled === true,
    monthlyTopEnabled: row?.monthlyTopEnabled !== false,
    overallScoreThresholdEnabled: row?.overallScoreThresholdEnabled !== false,
    streakThresholdEnabled: row?.streakThresholdEnabled !== false,
    overallScoreThresholdStep: normalizeStep(
      row?.overallScoreThresholdStep,
      DEFAULT_BADGE_CONFIG.overallScoreThresholdStep
    ),
    streakThresholdStep: normalizeStep(
      row?.streakThresholdStep,
      DEFAULT_BADGE_CONFIG.streakThresholdStep
    ),
  };
}

export async function updateBadgeConfig(
  classId: string,
  payload: Partial<{
    weeklyTopEnabled: boolean;
    monthlyTopEnabled: boolean;
    overallScoreThresholdEnabled: boolean;
    streakThresholdEnabled: boolean;
    overallScoreThresholdStep: number;
    streakThresholdStep: number;
    updatedBy: string | null;
  }>,
  session?: ClientSession
): Promise<BadgeConfig> {
  const $set: Record<string, unknown> = { updatedAt: new Date() };
  if (typeof payload.weeklyTopEnabled === "boolean") {
    $set.weeklyTopEnabled = payload.weeklyTopEnabled;
  }
  if (typeof payload.monthlyTopEnabled === "boolean") {
    $set.monthlyTopEnabled = payload.monthlyTopEnabled;
  }
  if (typeof payload.overallScoreThresholdEnabled === "boolean") {
    $set.overallScoreThresholdEnabled = payload.overallScoreThresholdEnabled;
  }
  if (typeof payload.streakThresholdEnabled === "boolean") {
    $set.streakThresholdEnabled = payload.streakThresholdEnabled;
  }
  if (payload.overallScoreThresholdStep !== undefined) {
    const step = normalizeStep(payload.overallScoreThresholdStep, -1);
    if (!Number.isFinite(step) || step <= 0) {
      throw new Error("overallScoreThresholdStep must be a positive integer");
    }
    $set.overallScoreThresholdStep = step;
  }
  if (payload.streakThresholdStep !== undefined) {
    const step = normalizeStep(payload.streakThresholdStep, -1);
    if (!Number.isFinite(step) || step <= 0) {
      throw new Error("streakThresholdStep must be a positive integer");
    }
    $set.streakThresholdStep = step;
  }
  if (payload.updatedBy !== undefined) {
    $set.updatedBy = payload.updatedBy;
  }

  await GameBadgeConfigModel.updateOne(
    { classId },
    {
      $setOnInsert: {
        classId,
        ...DEFAULT_BADGE_CONFIG,
      },
      $set,
    },
    { upsert: true, session }
  );

  return getBadgeConfig(classId, session);
}

async function ensureInventory(classId: string, studentId: string, session: ClientSession) {
  const inv = await ensureStudentInventory(classId, studentId, session);
  if (!Array.isArray((inv as any).displayBadgeIds)) {
    (inv as any).displayBadgeIds = [];
    (inv as any).updatedAt = new Date();
    await (inv as any).save({ session });
  }
  return inv as any;
}

function nextDisplayBadges(ownedBadgeIds: string[], currentDisplayBadgeIds: string[]) {
  const owned = new Set(ownedBadgeIds.map((id) => String(id)));
  const normalizedDisplay = normalizeUnique(currentDisplayBadgeIds).filter((id) =>
    owned.has(id)
  );
  return normalizedDisplay.slice(0, MAX_DISPLAY_BADGES);
}

async function addBadgeToStudent(payload: {
  classId: string;
  studentId: string;
  badgeId: string;
  source: "rule" | "teacher";
  triggerAttemptId?: string | null;
  metadata?: Record<string, unknown>;
  session: ClientSession;
}) {
  const inv = await ensureInventory(payload.classId, payload.studentId, payload.session);
  const owned = normalizeUnique(inv.ownedBadgeIds || []);
  if (owned.includes(payload.badgeId)) {
    return false;
  }

  owned.push(payload.badgeId);
  const display = nextDisplayBadges(
    owned,
    normalizeUnique(inv.displayBadgeIds || []).concat(payload.badgeId)
  );

  inv.ownedBadgeIds = owned;
  inv.displayBadgeIds = display;
  inv.updatedAt = new Date();
  await inv.save({ session: payload.session });

  await GameRewardGrantModel.create(
    [
      {
        classId: payload.classId,
        studentId: payload.studentId,
        rewardId: payload.badgeId,
        rewardType: "badge",
        source: payload.source,
        ruleId: null,
        thresholdPoints: null,
        triggerAttemptId: payload.triggerAttemptId ? String(payload.triggerAttemptId) : null,
        grantedAt: new Date(),
        acknowledgedAt: null,
        metadata: payload.metadata || {},
      },
    ],
    { session: payload.session }
  );

  if (!payload.triggerAttemptId) {
    await GameStudentNotificationModel.create(
      [
        {
          classId: payload.classId,
          studentId: payload.studentId,
          type: "reward_granted",
          source: payload.source,
          rewardId: payload.badgeId,
          rewardType: "badge",
          triggerAttemptId: null,
          metadata: payload.metadata || {},
          createdAt: new Date(),
          acknowledgedAt: null,
        },
      ],
      { session: payload.session }
    );
  }

  return true;
}

async function revokeBadgeFromStudent(payload: {
  classId: string;
  studentId: string;
  badgeId: string;
  source: "system" | "teacher";
  triggerAttemptId?: string | null;
  metadata?: Record<string, unknown>;
  session: ClientSession;
}) {
  const inv = await ensureInventory(payload.classId, payload.studentId, payload.session);
  const owned = normalizeUnique(inv.ownedBadgeIds || []);
  if (!owned.includes(payload.badgeId)) {
    return false;
  }

  inv.ownedBadgeIds = owned.filter((id) => id !== payload.badgeId);
  inv.displayBadgeIds = nextDisplayBadges(inv.ownedBadgeIds, inv.displayBadgeIds || []);
  inv.updatedAt = new Date();
  await inv.save({ session: payload.session });

  await GameStudentNotificationModel.create(
    [
      {
        classId: payload.classId,
        studentId: payload.studentId,
        type: "reward_revoked",
        source: payload.source,
        rewardId: payload.badgeId,
        rewardType: "badge",
        triggerAttemptId: payload.triggerAttemptId ? String(payload.triggerAttemptId) : null,
        metadata: payload.metadata || {},
        createdAt: new Date(),
        acknowledgedAt: null,
      },
    ],
    { session: payload.session }
  );

  return true;
}

async function studentMetrics(classId: string, studentId: string, session: ClientSession) {
  const row = await GameStudentStatsModel.findOne(
    { classId: toClassObjectId(classId), studentId },
    { overallScore: 1, bestStreakDays: 1 }
  )
    .session(session)
    .lean<{ overallScore?: number; bestStreakDays?: number } | null>();

  return {
    overallScore: Number(row?.overallScore || 0),
    bestStreakDays: Number(row?.bestStreakDays || 0),
  };
}

function desiredThresholdBadgeIds(metrics: {
  overallScore: number;
  bestStreakDays: number;
}, config: BadgeConfig) {
  const desired: string[] = [];

  if (config.overallScoreThresholdEnabled) {
    const step = normalizeStep(
      config.overallScoreThresholdStep,
      DEFAULT_BADGE_CONFIG.overallScoreThresholdStep
    );
    const max = Math.floor(Math.max(0, metrics.overallScore) / step) * step;
    for (let value = step; value <= max; value += step) {
      desired.push(buildOverallThresholdBadgeId(value));
    }
  }

  if (config.streakThresholdEnabled) {
    const step = normalizeStep(
      config.streakThresholdStep,
      DEFAULT_BADGE_CONFIG.streakThresholdStep
    );
    const max = Math.floor(Math.max(0, metrics.bestStreakDays) / step) * step;
    for (let value = step; value <= max; value += step) {
      desired.push(buildStreakThresholdBadgeId(value));
    }
  }

  return desired;
}

export async function syncThresholdBadgesForStudent(payload: {
  classId: string;
  studentId: string;
  triggerAttemptId?: string | null;
  session?: ClientSession;
}) {
  const run = async (session: ClientSession) => {
    const [config, metrics, inv] = await Promise.all([
      getBadgeConfig(payload.classId, session),
      studentMetrics(payload.classId, payload.studentId, session),
      ensureInventory(payload.classId, payload.studentId, session),
    ]);

    const desired = new Set(desiredThresholdBadgeIds(metrics, config));
    const currentThresholdBadges = normalizeUnique(inv.ownedBadgeIds || []).filter(
      (id) => isThresholdBadgeId(id)
    );

    const currentSet = new Set(currentThresholdBadges);
    const toGrant = Array.from(desired).filter((id) => !currentSet.has(id));
    const toRevoke = currentThresholdBadges.filter((id) => !desired.has(id));

    for (const badgeId of toGrant) {
      await addBadgeToStudent({
        classId: payload.classId,
        studentId: payload.studentId,
        badgeId,
        source: "rule",
        triggerAttemptId: payload.triggerAttemptId || null,
        metadata: {
          via: "threshold_recompute",
        },
        session,
      });
    }

    for (const badgeId of toRevoke) {
      await revokeBadgeFromStudent({
        classId: payload.classId,
        studentId: payload.studentId,
        badgeId,
        source: "system",
        triggerAttemptId: payload.triggerAttemptId || null,
        metadata: {
          via: "threshold_recompute",
        },
        session,
      });
    }
  };

  if (payload.session) {
    await run(payload.session);
    return;
  }

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      await run(session);
    });
  } finally {
    session.endSession();
  }
}

export async function recomputeThresholdBadgesForClass(
  classId: string,
  session?: ClientSession
) {
  const run = async (tx: ClientSession) => {
    const classState = await GameClassStateModel.findOne({ classId })
      .select({ students: 1 })
      .session(tx)
      .lean<{ students?: Record<string, boolean> | Map<string, boolean> } | null>();

    const studentsRaw = classState?.students || {};
    const studentIds =
      studentsRaw instanceof Map
        ? Array.from(studentsRaw.keys())
        : Object.keys(studentsRaw as Record<string, boolean>);

    for (const studentId of studentIds) {
      await syncThresholdBadgesForStudent({ classId, studentId, session: tx });
    }
  };

  if (session) {
    await run(session);
    return;
  }

  const tx = await mongoose.startSession();
  try {
    await tx.withTransaction(async () => {
      await run(tx);
    });
  } finally {
    tx.endSession();
  }
}

type PeriodType = "week" | "month";

async function periodLeaderboardRows(payload: {
  classId: string;
  periodType: PeriodType;
  periodKey: string;
  session: ClientSession;
}) {
  const classState = await GameClassStateModel.findOne({ classId: payload.classId })
    .select({ timezone: 1, schedules: 1, students: 1 })
    .session(payload.session)
    .lean<{
      timezone?: string;
      schedules?: Record<string, { contribution?: number }> | Map<string, { contribution?: number }>;
      students?: Record<string, boolean> | Map<string, boolean>;
    } | null>();

  const timezone = String(classState?.timezone || "Asia/Singapore");

  const schedulesRaw = classState?.schedules || {};
  const scheduleContribution = new Map<string, number>();
  const scheduleEntries =
    schedulesRaw instanceof Map
      ? Array.from(schedulesRaw.entries())
      : Object.entries(schedulesRaw as Record<string, { contribution?: number }>);
  for (const [scheduleId, schedule] of scheduleEntries) {
    const contribution = Number(schedule?.contribution);
    scheduleContribution.set(scheduleId, Number.isFinite(contribution) ? contribution : 100);
  }

  const rangeDays = payload.periodType === "week" ? 16 : 80;
  const cutoff = new Date(Date.now() - rangeDays * 86400000);

  const attempts = await GameAttemptModel.find({
    classId: payload.classId,
    valid: true,
    finishedAt: { $gte: cutoff },
  })
    .select({ studentId: 1, scheduleId: 1, score: 1, maxScore: 1, finishedAt: 1 })
    .session(payload.session)
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
    { score: number; maxScore: number; scheduleId: string }
  >();

  for (const row of attempts) {
    const finishedAt = row.finishedAt ? new Date(row.finishedAt) : null;
    if (!finishedAt) continue;

    const dayKey = ymdInTZ(finishedAt, timezone);
    const periodKey =
      payload.periodType === "week"
        ? weekStartKeyForDateKey(dayKey)
        : monthKeyForDateKey(dayKey);
    if (periodKey !== payload.periodKey) continue;

    const studentId = String(row.studentId || "");
    const scheduleId = String(row.scheduleId || "");
    if (!studentId || !scheduleId) continue;

    const score = Number(row.score || 0);
    const maxScore = Number(row.maxScore || 0);
    const key = `${studentId}::${scheduleId}`;
    const prev = bestByStudentSchedule.get(key);
    if (!prev || score > prev.score) {
      bestByStudentSchedule.set(key, {
        scheduleId,
        score,
        maxScore,
      });
    }
  }

  const byStudent = new Map<
    string,
    { studentId: string; overallScore: number; sumScore: number; sumMax: number }
  >();

  for (const [key, best] of bestByStudentSchedule.entries()) {
    const studentId = key.split("::")[0];
    const contribution = Number(scheduleContribution.get(best.scheduleId) || 100);
    const pct = best.maxScore > 0 ? best.score / best.maxScore : 0;
    const cur =
      byStudent.get(studentId) || {
        studentId,
        overallScore: 0,
        sumScore: 0,
        sumMax: 0,
      };
    cur.overallScore += pct * contribution;
    cur.sumScore += best.score;
    cur.sumMax += best.maxScore;
    byStudent.set(studentId, cur);
  }

  const studentsRaw = classState?.students || {};
  const studentIds =
    studentsRaw instanceof Map
      ? Array.from(studentsRaw.keys())
      : Object.keys(studentsRaw as Record<string, boolean>);

  for (const studentId of studentIds) {
    if (!byStudent.has(studentId)) {
      byStudent.set(studentId, {
        studentId,
        overallScore: 0,
        sumScore: 0,
        sumMax: 0,
      });
    }
  }

  return Array.from(byStudent.values());
}

export async function finalizeHighScoreBadgesForClass(payload: {
  classId: string;
  session?: ClientSession;
}) {
  const run = async (session: ClientSession) => {
    const classState = await GameClassStateModel.findOne({ classId: payload.classId })
      .select({ timezone: 1 })
      .session(session)
      .lean<{ timezone?: string } | null>();
    const timezone = String(classState?.timezone || "Asia/Singapore");
    const keys = todayKeys(new Date(), timezone);
    const config = await getBadgeConfig(payload.classId, session);

    const finalizePeriod = async (periodType: PeriodType, periodKey: string) => {
      const exists = await GameBadgePeriodAwardModel.exists({
        classId: payload.classId,
        periodType,
        periodKey,
      })
        .session(session)
        .lean();
      if (exists) return;

      const rows = await periodLeaderboardRows({
        classId: payload.classId,
        periodType,
        periodKey,
        session,
      });
      const topScore = rows.reduce(
        (acc, row) => Math.max(acc, Number(row.overallScore || 0)),
        0
      );
      const winners =
        topScore > 0
          ? rows
              .filter((row) => Number(row.overallScore || 0) === topScore)
              .map((row) => String(row.studentId))
              .filter(Boolean)
          : [];

      const badgeId =
        periodType === "week"
          ? buildWeeklyTopBadgeId(periodKey)
          : buildMonthlyTopBadgeId(periodKey);

      for (const studentId of winners) {
        await addBadgeToStudent({
          classId: payload.classId,
          studentId,
          badgeId,
          source: "rule",
          triggerAttemptId: null,
          metadata: {
            via: "period_high_score",
            periodType,
            periodKey,
          },
          session,
        });
      }

      await GameBadgePeriodAwardModel.create(
        [
          {
            classId: payload.classId,
            periodType,
            periodKey,
            winners,
            awardedAt: new Date(),
          },
        ],
        { session }
      );
    };

    if (config.weeklyTopEnabled) {
      await finalizePeriod("week", keys.previousWeekStart);
    }
    if (config.monthlyTopEnabled) {
      await finalizePeriod("month", keys.previousMonth);
    }
  };

  if (payload.session) {
    await run(payload.session);
    return;
  }

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      await run(session);
    });
  } finally {
    session.endSession();
  }
}
