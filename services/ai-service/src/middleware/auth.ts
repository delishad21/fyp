import type { Request, Response, NextFunction } from "express";

/** ---------- Types exposed to the rest of the ai service ---------- */

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
  teacherId?: string; // For backwards compatibility
}

/** ---------- Internal helpers ---------- */

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

/** Delegate Authorization header to user-svc /auth/me, normalize user */
async function verifyWithUserService(
  authorization: string,
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
        "x-forwarded-auth": "ai-service",
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
    };

    if (data.teacherId) {
      verified.teacherId = String(data.teacherId);
    }

    if (data.mustChangePassword !== undefined) {
      verified.mustChangePassword = data.mustChangePassword;
    }

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
  next: NextFunction,
) {
  const authorization = req.headers["authorization"];
  if (!authorization) {
    return res.status(401).json({ message: "Authentication failed" });
  }

  try {
    const user = await verifyWithUserService(authorization);
    req.user = user;

    // For backwards compatibility with existing controller code
    if (user.teacherId) {
      req.teacherId = user.teacherId;
    } else if (user.role === "teacher") {
      req.teacherId = user.id;
    }

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
  next: NextFunction,
) {
  const user = req.user;
  if (!user)
    return res.status(401).json({ message: "Authentication required" });
  if (user.isAdmin) return next();
  return res
    .status(403)
    .json({ message: "Not authorized to access this resource" });
}

/** Require teacher role (run AFTER verifyAccessToken) */
export function verifyIsTeacher(
  req: CustomRequest,
  res: Response,
  next: NextFunction,
) {
  const user = req.user;
  if (!user)
    return res.status(401).json({ message: "Authentication required" });
  if (user.role === "teacher" || user.isAdmin) return next();
  return res
    .status(403)
    .json({ message: "Only teachers can access this resource" });
}
