"use client";

import { useCallback, useMemo, useState } from "react";
import type {
  ApiClassScheduleBundle,
  ApiScheduleItem,
} from "@/services/class/actions/class-schedule-actions";
import {
  withClientIds,
  tzDayKey,
} from "@/services/class/helpers/scheduling/scheduling-helpers";
import type { ScheduleItem } from "@/services/class/types/class-types";
import type {
  FilterMeta,
  InitialPayload,
  RowData,
} from "@/services/quiz/types/quiz-table-types";
import type { ScheduleQuizAttemptResult } from "@/components/quizzes/ScheduleQuizModal";
import type { ScheduleClassBundle } from "./types";
import SchedulingCalendarsTab from "./workspace/SchedulingCalendarsTab";

function toClassBundles(
  bundles: (ApiClassScheduleBundle & { colorHex?: string })[],
): ScheduleClassBundle[] {
  return bundles.map((b) => ({
    classId: b.classId,
    className: b.className,
    classTimezone: b.classTimezone || "UTC",
    colorHex: b.colorHex,
    schedule: withClientIds(b.schedule || []),
  }));
}

function toScheduleItem(item: ApiScheduleItem): ScheduleItem {
  return {
    ...item,
    clientId:
      item._id ||
      `c-${crypto.randomUUID?.() || Math.random().toString(16).slice(2)}`,
    quizId: item.quizId,
    quizRootId: item.quizRootId || item.quizId,
    quizVersion:
      typeof item.quizVersion === "number" && Number.isFinite(item.quizVersion)
        ? item.quizVersion
        : 1,
    startDate: item.startDate,
    endDate: item.endDate,
  };
}

export default function SchedulingWorkspace(props: {
  bundles: (ApiClassScheduleBundle & { colorHex?: string })[];
  filterMeta: FilterMeta;
  quizRows: RowData[];
  quizPage: number;
  quizPageCount: number;
  quizTotal: number;
  initialCalendarStartKey?: string;
}) {
  const {
    bundles,
    filterMeta,
    quizRows,
    quizPage,
    quizPageCount,
    initialCalendarStartKey,
  } = props;
  const [classes, setClasses] = useState<ScheduleClassBundle[]>(() =>
    toClassBundles(bundles),
  );

  const defaultStartKey = useMemo(() => {
    const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    return tzDayKey(new Date(), browserTz);
  }, []);
  const [calendarStartKey, setCalendarStartKey] = useState(
    initialCalendarStartKey && /^\d{4}-\d{2}-\d{2}$/.test(initialCalendarStartKey)
      ? initialCalendarStartKey
      : defaultStartKey,
  );

  const quizzesInitial = useMemo<InitialPayload>(
    () => ({
      rows: quizRows,
      page: quizPage,
      pageCount: quizPageCount,
      pageSize: 10,
      meta: filterMeta,
      query: { page: quizPage, pageSize: 10 },
    }),
    [filterMeta, quizPage, quizPageCount, quizRows],
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
        }),
      );
    },
    [],
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
                  it.clientId === clientId ? { ...it, ...patch } : it,
                ),
              },
        ),
      );
    },
    [],
  );

  const appendCreatedSchedules = useCallback(
    (result: ScheduleQuizAttemptResult) => {
      if (!result.createdItems.length) return;

      setClasses((prev) =>
        prev.map((cls) => {
          const additions = result.createdItems
            .filter((row) => row.classId === cls.classId)
            .map((row) => toScheduleItem(row.item));
          if (!additions.length) return cls;

          const existingIds = new Set(
            cls.schedule.map((it) => it._id).filter(Boolean) as string[],
          );
          const deduped = additions.filter(
            (it) => !it._id || !existingIds.has(it._id),
          );
          if (!deduped.length) return cls;

          return {
            ...cls,
            schedule: cls.schedule.concat(deduped),
          };
        }),
      );
    },
    [],
  );

  const handleScheduleAttemptComplete = useCallback(
    (result: ScheduleQuizAttemptResult) => {
      appendCreatedSchedules(result);
      if (result.startYMD) {
        setCalendarStartKey(result.startYMD);
      }
    },
    [appendCreatedSchedules],
  );

  return (
    <div className="h-full min-h-0">
      <SchedulingCalendarsTab
        classes={classes}
        startKey={calendarStartKey}
        onStartKeyChange={setCalendarStartKey}
        onReplaceItem={replaceScheduleItem}
        onPatchItem={patchScheduleItem}
        quizTableInitial={quizzesInitial}
        onScheduleAttemptComplete={handleScheduleAttemptComplete}
      />
    </div>
  );
}
