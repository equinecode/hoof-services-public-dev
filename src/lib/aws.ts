import { EventBridgeClient, PutEventsCommand } from "@aws-sdk/client-eventbridge";
import { S3Client } from "@aws-sdk/client-s3";
import type { Env } from "../config/env";

type AwsClients = {
  s3: S3Client | undefined;
  eventBridge: EventBridgeClient | undefined;
};

const globalForAws = globalThis as unknown as AwsClients;

function getClientConfig(env: Env) {
  const config = {
    region: env.AWS_REGION,
    ...(env.AWS_ENDPOINT_URL
      ? { endpoint: env.AWS_ENDPOINT_URL, forcePathStyle: true }
      : {}),
    ...(env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY
      ? {
          credentials: {
            accessKeyId: env.AWS_ACCESS_KEY_ID,
            secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
          },
        }
      : {}),
  };

  return config;
}

export function getS3Client(env: Env): S3Client {
  if (!globalForAws.s3) {
    globalForAws.s3 = new S3Client(getClientConfig(env));
  }

  return globalForAws.s3;
}

export function getEventBridgeClient(env: Env): EventBridgeClient {
  if (!globalForAws.eventBridge) {
    globalForAws.eventBridge = new EventBridgeClient(getClientConfig(env));
  }

  return globalForAws.eventBridge;
}

export async function publishEvent(
  env: Env,
  detailType: string,
  detail: Record<string, unknown>,
  source = "hoof.public",
): Promise<void> {
  const client = getEventBridgeClient(env);

  await client.send(
    new PutEventsCommand({
      Entries: [
        {
          EventBusName: env.AWS_EVENT_BUS_NAME,
          Source: source,
          DetailType: detailType,
          Detail: JSON.stringify(detail),
        },
      ],
    }),
  );
}

export async function destroyAwsClients(): Promise<void> {
  globalForAws.s3?.destroy();
  globalForAws.eventBridge?.destroy();
  globalForAws.s3 = undefined;
  globalForAws.eventBridge = undefined;
}
