"use client";

import { useEffect, useRef } from "react";

export function useEmailCountdown(
  open: boolean,
  selector: string | null,
  countdown: number,
  setCountdown: (n: number) => void
) {
  // persist per selector
  const key = selector ? `email-change-confirm-countdown:${selector}` : null;

  // restore on open
  useEffect(() => {
    if (!open || !key) return;
    const saved = Number(localStorage.getItem(key) || "0");
    if (saved > 0) setCountdown(saved);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, selector]);

  // persist on change
  useEffect(() => {
    if (!open || !key) return;
    localStorage.setItem(key, String(countdown));
  }, [open, countdown, key]);

  // tick
  const intervalRef = useRef<number | null>(null);
  useEffect(() => {
    if (!open || countdown <= 0) return;
    intervalRef.current = window.setInterval(
      () => setCountdown(Math.max(0, countdown - 1)),
      1000
    );
    return () => {
      if (intervalRef.current) window.clearInterval(intervalRef.current);
    };
  }, [open, countdown, setCountdown]);
}
