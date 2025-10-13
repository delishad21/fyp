import { clampPct } from "@/services/class/helpers/class-helpers";

export function StatBar({
  pct,
  rightText,
}: {
  pct: number;
  rightText?: string;
}) {
  const p = clampPct(pct);
  return (
    <div className="flex items-center gap-2">
      <div className="relative h-2.5 w-full rounded-full bg-[var(--color-bg2)]">
        <div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{
            width: `${p}%`,
            background: "var(--color-primary)",
          }}
        />
      </div>
      <div className="shrink-0 text-xs text-[var(--color-text-secondary)]">
        {p}%{rightText ? ` • ${rightText}` : ""}
      </div>
    </div>
  );
}
