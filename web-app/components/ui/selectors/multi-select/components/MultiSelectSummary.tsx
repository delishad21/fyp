"use client";

/**
 * MultiSelectSummary Component
 *
 * Purpose:
 *   - Compact summary of currently selected options for display in the trigger.
 *   - Shows up to 2 selected labels, with color dots if available.
 *   - Collapses the rest into a "+N" indicator.
 *
 * Props:
 *   @param {FilterOption[]} options
 *     - All available options.
 *   @param {string[]} value
 *     - Current selected values.
 *   @param {string} [placeholder="Select…"]
 *     - Placeholder when no selection exists.
 *
 * Behavior:
 *   - Maps selected values to their full option objects for display.
 *
 */

import { FilterOption } from "@/services/quiz/types/quiz-table-types";

export function MultiSelectSummary({
  options,
  value,
  placeholder = "Select…",
}: {
  options: FilterOption[];
  value: string[];
  placeholder?: string;
}) {
  if (!value.length)
    return (
      <span className="text-[var(--color-text-secondary)]">{placeholder}</span>
    );

  const lookup = new Map(options.map((o) => [o.value, o]));
  const picked = value
    .map((v) => lookup.get(v))
    .filter(Boolean) as FilterOption[];
  const firstTwo = picked.slice(0, 2);
  const rest = Math.max(0, picked.length - 2);

  return (
    <span className="flex flex-wrap items-center gap-1">
      {firstTwo.map((o) => (
        <span
          key={o.value}
          className="inline-flex items-center gap-2 rounded-full bg-[var(--color-bg2)] px-2.5 py-0.5 text-xs"
          style={{ border: "1px solid var(--color-bg3)" }}
        >
          {o.colorHex && (
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ background: o.colorHex }}
            />
          )}
          {o.label}
        </span>
      ))}
      {rest > 0 && (
        <span className="text-xs text-[var(--color-text-secondary)]">
          +{rest}
        </span>
      )}
    </span>
  );
}
