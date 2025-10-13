"use client";
import { useEffect, useMemo, useState } from "react";
import Button from "@/components/ui/buttons/Button";
import TextInput from "@/components/ui/text-inputs/TextInput";
import DateField from "@/components/ui/selectors/DateField";
import {
  SaveResult,
  ScheduleItemLike,
} from "@/services/class/types/class-types";
import {
  dateToLocalYMD,
  ymdToLocalDate,
  endOfLocalDate,
} from "@/services/class/helpers/scheduling/scheduling-helpers";

/**
 * Modal is non-optimistic:
 * - Calls onSave(patch) and waits.
 * - Shows inline errors via DateField/TextInput `error` props.
 * - Shows loading state on the Save button.
 * - Only closes when onSave resolves { ok: true }.
 *
 * Contribution: must be a number > 0 (no upper bound). Empty = omit from patch.
 */
export default function ScheduleItemEditModal({
  open,
  item,
  onClose,
  onSave,
}: {
  open: boolean;
  item: ScheduleItemLike | null;
  onClose: () => void;
  onSave: (patch: {
    startDate?: Date;
    endDate?: Date;
    contribution?: number;
  }) => Promise<SaveResult>;
}) {
  const visible = open && !!item;
  const initial = item;

  // Controlled local fields
  const [startYMD, setStartYMD] = useState<string>("");
  const [endYMD, setEndYMD] = useState<string>("");
  const [contribStr, setContribStr] = useState<string>("");
  const [saving, setSaving] = useState(false);

  // inline field errors (from backend)
  const [fieldErrors, setFieldErrors] = useState<
    Record<string, string | string[] | undefined>
  >({});
  // top-level local error (pre-submit)
  const [localErr, setLocalErr] = useState<string | null>(null);

  useEffect(() => {
    if (!initial) return;
    const s = new Date(initial.startDate);
    const e = new Date(initial.endDate);
    setStartYMD(dateToLocalYMD(s));
    setEndYMD(dateToLocalYMD(e));
    setContribStr(
      typeof initial.contribution === "number"
        ? String(initial.contribution)
        : ""
    );
    setFieldErrors({});
    setLocalErr(null);
    setSaving(false);
  }, [initial]);

  const title = useMemo(
    () => (initial?.quizName ? `Edit “${initial.quizName}”` : "Edit schedule"),
    [initial?.quizName]
  );

  if (!visible) return null;

  const doSave = async () => {
    setLocalErr(null);
    setFieldErrors({});

    // Local validation: dates required and end >= start (full-day inclusive)
    if (!startYMD || !endYMD) {
      setLocalErr("Start and end dates are required.");
      return;
    }
    const s = ymdToLocalDate(startYMD);
    const e = endOfLocalDate(endYMD);
    if (e.getTime() < s.getTime()) {
      setLocalErr("End date cannot be earlier than the start date.");
      return;
    }

    // Contribution: empty -> omit; else must be > 0
    let c: number | undefined;
    const trimmed = contribStr.trim();
    if (trimmed === "") {
      c = undefined;
    } else {
      const parsed = Number(trimmed);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        setFieldErrors({ contribution: "Must be a number greater than 0." });
        return;
      }
      c = parsed;
    }

    setSaving(true);
    const res = await onSave({ startDate: s, endDate: e, contribution: c });
    setSaving(false);

    if (!res.ok) {
      // stay open; surface fieldErrors inline (if any)
      if (res.fieldErrors && typeof res.fieldErrors === "object") {
        setFieldErrors(res.fieldErrors);
      }
      if (res.message && !res.fieldErrors) setLocalErr(res.message);
      return;
    }

    // success
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[100] grid place-items-center bg-black/40"
      role="dialog"
    >
      <div className="w-full max-w-md rounded-2xl bg-[var(--color-bg1)] p-4 shadow">
        <h3
          id="edit-schedule-modal-title"
          className="text-lg font-semibold mb-3"
        >
          {title}
        </h3>

        <div className="space-y-3">
          {/* Start date */}
          <DateField
            label="Start date"
            value={startYMD}
            onChange={(next) => setStartYMD(next || "")}
            error={fieldErrors.startDate as any}
          />

          {/* End date */}
          <DateField
            label="End date"
            value={endYMD}
            onChange={(next) => setEndYMD(next || "")}
            error={fieldErrors.endDate as any}
          />

          {/* Contribution (spinner-less text input) */}
          <TextInput
            id="contribution"
            label="Contribution"
            placeholder="Enter a number greater than 0"
            value={contribStr}
            onValueChange={setContribStr}
            inputMode="decimal"
            pattern="[0-9]*"
            error={fieldErrors.contribution as any}
          />

          {localErr ? (
            <p className="text-xs text-[var(--color-error)]">{localErr}</p>
          ) : null}

          <p className="text-xs text-[var(--color-text-secondary)]">
            Full-day scheduling. You can still drag to move/resize pills on the
            calendar.
          </p>
        </div>

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
