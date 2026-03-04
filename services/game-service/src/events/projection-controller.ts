import mongoose, { ClientSession } from "mongoose";
import { GameAttemptModel } from "../model/events/game-attempt-model";
import { GameStudentStatsModel } from "../model/stats/game-student-stats-model";
import { GameClassStateModel } from "../model/class/game-class-state-model";
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
import { toClassObjectId } from "../utils/mongo-utils";

type CanonicalSnapshot = {
  attemptId: string;
  score: number;
  maxScore: number;
  finishedAt: Date;
  subject?: string;
  topic?: string;
};

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

type CanonicalUpsertPayload = {
  classId: string;
  studentId: string;
  scheduleId: string;
  canonical: CanonicalSnapshot;
};

type CanonicalRemovedPayload = {
  classId: string;
  studentId: string;
  scheduleId: string;
};

async function getClassTimezone(classId: string, session: ClientSession) {
  const row = await GameClassStateModel.findOne(
    { classId },
    { timezone: 1 }
  )
    .session(session)
    .lean<{ timezone?: string } | null>();

  if (typeof row?.timezone === "string" && row.timezone.trim()) {
    return row.timezone;
  }
  return getDefaultTimezone();
}

async function getScheduleContribution(
  classId: string,
  scheduleId: string,
  session: ClientSession
) {
  const row = await GameClassStateModel.findOne(
    { classId },
    { [`schedules.${scheduleId}.contribution`]: 1 }
  )
    .session(session)
    .lean<{ schedules?: Record<string, { contribution?: number }> } | null>();

  const contribution = Number(row?.schedules?.[scheduleId]?.contribution);
  if (Number.isFinite(contribution) && contribution >= 0) {
    return contribution;
  }
  return getDefaultScheduleContribution();
}

function canonicalEquals(
  a: CanonicalSnapshot | undefined,
  b: CanonicalSnapshot | null
) {
  if (!a && !b) return true;
  if (!a || !b) return false;

  return (
    String(a.attemptId) === String(b.attemptId) &&
    Number(a.score) === Number(b.score) &&
    Number(a.maxScore) === Number(b.maxScore) &&
    new Date(a.finishedAt).getTime() === new Date(b.finishedAt).getTime() &&
    (a.subject || "") === (b.subject || "") &&
    (a.topic || "") === (b.topic || "")
  );
}

async function applyCanonicalState(
  classId: string,
  studentId: string,
  scheduleId: string,
  next: CanonicalSnapshot | null,
  session: ClientSession
) {
  const classObjId = toClassObjectId(classId);

  const row = await GameStudentStatsModel.findOne(
    { classId: classObjId, studentId },
    null,
    { session, lean: false }
  );

  const prev = row?.canonicalBySchedule?.get(scheduleId) as
    | CanonicalSnapshot
    | undefined;

  if (canonicalEquals(prev, next)) {
    return;
  }

  const contribution = await getScheduleContribution(classId, scheduleId, session);
  const prevPct = prev ? toPct(prev.score, prev.maxScore) : 0;
  const nextPct = next ? toPct(next.score, next.maxScore) : 0;
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
    { session, upsert: !!next }
  );
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
  const timezone = await getClassTimezone(classId, session);
  const dayKey = ymdInTZ(finishedAt, timezone);
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

export async function game_onScheduleContributionChanged(payload: {
  classId: string;
  scheduleId: string;
  oldContribution: number;
  newContribution: number;
  session?: ClientSession;
}) {
  const deltaC = Number(payload.newContribution) - Number(payload.oldContribution);
  if (!deltaC) return;

  const run = async (session: ClientSession) => {
    const filter = {
      classId: toClassObjectId(payload.classId),
      [`canonicalBySchedule.${payload.scheduleId}`]: { $exists: true },
    } as const;

    const pipeline = [
      {
        $set: {
          overallScore: {
            $add: [
              "$overallScore",
              {
                $let: {
                  vars: {
                    can: {
                      $getField: {
                        field: payload.scheduleId,
                        input: "$canonicalBySchedule",
                      },
                    },
                  },
                  in: {
                    $cond: [
                      { $gt: ["$$can.maxScore", 0] },
                      {
                        $multiply: [
                          { $divide: ["$$can.score", "$$can.maxScore"] },
                          deltaC,
                        ],
                      },
                      0,
                    ],
                  },
                },
              },
            ],
          },
          version: { $add: ["$version", 1] },
          updatedAt: new Date(),
        },
      },
    ] as any;

    await GameStudentStatsModel.updateMany(filter, pipeline, { session });
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

export async function game_onCanonicalUpserted(payload: CanonicalUpsertPayload) {
  const session = await mongoose.startSession();

  try {
    await session.withTransaction(async () => {
      await applyCanonicalState(
        payload.classId,
        payload.studentId,
        payload.scheduleId,
        payload.canonical,
        session
      );
    });
  } finally {
    session.endSession();
  }
}

export async function game_onCanonicalRemoved(payload: CanonicalRemovedPayload) {
  const session = await mongoose.startSession();

  try {
    await session.withTransaction(async () => {
      await applyCanonicalState(
        payload.classId,
        payload.studentId,
        payload.scheduleId,
        null,
        session
      );
    });
  } finally {
    session.endSession();
  }
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
        | CanonicalSnapshot
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

      if (shouldReplaceCanonical) {
        await applyCanonicalState(
          classId,
          studentId,
          scheduleId,
          {
            attemptId,
            score,
            maxScore,
            finishedAt,
            ...(subject ? { subject } : {}),
            ...(topic ? { topic } : {}),
          },
          session
        );
      }

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
        | CanonicalSnapshot
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

      await applyCanonicalState(classId, studentId, scheduleId, next, session);

      // Attendance/streak are sticky and not revoked on invalidation.
    });
  } finally {
    session.endSession();
  }
}
