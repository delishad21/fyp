import { fetchJSON } from "@/src/api/http";
import { useSession } from "@/src/auth/session";

export async function authedGET<T>(url: string) {
  const token = useSession.getState().token();
  return fetchJSON<T>(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}
export async function authedPOST<T>(url: string, body?: any) {
  const token = useSession.getState().token();
  return fetchJSON<T>(url, {
    method: "POST",
    body: body ? JSON.stringify(body) : undefined,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}
