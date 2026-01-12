"use client";

import { useMemo, useState } from "react";
import type { ApiScheduleItem } from "@/services/class/actions/class-schedule-actions";
import SevenDayCalendar from "../../schedule-page/calendar/SevenDayCalendar";
import { ScheduleItem } from "@/services/class/types/class-types";
import { ScheduleTitleComponent } from "./ScheduleTitleComponent";

function withClientIds(items: ApiScheduleItem[]): ScheduleItem[] {
  return (items ?? []).map((it) => ({
    ...it,
    clientId:
      ("clientId" in it ? (it as { clientId?: string }).clientId : undefined) ??
      it._id ??
      `c-${crypto.randomUUID?.() || Math.random().toString(16).slice(2)}`,
  }));
}

export default function OverviewScheduleClient({
  initialSchedule,
  classTimezone,
  classId,
}: {
  initialSchedule: ApiScheduleItem[];
  classTimezone: string;
  classId: string;
}) {
  const initial = useMemo(
    () => withClientIds(initialSchedule || []),
    [initialSchedule]
  );
  const [schedule] = useState<ScheduleItem[]>(initial);

  return (
    <SevenDayCalendar
      schedule={schedule}
      classTimezone={classTimezone}
      readOnly
      titleComponent={<ScheduleTitleComponent classId={classId} />}
    />
  );
}
