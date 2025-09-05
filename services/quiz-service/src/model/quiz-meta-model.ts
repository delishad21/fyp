import {
  Schema,
  model,
  models,
  Types,
  InferSchemaType,
  HydratedDocument,
  Model,
} from "mongoose";

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

/** Model type (optional but nice to have if you add statics/methods later) */
export type UserQuizMetaModelType = Model<UserQuizMeta>;

/** ---------- Model ---------- */
export const UserQuizMetaModel: UserQuizMetaModelType =
  (models.UserQuizMeta as UserQuizMetaModelType) ||
  model<UserQuizMeta>("UserQuizMeta", UserQuizMetaSchema);
