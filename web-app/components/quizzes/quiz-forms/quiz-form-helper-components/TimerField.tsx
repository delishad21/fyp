"use client";

/**
 * TimerField Component
 *
 * Purpose:
 *   - Provides a compact UI control for enabling/disabling and configuring a timer.
 *   - Combines a toggle, an icon, and minute/second inputs.
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
 *   - Minute/second inputs:
 *       • Accept minutes and seconds; combined to total seconds.
 *       • Empty input treated as 0 while timer is enabled.
 *   - Displays timer icon next to the field for context.
 *
 * UI:
 *   - Horizontal layout with toggle (if allowed), clock icon, and two numeric inputs with “m”/“s” suffixes.
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
  layout = "default",
  showIcon = true,
  showToggle = true,
  showStatusText = false,
  statusTextOn = "On",
  statusTextOff = "Off",
}: {
  id: string;
  name: string;
  value: number | null;
  onChange: (v: number | null) => void;
  min?: number;
  max?: number;
  blockDisable?: boolean;
  layout?: "default" | "inputs-toggle-status";
  showIcon?: boolean;
  showToggle?: boolean;
  showStatusText?: boolean;
  statusTextOn?: string;
  statusTextOff?: string;
}) {
  const isOff = value == null;
  const safeValue = isOff ? 0 : value;
  const minutes = Math.floor(safeValue / 60);
  const seconds = safeValue % 60;

  const parsePart = (raw: string) => {
    const trimmed = raw.trim();
    if (trimmed === "") return 0;
    const n = Number(trimmed);
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.floor(n));
  };

  const clampSeconds = (n: number) => Math.min(59, Math.max(0, n));

  const setFromParts = (nextMinutes: number, nextSeconds: number) => {
    let total = nextMinutes * 60 + nextSeconds;
    if (Number.isFinite(max) && total > max) {
      total = max;
    }
    onChange(Number.isFinite(total) ? total : null);
  };

  const enableIfOff = () => {
    if (isOff) onChange(min);
  };

  const toggle = !blockDisable && showToggle && (
    <ToggleButton
      on={!isOff}
      onToggle={() => onChange(isOff ? min : null)}
      titleOn=""
      titleOff=""
      inlineTextPosition="left"
      size={32}
      activeColor="var(--color-success)"
      inactiveColor="var(--color-text-secondary)"
    />
  );

  const statusText = (
    <span className="text-xs text-[var(--color-text-secondary)]">
      {isOff ? statusTextOff : statusTextOn}
    </span>
  );

  return (
    <div className="flex items-center gap-2">
      {layout === "default" && (
        <>
          {/* Toggle for on/off */}
          {toggle}

          {/* Timer icon */}
          {showIcon && (
            <Icon
              icon="mingcute:time-line"
              className="text-[var(--color-icon)] h-7 w-7"
            />
          )}
        </>
      )}

      <input
        type="hidden"
        id={id}
        name={name}
        value={isOff ? "" : String(minutes * 60 + seconds)}
        readOnly
      />

      {/* Numeric inputs */}
      <div className="flex items-center gap-2">
        <div className="relative">
          <TextInput
            id={`${id}-minutes`}
            type="number"
            min={0}
            value={isOff ? "" : String(minutes)}
            readOnly={isOff}
            onFocus={enableIfOff}
            onClick={enableIfOff}
            onValueChange={(raw) => {
              const nextMinutes = parsePart(raw);
              setFromParts(nextMinutes, seconds);
            }}
            className={[
              "!w-28 !h-11 !px-3 !pr-7 text-sm",
              isOff ? "opacity-70 cursor-pointer" : "",
            ].join(" ")}
          />
          <span className="pointer-events-none absolute inset-y-0 right-2 grid place-items-center text-sm text-[var(--color-text-secondary)]">
            m
          </span>
        </div>
        <div className="relative">
          <TextInput
            id={`${id}-seconds`}
            type="number"
            min={0}
            max={59}
            value={isOff ? "" : String(seconds)}
            readOnly={isOff}
            onFocus={enableIfOff}
            onClick={enableIfOff}
            onValueChange={(raw) => {
              const nextSeconds = clampSeconds(parsePart(raw));
              setFromParts(minutes, nextSeconds);
            }}
            className={[
              "!w-28 !h-11 !px-3 !pr-7 text-sm",
              isOff ? "opacity-70 cursor-pointer" : "",
            ].join(" ")}
          />
          <span className="pointer-events-none absolute inset-y-0 right-2 grid place-items-center text-sm text-[var(--color-text-secondary)]">
            s
          </span>
        </div>
      </div>

      {layout === "inputs-toggle-status" && (
        <>
          {toggle}
          {showStatusText && statusText}
        </>
      )}
    </div>
  );
}
