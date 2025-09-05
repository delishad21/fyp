import { Request, Response } from "express";
import { QuizBaseModel, BaseQuizLean } from "../model/quiz-base-model";
import { getQuizTypeDef } from "../model/quiz-registry";
import { CustomRequest } from "../middleware/access-control";
import { parseStringArrayParam } from "../utils/query-parser";
import { UserQuizMetaModel } from "../model/quiz-meta-model";
import { stringToColorHex } from "../utils/color";
import { sameId, ListFilters, clamp, buildMongoFilter } from "./quiz-helpers";
import { QUIZ_TYPE_COLORS } from "../utils/quiz-constants";

/**
 * createQuiz
 *
 * Purpose:
 * - Creates a new quiz document for the authenticated user.
 * - Supports multiple quiz types (basic, rapid, crossword, etc.) via discriminator.
 *
 * Params:
 * - @param {CustomRequest} req — Express request extended with `user`.
 * - @param {Response} res — Express response.
 *
 * Behavior:
 * - Requires authentication (`req.user.id`).
 * - Validates `quizType` against registry (`getQuizTypeDef`).
 * - Reads items from body, coerces, and validates them with type-specific logic.
 * - Returns 400 if there are validation errors.
 * - Builds a type-specific patch (including uploaded images).
 * - Creates and returns the quiz document (lean).
 *
 * Responses:
 * - 201 { ok: true, data } on success.
 * - 400 { ok: false, fieldErrors, questionErrors } on validation failure.
 * - 401 if unauthorized.
 * - 500 on server error.
 */
export async function createQuiz(req: CustomRequest, res: Response) {
  try {
    const ownerId = req.user?.id;
    if (!ownerId) {
      return res.status(401).json({ ok: false, message: "Unauthorized" });
    }

    const { quizType } = req.body as { quizType?: string };
    const def = quizType ? getQuizTypeDef(quizType) : null;
    if (!quizType || !def) {
      return res
        .status(400)
        .json({ ok: false, message: "Missing or invalid quizType" });
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

    const patch = def.buildTypePatch(req.body, items);

    const doc = await QuizBaseModel.create({
      owner: ownerId,
      quizType,
      name,
      subject,
      topic,
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
 * getQuiz
 *
 * Purpose:
 * - Fetches a quiz by ID if the requester is the owner or an admin.
 *
 * Params:
 * - @param {Request & { user?: any }} req — Express request with optional `user`.
 * - @param {Response} res — Express response.
 *
 * Behavior:
 * - Looks up quiz by `req.params.id`.
 * - Checks ownership or admin privileges.
 * - Returns 403 if forbidden, 404 if not found.
 *
 * Responses:
 * - 200 { ok: true, data } on success.
 * - 403 if not owner/admin.
 * - 404 if quiz not found.
 * - 500 on server error.
 */
export async function getQuiz(req: Request & { user?: any }, res: Response) {
  try {
    const doc = await QuizBaseModel.findById(
      req.params.id
    ).lean<BaseQuizLean | null>();

    if (!doc) {
      return res.status(404).json({ ok: false, message: "Not found" });
    }

    const isOwner = sameId(doc.owner, req.user?.id);
    if (!isOwner && !req.user?.isAdmin) {
      return res.status(403).json({ ok: false, message: "Forbidden" });
    }

    return res.json({ ok: true, data: doc });
  } catch (e: any) {
    console.error("[getQuiz] error", e);
    return res
      .status(500)
      .json({ ok: false, message: "Internal server error" });
  }
}

/**
 * updateQuiz
 *
 * Purpose:
 * - Updates an existing quiz document.
 * - Allows only the owner or an admin.
 *
 * Params:
 * - @param {Request & { user?: any }} req — Express request with user.
 * - @param {Response} res — Express response.
 *
 * Behavior:
 * - Validates ownership/admin.
 * - Resolves type definition from discriminator (`getQuizTypeDef`).
 * - Reads, coerces, and validates items.
 * - Builds patch and updates quiz using type-specific model.
 *
 * Responses:
 * - 200 { ok: true, data } on success.
 * - 400 { ok: false } if validation fails or quiz type invalid.
 * - 403 if forbidden.
 * - 404 if quiz not found.
 * - 500 on server error.
 */
export async function updateQuiz(req: Request & { user?: any }, res: Response) {
  try {
    const base = await QuizBaseModel.findById(
      req.params.id
    ).lean<BaseQuizLean | null>();
    if (!base) return res.status(404).json({ ok: false, message: "Not found" });

    const isOwner = String(base.owner) === String(req.user?.id);
    if (!isOwner && !req.user?.isAdmin) {
      return res.status(403).json({ ok: false, message: "Forbidden" });
    }

    const def = getQuizTypeDef(base.quizType);
    if (!def) {
      return res
        .status(400)
        .json({ ok: false, message: "Invalid quiz type on document" });
    }

    const {
      name = base.name,
      subject = base.subject,
      topic = base.topic,
    } = req.body;

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

    const patch = def.buildTypePatch(req.body, items);

    const updated = await def.Model.findOneAndUpdate(
      { _id: req.params.id },
      { $set: { name, subject, topic, ...patch } },
      { new: true, strict: false }
    ).lean();

    if (!updated)
      return res.status(404).json({ ok: false, message: "Not found" });

    return res.json({ ok: true, data: updated });
  } catch (e: any) {
    console.error("[updateQuiz] error", e);
    return res
      .status(500)
      .json({ ok: false, message: "Internal server error" });
  }
}

/**
 * deleteQuiz
 *
 * Purpose:
 * - Deletes a quiz document.
 * - Only allowed for owner or admin.
 *
 * Params:
 * - @param {Request & { user?: any }} req — Express request with user.
 * - @param {Response} res — Express response.
 *
 * Behavior:
 * - Looks up quiz by ID.
 * - Verifies owner/admin.
 * - Deletes quiz if authorized.
 *
 * Responses:
 * - 200 { ok: true } on success.
 * - 403 if forbidden.
 * - 404 if not found.
 * - 500 on server error.
 */
export async function deleteQuiz(req: Request & { user?: any }, res: Response) {
  try {
    const base = await QuizBaseModel.findById(
      req.params.id
    ).lean<BaseQuizLean | null>();

    if (!base) {
      return res.status(404).json({ ok: false, message: "Not found" });
    }

    const isOwner = sameId(base.owner, req.user?.id);
    if (!isOwner && !req.user?.isAdmin) {
      return res.status(403).json({ ok: false, message: "Forbidden" });
    }

    await QuizBaseModel.deleteOne({ _id: req.params.id });
    return res.json({ ok: true });
  } catch (e: any) {
    console.error("[deleteQuiz] error", e);
    return res
      .status(500)
      .json({ ok: false, message: "Internal server error" });
  }
}

/**
 * listAllQuizzes
 *
 * Purpose:
 * - Lists all quizzes in the system (admin-only).
 *
 * Params:
 * - @param {CustomRequest} req — Express request with query filters.
 * - @param {Response} res — Express response.
 *
 * Behavior:
 * - Accepts filters: name, subjects, topics, types, createdStart, createdEnd.
 * - Supports pagination (`page`, `pageSize`).
 * - Builds Mongo query with `buildMongoFilter`.
 * - Returns paginated result.
 *
 * Responses:
 * - 200 { ok: true, rows, page, pageCount, total } on success.
 * - 500 on server error.
 */
export async function listAllQuizzes(req: CustomRequest, res: Response) {
  try {
    // parse filters
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

    const total = await QuizBaseModel.countDocuments(filter);
    const pageCount = Math.max(1, Math.ceil(total / pageSize));
    const safePage = clamp(page, 1, pageCount);

    const rows = await QuizBaseModel.find(filter)
      .sort({ createdAt: -1 })
      .skip((safePage - 1) * pageSize)
      .limit(pageSize)
      .lean<BaseQuizLean[]>();

    return res.json({
      ok: true,
      rows,
      page: safePage,
      pageCount,
      total,
    });
  } catch (e: any) {
    console.error("[listAllQuizzes] error", e);
    return res
      .status(500)
      .json({ ok: false, message: "Internal server error" });
  }
}

type QuizRowOut = BaseQuizLean & {
  subjectColorHex?: string;
  typeColorHex?: string;
};

/**
 * listMyQuizzes
 *
 * Purpose:
 * - Lists quizzes owned by the authenticated user.
 *
 * Params:
 * - @param {CustomRequest} req — Express request with user and query filters.
 * - @param {Response} res — Express response.
 *
 * Behavior:
 * - Requires authentication (`req.user.id`).
 * - Accepts same filters as `listAllQuizzes`.
 * - Enriches each row with subjectColorHex and typeColorHex.
 *   • subjectColorHex pulled from user’s quiz meta palette or fallback hash.
 *   • typeColorHex pulled from `QUIZ_TYPE_COLORS`.
 * - Returns paginated enriched results.
 *
 * Responses:
 * - 200 { ok: true, rows, page, pageCount, total } on success.
 * - 401 if unauthorized.
 * - 500 on server error.
 */
export async function listMyQuizzes(req: CustomRequest, res: Response) {
  try {
    const ownerId = req.user?.id;
    if (!ownerId) {
      return res.status(401).json({ ok: false, message: "Unauthorized" });
    }

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

    const total = await QuizBaseModel.countDocuments(filter);
    const pageCount = Math.max(1, Math.ceil(total / pageSize));
    const safePage = clamp(page, 1, pageCount);

    // Pull owner’s subject palette once
    const meta = await UserQuizMetaModel.findOne({ owner: ownerId })
      .select("subjects")
      .lean<{
        subjects?: { label?: string; value?: string; colorHex?: string }[];
      } | null>();

    // Build a quick lookup for both label and (legacy) value → color
    const subjectColorMap = new Map<string, string>();
    (meta?.subjects ?? []).forEach((s) => {
      const color =
        (s?.colorHex && s.colorHex.startsWith("#")
          ? s.colorHex
          : s?.colorHex
          ? `#${s.colorHex}`
          : undefined) || (s?.label ? stringToColorHex(s.label) : undefined);

      if (!color) return;
      if (s?.label) subjectColorMap.set(s.label, color);
      if (s?.value) subjectColorMap.set(s.value, color); // legacy safety
    });

    const rows = await QuizBaseModel.find(filter)
      .sort({ createdAt: -1 })
      .skip((safePage - 1) * pageSize)
      .limit(pageSize)
      .lean<BaseQuizLean[]>();

    const enriched: QuizRowOut[] = rows.map((r) => ({
      ...r,
      subjectColorHex:
        subjectColorMap.get(r.subject) || stringToColorHex(r.subject),
      typeColorHex: QUIZ_TYPE_COLORS[r.quizType] || undefined,
    }));

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
