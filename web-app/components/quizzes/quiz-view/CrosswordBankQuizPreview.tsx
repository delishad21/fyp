"use client";

import type { CrosswordBankInitial } from "@/services/quiz/types/quizTypes";

export default function CrosswordBankQuizPreview({
  data,
}: {
  data: CrosswordBankInitial;
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-[var(--color-bg4)] bg-[var(--color-bg2)] p-6">
        <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
          Crossword Bank Configuration
        </h2>
        <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
          Each schedule will generate a crossword using{" "}
          <span className="font-semibold text-[var(--color-text-primary)]">
            {data.wordsPerQuiz}
          </span>{" "}
          random entries from this bank.
        </p>

        <div className="mt-3 flex flex-wrap gap-2">
          <Badge label={`Bank size: ${data.entriesBank.length}`} />
          <Badge label={`Words per quiz: ${data.wordsPerQuiz}`} />
          {data.totalTimeLimit ? (
            <Badge label={`Time limit: ${Math.round(data.totalTimeLimit)}s`} />
          ) : (
            <Badge label="No time limit" />
          )}
        </div>
      </div>

      <div className="rounded-xl border border-[var(--color-bg4)] bg-[var(--color-bg2)] p-4">
        <div className="text-sm font-semibold text-[var(--color-text-primary)] mb-3">
          Word / Clue Bank
        </div>
        <div className="space-y-2">
          {data.entriesBank.map((entry, idx) => (
            <div
              key={entry.id}
              className="grid gap-2 rounded-md border border-[var(--color-bg4)] bg-[var(--color-bg3)] p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]"
            >
              <div className="text-sm font-semibold text-[var(--color-text-primary)]">
                {idx + 1}. {entry.answer}
              </div>
              <div className="text-sm text-[var(--color-text-secondary)]">
                {entry.clue}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Badge({ label }: { label: string }) {
  return (
    <span className="rounded-full border border-[var(--color-bg4)] bg-[var(--color-bg3)] px-3 py-1 text-xs font-medium text-[var(--color-text-primary)]">
      {label}
    </span>
  );
}
