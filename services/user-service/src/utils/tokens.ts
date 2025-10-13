import jwt, { type SignOptions, type Secret } from "jsonwebtoken";
import crypto from "node:crypto";
import {
  TeacherAuthToken,
  TeacherAuthTokenModel,
  TeacherAuthTokenPurpose,
} from "../model/teacher-auth-token-model";
import { Types } from "mongoose";

export function generateEmailToken(
  payload: { id: string },
  expiresInSeconds: number
): string {
  return jwt.sign(payload, process.env.JWT_SECRET!, {
    expiresIn: expiresInSeconds,
  });
}

export const generateForgetPasswordToken = (
  userId: string,
  verificationCode: number,
  expiresInSeconds: number
): string => {
  return jwt.sign(
    { id: userId, code: verificationCode },
    process.env.JWT_SECRET!,
    { expiresIn: expiresInSeconds }
  );
};

export type Role = "admin" | "teacher" | "student";

export type OptionalClaims = {
  teacherId?: string;
  mustChangePassword?: boolean;
  tokenVersion?: number; // if you ever want server-side invalidation
};

export type AccessTokenPayload = {
  id: string; // REQUIRED
  role: Role; // REQUIRED
  teacherId?: string; // optional (on student tokens)
  mustChangePassword?: boolean;
  iat: number;
  exp: number;
};

type IssueOpts = { expiresIn?: SignOptions["expiresIn"] };

export function generateAccessToken(
  userId: string,
  role: Role, // REQUIRED
  extra: OptionalClaims = {}, // optional extras
  opts: IssueOpts = {} // optional sign options
): string {
  const secret: Secret = process.env.JWT_SECRET as Secret;
  if (!secret) throw new Error("JWT_SECRET not configured");

  const payload = { id: userId, role, ...extra }; // keep `id` for FE, add role

  return jwt.sign(payload, secret, {
    expiresIn: opts.expiresIn ?? "1d",
  });
}
const SELECTOR_BYTES = 9; // ~12 chars base64url
const VALIDATOR_BYTES = 32; // 256-bit secret

export function randomBase64Url(bytes: number) {
  return crypto.randomBytes(bytes).toString("base64url");
}

export function sha256Base64(str: string) {
  return crypto.createHash("sha256").update(str, "utf8").digest("base64");
}

/**
 * Compare two strings in a timing-safe manner. Prevents timing attacks.
 */

export function timingSafeEqual(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

/**
 * Issue a selector+validator token (invalidates prior tokens of same purpose).
 * Returns { selector, validator, expiresAt }
 */
export async function issueAuthToken(opts: {
  userId: Types.ObjectId;
  purpose: TeacherAuthTokenPurpose;
  ttlSeconds: number;
  meta?: Record<string, any>;
}) {
  const selector = randomBase64Url(SELECTOR_BYTES);
  const validator = randomBase64Url(VALIDATOR_BYTES);
  const validatorHash = sha256Base64(validator);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + opts.ttlSeconds * 1000);

  // Invalidate any outstanding tokens for this user+purpose
  await TeacherAuthTokenModel.updateMany(
    { userId: opts.userId, purpose: opts.purpose, usedAt: null },
    { $set: { usedAt: now } }
  );

  await TeacherAuthTokenModel.create({
    selector,
    validatorHash,
    userId: opts.userId,
    purpose: opts.purpose,
    meta: opts.meta ?? {},
    createdAt: now,
    expiresAt,
    usedAt: null,
  });

  return { selector, validator, expiresAt };
}

/**
 * Validate selector+validator and return the token doc (not consumed yet).
 * Caller should check purpose; then mark used when applying the action.
 */
export type ValidationResult =
  | { ok: true; doc: TeacherAuthToken }
  | { ok: false; reason: "not_found" | "used" | "expired" | "mismatch" };

export async function validateAuthToken(
  selector: string,
  validator: string
): Promise<ValidationResult> {
  const doc = await TeacherAuthTokenModel.findOne({
    selector,
  }).lean<TeacherAuthToken>();
  if (!doc) return { ok: false, reason: "not_found" };

  const now = Date.now();
  if (doc.usedAt) return { ok: false, reason: "used" };
  if (doc.expiresAt.getTime() <= now) return { ok: false, reason: "expired" };

  const hash = sha256Base64(validator);
  if (!timingSafeEqual(hash, doc.validatorHash)) {
    return { ok: false, reason: "mismatch" };
  }

  return { ok: true, doc };
}

/* Mark a token consumed */
export async function consumeAuthToken(selector: string) {
  await TeacherAuthTokenModel.updateOne(
    { selector, usedAt: null },
    { $set: { usedAt: new Date() } }
  );
}
