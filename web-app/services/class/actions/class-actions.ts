"use server";

import { getAuthHeader } from "@/services/user/session-definitions";
import { classSvcUrl } from "@/utils/utils";
import type { ClassFormState } from "../types/class-types";
import { normalizeFieldErrors } from "../helpers/class-helpers";

type IssuedCredential = {
  userId: string;
  name: string;
  username: string;
  email?: string;
  temporaryPassword?: string;
};

async function createClassJSON(
  payload: Record<string, any>,
  authHeader: string
) {
  const resp = await fetch(classSvcUrl("/classes"), {
    method: "POST",
    headers: { Authorization: authHeader, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    cache: "no-store",
  });
  const json = await resp
    .json()
    .catch(() => ({ ok: false, message: "Invalid server response" }));
  return { resp, json };
}

async function editClassJSON(
  classId: string,
  payload: Record<string, any>,
  authHeader: string
) {
  const resp = await fetch(
    classSvcUrl(`/classes/${encodeURIComponent(classId)}`),
    {
      method: "PUT",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
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

async function deleteClassJSON(classId: string, authHeader: string) {
  const resp = await fetch(
    classSvcUrl(`/classes/${encodeURIComponent(classId)}`),
    {
      method: "DELETE",
      headers: { Authorization: authHeader },
      cache: "no-store",
    }
  );
  const json = await resp
    .json()
    .catch(() => ({ ok: false, message: "Invalid server response" }));
  return { resp, json };
}

async function getClassJSON(classId: string, authHeader: string) {
  const resp = await fetch(
    classSvcUrl(`/classes/${encodeURIComponent(classId)}`),
    {
      method: "GET",
      headers: { Authorization: authHeader },
      cache: "no-store",
    }
  );
  const json = await resp
    .json()
    .catch(() => ({ ok: false, message: "Invalid server response" }));
  return { resp, json };
}

async function getClassesJSON(authHeader: string) {
  const resp = await fetch(classSvcUrl("/classes/my"), {
    method: "GET",
    headers: { Authorization: authHeader },
    cache: "no-store",
  });
  const json = await resp
    .json()
    .catch(() => ({ ok: false, message: "Invalid server response" }));
  return { resp, json };
}

/** ---------------- Form Parsers ------------------- */

function parseText(formData: FormData, key: string, fallback = ""): string {
  return (formData.get(key) as string | null)?.trim() ?? fallback;
}
function parseOptional(formData: FormData, key: string): string | undefined {
  return (formData.get(key) as string | null)?.trim() || undefined;
}
function parseJsonField(fd: FormData, key: string) {
  const raw = fd.get(key) as string | null;
  if (!raw) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

function buildClassPayload(formData: FormData) {
  const name = (formData.get("name") as string | null)?.trim() ?? "";
  const level = (formData.get("level") as string | null)?.trim() ?? "";
  const color = (formData.get("color") as string | null)?.trim() || undefined;

  const tzRaw = (formData.get("timezone") as string | null)?.trim();
  const timezone = tzRaw && tzRaw.length ? tzRaw : undefined;

  const students = parseJsonField(formData, "studentsJson");
  const image = parseJsonField(formData, "imageJson");
  const schedule = parseJsonField(formData, "scheduleJson");

  const payload: Record<string, any> = {
    name,
    level,
    metadata: {},
    includePasswords: true,
  };
  if (color) payload.metadata.color = color;
  if (timezone) payload.timezone = timezone;
  if (Array.isArray(students)) payload.students = students;
  if (image && typeof image === "object") payload.image = image;
  if (Array.isArray(schedule)) payload.schedule = schedule;

  return payload;
}

export async function processClass(
  _prev: ClassFormState,
  formData: FormData
): Promise<ClassFormState> {
  const mode = (
    (formData.get("mode") as string | null) ?? "create"
  ).toLowerCase();
  const classId = parseOptional(formData, "classId");

  const baseState: ClassFormState = {
    ok: false,
    fieldErrors: {},
    values: {
      name: parseText(formData, "name"),
      level: parseText(formData, "level"),
      color: parseOptional(formData, "color"),
    },
  };

  const authHeader = await getAuthHeader();
  if (!authHeader) return { ...baseState, message: "Not authenticated" };

  try {
    const payload = buildClassPayload(formData);

    let resp: Response;
    let json: any;

    if (mode === "edit") {
      if (!classId)
        return { ...baseState, message: "Missing classId for edit." };
      ({ resp, json } = await editClassJSON(classId, payload, authHeader));
    } else {
      ({ resp, json } = await createClassJSON(payload, authHeader));
    }

    if (!resp.ok || !json.ok) {
      console.log("[processClass] error response:", resp.status, json);
      return {
        ...baseState,
        fieldErrors: normalizeFieldErrors(json.fieldErrors),
        message:
          json.message ??
          (resp.status === 401 || resp.status === 403
            ? "Authentication failed"
            : "Please fix the errors and try again."),
      };
    }

    const issuedCredentials = Array.isArray(json.issuedCredentials)
      ? (json.issuedCredentials as IssuedCredential[])
      : [];

    const successMessage =
      json.message || (mode === "edit" ? "Class updated!" : "Class created!");

    // For EDIT, return a redirect path for the client to navigate
    const redirect =
      mode === "edit" && classId
        ? `/classes/${encodeURIComponent(classId)}`
        : undefined;

    return {
      ...baseState,
      ok: true,
      message: successMessage,
      issuedCredentials, // present on create responses that issued passwords
      redirect, // used by EditClassForm to navigate
    };
  } catch (e: any) {
    console.error("[processClass] error:", e?.message || e);
    return { ...baseState, message: "Network error. Please try again." };
  }
}

/** ---------------- Simple Actions ---------------- */

export async function deleteClass(classId: string): Promise<boolean> {
  const authHeader = await getAuthHeader();
  if (!authHeader) return false;

  const { resp, json } = await deleteClassJSON(classId, authHeader);
  return resp.ok && json.ok;
}

export async function getClass(classId: string) {
  const authHeader = await getAuthHeader();
  if (!authHeader) return null;

  const { resp, json } = await getClassJSON(classId, authHeader);
  return resp.ok && json.ok ? json.data : null;
}

export async function getClasses() {
  const authHeader = await getAuthHeader();
  if (!authHeader) return [];

  const { resp, json } = await getClassesJSON(authHeader);
  return resp.ok && json.ok ? json.data : [];
}
