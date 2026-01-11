import { Response } from "express";
import { Types } from "mongoose";
import { CustomRequest } from "../middleware/access-control";
import { ClassModel, IAssignedQuiz } from "../model/class/class-model";
import {
  IStudentClassStats,
  StudentClassStatsModel,
} from "../model/stats/student-stats-model";
import {
  computeParticipationAndAvgScore,
  computeBucketAvgPct,
  computeRanks,
  projectedStreak,
} from "../utils/stats-utils";
import { toPlainObject } from "../utils/utils";
import {
  fetchAttemptsForScheduleByStudentInternal,
  fetchMyQuizMeta,
  fetchStudentAttemptsInternal,
  QuizCanonicalSelector,
} from "../utils/quiz-svc-client";
import {
  AttemptableRow,
  normalizeAllowedAttempts,
  fetchQuizMetaBatch,
} from "../utils/schedule-utils";
import { escapeRegex, applyFilters } from "../utils/student-utils";

/**
 * @route   GET /students/:studentId/profile
 *          Also supports /students/me/profile (student self).
 * @auth    verifyAccessToken + verifyTeacherOfStudentOrSelf
 * @input   Path param: :studentId (string, "me" allowed to mean the authenticated user).
 *
 * @logic   1) Resolve the effective studentId (handling "me").
 *          2) Find the most recently updated class that contains this student
 *             (ClassModel.findOne({ "students.userId": studentId }).sort({ updatedAt: -1 })).
 *          3) Load the StudentClassStats row for (classId, studentId).
 *          4) Compute:
 *               - participationPct and avgScorePct from participationCount/sumScore/sumMax
 *               - projected streakDays using projectedStreak(lastStreakDate, class timezone)
 *               - rank within the class using overallScore (standard competition ranking).
 *          5) Return a class-scoped profile payload with display info + stats.
 *
 * @notes   - For now, we maintain the invariant that each student belongs to a single class.
 *            Under this invariant, this endpoint behaves "as if" it were class-agnostic,
 *            since there is only one class to read from.
 *          - The sort({ updatedAt: -1 }) is defensive: if the invariant is temporarily
 *            violated (e.g. during a migration), we pick a consistent "primary" class
 *            for this profile.
 *          - In future, when students may belong to multiple classes, this endpoint is
 *            expected to evolve into a truly class-agnostic / multi-class profile
 *            (e.g. aggregate view and/or per-class breakdown), and this assumption
 *            should be revisited.
 *
 * @returns 200 {
 *            ok: true,
 *            data: {
 *              userId: string,
 *              displayName: string,
 *              photoUrl: string | null,
 *              className: string,
 *              rank: number,
 *              stats: {
 *                classId: string,
 *                studentId: string,
 *                sumScore: number,
 *                sumMax: number,
 *                participationCount: number,
 *                participationPct: number,
 *                avgScorePct: number,
 *                streakDays: number,
 *                bestStreakDays: number,
 *                lastStreakDate: string | null,
 *                overallScore: number,
 *                version: number,
 *                updatedAt: string | null,
 *              },
 *            },
 *          }
 *
 * @errors  400 Invalid studentId.
 *          404 Class or student not found for this studentId.
 *          500 Internal server error.
 */

export async function getStudentProfile(req: CustomRequest, res: Response) {
  try {
    // ── 1) Resolve studentId ("me" supported)
    const paramId = String(req.params.studentId || "");
    const studentId =
      paramId === "me" && req.user?.id ? String(req.user.id) : paramId;

    if (!studentId || !Types.ObjectId.isValid(studentId)) {
      return res.status(400).json({ ok: false, message: "Invalid studentId" });
    }

    // ── 2) Find ONE class containing this student (latest updated if multiple)

    // NOTE: We currently rely on the invariant that each student belongs to at most
    // one class. The sort({ updatedAt: -1 }) is defensive in case that invariant
    // is temporarily violated; it picks a consistent "primary" class.
    const klass = await ClassModel.findOne({ "students.userId": studentId })
      .select({ students: 1, schedule: 1, name: 1, timezone: 1, updatedAt: 1 })
      .sort({ updatedAt: -1 })
      .lean({ virtuals: true });

    if (!klass) {
      return res
        .status(404)
        .json({ ok: false, message: "Class not found for this student" });
    }

    const classId = String(klass._id);
    const s = (klass.students || []).find(
      (x: any) => String(x.userId) === String(studentId)
    );
    if (!s) {
      return res
        .status(404)
        .json({ ok: false, message: "Student not found in class" });
    }

    // ── 3) Load student stats for this class
    const st =
      (await StudentClassStatsModel.findOne({
        classId,
        studentId,
      }).lean()) || ({} as Partial<IStudentClassStats>);

    const tz = klass.timezone || "Asia/Singapore";
    const now = new Date();
    const eligibleAssigned = (klass.schedule || []).filter(
      (it: any) => new Date(it.startDate) <= now
    ).length;

    const { participationPct, avgScorePct } = computeParticipationAndAvgScore({
      participations: st.participationCount ?? 0,
      eligibleAssigned,
      sumScore: st.sumScore ?? 0,
      sumMax: st.sumMax ?? 0,
    });

    const streakDays = projectedStreak(st.lastStreakDate, tz)
      ? st.streakDays ?? 0
      : 0;

    // Rank within class (standard competition ranking)
    const all = await StudentClassStatsModel.find({ classId })
      .select({ overallScore: 1 })
      .lean();
    const getRank = computeRanks(all as any);
    const rank = getRank(st.overallScore ?? 0);

    // ── 5) Respond with class-scoped profile (single class assumed)
    return res.json({
      ok: true,
      data: {
        userId: String(studentId),
        displayName: s.displayName,
        photoUrl: s.photoUrl ?? null,
        className: s.className ?? klass.name ?? "",
        rank,
        stats: {
          classId,
          studentId: String(studentId),
          sumScore: st.sumScore ?? 0,
          sumMax: st.sumMax ?? 0,
          participationCount: st.participationCount ?? 0,
          participationPct,
          avgScorePct,
          streakDays,
          bestStreakDays: st.bestStreakDays ?? 0,
          lastStreakDate: st.lastStreakDate ?? null,
          overallScore: st.overallScore ?? 0,
          version: st.version ?? 0,
          updatedAt: st.updatedAt ?? null,
        },
      },
    });
  } catch (e) {
    console.error("[getStudentProfile] error", e);
    return res
      .status(500)
      .json({ ok: false, message: "Internal server error" });
  }
}

/**
 * @route   GET /students/:studentId/attemptable-schedules
 *          Also supports /students/me/attemptable-schedules
 * @auth    verifyAccessToken + verifyTeacherOfStudentOrSelf
 * @input   Path param: :studentId (string, "me" allowed to mean the authenticated user).
 *
 * @logic   1) Resolve the effective studentId (handling "me") and the viewerId (req.user.id).
 *          2) Ensure the viewer is authenticated; otherwise 401.
 *          3) Via aggregation on ClassModel:
 *               - Match all classes where students.userId == studentId.
 *               - Unwind schedule.
 *               - Filter schedules where now is within [startDate, endDate].
 *               - Project only the schedule fields needed for the API.
 *          4) For each open schedule, call quiz-svc internally to fetch attempts
 *             for (scheduleId, studentId) and count only finalized attempts.
 *          5) Normalize attemptsAllowed to [1, 10] and compute attemptsRemaining
 *             = max(0, attemptsAllowed - finalizedCount).
 *          6) Filter out schedules where attemptsRemaining <= 0.
 *          7) Enrich remaining rows with quiz meta via canonical identity
 *             (quizRootId + quizVersion) using fetchQuizMetaBatch.
 *          8) Sort the final list by the soonest endDate, then by startDate.
 *
 * @notes   - The current product invariant is that each student belongs to a single class.
 *            Under this invariant, the "multi-class" aggregation behaves like a simple
 *            class-scoped query because there is effectively only one class.
 *          - The implementation is intentionally written to support multiple classes:
 *              - It matches *all* classes containing the student.
 *              - Each returned row carries a classId alongside scheduleId.
 *          - In a future multi-class world, this endpoint is already positioned to
 *            represent "all attemptable schedules across all of the student's classes",
 *            and clients may later add filters (e.g. ?classId=...) for finer control.
 *
 * @returns 200 {
 *            ok: true,
 *            data: AttemptableRow[]
 *          }
 *          where AttemptableRow is:
 *            {
 *              classId: string;
 *              scheduleId: string;
 *              quizId: string;
 *              quizRootId: string;              // empty string if canonical identity missing
 *              quizVersion: number;             // defaults to 1 if not set on schedule
 *              startDate: string;               // ISO
 *              endDate: string;                 // ISO
 *              attemptsAllowed: number;         // normalized [1,10]
 *              showAnswersAfterAttempt: boolean;
 *              attemptsCount: number;           // finalized attempts so far
 *              attemptsRemaining: number;       // > 0 for all returned rows
 *              quizName: string | null;
 *              subject: string | null;
 *              subjectColor: string | null;
 *            }
 *
 * @errors  401 Unauthorized (missing viewer identity).
 *          400 Invalid studentId.
 *          500 Internal server error (including quiz-svc failures beyond the local fallback).
 */
export async function getAttemptableSchedulesForStudent(
  req: CustomRequest,
  res: Response
) {
  try {
    // Resolve :studentId or "me"
    const viewerId = String(req.user?.id || "");
    const paramId = String(req.params.studentId || "");
    const studentId = paramId === "me" ? viewerId : paramId;

    if (!viewerId)
      return res.status(401).json({ ok: false, message: "Unauthorized" });
    if (!studentId || !Types.ObjectId.isValid(studentId))
      return res.status(400).json({ ok: false, message: "Invalid studentId" });

    const now = new Date();

    type OpenRow = {
      _id: any; // classId
      schedule: {
        _id: any;

        // concrete + canonical quiz identity
        quizId: string;
        quizRootId?: any;
        quizVersion?: number;

        startDate: Date;
        endDate: Date;
        contribution?: number;
        attemptsAllowed?: number;
        showAnswersAfterAttempt?: boolean;
        quizName?: string;
        subject?: string;
        subjectColor?: string;
      };
    };

    // Mongo: find only "open now" schedules for classes the student is in
    const rows = await ClassModel.aggregate<OpenRow>([
      { $match: { "students.userId": String(studentId) } },
      { $unwind: "$schedule" },
      {
        $match: {
          "schedule.startDate": { $lte: now },
          "schedule.endDate": { $gte: now },
        },
      },
      {
        $project: {
          _id: 1, // classId
          schedule: {
            _id: "$schedule._id",
            quizId: "$schedule.quizId",
            quizRootId: "$schedule.quizRootId",
            quizVersion: "$schedule.quizVersion",
            startDate: "$schedule.startDate",
            endDate: "$schedule.endDate",
            contribution: "$schedule.contribution",
            attemptsAllowed: "$schedule.attemptsAllowed",
            showAnswersAfterAttempt: "$schedule.showAnswersAfterAttempt",
            quizName: "$schedule.quizName",
            subject: "$schedule.subject",
            subjectColor: "$schedule.subjectColor",
          },
        },
      },
    ]).exec();

    if (!rows.length) {
      return res.json({ ok: true, data: [] as AttemptableRow[] });
    }

    // Per-schedule attempt counts (exclude invalidated)
    const attemptsByScheduleId: Record<string, number> = {};
    await Promise.all(
      rows.map(async ({ schedule }) => {
        const sid = String(schedule._id);
        try {
          const r = await fetchAttemptsForScheduleByStudentInternal(
            sid,
            String(studentId)
          );
          attemptsByScheduleId[sid] = (r.rows || []).filter(
            (a) => a.state === "finalized"
          ).length;
        } catch {
          // On failure, assume 0 (still attemptable if within limit)
          attemptsByScheduleId[sid] = 0;
        }
      })
    );

    // Build prelim rows and compute remaining attempts
    const prelim: AttemptableRow[] = rows.map(({ _id: classId, schedule }) => {
      const sid = String(schedule._id);
      const allowed = normalizeAllowedAttempts(schedule.attemptsAllowed);
      const count = attemptsByScheduleId[sid] ?? 0;
      const remaining = Math.max(0, allowed - count);

      const root =
        schedule.quizRootId != null ? String(schedule.quizRootId) : "";

      return {
        classId: String(classId),
        scheduleId: sid,

        quizId: String(schedule.quizId),

        // Canonical identity: if missing, quizRootId will be empty string and skipped in meta fetch
        quizRootId: root,
        quizVersion:
          typeof schedule.quizVersion === "number" ? schedule.quizVersion : 1,

        startDate: new Date(schedule.startDate).toISOString(),
        endDate: new Date(schedule.endDate).toISOString(),
        attemptsAllowed: allowed,
        showAnswersAfterAttempt: Boolean(schedule.showAnswersAfterAttempt),
        attemptsCount: count,
        attemptsRemaining: remaining,
        quizName: schedule.quizName ?? null,
        subject: schedule.subject ?? null,
        subjectColor: schedule.subjectColor ?? null,
      };
    });

    // Keep only attemptable (remaining > 0)
    const attemptable = prelim.filter((r) => r.attemptsRemaining > 0);
    if (!attemptable.length) {
      return res.json({ ok: true, data: [] as AttemptableRow[] });
    }

    // Attach live quiz meta via canonical identity
    const selectors: QuizCanonicalSelector[] = [];
    for (const r of attemptable) {
      if (r.quizRootId && r.quizVersion) {
        selectors.push({
          rootQuizId: r.quizRootId,
          version: r.quizVersion,
        });
      }
    }

    const metaByCanonical = await fetchQuizMetaBatch(selectors);

    const data: AttemptableRow[] = attemptable.map((r) => {
      let meta: any;
      if (r.quizRootId && r.quizVersion) {
        const key = `${r.quizRootId}:${r.quizVersion}`;
        meta = metaByCanonical[key];
      }

      return {
        ...r,
        quizName: meta?.name ?? r.quizName ?? null,
        subject: meta?.subject ?? r.subject ?? null,
        subjectColor: meta?.subjectColorHex ?? r.subjectColor ?? null,
      };
    });

    // Sort by soonest endDate (then startDate)
    data.sort(
      (a, b) =>
        new Date(a.endDate).getTime() - new Date(b.endDate).getTime() ||
        new Date(a.startDate).getTime() - new Date(b.startDate).getTime()
    );

    return res.json({ ok: true, data });
  } catch (e: any) {
    console.error("[getAttemptableSchedulesForStudent] error", e);
    return res
      .status(500)
      .json({ ok: false, message: "Internal server error" });
  }
}

/**
 * @route   GET /students/:studentId/schedule-summary
 *          Also supports /students/me/schedule-summary
 * @auth    verifyAccessToken + verifyTeacherOfStudentOrSelf
 *
 * @input   Path param: :studentId (string, "me" allowed to mean the authenticated user).
 *
 * @query   name        (optional string) – fuzzy match on quiz name (case-insensitive).
 *          subject     (optional string) – exact subject filter.
 *          topic       (optional string) – exact topic filter.
 *          latestFrom  (optional ISO date) – include only schedules where the latest
 *                        attempt time is >= this date.
 *          latestTo    (optional ISO date) – include only schedules where the latest
 *                        attempt time is <= this date.
 *
 * @logic   1) Resolve the effective studentId (handling "me").
 *          2) Load ALL classes that contain this student in students.userId, selecting:
 *               - name, students, and schedule._id for ghost-schedule pruning.
 *          3) If no classes are found, return an empty schedules array.
 *          4) Build:
 *               - classIds: all class _id strings.
 *               - classNameById: map classId -> className.
 *               - scheduleIdSetByClass: map classId -> Set of scheduleIds currently
 *                 present in the embedded schedule array (used to prune ghosts).
 *          5) Defensive roster check: ensure the student is indeed on the roster
 *             of at least one of the loaded classes.
 *          6) Load StudentClassStats rows for (classId ∈ classIds, studentId),
 *             and build canonicalByClass[classId][scheduleId] from canonicalBySchedule.
 *          7) Fetch ALL attempts for this student from quiz-svc via
 *             fetchStudentAttemptsInternal(studentId).
 *          8) Keep only attempts that:
 *               - belong to one of the found classes (classId ∈ classIds), and
 *               - have a scheduleId.
 *          9) Group these attempts by (classId, scheduleId):
 *               - accumulate all attempts per key.
 *               - choose the "latest" attempt per key based on finishedAt / startedAt / createdAt.
 *         10) Prune "ghost" schedule groups (Fix A): if a (classId, scheduleId) pair
 *             does not exist in that class's embedded schedule array, drop it from the summary.
 *         11) For each remaining (classId, scheduleId):
 *               - Build a ScheduleRow including:
 *                   - classId, className, scheduleId,
 *                   - quiz display info (name, subject, subjectColorHex, topic),
 *                   - latestAttemptId + latestAt (derived from chosen latest attempt),
 *                   - attemptsCount,
 *                   - canonical block (if present) with attemptId, score, maxScore, gradePct.
 *         12) Apply filters (nameRegex, subject, topic, latestFrom, latestTo) via applyFilters.
 *         13) Return the filtered schedules with the resolved studentId.
 *
 * @notes   - The current product invariant is that each student belongs to a single class.
 *            Under this invariant, the response will effectively look like a per-class summary
 *            even though the implementation is multi-class aware.
 *          - The implementation is intentionally written to support multiple classes:
 *              - It loads all classes that contain the student.
 *              - It groups attempts by (classId, scheduleId) and returns classId + className
 *                on each ScheduleRow.
 *          - In a future multi-class setup, this endpoint naturally becomes a
 *            cross-class "attempts by schedule" summary for the student, and
 *            clients can treat classId as a first-class dimension (e.g. filter or group by class).
 *
 * @returns 200 {
 *            ok: true,
 *            data: {
 *              studentId: string,
 *              schedules: ScheduleRow[]
 *            }
 *          }
 *          where ScheduleRow is:
 *            {
 *              classId: string;
 *              className: string;
 *              scheduleId: string;
 *              quizName: string;
 *              subject: string | null;
 *              subjectColorHex: string | null;
 *              topic: string | null;
 *              latestAttemptId?: string;
 *              latestAt?: string;          // ISO, from finishedAt/startedAt/createdAt
 *              attemptsCount: number;
 *              canonical?: {
 *                attemptId: string;
 *                score: number;
 *                maxScore: number;
 *                gradePct: number;        // rounded percentage
 *              };
 *            }
 *
 * @errors  400 Invalid studentId.
 *          404 Student not found in any class (defensive roster check).
 *          401/403 Proxied from upstream when quiz-svc (or other upstream) returns auth errors.
 *          502 Upstream error (for other 4xx/5xx statuses surfaced via e.status).
 *          500 Internal server error.
 */
export async function getStudentAttemptsScheduleSummary(
  req: CustomRequest,
  res: Response
) {
  try {
    // ── filters from query
    const qName =
      typeof req.query.name === "string" ? req.query.name.trim() : "";
    const qSubject =
      typeof req.query.subject === "string" ? req.query.subject.trim() : "";
    const qTopic =
      typeof req.query.topic === "string" ? req.query.topic.trim() : "";
    const qFromStr =
      typeof req.query.latestFrom === "string" ? req.query.latestFrom : "";
    const qToStr =
      typeof req.query.latestTo === "string" ? req.query.latestTo : "";

    const latestFrom = qFromStr ? new Date(qFromStr) : null;
    const latestTo = qToStr ? new Date(qToStr) : null;
    const nameRegex = qName ? new RegExp(escapeRegex(qName), "i") : null;

    // Resolve :studentId or "me"
    const paramId = String(req.params.studentId || "");
    const studentId =
      paramId === "me" && req.user?.id ? String(req.user.id) : paramId;

    if (!studentId || !Types.ObjectId.isValid(studentId)) {
      return res.status(400).json({ ok: false, message: "Invalid studentId" });
    }

    // ── 1) Load ALL classes this student is in (need: name + schedule ids to prune ghost schedules)
    const classes = await ClassModel.find({ "students.userId": studentId })
      .select({ name: 1, students: 1, "schedule._id": 1 })
      .lean<
        {
          _id: Types.ObjectId | string;
          name?: string;
          students?: Array<{ userId: string }>;
          schedule?: Array<{ _id: Types.ObjectId | string }>;
        }[]
      >();

    if (!classes.length) {
      return res.json({
        ok: true,
        data: { studentId: String(studentId), schedules: [] as any[] },
      });
    }

    // Build helpers
    const classIds = classes.map((c) => String(c._id));
    const classNameById = Object.fromEntries(
      classes.map((c) => [String(c._id), c.name ?? ""])
    );
    // Map classId -> Set of existing scheduleIds (stringified) for Fix A
    const scheduleIdSetByClass = new Map<string, Set<string>>();
    for (const c of classes) {
      const cid = String(c._id);
      const set = new Set<string>((c.schedule || []).map((s) => String(s._id)));
      scheduleIdSetByClass.set(cid, set);
    }

    // Defensive: roster validation (should already be guaranteed by the query)
    const onRoster = classes.some((k) =>
      (k.students || []).some((s) => String(s.userId) === String(studentId))
    );
    if (!onRoster) {
      return res
        .status(404)
        .json({ ok: false, message: "Student not found in any class" });
    }

    // ── 2) Load class-scoped canonical stats for each class
    type CanonicalBySchedule = Record<
      string,
      { attemptId: string | any; score: number; maxScore: number }
    >;
    const canonicalByClass: Record<string, CanonicalBySchedule> = {};
    const statsRows = await StudentClassStatsModel.find({
      classId: { $in: classIds },
      studentId,
    })
      .select({ classId: 1, canonicalBySchedule: 1 })
      .lean<{ classId: any; canonicalBySchedule?: CanonicalBySchedule }[]>();

    for (const s of statsRows) {
      canonicalByClass[String(s.classId)] =
        (s.canonicalBySchedule as any) || {};
    }

    // ── 3) Fetch ALL attempts (quiz-svc internal)
    const allAttempts = await fetchStudentAttemptsInternal(studentId);
    type AttemptLite = {
      _id: any;
      classId: any;
      scheduleId?: string;
      quiz?: {
        name?: string;
        subject?: string;
        subjectColorHex?: string;
        topic?: string;
      };
      startedAt?: string;
      finishedAt?: string;
      createdAt?: string;
      state?: string;
    };
    const attempts: AttemptLite[] = Array.isArray((allAttempts as any)?.rows)
      ? (allAttempts as any).rows
      : [];

    // Keep only attempts within found classes and having a scheduleId
    const scoped = attempts.filter(
      (a) => a.scheduleId && a.classId && classIds.includes(String(a.classId))
    );

    // ── 4) Group by (classId, scheduleId) and pick latest
    type SchedulePack = { attempts: AttemptLite[]; latest?: AttemptLite };
    const byKey = new Map<string, SchedulePack>(); // key = `${classId}::${scheduleId}`

    const bestTime = (a: AttemptLite) =>
      new Date(a.finishedAt || a.startedAt || a.createdAt || 0).getTime();

    for (const r of scoped) {
      const cId = String(r.classId);
      const sId = String(r.scheduleId);
      const key = `${cId}::${sId}`;

      const pack = byKey.get(key) ?? { attempts: [] };
      pack.attempts.push(r);
      if (!pack.latest || bestTime(r) > bestTime(pack.latest)) {
        pack.latest = r;
      }
      byKey.set(key, pack);
    }

    /**
     * Fix A: prune schedule groups whose scheduleId no longer exists
     * in the class’s embedded `schedule` array.
     */
    if (byKey.size > 0) {
      for (const key of Array.from(byKey.keys())) {
        const [cId, sId] = key.split("::");
        const set = scheduleIdSetByClass.get(cId) || new Set<string>();
        if (!set.has(String(sId))) {
          byKey.delete(key); // remove ghost schedule group
        }
      }
    }

    // ── 5) Build rows
    const pct = (score?: number, max?: number) =>
      max && max > 0 ? Math.round((Number(score || 0) / Number(max)) * 100) : 0;

    type ScheduleRow = {
      classId: string;
      className: string;
      scheduleId: string;
      quizName: string;
      subject: string | null;
      subjectColorHex: string | null;
      topic: string | null;
      latestAttemptId?: string;
      latestAt?: string;
      attemptsCount: number;
      canonical?: {
        attemptId: string;
        score: number;
        maxScore: number;
        gradePct: number;
      };
    };

    let schedules: ScheduleRow[] = Array.from(byKey.entries()).map(
      ([, pack]) => {
        const latest = pack.latest!;
        const classId = String(latest.classId);
        const scheduleId = String(latest.scheduleId);
        const quizName = latest?.quiz?.name ?? "Untitled Quiz";
        const subject = latest?.quiz?.subject ?? null;
        const subjectColorHex = latest?.quiz?.subjectColorHex ?? null;
        const topic = latest?.quiz?.topic ?? null;

        const canonicalMap = canonicalByClass[classId] || {};
        const can = canonicalMap[scheduleId];
        const canonical = can
          ? {
              attemptId: String(can.attemptId),
              score: Number(can.score ?? 0),
              maxScore: Number(can.maxScore ?? 0),
              gradePct: pct(can.score, can.maxScore),
            }
          : undefined;

        const latestAtRaw =
          latest?.finishedAt || latest?.startedAt || latest?.createdAt;
        const latestAt = latestAtRaw
          ? new Date(latestAtRaw).toISOString()
          : undefined;

        return {
          classId,
          className: classNameById[classId] ?? "",
          scheduleId,
          quizName,
          subject,
          subjectColorHex,
          topic,
          latestAttemptId: latest?._id ? String(latest._id) : undefined,
          latestAt,
          attemptsCount: pack.attempts.length,
          ...(canonical ? { canonical } : {}),
        };
      }
    );

    // ── apply filters
    schedules = applyFilters(schedules, {
      nameRegex,
      subject: qSubject,
      topic: qTopic,
      latestFrom,
      latestTo,
    });

    // ── 6) Respond
    return res.json({
      ok: true,
      data: {
        studentId: String(studentId),
        schedules,
      },
    });
  } catch (e: any) {
    if (typeof e?.status === "number" && e.status >= 400 && e.status < 600) {
      return res
        .status(e.status === 401 || e.status === 403 ? e.status : 502)
        .json({ ok: false, message: e?.message || "Upstream error" });
    }
    console.error("[getStudentAttemptsScheduleSummaryAllClasses] error", e);
    return res
      .status(500)
      .json({ ok: false, message: "Internal server error" });
  }
}
