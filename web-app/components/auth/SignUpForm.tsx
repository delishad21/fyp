// components/auth/SignUpForm.tsx
"use client";

import TextInput from "@/components/ui/TextInput";
import { SignUpState, signUpAction } from "@/services/user/sign-up-actions";
import SubmitButton from "../ui/SubmitButton";
import { useActionState } from "react";

const initialState: SignUpState = {
  fieldErrors: {},
  values: { email: "", password: "", confirmPassword: "" },
};

export default function SignUpForm() {
  const [state, formAction] = useActionState<SignUpState, FormData>(
    signUpAction,
    initialState
  );

  return (
    <form noValidate action={formAction} className="grid gap-4">
      <TextInput
        id="email"
        name="email"
        type="email"
        label="Email"
        placeholder="you@example.com"
        autoComplete="email"
        defaultValue={state.values.email}
        error={state.fieldErrors.email}
        required
      />
      <TextInput
        id="password"
        name="password"
        type="password"
        label="Password"
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
        <SubmitButton>Create account</SubmitButton>
      </div>
    </form>
  );
}
