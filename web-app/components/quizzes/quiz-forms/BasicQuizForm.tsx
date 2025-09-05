"use client";

/**
 * BasicQuizForm Component
 *
 * Purpose:
 *   - Provides a complete form for creating or editing a "Basic Quiz".
 *   - Manages quiz metadata (name, subject, topic), question items, and submission.
 *   - Integrates multiple child editors (MC, Open Ended, Context).
 *
 * Props:
 *   @param {FilterMeta} meta
 *     - Metadata for available subjects and topics (used in <MetaFields>).
 *
 *   @param {"create"|"edit"} mode
 *     - Whether the form is used to create a new quiz or edit an existing one.
 *
 *   @param {BasicInitial} [initialData]
 *     - Optional initial data for edit mode (includes quiz ID, name, subject, topic, and items).
 *
 * Behavior / Logic:
 *   - Uses `useActionState` with `processQuiz` server action to handle submit and validation.
 *   - Redirects on success after 1000ms (`useRedirectOnSuccess`).
 *   - Prevents accidental "Enter" submission in nested fields (`useEnterSubmitGuard`).
 *   - Uses `useBaseQuizFormItems` to manage dynamic list of questions:
 *       • Add, delete, and select questions.
 *       • Switch between MC, Open Ended, and Context question types.
 *       • Manage options (MC) and answers (Open).
 *   - Error handling:
 *       • `useFieldErrorMask` manages validation errors for top-level fields.
 *       • `useIndexedErrorMask` manages errors per question index.
 *   - Defaults are prefilled differently for create vs. edit modes.
 *   - `useMetaAdders` allows adding new subjects or topics from the server.
 *
 * UI:
 *   - Left panel (main content):
 *       • Header label ("Basic Quiz").
 *       • <MetaFields> for quiz name, subject, and topic.
 *       • <QuestionSelector> for navigating between questions.
 *       • <TypeTabs> for switching question type (MC, Open, Context).
 *       • Error banner if the current question has validation issues.
 *       • Conditional editor:
 *           – <ContextEditor> (context-only).
 *           – <MCOptionsEditor> (question + options).
 *           – <OpenAnswersEditor> (question + accepted answers).
 *       • Hidden inputs for `quizType`, `itemsJson`, `mode`, and `quizId` (if edit).
 *       • Submit button with loading state.
 *       • Server response message (success or error).
 *
 * Constraints:
 *   - Up to MAX_QUESTIONS (20).
 *   - MC questions limited to MAX_OPTIONS (6).
 *   - Minimum one question required.
 *
 */

import * as React from "react";
import { useActionState, useEffect } from "react";
import Button from "@/components/ui/buttons/Button";
import type { FilterMeta } from "@/services/quiz/types/quiz-table-types";
import QuestionSelector from "./quiz-form-helper-components/question-selector/QuestionSelector";
import TypeTabs from "./quiz-form-helper-components/TypeTabs";
import MetaFields from "./quiz-form-helper-components/MetaFields";
import MCOptionsEditor from "./quiz-form-helper-components/question-editors/MCOptionsEditor";
import OpenAnswersEditor from "./quiz-form-helper-components/question-editors/OpenAnswersEditor";
import ContextEditor from "./quiz-form-helper-components/question-editors/ContextEditor";
import {
  BasicInitial,
  BasicTopFields,
  CreateQuizState,
} from "@/services/quiz/types/quizTypes";
import { processQuiz } from "@/services/quiz/actions/process-quiz-action";
import { useBaseQuizFormItems } from "@/services/quiz/quiz-form-helpers/useBaseQuizFormItems";
import {
  useFieldErrorMask,
  useIndexedErrorMask,
} from "@/services/quiz/quiz-form-helpers/useFieldErrorMask";
import {
  useRedirectOnSuccess,
  useEnterSubmitGuard,
} from "@/services/quiz/quiz-form-helpers/useFormUtils";
import { useMetaAdders } from "@/services/quiz/quiz-form-helpers/useMetaAdders";
import { REDIRECT_TIMEOUT } from "@/utils/utils";
import { useToast } from "@/components/ui/toast/ToastProvider";

type Props = {
  meta: FilterMeta;
  mode: "create" | "edit";
  initialData?: BasicInitial;
};

const MAX_QUESTIONS = 20;
const MAX_OPTIONS = 6;

export default function BasicQuizForm({ meta, mode, initialData }: Props) {
  const initialCreateQuizState: CreateQuizState = {
    ok: false,
    fieldErrors: {},
    questionErrors: [],
    values: {
      name: "",
      subject: "",
      topic: "",
      quizType: "basic",
    },
  };

  const [state, formAction, pending] = useActionState(
    processQuiz,
    initialCreateQuizState
  );

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

  // Redirect after success (1000ms)
  useRedirectOnSuccess(state, REDIRECT_TIMEOUT);

  // Prevent accidental Enter submit
  const onFormKeyDown = useEnterSubmitGuard();

  /** ---------------------------------------------------------------
   * Items hook (accepts initial items on edit; enable soft caps)
   * -------------------------------------------------------------- */
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

    switchToOpen,
    switchToMc,
    switchToContext,

    addMCOption,
    removeMCOption,
    setMCOptionText,
    toggleCorrect,

    addOpenAnswer,
    removeOpenAnswer,
    setOpenAnswerText,
    toggleAnswerCaseSensitive,
  } = useBaseQuizFormItems(initialItems, {
    maxQuestions: MAX_QUESTIONS,
    mcMaxOptions: MAX_OPTIONS,
  });

  /** ---------------------------------------------------------------
   * Error masking (top-level fields + per-question)
   * -------------------------------------------------------------- */

  const { clearFieldError, getVisibleFieldError } =
    useFieldErrorMask<BasicTopFields>(state.fieldErrors);

  const {
    visibleErrors: visibleQuestionErrors,
    clearErrorAtIndex,
    erroredIndexes,
  } = useIndexedErrorMask(state.questionErrors);

  const currentQuestionErrors = visibleQuestionErrors[currentIndex];

  /** ---------------------------------------------------------------
   * Prefill defaults for top fields
   * -------------------------------------------------------------- */
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

  /** ---------------------------------------------------------------
   * “Add new …” (server-backed) helpers
   * -------------------------------------------------------------- */
  const { addSubject, addTopic } = useMetaAdders();

  /** ---------------------------------------------------------------
   * Labels / Submit texts
   * -------------------------------------------------------------- */
  const headerLabel = "Basic Quiz";
  const submitLabel = mode === "edit" ? "Save Changes" : "Create Quiz";

  return (
    <form
      onKeyDown={onFormKeyDown}
      noValidate
      action={formAction}
      className="grid grid-cols-1 gap-6 lg:grid-cols-12"
    >
      {/* LEFT: fields */}
      <div className="space-y-4 lg:col-span-8">
        <div className="flex items-center gap-2">
          <span className="bg-[var(--color-primary)]/20 px-2 rounded-sm py-1 text-sm font-medium text-[var(--color-primary)]">
            {headerLabel}
          </span>
        </div>

        {/* Top meta fields */}
        <MetaFields
          meta={meta}
          defaults={topDefaults}
          errorFor={getVisibleFieldError}
          clearError={clearFieldError}
          onAddSubject={addSubject}
          onAddTopic={addTopic}
        />

        {/* Selector + type tabs */}
        <div className="flex flex-wrap items-center gap-3">
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
          <div className="h-6 w-px bg-[var(--color-bg3)]" />
          <TypeTabs
            value={current.type}
            onChange={(t) => {
              clearErrorAtIndex(currentIndex);
              if (t === "open") switchToOpen();
              else if (t === "context") switchToContext();
              else switchToMc();
            }}
            options={[
              { value: "mc", label: "Multiple Choice" },
              { value: "open", label: "Open Ended" },
              { value: "context", label: "Context" },
            ]}
          />
        </div>

        {/* Per-question error banner */}
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

        {/* Editors by type (MC/Open include text+timer+image) */}
        {current.type === "context" ? (
          <ContextEditor
            text={current.text}
            image={current.image ?? null}
            onChangeText={(v) => {
              clearErrorAtIndex(currentIndex);
              setText(v);
            }}
            onSetImage={(meta) => {
              clearErrorAtIndex(currentIndex);
              setImageMeta(meta);
            }}
            onDeleteImage={() => {
              clearErrorAtIndex(currentIndex);
              setImageMeta(null);
            }}
          />
        ) : current.type === "mc" ? (
          <MCOptionsEditor
            // shared
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
            // options
            options={current.options ?? []}
            onAdd={() => {
              clearErrorAtIndex(currentIndex);
              addMCOption();
            }}
            onRemove={(id) => {
              clearErrorAtIndex(currentIndex);
              removeMCOption(id);
            }}
            onSetText={(id, text) => {
              clearErrorAtIndex(currentIndex);
              setMCOptionText(id, text);
            }}
            onToggleCorrect={(id) => {
              clearErrorAtIndex(currentIndex);
              toggleCorrect(id);
            }}
            maxOptions={MAX_OPTIONS}
          />
        ) : (
          <OpenAnswersEditor
            // shared
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
            // answers
            answers={current.answers ?? []}
            onAdd={() => {
              clearErrorAtIndex(currentIndex);
              addOpenAnswer();
            }}
            onRemove={(id) => {
              clearErrorAtIndex(currentIndex);
              removeOpenAnswer(id);
            }}
            onSetText={(id, text) => {
              clearErrorAtIndex(currentIndex);
              setOpenAnswerText(id, text);
            }}
            onToggleCaseSensitive={(id) => {
              clearErrorAtIndex(currentIndex);
              toggleAnswerCaseSensitive(id);
            }}
          />
        )}

        {/* Hidden payload (server action reads these) */}
        <input type="hidden" name="quizType" value="basic" />
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
    </form>
  );
}
