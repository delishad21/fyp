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
