import type { Cell, RowData } from "@/services/quiz/types/quiz-table-types";
import { getScheduleItemAction } from "@/services/class/actions/get-schedule-item-action";
import ScheduleHeader from "@/components/classes/results-page/ScheduleHeader";
import ScheduleTabsClient from "@/components/classes/results-page/ScheduleTabsClient";
import ScheduleStatsPanel from "@/components/classes/results-page/ScheduleStatsPanel";

type PageProps = {
  params: Promise<{ id: string; scheduleId: string }>;
  searchParams?: Promise<{ openAnswerMinPct?: string }>;
};

function formatInTZ(iso?: string | null, timeZone?: string) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, {
      timeZone: timeZone || "Asia/Singapore",
      day: "2-digit",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

function pct(score?: number, max?: number) {
  const s = Number(score || 0);
  const m = Number(max || 0);
  if (m <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((s / m) * 100)));
}

export default async function ScheduleResultPage({
  params,
  searchParams,
}: PageProps) {
  const classId = (await params).id;
  const scheduleId = (await params).scheduleId;

  const openAnswerMinPct =
    typeof (await searchParams)?.openAnswerMinPct === "string"
      ? Number((await searchParams)!.openAnswerMinPct)
      : undefined;

  const res = await getScheduleItemAction(classId, scheduleId, {
    openAnswerMinPct: Number.isFinite(openAnswerMinPct)
      ? openAnswerMinPct
      : undefined,
  });

  if (!res.ok) {
    return (
      <div className="space-y-4">
        <div className="rounded-md border border-red-700/30 bg-red-900/20 p-4 text-red-300">
          {res.message ?? "Failed to load scheduled quiz"}
        </div>
      </div>
    );
  }

  const data = res.data;
  const tz = data.timezone || "Asia/Singapore";

  const participants = Number(data.stats.participants ?? 0);
  const totalStudents = Number(data.stats.totalStudents ?? 0);
  const participationPct = Number(data.stats.participationPct ?? 0);

  const avgPctFromBackend = Number.isFinite(Number(data.stats.avgPct))
    ? Number(data.stats.avgPct)
    : undefined;

  const avgAbsScore =
    data.stats.avgAbsScore != null ? Number(data.stats.avgAbsScore) : undefined;
  const avgAbsMax =
    data.stats.avgAbsMax != null ? Number(data.stats.avgAbsMax) : undefined;

  const sumScore = Number(data.stats.sumScore ?? 0);
  const sumMax = Number(data.stats.sumMax ?? 0);

  const columns = [
    { header: "", width: 0.7, align: "center" as const },
    { header: "Student", width: 2, align: "left" as const },
    { header: "Finished", width: 2, align: "left" as const },
    { header: "Score", width: 1, align: "center" as const },
    { header: "Grade", width: 2, align: "left" as const },
  ];

  const attemptRows: RowData[] = (data.canonicalAttempts || []).map((a) => {
    const avatar: Cell = {
      variant: "avatar",
      data: { src: a.photoUrl || undefined, name: a.displayName, size: 48 },
    };
    const name: Cell = {
      variant: "normal",
      data: { text: a.displayName || a.studentId },
    };
    const finished: Cell = {
      variant: "normal",
      data: { text: formatInTZ(a.finishedAt, tz) },
    };
    const scoreAbs = `${Math.round(a.score)}/${Math.round(a.maxScore)}`;
    const scoreCell: Cell = { variant: "normal", data: { text: scoreAbs } };
    const gradeCell: Cell = {
      variant: "progressbar",
      data: { current: pct(a.score, a.maxScore), total: 100 },
    };

    return {
      id: a.attemptId,
      cells: [avatar, name, finished, scoreCell, gradeCell],
      // 👇 add both ids so onRowClick can route
      payload: { studentId: a.studentId, attemptId: a.attemptId },
    };
  });

  return (
    <div className="mx-auto space-y-6 p-4">
      <ScheduleHeader
        quizName={data.quizName}
        subject={data.subject}
        subjectColor={data.subjectColor}
        quizType={data.quizType}
        typeColorHex={data.typeColorHex}
        topic={data.topic}
        startDate={data.startDate}
        endDate={data.endDate}
        timezone={data.timezone}
        participationCount={participants}
        totalStudents={totalStudents}
        participationPct={participationPct}
        avgPct={avgPctFromBackend ?? 0}
        avgAbsScore={avgAbsScore}
        avgAbsMax={avgAbsMax}
        sumScore={sumScore}
        sumMax={sumMax}
      />

      <ScheduleTabsClient
        classId={classId}
        attemptRows={attemptRows}
        totalCount={attemptRows.length}
        columns={columns}
        statistics={
          <ScheduleStatsPanel
            quizType={data.quizType}
            breakdown={data.stats?.breakdown}
          />
        }
      />
    </div>
  );
}
