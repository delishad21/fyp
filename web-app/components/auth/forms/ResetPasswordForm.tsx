"use client";

import { useActionState, useEffect, useRef } from "react";
import TextInput from "@/components/ui/TextInput";
import SubmitButton from "@/components/ui/SubmitButton";
import {
  resetPasswordAction,
  type ResetPasswordState,
} from "@/services/user/reset-password-actions";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/toast/ToastProvider";

const REDIRECT_TIMEOUT = 1000; // 1 second

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

  // Fire success/error toasts once per action result
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
