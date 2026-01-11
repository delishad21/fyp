"use client";

import { useCallback, useState } from "react";
import type { ScheduleItem } from "@/services/class/types/class-types";
import { editClassScheduleItem } from "@/services/class/actions/class-schedule-actions";
import { getScheduleItemAction } from "@/services/class/actions/get-schedule-item-action";

type Patch = {
  startDate?: Date;
  endDate?: Date;
  contribution?: number;
  attemptsAllowed?: number;
  showAnswersAfterAttempt?: boolean;
  quizVersion?: number;
};

export function useScheduleEditModal(
  classId: string,
  showToast: (o: {
    title: string;
    description?: string;
    variant: "success" | "error";
  }) => void
) {
  const [editOpen, setEditOpen] = useState(false);
  const [editItem, setEditItem] = useState<ScheduleItem | null>(null);

  const [versionOptions, setVersionOptions] = useState<number[]>([]);
  const [versionLoading, setVersionLoading] = useState(false);

  const handleOpenEdit = useCallback(
    (it: ScheduleItem) => {
      setEditItem(it);
      setEditOpen(true);

      // Reset version state
      setVersionOptions(
        typeof (it as any).quizVersion === "number"
          ? [(it as any).quizVersion]
          : []
      );
      setVersionLoading(true);

      // If the schedule row has no _id yet (optimistic only), we can't fetch stats/versions
      if (!it._id) {
        setVersionLoading(false);
        return;
      }

      (async () => {
        try {
          const res = await getScheduleItemAction(classId, it._id!);
          if (!res.ok || !res.data) {
            throw new Error("Failed to load schedule details");
          }

          const data = res.data as any;

          // Merge extra fields (including rootQuizId, quizVersion, etc.) into the item
          setEditItem((prev) =>
            prev && prev.clientId === it.clientId
              ? ({ ...prev, ...data } as ScheduleItem)
              : prev
          );

          // Backend returns quizVersions as an array of rows; map to numbers
          const versions: number[] = Array.isArray(data.quizVersions)
            ? data.quizVersions
                .map((row: any) => Number(row.version))
                .filter((n: number) => Number.isFinite(n))
            : [];

          // Fallback: ensure current version is included
          const currentVersion =
            typeof data.quizVersion === "number"
              ? data.quizVersion
              : typeof (it as any).quizVersion === "number"
              ? (it as any).quizVersion
              : undefined;

          const merged = new Set<number>(versions);
          if (typeof currentVersion === "number") merged.add(currentVersion);

          setVersionOptions(Array.from(merged).sort((a, b) => a - b));
        } catch (err) {
          console.error("[useScheduleEditModal] failed to load versions", err);

          // Show a soft error and keep ONLY the current version (no change possible)
          showToast({
            title: "Could not load quiz versions",
            description:
              "You can still edit dates and settings, but cannot change the quiz version right now.",
            variant: "error",
          });

          // Keep whatever we initially set (current version only)
        } finally {
          setVersionLoading(false);
        }
      })();
    },
    [classId, showToast]
  );

  const handleCloseEdit = useCallback(() => {
    setEditOpen(false);
    setEditItem(null);
    setVersionOptions([]);
    setVersionLoading(false);
  }, []);

  const handleSaveEdit = useCallback(
    async (
      patch: Patch,
      schedule: ScheduleItem[],
      setSchedule: React.Dispatch<React.SetStateAction<ScheduleItem[]>>,
      pendingCreateRef: React.MutableRefObject<Record<string, Promise<string>>>
    ) => {
      if (!editItem) return { ok: false, message: "No item" as string };

      const apiPatch: any = {};
      if (patch.startDate) apiPatch.startDate = patch.startDate;
      if (patch.endDate) apiPatch.endDate = patch.endDate;
      if (typeof patch.contribution === "number")
        apiPatch.contribution = patch.contribution;
      if (typeof patch.attemptsAllowed === "number")
        apiPatch.attemptsAllowed = patch.attemptsAllowed;
      if (typeof patch.showAnswersAfterAttempt === "boolean")
        apiPatch.showAnswersAfterAttempt = patch.showAnswersAfterAttempt;
      if (typeof patch.quizVersion === "number")
        apiPatch.quizVersion = patch.quizVersion;

      try {
        const scheduleId =
          editItem._id ||
          (await (pendingCreateRef.current[editItem.clientId] ??
            Promise.reject(new Error("Schedule not yet created"))));

        const res = await editClassScheduleItem(classId, scheduleId, apiPatch);
        if (!res.ok) {
          return {
            ok: false,
            message: res.message || "Could not update schedule.",
            fieldErrors: (res as any).fieldErrors,
          } as any;
        }

        setSchedule((s) =>
          s.map((it) =>
            it.clientId === editItem.clientId
              ? {
                  ...it,
                  ...(patch.startDate
                    ? { startDate: patch.startDate.toISOString() }
                    : {}),
                  ...(patch.endDate
                    ? { endDate: patch.endDate.toISOString() }
                    : {}),
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
                }
              : it
          )
        );

        showToast({
          title: "Updated",
          description: "Schedule updated.",
          variant: "success",
        });
        return { ok: true };
      } catch (err: any) {
        return {
          ok: false,
          message: err?.message || "Could not update schedule.",
        };
      }
    },
    [classId, editItem, showToast]
  );

  return {
    editOpen,
    editItem,
    handleOpenEdit,
    handleCloseEdit,
    handleSaveEdit,
    versionOptions,
    versionLoading,
  };
}
