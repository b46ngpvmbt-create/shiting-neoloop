import assert from "node:assert/strict";
import test from "node:test";

import {
  importBuilt,
  MemoryAuditSink,
  sampleIngestRequest,
  SequenceIds,
} from "./_runtime.mjs";

const CASE_ID = "SYN-CASE-R3-001";
const FEEDBACK_ID = "SYN-FEEDBACK-R3-001";
const VEHICLE_ID = "SYN-VEHICLE-X6-107";
const TASK_ID = "SYN-TASK-8458";
const STATION_ID = "DEMO-S-YZ";
const HUMAN = {
  type: "authorized_human",
  actor_id: "SYN-HUMAN-REVIEWER-001",
  role: "合成审核角色",
};
const CANONICAL_HUMAN_ROLE = "规范化合成审核角色";

class MutableTestClock {
  source = "test";
  current = new Date("2026-08-01T03:00:00.000Z");

  now() {
    return new Date(this.current);
  }

  set(value) {
    this.current = new Date(value);
  }
}

class QueueAiRunner {
  calls = [];

  constructor(scripts = {}) {
    this.scripts = Object.fromEntries(
      Object.entries(scripts).map(([node, entries]) => [node, [...entries]]),
    );
  }

  async run(request) {
    this.calls.push(structuredClone(request));
    const step = this.scripts[request.node]?.shift();
    if (!step) throw new Error(`No R3 scripted response for ${request.node}`);
    if (step instanceof Error) throw step;
    const response = typeof step === "function" ? await step(request) : structuredClone(step);
    if (response?.input_hash === "AUTO") {
      const { createAiInputHash } = await importBuilt("src/neoloop/ai/index.js");
      response.input_hash = createAiInputHash(request);
    }
    return response;
  }
}

class AllowlistW3ActionAuthorizer {
  calls = [];

  constructor({
    allowed_actor_ids = [HUMAN.actor_id],
    allowed_route_ids = null,
    error = null,
    grant_issuer,
  } = {}) {
    this.allowed_actor_ids = new Set(allowed_actor_ids);
    this.allowed_route_ids = allowed_route_ids === null ? null : new Set(allowed_route_ids);
    this.error = error;
    this.grant_issuer = grant_issuer;
  }

  async authorize(input) {
    this.calls.push(structuredClone(input));
    if (this.error) throw this.error;
    const actorAllowed = this.allowed_actor_ids.has(input.actor.actor_id);
    const claimedRoleMatches = input.actor.role === HUMAN.role;
    const routeAllowed = this.allowed_route_ids === null ||
      input.target.kind !== "routing_confirmation" ||
      this.allowed_route_ids.has(input.target.routing_rule_id);
    if (!actorAllowed || !claimedRoleMatches || !routeAllowed) {
      return {
        authorized: false,
        reason: "synthetic allowlist denied the claimed actor or action target",
        policy_version: "synthetic-w3-allowlist@1.0.0-draft.2",
      };
    }
    const principal = {
      principal_id: input.actor.actor_id,
      principal_type: "synthetic_human",
      canonical_role: CANONICAL_HUMAN_ROLE,
      authority_source: "synthetic_allowlist",
    };
    const policyVersion = "synthetic-w3-allowlist@1.0.0-draft.2";
    return {
      authorized: true,
      principal,
      policy_version: policyVersion,
      action: input.action,
      target: structuredClone(input.target),
      command_fingerprint: input.command_fingerprint,
      grant: this.grant_issuer.issue({
        workflow: "W3",
        event_id: input.event_id,
        case_id: input.object_ref.object_id,
        action: input.action,
        target_fingerprint: input.target_fingerprint,
        command_fingerprint: input.command_fingerprint,
        principal,
        policy_version: policyVersion,
      }),
    };
  }
}

class FailOnceAuditSink extends MemoryAuditSink {
  attempts = 0;

  constructor(failures = 1) {
    super();
    this.failures = failures;
  }

  async append(record) {
    this.attempts += 1;
    if (this.failures > 0) {
      this.failures -= 1;
      throw new Error("synthetic W3 audit sink unavailable after event cache");
    }
    await super.append(record);
  }
}

class MutatingWorkflowAuditSink extends MemoryAuditSink {
  attempts = 0;

  constructor({ throw_once = false } = {}) {
    super();
    this.throw_once = throw_once;
  }

  async append(record) {
    this.attempts += 1;
    if (record.category === "workflow") {
      record.payload.result.status = "completed";
      if (record.payload.result.output) delete record.payload.result.output.gate;
      record.payload.result.actions = ["sink_forged_business_result"];
    }
    if (this.throw_once) {
      this.throw_once = false;
      throw new Error("synthetic mutating audit sink failed after touching its input");
    }
    await super.append(record);
  }
}

function envelope(node, payload, overrides = {}) {
  return {
    node,
    mode: node === "N4" ? "default" : "responsibility_routing",
    version: node === "N4" ? "N4-1.0.0-draft.2" : "N6-responsibility-routing-1.0.0-draft.2",
    run_id: `SYN-RUN-${node}-001`,
    object_ref: { object_type: "case", object_id: CASE_ID },
    input_hash: "AUTO",
    payload,
    evidence_spans: [],
    missing_fields: [],
    confidence: 0.9,
    status: "ok",
    validation: { valid: true, errors: [] },
    retry_count: 0,
    human_revision: { state: "none" },
    ...overrides,
  };
}

function n4Envelope(overrides = {}) {
  const evidence_spans = [
    { source_ref: "SYN-SOURCE-R3-001", quote: `车辆 ${VEHICLE_ID} 执行任务 ${TASK_ID} 时在站点 ${STATION_ID} 舱门无法解锁。` },
    { source_ref: "vehicles:SYN-VEHICLE-X6-107", quote: `${VEHICLE_ID}|${STATION_ID}|controls_available=false` },
    { source_ref: "delivery_tasks:SYN-TASK-8458", quote: `${TASK_ID}|${VEHICLE_ID}|${STATION_ID}|state_mutable_by_neoloop=false` },
    { source_ref: "stations:DEMO-S-YZ", quote: `${STATION_ID}|亦庄共配|synthetic_reference` },
  ];
  return envelope("N4", {
    candidate_objects: [
      { object_type: "vehicle", object_id: VEHICLE_ID, evidence_span_indices: [0, 1] },
      { object_type: "delivery_task", object_id: TASK_ID, evidence_span_indices: [0, 2] },
      { object_type: "station", object_id: STATION_ID, evidence_span_indices: [0, 3] },
    ],
    human_confirmation_required: true,
  }, { evidence_spans, ...overrides });
}

function routingCandidates() {
  return [
    {
      routing_rule_id: "SYN-ROUTING-002",
      rule_version: "routing-matrix@1.0.0-draft.2",
      candidate_team: "车辆运维",
      candidate_logical_role: "待企业确认",
      sla_rule_version: "legacy-registration-demo-v1",
      supporting_evidence_indices: [0, 1],
      counter_evidence_indices: [2],
      uncertainties: ["责任矩阵待企业验证", "存在同条件候选，须人工选择"],
    },
    {
      routing_rule_id: "SYN-ROUTING-014",
      rule_version: "routing-matrix@1.0.0-draft.2",
      candidate_team: "车辆运维+产品",
      candidate_logical_role: "待企业确认",
      sla_rule_version: "legacy-registration-demo-v1",
      supporting_evidence_indices: [0, 2],
      counter_evidence_indices: [1],
      uncertainties: ["责任矩阵待企业验证", "存在同条件候选，须人工选择"],
    },
  ];
}

function n6Envelope(overrides = {}) {
  return envelope("N6", {
    candidates: routingCandidates(),
    human_confirmation_required: true,
  }, {
    evidence_spans: [
      { source_ref: "case:SYN-CASE-R3-001", quote: `${STATION_ID}|舱门/柜体|${VEHICLE_ID}|${TASK_ID}` },
      { source_ref: "routing_matrix:SYN-ROUTING-002", quote: "SYN-ROUTING-002|车辆运维|待企业确认|legacy-registration-demo-v1|待企业验证" },
      { source_ref: "routing_matrix:SYN-ROUTING-014", quote: "SYN-ROUTING-014|车辆运维+产品|待企业确认|legacy-registration-demo-v1|待企业验证" },
    ],
    ...overrides,
  });
}

function candidateFromEnvelope(value) {
  return {
    payload: structuredClone(value.payload),
    evidence_spans: structuredClone(value.evidence_spans),
    missing_fields: [...value.missing_fields],
    confidence: value.confidence,
    status: value.status,
  };
}

function referenceData() {
  return {
    vehicles: [{
      data_scope: "synthetic_experiment",
      evidence_class: "synthetic_experiment",
      source_kind: "scenario_runtime",
      vehicle_id: VEHICLE_ID,
      station_id: STATION_ID,
      source_ref: `vehicles:${VEHICLE_ID}`,
      evidence_text: `${VEHICLE_ID}|${STATION_ID}|controls_available=false`,
      controls_available: false,
    }],
    delivery_tasks: [{
      data_scope: "synthetic_experiment",
      evidence_class: "synthetic_experiment",
      source_kind: "scenario_runtime",
      task_id: TASK_ID,
      vehicle_id: VEHICLE_ID,
      station_id: STATION_ID,
      source_ref: `delivery_tasks:${TASK_ID}`,
      evidence_text: `${TASK_ID}|${VEHICLE_ID}|${STATION_ID}|state_mutable_by_neoloop=false`,
      state_mutable_by_neoloop: false,
    }],
    stations: [{
      data_scope: "synthetic_experiment",
      evidence_class: "synthetic_experiment",
      source_kind: "scenario_runtime",
      station_id: STATION_ID,
      source_ref: `stations:${STATION_ID}`,
      evidence_text: `${STATION_ID}|亦庄共配|synthetic_reference`,
    }],
    routing_rules: routingCandidates().map((candidate) => ({
      data_scope: "synthetic_experiment",
      source_kind: "registration_workbook",
      routing_rule_id: candidate.routing_rule_id,
      rule_version: candidate.rule_version,
      station_id: STATION_ID,
      issue_type: "舱门/柜体",
      default_team: candidate.candidate_team,
      reviewer_role: candidate.candidate_logical_role,
      sla_rule_version: candidate.sla_rule_version,
      escalation_path: ["合成值班角色", "合成审核角色"],
      status: "待企业验证",
      evidence_class: "enterprise_pending",
      source_ref: `routing_matrix:${candidate.routing_rule_id}`,
      evidence_text: `${candidate.routing_rule_id}|${candidate.candidate_team}|${candidate.candidate_logical_role}|${candidate.sla_rule_version}|待企业验证`,
    })),
    sla_policies: routingCandidates().map((candidate) => ({
      policy_id: `SYN-SLA-POLICY-${candidate.routing_rule_id}`,
      policy_version: "synthetic-sla-policy@1.0.0-draft.2",
      routing_rule_id: candidate.routing_rule_id,
      sla_rule_version: candidate.sla_rule_version,
      first_response_target_minutes: 15,
      data_scope: "synthetic_experiment",
      evidence_class: "enterprise_pending",
      source_kind: "registration_workbook",
      status: "待企业验证",
      source_ref: `synthetic_sla_policy:${candidate.routing_rule_id}`,
      evidence_text: `${candidate.routing_rule_id}|${candidate.sla_rule_version}|15分钟|合成历史映射|待企业验证`,
    })),
  };
}

function rawFeedback() {
  const request = sampleIngestRequest({
    source_record_id: "SYN-SOURCE-R3-001",
    idempotency_key: "competition-synthetic:r3:SYN-SOURCE-R3-001",
    received_at: "2026-08-01T02:01:00.000Z",
    original_text: `车辆 ${VEHICLE_ID} 执行任务 ${TASK_ID} 时在站点 ${STATION_ID} 舱门无法解锁。`,
  });
  return {
    feedback_id: FEEDBACK_ID,
    idempotency_key: request.idempotency_key,
    content_fingerprint: "b".repeat(64),
    request,
    processing_status: "已建案",
    created_at: request.received_at,
  };
}

function caseRecord() {
  const original = rawFeedback().request.original_text;
  return {
    schema_version: "1.0.0-draft.2",
    data_scope: "synthetic_experiment",
    evidence_class: "synthetic_experiment",
    created_at: "2026-08-01T02:02:00.000Z",
    updated_at: "2026-08-01T02:02:00.000Z",
    source_kind: "scenario_runtime",
    case_id: CASE_ID,
    legacy_id: "not_applicable_scenario_runtime",
    title: original,
    summary: original,
    category_domain: "车辆运维",
    category_detail: "舱门/柜体",
    rule_risk: "P2",
    ai_risk: "P2",
    final_risk: "P2",
    status: "待关联",
    missing_fields: [],
    entity_candidates: {
      vehicle_ids: [VEHICLE_ID],
      task_ids: [TASK_ID],
      station_names: [STATION_ID],
      confidence: 0.94,
    },
    formal_entity: null,
    formal_entity_confirmation_status: "待人工确认",
    evidence_completeness: "complete",
    evidence_summary: original,
    sla_started_at: null,
    sla_due_at: null,
    sla_rule_version: "pending_human_confirmation",
    candidate_generation_mode: "AI",
    suggested_team: "pending_human_confirmation",
    routing_rule_candidate_id: null,
    cluster_id: null,
    pending_confirmation_items: ["formal_entity", "responsibility_owner", "sla_rule_version"],
    closed_at: null,
    record_mode: "scenario_runtime",
    workflow_readiness: "awaiting_same_event_check",
    legacy_association_mode: "not_applicable",
    legacy_reviewer: "not_applicable",
    legacy_status: "not_applicable",
    migration_note: null,
    source_name: "synthetic_experiment",
    source_locator: "SYN-SOURCE-R3-001",
    source_sha256: "b".repeat(64),
  };
}

async function makeHarness({
  check = "not_required",
  scripts = {},
  allowed_actor_ids = [HUMAN.actor_id],
  authorization_error = null,
  allowed_route_ids = null,
} = {}) {
  const {
    InMemoryFrontHalfRepository,
    createW3AuthorizationGrantChannel,
  } = await importBuilt("src/neoloop/workflows/index.js");
  const authorization_grant_channel = createW3AuthorizationGrantChannel();
  const repository = new InMemoryFrontHalfRepository({
    reference_data: referenceData(),
    w3_authorization_grant_consumer: authorization_grant_channel.consumer,
  });
  const workflow_event_calls = [];
  const runWorkflowEvent = repository.runWorkflowEvent.bind(repository);
  repository.runWorkflowEvent = async (...args) => {
    workflow_event_calls.push(args[0]);
    return runWorkflowEvent(...args);
  };
  const feedback = rawFeedback();
  const caseValue = caseRecord();
  repository.rawFeedbackByKey.set(feedback.idempotency_key, structuredClone(feedback));
  repository.rawFeedbackById.set(feedback.feedback_id, structuredClone(feedback));
  repository.casesById.set(caseValue.case_id, structuredClone(caseValue));
  repository.caseByFeedbackId.set(feedback.feedback_id, caseValue.case_id);
  if (check !== "missing") {
    await repository.insertSameEventCheckIfAbsent({
      check_id: "SYN-CHECK-R3-001",
      case_id: caseValue.case_id,
      mode: "same_event_duplicate",
      candidate: check === "candidate"
        ? { candidate_case_id: "SYN-CASE-R3-OTHER", similarity: 0.95 }
        : null,
      evidence_spans: check === "candidate"
        ? [{ source_ref: caseValue.source_locator, quote: caseValue.summary }]
        : [],
      review_state: check === "failed" || check === "candidate" ? "pending" : "not_required",
      node_status: check === "failed" ? "error" : "ok",
      automatic_merge: false,
      automatic_relink: false,
      created_at: "2026-08-01T02:03:00.000Z",
    });
  }
  return {
    repository,
    audit: new MemoryAuditSink(),
    ids: new SequenceIds(),
    clock: new MutableTestClock(),
    ai_runner: new QueueAiRunner(scripts),
    action_authorizer: new AllowlistW3ActionAuthorizer({
      allowed_actor_ids,
      allowed_route_ids,
      error: authorization_error,
      grant_issuer: authorization_grant_channel.issuer,
    }),
    authorization_grant_channel,
    workflow_event_calls,
  };
}

function ports(harness) {
  return {
    repository: harness.repository,
    audit: harness.audit,
    ids: harness.ids,
    clock: harness.clock,
    ai_runner: harness.ai_runner,
    action_authorizer: harness.action_authorizer,
  };
}

async function inControlledW3RepositoryContext(repository, eventId, operation) {
  let value;
  await repository.runWorkflowEvent(eventId, `synthetic-test-fingerprint:${eventId}`, async () =>
    repository.runCaseExclusive(CASE_ID, async () => {
      value = await operation();
      return {
        workflow: "W3",
        event_id: eventId,
        status: "completed",
        object_ref: { object_type: "case", object_id: CASE_ID },
        actions: ["synthetic_repository_boundary_test"],
        errors: [],
        output: null,
      };
    })
  );
  return value;
}

function command(event_id, action, extra = {}) {
  return { event_id, workflow: "W3", action, case_id: CASE_ID, ...extra };
}

async function advanceToEntityGate(harness, event = "SYN-W3-EVENT-N4") {
  const { runW3 } = await importBuilt("src/neoloop/workflows/index.js");
  return runW3(command(event, "advance"), ports(harness));
}

async function confirmEntity(harness, event = "SYN-W3-EVENT-ENTITY") {
  const { runW3 } = await importBuilt("src/neoloop/workflows/index.js");
  const proposal = harness.repository.entityProposalsByCaseId.get(CASE_ID);
  return runW3(command(event, "confirm_formal_entity", {
    actor: HUMAN,
    entity_proposal_id: proposal.proposal_id,
    formal_entity: { vehicle_id: VEHICLE_ID, task_id: TASK_ID, station_id: STATION_ID },
  }), ports(harness));
}

async function advanceToRoutingGate(harness, event = "SYN-W3-EVENT-N6") {
  const { runW3 } = await importBuilt("src/neoloop/workflows/index.js");
  return runW3(command(event, "advance"), ports(harness));
}

async function prepareRoutingGate(harness, prefix = "SYN-W3-PREPARE") {
  await advanceToEntityGate(harness, `${prefix}-N4`);
  await confirmEntity(harness, `${prefix}-ENTITY`);
  await advanceToRoutingGate(harness, `${prefix}-N6`);
  return harness.repository.routingProposalsByCaseId.get(CASE_ID);
}

function routingCommand(event_id, proposal, candidate, overrides = {}) {
  return command(event_id, "confirm_routing", {
    actor: HUMAN,
    routing_proposal_id: proposal.proposal_id,
    routing_rule_id: candidate.routing_rule_id,
    candidate_team: candidate.candidate_team,
    candidate_logical_role: candidate.candidate_logical_role,
    sla_rule_version: candidate.sla_rule_version,
    first_response_target_minutes: 15,
    ...overrides,
  });
}

test("W3 rejects malformed commands before the event ledger, authorization, AI, or domain writes and emits only a redacted security audit", async () => {
  const { runW3 } = await importBuilt("src/neoloop/workflows/index.js");
  const invalidCommands = [
    { label: "null command", value: null },
    { label: "array command", value: ["W3", "advance"] },
    { label: "string command", value: "W3 advance" },
    { label: "wrong workflow", value: command("SYN-W3-INVALID-WORKFLOW", "advance", { workflow: "W4" }) },
    { label: "blank event id", value: command("   ", "advance") },
    { label: "blank case id", value: command("SYN-W3-INVALID-CASE", "advance", { case_id: "" }) },
    {
      label: "unknown action",
      value: command("SYN-W3-INVALID-ACTION", "delete_case", {
        secret_token: "SECRET-SENTINEL-MUST-NOT-BE-LOGGED",
      }),
    },
    {
      label: "illegal duplicate decision",
      value: command("SYN-W3-INVALID-DUPLICATE", "resolve_same_event", {
        actor: HUMAN,
        check_id: "SYN-CHECK-R3-001",
        decision: "auto_merge",
        reason: "不得进入事件仓",
      }),
    },
    {
      label: "incomplete formal entity action",
      value: command("SYN-W3-INVALID-ENTITY", "confirm_formal_entity", {
        actor: HUMAN,
        entity_proposal_id: "SYN-PROPOSAL",
        formal_entity: { vehicle_id: VEHICLE_ID, task_id: "", station_id: STATION_ID },
      }),
    },
    {
      label: "invalid routing target",
      value: command("SYN-W3-INVALID-ROUTING", "confirm_routing", {
        actor: HUMAN,
        routing_proposal_id: "SYN-ROUTING-PROPOSAL",
        routing_rule_id: "SYN-ROUTING-002",
        candidate_team: "车辆运维",
        candidate_logical_role: "待企业确认",
        sla_rule_version: "legacy-registration-demo-v1",
        first_response_target_minutes: 0,
      }),
    },
    {
      label: "unsafe routing target",
      value: command("SYN-W3-INVALID-UNSAFE-SLA", "confirm_routing", {
        actor: HUMAN,
        routing_proposal_id: "SYN-ROUTING-PROPOSAL",
        routing_rule_id: "SYN-ROUTING-002",
        candidate_team: "车辆运维",
        candidate_logical_role: "待企业确认",
        sla_rule_version: "legacy-registration-demo-v1",
        first_response_target_minutes: Number.MAX_SAFE_INTEGER + 1,
      }),
    },
  ];

  for (const { label, value } of invalidCommands) {
    const harness = await makeHarness({ check: "candidate", scripts: { N4: [n4Envelope()] } });
    const beforeCase = structuredClone(await harness.repository.findCaseById(CASE_ID));
    const result = await runW3(value, ports(harness));

    assert.equal(result.status, "failed", label);
    assert.equal(result.output.error_class, "invalid_command", label);
    assert.equal(harness.workflow_event_calls.length, 0, label);
    assert.equal(harness.action_authorizer.calls.length, 0, label);
    assert.equal(harness.ai_runner.calls.length, 0, label);
    assert.equal(harness.audit.records.length, 1, label);
    assert.equal(harness.audit.records[0].category, "security", label);
    assert.equal(harness.audit.records.some((record) => record.category === "workflow"), false, label);
    const auditPayload = JSON.stringify(harness.audit.records[0].payload);
    assert.equal(auditPayload.includes("SYN-HUMAN-REVIEWER-001"), false, label);
    assert.equal(auditPayload.includes("合成审核角色"), false, label);
    assert.equal(auditPayload.includes("不得进入事件仓"), false, label);
    assert.equal(auditPayload.includes("formal_entity"), false, label);
    assert.equal(auditPayload.includes("SECRET-SENTINEL-MUST-NOT-BE-LOGGED"), false, label);
    assert.equal(JSON.stringify(result).includes("SECRET-SENTINEL-MUST-NOT-BE-LOGGED"), false, label);
    assert.equal(harness.repository.sameEventResolutionsByCaseId.size, 0, label);
    assert.equal(harness.repository.entityProposalsByCaseId.size, 0, label);
    assert.equal(harness.repository.routingProposalsByCaseId.size, 0, label);
    assert.equal(harness.repository.workOrdersById.size, 0, label);
    assert.deepEqual(await harness.repository.findCaseById(CASE_ID), beforeCase, label);
  }
});

test("W3 malformed input stays fail-closed when the redacted security-audit port fails", async () => {
  const { runW3 } = await importBuilt("src/neoloop/workflows/index.js");
  const harness = await makeHarness();
  const failingAudit = new FailOnceAuditSink(1);
  harness.audit = failingAudit;

  const result = await runW3(command("SYN-W3-INVALID-AUDIT", "unknown_action", {
    actor: { ...HUMAN, role: "SECRET-CLAIM-MUST-NOT-BE-LOGGED" },
  }), ports(harness));

  assert.equal(result.status, "failed");
  assert.equal(result.output.error_class, "invalid_command");
  assert.equal(result.output.security_audit_state, "failed");
  assert.equal(failingAudit.attempts, 1);
  assert.equal(harness.workflow_event_calls.length, 0);
  assert.equal(harness.action_authorizer.calls.length, 0);
  assert.equal(harness.ai_runner.calls.length, 0);
  assert.equal(harness.repository.entityProposalsByCaseId.size, 0);
  assert.equal(harness.repository.workOrdersById.size, 0);
});

test("W3 rejects inherited command, actor, formal-entity, and authorization principal fields before trusted processing", async () => {
  const { runW3 } = await importBuilt("src/neoloop/workflows/index.js");
  const inheritedCommand = Object.create(command("SYN-W3-INHERITED-COMMAND", "advance"));
  const inheritedActor = Object.create(HUMAN);
  const inheritedFormalEntity = Object.create({
    vehicle_id: VEHICLE_ID,
    task_id: TASK_ID,
    station_id: STATION_ID,
  });
  const boundaryCases = [
    ["command", inheritedCommand],
    ["actor", command("SYN-W3-INHERITED-ACTOR", "resolve_same_event", {
      actor: inheritedActor,
      check_id: "SYN-CHECK-R3-001",
      decision: "keep_separate",
      reason: "prototype fields must not authorize",
    })],
    ["formal_entity", command("SYN-W3-INHERITED-ENTITY", "confirm_formal_entity", {
      actor: HUMAN,
      entity_proposal_id: "SYN-PROPOSAL-INHERITED",
      formal_entity: inheritedFormalEntity,
    })],
  ];

  for (const [label, value] of boundaryCases) {
    const harness = await makeHarness({ check: "candidate", scripts: { N4: [n4Envelope()] } });
    const result = await runW3(value, ports(harness));
    assert.equal(result.status, "failed", label);
    assert.equal(result.output.error_class, "invalid_command", label);
    assert.equal(harness.workflow_event_calls.length, 0, label);
    assert.equal(harness.action_authorizer.calls.length, 0, label);
    assert.equal(harness.ai_runner.calls.length, 0, label);
    assert.equal(harness.audit.records.length, 1, label);
    assert.equal(harness.audit.records[0].category, "security", label);
  }

  const inheritedPrincipalHarness = await makeHarness({ check: "candidate" });
  const baseAuthorizer = inheritedPrincipalHarness.action_authorizer;
  inheritedPrincipalHarness.action_authorizer = {
    calls: baseAuthorizer.calls,
    async authorize(input) {
      const decision = await baseAuthorizer.authorize(input);
      if (!decision.authorized) return decision;
      return { ...decision, principal: Object.create(decision.principal) };
    },
  };
  const inheritedPrincipal = await runW3(command("SYN-W3-INHERITED-PRINCIPAL", "resolve_same_event", {
    actor: HUMAN,
    check_id: "SYN-CHECK-R3-001",
    decision: "keep_separate",
    reason: "prototype principal must not authorize",
  }), ports(inheritedPrincipalHarness));
  assert.equal(inheritedPrincipal.status, "failed");
  assert.equal(inheritedPrincipal.output.error_class, "authorization_port_failure");
  assert.equal(inheritedPrincipalHarness.repository.sameEventResolutionsByCaseId.size, 0);
});

test("W3 fails closed with a redacted security audit when command inspection triggers accessors or proxy traps", async () => {
  const { runW3 } = await importBuilt("src/neoloop/workflows/index.js");
  const throwingGetterCommand = {};
  Object.defineProperties(throwingGetterCommand, {
    event_id: { enumerable: true, value: "SYN-W3-THROWING-GETTER" },
    workflow: {
      enumerable: true,
      get() {
        throw new Error("SECRET-GETTER-ERROR");
      },
    },
    action: { enumerable: true, value: "advance" },
    case_id: { enumerable: true, value: CASE_ID },
  });
  const trappingProxyCommand = new Proxy(command("SYN-W3-TRAPPING-PROXY", "advance"), {
    getPrototypeOf() {
      throw new Error("SECRET-PROXY-ERROR");
    },
  });

  for (const [label, value] of [
    ["throwing getter", throwingGetterCommand],
    ["proxy trap", trappingProxyCommand],
  ]) {
    const harness = await makeHarness({ check: "candidate", scripts: { N4: [n4Envelope()] } });
    const beforeCase = structuredClone(await harness.repository.findCaseById(CASE_ID));
    const result = await runW3(value, ports(harness));

    assert.equal(result.status, "failed", label);
    assert.equal(result.output.error_class, "invalid_command", label);
    assert.equal(result.output.reason_code, "unsafe_object_shape", label);
    assert.equal(result.output.security_audit_state, "recorded", label);
    assert.equal(harness.audit.records.length, 1, label);
    assert.equal(harness.audit.records[0].category, "security", label);
    assert.equal(JSON.stringify(harness.audit.records).includes("SECRET-"), false, label);
    assert.equal(harness.workflow_event_calls.length, 0, label);
    assert.equal(harness.action_authorizer.calls.length, 0, label);
    assert.equal(harness.ai_runner.calls.length, 0, label);
    assert.equal(harness.repository.entityProposalsByCaseId.size, 0, label);
    assert.equal(harness.repository.routingProposalsByCaseId.size, 0, label);
    assert.equal(harness.repository.workOrdersById.size, 0, label);
    assert.deepEqual(await harness.repository.findCaseById(CASE_ID), beforeCase, label);
  }
});

test("W3 human actions require an external allowlist; self-declared or denied actors fail closed", async () => {
  const { runW3 } = await importBuilt("src/neoloop/workflows/index.js");
  for (const [label, actor, allowed_actor_ids] of [
    ["self-declared", { ...HUMAN, actor_id: "SYN-SELF-DECLARED-ACTOR" }, [HUMAN.actor_id]],
    ["explicitly-denied", HUMAN, []],
  ]) {
    const harness = await makeHarness({ check: "candidate", allowed_actor_ids });
    const input = command(`SYN-W3-AUTH-${label}`, "resolve_same_event", {
      actor,
      check_id: "SYN-CHECK-R3-001",
      decision: "keep_separate",
      reason: "合成拒绝授权测试",
    });
    const result = await runW3(input, ports(harness));
    const replay = await runW3(structuredClone(input), ports(harness));

    assert.equal(result.status, "failed", label);
    assert.equal(result.output.error_class, "authorization_failure", label);
    assert.equal(result.output.action_authorization.state, "denied", label);
    assert.equal(result.output.action_authorization.authorized, false, label);
    assert.equal(replay.status, "failed", label);
    assert.equal(replay.output.error_class, "authorization_failure", label);
    assert.equal(replay.output.event_replayed, true, label);
    assert.equal(replay.output.action_authorization.state, "denied", label);
    assert.equal(harness.action_authorizer.calls.length, 1, label);
    assert.equal(harness.repository.sameEventResolutionsByCaseId.size, 0, label);
    assert.equal(harness.ai_runner.calls.length, 0, label);
  }
});

test("W3 rejects forged roles and case-only grants that do not authorize the selected routing target", async () => {
  const { runW3 } = await importBuilt("src/neoloop/workflows/index.js");
  const forgedRole = await makeHarness({ check: "candidate" });
  const forged = await runW3(command("SYN-W3-FORGED-ROLE", "resolve_same_event", {
    actor: { ...HUMAN, role: "伪造管理员" },
    check_id: "SYN-CHECK-R3-001",
    decision: "keep_separate",
    reason: "合成伪造角色测试",
  }), ports(forgedRole));
  assert.equal(forged.status, "failed");
  assert.equal(forged.output.error_class, "authorization_failure");
  assert.equal(forgedRole.repository.sameEventResolutionsByCaseId.size, 0);

  const routeScoped = await makeHarness({ scripts: { N4: [n4Envelope()], N6: [n6Envelope()] } });
  const proposal = await prepareRoutingGate(routeScoped, "SYN-W3-ROUTE-SCOPE");
  const [allowedCandidate, deniedCandidate] = proposal.candidates;
  routeScoped.action_authorizer = new AllowlistW3ActionAuthorizer({
    allowed_route_ids: [allowedCandidate.routing_rule_id],
    grant_issuer: routeScoped.authorization_grant_channel.issuer,
  });
  const denied = await runW3(
    routingCommand("SYN-W3-ROUTE-SCOPE-DENIED", proposal, deniedCandidate),
    ports(routeScoped),
  );

  assert.equal(denied.status, "failed");
  assert.equal(denied.output.error_class, "authorization_failure");
  assert.equal(routeScoped.repository.workOrdersById.size, 0);
  assert.equal(routeScoped.action_authorizer.calls.length, 1);
  assert.deepEqual(routeScoped.action_authorizer.calls[0].target, {
    kind: "routing_confirmation",
    routing_proposal_id: proposal.proposal_id,
    routing_rule_id: deniedCandidate.routing_rule_id,
    candidate_team: deniedCandidate.candidate_team,
    candidate_logical_role: deniedCandidate.candidate_logical_role,
    sla_rule_version: deniedCandidate.sla_rule_version,
    first_response_target_minutes: 15,
  });
});

test("W3 caches authorization-port failures and replays the original failed status without reauthorizing", async () => {
  const { runW3 } = await importBuilt("src/neoloop/workflows/index.js");
  const harness = await makeHarness({
    check: "candidate",
    authorization_error: new Error("synthetic W3 identity provider unavailable"),
  });
  const input = command("SYN-W3-AUTH-PORT-FAIL", "resolve_same_event", {
    actor: HUMAN,
    check_id: "SYN-CHECK-R3-001",
    decision: "keep_separate",
    reason: "合成授权器异常测试",
  });

  const first = await runW3(input, ports(harness));
  const replay = await runW3(structuredClone(input), ports(harness));

  assert.equal(first.status, "failed");
  assert.equal(first.output.error_class, "authorization_port_failure");
  assert.equal(first.output.action_authorization.state, "indeterminate");
  assert.equal(replay.status, "failed");
  assert.equal(replay.output.error_class, "authorization_port_failure");
  assert.equal(replay.output.event_replayed, true);
  assert.equal(replay.output.action_authorization.state, "indeterminate");
  assert.equal(harness.action_authorizer.calls.length, 1);
  assert.equal(harness.repository.sameEventResolutionsByCaseId.size, 0);
});

test("W3 reports audit failure after a committed dispatch honestly and retries only the audit on replay", async () => {
  const { runW3 } = await importBuilt("src/neoloop/workflows/index.js");
  const harness = await makeHarness({ scripts: { N4: [n4Envelope()], N6: [n6Envelope()] } });
  const proposal = await prepareRoutingGate(harness, "SYN-W3-AUDIT-COMMIT");
  const input = routingCommand("SYN-W3-AUDIT-AFTER-COMMIT", proposal, proposal.candidates[0]);
  const authorizationsBefore = harness.action_authorizer.calls.length;
  const failingAudit = new FailOnceAuditSink(1);
  harness.audit = failingAudit;

  const first = await runW3(input, ports(harness));
  const committedCase = await harness.repository.findCaseById(CASE_ID);
  const committedOrder = await harness.repository.findWorkOrderByCaseId(CASE_ID);

  assert.equal(first.status, "completed");
  assert.equal(first.output.audit_state, "pending");
  assert.equal(first.output.audit_pending, true);
  assert.equal(first.output.audit_error_class, "audit_failure_after_commit");
  assert.equal(first.output.event_result_cached, true);
  assert.equal(first.output.effect_state, "committed");
  assert.equal(first.output.committed_result_status, "completed");
  assert.equal(first.actions.includes("preserve_existing_state"), false);
  assert.equal(committedCase.status, "待派单");
  assert.equal(committedOrder.status, "待接单");
  assert.equal(harness.repository.workOrdersById.size, 1);
  assert.equal(harness.repository.routingDecisionsByCaseId.size, 1);
  assert.equal(harness.action_authorizer.calls.length, authorizationsBefore + 1);

  const replay = await runW3(structuredClone(input), ports(harness));
  assert.equal(replay.status, "idempotent");
  assert.equal(replay.output.audit_state, "recorded");
  assert.equal(replay.output.audit_pending, false);
  assert.equal(replay.output.workflow_audit_id, first.output.workflow_audit_id);
  assert.equal(replay.output.event_replayed, true);
  assert.equal(replay.output.human_decision.decision_id, first.output.human_decision.decision_id);
  assert.equal(harness.action_authorizer.calls.length, authorizationsBefore + 1);
  assert.equal(harness.repository.workOrdersById.size, 1);
  assert.equal(harness.repository.routingDecisionsByCaseId.size, 1);
  assert.equal(failingAudit.attempts, 2);
  assert.equal(failingAudit.records.length, 1);
  assert.equal(failingAudit.records[0].payload.result.output.human_decision.decision_id, first.output.human_decision.decision_id);
});

test("W3 never lets an audit sink mutate the cached business result, whether append returns or throws", async () => {
  const { runW3 } = await importBuilt("src/neoloop/workflows/index.js");
  for (const [label, throwOnce] of [["returns", false], ["throws-once", true]]) {
    const harness = await makeHarness({ scripts: { N4: [n4Envelope()] } });
    const sink = new MutatingWorkflowAuditSink({ throw_once: throwOnce });
    harness.audit = sink;
    const input = command(`SYN-W3-AUDIT-MUTATION-${label}`, "advance");

    const first = await runW3(input, ports(harness));
    const replay = await runW3(structuredClone(input), ports(harness));

    assert.equal(first.status, "needs_human", label);
    assert.equal(first.output.gate, "formal_entity_confirmation", label);
    assert.equal(replay.status, "needs_human", label);
    assert.equal(replay.output.gate, "formal_entity_confirmation", label);
    assert.equal(replay.output.event_replayed, true, label);
    assert.equal(first.actions.includes("sink_forged_business_result"), false, label);
    assert.equal(replay.actions.includes("sink_forged_business_result"), false, label);
    assert.equal(harness.ai_runner.calls.filter((call) => call.node === "N4").length, 1, label);
    assert.equal(harness.repository.entityProposalsByCaseId.size, 1, label);
    assert.equal(sink.attempts, throwOnce ? 2 : 1, label);
  }
});

test("W3 preserves needs_human on replay and does not repeat AI or candidate persistence", async () => {
  const { runW3 } = await importBuilt("src/neoloop/workflows/index.js");
  const harness = await makeHarness({ scripts: { N4: [n4Envelope()] } });
  const input = command("SYN-W3-REPLAY-NEEDS-HUMAN", "advance");

  const first = await runW3(input, ports(harness));
  const replay = await runW3(structuredClone(input), ports(harness));

  assert.equal(first.status, "needs_human");
  assert.equal(first.output.gate, "formal_entity_confirmation");
  assert.equal(replay.status, "needs_human");
  assert.equal(replay.output.gate, "formal_entity_confirmation");
  assert.equal(replay.output.event_replayed, true);
  assert.equal(harness.ai_runner.calls.length, 1);
  assert.equal(harness.repository.entityProposalsByCaseId.size, 1);
  assert.equal(harness.action_authorizer.calls.length, 0);
});

test("W3 fails closed on partially imported dispatched cases and inconsistent work-order indexes", async () => {
  for (const [label, configure] of [
    ["missing-work-order", (harness) => {
      const record = harness.repository.casesById.get(CASE_ID);
      harness.repository.casesById.set(CASE_ID, {
        ...record,
        status: "待派单",
        workflow_readiness: "dispatched",
        sla_started_at: "2026-08-01T02:01:00.000Z",
        sla_due_at: "2026-08-01T02:16:00.000Z",
      });
    }],
    ["dangling-work-order-index", (harness) => {
      const record = harness.repository.casesById.get(CASE_ID);
      harness.repository.casesById.set(CASE_ID, {
        ...record,
        status: "待派单",
        workflow_readiness: "dispatched",
        sla_started_at: "2026-08-01T02:01:00.000Z",
        sla_due_at: "2026-08-01T02:16:00.000Z",
      });
      harness.repository.workOrderByCaseId.set(CASE_ID, "SYN-MISSING-WORK-ORDER");
    }],
    ["orphan-work-order-without-index", (harness) => {
      const record = harness.repository.casesById.get(CASE_ID);
      harness.repository.casesById.set(CASE_ID, {
        ...record,
        status: "待派单",
        workflow_readiness: "dispatched",
        sla_started_at: "2026-08-01T02:01:00.000Z",
        sla_due_at: "2026-08-01T02:16:00.000Z",
      });
      harness.repository.workOrdersById.set("SYN-ORPHAN-WORK-ORDER", {
        work_order_id: "SYN-ORPHAN-WORK-ORDER",
        case_id: CASE_ID,
      });
    }],
  ]) {
    const harness = await makeHarness();
    configure(harness);
    const result = await advanceToEntityGate(harness, `SYN-W3-INVARIANT-${label}`);
    assert.equal(result.status, "failed", label);
    assert.equal(result.output.error_class, "invariant_violation", label);
    assert.equal(result.output.work_order, null, label);
    assert.equal(harness.ai_runner.calls.length, 0, label);
  }

  const committed = await makeHarness({ scripts: { N4: [n4Envelope()], N6: [n6Envelope()] } });
  const proposal = await prepareRoutingGate(committed, "SYN-W3-INVARIANT-COMMIT");
  await (await importBuilt("src/neoloop/workflows/index.js")).runW3(
    routingCommand("SYN-W3-INVARIANT-DISPATCH", proposal, proposal.candidates[0]),
    ports(committed),
  );
  const committedCase = structuredClone(committed.repository.casesById.get(CASE_ID));
  const committedOrder = structuredClone(await committed.repository.findWorkOrderByCaseId(CASE_ID));
  const committedDecision = structuredClone(committed.repository.routingDecisionsByCaseId.get(CASE_ID));
  committed.repository.casesById.set(CASE_ID, {
    ...committedCase,
    suggested_team: "SYN-FORGED-TEAM",
  });
  const inconsistentSnapshot = await advanceToEntityGate(
    committed,
    "SYN-W3-INVARIANT-INCONSISTENT-DISPATCH-SNAPSHOT",
  );
  assert.equal(inconsistentSnapshot.status, "failed");
  assert.equal(inconsistentSnapshot.output.error_class, "invariant_violation");
  committed.repository.casesById.set(CASE_ID, structuredClone(committedCase));
  committed.repository.casesById.delete(CASE_ID);

  await assert.rejects(
    committed.repository.createDispatchIfAbsent({
      expected_case: committedCase,
      next_case: committedCase,
      work_order: committedOrder,
      decision: committedDecision,
    }),
    /case.*missing|invariant/i,
  );
  assert.equal(committed.repository.casesById.has(CASE_ID), false);
});

test("W3 rejects a synchronously forged dispatched team even when case, order, decision, and fingerprint agree", async () => {
  const { createWorkflowEventFingerprint, runW3 } = await importBuilt("src/neoloop/workflows/index.js");
  const harness = await makeHarness({ scripts: { N4: [n4Envelope()], N6: [n6Envelope()] } });
  const proposal = await prepareRoutingGate(harness, "SYN-W3-FORGED-DISPATCH-TEAM-PREPARE");
  const dispatched = await runW3(
    routingCommand("SYN-W3-FORGED-DISPATCH-TEAM-COMMIT", proposal, proposal.candidates[0]),
    ports(harness),
  );
  assert.equal(dispatched.status, "completed");

  const forgedTeam = "SYN-TEAM-NOT-IN-PERSISTED-N6-PROPOSAL";
  const forgedCase = {
    ...structuredClone(await harness.repository.findCaseById(CASE_ID)),
    suggested_team: forgedTeam,
  };
  const workOrderId = harness.repository.workOrderByCaseId.get(CASE_ID);
  const forgedOrder = {
    ...structuredClone(harness.repository.workOrdersById.get(workOrderId)),
    team: forgedTeam,
  };
  const originalDecision = structuredClone(harness.repository.routingDecisionsByCaseId.get(CASE_ID));
  const forgedDecision = {
    ...originalDecision,
    candidate_team: forgedTeam,
  };
  forgedDecision.decision_fingerprint = createWorkflowEventFingerprint({
    action: "confirm_routing",
    case_id: forgedDecision.case_id,
    authorization_policy_version: forgedDecision.authorization_policy_version,
    principal: forgedDecision.principal,
    proposal_ref: forgedDecision.proposal_ref,
    rule_ref: forgedDecision.rule_ref,
    candidate_team: forgedDecision.candidate_team,
    candidate_logical_role: forgedDecision.candidate_logical_role,
  });
  harness.repository.casesById.set(CASE_ID, structuredClone(forgedCase));
  harness.repository.workOrdersById.set(workOrderId, structuredClone(forgedOrder));
  harness.repository.routingDecisionsByCaseId.set(CASE_ID, structuredClone(forgedDecision));
  const aiCallsBefore = harness.ai_runner.calls.length;
  const authorizationCallsBefore = harness.action_authorizer.calls.length;

  const result = await runW3(
    command("SYN-W3-FORGED-DISPATCH-TEAM-ADVANCE", "advance"),
    ports(harness),
  );

  assert.equal(result.status, "failed");
  assert.equal(result.output.error_class, "invariant_violation");
  assert.ok(result.actions.includes("do_not_run_AI"));
  assert.ok(result.actions.includes("do_not_create_work_order"));
  assert.equal(harness.ai_runner.calls.length, aiCallsBefore);
  assert.equal(harness.action_authorizer.calls.length, authorizationCallsBefore);
  assert.equal(harness.repository.workOrdersById.size, 1);
  assert.deepEqual(await harness.repository.findCaseById(CASE_ID), forgedCase);
  assert.deepEqual(await harness.repository.findWorkOrderByCaseId(CASE_ID), forgedOrder);
  assert.deepEqual(harness.repository.routingDecisionsByCaseId.get(CASE_ID), forgedDecision);
  const audit = harness.audit.records.find((record) =>
    record.category === "workflow" &&
    record.payload.event_id === "SYN-W3-FORGED-DISPATCH-TEAM-ADVANCE"
  );
  assert.ok(audit);
  assert.equal(audit.payload.result.output.error_class, "invariant_violation");
});

test("W3 rejects fully shaped dispatch imports without commit receipts and revalidates current entity references", async () => {
  const { runW3 } = await importBuilt("src/neoloop/workflows/index.js");
  const source = await makeHarness({ scripts: { N4: [n4Envelope()], N6: [n6Envelope()] } });
  const proposal = await prepareRoutingGate(source, "SYN-W3-RECEIPT-SOURCE");
  const committed = await runW3(
    routingCommand("SYN-W3-RECEIPT-SOURCE-DISPATCH", proposal, proposal.candidates[0]),
    ports(source),
  );
  assert.equal(committed.status, "completed");
  const snapshot = {
    case: structuredClone(source.repository.casesById.get(CASE_ID)),
    entity_proposal: structuredClone(source.repository.entityProposalsByCaseId.get(CASE_ID)),
    formal_decision: structuredClone(source.repository.formalEntityDecisionsByCaseId.get(CASE_ID)),
    routing_proposal: structuredClone(source.repository.routingProposalsByCaseId.get(CASE_ID)),
    routing_decision: structuredClone(source.repository.routingDecisionsByCaseId.get(CASE_ID)),
    work_order: structuredClone(await source.repository.findWorkOrderByCaseId(CASE_ID)),
  };

  const vehicle = source.repository.vehiclesById.get(VEHICLE_ID);
  source.repository.vehiclesById.set(VEHICLE_ID, { ...vehicle, controls_available: true });
  const unsafeReference = await runW3(
    command("SYN-W3-DISPATCH-REFERENCE-DRIFT", "advance"),
    ports(source),
  );
  assert.equal(unsafeReference.status, "failed");
  assert.equal(unsafeReference.output.error_class, "invariant_violation");
  assert.equal(source.ai_runner.calls.length, 2);
  assert.equal(source.action_authorizer.calls.length, 2);

  const imported = await makeHarness();
  imported.repository.casesById.set(CASE_ID, snapshot.case);
  imported.repository.entityProposalsByCaseId.set(CASE_ID, snapshot.entity_proposal);
  imported.repository.formalEntityDecisionsByCaseId.set(CASE_ID, snapshot.formal_decision);
  imported.repository.routingProposalsByCaseId.set(CASE_ID, snapshot.routing_proposal);
  imported.repository.routingDecisionsByCaseId.set(CASE_ID, snapshot.routing_decision);
  imported.repository.workOrdersById.set(snapshot.work_order.work_order_id, snapshot.work_order);
  imported.repository.workOrderByCaseId.set(CASE_ID, snapshot.work_order.work_order_id);
  const importedResult = await runW3(
    command("SYN-W3-DISPATCH-WITHOUT-RECEIPT", "advance"),
    ports(imported),
  );
  assert.equal(importedResult.status, "failed");
  assert.equal(importedResult.output.error_class, "invariant_violation");
  assert.equal(imported.ai_runner.calls.length, 0);
  assert.equal(imported.action_authorizer.calls.length, 0);
  assert.equal(imported.repository.workOrdersById.size, 1);
});

test("W3 repository binds persisted N4 and N6 proposal hashes to their exact normalized requests", async () => {
  const changedHash = (value) => `${value[0] === "0" ? "1" : "0"}${value.slice(1)}`;

  const n4Harness = await makeHarness({ scripts: { N4: [n4Envelope()] } });
  const n4CaseBefore = structuredClone(await n4Harness.repository.findCaseById(CASE_ID));
  await advanceToEntityGate(n4Harness, "SYN-W3-N4-HASH-SOURCE");
  const n4Proposal = structuredClone(n4Harness.repository.entityProposalsByCaseId.get(CASE_ID));
  n4Harness.repository.entityProposalsByCaseId.delete(CASE_ID);
  n4Harness.repository.casesById.set(CASE_ID, n4CaseBefore);
  await assert.rejects(
    inControlledW3RepositoryContext(
      n4Harness.repository,
      "SYN-W3-N4-HASH-REPOSITORY-CONTEXT",
      () => n4Harness.repository.saveEntityProposalIfAbsent({
        ...n4Proposal,
        input_hash: changedHash(n4Proposal.input_hash),
      }),
    ),
    /input.*hash|invariant/i,
  );
  assert.equal(n4Harness.repository.entityProposalsByCaseId.size, 0);

  const n6Harness = await makeHarness({ scripts: { N4: [n4Envelope()], N6: [n6Envelope()] } });
  await advanceToEntityGate(n6Harness, "SYN-W3-N6-HASH-N4");
  await confirmEntity(n6Harness, "SYN-W3-N6-HASH-ENTITY");
  const n6CaseBefore = structuredClone(await n6Harness.repository.findCaseById(CASE_ID));
  await advanceToRoutingGate(n6Harness, "SYN-W3-N6-HASH-SOURCE");
  const n6Proposal = structuredClone(n6Harness.repository.routingProposalsByCaseId.get(CASE_ID));
  n6Harness.repository.routingProposalsByCaseId.delete(CASE_ID);
  n6Harness.repository.casesById.set(CASE_ID, n6CaseBefore);
  await assert.rejects(
    inControlledW3RepositoryContext(
      n6Harness.repository,
      "SYN-W3-N6-HASH-REPOSITORY-CONTEXT",
      () => n6Harness.repository.saveRoutingProposalIfAbsent({
        ...n6Proposal,
        input_hash: changedHash(n6Proposal.input_hash),
      }),
    ),
    /input.*hash|invariant/i,
  );
  assert.equal(n6Harness.repository.routingProposalsByCaseId.size, 0);
});

test("W3 repository verification and commit use a non-yielding private critical section", async () => {
  const harness = await makeHarness({ scripts: { N4: [n4Envelope()], N6: [n6Envelope()] } });
  await advanceToEntityGate(harness, "SYN-W3-TOCTOU-N4");
  await confirmEntity(harness, "SYN-W3-TOCTOU-ENTITY");
  const caseBeforeN6 = structuredClone(await harness.repository.findCaseById(CASE_ID));
  await advanceToRoutingGate(harness, "SYN-W3-TOCTOU-N6");
  const proposal = structuredClone(harness.repository.routingProposalsByCaseId.get(CASE_ID));
  harness.repository.routingProposalsByCaseId.delete(CASE_ID);
  harness.repository.casesById.set(CASE_ID, caseBeforeN6);

  const originalVerify = harness.repository.hasVerifiedW3Artifact.bind(harness.repository);
  let releaseVerification;
  const verificationGate = new Promise((resolve) => { releaseVerification = resolve; });
  let reportVerification;
  const verificationEntered = new Promise((resolve) => { reportVerification = resolve; });
  harness.repository.hasVerifiedW3Artifact = async (...args) => {
    const verified = await originalVerify(...args);
    if (args[1] === "entity_proposal") {
      reportVerification();
      await verificationGate;
    }
    return verified;
  };

  const operation = inControlledW3RepositoryContext(
    harness.repository,
    "SYN-W3-TOCTOU-REPOSITORY-CONTEXT",
    () => harness.repository.saveRoutingProposalIfAbsent(proposal),
  );
  const first = await Promise.race([
    verificationEntered.then(() => "public_verification_yielded"),
    operation.then(() => "completed", () => "rejected"),
  ]);
  if (first === "public_verification_yielded") {
    const entityProposal = harness.repository.entityProposalsByCaseId.get(CASE_ID);
    entityProposal.created_at = "2026-08-01T03:59:59.000Z";
    releaseVerification();
    await operation.catch(() => undefined);
  }

  assert.equal(first, "completed", "repository commits must not await an overridable receipt check");
  assert.equal(await originalVerify(CASE_ID, "entity_proposal"), true);
  assert.equal(harness.repository.routingProposalsByCaseId.size, 1);
});

test("W3 repository refuses exact-shaped N4 and N6 proposals outside an active workflow event and case lock", async () => {
  const n4Harness = await makeHarness({ scripts: { N4: [n4Envelope()] } });
  const n4CaseBefore = structuredClone(await n4Harness.repository.findCaseById(CASE_ID));
  await advanceToEntityGate(n4Harness, "SYN-W3-PROVENANCE-N4-SOURCE");
  const n4Proposal = structuredClone(n4Harness.repository.entityProposalsByCaseId.get(CASE_ID));
  n4Harness.repository.entityProposalsByCaseId.delete(CASE_ID);
  n4Harness.repository.casesById.set(CASE_ID, n4CaseBefore);
  await assert.rejects(
    n4Harness.repository.saveEntityProposalIfAbsent(n4Proposal),
    /active.*workflow|case lock|provenance|invariant/i,
  );
  assert.equal(n4Harness.repository.entityProposalsByCaseId.size, 0);

  const n6Harness = await makeHarness({ scripts: { N4: [n4Envelope()], N6: [n6Envelope()] } });
  await advanceToEntityGate(n6Harness, "SYN-W3-PROVENANCE-N6-N4");
  await confirmEntity(n6Harness, "SYN-W3-PROVENANCE-N6-ENTITY");
  const n6CaseBefore = structuredClone(await n6Harness.repository.findCaseById(CASE_ID));
  await advanceToRoutingGate(n6Harness, "SYN-W3-PROVENANCE-N6-SOURCE");
  const n6Proposal = structuredClone(n6Harness.repository.routingProposalsByCaseId.get(CASE_ID));
  n6Harness.repository.routingProposalsByCaseId.delete(CASE_ID);
  n6Harness.repository.casesById.set(CASE_ID, n6CaseBefore);
  await assert.rejects(
    n6Harness.repository.saveRoutingProposalIfAbsent(n6Proposal),
    /active.*workflow|case lock|provenance|invariant/i,
  );
  assert.equal(n6Harness.repository.routingProposalsByCaseId.size, 0);
});

test("W3 never labels damaged formal-entity or dispatch snapshots idempotent on a new human event", async () => {
  const { runW3 } = await importBuilt("src/neoloop/workflows/index.js");

  const formalHarness = await makeHarness({ scripts: { N4: [n4Envelope()] } });
  await advanceToEntityGate(formalHarness, "SYN-W3-DAMAGED-FORMAL-N4");
  const entityProposal = structuredClone(formalHarness.repository.entityProposalsByCaseId.get(CASE_ID));
  const firstFormal = await confirmEntity(formalHarness, "SYN-W3-DAMAGED-FORMAL-FIRST");
  assert.equal(firstFormal.status, "completed");
  const damagedFormalCase = formalHarness.repository.casesById.get(CASE_ID);
  formalHarness.repository.casesById.set(CASE_ID, {
    ...damagedFormalCase,
    formal_entity: null,
    formal_entity_confirmation_status: "待人工确认",
    workflow_readiness: "awaiting_formal_entity_confirmation",
  });
  const repeatedFormal = await runW3(command("SYN-W3-DAMAGED-FORMAL-REPEAT", "confirm_formal_entity", {
    actor: HUMAN,
    entity_proposal_id: entityProposal.proposal_id,
    formal_entity: { vehicle_id: VEHICLE_ID, task_id: TASK_ID, station_id: STATION_ID },
  }), ports(formalHarness));
  assert.equal(repeatedFormal.status, "failed");
  assert.equal(repeatedFormal.output.error_class, "invariant_violation");
  assert.equal(formalHarness.repository.formalEntityDecisionsByCaseId.size, 1);

  const routingHarness = await makeHarness({ scripts: { N4: [n4Envelope()], N6: [n6Envelope()] } });
  const routingProposal = await prepareRoutingGate(routingHarness, "SYN-W3-DAMAGED-ROUTING-PREPARE");
  const chosen = routingProposal.candidates[0];
  const firstRouting = await runW3(
    routingCommand("SYN-W3-DAMAGED-ROUTING-FIRST", routingProposal, chosen),
    ports(routingHarness),
  );
  assert.equal(firstRouting.status, "completed");
  const workOrderId = routingHarness.repository.workOrderByCaseId.get(CASE_ID);
  const damagedOrder = routingHarness.repository.workOrdersById.get(workOrderId);
  routingHarness.repository.workOrdersById.set(workOrderId, {
    ...damagedOrder,
    due_at: "2026-08-01T23:59:00.000Z",
  });
  const repeatedRouting = await runW3(
    routingCommand("SYN-W3-DAMAGED-ROUTING-REPEAT", routingProposal, chosen),
    ports(routingHarness),
  );
  assert.equal(repeatedRouting.status, "failed");
  assert.equal(repeatedRouting.output.error_class, "invariant_violation");
  assert.equal(routingHarness.repository.workOrdersById.size, 1);
  assert.equal(routingHarness.repository.routingDecisionsByCaseId.size, 1);
});

test("W3 repository write boundaries reject forged human decisions, orphan proposals, gate bypasses, and synthetic SLA rewrites", async () => {
  const validPrincipal = {
    principal_id: HUMAN.actor_id,
    principal_type: "synthetic_human",
    canonical_role: CANONICAL_HUMAN_ROLE,
    authority_source: "synthetic_allowlist",
  };
  const resolutionHarness = await makeHarness({ check: "candidate", scripts: { N4: [n4Envelope()] } });
  const resolutionInput = {
    resolution_id: "SYN-FORGED-RESOLUTION",
    event_id: "SYN-FORGED-RESOLUTION-EVENT",
    case_id: CASE_ID,
    check_id: "SYN-CHECK-R3-001",
    decision: "forged_keep_separate",
    principal: validPrincipal,
    authorization_policy_version: "synthetic-w3-allowlist@1.0.0-draft.2",
    reason: "合成仓储边界测试",
    decided_at: "2026-08-01T03:00:00.000Z",
  };
  await assert.rejects(
    resolutionHarness.repository.resolveSameEventCheck(resolutionInput),
    /decision|authorization|invariant/i,
  );
  await assert.rejects(
    resolutionHarness.repository.resolveSameEventCheck({
      ...resolutionInput,
      decision: "keep_separate",
      principal: { ...validPrincipal, authority_source: "self_declared" },
    }),
    /principal|authorization|invariant/i,
  );
  assert.equal(resolutionHarness.repository.sameEventResolutionsByCaseId.size, 0);

  resolutionHarness.repository.sameEventResolutionsByCaseId.set(CASE_ID, {
    ...resolutionInput,
    decision: "forged_keep_separate",
  });
  const forgedRead = await advanceToEntityGate(resolutionHarness, "SYN-W3-FORGED-RESOLUTION-READ");
  assert.equal(forgedRead.status, "failed");
  assert.equal(forgedRead.output.error_class, "invariant_violation");
  assert.equal(resolutionHarness.ai_runner.calls.length, 0);

  const orphanHarness = await makeHarness({ scripts: { N4: [n4Envelope()] } });
  await advanceToEntityGate(orphanHarness, "SYN-W3-ORPHAN-PROPOSAL-SEED");
  const orphanProposal = structuredClone(orphanHarness.repository.entityProposalsByCaseId.get(CASE_ID));
  orphanHarness.repository.entityProposalsByCaseId.delete(CASE_ID);
  orphanHarness.repository.casesById.delete(CASE_ID);
  await assert.rejects(
    inControlledW3RepositoryContext(
      orphanHarness.repository,
      "SYN-W3-ORPHAN-PROPOSAL-CONTEXT",
      () => orphanHarness.repository.saveEntityProposalIfAbsent(orphanProposal),
    ),
    /case|invariant/i,
  );
  assert.equal(orphanHarness.repository.entityProposalsByCaseId.size, 0);

  const wrongProposalGate = await makeHarness({ scripts: { N4: [n4Envelope()] } });
  await advanceToEntityGate(wrongProposalGate, "SYN-W3-WRONG-PROPOSAL-GATE-SEED");
  const gateProposal = structuredClone(wrongProposalGate.repository.entityProposalsByCaseId.get(CASE_ID));
  wrongProposalGate.repository.entityProposalsByCaseId.delete(CASE_ID);
  const wrongGateCase = wrongProposalGate.repository.casesById.get(CASE_ID);
  wrongProposalGate.repository.casesById.set(CASE_ID, {
    ...wrongGateCase,
    status: "待补充",
    workflow_readiness: "awaiting_formal_entity_confirmation",
  });
  await assert.rejects(
    inControlledW3RepositoryContext(
      wrongProposalGate.repository,
      "SYN-W3-WRONG-PROPOSAL-GATE-CONTEXT",
      () => wrongProposalGate.repository.saveEntityProposalIfAbsent(gateProposal),
    ),
    /state|gate|invariant/i,
  );

  const wrongFormalGate = await makeHarness({ scripts: { N4: [n4Envelope()] } });
  await advanceToEntityGate(wrongFormalGate, "SYN-W3-WRONG-FORMAL-GATE-N4");
  const caseAtFormalGate = structuredClone(await wrongFormalGate.repository.findCaseById(CASE_ID));
  const formalResult = await confirmEntity(wrongFormalGate, "SYN-W3-WRONG-FORMAL-GATE-CONFIRM");
  const formalDecision = structuredClone(formalResult.output.human_decision);
  wrongFormalGate.repository.formalEntityDecisionsByCaseId.delete(CASE_ID);
  wrongFormalGate.repository.casesById.set(CASE_ID, {
    ...caseAtFormalGate,
    status: "待补充",
  });
  await assert.rejects(
    wrongFormalGate.repository.confirmFormalEntity({ decision: formalDecision }),
    /state|gate|invariant/i,
  );

  async function dispatchSnapshots(prefix) {
    const harness = await makeHarness({ scripts: { N4: [n4Envelope()], N6: [n6Envelope()] } });
    const proposal = await prepareRoutingGate(harness, `${prefix}-PREPARE`);
    const caseAtRoutingGate = structuredClone(await harness.repository.findCaseById(CASE_ID));
    const created = await (await importBuilt("src/neoloop/workflows/index.js")).runW3(
      routingCommand(`${prefix}-DISPATCH`, proposal, proposal.candidates[0]),
      ports(harness),
    );
    const committedCase = structuredClone(created.output.case);
    const workOrder = structuredClone(created.output.work_order);
    const decision = structuredClone(created.output.human_decision);
    harness.repository.casesById.set(CASE_ID, structuredClone(caseAtRoutingGate));
    harness.repository.workOrdersById.clear();
    harness.repository.workOrderByCaseId.clear();
    harness.repository.routingDecisionsByCaseId.clear();
    return { harness, caseAtRoutingGate, committedCase, workOrder, decision };
  }

  const bypass = await dispatchSnapshots("SYN-W3-DISPATCH-BYPASS");
  const bypassCase = {
    ...bypass.caseAtRoutingGate,
    status: "待补充",
    workflow_readiness: "awaiting_formal_entity_confirmation",
  };
  bypass.harness.repository.casesById.set(CASE_ID, structuredClone(bypassCase));
  await assert.rejects(
    bypass.harness.repository.createDispatchIfAbsent({
      expected_case: bypassCase,
      next_case: bypass.committedCase,
      work_order: bypass.workOrder,
      decision: bypass.decision,
    }),
    /state|gate|invariant/i,
  );
  assert.equal(bypass.harness.repository.workOrdersById.size, 0);

  const rewrittenSla = await dispatchSnapshots("SYN-W3-DISPATCH-SLA-REWRITE");
  const forgedStart = "2026-08-01T02:31:00.000Z";
  const forgedDue = "2026-08-01T02:46:00.000Z";
  await assert.rejects(
    rewrittenSla.harness.repository.createDispatchIfAbsent({
      expected_case: rewrittenSla.caseAtRoutingGate,
      next_case: {
        ...rewrittenSla.committedCase,
        sla_started_at: forgedStart,
        sla_due_at: forgedDue,
      },
      work_order: { ...rewrittenSla.workOrder, due_at: forgedDue },
      decision: rewrittenSla.decision,
    }),
    /SLA|feedback|invariant/i,
  );
  assert.equal(rewrittenSla.harness.repository.workOrdersById.size, 0);
});

test("W3 repository rejects N4 proposals when synthetic entity references are unsafe or relationally inconsistent", async () => {
  const n4 = n4Envelope();
  const proposal = {
    proposal_id: "SYN-ENTITY-PROPOSAL-REFERENCE-BOUNDARY",
    case_id: CASE_ID,
    node_run_id: n4.run_id,
    node_version: n4.version,
    input_hash: "c".repeat(64),
    candidates: structuredClone(n4.payload.candidate_objects),
    evidence_spans: structuredClone(n4.evidence_spans),
    created_at: "2026-08-01T03:00:00.000Z",
  };
  const corruptions = [
    ["non-synthetic vehicle reference", (repository) => {
      const vehicle = repository.vehiclesById.get(VEHICLE_ID);
      repository.vehiclesById.set(VEHICLE_ID, { ...vehicle, data_scope: "enterprise_real" });
    }],
    ["vehicle exposes controls", (repository) => {
      const vehicle = repository.vehiclesById.get(VEHICLE_ID);
      repository.vehiclesById.set(VEHICLE_ID, { ...vehicle, controls_available: true });
    }],
    ["task is mutable by NeoLoop", (repository) => {
      const task = repository.deliveryTasksById.get(TASK_ID);
      repository.deliveryTasksById.set(TASK_ID, { ...task, state_mutable_by_neoloop: true });
    }],
    ["vehicle-task-station relationship disagrees", (repository) => {
      const task = repository.deliveryTasksById.get(TASK_ID);
      repository.deliveryTasksById.set(TASK_ID, {
        ...task,
        station_id: "SYN-STATION-NOT-BOUND-TO-CASE",
      });
    }],
  ];

  for (const [label, corrupt] of corruptions) {
    const harness = await makeHarness();
    const beforeCase = structuredClone(await harness.repository.findCaseById(CASE_ID));
    corrupt(harness.repository);

    await assert.rejects(
      inControlledW3RepositoryContext(
        harness.repository,
        `SYN-W3-REFERENCE-BOUNDARY-${label}`,
        () => harness.repository.saveEntityProposalIfAbsent(structuredClone(proposal)),
      ),
      /synthetic|reference|gate|invariant/i,
      label,
    );

    assert.equal(harness.repository.entityProposalsByCaseId.size, 0, label);
    assert.equal(harness.repository.formalEntityDecisionsByCaseId.size, 0, label);
    assert.equal(harness.repository.routingProposalsByCaseId.size, 0, label);
    assert.equal(harness.repository.routingDecisionsByCaseId.size, 0, label);
    assert.equal(harness.repository.workOrdersById.size, 0, label);
    assert.deepEqual(await harness.repository.findCaseById(CASE_ID), beforeCase, label);
  }
});

test("W3 repository human-write ports reject fully shaped literal authorization without an opaque capability", async () => {
  const { createWorkflowEventFingerprint, runW3 } = await importBuilt("src/neoloop/workflows/index.js");
  const principal = {
    principal_id: HUMAN.actor_id,
    principal_type: "synthetic_human",
    canonical_role: CANONICAL_HUMAN_ROLE,
    authority_source: "synthetic_allowlist",
  };
  const policyVersion = "synthetic-w3-allowlist@1.0.0-draft.2";

  const resolutionHarness = await makeHarness({ check: "candidate" });
  await assert.rejects(
    resolutionHarness.repository.resolveSameEventCheck({
      resolution_id: "SYN-LITERAL-RESOLUTION",
      event_id: "SYN-LITERAL-RESOLUTION-EVENT",
      case_id: CASE_ID,
      check_id: "SYN-CHECK-R3-001",
      decision: "keep_separate",
      principal,
      authorization_policy_version: policyVersion,
      reason: "字段完整但没有可信 capability",
      decided_at: "2026-08-01T03:00:00.000Z",
    }),
    /authorization capability/i,
  );
  assert.equal(resolutionHarness.repository.sameEventResolutionsByCaseId.size, 0);

  const formalHarness = await makeHarness({ scripts: { N4: [n4Envelope()] } });
  await advanceToEntityGate(formalHarness, "SYN-LITERAL-FORMAL-N4");
  const entityProposal = structuredClone(formalHarness.repository.entityProposalsByCaseId.get(CASE_ID));
  const formalEntity = { vehicle_id: VEHICLE_ID, task_id: TASK_ID, station_id: STATION_ID };
  const proposalRef = {
    proposal_type: "entity_proposal",
    proposal_id: entityProposal.proposal_id,
    node_run_id: entityProposal.node_run_id,
    input_hash: entityProposal.input_hash,
  };
  const formalFingerprint = createWorkflowEventFingerprint({
    action: "confirm_formal_entity",
    case_id: CASE_ID,
    authorization_policy_version: policyVersion,
    principal,
    proposal_ref: proposalRef,
    formal_entity: formalEntity,
  });
  await assert.rejects(
    formalHarness.repository.confirmFormalEntity({
      decision: {
        decision_id: "SYN-LITERAL-FORMAL-DECISION",
        decision_fingerprint: formalFingerprint,
        event_id: "SYN-LITERAL-FORMAL-EVENT",
        case_id: CASE_ID,
        action: "confirm_formal_entity",
        authorization_state: "authorized",
        authorization_policy_version: policyVersion,
        principal,
        proposal_ref: proposalRef,
        formal_entity: formalEntity,
        evidence_spans: structuredClone(entityProposal.evidence_spans),
        decided_at: "2026-08-01T03:00:00.000Z",
      },
    }),
    /authorization capability/i,
  );
  assert.equal(formalHarness.repository.formalEntityDecisionsByCaseId.size, 0);

  const routingHarness = await makeHarness({ scripts: { N4: [n4Envelope()], N6: [n6Envelope()] } });
  const routingProposal = await prepareRoutingGate(routingHarness, "SYN-LITERAL-ROUTING-PREPARE");
  const expectedCase = structuredClone(await routingHarness.repository.findCaseById(CASE_ID));
  const committed = await runW3(
    routingCommand("SYN-LITERAL-ROUTING-SOURCE", routingProposal, routingProposal.candidates[0]),
    ports(routingHarness),
  );
  const nextCase = structuredClone(committed.output.case);
  const workOrder = structuredClone(committed.output.work_order);
  const routingDecision = structuredClone(committed.output.human_decision);
  routingHarness.repository.casesById.set(CASE_ID, structuredClone(expectedCase));
  routingHarness.repository.workOrdersById.clear();
  routingHarness.repository.workOrderByCaseId.clear();
  routingHarness.repository.routingDecisionsByCaseId.clear();
  await assert.rejects(
    routingHarness.repository.createDispatchIfAbsent({
      expected_case: expectedCase,
      next_case: nextCase,
      work_order: workOrder,
      decision: routingDecision,
    }),
    /authorization capability/i,
  );
  assert.equal(routingHarness.repository.workOrdersById.size, 0);
  assert.equal(routingHarness.repository.routingDecisionsByCaseId.size, 0);
});

test("W3 rejects forged or replayed opaque grants and never serializes the capability", async () => {
  const { createW3AuthorizationGrantChannel, runW3 } = await importBuilt("src/neoloop/workflows/index.js");
  const harness = await makeHarness({ check: "candidate" });
  const trustedAuthorizer = harness.action_authorizer;
  harness.action_authorizer = {
    calls: trustedAuthorizer.calls,
    async authorize(input) {
      const decision = await trustedAuthorizer.authorize(input);
      return decision.authorized ? { ...decision, grant: Object.freeze({}) } : decision;
    },
  };
  const input = command("SYN-W3-FORGED-CAPABILITY", "resolve_same_event", {
    actor: HUMAN,
    check_id: "SYN-CHECK-R3-001",
    decision: "keep_separate",
    reason: "合成 capability 伪造测试",
  });
  const forged = await runW3(input, ports(harness));
  const forgedReplay = await runW3(structuredClone(input), ports(harness));
  assert.equal(forged.status, "failed");
  assert.equal(forged.output.error_class, "authorization_capability_invalid");
  assert.equal(forged.output.action_authorization.state, "indeterminate");
  assert.equal(forgedReplay.status, "failed");
  assert.equal(forgedReplay.output.event_replayed, true);
  assert.equal(trustedAuthorizer.calls.length, 1);
  assert.equal(harness.repository.sameEventResolutionsByCaseId.size, 0);

  const otherChannel = createW3AuthorizationGrantChannel();
  const claims = {
    workflow: "W3",
    event_id: "SYN-W3-CAPABILITY-CONTEXT",
    case_id: CASE_ID,
    action: "resolve_same_event",
    target_fingerprint: "a".repeat(64),
    command_fingerprint: "b".repeat(64),
    principal: {
      principal_id: HUMAN.actor_id,
      principal_type: "synthetic_human",
      canonical_role: CANONICAL_HUMAN_ROLE,
      authority_source: "synthetic_allowlist",
    },
    policy_version: "synthetic-w3-allowlist@1.0.0-draft.2",
  };
  await assert.rejects(
    harness.repository.runAuthorizedW3Action(
      { grant: otherChannel.issuer.issue(claims), claims },
      async () => "must-not-run",
    ),
    /capability/i,
  );
  const recognizedButOutOfContext = harness.authorization_grant_channel.issuer.issue(claims);
  await assert.rejects(
    harness.repository.runAuthorizedW3Action(
      { grant: recognizedButOutOfContext, claims },
      async () => "must-not-run",
    ),
    /claims|context/i,
  );
  await assert.rejects(
    harness.repository.runAuthorizedW3Action(
      { grant: recognizedButOutOfContext, claims },
      async () => "must-not-run",
    ),
    /unknown|consumed/i,
  );
  assert.equal(JSON.stringify({ result: forged, audits: harness.audit.records }).includes("grant"), false);
});

test("W3 replays a completed human decision as idempotent without repeating authorization or writes", async () => {
  const { runW3 } = await importBuilt("src/neoloop/workflows/index.js");
  const harness = await makeHarness({ check: "candidate" });
  const input = command("SYN-W3-REPLAY-COMPLETED", "resolve_same_event", {
    actor: HUMAN,
    check_id: "SYN-CHECK-R3-001",
    decision: "keep_separate",
    reason: "合成人工确认不同事件",
  });

  const first = await runW3(input, ports(harness));
  const replay = await runW3(structuredClone(input), ports(harness));

  assert.equal(first.status, "completed");
  assert.equal(first.output.action_authorization.state, "authorized");
  assert.equal(first.output.action_authorization.principal.canonical_role, CANONICAL_HUMAN_ROLE);
  assert.equal(first.output.human_decision.action, "resolve_same_event");
  assert.equal(first.output.human_decision.authorization_state, "authorized");
  assert.equal(first.output.human_decision.proposal_ref.check_id, "SYN-CHECK-R3-001");
  assert.equal(first.output.human_decision.principal.canonical_role, CANONICAL_HUMAN_ROLE);
  assert.equal(replay.status, "idempotent");
  assert.equal(replay.output.event_replayed, true);
  assert.equal(replay.output.action_authorization.state, "authorized");
  assert.equal(replay.output.human_decision.decision_id, first.output.human_decision.decision_id);
  const audit = harness.audit.records.find((record) =>
    record.category === "workflow" && record.payload.event_id === input.event_id
  );
  assert.equal(audit.payload.result.output.human_decision.decision_id, first.output.human_decision.decision_id);
  assert.equal(JSON.stringify({ first, replay, audit }).includes("grant"), false);
  assert.equal(harness.action_authorizer.calls.length, 1);
  assert.equal(harness.repository.sameEventResolutionsByCaseId.size, 1);
});

test("W3 rejects missing, failed, pending, and forged W6 same-event preconditions before N4", async () => {
  const { runW3 } = await importBuilt("src/neoloop/workflows/index.js");
  for (const check of ["missing", "failed", "candidate"]) {
    const harness = await makeHarness({ check, scripts: { N4: [n4Envelope()] } });
    const result = await runW3(command(`SYN-W3-PRE-${check}`, "advance"), ports(harness));
    assert.notEqual(result.status, "completed", check);
    assert.equal(harness.ai_runner.calls.length, 0, check);
    assert.equal(harness.repository.workOrdersById.size, 0, check);
    assert.equal((await harness.repository.findCaseById(CASE_ID)).formal_entity, null, check);
  }

  const forged = await makeHarness({ check: "not_required", scripts: { N4: [n4Envelope()] } });
  forged.repository.sameEventChecksByCaseId.get(CASE_ID).candidate = {
    candidate_case_id: "SYN-FORGED-DUPLICATE",
    similarity: 0.99,
  };
  const forgedResult = await runW3(command("SYN-W3-PRE-FORGED", "advance"), ports(forged));
  assert.equal(forgedResult.status, "failed");
  assert.equal(forged.ai_runner.calls.length, 0);

  const keptSeparate = await makeHarness({ check: "candidate", scripts: { N4: [n4Envelope()] } });
  const keptCheck = keptSeparate.repository.sameEventChecksByCaseId.get(CASE_ID);
  const resolution = await runW3(command("SYN-W3-RESOLVE-KEEP", "resolve_same_event", {
    actor: HUMAN,
    check_id: keptCheck.check_id,
    decision: "keep_separate",
    reason: "合成人工复核确认是不同事件",
  }), ports(keptSeparate));
  assert.equal(resolution.status, "completed");
  const afterResolution = await runW3(command("SYN-W3-AFTER-KEEP", "advance"), ports(keptSeparate));
  assert.equal(afterResolution.status, "needs_human");
  assert.equal(afterResolution.output.gate, "formal_entity_confirmation");
  assert.deepEqual(keptSeparate.ai_runner.calls.map((call) => call.node), ["N4"]);

  const confirmedDuplicate = await makeHarness({ check: "candidate", scripts: { N4: [n4Envelope()] } });
  const duplicateCheck = confirmedDuplicate.repository.sameEventChecksByCaseId.get(CASE_ID);
  const duplicateCaseBefore = structuredClone(await confirmedDuplicate.repository.findCaseById(CASE_ID));
  const duplicateFeedbackBefore = structuredClone(await confirmedDuplicate.repository.findRawFeedbackByCaseId(CASE_ID));
  const duplicateResolution = await runW3(command("SYN-W3-RESOLVE-DUPLICATE", "resolve_same_event", {
    actor: HUMAN,
    check_id: duplicateCheck.check_id,
    decision: "confirmed_duplicate",
    reason: "合成人工复核确认属于同一事件",
  }), ports(confirmedDuplicate));
  assert.equal(duplicateResolution.status, "completed");
  const stopped = await runW3(command("SYN-W3-AFTER-DUPLICATE", "advance"), ports(confirmedDuplicate));
  assert.equal(stopped.status, "needs_human");
  assert.equal(stopped.output.gate, "confirmed_duplicate_follow_up");
  assert.equal(confirmedDuplicate.ai_runner.calls.length, 0);
  assert.equal(confirmedDuplicate.repository.workOrdersById.size, 0);
  assert.deepEqual(await confirmedDuplicate.repository.findCaseById(CASE_ID), duplicateCaseBefore);
  assert.deepEqual(await confirmedDuplicate.repository.findRawFeedbackByCaseId(CASE_ID), duplicateFeedbackBefore);
});

test("W3 rejects a fully shaped same-event keep-separate decision written directly to the public fixture map", async () => {
  const { runW3 } = await importBuilt("src/neoloop/workflows/index.js");
  const harness = await makeHarness({ check: "candidate", scripts: { N4: [n4Envelope()] } });
  harness.repository.sameEventResolutionsByCaseId.set(CASE_ID, {
    resolution_id: "SYN-FORGED-SHAPED-RESOLUTION",
    event_id: "SYN-FORGED-SHAPED-RESOLUTION-EVENT",
    case_id: CASE_ID,
    check_id: "SYN-CHECK-R3-001",
    decision: "keep_separate",
    principal: {
      principal_id: HUMAN.actor_id,
      principal_type: "synthetic_human",
      canonical_role: CANONICAL_HUMAN_ROLE,
      authority_source: "synthetic_allowlist",
    },
    authorization_policy_version: "synthetic-w3-allowlist@1.0.0-draft.2",
    reason: "shape-valid fixture injection without an authorized commit",
    decided_at: "2026-08-01T03:00:00.000Z",
  });

  const result = await runW3(command("SYN-W3-FORGED-SHAPED-RESOLUTION-ADVANCE", "advance"), ports(harness));
  assert.equal(result.status, "failed");
  assert.equal(result.output.error_class, "invariant_violation");
  assert.equal(harness.ai_runner.calls.length, 0);
  assert.equal(harness.repository.entityProposalsByCaseId.size, 0);
});

test("W3 binds duplicate authorization to the immutable W6 candidate and fails closed on authorizer-time replacement", async () => {
  const { runW3 } = await importBuilt("src/neoloop/workflows/index.js");
  const harness = await makeHarness({ check: "candidate" });
  const baseAuthorizer = harness.action_authorizer;
  harness.action_authorizer = {
    calls: baseAuthorizer.calls,
    async authorize(input) {
      const decision = await baseAuthorizer.authorize(input);
      const check = harness.repository.sameEventChecksByCaseId.get(CASE_ID);
      harness.repository.sameEventChecksByCaseId.set(CASE_ID, {
        ...check,
        candidate: { candidate_case_id: "SYN-CASE-R3-REPLACED-DURING-AUTH", similarity: 0.96 },
      });
      return decision;
    },
  };

  const result = await runW3(command("SYN-W3-DUPLICATE-AUTH-TOCTOU", "resolve_same_event", {
    actor: HUMAN,
    check_id: "SYN-CHECK-R3-001",
    decision: "keep_separate",
    reason: "candidate replacement must invalidate the authorization target",
  }), ports(harness));
  assert.equal(result.status, "failed");
  assert.ok(["invariant_violation", "authorization_capability_invalid"].includes(result.output.error_class));
  assert.equal(harness.repository.sameEventResolutionsByCaseId.size, 0);
  assert.equal(harness.ai_runner.calls.length, 0);
  assert.equal(harness.action_authorizer.calls.length, 1);
});

test("W3 rejects non-synthetic case, feedback, entity references, and cross-case bundles before AI or dispatch", async () => {
  const mutations = [
    ["case-scope", (harness) => {
      harness.repository.casesById.get(CASE_ID).data_scope = "production_data";
    }],
    ["case-source-kind", (harness) => {
      harness.repository.casesById.get(CASE_ID).source_kind = "registration_workbook";
    }],
    ["feedback-evidence", (harness) => {
      harness.repository.rawFeedbackById.get(FEEDBACK_ID).request.evidence_class = "enterprise_pending";
    }],
    ["vehicle-reference", (harness) => {
      harness.repository.vehiclesById.get(VEHICLE_ID).data_scope = "production_data";
    }],
    ["cross-case-bundle", (harness) => {
      const original = harness.repository.findR3ReferenceDataForCase.bind(harness.repository);
      harness.repository.findR3ReferenceDataForCase = async (caseId) => {
        const bundle = await original(caseId);
        return { ...bundle, case_record: { ...bundle.case_record, case_id: "SYN-CROSS-CASE" } };
      };
    }],
  ];

  for (const [label, mutate] of mutations) {
    const harness = await makeHarness({ scripts: { N4: [n4Envelope()] } });
    mutate(harness);
    const result = await advanceToEntityGate(harness, `SYN-W3-SYNTHETIC-${label}`);
    assert.equal(result.status, "failed", label);
    assert.equal(result.output.error_class, "synthetic_boundary_violation", label);
    assert.equal(harness.ai_runner.calls.length, 0, label);
    assert.equal(harness.repository.entityProposalsByCaseId.size, 0, label);
    assert.equal(harness.repository.workOrdersById.size, 0, label);
  }

  const routingReference = await makeHarness({ scripts: { N4: [n4Envelope()], N6: [n6Envelope()] } });
  await advanceToEntityGate(routingReference, "SYN-W3-SYNTHETIC-ROUTE-N4");
  await confirmEntity(routingReference, "SYN-W3-SYNTHETIC-ROUTE-ENTITY");
  routingReference.repository.routingRulesById.get("SYN-ROUTING-002").data_scope = "production_data";
  const routingResult = await advanceToRoutingGate(routingReference, "SYN-W3-SYNTHETIC-ROUTE-N6");
  assert.equal(routingResult.status, "failed");
  assert.equal(routingResult.output.error_class, "synthetic_boundary_violation");
  assert.equal(routingReference.ai_runner.calls.filter((call) => call.node === "N6").length, 0);
  assert.equal(routingReference.repository.routingProposalsByCaseId.size, 0);
  assert.equal(routingReference.repository.workOrdersById.size, 0);
});

test("W3 routing confirmation requires the persisted formal-entity status and routing-gate readiness", async () => {
  const { runW3 } = await importBuilt("src/neoloop/workflows/index.js");
  for (const [label, mutate] of [
    ["unconfirmed-entity", (record) => { record.formal_entity_confirmation_status = "待人工确认"; }],
    ["wrong-readiness", (record) => { record.workflow_readiness = "awaiting_responsibility_routing"; }],
  ]) {
    const harness = await makeHarness({ scripts: { N4: [n4Envelope()], N6: [n6Envelope()] } });
    const proposal = await prepareRoutingGate(harness, `SYN-W3-GATE-${label}`);
    mutate(harness.repository.casesById.get(CASE_ID));
    const result = await runW3(
      routingCommand(`SYN-W3-GATE-CONFIRM-${label}`, proposal, proposal.candidates[0]),
      ports(harness),
    );
    assert.equal(result.status, "failed", label);
    assert.equal(result.output.error_class, "human_gate_error", label);
    assert.equal(harness.repository.workOrdersById.size, 0, label);
    assert.equal(harness.repository.routingDecisionsByCaseId.size, 0, label);
  }
});

test("W3 requires a persisted, matching formal-entity human decision before N6 or dispatch", async () => {
  const { runW3 } = await importBuilt("src/neoloop/workflows/index.js");
  const missing = await makeHarness({ scripts: { N4: [n4Envelope()], N6: [n6Envelope()] } });
  await advanceToEntityGate(missing, "SYN-W3-FORMAL-DECISION-MISSING-N4");
  const forgedCase = missing.repository.casesById.get(CASE_ID);
  missing.repository.casesById.set(CASE_ID, {
    ...forgedCase,
    formal_entity: { vehicle_id: VEHICLE_ID, task_id: TASK_ID, station_id: STATION_ID },
    formal_entity_confirmation_status: "已人工确认",
    workflow_readiness: "awaiting_responsibility_routing",
  });
  const missingResult = await advanceToRoutingGate(missing, "SYN-W3-FORMAL-DECISION-MISSING-N6");
  assert.equal(missingResult.status, "failed");
  assert.equal(missingResult.output.error_class, "invariant_violation");
  assert.equal(missing.ai_runner.calls.filter((call) => call.node === "N6").length, 0);
  assert.equal(missing.repository.routingProposalsByCaseId.size, 0);

  const mismatch = await makeHarness({ scripts: { N4: [n4Envelope()], N6: [n6Envelope()] } });
  await advanceToEntityGate(mismatch, "SYN-W3-FORMAL-DECISION-MISMATCH-N4");
  await confirmEntity(mismatch, "SYN-W3-FORMAL-DECISION-MISMATCH-CONFIRM");
  mismatch.repository.formalEntityDecisionsByCaseId.get(CASE_ID).formal_entity.vehicle_id = "SYN-FORGED-VEHICLE";
  const mismatchResult = await advanceToRoutingGate(mismatch, "SYN-W3-FORMAL-DECISION-MISMATCH-N6");
  assert.equal(mismatchResult.status, "failed");
  assert.equal(mismatchResult.output.error_class, "invariant_violation");
  assert.equal(mismatch.ai_runner.calls.filter((call) => call.node === "N6").length, 0);

  const dispatch = await makeHarness({ scripts: { N4: [n4Envelope()], N6: [n6Envelope()] } });
  const proposal = await prepareRoutingGate(dispatch, "SYN-W3-FORMAL-DECISION-DISPATCH");
  dispatch.repository.formalEntityDecisionsByCaseId.delete(CASE_ID);
  const dispatchResult = await runW3(
    routingCommand("SYN-W3-FORMAL-DECISION-DISPATCH-CONFIRM", proposal, proposal.candidates[0]),
    ports(dispatch),
  );
  assert.equal(dispatchResult.status, "failed");
  assert.equal(dispatchResult.output.error_class, "invariant_violation");
  assert.equal(dispatch.repository.workOrdersById.size, 0);
  assert.equal(dispatch.repository.routingDecisionsByCaseId.size, 0);
});

test("W3 runs N4 once, persists only evidence-backed candidates, and stops at the formal-entity gate", async () => {
  const harness = await makeHarness({ scripts: { N4: [n4Envelope()] } });
  const result = await advanceToEntityGate(harness);
  const storedCase = await harness.repository.findCaseById(CASE_ID);

  assert.equal(result.status, "needs_human");
  assert.equal(result.output.gate, "formal_entity_confirmation");
  assert.deepEqual(harness.ai_runner.calls.map((call) => call.node), ["N4"]);
  assert.equal(storedCase.formal_entity, null);
  assert.equal(storedCase.formal_entity_confirmation_status, "待人工确认");
  assert.equal(harness.repository.entityProposalsByCaseId.size, 1);
  assert.equal(harness.repository.routingProposalsByCaseId.size, 0);
  assert.equal(harness.repository.workOrdersById.size, 0);
  assert.equal(typeof harness.repository.controlVehicle, "undefined");
});

test("W3 rebinds N4 envelopes to the exact request, case, evidence bounds, and reference bundle", async () => {
  const attacks = [
    ["extra-envelope-tool-field", (value) => { value.tool_calls = [{ name: "control_vehicle" }]; }],
    ["cross-case", (value) => { value.object_ref.object_id = "SYN-CROSS-CASE"; }],
    ["wrong-node", (value) => { value.node = "N5"; }],
    ["wrong-mode", (value) => { value.mode = "cross_event_clustering"; }],
    ["wrong-version", (value) => { value.version = "N4-forged"; }],
    ["wrong-hash", (value) => { value.input_hash = "f".repeat(64); }],
    ["out-of-bounds-evidence", (value) => { value.payload.candidate_objects[0].evidence_span_indices = [99]; }],
    ["forged-evidence-source", (value) => { value.evidence_spans[1].source_ref = "forged:vehicle"; }],
    ["non-input-candidate", (value) => { value.payload.candidate_objects[0].object_id = "SYN-UNKNOWN-VEHICLE"; }],
  ];

  for (const [label, mutate] of attacks) {
    const response = n4Envelope();
    mutate(response);
    const harness = await makeHarness({ scripts: { N4: [response] } });
    const result = await advanceToEntityGate(harness, `SYN-W3-N4-BIND-${label}`);
    assert.equal(result.status, "failed", label);
    assert.equal(result.output.error_class, "ai_binding_error", label);
    assert.equal(harness.ai_runner.calls.length, 1, label);
    assert.equal(harness.repository.entityProposalsByCaseId.size, 0, label);
    assert.equal(harness.repository.routingProposalsByCaseId.size, 0, label);
    assert.equal(harness.repository.workOrdersById.size, 0, label);
  }
});

test("W3 rebinds N6 candidates to persisted rules and rejects overlapping or out-of-range evidence", async () => {
  const attacks = [
    ["extra-envelope-final-field", (value) => { value.final_responsibility = "forged"; }],
    ["cross-case", (value) => { value.object_ref.object_id = "SYN-CROSS-CASE"; }],
    ["wrong-node", (value) => { value.node = "N5"; }],
    ["wrong-mode", (value) => { value.mode = "root_cause_hypothesis"; }],
    ["wrong-version", (value) => { value.version = "N6-forged"; }],
    ["wrong-hash", (value) => { value.input_hash = "e".repeat(64); }],
    ["out-of-bounds", (value) => { value.payload.candidates[0].supporting_evidence_indices = [99]; }],
    ["support-counter-overlap", (value) => {
      value.payload.candidates[0].supporting_evidence_indices = [1];
      value.payload.candidates[0].counter_evidence_indices = [1];
    }],
    ["forged-rule-evidence-source", (value) => { value.evidence_spans[1].source_ref = "forged:routing-rule"; }],
    ["forged-rule-evidence-quote", (value) => { value.evidence_spans[1].quote = "forged route evidence"; }],
    ["non-input-route", (value) => { value.payload.candidates[0].routing_rule_id = "SYN-ROUTING-UNKNOWN"; }],
    ["forged-team", (value) => { value.payload.candidates[0].candidate_team = "未经矩阵支持的团队"; }],
    ["forged-role", (value) => { value.payload.candidates[0].candidate_logical_role = "最终责任人"; }],
    ["forged-rule-version", (value) => { value.payload.candidates[0].rule_version = "routing-matrix@forged"; }],
    ["forged-sla-version", (value) => { value.payload.candidates[0].sla_rule_version = "sla@forged"; }],
  ];

  for (const [label, mutate] of attacks) {
    const response = n6Envelope();
    mutate(response);
    const harness = await makeHarness({ scripts: { N4: [n4Envelope()], N6: [response] } });
    await advanceToEntityGate(harness, `SYN-W3-N6-BIND-${label}-N4`);
    await confirmEntity(harness, `SYN-W3-N6-BIND-${label}-ENTITY`);
    const result = await advanceToRoutingGate(harness, `SYN-W3-N6-BIND-${label}`);
    assert.equal(result.status, "failed", label);
    assert.equal(result.output.error_class, "ai_binding_error", label);
    assert.equal(harness.ai_runner.calls.filter((call) => call.node === "N6").length, 1, label);
    assert.equal(harness.repository.routingProposalsByCaseId.size, 0, label);
    assert.equal(harness.repository.workOrdersById.size, 0, label);
  }
});

test("W3 degrades N4 business gaps to 待补充 but preserves 待关联 on refusal or infrastructure failure", async () => {
  const missing = await makeHarness({
    scripts: { N4: [n4Envelope({ payload: null, status: "needs_human", missing_fields: ["task_id"], confidence: null, human_revision: { state: "pending" } })] },
  });
  const missingResult = await advanceToEntityGate(missing, "SYN-W3-N4-MISSING");
  assert.equal(missingResult.status, "needs_human");
  assert.equal((await missing.repository.findCaseById(CASE_ID)).status, "待补充");
  assert.equal(missing.repository.workOrdersById.size, 0);

  for (const [label, response] of [
    ["refused", n4Envelope({ payload: null, status: "refused", confidence: null, human_revision: { state: "pending" } })],
    ["upstream", new Error("synthetic N4 upstream unavailable")],
  ]) {
    const harness = await makeHarness({ scripts: { N4: [response] } });
    const before = structuredClone(await harness.repository.findCaseById(CASE_ID));
    const result = await advanceToEntityGate(harness, `SYN-W3-N4-${label}`);
    assert.notEqual(result.status, "completed", label);
    assert.deepEqual(await harness.repository.findCaseById(CASE_ID), before, label);
    assert.equal(harness.repository.workOrdersById.size, 0, label);
  }
});

test("W3 preserves the confirmed entity and empty SLA snapshot across N6 human, refusal, error, and upstream stops", async () => {
  for (const [label, response, expectedErrorClass] of [
    [
      "needs-human",
      n6Envelope({
        payload: null,
        status: "needs_human",
        missing_fields: ["responsibility_matrix_review"],
        confidence: null,
        human_revision: { state: "pending" },
      }),
      "ai_needs_human",
    ],
    [
      "refused",
      n6Envelope({
        payload: null,
        status: "refused",
        confidence: null,
        human_revision: { state: "pending" },
      }),
      "ai_refused",
    ],
    [
      "error",
      n6Envelope({
        payload: null,
        status: "error",
        confidence: null,
        human_revision: { state: "pending" },
      }),
      "ai_error",
    ],
    ["upstream", new Error("synthetic N6 upstream unavailable"), "ai_runner_error"],
  ]) {
    const harness = await makeHarness({ scripts: { N4: [n4Envelope()], N6: [response] } });
    await advanceToEntityGate(harness, `SYN-W3-N6-STOP-${label}-N4`);
    await confirmEntity(harness, `SYN-W3-N6-STOP-${label}-ENTITY`);
    const before = structuredClone(await harness.repository.findCaseById(CASE_ID));
    const eventId = `SYN-W3-N6-STOP-${label}`;

    const result = await advanceToRoutingGate(harness, eventId);

    assert.equal(result.status, "needs_human", label);
    assert.equal(result.output.error_class, expectedErrorClass, label);
    assert.deepEqual(await harness.repository.findCaseById(CASE_ID), before, label);
    assert.equal(before.formal_entity_confirmation_status, "已人工确认", label);
    assert.equal(before.workflow_readiness, "awaiting_responsibility_routing", label);
    assert.equal(before.sla_started_at, null, label);
    assert.equal(before.sla_due_at, null, label);
    assert.equal(harness.repository.routingProposalsByCaseId.size, 0, label);
    assert.equal(harness.repository.workOrdersById.size, 0, label);
    assert.ok(harness.audit.records.some((record) =>
      record.category === "workflow" &&
      record.payload.event_id === eventId &&
      record.payload.result.output.error_class === expectedErrorClass
    ), label);
  }
});

test("W3 formal-entity confirmation requires an authorized decision bound to the stored proposal before N6", async () => {
  const { runW3 } = await importBuilt("src/neoloop/workflows/index.js");
  const harness = await makeHarness({ scripts: { N4: [n4Envelope()], N6: [n6Envelope()] } });
  await advanceToEntityGate(harness);
  const proposal = harness.repository.entityProposalsByCaseId.get(CASE_ID);

  for (const extra of [
    { actor: { ...HUMAN, type: "workflow" }, entity_proposal_id: proposal.proposal_id, formal_entity: { vehicle_id: VEHICLE_ID, task_id: TASK_ID, station_id: STATION_ID } },
    { actor: HUMAN, entity_proposal_id: "SYN-STALE-PROPOSAL", formal_entity: { vehicle_id: VEHICLE_ID, task_id: TASK_ID, station_id: STATION_ID } },
    { actor: HUMAN, entity_proposal_id: proposal.proposal_id, formal_entity: { vehicle_id: "SYN-UNKNOWN", task_id: TASK_ID, station_id: STATION_ID } },
  ]) {
    const result = await runW3(command(`SYN-W3-BAD-ENTITY-${extra.entity_proposal_id}-${extra.formal_entity.vehicle_id}`, "confirm_formal_entity", extra), ports(harness));
    assert.equal(result.status, "failed");
    assert.equal((await harness.repository.findCaseById(CASE_ID)).formal_entity, null);
  }

  const confirmed = await confirmEntity(harness);
  assert.equal(confirmed.status, "completed");
  assert.equal(confirmed.output.action_authorization.state, "authorized");
  assert.equal(confirmed.output.action_authorization.principal.canonical_role, CANONICAL_HUMAN_ROLE);
  const entityDecision = confirmed.output.human_decision;
  assert.equal(entityDecision.action, "confirm_formal_entity");
  assert.equal(entityDecision.authorization_state, "authorized");
  assert.equal(entityDecision.principal.canonical_role, CANONICAL_HUMAN_ROLE);
  assert.equal(entityDecision.proposal_ref.proposal_id, proposal.proposal_id);
  assert.ok(entityDecision.decision_id);
  assert.ok(entityDecision.decided_at);
  assert.equal(harness.repository.formalEntityDecisionsByCaseId.get(CASE_ID).decision_id, entityDecision.decision_id);
  const entityAudit = harness.audit.records.find((record) =>
    record.category === "workflow" && record.payload.event_id === "SYN-W3-EVENT-ENTITY"
  );
  assert.equal(entityAudit.payload.result.output.human_decision.decision_id, entityDecision.decision_id);
  const authorizationsAfterEntity = harness.action_authorizer.calls.length;
  const entityReplay = await confirmEntity(harness);
  assert.equal(entityReplay.status, "idempotent");
  assert.equal(entityReplay.output.event_replayed, true);
  assert.equal(entityReplay.output.human_decision.decision_id, entityDecision.decision_id);
  assert.equal(harness.action_authorizer.calls.length, authorizationsAfterEntity);
  assert.deepEqual((await harness.repository.findCaseById(CASE_ID)).formal_entity, {
    vehicle_id: VEHICLE_ID,
    task_id: TASK_ID,
    station_id: STATION_ID,
  });
  assert.equal(harness.ai_runner.calls.filter((call) => call.node === "N6").length, 0);

  const routing = await advanceToRoutingGate(harness);
  assert.equal(routing.status, "needs_human");
  assert.equal(routing.output.gate, "responsibility_routing_confirmation");
  assert.deepEqual(harness.ai_runner.calls.map((call) => call.node), ["N4", "N6"]);
  assert.equal(harness.repository.workOrdersById.size, 0);
});

test("W3 creates one 待接单 work order only after human routing confirmation and anchors SLA at received_at", async () => {
  const { runW3 } = await importBuilt("src/neoloop/workflows/index.js");
  const dirtySla = await makeHarness({ scripts: { N4: [n4Envelope()], N6: [n6Envelope()] } });
  const dirtyProposal = await prepareRoutingGate(dirtySla, "SYN-W3-DIRTY-SLA");
  const dirtyCase = dirtySla.repository.casesById.get(CASE_ID);
  dirtySla.repository.casesById.set(CASE_ID, {
    ...dirtyCase,
    sla_started_at: "2026-08-01T00:00:00.000Z",
    sla_due_at: "2026-08-01T00:15:00.000Z",
  });
  const dirtyBefore = structuredClone(await dirtySla.repository.findCaseById(CASE_ID));
  const dirtyResult = await runW3(
    routingCommand("SYN-W3-DIRTY-SLA-CONFIRM", dirtyProposal, dirtyProposal.candidates[0]),
    ports(dirtySla),
  );
  assert.equal(dirtyResult.status, "failed");
  assert.equal(dirtyResult.output.error_class, "invariant_violation");
  assert.deepEqual(await dirtySla.repository.findCaseById(CASE_ID), dirtyBefore);
  assert.equal(dirtySla.repository.workOrdersById.size, 0);

  for (const [label, mutatePolicies] of [
    ["missing", (repository) => repository.slaPoliciesById.clear()],
    ["duplicate", (repository) => {
      const existing = structuredClone(repository.slaPoliciesById.values().next().value);
      existing.policy_id = `${existing.policy_id}-DUPLICATE`;
      repository.slaPoliciesById.set(existing.policy_id, existing);
    }],
  ]) {
    const policyGap = await makeHarness({ scripts: { N4: [n4Envelope()], N6: [n6Envelope()] } });
    const policyProposal = await prepareRoutingGate(policyGap, `SYN-W3-SLA-POLICY-${label}`);
    mutatePolicies(policyGap.repository);
    const gap = await runW3(
      routingCommand(`SYN-W3-SLA-POLICY-${label}-CONFIRM`, policyProposal, policyProposal.candidates[0]),
      ports(policyGap),
    );
    assert.equal(gap.status, "failed", label);
    assert.equal(gap.output.error_class, "sla_policy_gap", label);
    assert.equal(policyGap.repository.workOrdersById.size, 0, label);
    assert.equal(policyGap.repository.routingDecisionsByCaseId.size, 0, label);
  }

  const harness = await makeHarness({ scripts: { N4: [n4Envelope()], N6: [n6Envelope()] } });
  await advanceToEntityGate(harness);
  await confirmEntity(harness);
  await advanceToRoutingGate(harness);
  const proposal = harness.repository.routingProposalsByCaseId.get(CASE_ID);
  const chosen = proposal.candidates[0];
  harness.clock.set("2026-08-01T05:00:00.000Z");

  const bad = await runW3(command("SYN-W3-BAD-ROUTE", "confirm_routing", {
    actor: HUMAN,
    routing_proposal_id: proposal.proposal_id,
    routing_rule_id: chosen.routing_rule_id,
    candidate_team: "未经建议的团队",
    candidate_logical_role: chosen.candidate_logical_role,
    sla_rule_version: chosen.sla_rule_version,
    first_response_target_minutes: 15,
  }), ports(harness));
  assert.equal(bad.status, "failed");
  assert.equal(harness.repository.workOrdersById.size, 0);

  const wrongSla = await runW3(routingCommand(
    "SYN-W3-BAD-SLA-TARGET",
    proposal,
    chosen,
    { first_response_target_minutes: 59 },
  ), ports(harness));
  assert.equal(wrongSla.status, "failed");
  assert.equal(wrongSla.output.error_class, "sla_policy_mismatch");
  assert.equal(harness.repository.workOrdersById.size, 0);

  const routingInput = routingCommand("SYN-W3-CONFIRM-ROUTE", proposal, chosen);
  const result = await runW3(routingInput, ports(harness));
  const storedCase = await harness.repository.findCaseById(CASE_ID);
  const order = await harness.repository.findWorkOrderByCaseId(CASE_ID);

  assert.equal(result.status, "completed");
  assert.equal(result.output.action_authorization.state, "authorized");
  assert.equal(result.output.action_authorization.principal.canonical_role, CANONICAL_HUMAN_ROLE);
  const routingDecision = result.output.human_decision;
  assert.equal(routingDecision.action, "confirm_routing");
  assert.equal(routingDecision.authorization_state, "authorized");
  assert.equal(routingDecision.principal.canonical_role, CANONICAL_HUMAN_ROLE);
  assert.equal(routingDecision.proposal_ref.proposal_id, proposal.proposal_id);
  assert.equal(routingDecision.rule_ref.routing_rule_id, chosen.routing_rule_id);
  assert.equal(routingDecision.rule_ref.sla_rule_version, chosen.sla_rule_version);
  assert.equal(routingDecision.rule_ref.first_response_target_minutes, 15);
  assert.equal(harness.repository.routingDecisionsByCaseId.get(CASE_ID).decision_id, routingDecision.decision_id);
  assert.equal(storedCase.status, "待派单");
  assert.equal(storedCase.sla_started_at, "2026-08-01T02:01:00.000Z");
  assert.equal(storedCase.sla_due_at, "2026-08-01T02:16:00.000Z");
  assert.equal(storedCase.suggested_team, chosen.candidate_team);
  assert.equal(storedCase.routing_rule_candidate_id, chosen.routing_rule_id);
  assert.equal(order.status, "待接单");
  assert.equal(order.team, chosen.candidate_team);
  assert.equal(order.assignee_role, chosen.candidate_logical_role);
  assert.equal(order.due_at, storedCase.sla_due_at);
  assert.equal(order.sla_reset_count, 0);
  assert.equal("sla_started_at" in order, false);
  assert.equal("assignee_id" in order, false);
  assert.equal(harness.repository.workOrdersById.size, 1);
  const routingAudit = harness.audit.records.find((record) =>
    record.category === "workflow" && record.payload.event_id === "SYN-W3-CONFIRM-ROUTE"
  );
  assert.equal(routingAudit.payload.result.output.human_decision.decision_id, routingDecision.decision_id);
  const authorizationsAfterRouting = harness.action_authorizer.calls.length;
  const replay = await runW3(structuredClone(routingInput), ports(harness));
  assert.equal(replay.status, "idempotent");
  assert.equal(replay.output.event_replayed, true);
  assert.equal(replay.output.human_decision.decision_id, routingDecision.decision_id);
  assert.equal(harness.action_authorizer.calls.length, authorizationsAfterRouting);
  assert.equal(harness.repository.workOrdersById.size, 1);
});

test("W3 immutable dispatch receipts survive authorized W4 accept and reassign without hiding the current assignment", async () => {
  const { runW3, runW4 } = await importBuilt("src/neoloop/workflows/index.js");
  const harness = await makeHarness({ scripts: { N4: [n4Envelope()], N6: [n6Envelope()] } });
  const proposal = await prepareRoutingGate(harness, "SYN-W3-W4-CROSS-PREPARE");
  const chosen = proposal.candidates[0];
  const dispatch = await runW3(
    routingCommand("SYN-W3-W4-CROSS-DISPATCH", proposal, chosen),
    ports(harness),
  );
  assert.equal(dispatch.status, "completed");
  const workOrderId = dispatch.output.work_order.work_order_id;
  const originalSla = {
    started_at: dispatch.output.case.sla_started_at,
    due_at: dispatch.output.case.sla_due_at,
    rule_version: dispatch.output.case.sla_rule_version,
  };
  const w4Ports = {
    repository: harness.repository,
    audit: harness.audit,
    clock: harness.clock,
    ids: harness.ids,
    notifier: { async send() {} },
    action_authorizer: { async authorize() { return true; } },
  };
  const accepted = await runW4({
    event_id: "SYN-W4-CROSS-ACCEPT",
    action: "accept",
    work_order_id: workOrderId,
    actor: HUMAN,
  }, w4Ports);
  assert.equal(accepted.status, "completed");
  const reassigned = await runW4({
    event_id: "SYN-W4-CROSS-REASSIGN",
    action: "reassign",
    work_order_id: workOrderId,
    actor: HUMAN,
    team: "SYN-W4-REASSIGNED-TEAM",
    assignee_role: "SYN-W4-REASSIGNED-ROLE",
  }, w4Ports);
  assert.equal(reassigned.status, "completed");

  const aiCallsBefore = harness.ai_runner.calls.length;
  const workOrdersBefore = harness.repository.workOrdersById.size;
  const advanceInput = command("SYN-W3-AFTER-W4-ADVANCE", "advance");
  const advanced = await runW3(advanceInput, ports(harness));
  const replay = await runW3(structuredClone(advanceInput), ports(harness));
  assert.equal(advanced.status, "idempotent");
  assert.equal(replay.status, "idempotent");
  assert.equal(replay.output.event_replayed, true);
  assert.equal(advanced.output.work_order.team, "SYN-W4-REASSIGNED-TEAM");
  assert.equal(advanced.output.work_order.assignee_role, "SYN-W4-REASSIGNED-ROLE");
  assert.equal(advanced.output.case.sla_started_at, originalSla.started_at);
  assert.equal(advanced.output.case.sla_due_at, originalSla.due_at);
  assert.equal(advanced.output.case.sla_rule_version, originalSla.rule_version);
  assert.equal(harness.ai_runner.calls.length, aiCallsBefore);
  assert.equal(harness.repository.workOrdersById.size, workOrdersBefore);

  const routingReplay = await runW3(
    routingCommand("SYN-W3-AFTER-W4-ROUTING", proposal, chosen),
    ports(harness),
  );
  assert.equal(routingReplay.status, "idempotent");
  assert.equal(routingReplay.output.work_order.team, "SYN-W4-REASSIGNED-TEAM");
  assert.equal(routingReplay.output.work_order.assignee_role, "SYN-W4-REASSIGNED-ROLE");
  assert.equal(harness.repository.workOrdersById.size, 1);
  assert.equal(harness.repository.routingDecisionsByCaseId.size, 1);
});

test("W3 atomically rejects concurrent and sequential conflicting routing decisions for one case", async () => {
  const { runW3 } = await importBuilt("src/neoloop/workflows/index.js");
  const concurrent = await makeHarness({ scripts: { N4: [n4Envelope()], N6: [n6Envelope()] } });
  const concurrentProposal = await prepareRoutingGate(concurrent, "SYN-W3-ROUTE-CONCURRENT");
  const [leftCandidate, rightCandidate] = concurrentProposal.candidates;
  const concurrentInputs = [
    routingCommand("SYN-W3-ROUTE-CONCURRENT-LEFT", concurrentProposal, leftCandidate),
    routingCommand("SYN-W3-ROUTE-CONCURRENT-RIGHT", concurrentProposal, rightCandidate),
  ];
  const concurrentResults = await Promise.all(
    concurrentInputs.map((input) => runW3(input, ports(concurrent))),
  );

  assert.equal(concurrentResults.filter((value) => value.status === "completed").length, 1);
  assert.equal(concurrentResults.filter((value) => value.status === "failed").length, 1);
  const conflict = concurrentResults.find((value) => value.status === "failed");
  const winner = concurrentResults.find((value) => value.status === "completed");
  const winnerIndex = concurrentResults.indexOf(winner);
  const conflictIndex = concurrentResults.indexOf(conflict);
  const winningCandidate = winnerIndex === 0 ? leftCandidate : rightCandidate;
  const winnerEventId = concurrentInputs[winnerIndex].event_id;
  const conflictEventId = concurrentInputs[conflictIndex].event_id;
  assert.equal(conflict.output.error_class, "human_decision_conflict");
  assert.equal(conflict.output.effect_state, "committed_elsewhere");
  assert.equal(conflict.output.current_human_decision.decision_id, winner.output.human_decision.decision_id);
  assert.equal(concurrent.repository.workOrdersById.size, 1);
  assert.equal(concurrent.repository.routingDecisionsByCaseId.size, 1);
  const storedDecision = concurrent.repository.routingDecisionsByCaseId.get(CASE_ID);
  const storedOrder = await concurrent.repository.findWorkOrderByCaseId(CASE_ID);
  const winnerCaseSnapshot = structuredClone(await concurrent.repository.findCaseById(CASE_ID));
  const winnerOrderSnapshot = structuredClone(storedOrder);
  assert.deepEqual(storedDecision, winner.output.human_decision);
  assert.deepEqual(winnerCaseSnapshot, winner.output.case);
  assert.deepEqual(winnerOrderSnapshot, winner.output.work_order);
  assert.equal(storedDecision.event_id, winnerEventId);
  assert.equal(storedDecision.proposal_ref.proposal_id, concurrentProposal.proposal_id);
  assert.equal(storedDecision.rule_ref.routing_rule_id, winningCandidate.routing_rule_id);
  assert.equal(storedDecision.rule_ref.sla_rule_version, winningCandidate.sla_rule_version);
  assert.equal(storedDecision.candidate_team, winningCandidate.candidate_team);
  assert.equal(storedDecision.candidate_logical_role, winningCandidate.candidate_logical_role);
  assert.equal(winnerCaseSnapshot.routing_rule_candidate_id, winningCandidate.routing_rule_id);
  assert.equal(winnerCaseSnapshot.sla_rule_version, winningCandidate.sla_rule_version);
  assert.equal(winnerCaseSnapshot.suggested_team, winningCandidate.candidate_team);
  assert.equal(winnerCaseSnapshot.sla_started_at, rawFeedback().request.received_at);
  assert.equal(winnerCaseSnapshot.sla_due_at, "2026-08-01T02:16:00.000Z");
  assert.equal(storedOrder.team, storedDecision.candidate_team);
  assert.equal(storedOrder.assignee_role, storedDecision.candidate_logical_role);
  assert.equal(storedOrder.due_at, winnerCaseSnapshot.sla_due_at);
  assert.equal(
    storedOrder.first_response_target_minutes,
    storedDecision.rule_ref.first_response_target_minutes,
  );
  const winnerPolicy = concurrent.repository.slaPoliciesById.get(storedDecision.rule_ref.sla_policy_id);
  assert.ok(winnerPolicy);
  assert.equal(winnerPolicy.policy_version, storedDecision.rule_ref.sla_policy_version);
  assert.equal(winnerPolicy.routing_rule_id, storedDecision.rule_ref.routing_rule_id);
  assert.equal(winnerPolicy.sla_rule_version, storedDecision.rule_ref.sla_rule_version);
  assert.equal(
    winnerPolicy.first_response_target_minutes,
    storedDecision.rule_ref.first_response_target_minutes,
  );
  const conflictAudit = concurrent.audit.records.find((record) =>
    record.category === "workflow" && record.payload.event_id === conflictEventId
  );
  assert.ok(conflictAudit);
  assert.equal(conflictAudit.payload.result.status, "failed");
  assert.equal(conflictAudit.payload.result.output.error_class, "human_decision_conflict");
  assert.equal(
    conflictAudit.payload.result.output.current_human_decision.decision_id,
    storedDecision.decision_id,
  );
  const authorizationsAfterConflict = concurrent.action_authorizer.calls.length;
  const conflictReplay = await runW3(structuredClone(concurrentInputs[conflictIndex]), ports(concurrent));
  assert.equal(conflictReplay.status, "failed");
  assert.equal(conflictReplay.output.error_class, "human_decision_conflict");
  assert.equal(conflictReplay.output.event_replayed, true);
  assert.equal(concurrent.action_authorizer.calls.length, authorizationsAfterConflict);
  assert.deepEqual(await concurrent.repository.findCaseById(CASE_ID), winnerCaseSnapshot);
  assert.deepEqual(await concurrent.repository.findWorkOrderByCaseId(CASE_ID), winnerOrderSnapshot);
  for (const eventId of concurrentInputs.map((input) => input.event_id)) {
    assert.ok(concurrent.audit.records.some((record) =>
      record.category === "workflow" && record.payload.event_id === eventId
    ));
  }

  const sequential = await makeHarness({ scripts: { N4: [n4Envelope()], N6: [n6Envelope()] } });
  const sequentialProposal = await prepareRoutingGate(sequential, "SYN-W3-ROUTE-SEQUENTIAL");
  const [firstCandidate, alternateCandidate] = sequentialProposal.candidates;
  const first = await runW3(
    routingCommand("SYN-W3-ROUTE-SEQUENTIAL-FIRST", sequentialProposal, firstCandidate),
    ports(sequential),
  );
  const sameDecision = await runW3(
    routingCommand("SYN-W3-ROUTE-SEQUENTIAL-SAME", sequentialProposal, firstCandidate),
    ports(sequential),
  );
  const alternate = await runW3(
    routingCommand("SYN-W3-ROUTE-SEQUENTIAL-ALTERNATE", sequentialProposal, alternateCandidate),
    ports(sequential),
  );

  assert.equal(first.status, "completed");
  assert.equal(sameDecision.status, "idempotent");
  assert.equal(sameDecision.output.human_decision.decision_id, first.output.human_decision.decision_id);
  assert.equal(alternate.status, "failed");
  assert.equal(alternate.output.error_class, "human_decision_conflict");
  assert.equal(sequential.repository.workOrdersById.size, 1);
  assert.equal(sequential.repository.routingDecisionsByCaseId.size, 1);
  assert.equal(sequential.repository.routingDecisionsByCaseId.get(CASE_ID).decision_id, first.output.human_decision.decision_id);

  const sameConcurrent = await makeHarness({ scripts: { N4: [n4Envelope()], N6: [n6Envelope()] } });
  const sameProposal = await prepareRoutingGate(sameConcurrent, "SYN-W3-ROUTE-SAME-CONCURRENT");
  const sameCandidate = sameProposal.candidates[0];
  const sameResults = await Promise.all([
    runW3(routingCommand("SYN-W3-ROUTE-SAME-CONCURRENT-A", sameProposal, sameCandidate), ports(sameConcurrent)),
    runW3(routingCommand("SYN-W3-ROUTE-SAME-CONCURRENT-B", sameProposal, sameCandidate), ports(sameConcurrent)),
  ]);
  assert.equal(sameResults.filter((value) => value.status === "completed").length, 1);
  assert.equal(sameResults.filter((value) => value.status === "idempotent").length, 1);
  assert.equal(sameResults[0].output.human_decision.decision_id, sameResults[1].output.human_decision.decision_id);
  assert.equal(sameConcurrent.repository.workOrdersById.size, 1);
  assert.equal(sameConcurrent.repository.routingDecisionsByCaseId.size, 1);
});

test("W3 composes the audited N4 and N6 runners without weakening their evidence or tool-free boundaries", async () => {
  const { AuditedAiNodeRunner, ScriptedAiNodeInvoker } = await importBuilt("src/neoloop/ai/index.js");
  const { runW3 } = await importBuilt("src/neoloop/workflows/index.js");
  const harness = await makeHarness();
  const invoker = new ScriptedAiNodeInvoker({
    data_scope: "synthetic_experiment",
    scripts: {
      N4: [{ kind: "return", value: candidateFromEnvelope(n4Envelope()) }],
      N6: [{ kind: "return", value: candidateFromEnvelope(n6Envelope()) }],
    },
  });
  harness.ai_runner = new AuditedAiNodeRunner({
    invoker,
    audit: harness.audit,
    clock: harness.clock,
    ids: harness.ids,
    data_scope: "synthetic_experiment",
  });

  const entityGate = await runW3(command("SYN-W3-AUDITED-N4", "advance"), ports(harness));
  assert.equal(entityGate.status, "needs_human");
  await confirmEntity(harness, "SYN-W3-AUDITED-ENTITY");
  const routingGate = await runW3(command("SYN-W3-AUDITED-N6", "advance"), ports(harness));
  assert.equal(routingGate.status, "needs_human");
  assert.deepEqual(invoker.calls.map((call) => call.node), ["N4", "N6"]);
  assert.ok(invoker.calls.every((call) => call.security_context.original_text_trust === "untrusted"));
  assert.ok(invoker.calls.every((call) => call.security_context.exposed_capabilities.length === 0));
  assert.ok(invoker.calls.every((call) => !("tools" in call)));

  const aiAudits = harness.audit.records.filter((record) =>
    record.category === "ai" && ["N4", "N6"].includes(record.payload.envelope.node)
  );
  assert.equal(aiAudits.length, 2);
  assert.deepEqual(
    aiAudits.map((record) => record.payload.envelope.run_id).sort(),
    invoker.calls.map((call) => call.run_id).sort(),
  );
  assert.equal(harness.repository.workOrdersById.size, 0);
});

test("W3 concurrent replay preserves the needs_human gate while same-key conflicts fail closed", async () => {
  const { runW3 } = await importBuilt("src/neoloop/workflows/index.js");
  const harness = await makeHarness({ scripts: { N4: [n4Envelope()] } });
  const event = command("SYN-W3-CONCURRENT", "advance");
  const [first, second] = await Promise.all([
    runW3(event, ports(harness)),
    runW3(structuredClone(event), ports(harness)),
  ]);

  assert.deepEqual([first.status, second.status], ["needs_human", "needs_human"]);
  assert.equal([first, second].filter((value) => value.output.event_replayed === true).length, 1);
  assert.ok([first, second].every((value) => value.output.gate === "formal_entity_confirmation"));
  assert.equal(harness.ai_runner.calls.filter((call) => call.node === "N4").length, 1);
  assert.equal(harness.repository.entityProposalsByCaseId.size, 1);

  const proposalBefore = structuredClone(harness.repository.entityProposalsByCaseId.get(CASE_ID));
  const conflict = await runW3(command("SYN-W3-CONCURRENT", "confirm_formal_entity", {
    actor: HUMAN,
    entity_proposal_id: proposalBefore.proposal_id,
    formal_entity: { vehicle_id: VEHICLE_ID, task_id: TASK_ID, station_id: STATION_ID },
  }), ports(harness));
  assert.equal(conflict.status, "failed");
  assert.equal(conflict.output.error_class, "idempotency_conflict");
  assert.equal((await harness.repository.findCaseById(CASE_ID)).formal_entity, null);
  assert.deepEqual(harness.repository.entityProposalsByCaseId.get(CASE_ID), proposalBefore);
});

test("W3 single-flights N4 across different event ids for the same case", async () => {
  const { runW3 } = await importBuilt("src/neoloop/workflows/index.js");
  const eventIds = ["SYN-W3-N4-SINGLEFLIGHT-A", "SYN-W3-N4-SINGLEFLIGHT-B"];
  const harness = await makeHarness({ scripts: { N4: [async () => {
    await new Promise((resolve) => setImmediate(resolve));
    return n4Envelope();
  }] } });
  const results = await Promise.all([
    runW3(command(eventIds[0], "advance"), ports(harness)),
    runW3(command(eventIds[1], "advance"), ports(harness)),
  ]);

  assert.ok(results.every((value) => value.status === "needs_human"));
  assert.ok(results.every((value) => value.output.gate === "formal_entity_confirmation"));
  assert.ok(results.every((value) => value.output.event_replayed !== true));
  assert.equal(results.filter((value) => value.actions.includes("return_existing_N4_candidate")).length, 1);
  assert.equal(harness.ai_runner.calls.filter((call) => call.node === "N4").length, 1);
  assert.equal(harness.repository.entityProposalsByCaseId.size, 1);
  assert.deepEqual([...new Set(harness.workflow_event_calls)].sort(), [...eventIds].sort());
  assert.deepEqual(
    harness.audit.records
      .filter((record) => record.category === "workflow" && eventIds.includes(record.payload.event_id))
      .map((record) => record.payload.event_id)
      .sort(),
    [...eventIds].sort(),
  );
  const replayed = await Promise.all(eventIds.map((eventId) =>
    runW3(command(eventId, "advance"), ports(harness))
  ));
  assert.ok(replayed.every((value) => value.status === "needs_human"));
  assert.ok(replayed.every((value) => value.output.event_replayed === true));
  assert.equal(harness.ai_runner.calls.filter((call) => call.node === "N4").length, 1);
});

test("W3 single-flights N6 across different event ids after formal-entity confirmation", async () => {
  const { runW3 } = await importBuilt("src/neoloop/workflows/index.js");
  const eventIds = ["SYN-W3-N6-SINGLEFLIGHT-A", "SYN-W3-N6-SINGLEFLIGHT-B"];
  const harness = await makeHarness({ scripts: { N4: [n4Envelope()], N6: [async () => {
    await new Promise((resolve) => setImmediate(resolve));
    return n6Envelope();
  }] } });
  await advanceToEntityGate(harness, "SYN-W3-N6-SINGLEFLIGHT-N4");
  await confirmEntity(harness, "SYN-W3-N6-SINGLEFLIGHT-ENTITY");
  const results = await Promise.all([
    runW3(command(eventIds[0], "advance"), ports(harness)),
    runW3(command(eventIds[1], "advance"), ports(harness)),
  ]);

  assert.ok(results.every((value) => value.status === "needs_human"));
  assert.ok(results.every((value) => value.output.gate === "responsibility_routing_confirmation"));
  assert.ok(results.every((value) => value.output.event_replayed !== true));
  assert.equal(results.filter((value) => value.actions.includes("return_existing_N6_candidate")).length, 1);
  assert.equal(harness.ai_runner.calls.filter((call) => call.node === "N6").length, 1);
  assert.equal(harness.repository.routingProposalsByCaseId.size, 1);
  assert.deepEqual([...new Set(harness.workflow_event_calls)].filter((id) => eventIds.includes(id)).sort(), [...eventIds].sort());
  assert.deepEqual(
    harness.audit.records
      .filter((record) => record.category === "workflow" && eventIds.includes(record.payload.event_id))
      .map((record) => record.payload.event_id)
      .sort(),
    [...eventIds].sort(),
  );
  const replayed = await Promise.all(eventIds.map((eventId) =>
    runW3(command(eventId, "advance"), ports(harness))
  ));
  assert.ok(replayed.every((value) => value.status === "needs_human"));
  assert.ok(replayed.every((value) => value.output.event_replayed === true));
  assert.equal(harness.ai_runner.calls.filter((call) => call.node === "N6").length, 1);
});

test("W3 fails closed when an external port re-enters an active case or audit mutex", async () => {
  const { runW3 } = await importBuilt("src/neoloop/workflows/index.js");
  const within = async (promise, label) => {
    let timer;
    try {
      return await Promise.race([
        promise,
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error(`${label} timed out`)), 1_000);
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  };

  const humanHarness = await makeHarness({ check: "candidate" });
  const baseAuthorizer = humanHarness.action_authorizer;
  humanHarness.action_authorizer = {
    calls: baseAuthorizer.calls,
    authorize(input) {
      return humanHarness.repository.runCaseExclusive(CASE_ID, () => baseAuthorizer.authorize(input));
    },
  };
  const humanResult = await within(runW3(command("SYN-W3-REENTRANT-AUTH", "resolve_same_event", {
    actor: HUMAN,
    check_id: "SYN-CHECK-R3-001",
    decision: "keep_separate",
    reason: "合成可重入授权测试",
  }), ports(humanHarness)), "reentrant authorizer");
  assert.equal(humanResult.status, "failed");
  assert.equal(humanResult.output.error_class, "authorization_port_failure");
  assert.equal(humanHarness.repository.sameEventResolutionsByCaseId.size, 0);

  const aiHarness = await makeHarness({ scripts: { N4: [n4Envelope()] } });
  const baseRunner = aiHarness.ai_runner;
  aiHarness.ai_runner = {
    calls: baseRunner.calls,
    run(request) {
      return aiHarness.repository.runCaseExclusive(CASE_ID, () => baseRunner.run(request));
    },
  };
  const baseAudit = aiHarness.audit;
  aiHarness.audit = {
    records: baseAudit.records,
    append(record) {
      return aiHarness.repository.runWorkflowAuditExclusive(
        record.payload.event_id,
        () => baseAudit.append(record),
      );
    },
  };
  const aiResult = await within(
    runW3(command("SYN-W3-REENTRANT-AI-AUDIT", "advance"), ports(aiHarness)),
    "reentrant AI and audit",
  );
  assert.equal(aiResult.status, "needs_human");
  assert.equal(aiResult.output.error_class, "ai_runner_error");
  assert.equal(aiResult.output.audit_state, "pending");
  assert.equal(baseRunner.calls.filter((call) => call.node === "N4").length, 0);
  assert.equal(aiHarness.repository.entityProposalsByCaseId.size, 0);
  assert.equal(baseAudit.records.filter((record) => record.category === "workflow").length, 0);
});

test("W3 mutexes reject detached child entry while the inherited owner is still active", async () => {
  const harness = await makeHarness();
  for (const [label, key, runExclusive] of [
    ["case", CASE_ID, (value, operation) => harness.repository.runCaseExclusive(value, operation)],
    ["audit", "SYN-W3-ACTIVE-DETACHED-AUDIT", (value, operation) =>
      harness.repository.runWorkflowAuditExclusive(value, operation)],
  ]) {
    let detached;
    const order = [];
    await runExclusive(key, async () => {
      order.push("outer-enter");
      detached = new Promise((resolve) => {
        setImmediate(async () => {
          try {
            await runExclusive(key, async () => {
              order.push("detached-enter");
            });
            resolve("entered");
          } catch (error) {
            resolve(error);
          }
        });
      });
      await new Promise((resolve) => setImmediate(resolve));
      order.push("outer-before-release");
    });
    const detachedResult = await detached;
    assert.ok(detachedResult instanceof Error, label);
    assert.match(detachedResult.message, /reentrant|active.*lock/i, label);
    assert.deepEqual(order, ["outer-enter", "outer-before-release"], label);
  }
});

test("W3 event ledger rejects active same-event re-entry instead of awaiting its own promise", async () => {
  const harness = await makeHarness();
  const eventId = "SYN-W3-ACTIVE-EVENT-REENTRY";
  const fingerprint = "e".repeat(64);
  const result = await Promise.race([
    harness.repository.runWorkflowEvent(eventId, fingerprint, async () => {
      await Promise.resolve();
      await assert.rejects(
        harness.repository.runWorkflowEvent(eventId, fingerprint, async () => {
          throw new Error("nested operation must not run");
        }),
        /reentrant|active.*event/i,
      );
      return {
        workflow: "W3",
        event_id: eventId,
        status: "completed",
        object_ref: { object_type: "case", object_id: CASE_ID },
        actions: [],
        errors: [],
        output: {},
      };
    }),
    new Promise((resolve) => setTimeout(() => resolve("timeout"), 250)),
  ]);
  assert.notEqual(result, "timeout");
  assert.equal(result.replayed, false);
  assert.equal(result.result.status, "completed");
});

test("W3 case and audit mutexes reject stale detached ALS owners after the original lock is released", async () => {
  const harness = await makeHarness();
  const deferred = () => {
    let resolve;
    const promise = new Promise((done) => { resolve = done; });
    return { promise, resolve };
  };
  const lockCases = [
    [
      "case",
      CASE_ID,
      (key, operation) => harness.repository.runCaseExclusive(key, operation),
    ],
    [
      "workflow-audit",
      "SYN-W3-DETACHED-AUDIT-LOCK",
      (key, operation) => harness.repository.runWorkflowAuditExclusive(key, operation),
    ],
  ];

  for (const [label, key, runExclusive] of lockCases) {
    const detachedRelease = deferred();
    const newOwnerEntered = deferred();
    const newOwnerRelease = deferred();
    const order = [];
    let detachedPromise;

    await runExclusive(key, async () => {
      order.push("original-owner");
      detachedPromise = (async () => {
        await detachedRelease.promise;
        await runExclusive(key, async () => {
          order.push("detached-old-context");
        });
      })();
    });

    const newOwnerPromise = runExclusive(key, async () => {
      order.push("new-owner-entered");
      newOwnerEntered.resolve();
      await newOwnerRelease.promise;
      order.push("new-owner-released");
    });
    await newOwnerEntered.promise;
    detachedRelease.resolve();
    await new Promise((resolve) => setImmediate(resolve));
    const staleOwnerBypassed = order.includes("detached-old-context");
    newOwnerRelease.resolve();
    await Promise.all([newOwnerPromise, detachedPromise]);

    assert.equal(staleOwnerBypassed, false, `${label}: stale ALS context bypassed the active owner`);
    assert.deepEqual(order, [
      "original-owner",
      "new-owner-entered",
      "new-owner-released",
      "detached-old-context",
    ], label);
  }
});

test("W3 repository failures preserve the case, formal entity, SLA, and work-order snapshots with error_class", async () => {
  const harness = await makeHarness({ scripts: { N4: [n4Envelope()] } });
  const beforeCase = structuredClone(await harness.repository.findCaseById(CASE_ID));
  const beforeOrders = structuredClone([...harness.repository.workOrdersById.entries()]);
  harness.repository.findR3ReferenceDataForCase = async () => {
    throw new Error("synthetic R3 repository unavailable");
  };

  const result = await advanceToEntityGate(harness, "SYN-W3-REPOSITORY-FAIL");
  assert.equal(result.status, "failed");
  assert.equal(result.output.error_class, "repository_error");
  assert.deepEqual(await harness.repository.findCaseById(CASE_ID), beforeCase);
  assert.deepEqual([...harness.repository.workOrdersById.entries()], beforeOrders);
  const audit = harness.audit.records.at(-1);
  assert.equal(audit.category, "workflow");
  assert.equal(audit.payload.result.output.error_class, "repository_error");
});
