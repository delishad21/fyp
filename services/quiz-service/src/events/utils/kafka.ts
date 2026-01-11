import { Kafka, logLevel } from "kafkajs";
import { Topics } from "../types";

const kafka = new Kafka({
  clientId: process.env.KAFKA_CLIENT_ID || "quiz-svc",
  brokers: (process.env.KAFKA_BROKERS || "localhost:9092").split(","),
  logLevel: logLevel.NOTHING,
});

export const producer = kafka.producer({ allowAutoTopicCreation: true });

export const consumer = kafka.consumer({
  groupId: process.env.KAFKA_GROUP || "quiz-svc.v1",
});

export async function startKafkaProducer() {
  await producer.connect();
}

export async function startKafkaConsumer() {
  await consumer.connect();

  await consumer.subscribe({
    topic: process.env.TOPIC_SCHEDULE_LIFECYCLE || Topics.ScheduleLifecycle,
    fromBeginning: false,
  });
}

export async function publish(topic: string, key: string, payload: any) {
  await producer.send({
    topic,
    messages: [
      {
        key,
        value: JSON.stringify(payload),
        headers: {
          "content-type": "application/json",
          "schema-version": Buffer.from(String(payload.schemaVersion ?? "1")),
          "event-type": Buffer.from(payload.type),
          "event-id": Buffer.from(payload.eventId),
        },
      },
    ],
  });
}
