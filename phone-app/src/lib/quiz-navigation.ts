/**
 * Navigation utilities for quiz flows
 */

import { AttemptSpec } from "@/src/api/quiz-service";
import { Router } from "expo-router";

/**
 * Navigates to the quiz results screen with the finalized attempt data
 *
 */
export function navigateToQuizResults(
  router: Router,
  attemptId: string,
  spec: AttemptSpec,
  finalizeRes: any | null
): void {
  const answersAvailable = finalizeRes?.answersAvailable;
  const score = Number(finalizeRes?.score ?? 0);
  const maxScore = Number(finalizeRes?.maxScore ?? 0);
  const scheduleId = finalizeRes?.scheduleId ?? "";

  router.replace({
    pathname: "/(main)/quiz/results",
    params: {
      attemptId,
      scheduleId,
      score: String(Number.isFinite(score) ? score : 0),
      maxScore: String(Number.isFinite(maxScore) ? maxScore : 0),
      quizName: spec.meta?.name ?? "Quiz Results",
      answerAvailable: String(!!answersAvailable),
    },
  });
}
