"use server";

import { getAuthHeader } from "@/services/user/session-definitions";
import { classSvcUrl } from "@/utils/utils";

export type AvailableScheduleRow = {
  _id: string; // scheduleId
  quizId: string;
  startDate: string;
  endDate: string;
  contribution?: number;

  // snapshots for display
  quizName?: string;
  subject?: string;
  subjectColor?: string;
  quizType?: string;

  // aggregated stats (now includes totalStudents; optionally avgAbs*)
  stats: {
    participants: number;
    totalStudents: number;
    participationPct: number;
    sumScore: number;
    sumMax: number;
    avgPct: number;
    avgAbsScore?: number; // optional if backend includes it
    avgAbsMax?: number; // optional if backend includes it
    updatedAt?: string | null;
  };
};

type ApiSuccess = { ok: true; data: AvailableScheduleRow[] };
type ApiError = { ok: false; message?: string };

export async function getAvailableScheduleWithStats(
  classId: string
): Promise<ApiSuccess | ApiError> {
  const auth = await getAuthHeader();
  if (!auth) return { ok: false, message: "Not authenticated" };

  const url = classSvcUrl(
    `/classes/${encodeURIComponent(classId)}/schedule/available`
  );

  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json", Authorization: auth },
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
          : `Failed to fetch schedule (${res.status})`);
      return { ok: false, message };
    }

    // Normalize payload while preserving all new fields
    const data: AvailableScheduleRow[] = Array.isArray(body.data)
      ? body.data.map((s: any) => ({
          _id: String(s._id),
          quizId: String(s.quizId),
          startDate: String(s.startDate),
          endDate: String(s.endDate),
          ...(typeof s.contribution === "number"
            ? { contribution: s.contribution }
            : {}),

          ...(typeof s.quizName === "string" ? { quizName: s.quizName } : {}),
          ...(typeof s.subject === "string" ? { subject: s.subject } : {}),
          ...(typeof s.subjectColor === "string"
            ? { subjectColor: s.subjectColor }
            : {}),
          ...(typeof s.quizType === "string" ? { quizType: s.quizType } : {}),

          stats: {
            participants: Number(s?.stats?.participants ?? 0),
            totalStudents: Number(s?.stats?.totalStudents ?? 0),
            participationPct: Number(s?.stats?.participationPct ?? 0),
            sumScore: Number(s?.stats?.sumScore ?? 0),
            sumMax: Number(s?.stats?.sumMax ?? 0),
            avgPct: Number(s?.stats?.avgPct ?? 0),
            ...(s?.stats?.avgAbsScore != null
              ? { avgAbsScore: Number(s.stats.avgAbsScore) }
              : {}),
            ...(s?.stats?.avgAbsMax != null
              ? { avgAbsMax: Number(s.stats.avgAbsMax) }
              : {}),
            updatedAt:
              typeof s?.stats?.updatedAt === "string" ||
              s?.stats?.updatedAt === null
                ? s.stats.updatedAt
                : undefined,
          },
        }))
      : [];

    return { ok: true, data };
  } catch (e: any) {
    return { ok: false, message: e?.message ?? "Network error" };
  }
}
