import { Response } from "express";
import mongoose from "mongoose";
import { CustomRequest } from "../middleware/access-control";
import { ClassModel } from "../model/class/class-model";
import { validateClassInput } from "../model/class/class-validation";
import {
  bulkCreateStudents,
  bulkDeleteStudents,
  CreatedStudent,
} from "../utils/user-svc-client";
import "dotenv/config";
import { ScheduleStatsModel } from "../model/stats/scheduled-quiz-stats-model";
import {
  IStudentClassStats,
  StudentClassStatsModel,
} from "../model/stats/student-stats-model";
import { deriveClassStats } from "../model/stats/derive-class-stats";
import { ClassAttemptModel } from "../model/events/class-attempt-model";

/**
 * @route  POST /classes
 * @auth   verifyAccessToken (any authenticated user)
 * @input  Body: { name, level, image?, students?, metadata?, timezone?, includePasswords? }
 * @notes  - Creates student accounts in User Service (optional).
 *         - Seeds only StudentClassStats (per-student). **Does not** create/seed ClassStats,
 *           because class-level stats are derived on read.
 *         - New classes ALWAYS start with an empty schedule (req.body.schedule is ignored).
 *         - Streak fields:
 *             - streakDays: last earned run length as of the most recent attended local day
 *             - bestStreakDays: historic maximum streak ever achieved (seeded 0)
 *           Current streak is *projected* to 0 on reads if lastStreakDate isn’t today/yesterday.
 *         - Requires MongoDB transactions support (replica set / sharded).
 * @logic  1) AuthN + validate
 *         2) (optional) create students in user-svc
 *         3) TX: create Class (with empty schedule) and seed StudentClassStats
 *         4) Return class (no statsDoc population—class stats are derived elsewhere)
 * @returns 201 { ok, data, issuedCredentials? }
 * @errors  400 invalid input (fieldErrors included, fielderrors for students propagted from user-svc)
 *          401 unauthorized
 *          500 internal server error
 *          502 user-svc failure
 */
export async function createClass(req: CustomRequest, res: Response) {
  const session = await mongoose.startSession();

  // Function for deleting created students on failure
  async function compensateStudents(created: CreatedStudent[]) {
    try {
      if (created.length) {
        await bulkDeleteStudents(
          created.map((s) => s.userId),
          req.headers.authorization || ""
        );
      }
    } catch (e) {
      console.warn("[createClass] compensateStudents failed", e);
    }
  }

  // 1. Create Students on User Service
  let createdStudents: CreatedStudent[] = [];

  try {
    // Sanity check auth (req.user guaranteed by middleware)
    const ownerId = req.user?.id;
    if (!ownerId) {
      return res.status(401).json({ ok: false, message: "Unauthorized" });
    }

    // Validate input fields for class
    const { fieldErrors, isValid } = validateClassInput(req.body);
    if (!isValid) {
      return res.status(400).json({
        ok: false,
        fieldErrors,
        message: "Please fix the errors and try again.",
      });
    }

    const includePw =
      String(
        req.query?.includePasswords ?? req.body?.includePasswords ?? ""
      ).toLowerCase() === "true";

    try {
      createdStudents = await bulkCreateStudents(
        Array.isArray(req.body.students) ? req.body.students : [],
        req.headers.authorization || "",
        { includePasswords: includePw }
      );
    } catch (e: any) {
      if (e?.errors?.students && Array.isArray(e.errors.students)) {
        return res.status(e.status ?? 400).json({
          ok: false,
          fieldErrors: { students: e.errors.students },
          message: e.message || "Some student accounts could not be created.",
        });
      }
      return res.status(e?.status ?? 502).json({
        ok: false,
        message: e?.message ?? "Failed to create students",
      });
    }

    // 2. TX: create Class + seed StudentClassStats
    const name = String(req.body.name).trim();
    const level = String(req.body.level).trim();
    const timezone = String(req.body.timezone).trim();

    // Start with empty schedule
    const schedule: any[] = [];

    // Image defaults
    const baseURL = (process.env.IMAGE_UPLOAD_URL || "").replace(/\/+$/, "");
    const defaultClassImage = `${baseURL}/default-class.png`;
    const defaultStudentPhoto = `${baseURL}/default-student.png`;

    // Map created students in user service to student entries in class
    const studentDocs = createdStudents.map((s) => ({
      userId: s.userId,
      className: name,
      displayName: (s.name ?? "").trim() || s.username,
      photoUrl: defaultStudentPhoto,
    }));

    //
    const image = req.body.image ?? {
      url: defaultClassImage,
      filename: "default-class.png",
    };

    let createdClassId: mongoose.Types.ObjectId | null = null;

    // Class creation within transaction
    await session.withTransaction(async () => {
      const cls = await ClassModel.create(
        [
          {
            name,
            level,
            image,
            owner: ownerId,
            teachers: [ownerId],
            students: studentDocs,
            schedule, // always []
            metadata: req.body.metadata ?? {},
            timezone,
          },
        ],
        { session }
      );
      const doc = cls[0];
      createdClassId = doc._id;

      if (studentDocs.length) {
        await StudentClassStatsModel.insertMany(
          studentDocs.map((s) => ({
            classId: doc._id,
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
            updatedAt: new Date(),
          })),
          { session, ordered: false }
        );
      }
    });

    const lean = await ClassModel.findById(createdClassId!).lean();

    const issuedCredentials = includePw
      ? createdStudents
          .filter((c) => !!c.temporaryPassword)
          .map((c) => ({
            userId: c.userId,
            name: c.name,
            username: c.username,
            email: c.email,
            temporaryPassword: c.temporaryPassword!,
          }))
      : undefined;

    return res.status(201).json({
      ok: true,
      data: lean,
      ...(issuedCredentials ? { issuedCredentials } : {}),
    });
  } catch (e: any) {
    // Compensate created students on any failure
    await compensateStudents(createdStudents);

    console.error("[createClass] error", e);
    return res
      .status(500)
      .json({ ok: false, message: "Internal server error" });
  } finally {
    session.endSession();
  }
}

/**
 * @route  PUT /classes/:id
 * @auth   verifyAccessToken + verifyClassOwnerOrAdmin
 * @input  Params: { id }
 *         Body:   { name, level, image?, metadata?, timezone? }
 * @notes  - **Metadata-only** update. Schedule changes must go through schedule controllers;
 *           any `schedule` in the payload is ignored.
 *         - Propagates name change to embedded roster (students[].className).
 * @logic  1) Validate
 *         2) TX: apply metadata fields only (no schedule), propagate roster names if needed
 * @returns 200 { ok, data }
 * @errors  400 invalid input (fieldErrors included)
 *          404 class not found
 *          500 internal server error
 */
export async function updateClass(req: CustomRequest, res: Response) {
  const session = await mongoose.startSession();
  try {
    const { fieldErrors, isValid } = validateClassInput(req.body);
    if (!isValid) {
      return res.status(400).json({
        ok: false,
        fieldErrors,
        message: "Please fix the errors and try again.",
      });
    }

    const before = await ClassModel.findById(req.params.id).lean();
    if (!before) {
      return res.status(404).json({ ok: false, message: "Class not found" });
    }

    let updated: any;
    await session.withTransaction(async () => {
      const update: any = {};

      if (typeof req.body.name === "string")
        update.name = String(req.body.name).trim();
      if (typeof req.body.level === "string")
        update.level = String(req.body.level).trim();
      if (req.body.image !== undefined) update.image = req.body.image;
      if (req.body.metadata !== undefined) update.metadata = req.body.metadata;
      if (typeof req.body.timezone === "string" && req.body.timezone.trim()) {
        update.timezone = String(req.body.timezone).trim();
      }
      updated = await ClassModel.findByIdAndUpdate(
        req.params.id,
        { $set: update },
        { new: true, session }
      ).lean();

      if (!updated) throw new Error("Class not found after update");

      if (update.name && update.name !== before.name) {
        await ClassModel.updateOne(
          { _id: updated._id },
          { $set: { "students.$[].className": update.name } },
          { session }
        );
      }
    });

    const fresh = await ClassModel.findById(updated._id).lean();
    return res.json({ ok: true, data: fresh });
  } catch (e: any) {
    console.error("[updateClass] error", e);
    return res
      .status(500)
      .json({ ok: false, message: "Internal server error" });
  } finally {
    session.endSession();
  }
}

/**
 * @route  DELETE /classes/:id
 * @auth   verifyAccessToken + verifyClassOwnerOrAdmin
 * @input  Params: { id }
 *         Query:  force?=true|false
 *         Notes:  - Attempts user-svc deletions first; if partial and force=false → abort.
 *                 - Deletes Class + stats collections in one transaction.
 * @logic  1) Load class and studentIds
 *         2) Best-effort user-svc deletion (respect ?force)
 *         3) TX: delete ClassStats, StudentClassStats, ScheduleStats, then Class
 * @returns 200 { ok, data }
 * @errors  404 class not found
 *          502 user-svc failure (unless force=true)
 *          500 internal server error
 */
export async function deleteClass(req: CustomRequest, res: Response) {
  const session = await mongoose.startSession();
  try {
    // Step 1: Load
    const { id } = req.params;
    const force = String(req.query.force || "").toLowerCase() === "true";

    const cls = await ClassModel.findById(id).lean();
    if (!cls)
      return res.status(404).json({ ok: false, message: "Class not found" });

    const studentIds: string[] = Array.isArray(cls.students)
      ? cls.students.map((s: any) => String(s.userId)).filter(Boolean)
      : [];

    // Step 2: user-svc deletions (best-effort)
    if (studentIds.length) {
      try {
        const result = await bulkDeleteStudents(
          studentIds,
          req.headers.authorization || ""
        );
        const allDeleted = result.deletedCount === studentIds.length;

        // If force not passed, abort on partial/failed deletion
        if (!allDeleted && !force) {
          return res.status(502).json({
            ok: false,
            message:
              "Failed to delete all students from user service. Pass ?force=true to delete class anyway.",
            data: result,
          });
        }
        // If force = true, log any partial failure but continue
        if (!allDeleted && force) {
          console.warn(
            `[class-delete] force=true; deleted ${result.deletedCount}/${studentIds.length}`
          );
        }
      } catch (e: any) {
        if (!force) {
          return res
            .status(typeof e?.status === "number" ? e.status : 502)
            .json({
              ok: false,
              message:
                e?.message ||
                "User service bulk deletion failed. Pass ?force=true to delete class anyway.",
              ...(e?.body ? { error: e.body } : {}),
            });
        }
        console.warn(
          "[class-delete] user-svc bulk delete failed but force=true; continuing.",
          e
        );
      }
    }

    // Step 3: purge stats followed by class
    let deleted: any;
    await session.withTransaction(async () => {
      await StudentClassStatsModel.deleteMany(
        { classId: cls._id },
        { session }
      );
      await ScheduleStatsModel.deleteMany({ classId: cls._id }, { session });
      await ClassAttemptModel.deleteMany({ classId: id }, { session });

      deleted = await ClassModel.findByIdAndDelete(id, { session }).lean();
      if (!deleted) throw new Error("Class not found at delete");
    });

    return res.json({ ok: true, data: deleted });
  } catch (e: any) {
    console.error("[deleteClass] error", e);
    return res
      .status(500)
      .json({ ok: false, message: "Internal server error" });
  } finally {
    session.endSession();
  }
}

/**
 * @route  GET /classes/:id
 * @auth   verifyAccessToken + verifyClassOwnerOrAdmin
 * @input  Params: { id }
 * @notes  - Builds leaderboard from StudentClassStats.
 *         - **Adds data.statsDoc** with the same shape as IClassStats by deriving it
 *           from StudentClassStats + Class (roster & schedule).
 * @logic  1) Load class
 *         2) Load StudentClassStats rows
 *         3) Compute derived class stats (totals, bySubject, participants[])
 *         4) Build leaderboard
 * @returns 200 { ok, data (with statsDoc), meta: { leaderboard[] } }
 * @errors  404 class not found
 *          500 internal server error
 */
export async function getClassById(req: CustomRequest, res: Response) {
  try {
    const { id } = req.params;
    const c = await ClassModel.findById(id).lean();
    if (!c)
      return res.status(404).json({ ok: false, message: "Class not found" });

    const tz = c.timezone || "Asia/Singapore";
    const ymdInTZ = (d: Date) =>
      new Intl.DateTimeFormat("en-CA", {
        timeZone: tz,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(d);
    const addDaysUTC = (d: Date, n: number) => {
      const x = new Date(d);
      x.setUTCDate(x.getUTCDate() + n);
      return x;
    };
    const today = ymdInTZ(new Date());
    const yesterday = ymdInTZ(addDaysUTC(new Date(), -1));

    // Use lastStreakDate to project current streak
    const rows = await StudentClassStatsModel.find({ classId: id })
      .select({
        studentId: 1,
        overallScore: 1,
        streakDays: 1,
        bestStreakDays: 1,
        lastStreakDate: 1,
      })
      .lean();

    const infoById = new Map<
      string,
      { displayName?: string; photoUrl?: string | null }
    >();
    for (const s of c.students || []) {
      const userId = String((s as any).userId);
      infoById.set(userId, {
        displayName: (s as any).displayName,
        photoUrl: (s as any).photoUrl ?? null,
      });
    }

    const enriched = rows
      .map((r) => {
        const last = r.lastStreakDate
          ? ymdInTZ(new Date(r.lastStreakDate))
          : "";
        const projectedStreak =
          last === today || last === yesterday ? Number(r.streakDays || 0) : 0;

        return {
          studentId: String(r.studentId),
          overallScore: Number(r.overallScore || 0),
          // use projected value for ranking tie-break
          streakDays: projectedStreak,
          bestStreakDays: Number(r.bestStreakDays || 0),
          displayName: infoById.get(String(r.studentId))?.displayName,
          photoUrl: infoById.get(String(r.studentId))?.photoUrl ?? null,
        };
      })
      .sort((a, b) =>
        b.overallScore !== a.overallScore
          ? b.overallScore - a.overallScore
          : b.streakDays - a.streakDays
      );

    let lastScore = Infinity,
      lastStreak = Infinity,
      lastRank = 0;
    const leaderboard = enriched.map((r, idx) => {
      const isTie = r.overallScore === lastScore && r.streakDays === lastStreak;
      const rank = isTie ? lastRank : idx + 1;
      lastRank = rank;
      lastScore = r.overallScore;
      lastStreak = r.streakDays;
      return { ...r, rank };
    });

    const statsDoc = await deriveClassStats(id);

    return res.json({
      ok: true,
      data: { ...c, statsDoc },
      meta: { leaderboard },
    });
  } catch (e) {
    console.error("[getClassById] error", e);
    return res
      .status(500)
      .json({ ok: false, message: "Internal server error" });
  }
}

/**
 * @route  GET /classes
 * @auth   verifyAccessToken + verifyIsAdmin
 * @input  Params: —
 * @logic  1) Read classes (light projection)
 *         2) Return list
 * @returns 200 { ok, data[] }
 * @errors  500 internal server error
 */
export async function getClasses(_req: CustomRequest, res: Response) {
  try {
    const docs = await ClassModel.find()
      .select({ students: 0, schedule: 0 })
      .lean();
    return res.json({ ok: true, data: docs });
  } catch (e) {
    console.error("[getClasses] error", e);
    return res
      .status(500)
      .json({ ok: false, message: "Internal server error" });
  }
}

/**
 * @route  GET /classes/my
 * @auth   verifyAccessToken
 * @logic  1) Resolve userId
 *         2) Match by owner/teachers
 *         3) Project fields + computed studentCount (omit students/schedule)
 * @returns 200 { ok, data[] }
 */
export async function getMyClasses(req: CustomRequest, res: Response) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ ok: false, message: "Unauthorized" });
    }

    const docs = await ClassModel.aggregate([
      {
        $match: {
          $or: [{ owner: userId }, { teachers: userId }],
        },
      },
      {
        $project: {
          // include the fields you want to return
          name: 1,
          level: 1,
          image: 1,
          owner: 1,
          teachers: 1,
          metadata: 1,
          timezone: 1,
          createdAt: 1,
          updatedAt: 1,
          studentCount: { $size: { $ifNull: ["$students", []] } },
        },
      },
    ]);

    return res.json({ ok: true, data: docs });
  } catch (e) {
    console.error("[getMyClasses] error", e);
    return res
      .status(500)
      .json({ ok: false, message: "Internal server error" });
  }
}

/**
 * @route  GET /classes/:id/stats
 * @auth   verifyAccessToken + verifyClassOwnerOrAdmin
 * @input  Params: { id }
 * @notes  - Fully **derived** from StudentClassStats + Class (roster/schedule).
 *         - Participation % uses **eligible assigned** (schedules with startDate <= now).
 *         - No reads from a ClassStats collection.
 * @logic  1) In parallel: derive class totals/bySubject, load class.schedule, load per-student rows.
 *         2) Compute eligibleAssigned = count(schedule where startDate <= now).
 *         3) For each student: participationPct = min(participations, eligibleAssigned) / eligibleAssigned.
 *         4) Aggregate averages (mean of per-student %s), headcount %, weightedAvg %, and by-subject averages.
 * @returns 200 { ok, data: { overallParticipation, overallGrades, averageGradesBySubject } }
 * @errors  404 class not found
 *          500 internal server error
 */
export async function getClassCalculatedStats(
  req: CustomRequest,
  res: Response
) {
  try {
    const { id } = req.params;

    // Parallel to reduce latency
    const [stats, klass, studentRows] = await Promise.all([
      deriveClassStats(id),
      ClassModel.findById(id).select({ schedule: 1 }).lean(),
      StudentClassStatsModel.find({ classId: id })
        .select({ sumScore: 1, sumMax: 1, participationCount: 1 })
        .lean(),
    ]);

    if (!klass) {
      return res.status(404).json({ ok: false, message: "Class not found" });
    }

    const totals = stats.totals;
    const bySubject = stats.bySubject;

    const mean = (arr: number[]) =>
      arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0;

    // Eligible assigned = schedules whose window has started
    const now = new Date();
    const eligibleAssigned = Array.isArray(klass.schedule)
      ? klass.schedule.filter((s: any) => new Date(s.startDate) <= now).length
      : 0;

    // Per-student participation % based on eligible assigned
    const studentParticipationPct = studentRows.map((r) => {
      const participations = Number(r.participationCount || 0);
      if (eligibleAssigned <= 0) return 0;
      // Guard against any data drift that would exceed 100%
      const bounded = Math.min(participations, eligibleAssigned);
      return Math.round((bounded / eligibleAssigned) * 100);
    });
    const avgStudentParticipationPct = mean(studentParticipationPct);

    // Per-student average score % (mean of individual percentages)
    const studentAvgScorePct = studentRows.map((r) => {
      const sumMax = Number(r.sumMax || 0);
      const sumScore = Number(r.sumScore || 0);
      return sumMax > 0 ? Math.round((sumScore / sumMax) * 100) : 0;
    });
    const avgStudentAvgScorePct = mean(studentAvgScorePct);

    // Headcount participation: students with any participation / total students
    const headcountPct =
      totals.students > 0
        ? Math.round(
            (Number(totals.participants?.length || 0) / totals.students) * 100
          )
        : 0;

    // Weighted average across the class (using totals)
    const weightedAvgPct =
      totals.sumMax > 0
        ? Math.round(
            (Number(totals.sumScore || 0) / Number(totals.sumMax || 0)) * 100
          )
        : 0;

    // Subject averages from the aggregated buckets
    const averageGradesBySubject: Record<string, number> = {};
    for (const [subject, b] of bySubject.entries()) {
      const sScore = Number(b?.sumScore || 0);
      const sMax = Number(b?.sumMax || 0);
      averageGradesBySubject[subject] =
        sMax > 0 ? Math.round((sScore / sMax) * 100) : 0;
    }

    return res.json({
      ok: true,
      data: {
        overallParticipation: {
          headcountPct,
          avgStudentPct: avgStudentParticipationPct,
        },
        overallGrades: { weightedAvgPct, avgStudentAvgScorePct },
        averageGradesBySubject,
      },
    });
  } catch (e) {
    console.error("[getClassCalculatedStats] error", e);
    return res
      .status(500)
      .json({ ok: false, message: "Internal server error" });
  }
}

/**
 * @route  GET /classes/:id/top
 * @query  limit?=3
 * @auth   verifyAccessToken + verifyClassOwnerOrAdmin
 * @notes  - participationPct = participationCount / eligibleAssigned (capped at 100)
 *         - avgScorePct = sumScore / sumMax
 *         - "eligibleAssigned" counts schedule items that have started (startDate <= now)
 *         - "current streak" is projected to 0 if lastStreakDate is neither today nor yesterday in class TZ
 * @returns 200 {
 *   ok,
 *   data: {
 *     topOverallScore: Array<{ userId, displayName, photoUrl?, className, overallScore, avgScorePct, participationPct }>,
 *     topParticipation: Array<{ userId, displayName, photoUrl?, className, participationPct, participationCount }>,
 *     topStreak:       Array<{ userId, displayName, photoUrl?, className, currentStreak }>
 *   }
 * }
 * @errors  404 class not found
 *          500 internal server error
 */
export async function getTopStudents(req: CustomRequest, res: Response) {
  try {
    const { id } = req.params;
    const limit =
      (Number(req.query?.limit) &&
        Math.max(1, Math.min(10, Number(req.query.limit)))) ||
      3;

    // Load roster + schedule + timezone; populate stats for this class only
    const klass = await ClassModel.findById(id)
      .select({ students: 1, schedule: 1, timezone: 1, name: 1 })
      .populate({
        path: "students.statsDoc",
        match: { classId: id },
        select:
          "participationCount sumScore sumMax overallScore lastStreakDate streakDays bestStreakDays",
      })
      .lean({ virtuals: true });

    if (!klass) {
      return res.status(404).json({ ok: false, message: "Class not found" });
    }

    // Helper for class-local YYYY-MM-DD
    const tz = klass.timezone || "Asia/Singapore";
    const ymdInTZ = (d: Date) =>
      new Intl.DateTimeFormat("en-CA", {
        timeZone: tz,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(d);
    const addDaysUTC = (d: Date, n: number) => {
      const x = new Date(d);
      x.setUTCDate(x.getUTCDate() + n);
      return x;
    };
    const today = ymdInTZ(new Date());
    const yesterday = ymdInTZ(addDaysUTC(new Date(), -1));

    // Eligible assigned = items whose startDate <= now
    const now = new Date();
    const eligibleAssigned = Array.isArray(klass.schedule)
      ? klass.schedule.filter((s: any) => new Date(s.startDate) <= now).length
      : 0;

    // Build rows with derived fields
    const rows = (klass.students || []).map((s: any) => {
      const st = (s?.statsDoc || {}) as Partial<IStudentClassStats>;
      const participationCount = Number(st.participationCount || 0);
      const sumScore = Number(st.sumScore || 0);
      const sumMax = Number(st.sumMax || 0);
      const overallScore = Number(st.overallScore || 0);

      const participationPct =
        eligibleAssigned > 0
          ? Math.round(
              (Math.min(participationCount, eligibleAssigned) /
                eligibleAssigned) *
                100
            )
          : 0;

      const avgScorePct =
        sumMax > 0 ? Math.round((sumScore / sumMax) * 100) : 0;

      const last = st.lastStreakDate
        ? ymdInTZ(new Date(st.lastStreakDate))
        : "";
      const currentStreak =
        last === today || last === yesterday ? Number(st.streakDays || 0) : 0;

      return {
        userId: String(s.userId),
        displayName: String(s.displayName),
        photoUrl: s.photoUrl ?? null,
        className: String(s.className ?? klass.name ?? ""),

        // derived
        participationPct,
        participationCount,
        avgScorePct,
        overallScore,
        currentStreak,
      };
    });

    // ---- Leaderboards ----

    // 1) Overall score: higher overallScore first,
    //    tie-breakers: higher avgScorePct → higher participationPct → name A→Z
    const topOverallScore = rows
      .slice()
      .sort((a, b) => {
        if (a.overallScore !== b.overallScore)
          return b.overallScore - a.overallScore;
        if (a.avgScorePct !== b.avgScorePct)
          return b.avgScorePct - a.avgScorePct;
        if (a.participationPct !== b.participationPct)
          return b.participationPct - a.participationPct;
        return a.displayName.localeCompare(b.displayName);
      })
      .slice(0, limit)
      .map(
        ({
          userId,
          displayName,
          photoUrl,
          className,
          overallScore,
          avgScorePct,
          participationPct,
        }) => ({
          userId,
          displayName,
          photoUrl,
          className,
          overallScore,
          avgScorePct,
          participationPct,
        })
      );

    // 2) Participation: higher participationPct first,
    //    tie-breakers: higher participationCount → higher avgScorePct → name A→Z
    const topParticipation = rows
      .slice()
      .sort((a, b) => {
        if (a.participationPct !== b.participationPct)
          return b.participationPct - a.participationPct;
        if (a.participationCount !== b.participationCount)
          return b.participationCount - a.participationCount;
        if (a.avgScorePct !== b.avgScorePct)
          return b.avgScorePct - a.avgScorePct;
        return a.displayName.localeCompare(b.displayName);
      })
      .slice(0, limit)
      .map(
        ({
          userId,
          displayName,
          photoUrl,
          className,
          participationPct,
          participationCount,
        }) => ({
          userId,
          displayName,
          photoUrl,
          className,
          participationPct,
          participationCount,
        })
      );

    // 3) Current streak: higher currentStreak first,
    //    tie-breakers: higher overallScore → name A→Z
    const topStreak = rows
      .slice()
      .sort((a, b) => {
        if (a.currentStreak !== b.currentStreak)
          return b.currentStreak - a.currentStreak;
        if (a.overallScore !== b.overallScore)
          return b.overallScore - a.overallScore;
        return a.displayName.localeCompare(b.displayName);
      })
      .slice(0, limit)
      .map(({ userId, displayName, photoUrl, className, currentStreak }) => ({
        userId,
        displayName,
        photoUrl,
        className,
        currentStreak,
      }));

    return res.json({
      ok: true,
      data: { topOverallScore, topParticipation, topStreak },
    });
  } catch (e: any) {
    console.error("[getTopStudents] error", e);
    return res
      .status(500)
      .json({ ok: false, message: "Internal server error" });
  }
}
