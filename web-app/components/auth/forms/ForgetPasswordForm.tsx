"use client";

/**
 * ForgetPasswordForm Component
 *
 * Purpose:
 *   - Requests a password reset link for a given email.
 *   - Manages resend cooldown persisted in localStorage to throttle requests.
 *
 * State:
 *   - email: string              (input value)
 *   - error: string|null         (inline validation/server error)
 *   - countdown: number          (seconds until user can request again)
 *   - loading: boolean           (request in progress)
 *
 * Behavior / Logic:
 *   - Restores countdown from localStorage key "forget-password-countdown" on mount.
 *   - Persists/removes countdown in localStorage as it changes.
 *   - Ticks countdown every second while > 0.
 *   - handleSubmit():
 *       • Validates email presence
 *       • Calls requestPasswordReset(email)
 *       • Shows success toast on ok
 *       • Sets cooldown from server `cooldownSeconds` or DEFAULT_RESET_THROTTLE_SECONDS
 *
 * UI:
 *   - Email TextInput with inline error display.
 *   - SubmitButton disabled during loading or active countdown.
 *   - Countdown message indicating when resend is available.
 *
 * Dependencies:
 *   - requestPasswordReset (action)
 *   - useToast (for feedback toasts)
 *   - DEFAULT_RESET_THROTTLE_SECONDS (fallback cooldown)
 */

import React, { useEffect, useState } from "react";
import TextInput from "@/components/ui/text-inputs/TextInput";
import SubmitButton from "@/components/ui/buttons/SubmitButton";
import { requestPasswordReset } from "@/services/user/reset-password-actions";
import { useToast } from "@/components/ui/toast/ToastProvider";
import { DEFAULT_RESET_THROTTLE_SECONDS } from "@/utils/utils";

const COUNTDOWN_KEY = "forget-password-countdown";

export default function ForgetPasswordForm() {
  // form states
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(0);
  const [loading, setLoading] = useState(false);

  const { showToast } = useToast();

  /** ----------- Countdown logic for email resends ------------ */

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

  /** ----------- handlers ------------ */

  async function handleSubmit() {
    setError(null);

    if (!email.trim()) {
      setError("Please enter your email.");
      return;
    }

    setLoading(true);
    const res = await requestPasswordReset(email.trim());
    setLoading(false);

    // Error handling
    if (!res.ok && res.error) {
      setError(res.error);
      return;
    }

    // Success handling
    if (res.ok && res.message) {
      showToast({
        title: "Reset link sent",
        description: res.message,
        variant: "success",
      });
    }

    setCountdown(res.cooldownSeconds || DEFAULT_RESET_THROTTLE_SECONDS);
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
