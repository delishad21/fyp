import { Response } from "express";
import mongoose, { Types } from "mongoose";
import { CustomRequest } from "../middleware/access-control";
import { ClassModel, IAssignedQuiz } from "../model/class/class-model";
import {
  validateScheduleCreate,
  validateScheduleEdit,
} from "../model/class/schedule-validation";
import { fetchScheduledQuizStats } from "../utils/quiz-svc-client";
import {
  stats_onScheduleContributionChanged,
  stats_onScheduleRemoved,
} from "./stats-controller";
import { StudentClassStatsModel } from "../model/stats/student-stats-model";
import { ScheduleStatsModel } from "../model/stats/scheduled-quiz-stats-model";
import { IStudent } from "../model/students/student-model";
import {
  rangesOverlap,
  attachQuizMeta,
  scheduleOut,
  fetchQuizMetaOnce,
  extractClassTimezone,
  hasScheduleConflict,
  httpError,
  loadClassById,
  fetchQuizMetaBatch,
  buildRosterMap,
  computeAggregates,
  enrichCanonicals,
  loadCanonicalAttempts,
  AttemptableRow,
  normalizeAllowedAttempts,
} from "../utils/schedule-utils";

/** ---------- controllers ---------- */

/**
 * @route  POST /classes/:id/schedule
 * @auth   verifyAccessToken + verifyClassOwnerOrAdmin
 * @input  Params: { id }
 *         Body:   {
 *           quizId, startDate, endDate,
 *           contribution?,                 // number > 0 (default 100)
 *           attemptsAllowed?,              // integer 1..10 (default 1)
 *           showAnswersAfterAttempt?,      // boolean (default false)
 *           quizName?, subject?, subjectColor?,  // optional snapshots
 *           extra?
 *         }
 * @notes  - Uses the CLASS timezone (Class.timezone) for time validation; any timezone in the body is ignored.
 *         - Allows multiple entries per quizId, but rejects any **time overlap** with the same quizId.
 *         - Snapshots quiz meta (name/subject/color) best-effort at create time.
 *         - `attemptsAllowed` is clamped to [1,10]; `showAnswersAfterAttempt` defaults to false.
 *         - Does **not** write any assigned counts; participation is derived from the schedule at read time.
 * @logic  1) Load class to obtain its timezone.
 *         2) Validate payload with validateScheduleInput(..., { timeZone: class.timezone }).
 *         3) Normalize contribution, attemptsAllowed, showAnswersAfterAttempt.
 *         4) Fetch quiz metadata once (used for both snapshot + response).
 *         5) In a TX: enforce overlap rule, push entry, save.
 *         6) Return saved entry enriched with the same fetched quiz meta.
 * @returns 201 { ok, data: IAssignedQuizWithMeta }
 * @errors  400 invalid payload (fieldErrors included)
 *          404 class not found
 *          409 overlapping schedule for same quizId
 *          500 internal server error
 */

export async function addScheduleItem(req: CustomRequest, res: Response) {
  const session = await mongoose.startSession();
  try {
    const { id } = req.params;
    const item = req.body ?? {};

    const c0 = await loadClassById(id);
    const classTZ = extractClassTimezone(c0);

    const { isValid, fieldErrors } = validateScheduleCreate(item, {
      timeZone: classTZ,
    });
    if (!isValid)
      return res
        .status(400)
        .json({ ok: false, message: "Invalid input", fieldErrors });

    const startDate = new Date(item.startDate);
    const endDate = new Date(item.endDate);
    const raw = Number(item.contribution);
    const contribution = Number.isFinite(raw) && raw > 0 ? raw : 100;

    // NEW: sanitize optional fields
    const attemptsAllowed = Math.min(
      10,
      Math.max(1, Number(item.attemptsAllowed ?? 1))
    );
    const showAnswersAfterAttempt = Boolean(
      item.showAnswersAfterAttempt ?? false
    );

    const quizMeta = await fetchQuizMetaOnce(String(item.quizId));
    if (!quizMeta)
      return res
        .status(400)
        .json({ ok: false, message: "Failed to fetch quiz metadata" });

    let savedEntry: any;

    await session.withTransaction(async () => {
      const c = await ClassModel.findById(id).session(session);
      if (!c) throw httpError(404, "Class not found (race)");

      if (hasScheduleConflict(c.schedule, item.quizId, startDate, endDate))
        throw httpError(
          409,
          "This quiz already has a schedule overlapping the selected time range."
        );

      const snap: Partial<IAssignedQuiz> = {
        quizName: quizMeta.name,
        subject: quizMeta.subject,
        subjectColor: quizMeta.subjectColorHex,
        topic: quizMeta.topic,
      };

      const newEntry: any = {
        quizId: String(item.quizId),
        startDate,
        endDate,
        contribution,
        attemptsAllowed,
        showAnswersAfterAttempt,
        ...snap,
        ...(item.extra ?? {}),
      };

      c.schedule.push(newEntry);
      await c.save({ session });
      savedEntry = c.schedule[c.schedule.length - 1];
    });

    return res
      .status(201)
      .json({ ok: true, data: attachQuizMeta(savedEntry, quizMeta) });
  } catch (e: any) {
    console.error("[addQuizSchedule] error", e);
    return res
      .status(e._http || 500)
      .json({ ok: false, message: e.message || "Internal server error" });
  } finally {
    session.endSession();
  }
}

/**
 * @route  PATCH /classes/:id/schedule/item/:scheduleId
 * @auth   verifyAccessToken + verifyClassOwnerOrAdmin
 * @input  Params: { id, scheduleId }
 *         Body:   Partial schedule item (no timezone):
 *           {
 *             startDate?, endDate?, contribution?,
 *             attemptsAllowed?,             // integer 1..10
 *             showAnswersAfterAttempt?,     // boolean
 *             extra?
 *           }
 * @notes  - Uses the CLASS timezone (Class.timezone) for all validation; **ignores** any timezone from the client.
 *         - Validates via validateScheduleEdit(patch, existing, { timeZone }).
 *         - Enforces no time overlap with *other* entries of the same quizId.
 *         - `attemptsAllowed` is validated and clamped to [1,10] if provided.
 *         - If the contribution changes, it adjusts every affected student's overallScore
 *           **inside the SAME transaction** via stats_onScheduleContributionChanged (atomic with class save).
 * @returns 200 { ok, data: IAssignedQuizWithMeta }
 * @errors  400 invalid payload (fieldErrors included)
 *          404 class or schedule item not found
 *          409 overlapping schedule for same quizId
 *          500 internal server error
 */

export async function editScheduleItem(req: CustomRequest, res: Response) {
  const session = await mongoose.startSession();
  let updatedItem: any;
  try {
    await session.withTransaction(async () => {
      const { id, scheduleId } = req.params;
      const patch = req.body ?? {};

      const c = await ClassModel.findById(id).session(session);
      if (!c) throw httpError(404, "Class not found");

      const idx = c.schedule.findIndex(
        (s: any) => String(s._id) === scheduleId
      );
      if (idx === -1) throw httpError(404, "Schedule item not found");

      const target = c.schedule[idx];
      const classTZ = extractClassTimezone(c);

      const { isValid, fieldErrors } = validateScheduleEdit(
        patch,
        { startDate: target.startDate, endDate: target.endDate },
        { timeZone: classTZ }
      );
      if (!isValid) {
        const err = httpError(400, "Invalid input");
        err.fieldErrors = fieldErrors;
        throw err;
      }

      const nextStart = new Date(patch.startDate ?? target.startDate);
      const nextEnd = new Date(patch.endDate ?? target.endDate);

      if (
        hasScheduleConflict(c.schedule, target.quizId, nextStart, nextEnd, idx)
      )
        throw httpError(
          409,
          "This quiz already has a schedule overlapping the selected time range."
        );

      const oldContribution = Number(target.contribution ?? 100);
      let nextContribution = oldContribution;
      if (patch.contribution != null) {
        const raw = Number(patch.contribution);
        if (!Number.isFinite(raw) || raw <= 0) {
          const err = httpError(400, "Invalid input");
          err.fieldErrors = {
            contribution: "Contribution must be greater than 0.",
          };
          throw err;
        }
        nextContribution = raw;
      }

      // NEW: attemptsAllowed & showAnswersAfterAttempt
      if (patch.attemptsAllowed != null) {
        const num = Number(patch.attemptsAllowed);
        if (!Number.isFinite(num) || num < 1 || num > 10) {
          const err = httpError(400, "Invalid input");
          err.fieldErrors = {
            attemptsAllowed:
              "attemptsAllowed must be an integer between 1 and 10.",
          };
          throw err;
        }
        (target as any).attemptsAllowed = Math.trunc(num);
      }
      if (patch.showAnswersAfterAttempt != null) {
        (target as any).showAnswersAfterAttempt = Boolean(
          patch.showAnswersAfterAttempt
        );
      }

      target.startDate = nextStart;
      target.endDate = nextEnd;
      target.contribution = nextContribution;

      if (patch.extra && typeof patch.extra === "object") {
        for (const [k, v] of Object.entries(patch.extra)) {
          if (
            [
              "startDate",
              "endDate",
              "contribution",
              "attemptsAllowed",
              "showAnswersAfterAttempt",
            ].includes(k)
          )
            continue;
          (target as any)[k] = v;
        }
      }

      c.markModified("schedule");
      await c.save({ session });

      if (nextContribution !== oldContribution) {
        await stats_onScheduleContributionChanged(
          c._id,
          String(target._id),
          oldContribution,
          nextContribution,
          { session }
        );
      }

      updatedItem = target;
    });

    const live = await fetchQuizMetaOnce(String(updatedItem.quizId));
    return res.json({ ok: true, data: attachQuizMeta(updatedItem, live) });
  } catch (e: any) {
    console.error("[editScheduleItem] error", e);
    return res.status(e._http || 500).json({
      ok: false,
      message: e.message || "Internal server error",
      ...(e.fieldErrors ? { fieldErrors: e.fieldErrors } : {}),
    });
  } finally {
    session.endSession();
  }
}

/**
 * @route  GET /classes/:id/schedule
 * @auth   verifyAccessToken + verifyClassOwnerOrAdmin
 * @input  Params: { id }
 * @logic  1) Load class
 *         2) Batch fetch live quiz meta and map over items
 * @returns 200 { ok, data: IAssignedQuizWithMeta[] }
 * @errors  404 class not found
 *          500 internal server error
 */
export async function getSchedule(req: CustomRequest, res: Response) {
  try {
    const { id } = req.params;
    const c = await loadClassById(id);
    const items = c.schedule || [];

    const ids = Array.from(new Set(items.map((s: any) => String(s.quizId))));
    const byId = await fetchQuizMetaBatch(ids);

    const data = items.map((s: any) =>
      attachQuizMeta(s, byId[String(s.quizId)])
    );
    return res.json({ ok: true, data });
  } catch (e: any) {
    console.error("[getSchedule] error", e);
    return res.status(e._http || 500).json({ ok: false, message: e.message });
  }
}

/**
 * @route   GET /classes/:id/schedule/item/:scheduleId
 * @auth    verifyAccessToken + verifyClassOwnerOrAdmin
 *
 * @input   Params: { id, scheduleId }
 *          Query:  openAnswerMinPct?=number (e.g., 0.05)
 *
 * @notes
 *  - Stats are computed **only** from canonical attempts for this schedule.
 *  - If there are no canonicals: returns schedule + live meta + zeroed stats
 *    without calling the quiz service.
 *  - Enriches canonical attempts with student display info:
 *      { displayName, photoUrl, score, maxScore, pct, finishedAt }.
 *  - Also returns overall class-level participation/averages:
 *      - participants, totalStudents, participationPct
 *      - sumScore, sumMax, avgPct
 *      - avgAbsScore, avgAbsMax  (per-participant absolute average)
 *
 * @logic
 *  1) Load class and schedule item.
 *  2) Attach live quiz meta when available (quizType/topic/typeColorHex/subjectColor/name).
 *  3) Collect canonical attemptIds + per-attempt scores/timestamps.
 *  4) Derive class-level aggregates (participants, totalStudents, % and averages).
 *  5) If no canonicals → return meta + empty attempts + zeroed stats (with derived aggregates).
 *  6) Else call quiz-svc `/attempt/internal/scheduled-quiz-stats` and merge results with derived aggregates.
 *
 * @returns 200 {
 *   ok: true,
 *   data: {
 *     _id: string,
 *     quizId: string,
 *     startDate: string,
 *     endDate: string,
 *     contribution?: number,
 *     quizName?: string,
 *     subject?: string,
 *     subjectColor?: string,
 *     quizType?: string,
 *     topic?: string,
 *     typeColorHex?: string,
 *     canonicalAttemptIds: string[],
 *     canonicalAttempts: any[],
 *     stats: (Large Object, use postman to view)
 *   }
 * }
 *
 * @errors  404 class or schedule item not found
 *          502 quiz service error
 *          500 internal server error
 */
export async function getScheduleItemById(req: CustomRequest, res: Response) {
  try {
    const classId = String(req.params.id);
    const scheduleId = String(req.params.scheduleId);

    // 1) Class & schedule
    const cls = await loadClassById(classId);
    const item = (cls.schedule || []).find(
      (s: any) => String(s._id) === String(scheduleId)
    );
    if (!item) throw httpError(404, "Schedule item not found");

    const quizId = String(item.quizId);

    // Build roster map for display info
    const rosterByUserId = buildRosterMap(cls.students);

    // 2) Live meta
    const live = await fetchQuizMetaOnce(quizId);
    const withMeta = attachQuizMeta(item, live);

    // 3) Canonicals
    const canonicals = await loadCanonicalAttempts(classId, scheduleId);
    const attemptIds = canonicals
      .filter((c) => c != null)
      .map((c) => c.attemptId);

    // Derived overall participation + aggregates
    const totalEligible = Array.isArray(cls.students)
      ? Number(cls.students.length)
      : 0;
    const aggregates = computeAggregates(canonicals, totalEligible);

    // Parse optional openAnswerMinPct
    const openAnswerMinPctRaw = req.query.openAnswerMinPct as
      | string
      | undefined;
    const openAnswerMinPct = Number.isFinite(Number(openAnswerMinPctRaw))
      ? Number(openAnswerMinPctRaw)
      : undefined;

    // Enriched canonical attempts
    const canonicalAttemptsDetailed = enrichCanonicals(
      canonicals,
      rosterByUserId
    );

    // 4) No canonicals → return zeroed stats + derived fields
    if (attemptIds.length === 0) {
      return res.json({
        ok: true,
        data: {
          ...withMeta,
          canonicalAttemptIds: [],
          canonicalAttempts: [],
          stats: {
            kind: "none",
            attemptsCount: 0,
            breakdown: { items: [], overallAvgScore: 0, overallAvgScorePct: 0 },
            ...aggregates,
          },
        },
      });
    }

    // 5) Quiz-svc S2S
    const svcRes = await fetchScheduledQuizStats({
      scheduleId,
      attemptIds,
      classId,
      quizId,
      ...(typeof openAnswerMinPct === "number" ? { openAnswerMinPct } : {}),
    });

    const svcStats = (svcRes?.data ?? {}) as any;
    const mergedStats = {
      ...svcStats,
      attemptsCount: svcStats.attemptsCount ?? aggregates.participants,
      participants: svcStats.participants ?? aggregates.participants,
      totalStudents: aggregates.totalStudents,
      participationPct:
        svcStats.participationPct ?? aggregates.participationPct,
      sumScore: svcStats.sumScore ?? aggregates.sumScore,
      sumMax: svcStats.sumMax ?? aggregates.sumMax,
      avgPct: svcStats.avgPct ?? aggregates.avgPct,
      avgAbsScore:
        typeof svcStats.avgAbsScore === "number"
          ? svcStats.avgAbsScore
          : aggregates.avgAbsScore,
      avgAbsMax:
        typeof svcStats.avgAbsMax === "number"
          ? svcStats.avgAbsMax
          : aggregates.avgAbsMax,
    };

    // 6) Response
    return res.json({
      ok: true,
      data: {
        ...withMeta,
        canonicalAttemptIds: attemptIds,
        canonicalAttempts: canonicalAttemptsDetailed,
        stats: mergedStats,
      },
    });
  } catch (e: any) {
    console.error("[getScheduleItemById] error", e);
    return res
      .status(e._http || 500)
      .json({ ok: false, message: e.message || "Internal server error" });
  }
}

/**
 * @route  DELETE /classes/:id/schedule/quiz/:quizId
 * @auth   verifyAccessToken + verifyClassOwnerOrAdmin
 * @input  Params: { id, quizId }
 * @notes  - Computes the list of scheduleIds **and their contributions** inside the transaction (race-safe).
 *         - Removes the items inside the TX.
 *         - **After commit**, adjusts stats for each removed scheduleId by calling
 *           stats_onScheduleRemoved(classId, scheduleId, contribution).
 *           (We pass the captured contribution so stats don’t need to read a schedule that no longer exists.)
 * @logic  1) TX: load class, collect {scheduleId, contribution} for this quizId, remove them, save.
 *         2) After commit: call stats_onScheduleRemoved(classId, scheduleId, contribution) for each removed item.
 * @returns 200 { ok, data: Class.schedule[] (plain) }
 * @errors  404 class not found
 *          500 internal server error
 */
export async function removeAllForQuizId(req: CustomRequest, res: Response) {
  const session = await mongoose.startSession();
  try {
    const { id, quizId } = req.params;
    let removed: Array<{ id: string; contribution: number }> = [];
    let outSchedule: any[] = [];

    await session.withTransaction(async () => {
      const c = await ClassModel.findById(id).session(session);
      if (!c)
        return res.status(404).json({ ok: false, message: "Class not found" });

      removed = (c.schedule || [])
        .filter((s: any) => String(s.quizId) === String(quizId))
        .map((s: any) => ({
          id: String(s._id),
          contribution: Number(s.contribution ?? 100),
        }));

      c.schedule = c.schedule.filter(
        (s: any) => String(s.quizId) !== String(quizId)
      );
      await c.save({ session });
      outSchedule = scheduleOut(c);
    });

    if (res.headersSent) return;
    for (const r of removed)
      await stats_onScheduleRemoved(String(id), r.id, r.contribution);
    return res.json({ ok: true, data: outSchedule });
  } catch (e: any) {
    console.error("[removeAllForQuizId] error", e);
    return res
      .status(500)
      .json({ ok: false, message: "Internal server error" });
  } finally {
    session.endSession();
  }
}

/**
 * @route  DELETE /classes/:id/schedule/item/:scheduleId
 * @auth   verifyAccessToken + verifyClassOwnerOrAdmin
 * @input  Params: { id, scheduleId }
 * @notes  - Verifies existence and captures {scheduleId, contribution} **inside** the TX, then removes the item.
 *         - Performs stats adjustments **after commit** by calling
 *           stats_onScheduleRemoved(classId, scheduleId, contribution).
 *         - This ensures stats routines see the final canonical schedule and don’t need to read a deleted doc.
 * @logic  1) TX: load class, locate target, capture contribution, remove it, save.
 *         2) After commit: stats_onScheduleRemoved(classId, scheduleId, contribution).
 * @returns 200 { ok, data: Class.schedule[] (plain) }
 * @errors  404 class or schedule item not found
 *          500 internal server error
 */
export async function removeScheduleItem(req: CustomRequest, res: Response) {
  const session = await mongoose.startSession();
  try {
    const { id, scheduleId } = req.params;
    let removedId: string | undefined;
    let removedContribution: number | undefined;
    let outSchedule: any[] = [];

    await session.withTransaction(async () => {
      const c = await ClassModel.findById(id).session(session);
      if (!c)
        return res.status(404).json({ ok: false, message: "Class not found" });

      const target = (c.schedule || []).find(
        (s: any) => String(s._id) === scheduleId
      );
      if (!target)
        return res
          .status(404)
          .json({ ok: false, message: "Schedule item not found" });

      removedId = scheduleId;
      removedContribution = Number(target.contribution ?? 100);

      c.schedule = c.schedule.filter((s: any) => String(s._id) !== scheduleId);
      await c.save({ session });
      outSchedule = scheduleOut(c);
    });

    if (res.headersSent) return;
    if (removedId && typeof removedContribution === "number")
      await stats_onScheduleRemoved(String(id), removedId, removedContribution);

    return res.json({ ok: true, data: outSchedule });
  } catch (e: any) {
    console.error("[removeScheduleItem] error", e);
    return res
      .status(500)
      .json({ ok: false, message: "Internal server error" });
  } finally {
    session.endSession();
  }
}

/**
 * @route  GET /classes/:id/schedule/available
 * @auth   verifyAccessToken + verifyClassOwnerOrAdmin
 * @input  Params: { id }
 *         Query:
 *           - now?=ISO string (optional; defaults to server time)
 *         Notes:
 *           - “Available” means startDate <= now (endDate is not checked here; add if you want open-window only).
 *           - Response surfaces `attemptsAllowed` and `showAnswersAfterAttempt` for each item.
 * @logic  1) Load class
 *         2) Filter schedule for items with startDate <= now
 *         3) Batch fetch quiz meta for those items
 *         4) Batch fetch ScheduleStats for (classId, scheduleIds)
 *         5) Attach meta + stats + schedule config (attemptsAllowed/showAnswersAfterAttempt) and return
 * @returns 200 { ok, data: Array<AssignedQuizWithMetaAndStats> }
 * @errors  404 class not found
 *          500 internal server error
 */

export async function getAvailableScheduleWithStats(
  req: CustomRequest,
  res: Response
) {
  try {
    const { id } = req.params;
    const cls = await ClassModel.findById(id)
      .select({ schedule: 1, students: 1 })
      .lean<{ schedule?: IAssignedQuiz[]; students?: IStudent[] } | null>();
    if (!cls)
      return res.status(404).json({ ok: false, message: "Class not found" });

    const numStudents = Array.isArray(cls.students) ? cls.students.length : 0;
    const nowParam = String(req.query?.now || "");
    const now = nowParam ? new Date(nowParam) : new Date();
    const isValidNow = !Number.isNaN(now.getTime());
    const effectiveNow = isValidNow ? now : new Date();

    const allItems = Array.isArray(cls.schedule) ? cls.schedule : [];
    const available = allItems.filter((s) => {
      const start = new Date(s.startDate);
      return !Number.isNaN(start.getTime()) && start <= effectiveNow;
    });

    if (available.length === 0) return res.json({ ok: true, data: [] });

    const quizIds = Array.from(new Set(available.map((s) => String(s.quizId))));
    const metaById = await fetchQuizMetaBatch(quizIds);

    const scheduleIds = available
      .map((s: any) => String(s._id))
      .filter(Boolean);
    const statRows = await ScheduleStatsModel.find({
      classId: new Types.ObjectId(id),
      scheduleId: { $in: scheduleIds.map((x) => new Types.ObjectId(x)) },
    })
      .select({
        scheduleId: 1,
        quizId: 1,
        participants: 1,
        sumScore: 1,
        sumMax: 1,
        updatedAt: 1,
      })
      .lean();

    const statsByScheduleId: Record<string, any> = {};
    for (const r of statRows) {
      const key = String(r.scheduleId);
      const participants = Number(r.participants || 0);
      const sumScore = Number(r.sumScore || 0);
      const sumMax = Number(r.sumMax || 0);
      const avgPct = sumMax > 0 ? Math.round((sumScore / sumMax) * 100) : 0;
      statsByScheduleId[key] = {
        participants,
        sumScore,
        sumMax,
        avgPct,
        updatedAt: r.updatedAt
          ? new Date(r.updatedAt).toISOString()
          : undefined,
      };
    }

    const data = available.map((s) => {
      const sid = String(s._id || "");
      const qid = String(s.quizId);
      const meta = metaById[qid];
      const stats = statsByScheduleId[sid] || {
        participants: 0,
        sumScore: 0,
        sumMax: 0,
        avgPct: 0,
      };
      const participants = stats.participants;
      const participationPct =
        numStudents > 0 ? Math.round((participants / numStudents) * 100) : 0;
      const avgAbsScore =
        participants > 0 ? Math.round(stats.sumScore / participants) : 0;
      const avgAbsMax =
        participants > 0 ? Math.round(stats.sumMax / participants) : 0;

      return {
        _id: sid,
        quizId: qid,
        startDate: s.startDate,
        endDate: s.endDate,
        contribution: typeof s.contribution === "number" ? s.contribution : 100,

        attemptsAllowed:
          typeof s.attemptsAllowed === "number" ? s.attemptsAllowed : 1,
        showAnswersAfterAttempt: Boolean(s.showAnswersAfterAttempt),

        quizName: meta?.name ?? s.quizName ?? null,
        subject: meta?.subject ?? s.subject ?? null,
        subjectColor: meta?.subjectColorHex ?? s.subjectColor ?? null,
        topic: meta?.topic ?? s.topic ?? null,
        quizType: meta?.quizType ?? null,
        stats: {
          participants,
          totalStudents: numStudents,
          participationPct,
          sumScore: stats.sumScore,
          sumMax: stats.sumMax,
          avgPct: stats.avgPct,
          avgAbsScore,
          avgAbsMax,
          updatedAt: stats.updatedAt ?? null,
        },
      };
    });

    return res.json({ ok: true, data });
  } catch (e: any) {
    console.error("[getAvailableScheduleWithStats] error", e);
    return res.status(e._http || 500).json({ ok: false, message: e.message });
  }
}
