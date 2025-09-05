"use server";

import { getSession } from "@/services/user/session-definitions";
import { revalidatePath } from "next/cache";

const USER_SVC_URL = process.env.USER_SVC_URL || "http://localhost:7301";

type Ok<T> = { ok: true; data?: T; message?: string };
type Err = {
  ok: false;
  error: string;
  fieldErrors?: Record<string, string | string[]>;
};

async function callApi<T = any>(
  path: string,
  {
    method = "POST",
    body,
    auth = false,
  }: {
    method?: "POST" | "PATCH" | "PUT" | "DELETE";
    body?: any;
    auth?: boolean;
  } = {}
): Promise<Ok<T> | Err> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (auth) {
    const session = await getSession();
    const token = session?.accessToken;
    if (!token) return { ok: false, error: "Not authenticated" };
    headers.Authorization = `Bearer ${token}`;
  }

  try {
    const resp = await fetch(`${USER_SVC_URL}${path}`, {
      method,
      headers,
      cache: "no-store",
      body: body ? JSON.stringify(body) : undefined,
    });

    const json = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      return {
        ok: false,
        error: json?.message ?? "Request failed",
        fieldErrors: json?.errors ?? undefined,
      };
    }

    return { ok: true, data: json?.data, message: json?.message };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "Network error" };
  }
}

/**
 * Verify the user's current password (auth required)
 * Backend: POST /webapp/auth/verify-password  { password }
 */
export async function verifyPasswordAction(params: {
  password: string;
}): Promise<Ok<void> | Err> {
  const { password } = params;
  return callApi<void>("/webapp/auth/verify-password", {
    auth: true,
    body: { password },
  });
}

/**
 * Patch current user (auth required). Accepts exactly one field.
 * Backend: PATCH /webapp/user/me  { name? | honorific? | password? }
 */
type UpdatePatch = {
  name?: string;
  honorific?: string;
  password?: string;
};

type UserResponse = {
  id: string;
  name?: string;
  honorific?: string;
  username: string;
  email: string;
  isAdmin: boolean;
  isVerified: boolean;
  createdAt: string;
};

export async function updateMeAction(
  patch: UpdatePatch
): Promise<Ok<{ name?: string; honorific?: string }> | Err> {
  // Backend path per your controller: /webapp/users/me
  const resp = await callApi<UserResponse>("/webapp/users/me", {
    method: "PATCH",
    auth: true,
    body: patch,
  });

  if (!resp.ok) {
    // Pass through server error + fieldErrors (e.g., from your validators)
    return { ok: false, error: resp.error, fieldErrors: resp.fieldErrors };
  }

  const user = resp.data;
  if (!user) return { ok: false, error: "Internal server error" };

  // Update session with authoritative values from backend.
  // Note: backend does NOT return a new accessToken; keep existing one intact.
  const session = await getSession();
  session.email = user.email;
  session.name = user.name ?? session.name;
  session.honorific = user.honorific ?? session.honorific;
  await session.save();

  // Return only what the caller expects. For password updates, this will be {}.
  const out = { name: user.name, honorific: user.honorific };

  return { ok: true, data: out, message: resp.message };
}

/**
 * Thin wrappers (optional) to keep your UI calls unchanged.
 * Backend: PATCH /webapp/user/me  { name }
 */
export async function updateNameAction(params: {
  name: string;
}): Promise<Ok<{ name: string }> | Err> {
  return updateMeAction({ name: params.name }) as Promise<
    Ok<{ name: string }> | Err
  >;
}

/**
 * Backend: PATCH /webapp/user/me  { honorific }
 */
export async function updateHonorificAction(params: {
  honorific: string;
}): Promise<Ok<{ honorific: string }> | Err> {
  return updateMeAction({ honorific: params.honorific }) as Promise<
    Ok<{ honorific: string }> | Err
  >;
}

/**
 * Update user password (auth required)
 * Backend: PATCH /webapp/user/me  { password }
 * Returns: 200 { message: "Updated password" }
 */
export async function updatePasswordAction(params: {
  password: string;
  confirmPassword: string;
}): Promise<Ok<void> | Err> {
  const { password, confirmPassword } = params;

  const fieldErrors: Record<string, string | string[]> = {};
  if (!password) fieldErrors.password = "Password is required.";
  if (!confirmPassword)
    fieldErrors.confirmPassword = "Please confirm password.";
  if (password && confirmPassword && password !== confirmPassword) {
    fieldErrors.confirmPassword = "Passwords do not match.";
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, error: "Validation failed.", fieldErrors };
  }

  // Don't trim; let backend decide
  return updateMeAction({ password }) as Promise<Ok<void> | Err>;
}
/**
 * Request email change (sends OTP to NEW email) (auth required)
 * Backend: POST /webapp/users/me/email-change/request  { email }
 * Returns: { selector, ttl, cooldownSeconds }
 */
export async function requestEmailChangeAction(params: {
  email: string;
}): Promise<
  Ok<{ selector: string; ttl: number; cooldownSeconds: number }> | Err
> {
  const { email } = params;
  return callApi<{ selector: string; ttl: number; cooldownSeconds: number }>(
    "/webapp/users/me/email-change/request",
    {
      auth: true,
      body: { email },
    }
  );
}

/**
 * Confirm email change via OTP (no auth required — selector+code)
 * Backend: PATCH /webapp/auth/verify-email  { selector, code }
 * Returns: { id, username, email }
 */
export async function confirmEmailChangeAction(params: {
  selector: string;
  code: string;
}): Promise<Ok<{ id: string; username: string; email: string }> | Err> {
  const { selector, code } = params;

  const apiRes = await callApi<{ id: string; username: string; email: string }>(
    "/webapp/auth/verify-email",
    { method: "PATCH", auth: false, body: { selector, code } }
  );

  if (!apiRes.ok) return apiRes;

  // Update Iron Session with the new email
  const session = await getSession();
  if (apiRes.data) {
    session.email = apiRes.data?.email;
  }

  await session.save();
  revalidatePath("/settings");

  return apiRes;
}

/**
 * Resend email-change code (no auth required — selector)
 * Backend: POST /webapp/auth/email-change/resend  { selector }
 * Returns: { ttl }
 */
export async function resendEmailChangeCodeAction(params: {
  selector: string;
}): Promise<
  Ok<{ ttl: number; selector: string; cooldownSeconds: number }> | Err
> {
  const { selector } = params;
  const result = await callApi<{
    ttl: number;
    selector: string;
    cooldownSeconds: number;
  }>("/webapp/auth/email-change/resend", {
    auth: false,
    body: { selector },
  });

  return result;
}
