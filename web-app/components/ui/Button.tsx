// components/ui/Button.tsx
"use client";

import * as React from "react";

type ButtonProps = {
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
  loading?: boolean;
  variant?: "primary" | "ghost";
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void | Promise<void>;
  type?: "button" | "submit";
};

export default function Button({
  children,
  className,
  disabled = false,
  loading = false,
  variant,
  onClick,
  type = "button",
}: ButtonProps) {
  const isDisabled = disabled || loading;

  const base =
    "w-full h-full rounded-sm px-4 py-2 text-sm font-medium transition disabled:opacity-60 flex items-center justify-center hover:opacity-90";
  let variantStyles = "bg-[var(--color-primary)] text-white";
  if (variant === "ghost") {
    variantStyles =
      "text-[var(--color-text-primary)] hover:bg-[var(--color-bg3)] border-2 border-[var(--color-bg4)]";
  }

  return (
    <button
      type={type}
      disabled={isDisabled}
      onClick={onClick}
      aria-busy={loading}
      className={[base, variantStyles, className ?? ""].join(" ")}
    >
      {loading ? (
        <>
          <svg
            className="h-4 w-4 animate-spin text-current"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
            />
          </svg>
          <span className="sr-only">Loading</span>
        </>
      ) : (
        children
      )}
    </button>
  );
}
