"use client";
import {
  breakdownMapBasicOrRapid,
  getAnswerValue,
} from "@/services/class/helpers/class-helpers";
import { BasicOrRapidAttemptType } from "@/services/class/types/class-types";
import { MCAnswerBlock } from "./answer-blocks/MCAnswerBlock";
import { OpenAnswerBlock } from "./answer-blocks/OpenAnswerBlock";

export default function BasicOrRapidAttempt({
  attempt,
}: {
  attempt: BasicOrRapidAttemptType;
}) {
  const items = attempt.quizVersionSnapshot.renderSpec.items;
  const bmap = breakdownMapBasicOrRapid(attempt.breakdown);

  return (
    <div className="mx-auto max-w-6xl space-y-4 pb-6">
      {items.map((it, idx) => {
        const bd = bmap.get(it.id);
        const awarded = bd?.awarded ?? 0;
        const max = bd?.max ?? (it.kind === "context" ? 0 : 1);

        return (
          <div
            key={it.id}
            className="rounded-xl border border-[var(--color-bg4)] bg-[var(--color-bg3)] p-5 shadow-sm"
          >
            {/* Header */}
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="text-sm font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">
                {it.kind} • Q{idx + 1}
              </div>
              {it.kind !== "context" && (
                <div
                  className={[
                    "rounded-md px-2 py-1 text-sm font-semibold",
                    awarded >= max
                      ? "bg-[var(--color-success)] text-[var(--color-text-primary)]" // full marks
                      : awarded <= 0
                      ? "bg-[var(--color-error)] text-[var(--color-text-primary)]" // zero
                      : "bg-[var(--color-bg2)] text-[var(--color-text-primary)] border border-[var(--color-bg4)]", // partial
                  ].join(" ")}
                >
                  {awarded}/{max}
                </div>
              )}
            </div>

            {/* Prompt */}
            <div className="text-[var(--color-text-primary)]">
              <p className="whitespace-pre-wrap leading-relaxed">{it.text}</p>
            </div>

            {/* Optional image */}
            {(it as any).image?.url ? (
              <img
                src={(it as any).image.url}
                alt="item"
                className="mt-4 max-h-64 w-auto rounded-md object-contain"
              />
            ) : null}

            {/* Answers */}
            {it.kind === "mc" && (
              <MCAnswerBlock
                itemId={it.id}
                options={it.options}
                answers={attempt.answers}
                breakdownMeta={bd?.meta}
              />
            )}

            {it.kind === "open" && (
              <OpenAnswerBlock
                value={String(getAnswerValue(it.id, attempt.answers) ?? "")}
                awarded={awarded}
                max={max}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
