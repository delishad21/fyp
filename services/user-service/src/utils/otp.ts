import crypto from "node:crypto";
import {
  TeacherAuthToken,
  TeacherAuthTokenModel,
} from "../model/teacher-auth-token-model";
import { ConfirmErr } from "../controller/helpers/email-confirm-helpers";

const OTP_MAX_ATTEMPTS_DEFAULT = 5;

// --- Types ----
export type OtpVerifyResult =
  | { ok: true; doc: TeacherAuthToken }
  | {
      ok: false;
      reason: OtpFailureReason;
    };

export type OtpFailureReason =
  | "not_found"
  | "used"
  | "expired"
  | "mismatch"
  | "locked";

export function random6Digit(): string {
  return (Math.floor(Math.random() * 1_000_000) + 1_000_000)
    .toString()
    .slice(1);
}

export function sha256Base64(input: string) {
  return crypto.createHash("sha256").update(input, "utf8").digest("base64");
}

export function timingSafeEqual(a: string, b: string) {
  const A = Buffer.from(a);
  const B = Buffer.from(b);
  if (A.length !== B.length) return false;
  return crypto.timingSafeEqual(A, B);
}

/** Issue a fresh OTP: invalidates prior unconsumed tokens of same purpose. */
export async function issueOtpToken(opts: {
  userId: any; // ObjectId
  purpose: "email_verify" | "email_change";
  ttlSeconds: number;
  meta?: Record<string, any>; // e.g., { newEmail }
  maxAttempts?: number; // default 5
}) {
  const selector = crypto.randomBytes(9).toString("base64url");
  const code = random6Digit();
  const validatorHash = sha256Base64(code);
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
    attempts: 0,
    maxAttempts: opts.maxAttempts ?? OTP_MAX_ATTEMPTS_DEFAULT,
  });

  return { selector, code, expiresAt };
}

/** Validate an OTP attempt; increments attempts on mismatch/invalid. */
export async function verifyOtpAndMaybeConsume(
  selector: string,
  code: string
): Promise<OtpVerifyResult> {
  const doc = await TeacherAuthTokenModel.findOne({ selector });
  if (!doc) return { ok: false, reason: "not_found" };

  const now = Date.now();
  if (doc.usedAt) return { ok: false, reason: "used" };
  if (doc.expiresAt.getTime() <= now) return { ok: false, reason: "expired" };
  if (doc.attempts >= doc.maxAttempts) return { ok: false, reason: "locked" };

  const tryHash = sha256Base64(code);
  const match = timingSafeEqual(tryHash, doc.validatorHash);

  if (!match) {
    await TeacherAuthTokenModel.updateOne(
      { _id: doc._id, usedAt: null },
      { $inc: { attempts: 1 } }
    );
    return {
      ok: false,
      reason: "mismatch",
    };
  }

  // Success → consume one-time token
  await TeacherAuthTokenModel.updateOne(
    { _id: doc._id, usedAt: null },
    { $set: { usedAt: new Date() } }
  );

  return { ok: true, doc };
}

/**
 * Maps OTP verify error to a generic HTTP response payload.
 * For now, it generates a generic response to avoid leaking reasons
 * but if needed, we can expand it to provide more specific feedback.
 */
export function mapOtpError(reason: OtpFailureReason): ConfirmErr {
  switch (reason) {
    case "expired":
      console.log("[OTP] Verification failed: OTP expired");
      break;
    case "used":
      console.log("[OTP] Verification failed: OTP already used");
      break;
    case "mismatch":
      console.log("[OTP] Verification failed: OTP mismatch");
      break;
    case "not_found":
      console.log("[OTP] Verification failed: OTP not found");
      break;
    case "locked":
      console.log("[OTP] Verification failed: OTP locked");
      return {
        status: 429,
        message: `Too many verification attempts. Please try again later`,
      };
    default:
      console.log("[OTP] Unknown failure reason:", reason);
  }

  // Default error return code
  return { status: 400, message: "Invalid or expired verification code." };
}
