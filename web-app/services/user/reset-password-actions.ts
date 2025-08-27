"use server";

const USER_SVC_URL = process.env.USER_SVC_URL || "http://localhost:7301";

export type ResetPasswordState = {
  ok: boolean;
  redirect?: string;
  fieldErrors: {
    password?: string | string[];
    confirmPassword?: string | string[];
  };
  values: {
    password: string;
    confirmPassword: string;
  };
  error?: string;
  message?: string;
};

/**
 * Submit the password reset form.
 * Reads selector & validator from hidden fields in the form.
 */
export async function resetPasswordAction(
  prev: ResetPasswordState,
  formData: FormData
): Promise<ResetPasswordState> {
  const next: ResetPasswordState = {
    ok: false,
    fieldErrors: {},
    values: {
      password: String(formData.get("password") || ""),
      confirmPassword: String(formData.get("confirmPassword") || ""),
    },
  };

  const selector = String(formData.get("selector") || "");
  const validator = String(formData.get("validator") || "");

  if (!selector || !validator) {
    return { ...next, error: "Reset link is invalid or expired." };
  }

  // client-side equality check is nice UX; backend still enforces rules
  if (next.values.password !== next.values.confirmPassword) {
    next.fieldErrors.confirmPassword = "Passwords do not match";
    return next;
  }

  try {
    const response = await fetch(
      `${USER_SVC_URL}/webapp/auth/forget-password/reset`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          selector,
          validator,
          newPassword: next.values.password,
        }),
      }
    );

    if (!response.ok) {
      const res = await response.json();
      console.log(JSON.stringify(res));
      return {
        ...next,
        fieldErrors: { password: res.errors },
        error: res.message ?? "Password reset failed.",
      };
    }

    const res = await response.json();
    return {
      ...next,
      ok: true,
      message: res.message ?? "Password reset successfully.",
      redirect: "/auth/sign-in",
    };
  } catch (e) {
    console.error("Reset password error:", e);
    return { ...next, message: "An unexpected error occurred." };
  }
}

/**
 * Request a reset link by email (no session needed).
 * Always returns a generic message on success.
 */
export async function requestPasswordReset(
  email: string
): Promise<{ error?: string; message?: string; cooldownSeconds?: number }> {
  try {
    const resp = await fetch(`${USER_SVC_URL}/webapp/auth/forget-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({ email }),
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      return { error: err.message ?? "Request failed." };
    }

    const data = await resp.json();

    return {
      message:
        data.message || "If an account exists, a reset link has been sent.",
      cooldownSeconds: data.cooldownSeconds,
    };
  } catch {
    return {
      error: "Unable to request reset right now. Please try again later.",
    };
  }
}

export async function checkValidSelector(selector: string): Promise<boolean> {
  console.log("Checking selector:", selector);

  if (!selector) {
    return false;
  }

  try {
    const response = await fetch(
      `${USER_SVC_URL}/webapp/auth/forget-password/status?selector=${encodeURIComponent(
        selector
      )}`,
      { cache: "no-store" }
    );

    if (response.ok) {
      // endpoint returns ttl if needed
      // const res = await response.json();
      // const { ttl } = res.data || {};

      return true;
    }

    return false;
  } catch (err) {
    console.log("Error checking selector validity:", err);
    return false;
  }
}
