"use client";

/**
 * Used for changing question type in basic quizzes
 */

type Tab = { value: "mc" | "open" | "context"; label: string };

export default function TypeTabs({
  value,
  onChange,
  options,
}: {
  value: "mc" | "open" | "context";
  onChange: (v: "mc" | "open" | "context") => void;
  options: Tab[];
}) {
  return (
    <div className="flex flex-wrap gap-3">
      {options.map((t) => (
        <button
          key={t.value}
          type="button"
          onClick={() => onChange(t.value)}
          className={`rounded-md px-4 py-2 text-sm font-medium ${
            value === t.value
              ? "bg-[var(--color-primary)] text-white"
              : "bg-[var(--color-bg3)] text-[var(--color-text-primary)] hover:opacity-90"
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
