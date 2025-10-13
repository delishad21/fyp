import {
  findDayFromPoint,
  ymdToLocalDate,
  dateToLocalYMD,
  diffLocalDays,
} from "@/services/class/helpers/scheduling/scheduling-helpers";
import { DragData, ScheduleItem } from "@/services/class/types/class-types";
import { useDndMonitor } from "@dnd-kit/core";

/** Capture "which internal day was grabbed" to preserve span while moving */
export function PillAnchorMonitor({
  schedule,
  setOffsetDays,
}: {
  schedule: ScheduleItem[];
  setOffsetDays: (n: number) => void;
}) {
  useDndMonitor({
    onDragStart: (e) => {
      const data = e.active?.data?.current as DragData | undefined;
      if (data?.kind !== "pill") return;

      // Try to read the activator pointer position
      const ev: any = (e as any).activatorEvent;
      let cx: number | null = null;
      let cy: number | null = null;

      if (ev?.clientX != null && ev?.clientY != null) {
        cx = ev.clientX;
        cy = ev.clientY;
      } else if (ev?.touches?.[0]) {
        cx = ev.touches[0].clientX;
        cy = ev.touches[0].clientY;
      } else if (ev?.changedTouches?.[0]) {
        cx = ev.changedTouches[0].clientX;
        cy = ev.changedTouches[0].clientY;
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
          const grabbedDay = ymdToLocalDate(grabbedYMD);
          const startDay = ymdToLocalDate(
            dateToLocalYMD(new Date(currentItem.startDate))
          );
          setOffsetDays(diffLocalDays(grabbedDay, startDay));
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
