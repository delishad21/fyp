# Appendix A - Requirements

## 1. Functional Requirements - Backend Microservices

### 1.1 User Service Requirements

| ID | Requirement | Notes |
| --- | --- | --- |
| U1 | The service shall provide a public health endpoint. | Root health route is exposed. |
| U2 | The service shall issue JWT access tokens for authenticated teacher and student sessions. | Access tokens carry role identity and context. |
| U3 | The service shall provide token identity resolution (`/auth/me`) for downstream services and clients. | Used for delegated verification by class/quiz/ai services. |
| U4 | The service shall provide lightweight token verification (`HEAD /auth/verify`). | Enables low-payload auth checks. |
| U5 | The service shall support teacher sign-up with full name, honorific, username, email, and password. | Account is created in unverified state until OTP verification. |
| U6 | The service shall support teacher email verification via OTP with expiry and attempt limits. | Includes lockout after too many failed attempts. |
| U7 | The service shall support resend of teacher email verification OTP with cooldown control. | Prevents OTP spam and token abuse. |
| U8 | The service shall support teacher sign-in using email or username as identifier. | Password validation is required. |
| U9 | The service shall support forgot-password request with non-enumerating response behavior. | Generic response regardless of account existence. |
| U10 | The service shall support password reset completion using selector/validator token flow. | Reset tokens are time-bound and single-use. |
| U11 | The service shall support teacher password re-verification for sensitive profile actions. | Used before protected profile edits. |
| U12 | The service shall support teacher profile update flows (name, honorific, email, password). | Email-change requires OTP verification. |
| U13 | The service shall support teacher account deletion by authenticated owner/admin flows. | Permanent deletion endpoint exists. |
| U14 | The service shall persist teacher auth tokens with purpose-specific metadata (`email_verify`, `password_reset`, `email_change`). | Token TTL and used-at semantics are enforced. |
| U15 | The service shall support student sign-in with username and password. | Student token includes teacher linkage and `mustChangePassword`. |
| U16 | The service shall enforce student password change on first login/reset when `mustChangePassword` is true. | Student change-password endpoint clears this flag. |
| U17 | The service shall support teacher-managed student creation (single student). | Returns temporary password for teacher distribution. |
| U18 | The service shall support teacher-managed student bulk creation with row-level validation reporting. | Max batch constraints are enforced. |
| U19 | The service shall support teacher-managed student update (name, username, optional email, status fields). | Ownership checks apply. |
| U20 | The service shall support teacher-managed student deletion (single and bulk). | Includes ownership/admin checks. |
| U21 | The service shall support teacher-managed student password reset to temporary credentials. | Reset sets `mustChangePassword=true`. |
| U22 | The service shall expose teacher-owned student listing endpoints. | Teacher can list and manage only own students by default. |
| U23 | The service shall bootstrap default quiz metadata for teachers through quiz-service internal integration. | Triggered at account creation/sign-in/verification lifecycle points. |

### 1.2 Quiz Service Requirements

| ID | Requirement | Notes |
| --- | --- | --- |
| Q1 | The service shall provide a public health endpoint. | Root health route is exposed. |
| Q2 | The service shall support quiz creation with ownership binding to the authenticated teacher. | Owner is derived from auth context. |
| Q3 | The service shall support quiz version families (`rootQuizId`) and immutable version increments on content change. | `version` is tracked per family. |
| Q4 | The service shall support quiz retrieval by family with latest or specific version selection. | Includes version list metadata in response. |
| Q5 | The service shall support quiz cloning into a new family. | Clone starts at version 1 in new family. |
| Q6 | The service shall support quiz patch/edit with validation and no-op detection. | Returns structured field/question validation errors. |
| Q7 | The service shall support quiz family deletion and related attempt purge behavior. | Includes lifecycle event emission. |
| Q8 | The service shall support quiz listing with pagination and filters (name, subject, topic, type, date). | Used by web quiz table and search UX. |
| Q9 | The service shall support quiz type registry-driven architecture with dynamic type resolution. | `getQuizTypeDef` contract drives validation/spec flows. |
| Q10 | The service shall support quiz types: `basic`, `rapid`, `crossword`, `rapid-arithmetic`, `crossword-bank`, `true-false`. | Type keys are shared across authoring/attempt/render APIs. |
| Q11 | The service shall support basic quiz items with MC, open-ended, and context structures. | Open-ended supports exact/keywords/list grading structures. |
| Q12 | The service shall support rapid quiz timed MC flows. | Per-question timing semantics are enforced at attempt layer. |
| Q13 | The service shall support standard crossword quiz entry/grid workflows. | Grid generation route and validation are provided. |
| Q14 | The service shall support rapid-arithmetic blueprint-based quiz generation fields. | Includes operators and per-operation settings. |
| Q15 | The service shall support crossword-bank blueprint fields (`entriesBank`, `wordsPerQuiz`) for randomized schedule variants. | Generation occurs per schedule variant. |
| Q16 | The service shall support true/false quiz schema with strict two-option structure. | Reuses rapid-style attempt flow semantics. |
| Q17 | The service shall support quiz metadata storage for subjects/topics and per-type colors. | Per-user metadata document model is used. |
| Q18 | The service shall support internal metadata bootstrap endpoint to seed default subjects/topics. | Protected by shared secret header. |
| Q19 | The service shall support subject color resolution with defaults and deterministic fallback. | Used during create/batch create/update flows. |
| Q20 | The service shall support attempt lifecycle endpoints for start, save progress, finalize, and invalidate. | Attempt documents snapshot quiz version context. |
| Q21 | The service shall support retrieval of attempts by teacher/student and class-linked filters. | Drives teacher review and analytics views. |
| Q22 | The service shall enforce schedule-based student access constraints for attempting quizzes. | Prevents unauthorized early access patterns. |
| Q23 | The service shall support read-only review access to completed attempts. | Student and teacher review flows rely on this. |
| Q24 | The service shall support schedule-anchored variant persistence for randomized quiz types. | Variant key: schedule + root + version. |
| Q25 | The service shall purge schedule variants when schedule lifecycle events invalidate them. | Triggered on schedule delete/version change events. |
| Q26 | The service shall expose internal schema/rules endpoint for AI generation contracts. | `/quiz/structure-and-rules` is source of truth for AI prompt rules. |
| Q27 | The service shall expose internal batch create endpoint for AI-approved quiz persistence. | Used by ai-service approval pipeline. |
| Q28 | The service shall support crossword generation endpoint for AI and manual workflows. | Used to generate valid crossword grids from entries. |
| Q29 | The service shall publish and consume quiz/attempt/schedule events via Kafka using outbox pattern. | Supports eventual consistency with class-service. |
| Q30 | The service shall maintain worker processes for outbox publishing and expiry/event consumers. | Enables horizontal runtime separation from HTTP handlers. |
| Q31 | Attempt events shall preserve fields required by downstream game-service projections (`attemptId`, `attemptVersion`, `classId`, `scheduleId`, `studentId`, `score`, `maxScore`, `finishedAt`, `subject`, `topic`). | Contract stability is required for streak/leaderboard migration. |

### 1.3 Class Service Requirements

| ID | Requirement | Notes |
| --- | --- | --- |
| C1 | The service shall provide a public health endpoint. | Root health route is exposed. |
| C2 | The service shall support class creation with teacher ownership and metadata fields. | Includes name, level, timezone, image, metadata. |
| C3 | The service shall support class update and deletion with owner/admin authorization. | Ownership checks enforced via middleware. |
| C4 | The service shall support class list views for owner/teacher and admin contexts. | Includes my-classes and admin list endpoints. |
| C5 | The service shall support integrated student provisioning during class creation through user-service. | Includes optional issued credentials return. |
| C6 | The service shall support class roster management (add/edit/remove students) via user-service integration. | Keeps class roster and student accounts synchronized. |
| C7 | The service shall support class schedule creation, editing, moving, and deletion. | Calendar-centric schedule model. |
| C8 | The service shall block duplicate same-day scheduling conflicts for non-randomized quizzes. | Conflict check uses canonical quiz identity. |
| C9 | The service shall bypass duplicate same-day conflict rule for randomized quiz types (`rapid-arithmetic`, `crossword-bank`). | Supports repeated randomized assignments. |
| C10 | The service shall persist quiz snapshot metadata on schedule rows (`subject`, `topic`, `quizType`, etc.). | Used by results and student-facing lists. |
| C11 | The service shall expose class-level derived statistics endpoints. | Participation, score distributions, engagement summaries. |
| C12 | The service shall expose student-level academic summaries within class context. | Attempt summaries and score analytics remain in class-service; gamification streak/rank ownership moves to game-service. |
| C13 | The service shall expose per-schedule stats for assigned quizzes. | Supports results table and schedule details. |
| C14 | The service shall maintain per-student/per-class and per-schedule analytics models needed for non-gamified reporting. | Updated from canonical attempt lifecycle events. |
| C15 | The service shall consume quiz and attempt events from Kafka for eventual consistency. | Inbound event log and handlers exist. |
| C16 | The service shall publish schedule lifecycle updates via outbox/Kafka for quiz-service consumers. | Keeps attempt validity and variants synchronized. |
| C17 | The service shall maintain HTTP and worker process separation for event/stats pipelines. | Worker bootstraps consumers/publishers independently. |
| C18 | The service shall provide Game Service access to class context required for gamification projection (timezone, contribution, roster membership, schedule lifecycle). | Implemented via events and/or internal helper endpoints. |
| C19 | The service shall support immediate de-ownership of streak and leaderboard computation once Game Service is deployed. | Legacy class-service gamification code can be removed in the same migration window. |

### 1.4 AI Service Requirements

| ID | Requirement | Notes |
| --- | --- | --- |
| A1 | The service shall support asynchronous generation jobs with persisted status lifecycle (`pending`, `processing`, `completed`, `failed`). | Job polling model is used by web app. |
| A2 | The service shall support generation start requests with required fields: `instructions`, `subject`, `quizTypes`, `educationLevel`, `numQuizzes`, `questionsPerQuiz`. | Input validation rejects incomplete/invalid requests. |
| A3 | The service shall support teacher-selected quiz type subsets for generation (`basic`, `rapid`, `crossword`, `true-false`). | Type distribution is deterministic and explicit. |
| A4 | The service shall support teacher-selected model IDs and dynamic model availability listing by configured API keys. | OpenAI/Anthropic/Gemini providers are supported. |
| A5 | The service shall reject generation when no configured model/provider key is available. | Frontend consumes model availability endpoint. |
| A6 | The service shall support multi-file upload (up to 5 files) with per-file size limit of 20MB. | Enforced by multer configuration. |
| A7 | The service shall support document type tagging per file (`syllabus`, `question-bank`, `subject-content`, `other`). | Used to build typed context blocks. |
| A8 | The service shall parse supported document formats (PDF, DOCX, TXT, CSV). | Text is normalized before context assembly. |
| A9 | The service shall run OCR fallback for low-text/sparse-text PDF cases according to parser thresholds. | OCR use is recorded in parse metadata/logs. |
| A10 | The service shall build typed per-quiz context packets from teacher instructions and parsed documents. | Different handling for syllabus vs question-bank vs content docs. |
| A11 | The service shall run a planning pass before generation pass. | Planning failure causes job failure (strict behavior). |
| A12 | The service shall run per-quiz generation attempts with retry limits and analytics capture. | Retry count and attempt metadata are persisted. |
| A13 | The service shall normalize and validate generated quiz payloads to quiz-service contract shape before approval. | Includes type-specific item normalization. |
| A14 | The service shall persist generation drafts for teacher review/edit before approval. | Drafts carry temp IDs and status fields. |
| A15 | The service shall support teacher approval of selected drafts into quiz-service via internal batch create endpoint. | Partial success handling is supported. |
| A16 | The service shall keep selected subject fixed from teacher input for generated quizzes. | Subject is required and not inferred from model output. |
| A17 | The service shall allow model-generated topics and pass topics through to quiz persistence. | Topic values are consumed by quiz-service topic upsert. |
| A18 | The service shall expose generation job listing, status polling, job deletion, and old-job cleanup endpoints. | Used by review history workflows. |
| A19 | The service shall record analytics at planning and generation levels (attempts, retries, latency, tokens). | Stored in job and draft analytics structures. |
| A20 | The service shall gate analytics exposure behind a secret query key. | Analytics is not returned to normal users without secret. |
| A21 | The service shall not compute provider pricing/cost internally. | Cost is computed externally (evaluator/tooling). |

### 1.5 Game Service Requirements (Gamification)

| ID | Requirement | Notes |
| --- | --- | --- |
| G1 | The service shall provide a public health endpoint. | `GET /health` returns service name, status, version, and timestamp. |
| G2 | The service shall run separate HTTP and worker processes. | HTTP bootstraps Express; worker bootstraps Kafka consumers and badge-period scheduling. |
| G3 | The HTTP service shall expose the game API under both `/` and `/api/game`. | Avatar assets are also served statically from `/avatar-assets` and `/api/game/avatar-assets`. |
| G4 | The worker shall consume quiz attempt events from Kafka topic `quiz.attempt.v1`. | Handles `AttemptFinalized` and `AttemptInvalidated`. |
| G5 | The worker shall consume class lifecycle events from Kafka topic `class.lifecycle.v1`. | Handles class, student, and schedule creation/update/deletion events. |
| G6 | The worker shall consume canonical class projection events from Kafka topic `class.canonical.v1`. | Handles `CanonicalUpserted` and `CanonicalRemoved`. |
| G7 | The service shall persist inbound event dedupe state keyed by `eventId`. | Separate inbound collections are maintained for attempt, class, and canonical event streams. |
| G8 | The service shall reject out-of-order attempt events using `attemptVersion` ordering. | Prevents stale attempt updates from overwriting newer projection state. |
| G9 | The service shall maintain an attempt projection collection for processed quiz attempts. | Stores validity, score/maxScore, subject/topic, timestamps, and attempt version. |
| G10 | The service shall maintain a class-state projection containing class name, timezone, student roster, and schedule metadata. | Schedule rows include quiz root/version, contribution, and date range. |
| G11 | The service shall seed per-class defaults when a class is created. | Default reward rules, score-threshold config, badge config, and student inventory rows are initialized from the worker. |
| G12 | The service shall remove class-scoped game data when a class is deleted or a student is removed from a class. | Deletes projections, attempts, inventories, reward grants, notifications, and badge-period award rows. |
| G13 | The service shall maintain per-student canonical best-attempt state per schedule. | `canonicalBySchedule` drives overall score, participation, and downstream reward evaluation. |
| G14 | The service shall compute overall score as contribution-weighted canonical schedule performance. | Schedule contribution updates trigger recomputation of affected student scores. |
| G15 | The service shall maintain timezone-aware attendance and streak projections. | Attendance is keyed by class-local day; current streak, best streak, and last streak date are derived from attendance days. |
| G16 | Attempt invalidation shall not revoke earned attendance or streak history. | Invalidation recomputes canonical score state only; attendance/streak are sticky once earned. |
| G17 | The service shall expose class leaderboard endpoints. | Supports full leaderboard rows and pre-sliced top lists. |
| G18 | The leaderboard API shall support `overall`, `week`, and `month` periods. | Weekly and monthly periods are computed from valid attempts in the current class-local window. |
| G19 | Leaderboard ranking shall sort deterministically by overall score, current streak, then student ID. | Top-list variants also expose participation- and streak-focused slices. |
| G20 | The service shall expose class-scoped student profile payloads. | Profile includes rank, score, participation, streak, avatar, owned/displayed badges, equipped cosmetics, and score-threshold progress. |
| G21 | The service shall persist processed attempt outcome summaries. | Stores per-attempt before/after overall score and rank deltas for reveal screens. |
| G22 | The service shall expose a protected attempt outcome endpoint. | Ownership/teacher/admin checks are enforced via user-service and class-service helper verification. |
| G23 | The service shall expose a rewards catalog endpoint. | Returns avatar catalog summary, cosmetics, badges, and default reward-rule templates. |
| G24 | The service shall support class-level score-threshold reward configuration. | Current implementation stores `enabled` and `pointsPerReward`. |
| G25 | The service shall support class-level badge configuration. | Current implementation stores weekly/monthly-top toggles and overall-score/streak threshold toggles and step sizes. |
| G26 | The service shall support class reward rules with configurable automatic grant conditions. | Supported trigger types are `overall_score_gte`, `best_streak_gte`, and `participation_count_gte`. |
| G27 | The service shall maintain per-student inventory state. | Inventory stores owned cosmetics, owned badges, displayed badges, equipped slots, avatar spec, and avatar URL. |
| G28 | Inventory and equip updates shall validate catalog IDs, ownership, compulsory slots, and legacy slot aliases. | Invalid cosmetic/badge IDs and invalid equipped states are rejected. |
| G29 | The service shall expose class inventory and per-student inventory/badge endpoints. | Supports inventory listing, badge listing, and displayed-badge updates. |
| G30 | The service shall support manual reward mutations for student inventories. | Teacher reward grants currently allow cosmetics only; badge grants are intentionally blocked and badge revokes happen through inventory updates. |
| G31 | The service shall automatically grant rewards from class rules and score-threshold progression. | Grant rows record source, optional trigger attempt, threshold points, and metadata. |
| G32 | The service shall manage threshold badges and recurring weekly/monthly top badges. | Threshold badges are recomputed transactionally; top badges are finalized by a Redis-backed worker scheduler. |
| G33 | The service shall expose protected attempt-reward reveal and acknowledgement endpoints. | Returns attempt-linked grant payloads and marks them acknowledged. |
| G34 | The service shall expose protected per-student notification feed and acknowledgement endpoints. | Notifications are created for manual grants/revokes and other non-attempt reward changes. |
| G35 | The service shall render avatar, avatar-profile, badge, and cosmetic SVG assets dynamically. | Avatar/profile SVGs are composed from equipped layers; badge SVGs support dynamic engravings for threshold and period badges. |
| G36 | The current route wiring shall apply JWT/ownership middleware only to protected attempt outcome, attempt reward, and notification endpoints. | Most leaderboard, profile, catalog, config, and inventory routes are currently mounted without route-level auth middleware. |

## 2. Functional Requirements - Mobile Application

| ID | Requirement | Notes |
| --- | --- | --- |
| M1 | The app shall provide student login using username/password credentials issued by teachers. | Backed by user-service student auth. |
| M2 | The app shall enforce forced password change when `mustChangePassword` is set. | Redirect to password change flow before main tabs. |
| M3 | The app shall provide tab navigation for Home, Leaderboard, History, and Profile. | Expo-router tab layout is implemented. |
| M4 | The home screen shall display student summary and streak-related feedback from game-service profile payloads. | Streak ownership moves out of class-service. |
| M5 | The app shall list available scheduled quizzes and allow entering quiz start/play flows. | Routed through attempt spec fetch/start APIs. |
| M6 | The app shall support attempt play for `basic`, `rapid`, `crossword`, `rapid-arithmetic`, `crossword-bank`, and `true-false`. | `rapid-arithmetic` and `true-false` follow rapid-style interaction. |
| M7 | The app shall support timer-aware progression behavior for timed quizzes. | Timer semantics come from attempt spec snapshots. |
| M8 | The app shall support save/resume of in-progress attempts via backend attempt APIs. | Recoverable after app close/network interruptions. |
| M9 | The app shall display post-attempt results/review for completed attempts. | Includes correctness and score data. |
| M10 | The history screen shall support filtering by quiz name, subject, topic, and date window. | Server-side schedule summary filters are wired. |
| M11 | The profile area shall display student avatar, badges, and equipped cosmetics while retaining account settings actions. | Profile combines identity settings and gamification state. |
| M12 | The leaderboard tab shall render live class rankings from game-service. | Replaces current placeholder screen. |
| M13 | The app shall display quiz-type-specific labels for newer types (e.g., True/False, Rapid Arithmetic, Crossword Bank). | Implemented in quiz start/play UI logic. |
| M14 | The app shall allow students to open classmate profile pages from leaderboard entries. | Classmate profile is read-only and policy-scoped. |
| M15 | Classmate profile pages shall display avatar, badge collection, and leaderboard context fields (rank/streak/score). | Enables social visibility without exposing sensitive account controls. |
| M16 | The profile area shall allow students to equip and unequip owned cosmetics/accessories/pets. | Equip attempts for unowned items must be rejected with clear errors. |
| M17 | The app shall consume avatar image/hash payloads and refresh cached avatar art after loadout changes. | Prevents stale profile pictures across tabs/screens. |

## 3. Functional Requirements - Web Application

| ID | Requirement | Notes |
| --- | --- | --- |
| W1 | The web app shall provide public landing and authenticated app route separation. | Unauthenticated users are redirected to auth routes. |
| W2 | The web app shall support teacher sign-up, sign-in, OTP verify, and password reset flows. | Uses user-service APIs. |
| W3 | The web app shall maintain authenticated service access using JWT-bearing server actions. | Delegated auth for user/quiz/class/ai service calls. |
| W4 | The home dashboard shall display current and upcoming scheduling summaries. | Includes class/schedule overview widgets. |
| W5 | The quiz management module shall support create/view/edit/clone/delete operations across quiz versions. | Root-version model is exposed to UI. |
| W6 | The quiz creation module shall support `basic`, `rapid`, `crossword`, `rapid-arithmetic`, `crossword-bank`, and `true-false` forms. | Includes type-specific constraints and payload mapping. |
| W7 | The basic quiz form shall support MC, open-ended, context blocks, and optional image attachments. | Open-ended answer models are structured. |
| W8 | The crossword-bank form shall support row-based entry editing and CSV import workflow. | Includes words-per-quiz and entry bank validation UX. |
| W9 | The quizzes table shall support search, filter, tag display, and type color display. | Includes random/type tagging updates. |
| W10 | The AI generation wizard shall support model selection from available backend models. | Unavailable models are hidden by backend filtering. |
| W11 | The AI generation wizard shall support per-file document type selection via modal before submission. | Document type notes/warnings are surfaced in UI. |
| W12 | The AI review flow shall support draft edit/view and selective approval. | Approved drafts persist through quiz-service batch route. |
| W13 | Class management shall support class creation, class editing, student management, and class deletion flows. | Integrates with user-service student provisioning APIs. |
| W14 | Class pages shall support overview, students, scheduling, results, and rewards tabs. | Rewards tab is class-scoped and teacher-facing. |
| W15 | Scheduling UI shall support assigning/removing quizzes and handling conflict behaviors by quiz type. | Randomized quiz duplicate behavior is reflected by backend logic. |
| W16 | Results pages shall support schedule-level and student-level attempt review. | Includes attempt detail routes by student/attempt IDs. |
| W17 | Settings shall support account updates (name/email/password workflows). | Re-auth + verification pathways included. |
| W18 | Settings shall support subject/topic management and subject color assignment. | Includes dedicated accounts/subjects tabs. |
| W19 | Navigation/breadcrumbs shall reflect nested class/settings routes consistently. | Includes settings > accounts/subjects behavior. |
| W20 | The rewards tab shall allow teachers to manage class reward catalogs for cosmetics, accessories, pets, and badges. | Includes create/edit/activate/deactivate/delete flows. |
| W21 | The rewards tab shall allow teachers to configure class-specific reward conditions/rules from default templates. | Rule types include streak, score, and leaderboard milestones. |
| W22 | The rewards tab shall allow teachers to inspect and modify each student’s inventory and equipped loadout. | Teacher edits must be audited. |
| W23 | The rewards tab shall support manual badge/item grant and revoke actions. | Manual overrides are role-gated to teacher/admin users. |
| W24 | Existing class leaderboard widgets and student rank/streak displays shall consume game-service data after migration. | Includes overview podium and student list/profile pages. |
| W25 | Student profile pages in web shall render game-service avatar and badge data. | Avatar should be consistent with mobile profile display. |

## 4. Non-Functional Requirements

| ID | Requirement | Notes |
| --- | --- | --- |
| N1 | All service-to-service and client-to-service protected APIs shall enforce JWT-based authorization. | User-service delegated auth pattern is used across services. |
| N2 | Passwords shall be hashed before storage. | Bcrypt hashing in user-service. |
| N3 | OTP and reset token flows shall enforce expiry, cooldown, and failed-attempt controls. | Reduces brute force and token abuse risk. |
| N4 | Internal privileged endpoints shall require shared-secret protection in addition to network controls. | Used for bootstrap/internal batch integrations. |
| N5 | Event publication shall use outbox-based reliability for cross-service consistency workflows. | Implemented in class-service and quiz-service. |
| N6 | Services with background consumers/publishers shall run worker processes separately from HTTP paths. | Class/quiz service process model. |
| N7 | AI generation shall operate asynchronously with persisted job state to avoid long blocking HTTP requests. | Web app polls job status endpoints. |
| N8 | AI analytics data exposure shall be restricted via secret-gated access path. | Prevents default user exposure. |
| N9 | File upload and server action body limits shall support large educational document inputs. | Current stack configured for high upload ceilings and 20MB file cap. |
| N10 | The architecture shall remain container-friendly and horizontally scalable across stateless service replicas. | Dockerized microservices + event backbone + external state stores. |
| N11 | Data consistency across services shall tolerate eventual consistency semantics through idempotent event handling. | Required for distributed stats/lifecycle updates. |
| N12 | Observability shall capture generation retries, latency, and token usage for AI evaluation workflows. | Metrics emitted by ai-service analytics model. |
| N13 | Game-service event consumers shall implement idempotent, replay-safe projection updates with deterministic conflict handling. | Prevents leaderboard/streak drift under retries, rebalances, and replays. |
| N14 | Gamification migration shall perform full backfill and direct cutover before runtime traffic is switched. | Backward-compatible dual-read periods are out of scope for this deployment stage. |
| N15 | Avatar rendering and leaderboard reads shall use cache-aware design with bounded staleness. | Redis-backed hot paths with explicit invalidation/versioning. |
| N16 | Reward, inventory, rule, and equip mutations shall be fully auditable with immutable history. | Supports moderation, recovery, and compliance needs. |
| N17 | Student-to-student profile visibility shall be privacy-scoped by class membership and role authorization. | Prevents cross-class profile leakage. |
