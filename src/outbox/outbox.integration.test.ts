import assert from "node:assert/strict";
import test from "node:test";
import { FormsService } from "../forms/forms.service";
import { createPrismaClient } from "../lib/prisma";
import { drainOutboxBatch, reportFailedRows } from "./outbox-drainer";
import { OutboxRepository } from "./outbox-repository";

// Runs against a real Postgres with migrations applied, e.g.
//   TEST_DATABASE_URL=postgresql://... npm run db:migrate:deploy && npm test
const url = process.env.TEST_DATABASE_URL;

test("outbox against a real database", { skip: !url && "TEST_DATABASE_URL not set" }, async (t) => {
  const prisma = createPrismaClient(url!);
  const repo = new OutboxRepository(prisma);
  t.after(() => prisma.$disconnect());
  await prisma.outboxEvent.deleteMany();

  const service = new FormsService({ sink: repo });
  const body = { email: "a@b.co", list: "newsletter" };

  await t.test("a duplicate submission yields one row and the same reference", async () => {
    const a = await service.submit("signup", body);
    const b = await service.submit("signup", body);
    assert.deepEqual(a, b);
    assert.equal(await prisma.outboxEvent.count(), 1);
  });

  await t.test("drain publishes the row once and marks it PUBLISHED", async () => {
    const seen: string[] = [];
    const res = await drainOutboxBatch(repo, { publish: async (e) => void seen.push(e.eventId) });
    assert.deepEqual(res, { published: 1, failed: 0 });
    assert.match(seen[0]!, /^signup_request:HM-.{10}:created$/);
    assert.equal((await prisma.outboxEvent.findFirstOrThrow()).status, "PUBLISHED");
    assert.deepEqual(await drainOutboxBatch(repo, { publish: async () => assert.fail("republished") }), { published: 0, failed: 0 });
  });

  await t.test("failures back off, then go FAILED after max attempts", async () => {
    await service.submit("contact", { name: "A", email: "a@b.co", message: "Hello there, partner." });
    const fail = { publish: async () => { throw new Error("bus down"); } };
    const opts = { maxAttempts: 2, backoffMs: () => 0 };
    assert.deepEqual(await drainOutboxBatch(repo, fail, opts), { published: 0, failed: 1 });
    let row = await prisma.outboxEvent.findFirstOrThrow({ where: { detailType: "contact_request.created" } });
    assert.equal(row.status, "PENDING");
    assert.equal(row.lastError, "bus down");
    await drainOutboxBatch(repo, fail, opts);
    row = await prisma.outboxEvent.findFirstOrThrow({ where: { detailType: "contact_request.created" } });
    assert.equal(row.status, "FAILED");
    assert.equal(row.attempts, 2);
  });

  await t.test("stale PUBLISHING rows are released and re-drained", async () => {
    await service.submit("advertising-inquiry", { name: "A", email: "a@b.co", company: "Acme", message: "Banner ads please." });
    const claimed = await repo.claimBatch(10);
    assert.equal(claimed.length, 1);
    assert.equal(await repo.releaseStale(60_000), 0);
    await prisma.$executeRaw`UPDATE "public"."outbox_events" SET updated_at = (now() AT TIME ZONE 'UTC') - interval '5 minutes' WHERE status = 'PUBLISHING'`;
    assert.equal(await repo.releaseStale(60_000), 1);
    assert.deepEqual(await drainOutboxBatch(repo, { publish: async () => {} }), { published: 1, failed: 0 });
  });

  await t.test("failed rows are reported to ops exactly once", async () => {
    await prisma.outboxEvent.deleteMany();
    await service.submit("contact", { name: "A", email: "z@b.co", message: "Please call me back." });
    await drainOutboxBatch(repo, { publish: async () => { throw new Error("bus down"); } }, { maxAttempts: 1, backoffMs: () => 0 });
    const reports: string[] = [];
    const reporter = { report: async (r: { eventId: string }) => void reports.push(r.eventId) };
    assert.deepEqual(await reportFailedRows(repo, reporter), { reported: 1, failed: 0 });
    assert.deepEqual(await reportFailedRows(repo, reporter), { reported: 0, failed: 0 });
    assert.equal(reports.length, 1);
    assert.ok((await prisma.outboxEvent.findFirstOrThrow()).failureReportedAt);
  });
});
