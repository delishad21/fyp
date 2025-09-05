"use client";

/**
 * TimerField Component
 *
 * Purpose:
 *   - Provides a compact UI control for enabling/disabling and configuring a timer (in seconds).
 *   - Combines a toggle, an icon, and a numeric input.
 *
 * Props:
 *   @param {string} id - Input element ID (for accessibility).
 *   @param {string} name - Input element name (for form submission).
 *   @param {number|null} value - Current timer value in seconds, or `null` if disabled.
 *   @param {(v: number|null) => void} onChange - Callback fired when timer value changes or is toggled on/off.
 *   @param {number} [min=5] - Minimum allowed timer value.
 *   @param {number} [max=600] - Maximum allowed timer value.
 *   @param {boolean} [blockDisable=false] - If true, hides the toggle button (timer cannot be disabled).
 *
 * Behavior:
 *   - ToggleButton:
 *       • Switches between "on" (numeric input enabled) and "off" (input disabled).
 *       • Off state sets timer to `null`.
 *   - Numeric input:
 *       • Accepts seconds within [min, max].
 *       • Empty input clears timer (sets to null).
 *   - Displays timer icon next to the field for context.
 *
 * UI:
 *   - Horizontal layout with toggle (if allowed), clock icon, and numeric input with “s” suffix.
 *   - Disabled state greys out input when timer is off.
 *   - Theming consistent with app colors (success, secondary, icon).
 */

import { Icon } from "@iconify/react";
import ToggleButton from "@/components/ui/buttons/ToggleButton";
import TextInput from "@/components/ui/text-inputs/TextInput";

export default function TimerField({
  id,
  name,
  value,
  onChange,
  min = 5,
  max = 600,
  blockDisable = false,
}: {
  id: string;
  name: string;
  value: number | null;
  onChange: (v: number | null) => void;
  min?: number;
  max?: number;
  blockDisable?: boolean;
}) {
  const isOff = value == null;

  return (
    <div className="flex items-center gap-2">
      {/* Toggle for on/off */}
      {!blockDisable && (
        <ToggleButton
          on={!isOff}
          onToggle={() => onChange(isOff ? min : null)}
          titleOn="Timer on"
          titleOff="Timer off (unlimited)"
          size={32}
          activeColor="var(--color-success)"
          inactiveColor="var(--color-text-secondary)"
        />
      )}

      {/* Timer icon */}
      <Icon
        icon="mingcute:time-line"
        className="text-[var(--color-icon)] h-7 w-7"
      />

      {/* Numeric input */}
      <div className="relative">
        <TextInput
          id={id}
          name={name}
          type="number"
          min={min}
          max={max}
          value={isOff ? "" : String(value)}
          disabled={isOff}
          onValueChange={(raw) => {
            if (raw.trim() === "") {
              onChange(null);
              return;
            }
            const n = Number(raw);
            onChange(Number.isFinite(n) ? n : null);
          }}
          className="w-20 h-8 px-3 py-1 text-sm"
        />
        <span className="pointer-events-none absolute inset-y-0 right-2 grid place-items-center text-sm text-[var(--color-text-secondary)]">
          s
        </span>
      </div>
    </div>
  );
}
