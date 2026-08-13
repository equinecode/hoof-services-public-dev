import { clerkMiddleware, getAuth } from "@clerk/express";
import type { RequestHandler } from "express";
import type { Env } from "../config/env";

export function createClerkMiddleware(env: Env): RequestHandler {
  const authorizedParties = env.CLERK_AUTHORIZED_PARTIES?.split(",")
    .map((party) => party.trim())
    .filter(Boolean);

  return clerkMiddleware({
    publishableKey: env.CLERK_PUBLISHABLE_KEY,
    secretKey: env.CLERK_SECRET_KEY,
    ...(authorizedParties?.length ? { authorizedParties } : {}),
  });
}

/** Returns 401 JSON for unauthenticated API requests (no redirect). */
export const requireAuth: RequestHandler = (req, res, next) => {
  const auth = getAuth(req);

  if (!auth.isAuthenticated) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  next();
};

export { getAuth };
