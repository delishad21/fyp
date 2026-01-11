import DashboardTodayQuizzesTable, {
  type DashboardTodayQuizRow,
} from "@/components/dashboard/DashboardTodayQuizzesTable";
import HomepageScheduleClient from "@/components/dashboard/HomepageScheduleClient";
import Button from "@/components/ui/buttons/Button";
import EmptyStateBox from "@/components/ui/EmptyStateBox";

import {
  getAllClassesScheduleForDashboard,
  type ApiClassScheduleBundle,
} from "@/services/class/actions/class-schedule-actions";
import { getTodaySchedulesForDashboard } from "@/services/class/actions/get-todays-schedules-action";

export default async function Home() {
  // Fetch both sections in parallel
  const [todayRes, allClassesRes] = await Promise.all([
    getTodaySchedulesForDashboard(),
    getAllClassesScheduleForDashboard(),
  ]);

  /** ─────────────────────────────────────────────
   * 1) Today’s quizzes (top table)
   * ──────────────────────────────────────────── */
  let todayContent: React.ReactNode;

  if (!todayRes.ok) {
    todayContent = (
      <div className="rounded-md border border-red-700/30 bg-red-900/20 p-4 text-red-300">
        {todayRes.message ?? "Failed to load today's quizzes"}
      </div>
    );
  } else {
    const items = todayRes.data as DashboardTodayQuizRow[];

    todayContent =
      items.length === 0 ? (
        <EmptyStateBox
          title="Nothing scheduled today"
          description="You don't have any quizzes scheduled for today."
        />
      ) : (
        <DashboardTodayQuizzesTable items={items} />
      );
  }

  /** ─────────────────────────────────────────────
   * 2) All-class schedules (stacked 7-day calendars)
   * ──────────────────────────────────────────── */
  let scheduleContent: React.ReactNode;

  if (!allClassesRes.ok) {
    scheduleContent = (
      <div className="rounded-md border border-red-700/30 bg-red-900/20 p-4 text-red-300">
        {allClassesRes.message ?? "Failed to load schedules"}
      </div>
    );
  } else {
    const bundles: ApiClassScheduleBundle[] = allClassesRes.data;
    scheduleContent =
      bundles.length === 0 ? (
        <EmptyStateBox
          title="No classes yet"
          description="Create a class to start scheduling quizzes for students."
          action={
            <Button href="/classes/create" variant="primary">
              Create Class
            </Button>
          }
        />
      ) : (
        <HomepageScheduleClient classBundles={bundles} />
      );
  }

  return (
    <div className="space-y-8">
      {/* Today’s quizzes table */}
      <section className="space-y-4">
        <h1 className="text-xl font-semibold text-[var(--color-text-primary)]">
          Today&apos;s Quizzes
        </h1>
        {todayContent}
      </section>

      {/* Stacked 7-day calendars for each class */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
          Class Schedules (Next 7 Days)
        </h2>
        {scheduleContent}
      </section>
    </div>
  );
}
