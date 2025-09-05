import http from "http";
import index from "./index";
import "dotenv/config";
import { connectToDB, registerAllQuizzes } from "./model/quiz-registry";

const port = process.env.QUIZ_PORT || 7302;

const server = http.createServer(index);

connectToDB()
  .then(() => {
    console.log("MongoDB Connected!");
    registerAllQuizzes();
    console.log("Quizzes Registered");
    server.listen(port);
    console.log("Quiz service server listening on http://localhost:" + port);
  })
  .catch((err) => {
    console.error("Failed to connect to DB");
    console.error(err);
  });

