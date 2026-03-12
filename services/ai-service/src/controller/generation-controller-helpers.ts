import {
  IJobAnalytics,
  IPlanningPassAnalytics,
  IQuizAttemptAnalytics,
} from "../models/generation-job-model";
import { CustomRequest } from "../middleware/auth";
import { GenerationDocumentType } from "../services/document-context-builder";

const QUIZ_TYPES = ["basic", "rapid", "crossword", "true-false"] as const;
type AllowedQuizType = (typeof QUIZ_TYPES)[number];
const DOCUMENT_TYPES: GenerationDocumentType[] = [
  "syllabus",
  "question-bank",
  "subject-content",
  "other",
];

export function normalizeIncomingDocumentType(
  value?: string
): GenerationDocumentType {
  const normalized = String(value || "").trim().toLowerCase();
  if (
    normalized === "syllabus" ||
    normalized === "question-bank" ||
    normalized === "subject-content"
  ) {
    return normalized;
  }
  return "other";
}

export function parseRequestedDocumentTypes(
  raw: unknown
): GenerationDocumentType[] {
  if (Array.isArray(raw)) {
    return raw.map((entry) => normalizeIncomingDocumentType(String(entry)));
  }

  if (typeof raw !== "string") {
    return [];
  }

  const trimmed = raw.trim();
  if (!trimmed) return [];

  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed.map((entry) =>
          normalizeIncomingDocumentType(String(entry))
        );
      }
    } catch {
      // Fall through to comma/single parsing.
    }
  }

  if (trimmed.includes(",")) {
    return trimmed
      .split(",")
      .map((s) => normalizeIncomingDocumentType(s))
      .filter((s) => DOCUMENT_TYPES.includes(s));
  }

  return [normalizeIncomingDocumentType(trimmed)];
}

function normalizeIncomingQuizType(value?: string): AllowedQuizType | null {
  const normalized = String(value || "").trim().toLowerCase();
  return (QUIZ_TYPES as readonly string[]).includes(normalized)
    ? (normalized as AllowedQuizType)
    : null;
}

export function parseRequestedQuizTypes(raw: unknown): AllowedQuizType[] {
  const parsed: string[] = [];

  if (Array.isArray(raw)) {
    for (const entry of raw) parsed.push(String(entry));
  } else if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return [];

    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      try {
        const json = JSON.parse(trimmed);
        if (Array.isArray(json)) {
          for (const entry of json) parsed.push(String(entry));
        } else {
          parsed.push(trimmed);
        }
      } catch {
        parsed.push(trimmed);
      }
    } else if (trimmed.includes(",")) {
      parsed.push(...trimmed.split(","));
    } else {
      parsed.push(trimmed);
    }
  }

  const dedup = new Set<AllowedQuizType>();
  for (const entry of parsed) {
    const normalized = normalizeIncomingQuizType(entry);
    if (normalized) dedup.add(normalized);
  }

  return Array.from(dedup);
}

export function toDocumentMetaList(value: unknown): Array<{
  documentType?: string;
  filename: string;
  originalName: string;
  size: number;
  mimetype: string;
  storagePath: string;
  uploadedAt?: Date;
}> {
  if (Array.isArray(value)) {
    return value as Array<{
      documentType?: string;
      filename: string;
      originalName: string;
      size: number;
      mimetype: string;
      storagePath: string;
      uploadedAt?: Date;
    }>;
  }

  if (value && typeof value === "object") {
    return [
      value as {
        documentType?: string;
        filename: string;
        originalName: string;
        size: number;
        mimetype: string;
        storagePath: string;
        uploadedAt?: Date;
      },
    ];
  }

  return [];
}

export function buildGenerationAnalytics(
  progressQuizzes: Array<{
    analytics?: {
      attempts?: IQuizAttemptAnalytics[];
    };
  }>,
  planning?: IPlanningPassAnalytics
): IJobAnalytics {
  const attempts = progressQuizzes.flatMap((q) =>
    Array.isArray(q.analytics?.attempts) ? q.analytics.attempts : []
  );

  const planningAttemptCount =
    typeof planning?.attemptCount === "number"
      ? planning.attemptCount
      : planning
        ? 1
        : 0;
  const planningSuccessfulAttempts =
    typeof planning?.successfulAttempts === "number"
      ? planning.successfulAttempts
      : planning?.success
        ? 1
        : 0;
  const planningLatencyMs =
    typeof planning?.llmLatencyMs === "number" ? planning.llmLatencyMs : 0;
  const planningInputTokens =
    typeof planning?.usage?.inputTokens === "number"
      ? planning.usage.inputTokens
      : 0;
  const planningOutputTokens =
    typeof planning?.usage?.outputTokens === "number"
      ? planning.usage.outputTokens
      : 0;
  const planningTotalTokens =
    typeof planning?.usage?.totalTokens === "number"
      ? planning.usage.totalTokens
      : 0;

  const totals = {
    attemptCount: attempts.length + planningAttemptCount,
    successfulAttempts:
      attempts.filter((a) => a.success).length + planningSuccessfulAttempts,
    llmLatencyMs:
      attempts.reduce((sum, a) => sum + (a.llmLatencyMs || 0), 0) +
      planningLatencyMs,
    inputTokens:
      attempts.reduce((sum, a) => sum + (a.usage?.inputTokens || 0), 0) +
      planningInputTokens,
    outputTokens:
      attempts.reduce((sum, a) => sum + (a.usage?.outputTokens || 0), 0) +
      planningOutputTokens,
    totalTokens:
      attempts.reduce((sum, a) => sum + (a.usage?.totalTokens || 0), 0) +
      planningTotalTokens,
    retryCount: 0,
  };
  totals.retryCount = Math.max(0, totals.attemptCount - totals.successfulAttempts);

  const grouped = new Map<
    string,
    {
      provider: "openai" | "anthropic" | "gemini";
      model: string;
      attemptCount: number;
      successfulAttempts: number;
      llmLatencyMs: number;
      inputTokens: number;
      outputTokens: number;
      totalTokens: number;
    }
  >();

  for (const attempt of attempts) {
    const key = `${attempt.provider}:${attempt.model}`;
    const existing = grouped.get(key) || {
      provider: attempt.provider,
      model: attempt.model,
      attemptCount: 0,
      successfulAttempts: 0,
      llmLatencyMs: 0,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
    };

    existing.attemptCount += 1;
    if (attempt.success) existing.successfulAttempts += 1;
    existing.llmLatencyMs += attempt.llmLatencyMs || 0;
    existing.inputTokens += attempt.usage?.inputTokens || 0;
    existing.outputTokens += attempt.usage?.outputTokens || 0;
    existing.totalTokens += attempt.usage?.totalTokens || 0;

    grouped.set(key, existing);
  }

  if (
    planning &&
    planning.provider &&
    planning.model &&
    planningAttemptCount > 0
  ) {
    const key = `${planning.provider}:${planning.model}`;
    const existing = grouped.get(key) || {
      provider: planning.provider,
      model: planning.model,
      attemptCount: 0,
      successfulAttempts: 0,
      llmLatencyMs: 0,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
    };
    existing.attemptCount += planningAttemptCount;
    existing.successfulAttempts += planningSuccessfulAttempts;
    existing.llmLatencyMs += planningLatencyMs;
    existing.inputTokens += planningInputTokens;
    existing.outputTokens += planningOutputTokens;
    existing.totalTokens += planningTotalTokens;
    grouped.set(key, existing);
  }
  const byProviderModel = Array.from(grouped.values());

  return {
    totals,
    byProviderModel,
    generatedAt: new Date(),
    ...(planning ? { planning } : {}),
  };
}

export function canReadAnalytics(
  req: CustomRequest,
  analyticsSecret: string
): boolean {
  if (!analyticsSecret) return false;
  const provided = req.query.analyticsSecret;
  if (typeof provided !== "string") return false;
  return provided.trim().length > 0 && provided.trim() === analyticsSecret;
}

function stripEstimatedCostFields<T>(value: T): T {
  if (!value || typeof value !== "object") return value;

  const visit = (node: any) => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (Object.prototype.hasOwnProperty.call(node, "estimatedCostUsd")) {
      delete node.estimatedCostUsd;
    }
    for (const child of Object.values(node)) {
      visit(child);
    }
  };

  const cloned = JSON.parse(JSON.stringify(value));
  visit(cloned);
  return cloned as T;
}

export function sanitizeProgressForResponse(
  progress: any,
  includeAnalytics: boolean
) {
  if (!progress) return progress;
  const sanitized =
    typeof progress.toObject === "function" ? progress.toObject() : { ...progress };

  if (Array.isArray(sanitized.quizzes)) {
    sanitized.quizzes = sanitized.quizzes.map((quiz: any) => {
      const q = typeof quiz?.toObject === "function" ? quiz.toObject() : { ...quiz };
      if (!includeAnalytics) {
        delete q.analytics;
      } else if (q.analytics) {
        q.analytics = stripEstimatedCostFields(q.analytics);
      }
      return q;
    });
  }

  return sanitized;
}

export function sanitizeResultsForResponse(
  results: any,
  includeAnalytics: boolean
) {
  if (!results) return results;
  const sanitized =
    typeof results.toObject === "function" ? results.toObject() : { ...results };

  if (Array.isArray(sanitized.quizzes)) {
    sanitized.quizzes = sanitized.quizzes.map((quiz: any) => {
      const q = typeof quiz?.toObject === "function" ? quiz.toObject() : { ...quiz };
      if (!includeAnalytics) {
        delete q.analytics;
      } else if (q.analytics) {
        q.analytics = stripEstimatedCostFields(q.analytics);
      }
      return q;
    });
  }

  return sanitized;
}

export function sanitizeJobForResponse(
  job: any,
  includeAnalytics: boolean,
  options?: { idAsString?: boolean }
) {
  const id = options?.idAsString ? job._id.toString() : job._id;
  const base: any = {
    id,
    status: job.status,
    progress: sanitizeProgressForResponse(job.progress, includeAnalytics),
    config: job.config,
    results: sanitizeResultsForResponse(job.results, includeAnalytics),
    error: job.error,
    createdAt: job.createdAt,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
  };

  if (includeAnalytics) {
    base.analytics = job.analytics ? stripEstimatedCostFields(job.analytics) : null;
  }

  return base;
}
