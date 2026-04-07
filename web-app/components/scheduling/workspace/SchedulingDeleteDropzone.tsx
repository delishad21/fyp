"use client";

import { useDroppable } from "@dnd-kit/core";
import { Icon } from "@iconify/react";

export default function SchedulingDeleteDropzone({
  visible,
}: {
  visible: boolean;
}) {
  const { isOver, setNodeRef } = useDroppable({
    id: "trash",
    disabled: !visible,
  });

  if (!visible) return null;

  return (
    <div
      ref={setNodeRef}
      className={[
        "flex min-h-20 min-w-[280px] items-center justify-center gap-3 rounded-lg border border-dashed px-6 py-4 text-base font-medium transition",
        isOver
          ? "border-[var(--color-error)] bg-[color-mix(in_srgb,var(--color-error)_12%,transparent)] text-[var(--color-error)]"
          : "border-[var(--color-bg4)] bg-[var(--color-bg1)] text-[var(--color-text-secondary)]",
      ].join(" ")}
    >
      <Icon icon="mingcute:delete-2-line" className="h-6 w-6" />
      <span>Drag here to delete</span>
    </div>
  );
}
