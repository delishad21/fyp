"use client";

/**
 * QuizzesTable Component
 *
 * Purpose:
 *   - Renders a reusable `DataTable` specifically for quizzes.
 *   - Provides querying, editing, and deletion logic via server actions.
 *
 * Props:
 *   @param {InitialPayload} initial
 *     - Initial data payload for the table (rows, pagination, filters).
 *
 *   @param {ColumnDef[]} columns
 *     - Column definitions describing how quiz data is displayed.
 *
 * Behavior:
 *   - `onQuery`: Calls `queryQuizzes` server action to fetch filtered/paginated data.
 *   - `onEdit`: Navigates to `/quizzes/edit/:id` for the selected quiz.
 *   - `onDelete`: Calls `deleteQuizAction` server action to remove a quiz by ID.
 *
 * Integration:
 *   - Wraps `DataTable` and injects quiz-specific handlers.
 *   - Designed for quizzes page
 */

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import DataTable from "@/components/table/DataTable";
import type {
  ColumnDef,
  InitialPayload,
  RowData,
} from "@/services/quiz/types/quiz-table-types";
import { queryQuizzes } from "@/services/quiz/actions/query-quiz-action";
import { deleteQuizAction } from "@/services/quiz/actions/delete-quiz-action";

export default function QuizzesTable({
  initial,
  columns,
  draggable = false,
  editable = true,
}: {
  initial: InitialPayload;
  columns: ColumnDef[];
  draggable?: boolean;
  editable?: boolean;
}) {
  const router = useRouter();

  const onQuery = useCallback(async (q: InitialPayload["query"]) => {
    return await queryQuizzes(q);
  }, []);

  const onEdit = useCallback(
    (row: RowData) => {
      router.push(`/quizzes/edit/${row.id}`);
    },
    [router]
  );

  const onDelete = useCallback(
    async (row: RowData) => {
      return await deleteQuizAction(String(row.id));
    },
    [router]
  );

  return (
    <DataTable
      columns={columns}
      initial={initial}
      onQuery={onQuery}
      onEdit={onEdit}
      onDelete={onDelete}
      draggable={draggable}
      editable={editable}
    />
  );
}
