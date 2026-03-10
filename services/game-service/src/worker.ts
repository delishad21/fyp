import "dotenv/config";
import { startKafkaConsumer } from "./events/kafka";
import { runQuizEventsConsumer } from "./events/quiz-events-consumer";
import { connectToDB } from "./model/registry";
import {
  startBadgePeriodFinalizerScheduler,
  stopBadgePeriodFinalizerScheduler,
} from "./rewards/badge-period-finalizer-scheduler";

async function bootstrapWorker() {
  try {
    await connectToDB();
    console.log("[game-svc worker] MongoDB Connected!");
    await startKafkaConsumer();
    console.log("[game-svc worker] Kafka consumer connected & subscribed");
    await startBadgePeriodFinalizerScheduler();
    console.log("[game-svc worker] Badge period scheduler started");

    runQuizEventsConsumer().catch((err) => {
      console.error("[game-svc worker] quiz-events consumer crashed", err);
      process.exit(1);
    });

    console.log("[game-svc worker] Worker up and running");
  } catch (err) {
    console.error("[game-svc worker] Fatal worker startup error", err);
    process.exit(1);
  }
}

bootstrapWorker();

async function shutdown(signal: string) {
  try {
    console.log(`[game-svc worker] received ${signal}; shutting down`);
    await stopBadgePeriodFinalizerScheduler();
  } finally {
    process.exit(0);
  }
}

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});

process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});
