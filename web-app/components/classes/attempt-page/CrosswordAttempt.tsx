import CrosswordGrid from "@/components/quizzes/CrosswordGrid";
import { breakdownMapCrossword } from "@/services/class/helpers/class-helpers";
import { CrosswordAttemptType } from "@/services/class/types/class-types";
import type { Cell } from "@/services/quiz/types/quizTypes";

/** Build a student-populated grid by overlaying given answers on the snapshot grid. */
function buildStudentGrid(
  baseGrid: Cell[][],
  entries: Array<{
    id: string;
    positions: { row: number; col: number }[];
    direction: "across" | "down" | null;
  }>,
  answersMap: Record<string, string>,
) {
  // Deep clone
  const grid = baseGrid.map((row) =>
    row.map((cell) => ({
      letter: cell.letter ?? "",
      isBlocked: !!cell.isBlocked,
    })),
  );

  for (const e of entries) {
    const given = String(answersMap?.[e.id] ?? "").toUpperCase();
    for (let i = 0; i < e.positions.length; i++) {
      const { row, col } = e.positions[i];
      if (!grid[row]?.[col] || grid[row][col].isBlocked) continue;
      grid[row][col].letter = i < given.length ? given[i] : "";
    }
  }
  return grid;
}

/** Build per-cell status ('correct' | 'wrong' | null) using breakdown.expected only. */
function buildStatusByCellFromBreakdown(
  rows: number,
  cols: number,
  entries: {
    id: string;
    positions: { row: number; col: number }[];
  }[],
  givenById: Record<string, string>,
  expectedById: Record<string, string | undefined>,
) {
  const status: ("correct" | "wrong" | null)[][] = Array.from(
    { length: rows },
    () =>
      Array.from({ length: cols }, () => null as "correct" | "wrong" | null),
  );

  for (const e of entries) {
    const given = (givenById[e.id] ?? "").toUpperCase();
    const expectedMaybe = expectedById[e.id];
    if (!expectedMaybe) {
      // If we don't have an expected answer from breakdown, leave cells unhighlighted.
      continue;
    }
    const expected = expectedMaybe.toUpperCase();

    for (let i = 0; i < e.positions.length; i++) {
      const { row, col } = e.positions[i];
      const g = i < given.length ? given[i] : "";
      const ex = i < expected.length ? expected[i] : "";
      if (!g) continue; // leave blank cells unhighlighted
      status[row][col] = g === ex ? "correct" : "wrong";
    }
  }
  return status;
}

export default function CrosswordAttempt({
  attempt,
}: {
  attempt: CrosswordAttemptType;
}) {
  const item = (attempt.quizVersionSnapshot.renderSpec.items ?? [])[0] as
    | {
        kind: "crossword";
        id: "crossword";
        totalTimeLimit?: number | null;
        grid?: Cell[][];
        entries: Array<{
          id: string;
          clue: string;
          positions: { row: number; col: number }[];
          direction: "across" | "down" | null;
        }>;
      }
    | undefined;

  if (!item) return null;

  const answersMap =
    (attempt.answers?.["crossword"] as Record<string, string>) || {};

  // Map breakdown by itemId for quick lookup (awarded/max and meta.expected)
  const bmap = breakdownMapCrossword(attempt.breakdown);

  // Base grid: use snapshot grid or derive minimal one from entry bounds
  const baseGrid =
    item.grid && item.grid.length > 0
      ? item.grid
      : (() => {
          const maxRow =
            Math.max(
              0,
              ...item.entries.flatMap((e) => e.positions.map((p) => p.row)),
            ) + 1;
          const maxCol =
            Math.max(
              0,
              ...item.entries.flatMap((e) => e.positions.map((p) => p.col)),
            ) + 1;
          return Array.from({ length: maxRow }, () =>
            Array.from({ length: maxCol }, () => ({
              letter: "",
              isBlocked: false,
            })),
          );
        })();

  const studentGrid = buildStudentGrid(baseGrid, item.entries, answersMap);

  // Build expectedById strictly from breakdown.meta.expected
  const expectedById: Record<string, string | undefined> = {};
  for (const e of item.entries) {
    const bd = bmap.get(e.id);
    if (bd?.meta?.expected) expectedById[e.id] = String(bd.meta.expected);
  }

  const rows = studentGrid.length;
  const cols = studentGrid[0]?.length ?? 0;
  const statusByCell = buildStatusByCellFromBreakdown(
    rows,
    cols,
    item.entries.map((e) => ({ id: e.id, positions: e.positions })),
    answersMap,
    expectedById,
  );

  return (
    <div className="space-y-5 max-w-6xl mx-auto pb-6">
      {/* Student grid with correctness highlights (driven by breakdown) */}
      <div
        className="rounded-xl border border-[var(--color-bg4)] bg-[var(--color-bg2)] p-6"
        style={{ boxShadow: "var(--drop-shadow-sm)" }}
      >
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-[var(--color-text-secondary)]">
            <span className="px-2.5 py-1 bg-[var(--color-bg3)] rounded-md">
              Crossword
            </span>
            <span>Student Grid</span>
          </div>
          <div className="text-sm font-semibold">
            <span className="text-[var(--color-text-secondary)]">Score:</span>{" "}
            <span className="px-3 py-1 rounded-lg bg-[var(--color-primary)]/15 text-[var(--color-primary)] border border-[var(--color-primary)]">
              {attempt.score} / {attempt.maxScore}
            </span>
          </div>
        </div>
        <div className="overflow-auto">
          <CrosswordGrid
            grid={studentGrid}
            entries={item.entries}
            cellSize={36}
            showCoords={false}
            statusByCell={statusByCell}
          />
        </div>
      </div>

      {/* Per-entry answers (grade determined solely by breakdown awarded/max) */}
      <div className="space-y-3">
        {item.entries.map((e, i) => {
          const given = String(answersMap?.[e.id] ?? "");
          const bd = bmap.get(e.id);
          const awarded = bd?.awarded ?? 0;
          const max = bd?.max ?? 1;
          const correct = awarded >= max;

          return (
            <div
              key={e.id}
              className="rounded-xl bg-[var(--color-bg2)] p-5 border border-[var(--color-bg4)]"
              style={{ boxShadow: "var(--drop-shadow-sm)" }}
            >
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 text-xs font-bold uppercase tracking-wider text-[var(--color-text-secondary)]">
                  <span className="px-2.5 py-1 bg-[var(--color-bg3)] rounded-md">
                    Word {i + 1}
                  </span>
                  <span>{e.direction ?? "—"}</span>
                </div>
                <div
                  className={[
                    "rounded-lg px-3 py-1.5 text-sm font-bold border-2 shadow-sm",
                    correct
                      ? "bg-[var(--color-success)]/15 text-[var(--color-success)] border-[var(--color-success)]"
                      : "bg-[var(--color-error)]/15 text-[var(--color-error)] border-[var(--color-error)]",
                  ].join(" ")}
                >
                  {awarded}/{max}
                </div>
              </div>

              <div className="text-[var(--color-text-primary)] mb-4">
                <div className="text-sm font-semibold mb-2">Clue:</div>
                <p className="whitespace-pre-wrap leading-relaxed text-[var(--color-text-secondary)]">
                  {e.clue}
                </p>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div>
                  <div className="text-sm font-semibold text-[var(--color-text-primary)] mb-2">
                    Your answer:
                  </div>
                  <div
                    className={`rounded-lg px-4 py-3 text-sm font-medium border-2 ${
                      correct
                        ? "bg-[var(--color-success)]/15 border-[var(--color-success)] text-[var(--color-success)]"
                        : "bg-[var(--color-error)]/15 border-[var(--color-error)] text-[var(--color-error)]"
                    }`}
                  >
                    {given || (
                      <span className="italic text-[var(--color-text-secondary)]">
                        No answer
                      </span>
                    )}
                  </div>
                </div>
                <div>
                  <div className="text-sm font-semibold text-[var(--color-text-primary)] mb-2">
                    Expected:
                  </div>
                  <div className="rounded-lg bg-[var(--color-bg3)] border border-[var(--color-bg4)] px-4 py-3 text-sm font-medium">
                    {bd?.meta?.expected ?? (
                      <span className="italic text-[var(--color-text-secondary)]">
                        Hidden
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
