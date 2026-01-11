"use server";

import { getAuthHeader } from "@/services/user/session-definitions";
import { classSvcUrl } from "@/utils/utils";

// ---- Types (align with controller/model) ----
export type ApiScheduleItem = {
  _id: string; // scheduleId

  // concrete + canonical quiz identity
  quizId: string;
  quizRootId: string;
  quizVersion: number;

  startDate: string; // ISO
  endDate: string; // ISO
  quizName?: string;
  subject?: string;
  subjectColor?: string;
  contribution?: number;

  // policy
  attemptsAllowed: number; // default 1 (max 10, server-enforced)
  showAnswersAfterAttempt: boolean; // default false (server-enforced)

  // optional quiz meta
  quizType?: "basic" | "rapid" | "crossword" | string;
  topic?: string;
  typeColorHex?: string;

  [k: string]: any;
};

type Ok<T> = { ok: true; data: T; message?: string };
type Err = {
  ok: false;
  message?: string;
  status?: number;
  fieldErrors?: Record<string, any>;
};
type R<T> = Ok<T> | Err;

// ---- Helpers ----
function authHeaders(token?: string) {
  const h: Record<string, string> = { "content-type": "application/json" };
  if (token) h.Authorization = token; // token already "Bearer <...>"
  return h;
}

function toIso(d: string | Date | undefined | null) {
  if (!d) return d as any;
  return typeof d === "string" ? d : (d as Date).toISOString();
}

// ======================================================================
// CREATE  (POST /classes/:id/schedule)
// Notes
//  - Server validates against the CLASS timezone (Class.timezone).
//  - Overlap is now checked by canonical identity (quizRootId + quizVersion).
// ======================================================================
export async function addClassQuizSchedule(
  classId: string,
  item: {
    // concrete + canonical quiz identity (all required in new flow)
    quizId: string;
    quizRootId: string;
    quizVersion: number;

    startDate: string | Date;
    endDate: string | Date;
    contribution?: number;

    attemptsAllowed?: number;
    showAnswersAfterAttempt?: boolean;

    extra?: Record<string, any>;
  }
): Promise<R<ApiScheduleItem>> {
  const token = await getAuthHeader();
  const url = classSvcUrl(`/classes/${encodeURIComponent(classId)}/schedule`);

  const body = JSON.stringify({
    quizId: item.quizId,
    quizRootId: item.quizRootId,
    quizVersion: item.quizVersion,
    startDate: toIso(item.startDate),
    endDate: toIso(item.endDate),
    ...(typeof item.contribution === "number"
      ? { contribution: item.contribution }
      : {}),
    ...(typeof item.attemptsAllowed === "number"
      ? { attemptsAllowed: item.attemptsAllowed }
      : {}),
    ...(typeof item.showAnswersAfterAttempt === "boolean"
      ? { showAnswersAfterAttempt: item.showAnswersAfterAttempt }
      : {}),
    ...(item.extra ? { extra: item.extra } : {}),
  });

  const res = await fetch(url, {
    method: "POST",
    headers: authHeaders(token),
    body,
    cache: "no-store",
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json?.ok) {
    return {
      ok: false,
      message: json?.message || `Failed (${res.status})`,
      status: res.status,
      fieldErrors: json?.fieldErrors,
    };
  }
  return json as Ok<ApiScheduleItem>;
}

// ======================================================================
//
// LIST (GET /classes/:id/schedule)
//
// ======================================================================
export async function getClassSchedule(
  classId: string
): Promise<R<ApiScheduleItem[]>> {
  try {
    const token = await getAuthHeader();
    const url = classSvcUrl(`/classes/${encodeURIComponent(classId)}/schedule`);

    const res = await fetch(url, {
      method: "GET",
      headers: authHeaders(token),
      cache: "no-store",
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json?.ok) {
      return {
        ok: false,
        message: json?.message || `Failed (${res.status})`,
        status: res.status,
        fieldErrors: json?.fieldErrors,
      };
    }
    return json as Ok<ApiScheduleItem[]>;
  } catch (e: any) {
    return { ok: false, message: e?.message || "Network error" };
  }
}

// ======================================================================
// READ (by scheduleId)  GET /classes/:id/schedule/item/:scheduleId
// ======================================================================
export async function getClassScheduleItemById(
  classId: string,
  scheduleId: string
): Promise<R<ApiScheduleItem>> {
  try {
    const token = await getAuthHeader();
    const url = classSvcUrl(
      `/classes/${encodeURIComponent(
        classId
      )}/schedule/item/${encodeURIComponent(scheduleId)}`
    );

    const res = await fetch(url, {
      method: "GET",
      headers: authHeaders(token),
      cache: "no-store",
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json?.ok) {
      return {
        ok: false,
        message: json?.message || `Failed (${res.status})`,
        status: res.status,
        fieldErrors: json?.fieldErrors,
      };
    }
    return json as Ok<ApiScheduleItem>;
  } catch (e: any) {
    return { ok: false, message: e?.message || "Network error" };
  }
}

// ======================================================================
// EDIT (by scheduleId)  PATCH /classes/:id/schedule/item/:scheduleId
// Notes
//  - Identity (quizId/root/version) is typically fixed once created;
//    this patch focuses on window/policy + extra.
// ======================================================================
export async function editClassScheduleItem(
  classId: string,
  scheduleId: string,
  patch: {
    startDate?: string | Date;
    endDate?: string | Date;
    contribution?: number;
    attemptsAllowed?: number;
    showAnswersAfterAttempt?: boolean;
    quizVersion?: number; // NEW

    extra?: Record<string, any>;
  }
): Promise<R<ApiScheduleItem>> {
  const token = await getAuthHeader();
  const url = classSvcUrl(
    `/classes/${encodeURIComponent(classId)}/schedule/item/${encodeURIComponent(
      scheduleId
    )}`
  );

  const body = JSON.stringify({
    ...(patch.startDate ? { startDate: toIso(patch.startDate) } : {}),
    ...(patch.endDate ? { endDate: toIso(patch.endDate) } : {}),
    ...(typeof patch.contribution === "number"
      ? { contribution: patch.contribution }
      : {}),
    ...(typeof patch.attemptsAllowed === "number"
      ? { attemptsAllowed: patch.attemptsAllowed }
      : {}),
    ...(typeof patch.showAnswersAfterAttempt === "boolean"
      ? { showAnswersAfterAttempt: patch.showAnswersAfterAttempt }
      : {}),
    ...(typeof patch.quizVersion === "number"
      ? { quizVersion: patch.quizVersion }
      : {}),
    ...(patch.extra ? { extra: patch.extra } : {}),
  });

  const res = await fetch(url, {
    method: "PATCH",
    headers: authHeaders(token),
    body,
    cache: "no-store",
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json?.ok) {
    return {
      ok: false,
      message: json?.message || `Failed (${res.status})`,
      status: res.status,
      fieldErrors: json?.fieldErrors,
    };
  }
  return json as Ok<ApiScheduleItem>;
}

// ======================================================================
// DELETE (by scheduleId)  DELETE /classes/:id/schedule/item/:scheduleId
// ======================================================================
export async function deleteClassScheduleItemById(
  classId: string,
  scheduleId: string
): Promise<R<any>> {
  try {
    const token = await getAuthHeader();
    const url = classSvcUrl(
      `/classes/${encodeURIComponent(
        classId
      )}/schedule/item/${encodeURIComponent(scheduleId)}`
    );

    const res = await fetch(url, {
      method: "DELETE",
      headers: authHeaders(token),
      cache: "no-store",
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json?.ok) {
      return {
        ok: false,
        message: json?.message || `Failed (${res.status})`,
        status: res.status,
        fieldErrors: json?.fieldErrors,
      };
    }
    return json as Ok<any>;
  } catch (e: any) {
    return { ok: false, message: e?.message || "Network error" };
  }
}

export async function deleteAllClassScheduleItemsForQuiz(
  classId: string,
  quizId: string
): Promise<R<any>> {
  try {
    const token = await getAuthHeader();
    const url = classSvcUrl(
      `/classes/${encodeURIComponent(
        classId
      )}/schedule/quiz/${encodeURIComponent(quizId)}`
    );

    const res = await fetch(url, {
      method: "DELETE",
      headers: authHeaders(token),
      cache: "no-store",
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json?.ok) {
      return {
        ok: false,
        message: json?.message || `Failed (${res.status})`,
        status: res.status,
        fieldErrors: json?.fieldErrors,
      };
    }
    return json as Ok<any>;
  } catch (e: any) {
    return { ok: false, message: e?.message || "Network error" };
  }
}

export type ApiClassScheduleBundle = {
  classId: string;
  className?: string;
  classTimezone: string;
  schedule: ApiScheduleItem[];
};

/**
 * GET /classes/schedule/all
 * Returns schedules for all classes of the current teacher,
 * grouped by class.
 */
export async function getAllClassesScheduleForDashboard(): Promise<
  R<ApiClassScheduleBundle[]>
> {
  try {
    const token = await getAuthHeader();
    const url = classSvcUrl(`/classes/schedule/all`);

    const res = await fetch(url, {
      method: "GET",
      headers: authHeaders(token),
      cache: "no-store",
    });

    const json = await res.json().catch(() => ({} as any));
    if (!res.ok || !json?.ok) {
      return {
        ok: false,
        message: json?.message || `Failed (${res.status})`,
        status: res.status,
        fieldErrors: json?.fieldErrors,
      };
    }

    const raw = json.data;

    const data: ApiClassScheduleBundle[] = Array.isArray(raw)
      ? raw.map((row: any) => ({
          classId: String(row.classId),
          className:
            typeof row.className === "string" ? row.className : undefined,
          classTimezone: String(row.classTimezone || "UTC"),
          schedule: Array.isArray(row.schedule)
            ? (row.schedule as any[]).map((s) => ({
                // normalize minimally; rely on backend for the rest
                _id: String(s._id),
                quizId: String(s.quizId),
                quizRootId: String(s.quizRootId ?? ""),
                quizVersion: Number(s.quizVersion ?? 0),
                startDate: String(s.startDate),
                endDate: String(s.endDate),
                quizName: s.quizName,
                subject: s.subject,
                subjectColor: s.subjectColor,
                contribution:
                  typeof s.contribution === "number"
                    ? s.contribution
                    : undefined,
                attemptsAllowed: Number(s.attemptsAllowed ?? 1),
                showAnswersAfterAttempt: Boolean(
                  s.showAnswersAfterAttempt ?? false
                ),
                quizType: s.quizType,
                topic: s.topic,
                typeColorHex: s.typeColorHex,
                // allow extra fields through
                ...s,
              }))
            : [],
        }))
      : [];

    return { ok: true, data };
  } catch (e: any) {
    return { ok: false, message: e?.message || "Network error" };
  }
}
