import { InfisicalSDK } from "@infisical/sdk";
import type { Env } from "../config/env";

let client: InfisicalSDK | null = null;

export function isInfisicalConfigured(env: Env): boolean {
  return Boolean(
    env.INFISICAL_CLIENT_ID &&
      env.INFISICAL_CLIENT_SECRET &&
      env.INFISICAL_PROJECT_ID,
  );
}

export async function initInfisical(env: Env): Promise<InfisicalSDK | null> {
  if (!isInfisicalConfigured(env)) {
    return null;
  }

  const sdk = new InfisicalSDK({
    siteUrl: env.INFISICAL_SITE_URL,
  });

  await sdk.auth().universalAuth.login({
    clientId: env.INFISICAL_CLIENT_ID!,
    clientSecret: env.INFISICAL_CLIENT_SECRET!,
  });

  client = sdk;
  return client;
}

export async function getSecret(name: string, env: Env): Promise<string | undefined> {
  if (!client) {
    return process.env[name];
  }

  const secret = await client.secrets().getSecret({
    environment: env.INFISICAL_ENVIRONMENT,
    projectId: env.INFISICAL_PROJECT_ID!,
    secretPath: "/",
    secretName: name,
  });

  return secret.secretValue;
}
