import "dotenv/config";

import { connectToDB, registerAllQuizzes } from "./model/quiz-registry";
import { startKafkaProducer, startKafkaConsumer } from "./events/utils/kafka";
import { runScheduleUpdatedConsumer } from "./events/incoming/schedule-events-consumer";
import { startOutboxPublisher } from "./events/outgoing/outbox-publisher";
import { initRedis } from "./events/utils/redis";
import { startAttemptExpiryWorker } from "./events/internal/attempt-expiry";

/**
 * Bootstrap the quiz-service worker process.
 * Responsibilities:
 * - Consume schedule lifecycle events from class-service
 * - Run attempt-expiry background job
 * - Publish outbox events
 */

async function bootstrapWorker() {
  try {
    await connectToDB();
    console.log("[quiz-svc worker] MongoDB connected");

    await initRedis();
    console.log("[quiz-svc worker] Redis connected");

    registerAllQuizzes();
    console.log("[quiz-svc worker] Quiz types registered");

    await startKafkaProducer();
    console.log("[quiz-svc worker] Kafka producer connected");

    await startKafkaConsumer();
    console.log("[quiz-svc worker] Kafka consumer connected");

    runScheduleUpdatedConsumer().catch((err) => {
      console.error("[quiz-svc worker] schedule-events consumer crashed", err);
      process.exit(1);
    });

    startOutboxPublisher();
    console.log("[quiz-svc worker] Outbox publisher started");

    startAttemptExpiryWorker();
    console.log("[quiz-svc worker] Attempt-expiry worker started");

    console.log("[quiz-svc worker] Worker up and running");
  } catch (err) {
    console.error("[quiz-svc worker] Fatal worker startup error", err);
    process.exit(1);
  }
}

bootstrapWorker();
