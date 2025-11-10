import type { Request, Response } from "express";
import { ClassModel } from "../model/class/class-model";
import { Types } from "mongoose";
import { isTeacherOfStudent } from "../middleware/access-control";

/**
 * @route   POST /helper/check-teacher-of-class
 * @auth    x-quiz-secret header (S2S)
 * @input   Body: { userId: string, classId: string }
 * @logic   Middleware validates shared secret
 *          1) Validate ids (ObjectId)
 *          2) Check if class exists with owner==userId OR userId in teachers
 * @returns 200 { ok:true, isTeacher:boolean, message?:string }
 * @errors  400 missing/invalid ids
 *          403 forbidden (invalid secret)
 *          500 internal
 */
export async function checkIfTeacherOfClass(req: Request, res: Response) {
  try {
    // 1) Validate input
    const { userId, classId } = (req.body ?? {}) as {
      userId?: string;
      classId?: string;
    };

    if (!userId || !classId) {
      return res
        .status(400)
        .json({ ok: false, message: "Missing userId and/or classId" });
    }
    if (!Types.ObjectId.isValid(userId) || !Types.ObjectId.isValid(classId)) {
      return res.status(400).json({ ok: false, message: "Invalid ids" });
    }

    // 2) Query
    const u = new Types.ObjectId(userId);
    const c = new Types.ObjectId(classId);

    const isTeacher = !!(await ClassModel.exists({
      _id: c,
      $or: [{ owner: u }, { teachers: u }],
    }));

    // 4) Respond
    return res.json({
      ok: true,
      isTeacher,
      ...(isTeacher
        ? {}
        : { message: "User is not a teacher for this class." }),
    });
  } catch (e: any) {
    const status = typeof e?.status === "number" ? e.status : 500;
    return res
      .status(status)
      .json({ ok: false, message: e?.message || "Internal error" });
  }
}

/**
 * @route   POST /helper/check-attempt-eligibility
 * @auth    x-quiz-secret header (S2S)
 * @input   Body: {
 *            studentId: string,
 *            classId: string(ObjectId),
 *            scheduleId: string(ObjectId),
 *            quizId: string,
 *            attemptsCount?: number    // NEW: provided by quiz-svc
 *          }
 * @logic   Middleware validates shared secret
 *          1) Validate required fields and ObjectId formats
 *          2) Ensure student is in class
 *          3) Find the exact schedule item by _id and verify quizId matches
 *          4) Check [start, end] window
 *          5) Enforce attemptsAllowed (default 1, max 10). If attemptsCount >= cap → deny.
 * @returns 200 {
 *   ok:true,
 *   allowed:boolean,
 *   reason?:string,
 *   message?:string,
 *   classId?,
 *   window?:{start,end},
 *   attemptsAllowed?: number,              // NEW
 *   showAnswersAfterAttempt?: boolean,     // NEW
 *   attemptsCount?: number                 // echo for convenience
 * }
 * @errors  400 missing/invalid ids
 *          403 forbidden (invalid secret)
 *          500 internal
 */
export async function checkAttemptEligibilityBySchedule(
  req: Request,
  res: Response
) {
  try {
    // 1) Validate input
    const { studentId, classId, scheduleId, quizId, attemptsCount } =
      (req.body ?? {}) as {
        studentId?: string;
        classId?: string;
        scheduleId?: string;
        quizId?: string;
        attemptsCount?: number; // NEW
      };

    if (!studentId || !classId || !scheduleId || !quizId) {
      return res.status(400).json({
        ok: false,
        message: "Missing studentId/classId/scheduleId/quizId",
      });
    }
    if (
      !Types.ObjectId.isValid(classId) ||
      !Types.ObjectId.isValid(scheduleId)
    ) {
      return res.status(400).json({ ok: false, message: "Invalid ids" });
    }

    // 2) Verify membership
    const cls = await ClassModel.findOne({
      _id: new Types.ObjectId(classId),
      "students.userId": studentId, // roster stores userId as string
    })
      .select({ schedule: 1 })
      .lean();

    if (!cls) {
      return res.json({
        ok: true,
        allowed: false,
        reason: "not_found",
        message: "Class or student not found in roster.",
      });
    }

    // 3) Find the EXACT schedule item by _id and verify its quizId matches the payload
    const sched = (cls.schedule ?? []).find(
      (s: any) => String(s._id) === String(scheduleId)
    );

    if (!sched) {
      return res.json({
        ok: true,
        allowed: false,
        reason: "not_scheduled",
        message: "Schedule item not found on class.",
      });
    }

    // quizId can be stored as ObjectId or string; normalize both sides to string
    const schedQuizId = sched.quizId != null ? String(sched.quizId) : "";
    if (schedQuizId !== String(quizId)) {
      return res.json({
        ok: true,
        allowed: false,
        reason: "quiz_mismatch",
        message: "Schedule item does not belong to the provided quizId.",
        details: {
          expectedQuizId: schedQuizId,
          receivedQuizId: String(quizId),
        },
      });
    }

    // 4) Check window [start, end]
    const now = new Date();
    const start = new Date(sched.startDate);
    const end = new Date(sched.endDate);

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return res.json({
        ok: true,
        allowed: false,
        reason: "invalid_window",
        message: "Schedule window is invalid.",
      });
    }

    if (now < start) {
      return res.json({
        ok: true,
        allowed: false,
        reason: "window_not_started",
        window: { start: start.toISOString(), end: end.toISOString() },
        attemptsAllowed: Number(sched.attemptsAllowed ?? 1), // echo config
        showAnswersAfterAttempt: Boolean(sched.showAnswersAfterAttempt),
        attemptsCount:
          typeof attemptsCount === "number" ? attemptsCount : undefined,
      });
    }
    if (now > end) {
      return res.json({
        ok: true,
        allowed: false,
        reason: "window_ended",
        window: { start: start.toISOString(), end: end.toISOString() },
        attemptsAllowed: Number(sched.attemptsAllowed ?? 1),
        showAnswersAfterAttempt: Boolean(sched.showAnswersAfterAttempt),
        attemptsCount:
          typeof attemptsCount === "number" ? attemptsCount : undefined,
      });
    }

    // 5) Enforce attemptsAllowed (defaults to 1, max 10)
    const cap = Math.min(10, Math.max(1, Number(sched.attemptsAllowed ?? 1)));
    const count = Math.max(
      0,
      Number.isFinite(Number(attemptsCount)) ? Number(attemptsCount) : 0
    );

    if (count >= cap) {
      return res.json({
        ok: true,
        allowed: false,
        reason: "attempt_limit",
        message: `No more attempts allowed for this quiz (limit: ${cap}).`,
        attemptsAllowed: cap,
        showAnswersAfterAttempt: Boolean(sched.showAnswersAfterAttempt),
        attemptsCount: count,
        window: { start: start.toISOString(), end: end.toISOString() },
      });
    }

    // 6) Allowed
    return res.json({
      ok: true,
      allowed: true,
      classId,
      attemptsAllowed: cap,
      showAnswersAfterAttempt: Boolean(sched.showAnswersAfterAttempt),
      attemptsCount: count,
      attemptsRemaining: cap - count,
      window: { start: start.toISOString(), end: end.toISOString() },
    });
  } catch (e: any) {
    const status = typeof e?.status === "number" ? e.status : 500;
    return res
      .status(status)
      .json({ ok: false, message: e?.message || "Internal error" });
  }
}

/**
 * @route   POST /helper/check-teacher-of-schedule
 * @auth    x-quiz-secret header (S2S)
 * @input   Body: { userId: string, scheduleId: string }
 * @notes   - Verifies that the provided user is a teacher (owner or in teachers[])
 *           of the class that contains the schedule item (_id == scheduleId).
 *         - Returns a clearer message if the schedule exists but the user isn't a teacher.
 *         - Uses the existing index on "schedule._id" for fast lookup.
 * @logic   1) Validate userId and scheduleId (ObjectId)
 *          2) Lookup class containing scheduleId
 *          3) If not found → isTeacher=false (no schedule found)
 *          4) Else, check owner/teachers membership for that class
 * @returns 200 {
 *            ok: true,
 *            isTeacher: boolean,
 *            message?: string,
 *            classId?: string
 *          }
 * @errors  400 invalid/missing ids
 *          403 forbidden (invalid secret; handled by middleware)
 *          500 internal
 */
export async function checkIfTeacherOfSchedule(req: Request, res: Response) {
  try {
    // 1) Validate input
    const { userId, scheduleId } = (req.body ?? {}) as {
      userId?: string;
      scheduleId?: string;
    };

    if (!userId || !scheduleId) {
      return res
        .status(400)
        .json({ ok: false, message: "Missing userId and/or scheduleId" });
    }
    if (
      !Types.ObjectId.isValid(userId) ||
      !Types.ObjectId.isValid(scheduleId)
    ) {
      return res.status(400).json({ ok: false, message: "Invalid ids" });
    }

    const u = String(userId);
    const sid = new Types.ObjectId(scheduleId);

    // 2) Find the class that contains this schedule item
    const cls = await ClassModel.findOne(
      { "schedule._id": sid },
      { _id: 1, owner: 1, teachers: 1 }
    ).lean();

    if (!cls) {
      // Schedule not found on any class
      return res.json({
        ok: true,
        isTeacher: false,
        message: "Schedule item not found.",
      });
    }

    // 3) Check if user is owner or in teachers of that class
    const isTeacher =
      String(cls.owner) === u ||
      (Array.isArray(cls.teachers) && cls.teachers.includes(u));

    return res.json({
      ok: true,
      isTeacher,
      ...(isTeacher
        ? { classId: String(cls._id) }
        : {
            classId: String(cls._id),
            message:
              "User is not a teacher for the class that owns this schedule.",
          }),
    });
  } catch (e: any) {
    const status = typeof e?.status === "number" ? e.status : 500;
    return res
      .status(status)
      .json({ ok: false, message: e?.message || "Internal error" });
  }
}

/**
 * @route POST /helper/check-teacher-of-student
 * @auth  x-quiz-secret (S2S)
 */
export async function checkIfTeacherOfStudent(req: Request, res: Response) {
  try {
    const { userId, studentId } = (req.body ?? {}) as {
      userId?: string;
      studentId?: string;
    };
    if (!userId || !studentId) {
      return res
        .status(400)
        .json({ ok: false, message: "Missing userId and/or studentId" });
    }
    if (!Types.ObjectId.isValid(userId) || !Types.ObjectId.isValid(studentId)) {
      return res.status(400).json({ ok: false, message: "Invalid ids" });
    }

    const isTeacher = await isTeacherOfStudent(userId, studentId);
    return res.json({
      ok: true,
      isTeacher,
      ...(isTeacher
        ? {}
        : { message: "User is not a teacher for the student's class." }),
    });
  } catch (e: any) {
    return res
      .status(typeof e?.status === "number" ? e.status : 500)
      .json({ ok: false, message: e?.message || "Internal error" });
  }
}

/**
 * @route   POST /helper/can-show-answers
 * @auth    x-quiz-secret header (S2S)
 * @input   Body: {
 *            scheduleId: string(ObjectId),               // required
 *            classId?: string(ObjectId),                 // optional; narrows lookup
 *            quizId?: string                             // optional; sanity check against schedule.quizId
 *          }
 * @logic   1) Validate inputs and IDs
 *          2) Lookup class (by classId + scheduleId if both given; otherwise by scheduleId alone)
 *          3) Extract the schedule item and (optionally) validate quizId matches
 *          4) Return canShowAnswers = showAnswersAfterAttempt || (now > endDate)
 * @returns 200 {
 *            ok: true,
 *            canShowAnswers: boolean,
 *            reason?: "flag_set"|"after_end"|"before_end"|"quiz_mismatch"|"invalid_window"|"not_found",
 *            schedule?: { startDate: string, endDate: string, showAnswersAfterAttempt: boolean },
 *            now?: string,
 *            classId?: string,
 *            timezone?: string
 *          }
 * @errors  400 invalid/missing ids
 *          403 forbidden (invalid secret; handled by middleware)
 *          500 internal
 */
export async function canShowAnswersForSchedule(req: Request, res: Response) {
  try {
    const { scheduleId, classId, quizId } = (req.body ?? {}) as {
      scheduleId?: string;
      classId?: string;
      quizId?: string;
    };

    if (!scheduleId) {
      return res.status(400).json({ ok: false, message: "Missing scheduleId" });
    }
    if (!Types.ObjectId.isValid(scheduleId)) {
      return res.status(400).json({ ok: false, message: "Invalid scheduleId" });
    }
    if (classId && !Types.ObjectId.isValid(classId)) {
      return res.status(400).json({ ok: false, message: "Invalid classId" });
    }

    const sid = new Types.ObjectId(scheduleId);

    // Look up the class containing this schedule
    const cls = await ClassModel.findOne(
      classId
        ? { _id: new Types.ObjectId(classId), "schedule._id": sid }
        : { "schedule._id": sid },
      // Keep projection simple; we re-find the exact schedule in JS (as done elsewhere)
      { _id: 1, timezone: 1, schedule: 1 }
    ).lean();

    if (!cls) {
      return res.json({
        ok: true,
        canShowAnswers: false,
        reason: "not_found",
      });
    }

    const sched = (cls.schedule ?? []).find(
      (s: any) => String(s._id) === String(scheduleId)
    );
    if (!sched) {
      return res.json({
        ok: true,
        canShowAnswers: false,
        reason: "not_found",
        classId: String(cls._id),
        timezone: cls.timezone,
      });
    }

    // Optional sanity check: quizId must match if provided
    if (quizId != null) {
      const schedQuizId = sched.quizId != null ? String(sched.quizId) : "";
      if (schedQuizId !== String(quizId)) {
        return res.json({
          ok: true,
          canShowAnswers: false,
          reason: "quiz_mismatch",
          classId: String(cls._id),
          timezone: cls.timezone,
          schedule: {
            startDate: new Date(sched.startDate).toISOString(),
            endDate: new Date(sched.endDate).toISOString(),
            showAnswersAfterAttempt: Boolean(sched.showAnswersAfterAttempt),
          },
        });
      }
    }

    // Compute decision
    const now = new Date();
    const end = new Date(sched.endDate);
    const start = new Date(sched.startDate);

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      // If window is malformed, only the explicit flag can allow it
      const canShow = Boolean(sched.showAnswersAfterAttempt);
      return res.json({
        ok: true,
        canShowAnswers: canShow,
        reason: canShow ? "flag_set" : "invalid_window",
        classId: String(cls._id),
        timezone: cls.timezone,
        now: now.toISOString(),
        schedule: {
          startDate: Number.isNaN(start.getTime()) ? null : start.toISOString(),
          endDate: Number.isNaN(end.getTime()) ? null : end.toISOString(),
          showAnswersAfterAttempt: Boolean(sched.showAnswersAfterAttempt),
        },
      });
    }

    const flag = Boolean(sched.showAnswersAfterAttempt);
    if (flag) {
      return res.json({
        ok: true,
        canShowAnswers: true,
        reason: "flag_set",
        classId: String(cls._id),
        timezone: cls.timezone,
        now: now.toISOString(),
        schedule: {
          startDate: start.toISOString(),
          endDate: end.toISOString(),
          showAnswersAfterAttempt: true,
        },
      });
    }

    // Otherwise: only allowed after schedule end
    const afterEnd = now > end;
    return res.json({
      ok: true,
      canShowAnswers: afterEnd,
      reason: afterEnd ? "after_end" : "before_end",
      classId: String(cls._id),
      timezone: cls.timezone,
      now: now.toISOString(),
      schedule: {
        startDate: start.toISOString(),
        endDate: end.toISOString(),
        showAnswersAfterAttempt: false,
      },
    });
  } catch (e: any) {
    const status = typeof e?.status === "number" ? e.status : 500;
    return res
      .status(status)
      .json({ ok: false, message: e?.message || "Internal error" });
  }
}
