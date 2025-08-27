import jwt from "jsonwebtoken";
import { findUserById as _findUserById } from "../model/webapp-user-repository";
import { Request, Response, NextFunction } from "express";

export interface CustomRequest extends Request {
  user?: any;
  field?: string;
  verified?: boolean;
}

export function verifyAccessToken(
  req: CustomRequest,
  res: Response,
  next: NextFunction
) {
  if (!process.env.JWT_SECRET) {
    console.error("[AUTH] Token verification failed: JWT secret not provided");
    res.status(500).json({ message: "Internal server error" });
    return;
  }

  const authHeader = req.headers["authorization"];

  if (!authHeader) {
    console.log(
      "[AUTH] Token verification failed: Missing authorization header"
    );
    res.status(401).json({ message: "Authentication failed" });
    return;
  }

  const token = authHeader.split(" ")[1];
  jwt.verify(token, process.env.JWT_SECRET, async (err: any, user: any) => {
    if (err) {
      console.log(
        `[AUTH] Token verification failed: Invalid token - ${err.message}`
      );
      res.status(401).json({ message: "Authentication failed" });
      return;
    }

    try {
      const dbUser = await _findUserById(user.id);
      if (!dbUser) {
        console.log(
          `[AUTH] Token verification failed: User not found - ID: ${user.id}`
        );
        res.status(401).json({ message: "Authentication failed" });
        return;
      } else if (!dbUser.isVerified) {
        console.log(
          `[AUTH] Token verification failed: Unverified account - ${dbUser.username}`
        );
        res.status(403).json({ message: "You have not verified your account" });
        return;
      }

      req.user = {
        id: dbUser.id,
        username: dbUser.username,
        email: dbUser.email,
        isAdmin: dbUser.isAdmin,
      };
      console.log(
        `[AUTH] Token verified for user: ${dbUser.username} (${dbUser.id})`
      );
      next();
    } catch (error: any) {
      console.error(
        `[AUTH] Database error during token verification: ${error.message}`
      );
      return res.status(500).json({ message: "Internal server error" });
    }
  });
}

export function verifyIsAdmin(
  req: CustomRequest,
  res: Response,
  next: NextFunction
) {
  if (!req.user) {
    console.log("[AUTH] Admin access denied: No user found in request");
    res.status(403).json({ message: "Not authorized to access this resource" });
    return;
  }
  const { username, isAdmin } = req.user;
  if (isAdmin) {
    console.log(`[AUTH] Admin access granted for user: ${username}`);
    next();
  } else {
    console.log(`[AUTH] Admin access denied for user: ${username}`);
    res.status(403).json({ message: "Not authorized to access this resource" });
    return;
  }
}

export function verifyIsOwnerOrAdmin(
  req: CustomRequest,
  res: Response,
  next: NextFunction
) {
  const { id: tokenId, username, isAdmin } = req.user;
  const paramId = req.params.id;

  if (isAdmin) {
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
  res.status(403).json({ message: "Not authorized to access this resource" });
  return;
}
