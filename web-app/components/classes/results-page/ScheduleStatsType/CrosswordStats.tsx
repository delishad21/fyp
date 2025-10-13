"use client";

import { clampPct } from "@/services/class/helpers/class-helpers";
import { StatBar } from "./StatBar";

export type CrosswordStatsProps = {
  breakdown: {
    attemptsCount?: number;
    overallAvgScorePct?: number;
    overallAvgScoreRaw?: { meanScore?: number; meanMax?: number };
    items: Array<{
      entryId: string;
      clue: string;
      expected?: string;
      totalAttempts?: number;
      perQuestionAvgPct?: number | null; // fill %
      correctPctPct?: number | null; // correctness %
      answers?: { value: string; count: number; pct: number; pctPct: number }[];
    }>;
  };
};

export default function CrosswordStats({ breakdown }: CrosswordStatsProps) {
  const overallPct = clampPct(breakdown.overallAvgScorePct);

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      {/* Overall */}
      <div className="rounded-lg border border-[var(--color-bg4)] bg-[var(--color-bg3)] p-4">
        <div className="mb-2 text-sm font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">
          Overall Average
        </div>
        <StatBar
          pct={overallPct}
          rightText={
            breakdown.overallAvgScoreRaw?.meanScore != null &&
            breakdown.overallAvgScoreRaw?.meanMax != null
              ? `${Math.round(
                  breakdown.overallAvgScoreRaw.meanScore
                )}/${Math.round(breakdown.overallAvgScoreRaw.meanMax)}`
              : undefined
          }
        />
      </div>

      {/* Per-clue */}
      {breakdown.items.map((it, idx) => (
        <div
          key={it.entryId || idx}
          className="rounded-xl border border-[var(--color-bg4)] bg-[var(--color-bg3)] p-5"
        >
          {/* Header row */}
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="text-sm font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">
              Word {idx + 1}
            </div>
            <div className="text-xs text-[var(--color-text-secondary)]">
              Attempts: {it.totalAttempts ?? 0}
            </div>
          </div>

          {/* Clue + Expected answer */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="text-[var(--color-text-primary)] whitespace-pre-wrap">
              <div className="text-xs font-medium text-[var(--color-text-secondary)] mb-1">
                Clue
              </div>
              {it.clue}
            </div>
            <div className="text-[var(--color-text-primary)]">
              <div className="text-xs font-medium text-[var(--color-text-secondary)] mb-1">
                Expected
              </div>
              <div className="rounded-md border border-[var(--color-bg4)] bg-[var(--color-bg2)] px-3 py-2 text-sm font-semibold tracking-wide">
                {it.expected || "—"}
              </div>
            </div>
          </div>

          {/* Stats */}
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div>
              <div className="text-xs font-medium text-[var(--color-text-secondary)] mb-1">
                Correctness
              </div>
              <StatBar pct={it.correctPctPct ?? 0} />
            </div>

            <div>
              <div className="text-xs font-medium text-[var(--color-text-secondary)] mb-1">
                Fill completeness
              </div>
              <StatBar pct={it.perQuestionAvgPct ?? 0} />
            </div>
          </div>

          {/* Top submitted answers (if any) */}
          {Array.isArray(it.answers) && it.answers.length > 0 && (
            <div className="mt-5">
              <div className="text-xs font-medium text-[var(--color-text-secondary)] mb-2">
                Most common submissions
              </div>
              <ul className="grid gap-2 sm:grid-cols-2">
                {it.answers.map((a, i) => (
                  <li
                    key={`${a.value}-${i}`}
                    className="rounded-md border border-[var(--color-bg4)] bg-[var(--color-bg2)] p-2.5"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-medium">{a.value}</div>
                      <div className="text-xs text-[var(--color-text-secondary)]">
                        {a.count} • {clampPct(a.pctPct)}%
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
