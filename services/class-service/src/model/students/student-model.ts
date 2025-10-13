import { Schema, Document } from "mongoose";

export interface IStudent extends Document {
  userId: string;
  className: string;
  displayName: string;
  photoUrl?: string;
  // virtual:
  // statsDoc?: IStudentClassStats; // (for TS, define an interface if you want)
}

export const StudentSchema = new Schema<IStudent>(
  {
    userId: { type: String, required: true },
    className: { type: String, required: true },
    displayName: { type: String, required: true },
    photoUrl: { type: String, default: null },
  },
  {
    _id: false,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Virtual: link each embedded student -> their StudentClassStats row
StudentSchema.virtual("statsDoc", {
  ref: "StudentClassStats",
  localField: "userId", // this doc’s field
  foreignField: "studentId", // field in StudentClassStats
  justOne: true,
});
