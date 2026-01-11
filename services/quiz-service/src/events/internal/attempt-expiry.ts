import { AttemptModel } from "../../model/quiz-attempt-model";
import { getQuizTypeDef } from "../../model/quiz-registry";
import { AttemptSpecEnvelope, Answer } from "../../model/quiz-shared";
import { redisClient } from "../utils/redis";
import { emitAttemptEvent } from "../outgoing/attempt-events";

export type ScheduleWindow = {
  start?: string | Date | null;
  end?: string | Date | null;
};

function getQuizDurationSecondsFromSpec(
  spec: AttemptSpecEnvelope | null | undefined
): number | null {
  if (!spec) return null;

  // Case 1: basic / crossword – global totalTimeLimit
  const ttl = spec.renderSpec.totalTimeLimit;
  if (ttl !== null && ttl !== undefined) {
    const n = Number(ttl);
    if (Number.isFinite(n) && n > 0) return n;
  }

  // Case 2: rapid – per-question timeLimit
  if (spec.quizType === "rapid") {
    const perItem = spec.renderSpec.items.map((it) =>
      Number((it as any).timeLimit || 0)
    );
    const sum = perItem.reduce(
      (acc, v) => acc + (Number.isFinite(v) ? v : 0),
      0
    );
    if (sum > 0) return sum;
  }

  // No intrinsic duration -> fall back to schedule window only
  return null;
}

export function computeAttemptTtlSeconds(opts: {
  startedAt?: Date | string | null;
  window?: ScheduleWindow | null;
  spec?: AttemptSpecEnvelope | null;
  hardMaxSeconds?: number; // absolute upper bound
  graceSeconds?: number; // small buffer after deadline
}): number {
  const {
    startedAt,
    window,
    spec,
    hardMaxSeconds = 4 * 60 * 60, // 4h safety cap
    graceSeconds = 10, // 10s buffer to prevent edge issues
  } = opts;

  const now = Date.now();
  const deadlines: number[] = [];

  // 1) Quiz-level time limit (basic/crossword global timer, or rapid sum)
  const quizDurationSec = getQuizDurationSecondsFromSpec(spec);
  if (quizDurationSec != null && quizDurationSec > 0) {
    const baseStart =
      startedAt instanceof Date
        ? startedAt.getTime()
        : startedAt
        ? new Date(startedAt).getTime()
        : now;
    deadlines.push(baseStart + quizDurationSec * 1000);
  }

  // 2) Schedule close time (if provided by class-service)
  if (window?.end) {
    const closeMs =
      window.end instanceof Date
        ? window.end.getTime()
        : new Date(window.end).getTime();
    if (Number.isFinite(closeMs)) {
      deadlines.push(closeMs);
    }
  }

  // 3) Fallback: hard max from now (e.g. 4h) so nothing lives forever
  if (deadlines.length === 0) {
    deadlines.push(now + hardMaxSeconds * 1000);
  }

  // Pick earliest deadline, add grace, convert to TTL seconds
  const earliest = Math.min(...deadlines);
  const deadlineWithGrace = earliest + graceSeconds * 1000;

  let ttlMs = deadlineWithGrace - now;
  if (!Number.isFinite(ttlMs) || ttlMs <= 0) {
    // Already past deadline: still schedule something small so worker runs soon
    ttlMs = graceSeconds * 1000;
  }

  const ttlSec = Math.ceil(ttlMs / 1000);

  // Do not exceed hard max
  return Math.min(ttlSec, hardMaxSeconds);
}

const ZKEY = "attempt:deadlines";

/**
 * Store an absolute expiry for an attempt in a Redis sorted set.
 */
export async function scheduleAttemptExpiry(attemptId: string, deadline: Date) {
  const score = Math.floor(deadline.getTime() / 1000); // seconds since epoch
  await redisClient.zAdd(ZKEY, [{ score, value: attemptId }]);
}

export async function scheduleAttemptExpiryFromSpec(args: {
  attemptId: string;
  startedAt: Date;
  spec: AttemptSpecEnvelope;
  window?: ScheduleWindow | null;
}) {
  const ttlSeconds = computeAttemptTtlSeconds({
    startedAt: args.startedAt,
    window: args.window ?? null,
    spec: args.spec,
  });

  const deadline = new Date(Date.now() + ttlSeconds * 1000);
  await scheduleAttemptExpiry(args.attemptId, deadline);
}

/** remove an attempt from the deadline ZSET. */
export async function clearAttemptExpiry(attemptId: string) {
  try {
    await redisClient.zRem(ZKEY, attemptId);
  } catch (e) {
    console.error("[attempt-expiry] Failed to clear deadline", attemptId, e);
  }
}

/**
 * Core grading + finalize logic used by the expiry worker.
 * effectively the same as finalizeAttempt under quiz-attempt-controller, but:
 *  - no req/res
 *  - no privilege / redaction
 */
async function gradeAndFinalizeAttemptById(attemptId: string): Promise<void> {
  // Load with state check to avoid wasted work
  const attempt = await AttemptModel.findById(attemptId).lean();
  if (!attempt) return;
  if (attempt.state !== "in_progress") return;

  const spec = attempt.quizVersionSnapshot as AttemptSpecEnvelope;
  const quizType =
    (spec as any).quizType || spec.quizType || (attempt as any).quizType;

  const def = getQuizTypeDef(quizType);
  if (!def) {
    console.warn(
      "[attempt-expiry] Unknown quizType for attempt",
      attemptId,
      quizType
    );
    return;
  }

  const answersArray: Answer[] = Object.entries(attempt.answers || {}).map(
    ([itemId, value]) => ({ itemId, value })
  );

  const auto = def.gradeAttempt(spec, answersArray);

  // Finalize in a single conditional update to avoid races with manual finalize
  const updated = await AttemptModel.findOneAndUpdate(
    { _id: attemptId, state: "in_progress" },
    {
      $set: {
        state: "finalized",
        finishedAt: new Date(),
        score: auto.total,
        maxScore: auto.max,
        breakdown: auto.itemScores.map((s) => ({
          itemId: s.itemId,
          awarded: s.final,
          max: s.max,
          meta: s.auto?.details,
        })),
      },
      $inc: { attemptVersion: 1 },
    },
    { new: true }
  ).lean();

  if (!updated) {
    // Someone else finalized first. Prevent double event emission by returning early
    return;
  }

  await emitAttemptEvent("AttemptFinalized", updated);
  console.log("[attempt-expiry] Auto-finalized timed attempt", attemptId);
}

/**
 * Simple polling worker that runs inside the quiz-service process.
 * horizontally scaling is still safe because finalization is idempotent.
 */
export function startAttemptExpiryWorker() {
  const tick = async () => {
    const nowSec = Math.floor(Date.now() / 1000);

    // Fetch due attempts
    const dueIds = await redisClient.zRangeByScore(ZKEY, 0, nowSec, {
      LIMIT: { offset: 0, count: 50 },
    });

    if (!dueIds.length) return;

    // Remove them optimistically first to avoid double-processing
    await redisClient.zRem(ZKEY, dueIds);

    for (const id of dueIds) {
      try {
        await gradeAndFinalizeAttemptById(id);
      } catch (e) {
        console.error("[attempt-expiry] Error finalizing", id, e);
      }
    }
  };

  setInterval(() => {
    tick().catch((e) => console.error("[attempt-expiry] Tick failed", e));
  }, 1000);
}
