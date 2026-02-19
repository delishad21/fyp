"use client";

import QuizzesTable from "@/components/quizzes/QuizzesTable";
import type {
  ColumnDef,
  InitialPayload,
} from "@/services/quiz/types/quiz-table-types";
import type { ScheduleQuizAttemptResult } from "@/components/quizzes/ScheduleQuizModal";
import { Icon } from "@iconify/react/dist/iconify.js";

const QUIZ_COLUMNS: ColumnDef[] = [
  { header: "Name", width: 2 },
  { header: "Subject", width: 1 },
  { header: "Topic", width: 1 },
  { header: "Created", width: 1 },
  { header: "Type", width: 1 },
];

export default function SchedulingQuizzesTab({
  initial,
  onScheduleAttemptComplete,
}: {
  initial: InitialPayload;
  onScheduleAttemptComplete?: (result: ScheduleQuizAttemptResult) => void;
}) {
  return (
    <section>
      <QuizzesTable
        initial={initial}
        columns={QUIZ_COLUMNS}
        editable={false}
        schedulable
        scheduleOnRowClick
        onScheduleAttemptComplete={onScheduleAttemptComplete}
        showViewClassScheduleButtons={false}
        schedulingHint={
          <>
            <div className="flex-row flex items-center gap-2 rounded-lg border border-[var(--color-bg4)] bg-[var(--color-bg2)]/40 px-4 py-2 text-sm text-[var(--color-text-secondary)]">
              <Icon
                icon="mingcute:information-line"
                className="h-5 w-5 text-[var(--color-icon)]"
              />
              <span className="font-medium text-[var(--color-text-primary)]">
                Select any of the quizzes below to schedule them for multiple
                classes.
              </span>
            </div>
          </>
        }
      />
    </section>
  );
}
