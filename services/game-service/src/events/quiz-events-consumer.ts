import { consumer } from "./kafka";
import { handleCanonicalEvent } from "./canonical-events-controller";
import { handleClassLifecycleEvent } from "./class-lifecycle-controller";
import { handleQuizAttemptEvent } from "./quiz-events-controller";
import { Topics } from "./types";

export async function runQuizEventsConsumer() {
  await consumer.run({
    eachMessage: async ({ topic, message }) => {
      try {
        const payload = message.value
          ? JSON.parse(message.value.toString())
          : null;

        if (!payload || typeof payload.eventId !== "string") {
          return;
        }

        let result:
          | Awaited<ReturnType<typeof handleQuizAttemptEvent>>
          | Awaited<ReturnType<typeof handleClassLifecycleEvent>>
          | Awaited<ReturnType<typeof handleCanonicalEvent>>;

        if (topic === Topics.Attempt) {
          result = await handleQuizAttemptEvent(payload);
        } else if (topic === Topics.ClassLifecycle) {
          result = await handleClassLifecycleEvent(payload);
        } else if (topic === Topics.Canonical) {
          result = await handleCanonicalEvent(payload);
        } else {
          return;
        }

        if (result.handled && result.applied) {
          console.log(
            `[game-consumer] applied ${topic} event ${payload.eventId} (${payload.type})`
          );
        }
      } catch (err) {
        console.error("[game-consumer] error", err);
        throw err;
      }
    },
  });
}
