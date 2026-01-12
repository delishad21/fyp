"use client";

/**
 * ConfirmEmailChangeModal Component
 *
 * Purpose:
 *   - Renders a modal dialog to confirm a user's new email address.
 *   - Accepts and validates a 6-digit OTP code sent to the new email.
 *   - Handles confirmation, resend requests, and closing.
 *
 * Props:
 *   @param {boolean} open - Controls modal visibility.
 *   @param {string} selector - Identifier used for verification (e.g., email selector/token).
 *   @param {number} countdown - Seconds remaining before resend is allowed.
 *   @param {() => void} onClose - Callback to close the modal.
 *   @param {(code: string, selector: string) => Promise<{ ok: boolean; error?: string; message?: string }>} onConfirm
 *          - Async handler to confirm the OTP code.
 *   @param {() => Promise<{ ok: boolean; selector?: string; cooldownSeconds?: number; error?: string }>} onResend
 *          - Async handler to request a new OTP code.
 *
 * State:
 *   - code: string[] (stores each digit of the 6-digit OTP input).
 *   - loading: boolean (tracks confirmation submission state).
 *   - resending: boolean (tracks resend request state).
 *
 * Key Features:
 *   - Clears OTP input whenever modal opens or selector changes.
 *   - Validates OTP format (must be 6 digits) before enabling submission.
 *   - Shows countdown until resend is available; disables resend during cooldown.
 *   - Displays loading indicators for both confirmation and resend actions.
 *   - Closes automatically after successful confirmation (with slight delay).
 *
 * UI:
 *   - Title and instructions.
 *   - 6-digit OTP input component.
 *   - "Confirm Email" button with loading state.
 *   - Countdown/resend link for requesting new code.
 *   - "Close" link to dismiss modal.
 */

import { useEffect, useState } from "react";
import OTPInput from "@/components/auth/form-components/OTPInput";
import SubmitButton from "@/components/ui/buttons/SubmitButton";

type Props = {
  open: boolean;
  selector: string;
  countdown: number;
  onClose: () => void;
  onConfirm: (
    code: string,
    selector: string
  ) => Promise<{ ok: boolean; error?: string; message?: string }>;
  onResend: () => Promise<{
    ok: boolean;
    selector?: string;
    cooldownSeconds?: number;
    error?: string;
  }>;
};

export default function ConfirmEmailChangeModal({
  open,
  selector,
  countdown,
  onClose,
  onConfirm,
  onResend,
}: Props) {
  const [code, setCode] = useState<string[]>(Array(6).fill(""));
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCode(Array(6).fill(""));
  }, [open, selector]);

  if (!open) return null;

  const joined = code.join("");
  const isComplete = /^\d{6}$/.test(joined);

  async function handleConfirm() {
    if (!isComplete) return;
    setLoading(true);

    const res = await onConfirm(joined, selector);

    if (!res.ok) {
      setLoading(false);
      return;
    }

    setLoading(false);
    setTimeout(onClose, 800);
  }

  async function handleResend() {
    if (countdown > 0 || resending) return;
    setResending(true);

    await onResend();

    setResending(false);
    return;
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40">
      <div className="w-full max-w-sm rounded-md bg-[var(--color-bg2)] p-5 shadow-lg">
        <h3 className="mb-2 text-lg font-semibold">Confirm new email</h3>
        <p className="mb-4 text-sm text-[var(--color-text-secondary)]">
          Enter the 6-digit code sent to your new email address.
        </p>

        <div className="mb-4">
          <OTPInput value={code} onChange={setCode} />
        </div>

        <div className="mb-3">
          <SubmitButton
            disabled={!isComplete || loading}
            onSubmit={handleConfirm}
          >
            {loading ? "Please wait…" : "Confirm Email"}
          </SubmitButton>
        </div>

        <div className="flex items-center justify-between text-sm">
          <span className="text-[var(--color-text-secondary)]">
            {countdown > 0
              ? `Resend available in ${countdown}s`
              : "You can resend a new code."}
          </span>
          <button
            className="text-[var(--color-primary)] disabled:opacity-50"
            onClick={handleResend}
            disabled={countdown > 0 || resending}
          >
            {resending ? "Resending…" : "Resend code"}
          </button>
        </div>

        <div className="mt-4 flex justify-end">
          <button
            className="text-sm text-[var(--color-text-secondary)] hover:underline"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
