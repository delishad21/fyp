"use client";

/**
 * BasicQuizForm Component
 *
 * Purpose:
 *   - Provides a complete form for creating or editing a "Basic Quiz".
 *   - Manages quiz metadata (name, subject, topic), question items, and submission.
 *   - Integrates multiple child editors (MC, Open Ended, Context).
 *
 *   Versioning + schedules:
 *   - Any change (metadata or content) creates a NEW quiz version on save.
 *   - A confirmation modal asks whether to update active/scheduled quizzes
 *     to use the new version. If question content changed and the teacher
 *     opts in, attempts on those quizzes will be reset by downstream services.
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
  BaseFormItemDraft,
} from "@/services/quiz/types/quizTypes";
import { processQuiz } from "@/services/quiz/actions/process-quiz-action";
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
import { REDIRECT_TIMEOUT } from "@/utils/utils";
import { useToast } from "@/components/ui/toast/ToastProvider";
import TimerField from "./quiz-form-helper-components/TimerField";
import VersionSelector from "./quiz-form-helper-components/VersionSelector";
import QuizVersionModal from "./quiz-form-helper-components/QuizVersionModal";
import TutorialModal, { TutorialStep } from "@/components/ui/TutorialModal";
import WarningModal from "@/components/ui/WarningModal";
import { Icon } from "@iconify/react";

type Props = {
  meta: FilterMeta;
  mode: "create" | "edit" | "draft";
  initialData?: BasicInitial;
  versions?: number[];
  currentVersion?: number;
  /** When true, this is a "duplicate" flow (prefilled create). */
  isClone?: boolean;
  typeColorHex?: string;
  /** Optional custom submit handler (for draft mode) */
  onSubmit?: (data: Record<string, unknown>) => Promise<void>;
  /** Optional saving state (for draft mode) */
  saving?: boolean;
  /** Optional initial question index to select (for edit navigation from preview) */
  initialQuestionIndex?: number;
};

const MAX_QUESTIONS = 20;
const MAX_OPTIONS = 6;
const tutorialSteps: TutorialStep[] = [
  {
    title: "Introduction to Basic Quizzes",
    subtitle:
      "Basic quizzes mix Multiple Choice, Open Ended, and Context items. \
      Use this format for a straightforward quiz with a single overall timer.",
  },
  {
    title: "Set quiz details",
    subtitle:
      "Enter a name, subject, and topic so you can find the quiz later.",
    media: { src: "/tutorials/quiz-creation/basic/1.mp4" },
  },
  {
    title: "Set an overall timer",
    subtitle: "Optional: set a time limit for the entire quiz.",
    media: { src: "/tutorials/quiz-creation/basic/2.mp4" },
  },
  {
    title: "Add questions",
    subtitle:
      "Use the item selector to add and organize up to 20 items. Click '+' to add a new item, select the items to edit them \
       and use the delete button to remove the selected item. \
       Drag items in the selector to reorder them.",
    media: { src: "/tutorials/quiz-creation/basic/3.mp4" },
  },
  {
    title: "Choose an item type",
    subtitle: "For each item, choose Multiple Choice, Open Ended, or Context.",
    media: { src: "/tutorials/quiz-creation/basic/4.mp4" },
  },
  {
    title: "Fill in content",
    subtitle:
      "For all question types, enter the prompt and add an optional image.",
    media: { src: "/tutorials/quiz-creation/basic/5.mp4" },
  },
  {
    title: "Add answer options (Multiple Choice)",
    subtitle:
      "Add 2 to 6 answer options (text only). Mark one or more correct options; single-answer questions should have exactly one correct choice. \
      Students receive full credit only if they select all correct and no incorrect options; partial credit will be given based on the number of correct and incorrect selections.",
    media: { src: "/tutorials/quiz-creation/basic/6.mp4" },
  },
  {
    title: "Add correct answers (Open Ended)",
    subtitle:
      "Add one or more accepted answers. A response is given full credit if it matches any accepted answer. \
      Use the toggle to mark answers as case sensitive when needed.",
    media: { src: "/tutorials/quiz-creation/basic/7.mp4" },
  },
  {
    title: "Fill in content (Context)",
    subtitle:
      "Context items provide reading material for later questions. They are not graded and have no answers. \
      Add text and an optional image.",
    media: { src: "/tutorials/quiz-creation/basic/8.mp4" },
  },
  {
    title: "Create the quiz",
    subtitle: "Fix any errors, then submit to create the quiz.",
    media: { src: "/tutorials/quiz-creation/basic/9.mp4" },
  },
];

export default function BasicQuizForm({
  meta,
  mode,
  initialData,
  versions,
  currentVersion,
  isClone = false,
  typeColorHex,
  onSubmit: customOnSubmit,
  saving: customSaving,
  initialQuestionIndex,
}: Props) {
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
    initialCreateQuizState,
  );

  const [totalTime, setTotalTime] = useState<number | null>(
    state.values.totalTimeLimit ?? initialData?.totalTimeLimit ?? null,
  );

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

  // Redirect after success
  useRedirectOnSuccess(state, REDIRECT_TIMEOUT);

  // Prevent accidental Enter submit
  const onFormKeyDown = useEnterSubmitGuard();

  /** ---------------------------------------------------------------
   * Items hook (accepts initial items on edit/clone; enable soft caps)
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
    moveQuestion,

    setText,
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
    updateAnswer,
  } = useBaseQuizFormItems(initialItems, {
    maxQuestions: MAX_QUESTIONS,
    mcMaxOptions: MAX_OPTIONS,
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

  /** ---------------------------------------------------------------
   * Error masking (top-level fields + per-question)
   * -------------------------------------------------------------- */

  const { clearFieldError, getVisibleFieldError } = useFieldErrorMask<
    BasicTopFields | "totalTimeLimit"
  >(state.fieldErrors);

  const {
    visibleErrors: visibleQuestionErrors,
    clearErrorAtIndex,
    erroredIndexes,
    removeErrorIndex,
    moveErrorIndex,
  } = useIndexedErrorMask(state.questionErrors);

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

  const currentQuestionErrors = visibleQuestionErrors[currentIndex];

  /** ---------------------------------------------------------------
   * Prefill defaults for top fields
   * -------------------------------------------------------------- */
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

  /** ---------------------------------------------------------------
   * “Add new …” (server-backed) helpers
   * -------------------------------------------------------------- */
  const { addSubject, addTopic } = useMetaAdders();

  /** ---------------------------------------------------------------
   * Content-change detection (for messaging only, EDIT mode)
   * -------------------------------------------------------------- */
  const normalizeBasicItems = useCallback((raw: BaseFormItemDraft[]) => {
    return (raw || [])
      .map((it) => {
        if (it.type === "mc") {
          return {
            type: "mc",
            text: it.text ?? "",
            timeLimit: it.timeLimit ?? null,
            image: it.image?.url ?? null,
            options: (it.options ?? []).map((o) => ({
              text: o.text ?? "",
              correct: !!o.correct,
            })),
          };
        }
        if (it.type === "open") {
          return {
            type: "open",
            text: it.text ?? "",
            timeLimit: it.timeLimit ?? null,
            image: it.image?.url ?? null,
            answers: (it.answers ?? []).map((a) => ({
              text: a.text ?? "",
              caseSensitive: !!a.caseSensitive,
            })),
          };
        }
        if (it.type === "context") {
          return {
            type: "context",
            text: it.text ?? "",
            timeLimit: it.timeLimit ?? null,
            image: it.image?.url ?? null,
          };
        }
        return null;
      })
      .filter(Boolean);
  }, []);

  const initialContentNormJson = useMemo(() => {
    const initialItemsRaw = initialData?.items ?? [];
    return JSON.stringify({
      items: normalizeBasicItems(initialItemsRaw),
      totalTimeLimit: initialData?.totalTimeLimit ?? null,
    });
  }, [initialData?.items, initialData?.totalTimeLimit, normalizeBasicItems]);

  const currentContentNormJson = useMemo(
    () =>
      JSON.stringify({
        items: normalizeBasicItems(items as BaseFormItemDraft[]),
        totalTimeLimit: totalTime ?? null,
      }),
    [items, totalTime, normalizeBasicItems],
  );

  const contentChanged =
    mode === "edit" && initialData?.id
      ? initialContentNormJson !== currentContentNormJson
      : false;

  /** ---------------------------------------------------------------
   * Versioning / modal + submit guard (EDIT only)
   * -------------------------------------------------------------- */
  const formRef = useRef<HTMLFormElement | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const confirmedRef = useRef(false); // <-- ref instead of state
  const updateActiveSchedulesInputRef = useRef<HTMLInputElement | null>(null);

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
      if (confirmedRef.current) return; // already confirmed once; let it submit

      e.preventDefault();

      // Detect metadata changes via form values
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
    // write value directly into hidden input before submit
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

  /** ---------------------------------------------------------------
   * Labels / Submit texts
   * -------------------------------------------------------------- */
  const headerLabel = "Basic Quiz";
  const submitLabel =
    mode === "edit"
      ? "Save Changes"
      : mode === "draft"
        ? "Save Draft"
        : isClone
          ? "Create Copy"
          : "Finalize Quiz";
  const headerStyle =
    typeColorHex && typeColorHex.startsWith("#")
      ? { backgroundColor: `${typeColorHex}1A`, color: typeColorHex }
      : undefined;
  const hasNextQuestion = currentIndex < items.length - 1;
  const hasPrevQuestion = currentIndex > 0;
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
        {/* LEFT: fields */}
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
                triggerTitle="How to use the basic quiz form"
              />
            </div>
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

          {/* Overall timer */}
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
                    Drag items in the selector to reorder, set a timer if
                    needed, and add a mix of Multiple Choice + Open-Ended, or
                    Context items.
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
                    Optional time limit for the entire quiz.
                  </p>
                </div>
              </div>
              <div className="hidden h-10 w-px bg-[var(--color-bg4)] xl:block" />
              <TimerField
                id="basic-total-time"
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
          {getVisibleFieldError("totalTimeLimit") && (
            <p className="text-xs text-[var(--color-error)] px-1">
              {String(getVisibleFieldError("totalTimeLimit"))}
            </p>
          )}

          {/* Items + question editor */}
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
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex flex-wrap items-center gap-3">
                  <label className="text-sm text-[var(--color-text-primary)]">
                    Select Item Type
                  </label>
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
                <Button
                  type="button"
                  variant="error"
                  onClick={() => handleDeleteRequest(currentIndex)}
                  disabled={!canDeleteItem}
                  className="min-w-[140px] self-start"
                >
                  Delete Question
                </Button>
              </div>
              <div className="px-2">
                <div className="h-px w-full bg-[var(--color-bg4)]" />
              </div>

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
                  onUpdateAnswer={(id, updates) => {
                    clearErrorAtIndex(currentIndex);
                    updateAnswer(id, updates);
                  }}
                />
              )}

              {/* Per-question error banner */}
              {(() => {
                const err = currentQuestionErrors;
                if (!err) return null;
                return Array.isArray(err) ? (
                  <ul className="list-disc px-4 text-sm text-[var(--color-error)] space-y-0.5">
                    {err.map((m, i) => (
                      <li key={i}>{m}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="px-4 text-xs text-[var(--color-error)]">
                    {err}
                  </p>
                );
              })()}
            </div>
          </div>

          {/* Hidden payload (server action reads these) */}
          <input type="hidden" name="quizType" value="basic" />
          <input type="hidden" name="itemsJson" value={itemsJson} />
          <input type="hidden" name="mode" value={mode} />

          {mode === "edit" && initialData?.id && (
            <>
              {/* rootQuizId (family id) */}
              <input type="hidden" name="quizId" value={initialData.id} />
              {/* which version we edited from (used by backend as ?version=) */}
              {typeof initialData.version === "number" && (
                <input
                  type="hidden"
                  name="baseVersion"
                  value={initialData.version}
                />
              )}
              {/* whether to update active / scheduled quizzes */}
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

        {/* Version modal (edit mode) */}
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
