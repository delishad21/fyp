import { Request, Response } from "express";
import { QuizBaseModel, BaseQuizLean } from "../model/quiz-base-model";
import { getQuizTypeDef } from "../model/quiz-registry";
import { CustomRequest } from "../middleware/access-control";
import { parseStringArrayParam } from "../utils/query-parser";
import {
  sameId,
  ListFilters,
  clamp,
  buildMongoFilter,
  computeContentHashForDoc,
} from "../utils/quiz-utils";
import {
  isQuizType,
  QUIZ_TYPES,
  QUIZ_TYPE_COLORS,
  QuizTypeKey,
} from "../model/quiz-shared";
import { resolveSubjectColorHex } from "../utils/quiz-meta-utils";
import { enqueueEvent } from "../events/outgoing/outbox-enqueue";
import {
  buildQuizDeletedEvent,
  buildQuizMetaUpdatedEvent,
  buildQuizVersionUpdatedEvent,
} from "../events/outgoing/quiz-events";
import { AttemptModel } from "../model/quiz-attempt-model";
import { sharedSecret } from "../utils/class-svc-client";
import { isValidObjectId, Types } from "mongoose";

/**
 * @route   GET /quiz/type-colors
 * @auth    verifyAccessToken
 * @input   none
 * @logic   Return the static quiz-type color map from the registry.
 * @returns 200 { ok: true, colors: Record<QuizTypeKey, string> }
 */
export function getQuizTypeColors(req: Request, res: Response) {
  const colors = QUIZ_TYPES.reduce((acc, t) => {
    acc[t] = QUIZ_TYPE_COLORS[t];
    return acc;
  }, {} as Record<QuizTypeKey, string>);
  return res.json({ ok: true, colors });
}

/**
 * @route   POST /quiz
 * @auth    verifyAccessToken
 * @input   Body: {
 *           quizType: "basic" | "rapid" | "crossword",
 *           name: string,
 *           subject: string,
 *           topic: string,
 *           // plus type-specific fields (e.g. itemsJson, entriesJson, gridJson, ...)
 *         }
 * @logic   1) Validate `quizType` and resolve its type definition via `getQuizTypeDef`.
 *         2) Normalize base fields (`name`, `subject`, `topic`).
 *         3) Use quiz-type hooks:
 *              - `readItemsFromBody` → `coerceItems` → `validate`.
 *         4) Resolve `subjectColorHex` via `resolveSubjectColorHex(ownerId, subject)`.
 *         5) Build the type-specific `patch` via `buildTypePatch`.
 *         6) Create a new quiz row with:
 *              - `_id = rootQuizId`
 *              - `rootQuizId = _id`
 *              - `version = 1`
 *         7) Re-read as `BaseQuizLean` and return it.
 * @returns 201 { ok: true, data: BaseQuizLean }
 * @errors  400 missing/invalid quizType or validation errors
 *          401 unauthenticated
 *          500 server error
 */
export async function createQuiz(req: CustomRequest, res: Response) {
  try {
    const ownerId = req.user?.id;
    if (!ownerId)
      return res.status(401).json({ ok: false, message: "Unauthorized" });

    const { quizType } = req.body as { quizType?: string };
    if (!isQuizType(quizType)) {
      return res
        .status(400)
        .json({ ok: false, message: "Missing or invalid quizType" });
    }

    const def = getQuizTypeDef(quizType);
    if (!def) {
      return res
        .status(400)
        .json({ ok: false, message: "Unsupported quizType" });
    }

    const name = (req.body.name ?? "").trim();
    const subject = (req.body.subject ?? "").trim();
    const topic = (req.body.topic ?? "").trim();

    const rawItems = def.readItemsFromBody(req.body);
    const items = def.coerceItems(rawItems);

    const { fieldErrors, questionErrors } = def.validate(
      { ...req.body, name, subject, topic },
      items
    );
    if (
      Object.values(fieldErrors).some(Boolean) ||
      questionErrors?.some(Boolean)
    ) {
      return res.status(400).json({
        ok: false,
        fieldErrors,
        questionErrors,
        message: "Please fix the errors and try again.",
      });
    }

    const subjectColorHex = await resolveSubjectColorHex(ownerId, subject);
    const patch = def.buildTypePatch(req.body, items);

    // Version 1: _id == rootQuizId
    const _id = new Types.ObjectId();
    const doc = await QuizBaseModel.create({
      _id,
      rootQuizId: _id,
      owner: ownerId,
      quizType,
      name,
      subject,
      subjectColorHex,
      topic,
      version: 1,
      ...patch,
    });

    const lean = await QuizBaseModel.findById(
      doc._id
    ).lean<BaseQuizLean | null>();
    return res.status(201).json({ ok: true, data: lean });
  } catch (e: any) {
    console.error("[createQuiz] error", e);
    return res
      .status(500)
      .json({ ok: false, message: "Internal server error" });
  }
}

/**
 * @route   GET /quiz/:id
 * @auth    verifyAccessToken + verifyQuizOwnerOrAdmin
 * @input   Params: { id: string }            // rootQuizId (family id)
 *          Query:  { version?: number }      // optional; defaults to latest
 * @logic   1) Treat `:id` as `rootQuizId` and validate it.
 *         2) Load all versions where `rootQuizId = :id`, sorted by version.
 *         3) Enforce owner/admin access:
 *              - Owner inferred from the first row’s `owner`.
 *         4) Resolve the requested version:
 *              - If `version` query provided → return that version.
 *              - Else → return latest version.
 *         5) Derive `typeColorHex` from `QUIZ_TYPE_COLORS[quizType]`.
 * @returns 200 {
 *           ok: true,
 *           data: BaseQuizLean & { typeColorHex?: string },
 *           versions: number[]
 *         }
 * @errors  400 invalid rootQuizId or version param
 *          401/403 handled by middleware / owner check
 *          404 quiz family or version not found
 *          500 server error
 */
export async function getQuiz(req: Request & { user?: any }, res: Response) {
  try {
    const rootQuizId = req.params.id;

    if (!isValidObjectId(rootQuizId)) {
      return res.status(400).json({ ok: false, message: "Invalid rootQuizId" });
    }

    const allVersions = await QuizBaseModel.find({ rootQuizId })
      .sort({ version: 1 })
      .lean<BaseQuizLean[]>();

    if (!allVersions.length) {
      return res.status(404).json({ ok: false, message: "Not found" });
    }

    // Auth: owner or admin
    const ownerId = allVersions[0].owner;
    const isOwner = sameId(ownerId, req.user?.id);
    if (!isOwner && !req.user?.isAdmin) {
      return res.status(403).json({ ok: false, message: "Forbidden" });
    }

    const versions = allVersions
      .map((q) => q.version ?? 1)
      .sort((a, b) => a - b);

    let target: BaseQuizLean | undefined;

    if (req.query.version !== undefined) {
      const requested = Number(req.query.version);
      if (!Number.isFinite(requested)) {
        return res
          .status(400)
          .json({ ok: false, message: "Invalid version param" });
      }
      target = allVersions.find((q) => (q.version ?? 1) === requested);
      if (!target) {
        return res
          .status(404)
          .json({ ok: false, message: "Version not found" });
      }
    } else {
      // latest
      target = allVersions[allVersions.length - 1];
    }

    // NEW: derive typeColorHex just like listMyQuizzes / batchGetQuizzesInternal
    const quizType = String(target.quizType) as QuizTypeKey;
    const typeColorHex = QUIZ_TYPE_COLORS[quizType] || undefined;

    return res.json({
      ok: true,
      data: {
        ...target,
        typeColorHex,
      },
      versions,
    });
  } catch (e) {
    console.error("[getQuiz] error", e);
    return res
      .status(500)
      .json({ ok: false, message: "Internal server error" });
  }
}

/**
 * @route   POST /quiz/:id/clone
 * @auth    verifyAccessToken + verifyQuizOwnerOrAdmin
 * @input   Params: { id: string }            // source rootQuizId
 *          Query:  { version?: number }      // optional base version to clone; defaults to latest
 *          Body:   { name?: string }         // optional new name; defaults to "<source name> (Copy)"
 * @logic   1) Resolve the source version:
 *              - If `version` query provided → clone that version.
 *              - Else → clone latest version.
 *         2) Enforce owner/admin based on the resolved version.
 *         3) Load full typed quiz doc via quiz-type definition `Model`.
 *         4) Strip versioning/identity fields and construct a new quiz:
 *              - `_id = new ObjectId()`
 *              - `rootQuizId = _id` (new family)
 *              - `version = 1`
 *              - `owner = source.owner`
 *              - `name = body.name || "<original> (Copy)"`
 *         5) Return the newly created quiz as `BaseQuizLean`.
 * @returns 201 { ok: true, data: BaseQuizLean }
 * @errors  400 invalid rootQuizId
 *          401/403 unauthenticated or forbidden
 *          404 source quiz/version not found
 *          500 server error
 */
export async function cloneQuiz(req: Request & { user?: any }, res: Response) {
  try {
    const rootQuizId = req.params.id;
    if (!isValidObjectId(rootQuizId)) {
      return res.status(400).json({ ok: false, message: "Invalid rootQuizId" });
    }

    const versionParam = req.query.version;
    const requestedVersion =
      versionParam !== undefined ? Number(versionParam) : undefined;

    let base: BaseQuizLean | (BaseQuizLean & any) | null;

    if (requestedVersion !== undefined && Number.isFinite(requestedVersion)) {
      base = await QuizBaseModel.findOne({
        rootQuizId,
        version: requestedVersion,
      }).lean<(BaseQuizLean & any) | null>();
    } else {
      base = await QuizBaseModel.findOne({ rootQuizId })
        .sort({ version: -1 })
        .lean<(BaseQuizLean & any) | null>();
    }

    if (!base) {
      return res.status(404).json({ ok: false, message: "Not found" });
    }

    const isOwner =
      String(base.owner) === String(req.user?.id) || !!req.user?.isAdmin;
    if (!isOwner) {
      return res.status(403).json({ ok: false, message: "Forbidden" });
    }

    const def = getQuizTypeDef(base.quizType);
    if (!def) {
      return res
        .status(400)
        .json({ ok: false, message: "Unsupported quizType" });
    }

    const full = await def.Model.findById(base._id).lean<any>();
    if (!full) {
      return res.status(404).json({ ok: false, message: "Not found" });
    }

    const {
      _id,
      createdAt,
      updatedAt,
      rootQuizId: _ignore,
      version,
      ...rest
    } = full;

    const cloneName =
      (req.body?.name as string | undefined)?.trim() ||
      `${rest.name || base.name} (Copy)`;

    const newId = new Types.ObjectId();

    const newDoc = await def.Model.create({
      ...rest,
      _id: newId,
      owner: base.owner,
      name: cloneName,
      rootQuizId: newId, // new family root
      version: 1,
    });

    const lean = await QuizBaseModel.findById(
      newDoc._id
    ).lean<BaseQuizLean | null>();

    return res.status(201).json({ ok: true, data: lean });
  } catch (e) {
    console.error("[cloneQuiz] error", e);
    return res
      .status(500)
      .json({ ok: false, message: "Internal server error" });
  }
}

/**
 * @route   PATCH /quiz/:id
 * @auth    verifyAccessToken + verifyQuizOwnerOrAdmin
 * @input   Params: { id: string }           // rootQuizId
 *          Query:  { version?: number }     // optional base version; defaults to latest
 *          Body:   {
 *            name?: string,
 *            subject?: string,
 *            topic?: string,
 *            // type-specific content payload,
 *            updateActiveSchedules?: boolean | "true" | "false" | "1" | "0"
 *          }
 * @logic   1) Resolve base version (requested or latest) under the family.
 *         2) Enforce owner/admin based on the base version.
 *         3) Resolve quiz-type definition.
 *         4) Normalize new metadata:
 *              - `name`, `subject`, `topic` (falling back to base values).
 *         5) Use quiz-type hooks for content:
 *              - `readItemsFromBody` → `coerceItems` → `validate`.
 *         6) Build type-specific patch via `buildTypePatch`.
 *         7) If the subject changed, recompute `subjectColorHex`.
 *         8) Compute content hashes via `computeContentHashForDoc` on:
 *              - existing full doc (oldHash)
 *              - new shape with patch (newHash)
 *            → derive `CONTENT_CHANGED`.
 *         9) Detect `METADATA_CHANGED` by diffing name/subject/topic.
 *         10) If neither content nor metadata changed → 400 "No changes detected".
 *         11) If metadata-only (no content change):
 *              - `updateMany` all rows in the family with new metadata.
 *              - Emit `QuizMetaUpdated` event.
 *              - Return latest row, with `contentChanged: false`.
 *         12) If content changed:
 *              - Compute `nextVersion` and create a new version row with updated metadata.
 *              - If metadata also changed → emit `QuizMetaUpdated`.
 *              - If `updateActiveSchedules` truthy → emit `QuizVersionUpdated`.
 * @returns 200 {
 *           ok: true,
 *           data: BaseQuizLean | null,
 *           contentChanged: boolean,
 *           previousVersion: number
 *         }
 * @errors  400 invalid rootQuizId / validation errors / no-op update
 *          401/403 unauthenticated or forbidden
 *          404 base quiz/version not found
 *          500 server error
 */
export async function updateQuiz(req: Request & { user?: any }, res: Response) {
  try {
    const rootQuizId = req.params.id;

    if (!isValidObjectId(rootQuizId)) {
      return res.status(400).json({ ok: false, message: "Invalid rootQuizId" });
    }

    // 1) find base version to compare against (requested or latest)
    const versionParam = req.query.version;
    const requestedVersion =
      versionParam !== undefined ? Number(versionParam) : undefined;

    let base: BaseQuizLean | null;
    if (requestedVersion !== undefined && Number.isFinite(requestedVersion)) {
      base = await QuizBaseModel.findOne({
        rootQuizId,
        version: requestedVersion,
      }).lean<BaseQuizLean | null>();
    } else {
      base = await QuizBaseModel.findOne({ rootQuizId })
        .sort({ version: -1 })
        .lean<BaseQuizLean | null>();
    }
    if (!base) return res.status(404).json({ ok: false, message: "Not found" });

    // 2) owner/admin guard
    const isOwner =
      String(base.owner) === String(req.user?.id) || !!req.user?.isAdmin;
    if (!isOwner)
      return res.status(403).json({ ok: false, message: "Forbidden" });

    // 3) quiz type def
    const def = getQuizTypeDef(base.quizType);
    if (!def) {
      return res
        .status(400)
        .json({ ok: false, message: "Unsupported quizType" });
    }

    // 4) normalize base fields (metadata)
    const name = (req.body.name ?? base.name).trim();
    const subject = (req.body.subject ?? base.subject).trim();
    const topic = (req.body.topic ?? base.topic).trim();

    // 5) items pipeline + validate (content path)
    const rawItems = def.readItemsFromBody(req.body);
    const items = def.coerceItems(rawItems);
    const { fieldErrors, questionErrors } = def.validate(
      { ...req.body, name, subject, topic },
      items
    );
    if (
      Object.values(fieldErrors).some(Boolean) ||
      (questionErrors && questionErrors.some(Boolean))
    ) {
      return res.status(400).json({
        ok: false,
        fieldErrors,
        questionErrors,
        message: "Please fix the errors and try again.",
      });
    }

    // 6) discriminator patch + subject color (if subject changed)
    const patch = def.buildTypePatch(req.body, items);

    let subjectColorHex = base.subjectColorHex;
    if (subject !== base.subject) {
      subjectColorHex = await resolveSubjectColorHex(
        String(base.owner),
        subject
      );
    }

    // 7) detect content changes by hashing typed doc
    const oldFull = await def.Model.findById(base._id).lean<any>();
    const oldHash = computeContentHashForDoc(base.quizType, oldFull || {});
    const newShapeForHash = { ...oldFull, ...patch };
    const newHash = computeContentHashForDoc(base.quizType, newShapeForHash);
    const CONTENT_CHANGED = oldHash !== newHash;

    // 7b) detect metadata changes
    const METADATA_CHANGED =
      name !== base.name || subject !== base.subject || topic !== base.topic;

    // 7c) nothing changed
    if (!CONTENT_CHANGED && !METADATA_CHANGED) {
      return res.status(400).json({
        ok: false,
        message: "No changes detected; nothing to update.",
      });
    }

    // Parse teacher choice: update active / scheduled quizzes?
    const updateActiveSchedulesRaw = req.body?.updateActiveSchedules;
    const updateActiveSchedules =
      updateActiveSchedulesRaw === true ||
      updateActiveSchedulesRaw === "true" ||
      updateActiveSchedulesRaw === "1";

    // ─────────────────────────────────────────────────────────────
    // A) METADATA-ONLY UPDATE (no new version)
    // ─────────────────────────────────────────────────────────────
    if (!CONTENT_CHANGED && METADATA_CHANGED) {
      // Update "live" family metadata across ALL rows for consistency
      await QuizBaseModel.updateMany(
        { rootQuizId },
        {
          $set: {
            name,
            subject,
            subjectColorHex,
            topic,
            updatedAt: new Date(),
          },
        }
      );

      // Emit metadata-changed event so class-svc mirrors schedule labels
      const metaEvt = buildQuizMetaUpdatedEvent({
        quizId: String(rootQuizId),
        name,
        subject,
        subjectColorHex,
        topic,
      });
      await enqueueEvent(metaEvt.type, metaEvt);

      // Return latest row for convenience
      const latestAfter = await QuizBaseModel.findOne({ rootQuizId })
        .sort({ version: -1 })
        .lean<BaseQuizLean | null>();

      return res.json({
        ok: true,
        data: latestAfter,
        contentChanged: false,
        previousVersion: base.version,
      });
    }

    // ─────────────────────────────────────────────────────────────
    // B) CONTENT CHANGED (create a new immutable version)
    // ─────────────────────────────────────────────────────────────

    // 8) compute next version
    const latest = await QuizBaseModel.findOne({ rootQuizId })
      .sort({ version: -1 })
      .select({ version: 1 })
      .lean<{ version: number } | null>();
    const currentMaxVersion = latest?.version ?? base.version;
    const nextVersion = currentMaxVersion + 1;

    // 9) create NEW version row (with the new metadata values)
    const created = await def.Model.create({
      rootQuizId: base.rootQuizId,
      owner: base.owner,
      quizType: base.quizType,
      name,
      subject,
      subjectColorHex,
      topic,
      version: nextVersion,
      ...patch,
    });

    const newLean = await QuizBaseModel.findById(
      created._id
    ).lean<BaseQuizLean | null>();

    // 10) If metadata also changed, inform class-svc to refresh labels
    if (METADATA_CHANGED) {
      const metaEvt = buildQuizMetaUpdatedEvent({
        quizId: String(rootQuizId),
        name,
        subject,
        subjectColorHex,
        topic,
      });
      await enqueueEvent(metaEvt.type, metaEvt);
    }

    // 11) Optionally notify class-svc to bump active schedules to this version
    if (updateActiveSchedules) {
      const verEvt = buildQuizVersionUpdatedEvent({
        quizId: String(rootQuizId),
        previousVersion: base.version,
        newVersion: nextVersion,
        contentChanged: true,
      });
      await enqueueEvent(verEvt.type, verEvt);
    }

    return res.json({
      ok: true,
      data: newLean,
      contentChanged: true,
      previousVersion: base.version,
    });
  } catch (e: any) {
    console.error("[updateQuiz] error", e);
    return res
      .status(500)
      .json({ ok: false, message: "Internal server error" });
  }
}

/**
 * @route   DELETE /quiz/:id
 * @auth    verifyAccessToken + verifyQuizOwnerOrAdmin
 * @input   Params: { id: string }   // rootQuizId
 * @logic   1) Load all versions by `rootQuizId`.
 *         2) Enforce owner/admin using the family owner.
 *         3) Collect all concrete `_id`s in the family.
 *         4) Delete all quiz documents with `rootQuizId`.
 *         5) Delete all attempts where `quizId ∈ familyIds`.
 *         6) Emit `QuizDeleted` event:
 *              - `quizId = rootQuizId`
 *              - `purgeCount = attempts deleted`
 * @returns 200 { ok: true }
 * @errors  400 invalid rootQuizId
 *          401/403 unauthenticated or forbidden
 *          404 quiz family not found
 *          500 server error
 */
export async function deleteQuiz(req: Request & { user?: any }, res: Response) {
  try {
    console.log(
      "[DELETE QUIZ] called by user",
      req.user?.id,
      "for quiz",
      req.params.id
    );
    const rootQuizId = req.params.id;

    if (!isValidObjectId(rootQuizId)) {
      return res.status(400).json({ ok: false, message: "Invalid rootQuizId" });
    }

    const family = await QuizBaseModel.find({ rootQuizId }).lean<
      BaseQuizLean[]
    >();

    console.log(
      `[DELETE QUIZ] rootQuizId=${rootQuizId} family size=${family.length}`
    );

    if (!family.length) {
      return res.status(404).json({ ok: false, message: "Not found" });
    }

    const owner = family[0].owner;
    const isOwner =
      String(owner) === String(req.user?.id) || !!req.user?.isAdmin;
    if (!isOwner) {
      return res.status(403).json({ ok: false, message: "Forbidden" });
    }

    const ids = family.map((q) => q._id);

    await QuizBaseModel.deleteMany({ rootQuizId });
    const purge = await AttemptModel.deleteMany({ quizId: { $in: ids } });

    const event = buildQuizDeletedEvent({
      quizId: String(rootQuizId),
      purgeCount: purge.deletedCount ?? 0,
    });

    await enqueueEvent(event.type, event);

    return res.json({ ok: true });
  } catch (e) {
    console.error("[deleteQuiz] error", e);
    return res
      .status(500)
      .json({ ok: false, message: "Internal server error" });
  }
}

/**
 * @route   GET /quiz/admin/all
 * @auth    verifyAccessToken + verifyIsAdmin
 * @input   Query: {
 *           name?: string,
 *           subjects?: string[] | string,
 *           topics?: string[] | string,
 *           types?: string[] | string,
 *           createdStart?: string,   // ISO-ish date
 *           createdEnd?: string,     // ISO-ish date
 *           page?: number,
 *           pageSize?: number
 *         }
 * @logic   1) Parse filters into a `ListFilters` struct.
 *         2) Clamp paging (`page`, `pageSize`) into sane bounds.
 *         3) Build a Mongo filter via `buildMongoFilter(undefined, filters)`
 *            (no owner restriction, admin scope).
 *         4) Aggregate:
 *              - Sort by `(rootQuizId ASC, version DESC)`.
 *              - Group by `rootQuizId` and keep the latest version.
 *              - Replace root with `latest`.
 *              - Apply filter.
 *              - Count matching documents for pagination.
 *         5) Run a second aggregate pipeline to fetch the page of metadata rows
 *            using `META_PROJECTION`.
 * @returns 200 {
 *           ok: true,
 *           rows: QuizMeta[],
 *           page: number,
 *           pageCount: number,
 *           total: number
 *         }
 * @errors  401/403 unauthenticated or not admin
 *          500 server error
 */
export async function listAllQuizzes(req: CustomRequest, res: Response) {
  try {
    const q: ListFilters = {
      name: typeof req.query.name === "string" ? req.query.name : undefined,
      subjects: parseStringArrayParam(req.query.subjects),
      topics: parseStringArrayParam(req.query.topics),
      types: parseStringArrayParam(req.query.types),
      createdStart:
        typeof req.query.createdStart === "string"
          ? req.query.createdStart
          : undefined,
      createdEnd:
        typeof req.query.createdEnd === "string"
          ? req.query.createdEnd
          : undefined,
      page: req.query.page ? Number(req.query.page) : undefined,
      pageSize: req.query.pageSize ? Number(req.query.pageSize) : undefined,
    };

    const pageSize = clamp(q.pageSize ?? 20, 1, 100);
    const page = Math.max(
      1,
      Number.isFinite(q.page ?? 1) ? (q.page as number) : 1
    );

    const filter = buildMongoFilter(undefined, q);

    const totalArr = await QuizBaseModel.aggregate([
      { $sort: { rootQuizId: 1, version: -1 } },
      {
        $group: {
          _id: "$rootQuizId",
          latest: { $first: "$$ROOT" },
        },
      },
      { $replaceRoot: { newRoot: "$latest" } },
      { $match: filter },
      { $count: "total" },
    ]);
    const total = totalArr[0]?.total ?? 0;
    const pageCount = Math.max(1, Math.ceil(total / pageSize));
    const safePage = clamp(page, 1, pageCount);

    const rows = (await QuizBaseModel.aggregate([
      { $sort: { rootQuizId: 1, version: -1 } },
      {
        $group: {
          _id: "$rootQuizId",
          latest: { $first: "$$ROOT" },
        },
      },
      { $replaceRoot: { newRoot: "$latest" } },
      { $match: filter },
      { $sort: { createdAt: -1 } },
      { $skip: (safePage - 1) * pageSize },
      { $limit: pageSize },
      { $project: META_PROJECTION },
    ])) as QuizMeta[];

    return res.json({ ok: true, rows, page: safePage, pageCount, total });
  } catch (e: any) {
    console.error("[listAllQuizzes] error", e);
    return res
      .status(500)
      .json({ ok: false, message: "Internal server error" });
  }
}

/**
 * @route   GET /quiz
 * @auth    verifyAccessToken
 * @input   Owner = req.user.id (implicit)
 *          Query: {
 *           name?: string,
 *           subjects?: string[] | string,
 *           topics?: string[] | string,
 *           types?: string[] | string,
 *           createdStart?: string,
 *           createdEnd?: string,
 *           page?: number,
 *           pageSize?: number
 *         }
 * @logic   1) Require authenticated user and take `ownerId = req.user.id`.
 *         2) Parse filters into `ListFilters`.
 *         3) Build Mongo filter via `buildMongoFilter(ownerId, filters)`.
 *         4) Aggregate per owner:
 *              - Sort by `(rootQuizId ASC, version DESC)`.
 *              - Group to latest per family.
 *              - Match by filter.
 *              - Paginate with `skip`/`limit`.
 *              - Project via `META_PROJECTION`.
 *         5) Derive `typeColorHex` from `QUIZ_TYPE_COLORS[quizType]` per row
 *            for UI convenience.
 * @returns 200 {
 *           ok: true,
 *           rows: Array<QuizMeta & { typeColorHex?: string }>,
 *           page: number,
 *           pageCount: number,
 *           total: number
 *         }
 * @errors  401 unauthenticated
 *          500 server error
 */
export async function listMyQuizzes(req: CustomRequest, res: Response) {
  try {
    const ownerId = req.user?.id;
    console.log("[QUIZ] listMyQuizzes for owner", ownerId);
    if (!ownerId)
      return res.status(401).json({ ok: false, message: "Unauthorized" });

    const q: ListFilters = {
      name: typeof req.query.name === "string" ? req.query.name : undefined,
      subjects: parseStringArrayParam(req.query.subjects),
      topics: parseStringArrayParam(req.query.topics),
      types: parseStringArrayParam(req.query.types),
      createdStart:
        typeof req.query.createdStart === "string"
          ? req.query.createdStart
          : undefined,
      createdEnd:
        typeof req.query.createdEnd === "string"
          ? req.query.createdEnd
          : undefined,
      page: req.query.page ? Number(req.query.page) : undefined,
      pageSize: req.query.pageSize ? Number(req.query.pageSize) : undefined,
    };

    const pageSize = clamp(q.pageSize ?? 20, 1, 100);
    const page = Math.max(
      1,
      Number.isFinite(q.page ?? 1) ? (q.page as number) : 1
    );

    const filter = buildMongoFilter(ownerId, q);

    const totalArr = await QuizBaseModel.aggregate([
      { $sort: { rootQuizId: 1, version: -1 } },
      {
        $group: {
          _id: "$rootQuizId",
          latest: { $first: "$$ROOT" },
        },
      },
      { $replaceRoot: { newRoot: "$latest" } },
      { $match: filter },
      { $count: "total" },
    ]);
    const total = totalArr[0]?.total ?? 0;
    const pageCount = Math.max(1, Math.ceil(total / pageSize));
    const safePage = clamp(page, 1, pageCount);

    const rows = (await QuizBaseModel.aggregate([
      { $sort: { rootQuizId: 1, version: -1 } },
      {
        $group: {
          _id: "$rootQuizId",
          latest: { $first: "$$ROOT" },
        },
      },
      { $replaceRoot: { newRoot: "$latest" } },
      { $match: filter },
      { $sort: { createdAt: -1 } },
      { $skip: (safePage - 1) * pageSize },
      { $limit: pageSize },
      { $project: META_PROJECTION },
    ])) as QuizMeta[];

    const enriched = rows.map((r) => ({
      ...r,
      typeColorHex: QUIZ_TYPE_COLORS[r.quizType as QuizTypeKey] || undefined,
    }));

    console.log(
      `[QUIZ] listMyQuizzes found ${total} quizzes for owner ${ownerId}`
    );

    return res.json({
      ok: true,
      rows: enriched,
      page: safePage,
      pageCount,
      total,
    });
  } catch (e: any) {
    console.error("[listMyQuizzes] error", e);
    return res
      .status(500)
      .json({ ok: false, message: "Internal server error" });
  }
}

/** Projection for metadata-only responses */
const META_PROJECTION = {
  owner: 1,
  quizType: 1,
  name: 1,
  subject: 1,
  subjectColorHex: 1,
  topic: 1,
  rootQuizId: 1,
  version: 1,
  createdAt: 1,
  updatedAt: 1,
} as const;

type QuizMeta = {
  _id: string; // concrete version _id
  rootQuizId: string; // family id (stable across versions)
  owner: string;
  quizType: string;
  name: string;
  subject: string;
  subjectColorHex?: string;
  topic?: string;
  version: number;
  createdAt: string | Date;
  updatedAt: string | Date;
};

/**
 * @route   POST /quiz/internal/batch
 * @auth    shared-secret via `x-quiz-secret` header
 * @input   Body: {
 *           ids: string[]   // concrete quiz `_id`s
 *         }
 * @logic   1) Verify shared secret from `sharedSecret()` against `x-quiz-secret`.
 *         2) Normalize and dedupe `ids` into a string array.
 *         3) Partition into `validIds` (valid ObjectIds) and `invalid`.
 *         4) Fetch metadata rows for `validIds` using `META_PROJECTION`.
 *         5) Build `byId` map of `{ [id]: QuizMeta & { typeColorHex? } }`.
 *         6) Compute `missing`:
 *              - all invalid ids
 *              - valid ids not present in `byId`.
 * @returns 200 {
 *           ok: true,
 *           data: {
 *             byId: Record<string, QuizMeta & { typeColorHex?: string }>,
 *             missing: string[]
 *           },
 *           partial: boolean,      // true if any ids missing
 *           invalid?: string[]
 *         }
 * @errors  400 missing/empty ids payload
 *          401 secret mismatch
 *          500 server error
 */
export async function batchGetQuizzesInternal(
  req: CustomRequest,
  res: Response
) {
  try {
    const secret = sharedSecret();
    if (!secret || req.header("x-quiz-secret") !== secret) {
      return res.status(401).json({ ok: false, message: "Unauthorized" });
    }

    const raw = (req.body?.ids ?? []) as unknown[];
    const ids: string[] = Array.from(
      new Set(
        raw
          .map((v) => String(v ?? "").trim())
          .filter((s): s is string => s.length > 0)
      )
    );
    if (ids.length === 0) {
      return res
        .status(400)
        .json({ ok: false, message: "Provide body: { ids: string[] }" });
    }

    const validIds = ids.filter((id) => isValidObjectId(id));
    const invalid = ids.filter((id) => !isValidObjectId(id));

    const docs =
      validIds.length > 0
        ? await QuizBaseModel.find({ _id: { $in: validIds } })
            .select(META_PROJECTION)
            .lean<QuizMeta[]>()
        : [];

    const byId: Record<string, QuizMeta & { typeColorHex?: string }> = {};
    for (const doc of docs) {
      const id = String((doc as any)._id);
      const quizType = String((doc as any).quizType) as QuizTypeKey;
      const typeColorHex = QUIZ_TYPE_COLORS[quizType] || undefined;

      byId[id] = {
        ...(doc as any),
        _id: id,
        typeColorHex,
      };
    }

    const missingSet = new Set<string>([
      ...invalid,
      ...validIds.filter((id) => !(id in byId)),
    ]);
    const missing = ids.filter((id) => missingSet.has(id));

    return res.json({
      ok: true,
      data: { byId, missing },
      partial: missing.length > 0,
      ...(invalid.length ? { invalid } : {}),
    });
  } catch (e) {
    console.error("[batchGetQuizzesInternal] error", e);
    return res
      .status(500)
      .json({ ok: false, message: "Internal server error" });
  }
}

/**
 * @route   POST /quiz/internal/versions
 * @auth    shared-secret via `x-quiz-secret` header
 * @input   Body: { rootQuizId: string }
 * @logic   1) Verify shared secret from `sharedSecret()` against `x-quiz-secret`.
 *         2) Validate `rootQuizId` as a Mongo ObjectId.
 *         3) Fetch all versions under the family:
 *              - `find({ rootQuizId })`
 *              - `select(META_PROJECTION)`
 *              - sort by `version ASC`.
 *         4) If none, return 404.
 *         5) Map each doc to add:
 *              - stringified `_id` and `rootQuizId`
 *              - `typeColorHex` from `QUIZ_TYPE_COLORS`.
 * @returns 200 {
 *           ok: true,
 *           data: {
 *             rootQuizId: string,
 *             versions: Array<QuizMeta & { typeColorHex?: string }>
 *           }
 *         }
 * @errors  400 invalid rootQuizId
 *          401 secret mismatch
 *          404 quiz family not found
 *          500 server error
 */
export async function getQuizVersionsInternal(
  req: CustomRequest,
  res: Response
) {
  try {
    const secret = sharedSecret();
    if (!secret || req.header("x-quiz-secret") !== secret) {
      return res.status(401).json({ ok: false, message: "Unauthorized" });
    }

    const rootQuizId = String(req.body?.rootQuizId || "").trim();
    if (!rootQuizId || !isValidObjectId(rootQuizId)) {
      return res.status(400).json({ ok: false, message: "Invalid rootQuizId" });
    }

    const docs = await QuizBaseModel.find({ rootQuizId })
      .select(META_PROJECTION)
      .sort({ version: 1 })
      .lean<QuizMeta[]>();

    if (!docs.length) {
      return res.status(404).json({ ok: false, message: "Not found" });
    }

    const versions = docs.map((doc) => {
      const id = String((doc as any)._id);
      const quizType = String(doc.quizType) as QuizTypeKey;
      const typeColorHex = QUIZ_TYPE_COLORS[quizType] || undefined;

      return {
        ...doc,
        _id: id,
        rootQuizId: String(doc.rootQuizId),
        // extra UI sugar
        typeColorHex,
      };
    });

    return res.json({
      ok: true,
      data: {
        rootQuizId,
        versions,
      },
    });
  } catch (e) {
    console.error("[getQuizVersionsInternal] error", e);
    return res
      .status(500)
      .json({ ok: false, message: "Internal server error" });
  }
}

/**
 * @route   POST /quiz/internal/canonical-batch
 * @auth    shared-secret via `x-quiz-secret` header
 * @input   Body: {
 *           items: Array<{ rootQuizId: string; version: number }>
 *         }
 * @logic   1) Verify shared secret from `sharedSecret()` against `x-quiz-secret`.
 *         2) Normalize `items`:
 *              - trim `rootQuizId`
 *              - cast `version` to number
 *         3) Dedupe by (rootQuizId, version) pairs.
 *         4) Split into:
 *              - `valid`: valid ObjectId + positive integer version
 *              - `invalid`: everything else
 *         5) Fetch metadata rows for all valid pairs via `$or` on
 *            `{ rootQuizId, version }`, projected by `META_PROJECTION`.
 *         6) Build `byKey` map keyed by `"rootQuizId:version"`, each value
 *            including `typeColorHex`.
 *         7) Compute `missing` as:
 *              - invalid pairs
 *              - valid pairs that did not return a doc.
 * @returns 200 {
 *           ok: true,
 *           data: {
 *             byKey: Record<
 *               string,
 *               QuizMeta & {
 *                 typeColorHex?: string;
 *                 rootQuizId: string;
 *                 version: number;
 *               }
 *             >,
 *             missing: Array<{ rootQuizId: string; version: number }>
 *           },
 *           partial: boolean,
 *           invalid?: Array<{ rootQuizId: string; version: number }>
 *         }
 * @errors  400 missing/empty or fully invalid `items` payload
 *          401 secret mismatch
 *          500 server error
 */
export async function batchGetCanonicalQuizzesInternal(
  req: CustomRequest,
  res: Response
) {
  try {
    const secret = sharedSecret();
    if (!secret || req.header("x-quiz-secret") !== secret) {
      return res.status(401).json({ ok: false, message: "Unauthorized" });
    }

    const raw = (req.body?.items ?? []) as unknown[];
    if (!Array.isArray(raw) || raw.length === 0) {
      return res.status(400).json({
        ok: false,
        message:
          "Provide body: { items: Array<{ rootQuizId: string; version: number }> }",
      });
    }

    type CanonicalKey = { rootQuizId: string; version: number };

    const canonicalKey = (r: string, v: number) => `${r}:${v}`;

    // Step 1: normalize input (trim strings, cast versions)
    const normalized: CanonicalKey[] = raw
      .map((v) => {
        const obj = v as any;
        const rootQuizId = String(obj?.rootQuizId ?? "").trim();
        const version = Number(obj?.version);
        return { rootQuizId, version };
      })
      .filter((it) => it.rootQuizId && Number.isFinite(it.version));

    if (!normalized.length) {
      return res.status(400).json({
        ok: false,
        message:
          "Provide body: { items: Array<{ rootQuizId: string; version: number }> }",
      });
    }

    // Step 2: dedupe by (rootQuizId, version)
    const uniqueMap = new Map<string, CanonicalKey>();
    for (const it of normalized) {
      const key = canonicalKey(it.rootQuizId, it.version);
      if (!uniqueMap.has(key)) uniqueMap.set(key, it);
    }
    const uniqueItems = Array.from(uniqueMap.values());

    // Step 3: split into valid / invalid
    const valid: CanonicalKey[] = [];
    const invalid: CanonicalKey[] = [];

    for (const it of uniqueItems) {
      const rootOk = isValidObjectId(it.rootQuizId);
      const versionOk = Number.isInteger(it.version) && Number(it.version) > 0;

      if (rootOk && versionOk) {
        valid.push(it);
      } else {
        invalid.push(it);
      }
    }

    // Step 4: query DB for valid pairs (rootQuizId + version)
    const docs =
      valid.length > 0
        ? await QuizBaseModel.find({
            $or: valid.map((it) => ({
              rootQuizId: it.rootQuizId,
              version: it.version,
            })),
          })
            .select(META_PROJECTION)
            .lean<QuizMeta[]>()
        : [];

    const byKey: Record<
      string,
      QuizMeta & {
        typeColorHex?: string;
        rootQuizId: string;
        version: number;
      }
    > = {};

    for (const doc of docs) {
      const id = String((doc as any)._id);
      const rootQuizId = String((doc as any).rootQuizId);
      const version = Number((doc as any).version);
      const quizType = String(doc.quizType) as QuizTypeKey;
      const typeColorHex = QUIZ_TYPE_COLORS[quizType] || undefined;

      const key = canonicalKey(rootQuizId, version);
      byKey[key] = {
        ...(doc as any),
        _id: id,
        rootQuizId,
        version,
        typeColorHex,
      };
    }

    // Step 5: figure out which requested canonical pairs are missing
    const missingSet = new Set<string>();

    // invalid canonical pairs are automatically "missing"
    for (const it of invalid) {
      missingSet.add(canonicalKey(it.rootQuizId, it.version));
    }

    // valid ones that didn't come back from the query are also "missing"
    for (const it of valid) {
      const key = canonicalKey(it.rootQuizId, it.version);
      if (!(key in byKey)) {
        missingSet.add(key);
      }
    }

    const missing: CanonicalKey[] = [];
    for (const key of missingSet) {
      const [rootQuizId, versionStr] = key.split(":");
      const version = Number(versionStr);
      missing.push({ rootQuizId, version });
    }

    return res.json({
      ok: true,
      data: { byKey, missing },
      partial: missing.length > 0,
      ...(invalid.length ? { invalid } : {}),
    });
  } catch (e) {
    console.error("[batchGetCanonicalQuizzesInternal] error", e);
    return res
      .status(500)
      .json({ ok: false, message: "Internal server error" });
  }
}
