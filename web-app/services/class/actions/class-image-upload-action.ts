"use server";

import { getAuthHeader } from "@/services/user/session-definitions";
import { classSvcUrl } from "@/utils/utils";

export async function uploadClassImage(file: File) {
  const auth = await getAuthHeader();
  if (!auth) return { ok: false, message: "Not authenticated" };

  const form = new FormData();
  form.append("image", file, file.name);

  try {
    const resp = await fetch(classSvcUrl("/upload"), {
      method: "POST",
      headers: { Authorization: auth },
      body: form,
      cache: "no-store",
    });
    const json = await resp
      .json()
      .catch(() => ({ ok: false, message: "Invalid server response" }));
    return json; // { ok, data: { url, filename, mimetype, size }, message? }
  } catch (e: any) {
    return { ok: false, message: e?.message || "Network error" };
  }
}
