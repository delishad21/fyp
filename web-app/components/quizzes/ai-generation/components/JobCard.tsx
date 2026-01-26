import { Icon } from "@iconify/react";
import Link from "next/link";

interface JobCardProps {
  job: {
    id: string;
    status: string;
    config: {
      subject?: string;
      topic?: string;
      numQuizzes: number;
    };
    results?: {
      total?: number;
      quizzes: Array<{ status: string }>;
    };
    progress: {
      current: number;
      total: number;
    };
    createdAt: string;
  };
  pendingCount: number;
  onDelete: (jobId: string, e: React.MouseEvent) => void;
  deletingJobId: string | null;
  getStatusIcon: (status: string) => string;
  getStatusColor: (status: string) => string;
}

export default function JobCard({
  job,
  pendingCount,
  onDelete,
  deletingJobId,
  getStatusIcon,
  getStatusColor,
}: JobCardProps) {
  const hasPending = pendingCount > 0;

  return (
    <Link
      href={
        job.status === "completed"
          ? `/quizzes/ai-generate/review/${job.id}`
          : "#"
      }
      className={`block p-4 bg-[var(--color-bg2)] rounded-lg transition ${
        job.status === "completed"
          ? "hover:ring-2 ring-[var(--color-accent)] cursor-pointer"
          : "opacity-60 cursor-not-allowed"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          {/* Status indicator */}
          <div className="flex items-center gap-2 mb-2">
            <Icon
              icon={getStatusIcon(job.status)}
              className={`w-4 h-4 ${getStatusColor(job.status)} ${
                job.status === "processing" ? "animate-spin" : ""
              }`}
            />
            <span className="text-xs font-medium capitalize text-[var(--color-text-secondary)]">
              {job.status}
            </span>
            {hasPending && (
              <span className="inline-flex items-center px-2 py-0.5 bg-[var(--color-accent)] text-white text-xs font-medium rounded-full">
                {pendingCount}
              </span>
            )}
          </div>

          {/* Job info */}
          <h4 className="text-sm font-medium text-[var(--color-text-primary)] truncate mb-1">
            {job.config.subject || "General"} - {job.config.topic || "Quiz"}
          </h4>

          <div className="flex items-center gap-2 text-xs text-[var(--color-text-tertiary)]">
            <Icon icon="mdi:file-document-multiple" className="w-3 h-3" />
            <span>{job.results?.total || job.config.numQuizzes} quizzes</span>
          </div>

          <div className="text-xs text-[var(--color-text-tertiary)] mt-1">
            {new Date(job.createdAt).toLocaleDateString()}
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-1">
          {job.status === "completed" && !hasPending && (
            <button
              onClick={(e) => onDelete(job.id, e)}
              disabled={deletingJobId === job.id}
              className="p-1 hover:bg-red-500/10 rounded transition"
              title="Delete job"
            >
              {deletingJobId === job.id ? (
                <Icon
                  icon="mdi:loading"
                  className="w-4 h-4 text-red-500 animate-spin"
                />
              ) : (
                <Icon icon="mdi:delete" className="w-4 h-4 text-red-500" />
              )}
            </button>
          )}
        </div>
      </div>

      {/* Progress bar for processing jobs */}
      {job.status === "processing" && (
        <div className="mt-3">
          <div className="w-full bg-[var(--color-bg3)] rounded-full h-1.5">
            <div
              className="bg-[var(--color-accent)] h-1.5 rounded-full transition-all"
              style={{
                width: `${(job.progress.current / job.progress.total) * 100}%`,
              }}
            />
          </div>
          <p className="text-xs text-[var(--color-text-tertiary)] mt-1">
            {job.progress.current} / {job.progress.total} completed
          </p>
        </div>
      )}
    </Link>
  );
}
