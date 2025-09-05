import RapidQuizForm from "@/components/quizzes/quiz-forms/RapidQuizForm";
import { getFilterMeta } from "@/services/quiz/actions/quiz-metadata-actions";

export default async function Page() {
  const meta = await getFilterMeta();
  return (
    <div className="px-10 pt-6">
      <h1 className="mb-4 text-xl font-semibold text-[var(--color-text-primary)]">
        Create New Quiz
      </h1>
      <RapidQuizForm meta={meta} mode="create" />
    </div>
  );
}
