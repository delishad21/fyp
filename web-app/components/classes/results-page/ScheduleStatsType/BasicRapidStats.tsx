"use client";

import { clampPct } from "@/services/class/helpers/class-helpers";
import { StatBar } from "./StatBar";

export type BasicRapidStatsProps = {
  breakdown: {
    attemptsCount?: number;
    overallAvgScorePct?: number;
    overallAvgScoreRaw?: { meanScore?: number; meanMax?: number };
    items: Array<
      | {
          type: "mc";
          itemId: string;
          text: string;
          totalAnswers?: number;
          perQuestionAvgPct?: number;
          correctOptionIds?: string[];
          correctOptions?: { id: string; text: string }[];
          options: {
            id: string;
            text: string;
            count?: number;
            percentageSelectedPct?: number;
          }[];
        }
      | {
          type: "open";
          itemId: string;
          text: string;
          totalAnswers?: number;
          perQuestionAvgPct?: number; // may be present
          threshold?: number;
          acceptedAnswers?: { text: string; caseSensitive: boolean }[];
          answers: { value: string; count?: number; pctPct?: number }[];
        }
      | {
          type: "context";
          itemId: string;
          text: string;
          totalAnswers?: number;
          perQuestionAvgPct?: number | null;
          options?: unknown[];
        }
    >;
  };
};

export default function BasicRapidStats({ breakdown }: BasicRapidStatsProps) {
  const overallPct = clampPct(breakdown.overallAvgScorePct);

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      {/* Overall */}
      <div className="rounded-lg border border-[var(--color-bg4)] bg-[var(--color-bg3)] p-4">
        <div className="mb-2 text-sm font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">
          Overall Average
        </div>
        <StatBar
          pct={overallPct}
          rightText={
            breakdown.overallAvgScoreRaw?.meanScore != null &&
            breakdown.overallAvgScoreRaw?.meanMax != null
              ? `${Math.round(
                  breakdown.overallAvgScoreRaw.meanScore
                )}/${Math.round(breakdown.overallAvgScoreRaw.meanMax)}`
              : undefined
          }
        />
      </div>

      {/* Per-question */}
      {breakdown.items.map((it, idx) => {
        const kind = it.type;
        const correctIds: string[] = Array.isArray(it.correctOptionIds)
          ? it.correctOptionIds
          : [];

        return (
          <div
            key={it.itemId || `${kind}-${idx}`}
            className="rounded-xl border border-[var(--color-bg4)] bg-[var(--color-bg3)] p-5"
          >
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="text-sm font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">
                {kind} • Q{idx + 1}
              </div>
              <div className="text-xs text-[var(--color-text-secondary)]">
                Answers: {it.totalAnswers ?? 0}
              </div>
            </div>

            <div className="text-[var(--color-text-primary)] whitespace-pre-wrap">
              {it.text}
            </div>

            {/* A) Multiple choice options */}
            {kind === "mc" && Array.isArray(it.options) && (
              <div className="mt-4 space-y-2">
                {it.perQuestionAvgPct != null && (
                  <StatBar pct={it.perQuestionAvgPct} rightText="Avg score" />
                )}

                <ul className="mt-2 space-y-1.5">
                  {it.options.map((opt) => {
                    const isCorrect = correctIds.includes(opt.id);
                    return (
                      <li
                        key={opt.id}
                        className={[
                          "rounded-md border p-2.5",
                          isCorrect
                            ? "border-[var(--color-success)] bg-[var(--color-success)]/10"
                            : "border-[var(--color-bg4)] bg-[var(--color-bg2)]",
                        ].join(" ")}
                      >
                        <div className="mb-1 flex items-center gap-2">
                          <div className="text-sm font-medium">{opt.text}</div>
                          {isCorrect && (
                            <span className="rounded-sm bg-[var(--color-success)] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[var(--color-text-primary)]">
                              Correct
                            </span>
                          )}
                        </div>
                        <StatBar
                          pct={opt.percentageSelectedPct ?? 0}
                          rightText={`${opt.count ?? 0} selected`}
                        />
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {/* B) Open answers */}
            {kind === "open" && Array.isArray(it.answers) && (
              <div className="mt-4 space-y-3">
                {typeof it.threshold === "number" && (
                  <div className="text-xs text-[var(--color-text-secondary)]">
                    Threshold: {Math.round((it.threshold || 0) * 100)}%
                  </div>
                )}
                {it.perQuestionAvgPct != null && (
                  <StatBar pct={it.perQuestionAvgPct} rightText="Avg score" />
                )}

                {/* Popular student submissions */}
                <ul className="mt-1 space-y-1.5">
                  {it.answers.map((ans, i) => (
                    <li
                      key={`${ans.value}-${i}`}
                      className="rounded-md border border-[var(--color-bg4)] bg-[var(--color-bg2)] p-2.5"
                    >
                      <div className="mb-1 text-sm">
                        <span className="font-medium">{ans.value}</span>
                      </div>
                      <StatBar
                        pct={ans.pctPct ?? 0}
                        rightText={`${ans.count ?? 0} mentions`}
                      />
                    </li>
                  ))}
                </ul>
                {it.answers.length === 0 && (
                  <div className="text-sm text-[var(--color-text-secondary)]">
                    No answers met the threshold.
                  </div>
                )}

                {/* Accepted/Correct answers from quiz */}
                {Array.isArray(it.acceptedAnswers) &&
                  it.acceptedAnswers.length > 0 && (
                    <div className="pt-3">
                      <div className="mb-1 text-xs font-medium text-[var(--color-text-secondary)]">
                        Accepted answers
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {it.acceptedAnswers.map((a, i) => (
                          <span
                            key={`${a.text}-${i}`}
                            className="rounded-full border border-[var(--color-success)] bg-[var(--color-success)]/10 px-2 py-0.5 text-xs font-medium"
                          >
                            {a.text}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
              </div>
            )}

            {/* C) Context-only blocks */}
            {kind === "context" && (
              <div className="mt-3 text-sm text-[var(--color-text-secondary)]">
                Context passage (no direct scoring).
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
