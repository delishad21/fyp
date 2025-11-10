"use server";

import { getAuthHeader } from "@/services/user/session-definitions";
import { classSvcUrl, quizSvcUrl } from "@/utils/utils";

/** ---- Types ---- */

export type CanonicalBySchedule = Record<
  string,
  {
    attemptId: string; // should be non-empty once you store it
    score: number;
    maxScore: number;
    finishedAt: string | Date;
    subject?: string;
    topic?: string;
  }
>;

export type StatsBucket = {
  sumScore: number;
  sumMax: number;
  attempts: number;
};

export type StudentStats = {
  classId: string;
  studentId: string;

  sumScore: number;
  sumMax: number;
  participationCount: number;

  participationPct?: number; // 0..100
  avgScorePct?: number; // 0..100

  streakDays: number;
  bestStreakDays?: number; // NEW
  lastStreakDate?: string | Date | null;
  overallScore: number;

  canonicalBySchedule?: CanonicalBySchedule;
  attendanceDays?: Record<string, boolean>;

  bySubject?: Record<string, StatsBucket>;
  byTopic?: Record<string, StatsBucket>;

  subjectsAvgPct?: Record<string, number>;
  topicsAvgPct?: Record<string, number>;

  version: number;
  updatedAt: string | Date;
};

export type StudentInClass = {
  userId: string;
  displayName: string;
  photoUrl?: string;
  className?: string;
  rank?: number;
  stats?: StudentStats | null; // includes streakDays, bestStreakDays, lastStreakDate
};

export type GetStudentInClassResult = {
  ok: boolean;
  data?: StudentInClass;
  message?: string;
};

/** ---- Action ---- */

export async function getStudentInClass(
  classId: string,
  studentId: string
): Promise<GetStudentInClassResult> {
  const auth = await getAuthHeader();
  if (!auth) return { ok: false, message: "Not authenticated" };

  try {
    const url = classSvcUrl(
      `/classes/${encodeURIComponent(classId)}/students/${encodeURIComponent(
        studentId
      )}`
    );

    const resp = await fetch(url, {
      method: "GET",
      headers: { Authorization: auth, Accept: "application/json" },
      cache: "no-store",
    });

    const isJson = (resp.headers.get("content-type") || "").includes(
      "application/json"
    );
    const json = isJson ? await resp.json().catch(() => null) : null;

    if (!resp.ok || !json?.ok || !json.data) {
      if (resp.status === 404) {
        return {
          ok: false,
          message: json?.message ?? "Student not found in class",
        };
      }
      return {
        ok: false,
        message:
          json?.message ??
          (resp.status === 401 || resp.status === 403
            ? "Authentication failed"
            : "Failed to load student"),
      };
    }

    // Payload already shaped by class-svc; pass through strongly-typed.
    const data = json.data as StudentInClass;
    return { ok: true, data };
  } catch (e: any) {
    return { ok: false, message: e?.message ?? "Network error" };
  }
}

export type AttemptRow = {
  _id: string;
  quizId: string;
  studentId: string;
  scheduleId?: string;
  classId: string;
  state: string;
  startedAt?: string;
  lastSavedAt?: string;
  finishedAt?: string;
  createdAt?: string;
  updatedAt?: string;
  attemptVersion: number;
  score?: number;
  maxScore?: number;
  quiz: {
    quizId: string;
    name?: string;
    subject?: string;
    subjectColorHex?: string;
    topic?: string;
    quizType?: string;
    contentHash?: string;
  };
};
export type AttemptsResp = {
  ok: boolean;
  rows: AttemptRow[];
  page: number;
  pageCount: number;
  total: number;
  message?: string;
};
export async function getStudentAttempts(
  studentId: string,
  page: number = 1,
  pageSize: number = 10
): Promise<AttemptsResp> {
  const auth = await getAuthHeader();
  if (!auth)
    return {
      ok: false,
      rows: [],
      page: 1,
      pageCount: 1,
      total: 0,
      message: "Not authenticated",
    };
  const url = new URL(
    quizSvcUrl(`/attempt/student/${encodeURIComponent(studentId)}`)
  );
  url.searchParams.set("page", String(page));
  url.searchParams.set("pageSize", String(pageSize));
  const resp = await fetch(url.toString(), {
    method: "GET",
    headers: { Authorization: auth, Accept: "application/json" },
    cache: "no-store",
  });
  const json = await resp.json().catch(() => ({ ok: false }));
  if (!resp.ok || !json?.ok) {
    return {
      ok: false,
      rows: [],
      page: 1,
      pageCount: 1,
      total: 0,
      message: json?.message ?? "Failed to load attempts",
    };
  }
  return json as AttemptsResp;
}

export type ScheduleCanonical = {
  attemptId: string;
  score: number;
  maxScore: number;
  gradePct: number; // 0..100
};

export type ScheduleSummaryRow = {
  scheduleId: string;
  quizName: string;
  subject: string | null;
  subjectColorHex: string | null;
  latestAttemptId?: string;
  latestAt?: string; // ISO string
  attemptsCount: number;
  canonical?: ScheduleCanonical;
};

export type GetStudentScheduleSummaryResult = {
  ok: boolean;
  data?: {
    classId: string;
    studentId: string;
    schedules: ScheduleSummaryRow[];
  };
  message?: string;
};

/** ---- Action: fetch schedule-level summary for a student in a class ---- */
export async function getStudentScheduleSummary(
  classId: string,
  studentId: string
): Promise<GetStudentScheduleSummaryResult> {
  const auth = await getAuthHeader();
  if (!auth) return { ok: false, message: "Not authenticated" };

  try {
    const url = classSvcUrl(
      `/classes/${encodeURIComponent(classId)}/students/${encodeURIComponent(
        studentId
      )}/schedule-summary`
    );

    const resp = await fetch(url, {
      method: "GET",
      headers: { Authorization: auth, Accept: "application/json" },
      cache: "no-store",
    });

    const isJson = (resp.headers.get("content-type") || "").includes(
      "application/json"
    );
    const json = isJson ? await resp.json().catch(() => null) : null;

    if (!resp.ok || !json?.ok || !json.data) {
      return {
        ok: false,
        message:
          json?.message ??
          (resp.status === 401 || resp.status === 403
            ? "Authentication failed"
            : resp.status === 404
            ? "Student not found in class"
            : "Failed to load schedule summary"),
      };
    }

    return json as GetStudentScheduleSummaryResult;
  } catch (e: any) {
    return { ok: false, message: e?.message ?? "Network error" };
  }
}

export type AttemptsForScheduleResp = {
  ok: boolean;
  rows: AttemptRow[];
  message?: string;
};

/**
 * Calls: GET /attempt/schedule/:scheduleId/student/:studentId
 */
export async function getAttemptsForScheduleByStudent(
  scheduleId: string,
  studentId: string
): Promise<AttemptsForScheduleResp> {
  const auth = await getAuthHeader();
  if (!auth) {
    return { ok: false, rows: [], message: "Not authenticated" };
  }

  const url = quizSvcUrl(
    `/attempt/schedule/${encodeURIComponent(
      scheduleId
    )}/student/${encodeURIComponent(studentId)}`
  );

  const resp = await fetch(url, {
    method: "GET",
    headers: { Authorization: auth, Accept: "application/json" },
    cache: "no-store",
  });

  const json = await resp.json().catch(() => ({ ok: false }));
  if (!resp.ok || !json?.ok) {
    return {
      ok: false,
      rows: [],
      message: json?.message ?? "Failed to load attempts for schedule",
    };
  }

  return json as AttemptsForScheduleResp;
}
