// components/classes/StudentsTable.tsx
"use client";

import { useMemo, useState, useTransition, useCallback } from "react";
import CardTable from "@/components/table/CardTable";
import Button from "@/components/ui/buttons/Button";
import type { RowData } from "@/services/quiz/types/quiz-table-types";
import { removeStudentAction } from "@/services/class/actions/remove-student-action";
import { useToast } from "@/components/ui/toast/ToastProvider";
import { useRouter } from "next/navigation";
import { mapStudentsToRows } from "@/services/class/helpers/class-helpers";
import WarningModal from "../../ui/WarningModal";

type Props = {
  classId: string;
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

export default function StudentsTable({
  classId,
  initialQ = "",
  columns,
  rows,
  totalCount,
  rowHrefBase,
}: Props) {
  const router = useRouter();
  const { showToast } = useToast();
  const [q, setQ] = useState(initialQ);
  const [data, setData] = useState<RowData[]>(rows);

  const [isPending, startTransition] = useTransition();

  // ⚠️ modal state
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [rowPendingDelete, setRowPendingDelete] = useState<RowData | null>(
    null
  );
  const [isDeleting, setIsDeleting] = useState(false);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return data;
    return data.filter((r) => {
      const nameCell = r.cells?.[1];
      const nameText =
        (nameCell?.data as any)?.text?.toString().toLowerCase() ?? "";
      return nameText.includes(s);
    });
  }, [q, data]);

  // Step 1: open confirm modal
  const requestDelete = useCallback((row: RowData) => {
    setRowPendingDelete(row);
    setConfirmOpen(true);
  }, []);

  // Step 2: on confirm -> call action
  const confirmDelete = useCallback(() => {
    if (!rowPendingDelete) return;
    const studentId = String(rowPendingDelete.id);

    setIsDeleting(true);
    startTransition(async () => {
      try {
        const res = await removeStudentAction(classId, studentId);

        if (!res.ok) {
          showToast({
            title: "Failed to remove student",
            description: res.message ?? "Please try again.",
            variant: "error",
          });
          return;
        }

        if (Array.isArray(res.updatedStudents)) {
          setData(mapStudentsToRows(res.updatedStudents));
        } else {
          setData((prev) => prev.filter((r) => String(r.id) !== studentId));
        }

        showToast({
          title: "Student removed",
          description: res.message ?? "The student has been removed.",
          variant: "success",
        });

        router.refresh();
      } catch {
        showToast({
          title: "Network error",
          description: "Please try again.",
          variant: "error",
        });
      } finally {
        setIsDeleting(false);
        setConfirmOpen(false);
        setRowPendingDelete(null);
      }
    });
  }, [rowPendingDelete, classId, showToast, router]);

  const cancelDelete = useCallback(() => {
    setConfirmOpen(false);
    setRowPendingDelete(null);
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search"
            className="
              w-64 rounded-md border border-[var(--color-bg4)]
              bg-[var(--color-bg2)] px-3 py-2 text-sm
              text-[var(--color-text-primary)]
              placeholder:text-[var(--color-text-secondary)]
              focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]
            "
          />
          <span className="text-sm text-[var(--color-text-secondary)]">
            ({filtered.length}/{totalCount} Students)
          </span>
        </div>
        <Button
          href={`/classes/${encodeURIComponent(classId)}/students/add`}
          variant="primary"
          title="Add New Students"
          className="self-start sm:self-auto"
        >
          Add New Students
        </Button>
      </div>

      <div className="p-3">
        <CardTable
          columns={columns}
          rows={filtered}
          spacing="expanded"
          onDelete={requestDelete}
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

      {isPending && (
        <div className="text-xs text-[var(--color-text-secondary)]">
          Processing…
        </div>
      )}

      {/* Warning Modal */}
      <WarningModal
        open={confirmOpen}
        title="Remove this student?"
        message={<>This student will be removed from the class roster.</>}
        cancelLabel="Cancel"
        continueLabel={isDeleting ? "Removing…" : "Continue"}
        onCancel={cancelDelete}
        onContinue={isDeleting ? () => {} : confirmDelete}
      />
    </div>
  );
}
