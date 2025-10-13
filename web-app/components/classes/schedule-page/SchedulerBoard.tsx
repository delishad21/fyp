"use client";

import { useCallback, useEffect, useRef, useState, useMemo } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MeasuringStrategy,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";

import QuizzesTable from "@/components/quizzes/QuizzesTable";
import SevenDayCalendar from "./calendar/SevenDayCalendar";
import ScheduleItemEditModal from "./calendar/ScheduleItemEditModal";

import { useToast } from "@/components/ui/toast/ToastProvider";
import {
  addClassQuizSchedule,
  deleteClassScheduleItemById,
  editClassScheduleItem,
} from "@/services/class/actions/class-schedule-actions";
import type { ApiScheduleItem } from "@/services/class/actions/class-schedule-actions";
import type { InitialPayload } from "@/services/quiz/types/quiz-table-types";
import type {
  DragData,
  ScheduleItem,
} from "@/services/class/types/class-types";

import {
  ymdToLocalDate,
  dateToLocalYMD,
  diffLocalDays,
  tzDayKey,
  endOfLocalDate,
  addLocalDays,
  withClientIds,
  formatSchedulerBoardFieldErrors,
  hasStarted,
} from "@/services/class/helpers/scheduling/scheduling-helpers";
import { PillAnchorMonitor } from "./scheduler-board-components/PillAnchorMonitor";
import { PointerZoneMonitor } from "./scheduler-board-components/PointerZoneMonitor";
import { useDragState } from "@/services/class/helpers/scheduler-board-helpers/hooks/useDragState";
import { useScheduleEditModal } from "@/services/class/helpers/scheduler-board-helpers/hooks/useScheduleEditModal";
import { useScheduleQueues } from "@/services/class/helpers/scheduler-board-helpers/hooks/useScheduleQueues";
import { PillOverlay } from "./scheduler-board-components/PillOverlay";
import { QuizRowOverlay } from "./scheduler-board-components/QuizRowOverlay";

export default function SchedulerBoard({
  classId,
  initialSchedule,
  tableInitial,
  classTimezone,
}: {
  classId: string;
  initialSchedule: ApiScheduleItem[];
  tableInitial: InitialPayload;
  classTimezone: string;
}) {
  const { showToast } = useToast();

  // schedule + optimistic queues (same initial transform)
  const {
    schedule,
    setSchedule,
    pendingCreateRef,
    pendingEditRef,
    pendingDeleteRef,
    editSnapshotRef,
    deleteSnapshotRef,
    ensureScheduleId,
    drainQueuesFor,
  } = useScheduleQueues(
    classId,
    withClientIds(initialSchedule),
    showToast,
    formatSchedulerBoardFieldErrors
  );

  // drag state
  const {
    activeDrag,
    setActiveDrag,
    previewById,
    setPreviewById,
    resizeStateRef,
    anchorOffsetDaysRef,
    lastPointerZoneRef,
  } = useDragState();

  // edit modal
  const {
    editOpen,
    editItem,
    handleOpenEdit,
    handleCloseEdit,
    handleSaveEdit,
  } = useScheduleEditModal(classId, showToast);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 1 } }),
    useSensor(KeyboardSensor)
  );

  const title = useMemo(
    () =>
      editItem?.quizName ? `Edit “${editItem.quizName}”` : "Edit schedule",
    [editItem?.quizName]
  );

  /** =========================
   * DnD handlers (VERBATIM)
   * ========================= */

  const handleDragStart = useCallback(
    (e: any) => {
      const dragData = e.active.data.current as DragData;
      setActiveDrag(dragData);

      if (dragData?.kind === "pill-resize") {
        const currentItem = schedule.find(
          (item) => item.clientId === dragData.clientId
        );
        if (currentItem) {
          resizeStateRef.current = {
            clientId: currentItem.clientId,
            _id: currentItem._id,
            quizId: dragData.quizId,
            direction: dragData.dir,
            originalItem: { ...currentItem },
          };
        }
      }
    },
    [schedule]
  );

  const handleDragOver = useCallback((e: any) => {
    const drag = e.active?.data?.current as DragData | undefined;
    const overId = (e.over?.id ?? null) as string | null;
    if (!drag || drag.kind !== "pill-resize" || !resizeStateRef.current) return;

    if (overId && overId !== "trash" && /^\d{4}-\d{2}-\d{2}$/.test(overId)) {
      resizeStateRef.current.lastValidDayId = overId;

      if (drag.dir === "left") {
        const newStartDate = ymdToLocalDate(overId).toISOString();
        setPreviewById((prev) => ({
          ...prev,
          [drag.clientId]: { startDate: newStartDate },
        }));
      } else {
        const newEndDate = endOfLocalDate(overId).toISOString();
        setPreviewById((prev) => ({
          ...prev,
          [drag.clientId]: { endDate: newEndDate },
        }));
      }
    }
  }, []);

  const handleDragEnd = useCallback(
    async (e: any) => {
      const drag: DragData | null = e.active?.data?.current || null;
      const overId: string | null = e.over?.id ?? null;
      const todayYMD_TZ = tzDayKey(new Date(), classTimezone);

      if (!drag) {
        setActiveDrag(null);
        setPreviewById({});
        resizeStateRef.current = null;
        return;
      }

      // CREATE from table row
      if (drag.kind === "quiz-row") {
        if (
          !overId ||
          overId === "trash" ||
          !/^\d{4}-\d{2}-\d{2}$/.test(overId)
        ) {
          setActiveDrag(null);
          setPreviewById({});
          return;
        }

        // Prevent scheduling in the past
        if (overId < todayYMD_TZ) {
          showToast({
            title: "Not allowed",
            description: "You can’t schedule on a past date.",
            variant: "error",
          });
          setActiveDrag(null);
          setPreviewById({});
          return;
        }

        if (
          !drag.quiz?.id ||
          !drag.quiz?.title ||
          !drag.quiz?.subject ||
          !drag.quiz?.subjectColorHex
        ) {
          showToast({
            title: "Missing data",
            description:
              "This quiz row is missing required fields (name, subject, or color).",
            variant: "error",
          });
          setActiveDrag(null);
          setPreviewById({});
          return;
        }

        const start = ymdToLocalDate(overId);
        const end = endOfLocalDate(overId);

        const clientId = `c-${
          crypto.randomUUID?.() || Math.random().toString(16).slice(2)
        }`;
        const optimistic: ScheduleItem = {
          clientId,
          _id: undefined,
          quizId: drag.quiz.id,
          startDate: start.toISOString(),
          endDate: end.toISOString(),
          quizName: drag.quiz.title,
          subject: drag.quiz.subject,
          subjectColor: drag.quiz.subjectColorHex,
          contribution: 100, // default
        };
        const prev = schedule.map((x) => ({ ...x }));
        setSchedule((s) => s.concat(optimistic));

        setActiveDrag(null);
        setPreviewById({});

        // Register create promise before awaiting
        const createP = (async () => {
          const res = await addClassQuizSchedule(classId, {
            quizId: drag.quiz!.id,
            startDate: start,
            endDate: end,
          });
          if (!res.ok || !res.data?._id) {
            const err: any = new Error(res.message || "Create failed");
            err.fieldErrors = (res as any).fieldErrors;
            throw err;
          }
          const newId = res.data._id as string;

          // stitch returned _id into local state
          setSchedule((s) =>
            s.map((it) =>
              it.clientId === clientId ? { ...it, _id: newId } : it
            )
          );

          return newId;
        })();

        pendingCreateRef.current[clientId] = createP;

        try {
          await createP;

          showToast({
            title: "Scheduled",
            description: "Quiz added to calendar.",
            variant: "success",
          });

          // drain any queued ops for this item
          await drainQueuesFor(clientId);
        } catch (err: any) {
          // revert optimistic
          setSchedule(prev);
          showToast({
            title: "Failed",
            description:
              (err?.message || "Could not schedule quiz.") +
              formatSchedulerBoardFieldErrors(err?.fieldErrors),
            variant: "error",
          });
        } finally {
          delete pendingCreateRef.current[clientId];
        }
        return;
      }

      // RESIZE existing pill
      if (drag.kind === "pill-resize" && resizeStateRef.current) {
        const currentItem = schedule.find(
          (it) => it.clientId === drag.clientId
        );
        if (!currentItem) {
          setActiveDrag(null);
          setPreviewById({});
          resizeStateRef.current = null;
          return;
        }

        const targetDayId = resizeStateRef.current.lastValidDayId || overId;
        if (
          !targetDayId ||
          targetDayId === "trash" ||
          !/^\d{4}-\d{2}-\d{2}$/.test(targetDayId)
        ) {
          setActiveDrag(null);
          setPreviewById({});
          resizeStateRef.current = null;
          return;
        }

        // If resizing LEFT (changes startDate) and quiz already started -> block
        if (drag.dir === "left" && hasStarted(currentItem, classTimezone)) {
          showToast({
            title: "Not allowed",
            description:
              "The start date can’t be changed after the quiz has started.",
            variant: "error",
          });
          setActiveDrag(null);
          setPreviewById({});
          resizeStateRef.current = null;
          return;
        }

        // Prevent moving the new start into the past (when allowed to change)
        if (drag.dir === "left") {
          const newStartYMD = targetDayId;
          const todayYMD = tzDayKey(new Date(), classTimezone);
          if (newStartYMD < todayYMD) {
            showToast({
              title: "Not allowed",
              description: "Start date can’t be set to a past day.",
              variant: "error",
            });
            setActiveDrag(null);
            setPreviewById({});
            resizeStateRef.current = null;
            return;
          }
        }

        const currentStartUTC = new Date(currentItem.startDate);
        const currentEndUTC = new Date(currentItem.endDate);

        let newStartDate = currentStartUTC;
        let newEndDate = currentEndUTC;

        if (drag.dir === "left") {
          newStartDate = ymdToLocalDate(targetDayId);
          if (newStartDate > newEndDate)
            newStartDate = ymdToLocalDate(dateToLocalYMD(newEndDate));
        } else {
          newEndDate = endOfLocalDate(targetDayId);
          if (newEndDate < newStartDate)
            newEndDate = endOfLocalDate(dateToLocalYMD(newStartDate));
        }

        const sameStart =
          dateToLocalYMD(newStartDate) === dateToLocalYMD(currentStartUTC);
        const sameEnd =
          dateToLocalYMD(newEndDate) === dateToLocalYMD(currentEndUTC);
        if (sameStart && sameEnd) {
          setActiveDrag(null);
          setPreviewById({});
          resizeStateRef.current = null;
          return;
        }

        const prev = schedule.map((x) => ({ ...x })); // snapshot for rollback

        // Optimistic update
        setSchedule((s) =>
          s.map((it) =>
            it.clientId === drag.clientId
              ? {
                  ...it,
                  startDate: newStartDate.toISOString(),
                  endDate: newEndDate.toISOString(),
                }
              : it
          )
        );

        setActiveDrag(null);
        setPreviewById({});
        resizeStateRef.current = null;

        // queue & drain
        editSnapshotRef.current[drag.clientId] = prev;
        pendingEditRef.current[drag.clientId] = {
          startDate: newStartDate,
          endDate: newEndDate,
        };
        void drainQueuesFor(drag.clientId);

        return;
      }

      // MOVE / DELETE existing pill (anchor-aware & duration-preserving)
      if (drag.kind === "pill") {
        const currentItem = schedule.find(
          (item) => item.clientId === drag.clientId
        );
        if (!currentItem) {
          setActiveDrag(null);
          setPreviewById({});
          return;
        }

        // If quiz already started, moving changes start date -> block
        if (hasStarted(currentItem, classTimezone)) {
          setActiveDrag(null);
          setPreviewById({});
          showToast({
            title: "Not allowed",
            description:
              "The start date can’t be changed after the quiz has started.",
            variant: "error",
          });
          return;
        }

        const prev = schedule.map((x) => ({ ...x })); // snapshot for rollback

        // DELETE / REVERT decision when no droppable target
        if (!overId) {
          const zone = lastPointerZoneRef.current;

          // inside calendar & over a past cell -> REVERT with message
          if (zone.insideCalendar && zone.day && zone.isPast) {
            setActiveDrag(null);
            setPreviewById({});
            showToast({
              title: "Not allowed",
              description: "You can’t move a quiz to a past date.",
              variant: "error",
            });
            return;
          }

          // Outside calendar -> optimistic DELETE + queue
          setSchedule((s) => s.filter((x) => x.clientId !== drag.clientId));
          setActiveDrag(null);
          setPreviewById({});

          deleteSnapshotRef.current[drag.clientId] = prev;
          pendingDeleteRef.current[drag.clientId] = true;

          void drainQueuesFor(drag.clientId);
          return;
        }

        // Explicit trash still deletes
        if (overId === "trash") {
          setSchedule((s) => s.filter((x) => x.clientId !== drag.clientId));
          setActiveDrag(null);
          setPreviewById({});

          deleteSnapshotRef.current[drag.clientId] = prev;
          pendingDeleteRef.current[drag.clientId] = true;

          void drainQueuesFor(drag.clientId);
          return;
        }

        if (!/^\d{4}-\d{2}-\d{2}$/.test(overId)) {
          setActiveDrag(null);
          setPreviewById({});
          return;
        }

        // Target day we dropped on — disallow move to past (based on new start)
        const dropDay = ymdToLocalDate(overId);

        // Original normalized local range and day-span
        const origStart = ymdToLocalDate(
          dateToLocalYMD(new Date(currentItem.startDate))
        );
        const origEnd = endOfLocalDate(
          dateToLocalYMD(new Date(currentItem.endDate))
        );
        const days = diffLocalDays(origEnd, origStart) + 1;

        // Shift by the internal-day offset we grabbed
        const offsetDays = anchorOffsetDaysRef.current || 0;
        const newStart = addLocalDays(dropDay, -offsetDays);
        const newEnd = endOfLocalDate(
          dateToLocalYMD(addLocalDays(newStart, days - 1))
        );

        // Disallow moves that would start in the past
        if (tzDayKey(newStart, classTimezone) < todayYMD_TZ) {
          showToast({
            title: "Not allowed",
            description: "A move can’t make the schedule start before today.",
            variant: "error",
          });
          setActiveDrag(null);
          setPreviewById({});
          return;
        }

        // Optimistic update
        setSchedule((s) =>
          s.map((x) =>
            x.clientId === drag.clientId
              ? {
                  ...x,
                  startDate: newStart.toISOString(),
                  endDate: newEnd.toISOString(),
                }
              : x
          )
        );
        setActiveDrag(null);
        setPreviewById({});

        // queue & drain
        editSnapshotRef.current[drag.clientId] = prev;
        pendingEditRef.current[drag.clientId] = {
          startDate: newStart,
          endDate: newEnd,
        };
        void drainQueuesFor(drag.clientId);

        return;
      }

      setActiveDrag(null);
      setPreviewById({});
      resizeStateRef.current = null;
    },
    [classId, schedule, showToast, drainQueuesFor, classTimezone, setSchedule]
  );

  const handleDragCancel = useCallback(() => {
    setActiveDrag(null);
    setPreviewById({});
    resizeStateRef.current = null;
  }, []);

  /** =========
   * Render
   * ========= */

  return (
    <DndContext
      sensors={useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 1 } }),
        useSensor(KeyboardSensor)
      )}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
      collisionDetection={pointerWithin}
      measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
    >
      {/* Monitors (unchanged) */}
      <PillAnchorMonitor
        schedule={schedule}
        setOffsetDays={(n) => {
          anchorOffsetDaysRef.current = n;
        }}
      />
      <PointerZoneMonitor
        setZone={(z) => {
          lastPointerZoneRef.current = z;
        }}
      />

      <div className="space-y-6">
        <SevenDayCalendar
          schedule={schedule}
          previewById={previewById}
          draggingQuizId={
            activeDrag &&
            (activeDrag.kind === "pill" || activeDrag.kind === "pill-resize")
              ? activeDrag.clientId
              : undefined
          }
          resizingQuizId={
            activeDrag?.kind === "pill-resize" ? activeDrag.clientId : undefined
          }
          classTimezone={classTimezone}
          // Right-click -> modal
          onEditRequest={(clientId) => {
            const it = schedule.find((s) => s.clientId === clientId);
            if (!it) return;
            handleOpenEdit(it);
          }}
        />

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Available Quizzes</h2>
            <span className="text-sm text-[var(--color-text-secondary)] text-right">
              Drag quizzes onto the calendar to schedule
              <br />
              Drag/resize pills on the calendar or right-click to edit
            </span>
          </div>
          <QuizzesTable
            initial={tableInitial}
            columns={[
              { header: "Name", width: 2 },
              { header: "Subject", width: 1 },
              { header: "Topic", width: 1 },
              { header: "Created", width: 1 },
              { header: "Type", width: 1 },
            ]}
            draggable
            editable={false}
          />
        </div>
      </div>

      {typeof window !== "undefined" &&
        createPortal(
          <>
            <DragOverlay dropAnimation={null}>
              {activeDrag?.kind === "quiz-row" && (
                <QuizRowOverlay
                  title={activeDrag.quiz?.title}
                  color={activeDrag.quiz?.subjectColorHex}
                />
              )}
            </DragOverlay>
            <DragOverlay dropAnimation={{ duration: 150 }}>
              {activeDrag?.kind === "pill" && (
                <PillOverlay
                  title={(activeDrag as any).title || activeDrag.quizId}
                  color={(activeDrag as any).subjectColor}
                />
              )}
            </DragOverlay>
          </>,
          document.body
        )}

      {/* Edit modal (non-optimistic, inline errors, loading) */}
      <ScheduleItemEditModal
        open={editOpen}
        item={editItem}
        onClose={handleCloseEdit}
        onSave={(patch) =>
          handleSaveEdit(patch, schedule, setSchedule, pendingCreateRef)
        }
      />
    </DndContext>
  );
}
