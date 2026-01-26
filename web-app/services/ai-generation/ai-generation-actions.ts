"use server";

import { getAuthHeader } from "@/services/user/session-definitions";

const AI_SERVICE_URL = process.env.AI_SVC_URL || "http://localhost:7304";

export interface GenerationConfig {
  numQuizzes: number;
  quizType: "basic" | "rapid" | "crossword" | "mixed";
  questionsPerQuiz: number;
  difficulty: "easy" | "medium" | "hard" | "mixed";
  questionTypes?: ("mc" | "open" | "context")[];
  additionalPrompt?: string;
  subject?: string;
  topic?: string;
  timerSettings?: {
    type: "default" | "custom" | "none";
    defaultSeconds?: number;
  };
}

export interface GenerationJobStatus {
  id: string;
  status: "pending" | "processing" | "completed" | "failed";
  progress: {
    current: number;
    total: number;
  };
  config: GenerationConfig;
  results?: {
    total: number;
    successful: number;
    failed: number;
    quizzes: DraftQuiz[];
  };
  error?: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
}

export interface DraftQuiz {
  tempId: string;
  quizType: "basic" | "rapid" | "crossword";
  name: string;
  subject: string;
  topic: string;
  items: any[];
  entries?: any[]; // For crossword quizzes
  grid?: any[][]; // For crossword quizzes
  placedEntries?: any[]; // For crossword quizzes
  totalTimeLimit?: number | null;
  status: "draft" | "approved" | "rejected";
  savedQuizId?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Start a new quiz generation job
 */
export async function startGeneration(
  formData: FormData,
): Promise<{ ok: boolean; jobId?: string; message?: string }> {
  try {
    const authHeader = await getAuthHeader();
    if (!authHeader) {
      return { ok: false, message: "Not authenticated" };
    }

    const response = await fetch(`${AI_SERVICE_URL}/`, {
      method: "POST",
      headers: {
        Authorization: authHeader,
      },
      body: formData,
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        ok: false,
        message: data.message || "Failed to start generation",
      };
    }

    return {
      ok: true,
      jobId: data.jobId,
      message: data.message,
    };
  } catch (error) {
    console.error("Start generation error:", error);
    return {
      ok: false,
      message: "An error occurred while starting generation",
    };
  }
}

/**
 * Get generation job status
 */
export async function getGenerationStatus(
  jobId: string,
): Promise<{ ok: boolean; job?: GenerationJobStatus; message?: string }> {
  try {
    const authHeader = await getAuthHeader();
    if (!authHeader) {
      return { ok: false, message: "Not authenticated" };
    }

    const response = await fetch(`${AI_SERVICE_URL}/${jobId}/`, {
      method: "GET",
      headers: {
        Authorization: authHeader,
      },
      cache: "no-store",
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        ok: false,
        message: data.message || "Failed to get generation status",
      };
    }

    return {
      ok: true,
      job: data.job,
    };
  } catch (error) {
    console.error("Get generation status error:", error);
    return {
      ok: false,
      message: "An error occurred while fetching generation status",
    };
  }
}

/**
 * Get all generation jobs
 */
export async function getGenerationJobs(options?: {
  limit?: number;
  skip?: number;
}): Promise<{
  ok: boolean;
  jobs?: GenerationJobStatus[];
  pagination?: any;
  message?: string;
}> {
  try {
    const authHeader = await getAuthHeader();
    if (!authHeader) {
      return { ok: false, message: "Not authenticated" };
    }

    const params = new URLSearchParams();
    if (options?.limit) params.set("limit", String(options.limit));
    if (options?.skip) params.set("skip", String(options.skip));

    const url = `${AI_SERVICE_URL}/jobs${
      params.toString() ? `?${params.toString()}` : ""
    }`;

    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: authHeader,
      },
      cache: "no-store",
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        ok: false,
        message: data.message || "Failed to get generation jobs",
      };
    }

    return {
      ok: true,
      jobs: data.jobs,
      pagination: data.pagination,
    };
  } catch (error) {
    console.error("Get generation jobs error:", error);
    return {
      ok: false,
      message: "An error occurred while fetching generation jobs",
    };
  }
}

/**
 * Update a draft quiz
 */
export async function updateDraftQuiz(
  jobId: string,
  tempId: string,
  updates: Partial<DraftQuiz>,
): Promise<{ ok: boolean; quiz?: DraftQuiz; message?: string }> {
  try {
    const authHeader = await getAuthHeader();
    if (!authHeader) {
      return { ok: false, message: "Not authenticated" };
    }

    const response = await fetch(
      `${AI_SERVICE_URL}/${jobId}/quizzes/${tempId}/`,
      {
        method: "PATCH",
        headers: {
          Authorization: authHeader,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(updates),
      },
    );

    const data = await response.json();

    if (!response.ok) {
      return {
        ok: false,
        message: data.message || "Failed to update draft quiz",
      };
    }

    return {
      ok: true,
      quiz: data.quiz,
    };
  } catch (error) {
    console.error("Update draft quiz error:", error);
    return {
      ok: false,
      message: "An error occurred while updating draft quiz",
    };
  }
}

/**
 * Approve and save selected quizzes
 */
export async function approveQuizzes(
  jobId: string,
  quizIds: string[],
): Promise<{
  ok: boolean;
  savedQuizIds?: string[];
  errors?: any[];
  message?: string;
}> {
  try {
    const authHeader = await getAuthHeader();
    if (!authHeader) {
      return { ok: false, message: "Not authenticated" };
    }

    const response = await fetch(`${AI_SERVICE_URL}/${jobId}/approve/`, {
      method: "POST",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ quizIds }),
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        ok: false,
        message: data.message || "Failed to approve quizzes",
      };
    }

    return {
      ok: true,
      savedQuizIds: data.savedQuizIds,
      errors: data.errors,
      message: data.message,
    };
  } catch (error) {
    console.error("Approve quizzes error:", error);
    return {
      ok: false,
      message: "An error occurred while approving quizzes",
    };
  }
}

/**
 * Delete a generation job
 */
export async function deleteGenerationJob(
  jobId: string,
): Promise<{ ok: boolean; message?: string }> {
  try {
    const authHeader = await getAuthHeader();
    if (!authHeader) {
      return { ok: false, message: "Not authenticated" };
    }

    const response = await fetch(`${AI_SERVICE_URL}/${jobId}/`, {
      method: "DELETE",
      headers: {
        Authorization: authHeader,
      },
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        ok: false,
        message: data.message || "Failed to delete generation job",
      };
    }

    return {
      ok: true,
      message: data.message,
    };
  } catch (error) {
    console.error("Delete generation job error:", error);
    return {
      ok: false,
      message: "An error occurred while deleting generation job",
    };
  }
}

/**
 * Get count of pending jobs (jobs with draft quizzes)
 */
export async function getPendingJobsCount(): Promise<{
  ok: boolean;
  count: number;
}> {
  try {
    const authHeader = await getAuthHeader();
    if (!authHeader) {
      return { ok: false, count: 0 };
    }

    const response = await fetch(`${AI_SERVICE_URL}/jobs/pending/`, {
      method: "GET",
      headers: {
        Authorization: authHeader,
      },
      cache: "no-store",
    });

    if (!response.ok) {
      return { ok: false, count: 0 };
    }

    const data = await response.json();
    return { ok: true, count: data.count || 0 };
  } catch (error) {
    console.error("Get pending jobs count error:", error);
    return { ok: false, count: 0 };
  }
}

/**
 * List all generation jobs
 */
export async function listGenerationJobs(): Promise<{
  ok: boolean;
  jobs: GenerationJobStatus[];
  message?: string;
}> {
  try {
    const authHeader = await getAuthHeader();
    if (!authHeader) {
      return { ok: false, jobs: [], message: "Not authenticated" };
    }

    const response = await fetch(`${AI_SERVICE_URL}/jobs/`, {
      method: "GET",
      headers: {
        Authorization: authHeader,
      },
      cache: "no-store",
    });

    if (!response.ok) {
      const data = await response.json();
      return { ok: false, jobs: [], message: data.message };
    }

    const data = await response.json();
    return { ok: true, jobs: data.jobs || [] };
  } catch (error) {
    console.error("List generation jobs error:", error);
    return { ok: false, jobs: [], message: "An error occurred" };
  }
}

/**
 * Cleanup old completed jobs (30+ days, all approved/rejected)
 */
export async function cleanupOldJobs(): Promise<{
  ok: boolean;
  deleted: number;
  message?: string;
}> {
  try {
    const authHeader = await getAuthHeader();
    if (!authHeader) {
      return { ok: false, deleted: 0, message: "Not authenticated" };
    }

    const response = await fetch(`${AI_SERVICE_URL}/cleanup/`, {
      method: "DELETE",
      headers: {
        Authorization: authHeader,
      },
    });

    if (!response.ok) {
      const data = await response.json();
      return {
        ok: false,
        deleted: 0,
        message: data.message || "Failed to cleanup old jobs",
      };
    }

    const data = await response.json();
    return {
      ok: true,
      deleted: data.deleted || 0,
      message: data.message,
    };
  } catch (error) {
    console.error("Cleanup old jobs error:", error);
    return { ok: false, deleted: 0, message: "An error occurred" };
  }
}
