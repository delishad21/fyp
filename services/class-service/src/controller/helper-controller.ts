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
 *          403 forbidden (invalid secret; enforced by verifySharedSecret middleware)
 *          4xx/5xx bubbled from downstream errors when present, otherwise 500 internal
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
 * @route   POST /helper/attempt-eligibility
 * @auth    x-quiz-secret header (S2S)
 * @input   Body: {
 *            studentId: string,
 *            scheduleId: string(ObjectId),
 *            attemptsCount?: number    // provided by quiz-svc
 *          }
 * @logic   Middleware validates shared secret
 *          1) Validate required fields and formats:
 *             - studentId: required string (compared to students.userId as string)
 *             - scheduleId: required, must be valid ObjectId
 *          2) Find the class containing the scheduleId and ensure student is in class
 *          3) Find the exact schedule item by _id
 *          4) Check [start, end] window
 *          5) Enforce attemptsAllowed (default 1, max 10). If attemptsCount >= cap → deny.
 *          6) Return canonical quiz identity (quizId + quizRootId + quizVersion)
 * @returns 200 {
 *   ok:true,
 *   allowed:boolean,
 *   reason?:string,
 *   message?:string,
 *   classId?:string,
 *   scheduleId?:string,
 *   quizId?:string,
 *   quizRootId?:string,
 *   quizVersion?:number,
 *   window?:{start,end},
 *   attemptsAllowed?: number,
 *   showAnswersAfterAttempt?: boolean,
 *   attemptsCount?: number,
 *   attemptsRemaining?: number
 * }
 * @errors  400 missing/invalid ids (studentId/scheduleId)
 *          403 forbidden (invalid secret; enforced by verifySharedSecret middleware)
 *          4xx/5xx bubbled from downstream errors when present, otherwise 500 internal
 */
export async function checkAttemptEligibilityBySchedule(
  req: Request,
  res: Response
) {
  try {
    const { studentId, scheduleId, attemptsCount } = (req.body ?? {}) as {
      studentId?: string;
      scheduleId?: string;
      attemptsCount?: number;
    };

    if (!studentId || !scheduleId) {
      return res.status(400).json({
        ok: false,
        message: "Missing studentId/scheduleId",
      });
    }

    if (!Types.ObjectId.isValid(scheduleId)) {
      return res.status(400).json({ ok: false, message: "Invalid scheduleId" });
    }

    const sid = new Types.ObjectId(scheduleId);

    // Find class that:
    //  - contains this schedule item
    //  - contains the student in its roster (students.userId is a string)
    const cls = await ClassModel.findOne(
      {
        "schedule._id": sid,
        "students.userId": studentId,
      },
      { _id: 1, schedule: 1 }
    ).lean();

    if (!cls) {
      return res.json({
        ok: true,
        allowed: false,
        reason: "not_found",
        message: "Class or student not found for this schedule.",
      });
    }

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

    // Require canonical identity on the schedule (no quizId fallback)
    const quizId = String(sched.quizId || "");
    const quizRootId = (sched as any).quizRootId
      ? String((sched as any).quizRootId)
      : "";
    const quizVersion =
      typeof (sched as any).quizVersion === "number"
        ? (sched as any).quizVersion
        : NaN;

    if (!quizRootId || !Number.isFinite(quizVersion)) {
      return res.json({
        ok: true,
        allowed: false,
        reason: "invalid_quiz_identity",
        message:
          "Schedule item is missing quizRootId/quizVersion (invalid configuration).",
        classId: String(cls._id),
        scheduleId: String(scheduleId),
        quizId: quizId || undefined,
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
        classId: String(cls._id),
        scheduleId: String(scheduleId),
        quizId,
        quizRootId,
        quizVersion,
      });
    }

    if (now < start) {
      return res.json({
        ok: true,
        allowed: false,
        reason: "window_not_started",
        window: { start: start.toISOString(), end: end.toISOString() },
        classId: String(cls._id),
        scheduleId: String(scheduleId),
        quizId,
        quizRootId,
        quizVersion,
        attemptsAllowed: Number(sched.attemptsAllowed ?? 1),
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
        classId: String(cls._id),
        scheduleId: String(scheduleId),
        quizId,
        quizRootId,
        quizVersion,
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
        classId: String(cls._id),
        scheduleId: String(scheduleId),
        quizId,
        quizRootId,
        quizVersion,
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
      classId: String(cls._id),
      scheduleId: String(scheduleId),
      quizId,
      quizRootId,
      quizVersion,
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
 *          403 forbidden (invalid secret; enforced by verifySharedSecret middleware)
 *          4xx/5xx bubbled from downstream calls (if any), else 500 internal
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
      (Array.isArray(cls.teachers) &&
        cls.teachers.some((t: any) => String(t) === u));

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
 * @route   POST /helper/check-teacher-of-student
 * @auth    x-quiz-secret header (S2S; enforced by verifySharedSecret middleware)
 * @input   Body: { userId: string, studentId: string }
 * @logic   1) Validate userId and studentId are present and valid ObjectIds.
 *          2) Use isTeacherOfStudent(userId, studentId) to determine if the user
 *             is a teacher of any class that contains this student.
 * @returns 200 { ok: true, isTeacher: boolean, message?: string }
 * @errors  400 missing/invalid ids
 *          403 forbidden (invalid secret; enforced by middleware)
 *          4xx/5xx bubbled from downstream errors when present, otherwise 500 internal
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
 *          403 forbidden (invalid secret; enforced by verifySharedSecret middleware)
 *          4xx/5xx bubbled from downstream errors when present, otherwise 500 internal
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
