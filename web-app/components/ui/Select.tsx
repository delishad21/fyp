"use client";

import * as React from "react";
import clsx from "clsx";

type Option = string | { label: string; value: string };

function normalizeOptions(options: Option[]) {
  return options.map((opt) =>
    typeof opt === "string" ? { label: opt, value: opt } : opt
  );
}

type Props = Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "onChange"> & {
  id: string;
  label?: string;

  /** Optional controlled props */
  value?: string;
  onChange?: (value: string) => void;

  /** Optional uncontrolled prop */
  defaultValue?: string;

  /** Include in native FormData */
  name?: string;

  options: Option[];
  placeholder?: string; // e.g. "None"
  error?: string | string[];
  helperText?: string;
  className?: string;
};

export default function Select({
  id,
  name,
  label,
  value, // controlled (optional)
  onChange, // controlled (optional)
  defaultValue, // uncontrolled (optional)
  options,
  placeholder,
  error,
  helperText,
  className,
  required,
  disabled,
  ...rest
}: Props) {
  const normalized = normalizeOptions(options);
  const hasError = Boolean(error);
  const errorList = Array.isArray(error) ? error : error ? [error] : [];

  return (
    <div className={clsx("grid gap-1.5", className)}>
      {label && (
        <label
          htmlFor={id}
          className="text-sm text-[var(--color-text-primary)]"
        >
          {label}
        </label>
      )}

      <select
        id={id}
        name={name}
        // If `value` is provided, treat as controlled; otherwise use `defaultValue`
        {...(value !== undefined ? { value } : {})}
        {...(value === undefined && defaultValue !== undefined
          ? { defaultValue }
          : {})}
        onChange={onChange ? (e) => onChange(e.currentTarget.value) : undefined}
        disabled={disabled}
        required={required}
        className={clsx(
          "rounded-sm bg-[var(--color-bg2)] px-4 py-3 text-sm",
          "text-[var(--color-text-primary)] outline-2 outline-[var(--color-bg4)]",
          disabled
            ? "cursor-not-allowed text-[var(--color-text-secondary)]"
            : ""
        )}
        {...rest}
      >
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {normalized.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>

      {helperText && !hasError && (
        <p
          id={`${id}-help`}
          className="text-xs text-[var(--color-text-secondary)]"
        >
          {helperText}
        </p>
      )}

      {hasError && (
        <div id={`${id}-error`} className="space-y-0.5">
          {errorList.map((msg, i) => (
            <p key={i} className="text-xs text-[var(--color-error)]">
              {msg}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
