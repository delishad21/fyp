"use server";

import { quizSvcUrl } from "@/utils/utils";
import { getAuthHeader } from "@/services/user/session-definitions";

/* ---------- Types ---------- */

export interface QuizAttemptQuizMeta {
  quizId: string;
  name: string | null;
  subject: string | null;
  subjectColorHex: string | null;
  topic: string | null;
  quizType: string | null;
  typeColorHex?: string;
  contentHash: string | null;
}

export type AttemptState = "in_progress" | "finalized" | "invalidated";

export interface QuizAttemptDto {
  _id: string;
  quizId: string;
  quizRootId?: string | null;
  quizVersion?: number | null;
  studentId: string;
  classId: string;
  scheduleId: string;
  state: AttemptState;

  // timing + scoring
  startedAt?: string;
  finishedAt?: string | null;
  lastSavedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
  attemptVersion?: number;
  score?: number;
  maxScore?: number;

  // payload-ish
  answers?: Record<string, unknown>;
  breakdown?: unknown;
  quizVersionSnapshot?: unknown; // can be tightened if you share AttemptSpecEnvelope

  // enriched
  answersAvailable: boolean;
  quiz: QuizAttemptQuizMeta;
}

export type QuizAttemptSuccess = {
  ok: true;
  data: QuizAttemptDto;
};

export type QuizAttemptError = {
  ok: false;
  message?: string;
};

export type QuizAttemptResult = QuizAttemptSuccess | QuizAttemptError;

/* ---------- Function ---------- */

export async function getQuizAttempt(
  attemptId: string
): Promise<QuizAttemptResult> {
  try {
    const url = quizSvcUrl(`/attempt/${encodeURIComponent(attemptId)}`);
    const auth = await getAuthHeader();

    const res = await fetch(url, {
      cache: "no-store",
      headers: {
        ...(auth ? { Authorization: auth } : {}),
        "content-type": "application/json",
      },
    });

    // Map common auth-ish errors nicely
    if (res.status === 401) {
      return { ok: false, message: "Unauthorized" };
    }
    if (res.status === 403) {
      return { ok: false, message: "Forbidden" };
    }

    const json: unknown = await res.json().catch(() => null);

    // If the quiz service follows { ok, data/message } contract, pass it through
    if (json && typeof json === "object" && "ok" in json) {
      return json as QuizAttemptSuccess | QuizAttemptError;
    }

    // Fallback on unexpected bodies
    if (!res.ok) {
      return {
        ok: false,
        message: `Failed (${res.status})`,
      };
    }

    // If service returned a raw doc (unexpected), wrap it
    return { ok: true, data: json as QuizAttemptDto };
  } catch (e: any) {
    return { ok: false, message: e?.message || "Network error" };
  }
}
