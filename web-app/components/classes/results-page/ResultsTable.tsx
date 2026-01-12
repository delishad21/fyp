"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import CardTable from "@/components/table/CardTable";
import type { RowData } from "@/services/quiz/types/quiz-table-types";

type ResultsTableProps = {
  initialQ?: string;
  columns: Array<{
    header: string;
    width: number;
    align: "left" | "center" | "right";
  }>;
  rows: RowData[];
  totalCount: number;
  rowHrefBase?: string;
};

export default function ResultsTable({
  initialQ = "",
  columns,
  rows,
  totalCount,
  rowHrefBase,
}: ResultsTableProps) {
  const router = useRouter();
  const [q, setQ] = useState(initialQ);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((r) => {
      // "Quiz" name is the first cell
      const nameCell = r.cells?.[0];
      const nameText =
        nameCell?.variant === "normal" && typeof nameCell.data?.text === "string"
          ? nameCell.data.text.toLowerCase()
          : "";
      // Also search subject (second cell)
      const subjectCell = r.cells?.[1];
      const subjectText =
        subjectCell?.variant === "label" &&
        typeof subjectCell.data?.text === "string"
          ? subjectCell.data.text.toLowerCase()
          : "";
      return nameText.includes(s) || subjectText.includes(s);
    });
  }, [q, rows]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by quiz or subject"
            className="
              w-72 rounded-md border border-[var(--color-bg4)]
              bg-[var(--color-bg2)] px-3 py-2 text-sm
              text-[var(--color-text-primary)]
              placeholder:text-[var(--color-text-secondary)]
              focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]
            "
          />
          <span className="text-sm text-[var(--color-text-secondary)]">
            ({filtered.length}/{totalCount} Items)
          </span>
        </div>
      </div>

      <div className="p-3">
        <CardTable
          columns={columns}
          rows={filtered}
          spacing="normal"
          // No actions for this list
          onRowClick={
            rowHrefBase
              ? (row) =>
                  router.push(
                    `${rowHrefBase}/${encodeURIComponent(String(row.id))}`
                  )
              : undefined
          }
        />
      </div>
    </div>
  );
}
