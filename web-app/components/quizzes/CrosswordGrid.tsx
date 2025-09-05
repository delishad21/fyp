import { Cell, CrosswordPlacedEntry } from "@/services/quiz/types/quizTypes";
import * as React from "react";

/**
 * CrosswordGrid Component
 *
 * Purpose:
 *   - Renders a crossword puzzle grid as a visual matrix of cells.
 *   - Supports numbering clue start positions and showing coordinates for debugging.
 *
 * Props:
 *   @param {Cell[][]} grid
 *     - 2D array of `Cell` objects describing the crossword board.
 *       • Each cell may contain { letter?: string; isBlocked?: boolean }.
 *
 *   @param {CrosswordPlacedEntry[]} [entries=[]]
 *     - Optional list of placed entries used to number starting cells.
 *     - Numbers are displayed in the top-left corner of each first cell.
 *
 *   @param {number} [cellSize=40]
 *     - Pixel size of each grid cell (width and height).
 *
 *   @param {boolean} [showCoords=false]
 *     - If true, displays row/column coordinates in the bottom-right corner of each cell.
 *
 * Behavior:
 *   - Uses CSS Grid to lay out rows × cols of crossword cells.
 *   - Blocked cells are shaded; open cells show letters if present.
 *   - Clue numbers are assigned sequentially from the `entries` prop.
 *
 * UI:
 *   - Each cell:
 *       • Displays a letter (uppercase) if available, otherwise empty.
 *       • Shows a small clue number in the top-left if marked as a start.
 *       • Optionally shows (row,col) coordinates for debugging.
 *
 */

type Props = {
  grid: Cell[][];
  entries?: CrosswordPlacedEntry[];
  cellSize?: number; // px per cell (default 40)
  showCoords?: boolean;
};

export default function CrosswordGrid({
  grid,
  entries = [],
  cellSize = 40,
  showCoords = false,
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
