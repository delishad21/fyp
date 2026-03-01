import BasicOrRapidQuizPreview from "@/components/quizzes/quiz-view/BasicOrRapidQuizPreview";
import CrosswordQuizPreview from "@/components/quizzes/quiz-view/CrosswordQuizPreview";
import { getGenerationStatus } from "@/services/ai-generation/ai-generation-actions";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Icon } from "@iconify/react";

type PageProps = {
  params: Promise<{ jobId: string; tempId: string }>;
};

export default async function Page({ params }: PageProps) {
  const { jobId, tempId } = await params;

  const result = await getGenerationStatus(jobId);
  if (!result.ok || !result.job) {
    notFound();
  }

  const quiz = result.job.results?.quizzes.find((q) => q.tempId === tempId);
  if (!quiz) {
    notFound();
  }

  const quizType = quiz.quizType;

  return (
    <div className="px-10 pt-6 space-y-6">
      {/* Header with back button */}
      <div className="flex items-center gap-4 mb-4">
        <Link
          href={`/quizzes/ai-generate/review/${jobId}`}
          className="text-[var(--color-text-secondary)] hover:text-[var(--color-accent)] transition-colors"
        >
          <Icon icon="mdi:arrow-left" className="w-6 h-6" />
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-semibold text-[var(--color-text-primary)]">
            {quiz.name}
          </h1>
          <div className="flex items-center gap-4 mt-1 text-sm text-[var(--color-text-secondary)]">
            <span className="capitalize">{quiz.quizType}</span>
            {quiz.subject && <span>• {quiz.subject}</span>}
            {quiz.topic && <span>• {quiz.topic}</span>}
          </div>
        </div>
        <Link
          href={`/quizzes/ai-generate/review/${jobId}/edit/${tempId}`}
          className="px-4 py-2 bg-[var(--color-accent)] text-white rounded-lg hover:opacity-90 transition-opacity flex items-center gap-2"
        >
          <Icon icon="mdi:pencil" className="w-4 h-4" />
          Edit Quiz
        </Link>
      </div>

      {/* Quiz content */}
      <div className="space-y-4">
        {quizType === "basic" ||
        quizType === "rapid" ||
        quizType === "true-false" ? (
          <BasicOrRapidQuizPreview data={quiz as never} />
        ) : (
          <CrosswordQuizPreview data={quiz as never} />
        )}
      </div>
    </div>
  );
}
