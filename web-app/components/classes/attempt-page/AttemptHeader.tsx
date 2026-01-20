"use client";

import Select from "@/components/ui/selectors/select/Select";
import {
  pct,
  normalizeHex,
  fmtDate,
} from "@/services/class/helpers/class-helpers";
import { AttemptHeaderData } from "@/services/class/types/class-types";
import { useRouter } from "next/navigation";

export default function AttemptHeader({
  classId,
  studentId,
  attempt,
  isCanonical,
  switcher: { currentAttemptId, options } = {
    currentAttemptId: "",
    options: [],
  },
}: {
  classId: string;
  studentId: string;
  attempt: AttemptHeaderData;
  isCanonical?: boolean;
  switcher?: {
    currentAttemptId: string;
    options: Array<{ value: string; label: string }>;
  };
}) {
  const router = useRouter();

  type SnapshotMeta = {
    meta?: {
      name?: string | null;
      subject?: string | null;
      subjectColorHex?: string | null;
      topic?: string | null;
      typeColorHex?: string | null;
    };
    quizType?: string | null;
    quizVersion?: number | null;
  };

  const spec =
    typeof attempt.quizVersionSnapshot === "object" &&
    attempt.quizVersionSnapshot !== null
      ? (attempt.quizVersionSnapshot as SnapshotMeta)
      : undefined;

  const quizMeta = attempt.quiz;

  const name = quizMeta?.name ?? spec?.meta?.name ?? "Untitled Quiz";

  const subject = quizMeta?.subject ?? spec?.meta?.subject ?? "—";

  const topic = quizMeta?.topic ?? spec?.meta?.topic ?? "—";

  const gradePct = pct(attempt.score, attempt.maxScore);

  const subjectColor = normalizeHex(
    quizMeta?.subjectColorHex ?? spec?.meta?.subjectColorHex ?? undefined
  );

  const typeColor = normalizeHex(
    quizMeta?.typeColorHex ?? spec?.meta?.typeColorHex ?? undefined
  );

  const quizType = quizMeta?.quizType ?? spec?.quizType;
  const version = attempt.quizVersion ?? spec?.quizVersion;

  // Badge colors
  const stateColor =
    attempt.state === "finalized"
      ? "var(--color-success)"
      : attempt.state === "invalidated"
      ? "var(--color-error)"
      : "var(--color-warning)"; // in_progress

  return (
    <div className="flex gap-4 rounded-lg bg-[var(--color-bg3)] px-7 py-5 text-[var(--color-text-primary)]">
      {/* LEFT: Title + meta */}
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <h1 className="text-xl font-bold">{name}</h1>

        {/* Subject dot + text (text stays primary) */}
        <span className="flex items-center gap-2 leading-none">
          <span
            className="h-3.5 w-3.5 shrink-0 rounded-full"
            style={{ background: subjectColor ?? "var(--color-primary)" }}
            title={subject}
          />
          <span className="font-semibold" title={subject}>
            {subject}
          </span>
        </span>

        {/* Topic */}
        <div className="text-md">{topic}</div>

        {/* Type pill */}
        <span
          className="inline-flex w-fit items-center rounded-full px-2.5 py-1.5 text-xs font-semibold"
          style={{
            color: "var(--color-text-primary)",
            background: typeColor ?? "var(--color-bg4)",
          }}
          title={quizType ?? undefined}
        >
          {quizType ?? "Unknown type"}
        </span>

        {/* Version info */}
        <div className="text-xs text-[var(--color-text-secondary)]">
          Version {version ?? "—"}
        </div>
      </div>

      {/* RIGHT: Switcher + badges + finished date */}
      <div className="ml-auto flex w-[360px] flex-col items-end gap-2">
        {/* View attempt selector */}
        {options?.length ? (
          <div className="w-full">
            <Select
              id="attempt-picker"
              value={currentAttemptId}
              onChange={(val) => {
                router.push(
                  `/classes/${encodeURIComponent(
                    classId
                  )}/students/${encodeURIComponent(
                    studentId
                  )}/attempt/${encodeURIComponent(val)}`
                );
              }}
              options={options}
              placeholder="Select attempt…"
              colorMode="never"
            />
          </div>
        ) : null}

        {/* Finished date (if exists) */}
        <div className="text-xs text-[var(--color-text-secondary)]">
          Finished: {fmtDate(attempt.finishedAt)}
        </div>

        {/* Badges row */}
        <div className="flex flex-wrap items-center justify-end gap-2">
          {/* Status */}
          <span
            className="inline-flex items-center rounded-full px-2.5 py-1.5 text-xs font-semibold"
            style={{
              background: stateColor,
              color: "var(--color-text-primary)",
            }}
            title="Attempt status"
          >
            {attempt.state.replace("_", " ")}
          </span>

          {/* Best Attempt */}
          {isCanonical && (
            <span
              className="inline-flex items-center rounded-full px-2.5 py-1.5 text-xs font-semibold"
              style={{
                background: "var(--color-primary)",
                color: "var(--color-text-primary)",
              }}
              title="This is the canonical (best) attempt"
            >
              Best Attempt
            </span>
          )}
        </div>

        {/* Score summary */}
        <div className="flex items-center gap-2">
          <div className="text-sm text-[var(--color-text-secondary)]">
            Score:
          </div>
          <div className="text-sm font-semibold">
            {attempt.score ?? 0}/{attempt.maxScore ?? 0} ({gradePct}%)
          </div>
        </div>
      </div>
    </div>
  );
}
