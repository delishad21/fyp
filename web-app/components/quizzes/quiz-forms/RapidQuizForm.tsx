"use client";

/**
 * RapidQuizForm Component
 *
 * Purpose:
 *   - Provides a form for creating or editing a "Rapid Quiz".
 *   - Manages quiz metadata (name, subject, topic) and a fixed set of MC-only questions.
 *   - Submits quiz data to the backend via a server action.
 *
 *   Versioning + schedules:
 *   - Any edit creates a NEW version of the quiz.
 *   - A confirmation modal asks whether to update active/scheduled quizzes
 *     to the new version. If question content changed and the teacher opts in,
 *     downstream services can reset attempts for those quizzes.
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
  BaseFormItemDraft,
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
import VersionSelector from "./quiz-form-helper-components/VersionSelector";
import QuizVersionModal from "./quiz-form-helper-components/QuizVersionModal";
import TutorialModal, { TutorialStep } from "@/components/ui/TutorialModal";

type Props = {
  meta: FilterMeta;
  mode: "create" | "edit";
  initialData?: RapidInitial;
  versions?: number[];
  currentVersion?: number;
  /** When true, this is a "duplicate" flow (prefilled create). */
  isClone?: boolean;
  typeColorHex?: string;
};

const MAX_QUESTIONS = 20;
const REQUIRED_OPTIONS = 4;
const tutorialSteps: TutorialStep[] = [
  {
    title: "Introduction to Rapid Quizzes",
    subtitle:
      "Rapid Quizzes are designed for quick-fire multiple choice questions, ideal for timed assessments and engaging learning activities. \
      This quiz type features per-question timers and focuses solely on 4 option multiple choice questions to keep the pace fast and dynamic.",
  },
  {
    title: "Set quiz details",
    subtitle: "Enter a name, subject, and topic to identify the quiz.",
    media: { src: "/tutorials/quiz-creation/rapid/1.mp4" },
  },
  {
    title: "Add questions",
    subtitle:
      "Use the question selector to add and organize up to 20 items. Press the '+' button to add a new question, and press on a question number to edit it. \
      Press the trash icon to delete the currently selected question.",
    media: { src: "/tutorials/quiz-creation/rapid/2.mp4" },
  },
  {
    title: "Fill in question content",
    subtitle:
      "Provide the question text, optionally upload an image, and set a time limit for each individual question.",
    media: { src: "/tutorials/quiz-creation/rapid/3.mp4" },
  },
  {
    title: "Add answer options and mark correct answers",
    subtitle:
      "Add exactly 4 answer options for each question. Each option can have text only. Select one or more correct options for the question to be valid. \
      For single-answer questions, only one option should be marked correct. \
      Students will be given full credit if they select ALL correct options and NO incorrect options. Partial credit is awarded based on the \
      number of correct and incorrect options chosen.",
    media: { src: "/tutorials/quiz-creation/rapid/4.mp4" },
  },
  {
    title: "Create the quiz",
    subtitle: "Review errors, then submit to create the quiz.",
    media: { src: "/tutorials/quiz-creation/rapid/5.mp4" },
  },
];

export default function RapidQuizForm({
  meta,
  mode,
  initialData,
  versions,
  currentVersion,
  isClone = false,
  typeColorHex,
}: Props) {
  // server action state
  const initial: CreateQuizState = {
    ok: false,
    fieldErrors: {},
    questionErrors: [],
    values: { name: "", subject: "", topic: "", quizType: "rapid" },
  };
  const [state, formAction, pending] = useActionState(processQuiz, initial);
  const { showToast } = useToast();
  const lastToastRef = useRef<string | null>(null);

  // Toast on state change
  useEffect(() => {
    if (!state.message) return;
    if (state.message === lastToastRef.current) return;

    showToast({
      title: state.ok ? "Success" : "Error",
      description: state.message,
      variant: state.ok ? "success" : "error",
    });

    lastToastRef.current = state.message;
  }, [state.message, state.ok, showToast]);

  // shared hooks
  useRedirectOnSuccess(state, REDIRECT_TIMEOUT);
  const onFormKeyDown = useEnterSubmitGuard();
  const { addSubject, addTopic } = useMetaAdders();

  // top field error masking
  const { clearFieldError, getVisibleFieldError } =
    useFieldErrorMask<RapidTopFields>(state.fieldErrors);

  function toRapidDraft(raw: BaseFormItemDraft): BaseFormItemDraft {
    return {
      id: raw.id ?? crypto.randomUUID(),
      type: "mc", // rapid is MC-only
      text: raw.text ?? "",
      timeLimit:
        typeof raw.timeLimit === "number" || raw.timeLimit === null
          ? raw.timeLimit
          : null,
      image: raw.image ?? null,
      options:
        (raw.options ?? []).map((o) => ({
          id: o.id ?? crypto.randomUUID(),
          text: o.text ?? "",
          correct: !!o.correct,
        })) ?? [],
      answers: undefined, // no open answers in rapid
    };
  }

  const initialItemsDraft: BaseFormItemDraft[] = React.useMemo(
    () => (initialData?.items ?? []).map(toRapidDraft),
    [initialData?.items]
  );

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
  } = useBaseQuizFormItems(initialItemsDraft, {
    maxQuestions: MAX_QUESTIONS,
    initialNumMCOptions: REQUIRED_OPTIONS,
  });

  // Per-question errors
  const { visibleErrors, clearErrorAtIndex, erroredIndexes, removeErrorIndex } =
    useIndexedErrorMask(state.questionErrors);
  const currentQuestionErrors = visibleErrors[currentIndex];

  const handleDeleteQuestion = (idx: number) => {
    deleteQuestion(idx);
    removeErrorIndex(idx);
  };

  /** ---------------------------------------------------------------
   * Edit-mode: detect QUESTION CONTENT changes
   * Used only to tweak modal copy; backend is source of truth.
   * -------------------------------------------------------------- */
  const formRef = useRef<HTMLFormElement | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const confirmedRef = useRef(false); // <-- ref instead of state
  const updateActiveSchedulesInputRef = useRef<HTMLInputElement | null>(null);

  function normalizeRapidItems(raw: BaseFormItemDraft[]) {
    return (raw || []).map((it) => ({
      type: "mc",
      text: it.text ?? "",
      timeLimit: it.timeLimit ?? null,
      image: it.image?.url ?? null,
      options: (it.options ?? []).map((o) => ({
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
      if (mode !== "edit") return; // only prompt on edit
      if (confirmedRef.current) return; // already confirmed

      e.preventDefault();

      // Detect metadata changes
      let metadataChanged = false;
      if (initialData && formRef.current) {
        const fd = new FormData(formRef.current);
        const name = ((fd.get("name") as string) || "").trim();
        const subject = ((fd.get("subject") as string) || "").trim();
        const topic = ((fd.get("topic") as string) || "").trim();

        metadataChanged =
          name !== (initialData.name ?? "") ||
          subject !== (initialData.subject ?? "") ||
          topic !== (initialData.topic ?? "");
      }

      const hasChanges = metadataChanged || contentChanged;

      if (!hasChanges) {
        showToast({
          title: "No changes to save",
          description: "This quiz is identical to the current version.",
          variant: "error",
        });
        return;
      }

      setConfirmOpen(true);
    },
    [mode, initialData, contentChanged, showToast]
  );

  const handleModalCancel = useCallback(() => {
    setConfirmOpen(false);
  }, []);

  const handleModalConfirm = useCallback((updateActiveSchedules: boolean) => {
    if (updateActiveSchedulesInputRef.current) {
      updateActiveSchedulesInputRef.current.value = updateActiveSchedules
        ? "true"
        : "false";
    }

    // mark as confirmed synchronously before requestSubmit
    confirmedRef.current = true;

    setConfirmOpen(false);
    formRef.current?.requestSubmit();
  }, []);

  const topDefaults = useMemo(
    () => ({
      name:
        state.values.name ||
        (mode === "edit" || isClone ? initialData?.name ?? "" : ""),
      subject:
        state.values.subject ||
        (mode === "edit" || isClone ? initialData?.subject ?? "" : ""),
      topic:
        state.values.topic ||
        (mode === "edit" || isClone ? initialData?.topic ?? "" : ""),
    }),
    [state.values, mode, initialData, isClone]
  );

  const headerLabel = "Rapid Quiz";
  const submitLabel =
    mode === "edit" ? "Save Changes" : isClone ? "Create Copy" : "Create Quiz";
  const headerStyle =
    typeColorHex && typeColorHex.startsWith("#")
      ? { backgroundColor: `${typeColorHex}1A`, color: typeColorHex }
      : undefined;

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
        {/* Header + version selector */}
        <div className="flex items-center justify-between gap-2">
          <span
            className="bg-[var(--color-primary)]/20 px-2 rounded-sm py-1 text-sm font-medium text-[var(--color-primary)]"
            style={headerStyle}
          >
            {headerLabel}
          </span>

          <div className="flex items-center gap-2">
            <TutorialModal
              steps={tutorialSteps}
              triggerLabel="How to Use"
              triggerIcon="mdi:help-circle-outline"
              triggerVariant="ghost"
              triggerClassName="gap-2 rounded-full px-3 py-1.5"
              triggerTitle="How to use the rapid quiz form"
            />
            <VersionSelector
              mode={mode}
              versions={versions}
              currentVersion={currentVersion ?? initialData?.version}
            />
          </div>
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

        <div className="flex flex-col gap-2">
          <label className="text-md text-[var(--color-text-primary)]">
            Question Selector
          </label>
          <div className="flex items-center gap-3">
            <QuestionSelector
              count={items.length}
              labels={selectorLabels}
              currentIndex={currentIndex}
              onAdd={addQuestion}
              onSelect={selectQuestion}
              max={MAX_QUESTIONS}
              onDelete={handleDeleteQuestion}
              errorIndexes={erroredIndexes}
            />
          </div>
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
            /* locked to 4 elsewhere */
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
          <>
            <input type="hidden" name="quizId" value={initialData.id} />
            {typeof initialData?.version === "number" && (
              <input
                type="hidden"
                name="baseVersion"
                value={initialData.version}
              />
            )}
            <input
              ref={updateActiveSchedulesInputRef}
              type="hidden"
              name="updateActiveSchedules"
              defaultValue="false"
            />
          </>
        )}

        {/* Submit */}
        <div className="flex mt-4 mb-10 justify-end">
          <Button
            type="submit"
            loading={pending || state.ok}
            className="min-w-[180px] min-h-[45px]"
          >
            {submitLabel}
          </Button>
        </div>
      </div>

      {mode === "edit" && (
        <QuizVersionModal
          open={confirmOpen}
          onCancel={handleModalCancel}
          onConfirm={handleModalConfirm}
          contentChanged={contentChanged}
        />
      )}
    </form>
  );
}
