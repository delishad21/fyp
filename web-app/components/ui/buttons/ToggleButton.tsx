"use client";

import * as React from "react";
import { Icon } from "@iconify/react";

type Props = {
  on: boolean;
  onToggle: () => void;
  titleOn?: string;
  titleOff?: string;
  size?: number;
  activeColor?: string;
  inactiveColor?: string;
  className?: string;
};

export default function ToggleButton({
  on,
  onToggle,
  titleOn = "On",
  titleOff = "Off",
  size = 30,
  activeColor = "var(--color-success)",
  inactiveColor = "var(--color-text-secondary)",
  className = "",
}: Props) {
  return (
    <button
      type="button"
      title={on ? titleOn : titleOff}
      onClick={onToggle}
      className={[
        "grid place-items-center rounded-sm transition-colors hover:opacity-80",
        className,
      ].join(" ")}
      style={{
        width: size,
        height: size,
        color: on ? activeColor : inactiveColor,
      }}
    >
      <Icon
        icon={on ? "mingcute:toggle-right-fill" : "mingcute:toggle-left-fill"}
        style={{
          width: size * 1.1,
          height: size * 1.1,
        }}
      />
    </button>
  );
}
