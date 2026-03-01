"use server";

import { getAuthHeader } from "@/services/user/session-definitions";
import { classSvcUrl } from "@/utils/utils";

export type CanonicalAttemptRow = {
  attemptId: string;
  studentId: string;
  displayName: string;
  photoUrl?: string | null;
  score: number;
  maxScore: number;
  pct: number; // 0..100
  finishedAt: string | null; // ISO
};

export type ScheduleStats = {
  // From quiz-svc (may be absent for "none")
  kind?: "basic" | "rapid" | "crossword" | "none";
  attemptsCount?: number;
  breakdown?: any;

  // Class-level aggregates
  participants?: number;
  totalStudents?: number;
  participationPct?: number;

  // Score aggregates
  sumScore?: number;
  sumMax?: number;
  avgPct?: number;

  // Absolute per-participant avg
  avgAbsScore?: number;
  avgAbsMax?: number;
};

export type ScheduleItemWithMeta = {
  _id: string;

  // concrete + canonical quiz identity
  quizId: string;
  quizRootId: string;
  quizVersion: number;
  quizVersions: number[];

  startDate: string;
  endDate: string;
  contribution?: number;

  quizName?: string;
  subject?: string;
  subjectColor?: string;
  quizType?:
    | "basic"
    | "rapid"
    | "crossword"
    | "true-false"
    | "rapid-arithmetic"
    | "crossword-bank"
    | string;
  topic?: string;
  typeColorHex?: string;

  // policy
  attemptsAllowed: number;
  showAnswersAfterAttempt: boolean;

  timezone?: string;

  canonicalAttemptIds: string[];
  canonicalAttempts: CanonicalAttemptRow[];
  stats: ScheduleStats;
};

type ApiSuccess = { ok: true; data: ScheduleItemWithMeta };
type ApiError = { ok: false; message?: string };

export async function getScheduleItemAction(
  classId: string,
  scheduleId: string,
  opts?: { openAnswerMinPct?: number }
): Promise<ApiSuccess | ApiError> {
  const auth = await getAuthHeader();
  if (!auth) return { ok: false, message: "Not authenticated" };

  const params = new URLSearchParams();
  if (typeof opts?.openAnswerMinPct === "number") {
    params.set("openAnswerMinPct", String(opts.openAnswerMinPct));
  }

  const url = classSvcUrl(
    `/classes/${encodeURIComponent(classId)}/schedule/item/${encodeURIComponent(
      scheduleId
    )}${params.toString() ? "?" + params.toString() : ""}`
  );

  const res = await fetch(url, {
    method: "GET",
    headers: { Authorization: auth, Accept: "application/json" },
    cache: "no-store",
  });

  const isJson = (res.headers.get("content-type") || "").includes(
    "application/json"
  );
  const json = isJson ? await res.json().catch(() => null) : null;

  if (!res.ok || !json?.ok || !json.data) {
    const message =
      (json && (json.message || json.error)) ||
      (res.status === 401 || res.status === 403
        ? "Authentication failed"
        : "Failed to load schedule");
    return { ok: false, message };
  }

  return { ok: true, data: json.data as ScheduleItemWithMeta };
}
