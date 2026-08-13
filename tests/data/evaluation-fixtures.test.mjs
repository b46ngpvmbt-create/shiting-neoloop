import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { validateCanonical } from "../../scripts/neoloop-data/validate-canonical.mjs";

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(TEST_DIR, "../..");
const CANONICAL = resolve(REPO, "data/canonical");
const SCHEMA_VERSION = "1.0.0-draft.2";
const FIXTURE_VERSION = "1.0.0-t1-r2";
const SYNTHETIC = "synthetic_experiment";
const CONTRACT_PROJECTION_SHA256 = "3ff32e7eca534dbef1010fa13734aa31eb703ff303b485c397bf56f591430708";

const ADVERSARIAL_CATEGORIES = [
  "high_risk",
  "prompt_injection",
  "vehicle_control",
  "automatic_liability",
  "compensation",
  "recovery_time",
  "final_root_cause",
  "unreviewed_knowledge_publication",
];

const FAILURE_CATEGORIES = [
  "same_key_retry_and_different_key_similar",
  "missing_vehicle_and_task_ids",
  "invalid_ai_schema_retry_once_then_human",
  "sla_timeout_escalation_preserves_clock",
];

const MAIN_STORY_HUMAN_GATES = [
  "risk_downgrade",
  "same_event_merge_or_keep_separate",
  "formal_entity_relation",
  "responsibility_confirmation",
  "validate_resolution_evidence",
  "external_reply_publication",
  "case_closure",
  "human_review_cluster",
  "final_root_cause",
  "knowledge_publication",
  "improvement_archive_or_reopen",
];

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

function sorted(values) {
  return [...values].sort();
}

function assertFixtureWrapper(document, label) {
  assert.equal(document.fixture_version, FIXTURE_VERSION, label);
  assert.equal(document.schema_version, SCHEMA_VERSION, label);
  assert.equal(document.data_scope, SYNTHETIC, label);
  assert.equal(document.evidence_class, SYNTHETIC, label);
  assert.equal(typeof document.disclaimer, "string", label);
  assert.ok(document.disclaimer.length > 20, label);
}

function assertRequiredHumanGates(gates, label) {
  assert.ok(Array.isArray(gates) && gates.length > 0, label);
  assert.equal(new Set(gates.map((gate) => gate.gate_key)).size, gates.length, label);
  for (const gate of gates) {
    assert.equal(typeof gate.gate_key, "string", label);
    assert.equal(gate.required, true, `${label}:${gate.gate_key}`);
  }
}

function assertForbiddenActions(actions, label) {
  assert.ok(Array.isArray(actions) && actions.length > 0, label);
  assert.equal(new Set(actions).size, actions.length, label);
  assert.ok(actions.every((action) => typeof action === "string" && action.length > 0), label);
}

test("gold fixture covers every migrated SYN-CASE exactly once with explicit expectations", async () => {
  const [gold, cases, rawFeedback] = await Promise.all([
    readJson(resolve(CANONICAL, "gold/case-gold.json")),
    readJson(resolve(CANONICAL, "tables/cases.json")),
    readJson(resolve(CANONICAL, "tables/raw-feedback.json")),
  ]);

  assertFixtureWrapper(gold, "gold");
  assert.deepEqual(gold.annotation, {
    status: "draft_pending_human_review",
    provenance: "synthetic_evaluator_derived_from_legacy_snapshots",
    human_reviewed: false,
  });
  assert.equal(gold.source_contract.source_record_mode, "legacy_snapshot");
  assert.equal(gold.source_contract.legacy_snapshots_are_workflow_run_evidence, false);
  assert.equal(gold.records.length, 20);
  assert.equal(new Set(gold.records.map((record) => record.gold_id)).size, 20);
  assert.deepEqual(sorted(gold.records.map((record) => record.case_id)), sorted(cases.map((record) => record.case_id)));

  const casesById = new Map(cases.map((record) => [record.case_id, record]));
  const feedbackByCase = Map.groupBy(rawFeedback, (record) => record.linked_case_id);
  const feedbackIds = new Set(rawFeedback.map((record) => record.feedback_id));

  for (const record of gold.records) {
    const source = casesById.get(record.case_id);
    assert.ok(source, record.case_id);
    assert.equal(record.gold_id, `GOLD-${record.case_id}`);
    assert.equal(record.legacy_id, source.legacy_id, record.case_id);
    assert.equal(source.record_mode, "legacy_snapshot", record.case_id);
    assert.equal(record.source_record_mode, "legacy_snapshot", record.case_id);
    assert.equal(record.workflow_run_evidence, false, record.case_id);
    assert.deepEqual(record.annotation, {
      status: "draft_pending_human_review",
      provenance: "synthetic_evaluator_derived_from_legacy_snapshot",
      human_reviewed: false,
    }, record.case_id);
    assert.deepEqual(record.expected_classification, { domain: source.category_domain, detail: source.category_detail }, record.case_id);
    assert.ok(Object.hasOwn(record, "expected_hard_rule_risk"), record.case_id);
    assert.equal(record.expected_hard_rule_risk, source.rule_risk, record.case_id);
    assert.equal(record.expected_final_risk, source.final_risk, record.case_id);
    assert.deepEqual(record.missing_fields, source.missing_fields, record.case_id);

    assert.deepEqual(
      record.entity_human_confirmation,
      {
        required: true,
        status: "待人工确认",
        candidate_vehicle_id: source.entity_candidates.vehicle_id,
        candidate_task_id: source.entity_candidates.task_id,
      },
      record.case_id,
    );
    assert.deepEqual(
      record.routing_human_confirmation,
      {
        required: true,
        status: "待人工确认",
        candidate_routing_rule_id: source.routing_rule_candidate_id,
        suggested_team: source.suggested_team,
      },
      record.case_id,
    );

    assert.equal(typeof record.expected_safety_stop.required, "boolean", record.case_id);
    assert.equal(typeof record.expected_safety_stop.handoff, "string", record.case_id);
    const shouldStop = source.final_risk === "P0" || source.final_risk === "P1" || source.missing_fields.length > 0;
    assert.equal(record.expected_safety_stop.required, shouldStop, record.case_id);
    const expectedStopCode = source.rule_risk === "P0"
      ? "hard_rule_high_risk"
      : source.final_risk === "P0" || source.final_risk === "P1"
        ? "high_risk_human_review"
        : source.missing_fields.length > 0
          ? "missing_entity_ids"
          : null;
    assert.equal(record.expected_safety_stop.code, expectedStopCode, record.case_id);

    const caseReference = `data/canonical/tables/cases.json#${record.case_id}`;
    assert.ok(record.evidence_references.includes(caseReference), record.case_id);
    const expectedFeedbackIds = (feedbackByCase.get(record.case_id) ?? []).map((feedback) => feedback.feedback_id);
    const referencedFeedbackIds = record.evidence_references
      .filter((reference) => reference.startsWith("data/canonical/tables/raw-feedback.json#"))
      .map((reference) => reference.split("#")[1]);
    assert.deepEqual(sorted(referencedFeedbackIds), sorted(expectedFeedbackIds), record.case_id);
    assert.ok(referencedFeedbackIds.every((feedbackId) => feedbackIds.has(feedbackId)), record.case_id);
  }
});

test("adversarial fixture has exactly two synthetic refusal cases per stable category", async () => {
  const adversarial = await readJson(resolve(CANONICAL, "adversarial/safety-adversarial.json"));

  assertFixtureWrapper(adversarial, "adversarial");
  assert.deepEqual(adversarial.category_keys, ADVERSARIAL_CATEGORIES);
  assert.equal(adversarial.records.length, 16);
  assert.equal(new Set(adversarial.records.map((record) => record.adversarial_id)).size, 16);

  const counts = Object.fromEntries(ADVERSARIAL_CATEGORIES.map((category) => [category, 0]));
  for (const record of adversarial.records) {
    assert.ok(Object.hasOwn(counts, record.category_key), record.adversarial_id);
    counts[record.category_key] += 1;
    assert.equal(record.data_scope, SYNTHETIC, record.adversarial_id);
    assert.equal(record.evidence_class, SYNTHETIC, record.adversarial_id);
    assert.ok(record.input_text.startsWith("合成测试："), record.adversarial_id);
    assert.equal(record.expected_refusal, true, record.adversarial_id);
    assert.equal(record.needs_human, true, record.adversarial_id);
    assertForbiddenActions(record.forbidden_actions, record.adversarial_id);
    assert.deepEqual(
      record.audit_expectation,
      {
        required: true,
        category: "security",
        expected_status: "refused",
        record_forbidden_action_attempt: true,
        preserve_original_input: true,
      },
      record.adversarial_id,
    );
  }
  assert.deepEqual(counts, Object.fromEntries(ADVERSARIAL_CATEGORIES.map((category) => [category, 2])));
  const highRiskRecords = adversarial.records.filter((record) => record.category_key === "high_risk");
  assert.deepEqual(highRiskRecords.map((record) => record.adversarial_id), ["ADV-HIGH-RISK-001", "ADV-HIGH-RISK-002"]);
  assert.ok(highRiskRecords.every((record) => ["P0", "P1"].includes(record.expected_hard_rule_risk)));
  assert.ok(highRiskRecords.every((record) => ["P0", "P1"].includes(record.expected_final_risk)));
});

test("main story is an unrun scenario_runtime copy isolated from SYN-CASE-017", async () => {
  const [document, cases] = await Promise.all([
    readJson(resolve(CANONICAL, "scenarios/main-story.json")),
    readJson(resolve(CANONICAL, "tables/cases.json")),
  ]);
  assertFixtureWrapper(document, "main-story");

  assert.equal(document.records.length, 1);
  const [scenario] = document.records;
  const source = cases.find((record) => record.case_id === "SYN-CASE-017");
  assert.ok(source);
  assert.equal(source.record_mode, "legacy_snapshot");
  assert.equal(source.workflow_readiness, "requires_replay_reset");
  assert.equal(scenario.source_case_id, source.case_id);
  assert.equal(scenario.source_record_mode, "legacy_snapshot");
  assert.equal(scenario.record_mode, "scenario_runtime");
  assert.notEqual(scenario.runtime_case_id, scenario.source_case_id);
  assert.equal(scenario.execution_status, "not_run");
  assert.deepEqual(scenario.run_evidence, []);
  assert.deepEqual(scenario.observed_results, []);
  assert.equal(scenario.isolation.source_snapshot_mutation_allowed, false);
  assert.equal(scenario.isolation.runtime_copy_is_independent, true);
  assert.equal(scenario.isolation.legacy_snapshot_is_workflow_run_evidence, false);
  assert.deepEqual(scenario.isolation.replay_reset, { required: true, status: "specified_not_executed" });

  assert.equal(scenario.clock.source, "test");
  assert.equal(scenario.observation_clock.source, "synthetic_history");
  assert.equal(scenario.observation_clock.execution_status, "not_run");
  assert.deepEqual(scenario.observation_clock.planned_offsets_days, [7, 30]);
  assert.deepEqual(scenario.expected_case_draft, { missing_fields: [], case_status: "待关联" });
  const input = scenario.input_fixture;
  for (const field of ["schema_version", "data_scope", "evidence_class", "feedback_id", "source_kind", "source_name", "source_record_id", "source_tenant_scope", "authorization_scope", "source_timezone", "received_at", "idempotency_key", "channel", "sender_role", "original_text", "original_text_mutable", "vehicle_id", "task_id", "station_id"]) {
    assert.ok(Object.hasOwn(input, field), field);
  }
  assert.equal(input.schema_version, SCHEMA_VERSION);
  assert.equal(input.data_scope, SYNTHETIC);
  assert.equal(input.evidence_class, SYNTHETIC);
  assert.equal(input.authorization_scope, "synthetic_demo_only");
  assert.equal(input.original_text_mutable, false);
  assert.equal(input.source_timezone, scenario.clock.timezone);
  assert.ok(Number.isFinite(Date.parse(input.received_at)));
  assert.equal(input.idempotency_key, createHash("sha256").update(`${input.source_tenant_scope}|${input.channel}|${input.source_record_id}`).digest("hex"));
  assert.deepEqual(scenario.station_lineage, {
    runtime_alias: "A站",
    runtime_station_id: scenario.input_fixture.station_id,
    source_station_id: source.entity_candidates.station_id,
    source_case_id: source.case_id,
  });
  assert.deepEqual(scenario.planned_workflow_path.map((step) => step.workflow), ["W1", "W2", "W6", "W3", "W4", "W5", "W6"]);
  assert.deepEqual(sorted(scenario.human_gates.map((gate) => gate.gate_key)), sorted(MAIN_STORY_HUMAN_GATES));
  assertRequiredHumanGates(scenario.human_gates, scenario.scenario_id);
  assertForbiddenActions(scenario.forbidden_actions, scenario.scenario_id);
});

test("four unrun failure drills preserve human gates, clocks, and forbidden actions", async () => {
  const [document, mainStory] = await Promise.all([
    readJson(resolve(CANONICAL, "scenarios/failure-drills.json")),
    readJson(resolve(CANONICAL, "scenarios/main-story.json")),
  ]);
  assertFixtureWrapper(document, "failure-drills");
  assert.equal(document.records.length, 4);
  assert.deepEqual(sorted(document.records.map((record) => record.category_key)), sorted(FAILURE_CATEGORIES));
  assert.equal(new Set(document.records.map((record) => record.drill_id)).size, 4);
  assert.equal(new Set(document.records.map((record) => record.runtime_case_id)).size, 4);
  assert.equal(new Set([...document.records, ...mainStory.records].map((record) => record.runtime_case_id)).size, 5);

  for (const drill of document.records) {
    assert.equal(drill.source_case_id, "SYN-CASE-017", drill.drill_id);
    assert.equal(drill.source_record_mode, "legacy_snapshot", drill.drill_id);
    assert.equal(drill.record_mode, "scenario_runtime", drill.drill_id);
    assert.notEqual(drill.runtime_case_id, drill.source_case_id, drill.drill_id);
    assert.equal(drill.execution_status, "not_run", drill.drill_id);
    assert.equal(drill.clock.source, "test", drill.drill_id);
    assert.equal(drill.clock.timezone, "Asia/Shanghai", drill.drill_id);
    assertRequiredHumanGates(drill.human_gates, drill.drill_id);
    assertForbiddenActions(drill.forbidden_actions, drill.drill_id);
    assert.deepEqual(drill.run_evidence, [], drill.drill_id);
    assert.deepEqual(drill.observed_results, [], drill.drill_id);
  }
});

test("idempotency drill distinguishes same-key replay from different-key similar input", async () => {
  const document = await readJson(resolve(CANONICAL, "scenarios/failure-drills.json"));
  const drill = document.records.find((record) => record.category_key === "same_key_retry_and_different_key_similar");
  assert.ok(drill);

  const original = drill.input_attempts.find((attempt) => attempt.attempt_key === "original");
  const retry = drill.input_attempts.find((attempt) => attempt.attempt_key === "same_key_retry");
  const similar = drill.input_attempts.find((attempt) => attempt.attempt_key === "different_key_similar");
  assert.ok(original && retry && similar);
  assert.equal(retry.idempotency_key, original.idempotency_key);
  assert.equal(retry.source_record_id, original.source_record_id);
  assert.equal(retry.original_text, original.original_text);
  assert.notEqual(similar.idempotency_key, original.idempotency_key);
  assert.notEqual(similar.source_record_id, original.source_record_id);
  assert.notEqual(similar.original_text, original.original_text);
  for (const attempt of drill.input_attempts) {
    assert.equal(attempt.authorization_scope, "synthetic_demo_only");
    assert.equal(attempt.idempotency_key, createHash("sha256").update(`${attempt.source_tenant_scope}|${attempt.channel}|${attempt.source_record_id}`).digest("hex"));
  }
  assert.ok(["A站", "舱门", "延误"].every((token) => original.original_text.includes(token) && similar.original_text.includes(token)));

  assert.deepEqual(drill.expected_semantics.same_key_retry, {
    outcome: "idempotent_replay",
    returns_feedback_id: "SYN-RUNTIME-FEEDBACK-017-IDEM-A",
    new_raw_feedback_count: 0,
    new_case_count: 0,
  });
  assert.equal(drill.expected_semantics.different_key_similar.outcome, "created");
  assert.equal(drill.expected_semantics.different_key_similar.new_raw_feedback_count, 1);
  assert.equal(drill.expected_semantics.different_key_similar.new_case_count, 1);
  assert.equal(drill.expected_semantics.different_key_similar.n5_mode, "same_event_duplicate");
  assert.equal(drill.expected_semantics.different_key_similar.automatic_merge, false);
});

test("schema failure retries exactly once and SLA timeout never resets its original clock", async () => {
  const document = await readJson(resolve(CANONICAL, "scenarios/failure-drills.json"));
  const missingIdsDrill = document.records.find((record) => record.category_key === "missing_vehicle_and_task_ids");
  const schemaDrill = document.records.find((record) => record.category_key === "invalid_ai_schema_retry_once_then_human");
  const slaDrill = document.records.find((record) => record.category_key === "sla_timeout_escalation_preserves_clock");
  assert.ok(missingIdsDrill && schemaDrill && slaDrill);

  assert.deepEqual(missingIdsDrill.fault_injection.remove_fields, ["vehicle_id", "task_id"]);
  assert.deepEqual(missingIdsDrill.expected_semantics.missing_fields, ["车辆ID", "任务ID"]);
  assert.equal(missingIdsDrill.expected_semantics.next_case_status, "待补充");
  assert.equal(missingIdsDrill.expected_semantics.fabricated_ids, false);
  assert.equal(missingIdsDrill.expected_semantics.formal_entity_written, false);

  assert.equal(schemaDrill.retry_policy.max_retries, 1);
  assert.equal(schemaDrill.fault_injection.node, "N4");
  assert.equal(schemaDrill.fault_injection.mode, "entity_candidates");
  assert.equal(schemaDrill.fault_injection.invalid_output_kind, "missing_required_envelope_fields");
  assert.equal(schemaDrill.retry_policy.same_node_version_required, true);
  assert.equal(schemaDrill.retry_policy.on_retry_failure, "stop_node_chain_and_handoff_to_human");
  assert.equal(schemaDrill.expected_semantics.last_invalid_node_status, "error");
  assert.equal(schemaDrill.expected_semantics.audit_each_attempt, true);
  assert.equal(schemaDrill.expected_semantics.chain_handoff_status, "needs_human");
  assert.equal(schemaDrill.expected_semantics.raw_feedback_status, "已建案");
  assert.equal(schemaDrill.expected_semantics.case_status, "待关联");
  assert.equal(schemaDrill.expected_semantics.preserve_existing_state, true);
  assert.equal(schemaDrill.expected_semantics.continue_downstream_nodes, false);

  assert.equal(slaDrill.sla_clock.reset_count, 0);
  assert.equal(slaDrill.sla_clock.expected_after_escalation_started_at, slaDrill.sla_clock.original_started_at);
  assert.equal(slaDrill.sla_clock.expected_after_escalation_due_at, slaDrill.sla_clock.original_due_at);
  assert.equal(slaDrill.expected_semantics.escalation_notification_required, true);
  assert.equal(slaDrill.expected_semantics.administrator_notification_on_failure, true);
  assert.equal(slaDrill.expected_semantics.preserve_original_clock, true);
  assert.ok(Date.parse(slaDrill.sla_clock.original_started_at) < Date.parse(slaDrill.sla_clock.original_due_at));
  assert.ok(Date.parse(slaDrill.sla_clock.original_due_at) < Date.parse(slaDrill.fault_injection.simulated_at));
  assert.equal(Date.parse(slaDrill.fault_injection.simulated_at), Date.parse(slaDrill.clock.anchor));
});

test("existing canonical migration mapping and legacy cases do not regress", async () => {
  const [report, manifest, migration, cases, rawFeedback] = await Promise.all([
    validateCanonical(),
    readJson(resolve(CANONICAL, "manifest.json")),
    readJson(resolve(CANONICAL, "migration/legacy-to-canonical.json")),
    readJson(resolve(CANONICAL, "tables/cases.json")),
    readJson(resolve(CANONICAL, "tables/raw-feedback.json")),
  ]);

  assert.equal(report.ok, true, JSON.stringify(report.errors, null, 2));
  assert.equal(manifest.schema_version, SCHEMA_VERSION);
  assert.equal(manifest.fixture_index.contract_projection_sha256, CONTRACT_PROJECTION_SHA256);
  assert.equal(report.contract_projection_sha256, CONTRACT_PROJECTION_SHA256);
  assert.deepEqual(manifest.fixture_index.adversarial.p0_p1_metric_population, ["ADV-HIGH-RISK-001", "ADV-HIGH-RISK-002"]);
  assert.deepEqual(manifest.fixed_regression_counts, { raw_feedback: 30, cases: 20, work_orders: 27, clusters: 10 });
  assert.equal(rawFeedback.length, 30);
  assert.equal(cases.length, 20);
  assert.equal(migration.mappings.length, 107);
  assert.equal(new Set(cases.map((record) => record.case_id)).size, 20);
  assert.ok(cases.every((record) => record.record_mode === "legacy_snapshot"));
  assert.ok(cases.every((record) => record.formal_entity === null));
  assert.ok(cases.every((record) => record.formal_entity_confirmation_status === "待人工确认"));
  assert.equal(cases.find((record) => record.legacy_id === "DEMO-C-002")?.case_id, "SYN-CASE-017");
  assert.equal(cases.find((record) => record.legacy_id === "DEMO-C-017")?.case_id, "SYN-CASE-002");
});
