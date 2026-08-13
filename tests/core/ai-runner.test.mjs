import assert from "node:assert/strict";
import test from "node:test";

import {
  importBuilt,
  MemoryAuditSink,
  n1Candidate,
  n2Candidate,
  n3Candidate,
  SequenceIds,
} from "./_runtime.mjs";

const ORIGINAL_TEXT = "A 站取货时舱门连续两次无法解锁，任务已经延误。";
const OWNER_FIRST_N1_FIXTURE = Object.freeze({
  feedback_id: "SYN-FEEDBACK-029",
  original_text: "DEMO-X3-205 昨天的历史视频一直没有通过站点Wi-Fi回传。",
});
const N1_CANDIDATE_KEYS = ["payload", "evidence_spans", "missing_fields", "confidence", "status"];
const AUTHORITATIVE_ENVELOPE_KEYS = [
  "node",
  "mode",
  "version",
  "run_id",
  "object_ref",
  "input_hash",
  "payload",
  "evidence_spans",
  "missing_fields",
  "confidence",
  "status",
  "validation",
  "retry_count",
  "human_revision",
];
const clock = {
  source: "test",
  now: () => new Date("2026-08-01T02:00:00.000Z"),
};

function ownerFirstN1Request() {
  return {
    node: "N1",
    mode: "default",
    version: "N1-1.0.0-draft.2",
    object_ref: { object_type: "raw_feedback", object_id: OWNER_FIRST_N1_FIXTURE.feedback_id },
    input: {
      original_text: OWNER_FIRST_N1_FIXTURE.original_text,
      channel_metadata: { channel: "运维工单" },
    },
  };
}

function ownerFirstN1Candidate() {
  return n1Candidate(OWNER_FIRST_N1_FIXTURE.original_text, {
    source_ref: OWNER_FIRST_N1_FIXTURE.feedback_id,
    entity_clues: {
      vehicle_ids: ["DEMO-X3-205"],
      task_ids: [],
      station_names: [],
    },
  });
}

function nodeRequest(node) {
  const common = {
    node,
    mode: "default",
    version: `${node}-1.0.0-draft.2`,
    object_ref: { object_type: "raw_feedback", object_id: "SYN-FEEDBACK-001" },
  };
  if (node === "N1") {
    return { ...common, input: { original_text: ORIGINAL_TEXT, channel_metadata: { channel: "synthetic-form" } } };
  }
  if (node === "N2") {
    return {
      ...common,
      input: {
        n1_output: n1Candidate(ORIGINAL_TEXT).payload,
        taxonomy: {
          domains: ["车辆运维"],
          subcategories: { "车辆运维": ["舱门解锁异常"] },
          tags: ["舱门", "延误"],
        },
        taxonomy_version: "taxonomy-synthetic-v1",
      },
    };
  }
  return {
    ...common,
    input: {
      original_text: ORIGINAL_TEXT,
      n1_output: n1Candidate(ORIGINAL_TEXT).payload,
      hard_rule_result: { risk_level: "P2", rule_version: "hard-rule-synthetic-v1" },
    },
  };
}

function candidateFor(node) {
  if (node === "N1") return n1Candidate(ORIGINAL_TEXT);
  if (node === "N2") return n2Candidate();
  return n3Candidate(ORIGINAL_TEXT);
}

async function harness(scripts, dataScope = "synthetic_experiment") {
  const { AuditedAiNodeRunner, ScriptedAiNodeInvoker } = await importBuilt("src/neoloop/ai/index.js");
  const audit = new MemoryAuditSink();
  const invoker = new ScriptedAiNodeInvoker({ data_scope: dataScope, scripts });
  const runner = new AuditedAiNodeRunner({
    invoker,
    audit,
    clock,
    ids: new SequenceIds(),
    data_scope: dataScope,
  });
  return { audit, invoker, runner };
}

test("offline owner-first N1 synthetic fixture expands an exact-5 candidate into the authoritative 14-key envelope", async () => {
  const { AI_NODE_ENVELOPE_REQUIRED_FIELDS } = await importBuilt("src/neoloop/contracts/model.js");
  const { validateAiNodeEnvelope } = await importBuilt("src/neoloop/contracts/validation.js");
  const candidate = ownerFirstN1Candidate();
  assert.equal(Object.keys(candidate).length, 5);
  assert.deepEqual(Object.keys(candidate).sort(), [...N1_CANDIDATE_KEYS].sort());

  const { audit, invoker, runner } = await harness({
    N1: [{ kind: "return", value: candidate }],
  });
  const result = await runner.run(ownerFirstN1Request());

  assert.equal(Object.keys(result).length, 14);
  assert.deepEqual(Object.keys(result), AUTHORITATIVE_ENVELOPE_KEYS);
  assert.deepEqual(AI_NODE_ENVELOPE_REQUIRED_FIELDS, AUTHORITATIVE_ENVELOPE_KEYS);
  assert.equal(validateAiNodeEnvelope(result).valid, true);
  assert.equal(result.node, "N1");
  assert.equal(result.mode, "default");
  assert.equal(result.version, "N1-1.0.0-draft.2");
  assert.deepEqual(result.object_ref, { object_type: "raw_feedback", object_id: OWNER_FIRST_N1_FIXTURE.feedback_id });
  assert.deepEqual(result.payload.entity_clues.vehicle_ids, ["DEMO-X3-205"]);
  assert.equal(result.status, "ok");
  assert.equal(result.retry_count, 0);
  assert.equal(invoker.calls.length, 1);
  assert.equal(audit.records.length, 1);
  assert.deepEqual(audit.records[0].payload.envelope, result);
});

test("offline owner-first N1 synthetic malformed-shape analogs stop after two safe audits without aliasing runid", async () => {
  const { validateAiNodeEnvelope } = await importBuilt("src/neoloop/contracts/validation.js");
  const analogRunIds = ["SYNTHETIC-ANALOG-RUNID-001", "SYNTHETIC-ANALOG-RUNID-002"];
  // Local malformed-object analogs only: these are not captured Feishu or provider raw responses.
  const malformedShapeAnalogs = [
    { runid: analogRunIds[0], output: ownerFirstN1Candidate() },
    { runId: analogRunIds[1], data: ownerFirstN1Candidate() },
  ];
  let thirdCandidateExecuted = false;
  const { audit, invoker, runner } = await harness({
    N1: [
      ...malformedShapeAnalogs.map((value) => ({ kind: "return", value })),
      {
        kind: "return",
        value: () => {
          thirdCandidateExecuted = true;
          return ownerFirstN1Candidate();
        },
      },
    ],
  });
  const result = await runner.run(ownerFirstN1Request());

  assert.equal(result.status, "needs_human");
  assert.equal(result.validation.valid, false);
  assert.equal(result.retry_count, 1);
  assert.equal(result.human_revision.state, "pending");
  assert.equal(invoker.calls.length, 2);
  assert.equal(audit.records.length, 2);
  assert.equal(thirdCandidateExecuted, false);
  assert.deepEqual(invoker.calls.map((call) => call.retry_count), [0, 1]);
  assert.ok(invoker.calls.every((call) => call.node === "N1" && call.mode === "default"));
  assert.ok(invoker.calls.every((call) => call.version === "N1-1.0.0-draft.2"));
  assert.equal(invoker.calls[0].input_hash, invoker.calls[1].input_hash);

  const auditEnvelopes = audit.records.map((record) => record.payload.envelope);
  assert.deepEqual(auditEnvelopes.map((envelope) => envelope.status), ["error", "needs_human"]);
  assert.deepEqual(auditEnvelopes.map((envelope) => envelope.retry_count), [0, 1]);
  auditEnvelopes.forEach((envelope, index) => {
    assert.deepEqual(Object.keys(envelope), AUTHORITATIVE_ENVELOPE_KEYS);
    assert.equal(validateAiNodeEnvelope(envelope).valid, true);
    assert.equal(envelope.run_id, invoker.calls[index].run_id);
    assert.notEqual(envelope.run_id, analogRunIds[index]);
    assert.equal(envelope.payload, null);
    assert.deepEqual(envelope.evidence_spans, []);
  });
  assert.ok(auditEnvelopes[0].validation.errors.some((error) => error.includes("candidate.runid")));
  assert.ok(auditEnvelopes[1].validation.errors.some((error) => error.includes("candidate.runId")));

  const serializedAudit = JSON.stringify(audit.records);
  assert.equal(serializedAudit.includes(OWNER_FIRST_N1_FIXTURE.original_text), false);
  for (const analogRunId of analogRunIds) {
    assert.equal(serializedAudit.includes(analogRunId), false);
  }
});

test("runner creates a complete authoritative envelope and audit on first success", async () => {
  const { validateAiNodeEnvelope } = await importBuilt("src/neoloop/contracts/validation.js");
  const { audit, invoker, runner } = await harness({
    N1: [{ kind: "return", value: n1Candidate(ORIGINAL_TEXT) }],
  });
  const result = await runner.run(nodeRequest("N1"));

  assert.equal(result.status, "ok");
  assert.equal(result.retry_count, 0);
  assert.equal(result.node, "N1");
  assert.equal(result.version, "N1-1.0.0-draft.2");
  assert.match(result.input_hash, /^[a-f0-9]{64}$/);
  assert.equal(validateAiNodeEnvelope(result).valid, true);
  assert.equal(invoker.calls.length, 1);
  assert.equal(audit.records.length, 1);
  assert.deepEqual(audit.records[0].payload.envelope, result);
});

test("runner repairs one malformed response with the same node version", async () => {
  const reversedOffsets = n2Candidate({
    candidate: {
      evidence_spans: [{ source_ref: "SYN-FEEDBACK-001", quote: "bad offsets", start_offset: 9, end_offset: 2 }],
    },
  });
  const { audit, invoker, runner } = await harness({
    N2: [
      { kind: "return", value: reversedOffsets },
      { kind: "return", value: n2Candidate() },
    ],
  });
  const result = await runner.run(nodeRequest("N2"));

  assert.equal(result.status, "ok");
  assert.equal(result.retry_count, 1);
  assert.equal(invoker.calls.length, 2);
  assert.equal(invoker.calls[0].version, invoker.calls[1].version);
  assert.equal(invoker.calls[0].input_hash, invoker.calls[1].input_hash);
  assert.notEqual(invoker.calls[0].run_id, invoker.calls[1].run_id);
  assert.deepEqual(audit.records.map((record) => record.payload.envelope.status), ["error", "ok"]);
  assert.deepEqual(audit.records.map((record) => record.payload.envelope.retry_count), [0, 1]);
});

test("runner stops after two malformed responses and routes to a human", async () => {
  const { audit, invoker, runner } = await harness({
    N2: [
      { kind: "return", value: { payload: "not-an-object" } },
      { kind: "return", value: { payload: { still: "wrong" } } },
      { kind: "return", value: n2Candidate() },
    ],
  });
  const result = await runner.run(nodeRequest("N2"));

  assert.equal(result.status, "needs_human");
  assert.equal(result.validation.valid, false);
  assert.equal(result.retry_count, 1);
  assert.equal(result.human_revision.state, "pending");
  assert.equal(invoker.calls.length, 2);
  assert.equal(audit.records.length, 2);
  assert.ok(audit.records.every((record) => record.payload.envelope.validation.errors.length > 0));
});

test("refused output is audited and never relabeled as ok", async () => {
  const refused = {
    payload: null,
    evidence_spans: [],
    missing_fields: [],
    confidence: null,
    status: "refused",
  };
  const { audit, invoker, runner } = await harness({ N1: [{ kind: "return", value: refused }] });
  const result = await runner.run(nodeRequest("N1"));

  assert.equal(result.status, "refused");
  assert.equal(result.human_revision.state, "pending");
  assert.equal(invoker.calls.length, 1);
  assert.equal(audit.records[0].payload.envelope.status, "refused");
});

test("upstream exception is audited once and does not consume schema repair", async () => {
  const { audit, invoker, runner } = await harness({
    N3: [
      { kind: "throw", error: "synthetic upstream unavailable" },
      { kind: "return", value: n3Candidate(ORIGINAL_TEXT) },
    ],
  });
  const result = await runner.run(nodeRequest("N3"));

  assert.equal(result.status, "error");
  assert.equal(result.retry_count, 0);
  assert.match(result.validation.errors[0], /synthetic upstream unavailable/);
  assert.equal(invoker.calls.length, 1);
  assert.equal(audit.records.length, 1);
});

test("scripted fake rejects every data scope except synthetic_experiment", async () => {
  const { ScriptedAiNodeInvoker } = await importBuilt("src/neoloop/ai/index.js");
  assert.throws(
    () => new ScriptedAiNodeInvoker({ data_scope: "public_fact", scripts: {} }),
    /synthetic_experiment/,
  );
});

test("all 18 N1-N3 scripted attempts have one-to-one audit coverage", async () => {
  const { AuditedAiNodeRunner, ScriptedAiNodeInvoker } = await importBuilt("src/neoloop/ai/index.js");
  const { validateAiNodeEnvelope } = await importBuilt("src/neoloop/contracts/validation.js");
  const audit = new MemoryAuditSink();
  const scripts = {};
  for (const node of ["N1", "N2", "N3"]) {
    scripts[node] = [
      { kind: "return", value: candidateFor(node) },
      { kind: "return", value: { malformed: "first" } },
      { kind: "return", value: candidateFor(node) },
      { kind: "return", value: { malformed: "first" } },
      { kind: "return", value: { malformed: "second" } },
      { kind: "throw", error: `${node} synthetic upstream error` },
    ];
  }
  const invoker = new ScriptedAiNodeInvoker({ data_scope: "synthetic_experiment", scripts });
  const runner = new AuditedAiNodeRunner({
    invoker,
    audit,
    clock,
    ids: new SequenceIds(),
    data_scope: "synthetic_experiment",
  });

  for (const node of ["N1", "N2", "N3"]) {
    await runner.run(nodeRequest(node));
    await runner.run(nodeRequest(node));
    await runner.run(nodeRequest(node));
    await runner.run(nodeRequest(node));
  }

  assert.equal(invoker.calls.length, 18);
  assert.equal(audit.records.length, 18);
  const attempted = invoker.calls.map((call) => `${call.node}:${call.run_id}:${call.retry_count}`).sort();
  const audited = audit.records
    .map((record) => record.payload.envelope)
    .map((envelope) => `${envelope.node}:${envelope.run_id}:${envelope.retry_count}`)
    .sort();
  assert.deepEqual(audited, attempted);
  assert.equal(new Set(audited).size, 18);
  assert.equal(audited.length / attempted.length, 1);
  const callByRunId = new Map(invoker.calls.map((call) => [call.run_id, call]));
  for (const record of audit.records) {
    const envelope = record.payload.envelope;
    const call = callByRunId.get(envelope.run_id);
    assert.ok(call);
    assert.equal(envelope.version, call.version);
    assert.equal(envelope.input_hash, call.input_hash);
    assert.deepEqual(envelope.object_ref, call.object_ref);
    assert.equal(validateAiNodeEnvelope(envelope).valid, true);
    assert.match(envelope.input_hash, /^[a-f0-9]{64}$/);
    assert.ok(envelope.validation.errors.every((error) => typeof error === "string"));
    assert.ok(["none", "pending"].includes(envelope.human_revision.state));
  }
});
