"use client";

import { useActionState } from "react";
import TextInput from "@/components/ui/TextInput";
import SubmitButton from "@/components/ui/SubmitButton";
import {
  resetPasswordAction,
  type ResetPasswordState,
} from "@/services/user/reset-password-actions";

// If you pass no initial state, TS may infer `never` for nested properties.
const initialState: ResetPasswordState = {
  fieldErrors: {},
  values: { password: "", confirmPassword: "" },
};

export default function ResetPasswordForm() {
  const [state, formAction] = useActionState<ResetPasswordState, FormData>(
    resetPasswordAction,
    initialState
  );

  return (
    <form noValidate action={formAction} className="grid gap-4">
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

      {state.message && (
        <p className="text-sm text-[var(--color-text-secondary)]">
          {state.message}
        </p>
      )}

      <div className="mt-4">
        <SubmitButton>Confirm</SubmitButton>
      </div>
    </form>
  );
}
