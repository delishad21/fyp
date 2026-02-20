import { NextRequest, NextResponse } from "next/server";
import { getAuthHeader } from "@/services/user/session-definitions";
import { classSvcUrl, quizSvcUrl } from "@/utils/utils";

export const dynamic = "force-dynamic";

type LabelsMap = Record<string, string>;

function normalizePathname(raw: string | null) {
  const input = String(raw ?? "").trim();
  if (!input) return "/";
  const prefixed = input.startsWith("/") ? input : `/${input}`;
  if (prefixed.length > 1 && prefixed.endsWith("/")) {
    return prefixed.slice(0, -1);
  }
  return prefixed;
}

async function fetchJson(
  url: string,
  authHeader: string | undefined
): Promise<unknown | null> {
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        ...(authHeader ? { Authorization: authHeader } : {}),
      },
      cache: "no-store",
    });

    if (!res.ok) return null;

    const ct = res.headers.get("content-type") || "";
    if (!ct.includes("application/json")) return null;

    return await res.json();
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const pathname = normalizePathname(req.nextUrl.searchParams.get("pathname"));
  const segments = pathname.split("/").filter(Boolean);
  const labels: LabelsMap = {};

  const authHeader = await getAuthHeader();
  if (!authHeader) {
    return NextResponse.json({ ok: true, labels });
  }

  const tasks: Promise<void>[] = [];

  if (segments[0] === "classes" && segments[1] && segments[1] !== "create") {
    const classId = segments[1];
    const classPath = `/classes/${classId}`;

    tasks.push(
      (async () => {
        const json = (await fetchJson(
          classSvcUrl(`/classes/${encodeURIComponent(classId)}`),
          authHeader
        )) as { data?: { name?: string } } | null;
        const name = json?.data?.name;
        if (typeof name === "string" && name.trim().length > 0) {
          labels[classPath] = name.trim();
        }
      })()
    );

    if (segments[2] === "students" && segments[3] && segments[3] !== "add") {
      const studentId = segments[3];
      const studentPath = `${classPath}/students/${studentId}`;

      tasks.push(
        (async () => {
          const json = (await fetchJson(
            classSvcUrl(
              `/classes/${encodeURIComponent(
                classId
              )}/students/${encodeURIComponent(studentId)}`
            ),
            authHeader
          )) as { data?: { displayName?: string } } | null;
          const displayName = json?.data?.displayName;
          if (
            typeof displayName === "string" &&
            displayName.trim().length > 0
          ) {
            labels[studentPath] = displayName.trim();
          }
        })()
      );

      if (segments[4] === "attempt" && segments[5]) {
        const attemptId = segments[5];
        const attemptPath = `${studentPath}/attempt/${attemptId}`;

        tasks.push(
          (async () => {
            const json = (await fetchJson(
              quizSvcUrl(`/attempt/${encodeURIComponent(attemptId)}`),
              authHeader
            )) as { data?: { quiz?: { name?: string | null } } } | null;
            const quizName = json?.data?.quiz?.name;
            if (typeof quizName === "string" && quizName.trim().length > 0) {
              labels[attemptPath] = quizName.trim();
            }
          })()
        );
      }
    }

    if (segments[2] === "results" && segments[3]) {
      const scheduleId = segments[3];
      const schedulePath = `${classPath}/results/${scheduleId}`;

      tasks.push(
        (async () => {
          const json = (await fetchJson(
            classSvcUrl(
              `/classes/${encodeURIComponent(
                classId
              )}/schedule/item/${encodeURIComponent(scheduleId)}`
            ),
            authHeader
          )) as { data?: { quizName?: string } } | null;
          const quizName = json?.data?.quizName;
          if (typeof quizName === "string" && quizName.trim().length > 0) {
            labels[schedulePath] = quizName.trim();
          }
        })()
      );
    }
  }

  if (
    segments[0] === "quizzes" &&
    (segments[1] === "view" || segments[1] === "edit") &&
    segments[2]
  ) {
    const quizId = segments[2];
    const quizPath = `/quizzes/${segments[1]}/${quizId}`;

    tasks.push(
      (async () => {
        const json = (await fetchJson(
          quizSvcUrl(`/quiz/${encodeURIComponent(quizId)}`),
          authHeader
        )) as { data?: { name?: string } } | null;
        const quizName = json?.data?.name;
        if (typeof quizName === "string" && quizName.trim().length > 0) {
          labels[quizPath] = quizName.trim();
        }
      })()
    );
  }

  await Promise.all(tasks);

  return NextResponse.json({ ok: true, labels });
}
