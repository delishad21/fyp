"use client";

import { useCallback, useMemo, useRef, useState } from "react";
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
import EmptyStateBox from "@/components/ui/EmptyStateBox";
import Button from "@/components/ui/buttons/Button";
import WarningModal from "@/components/ui/WarningModal";
import ScheduleItemEditModal from "@/components/classes/schedule-page/calendar/ScheduleItemEditModal";
import { QuizRowOverlay } from "@/components/classes/schedule-page/scheduler-board-components/QuizRowOverlay";
import { PillOverlay } from "@/components/classes/schedule-page/scheduler-board-components/PillOverlay";
import SchedulingToolbar from "./SchedulingToolbar";
import QuizBankSidebar from "./QuizBankSidebar";
import MultiClassCalendarGrid from "./MultiClassCalendarGrid";
import { useToast } from "@/components/ui/toast/ToastProvider";
import {
  addClassQuizSchedule,
  deleteClassScheduleItemById,
  editClassScheduleItem,
  type ApiClassScheduleBundle,
} from "@/services/class/actions/class-schedule-actions";
import { getScheduleItemAction } from "@/services/class/actions/get-schedule-item-action";
import {
  addDaysToDayKey,
  dayKeyFromDateInTZ,
  endOfDayInTZ,
  formatSchedulerBoardFieldErrors,
  getTimePartsInTZ,
  hasStarted,
  makeDateInTZ,
  startOfDayInTZ,
  tzDayKey,
  withClientIds,
  diffDayKeys,
} from "@/services/class/helpers/scheduling/scheduling-helpers";
import type {
  DragData,
  SaveResult,
  ScheduleItem,
} from "@/services/class/types/class-types";
import type { FilterMeta, RowData } from "@/services/quiz/types/quiz-table-types";
import { parseCellDropId } from "./helpers/drop-target-ids";
import type { QuizBankState, ScheduleClassBundle } from "./types";

function browserTimezone() {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return typeof tz === "string" && tz.trim() ? tz : "UTC";
}

function toClassBundles(
  bundles: (ApiClassScheduleBundle & { colorHex?: string })[]
): ScheduleClassBundle[] {
  return bundles.map((b) => ({
    classId: b.classId,
    className: b.className,
    classTimezone: b.classTimezone || "UTC",
    colorHex: b.colorHex,
    schedule: withClientIds(b.schedule || []),
  }));
}

function toQuizBankState(
  rows: RowData[],
  page: number,
  pageCount: number,
  total: number
): QuizBankState {
  return { rows, page, pageCount, total };
}

type QuizDragPayload = NonNullable<
  Extract<DragData, { kind: "quiz-row" }>["quiz"]
>;

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

export default function MultiClassSchedulerBoard({
  bundles,
  quizRows,
  quizPage,
  quizPageCount,
  quizTotal,
  filterMeta,
}: {
  bundles: (ApiClassScheduleBundle & { colorHex?: string })[];
  quizRows: RowData[];
  quizPage: number;
  quizPageCount: number;
  quizTotal: number;
  filterMeta: FilterMeta;
}) {
  const { showToast } = useToast();
  const localTz = useMemo(() => browserTimezone(), []);

  const [classes, setClasses] = useState<ScheduleClassBundle[]>(() =>
    toClassBundles(bundles)
  );
  const [startKey, setStartKey] = useState(() => tzDayKey(new Date(), localTz));
  const [selectedClassIds, setSelectedClassIds] = useState<string[]>([]);

  const [activeDrag, setActiveDrag] = useState<DragData | null>(null);
  const [previewByClassId, setPreviewByClassId] = useState<PreviewByClass>({});
  const resizeStateRef = useRef<ResizeState | null>(null);

  const [editOpen, setEditOpen] = useState(false);
  const [editClassId, setEditClassId] = useState<string>("");
  const [editClassTimezone, setEditClassTimezone] = useState<string>("UTC");
  const [editItem, setEditItem] = useState<ScheduleItem | null>(null);
  const [versionOptions, setVersionOptions] = useState<number[]>([]);
  const [versionLoading, setVersionLoading] = useState(false);

  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 1 } })
  );

  const classMap = useMemo(
    () => new Map(classes.map((c) => [c.classId, c])),
    [classes]
  );

  const initialQuizState = useMemo(
    () => toQuizBankState(quizRows, quizPage, quizPageCount, quizTotal),
    [quizRows, quizPage, quizPageCount, quizTotal]
  );

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

  const findItemAcrossClasses = useCallback(
    (clientId: string) => {
      for (const cls of classes) {
        const item = cls.schedule.find((it) => it.clientId === clientId);
        if (item) return { classId: cls.classId, cls, item };
      }
      return null;
    },
    [classes]
  );

  const replaceScheduleItem = useCallback(
    (classId: string, clientId: string, next: ScheduleItem | null) => {
      setClasses((prev) =>
        prev.map((cls) => {
          if (cls.classId !== classId) return cls;
          const without = cls.schedule.filter((it) => it.clientId !== clientId);
          return {
            ...cls,
            schedule: next ? without.concat(next) : without,
          };
        })
      );
    },
    []
  );

  const patchScheduleItem = useCallback(
    (classId: string, clientId: string, patch: Partial<ScheduleItem>) => {
      setClasses((prev) =>
        prev.map((cls) =>
          cls.classId !== classId
            ? cls
            : {
                ...cls,
                schedule: cls.schedule.map((it) =>
                  it.clientId === clientId ? { ...it, ...patch } : it
                ),
              }
        )
      );
    },
    []
  );

  const scheduleOneClass = useCallback(
    async ({
      classId,
      dayKey,
      dragQuiz,
      silentSuccess = false,
    }: {
      classId: string;
      dayKey: string;
      dragQuiz: QuizDragPayload;
      silentSuccess?: boolean;
    }) => {
      const cls = classMap.get(classId);
      if (!cls) {
        return { ok: false, message: "Class not found." };
      }

      const todayForClass = tzDayKey(new Date(), cls.classTimezone);
      if (dayKey < todayForClass) {
        return {
          ok: false,
          message: `Cannot schedule in the past for ${cls.className || "this class"}.`,
        };
      }

      const startDate = startOfDayInTZ(dayKey, cls.classTimezone);
      const endDate = endOfDayInTZ(dayKey, cls.classTimezone);
      const clientId = `c-${crypto.randomUUID?.() || Math.random().toString(16).slice(2)}`;

      const optimistic: ScheduleItem = {
        clientId,
        _id: undefined,
        quizId: dragQuiz.id,
        quizRootId: dragQuiz.rootQuizId || dragQuiz.id,
        quizVersion:
          typeof dragQuiz.version === "number" && Number.isFinite(dragQuiz.version)
            ? dragQuiz.version
            : 1,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        quizName: dragQuiz.title,
        subject: dragQuiz.subject,
        subjectColor: dragQuiz.subjectColorHex,
        topic: dragQuiz.topic,
        quizType: dragQuiz.type,
        contribution: 100,
        attemptsAllowed: 1,
        showAnswersAfterAttempt: true,
      };

      replaceScheduleItem(classId, clientId, optimistic);

      const res = await addClassQuizSchedule(classId, {
        quizId: optimistic.quizId,
        quizRootId: optimistic.quizRootId,
        quizVersion: optimistic.quizVersion,
        startDate,
        endDate,
        contribution: optimistic.contribution,
        attemptsAllowed: optimistic.attemptsAllowed,
        showAnswersAfterAttempt: optimistic.showAnswersAfterAttempt,
      });

      if (!res.ok || !res.data?._id) {
        replaceScheduleItem(classId, clientId, null);
        return {
          ok: false,
          message:
            (res.message || "Could not schedule quiz.") +
            formatSchedulerBoardFieldErrors(
              (res as { fieldErrors?: Record<string, unknown> }).fieldErrors
            ),
        };
      }

      replaceScheduleItem(classId, clientId, {
        ...optimistic,
        ...res.data,
        clientId,
        _id: res.data._id,
      });

      if (!silentSuccess) {
        showToast({
          title: "Scheduled",
          description: `Quiz scheduled for ${cls.className || "class"}.`,
          variant: "success",
        });
      }

      return { ok: true };
    },
    [classMap, replaceScheduleItem, showToast]
  );

  const handleDragStart = useCallback(
    (e: DragStartEvent) => {
      const drag = (e.active?.data?.current as DragData | undefined) ?? null;
      setActiveDrag(drag);

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
    [classMap, findItemAcrossClasses]
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
        cls.classTimezone
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
          cls.classTimezone
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
          cls.classTimezone
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
    [classMap, clearPreview]
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
        if (!drag.quiz || !target) return;
        const out = await scheduleOneClass({
          classId: target.classId,
          dayKey: target.dayKey,
          dragQuiz: drag.quiz,
        });
        if (!out.ok) {
          showToast({
            title: "Failed",
            description: out.message || "Could not schedule quiz.",
            variant: "error",
          });
        }
        return;
      }

      if (drag.kind === "pill-resize") {
        const resizeState = resizeStateRef.current;
        resizeStateRef.current = null;
        if (!resizeState) return;

        const cls = classMap.get(resizeState.classId);
        if (!cls) return;

        const currentItem = cls.schedule.find(
          (it) => it.clientId === resizeState.clientId
        );
        if (!currentItem) return;

        const finalDayKey =
          resizeState.lastValidDayKey ||
          (target?.classId === resizeState.classId ? target.dayKey : undefined);
        if (!finalDayKey) return;

        if (resizeState.direction === "left" && hasStarted(currentItem, cls.classTimezone)) {
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
            currentStartUTC.getMilliseconds()
          );
          if (newStartDate > newEndDate) {
            newStartDate = startOfDayInTZ(
              dayKeyFromDateInTZ(newEndDate, cls.classTimezone),
              cls.classTimezone
            );
          }
        } else {
          newEndDate = endOfDayInTZ(finalDayKey, cls.classTimezone);
          if (newEndDate < newStartDate) {
            newEndDate = endOfDayInTZ(
              dayKeyFromDateInTZ(newStartDate, cls.classTimezone),
              cls.classTimezone
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

        patchScheduleItem(resizeState.classId, currentItem.clientId, {
          startDate: newStartDate.toISOString(),
          endDate: newEndDate.toISOString(),
        });

        if (!currentItem._id) {
          patchScheduleItem(resizeState.classId, currentItem.clientId, previous);
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
          }
        );

        if (!res.ok) {
          patchScheduleItem(resizeState.classId, currentItem.clientId, previous);
          showToast({
            title: "Failed",
            description:
              (res.message || "Could not resize schedule.") +
              formatSchedulerBoardFieldErrors(
                (res as { fieldErrors?: Record<string, unknown> }).fieldErrors
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
        const classId = drag.classId || fallback?.classId;
        if (!classId) return;

        if (target.classId !== classId) {
          showToast({
            title: "Not allowed",
            description:
              "Move within the same class calendar. To schedule in another class, drag from the quiz bank.",
            variant: "error",
          });
          return;
        }

        const cls = classMap.get(classId) || fallback?.cls;
        const currentItem =
          cls?.schedule.find((it) => it.clientId === drag.clientId) ||
          fallback?.item;
        if (!cls || !currentItem) return;

        if (hasStarted(currentItem, cls.classTimezone)) {
          showToast({
            title: "Not allowed",
            description:
              "The start time can’t be changed after the quiz has started.",
            variant: "error",
          });
          return;
        }

        const todayKey = tzDayKey(new Date(), cls.classTimezone);
        const originalStartKey = dayKeyFromDateInTZ(
          new Date(currentItem.startDate),
          cls.classTimezone
        );
        const originalEndKey = dayKeyFromDateInTZ(
          new Date(currentItem.endDate),
          cls.classTimezone
        );
        const daySpan = diffDayKeys(originalEndKey, originalStartKey) + 1;

        const newStartKey = target.dayKey;
        const newEndKey = addDaysToDayKey(newStartKey, daySpan - 1);

        const startTime = getTimePartsInTZ(
          new Date(currentItem.startDate),
          cls.classTimezone
        );
        const endTime = getTimePartsInTZ(
          new Date(currentItem.endDate),
          cls.classTimezone
        );

        const newStartDate = makeDateInTZ(
          newStartKey,
          cls.classTimezone,
          startTime.hour,
          startTime.minute,
          startTime.second,
          new Date(currentItem.startDate).getMilliseconds()
        );
        let newEndDate = makeDateInTZ(
          newEndKey,
          cls.classTimezone,
          endTime.hour,
          endTime.minute,
          endTime.second,
          new Date(currentItem.endDate).getMilliseconds()
        );
        if (newEndDate < newStartDate) {
          newEndDate = endOfDayInTZ(newEndKey, cls.classTimezone);
        }

        if (dayKeyFromDateInTZ(newStartDate, cls.classTimezone) < todayKey) {
          showToast({
            title: "Not allowed",
            description: "A move can’t make the schedule start before today.",
            variant: "error",
          });
          return;
        }

        const unchanged =
          dayKeyFromDateInTZ(newStartDate, cls.classTimezone) ===
            dayKeyFromDateInTZ(new Date(currentItem.startDate), cls.classTimezone) &&
          dayKeyFromDateInTZ(newEndDate, cls.classTimezone) ===
            dayKeyFromDateInTZ(new Date(currentItem.endDate), cls.classTimezone);
        if (unchanged) return;

        const previous = {
          startDate: currentItem.startDate,
          endDate: currentItem.endDate,
        };

        patchScheduleItem(classId, currentItem.clientId, {
          startDate: newStartDate.toISOString(),
          endDate: newEndDate.toISOString(),
        });

        if (!currentItem._id) {
          patchScheduleItem(classId, currentItem.clientId, previous);
          showToast({
            title: "Failed",
            description: "Schedule item id is missing.",
            variant: "error",
          });
          return;
        }

        const res = await editClassScheduleItem(classId, currentItem._id, {
          startDate: newStartDate,
          endDate: newEndDate,
        });

        if (!res.ok) {
          patchScheduleItem(classId, currentItem.clientId, previous);
          showToast({
            title: "Failed",
            description:
              (res.message || "Could not move schedule.") +
              formatSchedulerBoardFieldErrors(
                (res as { fieldErrors?: Record<string, unknown> }).fieldErrors
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
      }
    },
    [
      classMap,
      clearPreview,
      findItemAcrossClasses,
      patchScheduleItem,
      scheduleOneClass,
      showToast,
    ]
  );

  const handleDragCancel = useCallback(() => {
    setActiveDrag(null);
    clearPreview();
    resizeStateRef.current = null;
  }, [clearPreview]);

  const handleOpenEdit = useCallback(
    (req: { classId: string; classTimezone: string; item: ScheduleItem }) => {
      setEditClassId(req.classId);
      setEditClassTimezone(req.classTimezone || "UTC");
      setEditItem(req.item);
      setEditOpen(true);

      setVersionOptions(
        typeof req.item.quizVersion === "number" ? [req.item.quizVersion] : []
      );
      setVersionLoading(true);

      if (!req.item._id) {
        setVersionLoading(false);
        return;
      }

      (async () => {
        const res = await getScheduleItemAction(req.classId, req.item._id!);
        if (!res.ok || !res.data) {
          showToast({
            title: "Could not load schedule details",
            description:
              ("message" in res ? res.message : undefined) ||
              "Version options are unavailable.",
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
            : prev
        );
        setVersionLoading(false);
      })();
    },
    [showToast]
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
          fieldErrors: (res as {
            fieldErrors?: Record<string, string | string[] | undefined>;
          }).fieldErrors,
        };
      }

      patchScheduleItem(editClassId, editItem.clientId, {
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
    [editClassId, editItem, patchScheduleItem, showToast]
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

    replaceScheduleItem(editClassId, editItem.clientId, null);
    showToast({
      title: "Removed",
      description: "Schedule item deleted.",
      variant: "success",
    });
    handleCloseEdit();
  }, [editClassId, editItem, handleCloseEdit, replaceScheduleItem, showToast]);

  if (!classes.length) {
    return (
      <EmptyStateBox
        title="No classes to schedule yet"
        description="Create at least one class before scheduling quizzes."
        action={
          <Button href="/classes/create" variant="primary">
            Create Class
          </Button>
        }
      />
    );
  }

  return (
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={pointerWithin}
        measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <div className="space-y-4">
          <div>
            <h1 className="text-xl font-semibold text-[var(--color-text-primary)]">
              Scheduling
            </h1>
            <p className="text-sm text-[var(--color-text-secondary)]">
              Manage schedules across classes on a unified seven-day calendar.
            </p>
          </div>

          <SchedulingToolbar
            classes={classes}
            goToDate={startKey}
            onGoToDateChange={setStartKey}
            selectedClassIds={selectedClassIds}
            onSelectedClassIdsChange={setSelectedClassIds}
          />

          <QuizBankSidebar
            initial={initialQuizState}
            filterMeta={{
              subjects: filterMeta.subjects || [],
              topics: filterMeta.topics || [],
              types: filterMeta.types || [],
            }}
          />

          <MultiClassCalendarGrid
            classes={classes}
            selectedClassIds={selectedClassIds}
            startKey={startKey}
            onStartKeyChange={setStartKey}
            previewByClassId={previewByClassId}
            draggingPill={draggingPill}
            resizingPill={resizingPill}
            onEditRequest={handleOpenEdit}
          />
        </div>

        {typeof window !== "undefined" &&
          createPortal(
            <DragOverlay dropAnimation={null}>
              {activeDrag?.kind === "quiz-row" && (
                <QuizRowOverlay
                  title={activeDrag.quiz?.title}
                  color={activeDrag.quiz?.subjectColorHex}
                />
              )}
              {(activeDrag?.kind === "pill" ||
                activeDrag?.kind === "pill-resize") && (
                <PillOverlay
                  title={activeDrag.title || activeDrag.quizId}
                  color={activeDrag.subjectColor}
                />
              )}
            </DragOverlay>,
            document.body
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
    </>
  );
}
