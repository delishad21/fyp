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
} from "../utils/quiz-svc-client";
import {
  AttemptableRow,
  normalizeAllowedAttempts,
  fetchQuizMetaBatch,
} from "../utils/schedule-utils";
import { escapeRegex, applyFilters } from "../utils/student-utils";

/**
 * @route  GET /students/:studentId/profile
 *         Also supports /students/me/profile (student self)
 * @auth   verifyAccessToken + verifyTeacherOfStudentOrSelf
 * @input  Params: { studentId | "me" }
 * @notes  - Class-agnostic entry point that infers the student's (single) class by roster membership.
 *         - For now we assume the student belongs to exactly one class; if multiple are found, the most recently updated is used.
 *         - Mirrors the shape of the class-scoped student profile endpoint.
 *         - Enriches subjects with colorHex via quiz-svc `/quiz/meta` (fallback to schedule/live meta).
 * @logic  1) Resolve target studentId (honor "me"); load ONE class containing the student (by updatedAt desc).
 *         2) Load the student’s class-scoped stats; compute participationPct/avgScorePct.
 *         3) Compute rank within the class (standard competition ranking) using all students’ overallScore.
 *         4) Fetch subject palette from quiz-svc and attach color to each `stats.bySubject` bucket.
 * @returns 200 {
 *   ok, data: {
 *     userId, displayName, photoUrl?, className, rank,
 *     stats: {
 *       classId, studentId,
 *       sumScore, sumMax, participationCount, participationPct, avgScorePct,
 *       streakDays, bestStreakDays, lastStreakDate, overallScore,
 *       canonicalBySchedule, attendanceDays,
 *       bySubject: { [subject]: { attempts, sumMax, sumScore, color? } },
 *       byTopic, subjectsAvgPct, topicsAvgPct, subjectColors, version, updatedAt
 *     }
 *   }
 * }
 * @errors  400 invalid studentId
 *          404 class or student not found
 *          500 internal server error
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
 * @route  GET /students/:studentId/attemptable-schedules
 * @auth   verifyAccessToken + verifyTeacherOfStudentOrSelf
 * @input  Params: { studentId }  // supports "me"
 * @notes  - Aggregates all classes the student is enrolled in and returns only schedules whose window is currently open.
 *         - Counts the student's attempts per schedule via quiz-svc (internal), excluding invalidated attempts.
 *         - Applies attemptsAllowed (default 1, min 1, max 10) to compute attemptsRemaining.
 *         - Returns only schedules with attemptsRemaining > 0.
 *         - Attaches live quiz meta best-effort.
 * @returns 200 { ok, data: AttemptableRow[] }
 * @errors  400 invalid studentId
 *          401 unauthorized
 *          500 internal server error
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
        quizId: string;
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

    // Mongo does the heavy lifting: find only "open now" schedules for classes the student is in
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

    // Collect per-schedule attempt counts (exclude invalidated)
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
            (a) => a.state == "finalized"
          ).length;
        } catch {
          // On failure, assume 0 to be conservative (still attemptable if within limit)
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

      return {
        classId: String(classId),
        scheduleId: sid,
        quizId: String(schedule.quizId),
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

    // Attach live quiz meta (best-effort)
    const quizIds = Array.from(new Set(attemptable.map((r) => r.quizId)));
    const byId = await fetchQuizMetaBatch(quizIds);

    const data = attemptable.map((r) => {
      const meta = byId[r.quizId];
      return {
        ...r,
        quizName: meta?.name ?? r.quizName ?? null,
        subject: meta?.subject ?? r.subject ?? null,
        subjectColor: meta?.subjectColorHex ?? r.subjectColor ?? null,
        topic: meta?.topic ?? null,
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
 * @route  GET /students/:studentId/schedule-summary
 *         Also supports /students/me/schedule-summary
 * @query  ?name=&subject=&topic=&latestFrom=&latestTo=
 *         - name: case-insensitive substring on quizName
 *         - subject, topic: case-insensitive exact match
 *         - latestFrom/latestTo: ISO datetime bounds on latestAt (inclusive)
 * @auth   verifyAccessToken + verifyTeacherOfStudentOrSelf
 * @input  Params: { studentId | "me" }
 * @notes  - Aggregates across ALL classes the student is enrolled in.
 *         - ONE row per schedule the student has attempted (per class).
 *         - Surfaces quiz meta from the latest attempt per schedule (by finishedAt, fallback startedAt/createdAt).
 *         - Attaches canonical contribution if present in the *class-scoped* stats for that schedule.
 *         - **Fix A**: prunes schedules that no longer exist in each class’s embedded `schedule` array.
 * @returns 200 {
 *   ok: true,
 *   data: {
 *     studentId: string,
 *     schedules: Array<{
 *       classId: string,
 *       className: string,
 *       scheduleId: string,
 *       quizName: string,
 *       subject: string|null,
 *       subjectColorHex: string|null,
 *       topic: string|null,
 *       latestAttemptId?: string,
 *       latestAt?: string,          // ISO
 *       attemptsCount: number,
 *       canonical?: {
 *         attemptId: string,
 *         score: number,
 *         maxScore: number,
 *         gradePct: number
 *       }
 *     }>
 *   }
 * }
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
     * ──────────────────────────────────────────────────────────────────────────
     *  FIX A (embedded schedules across all classes):
     *    - We must prune any (classId, scheduleId) group whose scheduleId is NOT
     *      present in that class’s embedded `schedule` array.
     *    - This prevents the summary from showing schedules that were deleted.
     * ──────────────────────────────────────────────────────────────────────────
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
    // ──────────────────────────────────────────────────────────────────────────

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
