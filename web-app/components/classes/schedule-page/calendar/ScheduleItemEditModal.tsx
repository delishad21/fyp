"use client";

import { useEffect, useMemo, useState } from "react";
import Button from "@/components/ui/buttons/Button";
import TextInput from "@/components/ui/text-inputs/TextInput";
import DateField from "@/components/ui/selectors/DateField";
import ToggleButton from "@/components/ui/buttons/ToggleButton";
import {
  SaveResult,
  ScheduleItemLike,
} from "@/services/class/types/class-types";
import {
  dateToLocalYMD,
  ymdToLocalDate,
  endOfLocalDate,
} from "@/services/class/helpers/scheduling/scheduling-helpers";

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
    // NEW
    attemptsAllowed?: number;
    showAnswersAfterAttempt?: boolean;
  }) => Promise<SaveResult>;
}) {
  const visible = open && !!item;
  const initial = item;

  // Controlled fields
  const [startYMD, setStartYMD] = useState<string>("");
  const [endYMD, setEndYMD] = useState<string>("");
  const [contribStr, setContribStr] = useState<string>("");

  // NEW policy fields (controlled)
  const [attemptsAllowedStr, setAttemptsAllowedStr] = useState<string>("");
  const [showAnswersAfterAttempt, setShowAnswersAfterAttempt] =
    useState<boolean>(false);

  const [saving, setSaving] = useState(false);

  const [fieldErrors, setFieldErrors] = useState<
    Record<string, string | string[] | undefined>
  >({});
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

    // NEW: hydrate policy fields
    setAttemptsAllowedStr(
      typeof initial.attemptsAllowed === "number"
        ? String(initial.attemptsAllowed)
        : ""
    );
    setShowAnswersAfterAttempt(Boolean(initial.showAnswersAfterAttempt));

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

    // Date validation
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

    // NEW: attemptsAllowed (optional; must be 1..10 when provided)
    let attemptsAllowed: number | undefined;
    {
      const t = attemptsAllowedStr.trim();
      if (t !== "") {
        const n = Number(t);
        if (!Number.isFinite(n) || n < 1 || n > 10) {
          setFieldErrors({
            attemptsAllowed: "Must be an integer between 1 and 10.",
          });
          return;
        }
        attemptsAllowed = Math.floor(n);
      }
    }

    // NEW: showAnswersAfterAttempt (boolean already controlled)

    setSaving(true);
    const res = await onSave({
      startDate: s,
      endDate: e,
      contribution,
      attemptsAllowed, // only sent if defined
      showAnswersAfterAttempt,
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
      <div className="w-full max-w-md rounded-2xl bg-[var(--color-bg1)] p-4 shadow">
        <h3 className="text-lg font-semibold mb-3">{title}</h3>

        <div className="space-y-3">
          <DateField
            label="Start date"
            value={startYMD}
            onChange={(next) => setStartYMD(next || "")}
            error={fieldErrors.startDate as any}
          />

          <DateField
            label="End date"
            value={endYMD}
            onChange={(next) => setEndYMD(next || "")}
            error={fieldErrors.endDate as any}
          />

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

          {/* NEW: Attempts allowed (1..10) */}
          <TextInput
            id="attemptsAllowed"
            label="Attempts allowed (1–10)"
            placeholder="Leave blank to keep current/default (1)"
            value={attemptsAllowedStr}
            onValueChange={setAttemptsAllowedStr}
            inputMode="numeric"
            pattern="[0-9]*"
            error={fieldErrors.attemptsAllowed as any}
          />

          {/* NEW: Show answers after each attempt */}
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
