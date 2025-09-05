/**
 * Index Button
 *
 * Reusable button for:
 *  - QuestionSelector (with hasError + delete-on-right-click)
 *  - Pagination (clean numeric buttons)
 *
 * Props:
 *   - index: numeric index (0-based)
 *   - active: highlight as selected
 *   - hasError?: show error style (QuestionSelector only)
 *   - label: string/ReactNode inside
 *   - title?: tooltip
 *   - onSelect: click handler
 *   - onDelete?: right-click handler (QuestionSelector only)
 *   - variant?: "selector" | "pagination" (default = "selector")
 */

"use client";
import clsx from "clsx";
import React from "react";

export default function IndexButton({
  index,
  active,
  hasError,
  label,
  title,
  onDelete,
  onSelect,
  variant = "selector",
}: {
  index: number;
  active: boolean;
  hasError?: boolean;
  label: React.ReactNode;
  title?: string;
  onDelete?: (index: number) => void;
  onSelect: (index: number) => void;
  variant?: "selector" | "pagination";
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(index)}
      onContextMenu={(e) => {
        if (!onDelete) return;
        e.preventDefault();
        onDelete(index);
      }}
      className={clsx(
        "grid place-items-center select-none transition",
        variant === "selector" &&
          "h-7 w-7 rounded-full text-[11px] font-medium",
        variant === "pagination" && "h-8 w-8 rounded-full text-sm font-normal",
        active
          ? "bg-[var(--color-primary)] text-white"
          : hasError && variant === "selector"
          ? "bg-[var(--color-error)] text-[var(--color-text-secondary)] hover:opacity-90"
          : "text-[var(--color-text-secondary)] hover:bg-[var(--color-bg3)]"
      )}
      title={title}
    >
      <span className="truncate">{label}</span>
    </button>
  );
}
