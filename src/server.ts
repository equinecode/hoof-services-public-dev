import type { Env } from "./config/env";
import { createApp } from "./app";
import { destroyAwsClients } from "./lib/aws";
import { disconnectPrisma } from "./lib/prisma";

export async function startServer(env: Env): Promise<import("node:http").Server> {
  const app = createApp(env);

  const server = app.listen(env.PORT, "0.0.0.0", () => {
    console.log(`Server listening on port ${env.PORT} (${env.NODE_ENV})`);
  });

  const shutdown = async (signal: string) => {
    console.log(`Received ${signal}, shutting down gracefully…`);
    server.close(async () => {
      await disconnectPrisma();
      await destroyAwsClients();
      process.exit(0);
    });
  };

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));

  return server;
}
