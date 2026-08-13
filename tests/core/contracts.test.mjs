import assert from "node:assert/strict";
import test from "node:test";

import { importBuilt } from "./_runtime.mjs";

const contracts = await importBuilt("src/neoloop/contracts/model.js");
const { validateAiNodeEnvelope } = await importBuilt("src/neoloop/contracts/validation.js");

function validAiNodeEnvelope() {
  return {
    node: "N4",
    mode: "default",
    version: "N4-1.0.0-draft.2",
    run_id: "SYN-RUN-001",
    object_ref: { object_type: "case", object_id: "SYN-CASE-017" },
    input_hash: "a".repeat(64),
    payload: { candidates: [] },
    evidence_spans: [{ source_ref: "SYN-FB-017", quote: "舱门连续两次无法解锁" }],
    missing_fields: [],
    confidence: 0.91,
    status: "ok",
    validation: { valid: true, errors: [] },
    retry_count: 0,
    human_revision: { state: "none" },
  };
}

test("fixed evidence, clock, and entity statuses match the approved contract", () => {
  assert.equal(contracts.CANONICAL_SCHEMA_VERSION, "1.0.0-draft.2");
  assert.deepEqual(contracts.DATA_SCOPES, ["synthetic_experiment"]);
  assert.deepEqual(contracts.CANONICAL_TABLE_KEYS, [
    "raw_feedback",
    "cases",
    "work_orders",
    "clusters",
    "improvements",
    "vehicles",
    "delivery_tasks",
    "routing_matrix",
    "knowledge_index",
    "ai_audit",
  ]);
  assert.deepEqual(contracts.RECORD_MODES, ["legacy_snapshot", "scenario_runtime"]);
  assert.deepEqual(contracts.EVIDENCE_CLASSES, [
    "public_fact",
    "enterprise_pending",
    "solution_design",
    "synthetic_experiment",
  ]);
  assert.deepEqual(contracts.CLOCK_SOURCES, ["real", "test", "synthetic_history"]);
  assert.deepEqual(contracts.RAW_FEEDBACK_STATUSES, ["待分诊", "人工处理", "已建案", "已忽略"]);
  assert.deepEqual(contracts.CASE_STATUSES, [
    "待补充",
    "待关联",
    "待派单",
    "处理中",
    "待验证",
    "待回访",
    "已关闭",
    "已合并",
  ]);
  assert.deepEqual(contracts.CLUSTER_STATUSES, ["候选", "待审核", "改进中", "观察中", "已归档", "已驳回"]);
  assert.deepEqual(contracts.WORK_ORDER_STATUSES, ["待接单", "处理中", "待验证", "已完成", "已取消"]);
  assert.deepEqual(contracts.IMPROVEMENT_STATUSES, ["待立项", "执行中", "观察中", "已完成", "已终止"]);
});

test("AI envelope runtime boundary accepts every authoritative field", () => {
  const envelope = validAiNodeEnvelope();

  const result = validateAiNodeEnvelope(envelope);
  assert.equal(result.valid, true);
  assert.deepEqual(contracts.AI_NODE_ENVELOPE_REQUIRED_FIELDS, Object.keys(envelope));
});

test("AI envelope runtime boundary fails closed on unexpected root and nested fields", () => {
  const cases = [
    {
      envelope: { ...validAiNodeEnvelope(), unexpected_root: true },
      expectedError: "unexpected_root is not allowed",
    },
    {
      envelope: {
        ...validAiNodeEnvelope(),
        object_ref: { ...validAiNodeEnvelope().object_ref, unexpected: true },
      },
      expectedError: "object_ref.unexpected is not allowed",
    },
    {
      envelope: {
        ...validAiNodeEnvelope(),
        validation: { ...validAiNodeEnvelope().validation, unexpected: true },
      },
      expectedError: "validation.unexpected is not allowed",
    },
    {
      envelope: {
        ...validAiNodeEnvelope(),
        human_revision: { ...validAiNodeEnvelope().human_revision, unexpected: true },
      },
      expectedError: "human_revision.unexpected is not allowed",
    },
  ];

  for (const { envelope, expectedError } of cases) {
    const result = validateAiNodeEnvelope(envelope);
    assert.equal(result.valid, false);
    assert.ok(result.errors.includes(expectedError));
  }
});

test("AI envelope runtime boundary rejects renamed or missing authoritative fields", () => {
  const result = validateAiNodeEnvelope({
    node: "N4",
    mode: "default",
    version: "N4-1.0.0-draft.2",
    run_id: "SYN-RUN-002",
    object_ref: { object_type: "case", object_id: "SYN-CASE-017" },
    input_hash: "b".repeat(64),
    payload: {},
    evidence_spans: [],
    missing_items: [],
    confidence: 1.2,
    status: "ok",
    schema_validation: { valid: true, errors: [] },
    retry_count: 2,
  });

  assert.equal(result.valid, false);
  assert.ok(result.errors.includes("missing_fields is required"));
  assert.ok(result.errors.includes("validation is required"));
  assert.ok(result.errors.includes("human_revision is required"));
  assert.ok(result.errors.includes("retry_count must be 0 or 1"));
});
