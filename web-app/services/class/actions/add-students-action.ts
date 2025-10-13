"use server";

import { getAuthHeader } from "@/services/user/session-definitions";
import { classSvcUrl } from "@/utils/utils";
import type { IssuedCredential } from "../types/class-types";

/** ---------- Types ---------- */
export type StudentItemError =
  | { _error?: string; name?: string; username?: string; email?: string }
  | undefined;

export type AddStudentsState = {
  ok: boolean;
  fieldErrors: {
    students: StudentItemError[];
  };
  message?: string;
  redirect?: string;
  issuedCredentials?: IssuedCredential[];
};

/** ---------- Helpers ---------- */

function parseJsonField(fd: FormData, key: string) {
  const raw = fd.get(key) as string | null;
  if (!raw) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

// pick the first string if it's an array; pass through if it's a string; else undefined
function firstMsg(v: unknown): string | undefined {
  if (typeof v === "string") return v;
  if (Array.isArray(v) && v.length > 0 && typeof v[0] === "string")
    return v[0] as string;
  return undefined;
}

// Normalize one student error object into { name?: string; username?: string; email?: string; _error?: string }
function normalizeOneStudentError(e: any): StudentItemError {
  if (!e || typeof e !== "object") return undefined;
  return {
    _error: firstMsg((e as any)._error),
    name: firstMsg((e as any).name),
    username: firstMsg((e as any).username),
    email: firstMsg((e as any).email),
  };
}

// Normalize the students array and align its length to submittedLen
function normalizeStudentsErrors(
  source: unknown,
  submittedLen: number
): StudentItemError[] {
  const input = Array.isArray(source) ? source : [];
  const out = input.map(normalizeOneStudentError);
  while (out.length < submittedLen) out.push(undefined);
  return out.slice(0, submittedLen);
}

/** ---------- API Call ---------- */

async function postAddStudents(
  classId: string,
  payload: {
    students: Array<{ name: string; username?: string; email?: string }>;
  },
  authHeader: string
) {
  // includePasswords=TRUE is optional here; your class-svc already requests passwords
  // from user-svc internally. Keeping it for forward-compat / feature flagging.
  const resp = await fetch(
    classSvcUrl(
      `/classes/${encodeURIComponent(classId)}/students?includePasswords=true`
    ),
    {
      method: "POST",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
      cache: "no-store",
    }
  );

  const json = await resp
    .json()
    .catch(() => ({ ok: false, message: "Invalid server response" }));

  return { resp, json };
}

/** ---------- Main server action ---------- */

export async function addStudentsToClassAction(
  _prev: AddStudentsState,
  formData: FormData
): Promise<AddStudentsState> {
  const authHeader = await getAuthHeader();
  if (!authHeader) {
    return {
      ok: false,
      fieldErrors: { students: [] },
      message: "Not authenticated",
    };
  }

  const classId = String(formData.get("classId") || "").trim();
  if (!classId) {
    return {
      ok: false,
      fieldErrors: { students: [] },
      message: "Missing classId",
    };
  }

  const students = parseJsonField(formData, "studentsJson");
  const submittedLen = Array.isArray(students) ? students.length : 0;

  if (!Array.isArray(students) || students.length === 0) {
    return {
      ok: false,
      fieldErrors: { students: [] },
      message: "Please add at least one student.",
    };
  }

  try {
    const { resp, json } = await postAddStudents(
      classId,
      { students },
      authHeader
    );

    if (!resp.ok || !json?.ok) {
      // Class svc may return either { fieldErrors: { students: [...] } } or { errors: { students: [...] } }
      const rawStudentsErr =
        json?.fieldErrors?.students ?? json?.errors?.students ?? [];
      const perItem = normalizeStudentsErrors(rawStudentsErr, submittedLen);

      return {
        ok: false,
        fieldErrors: { students: perItem },
        message:
          json?.message ??
          (resp.status === 401 || resp.status === 403
            ? "Authentication failed"
            : "Please fix the errors and try again."),
      };
    }

    // SUCCESS: surface credentials if present; if none, redirect back to roster
    const issuedCreds: IssuedCredential[] = Array.isArray(
      json?.issuedCredentials
    )
      ? (json.issuedCredentials as IssuedCredential[])
      : [];

    if (issuedCreds.length > 0) {
      return {
        ok: true,
        fieldErrors: { students: [] },
        message: json?.message || "Students added!",
        issuedCredentials: issuedCreds,
      };
    }

    // No credentials returned: go back to the students list
    return {
      ok: true,
      fieldErrors: { students: [] },
      message: json?.message || "Students added!",
      redirect: `/classes/${encodeURIComponent(classId)}/students`,
    };
  } catch (e: any) {
    console.error("[addStudentsToClassAction] error:", e?.message || e);
    return {
      ok: false,
      fieldErrors: { students: [] },
      message: "Network error. Please try again.",
    };
  }
}
