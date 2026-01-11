import {
  Schema,
  model,
  models,
  Types,
  InferSchemaType,
  HydratedDocument,
  Model,
} from "mongoose";

/**
 * Schema for user quiz metadata. Each user has one document storing
 * their subjects and topics used across quizzes. subjects are stored
 * with both label and colorHex, while topics only store label.
 *
 *
 * Note: This will be eventually deprecated. When quiz sharing is implemented,
 * subjects, subject colors, and topics will be have to be standardized across users.
 * For now, this is sufficient to provide per-user customization.
 */

/** subjects keep label + colorHex */
const SubjectSchema = new Schema(
  {
    label: { type: String, required: true, trim: true },
    colorHex: { type: String, required: true, trim: true },
  },
  { _id: false }
);

/** topics keep label only */
const TopicSchema = new Schema(
  {
    label: { type: String, required: true, trim: true },
  },
  { _id: false }
);

const UserQuizMetaSchema = new Schema(
  {
    owner: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },
    subjects: { type: [SubjectSchema], default: [] }, // [{ label, colorHex }]
    topics: { type: [TopicSchema], default: [] }, // [{ label }]
  },
  { timestamps: true, minimize: true }
);

/** ---------- Exported Types ---------- */
export type Subject = InferSchemaType<typeof SubjectSchema>;
export type Topic = InferSchemaType<typeof TopicSchema>;
export type UserQuizMeta = InferSchemaType<typeof UserQuizMetaSchema> & {
  _id: Types.ObjectId;
};

/** Hydrated doc (when not using .lean()) */
export type UserQuizMetaDoc = HydratedDocument<UserQuizMeta>;

/** Model type */
export type UserQuizMetaModelType = Model<UserQuizMeta>;

/** ---------- Model ---------- */
export const UserQuizMetaModel: UserQuizMetaModelType =
  (models.UserQuizMeta as UserQuizMetaModelType) ||
  model<UserQuizMeta>("UserQuizMeta", UserQuizMetaSchema);
