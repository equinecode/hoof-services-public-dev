import { Router } from "express";
import type { RequestHandler } from "express";
import { timingSafeStringEqual } from "../lib/shared-secret";

export interface PausableWorker {
  pause: () => void;
  resume: () => void;
  isPaused: () => boolean;
}

const ACTIONS = ["enable", "disable", "status"] as const;
type Action = (typeof ACTIONS)[number];

const HEADER_NAME = "x-internal-api-secret";

function verifySecret(secret: string): RequestHandler {
  return (req, res, next) => {
    const provided = req.header(HEADER_NAME);
    if (!provided || !timingSafeStringEqual(provided, secret)) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    next();
  };
}

/**
 * Pause/resume this process's polling workers (the outbox drainer).
 * In-memory only: a restart comes back with every worker enabled.
 */
export function createBackgroundWorkersRouter(workers: Record<string, PausableWorker>, secret: string): Router {
  const router = Router();
  router.use(verifySecret(secret));

  router.post("/:action", (req, res) => {
    const action = req.params.action as Action;
    if (!ACTIONS.includes(action)) {
      res.status(400).json({ error: `Unknown action "${req.params.action}"` });
      return;
    }

    for (const worker of Object.values(workers)) {
      if (action === "enable") worker.resume();
      if (action === "disable") worker.pause();
    }

    res.json({
      action,
      workers: Object.entries(workers).map(([name, worker]) => ({ name, paused: worker.isPaused() })),
    });
  });

  return router;
}
