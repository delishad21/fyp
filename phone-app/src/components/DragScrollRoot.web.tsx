import { PropsWithChildren, useEffect, useRef } from "react";

function isInteractiveTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) return false;
  return !!target.closest(
    "input, textarea, select, button, a, [role='button'], [contenteditable='true'], [data-drag-scroll='ignore']"
  );
}

function getScrollableTarget(target: Element | null): Element | null {
  let el: Element | null = target;
  while (el) {
    const style = window.getComputedStyle(el);
    const canScrollY =
      (style.overflowY === "auto" || style.overflowY === "scroll") &&
      el.scrollHeight > el.clientHeight;
    const canScrollX =
      (style.overflowX === "auto" || style.overflowX === "scroll") &&
      el.scrollWidth > el.clientWidth;
    if (canScrollY || canScrollX) return el;
    el = el.parentElement;
  }
  return null;
}

export default function DragScrollRoot({ children }: PropsWithChildren) {
  const activeRef = useRef(false);
  const lastRef = useRef({ x: 0, y: 0 });
  const targetRef = useRef<Element | null>(null);

  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      if (e.pointerType !== "mouse") return;
      if (isInteractiveTarget(e.target)) return;
      activeRef.current = true;
      lastRef.current = { x: e.clientX, y: e.clientY };
      targetRef.current = getScrollableTarget(
        document.elementFromPoint(e.clientX, e.clientY)
      );
      document.body.style.userSelect = "none";
      document.body.style.cursor = "grabbing";
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!activeRef.current) return;
      const { x, y } = lastRef.current;
      const dx = e.clientX - x;
      const dy = e.clientY - y;
      if (dx === 0 && dy === 0) return;
      const target = targetRef.current;
      if (target) {
        target.scrollLeft -= dx;
        target.scrollTop -= dy;
      } else {
        window.scrollBy({ left: -dx, top: -dy, behavior: "auto" });
      }
      lastRef.current = { x: e.clientX, y: e.clientY };
      e.preventDefault();
    };

    const stop = () => {
      if (!activeRef.current) return;
      activeRef.current = false;
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      targetRef.current = null;
    };

    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove, { passive: false });
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
    window.addEventListener("blur", stop);

    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
      window.removeEventListener("blur", stop);
    };
  }, []);

  return <>{children}</>;
}
