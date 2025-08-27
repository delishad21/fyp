// auth-resend-helpers.ts
import { Types } from "mongoose";
import {
  WebAppAuthTokenModel,
  type WebAppAuthToken,
} from "../../model/webapp-auth-token-model";
import {
  findUserById as _findUserById,
  updateUserById as _updateUserById,
} from "../../model/webapp-user-repository";
import { issueOtpToken } from "../../utils/otp";
import { issueAuthToken } from "../../utils/tokens";
import {
  sendVerificationEmail,
  sendVerificationEmailForEmailChange,
} from "../../utils/mail";

// Config
export const VERIFY_TTL_SECONDS = 10 * 60;
export const EMAIL_CHANGE_TTL_SECONDS = 10 * 60;
export const RESEND_THROTTLE_SECONDS = 60;

export type LoadedContext = {
  token: WebAppAuthToken;
  user: Awaited<ReturnType<typeof _findUserById>>;
};

export async function loadTokenAndUser(
  selector: string
): Promise<LoadedContext | null> {
  const token = await WebAppAuthTokenModel.findOne({
    selector,
  }).lean<WebAppAuthToken>();
  if (!token) return null;
  const user = await _findUserById(token.userId.toString());
  if (!user) return null;
  return { token, user };
}

export function secondsLeft(date: Date) {
  return Math.max(0, Math.floor((date.getTime() - Date.now()) / 1000));
}

/**
 * throttle so users can't spam resends.
 * Returns {ok:false, retryAfter} if within the cooldown window.
 */
export function checkThrottle(token: WebAppAuthToken) {
  if (!RESEND_THROTTLE_SECONDS) return { ok: true as const };

  const since = Math.floor(
    (Date.now() - new Date(token.createdAt).getTime()) / 1000
  );
  const remain = RESEND_THROTTLE_SECONDS - since;
  if (remain > 0) {
    return { ok: false as const, retryAfter: remain };
  }
  return { ok: true as const };
}

export async function resendForEmailVerify(ctx: LoadedContext) {
  const { token, user } = ctx;
  // User is guaranteed to be non-null

  // If already verified, do not resend
  if (user!.isVerified) {
    console.log("[RESEND] User already verified, skipping resend");
    return { status: 400, body: { message: "Account already verified" } };
  }

  // Throttle
  const throttle = checkThrottle(token);
  if (!throttle.ok) {
    console.log(
      `[RESEND] Throttle active, please wait ${throttle.retryAfter} seconds`
    );
    return {
      status: 429,
      body: {
        message: "Please wait before requesting another code.",
        retryAfter: throttle.retryAfter,
      },
    };
  }

  // Issue new OTP (invalidates any previous unconsumed)
  const {
    selector: newSelector,
    code,
    expiresAt,
  } = await issueOtpToken({
    userId: user!._id,
    purpose: "email_verify",
    ttlSeconds: VERIFY_TTL_SECONDS,
  });

  await sendVerificationEmail(user!.email, user!.username, code);
  console.log(`[RESEND] New verification code sent to ${user!.email}`);

  // Update user expireAt time
  const accountExpiry = new Date(Date.now() + VERIFY_TTL_SECONDS * 1000);
  await _updateUserById(user!.id, { expireAt: accountExpiry });

  return {
    status: 200,
    body: {
      message: "A new verification code has been sent.",
      data: {
        selector: newSelector,
        ttl: secondsLeft(expiresAt),
        cooldownSeconds: RESEND_THROTTLE_SECONDS,
      },
    },
  };
}

export async function resendForEmailChange(ctx: LoadedContext) {
  const { token, user } = ctx;
  // User is guaranteed to be non-null

  const newEmail = String(token.meta?.newEmail || "")
    .trim()
    .toLowerCase();
  if (!newEmail) {
    console.log(
      "[RESEND] Invalid email change request (missing target email in token)."
    );
    return {
      status: 400,
      body: { message: "Invalid email change request (missing target email)." },
    };
  }

  if (user!.email.toLowerCase() === newEmail) {
    console.log("[RESEND] Email already updated.");
    return { status: 200, body: { message: "Email already updated." } };
  }

  const throttle = checkThrottle(token);
  if (!throttle.ok) {
    console.log(
      `[RESEND] Throttle active, please wait ${throttle.retryAfter} seconds`
    );
    return {
      status: 429,
      body: {
        message: "Please wait before requesting another code.",
        retryAfter: throttle.retryAfter,
      },
    };
  }

  // Re-issue fresh selector+validator (invalidates prior unconsumed)
  const {
    selector: s2,
    code,
    expiresAt,
  } = await issueOtpToken({
    userId: String(user!.id ?? user!._id), // ensure string
    purpose: "email_change",
    ttlSeconds: EMAIL_CHANGE_TTL_SECONDS,
    meta: { newEmail },
  });

  await sendVerificationEmailForEmailChange(newEmail, user!.username, code);
  console.log(`[RESEND] New email change code sent to ${newEmail}`);
  return {
    status: 200,
    body: {
      message: "A code has been sent to your new email.",
      data: {
        selector: s2,
        ttl: secondsLeft(expiresAt),
        cooldownSeconds: RESEND_THROTTLE_SECONDS,
      }, // never return the validator
    },
  };
}
