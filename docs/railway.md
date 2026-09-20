# Railway Deployment

This service is configured to deploy on [Railway](https://railway.com) using [Railpack](https://docs.railway.com/builds/railpack). Build and deploy settings live in [`railway.json`](../railway.json) at the repo root.

## Prerequisites

- A [Railway account](https://railway.com)
- The [Railway CLI](https://docs.railway.com/develop/cli) (optional, for local deploys)
- Clerk API keys
- A PostgreSQL database (Railway Postgres plugin recommended)

## Quick deploy

From this directory:

```bash
railway up
```

If you are not signed in, the CLI opens a browser to authenticate and creates a project + service on first deploy.

## Project setup (recommended)

### 1. Create the project

```bash
railway init --name hoof-public
```

Or create a project in the [Railway Dashboard](https://railway.com/dashboard) and connect this GitHub repo.

### 2. Add PostgreSQL

In the Railway project:

1. Click **New** → **Database** → **PostgreSQL**
2. Railway injects `DATABASE_URL` into linked services automatically

Reference the database from the listings service so the app receives `DATABASE_URL`.

### 3. Set environment variables

In the listings service → **Variables**, add:

| Variable | Required | Notes |
|---|---|---|
| `CLERK_PUBLISHABLE_KEY` | Yes | `pk_live_...` or `pk_test_...` |
| `CLERK_SECRET_KEY` | Yes | `sk_live_...` or `sk_test_...` |
| `CLERK_AUTHORIZED_PARTIES` | Recommended | Your frontend URL(s), comma-separated |
| `NODE_ENV` | Yes | Set to `production` |
| `AWS_REGION` | If using AWS | e.g. `us-east-1` |
| `AWS_S3_BUCKET` | If using S3 | Bucket name |
| `AWS_EVENT_BUS_NAME` | If using EventBridge | Event bus name |
| `MOESIF_APPLICATION_ID` | Optional | API analytics |
| `INFISICAL_*` | Optional | See [infisical.md](./infisical.md) |

`PORT` is set automatically by Railway — do not override it.

`DATABASE_URL` is set automatically when PostgreSQL is linked.

### 4. Deploy

Push to the connected branch, or run:

```bash
railway up --detach
```

## How the build works

Railpack reads `railway.json` and `package.json`:

| Phase | Command | What happens |
|---|---|---|
| Install | (auto) | `npm ci` from lockfile |
| Build | `npm run build` | `prisma generate && tsc` |
| Pre-deploy | `npm run db:migrate:deploy` | Applies pending Prisma migrations |
| Start | `npm start` | `node dist/index.js` |
| Health check | `GET /api/health` | Railway waits up to 120s |

### Why pre-deploy for migrations?

Database migrations run in the **pre-deploy** step (not during build) because Railway's private network to Postgres is available at deploy time, not during the build container. Pre-deploy also runs once per deployment, which is safe when scaling to multiple replicas.

## Config files

| File | Purpose |
|---|---|
| `railway.json` | Railpack builder, build/start commands, health check, pre-deploy |
| `.node-version` | Node.js 22 (Infisical SDK v5+ needs 20+) |
| `package.json` `engines.node` | `>=20` |

## Generate a public URL

In the Railway service → **Settings** → **Networking** → **Generate Domain**.

Update `CLERK_AUTHORIZED_PARTIES` to include your frontend origin.

## CLI reference

```bash
# Deploy current directory
railway up

# View logs
railway logs --lines 200

# Run a one-off command with production env vars
railway run npm run db:migrate:deploy

# List variables
railway variable list

# Set a variable
railway variable set CLERK_SECRET_KEY=sk_live_...
```

## Troubleshooting

### Build fails on `prisma generate`

Ensure `prisma` is in `dependencies` (not `devDependencies`). It is required at build time.

### Pre-deploy migration fails

- Confirm PostgreSQL is linked and `DATABASE_URL` is set on the service
- Check pre-deploy logs in the Railway deployment details
- Run manually: `railway run npm run db:migrate:deploy`

### Health check timeout

The server must respond on `GET /api/health` within 120 seconds. If startup is slow, increase `healthcheckTimeout` in `railway.json`.

### 401 from all API routes

Verify `CLERK_AUTHORIZED_PARTIES` includes your frontend origin and the frontend sends `Authorization: Bearer <token>`.

## Related docs

- [Clerk auth](./clerk.md)
- [Infisical secrets](./infisical.md)
- [S3 storage](./s3.md)
- [EventBridge events](./eventbridge.md)
