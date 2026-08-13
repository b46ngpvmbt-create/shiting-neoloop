import assert from "node:assert/strict";
import test from "node:test";

import {
  importBuilt,
  MemoryAuditSink,
  sampleIngestRequest,
  SequenceIds,
} from "./_runtime.mjs";

const clock = {
  source: "test",
  now: () => new Date("2026-08-01T02:00:00.000Z"),
};

async function harness() {
  const { InMemoryFrontHalfRepository, runW1 } = await importBuilt("src/neoloop/workflows/index.js");
  const repository = new InMemoryFrontHalfRepository();
  const audit = new MemoryAuditSink();
  const ids = new SequenceIds();
  return {
    audit,
    repository,
    run: (request) => runW1(request, { clock, ids, repository, audit }),
  };
}

test("W1 same key and content returns the existing feedback and audits both attempts", async () => {
  const { audit, repository, run } = await harness();
  const first = await run(sampleIngestRequest());
  const replay = await run(sampleIngestRequest());

  assert.equal(first.status, "completed");
  assert.equal(replay.status, "idempotent");
  assert.equal(replay.object_ref.object_id, first.object_ref.object_id);
  assert.equal(repository.rawFeedbackByKey.size, 1);
  assert.equal(audit.records.filter((record) => record.payload.workflow === "W1").length, 2);
});

test("W1 same key with different content conflicts without overwriting the old record", async () => {
  const { audit, repository, run } = await harness();
  const original = sampleIngestRequest();
  await run(original);
  const conflict = await run(sampleIngestRequest({ original_text: "这是另一个独立事件" }));

  assert.equal(conflict.status, "failed");
  assert.equal(conflict.output.ingest_result.outcome, "idempotency_conflict");
  assert.equal(repository.rawFeedbackByKey.size, 1);
  assert.equal(repository.rawFeedbackByKey.get(original.idempotency_key).request.original_text, original.original_text);
  assert.equal(audit.records.at(-1).payload.result.status, "failed");
});

test("W1 preserves similar text as separate feedback when idempotency keys differ", async () => {
  const { repository, run } = await harness();
  await run(sampleIngestRequest());
  const second = await run(sampleIngestRequest({
    idempotency_key: "competition-synthetic:service-log:SYN-SOURCE-018",
    source_record_id: "SYN-SOURCE-018",
    channel: "service-log",
  }));

  assert.equal(second.status, "completed");
  assert.equal(repository.rawFeedbackByKey.size, 2);
});

test("W1 concurrent inserts create one record and never overwrite the winner", async () => {
  const { audit, repository } = await harness();
  const { InMemoryFrontHalfRepository, runW1 } = await importBuilt("src/neoloop/workflows/index.js");
  const ids = new SequenceIds();
  const ports = { clock, ids, repository, audit };
  const [left, right] = await Promise.all([
    runW1(sampleIngestRequest(), ports),
    runW1(sampleIngestRequest(), ports),
  ]);

  assert.deepEqual(new Set([left.status, right.status]), new Set(["completed", "idempotent"]));
  assert.equal(repository.rawFeedbackByKey.size, 1);
  const stored = repository.rawFeedbackByKey.get(sampleIngestRequest().idempotency_key);
  assert.equal(stored.request.original_text, sampleIngestRequest().original_text);
  assert.equal(audit.records.length, 2);

  const conflictRepository = new InMemoryFrontHalfRepository();
  const conflictAudit = new MemoryAuditSink();
  const conflictIds = new SequenceIds();
  const original = sampleIngestRequest({ idempotency_key: "SYN-CONCURRENT-CONFLICT" });
  const changed = sampleIngestRequest({
    idempotency_key: "SYN-CONCURRENT-CONFLICT",
    original_text: "同键并发的另一条内容",
  });
  const [originalResult, changedResult] = await Promise.all([
    runW1(original, { clock, ids: conflictIds, repository: conflictRepository, audit: conflictAudit }),
    runW1(changed, { clock, ids: conflictIds, repository: conflictRepository, audit: conflictAudit }),
  ]);
  assert.deepEqual(new Set([originalResult.status, changedResult.status]), new Set(["completed", "failed"]));
  const conflictStored = conflictRepository.rawFeedbackByKey.get("SYN-CONCURRENT-CONFLICT");
  const winningText = originalResult.status === "completed" ? original.original_text : changed.original_text;
  assert.equal(conflictStored.request.original_text, winningText);
  assert.equal(conflictRepository.rawFeedbackByKey.size, 1);
});

test("W1 repository failure preserves all old records and writes a failure audit", async () => {
  const { audit, repository, run } = await harness();
  await run(sampleIngestRequest());
  const before = structuredClone([...repository.rawFeedbackByKey.entries()]);
  repository.findRawFeedbackByIdempotencyKey = async () => {
    throw new Error("synthetic repository unavailable");
  };

  const result = await run(sampleIngestRequest({
    idempotency_key: "competition-synthetic:synthetic-form:SYN-SOURCE-999",
    source_record_id: "SYN-SOURCE-999",
  }));

  assert.equal(result.status, "failed");
  assert.match(result.errors[0], /synthetic repository unavailable/);
  assert.deepEqual([...repository.rawFeedbackByKey.entries()], before);
  assert.equal(audit.records.at(-1).payload.result.status, "failed");
});
