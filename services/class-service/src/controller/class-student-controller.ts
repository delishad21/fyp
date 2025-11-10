import { Response } from "express";
import { CustomRequest } from "../middleware/access-control";
import { ClassModel } from "../model/class/class-model";
import {
  bulkCreateStudents,
  bulkDeleteStudents,
  CreatedStudent,
  deleteStudentInUserSvc,
} from "../utils/user-svc-client";
import { validateStudentsBlock } from "../model/students/student-validation";
import { StudentClassStatsModel } from "../model/stats/student-stats-model";
import mongoose, { Types } from "mongoose";
import {
  fetchMyQuizMeta,
  fetchStudentAttemptsInternal,
} from "../utils/quiz-svc-client";
import {
  computeParticipationAndAvgScore,
  projectedStreak,
  computeRanks,
  computeBucketAvgPct,
} from "../utils/stats-utils";
import {
  applyFilters,
  AttemptLite,
  CanonicalBySchedule,
  escapeRegex,
  SchedulePack,
  ScheduleRow,
  toClassStudent,
} from "../utils/student-utils";
import { pct, toPlainObject } from "../utils/utils";

/**
 * @route  POST /classes/:id/students
 * @auth   verifyAccessToken + verifyClassOwnerOrAdmin
 * @input  Params: { id }
 *         Body:   { students: { name, username, email? }[], includePasswords?, defaultStudentPhotoUrl? }
 *         Query:  includePasswords?=true|false
 * @notes  - All-or-nothing semantics for class-side changes (roster + stats) via a MongoDB transaction.
 *         - If any failure happens after creating accounts in user-svc, newly created accounts are rolled back
 *           via bulkDeleteStudents (compensation).
 *         - If some created accounts are NOT appended to the class due to dedupe, those unused accounts are deleted
 *           after the transaction succeeds (to avoid orphaned users).
 *         - Streak fields seeded as:
 *             - streakDays: 0 (no attendance yet)
 *             - bestStreakDays: 0 (historic best starts at 0)
 *             - lastStreakDate: null
 * @logic  1) Validate student rows
 *         2) Create accounts in user-svc
 *         3) TX: dedupe, append to roster, seed StudentClassStats
 *            - If TX fails → delete ALL newly created accounts
 *         4) After TX success: delete any created-but-not-added (orphans)
 *         5) Respond with updated roster + issued credentials for added users
 * @returns 200 { ok, data: Class.students[], issuedCredentials? }
 * @errors  400 validation errors (per-row)
 *          404 class not found
 *          409 user-svc row errors
 *          502 user-svc failure
 *          500 internal server error
 */
export async function addStudents(req: CustomRequest, res: Response) {
  const session = await mongoose.startSession();

  // Best-effort compensation helper
  async function bulkDeleteSafe(userIds: string[]) {
    try {
      if (userIds.length) {
        await bulkDeleteStudents(userIds, req.headers.authorization || "");
      }
    } catch (e) {
      // Do not throw; log and move on (compensation should not mask original error)
      console.warn("[addStudents] compensation bulkDelete failed", e);
    }
  }

  let created: CreatedStudent[] = [];
  try {
    // Step 1: Validate block
    const { id } = req.params;
    const rawStudents = Array.isArray(req.body?.students)
      ? req.body.students
      : [];

    const {
      normalized,
      errors: rowErrors,
      isValid,
    } = validateStudentsBlock(rawStudents);

    if (!isValid) {
      const withRowFlag = rowErrors.map((e) =>
        e ? { ...e, _error: "Invalid student data" } : undefined
      );
      return res.status(400).json({
        ok: false,
        message: "Validation failed",
        errors: { students: withRowFlag },
      });
    }

    // Step 2: Load class
    const klass = await ClassModel.findById(id);
    if (!klass) {
      return res.status(404).json({ ok: false, message: "Class not found" });
    }

    const defaultPhotoUrl: string | undefined =
      (typeof req.body?.defaultStudentPhotoUrl === "string" &&
        req.body.defaultStudentPhotoUrl.trim()) ||
      process.env.DEFAULT_STUDENT_PHOTO_URL ||
      undefined;

    // Step 3: Create accounts in user-svc (outside TX)
    const includePw =
      String(
        req.query?.includePasswords ?? req.body?.includePasswords ?? ""
      ).toLowerCase() === "true";

    try {
      created = await bulkCreateStudents(
        normalized,
        req.headers.authorization || "",
        { includePasswords: includePw }
      );
    } catch (e: any) {
      if (e?.errors?.students && Array.isArray(e.errors.students)) {
        return res.status(e.status ?? 409).json({
          ok: false,
          message: e.message || "Some student accounts could not be created.",
          errors: { students: e.errors.students },
        });
      }
      const status = e?.status ?? 502;
      return res.status(status).json({
        ok: false,
        message: e?.message || "Failed to create students",
      });
    }

    // Early exit if nothing was created
    if (!created.length) {
      const currentOnly = await ClassModel.findById(klass._id)
        .select("students")
        .lean();
      return res.json({ ok: true, data: currentOnly?.students ?? [] });
    }

    // Prepare convenience lookups
    const createdById = new Map<string, CreatedStudent>(
      created.map((c) => [String(c.userId), c])
    );

    // Step 4: Transaction — append deduped students + seed stats
    let addedIds: string[] = [];
    await session.withTransaction(async () => {
      // Refresh class inside TX
      const c = await ClassModel.findById(klass._id)
        .session(session)
        .select({ name: 1, students: 1 })
        .lean(false); // need doc for updateOne $push
      if (!c) {
        throw new Error("Class not found (race)");
      }

      const existingIds = new Set(
        (c.students ?? []).map((s: any) => String(s.userId))
      );

      const toAddDocs = created
        .map((s) => toClassStudent(s, c.name, defaultPhotoUrl))
        .filter((s) => !existingIds.has(String(s.userId)));

      // If dedupe filtered everything out:
      if (toAddDocs.length === 0) {
        // Roll back ALL newly created user accounts (since none are added to class)
        const error = new Error("No new students to add") as any;
        error._noop = true;
        throw error;
      }

      // Append to roster
      await ClassModel.updateOne(
        { _id: c._id },
        {
          $push: { students: { $each: toAddDocs } },
          $set: { updatedAt: new Date() },
        },
        { session }
      );

      // Seed StudentClassStats for each added student
      const now = new Date();
      await StudentClassStatsModel.insertMany(
        toAddDocs.map((s) => ({
          classId: c._id,
          studentId: s.userId,
          sumScore: 0,
          sumMax: 0,
          participationCount: 0,
          // streak seed — last earned run = 0, best ever = 0
          streakDays: 0,
          bestStreakDays: 0,
          lastStreakDate: null,
          overallScore: 0,
          canonicalBySchedule: {},
          attendanceDays: {},
          bySubject: {},
          byTopic: {},
          version: 0,
          updatedAt: now,
        })),
        { session, ordered: false }
      );

      addedIds = toAddDocs.map((d) => String(d.userId));
    });

    // Step 5: After TX success — delete any created-but-not-added (orphans)
    const addedSet = new Set(addedIds);
    const orphanIds = created
      .map((c) => String(c.userId))
      .filter((uid) => !addedSet.has(uid));
    if (orphanIds.length) {
      await bulkDeleteSafe(orphanIds);
    }

    // Build issued credentials only for ADDED students
    const issuedCredentials =
      includePw && addedIds.length
        ? addedIds
            .map((uid) => createdById.get(uid))
            .filter((c): c is CreatedStudent => !!c && !!c.temporaryPassword)
            .map((c) => ({
              name: c.name,
              userId: c.userId,
              username: c.username,
              email: c.email,
              temporaryPassword: c.temporaryPassword!,
            }))
        : undefined;

    // Step 6: Respond with updated roster
    const updated = await ClassModel.findById(klass._id)
      .select("students")
      .lean();

    return res.json({
      ok: true,
      data: updated?.students ?? [],
      ...(issuedCredentials ? { issuedCredentials } : {}),
    });
  } catch (e: any) {
    // Any failure after user-svc creation → delete ALL created accounts
    if (created.length) {
      await bulkDeleteSafe(created.map((c) => String(c.userId)));
    }

    // If a deliberate dedupe/no-op error, just return current roster (no accounts left behind)
    if (e?._noop) {
      const currentOnly = await ClassModel.findById(req.params.id)
        .select("students")
        .lean();
      return res.json({ ok: true, data: currentOnly?.students ?? [] });
    }

    console.error("[addStudents] error", e);
    return res
      .status(500)
      .json({ ok: false, message: "Internal server error" });
  } finally {
    session.endSession();
  }
}

/**
 * @route  DELETE /classes/:id/students/:studentId
 * @auth   verifyAccessToken + verifyClassOwnerOrAdmin
 * @input  Params: { id, studentId }
 * @logic  1) Ensure class + membership exist
 *         2) Delete user in user-svc
 *         3) Pull from roster and delete StudentClassStats row
 * @returns 200 { ok, data: ClassLean }
 * @errors  404 class or student not found
 *          502 user-svc failure
 *          500 internal server error
 */
export async function removeStudent(req: CustomRequest, res: Response) {
  try {
    // Step 1: Load class + check membership
    const { id: classId, studentId } = req.params;

    const klass = await ClassModel.findById(classId).lean();
    if (!klass) {
      return res.status(404).json({ ok: false, message: "Class not found" });
    }

    const exists = (klass.students ?? []).some(
      (s: any) => String(s.userId) === String(studentId)
    );
    if (!exists) {
      return res
        .status(404)
        .json({ ok: false, message: "Student not found in class" });
    }

    // Step 2: Delete in user-svc
    try {
      await deleteStudentInUserSvc(studentId, req.headers.authorization || "");
    } catch (e: any) {
      const status = typeof e?.status === "number" ? e.status : 502;
      return res.status(status).json({
        ok: false,
        message: e?.message || "Failed to delete student in user service",
      });
    }

    // Step 3: Remove from roster + delete per-student stats
    await ClassModel.updateOne(
      { _id: classId },
      {
        $pull: { students: { userId: String(studentId) } },
        $set: { updatedAt: new Date() },
      }
    );

    await StudentClassStatsModel.deleteOne({
      classId,
      studentId: String(studentId),
    });

    // Step 4: Respond
    const updated = await ClassModel.findById(classId).lean();
    return res.json({ ok: true, data: updated });
  } catch (e: any) {
    console.error("[removeStudent] error", e);
    return res
      .status(500)
      .json({ ok: false, message: "Internal server error" });
  }
}

/**
 * @route  GET /classes/:id/students
 * @auth   verifyAccessToken + verifyClassOwnerOrAdmin
 * @input  Params: { id }
 * @notes  - Populates each embedded student with their StudentClassStats row (virtual: students.statsDoc).
 *         - Computes participationPct and avgScorePct from populated stats.
 *         - Adds overallScore and rank (standard competition ranking with gaps after ties).
 * @logic  1) Load class roster and populate per-student stats using { match: { classId: :id } }.
 *         2) Map to enriched rows and compute ranks from overallScore.
 *         3) Sort by rank before returning (tie-breakers: higher overallScore first, then name A→Z).
 * @returns 200 { ok, data: Array<{ userId, displayName, photoUrl?, className, participationPct, avgScorePct, streakDays, overallScore, rank }> }
 * @errors  404 class not found
 *          500 internal server error
 */
export async function getStudents(req: CustomRequest, res: Response) {
  try {
    const { id } = req.params;

    const klass = await ClassModel.findById(id)
      .select({ students: 1, schedule: 1, timezone: 1 })
      .populate({
        path: "students.statsDoc",
        match: { classId: id },
        select:
          "participationCount sumScore sumMax streakDays bestStreakDays lastStreakDate overallScore",
      })
      .lean({ virtuals: true });

    if (!klass)
      return res.status(404).json({ ok: false, message: "Class not found" });

    const tz = klass.timezone || "Asia/Singapore";
    const now = new Date();
    const eligibleAssigned = (klass.schedule || []).filter(
      (s: any) => new Date(s.startDate) <= now
    ).length;

    const rows = (klass.students || []).map((s: any) => {
      const st = s.statsDoc || {};
      const { participationPct, avgScorePct } = computeParticipationAndAvgScore(
        {
          participations: st.participationCount ?? 0,
          eligibleAssigned,
          sumScore: st.sumScore ?? 0,
          sumMax: st.sumMax ?? 0,
        }
      );

      const streakDays = projectedStreak(st.lastStreakDate, tz)
        ? st.streakDays ?? 0
        : 0;

      return {
        userId: String(s.userId),
        displayName: s.displayName,
        photoUrl: s.photoUrl ?? null,
        className: s.className,
        participationPct,
        avgScorePct,
        streakDays,
        bestStreakDays: st.bestStreakDays ?? 0,
        overallScore: st.overallScore ?? 0,
      };
    });

    const getRank = computeRanks(rows);
    const withRank = rows.map((r) => ({ ...r, rank: getRank(r.overallScore) }));

    withRank.sort(
      (a, b) =>
        a.rank - b.rank ||
        b.overallScore - a.overallScore ||
        a.displayName.localeCompare(b.displayName)
    );

    return res.json({ ok: true, data: withRank });
  } catch (e) {
    console.error("[getStudents] error", e);
    return res
      .status(500)
      .json({ ok: false, message: "Internal server error" });
  }
}

/**
 * @route  GET /classes/:id/students/:studentId
 * @auth   verifyAccessToken + verifyTeacherOfStudent
 * @input  Params: { id, studentId }
 * @notes  - Populates the student’s stats (virtual) and computes participation/grade percentages.
 *         - Adds overallScore and computes rank within the class (standard competition ranking).
 *         - Enriches subjects with colorHex via quiz-svc `/quiz/meta` (fallback to schedule/live meta).
 * @logic  1) Load class roster with populated stats (scoped by classId).
 *         2) Resolve target studentId (honor "me"), compute derived fields + rank.
 *         3) Fetch subject palette from quiz-svc.
 *         4) Attach `color` to each entry in `stats.bySubject`.
 * @returns 200 {
 *   ok, data: {
 *     userId, displayName, photoUrl?, className, rank,
 *     stats: {
 *       sumScore, sumMax, participationCount, participationPct, avgScorePct,
 *       streakDays, bestStreakDays, lastStreakDate, overallScore,
 *       canonicalBySchedule, attendanceDays,
 *       bySubject: { [subject]: { attempts, sumMax, sumScore, color? } },
 *       byTopic, subjectsAvgPct, topicsAvgPct, subjectColors, version, updatedAt
 *     }
 *   }
 * }
 * @errors  404 class or student not found
 *          500 internal server error
 */
export async function getStudentById(req: CustomRequest, res: Response) {
  try {
    const { id } = req.params;

    // The middleware verifyTeacherOfStudentOrSelf already rewrites "me" to viewer id,
    // but keep a defensive fallback here in case this controller is re-used elsewhere.
    const resolvedStudentId =
      String(req.params.studentId || "") === "me" && req.user?.id
        ? String(req.user.id)
        : String(req.params.studentId || "");

    const klass = await ClassModel.findById(id)
      .select({ students: 1, schedule: 1, name: 1, timezone: 1 })
      .populate({ path: "students.statsDoc", match: { classId: id } })
      .lean({ virtuals: true });

    if (!klass)
      return res.status(404).json({ ok: false, message: "Class not found" });

    const s = klass.students?.find(
      (x: any) => String(x.userId) === String(resolvedStudentId)
    );
    if (!s)
      return res.status(404).json({ ok: false, message: "Student not found" });

    const st = s.statsDoc || {};
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

    const all = await StudentClassStatsModel.find({ classId: id })
      .select({ overallScore: 1 })
      .lean();

    const getRank = computeRanks(all as any);
    const rank = getRank(st.overallScore ?? 0);

    const bySubjectObj = toPlainObject(st.bySubject);
    const byTopicObj = toPlainObject(st.byTopic);

    const subjectsAvgPct = computeBucketAvgPct(bySubjectObj);
    const topicsAvgPct = computeBucketAvgPct(byTopicObj);

    let subjectColors: Record<string, string> = {};
    try {
      const { subjects } = await fetchMyQuizMeta(
        req.headers.authorization || ""
      );
      subjectColors = { ...subjects };
    } catch {
      subjectColors = {};
    }

    const bySubjectWithColor = Object.fromEntries(
      Object.entries(bySubjectObj || {}).map(([subj, val]) => [
        subj,
        {
          attempts: Number((val as any).attempts ?? 0),
          sumMax: Number((val as any).sumMax ?? 0),
          sumScore: Number((val as any).sumScore ?? 0),
          color: subjectColors[subj] ?? null,
        },
      ])
    );

    return res.json({
      ok: true,
      data: {
        userId: String(s.userId),
        displayName: s.displayName,
        photoUrl: s.photoUrl ?? null,
        className: s.className ?? klass.name ?? "",
        rank,
        stats: {
          classId: String(id),
          studentId: String(resolvedStudentId),
          sumScore: st.sumScore ?? 0,
          sumMax: st.sumMax ?? 0,
          participationCount: st.participationCount ?? 0,
          participationPct,
          avgScorePct,
          streakDays,
          bestStreakDays: st.bestStreakDays ?? 0,
          lastStreakDate: st.lastStreakDate ?? null,
          overallScore: st.overallScore ?? 0,
          canonicalBySchedule: toPlainObject(st.canonicalBySchedule),
          attendanceDays: toPlainObject(st.attendanceDays),
          bySubject: bySubjectWithColor,
          byTopic: byTopicObj,
          subjectsAvgPct,
          topicsAvgPct,
          subjectColors,
          version: st.version ?? 0,
          updatedAt: st.updatedAt ?? null,
        },
      },
    });
  } catch (e) {
    console.error("[getStudentById] error", e);
    return res
      .status(500)
      .json({ ok: false, message: "Internal server error" });
  }
}

/**
 * @route  GET /classes/:id/students/:studentId/schedule-summary
 * @query  ?name=&subject=&topic=&latestFrom=&latestTo=
 *         - name: case-insensitive substring on quizName
 *         - subject, topic: case-insensitive exact match
 *         - latestFrom/latestTo: ISO datetime bounds on latestAt (inclusive)
 * @auth   verifyAccessToken + verifyTeacherOfStudentOrSelf
 * @input  Params: { id, studentId }
 * @notes  - Returns ONE row per schedule in this class that the student has attempted.
 *         - Includes quiz meta (from attempt snapshot), latest attempt info, and canonical contribution when present.
 *         - Does NOT return the full list of attempts (keeps payload lean for StudentProfileSwitcher).
 *         - Uses quiz-svc internal endpoint (x-quiz-secret) to fetch all attempts, then filters to this classId.
 * @logic  1) Validate ids and ensure the class exists + student is on the roster.
 *         2) Load the student's class-scoped stats doc to read canonicalBySchedule.
 *         3) Call quiz-svc internal to fetch ALL attempts for the student; filter by classId = :id.
 *         4) Group by scheduleId; pick "latest" by finishedAt (fallback startedAt/createdAt).
 *         5) **Fix A**: Prune groups whose scheduleId is NOT present in Class.schedule (embedded).
 *         6) For each remaining schedule, attach canonical stats (if present) and surface quiz meta from latest attempt.
 *         7) Apply filters and return.
 * @returns 200 { ok: true, data: { classId, studentId, schedules: [...] } }
 * @errors  400 invalid ids
 *          404 class or student not found
 *          502 upstream quiz service error
 *          500 internal server error
 */
export async function getStudentAttemptsScheduleSummaryforClass(
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

    const { id, studentId } = req.params;

    if (!Types.ObjectId.isValid(id) || !Types.ObjectId.isValid(studentId)) {
      return res.status(400).json({ ok: false, message: "Invalid ids" });
    }

    // Fetch class (need students to validate roster)
    const klass = await ClassModel.findById(id)
      .select({ students: 1, name: 1 })
      .lean<{ students?: Array<{ userId: string }> } | null>();
    if (!klass)
      return res.status(404).json({ ok: false, message: "Class not found" });

    const onRoster = (klass.students || []).some(
      (s) => String(s.userId) === String(studentId)
    );
    if (!onRoster) {
      return res
        .status(404)
        .json({ ok: false, message: "Student not found in class" });
    }

    // ── stats for canonical
    const stats = await StudentClassStatsModel.findOne({
      classId: id,
      studentId: studentId,
    })
      .select({ canonicalBySchedule: 1 })
      .lean<{ canonicalBySchedule?: CanonicalBySchedule } | null>();

    const canonicalBySchedule: CanonicalBySchedule =
      (stats?.canonicalBySchedule as any) || {};

    // ── attempts (internal)
    const allAttempts = await fetchStudentAttemptsInternal(studentId);
    const attempts: AttemptLite[] = Array.isArray((allAttempts as any)?.rows)
      ? (allAttempts as any).rows
      : [];

    // Only attempts for this class
    const inThisClass = attempts.filter(
      (a) => String(a.classId) === String(id)
    );

    // ── group by scheduleId and pick latest
    const bySchedule = new Map<string, SchedulePack>();
    for (const r of inThisClass) {
      if (!r.scheduleId) continue;
      const list: SchedulePack = bySchedule.get(r.scheduleId) ?? {
        attempts: [],
      };
      list.attempts.push(r);

      const rTime = r.finishedAt
        ? new Date(r.finishedAt).getTime()
        : new Date(r.startedAt || r.createdAt || 0).getTime();

      const lTime = list.latest
        ? new Date(
            list.latest.finishedAt ||
              list.latest.startedAt ||
              list.latest.createdAt ||
              0
          ).getTime()
        : -1;

      if (!list.latest || rTime > lTime) list.latest = r;

      bySchedule.set(r.scheduleId, list);
    }

    /**
     * ──────────────────────────────────────────────────────────────────────────
     *  - We must prune any grouped scheduleId that is NOT present in that array
     *    (i.e., schedule was deleted).
     *
     *  Implementation:
     *    1) Read the class’s schedule array (only _id’s).
     *    2) Build a Set<string> of existing schedule ids (stringified).
     *    3) Delete from bySchedule any scheduleId not in that set.
     *
     *  Notes:
     *    - We do a lightweight re-fetch selecting only schedule._id to avoid
     *      inflating the original class query. If you prefer, include schedule._id
     *      in the first class fetch instead and skip this second query.
     * ──────────────────────────────────────────────────────────────────────────
     */
    if (bySchedule.size > 0) {
      // Fetch embedded schedule ids for this class
      const classWithSchedules = await ClassModel.findById(id)
        .select({ "schedule._id": 1 })
        .lean<{ schedule?: Array<{ _id: Types.ObjectId | string }> } | null>();

      const existingScheduleIdSet = new Set<string>(
        (classWithSchedules?.schedule || []).map((s) => String(s._id))
      );

      for (const sid of Array.from(bySchedule.keys())) {
        if (!existingScheduleIdSet.has(String(sid))) {
          bySchedule.delete(sid); // remove schedule group that no longer exists
        }
      }
    }
    // ──────────────────────────────────────────────────────────────────────────

    const pct = (score?: number, max?: number) =>
      max && max > 0 ? Math.round((Number(score || 0) / Number(max)) * 100) : 0;

    type ScheduleRow = {
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

    let schedules: ScheduleRow[] = Array.from(bySchedule.entries()).map(
      ([scheduleId, pack]) => {
        const latest = pack.latest!;
        const quizName = latest?.quiz?.name ?? "Untitled Quiz";
        const subject = latest?.quiz?.subject ?? null;
        const subjectColorHex = latest?.quiz?.subjectColorHex ?? null;
        const topic = latest?.quiz?.topic ?? null;

        const can = canonicalBySchedule[scheduleId];
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

    // ── respond
    return res.json({
      ok: true,
      data: {
        classId: String(id),
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
    console.error("[getStudentAttemptsScheduleSummary] error", e);
    return res
      .status(500)
      .json({ ok: false, message: "Internal server error" });
  }
}
