"use client";

import { useDraggable } from "@dnd-kit/core";
import type { QuizRowPayload } from "./types";

export default function QuizBankCard({
  rowId,
  quiz,
}: {
  rowId: string;
  quiz: QuizRowPayload;
}) {
  const dragData = {
    kind: "quiz-row" as const,
    rowId,
    quiz: {
      id: quiz.id,
      title: quiz.title,
      subject: quiz.subject,
      subjectColorHex: quiz.subjectColorHex,
      topic: quiz.topic,
      type: quiz.type,
      createdAt: quiz.createdAt,
      rootQuizId: quiz.rootQuizId || quiz.id,
      version: typeof quiz.version === "number" ? quiz.version : null,
    },
  };

  const { setNodeRef, listeners, attributes, isDragging } = useDraggable({
    id: `quiz-bank-${rowId}`,
    data: dragData,
  });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={[
        "cursor-grab rounded-md border border-[var(--color-bg4)] bg-[var(--color-bg1)] p-3 w-[280px]",
        "transition hover:bg-[var(--color-bg2)] active:cursor-grabbing",
        isDragging ? "opacity-50" : "",
      ].join(" ")}
      title="Drag onto a class day cell to schedule"
    >
      <div className="flex items-start gap-2">
        <span
          className="mt-1 inline-block h-2.5 w-2.5 rounded-full shrink-0"
          style={{
            background: quiz.subjectColorHex || "var(--color-primary)",
          }}
        />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-[var(--color-text-primary)]">
            {quiz.title || "Untitled quiz"}
          </p>
          <p className="truncate text-xs text-[var(--color-text-secondary)]">
            {quiz.subject || "—"}
            {quiz.topic ? ` • ${quiz.topic}` : ""}
          </p>
          <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
            {quiz.type || "Unknown"} • v{quiz.version ?? 1}
          </p>
        </div>
      </div>
    </div>
  );
}
