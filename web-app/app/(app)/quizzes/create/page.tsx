import CreateQuizCard from "@/components/quizzes/CreateQuizCard";
import { QuizTypeDef } from "@/services/quiz/types/quizTypes";

export default async function Page() {
  const quizzes: QuizTypeDef[] = [
    {
      title: "Basic",
      id: "basic",
      description: [
        "Customize question type (multiple choice, open ended)",
        "Customise time limit",
      ],
      color: "#22c55e",
      href: "/quizzes/create/basic",
    },
    {
      title: "Crossword",
      id: "crossword",
      description: ["Key in up to 10 words and generate a crossword puzzle"],
      imagePath: "/images/quiz-crossword.png",
      color: "#3b82f6",
      href: "/quizzes/create/crossword",
    },
    {
      title: "Rapid",
      id: "rapid",
      description: ["Fast-paced multiple choice questions"],
      imagePath: "/images/quiz-rapid.png",
      color: "#f59e0b",
      href: "/quizzes/create/rapid",
    },
  ];

  return (
    <div className="space-y-4 px-10 pt-5">
      <h1 className="text-xl font-semibold text-[var(--color-text-primary)]">
        Select Quiz Type
      </h1>

      <div className="flex gap-10">
        {quizzes.map((quiz) => (
          <CreateQuizCard
            key={quiz.title}
            color={quiz.color}
            title={quiz.title}
            description={quiz.description}
            href={quiz.href}
            screenshot={quiz.imagePath}
            className="flex-1"
          />
        ))}
      </div>
    </div>
  );
}
