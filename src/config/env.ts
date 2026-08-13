import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().url().optional(),

  // Clerk
  CLERK_PUBLISHABLE_KEY: z.string().startsWith("pk_"),
  CLERK_SECRET_KEY: z.string().startsWith("sk_"),
  CLERK_AUTHORIZED_PARTIES: z.string().optional(),

  // Infisical (optional — falls back to process.env when unset)
  INFISICAL_SITE_URL: z.string().url().optional(),
  INFISICAL_CLIENT_ID: z.string().optional(),
  INFISICAL_CLIENT_SECRET: z.string().optional(),
  INFISICAL_PROJECT_ID: z.string().optional(),
  INFISICAL_ENVIRONMENT: z.string().default("dev"),

  // Moesif (optional — skipped when unset)
  MOESIF_APPLICATION_ID: z.string().optional(),

  // AWS
  AWS_REGION: z.string().default("us-east-1"),
  AWS_ENDPOINT_URL: z.string().url().optional(),
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  AWS_S3_BUCKET: z.string().optional(),
  AWS_EVENT_BUS_NAME: z.string().default("default"),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(): Env {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    console.error("Invalid environment variables:", result.error.flatten().fieldErrors);
    process.exit(1);
  }

  return result.data;
}
