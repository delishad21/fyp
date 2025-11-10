import type { AttemptDoc, AttemptSpec } from "@/src/api/quiz-service";
import { create } from "zustand";

export type AttemptPayload = {
  spec: AttemptSpec;
  attempt?: AttemptDoc;
};

type State = {
  byAttemptId: Record<string, AttemptPayload>;
  /** Set/overwrite a payload for an attempt id */
  setAttemptPayload: (attemptId: string, payload: AttemptPayload) => void;
  /** Read a payload by attempt id */
  get: (attemptId: string) => AttemptPayload | undefined;
  /** Remove a single attempt’s payload */
  remove: (attemptId: string) => void;
  /** Clear the cache */
  clear: () => void;
};

export const useAttemptCache = create<State>((set, get) => ({
  byAttemptId: {},
  setAttemptPayload: (attemptId, payload) =>
    set((s) => ({
      byAttemptId: { ...s.byAttemptId, [attemptId]: payload },
    })),
  get: (attemptId) => get().byAttemptId[attemptId],
  remove: (attemptId) =>
    set((s) => {
      const next = { ...s.byAttemptId };
      delete next[attemptId];
      return { byAttemptId: next };
    }),
  clear: () => set({ byAttemptId: {} }),
}));
