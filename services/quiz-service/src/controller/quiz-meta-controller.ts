import { CustomRequest } from "../middleware/access-control";
import { Response } from "express";
import { UserQuizMetaModel } from "../model/quiz-meta-model";
import { QuizBaseModel } from "../model/quiz-base-model";
import { stringToColorHex } from "../utils/color";
import { MetaDoc, toPayload, sameLabel } from "./quiz-meta-helpers";

/** GET /quiz/meta
 *
 * Purpose:
 * - Fetches the current user’s quiz metadata (subjects, topics, types).
 *
 * Params:
 * - @param {CustomRequest} req — Express request with `user` field.
 * - @param {Response} res — Express response.
 *
 * Behavior:
 * - Requires authentication (`req.user.id`).
 * - Loads `UserQuizMetaModel` for the owner if it exists.
 * - Always includes static quiz types (`basic`, `rapid`, `crossword`) with colors.
 *
 * Responses:
 * - 200 { ok: true, subjects, topics, types } on success.
 * - 401 if unauthorized.
 * - 500 on server error.
 */
export async function getMyMeta(req: CustomRequest, res: Response) {
  try {
    const owner = req.user?.id;
    if (!owner)
      return res.status(401).json({ ok: false, message: "Unauthorized" });

    const doc = await UserQuizMetaModel.findOne({
      owner,
    }).lean<MetaDoc | null>();
    return res.json({ ok: true, ...toPayload(doc) });
  } catch (e) {
    console.error("[getMyMeta] error", e);
    return res
      .status(500)
      .json({ ok: false, message: "Internal server error" });
  }
}

/** POST /quiz/meta
 *
 * Purpose:
 * - Adds or updates a subject/topic in the user’s quiz metadata.
 *
 * Params:
 * - @param {CustomRequest} req — Express request with body { kind, label, colorHex? }.
 * - @param {Response} res — Express response.
 *
 * Behavior:
 * - Requires authentication.
 * - Body: { kind: "subject" | "topic", label: string, colorHex?: string }.
 * - Subjects:
 *   • If subject exists, updates its color if provided.
 *   • If new, inserts with colorHex or fallback from `stringToColorHex`.
 * - Topics:
 *   • If topic exists, no-op.
 *   • If new, inserts as { label }.
 * - Creates new `UserQuizMetaModel` doc if none exists yet.
 *
 * Responses:
 * - 201 { ok: true, subjects, topics, types } when new doc created.
 * - 200 { ok: true, subjects, topics, types } when updated.
 * - 400 if missing kind/label.
 * - 401 if unauthorized.
 * - 500 on server error.
 */
export async function addMeta(req: CustomRequest, res: Response) {
  try {
    const owner = req.user?.id;
    if (!owner)
      return res.status(401).json({ ok: false, message: "Unauthorized" });

    const { kind } = (req.body ?? {}) as { kind: "subject" | "topic" };
    let { label, colorHex } = (req.body ?? {}) as {
      label: string;
      colorHex?: string;
    };
    label = String(label ?? "").trim();

    if (!kind || !label) {
      return res.status(400).json({ ok: false, message: "Missing kind/label" });
    }

    const doc = await UserQuizMetaModel.findOne({ owner });
    if (!doc) {
      if (kind === "subject") {
        const color = colorHex?.trim()
          ? colorHex.startsWith("#")
            ? colorHex
            : `#${colorHex}`
          : stringToColorHex(label);
        const created = await UserQuizMetaModel.create({
          owner,
          subjects: [{ label, colorHex: color }],
          topics: [],
        });
        return res
          .status(201)
          .json({ ok: true, ...toPayload(created.toObject() as any) });
      } else {
        const created = await UserQuizMetaModel.create({
          owner,
          subjects: [],
          topics: [{ label }],
        });
        return res
          .status(201)
          .json({ ok: true, ...toPayload(created.toObject() as any) });
      }
    }

    if (kind === "subject") {
      const idx = (doc.subjects ?? []).findIndex((s) =>
        sameLabel(s.label, label)
      );
      if (idx >= 0) {
        if (colorHex?.trim()) {
          doc.subjects[idx].colorHex = colorHex.startsWith("#")
            ? colorHex
            : `#${colorHex}`;
          await doc.save();
        }
      } else {
        const color = colorHex?.trim()
          ? colorHex.startsWith("#")
            ? colorHex
            : `#${colorHex}`
          : stringToColorHex(label);
        doc.subjects.push({ label, colorHex: color });
        await doc.save();
      }
    } else {
      const exists = (doc.topics ?? []).some((t) => sameLabel(t.label, label));
      if (!exists) {
        doc.topics.push({ label });
        await doc.save();
      }
    }

    return res.json({ ok: true, ...toPayload(doc.toObject() as any) });
  } catch (e) {
    console.error("[addMeta] error", e);
    return res
      .status(500)
      .json({ ok: false, message: "Internal server error" });
  }
}

/** PATCH /quiz/meta/:kind/:value
 *
 * Purpose:
 * - Edits an existing subject/topic in the user’s metadata.
 * - Optionally cascades renames to user’s quizzes.
 *
 * Params:
 * - @param {CustomRequest} req — Express request with params { kind, value } and body { label?, colorHex? }.
 * - @param {Response} res — Express response.
 *
 * Behavior:
 * - Requires authentication.
 * - Subjects:
 *   • Can rename label (de-duped, case-insensitive).
 *   • Can update colorHex.
 *   • Renames all quizzes referencing old subject → new subject.
 * - Topics:
 *   • Can rename label (de-duped).
 *   • Renames all quizzes referencing old topic → new topic.
 * - Returns updated meta payload.
 *
 * Responses:
 * - 200 { ok: true, subjects, topics, types } on success.
 * - 400 if nothing to update or invalid params.
 * - 401 if unauthorized.
 * - 404 if meta doc/item not found.
 * - 409 if duplicate label exists.
 * - 500 on server error.
 */
export async function editMeta(req: CustomRequest, res: Response) {
  try {
    const owner = req.user?.id;
    if (!owner)
      return res.status(401).json({ ok: false, message: "Unauthorized" });

    const { kind, value } = req.params as {
      kind: "subject" | "topic";
      value: string;
    };
    if (!kind || !value?.trim()) {
      return res.status(400).json({ ok: false, message: "Missing kind/value" });
    }

    const { label: newLabelRaw, colorHex } = (req.body ?? {}) as {
      label?: string;
      colorHex?: string;
    };
    const newLabel = newLabelRaw?.trim();

    if (!newLabel && !colorHex) {
      return res.status(400).json({ ok: false, message: "Nothing to update" });
    }

    const doc = await UserQuizMetaModel.findOne({ owner });
    if (!doc) {
      return res
        .status(404)
        .json({ ok: false, message: "Meta document not found" });
    }

    const oldLabel = value.trim();

    if (kind === "subject") {
      const idx = (doc.subjects ?? []).findIndex((s) =>
        sameLabel(s.label, oldLabel)
      );
      if (idx < 0) {
        return res
          .status(404)
          .json({ ok: false, message: "Meta item not found" });
      }

      if (newLabel && !sameLabel(newLabel, oldLabel)) {
        const dup = (doc.subjects ?? []).some(
          (s, i) => i !== idx && sameLabel(s.label, newLabel)
        );
        if (dup) {
          return res.status(409).json({
            ok: false,
            message: `Subject "${newLabel}" already exists.`,
          });
        }
      }

      if (newLabel) doc.subjects[idx].label = newLabel;
      if (colorHex?.trim()) {
        doc.subjects[idx].colorHex = colorHex.startsWith("#")
          ? colorHex
          : `#${colorHex}`;
      }
      await doc.save();

      if (newLabel && !sameLabel(newLabel, oldLabel)) {
        await QuizBaseModel.updateMany(
          { owner, subject: oldLabel },
          { $set: { subject: newLabel } }
        );
      }
    } else {
      // topics are [{ label }]
      const i = (doc.topics ?? []).findIndex((t) =>
        sameLabel(t.label, oldLabel)
      );
      if (i < 0) {
        return res
          .status(404)
          .json({ ok: false, message: "Meta item not found" });
      }

      if (newLabel) {
        const dup = (doc.topics ?? []).some(
          (t, j) => j !== i && sameLabel(t.label, newLabel)
        );
        if (dup) {
          return res.status(409).json({
            ok: false,
            message: `Topic "${newLabel}" already exists.`,
          });
        }

        const prev = doc.topics[i].label;
        doc.topics[i].label = newLabel;
        await doc.save();

        if (!sameLabel(newLabel, prev)) {
          await QuizBaseModel.updateMany(
            { owner, topic: oldLabel },
            { $set: { topic: newLabel } }
          );
        }
      } else {
        return res
          .status(400)
          .json({ ok: false, message: "Nothing to update" });
      }
    }

    return res.json({ ok: true, ...toPayload(doc.toObject() as any) });
  } catch (e) {
    console.error("[editMeta] error", e);
    return res
      .status(500)
      .json({ ok: false, message: "Internal server error" });
  }
}

/** DELETE /quiz/meta/:kind/:value
 *
 * Purpose:
 * - Deletes a subject/topic from the user’s metadata.
 *
 * Params:
 * - @param {CustomRequest} req — Express request with params { kind, value }.
 * - @param {Response} res — Express response.
 *
 * Behavior:
 * - Requires authentication.
 * - Prevents deletion if any quiz owned by user still references the subject/topic.
 * - Uses `$pull` to remove the entry from `UserQuizMetaModel`.
 *
 * Responses:
 * - 200 { ok: true, subjects, topics, types } on success.
 * - 400 if missing params.
 * - 401 if unauthorized.
 * - 409 if subject/topic is still in use by quizzes (returns count).
 * - 500 on server error.
 */
export async function deleteMeta(req: CustomRequest, res: Response) {
  try {
    const owner = req.user?.id;
    if (!owner)
      return res.status(401).json({ ok: false, message: "Unauthorized" });

    const { kind, value } = req.params as {
      kind: "subject" | "topic";
      value: string;
    };
    if (!kind || !value?.trim()) {
      return res.status(400).json({ ok: false, message: "Missing kind/value" });
    }

    const label = value.trim();
    const field = kind === "subject" ? "subject" : "topic";

    const inUse = await QuizBaseModel.countDocuments({ owner, [field]: label });
    if (inUse > 0) {
      return res.status(409).json({
        ok: false,
        message: `Cannot delete ${kind} "${label}" while ${inUse} quiz(es) reference it.`,
        inUse: true,
        count: inUse,
      });
    }

    const patch =
      kind === "subject"
        ? { $pull: { subjects: { label } } }
        : { $pull: { topics: { label } } };

    const pulled = await UserQuizMetaModel.findOneAndUpdate({ owner }, patch, {
      new: true,
    }).lean<MetaDoc | null>();

    return res.json({ ok: true, ...toPayload(pulled) });
  } catch (e) {
    console.error("[deleteMeta] error", e);
    return res
      .status(500)
      .json({ ok: false, message: "Internal server error" });
  }
}
