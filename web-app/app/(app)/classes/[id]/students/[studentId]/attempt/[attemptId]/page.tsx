import AttemptHeader from "@/components/classes/attempt-page/AttemptHeader";
import BasicOrRapidAttempt from "@/components/classes/attempt-page/BasicOrRapidAttempt";
import CrosswordAttempt from "@/components/classes/attempt-page/CrosswordAttempt";
import {
  getQuizAttempt,
  type QuizAttemptDto,
} from "@/services/quiz/actions/get-quiz-attempt";
import type {
  BasicOrRapidAttemptType,
  CrosswordAttemptType,
} from "@/services/class/types/class-types";
import {
  getAttemptsForScheduleByStudent,
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

  const attempt = resp.data as QuizAttemptDto;

  // Guard ownership
  if (
    String(attempt.studentId) !== String(studentId) ||
    (attempt.classId && String(attempt.classId) !== String(classId))
  ) {
    return notFound();
  }

  // Build switcher options for attempts in THIS schedule (server already filters by schedule+student)
  const scheduleId = String(attempt.scheduleId ?? "");
  const listRes = await getAttemptsForScheduleByStudent(scheduleId, studentId);
  if (!listRes.ok) return notFound();

  // Server sorts by recency; keep that. If you want, you can sort again here.
  const switcherOptions = (listRes.rows ?? []).map((r) => {
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

  // Prefer live quiz meta for quizType; fall back to snapshot if needed
  const type =
    attempt.quiz?.quizType ??
    (typeof attempt.quizVersionSnapshot === "object" &&
    attempt.quizVersionSnapshot !== null
      ? (attempt.quizVersionSnapshot as { quizType?: string }).quizType
      : null);

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
        {type === "basic" && (
          <BasicOrRapidAttempt
            attempt={attempt as BasicOrRapidAttemptType}
          />
        )}
        {type === "rapid" && (
          <BasicOrRapidAttempt
            attempt={attempt as BasicOrRapidAttemptType}
          />
        )}
        {type === "crossword" && (
          <CrosswordAttempt attempt={attempt as CrosswordAttemptType} />
        )}

        {type !== "basic" && type !== "rapid" && type !== "crossword" && (
          <div className="rounded-xl border border-[var(--color-bg4)] bg-[var(--color-bg3)] p-4 text-[var(--color-text-primary)]">
            This quiz type isn&apos;t supported for viewing yet.
          </div>
        )}
      </div>
    </div>
  );
}
