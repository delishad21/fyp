"use client";

import BasicOrRapidQuizPreview from "@/components/quizzes/quiz-view/BasicOrRapidQuizPreview";
import CrosswordQuizPreview from "@/components/quizzes/quiz-view/CrosswordQuizPreview";
import {
  BasicInitial,
  RapidInitial,
  CrosswordInitial,
} from "@/services/quiz/types/quizTypes";
import { useRouter } from "next/navigation";

type QuizViewClientProps = {
  quizId: string;
  quizType: string;
  data: BasicInitial | RapidInitial | CrosswordInitial;
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
      {quizType === "basic" || quizType === "rapid" ? (
        <BasicOrRapidQuizPreview
          data={data as BasicInitial | RapidInitial}
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
      ) : (
        <CrosswordQuizPreview data={data as CrosswordInitial} />
      )}
    </div>
  );
}
