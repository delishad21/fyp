"use server";

import { getAuthHeader } from "@/services/user/session-definitions";
import { classSvcUrl, gameSvcUrl } from "@/utils/utils";

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

  const classUrl = classSvcUrl(`/classes/${encodeURIComponent(classId)}/students`);
  const gameUrl = gameSvcUrl(`/classes/${encodeURIComponent(classId)}/leaderboard`);

  const [classRes, gameRes] = await Promise.all([
    fetch(classUrl, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: auth,
      },
      cache: "no-store",
    }),
    fetch(gameUrl, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: auth,
      },
      cache: "no-store",
    }),
  ]);

  const classIsJson = (classRes.headers.get("content-type") || "").includes(
    "application/json"
  );
  const classBody = classIsJson ? await classRes.json().catch(() => null) : null;

  if (!classRes.ok || !classBody?.ok) {
    const message =
      (classBody && (classBody.message || classBody.error)) ||
      (classRes.status === 401 || classRes.status === 403
        ? "Authentication failed"
        : `Failed to fetch students (${classRes.status})`);
    return { ok: false, message };
  }

  const gameIsJson = (gameRes.headers.get("content-type") || "").includes(
    "application/json"
  );
  const gameBody = gameIsJson ? await gameRes.json().catch(() => null) : null;

  if (!gameRes.ok || !gameBody?.ok) {
    const message =
      (gameBody && (gameBody.message || gameBody.error)) ||
      (gameRes.status === 401 || gameRes.status === 403
        ? "Authentication failed"
        : `Failed to fetch class leaderboard (${gameRes.status})`);
    return { ok: false, message };
  }

  const classRows = Array.isArray(classBody.data) ? (classBody.data as any[]) : [];
  const leaderboardRows = Array.isArray(gameBody.data) ? (gameBody.data as any[]) : [];

  const leaderboardByUserId = new Map<string, any>(
    leaderboardRows.map((row) => [String(row.userId), row])
  );

  const data: ClassStudent[] = classRows.map((s) => {
    const userId = String(s.userId);
    const game = leaderboardByUserId.get(userId);

    return {
      userId,
      displayName: String(s.displayName),
      photoUrl: typeof s.photoUrl === "string" ? s.photoUrl : null,
      className: typeof s.className === "string" ? s.className : undefined,
      participationPct:
        typeof s.participationPct === "number" ? s.participationPct : null,
      avgScorePct: typeof s.avgScorePct === "number" ? s.avgScorePct : null,
      streakDays: typeof game?.currentStreak === "number" ? game.currentStreak : 0,
      bestStreakDays:
        typeof game?.bestStreakDays === "number" ? game.bestStreakDays : 0,
      rank: typeof game?.rank === "number" ? game.rank : null,
      overallScore:
        typeof game?.overallScore === "number" ? game.overallScore : 0,
    };
  });

  return { ok: true, data };
}
