"use client";

/**
 * SignInForm Component
 *
 * Purpose:
 *   - Handles user sign-in via a server action (`signInAction`).
 *   - Surfaces field-level and global errors and shows success/error toasts.
 *   - Redirects on successful authentication.
 *
 * Server Action State (via useActionState):
 *   - state.ok: boolean
 *   - state.message?: string           (success message shown in toast)
 *   - state.error?: string             (global error shown in toast)
 *   - state.redirect?: string          (URL to navigate to on success)
 *   - state.fieldErrors: { identifier?: string|string[]; password?: string|string[] }
 *   - state.values: { identifier: string; password: string } (repopulates inputs on error)
 *
 * Behavior / Logic:
 *   - Posts form to `signInAction`; inputs use `defaultValue` from `state.values`.
 *   - Shows toasts once per state change (debounced via `useRef` comparison).
 *   - On success, redirects to `state.redirect` after `REDIRECT_TIMEOUT`.
 *
 * UI:
 *   - Text inputs: "Email/Username" and "Password" with inline error messages.
 *   - <ForgotPasswordText /> helper link under inputs.
 *   - Submit button labeled "Sign in".
 *   - <CreateAccountText /> prompt/link for new users.
 *
 * Accessibility / Notes:
 *   - `<form noValidate>` defers validation to the server action.
 *   - Inputs include appropriate `autoComplete` attributes.
 */

import { useActionState, useEffect, useRef } from "react";
import TextInput from "@/components/ui/text-inputs/TextInput";
import SubmitButton from "../../ui/buttons/SubmitButton";
import {
  signInAction,
  type SignInState,
} from "@/services/user/sign-in-actions";
import ForgotPasswordText from "../form-components/ForgotPasswordText";
import { useRouter } from "next/navigation";
import CreateAccountText from "../form-components/CreateAccountText";
import { useToast } from "@/components/ui/toast/ToastProvider";
import { REDIRECT_TIMEOUT } from "@/utils/utils";

const initialState: SignInState = {
  ok: false,
  fieldErrors: {},
  values: { identifier: "", password: "" },
};

export default function SignInForm() {
  const [state, formAction] = useActionState<SignInState, FormData>(
    signInAction,
    initialState
  );

  const { showToast } = useToast();
  const router = useRouter();

  const lastShown = useRef<SignInState | null>(null);
  useEffect(() => {
    // Show toasts when state changes
    if (state !== lastShown.current) {
      if (state.message) {
        showToast({
          title: "Success",
          description: state.message,
          variant: "success",
        });
      }
      if (state.error) {
        showToast({
          title: "Error",
          description: state.error,
          variant: "error",
        });
      }
      lastShown.current = state;
    }
  }, [state, showToast]);

  // Redirect after successful sign in
  useEffect(() => {
    if (state.ok && state.redirect) {
      const t = setTimeout(() => {
        router.replace(state.redirect!);
      }, REDIRECT_TIMEOUT);
      return () => clearTimeout(t);
    }
  }, [state.ok, state.redirect, router]);

  return (
    <form noValidate action={formAction} className="grid gap-4">
      <TextInput
        id="identifier"
        name="identifier"
        type="text"
        label="Email/Username"
        placeholder="you@example.com"
        autoComplete="email"
        defaultValue={state.values.identifier}
        error={state.fieldErrors.identifier}
        required
      />
      <TextInput
        id="password"
        name="password"
        type="password"
        label="Password"
        placeholder="••••••••"
        autoComplete="current-password"
        defaultValue={state.values.password}
        error={state.fieldErrors.password}
        required
      />
      <ForgotPasswordText />

      <div>
        <SubmitButton>Sign in</SubmitButton>
        <div className="mt-2">
          <CreateAccountText />
        </div>
      </div>
    </form>
  );
}
