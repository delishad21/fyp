import mongoose from "mongoose";
import { ClassLifecycleEvent } from "./types";
import { InboundClassEventModel } from "../model/events/inbound-class-event-model";
import { GameClassStateModel } from "../model/class/game-class-state-model";
import { GameStudentStatsModel } from "../model/stats/game-student-stats-model";
import { GameAttemptModel } from "../model/events/game-attempt-model";
import { toClassObjectId } from "../utils/mongo-utils";
import { game_onScheduleContributionChanged } from "./projection-controller";
import { GameStudentInventoryModel } from "../model/rewards/game-student-inventory-model";
import { GameRewardRuleModel } from "../model/rewards/game-reward-rule-model";
import { GameRewardGrantModel } from "../model/rewards/game-reward-grant-model";
import { GameScoreRewardConfigModel } from "../model/rewards/game-score-reward-config-model";
import { GameStudentNotificationModel } from "../model/rewards/game-student-notification-model";
import { GameBadgeConfigModel } from "../model/rewards/game-badge-config-model";
import { GameBadgePeriodAwardModel } from "../model/rewards/game-badge-period-award-model";
import {
  ensureDefaultRewardRules,
  ensureScoreThresholdConfig,
  ensureStudentInventory,
} from "../rewards/reward-engine";
import { ensureBadgeConfig } from "../rewards/badge-engine";
import { getDefaultScheduleContribution } from "../utils/game-stats-utils";

export type HandleClassLifecycleEventResult = {
  handled: boolean;
  applied: boolean;
  reason?: string;
};

function isClassLifecycleEvent(payload: any): payload is ClassLifecycleEvent {
  if (!payload || typeof payload !== "object") return false;
  if (typeof payload.eventId !== "string") return false;
  if (typeof payload.type !== "string") return false;
  if (typeof payload.classId !== "string") return false;
  if (typeof payload.occurredAt !== "string") return false;

  switch (payload.type) {
    case "ClassCreated":
      return (
        typeof payload.name === "string" &&
        typeof payload.timezone === "string" &&
        Array.isArray(payload.studentIds)
      );
    case "ClassUpdated":
      return (
        typeof payload.name === "string" && typeof payload.timezone === "string"
      );
    case "ClassDeleted":
      return true;
    case "StudentAddedToClass":
    case "StudentRemovedFromClass":
      return typeof payload.studentId === "string";
    case "ScheduleCreated":
    case "ScheduleUpdated":
      return (
        typeof payload.scheduleId === "string" &&
        typeof payload.quizRootId === "string" &&
        typeof payload.quizVersion === "number" &&
        typeof payload.contribution === "number" &&
        typeof payload.startDate === "string" &&
        typeof payload.endDate === "string"
      );
    case "ScheduleDeleted":
      return typeof payload.scheduleId === "string";
    default:
      return false;
  }
}

function studentMap(studentIds: string[]) {
  return Object.fromEntries(
    studentIds.map((id) => [String(id), true as const])
  );
}

function baseStatsSetOnInsert(classId: string, studentId: string) {
  return {
    classId: toClassObjectId(classId),
    studentId,
    updatedAt: new Date(),
  } as any;
}

async function seedStudentsInClass(
  classId: string,
  studentIds: string[],
  session: mongoose.ClientSession
) {
  const ids = studentIds.map(String).filter(Boolean);
  if (!ids.length) return;

  await GameStudentStatsModel.bulkWrite(
    ids.map((studentId) => ({
      updateOne: {
        filter: {
          classId: toClassObjectId(classId),
          studentId,
        },
        update: {
          $setOnInsert: baseStatsSetOnInsert(classId, studentId),
        },
        upsert: true,
      },
    })),
    { ordered: false, session }
  );
}

async function applyClassLifecycleEvent(payload: ClassLifecycleEvent): Promise<boolean> {
  const session = await mongoose.startSession();

  try {
    return await session.withTransaction(async () => {
      const now = new Date();

      if (payload.type === "ClassCreated") {
        await GameClassStateModel.updateOne(
          { classId: payload.classId },
          {
            $setOnInsert: {
              classId: payload.classId,
              schedules: {},
            },
            $set: {
              name: payload.name,
              timezone: payload.timezone,
              students: studentMap(payload.studentIds),
              updatedAt: now,
            },
            $inc: { version: 1 },
          },
          { upsert: true, session }
        );

        await seedStudentsInClass(payload.classId, payload.studentIds, session);
        await ensureDefaultRewardRules(payload.classId, session);
        await ensureScoreThresholdConfig(payload.classId, session);
        await ensureBadgeConfig(payload.classId, session);
        await Promise.all(
          payload.studentIds.map((studentId) =>
            ensureStudentInventory(payload.classId, String(studentId), session)
          )
        );
        return true;
      }

      if (payload.type === "ClassUpdated") {
        await GameClassStateModel.updateOne(
          { classId: payload.classId },
          {
            $setOnInsert: {
              classId: payload.classId,
              schedules: {},
              students: {},
            },
            $set: {
              name: payload.name,
              timezone: payload.timezone,
              updatedAt: now,
            },
            $inc: { version: 1 },
          },
          { upsert: true, session }
        );
        return true;
      }

      if (payload.type === "ClassDeleted") {
        await GameClassStateModel.deleteOne({ classId: payload.classId }, { session });
        await GameStudentStatsModel.deleteMany(
          { classId: toClassObjectId(payload.classId) },
          { session }
        );
        await GameAttemptModel.deleteMany({ classId: payload.classId }, { session });
        await GameStudentInventoryModel.deleteMany(
          { classId: payload.classId },
          { session }
        );
        await GameRewardRuleModel.deleteMany({ classId: payload.classId }, { session });
        await GameRewardGrantModel.deleteMany({ classId: payload.classId }, { session });
        await GameStudentNotificationModel.deleteMany(
          { classId: payload.classId },
          { session }
        );
        await GameScoreRewardConfigModel.deleteMany(
          { classId: payload.classId },
          { session }
        );
        await GameBadgeConfigModel.deleteMany(
          { classId: payload.classId },
          { session }
        );
        await GameBadgePeriodAwardModel.deleteMany(
          { classId: payload.classId },
          { session }
        );
        return true;
      }

      if (payload.type === "StudentAddedToClass") {
        await GameClassStateModel.updateOne(
          { classId: payload.classId },
          {
            $setOnInsert: {
              classId: payload.classId,
              name: "",
              timezone: "Asia/Singapore",
              schedules: {},
            },
            $set: {
              [`students.${payload.studentId}`]: true,
              updatedAt: now,
            },
            $inc: { version: 1 },
          },
          { upsert: true, session }
        );

        await GameStudentStatsModel.updateOne(
          {
            classId: toClassObjectId(payload.classId),
            studentId: payload.studentId,
          },
          {
            $setOnInsert: baseStatsSetOnInsert(payload.classId, payload.studentId),
          },
          { upsert: true, session }
        );
        await ensureStudentInventory(payload.classId, payload.studentId, session);
        return true;
      }

      if (payload.type === "StudentRemovedFromClass") {
        await GameClassStateModel.updateOne(
          { classId: payload.classId },
          {
            $unset: { [`students.${payload.studentId}`]: "" },
            $set: { updatedAt: now },
            $inc: { version: 1 },
          },
          { session }
        );

        await GameStudentStatsModel.deleteOne(
          {
            classId: toClassObjectId(payload.classId),
            studentId: payload.studentId,
          },
          { session }
        );
        await GameAttemptModel.deleteMany(
          {
            classId: payload.classId,
            studentId: payload.studentId,
          },
          { session }
        );
        await GameStudentInventoryModel.deleteOne(
          {
            classId: payload.classId,
            studentId: payload.studentId,
          },
          { session }
        );
        await GameRewardGrantModel.deleteMany(
          {
            classId: payload.classId,
            studentId: payload.studentId,
          },
          { session }
        );
        await GameStudentNotificationModel.deleteMany(
          {
            classId: payload.classId,
            studentId: payload.studentId,
          },
          { session }
        );
        return true;
      }

      if (payload.type === "ScheduleCreated") {
        const prev = await GameClassStateModel.findOne(
          { classId: payload.classId },
          { [`schedules.${payload.scheduleId}.contribution`]: 1 }
        )
          .session(session)
          .lean<{ schedules?: Record<string, { contribution?: number }> } | null>();

        const prevContributionRaw = Number(
          prev?.schedules?.[payload.scheduleId]?.contribution
        );
        const oldContribution = Number.isFinite(prevContributionRaw)
          ? prevContributionRaw
          : getDefaultScheduleContribution();

        await GameClassStateModel.updateOne(
          { classId: payload.classId },
          {
            $setOnInsert: {
              classId: payload.classId,
              name: "",
              timezone: "Asia/Singapore",
              students: {},
            },
            $set: {
              [`schedules.${payload.scheduleId}`]: {
                quizRootId: payload.quizRootId,
                quizVersion: payload.quizVersion,
                contribution: payload.contribution,
                startDate: new Date(payload.startDate),
                endDate: new Date(payload.endDate),
              },
              updatedAt: now,
            },
            $inc: { version: 1 },
          },
          { upsert: true, session }
        );

        if (oldContribution !== payload.contribution) {
          await game_onScheduleContributionChanged({
            classId: payload.classId,
            scheduleId: payload.scheduleId,
            oldContribution,
            newContribution: payload.contribution,
            session,
          });
        }
        return true;
      }

      if (payload.type === "ScheduleUpdated") {
        const prev = await GameClassStateModel.findOne(
          { classId: payload.classId },
          { [`schedules.${payload.scheduleId}.contribution`]: 1 }
        )
          .session(session)
          .lean<{ schedules?: Record<string, { contribution?: number }> } | null>();

        const oldContributionRaw = Number(
          prev?.schedules?.[payload.scheduleId]?.contribution
        );
        const oldContribution = Number.isFinite(oldContributionRaw)
          ? oldContributionRaw
          : getDefaultScheduleContribution();

        await GameClassStateModel.updateOne(
          { classId: payload.classId },
          {
            $setOnInsert: {
              classId: payload.classId,
              name: "",
              timezone: "Asia/Singapore",
              students: {},
            },
            $set: {
              [`schedules.${payload.scheduleId}`]: {
                quizRootId: payload.quizRootId,
                quizVersion: payload.quizVersion,
                contribution: payload.contribution,
                startDate: new Date(payload.startDate),
                endDate: new Date(payload.endDate),
              },
              updatedAt: now,
            },
            $inc: { version: 1 },
          },
          { upsert: true, session }
        );

        if (oldContribution !== payload.contribution) {
          await game_onScheduleContributionChanged({
            classId: payload.classId,
            scheduleId: payload.scheduleId,
            oldContribution,
            newContribution: payload.contribution,
            session,
          });
        }

        return true;
      }

      if (payload.type === "ScheduleDeleted") {
        await GameClassStateModel.updateOne(
          { classId: payload.classId },
          {
            $unset: { [`schedules.${payload.scheduleId}`]: "" },
            $set: { updatedAt: now },
            $inc: { version: 1 },
          },
          { session }
        );
        return true;
      }

      return false;
    });
  } finally {
    session.endSession();
  }
}

export async function handleClassLifecycleEvent(
  payload: any
): Promise<HandleClassLifecycleEventResult> {
  if (!isClassLifecycleEvent(payload)) {
    return { handled: false, applied: false, reason: "invalid_payload" };
  }

  const already = await InboundClassEventModel.findById(payload.eventId).lean();
  if (already) {
    return { handled: true, applied: false, reason: "duplicate_event" };
  }

  const applied = await applyClassLifecycleEvent(payload);

  try {
    await InboundClassEventModel.create({
      _id: payload.eventId,
      type: payload.type,
      classId: payload.classId,
      occurredAt: new Date(payload.occurredAt),
    });
  } catch (e: any) {
    if (e?.code !== 11000) {
      throw e;
    }
  }

  return { handled: true, applied };
}
