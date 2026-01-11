import { validateStudentsBlock } from "../students/student-validation";

export interface ValidationResult {
  fieldErrors: {
    name?: string;
    level?: string;
    image?: string;
    color?: string;
    timezone?: string; // ← NEW: surface TZ errors to the form
    students?: (
      | undefined
      | { name?: string; username?: string; email?: string }
    )[];
    schedule?: (string[] | undefined)[];
  };
  isValid: boolean;
}

/** Basic IANA timezone guard using Intl — throws on invalid IDs */
function isValidIanaTimeZone(tz: unknown): tz is string {
  if (typeof tz !== "string" || !tz.trim()) return false;
  try {
    // Will throw RangeError for invalid IANA names
    new Intl.DateTimeFormat("en-US", { timeZone: tz }).format();
    return true;
  } catch {
    return false;
  }
}

export function validateClassInput(body: any): ValidationResult {
  const fieldErrors: ValidationResult["fieldErrors"] = {};

  // name
  if (
    !body?.name ||
    typeof body.name !== "string" ||
    body.name.trim().length < 1
  ) {
    fieldErrors.name = "Class name cannot be empty";
  }

  // level
  if (!body?.level || typeof body.level !== "string") {
    fieldErrors.level = "Level is required and must be a string";
  }

  // timezone (required, valid IANA)
  if (
    body?.timezone == null ||
    typeof body.timezone !== "string" ||
    !body.timezone.trim()
  ) {
    fieldErrors.timezone = "Please select a timezone";
  } else if (!isValidIanaTimeZone(body.timezone)) {
    fieldErrors.timezone = "Invalid timezone";
  }

  // image
  if (body?.image && typeof body.image !== "object") {
    fieldErrors.image = "Invalid image format";
  }

  // metadata.color (hex)
  if (body?.metadata?.color) {
    const isHex = /^#([0-9A-F]{3}){1,2}$/i.test(body.metadata.color);
    if (!isHex)
      fieldErrors.color = "Color must be a valid hex string (e.g. #3D5CFF)";
  }

  // students → delegate to shared block validator (errors align by index)
  if (Array.isArray(body?.students)) {
    const { errors } = validateStudentsBlock(body.students);
    if (errors.some(Boolean)) {
      fieldErrors.students = errors;
    }
  }
  const hasAnyErrors = (v: any): boolean =>
    Array.isArray(v)
      ? v.some(hasAnyErrors)
      : v && typeof v === "object"
      ? Object.values(v).some(hasAnyErrors)
      : Boolean(v);

  const isValid = !hasAnyErrors(fieldErrors);
  return { fieldErrors, isValid };
}
