import mongoose, { ClientSession, Types } from "mongoose";
import { GameAttemptModel } from "../model/events/game-attempt-model";
import { GameStudentStatsModel } from "../model/stats/game-student-stats-model";
import {
  getDefaultScheduleContribution,
  getDefaultTimezone,
  toPct,
} from "../utils/game-stats-utils";
import {
  dayIndex,
  stableNoonUTCFromDayKey,
  ymdInTZ,
} from "../utils/date-utils";

type FinalizedPayload = {
  classId: string;
  studentId: string;
  scheduleId: string;
  attemptId: string;
  score: number;
  maxScore: number;
  finishedAt: Date;
  subject?: string;
  topic?: string;
};

type InvalidatedPayload = {
  classId: string;
  studentId: string;
  scheduleId: string;
  attemptId: string;
};

function toClassObjectId(classId: string) {
  if (!Types.ObjectId.isValid(classId)) {
    throw new Error(`Invalid classId for game projection: ${classId}`);
  }
  return new Types.ObjectId(classId);
}

async function getScheduleContribution(
  _classId: string,
  _scheduleId: string,
  _session: ClientSession
) {
  // For now we apply default contribution only.
  // Class lifecycle/schedule event consumers will provide class-specific values.
  return getDefaultScheduleContribution();
}

async function recomputeStreakFromAttendance(
  classId: string,
  studentId: string,
  session: ClientSession
) {
  const classObjId = toClassObjectId(classId);

  const row = await GameStudentStatsModel.findOne(
    { classId: classObjId, studentId },
    { attendanceDays: 1 }
  )
    .session(session)
    .lean<{ attendanceDays?: Record<string, boolean> } | null>();

  const keys = Object.entries(row?.attendanceDays || {})
    .filter(([, v]) => !!v)
    .map(([k]) => k)
    .sort();

  if (!keys.length) {
    await GameStudentStatsModel.updateOne(
      { classId: classObjId, studentId },
      {
        $set: {
          streakDays: 0,
          bestStreakDays: 0,
          lastStreakDate: null,
          updatedAt: new Date(),
        },
        $inc: { version: 1 },
      },
      { session }
    );
    return;
  }

  let streak = 1;
  for (let i = keys.length - 1; i > 0; i--) {
    if (dayIndex(keys[i]) - dayIndex(keys[i - 1]) === 1) {
      streak++;
    } else {
      break;
    }
  }

  let best = 1;
  let cur = 1;
  for (let i = 1; i < keys.length; i++) {
    if (dayIndex(keys[i]) - dayIndex(keys[i - 1]) === 1) {
      cur++;
    } else {
      best = Math.max(best, cur);
      cur = 1;
    }
  }
  best = Math.max(best, cur);

  const lastDate = stableNoonUTCFromDayKey(keys[keys.length - 1]);

  await GameStudentStatsModel.updateOne(
    { classId: classObjId, studentId },
    {
      $set: {
        streakDays: streak,
        bestStreakDays: best,
        lastStreakDate: lastDate,
        updatedAt: new Date(),
      },
      $inc: { version: 1 },
    },
    { session }
  );
}

async function ensureAttendanceForDay(
  classId: string,
  studentId: string,
  finishedAt: Date,
  session: ClientSession
) {
  const classObjId = toClassObjectId(classId);
  const dayKey = ymdInTZ(finishedAt, getDefaultTimezone());
  const path = `attendanceDays.${dayKey}`;

  const already = await GameStudentStatsModel.exists({
    classId: classObjId,
    studentId,
    [path]: true,
  })
    .session(session)
    .lean();

  if (already) return;

  await GameStudentStatsModel.updateOne(
    { classId: classObjId, studentId },
    {
      $setOnInsert: {
        classId: classObjId,
        studentId,
      },
      $set: {
        [path]: true,
        updatedAt: new Date(),
      },
      $inc: { version: 1 },
    },
    { session, upsert: true }
  );

  await recomputeStreakFromAttendance(classId, studentId, session);
}

export async function game_onAttemptFinalized(payload: FinalizedPayload) {
  const session = await mongoose.startSession();

  try {
    await session.withTransaction(async () => {
      const {
        classId,
        studentId,
        scheduleId,
        attemptId,
        score,
        maxScore,
        finishedAt,
        subject,
        topic,
      } = payload;

      const classObjId = toClassObjectId(classId);

      const row = await GameStudentStatsModel.findOne(
        { classId: classObjId, studentId },
        null,
        { session, lean: false }
      );

      const prev = row?.canonicalBySchedule?.get(scheduleId) as
        | {
            attemptId: string;
            score: number;
            maxScore: number;
            finishedAt: Date;
            subject?: string;
            topic?: string;
          }
        | undefined;

      let shouldReplaceCanonical = false;
      if (!prev) {
        shouldReplaceCanonical = true;
      } else if (score > prev.score) {
        shouldReplaceCanonical = true;
      } else if (score === prev.score) {
        // tie: keep existing canonical deterministically
        shouldReplaceCanonical = false;
      }

      const contribution = await getScheduleContribution(
        classId,
        scheduleId,
        session
      );

      const prevPct = prev ? toPct(prev.score, prev.maxScore) : 0;
      const nextPct = shouldReplaceCanonical ? toPct(score, maxScore) : prevPct;
      const deltaOverall = (nextPct - prevPct) * contribution;

      const update: any = {
        $setOnInsert: {
          classId: classObjId,
          studentId,
          streakDays: 0,
          bestStreakDays: 0,
          lastStreakDate: null,
        },
        $set: { updatedAt: new Date() },
        $inc: { version: 1 } as Record<string, number>,
      };

      if (shouldReplaceCanonical) {
        update.$set[`canonicalBySchedule.${scheduleId}`] = {
          attemptId,
          score,
          maxScore,
          finishedAt,
          ...(subject ? { subject } : {}),
          ...(topic ? { topic } : {}),
        };
      }

      if (deltaOverall) {
        update.$inc.overallScore = (update.$inc.overallScore || 0) + deltaOverall;
      }

      await GameStudentStatsModel.updateOne(
        { classId: classObjId, studentId },
        update,
        { session, upsert: true }
      );

      await ensureAttendanceForDay(classId, studentId, finishedAt, session);
    });
  } finally {
    session.endSession();
  }
}

export async function game_onAttemptInvalidated(payload: InvalidatedPayload) {
  const session = await mongoose.startSession();

  try {
    await session.withTransaction(async () => {
      const { classId, studentId, scheduleId, attemptId } = payload;
      const classObjId = toClassObjectId(classId);

      const row = await GameStudentStatsModel.findOne(
        { classId: classObjId, studentId },
        null,
        { session, lean: false }
      );

      const prev = row?.canonicalBySchedule?.get(scheduleId) as
        | {
            attemptId: string;
            score: number;
            maxScore: number;
            finishedAt: Date;
            subject?: string;
            topic?: string;
          }
        | undefined;

      if (!prev) return;
      if (String(prev.attemptId) !== String(attemptId)) return;

      const nextRows = await GameAttemptModel.find({
        classId,
        studentId,
        scheduleId,
        valid: true,
      })
        .select({
          attemptId: 1,
          score: 1,
          maxScore: 1,
          finishedAt: 1,
          subject: 1,
          topic: 1,
          attemptVersion: 1,
        })
        .sort({ score: -1, finishedAt: -1, attemptVersion: -1, attemptId: -1 })
        .limit(1)
        .session(session)
        .lean();

      const next = nextRows[0]
        ? {
            attemptId: String(nextRows[0].attemptId),
            score: Number(nextRows[0].score || 0),
            maxScore: Number(nextRows[0].maxScore || 0),
            finishedAt: nextRows[0].finishedAt ?? new Date(),
            subject: nextRows[0].subject,
            topic: nextRows[0].topic,
          }
        : null;

      const contribution = await getScheduleContribution(
        classId,
        scheduleId,
        session
      );

      const prevPct = toPct(prev.score, prev.maxScore);
      const nextPct = next ? toPct(next.score, next.maxScore) : 0;
      const deltaOverall = (nextPct - prevPct) * contribution;

      const update: any = {
        $set: { updatedAt: new Date() },
        $inc: { version: 1 } as Record<string, number>,
      };

      if (deltaOverall) {
        update.$inc.overallScore = (update.$inc.overallScore || 0) + deltaOverall;
      }

      if (next) {
        update.$set[`canonicalBySchedule.${scheduleId}`] = {
          attemptId: next.attemptId,
          score: next.score,
          maxScore: next.maxScore,
          finishedAt: next.finishedAt,
          ...(next.subject ? { subject: next.subject } : {}),
          ...(next.topic ? { topic: next.topic } : {}),
        };
      } else {
        update.$unset = { [`canonicalBySchedule.${scheduleId}`]: "" };
      }

      await GameStudentStatsModel.updateOne(
        { classId: classObjId, studentId },
        update,
        { session }
      );

      // Attendance/streak are sticky and not revoked on invalidation.
    });
  } finally {
    session.endSession();
  }
}
