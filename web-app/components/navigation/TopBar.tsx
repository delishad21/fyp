"use client";

import { Icon } from "@iconify/react";
import ThemeToggle from "../ui/ThemeToggle";

export function TopBar({ className = "" }: { className?: string }) {
  return (
    <header
      className={[
        "bg-[var(--color-bg2)] border-b border-[var(--color-bg3)]",
        "flex items-center justify-between px-6 py-2",
        className,
      ].join(" ")}
    >
      <h1 className="text-lg font-semibold">Home</h1>

      <div className="flex items-center gap-3">
        <button className="p-2 rounded-md hover:bg-[var(--color-bg3)]">
          <Icon
            icon="mingcute:bell-line"
            className="text-[var(--color-icon)]"
            width={22}
          />
        </button>
        <div className="w-8 h-8 rounded-full bg-[var(--color-primary)]" />
        <ThemeToggle />
      </div>
    </header>
  );
}
