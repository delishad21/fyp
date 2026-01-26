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
import TimerField from "./quiz-form-helper-components/TimerField";
import { processQuiz } from "@/services/quiz/actions/process-quiz-action";
import { REDIRECT_TIMEOUT } from "@/utils/utils";
import { useToast } from "@/components/ui/toast/ToastProvider";
import VersionSelector from "./quiz-form-helper-components/VersionSelector";
import QuizVersionModal from "./quiz-form-helper-components/QuizVersionModal";
import TutorialModal, { TutorialStep } from "@/components/ui/TutorialModal";
import WarningModal from "@/components/ui/WarningModal";
import { Icon } from "@iconify/react";

type Props = {
  meta: FilterMeta;
  mode: "create" | "edit" | "draft";
  onSubmit?: (data: Record<string, unknown>) => Promise<void>;
  saving?: boolean;
  initialData?: RapidInitial;
  versions?: number[];
  currentVersion?: number;
  /** When true, this is a "duplicate" flow (prefilled create). */
  isClone?: boolean;
  typeColorHex?: string;
  /** Optional initial question index to select (for edit navigation from preview) */
  initialQuestionIndex?: number;
};

const MAX_QUESTIONS = 20;
const REQUIRED_OPTIONS = 4;
const tutorialSteps: TutorialStep[] = [
  {
    title: "Introduction to Rapid Quizzes",
    subtitle:
      "Rapid quizzes are fast, timed, multiple-choice only. \
      Each question has its own timer and exactly four options.",
  },
  {
    title: "Set quiz details",
    subtitle: "Enter a name, subject, and topic so you can find it later.",
    media: { src: "/tutorials/quiz-creation/rapid/1.mp4" },
  },
  {
    title: "Add questions",
    subtitle:
      "Use the item selector to add and organize up to 20 items. Click '+' to add a new item, select the items to edit them \
       and use the delete button to remove the selected item. \
       Drag items in the selector to reorder them.",
    media: { src: "/tutorials/quiz-creation/rapid/2.mp4" },
  },
  {
    title: "Fill in question content",
    subtitle:
      "Enter the question text, add an optional image, and set a time limit for the question.",
    media: { src: "/tutorials/quiz-creation/rapid/3.mp4" },
  },
  {
    title: "Add answer options and mark correct answers",
    subtitle:
      "Add exactly four text options. Mark one or more correct options; single-answer questions should have exactly one correct choice. \
      Students receive full credit only if they select all correct and no incorrect options; partial credit is based on their selections.",
    media: { src: "/tutorials/quiz-creation/rapid/4.mp4" },
  },
  {
    title: "Create the quiz",
    subtitle: "Fix any errors, then submit to create the quiz.",
    media: { src: "/tutorials/quiz-creation/rapid/5.mp4" },
  },
];

export default function RapidQuizForm({
  meta,
  mode,
  onSubmit: customOnSubmit,
  saving: customSaving,
  initialData,
  versions,
  currentVersion,
  isClone = false,
  typeColorHex,
  initialQuestionIndex,
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
    [initialData?.items],
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
    moveQuestion,
    setText,
    setTime,
    setImageMeta,
    setMCOptionText,
    toggleCorrect,
  } = useBaseQuizFormItems(initialItemsDraft, {
    maxQuestions: MAX_QUESTIONS,
    initialNumMCOptions: REQUIRED_OPTIONS,
  });

  // Select the initial question index if provided (from edit navigation)
  useEffect(() => {
    if (
      typeof initialQuestionIndex === "number" &&
      initialQuestionIndex >= 0 &&
      initialQuestionIndex < items.length
    ) {
      selectQuestion(initialQuestionIndex);
    }
  }, [initialQuestionIndex, items.length, selectQuestion]);

  // Per-question errors
  const {
    visibleErrors,
    clearErrorAtIndex,
    erroredIndexes,
    removeErrorIndex,
    moveErrorIndex,
  } = useIndexedErrorMask(state.questionErrors);
  const currentQuestionErrors = visibleErrors[currentIndex];

  const handleDeleteQuestion = (idx: number) => {
    deleteQuestion(idx);
    removeErrorIndex(idx);
  };

  const handleReorderQuestion = (from: number, to: number) => {
    moveQuestion(from, to);
    moveErrorIndex(from, to);
  };

  const canDeleteItem = items.length > 1;
  const [pendingDeleteIndex, setPendingDeleteIndex] = useState<number | null>(
    null,
  );

  const handleDeleteRequest = (idx: number) => {
    if (!canDeleteItem) return;
    setPendingDeleteIndex(idx);
  };

  const handleDeleteCancel = () => {
    setPendingDeleteIndex(null);
  };

  const handleDeleteConfirm = () => {
    if (pendingDeleteIndex === null) return;
    handleDeleteQuestion(pendingDeleteIndex);
    setPendingDeleteIndex(null);
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
    [items],
  );

  const contentChanged =
    mode === "edit" && initialData?.id
      ? initialItemsNormJson !== currentItemsNormJson
      : false;

  const handleSubmitGuard = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      // Draft mode: use custom handler if provided
      if (mode === "draft" && customOnSubmit) {
        e.preventDefault();
        if (!formRef.current) return;

        const fd = new FormData(formRef.current);
        const data = Object.fromEntries(fd.entries());
        await customOnSubmit(data);
        return;
      }

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
    [mode, customOnSubmit, initialData, contentChanged, showToast],
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

  const headerLabel = "Rapid Quiz";
  const submitLabel =
    mode === "edit"
      ? "Save Changes"
      : mode === "draft"
        ? "Save Draft"
        : isClone
          ? "Create Copy"
          : "Finalize Quiz";
  const hasNextQuestion = currentIndex < items.length - 1;
  const hasPrevQuestion = currentIndex > 0;
  const headerStyle =
    typeColorHex && typeColorHex.startsWith("#")
      ? { backgroundColor: `${typeColorHex}1A`, color: typeColorHex }
      : undefined;
  const [selectorVertical, setSelectorVertical] = useState(true);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const apply = () => setSelectorVertical(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  return (
    <div className="w-full max-w-[1400px] px-4">
      <form
        ref={formRef}
        onSubmit={handleSubmitGuard}
        onKeyDown={onFormKeyDown}
        noValidate
        action={mode === "draft" ? undefined : formAction}
        className="grid grid-cols-1 gap-6 pb-40 lg:grid-cols-12"
      >
        <div className="space-y-4 lg:col-span-12">
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

          {/* Quick tips + timer info */}
          <div className="grid w-full gap-3 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-stretch">
            <div className="flex h-full items-center rounded-lg border border-[var(--color-bg4)] bg-[var(--color-bg2)]/40 px-4 py-1">
              {mode === "edit" ? (
                <VersionSelector
                  mode={mode}
                  versions={versions}
                  currentVersion={currentVersion ?? initialData?.version}
                />
              ) : (
                <div className="space-y-0.5">
                  <span className="text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wide">
                    Quick Tips
                  </span>
                  <p
                    className="text-xs leading-4 text-[var(--color-text-secondary)] h-8 overflow-hidden"
                    style={{
                      display: "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical",
                    }}
                  >
                    Drag items in the selector to reorder. Add up to 20 Multiple
                    Choice questions, keep options concise, and set a timer per
                    question as needed.
                  </p>
                </div>
              )}
            </div>
            <div className="flex h-full w-full items-center gap-3 rounded-lg border border-[var(--color-bg4)] bg-[var(--color-bg2)]/40 px-4 py-3 xl:w-fit xl:justify-self-end">
              <Icon
                icon="mingcute:time-line"
                className="h-6 w-6 text-[var(--color-icon)]"
              />
              <div className="space-y-1">
                <label className="text-sm text-[var(--color-text-primary)]">
                  Per Question Timer
                </label>
                <p className="text-xs text-[var(--color-text-secondary)]">
                  Set a timer for each item below.
                </p>
              </div>
            </div>
          </div>

          {/* Items + editor */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[max-content_minmax(0,1fr)]">
            <div className="space-y-2">
              <label className="block text-center text-sm text-[var(--color-text-primary)] leading-4">
                Select
                <br />
                Items
              </label>
              <div className="rounded-lg border border-[var(--color-bg4)] bg-[var(--color-bg2)]/60 p-3">
                <QuestionSelector
                  count={items.length}
                  labels={selectorLabels}
                  ids={items.map((item) => item.id)}
                  currentIndex={currentIndex}
                  onAdd={addQuestion}
                  onSelect={selectQuestion}
                  onReorder={handleReorderQuestion}
                  max={MAX_QUESTIONS}
                  errorIndexes={erroredIndexes}
                  layout="grid"
                  gridRows={10}
                  direction={selectorVertical ? "vertical" : "horizontal"}
                  controlsPosition="none"
                  addInline
                />
              </div>
            </div>

            <div className="space-y-4 rounded-lg border border-[var(--color-bg4)] bg-[var(--color-bg2)]/30 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Icon
                    icon="mingcute:time-line"
                    className="h-6 w-6 text-[var(--color-icon)]"
                  />
                  <span className="text-sm text-[var(--color-text-primary)]">
                    Question Time Limit
                  </span>
                  <TimerField
                    id="rapid-item-time"
                    name="rapid-item-time"
                    value={current.timeLimit}
                    onChange={(v) => {
                      clearErrorAtIndex(currentIndex);
                      setTime(v);
                    }}
                    min={5}
                    max={600}
                    showIcon={false}
                    layout="inputs-toggle-status"
                    showStatusText
                    statusTextOn="On"
                    statusTextOff="No limit"
                    blockDisable
                  />
                </div>
                <Button
                  type="button"
                  variant="error"
                  onClick={() => handleDeleteRequest(currentIndex)}
                  disabled={!canDeleteItem}
                  className="min-w-[140px]"
                >
                  Delete Question
                </Button>
              </div>
              <div className="px-2">
                <div className="h-px w-full bg-[var(--color-bg4)]" />
              </div>

              {/* Editor (MC only) */}
              <MCOptionsEditor
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
                optionsGuide={
                  <>
                    Rapid quizzes use exactly 4 options.
                    <br />
                    1 correct = multiple choice (students pick one).
                    <br />
                    2+ correct = multiple response.
                    <br />
                    Full credit needs all correct and no wrong picks.
                  </>
                }
              />

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
                  <p className="px-3 text-xs text-[var(--color-error)]">
                    {err}
                  </p>
                );
              })()}
            </div>
          </div>

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

          {/* Previous/Next question + submit */}
          <div className="flex mt-4 mb-10 justify-end gap-3">
            <Button
              type="button"
              variant="ghost"
              disabled={!hasPrevQuestion}
              onClick={() => {
                if (!hasPrevQuestion) return;
                selectQuestion(currentIndex - 1);
              }}
              className="min-w-[180px] min-h-[45px]"
            >
              Previous Question
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={!hasNextQuestion && items.length >= MAX_QUESTIONS}
              onClick={() => {
                if (hasNextQuestion) {
                  selectQuestion(currentIndex + 1);
                } else {
                  addQuestion();
                  selectQuestion(items.length); // Navigate to the newly added question
                }
              }}
              className="min-w-[180px] min-h-[45px]"
            >
              {hasNextQuestion ? "Next Question" : "Add Question"}
            </Button>
            <Button
              type="submit"
              loading={mode === "draft" ? customSaving : pending || state.ok}
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
        <WarningModal
          open={pendingDeleteIndex !== null}
          title="Delete item?"
          message={
            pendingDeleteIndex !== null
              ? `Are you sure you want to delete ${
                  selectorLabels[pendingDeleteIndex] ?? "this item"
                }?`
              : undefined
          }
          cancelLabel="Cancel"
          continueLabel="Delete"
          onCancel={handleDeleteCancel}
          onContinue={handleDeleteConfirm}
        />
      </form>
    </div>
  );
}
