"use client";

/**
 * MultiSelect Component
 *
 * Purpose:
 *   - Provides a searchable, multi-select dropdown with checkboxes.
 *   - Syncs local state immediately and defers parent updates via React transitions.
 *
 * Props:
 *   @param {string} label
 *     - Label text used in the trigger and search placeholder.
 *   @param {{ value: string; label: string; colorHex?: string }[]} options
 *     - List of selectable options with display labels and optional color tags.
 *   @param {string[]} value
 *     - Current selected values controlled by the parent.
 *   @param {(next: string[]) => void} onChange
 *     - Callback fired when selection changes (receives new array).
 *   @param {string} [placeholder="Select…"]
 *     - Placeholder when no value is selected.
 *   @param {boolean} [loading=false]
 *     - Shows a spinner in the trigger when true.
 *   @param {boolean} [searchable=true]
 *     - Toggles the search box in the popover.
 *   @param {string} [className]
 *     - Optional extra class names for the root element.
 *
 * Behavior / Logic:
 *   - Maintains internal `open` state for dropdown visibility.
 *   - Uses `useRef` + `flushSync` to immediately update checkbox UI on toggle.
 *   - Keeps a `valueRef` to avoid stale reads on rapid clicks.
 *   - Filters options in-memory when the search term changes.
 *   - Closes on outside click (`mousedown` listener).
 *   - Provides "Clear all" and "Close" footer actions.
 *
 * UI:
 *   - <MultiSelectTrigger> displays selected values or placeholder.
 *   - <MultiSelectPopover> slides down with framer-motion.
 *   - <MultiSelectSearch> (optional) filters visible options.
 *   - <MultiSelectList> shows options with checkboxes.
 *   - Footer with "Clear all" and "Close" buttons.
 *
 * Animations:
 *   - Uses framer-motion for enter/exit scaling and opacity transitions.
 *
 * Notes:
 *   - Used mainly for selecting filters for table (QuizTable)
 *
 */

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
  startTransition,
} from "react";
import { flushSync } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { MultiSelectList } from "./components/MultiSelectList";
import { MultiSelectPopover } from "./components/MultiSelectPopover";
import { MultiSelectSearch } from "./components/MultiSelectSearch";
import { MultiSelectTrigger } from "./components/MultiSelectTrigger";

export default function MultiSelect({
  label,
  options,
  value,
  onChange,
  placeholder = "Select…",
  loading = false,
  searchable = true,
  className,
}: {
  label: string;
  options: { value: string; label: string; colorHex?: string }[];
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  loading?: boolean;
  searchable?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");

  const rootRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      const el = rootRef.current;
      if (!el) return;
      if (!el.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  // Keep a ref of the latest parent value to avoid stale reads
  const valueRef = useRef<string[]>(value);
  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  // Local (optimistic) selection so the checkbox flips immediately
  const [localValue, setLocalValue] = useState<string[]>(value);
  // Keep local selection in sync when parent changes
  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  // filtered options
  const filtered = useMemo(() => {
    const q = term.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) =>
        o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q)
    );
  }, [options, term]);

  // Toggle selection
  const toggle = useCallback(
    (v: string) => {
      // compute from the freshest source
      const curr = new Set(valueRef.current);
      if (curr.has(v)) curr.delete(v);
      else curr.add(v);
      const next = Array.from(curr);

      // Update local state immediately, so it feels instant
      flushSync(() => setLocalValue(next));

      // keep the ref current so very-fast double clicks are consistent
      valueRef.current = next;

      // Tell the parent in a transition so any heavy updates don’t block input
      startTransition(() => {
        onChange(next);
      });
    },
    [onChange]
  );

  return (
    <div ref={rootRef} className={`relative ${className ?? ""}`}>
      <MultiSelectTrigger
        open={open}
        loading={loading}
        label={label}
        options={options}
        value={localValue}
        placeholder={placeholder}
        onToggle={() => setOpen((o) => !o)}
      />

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="ms-popover"
            initial={{ opacity: 0, scaleY: 0.6 }}
            animate={{ opacity: 1, scaleY: 1 }}
            exit={{ opacity: 0, scaleY: 0.6 }}
            transition={{ duration: 0.2, ease: [0.2, 0.8, 0.2, 1] }}
            style={{ originY: 0 }}
            className="absolute left-0 right-0 z-50"
          >
            <MultiSelectPopover>
              {searchable && (
                <MultiSelectSearch
                  term={term}
                  onChange={setTerm}
                  placeholder={`Search ${label.toLowerCase()}…`}
                />
              )}

              <MultiSelectList
                options={filtered}
                value={localValue}
                onToggle={toggle}
              />

              <div className="mt-2 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => {
                    flushSync(() => setLocalValue([])); // instant clear
                    valueRef.current = [];
                    startTransition(() => onChange([]));
                  }}
                  className="rounded-lg px-2 py-1 text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-bg2)]"
                >
                  Clear all
                </button>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-lg px-3 py-1 text-xs text-[var(--color-text-primary)] hover:bg-[var(--color-bg2)]"
                >
                  Close
                </button>
              </div>
            </MultiSelectPopover>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
