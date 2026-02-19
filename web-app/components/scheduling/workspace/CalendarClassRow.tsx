"use client";

import { useMemo } from "react";
import {
  BASE_DAY_MIN,
  buildLanes,
  dayKeyFromDateInTZ,
  ROW_GAP,
  ROW_PX,
  tzDayKey,
} from "@/services/class/helpers/scheduling/scheduling-helpers";
import type { LaneItem } from "@/services/class/helpers/scheduling/scheduling-helpers";
import type { ScheduleItem } from "@/services/class/types/class-types";
import type { ScheduleClassBundle } from "../types";

export function intersectsDay(
  item: ScheduleItem,
  dayKey: string,
  classTimezone: string
) {
  const start = dayKeyFromDateInTZ(new Date(item.startDate), classTimezone);
  const end = dayKeyFromDateInTZ(new Date(item.endDate), classTimezone);
  return dayKey >= start && dayKey <= end;
}

export function hasVisibleConflict(cls: ScheduleClassBundle, dayKeys: string[]) {
  return dayKeys.some((dayKey) => {
    const count = cls.schedule.reduce(
      (n, item) => (intersectsDay(item, dayKey, cls.classTimezone) ? n + 1 : n),
      0
    );
    return count > 1;
  });
}

export default function CalendarClassRow({
  cls,
  dayKeys,
  selectedClientId,
  onSelectItem,
}: {
  cls: ScheduleClassBundle;
  dayKeys: string[];
  selectedClientId?: string;
  onSelectItem: (item: ScheduleItem) => void;
}) {
  const startKey = dayKeys[0];
  const endKey = dayKeys[dayKeys.length - 1];
  const todayKey = tzDayKey(new Date(), cls.classTimezone);

  const lanes = useMemo<LaneItem[]>(
    () =>
      buildLanes(
        cls.schedule,
        startKey,
        endKey,
        startKey,
        endKey,
        cls.classTimezone
      ),
    [cls.classTimezone, cls.schedule, endKey, startKey]
  );

  const laneCount = lanes.reduce((m, x) => Math.max(m, x.lane), -1) + 1 || 1;
  const dayMinHeightPx =
    BASE_DAY_MIN +
    (laneCount > 0
      ? ROW_PX * laneCount + ROW_GAP * Math.max(0, laneCount - 1)
      : 0);

  const countByDay = useMemo(() => {
    const out: Record<string, number> = {};
    for (const dayKey of dayKeys) {
      out[dayKey] = cls.schedule.reduce(
        (n, item) => (intersectsDay(item, dayKey, cls.classTimezone) ? n + 1 : n),
        0
      );
    }
    return out;
  }, [cls.classTimezone, cls.schedule, dayKeys]);

  return (
    <div className="rounded-lg border border-[var(--color-bg4)] bg-[var(--color-bg1)] p-3">
      <div className="mb-2 flex items-center gap-2">
        <span
          className="h-2.5 w-2.5 rounded-full shrink-0"
          style={{ background: cls.colorHex || "var(--color-primary)" }}
        />
        <p className="truncate text-sm font-semibold text-[var(--color-text-primary)]">
          {cls.className || "Untitled class"}
        </p>
        <span className="truncate text-xs text-[var(--color-text-secondary)]">
          {cls.classTimezone}
        </span>
      </div>

      <div className="relative rounded-md border border-[var(--color-bg4)] bg-[var(--color-bg2)] p-2">
        <div
          className="grid gap-2 mb-2"
          style={{ gridTemplateColumns: "repeat(7, minmax(0, 1fr))" }}
        >
          {dayKeys.map((dayKey) => {
            const isPast = dayKey < todayKey;
            const count = countByDay[dayKey] || 0;
            const hasConflict = count > 1;
            return (
              <div
                key={`${cls.classId}-${dayKey}`}
                data-day={dayKey}
                data-past={isPast ? "1" : undefined}
                className={[
                  "rounded-lg border",
                  isPast
                    ? "opacity-60 border-[var(--color-bg4)] bg-[var(--color-bg3)]"
                    : hasConflict
                    ? "border-[var(--color-warning)] bg-[var(--color-warning)]/10"
                    : "border-[var(--color-bg4)] bg-[var(--color-bg3)]",
                ].join(" ")}
                style={{ minHeight: dayMinHeightPx - 6 }}
              >
                <div className="px-2 py-1 text-right">
                  {count > 0 && (
                    <span className="rounded-full bg-[var(--color-bg1)] px-1.5 py-0.5 text-[10px] text-[var(--color-text-secondary)]">
                      {count}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div
          className="absolute left-2 right-2 pointer-events-none"
          style={{ top: 10, bottom: 10 }}
        >
          <div
            className="grid gap-2"
            style={{
              gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
              gridTemplateRows: `repeat(${laneCount}, minmax(0, 2.25rem))`,
            }}
          >
            {lanes.map((item) => {
              const isSelected = selectedClientId === item.clientId;
              return (
                <button
                  key={item.clientId}
                  type="button"
                  className={[
                    "pointer-events-auto h-9 rounded-full px-2 text-left shadow",
                    "bg-[var(--color-bg1)] border text-[var(--color-text-primary)]",
                    isSelected
                      ? "border-[var(--color-primary)] ring-1 ring-[var(--color-primary)]"
                      : "border-[var(--color-bg4)] hover:bg-[var(--color-bg3)]",
                  ].join(" ")}
                  style={{
                    gridColumn: `${item.colStart} / ${item.colEnd + 1}`,
                    gridRow: `${item.lane + 1} / ${item.lane + 2}`,
                  }}
                  onClick={() => {
                    const selected = cls.schedule.find(
                      (it) => it.clientId === item.clientId
                    );
                    if (selected) onSelectItem(selected);
                  }}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 rounded-full shrink-0"
                      style={{
                        background: item.subjectColor || "var(--color-primary)",
                      }}
                    />
                    <span className="truncate text-sm font-medium">
                      {item.quizName || item.quizId}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
