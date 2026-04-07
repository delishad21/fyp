import type { DocumentType, GenerationJob, Metrics } from "./types";
import { estimateUsageCostUsd } from "./pricing";

export function parseMaybeJson(text: string): any {
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { ok: false, message: `Non-JSON response: ${text.slice(0, 300)}` };
  }
}

export function normalizeAuth(token: string): string {
  const trimmed = token.trim();
  if (!trimmed) return "";
  return trimmed.toLowerCase().startsWith("bearer ")
    ? trimmed
    : `Bearer ${trimmed}`;
}

export function guessDocumentType(file: File): DocumentType {
  const name = file.name.toLowerCase();
  if (name.includes("syllabus") || name.includes("curriculum")) {
    return "syllabus";
  }
  if (
    name.includes("past") ||
    name.includes("paper") ||
    name.includes("question") ||
    name.includes("worksheet") ||
    name.includes("exam") ||
    name.includes("test")
  ) {
    return "question-bank";
  }
  if (
    name.includes("textbook") ||
    name.includes("lesson") ||
    name.includes("chapter") ||
    name.includes("notes") ||
    name.includes("content")
  ) {
    return "subject-content";
  }
  return "other";
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(2)} MB`;
}

export function isTruthy(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  if (typeof value === "string") {
    const v = value.trim().toLowerCase();
    return v === "true" || v === "1" || v === "yes";
  }
  return false;
}

export function computeMetrics(
  job: GenerationJob | null,
  runStartedAt: number | null,
): Metrics | null {
  if (!job || !job.results) return null;

  const quizzes = Array.isArray(job.results.quizzes) ? job.results.quizzes : [];
  const expected = job.results.total || job.progress.total || quizzes.length;
  const successful = job.results.successful ?? quizzes.length;

  let retryCount = 0;
  let generationEstimatedCostUsd = 0;
  let generationHasPricedCalls = false;
  let hasUnpricedCalls = false;
  for (const quiz of quizzes) {
    if (
      Array.isArray(quiz.analytics?.attempts) &&
      quiz.analytics?.attempts.length
    ) {
      retryCount += Math.max(0, quiz.analytics.attempts.length - 1);
      for (const attempt of quiz.analytics.attempts) {
        const usage = attempt?.usage;
        const inputTokens = Number(usage?.inputTokens || 0);
        const outputTokens = Number(usage?.outputTokens || 0);
        const totalTokens = Number(usage?.totalTokens || 0);
        const hasTokenUsage = inputTokens > 0 || outputTokens > 0 || totalTokens > 0;
        if (!hasTokenUsage) continue;

        const provider = String(attempt?.provider || "").trim();
        const model = String(attempt?.model || "").trim();
        if (!provider || !model) {
          hasUnpricedCalls = true;
          continue;
        }

        const estimated = estimateUsageCostUsd({
          provider,
          model,
          usage: {
            inputTokens,
            outputTokens,
          },
        });

        if (!estimated) {
          hasUnpricedCalls = true;
          continue;
        }

        generationEstimatedCostUsd += estimated.estimatedUsd;
        generationHasPricedCalls = true;
      }
    } else {
      retryCount += Math.max(0, Number(quiz.retryCount || 0));
    }
  }

  const planningLatencyMs =
    typeof job.analytics?.planning?.llmLatencyMs === "number"
      ? job.analytics.planning.llmLatencyMs
      : null;

  const totalLlmLatencyMs =
    typeof job.analytics?.totals?.llmLatencyMs === "number"
      ? job.analytics.totals.llmLatencyMs
      : null;

  const generationLatencyMs =
    totalLlmLatencyMs !== null &&
    planningLatencyMs !== null &&
    totalLlmLatencyMs >= planningLatencyMs
      ? Math.max(0, totalLlmLatencyMs - planningLatencyMs)
      : totalLlmLatencyMs;

  const planningFallbackUsed =
    typeof job.analytics?.planning?.fallbackUsed === "boolean"
      ? job.analytics.planning.fallbackUsed
      : null;

  const planningSuccess =
    typeof job.analytics?.planning?.success === "boolean"
      ? job.analytics.planning.success
      : null;

  const planningPlanItemCount =
    typeof job.analytics?.planning?.planItemCount === "number"
      ? job.analytics.planning.planItemCount
      : null;

  const planningInputTokens =
    typeof job.analytics?.planning?.usage?.inputTokens === "number"
      ? job.analytics.planning.usage.inputTokens
      : null;

  const planningOutputTokens =
    typeof job.analytics?.planning?.usage?.outputTokens === "number"
      ? job.analytics.planning.usage.outputTokens
      : null;

  const planningTotalTokens =
    typeof job.analytics?.planning?.usage?.totalTokens === "number"
      ? job.analytics.planning.usage.totalTokens
      : null;

  const planningAttemptCount =
    typeof job.analytics?.planning?.attemptCount === "number"
      ? job.analytics.planning.attemptCount
      : null;

  const planningSuccessfulAttempts =
    typeof job.analytics?.planning?.successfulAttempts === "number"
      ? job.analytics.planning.successfulAttempts
      : null;

  let planningEstimatedCostUsd: number | null = null;
  const planningProvider = String(job.analytics?.planning?.provider || "").trim();
  const planningModel = String(job.analytics?.planning?.model || "").trim();
  const planningInput = Number(job.analytics?.planning?.usage?.inputTokens || 0);
  const planningOutput = Number(job.analytics?.planning?.usage?.outputTokens || 0);
  const planningHasTokenUsage =
    planningInput > 0 ||
    planningOutput > 0 ||
    Number(job.analytics?.planning?.usage?.totalTokens || 0) > 0;

  if (planningHasTokenUsage) {
    if (!planningProvider || !planningModel) {
      hasUnpricedCalls = true;
    } else {
      const estimatedPlanning = estimateUsageCostUsd({
        provider: planningProvider,
        model: planningModel,
        usage: {
          inputTokens: planningInput,
          outputTokens: planningOutput,
        },
      });
      if (estimatedPlanning) {
        planningEstimatedCostUsd = estimatedPlanning.estimatedUsd;
      } else {
        hasUnpricedCalls = true;
      }
    }
  }

  const totalAttemptCount =
    typeof job.analytics?.totals?.attemptCount === "number"
      ? job.analytics.totals.attemptCount
      : null;

  const totalSuccessfulAttempts =
    typeof job.analytics?.totals?.successfulAttempts === "number"
      ? job.analytics.totals.successfulAttempts
      : null;

  const totalInputTokens =
    typeof job.analytics?.totals?.inputTokens === "number"
      ? job.analytics.totals.inputTokens
      : null;

  const totalOutputTokens =
    typeof job.analytics?.totals?.outputTokens === "number"
      ? job.analytics.totals.outputTokens
      : null;

  const totalTokens =
    typeof job.analytics?.totals?.totalTokens === "number"
      ? job.analytics.totals.totalTokens
      : null;

  const generationAttemptCount =
    totalAttemptCount !== null &&
    planningAttemptCount !== null &&
    totalAttemptCount >= planningAttemptCount
      ? Math.max(0, totalAttemptCount - planningAttemptCount)
      : totalAttemptCount;

  const generationSuccessfulAttempts =
    totalSuccessfulAttempts !== null &&
    planningSuccessfulAttempts !== null &&
    totalSuccessfulAttempts >= planningSuccessfulAttempts
      ? Math.max(0, totalSuccessfulAttempts - planningSuccessfulAttempts)
      : totalSuccessfulAttempts;

  const generationInputTokens =
    totalInputTokens !== null &&
    planningInputTokens !== null &&
    totalInputTokens >= planningInputTokens
      ? Math.max(0, totalInputTokens - planningInputTokens)
      : totalInputTokens;

  const generationOutputTokens =
    totalOutputTokens !== null &&
    planningOutputTokens !== null &&
    totalOutputTokens >= planningOutputTokens
      ? Math.max(0, totalOutputTokens - planningOutputTokens)
      : totalOutputTokens;

  const generationTotalTokens =
    totalTokens !== null &&
    planningTotalTokens !== null &&
    totalTokens >= planningTotalTokens
      ? Math.max(0, totalTokens - planningTotalTokens)
      : totalTokens;

  const overallTotalTokens =
    totalTokens !== null
      ? totalTokens
      : planningTotalTokens !== null && generationTotalTokens !== null
        ? planningTotalTokens + generationTotalTokens
        : generationTotalTokens !== null
          ? generationTotalTokens
          : planningTotalTokens;

  const generationEstimatedCostNormalized = generationHasPricedCalls
    ? generationEstimatedCostUsd
    : null;
  const overallEstimatedCostUsd =
    generationEstimatedCostNormalized !== null || planningEstimatedCostUsd !== null
      ? (generationEstimatedCostNormalized || 0) + (planningEstimatedCostUsd || 0)
      : null;

  const wallClockMs =
    runStartedAt && job.status === "completed"
      ? Date.now() - runStartedAt
      : null;

  const normalizedRetryCount =
    generationAttemptCount !== null && generationSuccessfulAttempts !== null
      ? Math.max(0, generationAttemptCount - generationSuccessfulAttempts)
      : retryCount;

  return {
    completionRate: expected > 0 ? (successful / expected) * 100 : 0,
    planningLatencyMs,
    generationLatencyMs,
    totalLlmLatencyMs,
    planningFallbackUsed,
    planningSuccess,
    planningPlanItemCount,
    planningInputTokens,
    planningOutputTokens,
    planningTotalTokens,
    overallTotalTokens,
    generationAttemptCount,
    generationSuccessfulAttempts,
    generationInputTokens,
    generationOutputTokens,
    generationTotalTokens,
    planningEstimatedCostUsd,
    generationEstimatedCostUsd: generationEstimatedCostNormalized,
    overallEstimatedCostUsd,
    hasUnpricedCalls,
    retryCount: normalizedRetryCount,
    wallClockMs,
  };
}
