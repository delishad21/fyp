"use client";

/**
 * MultiSelectTrigger Component
 *
 * Purpose:
 *   - Button that opens/closes the MultiSelect dropdown.
 *   - Displays the summary of selections or placeholder.
 *
 * Props:
 *   @param {boolean} open
 *     - Whether the dropdown is currently open.
 *   @param {boolean} [loading]
 *     - If true, shows a spinner next to the caret.
 *   @param {string} label
 *     - Label displayed above the trigger.
 *   @param {FilterOption[]} options
 *     - Options to resolve labels/colors for the summary.
 *   @param {string[]} value
 *     - Current selected values.
 *   @param {string} [placeholder]
 *     - Placeholder text when nothing selected.
 *   @param {() => void} onToggle
 *     - Callback fired when trigger is clicked.
 *
 * Behavior:
 *   - Renders a styled button with summary on the left and caret/spinner on the right.
 *   - Shows an up or down icon depending on `open`.
 *
 */

import { Icon } from "@iconify/react";
import { FilterOption } from "@/services/quiz/types/quiz-table-types";
import { MultiSelectSummary } from "./MultiSelectSummary";
import { FilterTriggerStyles } from "@/components/table/Filters";

export function MultiSelectTrigger({
  open,
  loading,
  label,
  options,
  value,
  placeholder,
  onToggle,
}: {
  open: boolean;
  loading?: boolean;
  label: string;
  options: FilterOption[];
  value: string[];
  placeholder?: string;
  onToggle: () => void;
}) {
  return (
    <>
      <label className="mb-1 block text-xs text-[var(--color-text-secondary)]">
        {label}
      </label>
      <button
        type="button"
        onClick={onToggle}
        className={`flex h-11 min-w-40 ${FilterTriggerStyles}`}
      >
        <MultiSelectSummary
          options={options}
          value={value}
          placeholder={placeholder}
        />
        <span className="flex items-center gap-2">
          {loading && (
            <span className="inline-flex h-4 w-4 animate-spin rounded-full border border-[var(--color-primary)] border-t-transparent" />
          )}
          <Icon
            icon={open ? "mingcute:up-line" : "mingcute:down-line"}
            className="text-[var(--color-icon)]"
            width={18}
            height={18}
          />
        </span>
      </button>
    </>
  );
}
