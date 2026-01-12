import BasicQuizForm from "@/components/quizzes/quiz-forms/BasicQuizForm";
import CrosswordQuizForm from "@/components/quizzes/quiz-forms/CrosswordQuizForm";
import RapidQuizForm from "@/components/quizzes/quiz-forms/RapidQuizForm";
import { getFilterMeta } from "@/services/quiz/actions/quiz-metadata-actions";
import { getQuizTypeColors } from "@/services/quiz/actions/quiz-type-colors-action";
import { notFound } from "next/navigation";
import type {
  BasicInitial,
  CrosswordInitial,
  RapidInitial,
  QuizType,
} from "@/services/quiz/types/quizTypes";
import { getQuizForEdit } from "@/services/quiz/actions/get-quiz-action";

type PageProps = {
  params: Promise<{ quizType: QuizType | string }>;
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function Page({ params, searchParams }: PageProps) {
  const quizTypeParam = (await params).quizType as QuizType;
  const meta = await getFilterMeta();
  const typeColors = await getQuizTypeColors();

  const fromParam = (await searchParams)?.from;
  const versionParam = (await searchParams)?.version;
  const fromId = Array.isArray(fromParam) ? fromParam[0] : fromParam ?? null;
  const version =
    typeof versionParam === "string" && versionParam !== ""
      ? Number(versionParam)
      : undefined;

  const isClone = Boolean(fromId);

  // If someone hits /quizzes/create/something-we-don't-support
  if (!["basic", "crossword", "rapid"].includes(quizTypeParam)) {
    notFound();
  }

  let initialData: BasicInitial | CrosswordInitial | RapidInitial | undefined;
  let versions: number[] | undefined;
  let currentVersion: number | undefined;

  if (isClone && fromId) {
    const res = await getQuizForEdit(fromId, version);
    if (!res.ok) {
      // could also show a nicer error page; keeping it simple
      notFound();
    }

    initialData = res.data;
    versions = res.versions;
    currentVersion = res.currentVersion;

    // Safety: if the quiz type doesn’t match the URL segment, bail
    if (initialData.quizType !== quizTypeParam) {
      notFound();
    }
  }

  const isBasic = quizTypeParam === "basic";
  const isCrossword = quizTypeParam === "crossword";
  const isRapid = quizTypeParam === "rapid";

  const title = isClone
    ? `Duplicate ${
        isBasic ? "Basic" : isCrossword ? "Crossword" : "Rapid"
      } Quiz`
    : `Create ${isBasic ? "Basic" : isCrossword ? "Crossword" : "Rapid"} Quiz`;

  let Form: React.ReactNode;

  if (isBasic) {
    Form = (
      <BasicQuizForm
        meta={meta}
        mode="create"
        initialData={initialData as BasicInitial | undefined}
        versions={versions}
        currentVersion={currentVersion}
        isClone={isClone}
        typeColorHex={typeColors.basic}
      />
    );
  } else if (isCrossword) {
    Form = (
      <CrosswordQuizForm
        meta={meta}
        mode="create"
        initialData={initialData as CrosswordInitial | undefined}
        versions={versions}
        currentVersion={currentVersion}
        isClone={isClone}
        typeColorHex={typeColors.crossword}
      />
    );
  } else if (isRapid) {
    Form = (
      <RapidQuizForm
        meta={meta}
        mode="create"
        initialData={initialData as RapidInitial | undefined}
        versions={versions}
        currentVersion={currentVersion}
        isClone={isClone}
        typeColorHex={typeColors.rapid}
      />
    );
  }

  return (
    <div className="px-10 pt-6">
      <h1 className="mb-4 text-xl font-semibold text-[var(--color-text-primary)]">
        {title}
      </h1>
      {Form}
    </div>
  );
}
