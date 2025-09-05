import { getSession } from "../user/session-definitions";

/** Build the backend URL once. */
export function quizSvcUrl(path: string) {
  const base = (process.env.QUIZ_SVC_URL || "").replace(/\/+$/, "");
  return `${base}${path.startsWith("/") ? "" : "/"}${path}`;
}

/** Get Authorization header exactly like your existing callApi helper. */
export async function getAuthHeader() {
  const session = await getSession();
  const token = (session as any)?.accessToken as string | undefined;
  return token ? `Bearer ${token}` : undefined;
}
