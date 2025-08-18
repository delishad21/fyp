"use server";

import { redirect } from "next/navigation";

export type SignUpState = {
  fieldErrors: { email?: string; password?: string; confirmPassword?: string };
  values: { email: string; password: string; confirmPassword: string };
  message?: string;
};

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function signUpAction(
  prev: SignUpState,
  formData: FormData
): Promise<SignUpState> {
  const email = (formData.get("email") as string | null)?.trim() ?? "";
  const password = (formData.get("password") as string | null) ?? "";
  const confirmPassword =
    (formData.get("confirmPassword") as string | null) ?? "";

  const next: SignUpState = {
    fieldErrors: {},
    values: { email, password, confirmPassword },
  };

  if (!email) next.fieldErrors.email = "Email is required";
  else if (!emailRegex.test(email))
    next.fieldErrors.email = "Enter a valid email";

  if (!password) next.fieldErrors.password = "Password is required";
  else if (password.length < 8)
    next.fieldErrors.password = "At least 8 characters";

  if (!confirmPassword)
    next.fieldErrors.confirmPassword = "Please confirm password";
  else if (password !== confirmPassword)
    next.fieldErrors.confirmPassword = "Passwords do not match";

  if (
    next.fieldErrors.email ||
    next.fieldErrors.password ||
    next.fieldErrors.confirmPassword
  ) {
    return next; // stays on the page with values preserved
  }

  // success -> set cookie/session then redirect
  redirect("/");
}
