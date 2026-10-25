import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import test from "node:test";
import express from "express";
import { createBackgroundWorkersRouter } from "./background-workers";

const SECRET = "s".repeat(32);

async function withServer(fn: (url: string, state: { paused: boolean }) => Promise<void>) {
  const state = { paused: false };
  const worker = { pause: () => { state.paused = true; }, resume: () => { state.paused = false; }, isPaused: () => state.paused };
  const app = express().use("/w", createBackgroundWorkersRouter({ "outbox-drain": worker }, SECRET));
  const server = app.listen(0);
  try {
    await fn(`http://127.0.0.1:${(server.address() as AddressInfo).port}/w`, state);
  } finally {
    server.close();
  }
}

const post = (url: string, secret?: string) =>
  fetch(url, { method: "POST", headers: secret ? { "x-internal-api-secret": secret } : {} });

test("rejects a missing or wrong secret", async () => {
  await withServer(async (url, state) => {
    assert.equal((await post(`${url}/disable`)).status, 401);
    assert.equal((await post(`${url}/disable`, "x".repeat(32))).status, 401);
    assert.equal(state.paused, false);
  });
});

test("disable, status and enable drive the worker", async () => {
  await withServer(async (url, state) => {
    const off = (await (await post(`${url}/disable`, SECRET)).json()) as { workers: unknown };
    assert.deepEqual(off.workers, [{ name: "outbox-drain", paused: true }]);
    assert.equal(state.paused, true);
    assert.deepEqual(((await (await post(`${url}/status`, SECRET)).json()) as { workers: unknown }).workers, [{ name: "outbox-drain", paused: true }]);
    await post(`${url}/enable`, SECRET);
    assert.equal(state.paused, false);
    assert.equal((await post(`${url}/nope`, SECRET)).status, 400);
  });
});
