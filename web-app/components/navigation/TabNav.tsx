// app/classes/[id]/TabsNav.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { slug: "overview", label: "Overview" },
  { slug: "students", label: "Students" },
  { slug: "scheduling", label: "Scheduling" },
  { slug: "results", label: "Results" },
];

export default function TabsNav({ id }: { id: string }) {
  const pathname = usePathname();
  const base = `/classes/${encodeURIComponent(id)}`;

  const isActive = (slug: string) => {
    const href = `${base}/${slug}`;
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  return (
    <nav>
      <ul className="flex flex-wrap gap-2 bg-[var(--color-bg2)] p-1 ring-1 ring-black/5 py-2 px-3">
        {tabs.map((t) => {
          const href = `${base}/${t.slug}`;
          const active = isActive(t.slug);
          return (
            <li key={t.slug}>
              <Link
                href={href}
                className={[
                  "inline-flex items-center rounded-sm px-3 py-1.5 text-md transition",
                  active
                    ? "bg-[var(--color-primary)] text-[var(--color-text-primary)]"
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
