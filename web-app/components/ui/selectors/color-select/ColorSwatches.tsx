"use client";

import * as React from "react";
import { DEFAULT_COLOR_PALETTE } from "@/utils/utils";

export function ColorSwatches({
  value,
  onChange,
  palette = DEFAULT_COLOR_PALETTE,
  label = "Color",
  error,
  name, // optional: if provided, render a hidden input so forms post the color
}: {
  value: string;
  onChange: (hex: string) => void;
  palette?: string[];
  label?: string;
  error?: string;
  name?: string;
}) {
  return (
    <fieldset className="min-w-[240px]">
      <legend className="mb-1 block text-sm text-[var(--color-text-primary)]">
        {label}
      </legend>

      <div role="radiogroup" className="flex flex-wrap gap-2 pt-2">
        {palette.map((hex) => {
          const selected = (value || "").toLowerCase() === hex.toLowerCase();
          return (
            <label
              key={hex}
              title={hex}
              className="
                relative inline-flex h-8 w-8 cursor-pointer items-center justify-center
                rounded-full
                focus-within:outline-none focus-within:ring-2 focus-within:ring-[var(--color-primary)]
                transition-transform hover:scale-[1.04]
              "
            >
              <input
                type="radio"
                className="sr-only"
                name="color-swatch"
                value={hex}
                checked={selected}
                onChange={() => onChange(hex)}
              />
              <span
                className="block h-7 w-7 rounded-full ring-1 ring-black/10"
                style={{ backgroundColor: hex }}
              />
              {selected && (
                <span className="pointer-events-none absolute inset-0 rounded-full ring-2 ring-[var(--color-primary)]" />
              )}
            </label>
          );
        })}
      </div>

      {name && <input type="hidden" name={name} value={value} readOnly />}

      {error && (
        <p className="mt-1 text-xs text-[var(--color-error)]">{error}</p>
      )}
    </fieldset>
  );
}
