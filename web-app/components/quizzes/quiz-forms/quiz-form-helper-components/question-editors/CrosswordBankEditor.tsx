"use client";

import * as React from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import Button from "@/components/ui/buttons/Button";
import IconButton from "@/components/ui/buttons/IconButton";
import TextInput from "@/components/ui/text-inputs/TextInput";
import { parseCrosswordBankCsv } from "@/services/quiz/quiz-form-helpers/csv-utils";

type Entry = {
  id: string;
  answer: string;
  clue: string;
};

type Props = {
  entries: Entry[];
  errors?: (string | string[] | undefined)[];
  maxEntries?: number;
  onAddRows: (count: number) => void;
  onChangeEntry: (
    id: string,
    field: "answer" | "clue",
    value: string,
    index: number
  ) => void;
  onDeleteEntry: (id: string, index: number) => void;
  onImportRows: (rows: Array<{ answer: string; clue: string }>) => void;
};

function errorText(err?: string | string[]) {
  if (!err) return null;
  return Array.isArray(err) ? err.join(" ") : err;
}

type RowProps = {
  entry: Entry;
  index: number;
  rowError: string | null;
  entriesLength: number;
  onChangeEntry: (
    id: string,
    field: "answer" | "clue",
    value: string,
    index: number
  ) => void;
  onDeleteEntry: (id: string, index: number) => void;
};

const CrosswordBankRow = React.memo(
  function CrosswordBankRow({
    entry,
    index,
    rowError,
    entriesLength,
    onChangeEntry,
    onDeleteEntry,
  }: RowProps) {
    return (
      <div className="grid grid-cols-[44px_minmax(0,240px)_minmax(0,1fr)_48px] gap-2 border-t border-[var(--color-bg4)] px-2 py-2">
        <div className="pt-3 text-center text-xs text-[var(--color-text-secondary)]">
          {index + 1}
        </div>
        <TextInput
          id={`crossword-bank-answer-${entry.id}`}
          placeholder="WORD"
          value={entry.answer}
          onValueChange={(value) =>
            onChangeEntry(entry.id, "answer", value, index)
          }
          className="uppercase"
        />
        <textarea
          id={`crossword-bank-clue-${entry.id}`}
          placeholder="Clue"
          value={entry.clue}
          onChange={(e) =>
            onChangeEntry(entry.id, "clue", e.target.value, index)
          }
          className={[
            "w-full rounded-md border border-[var(--color-bg4)]",
            "bg-[var(--color-bg2)] px-3 py-2 text-sm text-[var(--color-text-primary)]",
            "placeholder:text-[var(--color-text-tertiary)]",
            "hover:bg-[var(--color-bg2)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]",
            "h-11 min-h-11 max-h-40 resize-y",
          ].join(" ")}
        />
        <div className="pt-1.5">
          <IconButton
            icon="mingcute:delete-2-line"
            title="Delete entry"
            variant="error"
            size="sm"
            onClick={() => onDeleteEntry(entry.id, index)}
            disabled={entriesLength <= 1}
          />
        </div>

        {rowError && (
          <p className="col-span-4 pl-12 text-xs text-[var(--color-error)]">
            {rowError}
          </p>
        )}
      </div>
    );
  },
  (prev, next) =>
    prev.entry === next.entry &&
    prev.index === next.index &&
    prev.entriesLength === next.entriesLength &&
    prev.rowError === next.rowError,
);

export default function CrosswordBankEditor({
  entries,
  errors = [],
  maxEntries = 100,
  onAddRows,
  onChangeEntry,
  onDeleteEntry,
  onImportRows,
}: Props) {
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const [csvError, setCsvError] = React.useState<string | null>(null);
  const [csvNote, setCsvNote] = React.useState<string | null>(null);
  const [importing, setImporting] = React.useState(false);
  const listRef = React.useRef<HTMLDivElement | null>(null);

  const remaining = Math.max(0, maxEntries - entries.length);
  const canAdd = remaining > 0;
  const canAddTen = remaining > 1;

  const handleChangeEntry = React.useCallback(
    (id: string, field: "answer" | "clue", value: string, index: number) => {
      onChangeEntry(id, field, value, index);
    },
    [onChangeEntry]
  );

  const handleDeleteEntry = React.useCallback(
    (id: string, index: number) => {
      onDeleteEntry(id, index);
    },
    [onDeleteEntry]
  );

  const rowVirtualizer = useVirtualizer({
    count: entries.length,
    getScrollElement: () => listRef.current,
    estimateSize: () => 72,
    overscan: 4,
  });

  const handleImportFile = async (file: File | null) => {
    setCsvError(null);
    setCsvNote(null);
    if (!file) return;

    setImporting(true);
    try {
      const text = await file.text();
      const parsed = parseCrosswordBankCsv(text);

      if (!parsed.ok) {
        setCsvError(parsed.message);
        return;
      }

      onImportRows(parsed.rows);

      if (parsed.skippedRows > 0) {
        setCsvNote(
          `Imported valid rows. Skipped ${parsed.skippedRows} invalid row(s).`
        );
      }
    } catch (e: unknown) {
      const message =
        e instanceof Error ? e.message : "Failed to import CSV file.";
      setCsvError(message);
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">
            Word / Clue Bank
          </h2>
          <p className="text-xs text-[var(--color-text-secondary)]">
            {entries.length}/{maxEntries} entries
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => handleImportFile(e.target.files?.[0] ?? null)}
          />
          <Button
            type="button"
            variant="ghost"
            onClick={() => fileInputRef.current?.click()}
            loading={importing}
            className="px-3 py-1.5 text-sm"
          >
            Import CSV
          </Button>
        </div>
      </div>

      {csvError && <p className="text-xs text-[var(--color-error)]">{csvError}</p>}
      {csvNote && (
        <p className="text-xs text-[var(--color-text-secondary)]">{csvNote}</p>
      )}

      <div className="overflow-hidden rounded-md border border-[var(--color-bg4)]">
        <div className="grid grid-cols-[44px_minmax(0,240px)_minmax(0,1fr)_48px] gap-2 bg-[var(--color-bg2)]/60 px-2 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">
          <span className="text-center">#</span>
          <span>Word</span>
          <span>Clue</span>
          <span />
        </div>

        <div
          ref={listRef}
          className="max-h-[480px] overflow-y-auto bg-[var(--color-bg1)]"
          style={{ contain: "layout paint" }}
        >
          <div
            className="relative w-full"
            style={{ height: `${rowVirtualizer.getTotalSize()}px` }}
          >
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const index = virtualRow.index;
              const entry = entries[index];
              if (!entry) return null;
              const rowError = errorText(errors[index]);

              return (
                <div
                  key={entry.id}
                  ref={rowVirtualizer.measureElement}
                  data-index={index}
                  className="absolute left-0 top-0 w-full"
                  style={{ transform: `translateY(${virtualRow.start}px)` }}
                >
                  <CrosswordBankRow
                    entry={entry}
                    index={index}
                    rowError={rowError}
                    entriesLength={entries.length}
                    onChangeEntry={handleChangeEntry}
                    onDeleteEntry={handleDeleteEntry}
                  />
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-[var(--color-bg4)] bg-[var(--color-bg2)]/40 px-2 py-2">
          <Button
            type="button"
            variant="ghost"
            onClick={() => onAddRows(1)}
            disabled={!canAdd}
            className="px-3 py-1.5 text-sm"
          >
            Add Row
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => onAddRows(10)}
            disabled={!canAddTen}
            className="px-3 py-1.5 text-sm"
          >
            Add 10
          </Button>
        </div>
      </div>
    </section>
  );
}
