"use server";

import { getAuthHeader } from "@/services/user/session-definitions";
import { classSvcUrl } from "@/utils/utils";

export type ClassStudent = {
  userId: string;
  displayName: string;
  photoUrl?: string | null;
  rank?: number;
  participationPct?: number;
  avgScorePct?: number;
  streakDays?: number;
};

export async function removeStudentAction(
  classId: string,
  studentId: string
): Promise<{
  ok: boolean;
  message?: string;
  updatedStudents?: ClassStudent[];
}> {
  const authHeader = await getAuthHeader();
  if (!authHeader) return { ok: false, message: "Not authenticated" };

  const resp = await fetch(
    classSvcUrl(
      `/classes/${encodeURIComponent(classId)}/students/${encodeURIComponent(
        studentId
      )}`
    ),
    {
      method: "DELETE",
      headers: { Authorization: authHeader, Accept: "application/json" },
      cache: "no-store",
    }
  );

  let json: any = null;
  try {
    json = await resp.json();
  } catch {
    return { ok: false, message: "Invalid server response" };
  }

  if (!resp.ok || !json?.ok) {
    return {
      ok: false,
      message:
        json?.message ??
        (resp.status === 401 || resp.status === 403
          ? "Authentication failed"
          : "Failed to remove student"),
    };
  }

  // Backend currently returns { ok:true, data: <whole class doc> }.
  // Normalize to just students for the frontend:
  const students: ClassStudent[] = Array.isArray(json?.data?.students)
    ? json.data.students.map((s: any) => ({
        userId: String(s.userId),
        displayName: String(s.displayName ?? ""),
        photoUrl: s.photoUrl ?? null,
        rank: typeof s.rank === "number" ? s.rank : 0,
        participationPct:
          typeof s.participationPct === "number" ? s.participationPct : 0,
        avgScorePct: typeof s.avgScorePct === "number" ? s.avgScorePct : 0,
        streakDays: typeof s.streakDays === "number" ? s.streakDays : 0,
      }))
    : [];

  return {
    ok: true,
    message: json?.message || "Student removed",
    updatedStudents: students,
  };
}
