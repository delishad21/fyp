"use server";

import { getAuthHeader } from "@/services/user/session-definitions";
import { quizSvcUrl } from "@/utils/utils";
import type { QuizType } from "@/services/quiz/types/quizTypes";
import { normalizeHex } from "./quiz-action-helpers";

const EMPTY_COLORS: Record<QuizType, string> = {
  basic: "",
  crossword: "",
  rapid: "",
  "rapid-arithmetic": "",
  "crossword-bank": "",
  "true-false": "",
  "ai-generated": "",
};

export async function getQuizTypeColors(): Promise<Record<QuizType, string>> {
  const auth = await getAuthHeader();
  if (!auth) return EMPTY_COLORS;

  try {
    const res = await fetch(quizSvcUrl("/quiz/type-colors"), {
      method: "GET",
      headers: { Authorization: auth },
      cache: "no-store",
    });
    if (!res.ok) return EMPTY_COLORS;

    const json = await res.json().catch(() => ({}) as any);
    const colors = (json?.colors || {}) as Partial<Record<QuizType, string>>;

    console.log("Fetched quiz type colors:", colors);
    return {
      basic: normalizeHex(colors.basic) ?? "",
      crossword: normalizeHex(colors.crossword) ?? "",
      rapid: normalizeHex(colors.rapid) ?? "",
      "rapid-arithmetic": normalizeHex(colors["rapid-arithmetic"]) ?? "",
      "crossword-bank": normalizeHex(colors["crossword-bank"]) ?? "",
      "true-false": normalizeHex(colors["true-false"]) ?? "",
      "ai-generated": normalizeHex(colors["ai-generated"]) ?? "",
    };
  } catch {
    return EMPTY_COLORS;
  }
}
