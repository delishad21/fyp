"use client";

import TutorialModal, { TutorialStep } from "@/components/ui/TutorialModal";

const steps: TutorialStep[] = [
  {
    title: "Schedule Quiz",
    subtitle: "Drag a quiz from the table onto the calendar to schedule it.",
    media: { src: "/tutorials/scheduling/ScheduleQuiz.mp4" },
  },
  {
    title: "Adjust Quiz Duration",
    subtitle:
      "Drag the edges of a scheduled quiz to extend or shorten the date range. Dragging over the side will auto-scroll the calendar.",
    media: { src: "/tutorials/scheduling/AdjustQuizDuration.mp4" },
  },
  {
    title: "Adjust Quiz Dates",
    subtitle:
      "Drag and drop a scheduled quiz to change its dates. Dragging over the side will auto-scroll the calendar.",
    media: { src: "/tutorials/scheduling/AdjustQuizDates.mp4" },
  },
  {
    title: "Edit Settings",
    subtitle:
      "Right-click a pill to manually choose dates, attempts allowed, contribution, and answer rules.",
    media: { src: "/tutorials/scheduling/EditSettings.mp4" },
  },
  {
    title: "Remove Quiz",
    subtitle: "Drag a pill off the calendar to remove it from the schedule.",
    media: { src: "/tutorials/scheduling/RemoveQuiz.mp4" },
  },
  {
    title: "Move Calendar",
    subtitle:
      "Scroll along the calendar to view more dates. Use the date picker to jump to a specific date.",
    media: { src: "/tutorials/scheduling/MoveCalendar.mp4" },
  },
];

export default function ScheduleTutorialHeader() {
  return (
    <div className="flex items-center justify-between gap-4">
      <h1 className="text-xl font-semibold text-[var(--color-text-primary)]">
        Schedule Quizzes
      </h1>
      <TutorialModal
        steps={steps}
        triggerLabel="How to Use"
        triggerIcon="mdi:help-circle-outline"
        triggerVariant="ghost"
        triggerClassName="gap-2 rounded-full px-3 py-1.5"
        triggerTitle="How to use scheduling"
      />
    </div>
  );
}
