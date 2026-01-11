import jwt from "jsonwebtoken";
import { Request, Response, NextFunction } from "express";
import { findUserById as _findUserById } from "../model/teacher-user-repository";
import { StudentModel } from "../model/student-user-model"; // <- double-check file name: "mode" vs "model"?
import { AccessTokenPayload } from "../utils/tokens";

type Role = "student" | "teacher" | "admin";

type User = {
  id: string;
  username: string;
  email: string;
  role: Role;
  // Recommend deriving instead of storing, but keep it if your DB uses it:
  isAdmin: boolean;
  teacherId?: string;
  mustChangePassword?: boolean;
};

export interface CustomRequest extends Request {
  user?: User;
  mustChangePassword?: boolean;
  field?: string;
  verified?: boolean;
}

/** Small helper: runtime + compile-time assert that req.user exists */
function assertHasUser(
  req: CustomRequest
): asserts req is CustomRequest & { user: User } {
  if (!req.user) {
    throw Object.assign(new Error("Unauthorized"), { status: 401 });
  }
}

export async function verifyAccessToken(
  req: CustomRequest,
  res: Response,
  next: NextFunction
) {
  try {
    console.log("[AUTH] Verifying access token...");
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      console.error("[AUTH] JWT secret not provided");
      return res.status(500).json({ message: "Internal server error" });
    }
    // console.log("[AUTH] JWT secret loaded");

    const authHeader = req.headers.authorization || "";
    if (!authHeader) {
      console.error("[AUTH] Missing authorization header");
      return res.status(401).json({ message: "Authentication failed" });
    }
    // console.log("[AUTH] Authorization header found");

    const token = authHeader.replace(/^Bearer\s+/i, "");
    let decoded: AccessTokenPayload;
    try {
      decoded = jwt.verify(token, secret) as AccessTokenPayload;
    } catch (err: any) {
      console.error(`[AUTH] Invalid token - ${err.message}`);
      return res.status(401).json({ message: "Authentication failed" });
    }
    console.log("[AUTH] Token verified");
    console.log(`[AUTH] Decoded token for user ID: ${decoded.id}`);
    const role = decoded.role;
    // console.log(`[AUTH] User role from token: ${role}`);

    if (role === "teacher" || role === "admin") {
      console.log(`[AUTH] Verifying teacher/admin user - ID: ${decoded.id}`);
      const dbUser = await _findUserById(decoded.id);
      console.log(`[AUTH] Found teacher/admin user: ${dbUser?.username}`);
      if (!dbUser) {
        console.log(`[AUTH] User not found - ID: ${decoded.id}`);
        return res.status(401).json({ message: "Authentication failed" });
      }
      if (!dbUser.isVerified) {
        console.log(`[AUTH] Unverified account - ${dbUser.username}`);
        return res
          .status(403)
          .json({ message: "You have not verified your account" });
      }

      req.user = {
        id: dbUser.id,
        username: dbUser.username,
        email: dbUser.email,
        role,
        isAdmin: dbUser.isAdmin ?? role === "admin", // derive if missing
        teacherId: decoded.teacherId,
        mustChangePassword: decoded.mustChangePassword,
      };
      console.log(`[AUTH] Access token verified for user: ${dbUser.username}`);
      return next();
    }

    if (role === "student") {
      const stu = await StudentModel.findById(decoded.id).lean();
      if (!stu) {
        console.log(`[AUTH] Student not found - ID: ${decoded.id}`);
        return res.status(401).json({ message: "Authentication failed" });
      }
      if (stu.isDisabled) {
        console.log(`[AUTH] Disabled student - ${stu.username}`);
        return res.status(403).json({ message: "Account disabled" });
      }

      req.user = {
        id: String(stu._id),
        username: String(stu.username || ""),
        email: String(stu.email || ""),
        role: "student",
        isAdmin: false, // derive from role
        teacherId: String(stu.teacherId || decoded.teacherId || ""),
        mustChangePassword: Boolean(
          stu.mustChangePassword ?? decoded.mustChangePassword
        ),
      };
      return next();
    }

    // Unknown role
    console.error(`[AUTH] Unknown role in token: ${role}`);
    return res.status(401).json({ message: "Authentication failed" });
  } catch (e: any) {
    const status = e?.status ?? 500;
    console.error("[AUTH] Error during token verification:", e);
    return res.status(status).json({
      message:
        status === 401 ? "Authentication failed" : "Internal server error",
    });
  }
}

/** Require teacher OR admin */
export function verifyTeacherAccessToken(
  req: CustomRequest,
  res: Response,
  next: NextFunction
) {
  verifyAccessToken(req, res, () => {
    if (!req.user)
      return res.status(401).json({ message: "Authentication failed" });
    if (req.user.role === "teacher" || req.user.role === "admin") return next();
    return res
      .status(403)
      .json({ message: "Forbidden: Teacher access required" });
  });
}

/** Require student */
export function verifyStudentAccessToken(
  req: CustomRequest,
  res: Response,
  next: NextFunction
) {
  verifyAccessToken(req, res, () => {
    if (!req.user)
      return res.status(401).json({ message: "Authentication failed" });
    if (req.user.role === "student") return next();
    return res
      .status(403)
      .json({ message: "Forbidden: Student access required" });
  });
}

/** Require admin */
export function verifyIsAdmin(
  req: CustomRequest,
  res: Response,
  next: NextFunction
) {
  verifyAccessToken(req, res, () => {
    try {
      assertHasUser(req); // now TS knows req.user exists
      if (req.user.isAdmin || req.user.role === "admin") {
        console.log(
          `[AUTH] Admin access granted for user: ${req.user.username}`
        );
        return next();
      }
      console.log(`[AUTH] Admin access denied for user: ${req.user.username}`);
      return res
        .status(403)
        .json({ message: "Not authorized to access this resource" });
    } catch {
      return res.status(401).json({ message: "Authentication failed" });
    }
  });
}

/** Require owner OR admin */
export function verifyIsOwnerOrAdmin(
  req: CustomRequest,
  res: Response,
  next: NextFunction
) {
  verifyAccessToken(req, res, () => {
    try {
      assertHasUser(req);
      const { id: tokenId, username, isAdmin, role } = req.user;
      const paramId = req.params.id;

      if (isAdmin || role === "admin") {
        console.log(`[AUTH] Admin access granted for user: ${username}`);
        return next();
      }
      if (paramId === tokenId) {
        console.log(`[AUTH] Owner access granted for user: ${username}`);
        return next();
      }
      console.log(
        `[AUTH] Unauthorized access attempt by user: ${username} for resource: ${paramId}`
      );
      return res
        .status(403)
        .json({ message: "Not authorized to access this resource" });
    } catch {
      return res.status(401).json({ message: "Authentication failed" });
    }
  });
}
