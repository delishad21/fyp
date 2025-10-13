"use server";

import { redirect } from "next/navigation";
import { getSession } from "./session-definitions";

const USER_SVC_URL = process.env.USER_SVC_URL || "http://localhost:7301";

export type SignInState = {
  ok: boolean;
  redirect?: string;
  fieldErrors: { identifier?: string; password?: string };
  values: { identifier: string; password: string };
  error?: string;
  message?: string;
};

export async function signInAction(
  prev: SignInState,
  formData: FormData
): Promise<SignInState> {
  const identifier =
    (formData.get("identifier") as string | null)?.trim() ?? "";
  const password = (formData.get("password") as string | null) ?? "";

  const next: SignInState = {
    ok: false,
    fieldErrors: {},
    values: { identifier, password },
  };

  if (!identifier) next.fieldErrors.identifier = "Email/Username is required";
  if (!password) next.fieldErrors.password = "Password is required";

  // If any field errors, stay on page and surface them
  if (next.fieldErrors.identifier || next.fieldErrors.password) {
    return next;
  }

  try {
    // sign-in request to API
    const response = await fetch(`${USER_SVC_URL}/teacher/auth/sign-in`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ identifier, password }),
    });

    if (!response.ok) {
      const errorData = await response.json();

      // account for verification failure and redirect to verificaiton site
      if (response.status === 403) {
        const selector = errorData.data.selector;
        if (selector) {
          next.error = errorData.message;
          next.ok = true;
          next.redirect = `/auth/sign-up/confirm-email?selector=${encodeURIComponent(
            selector
          )}`;
          return next;
        }
      }

      next.error = errorData.message;
      return next;
    }

    // authentication success, set cookie/session
    const session = await getSession();
    const res = await response.json();

    // Set session data
    session.userId = res.data.id; // Get user ID from the response
    session.username = res.data.username; // Get username from the response
    session.email = res.data.email;
    session.isLoggedIn = true;
    session.accessToken = res.data.accessToken; // Store the access token in the session
    session.isAdmin = res.data.isAdmin; // Check if the user is an admin
    session.name = res.data.name;
    session.honorific = res.data.honorific || "";
    await session.save();

    // Return OK
    return {
      ...next,
      message: "Sign in successful!",
      ok: true,
      redirect: "/",
    };
  } catch (error) {
    console.error("Sign-in error:", error);
    next.error = "An unexpected error occurred.";
    return next;
  }
}

export async function signOutAction() {
  const session = await getSession();
  session.destroy();
  redirect("/");
}
