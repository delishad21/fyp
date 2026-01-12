"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import CardTable from "@/components/table/CardTable";
import type { RowData } from "@/services/quiz/types/quiz-table-types";
import { ScheduleTabs } from "./ScheduleTabs";

export default function ScheduleTabsClient({
  classId,
  attemptRows,
  totalCount,
  columns,
  statistics,
}: {
  classId: string;
  attemptRows: RowData[];
  totalCount: number;
  columns: Array<{
    header: string;
    width: number;
    align: "left" | "center" | "right";
  }>;
  statistics?: React.ReactNode;
}) {
  const [tab, setTab] = useState<"attempts" | "statistics">("attempts");
  const router = useRouter();

  const handleRowClick = (row: RowData) => {
    const payload = row.payload as
      | { studentId?: string; attemptId?: string }
      | undefined;
    const studentId = payload?.studentId;
    const attemptId = payload?.attemptId;
    if (!studentId || !attemptId) return; // defensively ignore if payload missing
    router.push(
      `/classes/${encodeURIComponent(classId)}/students/${encodeURIComponent(
        studentId
      )}/attempt/${encodeURIComponent(attemptId)}`
    );
  };

  return (
    <div className="space-y-4">
      <ScheduleTabs active={tab} onChange={setTab} />

      {tab === "attempts" ? (
        <div className="p-3">
          <CardTable
            columns={columns}
            rows={attemptRows}
            spacing="expanded"
            onRowClick={handleRowClick}
          />
          <div className="mt-2 text-xs text-[var(--color-text-secondary)]">
            Showing {attemptRows.length}/{totalCount} attempts
          </div>
        </div>
      ) : (
        <div className="p-3">
          {statistics ?? (
            <div className="text-sm text-[var(--color-text-secondary)]">
              No statistics available yet.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
