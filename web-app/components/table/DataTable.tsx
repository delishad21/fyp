// components/table/DataTable.tsx
"use client";

import { useMemo, useEffect, useCallback, useState } from "react";
import CardTable from "./CardTable";
import Filters, { FiltersValue } from "./Filters";
import Pagination from "./Pagination";
import type {
  ColumnDef,
  InitialPayload,
  RowData,
} from "../../services/quiz/types/quiz-table-types";
import { useDebounced } from "@/services/quiz/quiz-table-helpers/hooks/useDebounced";
import { usePagedQuery } from "@/services/quiz/quiz-table-helpers/hooks/usePagedQuery";
import { useTableFilters } from "@/services/quiz/quiz-table-helpers/hooks/useTableFilters";
import { useToast } from "../ui/toast/ToastProvider";
import WarningModal from "../ui/WarningModal";

export default function DataTable({
  columns,
  initial,
  onQuery,
  onEdit,
  onDelete,
  draggable = false,
  editable = true,
}: {
  columns: ColumnDef[];
  initial: InitialPayload;
  onQuery: (q: InitialPayload["query"]) => Promise<{
    rows: RowData[];
    page: number;
    pageCount: number;
    total: number;
  }>;
  onEdit?: (row: RowData) => Promise<void> | void;
  onDelete?: (row: RowData) => Promise<{ ok: boolean; message?: string }>;
  draggable?: boolean;
  editable?: boolean;
}) {
  const filters = useTableFilters({
    name: initial.query.name,
    subjects: initial.query.subjects,
    topics: initial.query.topics,
    types: initial.query.types,
    createdStart: initial.query.createdStart,
    createdEnd: initial.query.createdEnd,
  });

  const { showToast } = useToast();
  const debouncedName = useDebounced(filters.value.name, 300);

  const { q, setQ, data, isPending, fetchWith, setPage, refetch, bumpSeq } =
    usePagedQuery(initial.query, onQuery);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [rowPendingDelete, setRowPendingDelete] = useState<RowData | null>(
    null
  );
  const [isDeleting, setIsDeleting] = useState(false);

  // Initial population of table
  useEffect(() => {
    fetchWith(initial.query);
  }, []);

  // Update table when filters change
  useEffect(() => {
    const filterPatch = {
      name: debouncedName,
      subjects: filters.value.subjects,
      topics: filters.value.topics,
      types: filters.value.types,
      createdStart: filters.value.createdStart,
      createdEnd: filters.value.createdEnd,
    };

    const filtersChanged =
      filterPatch.name !== q.name ||
      filterPatch.createdStart !== q.createdStart ||
      filterPatch.createdEnd !== q.createdEnd ||
      JSON.stringify(filterPatch.subjects) !== JSON.stringify(q.subjects) ||
      JSON.stringify(filterPatch.topics) !== JSON.stringify(q.topics) ||
      JSON.stringify(filterPatch.types) !== JSON.stringify(q.types);

    if (!filtersChanged) return;

    const next = { ...q, ...filterPatch, page: 1, pageSize: 10 };
    setQ(next);
    fetchWith(next);
  }, [debouncedName, filters.value, q, setQ, fetchWith]);

  const onFiltersChange = useCallback(
    (patch: Partial<FiltersValue>) => {
      filters.set(patch);
    },
    [filters]
  );

  const onReset = useCallback(() => {
    bumpSeq(); // cancel in-flight
    filters.reset();
    const next = {
      ...q,
      page: 1,
      pageSize: 10,
      name: "",
      subjects: [],
      topics: [],
      types: [],
      createdStart: undefined,
      createdEnd: undefined,
    };
    setQ(next);
    fetchWith(next);
  }, [bumpSeq, filters, q, setQ, fetchWith]);

  const onPageChange = useCallback((page: number) => setPage(page), [setPage]);

  // Step 1: when a delete is requested from CardTable, open the modal
  const requestDelete = useCallback(
    (row: RowData) => {
      if (!onDelete) return;
      setRowPendingDelete(row);
      setConfirmOpen(true);
    },
    [onDelete]
  );

  // Step 2: if user confirms, actually delete
  const confirmDelete = useCallback(async () => {
    if (!onDelete || !rowPendingDelete) return;
    setIsDeleting(true);
    try {
      const { ok, message } = await onDelete(rowPendingDelete);
      if (ok) {
        const shouldStepBack = data.rows.length <= 1 && data.page > 1;
        refetch(shouldStepBack ? q.page - 1 : q.page);
        showToast({
          title: "Success",
          description: `Quiz has successfully been deleted.`,
          variant: "success",
        });
      } else {
        showToast({
          title: "Failed to delete quiz.",
          description: message || "Failed to delete row.",
          variant: "error",
        });
      }
    } catch {
      showToast({
        title: "Error",
        description: "Failed to delete row.",
        variant: "error",
      });
    } finally {
      setIsDeleting(false);
      setConfirmOpen(false);
      setRowPendingDelete(null);
    }
  }, [
    onDelete,
    rowPendingDelete,
    data.rows.length,
    data.page,
    q.page,
    refetch,
    showToast,
  ]);

  const cancelDelete = useCallback(() => {
    setConfirmOpen(false);
    setRowPendingDelete(null);
  }, []);

  const filtersValue = useMemo<FiltersValue>(
    () => filters.value,
    [filters.value]
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-row gap-4 sm:items-end sm:justify-between">
        <Filters
          meta={initial.meta}
          value={filtersValue}
          onChange={onFiltersChange}
          onReset={onReset}
          isLoading={isPending}
        />
        <Pagination
          page={data.page}
          pageCount={data.pageCount}
          onPageChange={onPageChange}
        />
      </div>

      <div className="relative">
        <CardTable
          columns={columns}
          rows={data.rows}
          onEdit={editable ? onEdit : undefined}
          // 👇 intercept deletion with our confirmation modal
          onDelete={editable ? requestDelete : undefined}
          draggable={draggable}
        />
        {isPending && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center">
            <span className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--color-primary)] border-t-transparent" />
          </div>
        )}
      </div>

      {/* Confirmation Modal */}
      <WarningModal
        open={confirmOpen}
        title="Delete this quiz?"
        message={
          <>
            This action cannot be undone. The quiz and its data will be removed.
            All attempts related to quiz will also be deleted and invalidated.
            <br />
            <span className="text-[var(--color-text-secondary)]">
              Proceed with deletion?
            </span>
          </>
        }
        cancelLabel="Cancel"
        continueLabel={isDeleting ? "Deleting..." : "Continue"}
        onCancel={cancelDelete}
        onContinue={isDeleting ? () => {} : confirmDelete}
      />
    </div>
  );
}
