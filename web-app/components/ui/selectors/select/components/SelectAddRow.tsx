"use client";

/**
 * SelectAddRow Component
 *
 * Purpose:
 * - Renders a row inside the Select popover for adding a new option.
 * - Provides a visual separator below the "Add new…" button.
 *
 * Props:
 * @param {() => void} onClick
 * - Callback fired when the "Add new…" button is clicked.
 *
 * Behavior:
 * - Displays a button labeled "Add new…" with a plus icon.
 * - On click, calls the provided `onClick` handler (usually opens add modal).
 * - Renders a horizontal divider beneath the button for visual separation.
 */

import { Icon } from "@iconify/react";

export function SelectAddRow({ onClick }: { onClick: () => void }) {
  return (
    <>
      <button
        type="button"
        onClick={onClick}
        className="mb-1 flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm text-[var(--color-text-primary)] hover:bg-[var(--color-bg3)]"
      >
        <span>Add new…</span>
        <Icon
          icon="mingcute:add-line"
          className="text-[var(--color-icon)]"
          width={18}
          height={18}
        />
      </button>
      <div className="my-1 h-px bg-[var(--color-bg4)]" />
    </>
  );
}
