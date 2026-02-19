"use client";

import type { ReactNode } from "react";

export default function SchedulingControlsBar({
  left,
  right,
  className = "",
}: {
  left: ReactNode;
  right?: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={[
        "rounded-lg border border-[var(--color-bg4)] bg-[var(--color-bg2)] p-4",
        className,
      ].join(" ")}
    >
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex min-w-0 flex-1 flex-wrap items-end gap-3">
          {left}
        </div>
        {right ? (
          <div className="ml-auto flex items-center gap-2">{right}</div>
        ) : null}
      </div>
    </section>
  );
}
