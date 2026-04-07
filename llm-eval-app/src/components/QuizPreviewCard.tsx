import type { DraftQuiz } from "../types";
import { isTruthy } from "../utils";

type QuizPreviewCardProps = {
  quiz: DraftQuiz;
  index: number;
};

type CrosswordDirection = "across" | "down";
type OpenAnswerFormat = "exact" | "fuzzy" | "keywords" | "list";

function toText(value: unknown): string {
  return String(value ?? "").trim();
}

function getOptionLabel(index: number): string {
  return String.fromCharCode(65 + (index % 26));
}

function normalizeOpenAnswerType(value: unknown): OpenAnswerFormat {
  const token = toText(value).toLowerCase();
  if (token === "fuzzy") return "fuzzy";
  if (token === "keywords") return "keywords";
  if (token === "list") return "list";
  return "exact";
}

function toOpenAnswerFormatLabel(format: OpenAnswerFormat): string {
  if (format === "keywords") return "keywords";
  if (format === "list") return "list";
  if (format === "fuzzy") return "fuzzy";
  return "exact match";
}

function buildOpenAnswerSummary(answers: any[]): {
  format: OpenAnswerFormat;
  lines: string[];
} | null {
  if (!answers.length) return null;

  const format = normalizeOpenAnswerType(answers[0]?.answerType);

  if (format === "keywords") {
    const first = answers[0] || {};
    const keywords = Array.isArray(first?.keywords)
      ? first.keywords.map((k: unknown) => toText(k)).filter(Boolean)
      : [];
    const minKeywords = Number(first?.minKeywords);
    const lines: string[] = [];
    lines.push(
      `Keywords: ${keywords.length > 0 ? keywords.join(", ") : "(none provided)"}`,
    );
    lines.push(
      `Minimum keywords required: ${
        Number.isFinite(minKeywords) ? minKeywords : 1
      }`,
    );
    return { format, lines };
  }

  if (format === "list") {
    const first = answers[0] || {};
    const listItems = Array.isArray(first?.listItems)
      ? first.listItems.map((item: unknown) => toText(item)).filter(Boolean)
      : [];
    const minCorrect = Number(first?.minCorrectItems);
    const lines: string[] = [];
    lines.push(
      `List items: ${
        listItems.length > 0 ? listItems.join(", ") : "(none provided)"
      }`,
    );
    lines.push(
      `Minimum correct items required: ${
        Number.isFinite(minCorrect) ? minCorrect : 1
      }`,
    );
    if (isTruthy(first?.requireOrder)) {
      lines.push("Order required: yes");
    }
    return { format, lines };
  }

  if (format === "fuzzy") {
    const first = answers[0] || {};
    const threshold = Number(first?.similarityThreshold);
    const lines: string[] = [];
    lines.push(
      `Accepted text: ${toText(first?.text) || "(none provided)"}`,
    );
    if (Number.isFinite(threshold)) {
      lines.push(`Similarity threshold: ${threshold}`);
    }
    return { format, lines };
  }

  const acceptedTexts = answers
    .map((answer: any) => toText(answer?.text))
    .filter(Boolean);
  const anyCaseSensitive = answers.some((answer: any) =>
    isTruthy(answer?.caseSensitive),
  );
  const lines: string[] = [];
  lines.push(
    `Matches any of: ${
      acceptedTexts.length > 0 ? acceptedTexts.join(" | ") : "(none provided)"
    }`,
  );
  if (anyCaseSensitive) {
    lines.push("Case-sensitive matching enabled");
  }
  return { format, lines };
}

function normalizeCrosswordNumbering(entries: any[]): {
  numberedEntries: Array<{
    number: number;
    clue: string;
    answer: string;
    direction: CrosswordDirection | null;
  }>;
  numberByCellKey: Map<string, number>;
} {
  const starts = entries
    .map((entry, idx) => {
      const positions = Array.isArray(entry?.positions) ? entry.positions : [];
      const first = positions[0];
      const row = Number(first?.row);
      const col = Number(first?.col);
      const hasStart = Number.isFinite(row) && Number.isFinite(col);

      return {
        idx,
        clue: toText(entry?.clue),
        answer: toText(entry?.answer).toUpperCase(),
        direction:
          entry?.direction === "across" || entry?.direction === "down"
            ? (entry.direction as CrosswordDirection)
            : null,
        row: hasStart ? row : Number.NaN,
        col: hasStart ? col : Number.NaN,
        hasStart,
      };
    })
    .sort((a, b) => {
      if (a.hasStart && b.hasStart) {
        if (a.row !== b.row) return a.row - b.row;
        if (a.col !== b.col) return a.col - b.col;
      } else if (a.hasStart !== b.hasStart) {
        return a.hasStart ? -1 : 1;
      }
      return a.idx - b.idx;
    });

  const numberByCellKey = new Map<string, number>();
  let next = 1;
  const numberedEntries = starts.map((entry) => {
    if (!entry.hasStart) {
      const fallback = next++;
      return {
        number: fallback,
        clue: entry.clue,
        answer: entry.answer,
        direction: entry.direction,
      };
    }

    const key = `${entry.row}:${entry.col}`;
    const existing = numberByCellKey.get(key);
    const number = existing ?? next++;
    if (!existing) {
      numberByCellKey.set(key, number);
    }

    return {
      number,
      clue: entry.clue,
      answer: entry.answer,
      direction: entry.direction,
    };
  });

  return { numberedEntries, numberByCellKey };
}

function normalizeCrosswordCell(cell: unknown): {
  blocked: boolean;
  letter: string;
} {
  if (cell == null) return { blocked: true, letter: "" };

  if (typeof cell === "string") {
    const normalized = cell.trim();
    const blocked =
      normalized.length === 0 ||
      normalized === "#" ||
      normalized === "." ||
      normalized === "*";
    return {
      blocked,
      letter: blocked ? "" : normalized.slice(0, 1).toUpperCase(),
    };
  }

  if (typeof cell === "object") {
    const rowCell = cell as { isBlocked?: unknown; letter?: unknown };
    const isBlocked = isTruthy(rowCell.isBlocked);
    const letter = toText(rowCell.letter);
    if (!letter) return { blocked: true, letter: "" };
    return { blocked: isBlocked && !letter, letter: letter.slice(0, 1).toUpperCase() };
  }

  return { blocked: true, letter: "" };
}

function renderCrossword(quiz: DraftQuiz) {
  const entries = Array.isArray(quiz.entries) ? quiz.entries : [];
  const grid = Array.isArray(quiz.grid) ? quiz.grid : [];
  const { numberedEntries, numberByCellKey } = normalizeCrosswordNumbering(entries);

  return (
    <div className="quiz-section">
      {grid.length > 0 ? (
        <div className="crossword-grid-wrap">
          <table className="crossword-grid" aria-label="Crossword grid">
            <tbody>
              {grid.map((row, rowIndex) => {
                const cells = Array.isArray(row) ? row : [];
                return (
                  <tr key={`row-${rowIndex}`}>
                    {cells.map((cell, colIndex) => {
                      const state = normalizeCrosswordCell(cell);
                      const key = `${rowIndex}:${colIndex}`;
                      const number = numberByCellKey.get(key);

                      return (
                        <td
                          key={key}
                          className={`crossword-cell${state.blocked ? " blocked" : ""}`}
                        >
                          {!state.blocked && number ? (
                            <span className="crossword-cell-number">{number}</span>
                          ) : null}
                          {!state.blocked && state.letter ? (
                            <span className="crossword-cell-letter">{state.letter}</span>
                          ) : null}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="muted" style={{ marginTop: 0 }}>
          No crossword grid was returned for this quiz.
        </p>
      )}

      {numberedEntries.length > 0 ? (
        <>
          <p className="quiz-subheading">Clues</p>
          <ol className="quiz-question-list">
            {numberedEntries.map((entry, idx) => (
              <li key={`clue-${idx}`}>
                <div className="quiz-question-item">
                  <p className="quiz-question-text">
                    {entry.number}. {entry.clue || "(Missing clue)"}
                    {entry.direction ? ` (${entry.direction})` : ""}
                  </p>
                  <p className="quiz-answer-key">
                    Answer: {entry.answer || "(Missing answer)"}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </>
      ) : null}
    </div>
  );
}

function renderQuestionItem(item: any, itemIndex: number) {
  const text = toText(item?.text);
  const image = toText(item?.image);
  const options = Array.isArray(item?.options) ? item.options : [];
  const answers = Array.isArray(item?.answers) ? item.answers : [];
  const correctOptions = options
    .filter((option: any) => isTruthy(option?.correct))
    .map((option: any) => toText(option?.text))
    .filter(Boolean);
  const openAnswerSummary = buildOpenAnswerSummary(answers);

  return (
    <li key={toText(item?.id) || `item-${itemIndex}`}>
      <div className="quiz-question-item">
        <p className="quiz-question-text">
          {itemIndex + 1}. {text || "(Empty question text)"}
        </p>

        {image ? (
          <div className="quiz-question-image-wrap">
            <img className="quiz-question-image" src={image} alt={`Question ${itemIndex + 1}`} />
          </div>
        ) : null}

        {options.length > 0 ? (
          <div className="quiz-options">
            {options.map((option: any, optionIndex: number) => (
              <div key={toText(option?.id) || `option-${optionIndex}`} className="quiz-option">
                <span className="quiz-option-label">{getOptionLabel(optionIndex)}.</span>
                <span className="quiz-option-text">
                  {toText(option?.text) || "(Empty option)"}
                </span>
              </div>
            ))}
          </div>
        ) : null}

        {correctOptions.length > 0 ? (
          <p className="quiz-answer-key">Answer: {correctOptions.join(", ")}</p>
        ) : null}

        {openAnswerSummary ? (
          <div className="quiz-open-answer-block">
            <p className="quiz-answer-key">Accepted answers</p>
            <p className="quiz-open-answer-meta">
              Format: {toOpenAnswerFormatLabel(openAnswerSummary.format)}
            </p>
            {openAnswerSummary.lines.map((line: string, index: number) => (
              <p key={`accepted-line-${index}`} className="quiz-open-answer-line">
                {line}
              </p>
            ))}
          </div>
        ) : null}
      </div>
    </li>
  );
}

export default function QuizPreviewCard({ quiz, index }: QuizPreviewCardProps) {
  const items = Array.isArray(quiz.items) ? quiz.items : [];

  return (
    <article className="quiz" key={quiz.tempId || `${quiz.name}-${index}`}>
      <h3>
        {index + 1}. {quiz.name}
      </h3>
      <p className="quiz-meta">
        {quiz.quizType} • {quiz.subject} • {quiz.topic}
      </p>

      {quiz.quizType === "crossword" ? (
        renderCrossword(quiz)
      ) : (
        <div className="quiz-section">
          <ol className="quiz-question-list">
            {items.map((item, itemIndex) => renderQuestionItem(item, itemIndex))}
          </ol>
        </div>
      )}
    </article>
  );
}
