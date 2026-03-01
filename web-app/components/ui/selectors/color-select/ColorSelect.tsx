"use client";

import * as React from "react";
import clsx from "clsx";
import { DEFAULT_COLOR_PALETTE } from "@/utils/utils";

export function ColorSelect({
  value,
  onChange,
  palette = DEFAULT_COLOR_PALETTE,
  label = "Color",
  error,
  compact = false,
  hideLabel = false,
  className,
}: {
  value: string;
  onChange: (hex: string) => void;
  palette?: string[];
  label?: string;
  error?: string;
  compact?: boolean;
  hideLabel?: boolean;
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const btnRef = React.useRef<HTMLButtonElement | null>(null);
  const popRef = React.useRef<HTMLDivElement | null>(null);

  // close on outside click / Esc
  React.useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!btnRef.current?.contains(t) && !popRef.current?.contains(t)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const selected = value || "#ffffff";

  return (
    <div
      className={clsx(
        "relative",
        compact ? "w-fit min-w-0" : "min-w-[240px]",
        className
      )}
    >
      {!hideLabel && (
        <label className="mb-1 block text-sm text-[var(--color-text-primary)]">
          {label}
        </label>
      )}

      {/* Trigger */}
      <button
        ref={btnRef}
        type="button"
        aria-label={label}
        onClick={() => setOpen((o) => !o)}
        className={clsx(
          "inline-flex items-center rounded-lg border border-[var(--color-bg4)] bg-[var(--color-bg2)] text-[var(--color-text-primary)] hover:bg-[var(--color-bg3)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]",
          compact
            ? "h-11 w-[64px] justify-center gap-1.5 px-2"
            : "w-full justify-between px-3 py-2"
        )}
      >
        <span className="inline-flex items-center gap-2">
          <span
            className="inline-block h-4 w-4 rounded-full ring-1 ring-black/10"
            style={{ backgroundColor: selected }}
          />
          {/* no visible hex text */}
          <span className="sr-only">Selected color {selected}</span>
        </span>
        <svg
          className="h-4 w-4 opacity-70"
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path
            fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.24 4.5a.75.75 0 01-1.08 0l-4.24-4.5a.75.75 0 01.02-1.06z"
            clipRule="evenodd"
          />
        </svg>
      </button>

      {/* Popover with circles only */}
      {open && (
        <div
          ref={popRef}
          role="listbox"
          tabIndex={-1}
          className="
            absolute z-50 mt-2 w-56 rounded-lg border p-3 shadow-xl
            border-[var(--color-bg4)] bg-[var(--color-bg2)]
          "
        >
          <div className="grid grid-cols-8 gap-2">
            {palette.map((hex) => {
              const isSel = selected.toLowerCase() === hex.toLowerCase();
              return (
                <button
                  key={hex}
                  type="button"
                  role="option"
                  aria-selected={isSel}
                  onClick={() => {
                    onChange(hex);
                    setOpen(false);
                  }}
                  className={`
                    h-6 w-6 rounded-full ring-1 ring-black/10
                    focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]
                    ${isSel ? "outline-2 outline-[var(--color-primary)]" : ""}
                  `}
                  style={{ backgroundColor: hex }}
                  title={hex}
                >
                  <span className="sr-only">{hex}</span>
                </button>
              );
            })}
          </div>

          <div className="mt-3 flex justify-end gap-2">
            <button
              type="button"
              className="rounded-md px-2 py-1 text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-bg3)]"
              onClick={() => {
                onChange(palette[0] ?? "#ffffff");
                setOpen(false);
              }}
            >
              Reset
            </button>
            <button
              type="button"
              className="rounded-md px-2 py-1 text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-bg3)]"
              onClick={() => setOpen(false)}
            >
              Close
            </button>
          </div>
        </div>
      )}

      {error && (
        <p className="mt-1 text-xs text-[var(--color-error)]">{error}</p>
      )}
    </div>
  );
}
