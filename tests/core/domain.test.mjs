import assert from "node:assert/strict";
import test from "node:test";

import {
  importBuilt,
  MemoryRepository,
  sampleIngestRequest,
  SequenceIds,
} from "./_runtime.mjs";

const {
  createSlaTrackedWorkOrder,
  escalateWorkOrder,
  ingestFeedback,
  InvalidStateTransitionError,
  reassignWorkOrder,
  selectAuthoritativeDecision,
  selectFinalRisk,
  TestClock,
  transitionCase,
} = await importBuilt("src/neoloop/domain/index.js");

function domainPorts() {
  return {
    clock: new TestClock("2026-08-01T02:00:00.000Z"),
    ids: new SequenceIds(),
    repository: new MemoryRepository(),
  };
}

test("same idempotency key and content returns the existing feedback", async () => {
  const ports = domainPorts();
  const first = await ingestFeedback(sampleIngestRequest(), ports);
  const second = await ingestFeedback(sampleIngestRequest(), ports);

  assert.equal(first.outcome, "created");
  assert.equal(second.outcome, "idempotent_replay");
  assert.equal(second.feedback_id, first.feedback_id);
  assert.equal(ports.repository.records.size, 1);
});

test("same idempotency key with different content conflicts without overwrite", async () => {
  const ports = domainPorts();
  const first = await ingestFeedback(sampleIngestRequest(), ports);
  const conflict = await ingestFeedback(sampleIngestRequest({ original_text: "不同的独立事件" }), ports);

  assert.equal(conflict.outcome, "idempotency_conflict");
  assert.equal(conflict.existing_feedback_id, first.feedback_id);
  assert.equal(ports.repository.records.size, 1);
  assert.equal([...ports.repository.records.values()][0].request.original_text, sampleIngestRequest().original_text);
});

test("similar content with a different key remains a separate feedback", async () => {
  const ports = domainPorts();
  await ingestFeedback(sampleIngestRequest(), ports);
  await ingestFeedback(
    sampleIngestRequest({
      idempotency_key: "competition-synthetic:service-log:SYN-SOURCE-018",
      source_record_id: "SYN-SOURCE-018",
      channel: "service-log",
    }),
    ports,
  );
  assert.equal(ports.repository.records.size, 2);
});

test("AI may raise risk but cannot lower a harder rule", () => {
  assert.equal(selectFinalRisk("P1", "P3"), "P1");
  assert.equal(selectFinalRisk("P2", "P0"), "P0");
  assert.deepEqual(
    selectAuthoritativeDecision([
      { source: "ai_suggestion", value: "auto-close" },
      { source: "confirmed_master_data", value: "keep-open" },
      { source: "hard_rule", value: "manual-review" },
    ]),
    { source: "hard_rule", value: "manual-review" },
  );
});

test("case state machine preserves human gates and explicit return paths", () => {
  assert.equal(transitionCase("待关联", "待派单", "authorized_human"), "待派单");
  assert.equal(transitionCase("待验证", "处理中", "workflow"), "处理中");
  assert.throws(
    () => transitionCase("待关联", "待派单", "workflow"),
    InvalidStateTransitionError,
  );
  assert.throws(
    () => transitionCase("待关联", "已关闭", "authorized_human"),
    InvalidStateTransitionError,
  );
});

test("reassignment and escalation never reset the original SLA", () => {
  const original = createSlaTrackedWorkOrder({
    work_order_id: "SYN-WO-001",
    team: "企业车辆运维",
    sla_started_at: "2026-08-01T02:00:00.000Z",
    duration_ms: 60 * 60 * 1000,
    sla_rule_version: "pending-enterprise-v1",
  });
  const reassigned = reassignWorkOrder(original, {
    team: "企业现场运维",
    assignee_id: "SYN-ACTOR-002",
  });

  assert.equal(reassigned.sla_started_at, original.sla_started_at);
  assert.equal(reassigned.due_at, original.due_at);
  assert.equal(reassigned.sla_rule_version, original.sla_rule_version);

  const escalated = escalateWorkOrder(reassigned);
  assert.equal(escalated.sla_started_at, original.sla_started_at);
  assert.equal(escalated.due_at, original.due_at);
  assert.equal(escalated.escalation_level, 1);
});

test("concurrent same-key ingestion creates one record", async () => {
  const ports = domainPorts();
  const [left, right] = await Promise.all([
    ingestFeedback(sampleIngestRequest(), ports),
    ingestFeedback(sampleIngestRequest(), ports),
  ]);

  assert.deepEqual(new Set([left.outcome, right.outcome]), new Set(["created", "idempotent_replay"]));
  assert.equal(ports.repository.records.size, 1);
});

test("test clock is explicit and deterministic", () => {
  const clock = new TestClock("2026-08-01T02:00:00.000Z");
  clock.advance(30 * 24 * 60 * 60 * 1000);
  assert.equal(clock.source, "test");
  assert.equal(clock.now().toISOString(), "2026-08-31T02:00:00.000Z");
});
