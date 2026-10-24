import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "../generated/prisma/client";
import type { FormEventInput, FormEventSink } from "../forms/forms.service";

export type ClaimedOutboxEvent = {
  id: string;
  eventId: string;
  detailType: string;
  payload: unknown;
  correlationId: string | null;
  causationId: string | null;
  attempts: number;
};

export type FailedOutboxEvent = {
  id: string;
  eventId: string;
  detailType: string;
  attempts: number;
  lastError: string | null;
  createdAt: Date;
};

/** Must match `OutboxEvent` `@@schema`/`@@map` in `prisma/schema.prisma`. */
const OUTBOX_EVENTS_RELATION = '"public"."outbox_events"';

/**
 * Prisma writes `timestamp(3)` columns as UTC wall-clock time, so raw SQL must
 * compare against UTC too. Plain `now()` is converted using the session
 * TimeZone and would skew every comparison on a non-UTC database.
 */
const UTC_NOW = Prisma.raw("(now() AT TIME ZONE 'UTC')");

/**
 * Writes to this service's own outbox table (ADR-001 shape). `enqueue`
 * resolves only after the row is committed, which is what lets the forms API
 * confirm receipt (D-178).
 */
export class OutboxRepository implements FormEventSink {
  constructor(private readonly prisma: PrismaClient) {}

  async enqueue(event: FormEventInput): Promise<void> {
    const now = new Date();
    // Upsert on the deterministic event_id: a retried submission is a no-op.
    await this.prisma.outboxEvent.upsert({
      where: { eventId: event.eventId },
      create: {
        id: randomUUID(),
        eventId: event.eventId,
        detailType: event.detailType,
        payload: event.payload as Prisma.InputJsonValue,
        correlationId: event.correlationId,
        createdAt: now,
        updatedAt: now,
      },
      update: {},
    });
  }

  /** Claims PENDING rows (SKIP LOCKED, so several replicas are safe). */
  async claimBatch(limit: number): Promise<ClaimedOutboxEvent[]> {
    return this.prisma.$queryRaw<ClaimedOutboxEvent[]>`
      UPDATE ${Prisma.raw(OUTBOX_EVENTS_RELATION)}
      SET status = 'PUBLISHING', updated_at = ${UTC_NOW}
      WHERE id IN (
        SELECT id FROM ${Prisma.raw(OUTBOX_EVENTS_RELATION)}
        WHERE status = 'PENDING' AND available_at <= ${UTC_NOW}
        ORDER BY created_at
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING id, event_id AS "eventId", detail_type AS "detailType", payload,
        correlation_id AS "correlationId", causation_id AS "causationId", attempts;
    `;
  }

  /**
   * Rows stuck in PUBLISHING (the process died mid-publish) go back to
   * PENDING. Safe because consumers dedup on the envelope eventId.
   */
  async releaseStale(olderThanMs: number): Promise<number> {
    return this.prisma.$executeRaw`
      UPDATE ${Prisma.raw(OUTBOX_EVENTS_RELATION)}
      SET status = 'PENDING', updated_at = ${UTC_NOW}
      WHERE status = 'PUBLISHING'
        AND updated_at < ${UTC_NOW} - (${olderThanMs} * interval '1 millisecond')
    `;
  }

  /** FAILED rows ops has not been told about yet (oldest first). */
  async findUnreportedFailures(limit: number): Promise<FailedOutboxEvent[]> {
    return this.prisma.outboxEvent.findMany({
      where: { status: "FAILED", failureReportedAt: null },
      orderBy: { createdAt: "asc" },
      take: limit,
      select: { id: true, eventId: true, detailType: true, attempts: true, lastError: true, createdAt: true },
    });
  }

  async markFailureReported(id: string): Promise<void> {
    await this.prisma.outboxEvent.update({ where: { id }, data: { failureReportedAt: new Date() } });
  }

  async markPublished(id: string): Promise<void> {
    await this.prisma.outboxEvent.update({
      where: { id },
      data: { status: "PUBLISHED", publishedAt: new Date(), updatedAt: new Date() },
    });
  }

  /** Bounded retry with backoff; at `maxAttempts` the row is FAILED for ops to see. */
  async markFailed(
    row: { id: string; attempts: number },
    error: unknown,
    opts: { maxAttempts: number; backoffMs: (attempts: number) => number },
  ): Promise<void> {
    const attempts = row.attempts + 1;
    const lastError = error instanceof Error ? error.message : String(error);
    const exhausted = attempts >= opts.maxAttempts;
    await this.prisma.outboxEvent.update({
      where: { id: row.id },
      data: exhausted
        ? { status: "FAILED", attempts, lastError, updatedAt: new Date() }
        : {
            status: "PENDING",
            attempts,
            lastError,
            availableAt: new Date(Date.now() + opts.backoffMs(attempts)),
            updatedAt: new Date(),
          },
    });
  }
}
