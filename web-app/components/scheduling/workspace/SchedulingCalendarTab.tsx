"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import IconButton from "@/components/ui/buttons/IconButton";
import WarningModal from "@/components/ui/WarningModal";
import ToggleButton from "@/components/ui/buttons/ToggleButton";
import DateField from "@/components/ui/selectors/DateField";
import MultiSelect from "@/components/ui/selectors/multi-select/MultiSelect";
import { useToast } from "@/components/ui/toast/ToastProvider";
import ScheduleItemEditModal from "@/components/classes/schedule-page/calendar/ScheduleItemEditModal";
import {
  deleteClassScheduleItemById,
  editClassScheduleItem,
} from "@/services/class/actions/class-schedule-actions";
import { getScheduleItemAction } from "@/services/class/actions/get-schedule-item-action";
import {
  addDaysToDayKey,
  dayKeyFromDateInTZ,
  endOfDayInTZ,
  formatMonthDayInTZ,
  formatWeekdayInTZ,
  getTimePartsInTZ,
  hasStarted,
  makeDateInTZ,
  tzDayKey,
} from "@/services/class/helpers/scheduling/scheduling-helpers";
import type { SaveResult, ScheduleItem } from "@/services/class/types/class-types";
import type { ScheduleClassBundle } from "../types";
import CalendarClassRow, { hasVisibleConflict } from "./CalendarClassRow";

function classOptions(classes: ScheduleClassBundle[]) {
  return classes.map((c) => ({
    value: c.classId,
    label: c.className || "Untitled class",
    colorHex: c.colorHex,
  }));
}

export default function SchedulingCalendarTab({
  classes,
  startKey,
  onStartKeyChange,
  onReplaceItem,
  onPatchItem,
}: {
  classes: ScheduleClassBundle[];
  startKey: string;
  onStartKeyChange: (next: string) => void;
  onReplaceItem: (classId: string, clientId: string, next: ScheduleItem | null) => void;
  onPatchItem: (classId: string, clientId: string, patch: Partial<ScheduleItem>) => void;
}) {
  const { showToast } = useToast();

  const [selectedClassIds, setSelectedClassIds] = useState<string[]>([]);
  const [showConflictsOnly, setShowConflictsOnly] = useState(false);
  const [selectedRef, setSelectedRef] = useState<{
    classId: string;
    clientId: string;
  } | null>(null);

  const [editOpen, setEditOpen] = useState(false);
  const [versionOptions, setVersionOptions] = useState<number[]>([]);
  const [versionLoading, setVersionLoading] = useState(false);

  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const dayKeys = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDaysToDayKey(startKey, i)),
    [startKey]
  );

  const headerTimezone = useMemo(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    []
  );

  const visibleClasses = useMemo(() => {
    let base = classes;
    if (selectedClassIds.length) {
      const ids = new Set(selectedClassIds);
      base = base.filter((c) => ids.has(c.classId));
    }
    if (showConflictsOnly) {
      base = base.filter((c) => hasVisibleConflict(c, dayKeys));
    }
    return base;
  }, [classes, dayKeys, selectedClassIds, showConflictsOnly]);

  const selectedClass = useMemo(
    () => classes.find((c) => c.classId === selectedRef?.classId),
    [classes, selectedRef?.classId]
  );

  const selectedItem = useMemo(
    () =>
      selectedClass?.schedule.find((it) => it.clientId === selectedRef?.clientId) ||
      null,
    [selectedClass, selectedRef?.clientId]
  );

  useEffect(() => {
    if (!selectedRef) return;
    if (!selectedClass || !selectedItem) {
      setSelectedRef(null);
    }
  }, [selectedClass, selectedItem, selectedRef]);

  const shiftWindow = useCallback(
    (days: number) => {
      onStartKeyChange(addDaysToDayKey(startKey, days));
    },
    [onStartKeyChange, startKey]
  );

  const shiftSelectedItem = useCallback(
    async (days: number) => {
      if (!selectedClass || !selectedItem || !selectedItem._id) return;
      if (hasStarted(selectedItem, selectedClass.classTimezone)) {
        showToast({
          title: "Not allowed",
          description:
            "The start time can’t be changed after the quiz has started.",
          variant: "error",
        });
        return;
      }

      const tz = selectedClass.classTimezone;
      const oldStart = new Date(selectedItem.startDate);
      const oldEnd = new Date(selectedItem.endDate);
      const oldStartKey = dayKeyFromDateInTZ(oldStart, tz);
      const oldEndKey = dayKeyFromDateInTZ(oldEnd, tz);
      const newStartKey = addDaysToDayKey(oldStartKey, days);
      const newEndKey = addDaysToDayKey(oldEndKey, days);
      const today = tzDayKey(new Date(), tz);

      if (newStartKey < today) {
        showToast({
          title: "Not allowed",
          description: "A move can’t make the schedule start before today.",
          variant: "error",
        });
        return;
      }

      const startTime = getTimePartsInTZ(oldStart, tz);
      const endTime = getTimePartsInTZ(oldEnd, tz);

      const newStart = makeDateInTZ(
        newStartKey,
        tz,
        startTime.hour,
        startTime.minute,
        startTime.second,
        oldStart.getMilliseconds()
      );
      let newEnd = makeDateInTZ(
        newEndKey,
        tz,
        endTime.hour,
        endTime.minute,
        endTime.second,
        oldEnd.getMilliseconds()
      );
      if (newEnd < newStart) newEnd = endOfDayInTZ(newEndKey, tz);

      const previous = {
        startDate: selectedItem.startDate,
        endDate: selectedItem.endDate,
      };

      onPatchItem(selectedClass.classId, selectedItem.clientId, {
        startDate: newStart.toISOString(),
        endDate: newEnd.toISOString(),
      });

      const res = await editClassScheduleItem(selectedClass.classId, selectedItem._id, {
        startDate: newStart,
        endDate: newEnd,
      });

      if (!res.ok) {
        onPatchItem(selectedClass.classId, selectedItem.clientId, previous);
        showToast({
          title: "Failed",
          description: res.message || "Could not move schedule item.",
          variant: "error",
        });
        return;
      }

      showToast({
        title: "Moved",
        description: "Schedule item moved successfully.",
        variant: "success",
      });
    },
    [onPatchItem, selectedClass, selectedItem, showToast]
  );

  const openEdit = useCallback(async () => {
    if (!selectedClass || !selectedItem) return;
    setEditOpen(true);
    setVersionOptions(
      typeof selectedItem.quizVersion === "number" ? [selectedItem.quizVersion] : []
    );
    setVersionLoading(true);

    if (!selectedItem._id) {
      setVersionLoading(false);
      return;
    }

    const res = await getScheduleItemAction(selectedClass.classId, selectedItem._id);
    if (!res.ok || !res.data) {
      const message = !res.ok ? res.message : undefined;
      setVersionLoading(false);
      showToast({
        title: "Could not load version options",
        description: message || "Using currently selected version only.",
        variant: "error",
      });
      return;
    }

    const data = res.data as Record<string, unknown>;
    const versions = Array.isArray(data.quizVersions)
      ? data.quizVersions
          .map((v) => {
            if (typeof v === "number") return v;
            if (typeof v === "object" && v !== null && "version" in v) {
              return Number((v as { version?: unknown }).version);
            }
            return Number.NaN;
          })
          .filter((v) => Number.isFinite(v))
      : [];
    const merged = new Set<number>(versions);
    if (typeof selectedItem.quizVersion === "number") merged.add(selectedItem.quizVersion);
    setVersionOptions(Array.from(merged).sort((a, b) => a - b));
    setVersionLoading(false);
  }, [selectedClass, selectedItem, showToast]);

  const saveEdit = useCallback(
    async (patch: {
      startDate?: Date;
      endDate?: Date;
      contribution?: number;
      attemptsAllowed?: number;
      showAnswersAfterAttempt?: boolean;
      quizVersion?: number;
    }): Promise<SaveResult> => {
      if (!selectedClass || !selectedItem || !selectedItem._id) {
        return { ok: false, message: "Selected schedule item is unavailable." };
      }

      const res = await editClassScheduleItem(selectedClass.classId, selectedItem._id, patch);
      if (!res.ok) {
        return {
          ok: false,
          message: res.message || "Could not update schedule.",
          fieldErrors: (res as {
            fieldErrors?: Record<string, string | string[] | undefined>;
          }).fieldErrors,
        };
      }

      onPatchItem(selectedClass.classId, selectedItem.clientId, {
        ...(patch.startDate ? { startDate: patch.startDate.toISOString() } : {}),
        ...(patch.endDate ? { endDate: patch.endDate.toISOString() } : {}),
        ...(typeof patch.contribution === "number"
          ? { contribution: patch.contribution }
          : {}),
        ...(typeof patch.attemptsAllowed === "number"
          ? { attemptsAllowed: patch.attemptsAllowed }
          : {}),
        ...(typeof patch.showAnswersAfterAttempt === "boolean"
          ? { showAnswersAfterAttempt: patch.showAnswersAfterAttempt }
          : {}),
        ...(typeof patch.quizVersion === "number"
          ? { quizVersion: patch.quizVersion }
          : {}),
      });

      showToast({
        title: "Updated",
        description: "Schedule updated.",
        variant: "success",
      });

      return { ok: true };
    },
    [onPatchItem, selectedClass, selectedItem, showToast]
  );

  const confirmDelete = useCallback(async () => {
    if (!selectedClass || !selectedItem || !selectedItem._id) {
      setDeleteConfirmOpen(false);
      return;
    }
    setDeleteLoading(true);
    const res = await deleteClassScheduleItemById(selectedClass.classId, selectedItem._id);
    setDeleteLoading(false);
    setDeleteConfirmOpen(false);

    if (!res.ok) {
      showToast({
        title: "Failed",
        description: res.message || "Could not delete schedule item.",
        variant: "error",
      });
      return;
    }

    onReplaceItem(selectedClass.classId, selectedItem.clientId, null);
    setSelectedRef(null);
    showToast({
      title: "Removed",
      description: "Schedule item deleted.",
      variant: "success",
    });
  }, [onReplaceItem, selectedClass, selectedItem, showToast]);

  return (
    <>
      <div className="space-y-4">
        <section className="rounded-lg border border-[var(--color-bg4)] bg-[var(--color-bg2)] p-4">
          <div className="flex flex-wrap items-end gap-3">
            <DateField
              label="Go to date"
              value={startKey}
              onChange={(next) => next && onStartKeyChange(next)}
            />

            <div className="min-w-[300px]">
              <MultiSelect
                label="Visible classes"
                options={classOptions(classes)}
                value={selectedClassIds}
                onChange={setSelectedClassIds}
                placeholder="All classes"
                searchable
                className="w-full"
              />
            </div>

            <div className="min-w-[230px] rounded-md border border-[var(--color-bg4)] bg-[var(--color-bg1)] p-3">
              <ToggleButton
                id="conflict-toggle"
                label="Show conflicts only"
                on={showConflictsOnly}
                onToggle={() => setShowConflictsOnly((v) => !v)}
                description="Shows classes where more than one quiz is scheduled on the same day."
              />
            </div>

            <div className="ml-auto flex items-center gap-2">
              <IconButton
                icon="mingcute:left-line"
                variant="pagination"
                size="sm"
                title="Previous day"
                onClick={() => shiftWindow(-1)}
              />
              <IconButton
                icon="mingcute:right-line"
                variant="pagination"
                size="sm"
                title="Next day"
                onClick={() => shiftWindow(1)}
              />
            </div>
          </div>
        </section>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
          <section className="rounded-lg border border-[var(--color-bg4)] bg-[var(--color-bg2)] p-4">
            <div className="mb-3 grid grid-cols-7 gap-2">
              {dayKeys.map((dayKey) => (
                <div
                  key={dayKey}
                  className="rounded-md border border-[var(--color-bg4)] bg-[var(--color-bg1)] px-2 py-1.5"
                >
                  <p className="text-xs font-semibold text-[var(--color-text-primary)]">
                    {formatWeekdayInTZ(dayKey, headerTimezone)}
                  </p>
                  <p className="text-xs text-[var(--color-text-secondary)]">
                    {formatMonthDayInTZ(dayKey, headerTimezone)}
                  </p>
                </div>
              ))}
            </div>

            <div className="max-h-[calc(100vh-360px)] space-y-3 overflow-y-auto pr-1">
              {visibleClasses.length ? (
                visibleClasses.map((cls) => (
                  <CalendarClassRow
                    key={cls.classId}
                    cls={cls}
                    dayKeys={dayKeys}
                    selectedClientId={
                      selectedRef?.classId === cls.classId
                        ? selectedRef.clientId
                        : undefined
                    }
                    onSelectItem={(item) =>
                      setSelectedRef({
                        classId: cls.classId,
                        clientId: item.clientId,
                      })
                    }
                  />
                ))
              ) : (
                <div className="rounded-md border border-[var(--color-bg4)] bg-[var(--color-bg1)] p-4 text-sm text-[var(--color-text-secondary)]">
                  No classes match the current filters.
                </div>
              )}
            </div>
          </section>

          <aside className="rounded-lg border border-[var(--color-bg4)] bg-[var(--color-bg2)] p-4">
            <h3 className="text-md font-semibold text-[var(--color-text-primary)]">
              Inspector
            </h3>

            {!selectedClass || !selectedItem ? (
              <p className="mt-3 text-sm text-[var(--color-text-secondary)]">
                Select a scheduled quiz pill to view and edit its details.
              </p>
            ) : (
              <div className="mt-3 space-y-3">
                <div className="rounded-md border border-[var(--color-bg4)] bg-[var(--color-bg1)] p-3">
                  <p className="text-xs text-[var(--color-text-secondary)]">Quiz</p>
                  <p className="text-sm font-medium text-[var(--color-text-primary)]">
                    {selectedItem.quizName || selectedItem.quizId}
                  </p>
                  <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
                    {selectedClass.className || "Untitled class"} •{" "}
                    {selectedClass.classTimezone}
                  </p>
                </div>

                <div className="rounded-md border border-[var(--color-bg4)] bg-[var(--color-bg1)] p-3 text-xs text-[var(--color-text-secondary)]">
                  <p>Starts: {new Date(selectedItem.startDate).toLocaleString()}</p>
                  <p>Ends: {new Date(selectedItem.endDate).toLocaleString()}</p>
                  <p>Version: v{selectedItem.quizVersion}</p>
                  <p>Contribution: {selectedItem.contribution ?? 100}%</p>
                  <p>Attempts: {selectedItem.attemptsAllowed ?? 1}</p>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    className="rounded-md border border-[var(--color-bg4)] bg-[var(--color-bg1)] px-3 py-2 text-sm hover:bg-[var(--color-bg3)]"
                    onClick={() => shiftSelectedItem(-1)}
                  >
                    Move -1 day
                  </button>
                  <button
                    type="button"
                    className="rounded-md border border-[var(--color-bg4)] bg-[var(--color-bg1)] px-3 py-2 text-sm hover:bg-[var(--color-bg3)]"
                    onClick={() => shiftSelectedItem(1)}
                  >
                    Move +1 day
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="rounded-md bg-[var(--color-primary)] px-3 py-2 text-sm text-white hover:opacity-90"
                    onClick={openEdit}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="rounded-md bg-[var(--color-error)] px-3 py-2 text-sm text-white hover:opacity-90"
                    onClick={() => setDeleteConfirmOpen(true)}
                  >
                    Delete
                  </button>
                </div>
              </div>
            )}
          </aside>
        </div>
      </div>

      <ScheduleItemEditModal
        open={editOpen}
        item={selectedItem}
        versionOptions={versionOptions}
        versionLoading={versionLoading}
        classTimezone={selectedClass?.classTimezone || "UTC"}
        onClose={() => setEditOpen(false)}
        onSave={saveEdit}
        onDelete={() => setDeleteConfirmOpen(true)}
      />

      <WarningModal
        open={deleteConfirmOpen}
        title="Delete this scheduled quiz?"
        message="This removes the schedule from this class."
        cancelLabel="Cancel"
        continueLabel={deleteLoading ? "Deleting..." : "Delete"}
        onCancel={() => {
          if (!deleteLoading) setDeleteConfirmOpen(false);
        }}
        onContinue={deleteLoading ? () => {} : confirmDelete}
      />
    </>
  );
}
