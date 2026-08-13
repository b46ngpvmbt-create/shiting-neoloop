import assert from "node:assert/strict";
import test from "node:test";

import {
  importBuilt,
  MemoryNonceStore,
  MemoryRepository,
  sampleIngestRequest,
  SequenceIds,
} from "./_runtime.mjs";

const { TestClock } = await importBuilt("src/neoloop/domain/test-clock.js");
const { handleOpenApiIngest } = await importBuilt("services/openapi-ingest/handler.js");
const { signRequest } = await importBuilt("services/openapi-ingest/security.js");

const secret = "synthetic-test-secret-32-bytes-minimum-value";

function body(overrides = {}) {
  const wireBody = sampleIngestRequest(overrides);
  delete wireBody.idempotency_key;
  return JSON.stringify(wireBody);
}

function dependencies() {
  return {
    hmacSecret: secret,
    nonces: new MemoryNonceStore(),
    repository: new MemoryRepository(),
    ids: new SequenceIds(),
    clock: new TestClock("2026-08-01T02:00:00.000Z"),
  };
}

function signedRequest(rawBody, { nonce, idempotencyKey, timestamp = "1785549600", signature } = {}) {
  const resolvedNonce = nonce ?? "synthetic_nonce_0001";
  const resolvedKey = idempotencyKey ?? "synthetic-form:SYN-SOURCE-017";
  const resolvedSignature = signature ?? signRequest(secret, {
    timestamp,
    nonce: resolvedNonce,
    idempotencyKey: resolvedKey,
    rawBody,
  });

  return new Request("https://internal.example/v1/feedback", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-neoloop-timestamp": timestamp,
      "x-neoloop-nonce": resolvedNonce,
      "x-neoloop-signature": resolvedSignature,
      "idempotency-key": resolvedKey,
    },
    body: rawBody,
  });
}

test("signed OpenAPI request creates synthetic feedback without any Feishu connection", async () => {
  const deps = dependencies();
  const response = await handleOpenApiIngest(signedRequest(body()), deps);
  const result = await response.json();

  assert.equal(response.status, 201);
  assert.equal(result.outcome, "created");
  assert.match(result.feedback_id, /^SYN-FEEDBACK-/);
  assert.equal(deps.repository.records.size, 1);
});

test("new nonce plus same key/content is idempotent; changed content conflicts", async () => {
  const deps = dependencies();
  const sameBody = body();
  await handleOpenApiIngest(signedRequest(sameBody, { nonce: "synthetic_nonce_0001" }), deps);

  const replay = await handleOpenApiIngest(
    signedRequest(sameBody, { nonce: "synthetic_nonce_0002" }),
    deps,
  );
  assert.equal(replay.status, 200);
  assert.equal((await replay.json()).outcome, "idempotent_replay");

  const changedBody = body({ original_text: "同键下不同事件，不得覆盖。" });
  const conflict = await handleOpenApiIngest(
    signedRequest(changedBody, { nonce: "synthetic_nonce_0003" }),
    deps,
  );
  assert.equal(conflict.status, 409);
  assert.equal((await conflict.json()).error, "idempotency_conflict");
  assert.equal(deps.repository.records.size, 1);
});

test("security contract rejects nonce replay, stale requests, and bad signatures", async () => {
  const deps = dependencies();
  const rawBody = body();
  const first = signedRequest(rawBody, { nonce: "synthetic_nonce_0101" });
  const replay = signedRequest(rawBody, { nonce: "synthetic_nonce_0101" });

  assert.equal((await handleOpenApiIngest(first, deps)).status, 201);
  const replayResponse = await handleOpenApiIngest(replay, deps);
  assert.equal(replayResponse.status, 401);
  assert.equal((await replayResponse.json()).error, "nonce_replay");

  const stale = await handleOpenApiIngest(
    signedRequest(rawBody, { nonce: "synthetic_nonce_0102", timestamp: "1785549000" }),
    deps,
  );
  assert.equal(stale.status, 401);
  assert.equal((await stale.json()).error, "request_expired");

  const invalid = await handleOpenApiIngest(
    signedRequest(rawBody, {
      nonce: "synthetic_nonce_0103",
      signature: `sha256=${"0".repeat(64)}`,
    }),
    deps,
  );
  assert.equal(invalid.status, 401);
  assert.equal((await invalid.json()).error, "invalid_signature");
});

test("v1 ingest rejects every non-synthetic data scope", async () => {
  const deps = dependencies();
  const rawBody = body({ data_scope: "enterprise_real" });
  const response = await handleOpenApiIngest(
    signedRequest(rawBody, { nonce: "synthetic_nonce_0201" }),
    deps,
  );
  const result = await response.json();

  assert.equal(response.status, 400);
  assert.equal(result.error, "invalid_request");
  assert.equal(result.message, "Unsupported data_scope for this schema_version");
  assert.equal(deps.repository.records.size, 0);
});
