import bcrypt from "bcrypt";
import {
  createTempUser as _createTempUser,
  deleteUserById as _deleteUserById,
  findAllUsers as _findAllUsers,
  findUserByEmail as _findUserByEmail,
  findUserById as _findUserById,
  findUserByUsername as _findUserByUsername,
  findUserByUsernameOrEmail as _findUserByUsernameOrEmail,
  updateUserById as _updateUserById,
  confirmUserById as _confirmUserById,
  updateUserPrivilegeById as _updateUserPrivilegeById,
  updateUserAccountCreationTime as _updateUserAccountCreationTime,
} from "../model/teacher-user-repository";
import {
  sendVerificationEmail,
  sendVerificationEmailForEmailChange,
} from "../utils/mail";
import { Response } from "express";
import { CustomRequest } from "../middleware/access-control";
import { isValidEmail, validateUserData } from "../utils/validators";
import { formatUserResponse } from "../utils/formats";
import { issueOtpToken } from "../utils/otp";
import { UpdateField, updateHandlers } from "./helpers/update-user-helpers";
import {
  EMAIL_CHANGE_TTL_SECONDS,
  RESEND_THROTTLE_SECONDS,
  VERIFY_TTL_SECONDS,
} from "./helpers/email-resend-helpers";
import { TeacherAuthTokenModel } from "../model/teacher-auth-token-model";

/**
 * @route   POST /teacher/users
 * @auth    Public
 * @input   Body: { name, honorific, username, email, password }
 * @notes   - Creates a temporary unverified teacher account with an automatic expiry.
 *          - Issues a 6-digit OTP (selector + code) for email verification and emails the code.
 *          - Returns only the selector and TTL; the OTP code is sent via email.
 *          - Enforces unique email and username.
 * @logic   1) Validate all user fields
 *          2) Reject if email or username already exists
 *          3) Hash password and create temp user (unverified) with expiry
 *          4) Issue OTP (purpose=email_verify) and email the code
 *          5) Return selector + TTL to client
 * @returns 201 { message, data: { selector, ttl } }
 * @errors  400 validation errors
 *          409 email/username already exists
 *          500 unknown error
 */
export async function createUserRequest(req: CustomRequest, res: Response) {
  const { name, honorific, username, email, password } = req.body;
  console.log(
    `[USER] New user registration attempt - Username: ${username}, Email: ${email}`
  );

  try {
    // 1) Validate input
    const errors = validateUserData(req.body);
    if (errors && Object.values(errors).some((arr) => arr.length > 0)) {
      console.log(
        `[USER] Registration validation failed - ${JSON.stringify(errors)}`
      );
      return res
        .status(400)
        .json({ message: "Errors in one or more fields", errors });
    }

    // 2) Prevent duplicate accounts
    const existingUserEmail = await _findUserByEmail(email);
    if (existingUserEmail) {
      console.log(
        `[USER] Registration failed - Email already exists - Email: ${email}`
      );
      return res.status(409).json({ message: "Email already exists." });
    }

    const existingUsername = await _findUserByUsername(username);
    if (existingUsername) {
      console.log(
        `[USER] Registration failed - Username already exists - Username: ${username}`
      );
      return res.status(409).json({ message: "Username already exists." });
    }

    // 3) Hash password
    const hashedPassword = bcrypt.hashSync(password, bcrypt.genSaltSync(10));

    // 4) Create temp (unverified) user with TTL cleanup
    const accountExpiry = new Date(Date.now() + VERIFY_TTL_SECONDS * 1000);
    const createdUser = await _createTempUser(
      name,
      honorific,
      username,
      email,
      hashedPassword,
      /* isVerified */ false,
      /* expireAt  */ accountExpiry
    );

    // 5) Issue OTP (selector + hashed 6-digit code in DB)
    const { selector, code, expiresAt } = await issueOtpToken({
      userId: createdUser._id,
      purpose: "email_verify",
      ttlSeconds: VERIFY_TTL_SECONDS,
    });

    // 6) Email the OTP code (frontend will keep selector and ask user for the code)
    await sendVerificationEmail(email, username, code);

    console.log(
      `[USER] Temp user created & verification OTP sent - ID: ${createdUser.id}, Username: ${username}`
    );

    // 7) Return public selector + ttl for the client to complete verification with {selector, code}
    return res.status(201).json({
      message: `Created new user ${username} request successfully. Check your email for the verification code.`,
      data: {
        selector,
        ttl: Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000)),
      },
    });
  } catch (error: any) {
    console.error(`[USER] Registration error - ${error.message}`, error);
    return res
      .status(500)
      .json({ message: "Unknown error occurred when creating a new user!" });
  }
}

/**
 * @route   DELETE /teacher/users/:email
 * @auth    Public (testing-only path)
 * @input   Params: { email }
 * @notes   - For test cleanups only: hard-deletes a TEMP (unverified) user by email.
 *          - Fails if user does not exist or is already verified.
 * @logic   1) Validate email
 *          2) Load user by email
 *          3) Reject if verified; else delete temp user
 * @returns 200 { message }
 * @errors  403 illegal when account is verified
 *          404 invalid email / not found
 *          500 unknown error
 */
export async function deleteCreateUserRequest(
  req: CustomRequest,
  res: Response
) {
  try {
    const email = req.params.email;

    if (!isValidEmail(email)) {
      res.status(404).json({ message: `${email} is not a valid email` });
      return;
    }

    const user = await _findUserByEmail(email);
    if (!user) {
      res.status(404).json({ message: `User with email: ${email} not found` });
      return;
    } else if (user.isVerified) {
      res.status(403).json({ message: `This operation is illegal` });
      return;
    }
    await _deleteUserById(user.id);
    res.status(200).json({
      message: `Deleted user account creation request of email: ${email} successfully`,
    });
    return;
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Unknown error when deleting user!" });
    return;
  }
}

/**
 * @route   GET /teacher/users/:id
 * @auth    verifyIsOwnerOrAdmin
 * @input   Params: { id }
 * @notes   - Returns a single teacher profile formatted for clients.
 * @logic   1) Load user by id
 *          2) Return formatted profile
 * @returns 200 { message, data: User }
 * @errors  404 user not found
 *          500 unknown error
 */
export async function getUser(req: CustomRequest, res: Response) {
  try {
    const userId = req.params.id;

    const user = await _findUserById(userId);
    if (!user) {
      res.status(404).json({ message: `User ${userId} not found` });
      return;
    } else {
      res
        .status(200)
        .json({ message: `Found user`, data: formatUserResponse(user) });
      return;
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Unknown error when getting user!" });
    return;
  }
}

/**
 * @route   GET /teacher/users
 * @auth    verifyIsAdmin
 * @input   None
 * @notes   - Admin-only listing of all teacher users.
 * @logic   1) Fetch all users
 *          2) Map to client-safe shape
 * @returns 200 { message, data: User[] }
 * @errors  500 unknown error
 */
export async function getAllUsers(req: CustomRequest, res: Response) {
  try {
    const users = await _findAllUsers();

    res
      .status(200)
      .json({ message: `Found users`, data: users.map(formatUserResponse) });
    return;
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Unknown error when getting all users!" });
    return;
  }
}

/**
 * @route   PATCH /teacher/users/me
 * @auth    verifyTeacherAccessToken
 * @input   Body: ONE of { name?, honorific?, password? } (exactly one field)
 * @notes   - Only one field can be updated per request.
 *          - Validates data per field:
 *              • name/honorific string rules
 *              • password strength policy (bcrypt stored)
 *          - Uses field-specific handlers; echoes updated profile (never echo password).
 * @logic   1) Require authenticated teacher
 *          2) Accept exactly one field to update
 *          3) Run field-specific validation and update
 *          4) Return updated profile
 * @returns 200 { message, data: User }
 * @errors  400 no field provided / multiple fields provided / validation errors
 *          401 auth missing
 *          500 unknown error
 */
export async function updateUser(req: CustomRequest, res: Response) {
  const userId = req.user?.id;
  if (!userId)
    return res.status(401).json({ message: "Authentication failed" });
  console.log(`[USER] Update request - ID: ${userId}`);
  const { name, honorific, password } = (req.body ?? {}) as {
    name?: string;
    honorific?: string;
    password?: string;
  };

  // Collect provided (non-empty) values
  const candidates: Record<UpdateField, string | undefined> = {
    password,
    name,
    honorific,
  };

  // Filter out undefined values
  const providedKeys = (Object.keys(candidates) as UpdateField[]).filter(
    (k) => typeof candidates[k] === "string" && candidates[k]!.length > 0
  );

  if (providedKeys.length === 0) {
    console.log(`[USER] Update failed: No field to update - ID: ${userId}`);
    return res.status(400).json({ message: "No field to update" });
  }

  if (providedKeys.length > 1) {
    console.log(
      `[USER] Update failed: Multiple fields provided - ID: ${userId}`
    );
    return res
      .status(400)
      .json({ message: "Only one field can be updated at a time" });
  }

  const field = providedKeys[0];
  const handler = updateHandlers[field];

  try {
    const raw = candidates[field]!;
    const result = await handler(
      userId,
      field === "password" ? raw : raw.trim()
    );

    if (!result.ok) {
      if (result.log) console.log(`[USER] Update failed - ${result.log}`);
      // Expecting result.body = { message: string, errors?: Record<string, string[]> }
      return res.status(result.status).json(result.body);
    }

    console.log(`[USER] ${result.log}`);

    // echo the updated field (never echo password)
    const data = formatUserResponse(result.user);

    return res.status(200).json({
      message: `Updated ${field}`,
      data,
    });
  } catch (err: any) {
    console.error(`[USER] Update error - ${err.message}`, err);
    return res
      .status(500)
      .json({ message: "Unknown error when updating user!" });
  }
}

/**
 * @route   DELETE /teacher/users/:id
 * @auth    verifyIsOwnerOrAdmin
 * @input   Params: { id }
 * @notes   - Permanently deletes a teacher user.
 * @logic   1) Load user by id
 *          2) Delete if found
 * @returns 200 { message }
 * @errors  404 user not found
 *          500 unknown error
 */
export async function deleteUser(req: CustomRequest, res: Response) {
  const userId = req.params.id;
  console.log(`[USER] Delete request - ID: ${userId}`);

  try {
    const user = await _findUserById(userId);
    if (!user) {
      console.log(`[USER] Delete failed - User not found - ID: ${userId}`);
      res.status(404).json({ message: `User ${userId} not found` });
      return;
    }

    await _deleteUserById(userId);
    console.log(`[USER] User deleted successfully - ID: ${userId}`);
    res.status(200).json({ message: `Deleted user ${userId} successfully` });
    return;
  } catch (err: any) {
    console.error(`[USER] Delete error - ${err.message}`, err);
    res.status(500).json({ message: "Unknown error when deleting user!" });
    return;
  }
}

/**
 * EMAIL RELATED CONTROLLERS
 */

/**
 * @route   POST /teacher/users/me/email-change/request
 * @auth    verifyTeacherAccessToken
 * @input   Body: { email: string }
 * @notes   - Begins an email change flow using OTP (selector + 6-digit code).
 *          - Enforces cooldown between requests to deter spamming.
 *          - Stores target email in token meta; OTP is sent to the NEW email.
 *          - Returns only selector + ttl; the code is sent via email.
 * @logic   1) AuthN + validate new email format
 *          2) Disallow no-op and collisions
 *          3) Enforce resend throttle if a recent valid token exists
 *          4) Issue OTP (purpose=email_change, meta.newEmail)
 *          5) Email OTP to new address and return selector + ttl + cooldownSeconds
 * @returns 201 { message, data: { selector, ttl, cooldownSeconds } }
 * @errors  400 missing/invalid email / same as current email
 *          409 email already in use
 *          429 resend throttled
 *          401 unauthorized
 *          404 user not found
 *          500 unknown error
 */
export async function updateEmailRequest(req: CustomRequest, res: Response) {
  try {
    const userId = req.user?.id;
    const newEmail = String(req.body?.email ?? "")
      .trim()
      .toLowerCase();

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    if (!newEmail) {
      return res.status(400).json({
        message: "Email is required",
        errors: { email: ["Email is required"] },
      });
    }
    if (!isValidEmail(newEmail)) {
      return res.status(400).json({
        message: "Email is not valid",
        errors: { email: ["Email is not valid"] },
      });
    }

    // Load current user
    const user = await _findUserById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Disallow no-op or collisions
    if (user.email?.toLowerCase() === newEmail) {
      return res.status(400).json({
        message: "New email is the same as current email",
        errors: { email: ["New email is the same as current email"] },
      });
    }

    const taken = await _findUserByEmail(newEmail);
    if (taken) {
      return res.status(409).json({
        message: "Email is already in use",
        errors: { email: ["Email is already in use"] },
      });
    }

    // Check if an email change token already exists and is less than one minute old
    const now = new Date();
    const priorToken = await TeacherAuthTokenModel.findOne({
      userId: user._id,
      purpose: "email_change",
      usedAt: null,
      expiresAt: { $gt: now },
    })
      .sort({ createdAt: -1 })
      .lean();

    if (priorToken) {
      const timeSinceLast = Math.floor(
        (Date.now() - priorToken.createdAt.getTime()) / 1000
      );
      if (timeSinceLast < RESEND_THROTTLE_SECONDS) {
        console.log(
          `[AUTH] Email change: prior code issued less than a minute ago for ${user.email}, no new link sent.`
        );
        console.log(
          `[AUTH] Email change: ${timeSinceLast} seconds since last code was sent`
        );
        return res.status(429).json({
          message: "Please wait before requesting a new email change code.",
        });
      }
    }

    // Store target email in meta so confirm endpoint can apply it.
    const { selector, code, expiresAt } = await issueOtpToken({
      userId: String(user.id ?? user._id), // ensure string
      purpose: "email_change",
      ttlSeconds: EMAIL_CHANGE_TTL_SECONDS,
      meta: { newEmail },
    });

    // Send the OTP to the *new* email address
    await sendVerificationEmailForEmailChange(newEmail, user.username, code);

    console.log(
      `[AUTH] Email change OTP issued for userId=${userId} → ${newEmail}`
    );

    // Return only selector + ttl (never the code)
    return res.status(201).json({
      message: "A verification code has been sent to the new address.",
      data: {
        selector,
        ttl: Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000)),
        cooldownSeconds: RESEND_THROTTLE_SECONDS,
      },
    });
  } catch (error: any) {
    console.error(`[AUTH] Email change request error: ${error.message}`, error);
    return res.status(500).json({
      message: "Unknown error occurred when creating an email change request",
    });
  }
}
