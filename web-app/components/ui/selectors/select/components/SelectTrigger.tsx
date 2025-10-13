"use client";

/**
 * SelectTrigger Component
 *
 * Purpose:
 * - Acts as the clickable button that toggles the Select popover.
 * - Displays the selected option (with optional color chip) or placeholder text.
 *
 * Props:
 * @param {string} id
 * - Unique identifier for accessibility.
 * @param {boolean} [disabled]
 * - Whether the trigger is disabled.
 * @param {boolean} open
 * - Whether the popover is currently open.
 * @param {boolean} hasValue
 * - Indicates if a value is selected.
 * @param {string} text
 * - Label of the currently selected option.
 * @param {string} [placeholder]
 * - Placeholder text shown when no value is selected.
 * @param {() => void} onToggle
 * - Callback to toggle the popover open/close state.
 * @param {boolean} [showColor]
 * - Whether to display a color chip next to the label.
 * @param {string} [colorHex]
 * - Hex code of the color chip (if showColor is true).
 *
 * Behavior:
 * - Renders a styled button with text and dropdown arrow icon.
 * - Shows placeholder text in secondary color when no value is selected.
 * - Displays a color chip if enabled and a value exists.
 * - Toggles up/down arrow based on `open` state.
 */

import clsx from "clsx";
import { Icon } from "@iconify/react";

export function SelectTrigger({
  id,
  disabled,
  open,
  hasValue,
  text,
  placeholder,
  onToggle,
  showColor,
  colorHex,
}: {
  id: string;
  disabled?: boolean;
  open: boolean;
  hasValue: boolean;
  text: string;
  placeholder?: string;
  onToggle: () => void;
  showColor?: boolean;
  colorHex?: string;
}) {
  return (
    <button
      id={id}
      type="button"
      disabled={disabled}
      onClick={onToggle}
      className={clsx(
        "w-full rounded-sm bg-[var(--color-bg2)] px-4 py-3 text-left text-sm",
        "text-[var(--color-text-primary)] outline-2 outline-[var(--color-bg4)]",
        "focus:outline-2 focus:outline-[var(--color-primary)]",
        disabled
          ? "cursor-not-allowed text-[var(--color-text-secondary)]"
          : "hover:bg-[var(--color-bg3)]"
      )}
    >
      <div className="flex items-center justify-between">
        <span
          className={clsx(
            "flex items-center gap-2",
            !hasValue && "text-[var(--color-text-secondary)]"
          )}
        >
          {showColor && hasValue && (
            <span
              className="inline-block h-2.5 w-2.5 rounded-full ring-1 ring-black/10"
              style={{ backgroundColor: colorHex ?? "#ffffff" }}
            />
          )}
          {hasValue ? text : placeholder ?? ""}
        </span>
        <Icon
          icon={open ? "mingcute:up-line" : "mingcute:down-line"}
          className="text-[var(--color-icon)]"
          width={18}
          height={18}
        />
      </div>
    </button>
  );
}
