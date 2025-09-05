"use client";

/**
 * DataTable Component
 *
 * Purpose:
 *   - A full-featured, paginated, filterable, and editable/deletable table
 *     for displaying quiz rows (or similar entities).
 *   - Orchestrates filters, pagination, querying, and row-level actions.
 *
 * Props:
 *   @param {ColumnDef[]} columns
 *     - Column definitions (headers, widths, alignments, etc.).
 *
 *   @param {InitialPayload} initial
 *     - Initial server-side payload (rows, pagination, filter metadata, and query).
 *
 *   @param {(q: InitialPayload["query"]) => Promise<{ rows: RowData[], page: number, pageCount: number, total: number }>} onQuery
 *     - Function to fetch rows given a query object (server action or API call).
 *
 *   @param {(row: RowData) => Promise<void> | void} [onEdit]
 *     - Optional callback for editing a row.
 *
 *   @param {(row: RowData) => Promise<{ ok: boolean; message?: string }>} [onDelete]
 *     - Optional callback for deleting a row (should return a boolean success flag).
 *
 * Behavior:
 *   - Maintains filter state (debounced for name) via `useTableFilters`.
 *   - Promotes draft filters into committed queries with automatic fetch.
 *   - Uses `usePagedQuery` to manage pagination, refetching, and cancellation.
 *   - Provides reset functionality to clear filters and restart queries.
 *   - Handles row deletion and auto-adjusts pagination if last row is deleted.
 *   - Shows toasts to indicate successful deletion or errors.
 *
 * Integration:
 *   - Composes `Filters`, `Pagination`, and `CardTable` into one data table.
 *   - Displays loading overlay when queries are pending.
 *   - Flexible for quizzes or other entities that share the same query shape.
 */

import { useMemo, useEffect, useCallback } from "react";
import CardTable from "./CardTable";
import Filters, { FiltersValue } from "./Filters";
import Pagination from "./Pagination";
import type {
  ColumnDef,
  FilterMeta,
  InitialPayload,
  RowData,
} from "../../services/quiz/types/quiz-table-types";
import { useDebounced } from "@/services/quiz/quiz-table-helpers/useDebounced";
import { usePagedQuery } from "@/services/quiz/quiz-table-helpers/usePagedQuery";
import { useTableFilters } from "@/services/quiz/quiz-table-helpers/useTableFilters";
import { useToast } from "../ui/toast/ToastProvider";

export default function DataTable({
  columns,
  initial,
  onQuery,
  onEdit,
  onDelete,
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

  const handleDelete = useCallback(
    async (row: RowData) => {
      if (!onDelete) return;
      try {
        const { ok, message } = await onDelete(row);
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
      }
    },
    [onDelete, refetch, data.rows.length, data.page, q.page]
  );

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
          onEdit={onEdit}
          onDelete={handleDelete}
        />
        {isPending && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center">
            <span className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--color-primary)] border-t-transparent" />
          </div>
        )}
      </div>
    </div>
  );
}
