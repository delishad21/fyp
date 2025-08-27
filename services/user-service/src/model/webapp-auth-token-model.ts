import mongoose, { Schema, Types } from "mongoose";

export type WebAppAuthTokenPurpose =
  | "email_verify"
  | "password_reset"
  | "email_change";

export interface WebAppAuthToken {
  _id: Types.ObjectId;
  selector: string;
  validatorHash: string;
  userId: Types.ObjectId; // ref to User
  purpose: WebAppAuthTokenPurpose;
  meta?: Record<string, any>;
  createdAt: Date;
  expiresAt: Date; // TTL index deletes automatically after expiry
  usedAt?: Date | null; // null until consumed
  attempts: number;
  maxAttempts: number;
}

const WebAppAuthTokenSchema = new Schema<WebAppAuthToken>({
  selector: { type: String, required: true, unique: true, index: true },
  validatorHash: { type: String, required: true },
  userId: {
    type: Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true,
  },
  purpose: {
    type: String,
    required: true,
    enum: ["email_verify", "password_reset", "email_change"],
    index: true,
  },
  meta: { type: Schema.Types.Mixed },

  createdAt: { type: Date, default: () => new Date(), index: true },
  expiresAt: { type: Date },
  usedAt: { type: Date, default: null, index: true },

  attempts: { type: Number, required: true, default: 0 },
  maxAttempts: { type: Number, required: true, default: 5 },
});

// TTL cleanup by MongoDB (still enforce expiry in code)
WebAppAuthTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const WebAppAuthTokenModel = mongoose.model<WebAppAuthToken>(
  "WebAppAuthTokenModel",
  WebAppAuthTokenSchema
);
