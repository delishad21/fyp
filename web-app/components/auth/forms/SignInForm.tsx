"use client";

import { useActionState, useEffect, useRef } from "react";
import TextInput from "@/components/ui/TextInput";
import SubmitButton from "../../ui/SubmitButton";
import {
  signInAction,
  type SignInState,
} from "@/services/user/sign-in-actions";
import ForgotPasswordText from "../form-components/ForgotPasswordText";
import { useRouter } from "next/navigation";
import CreateAccountText from "../form-components/CreateAccountText";
import { useToast } from "@/components/ui/toast/ToastProvider";

const REDIRECT_TIMEOUT = 1000; // 1 second

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

  // Redirect after action returns ok
  const { showToast } = useToast();
  const router = useRouter();

  const lastShown = useRef<SignInState | null>(null);

  useEffect(() => {
    // only show toasts if the sign in state is changed
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

  useEffect(() => {
    if (state.ok && state.redirect) {
      const t = setTimeout(() => {
        router.replace(state.redirect!);
      }, REDIRECT_TIMEOUT);
      return () => clearTimeout(t);
    }
  }, [state.ok, state.redirect]);

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
