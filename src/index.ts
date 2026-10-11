import "dotenv/config";
import { captureException, flushSentry } from "@equinecode/hoof-observability";
import { loadEnv } from "./config/env";
import { startServer } from "./server";

async function main() {
  const env = await loadEnv();
  await startServer(env);
}

main().catch(async (err) => {
  console.error("Failed to start server:", err);
  captureException(err);
  await flushSentry();
  process.exit(1);
});
