import { createClient } from "redis";

const redisUrl = process.env.ATTEMPT_REDIS_URL!;

export const redisClient = createClient({ url: redisUrl });

redisClient.on("error", (err) => {
  console.error("[redis] Client error", err);
});

export async function initRedis() {
  if (!redisClient.isOpen) {
    await redisClient.connect();
    console.log("[redis] Connected to", redisUrl);
  }
}
