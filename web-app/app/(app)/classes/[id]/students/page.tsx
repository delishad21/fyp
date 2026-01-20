import type { RowData, Cell } from "@/services/quiz/types/quiz-table-types";
import StudentsTable from "@/components/classes/class-page/StudentsTable";
import { getClassStudents } from "@/services/class/actions/get-class-students-action";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ q?: string }>;
};

export default async function StudentsPage({
  params,
  searchParams,
}: PageProps) {
  const { id: classId } = await params;
  const initialQ = ((await searchParams)?.q ?? "").toString();

  const result = await getClassStudents(classId);

  if (!result.ok) {
    return (
      <div className="space-y-4">
        <div className="rounded-md border border-red-700/30 bg-red-900/20 p-4 text-red-300">
          {result.message ?? "Failed to load students"}
        </div>
      </div>
    );
  }

  const students = result.data;

  // Server builds the raw table rows once; client will only filter them.
  const columns = [
    { header: "", width: 0.5, align: "center" as const }, // avatar
    { header: "Name", width: 2, align: "left" as const }, // name
    { header: "Rank", width: 1, align: "center" as const },
    { header: "Overall Score", width: 1, align: "center" as const },
    { header: "Participation", width: 2, align: "left" as const },
    { header: "Average Score", width: 2, align: "left" as const },
    { header: "Streak", width: 0.8, align: "left" as const },
    { header: "Best Streak", width: 0.8, align: "center" as const },
  ];

  const rows: RowData[] = students.map((s) => {
    const avatarCell: Cell = {
      variant: "avatar",
      data: { src: undefined, name: s.displayName, size: 55 },
    };
    const nameCell: Cell = { variant: "normal", data: { text: s.displayName } };
    const rankCell: Cell = {
      variant: "normal",
      data: { text: String(s.rank ?? "-") },
    };
    const overallScoreCell: Cell = {
      variant: "normal",
      data: { text: s.overallScore != null ? String(s.overallScore) : "-" },
    };
    const partCell: Cell = {
      variant: "progressbar",
      data: { current: s.participationPct ?? 0, total: 100 },
    };
    const scoreCell: Cell = {
      variant: "progressbar",
      data: { current: s.avgScorePct ?? 0, total: 100 },
    };
    const streakCell: Cell = {
      variant: "normal",
      data: { text: `${s.streakDays ?? 0} Days` },
    };
    const bestStreakCell: Cell = {
      variant: "normal",
      data: { text: `${s.bestStreakDays ?? 0} Days` },
    };

    return {
      id: s.userId,
      cells: [
        avatarCell,
        nameCell,
        rankCell,
        overallScoreCell,
        partCell,
        scoreCell,
        streakCell,
        bestStreakCell,
      ],
    };
  });

  return (
    <StudentsTable
      classId={classId}
      initialQ={initialQ}
      columns={columns}
      rows={rows}
      totalCount={students.length}
      rowHrefBase={`/classes/${encodeURIComponent(classId)}/students`}
    />
  );
}
