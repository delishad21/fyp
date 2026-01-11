export type StudentRow = { name: string; username: string; email?: string };
export type StudentRowError =
  | { _error?: string; name?: string; username?: string; email?: string }
  | undefined;

/** Light email check */
function isValidEmail(email: string): boolean {
  if (!email) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(email);
}
export function validateStudentsBlock(raw: any): {
  normalized: StudentRow[];
  errors: StudentRowError[];
  isValid: boolean;
} {
  const arr = Array.isArray(raw) ? raw : [];

  const normalized: StudentRow[] = arr.map((s: any) => ({
    name: String(s?.name ?? "").trim(),
    username: String(s?.username ?? "").trim(),
    email: s?.email ? String(s.email).trim().toLowerCase() : undefined,
  }));

  const errors: StudentRowError[] = new Array(normalized.length).fill(
    undefined
  );

  // Per-row validation (extracted from class-input logic)
  normalized.forEach((s, idx) => {
    const e: Record<string, string> = {};
    if (!s.name) e.name = "Name is required";
    if (!s.username) e.username = "Username is required";
    if (s.email && !isValidEmail(s.email)) e.email = "Invalid email";

    if (e.name || e.username || e.email) {
      errors[idx] = { ...e, _error: "Invalid student data" };
    }
  });

  // Duplicate usernames inside the payload (later occurrences error)
  const seen = new Set<string>();
  normalized.forEach((s, idx) => {
    if (!s.username) return;
    const key = s.username.toLowerCase();
    if (seen.has(key)) {
      const cur = (errors[idx] ?? {}) as Exclude<StudentRowError, undefined>;
      cur.username ??= "Duplicate username in input";
      cur._error ??= "Duplicate username in input";
      errors[idx] = cur;
    } else {
      seen.add(key);
    }
  });

  return { normalized, errors, isValid: !errors.some(Boolean) };
}
