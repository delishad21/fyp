"use client";

/**
 * CrosswordQuizForm Component
 *
 * Purpose:
 *   - Provides a form for creating or editing a "Crossword Quiz".
 *   - Collects quiz metadata (name, subject, topic), overall timer, and word/clue entries.
 *   - Supports generating and previewing a crossword grid before submission.
 *
 * Props:
 *   @param {FilterMeta} meta
 *     - Metadata containing available subjects and topics.
 *
 *   @param {"create"|"edit"} mode
 *     - Whether the form is used to create a new crossword quiz or edit an existing one.
 *
 *   @param {CrosswordInitial} [initialData]
 *     - Optional quiz data for edit mode (id, metadata, grid, placed entries, and timer).
 *
 * Behavior / Logic:
 *   - Uses `useActionState` with `processQuiz` to handle submission, validation, and errors.
 *   - Redirects on success after `REDIRECT_TIMEOUT` (via `useRedirectOnSuccess`).
 *   - Prevents accidental form submission on Enter (`useEnterSubmitGuard`).
 *   - Supports adding new subjects/topics with `useMetaAdders`.
 *   - Tracks crossword entries (answer + clue) in local state.
 *   - Handles optional prefilled crossword grid & entries on edit:
 *       • If existing grid/placed entries are present, rehydrates preview.
 *       • Marks preview invalid if user edits entries afterward.
 *   - `handleGenerate`:
 *       • Calls server action `generateCrosswordPreview` with entries.
 *       • Populates crossword grid and placed entries if successful.
 *       • Displays error messages if generation fails.
 *   - Error handling:
 *       • `useFieldErrorMask` for metadata fields.
 *       • `useIndexedErrorMask` and local state for per-row entry errors.
 *
 * UI:
 *   - Header with quiz type ("Crossword Quiz").
 *   - <MetaFields> for top-level metadata (name, subject, topic).
 *   - Entry-level validation errors displayed as lists.
 *   - <TimerField> for setting overall quiz time limit.
 *   - <CrosswordAnswerEditor> for adding/editing/removing word/clue pairs (max 10).
 *   - Optional <CrosswordGrid> preview after generation.
 *   - Hidden fields:
 *       • quizType, entriesJson, gridJson, mode, and quizId (if edit).
 *   - Actions:
 *       • “Generate crossword” button (triggers preview generation).
 *       • Submit button (disabled until a crossword is generated).
 *   - Displays success/error messages after generation or submission.
 *
 * Constraints:
 *   - Max 10 entries allowed.
 *   - Timer must be between 60 seconds and 7200 seconds (2 hours).
 *   - Submission disabled until a crossword has been successfully generated.
 */

import * as React from "react";
import { useActionState, useEffect } from "react";
import Button from "@/components/ui/buttons/Button";
import { processQuiz } from "@/services/quiz/actions/process-quiz-action";
import {
  useFieldErrorMask,
  useIndexedErrorMask,
} from "@/services/quiz/quiz-form-helpers/useFieldErrorMask";
import {
  useRedirectOnSuccess,
  useEnterSubmitGuard,
} from "@/services/quiz/quiz-form-helpers/useFormUtils";
import { useMetaAdders } from "@/services/quiz/quiz-form-helpers/useMetaAdders";
import { FilterMeta } from "@/services/quiz/types/quiz-table-types";
import {
  Cell,
  CreateQuizState,
  CrosswordInitial,
  CrosswordPlacedEntry,
  CrosswordTopFields,
  Direction,
} from "@/services/quiz/types/quizTypes";
import MetaFields from "./quiz-form-helper-components/MetaFields";
import TimerField from "./quiz-form-helper-components/TimerField";
import CrosswordGrid from "../CrosswordGrid";
import { generateCrosswordPreview } from "@/services/quiz/actions/generate-crossword";
import CrosswordAnswerEditor from "./quiz-form-helper-components/question-editors/CrosswordAnswerEditor";
import { REDIRECT_TIMEOUT } from "@/utils/utils";
import { useToast } from "@/components/ui/toast/ToastProvider";

type Props = {
  meta: FilterMeta;
  mode: "create" | "edit";
  initialData?: CrosswordInitial;
};

const makeEntry = () => ({ id: crypto.randomUUID(), answer: "", clue: "" });

export default function CrosswordQuizForm({ meta, mode, initialData }: Props) {
  const initial: CreateQuizState = {
    ok: false,
    fieldErrors: {},
    questionErrors: [],
    values: {
      name: "",
      subject: "",
      topic: "",
      quizType: "crossword",
      totalTimeLimit: initialData?.totalTimeLimit ?? null,
    },
  };
  const [state, formAction, pending] = useActionState(processQuiz, initial);

  useRedirectOnSuccess(state, REDIRECT_TIMEOUT);
  const onFormKeyDown = useEnterSubmitGuard();
  const { addSubject, addTopic } = useMetaAdders();

  // entries & timer
  const [entries, setEntries] = React.useState(
    mode === "edit" && initialData?.entries?.length
      ? initialData.entries
      : [makeEntry()]
  );
  const [totalTime, setTotalTime] = React.useState<number | null>(
    state.values.totalTimeLimit ?? null
  );

  // generated state & data
  const [generated, setGenerated] = React.useState(false);
  const [genLoading, setGenLoading] = React.useState(false);
  const [genMessage, setGenMessage] = React.useState<string | null>(null);
  const [genGrid, setGenGrid] = React.useState<Cell[][] | null>(null);
  const [genEntries, setGenEntries] = React.useState<CrosswordPlacedEntry[]>(
    []
  );

  // local errors from generator
  const [genQuestionErrors, setGenQuestionErrors] = React.useState<
    (string[] | undefined)[]
  >([]);
  const [genFieldErrors, setGenFieldErrors] = React.useState<
    Record<string, string | string[] | undefined>
  >({});

  // action-state error helpers (refactored names)
  const { clearFieldError, getVisibleFieldError } =
    useFieldErrorMask<CrosswordTopFields>(state.fieldErrors);

  const { visibleErrors: visibleRowErrors, clearErrorAtIndex: clearRowError } =
    useIndexedErrorMask(state.questionErrors);

  // show toast on state change
  const { showToast } = useToast();
  useEffect(() => {
    const msg = genMessage || state.message;
    if (!msg) return;

    const isSuccess = (generated && genMessage) || state.ok;

    showToast({
      title: isSuccess ? "Success" : "Error",
      description: msg,
      variant: isSuccess ? "success" : "error",
    });

    setGenMessage(null);
    state.message = undefined;
  }, [genMessage, state.message, state.ok, generated, showToast]);

  // ---------------- Hydration + invalidate-after-edit guards ----------------
  const hydratedRef = React.useRef(false);
  const userEditedRef = React.useRef(false);

  React.useEffect(() => {
    if (mode !== "edit" || !initialData) return;

    const hasGrid =
      Array.isArray(initialData.grid) &&
      initialData.grid.length > 0 &&
      Array.isArray(initialData.grid[0]);

    const hasPlaced =
      Array.isArray(initialData.placedEntries) &&
      initialData.placedEntries.length > 0;

    if (hasGrid && hasPlaced) {
      const placed: CrosswordPlacedEntry[] = initialData.placedEntries!.map(
        (e) => ({
          ...e,
          direction:
            e.direction === "across"
              ? "across"
              : e.direction === "down"
              ? "down"
              : null,
          positions: Array.isArray(e.positions)
            ? e.positions.map((p) => ({
                row: Number(p.row ?? 0),
                col: Number(p.col ?? 0),
              }))
            : [],
        })
      );

      setGenGrid(initialData.grid!);
      setGenEntries(placed);
      setGenerated(true);
      setGenMessage(null);
      hydratedRef.current = true;
      userEditedRef.current = false;
    } else {
      setGenerated(false);
      setGenGrid(null);
      setGenEntries([]);
      hydratedRef.current = false;
      userEditedRef.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, initialData?.id]);

  const lastEntriesJsonRef = React.useRef<string>(
    JSON.stringify(
      entries.map(({ id, answer, clue }) => ({ id, answer, clue }))
    )
  );
  React.useEffect(() => {
    const currentJson = JSON.stringify(
      entries.map(({ id, answer, clue }) => ({ id, answer, clue }))
    );

    if (currentJson !== lastEntriesJsonRef.current) {
      if (hydratedRef.current) {
        userEditedRef.current = true;
      }
      lastEntriesJsonRef.current = currentJson;
    }

    if (userEditedRef.current) {
      setGenerated(false);
      setGenGrid(null);
      setGenEntries([]);
      setGenQuestionErrors([]);
      setGenFieldErrors({});
    }
  }, [entries]);

  const entriesForGen = React.useMemo(
    () => entries.map(({ id, answer, clue }) => ({ id, answer, clue })),
    [entries]
  );

  const entriesJson = React.useMemo(() => {
    const payload = generated ? genEntries : entriesForGen;
    return JSON.stringify(payload);
  }, [generated, genEntries, entriesForGen]);

  const gridJson = React.useMemo(
    () => (generated && genGrid ? JSON.stringify(genGrid) : ""),
    [generated, genGrid]
  );

  async function handleGenerate() {
    setGenLoading(true);
    setGenMessage(null);
    setGenQuestionErrors([]);
    setGenFieldErrors({});

    const result = await generateCrosswordPreview({
      entries,
      gridSize: 20,
    });

    if (!result.ok) {
      setGenMessage(result.message);
      setGenFieldErrors(result.fieldErrors ?? {});
      setGenQuestionErrors(result.questionErrors ?? []);
      setGenerated(false);
      setGenGrid(null);
      setGenEntries([]);
    } else {
      setGenGrid(result.grid);
      setGenEntries(result.entries);
      setGenerated(true);
      setGenMessage("Crossword generated!");
      hydratedRef.current = true;
      userEditedRef.current = false;
      lastEntriesJsonRef.current = JSON.stringify(
        entries.map(({ id, answer, clue }) => ({ id, answer, clue }))
      );
    }

    setGenLoading(false);
  }

  const headerLabel = "Crossword Quiz";
  const submitLabel = mode === "edit" ? "Save Changes" : "Create Quiz";

  const rowErrorsToShow = (i: number) =>
    visibleRowErrors[i] || genQuestionErrors[i];

  return (
    <form
      onKeyDown={onFormKeyDown}
      noValidate
      action={formAction}
      className="grid grid-cols-1 gap-6 lg:grid-cols-12"
    >
      <div className="space-y-4 lg:col-span-8">
        <div className="flex items-center gap-2">
          <span className="bg-[var(--color-primary)]/20 px-2 rounded-sm py-1 text-sm font-medium text-[var(--color-primary)]">
            {headerLabel}
          </span>
        </div>

        {/* Top meta */}
        <MetaFields
          meta={meta}
          defaults={{
            name:
              state.values.name ||
              (mode === "edit" ? initialData?.name ?? "" : ""),
            subject:
              state.values.subject ||
              (mode === "edit" ? initialData?.subject ?? "" : ""),
            topic:
              state.values.topic ||
              (mode === "edit" ? initialData?.topic ?? "" : ""),
          }}
          errorFor={(k) => getVisibleFieldError(k) || genFieldErrors[k]}
          clearError={(k) => {
            clearFieldError(k as any);
            setGenFieldErrors((prev) => ({ ...prev, [k]: undefined }));
          }}
          onAddSubject={addSubject}
          onAddTopic={addTopic}
        />

        {/* Entries-level error */}
        {(() => {
          const e =
            (getVisibleFieldError("entries") as any) ||
            genFieldErrors["entries"];
          if (!e) return null;
          return Array.isArray(e) ? (
            <ul
              className="list-disc pl-5 text-xs text-[var(--color-error)] space-y-0.5"
              aria-live="polite"
            >
              {e.map((msg, i) => (
                <li key={i}>{msg}</li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-[var(--color-error)]" aria-live="polite">
              {e}
            </p>
          );
        })()}

        {/* Overall timer */}
        <div className="flex items-end justify-between">
          <label className="text-md text-[var(--color-text-primary)]">
            Overall Timer
          </label>
          <TimerField
            id="crossword-total-time"
            name="totalTimeLimit"
            value={totalTime}
            onChange={(v) => {
              setTotalTime(v);
              clearFieldError("totalTimeLimit");
            }}
            min={60}
            max={7200}
          />
        </div>
        {getVisibleFieldError("totalTimeLimit") && (
          <p className="text-xs text-[var(--color-error)]">
            {String(getVisibleFieldError("totalTimeLimit"))}
          </p>
        )}

        {/* Answers & clues editor */}
        <CrosswordAnswerEditor
          entries={entries}
          errors={entries.map((_, i) => rowErrorsToShow(i))}
          maxEntries={10}
          onChange={(id, field, value) => {
            setEntries((prev) =>
              prev.map((it) => (it.id === id ? { ...it, [field]: value } : it))
            );
          }}
          onDelete={(id) => {
            setEntries((prev) => prev.filter((e) => e.id !== id));
          }}
          onAdd={() => {
            setEntries((prev) =>
              prev.length < 10
                ? [...prev, { id: crypto.randomUUID(), answer: "", clue: "" }]
                : prev
            );
          }}
          clearErrors={clearRowError}
        />

        {/* Generated preview */}
        {genGrid ? (
          <div className="mt-4">
            <h3 className="text-sm font-medium mb-2 text-[var(--color-text-primary)]">
              Generated Crossword
            </h3>
            <CrosswordGrid grid={genGrid} entries={genEntries} cellSize={40} />
          </div>
        ) : null}

        {/* Hidden payloads */}
        <input type="hidden" name="quizType" value="crossword" />
        <input type="hidden" name="entriesJson" value={entriesJson} />
        <input type="hidden" name="mode" value={mode} />
        <input type="hidden" name="gridJson" value={gridJson} />
        {mode === "edit" && initialData?.id && (
          <input type="hidden" name="quizId" value={initialData.id} />
        )}

        {/* Actions */}
        <div className="mt-4 mb-10 flex items-center gap-3 justify-end">
          <Button
            type="button"
            onClick={handleGenerate}
            loading={genLoading}
            className="max-w-[180px] min-h-[45px]"
          >
            Generate crossword
          </Button>

          <Button
            type="submit"
            loading={pending || state.ok}
            disabled={!generated}
            className="max-w-[180px] min-h-[45px]"
          >
            {submitLabel}
          </Button>
        </div>
      </div>
    </form>
  );
}
