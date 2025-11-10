import type { Request, Response, NextFunction } from "express";
import { QuizBaseModel, BaseQuizLean } from "../model/quiz-base-model";
import { AttemptModel } from "../model/quiz-attempt-model";
import { Types } from "mongoose";
import {
  checkTeacherOfClass,
  checkTeacherOfSchedule,
  checkTeacherOfStudent,
} from "../utils/class-svc-client";

/** Shapes attached to requests after verification */
export interface VerifiedUser {
  id: string;
  username: string;
  email: string;
  role: "student" | "teacher" | "admin";
  isAdmin: boolean; // derived
  teacherId?: string;
  mustChangePassword?: boolean;
}

export interface CustomRequest extends Request {
  user?: VerifiedUser;
}

/** Resolve user-svc /auth/me URL from env */
function getVerifyUrl(): string {
  const base = process.env.USER_SVC_URL;
  if (!base) throw new Error("USER_SVC_URL env var is required");
  return `${base.replace(/\/+$/, "")}/auth/me`;
}

/** JSON helper: returns null on parse failure */
async function safeJson(res: any) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * Verify a Bearer token with user-svc and normalize the user object.
 * Throws with a status code when auth fails.
 */
async function verifyWithUserService(
  authorization: string
): Promise<VerifiedUser> {
  const url = getVerifyUrl();

  // Timeout guard
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 5000);

  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        authorization,
        accept: "application/json",
        "x-forwarded-auth": "quiz-service",
      },
      signal: ctl.signal,
    });

    if (!res.ok) {
      const body = await safeJson(res);
      const msg =
        (body && (body.message || body.error)) || "Authentication failed";
      const err: any = new Error(msg);
      err.status = res.status;
      throw err;
    }

    const data = (await res.json()) as {
      id?: string;
      username?: string;
      email?: string;
      role?: "student" | "teacher" | "admin";
      teacherId?: string;
      mustChangePassword?: boolean;
    };

    if (!data?.id || !data?.role) {
      const err: any = new Error("Authentication failed");
      err.status = 401;
      throw err;
    }

    const verified: VerifiedUser = {
      id: String(data.id),
      username: String(data.username ?? ""),
      email: String(data.email ?? ""),
      role: data.role,
      isAdmin: data.role === "admin",
      teacherId: data.teacherId ? String(data.teacherId) : undefined,
      mustChangePassword: data.mustChangePassword,
    };

    return verified;
  } catch (e: any) {
    if (e?.name === "AbortError") {
      const err: any = new Error("Auth service timeout");
      err.status = 503;
      throw err;
    }
    if (typeof e?.status === "number") throw e;
    const err: any = new Error("Authentication failed");
    err.status = 401;
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Middleware: verifyAccessToken
 * Route: use before any protected route
 * Input:  Authorization: Bearer <token>
 * Output: attaches req.user or returns 4xx JSON
 * Behavior: verifies token using user-svc /auth/me
 */
export async function verifyAccessToken(
  req: CustomRequest,
  res: Response,
  next: NextFunction
) {
  // Step 1: require Authorization header
  const authorization = req.headers["authorization"];
  if (!authorization) {
    return res.status(401).json({ message: "Authentication failed" });
  }

  // Step 2: verify with user service and attach req.user
  try {
    const user = await verifyWithUserService(authorization);
    req.user = user;
    return next();
  } catch (e: any) {
    const status = typeof e?.status === "number" ? e.status : 401;
    return res
      .status(status)
      .json({ message: e?.message || "Authentication failed" });
  }
}

/**
 * Middleware: verifyIsAdmin
 * Requires verifyAccessToken beforehand.
 * Denies unless req.user.isAdmin
 */
export function verifyIsAdmin(
  req: CustomRequest,
  res: Response,
  next: NextFunction
) {
  const user = req.user;
  if (!user)
    return res.status(401).json({ message: "Authentication required" });
  if (user.isAdmin) return next();
  return res
    .status(403)
    .json({ message: "Not authorized to access this resource" });
}

/**
 * Middleware: verifyStudentOnly
 * Allows students only
 */
export function verifyStudentOnly(
  req: CustomRequest,
  res: Response,
  next: NextFunction
) {
  const u = req.user;
  if (!u) return res.status(401).json({ message: "Authentication required" });
  if (u.role === "student") return next();
  return res.status(403).json({ message: "Student access required" });
}

/**
 * Factory: makeVerifyOwnerOrAdmin(getOwnerId)
 * Purpose: allow resource owner or admin; 404 if resource missing
 * Usage: wrap with verifyAccessToken first
 */
export function makeVerifyOwnerOrAdmin(
  getOwnerId: (req: CustomRequest) => Promise<string | null>
) {
  return async function verifyIsOwnerOrAdmin(
    req: CustomRequest,
    res: Response,
    next: NextFunction
  ) {
    const user = req.user;
    if (!user)
      return res.status(401).json({ message: "Authentication required" });

    if (user.isAdmin) return next();

    let ownerId: string | null = null;
    try {
      ownerId = await getOwnerId(req);
    } catch (e: any) {
      return res
        .status(500)
        .json({ message: e?.message || "Failed to resolve owner" });
    }

    if (!ownerId) {
      return res.status(404).json({ message: "Resource not found" });
    }

    if (String(ownerId) === String(user.id)) return next();

    return res
      .status(403)
      .json({ message: "Not authorized to access this resource" });
  };
}

/**
 * Guard: verifyQuizOwnerOrAdmin
 * Resolves quiz owner by :id and allows owner or admin
 */
export const verifyQuizOwnerOrAdmin = makeVerifyOwnerOrAdmin(async (req) => {
  const id = req.params.id;
  if (!id) return null;
  const doc = await QuizBaseModel.findById(id)
    .select("owner")
    .lean<BaseQuizLean>();
  return doc ? String(doc.owner) : null;
});

/**
 * Guard: verifyAttemptOwnerOrPrivileged
 * Allows: attempt owner (student), class teacher who owns the *schedule* (via class-svc), or admin.
 * Expects :attemptId param and verifyAccessToken already applied.
 */

export async function verifyAttemptOwnerOrPrivileged(
  req: CustomRequest,
  res: Response,
  next: NextFunction
) {
  try {
    // Step 1: ensure auth
    console.log("User in verifyAttemptOwnerOrPrivileged:", req.user);
    const user = req.user;
    if (!user?.id) {
      return res.status(401).json({ ok: false, message: "Unauthorized" });
    }

    // Step 2: validate attemptId param
    const attemptId = req.params.attemptId;
    if (!attemptId || !Types.ObjectId.isValid(attemptId)) {
      return res.status(400).json({ ok: false, message: "Invalid attemptId" });
    }

    // Step 3: load minimal attempt info
    const attempt = await AttemptModel.findById(attemptId)
      .select({
        studentId: 1,
        scheduleId: 1,
      })
      .lean<{ studentId?: any; scheduleId?: any } | null>();

    if (!attempt) {
      return res.status(404).json({ ok: false, message: "Attempt not found" });
    }

    const studentId = attempt.studentId ? String(attempt.studentId) : null;
    const scheduleId = attempt.scheduleId ? String(attempt.scheduleId) : null;

    // Step 4: owner check (student)
    if (studentId && user.id === studentId) return next();

    // Step 5: class teacher via class service (must own the *schedule*'s class)
    if (scheduleId) {
      try {
        const check = await checkTeacherOfSchedule({
          userId: user.id,
          scheduleId,
        });
        if (check.ok && check.isTeacher) return next();
      } catch (e: any) {
        // Fail closed if class-svc is unavailable/misconfigured
        return res
          .status(typeof e?.status === "number" ? e.status : 502)
          .json({ ok: false, message: e?.message || "Class service error" });
      }
    }

    // Step 6: platform admin
    const isAdmin = user.isAdmin === true || user.role === "admin";
    if (isAdmin) return next();

    // Step 7: deny
    return res.status(403).json({ ok: false, message: "Forbidden" });
  } catch (e: any) {
    console.error("[verifyAttemptOwnerOrPrivileged] error", e);
    return res
      .status(500)
      .json({ ok: false, message: "Internal server error" });
  }
}

const unauth = (res: Response) =>
  res.status(401).json({ ok: false, message: "Unauthorized" });
const badreq = (res: Response, msg: string) =>
  res.status(400).json({ ok: false, message: msg });
const forbid = (res: Response) =>
  res.status(403).json({ ok: false, message: "Forbidden" });
const isAdmin = (u: any) => u?.isAdmin === true || u?.role === "admin";

/**
 * Guard: verifyTeacherOfSchedule
 * Allows: teacher in the class that contains this schedule OR admin.
 * Expects: :scheduleId
 */
export async function verifyTeacherOfSchedule(
  req: CustomRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const user = req.user;
    if (!user?.id) return unauth(res);

    const { scheduleId } = req.params;
    if (!scheduleId || !Types.ObjectId.isValid(scheduleId)) {
      return badreq(res, "Invalid scheduleId");
    }

    if (isAdmin(user)) return next();

    try {
      const check = await checkTeacherOfSchedule({
        userId: user.id,
        scheduleId,
      });
      if (check.ok && check.isTeacher) return next();
      return forbid(res);
    } catch (e: any) {
      return res
        .status(typeof e?.status === "number" ? e.status : 502)
        .json({ ok: false, message: e?.message || "Class service error" });
    }
  } catch (e) {
    console.error("[verifyTeacherOfSchedule] error", e);
    return res
      .status(500)
      .json({ ok: false, message: "Internal server error" });
  }
}

/**
 * Guard: verifyTeacherOfStudent
 * Allows: teacher of the student's class OR admin.
 * Expects: :studentId
 */
export async function verifyTeacherOfStudent(
  req: CustomRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const user = req.user;
    if (!user?.id) return unauth(res);

    const { studentId } = req.params;
    if (!studentId || !Types.ObjectId.isValid(studentId)) {
      return badreq(res, "Invalid studentId");
    }

    if (isAdmin(user)) return next();

    try {
      // ✅ Use the correct helper
      const check = await checkTeacherOfStudent({ userId: user.id, studentId });
      if (check.ok && check.isTeacher) return next();
      return forbid(res);
    } catch (e: any) {
      return res
        .status(typeof e?.status === "number" ? e.status : 502)
        .json({ ok: false, message: e?.message || "Class service error" });
    }
  } catch (e) {
    console.error("[verifyTeacherOfStudent] error", e);
    return res
      .status(500)
      .json({ ok: false, message: "Internal server error" });
  }
}

/**
 * Guard: verifyTeacherOfAttemptStudent
 * Allows: teacher of the class the attempt's student belongs to OR admin.
 * Expects: :attemptId
 */
export async function verifyTeacherOfAttemptStudent(
  req: CustomRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const user = req.user;
    if (!user?.id) return unauth(res);

    const { attemptId } = req.params;
    if (!attemptId || !Types.ObjectId.isValid(attemptId)) {
      return badreq(res, "Invalid attemptId");
    }

    if (isAdmin(user)) return next();

    const attempt = await AttemptModel.findById(attemptId)
      .select({ studentId: 1 })
      .lean<{ studentId?: any } | null>();

    if (!attempt) {
      return res.status(404).json({ ok: false, message: "Attempt not found" });
    }
    const studentId = attempt.studentId ? String(attempt.studentId) : null;
    if (!studentId) {
      return res
        .status(404)
        .json({ ok: false, message: "Attempt has no student" });
    }

    try {
      const check = await checkTeacherOfStudent({ userId: user.id, studentId });
      if (check.ok && check.isTeacher) return next();
      return forbid(res);
    } catch (e: any) {
      return res
        .status(typeof e?.status === "number" ? e.status : 502)
        .json({ ok: false, message: e?.message || "Class service error" });
    }
  } catch (e) {
    console.error("[verifyTeacherOfAttemptStudent] error", e);
    return res
      .status(500)
      .json({ ok: false, message: "Internal server error" });
  }
}

/**
 * Guard: verifyTeacherOfStudentOrSelf
 * Allows: the student themself, a teacher of that student, or an admin.
 * Expects: :studentId param (supports "me") or body.studentId fallback.
 */
export async function verifyTeacherOfStudentOrSelf(
  req: CustomRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const user = req.user;
    if (!user?.id) return unauth(res);

    // normalize studentId from params/body, support "me"
    let studentId =
      (req.params?.studentId as string) ||
      (req.body?.studentId as string) ||
      "";

    if (studentId === "me") {
      studentId = String(user.id);
      // keep params in sync in case downstream reads from params
      if (req.params) req.params.studentId = studentId;
    }

    if (!studentId) return badreq(res, "Missing studentId");
    if (!Types.ObjectId.isValid(studentId)) {
      return badreq(res, "Invalid studentId");
    }

    // Admin shortcut
    if (isAdmin(user)) return next();

    // Self-access shortcut
    if (String(user.id) === String(studentId)) return next();

    // Teacher-of-student via class-svc
    try {
      const check = await checkTeacherOfStudent({
        userId: user.id,
        studentId,
      });
      if (check.ok && check.isTeacher) return next();
      return forbid(res);
    } catch (e: any) {
      // Fail closed if class-svc errors (consistent with your other guards)
      return res
        .status(typeof e?.status === "number" ? e.status : 502)
        .json({ ok: false, message: e?.message || "Class service error" });
    }
  } catch (e) {
    console.error("[verifyTeacherOfStudentOrSelf] error", e);
    return res
      .status(500)
      .json({ ok: false, message: "Internal server error" });
  }
}
