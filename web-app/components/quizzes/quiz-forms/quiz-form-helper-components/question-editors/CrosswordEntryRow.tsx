"use client";

/**
 * CrosswordEntryRow Component
 *
 * Purpose:
 *   - Represents a single row in the crossword editor.
 *   - Allows editing the "Word" (answer) and "Clue" fields.
 *   - Provides delete functionality and inline error display.
 *
 * Props:
 *   @param {number} index - Row index (used for clearing row-specific errors).
 *   @param {CrosswordEntry} entry - Crossword entry object containing { id, answer, clue }.
 *   @param {string|string[]} [error] - Optional error message(s) for this row.
 *   @param {(id: string, field: "answer" | "clue", value: string) => void} onChange
 *          - Called when either the answer or clue changes.
 *   @param {(id: string) => void} onDelete - Called to delete the current entry.
 *   @param {(index: number) => void} clearErrors - Clears error(s) for this row.
 *
 * Behavior / Logic:
 *   - Updates entry values on input/textarea changes, clearing errors first.
 *   - Delete button removes the current entry via `onDelete`.
 *   - Displays error messages below inputs if provided (joins arrays into a string).
 *
 * UI:
 *   - Container with border and padding.
 *   - "Word" input field and a delete icon button in the top row.
 *   - "Clue" textarea in the second row.
 *   - Error message styled with error color if present.
 *
 * Accessibility:
 *   - Inputs include descriptive labels.
 *   - Delete button has a `title` for tooltip and screen reader accessibility.
 */

import * as React from "react";
import IconButton from "@/components/ui/buttons/IconButton";
import { CrosswordEntry } from "@/services/quiz/types/quizTypes";
import TextArea from "@/components/ui/text-inputs/TextArea";
import TextInput from "@/components/ui/text-inputs/TextInput";

type Props = {
  index: number;
  entry: CrosswordEntry;
  error?: string | string[];
  onChange: (id: string, field: "answer" | "clue", value: string) => void;
  onDelete: (id: string) => void;
  clearErrors: (index: number) => void;
};

export default function CrosswordEntryRow({
  index,
  entry,
  error,
  onChange,
  onDelete,
  clearErrors,
}: Props) {
  return (
    <div className="gap-3 flex-col rounded-md border border-[var(--color-bg4)] p-3">
      <div className="flex flex-row items-center space-x-3 mr-2 mb-3 justify-between">
        <div className="flex flex-col gap-y-2">
          <TextInput
            id={`answer-${entry.id}`}
            label="Word"
            value={entry.answer}
            onValueChange={(val) => {
              clearErrors(index);
              onChange(entry.id, "answer", val);
            }}
            placeholder="Word (letters only, no spaces)"
            className="min-w-[300px]"
          />
        </div>
        <IconButton
          icon="mingcute:delete-2-line"
          variant="error"
          size="md"
          title="Delete entry"
          onClick={() => onDelete(entry.id)}
        />
      </div>
      <div className="flex flex-col gap-y-2">
        <label className="text-sm text-[var(--color-text-primary)]">Clue</label>
        <TextArea
          value={entry.clue}
          onChange={(val) => {
            clearErrors(index);
            onChange(entry.id, "clue", val);
          }}
          placeholder="Write the clue…"
          minHeight={90}
        />
      </div>
      {error && (
        <p className="text-xs text-[var(--color-error)] mt-3">
          {Array.isArray(error) ? error.join(", ") : error}
        </p>
      )}
    </div>
  );
}
