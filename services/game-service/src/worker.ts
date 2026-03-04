import { connectToDB } from "./model/registry";

async function bootstrapWorker() {
  try {
    await connectToDB();
    console.log("[game-svc worker] MongoDB Connected!");
    console.log("[game-svc worker] Worker is bootstrapped (event consumers pending).");

    // Keep worker process alive until consumers are wired in subsequent commits.
    setInterval(() => {
      // no-op heartbeat
    }, 60_000);
  } catch (err) {
    console.error("[game-svc worker] Fatal worker startup error", err);
    process.exit(1);
  }
}

bootstrapWorker();
