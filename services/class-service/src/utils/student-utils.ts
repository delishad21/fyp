import { CreatedStudent } from "./user-svc-client";

/** Build embedded student subdocument (identity/display only). */
export function toClassStudent(
  s: CreatedStudent,
  className: string,
  defaultPhotoUrl?: string
) {
  return {
    userId: s.userId,
    className,
    displayName: (s.name ?? "").trim() || s.username,
    photoUrl: defaultPhotoUrl ?? null,
  };
}
