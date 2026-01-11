import { useDndMonitor } from "@dnd-kit/core";
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
    onDragStart: (e) => {
      const ev: any = (e as any).activatorEvent;
      let cx: number | null = null;
      if (ev?.clientX != null) cx = ev.clientX as number;
      else if (ev?.touches?.[0]?.clientX != null)
        cx = ev.touches[0].clientX as number;
      else if (e.active?.rect?.current?.initial) {
        const rect = e.active.rect.current.initial;
        cx = rect.left + rect.width / 2;
      }
      startClientXRef.current = cx;
      onStart(cx, String(e.active?.id ?? ""));
    },
    onDragMove: (e) => {
      const ev: any = e;
      if (ev?.delta?.x == null) return;
      const startX = startClientXRef.current;
      if (startX != null) {
        onMoveAtX(startX + ev.delta.x);
        return;
      }
      const rect = ev?.active?.rect?.current?.translated;
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
