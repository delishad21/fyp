// components/classes/results-page/ScheduleStatsPanel.tsx
"use client";

import BasicRapidStats from "./ScheduleStatsType/BasicRapidStats";
import CrosswordStats from "./ScheduleStatsType/CrosswordStats";

export default function ScheduleStatsPanel({
  quizType,
  breakdown,
}: {
  quizType?: string | null;
  breakdown?: unknown;
}) {
  if (
    !breakdown ||
    typeof breakdown !== "object" ||
    !("items" in breakdown) ||
    !Array.isArray((breakdown as { items?: unknown[] }).items)
  ) {
    return (
      <div className="text-sm text-[var(--color-text-secondary)]">
        No statistics available yet.
      </div>
    );
  }

  const t = (quizType || "").toLowerCase();
  if (t === "crossword") {
    return <CrosswordStats breakdown={breakdown as { items: unknown[] }} />;
  }

  // "basic" and "rapid" share the same item shape
  return <BasicRapidStats breakdown={breakdown as { items: unknown[] }} />;
}
