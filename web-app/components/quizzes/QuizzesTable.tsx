"use client";

/**
 * QuizzesTable Component
 *
 * Purpose:
 *   - Renders a reusable `DataTable` specifically for quizzes.
 *   - Provides querying, editing, deletion, viewing, duplication.
 */

import { useCallback, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import DataTable from "@/components/table/DataTable";
import type {
  ColumnDef,
  InitialPayload,
  RowData,
} from "@/services/quiz/types/quiz-table-types";
import { queryQuizzes } from "@/services/quiz/actions/query-quiz-action";
import { deleteQuizAction } from "@/services/quiz/actions/delete-quiz-action";
import type { DragConfig } from "@/components/table/CardTable";
import { QuizLite } from "@/services/class/types/class-types";
import EmptyStateBox from "../ui/EmptyStateBox";
import Button from "../ui/buttons/Button";
import ScheduleQuizModal, {
  type ScheduleQuizAttemptResult,
} from "./ScheduleQuizModal";

export default function QuizzesTable({
  initial,
  columns,
  draggable = false,
  editable = true,
  schedulable = false,
  scheduleOnRowClick = false,
  onScheduleAttemptComplete,
  schedulingHint,
  showViewClassScheduleButtons,
  showGoToSchedulingButton,
}: {
  initial: InitialPayload;
  columns: ColumnDef[];
  draggable?: boolean;
  editable?: boolean;
  schedulable?: boolean;
  scheduleOnRowClick?: boolean;
  onScheduleAttemptComplete?: (result: ScheduleQuizAttemptResult) => void;
  schedulingHint?: ReactNode;
  showViewClassScheduleButtons?: boolean;
  showGoToSchedulingButton?: boolean;
}) {
  const router = useRouter();
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleRow, setScheduleRow] = useState<RowData | null>(null);

  const onQuery = useCallback(async (q: InitialPayload["query"]) => {
    return await queryQuizzes(q);
  }, []);

  const onEdit = useCallback(
    (row: RowData) => {
      router.push(`/quizzes/edit/${row.id}`);
    },
    [router]
  );

  const onView = useCallback(
    (row: RowData) => {
      router.push(`/quizzes/view/${row.id}`);
    },
    [router]
  );

  const onDuplicate = useCallback(
    (row: RowData) => {
      const payload = row.payload as
        | (QuizLite & { quizType?: string; type?: string })
        | undefined;
      const quizType = payload?.quizType || payload?.type;

      if (
        quizType === "basic" ||
        quizType === "crossword" ||
        quizType === "rapid"
      ) {
        router.push(`/quizzes/create/${quizType}?from=${row.id}`);
      } else {
        router.push(`/quizzes/duplicate/${row.id}`);
      }
    },
    [router]
  );

  const onDelete = useCallback(async (row: RowData) => {
    return await deleteQuizAction(String(row.id));
  }, []);

  const onSchedule = useCallback((row: RowData) => {
    setScheduleRow(row);
    setScheduleOpen(true);
  }, []);

  const closeSchedule = useCallback(() => {
    setScheduleOpen(false);
    setScheduleRow(null);
  }, []);

  // Quiz-specific drag payload for SchedulerBoard
  const dragConfig: DragConfig | undefined = useMemo(() => {
    if (!draggable) return undefined;

    return {
      enabled: true,
      getDragData: (row: RowData) => {
        const payload = row.payload as QuizLite | undefined;
        if (!payload) return undefined;

        return {
          kind: "quiz-row",
          rowId: row.id,
          quiz: {
            id: payload.id ?? String(row.id),
            title: payload.title,
            subject: payload.subject,
            subjectColorHex: payload.subjectColorHex,
            topic: payload.topic,
            type: payload.quizType ?? payload.type,
            createdAt: payload.createdAt,
            rootQuizId: payload.rootQuizId ?? payload.id ?? String(row.id),
            version:
              typeof payload.version === "number" ? payload.version : null,
          },
        };
      },
    };
  }, [draggable]);

  return (
    <>
      <DataTable
        columns={columns}
        initial={initial}
        onRowClick={
          schedulable && scheduleOnRowClick
            ? (row) => {
                onSchedule(row);
              }
            : undefined
        }
        onQuery={onQuery}
        onEdit={editable ? onEdit : undefined}
        onView={editable ? onView : undefined}
        onDuplicate={editable ? onDuplicate : undefined}
        onSchedule={
          schedulable && !scheduleOnRowClick ? onSchedule : undefined
        }
        onDelete={editable ? onDelete : undefined}
        draggable={draggable}
        editable={editable}
        dragConfig={dragConfig}
        preTableContent={schedulingHint}
        renderEmpty={() => (
          <EmptyStateBox
            title="You don't have any quizzes yet"
            description="Create your first quiz to get started."
            action={
              <Button href="/quizzes/create" variant="primary">
                Create New Quiz
              </Button>
            }
          />
        )}
      />

      <ScheduleQuizModal
        open={scheduleOpen}
        row={scheduleRow}
        onClose={closeSchedule}
        onAttemptComplete={onScheduleAttemptComplete}
        showViewClassScheduleButtons={showViewClassScheduleButtons}
        showGoToSchedulingButton={showGoToSchedulingButton}
      />
    </>
  );
}
