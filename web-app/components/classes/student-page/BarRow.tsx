import { normalizeHex } from "@/services/class/helpers/class-helpers";

/** Shared bar row (unchanged API) */
export function BarRow({
  label,
  left,
  pct,
  right,
  colorHex,
}: {
  label: string;
  left?: string;
  pct: number;
  right?: string;
  colorHex?: string;
}) {
  const clamped = Math.max(0, Math.min(100, pct || 0));
  const dot = normalizeHex(colorHex);

  return (
    <div className="flex flex-col gap-1 rounded-md bg-[var(--color-bg2)]/40 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 pb-2 text-sm font-medium text-[var(--color-text-primary)]">
          {dot ? (
            <span
              className="h-3.5 w-3.5 shrink-0 rounded-full"
              style={{ background: dot }}
            />
          ) : null}
          <span>{label}</span>
        </div>
        <div className="flex gap-2">
          <div className="text-right text-xs text-[var(--color-text-secondary)]">
            {right ?? `${clamped}%`}
          </div>
          <div className="text-xs text-[var(--color-text-secondary)]">
            {left ? `(${left})` : null}
          </div>
        </div>
      </div>
      <div className="relative h-2 w-full rounded-full bg-[var(--color-bg4)]">
        <div
          className="absolute left-0 top-0 h-2 rounded-full bg-[var(--color-primary)] transition-[width]"
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
}
