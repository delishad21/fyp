import CrosswordGrid from "@/components/quizzes/CrosswordGrid";
import type { CrosswordInitial, Cell } from "@/services/quiz/types/quizTypes";

/** Build a minimal grid from entries when no grid is stored. */
function buildFallbackGrid(entries: CrosswordInitial["entries"]) {
  if (!entries?.length) return [] as Cell[][];

  const maxRow =
    Math.max(
      0,
      ...entries.flatMap(
        (e) => (e as any).positions?.map((p: any) => Number(p.row ?? 0)) ?? []
      )
    ) + 1;
  const maxCol =
    Math.max(
      0,
      ...entries.flatMap(
        (e) => (e as any).positions?.map((p: any) => Number(p.col ?? 0)) ?? []
      )
    ) + 1;

  return Array.from({ length: maxRow }, () =>
    Array.from(
      { length: maxCol },
      () =>
        ({
          letter: "",
          isBlocked: false,
        } as Cell)
    )
  );
}

type Props = {
  data: CrosswordInitial;
};

export default function CrosswordQuizPreview({ data }: Props) {
  const hasGrid =
    Array.isArray(data.grid) &&
    data.grid.length > 0 &&
    Array.isArray(data.grid[0]);

  const grid: Cell[][] = hasGrid
    ? (data.grid as Cell[][])
    : buildFallbackGrid(data.entries ?? []);

  const entries =
    data.placedEntries && data.placedEntries.length
      ? data.placedEntries
      : // fallback: build minimal placed entries from base entries
        (data.entries ?? []).map((e) => ({
          id: e.id,
          answer: e.answer,
          clue: e.clue,
          direction: null,
          positions: [],
        }));

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-6">
      {/* Grid */}
      <div className="rounded-xl border border-[var(--color-bg4)] bg-[var(--color-bg3)] p-4">
        <div className="mb-3 text-sm font-semibold text-[var(--color-text-secondary)]">
          Crossword layout
        </div>
        <div className="overflow-auto">
          <CrosswordGrid grid={grid} entries={entries as any} cellSize={36} />
        </div>
      </div>

      {/* Clues list */}
      <div className="rounded-xl border border-[var(--color-bg4)] bg-[var(--color-bg3)] p-4">
        <h3 className="mb-3 text-sm font-semibold text-[var(--color-text-primary)]">
          Clues
        </h3>

        <div className="space-y-4 text-sm text-[var(--color-text-primary)]">
          {(data.entries ?? []).map((e, idx) => (
            <div key={e.id} className="rounded-md bg-[var(--color-bg2)] p-3">
              <div className="mb-1 flex items-center justify-between text-xs font-semibold text-[var(--color-text-secondary)]">
                <span>
                  WORD {idx + 1} • {e.answer?.length ?? 0} letters
                </span>
              </div>
              <div className="font-medium">Clue:</div>
              <p className="mt-1 whitespace-pre-wrap">{e.clue}</p>
              <div className="mt-2 text-xs text-[var(--color-text-secondary)]">
                Answer: <span className="font-semibold">{e.answer}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
