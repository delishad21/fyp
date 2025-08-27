"use client";

import React, { useEffect, useState } from "react";
import TextInput from "@/components/ui/TextInput";
import SubmitButton from "@/components/ui/SubmitButton";
import { requestPasswordReset } from "@/services/user/reset-password-actions";
import { useToast } from "@/components/ui/toast/ToastProvider";

const COUNTDOWN_KEY = "forget-password-countdown";
const DEFAULT_RESET_THROTTLE = 60;

export default function ForgetPasswordForm() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(0);
  const [loading, setLoading] = useState(false);

  const { showToast } = useToast();

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

    if (!email.trim()) {
      setError("Please enter your email.");
      return;
    }

    setLoading(true);
    const res = await requestPasswordReset(email.trim());
    setLoading(false);

    if (res.error) {
      setError(res.error);
      return;
    }

    if (res.message) {
      showToast({
        title: "Reset link sent",
        description: res.message,
        variant: "success",
      });
    }

    setCountdown(res.cooldownSeconds || DEFAULT_RESET_THROTTLE);
  }

  return (
    <div className="grid gap-4">
      <TextInput
        id="email"
        name="email"
        type="text"
        label="Email"
        placeholder="johndoe@email.com"
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.currentTarget.value)}
        error={error || undefined}
        required
      />

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
