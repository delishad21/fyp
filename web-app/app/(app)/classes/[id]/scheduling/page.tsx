import SchedulerBoard from "@/components/classes/schedule-page/SchedulerBoard";
import { getClassSchedule } from "@/services/class/actions/class-schedule-actions";
import { queryQuizzes } from "@/services/quiz/actions/query-quiz-action";
import { getFilterMeta } from "@/services/quiz/actions/quiz-metadata-actions";
import { InitialPayload } from "@/services/quiz/types/quiz-table-types";
import { getClass } from "@/services/class/actions/class-actions";
import ScheduleTutorialHeader from "@/components/classes/schedule-page/ScheduleTutorialHeader";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const classId = (await params).id;

  // Get schedule
  const initial = await getClassSchedule(classId);
  const initialSchedule = initial.ok ? initial.data : [];

  // Get class (for timezone)
  const cls = await getClass(classId);
  const classTimezone =
    (cls && typeof cls.timezone === "string" && cls.timezone) ||
    "Asia/Singapore";

  // Quizzes table bootstrap
  const meta = await getFilterMeta();
  const first = await queryQuizzes({ page: 1, pageSize: 10 });
  const tableInitial: InitialPayload = {
    rows: first.rows,
    page: first.page,
    pageCount: first.pageCount,
    pageSize: 10,
    meta,
    query: { page: 1, pageSize: 10 },
  };

  return (
    <div className="px-6 py-4 space-y-4">
      <ScheduleTutorialHeader />
      <SchedulerBoard
        classId={classId}
        initialSchedule={initialSchedule}
        tableInitial={tableInitial}
        classTimezone={classTimezone}
      />
    </div>
  );
}
