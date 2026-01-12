import { useDndMonitor } from "@dnd-kit/core";
import type { DragMoveEvent, DragStartEvent } from "@dnd-kit/core";
import { useRef } from "react";

/**
 * DND monitor that calls the provided callbacks to handle auto-sliding
 * when dragging near the edges of the calendar view.
 */
export function DragAutoSlideMonitor({
  onStart,
  onMoveAtX,
  onEnd,
}: {
  onStart: (clientX: number | null, activeId?: string) => void;
  onMoveAtX: (clientX: number) => void;
  onEnd: () => void;
}) {
  const startClientXRef = useRef<number | null>(null);

  useDndMonitor({
    onDragStart: (e: DragStartEvent) => {
      const ev = e.activatorEvent as MouseEvent | TouchEvent | null;
      let cx: number | null = null;
      if (ev?.clientX != null) cx = ev.clientX as number;
      else if ("touches" in (ev || {}) && ev?.touches?.[0]?.clientX != null)
        cx = ev.touches[0].clientX as number;
      else if (e.active?.rect?.current?.initial) {
        const rect = e.active.rect.current.initial;
        cx = rect.left + rect.width / 2;
      }
      startClientXRef.current = cx;
      onStart(cx, String(e.active?.id ?? ""));
    },
    onDragMove: (e: DragMoveEvent) => {
      if (typeof e.delta?.x !== "number") return;
      const startX = startClientXRef.current;
      if (startX != null) {
        onMoveAtX(startX + e.delta.x);
        return;
      }
      const rect = e?.active?.rect?.current?.translated;
      if (rect) onMoveAtX(rect.left + rect.width / 2);
    },
    onDragEnd: () => {
      startClientXRef.current = null;
      onEnd();
    },
    onDragCancel: () => {
      startClientXRef.current = null;
      onEnd();
    },
  });
  return null;
}
