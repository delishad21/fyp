import "dotenv/config";
import http from "http";
import app from "./index";
import { connectToDB } from "./model/registry";

const PORT = Number(process.env.GAME_PORT || 7305);
const server = http.createServer(app);

async function bootstrap() {
  try {
    await connectToDB();
    console.log("[game-svc] MongoDB Connected!");

    server.listen(PORT, () => {
      console.log(`[game-svc] HTTP server listening on http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error("[game-svc] Fatal HTTP startup error", err);
    process.exit(1);
  }
}

bootstrap();
