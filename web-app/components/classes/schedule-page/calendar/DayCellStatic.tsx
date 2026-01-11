export function DayCellStatic({
  dateISO,
  isToday,
  isPast,
  minPx,
}: {
  dateISO: string;
  isToday: boolean;
  isPast: boolean;
  minPx: number;
}) {
  return (
    <div
      data-day={dateISO}
      data-past={isPast ? "1" : undefined}
      className={[
        "rounded-lg border",
        isPast
          ? "opacity-50 border-[var(--color-bg4)] bg-[var(--color-bg3)]"
          : "border-[var(--color-bg4)] bg-[var(--color-bg3)]",
        isToday ? "outline-2 outline-[var(--color-primary)]" : "",
      ].join(" ")}
      style={{ minHeight: minPx - 6 }}
    />
  );
}
