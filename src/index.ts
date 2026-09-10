import "dotenv/config";
import { loadEnv } from "./config/env";
import { startServer } from "./server";

async function main() {
  const env = await loadEnv();
  await startServer(env);
}

main().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
