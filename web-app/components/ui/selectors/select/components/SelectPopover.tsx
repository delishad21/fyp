"use client";

/**
 * SelectPopover Component
 *
 * Purpose:
 * - Provides an animated dropdown container for the <Select> component.
 * - Handles mounting/unmounting with smooth open/close transitions.
 *
 * Props:
 * @param {boolean} open
 * - Controls whether the popover is visible.
 * @param {React.ReactNode} children
 * - Content of the popover (e.g., option list, add row).
 *
 * Behavior:
 * - Uses Framer Motion for enter/exit animations with scaling + opacity.
 * - Anchors below the trigger (`top-full`) with absolute positioning.
 * - Styled with border, background, padding, and shadow.
 */

import { AnimatePresence, motion } from "framer-motion";

export function SelectPopover({
  open,
  children,
}: {
  open: boolean;
  children: React.ReactNode;
}) {
  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.div
          key="select-popover"
          initial={{ opacity: 0, scaleY: 0.6 }}
          animate={{ opacity: 1, scaleY: 1 }}
          exit={{ opacity: 0, scaleY: 0.6 }}
          transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
          style={{ originY: 0 }}
          className="absolute left-0 top-full z-50 mt-2 min-w-full max-w-sm"
        >
          <div className="rounded-lg border border-[var(--color-bg4)] bg-[var(--color-bg2)] p-2 shadow-xl">
            {children}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
