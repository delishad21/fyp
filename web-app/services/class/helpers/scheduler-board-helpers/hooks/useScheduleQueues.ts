import { useCallback, useEffect, useRef, useState } from "react";
import type { ScheduleItem } from "@/services/class/types/class-types";
import {
  addClassQuizSchedule,
  deleteClassScheduleItemById,
  editClassScheduleItem,
} from "@/services/class/actions/class-schedule-actions";

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
  const pendingEditRef = useRef<
    Record<string, { startDate: Date; endDate: Date }>
  >({});
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

        // --- DELETE path (verbatim) ---
        if (wantsDelete) {
          try {
            const scheduleId = await ensureScheduleId(clientId);
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

        // --- EDIT path (verbatim) ---
        const edit = pendingEditRef.current[clientId];
        if (!edit) return;

        try {
          const scheduleId = await ensureScheduleId(clientId);
          const latest = pendingEditRef.current[clientId];
          if (!latest) return;

          const upsert = await editClassScheduleItem(classId, scheduleId, {
            startDate: latest.startDate,
            endDate: latest.endDate,
          });

          if (!upsert.ok) {
            const snap = editSnapshotRef.current[clientId];
            if (snap) setSchedule(snap);
            showToast({
              title: "Failed",
              description:
                (upsert.message || "Could not update quiz dates.") +
                formatFieldErrors((upsert as any).fieldErrors),
              variant: "error",
            });
          } else {
            showToast({
              title: "Updated",
              description: "Quiz duration updated.",
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

  // seen id watcher (verbatim)
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

  // expose the exact refs so callers can use *same logic*
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
