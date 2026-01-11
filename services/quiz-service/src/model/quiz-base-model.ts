import { Schema, model, models, Types } from "mongoose";
import { QuizTypeKey, QUIZ_TYPES } from "./quiz-shared";

/**
 * BaseQuiz model
 * - Holds common quiz metadata.
 * - Discriminated by `quizType` for type-specific fields.
 * - Versioned via (rootQuizId, version).
 */
export type BaseQuizLean = {
  _id: Types.ObjectId;
  owner: Types.ObjectId;
  quizType: QuizTypeKey;

  // Versioning
  rootQuizId: Types.ObjectId; // “family” id — same for all versions
  version: number; // 1,2,3,...
  status: "active" | "archived"; // for soft deletion (currently unused)

  name: string;
  subject: string;
  subjectColorHex: string;
  topic: string;
  createdAt?: Date | string;
  updatedAt?: Date | string;
};

export const BaseQuizSchema = new Schema(
  {
    owner: { type: Types.ObjectId, ref: "User", required: true, index: true },
    quizType: {
      type: String,
      required: true,
      index: true,
      enum: QUIZ_TYPES,
    },

    // ── Versioning fields ────────────────────────
    rootQuizId: {
      type: Types.ObjectId,
      required: true,
      index: true,
    },
    version: {
      type: Number,
      required: true,
      index: true,
      default: 1,
    },
    status: {
      type: String,
      enum: ["active", "archived"],
      default: "active",
      index: true,
    },

    // ── Common metadata ─────────────────────────
    name: { type: String, required: true, trim: true },
    subject: { type: String, required: true, trim: true },
    subjectColorHex: { type: String, required: true, trim: true },
    topic: { type: String, required: true, trim: true },
  },
  {
    timestamps: true,
    discriminatorKey: "quizType",
    minimize: true,
  }
);

// One family can’t have two quizzes with the same version
// Enforced at the DB level
BaseQuizSchema.index({ rootQuizId: 1, version: 1 }, { unique: true });

export const QuizBaseModel = models.Quiz || model("Quiz", BaseQuizSchema);

/**
 * Fetches latest metadata for each quiz family in `rootIds`.
 * @param rootIds Array of root quiz IDs
 * @returns Map of rootQuizId to metadata object
 */
export async function getFamilyMetaMap(rootIds: string[]) {
  const unique = Array.from(new Set(rootIds.filter(Boolean)));
  if (unique.length === 0) return new Map<string, any>();

  // Latest per family by version
  const rows = await QuizBaseModel.aggregate([
    {
      $match: {
        rootQuizId: { $in: unique.map((id) => new Types.ObjectId(id)) },
      },
    },
    { $sort: { rootQuizId: 1, version: -1 } },
    {
      $group: {
        _id: "$rootQuizId",
        doc: {
          $first: {
            name: "$name",
            subject: "$subject",
            subjectColorHex: "$subjectColorHex",
            topic: "$topic",
            owner: "$owner",
          },
        },
      },
    },
  ]);

  const map = new Map<string, any>();
  for (const r of rows) map.set(String(r._id), r.doc);
  return map;
}
