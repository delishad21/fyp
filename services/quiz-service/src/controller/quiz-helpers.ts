import { FilterQuery } from "mongoose";
import { BaseQuizLean } from "../model/quiz-base-model";

export function sameId(a: unknown, b: unknown) {
  return String(a) === String(b);
}

export function toDateAtStart(d: string) {
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return null;
  dt.setHours(0, 0, 0, 0);
  return dt;
}

export function toDateAtEnd(d: string) {
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return null;
  dt.setHours(23, 59, 59, 999);
  return dt;
}

export function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(n, max));
}

export type ListFilters = {
  name?: string;
  subjects?: string[]; // subject values
  topics?: string[]; // topic values
  types?: string[]; // quizType values: ["basic","rapid","crossword"]
  createdStart?: string;
  createdEnd?: string;
  page?: number;
  pageSize?: number;
};

export function buildMongoFilter(ownerId?: string, q?: Partial<ListFilters>) {
  const query: FilterQuery<BaseQuizLean> = {};
  if (ownerId) {
    query.owner = ownerId as any;
  }

  if (q?.name && q.name.trim()) {
    const term = q.name.trim();
    query.$or = [
      { name: { $regex: term, $options: "i" } },
      { topic: { $regex: term, $options: "i" } },
    ];
  }

  const subjects = q?.subjects && q.subjects.length ? q.subjects : undefined;
  if (subjects) {
    query.subject = { $in: subjects };
  }

  const topics = q?.topics && q.topics.length ? q.topics : undefined;
  if (topics) {
    query.topic = { $in: topics };
  }

  const types = q?.types && q.types.length ? q.types : undefined;
  if (types) {
    // map "types" -> discriminator field "quizType"
    query.quizType = { $in: types };
  }

  const start = q?.createdStart ? toDateAtStart(q.createdStart) : null;
  const end = q?.createdEnd ? toDateAtEnd(q.createdEnd) : null;
  if (start || end) {
    query.createdAt = {};
    if (start) (query.createdAt as any).$gte = start;
    if (end) (query.createdAt as any).$lte = end;
  }

  return query;
}
