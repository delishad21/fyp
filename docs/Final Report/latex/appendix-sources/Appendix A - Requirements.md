# Appendix A - Requirements

## 1. Functional Requirements - Backend Microservices

### 1.1 User Service Requirements

| ID  | Requirement |
| --- | --- |
| U1 | The service shall provide a public health endpoint. |
| U2 | The service shall issue JWT access tokens for authenticated teacher and student sessions. |
| U3 | The service shall provide token identity resolution (`/auth/me`) for downstream services and clients. |
| U4 | The service shall provide lightweight token verification (`HEAD /auth/verify`). |
| U5 | The service shall support teacher sign-up with full name, honorific, username, email, and password. |
| U6 | The service shall support teacher email verification via OTP with expiry and attempt limits. |
| U7 | The service shall support resend of teacher email verification OTP with cooldown control. |
| U8 | The service shall support teacher sign-in using email or username as identifier. |
| U9 | The service shall support forgot-password request with non-enumerating response behavior. |
| U10 | The service shall support password reset completion using selector/validator token flow. |
| U11 | The service shall support teacher password re-verification for sensitive profile actions. |
| U12 | The service shall support teacher profile update flows (name, honorific, email, password). |
| U13 | The service shall support teacher account deletion by authenticated owner/admin flows. |
| U14 | The service shall persist teacher auth tokens with purpose-specific metadata (`email_verify`, `password_reset`, `email_change`). |
| U15 | The service shall support student sign-in with username and password. |
| U16 | The service shall enforce student password change on first login/reset when `mustChangePassword` is true. |
| U17 | The service shall support teacher-managed student creation (single student). |
| U18 | The service shall support teacher-managed student bulk creation with row-level validation reporting. |
| U19 | The service shall support teacher-managed student update (name, username, optional email, status fields). |
| U20 | The service shall support teacher-managed student deletion (single and bulk). |
| U21 | The service shall support teacher-managed student password reset to temporary credentials. |
| U22 | The service shall expose teacher-owned student listing endpoints. |
| U23 | The service shall bootstrap default quiz metadata for teachers through quiz-service internal integration. |

### 1.2 Quiz Service Requirements

| ID  | Requirement |
| --- | --- |
| Q1 | The service shall provide a public health endpoint. |
| Q2 | The service shall support quiz creation with ownership binding to the authenticated teacher. |
| Q3 | The service shall support quiz version families (`rootQuizId`) and immutable version increments on content change. |
| Q4 | The service shall support quiz retrieval by family with latest or specific version selection. |
| Q5 | The service shall support quiz cloning into a new family. |
| Q6 | The service shall support quiz patch/edit with validation and no-op detection. |
| Q7 | The service shall support quiz family deletion and related attempt purge behavior. |
| Q8 | The service shall support quiz listing with pagination and filters (name, subject, topic, type, date). |
| Q9 | The service shall support quiz type registry-driven architecture with dynamic type resolution. |
| Q10 | The service shall support quiz types: `basic`, `rapid`, `crossword`, `rapid-arithmetic`, `crossword-bank`, `true-false`. |
| Q11 | The service shall support basic quiz items with MC, open-ended, and context structures. |
| Q12 | The service shall support rapid quiz timed MC flows. |
| Q13 | The service shall support standard crossword quiz entry/grid workflows. |
| Q14 | The service shall support rapid-arithmetic blueprint-based quiz generation fields. |
| Q15 | The service shall support crossword-bank blueprint fields (`entriesBank`, `wordsPerQuiz`) for randomized schedule variants. |
| Q16 | The service shall support true/false quiz schema with strict two-option structure. |
| Q17 | The service shall support quiz metadata storage for subjects/topics and per-type colors. |
| Q18 | The service shall support internal metadata bootstrap endpoint to seed default subjects/topics. |
| Q19 | The service shall support subject color resolution with defaults and deterministic fallback. |
| Q20 | The service shall support attempt lifecycle endpoints for start, save progress, finalize, and invalidate. |
| Q21 | The service shall support retrieval of attempts by teacher/student and class-linked filters. |
| Q22 | The service shall enforce schedule-based student access constraints for attempting quizzes. |
| Q23 | The service shall support read-only review access to completed attempts. |
| Q24 | The service shall support schedule-anchored variant persistence for randomized quiz types. |
| Q25 | The service shall purge schedule variants when schedule lifecycle events invalidate them. |
| Q26 | The service shall expose internal schema/rules endpoint for AI generation contracts. |
| Q27 | The service shall expose internal batch create endpoint for AI-approved quiz persistence. |
| Q28 | The service shall support crossword generation endpoint for AI and manual workflows. |
| Q29 | The service shall publish and consume quiz/attempt/schedule events via Kafka using outbox pattern. |
| Q30 | The service shall maintain worker processes for outbox publishing and expiry/event consumers. |
| Q31 | Attempt events shall preserve fields required by downstream game-service projections (`attemptId`, `attemptVersion`, `classId`, `scheduleId`, `studentId`, `score`, `maxScore`, `finishedAt`, `subject`, `topic`). |

### 1.3 Class Service Requirements

| ID  | Requirement |
| --- | --- |
| C1 | The service shall provide a public health endpoint. |
| C2 | The service shall support class creation with teacher ownership and metadata fields. |
| C3 | The service shall support class update and deletion with owner/admin authorization. |
| C4 | The service shall support class list views for owner/teacher and admin contexts. |
| C5 | The service shall support integrated student provisioning during class creation through user-service. |
| C6 | The service shall support class roster management (add/edit/remove students) via user-service integration. |
| C7 | The service shall support class schedule creation, editing, moving, and deletion. |
| C8 | The service shall block duplicate same-day scheduling conflicts for non-randomized quizzes. |
| C9 | The service shall bypass duplicate same-day conflict rule for randomized quiz types (`rapid-arithmetic`, `crossword-bank`). |
| C10 | The service shall persist quiz snapshot metadata on schedule rows (`subject`, `topic`, `quizType`, etc.). |
| C11 | The service shall expose class-level derived statistics endpoints. |
| C12 | The service shall expose student-level academic summaries within class context. |
| C13 | The service shall expose per-schedule stats for assigned quizzes. |
| C14 | The service shall maintain per-student/per-class and per-schedule analytics models needed for non-gamified reporting. |
| C15 | The service shall consume quiz and attempt events from Kafka for eventual consistency. |
| C16 | The service shall publish schedule lifecycle updates via outbox/Kafka for quiz-service consumers. |
| C17 | The service shall maintain HTTP and worker process separation for event/stats pipelines. |
| C18 | The service shall provide Game Service access to class context required for gamification projection (timezone, contribution, roster membership, schedule lifecycle). |
| C19 | The service shall support immediate de-ownership of streak and leaderboard computation once Game Service is deployed. |

### 1.4 AI Service Requirements

| ID  | Requirement |
| --- | --- |
| A1 | The service shall support asynchronous generation jobs with persisted status lifecycle (`pending`, `processing`, `completed`, `failed`). |
| A2 | The service shall support generation start requests with required fields: `instructions`, `subject`, `quizTypes`, `educationLevel`, `numQuizzes`, `questionsPerQuiz`. |
| A3 | The service shall support teacher-selected quiz type subsets for generation (`basic`, `rapid`, `crossword`, `true-false`). |
| A4 | The service shall support teacher-selected model IDs and dynamic model availability listing by configured API keys. |
| A5 | The service shall reject generation when no configured model/provider key is available. |
| A6 | The service shall support multi-file upload (up to 5 files) with per-file size limit of 20MB. |
| A7 | The service shall support document type tagging per file (`syllabus`, `question-bank`, `subject-content`, `other`). |
| A8 | The service shall parse supported document formats (PDF, DOCX, TXT, CSV). |
| A9 | The service shall run OCR fallback for low-text/sparse-text PDF cases according to parser thresholds. |
| A10 | The service shall build typed per-quiz context packets from teacher instructions and parsed documents. |
| A11 | The service shall run a planning pass before generation pass. |
| A12 | The service shall run per-quiz generation attempts with retry limits and analytics capture. |
| A13 | The service shall normalize and validate generated quiz payloads to quiz-service contract shape before approval. |
| A14 | The service shall persist generation drafts for teacher review/edit before approval. |
| A15 | The service shall support teacher approval of selected drafts into quiz-service via internal batch create endpoint. |
| A16 | The service shall keep selected subject fixed from teacher input for generated quizzes. |
| A17 | The service shall allow model-generated topics and pass topics through to quiz persistence. |
| A18 | The service shall expose generation job listing, status polling, job deletion, and old-job cleanup endpoints. |
| A19 | The service shall record analytics at planning and generation levels (attempts, retries, latency, tokens). |
| A20 | The service shall gate analytics exposure behind a secret query key. |
| A21 | The service shall not compute provider pricing/cost internally. |

### 1.5 Game Service Requirements (Gamification)

| ID  | Requirement |
| --- | --- |
| G1 | The service shall provide a public health endpoint. |
| G2 | The service shall run separate HTTP and worker processes. |
| G3 | The HTTP service shall expose the game API under both `/` and `/api/game`. |
| G4 | The worker shall consume quiz attempt events from Kafka topic `quiz.attempt.v1`. |
| G5 | The worker shall consume class lifecycle events from Kafka topic `class.lifecycle.v1`. |
| G6 | The worker shall consume canonical class projection events from Kafka topic `class.canonical.v1`. |
| G7 | The service shall persist inbound event dedupe state keyed by `eventId`. |
| G8 | The service shall reject out-of-order attempt events using `attemptVersion` ordering. |
| G9 | The service shall maintain an attempt projection collection for processed quiz attempts. |
| G10 | The service shall maintain a class-state projection containing class name, timezone, student roster, and schedule metadata. |
| G11 | The service shall seed per-class defaults when a class is created. |
| G12 | The service shall remove class-scoped game data when a class is deleted or a student is removed from a class. |
| G13 | The service shall maintain per-student canonical best-attempt state per schedule. |
| G14 | The service shall compute overall score as contribution-weighted canonical schedule performance. |
| G15 | The service shall maintain timezone-aware attendance and streak projections. |
| G16 | Attempt invalidation shall not revoke earned attendance or streak history. |
| G17 | The service shall expose class leaderboard endpoints. |
| G18 | The leaderboard API shall support `overall`, `week`, and `month` periods. |
| G19 | Leaderboard ranking shall sort deterministically by overall score, current streak, then student ID. |
| G20 | The service shall expose class-scoped student profile payloads. |
| G21 | The service shall persist processed attempt outcome summaries. |
| G22 | The service shall expose a protected attempt outcome endpoint. |
| G23 | The service shall expose a rewards catalog endpoint. |
| G24 | The service shall support class-level score-threshold reward configuration. |
| G25 | The service shall support class-level badge configuration. |
| G26 | The service shall support class reward rules with configurable automatic grant conditions. |
| G27 | The service shall maintain per-student inventory state. |
| G28 | Inventory and equip updates shall validate catalog IDs, ownership, compulsory slots, and legacy slot aliases. |
| G29 | The service shall expose class inventory and per-student inventory/badge endpoints. |
| G30 | The service shall support manual reward mutations for student inventories. |
| G31 | The service shall automatically grant rewards from class rules and score-threshold progression. |
| G32 | The service shall manage threshold badges and recurring weekly/monthly top badges. |
| G33 | The service shall expose protected attempt-reward reveal and acknowledgement endpoints. |
| G34 | The service shall expose protected per-student notification feed and acknowledgement endpoints. |
| G35 | The service shall render avatar, avatar-profile, badge, and cosmetic SVG assets dynamically. |
| G36 | The current route wiring shall apply JWT/ownership middleware only to protected attempt outcome, attempt reward, and notification endpoints. |

## 2. Functional Requirements - Mobile Application

| ID  | Requirement |
| --- | --- |
| M1 | The app shall provide student login using username/password credentials issued by teachers. |
| M2 | The app shall enforce forced password change when `mustChangePassword` is set. |
| M3 | The app shall provide tab navigation for Home, Leaderboard, History, and Profile. |
| M4 | The home screen shall display student summary and streak-related feedback from game-service profile payloads. |
| M5 | The app shall list available scheduled quizzes and allow entering quiz start/play flows. |
| M6 | The app shall support attempt play for `basic`, `rapid`, `crossword`, `rapid-arithmetic`, `crossword-bank`, and `true-false`. |
| M7 | The app shall support timer-aware progression behavior for timed quizzes. |
| M8 | The app shall support save/resume of in-progress attempts via backend attempt APIs. |
| M9 | The app shall display post-attempt results/review for completed attempts. |
| M10 | The history screen shall support filtering by quiz name, subject, topic, and date window. |
| M11 | The profile area shall display student avatar, badges, and equipped cosmetics while retaining account settings actions. |
| M12 | The leaderboard tab shall render live class rankings from game-service. |
| M13 | The app shall display quiz-type-specific labels for newer types (e.g., True/False, Rapid Arithmetic, Crossword Bank). |
| M14 | The app shall allow students to open classmate profile pages from leaderboard entries. |
| M15 | Classmate profile pages shall display avatar, badge collection, and leaderboard context fields (rank/streak/score). |
| M16 | The profile area shall allow students to equip and unequip owned cosmetics/accessories/pets. |
| M17 | The app shall consume avatar image/hash payloads and refresh cached avatar art after loadout changes. |

## 3. Functional Requirements - Web Application

| ID  | Requirement |
| --- | --- |
| W1 | The web app shall provide public landing and authenticated app route separation. |
| W2 | The web app shall support teacher sign-up, sign-in, OTP verify, and password reset flows. |
| W3 | The web app shall maintain authenticated service access using JWT-bearing server actions. |
| W4 | The home dashboard shall display current and upcoming scheduling summaries. |
| W5 | The quiz management module shall support create/view/edit/clone/delete operations across quiz versions. |
| W6 | The quiz creation module shall support `basic`, `rapid`, `crossword`, `rapid-arithmetic`, `crossword-bank`, and `true-false` forms. |
| W7 | The basic quiz form shall support MC, open-ended, context blocks, and optional image attachments. |
| W8 | The crossword-bank form shall support row-based entry editing and CSV import workflow. |
| W9 | The quizzes table shall support search, filter, tag display, and type color display. |
| W10 | The AI generation wizard shall support model selection from available backend models. |
| W11 | The AI generation wizard shall support per-file document type selection via modal before submission. |
| W12 | The AI review flow shall support draft edit/view and selective approval. |
| W13 | Class management shall support class creation, class editing, student management, and class deletion flows. |
| W14 | Class pages shall support overview, students, scheduling, results, and rewards tabs. |
| W15 | Scheduling UI shall support assigning/removing quizzes and handling conflict behaviors by quiz type. |
| W16 | Results pages shall support schedule-level and student-level attempt review. |
| W17 | Settings shall support account updates (name/email/password workflows). |
| W18 | Settings shall support subject/topic management and subject color assignment. |
| W19 | Navigation/breadcrumbs shall reflect nested class/settings routes consistently. |
| W20 | The rewards tab shall allow teachers to manage class reward catalogs for cosmetics, accessories, pets, and badges. |
| W21 | The rewards tab shall allow teachers to configure class-specific reward conditions/rules from default templates. |
| W22 | The rewards tab shall allow teachers to inspect and modify each student’s inventory and equipped loadout. |
| W23 | The rewards tab shall support manual badge/item grant and revoke actions. |
| W24 | Existing class leaderboard widgets and student rank/streak displays shall consume game-service data after migration. |
| W25 | Student profile pages in web shall render game-service avatar and badge data. |

## 4. Non-Functional Requirements

| ID  | Requirement |
| --- | --- |
| N1 | All service-to-service and client-to-service protected APIs shall enforce JWT-based authorization. |
| N2 | Passwords shall be hashed before storage. |
| N3 | OTP and reset token flows shall enforce expiry, cooldown, and failed-attempt controls. |
| N4 | Internal privileged endpoints shall require shared-secret protection in addition to network controls. |
| N5 | Event publication shall use outbox-based reliability for cross-service consistency workflows. |
| N6 | Services with background consumers/publishers shall run worker processes separately from HTTP paths. |
| N7 | AI generation shall operate asynchronously with persisted job state to avoid long blocking HTTP requests. |
| N8 | AI analytics data exposure shall be restricted via secret-gated access path. |
| N9 | File upload and server action body limits shall support large educational document inputs. |
| N10 | The architecture shall remain container-friendly and horizontally scalable across stateless service replicas. |
| N11 | Data consistency across services shall tolerate eventual consistency semantics through idempotent event handling. |
| N12 | Observability shall capture generation retries, latency, and token usage for AI evaluation workflows. |
| N13 | Game-service event consumers shall implement idempotent, replay-safe projection updates with deterministic conflict handling. |
| N14 | Gamification migration shall perform full backfill and direct cutover before runtime traffic is switched. |
| N15 | Avatar rendering and leaderboard reads shall use cache-aware design with bounded staleness. |
| N16 | Reward, inventory, rule, and equip mutations shall be fully auditable with immutable history. |
| N17 | Student-to-student profile visibility shall be privacy-scoped by class membership and role authorization. |
