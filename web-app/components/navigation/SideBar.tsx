"use client";

import { Icon } from "@iconify/react";
import { AppTitle } from "@/components/navigation/AppTitle";

const items = [
  { label: "Home", icon: "mingcute:home-2-line", active: true },
  { label: "Quizzes", icon: "mingcute:book-2-line" },
  { label: "Classes", icon: "mingcute:group-2-line" },
  { label: "Settings", icon: "mingcute:settings-2-line" },
];

export function SideBar({ className = "" }: { className?: string }) {
  return (
    <aside
      className={[
        "h-full bg-[var(--color-bg2)] border-r border-[var(--color-bg3)]",
        "flex flex-col w-70",
        className,
      ].join(" ")}
    >
      <div className="px-7 mt-4 mb-8">
        <AppTitle />
      </div>

      <nav className="mt-2 px-3 space-y-2 overflow-auto">
        {items.map((it) => (
          <button
            key={it.label}
            className={[
              "w-full flex items-center gap-3 px-3 py-2 rounded-md transition-colors",
              it.active
                ? "bg-[var(--color-primary)] text-white"
                : "hover:bg-[var(--color-bg3)] text-[var(--color-text-primary)]",
            ].join(" ")}
          >
            <Icon
              icon={it.icon}
              width={20}
              className={it.active ? "text-white" : "text-[var(--color-icon)]"}
            />
            <span>{it.label}</span>
          </button>
        ))}
      </nav>
    </aside>
  );
}
