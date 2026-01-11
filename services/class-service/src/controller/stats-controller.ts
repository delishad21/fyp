import mongoose, { ClientSession, Types } from "mongoose";
import { ScheduleStatsModel } from "../model/stats/scheduled-quiz-stats-model";
import { StudentClassStatsModel } from "../model/stats/student-stats-model";
import { ClassModel } from "../model/class/class-model";
import { ClassAttemptModel } from "../model/events/class-attempt-model";
import { toId, pct, getClassTimezone, ymdInTZ } from "../utils/utils";

/**
 * These are all internal functions. No routes are exposed here.
 * They are called by controllers in response to class/attempt/schedule events.
 */

async function pruneEmptySubjectTopicBuckets(
  classId: string,
  studentId: string,
  session: mongoose.ClientSession
) {
  const row = await StudentClassStatsModel.findOne(
    { classId: toId(classId), studentId },
    { bySubject: 1, byTopic: 1 }
  )
    .session(session)
    .lean<any>();

  if (!row) return;

  const unset: Record<string, string> = {};

  // A bucket is "empty" if attempts <= 0 OR (sumScore and sumMax are both 0/absent)
  for (const [subj, v] of Object.entries(row.bySubject || {})) {
    const attempts = Number((v as any).attempts ?? 0);
    const sumScore = Number((v as any).sumScore ?? 0);
    const sumMax = Number((v as any).sumMax ?? 0);

    if (attempts <= 0 || (sumScore === 0 && sumMax === 0)) {
      unset[`bySubject.${subj}`] = "";
    }
  }

  for (const [topic, v] of Object.entries(row.byTopic || {})) {
    const attempts = Number((v as any).attempts ?? 0);
    const sumScore = Number((v as any).sumScore ?? 0);
    const sumMax = Number((v as any).sumMax ?? 0);

    if (attempts <= 0 || (sumScore === 0 && sumMax === 0)) {
      unset[`byTopic.${topic}`] = "";
    }
  }

  if (Object.keys(unset).length === 0) return;

  await StudentClassStatsModel.updateOne(
    { classId: toId(classId), studentId },
    { $unset: unset },
    { session }
  );
}

/* ========= Attendance & streak (earned & sticky) ========= */

/**
 * Ensure attendance is recorded for the student's **class-local day** of `finishedAt`.
 * If this is the first time we mark that local day in the attendance ledger:
 *  - We set `attendanceDays[YYYY-MM-DD] = true` (append-only; never deleted by schedule/attempt changes).
 *  - We recompute `streakDays` and `lastStreakDate` from the attendance ledger to keep it consistent.
 *
 * IMPORTANT PRODUCT RULE:
 *  - Attendance is **earned & sticky**: later quiz/schedule/attempt edits do not revoke a day once recorded.
 *  - This decouples streaks from mutable attempt data and prevents retroactive streak breakage.
 *
 * Must be called in the same transaction that finalized the attempt.
 */
async function ensureAttendanceForDay(
  classId: string,
  studentId: string,
  finishedAt: Date,
  session: mongoose.ClientSession
) {
  const tz = await getClassTimezone(classId, session);
  const dayKey = ymdInTZ(finishedAt, tz);
  const path = `attendanceDays.${dayKey}`;

  const already = await StudentClassStatsModel.exists({
    classId: toId(classId),
    studentId,
    [path]: true,
  })
    .session(session)
    .lean();

  if (already) return;

  // Mark attendance for that day
  await StudentClassStatsModel.updateOne(
    { classId: toId(classId), studentId },
    {
      $setOnInsert: { classId: toId(classId), studentId },
      $set: { [path]: true, updatedAt: new Date() },
      $inc: { version: 1 },
    },
    { session, upsert: true }
  );

  // Recompute streak from attendance to remain correct and drift-free.
  await recomputeStreakFromAttendance(classId, studentId, session);
}

/**
 * Recompute a student's streak metrics from the **attendance ledger**.
 *
 * Stored values:
 *  - streakDays: run length ending at the most recent attended local day.
 *  - bestStreakDays: historic maximum run length ever achieved.
 *  - lastStreakDate: stable UTC timestamp representing the most recent local day.
 *
 * READ PROJECTION RULE (applied by controllers on read):
 *  - If lastStreakDate is neither today nor yesterday in the class timezone,
 *    the **current** streak should be treated as 0 (without mutating the DB).
 *
 * How it works (write-time):
 *  1) Walk attendanceDays (YYYY-MM-DD keys), sort ASC.
 *  2) Compute the longest consecutive chain (best) and the trailing chain ending at the last key.
 *  3) Persist streakDays, bestStreakDays, lastStreakDate, version, updatedAt.
 */
async function recomputeStreakFromAttendance(
  classId: string,
  studentId: string,
  session?: mongoose.ClientSession
) {
  const row = await StudentClassStatsModel.findOne(
    { classId: toId(classId), studentId },
    { attendanceDays: 1 }
  )
    .session(session || null)
    .lean<{ attendanceDays?: Record<string, boolean> } | null>();

  const keys = Object.entries(row?.attendanceDays || {})
    .filter(([, v]) => !!v)
    .map(([k]) => k);

  if (!keys.length) {
    await StudentClassStatsModel.updateOne(
      { classId: toId(classId), studentId },
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

  keys.sort(); // ASC
  const idx = (k: string) => {
    const [y, m, d] = k.split("-").map(Number);
    return Math.floor(Date.UTC(y, (m || 1) - 1, d || 1) / 86400000);
  };

  // trailing (last) streak length
  let streak = 1;
  for (let i = keys.length - 1; i > 0; i--) {
    if (idx(keys[i]) - idx(keys[i - 1]) === 1) streak++;
    else break;
  }

  // best (max) streak length anywhere in the ledger
  let best = 1;
  let cur = 1;
  for (let i = 1; i < keys.length; i++) {
    if (idx(keys[i]) - idx(keys[i - 1]) === 1) {
      cur++;
    } else {
      best = Math.max(best, cur);
      cur = 1;
    }
  }
  best = Math.max(best, cur);

  const [y, m, d] = keys[keys.length - 1].split("-").map(Number);
  const lastDate = new Date(Date.UTC(y, (m || 1) - 1, d || 1, 12, 0, 0)); // stable noon UTC

  await StudentClassStatsModel.updateOne(
    { classId: toId(classId), studentId },
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

/**
 * Read the current contribution weight of a schedule from Class.schedule.
 * IMPORTANT: Call this before the schedule is physically removed so the value exists.
 */
async function getScheduleContribution(
  classId: string,
  scheduleId: string,
  session: mongoose.ClientSession
): Promise<number> {
  const cls = await ClassModel.findById(classId)
    .select({ schedule: 1 })
    .session(session)
    .lean();
  if (!cls) return 0;
  const it = (cls.schedule || []).find(
    (s: any) => String(s._id) === String(scheduleId)
  );
  return Math.max(0, Number(it?.contribution ?? 0));
}

/* ========= Attempt & Contribution dimension ========= */

/**
 * Reweight overallScore when a schedule's contribution changes.
 *
 * Atomic semantics:
 * - If `opts.session` is provided, runs in that session (caller controls the TX).
 * - Otherwise, starts its own transaction and commits independently.
 *
 * Math:
 *   deltaC = newContribution - oldContribution
 *   deltaOverall = (canonical.score / canonical.maxScore) * deltaC  (0 if maxScore <= 0)
 *
 * Requirements:
 * - MongoDB 5.0+ for $getField in update pipeline (recommended).
 */
export async function stats_onScheduleContributionChanged(
  classId: string | Types.ObjectId,
  scheduleId: string,
  oldContribution: number,
  newContribution: number,
  opts?: { session?: ClientSession; now?: Date }
): Promise<void> {
  const deltaC = newContribution - oldContribution;
  if (!deltaC) return;

  // filter for students who have a canonical for this schedule
  const filter = {
    classId: toId(classId),
    [`canonicalBySchedule.${scheduleId}`]: { $exists: true },
  } as const;

  // One-shot pipeline update (atomic, set-based)

  /**  Pseudo-code of the update:
  can = canonicalBySchedule[scheduleId]
  if (can && can.maxScore > 0) {
    canonicalPct = can.score / can.maxScore
    overallScore = overallScore + canonicalPct * deltaC
  }
  version = version + 1
  updatedAt = now
  */

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
                      // get the canonical attempt for this schedule
                      field: scheduleId,
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
        updatedAt: opts?.now ?? new Date(),
      },
    },
  ] as any;

  const run = async (session?: ClientSession) => {
    await StudentClassStatsModel.updateMany(filter, pipeline, { session });
  };

  if (opts?.session) {
    // Caller handles transaction boundaries
    await run(opts.session);
    return;
  }

  // Self-managed transaction
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      await run(session);
    });
  } finally {
    session.endSession();
  }
}

/**
 * Finalize (or edit) an attempt and apply its effects.
 *
 * Effects on StudentClassStats:
 *  - Decide whether to set/replace the canonical for the schedule based on best score, with tie-breaks.
 *  - Update sumScore/sumMax deltas relative to previous canonical.
 *  - If this is the first canonical for that schedule: increment participationCount.
 *  - Update overallScore by the change in canonical percentage multiplied by the schedule’s contribution.
 *  - Update per-subject/per-topic buckets (sumScore/sumMax and attempts when 1st canonical).
 *  - **Record attendance** for the local day (append-only) and recompute streak from attendance.
 *  - Upsert-safe: creates student row on first write.
 *
 * Effects on ScheduleStats (per-assignment aggregates):
 *  - Update sumScore/sumMax by the deltas.
 *  - If first canonical for this schedule: +1 participants.
 *
 * Does NOT:
 *  - Write to ClassStats (since class stats are derived at read time).
 *
 * Transaction model:
 *  - Runs in its own MongoDB transaction (per call).
 *  - Call immediately after the attempt is finalized to keep stats in sync.
 */
export async function stats_onAttemptFinalized(payload: {
  classId: string;
  studentId: string;
  scheduleId: string;
  quizId: string;
  subject?: string | null;
  topic?: string | null;
  score: number;
  maxScore: number;
  finishedAt: Date;
  attemptId: string;
}) {
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const {
        classId,
        studentId,
        scheduleId,
        quizId,
        subject,
        topic,
        score,
        maxScore,
        finishedAt,
        attemptId, // <-- NEW
      } = payload;

      const sid = toId(scheduleId);

      // include attemptId in the prev type for clarity
      const stu = await StudentClassStatsModel.findOne(
        { classId: toId(classId), studentId },
        null,
        { session, lean: false }
      );

      let shouldReplaceCanonical = false;
      let isFirstCanonicalForSchedule = false;
      let deltaScore = score;
      let deltaMax = maxScore;

      const prev = stu?.canonicalBySchedule?.get(String(scheduleId)) as
        | {
            attemptId?: string;
            score: number;
            maxScore: number;
            finishedAt: Date;
          }
        | undefined;

      // ---- decide replacement (implement your tie-break policy here) ----
      if (!prev) {
        shouldReplaceCanonical = true;
        isFirstCanonicalForSchedule = true;
      } else if (score > prev.score) {
        shouldReplaceCanonical = true;
        deltaScore = score - prev.score;
        deltaMax = maxScore - prev.maxScore;
      } else if (score === prev.score) {
        // TIE-BREAK: keep the existing canonical by default (so you don't wipe attemptId).
        // If you want newest-wins, flip this to `shouldReplaceCanonical = finishedAt > prev.finishedAt`.
        shouldReplaceCanonical = false; // <--- important change vs your code
        deltaScore = 0;
        deltaMax = 0;
      } else {
        shouldReplaceCanonical = false;
        deltaScore = 0;
        deltaMax = 0;
      }

      const contribution = await getScheduleContribution(
        classId,
        scheduleId,
        session
      );
      const prevPct = prev ? pct(prev.score, prev.maxScore) : 0;
      const nextPct = shouldReplaceCanonical ? pct(score, maxScore) : prevPct;
      const deltaOverall = (nextPct - prevPct) * contribution;

      // --- Student stats (upsert-safe) ---
      const studentUpdate: any = {
        $set: { updatedAt: new Date() },
        $inc: { version: 1 } as Record<string, number>,
      };

      const studentSetOnInsert: any = {
        $setOnInsert: {
          classId: toId(classId),
          studentId,
          streakDays: 0,
          lastStreakDate: null,
        },
      };

      if (shouldReplaceCanonical) {
        studentUpdate.$set[`canonicalBySchedule.${scheduleId}`] = {
          attemptId, // <-- write the real id
          score,
          maxScore,
          finishedAt,
          ...(subject ? { subject } : {}),
          ...(topic ? { topic } : {}),
        };
      }
      if (deltaScore || deltaMax) {
        studentUpdate.$inc.sumScore =
          (studentUpdate.$inc.sumScore || 0) + deltaScore;
        studentUpdate.$inc.sumMax = (studentUpdate.$inc.sumMax || 0) + deltaMax;
      }
      if (isFirstCanonicalForSchedule) {
        studentUpdate.$inc.participationCount =
          (studentUpdate.$inc.participationCount || 0) + 1;
      }
      if (deltaOverall) {
        studentUpdate.$inc.overallScore =
          (studentUpdate.$inc.overallScore || 0) + deltaOverall;
      }
      if (subject && (deltaScore || deltaMax)) {
        studentUpdate.$inc[`bySubject.${subject}.sumScore`] =
          (studentUpdate.$inc[`bySubject.${subject}.sumScore`] || 0) +
          deltaScore;
        studentUpdate.$inc[`bySubject.${subject}.sumMax`] =
          (studentUpdate.$inc[`bySubject.${subject}.sumMax`] || 0) + deltaMax;
        if (isFirstCanonicalForSchedule) {
          studentUpdate.$inc[`bySubject.${subject}.attempts`] =
            (studentUpdate.$inc[`bySubject.${subject}.attempts`] || 0) + 1;
        }
      }
      if (topic && (deltaScore || deltaMax)) {
        studentUpdate.$inc[`byTopic.${topic}.sumScore`] =
          (studentUpdate.$inc[`byTopic.${topic}.sumScore`] || 0) + deltaScore;
        studentUpdate.$inc[`byTopic.${topic}.sumMax`] =
          (studentUpdate.$inc[`byTopic.${topic}.sumMax`] || 0) + deltaMax;
        if (isFirstCanonicalForSchedule) {
          studentUpdate.$inc[`byTopic.${topic}.attempts`] =
            (studentUpdate.$inc[`byTopic.${topic}.attempts`] || 0) + 1;
        }
      }

      await StudentClassStatsModel.updateOne(
        { classId: toId(classId), studentId },
        { ...studentSetOnInsert, ...studentUpdate },
        { session, upsert: true }
      );

      // --- Per-schedule aggregates ---
      const schedUpdate: any = {
        $setOnInsert: { classId: toId(classId), scheduleId: sid, quizId },
        $set: { updatedAt: new Date() },
        $inc: { version: 1 } as Record<string, number>,
      };
      if (deltaScore || deltaMax) {
        schedUpdate.$inc.sumScore =
          (schedUpdate.$inc.sumScore || 0) + deltaScore;
        schedUpdate.$inc.sumMax = (schedUpdate.$inc.sumMax || 0) + deltaMax;
      }
      if (isFirstCanonicalForSchedule) {
        schedUpdate.$inc.participants =
          (schedUpdate.$inc.participants || 0) + 1;
      }

      await ScheduleStatsModel.updateOne({ scheduleId: sid }, schedUpdate, {
        upsert: true,
        session,
      });

      // --- Attendance (earned & sticky) + streak recompute ---
      await ensureAttendanceForDay(
        String(classId),
        String(studentId),
        finishedAt,
        session
      );
    });
  } finally {
    session.endSession();
  }
}

/**
 * Invalidate a canonical attempt and promote the next best valid one (if any).
 *
 * Effects on StudentClassStats:
 *  - Replace canonical with the next best (or remove if none exists).
 *  - Apply deltas to sumScore/sumMax and overallScore (via contribution).
 *  - Correct per-subject/per-topic buckets, including “move” when subject/topic changes
 *    between prev canonical and next canonical.
 *  - If no next canonical: decrement participationCount.
 *
 * Effects on ScheduleStats:
 *  - Apply deltas to sumScore/sumMax.
 *  - Decrement participants only when there is no next canonical.
 *
 * Does NOT:
 *  - Touch attendance or streaks (attendance is sticky and not revoked).
 *  - Write to ClassStats (derived at read time).
 */
export async function stats_onAttemptInvalidated(payload: {
  classId: string;
  studentId: string;
  scheduleId: string;
  subject?: string | null;
  score: number;
  maxScore: number;
}) {
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const {
        classId,
        studentId,
        scheduleId,
        subject: payloadSubject,
        score,
        maxScore,
      } = payload;
      const sid = toId(scheduleId);

      const stu = await StudentClassStatsModel.findOne(
        { classId: toId(classId), studentId },
        null,
        { session, lean: false }
      );
      if (!stu?.canonicalBySchedule?.has(String(scheduleId))) return;

      const prev = stu.canonicalBySchedule.get(String(scheduleId)) as any;
      if (prev.score !== score || prev.maxScore !== maxScore) return;

      let prevSubject: string | undefined =
        typeof prev.subject === "string" ? prev.subject : undefined;
      let prevTopic: string | undefined =
        typeof prev.topic === "string" ? prev.topic : undefined;

      if (!prevSubject || !prevTopic) {
        if (!prevSubject && payloadSubject)
          prevSubject = String(payloadSubject);

        if (!prevTopic || !prevSubject) {
          const cls = await ClassModel.findById(classId)
            .select({ schedule: 1 })
            .session(session)
            .lean();
          const schedSnap = (cls?.schedule || []).find(
            (s: any) => String(s._id) === String(scheduleId)
          );
          if (!prevSubject && typeof schedSnap?.subject === "string") {
            prevSubject = schedSnap.subject;
          }
          if (!prevTopic && typeof schedSnap?.topic === "string") {
            prevTopic = schedSnap.topic;
          }
        }
      }

      const nextBest = await ClassAttemptModel.find({
        classId: String(classId),
        studentId: String(studentId),
        scheduleId: String(scheduleId),
        valid: true,
      })
        .select({
          score: 1,
          maxScore: 1,
          finishedAt: 1,
          attemptVersion: 1,
          attemptId: 1,
          subject: 1,
          topic: 1,
        })
        .sort({ score: -1, finishedAt: -1, attemptVersion: -1, attemptId: -1 })
        .limit(1)
        .session(session)
        .lean();

      const nextRow = nextBest?.[0];
      let nextSubject: string | undefined = (nextRow as any)?.subject;
      let nextTopic: string | undefined = (nextRow as any)?.topic;

      if ((!nextSubject || !nextTopic) && nextRow) {
        const cls = await ClassModel.findById(classId)
          .select({ schedule: 1 })
          .session(session)
          .lean();
        const schedSnap = (cls?.schedule || []).find(
          (s: any) => String(s._id) === String(scheduleId)
        );
        if (!nextSubject && typeof schedSnap?.subject === "string") {
          nextSubject = schedSnap.subject;
        }
        if (!nextTopic && typeof schedSnap?.topic === "string") {
          nextTopic = schedSnap.topic;
        }
      }

      const next = nextRow
        ? {
            attemptId: nextRow.attemptId,
            score: Number(nextRow.score || 0),
            maxScore: Number(nextRow.maxScore || 0),
            finishedAt: nextRow.finishedAt ?? new Date(),
            subject: nextSubject,
            topic: nextTopic,
          }
        : null;

      const contribution = await getScheduleContribution(
        classId,
        scheduleId,
        session
      );
      const prevPct = pct(score, maxScore);
      const nextPct = next ? pct(next.score, next.maxScore) : 0;
      const deltaOverall = (nextPct - prevPct) * contribution;

      const deltaScore = -score + (next ? next.score : 0);
      const deltaMax = -maxScore + (next ? next.maxScore : 0);

      const studentUpdate: any = {
        $set: { updatedAt: new Date() },
        $inc: {
          version: 1,
          sumScore: deltaScore,
          sumMax: deltaMax,
          overallScore: deltaOverall,
        },
      };

      if (next) {
        studentUpdate.$set[`canonicalBySchedule.${scheduleId}`] = {
          attemptId: next.attemptId,
          score: next.score,
          maxScore: next.maxScore,
          finishedAt: next.finishedAt,
          ...(next.subject ? { subject: next.subject } : {}),
          ...(next.topic ? { topic: next.topic } : {}),
        };
      } else {
        studentUpdate.$unset = { [`canonicalBySchedule.${scheduleId}`]: "" };
        studentUpdate.$inc.participationCount = -1;
      }

      // Subject/topic bucket corrections
      if (next) {
        if (prevSubject && next.subject && prevSubject !== next.subject) {
          studentUpdate.$inc[`bySubject.${prevSubject}.sumScore`] =
            (studentUpdate.$inc[`bySubject.${prevSubject}.sumScore`] || 0) -
            score;
          studentUpdate.$inc[`bySubject.${prevSubject}.sumMax`] =
            (studentUpdate.$inc[`bySubject.${prevSubject}.sumMax`] || 0) -
            maxScore;
          studentUpdate.$inc[`bySubject.${prevSubject}.attempts`] =
            (studentUpdate.$inc[`bySubject.${prevSubject}.attempts`] || 0) - 1;

          studentUpdate.$inc[`bySubject.${next.subject}.sumScore`] =
            (studentUpdate.$inc[`bySubject.${next.subject}.sumScore`] || 0) +
            next.score;
          studentUpdate.$inc[`bySubject.${next.subject}.sumMax`] =
            (studentUpdate.$inc[`bySubject.${next.subject}.sumMax`] || 0) +
            next.maxScore;
          studentUpdate.$inc[`bySubject.${next.subject}.attempts`] =
            (studentUpdate.$inc[`bySubject.${next.subject}.attempts`] || 0) + 1;
        } else if (prevSubject || next.subject) {
          const sameSubj = (next.subject ?? prevSubject)!;
          if (deltaScore || deltaMax) {
            studentUpdate.$inc[`bySubject.${sameSubj}.sumScore`] =
              (studentUpdate.$inc[`bySubject.${sameSubj}.sumScore`] || 0) +
              deltaScore;
            studentUpdate.$inc[`bySubject.${sameSubj}.sumMax`] =
              (studentUpdate.$inc[`bySubject.${sameSubj}.sumMax`] || 0) +
              deltaMax;
          }
        }

        if (prevTopic && next.topic && prevTopic !== next.topic) {
          studentUpdate.$inc[`byTopic.${prevTopic}.sumScore`] =
            (studentUpdate.$inc[`byTopic.${prevTopic}.sumScore`] || 0) - score;
          studentUpdate.$inc[`byTopic.${prevTopic}.sumMax`] =
            (studentUpdate.$inc[`byTopic.${prevTopic}.sumMax`] || 0) - maxScore;
          studentUpdate.$inc[`byTopic.${prevTopic}.attempts`] =
            (studentUpdate.$inc[`byTopic.${prevTopic}.attempts`] || 0) - 1;

          studentUpdate.$inc[`byTopic.${next.topic}.sumScore`] =
            (studentUpdate.$inc[`byTopic.${next.topic}.sumScore`] || 0) +
            next.score;
          studentUpdate.$inc[`byTopic.${next.topic}.sumMax`] =
            (studentUpdate.$inc[`byTopic.${next.topic}.sumMax`] || 0) +
            next.maxScore;
          studentUpdate.$inc[`byTopic.${next.topic}.attempts`] =
            (studentUpdate.$inc[`byTopic.${next.topic}.attempts`] || 0) + 1;
        } else if (prevTopic || next.topic) {
          const sameTopic = (next.topic ?? prevTopic)!;
          if (deltaScore || deltaMax) {
            studentUpdate.$inc[`byTopic.${sameTopic}.sumScore`] =
              (studentUpdate.$inc[`byTopic.${sameTopic}.sumScore`] || 0) +
              deltaScore;
            studentUpdate.$inc[`byTopic.${sameTopic}.sumMax`] =
              (studentUpdate.$inc[`byTopic.${sameTopic}.sumMax`] || 0) +
              deltaMax;
          }
        }
      } else {
        if (prevSubject) {
          studentUpdate.$inc[`bySubject.${prevSubject}.sumScore`] =
            (studentUpdate.$inc[`bySubject.${prevSubject}.sumScore`] || 0) -
            score;
          studentUpdate.$inc[`bySubject.${prevSubject}.sumMax`] =
            (studentUpdate.$inc[`bySubject.${prevSubject}.sumMax`] || 0) -
            maxScore;
          studentUpdate.$inc[`bySubject.${prevSubject}.attempts`] =
            (studentUpdate.$inc[`bySubject.${prevSubject}.attempts`] || 0) - 1;
        }
        if (prevTopic) {
          studentUpdate.$inc[`byTopic.${prevTopic}.sumScore`] =
            (studentUpdate.$inc[`byTopic.${prevTopic}.sumScore`] || 0) - score;
          studentUpdate.$inc[`byTopic.${prevTopic}.sumMax`] =
            (studentUpdate.$inc[`byTopic.${prevTopic}.sumMax`] || 0) - maxScore;
          studentUpdate.$inc[`byTopic.${prevTopic}.attempts`] =
            (studentUpdate.$inc[`byTopic.${prevTopic}.attempts`] || 0) - 1;
        }
      }

      await StudentClassStatsModel.updateOne(
        { classId: toId(classId), studentId },
        studentUpdate,
        { session }
      );

      // --- Per-schedule aggregates ---
      await ScheduleStatsModel.updateOne(
        { scheduleId: sid },
        {
          $set: { updatedAt: new Date() },
          $inc: {
            version: 1,
            sumScore: deltaScore,
            sumMax: deltaMax,
            participants: next ? 0 : -1,
          },
        },
        { session }
      );

      // NOTE: We intentionally do **not** touch attendance/streak here.
      // Attendance is sticky and not revoked by invalidations.

      // --- Cleanup empty subject/topic buckets ---
      await pruneEmptySubjectTopicBuckets(classId, studentId, session);
    });
  } finally {
    session.endSession();
  }
}

/**
 * Remove a schedule and reverse all student aggregates that were added
 * when canonical attempts were created for that schedule.
 *
 * Effects per affected student:
 *  - Subtract sumScore/sumMax (from that schedule’s canonical),
 *  - Subtract bySubject/byTopic buckets,
 *  - Subtract weighted overallScore portion using the schedule’s contribution,
 *  - Decrement participationCount,
 *  - Unset the canonical for this schedule.
 *
 * Effects on per-schedule aggregates:
 *  - Delete the ScheduleStats row for this schedule.
 *
 * Does NOT:
 *  - Touch attendance or streaks (attendance is sticky and not revoked).
 *  - Write to ClassStats (since class stats are derived).
 *
 * IMPORTANT:
 *  - Preferred usage when the schedule is already removed in the caller:
 *      pass the captured `contribution` you read before deletion.
 *  - Alternate usage (when the schedule still exists):
 *      omit `contribution` and this function will read it itself.
 */
export async function stats_onScheduleRemoved(
  classId: string,
  scheduleId: string,
  contribution?: number
) {
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      // Fallback: read contribution only if not provided (works only if schedule still exists)
      if (typeof contribution !== "number") {
        contribution = await getScheduleContribution(
          classId,
          scheduleId,
          session
        );
        if (!Number.isFinite(contribution)) contribution = 100; // defensive default
      }

      const cursor = StudentClassStatsModel.find({
        classId: toId(classId),
        [`canonicalBySchedule.${scheduleId}`]: { $exists: true },
      })
        .select({ studentId: 1, canonicalBySchedule: 1 })
        .session(session)
        .lean()
        .cursor();

      for await (const row of cursor as any) {
        const c = row.canonicalBySchedule?.[scheduleId];
        if (!c) continue;

        const score = Number(c.score || 0);
        const maxScore = Number(c.maxScore || 0);
        const subj: string | undefined =
          typeof c.subject === "string" ? c.subject : undefined;
        const topc: string | undefined =
          typeof c.topic === "string" ? c.topic : undefined;

        const p = maxScore > 0 ? score / maxScore : 0;
        const deltaOverall = -p * (contribution as number);

        const studentUpd: any = {
          $inc: {
            version: 1,
            ...(score || maxScore
              ? { sumScore: -score, sumMax: -maxScore }
              : {}),
            ...(deltaOverall ? { overallScore: deltaOverall } : {}),
            participationCount: -1,
          },
          $unset: { [`canonicalBySchedule.${scheduleId}`]: "" },
          $set: { updatedAt: new Date() },
        };

        if (subj) {
          studentUpd.$inc[`bySubject.${subj}.sumScore`] =
            (studentUpd.$inc[`bySubject.${subj}.sumScore`] || 0) - score;
          studentUpd.$inc[`bySubject.${subj}.sumMax`] =
            (studentUpd.$inc[`bySubject.${subj}.sumMax`] || 0) - maxScore;
          studentUpd.$inc[`bySubject.${subj}.attempts`] =
            (studentUpd.$inc[`bySubject.${subj}.attempts`] || 0) - 1;
        }
        if (topc) {
          studentUpd.$inc[`byTopic.${topc}.sumScore`] =
            (studentUpd.$inc[`byTopic.${topc}.sumScore`] || 0) - score;
          studentUpd.$inc[`byTopic.${topc}.sumMax`] =
            (studentUpd.$inc[`byTopic.${topc}.sumMax`] || 0) - maxScore;
          studentUpd.$inc[`byTopic.${topc}.attempts`] =
            (studentUpd.$inc[`byTopic.${topc}.attempts`] || 0) - 1;
        }

        await StudentClassStatsModel.updateOne(
          { classId: toId(classId), studentId: row.studentId },
          studentUpd,
          { session }
        );

        await pruneEmptySubjectTopicBuckets(
          classId,
          String(row.studentId),
          session
        );
      }

      await ScheduleStatsModel.deleteOne(
        { scheduleId: toId(scheduleId) },
        { session }
      );
    });
  } finally {
    session.endSession();
  }
}
