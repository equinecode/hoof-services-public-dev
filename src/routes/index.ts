import { Router } from "express";
import type { AppDeps } from "../app";
import { requireAuth } from "../middleware/clerk";
import { createFormsRouter } from "./forms";
import { healthRouter } from "./health";
import { meRouter } from "./me";

export function createApiRouter(deps: AppDeps) {
  const apiRouter = Router();

  apiRouter.use("/health", healthRouter);
  apiRouter.use("/me", requireAuth, meRouter);
  apiRouter.use("/public/forms", createFormsRouter(deps.forms));

  return apiRouter;
}
