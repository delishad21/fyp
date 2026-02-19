"use client";

import { Icon } from "@iconify/react";

export default function SchedulingHelpDropdown({
  title = "How to use",
  tips,
}: {
  title?: string;
  tips: string[];
}) {
  return (
    <details className="group relative">
      <summary className="list-none">
        <span className="min-h-12 inline-flex cursor-pointer items-center gap-2 rounded-sm border border-[var(--color-bg4)] px-3 py-1.5 text-xs font-medium text-[var(--color-text-primary)] transition hover:bg-[var(--color-bg3)]">
          <Icon
            icon="mingcute:information-line"
            className="h-5 w-5 text-[var(--color-icon)]"
          />
          {title}
          <Icon
            icon="mingcute:down-line"
            className="h-5 w-5 text-[var(--color-icon)] transition group-open:rotate-180"
          />
        </span>
      </summary>
      <div className="absolute right-0 z-20 mt-2 w-[min(92vw,32rem)] rounded-lg border border-[var(--color-bg4)] bg-[var(--color-bg1)] p-3 shadow-lg">
        <ol className="space-y-1 text-xs leading-5 text-[var(--color-text-secondary)]">
          {tips.map((tip, index) => (
            <li key={`${index}-${tip}`}>
              {index + 1}. {tip}
            </li>
          ))}
        </ol>
      </div>
    </details>
  );
}
