import express from "express";
import { requestId } from "@equinecode/hoof-observability";
import type { Env } from "./config/env";
import { createClerkMiddleware } from "./middleware/clerk";
import { errorHandler } from "./middleware/errorHandler";
import { createVerifyGatewaySecret } from "./middleware/gatewaySecretAuth";
import { createMoesifMiddleware } from "./middleware/moesif";
import type { FormsService } from "./forms/forms.service";
import { createApiRouter } from "./routes";

export type AppDeps = {
  /** Undefined when DATABASE_URL is unset; form routes then answer 503. */
  forms?: FormsService;
};

export function createApp(env: Env, deps: AppDeps = {}) {
  const app = express();

  app.disable("x-powered-by");

  app.use(createVerifyGatewaySecret(env.GATEWAY_SHARED_SECRET));

  // Clerk must run before other middleware
  app.use(createClerkMiddleware(env));
  app.use(requestId);
  app.use(express.json({ limit: "100kb" }));

  const moesifMiddleware = createMoesifMiddleware(env);
  if (moesifMiddleware) {
    app.use(moesifMiddleware);
  }

  app.use("/api", createApiRouter(deps));

  app.use((_req, res) => {
    res.status(404).json({ error: "Not found" });
  });

  app.use(errorHandler);

  return app;
}
