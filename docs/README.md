# Hoof Public — Integration Docs

This service is currently an Express + TypeScript scaffold with health and
authenticated identity-check routes. Its Prisma schema mirrors the
`public` domain; public-domain API modules have not landed yet.

| Integration | Purpose | Required |
|---|---|---|
| [Clerk](./clerk.md) | Authenticate requests from the frontend | Yes |
| [Infisical](./infisical.md) | Load secrets at runtime | No |
| [EventBridge](./eventbridge.md) | Publish domain events | No |
| [S3](./s3.md) | Object storage for files and payloads | No |
| [Railway](./railway.md) | Deploy to Railway with Railpack | — |

## API reference status

There is no OpenAPI registry or `/api/openapi.json` route yet. Do not create
or commit `docs/openapi.json` until real public-domain routes and their
colocated contract registrations exist.

## Quick start

1. Copy environment variables:

   ```bash
   cp .env.example .env
   ```

2. Fill in every value required by `src/config/env.ts`; the Clerk keys and
   `GATEWAY_SHARED_SECRET` are currently mandatory.

3. Start the server:

   ```bash
   npm run dev
   ```

## Source layout

| Path | Description |
|---|---|
| `src/config/env.ts` | Zod-validated environment variables |
| `src/middleware/clerk.ts` | Clerk middleware and route guards |
| `src/lib/infisical.ts` | Infisical SDK client |
| `src/lib/aws.ts` | S3 and EventBridge clients |
| `src/routes/health.ts` | `GET /api/health` liveness route |
| `src/routes/me.ts` | Clerk-protected `GET /api/me` identity check |
