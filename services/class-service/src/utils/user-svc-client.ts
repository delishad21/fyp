export type CreatedStudent = {
  userId: string;
  name: string; // used for displayName
  username: string;
  email?: string;
  temporaryPassword?: string; // present only when requested
};

type BulkCreateResponse = {
  ok: true;
  message?: string;
  data: CreatedStudent[];
};

/** Normalize any token to "Bearer ..." (or empty string if missing). */
function normalizeBearer(token?: string) {
  const t = (token ?? "").trim();
  if (!t) return "";
  return t.toLowerCase().startsWith("bearer ") ? t : `Bearer ${t}`;
}

/**
 * Bulk-create student user accounts in the User Service.
 * - POST /student/users/bulk-create
 * - Optional `?includePasswords=true` to get temporary passwords back.
 *
 * @returns CreatedStudent[] (id, name, username, email?, temporaryPassword?)
 * @throws Error with .status and possibly .errors.students on partial validation errors.
 */
export async function bulkCreateStudents(
  students: { name: string; username: string; email?: string }[],
  auth: string,
  opts: { includePasswords?: boolean } = {}
): Promise<CreatedStudent[]> {
  // 1) Short-circuit empty input (caller convenience)
  if (!Array.isArray(students) || students.length === 0) {
    return [];
  }

  // 2) Build URL (+ toggle includePasswords)
  const base = String(process.env.USER_SVC_URL || "").replace(/\/+$/, "");
  if (!base) throw new Error("USER_SVC_URL env var is required");
  const url =
    `${base}/student/users/bulk-create` +
    (opts.includePasswords ? `?includePasswords=true` : "");

  // 3) Normalize Authorization header
  const authHeader = normalizeBearer(auth);

  // 4) Fire request
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(authHeader ? { Authorization: authHeader } : {}),
    },
    body: JSON.stringify({ students }),
  });

  // 5) Decode response
  const isJson = (res.headers.get("content-type") || "").includes(
    "application/json"
  );
  const body = isJson ? await res.json() : await res.text();

  // 6) Non-2xx → bubble details (including field errors from user-svc)
  if (!res.ok) {
    const err: any = new Error(
      isJson && (body as any)?.message
        ? (body as any).message
        : `User Service error: ${res.status}`
    );
    err.status = res.status;
    if (isJson && (body as any)?.errors) err.errors = (body as any).errors; // { students: [...] }
    throw err;
  }

  // 7) Runtime shape guard
  if (!isJson || !(body as any)?.data || !Array.isArray((body as any).data)) {
    throw new Error("User Service returned unexpected payload shape");
  }

  // 8) Map to CreatedStudent[]
  const out = (body as BulkCreateResponse).data.map((s) => ({
    userId: String(s.userId),
    name: String(s.name ?? ""),
    username: String(s.username ?? ""),
    email: s.email ? String(s.email) : undefined,
    ...(s.temporaryPassword
      ? { temporaryPassword: String(s.temporaryPassword) }
      : {}),
  }));

  return out;
}

/**
 * Bulk-delete student users (service-to-service).
 * - POST /student/users/bulk-delete
 * - Returns counts and ID lists; if user-svc returns JSON, we pass it through.
 * - Throws on non-2xx with .status and .body (decoded when possible).
 */
export async function bulkDeleteStudents(
  studentIds: string[],
  authorization: string
): Promise<{
  ok: boolean;
  deletedCount: number;
  deletedIds: string[];
  notFoundOrForbiddenIds: string[];
}> {
  // 1) Build URL
  const base = process.env.USER_SVC_URL;
  if (!base) throw new Error("USER_SVC_URL env var is required");
  const url = `${base.replace(/\/+$/, "")}/student/users/bulk-delete`;

  // 2) Normalize Authorization header
  const authHeader = normalizeBearer(authorization);

  // 3) Execute
  const res = await fetch(url, {
    method: "POST",
    headers: {
      ...(authHeader ? { Authorization: authHeader } : {}),
      "Content-Type": "application/json",
      Accept: "application/json",
      "x-forwarded-auth": "class-service",
    },
    body: JSON.stringify({ studentIds }),
  });

  // 4) Try to decode JSON for better messages (even on success)
  const text = await res.text();
  let j: any;
  try {
    j = text ? JSON.parse(text) : null;
  } catch {
    j = null;
  }

  // 5) Error path
  if (!res.ok) {
    const err: any = new Error(j?.message || "Bulk delete students failed");
    err.status = res.status;
    err.body = j;
    throw err;
  }

  // 6) Success path (be tolerant if upstream doesn't return full detail)
  return {
    ok: true,
    deletedCount: Number(j?.data?.deletedCount ?? 0),
    deletedIds: Array.isArray(j?.data?.deletedIds) ? j.data.deletedIds : [],
    notFoundOrForbiddenIds: Array.isArray(j?.data?.notFoundOrForbiddenIds)
      ? j.data.notFoundOrForbiddenIds
      : [],
  };
}

/**
 * Delete a single student in User Service.
 * - DELETE /student/users/:id
 * - Treat 404 as success ("already deleted").
 * - Throws on other non-2xx with .status and a human message when available.
 */
export async function deleteStudentInUserSvc(
  studentUserId: string,
  auth: string
): Promise<void> {
  // 1) Build URL
  const base = String(process.env.USER_SVC_URL || "").replace(/\/+$/, "");
  if (!base) throw new Error("USER_SVC_URL not set");
  const url = `${base}/student/users/${encodeURIComponent(studentUserId)}`;

  // 2) Normalize Authorization header
  const authHeader = normalizeBearer(auth);

  // 3) Execute
  const res = await fetch(url, {
    method: "DELETE",
    headers: {
      ...(authHeader ? { Authorization: authHeader } : {}),
      Accept: "application/json",
    },
  });

  // 4) Decode for error messages
  const ct = res.headers.get("content-type") || "";
  const body = ct.includes("application/json")
    ? await res.json().catch(() => null)
    : await res.text().catch(() => "");

  // 5) Treat 404 as OK (idempotent deletion), else throw
  if (!res.ok && res.status !== 404) {
    const err: any = new Error(
      typeof body === "object" && (body as any)?.message
        ? (body as any).message
        : `User Service error: ${res.status}`
    );
    err.status = res.status;
    throw err;
  }
}
