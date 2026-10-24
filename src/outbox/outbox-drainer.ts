import { logError, logInfo } from "@equinecode/hoof-observability";
import type { EventPublisher } from "./event-publisher";
import type { FailureReporter } from "./ops-failure-reporter";
import type { OutboxRepository } from "./outbox-repository";

export type OutboxDrainOptions = {
  batchSize?: number;
  maxAttempts?: number;
  backoffMs?: (attempts: number) => number;
};

const DEFAULT_BATCH_SIZE = 25;
const DEFAULT_MAX_ATTEMPTS = 10;
const STALE_PUBLISHING_MS = 2 * 60_000;
const defaultBackoffMs = (attempts: number) => Math.min(attempts * 30_000, 5 * 60_000);

/** Drains one batch: claim, publish, mark PUBLISHED or retry/FAILED. */
export async function drainOutboxBatch(
  repo: OutboxRepository,
  publisher: EventPublisher,
  options: OutboxDrainOptions = {},
): Promise<{ published: number; failed: number }> {
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const backoffMs = options.backoffMs ?? defaultBackoffMs;

  await repo.releaseStale(STALE_PUBLISHING_MS);
  const claimed = await repo.claimBatch(options.batchSize ?? DEFAULT_BATCH_SIZE);

  let published = 0;
  let failed = 0;
  for (const row of claimed) {
    try {
      await publisher.publish({
        eventId: row.eventId,
        detailType: row.detailType,
        detail: row.payload,
        correlationId: row.correlationId ?? undefined,
        causationId: row.causationId ?? undefined,
      });
      await repo.markPublished(row.id);
      published += 1;
    } catch (err) {
      logError(
        { eventId: row.eventId, detailType: row.detailType, attempts: row.attempts + 1 },
        "Outbox event publish failed",
      );
      await repo.markFailed(row, err, { maxAttempts, backoffMs });
      failed += 1;
    }
  }

  if (published > 0 || failed > 0) logInfo({ published, failed }, "Outbox drain batch complete");
  return { published, failed };
}

/**
 * Tells ops about FAILED rows it has not heard of yet. A failed report leaves the row unmarked, so the next sweep
 * retries it; one bad row never blocks the others.
 */
export async function reportFailedRows(
  repo: OutboxRepository,
  reporter: FailureReporter,
  limit = 10,
): Promise<{ reported: number; failed: number }> {
  let reported = 0;
  let failed = 0;
  for (const row of await repo.findUnreportedFailures(limit)) {
    try {
      await reporter.report(row);
      await repo.markFailureReported(row.id);
      reported += 1;
    } catch (err) {
      failed += 1;
      logError(
        { eventId: row.eventId, error: err instanceof Error ? err.message : String(err) },
        "Could not report failed form submission to ops",
      );
    }
  }
  return { reported, failed };
}

const FAILURE_SWEEP_INTERVAL_MS = 60_000;

/** Plain interval loop with an overlap guard; safe across replicas (SKIP LOCKED). */
export function startOutboxDrainWorker(
  repo: OutboxRepository,
  publisher: EventPublisher,
  options: OutboxDrainOptions & { intervalMs: number; failureReporter?: FailureReporter },
): { stop: () => void } {
  let running = false;
  let lastSweep = 0;
  const timer = setInterval(() => {
    if (running) return;
    running = true;
    drainOutboxBatch(repo, publisher, options)
      .then(async () => {
        if (!options.failureReporter || Date.now() - lastSweep < FAILURE_SWEEP_INTERVAL_MS) return;
        lastSweep = Date.now();
        await reportFailedRows(repo, options.failureReporter);
      })
      .catch((err) =>
        logError({ error: err instanceof Error ? err.message : String(err) }, "Outbox drain tick failed"),
      )
      .finally(() => {
        running = false;
      });
  }, options.intervalMs);
  timer.unref?.();
  return { stop: () => clearInterval(timer) };
}
