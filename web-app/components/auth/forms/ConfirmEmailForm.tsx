"use client";

import { useEffect, useState } from "react";
import OTPInput from "@/components/auth/form-components/OTPInput";
import SubmitButton from "@/components/ui/SubmitButton";
import { confirmEmail, resendCode } from "@/services/user/sign-up-actions";
import ResendLinkText from "../form-components/ResendLinkText";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/toast/ToastProvider";

type Props = { selector: string };

const REDIRECT_TIMEOUT = 1000; // 1 second
const RESEND_THROTTLE_SECONDS = 60;

export default function ConfirmEmailForm({ selector }: Props) {
  const [code, setCode] = useState<string[]>(Array(6).fill(""));
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [countdown, setCountdown] = useState(0);

  const router = useRouter();
  const { showToast } = useToast();

  // key is per-selector so resends (new selector) don't clash
  const COUNTDOWN_KEY = `email-confirm-countdown:${selector}`;

  // Restore countdown for this selector
  useEffect(() => {
    const saved = Number(localStorage.getItem(COUNTDOWN_KEY) || "0");
    if (saved > 0) setCountdown(saved);
    // reset code boxes when selector changes (after resend)
    setCode(Array(6).fill(""));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selector]);

  // Persist countdown for this selector
  useEffect(() => {
    if (countdown > 0) {
      localStorage.setItem(COUNTDOWN_KEY, String(countdown));
    } else {
      localStorage.removeItem(COUNTDOWN_KEY);
    }
  }, [countdown, COUNTDOWN_KEY]);

  // Tick countdown
  useEffect(() => {
    if (countdown <= 0) return;
    const t = setInterval(() => setCountdown((n) => Math.max(0, n - 1)), 1000);
    return () => clearInterval(t);
  }, [countdown]);

  const joined = code.join("");
  const isComplete = /^\d{6}$/.test(joined);

  async function handleConfirm() {
    if (!isComplete) {
      showToast({
        title: "Incomplete code",
        description: "Please enter all 6 digits.",
        variant: "warning",
      });
      return;
    }

    setLoading(true);

    const res = await confirmEmail(joined, selector);
    if (res?.error) {
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
      description: res?.message || "Your email address has been updated.",
      variant: "success",
    });

    if (res?.ok && res.redirect) {
      // small delay to let users see the toast text before navigating
      setTimeout(() => {
        router.replace("/");
      }, REDIRECT_TIMEOUT);
    }
    setLoading(false);
  }

  async function handleResend() {
    if (countdown > 0 || resending) return;
    setResending(true);

    const res = await resendCode(selector);
    if (res?.error) {
      showToast({
        title: "Resend failed",
        description: res.error || "Could not send a new code.",
        variant: "error",
      });
      setResending(false);
      return;
    }

    if (res?.ok && res.selector) {
      const newSelector = res.selector;
      const cooldownSeconds =
        typeof res.cooldownSeconds === "number"
          ? res.cooldownSeconds
          : RESEND_THROTTLE_SECONDS;

      // start new countdown for new selector
      localStorage.setItem(
        `email-confirm-countdown:${newSelector}`,
        String(cooldownSeconds)
      );
      setCountdown(cooldownSeconds);

      // update URL (so refresh/share keeps the latest selector)
      router.replace(
        `/auth/sign-up/confirm-email?selector=${encodeURIComponent(
          newSelector
        )}`
      );

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
