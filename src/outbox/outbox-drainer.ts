import { logError, logInfo } from "@equinecode/hoof-observability";
import type { EventPublisher } from "./event-publisher";
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

/** Plain interval loop with an overlap guard; safe across replicas (SKIP LOCKED). */
export function startOutboxDrainWorker(
  repo: OutboxRepository,
  publisher: EventPublisher,
  options: OutboxDrainOptions & { intervalMs: number },
): { stop: () => void } {
  let running = false;
  const timer = setInterval(() => {
    if (running) return;
    running = true;
    drainOutboxBatch(repo, publisher, options)
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
