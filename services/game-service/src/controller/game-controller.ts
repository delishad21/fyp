import { Request, Response } from "express";
import { GameStudentStatsModel } from "../model/stats/game-student-stats-model";
import { toClassObjectId } from "../utils/mongo-utils";
import { GameClassStateModel } from "../model/class/game-class-state-model";
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

import {
  buildBadgePayload,
  buildLeaderboardRows,
  hasStudentInState,
  parseLimit,
  parsePeriod,
  getAuthHeader,
  leaderboardSort,
  toPct,
  toWholeScore,
  withRanks,
} from "./game-controller-helpers";

/**
 * @route  GET /health
 * @auth   Public
 * @notes  Lightweight liveness response for game-service.
 * @returns 200 { ok, data: { service, status, version, timestamp } }
 */
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

/**
 * @route  GET /classes/:classId/leaderboard
 * @auth   Public (current route wiring)
 * @input  Params: { classId }, Query: { period?: "overall" | "week" | "month" }
 * @notes  - Computes period-aware leaderboard rows.
 *         - Rank sort: overallScore DESC, currentStreak DESC, studentId ASC.
 *         - overallScore is rounded to whole number for API output.
 * @returns 200 { ok, data: LeaderboardRowWithRank[], meta: { period } }
 * @errors  400 missing/invalid classId
 *          500 internal error
 */
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

/**
 * @route  GET /classes/:classId/leaderboard/top
 * @auth   Public (current route wiring)
 * @input  Params: { classId }, Query: { period?, limit? }
 * @notes  Returns pre-sliced top lists for overall score, participation, and streak cards.
 * @returns 200 { ok, data: { period, topOverallScore, topParticipation, topStreak } }
 * @errors  400 missing/invalid classId
 *          500 internal error
 */
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

/**
 * @route  GET /classes/:classId/students/:studentId/profile
 * @auth   Public (current route wiring)
 * @input  Params: { classId, studentId }
 * @notes  - Returns class-scoped game profile (rank, score, streak, inventory/badge projection).
 *         - Falls back to projected data when class roster is not yet in sync.
 *         - overallScore is rounded to whole number for API output.
 * @returns 200 { ok, data: GameStudentProfile }
 * @errors  400 missing params
 *          404 class/student not found
 *          500 internal error
 */
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

    const fallbackOverallScore = toWholeScore(stats?.overallScore || 0);
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
        overallScore: toWholeScore(
          typeof row?.overallScore === "number" ? row.overallScore : fallbackOverallScore
        ),
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

/**
 * @route  GET /classes/:classId/students/:studentId/attempts/:attemptId/outcome
 * @auth   verifyAccessToken + verifyAttemptOwnerOrPrivileged
 * @input  Params: { classId, studentId, attemptId }
 * @notes  - Poll endpoint for post-attempt gamification outcome.
 *         - Returns { ready: false } while projection is pending.
 *         - Includes score/rank delta and attempt-triggered rewards when ready.
 *         - overallScoreBefore/After are rounded to whole number for API output.
 * @returns 200 { ok, data: AttemptOutcomeOrPending }
 * @errors  400 missing params
 *          404 attempt does not belong to class/student
 *          500 internal error
 */
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
    const overallScoreBefore = toWholeScore(outcome.overallScoreBefore || 0);
    const overallScoreAfter = toWholeScore(outcome.overallScoreAfter || 0);

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
