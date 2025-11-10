export type QuizSvcBatchRow = {
  _id: string;
  owner?: string;
  quizType: string;
  name: string;
  subject: string;
  subjectColorHex?: string;
  topic?: string;
  typeColorHex?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type QuizSvcBatchResponse = {
  ok: true;
  data: {
    byId: Record<string, QuizSvcBatchRow>;
    missing: string[]; // deleted OR forbidden
  };
  partial?: boolean;
  invalid?: string[]; // invalid ObjectIds (server may include this)
};

/** Normalize any token to a proper "Bearer ..." header value (or empty if missing). */
function normalizeBearer(token?: string) {
  const t = (token ?? "").trim();
  if (!t) return "";
  return t.toLowerCase().startsWith("bearer ") ? t : `Bearer ${t}`;
}

/**
 * Batch-fetch quizzes by IDs from Quiz Service (INTERNAL, shared-secret).
 * - POST { ids: string[] } to /quiz/internal/batch in chunks (default 100).
 * - Dedupes request IDs, merges `byId`, and treats `invalid` as `missing`.
 * - Throws on non-2xx with an attached `status` and `body` (if JSON).
 *
 * @param quizIds Array of quiz ids (strings/anything stringable).
 * @param opts    chunkSize?: number (default 100)
 *
 * @returns { byId, missing }
 */
export async function fetchQuizzesByIds(
  quizIds: string[],
  opts: { chunkSize?: number } = {}
): Promise<{ byId: Record<string, QuizSvcBatchRow>; missing: string[] }> {
  // 1) Build base URL
  const base = String(process.env.QUIZ_SVC_URL || "").replace(/\/+$/, "");
  if (!base) throw new Error("QUIZ_SVC_URL env var is required");

  // 1a) Shared secret (same env var you used elsewhere)
  const secret = process.env.QUIZ_WEBHOOK_SECRET;
  if (!secret) throw new Error("QUIZ_WEBHOOK_SECRET not set");

  // 2) Canonicalize and short-circuit empty
  const uniqueIds = Array.from(new Set((quizIds || []).map(String))).filter(
    Boolean
  );
  if (uniqueIds.length === 0) return { byId: {}, missing: [] };

  // 3) Chunking
  const chunkSize = Math.max(1, opts.chunkSize ?? 100);
  const chunks: string[][] = [];
  for (let i = 0; i < uniqueIds.length; i += chunkSize) {
    chunks.push(uniqueIds.slice(i, i + chunkSize));
  }

  const aggregateById: Record<string, QuizSvcBatchRow> = {};
  const aggregateMissing = new Set<string>();

  // 4) Fetch each chunk and merge results
  for (const ids of chunks) {
    // NOTE: internal path + shared-secret header
    const url = `${base}/quiz/internal/batch`;

    const res = await fetch(url, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "x-quiz-secret": secret,
      },
      body: JSON.stringify({ ids }),
    });

    const ct = res.headers.get("content-type") || "";
    const isJson = ct.includes("application/json");
    const body = isJson ? await res.json().catch(() => null) : await res.text();

    // 4a) Surface non-2xx with details
    if (!res.ok) {
      const msg =
        (isJson && body && typeof body === "object" && body.message) ||
        `Quiz Service error: ${res.status}`;
      const err: any = new Error(msg);
      err.status = res.status;
      err.body = body;
      throw err;
    }

    // 4b) Runtime shape check
    const payload = body as QuizSvcBatchResponse | null;
    const data = payload?.data;
    if (!data || typeof data !== "object" || !data.byId || !data.missing) {
      throw new Error("Quiz Service returned unexpected payload shape");
    }

    // 4c) Merge byId
    for (const [k, v] of Object.entries(data.byId)) {
      aggregateById[String(k)] = v as QuizSvcBatchRow;
    }

    // 4d) Merge missing + invalid (treat invalid as missing)
    for (const m of data.missing) aggregateMissing.add(String(m));
    if (Array.isArray(payload?.invalid)) {
      for (const inv of payload!.invalid!) aggregateMissing.add(String(inv));
    }
  }

  // 5) Any ID present in byId must not be marked missing
  for (const id of Object.keys(aggregateById)) {
    aggregateMissing.delete(id);
  }

  return {
    byId: aggregateById,
    missing: Array.from(aggregateMissing),
  };
}

/**
 * Merge schedule rows (that only have `quizId`) with quiz metadata when available.
 * - Leaves originals intact if quiz is missing.
 * - Adds both `subjectColorHex` and `subjectColor` (for callers expecting either).
 */
export function mergeScheduleWithQuizzes<T extends { quizId: string }>(
  schedule: T[],
  quizzesById: Record<string, QuizSvcBatchRow>
): (T & {
  quizName?: string;
  subject?: string;
  subjectColorHex?: string;
  topic?: string;
  /** Back-compat with code that expects `subjectColor` in the schedule. */
  subjectColor?: string;
})[] {
  return (schedule || []).map((s) => {
    const q = quizzesById[s.quizId];
    if (!q) return s;

    const mergedColorHex = q.subjectColorHex ?? (s as any).subjectColorHex;
    return {
      ...s,
      quizName: q.name ?? (s as any).quizName,
      subject: q.subject ?? (s as any).subject,
      subjectColorHex: mergedColorHex,
      // Back-compat: mirror to `subjectColor` if callers read that
      subjectColor: mergedColorHex ?? (s as any).subjectColor,
      topic: q.topic ?? (s as any).topic,
    };
  });
}

export type QuizSvcMetaSubject = { label: string; colorHex?: string | null };
export type QuizSvcMetaResponse = {
  ok: true;
  subjects: QuizSvcMetaSubject[];
  topics: { label: string }[];
  types: { label: string; value: string; colorHex?: string | null }[];
};

export async function fetchMyQuizMeta(auth: string): Promise<{
  subjects: Record<string, string>; // subject -> #hex
}> {
  const base = String(process.env.QUIZ_SVC_URL || "").replace(/\/+$/, "");
  if (!base) throw new Error("QUIZ_SVC_URL env var is required");

  const authHeader = normalizeBearer(auth);
  const url = `${base}/quiz/meta`;

  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        ...(authHeader ? { Authorization: authHeader } : {}),
      },
    });

    const isJson = (res.headers.get("content-type") || "").includes(
      "application/json"
    );
    const body = (
      isJson ? await res.json().catch(() => null) : null
    ) as QuizSvcMetaResponse | null;

    if (!res.ok || !body?.ok) {
      // Soft-fail: return empty map so callers can fallback
      return { subjects: {} };
    }

    const subjects: Record<string, string> = {};
    for (const s of body.subjects || []) {
      const label = (s.label || "").trim();
      const hex = (s.colorHex || "").trim();
      if (!label || !hex) continue;
      subjects[label] = hex.startsWith("#") ? hex : `#${hex}`;
    }
    return { subjects };
  } catch {
    // Soft-fail
    return { subjects: {} };
  }
}

/**
 * Fetch class-level scheduled quiz stats from Quiz Service (internal S2S call).
 *
 * @param payload { scheduleId, attemptIds, classId, quizId, openAnswerMinPct? }
 * @returns Parsed JSON { ok, data } from quiz-svc
 * @throws Error with `status` if non-2xx or invalid JSON
 */
export async function fetchScheduledQuizStats(payload: {
  scheduleId: string;
  attemptIds: string[];
  classId: string;
  quizId: string;
  openAnswerMinPct?: number;
}): Promise<{ ok: boolean; data?: any }> {
  const base = String(process.env.QUIZ_SVC_URL || "").replace(/\/+$/, "");
  if (!base) throw new Error("QUIZ_SVC_URL env var is required");

  const secret = process.env.QUIZ_WEBHOOK_SECRET;
  if (!secret) throw new Error("QUIZ_WEBHOOK_SECRET not set");

  const url = `${base}/attempt/internal/scheduled-quiz-stats`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-quiz-secret": secret,
    },
    body: JSON.stringify(payload),
  });

  const isJson = (res.headers.get("content-type") || "").includes(
    "application/json"
  );
  const body = isJson ? await res.json().catch(() => null) : null;

  if (!res.ok) {
    const err: any = new Error(
      (body && body.message) ||
        `Quiz Service error: ${res.status} ${res.statusText}`
    );
    err.status = res.status >= 400 && res.status < 600 ? res.status : 502;
    err.body = body;
    throw err;
  }

  return body ?? { ok: true };
}

/** Attempt row shape returned by quiz-svc list endpoints. */
export type QuizSvcAttemptRow = {
  _id: string;
  scheduleId: string;
  quizId: string;
  studentId: string;
  classId: string;
  state: "in_progress" | "finalized" | "invalidated";
  startedAt?: string;
  lastSavedAt?: string;
  finishedAt?: string;
  createdAt?: string;
  updatedAt?: string;
  attemptVersion: number;
  score?: number;
  maxScore?: number;
  quiz: {
    quizId: string;
    name?: string | null;
    subject?: string | null;
    subjectColorHex?: string | null;
    topic?: string | null;
    quizType?: string | null;
    typeColorHex?: string | undefined;
    contentHash?: string | null;
  };
};

/** Shared response shapes */
type OkRows = { ok: true; rows: QuizSvcAttemptRow[] };
type OkRowsWithMeta = OkRows & { total: number; truncated: boolean };

/**
 * INTERNAL (S2S): Fetch all attempts for a student (no pagination).
 * Delegates to quiz-svc: POST /attempt/internal/student
 * Uses `x-quiz-secret` header with QUIZ_WEBHOOK_SECRET.
 *
 * @param studentId ObjectId string
 * @returns { ok, rows, total, truncated }
 * @throws Error with `status` on non-2xx, `body` when JSON is present
 */
export async function fetchStudentAttemptsInternal(
  studentId: string
): Promise<OkRowsWithMeta> {
  const base = String(process.env.QUIZ_SVC_URL || "").replace(/\/+$/, "");
  if (!base) throw new Error("QUIZ_SVC_URL env var is required");

  const secret = process.env.QUIZ_WEBHOOK_SECRET;
  if (!secret) throw new Error("QUIZ_WEBHOOK_SECRET not set");

  const url = `${base}/attempt/internal/student`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "x-quiz-secret": secret,
    },
    body: JSON.stringify({ studentId }),
  });

  const ct = res.headers.get("content-type") || "";
  const isJson = ct.includes("application/json");
  const body = isJson ? await res.json().catch(() => null) : await res.text();

  if (!res.ok) {
    const err: any = new Error(
      (isJson && body && typeof body === "object" && body.message) ||
        `Quiz Service error: ${res.status}`
    );
    err.status = res.status >= 400 && res.status < 600 ? res.status : 502;
    err.body = body;
    throw err;
  }

  const payload = (isJson ? body : null) as OkRowsWithMeta | null;
  if (
    !payload ||
    payload.ok !== true ||
    !Array.isArray(payload.rows) ||
    typeof payload.total !== "number" ||
    typeof payload.truncated !== "boolean"
  ) {
    throw new Error("Quiz Service returned unexpected payload shape");
  }
  return payload;
}

/** INTERNAL (S2S): Fetch attempts for a student within a schedule.
 *  Delegates to quiz-svc: POST /attempt/internal/schedule-student
 *  Uses `x-quiz-secret` header with QUIZ_WEBHOOK_SECRET.
 *
 *  @param scheduleId ObjectId string
 *  @param studentId  ObjectId string
 *  @returns { ok, rows }
 *  @throws Error with `status` on non-2xx, `body` when JSON is present
 */
export async function fetchAttemptsForScheduleByStudentInternal(
  scheduleId: string,
  studentId: string
): Promise<OkRows> {
  const base = String(process.env.QUIZ_SVC_URL || "").replace(/\/+$/, "");
  if (!base) throw new Error("QUIZ_SVC_URL env var is required");

  const secret = process.env.QUIZ_WEBHOOK_SECRET;
  if (!secret) throw new Error("QUIZ_WEBHOOK_SECRET not set");

  const url = `${base}/attempt/internal/schedule-student`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "x-quiz-secret": secret,
    },
    body: JSON.stringify({ scheduleId, studentId }),
  });

  const ct = res.headers.get("content-type") || "";
  const isJson = ct.includes("application/json");
  const body = isJson ? await res.json().catch(() => null) : await res.text();

  if (!res.ok) {
    const err: any = new Error(
      (isJson && body && typeof body === "object" && body.message) ||
        `Quiz Service error: ${res.status}`
    );
    err.status = res.status >= 400 && res.status < 600 ? res.status : 502;
    err.body = body;
    throw err;
  }

  const payload = (isJson ? body : null) as OkRows | null;
  if (!payload || payload.ok !== true || !Array.isArray(payload.rows)) {
    throw new Error("Quiz Service returned unexpected payload shape");
  }
  return payload;
}
