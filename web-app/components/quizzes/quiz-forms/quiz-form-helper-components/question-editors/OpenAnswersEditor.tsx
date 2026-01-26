"use client";

/**
 * OpenAnswersEditor Component
 *
 * Purpose:
 *   - Provides an editor UI for open-ended quiz questions.
 *   - Supports question text, optional timer, optional image,
 *     and management of a list of accepted answers.
 *
 * Props:
 *   @param {string} text - Question prompt.
 *   @param {number|null} timeLimit - Time limit in seconds (null = no timer).
 *   @param {ImageMeta|null|undefined} image - Metadata of uploaded image (if any).
 *   @param {(text: string) => void} onChangeText - Callback when question text changes.
 *   @param {(seconds: number|null) => void} onChangeTime - Callback when timer changes.
 *   @param {(img: ImageMeta|null) => void} onSetImage - Callback when image is uploaded/removed.
 *
 *   @param {OpenAnswer[]} answers - List of accepted answers (with `id`, `text`, and `caseSensitive` flag).
 *   @param {() => void} onAdd - Adds a new answer row.
 *   @param {(id: string) => void} onRemove - Removes an answer by id.
 *   @param {(id: string, text: string) => void} onSetText - Updates answer text by id.
 *   @param {(id: string) => void} onToggleCaseSensitive - Toggles case sensitivity for an answer.
 *
 * Behavior / Logic:
 *   - Question Section:
 *       • Text area for prompt entry.
 *       • <TimerField> to set/disable time limit (5–600s).
 *       • <ImageUpload> for optional context image.
 *   - Answers Section:
 *       • Displays list of answers with index number.
 *       • Each row includes:
 *           – <TextInput> for answer text.
 *           – <ToggleButton> to toggle case sensitivity with on/off titles.
 *           – <IconButton> to remove the answer (error variant).
 *       • "Add Options" button adds a new empty answer.
 *
 * UI:
 *   - Clean vertical layout with spacing between sections.
 *   - Grid layout for answers: index | input | case toggle | delete.
 *   - Theme-based styling for inputs, toggles, and buttons.
 */

import Button from "@/components/ui/buttons/Button";
import { OpenAnswer } from "../../../../../services/quiz/types/quizTypes";
import TimerField from "../TimerField";
import ImageUpload from "../../../../ImageUpload";
import TextArea from "@/components/ui/text-inputs/TextArea";
import TextInput from "@/components/ui/text-inputs/TextInput";
import ToggleButton from "@/components/ui/buttons/ToggleButton";
import IconButton from "@/components/ui/buttons/IconButton";
import Select from "@/components/ui/selectors/select/Select";
import { ImageMeta } from "@/services/images/types";
import { uploadQuizImage } from "@/services/quiz/actions/quiz-image-upload-action";
import { Icon } from "@iconify/react";
import { useState } from "react";

type Props = {
  text: string;
  image: ImageMeta | null | undefined;
  onChangeText: (text: string) => void;
  onSetImage: (img: ImageMeta | null) => void;
  onDeleteImage: () => void;
  answers: OpenAnswer[];
  onAdd: () => void;
  onRemove: (id: string) => void;
  onSetText: (id: string, text: string) => void;
  onToggleCaseSensitive: (id: string) => void;
  onUpdateAnswer: (id: string, updates: Partial<OpenAnswer>) => void;

  timeLimit?: number | null;
  onChangeTime?: (seconds: number | null) => void;
};

export default function OpenAnswersEditor({
  text,
  timeLimit,
  image,
  onChangeText,
  onChangeTime,
  onSetImage,
  answers,
  onAdd,
  onRemove,
  onSetText,
  onToggleCaseSensitive,
  onUpdateAnswer,
  onDeleteImage,
}: Props) {
  // Get answer type from first answer (all answers share same type)
  const currentAnswerType = answers[0]?.answerType || "exact";
  const [answerType, setAnswerType] = useState(currentAnswerType);

  // Sync with props when answers change
  useState(() => {
    setAnswerType(currentAnswerType);
  });

  return (
    <div className="space-y-4 lg:grid lg:grid-cols-[minmax(0,1.2fr)_auto_minmax(0,1fr)] lg:items-start lg:gap-6 lg:space-y-0">
      {/* Left: Question Section */}
      <div>
        <div className="mb-5 flex items-end justify-between">
          <label className="text-sm text-[var(--color-text-primary)]">
            Question Text
          </label>
          {onChangeTime && (
            <TimerField
              id="open-time"
              name="open-time"
              value={timeLimit || 0}
              onChange={onChangeTime}
              min={5}
              max={600}
            />
          )}
        </div>

        <TextArea
          value={text}
          onChange={onChangeText}
          placeholder="Type your question prompt…"
          required
        />

        <div className="mt-4">
          <ImageUpload
            uploadFn={uploadQuizImage}
            fileName={image?.filename}
            onUploaded={(meta) => onSetImage(meta)}
            initialUrl={image?.url}
            onDelete={onDeleteImage}
          />
        </div>
        <div className="px-2 pt-4 lg:hidden">
          <div className="h-px w-full bg-[var(--color-bg4)]" />
        </div>
      </div>

      {/* Middle: Divider */}
      <div className="hidden h-full lg:block">
        <div className="h-full w-px bg-[var(--color-bg4)]" />
      </div>

      {/* Right: Answer Configuration */}
      <div className="space-y-4 lg:max-w-[500px]">
        {/* Answer Type Selector */}
        <div>
          <label
            htmlFor="answer-type"
            className="text-sm font-medium text-[var(--color-text-primary)] block mb-2"
          >
            Answer Validation Mode
          </label>
          <Select
            id="answer-type"
            value={answerType}
            onChange={(val) => {
              const newType = val as "exact" | "fuzzy" | "keywords" | "list";
              setAnswerType(newType);

              // For keywords/list, we only need one answer
              // Keep only the first answer when switching from exact/fuzzy
              if (
                (newType === "keywords" || newType === "list") &&
                answers.length > 1
              ) {
                // Remove extra answers
                for (let i = answers.length - 1; i > 0; i--) {
                  onRemove(answers[i].id);
                }
              }

              // Update the first answer (or all answers for exact/fuzzy)
              if (newType === "keywords" || newType === "list") {
                // Only update first answer
                if (answers[0]) {
                  onUpdateAnswer(answers[0].id, {
                    answerType: newType,
                    text: "",
                    keywords: newType === "keywords" ? [""] : undefined,
                    minKeywords: newType === "keywords" ? 1 : undefined,
                    listItems: newType === "list" ? [""] : undefined,
                    requireOrder: newType === "list" ? false : undefined,
                    minCorrectItems: newType === "list" ? 1 : undefined,
                  });
                }
              } else {
                // Update all answers for exact/fuzzy
                answers.forEach((ans) => {
                  onUpdateAnswer(ans.id, {
                    answerType: newType,
                    // Reset type-specific fields
                    keywords: undefined,
                    minKeywords: undefined,
                    listItems: undefined,
                    requireOrder: undefined,
                    minCorrectItems: undefined,
                    similarityThreshold: newType === "fuzzy" ? 0.85 : undefined,
                  });
                });
              }
            }}
            options={[
              { value: "exact", label: "Exact Match" },
              { value: "fuzzy", label: "Flexible Match" },
              { value: "keywords", label: "Keyword Match" },
              { value: "list", label: "List Match" },
            ]}
          />
        </div>

        <div className="h-px w-full bg-[var(--color-bg4)] my-4" />

        {/* Answer Configuration based on type */}
        {answerType === "exact" && (
          <ExactAnswerConfig
            answers={answers}
            onAdd={onAdd}
            onRemove={onRemove}
            onSetText={onSetText}
            onToggleCaseSensitive={onToggleCaseSensitive}
          />
        )}

        {answerType === "fuzzy" && (
          <FuzzyAnswerConfig
            answers={answers}
            onAdd={onAdd}
            onRemove={onRemove}
            onSetText={onSetText}
            onUpdateAnswer={onUpdateAnswer}
          />
        )}

        {answerType === "keywords" && (
          <KeywordAnswerConfig
            answer={answers[0]}
            onUpdateAnswer={onUpdateAnswer}
          />
        )}

        {answerType === "list" && (
          <ListAnswerConfig
            answer={answers[0]}
            onUpdateAnswer={onUpdateAnswer}
          />
        )}
      </div>
    </div>
  );
}

/* ────────────────── Sub-Components for Each Answer Type ───────────────── */

function ExactAnswerConfig({
  answers,
  onAdd,
  onRemove,
  onSetText,
  onToggleCaseSensitive,
}: {
  answers: OpenAnswer[];
  onAdd: () => void;
  onRemove: (id: string) => void;
  onSetText: (id: string, text: string) => void;
  onToggleCaseSensitive: (id: string) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <p className="text-sm font-semibold text-[var(--color-text-primary)]">
          Accepted Answers
        </p>
        <span className="relative group">
          <Icon
            icon="mdi:help-circle-outline"
            className="text-[var(--color-text-tertiary)] text-base cursor-help"
          />
          <span className="pointer-events-none absolute left-0 top-full z-10 mt-2 w-64 rounded-md border border-[var(--color-bg4)] bg-[var(--color-bg1)] px-3 py-2 text-xs text-[var(--color-text-secondary)] shadow-lg opacity-0 transition-opacity group-hover:opacity-100">
            <strong className="text-[var(--color-text-primary)] block mb-1">
              Exact Match
            </strong>
            Student must type exact answer (typos not allowed). Full credit is
            awarded if their answer matches any of the added answers exactly.
            Use case-sensitive only if needed (e.g., proper nouns, chemical
            formulas). Great for names, dates, or precise terms.
          </span>
        </span>
      </div>

      <div className="grid grid-cols-[auto_1fr_100px_auto] items-center gap-3 px-1 text-xs font-medium text-[var(--color-text-secondary)]">
        <span className="w-6"></span>
        <span>Answer Text</span>
        <span className="text-center">Case Sens.</span>
        <span className="w-10"></span>
      </div>

      <ul className="space-y-2">
        {answers.map((ans, i) => (
          <li
            key={ans.id}
            className="grid grid-cols-[auto_1fr_100px_auto] items-center gap-3"
          >
            <span className="w-6 text-center text-sm font-medium text-[var(--color-text-secondary)]">
              {i + 1}
            </span>

            <TextInput
              id={`answer-${ans.id}`}
              value={ans.text}
              onValueChange={(val) => onSetText(ans.id, val)}
              placeholder="Answer…"
              required
            />

            <div className="flex justify-center">
              <ToggleButton
                on={ans.caseSensitive}
                onToggle={() => onToggleCaseSensitive(ans.id)}
                titleOn="Yes"
                titleOff="No"
              />
            </div>

            <IconButton
              title="Remove"
              onClick={() => onRemove(ans.id)}
              icon="mingcute:delete-2-fill"
              variant="error"
              size={40}
            />
          </li>
        ))}
      </ul>

      <Button type="button" variant="ghost" onClick={onAdd} className="ml-9">
        Add Answer
      </Button>
    </div>
  );
}

function FuzzyAnswerConfig({
  answers,
  onAdd,
  onRemove,
  onSetText,
  onUpdateAnswer,
}: {
  answers: OpenAnswer[];
  onAdd: () => void;
  onRemove: (id: string) => void;
  onSetText: (id: string, text: string) => void;
  onUpdateAnswer: (id: string, updates: Partial<OpenAnswer>) => void;
}) {
  const threshold = answers[0]?.similarityThreshold || 0.85;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <p className="text-sm font-semibold text-[var(--color-text-primary)]">
          Answer Variations
        </p>
        <span className="relative group">
          <Icon
            icon="mdi:help-circle-outline"
            className="text-[var(--color-text-tertiary)] text-base cursor-help"
          />
          <span className="pointer-events-none absolute left-0 top-full z-10 mt-2 w-64 rounded-md border border-[var(--color-bg4)] bg-[var(--color-bg1)] px-3 py-2 text-xs text-[var(--color-text-secondary)] shadow-lg opacity-0 transition-opacity group-hover:opacity-100">
            <strong className="text-[var(--color-text-primary)] block mb-1">
              Flexible Match
            </strong>
            Student answers earn credit if they&apos;re at least 85% similar to
            any variation (allows typos, minor wording differences, extra
            spaces). Great for longer answers where small mistakes
            shouldn&apos;t matter. Add multiple variations to accept different
            phrasings. Note: Fuzzy matching may not work perfectly in all cases.
          </span>
        </span>
      </div>

      <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3 px-1 text-xs font-medium text-[var(--color-text-secondary)]">
        <span className="w-6"></span>
        <span>Variation Text</span>
        <span className="w-10"></span>
      </div>

      <ul className="space-y-2">
        {answers.map((ans, i) => (
          <li
            key={ans.id}
            className="grid grid-cols-[auto_1fr_auto] items-center gap-3"
          >
            <span className="w-6 text-center text-sm font-medium text-[var(--color-text-secondary)]">
              {i + 1}
            </span>

            <TextInput
              id={`answer-${ans.id}`}
              value={ans.text}
              onValueChange={(val) => onSetText(ans.id, val)}
              placeholder="Variation…"
            />

            <IconButton
              title="Remove"
              onClick={() => onRemove(ans.id)}
              icon="mingcute:delete-2-fill"
              variant="error"
              size={40}
            />
          </li>
        ))}
      </ul>

      <Button
        type="button"
        variant="ghost"
        onClick={onAdd}
        className="ml-9 rounded-sm text-sm max-w-[200px]"
      >
        Add Answer Variation
      </Button>

      <div className="mt-4 p-4 bg-[var(--color-bg3)] rounded-lg border border-[var(--color-bg4)]">
        <div className="flex items-center gap-2 mb-2">
          <label className="text-sm font-semibold text-[var(--color-text-primary)]">
            Similarity Threshold: {Math.round(threshold * 100)}%
          </label>
          <span className="relative group">
            <Icon
              icon="mdi:help-circle-outline"
              className="text-[var(--color-text-tertiary)] text-base cursor-help"
            />
            <span className="pointer-events-none absolute left-0 top-full z-10 mt-2 w-64 rounded-md border border-[var(--color-bg4)] bg-[var(--color-bg1)] px-3 py-2 text-xs text-[var(--color-text-secondary)] shadow-lg opacity-0 transition-opacity group-hover:opacity-100">
              Higher values require closer matches. Recommended: 85%
            </span>
          </span>
        </div>
        <input
          type="range"
          min="50"
          max="100"
          step="5"
          value={threshold * 100}
          onChange={(e) => {
            const newThreshold = parseInt(e.target.value) / 100;
            answers.forEach((ans) => {
              onUpdateAnswer(ans.id, { similarityThreshold: newThreshold });
            });
          }}
          className="w-full"
        />
      </div>
    </div>
  );
}

function KeywordAnswerConfig({
  answer,
  onUpdateAnswer,
}: {
  answer: OpenAnswer;
  onUpdateAnswer: (id: string, updates: Partial<OpenAnswer>) => void;
}) {
  const keywords = answer?.keywords || [];
  const minKeywords = answer?.minKeywords || 1;

  const addKeyword = () => {
    const newKeywords = [...keywords, ""];
    onUpdateAnswer(answer.id, {
      keywords: newKeywords,
      minKeywords: Math.min(minKeywords, newKeywords.length),
    });
  };

  const removeKeyword = (index: number) => {
    const newKeywords = keywords.filter((_, i) => i !== index);
    onUpdateAnswer(answer.id, {
      keywords: newKeywords,
      minKeywords: Math.min(minKeywords, newKeywords.length || 1),
    });
  };

  const updateKeyword = (index: number, value: string) => {
    const newKeywords = [...keywords];
    newKeywords[index] = value;
    onUpdateAnswer(answer.id, { keywords: newKeywords });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-[var(--color-text-primary)]">
              Required Keywords
            </p>
            <span className="relative group">
              <Icon
                icon="mdi:help-circle-outline"
                className="text-[var(--color-text-tertiary)] text-base cursor-help"
              />
              <span className="pointer-events-none absolute left-0 top-full z-10 mt-2 w-64 rounded-md border border-[var(--color-bg4)] bg-[var(--color-bg1)] px-3 py-2 text-xs text-[var(--color-text-secondary)] shadow-lg opacity-0 transition-opacity group-hover:opacity-100">
                <strong className="text-[var(--color-text-primary)] block mb-1">
                  Keyword Match
                </strong>
                Student&apos;s answer must contain these keywords. Score is
                based on how many keywords are found (partial credit awarded).
                Great for essay questions, explanations, or short-answer
                responses where specific terms indicate understanding.
              </span>
            </span>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <div className="grid grid-cols-[auto_1fr_auto] items-center gap-4 px-2 text-xs font-medium text-[var(--color-text-secondary)]">
          <span className="w-6"></span>
          <span>Keyword</span>
          <span className="w-10"></span>
        </div>

        <ul className="space-y-2">
          {keywords.map((kw, i) => (
            <li
              key={i}
              className="grid grid-cols-[auto_1fr_auto] items-center gap-4"
            >
              <span className="w-6 text-center text-sm font-medium text-[var(--color-text-secondary)]">
                {i + 1}
              </span>

              <TextInput
                id={`keyword-${i}`}
                value={kw}
                onValueChange={(val) => updateKeyword(i, val)}
                placeholder="Enter keyword or phrase…"
                required
              />

              <IconButton
                title="Remove keyword"
                onClick={() => removeKeyword(i)}
                icon="mingcute:delete-2-fill"
                variant="error"
                size={40}
              />
            </li>
          ))}
        </ul>

        <Button
          type="button"
          variant="ghost"
          onClick={addKeyword}
          className="ml-10 mt-2"
        >
          Add Keyword
        </Button>
      </div>

      <div className="p-4 bg-[var(--color-bg3)] rounded-lg border border-[var(--color-bg4)]">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <label className="text-sm text-[var(--color-text-primary)]">
              Minimum keywords required:
            </label>
            <span className="relative group">
              <Icon
                icon="mdi:help-circle-outline"
                className="text-[var(--color-text-tertiary)] text-base cursor-help"
              />
              <span className="pointer-events-none absolute left-0 top-full z-10 mt-2 w-64 rounded-md border border-[var(--color-bg4)] bg-[var(--color-bg1)] px-3 py-2 text-xs text-[var(--color-text-secondary)] shadow-lg opacity-0 transition-opacity group-hover:opacity-100">
                Student needs at least this many keywords to earn any points.
                Score is proportional to keywords found.
              </span>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <TextInput
              id="min-keywords"
              type="number"
              value={String(minKeywords)}
              onValueChange={(val) => {
                const num = parseInt(val) || 1;
                onUpdateAnswer(answer.id, {
                  minKeywords: Math.max(1, Math.min(num, keywords.length || 1)),
                });
              }}
              min={1}
              max={keywords.length || 1}
              className="w-20"
            />
            <span className="text-sm text-[var(--color-text-secondary)]">
              / {keywords.length}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function ListAnswerConfig({
  answer,
  onUpdateAnswer,
}: {
  answer: OpenAnswer;
  onUpdateAnswer: (id: string, updates: Partial<OpenAnswer>) => void;
}) {
  const listItems = answer?.listItems || [];
  const requireOrder = answer?.requireOrder || false;
  const minCorrectItems = answer?.minCorrectItems || 1;

  const addItem = () => {
    if (listItems.length >= 10) return; // max 10 items
    const newItems = [...listItems, ""];
    onUpdateAnswer(answer.id, {
      listItems: newItems,
      minCorrectItems: Math.min(minCorrectItems, newItems.length),
    });
  };

  const removeItem = (index: number) => {
    const newItems = listItems.filter((_, i) => i !== index);
    onUpdateAnswer(answer.id, {
      listItems: newItems,
      minCorrectItems: Math.min(minCorrectItems, newItems.length || 1),
    });
  };

  const updateItem = (index: number, value: string) => {
    const newItems = [...listItems];
    newItems[index] = value;
    onUpdateAnswer(answer.id, { listItems: newItems });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-[var(--color-text-primary)]">
              Expected List Items
            </p>
            <span className="relative group">
              <Icon
                icon="mdi:help-circle-outline"
                className="text-[var(--color-text-tertiary)] text-base cursor-help"
              />
              <span className="pointer-events-none absolute left-0 top-full z-10 mt-2 w-64 rounded-md border border-[var(--color-bg4)] bg-[var(--color-bg1)] px-3 py-2 text-xs text-[var(--color-text-secondary)] shadow-lg opacity-0 transition-opacity group-hover:opacity-100">
                <strong className="text-[var(--color-text-primary)] block mb-1">
                  List Match
                </strong>
                Student must list multiple items. Great for &ldquo;Name
                three...&rdquo; or &ldquo;List five...&rdquo; questions.
                Students can use commas, semicolons, or &ldquo;and&rdquo; to
                separate items. Score is based on how many items match the
                expected list.
              </span>
            </span>
          </div>
        </div>
      </div>

      <div className="p-3 bg-[var(--color-bg3)] rounded-lg border border-[var(--color-bg4)]">
        <div className="flex items-center gap-3">
          <ToggleButton
            on={requireOrder}
            onToggle={() =>
              onUpdateAnswer(answer.id, { requireOrder: !requireOrder })
            }
            titleOn="Order Required"
            titleOff="Any Order"
          />
          <div className="text-sm text-[var(--color-text-primary)]">
            {requireOrder ? (
              <span className="flex items-center gap-1">
                <Icon icon="mdi:sort-numeric-ascending" className="text-base" />
                Items must be in this exact order
              </span>
            ) : (
              <span className="flex items-center gap-1">
                <Icon icon="mdi:shuffle-variant" className="text-base" />
                Items can be in any order
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <div className="grid grid-cols-[auto_1fr_auto] items-center gap-4 px-2 text-xs font-medium text-[var(--color-text-secondary)]">
          <span className="w-6">#</span>
          <span>List Item</span>
          <span className="w-10"></span>
        </div>

        <ul className="space-y-2">
          {listItems.map((item, i) => (
            <li
              key={i}
              className="grid grid-cols-[auto_1fr_auto] items-center gap-4"
            >
              <span className="w-6 text-center text-sm font-medium text-[var(--color-text-secondary)]">
                {i + 1}
              </span>

              <TextInput
                id={`item-${i}`}
                value={item}
                onValueChange={(val) => updateItem(i, val)}
                placeholder="Enter list item…"
                required
              />

              <IconButton
                title="Remove item"
                onClick={() => removeItem(i)}
                icon="mingcute:delete-2-fill"
                variant="error"
                size={40}
              />
            </li>
          ))}
        </ul>

        <Button
          type="button"
          variant="ghost"
          onClick={addItem}
          className="ml-10 mt-2"
          disabled={listItems.length >= 10}
        >
          Add Item {listItems.length >= 10 ? "(Max 10)" : ""}
        </Button>
      </div>

      <div className="p-4 bg-[var(--color-bg3)] rounded-lg border border-[var(--color-bg4)]">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <label className="text-sm text-[var(--color-text-primary)]">
              Minimum correct items:
            </label>
            <span className="relative group">
              <Icon
                icon="mdi:help-circle-outline"
                className="text-[var(--color-text-tertiary)] text-base cursor-help"
              />
              <span className="pointer-events-none absolute left-0 top-full z-10 mt-2 w-64 rounded-md border border-[var(--color-bg4)] bg-[var(--color-bg1)] px-3 py-2 text-xs text-[var(--color-text-secondary)] shadow-lg opacity-0 transition-opacity group-hover:opacity-100">
                Student needs at least this many correct items to earn any
                points. Score is proportional to items matched.
              </span>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <TextInput
              id="min-items"
              type="number"
              value={String(minCorrectItems)}
              onValueChange={(val) => {
                const num = parseInt(val) || 1;
                onUpdateAnswer(answer.id, {
                  minCorrectItems: Math.max(
                    1,
                    Math.min(num, Math.min(10, listItems.length || 1)),
                  ),
                });
              }}
              min={1}
              max={Math.min(10, listItems.length || 1)}
              className="w-20"
            />
            <span className="text-sm text-[var(--color-text-secondary)]">
              / {listItems.length}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
