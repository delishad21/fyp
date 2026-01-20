"use client";

/**
 * TopBar Component
 *
 * Purpose:
 *   - Renders the top navigation bar for the application.
 *   - Displays the current page title, notification button, user avatar placeholder, and theme toggle.
 *
 * Notes:
 *   - To be implemented: Account dropdown and notifications menu (if needed)
 */

import { Icon } from "@iconify/react";
import ThemeToggle from "../ui/ThemeToggle";

export function TopBar({
  className = "",
  onToggleSidebar,
  sidebarCollapsed = false,
}: {
  className?: string;
  onToggleSidebar?: () => void;
  sidebarCollapsed?: boolean;
}) {
  return (
    <header
      className={[
        "bg-[var(--color-bg2)] border-b border-[var(--color-bg3)]",
        "flex items-center justify-between px-6 py-2",
        className,
      ].join(" ")}
    >
      {onToggleSidebar ? (
        <button
          type="button"
          onClick={onToggleSidebar}
          className="p-2 rounded-md hover:bg-[var(--color-bg3)]"
          title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <Icon
            icon="mingcute:menu-line"
            className="text-[var(--color-icon)]"
            width={22}
          />
        </button>
      ) : (
        <span />
      )}

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
