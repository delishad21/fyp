"use client";

/**
 * ResetPasswordForm Component
 *
 * Purpose:
 *   - Submits a new password + confirmation using a server action (`resetPasswordAction`).
 *   - Surfaces field-level validation errors and global success/error toasts.
 *   - Redirects after successful reset.
 *
 * Props:
 *   @param {string} selector  - Token identifying the reset session.
 *   @param {string} validator - Token used to validate the reset session.
 *
 * Server Action State (via useActionState):
 *   - state.ok: boolean
 *   - state.message?: string         (success message)
 *   - state.error?: string           (global error message)
 *   - state.redirect?: string        (URL to navigate to on success)
 *   - state.fieldErrors: { password?: string|string[]; confirmPassword?: string|string[] }
 *   - state.values: { password: string; confirmPassword: string } (repopulates inputs on error)
 *
 * Behavior / Logic:
 *   - Hidden inputs (`selector`, `validator`) are posted with the form to the server action.
 *   - Field errors are displayed inline under their corresponding inputs.
 *   - Global success/error toasts are shown once per action result.
 *   - On success, redirects to `state.redirect` after a short delay (REDIRECT_TIMEOUT).
 *
 * UI:
 *   - Two password inputs: "New password" and "Confirm password".
 *   - Submit button labeled "Confirm".
 *   - `noValidate` on <form> to prefer server-side validation feedback.
 */

import { useActionState, useEffect, useRef } from "react";
import TextInput from "@/components/ui/text-inputs/TextInput";
import SubmitButton from "@/components/ui/buttons/SubmitButton";
import {
  resetPasswordAction,
  type ResetPasswordState,
} from "@/services/user/reset-password-actions";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/toast/ToastProvider";
import { REDIRECT_TIMEOUT } from "@/utils/utils";

const initialState: ResetPasswordState = {
  ok: false,
  fieldErrors: {},
  values: { password: "", confirmPassword: "" },
};

type Props = {
  selector: string;
  validator: string;
};

export default function ResetPasswordForm({ selector, validator }: Props) {
  const [state, formAction] = useActionState<ResetPasswordState, FormData>(
    resetPasswordAction,
    initialState
  );

  const router = useRouter();
  const { showToast } = useToast();

  // Fire success/error toasts when state changes
  const lastShown = useRef<ResetPasswordState | null>(null);
  useEffect(() => {
    if (state !== lastShown.current) {
      if (state.message) {
        showToast({
          title: "Password updated",
          description: state.message,
          variant: "success",
        });
      }
      if (state.error) {
        showToast({
          title: "Update failed",
          description: state.error,
          variant: "error",
        });
      }
      lastShown.current = state;
    }
  }, [state, showToast]);

  // Redirect after success
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
      {/* Hidden fields required by resetPasswordAction */}
      <input type="hidden" name="selector" value={selector} />
      <input type="hidden" name="validator" value={validator} />

      <TextInput
        id="password"
        name="password"
        type="password"
        label="New password"
        placeholder="••••••••"
        autoComplete="new-password"
        defaultValue={state.values.password}
        error={state.fieldErrors.password}
        required
      />

      <TextInput
        id="confirmPassword"
        name="confirmPassword"
        type="password"
        label="Confirm password"
        placeholder="••••••••"
        autoComplete="new-password"
        defaultValue={state.values.confirmPassword}
        error={state.fieldErrors.confirmPassword}
        required
      />

      <div className="mt-2">
        <SubmitButton>Confirm</SubmitButton>
      </div>
    </form>
  );
}
