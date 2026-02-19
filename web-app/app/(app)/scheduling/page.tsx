import SchedulingWorkspace from "@/components/scheduling/SchedulingWorkspace";
import { getAllClassesScheduleForDashboard } from "@/services/class/actions/class-schedule-actions";
import { getClasses } from "@/services/class/actions/class-actions";
import { queryQuizzes } from "@/services/quiz/actions/query-quiz-action";
import { getFilterMeta } from "@/services/quiz/actions/quiz-metadata-actions";
import type { ClassItem } from "@/services/class/types/class-types";

export default async function SchedulingPage({
  searchParams,
}: {
  searchParams?: { start?: string };
}) {
  const [allRes, classesRaw, meta, quizRes] = await Promise.all([
    getAllClassesScheduleForDashboard(),
    getClasses(),
    getFilterMeta(),
    queryQuizzes({ page: 1, pageSize: 10 }),
  ]);

  const classColorById = (Array.isArray(classesRaw) ? classesRaw : []).reduce<
    Record<string, string | undefined>
  >((acc, cls) => {
    const c = cls as ClassItem;
    acc[String(c._id)] = c?.metadata?.color;
    return acc;
  }, {});

  const fetchedScheduleByClass = allRes.ok
    ? allRes.data.reduce<
        Record<
          string,
          {
            className?: string;
            classTimezone: string;
            schedule: typeof allRes.data[number]["schedule"];
          }
        >
      >((acc, row) => {
        acc[row.classId] = {
          className: row.className,
          classTimezone: row.classTimezone || "UTC",
          schedule: row.schedule || [],
        };
        return acc;
      }, {})
    : {};

  const bundles = Array.isArray(classesRaw)
    ? classesRaw.map((raw) => {
        const cls = raw as ClassItem & { timezone?: string };
        const id = String(cls._id);
        const sched = fetchedScheduleByClass[id];
        return {
          classId: id,
          className: cls.name || sched?.className,
          classTimezone:
            (typeof cls.timezone === "string" && cls.timezone) ||
            sched?.classTimezone ||
            "UTC",
          schedule: sched?.schedule || [],
          colorHex: classColorById[id],
        };
      })
    : [];

  const startParam =
    typeof searchParams?.start === "string" ? searchParams.start.trim() : "";
  const initialCalendarStartKey = /^\d{4}-\d{2}-\d{2}$/.test(startParam)
    ? startParam
    : undefined;

  return (
    <div className="h-full min-h-0">
      <SchedulingWorkspace
        bundles={bundles}
        quizRows={quizRes.rows}
        quizPage={quizRes.page}
        quizPageCount={quizRes.pageCount}
        quizTotal={quizRes.total}
        filterMeta={meta}
        initialCalendarStartKey={initialCalendarStartKey}
      />
    </div>
  );
}
