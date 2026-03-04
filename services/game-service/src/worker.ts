import "dotenv/config";
import { startKafkaConsumer } from "./events/kafka";
import { runQuizEventsConsumer } from "./events/quiz-events-consumer";
import { connectToDB } from "./model/registry";

async function bootstrapWorker() {
  try {
    await connectToDB();
    console.log("[game-svc worker] MongoDB Connected!");
    await startKafkaConsumer();
    console.log("[game-svc worker] Kafka consumer connected & subscribed");

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
