"use client";

import Select from "@/components/ui/selectors/select/Select";
import { StudentAttemptRow } from "@/services/class/types/class-types";
import { useRouter } from "next/navigation";

export default function AttemptSwitcher({
  classId,
  studentId,
  currentAttemptId,
  attempts,
}: {
  classId: string;
  studentId: string;
  currentAttemptId: string;
  attempts: StudentAttemptRow[];
}) {
  const router = useRouter();

  const options = attempts.map((r) => {
    const ts = r.finishedAt ?? r.startedAt ?? r.createdAt;
    const when = ts
      ? new Date(ts).toLocaleString(undefined, {
          day: "2-digit",
          month: "short",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })
      : "Unknown time";
    const label = `${when} — ${r.score ?? 0}/${r.maxScore ?? 0}`;
    return { label, value: r._id };
  });

  return (
    <div className="flex justify-end p-2">
      <div className="w-[320px]">
        <Select
          id="attempt-picker"
          label="View attempt"
          value={currentAttemptId}
          onChange={(val) => {
            const href = `/classes/${encodeURIComponent(
              classId
            )}/students/${encodeURIComponent(
              studentId
            )}/attempt/${encodeURIComponent(val)}`;
            router.push(href);
          }}
          options={options}
          placeholder="Select attempt…"
        />
      </div>
    </div>
  );
}
