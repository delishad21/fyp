import { QUIZ_TYPES } from "../model/quiz-base-model";
import { QUIZ_TYPE_LABELS, QUIZ_TYPE_COLORS } from "../utils/quiz-constants";

export function buildTypesPayload() {
  return QUIZ_TYPES.map((t) => ({
    label: QUIZ_TYPE_LABELS[t],
    value: t,
    colorHex: QUIZ_TYPE_COLORS[t],
  }));
}

export type MetaDoc = {
  subjects: { label: string; colorHex: string }[];
  topics: { label: string }[];
};

export const norm = (v?: string) => (v ?? "").trim().toLowerCase();
export const sameLabel = (a?: string, b?: string) => norm(a) === norm(b);

export function toPayload(doc: MetaDoc | null) {
  return {
    subjects: doc?.subjects ?? [],
    topics: doc?.topics ?? [],
    types: buildTypesPayload(),
  };
}
