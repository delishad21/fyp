import jwt from "jsonwebtoken";
import type { TeacherAuthToken } from "../../model/teacher-auth-token-model";
import {
  findUserById as _findUserById,
  findUserByEmail as _findUserByEmail,
} from "../../model/teacher-user-repository";
import { formatUserResponse } from "../../utils/formats";

// ---- Types ----

// types.ts
export type EmailVerifyOk = {
  accessToken: string;
  user: any;
};

export type EmailChangeOk = {
  id: string;
  username: string;
  email: string;
};

export type ConfirmErr = { status: number; message: string };

// ---- Small helpers ----

export async function loadUserFromTokenDoc(doc: TeacherAuthToken) {
  const user = await _findUserById(doc.userId.toString());
  if (!user) {
    return { err: <ConfirmErr>{ status: 404, message: "User not found" } };
  }
  return { user };
}

/**
 * Handle purpose === "email_verify"
 * - If already verified, return a failure
 * - Issues access token (as per your existing behavior)
 */
export async function handleEmailVerify(
  user: any
): Promise<EmailVerifyOk | ConfirmErr> {
  if (!user.isVerified) {
    user.isVerified = true;
    user.expireAt = null;
    await user.save();

    const accessToken = jwt.sign({ id: user.id }, process.env.JWT_SECRET!, {
      expiresIn: "30d",
    });

    console.log(
      `[AUTH] Email verification successful for user: ${user.username}`
    );
    return {
      accessToken,
      user: formatUserResponse(user),
    };
  }

  return { status: 400, message: "Email verification failed" };
}

/**
 * Handle purpose === "email_change"
 * - Reads newEmail from token.meta.newEmail
 * - Idempotent: if already equals newEmail, returns success
 * - Collision checks
 */
export async function handleEmailChange(
  user: any,
  doc: TeacherAuthToken
): Promise<EmailChangeOk | ConfirmErr> {
  const newEmail = String(doc.meta?.newEmail ?? "")
    .trim()
    .toLowerCase();
  if (!newEmail)
    return { status: 400, message: "Invalid email change request." };

  if (user.email.toLowerCase() !== newEmail) {
    const taken = await _findUserByEmail(newEmail);
    if (taken && taken.id !== user.id) {
      return { status: 409, message: "Email is already in use" };
    }
    user.email = newEmail;
    await user.save();
  }

  return { id: user.id, username: user.username, email: user.email };
}
