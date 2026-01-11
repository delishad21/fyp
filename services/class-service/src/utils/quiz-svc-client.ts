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
  rootQuizId?: string;
  version?: number;
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

export type QuizSvcVersionsResponse = {
  ok: true;
  data: {
    rootQuizId: string;
    versions: QuizSvcBatchRow[];
  };
};

/**
 * INTERNAL (S2S): Fetch all versions for a quiz family by rootQuizId.
 * Delegates to quiz-svc: POST /quiz/internal/versions
 * Uses `x-quiz-secret` header with QUIZ_WEBHOOK_SECRET.
 *
 * @param rootQuizId ObjectId string for the quiz "family" (rootQuizId)
 * @returns { rootQuizId, versions[] }
 * @throws Error with `status` on non-2xx, `body` when JSON is present
 */
export async function fetchQuizVersionsForRoot(
  rootQuizId: string
): Promise<{ rootQuizId: string; versions: QuizSvcBatchRow[] }> {
  const base = String(process.env.QUIZ_SVC_URL || "").replace(/\/+$/, "");
  if (!base) throw new Error("QUIZ_SVC_URL env var is required");

  const secret = process.env.QUIZ_WEBHOOK_SECRET;
  if (!secret) throw new Error("QUIZ_WEBHOOK_SECRET not set");

  const url = `${base}/quiz/internal/versions`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "x-quiz-secret": secret,
    },
    body: JSON.stringify({ rootQuizId }),
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

  const payload = (isJson ? body : null) as QuizSvcVersionsResponse | null;
  if (
    !payload ||
    payload.ok !== true ||
    !payload.data ||
    !Array.isArray(payload.data.versions)
  ) {
    throw new Error("Quiz Service returned unexpected payload shape");
  }

  return {
    rootQuizId: payload.data.rootQuizId,
    versions: payload.data.versions,
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

// quiz-svc-client.ts (add below fetchQuizVersionsForRoot)

export type QuizCanonicalSelector = {
  rootQuizId: string;
  version: number;
};

export type QuizSvcCanonicalBatchResponse = {
  ok: true;
  data: {
    // key is `${rootQuizId}:${version}`
    byKey: Record<string, QuizSvcBatchRow>;
    missing: QuizCanonicalSelector[];
  };
  partial?: boolean;
  invalid?: QuizCanonicalSelector[];
};

const CANONICAL_SEP = ":";

function canonicalKey(rootQuizId: string, version: number) {
  return `${rootQuizId}${CANONICAL_SEP}${version}`;
}

/**
 * INTERNAL (S2S): Fetch quiz metadata by canonical identity (rootQuizId + version)
 * via quiz-svc: POST /quiz/internal/canonical-batch
 *
 * Uses `x-quiz-secret` header with QUIZ_WEBHOOK_SECRET.
 *
 * Returns:
 *   - `byCanonical` keyed as `${rootQuizId}:${version}`
 *   - `byId` keyed by concrete quiz `_id`
 *   - `missing` list of canonical keys that could not be resolved
 */
export async function fetchQuizzesByCanonical(
  selectors: QuizCanonicalSelector[],
  opts: { chunkSize?: number } = {}
): Promise<{
  byCanonical: Record<string, QuizSvcBatchRow>;
  byId: Record<string, QuizSvcBatchRow>;
  missing: string[];
}> {
  const base = String(process.env.QUIZ_SVC_URL || "").replace(/\/+$/, "");
  if (!base) throw new Error("QUIZ_SVC_URL env var is required");

  const secret = process.env.QUIZ_WEBHOOK_SECRET;
  if (!secret) throw new Error("QUIZ_WEBHOOK_SECRET not set");

  // 1) normalize + dedupe { rootQuizId, version }
  const normalizedMap = new Map<string, QuizCanonicalSelector>();

  for (const sel of selectors || []) {
    const rootQuizId = String(sel.rootQuizId || "").trim();
    const v = Number(sel.version);

    if (!rootQuizId || !Number.isFinite(v) || v <= 0) continue;

    const key = canonicalKey(rootQuizId, v);
    if (!normalizedMap.has(key)) {
      normalizedMap.set(key, { rootQuizId, version: v });
    }
  }

  const normalized = Array.from(normalizedMap.values());
  if (normalized.length === 0) {
    return { byCanonical: {}, byId: {}, missing: [] };
  }

  // 2) chunk selectors so we don't blow up a single request
  const chunkSize = Math.max(1, opts.chunkSize ?? 100);
  const chunks: QuizCanonicalSelector[][] = [];
  for (let i = 0; i < normalized.length; i += chunkSize) {
    chunks.push(normalized.slice(i, i + chunkSize));
  }

  const aggregateCanonical: Record<string, QuizSvcBatchRow> = {};
  const aggregateById: Record<string, QuizSvcBatchRow> = {};
  const aggregateMissing = new Set<string>();

  // 3) call /quiz/internal/canonical-batch for each chunk
  for (const items of chunks) {
    const url = `${base}/quiz/internal/canonical-batch`;

    const res = await fetch(url, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "x-quiz-secret": secret,
      },
      body: JSON.stringify({ items }),
    });

    const ct = res.headers.get("content-type") || "";
    const isJson = ct.includes("application/json");
    const body = isJson ? await res.json().catch(() => null) : await res.text();

    if (!res.ok) {
      const msg =
        (isJson && body && typeof body === "object" && (body as any).message) ||
        `Quiz Service error: ${res.status}`;
      const err: any = new Error(msg);
      err.status = res.status;
      err.body = body;
      throw err;
    }

    const payload = body as QuizSvcCanonicalBatchResponse | null;
    const data = payload?.data;
    if (
      !payload ||
      payload.ok !== true ||
      !data ||
      typeof data !== "object" ||
      !data.byKey ||
      !data.missing
    ) {
      throw new Error("Quiz Service returned unexpected payload shape");
    }

    // 3a) merge canonical rows
    for (const [key, row] of Object.entries(data.byKey)) {
      const cKey = String(key);
      const v = row as QuizSvcBatchRow;

      aggregateCanonical[cKey] = v;
      if (v._id) {
        aggregateById[v._id] = v;
      }
    }

    // 3b) merge missing + invalid (treated as missing)
    for (const miss of data.missing || []) {
      const cKey = canonicalKey(miss.rootQuizId, miss.version);
      aggregateMissing.add(cKey);
    }
    if (Array.isArray(payload.invalid)) {
      for (const inv of payload.invalid) {
        const cKey = canonicalKey(inv.rootQuizId, inv.version);
        aggregateMissing.add(cKey);
      }
    }
  }

  // 4) any canonical key we actually got back should NOT be considered missing
  for (const cKey of Object.keys(aggregateCanonical)) {
    aggregateMissing.delete(cKey);
  }

  return {
    byCanonical: aggregateCanonical,
    byId: aggregateById,
    missing: Array.from(aggregateMissing),
  };
}
