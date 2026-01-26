import CrosswordGrid from "@/components/quizzes/CrosswordGrid";
import type {
  CrosswordInitial,
  CrosswordPlacedEntry,
  Cell,
} from "@/services/quiz/types/quizTypes";
import { Icon } from "@iconify/react";

/** Build a minimal grid from entries when no grid is stored. */
function buildFallbackGrid(entries?: CrosswordPlacedEntry[]) {
  if (!entries?.length) return [] as Cell[][];

  const maxRow =
    Math.max(
      0,
      ...entries.flatMap((e) => e.positions.map((p) => Number(p.row ?? 0))),
    ) + 1;
  const maxCol =
    Math.max(
      0,
      ...entries.flatMap((e) => e.positions.map((p) => Number(p.col ?? 0))),
    ) + 1;

  return Array.from({ length: maxRow }, () =>
    Array.from(
      { length: maxCol },
      () =>
        ({
          letter: "",
          isBlocked: false,
        }) as Cell,
    ),
  );
}

type Props = {
  data: CrosswordInitial;
  showEditButtons?: boolean;
  onEditQuestion?: (questionIndex: number) => void;
};

export default function CrosswordQuizPreview({
  data,
  showEditButtons = false,
  onEditQuestion,
}: Props) {
  const hasGrid =
    Array.isArray(data.grid) &&
    data.grid.length > 0 &&
    Array.isArray(data.grid[0]);

  const grid: Cell[][] = hasGrid
    ? (data.grid as Cell[][])
    : buildFallbackGrid(data.placedEntries);

  const entries =
    data.placedEntries && data.placedEntries.length
      ? data.placedEntries.map((e) => ({ id: e.id, positions: e.positions }))
      : // fallback: build minimal placed entries from base entries
        (data.entries ?? []).map((e) => ({
          id: e.id,
          positions: [],
        }));

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-6">
      {/* Grid */}
      <div
        className="rounded-xl border border-[var(--color-bg4)] bg-[var(--color-bg2)] p-6 relative"
        style={{ boxShadow: "var(--drop-shadow-sm)" }}
      >
        {showEditButtons && onEditQuestion && (
          <button
            onClick={() => onEditQuestion(0)}
            className="absolute top-4 right-4 p-2.5 rounded-lg bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-dark)] transition-all shadow-md z-10"
            title="Edit crossword"
          >
            <Icon icon="mdi:pencil" className="w-4 h-4" />
          </button>
        )}
        <div className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-[var(--color-text-secondary)]">
          <Icon icon="mdi:grid" className="w-4 h-4" />
          <span>Crossword Grid</span>
        </div>
        <div className="overflow-auto">
          <CrosswordGrid grid={grid} entries={entries} cellSize={36} />
        </div>
      </div>

      {/* Clues list */}
      <div
        className="rounded-xl border border-[var(--color-bg4)] bg-[var(--color-bg2)] p-6"
        style={{ boxShadow: "var(--drop-shadow-sm)" }}
      >
        <h3 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-[var(--color-text-primary)]">
          <Icon icon="mdi:lightbulb-outline" className="w-4 h-4" />
          <span>Clues</span>
        </h3>

        <div className="space-y-3 text-sm text-[var(--color-text-primary)]">
          {(data.entries ?? []).map((e, idx) => (
            <div
              key={e.id}
              className="rounded-xl bg-[var(--color-bg3)] p-4 relative border border-[var(--color-bg4)] hover:border-[var(--color-primary)]/30 transition-all"
            >
              {showEditButtons && onEditQuestion && (
                <button
                  onClick={() => onEditQuestion(idx)}
                  className="absolute top-3 right-3 p-1.5 rounded-lg bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-dark)] transition-all shadow-sm"
                  title="Edit this clue"
                >
                  <Icon icon="mdi:pencil" className="w-3.5 h-3.5" />
                </button>
              )}
              <div className="mb-2 flex items-center justify-between text-xs font-bold uppercase tracking-wider text-[var(--color-text-secondary)]">
                <span className="px-2 py-1 bg-[var(--color-bg4)] rounded">
                  Word {idx + 1}
                </span>
                <span className="px-2 py-1 bg-[var(--color-bg4)] rounded">
                  {e.answer?.length ?? 0} letters
                </span>
              </div>
              <div className="font-semibold text-[var(--color-text-primary)] mb-2">
                Clue:
              </div>
              <p className="mt-1 mb-3 whitespace-pre-wrap leading-relaxed text-[var(--color-text-secondary)]">
                {e.clue}
              </p>
              <div className="mt-3 pt-3 border-t border-[var(--color-bg4)] text-xs flex items-center gap-2">
                <span className="text-[var(--color-text-secondary)]">
                  Answer:
                </span>
                <span className="font-bold text-[var(--color-text-primary)] tracking-wider bg-[var(--color-bg2)] px-2 py-1 rounded">
                  {e.answer}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
