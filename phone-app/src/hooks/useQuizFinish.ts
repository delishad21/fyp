/**
 * Custom hook for managing quiz finish logic
 * Handles finishing an attempt and navigating to results
 */

import { useCallback, useEffect, useState } from "react";
import { finishAttempt } from "@/src/api/quiz-service";

type UseQuizFinishReturn = {
  /** Whether the quiz is currently being finalized */
  finishing: boolean;
  /** Function to finish the quiz now */
  finishNow: () => Promise<void>;
};

/**
 * Hook for managing quiz finish flow
 * Coordinates flushing saves, calling finishAttempt API, and navigation
 *
 * @param attemptId - The attempt ID to finish
 * @param token - Authentication token
 * @param onFinish - Callback with finalize response (called before navigation)
 * @param flushSaves - Function to flush any pending saves before finishing
 * @param autoFinishWhen - Condition to auto-finish (e.g., remaining === 0)
 * @returns Object with finishing state and finishNow function
 *
 * @example
 * const { finishing, finishNow } = useQuizFinish(
 *   attemptId,
 *   token,
 *   (finalizeRes) => navigateToQuizResults(router, attemptId, spec, finalizeRes),
 *   flushSaves,
 *   remaining === 0
 * );
 */
export function useQuizFinish(
  attemptId: string,
  token: string | null,
  onFinish: (finalizeRes: any | null) => void,
  flushSaves?: () => Promise<void>,
  autoFinishWhen?: boolean
): UseQuizFinishReturn {
  const [finishing, setFinishing] = useState(false);

  const finishNow = useCallback(async () => {
    if (finishing) return;
    setFinishing(true);

    try {
      // Flush any pending saves first
      if (flushSaves) {
        await flushSaves();
      }

      // Call the finishAttempt API
      let finalizeRes: any = null;
      if (token) {
        finalizeRes = await finishAttempt(token, attemptId).catch(() => null);
      }

      // Call the finish callback (typically navigation)
      onFinish(finalizeRes);
    } catch (error) {
      // Even on error, try to navigate
      onFinish(null);
    }
  }, [finishing, attemptId, token, onFinish, flushSaves]);

  // Auto-finish when condition is met (e.g., timer runs out)
  useEffect(() => {
    if (autoFinishWhen && !finishing) {
      void finishNow();
    }
  }, [autoFinishWhen, finishing, finishNow]);

  return {
    finishing,
    finishNow,
  };
}
