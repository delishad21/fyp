"use client";

/**
 * Cell for displaying labels in a table
 */

import type { LabelCell as LabelCellType } from "../../../services/quiz/types/quiz-table-types";

export default function LabelCell({ data }: LabelCellType) {
  const { text, dotColor, textColor, bold } = data;
  return (
    <span className="flex items-center gap-2 leading-none">
      <span
        className="h-3.5 w-3.5 rounded-full"
        style={{ background: dotColor ?? "var(--color-primary)" }}
      />
      <span
        className={bold ? "font-semibold" : undefined}
        style={{ color: textColor ?? "var(--color-text-primary)" }}
      >
        {text}
      </span>
    </span>
  );
}
