"use client";

import * as React from "react";
import {
  useActionState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Icon } from "@iconify/react";
import Button from "@/components/ui/buttons/Button";
import MetaFields from "./quiz-form-helper-components/MetaFields";
import VersionSelector from "./quiz-form-helper-components/VersionSelector";
import QuizVersionModal from "./quiz-form-helper-components/QuizVersionModal";
import WarningModal from "@/components/ui/WarningModal";
import TextInput from "@/components/ui/text-inputs/TextInput";
import TimerField from "./quiz-form-helper-components/TimerField";
import CrosswordBankEditor from "./quiz-form-helper-components/question-editors/CrosswordBankEditor";
import { useMetaAdders } from "@/services/quiz/quiz-form-helpers/hooks/useMetaAdders";
import {
  useFieldErrorMask,
  useIndexedErrorMask,
} from "@/services/quiz/quiz-form-helpers/hooks/useFieldErrorMask";
import {
  useRedirectOnSuccess,
  useEnterSubmitGuard,
} from "@/services/quiz/quiz-form-helpers/hooks/useFormUtils";
import { processQuiz } from "@/services/quiz/actions/process-quiz-action";
import { REDIRECT_TIMEOUT } from "@/utils/utils";
import { useToast } from "@/components/ui/toast/ToastProvider";
import type {
  CreateQuizState,
  CrosswordBankEntry,
  CrosswordBankInitial,
  CrosswordBankTopFields,
} from "@/services/quiz/types/quizTypes";
import type { FilterMeta } from "@/services/quiz/types/quiz-table-types";

type Props = {
  meta: FilterMeta;
  mode: "create" | "edit" | "draft";
  initialData?: CrosswordBankInitial;
  versions?: number[];
  currentVersion?: number;
  isClone?: boolean;
  typeColorHex?: string;
};

const MAX_BANK = 100;

function mkEntry(seed?: Partial<CrosswordBankEntry>): CrosswordBankEntry {
  return {
    id: seed?.id ?? crypto.randomUUID(),
    answer: seed?.answer ?? "",
    clue: seed?.clue ?? "",
  };
}

function normalizeEntriesForDiff(entries: CrosswordBankEntry[]) {
  return entries.map((entry) => ({
    answer: entry.answer.trim().toUpperCase(),
    clue: entry.clue.trim(),
  }));
}

function readNumber(fd: FormData, key: string, fallback: number) {
  const n = Number(fd.get(key));
  return Number.isFinite(n) ? n : fallback;
}

function clampWordsPerQuiz(value: number) {
  if (!Number.isFinite(value)) return 5;
  return Math.min(10, Math.max(5, Math.floor(value)));
}

export default function CrosswordBankQuizForm({
  meta,
  mode,
  initialData,
  versions,
  currentVersion,
  isClone = false,
  typeColorHex,
}: Props) {
  const initial: CreateQuizState = {
    ok: false,
    fieldErrors: {},
    questionErrors: [],
    values: {
      name: "",
      subject: "",
      topic: "",
      quizType: "crossword-bank",
      totalTimeLimit: initialData?.totalTimeLimit ?? null,
    },
  };
  const [state, formAction, pending] = useActionState(processQuiz, initial);
  const { showToast } = useToast();
  const lastToastRef = useRef<string | null>(null);
  const onFormKeyDown = useEnterSubmitGuard();
  useRedirectOnSuccess(state, REDIRECT_TIMEOUT);

  useEffect(() => {
    if (!state.message || state.message === lastToastRef.current) return;
    showToast({
      title: state.ok ? "Success" : "Error",
      description: state.message,
      variant: state.ok ? "success" : "error",
    });
    lastToastRef.current = state.message;
  }, [state.message, state.ok, showToast]);

  const { addSubject, addTopic } = useMetaAdders();
  const { clearFieldError, getVisibleFieldError } =
    useFieldErrorMask<CrosswordBankTopFields>(state.fieldErrors);
  const { visibleErrors, clearErrorAtIndex, removeErrorIndex } =
    useIndexedErrorMask(state.questionErrors);

  const [entries, setEntries] = useState<CrosswordBankEntry[]>(
    initialData?.entriesBank?.length
      ? initialData.entriesBank.map((entry) => mkEntry(entry))
      : [mkEntry()],
  );
  const [totalTime, setTotalTime] = useState<number | null>(
    state.values.totalTimeLimit ?? initialData?.totalTimeLimit ?? null,
  );
  const [wordsPerQuizInput, setWordsPerQuizInput] = useState<string>(
    String(clampWordsPerQuiz(initialData?.wordsPerQuiz ?? 5)),
  );
  const entriesBankJson = useMemo(() => JSON.stringify(entries), [entries]);

  const addRows = useCallback(
    (count = 1) => {
      const safeCount = Math.max(1, Math.floor(count));
      setEntries((prev) => {
        if (prev.length >= MAX_BANK) return prev;
        const remaining = Math.max(0, MAX_BANK - prev.length);
        const nextCount = Math.min(safeCount, remaining);
        if (!nextCount) return prev;
        return [...prev, ...Array.from({ length: nextCount }, () => mkEntry())];
      });
      clearFieldError("entriesBank");
    },
    [clearFieldError],
  );

  const updateEntry = useCallback(
    (
      id: string,
      field: "answer" | "clue",
      nextValue: string,
      index: number,
    ) => {
      setEntries((prev) =>
        prev.map((entry) => {
          if (entry.id !== id) return entry;
          if (field === "answer") {
            return {
              ...entry,
              answer: nextValue.toUpperCase().replace(/\s+/g, ""),
            };
          }
          return { ...entry, clue: nextValue };
        }),
      );
      clearFieldError("entriesBank");
      if (index >= 0) {
        clearErrorAtIndex(index);
      }
    },
    [clearErrorAtIndex, clearFieldError],
  );

  const [pendingDelete, setPendingDelete] = useState<{
    id: string;
    index: number;
  } | null>(null);
  const removeEntry = useCallback(
    (id: string, index: number) => {
      setEntries((prev) => {
        if (prev.length <= 1) return prev;
        return prev.filter((entry) => entry.id !== id);
      });
      removeErrorIndex(index);
      clearFieldError("entriesBank");
    },
    [clearFieldError, removeErrorIndex],
  );

  const importRows = useCallback(
    (rows: Array<{ answer: string; clue: string }>) => {
      if (!rows.length) return;

      const csvRows = rows.slice(0, MAX_BANK).map((row) => mkEntry(row));
      const minimumRows = clampWordsPerQuiz(Number(wordsPerQuizInput));
      const targetCount = Math.max(csvRows.length, minimumRows);
      const nextEntries = [
        ...csvRows,
        ...Array.from(
          { length: Math.max(0, targetCount - csvRows.length) },
          () => mkEntry(),
        ),
      ];

      setEntries(nextEntries);
      clearFieldError("entriesBank");
      for (let i = 0; i < Math.max(entries.length, nextEntries.length); i++) {
        clearErrorAtIndex(i);
      }

      if (rows.length > MAX_BANK) {
        showToast({
          title: "Imported with limit",
          description: `Imported ${MAX_BANK} CSV rows. Extra rows were skipped due to the ${MAX_BANK}-entry limit.`,
          variant: "error",
        });
        return;
      }

      if (csvRows.length < minimumRows) {
        showToast({
          title: "Import complete",
          description: `Loaded ${csvRows.length} CSV row(s) and added ${minimumRows - csvRows.length} blank row(s) to match words-per-quiz.`,
          variant: "success",
        });
        return;
      }

      showToast({
        title: "Import complete",
        description: `Imported ${csvRows.length} entries from CSV.`,
        variant: "success",
      });
    },
    [clearErrorAtIndex, clearFieldError, entries.length, showToast, wordsPerQuizInput],
  );

  const requestDeleteEntry = useCallback(
    (id: string, index: number) => {
      if (entries.length <= 1) return;
      setPendingDelete({ id, index });
    },
    [entries.length],
  );

  const editorErrors = useMemo(
    () => entries.map((_, index) => visibleErrors[index]),
    [entries, visibleErrors],
  );

  const formRef = useRef<HTMLFormElement | null>(null);
  const confirmedRef = useRef(false);
  const updateActiveSchedulesInputRef = useRef<HTMLInputElement | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [contentChanged, setContentChanged] = useState(false);

  const initialNorm = useMemo(
    () =>
      JSON.stringify({
        entries: normalizeEntriesForDiff(initialData?.entriesBank ?? []),
        wordsPerQuiz: initialData?.wordsPerQuiz ?? 5,
        totalTimeLimit: initialData?.totalTimeLimit ?? null,
      }),
    [initialData],
  );

  const handleSubmitGuard = useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
      if (mode !== "edit") return;
      if (confirmedRef.current) return;
      e.preventDefault();

      const fd = new FormData(formRef.current!);

      let metadataChanged = false;
      if (initialData) {
        const name = ((fd.get("name") as string) || "").trim();
        const subject = ((fd.get("subject") as string) || "").trim();
        const topic = ((fd.get("topic") as string) || "").trim();

        metadataChanged =
          name !== (initialData.name ?? "") ||
          subject !== (initialData.subject ?? "") ||
          topic !== (initialData.topic ?? "");
      }

      const currentNorm = JSON.stringify({
        entries: normalizeEntriesForDiff(entries),
        wordsPerQuiz: readNumber(fd, "wordsPerQuiz", 5),
        totalTimeLimit: totalTime,
      });

      const contentChangedNow = initialNorm !== currentNorm;
      setContentChanged(contentChangedNow);

      if (!metadataChanged && !contentChangedNow) {
        showToast({
          title: "No changes to save",
          description: "This quiz is identical to the current version.",
          variant: "error",
        });
        return;
      }

      setConfirmOpen(true);
    },
    [mode, initialData, entries, totalTime, initialNorm, showToast],
  );

  const handleVersionConfirm = useCallback((updateActiveSchedules: boolean) => {
    if (updateActiveSchedulesInputRef.current) {
      updateActiveSchedulesInputRef.current.value = String(
        updateActiveSchedules,
      );
    }
    confirmedRef.current = true;
    setConfirmOpen(false);
    formRef.current?.requestSubmit();
  }, []);

  const topDefaults = useMemo(
    () => ({
      name:
        state.values.name ||
        (mode === "edit" || mode === "draft" || isClone
          ? (initialData?.name ?? "")
          : ""),
      subject:
        state.values.subject ||
        (mode === "edit" || mode === "draft" || isClone
          ? (initialData?.subject ?? "")
          : ""),
      topic:
        state.values.topic ||
        (mode === "edit" || mode === "draft" || isClone
          ? (initialData?.topic ?? "")
          : ""),
    }),
    [state.values, mode, initialData, isClone],
  );

  const headerStyle =
    typeColorHex && typeColorHex.startsWith("#")
      ? { backgroundColor: `${typeColorHex}1A`, color: typeColorHex }
      : undefined;

  const submitLabel =
    mode === "edit"
      ? "Save Changes"
      : mode === "draft"
        ? "Save Draft"
        : isClone
          ? "Create Copy"
          : "Finalize Quiz";

  return (
    <div className="w-full max-w-[1400px] px-4">
      <form
        ref={formRef}
        onSubmit={handleSubmitGuard}
        action={formAction}
        onKeyDown={onFormKeyDown}
        noValidate
        className="grid grid-cols-1 gap-6 pb-40 lg:grid-cols-12"
      >
        <div className="space-y-4 lg:col-span-12">
          <div className="flex items-center justify-between gap-2">
            <span
              className="bg-[var(--color-primary)]/20 px-2 rounded-sm py-1 text-sm font-medium text-[var(--color-primary)]"
              style={headerStyle}
            >
              Crossword Bank Quiz
            </span>
          </div>

          <MetaFields
            meta={meta}
            defaults={topDefaults}
            errorFor={getVisibleFieldError}
            clearError={clearFieldError}
            onAddSubject={addSubject}
            onAddTopic={addTopic}
          />

          <div className="grid w-full gap-3 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-stretch">
            <div
              className={`flex h-full rounded-lg border border-[var(--color-bg4)] bg-[var(--color-bg2)]/40 px-4 ${
                mode === "edit" ? "items-center py-1" : "items-start py-3"
              }`}
            >
              {mode === "edit" ? (
                <VersionSelector
                  mode={mode}
                  versions={versions}
                  currentVersion={currentVersion ?? initialData?.version}
                />
              ) : (
                <div className="w-full max-w-sm">
                  <TextInput
                    id="wordsPerQuiz"
                    name="wordsPerQuiz"
                    type="number"
                    min={5}
                    max={10}
                    label="Words per generated quiz"
                    labelClassName="text-sm text-[var(--color-text-primary)]"
                    value={wordsPerQuizInput}
                    error={getVisibleFieldError("wordsPerQuiz")}
                    onChange={(e) => {
                      setWordsPerQuizInput(e.currentTarget.value);
                      clearFieldError("wordsPerQuiz");
                    }}
                  />
                  <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
                    Choose between 5 and 10 words per generated crossword.
                  </p>
                </div>
              )}
            </div>
            <div className="flex h-full w-full items-center gap-3 rounded-lg border border-[var(--color-bg4)] bg-[var(--color-bg2)]/40 px-4 py-3 xl:w-fit xl:justify-self-end">
              <div className="flex items-center gap-3">
                <Icon
                  icon="mingcute:time-line"
                  className="h-7 w-7 text-[var(--color-icon)]"
                />
                <div className="space-y-1">
                  <label className="text-sm text-[var(--color-text-primary)]">
                    Overall Timer
                  </label>
                  <p className="text-xs text-[var(--color-text-secondary)]">
                    Optional time limit for the generated crossword.
                  </p>
                </div>
              </div>
              <div className="hidden h-10 w-px bg-[var(--color-bg4)] xl:block" />
              <TimerField
                id="crossword-bank-total-time"
                name="totalTimeLimit"
                value={totalTime}
                onChange={(v) => {
                  setTotalTime(v);
                  clearFieldError("totalTimeLimit");
                }}
                min={60}
                max={7200}
                showIcon={false}
                layout="inputs-toggle-status"
                showStatusText
                statusTextOn="On"
                statusTextOff="No limit"
              />
            </div>
          </div>

          {mode === "edit" && (
            <div className="max-w-sm">
              <TextInput
                id="wordsPerQuiz"
                name="wordsPerQuiz"
                type="number"
                min={5}
                max={10}
                label="Words per generated quiz"
                labelClassName="text-sm text-[var(--color-text-primary)]"
                value={wordsPerQuizInput}
                error={getVisibleFieldError("wordsPerQuiz")}
                onChange={(e) => {
                  setWordsPerQuizInput(e.currentTarget.value);
                  clearFieldError("wordsPerQuiz");
                }}
              />
              <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
                Choose between 5 and 10 words per generated crossword.
              </p>
            </div>
          )}

          <div className="rounded-lg border border-[var(--color-bg4)] bg-[var(--color-bg2)]/30 p-4">
            <CrosswordBankEditor
              entries={entries}
              errors={editorErrors}
              maxEntries={MAX_BANK}
              onChangeEntry={updateEntry}
              onDeleteEntry={requestDeleteEntry}
              onAddRows={addRows}
              onImportRows={importRows}
            />
            {getVisibleFieldError("entriesBank") && (
              <p className="mt-3 text-xs text-[var(--color-error)]">
                {String(getVisibleFieldError("entriesBank"))}
              </p>
            )}
          </div>

          {getVisibleFieldError("totalTimeLimit") && (
            <p className="text-xs text-[var(--color-error)]">
              {String(getVisibleFieldError("totalTimeLimit"))}
            </p>
          )}

          <input type="hidden" name="quizType" value="crossword-bank" />
          <input type="hidden" name="entriesBankJson" value={entriesBankJson} />
          <input type="hidden" name="mode" value={mode} />
          {mode === "edit" && (
            <>
              <input
                type="hidden"
                name="quizId"
                value={initialData?.id ?? ""}
              />
              <input
                type="hidden"
                name="baseVersion"
                value={String(currentVersion ?? initialData?.version ?? 1)}
              />
              <input
                ref={updateActiveSchedulesInputRef}
                type="hidden"
                name="updateActiveSchedules"
                defaultValue="true"
              />
            </>
          )}

          <div className="mt-4 mb-10 flex justify-end gap-3">
            <Button
              type="submit"
              loading={pending || state.ok}
              className="min-w-[180px] min-h-[45px]"
            >
              {submitLabel}
            </Button>
          </div>
        </div>

        <QuizVersionModal
          open={confirmOpen}
          onCancel={() => setConfirmOpen(false)}
          onConfirm={handleVersionConfirm}
          contentChanged={contentChanged}
        />

        <WarningModal
          open={pendingDelete !== null}
          title="Delete this entry?"
          message="This word/clue pair will be removed from the bank."
          cancelLabel="Cancel"
          continueLabel="Delete"
          onCancel={() => setPendingDelete(null)}
          onContinue={() => {
            if (pendingDelete)
              removeEntry(pendingDelete.id, pendingDelete.index);
            setPendingDelete(null);
          }}
        />
      </form>
    </div>
  );
}
