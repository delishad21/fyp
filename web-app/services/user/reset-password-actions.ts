"use server";

export type ResetPasswordState = {
  fieldErrors: {
    password?: string | string[];
    confirmPassword?: string | string[];
  };
  values: {
    password: string;
    confirmPassword: string;
  };
  message?: string;
};

/**
 * Placeholder reset password action.
 * In a real flow, you'd read a token from search params or cookies.
 */
export async function resetPasswordAction(
  prev: ResetPasswordState,
  formData: FormData
): Promise<ResetPasswordState> {
  // Simulate network
  await new Promise((r) => setTimeout(r, 500));

  const password = String(formData.get("password") || "");
  const confirmPassword = String(formData.get("confirmPassword") || "");

  const fieldErrors: ResetPasswordState["fieldErrors"] = {};

  // Basic password validation (adjust as needed)
  const errs: string[] = [];
  if (password.length < 8) errs.push("At least 8 characters.");
  if (!/[A-Z]/.test(password)) errs.push("At least one uppercase letter.");
  if (!/[a-z]/.test(password)) errs.push("At least one lowercase letter.");
  if (!/[0-9]/.test(password)) errs.push("At least one number.");
  if (!/[!@#$%^&*()_+\-=[\]{};':\"\\|,.<>/?]/.test(password)) {
    errs.push("At least one special character.");
  }
  if (errs.length) fieldErrors.password = errs;

  if (confirmPassword !== password) {
    fieldErrors.confirmPassword = "Passwords do not match.";
  }

  if (fieldErrors.password || fieldErrors.confirmPassword) {
    return {
      fieldErrors,
      values: { password, confirmPassword },
    };
  }

  // Pretend success
  return {
    fieldErrors: {},
    values: { password: "", confirmPassword: "" },
    message: "Password updated successfully. You can now sign in.",
  };
}
