import { getAnswerValue } from "@/services/class/helpers/class-helpers";

export function MCAnswerBlock({
  itemId,
  options,
  answers,
  breakdownMeta,
}: {
  itemId: string;
  options: { id: string; text: string }[];
  answers: Record<string, unknown>;
  breakdownMeta?: { correct?: string[] } | null;
}) {
  // Selected by student (array of option IDs)
  const raw = getAnswerValue(itemId, answers);
  const selected: string[] = Array.isArray(raw)
    ? (raw as string[])
    : typeof raw === "string"
      ? [raw]
      : [];

  // Correct option IDs from breakdown meta (when available)
  const correctIds: string[] = Array.isArray(breakdownMeta?.correct)
    ? breakdownMeta.correct
    : [];

  // If we have no meta.correct, fall back to a simple list of selected answers
  const hasCorrectInfo = correctIds.length > 0;

  return (
    <div className="mt-5 space-y-3">
      <div className="text-sm font-semibold text-[var(--color-text-primary)] flex items-center gap-2">
        <span>Your answer:</span>
      </div>

      {hasCorrectInfo ? (
        <ul className="space-y-2.5">
          {options.map((opt) => {
            const isSelected = selected.includes(opt.id);
            const isCorrect = correctIds.includes(opt.id);

            const base =
              "rounded-lg border-2 px-4 py-3 text-sm transition-all flex items-center gap-3";
            // Visual states
            const stateClass = isSelected
              ? isCorrect
                ? // Selected & correct -> green background
                  "bg-[var(--color-success)]/15 border-[var(--color-success)] font-semibold shadow-sm"
                : // Selected & incorrect -> red background
                  "bg-[var(--color-error)]/15 border-[var(--color-error)] font-semibold shadow-sm"
              : isCorrect
                ? // Not selected but correct -> green border emphasis
                  "border-[var(--color-success)]/50 bg-[var(--color-bg3)] font-semibold"
                : // Neutral
                  "border-[var(--color-bg4)] bg-[var(--color-bg3)] text-[var(--color-text-secondary)]";

            return (
              <li key={opt.id} className={`${base} ${stateClass}`}>
                <span className="flex-1">{opt.text}</span>
                {isSelected && (
                  <span className="text-xs font-bold uppercase tracking-wider">
                    {isCorrect ? "✓ Selected" : "✗ Selected"}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        // Fallback: no correctness info — show only what student picked
        <div className="space-y-2">
          {selected.length ? (
            selected.map((id) => {
              const label = options.find((o) => o.id === id)?.text ?? id;
              return (
                <div
                  key={id}
                  className="rounded-lg border-2 border-[var(--color-primary)] bg-[var(--color-primary)]/5 px-4 py-3 text-sm font-semibold"
                >
                  {label}
                </div>
              );
            })
          ) : (
            <div className="text-sm text-[var(--color-text-secondary)] italic px-4 py-3 bg-[var(--color-bg3)] rounded-lg">
              No selection made
            </div>
          )}
        </div>
      )}
    </div>
  );
}
