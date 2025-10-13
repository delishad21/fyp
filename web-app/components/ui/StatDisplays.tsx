export function BarStat({
  label,
  valuePct,
  absValue,
  absMax,
}: {
  label: string;
  valuePct: number;
  absValue?: number;
  absMax?: number;
}) {
  const pct = Math.max(
    0,
    Math.min(100, Number.isFinite(valuePct) ? valuePct : 0)
  );
  const hasAbs =
    typeof absValue === "number" &&
    typeof absMax === "number" &&
    Number.isFinite(absValue) &&
    Number.isFinite(absMax);

  const fmt = (n: number) => Math.round(n);

  return (
    <div className="flex items-center h-3 gap-3">
      <div className="min-w-[9rem] text-md text-[var(--color-text-primary)]">
        {label}
      </div>

      <div className="relative h-2.5 w-full rounded-full bg-[var(--color-bg4)]">
        <div
          className="absolute left-0 top-0 h-2.5 rounded-full bg-[var(--color-primary)] transition-[width]"
          style={{ width: `${pct}%` }}
        />
      </div>

      <div
        className={`flex items-center justify-end gap-2 min-w-[${
          hasAbs ? "6rem" : "3rem"
        }] text-sm`}
      >
        {hasAbs && (
          <span className="text-[var(--color-text-secondary)]">
            {fmt(absValue!)}/{fmt(absMax!)}
          </span>
        )}
        <span className="w-12 text-right">{pct}%</span>
      </div>
    </div>
  );
}

export function KpiStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center h-3">
      <div className="text-md text-[var(--color-text-primary)] pr-10">
        {label}
      </div>
      <div className="text-lg font-semibold text-[var(--color-text-primary)]">
        {value}
      </div>
    </div>
  );
}

export function KpiStatBorder({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md bg-[var(--color-bg2)] px-4 py-3">
      <div className="text-sm text-[var(--color-text-secondary)]">{label}</div>
      <div className="text-md font-medium text-[var(--color-text-primary)]">
        {value}
      </div>
    </div>
  );
}

export function EmptyLine({ text }: { text: string }) {
  return (
    <div className="rounded-md bg-[var(--color-bg2)]/40 px-3 py-2 text-sm text-[var(--color-text-secondary)]">
      {text}
    </div>
  );
}
