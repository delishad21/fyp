import AttemptHeader from "@/components/classes/attempt-page/AttemptHeader";
import BasicOrRapidAttempt from "@/components/classes/attempt-page/BasicOrRapidAttempt";
import CrosswordAttempt from "@/components/classes/attempt-page/CrosswordAttempt";
import { getQuizAttempt } from "@/services/quiz/actions/get-quiz-attempt";
import {
  getStudentAttempts,
  getStudentInClass,
} from "@/services/class/actions/get-student-actions";
import { notFound } from "next/navigation";

export default async function AttemptPage({
  params,
}: {
  params: Promise<{ id: string; studentId: string; attemptId: string }>;
}) {
  const { id: classId, studentId, attemptId } = await params;

  // Current attempt
  const resp = await getQuizAttempt(attemptId);
  if (!resp?.ok || !resp.data) return notFound();
  const attempt = resp.data;

  // Guard ownership
  if (
    String(attempt.studentId) !== String(studentId) ||
    (attempt.classId && String(attempt.classId) !== String(classId))
  ) {
    return notFound();
  }

  // Build switcher options for attempts in THIS schedule
  const listRes = await getStudentAttempts(studentId, 1, 100);
  const scheduleId = String(attempt.scheduleId ?? "");
  const allForSchedule = (listRes.rows ?? [])
    .filter((r) => String(r.scheduleId) === scheduleId)
    .sort((a, b) => {
      const at = new Date(
        a.finishedAt ?? a.startedAt ?? a.createdAt ?? 0
      ).getTime();
      const bt = new Date(
        b.finishedAt ?? b.startedAt ?? b.createdAt ?? 0
      ).getTime();
      return bt - at;
    });

  const switcherOptions = allForSchedule.map((r) => {
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
    return {
      value: r._id,
      label: `${when} — ${r.score ?? 0}/${r.maxScore ?? 0}`,
    };
  });

  // Canonical id (to show Best Attempt)
  const studentRes = await getStudentInClass(classId, studentId);
  const canonicalAttemptId = studentRes.ok
    ? studentRes.data?.stats?.canonicalBySchedule?.[scheduleId]?.attemptId
    : undefined;

  const type = attempt?.quizVersionSnapshot?.quizType;

  return (
    <div className="mx-auto space-y-2 p-2">
      <AttemptHeader
        classId={classId}
        studentId={studentId}
        attempt={attempt}
        isCanonical={String(attemptId) === String(canonicalAttemptId)}
        switcher={{ currentAttemptId: attemptId, options: switcherOptions }}
      />

      <div className="h-2 p-6">
        {type === "basic" && <BasicOrRapidAttempt attempt={attempt} />}
        {type === "rapid" && <BasicOrRapidAttempt attempt={attempt} />}
        {type === "crossword" && <CrosswordAttempt attempt={attempt} />}

        {type !== "basic" && type !== "rapid" && type !== "crossword" && (
          <div className="rounded-xl border border-[var(--color-bg4)] bg-[var(--color-bg3)] p-4 text-[var(--color-text-primary)]">
            This quiz type isn't supported for viewing yet.
          </div>
        )}
      </div>
    </div>
  );
}
