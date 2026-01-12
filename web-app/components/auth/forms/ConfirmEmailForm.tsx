"use client";

/**
 * ConfirmEmailForm Component
 *
 * Purpose:
 *   - Handles email confirmation via a 6-digit OTP code during sign-up or email verification.
 *   - Manages submit/resend flows, cooldown countdown (with localStorage persistence), routing, and toasts.
 *
 * Props:
 *   @param {string} selector - Token/selector used to identify the verification session.
 *
 * State:
 *   - code: string[]            (current OTP digits)
 *   - loading: boolean          (submission in progress)
 *   - resending: boolean        (resend request in progress)
 *   - countdown: number         (seconds remaining before resend is allowed; persisted per selector)
 *
 * Behavior / Logic:
 *   - Restores and persists a per-selector resend cooldown in localStorage using key:
 *       `email-confirm-countdown:${selector}`
 *   - Counts down every second while > 0; disables resend during cooldown or while resending.
 *   - Validates OTP format (exactly 6 digits) before confirming.
 *   - On confirm:
 *       • Calls `confirmEmail(code, selector)`
 *       • Shows success/error toasts
 *       • On success with `redirect`, navigates via `router.replace` after `REDIRECT_TIMEOUT`
 *   - On resend:
 *       • Calls `resendCode(selector)`
 *       • Starts a new cooldown (from `cooldownSeconds` or `DEFAULT_RESEND_THROTTLE_SECONDS`)
 *       • Updates URL with new selector via `router.replace`
 *       • Shows success/error toasts
 *
 * UI:
 *   - <OTPInput> for 6-digit input with keyboard/paste ergonomics.
 *   - <SubmitButton> for confirmation (disabled until all digits entered or while loading).
 *   - <ResendLinkText> showing countdown status and triggering resend.
 *
 * Dependencies:
 *   - confirmEmail, resendCode (actions)
 *   - useRouter (Next.js navigation), useToast (feedback)
 *   - DEFAULT_RESEND_THROTTLE_SECONDS, REDIRECT_TIMEOUT for timing behavior
 */

import { useEffect, useState } from "react";
import OTPInput from "@/components/auth/form-components/OTPInput";
import SubmitButton from "@/components/ui/buttons/SubmitButton";
import { confirmEmail, resendCode } from "@/services/user/sign-up-actions";
import ResendLinkText from "../form-components/ResendLinkText";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/toast/ToastProvider";
import {
  DEFAULT_RESEND_THROTTLE_SECONDS,
  REDIRECT_TIMEOUT,
} from "@/utils/utils";

type Props = { selector: string };

export default function ConfirmEmailForm({ selector }: Props) {
  const [code, setCode] = useState<string[]>(Array(6).fill(""));
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [countdown, setCountdown] = useState(0);

  const router = useRouter();
  const { showToast } = useToast();

  // key for local storage of countdown key (no conflicts for newer selectors)
  const COUNTDOWN_KEY = `email-confirm-countdown:${selector}`;

  // Restore countdown for current selector if it exists
  useEffect(() => {
    const saved = Number(localStorage.getItem(COUNTDOWN_KEY) || "0");
    if (saved > 0) setCountdown(saved);
    setCode(Array(6).fill(""));
  }, [selector, COUNTDOWN_KEY]);

  // Persist countdown for current selector
  useEffect(() => {
    if (countdown > 0) {
      localStorage.setItem(COUNTDOWN_KEY, String(countdown));
    } else {
      localStorage.removeItem(COUNTDOWN_KEY);
    }
  }, [countdown, COUNTDOWN_KEY]);

  // Tick countdown while component is active
  useEffect(() => {
    if (countdown <= 0) return;
    const t = setInterval(() => setCountdown((n) => Math.max(0, n - 1)), 1000);
    return () => clearInterval(t);
  }, [countdown]);

  // Process entered code
  const joined = code.join("");
  const isComplete = /^\d{6}$/.test(joined);

  async function handleConfirm() {
    // Check if code is complete (defensive, submit is disabled unless all OTP boxes are filled)
    if (!isComplete) {
      showToast({
        title: "Incomplete code",
        description: "Please enter all 6 digits.",
        variant: "warning",
      });
      return;
    }

    // Start loading state
    setLoading(true);

    // Call action for email confirmation
    const res = await confirmEmail(joined, selector);

    // Error handling
    if (res?.error) {
      showToast({
        title: "Verification failed",
        description: res.error || "Invalid or expired code.",
        variant: "error",
      });
      setLoading(false);
      return;
    }

    if (res.ok && res.redirect) {
      // Success handling
      showToast({
        title: "Email confirmed",
        description: res?.message || "Your email address has been updated.",
        variant: "success",
      });

      // Redirect users to redirect set by backend
      setTimeout(() => {
        router.replace(res.redirect || "/");
      }, REDIRECT_TIMEOUT);
    }
    setLoading(false);
  }

  async function handleResend() {
    // Check if resend should be locked (defensive. Resend button locked when countdown is present)
    if (countdown > 0 || resending) return;
    setResending(true);

    const res = await resendCode(selector);

    // handle resend code failure
    if (!res.ok && res.error) {
      showToast({
        title: "Resend failed",
        description: res.error || "Could not send a new code.",
        variant: "error",
      });
      setResending(false);
      return;
    }

    // handle success
    if (res.ok && res.selector) {
      const newSelector = res.selector;
      const cooldownSeconds =
        typeof res.cooldownSeconds === "number"
          ? res.cooldownSeconds
          : DEFAULT_RESEND_THROTTLE_SECONDS;

      // start new countdown for new selector
      localStorage.setItem(
        `email-confirm-countdown:${newSelector}`,
        String(cooldownSeconds)
      );
      setCountdown(cooldownSeconds);

      // update URL to latest selector
      router.replace(
        `/auth/sign-up/confirm-email?selector=${encodeURIComponent(
          newSelector
        )}`
      );

      // Success toast
      showToast({
        title: "Code resent",
        description: "A new verification code has been sent.",
        variant: "success",
      });
    }

    setResending(false);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="mb-5">
        <OTPInput value={code} onChange={setCode} />
      </div>

      <SubmitButton disabled={!isComplete || loading} onSubmit={handleConfirm}>
        {loading ? "Please wait…" : "Confirm Email"}
      </SubmitButton>

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
