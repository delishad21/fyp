import { getAuthHeader } from "@/services/user/session-definitions";
import { classSvcUrl } from "@/utils/utils";
import { AvailableScheduleRow } from "./get-available-schedule-with-stats";

export type AvailableScheduleRowWithClass = AvailableScheduleRow & {
  classId: string;
  className?: string;
};

type TodayApiSuccess = { ok: true; data: AvailableScheduleRowWithClass[] };
type ApiError = { ok: false; message: string };

/**
 * GET /classes/schedule/today
 * Returns today's schedules across all of the teacher's classes,
 * each row including the same stats as getAvailableScheduleWithStats
 * plus classId/className.
 */
export async function getTodaySchedulesForDashboard(): Promise<
  TodayApiSuccess | ApiError
> {
  const auth = await getAuthHeader();
  if (!auth) return { ok: false, message: "Not authenticated" };

  const url = classSvcUrl(`/classes/schedule/today`);

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
          : `Failed to fetch today's schedules (${res.status})`);
      return { ok: false, message };
    }

    const data: AvailableScheduleRowWithClass[] = Array.isArray(body.data)
      ? body.data.map((s: any) => ({
          classId: String(s.classId),
          ...(typeof s.className === "string"
            ? { className: s.className }
            : {}),

          _id: String(s._id),
          quizId: String(s.quizId),
          startDate: String(s.startDate),
          endDate: String(s.endDate),

          ...(typeof s.quizRootId === "string"
            ? { quizRootId: s.quizRootId }
            : {}),
          ...(typeof s.quizVersion === "number"
            ? { quizVersion: s.quizVersion }
            : {}),

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
