import { randomUUID } from "node:crypto";
import { PutEventsCommand, type EventBridgeClient } from "@aws-sdk/client-eventbridge";

export const DOMAIN_EVENT_SCHEMA_VERSION = "1.0.0";

export type DomainEvent = {
  eventId: string;
  detailType: string;
  detail: unknown;
  correlationId?: string;
  causationId?: string;
};

export interface EventPublisher {
  publish(event: DomainEvent): Promise<void>;
}

/** Publishes the frozen DomainEventEnvelope (ADR-001 §5) to EventBridge. */
export class EventBridgePublisher implements EventPublisher {
  constructor(
    private readonly client: Pick<EventBridgeClient, "send">,
    private readonly options: { busName: string; source: string; environment: string },
  ) {}

  async publish(event: DomainEvent): Promise<void> {
    const envelope = {
      schemaVersion: DOMAIN_EVENT_SCHEMA_VERSION,
      // The outbox key, so PutEvents retries don't mint a new consumer dedup id.
      eventId: event.eventId,
      eventType: event.detailType,
      occurredAt: new Date().toISOString(),
      correlationId: event.correlationId ?? randomUUID(),
      ...(event.causationId ? { causationId: event.causationId } : {}),
      environment: this.options.environment,
      producer: this.options.source,
      data: event.detail,
    };

    const out = await this.client.send(
      new PutEventsCommand({
        Entries: [
          {
            EventBusName: this.options.busName,
            Source: this.options.source,
            DetailType: event.detailType,
            Detail: JSON.stringify(envelope),
          },
        ],
      }),
    );

    // PutEvents succeeds as a call even when an entry is rejected.
    if ((out.FailedEntryCount ?? 0) > 0) {
      const entry = out.Entries?.find((e) => e.ErrorCode);
      throw new Error(`EventBridge rejected event: ${entry?.ErrorCode ?? "unknown"} ${entry?.ErrorMessage ?? ""}`.trim());
    }
  }
}
