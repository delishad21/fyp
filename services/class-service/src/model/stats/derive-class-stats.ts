import { Types } from "mongoose";
import { ClassModel } from "../class/class-model";
import { IStatsBucket } from "./stats-bucket-model";
import { StudentClassStatsModel } from "./student-stats-model";
export interface DerivedClassStats {
  classId: Types.ObjectId;
  totals: {
    students: number;
    assigned: number;
    attempts: number; // sum of participationCount across students
    sumScore: number; // sum of canonical sumScore across students
    sumMax: number; // sum of canonical sumMax across students
    participants: string[]; // studentIds with participationCount > 0
  };
  bySubject: Map<string, IStatsBucket>;
  updatedAt: Date;
  version: number;
}

/**
 * Build a class-level stats snapshot by aggregating StudentClassStats + Class metadata.
 * - assigned: derived from Class.schedule.length
 * - students: derived from Class.students.length
 * - attempts / sumScore / sumMax / participants / bySubject: reduced from StudentClassStats
 */
export async function deriveClassStats(
  classId: string | Types.ObjectId
): Promise<DerivedClassStats> {
  const cls = await ClassModel.findById(classId)
    .select({ _id: 1, students: 1, schedule: 1 })
    .lean();
  if (!cls) throw new Error("Class not found");

  const assigned = Array.isArray(cls.schedule) ? cls.schedule.length : 0;
  const students = Array.isArray(cls.students) ? cls.students.length : 0;

  const rows = await StudentClassStatsModel.find({ classId: cls._id })
    .select({
      studentId: 1,
      participationCount: 1,
      sumScore: 1,
      sumMax: 1,
      bySubject: 1,
    })
    .lean();

  let attempts = 0;
  let sumScore = 0;
  let sumMax = 0;
  const participants: string[] = [];

  // reduce bySubject across students
  const bySubject = new Map<string, IStatsBucket>();

  for (const r of rows) {
    const pc = Number(r.participationCount || 0);
    const ss = Number(r.sumScore || 0);
    const sm = Number(r.sumMax || 0);

    attempts += pc;
    sumScore += ss;
    sumMax += sm;
    if (pc > 0) participants.push(String(r.studentId));

    // merge subject buckets
    if (r.bySubject && r.bySubject instanceof Map) {
      for (const [subj, bucket] of r.bySubject.entries()) {
        const prev = bySubject.get(subj) || {
          sumScore: 0,
          sumMax: 0,
          attempts: 0,
        };
        bySubject.set(subj, {
          sumScore: prev.sumScore + Number(bucket?.sumScore || 0),
          sumMax: prev.sumMax + Number(bucket?.sumMax || 0),
          attempts: prev.attempts + Number(bucket?.attempts || 0),
        });
      }
    } else if (r.bySubject && typeof r.bySubject === "object") {
      // If the driver serialized Map to a plain object
      for (const subj of Object.keys(r.bySubject as any)) {
        const bucket = (r.bySubject as any)[subj] || {};
        const prev = bySubject.get(subj) || {
          sumScore: 0,
          sumMax: 0,
          attempts: 0,
        };
        bySubject.set(subj, {
          sumScore: prev.sumScore + Number(bucket?.sumScore || 0),
          sumMax: prev.sumMax + Number(bucket?.sumMax || 0),
          attempts: prev.attempts + Number(bucket?.attempts || 0),
        });
      }
    }
  }

  return {
    classId: cls._id,
    totals: { students, assigned, attempts, sumScore, sumMax, participants },
    bySubject,
    // The old ClassStats had updatedAt/version; we synthesize them for compatibility
    updatedAt: new Date(),
    version: 0,
  };
}
