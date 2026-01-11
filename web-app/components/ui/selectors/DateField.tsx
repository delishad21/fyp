"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  DayFlag,
  DayPicker,
  UI,
  useNavigation,
  type CalendarMonth,
} from "react-day-picker";
import { Icon } from "@iconify/react";
import { AnimatePresence, motion } from "framer-motion";

// ── helpers
function toYMD(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function parseYMD(s?: string) {
  if (!s) return undefined;
  const [y, m, day] = s.split("-").map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(day))
    return undefined;
  const d = new Date(y, m - 1, day, 0, 0, 0, 0);
  return Number.isNaN(d.getTime()) ? undefined : d;
}
function fmtShort(s?: string) {
  if (!s) return "";
  const d = parseYMD(s);
  if (!d) return s;
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

export default function DateField({
  label,
  value, // 'YYYY-MM-DD'
  onChange,
  loading = false,
  className,
  disabled, // optional: disable input & picker
  fromDate, // optional: min selectable date
  toDate, // optional: max selectable date
  error,
}: {
  label: string;
  value?: string;
  onChange: (next?: string) => void;
  loading?: boolean;
  className?: string;
  disabled?: boolean;
  fromDate?: string; // 'YYYY-MM-DD'
  toDate?: string; // 'YYYY-MM-DD'
  error?: string | string[]; // NEW
}) {
  const [open, setOpen] = useState(false);
  const errors = Array.isArray(error) ? error : error ? [error] : [];

  // Controlled -> local draft while open
  const controlledDate: Date | undefined = useMemo(
    () => parseYMD(value),
    [value]
  );
  const [draft, setDraft] = useState<Date | undefined>(controlledDate);

  // Sync draft when closed or when parent resets
  useEffect(() => {
    if (!open) setDraft(controlledDate);
  }, [controlledDate, open]);
  useEffect(() => {
    if (!value) setDraft(undefined);
  }, [value]);

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

  const summary = value ? fmtShort(value) : "Select a date…";

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

  const modifiersClassNames = {
    selected: "bg-[var(--color-primary)] text-white rounded-full",
  } as const;

  const handleSelect = (next?: Date) => {
    setDraft(next);
    onChange(next ? toYMD(next) : undefined); // commit immediately
  };

  const handleClear = () => {
    setDraft(undefined);
    onChange(undefined);
  };

  const minDate = parseYMD(fromDate);
  const maxDate = parseYMD(toDate);

  const triggerBase =
    "flex h-11 min-w-[220px] items-center justify-between rounded-md px-3 " +
    "border border-[var(--color-bg4)] bg-[var(--color-bg2)] " +
    "text-[var(--color-text-primary)] text-sm leading-none " +
    "hover:bg-[var(--color-bg2)] focus:outline-none focus:ring-2";
  const triggerBorder = errors.length
    ? "border-[var(--color-error)] focus:ring-[var(--color-error)]"
    : "border-[var(--color-bg4)] focus:ring-[var(--color-primary)]";

  const triggerDisabled = disabled ? "opacity-60 cursor-not-allowed" : "";

  const describedBy = errors.length
    ? `${label.replace(/\s+/g, "-")}-err`
    : undefined;

  return (
    <div ref={rootRef} className={`relative grid gap-1.5 ${className ?? ""}`}>
      {label && (
        <label className="text-xs text-[var(--color-text-secondary)]">
          {label}
        </label>
      )}

      {/* Trigger */}
      <button
        type="button"
        onClick={() => !disabled && setOpen((o) => !o)}
        disabled={disabled}
        className={[triggerBase, triggerBorder, triggerDisabled].join(" ")}
      >
        <span className={value ? "" : "text-[var(--color-text-secondary)]"}>
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

      {/* Error (single or list) */}
      {errors.length === 1 && (
        <p id={describedBy} className="text-xs text-[var(--color-error)]">
          {errors[0]}
        </p>
      )}
      {errors.length > 1 && (
        <ul
          id={describedBy}
          className="list-disc pl-5 text-xs text-[var(--color-error)] space-y-0.5"
        >
          {errors.map((msg, i) => (
            <li key={i}>{msg}</li>
          ))}
        </ul>
      )}

      {/* Popover */}
      <AnimatePresence initial={false}>
        {open && !disabled && (
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
              mode="single"
              selected={draft}
              onSelect={handleSelect}
              numberOfMonths={1}
              defaultMonth={draft ?? new Date()}
              classNames={classNames}
              modifiersClassNames={modifiersClassNames}
              fromDate={minDate}
              toDate={maxDate}
              components={{
                MonthCaption: CustomMonthCaption,
                Nav: () => <></>, // disable built-in nav; we use CustomMonthCaption buttons
              }}
            />

            {/* Footer actions */}
            <div className="mt-3 flex items-center justify-between">
              <button
                type="button"
                onClick={handleClear}
                className="rounded-lg px-2 py-1 text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-bg2)]"
              >
                Clear
              </button>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => handleSelect(new Date())}
                  className="rounded-lg px-2 py-1 text-xs text-[var(--color-text-primary)] hover:bg-[var(--color-bg2)]"
                >
                  Today
                </button>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-lg px-3 py-1 text-xs text-[var(--color-text-primary)] hover:bg-[var(--color-bg2)]"
                >
                  Close
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
