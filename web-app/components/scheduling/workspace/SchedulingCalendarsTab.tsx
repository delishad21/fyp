"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  MeasuringStrategy,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { createPortal } from "react-dom";
import Button from "@/components/ui/buttons/Button";
import DateField from "@/components/ui/selectors/DateField";
import MultiSelect from "@/components/ui/selectors/multi-select/MultiSelect";
import WarningModal from "@/components/ui/WarningModal";
import { useToast } from "@/components/ui/toast/ToastProvider";
import SevenDayCalendar from "@/components/classes/schedule-page/calendar/SevenDayCalendar";
import { DragAutoSlideMonitor } from "@/components/classes/schedule-page/calendar/DragAutoSlideMonitor";
import ScheduleItemEditModal from "@/components/classes/schedule-page/calendar/ScheduleItemEditModal";
import { PillOverlay } from "@/components/classes/schedule-page/scheduler-board-components/PillOverlay";
import { QuizRowOverlay } from "@/components/classes/schedule-page/scheduler-board-components/QuizRowOverlay";
import QuizzesTable from "@/components/quizzes/QuizzesTable";
import {
  addClassQuizSchedule,
  deleteClassScheduleItemById,
  editClassScheduleItem,
} from "@/services/class/actions/class-schedule-actions";
import { getScheduleItemAction } from "@/services/class/actions/get-schedule-item-action";
import {
  addDaysToDayKey,
  dayKeyFromDateInTZ,
  diffDayKeys,
  endOfDayInTZ,
  formatSchedulerBoardFieldErrors,
  getTimePartsInTZ,
  hasStarted,
  makeDateInTZ,
  startOfDayInTZ,
  tzDayKey,
} from "@/services/class/helpers/scheduling/scheduling-helpers";
import type {
  DragData,
  SaveResult,
  ScheduleItem,
} from "@/services/class/types/class-types";
import type { ScheduleQuizAttemptResult } from "@/components/quizzes/ScheduleQuizModal";
import type {
  ColumnDef,
  InitialPayload,
} from "@/services/quiz/types/quiz-table-types";
import type { ScheduleClassBundle } from "../types";
import { makeCellDropId, parseCellDropId } from "../helpers/drop-target-ids";
import SchedulingControlsBar from "./SchedulingControlsBar";
import SchedulingHelpDropdown from "./SchedulingHelpDropdown";

type PreviewByClass = Record<
  string,
  Record<string, Partial<Pick<ScheduleItem, "startDate" | "endDate">>>
>;

type ResizeState = {
  classId: string;
  clientId: string;
  direction: "left" | "right";
  originalItem: ScheduleItem;
  lastValidDayKey?: string;
};

type EditRequest = {
  classId: string;
  classTimezone: string;
  item: ScheduleItem;
};

function classOptions(classes: ScheduleClassBundle[]) {
  return classes.map((c) => ({
    value: c.classId,
    label: c.className || "Untitled class",
    colorHex: c.colorHex,
  }));
}

function nextClientId() {
  return `c-${crypto.randomUUID?.() || Math.random().toString(16).slice(2)}`;
}

const QUIZ_COLUMNS: ColumnDef[] = [
  { header: "Name", width: 2 },
  { header: "Subject", width: 1 },
  { header: "Topic", width: 1 },
  { header: "Created", width: 1 },
  { header: "Type", width: 1 },
];

export default function SchedulingCalendarsTab({
  classes,
  startKey,
  onStartKeyChange,
  onReplaceItem,
  onPatchItem,
  quizTableInitial,
  onScheduleAttemptComplete,
}: {
  classes: ScheduleClassBundle[];
  startKey: string;
  onStartKeyChange: (next: string) => void;
  onReplaceItem: (
    classId: string,
    clientId: string,
    next: ScheduleItem | null,
  ) => void;
  onPatchItem: (
    classId: string,
    clientId: string,
    patch: Partial<ScheduleItem>,
  ) => void;
  quizTableInitial: InitialPayload;
  onScheduleAttemptComplete?: (result: ScheduleQuizAttemptResult) => void;
}) {
  const { showToast } = useToast();

  const [selectedClassIds, setSelectedClassIds] = useState<string[]>([]);
  const [activeDrag, setActiveDrag] = useState<DragData | null>(null);
  const [previewByClassId, setPreviewByClassId] = useState<PreviewByClass>({});
  const resizeStateRef = useRef<ResizeState | null>(null);

  const [editOpen, setEditOpen] = useState(false);
  const [editClassId, setEditClassId] = useState("");
  const [editClassTimezone, setEditClassTimezone] = useState("UTC");
  const [editItem, setEditItem] = useState<ScheduleItem | null>(null);
  const [versionOptions, setVersionOptions] = useState<number[]>([]);
  const [versionLoading, setVersionLoading] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [quizDrawerOpen, setQuizDrawerOpen] = useState(false);

  const dragSlideLastTsRef = useRef(0);
  const dragSlideHostRef = useRef<HTMLDivElement | null>(null);
  const shiftLockRef = useRef(false);
  const shiftUnlockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 1 } }),
  );

  const classMap = useMemo(
    () => new Map(classes.map((c) => [c.classId, c])),
    [classes],
  );

  const visibleClasses = useMemo(() => {
    if (!selectedClassIds.length) return classes;
    const ids = new Set(selectedClassIds);
    return classes.filter((c) => ids.has(c.classId));
  }, [classes, selectedClassIds]);

  const draggingPill = useMemo(() => {
    if (!activeDrag) return undefined;
    if (activeDrag.kind !== "pill" && activeDrag.kind !== "pill-resize") {
      return undefined;
    }
    return { classId: activeDrag.classId, clientId: activeDrag.clientId };
  }, [activeDrag]);

  const resizingPill = useMemo(() => {
    if (!activeDrag || activeDrag.kind !== "pill-resize") return undefined;
    return { classId: activeDrag.classId, clientId: activeDrag.clientId };
  }, [activeDrag]);

  const clearPreview = useCallback(() => setPreviewByClassId({}), []);

  const shiftWindowOneDay = useCallback(
    (dir: 1 | -1) => {
      if (shiftLockRef.current) return false;
      shiftLockRef.current = true;
      onStartKeyChange(addDaysToDayKey(startKey, dir));

      if (shiftUnlockTimerRef.current)
        clearTimeout(shiftUnlockTimerRef.current);
      shiftUnlockTimerRef.current = setTimeout(() => {
        shiftLockRef.current = false;
        shiftUnlockTimerRef.current = null;
      }, 300);

      return true;
    },
    [onStartKeyChange, startKey],
  );

  useEffect(
    () => () => {
      if (shiftUnlockTimerRef.current) {
        clearTimeout(shiftUnlockTimerRef.current);
      }
    },
    [],
  );

  const findItemAcrossClasses = useCallback(
    (clientId: string) => {
      for (const cls of classes) {
        const item = cls.schedule.find((it) => it.clientId === clientId);
        if (item) return { classId: cls.classId, cls, item };
      }
      return null;
    },
    [classes],
  );

  const handleDragStart = useCallback(
    (e: DragStartEvent) => {
      const drag = (e.active?.data?.current as DragData | undefined) ?? null;
      setActiveDrag(drag);
      if (drag?.kind === "quiz-row") {
        setQuizDrawerOpen(false);
      }

      if (!drag || drag.kind !== "pill-resize") {
        resizeStateRef.current = null;
        return;
      }

      const fallback = findItemAcrossClasses(drag.clientId);
      const classId = drag.classId || fallback?.classId;
      const cls = classId ? classMap.get(classId) : fallback?.cls;
      const item =
        cls?.schedule.find((it) => it.clientId === drag.clientId) ??
        fallback?.item;

      if (!classId || !cls || !item) {
        resizeStateRef.current = null;
        return;
      }

      resizeStateRef.current = {
        classId,
        clientId: drag.clientId,
        direction: drag.dir,
        originalItem: { ...item },
      };
    },
    [classMap, findItemAcrossClasses],
  );

  const handleDragOver = useCallback(
    (e: DragOverEvent) => {
      const drag = e.active?.data?.current as DragData | undefined;
      if (!drag || drag.kind !== "pill-resize") return;

      const resizeState = resizeStateRef.current;
      if (!resizeState) return;

      const overId = typeof e.over?.id === "string" ? e.over.id : null;
      const target = overId ? parseCellDropId(overId) : null;
      if (!target || target.classId !== resizeState.classId) {
        clearPreview();
        return;
      }

      const cls = classMap.get(resizeState.classId);
      if (!cls) return;

      const originalItem = resizeState.originalItem;
      const originalStartKey = dayKeyFromDateInTZ(
        new Date(originalItem.startDate),
        cls.classTimezone,
      );

      if (drag.dir === "right" && target.dayKey < originalStartKey) {
        setPreviewByClassId((prev) => ({
          ...prev,
          [resizeState.classId]: {
            ...(prev[resizeState.classId] || {}),
            [resizeState.clientId]: { endDate: originalItem.endDate },
          },
        }));
        return;
      }

      resizeStateRef.current = {
        ...resizeState,
        lastValidDayKey: target.dayKey,
      };

      if (drag.dir === "left") {
        const newStartDate = startOfDayInTZ(
          target.dayKey,
          cls.classTimezone,
        ).toISOString();

        setPreviewByClassId((prev) => ({
          ...prev,
          [resizeState.classId]: {
            ...(prev[resizeState.classId] || {}),
            [resizeState.clientId]: { startDate: newStartDate },
          },
        }));
      } else {
        const newEndDate = endOfDayInTZ(
          target.dayKey,
          cls.classTimezone,
        ).toISOString();

        setPreviewByClassId((prev) => ({
          ...prev,
          [resizeState.classId]: {
            ...(prev[resizeState.classId] || {}),
            [resizeState.clientId]: { endDate: newEndDate },
          },
        }));
      }
    },
    [classMap, clearPreview],
  );

  const handleDragEnd = useCallback(
    async (e: DragEndEvent) => {
      const drag = (e.active?.data?.current ?? null) as DragData | null;
      const overId = typeof e.over?.id === "string" ? e.over.id : null;
      const target = overId ? parseCellDropId(overId) : null;

      setActiveDrag(null);
      clearPreview();

      if (!drag) {
        resizeStateRef.current = null;
        return;
      }

      if (drag.kind === "quiz-row") {
        if (!target) return;

        const targetClass = classMap.get(target.classId);
        if (!targetClass) return;

        const todayYMD = tzDayKey(new Date(), targetClass.classTimezone);
        if (target.dayKey < todayYMD) {
          showToast({
            title: "Not allowed",
            description: "You can't schedule on a past date.",
            variant: "error",
          });
          return;
        }

        if (!drag.quiz?.id || !drag.quiz?.title) {
          showToast({
            title: "Missing data",
            description: "This quiz row is missing required quiz data.",
            variant: "error",
          });
          return;
        }

        const startDate = startOfDayInTZ(
          target.dayKey,
          targetClass.classTimezone,
        );
        const endDate = endOfDayInTZ(target.dayKey, targetClass.classTimezone);

        const clientId = nextClientId();
        const quizRootId = drag.quiz.rootQuizId ?? drag.quiz.id;
        const quizVersion =
          typeof drag.quiz.version === "number" ? drag.quiz.version : 1;

        onReplaceItem(target.classId, clientId, {
          clientId,
          _id: undefined,
          quizId: drag.quiz.id,
          quizRootId,
          quizVersion,
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
          quizName: drag.quiz.title,
          subject: drag.quiz.subject,
          subjectColor: drag.quiz.subjectColorHex,
          contribution: 100,
          attemptsAllowed: 1,
          showAnswersAfterAttempt: true,
        });

        const createRes = await addClassQuizSchedule(target.classId, {
          quizId: drag.quiz.id,
          quizRootId,
          quizVersion,
          startDate,
          endDate,
          contribution: 100,
          attemptsAllowed: 1,
          showAnswersAfterAttempt: true,
        });

        if (!createRes.ok || !createRes.data?._id) {
          onReplaceItem(target.classId, clientId, null);
          showToast({
            title: "Failed",
            description:
              (createRes.message || "Could not schedule quiz.") +
              formatSchedulerBoardFieldErrors(
                (createRes as { fieldErrors?: Record<string, unknown> })
                  .fieldErrors,
              ),
            variant: "error",
          });
          return;
        }

        onReplaceItem(target.classId, clientId, {
          clientId,
          _id: createRes.data._id,
          quizId: createRes.data.quizId || drag.quiz.id,
          quizRootId:
            createRes.data.quizRootId || quizRootId || createRes.data.quizId,
          quizVersion:
            typeof createRes.data.quizVersion === "number"
              ? createRes.data.quizVersion
              : quizVersion,
          startDate: createRes.data.startDate || startDate.toISOString(),
          endDate: createRes.data.endDate || endDate.toISOString(),
          quizName: drag.quiz.title,
          subject: drag.quiz.subject,
          subjectColor: drag.quiz.subjectColorHex,
          contribution: createRes.data.contribution ?? 100,
          attemptsAllowed: createRes.data.attemptsAllowed ?? 1,
          showAnswersAfterAttempt:
            createRes.data.showAnswersAfterAttempt ?? true,
        });

        showToast({
          title: "Scheduled",
          description: `Added to ${targetClass.className || "class schedule"}.`,
          variant: "success",
        });
        return;
      }

      if (drag.kind === "pill-resize") {
        const resizeState = resizeStateRef.current;
        resizeStateRef.current = null;
        if (!resizeState) return;

        const cls = classMap.get(resizeState.classId);
        if (!cls) return;

        const currentItem = cls.schedule.find(
          (it) => it.clientId === resizeState.clientId,
        );
        if (!currentItem) return;

        const finalDayKey =
          resizeState.lastValidDayKey ||
          (target?.classId === resizeState.classId ? target.dayKey : undefined);
        if (!finalDayKey) return;

        if (
          resizeState.direction === "left" &&
          hasStarted(currentItem, cls.classTimezone)
        ) {
          showToast({
            title: "Not allowed",
            description:
              "The start time can’t be changed after the quiz has started.",
            variant: "error",
          });
          return;
        }

        if (resizeState.direction === "left") {
          const todayYMD = tzDayKey(new Date(), cls.classTimezone);
          if (finalDayKey < todayYMD) {
            showToast({
              title: "Not allowed",
              description: "Start date can’t be set to a past day.",
              variant: "error",
            });
            return;
          }
        }

        const currentStartUTC = new Date(currentItem.startDate);
        const currentEndUTC = new Date(currentItem.endDate);
        const startTime = getTimePartsInTZ(currentStartUTC, cls.classTimezone);

        let newStartDate = currentStartUTC;
        let newEndDate = currentEndUTC;

        if (resizeState.direction === "left") {
          newStartDate = makeDateInTZ(
            finalDayKey,
            cls.classTimezone,
            startTime.hour,
            startTime.minute,
            startTime.second,
            currentStartUTC.getMilliseconds(),
          );
          if (newStartDate > newEndDate) {
            newStartDate = startOfDayInTZ(
              dayKeyFromDateInTZ(newEndDate, cls.classTimezone),
              cls.classTimezone,
            );
          }
        } else {
          newEndDate = endOfDayInTZ(finalDayKey, cls.classTimezone);
          if (newEndDate < newStartDate) {
            newEndDate = endOfDayInTZ(
              dayKeyFromDateInTZ(newStartDate, cls.classTimezone),
              cls.classTimezone,
            );
          }
        }

        const sameStart =
          dayKeyFromDateInTZ(newStartDate, cls.classTimezone) ===
          dayKeyFromDateInTZ(currentStartUTC, cls.classTimezone);
        const sameEnd =
          dayKeyFromDateInTZ(newEndDate, cls.classTimezone) ===
          dayKeyFromDateInTZ(currentEndUTC, cls.classTimezone);
        if (sameStart && sameEnd) return;

        const previous = {
          startDate: currentItem.startDate,
          endDate: currentItem.endDate,
        };

        onPatchItem(resizeState.classId, currentItem.clientId, {
          startDate: newStartDate.toISOString(),
          endDate: newEndDate.toISOString(),
        });

        if (!currentItem._id) {
          onPatchItem(resizeState.classId, currentItem.clientId, previous);
          showToast({
            title: "Failed",
            description: "Schedule item id is missing.",
            variant: "error",
          });
          return;
        }

        const res = await editClassScheduleItem(
          resizeState.classId,
          currentItem._id,
          {
            startDate: newStartDate,
            endDate: newEndDate,
          },
        );

        if (!res.ok) {
          onPatchItem(resizeState.classId, currentItem.clientId, previous);
          showToast({
            title: "Failed",
            description:
              (res.message || "Could not resize schedule.") +
              formatSchedulerBoardFieldErrors(
                (res as { fieldErrors?: Record<string, unknown> }).fieldErrors,
              ),
            variant: "error",
          });
          return;
        }

        showToast({
          title: "Updated",
          description: "Schedule updated.",
          variant: "success",
        });
        return;
      }

      if (drag.kind === "pill") {
        if (!target) return;

        const fallback = findItemAcrossClasses(drag.clientId);
        const sourceClassId = drag.classId || fallback?.classId;
        if (!sourceClassId) return;

        const sourceClass = classMap.get(sourceClassId) || fallback?.cls;
        const currentItem =
          sourceClass?.schedule.find((it) => it.clientId === drag.clientId) ||
          fallback?.item;
        const targetClass = classMap.get(target.classId);
        if (!sourceClass || !targetClass || !currentItem) return;

        if (hasStarted(currentItem, sourceClass.classTimezone)) {
          showToast({
            title: "Not allowed",
            description:
              "The start time can’t be changed after the quiz has started.",
            variant: "error",
          });
          return;
        }

        const sourceStartDate = new Date(currentItem.startDate);
        const sourceEndDate = new Date(currentItem.endDate);
        const sourceStartKey = dayKeyFromDateInTZ(
          sourceStartDate,
          sourceClass.classTimezone,
        );
        const sourceEndKey = dayKeyFromDateInTZ(
          sourceEndDate,
          sourceClass.classTimezone,
        );
        const daySpan = diffDayKeys(sourceEndKey, sourceStartKey) + 1;

        const newStartKey = target.dayKey;
        const newEndKey = addDaysToDayKey(newStartKey, daySpan - 1);

        const sourceStartTime = getTimePartsInTZ(
          sourceStartDate,
          sourceClass.classTimezone,
        );
        const sourceEndTime = getTimePartsInTZ(
          sourceEndDate,
          sourceClass.classTimezone,
        );

        const newStartDate = makeDateInTZ(
          newStartKey,
          targetClass.classTimezone,
          sourceStartTime.hour,
          sourceStartTime.minute,
          sourceStartTime.second,
          sourceStartDate.getMilliseconds(),
        );
        let newEndDate = makeDateInTZ(
          newEndKey,
          targetClass.classTimezone,
          sourceEndTime.hour,
          sourceEndTime.minute,
          sourceEndTime.second,
          sourceEndDate.getMilliseconds(),
        );
        if (newEndDate < newStartDate) {
          newEndDate = endOfDayInTZ(newEndKey, targetClass.classTimezone);
        }

        const targetTodayKey = tzDayKey(new Date(), targetClass.classTimezone);
        if (
          dayKeyFromDateInTZ(newStartDate, targetClass.classTimezone) <
          targetTodayKey
        ) {
          showToast({
            title: "Not allowed",
            description: "A move can’t make the schedule start before today.",
            variant: "error",
          });
          return;
        }

        const sameClassMove = sourceClassId === target.classId;
        if (sameClassMove) {
          const unchanged =
            dayKeyFromDateInTZ(newStartDate, sourceClass.classTimezone) ===
              dayKeyFromDateInTZ(
                new Date(currentItem.startDate),
                sourceClass.classTimezone,
              ) &&
            dayKeyFromDateInTZ(newEndDate, sourceClass.classTimezone) ===
              dayKeyFromDateInTZ(
                new Date(currentItem.endDate),
                sourceClass.classTimezone,
              );
          if (unchanged) return;

          const previous = {
            startDate: currentItem.startDate,
            endDate: currentItem.endDate,
          };

          onPatchItem(sourceClassId, currentItem.clientId, {
            startDate: newStartDate.toISOString(),
            endDate: newEndDate.toISOString(),
          });

          if (!currentItem._id) {
            onPatchItem(sourceClassId, currentItem.clientId, previous);
            showToast({
              title: "Failed",
              description: "Schedule item id is missing.",
              variant: "error",
            });
            return;
          }

          const res = await editClassScheduleItem(
            sourceClassId,
            currentItem._id,
            {
              startDate: newStartDate,
              endDate: newEndDate,
            },
          );

          if (!res.ok) {
            onPatchItem(sourceClassId, currentItem.clientId, previous);
            showToast({
              title: "Failed",
              description:
                (res.message || "Could not move schedule.") +
                formatSchedulerBoardFieldErrors(
                  (res as { fieldErrors?: Record<string, unknown> })
                    .fieldErrors,
                ),
              variant: "error",
            });
            return;
          }

          showToast({
            title: "Updated",
            description: "Schedule updated.",
            variant: "success",
          });
          return;
        }

        if (!currentItem._id) {
          showToast({
            title: "Not allowed",
            description:
              "Please wait for this schedule item to finish syncing before moving it to another class.",
            variant: "error",
          });
          return;
        }

        const createRes = await addClassQuizSchedule(target.classId, {
          quizId: currentItem.quizId,
          quizRootId: currentItem.quizRootId || currentItem.quizId,
          quizVersion:
            typeof currentItem.quizVersion === "number"
              ? currentItem.quizVersion
              : 1,
          startDate: newStartDate,
          endDate: newEndDate,
          ...(typeof currentItem.contribution === "number"
            ? { contribution: currentItem.contribution }
            : {}),
          ...(typeof currentItem.attemptsAllowed === "number"
            ? { attemptsAllowed: currentItem.attemptsAllowed }
            : {}),
          ...(typeof currentItem.showAnswersAfterAttempt === "boolean"
            ? { showAnswersAfterAttempt: currentItem.showAnswersAfterAttempt }
            : {}),
        });

        if (!createRes.ok || !createRes.data?._id) {
          showToast({
            title: "Failed",
            description:
              (createRes.message ||
                "Could not move schedule to target class.") +
              formatSchedulerBoardFieldErrors(
                (createRes as { fieldErrors?: Record<string, unknown> })
                  .fieldErrors,
              ),
            variant: "error",
          });
          return;
        }

        const deleteRes = await deleteClassScheduleItemById(
          sourceClassId,
          currentItem._id,
        );
        if (!deleteRes.ok) {
          // Best effort rollback if source delete fails.
          await deleteClassScheduleItemById(target.classId, createRes.data._id);
          showToast({
            title: "Failed",
            description:
              (deleteRes.message ||
                "Could not remove schedule from the source class.") +
              " Move cancelled.",
            variant: "error",
          });
          return;
        }

        onReplaceItem(sourceClassId, currentItem.clientId, null);

        const newClientId = nextClientId();
        onReplaceItem(target.classId, newClientId, {
          ...currentItem,
          ...createRes.data,
          clientId: newClientId,
          _id: createRes.data._id,
          quizId: createRes.data.quizId || currentItem.quizId,
          quizRootId:
            createRes.data.quizRootId ||
            currentItem.quizRootId ||
            currentItem.quizId,
          quizVersion:
            typeof createRes.data.quizVersion === "number"
              ? createRes.data.quizVersion
              : currentItem.quizVersion,
          startDate: createRes.data.startDate || newStartDate.toISOString(),
          endDate: createRes.data.endDate || newEndDate.toISOString(),
        });

        showToast({
          title: "Moved",
          description: `Moved to ${targetClass.className || "target class"}.`,
          variant: "success",
        });
      }
    },
    [
      classMap,
      clearPreview,
      findItemAcrossClasses,
      onPatchItem,
      onReplaceItem,
      showToast,
    ],
  );

  const handleDragCancel = useCallback(() => {
    setActiveDrag(null);
    clearPreview();
    resizeStateRef.current = null;
  }, [clearPreview]);

  const handleOpenEdit = useCallback(
    (req: EditRequest) => {
      setEditClassId(req.classId);
      setEditClassTimezone(req.classTimezone || "UTC");
      setEditItem(req.item);
      setEditOpen(true);

      setVersionOptions(
        typeof req.item.quizVersion === "number" ? [req.item.quizVersion] : [],
      );
      setVersionLoading(true);

      if (!req.item._id) {
        setVersionLoading(false);
        return;
      }

      (async () => {
        const res = await getScheduleItemAction(req.classId, req.item._id!);
        if (!res.ok || !res.data) {
          const message = !res.ok ? res.message : undefined;
          showToast({
            title: "Could not load schedule details",
            description: message || "Version options are unavailable.",
            variant: "error",
          });
          setVersionLoading(false);
          return;
        }

        const data = res.data as Record<string, unknown>;
        const rawVersions = data.quizVersions;
        const versions = Array.isArray(rawVersions)
          ? rawVersions
              .map((v) => {
                if (typeof v === "number") return Number(v);
                if (typeof v === "object" && v !== null && "version" in v) {
                  return Number((v as { version?: unknown }).version);
                }
                return Number.NaN;
              })
              .filter((n: number) => Number.isFinite(n))
          : [];

        const merged = new Set<number>(versions);
        if (typeof data.quizVersion === "number") merged.add(data.quizVersion);
        if (typeof req.item.quizVersion === "number")
          merged.add(req.item.quizVersion);

        setVersionOptions(Array.from(merged).sort((a, b) => a - b));
        setEditItem((prev) =>
          prev && prev.clientId === req.item.clientId
            ? ({ ...prev, ...data } as ScheduleItem)
            : prev,
        );
        setVersionLoading(false);
      })();
    },
    [showToast],
  );

  const handleCloseEdit = useCallback(() => {
    setEditOpen(false);
    setEditItem(null);
    setEditClassId("");
    setEditClassTimezone("UTC");
    setVersionOptions([]);
    setVersionLoading(false);
    setDeleteConfirmOpen(false);
    setDeleteLoading(false);
  }, []);

  const handleSaveEdit = useCallback(
    async (patch: {
      startDate?: Date;
      endDate?: Date;
      contribution?: number;
      attemptsAllowed?: number;
      showAnswersAfterAttempt?: boolean;
      quizVersion?: number;
    }): Promise<SaveResult> => {
      if (!editItem || !editClassId || !editItem._id) {
        return { ok: false, message: "Schedule item is unavailable." };
      }

      const res = await editClassScheduleItem(editClassId, editItem._id, patch);
      if (!res.ok) {
        return {
          ok: false,
          message: res.message || "Could not update schedule.",
          fieldErrors: (
            res as {
              fieldErrors?: Record<string, string | string[] | undefined>;
            }
          ).fieldErrors,
        };
      }

      onPatchItem(editClassId, editItem.clientId, {
        ...(patch.startDate
          ? { startDate: patch.startDate.toISOString() }
          : {}),
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
    [editClassId, editItem, onPatchItem, showToast],
  );

  const handleConfirmDelete = useCallback(async () => {
    if (!editItem || !editClassId || !editItem._id) {
      setDeleteConfirmOpen(false);
      return;
    }

    setDeleteLoading(true);
    const res = await deleteClassScheduleItemById(editClassId, editItem._id);
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

    onReplaceItem(editClassId, editItem.clientId, null);
    showToast({
      title: "Removed",
      description: "Schedule item deleted.",
      variant: "success",
    });
    handleCloseEdit();
  }, [editClassId, editItem, handleCloseEdit, onReplaceItem, showToast]);

  if (!classes.length) {
    return (
      <div className="rounded-lg border border-[var(--color-bg4)] bg-[var(--color-bg2)] p-4 text-sm text-[var(--color-text-secondary)]">
        No classes to schedule yet.
      </div>
    );
  }

  return (
    <div className="relative flex h-full min-h-full flex-col overflow-hidden">
      <DndContext
        sensors={sensors}
        collisionDetection={pointerWithin}
        measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <div className="flex min-h-0 flex-1 flex-col gap-4 pl-16 pr-6 pt-5 pb-3">
            <SchedulingControlsBar
              left={
                <>
                  <Button
                    variant="primary"
                    className="h-10 px-4 text-sm"
                    onClick={() => setQuizDrawerOpen((prev) => !prev)}
                    title={
                      quizDrawerOpen
                        ? "Hide quiz drawer"
                        : "Open quiz drawer from left"
                    }
                  >
                    + Schedule New Quiz
                  </Button>
                  <DateField
                    label="Go to date"
                    value={startKey}
                    onChange={(next) => {
                      if (next) onStartKeyChange(next);
                    }}
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
                </>
              }
              right={
                <>
                  <SchedulingHelpDropdown
                    title="How to use"
                    tips={[
                      'Click "Schedule New Quiz" to open the quiz drawer from the left.',
                      "Click a quiz row to schedule it with the modal, or drag a quiz onto any class/day to schedule instantly.",
                      "Hover any scheduled quiz to view details, and right-click it to edit schedule information.",
                      "Drag scheduled quizzes to move them between days/classes, or drag their left/right edges to adjust duration.",
                    ]}
                  />
                </>
              }
            />

            <section
              ref={dragSlideHostRef}
              className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1 pb-3"
            >
              {visibleClasses.length ? (
                visibleClasses.map((cls) => (
                  <SevenDayCalendar
                    key={cls.classId}
                    schedule={cls.schedule}
                    previewById={previewByClassId?.[cls.classId]}
                    draggingQuizId={
                      draggingPill?.classId === cls.classId
                        ? draggingPill.clientId
                        : undefined
                    }
                    resizingQuizId={
                      resizingPill?.classId === cls.classId
                        ? resizingPill.clientId
                        : undefined
                    }
                    classTimezone={cls.classTimezone}
                    onEditRequest={(clientId) => {
                      const item = cls.schedule.find(
                        (it) => it.clientId === clientId,
                      );
                      if (!item) return;
                      handleOpenEdit({
                        classId: cls.classId,
                        classTimezone: cls.classTimezone,
                        item,
                      });
                    }}
                    titleComponent={
                      <div className="flex min-w-0 items-center gap-2 px-1">
                        <span
                          className="h-2.5 w-2.5 rounded-full shrink-0"
                          style={{
                            background: cls.colorHex || "var(--color-primary)",
                          }}
                        />
                        <p className="truncate text-sm font-semibold text-[var(--color-text-primary)]">
                          {cls.className || "Untitled class"}
                        </p>
                        <span className="truncate text-xs text-[var(--color-text-secondary)]">
                          {cls.classTimezone}
                        </span>
                      </div>
                    }
                    showGoToDate={false}
                    dragClassId={cls.classId}
                    dayDropIdForDate={(dayKey) =>
                      makeCellDropId(cls.classId, dayKey)
                    }
                    startKeyOverride={startKey}
                    onStartKeyChange={onStartKeyChange}
                    onShiftWindowRequest={(dir) => shiftWindowOneDay(dir)}
                    enableAutoSlideMonitor={false}
                  />
                ))
              ) : (
                <div className="rounded-lg border border-[var(--color-bg4)] bg-[var(--color-bg2)] p-4 text-sm text-[var(--color-text-secondary)]">
                  No classes match the current selection.
                </div>
              )}
            </section>
        </div>

        <div
          className={[
            "pointer-events-none absolute inset-0 z-30 transition-opacity duration-200",
            quizDrawerOpen ? "opacity-100" : "opacity-0",
          ].join(" ")}
        >
          <button
            type="button"
            aria-label="Close quizzes drawer"
            onClick={() => setQuizDrawerOpen(false)}
            className={[
              "absolute inset-0 bg-black/20 transition-opacity duration-200",
              quizDrawerOpen ? "pointer-events-auto opacity-100" : "opacity-0",
            ].join(" ")}
          />
        </div>

        <aside
          className={[
            "pointer-events-auto absolute left-0 top-0 z-40 h-full w-[66vw] min-w-[560px] max-w-[1200px]",
            "border-r border-[var(--color-bg4)] bg-[var(--color-bg1)] shadow-xl",
            "flex flex-col transition-transform duration-200 ease-out",
          ].join(" ")}
          style={{
            transform: quizDrawerOpen
              ? "translateX(0)"
              : "translateX(-100%)",
          }}
        >
          <button
            type="button"
            onClick={() => setQuizDrawerOpen((prev) => !prev)}
            title={quizDrawerOpen ? "Hide quiz drawer" : "Open quiz drawer"}
            className={[
              "absolute right-[-2.5rem] top-0 h-full w-10 rounded-r-2xl border border-l-0 border-[var(--color-bg4)]",
              "bg-[var(--color-bg2)] text-sm font-medium text-[var(--color-text-secondary)]",
              "transition hover:bg-[var(--color-bg3)]",
              "[writing-mode:vertical-rl]",
            ].join(" ")}
          >
            Quizzes
          </button>

            <div className="flex items-center justify-between border-b border-[var(--color-bg4)] px-4 py-3">
              <h3 className="text-base font-semibold text-[var(--color-text-primary)]">
                Quizzes
              </h3>
              <Button
                variant="ghost"
                className="px-3 py-1.5 text-sm"
                onClick={() => setQuizDrawerOpen(false)}
                title="Close quizzes drawer"
              >
                Close
              </Button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              <QuizzesTable
                initial={quizTableInitial}
                columns={QUIZ_COLUMNS}
                draggable
                editable={false}
                schedulable
                scheduleOnRowClick
                onScheduleAttemptComplete={onScheduleAttemptComplete}
                showViewClassScheduleButtons={false}
                schedulingHint={
                  <p className="text-sm text-[var(--color-text-secondary)]">
                    Click any quiz to schedule with the modal, or drag a quiz
                    handle onto any class calendar day.
                  </p>
                }
              />
            </div>
        </aside>

        <DragAutoSlideMonitor
          onStart={() => {}}
          onMoveAtX={(curX) => {
            const hostRect = dragSlideHostRef.current?.getBoundingClientRect();
            if (!hostRect) return;

            const now = performance.now();
            if (now - dragSlideLastTsRef.current < 180) return;

            if (curX < hostRect.left - 8) {
              dragSlideLastTsRef.current = now;
              shiftWindowOneDay(-1);
            } else if (curX > hostRect.right + 8) {
              dragSlideLastTsRef.current = now;
              shiftWindowOneDay(1);
            }
          }}
          onEnd={() => {}}
        />

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
                    title={activeDrag.title || activeDrag.quizId}
                    color={activeDrag.subjectColor}
                  />
                )}
              </DragOverlay>
            </>,
            document.body,
          )}
      </DndContext>

      <ScheduleItemEditModal
        open={editOpen}
        item={editItem}
        versionOptions={versionOptions}
        versionLoading={versionLoading}
        classTimezone={editClassTimezone}
        onClose={handleCloseEdit}
        onSave={handleSaveEdit}
        onDelete={() => setDeleteConfirmOpen(true)}
      />

      <WarningModal
        open={deleteConfirmOpen}
        title="Delete this scheduled quiz?"
        message="This removes the schedule from this class. Existing attempts and results may be affected."
        cancelLabel="Cancel"
        continueLabel={deleteLoading ? "Deleting..." : "Delete"}
        onCancel={() => {
          if (!deleteLoading) setDeleteConfirmOpen(false);
        }}
        onContinue={deleteLoading ? () => {} : handleConfirmDelete}
      />
    </div>
  );
}
