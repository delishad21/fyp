"use server";

import { getAuthHeader, quizSvcUrl } from "../helpers";

type UploadResp =
  | {
      ok: true;
      data: {
        url: string;
        filename?: string;
        mimetype?: string;
        size?: number;
      };
    }
  | { ok: false; message: string };

export async function uploadQuizImage(file: File): Promise<UploadResp> {
  const authHeader = await getAuthHeader();
  if (!authHeader) return { ok: false, message: "Not authenticated" };

  const fd = new FormData();
  // field name doesn't matter here; we just pick the first file server-side
  fd.append("file", file);

  const resp = await fetch(quizSvcUrl("/quiz/upload"), {
    method: "POST",
    headers: { Authorization: authHeader },
    body: fd,
    cache: "no-store",
  });

  let json: UploadResp;
  try {
    json = (await resp.json()) as UploadResp;
  } catch {
    return { ok: false, message: "Invalid server response" };
  }

  if (!resp.ok || !json.ok) {
    return {
      ok: false,
      message: ("message" in json && json.message) || "Upload failed",
    };
  }
  return json;
}
