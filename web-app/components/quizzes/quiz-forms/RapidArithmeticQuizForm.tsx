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
import IconButton from "@/components/ui/buttons/IconButton";
import ToggleButton from "@/components/ui/buttons/ToggleButton";
import VersionSelector from "./quiz-form-helper-components/VersionSelector";
import QuizVersionModal from "./quiz-form-helper-components/QuizVersionModal";
import TextInput from "@/components/ui/text-inputs/TextInput";
import Select from "@/components/ui/selectors/select/Select";
import TimerField from "./quiz-form-helper-components/TimerField";
import { useFieldErrorMask } from "@/services/quiz/quiz-form-helpers/hooks/useFieldErrorMask";
import {
  useRedirectOnSuccess,
  useEnterSubmitGuard,
} from "@/services/quiz/quiz-form-helpers/hooks/useFormUtils";
import { processQuiz } from "@/services/quiz/actions/process-quiz-action";
import { REDIRECT_TIMEOUT } from "@/utils/utils";
import { useToast } from "@/components/ui/toast/ToastProvider";
import type {
  CreateQuizState,
  RapidArithmeticInitial,
  RapidArithmeticOperationSettings,
  RapidArithmeticTopFields,
} from "@/services/quiz/types/quizTypes";
import type { FilterMeta } from "@/services/quiz/types/quiz-table-types";

type Props = {
  meta: FilterMeta;
  mode: "create" | "edit" | "draft";
  initialData?: RapidArithmeticInitial;
  versions?: number[];
  currentVersion?: number;
  isClone?: boolean;
  typeColorHex?: string;
};

const OPERATOR_BUTTONS: Array<{
  value: "+" | "-" | "*" | "/";
  label: string;
  icon: string;
}> = [
  { value: "+", label: "Add", icon: "mdi:plus" },
  { value: "-", label: "Minus", icon: "mdi:minus" },
  { value: "*", label: "Multiply", icon: "mdi:multiplication" },
  { value: "/", label: "Divide", icon: "mdi:division" },
];

const TIMES_TABLE_OPTIONS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

function readNumber(fd: FormData, key: string, fallback: number) {
  const n = Number(fd.get(key));
  return Number.isFinite(n) ? n : fallback;
}

function pickLockedValue(
  options: Array<{ label: string; value: string; colorHex?: string }>,
  candidates: string[],
  fallback: string,
) {
  const loweredCandidates = candidates.map((x) => x.toLowerCase());
  const found = options.find((opt) => {
    const value = String(opt.value ?? "").trim().toLowerCase();
    const label = String(opt.label ?? "").trim().toLowerCase();
    return (
      loweredCandidates.includes(value) || loweredCandidates.includes(label)
    );
  });
  return {
    value: found?.value ?? fallback,
    label: found?.label ?? fallback,
    colorHex: found?.colorHex,
  };
}

function defaultOperationSettings(): RapidArithmeticOperationSettings {
  return {
    addition: {
      operandMin: 0,
      operandMax: 20,
      answerMin: 0,
      answerMax: 40,
      allowNegative: false,
    },
    subtraction: {
      operandMin: 0,
      operandMax: 20,
      answerMin: 0,
      answerMax: 20,
      allowNegative: false,
    },
    multiplication: {
      mode: "times-table",
      tables: [...TIMES_TABLE_OPTIONS],
      multiplierMin: 2,
      multiplierMax: 12,
      operandMin: 0,
      operandMax: 20,
      answerMin: 0,
      answerMax: 400,
    },
    division: {
      divisorMin: 2,
      divisorMax: 12,
      quotientMin: 0,
      quotientMax: 20,
      answerMin: 0,
      answerMax: 20,
      allowNegative: false,
    },
  };
}

function normalizeOperationSettings(
  raw?: Partial<RapidArithmeticOperationSettings>,
): RapidArithmeticOperationSettings {
  const defaults = defaultOperationSettings();

  const add = raw?.addition;
  const sub = raw?.subtraction;
  const mul = raw?.multiplication;
  const div = raw?.division;

  const tablesRaw = Array.isArray(mul?.tables) ? mul.tables : defaults.multiplication.tables;
  const normalizedTables = Array.from(
    new Set(
      tablesRaw
        .map((n) => Number(n))
        .filter((n) => Number.isFinite(n) && n >= 2 && n <= 20),
    ),
  ).sort((a, b) => a - b);

  return {
    addition: {
      operandMin: Number.isFinite(Number(add?.operandMin))
        ? Number(add?.operandMin)
        : defaults.addition.operandMin,
      operandMax: Number.isFinite(Number(add?.operandMax))
        ? Number(add?.operandMax)
        : defaults.addition.operandMax,
      answerMin: Number.isFinite(Number(add?.answerMin))
        ? Number(add?.answerMin)
        : defaults.addition.answerMin,
      answerMax: Number.isFinite(Number(add?.answerMax))
        ? Number(add?.answerMax)
        : defaults.addition.answerMax,
      allowNegative: Boolean(add?.allowNegative ?? defaults.addition.allowNegative),
    },
    subtraction: {
      operandMin: Number.isFinite(Number(sub?.operandMin))
        ? Number(sub?.operandMin)
        : defaults.subtraction.operandMin,
      operandMax: Number.isFinite(Number(sub?.operandMax))
        ? Number(sub?.operandMax)
        : defaults.subtraction.operandMax,
      answerMin: Number.isFinite(Number(sub?.answerMin))
        ? Number(sub?.answerMin)
        : defaults.subtraction.answerMin,
      answerMax: Number.isFinite(Number(sub?.answerMax))
        ? Number(sub?.answerMax)
        : defaults.subtraction.answerMax,
      allowNegative: Boolean(
        sub?.allowNegative ?? defaults.subtraction.allowNegative,
      ),
    },
    multiplication: {
      mode: mul?.mode === "range" ? "range" : "times-table",
      tables: normalizedTables.length
        ? normalizedTables
        : [...defaults.multiplication.tables],
      multiplierMin: Number.isFinite(Number(mul?.multiplierMin))
        ? Number(mul?.multiplierMin)
        : defaults.multiplication.multiplierMin,
      multiplierMax: Number.isFinite(Number(mul?.multiplierMax))
        ? Number(mul?.multiplierMax)
        : defaults.multiplication.multiplierMax,
      operandMin: Number.isFinite(Number(mul?.operandMin))
        ? Number(mul?.operandMin)
        : defaults.multiplication.operandMin,
      operandMax: Number.isFinite(Number(mul?.operandMax))
        ? Number(mul?.operandMax)
        : defaults.multiplication.operandMax,
      answerMin: Number.isFinite(Number(mul?.answerMin))
        ? Number(mul?.answerMin)
        : defaults.multiplication.answerMin,
      answerMax: Number.isFinite(Number(mul?.answerMax))
        ? Number(mul?.answerMax)
        : defaults.multiplication.answerMax,
    },
    division: {
      divisorMin: Number.isFinite(Number(div?.divisorMin))
        ? Number(div?.divisorMin)
        : defaults.division.divisorMin,
      divisorMax: Number.isFinite(Number(div?.divisorMax))
        ? Number(div?.divisorMax)
        : defaults.division.divisorMax,
      quotientMin: Number.isFinite(Number(div?.quotientMin))
        ? Number(div?.quotientMin)
        : defaults.division.quotientMin,
      quotientMax: Number.isFinite(Number(div?.quotientMax))
        ? Number(div?.quotientMax)
        : defaults.division.quotientMax,
      answerMin: Number.isFinite(Number(div?.answerMin))
        ? Number(div?.answerMin)
        : defaults.division.answerMin,
      answerMax: Number.isFinite(Number(div?.answerMax))
        ? Number(div?.answerMax)
        : defaults.division.answerMax,
      allowNegative: Boolean(div?.allowNegative ?? defaults.division.allowNegative),
    },
  };
}

function settingsForDiff(settings: RapidArithmeticOperationSettings) {
  return {
    ...settings,
    multiplication: {
      ...settings.multiplication,
      tables: [...settings.multiplication.tables].sort((a, b) => a - b),
    },
  };
}

export default function RapidArithmeticQuizForm({
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
    values: { name: "", subject: "", topic: "", quizType: "rapid-arithmetic" },
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

  const { clearFieldError, getVisibleFieldError } =
    useFieldErrorMask<RapidArithmeticTopFields>(state.fieldErrors);

  const lockedSubject = useMemo(() => {
    const picked = pickLockedValue(
      meta.subjects,
      ["math", "mathematics"],
      "Math",
    );
    return {
      ...picked,
      colorHex: picked.colorHex || "#ef4444",
    };
  }, [meta.subjects]);

  const lockedTopic = useMemo(
    () => pickLockedValue(meta.topics, ["arithmetic", "arithmetics"], "Arithmetic"),
    [meta.topics],
  );

  const [operators, setOperators] = useState<Array<"+" | "-" | "*" | "/">>(
    initialData?.operators?.length
      ? initialData.operators
      : ["+", "-", "*", "/"],
  );
  const [questionCountInput, setQuestionCountInput] = useState<string>(
    String(initialData?.questionCount ?? 10),
  );
  const [choicesPerQuestionInput, setChoicesPerQuestionInput] = useState<string>(
    String(initialData?.choicesPerQuestion ?? 4),
  );
  const [timePerQuestion, setTimePerQuestion] = useState<number | null>(
    initialData?.timePerQuestion ?? 12,
  );
  const [operationSettings, setOperationSettings] =
    useState<RapidArithmeticOperationSettings>(() =>
      normalizeOperationSettings(initialData?.operationSettings),
    );

  const operatorsJson = useMemo(() => JSON.stringify(operators), [operators]);
  const operationSettingsJson = useMemo(
    () => JSON.stringify(operationSettings),
    [operationSettings],
  );

  const toggleOperator = (value: "+" | "-" | "*" | "/") => {
    setOperators((prev) => {
      const exists = prev.includes(value);
      if (exists) {
        if (prev.length === 1) return prev;
        return prev.filter((op) => op !== value);
      }
      return [...prev, value];
    });
    clearFieldError("operators");
    clearFieldError("operationSettings");
  };

  const updateAddition = (patch: Partial<RapidArithmeticOperationSettings["addition"]>) => {
    setOperationSettings((prev) => ({
      ...prev,
      addition: { ...prev.addition, ...patch },
    }));
    clearFieldError("operationSettings");
  };

  const updateSubtraction = (
    patch: Partial<RapidArithmeticOperationSettings["subtraction"]>,
  ) => {
    setOperationSettings((prev) => ({
      ...prev,
      subtraction: { ...prev.subtraction, ...patch },
    }));
    clearFieldError("operationSettings");
  };

  const updateMultiplication = (
    patch: Partial<RapidArithmeticOperationSettings["multiplication"]>,
  ) => {
    setOperationSettings((prev) => ({
      ...prev,
      multiplication: { ...prev.multiplication, ...patch },
    }));
    clearFieldError("operationSettings");
  };

  const updateDivision = (
    patch: Partial<RapidArithmeticOperationSettings["division"]>,
  ) => {
    setOperationSettings((prev) => ({
      ...prev,
      division: { ...prev.division, ...patch },
    }));
    clearFieldError("operationSettings");
  };

  const toggleTimesTable = (table: number) => {
    updateMultiplication({
      tables: (() => {
        const next = new Set(operationSettings.multiplication.tables);
        if (next.has(table)) {
          if (next.size === 1) return [...next];
          next.delete(table);
        } else {
          next.add(table);
        }
        return Array.from(next).sort((a, b) => a - b);
      })(),
    });
  };

  const formRef = useRef<HTMLFormElement | null>(null);
  const confirmedRef = useRef(false);
  const updateActiveSchedulesInputRef = useRef<HTMLInputElement | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [contentChanged, setContentChanged] = useState(false);

  const initialConfigJson = useMemo(
    () =>
      JSON.stringify({
        questionCount: initialData?.questionCount ?? 10,
        operators: initialData?.operators ?? ["+", "-", "*", "/"],
        timePerQuestion: initialData?.timePerQuestion ?? 12,
        choicesPerQuestion: initialData?.choicesPerQuestion ?? 4,
        operationSettings: settingsForDiff(
          normalizeOperationSettings(initialData?.operationSettings),
        ),
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

      const currentConfig = {
        questionCount: readNumber(fd, "questionCount", 10),
        operators,
        timePerQuestion: timePerQuestion ?? 12,
        choicesPerQuestion: readNumber(fd, "choicesPerQuestion", 4),
        operationSettings: settingsForDiff(operationSettings),
      };
      const contentChangedNow =
        initialConfigJson !== JSON.stringify(currentConfig);
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
    [
      initialConfigJson,
      initialData,
      mode,
      operationSettings,
      operators,
      showToast,
      timePerQuestion,
    ],
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

  const addEnabled = operators.includes("+");
  const subEnabled = operators.includes("-");
  const mulEnabled = operators.includes("*");
  const divEnabled = operators.includes("/");

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
              Rapid Arithmetic Quiz
            </span>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] items-start">
            <div className="min-w-0">
              <TextInput
                id="name"
                name="name"
                label="Name"
                labelClassName="text-sm text-[var(--color-text-primary)]"
                placeholder="Quiz Name"
                required
                defaultValue={topDefaults.name ?? ""}
                error={getVisibleFieldError("name")}
                onChange={() => clearFieldError("name")}
              />
            </div>
            <div className="min-w-0">
              <Select
                id="subject"
                name="subject"
                label="Subject"
                labelClassName="text-sm text-[var(--color-text-primary)]"
                options={[
                  {
                    label: lockedSubject.label,
                    value: lockedSubject.value,
                    colorHex: lockedSubject.colorHex,
                  },
                ]}
                value={lockedSubject.value}
                disabled
                colorMode="always"
                className="min-w-0"
              />
            </div>
            <div className="min-w-0">
              <TextInput
                id="topic"
                name="topic"
                label="Topic"
                labelClassName="text-sm text-[var(--color-text-primary)]"
                value={lockedTopic.value}
                readOnly
                className="text-[var(--color-text-secondary)]"
              />
            </div>
          </div>

          {mode === "edit" && (
            <div className="w-fit rounded-lg border border-[var(--color-bg4)] bg-[var(--color-bg2)]/40 px-4 py-3">
              <VersionSelector
                mode={mode}
                versions={versions}
                currentVersion={currentVersion ?? initialData?.version}
              />
            </div>
          )}

          <div className="grid w-full gap-3 xl:grid-cols-[max-content_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] xl:items-stretch">
            <div className="h-full w-fit rounded-lg border border-[var(--color-bg4)] bg-[var(--color-bg2)]/40 px-4 py-3">
              <div className="space-y-3">
                <label className="block text-sm text-[var(--color-text-primary)]">
                  Operations
                </label>
                <div className="flex flex-nowrap gap-3">
                  {OPERATOR_BUTTONS.map((op) => {
                    const selected = operators.includes(op.value);
                    return (
                      <div
                        key={op.value}
                        className="flex w-[78px] shrink-0 flex-col items-center gap-1"
                      >
                        <IconButton
                          icon={op.icon}
                          title={op.label}
                          variant={selected ? "success" : "ghost"}
                          size={40}
                          onClick={() => toggleOperator(op.value)}
                          className={
                            selected
                              ? ""
                              : "text-[var(--color-text-secondary)] border-[var(--color-bg4)]"
                          }
                        />
                        <span className="text-xs text-[var(--color-text-secondary)]">
                          {op.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
                {getVisibleFieldError("operators") && (
                  <p className="text-xs text-[var(--color-error)]">
                    {String(getVisibleFieldError("operators"))}
                  </p>
                )}
              </div>
            </div>

            <div className="flex h-full flex-col justify-center rounded-lg border border-[var(--color-bg4)] bg-[var(--color-bg2)]/40 px-4 py-3">
              <div className="mb-2 flex items-center gap-2">
                <Icon
                  icon="mingcute:hashtag-line"
                  className="h-5 w-5 text-[var(--color-icon)]"
                />
                <span className="text-sm text-[var(--color-text-primary)]">
                  Questions per quiz
                </span>
              </div>
              <TextInput
                id="questionCount"
                name="questionCount"
                type="number"
                min={1}
                max={20}
                label=""
                value={questionCountInput}
                error={getVisibleFieldError("questionCount")}
                onValueChange={(value) => {
                  setQuestionCountInput(value);
                  clearFieldError("questionCount");
                }}
              />
            </div>

            <div className="flex h-full flex-col justify-center rounded-lg border border-[var(--color-bg4)] bg-[var(--color-bg2)]/40 px-4 py-3">
              <div className="mb-2 flex items-center gap-2">
                <Icon
                  icon="mingcute:list-check-line"
                  className="h-5 w-5 text-[var(--color-icon)]"
                />
                <span className="text-sm text-[var(--color-text-primary)]">
                  Choices per question
                </span>
              </div>
              <TextInput
                id="choicesPerQuestion"
                name="choicesPerQuestion"
                type="number"
                min={2}
                max={6}
                label=""
                value={choicesPerQuestionInput}
                error={getVisibleFieldError("choicesPerQuestion")}
                onValueChange={(value) => {
                  setChoicesPerQuestionInput(value);
                  clearFieldError("choicesPerQuestion");
                }}
              />
            </div>

            <div className="flex h-full flex-col justify-center rounded-lg border border-[var(--color-bg4)] bg-[var(--color-bg2)]/40 px-4 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <Icon
                  icon="mingcute:time-line"
                  className="h-6 w-6 text-[var(--color-icon)]"
                />
                <span className="text-sm text-[var(--color-text-primary)]">
                  Timer per question
                </span>
                <TimerField
                  id="rapid-arithmetic-time"
                  name="timePerQuestion"
                  value={timePerQuestion}
                  onChange={(next) => {
                    setTimePerQuestion(next);
                    clearFieldError("timePerQuestion");
                  }}
                  min={5}
                  max={60}
                  showIcon={false}
                  layout="inputs-toggle-status"
                  showStatusText
                  statusTextOn="On"
                  statusTextOff="No limit"
                  blockDisable
                />
              </div>
              {getVisibleFieldError("timePerQuestion") && (
                <p className="mt-1 text-xs text-[var(--color-error)]">
                  {String(getVisibleFieldError("timePerQuestion"))}
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <section
              className={`rounded-lg border border-[var(--color-bg4)] bg-[var(--color-bg2)]/30 p-4 ${
                addEnabled ? "" : "opacity-60"
              }`}
            >
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
                  Addition
                </h3>
                {!addEnabled && (
                  <span className="text-xs text-[var(--color-text-secondary)]">
                    Disabled
                  </span>
                )}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <TextInput
                  id="add-operand-min"
                  type="number"
                  label="Min operand"
                  value={String(operationSettings.addition.operandMin)}
                  disabled={!addEnabled}
                  onValueChange={(v) => {
                    const n = Number(v);
                    if (!Number.isFinite(n)) return;
                    updateAddition({ operandMin: n });
                  }}
                />
                <TextInput
                  id="add-operand-max"
                  type="number"
                  label="Max operand"
                  value={String(operationSettings.addition.operandMax)}
                  disabled={!addEnabled}
                  onValueChange={(v) => {
                    const n = Number(v);
                    if (!Number.isFinite(n)) return;
                    updateAddition({ operandMax: n });
                  }}
                />
                <TextInput
                  id="add-answer-min"
                  type="number"
                  label="Min answer"
                  value={String(operationSettings.addition.answerMin)}
                  disabled={!addEnabled}
                  onValueChange={(v) => {
                    const n = Number(v);
                    if (!Number.isFinite(n)) return;
                    updateAddition({ answerMin: n });
                  }}
                />
                <TextInput
                  id="add-answer-max"
                  type="number"
                  label="Max answer"
                  value={String(operationSettings.addition.answerMax)}
                  disabled={!addEnabled}
                  onValueChange={(v) => {
                    const n = Number(v);
                    if (!Number.isFinite(n)) return;
                    updateAddition({ answerMax: n });
                  }}
                />
              </div>
              <div className="mt-3">
                <ToggleButton
                  on={operationSettings.addition.allowNegative}
                  onToggle={() =>
                    updateAddition({
                      allowNegative: !operationSettings.addition.allowNegative,
                    })
                  }
                  label="Allow negative numbers"
                  disabled={!addEnabled}
                />
              </div>
            </section>

            <section
              className={`rounded-lg border border-[var(--color-bg4)] bg-[var(--color-bg2)]/30 p-4 ${
                subEnabled ? "" : "opacity-60"
              }`}
            >
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
                  Subtraction
                </h3>
                {!subEnabled && (
                  <span className="text-xs text-[var(--color-text-secondary)]">
                    Disabled
                  </span>
                )}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <TextInput
                  id="sub-operand-min"
                  type="number"
                  label="Min operand"
                  value={String(operationSettings.subtraction.operandMin)}
                  disabled={!subEnabled}
                  onValueChange={(v) => {
                    const n = Number(v);
                    if (!Number.isFinite(n)) return;
                    updateSubtraction({ operandMin: n });
                  }}
                />
                <TextInput
                  id="sub-operand-max"
                  type="number"
                  label="Max operand"
                  value={String(operationSettings.subtraction.operandMax)}
                  disabled={!subEnabled}
                  onValueChange={(v) => {
                    const n = Number(v);
                    if (!Number.isFinite(n)) return;
                    updateSubtraction({ operandMax: n });
                  }}
                />
                <TextInput
                  id="sub-answer-min"
                  type="number"
                  label="Min answer"
                  value={String(operationSettings.subtraction.answerMin)}
                  disabled={!subEnabled}
                  onValueChange={(v) => {
                    const n = Number(v);
                    if (!Number.isFinite(n)) return;
                    updateSubtraction({ answerMin: n });
                  }}
                />
                <TextInput
                  id="sub-answer-max"
                  type="number"
                  label="Max answer"
                  value={String(operationSettings.subtraction.answerMax)}
                  disabled={!subEnabled}
                  onValueChange={(v) => {
                    const n = Number(v);
                    if (!Number.isFinite(n)) return;
                    updateSubtraction({ answerMax: n });
                  }}
                />
              </div>
              <div className="mt-3">
                <ToggleButton
                  on={operationSettings.subtraction.allowNegative}
                  onToggle={() =>
                    updateSubtraction({
                      allowNegative:
                        !operationSettings.subtraction.allowNegative,
                    })
                  }
                  label="Allow negative answers"
                  disabled={!subEnabled}
                />
              </div>
            </section>

            <section
              className={`rounded-lg border border-[var(--color-bg4)] bg-[var(--color-bg2)]/30 p-4 ${
                mulEnabled ? "" : "opacity-60"
              }`}
            >
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
                  Multiplication
                </h3>
                {!mulEnabled && (
                  <span className="text-xs text-[var(--color-text-secondary)]">
                    Disabled
                  </span>
                )}
              </div>

              <div className="mb-3">
                <Select
                  id="mul-mode"
                  label="Generation mode"
                  options={[
                    { label: "Times table mode", value: "times-table" },
                    { label: "Range mode", value: "range" },
                  ]}
                  value={operationSettings.multiplication.mode}
                  disabled={!mulEnabled}
                  onChange={(value) =>
                    updateMultiplication({
                      mode: value === "range" ? "range" : "times-table",
                    })
                  }
                />
              </div>

              {operationSettings.multiplication.mode === "times-table" ? (
                <div className="space-y-3">
                  <div>
                    <p className="mb-2 text-sm text-[var(--color-text-primary)]">
                      Times tables
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {TIMES_TABLE_OPTIONS.map((table) => {
                        const selected =
                          operationSettings.multiplication.tables.includes(table);
                        return (
                          <button
                            key={table}
                            type="button"
                            disabled={!mulEnabled}
                            onClick={() => toggleTimesTable(table)}
                            className={[
                              "rounded-sm border px-3 py-1.5 text-xs font-medium transition",
                              selected
                                ? "border-[var(--color-primary)] bg-[var(--color-primary)] text-white"
                                : "border-[var(--color-bg4)] bg-[var(--color-bg2)] text-[var(--color-text-primary)]",
                              !mulEnabled ? "cursor-not-allowed opacity-60" : "",
                            ].join(" ")}
                          >
                            {table}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <TextInput
                      id="mul-multiplier-min"
                      type="number"
                      label="Min multiplier"
                      value={String(operationSettings.multiplication.multiplierMin)}
                      disabled={!mulEnabled}
                      onValueChange={(v) => {
                        const n = Number(v);
                        if (!Number.isFinite(n)) return;
                        updateMultiplication({ multiplierMin: n });
                      }}
                    />
                    <TextInput
                      id="mul-multiplier-max"
                      type="number"
                      label="Max multiplier"
                      value={String(operationSettings.multiplication.multiplierMax)}
                      disabled={!mulEnabled}
                      onValueChange={(v) => {
                        const n = Number(v);
                        if (!Number.isFinite(n)) return;
                        updateMultiplication({ multiplierMax: n });
                      }}
                    />
                  </div>
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  <TextInput
                    id="mul-operand-min"
                    type="number"
                    label="Min operand"
                    value={String(operationSettings.multiplication.operandMin)}
                    disabled={!mulEnabled}
                    onValueChange={(v) => {
                      const n = Number(v);
                      if (!Number.isFinite(n)) return;
                      updateMultiplication({ operandMin: n });
                    }}
                  />
                  <TextInput
                    id="mul-operand-max"
                    type="number"
                    label="Max operand"
                    value={String(operationSettings.multiplication.operandMax)}
                    disabled={!mulEnabled}
                    onValueChange={(v) => {
                      const n = Number(v);
                      if (!Number.isFinite(n)) return;
                      updateMultiplication({ operandMax: n });
                    }}
                  />
                </div>
              )}

              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <TextInput
                  id="mul-answer-min"
                  type="number"
                  label="Min answer"
                  value={String(operationSettings.multiplication.answerMin)}
                  disabled={!mulEnabled}
                  onValueChange={(v) => {
                    const n = Number(v);
                    if (!Number.isFinite(n)) return;
                    updateMultiplication({ answerMin: n });
                  }}
                />
                <TextInput
                  id="mul-answer-max"
                  type="number"
                  label="Max answer"
                  value={String(operationSettings.multiplication.answerMax)}
                  disabled={!mulEnabled}
                  onValueChange={(v) => {
                    const n = Number(v);
                    if (!Number.isFinite(n)) return;
                    updateMultiplication({ answerMax: n });
                  }}
                />
              </div>
            </section>

            <section
              className={`rounded-lg border border-[var(--color-bg4)] bg-[var(--color-bg2)]/30 p-4 ${
                divEnabled ? "" : "opacity-60"
              }`}
            >
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
                  Division (integer-only)
                </h3>
                {!divEnabled && (
                  <span className="text-xs text-[var(--color-text-secondary)]">
                    Disabled
                  </span>
                )}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <TextInput
                  id="div-divisor-min"
                  type="number"
                  label="Min divisor"
                  value={String(operationSettings.division.divisorMin)}
                  disabled={!divEnabled}
                  onValueChange={(v) => {
                    const n = Number(v);
                    if (!Number.isFinite(n)) return;
                    updateDivision({ divisorMin: n });
                  }}
                />
                <TextInput
                  id="div-divisor-max"
                  type="number"
                  label="Max divisor"
                  value={String(operationSettings.division.divisorMax)}
                  disabled={!divEnabled}
                  onValueChange={(v) => {
                    const n = Number(v);
                    if (!Number.isFinite(n)) return;
                    updateDivision({ divisorMax: n });
                  }}
                />
                <TextInput
                  id="div-quotient-min"
                  type="number"
                  label="Min quotient"
                  value={String(operationSettings.division.quotientMin)}
                  disabled={!divEnabled}
                  onValueChange={(v) => {
                    const n = Number(v);
                    if (!Number.isFinite(n)) return;
                    updateDivision({ quotientMin: n });
                  }}
                />
                <TextInput
                  id="div-quotient-max"
                  type="number"
                  label="Max quotient"
                  value={String(operationSettings.division.quotientMax)}
                  disabled={!divEnabled}
                  onValueChange={(v) => {
                    const n = Number(v);
                    if (!Number.isFinite(n)) return;
                    updateDivision({ quotientMax: n });
                  }}
                />
                <TextInput
                  id="div-answer-min"
                  type="number"
                  label="Min answer"
                  value={String(operationSettings.division.answerMin)}
                  disabled={!divEnabled}
                  onValueChange={(v) => {
                    const n = Number(v);
                    if (!Number.isFinite(n)) return;
                    updateDivision({ answerMin: n });
                  }}
                />
                <TextInput
                  id="div-answer-max"
                  type="number"
                  label="Max answer"
                  value={String(operationSettings.division.answerMax)}
                  disabled={!divEnabled}
                  onValueChange={(v) => {
                    const n = Number(v);
                    if (!Number.isFinite(n)) return;
                    updateDivision({ answerMax: n });
                  }}
                />
              </div>
              <div className="mt-3">
                <ToggleButton
                  on={operationSettings.division.allowNegative}
                  onToggle={() =>
                    updateDivision({
                      allowNegative: !operationSettings.division.allowNegative,
                    })
                  }
                  label="Allow negative answers"
                  disabled={!divEnabled}
                />
              </div>
            </section>
          </div>

          {getVisibleFieldError("operationSettings") && (
            <p className="text-xs text-[var(--color-error)]">
              {String(getVisibleFieldError("operationSettings"))}
            </p>
          )}

          <input type="hidden" name="quizType" value="rapid-arithmetic" />
          <input type="hidden" name="operatorsJson" value={operatorsJson} />
          <input
            type="hidden"
            name="operationSettingsJson"
            value={operationSettingsJson}
          />
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
      </form>
    </div>
  );
}
