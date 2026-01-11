/**
 * Custom hook for managing quiz timers
 * Handles both global quiz timers and per-question timers
 * Automatically handles app backgrounding/foregrounding
 */

import { useEffect, useState } from "react";
import { AppState, AppStateStatus } from "react-native";
import { useInterval } from "./useInterval";
import { type AttemptDoc } from "@/src/api/quiz-service";

type UseQuizTimerReturn = {
  /** Remaining time in seconds (null if no timer) */
  remaining: number | null;
  /** Percentage remaining (0-1, null if no timer) */
  percent: number | null;
};

/**
 * Hook for managing quiz timers with background/foreground handling
 * Recomputes time based on wall-clock when app becomes active
 *
 * @param timeLimit - Total time limit in seconds (null for no timer)
 * @param attempt - Attempt document (contains startedAt timestamp)
 * @returns Object with remaining time and percent
 *
 * @example
 * // For global quiz timer:
 * const { remaining, percent } = useQuizTimer(
 *   spec.renderSpec.totalTimeLimit,
 *   attempt
 * );
 */
export function useQuizTimer(
  timeLimit: number | null | undefined,
  attempt?: AttemptDoc
): UseQuizTimerReturn {
  const totalLimit = timeLimit ?? null;

  // Compute initial remaining time
  const [remaining, setRemaining] = useState<number | null>(() => {
    if (typeof totalLimit === "number" && totalLimit > 0) {
      const startedMs = attempt?.startedAt
        ? new Date(attempt.startedAt).getTime()
        : Date.now();
      const elapsedSec = attempt?.startedAt
        ? Math.floor((Date.now() - startedMs) / 1000)
        : 0;
      return Math.max(0, totalLimit - elapsedSec);
    }
    return null;
  });

  // Recompute remaining time when app becomes active (handles backgrounding)
  useEffect(() => {
    if (!(typeof totalLimit === "number" && totalLimit > 0)) return;

    const startedMs = attempt?.startedAt
      ? new Date(attempt.startedAt).getTime()
      : Date.now();

    const recompute = () => {
      const elapsedSec = Math.floor((Date.now() - startedMs) / 1000);
      setRemaining(Math.max(0, totalLimit - elapsedSec));
    };

    recompute(); // Initial computation

    const subscription = AppState.addEventListener(
      "change",
      (state: AppStateStatus) => {
        if (state === "active") recompute();
      }
    );

    return () => subscription.remove();
  }, [attempt?.startedAt, totalLimit]);

  // Tick timer down every second
  useInterval(
    () => {
      setRemaining((r) => {
        if (r === null) return null;
        const next = r - 1;
        return next >= 0 ? next : 0;
      });
    },
    remaining === null || remaining <= 0 ? null : 1000
  );

  // Calculate percentage remaining
  const percent =
    remaining !== null && typeof totalLimit === "number" && totalLimit > 0
      ? Math.max(0, Math.min(1, remaining / totalLimit))
      : null;

  return { remaining, percent };
}
