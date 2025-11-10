import { Cell, CrosswordPlacedEntry } from "@/services/quiz/types/quizTypes";
import * as React from "react";

type Props = {
  grid: Cell[][];
  entries?: CrosswordPlacedEntry[];
  cellSize?: number; // px per cell (default 40)
  showCoords?: boolean;

  /**
   * Optional per-cell status overlay.
   * - Same shape as `grid`
   * - Only applied to non-blocked cells
   * - 'correct' => success ring, 'wrong' => error ring, null/undefined => no highlight
   */
  statusByCell?: ("correct" | "wrong" | null)[][];
};

export default function CrosswordGrid({
  grid,
  entries = [],
  cellSize = 40,
  showCoords = false,
  statusByCell,
}: Props) {
  const rows = grid.length;
  const cols = grid[0]?.length ?? 0;

  // number the first cell of each entry
  const numbers = React.useMemo(() => {
    const map = new Map<string, number>();
    entries.forEach((e, i) => {
      const first = e.positions?.[0];
      if (first) map.set(`${first.row}:${first.col}`, i + 1);
    });
    return map;
  }, [entries]);

  return (
    <div
      className="grid gap-[1px] bg-[var(--color-bg4)] p-[1px] rounded"
      style={{
        gridTemplateColumns: `repeat(${cols}, ${cellSize}px)`,
        gridAutoRows: `${cellSize}px`,
      }}
      role="grid"
    >
      {grid.map((row, r) =>
        row.map((cell, c) => {
          const key = `${r}:${c}`;
          const number = numbers.get(key);
          const status = statusByCell?.[r]?.[c] ?? null; // 'correct' | 'wrong' | null

          const ringClass =
            !cell.isBlocked && status === "correct"
              ? "ring-2 ring-[var(--color-success)] ring-offset-0"
              : !cell.isBlocked && status === "wrong"
              ? "ring-2 ring-[var(--color-error)] ring-offset-0"
              : "";

          return (
            <div
              key={key}
              role="gridcell"
              className={[
                "relative flex items-center justify-center select-none",
                "text-[15px] font-semibold",
                "border border-[var(--color-bg4)]",
                cell.isBlocked
                  ? "bg-[var(--color-bg4)]"
                  : "bg-[var(--color-bg2)]",
                cell.letter
                  ? "text-[var(--color-text-primary)]"
                  : "text-transparent",
                ringClass,
                "rounded-sm",
              ].join(" ")}
            >
              {number && (
                <span className="absolute left-0.5 top-0.5 text-[10px] leading-none text-[var(--color-text-secondary)]">
                  {number}
                </span>
              )}
              <span className="uppercase tracking-wide">
                {cell.letter ?? ""}
              </span>
              {showCoords && (
                <span className="absolute right-0.5 bottom-0.5 text-[9px] leading-none text-[var(--color-text-secondary)]/70">
                  {r},{c}
                </span>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
