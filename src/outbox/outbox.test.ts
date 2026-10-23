import assert from "node:assert/strict";
import test from "node:test";
import { EventBridgePublisher } from "./event-publisher";
import { drainOutboxBatch } from "./outbox-drainer";
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
