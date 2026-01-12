"use client";

import { useMemo } from "react";
import SevenDayCalendar from "@/components/classes/schedule-page/calendar/SevenDayCalendar";
import type {
  ApiClassScheduleBundle,
  ApiScheduleItem,
} from "@/services/class/actions/class-schedule-actions";
import type { ScheduleItem } from "@/services/class/types/class-types";
import Link from "next/link";
import IconButton from "@/components/ui/buttons/IconButton";

function withClientIds(items: ApiScheduleItem[]): ScheduleItem[] {
  return (items ?? []).map((it) => ({
    ...it,
    clientId:
      ("clientId" in it ? (it as { clientId?: string }).clientId : undefined) ??
      it._id ??
      `c-${crypto.randomUUID?.() || Math.random().toString(16).slice(2)}`,
  }));
}

function ClassScheduleHeader({
  classId,
  className,
}: {
  classId: string;
  className?: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <h2 className="text-xl font-bold pl-1 text-[var(--color-text-primary)]">
        {className || "Untitled Class"}
      </h2>

      <div className="flex items-center gap-2">
        {/* Edit schedule */}
        <Link href={`/classes/${encodeURIComponent(classId)}/scheduling`}>
          <IconButton
            icon="mdi:pencil"
            variant="borderless"
            title="Edit Schedule"
            ariaLabel="Edit Schedule"
          />
        </Link>
      </div>
    </div>
  );
}

export default function HomepageScheduleClient({
  classBundles,
}: {
  classBundles: ApiClassScheduleBundle[];
}) {
  const normalized = useMemo(
    () =>
      (classBundles ?? []).map((cls) => ({
        ...cls,
        schedule: withClientIds(cls.schedule),
      })),
    [classBundles]
  );

  if (!normalized.length) {
    return (
      <div className="rounded-md border border-[var(--color-bg4)] bg-[var(--color-bg2)] p-4 text-sm text-[var(--color-text-secondary)]">
        No scheduled quizzes for your classes yet.
      </div>
    );
  }

  return (
    <div className="space-y-1 shadow-md rounded-lg">
      {normalized.map((cls) => (
        <div key={cls.classId} className="rounded-lg bg-[var(--color-bg2)] p-4">
          <ClassScheduleHeader
            classId={cls.classId}
            className={cls.className}
          />

          <SevenDayCalendar
            schedule={cls.schedule}
            classTimezone={cls.classTimezone}
            readOnly
            showGoToDate={false}
            titleComponent={null}
          />
        </div>
      ))}
    </div>
  );
}
