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
import TimerField from "./quiz-form-helper-components/TimerField";
import QuestionSelector from "./quiz-form-helper-components/question-selector/QuestionSelector";
import TextArea from "@/components/ui/text-inputs/TextArea";
import Select from "@/components/ui/selectors/select/Select";
import ImageUpload from "@/components/ImageUpload";
import { uploadQuizImage } from "@/services/quiz/actions/quiz-image-upload-action";
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
  TrueFalseInitial,
  TrueFalseTopFields,
} from "@/services/quiz/types/quizTypes";
import type { FilterMeta } from "@/services/quiz/types/quiz-table-types";
import type { ImageMeta } from "@/services/images/types";

type TrueFalseDraftItem = {
  id: string;
  text: string;
  timeLimit: number | null;
  correctAnswer: "true" | "false";
  image: ImageMeta | null;
};

type Props = {
  meta: FilterMeta;
  mode: "create" | "edit" | "draft";
  onSubmit?: (data: Record<string, unknown>) => Promise<void>;
  saving?: boolean;
  initialData?: TrueFalseInitial;
  versions?: number[];
  currentVersion?: number;
  isClone?: boolean;
  typeColorHex?: string;
};

const MAX_QUESTIONS = 20;

function mkItem(seed?: Partial<TrueFalseDraftItem>): TrueFalseDraftItem {
  return {
    id: seed?.id ?? crypto.randomUUID(),
    text: seed?.text ?? "",
    timeLimit: typeof seed?.timeLimit === "number" ? seed.timeLimit : 10,
    correctAnswer: seed?.correctAnswer ?? "true",
    image: seed?.image ?? null,
  };
}

function normalizeIncomingItems(data?: TrueFalseInitial) {
  const raw = Array.isArray(data?.items) ? data.items : [];
  if (!raw.length) return [mkItem()];

  return raw.map((item) => {
    const trueOpt = (item.options ?? []).find(
      (opt) => String(opt?.text ?? "").trim().toLowerCase() === "true",
    );
    const falseOpt = (item.options ?? []).find(
      (opt) => String(opt?.text ?? "").trim().toLowerCase() === "false",
    );
    const correctAnswer =
      trueOpt?.correct || !falseOpt?.correct ? "true" : "false";

    return mkItem({
      id: item.id,
      text: item.text,
      timeLimit: typeof item.timeLimit === "number" ? item.timeLimit : 10,
      correctAnswer,
      image: item.image ?? null,
    });
  });
}

function toPayloadItems(items: TrueFalseDraftItem[]) {
  return items.map((item) => ({
    id: item.id,
    type: "mc" as const,
    text: item.text,
    timeLimit: item.timeLimit ?? 10,
    image: item.image ?? null,
    options: [
      {
        id: `${item.id}:true`,
        text: "True",
        correct: item.correctAnswer === "true",
      },
      {
        id: `${item.id}:false`,
        text: "False",
        correct: item.correctAnswer === "false",
      },
    ],
  }));
}

function normalizeForDiff(items: TrueFalseDraftItem[]) {
  return items.map((item) => ({
    text: item.text.trim(),
    timeLimit: item.timeLimit ?? 10,
    correctAnswer: item.correctAnswer,
    image: item.image?.url ?? null,
  }));
}

function reorder<T>(arr: T[], from: number, to: number) {
  if (from === to) return arr;
  const next = [...arr];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

export default function TrueFalseQuizForm({
  meta,
  mode,
  onSubmit: customOnSubmit,
  saving: customSaving,
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
    values: { name: "", subject: "", topic: "", quizType: "true-false" },
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

  const [items, setItems] = useState<TrueFalseDraftItem[]>(
    normalizeIncomingItems(initialData),
  );
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectorVertical, setSelectorVertical] = useState(true);
  const itemsJson = useMemo(() => JSON.stringify(toPayloadItems(items)), [items]);

  useEffect(() => {
    if (currentIndex >= items.length) {
      setCurrentIndex(Math.max(0, items.length - 1));
    }
  }, [currentIndex, items.length]);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const apply = () => setSelectorVertical(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  const current = items[currentIndex] ?? items[0];
  const selectorLabels = useMemo(() => items.map((_, idx) => idx + 1), [items]);

  const { addSubject, addTopic } = useMetaAdders();
  const { clearFieldError, getVisibleFieldError } =
    useFieldErrorMask<TrueFalseTopFields>(state.fieldErrors);
  const {
    visibleErrors,
    clearErrorAtIndex,
    erroredIndexes,
    removeErrorIndex,
    moveErrorIndex,
  } = useIndexedErrorMask(state.questionErrors);

  const addItem = () => {
    if (items.length >= MAX_QUESTIONS) return;
    setItems((prev) => [...prev, mkItem()]);
    setCurrentIndex(items.length);
  };

  const moveItem = (from: number, to: number) => {
    setItems((prev) => reorder(prev, from, to));
    moveErrorIndex(from, to);
    setCurrentIndex((prev) => {
      if (prev === from) return to;
      if (from < to && prev > from && prev <= to) return prev - 1;
      if (from > to && prev >= to && prev < from) return prev + 1;
      return prev;
    });
  };

  const updateCurrent = (patch: Partial<TrueFalseDraftItem>) => {
    if (!current) return;
    const idx = currentIndex;
    setItems((prev) =>
      prev.map((item, itemIndex) =>
        itemIndex === idx ? { ...item, ...patch } : item,
      ),
    );
    clearErrorAtIndex(idx);
  };

  const canDeleteItem = items.length > 1;
  const [pendingDeleteIndex, setPendingDeleteIndex] = useState<number | null>(
    null,
  );

  const deleteItemAtIndex = (idx: number) => {
    if (items.length <= 1) return;
    setItems((prev) => prev.filter((_, itemIndex) => itemIndex !== idx));
    removeErrorIndex(idx);
    setCurrentIndex((prev) => {
      if (idx < prev) return prev - 1;
      if (idx === prev) return Math.max(0, prev - 1);
      return prev;
    });
  };

  const formRef = useRef<HTMLFormElement | null>(null);
  const confirmedRef = useRef(false);
  const updateActiveSchedulesInputRef = useRef<HTMLInputElement | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [contentChanged, setContentChanged] = useState(false);

  const initialNorm = useMemo(
    () => JSON.stringify(normalizeForDiff(normalizeIncomingItems(initialData))),
    [initialData],
  );
  const currentNorm = useMemo(
    () => JSON.stringify(normalizeForDiff(items)),
    [items],
  );

  const handleSubmitGuard = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      if (mode === "draft" && customOnSubmit) {
        e.preventDefault();
        if (!formRef.current) return;
        const fd = new FormData(formRef.current);
        await customOnSubmit(Object.fromEntries(fd.entries()));
        return;
      }

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
    [mode, customOnSubmit, initialData, initialNorm, currentNorm, showToast],
  );

  const handleVersionConfirm = useCallback((updateActiveSchedules: boolean) => {
    if (updateActiveSchedulesInputRef.current) {
      updateActiveSchedulesInputRef.current.value = String(updateActiveSchedules);
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

  const hasPrevQuestion = currentIndex > 0;
  const hasNextQuestion = currentIndex < items.length - 1;
  const currentQuestionErrors = visibleErrors[currentIndex];
  const saving = mode === "draft" ? customSaving : pending || state.ok;

  return (
    <div className="w-full max-w-[1400px] px-4">
      <form
        ref={formRef}
        onSubmit={handleSubmitGuard}
        action={mode === "draft" ? undefined : formAction}
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
              True / False Quiz
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
                    Keep each statement short and unambiguous. Set a per-item
                    timer for fast true/false rounds.
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
                  Configure time for each true/false statement below.
                </p>
              </div>
            </div>
          </div>

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
                  onAdd={addItem}
                  onSelect={setCurrentIndex}
                  onReorder={moveItem}
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
                    id="true-false-item-time"
                    name="true-false-item-time"
                    value={current?.timeLimit ?? 10}
                    onChange={(next) => updateCurrent({ timeLimit: next })}
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
                  onClick={() => setPendingDeleteIndex(currentIndex)}
                  disabled={!canDeleteItem}
                  className="min-w-[140px]"
                >
                  Delete Question
                </Button>
              </div>
              <div className="px-2">
                <div className="h-px w-full bg-[var(--color-bg4)]" />
              </div>

              <div className="space-y-3">
                <div>
                  <label className="mb-2 block text-sm text-[var(--color-text-primary)]">
                    Question Text
                  </label>
                  <TextArea
                    value={current?.text ?? ""}
                    onChange={(next) => updateCurrent({ text: next })}
                    placeholder="Enter true/false statement..."
                    minHeight={140}
                  />
                </div>

                <ImageUpload
                  uploadFn={uploadQuizImage}
                  fileName={current?.image?.filename}
                  initialUrl={current?.image?.url}
                  onUploaded={(meta) => updateCurrent({ image: meta })}
                  onDelete={() => updateCurrent({ image: null })}
                />

                <div className="max-w-[280px]">
                  <Select
                    id={`true-false-correct-${current?.id ?? "current"}`}
                    label="Correct Answer"
                    labelClassName="text-sm text-[var(--color-text-primary)]"
                    options={[
                      { value: "true", label: "True" },
                      { value: "false", label: "False" },
                    ]}
                    value={current?.correctAnswer ?? "true"}
                    onChange={(value) =>
                      updateCurrent({
                        correctAnswer: value === "false" ? "false" : "true",
                      })
                    }
                    colorMode="never"
                    className="min-w-0"
                  />
                </div>
              </div>

              {(() => {
                const err = currentQuestionErrors;
                if (!err) return null;
                return Array.isArray(err) ? (
                  <ul className="list-disc px-3 text-sm text-[var(--color-error)] space-y-0.5">
                    {err.map((message, index) => (
                      <li key={index}>{message}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="px-3 text-xs text-[var(--color-error)]">{err}</p>
                );
              })()}
            </div>
          </div>

          <input type="hidden" name="quizType" value="true-false" />
          <input type="hidden" name="itemsJson" value={itemsJson} />
          <input type="hidden" name="mode" value={mode} />
          {mode === "edit" && (
            <>
              <input type="hidden" name="quizId" value={initialData?.id ?? ""} />
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

          <div className="flex mt-4 mb-10 justify-end gap-3">
            <Button
              type="button"
              variant="ghost"
              disabled={!hasPrevQuestion}
              onClick={() => {
                if (!hasPrevQuestion) return;
                setCurrentIndex(currentIndex - 1);
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
                  setCurrentIndex(currentIndex + 1);
                } else {
                  addItem();
                }
              }}
              className="min-w-[180px] min-h-[45px]"
            >
              {hasNextQuestion ? "Next Question" : "Add Question"}
            </Button>
            <Button
              type="submit"
              loading={saving}
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
          open={pendingDeleteIndex !== null}
          title="Delete this question?"
          message="This question will be removed from the quiz."
          cancelLabel="Cancel"
          continueLabel="Delete"
          onCancel={() => setPendingDeleteIndex(null)}
          onContinue={() => {
            if (pendingDeleteIndex !== null) {
              deleteItemAtIndex(pendingDeleteIndex);
            }
            setPendingDeleteIndex(null);
          }}
        />
      </form>
    </div>
  );
}
