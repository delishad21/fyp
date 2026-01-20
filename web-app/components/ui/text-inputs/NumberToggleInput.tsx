"use client";

import * as React from "react";

type Props = {
  id: string;
  label?: string;
  value?: number;
  defaultValue?: number;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  readOnly?: boolean;
  error?: string | string[];
  className?: string;
  onChange?: (value: number) => void;
  emptyValue?: number;
};

function clamp(n: number, min?: number, max?: number) {
  let next = n;
  if (typeof min === "number") next = Math.max(min, next);
  if (typeof max === "number") next = Math.min(max, next);
  return next;
}

export default function NumberToggleInput({
  id,
  label,
  value,
  defaultValue,
  min,
  max,
  step = 1,
  disabled = false,
  readOnly = false,
  error,
  className,
  onChange,
  emptyValue,
}: Props) {
  const isControlled = typeof value === "number";
  const [internal, setInternal] = React.useState<number>(() => {
    if (typeof defaultValue === "number") return defaultValue;
    if (typeof min === "number") return min;
    return 0;
  });

  const current = isControlled ? value : internal;
  const [inputValue, setInputValue] = React.useState<string>(
    Number.isFinite(current) ? String(current) : ""
  );
  const isFocusedRef = React.useRef(false);

  React.useEffect(() => {
    if (isFocusedRef.current) return;
    setInputValue(Number.isFinite(current) ? String(current) : "");
  }, [current]);
  const errors = Array.isArray(error) ? error : error ? [error] : [];

  const commit = (next: number) => {
    const clamped = clamp(next, min, max);
    if (!isControlled) setInternal(clamped);
    onChange?.(clamped);
    setInputValue(String(clamped));
  };

  const canDecrement =
    !disabled &&
    !readOnly &&
    (typeof min !== "number" || current - step >= min);
  const canIncrement =
    !disabled &&
    !readOnly &&
    (typeof max !== "number" || current + step <= max);

  const resolvedEmptyValue =
    typeof emptyValue === "number"
      ? emptyValue
      : typeof min === "number"
      ? min
      : 1;

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
      <div
        className={[
          "flex h-11 items-center gap-2 rounded-md border border-[var(--color-bg4)]",
          "bg-[var(--color-bg2)] px-3 text-sm leading-none",
          "focus-within:ring-2 focus-within:ring-[var(--color-primary)]",
          disabled || readOnly
            ? "cursor-not-allowed opacity-70"
            : "cursor-text hover:bg-[var(--color-bg2)]",
          className || "",
        ].join(" ")}
      >
        <input
          id={id}
          type="number"
          min={min}
          max={max}
          step={step}
          value={inputValue}
          onChange={(e) => {
            const raw = e.currentTarget.value;
            setInputValue(raw);
            if (raw.trim() === "") return;
            const parsed = Number(raw);
            if (!Number.isFinite(parsed)) return;
            commit(parsed);
          }}
          onFocus={() => {
            isFocusedRef.current = true;
          }}
          onBlur={() => {
            isFocusedRef.current = false;
            if (inputValue.trim() === "") {
              commit(resolvedEmptyValue);
              return;
            }
            const parsed = Number(inputValue);
            if (!Number.isFinite(parsed)) {
              commit(resolvedEmptyValue);
            }
          }}
          disabled={disabled}
          readOnly={readOnly}
          className="h-8 w-full bg-transparent pl-1 text-left text-sm text-[var(--color-text-primary)] outline-none [appearance:textfield] placeholder:text-[var(--color-text-secondary)] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        />
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={() => commit(current - step)}
            disabled={!canDecrement}
            className="inline-flex h-8 w-8 items-center justify-center rounded-sm border border-[var(--color-bg4)] text-[var(--color-text-primary)] hover:bg-[var(--color-bg3)] disabled:opacity-50"
            aria-label="Decrease value"
          >
            -
          </button>
          <button
            type="button"
            onClick={() => commit(current + step)}
            disabled={!canIncrement}
            className="inline-flex h-8 w-8 items-center justify-center rounded-sm border border-[var(--color-bg4)] text-[var(--color-text-primary)] hover:bg-[var(--color-bg3)] disabled:opacity-50"
            aria-label="Increase value"
          >
            +
          </button>
        </div>
      </div>

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
