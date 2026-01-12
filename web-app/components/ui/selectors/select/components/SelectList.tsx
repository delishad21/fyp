"use client";

/**
 * SelectList Component
 *
 * Purpose:
 * - Renders a list of selectable options for the <Select> component.
 * - Supports optional placeholder and color indicator chips.
 * - Highlights the currently selected option.
 *
 * Props:
 * @param {string} id
 * - ID used for accessibility labels.
 * @param {SimpleOption[]} options
 * - Array of options { label, value, colorHex? }.
 * @param {string} value
 * - Currently selected value.
 * @param {string} [placeholder]
 * - Optional placeholder shown as the first item (clears selection when chosen).
 * @param {(v: string) => void} onSelect
 * - Callback fired when an option is selected.
 * @param {boolean} [showColor]
 * - If true, displays a color dot for each option using `colorHex`.
 *
 * Behavior:
 * - Displays placeholder at the top if provided.
 * - Renders each option as a button, highlighting the selected one.
 * - Shows a checkmark icon beside the selected option.
 * - Falls back to "No options" if the list is empty and no placeholder is defined.
 */

import clsx from "clsx";
import { Icon } from "@iconify/react";

export type SimpleOption = { label: string; value: string; colorHex?: string };

export function SelectList({
  id,
  options,
  value,
  placeholder,
  onSelect,
  showColor,
}: {
  id: string;
  options: SimpleOption[];
  value: string;
  placeholder?: string;
  onSelect: (v: string) => void;
  showColor?: boolean;
}) {
  return (
    <ul
      role="listbox"
      aria-labelledby={id}
      className="max-h-60 overflow-auto rounded-md"
    >
      {placeholder !== undefined && (
        <li>
          <button
            type="button"
            onClick={() => onSelect("")}
            className={itemCls(value === "")}
            role="option"
            aria-selected={value === ""}
          >
            <span className="truncate">{placeholder}</span>
          </button>
        </li>
      )}

      {options.map((opt) => {
        const selected = value === opt.value;
        const color = showColor ? opt.colorHex ?? "#ffffff" : undefined;
        return (
          <li key={opt.value}>
            <button
              type="button"
              role="option"
              aria-selected={selected}
              onClick={() => onSelect(opt.value)}
              className={itemCls(selected)}
            >
              <span className="flex min-w-0 items-center gap-2 truncate">
                {showColor && (
                  <span
                    className="inline-block h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-black/10"
                    style={{ backgroundColor: color }}
                  />
                )}
                <span className="truncate">{opt.label}</span>
              </span>
              {selected && (
                <Icon
                  icon="mingcute:check-line"
                  width={18}
                  height={18}
                  className="shrink-0 text-[var(--color-icon)]"
                />
              )}
            </button>
          </li>
        );
      })}

      {options.length === 0 && placeholder === undefined && (
        <li className="px-3 py-2 text-sm text-[var(--color-text-secondary)]">
          No options
        </li>
      )}
    </ul>
  );
}

function itemCls(selected: boolean) {
  return clsx(
    "flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-sm",
    selected
      ? "bg-[var(--color-bg3)] text-[var(--color-text-primary)]"
      : "text-[var(--color-text-primary)] hover:bg-[var(--color-bg3)]"
  );
}
