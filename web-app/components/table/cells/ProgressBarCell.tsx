"use client";

/**
 * Cell for displaying a progress bar in a table
 * - Backwards-compatible: absValue/absMax are optional.
 * - Consistent bar width (bar flexes), compact right-side text box.
 */

import type { ProgressBarCell as ProgressBarCellType } from "../../../services/quiz/types/quiz-table-types";

export default function ProgressBarCell({ data }: ProgressBarCellType) {
  const { current, total, barColor, textColor } = data;

  // Optional absolute values — keep compatibility with existing type.
  const absValue: number | undefined = (data as any)?.absValue;
  const absMax: number | undefined = (data as any)?.absMax;

  const pct =
    total > 0 ? Math.min(100, Math.max(0, (current / total) * 100)) : 0;

  const pctText = `${pct.toFixed(2)}%`;
  const track = "var(--color-bg2)";
  const fill = barColor || "var(--color-primary)";
  const label = textColor || "var(--color-text-secondary)";

  // Build absolute label if provided
  let absText: string | null = null;
  if (
    Number.isFinite(absValue as number) &&
    Number.isFinite(absMax as number)
  ) {
    absText = `${Math.round(Number(absValue))}/${Math.round(Number(absMax))}`;
  } else if (Number.isFinite(absValue as number) && absMax == null) {
    absText = String(absValue);
  }

  return (
    <div className="flex min-w-0 items-center gap-2">
      {/* Bar takes remaining space and stays consistent across rows */}
      <div
        className="relative h-2.5 flex-1 min-w-[160px] rounded-full"
        style={{ background: track }}
      >
        <div
          className="absolute inset-y-0 left-0 overflow-hidden rounded-full"
          style={{ width: `${pct}%`, background: fill }}
        />
      </div>

      {/* Compact right-side text box with small internal gap */}
      <div
        className="shrink-0 w-[120px] flex items-center justify-start gap-1 text-xs text-right whitespace-nowrap"
        style={{ color: label }}
      >
        <span>{pctText}</span>
        {absText != null && <span>({absText})</span>}
      </div>
    </div>
  );
}
