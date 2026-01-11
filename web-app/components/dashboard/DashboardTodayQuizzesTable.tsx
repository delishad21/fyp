"use client";

import { useRouter } from "next/navigation";
import CardTable from "@/components/table/CardTable";
import type { Cell, RowData } from "@/services/quiz/types/quiz-table-types";

export type DashboardTodayQuizRow = {
  _id: string; // scheduleId
  classId: string;
  className?: string | null;

  quizId: string;
  quizName?: string | null;
  subject?: string | null;
  subjectColor?: string | null;
  startDate: string; // ISO
  endDate: string; // ISO
  contribution?: number | null;

  stats: {
    participants: number;
    totalStudents: number;
    participationPct: number;
    avgPct: number;
    sumScore?: number;
    sumMax?: number;
    avgAbsScore?: number;
    avgAbsMax?: number;
  };
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

export default function DashboardTodayQuizzesTable({
  items,
}: {
  items: DashboardTodayQuizRow[];
}) {
  const router = useRouter();

  if (!items.length) {
    return (
      <div className="rounded-md bg-[var(--color-bg2)] p-4 text-[var(--color-text-secondary)]">
        No quizzes scheduled for today.
      </div>
    );
  }

  const columns = [
    { header: "Class", width: 1, align: "left" as const },
    { header: "Quiz", width: 2, align: "left" as const },
    { header: "Subject", width: 1.2, align: "left" as const },
    { header: "Start", width: 1.2, align: "left" as const },
    { header: "End", width: 1.2, align: "left" as const },
    { header: "Participants", width: 1.8, align: "left" as const },
    { header: "Avg Score", width: 1.8, align: "left" as const },
  ];

  const rows: RowData[] = items.map((s) => {
    const participants = Number(s.stats.participants ?? 0);
    const totalStudents = Number(s.stats.totalStudents ?? 0);
    const participationPct = asPct(s.stats.participationPct);
    const avgPct = asPct(s.stats.avgPct);

    const classCell: Cell = {
      variant: "normal",
      data: { text: s.className || `Class ${s.classId}` },
    };

    const nameCell: Cell = {
      variant: "normal",
      data: { text: s.quizName || "Untitled Quiz" },
    };

    const subjectCell: Cell = {
      variant: "label",
      data: {
        text: s.subject || "—",
        dotColor: s.subjectColor || undefined,
      },
    };

    const startCell: Cell = {
      variant: "normal",
      data: { text: fmtDate(s.startDate) },
    };

    const endCell: Cell = {
      variant: "normal",
      data: { text: fmtDate(s.endDate) },
    };

    const participantsBarCell: Cell = {
      variant: "progressbar",
      data: {
        current: participationPct,
        total: 100,
        absValue: participants,
        absMax: totalStudents,
      } as any,
    };

    const avgData: any = {
      current: avgPct,
      total: 100,
    };
    if (s.stats && s.stats.avgAbsScore != null && s.stats.avgAbsMax != null) {
      avgData.absValue = Math.round(Number(s.stats.avgAbsScore));
      avgData.absMax = Math.round(Number(s.stats.avgAbsMax));
    }

    const avgBarCell: Cell = {
      variant: "progressbar",
      data: avgData,
    };

    return {
      id: String(s._id), // scheduleId
      cells: [
        classCell,
        nameCell,
        subjectCell,
        startCell,
        endCell,
        participantsBarCell,
        avgBarCell,
      ],
      payload: {
        classId: s.classId,
        quizId: s.quizId,
        contribution: s.contribution,
      },
    };
  });

  return (
    <div className="p-3">
      <CardTable
        columns={columns}
        rows={rows}
        spacing="normal"
        onRowClick={(row) => {
          const classId = (row.payload as any)?.classId;
          if (!classId) return;

          router.push(
            `/classes/${encodeURIComponent(
              classId
            )}/results/${encodeURIComponent(String(row.id))}`
          );
        }}
      />
    </div>
  );
}
