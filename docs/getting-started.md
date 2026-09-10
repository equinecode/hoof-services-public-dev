## Project structure

```
src/
  index.ts              # Entry point — loads env, Infisical, starts server
  app.ts                # Express app factory (testable, no listen)
  server.ts             # HTTP server + graceful shutdown
  config/env.ts         # Zod-validated environment
  lib/
    infisical.ts        # Optional Infisical secrets client
    prisma.ts             # Prisma v7 client with PG adapter
  middleware/
    errorHandler.ts     # Centralized error handling (incl. Zod)
    moesif.ts           # Optional Moesif API analytics
  routes/
    health.ts           # GET /api/health
    index.ts            # Route aggregator
prisma/
  schema.prisma         # Starter Listing model
prisma.config.ts        # Prisma v7 CLI config
tsconfig.json
.env.example
```

## Practices included

- **App/server split** — `createApp()` is separate from `startServer()` for easier testing
- **Zod env validation** — fails fast on bad config at startup
- **Optional integrations** — Infisical and Moesif only activate when their env vars are set
- **Prisma v7** — PostgreSQL adapter (`@prisma/adapter-pg` + `pg`), singleton client, graceful disconnect
- **Express 5** — JSON parsing, 404 handler, centralized error middleware, `x-powered-by` disabled
- **Graceful shutdown** — handles `SIGTERM` / `SIGINT`

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Hot-reload dev server |
| `npm run build` | Compile to `dist/` |
| `npm start` | Run production build |
| `npm run db:migrate` | Run Prisma migrations |
| `npm run db:generate` | Regenerate Prisma client |

## Getting started

1. Copy env: `cp .env.example .env`
2. Set `DATABASE_URL` to your Postgres instance
3. Run migrations: `npm run db:migrate`
4. Start dev: `npm run dev`

The health check at `GET /api/health` is working. A dev server may still be running on port 3000 from verification — stop it if needed before starting your own.

To enable optional services, add to `.env`:
- **Infisical**: `INFISICAL_CLIENT_ID`, `INFISICAL_CLIENT_SECRET`, `INFISICAL_PROJECT_ID`
- **Moesif**: `MOESIF_APPLICATION_ID`