import { Types } from "mongoose";

export function toClassObjectId(classId: string) {
  if (!Types.ObjectId.isValid(classId)) {
    throw new Error(`Invalid classId for game projection: ${classId}`);
  }
  return new Types.ObjectId(classId);
}
