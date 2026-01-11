import { useDraggable } from "@dnd-kit/core";
import { motion } from "framer-motion";
import { memo, useEffect, useRef, useState } from "react";
import {
  LaneItem,
  RESIZE_SPRING,
} from "@/services/class/helpers/scheduling/scheduling-helpers";
import ScheduleItemHoverCard from "./ScheduleItemHoverCard";

export const SpanPill = memo(function SpanPill({
  item,
  isDragging,
  isResizing,
  isSliding,
  suppressLayoutId,
  isSettling,
  onEditRequest,
  classTimezone,
}: {
  item: LaneItem;
  isDragging?: boolean;
  isResizing?: boolean;
  isSliding?: boolean;
  suppressLayoutId?: boolean;
  isSettling: boolean;
  onEditRequest?: (clientId: string) => void;
  classTimezone: string;
}) {
  const body = useDraggable({
    id: `pill-${item.clientId}`, // unique per instance
    disabled: false,
    data: {
      clientId: item.clientId,
      _id: item._id,
      kind: "pill",
      quizId: item.quizId,
      title: item.quizName,
      subjectColor: item.subjectColor,
    },
  });

  const left = useDraggable({
    id: `pill-left-${item.clientId}`,
    disabled: false,
    data: {
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
    id: `pill-right-${item.clientId}`,
    disabled: false,
    data: {
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
  const anchorRef = useRef<HTMLDivElement | null>(null);
  const [hoverOpen, setHoverOpen] = useState(false);
  const [hoverPos, setHoverPos] = useState<{ top: number; left: number } | null>(
    null
  );

  // Avoid suppressing layout on initial mount
  const didMountRef = useRef(false);
  useEffect(() => {
    didMountRef.current = true;
  }, []);

  const shouldSuppressNow = didMountRef.current
    ? isSliding ||
      ((isSettling || suppressLayoutId || isDragging) && !isResizing)
    : false;

  const layoutAnimationProps = shouldSuppressNow
    ? { layout: false }
    : { layout: true, layoutId: `pill-${item.clientId}` };

  const layoutTextAnimationProps = shouldSuppressNow
    ? { layout: false }
    : {
        layout: "position" as const,
        layoutId: `pill-text-${item.clientId}`,
        transition: { duration: 0.1 },
      };

  return (
    <motion.div
      {...layoutAnimationProps}
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ scale: 0.8, opacity: 0 }}
      transition={{
        layout: RESIZE_SPRING,
        scale: { duration: 0.2, ease: "easeOut" },
        opacity: { duration: 0.15, ease: "easeOut" },
      }}
      className="relative"
      style={{ gridColumn, gridRow, pointerEvents: "auto" }}
      onMouseLeave={() => {
        setHoverOpen(false);
        setHoverPos(null);
      }}
    >
      <div
        ref={(el) => {
          anchorRef.current = el;
          body.setNodeRef(el);
        }}
        {...body.listeners}
        {...body.attributes}
        className={[
          "relative h-9 px-2 pr-6 select-none",
          "bg-[var(--color-bg2)] text-[var(--color-text-primary)] shadow",
          item.clippedLeft ? "" : "rounded-l-full ",
          item.clippedRight ? "" : "rounded-r-full ",
          body.isDragging ? "opacity-0" : "opacity-100",
          "flex items-center cursor-grab active:cursor-grabbing",
        ].join(" ")}
        draggable={false}
        onDragStart={(e) => e.preventDefault()}
        // Right-click opens modal in parent
        onContextMenu={(e) => {
          e.preventDefault();
          onEditRequest?.(item.clientId);
        }}
        onMouseEnter={(e) => {
          if (body.isDragging || isResizing) return;
          setHoverPos({ top: e.clientY + 12, left: e.clientX + 12 });
          setHoverOpen(true);
        }}
        onMouseMove={(e) => {
          if (!hoverOpen) return;
          setHoverPos({ top: e.clientY + 12, left: e.clientX + 12 });
        }}
        title="Right-click to edit"
        style={{
          WebkitUserSelect: "none",
          userSelect: "none",
          ...(body.isDragging && body.transform
            ? {
                transform: `translate3d(${body.transform.x}px, ${body.transform.y}px, 0)`,
              }
            : undefined),
        }}
      >
        <motion.div {...layoutTextAnimationProps} className="min-w-0 flex-1">
          <div className="min-w-0 overflow-hidden flex items-center gap-2">
            <span
              className="h-2.5 w-2.5 rounded-full shrink-0"
              style={{
                background: item.subjectColor || "var(--color-primary)",
              }}
            />
            <span className="block w-full overflow-hidden text-ellipsis whitespace-nowrap text-sm font-medium select-none">
              {item.quizName || item.quizId}
            </span>
          </div>
        </motion.div>
      </div>
      {!isDragging && !isResizing && hoverOpen && (
        <ScheduleItemHoverCard
          open={hoverOpen}
          item={item}
          classTimezone={classTimezone}
          position={hoverPos}
        />
      )}

      {/* LEFT HANDLE (resize) */}
      {!item.clippedLeft && (
        <div
          ref={left.setNodeRef}
          {...left.listeners}
          {...left.attributes}
          className="absolute left-0 top-0 h-9 w-3 transition-colors cursor-ew-resize hover:bg-blue-500/10"
          style={{ zIndex: 2, touchAction: "none" }}
        />
      )}

      {/* RIGHT HANDLE (resize) */}
      {!item.clippedRight && (
        <div
          ref={right.setNodeRef}
          {...right.listeners}
          {...right.attributes}
          className="absolute right-0 top-0 h-9 w-3 transition-colors cursor-ew-resize hover:bg-blue-500/10"
          style={{ zIndex: 2, touchAction: "none" }}
        />
      )}
    </motion.div>
  );
});
