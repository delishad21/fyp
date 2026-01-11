import http from "http";
import "dotenv/config";

import index from "./index";
import { connectToDB, registerAllQuizzes } from "./model/quiz-registry";
import { initRedis } from "./events/utils/redis";

const port = process.env.QUIZ_PORT || 7302;

const server = http.createServer(index);

async function bootstrap() {
  try {
    await connectToDB();
    console.log("[quiz-svc] MongoDB connected");

    await initRedis();
    console.log("[quiz-svc] Redis connected");

    registerAllQuizzes();
    console.log("[quiz-svc] Quiz types registered");

    server.listen(port, () => {
      console.log(
        `[quiz-svc] HTTP server listening on http://localhost:${port}`
      );
    });
  } catch (err) {
    console.error("[quiz-svc] Fatal HTTP startup error", err);
    process.exit(1);
  }
}

bootstrap();
