import { Request, Response } from "express";
import { Types } from "mongoose";
import { AttemptModel } from "../model/quiz-attempt-model";
import {
  QuizBaseModel,
  BaseQuizLean,
  getFamilyMetaMap,
} from "../model/quiz-base-model";
import { CustomRequest } from "../middleware/access-control";
import { getQuizTypeDef } from "../model/quiz-registry";
import {
  type AttemptSpecEnvelope,
  type Answer,
  QUIZ_TYPE_COLORS,
  QuizTypeKey,
} from "../model/quiz-shared";
import { emitAttemptEvent } from "../events/outgoing/attempt-events";
import {
  checkAttemptEligibilityBySchedule,
  sharedSecret,
  shouldShowAnswersForAttempt,
} from "../utils/class-svc-client";
import { redactGradingKey } from "../utils/quiz-utils";
import {
  clearAttemptExpiry,
  scheduleAttemptExpiryFromSpec,
} from "../events/internal/attempt-expiry";
import {
  getLiveMetaForRoot,
  getLiveMetaMapFromRows,
} from "../utils/quiz-attempt-utils";

/** ---------- Helpers ---------- */

/**
 * @route  POST /attempt/spec
 * @auth   verifyAccessToken (any authenticated student)
 *
 * @input
 *   Body: { scheduleId: string }
 *
 * @notes
 *   - Uses (scheduleId, studentId) to gate access via class-service.
 *   - Class-service returns the canonical quiz identity (quizRootId + quizVersion) for this schedule.
 *   - Only FINALIZED attempts count toward the attempts cap.
 *   - If there is an in-progress attempt for this schedule, the response includes
 *     `inProgressAttemptId` so the client can resume.
 *   - Returns a render-safe AttemptSpecEnvelope (no grading key leakage) plus policy context.
 *
 * @returns 200 {
 *   ok: true,
 *   data: {
 *     quizId, quizType, contentHash?, renderSpec, meta, versionTag?,
 *     quizRootId, quizVersion,
 *     attemptsAllowed, attemptsCount, attemptsRemaining, showAnswersAfterAttempt,
 *     inProgressAttemptId?
 *   }
 * }
 *
 * @errors
 *   400 invalid scheduleId
 *   401 unauthenticated
 *   403 eligibility denied (outside window / not enrolled / attempts exceeded)
 *   404 quiz not found
 *   500 internal server error
 */

export async function postAttemptSpec(req: CustomRequest, res: Response) {
  try {
    // ── 1) auth
    const studentId = req.user?.id;
    if (!studentId)
      return res.status(401).json({ ok: false, message: "Unauthorized" });

    // ── 2) parse payload: scheduleId only
    const body = (req.body ?? {}) as {
      scheduleId?: string;
    };
    const scheduleId = body.scheduleId;

    if (!scheduleId || !Types.ObjectId.isValid(scheduleId)) {
      return res.status(400).json({ ok: false, message: "Invalid scheduleId" });
    }

    // ── 3) attempts toward cap: FINALIZED only (per schedule)
    const attemptsCountFinalized = await AttemptModel.countDocuments({
      studentId: new Types.ObjectId(studentId),
      scheduleId: new Types.ObjectId(scheduleId),
      state: { $in: ["finalized"] },
    });

    // ── 4) check if a resumable in-progress attempt exists (id only)
    const inProgress = await AttemptModel.findOne({
      studentId: new Types.ObjectId(studentId),
      scheduleId: new Types.ObjectId(scheduleId),
      state: "in_progress",
    })
      .select({ _id: 1 })
      .lean();

    // ── 5) eligibility (class-svc) with finalized-only count
    const elig = await checkAttemptEligibilityBySchedule({
      studentId,
      scheduleId: String(scheduleId),
      attemptsCount: attemptsCountFinalized,
    });

    console.log(
      `[AttemptSpec] Eligibility for student ${studentId} on schedule ${scheduleId}:`,
      elig
    );

    if (!elig.allowed) {
      return res.status(403).json({
        ok: false,
        reason: elig.reason,
        message: elig.message || "Attempt not allowed",
        ...(elig.window ? { window: elig.window } : {}),
      });
    }

    // ── 6) resolve quiz from canonical identity (root + version)
    const { quizRootId, quizVersion } = elig;

    if (
      !quizRootId ||
      !Types.ObjectId.isValid(quizRootId) ||
      typeof quizVersion !== "number" ||
      !Number.isFinite(quizVersion)
    ) {
      return res.status(500).json({
        ok: false,
        message:
          "Class service did not return a valid quizRootId/quizVersion for this schedule.",
      });
    }

    const quiz = await QuizBaseModel.findOne({
      rootQuizId: new Types.ObjectId(quizRootId),
      version: quizVersion,
    }).lean<BaseQuizLean | null>();

    if (!quiz) {
      return res
        .status(404)
        .json({ ok: false, message: "Quiz version not found" });
    }

    // ── 7) build render-safe envelope
    const def = getQuizTypeDef(quiz.quizType);
    if (!def)
      return res.status(400).json({ ok: false, message: "Unknown quiz type" });
    const envelope = def.buildAttemptSpec(quiz);

    const familyMeta = await getFamilyMetaMap([String(quiz.rootQuizId)]);
    const liveMeta = familyMeta.get(String(quiz.rootQuizId)) || {};

    // ── 8) respond — include only the resumable attemptId if present
    return res.json({
      ok: true,
      data: {
        quizId: envelope.quizId,
        quizType: envelope.quizType,
        contentHash: envelope.contentHash,
        renderSpec: envelope.renderSpec,
        meta: liveMeta,
        versionTag: envelope.versionTag,

        // canonical identity (from class svc)
        quizRootId: elig.quizRootId ?? null,
        quizVersion:
          typeof elig.quizVersion === "number" ? elig.quizVersion : null,

        attemptsAllowed: elig.attemptsAllowed,
        attemptsCount: attemptsCountFinalized,
        attemptsRemaining: elig.attemptsRemaining,
        showAnswersAfterAttempt: elig.showAnswersAfterAttempt,
        ...(inProgress ? { inProgressAttemptId: String(inProgress._id) } : {}),
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
 *
 * @input
 *   Body: { scheduleId: string }
 *
 * @notes
 *   - Idempotent for an in-progress attempt:
 *       If a matching attempt with state="in_progress" already exists for
 *       (studentId, scheduleId), no new attempt is created. A lightweight
 *       resume payload is returned:
 *         { attemptId, answers, attemptVersion, lastSavedAt, startedAt }.
 *   - Attempts cap is enforced using FINALIZED attempts only.
 *   - The canonical quiz identity (quizRootId + quizVersion + classId)
 *     is resolved via class-service.
 *
 * @logic
 *   1) Validate scheduleId.
 *   2) If an in-progress attempt exists for (studentId, scheduleId), return resume payload.
 *   3) Count FINALIZED attempts.
 *   4) Verify eligibility with class-service.
 *   5) Resolve quiz via (quizRootId, quizVersion); build AttemptSpecEnvelope.
 *   6) Create a new attempt with state="in_progress".
 *
 * @returns
 *   - 201 { ok: true, data: { attemptId, answers, attemptVersion, lastSavedAt, startedAt } }
 *   - 200 { ok: true, data: { attemptId, answers, attemptVersion, lastSavedAt, startedAt } }
 *
 * @errors
 *   400 invalid scheduleId
 *   401 unauthenticated / not a student
 *   403 eligibility denied
 *   404 quiz not found
 *   500 internal server error
 */

export async function startAttempt(req: CustomRequest, res: Response) {
  try {
    // ── 1) auth
    const studentId = req.user?.id;
    if (!studentId)
      return res.status(401).json({ ok: false, message: "Unauthorized" });

    // ── 2) parse: scheduleId only
    const { scheduleId } = (req.body ?? {}) as {
      scheduleId?: string;
    };

    // ── 3) validate scheduleId
    if (!scheduleId || !Types.ObjectId.isValid(scheduleId)) {
      return res.status(400).json({ ok: false, message: "Invalid scheduleId" });
    }

    const scheduleObjectId = new Types.ObjectId(scheduleId);
    const studentObjectId = new Types.ObjectId(studentId);

    // ── 4) if an in-progress attempt exists, return it (resume) instead of creating new
    const existing = await AttemptModel.findOne({
      studentId: studentObjectId,
      scheduleId: scheduleObjectId,
      state: "in_progress",
    })
      .select({
        _id: 1,
        answers: 1,
        attemptVersion: 1,
        lastSavedAt: 1,
        startedAt: 1,
      })
      .lean();

    if (existing) {
      return res.status(200).json({
        ok: true,
        data: {
          attemptId: String(existing._id),
          answers: existing.answers || {},
          attemptVersion: existing.attemptVersion ?? 1,
          lastSavedAt: existing.lastSavedAt ?? null,
          startedAt: existing.startedAt ?? null,
        },
      });
    }

    // ── 5) compute attemptsCount for this schedule (FINALIZED only)
    const attemptsCountFinalized = await AttemptModel.countDocuments({
      studentId: studentObjectId,
      scheduleId: scheduleObjectId,
      state: { $in: ["finalized"] },
    });

    // ── 6) schedule eligibility (includes canonical quiz identity)
    const elig = await checkAttemptEligibilityBySchedule({
      studentId,
      scheduleId: String(scheduleId),
      attemptsCount: attemptsCountFinalized,
    });

    if (!elig.allowed) {
      return res.status(403).json({
        ok: false,
        reason: elig.reason,
        message: elig.message || "Attempt not allowed",
        ...(elig.window ? { window: elig.window } : {}),
      });
    }

    const classId = elig.classId;
    if (!classId || !Types.ObjectId.isValid(classId)) {
      return res.status(500).json({
        ok: false,
        message:
          "Class service did not return a valid classId for this schedule.",
      });
    }

    // canonical quiz identity from class-svc
    const { quizRootId, quizVersion } = elig;

    if (
      !quizRootId ||
      !Types.ObjectId.isValid(quizRootId) ||
      typeof quizVersion !== "number" ||
      !Number.isFinite(quizVersion)
    ) {
      return res.status(500).json({
        ok: false,
        message:
          "Class service did not return a valid quizRootId/quizVersion for this schedule.",
      });
    }

    // ── 7) load quiz by (root, version)
    const quiz = await QuizBaseModel.findOne({
      rootQuizId: new Types.ObjectId(quizRootId),
      version: quizVersion,
    }).lean<BaseQuizLean | null>();

    if (!quiz) {
      return res
        .status(404)
        .json({ ok: false, message: "Quiz version not found" });
    }

    // derive concrete quizId from the resolved doc
    const quizId = String(quiz._id);

    // ── 8) attempt spec snapshot
    const def = getQuizTypeDef(quiz.quizType);
    if (!def)
      return res.status(400).json({ ok: false, message: "Unknown quiz type" });
    const envelope = def.buildAttemptSpec(quiz);

    // ── 9) create attempt
    const attempt = await AttemptModel.create({
      quizId: new Types.ObjectId(quizId),
      quizRootId: new Types.ObjectId(quizRootId),
      quizVersion,

      studentId: studentObjectId,
      classId: new Types.ObjectId(classId),
      scheduleId: scheduleObjectId,

      state: "in_progress",
      startedAt: new Date(),
      answers: {},
      quizVersionSnapshot: envelope,
      attemptVersion: 1,
    });

    console.log("[startAttempt] New attempt created:", attempt);

    // ── 9b) schedule auto-expiry (best-effort)
    try {
      await scheduleAttemptExpiryFromSpec({
        attemptId: String(attempt._id),
        startedAt: attempt.startedAt!, // Date
        spec: envelope, // AttemptSpecEnvelope
        window: elig.window ?? null, // { openAt?, closeAt? } or null
      });
    } catch (err) {
      console.error("[startAttempt] Failed to schedule attempt expiry", err);
      // do NOT throw – starting the attempt should still succeed
    }

    // ── 10) respond
    return res.status(201).json({
      ok: true,
      data: {
        attemptId: String(attempt._id),
        answers: {}, // convenience for client shape consistency
        attemptVersion: 1,
        lastSavedAt: null,
        startedAt: attempt.startedAt,
      },
    });
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
    console.log(
      "[submitAttemptAnswers] Received submission for attempt:",
      req.params.attemptId,
      req.body
    );
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

    console.log("[submitAttemptAnswers] Answers saved for attempt:", updated);

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
 *         5) Redact breakdown + gradingKey in RESPONSE for students unless can-show-answers says yes
 * @returns 200 { ok, data: AttemptDoc | redacted }
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

    // ── 3b) schedule attempt expiry cleanup (best-effort)
    try {
      await clearAttemptExpiry(String(updated._id));
    } catch (err) {
      console.error("[finalizeAttempt] Failed to clear expiry", err);
    }

    // ── 4) emit event (full doc)
    await emitAttemptEvent("AttemptFinalized", updated);
    console.log("[finalizeAttempt] Attempt finalized:", updated);

    // ── 5) decide privilege + call S2S if needed, then redact response if student not allowed
    const role = (req.user?.role || "").toLowerCase();
    const isAdmin = req.user?.isAdmin === true || role === "admin";
    const isTeacher = role === "teacher";
    const isPrivileged = isAdmin || isTeacher;

    const canShow = await shouldShowAnswersForAttempt(updated, isPrivileged);
    const answersAvailable = isPrivileged ? true : !!canShow;

    // Only students AND when canShow=false ⇒ remove breakdown + gradingKey from response
    // Redact snapshot for non-privileged when cannot show
    const snapshotRaw =
      updated.quizVersionSnapshot &&
      typeof updated.quizVersionSnapshot === "object"
        ? updated.quizVersionSnapshot
        : undefined;

    let safeSnapshot =
      snapshotRaw && !isPrivileged && !canShow
        ? redactGradingKey(snapshotRaw)
        : snapshotRaw;

    let responseDoc: any = {
      ...updated,
      ...(safeSnapshot ? { quizVersionSnapshot: safeSnapshot } : {}),
      answersAvailable,
    };

    if (!isPrivileged && !canShow) {
      responseDoc.breakdown = undefined;
    }

    // Enrich response with live quiz metadata
    const liveMeta = await getLiveMetaForRoot((updated as any)?.quizRootId);
    const quizTypeForResp =
      (updated as any)?.quizVersionSnapshot?.quizType ||
      (updated as any)?.quizType;

    const respQuiz = {
      quizId: updated.quizId,
      name: liveMeta?.name ?? null,
      subject: liveMeta?.subject ?? null,
      subjectColorHex: liveMeta.subjectColorHex || null,
      topic: liveMeta?.topic ?? null,
      quizType: quizTypeForResp ?? null,
      typeColorHex: quizTypeForResp
        ? QUIZ_TYPE_COLORS[quizTypeForResp as QuizTypeKey]
        : undefined,
      contentHash:
        (updated as any)?.quizVersionSnapshot?.contentHash ??
        (updated as any)?.contentHash ??
        null,
    };

    responseDoc.quiz = respQuiz;

    // ── 6) respond (now includes answersAvailable)
    return res.json({ ok: true, answersAvailable, data: responseDoc });
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
 * @logic  Teachers/admins always see gradingKey + breakdown.
 *         Students only see them if /helper/can-show-answers says true.
 * @returns 200 { ok, data }
 */
export async function getAttemptById(
  req: CustomRequest & {
    user?: { id?: string; role?: string; isAdmin?: boolean };
  },
  res: Response
) {
  try {
    // 1) validate id
    const id = req.params.attemptId;
    if (!id || !Types.ObjectId.isValid(id)) {
      return res.status(400).json({ ok: false, message: "Invalid attemptId" });
    }

    // 2) load
    const doc = await AttemptModel.findById(id).lean();
    if (!doc) return res.status(404).json({ ok: false, message: "Not found" });

    // 3) compute type color for snapshot
    const quizType =
      (doc as any)?.quizVersionSnapshot?.quizType || (doc as any)?.quizType;
    const computedTypeColorHex =
      (quizType && QUIZ_TYPE_COLORS[quizType as QuizTypeKey]) || undefined;

    // 4) privilege
    const role = (req.user?.role || "").toLowerCase();
    const isAdmin = req.user?.isAdmin === true || role === "admin";
    const isTeacher = role === "teacher";
    const isPrivileged = isAdmin || isTeacher;

    // 5) extract snapshot
    const snapshotRaw =
      doc.quizVersionSnapshot && typeof doc.quizVersionSnapshot === "object"
        ? doc.quizVersionSnapshot
        : undefined;

    // 6) check can-show for students; teachers/admins bypass
    const canShow = await shouldShowAnswersForAttempt(doc, isPrivileged);
    const answersAvailable = isPrivileged ? true : !!canShow;

    // 7) redact gradingKey + breakdown if needed
    let safeSnapshot =
      snapshotRaw && !isPrivileged && !canShow
        ? redactGradingKey(snapshotRaw)
        : snapshotRaw;

    let data: any = safeSnapshot
      ? { ...doc, quizVersionSnapshot: safeSnapshot }
      : { ...doc };

    if (!isPrivileged && !canShow) {
      data.breakdown = undefined; // or []
    }

    data.answersAvailable = answersAvailable;

    // Enrich response with live quiz metadata
    const liveMeta = await getLiveMetaForRoot((doc as any)?.quizRootId);

    const quizForResp = {
      quizId: doc.quizId,
      name: liveMeta?.name ?? null,
      subject: liveMeta?.subject ?? null,
      subjectColorHex: liveMeta.subjectColorHex || null,
      topic: liveMeta?.topic ?? null,
      quizType: quizType ?? null,
      typeColorHex: computedTypeColorHex,
      contentHash:
        (doc as any)?.quizVersionSnapshot?.contentHash ??
        (doc as any)?.contentHash ??
        null,
    };

    data.quiz = quizForResp;

    // 8) respond (now includes answersAvailable)
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
        quizRootId: 1,
        quizVersion: 1,
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

    // ── 5) join live family meta and respond
    const metaMap = await getLiveMetaMapFromRows(rows);

    const outRows = rows.map((r: any) => {
      const liveMeta = metaMap.get(String(r.quizRootId)) || null;
      const quizType: QuizTypeKey | null =
        (r as any)?.quizVersionSnapshot?.quizType ||
        (r as any)?.quizType ||
        null;
      return {
        ...r,
        quiz: {
          quizId: r.quizId,
          name: liveMeta?.name ?? null,
          subject: liveMeta?.subject ?? null,
          subjectColorHex: liveMeta.subjectColorHex || null,
          topic: liveMeta?.topic ?? null,
          quizType,
          typeColorHex: quizType ? QUIZ_TYPE_COLORS[quizType] : undefined,
          contentHash:
            (r as any)?.quizVersionSnapshot?.contentHash ??
            (r as any)?.contentHash ??
            null,
        },
      };
    });

    return res.json({
      ok: true,
      rows: outRows,
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
 * @logic  Paginated list for a student
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
    // 3) query + fetch
    const filter = { studentId: new Types.ObjectId(studentId) };
    const total = await AttemptModel.countDocuments(filter);

    const rowsRaw = await AttemptModel.find(filter)
      .select({
        scheduleId: 1,
        quizId: 1,
        quizRootId: 1,
        quizVersion: 1,
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
      .sort({ startedAt: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .lean();

    // ── 4) transform for UI (live meta)
    const metaMap = await getLiveMetaMapFromRows(rowsRaw);
    const rows = rowsRaw.map((r: any) => {
      const snap: AttemptSpecEnvelope = r.quizVersionSnapshot || ({} as any);
      const liveMeta = metaMap.get(String(r.quizRootId)) || null;
      const quizType = snap.quizType ?? null;

      return {
        _id: r._id,
        scheduleId: r.scheduleId,
        quizId: r.quizId,
        quizRootId: r.quizRootId ?? null,
        quizVersion: typeof r.quizVersion === "number" ? r.quizVersion : null,
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
          name: liveMeta?.name ?? null,
          subject: liveMeta?.subject ?? null,
          subjectColorHex: liveMeta.subjectColorHex || null,
          topic: liveMeta?.topic ?? null,
          quizType,
          typeColorHex: quizType
            ? QUIZ_TYPE_COLORS[quizType as QuizTypeKey]
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
    console.error("[listAttemptsForStudent]", e);
    return res
      .status(500)
      .json({ ok: false, message: "Internal server error" });
  }
}

/**
 * @route  GET /attempt/quiz/schedule/:scheduleId
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

    const rowsRaw = await AttemptModel.find(filter).select({
      scheduleId: 1,
      quizId: 1,
      quizRootId: 1,
      quizVersion: 1,
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
    });
    // ── 4) transform (live meta)
    const metaMap = await getLiveMetaMapFromRows(rowsRaw);
    const rows = rowsRaw.map((r: any) => {
      const snap: AttemptSpecEnvelope = r.quizVersionSnapshot || ({} as any);
      const liveMeta = metaMap.get(String(r.quizRootId)) || null;
      const quizType = snap.quizType ?? null;

      return {
        _id: r._id,
        scheduleId: r.scheduleId,
        quizId: r.quizId,
        quizRootId: r.quizRootId ?? null,
        quizVersion: typeof r.quizVersion === "number" ? r.quizVersion : null,
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
          name: liveMeta?.name ?? null,
          subject: liveMeta?.subject ?? null,
          subjectColorHex: liveMeta.subjectColorHex || null,
          topic: liveMeta?.topic ?? null,
          quizType,
          typeColorHex: quizType
            ? QUIZ_TYPE_COLORS[quizType as QuizTypeKey]
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

    // ── 2b) clear expiry (best-effort)
    try {
      await clearAttemptExpiry(String(updated._id));
    } catch (err) {
      console.error("[deleteAttempt] Failed to clear expiry", err);
    }

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

/**
 * @route  GET /attempt/schedule/:scheduleId/student/:studentId
 * @auth   verifyAccessToken + verifyTeacherOfStudentOrSelf
 * @input  Params: { scheduleId, studentId }
 * @logic  All attempts for that student under the given schedule (desc by recency).
 * @returns 200 { ok, rows: AttemptRow[] }
 */
export async function listAttemptsForScheduleByStudent(
  req: Request,
  res: Response
) {
  try {
    const { scheduleId, studentId } = req.params;

    if (!scheduleId || !Types.ObjectId.isValid(scheduleId)) {
      return res.status(400).json({ ok: false, message: "Invalid scheduleId" });
    }
    if (!studentId || !Types.ObjectId.isValid(studentId)) {
      return res.status(400).json({ ok: false, message: "Invalid studentId" });
    }

    const filter = {
      scheduleId: new Types.ObjectId(scheduleId),
      studentId: new Types.ObjectId(studentId),
    };

    const rowsRaw = await AttemptModel.find(filter)
      .select({
        scheduleId: 1,
        quizId: 1,
        quizRootId: 1,
        quizVersion: 1,
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
        // snapshot meta is still selected for fallback safety
        "quizVersionSnapshot.meta.name": 1,
        "quizVersionSnapshot.meta.subject": 1,
        "quizVersionSnapshot.meta.subjectColorHex": 1,
        "quizVersionSnapshot.meta.topic": 1,
        "quizVersionSnapshot.meta.owner": 1,
      })
      .sort({ finishedAt: -1, startedAt: -1, createdAt: -1 })
      .lean();

    // Resolve live meta for all families in one shot
    const metaMap = await getLiveMetaMapFromRows(rowsRaw);

    const rows = (rowsRaw || []).map((r: any) => {
      const snap: AttemptSpecEnvelope = r.quizVersionSnapshot || ({} as any);
      const liveMeta = metaMap.get(String(r.quizRootId)) || null;
      const quizType = snap.quizType ?? null;

      return {
        _id: r._id,
        scheduleId: r.scheduleId,
        quizId: r.quizId,
        quizRootId: r.quizRootId ?? null,
        quizVersion: typeof r.quizVersion === "number" ? r.quizVersion : null,
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
          // prefer live meta; fallback to snapshot.meta
          name: liveMeta?.name ?? null,
          subject: liveMeta?.subject ?? null,
          subjectColorHex: liveMeta.subjectColorHex || null,
          topic: liveMeta?.topic ?? null,
          quizType,
          typeColorHex: quizType
            ? QUIZ_TYPE_COLORS[quizType as QuizTypeKey]
            : undefined,
          contentHash: snap.contentHash ?? null,
        },
      };
    });

    return res.json({ ok: true, rows });
  } catch (e) {
    console.error("[listAttemptsForScheduleByStudent] error", e);
    return res
      .status(500)
      .json({ ok: false, message: "Internal server error" });
  }
}

/**
 * @route  POST /attempt/internal/student
 * @auth   S2S via x-quiz-secret
 * @body   { studentId: string }
 * @logic  Return all attempts for the student (desc by recency). No pagination.
 * @returns 200 { ok, rows: AttemptRow[], total: number, truncated: boolean }
 */
export async function getStudentAttemptsInternal(req: Request, res: Response) {
  try {
    const secret = sharedSecret();
    if (!secret || req.header("x-quiz-secret") !== secret) {
      return res.status(401).json({ ok: false, message: "Unauthorized" });
    }

    const { studentId } = (req.body ?? {}) as { studentId?: string };
    if (!studentId || !Types.ObjectId.isValid(studentId)) {
      return res.status(400).json({ ok: false, message: "Invalid studentId" });
    }

    const filter = { studentId: new Types.ObjectId(studentId) };
    const total = await AttemptModel.countDocuments(filter);

    const rowsRaw = await AttemptModel.find(filter)
      .select({
        scheduleId: 1,
        quizId: 1,
        quizRootId: 1,
        quizVersion: 1,
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
      })
      .sort({ finishedAt: -1, startedAt: -1, createdAt: -1 })
      .lean();

    const metaMap = await getLiveMetaMapFromRows(rowsRaw);
    const rows = (rowsRaw || []).map((r: any) => {
      const snap: AttemptSpecEnvelope = r.quizVersionSnapshot || ({} as any);
      const liveMeta = metaMap.get(String(r.quizRootId)) || null;
      const quizType = snap.quizType ?? null;

      return {
        _id: r._id,
        scheduleId: r.scheduleId,
        quizId: r.quizId,
        quizRootId: r.quizRootId ?? null,
        quizVersion: typeof r.quizVersion === "number" ? r.quizVersion : null,
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
          name: liveMeta?.name ?? null,
          subject: liveMeta?.subject ?? null,
          subjectColorHex: liveMeta.subjectColorHex || null,
          topic: liveMeta?.topic ?? null,
          quizType,
          typeColorHex: quizType
            ? QUIZ_TYPE_COLORS[quizType as QuizTypeKey]
            : undefined,
          contentHash: snap.contentHash ?? null,
        },
      };
    });

    return res.json({
      ok: true,
      rows,
      total,
      truncated: rows.length < total,
    });
  } catch (e) {
    console.error("[getStudentAttemptsInternal] error", e);
    return res
      .status(500)
      .json({ ok: false, message: "Internal server error" });
  }
}

/**
 * @route  POST /attempt/internal/schedule-student
 * @auth   S2S via x-quiz-secret
 * @body   { scheduleId: string(ObjectId), studentId: string(ObjectId) }
 * @logic  Return all attempts for a student within a schedule (desc by recency).
 * @returns 200 { ok: true, rows: AttemptRow[] }
 */
export async function getAttemptsForScheduleByStudentInternal(
  req: Request,
  res: Response
) {
  try {
    // Shared-secret guard
    const secret = sharedSecret();
    if (!secret || req.header("x-quiz-secret") !== secret) {
      return res.status(401).json({ ok: false, message: "Unauthorized" });
    }

    const { scheduleId, studentId } = (req.body ?? {}) as {
      scheduleId?: string;
      studentId?: string;
    };

    if (!scheduleId || !Types.ObjectId.isValid(scheduleId)) {
      return res.status(400).json({ ok: false, message: "Invalid scheduleId" });
    }
    if (!studentId || !Types.ObjectId.isValid(studentId)) {
      return res.status(400).json({ ok: false, message: "Invalid studentId" });
    }

    const filter = {
      scheduleId: new Types.ObjectId(scheduleId),
      studentId: new Types.ObjectId(studentId),
    };

    const rowsRaw = await AttemptModel.find(filter)
      .select({
        scheduleId: 1,
        quizId: 1,
        quizRootId: 1,
        quizVersion: 1,
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
      })
      .sort({ finishedAt: -1, startedAt: -1, createdAt: -1 })
      .lean();

    const metaMap = await getLiveMetaMapFromRows(rowsRaw);
    const rows = (rowsRaw || []).map((r: any) => {
      const snap: AttemptSpecEnvelope = r.quizVersionSnapshot || ({} as any);
      const liveMeta = metaMap.get(String(r.quizRootId)) || null;
      const quizType = snap.quizType ?? null;

      return {
        _id: r._id,
        scheduleId: r.scheduleId,
        quizId: r.quizId,
        quizRootId: r.quizRootId ?? null,
        quizVersion: typeof r.quizVersion === "number" ? r.quizVersion : null,
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
          name: liveMeta?.name ?? null,
          subject: liveMeta?.subject ?? null,
          subjectColorHex: liveMeta.subjectColorHex || null,
          topic: liveMeta?.topic ?? null,
          quizType,
          typeColorHex: quizType
            ? QUIZ_TYPE_COLORS[quizType as QuizTypeKey]
            : undefined,
          contentHash: snap.contentHash ?? null,
        },
      };
    });

    return res.json({ ok: true, rows });
  } catch (e) {
    console.error("[getAttemptsForScheduleByStudentInternal] error", e);
    return res
      .status(500)
      .json({ ok: false, message: "Internal server error" });
  }
}
