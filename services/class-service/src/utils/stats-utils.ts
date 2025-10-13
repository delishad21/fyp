import { addDaysUTC } from "./utils";

/** Compute participation and average score percentages. */
export function computeParticipationAndAvgScore({
  participations,
  eligibleAssigned,
  sumScore,
  sumMax,
}: {
  participations: number;
  eligibleAssigned: number;
  sumScore: number;
  sumMax: number;
}) {
  const participationPct =
    eligibleAssigned > 0
      ? Math.round(
          (Math.min(participations, eligibleAssigned) / eligibleAssigned) * 100
        )
      : 0;
  const avgScorePct = sumMax > 0 ? Math.round((sumScore / sumMax) * 100) : 0;
  return { participationPct, avgScorePct };
}

/** Compute projected streak (only valid if lastStreakDate is today/yesterday in class TZ). */
export function projectedStreak(
  lastStreakDate: Date | null | undefined,
  tz: string
) {
  if (!lastStreakDate) return 0;
  const ymd = (d: Date) =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d);
  const today = ymd(new Date());
  const yesterday = ymd(addDaysUTC(new Date(), -1));
  const last = ymd(new Date(lastStreakDate));
  return last === today || last === yesterday ? 1 : 0;
}

/** Compute standard competition ranks (“1224”) from scores. */
export function computeRanks(rows: { overallScore: number }[]) {
  const scores = rows.map((r) => r.overallScore || 0).sort((a, b) => b - a);
  const firstIndexRank = new Map<number, number>();
  for (let i = 0; i < scores.length; i++) {
    const sc = scores[i];
    if (!firstIndexRank.has(sc)) firstIndexRank.set(sc, i + 1);
  }
  return (score: number) =>
    firstIndexRank.get(score) || (scores.length ? scores.length : 1);
}

/** Compute average % for subject/topic buckets. */
export function computeBucketAvgPct(bucketObj: Record<string, any>) {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(bucketObj || {})) {
    const ss = Number((v as any).sumScore || 0);
    const sm = Number((v as any).sumMax || 0);
    out[k] = sm > 0 ? Math.round((ss / sm) * 100) : 0;
  }
  return out;
}
