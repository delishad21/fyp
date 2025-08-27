// components/navigation/SettingsTopNav.tsx
"use client";

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
                aria-current={active ? "page" : undefined}
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
