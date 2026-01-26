import { Icon } from "@iconify/react";

interface QuizProgress {
  tempId: string;
  quizNumber: number;
  status: "pending" | "generating" | "completed" | "failed";
  error?: string;
  retryCount: number;
}

interface ProcessingStateProps {
  progress: number;
  total: number;
  quizProgress: QuizProgress[];
}

export default function ProcessingState({
  progress,
  total,
  quizProgress,
}: ProcessingStateProps) {
  const getStatusIcon = (status: string) => {
    switch (status) {
      case "pending":
        return "mdi:clock-outline";
      case "generating":
        return "mdi:loading";
      case "completed":
        return "mdi:check-circle";
      case "failed":
        return "mdi:alert-circle";
      default:
        return "mdi:help-circle";
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "pending":
        return "text-yellow-500";
      case "generating":
        return "text-blue-500";
      case "completed":
        return "text-green-500";
      case "failed":
        return "text-red-500";
      default:
        return "text-gray-500";
    }
  };

  return (
    <div className="flex items-center justify-center min-h-[calc(100vh-120px)]">
      <div className="bg-[var(--color-bg-secondary)] rounded-lg p-8 text-center shadow-sm max-w-2xl w-full max-h-[calc(100vh-160px)] overflow-y-auto">
        <Icon
          icon="mdi:robot-excited"
          className="w-16 h-16 mx-auto mb-4 text-[var(--color-accent)] animate-bounce"
        />
        <h2 className="text-xl font-semibold text-[var(--color-text-primary)] mb-2">
          Generating Your Quizzes
        </h2>
        <p className="text-[var(--color-text-secondary)] mb-6">
          AI is analyzing your document and creating {total} quizzes
        </p>

        {/* Progress Bar */}
        <div className="mb-4">
          <div className="flex justify-between text-sm text-[var(--color-text-secondary)] mb-2">
            <span>Overall Progress</span>
            <span>
              {progress} / {total}
            </span>
          </div>
          <div className="w-full bg-[var(--color-bg-primary)] rounded-full h-3 overflow-hidden mb-2">
            <div
              className="bg-[var(--color-accent)] h-full transition-all duration-500 rounded-full"
              style={{
                width: `${total > 0 ? (progress / total) * 100 : 0}%`,
              }}
            />
          </div>
          <div className="relative pt-1">
            <div className="flex mb-2 items-center justify-between">
              <div>
                <span className="text-xs font-semibold inline-block py-1 px-2 uppercase rounded-full text-[var(--color-primary)] bg-[var(--color-primary)]/10">
                  {total > 0 ? Math.round((progress / total) * 100) : 0}%
                </span>
              </div>
            </div>
            <div className="overflow-hidden h-2 mb-4 text-xs flex rounded bg-[var(--color-bg-primary)] border border-[var(--color-bg4)]">
              <div
                style={{
                  width: `${total > 0 ? (progress / total) * 100 : 0}%`,
                }}
                className="shadow-none flex flex-col text-center whitespace-nowrap text-white justify-center bg-[var(--color-primary)] transition-all duration-500"
              ></div>
            </div>
          </div>
        </div>

        {/* Individual Quiz Progress */}
        {quizProgress.length > 0 && (
          <div className="mt-6 space-y-2">
            <div className="text-sm font-medium text-[var(--color-text-primary)] mb-3">
              Individual Quiz Status
            </div>
            <div className="grid grid-cols-1 gap-2 max-h-64 overflow-y-auto">
              {quizProgress.map((quiz) => (
                <div
                  key={quiz.tempId}
                  className={`p-3 rounded-lg border ${
                    quiz.status === "completed"
                      ? "bg-green-500/5 border-green-500/20"
                      : quiz.status === "failed"
                        ? "bg-red-500/5 border-red-500/20"
                        : quiz.status === "generating"
                          ? "bg-blue-500/5 border-blue-500/20"
                          : "bg-[var(--color-bg-primary)] border-[var(--color-bg4)]"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Icon
                        icon={getStatusIcon(quiz.status)}
                        className={`w-4 h-4 ${getStatusColor(quiz.status)} ${
                          quiz.status === "generating" ? "animate-spin" : ""
                        }`}
                      />
                      <span className="text-sm font-medium text-[var(--color-text-primary)]">
                        Quiz {quiz.quizNumber}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {quiz.retryCount > 0 && (
                        <span className="text-xs text-[var(--color-text-secondary)]">
                          Retry {quiz.retryCount}
                        </span>
                      )}
                      <span
                        className={`text-xs font-medium capitalize ${getStatusColor(quiz.status)}`}
                      >
                        {quiz.status}
                      </span>
                    </div>
                  </div>
                  {quiz.error && (
                    <p className="text-xs text-red-500 mt-1">{quiz.error}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <p className="text-sm text-[var(--color-text-secondary)] mt-6">
          This usually takes 2-5 minutes. you can leave this page and come back
          later to review the quizzes through the AI generation page.
        </p>
      </div>
    </div>
  );
}
