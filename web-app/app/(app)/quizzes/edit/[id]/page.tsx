import BasicQuizForm from "@/components/quizzes/quiz-forms/BasicQuizForm";
import CrosswordQuizForm from "@/components/quizzes/quiz-forms/CrosswordQuizForm";
import RapidQuizForm from "@/components/quizzes/quiz-forms/RapidQuizForm";
import { getQuizForEdit } from "@/services/quiz/actions/get-quiz-action";
import { getFilterMeta } from "@/services/quiz/actions/quiz-metadata-actions";
import { getQuizTypeColors } from "@/services/quiz/actions/quiz-type-colors-action";
import { notFound } from "next/navigation";

export default async function EditQuizPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ version?: string; question?: string }>;
}) {
  const paramsResolved = await params;
  const searchParamsResolved = await searchParams;
  const version = searchParamsResolved?.version
    ? Number(searchParamsResolved.version)
    : undefined;
  const questionIndex = searchParamsResolved?.question
    ? Number(searchParamsResolved.question)
    : undefined;

  const quizRes = await getQuizForEdit(paramsResolved.id, version);
  if (!quizRes.ok) {
    return notFound();
  }

  const meta = await getFilterMeta();
  const typeColors = await getQuizTypeColors();
  const data = quizRes.data;
  const { versions, currentVersion } = quizRes;

  let form: React.ReactNode = null;

  if (data.quizType === "rapid") {
    form = (
      <RapidQuizForm
        key={`rapid-${paramsResolved.id}-v${currentVersion}`}
        meta={meta}
        mode="edit"
        initialData={data}
        versions={versions}
        currentVersion={currentVersion}
        typeColorHex={typeColors.rapid}
        initialQuestionIndex={questionIndex}
      />
    );
  }

  if (data.quizType === "crossword") {
    form = (
      <CrosswordQuizForm
        key={`crossword-${paramsResolved.id}-v${currentVersion}`}
        meta={meta}
        mode="edit"
        initialData={data}
        versions={versions}
        currentVersion={currentVersion}
        typeColorHex={typeColors.crossword}
        initialQuestionIndex={questionIndex}
      />
    );
  }

  if (data.quizType === "basic") {
    form = (
      <BasicQuizForm
        key={`basic-${paramsResolved.id}-v${currentVersion}`}
        meta={meta}
        mode="edit"
        initialData={data}
        versions={versions}
        currentVersion={currentVersion}
        typeColorHex={typeColors.basic}
        initialQuestionIndex={questionIndex}
      />
    );
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
