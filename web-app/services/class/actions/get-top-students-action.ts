"use server";

import { getAuthHeader } from "@/services/user/session-definitions";
import { classSvcUrl } from "@/utils/utils";

/** ---------- Types ---------- */

export interface TopOverallScoreItem {
  userId: string;
  displayName: string;
  photoUrl?: string | null;
  className: string;
  overallScore: number;
  avgScorePct: number;
  participationPct: number;
}

export interface TopParticipationItem {
  userId: string;
  displayName: string;
  photoUrl?: string | null;
  className: string;
  participationPct: number;
  participationCount: number;
}

export interface TopStreakItem {
  userId: string;
  displayName: string;
  photoUrl?: string | null;
  className: string;
  currentStreak: number;
}

export type GetTopStudentsResult = {
  ok: boolean;
  message?: string;
  data?: {
    topOverallScore: TopOverallScoreItem[];
    topParticipation: TopParticipationItem[];
    topStreak: TopStreakItem[];
  };
};

/** ---------- Internal fetch helper ---------- */

async function fetchTopStudents(
  classId: string,
  limit: number,
  authHeader: string
) {
  const url = classSvcUrl(
    `/classes/${encodeURIComponent(classId)}/top?limit=${encodeURIComponent(
      String(limit)
    )}`
  );

  const resp = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: authHeader,
      Accept: "application/json",
    },
    cache: "no-store",
  });

  const json = await resp
    .json()
    .catch(() => ({ ok: false, message: "Invalid server response" }));

  return { resp, json };
}

/** ---------- Public server function ---------- */

export async function getTopStudentsAction(
  classId: string,
  opts?: { limit?: number }
): Promise<GetTopStudentsResult> {
  const authHeader = await getAuthHeader();
  if (!authHeader) {
    return { ok: false, message: "Not authenticated" };
  }

  const id = String(classId || "").trim();
  if (!id) {
    return { ok: false, message: "Missing classId" };
  }

  const limit =
    typeof opts?.limit === "number" && opts.limit > 0 ? opts.limit : 3;

  try {
    const { resp, json } = await fetchTopStudents(id, limit, authHeader);

    if (!resp.ok || !json?.ok) {
      const msg =
        json?.message ??
        (resp.status === 401 || resp.status === 403
          ? "Authentication failed"
          : "Failed to fetch top students");
      return { ok: false, message: msg };
    }

    return {
      ok: true,
      data: {
        topOverallScore: Array.isArray(json.data?.topOverallScore)
          ? (json.data.topOverallScore as TopOverallScoreItem[])
          : [],
        topParticipation: Array.isArray(json.data?.topParticipation)
          ? (json.data.topParticipation as TopParticipationItem[])
          : [],
        topStreak: Array.isArray(json.data?.topStreak)
          ? (json.data.topStreak as TopStreakItem[])
          : [],
      },
    };
  } catch (e: any) {
    console.error("[getTopStudents] error:", e?.message || e);
    return { ok: false, message: "Network error. Please try again." };
  }
}
