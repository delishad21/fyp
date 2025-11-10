"use server";

import { getAuthHeader } from "@/services/user/session-definitions";
import { quizSvcUrl } from "@/utils/utils";
import { QuizType, CreateQuizState } from "../types/quizTypes";

async function createQuizJSON(
  payload: Record<string, any>,
  authHeader: string
) {
  const resp = await fetch(quizSvcUrl("/quiz"), {
    method: "POST",
    headers: {
      Authorization: authHeader,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    cache: "no-store",
  });
  const json = await resp
    .json()
    .catch(() => ({ ok: false, message: "Invalid server response" }));
  return { resp, json };
}

async function editQuizJSON(
  quizId: string,
  payload: Record<string, any>,
  authHeader: string
) {
  const resp = await fetch(quizSvcUrl(`/quiz/${encodeURIComponent(quizId)}`), {
    method: "PATCH",
    headers: {
      Authorization: authHeader,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    cache: "no-store",
  });
  const json = await resp
    .json()
    .catch(() => ({ ok: false, message: "Invalid server response" }));
  return { resp, json };
}

function parseText(formData: FormData, key: string, fallback = ""): string {
  return (formData.get(key) as string | null)?.trim() ?? fallback;
}

function parseOptional(formData: FormData, key: string): string | undefined {
  return (formData.get(key) as string | null)?.trim() || undefined;
}

function parseJsonField(formData: FormData, key: string): string | null {
  return formData.get(key) as string | null;
}

function parseNullableNumber(formData: FormData, key: string): number | null {
  const v = formData.get(key);
  if (v == null) return null;
  if (typeof v === "string" && v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** --------------- Payload Builders ------------------ */

function buildBasicPayload(formData: FormData) {
  const itemsJson = parseJsonField(formData, "itemsJson");
  const totalTimeLimit = parseNullableNumber(formData, "totalTimeLimit");
  return itemsJson ? { itemsJson, totalTimeLimit } : {};
}

function buildRapidPayload(formData: FormData) {
  return buildBasicPayload(formData);
}

function buildCrosswordPayload(formData: FormData) {
  const entriesJson = parseJsonField(formData, "entriesJson");
  const gridJson = parseJsonField(formData, "gridJson");
  const totalTimeLimit = parseNullableNumber(formData, "totalTimeLimit");

  const payload: Record<string, any> = {};
  if (entriesJson) payload.entriesJson = entriesJson;
  if (gridJson) payload.gridJson = gridJson;
  if (totalTimeLimit !== null) payload.totalTimeLimit = totalTimeLimit;

  return payload;
}

function buildPayload(formData: FormData, quizType: QuizType) {
  switch (quizType) {
    case "basic":
      return buildBasicPayload(formData);
    case "rapid":
      return buildRapidPayload(formData);
    case "crossword":
      return buildCrosswordPayload(formData);
    default:
      return {};
  }
}

/** ---------------------------------------------------- */

export async function processQuiz(
  _prev: CreateQuizState,
  formData: FormData
): Promise<CreateQuizState> {
  const name = parseText(formData, "name");
  const subject = parseText(formData, "subject");
  const topic = parseText(formData, "topic");
  const quizType = (formData.get("quizType") as QuizType) ?? "basic";

  const mode = (
    (formData.get("mode") as string | null) ?? "create"
  ).toLowerCase();
  const quizId = parseOptional(formData, "quizId");

  const baseState: CreateQuizState = {
    ok: false,
    fieldErrors: {},
    questionErrors: [],
    values: { name, subject, topic, quizType },
  };

  const authHeader = await getAuthHeader();
  if (!authHeader) return { ...baseState, message: "Not authenticated" };

  try {
    // Build payload
    const payload = {
      name,
      subject,
      topic,
      quizType,
      ...buildPayload(formData, quizType),
    };

    // Create or edit
    let resp: Response;
    let json: any;

    if (mode === "edit") {
      if (!quizId) {
        return { ...baseState, message: "Missing quizId for edit." };
      }
      ({ resp, json } = await editQuizJSON(quizId, payload, authHeader));
    } else {
      ({ resp, json } = await createQuizJSON(payload, authHeader));
    }

    // Handle errors
    if (!resp.ok || !json.ok) {
      return {
        ...baseState,
        fieldErrors: json.fieldErrors ?? {},
        questionErrors: json.questionErrors ?? [],
        message:
          json.message ??
          (resp.status === 401 || resp.status === 403
            ? "Authentication failed"
            : "Please fix the errors and try again."),
      };
    }

    // Success
    const successMessage =
      json.message || (mode === "edit" ? "Quiz updated!" : "Quiz created!");

    return {
      ...baseState,
      ok: true,
      message: successMessage,
      redirect: "/quizzes",
    };
  } catch (e: any) {
    console.error("[processQuiz] error:", e?.message || e);
    return { ...baseState, message: "Network error. Please try again." };
  }
}
