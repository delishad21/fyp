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

type Props = {
  meta: FilterMeta;
  mode: "create" | "edit";
  initialData?: BasicInitial;
  versions?: number[];
  currentVersion?: number;
  /** When true, this is a "duplicate" flow (prefilled create). */
  isClone?: boolean;
  typeColorHex?: string;
};

const MAX_QUESTIONS = 20;
const MAX_OPTIONS = 6;
const tutorialSteps: TutorialStep[] = [
  {
    title: "Introduction to Basic Quizzes",
    subtitle:
      "Basic Quizzes allow you to create quizzes with Multiple Choice, Open Ended, and Context items. \
      This quiz type should be used when you want a straightforward quiz format, it has an overall timer, \
      and supports a variety of question types.",
  },
  {
    title: "Set quiz details",
    subtitle: "Enter a name, subject, and topic to identify the quiz.",
    media: { src: "/tutorials/quiz-creation/basic/1.mp4" },
  },
  {
    title: "Set an overall timer",
    subtitle: "Optionally, set a time limit for the entire quiz.",
    media: { src: "/tutorials/quiz-creation/basic/2.mp4" },
  },
  {
    title: "Add questions",
    subtitle:
      "Use the question selector to add and organize up to 20 items. Press the '+' button to add a new question, and press on a question number to edit it. \
      Press the trash icon to delete the currently selected question.",
    media: { src: "/tutorials/quiz-creation/basic/3.mp4" },
  },
  {
    title: "Choose a question type",
    subtitle:
      "For each question, switch between Multiple Choice, Open Ended, and Context.",
    media: { src: "/tutorials/quiz-creation/basic/4.mp4" },
  },
  {
    title: "Fill in question content (Mutliple Choice)",
    subtitle: "Provide the question text, and upload an optional image",
    media: { src: "/tutorials/quiz-creation/basic/5.mp4" },
  },
  {
    title: "Add answer options (Multiple Choice)",
    subtitle:
      "Add answer choices for the question. You must have at least 2 options and no more than 6. \
      Each option can have text only. \
      Select one or more correct options for the question to be valid. For single-answer questions, only one option should be marked correct. \
      Students will be given full credit if they select ALL correct options and NO incorrect options. Partial credit is awarded based on the \
      number of correct and incorrect options chosen.",
    media: { src: "/tutorials/quiz-creation/basic/6.mp4" },
  },
  {
    title: "Fill in question content (Open Ended)",
    subtitle: "Provide the question text and optional image.",
    media: { src: "/tutorials/quiz-creation/basic/7.mp4" },
  },
  {
    title: "Add correct answers (Open Ended)",
    subtitle:
      "Add one or more correct answers. \
      Students will be given full credit if their response matches any of the provided answers.\
      You can also specify whether each answer should be case sensitive.",
    media: { src: "/tutorials/quiz-creation/basic/8.mp4" },
  },
  {
    title: "Fill in question content (Context)",
    subtitle:
      "Context pages can be used to provide additional information or reading material for subsequent questions. \
      Context items do not have correct answers and are not graded. They can include text and an optional image.",
    media: { src: "/tutorials/quiz-creation/basic/9.mp4" },
  },
  {
    title: "Create the quiz",
    subtitle: "Review errors, then submit to create the quiz.",
    media: { src: "/tutorials/quiz-creation/basic/10.mp4" },
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
    initialCreateQuizState
  );

  const [totalTime, setTotalTime] = useState<number | null>(
    state.values.totalTimeLimit ?? initialData?.totalTimeLimit ?? null
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
    removeErrorIndex,
  } = useIndexedErrorMask(state.questionErrors);

  const handleDeleteQuestion = (idx: number) => {
    deleteQuestion(idx);
    removeErrorIndex(idx);
  };

  const currentQuestionErrors = visibleQuestionErrors[currentIndex];

  /** ---------------------------------------------------------------
   * Prefill defaults for top fields
   * -------------------------------------------------------------- */
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

  /** ---------------------------------------------------------------
   * “Add new …” (server-backed) helpers
   * -------------------------------------------------------------- */
  const { addSubject, addTopic } = useMetaAdders();

  /** ---------------------------------------------------------------
   * Content-change detection (for messaging only, EDIT mode)
   * -------------------------------------------------------------- */
  const normalizeBasicItems = useCallback((raw: any[]) => {
    return (raw || [])
      .map((it) => {
        if (it.type === "mc") {
          return {
            type: "mc",
            text: it.text ?? "",
            timeLimit: it.timeLimit ?? null,
            image: it.image?.url ?? null,
            options: (it.options ?? []).map((o: any) => ({
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
            answers: (it.answers ?? []).map((a: any) => ({
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
        items: normalizeBasicItems(items as any),
        totalTimeLimit: totalTime ?? null,
      }),
    [items, totalTime, normalizeBasicItems]
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
    (e: React.FormEvent<HTMLFormElement>) => {
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
    [mode, initialData, contentChanged, showToast]
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
      {/* LEFT: fields */}
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
              triggerTitle="How to use the basic quiz form"
            />
            <VersionSelector
              mode={mode}
              versions={versions}
              currentVersion={currentVersion ?? initialData?.version}
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
        <div className="flex items-end justify-between">
          <div className="flex flex-col gap-2">
            <label className="text-md text-[var(--color-text-primary)]">
              Question Selector
            </label>
            {/* Selector + type tabs */}
            <div className="flex flex-wrap items-center gap-3">
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
          </div>
          <TimerField
            id="basic-total-time"
            name="totalTimeLimit"
            value={totalTime}
            onChange={(v) => {
              setTotalTime(v);
              clearFieldError("totalTimeLimit" as any);
            }}
            min={60}
            max={7200}
          />
        </div>
        {getVisibleFieldError("totalTimeLimit" as any) && (
          <p className="text-xs text-[var(--color-error)]">
            {String(getVisibleFieldError("totalTimeLimit" as any))}
          </p>
        )}

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
          />
        )}

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

      {/* Version modal (edit mode) */}
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
