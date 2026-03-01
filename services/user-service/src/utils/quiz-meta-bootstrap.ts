function getQuizSvcBaseUrl() {
  const base = String(process.env.QUIZ_SVC_URL || "").replace(/\/+$/, "");
  if (!base) throw new Error("QUIZ_SVC_URL is not set");
  return base;
}

function getQuizSharedSecret() {
  const secret =
    process.env.QUIZ_WEBHOOK_SECRET || process.env.CLASS_SHARED_SECRET || "";
  if (!secret) {
    throw new Error("QUIZ_WEBHOOK_SECRET/CLASS_SHARED_SECRET is not set");
  }
  return secret;
}

async function postBootstrap(ownerId: string) {
  const base = getQuizSvcBaseUrl();
  const secret = getQuizSharedSecret();

  const res = await fetch(`${base}/quiz/meta/internal/bootstrap`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-quiz-secret": secret,
    },
    body: JSON.stringify({ ownerId }),
  });

  const json = await res.json().catch(() => ({} as any));
  if (!res.ok || !json?.ok) {
    throw new Error(json?.message || `Quiz meta bootstrap failed (${res.status})`);
  }

  return json as {
    ok: true;
    created: boolean;
    updated: boolean;
    addedSubjects?: string[];
    addedTopics?: string[];
  };
}

export async function ensureQuizMetaSeeded(ownerId: string) {
  const uid = String(ownerId || "").trim();
  if (!uid) return { ok: false as const, message: "Missing ownerId" };
  const result = await postBootstrap(uid);
  return result;
}
