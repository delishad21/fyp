import type { Request, Response, NextFunction } from "express";
import { ClassModel } from "../model/class/class-model";
import { Types } from "mongoose";

/** ---------- Types exposed to the rest of the class service ---------- */

export interface VerifiedUser {
  id: string;
  username: string;
  email: string;
  role: "student" | "teacher" | "admin";
  isAdmin: boolean; // derived from role
  teacherId?: string; // present for students; may exist for teachers
  mustChangePassword?: boolean;
}

export interface CustomRequest extends Request {
  user?: VerifiedUser;
}

/** ---------- Internal helpers ---------- */

function getVerifyUrl(): string {
  const base = process.env.USER_SVC_URL;
  if (!base) throw new Error("USER_SVC_URL env var is required");
  return `${base.replace(/\/+$/, "")}/auth/me`;
}

async function safeJson(res: any) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

/** Delegate Authorization header to user-svc /auth/me, normalize user */
async function verifyWithUserService(
  authorization: string
): Promise<VerifiedUser> {
  const url = getVerifyUrl();

  // 5s timeout
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 5000);

  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        authorization,
        accept: "application/json",
        "x-forwarded-auth": "class-service",
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
      console.error("Invalid user-svc /auth/me response data", data);
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
    console.error("Error verifying with user-svc", e);
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

/** ---------- Public middlewares ---------- */

/** Requires Authorization header, calls user-svc /auth/me, attaches req.user */
export async function verifyAccessToken(
  req: CustomRequest,
  res: Response,
  next: NextFunction
) {
  const authorization = req.headers["authorization"];
  if (!authorization) {
    return res.status(401).json({ message: "Authentication failed" });
  }

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

/** Require admin (run AFTER verifyAccessToken) */
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
 * verifyClassOwnerOrAdmin
 * Allows:
 *  - admin
 *  - class owner (c.owner)
 *  - any teacher listed on the class (c.teachers[])
 *
 * Use AFTER verifyAccessToken.
 */
export async function verifyClassOwnerOrAdmin(
  req: CustomRequest,
  res: Response,
  next: NextFunction
) {
  const u = req.user;
  if (!u) return res.status(401).json({ message: "Authentication required" });

  if (u.isAdmin) return next();

  const classId = req.params.id;
  if (!classId) return res.status(400).json({ message: "Missing class id" });

  const c = await ClassModel.findById(classId).select("owner teachers").lean();
  if (!c) return res.status(404).json({ message: "Resource not found" });

  const isOwner = String(c.owner) === String(u.id);
  const isTeacher =
    Array.isArray(c.teachers) &&
    c.teachers.some((t) => String(t) === String(u.id));
  if (isOwner || isTeacher) return next();

  return res
    .status(403)
    .json({ message: "Not authorized to access this resource" });
}

/** Middleware: verify x-quiz-secret header for S2S auth */
export function verifySharedSecret(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const want = process.env.QUIZ_WEBHOOK_SECRET;
  const got = req.header("x-quiz-secret");

  if (!want || !got || want !== got) {
    return res.status(403).json({
      ok: false,
      message: "Forbidden: invalid or missing shared secret",
    });
  }

  return next();
}

/**
 * Returns true if `userId` is an owner or teacher of any class that includes `studentId`.
 * Assumes roster stores student.userId as string.
 */
export async function isTeacherOfStudent(
  userId: string,
  studentId: string
): Promise<boolean> {
  if (!Types.ObjectId.isValid(userId) || !Types.ObjectId.isValid(studentId))
    return false;
  const uid = String(userId);
  const sid = String(studentId);
  const exists = await ClassModel.exists({
    "students.userId": sid,
    $or: [{ owner: uid }, { teachers: uid }],
  });
  return !!exists;
}

export async function verifyTeacherOfStudent(
  req: Request & { user?: any },
  res: Response,
  next: NextFunction
) {
  try {
    const viewer = req.user;
    const viewerId = viewer?.id;
    const studentId = req.params.studentId || req.body?.studentId;

    if (!viewerId)
      return res.status(401).json({ ok: false, message: "Unauthorized" });
    if (!studentId)
      return res.status(400).json({ ok: false, message: "Missing studentId" });

    if (viewer.isAdmin || viewer.role === "admin") return next();

    const ok = await isTeacherOfStudent(String(viewerId), String(studentId));
    if (!ok) return res.status(403).json({ ok: false, message: "Forbidden" });

    return next();
  } catch {
    return res
      .status(500)
      .json({ ok: false, message: "Internal server error" });
  }
}

export async function verifyTeacherOfStudentOrSelf(
  req: Request & { user?: any },
  res: Response,
  next: NextFunction
) {
  try {
    const viewer = req.user;
    const viewerId = String(viewer?.id || "");
    let studentId = String(req.params.studentId || req.body?.studentId || "");

    if (!viewerId)
      return res.status(401).json({ ok: false, message: "Unauthorized" });

    // support :studentId = "me"
    if (studentId === "me") studentId = viewerId;
    (req.params as any).studentId = studentId;

    if (!studentId)
      return res.status(400).json({ ok: false, message: "Missing studentId" });

    if (viewer.isAdmin || viewer.role === "admin") return next();

    // Self
    if (viewerId === studentId) return next();

    // Teacher of the student
    const ok = await isTeacherOfStudent(viewerId, studentId);
    if (!ok) return res.status(403).json({ ok: false, message: "Forbidden" });

    return next();
  } catch {
    return res
      .status(500)
      .json({ ok: false, message: "Internal server error" });
  }
}
