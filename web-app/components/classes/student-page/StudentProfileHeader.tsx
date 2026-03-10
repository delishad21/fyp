"use client";

import { KpiStat } from "@/components/ui/StatDisplays";
import Image from "next/image";
import type { ReactNode } from "react";

type StudentProfileBadge = {
  id: string;
  name: string;
  description?: string;
  imageUrl?: string | null;
  engraving?: string | null;
};

type Props = {
  name: string;
  avatarUrl?: string;
  currentStreakDays: number;
  overallScore: number;
  rank: number | null;
  badges?: StudentProfileBadge[];
  actions?: ReactNode;
};

export default function StudentProfileHeader({
  name,
  avatarUrl,
  currentStreakDays,
  overallScore,
  rank,
  badges = [],
  actions,
}: Props) {
  const initials = (value: string) =>
    String(value || "")
      .split(" ")
      .filter(Boolean)
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();

  return (
    <div className="w-full rounded-xl bg-[var(--color-bg3)] py-5 pr-5 text-[var(--color-text-primary)]">
      {actions ? (
        <div className="mb-3 flex justify-end pl-5">{actions}</div>
      ) : null}
      <div className="flex items-center gap-6">
        {/* LEFT: Profile */}
        <div className="flex flex-col items-center gap-4">
          <div className="mx-10 h-30 w-30 overflow-hidden rounded-full bg-[var(--color-bg4)] relative">
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={avatarUrl}
                alt={`${name} avatar`}
                className="h-full w-full object-cover"
                loading="lazy"
                decoding="async"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-2xl font-bold text-[var(--color-text-secondary)]">
                {name
                  .split(" ")
                  .map((n) => n[0])
                  .join("")}
              </div>
            )}
          </div>
          <div className="text-xl font-bold">{name}</div>
        </div>

        {/* MIDDLE: Badges */}
        <div className="flex min-h-24 flex-1 items-start justify-start rounded-md bg-[var(--color-bg2)]/40 px-4 py-3">
          {badges.length > 0 ? (
            <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2 2xl:grid-cols-3">
              {badges.map((badge, i) => (
                <article
                  key={`${badge.id}-${i}`}
                  className="rounded-md border border-[var(--color-bg4)] bg-transparent p-3"
                >
                  <div className="relative mx-auto h-24 w-24 overflow-hidden rounded-md bg-transparent">
                    {badge.imageUrl ? (
                      <Image
                        src={badge.imageUrl}
                        alt={badge.name}
                        fill
                        className="object-contain"
                        unoptimized
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-xl font-bold text-[var(--color-text-secondary)]">
                        {initials(badge.name)}
                      </div>
                    )}
                  </div>
                  <p className="mt-2 text-center text-sm font-semibold text-[var(--color-text-primary)]">
                    {badge.name}
                  </p>
                </article>
              ))}
            </div>
          ) : (
            <div className="text-sm text-[var(--color-text-secondary)]">
              Badges will appear here
            </div>
          )}
        </div>

        {/* RIGHT: KPIs (1 row, ~1/4 width) */}
        <div className="flex basis-1/4 min-w-[22rem] flex-col gap-3">
          <KpiStat label="Rank" value={rank != null ? `#${rank}` : "—"} />
          <KpiStat
            label="Overall Score"
            value={Number(overallScore ?? 0).toLocaleString()}
          />
          <KpiStat
            label="Current Streak"
            value={`${currentStreakDays} ${
              currentStreakDays === 1 ? "Day" : "Days"
            }`}
          />
        </div>
      </div>
    </div>
  );
}
