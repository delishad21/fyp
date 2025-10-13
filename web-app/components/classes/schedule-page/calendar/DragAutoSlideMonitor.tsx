import { useDndMonitor } from "@dnd-kit/core";

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
  useDndMonitor({
    onDragStart: (e) => {
      const ev: any = (e as any).activatorEvent;
      let cx: number | null = null;
      if (ev?.clientX != null) cx = ev.clientX as number;
      else if (ev?.touches?.[0]?.clientX != null)
        cx = ev.touches[0].clientX as number;
      else if (e.active?.rect?.current?.initial) {
        cx = e.active.rect.current.initial.left + 4;
      }
      onStart(cx, String(e.active?.id ?? ""));
    },
    onDragMove: (e) => {
      // pointer X relative from original client
      const ev: any = e;
      if (ev?.delta?.x != null && ev?.active?.rect?.current?.initial) {
        const cx = ev.active.rect.current.initial.left + 4 + ev.delta.x;
        onMoveAtX(cx);
      }
    },
    onDragEnd: onEnd,
    onDragCancel: onEnd,
  });
  return null;
}
