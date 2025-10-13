export function OpenAnswerBlock({
  value,
  awarded,
  max,
}: {
  value: string;
  awarded: number;
  max: number;
}) {
  const isCorrect = max > 0 && awarded >= max;
  const isWrong = max > 0 && awarded <= 0;

  const base = "mt-1 rounded-md px-3 py-2 text-sm border transition";
  const stateClass = isCorrect
    ? "bg-[var(--color-success)]/15 border-[var(--color-success)] font-semibold"
    : isWrong
    ? "bg-[var(--color-error)]/15 border-[var(--color-error)] font-semibold"
    : "bg-[var(--color-bg2)] border-[var(--color-bg4)]";

  return (
    <div className="mt-3">
      <div className="text-sm font-medium text-[var(--color-text-primary)]">
        Your answer:
      </div>
      <div className={`${base} ${stateClass}`}>
        {value.trim() ? value : "—"}
      </div>
    </div>
  );
}
