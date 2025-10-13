"use server";

import { getAuthHeader } from "@/services/user/session-definitions";
import { quizSvcUrl } from "@/utils/utils";

export async function deleteQuizAction(
  id: string
): Promise<{ ok: boolean; message?: string }> {
  const auth = await getAuthHeader();
  if (!auth) return { ok: false, message: "Not authenticated" };

  try {
    const res = await fetch(quizSvcUrl(`/quiz/${encodeURIComponent(id)}`), {
      method: "DELETE",
      headers: { Authorization: auth },
      cache: "no-store",
    });

    const json = await res.json().catch(() => ({} as any));

    if (!res.ok || json?.ok === false) {
      return {
        ok: false,
        message: json?.message || "Failed to delete quiz.",
      };
    }

    return { ok: true };
  } catch (e: any) {
    return { ok: false, message: e?.message || "Network error" };
  }
}
