## 15. Service Health API

### 15.1 `GET /` – Health check

**Auth**: Public.

**Behaviour**:
Returns a simple JSON payload indicating the quiz-service is up.

**Success (200)**:

```json
{ "message": "Hello World from quiz-service" }
```

**Errors**: None (beyond generic 5xx on server failure).

---

## 16. Quiz Authoring, Versioning, and Listing

### 16.1 `POST /quiz` – Create quiz

**Auth**: `verifyAccessToken`

**Body** (simplified):

```json
{
  "quizType": "basic" | "rapid" | "crossword" | "rapid-arithmetic" | "crossword-bank" | "true-false",
  "name": "string",
  "subject": "string",
  "topic": "string",
  "...": "quiz-type-specific payload (itemsJson, gridJson, etc.)"
}
```

**Behaviour**:

1. Require `req.user.id` as `ownerId`; otherwise `401`.
2. Validate `quizType` via `isQuizType` and `getQuizTypeDef`. Reject unsupported types.
3. Normalize base metadata:
    - `name`, `subject`, `topic` → `trim()`.
4. Type-specific pipeline:
    - `def.readItemsFromBody(req.body)` → raw item list.
    - `def.coerceItems(rawItems)` → normalized items.
    - `def.validate({ ...body, name, subject, topic }, items)`:
        - On any `fieldErrors` / `questionErrors`, return `400` with structured messages.
5. Resolve `subjectColorHex` for the owner via `resolveSubjectColorHex(ownerId, subject)`.
6. Build type-specific patch via `def.buildTypePatch(req.body, items)`.
7. Create initial quiz row:
    - `_id = new ObjectId()`
    - `rootQuizId = _id` (family id)
    - `version = 1`
    - `owner = ownerId`
    - plus `quizType`, metadata, and type patch.
8. Reload as `BaseQuizLean` via `QuizBaseModel` and return.

**Success (201)**:

```json
{ "ok": true, "data": BaseQuizLean }
```

**Errors**:

- `400` – Missing/invalid `quizType` or validation errors.
- `401` – Unauthenticated.
- `500` – Server error.

---

### 16.2 `GET /quiz/:id` – Get quiz version (owner/admin)

**Auth**: `verifyAccessToken + verifyQuizOwnerOrAdmin`

**Params**:

- `id`: `rootQuizId` (family id, Mongo ObjectId).

**Query**:

- `version?: number` – Optional; if omitted, latest version is returned.

**Behaviour**:

1. Validate `rootQuizId` (`isValidObjectId`).
2. Load all quiz rows for that family:
    - `QuizBaseModel.find({ rootQuizId }).sort({ version: 1 })`.
3. If none, `404`.
4. Owner/admin guard:
    - Owner = `allVersions[0].owner`.
    - Allow if `sameId(owner, req.user.id)` or `req.user.isAdmin === true`; otherwise `403`.
5. Collect `versions` list: sorted `version` numbers.
6. Resolve target version:
    - If `version` query is present:
        - Parse as number, validate.
        - Find matching version; if missing → `404`.
    - Else use last element (highest version).
7. Compute `typeColorHex` from `QUIZ_TYPE_COLORS[quizType]` for UI convenience.
8. Return the selected version plus `versions[]`.

**Success (200)**:

```json
{
  "ok": true,
  "data": BaseQuizLean & { typeColorHex?: string },
  "versions": number[]
}
```

**Errors**:

- `400` – Invalid `rootQuizId` or version param.
- `403` – Not owner/admin.
- `404` – Quiz family or requested version not found.
- `500` – Server error.

---

### 16.3 `POST /quiz/:id/clone` – Clone quiz into new family

**Auth**: `verifyAccessToken + verifyQuizOwnerOrAdmin`

**Params**:

- `id`: source `rootQuizId`.

**Query**:

- `version?: number` – Optional base version to clone; defaults to latest.

**Body**:

```json
{
  "name": "optional new name"
}
```

**Behaviour**:

1. Validate `rootQuizId`.
2. Resolve source version:
    - If `version` query provided and finite, `findOne({ rootQuizId, version })`.
    - Else `findOne({ rootQuizId }).sort({ version: -1 })` (latest).
    - If not found → `404`.
3. Owner/admin guard based on resolved base row.
4. Resolve quiz type definition and full typed doc via `def.Model.findById(base._id)`.
5. Strip identity/version fields (`_id`, `rootQuizId`, `version`, timestamps).
6. Determine `cloneName`:
    - `body.name?.trim()` or `"${base.name} (Copy)"`.
7. Create new quiz row:
    - `_id = new ObjectId()` (`newId`)
    - `rootQuizId = newId` (new family)
    - `version = 1`
    - `owner = base.owner`
    - `name = cloneName`
    - plus rest of type-specific fields.
8. Reload via `QuizBaseModel.findById` and return.

**Success (201)**:

```json
{ "ok": true, "data": BaseQuizLean }
```

**Errors**:

- `400` – Invalid `rootQuizId` or unsupported `quizType`.
- `403` – Forbidden.
- `404` – Source quiz/version not found.
- `500` – Server error.

---

### 16.4 `PATCH /quiz/:id` – Update quiz (create new version or metadata-only update)

**Auth**: `verifyAccessToken + verifyQuizOwnerOrAdmin`

**Params**:

- `id`: `rootQuizId`.

**Query**:

- `version?: number` – Optional base version to diff against; defaults to latest.

**Body** (simplified):

```json
{
  "name?: string",
  "subject?: string",
  "topic?: string",
  "...": "quiz-type-specific payload",
  "updateActiveSchedules?: boolean | \\"true\\" | \\"false\\" | \\"1\\" | \\"0\\""
}
```

**Behaviour**:

1. Validate `rootQuizId`.
2. Resolve base version (requested or latest). If not found → `404`.
3. Owner/admin guard (base.owner).
4. Resolve quiz type definition via `getQuizTypeDef`.
5. Normalize metadata:
    - `name`, `subject`, `topic` fallback to base values and `trim()`.
6. Type-specific pipeline:
    - `readItemsFromBody` → `coerceItems` → `validate`.
    - On any validation errors → `400` with structured messages.
7. Build type patch via `buildTypePatch`.
8. If subject changed → recompute `subjectColorHex` for this owner.
9. Detect content vs metadata change:
    - Load full typed doc via `def.Model.findById(base._id)`.
    - Compute `oldHash = computeContentHashForDoc(quizType, oldFull)`.
    - Build `newShape = { ...oldFull, ...patch }` and `newHash` similarly.
    - `CONTENT_CHANGED = oldHash !== newHash`.
    - `METADATA_CHANGED = name/subject/topic differ from base`.
10. If neither changed → `400 "No changes detected"`.
11. Parse `updateActiveSchedules` flag (truthy strings accepted).

**Branch A – metadata-only update (`!CONTENT_CHANGED && METADATA_CHANGED`)**:

1. `updateMany({ rootQuizId }, { $set: { name, subject, subjectColorHex, topic, updatedAt }})` so all versions share updated metadata.
2. Emit `QuizMetaUpdated` event via `enqueueEvent` so class-svc can refresh labels on schedules.
3. Return latest family row as convenience.

**Branch B – content change (with or without metadata change)**:

1. Compute `nextVersion` = current max version + 1.
2. Create new version row via `def.Model.create`:
    - Inherit `rootQuizId`, `owner`, `quizType`.
    - Apply `name`, `subject`, `subjectColorHex`, `topic`, `version: nextVersion`, and type patch.
3. If metadata also changed:
    - Emit `QuizMetaUpdated` event for schedule label refresh.
4. If `updateActiveSchedules` truthy:
    - Emit `QuizVersionUpdated` event pointing from `previousVersion` to `nextVersion` with `contentChanged: true`.

**Success (200)** (both branches):

```json
{
  "ok": true,
  "data": BaseQuizLean | null,
  "contentChanged": boolean,
  "previousVersion": number
}
```

**Errors**:

- `400` – Invalid `rootQuizId`, validation errors, or no-op update.
- `403` – Forbidden.
- `404` – Base quiz/version not found.
- `500` – Server error.

---

### 16.5 `DELETE /quiz/:id` – Delete entire quiz family

**Auth**: `verifyAccessToken + verifyQuizOwnerOrAdmin`

**Params**:

- `id`: `rootQuizId`.

**Behaviour**:

1. Validate `rootQuizId`.
2. Load all family rows: `QuizBaseModel.find({ rootQuizId })`.
3. If empty → `404`.
4. Owner/admin guard based on family owner.
5. Extract all concrete `_id`s into `ids`.
6. `QuizBaseModel.deleteMany({ rootQuizId })`.
7. Delete all attempts referencing any family version:
    - `AttemptModel.deleteMany({ quizId: { $in: ids } })`.
8. Build and enqueue `QuizDeleted` event:
    - `quizId = rootQuizId`.
    - `purgeCount = deleted attempts count`.
9. Return `ok: true`.

**Success (200)**:

```json
{ "ok": true }
```

**Errors**:

- `400` – Invalid `rootQuizId`.
- `403` – Forbidden.
- `404` – Quiz family not found.
- `500` – Server error.

---

### 16.6 `GET /quiz/admin/all` – Admin list of all quizzes

**Auth**: `verifyAccessToken + verifyIsAdmin`

**Query**:

```json
{
  "name?": "string",
  "subjects?": "string | string[]",
  "topics?": "string | string[]",
  "types?": "string | string[]",
  "createdStart?": "ISO-ish date string",
  "createdEnd?": "ISO-ish date string",
  "page?": number,
  "pageSize?": number
}
```

**Behaviour**:

1. Parse filters into `ListFilters` using `parseStringArrayParam` for multi-values.
2. Clamp `pageSize` to `[1, 100]`, and `page ≥ 1`.
3. Build a Mongo filter via `buildMongoFilter(undefined, filters)` (no owner restriction).
4. Aggregate to compute total families:
    - Sort by `(rootQuizId ASC, version DESC)`.
    - Group to latest per `rootQuizId`.
    - Replace root with `latest`.
    - Match filters.
    - `$count` = `total`.
5. Compute `pageCount` and safe `page`.
6. Second aggregate to fetch paginated rows:
    - Same group pipeline.
    - Match filters.
    - Sort by `createdAt DESC`.
    - Apply `$skip` / `$limit`.
    - `$project: META_PROJECTION`.
7. Return `rows`, `page`, `pageCount`, `total`.

**Success (200)**:

```json
{
  "ok": true,
  "rows": QuizMeta[],
  "page": number,
  "pageCount": number,
  "total": number
}
```

**Errors**:

- `401/403` – Not authenticated/not admin.
- `500` – Server error.

---

### 16.7 `GET /quiz` – List my quizzes (owner scope)

**Auth**: `verifyAccessToken`

**Query**: Same as admin list, but owner-scoped.

**Behaviour**:

1. Require `ownerId = req.user.id`; else `401`.
2. Build `ListFilters` from query.
3. Build owner-scoped filter via `buildMongoFilter(ownerId, filters)`.
4. Same 2-phase aggregate as above, but with owner restriction.
5. After fetching rows, augment each with `typeColorHex` from `QUIZ_TYPE_COLORS[row.quizType]`.

**Success (200)**:

```json
{
  "ok": true,
  "rows": Array<QuizMeta & { typeColorHex?: string }>,
  "page": number,
  "pageCount": number,
  "total": number
}
```

**Errors**:

- `401` – Unauthenticated.
- `500` – Server error.

---

### 16.8 `POST /quiz/internal/batch` – Batch fetch quiz metadata by `_id`

**Auth**: S2S only via shared secret (`x-quiz-secret`)

**Body**:

```json
{ "ids": string[] }  // concrete quiz _id (version ids)
```

**Behaviour**:

1. Verify shared secret header against `sharedSecret()`. On mismatch → `401`.
2. Normalize and dedupe `ids`:
    - Cast everything to trimmed strings.
    - Remove empties.
3. If no ids left → `400`.
4. Partition into:
    - `validIds`: valid ObjectIds.
    - `invalid`: everything else.
5. Fetch docs matching `validIds` with `META_PROJECTION`.
6. Build `byId` map keyed by `_id` (string):
    - Attach `typeColorHex` from `QUIZ_TYPE_COLORS`.
7. Compute `missing`:
    - All invalid ids.
    - Any valid id not found in `byId`.
8. Return `partial = missing.length > 0`.

**Success (200)**:

```json
{
  "ok": true,
  "data": {
    "byId": {
      "<quizId>": QuizMeta & { typeColorHex?: string }
    },
    "missing": string[]
  },
  "partial": boolean,
  "invalid?": string[]
}
```

**Errors**:

- `400` – Missing/empty `ids`.
- `401` – Secret mismatch.
- `500` – Server error.

---

### 16.9 `POST /quiz/internal/versions` – List all versions for a root quiz

**Auth**: S2S via `x-quiz-secret`

**Body**:

```json
{ "rootQuizId": "string" }
```

**Behaviour**:

1. Verify secret; else `401`.
2. Validate `rootQuizId` as ObjectId; else `400`.
3. Fetch all docs `find({ rootQuizId })`, projecting `META_PROJECTION`, sort by `version ASC`.
4. If none → `404`.
5. Map to `versions[]`:
    - Stringify `_id` and `rootQuizId`.
    - Attach `typeColorHex` from `QUIZ_TYPE_COLORS`.

**Success (200)**:

```json
{
  "ok": true,
  "data": {
    "rootQuizId": "string",
    "versions": Array<QuizMeta & { typeColorHex?: string }>
  }
}
```

**Errors**:

- `400` – Invalid `rootQuizId`.
- `401` – Secret mismatch.
- `404` – No family found.
- `500` – Server error.

---

### 16.10 `POST /quiz/internal/canonical-batch` – Batch fetch by (rootQuizId, version)

**Auth**: S2S via `x-quiz-secret`

**Body**:

```json
{
  "items": [
    { "rootQuizId": "string", "version": number },
    ...
  ]
}
```

**Behaviour**:

1. Verify secret; else `401`.
2. Ensure `items` is a non-empty array; else `400`.
3. Normalize:
    - `rootQuizId = trim(string)`
    - `version = Number(...)`
4. Filter out entries missing either field.
5. Dedupe by `(rootQuizId, version)` pair key.
6. Partition into:
    - `valid`: rootQuizId is valid ObjectId and `version` is positive integer.
    - `invalid`: others.
7. Fetch docs via `$or` on `{ rootQuizId, version }` for all `valid` pairs, projecting `META_PROJECTION`.
8. Build `byKey` map keyed by `"rootQuizId:version"`:
    - Values include `QuizMeta` + `rootQuizId`, `version`, `typeColorHex`.
9. Compute `missing`:
    - All `invalid` pairs.
    - All `valid` pairs not present in `byKey`.
10. Return `partial = missing.length > 0`.

**Success (200)**:

```json
{
  "ok": true,
  "data": {
    "byKey": {
      "rootQuizId:version": QuizMeta & {
        "typeColorHex?": string,
        "rootQuizId": string,
        "version": number
      }
    },
    "missing": Array<{ "rootQuizId": string, "version": number }>
  },
  "partial": boolean,
  "invalid?": Array<{ "rootQuizId": string, "version": number }>
}
```

**Errors**:

- `400` – Missing/empty or fully invalid `items` payload.
- `401` – Secret mismatch.
- `500` – Server error.

---

### 16.11 `GET /quiz/type-colors` – Get quiz type color map

**Auth**: `verifyAccessToken`.

**Behaviour**:

1. Reads `QUIZ_TYPES` and `QUIZ_TYPE_COLORS` from the registry.
2. Returns a stable `{ [quizType]: colorHex }` object used by UI tags.

**Success (200)**:

```json
{
  "ok": true,
  "colors": {
    "basic": "#22c55e",
    "rapid": "#f59e0b",
    "crossword": "#3b82f6",
    "rapid-arithmetic": "#eab308",
    "crossword-bank": "#0ea5e9",
    "true-false": "#ef4444"
  }
}
```

**Errors**:

- `401` – Unauthenticated.

---

### 16.12 `GET /quiz/structure-and-rules` – Export schema + AI generation rules

**Auth**: Public (no token required).

**Behaviour**:

1. Calls `generateQuizStructureAndRules()`.
2. Returns quiz schemas, validation constraints, and AI prompting guidance derived from the source quiz type definitions.
3. Used by AI service and tooling as a single source of truth.
4. Current basic AI prompting rules expose open answer types for AI generation as `exact`, `keywords`, `list` (AI path excludes `fuzzy`) and require `minKeywords >= 1` for keyword mode.
5. `fuzzy` is intentionally removed from AI-generated basic prompts to reduce unstable grading outcomes from model-generated typo-tolerant answers.
6. In AI-generated basic drafts, `keywords`/`list` grading uses `keywords` / `listItems` (+ min thresholds); `text` is only required for `exact`/`fuzzy` style answers.

**Success (200)**:

```json
{
  "ok": true,
  "structureAndRules": {
    "quizTypes": ["..."],
    "schemas": { "...": {} },
    "validation": {},
    "usage": {}
  }
}
```

**Errors**:

- `500` – Server error.

---

### 16.13 `POST /quiz/batch` – Batch create quizzes (authenticated)

**Auth**: `verifyAccessToken`.

**Body**:

```json
{
  "quizzes": [
    {
      "quizType": "basic" | "rapid" | "crossword" | "rapid-arithmetic" | "crossword-bank" | "true-false",
      "...": "type-specific fields"
    }
  ]
}
```

**Behaviour**:

1. Requires authenticated user context from token.
    - Current implementation reads `req.user.sub` and returns `401` if absent.
2. Validates `quizzes` is a non-empty array with max length 20.
3. For each item:
    - Validates `quizType` via `isQuizType`.
    - Creates version-1 quiz (`rootQuizId = _id`, `status = "active"`).
    - Applies direct field persistence (no type-plugin validation pipeline in this endpoint).
    - Uses fallback defaults when omitted (`name`, `subject`, `topic`, and `subjectColorHex = "#6366f1"`).
4. Returns per-item success/error results (partial success supported).

**Success (200)**:

```json
{
  "ok": true,
  "success": true,
  "message": "N of M quizzes created successfully",
  "quizIds": ["..."],
  "errors": [{ "index": 1, "error": "..." }],
  "results": [{ "index": 0, "quizId": "..." }, { "index": 1, "error": "..." }]
}
```

**Errors**:

- `400` – Invalid/missing `quizzes` or > 20.
- `401` – Unauthenticated.
- `500` – Server error.

---

### 16.14 `POST /quiz/generate-crossword` – Generate crossword grid from word/clue pairs

**Auth**: `verifyAccessToken`.

**Body**:

```json
{
  "words": ["APPLE", "BANANA"],
  "clues": ["Fruit with seeds", "Yellow fruit"],
  "gridSize": 20
}
```

**Behaviour**:

1. Validates word/clue payload:
    - `words.length` between 1 and 10.
    - answers are A-Z only, no spaces, max 20 chars.
    - each clue is non-empty.
2. Generates crossword with fallback packing.
3. Compacts/crops output grid and returns placed entries plus unplaced words.

**Success (200)**:

```json
{
  "ok": true,
  "grid": [],
  "entries": [],
  "packedHeight": 0,
  "packedWidth": 0,
  "unplaced": []
}
```

**Errors**:

- `400` – Validation errors (`fieldErrors`, `questionErrors`).
- `401` – Unauthenticated.
- `500` – Server error.

---

### 16.15 `POST /quiz/upload` – Upload quiz image

**Auth**: `verifyAccessToken`.

**Body**:

- `multipart/form-data` with one file (handled by `uploadQuizImages`; first file used).

**Behaviour**:

1. Validates that at least one file was uploaded.
2. Builds URL from `IMAGE_UPLOAD_URL` + stored filename basename.
3. Returns upload metadata for immediate quiz form usage.

**Success (200)**:

```json
{
  "ok": true,
  "data": {
    "url": "https://.../uploads/<stored-filename>",
    "filename": "original-name.png",
    "mimetype": "image/png",
    "size": 12345
  }
}
```

**Errors**:

- `400` – No file uploaded.
- `401` – Unauthenticated.
- `500` – Upload/storage error.

---

### 16.16 `POST /quiz/internal/batch-create` – Internal batch create on behalf of owner

**Auth**: S2S via `x-quiz-secret`.

**Body**:

```json
{
  "userId": "ownerId",
  "quizzes": [
    {
      "quizType": "basic" | "rapid" | "crossword" | "rapid-arithmetic" | "crossword-bank" | "true-false",
      "...": "type-specific fields"
    }
  ]
}
```

**Behaviour**:

1. Validates shared secret; else `401`.
2. Validates `userId` and `quizzes` (non-empty, max 20).
3. For each quiz:
    - Validates quiz type.
    - Resolves subject color with `resolveSubjectColorHex(userId, subject)`.
    - Creates version-1 quiz for that owner.
    - Applies direct field persistence (no type-plugin validation pipeline in this endpoint).
4. Returns partial-success result shape identical to `/quiz/batch`.

**Success (200)**:

```json
{
  "ok": true,
  "success": true,
  "message": "N of M quizzes created successfully",
  "quizIds": ["..."],
  "errors": [],
  "results": []
}
```

**Errors**:

- `400` – Missing `userId`, invalid `quizzes`, or > 20 items.
- `401` – Secret mismatch.
- `500` – Server error.

---

### 16.17 `POST /quiz/internal/generate-crossword` – Internal crossword generation

**Auth**: None at router level (currently public route; same handler as `/quiz/generate-crossword`).

**Body**: Same as `POST /quiz/generate-crossword`.

**Behaviour**:
Executes the same crossword validation/generation flow as `POST /quiz/generate-crossword`.

**Success (200)**: Same payload as `POST /quiz/generate-crossword`.

**Errors**:

- `400` – Validation errors.
- `500` – Server error.

---

## 17. Attempt Lifecycle APIs

### 17.1 `POST /attempt/spec` – Get attempt spec for schedule

**Auth**: `verifyAccessToken + verifyStudentOnly`

**Body**:

```json
{ "scheduleId": "string" }
```

**Behaviour**:

1. Require `studentId = req.user.id`; else `401`.
2. Validate `scheduleId` as ObjectId; else `400`.
3. Count finalized attempts for `(studentId, scheduleId)`:
    - `AttemptModel.countDocuments({ state: "finalized" })`.
4. Check for an existing in-progress attempt for this schedule:
    - `findOne({ state: "in_progress" })`, selecting `_id` only.
5. Call `checkAttemptEligibilityBySchedule` on class-svc with:
    - `studentId`, `scheduleId`, `attemptsCount = finalizedCount`.
6. If not `elig.allowed`, return `403` with structured `reason`, `message`, and optional `window`.
7. Extract `quizRootId`, `quizVersion` from `elig`; validate.
8. Load the concrete quiz version:
    - `QuizBaseModel.findOne({ rootQuizId, version })`.
    - If not found → `404`.
9. Resolve quiz-type definition; if unknown → `400`.
10. Resolve schedule-anchored quiz shape via `resolveQuizForSchedule({ scheduleId, quizDoc: quiz, def })`.
    - For non-randomized types: returns base quiz doc unchanged.
    - For randomized types: reads/creates persisted schedule variant keyed by `(scheduleId, quizRootId, quizVersion)`.
11. Build render-safe `AttemptSpecEnvelope` via `def.buildAttemptSpec(quizForSchedule)`.
12. Fetch family meta via `getFamilyMetaMap`, index by `quiz.rootQuizId`, and derive `liveMeta`.
13. Respond with:
- Core spec fields: `quizId`, `quizType`, `contentHash`, `renderSpec`, `meta`, `versionTag`.
- Canonical identity from class-svc: `quizRootId`, `quizVersion`.
- Attempts policy: `attemptsAllowed`, `attemptsCount`, `attemptsRemaining`, `showAnswersAfterAttempt`.
- Optional `inProgressAttemptId` if an in-progress attempt exists.

**Success (200)**:

```json
{
  "ok": true,
  "data": {
    "quizId": string,
    "quizType": string,
    "contentHash?": string,
    "renderSpec": any,
    "meta": any,
    "versionTag?": string,
    "quizRootId": string | null,
    "quizVersion": number | null,
    "attemptsAllowed": number,
    "attemptsCount": number,
    "attemptsRemaining": number,
    "showAnswersAfterAttempt": boolean,
    "inProgressAttemptId?": string
  }
}
```

**Errors**:

- `400` – Invalid `scheduleId`.
- `401` – Unauthenticated.
- `403` – Eligibility denied (window, attempts exceeded, not enrolled, etc.).
- `404` – Quiz version not found.
- `500` – Server error.

---

### 17.2 `POST /attempt` – Start or resume an attempt

**Auth**: `verifyAccessToken + verifyStudentOnly`

**Body**:

```json
{ "scheduleId": "string" }
```

**Behaviour**:

1. Require `studentId`; else `401`.
2. Validate `scheduleId` as ObjectId; else `400`.
3. Compute `scheduleObjectId` and `studentObjectId`.
4. Check for existing in-progress attempt:
    - `AttemptModel.findOne({ studentId, scheduleId, state: "in_progress" })`.
    - If found → return `200` with resume payload:
        
        ```json
        {
          "attemptId",
          "answers",
          "attemptVersion",
          "lastSavedAt",
          "startedAt"
        }
        
        ```
        
5. Count finalized attempts for this schedule.
6. Call `checkAttemptEligibilityBySchedule` with that count.
    - On denial → `403` with `reason`, `message`, optional `window`.
7. Validate `classId`, `quizRootId`, `quizVersion` from `elig`.
8. Load quiz via `QuizBaseModel.findOne({ rootQuizId, version })`.
    - If not found → `404`.
9. Resolve quiz-type definition.
10. Resolve schedule-anchored quiz shape via `resolveQuizForSchedule({ scheduleId, quizDoc: quiz, def })`.
    - This materializes randomized variants per schedule when applicable.
11. Build `AttemptSpecEnvelope` from the resolved schedule quiz shape.
12. Create new `AttemptModel`:
    - `quizId`, `quizRootId`, `quizVersion`.
    - `studentId`, `classId`, `scheduleId`.
    - `state: "in_progress"`.
    - `startedAt: new Date()`.
    - `answers: {}`.
    - `quizVersionSnapshot: envelope`.
    - `attemptVersion: 1`.
13. Best-effort schedule of attempt expiry via `scheduleAttemptExpiryFromSpec`:
    - Uses `attemptId`, `startedAt`, `spec`, `elig.window`.
    - Errors here are logged but do not fail attempt creation.
14. Respond `201` with basic attempt details.

**Success (201)** (new attempt):

```json
{
  "ok": true,
  "data": {
    "attemptId": string,
    "answers": {},
    "attemptVersion": 1,
    "lastSavedAt": null,
    "startedAt": string
  }
}

```

**Success (200)** (resume existing):

```json
{
  "ok": true,
  "data": {
    "attemptId": string,
    "answers": Record<string, any>,
    "attemptVersion": number,
    "lastSavedAt": string | null,
    "startedAt": string | null
  }
}

```

**Errors**:

- `400` – Invalid `scheduleId`.
- `401` – Unauthenticated / not a student.
- `403` – Eligibility denied.
- `404` – Quiz version not found.
- `500` – Server error.

---

### 17.3 `PATCH /attempt/:attemptId/answers` – Save answers (partial merge)

**Auth**: `verifyAccessToken + verifyAttemptOwnerOrPrivileged`

**Params**:

- `attemptId`: attempt `_id`.

**Body**:

```json
{
  "answers": { [itemId: string]: any },
  "attemptVersion?": number
}
```

**Behaviour**:

1. Validate `attemptId` as ObjectId; else `400`.
2. Ensure `answers` is a non-null object; else `400`.
3. Load current attempt (lean).
4. If not found → `404`.
5. If `state !== "in_progress"` → `409 "Attempt is not editable"`.
6. If `attemptVersion` is provided and does not match `current.attemptVersion` → `409 "Version conflict"` (optimistic concurrency).
7. Merge answers:
    - Start with `current.answers || {}`.
    - For each `(itemId, payload)` in incoming `answers`, overwrite the key.
8. Persist via `findByIdAndUpdate`:
    - `$set: { answers: merged, lastSavedAt: new Date() }`.
    - `$inc: { attemptVersion: 1 }`.
9. Return new `attemptVersion` and `lastSavedAt`.

**Success (200)**:

```json
{
  "ok": true,
  "data": {
    "attemptId": string,
    "attemptVersion": number,
    "lastSavedAt": string
  }
}
```

**Errors**:

- `400` – Invalid `attemptId` / missing `answers`.
- `404` – Attempt not found.
- `409` – Attempt not editable / version conflict.
- `500` – Server error.

---

### 17.4 `POST /attempt/:attemptId/finish` – Finalize and grade attempt

**Auth**: `verifyAccessToken + verifyAttemptOwnerOrPrivileged`

**Params**:

- `attemptId`: attempt `_id`.

**Behaviour**:

1. Validate `attemptId`; else `400`.
2. Load attempt (lean).
3. If not found → `404`.
4. If `state !== "in_progress"` → `409 "Attempt already finalized"`.
5. Resolve type definition:
    - Use `quizVersionSnapshot.quizType` or fallback fields.
    - If missing/unsupported → `400`.
6. Build `answersArray: Answer[]` from `attempt.answers` object.
7. Grade via `def.gradeAttempt(spec, answersArray)`:
    - Returns `total`, `max`, and per item scores.
8. Persist finalized state via `findByIdAndUpdate`:
    - `state: "finalized"`.
    - `finishedAt: new Date()`.
    - `score`, `maxScore`.
    - `breakdown` mapped from item scores.
    - `$inc: { attemptVersion: 1 }`.
9. Best-effort clear scheduled expiry via `clearAttemptExpiry`.
10. Emit `AttemptFinalized` event with the full updated doc via `emitAttemptEvent`.
11. Determine privilege:
- Admin if `req.user.isAdmin` or role `"admin"`.
- Teacher if role `"teacher"`.
- `isPrivileged = admin || teacher`.
1. Query `shouldShowAnswersForAttempt` (class-svc/policy) to see if student should see answers.
- `answersAvailable = isPrivileged ? true : !!canShow`.
1. Snapshot redaction:
- `snapshotRaw = updated.quizVersionSnapshot`.
- If not privileged and `!canShow`, call `redactGradingKey(snapshotRaw)` to strip grading keys.
- Replace snapshot in response with redacted version.
1. For non-privileged and `!canShow`, also drop `breakdown` from response.
2. Enrich response with live quiz metadata via `getLiveMetaForRoot(quizRootId)`, computing:
- `name`, `subject`, `subjectColorHex`, `topic`, `quizType`, `typeColorHex`, `contentHash`.
- Attach under `responseDoc.quiz`.
1. Return `ok: true`, `answersAvailable`, and full attempt doc (with any necessary redaction).

**Success (200)**:

```json
{
  "ok": true,
  "answersAvailable": boolean,
  "data": {
    "...": "Attempt fields (possibly with redacted breakdown and snapshot)",
    "quiz": {
      "quizId": string,
      "name": string | null,
      "subject": string | null,
      "subjectColorHex": string | null,
      "topic": string | null,
      "quizType": string | null,
      "typeColorHex?": string,
      "contentHash": string | null
    },
    "answersAvailable": boolean
  }
}
```

**Errors**:

- `400` – Invalid `attemptId` or unknown quiz type.
- `404` – Attempt not found.
- `409` – Attempt already finalized.
- `500` – Server error.

---

### 17.5 `GET /attempt/:attemptId` – Get attempt by id

**Auth**: `verifyAccessToken + verifyAttemptOwnerOrPrivileged`

**Params**:

- `attemptId`.

**Behaviour**:

1. Validate `attemptId`; else `400`.
2. Load attempt; if not found → `404`.
3. Determine `quizType` from snapshot or fallback, and compute `typeColorHex`.
4. Determine privilege (admin/teacher vs student).
5. Extract `snapshotRaw` from `quizVersionSnapshot`.
6. Call `shouldShowAnswersForAttempt(doc, isPrivileged)`.
    - `answersAvailable = isPrivileged ? true : !!canShow`.
7. If not privileged and `!canShow`, redact snapshot via `redactGradingKey` and drop `breakdown`.
8. Enrich with live metadata via `getLiveMetaForRoot(quizRootId)` and attach under `data.quiz`.
9. Attach `answersAvailable` to `data`.
10. Return `ok: true, data`.

**Success (200)**:

```json
{
  "ok": true,
  "data": {
    "...": "Attempt fields (possibly redacted)",
    "answersAvailable": boolean,
    "quiz": {
      "quizId": string,
      "name": string | null,
      "subject": string | null,
      "subjectColorHex": string | null,
      "topic": string | null,
      "quizType": string | null,
      "typeColorHex?": string,
      "contentHash": string | null
    }
  }
}
```

**Errors**:

- `400` – Invalid `attemptId`.
- `404` – Not found.
- `500` – Server error.

---

### 17.6 `GET /attempt/my` – List attempts for current student (paginated)

**Auth**: `verifyAccessToken`

**Query**:

```json
{
  "page?": number,
  "pageSize?": number
}
```

**Behaviour**:

1. Require `userId`; else `401`.
2. Normalize paging:
    - `page ≥ 1` (default 1).
    - `pageSize` in `[1, 100]` (default 20).
3. Filter: `{ studentId: userId }`.
4. Compute `total` via `countDocuments`.
5. Fetch page of attempts:
    - `find(filter)`
    - `select` subset of fields (identity, times, scores, version, etc.).
    - `sort({ startedAt: -1 })`.
    - Apply `skip` / `limit`.
6. Fetch live quiz meta for all rows via `getLiveMetaMapFromRows(rows)`.
7. For each row, attach `quiz` object:
    - `quizId`, `name`, `subject`, `subjectColorHex`, `topic`, `quizType`, `typeColorHex`, `contentHash`.
    - Current implementation does not select snapshot quizType/contentHash in this endpoint, so these typically return `null`/`undefined`.
8. Return `rows`, `page`, `pageCount`, `total`.

**Success (200)**:

```json
{
  "ok": true,
  "rows": AttemptRow[],
  "page": number,
  "pageCount": number,
  "total": number
}
```

**Errors**:

- `401` – Unauthenticated.
- `500` – Server error.

---

### 17.7 `GET /attempt/student/:studentId` – List attempts for a student (teacher view)

**Auth**: `verifyAccessToken + verifyTeacherOfStudent`

**Params**:

- `studentId`.

**Query**:

```json
{
  "page?": number,
  "pageSize?": number
}
```

**Behaviour**:

1. Validate `studentId` as ObjectId; else `400`.
2. Paging as above.
3. Filter: `{ studentId }`.
4. Count `total`, then fetch page:
    - Selects core attempt fields plus snapshot meta fields.
    - Sorted by `startedAt DESC`.
5. Use `getLiveMetaMapFromRows` to get up-to-date quiz meta.
6. Map each row into a teacher-friendly shape with `quiz` object (live meta + snapshot contentHash/type).
7. Return `rows`, `page`, `pageCount`, `total`.

**Success (200)**:

```json
{
  "ok": true,
  "rows": AttemptRow[],
  "page": number,
  "pageCount": number,
  "total": number
}
```

**Errors**:

- `400` – Invalid `studentId`.
- `401/403` – Handled by middleware.
- `500` – Server error.

---

### 17.8 `GET /attempt/quiz/schedule/:scheduleId` – List attempts by schedule (teacher view)

**Auth**: `verifyAccessToken + verifyTeacherOfSchedule`

**Params**:

- `scheduleId`.

**Query**:

```json
{
  "page?": number,
  "pageSize?": number
}
```

**Behaviour**:

1. Validate `scheduleId`; else `400`.
2. Parse paging params (`page`, `pageSize`) for response metadata.
3. Filter: `{ scheduleId }`.
4. Count `total`.
5. Current implementation fetches matching attempts without `skip/limit` (full result set) and without explicit sort.
6. Join live meta via `getLiveMetaMapFromRows`.
7. Map into rows with `quiz` object (similar shape as other list endpoints).
8. Return `rows` plus computed `page/pageCount/total` metadata.

**Success (200)**:

```json
{
  "ok": true,
  "rows": AttemptRow[],
  "page": number,
  "pageCount": number,
  "total": number
}
```

**Errors**:

- `400` – Invalid `scheduleId`.
- `401/403` – Handled by middleware.
- `500` – Server error.

### 17.9 `DELETE /attempt/:attemptId` – Soft-invalidate attempt

**Auth**: `verifyAccessToken + verifyTeacherOfAttemptStudent`

**Params**:

- `attemptId`.

**Behaviour**:

1. Validate `attemptId`; else `400`.
2. `findByIdAndUpdate`:
    - `$set: { state: "invalidated" }`.
    - `$inc: { attemptVersion: 1 }`.
    - Return updated doc.
3. If not found → `404`.
4. Best-effort clear expiry via `clearAttemptExpiry`.
5. Emit `AttemptInvalidated` event via `emitAttemptEvent`.
6. Return updated attempt.

**Success (200)**:

```json
{
  "ok": true,
  "data": AttemptDoc
}
```

**Errors**:

- `400` – Invalid `attemptId`.
- `404` – Not found.
- `500` – Server error.

---

## 18. Attempt Analytics & Internal APIs

### 18.1 `POST /attempt/internal/scheduled-quiz-stats`

**Auth**: S2S via `x-quiz-secret` (`sharedSecret()`)

**Route**: `/attempt/internal/scheduled-quiz-stats`

**Body**:

```json
{
  "scheduleId": "string(ObjectId)",
  "attemptIds": ["string(ObjectId)", "..."],   // canonical attempts for schedule
  "classId?": "string(ObjectId)",
  "quizId?": "string(ObjectId)",
  "openAnswerMinPct?": number
}
```

**Behaviour**:

1. Verify shared secret; else `401`.
2. Validate:
    - `scheduleId` is a valid ObjectId.
    - `attemptIds` is a non-empty array of valid ObjectIds.
    - If present, `classId` and `quizId` are valid ObjectIds.
3. Resolve `quizId`:
    - Use body `quizId` if valid.
    - Else, peek `AttemptModel.findOne({ _id: attemptIds[0] }, { quizId: 1 })`.
    - If not found → `404`.
4. Load quiz base via `QuizBaseModel.findById(quizId)`; extract `quizType`.
    - If not found → `404`.
    - Resolve type definition; if unsupported → `400`.
5. Load full typed quiz doc via `def.Model.findById(quizId)`. If not found → `404`.
6. Resolve schedule-anchored quiz shape via `resolveQuizForSchedule({ scheduleId, quizDoc, def })`.
    - Ensures randomized quiz types aggregate against the same persisted variant used for attempts.
7. Load attempts:
    - `_id ∈ attemptIds`.
    - `state = "finalized"`.
    - `scheduleId` matches.
    - `quizId` matches.
    - `classId` matches if provided.
    - Select a grading-relevant subset of fields.
    - Log any `attemptIds` that are excluded.
8. Map into aggregate-ready shape:
    - `_id`, `studentId`, `score`, `maxScore`, `finishedAt`, `answers`, `breakdown`.
9. If `def.aggregateScheduledQuiz` is not defined:
    - Return `{ kind: def.type, attemptsCount, breakdown: null }`.
10. Otherwise, call `def.aggregateScheduledQuiz` with:
    - `quizDoc: quizDocForSchedule`, `quizType`, `attempts`, and optional `openAnswerMinPct`.
11. Respond with:
    - `kind` (aggregation type).
    - `attemptsCount`.
    - `breakdown` data.

**Success (200)**:

```json
{
  "ok": true,
  "data": {
    "kind": string,
    "attemptsCount": number,
    "breakdown": any
  }
}
```

**Errors**:

- `400` – Invalid/missing inputs (including empty `attemptIds`).
- `401` – Secret mismatch.
- `404` – Quiz or attempt not found when resolving.
- `500` – Internal error.

---

### 18.2 `GET /attempt/schedule/:scheduleId/student/:studentId` – Attempts for one student under a schedule (teacher/self)

**Auth**: `verifyAccessToken + verifyTeacherOfStudentOrSelf`

**Params**:

- `scheduleId`
- `studentId`

**Behaviour**:

1. Validate `scheduleId` and `studentId` as ObjectIds; else `400`.
2. Filter attempts by both `scheduleId` and `studentId`.
3. Fetch attempts with selected core fields + snapshot meta.
4. Sort by `finishedAt DESC`, then `startedAt`, then `createdAt`.
5. Resolve live meta via `getLiveMetaMapFromRows`.
6. Map each row to include `quiz` object (preferring live meta, fallback snapshot).
7. Return `{ ok, rows }`.

**Success (200)**:

```json
{ "ok": true, "rows": AttemptRow[] }
```

**Errors**:

- `400` – Invalid ids.
- `500` – Server error.

---

### 18.3 `POST /attempt/internal/student` – All attempts for a student (internal)

**Auth**: S2S via `x-quiz-secret`

**Body**:

```json
{ "studentId": "string(ObjectId)" }
```

**Behaviour**:

1. Verify shared secret; else `401`.
2. Validate `studentId`; else `400`.
3. Filter attempts by `studentId`.
4. Compute `total`.
5. Fetch all matching attempts, sorted by recency.
6. Join live meta via `getLiveMetaMapFromRows`.
7. Map to rows with `quiz` object (similar to teacher list).
8. Return `rows`, `total`, and `truncated = rows.length < total` (currently always `false` since not paginated).

**Success (200)**:

```json
{
  "ok": true,
  "rows": AttemptRow[],
  "total": number,
  "truncated": boolean
}
```

**Errors**:

- `400` – Invalid `studentId`.
- `401` – Unauthorized (secret mismatch).
- `500` – Server error.

---

### 18.4 `POST /attempt/internal/schedule-student` – All attempts for (schedule, student) pair

**Auth**: S2S via `x-quiz-secret`

**Body**:

```json
{
  "scheduleId": "string(ObjectId)",
  "studentId": "string(ObjectId)"
}
```

**Behaviour**:

1. Verify shared secret; else `401`.
2. Validate `scheduleId` and `studentId`; else `400`.
3. Filter: `{ scheduleId, studentId }`.
4. Fetch attempts (not paginated), sorted by recency.
5. Join live meta and map each row into shape with `quiz` object.
6. Return `{ ok, rows }`.

**Success (200)**:

```json
{ "ok": true, "rows": AttemptRow[] }
```

**Errors**:

- `400` – Invalid ids.
- `401` – Secret mismatch.
- `500` – Server error.

---

## 19. Quiz Metadata APIs (Subjects & Topics)

### 19.1 `GET /quiz/meta` – Get my quiz metadata

**Auth**: `verifyAccessToken`

**Behaviour**:

1. Require `owner = req.user.id`; else `401`.
2. Look up `UserQuizMetaModel.findOne({ owner })`.
3. Convert to payload via `toPayload(doc)`:
    - `subjects: { label, colorHex }[]`.
    - `topics: { label }[]`.
    - `types`: static registry-derived list (`basic`, `rapid`, `crossword`, …) with labels and colors.
4. If no doc exists yet, `subjects` and `topics` are returned as empty arrays (while `types` is always present).

**Success (200)**:

```json
{
  "ok": true,
  "subjects": Array<{ "label": string, "colorHex": string }>,
  "topics": Array<{ "label": string }>,
  "types": Array<{ "label": string, "value": string, "colorHex": string }>
}
```

**Errors**:

- `401` – Unauthenticated.
- `500` – Server error.

---

### 19.2 `POST /quiz/meta` – Add subject/topic

**Auth**: `verifyAccessToken`

**Body**:

```json
{
  "kind": "subject" | "topic",
  "label": "string",
  "colorHex?": "string"   // subjects only
}
```

**Behaviour**:

1. Require `owner = req.user.id`; else `401`.
2. Log for observability.
3. Normalize:
    - `kind` as `"subject"` or `"topic"`.
    - `label = trim(label)`.
4. If `!kind || !label` → `400`.
5. Fetch existing meta doc for owner.

**Case A – No existing meta doc**:

- If `kind === "subject"`:
    - Normalize `colorHex`:
        - If provided, ensure leading `#`.
        - Else derive via `stringToColorHex(label)`.
    - Create doc with:
        - `subjects: [{ label, colorHex }]`.
        - `topics: []`.
- If `kind === "topic"`:
    - Create doc with:
        - `subjects: []`.
        - `topics: [{ label }]`.
- Return `201` and payload via `toPayload`.

**Case B – Meta doc exists**:

- For `kind === "subject"`:
    - Search for existing subject by label (case-insensitive via `sameLabel`).
    - If found:
        - If `colorHex` provided, normalize (add `#` if missing) and update that subject’s color.
        - Save doc.
    - If not found:
        - Derive color (provided or `stringToColorHex(label)`).
        - Push new subject and save.
- For `kind === "topic"`:
    - Check if topic exists (`sameLabel`).
    - If not, push new topic and save.
- Return `200` with updated payload (`toPayload`).

**Success (200/201)**:

```json
{
  "ok": true,
  "subjects": [...],
  "topics": [...],
  "types": [...]
}
```

**Errors**:

- `400` – Missing kind/label.
- `401` – Unauthenticated.
- `500` – Server error.

---

### 19.3 `PATCH /quiz/meta/:kind/:value` – Edit subject/topic

**Auth**: `verifyAccessToken`

**Params**:

- `kind`: `"subject"` | `"topic"`.
- `value`: current label to edit.

**Body**:

```json
{
  "label?": "new label",
  "colorHex?": "new color"   // only used for subjects
}
```

**Behaviour**:

1. Require `owner = req.user.id`; else `401`.
2. Validate `kind` and `value.trim()`. If invalid → `400`.
3. Guard against invalid `kind` at runtime (must be `"subject"` or `"topic"`).
4. Parse `newLabel = body.label?.trim()` and `colorHex`.
5. If neither `newLabel` nor `colorHex` is provided → `400 "Nothing to update"`.
6. Load user meta doc; if missing → `404`.

**Subject path (`kind === "subject"`)**:

1. Find subject index by `sameLabel(label, oldLabel)`. If not found → `404`.
2. On rename:
    - Ensure no other subject has the same new label (case-insensitive) → if so, `409`.
3. Normalize color patch (if provided):
    - Ensure leading `#`.
4. Apply changes to meta doc and `save()`.
5. Compute `nextLabel` and `nextHex` after save.
6. Cascade to quizzes:
    - If label changed:
        - `QuizBaseModel.updateMany({ owner, subject: oldLabel }, { $set: { subject: nextLabel, subjectColorHex?: nextHex } })`.
    - Else if only color changed:
        - `QuizBaseModel.updateMany({ owner, subject: nextLabel }, { $set: { subjectColorHex: nextHex } })`.
7. Return updated payload.

**Topic path (`kind === "topic"`)**:

1. Locate topic index by `sameLabel`; if not found → `404`.
2. Require `newLabel` (no color support); else `400`.
3. Ensure no duplicate topic label; else `409`.
4. Update topic label and save meta doc.
5. Cascade rename to quizzes:
    - `QuizBaseModel.updateMany({ owner, topic: oldLabel }, { $set: { topic: newLabel } })`.
6. Return updated payload.

**Success (200)**:

```json
{
  "ok": true,
  "subjects": [...],
  "topics": [...],
  "types": [...]
}
```

**Errors**:

- `400` – Missing kind/value, invalid kind, or empty patch.
- `401` – Unauthenticated.
- `404` – Meta doc/item not found.
- `409` – Duplicate label conflict.
- `500` – Server error.

---

### 19.4 `DELETE /quiz/meta/:kind/:value` – Delete subject/topic

**Auth**: `verifyAccessToken`

**Params**:

- `kind`: `"subject"` | `"topic"`.
- `value`: label to delete.

**Behaviour**:

1. Require `owner = req.user.id`; else `401`.
2. Validate `kind` and `value.trim()`; else `400`.
3. Compute `label = trim(value)`.
4. Determine field:
    - `field = "subject"` if `kind === "subject"`.
    - `field = "topic"` if `kind === "topic"`.
5. Count quizzes referencing this label:
    - `QuizBaseModel.countDocuments({ owner, [field]: label })`.
6. If `inUse > 0`:
    - Return `409` with:
        
        ```json
        {
          "ok": false,
          "message": "Cannot delete ... while N quiz(es) reference it.",
          "inUse": true,
          "count": inUse
        }
        ```
        
7. Build `$pull` patch:
    - For subjects: `{ $pull: { subjects: { label } } }`.
    - For topics: `{ $pull: { topics: { label } } }`.
8. Apply `findOneAndUpdate({ owner }, patch, { new: true })` on `UserQuizMetaModel`.
9. Return updated payload.

**Success (200)**:

```json
{
  "ok": true,
  "subjects": [...],
  "topics": [...],
  "types": [...]
}
```

**Errors**:

- `400` – Missing params.
- `401` – Unauthenticated.
- `409` – Cannot delete while referenced (includes `count`).
- `500` – Server error.

---

### 19.5 `POST /quiz/meta/internal/bootstrap` – Ensure default meta for an owner

**Auth**: S2S via `x-quiz-secret`.

**Body**:

```json
{ "ownerId": "string" }
```

**Behaviour**:

1. Compares `x-quiz-secret` header to `sharedSecret()`; mismatch returns `401`.
2. Requires `ownerId`; else `400`.
3. Upserts the owner’s `UserQuizMetaModel` if missing.
4. Ensures defaults exist (without overwriting existing labels/colors):
    - Subjects: `Math` (`#ef4444`), `English` (`#3b82f6`), `Science` (`#22c55e`).
    - Topics: `Arithmetic`.
5. Returns whether the doc was created and whether defaults were added.

**Success (200)**:

```json
{
  "ok": true,
  "created": false,
  "updated": true,
  "addedSubjects": ["Math"],
  "addedTopics": []
}
```

**Errors**:

- `400` – Missing `ownerId`.
- `401` – Secret mismatch.
- `500` – Server error.

---
