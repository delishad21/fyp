"use client";

import BasicOrRapidQuizPreview from "@/components/quizzes/quiz-view/BasicOrRapidQuizPreview";
import CrosswordBankQuizPreview from "@/components/quizzes/quiz-view/CrosswordBankQuizPreview";
import CrosswordQuizPreview from "@/components/quizzes/quiz-view/CrosswordQuizPreview";
import RapidArithmeticQuizPreview from "@/components/quizzes/quiz-view/RapidArithmeticQuizPreview";
import {
  BasicInitial,
  CrosswordBankInitial,
  RapidInitial,
  CrosswordInitial,
  RapidArithmeticInitial,
  TrueFalseInitial,
} from "@/services/quiz/types/quizTypes";
import { useRouter } from "next/navigation";

type QuizViewClientProps = {
  quizId: string;
  quizType: string;
  data:
    | BasicInitial
    | RapidInitial
    | CrosswordInitial
    | TrueFalseInitial
    | RapidArithmeticInitial
    | CrosswordBankInitial;
  currentVersion: number;
};

export default function QuizViewClient({
  quizId,
  quizType,
  data,
  currentVersion,
}: QuizViewClientProps) {
  const router = useRouter();

  return (
    <div className="space-y-4">
      {/* Quiz content */}
      {quizType === "basic" ||
      quizType === "rapid" ||
      quizType === "true-false" ? (
        <BasicOrRapidQuizPreview
          data={data as BasicInitial | RapidInitial | TrueFalseInitial}
          showEditButtons={true}
          onEditQuestion={(questionIndex) => {
            const sp = new URLSearchParams();
            sp.set("question", String(questionIndex));
            if (currentVersion) sp.set("version", String(currentVersion));
            router.push(
              `/quizzes/edit/${encodeURIComponent(quizId)}?${sp.toString()}`,
            );
          }}
        />
      ) : quizType === "crossword-bank" ? (
        <CrosswordBankQuizPreview data={data as CrosswordBankInitial} />
      ) : quizType === "rapid-arithmetic" ? (
        <RapidArithmeticQuizPreview data={data as RapidArithmeticInitial} />
      ) : (
        <CrosswordQuizPreview data={data as CrosswordInitial} />
      )}
    </div>
  );
}
