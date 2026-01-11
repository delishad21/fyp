import { consumer } from "./kafka";
import { handleQuizEvent } from "./quiz-events-controller";

export async function runQuizEventsConsumer() {
  await consumer.run({
    eachMessage: async ({ topic, partition, message }) => {
      try {
        const payload = message.value
          ? JSON.parse(message.value.toString())
          : null;
        if (!payload || typeof payload.eventId !== "string") return;

        // Use the same controller logic as the webhook path (DRY & consistent)
        // We fake an Express-like req/res pair:
        const req = { body: payload } as any;
        const res = {
          status: (code: number) => ({
            json: (obj: any) => obj, // no-op
          }),
        } as any;

        await handleQuizEvent(req, res);
      } catch (e) {
        console.error("[quiz-consumer] error", e);
        // Throw to let kafkajs retry (with your group rebalancing/backoff policy)
        throw e;
      }
    },
  });
}
