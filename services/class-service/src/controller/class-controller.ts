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
import { StudentClassStatsModel } from "../model/stats/student-stats-model";
import { deriveClassStats } from "../model/stats/derive-class-stats";
import { ClassAttemptModel } from "../model/events/class-attempt-model";
import {
  emitClassCreated,
  emitClassDeleted,
  emitClassUpdated,
} from "../utils/events/class-lifecycle-events";

function uploadBaseUrl() {
  return (process.env.IMAGE_UPLOAD_URL || "").replace(/\/+$/, "");
}

function defaultClassImage(baseURL: string) {
  return {
    url: `${baseURL}/default-class.png`,
    filename: "default-class.png",
  };
}

function defaultStudentPhotoUrl(baseURL: string) {
  return `${baseURL}/default-student.png`;
}

function resolveClassImage(image: unknown, baseURL: string) {
  return image && typeof image === "object"
    ? image
    : defaultClassImage(baseURL);
}

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
      String(req.body?.includePasswords ?? "").toLowerCase() === "true";

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
    const baseURL = uploadBaseUrl();
    const defaultStudentPhoto = defaultStudentPhotoUrl(baseURL);

    // Map created students in user service to student entries in class
    const studentDocs = createdStudents.map((s) => ({
      userId: s.userId,
      className: name,
      displayName: (s.name ?? "").trim() || s.username,
      photoUrl: defaultStudentPhoto,
    }));

    //
    const image = resolveClassImage(req.body.image, baseURL);

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

      await emitClassCreated(
        {
          classId: String(doc._id),
          name: String(doc.name),
          timezone: String(doc.timezone || "Asia/Singapore"),
          studentIds: studentDocs.map((s) => String(s.userId)),
        },
        { session }
      );
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

    const baseURL = uploadBaseUrl();

    let updated: any;
    await session.withTransaction(async () => {
      const update: any = {};

      if (typeof req.body.name === "string")
        update.name = String(req.body.name).trim();
      if (typeof req.body.level === "string")
        update.level = String(req.body.level).trim();
      if (req.body.image !== undefined) {
        update.image = resolveClassImage(req.body.image, baseURL);
      }
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

      await emitClassUpdated(
        {
          classId: String(updated._id),
          name: String((updated as any).name || before.name),
          timezone: String((updated as any).timezone || before.timezone || "Asia/Singapore"),
        },
        { session }
      );
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
 * @notes  - Attempts user-svc deletions first; if partial and force=false → abort.
 *         - Deletes StudentClassStats, ScheduleStats, ClassAttempt rows and the Class itself in one transaction.
 * @logic  1) Load class and studentIds.
 *         2) Best-effort user-svc deletion (bulkDeleteStudents, status bubbled):
 *              - If not all deleted and force=false → 4xx/5xx from user-svc, include upstream body when available.
 *              - If force=true -> log failure and continue with local deletion.
 *         3) TX: delete StudentClassStats, ScheduleStats, ClassAttemptModel rows, then Class.
 * @returns 200 { ok, data }
 * @errors  404 class not found
 *          4xx/5xx user-svc failure (unless force=true; status bubbled from user-svc)
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

      await emitClassDeleted({ classId: String(id) }, { session });

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
 * @notes  - **Adds data.statsDoc** by deriving class analytics from StudentClassStats + Class.
 *         - Leaderboard/streak/game-score ownership is in game-service.
 * @logic  1) Load class
 *         2) Compute derived class stats (totals, bySubject, participants[])
 * @returns 200 { ok, data (with statsDoc) }
 * @errors  404 class not found
 *          500 internal server error
 */
export async function getClassById(req: CustomRequest, res: Response) {
  try {
    const { id } = req.params;
    const c = await ClassModel.findById(id).lean();
    if (!c)
      return res.status(404).json({ ok: false, message: "Class not found" });

    const statsDoc = await deriveClassStats(id);

    return res.json({
      ok: true,
      data: { ...c, statsDoc },
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
