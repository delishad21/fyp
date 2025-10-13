import { CustomRequest } from "../middleware/access-control";
import { Response } from "express";
import { UserQuizMetaModel } from "../model/quiz-meta-model";
import { QuizBaseModel } from "../model/quiz-base-model";
import { stringToColorHex } from "../utils/color";
import { MetaDoc, toPayload, sameLabel } from "../utils/quiz-meta-utils";

/**
 * @route  GET /quiz/meta
 * @auth   verifyAccessToken
 * @input  none (owner is derived from req.user.id)
 * @logic  Retrieve (or implicitly synthesize) the owner’s quiz metadata:
 *         - subjects: [{ label, colorHex }]
 *         - topics:   [{ label }]
 *         - types:    static registry-derived { label, value, colorHex }
 * @returns 200 { ok: true, subjects, topics, types }
 * @errors  401 if unauthenticated
 *          500 on server error
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

/**
 * @route  POST /quiz/meta
 * @auth   verifyAccessToken
 * @input  Body: { kind: "subject" | "topic", label: string, colorHex?: string }
 * @logic  Upsert owner’s metadata:
 *         - kind = "subject":
 *           • If subject exists (case-insensitive), update its color when provided.
 *           • Else insert with provided colorHex (normalizing "#" if missing) or hash color.
 *         - kind = "topic":
 *           • Insert if not present (case-insensitive); no additional fields.
 *         - If user has no meta doc, create it populated with the item.
 * @returns 201 on first creation, 200 otherwise; payload { ok, subjects, topics, types }
 * @errors  400 if missing kind/label
 *          401 if unauthenticated
 *          500 on server error
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

/**
 * @route  PATCH /quiz/meta/:kind/:value
 * @auth   verifyAccessToken
 * @input  Params: { kind: "subject" | "topic", value: string }  // current label
 *         Body:   { label?: string, colorHex?: string }
 * @logic  Edit an existing subject/topic (case-insensitive lookup):
 *         - Subjects:
 *           • Rename label (reject if duplicate would result).
 *           • Update colorHex (normalizes leading '#'; does not validate full hex spec here).
 *           • Cascade rename to all owner quizzes referencing old subject.
 *         - Topics:
 *           • Rename label (reject if duplicate would result).
 *           • Cascade rename to all owner quizzes referencing old topic.
 *         - If neither `label` nor `colorHex` provided => 400.
 * @returns 200 { ok, subjects, topics, types }
 * @errors  400 missing/invalid params or empty patch
 *          401 unauthenticated
 *          404 meta doc/item not found
 *          409 duplicate label conflict
 *          500 server error
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

/**
 * @route  DELETE /quiz/meta/:kind/:value
 * @auth   verifyAccessToken
 * @input  Params: { kind: "subject" | "topic", value: string } // label to remove
 * @logic  Remove a subject/topic from the user’s metadata AFTER ensuring it is not
 *         referenced by any of the user’s quizzes. If referenced, reject with 409
 *         and return the number of referencing quizzes.
 * @returns 200 { ok: true, subjects, topics, types }
 * @errors  400 missing params
 *          401 unauthenticated
 *          409 cannot delete while referenced (includes `count`)
 *          500 server error
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
