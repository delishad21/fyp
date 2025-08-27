"use client";

import TextInput from "@/components/ui/TextInput";
import Button from "@/components/ui/Button";
import { useState } from "react";
import { useToast } from "@/components/ui/toast/ToastProvider";

export default function ChangePasswordModal({
  open,
  loading,
  onClose,
  onSubmit,
}: {
  open: boolean;
  loading?: boolean;
  onClose: () => void;
  onSubmit: (
    password: string,
    confirmPassword: string
  ) => Promise<
    | { ok: true; message?: string }
    | {
        ok: false;
        error?: string;
        fieldErrors?: Record<string, string | string[]>;
      }
  >;
}) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [fieldErrors, setFieldErrors] = useState<
    Record<string, string | string[]>
  >({});

  const { showToast } = useToast();

  if (!open) return null;

  async function handleClose() {
    setPassword("");
    setConfirm("");
    setFieldErrors({});
    onClose();
  }

  async function handleSubmit() {
    setFieldErrors({});

    const res = await onSubmit(password, confirm);

    if (!res.ok) {
      if (res.fieldErrors) setFieldErrors(res.fieldErrors);

      if (res.error) {
        showToast({
          title: "Update failed",
          description: res.error,
          variant: "error",
        });
      }
      return;
    }

    // success toast
    showToast({
      title: "Password updated",
      description: res.message || "Your password has been changed.",
      variant: "success",
    });

    setPassword("");
    setConfirm("");
    setTimeout(handleClose, 800);
  }

  function handleEnterKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      if (password && !loading) void handleSubmit();
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/40"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-sm rounded-md bg-[var(--color-bg2)] p-5 shadow-lg">
        <h3 className="mb-2 text-lg font-semibold">Change password</h3>
        <p className="mb-4 text-sm text-[var(--color-text-secondary)]">
          Enter a new password and confirm it.
        </p>

        <div className="mb-3">
          <TextInput
            id="new-password"
            type="password"
            label="Password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.currentTarget.value)}
            error={fieldErrors.password as string | string[] | undefined}
            onKeyDown={handleEnterKeyDown}
          />
        </div>

        <div className="mb-3">
          <TextInput
            id="confirm-new-password"
            type="password"
            label="Confirm Password"
            placeholder="••••••••"
            value={confirm}
            onChange={(e) => setConfirm(e.currentTarget.value)}
            error={fieldErrors.confirmPassword as string | string[] | undefined}
            onKeyDown={handleEnterKeyDown}
          />
        </div>

        <div className="mt-2 flex justify-end gap-2">
          <Button variant="ghost" onClick={handleClose} disabled={loading}>
            Close
          </Button>
          <Button onClick={handleSubmit} loading={loading}>
            Update Password
          </Button>
        </div>
      </div>
    </div>
  );
}
