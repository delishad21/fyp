"use client";

import { useEffect, useMemo, useState } from "react";
import Pagination from "@/components/table/Pagination";
import Button from "@/components/ui/buttons/Button";
import ToggleButton from "@/components/ui/buttons/ToggleButton";
import DateField from "@/components/ui/selectors/DateField";
import MultiSelect from "@/components/ui/selectors/multi-select/MultiSelect";
import NumberToggleInput from "@/components/ui/text-inputs/NumberToggleInput";
import TextSearch from "@/components/ui/text-inputs/TextSearch";
import { useToast } from "@/components/ui/toast/ToastProvider";
import { addClassQuizSchedule } from "@/services/class/actions/class-schedule-actions";
import { endOfDayInTZ, startOfDayInTZ, tzDayKey } from "@/services/class/helpers/scheduling/scheduling-helpers";
import type { ScheduleItem } from "@/services/class/types/class-types";
import { queryQuizzes } from "@/services/quiz/actions/query-quiz-action";
import { useDebounced } from "@/services/quiz/quiz-table-helpers/hooks/useDebounced";
import type { FilterMeta, RowData } from "@/services/quiz/types/quiz-table-types";
import type { QuizRowPayload, ScheduleClassBundle } from "../types";

type DateMode = "single" | "per-class";

function toQuizPayload(row: RowData): QuizRowPayload | null {
  const p = row.payload as QuizRowPayload | undefined;
  if (!p || !p.id || !p.title) return null;
  return p;
}

function classOptions(classes: ScheduleClassBundle[]) {
  return classes.map((c) => ({
    value: c.classId,
    label: c.className || "Untitled class",
    colorHex: c.colorHex,
  }));
}

function browserDayKey() {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  return tzDayKey(new Date(), tz);
}

function buildQuery({
  page,
  search,
  subjects,
  topics,
  types,
}: {
  page: number;
  search: string;
  subjects: string[];
  topics: string[];
  types: string[];
}) {
  return {
    page,
    pageSize: 10,
    ...(search ? { name: search } : {}),
    ...(subjects.length ? { subjects } : {}),
    ...(topics.length ? { topics } : {}),
    ...(types.length ? { types } : {}),
  };
}

export default function SchedulingPlanTab({
  classes,
  filterMeta,
  initialQuizRows,
  initialQuizPage,
  initialQuizPageCount,
  initialQuizTotal,
  onSchedulesCreated,
  onOpenCalendar,
}: {
  classes: ScheduleClassBundle[];
  filterMeta: FilterMeta;
  initialQuizRows: RowData[];
  initialQuizPage: number;
  initialQuizPageCount: number;
  initialQuizTotal: number;
  onSchedulesCreated: (created: Array<{ classId: string; item: ScheduleItem }>) => void;
  onOpenCalendar: () => void;
}) {
  const { showToast } = useToast();

  const [search, setSearch] = useState("");
  const [subjects, setSubjects] = useState<string[]>([]);
  const [topics, setTopics] = useState<string[]>([]);
  const [types, setTypes] = useState<string[]>([]);
  const debouncedSearch = useDebounced(search, 250);

  const [quizRows, setQuizRows] = useState<RowData[]>(initialQuizRows);
  const [quizPage, setQuizPage] = useState(initialQuizPage);
  const [quizPageCount, setQuizPageCount] = useState(initialQuizPageCount);
  const [quizTotal, setQuizTotal] = useState(initialQuizTotal);
  const [quizLoading, setQuizLoading] = useState(false);

  const [selectedQuizByRowId, setSelectedQuizByRowId] = useState<
    Record<string, QuizRowPayload>
  >({});
  const [selectedClassIds, setSelectedClassIds] = useState<string[]>([]);

  const [dateMode, setDateMode] = useState<DateMode>("single");
  const [singleDate, setSingleDate] = useState<string>(browserDayKey());
  const [dateByClassId, setDateByClassId] = useState<Record<string, string>>({});

  const [contribution, setContribution] = useState(100);
  const [attemptsAllowed, setAttemptsAllowed] = useState(1);
  const [showAnswersAfterAttempt, setShowAnswersAfterAttempt] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setQuizLoading(true);
      const res = await queryQuizzes(
        buildQuery({
          page: quizPage,
          search: debouncedSearch.trim(),
          subjects,
          topics,
          types,
        })
      );
      if (cancelled) return;
      setQuizRows(res.rows);
      setQuizPage(res.page);
      setQuizPageCount(res.pageCount);
      setQuizTotal(res.total);
      setQuizLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [debouncedSearch, subjects, topics, types, quizPage]);

  useEffect(() => {
    setQuizPage(1);
  }, [debouncedSearch, subjects, topics, types]);

  useEffect(() => {
    if (!selectedClassIds.length) return;
    setDateByClassId((prev) => {
      const next = { ...prev };
      for (const classId of selectedClassIds) {
        if (!next[classId]) next[classId] = singleDate;
      }
      return next;
    });
  }, [selectedClassIds, singleDate]);

  const visibleQuizzes = useMemo(
    () =>
      quizRows
        .map((row) => ({ row, payload: toQuizPayload(row) }))
        .filter((x): x is { row: RowData; payload: QuizRowPayload } =>
          Boolean(x.payload)
        ),
    [quizRows]
  );

  const selectedQuizzes = useMemo(
    () => Object.values(selectedQuizByRowId),
    [selectedQuizByRowId]
  );

  const selectedClasses = useMemo(() => {
    if (!selectedClassIds.length) return [];
    const ids = new Set(selectedClassIds);
    return classes.filter((c) => ids.has(c.classId));
  }, [classes, selectedClassIds]);

  const targetSchedulesCount =
    selectedQuizzes.length * selectedClasses.length;

  const toggleQuiz = (rowId: string, payload: QuizRowPayload) => {
    setSelectedQuizByRowId((prev) => {
      if (prev[rowId]) {
        const next = { ...prev };
        delete next[rowId];
        return next;
      }
      return { ...prev, [rowId]: payload };
    });
  };

  const clearQuizSelection = () => setSelectedQuizByRowId({});

  const applyPlan = async () => {
    if (!selectedQuizzes.length) {
      showToast({
        title: "No quizzes selected",
        description: "Choose at least one quiz to schedule.",
        variant: "error",
      });
      return;
    }
    if (!selectedClasses.length) {
      showToast({
        title: "No classes selected",
        description: "Choose at least one class.",
        variant: "error",
      });
      return;
    }

    const missingDateClass = selectedClasses.find((cls) => {
      const key = dateMode === "single" ? singleDate : dateByClassId[cls.classId];
      return !key;
    });

    if (missingDateClass) {
      showToast({
        title: "Missing date",
        description: `Pick a date for ${missingDateClass.className || "a class"}.`,
        variant: "error",
      });
      return;
    }

    setSubmitting(true);

    const created: Array<{ classId: string; item: ScheduleItem }> = [];
    const failures: string[] = [];

    await Promise.allSettled(
      selectedClasses.flatMap((cls) =>
        selectedQuizzes.map(async (quiz) => {
          const dayKey =
            dateMode === "single" ? singleDate : dateByClassId[cls.classId];
          const today = tzDayKey(new Date(), cls.classTimezone);

          if (dayKey < today) {
            failures.push(
              `${cls.className || "Class"}: selected day is in the past (${dayKey}).`
            );
            return;
          }

          const startDate = startOfDayInTZ(dayKey, cls.classTimezone);
          const endDate = endOfDayInTZ(dayKey, cls.classTimezone);

          const res = await addClassQuizSchedule(cls.classId, {
            quizId: quiz.id,
            quizRootId: quiz.rootQuizId || quiz.id,
            quizVersion:
              typeof quiz.version === "number" && Number.isFinite(quiz.version)
                ? quiz.version
                : 1,
            startDate,
            endDate,
            contribution,
            attemptsAllowed,
            showAnswersAfterAttempt,
          });

          if (!res.ok || !res.data?._id) {
            failures.push(
              `${cls.className || "Class"} × ${quiz.title}: ${
                res.message || "Could not schedule."
              }`
            );
            return;
          }

          created.push({
            classId: cls.classId,
            item: {
              ...res.data,
              clientId:
                res.data._id ||
                `c-${crypto.randomUUID?.() || Math.random().toString(16).slice(2)}`,
              quizId: res.data.quizId || quiz.id,
              quizRootId: res.data.quizRootId || quiz.rootQuizId || quiz.id,
              quizVersion:
                typeof res.data.quizVersion === "number"
                  ? res.data.quizVersion
                  : typeof quiz.version === "number"
                  ? quiz.version
                  : 1,
              startDate: res.data.startDate || startDate.toISOString(),
              endDate: res.data.endDate || endDate.toISOString(),
              quizName: res.data.quizName || quiz.title,
              subject: res.data.subject || quiz.subject,
              subjectColor: res.data.subjectColor || quiz.subjectColorHex,
              contribution:
                typeof res.data.contribution === "number"
                  ? res.data.contribution
                  : contribution,
              attemptsAllowed:
                typeof res.data.attemptsAllowed === "number"
                  ? res.data.attemptsAllowed
                  : attemptsAllowed,
              showAnswersAfterAttempt:
                typeof res.data.showAnswersAfterAttempt === "boolean"
                  ? res.data.showAnswersAfterAttempt
                  : showAnswersAfterAttempt,
            },
          });
        })
      )
    );

    setSubmitting(false);

    if (created.length) {
      onSchedulesCreated(created);
      showToast({
        title: "Plan applied",
        description: `Created ${created.length} schedule item(s).`,
        variant: "success",
      });
    }

    if (failures.length) {
      showToast({
        title: "Some schedules failed",
        description: failures[0],
        variant: "error",
      });
    }

    if (!failures.length && created.length) {
      clearQuizSelection();
    }
  };

  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-[var(--color-bg4)] bg-[var(--color-bg2)] p-4">
        <h2 className="text-md font-semibold text-[var(--color-text-primary)]">
          1. Select Quizzes
        </h2>
        <p className="mb-3 text-xs text-[var(--color-text-secondary)]">
          Select one or more quizzes to assign.
        </p>

        <div className="mb-3 flex flex-wrap items-end gap-3">
          <TextSearch
            label="Name"
            value={search}
            onChange={setSearch}
            placeholder="Search quizzes..."
          />

          <MultiSelect
            label="Subject"
            options={filterMeta.subjects.map((s) => ({
              value: s.label,
              label: s.label,
              colorHex: s.colorHex,
            }))}
            value={subjects}
            onChange={setSubjects}
            className="min-w-[220px]"
          />

          <MultiSelect
            label="Topic"
            options={filterMeta.topics.map((t) => ({
              value: t.label,
              label: t.label,
            }))}
            value={topics}
            onChange={setTopics}
            className="min-w-[220px]"
          />

          <MultiSelect
            label="Type"
            options={filterMeta.types.map((t) => ({
              value: t.value,
              label: t.label,
              colorHex: t.colorHex,
            }))}
            value={types}
            onChange={setTypes}
            className="min-w-[220px]"
          />
        </div>

        <div className="mb-3 flex items-center justify-between">
          <p className="text-xs text-[var(--color-text-secondary)]">
            Selected quizzes: {selectedQuizzes.length}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              className="px-3 py-1.5 text-xs"
              onClick={() => {
                const next: Record<string, QuizRowPayload> = {};
                for (const q of visibleQuizzes) next[q.row.id] = q.payload;
                setSelectedQuizByRowId(next);
              }}
            >
              Select Visible
            </Button>
            <Button
              variant="ghost"
              className="px-3 py-1.5 text-xs"
              onClick={clearQuizSelection}
            >
              Clear
            </Button>
          </div>
        </div>

        <div className="relative">
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
            {visibleQuizzes.map(({ row, payload }) => {
              const selected = Boolean(selectedQuizByRowId[row.id]);
              return (
                <button
                  key={row.id}
                  type="button"
                  onClick={() => toggleQuiz(row.id, payload)}
                  className={[
                    "rounded-md border p-3 text-left transition",
                    selected
                      ? "border-[var(--color-primary)] bg-[var(--color-primary)]/10"
                      : "border-[var(--color-bg4)] bg-[var(--color-bg1)] hover:bg-[var(--color-bg3)]",
                  ].join(" ")}
                >
                  <div className="flex items-start gap-2">
                    <span
                      className="mt-1 inline-block h-2.5 w-2.5 rounded-full shrink-0"
                      style={{
                        background:
                          payload.subjectColorHex || "var(--color-primary)",
                      }}
                    />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-[var(--color-text-primary)]">
                        {payload.title}
                      </p>
                      <p className="truncate text-xs text-[var(--color-text-secondary)]">
                        {payload.subject || "—"}
                        {payload.topic ? ` • ${payload.topic}` : ""}
                      </p>
                      <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
                        {payload.type || "Unknown"} • v{payload.version ?? 1}
                      </p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {quizLoading && (
            <div className="pointer-events-none absolute inset-0 grid place-items-center">
              <span className="h-7 w-7 animate-spin rounded-full border-2 border-[var(--color-primary)] border-t-transparent" />
            </div>
          )}
        </div>

        <div className="mt-3">
          <Pagination
            page={quizPage}
            pageCount={Math.max(1, quizPageCount)}
            onPageChange={setQuizPage}
          />
          <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
            {quizTotal} quiz result(s)
          </p>
        </div>
      </section>

      <section className="rounded-lg border border-[var(--color-bg4)] bg-[var(--color-bg2)] p-4">
        <h2 className="text-md font-semibold text-[var(--color-text-primary)]">
          2. Select Classes
        </h2>
        <p className="mb-3 text-xs text-[var(--color-text-secondary)]">
          Choose where the selected quizzes should be assigned.
        </p>

        <div className="max-w-[540px]">
          <MultiSelect
            label="Classes"
            options={classOptions(classes)}
            value={selectedClassIds}
            onChange={setSelectedClassIds}
            placeholder="Select classes"
            searchable
            className="w-full"
          />
        </div>
      </section>

      <section className="rounded-lg border border-[var(--color-bg4)] bg-[var(--color-bg2)] p-4">
        <h2 className="text-md font-semibold text-[var(--color-text-primary)]">
          3. Pick Date Rule
        </h2>
        <p className="mb-3 text-xs text-[var(--color-text-secondary)]">
          Use one date for all classes or specify date per class.
        </p>

        <div className="mb-3 flex items-center gap-2">
          <button
            type="button"
            className={[
              "rounded-md px-3 py-1.5 text-sm",
              dateMode === "single"
                ? "bg-[var(--color-primary)] text-white"
                : "bg-[var(--color-bg1)] text-[var(--color-text-primary)]",
            ].join(" ")}
            onClick={() => setDateMode("single")}
          >
            Same date for all classes
          </button>
          <button
            type="button"
            className={[
              "rounded-md px-3 py-1.5 text-sm",
              dateMode === "per-class"
                ? "bg-[var(--color-primary)] text-white"
                : "bg-[var(--color-bg1)] text-[var(--color-text-primary)]",
            ].join(" ")}
            onClick={() => setDateMode("per-class")}
          >
            Date per class
          </button>
        </div>

        {dateMode === "single" ? (
          <div className="max-w-[260px]">
            <DateField
              label="Assigned date"
              value={singleDate}
              onChange={(next) => {
                if (next) setSingleDate(next);
              }}
            />
          </div>
        ) : (
          <div className="space-y-2">
            {selectedClasses.length ? (
              selectedClasses.map((cls) => (
                <div
                  key={cls.classId}
                  className="flex flex-wrap items-end gap-3 rounded-md border border-[var(--color-bg4)] bg-[var(--color-bg1)] p-3"
                >
                  <div className="min-w-[240px]">
                    <p className="text-sm font-medium text-[var(--color-text-primary)]">
                      {cls.className || "Untitled class"}
                    </p>
                    <p className="text-xs text-[var(--color-text-secondary)]">
                      {cls.classTimezone}
                    </p>
                  </div>
                  <DateField
                    label="Date"
                    value={dateByClassId[cls.classId] || singleDate}
                    onChange={(next) => {
                      if (!next) return;
                      setDateByClassId((prev) => ({
                        ...prev,
                        [cls.classId]: next,
                      }));
                    }}
                  />
                </div>
              ))
            ) : (
              <p className="text-sm text-[var(--color-text-secondary)]">
                Select classes first to assign dates.
              </p>
            )}
          </div>
        )}
      </section>

      <section className="rounded-lg border border-[var(--color-bg4)] bg-[var(--color-bg2)] p-4">
        <h2 className="text-md font-semibold text-[var(--color-text-primary)]">
          4. Assignment Settings
        </h2>
        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
          <NumberToggleInput
            id="plan-contribution"
            label="Contribution (%)"
            value={contribution}
            min={0}
            max={100}
            onChange={setContribution}
          />

          <NumberToggleInput
            id="plan-attempts"
            label="Attempts allowed"
            value={attemptsAllowed}
            min={1}
            max={10}
            onChange={setAttemptsAllowed}
          />

          <div className="rounded-md border border-[var(--color-bg4)] bg-[var(--color-bg1)] p-3">
            <ToggleButton
              id="plan-show-answers"
              label="Show answers after attempt"
              on={showAnswersAfterAttempt}
              onToggle={() => setShowAnswersAfterAttempt((v) => !v)}
              inlineTextPosition="right"
            />
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-[var(--color-bg4)] bg-[var(--color-bg2)] p-4">
        <h2 className="text-md font-semibold text-[var(--color-text-primary)]">
          5. Review and Confirm
        </h2>
        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-4">
          <div className="rounded-md border border-[var(--color-bg4)] bg-[var(--color-bg1)] p-3">
            <p className="text-xs text-[var(--color-text-secondary)]">Quizzes</p>
            <p className="text-lg font-semibold">{selectedQuizzes.length}</p>
          </div>
          <div className="rounded-md border border-[var(--color-bg4)] bg-[var(--color-bg1)] p-3">
            <p className="text-xs text-[var(--color-text-secondary)]">Classes</p>
            <p className="text-lg font-semibold">{selectedClasses.length}</p>
          </div>
          <div className="rounded-md border border-[var(--color-bg4)] bg-[var(--color-bg1)] p-3">
            <p className="text-xs text-[var(--color-text-secondary)]">Planned items</p>
            <p className="text-lg font-semibold">{targetSchedulesCount}</p>
          </div>
          <div className="rounded-md border border-[var(--color-bg4)] bg-[var(--color-bg1)] p-3">
            <p className="text-xs text-[var(--color-text-secondary)]">Date rule</p>
            <p className="text-sm font-semibold">
              {dateMode === "single" ? "Single date" : "Per class"}
            </p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button
            variant="primary"
            className="px-4 py-2"
            onClick={applyPlan}
            loading={submitting}
            disabled={submitting}
          >
            Apply Plan
          </Button>
          <Button
            variant="ghost"
            className="px-4 py-2"
            onClick={onOpenCalendar}
          >
            Open Calendar
          </Button>
        </div>
      </section>
    </div>
  );
}
