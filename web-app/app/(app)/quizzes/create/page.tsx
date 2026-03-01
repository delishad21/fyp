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
    {
      title: "True / False",
      id: "true-false",
      description: ["Rapid-format quiz with only True and False responses"],
      color: "#ef4444",
      href: "/quizzes/create/true-false",
    },
    {
      title: "Rapid Arithmetic",
      id: "rapid-arithmetic",
      description: [
        "Configure operators and number range; each schedule gets randomized MC arithmetic questions",
      ],
      color: "#eab308",
      href: "/quizzes/create/rapid-arithmetic",
    },
    {
      title: "Crossword Bank",
      id: "crossword-bank",
      description: [
        "Build a word bank and generate a fresh crossword subset for each schedule",
      ],
      color: "#0ea5e9",
      href: "/quizzes/create/crossword-bank",
    },
  ];

  return (
    <div className="space-y-4 px-10 pt-5">
      <h1 className="text-xl font-semibold text-[var(--color-text-primary)]">
        Select Quiz Type
      </h1>

      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {quizzes.map((quiz) => (
          <CreateQuizCard
            key={quiz.title}
            color={quiz.color}
            title={quiz.title}
            description={quiz.description}
            href={quiz.href}
            screenshot={quiz.imagePath}
            className="h-full"
          />
        ))}
      </div>
    </div>
  );
}
