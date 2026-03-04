import { consumer } from "./kafka";
import { handleQuizAttemptEvent } from "./quiz-events-controller";

export async function runQuizEventsConsumer() {
  await consumer.run({
    eachMessage: async ({ message }) => {
      try {
        const payload = message.value
          ? JSON.parse(message.value.toString())
          : null;

        if (!payload || typeof payload.eventId !== "string") {
          return;
        }

        const result = await handleQuizAttemptEvent(payload);
        if (result.handled && result.applied) {
          console.log(
            `[game-quiz-consumer] applied event ${payload.eventId} (${payload.type})`
          );
        }
      } catch (err) {
        console.error("[game-quiz-consumer] error", err);
        throw err;
      }
    },
  });
}
