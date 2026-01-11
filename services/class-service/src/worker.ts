import "dotenv/config";
import { connectToDB } from "./model/registry";
import { startKafkaConsumer, startKafkaProducer } from "./utils/events/kafka";
import { runQuizEventsConsumer } from "./utils/events/quiz-events-consumer";
import { startOutboxPublisher } from "./utils/events/outbox-publisher";

async function bootstrapWorker() {
  try {
    // 1) DB first – outbox + consumers use Mongoose models
    await connectToDB();
    console.log("[class-svc worker] MongoDB Connected!");

    // 2) Kafka producer connection
    await startKafkaProducer();
    console.log("[class-svc worker] Kafka producer connected");

    // 3) Kafka consumer connection + subscriptions
    await startKafkaConsumer();
    console.log("[class-svc worker] Kafka consumer connected & subscribed");

    // 4) Start outbox publisher loop (non-blocking)
    startOutboxPublisher();
    console.log("[class-svc worker] Outbox publisher started");

    // 5) Start the quiz-events consumer loop (non-blocking)
    runQuizEventsConsumer().catch((err) => {
      console.error("[class-svc worker] quiz-events consumer crashed", err);
      process.exit(1);
    });

    console.log("[class-svc worker] Worker up and running");
  } catch (err) {
    console.error("[class-svc worker] Fatal worker startup error", err);
    process.exit(1);
  }
}

bootstrapWorker();
