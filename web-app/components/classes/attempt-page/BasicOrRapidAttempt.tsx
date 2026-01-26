"use client";
import {
  breakdownMapBasicOrRapid,
  getAnswerValue,
} from "@/services/class/helpers/class-helpers";
import { BasicOrRapidAttemptType } from "@/services/class/types/class-types";
import { MCAnswerBlock } from "./answer-blocks/MCAnswerBlock";
import { OpenAnswerBlock } from "./answer-blocks/OpenAnswerBlock";
import Image from "next/image";

export default function BasicOrRapidAttempt({
  attempt,
}: {
  attempt: BasicOrRapidAttemptType;
}) {
  const items = attempt.quizVersionSnapshot.renderSpec.items;
  const bmap = breakdownMapBasicOrRapid(attempt.breakdown);

  return (
    <div className="mx-auto max-w-6xl space-y-5 pb-6">
      {items.map((it, idx) => {
        const bd = bmap.get(it.id);
        const awarded = bd?.awarded ?? 0;
        const max = bd?.max ?? (it.kind === "context" ? 0 : 1);
        const imageUrl =
          typeof it === "object" && it && "image" in it
            ? (it.image as { url?: string } | null | undefined)?.url
            : undefined;

        return (
          <div
            key={it.id}
            className="rounded-xl border border-[var(--color-bg4)] bg-[var(--color-bg2)] p-6 transition-all"
            style={{ boxShadow: "var(--drop-shadow-sm)" }}
          >
            {/* Header */}
            <div className="mb-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 text-xs font-bold uppercase tracking-wider text-[var(--color-text-secondary)]">
                <span className="px-2.5 py-1 bg-[var(--color-bg3)] rounded-md">
                  {it.kind}
                </span>
                <span>Question {idx + 1}</span>
              </div>
              {it.kind !== "context" && (
                <div
                  className={[
                    "rounded-lg px-3 py-1.5 text-sm font-bold shadow-sm border-2",
                    awarded >= max
                      ? "bg-[var(--color-success)]/15 text-[var(--color-success)] border-[var(--color-success)]" // full marks
                      : awarded <= 0
                        ? "bg-[var(--color-error)]/15 text-[var(--color-error)] border-[var(--color-error)]" // zero
                        : "bg-[var(--color-warning)]/15 text-[var(--color-warning)] border-[var(--color-warning)]", // partial
                  ].join(" ")}
                >
                  {awarded}/{max}
                </div>
              )}
            </div>

            {/* Prompt */}
            <div className="text-[var(--color-text-primary)] mb-4">
              <p className="whitespace-pre-wrap leading-relaxed text-base">
                {it.text}
              </p>
            </div>

            {/* Optional image */}
            {imageUrl ? (
              <Image
                src={imageUrl}
                alt="item"
                width={1200}
                height={800}
                className="mt-4 max-h-64 w-auto rounded-md object-contain"
                sizes="(max-width: 1024px) 100vw, 768px"
                unoptimized
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
                correctAnswers={(() => {
                  const item =
                    attempt.quizVersionSnapshot.gradingKey?.items.find(
                      (gk) => gk.kind === "open" && gk.id === it.id,
                    );
                  return item && item.kind === "open"
                    ? item.accepted
                    : undefined;
                })()}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
