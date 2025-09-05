"use client";

import TextInput from "@/components/ui/text-inputs/TextInput";
import Select from "@/components/ui/selectors/select/Select";
import { SignUpState, signUpAction } from "@/services/user/sign-up-actions";
import SubmitButton from "../ui/buttons/SubmitButton";
import { useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/toast/ToastProvider";
import { HONORIFICS } from "@/services/user/helpers/constants";

const REDIRECT_TIMEOUT = 1000; // 1 second

const initialState: SignUpState = {
  ok: false,
  fieldErrors: {},
  values: {
    name: "",
    honorific: "",
    email: "",
    username: "",
    password: "",
    confirmPassword: "",
  },
};

export default function SignUpForm() {
  const [state, formAction] = useActionState<SignUpState, FormData>(
    signUpAction,
    initialState
  );

  const router = useRouter();
  const { showToast } = useToast();

  // Show success/error toasts once per action result (prevents refiring on re-render)
  const lastShown = useRef<SignUpState | null>(null);
  useEffect(() => {
    if (state !== lastShown.current) {
      if (state.message) {
        showToast({
          title: "Account created",
          description: state.message,
          variant: "success",
        });
      }
      if (state.error) {
        showToast({
          title: "Sign up failed",
          description: state.error,
          variant: "error",
        });
      }
      lastShown.current = state;
    }
  }, [state, showToast]);

  // Redirect after action returns ok
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
        id="name"
        name="name"
        type="text"
        label="Full name"
        placeholder="Your name"
        defaultValue={state.values.name}
        error={state.fieldErrors.name}
        required
      />

      <Select
        id="honorific"
        name="honorific"
        label="Honorific"
        defaultValue={state.values.honorific}
        options={HONORIFICS}
        error={state.fieldErrors.honorific}
      />

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
        id="username"
        name="username"
        type="text"
        label="Username"
        placeholder="Your username"
        defaultValue={state.values.username}
        error={state.fieldErrors.username}
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

      <div className="mt-2">
        <SubmitButton>Create account</SubmitButton>
      </div>
    </form>
  );
}
