"use client";

/**
 * ChangePasswordModal Component
 *
 * Purpose:
 *   - Renders a modal dialog that allows the user to update their password.
 *   - Handles input state, validation errors, and async submission logic.
 *
 * Props:
 *   @param {boolean} open - Controls whether the modal is visible.
 *   @param {boolean} [loading] - Indicates if the form is currently submitting.
 *   @param {() => void} onClose - Callback when modal is closed.
 *   @param {(password: string, confirmPassword: string) => Promise<
 *              { ok: true; message?: string } |
 *              { ok: false; error?: string; fieldErrors?: Record<string, string | string[]> }
 *          >} onSubmit
 *          - Async handler for submitting the new password and confirmation.
 *
 * State:
 *   - password: string (new password input value)
 *   - confirm: string (confirmation password input value)
 *   - fieldErrors: Record<string, string | string[]> (field-specific error messages)
 *
 * Key Features:
 *   - Clears state and errors on modal close.
 *   - Submits form via `onSubmit` and updates UI on success/failure.
 *   - Displays inline error messages returned from validation.
 *   - Supports pressing "Enter" to trigger submission.
 *
 * UI:
 *   - Two password inputs (Password, Confirm Password).
 *   - "Close" button to cancel/reset.
 *   - "Update Password" button with optional loading indicator.
 *   - Overlay with centered modal styling.
 */

import TextInput from "@/components/ui/text-inputs/TextInput";
import Button from "@/components/ui/buttons/Button";
import { useState } from "react";

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

      return;
    }

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
