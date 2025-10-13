// components/classes/results-page/ScheduleStatsPanel.tsx
"use client";

import BasicRapidStats from "./ScheduleStatsType/BasicRapidStats";
import CrosswordStats from "./ScheduleStatsType/CrosswordStats";

export default function ScheduleStatsPanel({
  quizType,
  breakdown,
}: {
  quizType?: string | null;
  breakdown?: any;
}) {
  if (!breakdown || !breakdown.items || !Array.isArray(breakdown.items)) {
    return (
      <div className="text-sm text-[var(--color-text-secondary)]">
        No statistics available yet.
      </div>
    );
  }

  const t = (quizType || "").toLowerCase();
  if (t === "crossword") {
    return <CrosswordStats breakdown={breakdown} />;
  }

  // "basic" and "rapid" share the same item shape
  return <BasicRapidStats breakdown={breakdown} quizType={t} />;
}
