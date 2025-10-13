import { Schema } from "mongoose";

/** Shared bucket (sumScore/sumMax/attempts) used by subject/topic maps */
export interface IStatsBucket {
  sumScore: number;
  sumMax: number;
  attempts: number;
}

export const StatsBucketSchema = new Schema<IStatsBucket>(
  {
    sumScore: { type: Number, default: 0 },
    sumMax: { type: Number, default: 0 },
    attempts: { type: Number, default: 0 },
  },
  { _id: false }
);
