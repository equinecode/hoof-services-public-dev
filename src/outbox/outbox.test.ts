import assert from "node:assert/strict";
import test from "node:test";
import { EventBridgePublisher } from "./event-publisher";
import { drainOutboxBatch, startOutboxDrainWorker } from "./outbox-drainer";
import type { OutboxRepository } from "./outbox-repository";

const row = (n: number) => ({
  id: `id${n}`, eventId: `contact_request:HM-${n}:created`, detailType: "contact_request.created",
  payload: { publicId: `HM-${n}` }, correlationId: "corr", causationId: null, attempts: 0,
});

function fakeRepo(rows: ReturnType<typeof row>[]) {
  const calls = { published: [] as string[], failed: [] as string[], released: 0 };
  const repo = {
    releaseStale: async () => { calls.released += 1; return 0; },
    claimBatch: async () => rows,
    markPublished: async (id: string) => { calls.published.push(id); },
    markFailed: async (r: { id: string }) => { calls.failed.push(r.id); },
  } as unknown as OutboxRepository;
  return { repo, calls };
}

test("drain publishes with the outbox key as envelope id and marks rows", async () => {
  const { repo, calls } = fakeRepo([row(1), row(2)]);
  const seen: string[] = [];
  const res = await drainOutboxBatch(repo, {
    publish: async (e) => { if (e.eventId.includes("HM-2")) throw new Error("boom"); seen.push(e.eventId); },
  });
  assert.deepEqual(res, { published: 1, failed: 1 });
  assert.deepEqual(calls.published, ["id1"]);
  assert.deepEqual(calls.failed, ["id2"]);
  assert.equal(calls.released, 1);
  assert.deepEqual(seen, [row(1).eventId]);
});

test("publisher sends the frozen envelope and surfaces rejected entries", async () => {
  let input: any;
  const ok = new EventBridgePublisher(
    { send: async (c: any) => { input = c.input; return { FailedEntryCount: 0 }; } } as any,
    { busName: "bus", source: "com.hoofmart.public", environment: "dev" },
  );
  await ok.publish({ eventId: "e1", detailType: "signup_request.created", detail: { a: 1 }, correlationId: "c1" });
  const entry = input.Entries[0];
  assert.equal(entry.Source, "com.hoofmart.public");
  assert.equal(entry.DetailType, "signup_request.created");
  const env = JSON.parse(entry.Detail);
  assert.equal(env.eventId, "e1");
  assert.equal(env.eventType, "signup_request.created");
  assert.equal(env.schemaVersion, "1.0.0");
  assert.equal(env.producer, "com.hoofmart.public");
  assert.deepEqual(env.data, { a: 1 });
  assert.ok(!("causationId" in env));

  const bad = new EventBridgePublisher(
    { send: async () => ({ FailedEntryCount: 1, Entries: [{ ErrorCode: "AccessDenied" }] }) } as any,
    { busName: "bus", source: "s", environment: "dev" },
  );
  await assert.rejects(() => bad.publish({ eventId: "e", detailType: "t", detail: {} }), /AccessDenied/);
});

test("drain skips the stale release when told to", async () => {
  const { repo, calls } = fakeRepo([]);
  await drainOutboxBatch(repo, { publish: async () => {} }, { releaseStale: false });
  assert.equal(calls.released, 0);
});

test("worker backs off when idle, resets on work, and releases stale rows once a minute", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: 1_000_000 });
  let pending = 0;
  const claims: number[] = [];
  let released = 0;
  const repo = {
    releaseStale: async () => { released += 1; return 0; },
    claimBatch: async () => { claims.push(Date.now()); const n = pending; pending = 0; return Array.from({ length: n }, (_, i) => row(i)); },
    markPublished: async () => {},
    markFailed: async () => {},
  } as unknown as OutboxRepository;
  const worker = startOutboxDrainWorker(repo, { publish: async () => {} }, { intervalMs: 1000, maxIdleIntervalMs: 8000 });
  const advance = async (ms: number) => { t.mock.timers.tick(ms); await new Promise((r) => setImmediate(r)); };

  await advance(1000); // tick 1 (idle) -> next in 2s
  await advance(2000); // tick 2 (idle) -> next in 4s
  await advance(4000); // tick 3 (idle) -> next in 8s
  await advance(8000); // tick 4 (idle) -> capped at 8s
  await advance(8000); // tick 5
  assert.equal(claims.length, 5);
  assert.equal(released, 1, "stale release is not run every tick");

  pending = 1;
  await advance(8000); // tick 6 finds work -> interval resets to 1s
  await advance(1000);
  assert.equal(claims.length, 7);

  worker.stop();
  await advance(60_000);
  assert.equal(claims.length, 7);
});
