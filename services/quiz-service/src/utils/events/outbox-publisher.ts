import { OutboxLean, OutboxModel } from "../../model/outbox-model";
import { postToClassWebhook } from "../class-svc-client";

/**
 * @worker startOutboxPublisher
 * @purpose Poll the outbox on an interval; lease + publish events to Class svc.
 * @config  - OUTBOX_PUBLISH_INTERVAL_MS (default 1000ms)
 *          - OUTBOX_BATCH_SIZE         (default 50)
 *          - OUTBOX_STALE_LEASE_MS     (default 120000ms) // recover stuck "publishing"
 * @leasing Atomic findOneAndUpdate(status:"pending"→"publishing") to avoid double-send.
 * @retries Exponential backoff; 4xx (except 429) -> "dead", 5xx/network -> retry.
 * @notes   Includes a recovery step for crashed workers that left items in "publishing".
 */

const INTERVAL = Number(process.env.OUTBOX_PUBLISH_INTERVAL_MS || 1000);
const BATCH = Number(process.env.OUTBOX_BATCH_SIZE || 50);
const STALE_LEASE_MS = Number(process.env.OUTBOX_STALE_LEASE_MS || 120_000);

function backoff(attempts: number) {
  // STEP (util): exponential backoff with cap (max 60s)
  const secs = Math.min(60, Math.pow(2, Math.min(attempts, 6)));
  return new Date(Date.now() + secs * 1000);
}

export function startOutboxPublisher() {
  setInterval(async () => {
    try {
      const now = new Date();

      // STEP 0: recovery — return stale "publishing" records to "pending"
      const staleCutoff = new Date(Date.now() - STALE_LEASE_MS);
      await OutboxModel.updateMany(
        { status: "publishing", updatedAt: { $lt: staleCutoff } },
        {
          $set: {
            status: "pending",
            nextAttemptAt: new Date(),
            updatedAt: new Date(),
          },
        }
      );

      // STEP 1: fetch candidates (pending + ready by nextAttemptAt)
      const candidates = await OutboxModel.find({
        status: "pending",
        nextAttemptAt: { $lte: now },
      })
        .sort({ createdAt: 1 })
        .limit(BATCH)
        .lean<{ _id: string }[]>();

      // STEP 2: lease + publish each
      for (const c of candidates) {
        // 2a) lease atomically
        const leased = await OutboxModel.findOneAndUpdate(
          { _id: c._id, status: "pending" },
          { $set: { status: "publishing", updatedAt: new Date() } },
          { new: true }
        ).lean<OutboxLean | null>();
        if (!leased) continue;

        try {
          // 2b) attempt publish
          const res = await postToClassWebhook(leased.payload);

          if (res.ok) {
            // 2c) success -> mark published
            await OutboxModel.updateOne(
              { _id: leased._id },
              { $set: { status: "published", updatedAt: new Date() } }
            );
          } else {
            // 2d) failure -> decide permanent vs retryable
            const permanent =
              res.status >= 400 && res.status < 500 && res.status !== 429;
            const attempts = (leased as any).attempts + 1;

            await OutboxModel.updateOne(
              { _id: leased._id },
              {
                $set: {
                  status: permanent ? "dead" : "pending",
                  attempts,
                  nextAttemptAt: permanent
                    ? new Date(Date.now() + 24 * 3600_000) // quarantine dead
                    : backoff(attempts),
                  updatedAt: new Date(),
                },
              }
            );
          }
        } catch {
          // 2e) network/abort -> retry with backoff
          const attempts = (leased as any).attempts + 1;
          await OutboxModel.updateOne(
            { _id: leased._id },
            {
              $set: {
                status: "pending",
                attempts,
                nextAttemptAt: backoff(attempts),
                updatedAt: new Date(),
              },
            }
          );
        }
      }
    } catch (e) {
      // STEP 3: non-fatal — log and continue ticking
      console.error("[outbox] tick error", e);
    }
  }, INTERVAL);
}
