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
  QUIZ_TYPE_COLORS,
  QuizTypeKey,
} from "../model/quiz-shared";
import { resolveSubjectColorHex } from "../utils/quiz-meta-utils";
import { isValidObjectId } from "mongoose";
import { enqueueEvent } from "../utils/events/outbox-enqueue";
import {
  buildQuizContentResetEvent,
  buildQuizDeletedEvent,
  buildQuizMetaUpdatedEvent,
} from "../utils/events/quiz-events";
import { AttemptModel } from "../model/quiz-attempt-model";

/**
 * @route   POST /quiz
 * @auth    verifyAccessToken (any authenticated user)
 * @input   Body: {
 *             quizType: "basic" | "rapid" | "crossword",
 *             name: string,
 *             subject: string,
 *             topic: string,
 *             // type-specific payload: e.g. itemsJson / entriesJson / gridJson / ...
 *          }
 * @notes   - Validates quizType and routes through the appropriate type definition.
 *           - Normalizes and validates all base fields and quiz items.
 *           - Derives `subjectColorHex` per (owner, subject) for color consistency.
 *           - Uses type-specific coercion and validation pipelines from quiz-registry.
 *           - Writes a discriminator document into MongoDB (e.g., BasicQuizModel / RapidQuizModel).
 * @logic   1) AuthN check (must be logged in)
 *           2) Validate quizType and resolve its definition
 *           3) Normalize base fields (name, subject, topic)
 *           4) Parse + coerce type-specific items
 *           5) Validate both base fields and items
 *           6) Derive subject color per owner
 *           7) Build discriminator patch and insert quiz
 *           8) Return lean quiz document
 * @returns 201 { ok: true, data: QuizBaseLean }
 * @errors  400 invalid body / validation errors
 *          401 unauthorized
 *          500 internal server error
 */

export async function createQuiz(req: CustomRequest, res: Response) {
  try {
    // ── 1) auth & basic validation
    const ownerId = req.user?.id;
    if (!ownerId)
      return res.status(401).json({ ok: false, message: "Unauthorized" });

    const { quizType } = req.body as { quizType?: string };
    if (!isQuizType(quizType)) {
      return res
        .status(400)
        .json({ ok: false, message: "Missing or invalid quizType" });
    }

    // ── 2) resolve quiz type definition
    const def = getQuizTypeDef(quizType);
    if (!def) {
      return res
        .status(400)
        .json({ ok: false, message: "Unsupported quizType" });
    }

    // ── 3) normalize base fields
    const name = (req.body.name ?? "").trim();
    const subject = (req.body.subject ?? "").trim();
    const topic = (req.body.topic ?? "").trim();

    // ── 4) items/entries pipeline (type-specific)
    const rawItems = def.readItemsFromBody(req.body);
    const items = def.coerceItems(rawItems);

    // ── 5) validate (base + items)
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

    // ── 6) subject color (derived per owner/subject)
    const subjectColorHex = await resolveSubjectColorHex(ownerId, subject);

    // ── 7) build final discriminator patch and persist
    const patch = def.buildTypePatch(req.body, items);
    const doc = await QuizBaseModel.create({
      owner: ownerId,
      quizType,
      name,
      subject,
      subjectColorHex,
      topic,
      ...patch,
    });

    // ── 8) respond lean
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
 * @input   Params: { id: string }
 * @notes   - Defensive permission check (even though router middleware enforces access).
 *           - Fetches a single quiz base document (no items population).
 *           - Admins can access all quizzes; owners can access their own.
 * @logic   1) Load quiz document by ID
 *           2) Ensure ownership or admin privileges
 *           3) Return lean quiz document
 * @returns 200 { ok: true, data: QuizBaseLean }
 * @errors  403 forbidden
 *          404 quiz not found
 *          500 internal server error
 */

export async function getQuiz(req: Request & { user?: any }, res: Response) {
  try {
    // ── 1) load
    const doc = await QuizBaseModel.findById(
      req.params.id
    ).lean<BaseQuizLean | null>();
    if (!doc) return res.status(404).json({ ok: false, message: "Not found" });

    // ── 2) defensive auth (route already has verifyQuizOwnerOrAdmin)
    const isOwner = sameId(doc.owner, req.user?.id);
    if (!isOwner && !req.user?.isAdmin) {
      return res.status(403).json({ ok: false, message: "Forbidden" });
    }

    // ── 3) respond
    return res.json({ ok: true, data: doc });
  } catch (e: any) {
    console.error("[getQuiz] error", e);
    return res
      .status(500)
      .json({ ok: false, message: "Internal server error" });
  }
}

/**
 * @route   PATCH /quiz/:id
 * @auth    verifyAccessToken + verifyQuizOwnerOrAdmin
 * @input   Params: { id }
 *          Body: base quiz fields + type-specific content payload
 * @notes   - Owner/admin can update quiz content or metadata.
 *           - Uses quiz-type definition to parse, coerce, and validate updates.
 *           - Recomputes subjectColorHex if subject changed.
 *           - Detects content changes via content hash (old vs new).
 *             - If content changed → purges attempts + emits QuizContentReset event.
 *             - Else → emits QuizMetaUpdated event.
 *           - The outbox event notifies downstream services (e.g. class-svc).
 * @logic   1) AuthN + owner/admin validation
 *           2) Resolve quiz-type definition
 *           3) Normalize next base values
 *           4) Parse + validate new items
 *           5) Recompute subjectColorHex if subject changed
 *           6) Compute content hashes (old vs new)
 *           7) Update document via discriminator model
 *           8) Purge attempts + emit QuizContentReset event if content changed
 *              or emit QuizMetaUpdated event if only metadata changed
 * @returns 200 { ok, data, contentChanged }
 * @errors  400 invalid body
 *          403 forbidden
 *          404 not found
 *          500 internal server error
 */

export async function updateQuiz(req: Request & { user?: any }, res: Response) {
  try {
    // ── 1) base doc + owner/admin check
    const base = await QuizBaseModel.findById(
      req.params.id
    ).lean<BaseQuizLean | null>();
    if (!base) return res.status(404).json({ ok: false, message: "Not found" });

    const isOwner =
      String(base.owner) === String(req.user?.id) || !!req.user?.isAdmin;
    if (!isOwner)
      return res.status(403).json({ ok: false, message: "Forbidden" });

    // ── 2) quiz type definition
    const def = getQuizTypeDef(base.quizType);
    if (!def)
      return res
        .status(400)
        .json({ ok: false, message: "Unsupported quizType" });

    // ── 3) compose next base values
    const name = (req.body.name ?? base.name).trim();
    const subject = (req.body.subject ?? base.subject).trim();
    const topic = (req.body.topic ?? base.topic).trim();

    // ── 4) items pipeline + validate
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

    // ── 5) discriminator patch + subject color (if changed)
    const patch = def.buildTypePatch(req.body, items);

    let subjectColorHex = base.subjectColorHex;
    if (subject !== base.subject) {
      subjectColorHex = await resolveSubjectColorHex(
        String(base.owner),
        subject
      );
    }

    // ── 6) detect content changes (hash old vs new)
    const oldFull = await def.Model.findById(base._id).lean();
    const oldHash = computeContentHashForDoc(base.quizType, oldFull || {});
    const newShapeForHash = { ...oldFull, ...patch };
    const newHash = computeContentHashForDoc(base.quizType, newShapeForHash);
    const CONTENT_CHANGED = oldHash !== newHash;

    // ── 7) persist update on discriminator model
    const updated = await def.Model.findOneAndUpdate(
      { _id: base._id },
      { $set: { name, subject, subjectColorHex, topic, ...patch } },
      { new: true, strict: false }
    ).lean();
    if (!updated)
      return res.status(404).json({ ok: false, message: "Not found" });

    // ── 8) side effects: purge attempts or metadata refresh event
    if (CONTENT_CHANGED) {
      const purge = await AttemptModel.deleteMany({ quizId: base._id });
      const evt = buildQuizContentResetEvent({
        quizId: String(base._id),
        oldContentHash: oldHash,
        newContentHash: newHash,
        purgedCount: purge.deletedCount ?? 0,
        resetAt: new Date().toISOString(),
      });
      await enqueueEvent(evt.type as any, evt);
    } else {
      const metaEvt = buildQuizMetaUpdatedEvent({
        quizId: String(base._id),
        name,
        subject,
        subjectColorHex: subjectColorHex ?? "",
        topic,
        updatedAt: new Date().toISOString(),
      });
      await enqueueEvent(metaEvt.type as any, metaEvt);
    }

    // ── 9) respond
    return res.json({
      ok: true,
      data: updated,
      contentChanged: CONTENT_CHANGED,
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
 * @input   Params: { id }
 * @notes   - Deletes a quiz document and purges all related attempts.
 *           - Emits a QuizDeleted event for the Class Service via the outbox queue.
 *           - The event includes metadata: quizId, deletedAt, and purgeCount.
 *           - Owners can delete their own quizzes; admins can delete any quiz.
 * @logic   1) Load quiz and verify ownership or admin privileges
 *           2) Delete the quiz document
 *           3) Purge associated attempts
 *           4) Build QuizDeleted event (buildQuizDeletedEvent) and enqueue to outbox
 *           5) Respond success
 * @returns 200 { ok: true }
 * @errors  403 forbidden
 *          404 not found
 *          500 internal server error
 */

export async function deleteQuiz(req: Request & { user?: any }, res: Response) {
  try {
    // ── 1) Load quiz and check ownership
    const base = await QuizBaseModel.findById(
      req.params.id
    ).lean<BaseQuizLean | null>();
    if (!base) {
      return res.status(404).json({ ok: false, message: "Not found" });
    }

    const isOwner =
      String(base.owner) === String(req.user?.id) || !!req.user?.isAdmin;
    if (!isOwner) {
      return res.status(403).json({ ok: false, message: "Forbidden" });
    }

    // ── 2) Delete quiz and purge attempts
    await QuizBaseModel.deleteOne({ _id: base._id });
    const purge = await AttemptModel.deleteMany({ quizId: base._id });

    // ── 3) Build & enqueue deletion event for class-svc
    const event = buildQuizDeletedEvent({
      quizId: String(base._id),
      purgeCount: purge.deletedCount ?? 0,
    });

    await enqueueEvent(event.type, event);

    // ── 4) Respond success
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
 *             name?: string,
 *             subjects?: string[],
 *             topics?: string[],
 *             types?: string[],
 *             createdStart?: string,
 *             createdEnd?: string,
 *             page?: number,
 *             pageSize?: number
 *           }
 * @notes   - Admin-only endpoint for listing all quizzes in the system.
 *           - Returns metadata only (no quiz content).
 *           - Supports filtering and pagination (page/pageSize).
 *           - Sorted by `createdAt` descending by default.
 * @logic   1) Parse and normalize filters from query
 *           2) Build MongoDB query filter
 *           3) Count total + compute pagination
 *           4) Fetch page with metadata projection
 *           5) Return rows, page info, and totals
 * @returns 200 { ok, rows, page, pageCount, total }
 * @errors  500 internal server error
 */

export async function listAllQuizzes(req: CustomRequest, res: Response) {
  try {
    // ── 1) normalize filters
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

    // ── 2) pagination
    const pageSize = clamp(q.pageSize ?? 20, 1, 100);
    const page = Math.max(
      1,
      Number.isFinite(q.page ?? 1) ? (q.page as number) : 1
    );

    // ── 3) mongo filter
    const filter = buildMongoFilter(undefined, q);

    // ── 4) totals + fetch page
    const total = await QuizBaseModel.countDocuments(filter);
    const pageCount = Math.max(1, Math.ceil(total / pageSize));
    const safePage = clamp(page, 1, pageCount);

    const rows = await QuizBaseModel.find(filter)
      .select(META_PROJECTION)
      .sort({ createdAt: -1 })
      .skip((safePage - 1) * pageSize)
      .limit(pageSize)
      .lean<QuizMeta[]>();

    // ── 5) respond
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
 * @input   Owner implicitly = req.user.id
 *          Query: {
 *             name?, subjects[]?, topics[]?, types[]?,
 *             createdStart?, createdEnd?, page?, pageSize?
 *          }
 * @notes   - Returns metadata for quizzes owned by the authenticated user.
 *           - Supports server-side filtering and pagination.
 *           - Adds `typeColorHex` for UI purposes, derived from QUIZ_TYPE_COLORS.
 * @logic   1) AuthN check
 *           2) Parse filters and pagination
 *           3) Build MongoDB query for owner
 *           4) Count total + fetch paginated results
 *           5) Enrich each quiz with typeColorHex
 * @returns 200 { ok, rows, page, pageCount, total }
 * @errors  401 unauthorized
 *          500 internal server error
 */

export async function listMyQuizzes(req: CustomRequest, res: Response) {
  try {
    // ── 1) auth
    const ownerId = req.user?.id;
    if (!ownerId)
      return res.status(401).json({ ok: false, message: "Unauthorized" });

    // ── 2) filters
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

    // ── 3) pagination + filter
    const pageSize = clamp(q.pageSize ?? 20, 1, 100);
    const page = Math.max(
      1,
      Number.isFinite(q.page ?? 1) ? (q.page as number) : 1
    );
    const filter = buildMongoFilter(ownerId, q);

    // ── 4) totals + fetch page
    const total = await QuizBaseModel.countDocuments(filter);
    const pageCount = Math.max(1, Math.ceil(total / pageSize));
    const safePage = clamp(page, 1, pageCount);

    const rows = await QuizBaseModel.find(filter)
      .select(META_PROJECTION)
      .sort({ createdAt: -1 })
      .skip((safePage - 1) * pageSize)
      .limit(pageSize)
      .lean<QuizMeta[]>();

    // ── 5) enrich type color
    const enriched = rows.map((r) => ({
      ...r,
      typeColorHex: QUIZ_TYPE_COLORS[r.quizType as QuizTypeKey] || undefined,
    }));

    // ── 6) respond
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
  createdAt: 1,
  updatedAt: 1,
} as const;

type QuizMeta = {
  _id: string;
  owner: string;
  quizType: string;
  name: string;
  subject: string;
  subjectColorHex?: string;
  topic?: string;
  createdAt: string | Date;
  updatedAt: string | Date;
};

/**
 * @route   POST /quiz/batch
 * @auth    verifyAccessToken
 * @input   Body: { ids: string[] }
 * @notes   - Returns quiz metadata for all provided IDs that the user is authorized to access.
 *           - Non-existent or unauthorized quiz IDs appear in `missing`.
 *           - Includes `typeColorHex` (from QUIZ_TYPE_COLORS) for UI color mapping.
 *           - Does not expose existence of unauthorized quizzes (no information leak).
 * @logic   1) Normalize and dedupe IDs
 *           2) Split into valid vs invalid ObjectIds
 *           3) Fetch all valid quiz metadata
 *           4) Include only quizzes owned by user or accessible by admin
 *           5) Build `byId` map and `missing` array
 * @returns 200 {
 *            ok,
 *            data: { byId, missing },
 *            partial?: boolean,
 *            invalid?: string[]
 *          }
 * @errors  400 missing ids
 *          500 internal server error
 */

export async function batchGetQuizzes(req: CustomRequest, res: Response) {
  try {
    // ── 1) normalize ids
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

    // ── 2) split valid/invalid
    const invalid: string[] = ids.filter((id) => !isValidObjectId(id));
    const validIds: string[] = ids.filter((id) => isValidObjectId(id));

    // ── 3) fetch metadata
    const docs =
      validIds.length > 0
        ? await QuizBaseModel.find({ _id: { $in: validIds } })
            .select(META_PROJECTION)
            .lean<QuizMeta[]>()
        : [];

    // ── 4) assemble byId for authorized docs only (owner or admin) + topicColorHex
    const byId: Record<string, QuizMeta & { typeColorHex?: string }> = {};

    for (const doc of docs) {
      const id = String((doc as any)._id);
      const authorized =
        req.user?.isAdmin ||
        String((doc as any).owner) === String(req.user?.id);

      if (authorized) {
        const quizType = String((doc as any).quizType) as QuizTypeKey;
        const typeColorHex = QUIZ_TYPE_COLORS[quizType] || undefined;

        byId[id] = {
          ...(doc as any),
          _id: id,
          typeColorHex,
        };
      }
    }

    // ── 5) compute missing (includes invalid, not-found, forbidden)
    const missing: string[] = ids.filter((id) => !(id in byId));

    // ── 6) respond
    return res.json({
      ok: true,
      data: { byId, missing },
      partial: missing.length > 0,
      ...(invalid.length ? { invalid } : {}),
    });
  } catch (e) {
    console.error("[batchGetQuizzes] error", e);
    return res
      .status(500)
      .json({ ok: false, message: "Internal server error" });
  }
}
