"use server";

import { getSession } from "./session-definitions";

const USER_SVC_URL = process.env.USER_SVC_URL || "http://localhost:7301";

// services/user/sign-up-actions.ts
export type SignUpState = {
  ok: boolean;
  redirect?: string;
  fieldErrors: {
    name?: string | string[];
    honorific?: string | string[];
    email?: string | string[];
    username?: string | string[];
    password?: string | string[];
    confirmPassword?: string | string[];
  };
  values: {
    name: string;
    honorific: string; // empty string = none
    email: string;
    username: string;
    password: string;
    confirmPassword: string;
  };
  error?: string;
  message?: string;
};

/**
 * SIGN UP
 * - Calls backend to create temp user + issue OTP.
 * - Redirects to confirm page WITH selector (sessionless).
 */
export async function signUpAction(
  prev: SignUpState,
  formData: FormData
): Promise<SignUpState> {
  const name = (formData.get("name") as string | null)?.trim() ?? "";
  const honorific = (formData.get("honorific") as string | null)?.trim() ?? ""; // optional
  const email = (formData.get("email") as string | null)?.trim() ?? "";
  const username = (formData.get("username") as string | null)?.trim() ?? "";
  const password = (formData.get("password") as string | null) ?? "";
  const confirmPassword =
    (formData.get("confirmPassword") as string | null) ?? "";

  const next: SignUpState = {
    ok: false,
    fieldErrors: {},
    values: { name, honorific, email, username, password, confirmPassword },
  };

  // Minimal client-side checks (server still validates in depth)
  if (!name) next.fieldErrors.name = "Name is required";
  if (!email) next.fieldErrors.email = "Email is required";
  if (!username) next.fieldErrors.username = "Username is required";
  if (!password) next.fieldErrors.password = "Password is required";
  if (!confirmPassword) {
    next.fieldErrors.confirmPassword = "Please confirm password";
  } else if (confirmPassword !== password) {
    next.fieldErrors.confirmPassword = "Passwords do not match";
  }
  if (Object.keys(next.fieldErrors).length > 0) return next;

  try {
    const response = await fetch(`${USER_SVC_URL}/teacher/users`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({
        name,
        honorific: honorific || undefined, // send empty as undefined
        email,
        username,
        password,
      }),
    });

    const payload = await response.json().catch(() => ({} as any));

    if (!response.ok) {
      // Backend returns { message, errors?: Record<string,string[]> }
      return {
        ...next,
        error: payload?.message ?? "Sign up failed.",
        fieldErrors: payload?.errors ?? next.fieldErrors,
      };
    }

    const selector: string | undefined = payload?.data?.selector;
    if (!selector) {
      return { ...next, error: "Unexpected server response." };
    }

    return {
      ...next,
      message:
        "Sign up request is successful, please check your email for the verification code.",
      ok: true,
      redirect: `/auth/sign-up/confirm-email?selector=${encodeURIComponent(
        selector
      )}`,
    };
  } catch (err) {
    console.error("Sign-up error:", err);
    return { ...next, error: "An unexpected error occurred." };
  }
}
/**
 * CONFIRM EMAIL (OTP)
 * - Submits { selector, code } to backend.
 * - On success, creates the logged-in session and redirects "/".
 */
export async function confirmEmail(
  code: string,
  selector: string
): Promise<{
  error?: string;
  message?: string;
  ok: boolean;
  redirect?: string;
}> {
  if (!selector || !code) {
    return { ok: false, error: "Missing verification parameters." };
  }

  const response = await fetch(`${USER_SVC_URL}/teacher/auth/verify-email`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ selector, code }),
    cache: "no-store",
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    return {
      ok: false,
      error: errorData.message ?? "Invalid or expired verification code.",
    };
  }

  const res = await response.json();

  // Create logged-in session
  const session = await getSession();
  session.userId = res.data.id;
  session.username = res.data.username;
  session.email = res.data.email;
  session.isAdmin = res.data.isAdmin;
  session.isLoggedIn = true;
  session.accessToken = res.data.accessToken;
  session.name = res.data.name;
  session.honorific = res.data.honorific || "";
  await session.save();

  // Return OK and redirect to home page
  return {
    message: "Email has been verified! Please hold on while we sign you in",
    ok: true,
    redirect: "/",
  };
}

/**
 * RESEND CODE
 * - Calls backend with current selector.
 * - Backend invalidates old OTP, issues a NEW selector.
 * - Return new selector so the client can update the URL (router.replace).
 */
export async function resendCode(selector: string): Promise<{
  error?: string;
  ok: boolean;
  selector?: string;
  ttl?: number;
  cooldownSeconds?: number;
}> {
  if (!selector) return { ok: false, error: "Missing selector." };

  const response = await fetch(
    `${USER_SVC_URL}/teacher/auth/verify-email/resend`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ selector }),
      cache: "no-store",
    }
  );

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    return { ok: false, error: errorData.message ?? "Could not resend code." };
  }

  const res = await response.json();
  const newSelector: string | undefined = res?.data?.selector;
  const ttl: number | undefined = res?.data?.ttl;
  const cooldownSeconds: number | undefined = res?.data?.cooldownSeconds;

  if (!newSelector) {
    return { ok: false, error: "Unexpected server response." };
  }

  return { ok: true, selector: newSelector, ttl, cooldownSeconds };
}

export async function checkValidSelector(selector: string): Promise<boolean> {
  if (!selector) return false;

  try {
    const response = await fetch(
      `${USER_SVC_URL}/teacher/auth/verify-email/status?selector=${encodeURIComponent(
        selector
      )}`,
      { cache: "no-store" }
    );

    if (response.ok) {
      // This get endpoint also returns ttl and attemptsRemaining (for future use if needed)
      // const res = await response.json();
      // const { ttl, attemptsRemaining } = res?.data ?? {};

      return true;
    }

    return false;
  } catch (error) {
    console.error("Error checking selector validity:", error);
    return false;
  }
}
