import { z } from "zod";
import { loadSecretsIntoEnv } from "../lib/infisical";

// Enough to reach Infisical and pull in the rest. Kept separate from the full
// schema so we can validate and use it before the full env is populated.
const bootstrapEnvSchema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),

  // Infisical (optional — omit to use .env / platform env vars directly)
  INFISICAL_SITE_URL: z.string().url().default("https://app.infisical.com"),
  INFISICAL_CLIENT_ID: z.string().optional(),
  INFISICAL_CLIENT_SECRET: z.string().optional(),
  INFISICAL_PROJECT_ID: z.string().optional(),
  INFISICAL_ENVIRONMENT: z.string().default("dev"),
  INFISICAL_SECRET_PATH: z.string().default("/"),
});

export type BootstrapEnv = z.infer<typeof bootstrapEnvSchema>;

const envSchema = bootstrapEnvSchema.extend({
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().url().optional(),

  // Clerk
  CLERK_PUBLISHABLE_KEY: z.string().startsWith("pk_"),
  CLERK_SECRET_KEY: z.string().startsWith("sk_"),
  CLERK_AUTHORIZED_PARTIES: z.string().optional(),

  // Moesif (optional — skipped when unset)
  MOESIF_APPLICATION_ID: z.string().optional(),

  // Sentry (optional — error tracking skipped when unset)
  SENTRY_DSN: z.string().url().optional(),

  // AWS
  AWS_REGION: z.string().default("us-east-1"),
  AWS_ENDPOINT_URL: z.string().url().optional(),
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  AWS_S3_BUCKET: z.string().optional(),
  AWS_EVENT_BUS_NAME: z.string().default("default"),
  EVENT_SOURCE: z.string().default("com.hoofmart.public"),
  // Optional: defaults to INFISICAL_ENVIRONMENT. Stamped on event envelopes.
  APP_ENVIRONMENT: z.string().optional(),
  OUTBOX_DRAIN_INTERVAL_MS: z.coerce.number().int().min(250).default(3000),
  OUTBOX_IDLE_MAX_INTERVAL_MS: z.coerce.number().int().min(250).default(30_000),

  // services/ops: when both are set, a form submission that exhausts its publish retries opens an ops ticket
  // (POST /api/internal/tickets, x-internal-api-secret). Optional so the service still boots without them; the
  // failure is then only logged and stays FAILED in the outbox.
  OPS_SERVICE_URL: z.string().url().optional(),
  OPS_INTERNAL_API_SECRET: z.string().min(32).optional(),

  // Public forms. When set, every form submission must carry a valid
  // Cloudflare Turnstile token (the site's server forwards it).
  TURNSTILE_SECRET_KEY: z.string().optional(),

  // Marketplace API Gateway — shared secret injected as x-hoofmart-gateway-secret
  // on every proxied request (see hoofcloud docs/terraform/marketplace-api-gateway.md).
  GATEWAY_SHARED_SECRET: z.string().min(32),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Two-phase load: validate just enough to reach Infisical, pull secrets into
 * process.env, then validate the full schema so Infisical-sourced values are
 * typed and required-checked too. Exits the process on invalid/missing config.
 */
export async function loadEnv(): Promise<Env> {
  const bootstrapResult = bootstrapEnvSchema.safeParse(process.env);
  if (!bootstrapResult.success) {
    console.error(
      "Invalid environment variables:",
      bootstrapResult.error.flatten().fieldErrors,
    );
    process.exit(1);
  }

  await loadSecretsIntoEnv(bootstrapResult.data);

  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error(
      "Invalid environment variables:",
      result.error.flatten().fieldErrors,
    );
    process.exit(1);
  }

  return result.data;
}
