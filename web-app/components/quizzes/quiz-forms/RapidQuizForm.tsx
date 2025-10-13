"use client";

/**
 * RapidQuizForm Component
 *
 * Purpose:
 *   - Provides a form for creating or editing a "Rapid Quiz".
 *   - Manages quiz metadata (name, subject, topic) and a fixed set of MC-only questions.
 *   - Submits quiz data to the backend via a server action.
 *
 *     (Edit-mode safeguard):
 *   - Detects *question content* changes (not metadata) by normalizing the items
 *     and comparing to the initial snapshot. If changed, a WarningModal appears
 *     on submit indicating that previous attempts will be invalidated.
 *   - Backend remains the source of truth for invalidation (e.g., `contentHash`).
 *
 * Props:
 *   @param {FilterMeta} meta
 *     - Metadata containing available subjects and topics.
 *
 *   @param {"create"|"edit"} mode
 *     - Whether the form is used to create a new quiz or edit an existing one.
 *
 *   @param {RapidInitial} [initialData]
 *     - Optional initial quiz data for edit mode (includes id, metadata, and items).
 *
 * Behavior / Logic:
 *   - Uses `useActionState` with `processQuiz` for submission handling and validation.
 *   - Redirects after success using `useRedirectOnSuccess` with `REDIRECT_TIMEOUT`.
 *   - Disables accidental Enter key submits via `useEnterSubmitGuard`.
 *   - Uses `useMetaAdders` to support adding new subjects or topics dynamically.
 *   - Uses `useBaseQuizFormItems` to manage quiz items:
 *       • Multiple questions (up to MAX_QUESTIONS = 20).
 *       • Each question is locked to REQUIRED_OPTIONS = 4 MC options.
 *       • Timer cannot be disabled (`blockTimerDisable = true`).
 *   - Error handling:
 *       • `useFieldErrorMask` for metadata fields.
 *       • `useIndexedErrorMask` for per-question errors.
 *   - Prefills top-level metadata differently in create vs. edit modes.
 *
 * UI:
 *   - Header with quiz type ("Rapid Quiz").
 *   - <MetaFields> for name, subject, and topic.
 *   - <QuestionSelector> for navigating between questions.
 *   - Error list/banner for current question validation.
 *   - <MCOptionsEditor> for each question:
 *       • Text, timer, and optional image.
 *       • Exactly 4 options (locked).
 *       • Mark correct answers and edit option text.
 *   - Hidden inputs for quizType, itemsJson, mode, and quizId (if edit).
 *   - Submit button with loading state.
 *   - Server response message (success or error).
 *
 * Constraints:
 *   - Up to MAX_QUESTIONS (20).
 *   - Exactly REQUIRED_OPTIONS (4) per question.
 *   - Timer always enabled (cannot toggle off).
 */

import * as React from "react";
import {
  useActionState,
  useEffect,
  useRef,
  useState,
  useMemo,
  useCallback,
} from "react";
import Button from "@/components/ui/buttons/Button";
import { useBaseQuizFormItems } from "@/services/quiz/quiz-form-helpers/hooks/useBaseQuizFormItems";
import {
  useFieldErrorMask,
  useIndexedErrorMask,
} from "@/services/quiz/quiz-form-helpers/hooks/useFieldErrorMask";
import {
  useRedirectOnSuccess,
  useEnterSubmitGuard,
} from "@/services/quiz/quiz-form-helpers/hooks/useFormUtils";
import { useMetaAdders } from "@/services/quiz/quiz-form-helpers/hooks/useMetaAdders";
import { FilterMeta } from "@/services/quiz/types/quiz-table-types";
import {
  CreateQuizState,
  RapidInitial,
  RapidTopFields,
} from "@/services/quiz/types/quizTypes";
import MCOptionsEditor from "./quiz-form-helper-components/question-editors/MCOptionsEditor";
import MetaFields from "./quiz-form-helper-components/MetaFields";
import QuestionSelector from "./quiz-form-helper-components/question-selector/QuestionSelector";
import { processQuiz } from "@/services/quiz/actions/process-quiz-action";
import { REDIRECT_TIMEOUT } from "@/utils/utils";
import { useToast } from "@/components/ui/toast/ToastProvider";
import WarningModal from "@/components/ui/WarningModal";

type Props = {
  meta: FilterMeta;
  mode: "create" | "edit";
  initialData?: RapidInitial;
};

const MAX_QUESTIONS = 20;
const REQUIRED_OPTIONS = 4;

export default function RapidQuizForm({ meta, mode, initialData }: Props) {
  // server action state
  const initial: CreateQuizState = {
    ok: false,
    fieldErrors: {},
    questionErrors: [],
    values: { name: "", subject: "", topic: "", quizType: "rapid" },
  };
  const [state, formAction, pending] = useActionState(processQuiz, initial);
  const { showToast } = useToast();
  // Toast on state change
  useEffect(() => {
    if (!state.message) return;

    showToast({
      title: state.ok ? "Success" : "Error",
      description: state.message,
      variant: state.ok ? "success" : "error",
    });

    state.message = undefined;
  }, [state.message, state.ok, showToast]);
  // shared little hooks
  useRedirectOnSuccess(state, REDIRECT_TIMEOUT);
  const onFormKeyDown = useEnterSubmitGuard();
  const { addSubject, addTopic } = useMetaAdders();

  // top field error masking
  const { clearFieldError, getVisibleFieldError } =
    useFieldErrorMask<RapidTopFields>(state.fieldErrors);

  // items via the same hook Basic uses (constrained to Rapid’s shape)
  const initialItems = initialData?.items ?? [];

  const {
    items,
    currentIndex,
    current,
    selectorLabels,
    itemsJson,
    addQuestion,
    deleteQuestion,
    selectQuestion,
    setText,
    setTime,
    setImageMeta,
    setMCOptionText,
    toggleCorrect,
  } = useBaseQuizFormItems(initialItems, { initialNumMCOptions: 4 });

  // Per-question errors
  const { visibleErrors, clearErrorAtIndex, erroredIndexes } =
    useIndexedErrorMask(state.questionErrors);
  const currentQuestionErrors = visibleErrors[currentIndex];

  /** ---------------------------------------------------------------
   * Edit-mode safeguard: detect QUESTION CONTENT changes
   * (NOT metadata). If changed, show WarningModal on submit.
   * -------------------------------------------------------------- */
  const formRef = useRef<HTMLFormElement | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  function normalizeRapidItems(raw: any[]) {
    return (raw || []).map((it) => ({
      type: "mc",
      text: it.text ?? "",
      timeLimit: it.timeLimit ?? null,
      image: it.image?.url ?? null,
      options: (it.options ?? []).map((o: any) => ({
        text: o.text ?? "",
        correct: !!o.correct,
      })),
    }));
  }

  const initialItemsNormJson = useMemo(() => {
    const initialItemsRaw = initialData?.items ?? [];
    return JSON.stringify(normalizeRapidItems(initialItemsRaw));
  }, [initialData?.items]);

  const currentItemsNormJson = useMemo(
    () => JSON.stringify(normalizeRapidItems(items)),
    [items]
  );

  const contentChanged =
    mode === "edit" && initialData?.id
      ? initialItemsNormJson !== currentItemsNormJson
      : false;

  const handleSubmitGuard = useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
      if (mode !== "edit") return;
      if (!contentChanged) return;
      if (!confirmed) {
        e.preventDefault();
        setConfirmOpen(true);
      }
    },
    [mode, contentChanged, confirmed]
  );

  const onContinue = useCallback(() => {
    setConfirmOpen(false);
    setConfirmed(true);
    formRef.current?.requestSubmit();
  }, []);

  const onCancel = useCallback(() => setConfirmOpen(false), []);

  const topDefaults = React.useMemo(
    () => ({
      name:
        state.values.name || (mode === "edit" ? initialData?.name ?? "" : ""),
      subject:
        state.values.subject ||
        (mode === "edit" ? initialData?.subject ?? "" : ""),
      topic:
        state.values.topic || (mode === "edit" ? initialData?.topic ?? "" : ""),
    }),
    [state.values, mode, initialData]
  );

  const headerLabel = "Rapid Quiz";
  const submitLabel = mode === "edit" ? "Save Changes" : "Create Quiz";

  return (
    <form
      ref={formRef}
      onSubmit={handleSubmitGuard}
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
          defaults={topDefaults}
          errorFor={getVisibleFieldError}
          clearError={clearFieldError}
          onAddSubject={addSubject}
          onAddTopic={addTopic}
        />

        {/* Selector */}
        <div className="flex items-center gap-3">
          <QuestionSelector
            count={items.length}
            labels={selectorLabels}
            currentIndex={currentIndex}
            onAdd={addQuestion}
            onSelect={selectQuestion}
            max={MAX_QUESTIONS}
            onDelete={deleteQuestion}
            errorIndexes={erroredIndexes}
          />
        </div>

        {/* Per-question errors */}
        {(() => {
          const err = currentQuestionErrors;
          if (!err) return null;
          return Array.isArray(err) ? (
            <ul className="list-disc px-3 text-sm text-[var(--color-error)] space-y-0.5">
              {err.map((m, i) => (
                <li key={i}>{m}</li>
              ))}
            </ul>
          ) : (
            <p className="px-3 text-xs text-[var(--color-error)]">{err}</p>
          );
        })()}

        {/* Editor (MC only) */}
        <MCOptionsEditor
          text={current.text}
          timeLimit={current.timeLimit}
          image={current.image ?? null}
          onChangeText={(v) => {
            clearErrorAtIndex(currentIndex);
            setText(v);
          }}
          onChangeTime={(v) => {
            clearErrorAtIndex(currentIndex);
            setTime(v);
          }}
          onSetImage={(meta) => {
            clearErrorAtIndex(currentIndex);
            setImageMeta(meta);
          }}
          onDeleteImage={() => {
            clearErrorAtIndex(currentIndex);
            setImageMeta(null);
          }}
          options={current.options ?? []}
          onAdd={() => {
            /* locked to 4 elsewhere (keep UI simple here) */
          }}
          onRemove={() => {
            /* locked to 4 elsewhere */
          }}
          onSetText={(id, text) => {
            clearErrorAtIndex(currentIndex);
            setMCOptionText(id, text);
          }}
          onToggleCorrect={(id) => {
            clearErrorAtIndex(currentIndex);
            toggleCorrect(id);
          }}
          lockCount
          maxOptions={REQUIRED_OPTIONS}
          blockTimerDisable={true}
        />

        {/* Hidden payload */}
        <input type="hidden" name="quizType" value="rapid" />
        <input type="hidden" name="itemsJson" value={itemsJson} />
        <input type="hidden" name="mode" value={mode} />
        {mode === "edit" && initialData?.id && (
          <input type="hidden" name="quizId" value={initialData.id} />
        )}

        {/* Submit */}
        <div className="mt-4 mb-10 max-w-[180px] justify-self-end">
          <Button
            type="submit"
            loading={pending || state.ok}
            className="min-w-[180px] min-h-[45px]"
          >
            {submitLabel}
          </Button>
        </div>
      </div>

      {/* Warning modal for content changes in edit mode */}
      <WarningModal
        open={confirmOpen}
        title="Update will invalidate previous attempts"
        message={
          <>
            You changed one or more questions. Continue and invalidate attempts?
          </>
        }
        cancelLabel="Cancel"
        continueLabel="Continue"
        onCancel={onCancel}
        onContinue={onContinue}
      />
    </form>
  );
}
