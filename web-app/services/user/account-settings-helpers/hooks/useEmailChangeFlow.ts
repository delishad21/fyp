"use client";

import { useEffect, useRef, useState } from "react";
import {
  requestEmailChangeAction,
  confirmEmailChangeAction,
  resendEmailChangeCodeAction,
} from "@/services/user/edit-user-actions";

const RESEND_THROTTLE_SECONDS = 60;

export function useEmailChangeFlow(opts: {
  onConfirmed: (newEmail: string) => void;
  onErrorToast?: (msg: string) => void; // parent shows error toast
  onSuccessToast?: (title: string, desc?: string) => void; // parent shows success toast
}) {
  const { onConfirmed, onErrorToast, onSuccessToast } = opts;

  const [modalOpen, setModalOpen] = useState(false);
  const [selector, setSelector] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(0);
  const intervalRef = useRef<number | null>(null);

  const keyFor = (sel: string) => `email-change-confirm-countdown:${sel}`;

  // Restore countdown when modal opens
  useEffect(() => {
    if (!modalOpen || !selector) return;
    const saved = Number(localStorage.getItem(keyFor(selector)) || "0");
    if (saved > 0) setCountdown(saved);
  }, [modalOpen, selector]);

  // Persist countdown per-selector
  useEffect(() => {
    if (!modalOpen || !selector) return;
    localStorage.setItem(keyFor(selector), String(countdown));
  }, [modalOpen, selector, countdown]);

  // Tick
  useEffect(() => {
    if (!modalOpen || countdown <= 0) return;
    intervalRef.current = window.setInterval(
      () => setCountdown((n) => Math.max(0, n - 1)),
      1000
    );
    return () => {
      if (intervalRef.current) window.clearInterval(intervalRef.current);
    };
  }, [modalOpen, countdown]);

  function close() {
    setModalOpen(false);
    setSelector(null);
    setCountdown(0);
  }

  // Start: request change (opens modal)
  async function start(newEmail: string) {
    const res = await requestEmailChangeAction({ email: newEmail });
    if (!res.ok) {
      onErrorToast?.(
        (res.fieldErrors?.email as string) ||
          res.error ||
          "Failed to request email change."
      );
      return { ok: false as const, error: res.error || "Request failed." };
    }

    const sel = res.data?.selector;
    const cooldown =
      typeof res.data?.cooldownSeconds === "number"
        ? res.data!.cooldownSeconds
        : RESEND_THROTTLE_SECONDS;

    if (sel) {
      localStorage.setItem(keyFor(sel), String(cooldown));
      setSelector(sel);
      setCountdown(cooldown);
      setModalOpen(true);
    }

    return { ok: true as const, selector: sel };
  }

  // Confirm code
  async function confirm(code: string) {
    if (!selector) {
      onErrorToast?.("Invalid or expired code.");
      return { ok: false as const, error: "No selector." };
    }

    const res = await confirmEmailChangeAction({ selector, code });

    if (!res.ok) {
      onErrorToast?.(res.error || "Invalid or expired code.");
      return {
        ok: false as const,
        error: res.error || "Invalid or expired code.",
      };
    }

    onSuccessToast?.(
      "Email confirmed",
      res.message || "Your email address has been updated."
    );
    onConfirmed(res.data?.email ?? "");
    close();
    return { ok: true as const };
  }

  // Resend code
  async function resend() {
    if (!selector) {
      onErrorToast?.("Could not send a new code.");
      return { ok: false as const, error: "No selector." };
    }

    if (countdown > 0) {
      // UI already shows remaining seconds; no toast here
      return {
        ok: false as const,
        error: "Please wait before requesting another code.",
      };
    }

    const res = await resendEmailChangeCodeAction({ selector });

    if (!res.ok) {
      onErrorToast?.(res.error || "Could not send a new code.");
      return {
        ok: false as const,
        error: res.error || "Failed to resend code.",
      };
    }

    const nextSelector = res.data?.selector ?? selector;
    const nextCooldown =
      typeof res.data?.cooldownSeconds === "number"
        ? res.data!.cooldownSeconds
        : RESEND_THROTTLE_SECONDS;

    localStorage.setItem(keyFor(nextSelector), String(nextCooldown));
    setSelector(nextSelector);
    setModalOpen(true);
    setCountdown(nextCooldown);

    onSuccessToast?.("Code resent", "A new verification code has been sent.");
    return {
      ok: true as const,
      selector: nextSelector,
      cooldownSeconds: nextCooldown,
    };
  }

  return {
    start,
    confirm,
    resend,
    modal: {
      open: modalOpen,
      selector,
      countdown,
      onClose: close,
    },
  };
}
