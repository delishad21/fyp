import BasicQuizForm from "@/components/quizzes/quiz-forms/BasicQuizForm";
import CrosswordBankQuizForm from "@/components/quizzes/quiz-forms/CrosswordBankQuizForm";
import CrosswordQuizForm from "@/components/quizzes/quiz-forms/CrosswordQuizForm";
import RapidArithmeticQuizForm from "@/components/quizzes/quiz-forms/RapidArithmeticQuizForm";
import RapidQuizForm from "@/components/quizzes/quiz-forms/RapidQuizForm";
import TrueFalseQuizForm from "@/components/quizzes/quiz-forms/TrueFalseQuizForm";
import { getFilterMeta } from "@/services/quiz/actions/quiz-metadata-actions";
import { getQuizTypeColors } from "@/services/quiz/actions/quiz-type-colors-action";
import { notFound } from "next/navigation";
import type {
  BasicInitial,
  CrosswordBankInitial,
  CrosswordInitial,
  RapidInitial,
  RapidArithmeticInitial,
  QuizType,
  TrueFalseInitial,
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
  const fromId = Array.isArray(fromParam) ? fromParam[0] : (fromParam ?? null);
  const version =
    typeof versionParam === "string" && versionParam !== ""
      ? Number(versionParam)
      : undefined;

  const isClone = Boolean(fromId);

  // If someone hits /quizzes/create/something-not supported
  if (
    ![
      "basic",
      "crossword",
      "rapid",
      "true-false",
      "rapid-arithmetic",
      "crossword-bank",
    ].includes(quizTypeParam)
  ) {
    notFound();
  }

  let initialData:
    | BasicInitial
    | CrosswordInitial
    | RapidInitial
    | TrueFalseInitial
    | RapidArithmeticInitial
    | CrosswordBankInitial
    | undefined;
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
  const isTrueFalse = quizTypeParam === "true-false";
  const isRapidArithmetic = quizTypeParam === "rapid-arithmetic";
  const isCrosswordBank = quizTypeParam === "crossword-bank";

  const title = isClone
    ? `Duplicate ${
        isBasic
          ? "Basic"
          : isCrossword
            ? "Crossword"
            : isRapid
              ? "Rapid"
              : isTrueFalse
                ? "True/False"
                : isRapidArithmetic
                  ? "Rapid Arithmetic"
                  : "Crossword Bank"
      } Quiz`
    : `Create ${
        isBasic
          ? "Basic"
          : isCrossword
            ? "Crossword"
            : isRapid
              ? "Rapid"
              : isTrueFalse
                ? "True/False"
                : isRapidArithmetic
                  ? "Rapid Arithmetic"
                  : "Crossword Bank"
      } Quiz`;

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
  } else if (isTrueFalse) {
    Form = (
      <TrueFalseQuizForm
        meta={meta}
        mode="create"
        initialData={initialData as TrueFalseInitial | undefined}
        versions={versions}
        currentVersion={currentVersion}
        isClone={isClone}
        typeColorHex={typeColors["true-false"]}
      />
    );
  } else if (isRapidArithmetic) {
    Form = (
      <RapidArithmeticQuizForm
        meta={meta}
        mode="create"
        initialData={initialData as RapidArithmeticInitial | undefined}
        versions={versions}
        currentVersion={currentVersion}
        isClone={isClone}
        typeColorHex={typeColors["rapid-arithmetic"]}
      />
    );
  } else if (isCrosswordBank) {
    Form = (
      <CrosswordBankQuizForm
        meta={meta}
        mode="create"
        initialData={initialData as CrosswordBankInitial | undefined}
        versions={versions}
        currentVersion={currentVersion}
        isClone={isClone}
        typeColorHex={typeColors["crossword-bank"]}
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
