import { Kafka, logLevel } from "kafkajs";
import { Topics } from "./types";

export const kafka = new Kafka({
  clientId: process.env.KAFKA_CLIENT_ID || "game-service",
  brokers: (process.env.KAFKA_BROKERS || "localhost:9092").split(","),
  logLevel: logLevel.NOTHING,
});

export const consumer = kafka.consumer({
  groupId: process.env.KAFKA_GROUP || "game-svc.v1",
});

export async function startKafkaConsumer() {
  await consumer.connect();
  await consumer.subscribe({
    topic: Topics.Attempt,
    fromBeginning: false,
  });
}
