import assert from "node:assert/strict";
import test from "node:test";
import { OpsFailureReporter } from "./ops-failure-reporter";
import { reportFailedRows } from "./outbox-drainer";
import type { FailedOutboxEvent, OutboxRepository } from "./outbox-repository";

const row = (n: number): FailedOutboxEvent => ({
  id: `id${n}`,
  eventId: `contact_request:HM-ABCDEFGHJ${n}:created`,
  detailType: "contact_request.created",
  attempts: 10,
  lastError: "AccessDenied: not authorized",
  createdAt: new Date("2026-10-23T12:00:00Z"),
});

test("posts a PII-free ticket to ops with the shared secret and a dedupe key", async () => {
  let call: { url: string; init: RequestInit } | undefined;
  const reporter = new OpsFailureReporter("https://ops.example/", "s".repeat(32), 1000, (async (url: string, init: RequestInit) => {
    call = { url, init };
    return { ok: true, status: 201 };
  }) as unknown as typeof fetch);
  await reporter.report(row(1));

  assert.equal(call!.url, "https://ops.example/api/internal/tickets");
  const headers = call!.init.headers as Record<string, string>;
  assert.equal(headers["x-internal-api-secret"], "s".repeat(32));
  const body = JSON.parse(call!.init.body as string);
  assert.equal(body.relatedEntityType, "public_outbox_event");
  assert.equal(body.relatedEntityPublicId, row(1).eventId);
  assert.equal(body.subject, "Website form submission not delivered: HM-ABCDEFGHJ1");
  assert.match(body.internalNote, /AccessDenied/);
  assert.match(body.internalNote, /UPDATE public\.outbox_events SET status = 'PENDING'/);
  assert.match(body.internalNote, /failure_reported_at = NULL/);
  assert.ok(!("email" in body) && !body.internalNote.includes("@"));
});

test("a non-2xx from ops is an error so the row stays unreported", async () => {
  const reporter = new OpsFailureReporter("https://ops.example", "s".repeat(32), 1000, (async () => ({ ok: false, status: 503 })) as unknown as typeof fetch);
  await assert.rejects(() => reporter.report(row(1)), /503/);
});

test("sweep marks reported rows and retries failures later without blocking the rest", async () => {
  const marked: string[] = [];
  const repo = {
    findUnreportedFailures: async () => [row(1), row(2), row(3)],
    markFailureReported: async (id: string) => void marked.push(id),
  } as unknown as OutboxRepository;
  const res = await reportFailedRows(repo, {
    report: async (r) => {
      if (r.id === "id2") throw new Error("ops down");
    },
  });
  assert.deepEqual(res, { reported: 2, failed: 1 });
  assert.deepEqual(marked, ["id1", "id3"]);
});
