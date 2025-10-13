// components/attempt/views/CrosswordAttempt.tsx

import { breakdownMapCrossword } from "@/services/class/helpers/class-helpers";
import { CrosswordAttemptType } from "@/services/class/types/class-types";

export default function CrosswordAttempt({
  attempt,
}: {
  attempt: CrosswordAttemptType;
}) {
  const item = (attempt.quizVersionSnapshot.renderSpec.items ?? [])[0] as
    | {
        kind: "crossword";
        id: "crossword";
        totalTimeLimit: number | null;
        grid?: Array<Array<{ letter?: string | null; isBlocked: boolean }>>;
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
  const bmap = breakdownMapCrossword(attempt.breakdown);

  return (
    <div className="space-y-3 max-w-6xl mx-auto pb-6">
      {item.entries.map((e, i) => {
        const given = String(answersMap?.[e.id] ?? "");
        const bd = bmap.get(e.id);
        const awarded = bd?.awarded ?? 0;
        const max = bd?.max ?? 1;
        const correct = awarded >= max;

        return (
          <div key={e.id} className="rounded-md bg-[var(--color-bg3)] p-4">
            <div className="mb-2 flex items-center justify-between gap-3">
              <div className="text-sm font-semibold text-[var(--color-text-secondary)]">
                WORD {i + 1} • {e.direction ?? "—"}
              </div>
              <div
                className={[
                  "rounded-md px-2 py-1 text-md",
                  correct
                    ? "font-semibold bg-[var(--color-success)] text-[var(--color-text-primary)]"
                    : "font-semibold bg-[var(--color-error)] text-[var(--color-text-primary)]",
                ].join(" ")}
              >
                {awarded}/{max}
              </div>
            </div>

            <div className="text-[var(--color-text-primary)]">
              <div className="text-md font-bold">Clue:</div>
              <p className="mt-1 whitespace-pre-wrap">{e.clue}</p>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <div>
                <div className="text-md font-bold"> Your answer:</div>
                <div className="mt-1 rounded-md bg-[var(--color-bg2)] px-3 py-2 text-sm">
                  {given || "—"}
                </div>
              </div>
              <div>
                <div className="text-md font-bold"> Expected:</div>
                <div className="mt-1 rounded-sm bg-[var(--color-bg2)] px-3 py-2 text-sm">
                  {bd?.meta?.expected ?? "Hidden"}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
