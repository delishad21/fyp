import type { Request, Response, NextFunction } from "express";

export interface CustomRequest extends Request {
  user?: VerifiedUser;
}

export interface VerifiedUser {
  id: string;
  username: string;
  email: string;
  isAdmin: boolean;
}

/** Build the full verify URL once */
function getVerifyUrl(): string {
  const base = process.env.USER_SVC_URL;
  if (!base) {
    throw new Error("USER_SVC_URL env var is required");
  }
  return `${base.replace(/\/+$/, "")}/webapp/auth/verify-token`;
}

/**
 * verifyAccessToken middleware
 *
 * Purpose:
 * - Validates the `Authorization` header by delegating token verification to the user service.
 * - Attaches the verified `user` object to `req` if successful.
 *
 * Params:
 * - @param {CustomRequest} req — Express request, extended with optional `user`.
 * - @param {Response} res — Express response.
 * - @param {NextFunction} next — Express next middleware callback.
 *
 * Behavior:
 * - Reads `authorization` header.
 * - Calls user-svc `/webapp/auth/verify-token` endpoint with timeout + error handling.
 * - If valid, sets `req.user = VerifiedUser` and calls `next()`.
 *
 * Responses:
 * - 200 (via next) when authenticated.
 * - 401 if missing/invalid token.
 * - 503 if user service times out.
 */
async function verifyWithUserService(
  authorization: string
): Promise<VerifiedUser> {
  const url = getVerifyUrl();

  // 5s timeout
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 5000);

  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        authorization: authorization,
        "x-forwarded-auth": "quiz-service",
        accept: "application/json",
      },
      signal: ctl.signal,
    });

    if (!res.ok) {
      // Forward the user-svc status semantics
      const body = await safeJson(res);
      const msg = (body && body.message) || "Authentication failed";
      const err: any = new Error(msg);
      err.status = res.status;
      throw err;
    }

    const data = (await res.json()) as {
      message?: string;
      data?: VerifiedUser;
    };
    if (!data?.data || !data.data.id) {
      const err: any = new Error("Authentication failed");
      err.status = 401;
      throw err;
    }
    return data.data;
  } catch (e: any) {
    if (e?.name === "AbortError") {
      const err: any = new Error("Auth service timeout");
      err.status = 503;
      throw err;
    }
    if (typeof e?.status === "number") throw e; // rethrow known HTTP error
    const err: any = new Error("Authentication failed");
    err.status = 401;
    throw err;
  } finally {
    clearTimeout(t);
  }
}

async function safeJson(res: Response | any) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * AuthN middleware for the quiz service.
 * Delegates token verification to the user service.
 */
export async function verifyAccessToken(
  req: CustomRequest,
  res: Response,
  next: NextFunction
) {
  const authHeader = req.headers["authorization"];
  if (!authHeader) {
    return res.status(401).json({ message: "Authentication failed" });
  }

  try {
    const verified = await verifyWithUserService(authHeader);
    req.user = verified;
    return next();
  } catch (e: any) {
    const status = typeof e?.status === "number" ? e.status : 401;
    return res
      .status(status)
      .json({ message: e?.message || "Authentication failed" });
  }
}

/** Simple admin check. Run this AFTER verifyAccessToken. */
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
 * makeVerifyOwnerOrAdmin factory
 *
 * Purpose:
 * - Builds a middleware that allows access only if the requester is either:
 *   • an admin (`user.isAdmin`), OR
 *   • the owner of the resource (as determined by a provided async function).
 *
 * Params:
 * - @param {(req: CustomRequest) => Promise<string|null>} getOwnerId — Async function to fetch resource owner ID given the request.
 *
 * Behavior:
 * - Requires `req.user` (set by verifyAccessToken).
 * - Calls `getOwnerId(req)` to resolve resource owner.
 * - Grants access if `req.user.isAdmin` or `req.user.id === ownerId`.
 *
 * Responses:
 * - 200 (via next) if authorized.
 * - 401 if not authenticated.
 * - 403 if not owner or admin.
 * - 404 if resource owner cannot be resolved (null).
 * - 500 if `getOwnerId` throws unexpectedly.
 *
 * Example:
 * ```ts
 * const verifyQuizOwnerOrAdmin = makeVerifyOwnerOrAdmin(async (req) => {
 *   const quiz = await QuizBaseModel.findById(req.params.quizId).select("owner").lean();
 *   return quiz ? String(quiz.owner) : null;
 * });
 * ```
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
      // If your loader throws for not-found, convert to 404
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
