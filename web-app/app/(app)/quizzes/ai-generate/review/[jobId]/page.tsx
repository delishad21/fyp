import { getGenerationStatus } from "@/services/ai-generation/ai-generation-actions";
import { notFound } from "next/navigation";
import GeneratedQuizReview from "@/components/quizzes/ai-generation/GeneratedQuizReview";
import { getFilterMeta } from "@/services/quiz/actions/quiz-metadata-actions";

export default async function Page({
  params,
}: {
  params: Promise<{ jobId: string }>;
}) {
  const { jobId } = await params;
  const result = await getGenerationStatus(jobId);

  if (!result.ok || !result.job) {
    notFound();
  }

  const meta = await getFilterMeta();

  return (
    <div className="min-h-screen px-10 pt-5">
      <GeneratedQuizReview job={result.job} meta={meta} />
    </div>
  );
}
