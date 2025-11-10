// Client for Quiz Attempt Service (RN / Expo)

export type QuizType = "basic" | "crossword" | "rapid";

// ---- Common bits ----
export type McOption = { id: string; text: string };
export type ImageRef = {
  filename: string;
  mimetype: string;
  size: number;
  url: string;
};

// Base item shape (shared fields)
type ItemBase = {
  id: string;
  text: string;
  image: ImageRef | null;
};

// ---------------- Rapid items (per-question time is REQUIRED) -------------
export type ItemMCRapid = ItemBase & {
  kind: "mc";
  timeLimit: number; // seconds (required for rapid)
  options: McOption[];
};

// ---------------- Basic items (NO per-question timers) --------------------
export type ItemMCBasic = ItemBase & {
  kind: "mc";
  options: McOption[];
  multiSelect: boolean;
};

export type ItemOpenBasic = ItemBase & {
  kind: "open";
};

export type ItemContext = {
  kind: "context";
  id: string;
  text: string;
  image: ImageRef | null;
};

// ---------------- Crossword item -----------------------------------------
export type ItemCrossword = {
  kind: "crossword";
  id: "crossword";
  totalTimeLimit?: number; // prefer renderSpec.totalTimeLimit
  grid: { letter: string | null; isBlocked: boolean }[][];
  entries: {
    id: string; // clue id
    clue: string;
    positions: { row: number; col: number }[];
    direction: "across" | "down";
  }[];
};

// ---- Render specs --------------------------------------------------------
export type BasicRenderSpec = {
  totalTimeLimit: number | null; // seconds; null means no limit
  items: (ItemMCBasic | ItemOpenBasic | ItemContext)[];
};

export type RapidRenderSpec = {
  items: ItemMCRapid[];
};

export type CrosswordRenderSpec = {
  totalTimeLimit?: number | null; // seconds
  items: [ItemCrossword];
};

// ---- Spec payloads -------------------------------------------------------
export type BaseAttemptSpec<TSpec> = {
  quizId: string;
  quizType: QuizType;
  contentHash: string;
  renderSpec: TSpec;
  meta: {
    name: string;
    subject: string;
    subjectColorHex?: string;
    topic?: string;
    owner: string;
  };
  // policy context
  attemptsAllowed: number;
  attemptsCount: number; // finalized-only count (per the server logic)
  attemptsRemaining: number;
  showAnswersAfterAttempt: boolean;
  // optional tagging
  versionTag?: string;
};

export type BasicAttemptSpec = BaseAttemptSpec<BasicRenderSpec> & {
  quizType: "basic";
};
export type RapidAttemptSpec = BaseAttemptSpec<RapidRenderSpec> & {
  quizType: "rapid";
};
export type CrosswordAttemptSpec = BaseAttemptSpec<CrosswordRenderSpec> & {
  quizType: "crossword";
};

export type AttemptSpec =
  | BasicAttemptSpec
  | RapidAttemptSpec
  | CrosswordAttemptSpec;

// The server may include an optional inProgressAttemptId alongside the spec.
export type AttemptSpecServerResponse = {
  ok: boolean;
  data: AttemptSpec & { inProgressAttemptId?: string };
};

// What the app likely wants to consume: the spec + an optional attemptId to resume
export type AttemptSpecClientResult = {
  spec: AttemptSpec;
  inProgressAttemptId?: string;
};

// ---- Attempt snapshot / doc (returned when resuming an in-progress attempt) ----
export type AttemptSnapshot = {
  quizId: string;
  quizType: QuizType;
  contentHash: string;
  renderSpec: BasicRenderSpec | RapidRenderSpec | CrosswordRenderSpec;
  meta: {
    name: string;
    subject: string;
    subjectColorHex?: string;
    topic?: string;
    owner: string;
    [k: string]: any;
  };
  versionTag?: string;
};

export type AttemptDoc = {
  _id: string; // server id
  quizId: string;
  studentId: string;
  classId: string;
  scheduleId: string;
  state: "in_progress" | "finalized" | "invalidated" | string;
  startedAt: string;
  lastSavedAt?: string;
  finishedAt?: string;
  attemptVersion: number;
  answers: Record<string, any>;
  quizVersionSnapshot: AttemptSnapshot;
  // Optional fields (usually present after finalize)
  maxScore?: number;
  score?: number;
  breakdown?: any[];
};

// What startAttempt() returns in the client:
export type StartAttemptResult = {
  attemptId: string; // always present (new or resumed)
  attempt?: AttemptDoc; // present only when resuming an in-progress attempt
};

// ---- Start attempt (server creates OR returns existing) ----
export type StartAttemptCreatedResponse = {
  ok: boolean;
  data: { attemptId: string };
};
type StartAttemptResumedResponse = {
  ok: boolean;
  data: {
    attemptId: string;
    answers: Record<string, any>;
    attemptVersion: number;
    lastSavedAt: string | null;
    startedAt: string | null;
  };
};

// ---- Save answers ----
export type SaveAnswersResponse = {
  ok: boolean;
  data: {
    attemptId: string;
    attemptVersion: number;
    lastSavedAt: string;
  };
};

// ---- Finish attempt (finalize) ----
export type FinalizeAttemptResponse = {
  ok: boolean;
  data: {
    _id: string;
    quizId: string;
    studentId: string;
    classId: string;
    scheduleId: string;
    state: "finalized" | string;
    startedAt: string;
    finishedAt?: string;
    maxScore: number;
    score: number;
    attemptVersion?: number;
    lastSavedAt?: string;
    breakdown?: any[];
    answers?: Record<string, any>;
  };
};

// ---- Answers payloads ----
export type AnswersPayload = {
  [itemId: string]:
    | string
    | string[]
    | {
        [clueId: string]: string; // crossword only under key "crossword"
      };
};

// ---------- Config ----------
const QUIZ_BASE_URL =
  process.env.EXPO_PUBLIC_QUIZ_SVC_URL || "http://localhost:7302";

// ---------- Debug logging ----------
const DEBUG_QUIZ_FETCH =
  (process.env.EXPO_PUBLIC_DEBUG_QUIZ_FETCH || "").toLowerCase() === "true";

// ---------- Internals ----------
async function authedJson<T>(
  url: string,
  token: string,
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE",
  body?: unknown
): Promise<T> {
  if (DEBUG_QUIZ_FETCH) {
    // eslint-disable-next-line no-console
    console.log(
      `[quiz:fetch] -> ${method} ${url}`,
      body ? { body } : "(no body)"
    );
  }

  const res = await fetch(url, {
    method,
    headers: {
      Accept: "application/json, text/plain, */*",
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: body == null ? undefined : JSON.stringify(body),
  });

  const contentType = res.headers.get("content-type") || "";
  const rawText = await res.text().catch(() => "");

  if (DEBUG_QUIZ_FETCH) {
    // eslint-disable-next-line no-console
    console.log(
      `[quiz:fetch] <- ${res.status} ${res.statusText} @ ${url}`,
      contentType ? { contentType } : {},
      rawText ? { body } : "(no body)"
    );
  }

  let parsed: any = null;
  if (rawText && contentType.includes("application/json")) {
    try {
      parsed = JSON.parse(rawText);
    } catch {
      // leave parsed null if JSON invalid
    }
  }

  if (!res.ok) {
    const msg =
      (parsed && parsed.message) ||
      rawText ||
      `HTTP ${res.status} ${res.statusText} @ ${url}`;
    throw new Error(msg);
  }

  return (parsed ?? ({} as any)) as T;
}

// Convenience helpers
const authedPost = <T>(url: string, token: string, body?: unknown) =>
  authedJson<T>(url, token, "POST", body);
const authedGet = <T>(url: string, token: string) =>
  authedJson<T>(url, token, "GET");

// ---------- Public API ----------
export async function getAttemptSpec(
  token: string,
  quizId: string,
  params: { scheduleId: string; classId: string }
): Promise<AttemptSpecClientResult> {
  const resp = await authedPost<AttemptSpecServerResponse>(
    `${QUIZ_BASE_URL}/attempt/spec/${encodeURIComponent(quizId)}`,
    token,
    { scheduleId: params.scheduleId, classId: params.classId }
  );

  const { inProgressAttemptId, ...rest } = resp.data as AttemptSpec & {
    inProgressAttemptId?: string;
  };

  return {
    spec: rest as AttemptSpec,
    ...(inProgressAttemptId ? { inProgressAttemptId } : {}),
  };
}

export async function startAttempt(
  token: string,
  payload: { scheduleId: string; quizId: string; classId: string }
): Promise<StartAttemptResult> {
  const resp = await authedPost<
    StartAttemptCreatedResponse | StartAttemptResumedResponse
  >(`${QUIZ_BASE_URL}/attempt`, token, payload);

  const data = (resp as any)?.data;
  if (!data) throw new Error("Unexpected startAttempt response");

  // If server included `answers` or `startedAt`, it's a RESUME
  if ("answers" in data || "startedAt" in data) {
    // Build a minimal AttemptDoc the screen needs (answers, version, startedAt)
    const attempt: AttemptDoc = {
      _id: data.attemptId,
      quizId: payload.quizId,
      classId: payload.classId,
      scheduleId: payload.scheduleId,
      studentId: "", // not required by the play screen
      state: "in_progress",
      startedAt: data.startedAt ?? new Date().toISOString(),
      lastSavedAt: data.lastSavedAt ?? undefined,
      attemptVersion: data.attemptVersion ?? 1,
      answers: data.answers ?? {},
      // not needed by the play screen for continuation
      quizVersionSnapshot: {
        quizId: payload.quizId,
        quizType: "basic" as any, // optional; unused by Basic screen
        contentHash: "",
        renderSpec: {} as any,
        meta: { name: "", subject: "", owner: "" },
      },
    };

    return { attemptId: data.attemptId, attempt };
  }

  // Otherwise it's a brand new attempt
  return { attemptId: data.attemptId };
}

export async function saveAnswers(
  token: string,
  attemptId: string,
  answers: AnswersPayload,
  attemptVersion?: number
): Promise<SaveAnswersResponse["data"]> {
  // Note: we intentionally avoid strict optimistic concurrency
  // to prevent 409s from overlapping client saves.
  try {
    const resp = await authedJson<SaveAnswersResponse>(
      `${QUIZ_BASE_URL}/attempt/${encodeURIComponent(attemptId)}/answers`,
      token,
      "PATCH",
      attemptVersion != null ? { answers, attemptVersion } : { answers }
    );
    if (!resp || typeof resp !== "object" || !("data" in resp)) {
      throw new Error("Unexpected saveAnswers response shape");
    }
    return resp.data;
  } catch (e: any) {
    // Graceful fallback if server enforces version check and we sent a stale one.
    const msg = String(e?.message || "");
    if (msg.toLowerCase().includes("version conflict")) {
      const retry = await authedJson<SaveAnswersResponse>(
        `${QUIZ_BASE_URL}/attempt/${encodeURIComponent(attemptId)}/answers`,
        token,
        "PATCH",
        { answers }
      );
      return retry.data;
    }
    throw e;
  }
}

export async function finishAttempt(
  token: string,
  attemptId: string
): Promise<FinalizeAttemptResponse["data"]> {
  const resp = await authedPost<FinalizeAttemptResponse>(
    `${QUIZ_BASE_URL}/attempt/${encodeURIComponent(attemptId)}/finish`,
    token,
    {}
  );
  return resp.data;
}

/** GET /attempt/:attemptId — returns full AttemptDoc (student token allowed for own attempt) */
export async function getAttemptById(
  token: string,
  attemptId: string
): Promise<AttemptDoc> {
  const resp = await authedGet<{ ok: boolean; data: AttemptDoc }>(
    `${QUIZ_BASE_URL}/attempt/${encodeURIComponent(attemptId)}`,
    token
  );
  return resp.data;
}

/**
 * High-level helper the UI can call to fetch spec AND resume data in one go.
 * 1) Calls POST /attempt/spec/:quizId
 * 2) If inProgressAttemptId exists, calls GET /attempt/:id
 * 3) Returns { spec, attemptId, attempt? }
 */
export async function fetchAttemptForPlay(
  token: string,
  quizId: string,
  params: { scheduleId: string; classId: string }
): Promise<{ spec: AttemptSpec; attemptId: string; attempt?: AttemptDoc }> {
  const specRes = await getAttemptSpec(token, quizId, params);
  const { spec, inProgressAttemptId } = specRes;

  if (inProgressAttemptId) {
    const attempt = await getAttemptById(token, inProgressAttemptId);
    return { spec, attemptId: inProgressAttemptId, attempt };
  }

  // If there’s no in-progress attempt, the app should call startAttempt next.
  return { spec, attemptId: "", attempt: undefined };
}

// ---------- Type guards ----------
export const isBasic = (s: AttemptSpec): s is BasicAttemptSpec =>
  s.quizType === "basic";
export const isRapid = (s: AttemptSpec): s is RapidAttemptSpec =>
  s.quizType === "rapid";
export const isCrossword = (s: AttemptSpec): s is CrosswordAttemptSpec =>
  s.quizType === "crossword";

// ===== Types for listed attempts (server shape) =====
export type AttemptRow = {
  _id: string;
  scheduleId: string;
  quizId: string;
  studentId: string;
  classId: string;
  state: string;
  startedAt?: string;
  lastSavedAt?: string;
  finishedAt?: string;
  createdAt?: string;
  updatedAt?: string;
  attemptVersion?: number;
  score?: number;
  maxScore?: number;
  quiz?: {
    quizId: string;
    name?: string | null;
    subject?: string | null;
    subjectColorHex?: string | null;
    topic?: string | null;
    quizType?: "basic" | "rapid" | "crossword" | null;
    typeColorHex?: string;
    contentHash?: string | null;
  } | null;
};

type AttemptListResponse = { ok: boolean; rows: AttemptRow[] };

/**
 * Student-only: list my attempts for a given schedule.
 * @route GET /attempt/schedule/:scheduleId/student/me
 */
export async function listMyAttemptsForSchedule(
  token: string,
  scheduleId: string
): Promise<AttemptRow[]> {
  const resp = await authedGet<AttemptListResponse>(
    `${QUIZ_BASE_URL}/attempt/schedule/${encodeURIComponent(
      scheduleId
    )}/student/me`,
    token
  );
  return resp.rows || [];
}
