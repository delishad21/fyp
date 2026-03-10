import crypto from "crypto";
import { createClient, RedisClientType } from "redis";
import { GameClassStateModel } from "../model/class/game-class-state-model";
import { finalizeHighScoreBadgesForClass } from "./badge-engine";

const redisUrl = String(
  process.env.GAME_REDIS_URL || process.env.ATTEMPT_REDIS_URL || ""
).trim();

const DUE_ZSET_KEY =
  process.env.GAME_BADGE_PERIOD_DUE_ZSET_KEY ||
  "game:badge:period-finalizer:due";
const LOCK_PREFIX =
  process.env.GAME_BADGE_PERIOD_LOCK_PREFIX ||
  "game:badge:period-finalizer:lock:";

function parsePositiveInt(raw: string | undefined, fallback: number) {
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return Math.floor(value);
}

function parseBoolean(raw: string | undefined, fallback: boolean) {
  if (typeof raw !== "string") return fallback;
  const value = raw.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(value)) return true;
  if (["0", "false", "no", "off"].includes(value)) return false;
  return fallback;
}

const SCHEDULER_ENABLED = parseBoolean(
  process.env.GAME_BADGE_PERIOD_SCHEDULER_ENABLED,
  true
);
const TICK_MS = parsePositiveInt(
  process.env.GAME_BADGE_PERIOD_SCHEDULER_TICK_MS,
  60_000
);
const CADENCE_SECONDS = parsePositiveInt(
  process.env.GAME_BADGE_PERIOD_SCHEDULER_CADENCE_SECONDS,
  3_600
);
const SEED_INTERVAL_MS = parsePositiveInt(
  process.env.GAME_BADGE_PERIOD_SCHEDULER_SEED_INTERVAL_MS,
  300_000
);
const BATCH_SIZE = parsePositiveInt(
  process.env.GAME_BADGE_PERIOD_SCHEDULER_BATCH_SIZE,
  50
);
const LOCK_TTL_SECONDS = parsePositiveInt(
  process.env.GAME_BADGE_PERIOD_SCHEDULER_LOCK_TTL_SECONDS,
  180
);

const WORKER_ID =
  process.env.HOSTNAME ||
  `${process.pid}-${crypto.randomBytes(4).toString("hex")}`;

let redisClient: RedisClientType | null = null;
let ticker: NodeJS.Timeout | null = null;
let runningTick = false;
let lastSeedAt = 0;

function nextDueEpochSeconds(nowSeconds: number) {
  return nowSeconds + CADENCE_SECONDS;
}

async function listCurrentClassIds() {
  const rows = await GameClassStateModel.find({})
    .select({ classId: 1 })
    .lean<Array<{ classId?: string }>>();

  return Array.from(
    new Set(
      rows
        .map((row) => String(row.classId || "").trim())
        .filter(Boolean)
    )
  );
}

async function seedQueue(force = false) {
  if (!redisClient) return;
  const nowMs = Date.now();
  if (!force && nowMs - lastSeedAt < SEED_INTERVAL_MS) return;

  const classIds = await listCurrentClassIds();
  if (!classIds.length) {
    lastSeedAt = nowMs;
    return;
  }

  const nowSeconds = Math.floor(nowMs / 1000);
  const seedDelay = Math.max(5, Math.min(60, CADENCE_SECONDS));
  const members = classIds.map((classId) => ({
    score: nowSeconds + seedDelay,
    value: classId,
  }));

  await redisClient.zAdd(DUE_ZSET_KEY, members, { NX: true });
  lastSeedAt = nowMs;
}

async function releaseLockIfOwned(lockKey: string) {
  if (!redisClient) return;
  try {
    const owner = await redisClient.get(lockKey);
    if (owner === WORKER_ID) {
      await redisClient.del(lockKey);
    }
  } catch (error) {
    console.warn("[game-svc worker] failed to release badge scheduler lock", {
      lockKey,
      error,
    });
  }
}

async function processDueClass(classId: string, nowSeconds: number) {
  if (!redisClient) return;
  const lockKey = `${LOCK_PREFIX}${classId}`;

  const lockAcquired = await redisClient.set(lockKey, WORKER_ID, {
    NX: true,
    EX: LOCK_TTL_SECONDS,
  });
  if (lockAcquired !== "OK") return;

  try {
    const exists = await GameClassStateModel.exists({ classId }).lean();
    if (!exists) {
      await redisClient.zRem(DUE_ZSET_KEY, classId);
      return;
    }

    await finalizeHighScoreBadgesForClass({ classId });
    await redisClient.zAdd(DUE_ZSET_KEY, [
      { score: nextDueEpochSeconds(nowSeconds), value: classId },
    ]);
  } catch (error) {
    console.error("[game-svc worker] badge period finalization failed", {
      classId,
      error,
    });
  } finally {
    await releaseLockIfOwned(lockKey);
  }
}

async function runTick() {
  if (!redisClient || runningTick) return;
  runningTick = true;

  try {
    await seedQueue();

    const nowSeconds = Math.floor(Date.now() / 1000);
    const dueClassIds = await redisClient.zRangeByScore(
      DUE_ZSET_KEY,
      0,
      nowSeconds,
      {
        LIMIT: { offset: 0, count: BATCH_SIZE },
      }
    );

    for (const classId of dueClassIds) {
      const normalized = String(classId || "").trim();
      if (!normalized) continue;
      await processDueClass(normalized, nowSeconds);
    }
  } finally {
    runningTick = false;
  }
}

export async function startBadgePeriodFinalizerScheduler() {
  if (!SCHEDULER_ENABLED) {
    console.log("[game-svc worker] badge period scheduler disabled");
    return;
  }

  if (!redisUrl) {
    throw new Error(
      "GAME_REDIS_URL (or ATTEMPT_REDIS_URL) is required for badge period scheduler"
    );
  }

  redisClient = createClient({ url: redisUrl });
  redisClient.on("error", (error) => {
    console.error("[game-svc worker] redis client error", error);
  });

  if (!redisClient.isOpen) {
    await redisClient.connect();
  }

  console.log("[game-svc worker] badge scheduler redis connected");

  await seedQueue(true);
  await runTick();

  ticker = setInterval(() => {
    void runTick();
  }, TICK_MS);
}

export async function stopBadgePeriodFinalizerScheduler() {
  if (ticker) {
    clearInterval(ticker);
    ticker = null;
  }

  if (redisClient?.isOpen) {
    await redisClient.quit();
  }
  redisClient = null;
}
