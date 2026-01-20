import { isDragging, motion } from "framer-motion";
import { memo, useEffect, useRef, useState } from "react";
import {
  LaneItem,
  RESIZE_SPRING,
} from "@/services/class/helpers/scheduling/scheduling-helpers";
import ScheduleItemHoverCard from "./ScheduleItemHoverCard";

/** Read-only pill (no DnD) */
export const SpanPillStatic = memo(function SpanPillStatic({
  item,
  isSliding,
  isSettling,
  suppressLayoutId,
  classTimezone,
}: {
  item: LaneItem;
  isSliding?: boolean;
  isSettling: boolean;
  suppressLayoutId?: boolean;
  classTimezone: string;
}) {
  const gridColumn = `${item.colStart} / ${item.colEnd + 1}`;
  const gridRow = `${item.lane + 1} / ${item.lane + 2}`;

  const didMountRef = useRef(false);
  useEffect(() => {
    didMountRef.current = true;
  }, []);

  const shouldSuppressNow = didMountRef.current
    ? isSliding || isSettling || suppressLayoutId || isDragging
    : false;

  const layoutAnimationProps = shouldSuppressNow
    ? { layout: false }
    : { layout: true, layoutId: `pill-${item.clientId}-static` };

  const layoutTextAnimationProps = shouldSuppressNow
    ? { layout: false }
    : { layout: true, layoutId: `pill-text-${item.clientId}-static` };

  const [hoverOpen, setHoverOpen] = useState(false);
  const [hoverPos, setHoverPos] = useState<{ top: number; left: number } | null>(
    null
  );

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
        className={[
          "relative h-9 px-2 pr-6 select-none",
          "bg-[var(--color-bg2)] text-[var(--color-text-primary)] shadow",
          item.clippedLeft ? "" : "rounded-l-full ",
          item.clippedRight ? "" : "rounded-r-full ",
          "flex items-center",
        ].join(" ")}
        onMouseEnter={(e) => {
          setHoverPos({ top: e.clientY + 12, left: e.clientX + 12 });
          setHoverOpen(true);
        }}
        onMouseMove={(e) => {
          if (!hoverOpen) return;
          setHoverPos({ top: e.clientY + 12, left: e.clientX + 12 });
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

      {hoverOpen && (
        <ScheduleItemHoverCard
          open={hoverOpen}
          item={item}
          classTimezone={classTimezone}
          position={hoverPos}
          showEditHint={false}
        />
      )}
    </motion.div>
  );
});
