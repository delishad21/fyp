import TodaysQuizzesCard from "@/components/dashboard/TodaysQuizzesCard";
import UpcomingQuizzesCard from "@/components/dashboard/UpcomingQuizzesCard";
import ScheduleCard from "@/components/dashboard/ScheduleCard";

export default function Page() {
  return (
    <>
      <TodaysQuizzesCard />

      {/* Stack on mobile; at lg: left grows up to 480px, right takes remaining space */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(200px,300px)_1fr] gap-6 mt-6">
        <div>
          <UpcomingQuizzesCard />
        </div>
        <div className="min-w-0">
          <ScheduleCard />
        </div>
      </div>
    </>
  );
}
