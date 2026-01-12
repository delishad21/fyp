"use client";

import { EmptyLine, KpiStatBorder } from "@/components/ui/StatDisplays";
import { BarRow } from "./BarRow";
import { pct, normalizeHex } from "@/services/class/helpers/class-helpers";

type StatsProps = {
  stats: {
    sumScore?: number;
    sumMax?: number;
    participationCount?: number;
    streakDays?: number;
    bestStreakDays?: number;
    lastStreakDate?: string | Date | null;

    bySubject?: Record<
      string,
      { sumScore: number; sumMax: number; attempts: number; color?: string }
    >;
    byTopic?: Record<
      string,
      { sumScore: number; sumMax: number; attempts: number }
    >;
    canonicalBySchedule?: Record<
      string,
      {
        attemptId: string;
        score: number;
        maxScore: number;
        finishedAt: string | Date;
        subject?: string;
        topic?: string;
      }
    >;

    /** Optional convenience maps from backend */
    subjectColors?: Record<string, string>;
    subjectsAvgPct?: Record<string, number>;
    topicsAvgPct?: Record<string, number>;
  } | null;

  rank: number | null;

  participationPct?: number; // 0..100
  avgScorePct?: number; // 0..100
};

export default function StudentStatsDisplay({ rank, stats }: StatsProps) {
  if (!stats) {
    return (
      <div className="rounded-xl bg-[var(--color-bg3)] p-4 text-[var(--color-text-secondary)]">
        No statistics available.
      </div>
    );
  }

  // fallbacks if percentages weren’t passed
  const overallPct = pct(stats.sumScore, stats.sumMax);
  const partPct = Math.max(
    0,
    Math.min(
      100,
      typeof stats.participationPct === "number" ? stats.participationPct : 0
    )
  );
  const avgPct = Math.max(
    0,
    Math.min(
      100,
      typeof stats.avgScorePct === "number" ? stats.avgScorePct : overallPct
    )
  );

  // Normalize maps (Mongo Map -> POJO)
  const bySubject = stats.bySubject ?? {};
  const subjectsAvgPct = stats.subjectsAvgPct ?? {};
  const byTopic = stats.byTopic ?? {};
  const topicsAvgPct = stats.topicsAvgPct ?? {};
  // const canonicals = stats.canonicalBySchedule ?? {}; // not used on this screen
  const subjectColors = stats.subjectColors ?? {};

  const subjectEntries = Object.entries(bySubject);
  const topicEntries = Object.entries(byTopic);

  const colorForSubject = (subj: string) =>
    normalizeHex(subjectColors?.[subj] || bySubject?.[subj]?.color);

  // Labels
  const participationLabel = `${stats.participationCount ?? 0} ${
    (stats.participationCount ?? 0) === 1 ? "Quiz" : "Quizzes"
  }`;
  const bestStreakLabel = `${stats.bestStreakDays ?? 0} ${
    (stats.bestStreakDays ?? 0) === 1 ? "Day" : "Days"
  }`;
  const avgGradeLeft =
    stats.sumMax && stats.sumMax > 0
      ? `${Math.round(stats.sumScore ?? 0)}/${Math.round(stats.sumMax ?? 0)}`
      : undefined;

  return (
    <>
      {/* Top grid -> 3 columns */}
      <div className="grid grid-cols-3 gap-4">
        {/* At a Glance: two bars + one KPI */}
        <section className="rounded-md bg-[var(--color-bg3)] p-4">
          <h3 className="mb-3 text-lg font-semibold">At a Glance</h3>
          <div className="grid grid-cols-1 gap-3">
            <BarRow
              label="Participation"
              left={participationLabel}
              pct={partPct}
              right={`${partPct}%`}
            />
            <BarRow
              label="Average Grade"
              left={avgGradeLeft}
              pct={avgPct}
              right={`${avgPct}%`}
            />
            {rank != null ? (
              <KpiStatBorder label="Rank" value={`#${rank}`} />
            ) : null}
            <KpiStatBorder label="Highest Streak" value={bestStreakLabel} />
          </div>
        </section>

        {/* Subjects */}
        <section className="rounded-md bg-[var(--color-bg3)] p-4">
          <h3 className="mb-3 text-lg font-semibold">Subjects</h3>
          {subjectEntries.length === 0 ? (
            <EmptyLine text="No subject statistics yet." />
          ) : (
            <div className="flex min-w-[20rem] flex-col gap-3">
              {subjectEntries.map(([subj, bucket]) => {
                const avg = subjectsAvgPct[subj];
                const avgPctRow =
                  typeof avg === "number"
                    ? avg
                    : pct(bucket?.sumScore, bucket?.sumMax);
                const left = `${bucket?.sumScore ?? 0}/${
                  bucket?.sumMax ?? 0
                }`;

                return (
                  <BarRow
                    key={subj}
                    label={subj}
                    left={left}
                    pct={avgPctRow}
                    right={`${avgPctRow}%`}
                    colorHex={colorForSubject(subj)}
                  />
                );
              })}
            </div>
          )}
        </section>

        {/* Topics */}
        <section className="rounded-md bg-[var(--color-bg3)] p-4">
          <h3 className="mb-3 text-lg font-semibold">Topics</h3>
          {topicEntries.length === 0 ? (
            <EmptyLine text="No topic statistics yet." />
          ) : (
            <div className="flex min-w-[20rem] flex-col gap-3">
              {topicEntries.map(([topic, bucket]) => {
                const avg = topicsAvgPct[topic];
                const avgPctRow =
                  typeof avg === "number"
                    ? avg
                    : pct(bucket?.sumScore, bucket?.sumMax);
                const left = `${bucket?.sumScore ?? 0}/${
                  bucket?.sumMax ?? 0
                }`;

                return (
                  <BarRow
                    key={topic}
                    label={topic}
                    left={left}
                    pct={avgPctRow}
                    right={`${avgPctRow}%`}
                  />
                );
              })}
            </div>
          )}
        </section>
      </div>
    </>
  );
}
