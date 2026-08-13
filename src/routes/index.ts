import { Router } from "express";
import { requireAuth } from "../middleware/clerk";
import { healthRouter } from "./health";
import { meRouter } from "./me";

export const apiRouter = Router();

apiRouter.use("/health", healthRouter);
apiRouter.use("/me", requireAuth, meRouter);
