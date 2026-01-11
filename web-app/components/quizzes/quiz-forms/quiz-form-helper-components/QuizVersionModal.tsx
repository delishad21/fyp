"use client";

import * as React from "react";
import WarningModal from "@/components/ui/WarningModal";

type Props = {
  open: boolean;
  onCancel: () => void;
  onConfirm: (updateActiveSchedules: boolean) => void;
  /** Optional hint so we can warn more strongly when questions changed. */
  contentChanged?: boolean;
};

export default function QuizVersionModal({
  open,
  onCancel,
  onConfirm,
  contentChanged = false,
}: Props) {
  const [updateActiveSchedules, setUpdateActiveSchedules] =
    React.useState(true);

  const checkboxId = "update-active-schedules";

  return (
    <WarningModal
      open={open}
      title="Save quiz as a new version?"
      message={
        <div className="space-y-4 text-sm">
          {/* Intro */}
          <p>
            These changes will be saved as{" "}
            <span className="font-semibold">a new version</span> of this quiz.
          </p>

          {/* Checkbox row */}
          <div className="flex items-start gap-2">
            <input
              id={checkboxId}
              type="checkbox"
              className="mt-[3px]"
              checked={updateActiveSchedules}
              onChange={(e) => setUpdateActiveSchedules(e.target.checked)}
            />
            <div className="space-y-1">
              <label
                htmlFor={checkboxId}
                className="font-medium cursor-pointer"
              >
                Update active and future schedules to use this new version
              </label>
              {contentChanged ? (
                <p className="pt-2 text-xs text-[var(--color-error)]">
                  Question content has changed, existing attempts for updated
                  schedules will be invalidated.
                </p>
              ) : (
                <p className="pt-2 text-xs text-[var(--color-success)]">
                  Only quiz details (like name, subject, or topic) changed.
                  Updating schedules will not reset existing attempts.
                </p>
              )}
            </div>
          </div>
        </div>
      }
      cancelLabel="Cancel"
      continueLabel="Save"
      onCancel={onCancel}
      onContinue={() => onConfirm(updateActiveSchedules)}
    />
  );
}
