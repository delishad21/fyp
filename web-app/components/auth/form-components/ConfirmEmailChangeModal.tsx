"use client";

import { useEffect, useState } from "react";
import OTPInput from "@/components/auth/form-components/OTPInput";
import SubmitButton from "@/components/ui/SubmitButton";
import { useToast } from "@/components/ui/toast/ToastProvider";

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

  const { showToast } = useToast();

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
      showToast({
        title: "Verification failed",
        description: res.error || "Invalid or expired code.",
        variant: "error",
      });
      setLoading(false);
      return;
    }

    showToast({
      title: "Email confirmed",
      description: res.message || "Your email address has been updated.",
      variant: "success",
    });

    setLoading(false);
    setTimeout(onClose, 800);
  }

  async function handleResend() {
    if (countdown > 0 || resending) return;
    setResending(true);

    const res = await onResend();

    if (!res.ok) {
      showToast({
        title: "Resend failed",
        description: res.error || "Could not send a new code.",
        variant: "error",
      });
      setResending(false);
      return;
    }

    showToast({
      title: "Code resent",
      description: "A new verification code has been sent.",
      variant: "success",
    });

    setResending(false);
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
