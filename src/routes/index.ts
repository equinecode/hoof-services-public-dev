import { Router } from "express";
import type { AppDeps } from "../app";
import type { Env } from "../config/env";
import { requireAuth } from "../middleware/clerk";
import { createBackgroundWorkersRouter } from "./background-workers";
import { createFormsRouter } from "./forms";
import { healthRouter } from "./health";
import { meRouter } from "./me";

export function createApiRouter(deps: AppDeps, env: Env) {
  const apiRouter = Router();

  apiRouter.use("/health", healthRouter);
  if (env.BACKGROUND_WORKERS_INTERNAL_API_SECRET) {
    apiRouter.use(
      "/internal/admin/background-workers",
      createBackgroundWorkersRouter(deps.backgroundWorkers ?? {}, env.BACKGROUND_WORKERS_INTERNAL_API_SECRET),
    );
  }
  apiRouter.use("/me", requireAuth, meRouter);
  apiRouter.use("/public/forms", createFormsRouter(deps.forms));

  return apiRouter;
}
