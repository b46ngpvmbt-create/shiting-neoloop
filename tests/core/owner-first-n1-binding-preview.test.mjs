import assert from "node:assert/strict";
import test from "node:test";

import { importBuilt } from "./_runtime.mjs";

const REPORT_KEYS = [
  "schema_version",
  "classification",
  "attempt_count",
  "candidate_top_level_keys",
  "exact_14_generated",
  "issue_codes",
  "binding",
];
const BINDING_KEYS = [
  "contract_version",
  "algorithm",
  "offset_unit",
  "normalization",
  "status",
  "span_count",
  "source_sha256",
  "candidate_before_sha256",
  "candidate_after_sha256",
  "reason_codes",
];
const CANDIDATE_KEYS = ["payload", "evidence_spans", "missing_fields", "confidence", "status"];

function candidate(originalText, overrides = {}) {
  return {
    payload: {
      fact_spans: [{ fact: originalText, evidence_span_index: 0 }],
      request: originalText,
      request_evidence_span_index: 0,
      entity_clues: {
        vehicle_ids: ["DEMO-X3-205"],
        task_ids: [],
        station_names: [],
      },
      ...overrides.payload,
    },
    evidence_spans: [{ source_ref: "SYN-FEEDBACK-029", quote: originalText }],
    missing_fields: [],
    confidence: overrides.confidence ?? 0.94,
    status: "ok",
    ...overrides.candidate,
  };
}

function assertV2Shape(report) {
  assert.deepEqual(Object.keys(report), REPORT_KEYS);
  assert.deepEqual(Object.keys(report.binding), BINDING_KEYS);
  assert.equal(report.schema_version, "owner_first_n1_preview_report.v2");
  assert.deepEqual(report.candidate_top_level_keys, CANDIDATE_KEYS);
  const serialized = JSON.stringify(report);
  assert.doesNotMatch(serialized, /DEMO-X3-205|历史视频|start_offset|end_offset|provider/u);
}

test("v2 binding preview produces a distinct success classification and exact report", async () => {
  const {
    OWNER_FIRST_N1_FIXTURE,
    createOwnerFirstN1BindingPreviewSession,
  } = await importBuilt("src/neoloop/ai/index.js");
  const session = createOwnerFirstN1BindingPreviewSession();
  const report = await session.submit(candidate(OWNER_FIRST_N1_FIXTURE.original_text));

  assertV2Shape(report);
  assert.equal(report.classification, "candidate_validated_after_deterministic_binding");
  assert.equal(report.attempt_count, 1);
  assert.equal(report.exact_14_generated, true);
  assert.deepEqual(report.issue_codes, []);
  assert.equal(report.binding.status, "bound");
  assert.equal(report.binding.span_count, 1);
  assert.match(report.binding.source_sha256, /^[a-f0-9]{64}$/u);
  assert.match(report.binding.candidate_before_sha256, /^[a-f0-9]{64}$/u);
  assert.match(report.binding.candidate_after_sha256, /^[a-f0-9]{64}$/u);
  assert.deepEqual(report.binding.reason_codes, []);
  assert.deepEqual(session.diagnostics, {
    attempt_count: 1,
    runner_invocation_count: 1,
    audit_count: 1,
    retained_candidate_count: 0,
    disposed: true,
  });
});

test("a refused first binding can be followed by one success without adding a runner call", async () => {
  const {
    OWNER_FIRST_N1_FIXTURE,
    createOwnerFirstN1BindingPreviewSession,
  } = await importBuilt("src/neoloop/ai/index.js");
  const session = createOwnerFirstN1BindingPreviewSession();
  const invalid = candidate(OWNER_FIRST_N1_FIXTURE.original_text, { confidence: 2 });
  const first = await session.submit(invalid);
  assertV2Shape(first);
  assert.equal(first.classification, "needs_human");
  assert.deepEqual(first.issue_codes, ["candidate_invalid_scalar"]);
  assert.equal(first.binding.status, "refused");
  assert.equal(first.binding.candidate_after_sha256, null);
  assert.deepEqual(first.binding.reason_codes, ["binding_input_invalid"]);

  const second = await session.submit(candidate(OWNER_FIRST_N1_FIXTURE.original_text));
  assert.equal(second.classification, "candidate_validated_after_deterministic_binding");
  assert.equal(second.attempt_count, 2);
  assert.deepEqual(session.diagnostics, {
    attempt_count: 2,
    runner_invocation_count: 1,
    audit_count: 1,
    retained_candidate_count: 0,
    disposed: true,
  });
});

test("two refused bindings stop without runner invocation and reject a third candidate", async () => {
  const {
    OWNER_FIRST_N1_FIXTURE,
    createOwnerFirstN1BindingPreviewSession,
  } = await importBuilt("src/neoloop/ai/index.js");
  const session = createOwnerFirstN1BindingPreviewSession();
  const invalid = candidate(OWNER_FIRST_N1_FIXTURE.original_text, { confidence: 2 });
  await session.submit(invalid);
  const second = await session.submit(invalid);

  assert.equal(second.classification, "needs_human");
  assert.equal(second.attempt_count, 2);
  assert.equal(second.exact_14_generated, false);
  assert.deepEqual(session.diagnostics, {
    attempt_count: 2,
    runner_invocation_count: 0,
    audit_count: 0,
    retained_candidate_count: 0,
    disposed: true,
  });
  await assert.rejects(
    session.submit(candidate(OWNER_FIRST_N1_FIXTURE.original_text)),
    /terminal or disposed/u,
  );
});

test("v1 and v2 success classifications remain disjoint", async () => {
  const {
    OWNER_FIRST_N1_FIXTURE,
    createOwnerFirstN1BindingPreviewSession,
    createOwnerFirstN1PreviewSession,
  } = await importBuilt("src/neoloop/ai/index.js");
  const v1Candidate = candidate(OWNER_FIRST_N1_FIXTURE.original_text);
  v1Candidate.evidence_spans[0].start_offset = 0;
  v1Candidate.evidence_spans[0].end_offset = OWNER_FIRST_N1_FIXTURE.original_text.length;
  const v1 = await createOwnerFirstN1PreviewSession().submit(v1Candidate);
  const v2 = await createOwnerFirstN1BindingPreviewSession().submit(
    candidate(OWNER_FIRST_N1_FIXTURE.original_text),
  );

  assert.equal(v1.classification, "exact_candidate_validated");
  assert.deepEqual(Object.keys(v1), [
    "classification",
    "attempt_count",
    "candidate_top_level_keys",
    "exact_14_generated",
    "issue_codes",
  ]);
  assert.equal(v2.classification, "candidate_validated_after_deterministic_binding");
  assertV2Shape(v2);
});
