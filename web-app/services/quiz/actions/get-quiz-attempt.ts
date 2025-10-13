"use server";

import { quizSvcUrl } from "@/utils/utils";
import { getAuthHeader } from "@/services/user/session-definitions";

export async function getQuizAttempt(attemptId: string) {
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
      return { ok: false as const, message: "Unauthorized" };
    }
    if (res.status === 403) {
      return { ok: false as const, message: "Forbidden" };
    }

    const json = await res.json().catch(() => null);

    // If the quiz service follows { ok, data/message } contract, pass it through
    if (json && typeof json === "object" && "ok" in json) {
      return json as { ok: true; data: any } | { ok: false; message?: string };
    }

    // Fallback on unexpected bodies
    if (!res.ok) {
      return {
        ok: false as const,
        message: `Failed (${res.status})`,
      };
    }

    // If service returned a raw doc (unexpected), wrap it
    return { ok: true as const, data: json };
  } catch (e: any) {
    return { ok: false as const, message: e?.message || "Network error" };
  }
}
