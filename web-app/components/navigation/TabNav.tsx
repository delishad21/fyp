"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

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
  listClassName,
  tabClassName,
}: {
  id?: string;
  tabs?: NavTab[];
  listClassName?: string;
  tabClassName?: string;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const resolvedTabs: NavTab[] = tabs
    ? tabs
    : id
      ? classTabs.map((t) => ({
          label: t.label,
          href: `/classes/${encodeURIComponent(id)}/${t.slug}`,
        }))
      : [];

  const isActive = (tab: NavTab) => {
    const [tabPath, tabQueryString] = tab.href.split("?");

    const pathMatches = tab.exact
      ? pathname === tabPath
      : pathname === tabPath || pathname.startsWith(`${tabPath}/`);
    if (!pathMatches) return false;

    if (!tabQueryString) return true;

    const requiredParams = new URLSearchParams(tabQueryString);
    for (const [key, value] of requiredParams.entries()) {
      if (searchParams.get(key) !== value) return false;
    }
    return true;
  };

  if (!resolvedTabs.length) return null;

  return (
    <nav>
      <ul
        className={
          listClassName ??
          "flex flex-wrap gap-2 bg-[var(--color-bg2)] p-1 ring-1 ring-black/5 py-2 px-3"
        }
      >
        {resolvedTabs.map((t) => {
          const active = isActive(t);
          return (
            <li key={t.href}>
              <Link
                href={t.href}
                className={[
                  tabClassName ??
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
