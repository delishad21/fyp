import { Request, Response } from "express";
import { Types } from "mongoose";
import { AttemptModel } from "../model/quiz-attempt-model";
import { QuizBaseModel, BaseQuizLean } from "../model/quiz-base-model";
import { CustomRequest } from "../middleware/access-control";
import { getQuizTypeDef } from "../model/quiz-registry";
import {
  type AttemptSpecEnvelope,
  type Answer,
  QUIZ_TYPE_COLORS,
  QuizTypeKey,
} from "../model/quiz-shared";
import { buildAttemptEvent } from "../utils/events/attempt-events";
import { enqueueEvent } from "../utils/events/outbox-enqueue";
import {
  checkAttemptEligibilityBySchedule,
  sharedSecret,
  type EligibilityByScheduleResult,
} from "../utils/class-svc-client";
import { stringToColorHex } from "../utils/color";

/** ---------- Types used for outbound events ---------- */
type AttemptDocForEvent = {
  _id: any;
  attemptVersion?: number;
  quizId: any;
  classId: any;
  scheduleId: any;
  studentId: any;
  startedAt?: Date;
  finishedAt?: Date;
  score?: number;
  maxScore?: number;
};

/** ---------- Helpers ---------- */

function subjectTopicFromAttempt(
  attempt: AttemptDocForEvent & { quizVersionSnapshot?: any }
) {
  const meta = (attempt as any)?.quizVersionSnapshot?.meta || {};
  const subject = typeof meta.subject === "string" ? meta.subject : undefined;
  const topic = typeof meta.topic === "string" ? meta.topic : undefined;
  return { subject, topic };
}

async function emitAttemptEvent(
  type: "AttemptFinalized" | "AttemptEdited" | "AttemptInvalidated",
  attempt: AttemptDocForEvent & { quizVersionSnapshot?: any }
) {
  const { subject, topic } = subjectTopicFromAttempt(attempt);

  const body = buildAttemptEvent({
    type,
    attemptId: String(attempt._id),
    attemptVersion: attempt.attemptVersion ?? 1,
    quizId: String(attempt.quizId),
    classId: attempt.classId ? String(attempt.classId) : null,
    scheduleId: attempt.scheduleId ? String(attempt.scheduleId) : "",
    studentId: String(attempt.studentId),
    startedAt: attempt.startedAt,
    finishedAt: attempt.finishedAt,
    score: attempt.score,
    maxScore: attempt.maxScore,
    subject,
    topic,
  });

  await enqueueEvent(type, body);
}

/**
 * @route  POST /attempt/spec/:quizId
 * @auth   verifyAccessToken (any authenticated user)
 * @input  Params:   quizId (optional if provided in body)
 *         Body:     { quizId?, classId, scheduleId }
 *         Notes:    - Accepts quizId from params OR body; params take precedence.
 *                   - classId & scheduleId are REQUIRED (eligibility gate).
 * @logic  1) Validate IDs
 *         2) Load quiz base
 *         3) Ask class-service if the student may attempt this scheduled quiz now
 *         4) Build a render-safe AttemptSpecEnvelope (no grading key leakage)
 * @returns 200 { ok, data: { quizId, quizType, contentHash?, renderSpec, meta, versionTag? } }
 * @errors  400 invalid ids
 *          401 unauthenticated
 *          403 eligibility denied (outside window / not enrolled / wrong schedule)
 *          404 quiz not found
 *          500 internal
 */
export async function postAttemptSpec(req: CustomRequest, res: Response) {
  try {
    // ── 1) auth
    const studentId = req.user?.id;
    if (!studentId)
      return res.status(401).json({ ok: false, message: "Unauthorized" });

    // ── 2) parse + validate IDs (params win over body)
    const body = (req.body ?? {}) as {
      quizId?: string;
      classId?: string;
      scheduleId?: string;
    };
    const quizId = (req.params?.quizId as string) || body.quizId;
    const { classId, scheduleId } = body;

    if (!quizId || !Types.ObjectId.isValid(quizId)) {
      return res.status(400).json({ ok: false, message: "Invalid quizId" });
    }
    if (!classId || !Types.ObjectId.isValid(classId)) {
      return res.status(400).json({ ok: false, message: "Invalid classId" });
    }
    if (!scheduleId || !Types.ObjectId.isValid(scheduleId)) {
      return res.status(400).json({ ok: false, message: "Invalid scheduleId" });
    }

    // ── 3) load quiz base
    const quiz = await QuizBaseModel.findById(
      quizId
    ).lean<BaseQuizLean | null>();
    if (!quiz)
      return res.status(404).json({ ok: false, message: "Quiz not found" });

    // ── 4) eligibility check (class-svc)
    const elig: EligibilityByScheduleResult =
      await checkAttemptEligibilityBySchedule({
        studentId,
        classId: String(classId),
        scheduleId: String(scheduleId),
        quizId: String(quiz._id),
      });

    if (!elig.allowed) {
      return res.status(403).json({
        ok: false,
        reason: elig.reason,
        message: elig.message || "Attempt not allowed",
        ...(elig.window ? { window: elig.window } : {}),
      });
    }

    // ── 5) type-def + envelope build
    const def = getQuizTypeDef(quiz.quizType);
    if (!def)
      return res.status(400).json({ ok: false, message: "Unknown quiz type" });

    const envelope = def.buildAttemptSpec(quiz);

    // ── 6) respond with render-safe subset
    return res.json({
      ok: true,
      data: {
        quizId: envelope.quizId,
        quizType: envelope.quizType,
        contentHash: envelope.contentHash,
        renderSpec: envelope.renderSpec,
        meta: envelope.meta,
        versionTag: envelope.versionTag,
      },
    });
  } catch (e) {
    console.error("[postAttemptSpec]", e);
    return res
      .status(500)
      .json({ ok: false, message: "Internal server error" });
  }
}

/**
 * @route  POST /attempt
 * @auth   verifyAccessToken + verifyStudentOnly
 * @input  Body: { quizId, classId, scheduleId }
 *         Notes: AttemptModel requires classId & scheduleId; both are enforced here.
 * @logic  1) Validate IDs
 *         2) Load quiz
 *         3) Verify schedule eligibility with class-service
 *         4) Snapshot AttemptSpecEnvelope into the attempt
 *         5) Create in_progress attempt
 * @returns 201 { ok, data: { attemptId } }
 * @errors  400 invalid ids
 *          401 unauthenticated
 *          403 eligibility denied (outside window / not enrolled / wrong schedule)
 *          404 quiz not found
 *          500 internal
 */
export async function startAttempt(req: CustomRequest, res: Response) {
  try {
    // ── 1) auth
    const studentId = req.user?.id;
    if (!studentId)
      return res.status(401).json({ ok: false, message: "Unauthorized" });

    // ── 2) parse
    const { quizId, classId, scheduleId } = (req.body ?? {}) as {
      quizId?: string;
      classId?: string;
      scheduleId?: string;
    };

    // ── 3) validate IDs
    if (!quizId || !Types.ObjectId.isValid(quizId)) {
      return res.status(400).json({ ok: false, message: "Invalid quizId" });
    }
    if (!classId || !Types.ObjectId.isValid(classId)) {
      return res.status(400).json({ ok: false, message: "Invalid classId" });
    }
    if (!scheduleId || !Types.ObjectId.isValid(scheduleId)) {
      return res.status(400).json({ ok: false, message: "Invalid scheduleId" });
    }

    // ── 4) load quiz
    const quiz = await QuizBaseModel.findById(
      quizId
    ).lean<BaseQuizLean | null>();
    if (!quiz)
      return res.status(404).json({ ok: false, message: "Quiz not found" });

    // ── 5) schedule eligibility
    const elig = await checkAttemptEligibilityBySchedule({
      studentId,
      classId: String(classId),
      scheduleId: String(scheduleId),
      quizId: String(quiz._id),
    });
    if (!elig.allowed) {
      return res.status(403).json({
        ok: false,
        reason: elig.reason,
        message: elig.message || "Attempt not allowed",
        ...(elig.window ? { window: elig.window } : {}),
      });
    }

    // ── 6) attempt spec snapshot
    const def = getQuizTypeDef(quiz.quizType);
    if (!def)
      return res.status(400).json({ ok: false, message: "Unknown quiz type" });
    const envelope = def.buildAttemptSpec(quiz);

    // ── 7) create attempt
    const attempt = await AttemptModel.create({
      quizId: quiz._id,
      studentId,
      classId: new Types.ObjectId(classId),
      scheduleId: new Types.ObjectId(scheduleId),
      state: "in_progress",
      startedAt: new Date(),
      answers: {},
      quizVersionSnapshot: envelope,
      attemptVersion: 1,
    });

    // ── 8) respond
    return res
      .status(201)
      .json({ ok: true, data: { attemptId: String(attempt._id) } });
  } catch (e) {
    console.error("[startAttempt]", e);
    return res
      .status(500)
      .json({ ok: false, message: "Internal server error" });
  }
}

/**
 * @route  PATCH /attempt/:attemptId/answers
 * @auth   verifyAccessToken + verifyAttemptOwnerOrPrivileged
 * @input  Params: attemptId
 *         Body:   { answers: Record<itemId, payload>, attemptVersion? }
 *         Notes:  - Optimistic concurrency: rejects if attemptVersion mismatches.
 *                 - Merge semantics: keys provided overwrite prior answers; others stay.
 * @logic  1) Validate id & in_progress state
 *         2) Check attemptVersion (if provided)
 *         3) Merge and persist answers; bump attemptVersion
 * @returns 200 { ok, data: { attemptId, attemptVersion, lastSavedAt } }
 * @errors  400 invalid attemptId / missing answers
 *          401/403 handled by middleware
 *          404 attempt not found
 *          409 state not editable / version conflict
 *          500 internal
 */
export async function submitAttemptAnswers(req: CustomRequest, res: Response) {
  try {
    // ── 1) validate attemptId
    const id = req.params.attemptId;
    if (!id || !Types.ObjectId.isValid(id)) {
      return res.status(400).json({ ok: false, message: "Invalid attemptId" });
    }

    // ── 2) parse body
    const { answers, attemptVersion } = (req.body ?? {}) as {
      answers?: Record<string, any>;
      attemptVersion?: number;
    };
    if (!answers || typeof answers !== "object") {
      return res.status(400).json({ ok: false, message: "Missing answers" });
    }

    // ── 3) load & checks
    const current = await AttemptModel.findById(id).lean();
    if (!current)
      return res.status(404).json({ ok: false, message: "Not found" });
    if (current.state !== "in_progress") {
      return res
        .status(409)
        .json({ ok: false, message: "Attempt is not editable" });
    }
    if (attemptVersion && attemptVersion !== current.attemptVersion) {
      return res.status(409).json({ ok: false, message: "Version conflict" });
    }

    // ── 4) merge answers
    const merged = { ...(current.answers || {}) };
    for (const [itemId, payload] of Object.entries(answers)) {
      merged[itemId] = payload;
    }

    // ── 5) persist
    const updated = await AttemptModel.findByIdAndUpdate(
      id,
      {
        $set: { answers: merged, lastSavedAt: new Date() },
        $inc: { attemptVersion: 1 },
      },
      { new: true }
    ).lean();

    // ── 6) respond
    return res.json({
      ok: true,
      data: {
        attemptId: id,
        attemptVersion: updated?.attemptVersion,
        lastSavedAt: updated?.lastSavedAt,
      },
    });
  } catch (e) {
    console.error("[submitAttemptAnswers]", e);
    return res
      .status(500)
      .json({ ok: false, message: "Internal server error" });
  }
}

/**
 * @route  POST /attempt/:attemptId/finish
 * @auth   verifyAccessToken + verifyAttemptOwnerOrPrivileged
 * @input  Params: attemptId
 * @logic  1) Validate id & ensure state=in_progress
 *         2) Grade via quiz-type definition using the snapshot (AttemptSpecEnvelope)
 *         3) Persist final state, score, max, and per-item breakdown
 *         4) Emit AttemptFinalized event
 * @returns 200 { ok, data: AttemptDoc }
 * @errors  400 invalid attemptId
 *          401/403 handled by middleware
 *          404 not found
 *          409 already finalized
 *          500 internal
 */
export async function finalizeAttempt(req: CustomRequest, res: Response) {
  try {
    // ── 1) validate id + load
    const id = req.params.attemptId;
    if (!id || !Types.ObjectId.isValid(id)) {
      return res.status(400).json({ ok: false, message: "Invalid attemptId" });
    }
    const attempt = await AttemptModel.findById(id).lean();
    if (!attempt)
      return res.status(404).json({ ok: false, message: "Not found" });
    if (attempt.state !== "in_progress") {
      return res
        .status(409)
        .json({ ok: false, message: "Attempt already finalized" });
    }

    // ── 2) resolve type + grade
    const spec = attempt.quizVersionSnapshot as AttemptSpecEnvelope;
    const def = getQuizTypeDef(
      (spec as any).quizType || spec.quizType || (attempt as any).quizType
    );
    if (!def)
      return res.status(400).json({ ok: false, message: "Unknown quiz type" });

    const answersArray: Answer[] = Object.entries(attempt.answers || {}).map(
      ([itemId, value]) => ({ itemId, value })
    );
    const auto = def.gradeAttempt(spec, answersArray);

    // ── 3) persist finalize
    const updated = await AttemptModel.findByIdAndUpdate(
      id,
      {
        $set: {
          state: "finalized",
          finishedAt: new Date(),
          score: auto.total,
          maxScore: auto.max,
          breakdown: auto.itemScores.map((s) => ({
            itemId: s.itemId,
            awarded: s.final,
            max: s.max,
            meta: s.auto?.details,
          })),
        },
        $inc: { attemptVersion: 1 },
      },
      { new: true }
    ).lean();
    if (!updated)
      return res.status(404).json({ ok: false, message: "Not found" });

    // ── 4) emit event
    await emitAttemptEvent("AttemptFinalized", updated);

    // ── 5) respond
    return res.json({ ok: true, data: updated });
  } catch (e) {
    console.error("[finalizeAttempt]", e);
    return res
      .status(500)
      .json({ ok: false, message: "Internal server error" });
  }
}

/**
 * @route  GET /attempt/:attemptId
 * @auth   verifyAccessToken + verifyAttemptOwnerOrPrivileged
 * @input  Params: attemptId
 * @logic  Enrich snapshot.meta.typeColorHex (derived from quizType) for UI.
 * @returns 200 { ok, data: AttemptDoc | AttemptDoc{quizVersionSnapshot.meta.typeColorHex} }
 * @errors  400 invalid attemptId
 *          401/403 handled by middleware
 *          404 not found
 *          500 internal
 */
export async function getAttemptById(
  req: Request & { user?: any },
  res: Response
) {
  try {
    // ── 1) validate id
    const id = req.params.attemptId;
    if (!id || !Types.ObjectId.isValid(id)) {
      return res.status(400).json({ ok: false, message: "Invalid attemptId" });
    }

    // ── 2) load
    const doc = await AttemptModel.findById(id).lean();
    if (!doc) return res.status(404).json({ ok: false, message: "Not found" });

    // ── 3) compute type color for snapshot
    const quizType =
      (doc as any)?.quizVersionSnapshot?.quizType || (doc as any)?.quizType;
    const computedTypeColorHex =
      (quizType && QUIZ_TYPE_COLORS[quizType as QuizTypeKey]) || undefined;

    const data = doc.quizVersionSnapshot
      ? {
          ...doc,
          quizVersionSnapshot: {
            ...doc.quizVersionSnapshot,
            meta: {
              ...(doc.quizVersionSnapshot.meta || {}),
              typeColorHex:
                (doc as any)?.quizVersionSnapshot?.meta?.typeColorHex ??
                computedTypeColorHex,
            },
          },
        }
      : doc;

    // ── 4) respond
    return res.json({ ok: true, data });
  } catch (e) {
    console.error("[getAttemptById]", e);
    return res
      .status(500)
      .json({ ok: false, message: "Internal server error" });
  }
}

/**
 * @route  GET /attempt/my
 * @auth   verifyAccessToken
 * @input  Query: { page?, pageSize? }
 * @logic  Paginated list for the current student (by req.user.id).
 * @returns 200 { ok, rows[], page, pageCount, total }
 * @errors  401 unauthenticated
 *          500 internal
 */
export async function listMyAttempts(req: CustomRequest, res: Response) {
  try {
    // ── 1) auth
    const userId = req.user?.id;
    if (!userId)
      return res.status(401).json({ ok: false, message: "Unauthorized" });

    // ── 2) paging
    const page = Math.max(1, Number(req.query.page || 1));
    const pageSize = Math.min(
      100,
      Math.max(1, Number(req.query.pageSize || 20))
    );

    // ── 3) query + count
    const filter = { studentId: new Types.ObjectId(userId) };
    const total = await AttemptModel.countDocuments(filter);

    // ── 4) page fetch
    const rows = await AttemptModel.find(filter)
      .select({
        scheduleId: 1,
        quizId: 1,
        studentId: 1,
        classId: 1,
        state: 1,
        startedAt: 1,
        lastSavedAt: 1,
        finishedAt: 1,
        createdAt: 1,
        updatedAt: 1,
        score: 1,
        maxScore: 1,
        attemptVersion: 1,
      })
      .sort({ startedAt: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .lean();

    // ── 5) respond
    return res.json({
      ok: true,
      rows,
      page,
      pageCount: Math.max(1, Math.ceil(total / pageSize)),
      total,
    });
  } catch (e) {
    console.error("[listMyAttempts]", e);
    return res
      .status(500)
      .json({ ok: false, message: "Internal server error" });
  }
}

/**
 * @route  GET /attempt/student/:studentId
 * @auth   verifyAccessToken + verifyTeacherOfStudent
 * @input  Params: studentId, Query: { page?, pageSize? }
 * @logic  Paginated list for a student, enriched with snapshot quiz meta and type colors.
 * @returns 200 { ok, rows[], page, pageCount, total }
 * @errors  400 invalid studentId
 *          401/403 handled by middleware
 *          500 internal
 */
export async function listAttemptsForStudent(req: Request, res: Response) {
  try {
    // ── 1) validate
    const studentId = req.params.studentId;
    if (!studentId || !Types.ObjectId.isValid(studentId)) {
      return res.status(400).json({ ok: false, message: "Invalid studentId" });
    }

    // ── 2) paging
    const page = Math.max(1, Number(req.query.page || 1));
    const pageSize = Math.min(
      100,
      Math.max(1, Number(req.query.pageSize || 20))
    );

    // ── 3) query + fetch
    const filter = { studentId: new Types.ObjectId(studentId) };
    const total = await AttemptModel.countDocuments(filter);

    const rowsRaw = await AttemptModel.find(filter)
      .select({
        scheduleId: 1,
        quizId: 1,
        studentId: 1,
        classId: 1,
        state: 1,
        startedAt: 1,
        lastSavedAt: 1,
        finishedAt: 1,
        createdAt: 1,
        updatedAt: 1,
        score: 1,
        maxScore: 1,
        attemptVersion: 1,
        "quizVersionSnapshot.quizType": 1,
        "quizVersionSnapshot.contentHash": 1,
        "quizVersionSnapshot.meta.name": 1,
        "quizVersionSnapshot.meta.subject": 1,
        "quizVersionSnapshot.meta.subjectColorHex": 1,
        "quizVersionSnapshot.meta.topic": 1,
        "quizVersionSnapshot.meta.owner": 1,
      })
      .sort({ finishedAt: -1, startedAt: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .lean();

    // ── 4) transform for UI
    const rows = rowsRaw.map((r: any) => {
      const snap: AttemptSpecEnvelope = r.quizVersionSnapshot || {};
      const meta = snap.meta || {};
      const subject = meta.subject ?? "";
      const subjectColorHex =
        meta.subjectColorHex || (subject ? stringToColorHex(subject) : null);
      return {
        _id: r._id,
        scheduleId: r.scheduleId,
        quizId: r.quizId,
        studentId: r.studentId,
        classId: r.classId,
        state: r.state,
        startedAt: r.startedAt,
        lastSavedAt: r.lastSavedAt,
        finishedAt: r.finishedAt,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
        attemptVersion: r.attemptVersion,
        score: r.score,
        maxScore: r.maxScore,
        quiz: {
          quizId: r.quizId,
          name: meta.name ?? null,
          subject: subject || null,
          subjectColorHex: subjectColorHex || null,
          topic: meta.topic ?? null,
          quizType: snap.quizType ?? null,
          typeColorHex: QUIZ_TYPE_COLORS[snap.quizType] || undefined,
          contentHash: snap.contentHash ?? null,
        },
      };
    });

    // ── 5) respond
    return res.json({
      ok: true,
      rows,
      page,
      pageCount: Math.max(1, Math.ceil(total / pageSize)),
      total,
    });
  } catch (e) {
    console.error("[listAttemptsForStudent]", e);
    return res
      .status(500)
      .json({ ok: false, message: "Internal server error" });
  }
}

/**
 * @route  GET /attempt/schedule/:scheduleId
 * @auth   verifyAccessToken + verifyTeacherOfSchedule
 * @input  Params: scheduleId, Query: { page?, pageSize? }
 * @logic  Paginated list of attempts bound to a specific schedule entry.
 * @returns 200 { ok, rows[], page, pageCount, total }
 * @errors  400 invalid scheduleId
 *          401/403 handled by middleware (if wired)
 *          500 internal
 */
export async function listAttemptsForSchedule(req: Request, res: Response) {
  try {
    console.log(
      "[listAttemptsForSchedule] called with params:",
      req.params,
      "query:",
      req.query
    );
    // ── 1) validate
    const scheduleId = req.params.scheduleId;
    if (!scheduleId || !Types.ObjectId.isValid(scheduleId)) {
      return res.status(400).json({ ok: false, message: "Invalid scheduleId" });
    }

    // ── 2) paging
    const page = Math.max(1, Number(req.query.page || 1));
    const pageSize = Math.min(
      100,
      Math.max(1, Number(req.query.pageSize || 20))
    );

    // ── 3) query + fetch
    const filter = { scheduleId: new Types.ObjectId(scheduleId) };
    const total = await AttemptModel.countDocuments(filter);

    const rowsRaw = await AttemptModel.find(filter)
      .select({
        scheduleId: 1,
        quizId: 1,
        studentId: 1,
        classId: 1,
        state: 1,
        startedAt: 1,
        lastSavedAt: 1,
        finishedAt: 1,
        createdAt: 1,
        updatedAt: 1,
        score: 1,
        maxScore: 1,
        attemptVersion: 1,
        "quizVersionSnapshot.quizType": 1,
        "quizVersionSnapshot.contentHash": 1,
        "quizVersionSnapshot.meta.name": 1,
        "quizVersionSnapshot.meta.subject": 1,
        "quizVersionSnapshot.meta.subjectColorHex": 1,
        "quizVersionSnapshot.meta.topic": 1,
        "quizVersionSnapshot.meta.owner": 1,
      })
      .sort({ finishedAt: -1, startedAt: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .lean();

    // ── 4) transform
    const rows = rowsRaw.map((r: any) => {
      const snap: AttemptSpecEnvelope = r.quizVersionSnapshot || {};
      const meta = snap.meta || {};
      const subject = meta.subject ?? "";
      const subjectColorHex =
        meta.subjectColorHex || (subject ? stringToColorHex(subject) : null);

      return {
        _id: r._id,
        scheduleId: r.scheduleId,
        quizId: r.quizId,
        studentId: r.studentId,
        classId: r.classId,
        state: r.state,
        startedAt: r.startedAt,
        lastSavedAt: r.lastSavedAt,
        finishedAt: r.finishedAt,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
        attemptVersion: r.attemptVersion,
        score: r.score,
        maxScore: r.maxScore,
        quiz: {
          quizId: r.quizId,
          name: meta.name ?? null,
          subject: subject || null,
          subjectColorHex: subjectColorHex || null,
          topic: meta.topic ?? null,
          quizType: snap.quizType ?? null,
          typeColorHex: snap.quizType
            ? QUIZ_TYPE_COLORS[snap.quizType as QuizTypeKey]
            : undefined,
          contentHash: snap.contentHash ?? null,
        },
      };
    });

    // ── 5) respond
    return res.json({
      ok: true,
      rows,
      page,
      pageCount: Math.max(1, Math.ceil(total / pageSize)),
      total,
    });
  } catch (e) {
    console.error("[listAttemptsForSchedule]", e);
    return res
      .status(500)
      .json({ ok: false, message: "Internal server error" });
  }
}

/**
 * @route  DELETE /attempt/:attemptId
 * @auth   verifyAccessToken + verifyTeacherOfAttemptStudent
 * @input  Params: attemptId
 * @logic  Soft-invalidate attempt and bump attemptVersion, then emit event.
 * @returns 200 { ok, data: updatedAttempt }
 * @errors  400 invalid attemptId
 *          401/403 handled by middleware
 *          404 not found
 *          500 internal
 */
export async function deleteAttempt(req: Request, res: Response) {
  try {
    // ── 1) validate
    const id = req.params.attemptId;
    if (!id || !Types.ObjectId.isValid(id)) {
      return res.status(400).json({ ok: false, message: "Invalid attemptId" });
    }

    // ── 2) soft invalidate + version bump
    const updated = await AttemptModel.findByIdAndUpdate(
      id,
      { $set: { state: "invalidated" as const }, $inc: { attemptVersion: 1 } },
      { new: true }
    ).lean();
    if (!updated)
      return res.status(404).json({ ok: false, message: "Not found" });

    // ── 3) event
    await emitAttemptEvent("AttemptInvalidated", updated);

    // ── 4) respond
    return res.json({ ok: true, data: updated });
  } catch (e) {
    console.error("[deleteAttempt]", e);
    return res
      .status(500)
      .json({ ok: false, message: "Internal server error" });
  }
}

/**
 * @route  POST /attempt/internal/scheduled-quiz-stats
 * @auth   S2S only (header x-quiz-secret must match shared secret)
 *
 * @input  Body (required):
 *   { scheduleId: string, attemptIds: string[], classId?: string, quizId?: string, openAnswerMinPct?: number }
 *   - `attemptIds` must be the canonical attempts for the schedule (provided by class-service).
 *
 * @logic
 *   1) Verify shared secret via `x-quiz-secret`.
 *   2) Validate inputs:
 *        - `scheduleId` must be a valid ObjectId.
 *        - `attemptIds` must be a non-empty array of valid ObjectIds.
 *        - If provided, `classId`/`quizId` must be valid ObjectIds.
 *   3) Resolve `quizId`:
 *        - Use provided `quizId`, or derive from the first attemptId.
 *   4) Load quiz base to determine `quizType`; then load the typed quiz doc.
 *   5) Fetch attempts by `_id ∈ attemptIds` with hard filters:
 *        - `state = 'finalized'`
 *        - `scheduleId = :scheduleId`  (sanity check)
 *        - `quizId = :quizId`          (sanity check)
 *        - `classId = :classId`        (optional extra guard if provided)
 *      Exclude any attempts that fail these checks.
 *   6) Aggregate with the quiz-type hook `aggregateScheduledQuiz(quizDoc, attempts, …)`.
 *   7) Return `{ kind, attemptsCount, breakdown }`.
 *
 * @returns 200 { ok: true, data: { kind: string, attemptsCount: number, breakdown: any } }
 *
 * @errors
 *   400 invalid/missing inputs (including missing/empty `attemptIds`)
 *   401 secret mismatch
 *   404 quiz or attempt not found (when resolving/validating)
 *   500 internal
 *
 */

export async function getScheduledQuizStatsInternal(
  req: Request,
  res: Response
) {
  console.log("[getScheduleStatsInternal] called with body:", req.body);
  try {
    // 1) S2S auth
    const secret = sharedSecret();
    if (!secret || req.header("x-quiz-secret") !== secret) {
      return res.status(401).json({ ok: false, message: "Unauthorized" });
    }

    // 2) Parse + validate (attemptIds REQUIRED)
    const { classId, scheduleId, quizId, attemptIds, openAnswerMinPct } =
      (req.body ?? {}) as {
        classId?: string;
        scheduleId?: string;
        quizId?: string;
        attemptIds?: string[];
        openAnswerMinPct?: number;
      };

    const isValidOid = (v?: string) => !!v && Types.ObjectId.isValid(v);

    if (!isValidOid(scheduleId)) {
      return res.status(400).json({ ok: false, message: "Invalid scheduleId" });
    }
    if (!Array.isArray(attemptIds) || attemptIds.length === 0) {
      return res
        .status(400)
        .json({ ok: false, message: "attemptIds (canonical set) is required" });
    }
    if (classId && !isValidOid(classId)) {
      return res.status(400).json({ ok: false, message: "Invalid classId" });
    }
    if (quizId && !isValidOid(quizId)) {
      return res.status(400).json({ ok: false, message: "Invalid quizId" });
    }
    {
      const bad = attemptIds.filter((id) => !isValidOid(id));
      if (bad.length) {
        return res.status(400).json({
          ok: false,
          message: `Invalid attemptIds: ${bad.join(", ")}`,
        });
      }
    }

    // 3) Resolve quizId (if not provided, derive from first attempt)
    let resolvedQuizId: string | undefined = quizId;
    if (!resolvedQuizId) {
      const peek = await AttemptModel.findOne(
        { _id: new Types.ObjectId(attemptIds[0]) },
        { quizId: 1 }
      ).lean();
      if (!peek?.quizId) {
        return res
          .status(404)
          .json({ ok: false, message: "Attempt not found" });
      }
      resolvedQuizId = String(peek.quizId);
    }

    // 4) Quiz base → type
    const base = await QuizBaseModel.findById(resolvedQuizId)
      .select({ quizType: 1 })
      .lean<{ quizType: QuizTypeKey } | null>();
    if (!base) {
      return res.status(404).json({ ok: false, message: "Quiz not found" });
    }
    const def = getQuizTypeDef(base.quizType);
    if (!def) {
      return res
        .status(400)
        .json({ ok: false, message: `Unsupported quizType: ${base.quizType}` });
    }

    // 5) Full typed quiz doc
    const quizDoc = await def.Model.findById(resolvedQuizId).lean();
    if (!quizDoc) {
      return res.status(404).json({ ok: false, message: "Quiz not found" });
    }

    // 6) Load attempts — only canonicals, sanity-checked to schedule (and optional class/quiz)
    const ids = attemptIds.map((id) => new Types.ObjectId(id));
    const query: any = {
      _id: { $in: ids },
      state: "finalized",
      scheduleId: new Types.ObjectId(scheduleId!), // hard schedule filter
      quizId: new Types.ObjectId(resolvedQuizId!), // ensure they belong to this quiz
    };
    if (classId) query.classId = new Types.ObjectId(classId); // optional extra guard

    const attemptsRaw = await AttemptModel.find(query)
      .select({
        studentId: 1,
        score: 1,
        maxScore: 1,
        finishedAt: 1,
        answers: 1,
        breakdown: 1,
        quizId: 1,
        classId: 1,
        scheduleId: 1,
      })
      .lean();

    // Optional logging for excluded ids
    if (attemptsRaw.length !== attemptIds.length) {
      const returned = new Set(attemptsRaw.map((a) => String(a._id)));
      const excluded = attemptIds.filter((id) => !returned.has(String(id)));
      if (excluded.length) {
        console.warn(
          `[getScheduleStatsInternal] Excluded ${excluded.length} attemptIds not matching schedule ${scheduleId}` +
            (classId ? ` and/or class ${classId}` : "") +
            ` and/or quiz ${resolvedQuizId}`
        );
      }
    }

    const attempts = attemptsRaw.map((a) => ({
      _id: a._id as any,
      studentId: a.studentId as any,
      score: Number(a.score ?? 0),
      maxScore: Number(a.maxScore ?? 0),
      finishedAt: a.finishedAt ? new Date(a.finishedAt) : new Date(0),
      answers: a.answers || {},
      breakdown: a.breakdown || [],
    }));

    // 7) Aggregate via type hook
    if (typeof def.aggregateScheduledQuiz !== "function") {
      return res.json({
        ok: true,
        data: {
          kind: def.type,
          attemptsCount: attempts.length,
          breakdown: null,
        },
      });
    }

    const breakdown = def.aggregateScheduledQuiz({
      quizDoc,
      quizType: def.type,
      attempts,
      openAnswerMinPct:
        typeof openAnswerMinPct === "number" ? openAnswerMinPct : undefined,
    });

    // 8) Respond
    return res.json({
      ok: true,
      data: {
        kind: breakdown.kind,
        attemptsCount: attempts.length,
        breakdown: breakdown.data,
      },
    });
  } catch (e) {
    console.error("[getScheduleStatsInternal] error", e);
    return res.status(500).json({ ok: false, message: "Internal error" });
  }
}
