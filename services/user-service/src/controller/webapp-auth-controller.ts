import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { Request, Response } from "express";
import {
  findUserByEmail as _findUserByEmail,
  findUserByUsername as _findUserByUsername,
  confirmUserById as _confirmUserById,
  findUserById as _findUserById,
} from "../model/webapp-user-repository";
import { formatUserResponse } from "../utils/formats";
import { CustomRequest } from "../middleware/access-control";
import {
  sendPasswordResetLink,
  sendVerificationEmail,
  sendVerificationEmailForEmailChange,
} from "../utils/mail";
import { isValidEmail, validatePassword } from "../utils/validators";
import {
  consumeAuthToken,
  generateAccessToken,
  issueAuthToken,
  validateAuthToken,
} from "../utils/tokens";
import { mapOtpError, verifyOtpAndMaybeConsume } from "../utils/otp";
import { WebAppAuthTokenModel } from "../model/webapp-auth-token-model";
import {
  loadTokenAndUser,
  resendForEmailChange,
  resendForEmailVerify,
} from "./helpers/email-resend-helpers";
import {
  handleEmailChange,
  handleEmailVerify,
  loadUserFromTokenDoc,
} from "./helpers/email-confirm-helpers";

export async function handleSignIn(req: CustomRequest, res: Response) {
  const { identifier, password } = req.body;
  console.log(`[AUTH] Sign-in attempt for user: ${identifier}`);

  if (!identifier || !password) {
    console.log(`[AUTH] Sign-in failed: Missing credentials for ${identifier}`);
    res.status(400).json({ message: "Missing identifier and/or password" });
    return;
  }

  try {
    const user = isValidEmail(identifier)
      ? await _findUserByEmail(identifier)
      : await _findUserByUsername(identifier);

    if (!user) {
      console.log(`[AUTH] Login failed: User not found - ${identifier}`);
      res.status(401).json({ message: "Wrong username/email and/or password" });
      return;
    }

    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      console.log(
        `[AUTH] Login failed: Invalid password for user ${identifier}`
      );
      res.status(401).json({ message: "Wrong username/email and/or password" });
      return;
    }

    // IMPORTANT FOR THIS TO COME AFTER PASSWORD VERIFICATION.
    // Sign in -> verification redirect -> user login after confirmation
    if (!user.isVerified) {
      console.log(`[AUTH] Login failed: Unverified account - ${identifier}`);

      // Find the latest still-valid verification token for this user
      const now = new Date();
      const token = await WebAppAuthTokenModel.findOne({
        userId: user._id,
        purpose: "email_verify",
        usedAt: null,
        expiresAt: { $gt: now },
      })
        .sort({ createdAt: -1 })
        .lean();

      if (token) {
        const ttl = Math.max(
          0,
          Math.floor((token.expiresAt.getTime() - Date.now()) / 1000)
        );
        // Return 403 with selector so the frontend can route to the verify page it originally used
        return res.status(403).json({
          message: "You have not verified your account.",
          data: {
            selector: token.selector,
          },
        });
      }

      // No active token found, means account should be expired as well
      return res.status(403).json({
        message:
          "Verification code has expired, please create your account again.",
      });
    }

    console.log(`[AUTH] Login successful: ${user.username} (${user.id})`);
    // Generate JWT access token
    const accessToken = generateAccessToken(user.id);

    res.status(200).json({
      message: "User logged in",
      data: {
        accessToken,
        ...formatUserResponse(user),
      },
    });
    return;
  } catch (err: any) {
    console.error(`[AUTH] Login error: ${err.message}`, err);
    res.status(500).json({ message: "Unknown error occurred during login" });
    return;
  }
}

export const RESET_TTL_SECONDS = 10 * 60; // 10 minutes
export const RESET_COOLDOWN_SECONDS = 60;

export async function handleForgetPassword(req: CustomRequest, res: Response) {
  const { email } = req.body ?? {};
  console.log(
    `[AUTH] Password reset request for: ${email || "(missing email)"}`
  );

  if (!email) {
    console.log("[AUTH] Password reset failed: Missing email");
    return res.status(400).json({ message: "Missing email" });
  }

  try {
    // Always respond generically to avoid account enumeration.
    const generic = {
      message: "If an account exists, a password reset email has been sent.",
      cooldownSeconds: RESET_COOLDOWN_SECONDS,
    };

    // Look up user by email (case-insensitive if your schema allows)
    const user = await _findUserByEmail(email);
    if (!user) {
      console.log(
        `[AUTH] Password reset: no user for ${email}, responded generically`
      );
      return res.status(200).json(generic);
    }

    // Check if prior reset token was issued less than a minute ago
    const now = new Date();
    const priorToken = await WebAppAuthTokenModel.findOne({
      userId: user._id,
      purpose: "password_reset",
      usedAt: null,
      expiresAt: { $gt: now },
    })
      .sort({ createdAt: -1 })
      .lean();

    if (priorToken) {
      const timeSinceLast = Math.floor(
        (Date.now() - priorToken.createdAt.getTime()) / 1000
      );
      if (timeSinceLast < RESET_COOLDOWN_SECONDS) {
        console.log(
          `[AUTH] Password reset: prior link issued less than a minute ago for ${email}, no new link sent.`
        );
        return res.status(200).json(generic);
      }
    }

    // Invalidate prior reset tokens & issue a fresh one-time token
    const { selector, validator, expiresAt } = await issueAuthToken({
      userId: user._id,
      purpose: "password_reset",
      ttlSeconds: RESET_TTL_SECONDS,
    });

    const link = `${
      process.env.FRONTEND_URL
    }/auth/forget-password/reset?selector=${encodeURIComponent(
      selector
    )}&validator=${encodeURIComponent(validator)}`;

    // Send email with the reset link (no codes, no secrets returned via API)
    await sendPasswordResetLink(user.email, user.username, link);

    console.log(
      `[AUTH] Password reset link sent to ${user.email} (userId=${user.id})`
    );

    // Return generic success (no token, no user existence leak)
    return res.status(200).json(generic);
  } catch (err: any) {
    console.error(`[AUTH] Password reset error: ${err.message}`, err);
    return res.status(500).json({
      message: "Unknown error occurred during password reset request",
    });
  }
}

export async function handleVerifyToken(req: CustomRequest, res: Response) {
  try {
    const verifiedUser = req.user;
    res.status(200).json({ message: "Token verified", data: verifiedUser });
    return;
  } catch (err: any) {
    res.status(500).json({ message: err.message });
    return;
  }
}

export async function verifyPassword(req: CustomRequest, res: Response) {
  try {
    const { username } = req.user;

    console.log(`[AUTH] Password verification attempt for user: ${username}`);

    const user = await _findUserByUsername(username);

    if (!user) {
      console.log(
        `[AUTH] Password verification failed: User not found - ${username}`
      );
      res.status(401).json({ message: "User not found" });
      return;
    }

    const match = await bcrypt.compare(req.body.password, user.password);

    if (!match) {
      console.log(`[AUTH] Password verification failed for user: ${username}`);
      res.status(401).json({ message: "Wrong password" });
      return;
    }

    console.log(`[AUTH] Password verified successfully for user: ${username}`);
    res.status(200).json({ message: "Password verified!" });
    return;
  } catch (err: any) {
    console.error(`[AUTH] Password verification error: ${err.message}`, err);
    res.status(500).json({ message: err.message });
    return;
  }
}
export async function confirmEmail(req: CustomRequest, res: Response) {
  try {
    let { selector, code } = (req.body ?? {}) as {
      selector?: string;
      code?: string;
    };

    // Normalize inputs
    selector = (selector ?? "").trim();
    code = (code ?? "").trim().replace(/\s|-/g, ""); // allow "123 456" / "123-456"

    // Don’t log the full selector (capability)
    console.log("[AUTH] Email confirmation attempt received");

    if (!selector || !code) {
      return res
        .status(400)
        .json({ message: "Missing verification parameters." });
    }

    // 1) Validate OTP (increments attempts on mismatch; consumes on success)
    const result = await verifyOtpAndMaybeConsume(selector, code);
    if (!result.ok) {
      const err = mapOtpError(result.reason); // { status, message }
      return res.status(err.status).json({ message: err.message });
    }

    const doc = result.doc;

    // 2) Load user for this token
    const ctx = await loadUserFromTokenDoc(doc);
    if (ctx.err) {
      return res.status(ctx.err.status).json({ message: ctx.err.message });
    }
    const { user } = ctx;

    // 3) Branch by purpose
    if (doc.purpose === "email_verify") {
      console.log(`[AUTH] Email verification for user: ${user.username}`);
      const out = await handleEmailVerify(user); // success -> { user, accessToken }
      if ("status" in out) {
        return res.status(out.status).json({ message: out.message });
      }
      return res.status(200).json({
        message: `${out.user.username} registered and logged in!`,
        data: {
          accessToken: out.accessToken,
          ...out.user,
        },
      });
    }

    if (doc.purpose === "email_change") {
      console.log(`[AUTH] Email change confirm for user: ${user.username}`);
      // IMPORTANT: handleEmailChange should re-check for collisions at confirm-time.
      const out = await handleEmailChange(user, doc); // success -> { id, username, email }
      if ("status" in out) {
        return res.status(out.status).json({ message: out.message });
      }
      return res.status(200).json({
        message: "Email updated successfully.",
        data: out, // { id, username, email }
      });
    }

    console.log("[AUTH] Invalid verification purpose");
    return res.status(400).json({ message: "Invalid verification request." });
  } catch (err: any) {
    console.error(`[AUTH] Confirmation error: ${err.message}`, err);
    return res.status(500).json({ message: "Internal error" });
  }
}

export async function getVerifyEmailStatus(req: Request, res: Response) {
  try {
    const selector = (req.query.selector as string | undefined)?.trim();
    if (!selector) {
      // don’t hint at existence
      return res.status(404).json({ message: "Not found" });
    }

    const doc = await WebAppAuthTokenModel.findOne({ selector }).lean();
    if (!doc || doc.purpose !== "email_verify") {
      return res.status(404).json({ message: "Not found" });
    }

    const now = Date.now();
    if (doc.usedAt) return res.status(404).json({ message: "Not found" });
    if (doc.expiresAt.getTime() <= now)
      return res.status(404).json({ message: "Not found" });
    if (
      typeof doc.attempts === "number" &&
      typeof doc.maxAttempts === "number" &&
      doc.attempts >= doc.maxAttempts
    ) {
      return res.status(404).json({ message: "Not found" });
    }

    const ttl = Math.max(0, Math.floor((doc.expiresAt.getTime() - now) / 1000));
    const attemptsRemaining =
      typeof doc.maxAttempts === "number" && typeof doc.attempts === "number"
        ? Math.max(0, doc.maxAttempts - doc.attempts)
        : undefined;

    return res.status(200).json({
      ok: true,
      data: { ttl, attemptsRemaining },
    });
  } catch (err: any) {
    console.error("[AUTH] verify-email status error:", err);
    // Keep it indistinguishable from not-found to reduce probing
    return res.status(404).json({ message: "Not found" });
  }
}

export async function getPasswordResetStatus(req: Request, res: Response) {
  console.log(
    "[AUTH] Checking password reset status for selector:",
    req.query.selector
  );

  try {
    const selector = (req.query.selector as string | undefined)?.trim();
    if (!selector) return res.status(404).json({ message: "Not found" });

    const doc = await WebAppAuthTokenModel.findOne({ selector }).lean();
    if (!doc || doc.purpose !== "password_reset") {
      console.log(
        "[AUTH] Password reset status: Token not found or wrong purpose"
      );
      return res.status(404).json({ message: "Not found" });
    }

    const now = Date.now();
    if (doc.usedAt) {
      console.log("[AUTH] Password reset status: Token already used");
      return res.status(404).json({ message: "Not found" });
    }
    if (doc.expiresAt.getTime() <= now) {
      console.log("[AUTH] Password reset status: Token expired");
      return res.status(404).json({ message: "Not found" });
    }

    const ttl = Math.max(0, Math.floor((doc.expiresAt.getTime() - now) / 1000));
    console.log("[AUTH] Password reset status: Token valid");
    return res.status(200).json({ ok: true, data: { ttl } });
  } catch (err) {
    // intentionally indistinguishable from 404 to avoid probing
    return res.status(404).json({ message: "Not found" });
  }
}
// POST body: { selector, validator, newPassword }
export async function completePasswordReset(req: Request, res: Response) {
  console.log("[AUTH] Completing password reset");
  try {
    const { selector, validator, newPassword } = req.body ?? {};
    if (!selector || !validator || !newPassword) {
      return res.status(400).json({ message: "Missing parameters" });
    }

    const errors = validatePassword(newPassword);
    if (errors.length > 0) {
      console.error("[AUTH] Password validation errors found:", errors);
      return res
        .status(400)
        .json({ message: "Password validation failed", errors });
    }

    const result = await validateAuthToken(selector, validator);
    if (!result.ok || result.doc.purpose !== "password_reset") {
      console.log(
        "[AUTH] Invalid password reset token:",
        JSON.stringify(result)
      );
      return res.status(400).json({ message: "Invalid or expired reset link" });
    }

    const userId = result.doc.userId.toString();
    const user = await _findUserById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    console.log("[AUTH] Validated password reset request for user:", user.id);

    // Hash & set password
    const hashed = bcrypt.hashSync(newPassword, bcrypt.genSaltSync(10));
    user.password = hashed;
    await user.save();

    console.log(
      "[AUTH] Successfully completed password reset for user:",
      user.id
    );

    // One-time: consume token so it can't be reused
    await consumeAuthToken(selector);
    console.log("[AUTH] Consumed password reset token for user:", user.id);

    // TODO: Invalidate all active sessions/refresh tokens for this user
    // await revokeAllUserSessions(user.id);

    // TODO: send a security notification email
    // await sendSecurityPasswordChangedEmail(user.email, user.username);

    return res
      .status(200)
      .json({ message: "Password updated. You can sign in now." });
  } catch (err: any) {
    console.error("[AUTH] complete reset error:", err);
    return res.status(500).json({ message: "Internal error" });
  }
}

// Body: { selector: string }
export async function resendConfirmation(req: CustomRequest, res: Response) {
  console.log("[AUTH] Resending confirmation link");
  try {
    const { selector } = req.body ?? {};
    if (!selector || typeof selector !== "string") {
      return res.status(400).json({ message: "Missing selector" });
    }

    const ctx = await loadTokenAndUser(selector);
    if (!ctx) {
      return res
        .status(404)
        .json({ message: "Verification expired, please request again." });
    }

    // check is current token is already used
    if (ctx.token.usedAt) {
      console.log("[RESEND] Token already used");
      return {
        status: 400,
        body: {
          message:
            "Token already used, unable to send new email. Please try again later",
        },
      };
    }

    // check if current token is expired (defensive, expired token should auto remove itself from db
    if (ctx.token.expiresAt.getTime() <= Date.now()) {
      console.log("[RESEND] Token already expired");
      return {
        status: 410,
        body: {
          message:
            "Token expired, unable to send new email. Please try again later.",
        },
      };
    }

    if (ctx.token.purpose === "email_verify") {
      console.log("[AUTH] Resending email verification");
      const { status, body } = await resendForEmailVerify(ctx);
      return res.status(status).json(body);
    }

    if (ctx.token.purpose === "email_change") {
      console.log("[AUTH] Resending email change confirmation");
      const { status, body } = await resendForEmailChange(ctx);
      return res.status(status).json(body);
    }

    return res
      .status(400)
      .json({ message: "Unsupported confirmation purpose" });
  } catch (error: any) {
    console.error(`[AUTH] Resend confirmation error: ${error.message}`, error);
    return res.status(500).json({ message: "Internal error" });
  }
}
