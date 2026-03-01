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
 *       • "Home": active when pathname is "/" OR "/home" (or "/home/...").
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
  label: "Home" | "Scheduling" | "Quizzes" | "Classes" | "Settings";
  icon: string;
  href: string;
};

const items: NavItem[] = [
  { label: "Home", icon: "mingcute:home-2-line", href: "/home" },
  { label: "Quizzes", icon: "mingcute:book-2-line", href: "/quizzes" },
  { label: "Classes", icon: "mingcute:group-2-line", href: "/classes" },
  {
    label: "Scheduling",
    icon: "mingcute:calendar-line",
    href: "/scheduling",
  },
  {
    label: "Settings",
    icon: "mingcute:settings-2-line",
    href: "/settings/accounts",
  },
];

function normalizePathname(pathname: string | null) {
  if (!pathname) return "/";
  // remove trailing slash except root
  if (pathname.length > 1 && pathname.endsWith("/"))
    return pathname.slice(0, -1);
  return pathname;
}

export function SideBar({
  className = "",
  collapsed = false,
}: {
  className?: string;
  collapsed?: boolean;
}) {
  const rawPathname = usePathname();
  const pathname = normalizePathname(rawPathname);

  const isActive = (href: string, label: NavItem["label"]) => {
    // Home should be active on /home (and /home/*), and also handle "/" during initial render / transitions
    if (label === "Home")
      return (
        pathname === "/" ||
        pathname === "/home" ||
        pathname.startsWith("/home/")
      );
    if (label === "Settings") {
      return pathname === "/settings" || pathname.startsWith("/settings/");
    }
    // Others: active if exact match or nested routes
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  return (
    <aside
      className={[
        "h-full bg-[var(--color-bg2)] border-r border-[var(--color-bg3)]",
        "flex flex-col transition-[width] duration-200 ease-out",
        collapsed ? "w-20" : "w-70",
        className,
      ].join(" ")}
      role="navigation"
    >
      <div className={collapsed ? "px-2 mt-4 mb-8" : "px-7 mt-4 mb-8"}>
        <AppTitle compact={collapsed} />
      </div>

      <nav className="mt-2 px-3 space-y-2 overflow-auto">
        {items.map((it) => {
          const active = isActive(it.href, it.label);

          return (
            <Link
              key={it.label}
              href={it.href}
              title={it.label}
              className={[
                "w-full flex items-center rounded-md transition-colors",
                collapsed ? "justify-center px-2 py-2" : "gap-3 px-3 py-2",
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
              <span className={collapsed ? "sr-only" : ""}>{it.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto mx-auto mb-5">
        <SignOutButton compact={collapsed} />
      </div>
    </aside>
  );
}
