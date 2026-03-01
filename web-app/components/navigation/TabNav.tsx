"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const classTabs = [
  { slug: "overview", label: "Overview" },
  { slug: "students", label: "Students" },
  { slug: "scheduling", label: "Scheduling" },
  { slug: "results", label: "Results" },
];

export type NavTab = {
  label: string;
  href: string;
  exact?: boolean;
};

export default function TabsNav({
  id,
  tabs,
}: {
  id?: string;
  tabs?: NavTab[];
}) {
  const pathname = usePathname();

  const resolvedTabs: NavTab[] = tabs
    ? tabs
    : id
      ? classTabs.map((t) => ({
          label: t.label,
          href: `/classes/${encodeURIComponent(id)}/${t.slug}`,
        }))
      : [];

  const isActive = (tab: NavTab) => {
    if (tab.exact) return pathname === tab.href;
    return pathname === tab.href || pathname.startsWith(`${tab.href}/`);
  };

  if (!resolvedTabs.length) return null;

  return (
    <nav>
      <ul className="flex flex-wrap gap-2 bg-[var(--color-bg2)] p-1 ring-1 ring-black/5 py-2 px-3">
        {resolvedTabs.map((t) => {
          const active = isActive(t);
          return (
            <li key={t.href}>
              <Link
                href={t.href}
                className={[
                  "inline-flex items-center rounded-sm px-3 py-1.5 text-md transition",
                  active
                    ? "bg-[var(--color-primary)] text-white"
                    : "text-[var(--color-text-primary)] hover:bg-[var(--color-bg3)]",
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
