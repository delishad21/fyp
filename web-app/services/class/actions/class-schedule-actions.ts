"use server";

import { getAuthHeader } from "@/services/user/session-definitions";
import { classSvcUrl } from "@/utils/utils";

// ---- Types (align with controller/model) ----
export type ApiScheduleItem = {
  _id: string; // scheduleId
  quizId: string;
  startDate: string; // ISO
  endDate: string; // ISO
  quizName?: string; // optional
  subject?: string; // optional
  subjectColor?: string; // optional
  contribution?: number;
  [k: string]: any;
};

type Ok<T> = { ok: true; data: T; message?: string };
type Err = {
  ok: false;
  message?: string;
  status?: number;
  fieldErrors?: Record<string, any>; // surface server-side validation errors
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
//  - Server validates against the CLASS timezone (Class.timezone); any client tz is ignored.
//  - Allows multiple entries per quizId; server rejects overlapping time ranges for the same quizId.
// ======================================================================
export async function addClassQuizSchedule(
  classId: string,
  item: {
    quizId: string;
    startDate: string | Date;
    endDate: string | Date;
    contribution?: number;
    extra?: Record<string, any>;
  }
): Promise<R<ApiScheduleItem>> {
  const token = await getAuthHeader();
  const url = classSvcUrl(`/classes/${encodeURIComponent(classId)}/schedule`);
  const body = JSON.stringify({
    quizId: item.quizId,
    startDate: toIso(item.startDate),
    endDate: toIso(item.endDate),
    ...(typeof item.contribution === "number"
      ? { contribution: item.contribution }
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
      fieldErrors: json?.fieldErrors, // pass through per-field validation
    };
  }
  return json as Ok<ApiScheduleItem>;
}

// ======================================================================
// LIST (GET /classes/:id/schedule)
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
//  - Send only fields you intend to change.
//  - Server validates against the CLASS timezone; client-sent timezone is ignored.
// ======================================================================
export async function editClassScheduleItem(
  classId: string,
  scheduleId: string,
  patch: {
    startDate?: string | Date;
    endDate?: string | Date;
    extra?: Record<string, any>;
    contribution?: number;
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
    ...(patch.extra ? { extra: patch.extra } : {}),
    ...(typeof patch.contribution === "number"
      ? { contribution: patch.contribution }
      : {}),
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
