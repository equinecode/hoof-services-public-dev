import { InfisicalSDK } from "@infisical/sdk";
import type { BootstrapEnv } from "../config/env";

export function isInfisicalConfigured(env: BootstrapEnv): boolean {
  return Boolean(
    env.INFISICAL_CLIENT_ID &&
      env.INFISICAL_CLIENT_SECRET &&
      env.INFISICAL_PROJECT_ID,
  );
}

/**
 * Bulk-loads every secret under this service's Infisical path into process.env.
 * Must run before the full env schema is parsed so those values get typed too.
 * A value already set in process.env (e.g. local `.env` override) always wins —
 * Infisical only fills in what's missing.
 * No-ops when Infisical isn't configured, so `.env`-only local dev keeps working.
 */
export async function loadSecretsIntoEnv(env: BootstrapEnv): Promise<void> {
  if (!isInfisicalConfigured(env)) {
    return;
  }

  const sdk = new InfisicalSDK({ siteUrl: env.INFISICAL_SITE_URL });

  await sdk.auth().universalAuth.login({
    clientId: env.INFISICAL_CLIENT_ID!,
    clientSecret: env.INFISICAL_CLIENT_SECRET!,
  });

  const { secrets } = await sdk.secrets().listSecrets({
    environment: env.INFISICAL_ENVIRONMENT,
    projectId: env.INFISICAL_PROJECT_ID!,
    secretPath: env.INFISICAL_SECRET_PATH,
  });

  for (const secret of secrets) {
    if (!process.env[secret.secretKey]) {
      process.env[secret.secretKey] = secret.secretValue;
    }
  }

  console.log(
    `Loaded ${secrets.length} secret(s) from Infisical (${env.INFISICAL_ENVIRONMENT}${env.INFISICAL_SECRET_PATH}).`,
  );
}
