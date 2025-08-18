"use client";

import { useActionState } from "react";
import TextInput from "@/components/ui/TextInput";
import SubmitButton from "../ui/SubmitButton";
import {
  signInAction,
  type SignInState,
} from "@/services/user/sign-in-actions";

const initialState: SignInState = {
  fieldErrors: {},
  values: { email: "", password: "" },
};

export default function SignInForm() {
  const [state, formAction] = useActionState<SignInState, FormData>(
    signInAction,
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
        autoComplete="current-password"
        defaultValue={state.values.password}
        error={state.fieldErrors.password}
        required
      />

      {state.message && (
        <p className="text-sm text-[var(--color-text-secondary)]">
          {state.message}
        </p>
      )}

      <div className="mt-4">
        <SubmitButton>Sign in</SubmitButton>
      </div>
    </form>
  );
}
