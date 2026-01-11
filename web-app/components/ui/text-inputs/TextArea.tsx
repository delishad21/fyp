"use client";

import * as React from "react";

type Props = {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  minHeight?: number; // default 140px
  required?: boolean;
  onFocus?: () => void;
  onBlur?: () => void;
  className?: string; // allow overrides if needed
};

export default function TextArea({
  value,
  onChange,
  placeholder,
  minHeight = 140,
  required = false,
  onFocus,
  onBlur,
  className = "",
}: Props) {
  return (
    <textarea
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onFocus={onFocus}
      onBlur={onBlur}
      required={required}
      className={[
        "w-full rounded-md border border-[var(--color-bg4)]",
        "bg-[var(--color-bg2)] px-3 py-2 text-sm text-[var(--color-text-primary)]",
        "placeholder:text-[var(--color-text-tertiary)]",
        "hover:bg-[var(--color-bg2)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]",
        className || "",
      ].join(" ")}
      style={{ minHeight }}
    />
  );
}
