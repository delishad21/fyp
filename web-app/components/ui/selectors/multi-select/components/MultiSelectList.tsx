"use client";

/**
 * MultiSelectList Component
 *
 * Purpose:
 *   - Renders a vertical list of selectable options for the MultiSelect dropdown.
 *   - Each option is shown with a checkbox, label, and optional color dot.
 *
 * Props:
 *   @param {FilterOption[]} options
 *     - All available options to render in the list.
 *   @param {string[]} value
 *     - Current selected values (draft/local array).
 *   @param {(v: string) => void} onToggle
 *     - Called when a checkbox is toggled (adds/removes value).
 *
 * Behavior:
 *   - Highlights options on hover.
 *   - Uses controlled `checked` state from `value`.
 *   - Stops event propagation to prevent dropdown closing on clicks.
 *
 */

import React, { memo, useId } from "react";
import type { FilterOption } from "@/services/quiz/types/quiz-table-types";

export function MultiSelectList({
  options,
  value,
  onToggle,
}: {
  options: FilterOption[];
  value: string[];
  onToggle: (v: string) => void;
}) {
  return (
    <ul className="max-h-64 overflow-auto py-1 pr-1">
      {options.map((o) => (
        <Row
          key={o.value}
          option={o}
          checked={value.includes(o.value)}
          onToggle={onToggle}
        />
      ))}
    </ul>
  );
}

const Row = memo(function Row({
  option,
  checked,
  onToggle,
}: {
  option: FilterOption;
  checked: boolean;
  onToggle: (v: string) => void;
}) {
  const id = useId();
  return (
    <li
      className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-[var(--color-bg2)]"
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.preventDefault()}
    >
      <input
        id={id}
        type="checkbox"
        className="h-4 w-4 accent-[var(--color-primary)]"
        checked={checked}
        onChange={() => onToggle(option.value)}
        onClick={(e) => e.stopPropagation()}
      />
      {option.colorHex && (
        <span
          className="inline-block h-2.5 w-2.5 rounded-full"
          style={{ background: option.colorHex }}
        />
      )}
      <label
        htmlFor={id}
        className="cursor-pointer select-none text-sm text-[var(--color-text-primary)]"
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.preventDefault()}
      >
        {option.label}
      </label>
    </li>
  );
});
