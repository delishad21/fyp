// src/server.ts
import http from "http";
import index from "./index";
import "dotenv/config";
import { connectToDB } from "./models/registry";

const PORT = process.env.PORT || 7304;

const server = http.createServer(index);

async function bootstrap() {
  try {
    // 1) DB first – HTTP handlers use Mongoose models
    await connectToDB();
    console.log("[ai-svc] MongoDB Connected!");

    // 2) Start HTTP server
    server.listen(PORT, () => {
      console.log("[ai-svc] HTTP server listening on http://localhost:" + PORT);
    });
  } catch (err) {
    console.error("[ai-svc] Fatal HTTP startup error", err);
    process.exit(1);
  }
}

bootstrap();
