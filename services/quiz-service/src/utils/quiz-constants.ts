/** Global, dev-defined quiz types */
export const QUIZ_TYPES = ["basic", "rapid", "crossword"] as const;
export type QuizTypeKey = (typeof QUIZ_TYPES)[number];

export const QUIZ_TYPE_COLORS: Record<QuizTypeKey, string> = {
  basic: "#22c55e",
  rapid: "#f59e0b",
  crossword: "#3b82f6",
};
export const QUIZ_TYPE_LABELS: Record<QuizTypeKey, string> = {
  basic: "Basic",
  rapid: "Rapid",
  crossword: "Crossword",
};
