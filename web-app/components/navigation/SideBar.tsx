"use client";

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
      aria-label="Primary"
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
              aria-current={active ? "page" : undefined}
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
