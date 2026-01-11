"use client";

import { createPortal } from "react-dom";
import {
  dayKeyFromDateInTZ,
  formatTimeInTZ,
} from "@/services/class/helpers/scheduling/scheduling-helpers";
import { LaneItem } from "@/services/class/helpers/scheduling/scheduling-helpers";

export default function ScheduleItemHoverCard({
  open,
  item,
  classTimezone,
  position,
}: {
  open: boolean;
  item: LaneItem;
  classTimezone: string;
  position: { top: number; left: number } | null;
}) {
  if (!open || typeof document === "undefined" || !position) return null;

  const left = Math.min(Math.max(8, position.left), window.innerWidth - 320);
  const top = Math.min(
    Math.max(8, position.top),
    window.innerHeight - 260
  );

  const start = new Date(item.startDate);
  const end = new Date(item.endDate);
  const startDate = dayKeyFromDateInTZ(start, classTimezone);
  const endDate = dayKeyFromDateInTZ(end, classTimezone);
  const startTime = formatTimeInTZ(start, classTimezone);
  const endTime = formatTimeInTZ(end, classTimezone);
  const maxScore =
    typeof item.contribution === "number" ? item.contribution : 100;
  const attemptsAllowed =
    typeof item.attemptsAllowed === "number" ? item.attemptsAllowed : 1;
  const showAnswers = item.showAnswersAfterAttempt ? "Yes" : "No";
  const quizVersion =
    typeof (item as any).quizVersion === "number"
      ? (item as any).quizVersion
      : "—";

  return createPortal(
    <div
      className={[
        "fixed w-80 rounded-lg border",
        "border-[var(--color-bg4)] bg-[var(--color-bg1)]/90 shadow-lg backdrop-blur-sm",
        "p-3 text-xs text-[var(--color-text-primary)]",
        "pointer-events-none z-[100]",
      ].join(" ")}
      style={{ top, left }}
    >
      <div className="flex items-start gap-2">
        <span
          className="mt-1 h-2.5 w-2.5 rounded-full shrink-0"
          style={{
            background: item.subjectColor || "var(--color-primary)",
          }}
        />
        <div className="min-w-0">
          <div className="text-sm font-semibold">
            {item.quizName || "Quiz details"}
          </div>
          <div className="text-[var(--color-text-secondary)] truncate">
            {item.subject || "—"}{item.topic ? ` • ${item.topic}` : ""}
          </div>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="rounded-md bg-[var(--color-bg2)] px-2 py-1.5">
          <div className="text-[var(--color-text-secondary)]">Start</div>
          <div className="font-medium">{startDate}</div>
          <div className="text-[var(--color-text-secondary)]">{startTime}</div>
        </div>
        <div className="rounded-md bg-[var(--color-bg2)] px-2 py-1.5">
          <div className="text-[var(--color-text-secondary)]">End</div>
          <div className="font-medium">{endDate}</div>
          <div className="text-[var(--color-text-secondary)]">{endTime}</div>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="rounded-md bg-[var(--color-bg2)] px-2 py-1.5">
          <div className="text-[var(--color-text-secondary)]">Max score</div>
          <div className="font-medium">{maxScore}</div>
        </div>
        <div className="rounded-md bg-[var(--color-bg2)] px-2 py-1.5">
          <div className="text-[var(--color-text-secondary)]">Version</div>
          <div className="font-medium">{quizVersion}</div>
        </div>
        <div className="rounded-md bg-[var(--color-bg2)] px-2 py-1.5">
          <div className="text-[var(--color-text-secondary)]">Answers</div>
          <div className="font-medium">{showAnswers}</div>
        </div>
        <div className="rounded-md bg-[var(--color-bg2)] px-2 py-1.5">
          <div className="text-[var(--color-text-secondary)]">Attempts</div>
          <div className="font-medium">{attemptsAllowed}</div>
        </div>
      </div>

      <div className="mt-3 text-[var(--color-text-secondary)]">
        right click to edit details
      </div>
    </div>,
    document.body
  );
}
