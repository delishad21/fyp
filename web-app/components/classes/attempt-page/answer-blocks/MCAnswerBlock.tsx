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
    <div className="mt-4 space-y-2">
      <div className="text-sm font-medium text-[var(--color-text-primary)]">
        Your answer:
      </div>

      {hasCorrectInfo ? (
        <ul className="mt-1 space-y-2">
          {options.map((opt) => {
            const isSelected = selected.includes(opt.id);
            const isCorrect = correctIds.includes(opt.id);

            const base = "rounded-md border px-3 py-2 text-sm transition";
            // Visual states
            const stateClass = isSelected
              ? isCorrect
                ? // Selected & correct -> green background
                  "bg-[var(--color-success)]/15 border-[var(--color-success)] font-semibold"
                : // Selected & incorrect -> red background
                  "bg-[var(--color-error)]/15 border-[var(--color-error)] font-semibold"
              : isCorrect
              ? // Not selected but correct -> green text emphasis
                "border-[var(--color-bg4)] font-semibold border-[var(--color-success)]"
              : // Neutral
                "border-[var(--color-bg4)] text-[var(--color-text-primary)]";

            return (
              <li key={opt.id} className={`${base} ${stateClass}`}>
                {opt.text}
              </li>
            );
          })}
        </ul>
      ) : (
        // Fallback: no correctness info — show only what student picked
        <ul className="ml-4 mt-1 list-disc text-sm text-[var(--color-text-primary)]">
          {selected.length ? (
            selected.map((id) => {
              const label = options.find((o) => o.id === id)?.text ?? id;
              return <li key={id}>{label}</li>;
            })
          ) : (
            <li className="text-[var(--color-text-secondary)]">No selection</li>
          )}
        </ul>
      )}
    </div>
  );
}
