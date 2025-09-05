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
      className={`min-h-[${minHeight}px] w-full rounded-sm
                  bg-[var(--color-bg2)] p-3 text-sm
                  text-[var(--color-text-primary)]
                  outline-2 outline-[var(--color-bg4)]
                  focus:outline-[var(--color-primary)] ${className}`}
    />
  );
}
