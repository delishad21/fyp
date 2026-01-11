"use client";

import * as React from "react";

type Props = Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange"> & {
  label?: string;
  error?: string | string[];
  id: string;
  readOnly?: boolean;
  onChange?: React.ChangeEventHandler<HTMLInputElement>;
  onValueChange?: (value: string) => void;
  description?: string;
};

export default function TextInput({
  label,
  error,
  id,
  readOnly,
  onChange,
  onValueChange,
  className,
  description,
  ...rest
}: Props) {
  const errors = Array.isArray(error) ? error : error ? [error] : [];

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange?.(e);
    onValueChange?.(e.currentTarget.value);
  };

  return (
    <div className="grid gap-1.5">
      {label && (
        <label
          htmlFor={id}
          className="text-xs text-[var(--color-text-secondary)]"
        >
          {label}
        </label>
      )}
      <input
        id={id}
        onChange={handleChange}
        readOnly={readOnly}
        className={[
          "h-11 w-full rounded-md border border-[var(--color-bg4)]",
          "bg-[var(--color-bg2)] px-3 text-sm text-[var(--color-text-primary)]",
          "placeholder:text-[var(--color-text-tertiary)]",
          "hover:bg-[var(--color-bg2)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]",
          readOnly
            ? "cursor-not-allowed text-[var(--color-text-secondary)]"
            : "",
          className || "",
        ].join(" ")}
        {...rest}
      />

      {errors.length === 1 && (
        <p className="text-xs text-[var(--color-error)]">{errors[0]}</p>
      )}
      {errors.length > 1 && (
        <ul className="list-disc pl-5 text-xs text-[var(--color-error)] space-y-0.5">
          {errors.map((msg, i) => (
            <li key={i}>{msg}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
