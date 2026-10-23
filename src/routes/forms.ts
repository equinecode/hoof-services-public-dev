import { Router, type Request } from "express";
import { logError } from "@equinecode/hoof-observability";
import { RateLimiter, type RateLimitRule } from "../forms/rate-limit";
import { isFormKind, type FormKind } from "../forms/schemas";
import type { FormsService } from "../forms/forms.service";

const HOUR = 60 * 60 * 1000;
const RULES: Record<FormKind, RateLimitRule> = {
  contact: { limit: 5, windowMs: HOUR },
  "advertising-inquiry": { limit: 5, windowMs: HOUR },
  signup: { limit: 10, windowMs: HOUR },
};

/**
 * The visitor's address. The site's server calls us (authenticated by the
 * gateway shared secret) and forwards the visitor in x-forwarded-for; a
 * caller without the secret never reaches this router.
 */
function clientIp(req: Request): string | undefined {
  const forwarded = req.header("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || req.ip || undefined;
}

export function createFormsRouter(
  service: FormsService | undefined,
  limiter: RateLimiter = new RateLimiter(),
): Router {
  const router = Router();

  router.post("/:form", async (req, res) => {
    const form = req.params.form;
    if (!isFormKind(form)) {
      res.status(404).json({ error: "unknown_form" });
      return;
    }
    if (!service) {
      res.status(503).json({ error: "temporarily_unavailable", retryable: true });
      return;
    }

    const ip = clientIp(req) ?? "unknown";
    const retryAfter = limiter.check(`${form}:${ip}`, RULES[form]);
    if (retryAfter > 0) {
      res.setHeader("Retry-After", String(retryAfter));
      res.status(429).json({ error: "rate_limited", retryable: true });
      return;
    }

    try {
      const result = await service.submit(form, req.body, ip === "unknown" ? undefined : ip);
      if (result.ok) {
        res.status(202).json({ reference: result.reference, status: "accepted" });
      } else if (result.reason === "validation") {
        res.status(422).json({ error: "validation_failed", fields: result.fields });
      } else {
        res.status(400).json({ error: "captcha_failed" });
      }
    } catch (err) {
      // Nothing was accepted; tell the caller it is safe to retry.
      logError(
        { form, error: err instanceof Error ? err.message : String(err) },
        "Form submission could not be accepted",
      );
      res.status(503).json({ error: "temporarily_unavailable", retryable: true });
    }
  });

  return router;
}
