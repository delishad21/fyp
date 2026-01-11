import { consumer } from "../utils/kafka";
import { ScheduleUpdatedEvent } from "../types";
import { handleScheduleUpdated } from "./schedule-events-controller";

export async function runScheduleUpdatedConsumer() {
  await consumer.run({
    eachMessage: async ({ topic, partition, message }) => {
      if (!message.value) return;

      let payload: unknown;
      try {
        payload = JSON.parse(message.value.toString());
      } catch (e) {
        console.error("[schedule-consumer] invalid JSON", e);
        return;
      }

      const evt = payload as ScheduleUpdatedEvent;
      if (evt.type !== "ScheduleUpdated") {
        // Defensive: ignore other events on same topic
        return;
      }

      try {
        await handleScheduleUpdated(evt);
      } catch (err) {
        console.error("[schedule-consumer] handleScheduleUpdated error", err);
        // Let kafkajs retry by rethrowing
        throw err;
      }
    },
  });
}
