"use client";

import { useEffect, useState } from "react";
import { Icon } from "@iconify/react";
import {
  listGenerationJobs,
  deleteGenerationJob,
  type GenerationJobStatus,
} from "@/services/ai-generation/ai-generation-actions";
import { useToast } from "@/components/ui/toast/ToastProvider";
import JobCard from "./components/JobCard";
import EmptyJobsState from "./components/EmptyJobsState";

export default function JobsSidebar() {
  const { showToast } = useToast();
  const [jobs, setJobs] = useState<GenerationJobStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingJobId, setDeletingJobId] = useState<string | null>(null);

  const loadJobs = async () => {
    setLoading(true);
    const result = await listGenerationJobs();
    if (result.ok) {
      setJobs(result.jobs);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadJobs();
  }, []);

  const handleDeleteJob = async (jobId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (
      !confirm(
        "Are you sure you want to delete this job? This cannot be undone.",
      )
    ) {
      return;
    }

    setDeletingJobId(jobId);
    const result = await deleteGenerationJob(jobId);

    if (result.ok) {
      showToast({
        title: "Job deleted",
        description: "Generation job has been deleted successfully",
        variant: "success",
      });
      await loadJobs(); // Reload jobs
    } else {
      showToast({
        title: "Delete failed",
        description: result.message || "Failed to delete job",
        variant: "error",
      });
    }
    setDeletingJobId(null);
  };

  const getPendingCount = (job: GenerationJobStatus) => {
    return job.results?.quizzes.filter((q) => q.status === "draft").length || 0;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "pending":
        return "text-yellow-500";
      case "processing":
        return "text-blue-500";
      case "completed":
        return "text-green-500";
      case "failed":
        return "text-red-500";
      default:
        return "text-[var(--color-text-tertiary)]";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "pending":
        return "mdi:clock-outline";
      case "processing":
        return "mdi:loading";
      case "completed":
        return "mdi:check-circle";
      case "failed":
        return "mdi:alert-circle";
      default:
        return "mdi:help-circle";
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Icon
          icon="mdi:loading"
          className="w-6 h-6 animate-spin text-[var(--color-accent)]"
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-[var(--color-text-primary)]">
          Previous Jobs
        </h3>
        <span className="text-sm text-[var(--color-text-tertiary)]">
          {jobs.length} total
        </span>
      </div>

      {jobs.length === 0 ? (
        <EmptyJobsState />
      ) : (
        <div className="space-y-2">
          {jobs.map((job) => (
            <JobCard
              key={job.id}
              job={job}
              pendingCount={getPendingCount(job)}
              onDelete={handleDeleteJob}
              deletingJobId={deletingJobId}
              getStatusIcon={getStatusIcon}
              getStatusColor={getStatusColor}
            />
          ))}
        </div>
      )}
    </div>
  );
}
