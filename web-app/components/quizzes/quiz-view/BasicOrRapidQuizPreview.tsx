import type {
  BasicInitial,
  RapidInitial,
} from "@/services/quiz/types/quizTypes";
import Image from "next/image";

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
      answers: { id: string; text: string; caseSensitive: boolean }[];
    }
  | {
      id: string;
      type: "context";
      text: string;
      image?: { url: string } | null;
    };

type Props = {
  data: BasicInitial | RapidInitial;
};

export default function BasicOrRapidQuizPreview({ data }: Props) {
  // Normalize Rapid items to "mc" type with same shape as Basic.
  const items: BasicLikeItem[] =
    data.quizType === "rapid"
      ? (data as RapidInitial).items.map((it) => ({
          id: it.id,
          type: "mc" as const,
          text: it.text,
          image: it.image ?? null,
          timeLimit: it.timeLimit ?? null,
          options: it.options ?? [],
        }))
      : ((data as BasicInitial).items as BasicLikeItem[]);

  return (
    <div className="mx-auto max-w-6xl space-y-4 pb-6">
      {items.map((it, idx) => (
        <div
          key={it.id}
          className="rounded-xl border border-[var(--color-bg4)] bg-[var(--color-bg3)] p-5 shadow-sm"
        >
          {/* Header (type + index + per-question timer) */}
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">
              <span>{it.type}</span>
              <span>• Q{idx + 1}</span>
            </div>

            {"timeLimit" in it && it.timeLimit ? (
              <div className="rounded-md bg-[var(--color-bg2)] px-2 py-1 text-xs font-medium text-[var(--color-text-secondary)]">
                Timer:{" "}
                <span className="font-semibold text-[var(--color-text-primary)]">
                  {Math.round(it.timeLimit / 60)} min
                </span>
              </div>
            ) : null}
          </div>

          {/* Prompt */}
          <div className="text-[var(--color-text-primary)]">
            <p className="whitespace-pre-wrap leading-relaxed">{it.text}</p>
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
    <div className="mt-4">
      <div className="text-sm font-medium text-[var(--color-text-primary)]">
        Options {quizType === "rapid" ? "(single correct)" : ""}:
      </div>
      <ul className="mt-2 space-y-2">
        {options.map((opt, idx) => {
          const base =
            "rounded-md border px-3 py-2 text-sm transition flex items-center justify-between gap-3";
          const cls = opt.correct
            ? "bg-[var(--color-success)]/10 border-[var(--color-success)] font-semibold"
            : "border-[var(--color-bg4)]";

          return (
            <li key={opt.id} className={`${base} ${cls}`}>
              <span className="flex-1">{opt.text || `Option ${idx + 1}`}</span>
              {opt.correct && (
                <span className="text-xs font-semibold uppercase tracking-wide text-[var(--color-success)]">
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
  answers: { id: string; text: string; caseSensitive: boolean }[];
}) {
  if (!answers?.length) return null;

  return (
    <div className="mt-4">
      <div className="text-sm font-medium text-[var(--color-text-primary)]">
        Accepted answers:
      </div>
      <ul className="mt-2 space-y-1 text-sm text-[var(--color-text-primary)]">
        {answers.map((ans, idx) => (
          <li
            key={ans.id}
            className="flex items-center justify-between rounded-md bg-[var(--color-bg2)] px-3 py-1.5"
          >
            <span>{ans.text || `Answer ${idx + 1}`}</span>
            {ans.caseSensitive && (
              <span className="ml-3 text-[10px] uppercase tracking-wide text-[var(--color-text-secondary)]">
                Case sensitive
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
