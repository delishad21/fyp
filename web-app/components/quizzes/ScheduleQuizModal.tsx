"use client";

import { useEffect, useMemo, useState } from "react";
import Button from "@/components/ui/buttons/Button";
import TextInput from "@/components/ui/text-inputs/TextInput";
import NumberToggleInput from "@/components/ui/text-inputs/NumberToggleInput";
import DateRangeField from "@/components/ui/selectors/DateRangeField";
import ToggleButton from "@/components/ui/buttons/ToggleButton";
import MultiSelect from "@/components/ui/selectors/multi-select/MultiSelect";
import { useToast } from "@/components/ui/toast/ToastProvider";
import { getClasses, getClass } from "@/services/class/actions/class-actions";
import { addClassQuizSchedule } from "@/services/class/actions/class-schedule-actions";
import { getQuizForEdit } from "@/services/quiz/actions/get-quiz-action";
import {
  dayKeyFromDateInTZ,
  makeDateInTZ,
} from "@/services/class/helpers/scheduling/scheduling-helpers";
import type { RowData } from "@/services/quiz/types/quiz-table-types";
import type { ClassItem, QuizLite } from "@/services/class/types/class-types";
import Select from "../ui/selectors/select/Select";

const DEFAULT_TZ = "Asia/Singapore";

type ClassOption = {
  id: string;
  name: string;
  level?: string;
  timezone?: string;
  colorHex?: string;
};

export default function ScheduleQuizModal({
  open,
  row,
  onClose,
}: {
  open: boolean;
  row: RowData | null;
  onClose: () => void;
}) {
  const { showToast } = useToast();
  const quizPayload = row?.payload as QuizLite | undefined;

  const quizId = useMemo(
    () => quizPayload?.id ?? (row ? String(row.id) : ""),
    [quizPayload?.id, row]
  );
  const quizName = quizPayload?.title ?? "Quiz";
  const quizRootId = quizPayload?.rootQuizId ?? quizId;
  const quizVersionHint =
    typeof quizPayload?.version === "number" ? quizPayload.version : undefined;

  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [classesLoading, setClassesLoading] = useState(false);
  const [classIds, setClassIds] = useState<string[]>([]);
  const [classTimezones, setClassTimezones] = useState<Record<string, string>>(
    {}
  );

  const [startYMD, setStartYMD] = useState("");
  const [endYMD, setEndYMD] = useState("");
  const [startTime, setStartTime] = useState("00:00");
  const [endTime, setEndTime] = useState("23:59");
  const [contribStr, setContribStr] = useState("100");
  const [attemptsAllowed, setAttemptsAllowed] = useState(1);
  const [showAnswersAfterAttempt, setShowAnswersAfterAttempt] = useState(true);
  const [datesTouched, setDatesTouched] = useState(false);

  const [quizVersionValue, setQuizVersionValue] = useState("");
  const [versionOptions, setVersionOptions] = useState<number[]>([]);
  const [versionLoading, setVersionLoading] = useState(false);

  const [saving, setSaving] = useState(false);
  const [hasAttempted, setHasAttempted] = useState(false);
  const [classResults, setClassResults] = useState<
    Record<
      string,
      { status: "idle" | "pending" | "success" | "error"; message?: string }
    >
  >({});
  const [fieldErrors, setFieldErrors] = useState<
    Record<string, string | string[] | undefined>
  >({});
  const [localErr, setLocalErr] = useState<string | null>(null);

  const visible = open && !!row;

  useEffect(() => {
    if (!visible) return;

    setClasses([]);
    setClassesLoading(true);
    setClassIds([]);
    setClassTimezones({});

    setStartYMD(dayKeyFromDateInTZ(new Date(), DEFAULT_TZ));
    setEndYMD(dayKeyFromDateInTZ(new Date(), DEFAULT_TZ));
    setStartTime("00:00");
    setEndTime("23:59");
    setContribStr("100");
    setAttemptsAllowed(1);
    setShowAnswersAfterAttempt(true);
    setDatesTouched(false);

    setQuizVersionValue("");
    setVersionOptions([]);
    setVersionLoading(true);

    setFieldErrors({});
    setLocalErr(null);
    setSaving(false);
    setClassResults({});
    setHasAttempted(false);

    let cancelled = false;

    (async () => {
      try {
        const data = await getClasses();
        if (cancelled) return;
        const next = Array.isArray(data)
          ? (data as Array<ClassItem & { timezone?: string }>).map((cls) => ({
              id: String(cls._id),
              name: String(cls.name ?? "Untitled class"),
              level: cls.level ? String(cls.level) : undefined,
              timezone: cls.timezone ? String(cls.timezone) : undefined,
              colorHex: cls?.metadata?.color
                ? String(cls.metadata.color)
                : undefined,
            }))
          : [];
        setClasses(next);
        const tzMap = next.reduce<Record<string, string>>((acc, cls) => {
          if (cls.timezone) acc[cls.id] = cls.timezone;
          return acc;
        }, {});
        setClassTimezones(tzMap);
        if (next.length === 1) setClassIds([next[0].id]);
      } catch {
        if (!cancelled) {
          showToast({
            title: "Failed to load classes",
            description: "Please try again.",
            variant: "error",
          });
        }
      } finally {
        if (!cancelled) setClassesLoading(false);
      }
    })();

    (async () => {
      try {
        const res = await getQuizForEdit(quizId);
        if (!res.ok) {
          throw new Error(res.message || "Failed to load quiz versions");
        }
        if (cancelled) return;
        const versions = Array.isArray(res.versions) ? res.versions : [];
        setVersionOptions(versions);
        const fallback =
          quizVersionHint ??
          res.currentVersion ??
          versions[versions.length - 1] ??
          1;
        setQuizVersionValue(String(fallback));
      } catch {
        if (!cancelled) {
          showToast({
            title: "Could not load quiz versions",
            description:
              "You can still schedule the quiz, but version data is unavailable.",
            variant: "error",
          });
          const fallback = quizVersionHint ?? 1;
          setQuizVersionValue(String(fallback));
        }
      } finally {
        if (!cancelled) setVersionLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [visible, quizId, quizVersionHint, showToast]);

  useEffect(() => {
    if (!classIds.length) return;
    const missing = classIds.filter((id) => !classTimezones[id]);
    if (!missing.length) return;

    let cancelled = false;
    (async () => {
      const updates: Record<string, string> = {};
      await Promise.all(
        missing.map(async (id) => {
          try {
            const cls = await getClass(id);
            const tz = cls?.timezone ? String(cls.timezone) : DEFAULT_TZ;
            updates[id] = tz;
          } catch {
            updates[id] = DEFAULT_TZ;
          }
        })
      );
      if (!cancelled && Object.keys(updates).length) {
        setClassTimezones((prev) => ({ ...prev, ...updates }));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [classIds, classTimezones]);

  useEffect(() => {
    if (!datesTouched) {
      setStartYMD(dayKeyFromDateInTZ(new Date(), DEFAULT_TZ));
      setEndYMD(dayKeyFromDateInTZ(new Date(), DEFAULT_TZ));
    }
  }, [datesTouched]);

  useEffect(() => {
    if (!classIds.length) {
      setClassResults({});
      return;
    }
    setClassResults((prev) => {
      const next: typeof prev = {};
      classIds.forEach((id) => {
        next[id] = prev[id] ?? { status: "idle" };
      });
      return next;
    });
  }, [classIds]);

  const classOptions = useMemo(
    () =>
      classes.map((cls) => ({
        label: cls.level ? `${cls.name} (${cls.level})` : cls.name,
        value: cls.id,
        colorHex: cls.colorHex,
      })),
    [classes]
  );

  const versionSelectOptions = useMemo(
    () =>
      Array.from(new Set(versionOptions.filter((n) => Number.isFinite(n))))
        .sort((a, b) => a - b)
        .map((v) => ({ label: `v${v}`, value: String(v) })),
    [versionOptions]
  );

  const dateErrors = [fieldErrors.startDate, fieldErrors.endDate].flatMap(
    (err) => (Array.isArray(err) ? err : err ? [err] : [])
  );

  if (!visible) return null;

  const doSave = async () => {
    setLocalErr(null);
    setFieldErrors({});

    if (!classIds.length) {
      setLocalErr("Please select at least one class.");
      return;
    }
    if (!startYMD || !endYMD) {
      setLocalErr("Start and end dates are required.");
      return;
    }

    const startMatch = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(startTime.trim());
    if (!startMatch) {
      setLocalErr("Start time must be in 24-hour HH:mm format.");
      return;
    }
    const startHour = Number(startMatch[1]);
    const startMinute = Number(startMatch[2]);

    const endMatch = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(endTime.trim());
    if (!endMatch) {
      setLocalErr("End time must be in 24-hour HH:mm format.");
      return;
    }
    const endHour = Number(endMatch[1]);
    const endMinute = Number(endMatch[2]);

    const baseStart = makeDateInTZ(
      startYMD,
      DEFAULT_TZ,
      startHour,
      startMinute,
      0,
      0
    );
    const baseEnd = makeDateInTZ(endYMD, DEFAULT_TZ, endHour, endMinute, 0, 0);
    if (baseEnd.getTime() < baseStart.getTime()) {
      setLocalErr("End date cannot be earlier than the start date.");
      return;
    }

    let contribution: number | undefined;
    {
      const t = contribStr.trim();
      if (t !== "") {
        const n = Number(t);
        if (!Number.isFinite(n) || n <= 0) {
          setFieldErrors({ contribution: "Must be a number greater than 0." });
          return;
        }
        contribution = n;
      }
    }

    if (
      !Number.isFinite(attemptsAllowed) ||
      attemptsAllowed < 1 ||
      attemptsAllowed > 10
    ) {
      setFieldErrors({
        attemptsAllowed: "Must be an integer between 1 and 10.",
      });
      return;
    }

    let quizVersion: number | undefined;
    {
      const t = quizVersionValue.trim();
      if (t !== "") {
        const n = Number(t);
        if (!Number.isFinite(n) || n <= 0) {
          setFieldErrors((prev) => ({
            ...prev,
            quizVersion: "Must be a valid version.",
          }));
          return;
        }
        quizVersion = Math.floor(n);
      }
    }

    setHasAttempted(true);
    setClassResults((prev) => {
      const next = { ...prev };
      classIds.forEach((id) => {
        next[id] = { status: "pending" };
      });
      return next;
    });
    setSaving(true);
    const results = await Promise.allSettled(
      classIds.map(async (id) => {
        const tz = classTimezones[id] || DEFAULT_TZ;
        const startDate = makeDateInTZ(
          startYMD,
          tz,
          startHour,
          startMinute,
          0,
          0
        );
        const endDate = makeDateInTZ(endYMD, tz, endHour, endMinute, 0, 0);
        return addClassQuizSchedule(id, {
          quizId,
          quizRootId: quizRootId || quizId,
          quizVersion: quizVersion ?? quizVersionHint ?? 1,
          startDate,
          endDate,
          contribution,
          attemptsAllowed,
          showAnswersAfterAttempt,
        });
      })
    );
    setSaving(false);

    const failures = results
      .map((res, idx) => ({ res, idx }))
      .filter(
        (row) =>
          row.res.status === "rejected" ||
          (row.res.status === "fulfilled" && !row.res.value.ok)
      );

    if (failures.length) {
      setLocalErr(
        `Failed to schedule ${failures.length} of ${classIds.length} classes.`
      );
      setClassResults((prev) => {
        const next = { ...prev };
        failures.forEach(({ res, idx }) => {
          const id = classIds[idx];
          let message = "Could not schedule.";
          if (res.status === "rejected") {
            message = res.reason?.message || message;
          } else if (res.status === "fulfilled" && !res.value.ok) {
            message = res.value.message || message;
          }
          next[id] = { status: "error", message };
        });
        classIds
          .filter((_, idx) => !failures.some((f) => f.idx === idx))
          .forEach((id) => {
            next[id] = { status: "success" };
          });
        return next;
      });
      showToast({
        title: "Schedule incomplete",
        description: "Some classes could not be scheduled.",
        variant: "error",
      });
      return;
    }

    setClassResults((prev) => {
      const next = { ...prev };
      classIds.forEach((id) => {
        next[id] = { status: "success" };
      });
      return next;
    });
    showToast({
      title: "Scheduled",
      description: "Quiz assigned to the selected classes.",
      variant: "success",
    });
  };

  const statusPanel = (
    <div className="rounded-lg border border-[var(--color-bg4)] bg-[var(--color-bg2)] p-3 text-sm">
      <h4 className="text-base font-semibold text-[var(--color-text-primary)]">
        Class Status
      </h4>
      <div className="mt-2 max-h-[420px] space-y-2 overflow-y-auto pr-1">
        {classIds.length === 0 && (
          <p className="text-sm text-[var(--color-text-secondary)]">
            Select classes to see scheduling status.
          </p>
        )}
        {classIds.map((id) => {
          const cls = classes.find((c) => c.id === id);
          const label = cls?.level
            ? `${cls.name} (${cls.level})`
            : cls?.name ?? "Class";
          const result = classResults[id];
          const color = cls?.colorHex || "var(--color-bg3)";
          const status = result?.status ?? "idle";
            const statusText =
              status === "pending"
                ? "Scheduling..."
                : status === "success"
                ? "Successfully scheduled"
                : status === "error"
                ? "Failed"
                : "Not scheduled";
          const statusColor =
            status === "success"
              ? "text-[var(--color-success)]"
              : status === "error"
              ? "text-[var(--color-error)]"
              : status === "pending"
              ? "text-[var(--color-primary)]"
              : "text-[var(--color-text-secondary)]";

          return (
            <div
              key={id}
              className="rounded-md border border-[var(--color-bg4)] bg-[var(--color-bg1)] p-2"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-full"
                      style={{ background: color }}
                    />
                    <div className="text-base font-medium text-[var(--color-text-primary)] truncate">
                      {label}
                    </div>
                  </div>
                  <div className={`text-sm ${statusColor}`}>{statusText}</div>
                  {result?.message ? (
                    <div className="text-sm text-[var(--color-text-secondary)]">
                      {result.message}
                    </div>
                  ) : null}
                  {status === "success" && (
                    <div className="mt-1 text-sm text-[var(--color-text-secondary)]">
                      <div>
                        Start: {startYMD} {startTime}
                      </div>
                      <div>
                        End: {endYMD} {endTime}
                      </div>
                      <div>
                        Timezone: {classTimezones[id] || DEFAULT_TZ}
                      </div>
                    </div>
                  )}
                </div>
                <Button
                  href={`/classes/${encodeURIComponent(id)}/scheduling`}
                  variant="ghost"
                  className="px-5 py-2.5 text-base whitespace-nowrap"
                  title="View class schedule"
                >
                  View Class Schedule
                </Button>
              </div>
            </div>
          );
        })}
      </div>
      {localErr ? (
        <p className="mt-2 text-sm text-[var(--color-error)]">{localErr}</p>
      ) : null}
    </div>
  );

  const resetAttempt = () => {
    setHasAttempted(false);
    setSaving(false);
    setLocalErr(null);
    setFieldErrors({});
    setClassResults((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((id) => {
        next[id] = { status: "idle" };
      });
      return next;
    });
  };

  return (
    <div
      className="fixed inset-0 z-[100] grid place-items-center bg-black/40"
      role="dialog"
    >
      <div className="w-full max-w-3xl rounded-lg bg-[var(--color-bg1)] p-6 shadow">
        <h3 className="text-lg font-semibold mb-4">
          Schedule &quot;{quizName}&quot;
        </h3>

        {!hasAttempted ? (
          <div className="space-y-3">
            <MultiSelect
              label="Select classes"
              options={classOptions}
              value={classIds}
              onChange={setClassIds}
              placeholder={
                classesLoading ? "Loading classes..." : "Choose classes"
              }
              loading={classesLoading}
              searchable
              className="w-full [&>button]:w-full"
            />

            <DateRangeField
              label="Date range"
              start={startYMD || undefined}
              end={endYMD || undefined}
              onChange={({ start, end }) => {
                setStartYMD(start || "");
                setEndYMD(end || "");
                setDatesTouched(true);
              }}
              error={dateErrors.length ? dateErrors : undefined}
              disableBeforeToday
            />

            <div>
              <TextInput
                id="start-time"
                label="Start time"
                type="time"
                step={60}
                value={startTime}
                onValueChange={setStartTime}
              />
              <TextInput
                id="end-time"
                label="End time"
                type="time"
                step={60}
                value={endTime}
                onValueChange={setEndTime}
              />
            </div>

            <TextInput
              id="contribution"
              label="Quiz Max Score (Score that students can earn)"
              placeholder="Enter a number greater than 0"
              value={contribStr}
              onValueChange={setContribStr}
              inputMode="decimal"
              pattern="[0-9]*"
              error={fieldErrors.contribution}
            />

            <NumberToggleInput
              id="attemptsAllowed"
              label="Attempts allowed (1-10)"
              min={1}
              max={10}
              step={1}
              value={attemptsAllowed}
              onChange={setAttemptsAllowed}
              error={fieldErrors.attemptsAllowed}
            />

            <Select
              id="quiz-version"
              label="Quiz version"
              value={quizVersionValue}
              onChange={setQuizVersionValue}
              options={versionSelectOptions}
              placeholder={
                versionSelectOptions.length
                  ? "Select a version"
                  : "No versions available"
              }
              error={fieldErrors.quizVersion}
              disabled={versionSelectOptions.length === 0 || versionLoading}
              colorMode="never"
            />

            <ToggleButton
              id="show-answers-after-attempt"
              label="Show answers after each attempt"
              description="If on, students see the correct answers instantly after submitting."
              on={showAnswersAfterAttempt}
              onToggle={() => setShowAnswersAfterAttempt((v) => !v)}
              error={fieldErrors.showAnswersAfterAttempt as string}
            />

            {localErr ? (
              <p className="text-xs text-[var(--color-error)]">{localErr}</p>
            ) : null}

            <div className="mt-4 flex justify-end gap-2">
              <Button
                variant="small"
                onClick={onClose}
                title="Cancel"
                disabled={saving}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                className="bg-[var(--color-primary)] text-white"
                onClick={doSave}
                title="Schedule"
                loading={saving}
              >
                Schedule
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {statusPanel}
            <div className="flex justify-end gap-2">
              <Button
                variant="small"
                onClick={onClose}
                title="Close"
                disabled={saving}
              >
                Close
              </Button>
              <Button
                variant="primary"
                className="bg-[var(--color-primary)] text-white"
                onClick={resetAttempt}
                title="Try scheduling again"
                disabled={saving}
              >
                Try scheduling again
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
