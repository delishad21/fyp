import { FilterQuery } from "mongoose";
import { BaseQuizLean } from "../model/quiz-base-model";
import { contentHash } from "../model/quiz-shared";

/**
 * Compute a content hash using only the fields that define the quiz content
 * for each type (used to detect content changes vs metadata-only updates).
 */
export function computeContentHashForDoc(quizType: string, doc: any): string {
  switch (quizType) {
    case "basic":
      return contentHash({
        items: doc.items,
        totalTimeLimit: doc.totalTimeLimit,
      });
    case "rapid":
      return contentHash({ items: doc.items });
    case "crossword":
      return contentHash({
        entries: doc.entries,
        grid: doc.grid,
        totalTimeLimit: doc.totalTimeLimit,
      });
    default:
      return contentHash({});
  }
}

/**
 * Compare two MongoDB ids (ObjectId, string, or anything with a sensible `toString`)
 * by stringifying both sides.
 *
 * Designed for permissive equality checks across:
 *  - Mongoose ObjectId instances
 *  - Raw 24-char hex strings
 *  - Numbers/objects that stringify to the same value
 *
 * @param a - Left value (ObjectId | string | unknown)
 * @param b - Right value (ObjectId | string | unknown)
 * @returns {boolean} true if String(a) === String(b)
 *
 * @example
 * sameId(doc.owner, req.user?.id) // typical owner check
 *
 * @notes
 * - This is NOT a strict type/shape check; it intentionally defers to string equality.
 * - Null/undefined are safe: String(undefined) !== String(null) (i.e., "undefined" vs "null").
 */
export function sameId(a: unknown, b: unknown) {
  return String(a) === String(b);
}

/**
 * Convert an ISO-ish date string into a Date pinned to the **start of the day** (local time).
 *
 * @param d - A date string parseable by `new Date(...)`
 * @returns {Date|null} The same calendar day at 00:00:00.000 (local), or null if invalid
 *
 * @example
 * // If q.createdStart = "2025-03-01"
 * const start = toDateAtStart(q.createdStart); // 2025-03-01T00:00:00.000 (local)
 *
 * @timezone
 * - Uses the server’s local timezone. If you need consistent UTC boundaries, adapt this helper.
 */
export function toDateAtStart(d: string) {
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return null;
  dt.setHours(0, 0, 0, 0);
  return dt;
}

/**
 * Convert an ISO-ish date string into a Date pinned to the **end of the day** (local time).
 *
 * @param d - A date string parseable by `new Date(...)`
 * @returns {Date|null} The same calendar day at 23:59:59.999 (local), or null if invalid
 *
 * @example
 * const end = toDateAtEnd("2025-03-15"); // 2025-03-15T23:59:59.999 (local)
 */
export function toDateAtEnd(d: string) {
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return null;
  dt.setHours(23, 59, 59, 999);
  return dt;
}

/**
 * Clamp a number to an inclusive range.
 *
 * @param n - The number to clamp
 * @param min - Lower inclusive bound
 * @param max - Upper inclusive bound
 * @returns {number} `min` if n < min; `max` if n > max; otherwise `n`
 *
 * @example
 * clamp(150, 1, 100) // 100
 */
export function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(n, max));
}

/** Filters used when listing quizzes. */
export type ListFilters = {
  /** Case-insensitive contains match across `name` OR `topic`. */
  name?: string;
  /** Exact subject labels; matches `subject` via `$in`. */
  subjects?: string[];
  /** Exact topic labels; matches `topic` via `$in`. */
  topics?: string[];
  /** Quiz type discriminator values (e.g., "basic" | "rapid" | "crossword"). */
  types?: string[];
  /** Inclusive lower bound of `createdAt` (date string). */
  createdStart?: string;
  /** Inclusive upper bound of `createdAt` (date string). */
  createdEnd?: string;
  /** Optional page (1-based) for consumers; not used here. */
  page?: number;
  /** Optional pageSize for consumers; not used here. */
  pageSize?: number;
};

/**
 * Build a MongoDB filter suitable for querying the Quiz base collection.
 *
 * @param ownerId - If provided, constrain to quizzes owned by this user.
 * @param q - Optional filter set (name/subjects/topics/types/date range).
 * @returns {FilterQuery<BaseQuizLean>} A safe Mongo filter object.
 *
 * @matching
 * - `name`: if provided, fuzzy case-insensitive regex across **name OR topic**.
 * - `subjects`: exact string match via `$in` on `subject`.
 * - `topics`: exact string match via `$in` on `topic`.
 * - `types`: `$in` on discriminator field `quizType`.
 * - `createdStart`/`createdEnd`: inclusive range on `createdAt` using local day bounds.
 *
 * @security
 * - The regex uses the raw term. If you expect user-controlled input, consider escaping
 *   special characters to avoid unintended regex behavior (not a security vuln, but UX).
 *
 * @timezone
 * - Date bounds are computed in server local time (see `toDateAtStart/End`).
 */
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

// Redact gradingKey from a snapshot object
export function redactGradingKey<T extends Record<string, any>>(snap: T): T {
  if (!snap || typeof snap !== "object") return snap;
  const strip = (obj: any): any => {
    if (Array.isArray(obj)) return obj.map(strip);
    if (obj && typeof obj === "object") {
      const out: any = {};
      for (const [k, v] of Object.entries(obj)) {
        if (k === "gradingKey") continue; // drop whole key
        out[k] = strip(v);
      }
      return out;
    }
    return obj;
  };
  return strip(snap);
}
