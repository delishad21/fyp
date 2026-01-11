// components/classes/results-page/ScheduleHeader.tsx
"use client";

import { BarStat } from "@/components/ui/StatDisplays";
import {
  clampPct,
  pct,
  normalizeHex,
  fmtDateWithTZ,
} from "@/services/class/helpers/class-helpers";

export default function ScheduleHeader({
  quizName,
  quizVersion,
  subject,
  subjectColor,
  quizType,
  typeColorHex,
  topic,
  startDate,
  endDate,
  timezone,

  // stats from backend
  participationCount, // absolute participants
  totalStudents, // absolute denominator (roster size)
  participationPct, // 0..100 backend %
  avgPct, // 0..100 backend average %
  avgAbsScore, // optional absolute average (backend)
  avgAbsMax, // optional absolute average max (backend)

  // optional fallback inputs for % if backend avgPct missing
  sumScore,
  sumMax,
}: {
  quizName?: string;
  quizVersion: number;
  subject?: string;
  subjectColor?: string;
  quizType?: string;
  typeColorHex?: string;
  topic?: string;
  startDate?: string;
  endDate?: string;
  timezone?: string;

  participationCount: number;
  totalStudents: number;
  participationPct: number;

  avgPct: number;
  avgAbsScore?: number;
  avgAbsMax?: number;

  sumScore?: number;
  sumMax?: number;
}) {
  const safeSubjectColor = normalizeHex(subjectColor);
  const safeTypeColor = normalizeHex(typeColorHex);

  // Use backend denominator directly; if 0, we still show the percentage bar but omit abs max
  const absParticipants: number | undefined = Number.isFinite(
    participationCount
  )
    ? participationCount
    : undefined;
  const absTotal: number | undefined =
    Number.isFinite(totalStudents) && totalStudents > 0
      ? totalStudents
      : undefined;

  // Prefer backend avgPct; if it's 0 or not finite, fallback to sumScore/sumMax
  const shownAvgPct =
    Number.isFinite(avgPct) && avgPct > 0
      ? clampPct(avgPct)
      : pct(sumScore, sumMax);

  // Only show absolute average if BOTH are provided
  const showAvgAbs =
    Number.isFinite(avgAbsScore as number) &&
    Number.isFinite(avgAbsMax as number);

  return (
    <div className="flex items-stretch gap-6 rounded-lg bg-[var(--color-bg3)] px-7 py-5 text-[var(--color-text-primary)]">
      {/* LEFT: quiz identity */}
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <h1 className="truncate text-xl font-bold">
          {quizName ?? "Untitled Quiz"}
        </h1>

        {/* Subject dot + text */}
        <span className="flex items-center gap-2 leading-none">
          <span
            className="h-3.5 w-3.5 rounded-full shrink-0"
            style={{ background: safeSubjectColor ?? "var(--color-primary)" }}
            title={subject}
          />
          <span
            className="font-semibold truncate"
            style={{ color: safeSubjectColor ?? "var(--color-text-primary)" }}
            title={subject}
          >
            {subject ?? "—"}
          </span>
        </span>

        {/* Topic */}
        <div
          className="truncate text-md text-[var(--color-text-primary)]"
          title={topic}
        >
          {topic ?? "—"}
        </div>

        {/* Type as a colored pill */}
        <span
          className="inline-flex w-fit items-center rounded-full px-2.5 py-1.5 text-xs font-semibold"
          style={{
            background: safeTypeColor ?? "var(--color-bg4)",
            color: "var(--color-text-primary)",
          }}
          title={quizType}
        >
          {quizType ?? "—"}
        </span>

        {/* Version info */}
        <div className="text-xs text-[var(--color-text-secondary)]">
          Version {quizVersion}
        </div>
      </div>

      {/* RIGHT: KPIs top-right, schedule window bottom-right */}
      <div className="flex min-w-[26rem] flex-col justify-between gap-3">
        {/* Top: KPIs */}
        <div className="space-y-3">
          <BarStat
            label="Participation"
            valuePct={clampPct(participationPct)}
            {...(absParticipants !== undefined
              ? { absValue: absParticipants }
              : {})}
            {...(absTotal !== undefined ? { absMax: absTotal } : {})}
          />
          <BarStat
            label="Average Grade"
            valuePct={clampPct(shownAvgPct)}
            {...(showAvgAbs
              ? {
                  absValue: Math.round(Number(avgAbsScore)),
                  absMax: Math.round(Number(avgAbsMax)),
                }
              : {})}
          />
        </div>

        {/* Bottom: date range */}
        <div className="text-right text-sm text-[var(--color-text-secondary)]">
          {fmtDateWithTZ(startDate, timezone)} &rarr;{" "}
          {fmtDateWithTZ(endDate, timezone)}
        </div>
      </div>
    </div>
  );
}
