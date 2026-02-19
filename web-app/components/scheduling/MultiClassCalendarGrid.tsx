"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type WheelEvent,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import IconButton from "@/components/ui/buttons/IconButton";
import {
  addDaysToDayKey,
  BASE_DAY_MIN,
  buildLanes,
  diffDayKeys,
  formatMonthDayInTZ,
  formatWeekdayInTZ,
  ROW_GAP,
  ROW_PX,
} from "@/services/class/helpers/scheduling/scheduling-helpers";
import type { LaneItem } from "@/services/class/helpers/scheduling/scheduling-helpers";
import type { ScheduleItem } from "@/services/class/types/class-types";
import type { ScheduleClassBundle } from "./types";
import ClassDayDroppable from "./calendar/ClassDayDroppable";
import ScheduleSpanPill from "./calendar/ScheduleSpanPill";

type EditRequest = {
  classId: string;
  classTimezone: string;
  item: ScheduleItem;
};

function ClassTitle({
  className,
  classTimezone,
  colorHex,
}: {
  className?: string;
  classTimezone: string;
  colorHex?: string;
}) {
  return (
    <div className="mb-2 flex items-center gap-2">
      <span
        className="h-2.5 w-2.5 rounded-full shrink-0"
        style={{ background: colorHex || "var(--color-primary)" }}
      />
      <p className="truncate text-sm font-semibold text-[var(--color-text-primary)]">
        {className || "Untitled class"}
      </p>
      <span className="truncate text-xs text-[var(--color-text-secondary)]">
        {classTimezone}
      </span>
    </div>
  );
}

function ClassCalendarRow({
  cls,
  dayKeys,
  startKey,
  previewById,
  draggingPill,
  resizingPill,
  onEditRequest,
}: {
  cls: ScheduleClassBundle;
  dayKeys: string[];
  startKey: string;
  previewById?: Record<
    string,
    Partial<Pick<ScheduleItem, "startDate" | "endDate">>
  >;
  draggingPill?: { classId?: string; clientId: string };
  resizingPill?: { classId?: string; clientId: string };
  onEditRequest: (req: EditRequest) => void;
}) {
  const endKey = dayKeys[dayKeys.length - 1];

  const itemsForTrack = useMemo(
    () =>
      cls.schedule.map((s) =>
        previewById?.[s.clientId] ? { ...s, ...previewById[s.clientId] } : s
      ),
    [cls.schedule, previewById]
  );

  const lanes = useMemo<LaneItem[]>(
    () =>
      buildLanes(
        itemsForTrack,
        startKey,
        endKey,
        startKey,
        endKey,
        cls.classTimezone
      ),
    [itemsForTrack, startKey, endKey, cls.classTimezone]
  );

  const laneCount = lanes.reduce((m, x) => Math.max(m, x.lane), -1) + 1 || 1;
  const dayMinHeightPx =
    BASE_DAY_MIN +
    (laneCount > 0
      ? ROW_PX * laneCount + ROW_GAP * Math.max(0, laneCount - 1)
      : 0);

  const activeDraggingId =
    draggingPill?.classId === cls.classId ? draggingPill.clientId : undefined;
  const activeResizingId =
    resizingPill?.classId === cls.classId ? resizingPill.clientId : undefined;

  return (
    <div className="rounded-lg border border-[var(--color-bg4)] bg-[var(--color-bg1)] p-3">
      <ClassTitle
        className={cls.className}
        classTimezone={cls.classTimezone}
        colorHex={cls.colorHex}
      />

      <div className="relative rounded-md border border-[var(--color-bg4)] bg-[var(--color-bg2)] p-2">
        <div
          className="grid gap-2 mb-2"
          style={{ gridTemplateColumns: "repeat(7, minmax(0, 1fr))" }}
        >
          {dayKeys.map((dayKey) => (
            <ClassDayDroppable
              key={`${cls.classId}-${dayKey}`}
              classId={cls.classId}
              dayKey={dayKey}
              classTimezone={cls.classTimezone}
              minPx={dayMinHeightPx}
            />
          ))}
        </div>

        <div
          className="pointer-events-none absolute left-2 right-2"
          style={{ top: 10, bottom: 10 }}
        >
          <div
            className="grid gap-2"
            style={{
              gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
              gridTemplateRows: `repeat(${laneCount}, minmax(0, 2.25rem))`,
            }}
          >
            {lanes.map((item) => (
              <ScheduleSpanPill
                key={item.clientId}
                item={item}
                classId={cls.classId}
                classTimezone={cls.classTimezone}
                isDragging={activeDraggingId === item.clientId}
                isResizing={activeResizingId === item.clientId}
                onEditRequest={(clientId) => {
                  const found = cls.schedule.find(
                    (it) => it.clientId === clientId
                  );
                  if (!found) return;
                  onEditRequest({
                    classId: cls.classId,
                    classTimezone: cls.classTimezone,
                    item: found,
                  });
                }}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function MultiClassCalendarGrid({
  classes,
  selectedClassIds,
  startKey,
  onStartKeyChange,
  previewByClassId,
  draggingPill,
  resizingPill,
  onEditRequest,
}: {
  classes: ScheduleClassBundle[];
  selectedClassIds: string[];
  startKey: string;
  onStartKeyChange: (next: string) => void;
  previewByClassId: Record<
    string,
    Record<string, Partial<Pick<ScheduleItem, "startDate" | "endDate">>>
  >;
  draggingPill?: { classId?: string; clientId: string };
  resizingPill?: { classId?: string; clientId: string };
  onEditRequest: (req: EditRequest) => void;
}) {
  const wheelTsRef = useRef(0);
  const prevStartKeyRef = useRef(startKey);
  const [slideDir, setSlideDir] = useState<1 | -1>(1);

  const visibleClasses = useMemo(() => {
    if (!selectedClassIds.length) return classes;
    const ids = new Set(selectedClassIds);
    return classes.filter((c) => ids.has(c.classId));
  }, [classes, selectedClassIds]);

  const dayKeys = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDaysToDayKey(startKey, i)),
    [startKey]
  );

  useEffect(() => {
    const delta = diffDayKeys(startKey, prevStartKeyRef.current);
    if (delta !== 0) setSlideDir(delta > 0 ? 1 : -1);
    prevStartKeyRef.current = startKey;
  }, [startKey]);

  const shiftWindow = useCallback(
    (days: number) => {
      onStartKeyChange(addDaysToDayKey(startKey, days));
    },
    [onStartKeyChange, startKey]
  );

  const onHeaderWheel = useCallback(
    (e: WheelEvent<HTMLDivElement>) => {
      e.preventDefault();
      const now = performance.now();
      if (now - wheelTsRef.current < 140) return;
      wheelTsRef.current = now;
      shiftWindow(e.deltaY > 0 ? 1 : -1);
    },
    [shiftWindow]
  );

  return (
    <section className="rounded-lg border border-[var(--color-bg4)] bg-[var(--color-bg2)] p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
          Class Calendars
        </h2>
        <div className="flex items-center gap-2">
          <p className="text-xs text-[var(--color-text-secondary)]">
            Scroll on dates to move window
          </p>
          <IconButton
            icon="mingcute:left-line"
            variant="pagination"
            size="sm"
            title="Previous day"
            onClick={() => shiftWindow(-1)}
          />
          <IconButton
            icon="mingcute:right-line"
            variant="pagination"
            size="sm"
            title="Next day"
            onClick={() => shiftWindow(1)}
          />
        </div>
      </div>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={startKey}
          initial={{ x: slideDir * 26, opacity: 0.8 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: -slideDir * 26, opacity: 0.8 }}
          transition={{ duration: 0.2, ease: [0.2, 0.8, 0.2, 1] }}
        >
          <div
            className="grid grid-cols-7 gap-3 mb-3"
            onWheel={onHeaderWheel}
          >
            {dayKeys.map((dayKey) => (
              <div
                key={dayKey}
                className="rounded-md border border-[var(--color-bg4)] bg-[var(--color-bg1)] px-3 py-2"
              >
                <p className="text-xs font-semibold text-[var(--color-text-primary)]">
                  {formatWeekdayInTZ(dayKey, "UTC")}
                </p>
                <p className="text-xs text-[var(--color-text-secondary)]">
                  {formatMonthDayInTZ(dayKey, "UTC")}
                </p>
              </div>
            ))}
          </div>

          <div className="max-h-[calc(100vh-360px)] space-y-3 overflow-y-auto pr-1">
            {visibleClasses.map((cls) => (
              <ClassCalendarRow
                key={cls.classId}
                cls={cls}
                dayKeys={dayKeys}
                startKey={startKey}
                previewById={previewByClassId?.[cls.classId]}
                draggingPill={draggingPill}
                resizingPill={resizingPill}
                onEditRequest={onEditRequest}
              />
            ))}

            {!visibleClasses.length && (
              <div className="rounded-md border border-[var(--color-bg4)] bg-[var(--color-bg1)] p-4 text-sm text-[var(--color-text-secondary)]">
                No classes match the current selection.
              </div>
            )}
          </div>
        </motion.div>
      </AnimatePresence>
    </section>
  );
}
