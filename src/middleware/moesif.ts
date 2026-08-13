import moesif from "moesif-nodejs";
import type { Env } from "../config/env";
import type { RequestHandler } from "express";

export function createMoesifMiddleware(env: Env): RequestHandler | null {
  if (!env.MOESIF_APPLICATION_ID) {
    return null;
  }

  return moesif({
    applicationId: env.MOESIF_APPLICATION_ID,
    logBody: env.NODE_ENV === "development",
  });
}
