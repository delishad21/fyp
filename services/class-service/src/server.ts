// src/server.ts
import http from "http";
import index from "./index";
import "dotenv/config";
import { connectToDB } from "./model/registry";

const PORT = process.env.CLASS_PORT || 7303;

const server = http.createServer(index);

async function bootstrap() {
  try {
    // 1) DB first – HTTP handlers use Mongoose models
    await connectToDB();
    console.log("[class-svc] MongoDB Connected!");

    // 2) Start HTTP server
    server.listen(PORT, () => {
      console.log(
        "[class-svc] HTTP server listening on http://localhost:" + PORT
      );
    });
  } catch (err) {
    console.error("[class-svc] Fatal HTTP startup error", err);
    process.exit(1);
  }
}

bootstrap();
