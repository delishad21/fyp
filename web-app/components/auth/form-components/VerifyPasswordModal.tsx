"use client";

/**
 * VerifyPasswordModal Component
 *
 * Purpose:
 *   - Displays a modal dialog prompting the user to re-enter their password
 *     before performing sensitive actions.
 *   - Handles password input, error display, and async verification.
 *
 * Props:
 *   @param {boolean} open - Controls modal visibility.
 *   @param {boolean} [loading] - Indicates if verification is in progress.
 *   @param {() => void} onClose - Callback to close the modal.
 *   @param {(password: string) => Promise<{ ok: boolean; error?: string }>} onSubmit
 *          - Async handler to verify the password.
 *
 * State:
 *   - password: string (stores the input password).
 *   - error: string | undefined (stores error messages if verification fails).
 *
 * Key Features:
 *   - Resets input and error state when modal opens.
 *   - Submits password via `onSubmit` and displays errors if invalid.
 *   - Supports pressing "Enter" to trigger verification.
 *   - Disables "Unlock" button when no password is entered.
 *
 * UI:
 *   - Password input with inline error support.
 *   - "Cancel" button to close without submitting.
 *   - "Unlock" button with optional loading state.
 *   - Overlay backdrop with centered modal styling.
 */

import { useEffect, useState } from "react";
import Button from "@/components/ui/buttons/Button";
import TextInput from "@/components/ui/text-inputs/TextInput";

type Props = {
  open: boolean;
  loading?: boolean;
  onClose: () => void;
  onSubmit: (password: string) => Promise<{ ok: boolean; error?: string }>;
};

export default function VerifyPasswordModal({
  open,
  loading,
  onClose,
  onSubmit,
}: Props) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    if (open) {
      setPassword("");
      setError(undefined);
    }
  }, [open]);

  if (!open) return null;

  async function handleUnlock() {
    setError(undefined);
    const res = await onSubmit(password);
    if (!res.ok) {
      setError(res.error || "Incorrect password.");
    }
  }

  function handleEnterKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      if (password && !loading) void handleUnlock();
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40">
      <div className="w-full max-w-sm rounded-md bg-[var(--color-bg2)] p-5 shadow-lg">
        <h3 className="mb-2 text-lg font-semibold">Re-enter password</h3>
        <p className="mb-4 text-sm text-[var(--color-text-secondary)]">
          For security, please enter your password to edit this field.
        </p>

        <div className="mb-4">
          <TextInput
            id="unlock-password"
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.currentTarget.value)}
            error={error}
            onKeyDown={handleEnterKeyDown}
          />
        </div>

        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleUnlock} loading={loading} disabled={!password}>
            Unlock
          </Button>
        </div>
      </div>
    </div>
  );
}
