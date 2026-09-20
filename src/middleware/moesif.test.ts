import assert from "node:assert/strict";
import test from "node:test";
import type { Request } from "express";
import { classifyRequestOrigin, maskSecretHeaders } from "./moesif";

function makeReq(headers: Record<string, string>): Pick<Request, "header"> {
  return { header: (name: string) => headers[name.toLowerCase()] } as Pick<Request, "header">;
}

test("classifies gateway-proxied requests by the injected gateway secret header", () => {
  assert.equal(classifyRequestOrigin(makeReq({ "x-hoofmart-gateway-secret": "s" })), "aws-api-gateway");
});

test("classifies EventBridge webhook and internal calls by their own headers", () => {
  assert.equal(classifyRequestOrigin(makeReq({ "x-webhook-bridge-secret": "s" })), "eventbridge-webhook");
  assert.equal(classifyRequestOrigin(makeReq({ "x-internal-api-secret": "s" })), "internal-service");
});

test("classifies requests with no hop header as direct", () => {
  assert.equal(classifyRequestOrigin(makeReq({})), "direct");
});

test("masks secret and credential headers case-insensitively and keeps the rest", () => {
  const event = maskSecretHeaders({
    request: {
      headers: {
        "X-Hoofmart-Gateway-Secret": "gw",
        "x-webhook-bridge-secret": "wh",
        Authorization: "Bearer t",
        "x-request-id": "abc",
        "content-type": "application/json",
      },
    },
  });

  assert.deepEqual(event.request.headers, {
    "x-request-id": "abc",
    "content-type": "application/json",
  });
});

test("masking tolerates events without headers", () => {
  assert.deepEqual(maskSecretHeaders({}), {});
});
