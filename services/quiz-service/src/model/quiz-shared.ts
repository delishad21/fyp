import { Schema } from "mongoose";

export const ImageMetaSchema = new Schema(
  {
    filename: String,
    path: String,
    mimetype: String,
    size: Number,
    url: String,
    key: String,
  },
  { _id: false }
);

export const MCOptionSchema = new Schema(
  {
    id: { type: String, required: true },
    text: { type: String, default: "" },
    correct: { type: Boolean, default: false },
  },
  { _id: false }
);

export const OpenAnswerSchema = new Schema(
  {
    id: { type: String, required: true },
    text: { type: String, default: "" },
    caseSensitive: { type: Boolean, default: false },
  },
  { _id: false }
);

/** small helpers for coercion */
export const isString = (x: unknown): x is string => typeof x === "string";
export const toNumber = (x: unknown) => (typeof x === "number" ? x : Number(x));
