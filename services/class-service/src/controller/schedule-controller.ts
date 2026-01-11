import { Response } from "express";
import mongoose, { Types } from "mongoose";
import { CustomRequest } from "../middleware/access-control";
import { ClassModel, IAssignedQuiz } from "../model/class/class-model";
import {
  validateScheduleCreate,
  validateScheduleEdit,
} from "../model/class/schedule-validation";
import {
  fetchQuizVersionsForRoot,
  fetchScheduledQuizStats,
  QuizSvcBatchRow,
  QuizCanonicalSelector,
} from "../utils/quiz-svc-client";
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
  getDayKeyInTZ,
  isScheduleOnDayInTZ,
} from "../utils/schedule-utils";
import {
  buildScheduleUpdatedEvent,
  emitScheduleUpdated,
} from "../utils/events/schedule-events";
import { enqueueEvent } from "../utils/events/outbox-enqeue";

/** ---------- controllers ---------- */

/**
 * @route  POST /classes/:id/schedule
 * @auth   verifyAccessToken + verifyTeacherOfClass (via middleware)
 * @input  Params: { id: string }
 *         Body: {
 *           quizRootId: string;
 *           quizVersion: number;
 *           startDate: ISO string;
 *           endDate: ISO string;
 *           contribution?: number;
 *           attemptsAllowed?: number;
 *           showAnswersAfterAttempt?: boolean;
 *           extra?: Record<string, any>;
 *         }
 * @notes  - Uses canonical quiz identity (rootQuizId + quizVersion) for de-duplication and
 *           overlap checks.
 *         - Validates payload with `validateScheduleCreate` using the class timezone.
 *         - Fetches quiz metadata from quiz-svc (`fetchQuizMetaOnce`) and derives the concrete
 *           quiz document id (`quizId`).
 *         - Runs in a MongoDB transaction:
 *             - Re-loads the Class document inside the session.
 *             - Uses `hasScheduleConflict` to prevent overlapping schedules for the same
 *               canonical quiz identity.
 *             - Appends a new schedule entry with quiz meta snapshots (name, subject, topic,
 *               subjectColor).
 *         - Does NOT emit stats or events here; downstream stats are updated when attempts
 *           actually happen.
 *         - Requires MongoDB transactions support (replica set / sharded).
 * @logic  1) Load class via `loadClassById` and extract timezone (`extractClassTimezone`).
 *         2) Validate body via `validateScheduleCreate`.
 *         3) Fetch quiz meta via canonical identity and derive `quizId`.
 *         4) In a session:
 *              a. Re-load Class.
 *              b. Check for conflicts with `hasScheduleConflict`.
 *              c. Push new schedule row and save.
 *         5) Attach quiz meta via `attachQuizMeta` and return created schedule item.
 * @returns 201 { ok: true, data: ApiScheduleItemWithMeta }
 * @errors  400 invalid input or quiz meta fetch failure
 *          404 class not found (race condition)
 *          409 overlapping schedule for same quiz canonical identity
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
    if (!isValid) {
      return res
        .status(400)
        .json({ ok: false, message: "Invalid input", fieldErrors });
    }

    const startDate = new Date(item.startDate);
    const endDate = new Date(item.endDate);
    const raw = Number(item.contribution);
    const contribution = Number.isFinite(raw) && raw > 0 ? raw : 100;

    // Canonical quiz identity (must be valid per validator)
    const quizRootId = String(item.quizRootId);
    const quizVersion = Number(item.quizVersion);

    // Attempts config
    const attemptsAllowed = Math.min(
      10,
      Math.max(1, Number(item.attemptsAllowed ?? 1))
    );
    const showAnswersAfterAttempt = Boolean(
      item.showAnswersAfterAttempt ?? true
    );

    // Fetch quiz meta via canonical identity, and derive concrete quizId
    const quizMeta = await fetchQuizMetaOnce(quizRootId, quizVersion);
    if (!quizMeta) {
      return res.status(400).json({
        ok: false,
        message: "Failed to fetch quiz metadata for specified root/version",
      });
    }
    const quizId = String(quizMeta._id);

    let savedEntry: any;

    await session.withTransaction(async () => {
      const c = await ClassModel.findById(id).session(session);
      if (!c) throw httpError(404, "Class not found (race)");

      // Conflict check uses canonical identity only
      if (
        hasScheduleConflict(
          c.schedule,
          { quizRootId, quizVersion },
          startDate,
          endDate
        )
      ) {
        throw httpError(
          409,
          "This quiz version already has a schedule overlapping the selected time range."
        );
      }

      const snap: Partial<IAssignedQuiz> = {
        quizName: quizMeta.name,
        subject: quizMeta.subject,
        subjectColor: quizMeta.subjectColorHex,
        topic: quizMeta.topic,
      };

      const newEntry: any = {
        quizId,
        quizRootId,
        quizVersion,
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
    console.error("[addScheduleItem] error", e);
    return res
      .status(e._http || 500)
      .json({ ok: false, message: e.message || "Internal server error" });
  } finally {
    session.endSession();
  }
}

/**
 * @route  PATCH /classes/:id/schedule/item/:scheduleId
 * @auth   verifyAccessToken + verifyTeacherOfClass (via middleware)
 * @input  Params: { id: string; scheduleId: string }
 *         Body (partial patch):
 *           - startDate?: ISO string
 *           - endDate?: ISO string
 *           - contribution?: number
 *           - attemptsAllowed?: number (1..10)
 *           - showAnswersAfterAttempt?: boolean
 *           - quizVersion?: number (positive integer)
 *           - extra?: Record<string, any> (excluding protected keys)
 * @notes  - Edits a single schedule item in-place.
 *         - Validates the patch with `validateScheduleEdit` using the existing start/end and
 *           class timezone.
 *         - Canonical quiz identity must already be present on the row (quizRootId + quizVersion).
 *         - If `quizVersion` changes:
 *             - Fetches all versions from quiz-svc (`fetchQuizVersionsForRoot`).
 *             - Verifies requested version exists and updates both canonical and concrete `quizId`.
 *         - Uses `hasScheduleConflict` with the *next* identity + dates to prevent overlaps
 *           with other schedule items for the same canonical quiz.
 *         - If `contribution` changes:
 *             - Calls `stats_onScheduleContributionChanged` (within the same transaction context).
 *         - If version changes:
 *             - Enqueues a `ScheduleUpdated` event via `buildScheduleUpdatedEvent` +
 *               `enqueueEvent` for cross-service invalidation.
 *         - Runs inside a MongoDB transaction and marks `schedule` as modified.
 * @logic  1) Start MongoDB session and wrap in `withTransaction`.
 *         2) Load Class by id and locate schedule item by scheduleId.
 *         3) Validate patch via `validateScheduleEdit`.
 *         4) Compute next start/end and next canonical quiz identity (root + version).
 *         5) If version changed:
 *              a. Fetch versions from quiz-svc and validate.
 *              b. Update `quizRootId`, `quizVersion`, and `quizId`.
 *         6) Enforce non-overlap via `hasScheduleConflict` (excluding current index).
 *         7) Apply contribution/attempts/flags/extra fields.
 *         8) Save class, then:
 *              - update stats if contribution changed
 *              - enqueue ScheduleUpdated event if version changed.
 *         9) After TX, best-effort fetch live quiz meta and attach via `attachQuizMeta`.
 * @returns 200 { ok: true, data: UpdatedApiScheduleItemWithMeta }
 * @errors  400 invalid input (fieldErrors propagated from validators)
 *          404 class or schedule item not found
 *          409 overlapping schedule for same quiz canonical identity
 *          500 invalid configuration (missing canonical identity) or internal error
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

      // Canonical identity must already be present on the schedule row
      const currentRoot = String((target as any).quizRootId || "");
      const currentVersion = Number((target as any).quizVersion);

      if (!currentRoot || !Number.isFinite(currentVersion)) {
        throw httpError(
          500,
          "Schedule item is missing quizRootId/quizVersion (invalid configuration)."
        );
      }

      // Determine next quiz version (may be changed by patch)
      let nextQuizRootId = currentRoot;
      let nextQuizVersion = currentVersion;
      let quizVersionChanged = false;

      if (patch.quizVersion != null) {
        const vNum = Number(patch.quizVersion);
        if (!Number.isFinite(vNum) || vNum <= 0) {
          const err = httpError(400, "Invalid input");
          err.fieldErrors = {
            quizVersion: "quizVersion must be a positive integer.",
          };
          throw err;
        }

        nextQuizVersion = vNum;
        quizVersionChanged = nextQuizVersion !== currentVersion;

        // Fetch all versions for this root and resolve concrete quizId
        const { versions } = await fetchQuizVersionsForRoot(nextQuizRootId);
        const match = (versions || []).find(
          (v: QuizSvcBatchRow) => v.version === nextQuizVersion
        );

        if (!match) {
          const err = httpError(400, "Invalid input");
          err.fieldErrors = {
            quizVersion: "Requested quiz version does not exist.",
          };
          throw err;
        }

        // Update canonical + concrete IDs
        (target as any).quizRootId = nextQuizRootId;
        (target as any).quizVersion = nextQuizVersion;
        (target as any).quizId = match._id;
      }

      // Overlap check must use *next* canonical identity
      if (
        hasScheduleConflict(
          c.schedule,
          { quizRootId: nextQuizRootId, quizVersion: nextQuizVersion },
          nextStart,
          nextEnd,
          idx
        )
      ) {
        throw httpError(
          409,
          "This quiz version already has a schedule overlapping the selected time range."
        );
      }

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

      // attemptsAllowed & showAnswersAfterAttempt
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
              "quizRootId",
              "quizVersion",
              "quizId",
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

      if (quizVersionChanged) {
        const evt = buildScheduleUpdatedEvent({
          classId: String(c._id),
          scheduleId: String(target._id),
          quizRootId: nextQuizRootId,
          previousVersion: currentVersion,
          newVersion: nextQuizVersion,
          action: "version_bumped",
        });
        await enqueueEvent("ScheduleUpdated", evt);
      }

      updatedItem = target;
    });

    // Fetch live meta via canonical identity (best-effort)
    let live: QuizSvcBatchRow | undefined;
    const uRoot = (updatedItem as any)?.quizRootId;
    const uVersion = (updatedItem as any)?.quizVersion;
    if (uRoot && typeof uVersion === "number") {
      live = await fetchQuizMetaOnce(String(uRoot), Number(uVersion));
    }

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
 * @auth   verifyAccessToken + verifyTeacherOfClassOrStudent (via middleware)
 * @input  Params: { id: string }
 *         Query: none
 * @notes  - Returns all schedule items for a single class, enriched with quiz metadata.
 *         - Uses `loadClassById` to fetch the Class or throw a 404 httpError.
 *         - Aggregates canonical selectors (rootQuizId + version) from each schedule row and
 *           calls `fetchQuizMetaBatch` once.
 *         - Each schedule item is passed through `attachQuizMeta` to combine:
 *             - on-row snapshots (quizName, subject, topic, subjectColor)
 *             - live quiz meta from quiz-svc (best-effort).
 *         - Does NOT include any stats or canonical attempts; this is a pure schedule read.
 *         - Returns timezone of the class.
 * @logic  1) Load Class via `loadClassById`.
 *         3) Collect canonical quiz selectors from `c.schedule`.
 *         4) Batch fetch quiz meta via `fetchQuizMetaBatch`.
 *         5) Map each schedule item through `attachQuizMeta` (lookup by root/version).
 *         6) Return array of enriched schedule items.
 * @returns 200 { ok: true, data: ApiScheduleItemWithMeta[] }
 * @errors  404 class not found (from `loadClassById`)
 *          500 internal server error
 */
export async function getSchedule(req: CustomRequest, res: Response) {
  try {
    const { id } = req.params;
    const c = await loadClassById(id);
    const items = c.schedule || [];

    const selectors: QuizCanonicalSelector[] = [];
    for (const s of items) {
      const root = (s as any).quizRootId;
      const version = (s as any).quizVersion;
      if (root && typeof version === "number") {
        selectors.push({
          rootQuizId: String(root),
          version: Number(version),
        });
      }
    }

    const byCanonical = await fetchQuizMetaBatch(selectors);

    const data = items.map((s: any) => {
      const root = (s as any).quizRootId;
      const version = (s as any).quizVersion;
      let meta: QuizSvcBatchRow | undefined;

      if (root && typeof version === "number") {
        const key = `${String(root)}:${Number(version)}`;
        meta = byCanonical[key];
      }

      return attachQuizMeta(s, meta);
    });

    return res.json({ ok: true, data });
  } catch (e: any) {
    console.error("[getSchedule] error", e);
    return res.status(e._http || 500).json({ ok: false, message: e.message });
  }
}

/**
 * @route   GET /classes/:id/schedule/item/:scheduleId
 * @auth    verifyAccessToken + verifyTeacherOfClass (via middleware)
 * @input   Params: { id: string; scheduleId: string }
 *          Query: { openAnswerMinPct?: number } (optional threshold for quiz-svc stats)
 * @notes   - Returns a single schedule item, enriched with:
 *             - live quiz metadata
 *             - list of canonical attempts
 *             - derived aggregates (participants, participationPct, sums, averages)
 *             - breakdown stats from quiz-svc (if any attempts exist).
 *           - Flow:
 *             - Loads Class and finds schedule row by scheduleId.
 *             - Builds a roster map (userId → student info) via `buildRosterMap`.
 *             - Uses canonical identity to fetch live quiz meta + all quiz versions.
 *             - Loads canonical attempts from local stats store via `loadCanonicalAttempts`.
 *             - Computes aggregates via `computeAggregates`.
 *             - If no attempts: returns zeroed stats and derived aggregates.
 *             - If attempts exist:
 *                 - Calls `fetchScheduledQuizStats` on quiz-svc, passing attemptIds + schedule context.
 *                 - Merges quiz-svc stats with local aggregates (fallback if svc is partial).
 *           - `openAnswerMinPct` allows callers to request stricter thresholds for considering
 *             open-ended answers correct, if supported by quiz-svc.
 * @logic   1) Load Class via `loadClassById`.
 *          2) Find schedule item by scheduleId; 404 if not found.
 *          3) Build roster map from `cls.students`.
 *          4) Fetch live quiz meta via canonical identity (`fetchQuizMetaOnce`) and resolve
 *             rootQuizId/version; also fetch all versions for the root (best-effort).
 *          5) Load canonical attempts for this class/schedule via `loadCanonicalAttempts`.
 *          6) Compute aggregates via `computeAggregates`.
 *          7) If no attempts:
 *               - return base payload + aggregates + zeroed stats.
 *          8) If attempts exist:
 *               - call `fetchScheduledQuizStats` with attemptIds (+ optional openAnswerMinPct).
 *               - merge svc stats with aggregates into `mergedStats`.
 *               - enrich canonical attempts with roster info via `enrichCanonicals`.
 *          9) Return payload with schedule + meta + canonical attempts + merged stats.
 * @returns 200 {
 *            ok: true,
 *            data: {
 *              ...scheduleWithMeta,
 *              rootQuizId?,
 *              quizVersion?,
 *              quizVersions?: QuizSvcBatchRow[],
 *              canonicalAttemptIds: string[],
 *              canonicalAttempts: AttemptableRow[],
 *              stats: {
 *                kind?: string,
 *                attemptsCount,
 *                participants,
 *                totalStudents,
 *                participationPct,
 *                sumScore,
 *                sumMax,
 *                avgPct,
 *                avgAbsScore,
 *                avgAbsMax,
 *                breakdown?: {...}
 *              }
 *            }
 *          }
 * @errors  404 class or schedule item not found
 *          400 invalid `openAnswerMinPct` (if non-numeric)
 *          500 internal server error or downstream quiz-svc failure
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

    const quizId = String(item.quizId); // still needed for stats endpoint

    // Build roster map for display info
    const rosterByUserId = buildRosterMap(cls.students);

    // 2) Live meta via canonical identity (best-effort)
    const itemRoot = (item as any).quizRootId
      ? String((item as any).quizRootId)
      : null;
    const itemVersion =
      typeof (item as any).quizVersion === "number"
        ? Number((item as any).quizVersion)
        : null;

    let live: QuizSvcBatchRow | undefined;
    if (itemRoot && itemVersion !== null) {
      live = await fetchQuizMetaOnce(itemRoot, itemVersion);
    }

    const withMeta = attachQuizMeta(item, live);

    // Derive rootQuizId + current version (prefer schedule row, fallback to meta)
    const rootQuizId =
      (withMeta as any).quizRootId ?? (live as any)?.rootQuizId ?? undefined;
    const quizVersion =
      (withMeta as any).quizVersion ?? (live as any)?.version ?? undefined;

    // 2b) Fetch all versions for this root (best-effort)
    let quizVersions: QuizSvcBatchRow[] = [];
    if (rootQuizId) {
      try {
        const v = await fetchQuizVersionsForRoot(String(rootQuizId));
        quizVersions = v.versions || [];
      } catch (err) {
        console.error(
          "[getScheduleItemById] failed to fetch quiz versions for rootQuizId",
          rootQuizId,
          err
        );
      }
    }

    const basePayload = {
      ...withMeta,
      ...(rootQuizId ? { rootQuizId: String(rootQuizId) } : {}),
      ...(typeof quizVersion === "number" ? { quizVersion } : {}),
      ...(quizVersions.length ? { quizVersions } : {}),
    };

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
          ...basePayload,
          canonicalAttemptIds: [],
          canonicalAttempts: [],
          stats: {
            kind: "none",
            attemptsCount: 0,
            breakdown: {
              items: [],
              overallAvgScore: 0,
              overallAvgScorePct: 0,
            },
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
        ...basePayload,
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
 * @auth   verifyAccessToken + verifyTeacherOfClass (via middleware)
 * @input  Params: { id: string; quizId: string }
 *         Query: none
 * @notes  - Removes *all* schedule items for a specific concrete `quizId` within a single class.
 *         - Runs inside a MongoDB transaction:
 *             - Loads Class by id.
 *             - Filters schedule array to remove all rows where schedule.quizId matches `quizId`.
 *             - Captures removed rows (id, contribution, quizRootId) for post-TX side effects.
 *         - After commit (and only if headers not already sent):
 *             - For each removed schedule row:
 *                 - calls `stats_onScheduleRemoved` to adjust local schedule statistics.
 *                 - emits a ScheduleUpdated event via `emitScheduleUpdated` if quizRootId is present.
 *         - Returns the updated schedule via `scheduleOut(c)` (post-removal shape).
 * @logic  1) Start MongoDB session and wrap in `withTransaction`.
 *         2) Load Class; 404 if not found.
 *         3) Compute list of removed schedule items and filter them out from `c.schedule`.
 *         4) Save class and build `outSchedule` via `scheduleOut(c)`.
 *         5) After TX:
 *              - call `stats_onScheduleRemoved` per removed schedule row.
 *              - emit ScheduleUpdated events for rows with quizRootId.
 *         6) Return updated schedule.
 * @returns 200 { ok: true, data: ApiScheduleItemWithMeta[] } (updated schedule)
 * @errors  404 class not found
 *          500 internal server error
 */
export async function removeAllForQuizId(req: CustomRequest, res: Response) {
  const session = await mongoose.startSession();
  try {
    const { id, quizId } = req.params;
    let removed: Array<{
      id: string;
      contribution: number;
      quizRootId?: string;
    }> = [];
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
          quizRootId: s.quizRootId ? String(s.quizRootId) : undefined,
        }));

      c.schedule = c.schedule.filter(
        (s: any) => String(s.quizId) !== String(quizId)
      );
      await c.save({ session });
      outSchedule = scheduleOut(c);
    });

    if (res.headersSent) return;

    // Stats + ScheduleUpdated events after commit
    for (const r of removed) {
      await stats_onScheduleRemoved(String(id), r.id, r.contribution);

      if (r.quizRootId) {
        await emitScheduleUpdated({
          classId: String(id),
          scheduleId: r.id,
          quizRootId: r.quizRootId,
          action: "deleted",
        });
      }
    }

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
 * @auth   verifyAccessToken + verifyTeacherOfClass (via middleware)
 * @input  Params: { id: string; scheduleId: string }
 *         Query: none
 * @notes  - Removes a single schedule item from a class.
 *         - Runs inside a MongoDB transaction:
 *             - Loads Class and locates the target schedule by scheduleId.
 *             - Removes it from the schedule array.
 *             - Captures its contribution and quizRootId for post-TX side effects.
 *         - After commit:
 *             - Calls `stats_onScheduleRemoved` once to update schedule statistics.
 *             - Emits a ScheduleUpdated event (action: "deleted") if quizRootId exists.
 *         - Returns the updated schedule snapshot via `scheduleOut(c)`.
 * @logic  1) Start MongoDB session and wrap in `withTransaction`.
 *         2) Load Class; 404 if not found.
 *         3) Find target schedule by scheduleId; 404 if missing.
 *         4) Remove item, record its contribution and quizRootId.
 *         5) Save class and compute `outSchedule` via `scheduleOut(c)`.
 *         6) After TX:
 *              - update stats via `stats_onScheduleRemoved`.
 *              - emit ScheduleUpdated event if quizRootId is present.
 *         7) Return updated schedule.
 * @returns 200 { ok: true, data: ApiScheduleItemWithMeta[] } (updated schedule)
 * @errors  404 class or schedule item not found
 *          500 internal server error
 */
export async function removeScheduleItem(req: CustomRequest, res: Response) {
  const session = await mongoose.startSession();
  try {
    const { id, scheduleId } = req.params;
    let removedId: string | undefined;
    let removedContribution: number | undefined;
    let removedRootQuizId: string | undefined;
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
      removedRootQuizId = target.quizRootId
        ? String(target.quizRootId)
        : undefined;

      c.schedule = c.schedule.filter((s: any) => String(s._id) !== scheduleId);
      await c.save({ session });
      outSchedule = scheduleOut(c);
    });

    if (res.headersSent) return;

    if (removedId && typeof removedContribution === "number") {
      await stats_onScheduleRemoved(String(id), removedId, removedContribution);
    }

    if (removedId && removedRootQuizId) {
      await emitScheduleUpdated({
        classId: String(id),
        scheduleId: removedId,
        quizRootId: removedRootQuizId,
        action: "deleted",
      });
    }

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
 * @auth   verifyAccessToken + verifyTeacherOfClassOrStudent (via middleware)
 * @input  Params: { id: string }
 *         Query: { now?: string (ISO) } (optional "current time" override)
 * @notes  - Returns schedule items for a class whose `startDate` is <= `now` (i.e. already
 *           available to students), enriched with:
 *             - quiz metadata from quiz-svc
 *             - per-schedule aggregated stats derived from `ScheduleStatsModel`.
 *         - `now` query param:
 *             - If provided → parsed as Date; if invalid, falls back to server time.
 *             - If omitted → uses current server time.
 *         - Stats per schedule include:
 *             - participants, sumScore, sumMax, avgPct, avgAbsScore, avgAbsMax,
 *               participationPct, totalStudents, updatedAt.
 *         - Uses canonical quiz identity (rootQuizId + version) to enrich rows with quiz meta
 *           via `fetchQuizMetaBatch` and `attachQuizMeta`.
 * @logic  1) Load Class via `ClassModel.findById` (lean with schedule + students only).
 *         2) Determine `effectiveNow` from query or server time.
 *         3) Filter `cls.schedule` to items whose startDate <= effectiveNow.
 *         4) If none, return empty array.
 *         5) Collect canonical selectors (rootQuizId + version) and fetch quiz meta via
 *            `fetchQuizMetaBatch`.
 *         6) Query `ScheduleStatsModel` for all available scheduleIds to retrieve stats.
 *         7) Build a lookup map `statsByScheduleId`.
 *         8) For each available schedule:
 *              - attach meta using canonical key
 *              - compute participationPct and avgAbsScore/avgAbsMax based on participants
 *                and sums
 *              - assemble ApiScheduleItemWithStats payload.
 *         9) Return assembled data array.
 * @returns 200 { ok: true, data: ApiScheduleItemWithStats[] }
 *          200 { ok: true, data: [] } if no available schedule items
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

    // Build canonical selectors for all available items that have root+version
    const selectors: QuizCanonicalSelector[] = [];
    for (const s of available) {
      const root = (s as any).quizRootId;
      const version = (s as any).quizVersion;
      if (root && typeof version === "number") {
        selectors.push({
          rootQuizId: String(root),
          version: Number(version),
        });
      }
    }

    const metaByCanonical = await fetchQuizMetaBatch(selectors);

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

      const root = (s as any).quizRootId
        ? String((s as any).quizRootId)
        : undefined;
      const version =
        typeof (s as any).quizVersion === "number"
          ? Number((s as any).quizVersion)
          : undefined;
      const cKey =
        root && typeof version === "number" ? `${root}:${version}` : undefined;
      const meta = cKey ? metaByCanonical[cKey] : undefined;

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

        // Concrete quiz id (legacy)
        quizId: qid,

        // Canonical quiz identity (root + version)
        quizRootId:
          (s as any).quizRootId ??
          (meta?.rootQuizId ? String(meta.rootQuizId) : undefined),
        quizVersion:
          typeof (s as any).quizVersion === "number"
            ? (s as any).quizVersion
            : typeof meta?.version === "number"
            ? meta.version
            : undefined,

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

/**
 * @route   GET /classes/schedule/all
 * @auth    verifyAccessToken (any authenticated teacher)
 * @input   Query: none
 * @notes   - Aggregates schedules across all classes where the caller is:
 *             - the `owner`, OR
 *             - present in the `teachers` array.
 *          - Returns one entry per class:
 *              {
 *                classId,
 *                className,
 *                classTimezone,
 *                schedule: ApiScheduleItem-like[]
 *              }
 *          - Each schedule item:
 *             - preserves existing schedule fields
 *             - normalizes `_id` and `quizId` to strings
 *             - is enriched with quiz metadata via canonical identity
 *               (rootQuizId + version) using `fetchQuizMetaBatch`.
 *          - Intended for the dashboard homepage (stacked 7-day calendars via HomepageScheduleClient).
 *          - Does NOT include stats; purely schedule + quiz meta.
 * @logic   1) Extract teacherId from `req.user`.
 *          2) Load all classes where `{ owner: teacherId }` OR `{ teachers: teacherId }`.
 *          3) Collect all canonical selectors (rootQuizId + version) from schedules.
 *          4) Batch fetch quiz metadata from quiz-svc (`fetchQuizMetaBatch`).
 *          5) For each class:
 *               - derive `classId`, `className`, `classTimezone`
 *               - map schedule items, attach quiz meta (`attachQuizMeta`)
 *               - normalize identifiers to strings.
 *          6) Return array of class bundles.
 * @returns 200 { ok: true, data: Array<{ classId, className, classTimezone, schedule[] }> }
 *          200 { ok: true, data: [] } if teacher has no classes.
 * @errors  401 missing/invalid teacher identity
 *          500 internal server error
 */
export async function getAllClassesScheduleForTeacher(
  req: CustomRequest,
  res: Response
) {
  try {
    const teacherId = String(req.user?.id || "");
    if (!teacherId) {
      return res
        .status(401)
        .json({ ok: false, message: "Missing teacher identity" });
    }

    console.log("[getAllClassesScheduleForTeacher] teacherId:", teacherId);

    // All classes for this teacher
    const classes = await ClassModel.find({
      $or: [{ owner: teacherId }, { teachers: teacherId }],
    })
      .select({ name: 1, level: 1, schedule: 1, students: 1, timezone: 1 })
      .lean();

    if (!classes.length) {
      console.log("[getAllClassesScheduleForTeacher] no classes found");
      return res.json({ ok: true, data: [] });
    }

    // Collect canonical quiz selectors for meta batch fetch
    const selectors: QuizCanonicalSelector[] = [];
    for (const cls of classes) {
      const items: any[] = Array.isArray(cls.schedule) ? cls.schedule : [];
      for (const s of items) {
        const root = (s as any).quizRootId;
        const version = (s as any).quizVersion;
        if (root && typeof version === "number") {
          selectors.push({
            rootQuizId: String(root),
            version: Number(version),
          });
        }
      }
    }

    const metaByCanonical =
      selectors.length > 0 ? await fetchQuizMetaBatch(selectors) : {};

    const data = classes.map((cls) => {
      const classId = String(cls._id);
      const className = (cls as any).name ?? "";
      const classTimezone = extractClassTimezone(cls as any);
      const items: any[] = Array.isArray(cls.schedule) ? cls.schedule : [];

      const schedule = items.map((s) => {
        const root = (s as any).quizRootId;
        const version = (s as any).quizVersion;
        let meta: QuizSvcBatchRow | undefined;

        if (root && typeof version === "number") {
          const key = `${String(root)}:${Number(version)}`;
          meta = metaByCanonical[key];
        }

        const withMeta = attachQuizMeta(s, meta);

        // Ensure _id + quizId are strings in the payload
        return {
          ...withMeta,
          _id: String((s as any)._id),
          quizId: String((s as any).quizId),
        };
      });

      return {
        classId,
        className,
        classTimezone,
        schedule,
      };
    });

    return res.json({ ok: true, data });
  } catch (e: any) {
    console.error("[getAllClassesScheduleForTeacher] error", e);
    return res
      .status(e._http || 500)
      .json({ ok: false, message: e.message || "Internal server error" });
  }
}

/**
 * @route   GET /classes/schedule/today
 * @auth    verifyAccessToken (any authenticated teacher)
 * @input   Query: { day?: string } where day = "YYYY-MM-DD"
 * @notes   - Aggregates "today's" schedules across all classes owned by / taught by
 *           the requesting teacher.
 *          - A schedule is included if its [startDate, endDate] spans the requested
 *           class-local day (inclusive), keyed by YYYY-MM-DD in the class timezone.
 *          - Response is a flat list of schedule rows shaped similarly to
 *            `GET /classes/:id/schedule/available`, but with:
 *             - classId
 *             - className
 *          - Stats fields are currently zeroed placeholders:
 *             - participants, participationPct, avgPct, etc. are all 0.
 *             - Intended for "Today’s Quizzes" dashboard section (quick overview),
 *               not deep analytics.
 *          - Uses canonical quiz identity (rootQuizId + version) to attach quiz
 *            metadata via `fetchQuizMetaBatch` per-class.
 *          - `day` param is optional:
 *             - if omitted → uses each class’s local "today" date.
 * @logic   1) Extract teacherId from `req.user`.
 *          2) Parse `day` query parameter (if present) or use class-local "today".
 *          3) Load all classes where `{ owner: teacherId }` OR `{ teachers: teacherId }`.
 *          4) For each class:
 *               a. Resolve class-local day key.
 *               b. Filter schedule items that span that day key.
 *               c. Build canonical selectors (rootQuizId + version) for today's items.
 *               d. Batch fetch quiz meta for those selectors.
 *               e. For each schedule item, attach quiz meta + build zeroed stats,
 *                  plus classId/className.
 *          5) Concatenate results from all classes into a single array.
 *          6) Return `{ ok: true, data: results }`.
 * @returns 200 { ok: true, data: Array<{ _id, classId, className, quizId, quizRootId,
 *                                        quizVersion, startDate, endDate, contribution,
 *                                        attemptsAllowed, showAnswersAfterAttempt,
 *                                        quizName, subject, subjectColor, topic, quizType,
 *                                        stats: { participants, totalStudents,
 *                                                 participationPct, sumScore, sumMax,
 *                                                 avgPct, avgAbsScore, avgAbsMax,
 *                                                 updatedAt } }> }
 *          200 { ok: true, data: [] } if no matching schedules.
 * @errors  400 invalid `day` query parameter
 *          401 missing/invalid teacher identity
 *          500 internal server error
 */
export async function getTodaySchedulesForTeacher(
  req: CustomRequest,
  res: Response
) {
  try {
    // 🔧 Robust teacher-id extraction (adapt to your JWT payload)
    const teacherId = String(
      (req as any).user?.userId ??
        (req as any).userId ??
        (req as any).user?.sub ??
        (req as any).user?._id ??
        (req as any).user?.id ??
        ""
    );

    if (!teacherId) {
      return res
        .status(401)
        .json({ ok: false, message: "Missing teacher identity" });
    }

    const dayParam = String((req.query?.day as string) || "");
    const dayParamDate = dayParam ? new Date(`${dayParam}T00:00:00Z`) : null;
    const isDayKey =
      !dayParam ||
      (/^\d{4}-\d{2}-\d{2}$/.test(dayParam) &&
        !!dayParamDate &&
        !Number.isNaN(dayParamDate.getTime()) &&
        dayParamDate.toISOString().startsWith(dayParam));
    if (!isDayKey) {
      return res
        .status(400)
        .json({ ok: false, message: "Invalid 'day' query parameter" });
    }

    const classes = await ClassModel.find({
      $or: [{ owner: teacherId }, { teachers: teacherId }],
    })
      .select({ _id: 1, name: 1, schedule: 1, students: 1, timezone: 1 })
      .lean<
        {
          _id: Types.ObjectId;
          name?: string;
          schedule?: IAssignedQuiz[];
          students?: IStudent[];
          timezone?: string;
        }[]
      >();

    if (!classes.length) {
      return res.json({ ok: true, data: [] });
    }

    const results: any[] = [];

    for (const cls of classes) {
      const tz =
        cls.timezone || extractClassTimezone(cls as any) || "Asia/Singapore";
      const dayKey = dayParam ? dayParam : getDayKeyInTZ(new Date(), tz);

      const allItems = Array.isArray(cls.schedule) ? cls.schedule : [];

      // schedules that intersect "today"
      const todays = allItems.filter((s) => {
        const sStart = new Date(s.startDate);
        const sEnd = new Date(s.endDate);
        if (Number.isNaN(sStart.getTime()) || Number.isNaN(sEnd.getTime())) {
          return false;
        }
        return isScheduleOnDayInTZ(sStart, sEnd, dayKey, tz);
      });

      if (!todays.length) continue;

      // Build canonical selectors for quiz meta
      const selectors: QuizCanonicalSelector[] = [];
      for (const s of todays) {
        const root = (s as any).quizRootId;
        const version = (s as any).quizVersion;
        if (root && typeof version === "number") {
          selectors.push({
            rootQuizId: String(root),
            version: Number(version),
          });
        }
      }

      const metaByCanonical = await fetchQuizMetaBatch(selectors);

      const numStudents = Array.isArray(cls.students) ? cls.students.length : 0;

      for (const s of todays) {
        const sid = String(s._id || "");
        const qid = String(s.quizId);

        const root = (s as any).quizRootId
          ? String((s as any).quizRootId)
          : undefined;
        const version =
          typeof (s as any).quizVersion === "number"
            ? Number((s as any).quizVersion)
            : undefined;
        const cKey =
          root && typeof version === "number"
            ? `${root}:${version}`
            : undefined;
        const meta = cKey ? metaByCanonical[cKey] : undefined;

        const stats = {
          participants: 0,
          totalStudents: numStudents,
          participationPct: 0,
          sumScore: 0,
          sumMax: 0,
          avgPct: 0,
          avgAbsScore: 0,
          avgAbsMax: 0,
          updatedAt: null as string | null,
        };

        results.push({
          _id: sid,
          classId: String(cls._id),
          className: cls.name ?? "Untitled Class",

          quizId: qid,
          quizRootId:
            (s as any).quizRootId ??
            (meta?.rootQuizId ? String(meta.rootQuizId) : undefined),
          quizVersion:
            typeof (s as any).quizVersion === "number"
              ? (s as any).quizVersion
              : typeof meta?.version === "number"
              ? meta.version
              : undefined,

          startDate: s.startDate,
          endDate: s.endDate,
          contribution:
            typeof s.contribution === "number" ? s.contribution : 100,

          attemptsAllowed:
            typeof s.attemptsAllowed === "number" ? s.attemptsAllowed : 1,
          showAnswersAfterAttempt: Boolean(s.showAnswersAfterAttempt),

          quizName: meta?.name ?? s.quizName ?? null,
          subject: meta?.subject ?? s.subject ?? null,
          subjectColor: meta?.subjectColorHex ?? s.subjectColor ?? null,
          topic: meta?.topic ?? s.topic ?? null,
          quizType: meta?.quizType ?? null,

          stats,
        });
      }
    }

    return res.json({ ok: true, data: results });
  } catch (e: any) {
    console.error("[getTodaySchedulesForTeacher] error", e);
    return res
      .status(e._http || 500)
      .json({ ok: false, message: e.message || "Internal server error" });
  }
}
