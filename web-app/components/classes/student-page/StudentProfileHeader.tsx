"use client";

import { KpiStat } from "@/components/ui/StatDisplays";
import Image from "next/image";

type Props = {
  name: string;
  avatarUrl?: string;
  currentStreakDays: number;
  overallScore: number;
  rank: number | null;
  badges?: string[];
};

export default function StudentProfileHeader({
  name,
  avatarUrl,
  currentStreakDays,
  overallScore,
  rank,
  badges = [],
}: Props) {
  return (
    <div className="w-full rounded-xl bg-[var(--color-bg3)] py-5 pr-5 text-[var(--color-text-primary)]">
      <div className="flex items-center gap-6">
        {/* LEFT: Profile */}
        <div className="flex flex-col items-center gap-4">
          <div className="mx-10 h-30 w-30 overflow-hidden rounded-full bg-[var(--color-bg4)] relative">
            {avatarUrl ? (
              <Image
                src={avatarUrl}
                alt={`${name} avatar`}
                fill
                className="object-cover"
                sizes="120px"
                unoptimized
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
        <div className="flex min-h-24 flex-1 items-center justify-center rounded-md bg-[var(--color-bg2)]/40 px-4 py-3">
          {badges.length > 0 ? (
            <div className="flex flex-wrap items-center justify-center gap-3">
              {badges.map((src, i) => (
                <Image
                  key={src + i}
                  src={src}
                  alt="Badge"
                  width={40}
                  height={40}
                  className="rounded-md object-cover"
                  unoptimized
                />
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
