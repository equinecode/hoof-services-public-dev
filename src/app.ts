import express from "express";
import type { Env } from "./config/env";
import { createClerkMiddleware } from "./middleware/clerk";
import { errorHandler } from "./middleware/errorHandler";
import { createMoesifMiddleware } from "./middleware/moesif";
import { apiRouter } from "./routes";

export function createApp(env: Env) {
  const app = express();

  app.disable("x-powered-by");

  // Clerk must run before other middleware
  app.use(createClerkMiddleware(env));
  app.use(express.json());

  const moesifMiddleware = createMoesifMiddleware(env);
  if (moesifMiddleware) {
    app.use(moesifMiddleware);
  }

  app.use("/api", apiRouter);

  app.use((_req, res) => {
    res.status(404).json({ error: "Not found" });
  });

  app.use(errorHandler);

  return app;
}
