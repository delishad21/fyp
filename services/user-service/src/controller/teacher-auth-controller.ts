import bcrypt from "bcrypt";
import { Request, Response } from "express";
import {
  findUserByEmail as _findUserByEmail,
  findUserByUsername as _findUserByUsername,
  confirmUserById as _confirmUserById,
  findUserById as _findUserById,
} from "../model/teacher-user-repository";
import { formatUserResponse } from "../utils/formats";
import { CustomRequest } from "../middleware/access-control";
import { sendPasswordResetLink } from "../utils/mail";
import { isValidEmail, validatePassword } from "../utils/validators";
import {
  consumeAuthToken,
  generateAccessToken,
  issueAuthToken,
  validateAuthToken,
} from "../utils/tokens";
import { mapOtpError, verifyOtpAndMaybeConsume } from "../utils/otp";
import { TeacherAuthTokenModel } from "../model/teacher-auth-token-model";
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
import {
  RESET_COOLDOWN_SECONDS,
  RESET_TTL_SECONDS,
} from "../utils/teacher-auth-utils";
import { ensureQuizMetaSeeded } from "../utils/quiz-meta-bootstrap";

/**
 * @route   POST /teacher/auth/sign-in
 * @auth    Public
 * @input   Body: { identifier: string (username or email), password: string }
 * @notes   - Accepts either username or email as the identifier.
 *          - Uniform error message for bad credentials to avoid enumeration.
 *          - Blocks unverified accounts; if a still-valid verification token exists,
 *            returns 403 with its `selector` so the client can route to the verify page.
 *          - Issues a teacher-scoped access token on success.
 * @logic   1) Validate presence of identifier/password
 *          2) Look up user by email or username
 *          3) Compare password with bcrypt
 *          4) If not verified → 403 and, when available, return latest verification `selector`
 *          5) Generate JWT access token and return formatted profile
 * @returns 200 { message, data: { accessToken, ...user } }
 * @errors  400 missing credentials
 *          401 wrong username/email and/or password
 *          403 unverified account (optional selector returned)
 *          500 unknown error during login
 */
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
      const token = await TeacherAuthTokenModel.findOne({
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

    try {
      await ensureQuizMetaSeeded(user.id);
    } catch (seedErr: any) {
      console.error(
        `[AUTH] Quiz meta bootstrap failed during sign-in for ${user.id}:`,
        seedErr?.message || seedErr
      );
    }

    console.log(`[AUTH] Login successful: ${user.username} (${user.id})`);
    // Generate JWT access token
    const accessToken = generateAccessToken(user.id, "teacher");

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

/**
 * @route   POST /teacher/auth/forget-password
 * @auth    Public
 * @input   Body: { email: string }
 * @notes   - Always responds generically to avoid leaking whether the email exists.
 *          - Enforces a short cooldown between reset link issuances.
 *          - Issues a one-time password reset token and emails a link containing selector+validator.
 * @logic   1) Validate presence of email
 *          2) Look up user by email (if not found, return generic 200)
 *          3) Respect cooldown if a recent token exists
 *          4) Invalidate prior tokens; issue a new reset token (TTL = 10 minutes)
 *          5) Email the password reset link
 * @returns 200 { message, cooldownSeconds }
 * @errors  400 missing email
 *          500 unknown error during request
 */
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
    const priorToken = await TeacherAuthTokenModel.findOne({
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

/**
 * @route   POST /teacher/auth/verify-password
 * @auth    verifyTeacherAccessToken (role: teacher)
 * @input   Body: { password: string }
 * @notes   - Lightweight password re-check for sensitive operations.
 *          - Uses the username from the access token context.
 * @logic   1) Ensure user context exists from token
 *          2) Load user by username
 *          3) Compare submitted password with stored hash
 * @returns 200 { message: "Password verified!" }
 * @errors  401 user not found / wrong password
 *          403 forbidden when token role missing/invalid
 *          500 internal server error
 */
export async function verifyPassword(req: CustomRequest, res: Response) {
  try {
    if (!req.user) {
      console.log("[AUTH] Password verification failed: Missing user context");
      res.status(500).json({ message: "Missing user context" });
      return;
    }
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

/**
 * @route   PATCH /teacher/auth/verify-email
 * @auth    Public
 * @input   Body: { selector: string, code: string }  // code may contain spaces/dashes
 * @notes   - Confirms either account verification or email-change, depending on token purpose.
 *          - OTP attempts tracked; consumes (invalidates) on success.
 *          - On account verification success, returns access token + profile for immediate login.
 * @logic   1) Validate selector/code presence; normalize code
 *          2) Verify OTP against token (consume on success)
 *          3) Load user associated to token
 *          4) If purpose === "email_verify": verify user and issue access token
 *             If purpose === "email_change": finalize email update
 * @returns 200 { message, data }  // data varies by purpose (token+user on verify; new email on change)
 * @errors  400 missing/invalid parameters or unsupported purpose
 *          401/403 OTP failure (mapped via mapOtpError)
 *          404 user or token context not found
 *          500 internal error
 */
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

      try {
        await ensureQuizMetaSeeded(out.user.id);
      } catch (seedErr: any) {
        console.error(
          `[AUTH] Quiz meta bootstrap failed during email verify for ${out.user.id}:`,
          seedErr?.message || seedErr
        );
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

/**
 * @route   GET /teacher/auth/verify-email/status
 * @auth    Public
 * @input   Query: { selector: string }
 * @notes   - Returns TTL and attempts remaining for an active email verification token.
 *          - Intentionally indistinguishable 404 for invalid/expired/used tokens to reduce probing.
 * @logic   1) Validate selector
 *          2) Load token and ensure purpose === "email_verify"
 *          3) Ensure token is unused, unexpired, and under attempt limit
 * @returns 200 { ok: true, data: { ttl: number, attemptsRemaining?: number } }
 * @errors  404 not found (invalid/expired/used/limit hit)
 */
export async function getVerifyEmailStatus(req: Request, res: Response) {
  try {
    const selector = (req.query.selector as string | undefined)?.trim();
    if (!selector) {
      // don’t hint at existence
      return res.status(404).json({ message: "Not found" });
    }

    const doc = await TeacherAuthTokenModel.findOne({ selector }).lean();
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

/**
 * @route   GET /teacher/auth/forget-password/status
 * @auth    Public
 * @input   Query: { selector: string }
 * @notes   - Returns TTL for an active password reset token.
 *          - Responds with 404 for invalid/expired/used tokens (no probing).
 * @logic   1) Validate selector
 *          2) Load token and ensure purpose === "password_reset"
 *          3) Ensure token is valid and unused
 * @returns 200 { ok: true, data: { ttl } }
 * @errors  404 not found (invalid/expired/used)
 */
export async function getPasswordResetStatus(req: Request, res: Response) {
  console.log(
    "[AUTH] Checking password reset status for selector:",
    req.query.selector
  );

  try {
    const selector = (req.query.selector as string | undefined)?.trim();
    if (!selector) return res.status(404).json({ message: "Not found" });

    const doc = await TeacherAuthTokenModel.findOne({ selector }).lean();
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

/**
 * @route   POST /teacher/auth/forget-password/reset
 * @auth    Public
 * @input   Body: { selector: string, validator: string, newPassword: string }
 * @notes   - Validates password policy before attempting token validation.
 *          - Validates and consumes the reset token on success.
 *          - Updates user password (bcrypt) and encourages session revocation downstream.
 * @logic   1) Validate presence of selector/validator/newPassword
 *          2) Validate password strength
 *          3) Validate token (purpose=password_reset); load user
 *          4) Hash and save new password; consume token
 * @returns 200 { message: "Password updated. You can sign in now." }
 * @errors  400 missing parameters / password policy failed / invalid or expired link
 *          404 user not found
 *          500 internal error
 */
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

/**
 * @route   PATCH /teacher/auth/verify-email/resend
 * @alias   POST /teacher/auth/email-change/resend  (shares same handler)
 * @auth    Public
 * @input   Body: { selector: string }
 * @notes   - Re-sends the appropriate email based on token purpose:
 *              - email_verify → verification email
 *              - email_change → confirm-change email
 *          - Rejects used or expired tokens; does not reveal token details.
 * @logic   1) Validate selector and load token+user context
 *          2) Guard against used/expired tokens
 *          3) Branch by purpose to re-send the appropriate email
 * @returns 200 { ... }  // Handler-specific success body
 * @errors  400 missing selector / unsupported purpose
 *          404 token not found/expired
 *          410 token expired (explicit branch when applicable)
 *          500 internal error
 */
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
      return res.status(400).json({
        message:
          "Token already used, unable to send new email. Please try again later",
      });
    }

    // check if current token is expired (defensive, expired token should auto remove itself from db
    if (ctx.token.expiresAt.getTime() <= Date.now()) {
      console.log("[RESEND] Token already expired");
      return res.status(410).json({
        message: "Token expired, unable to send new email. Please try again later.",
      });
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
