import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import test from "node:test";
import express from "express";
import { FormsService } from "../forms/forms.service";
import { RateLimiter } from "../forms/rate-limit";
import { createFormsRouter } from "./forms";

async function serve(service: FormsService | undefined, limiter?: RateLimiter) {
  const app = express();
  app.use(express.json());
  app.use("/api/public/forms", createFormsRouter(service, limiter));
  const server = app.listen(0);
  const { port } = server.address() as AddressInfo;
  return {
    post: (path: string, body: unknown, headers: Record<string, string> = {}) =>
      fetch(`http://127.0.0.1:${port}/api/public/forms/${path}`, {
        method: "POST",
        headers: { "content-type": "application/json", ...headers },
        body: JSON.stringify(body),
      }),
    close: () => server.close(),
  };
}

const okService = () => new FormsService({ sink: { enqueue: async () => {} } });
const signup = { email: "a@b.co", list: "newsletter" };

test("202 with a reference on success", async () => {
  const s = await serve(okService());
  const res = await s.post("signup", signup);
  assert.equal(res.status, 202);
  const body = (await res.json()) as { reference: string; status: string };
  assert.equal(body.status, "accepted");
  assert.match(body.reference, /^HM-/);
  s.close();
});

test("422 with field errors, 404 for unknown forms", async () => {
  const s = await serve(okService());
  const bad = await s.post("signup", { email: "x", list: "newsletter" });
  assert.equal(bad.status, 422);
  assert.ok(((await bad.json()) as { fields: Record<string, unknown> }).fields.email);
  assert.equal((await s.post("admin", {})).status, 404);
  s.close();
});

test("503 and retryable when the sink fails or no database is configured", async () => {
  const failing = new FormsService({ sink: { enqueue: async () => { throw new Error("down"); } } });
  const a = await serve(failing);
  const res = await a.post("signup", signup);
  assert.equal(res.status, 503);
  assert.equal(((await res.json()) as { retryable: boolean }).retryable, true);
  a.close();
  const b = await serve(undefined);
  assert.equal((await b.post("signup", signup)).status, 503);
  b.close();
});

test("429 with Retry-After per visitor address", async () => {
  const s = await serve(okService(), new RateLimiter());
  const h = { "x-forwarded-for": "9.9.9.9" };
  for (let i = 0; i < 10; i++) assert.equal((await s.post("signup", { ...signup, email: `u${i}@b.co` }, h)).status, 202);
  const limited = await s.post("signup", signup, h);
  assert.equal(limited.status, 429);
  assert.ok(Number(limited.headers.get("retry-after")) > 0);
  assert.equal((await s.post("signup", signup, { "x-forwarded-for": "8.8.8.8" })).status, 202);
  s.close();
});
