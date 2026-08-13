import "dotenv/config";
import { loadEnv } from "./config/env";
import { initInfisical } from "./lib/infisical";
import { startServer } from "./server";

async function main() {
  const env = loadEnv();

  await initInfisical(env);
  await startServer(env);
}

main().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
