## 12. Class Service APIs

---

### 12.1 `GET /` — Health check

**Auth**: Public.

**Behaviour**:
Returns a simple JSON payload indicating that the class-service is up.

**Success (200)**:

```json
{ "message": "Hello World from class-service" }
```

**Errors**: None (beyond generic 5xx on server failure).

---

### 12.2 `POST /classes` — Create class + seed roster stats

**Auth**: `verifyAccessToken` (any authenticated user; typically a teacher).

**Body** (shape, not exhaustive):

```json
{
  "name": "Class 1A",
  "level": "Primary 3",
  "timezone": "Asia/Singapore",
  "image": {
    "url": "https://.../my-class.png",
    "filename": "my-class.png"
  },
  "students": [
    { "name": "Alice Tan", "username": "alice01", "email": "alice@example.com" }
  ],
  "metadata": {
    "stream": "Gifted",
    "notes": "Any extra arbitrary config"
  },
  "includePasswords": true
}
```

**Behaviour**:

1. Validates class fields via `validateClassInput`. Any `schedule` in the payload is ignored (new classes always start with an empty schedule).
2. Optionally calls User Service `bulkCreateStudents` for `students` and collects the created user ids.
3. In a MongoDB transaction:
    - Creates the Class document with:
        - `owner = req.user.id`
        - `teachers = [owner]`
        - `students[]` seeded from the created user accounts.
        - `schedule = []`.
    - Seeds `StudentClassStats` rows for each student (analytics buckets only).
4. Builds `issuedCredentials` only when `includePasswords` is truthy and User Service returned temporary passwords.
5. On any failure after students were created in user-svc, performs best-effort compensation via `bulkDeleteStudents`.

**Success (201)**:

```json
{
  "ok": true,
  "data": { /* Class document (lean) */ },
  "issuedCredentials": [
    {
      "userId": "...",
      "name": "Alice Tan",
      "username": "alice01",
      "email": "alice@example.com",
      "temporaryPassword": "..."
    }
  ]
}
```

(`issuedCredentials` omitted when `includePasswords` is false or no passwords were issued.)

**Errors**:

- `400` – Validation failure (`fieldErrors` included, e.g. for name/level/timezone).
- `401` – Missing/invalid auth (no `req.user.id`).
- `400`/`409`/`502` – Upstream user-svc failure during `bulkCreateStudents` (status bubbled).
- `500` – Internal server error (including failed MongoDB transaction).

---

### 12.3 `PUT /classes/:id` — Update class metadata

**Auth**: `verifyAccessToken` + `verifyClassOwnerOrAdmin`.

**Params**:

- `:id` – Class id.

**Body**:

```json
{
  "name": "New Class Name",
  "level": "Primary 4",
  "image": { "url": "https://.../img.png", "filename": "img.png" },
  "metadata": { "...": "..." },
  "timezone": "Asia/Singapore"
}
```

**Behaviour**:

1. Validates the body via `validateClassInput` (metadata-only; schedule in payload is ignored).
2. Loads the existing class; returns 404 if not found.
3. In a transaction:
    - Applies metadata fields (`name`, `level`, `image`, `metadata`, `timezone`) via `$set`.
    - If `name` changed, propagates it to `students.$[].className`.
4. Returns the updated class.

**Success (200)**:

```json
{ "ok": true, "data": { /* updated Class document */ } }
```

**Errors**:

- `400` – Validation errors (`fieldErrors`).
- `401`/`403` – Failing auth/ACL via middleware.
- `404` – Class not found.
- `500` – Internal server error.

---

### 12.4 `DELETE /classes/:id` — Delete class + stats (+ best-effort student deletion)

**Auth**: `verifyAccessToken` + `verifyClassOwnerOrAdmin`.

**Params**:

- `:id` – Class id.

**Query**:

- `force?=true|false` – If `true`, will proceed with local deletion even if User Service deletions fail or are partial.

**Behaviour**:

1. Loads the class; if not found → 404.
2. Collects all `studentIds` from the roster.
3. Attempts `bulkDeleteStudents(studentIds)` in User Service:
    - If not all students deleted and `force=false`, abort and return 502 + upstream body.
    - If `force=true`, logs partial failure and continues.
4. In a MongoDB transaction, deletes:
    - `StudentClassStats` for this class.
    - `ScheduleStats` for this class.
    - `ClassAttemptModel` rows for this class.
    - The Class document itself.
5. Returns the deleted class (lean).

**Success (200)**:

```json
{ "ok": true, "data": { /* deleted Class document */ } }
```

**Errors**:

- `404` – Class not found.
- `502` or upstream 4xx/5xx – User Service bulk deletion failure when `force=false`.
- `500` – Internal server error.

---

### 12.5 `GET /classes/:id` — Get class with derived analytics

**Auth**: `verifyAccessToken` + `verifyClassOwnerOrAdmin`.

**Params**:

- `:id` – Class id.

**Behaviour**:

1. Loads the class; if not found → 404.
2. Calls `deriveClassStats(id)` to compute a full stats document (`statsDoc`) derived from student analytics rows + class data.
3. Returns the class (with `statsDoc`).

**Success (200)**:

```json
{
  "ok": true,
  "data": {
    /* class fields ... */,
    "statsDoc": { /* derived class stats */ }
  }
}
```

**Errors**:

- `404` – Class not found.
- `500` – Internal server error.

---

### 12.6 `GET /classes` — Admin: list all classes (light projection)

**Auth**: `verifyAccessToken` + `verifyIsAdmin`.

**Behaviour**:

1. Reads all classes, omitting heavy fields (`students`, `schedule`).
2. Returns the list.

**Success (200)**:

```json
{ "ok": true, "data": [ { /* Class (light) */ }, ... ] }
```

**Errors**:

- `401`/`403` – Not authenticated / not admin.
- `500` – Internal server error.

---

### 12.7 `GET /classes/my` — My classes (owner/teacher)

**Auth**: `verifyAccessToken`.

**Behaviour**:

1. Resolves `userId = req.user.id`. If missing → 401.
2. Aggregates classes where `owner == userId` or `teachers` contains `userId`.
3. Projects:
    - Basic class metadata.
    - `studentCount = size(students)`.

**Success (200)**:

```json
{
  "ok": true,
  "data": [
    {
      "_id": "...",
      "name": "Class 1A",
      "level": "P3",
      "image": { /* ... */ },
      "owner": "...",
      "teachers": ["..."],
      "metadata": { /* ... */ },
      "timezone": "Asia/Singapore",
      "createdAt": "...",
      "updatedAt": "...",
      "studentCount": 32
    }
  ]
}
```

**Errors**:

- `401` – Unauthorized (no `req.user.id`).
- `500` – Internal server error.

---

### 12.8 `GET /classes/:id/stats` — Derived class stats (participation + grades)

**Auth**: `verifyAccessToken` + `verifyClassOwnerOrAdmin`.

**Params**:

- `:id` – Class id.

**Behaviour**:

1. In parallel:
    - Derives class totals & bySubject via `deriveClassStats(id)`.
    - Loads class schedule (to count eligible assigned quizzes).
    - Loads `StudentClassStats` rows for per-student aggregates.
2. Defines:
    - `eligibleAssigned` = number of schedules where `startDate <= now`.
    - Per-student participation pct: `min(participationCount, eligibleAssigned) / eligibleAssigned`.
    - Per-student average score pct: `sumScore / sumMax`.
3. Computes:
    - `overallParticipation.headcountPct` = students with any participation / total students.
    - `overallParticipation.avgStudentPct` = mean of per-student participationPct.
    - `overallGrades.weightedAvgPct` = `(totals.sumScore / totals.sumMax) * 100`.
    - `overallGrades.avgStudentAvgScorePct` = mean of per-student average score pct.
    - `averageGradesBySubject[subject]` = `(sumScore / sumMax) * 100` per subject.

**Success (200)**:

```json
{
  "ok": true,
  "data": {
    "overallParticipation": {
      "headcountPct": 85,
      "avgStudentPct": 76
    },
    "overallGrades": {
      "weightedAvgPct": 72,
      "avgStudentAvgScorePct": 68
    },
    "averageGradesBySubject": {
      "Math": 75,
      "Science": 70
    }
  }
}
```

**Errors**:

- `404` – Class not found.
- `500` – Internal server error.

---

### 12.9 Removed Endpoint

`GET /classes/:id/top` has been removed from class-service.

Leaderboard, streak, and score-ranking APIs are owned by game-service.

Use `GET /game/classes/:classId/leaderboard` from game-service instead.

---

### 12.10 `POST /upload` — Upload class image

**Auth**: `verifyAccessToken`.

**Body**:

- `multipart/form-data` with one file field handled by `uploadClassImages` (first file is used).

**Behaviour**:

1. Validates that a file was uploaded; if none, returns `400`.
2. Builds public URL:
    - Uses `IMAGE_UPLOAD_URL` when configured.
    - Else falls back to `${req.protocol}://${req.get("host")}/uploads`.
3. Returns file metadata for immediate UI use.

**Success (200)**:

```json
{
  "ok": true,
  "data": {
    "url": "https://.../uploads/<stored-filename>",
    "filename": "original-name.png",
    "mimetype": "image/png",
    "size": 12345,
    "path": "uploads/<stored-filename>"
  }
}
```

**Errors**:

- `400` – No file uploaded.
- `401` – Missing/invalid token.
- `500` – Upload/storage error.

---

## 13. Class–Student APIs (`/classes/:id/students`)

---

### 13.1 `POST /classes/:id/students` — Bulk add students to class

**Auth**: `verifyAccessToken` + `verifyClassOwnerOrAdmin`.

**Params**:

- `:id` – Class id.

**Query**:

- `includePasswords?=true|false` – Overrides body flag.

**Body**:

```json
{
  "students": [
    { "name": "Alice", "username": "alice01", "email": "alice@example.com" },
    { "name": "Bob", "username": "bob02" }
  ],
  "includePasswords": true,
  "defaultStudentPhotoUrl": "https://.../default-student.png"
}
```

**Behaviour**:

1. Validates the block via `validateStudentsBlock` (shape, email, duplicate usernames).
2. Loads the class; returns 404 if not found.
3. Calls User Service `bulkCreateStudents(normalized)` with `includePasswords` (query takes precedence over body).
4. If none created, returns the current roster unchanged.
5. In a transaction:
    - Dedupes against existing `students.userId`.
    - Appends new roster entries using `toClassStudent`, seeding display name, className and photoUrl.
    - Inserts matching `StudentClassStats` rows with zeros and empty aggregates.
6. After commit, best-effort deletes any created-but-not-added user accounts (orphans).
7. Builds `issuedCredentials` only for added students with temporary passwords.

**Success (200)**:

```json
{
  "ok": true,
  "data": [ /* updated students[] */ ],
  "issuedCredentials": [
    {
      "userId": "...",
      "username": "alice01",
      "email": "alice@example.com",
      "name": "Alice",
      "temporaryPassword": "..."
    }
  ]
}
```

(If no new students were added due to dedupe, `data` is the existing roster and no credentials are returned.)

**Errors**:

- `400` – Validation errors (`errors.students` array with per-row issues).
- `404` – Class not found.
- `409`/`400`/`502` – Upstream user-svc row errors / failure (status bubbled).
- `500` – Internal server error (with compensation applied to created accounts).

---

### 13.2 `DELETE /classes/:id/students/:studentId` — Remove student from class

**Auth**: `verifyAccessToken` + `verifyClassOwnerOrAdmin`.

**Params**:

- `:id` – Class id.
- `:studentId` – Student user id.

**Behaviour**:

1. Loads the class and checks that `studentId` exists in `students.userId`; if not → 404.
2. Calls the User Service single-student delete endpoint (`/student/users/:studentId`) via `deleteStudentInUserSvc`:
    - Treats 404 from user-svc as success (already deleted).
    - On other non-2xx, returns upstream status/message.
3. Removes the student from the class roster (`$pull`) and deletes their `StudentClassStats` row for this class.
4. Returns the updated class.

**Success (200)**:

```json
{ "ok": true, "data": { /* updated Class document */ } }
```

**Errors**:

- `404` – Class not found or student not in class.
- `4xx`/`5xx` – User Service error (status bubbled, except 404).
- `500` – Internal server error.

---

### 13.3 `GET /classes/:id/students` — List students with analytics stats

**Auth**: `verifyAccessToken` + `verifyClassOwnerOrAdmin`.

**Params**:

- `:id` – Class id.

**Behaviour**:

1. Loads the class with:
    - `students`,
    - `schedule`,
    - populated `students.statsDoc` filtered by `classId`.
2. Determines `eligibleAssigned` = schedules where `startDate <= now`.
3. For each student, computes:
    - `participationPct`, `avgScorePct` via `computeParticipationAndAvgScore`.
4. Sorts by `displayName` ascending.

**Success (200)**:

```json
{
  "ok": true,
  "data": [
    {
      "userId": "...",
      "displayName": "Alice",
      "photoUrl": "https://...",
      "className": "Class 1A",
      "participationPct": 80,
      "avgScorePct": 72
    }
  ]
}
```

**Errors**:

- `404` – Class not found.
- `500` – Internal server error.

---

### 13.4 `GET /classes/:id/students/:studentId` — Student detail within a class

**Auth**: `verifyAccessToken` + `verifyTeacherOfStudent`.

**Params**:

- `:id` – Class id.
- `:studentId` – Student user id or `"me"`.

**Behaviour**:

1. Resolves `studentId = "me" ? req.user.id : param`.
2. Loads the class (name, schedule, timezone) with `students` populated with `statsDoc` (scoped by class).
3. Locates the student in the roster; 404 if missing.
4. Computes:
    - `participationPct`, `avgScorePct` via `computeParticipationAndAvgScore`, using class schedule to count eligible assigned.
5. Converts `bySubject` / `byTopic` maps to plain objects.
6. Computes `subjectsAvgPct` and `topicsAvgPct` via `computeBucketAvgPct`.
7. Fetches subject color palette via `fetchMyQuizMeta` (best-effort) and attaches `color` per subject.
8. Returns `stats.canonicalBySchedule` for canonical attempt analytics by schedule.

**Success (200)**:

```json
{
  "ok": true,
  "data": {
    "userId": "...",
    "displayName": "Alice",
    "photoUrl": "https://...",
    "className": "Class 1A",
    "stats": {
      "classId": "...",
      "studentId": "...",
      "sumScore": 150,
      "sumMax": 200,
      "participationCount": 8,
      "participationPct": 80,
      "avgScorePct": 75,
      "canonicalBySchedule": {
        "schedule-id": {
          "attemptId": "attempt-id",
          "score": 18,
          "maxScore": 20,
          "finishedAt": "2025-11-24T..."
        }
      },
      "bySubject": {
        "Math": { "attempts": 5, "sumMax": 50, "sumScore": 40, "color": "#..." }
      },
      "byTopic": { /* ... */ },
      "subjectsAvgPct": { "Math": 80 },
      "topicsAvgPct": { /* ... */ },
      "subjectColors": { "Math": "#..." },
      "version": 2,
      "updatedAt": "2025-11-24T..."
    }
  }
}
```

**Errors**:

- `404` – Class or student not found.
- `500` – Internal server error.

---

### 13.5 `GET /classes/:id/students/:studentId/schedule-summary` — Per-class schedule summary (teacher)

**Auth**: `verifyAccessToken` + `verifyTeacherOfStudent`.

**Params**:

- `:id` – Class id.
- `:studentId` – Student user id.

**Query** (all optional):

- `name` – Fuzzy substring match on quiz name (case-insensitive).
- `subject` – Exact subject filter (case-insensitive).
- `topic` – Exact topic filter.
- `latestFrom` – ISO datetime; filter by latest attempt time ≥ this.
- `latestTo` – ISO datetime; filter by latest attempt time ≤ this.

**Behaviour**:

1. Validates ids; returns 400 if not valid ObjectIds.
2. Loads the class (name + students) and checks that `studentId` is on roster; if not → 404.
3. Loads the student’s `StudentClassStats` for `(classId, studentId)` and extracts `canonicalBySchedule`.
4. Fetches all attempts for the student via `fetchStudentAttemptsInternal(studentId)`.
5. Filters attempts to this class (`classId == :id`) and only those with a `scheduleId`.
6. Groups attempts by `scheduleId`, computing:
    - A list of attempts.
    - The `latest` attempt (by finishedAt / startedAt / createdAt).
7. Prunes any `scheduleId` not present in the class’s embedded `schedule` array (ghost schedules).
8. For each schedule, builds a row with:
    - Quiz meta from attempt snapshot (name, subject, subjectColorHex, topic).
    - `latestAttemptId` + `latestAt`.
    - `attemptsCount`.
    - `canonical` block (if present) with `attemptId`, `score`, `maxScore`, `gradePct`.
9. Applies filters via `applyFilters` using name, subject, topic, latestFrom, latestTo.

**Success (200)**:

```json
{
  "ok": true,
  "data": {
    "classId": "...",
    "studentId": "...",
    "schedules": [
      {
        "scheduleId": "...",
        "quizName": "Fractions Revision",
        "subject": "Math",
        "subjectColorHex": "#...",
        "topic": "Fractions",
        "latestAttemptId": "...",
        "latestAt": "2025-11-24T...",
        "attemptsCount": 3,
        "canonical": {
          "attemptId": "...",
          "score": 18,
          "maxScore": 20,
          "gradePct": 90
        }
      }
    ]
  }
}
```

**Errors**:

- `400` – Invalid ids.
- `404` – Class not found or student not in class.
- `502` – Upstream quiz-svc error (auth/other 4xx/5xx).
- `500` – Internal server error.

---

### 13.6 `GET /classes/:id/students-roster` — Lightweight class roster for members

**Auth**: `verifyAccessToken` + `verifyClassMemberOrAdmin`.

**Params**:

- `:id` – Class id.

**Behaviour**:

1. Validates class id and membership access.
2. Returns a lightweight roster payload intended for student-facing classmate views.
3. Includes essential identity/display fields (for example `studentId`, name/display name, photo/avatar references when available), without full analytics payload.

**Success (200)**:

```json
{
  "ok": true,
  "data": [
    {
      "studentId": "65f2...",
      "name": "Alice Tan",
      "username": "alice01",
      "photoUrl": "/uploads/..."
    }
  ]
}
```

**Errors**:

- `400` – Invalid class id.
- `403` – Not a class member/admin.
- `404` – Class not found.
- `500` – Internal server error.

---

## 14. Schedule APIs (`/classes/:id/schedule` and `/classes/schedule/*`)

---

### 14.1 `POST /classes/:id/schedule` — Create schedule item

**Auth**: `verifyAccessToken` + `verifyClassOwnerOrAdmin`.

**Params**:

- `:id` – Class id.

**Body** (shape):

```json
{
  "quizRootId": "root-quiz-id",
  "quizVersion": 1,
  "startDate": "2025-11-25T08:00:00.000Z",
  "endDate": "2025-11-25T09:00:00.000Z",
  "contribution": 100,
  "attemptsAllowed": 1,
  "showAnswersAfterAttempt": false,
  "extra": {
    "notes": "Optional arbitrary extra fields"
  }
}
```

**Behaviour**:

1. Loads class (via `loadClassById`) and extracts its timezone.
2. Validates schedule payload via `validateScheduleCreate` with class timezone.
3. Normalizes:
    - `contribution` default = 100 if invalid/non-positive.
    - `attemptsAllowed` clamped to [1, 10].
4. Uses canonical quiz identity (`quizRootId`, `quizVersion`) and calls `fetchQuizMetaOnce` to resolve concrete `quizId` and live meta (name, subject, topic, etc.).
5. In a transaction:
    - For non-randomized quiz types, checks for overlapping schedule for the same canonical quiz (via `hasScheduleConflict`).
    - For randomized types (`rapid-arithmetic`, `crossword-bank`), this overlap check is skipped.
    - Pushes new entry into `class.schedule`, storing:
        - `quizId`, `quizRootId`, `quizVersion`.
        - Schedule window, contribution, attempts config.
        - Snapshot of quiz meta (quizName, subject, subjectColor, topic).
6. Returns the created schedule entry enriched with quiz meta.

**Success (201)**:

```json
{
  "ok": true,
  "data": {
    "_id": "...",
    "quizId": "...",
    "quizRootId": "root-quiz-id",
    "quizVersion": 1,
    "startDate": "2025-11-25T08:00:00.000Z",
    "endDate": "2025-11-25T09:00:00.000Z",
    "contribution": 100,
    "attemptsAllowed": 1,
    "showAnswersAfterAttempt": false,
    "quizName": "Fractions Quiz",
    "subject": "Math",
    "subjectColor": "#...",
    "topic": "Fractions",
    /* extra fields ... */
  }
}
```

**Errors**:

- `400` – Validation failure or quiz meta fetch failure.
- `404` – Class not found (race).
- `409` – Overlapping schedule for same canonical quiz (non-randomized types only).
- `500` – Internal server error.

---

### 14.2 `PATCH /classes/:id/schedule/item/:scheduleId` — Edit schedule item

**Auth**: `verifyAccessToken` + `verifyClassOwnerOrAdmin`.

**Params**:

- `:id` – Class id.
- `:scheduleId` – Schedule item `_id`.

**Body** (patch):

```json
{
  "startDate": "2025-11-25T09:00:00.000Z",
  "endDate": "2025-11-25T10:00:00.000Z",
  "contribution": 50,
  "attemptsAllowed": 2,
  "showAnswersAfterAttempt": true,
  "quizVersion": 2,
  "extra": {
    "notes": "Updated notes"
  }
}
```

**Behaviour**:

1. In a transaction:
    - Loads class and finds schedule by `_id`; 404 if missing.
    - Validates patch via `validateScheduleEdit`, using current window and class timezone.
    - Computes next `startDate`/`endDate` and checks validity.
    - Reads current canonical identity (`quizRootId`, `quizVersion`); fails if absent.
2. Handles `quizVersion` change:
    - Validates new version (>0 integer).
    - Calls `fetchQuizVersionsForRoot` to confirm version exists and resolve new `quizId`.
    - Updates schedule’s `quizRootId`/`quizVersion`/`quizId`.
3. Re-runs `hasScheduleConflict` using *next* canonical identity and new window (excluding self index) for non-randomized types.
   - Randomized types (`rapid-arithmetic`, `crossword-bank`) skip this overlap check.
4. Validates and updates:
    - `contribution` (>0).
    - `attemptsAllowed` in [1, 10].
    - `showAnswersAfterAttempt` boolean.
    - `extra` fields, excluding reserved keys.
5. Saves class.
6. If `contribution` changed, calls `stats_onScheduleContributionChanged` to adjust class stats.
7. If quiz version changed, builds a `ScheduleUpdated` event and enqueues it via `enqueueEvent("ScheduleUpdated", ...)`.
8. After transaction, fetches live quiz meta via `fetchQuizMetaOnce` and attaches it to the updated item.

**Success (200)**:

```json
{
  "ok": true,
  "data": {
    "_id": "...",
    "quizId": "...",
    "quizRootId": "root-quiz-id",
    "quizVersion": 2,
    "startDate": "2025-11-25T09:00:00.000Z",
    "endDate": "2025-11-25T10:00:00.000Z",
    "contribution": 50,
    "attemptsAllowed": 2,
    "showAnswersAfterAttempt": true,
    "quizName": "Fractions Quiz (v2)",
    "subject": "Math",
    "subjectColor": "#...",
    "topic": "Fractions",
    /* extra fields ... */
  }
}
```

**Errors**:

- `400` – Invalid patch (`fieldErrors` for e.g. `contribution`, `attemptsAllowed`, `quizVersion`).
- `404` – Class or schedule item not found.
- `409` – New window overlaps another schedule for same canonical quiz (non-randomized types only).
- `500` – Internal server error.

---

### 14.3 `GET /classes/:id/schedule` — List schedule items for a class

**Auth**: `verifyAccessToken` + `verifyClassOwnerOrAdmin`.

**Params**:

- `:id` – Class id.

**Behaviour**:

1. Loads class by id via `loadClassById`.
2. For each schedule item, builds canonical selectors from `quizRootId`/`quizVersion`.
3. Calls `fetchQuizMetaBatch` once to get meta for all selectors.
4. For each schedule entry, attaches meta via `attachQuizMeta` (quizName/subject/topic/quizType, etc.), using canonical key when available.

**Success (200)**:

```json
{
  "ok": true,
  "data": [
    {
      "_id": "...",
      "quizId": "...",
      "quizRootId": "root-quiz-id",
      "quizVersion": 1,
      "startDate": "2025-11-25T08:00:00.000Z",
      "endDate": "2025-11-25T09:00:00.000Z",
      "contribution": 100,
      "attemptsAllowed": 1,
      "showAnswersAfterAttempt": false,
      "quizName": "Fractions Quiz",
      "subject": "Math",
      "subjectColor": "#...",
      "topic": "Fractions",
      "quizType": "rapid"
    }
  ],
}
```

**Errors**:

- `404` – Class not found (`loadClassById`).
- `500` – Internal server error.

---

### 14.4 `GET /classes/:id/schedule/item/:scheduleId` — Schedule detail with stats/canonicals

**Auth**: `verifyAccessToken` + `verifyClassOwnerOrAdmin`.

**Params**:

- `:id` – Class id.
- `:scheduleId` – Schedule item `_id`.

**Query** (optional):

- `openAnswerMinPct` – Numeric threshold passed to quiz-svc stats for open-ended questions.

**Behaviour**:

1. Loads the class via `loadClassById`, finds the schedule item; 404 if not found.
2. Attaches quiz meta via canonical identity (`quizRootId`, `quizVersion`) and `fetchQuizMetaOnce`.
3. Resolves `rootQuizId` and current `quizVersion` (from schedule row or meta).
4. Best-effort fetch of all quiz versions for this root via `fetchQuizVersionsForRoot`; returns them as `quizVersions`.
5. Loads canonical attempts via `loadCanonicalAttempts(classId, scheduleId)` and builds:
    - `canonicalAttemptIds` = list of attempt ids.
    - `canonicalAttempts` enriched with roster information via `enrichCanonicals`.
6. Computes `totalEligible` = number of students in class and aggregates canonical stats via `computeAggregates` (participants, sumScore, avgPct, etc.).
7. If there are no canonical attempts, returns zeroed stats and no quiz-svc call.
8. Otherwise calls quiz-svc `fetchScheduledQuizStats`, passing:
    - scheduleId, attemptIds, classId, quizId, and optional `openAnswerMinPct`.
9. Merges quiz-svc stats with local aggregates (local aggregate as fallback for e.g. avg values).
10. Returns the schedule item with:
    - `canonicalAttemptIds`, `canonicalAttempts`,
    - `stats` block (merged).

**Success (200)**:

```json
{
  "ok": true,
  "data": {
    "_id": "...",
    "quizId": "...",
    "quizRootId": "root-quiz-id",
    "quizVersion": 1,
    "quizName": "Fractions Quiz",
    "subject": "Math",
    "topic": "Fractions",
    "startDate": "2025-11-25T08:00:00.000Z",
    "endDate": "2025-11-25T09:00:00.000Z",
    "contribution": 100,
    "canonicalAttemptIds": ["...", "..."],
    "canonicalAttempts": [ /* enriched attempts */ ],
    "quizVersions": [ /* available versions from quiz-svc */ ],
    "stats": {
      "kind": "per-question" | "none" | "...",
      "attemptsCount": 10,
      "participants": 10,
      "totalStudents": 30,
      "participationPct": 33,
      "sumScore": 180,
      "sumMax": 200,
      "avgPct": 90,
      "avgAbsScore": 18,
      "avgAbsMax": 20,
      "breakdown": { /* as returned by quiz-svc */ }
    }
  }
}
```

**Errors**:

- `404` – Class or schedule item not found.
- `502` – Upstream quiz-svc error (non-auth 4xx/5xx).
- `500` – Internal server error.

---

### 14.5 `DELETE /classes/:id/schedule/quiz/:quizId` — Remove all schedules for a quiz in a class

**Auth**: `verifyAccessToken` + `verifyClassOwnerOrAdmin`.

**Params**:

- `:id` – Class id.
- `:quizId` – Concrete quiz id (version-specific).

**Behaviour**:

1. In a transaction:
    - Loads class; 404 if not found.
    - Finds all schedule items where `quizId` matches.
    - Collects their `_id`, `contribution`, and `quizRootId`.
    - Filters them out of `class.schedule` and saves.
2. After commit, for each removed schedule:
    - Calls `stats_onScheduleRemoved(classId, scheduleId, contribution)` to adjust stats.
    - If `quizRootId` present, emits a `ScheduleUpdated` event with `action: "deleted"` via `emitScheduleUpdated`.
3. Returns the resulting class schedule snapshot via `scheduleOut(c)`.

**Success (200)**:

```json
{
  "ok": true,
  "data": [ /* updated schedule array (scheduleOut) */ ]
}
```

**Errors**:

- `404` – Class not found.
- `500` – Internal server error.

---

### 14.6 `DELETE /classes/:id/schedule/item/:scheduleId` — Remove a single schedule item

**Auth**: `verifyAccessToken` + `verifyClassOwnerOrAdmin`.

**Params**:

- `:id` – Class id.
- `:scheduleId` – Schedule item `_id`.

**Behaviour**:

1. In a transaction:
    - Loads class; 404 if not found.
    - Locates schedule item; 404 if missing.
    - Captures `contribution` and `quizRootId`.
    - Removes that schedule from `class.schedule` and saves.
    - Builds `outSchedule` via `scheduleOut(c)`.
2. After commit:
    - Calls `stats_onScheduleRemoved(classId, scheduleId, contribution)` to update stats.
    - If `quizRootId` present, emits `ScheduleUpdated` event with `action: "deleted"`.
3. Returns updated schedule snapshot.

**Success (200)**:

```json
{
  "ok": true,
  "data": [ /* updated schedule items */ ]
}
```

**Errors**:

- `404` – Class or schedule item not found.
- `500` – Internal server error.

---

### 14.7 `GET /classes/:id/schedule/available` — Available schedules with stats

**Auth**: `verifyAccessToken` + `verifyClassOwnerOrAdmin`.

**Params**:

- `:id` – Class id.

**Query** (optional):

- `now` – ISO datetime override for “current time” (for testing).

**Behaviour**:

1. Loads class (schedule + students); 404 if not found.
2. Determines `effectiveNow` from `now` query (fallback to current time).
3. Filters `class.schedule` to only items where `startDate <= effectiveNow`.
4. If none, returns `data: []`.
5. Builds canonical selectors for these items and calls `fetchQuizMetaBatch`.
6. Loads `ScheduleStatsModel` rows for these schedule ids and this class.
7. For each schedule entry, computes:
    - `participants`, `sumScore`, `sumMax`, `avgPct`.
    - `participationPct = participants / numStudents`.
    - `avgAbsScore` and `avgAbsMax` per participant.
8. Returns enriched schedule rows with meta + stats.

**Success (200)**:

```json
{
  "ok": true,
  "data": [
    {
      "_id": "...",
      "quizId": "...",
      "quizRootId": "root-quiz-id",
      "quizVersion": 1,
      "startDate": "2025-11-25T08:00:00.000Z",
      "endDate": "2025-11-25T09:00:00.000Z",
      "contribution": 100,
      "attemptsAllowed": 1,
      "showAnswersAfterAttempt": false,
      "quizName": "Fractions Quiz",
      "subject": "Math",
      "subjectColor": "#...",
      "topic": "Fractions",
      "quizType": "rapid",
      "stats": {
        "participants": 20,
        "totalStudents": 30,
        "participationPct": 67,
        "sumScore": 350,
        "sumMax": 400,
        "avgPct": 88,
        "avgAbsScore": 18,
        "avgAbsMax": 20,
        "updatedAt": "2025-11-25T..."
      }
    }
  ]
}
```

**Errors**:

- `404` – Class not found.
- `500` – Internal server error.

---

### 14.8 `GET /classes/schedule/all` — All schedules for a teacher’s classes (grouped)

**Auth**: `verifyAccessToken`.

**Behaviour**:

1. Resolves `teacherId` from `req.user`.
2. Finds all classes where `owner == teacherId` or `teachers` contains `teacherId`.
3. For all schedule entries across these classes, builds canonical selectors and calls `fetchQuizMetaBatch`.
4. For each class, maps schedule entries to `attachQuizMeta` results, ensuring `_id` and `quizId` are strings.
5. Returns an array of `classId`, `className`, `classTimezone`, and `schedule` per class.

**Success (200)**:

```json
{
  "ok": true,
  "data": [
    {
      "classId": "...",
      "className": "Class 1A",
      "classTimezone": "Asia/Singapore",
      "schedule": [
        {
          "_id": "...",
          "quizId": "...",
          "quizRootId": "root-quiz-id",
          "quizVersion": 1,
          "startDate": "...",
          "endDate": "...",
          "quizName": "Fractions Quiz",
          "subject": "Math",
          "subjectColor": "#...",
          "topic": "Fractions",
          "quizType": "rapid",
          /* other schedule fields */
        }
      ]
    }
  ]
}
```

**Errors**:

- `401` – Missing teacher identity.
- `500` – Internal server error.

---

### 14.9 `GET /classes/schedule/today` — Today’s schedules across teacher’s classes

**Auth**: `verifyAccessToken`.

**Query** (optional):

- `day=YYYY-MM-DD` – UTC-based date; defaults to “today” if omitted.

**Behaviour**:

1. Resolves `teacherId` from various JWT fields (`userId`, `sub`, `id`, etc.). Fails with 401 if missing.
2. Parses `day` (if provided); 400 if invalid.
3. Loads classes where the teacher is owner/teacher, with `schedule`, `students`, `timezone`.
4. For each class:
    - Computes UTC day bounds via `getDayBounds(baseDate)`.
    - Filters schedule items where `[startDate, endDate]` overlaps this day.
5. For all “today” items, builds canonical selectors and calls `fetchQuizMetaBatch`.
6. Computes skeleton stats per schedule:
    - `participants = 0`, `sumScore = 0`, etc. (no aggregation yet; placeholder).
7. Returns a flat list of schedule rows with `classId` and `className`.

**Success (200)**:

```json
{
  "ok": true,
  "data": [
    {
      "_id": "...",
      "classId": "...",
      "className": "Class 1A",
      "quizId": "...",
      "quizRootId": "root-quiz-id",
      "quizVersion": 1,
      "startDate": "...",
      "endDate": "...",
      "contribution": 100,
      "attemptsAllowed": 1,
      "showAnswersAfterAttempt": false,
      "quizName": "Fractions Quiz",
      "subject": "Math",
      "subjectColor": "#...",
      "topic": "Fractions",
      "quizType": "rapid",
      "stats": {
        "participants": 0,
        "totalStudents": 30,
        "participationPct": 0,
        "sumScore": 0,
        "sumMax": 0,
        "avgPct": 0,
        "avgAbsScore": 0,
        "avgAbsMax": 0,
        "updatedAt": null
      }
    }
  ]
}
```

**Errors**:

- `401` – Missing teacher identity.
- `400` – Invalid `day` query.
- `500` – Internal server error.

---

## 15. Helper (S2S) APIs (`/helper/*`)

All helper endpoints are S2S and guarded by `verifySharedSecret` using an `x-quiz-secret` header.

---

### 15.1 `POST /helper/check-teacher-of-class`

**Auth**: `verifySharedSecret` (S2S).

**Body**:

```json
{
  "userId": "teacher-id",
  "classId": "class-id"
}
```

**Behaviour**:

1. Validates presence and ObjectId format for `userId`, `classId`.
2. Checks if a class exists with `_id == classId` and (`owner == userId` or `teachers` contains `userId`).
3. Returns `isTeacher` flag and optional message.

**Success (200)**:

```json
{
  "ok": true,
  "isTeacher": true
}
```

(or with `message` when `isTeacher` is false.)

**Errors**:

- `400` – Missing/invalid ids.
- `403` – Invalid shared secret (handled by middleware).
- `500` – Internal error.

---

### 15.2 `POST /helper/attempt-eligibility`

**Auth**: `verifySharedSecret` (S2S).

**Body**:

```json
{
  "studentId": "student-user-id",
  "scheduleId": "schedule-object-id",
  "attemptsCount": 2
}
```

**Behaviour**:

1. Validates presence of `studentId` and `scheduleId` and ensures `scheduleId` is a valid ObjectId.
2. Finds a class with:
    - `schedule._id == scheduleId`, and
    - `students.userId == studentId`.
3. Locates the exact schedule row.
4. Validates canonical quiz identity (`quizRootId`, `quizVersion`) on the schedule; if missing → `allowed: false` with `reason=invalid_quiz_identity`.
5. Validates schedule window:
    - Parses `startDate`/`endDate`.
    - If malformed → `allowed: false`, `reason=invalid_window`.
    - If now < start → `allowed: false`, `reason=window_not_started`.
    - If now > end → `allowed: false`, `reason=window_ended`.
6. Normalizes attempts configuration:
    - `cap = clamp(attemptsAllowed, 1, 10)`.
    - `count = max(0, attemptsCount)` (defaults to 0 on missing/invalid).
7. If `count >= cap`, returns `allowed: false`, `reason=attempt_limit`.
8. Otherwise returns `allowed: true`, including:
    - `classId`, `scheduleId`.
    - `quizId`, `quizRootId`, `quizVersion`.
    - `attemptsAllowed`, `attemptsCount`, `attemptsRemaining`.
    - `window = { start, end }`.
    - `showAnswersAfterAttempt`.

**Success (200)** (examples):

*Not allowed (window not started):*

```json
{
  "ok": true,
  "allowed": false,
  "reason": "window_not_started",
  "window": { "start": "...", "end": "..." },
  "classId": "...",
  "scheduleId": "...",
  "quizId": "...",
  "quizRootId": "...",
  "quizVersion": 1,
  "attemptsAllowed": 1,
  "showAnswersAfterAttempt": false,
  "attemptsCount": 0
}
```

*Allowed:*

```json
{
  "ok": true,
  "allowed": true,
  "classId": "...",
  "scheduleId": "...",
  "quizId": "...",
  "quizRootId": "...",
  "quizVersion": 1,
  "attemptsAllowed": 3,
  "showAnswersAfterAttempt": false,
  "attemptsCount": 1,
  "attemptsRemaining": 2,
  "window": { "start": "...", "end": "..." }
}
```

**Errors**:

- `400` – Missing/invalid `studentId`/`scheduleId`.
- `403` – Invalid shared secret.
- `500` – Internal error.

---

### 15.3 `POST /helper/check-teacher-of-schedule`

**Auth**: `verifySharedSecret` (S2S).

**Body**:

```json
{
  "userId": "teacher-id",
  "scheduleId": "schedule-object-id"
}
```

**Behaviour**:

1. Validates presence and ObjectId format for `userId`, `scheduleId`.
2. Finds class containing this schedule (`schedule._id == scheduleId`).
3. If no class found:
    - Returns `isTeacher: false` with `message: "Schedule item not found."`.
4. Checks whether `userId` is owner or in `teachers` for that class.
5. Returns `isTeacher` plus `classId` and optional message.

**Success (200)**:

```json
{
  "ok": true,
  "isTeacher": true,
  "classId": "..."
}
```

(or `isTeacher: false` with informative `message`.)

**Errors**:

- `400` – Invalid/missing ids.
- `403` – Invalid shared secret.
- `500` – Internal error.

---

### 15.4 `POST /helper/check-teacher-of-student`

**Auth**: `verifySharedSecret` (S2S).

**Body**:

```json
{
  "userId": "teacher-id",
  "studentId": "student-user-id"
}
```

**Behaviour**:

1. Validates presence and ObjectId format for `userId`, `studentId`.
2. Uses `isTeacherOfStudent(userId, studentId)` helper to determine whether this user teaches any class containing the student.
3. Returns `isTeacher` flag and message when false.

**Success (200)**:

```json
{
  "ok": true,
  "isTeacher": true
}
```

**Errors**:

- `400` – Missing/invalid ids.
- `403` – Invalid shared secret.
- `500` – Internal error.

---

### 15.5 `POST /helper/can-show-answers`

**Auth**: `verifySharedSecret` (S2S).

**Body**:

```json
{
  "scheduleId": "schedule-object-id",
  "classId": "optional-class-id",
  "quizId": "optional-quiz-id"
}
```

**Behaviour**:

1. Validates `scheduleId` is present and a valid ObjectId; validates `classId` if provided.
2. Finds the class containing `scheduleId`:
    - If `classId` provided, restricts search to that class.
3. Locates the schedule item; if missing → `canShowAnswers: false`, `reason: "not_found"`.
4. If `quizId` provided, checks it matches `schedule.quizId`; if not → `canShowAnswers: false`, `reason: "quiz_mismatch"`.
5. Parses `startDate` and `endDate`:
    - If invalid, returns `canShowAnswers` based solely on `showAnswersAfterAttempt` flag; `reason` is `"flag_set"` or `"invalid_window"`.
6. If `showAnswersAfterAttempt` is true:
    - Returns `canShowAnswers: true`, `reason: "flag_set"` (regardless of window).
7. Otherwise:
    - `canShowAnswers = now > endDate`.
    - `reason = "after_end"` if true; `"before_end"` if false.
8. Always returns current `schedule` window, `now`, `classId`, `timezone`.

**Success (200)**:

```json
{
  "ok": true,
  "canShowAnswers": true,
  "reason": "after_end",
  "classId": "...",
  "timezone": "Asia/Singapore",
  "now": "2025-11-25T...",
  "schedule": {
    "startDate": "2025-11-25T08:00:00.000Z",
    "endDate": "2025-11-25T09:00:00.000Z",
    "showAnswersAfterAttempt": false
  }
}
```

**Errors**:

- `400` – Missing/invalid ids.
- `403` – Invalid shared secret.
- `500` – Internal error.

---

## 16. Student-Facing APIs (`/students/*`)

---

### 16.1 `GET /students/:studentId/profile` — Class-scoped student profile

**Auth**: `verifyAccessToken` + `verifyTeacherOfStudentOrSelf`.

**Params**:

- `:studentId` – Student user id or `"me"`.

**Behaviour**:

1. Resolves `studentId = "me" ? req.user.id : param`.
2. Validates `studentId` as ObjectId; 400 if invalid.
3. Finds one class containing this student (`students.userId == studentId`), sorted by `updatedAt` descending (defensive primary class).
4. Ensures the student appears on the class roster; otherwise 404.
5. Loads `StudentClassStats` row for `(classId, studentId)`.
6. Computes:
    - `eligibleAssigned` from class schedule (`startDate <= now`).
    - `participationPct`, `avgScorePct` via `computeParticipationAndAvgScore`.
7. Returns a profile payload scoped to that (primary) class.

**Success (200)**:

```json
{
  "ok": true,
  "data": {
    "userId": "...",
    "displayName": "Alice",
    "photoUrl": "https://...",
    "className": "Class 1A",
    "stats": {
      "classId": "...",
      "studentId": "...",
      "sumScore": 150,
      "sumMax": 200,
      "participationCount": 8,
      "participationPct": 80,
      "avgScorePct": 75,
      "version": 1,
      "updatedAt": "2025-11-25T..."
    }
  }
}
```

**Errors**:

- `400` – Invalid `studentId`.
- `404` – No class or student not found in class.
- `500` – Internal server error.

---

### 16.2 `GET /students/:studentId/attemptable-schedules` — Attemptable schedules for a student

**Auth**: `verifyAccessToken` + `verifyTeacherOfStudentOrSelf`.

**Params**:

- `:studentId` – Student user id or `"me"`.

**Behaviour**:

1. Resolves:
    - `viewerId = req.user.id` (must be present; otherwise 401).
    - `studentId = "me" ? viewerId : param`.
2. Validates `studentId` as ObjectId; 400 if invalid.
3. Uses aggregation on `ClassModel` to:
    - Match classes where `students.userId == studentId`.
    - Unwind `schedule`.
    - Filter schedules with `startDate <= now <= endDate` (open window).
    - Project class id and required schedule fields.
4. If no rows, returns `data: []`.
5. For each open schedule:
    - Calls `fetchAttemptsForScheduleByStudentInternal(scheduleId, studentId)`.
    - Counts finalized attempts (`state === "finalized"`).
6. For each schedule, computes:
    - `attemptsAllowed` normalized to [1,10] via `normalizeAllowedAttempts`.
    - `attemptsRemaining = max(0, attemptsAllowed - finalizedCount)`.
    - Canonical identity: `quizRootId` (string, may be empty) + `quizVersion` (defaults to 1).
7. Filters out rows where `attemptsRemaining <= 0`.
8. Builds canonical selectors for remaining rows and calls `fetchQuizMetaBatch`.
9. Enriches each row with latest quiz meta (quizName, subject, subjectColor).
10. Sorts schedules by earliest `endDate`, then `startDate`.

**Response shape** (`AttemptableRow`):

```json
{
  "ok": true,
  "data": [
    {
      "classId": "...",
      "scheduleId": "...",
      "quizId": "...",
      "quizRootId": "root-quiz-id",
      "quizVersion": 1,
      "startDate": "2025-11-25T08:00:00.000Z",
      "endDate": "2025-11-25T09:00:00.000Z",
      "attemptsAllowed": 3,
      "showAnswersAfterAttempt": false,
      "attemptsCount": 1,
      "attemptsRemaining": 2,
      "quizName": "Fractions Quiz",
      "subject": "Math",
      "subjectColor": "#..."
    }
  ]
}
```

**Errors**:

- `401` – Viewer not authenticated.
- `400` – Invalid `studentId`.
- `500` – Internal server error (including quiz-svc failures beyond local fallback).

---

### 16.3 `GET /students/:studentId/schedule-summary` — Cross-class schedule summary for a student

**Auth**: `verifyAccessToken` + `verifyTeacherOfStudentOrSelf`.

**Params**:

- `:studentId` – Student user id or `"me"`.

**Query** (all optional):

- `name` – Fuzzy substring on quiz name (case-insensitive).
- `subject` – Exact subject filter.
- `topic` – Exact topic filter.
- `latestFrom` – ISO datetime lower bound on latest attempt time.
- `latestTo` – ISO datetime upper bound on latest attempt time.

**Behaviour**:

1. Resolves `studentId = "me" ? req.user.id : param` and validates as ObjectId; 400 if invalid.
2. Loads all classes containing this student (`students.userId == studentId`), selecting:
    - `name`, `students`, `schedule._id`, etc.
3. If no classes, returns an empty schedules array.
4. Builds:
    - List of `classIds`.
    - `classNameById` map.
    - `scheduleIdSetByClass` map to prune ghost schedules later.
5. Defensive roster check: ensures the student is indeed on at least one roster; otherwise 404.
6. Loads `StudentClassStats` rows for `(classId ∈ classIds, studentId)` and builds `canonicalByClass[classId][scheduleId]`.
7. Fetches all attempts for this student via `fetchStudentAttemptsInternal(studentId)`.
8. Filters attempts to those:
    - With `classId` in `classIds`.
    - Having a `scheduleId`.
9. Groups attempts by `(classId, scheduleId)`, storing:
    - All attempts.
    - The `latest` attempt per key by finishedAt / startedAt / createdAt.
10. Prunes groups whose `(classId, scheduleId)` is not present in the embedded schedule arrays (ghosts).
11. For each remaining group, builds a `ScheduleRow`:

```json
{
  "classId": "class-id",
  "className": "Class 1A",
  "scheduleId": "schedule-id",
  "quizName": "Fractions Quiz",
  "subject": "Math",
  "subjectColorHex": "#...",
  "topic": "Fractions",
  "latestAttemptId": "attempt-id",
  "latestAt": "2025-11-25T...",
  "attemptsCount": 3,
  "canonical": {
    "attemptId": "canonical-attempt-id",
    "score": 18,
    "maxScore": 20,
    "gradePct": 90
  }
}
```

1. Applies filters via `applyFilters` using name, subject, topic, latestFrom, latestTo.
2. Returns the filtered list.

**Success (200)**:

```json
{
  "ok": true,
  "data": {
    "studentId": "...",
    "schedules": [ /* ScheduleRow[] */ ]
  }
}
```

**Errors**:

- `400` – Invalid `studentId`.
- `404` – Student not found in any class (defensive roster check).
- `401`/`403` – Upstream auth errors from quiz-svc (proxied).
- `502` – Other upstream quiz-svc errors.
- `500` – Internal server error.
