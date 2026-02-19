"use client";

import { useDroppable } from "@dnd-kit/core";
import { tzDayKey } from "@/services/class/helpers/scheduling/scheduling-helpers";
import { makeCellDropId } from "../helpers/drop-target-ids";

export default function ClassDayDroppable({
  classId,
  dayKey,
  classTimezone,
  minPx,
}: {
  classId: string;
  dayKey: string;
  classTimezone: string;
  minPx: number;
}) {
  const todayKey = tzDayKey(new Date(), classTimezone);
  const isPast = dayKey < todayKey;

  const { setNodeRef, isOver } = useDroppable({
    id: makeCellDropId(classId, dayKey),
    disabled: isPast,
  });

  return (
    <div
      ref={setNodeRef}
      data-day={dayKey}
      data-past={isPast ? "1" : undefined}
      className={[
        "rounded-lg border transition-colors",
        isPast
          ? "opacity-50 border-[var(--color-bg4)] bg-[var(--color-bg3)]"
          : isOver
          ? "border-[var(--color-primary)] bg-[var(--color-bg2)]/60"
          : "border-[var(--color-bg4)] bg-[var(--color-bg3)]",
      ].join(" ")}
      style={{ minHeight: minPx - 6 }}
    />
  );
}
