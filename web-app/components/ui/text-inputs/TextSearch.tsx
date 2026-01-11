"use client";

import { Icon } from "@iconify/react";
import { FilterTriggerStyles } from "../../table/Filters";

export default function TextSearch({
  label,
  value,
  onChange,
  placeholder = "Search…",
  loading = false,
  className,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  loading?: boolean;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="mb-1 block text-xs text-[var(--color-text-secondary)]">
        {label}
      </label>
      <div className={`flex h-11 ${FilterTriggerStyles}`}>
        <Icon
          icon="mingcute:search-line"
          width={16}
          height={16}
          className="text-[var(--color-icon)] mr-2"
        />
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-50 bg-transparent text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-secondary)] focus:outline-none"
        />
        {loading && (
          <span className="ml-1 inline-flex h-4 w-4 animate-spin rounded-full border border-[var(--color-primary)] border-t-transparent" />
        )}
      </div>
    </div>
  );
}
