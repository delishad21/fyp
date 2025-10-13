import mongoose, { Schema, Document } from "mongoose";

export interface StudentDoc extends Document {
  name: string;
  username: string;
  email?: string; // stored, not used for verification
  password: string; // select: false so it never leaks
  teacherId: Schema.Types.ObjectId;
  mustChangePassword: boolean; // force change on first login / after reset
  isDisabled: boolean;
  lastPasswordResetAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const StudentSchema = new Schema<StudentDoc>(
  {
    name: { type: String, required: true, trim: true },
    username: { type: String, required: true, unique: true },
    email: { type: String }, // NOT unique, optional
    password: { type: String, required: true, select: false },
    teacherId: {
      type: Schema.Types.ObjectId,
      ref: "TeacherUserModel",
      required: true,
      index: true,
    },
    mustChangePassword: { type: Boolean, required: true, default: true },
    isDisabled: { type: Boolean, required: true, default: false },
    lastPasswordResetAt: { type: Date },
  },
  { timestamps: true }
);

export const StudentModel = mongoose.model<StudentDoc>(
  "StudentModel",
  StudentSchema
);

// Helper for safe API output
export function formatStudentResponse(s: StudentDoc) {
  return {
    id: s.id,
    name: s.name,
    username: s.username,
    email: s.email ?? null,
    teacherId: s.teacherId,
    mustChangePassword: s.mustChangePassword,
    isDisabled: s.isDisabled,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
  };
}
