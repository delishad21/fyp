import { useDroppable } from "@dnd-kit/core";

export function DayDroppable({
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
  const { setNodeRef, isOver } = useDroppable({
    id: dateISO,
    disabled: isPast,
  });

  return (
    <div
      ref={setNodeRef}
      data-day={dateISO}
      data-past={isPast ? "1" : undefined}
      className={[
        "rounded-lg border transition-colors",
        isPast
          ? "opacity-50 border-[var(--color-bg4)] bg-[var(--color-bg3)]"
          : isOver
          ? "border-[var(--color-primary)] bg-[var(--color-bg2)]/60"
          : "border-[var(--color-bg4)] bg-[var(--color-bg3)]",
        isToday ? "outline-2 outline-[var(--color-primary)]" : "",
      ].join(" ")}
      style={{ minHeight: minPx - 6 }}
    />
  );
}
