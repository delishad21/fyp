/**
 * Custom hook for debounced saving with queue management
 * Ensures saves are serialized and properly debounced
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { saveAnswers, type AnswersPayload } from "@/src/api/quiz-service";

type SaveStatus = "idle" | "saving" | "error";

type UseDebouncedSaveReturn = {
  /** Current save status */
  saving: SaveStatus;
  /** Enqueue a save immediately (bypasses debounce) */
  enqueueSave: () => Promise<void>;
  /** Schedule a debounced save */
  scheduleDebouncedSave: () => void;
  /** Flush any pending saves immediately */
  flushSaves: () => Promise<void>;
};

/**
 * Hook for managing debounced saves with a serialized queue
 * All saves are queued to prevent race conditions
 *
 * @param attemptId - The attempt ID to save answers for
 * @param token - Authentication token
 * @param getAnswersPayload - Function that returns the current answers to save
 * @param debounceMs - Debounce delay in milliseconds (default: 500)
 * @returns Object with saving status and save functions
 *
 * @example
 * const { saving, scheduleDebouncedSave, flushSaves } = useDebouncedSave(
 *   attemptId,
 *   token,
 *   () => answers,
 *   500
 * );
 */
export function useDebouncedSave(
  attemptId: string,
  token: string | null,
  getAnswersPayload: () => AnswersPayload,
  debounceMs: number = 500
): UseDebouncedSaveReturn {
  const [saving, setSaving] = useState<SaveStatus>("idle");
  const saveQueueRef = useRef<Promise<any>>(Promise.resolve());
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const doSaveNow = useCallback(async () => {
    if (!token) return;
    const payload = getAnswersPayload();
    await saveAnswers(token, attemptId, payload);
  }, [token, attemptId, getAnswersPayload]);

  const enqueueSave = useCallback(async () => {
    setSaving("saving");
    saveQueueRef.current = saveQueueRef.current
      .then(doSaveNow)
      .then(() => setSaving("idle"))
      .catch(() => setSaving("error"));

    try {
      await saveQueueRef.current;
    } catch {
      // Error already handled in the chain
    }
  }, [doSaveNow]);

  const scheduleDebouncedSave = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    debounceTimerRef.current = setTimeout(() => {
      void enqueueSave();
    }, debounceMs);
  }, [enqueueSave, debounceMs]);

  const flushSaves = useCallback(async () => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
      await enqueueSave();
    } else {
      await saveQueueRef.current.catch(() => {});
    }
  }, [enqueueSave]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      void flushSaves();
    };
  }, [flushSaves]);

  return {
    saving,
    enqueueSave,
    scheduleDebouncedSave,
    flushSaves,
  };
}
