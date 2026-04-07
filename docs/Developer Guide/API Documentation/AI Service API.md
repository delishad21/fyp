## AI Service API

This document describes the AI Service HTTP API as currently implemented in:

- `services/ai-service/src/routes/generation-routes.ts`
- `services/ai-service/src/controller/generation-controller.ts`
- `services/ai-service/src/middleware/auth.ts`

---

## 1. Base Path and Auth

### 1.1 Base Path

Routes are mounted at service root (`/`), so endpoint paths below are relative to the AI service base URL.

Examples:

- Local direct: `http://localhost:7304`
- Behind gateway: `/api/ai` (if gateway maps that prefix to AI service root)

### 1.2 Auth Enforcement

All generation routes are protected by:

1. `verifyAccessToken` (delegates to User Service `GET /auth/me`)
2. `verifyIsTeacher` (teacher/admin only)

Common auth errors:

- `401 { "message": "Authentication failed" }` (missing/invalid token)
- `403 { "message": "Only teachers can access this resource" }`
- `503 { "message": "Auth service timeout" }`

---

## 2. Shared Request/Response Patterns

### 2.1 Controller Error Shape

Most controller errors return:

```json
{
  "ok": false,
  "message": "Human-readable message",
  "error": "Optional technical detail"
}
```

### 2.2 Global Express Error Shape

Unhandled errors / unmatched routes use:

```json
{
  "error": {
    "message": "Route Not Found"
  }
}
```

(`stack` is included only in development.)

### 2.3 Upload Middleware Errors (POST `/`)

Multer/file-filter failures bubble to global error handler. Example message:

- `"Invalid file type. Only PDF, DOCX, and TXT files are allowed."`

### 2.4 Analytics Access Gate

Generation analytics are protected and not returned by default.

- Set server env: `AI_ANALYTICS_SECRET=<secret>`
- Send query: `?analyticsSecret=<secret>` on analytics-capable GET endpoints.
- If missing/incorrect:
  - top-level `analytics` is omitted.
  - nested per-quiz analytics are removed from progress/results payloads.

Notes:

- Analytics include LLM latency/tokens/retries and planning-pass metadata.
- AI Service no longer computes cost/pricing fields.

---

## 3. API Endpoints

### 3.1 `POST /` — Start generation job

**Auth**: Required (`teacher` or `admin`).

**Content-Type**: `multipart/form-data`.

**Form fields**:

- `instructions` (required, string, non-empty).
- `numQuizzes` (optional, integer; default `10`; validated `1..20`).
- `quizTypes` (required, repeatable):
  - `basic`
  - `rapid`
  - `crossword`
  - `true-false`
- `educationLevel` (optional, default `primary-1`; must be one of `primary-1..primary-6`).
- `questionsPerQuiz` (optional, integer; default `10`; schema-level validation `5..20`).
- `aiModel` (optional string, but recommended; if omitted backend falls back to first configured model).
- `subject` (required string, fixed subject for generated quizzes).
- `topic` must not be provided (topics are generated automatically per quiz; request is rejected if topic is sent).
- `timerSettings` (optional JSON string; parsed via `JSON.parse`).
- `documents` files (optional, up to 5).
- `documentTypes` (optional, repeatable; aligned by index with `documents`):
  - `syllabus`
  - `question-bank`
  - `subject-content`
  - `other`

**File constraints**:

- Max file count: 5.
- Max per-file size: hard-capped at 20MB.
- MIME types: PDF, DOCX, TXT.
- `documentTypes` length may be shorter than file count; unmatched files default to `other`.
- For scanned/image PDFs, OCR fallback is applied automatically when OCR dependencies are available and extraction indicates either low text density or significant sparse pages (more than half of pages with fewer than 10 extracted words each).

**Behaviour**:

1. Validates teacher identity from middleware (`req.teacherId`).
2. Validates required `instructions`.
3. Validates required `subject`.
4. Validates required non-empty `quizTypes` selection.
5. Resolves and validates requested `aiModel` against configured providers.
6. Validates `numQuizzes` and `educationLevel` in-controller.
7. Creates `generation_jobs` record with `status: "pending"` and initial progress.
8. Saves uploaded document metadata (if any).
   - Stores `documentType` per file.
9. Starts background processor asynchronously and returns immediately.

During background generation:

- Uploaded docs are grouped by `documentType` and used with different strategies:
  - `syllabus`: hard curriculum constraints.
  - `question-bank`: exemplar chunks for style/difficulty.
  - `subject-content`: factual grounding chunks.
  - `other`: supplementary chunks.
- Quiz types are assigned from teacher-selected `quizTypes` with deterministic even distribution (round-robin).
- Two-pass generation is used:
  - Pass 1: one planning call builds quiz-level blueprint items for the batch.
  - Pass 2: parallel guided generation applies each quiz blueprint item.
  - Planning requires complete/valid blueprint fields per quiz item; missing required plan fields fail planning.
  - If planning fails after retries (default 3 attempts), generation fails (no deterministic local plan fallback).
- Schema prompt metadata is mandatory:
  - Missing schema system prompt or missing schema format instructions for the selected quiz type fails generation (no local prompt fallback).
- The service applies strong prompt-level constraints for exact generated question count.
- Prompt-level constraints also prohibit batch numbering in generated `name`/`topic` fields and require concise topic labels.
- Metadata with numbering artifacts in `name`/`topic` is treated as invalid and retried.
- If a model returns more items than required, extras are truncated.
- If a model returns fewer items than required, underfilled output is kept (no count-based retry).
- Empty outputs still fail and enter retry flow.
- For crossword, effective required count is capped at 10 (`min(questionsPerQuiz, 10)`).
- For true/false generation, prompt rules explicitly require non-empty statement text and balanced True/False correctness across the set.
- For true/false generation, ambiguous correctness (missing/unclear boolean correctness) is treated as invalid and retried; the service no longer silently defaults to all-True correctness.
- For AI-generated basic open-ended answers, prompt and normalization rules only allow `answerType` values `exact`, `keywords`, and `list` (no `fuzzy` in AI path).
- For AI-generated `keywords` answers, `minKeywords` is enforced to be at least `1` (never `0`).
- For AI-generated `keywords` and `list` answers, grading is driven by `keywords` / `listItems` fields (and minimum thresholds), not `text`.
- Open-ended normalization is strict: if `answerType` is invalid, or if `keywords`/`listItems` are empty for their respective answer types, that open item is excluded.
- `fuzzy` is intentionally excluded in the AI path to avoid unstable auto-grading quality from generated typo-tolerant answers; deterministic modes gave more consistent results in production testing.

**Success (200)**:

```json
{
  "ok": true,
  "jobId": "66f1...e3",
  "message": "Generation job started"
}
```

**Errors**:

- `400` missing instructions.
- `400` missing subject.
- `400` missing/invalid quizTypes.
- `400` topic input not supported.
- `400` invalid `aiModel`.
- `400` invalid `numQuizzes`.
- `400` invalid `educationLevel`.
- `401` unauthorized.
- `503` no configured model provider API keys.
- `500` JSON parse errors (e.g. malformed `timerSettings`) and other internal failures.

---

### 3.2 `GET /` — Paginated generation jobs

**Auth**: Required (`teacher` or `admin`).

**Query**:

- `limit` (optional, default `10`).
- `skip` (optional, default `0`).
- `analyticsSecret` (optional string; required to include analytics fields).

**Behaviour**:

1. Lists jobs owned by authenticated teacher/admin identity (`teacherId` scope).
2. Sorts newest first.
3. Excludes `extractedText` from returned documents.
4. Returns pagination metadata.
5. Includes analytics fields only when `analyticsSecret` matches `AI_ANALYTICS_SECRET`.

**Success (200)**:

```json
{
  "ok": true,
  "jobs": [
    {
      "_id": "66f1...e3",
      "teacherId": "66a1...3d",
      "status": "completed",
      "config": { "instructions": "...", "numQuizzes": 10, "quizTypes": ["basic", "rapid"], "educationLevel": "primary-4", "questionsPerQuiz": 10, "aiModel": "openai-gpt-5-mini", "subject": "Math" },
      "progress": { "current": 10, "total": 10 },
      "results": { "total": 10, "successful": 9, "failed": 1, "quizzes": [] },
      "createdAt": "2026-02-23T10:00:00.000Z",
      "updatedAt": "2026-02-23T10:02:00.000Z"
    }
  ],
  "pagination": {
    "total": 24,
    "limit": 10,
    "skip": 0,
    "hasMore": true
  }
}
```

**Errors**:

- `500` internal error.

---

### 3.3 `GET /jobs` — Compact job list (sidebar use)

**Auth**: Required (`teacher` or `admin`).

**Query**:

- `analyticsSecret` (optional string; required to include analytics fields).

**Behaviour**:

1. Lists up to 50 jobs (newest first) for the authenticated teacher/admin identity.
2. Excludes `extractedText`.
3. Returns transformed shape with string `id` field.
4. Includes analytics only when `analyticsSecret` matches `AI_ANALYTICS_SECRET`.

**Success (200)**:

```json
{
  "ok": true,
  "jobs": [
    {
      "id": "66f1...e3",
      "status": "processing",
      "progress": { "current": 3, "total": 10, "quizzes": [] },
      "config": { "instructions": "...", "numQuizzes": 10, "quizTypes": ["basic", "rapid"], "educationLevel": "primary-4", "questionsPerQuiz": 10, "aiModel": "openai-gpt-5-mini", "subject": "Math" },
      "results": null,
      "error": null,
      "createdAt": "2026-02-23T10:00:00.000Z",
      "startedAt": "2026-02-23T10:00:01.000Z",
      "completedAt": null
    }
  ]
}
```

**Errors**:

- `500` internal error.

---

### 3.4 `GET /jobs/pending` — Count jobs with draft quizzes

**Auth**: Required (`teacher` or `admin`).

**Behaviour**:

1. Scans completed jobs with quizzes for the authenticated teacher/admin identity.
2. Counts jobs that contain at least one quiz with `status === "draft"`.

**Success (200)**:

```json
{
  "ok": true,
  "count": 4
}
```

**Errors**:

- `500` internal error.

---

### 3.5 `GET /models` — List available AI models

**Auth**: Required (`teacher` or `admin`).

**Behaviour**:

1. Evaluates configured provider API keys in service env.
2. Returns only models whose provider is configured.
3. Returns `defaultModelId` as first available model.

**Success (200, models available)**:

```json
{
  "ok": true,
  "available": true,
  "models": [
    {
      "id": "openai-gpt-5-mini",
      "provider": "openai",
      "model": "gpt-5-mini",
      "label": "OpenAI GPT-5 mini",
      "description": "Fast, cost-efficient baseline for structured quiz generation with strong instruction-following."
    }
  ],
  "defaultModelId": "openai-gpt-5-mini"
}
```

**Success (200, no models configured)**:

```json
{
  "ok": true,
  "available": false,
  "models": [],
  "message": "AI generation is currently not available. Configure at least one model API key."
}
```

**Errors**:

- `500` internal error.

---

### 3.5.1 `GET /quota` — Get current teacher generation quota status

**Auth**: Required (`teacher` or `admin`).

**Behaviour**:

1. Resolves the authenticated teacher identity.
2. Returns the effective quota status for that teacher.
3. If quota controls are disabled by config, response indicates `enabled: false`.

**Success (200)**:

```json
{
  "ok": true,
  "quota": {
    "enabled": true,
    "limit": 30,
    "used": 12,
    "remaining": 18
  }
}
```

**Errors**:

- `500` internal error.

---

### 3.6 `GET /:jobId` — Get generation job status/details

**Auth**: Required (`teacher` or `admin` owner scope).

**Params**:

- `jobId` (Mongo ObjectId string).

**Query**:

- `analyticsSecret` (optional string; required to include analytics fields).

**Behaviour**:

1. Validates `jobId` format.
2. Fetches owned job.
3. Returns status/progress/config/results/error/timestamps.
4. Includes analytics fields only when `analyticsSecret` matches `AI_ANALYTICS_SECRET`.

**Success (200, default without analytics secret)**:

```json
{
  "ok": true,
  "job": {
    "id": "66f1...e3",
    "status": "completed",
    "progress": { "current": 10, "total": 10, "quizzes": [] },
    "config": { "instructions": "...", "numQuizzes": 10, "quizTypes": ["basic", "rapid"], "educationLevel": "primary-4", "questionsPerQuiz": 10, "aiModel": "openai-gpt-5-mini", "subject": "Math" },
    "results": {
      "total": 10,
      "successful": 9,
      "failed": 1,
      "quizzes": [
        {
          "tempId": "uuid",
          "quizType": "basic",
          "name": "Science: Plants Quiz",
          "subject": "Science",
          "topic": "Plants",
          "items": [],
          "status": "draft",
          "retryCount": 1,
          "createdAt": "2026-02-23T10:01:00.000Z",
          "updatedAt": "2026-02-23T10:01:00.000Z"
        }
      ]
    },
    "error": null,
    "createdAt": "2026-02-23T10:00:00.000Z",
    "startedAt": "2026-02-23T10:00:01.000Z",
    "completedAt": "2026-02-23T10:01:10.000Z"
  }
}
```

**Success (200, with valid analytics secret)**:

```json
{
  "ok": true,
  "job": {
    "id": "66f1...e3",
    "status": "completed",
    "progress": { "current": 10, "total": 10, "quizzes": [] },
    "config": { "instructions": "...", "numQuizzes": 10, "quizTypes": ["basic", "rapid"], "educationLevel": "primary-4", "questionsPerQuiz": 10, "aiModel": "openai-gpt-5-mini", "subject": "Math" },
    "analytics": {
      "planning": {
        "success": true,
        "fallbackUsed": false,
        "attemptCount": 1,
        "successfulAttempts": 1,
        "retryCount": 0,
        "provider": "openai",
        "model": "gpt-5-mini",
        "llmLatencyMs": 1461,
        "usage": {
          "inputTokens": 1289,
          "outputTokens": 224,
          "totalTokens": 1513
        },
        "startedAt": "2026-02-23T10:00:01.200Z",
        "completedAt": "2026-02-23T10:00:02.661Z",
        "planItemCount": 10
      },
      "totals": {
        "attemptCount": 12,
        "successfulAttempts": 10,
        "retryCount": 2,
        "llmLatencyMs": 82433,
        "inputTokens": 95210,
        "outputTokens": 14240,
        "totalTokens": 109450
      },
      "byProviderModel": [
        {
          "provider": "openai",
          "model": "gpt-5-mini",
          "attemptCount": 12,
          "successfulAttempts": 10,
          "llmLatencyMs": 82433,
          "inputTokens": 95210,
          "outputTokens": 14240,
          "totalTokens": 109450
        }
      ],
      "generatedAt": "2026-02-23T10:01:10.000Z"
    },
    "results": {
      "total": 10,
      "successful": 9,
      "failed": 1,
      "quizzes": [
        {
          "tempId": "uuid",
          "quizType": "basic",
          "name": "Science: Plants Quiz",
          "subject": "Science",
          "topic": "Plants",
          "items": [],
          "status": "draft",
          "retryCount": 1,
          "analytics": {
            "totals": {
              "attemptCount": 2,
              "successfulAttempts": 1,
              "retryCount": 1,
              "llmLatencyMs": 11874,
              "inputTokens": 13880,
              "outputTokens": 1940,
              "totalTokens": 15820
            },
            "attempts": []
          },
          "createdAt": "2026-02-23T10:01:00.000Z",
          "updatedAt": "2026-02-23T10:01:00.000Z"
        }
      ]
    },
    "error": null,
    "createdAt": "2026-02-23T10:00:00.000Z",
    "startedAt": "2026-02-23T10:00:01.000Z",
    "completedAt": "2026-02-23T10:01:10.000Z"
  }
}
```

**Errors**:

- `400` invalid job ID.
- `404` job not found (including non-owner access).
- `500` internal error.

**Analytics notes**:

- `analytics.planning` includes planning retry telemetry (`attemptCount`, `successfulAttempts`, `retryCount`) and aggregated planning `usage`.
- `analytics.totals.*` aggregates both generation attempts and planning attempts (including planning retries).
- This excludes job polling time and most controller/middleware overhead.
- Token usage is normalized across providers to `inputTokens`, `outputTokens`, `totalTokens`.
- Analytics are visible only when `analyticsSecret` query matches `AI_ANALYTICS_SECRET`.

---

### 3.7 `PATCH /:jobId/quizzes/:tempId` — Update draft quiz

**Auth**: Required (`teacher` or `admin` owner scope).

**Params**:

- `jobId` (Mongo ObjectId string).
- `tempId` (draft quiz UUID).

**Body**:

Arbitrary partial draft fields. Common fields:

- `name`, `subject`, `topic`
- `items`
- `entries`, `grid`, `placedEntries` (crossword)
- `totalTimeLimit`
- `status` (no server-side status gate currently)

**Behaviour**:

1. Validates `jobId`.
2. Loads owned job and finds quiz by `tempId`.
3. Merges request body into quiz (`Object.assign`) and sets `updatedAt = now`.
4. Saves job document.

**Success (200)**:

```json
{
  "ok": true,
  "quiz": {
    "tempId": "uuid",
    "quizType": "rapid",
    "name": "Updated name",
    "subject": "Math",
    "topic": "Fractions",
    "items": [],
    "status": "draft",
    "updatedAt": "2026-02-23T10:05:00.000Z"
  }
}
```

**Errors**:

- `400` invalid job ID.
- `404` job not found.
- `404` quiz not found.
- `500` internal error.

---

### 3.8 `POST /:jobId/approve` — Approve drafts and persist quizzes

**Auth**: Required (`teacher` or `admin` owner scope).

**Params**:

- `jobId` (Mongo ObjectId string).

**Body**:

```json
{
  "quizIds": ["tempId-1", "tempId-2"]
}
```

(`quizIds` are draft `tempId`s.)

**Behaviour**:

1. Validates auth header and `teacherId`.
2. Validates `jobId` and `quizIds` array.
3. Loads owned job and filters selected drafts where `status === "draft"`.
4. Transforms payload to Quiz Service format:
   - `crossword` -> uses `entries`
   - others -> uses `items`
5. Calls Quiz Service internal batch-create.
6. Marks successfully mapped drafts as `approved` and sets `savedQuizId`.

**Success (200)**:

```json
{
  "ok": true,
  "message": "2 quizzes saved successfully",
  "savedQuizIds": ["66aa...", "66ab..."],
  "errors": []
}
```

**Errors**:

- `400` invalid job ID.
- `400` no quizzes selected.
- `400` no valid quizzes to approve.
- `401` unauthorized / missing teacherId context.
- `404` job not found.
- `500` internal error / downstream quiz-service failure.

---

### 3.9 `DELETE /:jobId` — Delete one generation job

**Auth**: Required (`teacher` or `admin` owner scope).

**Params**:

- `jobId` (Mongo ObjectId string).

**Behaviour**:

1. Validates `jobId`.
2. Loads owned job.
3. Attempts to delete uploaded document files (best-effort).
4. Deletes the job record from MongoDB.

Does not delete approved quizzes already persisted in Quiz Service.

**Success (200)**:

```json
{
  "ok": true,
  "message": "Generation job deleted"
}
```

**Errors**:

- `400` invalid job ID.
- `404` job not found.
- `500` internal error.

---

### 3.10 `DELETE /cleanup` — Cleanup old completed jobs

**Auth**: Required (`teacher` or `admin` owner scope).

**Behaviour**:

1. Finds completed jobs older than 30 days for current teacher/admin identity.
2. Keeps only jobs where:
   - no quizzes exist, or
   - all quiz statuses are `approved` or `rejected`.
3. Deletes those jobs and uploaded files (best-effort file deletion).

**Success (200)**:

```json
{
  "ok": true,
  "deleted": 3,
  "message": "Cleaned up 3 old job(s)"
}
```

**Errors**:

- `500` internal error.

---

## 4. Job and Draft Status Reference

### 4.1 Job Status

- `pending`
- `processing`
- `completed`
- `failed`

### 4.2 Draft Quiz Status

- `pending`
- `generating`
- `draft`
- `approved`
- `rejected`
- `failed`

---

## 5. Notes for API Consumers

1. `POST /` is asynchronous by design; poll `GET /:jobId`.
2. Call `GET /models` first to populate valid `aiModel` choices on the client.
3. `GET /` (paginated) and `GET /jobs` (compact) serve different frontend use cases.
4. For uploads, send `timerSettings` as JSON string in multipart forms.
5. Error payload shape can differ between controller and global middleware failures.
6. Ownership is enforced by `teacherId` scoping on all job mutation/read endpoints.
7. `index.ts` also defines a `GET /` health handler, but route order currently makes the authenticated `GET /` jobs route the effective handler at that path.
