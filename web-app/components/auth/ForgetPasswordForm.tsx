"use client";

import React, { useEffect, useState } from "react";
import TextInput from "@/components/ui/TextInput";
import ResendLinkText from "@/components/auth/ResendLinkText";
import SubmitButton from "@/components/ui/SubmitButton";
import {
  requestPasswordReset,
  resendResetLink,
} from "@/services/user/reset-password-api";

const COUNTDOWN_KEY = "forget-password-countdown";

export default function ForgetPasswordForm() {
  const [identifier, setIdentifier] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [countdown, setCountdown] = useState(0);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);

  // Restore countdown (store remaining seconds like confirm email form)
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

  async function handleSubmit() {
    setError(null);
    setMessage(null);

    if (!identifier.trim()) {
      setError("Please enter your username or email.");
      return;
    }

    setLoading(true);
    const res = await requestPasswordReset(identifier.trim());
    setLoading(false);

    if (res.error) {
      setError(res.error);
      return;
    }

    if (res.message) setMessage(res.message);
    setCountdown(60); // match Confirm Email’s 60s cooldown
  }

  async function handleResend() {
    if (countdown > 0 || resending) return;

    setResending(true);
    setError(null);
    setMessage(null);

    const res = await resendResetLink();
    if (res.error) setError(res.error);
    if (res.ok) setCountdown(60);

    setResending(false);
  }

  return (
    <div className="grid gap-4">
      <TextInput
        id="identifier"
        name="identifier"
        type="text"
        label="Username/Email"
        placeholder="johndoe or johndoe@email.com"
        autoComplete="username email"
        value={identifier}
        onChange={(e) => setIdentifier(e.currentTarget.value)}
        error={error && !message ? error : undefined}
        required
      />

      {message && (
        <p className="text-center text-sm text-emerald-600">{message}</p>
      )}

      <div className="mt-2">
        <SubmitButton
          disabled={loading || countdown > 0}
          onSubmit={handleSubmit}
        >
          {loading ? "Sending…" : "Send reset link"}
        </SubmitButton>

        {countdown > 0 && (
          <p className="flex mt-3 justify-center text-sm text-[var(--color-text-secondary)]">
            You can resend in {countdown} seconds
          </p>
        )}
      </div>
    </div>
  );
}
