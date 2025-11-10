import { useCallback, useEffect, useRef, useState } from "react";
import type { ScheduleItem } from "@/services/class/types/class-types";
import {
  deleteClassScheduleItemById,
  editClassScheduleItem,
} from "@/services/class/actions/class-schedule-actions";

type QueuedEditPatch = {
  startDate?: Date;
  endDate?: Date;
  attemptsAllowed?: number; // NEW
  showAnswersAfterAttempt?: boolean; // NEW
};

export function useScheduleQueues(
  classId: string,
  initial: ScheduleItem[],
  showToast: (opts: {
    title: string;
    description?: string;
    variant: "success" | "error";
  }) => void,
  formatFieldErrors: (fe?: any) => string
) {
  const [schedule, setSchedule] = useState<ScheduleItem[]>(() => initial);

  // queues + snapshots
  const pendingCreateRef = useRef<Record<string, Promise<string>>>({});
  const pendingEditRef = useRef<Record<string, QueuedEditPatch>>({}); // UPDATED
  const pendingDeleteRef = useRef<Record<string, true>>({});
  const editSnapshotRef = useRef<Record<string, ScheduleItem[]>>({});
  const deleteSnapshotRef = useRef<Record<string, ScheduleItem[]>>({});
  const drainingRef = useRef<Record<string, boolean>>({});

  const ensureScheduleId = useCallback(
    async (clientId: string) => {
      const item = schedule.find((s) => s.clientId === clientId);
      if (item?._id) return item._id;
      const p = pendingCreateRef.current[clientId];
      if (p) return p;
      throw new Error("Schedule id not available yet");
    },
    [schedule]
  );

  const drainQueuesFor = useCallback(
    async (clientId: string) => {
      if (drainingRef.current[clientId]) return;
      drainingRef.current[clientId] = true;
      try {
        const exists = schedule.some((s) => s.clientId === clientId);
        const wantsDelete = !!pendingDeleteRef.current[clientId];

        // --- DELETE path (unchanged) ---
        if (wantsDelete) {
          try {
            console.log("Draining delete for", clientId);
            const scheduleId = await ensureScheduleId(clientId);
            console.log("Ensured schedule ID:", scheduleId);
            const del = await deleteClassScheduleItemById(classId, scheduleId);
            if (!del.ok) {
              const snap = deleteSnapshotRef.current[clientId];
              if (snap) setSchedule(snap);
              showToast({
                title: "Failed",
                description:
                  (del.message || "Could not remove quiz.") +
                  formatFieldErrors((del as any).fieldErrors),
                variant: "error",
              });
            } else {
              showToast({
                title: "Removed",
                description: "Quiz removed from schedule.",
                variant: "success",
              });
            }
          } catch {
            return; // keep tombstone; retry later
          } finally {
            delete pendingDeleteRef.current[clientId];
            delete deleteSnapshotRef.current[clientId];
            setSchedule((s) => s.filter((x) => x.clientId !== clientId));
            delete pendingEditRef.current[clientId];
            delete editSnapshotRef.current[clientId];
          }
          return;
        }

        if (!exists) return;

        // --- EDIT path (generalized) ---
        const edit = pendingEditRef.current[clientId];
        if (!edit) return;

        try {
          const scheduleId = await ensureScheduleId(clientId);
          const latest = pendingEditRef.current[clientId];
          if (!latest) return;

          const upsert = await editClassScheduleItem(classId, scheduleId, {
            ...(latest.startDate ? { startDate: latest.startDate } : {}),
            ...(latest.endDate ? { endDate: latest.endDate } : {}),
            ...(typeof latest.attemptsAllowed === "number"
              ? { attemptsAllowed: latest.attemptsAllowed }
              : {}),
            ...(typeof latest.showAnswersAfterAttempt === "boolean"
              ? { showAnswersAfterAttempt: latest.showAnswersAfterAttempt }
              : {}),
          });

          if (!upsert.ok) {
            const snap = editSnapshotRef.current[clientId];
            if (snap) setSchedule(snap);
            showToast({
              title: "Failed",
              description:
                (upsert.message || "Could not update schedule.") +
                formatFieldErrors((upsert as any).fieldErrors),
              variant: "error",
            });
          } else {
            showToast({
              title: "Updated",
              description: "Schedule updated.",
              variant: "success",
            });
          }
        } catch {
          return; // retry later
        } finally {
          delete pendingEditRef.current[clientId];
          delete editSnapshotRef.current[clientId];
        }
      } finally {
        drainingRef.current[clientId] = false;
      }
    },
    [classId, schedule, showToast, formatFieldErrors, ensureScheduleId]
  );

  // seen id watcher (unchanged)
  const seenIdRef = useRef<Record<string, boolean>>({});
  useEffect(() => {
    for (const it of schedule) {
      const prev = seenIdRef.current[it.clientId] ?? false;
      const now = !!it._id;
      if (
        now &&
        !prev &&
        (pendingDeleteRef.current[it.clientId] ||
          pendingEditRef.current[it.clientId])
      ) {
        void drainQueuesFor(it.clientId);
      }
      seenIdRef.current[it.clientId] = now;
    }
  }, [schedule, drainQueuesFor]);

  return {
    schedule,
    setSchedule,
    pendingCreateRef,
    pendingEditRef,
    pendingDeleteRef,
    editSnapshotRef,
    deleteSnapshotRef,
    ensureScheduleId,
    drainQueuesFor,
  };
}
