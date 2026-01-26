export function OpenAnswerBlock({
  value,
  awarded,
  max,
  correctAnswers,
}: {
  value: string;
  awarded: number;
  max: number;
  correctAnswers?: Array<{
    text: string;
    caseSensitive?: boolean;
    answerType?: "exact" | "fuzzy" | "keywords" | "list";
    keywords?: string[];
    minKeywords?: number;
    listItems?: string[];
    requireOrder?: boolean;
    minCorrectItems?: number;
    similarityThreshold?: number;
  }>;
}) {
  const isCorrect = max > 0 && awarded >= max;
  const isWrong = max > 0 && awarded <= 0;

  const base =
    "mt-2 rounded-lg px-4 py-3 text-sm border-2 transition-all shadow-sm";
  const stateClass = isCorrect
    ? "bg-[var(--color-success)]/15 border-[var(--color-success)] font-semibold text-[var(--color-success)]"
    : isWrong
      ? "bg-[var(--color-error)]/15 border-[var(--color-error)] font-semibold text-[var(--color-error)]"
      : "bg-[var(--color-bg3)] border-[var(--color-bg4)] text-[var(--color-text-primary)]";

  return (
    <div className="mt-5 space-y-4">
      {/* Student's Answer */}
      <div>
        <div className="text-sm font-semibold text-[var(--color-text-primary)] mb-2 flex items-center gap-2">
          <span>Your answer:</span>
          {isCorrect && (
            <span className="text-xs bg-[var(--color-success)]/15 text-[var(--color-success)] px-2 py-1 rounded font-bold">
              ✓ CORRECT
            </span>
          )}
          {isWrong && (
            <span className="text-xs bg-[var(--color-error)]/15 text-[var(--color-error)] px-2 py-1 rounded font-bold">
              ✗ INCORRECT
            </span>
          )}
        </div>
        <div className={`${base} ${stateClass}`}>
          {value.trim() ? (
            value
          ) : (
            <span className="italic text-[var(--color-text-secondary)]">
              No answer provided
            </span>
          )}
        </div>
      </div>

      {/* Correct Answers / Marking Scheme */}
      {correctAnswers && correctAnswers.length > 0 && (
        <div>
          <div className="text-sm font-semibold text-[var(--color-text-primary)] mb-2">
            Correct answer{correctAnswers.length > 1 ? "s" : ""} / Marking
            scheme:
          </div>
          <div className="space-y-2">
            {correctAnswers.map((answer, idx) => (
              <div
                key={idx}
                className="rounded-lg px-4 py-3 text-sm border-2 bg-[var(--color-bg3)] border-[var(--color-bg4)] text-[var(--color-text-primary)]"
              >
                {/* Answer type indicator */}
                {answer.answerType && answer.answerType !== "exact" && (
                  <div className="text-xs text-[var(--color-text-tertiary)] mb-1.5 font-medium">
                    [{answer.answerType.toUpperCase()}]
                    {answer.caseSensitive && (
                      <span className="ml-2">(Case sensitive)</span>
                    )}
                  </div>
                )}

                {/* Main answer text */}
                {answer.answerType === "exact" || !answer.answerType ? (
                  <div>
                    <span className="font-medium">{answer.text}</span>
                    {answer.caseSensitive && (
                      <span className="ml-2 text-xs text-[var(--color-text-tertiary)]">
                        (Case sensitive)
                      </span>
                    )}
                  </div>
                ) : answer.answerType === "keywords" && answer.keywords ? (
                  <div>
                    <div className="font-medium mb-1">
                      Keywords: {answer.keywords.join(", ")}
                    </div>
                    {answer.minKeywords && (
                      <div className="text-xs text-[var(--color-text-tertiary)]">
                        Minimum {answer.minKeywords} keyword
                        {answer.minKeywords > 1 ? "s" : ""} required
                      </div>
                    )}
                  </div>
                ) : answer.answerType === "list" && answer.listItems ? (
                  <div>
                    <div className="font-medium mb-1">Required items:</div>
                    <ul className="list-disc list-inside space-y-0.5">
                      {answer.listItems.map((item, i) => (
                        <li key={i}>{item}</li>
                      ))}
                    </ul>
                    {answer.requireOrder && (
                      <div className="text-xs text-[var(--color-text-tertiary)] mt-1">
                        Order matters
                      </div>
                    )}
                    {answer.minCorrectItems && (
                      <div className="text-xs text-[var(--color-text-tertiary)] mt-1">
                        Minimum {answer.minCorrectItems} item
                        {answer.minCorrectItems > 1 ? "s" : ""} required
                      </div>
                    )}
                  </div>
                ) : answer.answerType === "fuzzy" ? (
                  <div>
                    <div className="font-medium mb-1">{answer.text}</div>
                    {answer.similarityThreshold && (
                      <div className="text-xs text-[var(--color-text-tertiary)]">
                        {Math.round(answer.similarityThreshold * 100)}%
                        similarity required
                      </div>
                    )}
                  </div>
                ) : (
                  <span className="font-medium">{answer.text}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
