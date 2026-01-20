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
import { ImageMeta } from "@/services/images/types";
import { uploadQuizImage } from "@/services/quiz/actions/quiz-image-upload-action";
import { Icon } from "@iconify/react";

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
  onDeleteImage,
}: Props) {
  return (
    <div className="space-y-4 lg:grid lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,360px)] lg:items-start lg:gap-6 lg:space-y-0">
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

      <div className="hidden h-full lg:block">
        <div className="h-full w-px bg-[var(--color-bg4)]" />
      </div>

      {/* Answers */}
      <div className="space-y-2 lg:max-w-[360px]">
        <div className="px-2 text-sm flex justify-between text-[var(--color-text-primary)] mb-3">
          <div className="flex items-center gap-2">
            <p>Accepted Answers</p>
            <span className="relative group">
              <Icon
                icon="mdi:help-circle-outline"
                className="text-[var(--color-text-tertiary)] text-lg"
              />
              <span className="pointer-events-none absolute left-0 top-full z-10 mt-2 w-60 rounded-md border border-[var(--color-bg4)] bg-[var(--color-bg1)] px-3 py-2 text-xs text-[var(--color-text-primary)] shadow-sm opacity-0 transition-opacity group-hover:opacity-100">
                Add one or more accepted answers.
                <br />
                Any match earns full credit.
                <br />
                Use case‑sensitive only if needed.
              </span>
            </span>
          </div>
          <p className="w-[140px] text-center">Case Sensitivity</p>
        </div>

        <ul className="space-y-2">
          {answers.map((ans, i) => (
            <li
              key={ans.id}
              className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-4 py-1"
            >
              <span className="w-6 text-center text-[var(--color-text-secondary)]">
                {i + 1}
              </span>

              <TextInput
                id="answer"
                value={ans.text}
                onValueChange={(val) => onSetText(ans.id, val)}
                placeholder="Accepted answer…"
              />

              <ToggleButton
                on={ans.caseSensitive}
                onToggle={() => onToggleCaseSensitive(ans.id)}
                titleOn="(on)"
                titleOff="(off)"
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
          Add Accepted Answer
        </Button>
      </div>
    </div>
  );
}
