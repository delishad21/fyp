import { OutboxLean, OutboxModel } from "../../model/outbox-model";
import { publish } from "../utils/kafka";
import { Topics } from "../types";

const INTERVAL = Number(process.env.OUTBOX_PUBLISH_INTERVAL_MS || 1000);
const BATCH = Number(process.env.OUTBOX_BATCH_SIZE || 50);
const STALE_LEASE_MS = Number(process.env.OUTBOX_STALE_LEASE_MS || 120_000);

function mapTopic(row: OutboxLean) {
  // Attempt stream
  if (row.type === "AttemptFinalized" || row.type === "AttemptInvalidated") {
    return process.env.TOPIC_QUIZ_ATTEMPT || Topics.Attempt;
  }
  // Schedule lifecycle stream
  if (row.type === "ScheduleUpdated") {
    return process.env.TOPIC_SCHEDULE_LIFECYCLE || Topics.ScheduleLifecycle;
  }
  // Quiz lifecycle stream
  return process.env.TOPIC_QUIZ_LIFECYCLE || Topics.QuizLifecycle;
}
function eventKey(row: OutboxLean) {
  // Preserve per-key ordering deterministically
  if (row.type.startsWith("Attempt")) return row.payload.attemptId;
  if (row.type.startsWith("Quiz")) return row.payload.quizId;
  return row._id; // fallback
}

function backoff(attempts: number) {
  const secs = Math.min(60, Math.pow(2, Math.min(attempts, 6)));
  return new Date(Date.now() + secs * 1000);
}

export function startOutboxPublisher() {
  setInterval(async () => {
    try {
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

      const now = new Date();
      const candidates = await OutboxModel.find({
        status: "pending",
        nextAttemptAt: { $lte: now },
      })
        .sort({ createdAt: 1 })
        .limit(BATCH)
        .lean<OutboxLean[]>();

      for (const c of candidates) {
        const leased = await OutboxModel.findOneAndUpdate(
          { _id: c._id, status: "pending" },
          { $set: { status: "publishing", updatedAt: new Date() } },
          { new: true }
        ).lean<OutboxLean | null>();
        if (!leased) continue;

        try {
          const topic = mapTopic(leased);
          const key = eventKey(leased);
          const payload = { ...leased.payload, schemaVersion: 1 };
          await publish(topic, key, payload);

          await OutboxModel.updateOne(
            { _id: leased._id },
            { $set: { status: "published", updatedAt: new Date() } }
          );
        } catch (err) {
          console.error("[outbox] publish error", {
            eventId: leased._id,
            type: leased.type,
            topic: mapTopic(leased),
            key: eventKey(leased),
            err,
          });
          const attempts = leased.attempts + 1;
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
      console.error("[outbox] tick error", e);
    }
  }, INTERVAL);
}
