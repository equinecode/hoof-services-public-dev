import type { FailedOutboxEvent } from "./outbox-repository";

export interface FailureReporter {
  report(row: FailedOutboxEvent): Promise<void>;
}

const DEFAULT_TIMEOUT_MS = 5_000;

/** A relatedEntityPublicId is capped at 128 characters by ops. */
const entityId = (row: FailedOutboxEvent) => row.eventId.slice(0, 128);

/**
 * Tells ops that a website form submission could not be handed to EventBridge after every retry (D-178: ops has
 * visibility into unresolved failures). Calls `POST /api/internal/tickets` directly, the same shape shipping uses,
 * not an event: the failing path is the event bus. The ticket carries identifiers and the error only, never the
 * visitor's message or contact details, which stay in the outbox row. Ops de-dupes on the related entity, so a retried
 * report appends to the open ticket instead of opening another.
 */
export class OpsFailureReporter implements FailureReporter {
  private readonly baseUrl: string;

  constructor(
    baseUrl: string,
    private readonly internalSecret: string,
    private readonly timeoutMs: number = DEFAULT_TIMEOUT_MS,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
  }

  async report(row: FailedOutboxEvent): Promise<void> {
    const reference = row.eventId.split(":")[1] ?? row.eventId;
    const body = {
      customerClerkUserId: "system:public-outbox",
      subject: `Website form submission not delivered: ${reference}`,
      body: "A website form submission was received but could not be passed on for processing. Staff are investigating.",
      internalNote: [
        `Reference: ${reference}`,
        `Event: ${row.detailType} (${row.eventId})`,
        `Received: ${row.createdAt.toISOString()}`,
        `Attempts: ${row.attempts}`,
        `Last error: ${row.lastError ?? "unknown"}`,
        "",
        "The submission is intact in the public service database (public.outbox_events, status FAILED). After fixing the",
        "cause, re-queue it with:",
        `  UPDATE public.outbox_events SET status = 'PENDING', attempts = 0, available_at = now() AT TIME ZONE 'UTC', failure_reported_at = NULL WHERE event_id = '${row.eventId}';`,
      ].join("\n"),
      relatedEntityType: "public_outbox_event",
      relatedEntityPublicId: entityId(row),
    };

    const response = await this.fetchImpl(`${this.baseUrl}/api/internal/tickets`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-internal-api-secret": this.internalSecret },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!response.ok) {
      throw new Error(`ops responded ${response.status} to ticket creation`);
    }
  }
}
