import BasicQuizForm from "@/components/quizzes/quiz-forms/BasicQuizForm";
import CrosswordQuizForm from "@/components/quizzes/quiz-forms/CrosswordQuizForm";
import RapidQuizForm from "@/components/quizzes/quiz-forms/RapidQuizForm";
import { getQuizForEdit } from "@/services/quiz/actions/get-quiz-action";
import { getFilterMeta } from "@/services/quiz/actions/quiz-metadata-actions";
import { notFound } from "next/navigation";

export default async function EditQuizPage({
  params,
}: {
  params: { id: string };
}) {
  const quizRes = await getQuizForEdit((await params).id);
  if (!quizRes.ok) {
    return notFound();
  }
  const meta = await getFilterMeta();
  let form;

  const data = quizRes.data;

  if (data.quizType === "rapid") {
    form = <RapidQuizForm meta={meta} mode="edit" initialData={data} />;
  }
  if (data.quizType === "crossword") {
    form = <CrosswordQuizForm meta={meta} mode="edit" initialData={data} />;
  }
  if (data.quizType === "basic") {
    form = <BasicQuizForm meta={meta} mode="edit" initialData={data} />;
  }

  if (!form) {
    return notFound();
  }

  return (
    <div className="px-10 pt-6">
      <h1 className="mb-4 text-xl font-semibold text-[var(--color-text-primary)]">
        Edit Quiz
      </h1>
      {form}
    </div>
  );
}
