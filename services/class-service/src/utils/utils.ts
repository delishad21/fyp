import mongoose, { Types } from "mongoose";
import { ClassModel } from "../model/class/class-model";

/* ========= Common helpers ========= */

/** Normalize string/ObjectId into an ObjectId. */
export const toId = (x: string | Types.ObjectId) =>
  typeof x === "string" ? new Types.ObjectId(x) : x;

/** Defensive percentage: returns score/max or 0 if max <= 0. */
export function pct(score?: number, max?: number) {
  const s = Number(score || 0);
  const m = Number(max || 0);
  return m > 0 ? s / m : 0;
}

/** Convert possibly-Map to plain object. */
export function toPlainObject(m: any) {
  if (!m) return {};
  if (m instanceof Map) return Object.fromEntries(m);
  if (typeof m === "object") return m;
  return {};
}

/* ========= Timezone & date helpers ========= */

/**
 * Resolve the timezone string for a class.
 * Falls back to "Asia/Singapore" when not set.
 * Runs inside an optional session to be transaction-safe.
 *
 * @param classId - Class _id
 * @param session - Optional session
 * @returns IANA timezone string
 */
export async function getClassTimezone(
  classId: string | Types.ObjectId,
  session?: mongoose.ClientSession
): Promise<string> {
  const c = await ClassModel.findById(classId)
    .select({ timezone: 1 })
    .session(session || null)
    .lean();
  return c?.timezone || "Asia/Singapore";
}

/**
 * Format a Date into YYYY-MM-DD as perceived in a given timezone.
 * Used as a stable day key for streak computations.
 */
export function ymdInTZ(d: Date, timeZone: string) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(d);
}

/** Add days (UTC-based). Used for projecting streak windows. */
export function addDaysUTC(date: Date, n: number) {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + n);
  return d;
}
