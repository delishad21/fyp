"use client";

/**
 * MultiSelectSearch Component
 *
 * Purpose:
 *   - Input field for filtering options within the dropdown.
 *   - Shows a search icon prefix.
 *
 * Props:
 *   @param {string} term
 *     - Current search term.
 *   @param {(v: string) => void} onChange
 *     - Callback when the input value changes.
 *   @param {string} placeholder
 *     - Input placeholder text.
 *
 */

import { Icon } from "@iconify/react";

export function MultiSelectSearch({
  term,
  onChange,
  placeholder,
}: {
  term: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div className="mb-2 flex items-center gap-2 rounded-lg border border-[var(--color-bg3)] bg-[var(--color-bg2)] px-2 py-1.5">
      <Icon
        icon="mingcute:search-line"
        width={16}
        height={16}
        className="text-[var(--color-icon)]"
      />
      <input
        value={term}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-transparent text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-secondary)] focus:outline-none"
      />
    </div>
  );
}
