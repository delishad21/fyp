import StudentProfileHeader from "@/components/classes/student-page/StudentProfileHeader";
import StudentProfileSwitcher from "@/components/classes/student-page/StudentProfileSwitcher";
import ResetStudentPasswordButton from "@/components/classes/student-page/ResetStudentPasswordButton";
import {
  getStudentInClass,
  getStudentScheduleSummary,
} from "@/services/class/actions/get-student-actions";
import { Cell, RowData } from "@/services/quiz/types/quiz-table-types";
import { notFound } from "next/navigation";

export default async function StudentProfilePage({
  params,
}: {
  params: Promise<{ id: string; studentId: string }>;
}) {
  const classId = (await params).id;
  const studentId = (await params).studentId;

  // 1) Student header data (rank, streak, overall)
  const sRes = await getStudentInClass(classId, studentId);
  const student = sRes?.data;
  if (!sRes?.ok || !student) return notFound();

  // 2) Schedule-level summary (one row per schedule)
  const sumRes = await getStudentScheduleSummary(classId, studentId);
  if (!sumRes.ok || !sumRes.data) return notFound();

  // Table columns
  const columns = [
    { header: "Quiz", width: 3, align: "left" as const },
    { header: "Subject", width: 2, align: "left" as const },
    { header: "Grade", width: 2, align: "left" as const }, // canonical grade pct if present
    { header: "Latest Attempt", width: 2, align: "left" as const },
  ];

  // Build rows from schedule summary
  const rows: RowData[] = sumRes.data.schedules.map((s) => {
    const nameCell: Cell = { variant: "normal", data: { text: s.quizName } };
    const subjCell: Cell = {
      variant: "label",
      data: {
        text: s.subject ?? "—",
        dotColor: s.subjectColorHex ?? undefined,
      },
    };

    console.log("Canonical:", s.canonical);

    const hasCanonical = !!s.canonical?.attemptId;
    const gradeCell: Cell = {
      variant: "progressbar",
      data: {
        current: hasCanonical ? s.canonical!.gradePct : 0,
        total: 100,
        ...(hasCanonical
          ? {
              absValue: Math.round(s.canonical!.score),
              absMax: Math.round(s.canonical!.maxScore),
            }
          : {}),
      },
    };

    const latestText = s.latestAt
      ? new Date(s.latestAt).toLocaleDateString(undefined, {
          day: "2-digit",
          month: "long",
          year: "numeric",
        })
      : "—";
    const latestCell: Cell = { variant: "normal", data: { text: latestText } };

    return {
      id: s.scheduleId,
      cells: [nameCell, subjCell, gradeCell, latestCell],
      payload: {
        canonicalAttemptId: s.canonical?.attemptId,
        latestAttemptId: s.latestAttemptId,
        scheduleId: s.scheduleId,
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
          // Paging removed: schedule-summary is already condensed (1 row per schedule)
          page: 1,
          pageCount: 1,
          total: rows.length,
          pageSize: rows.length,
        }}
        statsProps={{
          rank: student.rank ?? null,
          stats: student.stats ?? null,
        }}
        actions={
          <ResetStudentPasswordButton classId={classId} studentId={studentId} />
        }
      />
    </div>
  );
}
