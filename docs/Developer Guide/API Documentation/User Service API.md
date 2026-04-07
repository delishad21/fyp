## 8. Shared Auth + Health APIs

Mounted via `auth-routes.ts` under `/auth` and app root in `index.ts`.

### 8.1 `GET /` – Health check

**Auth**: Public.

**Behaviour**:
Returns a simple JSON payload indicating the user-service is running.

**Success (200)**:

```json
{ "message": "Hello World from user-service" }
```

**Errors**: None (beyond generic 5xx on server failure).

---

### 8.2 `GET /auth/me` – Resolve current token identity

**Auth**: `verifyAccessToken` (teacher/admin/student token).

**Behaviour**:

1. Verifies the bearer token.
2. Returns normalized identity fields from `req.user`.
3. Works for teacher, admin, and student tokens.

**Success (200)**:

```json
{
  "id": "string",
  "username": "string",
  "email": "string",
  "role": "teacher|admin|student",
  "teacherId": "string|null",
  "isAdmin": false,
  "mustChangePassword": false
}
```

**Errors**:

- `401` – Invalid/missing token.
- `403` – Account blocked/unverified by access middleware.
- `500` – Internal server error.

---

### 8.3 `HEAD /auth/verify` – Lightweight token validity check

**Auth**: `verifyAccessToken`.

**Behaviour**:
Returns no body. Used by clients to validate a token with minimal payload cost.

**Success (204)**: No content.

**Errors**:

- `401` – Invalid/missing token.
- `403` – Account blocked/unverified by access middleware.

---

## 9. Teacher Authentication API (`/teacher/auth`)

Mounted via `teacher-auth-routes.ts` under `/teacher/auth`.

### 9.1 `POST /teacher/auth/sign-in` – Sign In

**Auth**: Public.

**Body**:

`{ identifier: string, password: string }`

`identifier` can be either email or username.

**Behaviour**:

1. Validates presence of both fields.
2. Looks up user by email or username.
3. Verifies password with bcrypt.
4. If `isVerified === false`:
    - Looks up latest valid `"email_verify"` token.
    - If found, returns `403` with `data.selector` for the frontend to route back to the verification page.
    - If no active token, returns `403` with a message indicating the sign-up expired.
5. If verified, best-effort seeds quiz metadata defaults for the user (`ensureQuizMetaSeeded`).
6. Generates a teacher access token via `generateAccessToken(user.id, "teacher")`.

**Success (200)**:

```json
{
  "message": "User logged in",
  "data": { "accessToken": "...", /* formatted user profile */ }
}
```

**Errors**:

- `400` – Missing identifier/password.
- `401` – Wrong username/email and/or password.
- `403` – Unverified account.
- `500` – Internal error.

---

### 9.2 `POST /teacher/auth/forget-password` – Request Reset Link

**Auth**: Public.

**Body**: `{ email: string }`

**Behaviour**:

1. Validates presence of email.
2. Attempts to find a teacher by email.
3. Regardless of existence, always returns a **generic success** message to avoid leaking user presence.
4. If user exists:
    - Checks for any prior `"password_reset"` token issued recently (within `RESET_COOLDOWN_SECONDS`).
    - If too soon, returns generic 200 without issuing a new token.
    - Otherwise, calls `issueAuthToken` with `purpose: "password_reset"`, TTL of `RESET_TTL_SECONDS`.
    - Sends reset link via `sendPasswordResetLink` to the user’s email.

**Success (200)** (always generic):

```json
{
  "message": "If an account exists, a password reset email has been sent.",
  "cooldownSeconds": RESET_COOLDOWN_SECONDS
}
```

**Errors**:

- `400` – Missing email.
- `500` – Internal error.

---

### 9.3 `GET /teacher/auth/forget-password/status` – Reset Link Status

**Auth**: Public.

**Query**: `selector: string`

**Behaviour**:

- Loads token by selector, ensures `purpose === "password_reset"`, unused, and unexpired.
- Returns remaining TTL in seconds.
- Invalid/expired/used tokens always return 404 (indistinguishable).

**Success (200)**:

```json
{ "ok": true, "data": { "ttl": 123 } }
```

**Errors**:

- `404` – Not found / expired / used.

---

### 9.4 `POST /teacher/auth/forget-password/reset` – Complete Reset

**Auth**: Public.

**Body**: `{ selector: string, validator: string, newPassword: string }`

**Behaviour**:

1. Validates presence of all fields.
2. Validates new password according to password policy.
3. Calls `validateAuthToken(selector, validator)` and ensures `purpose === "password_reset"`.
4. Loads user by `userId` from token.
5. Hashes new password, saves user, and consumes the token via `consumeAuthToken(selector)`.

**Success (200)**:

```json
{ "message": "Password updated. You can sign in now." }
```

**Errors**:

- `400` – Missing params / password validation failed / invalid or expired reset link.
- `404` – User not found.
- `500` – Internal error.

---

### 9.5 `POST /teacher/auth/verify-password` – Re-check Password

**Auth**: `verifyTeacherAccessToken`.

**Body**: `{ password: string }`

**Behaviour**:

- Loads teacher based on `req.user.username` from token.
- Verifies the provided password with bcrypt.

**Success (200)**:

```json
{ "message": "Password verified!" }
```

**Errors**:

- `401` – User not found / wrong password.
- `500` – Internal error.

Used by the frontend before sensitive actions (e.g. changing name/email).

---

### 9.6 `PATCH /teacher/auth/verify-email` – Confirm Email / Email Change

**Auth**: Public.

**Body**: `{ selector: string, code: string }`

**Behaviour**:

1. Normalises selector and code (spaces/dashes removed from code).
2. Calls `verifyOtpAndMaybeConsume(selector, code)`.
3. Uses `loadUserFromTokenDoc` to load the teacher.
4. Branches by `doc.purpose`:
    - `email_verify`:
        - Calls `handleEmailVerify(user)` to mark account verified.
        - Best-effort seeds quiz metadata defaults for the verified user (`ensureQuizMetaSeeded`).
        - Returns an access token + user profile for immediate login.
    - `email_change`:
        - Calls `handleEmailChange(user, doc)` which reads `meta.newEmail`, re-checks collisions, and updates email.
        - Returns updated `{ id, username, email }`.

**Success (200)**:

- For `email_verify`:
    
    ```json
    {
      "message": "<username> registered and logged in!",
      "data": { "accessToken": "...", /* user fields */ }
    }
    ```
    
- For `email_change`:
    
    ```json
    {
      "message": "Email updated successfully.",
      "data": { "id": "...", "username": "...", "email": "new@example.com" }
    }
    ```
    

---

### 9.7 `GET /teacher/auth/verify-email/status` – Email Verify Status

**Auth**: Public.

**Query**: `selector: string`

**Behaviour**:

- Checks whether the corresponding `"email_verify"` token is valid, unused, unexpired, and under attempt limit.
- Returns remaining TTL and optional `attemptsRemaining`.

**Success (200)**:

```
{ "ok": true, "data": { "ttl": 123, "attemptsRemaining": 3 } }
```

**Errors**:

- `404` – Not found / expired / used / attempt limit reached.

---

### 9.8 `PATCH /teacher/auth/verify-email/resend`

---

### 9.9 `POST /teacher/auth/email-change/resend`

Both 9.8 and 9.9 share the same handler `resendConfirmation`.

**Auth**: Public.

**Body**: `{ selector: string }`

**Behaviour**:

1. Calls `loadTokenAndUser(selector)` to load both token and teacher.
2. Checks token state (including used/expired) before attempting resend.
3. Branches on `token.purpose`:
    - `email_verify` → `resendForEmailVerify`.
    - `email_change` → `resendForEmailChange`.

**Success (200)**: Purpose-specific response body, typically a success message.

**Errors**:

- `400` – Missing selector / unsupported purpose.
- `404` – Token not found.
- `429` – Resend throttled.
- `500` – Internal error.

---

## 10. Teacher User API (`/teacher/users`)

### 10.1 `POST /teacher/users` – Teacher Sign Up (Create User Request)

Handled by `createUserRequest`.

Auth: Public

Body:

```json
{
  "name": "Jane Doe",
  "honorific": "Ms.",
  "username": "janedoe",
  "email": "jane@example.com",
  "password": "StrongP@ssw0rd"
}
```

Behaviour:

1. Validates all fields with `validateUserData`.
2. Ensures the email and username are unique.
3. Hashes the password with bcrypt.
4. Creates an unverified teacher user with `expireAt` set to `VERIFY_TTL_SECONDS` from now.
5. Best-effort seeds quiz metadata defaults for the new user (`ensureQuizMetaSeeded`).
6. Issues a 6-digit OTP token with `purpose: "email_verify"` via `issueOtpToken`.
7. Sends the OTP code to the teacher’s email with `sendVerificationEmail`.
8. Returns the public `selector` and TTL so the frontend can complete verification using `{ selector, code }`.

Success (201):

```json
{
  "message": "Created new user janedoe request successfully. Check your email for the verification code.",
  "data": {
    "selector": "public-token-selector",
    "ttl": 600
  }
}
```

Errors:

- 400 – Field validation errors (returned under `errors` with per-field arrays).
- 409 – Email already exists / username already exists.
- 500 – Unknown error when creating user.

---

### 10.2 `DELETE /teacher/users/:email` – Delete Unverified User (Testing Only)

Handled by `deleteCreateUserRequest`.

Auth: Public (intended for testing/cleanup environments only)

Path Params:

- `email: string` – Email of the unverified teacher user to delete.

Behaviour:

1. Validates that `:email` is a syntactically valid email.
2. Finds the user by email via `_findUserByEmail`.
3. If the user does not exist, returns 404.
4. If `user.isVerified === true`, returns 403 (cannot delete verified accounts here).
5. Otherwise deletes the user using `_deleteUserById`.

Success (200):

```json
{
  "message": "Deleted user account creation request of email: test@example.com successfully"
}
```

Errors:

- 404 – Invalid email format or user with that email not found.
- 403 – User is already verified (illegal operation on this endpoint).
- 500 – Unknown error when deleting user.

---

### 10.3 `GET /teacher/users/:id` – Get Teacher Profile

Handled by `getUser`.

Auth: `verifyIsOwnerOrAdmin`

(Teacher can fetch their own profile; admin can fetch any teacher.)

Path Params:

- `id: string` – Teacher user ID.

Behaviour:

1. Reads `id` from the route.
2. Loads the teacher via `_findUserById(id)`.
3. If not found, returns 404.
4. If found, returns a formatted profile via `formatUserResponse`.

Success (200):

```json
{
  "message": "Found user",
  "data": {
    "id": "64f123...",
    "username": "janedoe",
    "name": "Jane Doe",
    "honorific": "Ms.",
    "email": "jane@example.com",
    "isAdmin": false,
    "isVerified": true,
    "createdAt": "2025-11-01T12:34:56.789Z"
  }
}
```

Errors:

- 404 – User not found.
- 500 – Unknown error when fetching user.

---

### 10.4 `GET /teacher/users` – Get All Teachers (Admin Only)

Handled by `getAllUsers`.

Auth: `verifyIsAdmin`

Body: None

Behaviour:

1. Ensures the caller is an admin.
2. Fetches all teacher users via `_findAllUsers()`.
3. Maps each user through `formatUserResponse` to return a client-safe representation.

Success (200):

```json
{
  "message": "Found users",
  "data": [
    {
      "id": "64f123...",
      "username": "admin",
      "name": "Admin User",
      "honorific": "Mr.",
      "email": "admin@example.com",
      "isAdmin": true,
      "isVerified": true,
      "createdAt": "2025-10-01T10:00:00.000Z"
    },
    {
      "id": "64f456...",
      "username": "janedoe",
      "name": "Jane Doe",
      "honorific": "Ms.",
      "email": "jane@example.com",
      "isAdmin": false,
      "isVerified": true,
      "createdAt": "2025-11-01T12:34:56.789Z"
    }
  ]
}
```

Errors:

- 500 – Unknown error when fetching all users.

---

### 10.5 `PATCH /teacher/users/me` – Update Own Profile

Handled by `updateUser`.

Auth: `verifyTeacherAccessToken`

Body (exactly one field per request):

```json
{
  "name": "New Name"
}
```

or

```json
{
  "honorific": "Dr."
}
```

or

```json
{
  "password": "N3wStr0ngP@ss!"
}
```

Behaviour:

1. Uses `req.user.id` from the access token to identify the current teacher.
2. Collects the candidate fields `name`, `honorific`, and `password` from the body.
3. Filters out undefined/empty strings and ensures exactly one field is being updated.
4. Uses a field-specific handler from `updateHandlers`:
    - `name` → validates with `validateName`.
    - `honorific` → validates with `validateHonorific`.
    - `password` → validates with `validatePassword` then hashes with bcrypt.
5. Updates the teacher via `_updateUserById` (inside the helper).
6. Returns the updated profile (never echoing the password).

Success (200):

```json
{
  "message": "Updated name",
  "data": {
    "id": "64f123...",
    "username": "janedoe",
    "name": "New Name",
    "honorific": "Ms.",
    "email": "jane@example.com",
    "isAdmin": false,
    "isVerified": true,
    "createdAt": "2025-11-01T12:34:56.789Z"
  }
}
```

Errors:

- 400 – No field to update / multiple fields provided / field validation errors.
- 401 – Authentication failed (missing or invalid token).
- 500 – Unknown error when updating user.

---

### 10.6 `DELETE /teacher/users/:id` – Delete Teacher Account

Handled by `deleteUser`.

Auth: `verifyIsOwnerOrAdmin`

Path Params:

- `id: string` – Teacher user ID.

Body: None

Behaviour:

1. Ensures the caller is either:
    - The owner (`req.user.id === :id`), or
    - An admin.
2. Loads the user via `_findUserById`.
3. If not found, returns 404.
4. Deletes the user via `_deleteUserById(id)`.

Success (200):

```json
{
  "message": "Deleted user 64f123... successfully"
}
```

Errors:

- 404 – User not found.
- 500 – Unknown error when deleting user.

---

### 10.7 `POST /teacher/users/me/email-change/request` – Request Email Change

Handled by `updateEmailRequest`.

Auth: `verifyTeacherAccessToken`

Body:

```json
{
  "email": "new-email@example.com"
}
```

Behaviour:

1. Reads `userId` from `req.user.id`.
2. Normalises and validates `newEmail` using `isValidEmail`.
3. Loads the current user via `_findUserById(userId)`.
4. Rejects if:
    - User not found.
    - New email is the same as existing email.
    - New email is already in use by another teacher (`_findUserByEmail`).
5. Checks for a recent `"email_change"` token for this user:
    - If a valid token exists and was created less than `RESEND_THROTTLE_SECONDS` ago, responds with 429.
6. Issues an OTP token via `issueOtpToken` with:
    - `purpose: "email_change"`
    - `meta: { newEmail }`
    - `ttlSeconds: EMAIL_CHANGE_TTL_SECONDS`
7. Sends the OTP code to the new email address via `sendVerificationEmailForEmailChange`.
8. Returns the `selector`, `ttl`, and `cooldownSeconds`.

Success (201):

```json
{
  "message": "A verification code has been sent to the new address.",
  "data": {
    "selector": "public-email-change-selector",
    "ttl": 600,
    "cooldownSeconds": 60
  }
}
```

Errors:

- 401 – Unauthorized (no access token).
- 400 – Email missing / invalid / same as current.
- 409 – Email already in use.
- 429 – Resend throttled (request made too soon).
- 404 – User not found.
- 500 – Unknown error when creating email change request.

---

## 11. Student Authentication API (`/student/auth`)

### 11.1 `POST /student/auth/sign-in` – Student Sign In

Handled by `studentSignIn`.

Auth: Public

Body:

```json
{
  "username": "p4-amy",
  "password": "TempP@ss1"
}
```

Behaviour:

1. Validates presence of `username` and `password`.
2. Looks up the student via `StudentModel.findOne({ username }).select("+password")`.
3. Rejects if:
    - Student does not exist, or
    - `student.isDisabled === true`.
4. Compares the submitted password with the stored bcrypt hash.
5. If password is valid, generates a student access token via:
    
    ```tsx
    generateAccessToken(
      student.id,
      "student",
      {
        teacherId: student.teacherId.toString(),
        mustChangePassword: student.mustChangePassword
      },
      { expiresIn: "30d" }
    );
    ```
    
6. Returns the access token plus a formatted student payload via `formatStudentResponse(student)`.

Success (200):

```json
{
  "message": "Student logged in",
  "data": {
    "accessToken": "jwt-here",
    "id": "651abc...",
    "name": "Amy Tan",
    "username": "p4-amy",
    "email": "amy@example.com",
    "teacherId": "64f123...",
    "isDisabled": false,
    "mustChangePassword": true,
    "createdAt": "2025-11-18T10:00:00.000Z"
  }
}
```

Errors:

- 400 – Missing username and/or password.
- 401 – Wrong username/password (same message whether user exists or not).
- 401 – Also used when account is disabled (to avoid leaking state).
- 500 – Internal server error.

---

### 11.2 `POST /student/auth/change-password` – Student Change Password

Handled by `studentChangePassword`.

Auth: `verifyStudentAccessToken`

Body:

```json
{
  "currentPassword": "OldP@ss1",
  "newPassword": "N3wStrongP@ss!"
}
```

Behaviour:

1. Ensures `req.user.role === "student"`; otherwise returns 403.
2. Validates presence of `currentPassword` and `newPassword`.
3. Validates `newPassword` with `validateStudentPassword` (length, letters, digits, special characters).
4. Loads the student via `StudentModel.findById(req.user.id).select("+password")`.
5. If student is not found, returns 404.
6. Compares `currentPassword` with the stored hash using bcrypt.
7. If correct:
    - Hashes `newPassword`.
    - Sets `student.password = <hash>`.
    - Sets `student.mustChangePassword = false`.
    - Sets `student.lastPasswordResetAt = new Date()`.
    - Saves the document.
8. Returns success.

Success (200):

```json
{
  "message": "Password updated"
}
```

Errors:

- 400 – Missing parameters or password validation failed (details in `errors`).
- 401 – Wrong current password.
- 403 – Caller is not a student.
- 404 – Student not found.
- 500 – Internal server error.

---

## 12. Student Management API (`/student/users`)

### 12.1 `POST /student/users/create` – Create Single Student

Handled by `createStudent`.

Auth: `verifyTeacherAccessToken` (teacher or admin)

Body:

```json
{
  "name": "Student Name",
  "username": "p4-amy",
  "email": "amy@example.com"
}
```

Behaviour:

1. Ensures caller is a teacher or admin (via `req.user.role` / `req.user.isAdmin`).
2. Reads `teacherId` from `req.user.id`.
3. Validates inputs using `validateStudentUserData`.
4. Ensures required fields `name` and `username` are present.
5. Validates `email` if provided (with `isValidEmail`).
6. Checks if `username` already exists in `StudentModel`; if yes → 409.
7. Generates a temporary password via `generateTempPassword()`.
8. Hashes the temporary password and creates the student:
    
    ```tsx
    {
      name,
      username,
      email,
      teacherId,
      password: hashedTemp,
      mustChangePassword: true
    }
    ```
    
9. Returns the formatted student plus the `temporaryPassword` for the teacher to distribute.

Success (201):

```json
{
  "message": "Student created",
  "data": {
    "id": "651abc...",
    "name": "Student Name",
    "username": "p4-amy",
    "email": "amy@example.com",
    "teacherId": "64f123...",
    "isDisabled": false,
    "mustChangePassword": true,
    "createdAt": "2025-11-18T10:00:00.000Z",
    "temporaryPassword": "TempP@ss1"
  }

```

Errors:

- 400 – Validation or missing name/username/email format errors.
- 403 – Forbidden (not teacher/admin).
- 409 – Username already exists.
- 500 – Internal server error.

---

### 12.2 `GET /student/users/me` – List My Students

Handled by `listMyStudents`.

Auth: `verifyTeacherAccessToken` (teacher or admin)

Body: None

Behaviour:

1. Ensures the caller is a teacher or admin.
2. Fetches all students where `teacherId === req.user.id`.
3. Sorts by `createdAt` in descending order.
4. Maps each student through `formatStudentResponse`.

Success (200):

```json
{
  "message": "Found students",
  "data": [
    {
      "id": "651abc...",
      "name": "Student A",
      "username": "p4-amy",
      "email": "amy@example.com",
      "teacherId": "64f123...",
      "isDisabled": false,
      "mustChangePassword": true,
      "createdAt": "2025-11-18T10:00:00.000Z"
    },
    {
      "id": "651abd...",
      "name": "Student B",
      "username": "p5-ben",
      "email": "ben@example.com",
      "teacherId": "64f123...",
      "isDisabled": false,
      "mustChangePassword": false,
      "createdAt": "2025-11-17T09:00:00.000Z"
    }
  ]
}
```

Errors:

- 403 – Forbidden (not teacher/admin).
- 500 – Internal server error.

---

### 12.3 `POST /student/users/:studentId/reset-password` – Reset Student Password

Handled by `teacherResetStudentPassword`.

Auth: `verifyTeacherAccessToken`

Path Params:

- `studentId: string` – Student ID.

Body: None

Behaviour:

1. Ensures the caller is a teacher or admin.
2. For teacher:
    - Loads a student using `{ _id: studentId, teacherId: req.user.id }`.
3. For admin (if extended), this could be any student; currently code restricts to teacher’s own.
4. If student not found, returns 404.
5. Generates a temporary password via `generateTempPassword()`.
6. Hashes it and updates:
    - `student.password`
    - `student.mustChangePassword = true`
    - `student.lastPasswordResetAt = new Date()`
7. Saves the student and returns the username + temporary password.

Success (200):

```json
{
  "message": "Temporary password generated",
  "data": {
    "username": "p4-amy",
    "temporaryPassword": "NewTempP@ss!"
  }
}
```

Errors:

- 403 – Forbidden (not teacher/admin).
- 404 – Student not found or does not belong to teacher.
- 500 – Internal server error.

---

### 12.4 `POST /student/users/bulk-create` – Bulk Create Students

Handled by `bulkCreateStudentsHandler`.

Auth: `verifyTeacherAccessToken`

Query Params:

- `includePasswords=true|false` – Whether to include generated temp passwords in the response.

Body:

```json
{
  "students": [
    { "name": "Student A", "username": "p4-amy", "email": "amy@example.com" },
    { "name": "Student B", "username": "p4-ben", "email": "ben@example.com" }
  ]
}
```

Behaviour:

1. Ensures caller is teacher or admin.
2. Validates that `students` is a non-empty array; enforces `MAX_BATCH = 100`.
3. Normalises and validates each row using `validateStudentUserData`.
4. Builds an aligned `itemErrors` array for per-row error reporting.
5. Checks for duplicate usernames within the payload itself.
6. If any row has validation errors or duplicate usernames, returns 400 with row-aligned errors.
7. Pre-checks the database for existing usernames; if found, marks those rows with `"Username already exists"` and returns 409.
8. For each valid student:
    - Generates a temp password.
    - Hashes it.
    - Builds a doc with `mustChangePassword = true` and `isDisabled = false`.
9. Starts a Mongo session and runs a transaction:
    - `insertMany(docs, { ordered: true, session })` – all-or-nothing.
10. Re-fetches created students and aligns them back to the original input order.
11. Builds the response array including temporary passwords if `includePasswords=true`.

Success (201):

```json
{
  "ok": true,
  "message": "Created 2 students",
  "data": [
    {
      "name": "Student A",
      "userId": "651abc...",
      "username": "p4-amy",
      "email": "amy@example.com",
      "temporaryPassword": "TempP@ss1"
    },
    {
      "name": "Student B",
      "userId": "651abd...",
      "username": "p4-ben",
      "email": "ben@example.com",
      "temporaryPassword": "TempP@ss2"
    }
  ]
}
```

(If `includePasswords=false`, the `temporaryPassword` fields are omitted.)

Errors:

- 400 – Validation failed (row-level errors under `errors.students`).
- 403 – Forbidden (not teacher/admin).
- 409 – Username conflicts (existing in DB or race on insert).
- 413 – Payload too large (`students.length > MAX_BATCH`).
- 500 – Internal error (including transaction errors).

---

### 12.5 `PATCH /student/users/:studentId` – Update Student

Handled by `updateStudent`.

Auth: `verifyTeacherAccessToken`

Path Params:

- `studentId: string` – Student ID.

Body (any subset):

```json
{
  "name": "Updated Name",
  "username": "new-username",
  "email": "new-email@example.com",
  "isDisabled": true,
  "mustChangePassword": false
}
```

Behaviour:

1. Ensures the caller is teacher or admin.
2. Builds a filter:
    - Admin: `{ _id: studentId }`
    - Teacher: `{ _id: studentId, teacherId: req.user.id }`
3. Loads the current student document (`current`).
4. If not found, returns 404.
5. Composes a candidate object:
    - `name` → new or existing value.
    - `username` → new or existing value.
    - `email` → new or existing value (empty string allowed to clear).
6. Validates candidate using `validateStudentUserData` with `emailRequired: false`.
7. If username changed, checks uniqueness in `StudentModel`; if exists → 409.
8. Prepares an `updates` object:
    - Always includes name, username, and email (or `undefined` to clear).
    - Optionally includes `isDisabled` and `mustChangePassword` if provided and validated as booleans.
9. Runs `StudentModel.findByIdAndUpdate(current._id, { $set: updates }, { new: true })`.
10. Returns the formatted updated student.

Success (200):

```json
{
  "message": "Student updated",
  "data": {
    "id": "651abc...",
    "name": "Updated Name",
    "username": "new-username",
    "email": "new-email@example.com",
    "teacherId": "64f123...",
    "isDisabled": true,
    "mustChangePassword": false,
    "createdAt": "2025-11-18T10:00:00.000Z"
  }
}
```

Errors:

- 400 – Validation failed / invalid `studentId` (CastError).
- 403 – Forbidden (not teacher/admin).
- 404 – Student not found / not owned by teacher.
- 409 – Username already exists.
- 500 – Internal server error.

---

### 12.6 `DELETE /student/users/:studentId` – Delete Single Student

Handled by `deleteStudent`.

Auth: `verifyTeacherAccessToken`

Path Params:

- `studentId: string` – Student ID.

Body: None

Behaviour:

1. Ensures caller is teacher or admin.
2. Builds a filter:
    - Admin: `{ _id: studentId }`
    - Teacher: `{ _id: studentId, teacherId: req.user.id }`
3. Runs `StudentModel.findOneAndDelete(filter)`.
4. If no document was deleted, returns 404.
5. Otherwise returns success.

Success (200):

```json
{
  "message": "Student deleted"
}
```

Errors:

- 400 – Invalid `studentId` (CastError).
- 403 – Forbidden (not teacher/admin).
- 404 – Student not found (or not owned by teacher).
- 500 – Internal server error.

---

### 12.7 `POST /student/users/bulk-delete` – Bulk Delete Students

Handled by `bulkDeleteStudentsHandler`.

Auth: `verifyTeacherAccessToken`

Body:

```json
{
  "studentIds": [
    "651abc...",
    "651abd...",
    "651abe..."
  ]
}
```

Behaviour:

1. Ensures caller is teacher or admin.
2. Validates that `studentIds` is an array.
3. Normalises to strings, trims, filters empty, and de-dupes.
4. Enforces maximum size (`MAX_BULK_DELETE = 1000`).
5. Resolves `deletableIds`:
    - Admin:
        - Finds students with `_id` in `inputIds` and collects their IDs.
    - Teacher:
        - Finds students with `_id` in `inputIds` and `teacherId === req.user.id`.
6. If no deletable IDs found:
    - Returns success with `deletedCount = 0` and all input IDs under `notFoundOrForbiddenIds`.
7. Runs `StudentModel.deleteMany({ _id: { $in: deletableIds } })`.
8. Builds `notFoundOrForbiddenIds` as the remaining IDs from the original input that were not deleted.
9. Returns a summary.

Success (200):

```json
{
  "ok": true,
  "message": "Deleted 2 of 3 students",
  "data": {
    "deletedCount": 2,
    "deletedIds": [
      "651abc...",
      "651abd..."
    ],
    "notFoundOrForbiddenIds": [
      "651abe..."
    ]
  }
}
```

Errors:

- 400 – `studentIds` not an array / empty / invalid IDs (CastError).
- 403 – Forbidden (not teacher/admin).
- 413 – Too many IDs (more than `MAX_BULK_DELETE`).
- 500 – Internal error.
