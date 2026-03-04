export type GameLeaderboardRow = {
  rank: number;
  userId: string;
  displayName: string;
  photoUrl?: string | null;
  className: string;
  overallScore: number;
  avgScorePct: number;
  participationPct: number;
  participationCount: number;
  currentStreak: number;
  bestStreakDays: number;
};

export type GameStudentProfile = {
  classId: string;
  className: string;
  timezone: string;
  studentId: string;
  rank: number | null;
  overallScore: number;
  participationCount: number;
  participationPct: number;
  avgScorePct: number;
  currentStreak: number;
  bestStreakDays: number;
  lastStreakDate?: string | null;
};

type GameLeaderboardResponse = { ok: boolean; data?: GameLeaderboardRow[] };
type GameStudentProfileResponse = { ok: boolean; data?: GameStudentProfile };

const GAME_BASE_URL =
  process.env.EXPO_PUBLIC_GAME_SVC_URL || "http://localhost:7305";

async function authedGet<T>(url: string, token: string): Promise<T> {
  const res = await fetch(url, {
    headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
  });
  const isJson = (res.headers.get("content-type") || "").includes(
    "application/json"
  );
  const body = (isJson ? await res.json().catch(() => null) : null) as T | null;
  if (!res.ok) {
    const msg = (body as any)?.message || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return body as T;
}

export async function getClassLeaderboard(
  token: string,
  classId: string
): Promise<GameLeaderboardRow[]> {
  const id = String(classId || "").trim();
  if (!id) return [];

  const res = await authedGet<GameLeaderboardResponse>(
    `${GAME_BASE_URL}/classes/${encodeURIComponent(id)}/leaderboard`,
    token
  );
  return Array.isArray(res.data) ? res.data : [];
}

export async function getClassStudentGameProfile(
  token: string,
  classId: string,
  studentId: string
): Promise<GameStudentProfile | null> {
  const c = String(classId || "").trim();
  const s = String(studentId || "").trim();
  if (!c || !s) return null;

  const res = await authedGet<GameStudentProfileResponse>(
    `${GAME_BASE_URL}/classes/${encodeURIComponent(
      c
    )}/students/${encodeURIComponent(s)}/profile`,
    token
  );
  return res.data || null;
}
