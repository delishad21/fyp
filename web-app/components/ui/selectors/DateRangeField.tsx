"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  DayFlag,
  DayPicker,
  UI,
  type DateRange as RDDateRange,
  type CalendarMonth,
  useNavigation,
} from "react-day-picker";
import { Icon } from "@iconify/react";
import { AnimatePresence, motion } from "framer-motion";
import { FilterTriggerStyles } from "../../table/Filters";

// ── helpers
function toYMD(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function parseYMD(s?: string) {
  if (!s) return undefined;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? undefined : d;
}
function fmtShort(s?: string) {
  if (!s) return "";
  const d = new Date(s);
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function CustomMonthCaption({
  calendarMonth,
  ...divProps
}: {
  calendarMonth: CalendarMonth;
  displayIndex: number;
} & React.HTMLAttributes<HTMLDivElement>) {
  const { goToMonth, nextMonth, previousMonth } = useNavigation();
  return (
    <div {...divProps} className="flex items-center justify-between px-2 pb-2">
      <button
        type="button"
        onClick={() => previousMonth && goToMonth(previousMonth)}
        disabled={!previousMonth}
        className="rounded p-2 hover:bg-[var(--color-bg2)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] disabled:opacity-40"
      >
        <Icon
          icon="mingcute:left-line"
          className="h-5 w-5 text-[var(--color-icon)]"
        />
      </button>

      <span className="text-sm font-medium text-[var(--color-text-primary)]">
        {calendarMonth.date.toLocaleDateString("en-US", {
          month: "long",
          year: "numeric",
        })}
      </span>

      <button
        type="button"
        onClick={() => nextMonth && goToMonth(nextMonth)}
        disabled={!nextMonth}
        className="rounded p-2 hover:bg-[var(--color-bg2)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] disabled:opacity-40"
      >
        <Icon
          icon="mingcute:right-line"
          className="h-5 w-5 text-[var(--color-icon)]"
        />
      </button>
    </div>
  );
}

export default function DateRangeField({
  label,
  start,
  end,
  onChange,
  loading = false,
  className,
}: {
  label: string;
  start?: string; // 'YYYY-MM-DD'
  end?: string; // 'YYYY-MM-DD'
  onChange: (patch: { start?: string; end?: string }) => void;
  loading?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  // Controlled -> local draft for the calendar UI while open
  const controlled: RDDateRange | undefined = useMemo(() => {
    const from = parseYMD(start);
    const to = parseYMD(end);
    if (!from && !to) return undefined;
    return { from, to };
  }, [start, end]);

  const [draft, setDraft] = useState<RDDateRange | undefined>(controlled);

  // Keep local draft in sync when closed; also reflect external reset immediately.
  useEffect(() => {
    if (!open) setDraft(controlled);
  }, [controlled, open]);
  useEffect(() => {
    // If parent resets (both undefined), reflect instantly even if open
    if (!start && !end) setDraft(undefined);
  }, [start, end]);

  // Close on outside/Esc
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      const el = rootRef.current;
      if (!el) return;
      if (!el.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  // Summary text
  const summary =
    start && end
      ? `${fmtShort(start)} – ${fmtShort(end)}`
      : start
      ? `From ${fmtShort(start)}`
      : end
      ? `Until ${fmtShort(end)}`
      : "Select dates…";

  // Tailwind classes for DayPicker
  const classNames = {
    [UI.Weekday]:
      "px-1 pb-2 text-sm font-light text-[var(--color-text-secondary)]",
    [UI.DayButton]:
      "grid h-9 w-9 place-items-center rounded-full text-sm text-[var(--color-text-primary)] " +
      "hover:bg-[var(--color-bg2)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]",
    [DayFlag.today]:
      "relative after:absolute after:right-0.5 after:top-0.5 after:h-1.5 after:w-1.5 after:rounded-full after:bg-[var(--color-primary)]",
  } as const;

  // Range coloring
  const modifiersClassNames = {
    range_middle: "bg-[var(--color-primary)] text-white rounded-full",
    range_start: "bg-[var(--color-primary)] text-white rounded-full",
    range_end: "bg-[var(--color-primary)] text-white rounded-full",
    selected: "bg-[var(--color-primary)] text-white rounded-full",
  } as const;

  // Commit immediately on any selection (partial or full)
  const handleSelect = (next: RDDateRange | undefined) => {
    setDraft(next);
    if (!next || (!next.from && !next.to)) {
      onChange({ start: undefined, end: undefined });
      return;
    }
    onChange({
      start: next.from ? toYMD(next.from) : undefined,
      end: next.to ? toYMD(next.to) : undefined,
    });
  };

  const handleClear = () => {
    setDraft(undefined);
    onChange({ start: undefined, end: undefined });
  };

  return (
    <div ref={rootRef} className={`relative ${className ?? ""}`}>
      <label className="mb-1 block text-xs text-[var(--color-text-secondary)]">
        {label}
      </label>

      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`flex h-10 min-w-[250px] ${FilterTriggerStyles}`}
      >
        <span
          className={start || end ? "" : "text-[var(--color-text-secondary)]"}
        >
          {summary}
        </span>
        <span className="flex items-center gap-2">
          {loading && (
            <span className="inline-flex h-4 w-4 animate-spin rounded-full border-2 border-[var(--color-primary)] border-t-transparent" />
          )}
          <Icon
            icon={open ? "mingcute:up-line" : "mingcute:down-line"}
            className="text-[var(--color-icon)]"
            width={18}
            height={18}
          />
        </span>
      </button>

      {/* Animated popover */}
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="date-popover"
            initial={{ opacity: 0, scaleY: 0.6 }}
            animate={{ opacity: 1, scaleY: 1 }}
            exit={{ opacity: 0, scaleY: 0.6 }}
            transition={{ duration: 0.2, ease: [0.2, 0.8, 0.2, 1] }}
            style={{ originY: 0 }}
            className="absolute z-10 mt-2 w-max rounded-xl border border-[var(--color-bg3)] bg-[var(--color-bg1)] p-3 shadow-lg"
          >
            <DayPicker
              mode="range"
              selected={draft}
              onSelect={handleSelect}
              numberOfMonths={1}
              defaultMonth={draft?.from ?? new Date()}
              classNames={classNames}
              modifiersClassNames={modifiersClassNames}
              components={{
                MonthCaption: CustomMonthCaption,
                Nav: () => <></>, // disables the built-in nav
              }}
            />

            {/* Footer actions: Clear / Close only (no Apply/Cancel) */}
            <div className="mt-3 flex items-center justify-between">
              <button
                type="button"
                onClick={handleClear}
                className="rounded-lg px-2 py-1 text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-bg2)]"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg px-3 py-1 text-xs text-[var(--color-text-primary)] hover:bg-[var(--color-bg2)]"
              >
                Close
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
