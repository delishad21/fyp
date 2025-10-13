"use client";

import { useRouter } from "next/navigation";
import CardTable from "@/components/table/CardTable";
import type {
  RowData,
  ColumnDef,
} from "@/services/quiz/types/quiz-table-types";
import Pagination from "@/components/table/Pagination";

export default function StudentAttemptsClient({
  classId,
  studentId,
  columns,
  rows,
  page,
  pageCount,
  total,
  pageSize,
}: {
  classId: string;
  studentId: string;
  columns: ColumnDef[];
  rows: RowData[];
  page: number;
  pageCount: number;
  total: number;
  pageSize: number;
}) {
  const router = useRouter();

  const baseHref = `/classes/${encodeURIComponent(
    classId
  )}/students/${encodeURIComponent(studentId)}`;

  const goToPage = (p: number) => {
    router.push(`${baseHref}?page=${p}&pageSize=${pageSize}`);
  };

  const goToAttempt = (row: RowData) => {
    // Prefer canonical attempt; fall back to latest
    const canId = (row.payload as any)?.canonicalAttemptId;
    const latestId = (row.payload as any)?.latestAttemptId;
    const target = canId || latestId;
    if (!target) return;
    router.push(`${baseHref}/attempt/${encodeURIComponent(String(target))}`);
  };

  return (
    <div className="space-y-3 rounded-xl p-4">
      <CardTable
        columns={columns}
        rows={rows}
        onRowClick={goToAttempt}
        spacing="normal"
      />

      <Pagination page={page} pageCount={pageCount} onPageChange={goToPage} />
      <div className="mb-2 flex items-center justify-between">
        <div className="text-sm text-[var(--color-text-secondary)]">
          {total} total • page {page} of {pageCount}
        </div>
      </div>
    </div>
  );
}
