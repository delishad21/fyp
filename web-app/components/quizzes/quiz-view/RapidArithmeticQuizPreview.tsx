"use client";

import type { RapidArithmeticInitial } from "@/services/quiz/types/quizTypes";

export default function RapidArithmeticQuizPreview({
  data,
}: {
  data: RapidArithmeticInitial;
}) {
  const opLabel: Record<string, string> = {
    "+": "Addition",
    "-": "Subtraction",
    "*": "Multiplication",
    "/": "Division",
  };

  return (
    <div className="rounded-xl border border-[var(--color-bg4)] bg-[var(--color-bg2)] p-6 space-y-4">
      <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
        Rapid Arithmetic Configuration
      </h2>

      <p className="text-sm text-[var(--color-text-secondary)]">
        Each schedule generates a randomized MC-only arithmetic quiz from these
        operation-specific settings.
      </p>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Stat label="Questions per quiz" value={String(data.questionCount)} />
        <Stat
          label="Time per question"
          value={`${Math.round(data.timePerQuestion)}s`}
        />
        <Stat
          label="Choices per question"
          value={String(data.choicesPerQuestion)}
        />
      </div>

      <div>
        <div className="text-sm font-medium text-[var(--color-text-primary)] mb-2">
          Enabled operations
        </div>
        <div className="flex flex-wrap gap-2">
          {data.operators.map((op) => (
            <span
              key={op}
              className="rounded-full border border-[var(--color-bg4)] bg-[var(--color-bg3)] px-3 py-1 text-xs font-medium text-[var(--color-text-primary)]"
            >
              {opLabel[op] ?? op}
            </span>
          ))}
        </div>
      </div>

      <div className="grid gap-3 xl:grid-cols-2">
        <OperationCard
          title="Addition"
          enabled={data.operators.includes("+")}
          lines={[
            `Operands: ${data.operationSettings.addition.operandMin} to ${data.operationSettings.addition.operandMax}`,
            `Answers: ${data.operationSettings.addition.answerMin} to ${data.operationSettings.addition.answerMax}`,
            `Allow negative: ${data.operationSettings.addition.allowNegative ? "Yes" : "No"}`,
          ]}
        />

        <OperationCard
          title="Subtraction"
          enabled={data.operators.includes("-")}
          lines={[
            `Operands: ${data.operationSettings.subtraction.operandMin} to ${data.operationSettings.subtraction.operandMax}`,
            `Answers: ${data.operationSettings.subtraction.answerMin} to ${data.operationSettings.subtraction.answerMax}`,
            `Allow negative: ${data.operationSettings.subtraction.allowNegative ? "Yes" : "No"}`,
          ]}
        />

        <OperationCard
          title="Multiplication"
          enabled={data.operators.includes("*")}
          lines={[
            `Mode: ${data.operationSettings.multiplication.mode === "times-table" ? "Times table" : "Range"}`,
            data.operationSettings.multiplication.mode === "times-table"
              ? `Tables: ${data.operationSettings.multiplication.tables.join(", ")}`
              : `Operands: ${data.operationSettings.multiplication.operandMin} to ${data.operationSettings.multiplication.operandMax}`,
            data.operationSettings.multiplication.mode === "times-table"
              ? `Multiplier: ${data.operationSettings.multiplication.multiplierMin} to ${data.operationSettings.multiplication.multiplierMax}`
              : "",
            `Answers: ${data.operationSettings.multiplication.answerMin} to ${data.operationSettings.multiplication.answerMax}`,
          ].filter(Boolean)}
        />

        <OperationCard
          title="Division"
          enabled={data.operators.includes("/")}
          lines={[
            `Divisor: ${data.operationSettings.division.divisorMin} to ${data.operationSettings.division.divisorMax}`,
            `Quotient: ${data.operationSettings.division.quotientMin} to ${data.operationSettings.division.quotientMax}`,
            `Answers: ${data.operationSettings.division.answerMin} to ${data.operationSettings.division.answerMax}`,
            `Allow negative: ${data.operationSettings.division.allowNegative ? "Yes" : "No"}`,
          ]}
        />
      </div>
    </div>
  );
}

function OperationCard({
  title,
  enabled,
  lines,
}: {
  title: string;
  enabled: boolean;
  lines: string[];
}) {
  return (
    <div
      className={`rounded-md border border-[var(--color-bg4)] bg-[var(--color-bg3)] p-3 ${
        enabled ? "" : "opacity-60"
      }`}
    >
      <div className="mb-2 flex items-center justify-between">
        <div className="text-sm font-semibold text-[var(--color-text-primary)]">
          {title}
        </div>
        {!enabled && (
          <span className="text-xs text-[var(--color-text-secondary)]">
            Disabled
          </span>
        )}
      </div>
      <div className="space-y-1">
        {lines.map((line, idx) => (
          <div key={`${title}-${idx}`} className="text-xs text-[var(--color-text-secondary)]">
            {line}
          </div>
        ))}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-[var(--color-bg4)] bg-[var(--color-bg3)] p-3">
      <div className="text-xs text-[var(--color-text-secondary)]">{label}</div>
      <div className="text-sm font-semibold text-[var(--color-text-primary)]">
        {value}
      </div>
    </div>
  );
}
