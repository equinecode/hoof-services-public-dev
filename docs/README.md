# Hoof Public — Integration Docs

This service is an Express + TypeScript API. The guides below cover how each external integration is configured and used in this codebase.

| Integration | Purpose | Required |
|---|---|---|
| [Clerk](./clerk.md) | Authenticate requests from the frontend | Yes |
| [Infisical](./infisical.md) | Load secrets at runtime | No |
| [EventBridge](./eventbridge.md) | Publish domain events | No |
| [S3](./s3.md) | Object storage for files and payloads | No |
| [Railway](./railway.md) | Deploy to Railway with Railpack | — |

## Quick start

1. Copy environment variables:

   ```bash
   cp .env.example .env
   ```

2. Fill in required values (at minimum Clerk keys).

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
