# Infisical Secrets

[Infisical](https://infisical.com) is used to fetch secrets at runtime instead of storing them in plain `.env` files. Integration is optional — when Infisical is not configured, the service falls back to `process.env`.

## Environment variables

All Infisical variables are optional. When the three required credentials below are set, the SDK is initialized at startup.

| Variable | Required | Default | Description |
|---|---|---|---|
| `INFISICAL_SITE_URL` | No | `https://app.infisical.com` | Infisical instance URL (omit for Infisical Cloud) |
| `INFISICAL_CLIENT_ID` | Yes* | — | Machine Identity client ID |
| `INFISICAL_CLIENT_SECRET` | Yes* | — | Machine Identity client secret |
| `INFISICAL_PROJECT_ID` | Yes* | — | Project ID containing secrets |
| `INFISICAL_ENVIRONMENT` | No | `dev` | Environment slug (`dev`, `staging`, `prod`, etc.) |

\* All three (`CLIENT_ID`, `CLIENT_SECRET`, `PROJECT_ID`) must be set together for Infisical to activate.

Example:

```env
INFISICAL_SITE_URL=https://app.infisical.com
INFISICAL_CLIENT_ID=your-client-id
INFISICAL_CLIENT_SECRET=your-client-secret
INFISICAL_PROJECT_ID=your-project-id
INFISICAL_ENVIRONMENT=dev
```

## Setup

1. Create a project in the [Infisical Dashboard](https://app.infisical.com).
2. Create a [Machine Identity](https://infisical.com/docs/documentation/platform/identities/overview) with Universal Auth.
3. Grant the identity access to the target environment.
4. Store secrets in the project (root path `/` by default).
5. Add the credentials above to your environment.

## How it works

At startup, `src/index.ts` calls `initInfisical(env)`:

1. If credentials are missing, Infisical is skipped and `getSecret()` reads from `process.env`.
2. If credentials are present, the SDK authenticates via Universal Auth and stores a client singleton.
3. `getSecret(name, env)` fetches from Infisical when connected, otherwise from `process.env`.

## Usage

```typescript
import { getSecret } from "./lib/infisical";
import type { Env } from "./config/env";

async function connectToExternalService(env: Env) {
  const apiKey = await getSecret("EXTERNAL_API_KEY", env);

  if (!apiKey) {
    throw new Error("EXTERNAL_API_KEY is not configured");
  }

  // Use apiKey...
}
```

Secrets are fetched from path `/` in the configured environment. To use a different path, update `secretPath` in `src/lib/infisical.ts`.

## Local development

For local development, omit Infisical credentials and use `.env` directly:

```env
EXTERNAL_API_KEY=local-dev-key
```

`getSecret("EXTERNAL_API_KEY", env)` will return the value from `process.env`.

## Production

In production, set Infisical Machine Identity credentials via your deployment platform's secret manager. Do not commit credentials to source control.

Infisical SDK v5 requires **Node.js 20+**.

## Source files

- `src/lib/infisical.ts` — SDK client, `initInfisical`, `getSecret`, `isInfisicalConfigured`
- `src/index.ts` — initializes Infisical before the server starts
