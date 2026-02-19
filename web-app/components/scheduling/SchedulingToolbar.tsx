"use client";

import DateField from "@/components/ui/selectors/DateField";
import MultiSelect from "@/components/ui/selectors/multi-select/MultiSelect";
import type { ScheduleClassBundle } from "./types";

function classOptions(classes: ScheduleClassBundle[]) {
  return classes.map((c) => ({
    value: c.classId,
    label: c.className ?? "Untitled class",
    colorHex: c.colorHex,
  }));
}

export default function SchedulingToolbar({
  classes,
  goToDate,
  onGoToDateChange,
  selectedClassIds,
  onSelectedClassIdsChange,
}: {
  classes: ScheduleClassBundle[];
  goToDate: string;
  onGoToDateChange: (next: string) => void;
  selectedClassIds: string[];
  onSelectedClassIdsChange: (next: string[]) => void;
}) {
  return (
    <div className="rounded-lg border border-[var(--color-bg4)] bg-[var(--color-bg2)] p-4">
      <div className="flex flex-wrap items-end gap-4">
        <DateField
          label="Go to date"
          value={goToDate}
          onChange={(next) => {
            if (next) onGoToDateChange(next);
          }}
          className="min-w-[220px]"
        />

        <div className="min-w-[300px] flex-1">
          <MultiSelect
            label="Visible classes"
            options={classOptions(classes)}
            value={selectedClassIds}
            onChange={onSelectedClassIdsChange}
            placeholder="All classes"
            searchable
            className="w-full"
          />
        </div>
      </div>
    </div>
  );
}
