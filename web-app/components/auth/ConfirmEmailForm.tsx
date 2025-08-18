"use client";

import { useEffect, useState } from "react";
import OTPInput from "@/components/auth/OTPInput";
import SubmitButton from "@/components/ui/SubmitButton";
import { confirmEmail, resendCode } from "@/services/user/confirm-email-api";
import ResendLinkText from "./ResendLinkText";

const COUNTDOWN_KEY = "email-confirm-countdown";

export default function ConfirmEmailForm() {
  const [code, setCode] = useState<string[]>(Array(6).fill(""));

  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);

  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [countdown, setCountdown] = useState(0);

  // Restore countdown
  useEffect(() => {
    const saved = Number(localStorage.getItem(COUNTDOWN_KEY) || "0");
    if (saved > 0) setCountdown(saved);
  }, []);

  // Persist countdown
  useEffect(() => {
    if (countdown > 0) {
      localStorage.setItem(COUNTDOWN_KEY, String(countdown));
    } else {
      localStorage.removeItem(COUNTDOWN_KEY);
    }
  }, [countdown]);

  // Tick countdown
  useEffect(() => {
    if (countdown <= 0) return;
    const t = setInterval(() => setCountdown((n) => Math.max(0, n - 1)), 1000);
    return () => clearInterval(t);
  }, [countdown]);

  const joined = code.join("");
  const isComplete = /^\d{6}$/.test(joined);

  async function handleConfirm() {
    setLoading(true);
    setError(null);
    setMessage(null);

    const res = await confirmEmail(joined);

    if (res.error) setError(res.error);
    if (res.message) setMessage(res.message);

    setLoading(false);
  }

  async function handleResend() {
    if (countdown > 0 || resending) return;
    setResending(true);
    setError(null);
    setMessage(null);

    const res = await resendCode();
    if (res.error) setError(res.error);
    if (res.ok) setCountdown(60);

    setResending(false);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="mb-5">
        <OTPInput value={code} onChange={setCode} />
      </div>

      {error && <p className="text-sm text-red-500 text-center">{error}</p>}
      {message && (
        <p className="text-sm text-emerald-600 text-center">{message}</p>
      )}

      {/* Confirm button */}
      <SubmitButton disabled={!isComplete || loading} onSubmit={handleConfirm}>
        {loading ? "Please wait…" : "Confirm Email"}
      </SubmitButton>

      {/* Resend link-like text */}
      <div className="mb-4">
        <ResendLinkText
          countdown={countdown}
          resending={resending}
          handleResend={handleResend}
        />
      </div>
    </div>
  );
}
