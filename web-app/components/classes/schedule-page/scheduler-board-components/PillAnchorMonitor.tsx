import {
  findDayFromPoint,
  diffDayKeys,
  dayKeyFromDateInTZ,
} from "@/services/class/helpers/scheduling/scheduling-helpers";
import { DragData, ScheduleItem } from "@/services/class/types/class-types";
import { useDndMonitor } from "@dnd-kit/core";
import type { DragStartEvent } from "@dnd-kit/core";

/** Capture "which internal day was grabbed" to preserve span while moving */
export function PillAnchorMonitor({
  schedule,
  classTimezone,
  setOffsetDays,
}: {
  schedule: ScheduleItem[];
  classTimezone: string;
  setOffsetDays: (n: number) => void;
}) {
  const getClientPoint = (ev: MouseEvent | TouchEvent | null) => {
    if (!ev) return null;
    if ("touches" in ev && ev.touches?.[0]) {
      return { x: ev.touches[0].clientX, y: ev.touches[0].clientY };
    }
    if ("changedTouches" in ev && ev.changedTouches?.[0]) {
      return {
        x: ev.changedTouches[0].clientX,
        y: ev.changedTouches[0].clientY,
      };
    }
    if ("clientX" in ev && "clientY" in ev) {
      return { x: ev.clientX, y: ev.clientY };
    }
    return null;
  };

  useDndMonitor({
    onDragStart: (e: DragStartEvent) => {
      const data = e.active?.data?.current as DragData | undefined;
      if (data?.kind !== "pill") return;

      // Try to read the activator pointer position
      const ev = e.activatorEvent as MouseEvent | TouchEvent | null;
      let cx: number | null = null;
      let cy: number | null = null;

      const point = getClientPoint(ev);
      if (point) {
        cx = point.x;
        cy = point.y;
      } else if (e.active?.rect?.current?.initial) {
        // Fallback to rect center
        const r = e.active.rect.current.initial;
        cx = r.left + r.width / 2;
        cy = r.top + r.height / 2;
      }

      const currentItem = schedule.find((it) => it.clientId === data.clientId);
      if (cx != null && cy != null && currentItem) {
        const grabbedYMD = findDayFromPoint(cx, cy);
        if (grabbedYMD) {
          const startDayKey = dayKeyFromDateInTZ(
            new Date(currentItem.startDate),
            classTimezone
          );
          setOffsetDays(diffDayKeys(grabbedYMD, startDayKey));
          return;
        }
      }
      setOffsetDays(0);
    },
    onDragEnd: () => setOffsetDays(0),
    onDragCancel: () => setOffsetDays(0),
  });
  return null;
}
