import { useCallback, useState } from "react";
import type { ScheduleItem } from "@/services/class/types/class-types";
import { editClassScheduleItem } from "@/services/class/actions/class-schedule-actions";

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

  const handleOpenEdit = useCallback((it: ScheduleItem) => {
    setEditItem(it);
    setEditOpen(true);
  }, []);
  const handleCloseEdit = useCallback(() => {
    setEditOpen(false);
    setEditItem(null);
  }, []);

  const handleSaveEdit = useCallback(
    async (
      patch: { startDate?: Date; endDate?: Date; contribution?: number },
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
  };
}
