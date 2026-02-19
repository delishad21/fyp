"use client";

import { useEffect, useMemo, useState } from "react";
import Button from "@/components/ui/buttons/Button";
import TextInput from "@/components/ui/text-inputs/TextInput";
import NumberToggleInput from "@/components/ui/text-inputs/NumberToggleInput";
import DateRangeField from "@/components/ui/selectors/DateRangeField";
import ToggleButton from "@/components/ui/buttons/ToggleButton";
import Select from "@/components/ui/selectors/select/Select";

import {
  SaveResult,
  ScheduleItemLike,
} from "@/services/class/types/class-types";
import {
  dayKeyFromDateInTZ,
  formatTimeInTZ,
  makeDateInTZ,
} from "@/services/class/helpers/scheduling/scheduling-helpers";

export default function ScheduleItemEditModal({
  open,
  item,
  versionOptions,
  versionLoading,
  onClose,
  onSave,
  onDelete,
  deleteLoading = false,
  classTimezone,
}: {
  open: boolean;
  item: ScheduleItemLike | null;
  versionOptions: number[];
  versionLoading: boolean;
  onClose: () => void;
  onSave: (patch: {
    startDate?: Date;
    endDate?: Date;
    contribution?: number;
    attemptsAllowed?: number;
    showAnswersAfterAttempt?: boolean;
    quizVersion?: number;
  }) => Promise<SaveResult>;
  onDelete?: () => void;
  deleteLoading?: boolean;
  classTimezone: string;
}) {
  const visible = open && !!item;
  const initial = item;

  // Controlled fields
  const [startYMD, setStartYMD] = useState<string>("");
  const [endYMD, setEndYMD] = useState<string>("");
  const [startTime, setStartTime] = useState<string>("00:00");
  const [endTime, setEndTime] = useState<string>("23:59");
  const [contribStr, setContribStr] = useState<string>("");

  // Policy fields
  const [attemptsAllowed, setAttemptsAllowed] = useState<number>(1);
  const [showAnswersAfterAttempt, setShowAnswersAfterAttempt] =
    useState<boolean>(false);

  // Version select (string value for <Select>)
  const [quizVersionValue, setQuizVersionValue] = useState<string>("");

  const [saving, setSaving] = useState(false);
  const isStarted = useMemo(
    () =>
      initial ? new Date(initial.startDate).getTime() <= Date.now() : false,
    [initial]
  );

  const [fieldErrors, setFieldErrors] = useState<
    Record<string, string | string[] | undefined>
  >({});
  const [localErr, setLocalErr] = useState<string | null>(null);
  const dateErrors = [fieldErrors.startDate, fieldErrors.endDate].flatMap(
    (err) => (Array.isArray(err) ? err : err ? [err] : [])
  );

  // When item OR versionOptions change, rehydrate modal state
  useEffect(() => {
    if (!initial) return;

    const s = new Date(initial.startDate);
    const e = new Date(initial.endDate);
    setStartYMD(dayKeyFromDateInTZ(s, classTimezone));
    setEndYMD(dayKeyFromDateInTZ(e, classTimezone));
    setStartTime(formatTimeInTZ(s, classTimezone));
    setEndTime(formatTimeInTZ(e, classTimezone));

    setContribStr(
      typeof initial.contribution === "number"
        ? String(initial.contribution)
        : ""
    );

    setAttemptsAllowed(
      typeof initial.attemptsAllowed === "number" ? initial.attemptsAllowed : 1
    );
    setShowAnswersAfterAttempt(Boolean(initial.showAnswersAfterAttempt));

    // Prefer the schedule's current quizVersion; fall back to latest available
    const currentVersion =
      typeof initial.quizVersion === "number"
        ? initial.quizVersion
        : versionOptions.length
        ? versionOptions[versionOptions.length - 1]
        : undefined;

    setQuizVersionValue(
      typeof currentVersion === "number" ? String(currentVersion) : ""
    );

    setFieldErrors({});
    setLocalErr(null);
    setSaving(false);
  }, [initial, versionOptions, classTimezone]);

  const versionSelectOptions = useMemo(
    () =>
      Array.from(new Set(versionOptions.filter((n) => Number.isFinite(n))))
        .sort((a, b) => a - b)
        .map((v) => ({
          label: `v${v}`,
          value: String(v),
        })),
    [versionOptions]
  );

  const title = useMemo(
    () => (initial?.quizName ? `Edit “${initial.quizName}”` : "Edit schedule"),
    [initial?.quizName]
  );

  if (!visible) return null;

  const doSave = async () => {
    setLocalErr(null);
    setFieldErrors({});

    // Date validation
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

    const s = makeDateInTZ(
      startYMD,
      classTimezone,
      startHour,
      startMinute,
      0,
      0
    );
    const e = makeDateInTZ(endYMD, classTimezone, endHour, endMinute, 0, 0);
    if (e.getTime() < s.getTime()) {
      setLocalErr("End date cannot be earlier than the start date.");
      return;
    }

    // Contribution
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

    // attemptsAllowed (must be 1..10)
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

    // quizVersion (optional; positive int)
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

    setSaving(true);
    const res = await onSave({
      startDate: s,
      endDate: e,
      contribution,
      attemptsAllowed,
      showAnswersAfterAttempt,
      quizVersion,
    });
    setSaving(false);

    if (!res.ok) {
      if (res.fieldErrors && typeof res.fieldErrors === "object") {
        setFieldErrors(res.fieldErrors);
      }
      if (res.message && !res.fieldErrors) setLocalErr(res.message);
      return;
    }

    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[100] grid place-items-center bg-black/40"
      role="dialog"
    >
      <div className="w-full max-w-md rounded-lg bg-[var(--color-bg1)] p-6 shadow">
        <h3 className="text-lg font-semibold mb-3">{title}</h3>

        <div className="space-y-3">
          <DateRangeField
            label="Date range"
            start={startYMD || undefined}
            end={endYMD || undefined}
            onChange={({ start, end }) => {
              setStartYMD(start || "");
              setEndYMD(end || "");
            }}
            error={dateErrors.length ? dateErrors : undefined}
          />
          <div>
          <TextInput
            id="start-time"
            label={`Start time (${classTimezone})`}
            type="time"
            step={60}
            value={startTime}
            onValueChange={setStartTime}
            readOnly={isStarted}
          />
          {isStarted ? (
            <p className="text-xs text-[var(--color-text-secondary)]">
              Start time can’t be edited after the quiz has started.
            </p>
          ) : null}
          <TextInput
            id="end-time"
            label={`End time (${classTimezone})`}
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
            id="quizVersion"
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
        </div>

        <div className="mt-4 flex justify-end gap-2">
          {onDelete && (
            <Button
              variant="error"
              onClick={onDelete}
              title="Delete"
              disabled={saving || deleteLoading}
              loading={deleteLoading}
              className="mr-auto"
            >
              Delete
            </Button>
          )}
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
            title="Save"
            loading={saving}
          >
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}
