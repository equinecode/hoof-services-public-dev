# AWS EventBridge

EventBridge is used to publish domain events from this service. Other systems (workers, Lambdas, downstream services) can subscribe to these events via EventBridge rules.

Implementation lives in `src/lib/aws.ts` alongside the S3 client.

## Environment variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `AWS_REGION` | No | `us-east-1` | AWS region |
| `AWS_EVENT_BUS_NAME` | No | `default` | Target event bus name |
| `AWS_ACCESS_KEY_ID` | No | — | Explicit credentials (optional) |
| `AWS_SECRET_ACCESS_KEY` | No | — | Explicit credentials (optional) |
| `AWS_ENDPOINT_URL` | No | — | Custom endpoint (e.g. LocalStack) |

Example:

```env
AWS_REGION=us-east-1
AWS_EVENT_BUS_NAME=hoof-public
```

When `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` are omitted, the AWS SDK uses the [default credential provider chain](https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/setting-credentials-node.html) (IAM roles on ECS/EC2/Lambda, shared credentials file, etc.).

## Client

Get a singleton EventBridge client:

```typescript
import { getEventBridgeClient } from "./lib/aws";

const client = getEventBridgeClient(env);
```

## Publishing events

Use the `publishEvent` helper for the common case:

```typescript
import { publishEvent } from "./lib/aws";

await publishEvent(env, "listing.created", {
  listingId: listing.id,
  userId: auth.userId,
  title: listing.title,
});
```

This sends a `PutEvents` call with:

| Field | Value |
|---|---|
| `EventBusName` | `AWS_EVENT_BUS_NAME` |
| `Source` | `hoof.public` (override with 4th argument) |
| `DetailType` | First argument (e.g. `"listing.created"`) |
| `Detail` | JSON-stringified payload (second argument) |

### Custom source

```typescript
await publishEvent(
  env,
  "listing.updated",
  { listingId: "abc123", status: "published" },
  "hoof.public.api",
);
```

### Low-level usage

For full control, use the SDK directly:

```typescript
import { PutEventsCommand } from "@aws-sdk/client-eventbridge";
import { getEventBridgeClient } from "./lib/aws";

const client = getEventBridgeClient(env);

await client.send(
  new PutEventsCommand({
    Entries: [
      {
        EventBusName: env.AWS_EVENT_BUS_NAME,
        Source: "hoof.public",
        DetailType: "listing.deleted",
        Detail: JSON.stringify({ listingId: "abc123" }),
      },
    ],
  }),
);
```

## Event naming conventions

Use dot-separated names for `DetailType`:

```
listing.created
listing.updated
listing.deleted
listing.published
```

Keep `Detail` payloads flat and JSON-serializable. Include IDs and timestamps; avoid large nested objects.

## Local development with LocalStack

```env
AWS_REGION=us-east-1
AWS_ENDPOINT_URL=http://localhost:4566
AWS_ACCESS_KEY_ID=test
AWS_SECRET_ACCESS_KEY=test
AWS_EVENT_BUS_NAME=default
```

Create the bus in LocalStack before publishing:

```bash
awslocal events create-event-bus --name hoof-public
```

## IAM permissions

The service needs at minimum:

```json
{
  "Effect": "Allow",
  "Action": "events:PutEvents",
  "Resource": "arn:aws:events:REGION:ACCOUNT_ID:event-bus/BUS_NAME"
}
```

## Lifecycle

EventBridge clients are destroyed during graceful shutdown via `destroyAwsClients()` in `src/server.ts`.

## Source files

- `src/lib/aws.ts` — `getEventBridgeClient`, `publishEvent`, `destroyAwsClients`
