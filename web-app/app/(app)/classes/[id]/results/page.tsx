import ResultsTable from "@/components/classes/results-page/ResultsTable";
import { getAvailableScheduleWithStats } from "@/services/class/actions/get-available-schedule-with-stats";
import type {
  Cell,
  RowData,
  ProgressBarCell,
} from "@/services/quiz/types/quiz-table-types";

type PageProps = {
  params: { id: string };
  searchParams?: { q?: string };
};

function asPct(n?: number | null) {
  const v = Math.max(0, Math.min(100, Math.round(Number(n ?? 0))));
  return v;
}

function fmtDate(d?: string | Date | null) {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(undefined, {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

export default async function ResultsPage({ params, searchParams }: PageProps) {
  const classId = (await params).id;
  const initialQ = ((await searchParams)?.q ?? "").toString();

  const res = await getAvailableScheduleWithStats(classId);
  if (!res.ok) {
    return (
      <div className="space-y-4">
        <div className="rounded-md border border-red-700/30 bg-red-900/20 p-4 text-red-300">
          {res.message ?? "Failed to load results"}
        </div>
      </div>
    );
  }

  const items = res.data;

  // Columns (progress bars include absolute values internally when provided)
  const columns = [
    { header: "Quiz", width: 2, align: "left" as const },
    { header: "Subject", width: 1.2, align: "left" as const },
    { header: "Start", width: 1.2, align: "left" as const },
    { header: "End", width: 1.2, align: "left" as const },
    { header: "Participants", width: 1.8, align: "left" as const },
    { header: "Avg Score", width: 1.8, align: "left" as const },
  ];

  const rows: RowData[] = items.map((s) => {
    const participants = Number(s.stats.participants);
    const totalStudents = Number(s.stats.totalStudents);
    const participationPct = asPct(s.stats.participationPct);

    const avgPct = asPct(s.stats.avgPct);

    const nameCell: Cell = {
      variant: "normal",
      data: { text: s.quizName || "Untitled Quiz" },
    };

    const subjectCell: Cell = {
      variant: "label",
      data: { text: s.subject || "—", dotColor: s.subjectColor || undefined },
    };

    const startCell: Cell = {
      variant: "normal",
      data: { text: fmtDate(s.startDate) },
    };
    const endCell: Cell = {
      variant: "normal",
      data: { text: fmtDate(s.endDate) },
    };

    // Participants progress bar with absolute numbers from backend
    const participantsBarCell: Cell = {
      variant: "progressbar",
      data: {
        current: participationPct,
        total: 100,
        absValue: participants,
        absMax: totalStudents,
      },
    };

    // Average score progress bar
    // Use avgPct for the %; ONLY show absolute if avgAbsScore/avgAbsMax exist.
    const avgData: ProgressBarCell["data"] = {
      current: avgPct,
      total: 100,
    };
    if (
      s.stats &&
      Object.prototype.hasOwnProperty.call(s.stats, "avgAbsScore") &&
      Object.prototype.hasOwnProperty.call(s.stats, "avgAbsMax") &&
      s.stats.avgAbsScore != null &&
      s.stats.avgAbsMax != null
    ) {
      avgData.absValue = Math.round(Number(s.stats.avgAbsScore));
      avgData.absMax = Math.round(Number(s.stats.avgAbsMax));
    }

    const avgBarCell: Cell = {
      variant: "progressbar",
      data: avgData,
    };

    return {
      id: String(s._id),
      cells: [
        nameCell,
        subjectCell,
        startCell,
        endCell,
        participantsBarCell,
        avgBarCell,
      ],
      payload: {
        quizId: s.quizId,
        contribution: s.contribution,
      },
    };
  });

  return (
    <div className="space-y-4 px-10 pt-5">
      <h1 className="text-xl font-semibold text-[var(--color-text-primary)]">
        Results
      </h1>

      <ResultsTable
        initialQ={initialQ}
        columns={columns}
        rows={rows}
        totalCount={rows.length}
        rowHrefBase={`/classes/${encodeURIComponent(classId)}/results`}
      />
    </div>
  );
}
