import { getPointerZone } from "@/services/class/helpers/scheduling/scheduling-helpers";
import { useDndMonitor } from "@dnd-kit/core";
import type { DragEndEvent, DragMoveEvent } from "@dnd-kit/core";

/** Track pointer zone (inside calendar vs outside; past day?) during drag */
export function PointerZoneMonitor({
  setZone,
}: {
  setZone: (z: {
    insideCalendar: boolean;
    day: string | null;
    isPast: boolean;
  }) => void;
}) {
  useDndMonitor({
    onDragMove: (e: DragMoveEvent) => {
      // Try to get coordinates
      let cx: number | null = null;
      let cy: number | null = null;
      if (e.active?.rect?.current?.translated) {
        const r = e.active.rect.current.translated;
        cx = r.left + r.width / 2;
        cy = r.top + r.height / 2;
      } else if (e.active?.rect?.current?.initial) {
        const r = e.active.rect.current.initial;
        cx = r.left + r.width / 2 + (e.delta?.x ?? 0);
        cy = r.top + r.height / 2 + (e.delta?.y ?? 0);
      }

      if (cx != null && cy != null) {
        setZone(getPointerZone(cx, cy));
      }
    },
    onDragEnd: (e: DragEndEvent) => {
      let cx: number | null = null;
      let cy: number | null = null;
      if (e.active?.rect?.current?.translated) {
        const r = e.active.rect.current.translated;
        cx = r.left + r.width / 2;
        cy = r.top + r.height / 2;
      } else if (e.active?.rect?.current?.initial) {
        const r = e.active.rect.current.initial;
        cx = r.left + r.width / 2 + (e.delta?.x ?? 0);
        cy = r.top + r.height / 2 + (e.delta?.y ?? 0);
      }
      if (cx != null && cy != null) {
        setZone(getPointerZone(cx, cy));
      }
    },
  });
  return null;
}
