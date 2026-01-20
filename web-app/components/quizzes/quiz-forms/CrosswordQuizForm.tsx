"use client";

/**
 * CrosswordQuizForm Component
 *
 * Purpose:
 *   - Provides a form for creating or editing a "Crossword Quiz".
 *   - Collects quiz metadata (name, subject, topic), overall timer, and word/clue entries.
 *   - Supports generating and previewing a crossword grid before submission.
 *
 *   Versioning + schedules:
 *   - Any edit creates a NEW version of the quiz.
 *   - A confirmation modal asks whether to update active/scheduled quizzes
 *     to the new version. If crossword content changed and the teacher opts in,
 *     downstream services can reset attempts for those quizzes.
 */

import * as React from "react";
import {
  useActionState,
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
} from "react";
import Button from "@/components/ui/buttons/Button";
import { processQuiz } from "@/services/quiz/actions/process-quiz-action";
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
  Cell,
  CreateQuizState,
  CrosswordInitial,
  CrosswordPlacedEntry,
  CrosswordTopFields,
} from "@/services/quiz/types/quizTypes";
import MetaFields from "./quiz-form-helper-components/MetaFields";
import TimerField from "./quiz-form-helper-components/TimerField";
import CrosswordGrid from "../CrosswordGrid";
import { generateCrosswordPreview } from "@/services/quiz/actions/generate-crossword";
import CrosswordAnswerEditor from "./quiz-form-helper-components/question-editors/CrosswordAnswerEditor";
import { REDIRECT_TIMEOUT } from "@/utils/utils";
import { useToast } from "@/components/ui/toast/ToastProvider";
import VersionSelector from "./quiz-form-helper-components/VersionSelector";
import QuizVersionModal from "./quiz-form-helper-components/QuizVersionModal";
import TutorialModal, { TutorialStep } from "@/components/ui/TutorialModal";
import { Icon } from "@iconify/react";

type Props = {
  meta: FilterMeta;
  mode: "create" | "edit";
  initialData?: CrosswordInitial;
  versions?: number[];
  currentVersion?: number;
  /** When true, this is a "duplicate" flow (prefilled create). */
  isClone?: boolean;
  typeColorHex?: string;
};

const makeEntry = () => ({ id: crypto.randomUUID(), answer: "", clue: "" });

const normalizeStr = (s: unknown) =>
  String(s ?? "")
    .trim()
    .replace(/\s+/g, " ");
const normalizeAnswer = (s: unknown) =>
  String(s ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();

function normalizeEntries(
  entriesLike: Array<{ answer: string; clue: string }>
) {
  const mapped = (entriesLike || []).map((e) => ({
    a: normalizeAnswer(e.answer),
    c: normalizeStr(e.clue),
  }));
  mapped.sort((x, y) => (x.a + "|" + x.c).localeCompare(y.a + "|" + y.c));
  return mapped;
}

function normalizePlaced(placed: CrosswordPlacedEntry[]) {
  const mapped =
    (placed || []).map((p) => ({
      a: normalizeAnswer(p.answer ?? ""),
      pos: (p.positions || []).map((t) => [
        Number(t.row || 0),
        Number(t.col || 0),
      ]),
      dir: p.direction === "across" ? "a" : p.direction === "down" ? "d" : null,
    })) || [];
  mapped.sort((x, y) =>
    (x.a + "|" + x.dir + "|" + JSON.stringify(x.pos)).localeCompare(
      y.a + "|" + y.dir + "|" + JSON.stringify(y.pos)
    )
  );
  return mapped;
}

function normalizeGrid(grid: Cell[][] | null) {
  if (!grid) return null;
  return grid.map((row) =>
    row.map((cell) => ({
      b: !!cell.isBlocked,
      l:
        cell.letter == null || cell.letter === ""
          ? null
          : String(cell.letter).toUpperCase(),
    }))
  );
}

function buildNormalizedCrosswordSnapshot(opts: {
  entries: Array<{ answer: string; clue: string }>;
  grid: Cell[][] | null;
  placed: CrosswordPlacedEntry[] | null;
  totalTimeLimit: number | null;
}) {
  return {
    entries: normalizeEntries(opts.entries),
    grid: normalizeGrid(opts.grid),
    placed: normalizePlaced(opts.placed || []),
    totalTimeLimit:
      opts.totalTimeLimit === null || opts.totalTimeLimit === undefined
        ? null
        : Number(opts.totalTimeLimit),
  };
}
const tutorialSteps: TutorialStep[] = [
  {
    title: "Introduction to Crossword Quizzes",
    subtitle:
      "Crossword quizzes help students practice vocabulary and key concepts. \
      Use this format when you want a puzzle-style activity.",
  },
  {
    title: "Set quiz details",
    subtitle: "Enter a name, subject, and topic so you can find it later.",
    media: { src: "/tutorials/quiz-creation/crossword/1.mp4" },
  },
  {
    title: "Add an overall timer",
    subtitle: "Optional: set a time limit for completing the crossword.",
    media: { src: "/tutorials/quiz-creation/crossword/2.mp4" },
  },
  {
    title: "Add entries",
    subtitle:
      "Add each word and its clue. You can add up to 10 words, and each word can be up to 20 characters.",
    media: { src: "/tutorials/quiz-creation/crossword/3.mp4" },
  },
  {
    title: "Generate the crossword",
    subtitle:
      "Click “Generate crossword” to build the grid. If the layout looks off, edit your entries and regenerate.",
    media: { src: "/tutorials/quiz-creation/crossword/4.mp4" },
  },
  {
    title: "Create the quiz",
    subtitle: "Fix any errors, then submit to create the quiz.",
    media: { src: "/tutorials/quiz-creation/crossword/5.mp4" },
  },
];

export default function CrosswordQuizForm({
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
    (mode === "edit" || isClone) && initialData?.entries?.length
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

  // action-state error helpers
  const { clearFieldError, getVisibleFieldError } =
    useFieldErrorMask<CrosswordTopFields>(state.fieldErrors);

  const { visibleErrors: visibleRowErrors, clearErrorAtIndex: clearRowError } =
    useIndexedErrorMask(state.questionErrors);

  // show toast on state change
  const { showToast } = useToast();
  const lastToastRef = useRef<string | null>(null);
  useEffect(() => {
    const msg = genMessage || state.message;
    if (!msg) return;
    if (msg === lastToastRef.current) return;

    const isSuccess = (generated && genMessage) || state.ok;

    showToast({
      title: isSuccess ? "Success" : "Error",
      description: msg,
      variant: isSuccess ? "success" : "error",
    });

    setGenMessage(null);
    lastToastRef.current = msg;
  }, [genMessage, state.message, state.ok, generated, showToast]);

  // ---------------- Hydration + invalidate-after-edit guards ----------------
  const hydratedRef = React.useRef(false);
  const userEditedRef = React.useRef(false);

  React.useEffect(() => {
    if (!initialData) return;
    if (mode !== "edit" && !isClone) return;

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
  }, [mode, isClone, initialData]);

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

  /** ──────────────────────────────────────────────────────────────────────
   * Edit-mode: detect QUESTION CONTENT changes
   * Used only to tweak modal copy; backend is source of truth.
   * ───────────────────────────────────────────────────────────────────── */

  const initialContentNormJson = useMemo(() => {
    if (mode !== "edit" || !initialData) return "";

    const entriesSrc =
      (initialData.entries || []).map((e) => ({
        answer: e.answer ?? "",
        clue: e.clue ?? "",
      })) ?? [];

    const hasGrid =
      Array.isArray(initialData.grid) &&
      initialData.grid.length > 0 &&
      Array.isArray(initialData.grid[0]);

    const hasPlaced =
      Array.isArray(initialData.placedEntries) &&
      initialData.placedEntries.length > 0;

    const snapshot = buildNormalizedCrosswordSnapshot({
      entries: entriesSrc,
      grid: hasGrid ? (initialData.grid as Cell[][]) : null,
      placed: hasPlaced
        ? (initialData.placedEntries as CrosswordPlacedEntry[])
        : [],
      totalTimeLimit:
        initialData.totalTimeLimit === undefined
          ? null
          : (initialData.totalTimeLimit as number | null),
    });

    return JSON.stringify(snapshot);
  }, [mode, initialData]);

  const currentContentNormJson = useMemo(() => {
    const nowEntries = (entries || []).map((e) => ({
      answer: e.answer ?? "",
      clue: e.clue ?? "",
    }));

    const snapshot = buildNormalizedCrosswordSnapshot({
      entries: nowEntries,
      grid: generated ? genGrid : null,
      placed: generated ? genEntries : [],
      totalTimeLimit: totalTime ?? null,
    });

    return JSON.stringify(snapshot);
  }, [entries, generated, genGrid, genEntries, totalTime]);

  const contentChanged =
    mode === "edit" && initialData?.id
      ? initialContentNormJson !== currentContentNormJson
      : false;

  // Submission guard + version modal (EDIT only)
  const formRef = useRef<HTMLFormElement | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const confirmedRef = useRef(false); // <-- ref instead of state
  const updateActiveSchedulesInputRef = useRef<HTMLInputElement | null>(null);

  const handleSubmitGuard = useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
      if (mode !== "edit") return; // only prompt on edit
      if (confirmedRef.current) return; // already confirmed; let it submit

      e.preventDefault();

      // Detect metadata changes (name/subject/topic)
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

  // ------------------------------------------------------------------------
  // Labels / Version selector
  // ------------------------------------------------------------------------

  const headerLabel = "Crossword Quiz";
  const submitLabel =
    mode === "edit" ? "Save Changes" : isClone ? "Create Copy" : "Finalize Quiz";
  const headerStyle =
    typeColorHex && typeColorHex.startsWith("#")
      ? { backgroundColor: `${typeColorHex}1A`, color: typeColorHex }
      : undefined;

  const rowErrorsToShow = (i: number) =>
    visibleRowErrors[i] || genQuestionErrors[i];

  return (
    <form
      ref={formRef}
      onSubmit={handleSubmitGuard}
      onKeyDown={onFormKeyDown}
      noValidate
      action={formAction}
      className="grid grid-cols-1 gap-6 pb-40 lg:grid-cols-12 min-w-[600px]"
    >
      <div className="space-y-4 lg:col-span-9">
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
              triggerTitle="How to use the crossword quiz form"
            />
          </div>
        </div>

        {/* Top meta */}
        <MetaFields
          meta={meta}
          defaults={{
            name:
              state.values.name ||
              (mode === "edit" || isClone ? initialData?.name ?? "" : ""),
            subject:
              state.values.subject ||
              (mode === "edit" || isClone ? initialData?.subject ?? "" : ""),
            topic:
              state.values.topic ||
              (mode === "edit" || isClone ? initialData?.topic ?? "" : ""),
          }}
          errorFor={(k) => getVisibleFieldError(k) || genFieldErrors[k]}
          clearError={(k) => {
            clearFieldError(k);
            setGenFieldErrors((prev) => ({ ...prev, [k]: undefined }));
          }}
          onAddSubject={addSubject}
          onAddTopic={addTopic}
        />

        {/* Entries-level error */}
        {(() => {
          const e =
            getVisibleFieldError("entries") || genFieldErrors["entries"];
          if (!e) return null;
          return Array.isArray(e) ? (
            <ul className="list-disc pl-5 text-xs text-[var(--color-error)] space-y-0.5">
              {e.map((msg, i) => (
                <li key={i}>{msg}</li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-[var(--color-error)]">{e}</p>
          );
        })()}

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
                  Add 1-10 entries, generate the grid, then check the preview
                  before creating the quiz.
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
              id="crossword-total-time"
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
            <div className="mb-2">
              <h3 className="text-sm font-medium text-[var(--color-text-primary)]">
                Generated Crossword
              </h3>
              <p className="text-xs text-[var(--color-text-secondary)]">
                If your crossword does not piece together well, consider adding
                more words to serve as &quot;connectors&quot;
              </p>
            </div>
            <CrosswordGrid grid={genGrid} entries={genEntries} cellSize={40} />
          </div>
        ) : null}

        {/* Hidden payloads */}
        <input type="hidden" name="quizType" value="crossword" />
        <input type="hidden" name="entriesJson" value={entriesJson} />
        <input type="hidden" name="mode" value={mode} />
        <input type="hidden" name="gridJson" value={gridJson} />
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

      <div className="hidden lg:block lg:col-span-3" />

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
