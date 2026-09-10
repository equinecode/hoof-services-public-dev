import type { RequestHandler } from "express";
import { timingSafeStringEqual } from "../lib/shared-secret";

const HEADER_NAME = "x-hoofmart-gateway-secret";

/**
 * Verifies the shared secret the marketplace API Gateway injects on every
 * proxied request (hoofcloud infra/secrets.tf +
 * docs/terraform/marketplace-api-gateway.md). Until this passes, this
 * service's Railway URL is directly reachable, bypassing the gateway's
 * throttling and access logging — this is the actual enforcement of
 * "traffic came through the gateway."
 *
 * Skips health checks (hit directly by Railway's own probes, never via the
 * gateway), webhooks and internal routes (already gated by their own
 * distinct shared-secret headers and called directly by their respective
 * relays, not through this gateway), and docs (human access via Basic Auth).
 */
export function createVerifyGatewaySecret(secret: string): RequestHandler {
  return (req, res, next) => {
    if (
      req.path.startsWith("/api/health") ||
      req.path.startsWith("/api/webhooks") ||
      req.path.startsWith("/api/internal") ||
      req.path.startsWith("/api/docs")
    ) {
      next();
      return;
    }

    const provided = req.header(HEADER_NAME);

    if (!provided || !timingSafeStringEqual(provided, secret)) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    next();
  };
}
