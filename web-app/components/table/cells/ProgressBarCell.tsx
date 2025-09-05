"use client";

/**
 * Cell for displaying a progress bar in a table
 */

import type { ProgressBarCell as ProgressBarCellType } from "../../../services/quiz/types/quiz-table-types";

export default function ProgressBarCell({ data }: ProgressBarCellType) {
  const { current, total, barColor, textColor } = data;
  const pct =
    total > 0 ? Math.min(100, Math.max(0, (current / total) * 100)) : 0;
  const pctText = `${pct.toFixed(2)}%`;
  const track = "var(--color-bg3)";
  const fill = barColor || "var(--color-primary)";
  const label = textColor || "var(--color-text-secondary)";

  return (
    <div className="flex min-w-0 items-center gap-2">
      <div
        className="relative h-2 w-full rounded-full"
        style={{ background: track }}
      >
        <div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{ width: `${pct}%`, background: fill }}
        />
      </div>
      <span className="shrink-0 text-xs" style={{ color: label }}>
        {pctText}
      </span>
    </div>
  );
}
