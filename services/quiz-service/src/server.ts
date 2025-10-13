import http from "http";
import index from "./index";
import "dotenv/config";
import { connectToDB, registerAllQuizzes } from "./model/quiz-registry";
import "dotenv/config";
import { startOutboxPublisher } from "./utils/events/outbox-publisher";

const port = process.env.QUIZ_PORT || 7302;

const server = http.createServer(index);

connectToDB()
  .then(() => {
    console.log("MongoDB Connected!");
    registerAllQuizzes();
    console.log("Quizzes Registered");
    server.listen(port);
    console.log("Quiz service server listening on http://localhost:" + port);

    // Start outbox publisher
    startOutboxPublisher();
    console.log("Outbox publisher started");
  })
  .catch((err) => {
    console.error("Failed to connect to DB");
    console.error(err);
  });
