import type { NextFunction, Request, Response } from "express";
import { GameAttemptModel } from "../model/events/game-attempt-model";

export interface VerifiedUser {
  id: string;
  username: string;
  email: string;
  role: "student" | "teacher" | "admin";
  isAdmin: boolean;
  teacherId?: string;
  mustChangePassword?: boolean;
}

export interface CustomRequest extends Request {
  user?: VerifiedUser;
}

function userSvcBaseUrl() {
  const base = String(process.env.USER_SVC_URL || "").trim() || "http://user-service:7301";
  return base.replace(/\/+$/, "");
}

function classSvcBaseUrl() {
  const base = String(process.env.CLASS_SVC_URL || "").trim() || "http://class-service:7303";
  return base.replace(/\/+$/, "");
}

function sharedSecret() {
  const secret =
    String(process.env.QUIZ_WEBHOOK_SECRET || "").trim() ||
    String(process.env.CLASS_SHARED_SECRET || "").trim();
  if (!secret) {
    const err: any = new Error("Game service is missing QUIZ_WEBHOOK_SECRET/CLASS_SHARED_SECRET");
    err.status = 500;
    throw err;
  }
  return secret;
}

async function safeJson(res: globalThis.Response) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

async function verifyWithUserService(authorization: string): Promise<VerifiedUser> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 5000);

  try {
    const res = await fetch(`${userSvcBaseUrl()}/auth/me`, {
      method: "GET",
      headers: {
        authorization,
        accept: "application/json",
        "x-forwarded-auth": "game-service",
      },
      signal: ctl.signal,
    });

    if (!res.ok) {
      const body = await safeJson(res);
      const err: any = new Error(
        (body && (body.message || body.error)) || "Authentication failed"
      );
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

    return {
      id: String(data.id),
      username: String(data.username || ""),
      email: String(data.email || ""),
      role: data.role,
      isAdmin: data.role === "admin",
      teacherId: data.teacherId ? String(data.teacherId) : undefined,
      mustChangePassword: data.mustChangePassword,
    };
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

async function checkTeacherOfStudent(input: { userId: string; studentId: string }) {
  return checkTeacherHelper("/helper/check-teacher-of-student", input);
}

async function checkTeacherOfClass(input: { userId: string; classId: string }) {
  return checkTeacherHelper("/helper/check-teacher-of-class", input);
}

async function checkTeacherOfSchedule(input: { userId: string; scheduleId: string }) {
  return checkTeacherHelper("/helper/check-teacher-of-schedule", input);
}

async function checkTeacherHelper(
  path: string,
  payload: Record<string, string>
) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 5000);

  try {
    const res = await fetch(`${classSvcBaseUrl()}${path}`, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "x-quiz-secret": sharedSecret(),
      },
      body: JSON.stringify(payload),
      signal: ctl.signal,
    });

    const body = (await safeJson(res)) as
      | { ok?: boolean; isTeacher?: boolean; message?: string }
      | null;

    if (!res.ok) {
      const err: any = new Error(body?.message || "Class service error");
      err.status = res.status;
      throw err;
    }

    return !!body?.isTeacher;
  } catch (e: any) {
    if (e?.name === "AbortError") {
      const err: any = new Error("Class service timeout");
      err.status = 503;
      throw err;
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

function unauth(res: Response) {
  return res.status(401).json({ ok: false, message: "Unauthorized" });
}

function badreq(res: Response, message: string) {
  return res.status(400).json({ ok: false, message });
}

function forbid(res: Response) {
  return res.status(403).json({ ok: false, message: "Forbidden" });
}

function isAdmin(user: VerifiedUser | undefined) {
  return !!user && (user.isAdmin || user.role === "admin");
}

export async function verifyAccessToken(
  req: CustomRequest,
  res: Response,
  next: NextFunction
) {
  const authorization = req.headers.authorization;
  if (!authorization || (Array.isArray(authorization) && !authorization[0])) {
    return unauth(res);
  }

  const header = Array.isArray(authorization) ? String(authorization[0]) : String(authorization);

  try {
    const user = await verifyWithUserService(header);
    req.user = user;
    return next();
  } catch (e: any) {
    return res
      .status(typeof e?.status === "number" ? e.status : 401)
      .json({ ok: false, message: e?.message || "Authentication failed" });
  }
}

export async function verifyTeacherOfStudentOrSelf(
  req: CustomRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const user = req.user;
    if (!user?.id) return unauth(res);

    let studentId =
      String(req.params?.studentId || "").trim() ||
      String(req.body?.studentId || "").trim();

    if (!studentId) {
      return badreq(res, "Missing studentId");
    }

    if (studentId === "me") {
      studentId = String(user.id);
      if (req.params) req.params.studentId = studentId;
    }

    if (isAdmin(user)) return next();
    if (String(user.id) === studentId) return next();

    const allowed = await checkTeacherOfStudent({
      userId: String(user.id),
      studentId,
    });

    if (!allowed) return forbid(res);
    return next();
  } catch (e: any) {
    return res
      .status(typeof e?.status === "number" ? e.status : 500)
      .json({ ok: false, message: e?.message || "Internal server error" });
  }
}

export async function verifyAttemptOwnerOrPrivileged(
  req: CustomRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const user = req.user;
    if (!user?.id) return unauth(res);

    const classId = String(req.params?.classId || "").trim();
    const studentId = String(req.params?.studentId || "").trim();
    const attemptId = String(req.params?.attemptId || "").trim();

    if (!classId) return badreq(res, "Missing classId");
    if (!studentId) return badreq(res, "Missing studentId");
    if (!attemptId) return badreq(res, "Missing attemptId");

    if (isAdmin(user)) return next();
    if (String(user.id) === studentId) return next();

    const attempt = await GameAttemptModel.findOne({ attemptId })
      .select({ scheduleId: 1, classId: 1, studentId: 1 })
      .lean<{
        scheduleId?: string;
        classId?: string;
        studentId?: string;
      } | null>();

    if (attempt) {
      if (
        String(attempt.classId || "") !== classId ||
        String(attempt.studentId || "") !== studentId
      ) {
        return res.status(404).json({ ok: false, message: "Attempt not found" });
      }

      const teacherBySchedule = await checkTeacherOfSchedule({
        userId: String(user.id),
        scheduleId: String(attempt.scheduleId || ""),
      });

      if (teacherBySchedule) return next();
      return forbid(res);
    }

    // Attempt projection may not exist yet; fail closed to class ownership.
    const teacherByClass = await checkTeacherOfClass({
      userId: String(user.id),
      classId,
    });

    if (teacherByClass) return next();
    return forbid(res);
  } catch (e: any) {
    return res
      .status(typeof e?.status === "number" ? e.status : 500)
      .json({ ok: false, message: e?.message || "Internal server error" });
  }
}
