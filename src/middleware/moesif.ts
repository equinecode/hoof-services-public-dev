import moesif from "moesif-nodejs";
import type { Env } from "../config/env";
import type { Request, RequestHandler } from "express";

type RequestOrigin = "aws-api-gateway" | "eventbridge-webhook" | "internal-service" | "direct";

// Moesif records request headers by default; these carry shared secrets or
// credentials and must never leave the service.
const MASKED_REQUEST_HEADERS = new Set([
  "x-hoofmart-gateway-secret",
  "x-webhook-bridge-secret",
  "x-internal-api-secret",
  "authorization",
  "cookie",
]);

/**
 * Which hop delivered this request. Non-exempt routes only reach Moesif after
 * `createVerifyGatewaySecret` has validated `x-hoofmart-gateway-secret`, so
 * its presence there means the marketplace API Gateway proxied it. Webhooks
 * and internal calls skip the gateway and carry their own headers instead.
 */
export function classifyRequestOrigin(req: Pick<Request, "header">): RequestOrigin {
  if (req.header("x-hoofmart-gateway-secret")) return "aws-api-gateway";
  if (req.header("x-webhook-bridge-secret")) return "eventbridge-webhook";
  if (req.header("x-internal-api-secret")) return "internal-service";
  return "direct";
}

export function maskSecretHeaders<T extends { request?: { headers?: Record<string, unknown> } }>(
  event: T,
): T {
  const headers = event.request?.headers;
  if (headers) {
    for (const name of Object.keys(headers)) {
      if (MASKED_REQUEST_HEADERS.has(name.toLowerCase())) {
        delete headers[name];
      }
    }
  }
  return event;
}

export function createMoesifMiddleware(env: Env): RequestHandler | null {
  if (!env.MOESIF_APPLICATION_ID) {
    return null;
  }

  return moesif({
    applicationId: env.MOESIF_APPLICATION_ID,
    logBody: env.NODE_ENV === "development",
    // The SDK types `req` as `object`; at runtime it is the Express request.
    getMetadata: (rawReq: object) => {
      const req = rawReq as Request;
      return {
        origin: classifyRequestOrigin(req),
        // Set by API Gateway when it proxies to the integration; lets an event
        // in Moesif be matched to its gateway access-log entry.
        awsTraceId: req.header("x-amzn-trace-id"),
      };
    },
    maskContent: maskSecretHeaders,
  });
}
