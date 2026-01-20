import {
  LaneItem,
  RESIZE_SPRING,
  TRACK_COLS,
} from "@/services/class/helpers/scheduling/scheduling-helpers";
import { motion } from "framer-motion";
import { memo } from "react";
import { SpanPill } from "./SpanPill";
import { SpanPillStatic } from "./SpanPillStatic";

export const PillsGrid = memo(function PillsGrid({
  lanes,
  laneCountVisible,
  draggingQuizId,
  resizingQuizId,
  isSliding,
  suppressLayoutId,
  isSettling,
  draggingUid,
  onEditRequest,
  readOnly = false,
  classTimezone,
}: {
  lanes: LaneItem[];
  laneCountVisible: number;
  draggingQuizId?: string;
  resizingQuizId?: string;
  isSliding?: boolean;
  suppressLayoutId?: string;
  isSettling: boolean;
  draggingUid?: string;
  onEditRequest?: (clientId: string) => void;
  readOnly?: boolean;
  classTimezone: string;
}) {
  const suppress = Boolean(isSliding || isSettling);

  return (
    <motion.div
      layout={!suppress && !draggingQuizId}
      transition={{ layout: suppress ? undefined : RESIZE_SPRING }}
      className="grid gap-2"
      style={{
        gridTemplateColumns: `repeat(${TRACK_COLS}, minmax(0, 1fr))`,
        gridTemplateRows: `repeat(${laneCountVisible}, minmax(0, 2.25rem))`,
      }}
    >
      {lanes.map((it) =>
        readOnly ? (
          <SpanPillStatic
            key={it.clientId}
            item={it}
            isSettling={isSettling}
            isSliding={isSliding}
            classTimezone={classTimezone}
          />
        ) : (
          <SpanPill
            key={it.clientId}
            item={it}
            isDragging={
              draggingUid
                ? draggingUid === it.clientId
                : draggingQuizId === it.clientId
            }
            isResizing={resizingQuizId === it.clientId}
            isSliding={isSliding}
            isSettling={isSettling}
            suppressLayoutId={
              suppressLayoutId ? suppressLayoutId === it.clientId : false
            }
            onEditRequest={onEditRequest}
            classTimezone={classTimezone}
          />
        )
      )}
    </motion.div>
  );
});
