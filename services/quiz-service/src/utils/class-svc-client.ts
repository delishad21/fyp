import "dotenv/config";

/** ---------- Types returned by class-service helper endpoints ---------- */

// --- types.ts (or wherever you keep these) ---

export type EligibilityByScheduleResult = {
  ok: true;
  allowed: boolean;
  reason?: string;
  message?: string;
  window?: { start: string; end: string };

  attemptsAllowed?: number; // from schedule (default 1, max 10)
  attemptsCount?: number; // number of prior attempts by student
  attemptsRemaining?: number; // max(0, attemptsAllowed - attemptsCount)
  showAnswersAfterAttempt?: boolean; // from schedule (default false)
};

export type IsTeacherResult = {
  ok: boolean;
  isTeacher: boolean;
  message?: string;
};

/** ---------- Config + shared helpers ---------- */

const CLASS_SVC_URL = (process.env.CLASS_SVC_URL || "").replace(/\/+$/, "");
const SECRET =
  process.env.QUIZ_WEBHOOK_SECRET || process.env.CLASS_SHARED_SECRET;
const DEFAULT_TIMEOUT_MS = Number(process.env.CLASS_SVC_TIMEOUT_MS || 10_000);

/** Resolve and validate base URL for class-service */
function baseUrl(): string {
  if (!CLASS_SVC_URL) throw new Error("CLASS_SVC_URL is not set");
  return CLASS_SVC_URL;
}

/** Build default headers (JSON + shared secret) */
function defaultHeaders(json = true): Record<string, string> {
  return {
    ...(json ? { "content-type": "application/json" } : {}),
    ...(SECRET ? { "x-quiz-secret": SECRET } : {}),
  };
}

/** Fetch wrapper with timeout + JSON parse + uniform error surface */
async function svcJson<T>(
  path: string,
  init: RequestInit,
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<T> {
  const url = `${baseUrl()}${path}`;
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);

  try {
    const res = await fetch(url, { ...init, signal: ctl.signal });
    const body = (await res.json().catch(() => ({}))) as any;

    if (!res.ok) {
      const err: any = new Error(
        body?.message || `Class svc error: ${res.status}`
      );
      err.status = res.status;
      err.body = body;
      throw err;
    }
    return body as T;
  } finally {
    clearTimeout(t);
  }
}

/** ---------- Helper endpoints (mounted under /helper on class-service) ---------- */

/**
 * @route  POST {CLASS_SVC_URL}/helper/attempt-eligibility
 * @input  Body: { studentId, classId, scheduleId, quizId, attemptsCount }
 * @output 200 {
 *   ok, allowed, reason?, message?, window?,
 *   attemptsAllowed?, attemptsCount?, attemptsRemaining?, showAnswersAfterAttempt?
 * }
 * @logic  S2S check that a student may start an attempt for a scheduled quiz.
 *         Quiz Service must compute attemptsCount for (studentId, scheduleId)
 *         and include it in the request so Class Service can enforce limits.
 */
export async function checkAttemptEligibilityBySchedule(input: {
  studentId: string;
  classId: string;
  scheduleId: string;
  quizId: string; // sanity cross-check on class svc side
  attemptsCount: number; // NEW: attempts already made by this student for this schedule
}): Promise<EligibilityByScheduleResult> {
  return svcJson<EligibilityByScheduleResult>("/helper/attempt-eligibility", {
    method: "POST",
    headers: defaultHeaders(true),
    body: JSON.stringify(input),
  });
}

/**
 * @route  POST {CLASS_SVC_URL}/helper/check-teacher-of-class
 * @input  Body: { userId, classId }
 * @output 200 { ok, isTeacher, message? }
 * @logic  Server-to-server check that a user is a teacher for the class.
 */
export async function checkTeacherOfClass(input: {
  userId: string;
  classId: string;
}): Promise<IsTeacherResult> {
  const body = await svcJson<Partial<IsTeacherResult>>(
    "/helper/check-teacher-of-class",
    {
      method: "POST",
      headers: defaultHeaders(true),
      body: JSON.stringify(input),
    }
  );

  return {
    ok: body.ok ?? true,
    isTeacher: !!body.isTeacher,
    message: body.message,
  };
}

export async function checkTeacherOfSchedule(input: {
  userId: string;
  scheduleId: string;
}): Promise<IsTeacherResult> {
  const body = await svcJson<Partial<IsTeacherResult>>(
    "/helper/check-teacher-of-schedule",
    {
      method: "POST",
      headers: defaultHeaders(true),
      body: JSON.stringify(input),
    }
  );

  return {
    ok: body.ok ?? true,
    isTeacher: !!body.isTeacher,
    message: body.message,
  };
}

/**
 * @route  POST {CLASS_SVC_URL}/helper/check-teacher-of-student
 * @input  Body: { userId, studentId }
 * @output 200 { ok, isTeacher, message? }
 * @logic  S2S check that a user is a teacher for the student's class.
 */
export async function checkTeacherOfStudent(input: {
  userId: string;
  studentId: string;
}): Promise<IsTeacherResult> {
  const body = await svcJson<Partial<IsTeacherResult>>(
    "/helper/check-teacher-of-student",
    {
      method: "POST",
      headers: defaultHeaders(true),
      body: JSON.stringify(input),
    }
  );

  return {
    ok: body.ok ?? true,
    isTeacher: !!body.isTeacher,
    message: body.message,
  };
}

/** ---------- Internal webhook (outbox publisher target) ---------- */

/**
 * @route  POST {CLASS_SVC_URL}/internal/quiz-events
 * @input  Body: any (event envelope)
 * @output fetch Response (callers don’t need JSON; they just check res.ok)
 * @logic  Fire-and-forget post used by the outbox publisher; timeout applies.
 */
export async function postToClassWebhook(body: any): Promise<Response> {
  const url = `${baseUrl()}/internal/quiz-events`;
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), DEFAULT_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: defaultHeaders(true),
      body: JSON.stringify(body),
      signal: ctl.signal,
    });
    return res as any;
  } finally {
    clearTimeout(t);
  }
}

/** ---------- Other class-service helpers ---------- */

/** Expose the shared secret for S2S consumers (e.g., internal controllers). */
export function sharedSecret(): string {
  if (!SECRET) {
    throw new Error("QUIZ_WEBHOOK_SECRET/CLASS_SHARED_SECRET not set");
  }
  return SECRET;
}

/** Convenience boolean check for header validation in controllers/middleware. */
export function isValidSharedSecret(header?: string | null): boolean {
  return !!SECRET && header === SECRET;
}

/** ---------- Types returned by class-service helper endpoints ---------- */

export type CanShowAnswersReason =
  | "flag_set"
  | "after_end"
  | "before_end"
  | "quiz_mismatch"
  | "invalid_window"
  | "not_found";

export type CanShowAnswersResult = {
  ok: true;
  canShowAnswers: boolean;
  reason?: CanShowAnswersReason;
  classId?: string;
  timezone?: string;
  now?: string;
  schedule?: {
    startDate: string | null; // null if invalid
    endDate: string | null; // null if invalid
    showAnswersAfterAttempt: boolean;
  };
};

/**
 * @route  POST {CLASS_SVC_URL}/helper/can-show-answers
 * @input  Body: {
 *   scheduleId: string(ObjectId),        // required
 *   classId?: string(ObjectId),          // optional; narrows lookup
 *   quizId?: string                      // optional; sanity check
 * }
 * @output 200 { ok, canShowAnswers, reason?, classId?, timezone?, now?, schedule? }
 * @logic  Returns whether a student may see answers for a scheduled quiz:
 *         canShowAnswers = showAnswersAfterAttempt || (now > endDate)
 */
export async function canShowAnswersForSchedule(input: {
  scheduleId: string;
  classId?: string;
  quizId?: string;
}): Promise<CanShowAnswersResult> {
  return svcJson<CanShowAnswersResult>("/helper/can-show-answers", {
    method: "POST",
    headers: defaultHeaders(true),
    body: JSON.stringify(input),
  });
}

// Small helper to query class-service for show-answers decision.
// Falls back to false if scheduleId is missing or the S2S call fails.
export async function shouldShowAnswersForAttempt(
  attempt: any,
  isPrivileged: boolean
): Promise<boolean> {
  if (isPrivileged) return true; // teachers/admins always see
  const scheduleId = attempt?.scheduleId ? String(attempt.scheduleId) : null;
  const classId = attempt?.classId ? String(attempt.classId) : undefined;
  const quizId = attempt?.quizId ? String(attempt.quizId) : undefined;

  if (!scheduleId) return false; // conservative default

  try {
    const res = await canShowAnswersForSchedule({
      scheduleId,
      classId,
      quizId,
    });
    return !!res?.canShowAnswers;
  } catch {
    return false; // network/timeout ⇒ conservative
  }
}
