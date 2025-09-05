"use client";

import * as React from "react";

type Props = Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange"> & {
  label?: string;
  error?: string | string[];
  id: string;
  readOnly?: boolean;
  onChange?: React.ChangeEventHandler<HTMLInputElement>;
  onValueChange?: (value: string) => void;
};

export default function TextInput({
  label,
  error,
  id,
  readOnly,
  onChange,
  onValueChange,
  className,
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
          className="text-sm text-[var(--color-text-primary)]"
        >
          {label}
        </label>
      )}
      <input
        id={id}
        onChange={handleChange}
        readOnly={readOnly}
        className={`rounded-sm bg-[var(--color-bg2)] px-4 py-3 text-[var(--color-text-primary)]
             outline-2 outline-[var(--color-bg4)] text-sm
             focus:outline-2 focus:outline-[var(--color-primary)]
             ${
               readOnly
                 ? "cursor-not-allowed text-[var(--color-text-secondary)]"
                 : ""
             } ${className}`}
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
