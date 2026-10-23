import assert from "node:assert/strict";
import test from "node:test";
import { buildFormEventId, submissionReference } from "./event-id";
import { FormsService, type FormEventInput } from "./forms.service";
import { RateLimiter } from "./rate-limit";
import { createTurnstile } from "./turnstile";

const NOW = new Date("2026-10-23T12:00:00Z");

function setup(opts: { turnstile?: ConstructorParameters<typeof FormsService>[0]["turnstile"]; fail?: boolean } = {}) {
  const events: FormEventInput[] = [];
  const service = new FormsService({
    sink: {
      async enqueue(e) {
        if (opts.fail) throw new Error("db down");
        events.push(e);
      },
    },
    turnstile: opts.turnstile,
    now: () => NOW,
  });
  return { service, events };
}

const contact = { name: " Ada ", email: "Ada@Example.COM ", message: "Interested in a partnership." };

test("accepts a contact request, normalizes it, and enqueues a created event", async () => {
  const { service, events } = setup();
  const res = await service.submit("contact", contact);
  assert.equal(res.ok, true);
  assert.equal(events.length, 1);
  const e = events[0]!;
  assert.equal(e.detailType, "contact_request.created");
  assert.equal(e.eventId, buildFormEventId("contact_request", (res as { reference: string }).reference));
  assert.equal(e.payload.email, "ada@example.com");
  assert.equal(e.payload.name, "Ada");
  assert.equal(e.payload.topic, "general");
  assert.equal(e.payload.publicId, (res as { reference: string }).reference);
  assert.ok(!("website" in e.payload) && !("turnstileToken" in e.payload));
});

test("rejects invalid and unknown fields", async () => {
  const { service, events } = setup();
  const bad = await service.submit("contact", { ...contact, email: "nope" });
  assert.equal(bad.ok, false);
  assert.ok(bad.ok === false && bad.reason === "validation" && bad.fields.email);
  const extra = await service.submit("contact", { ...contact, role: "admin" });
  assert.equal(extra.ok, false);
  const short = await service.submit("contact", { ...contact, message: "hi" });
  assert.equal(short.ok, false);
  assert.equal(events.length, 0);
});

test("a duplicate submission gets the same reference and event id", async () => {
  const { service, events } = setup();
  const a = await service.submit("contact", contact);
  const b = await service.submit("contact", { ...contact, email: "ada@example.com" });
  assert.deepEqual(a, b);
  assert.equal(events[0]!.eventId, events[1]!.eventId);
});

test("inquiry references change by day, signups never do", () => {
  const f = { email: "a@b.co", message: "hello there friend" };
  const d1 = submissionReference("contact", f, new Date("2026-10-23T01:00:00Z"));
  const d2 = submissionReference("contact", f, new Date("2026-10-24T01:00:00Z"));
  assert.notEqual(d1, d2);
  const s = { email: "a@b.co", list: "newsletter" };
  assert.equal(
    submissionReference("signup", s, new Date("2026-10-23T01:00:00Z")),
    submissionReference("signup", s, new Date("2027-01-01T01:00:00Z")),
  );
  assert.notEqual(
    submissionReference("signup", s, NOW),
    submissionReference("signup", { ...s, list: "waitlist" }, NOW),
  );
  assert.match(d1, /^HM-[0-9A-HJKMNP-TV-Z]{10}$/);
});

test("honeypot hits look accepted but store nothing", async () => {
  const { service, events } = setup();
  const res = await service.submit("signup", { email: "bot@x.co", list: "newsletter", website: "http://spam" });
  assert.equal(res.ok, true);
  assert.equal(events.length, 0);
});

test("propagates a sink failure so nothing is confirmed", async () => {
  const { service } = setup({ fail: true });
  await assert.rejects(() => service.submit("contact", contact), /db down/);
});

test("turnstile is required when configured", async () => {
  const turnstile = { verify: async (t?: string) => t === "good" };
  const { service, events } = setup({ turnstile });
  assert.deepEqual(await service.submit("signup", { email: "a@b.co", list: "waitlist" }), { ok: false, reason: "captcha" });
  const ok = await service.submit("signup", { email: "a@b.co", list: "waitlist", turnstileToken: "good" });
  assert.equal(ok.ok, true);
  assert.equal(events.length, 1);
});

test("turnstile verifier fails closed", async () => {
  const mk = (impl: typeof fetch) => createTurnstile("secret", impl);
  const json = (b: unknown, ok = true) => (async () => ({ ok, json: async () => b })) as unknown as typeof fetch;
  assert.equal(await mk(json({ success: true })).verify("t"), true);
  assert.equal(await mk(json({ success: false })).verify("t"), false);
  assert.equal(await mk(json({}, false)).verify("t"), false);
  assert.equal(await mk((async () => { throw new Error("net"); }) as typeof fetch).verify("t"), false);
  assert.equal(await mk(json({ success: true })).verify(undefined), false);
});

test("rate limiter blocks past the limit and resets after the window", () => {
  let t = 0;
  const rl = new RateLimiter(() => t);
  const rule = { limit: 2, windowMs: 1000 };
  assert.equal(rl.check("k", rule), 0);
  assert.equal(rl.check("k", rule), 0);
  assert.ok(rl.check("k", rule) > 0);
  assert.equal(rl.check("other", rule), 0);
  t = 1001;
  assert.equal(rl.check("k", rule), 0);
});
