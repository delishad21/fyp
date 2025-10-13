"use server";

import { getAuthHeader } from "@/services/user/session-definitions";
import { classSvcUrl } from "@/utils/utils";

export type ClassStudent = {
  userId: string;
  displayName: string;
  photoUrl?: string | null;
  className?: string;
  participationPct?: number | null; // 0..100 or null if backend omits
  avgScorePct?: number | null; // 0..100 or null if backend omits
  streakDays?: number | null;
  bestStreakDays?: number | null;
  overallScore?: number | null;
  rank?: number | null;
};

type ApiSuccess = { ok: true; data: ClassStudent[] };
type ApiError = { ok: false; message?: string };

export async function getClassStudents(
  classId: string
): Promise<ApiSuccess | ApiError> {
  const auth = await getAuthHeader();
  if (!auth) return { ok: false, message: "Not authenticated" };

  const url = classSvcUrl(`/classes/${encodeURIComponent(classId)}/students`);

  const res = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: auth,
    },
    cache: "no-store",
  });

  const isJson = (res.headers.get("content-type") || "").includes(
    "application/json"
  );
  const body = isJson ? await res.json().catch(() => null) : null;

  if (!res.ok || !body?.ok) {
    const message =
      (body && (body.message || body.error)) ||
      (res.status === 401 || res.status === 403
        ? "Authentication failed"
        : `Failed to fetch students (${res.status})`);
    return { ok: false, message };
  }

  const rows = Array.isArray(body.data) ? (body.data as any[]) : [];

  // Pass-through only; no heuristics or defaulting.
  const data: ClassStudent[] = rows.map((s) => ({
    userId: String(s.userId),
    displayName: String(s.displayName),
    photoUrl: typeof s.photoUrl === "string" ? s.photoUrl : null,
    className: typeof s.className === "string" ? s.className : undefined,
    participationPct:
      typeof s.participationPct === "number" ? s.participationPct : null,
    avgScorePct: typeof s.avgScorePct === "number" ? s.avgScorePct : null,
    streakDays: typeof s.streakDays === "number" ? s.streakDays : null,
    bestStreakDays:
      typeof s.bestStreakDays === "number" ? s.bestStreakDays : null,
    rank: typeof s.rank === "number" ? s.rank : null,
    overallScore: typeof s.overallScore === "number" ? s.overallScore : null,
  }));

  return { ok: true, data };
}
