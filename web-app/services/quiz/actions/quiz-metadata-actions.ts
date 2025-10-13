"use server";

import { getAuthHeader } from "@/services/user/session-definitions";
import { quizSvcUrl } from "@/utils/utils";
import { FilterMeta } from "../types/quiz-table-types";
import { normalizeHex } from "./quiz-action-helpers";

/* ----------------------------------------------------------------------------
 * Meta (subjects/topics) helpers
 * ------------------------------------------------------------------------- */

function normalizeFilterMeta(json: any): FilterMeta {
  return {
    subjects: Array.isArray(json?.subjects)
      ? json.subjects.map((s: any) => ({
          label: s.label,
          value: s.value ?? s.label, // ensure value is present
          colorHex: s.colorHex,
        }))
      : [],
    topics: Array.isArray(json?.topics)
      ? json.topics.map((t: any) => ({
          label: t.label,
          value: t.value ?? t.label, // ensure value is present
        }))
      : [],
    types:
      Array.isArray(json?.types) && json.types.length
        ? json.types.map((t: any) => ({
            label: t.label,
            value: t.value,
            colorHex: t.colorHex,
          }))
        : [],
  };
}

export async function getFilterMeta(): Promise<FilterMeta> {
  const auth = await getAuthHeader();
  if (!auth) {
    // unauthenticated -> empty subjects/topics; keep frontend-defined types
    return normalizeFilterMeta({});
  }
  try {
    const res = await fetch(quizSvcUrl("/quiz/meta"), {
      method: "GET",
      headers: { Authorization: auth },
      cache: "no-store",
    });

    if (!res.ok) {
      return normalizeFilterMeta({});
    }
    const json = await res.json();

    return normalizeFilterMeta(json);
  } catch {
    return normalizeFilterMeta({});
  }
}

/** Add or upsert a subject/topic. Returns the canonical option for immediate UI use. */
export async function addFilterMeta(
  kind: "subject" | "topic",
  label: string,
  opts?: { value?: string; colorHex?: string }
): Promise<
  | { ok: true; option: { value: string; label: string; colorHex?: string } }
  | { ok: false; message: string }
> {
  const auth = await getAuthHeader();
  if (!auth) return { ok: false, message: "Not authenticated" };

  try {
    const res = await fetch(quizSvcUrl("/quiz/meta"), {
      method: "POST",
      headers: { Authorization: auth, "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({
        kind,
        label, // we treat label as the value for UI
        colorHex: opts?.colorHex,
      }),
    });

    const json = await res.json().catch(() => ({} as any));
    if (!res.ok || !json?.ok) {
      return { ok: false, message: json?.message || "Failed to add metadata." };
    }

    // Ensure pool is always an array -> keeps `found` as MetaItem | undefined.
    const pool: { value?: string; label?: string; colorHex?: string }[] =
      Array.isArray(kind === "subject" ? json.subjects : json.topics)
        ? kind === "subject"
          ? json.subjects
          : json.topics
        : [];

    const found = pool.find(
      (o) => (o.label ?? "").trim().toLowerCase() === label.trim().toLowerCase()
    );

    return {
      ok: true,
      option: {
        // Always use label as the committed value
        value: found?.label ?? label,
        label: found?.label ?? label,
        colorHex: normalizeHex(found?.colorHex ?? opts?.colorHex),
      },
    };
  } catch (e: any) {
    return { ok: false, message: e?.message || "Network error" };
  }
}

export async function editFilterMeta(
  kind: "subject" | "topic",
  value: string, // current slug
  patch: { label?: string; colorHex?: string; newValue?: string }
): Promise<{ ok: boolean; message?: string; meta?: FilterMeta }> {
  const auth = await getAuthHeader();
  if (!auth) return { ok: false, message: "Not authenticated" };

  try {
    const res = await fetch(
      quizSvcUrl(
        `/quiz/meta/${encodeURIComponent(kind)}/${encodeURIComponent(value)}`
      ),
      {
        method: "PATCH",
        headers: { Authorization: auth, "Content-Type": "application/json" },
        body: JSON.stringify(patch),
        cache: "no-store",
      }
    );
    const json = await res
      .json()
      .catch(() => ({ ok: false, message: "Invalid response" }));
    if (!res.ok || !json?.ok) {
      return {
        ok: false,
        message: json?.message || "Failed to edit metadata.",
      };
    }
    return { ok: true, meta: await getFilterMeta() };
  } catch (e: any) {
    return { ok: false, message: e?.message || "Network error" };
  }
}

export async function deleteFilterMeta(
  kind: "subject" | "topic",
  value: string
): Promise<{
  ok: boolean;
  inUse?: boolean;
  count?: number;
  message?: string;
  meta?: FilterMeta;
}> {
  const auth = await getAuthHeader();
  if (!auth) return { ok: false, message: "Not authenticated" };

  try {
    const res = await fetch(
      quizSvcUrl(
        `/quiz/meta/${encodeURIComponent(kind)}/${encodeURIComponent(value)}`
      ),
      {
        method: "DELETE",
        headers: { Authorization: auth },
        cache: "no-store",
      }
    );
    const json = await res.json().catch(() => ({}));

    if (res.status === 409) {
      return {
        ok: false,
        inUse: true,
        count: (json as any)?.count,
        message: (json as any)?.message || "Cannot delete while in use.",
      };
    }
    if (!res.ok || !(json as any)?.ok) {
      return {
        ok: false,
        message: (json as any)?.message || "Failed to delete metadata.",
      };
    }
    return { ok: true, meta: await getFilterMeta() };
  } catch (e: any) {
    return { ok: false, message: e?.message || "Network error" };
  }
}
