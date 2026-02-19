"use client";

import { useDraggable } from "@dnd-kit/core";
import type { LaneItem } from "@/services/class/helpers/scheduling/scheduling-helpers";

export default function ScheduleSpanPill({
  item,
  classId,
  isDragging,
  isResizing,
  classTimezone,
  onEditRequest,
}: {
  item: LaneItem;
  classId: string;
  isDragging?: boolean;
  isResizing?: boolean;
  classTimezone: string;
  onEditRequest?: (clientId: string) => void;
}) {
  const body = useDraggable({
    id: `sched-pill-${classId}-${item.clientId}`,
    disabled: false,
    data: {
      classId,
      clientId: item.clientId,
      _id: item._id,
      kind: "pill",
      quizId: item.quizId,
      title: item.quizName,
      subjectColor: item.subjectColor,
    },
  });

  const left = useDraggable({
    id: `sched-pill-left-${classId}-${item.clientId}`,
    disabled: false,
    data: {
      classId,
      clientId: item.clientId,
      _id: item._id,
      kind: "pill-resize",
      dir: "left",
      quizId: item.quizId,
      title: item.quizName,
      subjectColor: item.subjectColor,
    },
  });

  const right = useDraggable({
    id: `sched-pill-right-${classId}-${item.clientId}`,
    disabled: false,
    data: {
      classId,
      clientId: item.clientId,
      _id: item._id,
      kind: "pill-resize",
      dir: "right",
      quizId: item.quizId,
      title: item.quizName,
      subjectColor: item.subjectColor,
    },
  });

  const gridColumn = `${item.colStart} / ${item.colEnd + 1}`;
  const gridRow = `${item.lane + 1} / ${item.lane + 2}`;

  return (
    <div
      className="relative"
      style={{ gridColumn, gridRow, pointerEvents: "auto" }}
      title={`${item.quizName || item.quizId} (${classTimezone})`}
    >
      <div
        ref={body.setNodeRef}
        {...body.listeners}
        {...body.attributes}
        className={[
          "relative h-9 px-2 pr-6 select-none",
          "bg-[var(--color-bg2)] text-[var(--color-text-primary)] shadow",
          item.clippedLeft ? "" : "rounded-l-full ",
          item.clippedRight ? "" : "rounded-r-full ",
          isDragging || body.isDragging ? "opacity-0" : "opacity-100",
          isResizing ? "ring-1 ring-[var(--color-primary)]" : "",
          "flex items-center cursor-grab active:cursor-grabbing",
        ].join(" ")}
        draggable={false}
        onDragStart={(e) => e.preventDefault()}
        onContextMenu={(e) => {
          e.preventDefault();
          onEditRequest?.(item.clientId);
        }}
      >
        <div className="min-w-0 flex-1 overflow-hidden flex items-center gap-2">
          <span
            className="h-2.5 w-2.5 rounded-full shrink-0"
            style={{
              background: item.subjectColor || "var(--color-primary)",
            }}
          />
          <span className="block w-full overflow-hidden text-ellipsis whitespace-nowrap text-sm font-medium">
            {item.quizName || item.quizId}
          </span>
        </div>
      </div>

      {!item.clippedLeft && (
        <div
          ref={left.setNodeRef}
          {...left.listeners}
          {...left.attributes}
          className="absolute left-0 top-0 h-9 w-3 cursor-ew-resize transition-colors hover:bg-blue-500/10"
          style={{ zIndex: 2, touchAction: "none" }}
        />
      )}

      {!item.clippedRight && (
        <div
          ref={right.setNodeRef}
          {...right.listeners}
          {...right.attributes}
          className="absolute right-0 top-0 h-9 w-3 cursor-ew-resize transition-colors hover:bg-blue-500/10"
          style={{ zIndex: 2, touchAction: "none" }}
        />
      )}
    </div>
  );
}
