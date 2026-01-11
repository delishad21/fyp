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
import { addClassQuizSchedule } from "@/services/class/actions/class-schedule-actions";
import type { ApiScheduleItem } from "@/services/class/actions/class-schedule-actions";
import type { InitialPayload } from "@/services/quiz/types/quiz-table-types";
import type {
  DragData,
  ScheduleItem,
} from "@/services/class/types/class-types";

import {
  addDaysToDayKey,
  diffDayKeys,
  dayKeyFromDateInTZ,
  makeDateInTZ,
  startOfDayInTZ,
  endOfDayInTZ,
  getTimePartsInTZ,
  tzDayKey,
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
    versionOptions,
    versionLoading,
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
        const newStartDate = startOfDayInTZ(overId, classTimezone).toISOString();
        setPreviewById((prev) => ({
          ...prev,
          [drag.clientId]: { startDate: newStartDate },
        }));
      } else {
        const newEndDate = endOfDayInTZ(overId, classTimezone).toISOString();
        setPreviewById((prev) => ({
          ...prev,
          [drag.clientId]: { endDate: newEndDate },
        }));
      }
    }
  }, [classTimezone]);

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
            description: "You can't schedule on a past date.",
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

        const start = startOfDayInTZ(overId, classTimezone);
        const end = endOfDayInTZ(overId, classTimezone);

        const clientId = `c-${
          crypto.randomUUID?.() || Math.random().toString(16).slice(2)
        }`;

        const quizRootId = drag.quiz?.rootQuizId ?? drag.quiz?.id ?? ""; // safe fallback
        const quizVersion =
          typeof drag.quiz?.version === "number" ? drag.quiz.version : 1;

        const optimistic: ScheduleItem = {
          clientId,
          _id: undefined,

          quizId: drag.quiz.id,
          quizRootId: quizRootId || drag.quiz.id, // never empty string
          quizVersion,

          startDate: start.toISOString(),
          endDate: end.toISOString(),
          quizName: drag.quiz.title,
          subject: drag.quiz.subject,
          subjectColor: drag.quiz.subjectColorHex,
          contribution: 100, // default
          attemptsAllowed: 1,
          showAnswersAfterAttempt: false,
        };

        const prev = schedule.map((x) => ({ ...x }));
        setSchedule((s) => s.concat(optimistic));

        setActiveDrag(null);
        setPreviewById({});

        // Register create promise before awaiting
        const createP = (async () => {
          const res = await addClassQuizSchedule(classId, {
            quizId: drag.quiz!.id,
            quizRootId: quizRootId || drag.quiz!.id,
            quizVersion,
            startDate: start,
            endDate: end,
            contribution: 100,
            attemptsAllowed: 1,
            showAnswersAfterAttempt: true,
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
              "The start time can’t be changed after the quiz has started.",
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
        const curStartTime = getTimePartsInTZ(currentStartUTC, classTimezone);

        let newStartDate = currentStartUTC;
        let newEndDate = currentEndUTC;

        if (drag.dir === "left") {
          newStartDate = makeDateInTZ(
            targetDayId,
            classTimezone,
            curStartTime.hour,
            curStartTime.minute,
            curStartTime.second,
            currentStartUTC.getMilliseconds()
          );
          if (newStartDate > newEndDate)
            newStartDate = startOfDayInTZ(
              dayKeyFromDateInTZ(newEndDate, classTimezone),
              classTimezone
            );
        } else {
          newEndDate = endOfDayInTZ(targetDayId, classTimezone);
          if (newEndDate < newStartDate)
            newEndDate = endOfDayInTZ(
              dayKeyFromDateInTZ(newStartDate, classTimezone),
              classTimezone
            );
        }

        const sameStart =
          dayKeyFromDateInTZ(newStartDate, classTimezone) ===
          dayKeyFromDateInTZ(currentStartUTC, classTimezone);
        const sameEnd =
          dayKeyFromDateInTZ(newEndDate, classTimezone) ===
          dayKeyFromDateInTZ(currentEndUTC, classTimezone);
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

        const prev = schedule.map((x) => ({ ...x })); // snapshot for rollback

        // --- DELETE PATHS FIRST (allowed even if quiz has started) ---

        // 1) No droppable target (likely outside calendar): delete if outside; revert if past-cell
        if (!overId) {
          const zone = lastPointerZoneRef.current;

          // inside calendar & over a past cell -> REVERT with message
          if (zone.insideCalendar && zone.day && zone.isPast) {
            setActiveDrag(null);
            setPreviewById({});
            showToast({
              title: "Not allowed",
              description: "You can't move a quiz to a past date.",
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

        // 2) Explicit trash drop → delete (Deprecated)
        if (overId === "trash") {
          setSchedule((s) => s.filter((x) => x.clientId !== drag.clientId));
          setActiveDrag(null);
          setPreviewById({});

          deleteSnapshotRef.current[drag.clientId] = prev;
          pendingDeleteRef.current[drag.clientId] = true;

          void drainQueuesFor(drag.clientId);
          return;
        }

        // --- MOVE PATHS (changing start date) ---

        if (!/^\d{4}-\d{2}-\d{2}$/.test(overId)) {
          setActiveDrag(null);
          setPreviewById({});
          return;
        }

        // If quiz already started, block moves (moves shift start date)
        if (hasStarted(currentItem, classTimezone)) {
          setActiveDrag(null);
          setPreviewById({});
          showToast({
            title: "Not allowed",
            description:
              "The start time can’t be changed after the quiz has started.",
            variant: "error",
          });
          return;
        }

        const todayYMD_TZ = tzDayKey(new Date(), classTimezone);
        const dropDayKey = overId;

        // Original normalized class-TZ range and day-span
        const origStartKey = dayKeyFromDateInTZ(
          new Date(currentItem.startDate),
          classTimezone
        );
        const origEndKey = dayKeyFromDateInTZ(
          new Date(currentItem.endDate),
          classTimezone
        );
        const days = diffDayKeys(origEndKey, origStartKey) + 1;

        // Shift by the internal-day offset we grabbed
        const offsetDays = anchorOffsetDaysRef.current || 0;
        const newStartKey = addDaysToDayKey(dropDayKey, -offsetDays);
        const newEndKey = addDaysToDayKey(newStartKey, days - 1);
        const startTime = getTimePartsInTZ(
          new Date(currentItem.startDate),
          classTimezone
        );
        const newStart = makeDateInTZ(
          newStartKey,
          classTimezone,
          startTime.hour,
          startTime.minute,
          startTime.second,
          new Date(currentItem.startDate).getMilliseconds()
        );
        const endTime = getTimePartsInTZ(
          new Date(currentItem.endDate),
          classTimezone
        );
        let newEnd = makeDateInTZ(
          newEndKey,
          classTimezone,
          endTime.hour,
          endTime.minute,
          endTime.second,
          new Date(currentItem.endDate).getMilliseconds()
        );
        if (newEnd < newStart) {
          newEnd = endOfDayInTZ(newEndKey, classTimezone);
        }

        // Disallow moves that would start in the past
        if (dayKeyFromDateInTZ(newStart, classTimezone) < todayYMD_TZ) {
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
        classTimezone={classTimezone}
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
            console.log("edit request for", clientId, it);
            handleOpenEdit(it);
          }}
        />

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Available Quizzes</h2>
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
        versionOptions={versionOptions}
        versionLoading={versionLoading}
        classTimezone={classTimezone}
        onClose={handleCloseEdit}
        onSave={(patch) =>
          handleSaveEdit(patch, schedule, setSchedule, pendingCreateRef)
        }
      />
    </DndContext>
  );
}
