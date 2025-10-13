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
  const droppable = !isPast ? useDroppable({ id: dateISO }) : null;
  const setNodeRef = droppable?.setNodeRef;
  const isOver = droppable?.isOver ?? false;

  return (
    <div
      ref={setNodeRef as any}
      data-day={dateISO}
      data-past={isPast ? "1" : undefined}
      className={[
        "rounded-xl border transition-colors",
        isPast
          ? "opacity-50 border-[var(--color-bg4)] bg-[var(--color-bg3)]"
          : isOver
          ? "border-[var(--color-primary)] bg-[var(--color-bg2)]/60"
          : "border-[var(--color-bg4)] bg-[var(--color-bg3)]",
        isToday ? "outline outline-2 outline-[var(--color-primary)]" : "",
      ].join(" ")}
      style={{ minHeight: minPx - 6 }}
    />
  );
}
