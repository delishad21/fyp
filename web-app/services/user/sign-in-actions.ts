"use server";

import { redirect } from "next/navigation";

export type SignInState = {
  fieldErrors: { email?: string; password?: string };
  values: { email: string; password: string };
  message?: string;
};

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function signInAction(
  prev: SignInState,
  formData: FormData
): Promise<SignInState> {
  const email = (formData.get("email") as string | null)?.trim() ?? "";
  const password = (formData.get("password") as string | null) ?? "";

  const next: SignInState = {
    fieldErrors: {},
    values: { email, password },
  };

  if (!email) next.fieldErrors.email = "Email is required";
  else if (!emailRegex.test(email))
    next.fieldErrors.email = "Enter a valid email";

  if (!password) next.fieldErrors.password = "Password is required";

  // If any field errors, stay on page and surface them
  if (next.fieldErrors.email || next.fieldErrors.password) {
    return next;
  }

  // TODO: authenticate user and set cookie/session here
  // cookies().set("session", "...", { httpOnly: true, path: "/" });

  redirect("/"); // or "/app"
}
