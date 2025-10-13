import StudentProfileHeader from "@/components/classes/student-page/StudentProfileHeader";
import StudentProfileSwitcher from "@/components/classes/student-page/StudentProfileSwitcher";
import {
  getStudentInClass,
  getStudentAttempts,
  AttemptRow,
} from "@/services/class/actions/get-student-actions";
import { Cell, RowData } from "@/services/quiz/types/quiz-table-types";
import { notFound } from "next/navigation";

// Helpers
function pct(score?: number, max?: number) {
  if (!max || max <= 0 || !score) return 0;
  return Math.max(0, Math.min(100, Math.round((score / max) * 100)));
}

export default async function StudentProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; studentId: string }>;
  searchParams?: { page?: string; pageSize?: string };
}) {
  const classId = (await params).id;
  const studentId = (await params).studentId;

  const sRes = await getStudentInClass(classId, studentId);
  const student = (sRes as any)?.data ?? (sRes as any)?.student;
  if (!sRes?.ok || !student) return notFound();

  const page = Math.max(1, Number((await searchParams)?.page ?? 1));
  const pageSize = Math.min(
    50,
    Math.max(5, Number((await searchParams)?.pageSize ?? 10))
  );

  const aRes = await getStudentAttempts(studentId, page, pageSize);

  // --- Build SCHEDULE rows ---
  // Group attempts by scheduleId and keep latest finalized/any attempt time
  const bySchedule = new Map<
    string,
    { attempts: AttemptRow[]; latest: AttemptRow | undefined }
  >();

  for (const r of aRes.rows ?? []) {
    if (!r.scheduleId) continue;
    const list = bySchedule.get(r.scheduleId) ?? {
      attempts: [],
      latest: undefined,
    };
    list.attempts.push(r);
    // latest = Greatest finishedAt (fallback startedAt)
    const rTime = r.finishedAt
      ? new Date(r.finishedAt).getTime()
      : new Date(r.startedAt ?? r.createdAt ?? 0).getTime();
    const lTime = list.latest
      ? new Date(
          list.latest.finishedAt ??
            list.latest.startedAt ??
            list.latest.createdAt ??
            0
        ).getTime()
      : -1;
    if (!list.latest || rTime > lTime) list.latest = r;
    bySchedule.set(r.scheduleId, list);
  }

  // Canonical map from student stats
  const canonicalBySchedule: Record<
    string,
    { attemptId?: string; score?: number; maxScore?: number }
  > = student?.stats?.canonicalBySchedule ?? {};

  // Only schedules that have any attempts (even if canonical doesn’t exist)
  const scheduleIds = Array.from(bySchedule.keys());

  // Table columns
  const columns = [
    { header: "Quiz", width: 3, align: "left" as const },
    { header: "Subject", width: 2, align: "left" as const },
    { header: "Grade", width: 2, align: "left" as const }, // progressbar (canonical or 0)
    { header: "Latest Attempt", width: 2, align: "left" as const },
  ];

  // Build rows: one per schedule
  const rows: RowData[] = scheduleIds.map((sid) => {
    const pack = bySchedule.get(sid)!;
    const anyAttempt = pack.latest!;
    const quizName = anyAttempt?.quiz?.name ?? "Untitled Quiz";
    const subject = anyAttempt?.quiz?.subject ?? "—";
    const subjectColor = anyAttempt?.quiz?.subjectColorHex;

    // Canonical stats for this schedule (if present)
    const can = canonicalBySchedule[sid];
    const hasCanonical = Boolean(can?.attemptId);
    const gradePct = hasCanonical ? pct(can?.score, can?.maxScore) : 0;

    const nameCell: Cell = { variant: "normal", data: { text: quizName } };
    const subjCell: Cell = {
      variant: "label",
      data: { text: subject, dotColor: subjectColor },
    };
    const gradeCell: Cell = {
      variant: "progressbar",
      data: {
        current: gradePct,
        total: 100,
        // if you want to show abs in the bar only when canonical exists:
        ...(hasCanonical
          ? {
              absValue: Math.round(can!.score ?? 0),
              absMax: Math.round(can!.maxScore ?? 0),
            }
          : {}),
      } as any,
    };

    const latestAt =
      anyAttempt?.finishedAt ?? anyAttempt?.startedAt ?? anyAttempt?.createdAt;
    const latestText = latestAt
      ? new Date(latestAt).toLocaleDateString(undefined, {
          day: "2-digit",
          month: "long",
          year: "numeric",
        })
      : "—";
    const latestCell: Cell = { variant: "normal", data: { text: latestText } };

    // Provide ids for navigation:
    // - canonicalAttemptId -> preferred destination
    // - latestAttemptId -> graceful fallback when no canonical
    const latestAttemptId = anyAttempt?._id;
    const canonicalAttemptId = hasCanonical
      ? String(can!.attemptId)
      : undefined;

    return {
      id: sid, // row id is scheduleId
      cells: [nameCell, subjCell, gradeCell, latestCell],
      payload: {
        canonicalAttemptId,
        latestAttemptId,
        scheduleId: sid,
      },
    };
  });

  return (
    <div className="mx-auto space-y-6 p-4">
      <StudentProfileHeader
        name={student.displayName}
        avatarUrl={student.photoUrl}
        currentStreakDays={student.stats?.streakDays ?? 0}
        overallScore={student.stats?.overallScore ?? 0}
        rank={student.rank ?? null}
      />

      <StudentProfileSwitcher
        classId={classId}
        studentId={studentId}
        attemptsProps={{
          columns,
          rows,
          // Keep paging controls hooked to attempts list
          page: aRes.page,
          pageCount: aRes.pageCount,
          total: aRes.total,
          pageSize,
        }}
        statsProps={{
          rank: student.rank ?? null,
          stats: student.stats ?? null,
        }}
      />
    </div>
  );
}
