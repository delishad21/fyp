"use client";

import { useTheme } from "next-themes";
import { Icon } from "@iconify/react";

export default function ThemeToggle() {
  const { resolvedTheme, setTheme, theme } = useTheme();
  const mode = theme === "system" ? resolvedTheme : theme;
  const isDark = mode === "dark";

  return (
    <button
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className="inline-flex items-center gap-2 px-3 py-2 rounded-sm border border-[var(--color-bg4)] bg-[var(--color-bg1)] hover:bg-[var(--color-bg4)]"
    >
      <Icon
        icon={isDark ? "mingcute:sun-line" : "mingcute:moon-line"}
        className="text-[var(--color-icon)]"
        width={18}
        height={18}
      />
    </button>
  );
}
