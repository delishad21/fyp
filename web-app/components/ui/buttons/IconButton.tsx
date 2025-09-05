"use client";

import * as React from "react";
import { Icon } from "@iconify/react";

type Variant =
  | "normal"
  | "error"
  | "success"
  | "ghost"
  | "pagination"
  | "borderless";
type Size = "sm" | "md" | "lg";

export type IconButtonProps = {
  icon: string;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  title?: string;
  ariaLabel?: string;
  variant?: Variant;
  size?: Size | number;
  disabled?: boolean;
  loading?: boolean;
  type?: "button" | "submit" | "reset";
  className?: string;
};

function sizeToPx(size: Size | number | undefined): number {
  if (typeof size === "number") return size;
  switch (size) {
    case "sm":
      return 28;
    case "lg":
      return 48;
    case "md":
    default:
      return 40;
  }
}

export default function IconButton({
  icon,
  onClick,
  title,
  variant = "ghost",
  size = "md",
  disabled = false,
  loading = false,
  type = "button",
  className,
}: IconButtonProps) {
  const px = sizeToPx(size);

  const variantClasses =
    variant === "pagination"
      ? "text-[var(--color-icon)] hover:bg-[var(--color-bg2)] disabled:opacity-40"
      : variant === "error"
      ? "bg-transparent border-2 border-[var(--color-error)] text-[var(--color-error)] hover:bg-[var(--color-error)]/30 focus-visible:ring-[var(--color-error)]"
      : variant === "success"
      ? "bg-transparent border-2 border-[var(--color-success)] text-[var(--color-success)] hover:bg-[var(--color-success)]/30 focus-visible:ring-[var(--color-success)]"
      : variant === "normal"
      ? "bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary)]/90 focus-visible:ring-[var(--color-primary)]"
      : variant === "borderless"
      ? "bg-transparent hover:opacity-80 -mx-1.5"
      : "bg-transparent text-[var(--color-bg4)] hover:bg-[var(--color-bg3)] focus-visible:ring-[var(--color-primary)] border-2 border-[var(--color-bg4)]";

  return (
    <button
      type={type}
      title={title}
      disabled={disabled || loading}
      onClick={onClick}
      className={[
        "inline-flex items-center justify-center rounded-full transition-colors",
        "disabled:cursor-not-allowed disabled:opacity-50",
        variantClasses,
        className || "",
      ].join(" ")}
      style={{ width: px, height: px }}
    >
      {loading ? (
        <span
          className="block animate-spin"
          style={{
            width: Math.max(16, Math.round(px * 0.45)),
            height: Math.max(16, Math.round(px * 0.45)),
            borderTop: "2px solid currentColor",
            borderRight: "2px solid transparent",
            borderRadius: "9999px",
          }}
        />
      ) : (
        <Icon
          icon={icon}
          className="pointer-events-none"
          style={{
            width: Math.max(16, Math.round(px * 0.55)),
            height: Math.max(16, Math.round(px * 0.55)),
          }}
        />
      )}
    </button>
  );
}
