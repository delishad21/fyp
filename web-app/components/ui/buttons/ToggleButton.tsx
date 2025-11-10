"use client";

import * as React from "react";
import { Icon } from "@iconify/react";

type Props = {
  /** Current value */
  on: boolean;
  /** Toggle handler */
  onToggle: () => void;

  /** Optional visual label shown next to the toggle */
  label?: string;
  /** Optional helper/description text shown under the label (small, muted) */
  description?: string;
  /** Optional error text shown under the control in error color */
  error?: string;

  /** Title attribute when ON/OFF (tooltip) */
  titleOn?: string;
  titleOff?: string;

  /** Sizing/styling */
  size?: number;
  activeColor?: string;
  inactiveColor?: string;
  className?: string;

  /** Accessibility */
  id?: string; // used to connect aria-describedby
  disabled?: boolean;
};

export default function ToggleButton({
  on,
  onToggle,
  label,
  description,
  error,

  titleOn = "On",
  titleOff = "Off",

  size = 30,
  activeColor = "var(--color-success)",
  inactiveColor = "var(--color-text-secondary)",
  className = "",

  id,
  disabled = false,
}: Props) {
  const title = on ? titleOn : titleOff;
  const descId = description ? `${id || "toggle"}-desc` : undefined;
  const errId = error ? `${id || "toggle"}-err` : undefined;

  return (
    <div className="flex flex-col gap-1">
      {label ? (
        <label
          htmlFor={id}
          className="text-sm font-medium text-[var(--color-text-primary)]"
        >
          {label}
        </label>
      ) : null}

      <div className="flex items-center gap-2">
        <button
          id={id}
          type="button"
          title={title}
          onClick={onToggle}
          disabled={disabled}
          className={[
            "grid place-items-center rounded-sm transition-opacity",
            "hover:opacity-80",
            disabled ? "opacity-50 cursor-not-allowed" : "",
            className,
          ].join(" ")}
          style={{
            width: size,
            height: size,
            color: on ? activeColor : inactiveColor,
          }}
          role="switch"
          aria-checked={on}
          aria-invalid={!!error || undefined}
          aria-describedby={
            [descId, errId].filter(Boolean).join(" ") || undefined
          }
        >
          <Icon
            icon={
              on ? "mingcute:toggle-right-fill" : "mingcute:toggle-left-fill"
            }
            style={{ width: size * 1.1, height: size * 1.1 }}
          />
        </button>

        {/* Optional inline state text */}
        <span className="text-sm text-[var(--color-text-secondary)]">
          {title}
        </span>
      </div>

      {description ? (
        <p id={descId} className="text-xs text-[var(--color-text-secondary)]">
          {description}
        </p>
      ) : null}

      {error ? (
        <p id={errId} className="text-xs text-[var(--color-error)]">
          {error}
        </p>
      ) : null}
    </div>
  );
}
