# Public forms

Unauthenticated form intake for the HoofMart website (D-173–D-178,
`docs/v1/architecture/public-marketing-boundary.md`). The site's **server**
calls these routes; browsers never do, so there is no CORS and the gateway
shared secret (`x-hoofmart-gateway-secret`) applies as on every other route.

| Route | Event (`detail-type`) | Event id |
|---|---|---|
| `POST /api/public/forms/contact` | `contact_request.created` | `contact_request:<ref>:created` |
| `POST /api/public/forms/advertising-inquiry` | `advertising_inquiry.created` | `advertising_inquiry:<ref>:created` |
| `POST /api/public/forms/signup` | `signup_request.created` | `signup_request:<ref>:created` |

`signup` covers the newsletter and app-launch waitlist (`list`:
`newsletter` \| `waitlist`). A signup request records interest only; it does
not enroll anyone or start any outbound campaign.

Fields are predefined and validated with strict Zod schemas
(`src/forms/schemas.ts`); unknown fields are rejected.

## Responses

| Status | Meaning |
|---|---|
| `202 {reference, status:"accepted"}` | Durably accepted. Receipt, not completion. |
| `422 {error:"validation_failed", fields}` | Fix the input; do not retry as-is. |
| `400 {error:"captcha_failed"}` | Turnstile token missing/invalid. |
| `429 {error:"rate_limited"}` + `Retry-After` | Per visitor address and form. |
| `503 {error:"temporarily_unavailable", retryable:true}` | Nothing was accepted; safe to retry. Also returned when `DATABASE_URL` is unset. |

## How acceptance is made reliable

1. The submission is upserted into this service's own `public.outbox_events`
   table **before** `202` is sent. The outbox row is the durable record.
   The service has its **own database** (`DATABASE_URL`, its own Prisma
   migrations in `prisma/migrations`, applied by Railway's pre-deploy
   `db:migrate:deploy`); it does not touch the shared marketplace database.
2. The reference is deterministic (`HM-` + 10 Crockford base32 characters of a
   SHA-256), and the outbox upsert is keyed on the event id. A retry or
   double click returns the same reference and creates no second event.
   Signups dedupe per (list, email) forever; contact and advertising
   inquiries per (form, email, message) per UTC day.
3. A drainer (`src/outbox/outbox-drainer.ts`, every `OUTBOX_DRAIN_INTERVAL_MS`)
   claims `PENDING` rows with `SKIP LOCKED`, publishes the frozen
   envelope (ADR-001 §5, envelope `eventId` = outbox key) and marks them
   `PUBLISHED`. Failures back off and retry; after 10 attempts the row is
   `FAILED` with `last_error`. Rows stuck in `PUBLISHING` are released after 2
   minutes (consumers dedup on envelope `eventId`).

### Ops visibility of failures

When a row goes `FAILED`, a sweep (about once a minute) opens an ops ticket through `POST /api/internal/tickets`
(`OPS_SERVICE_URL` + `OPS_INTERNAL_API_SECRET`, the same shape as shipping's label-failure tickets) and stamps
`failure_reported_at`; if ops is unreachable the row stays unstamped and is retried on the next sweep. The ticket has
the reference, event, error and a re-queue `UPDATE`, never the visitor's message or contact details. Without the two
variables the failure is only logged and the service says so at startup.

Downstream, ops turns `contact_request.created` and `advertising_inquiry.created` into tickets
(`POST /api/webhooks/public` in services/ops, via an EventBridge API destination); signups get no ticket.

## Spam controls

- Honeypot field `website`: a filled value gets a normal-looking `202` and is
  dropped.
- Cloudflare Turnstile: set `TURNSTILE_SECRET_KEY` and every submission needs a
  valid `turnstileToken`; verification fails closed.
- In-memory per-instance rate limit keyed on `x-forwarded-for` (first value,
  as forwarded by the site's server) — a backstop to gateway throttling.
- Bodies over 100kb are rejected by the existing JSON limit.

## Environment

| Variable | Default | Notes |
|---|---|---|
| `DATABASE_URL` | — | Required for forms; this service's own Postgres |
| `EVENT_SOURCE` | `com.hoofmart.public` | EventBridge `Source` |
| `AWS_EVENT_BUS_NAME` | `default` | |
| `APP_ENVIRONMENT` | `INFISICAL_ENVIRONMENT` | Stamped on envelopes |
| `OUTBOX_DRAIN_INTERVAL_MS` | `3000` | Poll interval while rows are flowing |
| `OUTBOX_IDLE_MAX_INTERVAL_MS` | `30000` | Empty ticks double the wait up to this; Prisma Postgres bills every query, so idle polling is capped. A new submission waits at most this long to publish |
| `OPS_SERVICE_URL` | — | Optional; with the secret below, failed submissions open an ops ticket |
| `OPS_INTERNAL_API_SECRET` | — | Optional; ops' internal ticket secret (min 32 chars) |
| `TURNSTILE_SECRET_KEY` | — | Optional; enables captcha |

## Database

A standalone Postgres, same model as `services/ops`: on Railway, add a
PostgreSQL service and link it so `DATABASE_URL` is injected; migrations run on
deploy. Tests that need a real database are skipped unless `TEST_DATABASE_URL`
points at one with migrations applied:

```bash
DATABASE_URL=$TEST_DATABASE_URL npm run db:migrate:deploy && npm test
```

Raw SQL in the outbox repository compares against `now() AT TIME ZONE 'UTC'`
because Prisma stores `timestamp(3)` columns as UTC wall-clock time.
