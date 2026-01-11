import OverviewScheduleClient from "@/components/classes/overview-page/schedule/OverviewScheduleClient";
import TopLeaders from "@/components/classes/overview-page/podium/TopLeaders";
import { getClassSchedule } from "@/services/class/actions/class-schedule-actions";
import { getTopStudentsAction } from "@/services/class/actions/get-top-students-action";
import { getClass } from "@/services/class/actions/class-actions";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function OverviewPage({ params }: PageProps) {
  const { id: classId } = await params;

  // Fetch data in parallel
  const [cls, schedRes, topRes] = await Promise.all([
    getClass(classId),
    getClassSchedule(classId),
    getTopStudentsAction(classId, { limit: 3 }),
  ]);

  const initialSchedule = schedRes?.ok ? schedRes.data ?? [] : [];
  const leaders = topRes?.ok ? topRes.data : null;

  const classTimezone = cls?.ok ? cls.data.timezone : "UTC";

  return (
    <div className="space-y-6 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-[var(--color-text-primary)]">
          Class Overview
        </h2>
      </div>

      {/* Top leaders */}
      {leaders ? (
        <TopLeaders
          topOverallScore={leaders.topOverallScore}
          topParticipation={leaders.topParticipation}
          topStreak={leaders.topStreak}
        />
      ) : (
        <div className="rounded-xl border border-white/10 p-4 text-sm opacity-70">
          No leaderboard data yet.
        </div>
      )}

      {/* Schedule (read-only) */}
      <section className="">
        <OverviewScheduleClient
          initialSchedule={initialSchedule}
          classTimezone={classTimezone}
          classId={classId}
        />
      </section>
    </div>
  );
}
