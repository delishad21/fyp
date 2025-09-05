"use client";

/**
 * CrosswordAnswerEditor Component
 *
 * Purpose:
 *   - Manages and displays a list of crossword entries (answers + clues).
 *   - Provides UI for adding, editing, deleting entries with error feedback.
 *
 * Props:
 *   @param {CrosswordEntry[]} entries - Current list of crossword entries.
 *   @param {(string|string[]|undefined)[]} [errors=[]] - Row-aligned error messages.
 *   @param {number} [maxEntries=10] - Maximum number of word entries allowed.
 *   @param {(id: string, field: "answer" | "clue", value: string) => void} onChange - Handler when an entry field changes.
 *   @param {(id: string) => void} onDelete - Handler to remove an entry by id.
 *   @param {() => void} onAdd - Handler to add a new entry.
 *   @param {(index: number) => void} clearErrors - Clears error(s) for a specific row.
 *   @param {string} [className] - Optional extra class for container.
 *   @param {React.ReactNode} [header] - Optional custom header text.
 *   @param {boolean} [disabled=false] - Disables inputs and "Add" button when true.
 *
 * Behavior / Logic:
 *   - Displays header showing current count and max allowed.
 *   - Disables "Add word" button when count >= maxEntries or disabled.
 *   - If no entries, shows placeholder message prompting to add first item.
 *   - Otherwise maps entries to `<CrosswordEntryRow>` with error handling.
 *
 * UI:
 *   - Header with title, entry count, and "Add word" button (with plus icon).
 *   - List of crossword entry rows stacked vertically with spacing.
 *   - Styled messages and consistent theming via CSS variables.
 */

import * as React from "react";
import { Icon } from "@iconify/react";
import Button from "@/components/ui/buttons/Button";
import CrosswordEntryRow from "./CrosswordEntryRow";
import { CrosswordEntry } from "@/services/quiz/types/quizTypes";

type Props = {
  entries: CrosswordEntry[];
  errors?: (string | string[] | undefined)[];
  maxEntries?: number;
  onChange: (id: string, field: "answer" | "clue", value: string) => void;
  onDelete: (id: string) => void;
  onAdd: () => void;
  clearErrors: (index: number) => void;
  className?: string;
  header?: React.ReactNode;
  disabled?: boolean;
};

export default function CrosswordAnswerEditor({
  entries,
  errors = [],
  maxEntries = 10,
  onChange,
  onDelete,
  onAdd,
  clearErrors,
  className,
  header,
  disabled = false,
}: Props) {
  return (
    <section className={className}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-[var(--color-text-primary)]">
            {header ?? "Words & Clues"}
          </span>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-md text-[var(--color-text-primary])]">
            {entries.length}/{maxEntries}
          </span>
          <Button
            type="button"
            onClick={onAdd}
            disabled={entries.length >= maxEntries || disabled}
            className="gap-2 max-w-[150px]"
          >
            <Icon icon="mingcute:add-line" className="w-4 h-4" />
            Add word
          </Button>
        </div>
      </div>

      {/* List */}
      <div className="space-y-3">
        {entries.length === 0 ? (
          <div className="text-sm text-[var(--color-text-secondary)]">
            No entries yet. Click <span className="font-medium">Add word</span>{" "}
            to create your first item.
          </div>
        ) : (
          entries.map((entry, i) => (
            <CrosswordEntryRow
              key={entry.id}
              index={i}
              entry={entry}
              error={errors[i]}
              onChange={onChange}
              onDelete={onDelete}
              clearErrors={clearErrors}
            />
          ))
        )}
      </div>
    </section>
  );
}
