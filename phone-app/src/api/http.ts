export type HttpError = Error & { status?: number; body?: any };

export async function fetchJSON<T>(
  url: string,
  opts: RequestInit = {}
): Promise<T> {
  const res = await fetch(url, {
    method: "GET",
    headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
    ...opts,
  });

  const text = await res.text();
  const body = text ? safeParse(text) : undefined;

  if (!res.ok) {
    const err: HttpError = new Error(
      (body && body.message) || `HTTP ${res.status}`
    );
    err.status = res.status;
    err.body = body;
    throw err;
  }
  return body as T;
}

function safeParse(s: string) {
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}
