"use client";

import {
  useMemo,
  useState,
  useCallback,
  useEffect,
  useRef,
  type CSSProperties,
} from "react";
import { motion, useAnimationControls } from "framer-motion";
import type { AnimationDefinition } from "framer-motion";

import DateField from "@/components/ui/selectors/DateField";
import { PillsGrid } from "./PillsGrid";
import {
  addDaysToDayKey,
  diffDayKeys,
  formatMonthDayInTZ,
  formatWeekdayInTZ,
  dayKeyFromDateInTZ,
  VISIBLE_DAYS,
  BUFFER,
  BASE_DAY_MIN,
  ROW_PX,
  ROW_GAP,
  TRACK_COLS,
  HEIGHT_SPRING,
  tzDayKey,
  buildLanes,
} from "@/services/class/helpers/scheduling/scheduling-helpers";
import { ScheduleItem } from "@/services/class/types/class-types";
import { DayCellStatic } from "./DayCellStatic";
import { DayDroppable } from "./DayDroppable";
import { DragAutoSlideMonitor } from "./DragAutoSlideMonitor";

/** ===================
 * Main Calendar UI
 * =================== */
export default function SevenDayCalendar({
  schedule,
  previewById,
  draggingQuizId,
  resizingQuizId, // from parent
  suppressLayoutId, // optional
  classTimezone,
  onEditRequest, // right-click callback
  readOnly = false,
  titleComponent, // optional title JSX
  showGoToDate = true,
  dragClassId,
  dayDropIdForDate,
  startKeyOverride,
  onStartKeyChange,
  onShiftWindowRequest,
  enableAutoSlideMonitor = true,
}: {
  schedule: ScheduleItem[];
  previewById?: Record<
    string,
    Partial<Pick<ScheduleItem, "startDate" | "endDate">>
  >;
  draggingQuizId?: string;
  /** If set, indicates which quiz is currently being RESIZED (from parent). */
  resizingQuizId?: string;
  /** If set, indicates which quizId should suppress layoutId animations (from parent). */
  suppressLayoutId?: string;
  classTimezone: string;
  /** Right-click (context menu) on a pill to open edit modal. */
  onEditRequest?: (clientId: string) => void;
  /** If true -> no drag/resize/right-click; no DnD provider required. */
  readOnly?: boolean;
  titleComponent?: React.ReactNode;
  showGoToDate?: boolean;
  /** Optional class id to attach to pill drag payload. */
  dragClassId?: string;
  /** Optional droppable id builder per day cell. */
  dayDropIdForDate?: (dayKey: string) => string;
  /**
   * Optional externally controlled start day key.
   * When provided, local wheel/edge shift events should use `onShiftWindowRequest`.
   */
  startKeyOverride?: string;
  /** Optional callback for direct "go to date" updates. */
  onStartKeyChange?: (next: string) => void;
  /** Optional callback for +1 / -1 day shifts (wheel, drag edge). */
  onShiftWindowRequest?: (dir: 1 | -1) => void;
  /** Disable internal drag edge auto-slide monitor when parent owns syncing. */
  enableAutoSlideMonitor?: boolean;
}) {
  const externallyControlled = typeof startKeyOverride === "string";

  // Visible window start (class-local day key)
  const [startKey, setStartKey] = useState<string>(() =>
    externallyControlled && startKeyOverride
      ? startKeyOverride
      : dayKeyFromDateInTZ(new Date(), classTimezone)
  );

  // Reset local baseline when timezone changes in uncontrolled mode.
  useEffect(() => {
    if (externallyControlled) return;
    setStartKey(dayKeyFromDateInTZ(new Date(), classTimezone));
  }, [classTimezone, externallyControlled]);

  // Derived bounds for this render
  const visibleEndKey = useMemo(
    () => addDaysToDayKey(startKey, VISIBLE_DAYS - 1),
    [startKey]
  );
  const trackStartKey = useMemo(
    () => addDaysToDayKey(startKey, -BUFFER),
    [startKey]
  );
  const trackEndKey = useMemo(
    () => addDaysToDayKey(startKey, VISIBLE_DAYS - 1 + BUFFER),
    [startKey]
  );

  // Paging slide animation (Framer)
  const isSlidingRef = useRef(false);
  const controls = useAnimationControls();
  const [isSliding, setIsSliding] = useState(false);
  const slideTargetRef = useRef(BUFFER);
  const [isSettling, setIsSettling] = useState(false); // brief cooldown after slide ends

  const resetSlideTrack = useCallback(() => {
    slideTargetRef.current = BUFFER;
    controls.set({ "--slide": BUFFER } as Record<string, number>);
  }, [controls]);

  const slideOnce = useCallback(
    async (
      dir: 1 | -1,
      opts?: {
        /**
         * Skip mutating the local startKey at the end of the animation.
         * Used when parent drives the key and we only want the visual slide.
         */
        skipCommit?: boolean;
      }
    ) => {
      if (isSlidingRef.current) return false;
      isSlidingRef.current = true;
      setIsSliding(true);

      const next = Math.max(
        BUFFER - 1,
        Math.min(BUFFER + 1, slideTargetRef.current + dir)
      );
      slideTargetRef.current = next;

      const slideAnim = {
        "--slide": next,
        transition: {
          type: "tween",
          duration: 0.22,
          ease: [0.2, 0.8, 0.2, 1],
        },
      } as unknown as AnimationDefinition;
      await controls.start(slideAnim);

      if (!opts?.skipCommit) {
        setStartKey((s) => addDaysToDayKey(s, dir));
      }

      resetSlideTrack();

      requestAnimationFrame(() => {
        isSlidingRef.current = false;
        setIsSliding(false);
        setIsSettling(true);
        requestAnimationFrame(() => setIsSettling(false));
      });

      return true;
    },
    [controls, resetSlideTrack]
  );

  // Sync local track to external key changes (used by multi-calendar scheduler).
  useEffect(() => {
    if (!externallyControlled || !startKeyOverride) return;
    if (startKeyOverride === startKey) return;
    if (isSlidingRef.current) return;

    const delta = diffDayKeys(startKeyOverride, startKey);
    if (Math.abs(delta) === 1) {
      const dir: 1 | -1 = delta > 0 ? 1 : -1;
      let cancelled = false;
      (async () => {
        const didSlide = await slideOnce(dir, { skipCommit: true });
        if (cancelled || !didSlide) return;
        setStartKey(startKeyOverride);
        resetSlideTrack();
      })();
      return () => {
        cancelled = true;
      };
    }

    // Large jumps should snap directly to the requested date.
    setStartKey(startKeyOverride);
    resetSlideTrack();
  }, [
    externallyControlled,
    resetSlideTrack,
    slideOnce,
    startKey,
    startKeyOverride,
  ]);

  const requestShift = useCallback(
    (dir: 1 | -1) => {
      if (onShiftWindowRequest) {
        onShiftWindowRequest(dir);
        return;
      }
      void slideOnce(dir);
    },
    [onShiftWindowRequest, slideOnce]
  );

  // Viewport & auto-slide via pointer/wheel
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const dragStartClientRef = useRef<number | null>(null);
  const lastSlideTsRef = useRef(0);
  const SLIDE_COOLDOWN_MS = 180;
  const EDGE_HYSTERESIS_PX = 8;

  // Which pill instance (clientId) is currently being dragged, for local fading
  const [draggingUid, setDraggingUid] = useState<string | undefined>(undefined);

  // Auto-slide on wheel
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      const delta =
        Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
      if (delta === 0) return;

      e.preventDefault();
      requestShift(delta > 0 ? 1 : -1);
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [requestShift]);

  // Go to date control (keep animation path intact)
  const onGoToDate = useCallback(
    async (ymd?: string) => {
      const next = ymd ? ymd : dayKeyFromDateInTZ(new Date(), classTimezone);
      const delta = diffDayKeys(next, startKey);
      if (delta === 0) return;

      if (onStartKeyChange) {
        onStartKeyChange(next);
        return;
      }

      // Manual date pick should jump without slide animation.
      if (ymd) {
        setStartKey(next);
        resetSlideTrack();
        return;
      }

      const steps = Math.min(12, Math.abs(delta));
      const dir: 1 | -1 = delta > 0 ? 1 : -1;
      for (let i = 0; i < steps; i++) {
        await slideOnce(dir);
      }
      if (Math.abs(delta) > steps) {
        setStartKey(next);
        resetSlideTrack();
      }
    },
    [classTimezone, onStartKeyChange, resetSlideTrack, slideOnce, startKey]
  );

  /** ======================
   * Lane locking and data
   * ====================== */
  const [frozenLaneMap, setFrozenLaneMap] = useState<Record<
    string,
    number
  > | null>(null);
  const [singleFreezeMap, setSingleFreezeMap] = useState<Record<
    string,
    number
  > | null>(null);
  const prevDragIdRef = useRef<string | undefined>(undefined);

  // Attach preview dates (resize/move), keep per-instance index
  const itemsForTrack = useMemo(
    () =>
      schedule.map((s, i) => {
        const merged = previewById?.[s.clientId]
          ? { ...s, ...previewById[s.clientId] }
          : s;
        return { ...merged, __idx: i } as ScheduleItem & { __idx: number };
      }),
    [schedule, previewById]
  );

  // Sticky lanes snapshot (for the duration of one interaction)
  const baselineStickyRef = useRef<Record<string, number>>({});
  const usingSticky = Boolean(draggingQuizId || resizingQuizId);

  const computedLanes = useMemo(
    () =>
      buildLanes(
        itemsForTrack,
        trackStartKey,
        trackEndKey,
        startKey,
        visibleEndKey,
        classTimezone,
        singleFreezeMap
          ? (new Map(Object.entries(singleFreezeMap)) as Map<string, number>)
          : undefined,
        usingSticky && Object.keys(baselineStickyRef.current).length
          ? (new Map(
              Object.entries(baselineStickyRef.current).map(([k, v]) => [
                k,
                v as number,
              ])
            ) as Map<string, number>)
          : undefined
      ),
    [
      classTimezone,
      itemsForTrack,
      singleFreezeMap,
      startKey,
      trackEndKey,
      trackStartKey,
      usingSticky,
      visibleEndKey,
    ]
  );

  // Snapshot baseline lanes on interaction start; clear when it ends
  const prevUsingStickyRef = useRef(false);
  useEffect(() => {
    const was = prevUsingStickyRef.current;
    if (!was && usingSticky) {
      const snap: Record<string, number> = {};
      for (const l of computedLanes) snap[l.clientId] = l.lane; // key by clientId
      baselineStickyRef.current = snap;
    }
    if (was && !usingSticky) baselineStickyRef.current = {};
    prevUsingStickyRef.current = usingSticky;
  }, [usingSticky, computedLanes]);

  // Visible window (columns)
  const VISIBLE_START_COL = 1 + BUFFER;
  const VISIBLE_END_COL = VISIBLE_START_COL + VISIBLE_DAYS - 1;

  const lanesVisibleOnly = useMemo(() => {
    const base = computedLanes.filter(
      (l) => l.colEnd >= VISIBLE_START_COL && l.colStart <= VISIBLE_END_COL
    );

    const activeId = draggingQuizId || resizingQuizId;
    if (!activeId) return base;

    // If active quizId's instance is not visible, append the first matching instance to keep *a* pill mounted
    if (!base.some((l) => l.clientId === activeId)) {
      const active = computedLanes.find((l) => l.clientId === activeId);
      if (active) {
        const out = [...base, active];
        out.sort(
          (a, b) =>
            a.lane - b.lane ||
            a.colStart - b.colStart ||
            (a.quizName ?? "").localeCompare(b.quizName ?? "") ||
            String(a.clientId).localeCompare(String(b.clientId))
        );
        return out;
      }
    }

    return base;
  }, [
    VISIBLE_END_COL,
    VISIBLE_START_COL,
    computedLanes,
    draggingQuizId,
    resizingQuizId,
  ]);

  // Lane locking rules (unchanged)
  useEffect(() => {
    if (resizingQuizId) {
      if (frozenLaneMap) setFrozenLaneMap(null);
      prevDragIdRef.current = draggingQuizId;
      return;
    }
    if (draggingQuizId && !prevDragIdRef.current && !frozenLaneMap) {
      const snap: Record<string, number> = {};
      for (const l of lanesVisibleOnly) snap[l.clientId] = l.lane;
      setFrozenLaneMap(snap);
    }
    if (!draggingQuizId && prevDragIdRef.current) {
      if (frozenLaneMap) setFrozenLaneMap(null);
    }
    prevDragIdRef.current = draggingQuizId;
  }, [draggingQuizId, frozenLaneMap, lanesVisibleOnly, resizingQuizId]);

  // Single lane lock for resizing
  useEffect(() => {
    if (resizingQuizId) {
      const target = lanesVisibleOnly.find(
        (l) => l.clientId === resizingQuizId
      );
      const lockedLane = target?.lane;
      const key = target?.clientId ?? resizingQuizId;
      if (lockedLane !== undefined && key) {
        if (!singleFreezeMap || singleFreezeMap[key] !== lockedLane) {
          setSingleFreezeMap({ [key]: lockedLane });
        }
      }
      return;
    }
    if (singleFreezeMap) {
      const t = setTimeout(() => setSingleFreezeMap(null), 100);
      return () => clearTimeout(t);
    }
  }, [resizingQuizId, lanesVisibleOnly, singleFreezeMap]);

  const visibleWithLaneLock = useMemo(() => {
    if (singleFreezeMap) {
      const out = lanesVisibleOnly.map((l) => ({
        ...l,
        lane: singleFreezeMap[l.clientId] ?? l.lane,
      }));
      out.sort(
        (a, b) =>
          a.lane - b.lane ||
          a.colStart - b.colStart ||
          (a.quizName ?? "").localeCompare(b.quizName ?? "") ||
          String(a.clientId).localeCompare(String(b.clientId))
      );
      return out;
    }
    if (frozenLaneMap) {
      const out = lanesVisibleOnly.map((l) => ({
        ...l,
        lane: frozenLaneMap[l.clientId] ?? l.lane,
      }));
      out.sort(
        (a, b) =>
          a.lane - b.lane ||
          a.colStart - b.colStart ||
          (a.quizName ?? "").localeCompare(b.quizName ?? "") ||
          String(a.clientId).localeCompare(String(b.clientId))
      );
      return out;
    }
    return lanesVisibleOnly;
  }, [lanesVisibleOnly, frozenLaneMap, singleFreezeMap]);

  // Height based on visible lanes only
  const laneCountVisible =
    visibleWithLaneLock.reduce((m, x) => Math.max(m, x.lane), -1) + 1 || 1;
  const dayMinHeightPx =
    BASE_DAY_MIN +
    (laneCountVisible > 0
      ? ROW_PX * laneCountVisible + ROW_GAP * Math.max(0, laneCountVisible - 1)
      : 0);

  /** =======
   * Render
   * ======= */
  return (
    <div className="space-y-1">
      {/* Top controls */}
      <div className="flex items-end justify-between gap-3">
        {titleComponent}
        {showGoToDate && (
          <div className="flex items-center gap-3">
            <DateField
              label="Go to date"
              value={startKey}
              onChange={onGoToDate}
            />
          </div>
        )}
      </div>

      {/* Viewport container */}
      <div
        ref={viewportRef}
        data-cal-root="1"
        className="overscroll-contain overflow-hidden border border-[var(--color-bg4)] bg-[var(--color-bg2)]/40 pb-3 px-2 rounded-lg"
      >
        {/* Track that slides horizontally using a CSS var animated by Framer */}
        <motion.div
          layoutRoot
          style={{
            width: `${(TRACK_COLS / VISIBLE_DAYS) * 100}%`,
            ...({ "--slide": BUFFER } as CSSProperties),
            transform: `translateX(calc(var(--slide) * (-100% / ${TRACK_COLS})))`,
          }}
          animate={controls}
        >
          {/* Headers */}
          <div
            className="grid gap-2 px-2 py-2 select-none"
            style={{
              gridTemplateColumns: `repeat(${TRACK_COLS}, minmax(0, 1fr))`,
            }}
          >
            {Array.from({ length: TRACK_COLS }, (_, i) =>
              addDaysToDayKey(trackStartKey, i)
            ).map((dayKey) => (
              <div
                key={dayKey}
                className="text-xs font-semibold text-[var(--color-text-secondary)]"
              >
                {formatWeekdayInTZ(dayKey, classTimezone)}{" "}
                <span className="font-normal">
                  {formatMonthDayInTZ(dayKey, classTimezone)}
                </span>
              </div>
            ))}
          </div>

          {/* Days + Pills */}
          <motion.div
            className="relative px-2 pb-3 pt-1"
            style={{ overflow: "hidden" }}
            animate={{ height: dayMinHeightPx }}
            transition={HEIGHT_SPRING}
          >
            {/* Day grid */}
            <div
              className="grid gap-2 mb-2"
              style={{
                gridTemplateColumns: `repeat(${TRACK_COLS}, minmax(0, 1fr))`,
              }}
            >
              {Array.from({ length: TRACK_COLS }, (_, i) =>
                addDaysToDayKey(trackStartKey, i)
              ).map((dayKey) => {
                const todayTZ = tzDayKey(new Date(), classTimezone);
                const isPast = dayKey < todayTZ;
                const isToday = dayKey === todayTZ;

                return readOnly ? (
                  <DayCellStatic
                    key={dayKey}
                    dateISO={dayKey}
                    isToday={isToday}
                    isPast={isPast}
                    minPx={dayMinHeightPx}
                  />
                ) : (
                  <DayDroppable
                    key={dayKey}
                    dateISO={dayKey}
                    droppableId={dayDropIdForDate?.(dayKey)}
                    isToday={isToday}
                    isPast={isPast}
                    minPx={dayMinHeightPx}
                  />
                );
              })}
            </div>

            {/* Pills overlay */}
            <div
              className="pointer-events-none absolute left-0 right-0 px-2"
              style={{ top: 8, bottom: 12 }}
            >
              <PillsGrid
                lanes={visibleWithLaneLock}
                classId={dragClassId}
                laneCountVisible={laneCountVisible}
                draggingQuizId={readOnly ? undefined : draggingQuizId}
                resizingQuizId={readOnly ? undefined : resizingQuizId}
                isSliding={isSliding || isSettling}
                suppressLayoutId={suppressLayoutId}
                isSettling={isSettling}
                draggingUid={readOnly ? undefined : draggingUid}
                onEditRequest={readOnly ? undefined : onEditRequest}
                classTimezone={classTimezone}
                readOnly={readOnly}
              />
            </div>

            {/* DnD auto-slide monitor: mount ONLY in editable mode */}
            {!readOnly && enableAutoSlideMonitor && (
              <DragAutoSlideMonitor
                onStart={(cx, activeId) => {
                  dragStartClientRef.current = cx;
                  if (activeId?.startsWith("pill-")) {
                    setDraggingUid(activeId.slice("pill-".length));
                  }
                }}
                onMoveAtX={(curX) => {
                  const vp = viewportRef.current?.getBoundingClientRect();
                  if (!vp) return;
                  const now = performance.now();
                  if (now - lastSlideTsRef.current < SLIDE_COOLDOWN_MS) return;
                  if (curX < vp.left - EDGE_HYSTERESIS_PX) {
                    lastSlideTsRef.current = now;
                    requestShift(-1);
                  } else if (curX > vp.right + EDGE_HYSTERESIS_PX) {
                    lastSlideTsRef.current = now;
                    requestShift(1);
                  }
                }}
                onEnd={() => {
                  dragStartClientRef.current = null;
                  setDraggingUid(undefined);
                }}
              />
            )}
          </motion.div>
        </motion.div>
      </div>
    </div>
  );
}
