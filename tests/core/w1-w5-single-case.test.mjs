import assert from "node:assert/strict";
import test from "node:test";

import {
  importBuilt,
  MemoryAuditSink,
  n2Candidate,
  n5SameEventCandidate,
  sampleIngestRequest,
  scriptedN1Candidate,
  scriptedN3Candidate,
} from "./_runtime.mjs";

const VEHICLE_ID = "SYN-VEHICLE-FLOW-001";
const TASK_ID = "SYN-TASK-FLOW-001";
const STATION_ID = "SYN-STATION-FLOW-A";
const HUMAN = {
  type: "authorized_human",
  actor_id: "SYN-HUMAN-FLOW-REVIEWER",
  role: "合成全链路审核角色",
};
const PRINCIPAL = {
  principal_id: HUMAN.actor_id,
  principal_type: "synthetic_human",
  canonical_role: "规范化合成全链路审核角色",
  authority_source: "synthetic_allowlist",
};
const W3_POLICY_VERSION = "synthetic-w3-flow-allowlist@1.0.0-draft.2";
const W5_POLICY_VERSION = "synthetic-w5-flow-allowlist@1.0.0-draft.2";
const ROUTING_RULES = [
  {
    routing_rule_id: "SYN-ROUTING-FLOW-001",
    team: "车辆运维",
    role: "待企业确认：车辆运维负责人",
  },
  {
    routing_rule_id: "SYN-ROUTING-FLOW-002",
    team: "车辆运维+产品",
    role: "待企业确认：联合复核人",
  },
];

class MutableTestClock {
  source = "test";
  current = new Date("2026-08-01T02:05:00.000Z");

  now() {
    return new Date(this.current);
  }

  set(value) {
    this.current = new Date(value);
  }
}

class FlowIds {
  counts = new Map();

  nextId(namespace) {
    if (namespace === "case") return "SYN-CASE-017";
    const next = (this.counts.get(namespace) ?? 0) + 1;
    this.counts.set(namespace, next);
    return `SYN-FLOW-${namespace.toUpperCase()}-${String(next).padStart(3, "0")}`;
  }
}

function referenceData() {
  const routeRecords = ROUTING_RULES.map((route) => ({
    data_scope: "synthetic_experiment",
    source_kind: "registration_workbook",
    routing_rule_id: route.routing_rule_id,
    rule_version: "routing-matrix@1.0.0-draft.2",
    station_id: STATION_ID,
    issue_type: "舱门解锁异常",
    default_team: route.team,
    reviewer_role: route.role,
    sla_rule_version: "synthetic-flow-sla-v1",
    escalation_path: ["合成值班角色", "合成审核角色"],
    status: "待企业验证",
    evidence_class: "enterprise_pending",
    source_ref: `routing_matrix:${route.routing_rule_id}`,
    evidence_text: `${route.routing_rule_id}|${route.team}|${route.role}|synthetic-flow-sla-v1|待企业验证`,
  }));
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
      evidence_text: `${STATION_ID}|合成站点|synthetic_reference`,
    }],
    routing_rules: routeRecords,
    sla_policies: routeRecords.map((route) => ({
      policy_id: `SYN-SLA-POLICY-${route.routing_rule_id}`,
      policy_version: "synthetic-sla-policy@1.0.0-draft.2",
      routing_rule_id: route.routing_rule_id,
      sla_rule_version: route.sla_rule_version,
      first_response_target_minutes: 15,
      data_scope: "synthetic_experiment",
      evidence_class: "enterprise_pending",
      source_kind: "registration_workbook",
      status: "待企业验证",
      source_ref: `synthetic_sla_policy:${route.routing_rule_id}`,
      evidence_text: `${route.routing_rule_id}|synthetic-flow-sla-v1|15分钟|合成映射|待企业验证`,
    })),
  };
}

function n4Candidate(invocation) {
  const input = invocation.input;
  const fact = input.case_facts.facts[0];
  const vehicle = input.vehicle_candidates[0];
  const task = input.task_candidates[0];
  const station = input.site_candidates[0];
  return {
    payload: {
      candidate_objects: [
        { object_type: "vehicle", object_id: vehicle.vehicle_id, evidence_span_indices: [0, 1] },
        { object_type: "delivery_task", object_id: task.task_id, evidence_span_indices: [0, 2] },
        { object_type: "station", object_id: station.station_id, evidence_span_indices: [0, 3] },
      ],
      human_confirmation_required: true,
    },
    evidence_spans: [
      { source_ref: input.case_facts.source_ref, quote: fact },
      { source_ref: vehicle.source_ref, quote: vehicle.evidence_text },
      { source_ref: task.source_ref, quote: task.evidence_text },
      { source_ref: station.source_ref, quote: station.evidence_text },
    ],
    missing_fields: [],
    confidence: 0.91,
    status: "ok",
  };
}

function n6Candidate(invocation) {
  const rows = invocation.input.responsibility_matrix;
  const evidence = invocation.input.evidence;
  return {
    payload: {
      candidates: rows.map((row, index) => ({
        routing_rule_id: row.routing_rule_id,
        rule_version: row.rule_version,
        candidate_team: row.default_team,
        candidate_logical_role: row.reviewer_role,
        sla_rule_version: row.sla_rule_version,
        supporting_evidence_indices: [0, index + 1],
        counter_evidence_indices: [index === 0 ? 2 : 1],
        uncertainties: ["责任矩阵为待企业验证的合成映射，须由人工选择。"],
      })),
      human_confirmation_required: true,
    },
    evidence_spans: evidence.map((entry) => ({
      source_ref: entry.source_ref,
      quote: entry.text,
    })),
    missing_fields: [],
    confidence: null,
    status: "ok",
  };
}

function n7Candidate(invocation) {
  const fact = invocation.input.reviewed_facts[0];
  const resolution = invocation.input.resolution_result;
  const knowledge = invocation.input.reviewed_knowledge_index[0];
  return {
    payload: {
      draft_kind: "customer_reply",
      draft: "您好，我们已完成本次问题核验。请您确认当前体验；本回复仍需人工审核和手动发送。",
      citations: [{
        knowledge_id: knowledge.knowledge_id,
        version: knowledge.version,
        evidence_span_indices: [2],
      }],
      supporting_evidence_indices: [0, 1, 2],
      publication_state: "draft_unpublished",
      human_review_required: true,
      automatic_publication: false,
    },
    evidence_spans: [
      { source_ref: fact.source_ref, quote: fact.text },
      { source_ref: resolution.source_ref, quote: resolution.text },
      { source_ref: knowledge.source_ref, quote: knowledge.text },
    ],
    missing_fields: [],
    confidence: 0.86,
    status: "ok",
  };
}

class AllowlistW3Authorizer {
  constructor(grantIssuer) {
    this.grantIssuer = grantIssuer;
  }

  async authorize(input) {
    if (
      input.actor.actor_id !== HUMAN.actor_id ||
      input.actor.role !== HUMAN.role
    ) {
      return {
        authorized: false,
        reason: "synthetic actor is not allowlisted",
        policy_version: W3_POLICY_VERSION,
      };
    }
    return {
      authorized: true,
      principal: PRINCIPAL,
      policy_version: W3_POLICY_VERSION,
      action: input.action,
      target: structuredClone(input.target),
      command_fingerprint: input.command_fingerprint,
      grant: this.grantIssuer.issue({
        workflow: "W3",
        event_id: input.event_id,
        case_id: input.object_ref.object_id,
        action: input.action,
        target_fingerprint: input.target_fingerprint,
        command_fingerprint: input.command_fingerprint,
        principal: PRINCIPAL,
        policy_version: W3_POLICY_VERSION,
      }),
    };
  }
}

test("one synthetic case crosses W1-W2-W6-W3-W4-W5 with every human gate and one preserved SLA", async () => {
  const {
    AuditedAiNodeRunner,
    ScriptedAiNodeInvoker,
  } = await importBuilt("src/neoloop/ai/index.js");
  const {
    InMemoryFrontHalfRepository,
    createW3AuthorizationGrantChannel,
    createW5AuthorizationGrantChannel,
    runFrontHalf,
    runW3,
    runW4,
    runW5,
  } = await importBuilt("src/neoloop/workflows/index.js");

  const originalText = `车辆 ${VEHICLE_ID} 执行任务 ${TASK_ID} 时在站点 ${STATION_ID} 舱门连续两次无法解锁，任务已经延误。`;
  const request = sampleIngestRequest({
    source_record_id: "SYN-SOURCE-FLOW-001",
    idempotency_key: "competition-synthetic:flow:SYN-SOURCE-FLOW-001",
    received_at: "2026-08-01T02:00:00.000Z",
    original_text: originalText,
  });
  const clock = new MutableTestClock();
  const ids = new FlowIds();
  const audit = new MemoryAuditSink();
  const grantChannel = createW3AuthorizationGrantChannel();
  const w5GrantChannel = createW5AuthorizationGrantChannel();
  const repository = new InMemoryFrontHalfRepository({
    reference_data: referenceData(),
    w3_authorization_grant_consumer: grantChannel.consumer,
    w5_authorization_grant_consumer: w5GrantChannel.consumer,
  });
  const invoker = new ScriptedAiNodeInvoker({
    data_scope: "synthetic_experiment",
    scripts: {
      N1: [{
        kind: "return",
        value: scriptedN1Candidate(originalText, {
          entity_clues: {
            vehicle_ids: [VEHICLE_ID],
            task_ids: [TASK_ID],
            station_names: [STATION_ID],
          },
        }),
      }],
      N2: [{ kind: "return", value: n2Candidate() }],
      N3: [{ kind: "return", value: scriptedN3Candidate(originalText) }],
      N5: [{ kind: "return", value: n5SameEventCandidate(null) }],
      N4: [{ kind: "return", value: n4Candidate }],
      N6: [{ kind: "return", value: n6Candidate }],
      N7: [{ kind: "return", value: n7Candidate }],
    },
  });
  const aiRunner = new AuditedAiNodeRunner({
    invoker,
    audit,
    clock,
    ids,
    data_scope: "synthetic_experiment",
  });
  const sharedPorts = { repository, audit, clock, ids, ai_runner: aiRunner };

  const frontHalf = await runFrontHalf(request, sharedPorts);
  assert.equal(frontHalf.status, "completed");
  assert.deepEqual(frontHalf.stages.map((stage) => stage.phase), ["W1", "W2", "W6.same_event"]);
  const caseId = frontHalf.case_id;
  assert.equal(caseId, "SYN-CASE-017");
  assert.equal(repository.sameEventChecksByCaseId.get(caseId).review_state, "not_required");

  const w3Ports = {
    ...sharedPorts,
    action_authorizer: new AllowlistW3Authorizer(grantChannel.issuer),
  };
  const entityGate = await runW3({
    event_id: "SYN-EVENT-FLOW-W3-N4",
    workflow: "W3",
    action: "advance",
    case_id: caseId,
  }, w3Ports);
  assert.equal(entityGate.status, "needs_human");
  assert.equal(entityGate.output.gate, "formal_entity_confirmation");
  const entityProposal = repository.entityProposalsByCaseId.get(caseId);

  const entityConfirmed = await runW3({
    event_id: "SYN-EVENT-FLOW-W3-ENTITY",
    workflow: "W3",
    action: "confirm_formal_entity",
    case_id: caseId,
    actor: HUMAN,
    entity_proposal_id: entityProposal.proposal_id,
    formal_entity: {
      vehicle_id: VEHICLE_ID,
      task_id: TASK_ID,
      station_id: STATION_ID,
    },
  }, w3Ports);
  assert.equal(entityConfirmed.status, "completed");

  const routingGate = await runW3({
    event_id: "SYN-EVENT-FLOW-W3-N6",
    workflow: "W3",
    action: "advance",
    case_id: caseId,
  }, w3Ports);
  assert.equal(routingGate.status, "needs_human");
  assert.equal(routingGate.output.gate, "responsibility_routing_confirmation");
  const routingProposal = repository.routingProposalsByCaseId.get(caseId);
  const chosen = routingProposal.candidates[0];

  const dispatched = await runW3({
    event_id: "SYN-EVENT-FLOW-W3-DISPATCH",
    workflow: "W3",
    action: "confirm_routing",
    case_id: caseId,
    actor: HUMAN,
    routing_proposal_id: routingProposal.proposal_id,
    routing_rule_id: chosen.routing_rule_id,
    candidate_team: chosen.candidate_team,
    candidate_logical_role: chosen.candidate_logical_role,
    sla_rule_version: chosen.sla_rule_version,
    first_response_target_minutes: 15,
  }, w3Ports);
  assert.equal(dispatched.status, "completed");
  assert.equal(dispatched.output.case.sla_started_at, request.received_at);
  assert.equal(dispatched.output.case.sla_due_at, "2026-08-01T02:15:00.000Z");
  const workOrderId = dispatched.output.work_order.work_order_id;

  const accepted = await runW4({
    event_id: "SYN-EVENT-FLOW-W4-ACCEPT",
    action: "accept",
    work_order_id: workOrderId,
    actor: HUMAN,
  }, {
    repository,
    audit,
    clock,
    ids,
    notifier: { async send() {} },
    action_authorizer: {
      async authorize(input) {
        return input.actor.actor_id === HUMAN.actor_id && input.action === "accept";
      },
    },
  });
  assert.equal(accepted.status, "completed");
  assert.equal(accepted.output.case.status, "处理中");

  const w5Ports = {
    ...sharedPorts,
    action_authorizer: {
      async authorize(input) {
        return input.actor.actor_id === HUMAN.actor_id
          ? {
              allowed: true,
              principal: PRINCIPAL,
              policy_version: W5_POLICY_VERSION,
              grant: w5GrantChannel.issuer.issue({
                workflow: "W5",
                event_id: input.event_id,
                case_id: input.object_ref.object_id,
                work_order_id: input.work_order_id,
                action: input.action,
                target_fingerprint: input.target_fingerprint,
                command_fingerprint: input.command_fingerprint,
                principal: PRINCIPAL,
                policy_version: W5_POLICY_VERSION,
              }),
            }
          : { allowed: false, reason: "synthetic actor is not allowlisted" };
      },
    },
  };
  const submitted = await runW5({
    action: "submit_closure_request",
    event_id: "SYN-EVENT-FLOW-W5-SUBMIT",
    case_id: caseId,
    work_order_id: workOrderId,
    actor: HUMAN,
    evidence: {
      submission_id: "SYN-EVIDENCE-FLOW-001",
      source_ref: `work_order:${workOrderId}`,
      text: "合成处置验证完成：重复解锁检查通过，未执行任何车辆控制。",
      artifact_refs: ["synthetic://flow/evidence/unlock-check"],
      reviewed_facts: [{
        source_ref: `case:${caseId}`,
        text: originalText,
        review_status: "approved",
        review_ref: "SYN-FACT-REVIEW-FLOW-001",
      }],
    },
    reviewed_knowledge_index: [{
      knowledge_id: "SYN-KNOWLEDGE-FLOW-001",
      version: "approved.1",
      approval_status: "已审核",
      effective_at: "2026-08-01T01:00:00.000Z",
      citation_allowed_for_n7: true,
      source_ref: "knowledge:SYN-KNOWLEDGE-FLOW-001",
      text: "回复应说明核验已完成，并邀请客户确认当前体验。",
    }],
  }, w5Ports);
  assert.equal(submitted.status, "completed");
  assert.equal(submitted.output.current_draft.publication_state, "draft_unpublished");

  const reviewed = await runW5({
    action: "review_reply",
    event_id: "SYN-EVENT-FLOW-W5-REVIEW",
    case_id: caseId,
    work_order_id: workOrderId,
    actor: HUMAN,
    draft_id: submitted.output.current_draft.draft_id,
    decision: "approve_for_manual_delivery",
    reason: "已核对合成事实、处置结果和引用。",
    manual_delivery_reference: "synthetic://flow/manual-reply/001",
  }, w5Ports);
  assert.equal(reviewed.status, "completed");

  const followedUp = await runW5({
    action: "record_follow_up",
    event_id: "SYN-EVENT-FLOW-W5-FOLLOWUP",
    case_id: caseId,
    work_order_id: workOrderId,
    actor: HUMAN,
    outcome: "resolved",
    summary: "合成回访记录确认当前体验正常。",
    follow_up_reference: "synthetic://flow/follow-up/001",
  }, w5Ports);
  assert.equal(followedUp.status, "completed");

  clock.set("2026-08-01T02:20:00.000Z");
  const closed = await runW5({
    action: "decide_closure",
    event_id: "SYN-EVENT-FLOW-W5-CLOSE",
    case_id: caseId,
    work_order_id: workOrderId,
    actor: HUMAN,
    decision: "close",
    reason: "人工确认处置验证、回复审核和回访记录均已完成。",
  }, w5Ports);

  assert.equal(closed.status, "completed");
  assert.equal(closed.output.case.status, "已关闭");
  assert.equal(closed.output.case.workflow_readiness, "closed");
  assert.equal(closed.output.work_order.status, "已完成");
  assert.equal(closed.output.case.sla_started_at, request.received_at);
  assert.equal(closed.output.case.sla_due_at, "2026-08-01T02:15:00.000Z");
  assert.equal(closed.output.work_order.due_at, "2026-08-01T02:15:00.000Z");
  assert.equal(closed.output.work_order.sla_reset_count, 0);
  assert.deepEqual(
    Object.fromEntries(Object.entries(closed.output.history).map(([key, rows]) => [key, rows.length])),
    {
      evidence_submissions: 1,
      reply_drafts: 1,
      reply_reviews: 1,
      follow_ups: 1,
      closure_decisions: 1,
    },
  );
  assert.deepEqual(invoker.calls.map((call) => call.node), ["N1", "N2", "N3", "N5", "N4", "N6", "N7"]);
  assert.equal(audit.records.filter((record) => record.category === "ai").length, 7);
  assert.equal(repository.casesById.size, 1);
  assert.equal(repository.workOrdersById.size, 1);
  assert.equal(closed.output.external_effects.reply_sent_by_workflow, false);
  assert.equal(closed.output.external_effects.knowledge_published_by_workflow, false);
  assert.equal(closed.output.external_effects.case_closed_without_human, false);
  assert.equal(closed.output.external_effects.vehicle_control_performed, false);
});
