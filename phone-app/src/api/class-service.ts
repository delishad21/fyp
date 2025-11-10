export type AttemptableRow = {
  classId: string;
  scheduleId: string;
  quizId: string;
  startDate: string;
  endDate: string;
  attemptsAllowed: number;
  showAnswersAfterAttempt: boolean;
  attemptsCount: number;
  attemptsRemaining: number;
  quizName: string | null;
  subject: string | null;
  subjectColor: string | null;
};

export type ProfileData = {
  userId: string;
  displayName: string;
  photoUrl?: string | null;
  className: string;
  rank: number;
  stats: { streakDays: number };
};

export type ProfileResponse = { ok: boolean; data?: ProfileData };

const CLASS_BASE_URL =
  process.env.EXPO_PUBLIC_CLASS_SVC_URL || "http://localhost:7303";

// Generic authorized GET
export async function authedGet<T>(url: string, token: string): Promise<T> {
  const res = await fetch(url, {
    headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
  });
  const isJson = (res.headers.get("content-type") || "").includes(
    "application/json"
  );
  const body = (isJson ? await res.json().catch(() => null) : null) as T | null;
  if (!res.ok) {
    const msg = (body as any)?.message || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return body as T;
}

// API: attemptable schedules
export async function getAttemptables(
  token: string
): Promise<AttemptableRow[]> {
  const data = await authedGet<{ ok: boolean; data: AttemptableRow[] }>(
    `${CLASS_BASE_URL}/students/me/attemptable-schedules`,
    token
  );
  return data.data || [];
}

// API: my profile
export async function getMyProfile(token: string): Promise<ProfileData | null> {
  const data = await authedGet<ProfileResponse>(
    `${CLASS_BASE_URL}/students/me/profile`,
    token
  );
  return data.data || null;
}

// -------- Types for the class-agnostic schedule summary --------
export type ScheduleSummaryCanonical = {
  attemptId: string;
  score: number;
  maxScore: number;
  gradePct: number; // 0..100 (rounded)
};

export type ScheduleSummaryRow = {
  classId: string;
  className: string;
  scheduleId: string;
  quizName: string;
  subject: string | null;
  subjectColorHex: string | null;
  topic: string | null;
  latestAttemptId?: string;
  latestAt?: string; // ISO string
  attemptsCount: number;
  canonical?: ScheduleSummaryCanonical;
};

export type ScheduleSummaryResponse = {
  ok: boolean;
  data?: {
    studentId: string;
    schedules: ScheduleSummaryRow[];
  };
};

// Filters you can pass to the endpoint
export type ScheduleSummaryFilters = {
  /** Case-insensitive substring on quiz name (no regex needed). */
  name?: string;
  /** Exact, case-insensitive match. */
  subject?: string;
  /** Exact, case-insensitive match. */
  topic?: string;
  /** Inclusive lower bound on latestAt (ISO-8601 or Date). */
  latestFrom?: string | Date;
  /** Inclusive upper bound on latestAt (ISO-8601 or Date). */
  latestTo?: string | Date;
};

// Helper: normalize Date | string -> ISO string
function toIso(d?: string | Date): string | undefined {
  if (!d) return undefined;
  try {
    return d instanceof Date ? d.toISOString() : new Date(d).toISOString();
  } catch {
    return undefined; // if invalid, omit from query
  }
}

// Helper: build query string from filters (omit empty/invalid)
function buildQuery(filters?: ScheduleSummaryFilters): string {
  if (!filters) return "";
  const q = new URLSearchParams();
  if (filters.name?.trim()) q.set("name", filters.name.trim());
  if (filters.subject?.trim()) q.set("subject", filters.subject.trim());
  if (filters.topic?.trim()) q.set("topic", filters.topic.trim());

  const fromIso = toIso(filters.latestFrom);
  const toIsoStr = toIso(filters.latestTo);
  if (fromIso) q.set("latestFrom", fromIso);
  if (toIsoStr) q.set("latestTo", toIsoStr);

  const s = q.toString();
  return s ? `?${s}` : "";
}

/**
 * API: class-agnostic schedule summary for the current student.
 * GET {{CLASS_BASE_URL}}/students/me/schedule-summary
 *
 * @param token   session token (Bearer)
 * @param filters optional filters (name/subject/topic/latestFrom/latestTo)
 * @returns       array of schedule summary rows (empty if none)
 */
export async function getMyScheduleSummary(
  token: string,
  filters?: ScheduleSummaryFilters
): Promise<ScheduleSummaryRow[]> {
  const query = buildQuery(filters);
  const resp = await authedGet<ScheduleSummaryResponse>(
    `${CLASS_BASE_URL}/students/me/schedule-summary${query}`,
    token
  );
  return resp.data?.schedules ?? [];
}
