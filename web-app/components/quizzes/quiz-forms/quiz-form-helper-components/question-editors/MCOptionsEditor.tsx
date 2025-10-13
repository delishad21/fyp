"use client";

/**
 * MCOptionsEditor Component
 *
 * Purpose:
 *   - Provides a full editor interface for creating and editing
 *     multiple-choice (MC) questions.
 *   - Supports question prompt text, optional timer, optional image,
 *     and a dynamic list of answer options.
 *
 * Props:
 *   Shared Question UI:
 *     @param {string} text - Question text (prompt).
 *     @param {number|null} timeLimit - Timer value in seconds (or null for no timer).
 *     @param {ImageMeta|null|undefined} image - Metadata for uploaded image.
 *     @param {(text: string) => void} onChangeText - Callback when question text changes.
 *     @param {(seconds: number|null) => void} onChangeTime - Callback when timer changes.
 *     @param {(img: ImageMeta|null) => void} onSetImage - Callback when image is uploaded/removed.
 *
 *   Options UI:
 *     @param {MCOption[]} options - List of MC options (id, text, correct).
 *     @param {() => void} onAdd - Handler to add a new option.
 *     @param {(id: string) => void} onRemove - Handler to remove an option.
 *     @param {(id: string, text: string) => void} onSetText - Handler when option text changes.
 *     @param {(id: string) => void} onToggleCorrect - Handler to toggle correctness flag.
 *
 *   Additional Controls:
 *     @param {boolean} [lockCount=false] - If true, prevents adding/removing options.
 *     @param {number} [maxOptions] - Maximum number of options allowed.
 *     @param {boolean} [blockTimerDisable=false] - If true, timer cannot be disabled.
 *
 * Behavior / Logic:
 *   - Displays "Question Text" label with <TextArea> and optional <ImageUpload>.
 *   - Renders <TimerField> for time limits (min 5s, max 600s).
 *   - Shows options list:
 *       • Each option has index number, text input, "Mark answer" toggle,
 *         and optional delete button.
 *       • Correct options use "success" variant; incorrect use "ghost".
 *   - Add button appears unless count is locked or max reached.
 *   - Displays option count as label (e.g. "3 / 5").
 *
 * UI:
 *   - Structured with vertical spacing and consistent theme colors.
 *   - Inputs: <TextArea> for question, <TextInput> for options.
 *   - Buttons: Add Options (ghost variant), per-option IconButtons
 *     for mark/remove, TimerField controls.
 *   - Responsive layout with grid for options row.
 */

import Button from "@/components/ui/buttons/Button";
import { Icon } from "@iconify/react";
import { MCOption } from "../../../../../services/quiz/types/quizTypes";
import TimerField from "../TimerField";
import ImageUpload from "../../../../ImageUpload";
import clsx from "clsx";
import TextArea from "@/components/ui/text-inputs/TextArea";
import TextInput from "@/components/ui/text-inputs/TextInput";
import IconButton from "@/components/ui/buttons/IconButton";
import { ImageMeta } from "@/services/images/types";
import { uploadQuizImage } from "@/services/quiz/actions/quiz-image-upload-action";

export default function MCOptionsEditor({
  text,
  timeLimit,
  image,
  onChangeText,
  onChangeTime,
  onSetImage,
  onDeleteImage,
  options,
  onAdd,
  onRemove,
  onSetText,
  onToggleCorrect,
  lockCount = false,
  maxOptions,
  blockTimerDisable = false,
}: {
  text: string;
  timeLimit: number | null;
  image: ImageMeta | null | undefined;
  onChangeText: (text: string) => void;
  onChangeTime: (seconds: number | null) => void;
  onSetImage: (img: ImageMeta | null) => void;
  onDeleteImage: () => void;

  options: MCOption[];
  onAdd: () => void;
  onRemove: (id: string) => void;
  onSetText: (id: string, text: string) => void;
  onToggleCorrect: (id: string) => void;

  lockCount?: boolean;
  maxOptions?: number;
  blockTimerDisable?: boolean;
}) {
  const showDelete = !lockCount;
  const showAdd =
    !lockCount && (maxOptions === undefined || options.length < maxOptions);

  const countLabel =
    maxOptions !== undefined
      ? `${options.length} / ${maxOptions}`
      : String(options.length);

  return (
    <div className="space-y-4">
      {/* Shared: Question text + timer + image */}
      <div>
        <div className="mb-5 flex items-end justify-between">
          <label className="text-md text-[var(--color-text-primary)]">
            Question Text
          </label>
          <TimerField
            id="mc-time"
            name="mc-time"
            value={timeLimit}
            onChange={onChangeTime}
            min={5}
            max={600}
            blockDisable={blockTimerDisable}
          />
        </div>

        <TextArea
          value={text}
          onChange={onChangeText}
          placeholder="Type your question prompt..."
          required
        />

        <div className="mt-2">
          <ImageUpload
            uploadFn={uploadQuizImage}
            fileName={image?.filename}
            onUploaded={(meta) => onSetImage(meta)}
            initialUrl={image?.url}
            onDelete={onDeleteImage}
          />
        </div>
      </div>

      {/* Options */}
      <div className="space-y-2 max-w-[600px]">
        <div className="px-2 flex items-center justify-between mb-3">
          <p className="text-md text-[var(--color-text-primary)]">Options</p>
          <div className="flex items-center gap-3">
            <span className="text-md text-[var(--color-text-secondary)] whitespace-nowrap">
              {countLabel}
            </span>
            {showAdd && (
              <Button
                type="button"
                variant="ghost"
                onClick={onAdd}
                className="rounded-sm text-sm"
              >
                Add Options
              </Button>
            )}
          </div>
        </div>

        <ul className="space-y-2">
          {options.map((opt, i) => (
            <li
              key={opt.id}
              className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-4 py-1"
            >
              <span className="w-6 text-center text-[var(--color-text-secondary)]">
                {i + 1}
              </span>

              <TextInput
                id={`option-${opt.id}`}
                value={opt.text}
                onValueChange={(val) => onSetText(opt.id, val)}
                placeholder="Option text…"
              />
              <IconButton
                title="Mark answer"
                onClick={() => onToggleCorrect(opt.id)}
                icon={"mingcute:check-circle-fill"}
                variant={opt.correct ? "success" : "ghost"}
                size={40}
              />

              {showDelete ? (
                <IconButton
                  title="Remove"
                  onClick={() => onRemove(opt.id)}
                  icon="mingcute:delete-2-fill"
                  variant="error"
                  size={40}
                />
              ) : (
                <span className="w-8 h-8" />
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
