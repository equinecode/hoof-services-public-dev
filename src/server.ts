import { initLogger, initSentry } from "@equinecode/hoof-observability";
import type { Env } from "./config/env";
import { createApp } from "./app";
import { FormsService } from "./forms/forms.service";
import { createTurnstile } from "./forms/turnstile";
import { destroyAwsClients, getEventBridgeClient } from "./lib/aws";
import { EventBridgePublisher } from "./outbox/event-publisher";
import { startOutboxDrainWorker } from "./outbox/outbox-drainer";
import { OpsFailureReporter } from "./outbox/ops-failure-reporter";
import { OutboxRepository } from "./outbox/outbox-repository";
import { disconnectPrisma, getPrisma } from "./lib/prisma";

export async function startServer(env: Env): Promise<import("node:http").Server> {
  initLogger("hoof-public");
  initSentry({ dsn: env.SENTRY_DSN, environment: env.NODE_ENV });

  // Public forms need the outbox (durable acceptance); without a database the
  // routes answer 503 rather than accepting what we cannot keep.
  let forms: FormsService | undefined;
  let drainWorker: { stop: () => void } | undefined;
  if (env.DATABASE_URL) {
    const repo = new OutboxRepository(getPrisma(env));
    forms = new FormsService({
      sink: repo,
      turnstile: env.TURNSTILE_SECRET_KEY ? createTurnstile(env.TURNSTILE_SECRET_KEY) : undefined,
    });
    drainWorker = startOutboxDrainWorker(
      repo,
      new EventBridgePublisher(getEventBridgeClient(env), {
        busName: env.AWS_EVENT_BUS_NAME,
        source: env.EVENT_SOURCE,
        environment: env.APP_ENVIRONMENT ?? env.INFISICAL_ENVIRONMENT,
      }),
      {
        intervalMs: env.OUTBOX_DRAIN_INTERVAL_MS,
        maxIdleIntervalMs: env.OUTBOX_IDLE_MAX_INTERVAL_MS,
        failureReporter:
          env.OPS_SERVICE_URL && env.OPS_INTERNAL_API_SECRET
            ? new OpsFailureReporter(env.OPS_SERVICE_URL, env.OPS_INTERNAL_API_SECRET)
            : undefined,
      },
    );
    if (!env.OPS_SERVICE_URL || !env.OPS_INTERNAL_API_SECRET) {
      console.warn("OPS_SERVICE_URL/OPS_INTERNAL_API_SECRET not set: failed form submissions are not reported to ops");
    }
  } else {
    console.warn("DATABASE_URL not set: public form submissions are disabled");
  }

  const app = createApp(env, { forms });

  const server = app.listen(env.PORT, "0.0.0.0", () => {
    console.log(`Server listening on port ${env.PORT} (${env.NODE_ENV})`);
  });

  const shutdown = async (signal: string) => {
    console.log(`Received ${signal}, shutting down gracefully…`);
    drainWorker?.stop();
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
