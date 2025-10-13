"use server";

import { Query, RowData } from "@/services/quiz/types/quiz-table-types";
import { getAuthHeader } from "@/services/user/session-definitions";
import { quizSvcUrl } from "@/utils/utils";
function toSearchParams(q: Query) {
  const sp = new URLSearchParams();
  if (q.name) sp.set("name", q.name);
  if (q.subjects?.length) sp.set("subjects", q.subjects.join(","));
  if (q.topics?.length) sp.set("topics", q.topics.join(","));
  if (q.types?.length) sp.set("types", q.types.join(","));
  if (q.createdStart) sp.set("createdStart", q.createdStart);
  if (q.createdEnd) sp.set("createdEnd", q.createdEnd);
  sp.set("page", String(q.page ?? 1));
  sp.set("pageSize", String(q.pageSize ?? 10));
  return sp;
}

export type QuizLite = {
  id: string;
  title: string;
  subject?: string;
  subjectColorHex?: string;
  topic?: string;
  type?: string;
  createdAt?: string | Date;
};

function toRowData(doc: any): RowData {
  const id = String(doc._id);

  const subjectColorHex =
    typeof doc.subjectColorHex === "string" ? doc.subjectColorHex : undefined;

  const payload: QuizLite = {
    id,
    title: doc.name ?? "",
    subject: doc.subject ?? "",
    subjectColorHex: subjectColorHex,
    topic: doc.topic ?? "",
    type: String(doc.quizType ?? ""),
    createdAt: doc.createdAt,
  };

  return {
    id,
    cells: [
      { variant: "normal", data: { text: doc.name ?? "" } }, // Name
      {
        variant: "label",
        data: {
          text: doc.subject ?? "",
          dotColor: subjectColorHex,
        },
      }, // Subject
      { variant: "normal", data: { text: doc.topic ?? "" } }, // Topic
      { variant: "date", data: { iso: doc.createdAt } }, // Created
      {
        variant: "tags",
        data: {
          tags: [
            {
              tag: String(doc.quizType ?? ""),
              color: doc.typeColorHex,
            },
          ],
        },
      },
    ],
    payload,
  };
}

export async function queryQuizzes(q: Query): Promise<{
  rows: RowData[];
  page: number;
  pageCount: number;
  total: number;
}> {
  const auth = await getAuthHeader();
  if (!auth) return { rows: [], page: 1, pageCount: 1, total: 0 };

  const sp = toSearchParams(q);
  const url = `${quizSvcUrl("/quiz")}?${sp.toString()}`;

  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { Authorization: auth },
      cache: "no-store",
    });

    if (!res.ok) return { rows: [], page: 1, pageCount: 1, total: 0 };

    const json = await res.json();
    const rows = Array.isArray(json?.rows) ? json.rows.map(toRowData) : [];

    return {
      rows,
      page: Number(json?.page ?? 1),
      pageCount: Number(json?.pageCount ?? 1),
      total: Number(json?.total ?? rows.length),
    };
  } catch (e: any) {
    console.error("[queryQuizzes] error:", e?.message || e);
    return { rows: [], page: 1, pageCount: 1, total: 0 };
  }
}
