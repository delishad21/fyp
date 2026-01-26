"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { getPendingJobsCount } from "@/services/ai-generation/ai-generation-actions";

const tabs = [
  { slug: "", label: "My Quizzes" },
  { slug: "ai-generate", label: "AI Generation", showBadge: true },
];

export default function QuizTabNav() {
  const pathname = usePathname();
  const base = `/quizzes`;
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    async function fetchCount() {
      const result = await getPendingJobsCount();
      if (result.ok) {
        setPendingCount(result.count);
      }
    }
    fetchCount();
  }, []);

  const isActive = (slug: string) => {
    if (slug === "") {
      return pathname === base;
    }
    const href = `${base}/${slug}`;
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  return (
    <nav>
      <ul className="flex flex-wrap gap-2 bg-[var(--color-bg2)] p-1 ring-1 ring-black/5 py-2 px-3">
        {tabs.map((t) => {
          const href = t.slug === "" ? base : `${base}/${t.slug}`;
          const active = isActive(t.slug);
          return (
            <li key={t.slug || "home"}>
              <Link
                href={href}
                className={[
                  "inline-flex items-center gap-2 rounded-sm px-3 py-1.5 text-md transition",
                  active
                    ? "bg-[var(--color-primary)] text-white"
                    : "text-[var(--color-text-primary)] hover:bg-[var(--color-bg3)]",
                ].join(" ")}
              >
                {t.label}
                {t.showBadge && pendingCount > 0 && (
                  <span
                    className={[
                      "inline-flex items-center justify-center px-2 py-0.5 text-xs font-bold rounded-full",
                      active
                        ? "bg-white text-[var(--color-primary)]"
                        : "bg-[var(--color-accent)] text-white",
                    ].join(" ")}
                  >
                    {pendingCount}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
