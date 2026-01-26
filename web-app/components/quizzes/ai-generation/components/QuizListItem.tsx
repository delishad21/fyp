import { Icon } from "@iconify/react";
import type { DraftQuiz } from "@/services/ai-generation/ai-generation-actions";

interface QuizListItemProps {
  quiz: DraftQuiz;
  index: number;
  isSelected: boolean;
  isViewing: boolean;
  onToggleSelect: (quizId: string) => void;
  onView: (quizId: string) => void;
}

export default function QuizListItem({
  quiz,
  index,
  isSelected,
  isViewing,
  onToggleSelect,
  onView,
}: QuizListItemProps) {
  const getQuizTypeLabel = (type: string) => {
    switch (type) {
      case "basic":
        return "Basic Quiz";
      case "rapid":
        return "Rapid Fire";
      case "crossword":
        return "Crossword";
      default:
        return "Quiz";
    }
  };

  const getQuizTypeBadgeColor = (type: string) => {
    switch (type) {
      case "basic":
        return "bg-blue-500/10 text-blue-500 border-blue-500/20";
      case "rapid":
        return "bg-yellow-500/10 text-yellow-500 border-yellow-500/20";
      case "crossword":
        return "bg-purple-500/10 text-purple-500 border-purple-500/20";
      default:
        return "bg-gray-500/10 text-gray-500 border-gray-500/20";
    }
  };

  return (
    <div
      onClick={() => onView(quiz.tempId)}
      className={`bg-[var(--color-bg2)] rounded-xl p-4 border transition-all cursor-pointer ${
        isViewing
          ? "border-[var(--color-primary)] shadow-md"
          : "border-[var(--color-bg4)] hover:border-[var(--color-primary)]/30 hover:shadow-sm"
      }`}
      style={isViewing ? { boxShadow: "var(--drop-shadow-sm)" } : {}}
    >
      {/* Selection Checkbox */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3 flex-1">
          <input
            type="checkbox"
            checked={isSelected}
            onChange={(e) => {
              e.stopPropagation();
              onToggleSelect(quiz.tempId);
            }}
            className="w-4 h-4 rounded border-2 border-[var(--color-bg4)] text-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20 cursor-pointer"
          />
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-[var(--color-text-secondary)]">
              Quiz #{index + 1}
            </span>
            <span
              className={`text-xs px-2 py-0.5 rounded border font-medium ${getQuizTypeBadgeColor(quiz.quizType)}`}
            >
              {getQuizTypeLabel(quiz.quizType)}
            </span>
          </div>
        </div>
      </div>

      {/* Quiz Info */}
      <div>
        <h3 className="font-semibold text-[var(--color-text-primary)] mb-2 line-clamp-2 text-sm">
          {quiz.name}
        </h3>

        <div className="space-y-1.5 text-xs">
          <div className="flex items-center gap-2 text-[var(--color-text-secondary)]">
            <Icon icon="mdi:book-open-variant" className="w-3.5 h-3.5" />
            <span className="truncate">{quiz.subject}</span>
          </div>
          <div className="flex items-center gap-2 text-[var(--color-text-secondary)]">
            <Icon icon="mdi:tag" className="w-3.5 h-3.5" />
            <span className="truncate">{quiz.topic}</span>
          </div>
          {quiz.quizType !== "crossword" && (
            <div className="flex items-center gap-2 text-[var(--color-text-secondary)]">
              <Icon icon="mdi:file-document-multiple" className="w-3.5 h-3.5" />
              <span>
                {quiz.items?.length || 0} question
                {quiz.items?.length !== 1 ? "s" : ""}
              </span>
            </div>
          )}
          {quiz.quizType === "crossword" && (
            <div className="flex items-center gap-2 text-[var(--color-text-secondary)]">
              <Icon icon="mdi:grid" className="w-3.5 h-3.5" />
              <span>
                {quiz.entries?.length || 0} entr
                {quiz.entries?.length !== 1 ? "ies" : "y"}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
