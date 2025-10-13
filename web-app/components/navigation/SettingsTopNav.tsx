"use client";

/**
 * SettingsTopNav Component
 *
 * Purpose:
 *   - Provides a top navigation bar for the settings section.
 *   - Highlights the active tab based on the current pathname.
 *
 * Behavior / Logic:
 *   - Tabs are defined in a local `tabs` array with { label, href }.
 *   - Active tab detection:
 *       • Active if pathname matches exactly or starts with tab href + "/".
 *
 * UI:
 *   - Horizontal nav bar (`<ul>`) with tab links styled as buttons.
 *   - Active tab: background + primary text color.
 *   - Inactive tab: secondary text color, hover background highlight.
 *
 * Notes:
 *   - Currently only includes "Account" tab.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { label: "Account", href: "/settings" },
  // future: { label: "Notifications", href: "/settings/notifications" },
];

export default function SettingsTopNav() {
  const pathname = usePathname();

  return (
    <nav>
      <ul className="flex items-center gap-2">
        {tabs.map((t) => {
          const active =
            pathname === t.href || pathname.startsWith(t.href + "/");
          return (
            <li key={t.href}>
              <Link
                href={t.href}
                className={[
                  "inline-flex items-center rounded-sm px-4 py-2 text-sm font-medium transition",
                  active
                    ? "bg-[var(--color-bg3)] text-[var(--color-text-primary)]"
                    : "text-[var(--color-text-secondary)] hover:bg-[var(--color-bg4)]",
                ].join(" ")}
              >
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
