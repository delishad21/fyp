"use client";

/**
 * SideBar Component
 *
 * Purpose:
 *   - Provides the primary sidebar navigation for the app.
 *   - Displays app title, main navigation links, and a sign-out button.
 *
 * Nav Items:
 *   - Defined in `items` array with { label, icon, href }.
 *   - Labels: "Home", "Quizzes", "Classes", "Settings".
 *   - Active link detection:
 *       • "Home": active only when pathname is "/".
 *       • Others: active if pathname starts with the link href.
 *
 * UI Structure:
 *   - AppTitle at top.
 *   - Navigation list of links with icons.
 *       • Active link: colored background, white text/icon.
 *       • Inactive link: normal text color, hover background highlight.
 *   - SignOutButton anchored at the bottom.
 **/

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@iconify/react";
import { AppTitle } from "@/components/navigation/AppTitle";
import SignOutButton from "../auth/form-components/SignOutButton";

type NavItem = {
  label: "Home" | "Quizzes" | "Classes" | "Settings";
  icon: string;
  href: string;
};

const items: NavItem[] = [
  { label: "Home", icon: "mingcute:home-2-line", href: "/" },
  { label: "Quizzes", icon: "mingcute:book-2-line", href: "/quizzes" },
  { label: "Classes", icon: "mingcute:group-2-line", href: "/classes" },
  { label: "Settings", icon: "mingcute:settings-2-line", href: "/settings" },
];

export function SideBar({ className = "" }: { className?: string }) {
  const pathname = usePathname();

  const isActive = (href: string, label: NavItem["label"]) => {
    if (label === "Home") return pathname === "/";
    return pathname.startsWith(href);
  };

  return (
    <aside
      className={[
        "h-full bg-[var(--color-bg2)] border-r border-[var(--color-bg3)]",
        "flex flex-col w-70",
        className,
      ].join(" ")}
      role="navigation"
    >
      <div className="px-7 mt-4 mb-8">
        <AppTitle />
      </div>

      <nav className="mt-2 px-3 space-y-2 overflow-auto">
        {items.map((it) => {
          const active = isActive(it.href, it.label);
          return (
            <Link
              key={it.label}
              href={it.href}
              className={[
                "w-full flex items-center gap-3 px-3 py-2 rounded-md transition-colors",
                active
                  ? "bg-[var(--color-primary)] text-white"
                  : "hover:bg-[var(--color-bg3)] text-[var(--color-text-primary)]",
              ].join(" ")}
            >
              <Icon
                icon={it.icon}
                width={20}
                className={active ? "text-white" : "text-[var(--color-icon)]"}
              />
              <span>{it.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto mx-auto mb-5">
        <SignOutButton />
      </div>
    </aside>
  );
}
