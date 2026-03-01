import type {
  BasicInitial,
  RapidInitial,
  TrueFalseInitial,
} from "@/services/quiz/types/quizTypes";
import Image from "next/image";
import { Icon } from "@iconify/react";

type BasicLikeItem =
  | {
      id: string;
      type: "mc";
      text: string;
      image?: { url: string } | null;
      timeLimit?: number | null;
      options: { id: string; text: string; correct: boolean }[];
    }
  | {
      id: string;
      type: "open";
      text: string;
      image?: { url: string } | null;
      timeLimit?: number | null;
      answers: {
        id: string;
        text: string;
        caseSensitive: boolean;
        answerType?: "exact" | "fuzzy" | "keywords" | "list";
        keywords?: string[];
        minKeywords?: number;
        listItems?: string[];
        requireOrder?: boolean;
        minCorrectItems?: number;
        similarityThreshold?: number;
      }[];
    }
  | {
      id: string;
      type: "context";
      text: string;
      image?: { url: string } | null;
    };

type Props = {
  data: BasicInitial | RapidInitial | TrueFalseInitial;
  showEditButtons?: boolean;
  onEditQuestion?: (questionIndex: number) => void;
};

export default function BasicOrRapidQuizPreview({
  data,
  showEditButtons = false,
  onEditQuestion,
}: Props) {
  // Normalize Rapid items to "mc" type with same shape as Basic.
  const items: BasicLikeItem[] =
    data.quizType === "rapid" || data.quizType === "true-false"
      ? (data as RapidInitial | TrueFalseInitial).items.map((it) => ({
          id: it.id,
          type: "mc" as const,
          text: it.text,
          image: it.image ?? null,
          timeLimit: it.timeLimit ?? null,
          options: it.options ?? [],
        }))
      : ((data as BasicInitial).items as BasicLikeItem[]);

  return (
    <div className="mx-auto max-w-6xl space-y-5 pb-6">
      {items.map((it, idx) => (
        <div
          key={it.id}
          className="rounded-xl border border-[var(--color-bg4)] bg-[var(--color-bg2)] p-6 relative transition-all hover:shadow-md"
          style={{ boxShadow: "var(--drop-shadow-sm)" }}
        >
          {/* Header (type + index + per-question timer + edit button) */}
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 text-xs font-bold uppercase tracking-wider text-[var(--color-text-secondary)]">
              <span className="px-2.5 py-1 bg-[var(--color-bg3)] rounded-md">
                {it.type}
              </span>
              <span>Question {idx + 1}</span>
            </div>

            <div className="flex items-center gap-2">
              {"timeLimit" in it && it.timeLimit ? (
                <div className="rounded-lg bg-[var(--color-bg3)] px-3 py-1.5 text-xs font-semibold text-[var(--color-text-secondary)] border border-[var(--color-bg4)]">
                  <Icon
                    icon="mdi:timer-outline"
                    className="inline w-3.5 h-3.5 mr-1 -mt-0.5"
                  />
                  <span className="text-[var(--color-text-primary)]">
                    {Math.floor(it.timeLimit / 60)}m {it.timeLimit % 60}s
                  </span>
                </div>
              ) : null}

              {/* Edit Button */}
              {showEditButtons && onEditQuestion && (
                <button
                  onClick={() => onEditQuestion(idx)}
                  className="p-2.5 rounded-lg bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-dark)] transition-all shadow-md"
                  title="Edit this question"
                >
                  <Icon icon="mdi:pencil" className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* Prompt */}
          <div className="text-[var(--color-text-primary)] mb-4">
            <p className="whitespace-pre-wrap leading-relaxed text-base">
              {it.text}
            </p>
          </div>

          {/* Optional image */}
          {"image" in it && it.image?.url ? (
            <Image
              src={it.image.url}
              alt="question"
              width={1200}
              height={800}
              className="mt-4 max-h-64 w-auto rounded-md object-contain"
              sizes="(max-width: 1024px) 100vw, 768px"
              unoptimized
            />
          ) : null}

          {/* Content by type */}
          {it.type === "mc" && (
            <MCOptionsPreview
              options={it.options ?? []}
              quizType={data.quizType}
            />
          )}

          {it.type === "open" && (
            <OpenAnswersPreview answers={it.answers ?? []} />
          )}

          {it.type === "context" && (
            <div className="mt-3 text-xs text-[var(--color-text-secondary)]">
              This is a context block and does not accept answers.
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function MCOptionsPreview({
  options,
  quizType,
}: {
  options: { id: string; text: string; correct: boolean }[];
  quizType: string;
}) {
  if (!options?.length) return null;

  return (
    <div className="mt-5">
      <div className="text-sm font-semibold text-[var(--color-text-primary)] mb-3">
        Options{" "}
        {quizType === "rapid"
          ? "(single correct answer)"
          : quizType === "true-false"
            ? "(true / false)"
            : "(multiple choice)"}
        :
      </div>
      <ul className="space-y-2.5">
        {options.map((opt, idx) => {
          const base =
            "rounded-lg border-2 px-4 py-3 text-sm transition-all flex items-center justify-between gap-3";
          const cls = opt.correct
            ? "bg-[var(--color-success)]/10 border-[var(--color-success)] font-semibold shadow-sm"
            : "border-[var(--color-bg4)] bg-[var(--color-bg3)] hover:border-[var(--color-primary)]/30";

          return (
            <li key={opt.id} className={`${base} ${cls}`}>
              <span className="flex-1 leading-relaxed">
                {opt.text || `Option ${idx + 1}`}
              </span>
              {opt.correct && (
                <span className="flex items-center gap-1 text-xs font-bold uppercase tracking-wide text-[var(--color-success)]">
                  <Icon icon="mdi:check-circle" className="w-4 h-4" />
                  Correct
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function OpenAnswersPreview({
  answers,
}: {
  answers: {
    id: string;
    text: string;
    caseSensitive: boolean;
    answerType?: "exact" | "fuzzy" | "keywords" | "list";
    keywords?: string[];
    minKeywords?: number;
    listItems?: string[];
    requireOrder?: boolean;
    minCorrectItems?: number;
    similarityThreshold?: number;
  }[];
}) {
  if (!answers?.length) return null;

  const firstAnswer = answers[0];
  const answerType =
    firstAnswer?.answerType === "keywords" ||
    firstAnswer?.answerType === "list" ||
    firstAnswer?.answerType === "fuzzy"
      ? firstAnswer.answerType
      : "exact";

  const formatLabel =
    answerType === "keywords"
      ? "keywords"
      : answerType === "list"
        ? "list"
        : answerType === "fuzzy"
          ? "fuzzy"
          : "exact match";

  return (
    <div className="mt-5 rounded-lg border border-[var(--color-bg4)] bg-[var(--color-bg3)] p-4">
      <div className="mb-3">
        <div className="text-sm font-semibold text-[var(--color-text-primary)]">
          Accepted answers
        </div>
        <div className="mt-1 text-xs text-[var(--color-text-secondary)]">
          Format:{" "}
          <span className="font-semibold text-[var(--color-text-primary)]">
            {formatLabel}
          </span>
        </div>
      </div>

      {answerType === "keywords" && (
        <div className="space-y-2">
          <div className="text-xs text-[var(--color-text-secondary)]">
            Minimum keywords required:{" "}
            <span className="font-semibold text-[var(--color-text-primary)]">
              {firstAnswer.minKeywords || 1}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {(firstAnswer.keywords ?? []).map((kw, idx) => (
              <span
                key={idx}
                className="rounded-lg border border-[var(--color-bg4)] bg-[var(--color-bg2)] px-3 py-1.5 text-sm font-medium text-[var(--color-text-primary)]"
              >
                {kw}
              </span>
            ))}
          </div>
        </div>
      )}

      {answerType === "list" && (
        <div className="space-y-2">
          <div className="text-xs text-[var(--color-text-secondary)]">
            Minimum correct items required:{" "}
            <span className="font-semibold text-[var(--color-text-primary)]">
              {firstAnswer.minCorrectItems || 1}
            </span>
            {" • "}
            {firstAnswer.requireOrder ? "Order required" : "Any order accepted"}
          </div>
          <ul className="space-y-2">
            {(firstAnswer.listItems ?? []).map((item, idx) => (
              <li
                key={idx}
                className="flex items-center gap-3 rounded-lg border border-[var(--color-bg4)] bg-[var(--color-bg2)] px-3 py-2"
              >
                {firstAnswer.requireOrder && (
                  <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[var(--color-primary)]/10 text-[10px] font-bold text-[var(--color-primary)]">
                    {idx + 1}
                  </span>
                )}
                <span className="text-sm text-[var(--color-text-primary)]">
                  {item}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {answerType === "fuzzy" && (
        <div className="space-y-2">
          <div className="text-xs text-[var(--color-text-secondary)]">
            Similarity threshold:{" "}
            <span className="font-semibold text-[var(--color-text-primary)]">
              {Math.round((firstAnswer?.similarityThreshold || 0.85) * 100)}%
            </span>
          </div>
          <div className="rounded-lg border border-[var(--color-bg4)] bg-[var(--color-bg2)] px-3 py-2 text-sm text-[var(--color-text-primary)]">
            {firstAnswer?.text || "(no accepted text provided)"}
          </div>
        </div>
      )}

      {answerType === "exact" && (
        <ul className="space-y-2 text-sm text-[var(--color-text-primary)]">
          {answers.map((ans, idx) => (
            <li
              key={ans.id}
              className="flex items-center justify-between rounded-lg border border-[var(--color-bg4)] bg-[var(--color-bg2)] px-3 py-2"
            >
              <span className="font-medium">
                {ans.text || "(empty accepted answer)"}
              </span>
              {ans.caseSensitive && (
                <span className="ml-3 rounded bg-[var(--color-bg4)] px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-secondary)]">
                  Case sensitive
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
