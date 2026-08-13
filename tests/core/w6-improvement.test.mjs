import assert from "node:assert/strict";
import test from "node:test";

import {
  MemoryAuditSink,
  SequenceIds,
  importBuilt,
} from "./_runtime.mjs";

const ai = await importBuilt("src/neoloop/ai/index.js");
const workflows = await importBuilt("src/neoloop/workflows/index.js");

const { createAiInputHash } = ai;
const {
  InMemoryFrontHalfRepository,
  W6TransitionFailure,
  createW6RecurrenceRequestAuthorizationBinding,
  createW5AuthorizationGrantChannel,
  createW6AuthorizationBinding,
  createW6AuthorizationGrantChannel,
  createWorkflowEventFingerprint,
  fingerprintW6ImprovementCommand,
  runW6Improvement,
  snapshotW6AtomicTransition,
} = workflows;

const CASE_A = "SYN-CASE-BATCH-C-A";
const CASE_B = "SYN-CASE-BATCH-C-B";
const CASE_C = "SYN-CASE-BATCH-C-C";
const CASE_D = "SYN-CASE-BATCH-C-D";
const CASE_E = "SYN-CASE-BATCH-C-E";
const CASE_F = "SYN-CASE-BATCH-C-F";
const CLUSTER_ID = "SYN-CLUSTER-BATCH-C-001";
const IMPROVEMENT_ID = "SYN-IMPROVEMENT-BATCH-C-001";
const SECOND_CLUSTER_ID = "SYN-CLUSTER-BATCH-E-002";
const SECOND_IMPROVEMENT_ID = "SYN-IMPROVEMENT-BATCH-E-002";
const SOURCE_HASH = "c".repeat(64);
const NOW = "2026-08-03T00:00:00.000Z";
const OBSERVATION_OPENED_AT = "2026-08-04T00:00:00.000Z";
const DAY_7_AT = "2026-08-11T00:00:00.000Z";
const DAY_30_AT = "2026-09-03T00:00:00.000Z";
const ARCHIVE_AT = "2026-09-04T00:00:00.000Z";
const REOPEN_AT = "2026-09-05T00:00:00.000Z";
const PRINCIPAL = {
  principal_id: "SYN-PRINCIPAL-BATCH-C",
  principal_type: "synthetic_human",
  canonical_role: "合成问题负责人",
  authority_source: "synthetic_allowlist",
};
const ACTOR = {
  type: "authorized_human",
  actor_id: "SYN-ACTOR-BATCH-C",
  role: "合成问题负责人",
};
const POLICY_VERSION = "synthetic-w6-batch-c-allowlist-v1";
const CATALOG = [{
  hypothesis_id: "HYP-DOOR-BATCH",
  factor_label: "部件批次差异",
  phenomenon_label: "舱门解锁异常",
  uncertainty_options: [
    { uncertainty_id: "UNC-SAMPLE-SIZE", label: "样本量有限" },
    { uncertainty_id: "UNC-INSPECTION", label: "缺少拆检记录" },
  ],
}];

class FixedClock {
  source = "test";

  constructor(now = NOW) {
    this.current = now;
  }

  now() {
    return new Date(this.current);
  }

  set(now) {
    this.current = now;
  }
}

function closedCase(caseId, ordinal, overrides = {}) {
  const closedAt = `2026-07-${String(21 + ordinal).padStart(2, "0")}T00:00:00.000Z`;
  return {
    schema_version: "1.0.0-draft.2",
    data_scope: "synthetic_experiment",
    evidence_class: "synthetic_experiment",
    created_at: `2026-07-${String(20 + ordinal).padStart(2, "0")}T00:00:00.000Z`,
    updated_at: closedAt,
    source_kind: "scenario_runtime",
    case_id: caseId,
    legacy_id: "not_applicable_scenario_runtime",
    title: `合成舱门解锁异常 ${ordinal}`,
    summary: `第 ${ordinal} 个独立合成任务出现舱门无法解锁。`,
    category_domain: "车辆运维",
    category_detail: "舱门解锁异常",
    rule_risk: "P2",
    ai_risk: "P2",
    final_risk: "P2",
    status: "已关闭",
    missing_fields: [],
    entity_candidates: {
      vehicle_ids: [`SYN-VEHICLE-BATCH-C-${ordinal}`],
      task_ids: [`SYN-TASK-BATCH-C-${ordinal}`],
      station_names: [`SYN-STATION-BATCH-C-${ordinal}`],
      confidence: 0.9,
    },
    formal_entity: {
      vehicle_id: `SYN-VEHICLE-BATCH-C-${ordinal}`,
      task_id: `SYN-TASK-BATCH-C-${ordinal}`,
      station_id: `SYN-STATION-BATCH-C-${ordinal}`,
    },
    formal_entity_confirmation_status: "已人工确认",
    evidence_completeness: "complete",
    evidence_summary: "合成处置证据、回访与结案已由人工审核。",
    sla_started_at: "2026-07-20T00:00:00.000Z",
    sla_due_at: "2026-07-20T00:30:00.000Z",
    sla_rule_version: "SYN-SLA-v1",
    candidate_generation_mode: "AI",
    suggested_team: "车辆运维",
    routing_rule_candidate_id: `SYN-ROUTING-BATCH-C-${ordinal}`,
    cluster_id: null,
    pending_confirmation_items: [],
    closed_at: closedAt,
    record_mode: "scenario_runtime",
    workflow_readiness: "closed",
    legacy_association_mode: "not_applicable",
    legacy_reviewer: "not_applicable",
    legacy_status: "not_applicable",
    migration_note: null,
    source_name: "synthetic_experiment",
    source_locator: `case:${caseId}`,
    source_sha256: SOURCE_HASH,
    ...overrides,
  };
}

function rawFeedback(caseId, ordinal) {
  const feedbackId = `SYN-FEEDBACK-BATCH-C-${ordinal}`;
  const idempotencyKey = `competition-synthetic:batch-c:${feedbackId}`;
  return {
    feedback_id: feedbackId,
    idempotency_key: idempotencyKey,
    content_fingerprint: "d".repeat(64),
    request: {
      schema_version: "1.0.0-draft.2",
      data_scope: "synthetic_experiment",
      evidence_class: "synthetic_experiment",
      source_tenant_scope: "competition-synthetic",
      channel: "synthetic-form",
      source_record_id: `SYN-SOURCE-BATCH-C-${ordinal}`,
      original_text: closedCase(caseId, ordinal).summary,
      received_at: "2026-07-20T00:00:00.000Z",
      authorization_scope: "synthetic_demo_only",
      idempotency_key: idempotencyKey,
    },
    processing_status: "已建案",
    created_at: "2026-07-20T00:00:00.000Z",
  };
}

function syntheticWorkOrder(caseId, ordinal, updatedAt) {
  return {
    schema_version: "1.0.0-draft.2",
    data_scope: "synthetic_experiment",
    evidence_class: "synthetic_experiment",
    created_at: "2026-07-20T00:00:00.000Z",
    updated_at: updatedAt,
    source_kind: "scenario_runtime",
    work_order_id: `SYN-WORK-BATCH-C-${ordinal}`,
    legacy_id: "not_applicable_scenario_runtime",
    case_id: caseId,
    team: "车辆运维",
    assignee_role: "合成处置负责人",
    action: "核验合成舱门解锁链路并提交处置证据",
    accepted_at: "2026-07-20T00:05:00.000Z",
    due_at: "2026-07-20T00:30:00.000Z",
    completed_at: null,
    disposition_evidence: null,
    validation_result: "pending",
    escalation_level: "none",
    first_response_target_minutes: 30,
    sla_reset_count: 0,
    status: "处理中",
    legacy_recorded_at: null,
    legacy_routing_correct: "not_applicable",
    legacy_status: "not_applicable",
    source_name: "synthetic_experiment",
    source_locator: `work_order:SYN-WORK-BATCH-C-${ordinal}`,
    source_sha256: SOURCE_HASH,
  };
}

function w5SeedBinding(transition) {
  if (transition.append.evidence_submission) {
    const evidence = transition.append.evidence_submission;
    return {
      action: evidence.kind === "evidence_supplement" ? "supplement_evidence" : "submit_closure_request",
      target: evidence.kind === "evidence_supplement"
        ? {
            evidence_submission_id: evidence.submission_id,
            replaces_submission_id: evidence.replaces_submission_id,
          }
        : { evidence_submission_id: evidence.submission_id },
      authorization_record: evidence,
    };
  }
  if (transition.append.reply_review) {
    const review = transition.append.reply_review;
    return {
      action: "review_reply",
      target: { draft_id: review.draft_id, decision: review.decision },
      authorization_record: review,
    };
  }
  if (transition.append.follow_up) {
    const followUp = transition.append.follow_up;
    return {
      action: "record_follow_up",
      target: { outcome: followUp.outcome, follow_up_reference: followUp.follow_up_reference },
      authorization_record: followUp,
    };
  }
  const closure = transition.append.closure_decision;
  return {
    action: "decide_closure",
    target: { decision: closure.decision },
    authorization_record: closure,
  };
}

async function commitSeedW5Transition(repository, issuer, transition) {
  const binding = w5SeedBinding(transition);
  const eventId = binding.authorization_record.event_id;
  const commandFingerprint = createWorkflowEventFingerprint({
    workflow: "W5",
    event_id: eventId,
    transition: transition.transition,
    case_id: transition.expected_case.case_id,
    work_order_id: transition.expected_work_order.work_order_id,
    target: binding.target,
  });
  let committed;
  await repository.runWorkflowEvent(eventId, commandFingerprint, () =>
    repository.runCaseExclusive(transition.expected_case.case_id, async () => {
      const claims = {
        workflow: "W5",
        event_id: eventId,
        case_id: transition.expected_case.case_id,
        work_order_id: transition.expected_work_order.work_order_id,
        action: binding.action,
        target_fingerprint: createWorkflowEventFingerprint(binding.target),
        command_fingerprint: commandFingerprint,
        principal: PRINCIPAL,
        policy_version: "synthetic-w5-batch-c-allowlist-v1",
      };
      const grant = issuer.issue(claims);
      committed = await repository.runAuthorizedW5Action(
        { grant, claims },
        () => repository.commitW5Transition(transition),
      );
      return {
        workflow: "W5",
        event_id: eventId,
        status: "completed",
        object_ref: { object_type: "case", object_id: transition.expected_case.case_id },
        actions: [transition.transition],
        errors: [],
        output: { synthetic_seed: true },
      };
    })
  );
  assert.equal(committed.updated, true);
  return committed;
}

async function seedClosedCase(repository, w5Issuer, caseId, ordinal, overrides = {}) {
  const finalCase = closedCase(caseId, ordinal, overrides);
  const closedAt = finalCase.closed_at;
  const at = (hoursBefore) => new Date(Date.parse(closedAt) - hoursBefore * 60 * 60 * 1000).toISOString();
  let caseRecord = {
    ...finalCase,
    status: "处理中",
    updated_at: at(4),
    closed_at: null,
    workflow_readiness: "dispatched",
  };
  let workOrder = syntheticWorkOrder(caseId, ordinal, at(4));
  const feedback = rawFeedback(caseId, ordinal);
  repository.casesById.set(caseId, structuredClone(caseRecord));
  repository.workOrdersById.set(workOrder.work_order_id, structuredClone(workOrder));
  repository.workOrderByCaseId.set(caseId, workOrder.work_order_id);
  repository.rawFeedbackById.set(feedback.feedback_id, structuredClone(feedback));
  repository.rawFeedbackByKey.set(feedback.idempotency_key, structuredClone(feedback));
  repository.caseByFeedbackId.set(feedback.feedback_id, caseId);

  const evidence = {
    submission_id: `SYN-BATCH-C-W5-EVIDENCE-${ordinal}`,
    event_id: `SYN-BATCH-C-W5-EVIDENCE-EVENT-${ordinal}`,
    case_id: caseId,
    work_order_id: workOrder.work_order_id,
    kind: "closure_request",
    replaces_submission_id: null,
    source_ref: `case:${caseId}`,
    text: `合成处置证据 ${ordinal} 已完成复核。`,
    artifact_refs: [`synthetic:artifact:${ordinal}`],
    reviewed_facts: [{
      source_ref: `case:${caseId}`,
      text: finalCase.summary,
      review_status: "approved",
      review_ref: `synthetic:review:${ordinal}`,
    }],
    completeness: "complete",
    missing_fields: [],
    principal: PRINCIPAL,
    authorization_policy_version: "synthetic-w5-batch-c-allowlist-v1",
    submitted_at: at(3),
  };
  const draft = {
    draft_id: `SYN-BATCH-C-W5-DRAFT-${ordinal}`,
    event_id: evidence.event_id,
    case_id: caseId,
    work_order_id: workOrder.work_order_id,
    node_run_id: `SYN-BATCH-C-N7-RUN-${ordinal}`,
    node_version: "N7-1.0.0-draft.2",
    input_hash: "e".repeat(64),
    draft_kind: "customer_reply",
    draft: "合成回复草稿，仅供人工审核与手动发送。",
    citations: [{
      knowledge_id: "SYN-KNOWLEDGE-BATCH-C-001",
      version: "synthetic.1",
      evidence_span_indices: [0],
    }],
    supporting_evidence_indices: [0],
    evidence_spans: [{ source_ref: `case:${caseId}`, quote: finalCase.summary }],
    publication_state: "draft_unpublished",
    human_review_required: true,
    automatic_publication: false,
    created_at: at(3),
  };
  let nextCase = {
    ...caseRecord,
    status: "待验证",
    updated_at: at(3),
    workflow_readiness: "awaiting_reply_review",
  };
  let nextWorkOrder = {
    ...workOrder,
    status: "待验证",
    updated_at: at(3),
    disposition_evidence: evidence.text,
  };
  let committed = await commitSeedW5Transition(repository, w5Issuer, {
    transition: "evidence_ready",
    expected_case: caseRecord,
    expected_work_order: workOrder,
    next_case: nextCase,
    next_work_order: nextWorkOrder,
    append: { evidence_submission: evidence, reply_draft: draft },
  });
  caseRecord = committed.case;
  workOrder = committed.work_order;

  const review = {
    review_id: `SYN-BATCH-C-W5-REVIEW-${ordinal}`,
    event_id: `SYN-BATCH-C-W5-REVIEW-EVENT-${ordinal}`,
    case_id: caseId,
    work_order_id: workOrder.work_order_id,
    draft_id: draft.draft_id,
    decision: "approve_for_manual_delivery",
    reason: "合成授权人员确认回复草稿可手动发送。",
    manual_delivery_reference: `synthetic:manual-delivery:${ordinal}`,
    principal: PRINCIPAL,
    authorization_policy_version: "synthetic-w5-batch-c-allowlist-v1",
    decided_at: at(2),
  };
  nextCase = {
    ...caseRecord,
    status: "待回访",
    updated_at: at(2),
    workflow_readiness: "awaiting_follow_up",
  };
  nextWorkOrder = { ...workOrder, updated_at: at(2) };
  committed = await commitSeedW5Transition(repository, w5Issuer, {
    transition: "reply_approved",
    expected_case: caseRecord,
    expected_work_order: workOrder,
    next_case: nextCase,
    next_work_order: nextWorkOrder,
    append: { reply_review: review },
  });
  caseRecord = committed.case;
  workOrder = committed.work_order;

  const followUp = {
    follow_up_id: `SYN-BATCH-C-W5-FOLLOW-UP-${ordinal}`,
    event_id: `SYN-BATCH-C-W5-FOLLOW-UP-EVENT-${ordinal}`,
    case_id: caseId,
    work_order_id: workOrder.work_order_id,
    outcome: "resolved",
    summary: "合成回访已确认问题解决。",
    follow_up_reference: `synthetic:follow-up:${ordinal}`,
    principal: PRINCIPAL,
    authorization_policy_version: "synthetic-w5-batch-c-allowlist-v1",
    recorded_at: at(1),
  };
  nextCase = {
    ...caseRecord,
    updated_at: at(1),
    workflow_readiness: "awaiting_closure_decision",
  };
  nextWorkOrder = { ...workOrder, updated_at: at(1) };
  committed = await commitSeedW5Transition(repository, w5Issuer, {
    transition: "follow_up_resolved",
    expected_case: caseRecord,
    expected_work_order: workOrder,
    next_case: nextCase,
    next_work_order: nextWorkOrder,
    append: { follow_up: followUp },
  });
  caseRecord = committed.case;
  workOrder = committed.work_order;

  const closure = {
    decision_id: `SYN-BATCH-C-W5-CLOSURE-${ordinal}`,
    event_id: `SYN-BATCH-C-W5-CLOSURE-EVENT-${ordinal}`,
    case_id: caseId,
    work_order_id: workOrder.work_order_id,
    decision: "close",
    reason: "合成授权人员确认完整链路后关闭案件。",
    principal: PRINCIPAL,
    authorization_policy_version: "synthetic-w5-batch-c-allowlist-v1",
    decided_at: closedAt,
  };
  nextCase = { ...finalCase };
  nextWorkOrder = {
    ...workOrder,
    status: "已完成",
    validation_result: "passed",
    completed_at: closedAt,
    updated_at: closedAt,
  };
  committed = await commitSeedW5Transition(repository, w5Issuer, {
    transition: "closure_closed",
    expected_case: caseRecord,
    expected_work_order: workOrder,
    next_case: nextCase,
    next_work_order: nextWorkOrder,
    append: { closure_decision: closure },
  });
  await repository.insertSameEventCheckIfAbsent({
    check_id: `SYN-BATCH-C-SAME-EVENT-CHECK-${ordinal}`,
    case_id: caseId,
    mode: "same_event_duplicate",
    candidate: null,
    evidence_spans: [],
    review_state: "not_required",
    node_status: "ok",
    automatic_merge: false,
    automatic_relink: false,
    created_at: "2026-07-20T00:00:00.000Z",
  });
  return committed;
}

function okEnvelope(request, payload, evidenceSpans, runId) {
  return {
    node: request.node,
    mode: request.mode,
    version: request.version,
    run_id: runId,
    object_ref: structuredClone(request.object_ref),
    input_hash: createAiInputHash(request),
    payload,
    evidence_spans: evidenceSpans,
    missing_fields: [],
    confidence: 0.88,
    status: "ok",
    validation: { valid: true, errors: [] },
    retry_count: 0,
    human_revision: { state: "none" },
  };
}

function stoppedEnvelope(request) {
  return {
    node: request.node,
    mode: request.mode,
    version: request.version,
    run_id: `SYN-${request.node}-DOUBLE-FAILURE`,
    object_ref: structuredClone(request.object_ref),
    input_hash: createAiInputHash(request),
    payload: null,
    evidence_spans: [],
    missing_fields: [],
    confidence: null,
    status: "needs_human",
    validation: { valid: true, errors: [] },
    retry_count: 1,
    human_revision: { state: "pending" },
  };
}

class BatchCAiRunner {
  calls = [];
  failN5 = false;
  failN6 = false;
  wrongExistingCluster = false;

  async run(request) {
    this.calls.push(structuredClone(request));
    if ((request.node === "N5" && this.failN5) || (request.node === "N6" && this.failN6)) {
      return stoppedEnvelope(request);
    }
    if (request.node === "N5") {
      const records = [request.input.case_facts.current, ...request.input.case_facts.candidates];
      const existingClusterId = records.find((record) => typeof record.cluster_id === "string")?.cluster_id ?? null;
      const evidenceSpans = records.map((record) => ({
        source_ref: `case:${record.case_id}`,
        quote: record.summary,
      }));
      return okEnvelope(request, {
        cluster_candidate: {
          candidate_kind: existingClusterId === null ? "new_cluster" : "existing_cluster",
          suggested_cluster_id: existingClusterId === null
            ? null
            : this.wrongExistingCluster ? "SYN-CLUSTER-WRONG" : existingClusterId,
          member_cases: records.map((record, index) => ({
            case_id: record.case_id,
            evidence_span_indices: [index],
          })),
          similarity: 0.88,
        },
        human_review_required: true,
        automatic_merge: false,
        automatic_case_relink: false,
      }, evidenceSpans, "SYN-N5-BATCH-C-RUN");
    }
    const evidence = request.input.evidence;
    const evidenceSpans = evidence.map((record) => ({
      source_ref: record.source_ref,
      quote: record.text,
    }));
    const catalog = request.input.hypothesis_catalog[0];
    return okEnvelope(request, {
      hypotheses: [{
        hypothesis_id: catalog.hypothesis_id,
        statement: `待验证假设：${catalog.factor_label}可能与${catalog.phenomenon_label}相关，需人工结合支持证据、反证和不确定项验证。`,
        supporting_evidence_indices: [0, 2],
        counter_evidence_indices: [1, 3],
        uncertainty_ids: [catalog.uncertainty_options[0].uncertainty_id],
        uncertainties: [`待确认：${catalog.uncertainty_options[0].label}`],
      }],
      human_review_required: true,
      final_root_cause: false,
    }, evidenceSpans, "SYN-N6-BATCH-C-RUN");
  }
}

function createAuthorizer(issuer, options = {}) {
  const calls = [];
  let reusedGrant = null;
  return {
    calls,
    async authorize(input) {
      calls.push(structuredClone({ ...input, transition: input.transition }));
      if (options.onAuthorize) await options.onAuthorize(input);
      if (options.denied || options.denyAction === input.action) {
        return { allowed: false, reason: "synthetic authorization denied" };
      }
      const claims = {
        workflow: "W6",
        event_id: input.event_id,
        phase: input.phase,
        case_ids: [...input.case_ids],
        cluster_id: input.object_ref.object_id,
        improvement_id: input.improvement_id,
        action: input.action,
        target_fingerprint: input.target_fingerprint,
        command_fingerprint: input.command_fingerprint,
        principal: PRINCIPAL,
        policy_version: POLICY_VERSION,
      };
      let grant;
      if (options.reuseGrant) {
        reusedGrant ??= issuer.issue(claims);
        grant = reusedGrant;
      } else {
        grant = issuer.issue(claims);
      }
      return {
        allowed: true,
        principal: PRINCIPAL,
        policy_version: POLICY_VERSION,
        grant,
      };
    },
  };
}

function createDeterministicBarrier() {
  let release;
  const promise = new Promise((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

function createCatalogProvider() {
  return {
    calls: [],
    async getCatalog(input) {
      this.calls.push(structuredClone(input));
      return structuredClone(CATALOG);
    },
  };
}

async function makeHarness({ caseIds = [CASE_A, CASE_B], grantIssuer, authorizerOptions } = {}) {
  const w5Channel = createW5AuthorizationGrantChannel();
  const w6Channel = createW6AuthorizationGrantChannel();
  const repository = new InMemoryFrontHalfRepository({
    w5_authorization_grant_consumer: w5Channel.consumer,
    w6_authorization_grant_consumer: w6Channel.consumer,
    approved_n6_catalog: CATALOG,
  });
  for (const [index, caseId] of caseIds.entries()) {
    await seedClosedCase(repository, w5Channel.issuer, caseId, index + 1);
  }
  const aiRunner = new BatchCAiRunner();
  const catalogProvider = createCatalogProvider();
  const authorizer = createAuthorizer(grantIssuer ?? w6Channel.issuer, authorizerOptions);
  const audit = new MemoryAuditSink();
  const ids = new SequenceIds();
  const clock = new FixedClock();
  const ports = {
    clock,
    ids,
    repository,
    audit,
    ai_runner: aiRunner,
    action_authorizer: authorizer,
    hypothesis_catalog_provider: catalogProvider,
  };
  return {
    repository,
    w5Channel,
    w6Channel,
    aiRunner,
    catalogProvider,
    authorizer,
    audit,
    ids,
    clock,
    ports,
  };
}

function createCommand(overrides = {}) {
  return {
    action: "create_cluster_candidate",
    event_id: "SYN-EVENT-BATCH-C-CREATE-001",
    case_ids: [CASE_A, CASE_B],
    cluster_id: CLUSTER_ID,
    name: "舱门解锁异常合成候选簇",
    category_domain: "车辆运维",
    ...overrides,
  };
}

function reviewCommand(overrides = {}) {
  return {
    action: "review_candidate",
    event_id: "SYN-EVENT-BATCH-C-REVIEW-001",
    case_ids: [CASE_A, CASE_B],
    cluster_id: CLUSTER_ID,
    actor: ACTOR,
    decision: "submit_for_review",
    reason: "合成问题负责人确认候选证据可进入审核。",
    ...overrides,
  };
}

function startCommand(overrides = {}) {
  return {
    action: "start_improvement",
    event_id: "SYN-EVENT-BATCH-C-START-001",
    case_ids: [CASE_A, CASE_B],
    cluster_id: CLUSTER_ID,
    improvement_id: IMPROVEMENT_ID,
    actor: ACTOR,
    improvement: {
      version: "synthetic.1",
      owner_role: "合成改进负责人",
      measure: "对合成舱门解锁链路执行版本与部件批次复核。",
      observation_window_days: [7, 30],
      clock_source: "test",
      metric_formula: "观察窗内同类案件数；无任务量分母时不计算复发率",
    },
    reason: "人工审核后启动合成改进项目。",
    ...overrides,
  };
}

function enterObservationCommand(overrides = {}) {
  return {
    action: "enter_observation",
    event_id: "SYN-EVENT-BATCH-D-ENTER-OBSERVATION-001",
    case_ids: [CASE_A, CASE_B],
    cluster_id: CLUSTER_ID,
    improvement_id: IMPROVEMENT_ID,
    actor: ACTOR,
    reason: "合成改进措施已完成人工复核，申请进入观察期。",
    ...overrides,
  };
}

function day7Command(cycleId, overrides = {}) {
  return {
    action: "record_day_7",
    event_id: "SYN-EVENT-BATCH-D-DAY-7-001",
    case_ids: [CASE_A, CASE_B],
    cluster_id: CLUSTER_ID,
    improvement_id: IMPROVEMENT_ID,
    cycle_id: cycleId,
    related_task_volume: null,
    ...overrides,
  };
}

function day30Command(cycleId, overrides = {}) {
  return {
    action: "record_day_30",
    event_id: "SYN-EVENT-BATCH-D-DAY-30-001",
    case_ids: [CASE_A, CASE_B],
    cluster_id: CLUSTER_ID,
    improvement_id: IMPROVEMENT_ID,
    cycle_id: cycleId,
    related_task_volume: null,
    ...overrides,
  };
}

function archiveCommand(cycleId, overrides = {}) {
  return {
    action: "archive_observation",
    event_id: "SYN-EVENT-BATCH-E-ARCHIVE-001",
    case_ids: [CASE_A, CASE_B],
    cluster_id: CLUSTER_ID,
    improvement_id: IMPROVEMENT_ID,
    actor: ACTOR,
    cycle_id: cycleId,
    human_conclusion: "合成 Day-7 与 Day-30 观察已由问题负责人复核，本周期授权归档。",
    reason: "合成观察周期已满足归档前置条件。",
    ...overrides,
  };
}

function reopenCommand(overrides = {}) {
  return {
    action: "reopen_recurrence",
    event_id: "SYN-EVENT-BATCH-E-REOPEN-001",
    case_ids: [CASE_A, CASE_B, CASE_C],
    cluster_id: CLUSTER_ID,
    improvement_id: IMPROVEMENT_ID,
    actor: ACTOR,
    triggering_case_ids: [CASE_C],
    reason: "归档后出现经 W5 授权闭环的独立复发案，申请重开观察。",
    ...overrides,
  };
}

function activeIntakeCommand(overrides = {}) {
  return {
    action: "intake_active_observation_recurrence",
    event_id: "SYN-EVENT-BATCH-D-ACTIVE-INTAKE-001",
    case_ids: [CASE_A, CASE_B, CASE_C],
    cluster_id: CLUSTER_ID,
    improvement_id: IMPROVEMENT_ID,
    actor: ACTOR,
    cycle_id: "SYN-CYCLE-BATCH-D-001",
    triggering_case_ids: [CASE_C],
    reason: "合成观察期内发现经 W5 关闭的新复发案，申请纳入当前簇。",
    ...overrides,
  };
}

async function createCandidate(harness, command = createCommand()) {
  const result = await runW6Improvement(command, harness.ports);
  assert.equal(result.status, "needs_human");
  return result;
}

async function reviewedHarness(options = {}) {
  const harness = await makeHarness(options);
  await createCandidate(harness);
  const review = await runW6Improvement(reviewCommand(), harness.ports);
  assert.equal(review.status, "completed");
  assert.equal((await harness.repository.findW6ClusterById(CLUSTER_ID)).status, "待审核");
  return harness;
}

async function activeImprovementHarness(options = {}) {
  const harness = await reviewedHarness(options);
  const started = await runW6Improvement(startCommand(), harness.ports);
  assert.equal(started.status, "completed", JSON.stringify(started));
  harness.clock.set(OBSERVATION_OPENED_AT);
  return harness;
}

async function highLevelObservingHarness(options = {}) {
  const harness = await activeImprovementHarness(options);
  const entered = await runW6Improvement(enterObservationCommand(), harness.ports);
  assert.equal(entered.status, "completed", JSON.stringify(entered));
  return harness;
}

async function day30ReadyHarness(options = {}) {
  const harness = await highLevelObservingHarness(options);
  const cycle = (await harness.repository.getW6History(CLUSTER_ID)).observation_cycles[0];
  harness.clock.set(DAY_7_AT);
  const day7 = await runW6Improvement(day7Command(cycle.cycle_id, {
    event_id: "SYN-EVENT-BATCH-D-DAY-7-READY-SEED",
  }), harness.ports);
  assert.equal(day7.status, "completed", JSON.stringify(day7));
  return { ...harness, cycle };
}

async function archiveReadyHarness(options = {}) {
  const harness = await day30ReadyHarness(options);
  harness.clock.set(DAY_30_AT);
  const day30 = await runW6Improvement(day30Command(harness.cycle.cycle_id, {
    event_id: "SYN-EVENT-BATCH-E-DAY-30-READY-SEED",
  }), harness.ports);
  assert.equal(day30.status, "completed", JSON.stringify(day30));
  harness.clock.set(ARCHIVE_AT);
  return harness;
}

async function directArchivedHarness({
  triggerClosures = [{ caseId: CASE_C, ordinal: 3, closedAt: "2026-09-04T00:00:00.001Z" }],
} = {}) {
  const harness = await archiveReadyHarness();
  const cluster = await harness.repository.findW6ClusterById(CLUSTER_ID);
  const improvement = await harness.repository.findW6ImprovementById(IMPROVEMENT_ID);
  const archived = await directAuthorizedW6Transition(
    harness.repository,
    harness.w6Channel.issuer,
    "SYN-EVENT-BATCH-E-DIRECT-ARCHIVE-SEED",
    snapshotW6AtomicTransition({
      action: "archive_observation",
      case_ids: [CASE_A, CASE_B],
      cluster_id: CLUSTER_ID,
      improvement_id: IMPROVEMENT_ID,
      expected_cluster_fingerprint: createWorkflowEventFingerprint(cluster),
      expected_improvement_fingerprint: createWorkflowEventFingerprint(improvement),
      history_id: "SYN-HISTORY-BATCH-E-DIRECT-ARCHIVE-SEED",
      receipt_id: "SYN-RECEIPT-BATCH-E-DIRECT-ARCHIVE-SEED",
      occurred_at: ARCHIVE_AT,
      cycle_id: harness.cycle.cycle_id,
      human_conclusion: "仓储层已提交的合成观察归档种子。",
      reason: "仅用于隔离验证 Batch E 高层重开编排。",
    }),
  );
  for (const trigger of triggerClosures) {
    await seedClosedCase(harness.repository, harness.w5Channel.issuer, trigger.caseId, trigger.ordinal, {
      closed_at: trigger.closedAt,
      updated_at: trigger.closedAt,
    });
  }
  harness.clock.set(REOPEN_AT);
  return { ...harness, archived };
}

async function publicArchivedHarness({
  triggerClosures = [{ caseId: CASE_C, ordinal: 3, closedAt: "2026-09-04T00:00:00.001Z" }],
} = {}) {
  const harness = await archiveReadyHarness();
  const archived = await runW6Improvement(archiveCommand(harness.cycle.cycle_id, {
    event_id: "SYN-EVENT-BATCH-E-PUBLIC-ARCHIVE-SEED",
  }), harness.ports);
  assert.equal(archived.status, "completed", JSON.stringify(archived));
  for (const trigger of triggerClosures) {
    await seedClosedCase(harness.repository, harness.w5Channel.issuer, trigger.caseId, trigger.ordinal, {
      closed_at: trigger.closedAt,
      updated_at: trigger.closedAt,
    });
  }
  harness.clock.set(REOPEN_AT);
  return { ...harness, archived };
}

function sortedMapSnapshot(map) {
  return structuredClone(
    [...map.entries()].sort(([left], [right]) => String(left).localeCompare(String(right))),
  );
}

async function highLevelDurableState(repository) {
  const clusters = await repository.listW6Clusters();
  const clusterIds = clusters.map((record) => record.cluster_id).sort();
  const improvementIds = [...new Set(clusters.flatMap((record) =>
    record.active_improvement_id === null ? [] : [record.active_improvement_id]
  ))].sort();
  return {
    cases_all_fields: sortedMapSnapshot(repository.casesById),
    feedback_by_id_all_fields: sortedMapSnapshot(repository.rawFeedbackById),
    feedback_by_key_all_fields: sortedMapSnapshot(repository.rawFeedbackByKey),
    work_orders_all_fields: sortedMapSnapshot(repository.workOrdersById),
    case_feedback_index: sortedMapSnapshot(repository.caseByFeedbackId),
    case_work_order_index: sortedMapSnapshot(repository.workOrderByCaseId),
    same_event_checks: sortedMapSnapshot(repository.sameEventChecksByCaseId),
    same_event_resolutions: sortedMapSnapshot(repository.sameEventResolutionsByCaseId),
    w5_evidence: sortedMapSnapshot(repository.w5EvidenceSubmissionsByCaseId),
    w5_reply_drafts: sortedMapSnapshot(repository.w5ReplyDraftsByCaseId),
    w5_reply_reviews: sortedMapSnapshot(repository.w5ReplyReviewsByCaseId),
    w5_follow_ups: sortedMapSnapshot(repository.w5FollowUpsByCaseId),
    w5_closure_decisions: sortedMapSnapshot(repository.w5ClosureDecisionsByCaseId),
    w6: {
      clusters,
      improvements: await Promise.all(improvementIds.map(async (id) => [
        id,
        await repository.findW6ImprovementById(id),
      ])),
      histories: await Promise.all(clusterIds.map(async (id) => [
        id,
        await repository.getW6History(id),
      ])),
    },
  };
}

function normalizedReplayFailure(result) {
  const normalized = structuredClone(result);
  normalized.event_id = "normalized_event";
  if (normalized.output && typeof normalized.output === "object") {
    if ("workflow_audit_id" in normalized.output) {
      normalized.output.workflow_audit_id = "normalized_audit";
    }
  }
  return normalized;
}

function assertNoReplaySecrets(value, forbiddenValues = []) {
  const forbiddenKeys = new Set([
    "authorization_policy_version",
    "authorization_transition",
    "closure_provenance",
    "grant",
    "history",
    "observation_cycle",
    "opened_by",
    "original_cycle_id",
    "original_history_id",
    "original_receipt_id",
    "policy_version",
    "principal",
    "receipt",
    "stable_semantic_fingerprint",
    "target_fingerprint",
  ]);
  const visit = (candidate) => {
    if (candidate === null || typeof candidate !== "object") return;
    if (Array.isArray(candidate)) {
      for (const entry of candidate) visit(entry);
      return;
    }
    for (const [key, entry] of Object.entries(candidate)) {
      assert.equal(forbiddenKeys.has(key), false, `forbidden replay key: ${key}`);
      visit(entry);
    }
  };
  visit(value);
  const serialized = JSON.stringify(value);
  for (const forbidden of forbiddenValues) {
    assert.equal(serialized.includes(forbidden), false, `forbidden replay value: ${forbidden}`);
  }
}

function assertExactOwnKeys(value, expected, label) {
  assert.equal(value !== null && typeof value === "object" && !Array.isArray(value), true, label);
  assert.deepEqual(Object.keys(value).sort(), [...expected].sort(), label);
}

function assertMinimalSemanticReplayResult(result, { eventReplayed = false } = {}) {
  assertExactOwnKeys(result, [
    "workflow",
    "event_id",
    "status",
    "object_ref",
    "previous_state",
    "next_state",
    "actions",
    "errors",
    "output",
  ], "semantic replay result keys");
  assertExactOwnKeys(result.object_ref, ["object_type", "object_id"], "semantic replay object_ref keys");
  assertExactOwnKeys(result.output, [
    "evidence_class",
    "human_review_required",
    "final_root_cause",
    "external_effects",
    "commit_outcome",
    "semantic_replayed",
    "existing_result",
    "workflow_audit_id",
    "audit_state",
    "audit_pending",
    "event_result_cached",
    ...(eventReplayed ? ["event_replayed"] : []),
  ], "semantic replay output keys");
  assertExactOwnKeys(result.output.external_effects, [
    "automatic_case_merge",
    "automatic_feedback_relink",
    "automatic_final_root_cause",
    "automatic_case_closure",
    "automatic_knowledge_publication",
    "vehicle_control_performed",
  ], "semantic replay external-effect keys");
  assertExactOwnKeys(result.output.existing_result, [
    "cluster_id",
    "cluster_status",
    "improvement_id",
    "improvement_status",
  ], "semantic replay artifact keys");
}

function assertMinimalSemanticReplayAudit(record) {
  assertExactOwnKeys(record, [
    "audit_id",
    "object_ref",
    "category",
    "occurred_at",
    "clock_source",
    "payload",
  ], "semantic replay audit keys");
  assertExactOwnKeys(record.object_ref, ["object_type", "object_id"], "semantic replay audit object_ref keys");
  assertExactOwnKeys(record.payload, [
    "workflow",
    "event_id",
    "evidence_class",
    "result",
    "statement_boundary",
  ], "semantic replay audit payload keys");
  assertExactOwnKeys(record.payload.statement_boundary, [
    "real_feishu_connected",
    "enterprise_data_used",
    "root_cause_is_final",
    "business_effect_claimed",
  ], "semantic replay audit statement-boundary keys");
  assertMinimalSemanticReplayResult(record.payload.result);
}

function highLevelOperationalState(repository) {
  return {
    cases_all_fields: sortedMapSnapshot(repository.casesById),
    feedback_by_id_all_fields: sortedMapSnapshot(repository.rawFeedbackById),
    feedback_by_key_all_fields: sortedMapSnapshot(repository.rawFeedbackByKey),
    work_orders_all_fields: sortedMapSnapshot(repository.workOrdersById),
    case_feedback_index: sortedMapSnapshot(repository.caseByFeedbackId),
    case_work_order_index: sortedMapSnapshot(repository.workOrderByCaseId),
    same_event_checks: sortedMapSnapshot(repository.sameEventChecksByCaseId),
    same_event_resolutions: sortedMapSnapshot(repository.sameEventResolutionsByCaseId),
    w5_evidence: sortedMapSnapshot(repository.w5EvidenceSubmissionsByCaseId),
    w5_reply_drafts: sortedMapSnapshot(repository.w5ReplyDraftsByCaseId),
    w5_reply_reviews: sortedMapSnapshot(repository.w5ReplyReviewsByCaseId),
    w5_follow_ups: sortedMapSnapshot(repository.w5FollowUpsByCaseId),
    w5_closure_decisions: sortedMapSnapshot(repository.w5ClosureDecisionsByCaseId),
  };
}

function instrumentBatchEValidationGrants(harness) {
  const original = harness.repository.validateAndIssueW6AiAction.bind(harness.repository);
  let calls = 0;
  harness.repository.validateAndIssueW6AiAction = (input) => {
    calls += 1;
    return original(input);
  };
  return { get calls() { return calls; } };
}

async function seedUnprovenancedClosedCase(repository, caseId, ordinal, closedAt) {
  const caseRecord = closedCase(caseId, ordinal, {
    closed_at: closedAt,
    updated_at: closedAt,
  });
  const feedback = rawFeedback(caseId, ordinal);
  const workOrder = {
    ...syntheticWorkOrder(caseId, ordinal, closedAt),
    status: "已完成",
    validation_result: "passed",
    disposition_evidence: "伪装的完成态不得代替 W5 闭环来源。",
    completed_at: closedAt,
  };
  repository.casesById.set(caseId, structuredClone(caseRecord));
  repository.workOrdersById.set(workOrder.work_order_id, structuredClone(workOrder));
  repository.workOrderByCaseId.set(caseId, workOrder.work_order_id);
  repository.rawFeedbackById.set(feedback.feedback_id, structuredClone(feedback));
  repository.rawFeedbackByKey.set(feedback.idempotency_key, structuredClone(feedback));
  repository.caseByFeedbackId.set(feedback.feedback_id, caseId);
  await repository.insertSameEventCheckIfAbsent({
    check_id: `SYN-BATCH-E-UNPROVENANCED-CHECK-${ordinal}`,
    case_id: caseId,
    mode: "same_event_duplicate",
    candidate: null,
    evidence_spans: [],
    review_state: "not_required",
    node_status: "ok",
    automatic_merge: false,
    automatic_relink: false,
    created_at: closedAt,
  });
}


async function directAuthorizedW6Transition(
  repository,
  issuer,
  eventId,
  transition,
  expectedOutcome = "committed",
) {
  const binding = createW6AuthorizationBinding(transition);
  const fingerprint = createWorkflowEventFingerprint({ workflow: "W6", event_id: eventId, transition });
  let committed;
  await repository.runWorkflowEvent(eventId, fingerprint, () =>
    repository.runW6ResourcesExclusive(
      {
        case_ids: [...transition.case_ids],
        cluster_id: transition.cluster_id,
        improvement_id: transition.improvement_id,
      },
      async () => {
        const claims = {
          workflow: "W6",
          event_id: eventId,
          phase: binding.phase,
          case_ids: [...binding.case_ids],
          cluster_id: binding.cluster_id,
          improvement_id: binding.improvement_id,
          action: binding.action,
          target_fingerprint: binding.target_fingerprint,
          command_fingerprint: fingerprint,
          principal: PRINCIPAL,
          policy_version: POLICY_VERSION,
        };
        const grant = issuer.issue(claims);
        committed = await repository.runAuthorizedW6Action(
          { grant, claims },
          () => repository.commitW6Transition(transition),
        );
        return {
          workflow: "W6",
          event_id: eventId,
          status: "completed",
          object_ref: { object_type: "cluster", object_id: transition.cluster_id },
          actions: [transition.action],
          errors: [],
          output: { synthetic_seed: true },
        };
      },
    )
  );
  assert.equal(committed.outcome, expectedOutcome);
  return committed;
}

async function commitWinningObservationDuringAuthorization(harness) {
  const cluster = await harness.repository.findW6ClusterById(CLUSTER_ID);
  const improvement = await harness.repository.findW6ImprovementById(IMPROVEMENT_ID);
  return directAuthorizedW6Transition(
    harness.repository,
    harness.w6Channel.issuer,
    "SYN-EVENT-BATCH-D-ENTER-OBSERVATION-WINNER",
    snapshotW6AtomicTransition({
      action: "enter_observation",
      case_ids: [CASE_A, CASE_B],
      cluster_id: CLUSTER_ID,
      improvement_id: IMPROVEMENT_ID,
      expected_cluster_fingerprint: createWorkflowEventFingerprint(cluster),
      expected_improvement_fingerprint: createWorkflowEventFingerprint(improvement),
      history_id: "SYN-HISTORY-BATCH-D-ENTER-OBSERVATION-WINNER",
      receipt_id: "SYN-RECEIPT-BATCH-D-ENTER-OBSERVATION-WINNER",
      occurred_at: OBSERVATION_OPENED_AT,
      cycle_id: "SYN-CYCLE-BATCH-D-WINNER",
      clock_source: "test",
      reason: "并发授权观察事件先行提交。",
    }),
  );
}

async function commitWinningArchiveDuringAuthorization(harness) {
  const cluster = await harness.repository.findW6ClusterById(CLUSTER_ID);
  const improvement = await harness.repository.findW6ImprovementById(IMPROVEMENT_ID);
  return directAuthorizedW6Transition(
    harness.repository,
    harness.w6Channel.issuer,
    "SYN-EVENT-BATCH-E-ARCHIVE-WINNER",
    snapshotW6AtomicTransition({
      action: "archive_observation",
      case_ids: [CASE_A, CASE_B],
      cluster_id: CLUSTER_ID,
      improvement_id: IMPROVEMENT_ID,
      expected_cluster_fingerprint: createWorkflowEventFingerprint(cluster),
      expected_improvement_fingerprint: createWorkflowEventFingerprint(improvement),
      history_id: "SYN-HISTORY-BATCH-E-ARCHIVE-WINNER",
      receipt_id: "SYN-RECEIPT-BATCH-E-ARCHIVE-WINNER",
      occurred_at: ARCHIVE_AT,
      cycle_id: harness.cycle.cycle_id,
      human_conclusion: "并发授权归档事件先行提交。",
      reason: "验证高层归档在授权等待后必须执行 CAS。",
    }),
  );
}

async function commitWinningReopenDuringAuthorization(harness) {
  const cluster = await harness.repository.findW6ClusterById(CLUSTER_ID);
  const improvement = await harness.repository.findW6ImprovementById(IMPROVEMENT_ID);
  return directAuthorizedW6Transition(
    harness.repository,
    harness.w6Channel.issuer,
    "SYN-EVENT-BATCH-E-REOPEN-WINNER",
    snapshotW6AtomicTransition({
      action: "reopen_recurrence",
      case_ids: [CASE_A, CASE_B, CASE_D],
      cluster_id: CLUSTER_ID,
      improvement_id: IMPROVEMENT_ID,
      expected_cluster_fingerprint: createWorkflowEventFingerprint(cluster),
      expected_improvement_fingerprint: createWorkflowEventFingerprint(improvement),
      history_id: "SYN-HISTORY-BATCH-E-REOPEN-WINNER",
      receipt_id: "SYN-RECEIPT-BATCH-E-REOPEN-WINNER",
      occurred_at: REOPEN_AT,
      cycle_id: "SYN-CYCLE-BATCH-E-REOPEN-WINNER",
      triggering_case_ids: [CASE_D],
      clock_source: "test",
      reason: "并发授权重开事件先以另一独立复发案提交。",
    }),
  );
}

async function observingHarness(options = {}) {
  const harness = await reviewedHarness(options);
  const started = await runW6Improvement(startCommand(), harness.ports);
  assert.equal(started.status, "completed");
  harness.clock.set("2026-08-04T00:00:00.000Z");
  const cluster = await harness.repository.findW6ClusterById(CLUSTER_ID);
  const improvement = await harness.repository.findW6ImprovementById(IMPROVEMENT_ID);
  await directAuthorizedW6Transition(
    harness.repository,
    harness.w6Channel.issuer,
    "SYN-EVENT-BATCH-D-ENTER-OBSERVATION-SEED",
    snapshotW6AtomicTransition({
      action: "enter_observation",
      case_ids: [CASE_A, CASE_B],
      cluster_id: CLUSTER_ID,
      improvement_id: IMPROVEMENT_ID,
      expected_cluster_fingerprint: createWorkflowEventFingerprint(cluster),
      expected_improvement_fingerprint: createWorkflowEventFingerprint(improvement),
      history_id: "SYN-HISTORY-BATCH-D-ENTER-OBSERVATION-SEED",
      receipt_id: "SYN-RECEIPT-BATCH-D-ENTER-OBSERVATION-SEED",
      occurred_at: "2026-08-04T00:00:00.000Z",
      cycle_id: "SYN-CYCLE-BATCH-D-001",
      clock_source: "test",
      reason: "人工授权进入合成观察期。",
    }),
  );
  await seedClosedCase(harness.repository, harness.w5Channel.issuer, CASE_C, 3, {
    closed_at: "2026-08-05T00:00:00.000Z",
    updated_at: "2026-08-05T00:00:00.000Z",
  });
  harness.clock.set("2026-08-06T00:00:00.000Z");
  return harness;
}

async function directAuthorizedReview(repository, issuer, eventId, command) {
  const cluster = await repository.findW6ClusterById(command.cluster_id);
  const transition = snapshotW6AtomicTransition({
    action: "review_candidate",
    case_ids: [...command.case_ids],
    cluster_id: command.cluster_id,
    improvement_id: null,
    expected_cluster_fingerprint: createWorkflowEventFingerprint(cluster),
    expected_improvement_fingerprint: null,
    history_id: `${eventId}-HISTORY`,
    receipt_id: `${eventId}-RECEIPT`,
    occurred_at: NOW,
    decision: "submit_for_review",
    reason: "并发合成授权审核先行提交。",
  });
  const binding = createW6AuthorizationBinding(transition);
  const fingerprint = createWorkflowEventFingerprint({ workflow: "W6", event_id: eventId, transition });
  await repository.runWorkflowEvent(eventId, fingerprint, () =>
    repository.runW6ResourcesExclusive(
      { case_ids: [...command.case_ids], cluster_id: command.cluster_id, improvement_id: null },
      async () => {
        const claims = {
          workflow: "W6",
          event_id: eventId,
          phase: binding.phase,
          case_ids: [...binding.case_ids],
          cluster_id: binding.cluster_id,
          improvement_id: binding.improvement_id,
          action: binding.action,
          target_fingerprint: binding.target_fingerprint,
          command_fingerprint: fingerprint,
          principal: PRINCIPAL,
          policy_version: POLICY_VERSION,
        };
        const grant = issuer.issue(claims);
        await repository.runAuthorizedW6Action(
          { grant, claims },
          () => repository.commitW6Transition(transition),
        );
        return {
          workflow: "W6",
          event_id: eventId,
          status: "completed",
          object_ref: { object_type: "cluster", object_id: command.cluster_id },
          actions: ["synthetic_concurrent_review"],
          errors: [],
          output: { synthetic_experiment: true },
        };
      },
    )
  );
}

test("W6 Batch C exports the exact orchestration entry points", () => {
  assert.equal(typeof fingerprintW6ImprovementCommand, "function");
  assert.equal(typeof runW6Improvement, "function");
});

test("W6 creates only an N5 new-cluster candidate from authoritative W5 closures", async () => {
  const harness = await makeHarness();
  const beforeCases = await Promise.all([CASE_A, CASE_B].map((id) => harness.repository.findCaseById(id)));
  const result = await runW6Improvement(createCommand(), harness.ports);
  const cluster = await harness.repository.findW6ClusterById(CLUSTER_ID);
  assert.equal(result.status, "needs_human");
  assert.equal(cluster.status, "候选");
  assert.deepEqual(cluster.member_case_ids, [CASE_A, CASE_B]);
  assert.equal(harness.authorizer.calls.length, 0);
  assert.equal(harness.aiRunner.calls.filter((entry) => entry.node === "N5").length, 1);
  assert.deepEqual(await Promise.all([CASE_A, CASE_B].map((id) => harness.repository.findCaseById(id))), beforeCases);
  assert.equal(JSON.stringify(result).includes("automatic_merge\":true"), false);
});

test("W6 N5 second failure writes no cluster and caches the failed event", async () => {
  const harness = await makeHarness();
  harness.aiRunner.failN5 = true;
  const command = createCommand({ event_id: "SYN-EVENT-BATCH-C-N5-FAIL" });
  const first = await runW6Improvement(command, harness.ports);
  const replay = await runW6Improvement(command, harness.ports);
  assert.equal(first.status, "failed");
  assert.equal(first.output.error_class, "n5_failure");
  assert.equal(replay.status, "failed");
  assert.equal(await harness.repository.findW6ClusterById(CLUSTER_ID), null);
  assert.equal(harness.aiRunner.calls.length, 1);
  assert.equal(harness.authorizer.calls.length, 0);
});

test("W6 authorized candidate review supports submit and reject without merging cases", async () => {
  const submitted = await makeHarness();
  await createCandidate(submitted);
  const submit = await runW6Improvement(reviewCommand(), submitted.ports);
  assert.equal(submit.status, "completed");
  assert.equal((await submitted.repository.findW6ClusterById(CLUSTER_ID)).status, "待审核");
  assert.equal(submitted.authorizer.calls.length, 1);

  const rejected = await makeHarness();
  await createCandidate(rejected);
  const reject = await runW6Improvement(reviewCommand({
    event_id: "SYN-EVENT-BATCH-C-REJECT",
    decision: "reject",
    reason: "合成问题负责人认为候选证据不足并驳回。",
  }), rejected.ports);
  assert.equal(reject.status, "completed");
  assert.equal((await rejected.repository.findW6ClusterById(CLUSTER_ID)).status, "已驳回");
  assert.deepEqual([...rejected.repository.caseByFeedbackId.entries()].length, 2);
});

test("W6 start stores one draft.3 controlled hypothesis and a versioned executing improvement", async () => {
  const harness = await reviewedHarness();
  const result = await runW6Improvement(startCommand(), harness.ports);
  const cluster = await harness.repository.findW6ClusterById(CLUSTER_ID);
  const improvement = await harness.repository.findW6ImprovementById(IMPROVEMENT_ID);
  assert.equal(result.status, "completed", JSON.stringify(result));
  assert.equal(cluster.status, "改进中");
  assert.equal(improvement.status, "执行中");
  assert.equal(cluster.root_cause_hypothesis.node_version, "N6-root-cause-1.0.0-draft.3");
  assert.equal(cluster.root_cause_hypothesis.final_root_cause, false);
  assert.equal(cluster.root_cause_hypothesis.supporting_evidence.length, 2);
  assert.equal(cluster.root_cause_hypothesis.counter_evidence.length, 2);
  assert.deepEqual(cluster.root_cause_hypothesis.uncertainties, ["待确认：样本量有限"]);
  assert.equal(result.output.hypothesis_state, "controlled_hypothesis_pending_human_validation");
  assert.equal(result.output.external_effects.automatic_knowledge_publication, false);
});

test("W6 high-level enter_observation generates trusted cycle metadata and uses one observation authorization", async () => {
  const harness = await activeImprovementHarness();
  const command = enterObservationCommand();
  const priorAiCalls = harness.aiRunner.calls.length;
  const priorAuthorizationCalls = harness.authorizer.calls.length;

  assert.equal(
    fingerprintW6ImprovementCommand(command),
    createWorkflowEventFingerprint({ workflow: "W6", batch: "observation_batch_d", command }),
  );
  const result = await runW6Improvement(command, harness.ports);
  const cluster = await harness.repository.findW6ClusterById(CLUSTER_ID);
  const improvement = await harness.repository.findW6ImprovementById(IMPROVEMENT_ID);
  const history = await harness.repository.getW6History(CLUSTER_ID);

  assert.equal(result.status, "completed", JSON.stringify(result));
  assert.equal(cluster.status, "观察中");
  assert.equal(improvement.status, "观察中");
  assert.equal(history.observation_cycles.length, 1);
  assert.equal(history.observation_cycles[0].cycle_id, improvement.current_observation_cycle_id);
  assert.equal(history.observation_cycles[0].trigger, "initial_observation");
  assert.equal(history.observation_cycles[0].opened_at, OBSERVATION_OPENED_AT);
  assert.equal(history.observation_cycles[0].clock_source, "test");
  assert.deepEqual(history.observation_cycles[0].opened_by, PRINCIPAL);
  assert.equal(history.observation_cycles[0].authorization_policy_version, POLICY_VERSION);
  assert.equal(result.output.observation_cycle.cycle_id, history.observation_cycles[0].cycle_id);
  assert.equal(result.output.receipt.action, "enter_observation");
  assert.equal(result.output.receipt.cycle_id, history.observation_cycles[0].cycle_id);
  assert.equal(result.output.receipt.receipt_id, history.receipts.at(-1).receipt_id);
  assert.equal(history.entries.at(-1).action, "enter_observation");
  assert.equal(harness.aiRunner.calls.length, priorAiCalls);
  assert.equal(harness.authorizer.calls.length, priorAuthorizationCalls + 1);
  assert.equal(harness.authorizer.calls.at(-1).action, "enter_observation");
  assert.equal(harness.authorizer.calls.at(-1).phase, "observation");
});

test("W6 high-level enter_observation denial and wrong-channel grant preserve the full durable state", async () => {
  const denied = await activeImprovementHarness();
  denied.ports.action_authorizer = createAuthorizer(denied.w6Channel.issuer, {
    denyAction: "enter_observation",
  });
  const deniedBefore = await highLevelDurableState(denied.repository);
  const deniedAiCalls = denied.aiRunner.calls.length;
  const deniedResult = await runW6Improvement(enterObservationCommand({
    event_id: "SYN-EVENT-BATCH-D-ENTER-OBSERVATION-DENIED",
  }), denied.ports);
  assert.equal(deniedResult.status, "failed");
  assert.equal(deniedResult.output.error_class, "authorization_failure");
  assert.deepEqual(await highLevelDurableState(denied.repository), deniedBefore);
  assert.equal(denied.aiRunner.calls.length, deniedAiCalls);
  assert.equal(denied.ports.action_authorizer.calls.length, 1);

  const wrong = await activeImprovementHarness();
  const wrongChannel = createW6AuthorizationGrantChannel();
  wrong.ports.action_authorizer = createAuthorizer(wrongChannel.issuer);
  const wrongBefore = await highLevelDurableState(wrong.repository);
  const wrongAiCalls = wrong.aiRunner.calls.length;
  const wrongResult = await runW6Improvement(enterObservationCommand({
    event_id: "SYN-EVENT-BATCH-D-ENTER-OBSERVATION-WRONG-GRANT",
  }), wrong.ports);
  assert.equal(wrongResult.status, "failed");
  assert.equal(wrongResult.output.error_class, "authorization_capability_invalid");
  assert.deepEqual(await highLevelDurableState(wrong.repository), wrongBefore);
  assert.equal(wrong.aiRunner.calls.length, wrongAiCalls);
  assert.equal(wrong.ports.action_authorizer.calls.length, 1);

  const forged = await activeImprovementHarness();
  const forgedCalls = [];
  forged.ports.action_authorizer = {
    calls: forgedCalls,
    async authorize(input) {
      forgedCalls.push(structuredClone(input));
      return {
        allowed: true,
        principal: PRINCIPAL,
        policy_version: POLICY_VERSION,
        grant: Object.freeze(Object.create(null)),
      };
    },
  };
  const forgedBefore = await highLevelDurableState(forged.repository);
  const forgedResult = await runW6Improvement(enterObservationCommand({
    event_id: "SYN-EVENT-BATCH-D-ENTER-OBSERVATION-FORGED-GRANT",
  }), forged.ports);
  assert.equal(forgedResult.status, "failed");
  assert.equal(forgedResult.output.error_class, "authorization_capability_invalid");
  assert.deepEqual(await highLevelDurableState(forged.repository), forgedBefore);
  assert.equal(forgedCalls.length, 1);
});

test("W6 high-level enter_observation awaits authorization without locks and loses a stale CAS race", async () => {
  const harness = await activeImprovementHarness();
  const originalExclusive = harness.repository.runW6ResourcesExclusive.bind(harness.repository);
  let activeResourceSections = 0;
  let authorizationObservedUnlocked = null;
  harness.repository.runW6ResourcesExclusive = (resources, operation) =>
    originalExclusive(resources, async () => {
      activeResourceSections += 1;
      try {
        return await operation();
      } finally {
        activeResourceSections -= 1;
      }
    });
  harness.ports.action_authorizer = createAuthorizer(harness.w6Channel.issuer, {
    async onAuthorize() {
      authorizationObservedUnlocked = activeResourceSections === 0;
      await commitWinningObservationDuringAuthorization(harness);
    },
  });
  const aiCalls = harness.aiRunner.calls.length;
  const result = await runW6Improvement(enterObservationCommand({
    event_id: "SYN-EVENT-BATCH-D-ENTER-OBSERVATION-STALE",
  }), harness.ports);
  const history = await harness.repository.getW6History(CLUSTER_ID);

  assert.equal(result.status, "failed");
  assert.equal(result.output.error_class, "concurrency_conflict");
  assert.equal(authorizationObservedUnlocked, true);
  assert.equal(activeResourceSections, 0);
  assert.equal(harness.aiRunner.calls.length, aiCalls);
  assert.equal(harness.ports.action_authorizer.calls.length, 1);
  assert.equal(history.observation_cycles.length, 1);
  assert.equal(history.observation_cycles[0].cycle_id, "SYN-CYCLE-BATCH-D-WINNER");
  assert.equal(history.entries.filter((entry) => entry.action === "enter_observation").length, 1);
});

test("W6 high-level enter_observation reports trusted-clock drift as invalid_state with zero business writes", async () => {
  const harness = await activeImprovementHarness();
  harness.ports.action_authorizer = createAuthorizer(harness.w6Channel.issuer, {
    onAuthorize() {
      harness.clock.set("2026-08-04T00:00:00.001Z");
    },
  });
  const before = await highLevelDurableState(harness.repository);
  const aiCalls = harness.aiRunner.calls.length;
  const authorizationCalls = harness.ports.action_authorizer.calls.length;
  const result = await runW6Improvement(enterObservationCommand({
    event_id: "SYN-EVENT-BATCH-D-ENTER-OBSERVATION-CLOCK-DRIFT",
  }), harness.ports);

  assert.equal(result.status, "failed");
  assert.equal(result.output.error_class, "invalid_state");
  assert.deepEqual(await highLevelDurableState(harness.repository), before);
  assert.equal(harness.aiRunner.calls.length, aiCalls);
  assert.equal(harness.ports.action_authorizer.calls.length, authorizationCalls + 1);
});

test("W6 high-level enter_observation replay repairs only audit and different payload conflicts", async () => {
  const harness = await activeImprovementHarness();
  const originalCommit = harness.repository.commitW6Transition.bind(harness.repository);
  let commitCalls = 0;
  harness.repository.commitW6Transition = (transition) => {
    commitCalls += 1;
    return originalCommit(transition);
  };
  const attempts = [];
  harness.ports.audit = {
    async append(record) {
      attempts.push(structuredClone(record));
      if (attempts.length === 1) throw new Error("synthetic first enter-observation audit failure");
    },
  };
  const command = enterObservationCommand({
    event_id: "SYN-EVENT-BATCH-D-ENTER-OBSERVATION-AUDIT-REPAIR",
  });
  const aiCalls = harness.aiRunner.calls.length;
  const authorizationCalls = harness.authorizer.calls.length;
  const first = await runW6Improvement(command, harness.ports);
  const idsAfterFirst = harness.ids.current;
  const replay = await runW6Improvement(command, harness.ports);
  const conflict = await runW6Improvement({ ...command, reason: "不同的合成观察授权理由。" }, harness.ports);
  const history = await harness.repository.getW6History(CLUSTER_ID);

  assert.equal(first.status, "completed");
  assert.equal(first.output.audit_state, "pending");
  assert.equal(replay.status, "idempotent");
  assert.equal(replay.output.audit_state, "recorded");
  assert.equal(replay.output.event_replayed, true);
  assert.equal(replay.actions.includes("return_existing_W6_observation_batch_d_result"), true);
  assert.equal(replay.actions.includes("do_not_repeat_W6_observation_effects"), true);
  assert.equal(replay.actions.includes("return_existing_W6_batch_c_result"), false);
  assert.equal(replay.actions.includes("do_not_repeat_N5_or_N6"), false);
  assert.equal(conflict.status, "failed");
  assert.equal(conflict.output.error_class, "event_conflict");
  assert.equal(attempts[0].audit_id, attempts[1].audit_id);
  assert.equal(harness.aiRunner.calls.length, aiCalls);
  assert.equal(harness.authorizer.calls.length, authorizationCalls + 1);
  assert.equal(commitCalls, 1);
  assert.equal(harness.ids.current, idsAfterFirst);
  assert.equal(history.observation_cycles.length, 1);
  assert.equal(history.entries.filter((entry) => entry.action === "enter_observation").length, 1);
});

test("W6 high-level record_day_7 records the exact trusted checkpoint with no denominator, AI, or authorization", async () => {
  const harness = await highLevelObservingHarness();
  const cycle = (await harness.repository.getW6History(CLUSTER_ID)).observation_cycles[0];
  harness.clock.set(DAY_7_AT);
  const command = day7Command(cycle.cycle_id);
  const aiCalls = harness.aiRunner.calls.length;
  const authorizationCalls = harness.authorizer.calls.length;
  const result = await runW6Improvement(command, harness.ports);
  const history = await harness.repository.getW6History(CLUSTER_ID);

  assert.equal(result.status, "completed", JSON.stringify(result));
  assert.equal(result.output.observation_checkpoint.horizon_days, 7);
  assert.equal(result.output.observation_checkpoint.recorded_at, DAY_7_AT);
  assert.equal(result.output.observation_checkpoint.clock_source, "test");
  assert.deepEqual(result.output.observation_checkpoint.recurrence_case_ids, []);
  assert.equal(result.output.observation_checkpoint.recurrence_count, 0);
  assert.equal(result.output.observation_checkpoint.related_task_volume, null);
  assert.equal(result.output.observation_checkpoint.recurrence_rate, null);
  assert.equal(result.output.receipt.action, "record_day_7");
  assert.equal(
    result.output.receipt.checkpoint_id,
    result.output.observation_checkpoint.checkpoint_id,
  );
  assert.equal(result.output.receipt.receipt_id, history.receipts.at(-1).receipt_id);
  assert.equal(history.entries.at(-1).action, "record_day_7");
  assert.equal(history.entries.at(-1).principal, null);
  assert.equal(history.observation_checkpoints.length, 1);
  assert.equal(harness.aiRunner.calls.length, aiCalls);
  assert.equal(harness.authorizer.calls.length, authorizationCalls);
});

test("W6 high-level record_day_7 rejects early, late, and clock-source mismatch with full zero writes", async () => {
  const cases = [
    ["early", "2026-08-10T23:59:59.999Z", "test"],
    ["late", "2026-08-11T00:00:00.001Z", "test"],
    ["clock_mismatch", DAY_7_AT, "synthetic_history"],
  ];
  for (const [label, now, source] of cases) {
    const harness = await highLevelObservingHarness();
    const cycle = (await harness.repository.getW6History(CLUSTER_ID)).observation_cycles[0];
    harness.clock.set(now);
    harness.clock.source = source;
    const before = await highLevelDurableState(harness.repository);
    const aiCalls = harness.aiRunner.calls.length;
    const authorizationCalls = harness.authorizer.calls.length;
    const result = await runW6Improvement(day7Command(cycle.cycle_id, {
      event_id: `SYN-EVENT-BATCH-D-DAY-7-${label}`,
    }), harness.ports);
    assert.equal(result.status, "failed", `${label}: ${JSON.stringify(result)}`);
    assert.equal(result.output.error_class, "invalid_state", label);
    assert.equal(result.event_id, `SYN-EVENT-BATCH-D-DAY-7-${label}`);
    assert.deepEqual(result.object_ref, { object_type: "cluster", object_id: CLUSTER_ID });
    assert.deepEqual(await highLevelDurableState(harness.repository), before, label);
    assert.equal(harness.aiRunner.calls.length, aiCalls, label);
    assert.equal(harness.authorizer.calls.length, authorizationCalls, label);
  }
});

test("W6 high-level record_day_7 rechecks its trusted clock after waiting for the resource lock", async () => {
  const harness = await highLevelObservingHarness();
  const cycle = (await harness.repository.getW6History(CLUSTER_ID)).observation_cycles[0];
  harness.clock.set(DAY_7_AT);
  const resources = {
    case_ids: [CASE_A, CASE_B],
    cluster_id: CLUSTER_ID,
    improvement_id: IMPROVEMENT_ID,
  };
  const originalExclusive = harness.repository.runW6ResourcesExclusive.bind(harness.repository);
  let releaseHold;
  let markHeld;
  let markSecondInvocation;
  const held = new Promise((resolve) => { markHeld = resolve; });
  const holdRelease = new Promise((resolve) => { releaseHold = resolve; });
  const secondInvocation = new Promise((resolve) => { markSecondInvocation = resolve; });
  let invocation = 0;
  harness.repository.runW6ResourcesExclusive = (resourceSet, operation) => {
    invocation += 1;
    if (invocation === 2) markSecondInvocation();
    return originalExclusive(resourceSet, operation);
  };
  const blocker = harness.repository.runW6ResourcesExclusive(resources, async () => {
    markHeld();
    await holdRelease;
  });
  await held;
  const before = await highLevelDurableState(harness.repository);
  const aiCalls = harness.aiRunner.calls.length;
  const authorizationCalls = harness.authorizer.calls.length;
  const pending = runW6Improvement(day7Command(cycle.cycle_id, {
    event_id: "SYN-EVENT-BATCH-D-DAY-7-LOCK-WAIT-CLOCK-RACE",
  }), harness.ports);
  await secondInvocation;
  harness.clock.set("2026-08-11T00:00:00.001Z");
  releaseHold();
  await blocker;
  const result = await pending;

  assert.equal(result.status, "failed");
  assert.equal(result.output.error_class, "invalid_state");
  assert.deepEqual(await highLevelDurableState(harness.repository), before);
  assert.equal(harness.aiRunner.calls.length, aiCalls);
  assert.equal(harness.authorizer.calls.length, authorizationCalls);
});

test("W6 high-level timed replay repairs audit once and same event with a different payload conflicts", async () => {
  const harness = await highLevelObservingHarness();
  const originalCommit = harness.repository.commitW6Transition.bind(harness.repository);
  let commitCalls = 0;
  harness.repository.commitW6Transition = (transition) => {
    commitCalls += 1;
    return originalCommit(transition);
  };
  const cycle = (await harness.repository.getW6History(CLUSTER_ID)).observation_cycles[0];
  harness.clock.set(DAY_7_AT);
  const attempts = [];
  harness.ports.audit = {
    async append(record) {
      attempts.push(structuredClone(record));
      if (attempts.length === 1) throw new Error("synthetic first day-7 audit failure");
    },
  };
  const command = day7Command(cycle.cycle_id, {
    event_id: "SYN-EVENT-BATCH-D-DAY-7-AUDIT-REPAIR",
  });
  const aiCalls = harness.aiRunner.calls.length;
  const authorizationCalls = harness.authorizer.calls.length;
  const first = await runW6Improvement(command, harness.ports);
  const idsAfterFirst = harness.ids.current;
  const replay = await runW6Improvement(command, harness.ports);
  const conflict = await runW6Improvement({ ...command, related_task_volume: 10 }, harness.ports);
  const history = await harness.repository.getW6History(CLUSTER_ID);

  assert.equal(first.status, "completed");
  assert.equal(first.output.audit_state, "pending");
  assert.equal(replay.status, "idempotent");
  assert.equal(replay.output.audit_state, "recorded");
  assert.equal(replay.actions.includes("return_existing_W6_observation_batch_d_result"), true);
  assert.equal(replay.actions.includes("do_not_repeat_W6_observation_effects"), true);
  assert.equal(replay.actions.includes("return_existing_W6_batch_c_result"), false);
  assert.equal(replay.actions.includes("do_not_repeat_N5_or_N6"), false);
  assert.equal(conflict.status, "failed");
  assert.equal(conflict.output.error_class, "event_conflict");
  assert.equal(attempts[0].audit_id, attempts[1].audit_id);
  assert.equal(history.observation_checkpoints.length, 1);
  assert.equal(harness.aiRunner.calls.length, aiCalls);
  assert.equal(harness.authorizer.calls.length, authorizationCalls);
  assert.equal(commitCalls, 1);
  assert.equal(harness.ids.current, idsAfterFirst);
});

test("W6 high-level record_day_30 requires Day-7 and preserves full state when it is missing", async () => {
  const harness = await highLevelObservingHarness();
  const cycle = (await harness.repository.getW6History(CLUSTER_ID)).observation_cycles[0];
  harness.clock.set(DAY_30_AT);
  const before = await highLevelDurableState(harness.repository);
  const aiCalls = harness.aiRunner.calls.length;
  const authorizationCalls = harness.authorizer.calls.length;
  const result = await runW6Improvement(day30Command(cycle.cycle_id, {
    event_id: "SYN-EVENT-BATCH-D-DAY-30-MISSING-DAY-7",
  }), harness.ports);

  assert.equal(result.status, "failed");
  assert.equal(result.output.error_class, "invalid_state");
  assert.equal(result.event_id, "SYN-EVENT-BATCH-D-DAY-30-MISSING-DAY-7");
  assert.deepEqual(await highLevelDurableState(harness.repository), before);
  assert.equal(harness.aiRunner.calls.length, aiCalls);
  assert.equal(harness.authorizer.calls.length, authorizationCalls);
});

test("W6 high-level checkpoints reject a non-active cycle id with full durable zero writes", async () => {
  const day7Harness = await highLevelObservingHarness();
  day7Harness.clock.set(DAY_7_AT);
  const day7Before = await highLevelDurableState(day7Harness.repository);
  const day7AiCalls = day7Harness.aiRunner.calls.length;
  const day7AuthorizationCalls = day7Harness.authorizer.calls.length;
  const wrongDay7 = await runW6Improvement(day7Command("SYN-CYCLE-WRONG-DAY-7", {
    event_id: "SYN-EVENT-BATCH-D-DAY-7-WRONG-CYCLE",
  }), day7Harness.ports);
  assert.equal(wrongDay7.status, "failed");
  assert.equal(wrongDay7.output.error_class, "invalid_state");
  assert.deepEqual(await highLevelDurableState(day7Harness.repository), day7Before);
  assert.equal(day7Harness.aiRunner.calls.length, day7AiCalls);
  assert.equal(day7Harness.authorizer.calls.length, day7AuthorizationCalls);

  const day30Harness = await day30ReadyHarness();
  day30Harness.clock.set(DAY_30_AT);
  const day30Before = await highLevelDurableState(day30Harness.repository);
  const day30AiCalls = day30Harness.aiRunner.calls.length;
  const day30AuthorizationCalls = day30Harness.authorizer.calls.length;
  const wrongDay30 = await runW6Improvement(day30Command("SYN-CYCLE-WRONG-DAY-30", {
    event_id: "SYN-EVENT-BATCH-D-DAY-30-WRONG-CYCLE",
  }), day30Harness.ports);
  assert.equal(wrongDay30.status, "failed");
  assert.equal(wrongDay30.output.error_class, "invalid_state");
  assert.deepEqual(await highLevelDurableState(day30Harness.repository), day30Before);
  assert.equal(day30Harness.aiRunner.calls.length, day30AiCalls);
  assert.equal(day30Harness.authorizer.calls.length, day30AuthorizationCalls);
});

test("W6 high-level checkpoint rejects a positive denominator below authoritative recurrence count", async () => {
  const harness = await observingHarness();
  const firstIntake = await runW6Improvement(activeIntakeCommand({
    event_id: "SYN-EVENT-BATCH-D-ACTIVE-INTAKE-DENOMINATOR-C",
  }), harness.ports);
  assert.equal(firstIntake.status, "completed", JSON.stringify(firstIntake));
  await seedClosedCase(harness.repository, harness.w5Channel.issuer, CASE_D, 4, {
    closed_at: "2026-08-07T00:00:00.000Z",
    updated_at: "2026-08-07T00:00:00.000Z",
  });
  harness.clock.set("2026-08-08T00:00:00.000Z");
  const secondIntake = await runW6Improvement(activeIntakeCommand({
    event_id: "SYN-EVENT-BATCH-D-ACTIVE-INTAKE-DENOMINATOR-D",
    case_ids: [CASE_A, CASE_B, CASE_C, CASE_D],
    triggering_case_ids: [CASE_D],
  }), harness.ports);
  assert.equal(secondIntake.status, "completed", JSON.stringify(secondIntake));
  const cycle = (await harness.repository.getW6History(CLUSTER_ID)).observation_cycles[0];
  harness.clock.set(DAY_7_AT);
  const before = await highLevelDurableState(harness.repository);
  const aiCalls = harness.aiRunner.calls.length;
  const authorizationCalls = harness.authorizer.calls.length;
  const result = await runW6Improvement(day7Command(cycle.cycle_id, {
    event_id: "SYN-EVENT-BATCH-D-DAY-7-UNDERSIZED-DENOMINATOR",
    case_ids: [CASE_A, CASE_B, CASE_C, CASE_D],
    related_task_volume: 1,
  }), harness.ports);
  assert.equal(result.status, "failed");
  assert.equal(result.output.error_class, "invalid_state");
  assert.deepEqual(await highLevelDurableState(harness.repository), before);
  assert.equal(harness.aiRunner.calls.length, aiCalls);
  assert.equal(harness.authorizer.calls.length, authorizationCalls);
});

test("W6 high-level record_day_30 rejects exact-window minus one, plus one, and clock mismatch", async () => {
  const cases = [
    ["early", "2026-09-02T23:59:59.999Z", "test"],
    ["late", "2026-09-03T00:00:00.001Z", "test"],
    ["clock_mismatch", DAY_30_AT, "synthetic_history"],
  ];
  for (const [label, now, source] of cases) {
    const harness = await day30ReadyHarness();
    harness.clock.set(now);
    harness.clock.source = source;
    const before = await highLevelDurableState(harness.repository);
    const aiCalls = harness.aiRunner.calls.length;
    const authorizationCalls = harness.authorizer.calls.length;
    const result = await runW6Improvement(day30Command(harness.cycle.cycle_id, {
      event_id: `SYN-EVENT-BATCH-D-DAY-30-${label}`,
    }), harness.ports);
    assert.equal(result.status, "failed", `${label}: ${JSON.stringify(result)}`);
    assert.equal(result.output.error_class, "invalid_state", label);
    assert.deepEqual(await highLevelDurableState(harness.repository), before, label);
    assert.equal(harness.aiRunner.calls.length, aiCalls, label);
    assert.equal(harness.authorizer.calls.length, authorizationCalls, label);
  }
});

test("W6 high-level record_day_30 rechecks its trusted clock after waiting for the resource lock", async () => {
  const harness = await day30ReadyHarness();
  harness.clock.set(DAY_30_AT);
  const resources = {
    case_ids: [CASE_A, CASE_B],
    cluster_id: CLUSTER_ID,
    improvement_id: IMPROVEMENT_ID,
  };
  const originalExclusive = harness.repository.runW6ResourcesExclusive.bind(harness.repository);
  let releaseHold;
  let markHeld;
  let markSecondInvocation;
  const held = new Promise((resolve) => { markHeld = resolve; });
  const holdRelease = new Promise((resolve) => { releaseHold = resolve; });
  const secondInvocation = new Promise((resolve) => { markSecondInvocation = resolve; });
  let invocation = 0;
  harness.repository.runW6ResourcesExclusive = (resourceSet, operation) => {
    invocation += 1;
    if (invocation === 2) markSecondInvocation();
    return originalExclusive(resourceSet, operation);
  };
  const blocker = harness.repository.runW6ResourcesExclusive(resources, async () => {
    markHeld();
    await holdRelease;
  });
  await held;
  const before = await highLevelDurableState(harness.repository);
  const aiCalls = harness.aiRunner.calls.length;
  const authorizationCalls = harness.authorizer.calls.length;
  const pending = runW6Improvement(day30Command(harness.cycle.cycle_id, {
    event_id: "SYN-EVENT-BATCH-D-DAY-30-LOCK-WAIT-CLOCK-RACE",
  }), harness.ports);
  await secondInvocation;
  harness.clock.set("2026-09-03T00:00:00.001Z");
  releaseHold();
  await blocker;
  const result = await pending;

  assert.equal(result.status, "failed");
  assert.equal(result.output.error_class, "invalid_state");
  assert.deepEqual(await highLevelDurableState(harness.repository), before);
  assert.equal(harness.aiRunner.calls.length, aiCalls);
  assert.equal(harness.authorizer.calls.length, authorizationCalls);
});

test("W6 high-level Day-7 and Day-30 derive cumulative recurrence sources from committed active intake", async () => {
  const harness = await observingHarness();
  const intake = await runW6Improvement(activeIntakeCommand({
    event_id: "SYN-EVENT-BATCH-D-ACTIVE-INTAKE-FOR-CHECKPOINTS",
  }), harness.ports);
  assert.equal(intake.status, "completed", JSON.stringify(intake));
  const cycle = (await harness.repository.getW6History(CLUSTER_ID)).observation_cycles[0];
  harness.clock.set(DAY_7_AT);
  const day7AiCalls = harness.aiRunner.calls.length;
  const day7AuthorizationCalls = harness.authorizer.calls.length;
  const day7 = await runW6Improvement(day7Command(cycle.cycle_id, {
    event_id: "SYN-EVENT-BATCH-D-DAY-7-CUMULATIVE",
    case_ids: [CASE_A, CASE_B, CASE_C],
    related_task_volume: 2,
  }), harness.ports);
  assert.equal(harness.aiRunner.calls.length, day7AiCalls);
  assert.equal(harness.authorizer.calls.length, day7AuthorizationCalls);

  await seedClosedCase(harness.repository, harness.w5Channel.issuer, CASE_D, 4, {
    closed_at: "2026-08-12T00:00:00.000Z",
    updated_at: "2026-08-12T00:00:00.000Z",
  });
  harness.clock.set("2026-08-13T00:00:00.000Z");
  const laterIntake = await runW6Improvement(activeIntakeCommand({
    event_id: "SYN-EVENT-BATCH-D-ACTIVE-INTAKE-AFTER-DAY-7",
    case_ids: [CASE_A, CASE_B, CASE_C, CASE_D],
    triggering_case_ids: [CASE_D],
  }), harness.ports);
  assert.equal(laterIntake.status, "completed", JSON.stringify(laterIntake));

  harness.clock.set(DAY_30_AT);
  const day30AiCalls = harness.aiRunner.calls.length;
  const day30AuthorizationCalls = harness.authorizer.calls.length;
  const day30 = await runW6Improvement(day30Command(cycle.cycle_id, {
    event_id: "SYN-EVENT-BATCH-D-DAY-30-CUMULATIVE",
    case_ids: [CASE_A, CASE_B, CASE_C, CASE_D],
    related_task_volume: null,
  }), harness.ports);
  const history = await harness.repository.getW6History(CLUSTER_ID);

  assert.equal(day7.status, "completed", JSON.stringify(day7));
  assert.deepEqual(day7.output.observation_checkpoint.recurrence_case_ids, [CASE_C]);
  assert.equal(day7.output.observation_checkpoint.recurrence_rate, 0.5);
  assert.equal(day30.status, "completed", JSON.stringify(day30));
  assert.deepEqual(day30.output.observation_checkpoint.recurrence_case_ids, [CASE_C, CASE_D]);
  assert.equal(day30.output.observation_checkpoint.recurrence_rate, null);
  assert.deepEqual(history.observation_checkpoints.map((entry) => entry.horizon_days), [7, 30]);
  assert.equal(harness.aiRunner.calls.length, day30AiCalls);
  assert.equal(harness.authorizer.calls.length, day30AuthorizationCalls);
});

test("W6 high-level checkpoints derive recurrence sources from committed recurrence-reopen history", async () => {
  const harness = await day30ReadyHarness();
  harness.clock.set(DAY_30_AT);
  const firstDay30 = await runW6Improvement(day30Command(harness.cycle.cycle_id, {
    event_id: "SYN-EVENT-BATCH-D-DAY-30-BEFORE-ARCHIVE-SEED",
  }), harness.ports);
  assert.equal(firstDay30.status, "completed", JSON.stringify(firstDay30));

  harness.clock.set("2026-09-04T00:00:00.000Z");
  let cluster = await harness.repository.findW6ClusterById(CLUSTER_ID);
  let improvement = await harness.repository.findW6ImprovementById(IMPROVEMENT_ID);
  await directAuthorizedW6Transition(
    harness.repository,
    harness.w6Channel.issuer,
    "SYN-EVENT-BATCH-D-ARCHIVE-SEED-FOR-REOPEN",
    snapshotW6AtomicTransition({
      action: "archive_observation",
      case_ids: [CASE_A, CASE_B],
      cluster_id: CLUSTER_ID,
      improvement_id: IMPROVEMENT_ID,
      expected_cluster_fingerprint: createWorkflowEventFingerprint(cluster),
      expected_improvement_fingerprint: createWorkflowEventFingerprint(improvement),
      history_id: "SYN-HISTORY-BATCH-D-ARCHIVE-SEED-FOR-REOPEN",
      receipt_id: "SYN-RECEIPT-BATCH-D-ARCHIVE-SEED-FOR-REOPEN",
      occurred_at: "2026-09-04T00:00:00.000Z",
      cycle_id: harness.cycle.cycle_id,
      human_conclusion: "合成 Day-7 与 Day-30 检查点已完成，由人工确认归档。",
      reason: "仅用于构造已提交 recurrence-reopen 历史的仓储层合成种子。",
    }),
  );
  await seedClosedCase(harness.repository, harness.w5Channel.issuer, CASE_C, 3, {
    closed_at: "2026-09-05T00:00:00.000Z",
    updated_at: "2026-09-05T00:00:00.000Z",
  });
  harness.clock.set("2026-09-06T00:00:00.000Z");
  cluster = await harness.repository.findW6ClusterById(CLUSTER_ID);
  improvement = await harness.repository.findW6ImprovementById(IMPROVEMENT_ID);
  const reopened = await directAuthorizedW6Transition(
    harness.repository,
    harness.w6Channel.issuer,
    "SYN-EVENT-BATCH-D-REOPEN-SEED-FOR-CHECKPOINTS",
    snapshotW6AtomicTransition({
      action: "reopen_recurrence",
      case_ids: [CASE_A, CASE_B, CASE_C],
      cluster_id: CLUSTER_ID,
      improvement_id: IMPROVEMENT_ID,
      expected_cluster_fingerprint: createWorkflowEventFingerprint(cluster),
      expected_improvement_fingerprint: createWorkflowEventFingerprint(improvement),
      history_id: "SYN-HISTORY-BATCH-D-REOPEN-SEED-FOR-CHECKPOINTS",
      receipt_id: "SYN-RECEIPT-BATCH-D-REOPEN-SEED-FOR-CHECKPOINTS",
      occurred_at: "2026-09-06T00:00:00.000Z",
      cycle_id: "SYN-CYCLE-BATCH-D-REOPEN-SEED",
      triggering_case_ids: [CASE_C],
      clock_source: "test",
      reason: "已归档周期后的合成独立复发案经人工授权重开。",
    }),
  );
  assert.equal(reopened.observation_cycle.trigger, "recurrence_reopen");
  const aiCalls = harness.aiRunner.calls.length;
  const authorizationCalls = harness.authorizer.calls.length;

  harness.clock.set("2026-09-13T00:00:00.000Z");
  const day7 = await runW6Improvement(day7Command(reopened.observation_cycle.cycle_id, {
    event_id: "SYN-EVENT-BATCH-D-REOPEN-DAY-7",
    case_ids: [CASE_A, CASE_B, CASE_C],
  }), harness.ports);
  harness.clock.set("2026-10-06T00:00:00.000Z");
  const day30 = await runW6Improvement(day30Command(reopened.observation_cycle.cycle_id, {
    event_id: "SYN-EVENT-BATCH-D-REOPEN-DAY-30",
    case_ids: [CASE_A, CASE_B, CASE_C],
  }), harness.ports);

  assert.equal(day7.status, "completed", JSON.stringify(day7));
  assert.deepEqual(day7.output.observation_checkpoint.recurrence_case_ids, [CASE_C]);
  assert.equal(day30.status, "completed", JSON.stringify(day30));
  assert.deepEqual(day30.output.observation_checkpoint.recurrence_case_ids, [CASE_C]);
  assert.equal(harness.aiRunner.calls.length, aiCalls);
  assert.equal(harness.authorizer.calls.length, authorizationCalls);
});

test("W6 observation commands reject exact-shape attacks and caller-injected trusted fields before every port", async () => {
  const enter = enterObservationCommand();
  const day7 = day7Command("SYN-CYCLE-SHAPE-TEST");
  const day30 = day30Command("SYN-CYCLE-SHAPE-TEST");
  for (const command of [enter, day7, day30]) {
    assert.equal(
      fingerprintW6ImprovementCommand(command),
      createWorkflowEventFingerprint({ workflow: "W6", batch: "observation_batch_d", command }),
    );
  }
  const tracker = { getter_reads: 0, proxy_traps: 0, port_reads: 0 };
  const getter = { ...enter };
  Object.defineProperty(getter, "reason", {
    enumerable: true,
    get() {
      tracker.getter_reads += 1;
      return enter.reason;
    },
  });
  const hidden = { ...day7 };
  Object.defineProperty(hidden, "checkpoint_id", {
    value: "caller-must-not-inject",
    enumerable: false,
  });
  const proxy = new Proxy({ ...day30 }, {
    getPrototypeOf() {
      tracker.proxy_traps += 1;
      throw new Error("proxy rejected");
    },
  });
  const unsafe = [
    getter,
    { ...enter, cycle_id: "caller-must-not-inject" },
    { ...enter, history_id: "caller-must-not-inject" },
    { ...enter, receipt_id: "caller-must-not-inject" },
    { ...enter, occurred_at: OBSERVATION_OPENED_AT },
    { ...enter, clock_source: "test" },
    { ...enter, grant: {} },
    { ...enter, principal: PRINCIPAL },
    { ...enter, policy_version: POLICY_VERSION },
    { ...day7, actor: ACTOR },
    { ...day7, recurrence_case_ids: [] },
    { ...day7, history_id: "caller-must-not-inject" },
    { ...day7, receipt_id: "caller-must-not-inject" },
    { ...day7, clock_source: "test" },
    { ...day30, occurred_at: DAY_30_AT },
    { ...day30, related_task_volume: 0 },
    { ...day30, related_task_volume: -1 },
    { ...day30, related_task_volume: 1.5 },
    { ...day30, related_task_volume: Number.MAX_SAFE_INTEGER + 1 },
    { ...day7, [Symbol("unsafe")]: true },
    hidden,
    proxy,
  ];
  const ports = new Proxy({}, {
    get() {
      tracker.port_reads += 1;
      throw new Error("ports must not be read");
    },
  });
  for (const command of unsafe) {
    const result = await runW6Improvement(command, ports);
    assert.equal(result.status, "failed");
    assert.equal(result.output.error_class, "invalid_command");
  }
  assert.equal(tracker.getter_reads, 0);
  assert.equal(tracker.proxy_traps, 1);
  assert.equal(tracker.port_reads, 0);
});

test("W6 active-observation recurrence intake uses exact existing-cluster N5 evidence then one recurrence authorization", async () => {
  const harness = await observingHarness();
  const command = activeIntakeCommand();
  const beforeCases = await Promise.all(command.case_ids.map((caseId) => harness.repository.findCaseById(caseId)));
  const beforeFeedback = structuredClone([...harness.repository.rawFeedbackById.entries()]);
  const beforeImprovement = await harness.repository.findW6ImprovementById(IMPROVEMENT_ID);
  const beforeCycles = (await harness.repository.getW6History(CLUSTER_ID)).observation_cycles;
  const priorN5Calls = harness.aiRunner.calls.filter((entry) => entry.node === "N5").length;
  const priorAuthorizationCalls = harness.authorizer.calls.length;

  const result = await runW6Improvement(command, harness.ports);
  const cluster = await harness.repository.findW6ClusterById(CLUSTER_ID);
  const improvement = await harness.repository.findW6ImprovementById(IMPROVEMENT_ID);
  const history = await harness.repository.getW6History(CLUSTER_ID);
  const request = harness.aiRunner.calls.at(-1);

  assert.equal(result.status, "completed");
  assert.equal(result.previous_state, "观察中");
  assert.equal(result.next_state, "观察中");
  assert.deepEqual(cluster.member_case_ids, command.case_ids);
  assert.equal(cluster.recurrence_count, 1);
  assert.equal(history.active_recurrence_intakes.length, 1);
  assert.deepEqual(history.active_recurrence_intakes[0].triggering_case_ids, [CASE_C]);
  assert.equal(request.node, "N5");
  assert.deepEqual(request.object_ref, { object_type: "case", object_id: CASE_C });
  assert.equal(request.input.case_facts.current.cluster_id, null);
  assert.deepEqual(
    request.input.case_facts.candidates.map((entry) => [entry.case_id, entry.cluster_id]),
    [[CASE_A, CLUSTER_ID], [CASE_B, CLUSTER_ID]],
  );
  assert.equal(harness.aiRunner.calls.filter((entry) => entry.node === "N5").length, priorN5Calls + 1);
  assert.equal(harness.authorizer.calls.length, priorAuthorizationCalls + 1);
  assert.equal(harness.authorizer.calls.at(-1).action, "intake_active_observation_recurrence");
  assert.equal(harness.authorizer.calls.at(-1).phase, "recurrence");
  assert.deepEqual(await Promise.all(command.case_ids.map((caseId) => harness.repository.findCaseById(caseId))), beforeCases);
  assert.deepEqual([...harness.repository.rawFeedbackById.entries()], beforeFeedback);
  assert.deepEqual(improvement, beforeImprovement);
  assert.deepEqual(history.observation_cycles, beforeCycles);
  assert.equal(result.output.external_effects.automatic_case_merge, false);
  assert.equal(result.output.external_effects.automatic_feedback_relink, false);
});

test("W6 active recurrence intake rejects missing or wrong-cluster N5 results before authorization", async () => {
  const missing = await observingHarness();
  missing.aiRunner.failN5 = true;
  const missingBefore = await missing.repository.getW6History(CLUSTER_ID);
  const missingAuthorizations = missing.authorizer.calls.length;
  const missingResult = await runW6Improvement(activeIntakeCommand({
    event_id: "SYN-EVENT-BATCH-D-ACTIVE-INTAKE-N5-MISSING",
  }), missing.ports);
  assert.equal(missingResult.status, "failed");
  assert.equal(missingResult.output.error_class, "n5_failure");
  assert.equal(missing.authorizer.calls.length, missingAuthorizations);
  assert.deepEqual(await missing.repository.getW6History(CLUSTER_ID), missingBefore);

  const wrong = await observingHarness();
  wrong.aiRunner.wrongExistingCluster = true;
  const wrongBefore = await wrong.repository.getW6History(CLUSTER_ID);
  const wrongAuthorizations = wrong.authorizer.calls.length;
  const wrongResult = await runW6Improvement(activeIntakeCommand({
    event_id: "SYN-EVENT-BATCH-D-ACTIVE-INTAKE-N5-WRONG-CLUSTER",
  }), wrong.ports);
  assert.equal(wrongResult.status, "failed");
  assert.equal(wrongResult.output.error_class, "n5_failure");
  assert.equal(wrong.authorizer.calls.length, wrongAuthorizations);
  assert.deepEqual(await wrong.repository.getW6History(CLUSTER_ID), wrongBefore);
});

test("W6 active recurrence intake denial preserves observation state after N5 validation", async () => {
  const harness = await observingHarness();
  harness.ports.action_authorizer = createAuthorizer(harness.w6Channel.issuer, {
    denyAction: "intake_active_observation_recurrence",
  });
  const before = await harness.repository.getW6History(CLUSTER_ID);
  const result = await runW6Improvement(activeIntakeCommand({
    event_id: "SYN-EVENT-BATCH-D-ACTIVE-INTAKE-DENIED",
  }), harness.ports);
  assert.equal(result.status, "failed");
  assert.equal(result.output.error_class, "authorization_failure");
  assert.deepEqual(await harness.repository.getW6History(CLUSTER_ID), before);
  assert.equal((await harness.repository.findW6ClusterById(CLUSTER_ID)).member_case_ids.length, 2);
});

test("W6 active recurrence intake rechecks the trusted clock inside the resource lock after authorization wait", async () => {
  const harness = await observingHarness();
  harness.ports.action_authorizer = createAuthorizer(harness.w6Channel.issuer, {
    onAuthorize() {
      harness.clock.set("2026-09-04T00:00:00.000Z");
    },
  });
  const before = await harness.repository.getW6History(CLUSTER_ID);
  const result = await runW6Improvement(activeIntakeCommand({
    event_id: "SYN-EVENT-BATCH-D-ACTIVE-INTAKE-CLOCK-RACE",
  }), harness.ports);
  assert.equal(result.status, "failed");
  assert.equal(result.output.error_class, "authorization_capability_invalid");
  assert.deepEqual(await harness.repository.getW6History(CLUSTER_ID), before);
  assert.equal((await harness.repository.findW6ClusterById(CLUSTER_ID)).member_case_ids.length, 2);
});

test("W6 active recurrence replay repairs only audit and repeats no N5, authorization, or business write", async () => {
  const harness = await observingHarness();
  const attempts = [];
  harness.ports.audit = {
    async append(record) {
      attempts.push(structuredClone(record));
      if (attempts.length === 1) throw new Error("synthetic first active-intake audit failure");
    },
  };
  const command = activeIntakeCommand({ event_id: "SYN-EVENT-BATCH-D-ACTIVE-INTAKE-AUDIT-REPAIR" });
  const n5Before = harness.aiRunner.calls.filter((entry) => entry.node === "N5").length;
  const authBefore = harness.authorizer.calls.length;
  const first = await runW6Improvement(command, harness.ports);
  const replay = await runW6Improvement(command, harness.ports);
  const history = await harness.repository.getW6History(CLUSTER_ID);
  assert.equal(first.status, "completed");
  assert.equal(first.output.audit_state, "pending");
  assert.equal(replay.status, "idempotent");
  assert.equal(replay.output.audit_state, "recorded");
  assert.equal(attempts.length, 2);
  assert.equal(attempts[0].audit_id, attempts[1].audit_id);
  assert.equal(harness.aiRunner.calls.filter((entry) => entry.node === "N5").length, n5Before + 1);
  assert.equal(harness.authorizer.calls.length, authBefore + 1);
  assert.equal(history.active_recurrence_intakes.length, 1);
  assert.equal(history.entries.filter((entry) => entry.action === "intake_active_observation_recurrence").length, 1);
});

test("W6 active recurrence command rejects getter, Proxy, symbol, and non-enumerable descriptors before any port", async () => {
  const command = activeIntakeCommand();
  assert.equal(
    fingerprintW6ImprovementCommand(command),
    createWorkflowEventFingerprint({ workflow: "W6", batch: "observation_batch_d", command }),
  );
  const oldCommand = createCommand();
  assert.equal(
    fingerprintW6ImprovementCommand(oldCommand),
    createWorkflowEventFingerprint({ workflow: "W6", batch: "improvement_batch_c", command: oldCommand }),
  );
  const tracker = { getter_reads: 0, proxy_traps: 0, port_reads: 0 };
  const getterCommand = { ...command };
  Object.defineProperty(getterCommand, "reason", {
    enumerable: true,
    get() {
      tracker.getter_reads += 1;
      return command.reason;
    },
  });
  const symbolCommand = { ...command, [Symbol("unsafe")]: "must reject" };
  const hiddenCommand = { ...command };
  Object.defineProperty(hiddenCommand, "hidden", { value: "must reject", enumerable: false });
  const proxyCommand = new Proxy({ ...command }, {
    getPrototypeOf() {
      tracker.proxy_traps += 1;
      throw new Error("proxy inspection rejected");
    },
  });
  const ports = new Proxy({}, {
    get() {
      tracker.port_reads += 1;
      throw new Error("ports must not be read");
    },
  });
  for (const unsafe of [getterCommand, proxyCommand, symbolCommand, hiddenCommand]) {
    const result = await runW6Improvement(unsafe, ports);
    assert.equal(result.status, "failed");
    assert.equal(result.output.error_class, "invalid_command");
  }
  assert.equal(tracker.getter_reads, 0);
  assert.equal(tracker.proxy_traps, 1);
  assert.equal(tracker.port_reads, 0);
});

test("W6 N6 second failure leaves the reviewed cluster unchanged and creates no improvement", async () => {
  const harness = await reviewedHarness();
  harness.aiRunner.failN6 = true;
  const before = await harness.repository.getW6History(CLUSTER_ID);
  const result = await runW6Improvement(startCommand({ event_id: "SYN-EVENT-BATCH-C-N6-FAIL" }), harness.ports);
  assert.equal(result.status, "failed");
  assert.equal(result.output.error_class, "n6_failure");
  assert.equal((await harness.repository.findW6ClusterById(CLUSTER_ID)).status, "待审核");
  assert.equal(await harness.repository.findW6ImprovementById(IMPROVEMENT_ID), null);
  assert.deepEqual(await harness.repository.getW6History(CLUSTER_ID), before);
  assert.equal(harness.authorizer.calls.length, 1);
});

test("W6 rejects a malicious command descriptor before reading it or touching any port", async () => {
  const tracker = { getter_reads: 0, port_reads: 0 };
  const raw = {};
  Object.defineProperty(raw, "action", {
    enumerable: true,
    get() {
      tracker.getter_reads += 1;
      return "create_cluster_candidate";
    },
  });
  const ports = new Proxy({}, {
    get() {
      tracker.port_reads += 1;
      throw new Error("ports must not be read");
    },
  });
  const result = await runW6Improvement(raw, ports);
  assert.equal(result.status, "failed");
  assert.equal(result.output.error_class, "invalid_command");
  assert.deepEqual(tracker, { getter_reads: 0, port_reads: 0 });
});

test("W6 rejects a malicious provider catalog without reading its getter or authorizing", async () => {
  const harness = await reviewedHarness();
  const tracker = { reads: 0 };
  const row = structuredClone(CATALOG[0]);
  Object.defineProperty(row, "factor_label", {
    enumerable: true,
    get() {
      tracker.reads += 1;
      return "部件批次差异";
    },
  });
  harness.ports.hypothesis_catalog_provider = {
    async getCatalog() {
      return [row];
    },
  };
  const result = await runW6Improvement(startCommand({ event_id: "SYN-EVENT-BATCH-C-BAD-CATALOG" }), harness.ports);
  assert.equal(result.status, "failed");
  assert.equal(result.output.error_class, "hypothesis_catalog_failure");
  assert.equal(tracker.reads, 0);
  assert.equal(harness.authorizer.calls.length, 1);
  assert.equal(await harness.repository.findW6ImprovementById(IMPROVEMENT_ID), null);
});

test("W6 awaits the N6 catalog provider without holding case, cluster, or improvement resource locks", {
  timeout: 5_000,
}, async (t) => {
  const harness = await reviewedHarness();
  const originalRunW6ResourcesExclusive = harness.repository.runW6ResourcesExclusive.bind(
    harness.repository,
  );
  let activeResourceSections = 0;
  harness.repository.runW6ResourcesExclusive = (resourceSet, operation) =>
    originalRunW6ResourcesExclusive(resourceSet, async () => {
      activeResourceSections += 1;
      try {
        return await operation();
      } finally {
        activeResourceSections -= 1;
      }
    });
  let markProviderEntered;
  let releaseProvider;
  let releaseProbe;
  let providerObservedUnlocked = null;
  const providerEntered = new Promise((resolve) => {
    markProviderEntered = resolve;
  });
  const providerRelease = new Promise((resolve) => {
    releaseProvider = resolve;
  });
  t.after(() => {
    releaseProbe?.();
    releaseProvider?.();
  });
  harness.ports.hypothesis_catalog_provider = {
    async getCatalog() {
      providerObservedUnlocked = activeResourceSections === 0;
      markProviderEntered();
      if (providerObservedUnlocked) {
        await providerRelease;
      }
      return structuredClone(CATALOG);
    },
  };
  const command = startCommand({ event_id: "SYN-EVENT-BATCH-C-PROVIDER-AWAIT-NO-LOCK" });
  const pending = runW6Improvement(command, harness.ports);
  await providerEntered;

  let markProbeAcquired;
  const probeAcquired = new Promise((resolve) => {
    markProbeAcquired = resolve;
  });
  const probeRelease = new Promise((resolve) => {
    releaseProbe = resolve;
  });
  const lockProbe = harness.repository.runW6ResourcesExclusive(
    {
      case_ids: [...command.case_ids],
      cluster_id: command.cluster_id,
      improvement_id: command.improvement_id,
    },
    async () => {
      markProbeAcquired();
      await probeRelease;
    },
  );
  await probeAcquired;
  releaseProbe();
  await lockProbe;
  releaseProvider();
  const result = await pending;

  assert.equal(providerObservedUnlocked, true);
  assert.equal(activeResourceSections, 0);
  assert.equal(result.status, "completed", JSON.stringify(result));
});

test("W6 same-event replay repeats neither AI, authorization, nor domain writes", async () => {
  const harness = await makeHarness();
  const command = createCommand({ event_id: "SYN-EVENT-BATCH-C-REPLAY" });
  const first = await runW6Improvement(command, harness.ports);
  const replay = await runW6Improvement(command, harness.ports);
  assert.equal(first.status, "needs_human");
  assert.equal(replay.status, "idempotent");
  assert.equal(harness.aiRunner.calls.length, 1);
  assert.equal(harness.authorizer.calls.length, 0);
  assert.equal((await harness.repository.listW6Clusters()).length, 1);
  assert.equal((await harness.repository.getW6History(CLUSTER_ID)).entries.length, 1);
});

test("W6 same event with a different payload conflicts without another AI call or write", async () => {
  const harness = await makeHarness();
  const first = createCommand({ event_id: "SYN-EVENT-BATCH-C-CONFLICT" });
  await runW6Improvement(first, harness.ports);
  const conflict = await runW6Improvement({ ...first, name: "不同的合成候选簇名称" }, harness.ports);
  assert.equal(conflict.status, "failed");
  assert.equal(conflict.output.error_class, "event_conflict");
  assert.equal(harness.aiRunner.calls.length, 1);
  assert.equal((await harness.repository.listW6Clusters()).length, 1);
});

test("W6 authorization wait revalidates CAS and cannot overwrite a winning review", async () => {
  const harness = await makeHarness();
  await createCandidate(harness);
  const original = reviewCommand({ event_id: "SYN-EVENT-BATCH-C-STALE-REVIEW" });
  harness.ports.action_authorizer = createAuthorizer(harness.w6Channel.issuer, {
    onAuthorize: () => directAuthorizedReview(
      harness.repository,
      harness.w6Channel.issuer,
      "SYN-EVENT-BATCH-C-WINNER-REVIEW",
      original,
    ),
  });
  const stale = await runW6Improvement(original, harness.ports);
  assert.equal(stale.status, "failed");
  assert.equal(stale.output.error_class, "concurrency_conflict");
  assert.equal((await harness.repository.findW6ClusterById(CLUSTER_ID)).status, "待审核");
  assert.equal((await harness.repository.getW6History(CLUSTER_ID)).entries.filter((entry) => entry.action === "review_candidate").length, 1);
});

test("W6 cannot build a cluster from a forged W5 closed context", async () => {
  const harness = await makeHarness();
  const repository = new Proxy(harness.repository, {
    get(target, property) {
      if (property === "getW6ClosedCaseContext") {
        return async (caseId) => {
          const context = await target.getW6ClosedCaseContext(caseId);
          if (caseId === CASE_B) context.case_record.summary = "伪造的合成关闭摘要。";
          return context;
        };
      }
      const value = Reflect.get(target, property, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  const result = await runW6Improvement(createCommand({ event_id: "SYN-EVENT-BATCH-C-FORGED-W5" }), {
    ...harness.ports,
    repository,
  });
  assert.equal(result.status, "failed");
  assert.equal(result.output.error_class, "repository_failure");
  assert.equal(await harness.repository.findW6ClusterById(CLUSTER_ID), null);
});

test("W6 wrong-channel and reused opaque grants fail closed without target writes", async () => {
  const wrongChannel = createW6AuthorizationGrantChannel();
  const wrong = await makeHarness({ grantIssuer: wrongChannel.issuer });
  await createCandidate(wrong);
  const wrongResult = await runW6Improvement(reviewCommand({ event_id: "SYN-EVENT-BATCH-C-WRONG-GRANT" }), wrong.ports);
  assert.equal(wrongResult.status, "failed");
  assert.equal((await wrong.repository.findW6ClusterById(CLUSTER_ID)).status, "候选");

  const reused = await makeHarness({
    caseIds: [CASE_A, CASE_B, CASE_C, CASE_D],
    authorizerOptions: { reuseGrant: true },
  });
  const firstCreate = createCommand();
  const secondCreate = createCommand({
    event_id: "SYN-EVENT-BATCH-C-CREATE-SECOND",
    case_ids: [CASE_C, CASE_D],
    cluster_id: "SYN-CLUSTER-BATCH-C-002",
    name: "第二个合成候选簇",
  });
  await createCandidate(reused, firstCreate);
  const firstReview = await runW6Improvement(reviewCommand(), reused.ports);
  assert.equal(firstReview.status, "completed");
  await createCandidate(reused, secondCreate);
  const secondReview = await runW6Improvement(reviewCommand({
    event_id: "SYN-EVENT-BATCH-C-REVIEW-SECOND",
    case_ids: [CASE_C, CASE_D],
    cluster_id: "SYN-CLUSTER-BATCH-C-002",
  }), reused.ports);
  assert.equal(secondReview.status, "failed");
  assert.equal((await reused.repository.findW6ClusterById("SYN-CLUSTER-BATCH-C-002")).status, "候选");
});

test("W6 authorization denial records no review transition", async () => {
  const harness = await makeHarness({ authorizerOptions: { denied: true } });
  await createCandidate(harness);
  const before = await harness.repository.getW6History(CLUSTER_ID);
  const denied = await runW6Improvement(reviewCommand({ event_id: "SYN-EVENT-BATCH-C-DENIED" }), harness.ports);
  assert.equal(denied.status, "failed");
  assert.equal(denied.output.error_class, "authorization_failure");
  assert.equal((await harness.repository.findW6ClusterById(CLUSTER_ID)).status, "候选");
  assert.deepEqual(await harness.repository.getW6History(CLUSTER_ID), before);
});

test("W6 replay repairs only a failed workflow audit after a committed candidate", async () => {
  const harness = await makeHarness();
  const attempts = [];
  harness.ports.audit = {
    async append(record) {
      attempts.push(structuredClone(record));
      if (attempts.length === 1) throw new Error("synthetic first audit failure");
    },
  };
  const command = createCommand({ event_id: "SYN-EVENT-BATCH-C-AUDIT-REPAIR" });
  const first = await runW6Improvement(command, harness.ports);
  const replay = await runW6Improvement(command, harness.ports);
  assert.equal(first.status, "needs_human");
  assert.equal(first.output.audit_state, "pending");
  assert.equal(replay.status, "idempotent");
  assert.equal(replay.output.audit_state, "recorded");
  assert.equal(attempts.length, 2);
  assert.equal(attempts[0].audit_id, attempts[1].audit_id);
  assert.equal(harness.aiRunner.calls.length, 1);
  assert.equal(harness.authorizer.calls.length, 0);
  assert.equal((await harness.repository.listW6Clusters()).length, 1);
  assert.equal((await harness.repository.getW6History(CLUSTER_ID)).entries.length, 1);
});

test("W6 inspects a malicious authorization Proxy once without reading accessors or writing review state", async () => {
  const harness = await makeHarness();
  await createCandidate(harness);
  const before = await harness.repository.getW6History(CLUSTER_ID);
  const tracker = { own_keys: 0, descriptors: 0, raw_gets: 0, then_gets: 0, allowed_getter_reads: 0 };
  harness.ports.action_authorizer = {
    async authorize() {
      const target = {
        principal: PRINCIPAL,
        policy_version: POLICY_VERSION,
        grant: Object.freeze(Object.create(null)),
      };
      Object.defineProperty(target, "allowed", {
        enumerable: true,
        get() {
          tracker.allowed_getter_reads += 1;
          return true;
        },
      });
      return new Proxy(target, {
        ownKeys(inner) {
          tracker.own_keys += 1;
          return Reflect.ownKeys(inner);
        },
        getOwnPropertyDescriptor(inner, property) {
          tracker.descriptors += 1;
          return Reflect.getOwnPropertyDescriptor(inner, property);
        },
        get(_inner, property) {
          if (property === "then") {
            tracker.then_gets += 1;
            return undefined;
          }
          tracker.raw_gets += 1;
          throw new Error("raw authorization properties must not be read");
        },
      });
    },
  };
  const result = await runW6Improvement(reviewCommand({
    event_id: "SYN-EVENT-BATCH-C-MALICIOUS-AUTH",
  }), harness.ports);
  assert.equal(result.status, "failed");
  assert.equal(result.output.error_class, "authorization_port_failure");
  assert.equal(tracker.allowed_getter_reads, 0);
  assert.equal(tracker.raw_gets, 0);
  assert.equal(tracker.then_gets, 1);
  assert.equal(tracker.own_keys, 1);
  assert.equal(tracker.descriptors, 4);
  assert.equal((await harness.repository.findW6ClusterById(CLUSTER_ID)).status, "候选");
  assert.deepEqual(await harness.repository.getW6History(CLUSTER_ID), before);
});

test("W6 Batch E fingerprints archive and recurrence reopen in an independent event semantic", () => {
  const archive = archiveCommand("SYN-CYCLE-BATCH-E-FINGERPRINT");
  const reopen = reopenCommand();
  assert.deepEqual(Object.keys(archive).sort(), [
    "action",
    "actor",
    "case_ids",
    "cluster_id",
    "cycle_id",
    "event_id",
    "human_conclusion",
    "improvement_id",
    "reason",
  ]);
  assert.deepEqual(Object.keys(reopen).sort(), [
    "action",
    "actor",
    "case_ids",
    "cluster_id",
    "event_id",
    "improvement_id",
    "reason",
    "triggering_case_ids",
  ]);
  assert.equal(
    fingerprintW6ImprovementCommand(archive),
    createWorkflowEventFingerprint({ workflow: "W6", batch: "observation_batch_e", command: archive }),
  );
  assert.equal(
    fingerprintW6ImprovementCommand(reopen),
    createWorkflowEventFingerprint({ workflow: "W6", batch: "observation_batch_e", command: reopen }),
  );
});

test("W6 Batch E archive completes one authorized observed cycle and preserves every prior checkpoint fact", async () => {
  const harness = await archiveReadyHarness();
  const command = archiveCommand(harness.cycle.cycle_id);
  const beforeOperational = highLevelOperationalState(harness.repository);
  const beforeHistory = await harness.repository.getW6History(CLUSTER_ID);
  const beforeAiCalls = harness.aiRunner.calls.length;
  const beforeCatalogCalls = harness.catalogProvider.calls.length;
  const beforeAuthorizationCalls = harness.authorizer.calls.length;
  const validation = instrumentBatchEValidationGrants(harness);

  const result = await runW6Improvement(command, harness.ports);
  const cluster = await harness.repository.findW6ClusterById(CLUSTER_ID);
  const improvement = await harness.repository.findW6ImprovementById(IMPROVEMENT_ID);
  const history = await harness.repository.getW6History(CLUSTER_ID);
  const entry = history.entries.at(-1);
  const receipt = history.receipts.at(-1);
  const authorization = harness.authorizer.calls.at(-1);

  assert.equal(result.status, "completed", JSON.stringify(result));
  assert.equal(result.previous_state, "观察中");
  assert.equal(result.next_state, "已归档");
  assert.equal(cluster.status, "已归档");
  assert.equal(improvement.status, "已完成");
  assert.equal(improvement.current_observation_cycle_id, harness.cycle.cycle_id);
  assert.equal(improvement.human_conclusion, command.human_conclusion);
  assert.equal(cluster.updated_at, ARCHIVE_AT);
  assert.equal(improvement.updated_at, ARCHIVE_AT);
  assert.deepEqual(history.observation_cycles, beforeHistory.observation_cycles);
  assert.deepEqual(history.observation_checkpoints, beforeHistory.observation_checkpoints);
  assert.deepEqual(highLevelOperationalState(harness.repository), beforeOperational);
  assert.deepEqual(entry, {
    history_id: entry.history_id,
    event_id: command.event_id,
    phase: "observation",
    action: "archive_observation",
    case_ids: command.case_ids,
    cluster_id: CLUSTER_ID,
    improvement_id: IMPROVEMENT_ID,
    cycle_id: harness.cycle.cycle_id,
    previous_cluster_status: "观察中",
    next_cluster_status: "已归档",
    previous_improvement_status: "观察中",
    next_improvement_status: "已完成",
    reason: command.human_conclusion,
    principal: PRINCIPAL,
    authorization_policy_version: POLICY_VERSION,
    occurred_at: ARCHIVE_AT,
  });
  assert.equal(typeof entry.history_id, "string");
  assert.equal(entry.history_id.length > 0, true);
  assert.equal(receipt.event_id, command.event_id);
  assert.equal(receipt.phase, "observation");
  assert.equal(receipt.action, "archive_observation");
  assert.deepEqual(receipt.case_ids, command.case_ids);
  assert.equal(receipt.cluster_id, CLUSTER_ID);
  assert.equal(receipt.improvement_id, IMPROVEMENT_ID);
  assert.equal(receipt.target_fingerprint, authorization.target_fingerprint);
  assert.equal(receipt.command_fingerprint, fingerprintW6ImprovementCommand(command));
  assert.equal(receipt.history_id, entry.history_id);
  assert.equal(receipt.cycle_id, harness.cycle.cycle_id);
  assert.equal(receipt.checkpoint_id, null);
  assert.match(receipt.state_fingerprint, /^[a-f0-9]{64}$/u);
  assert.equal(receipt.committed_at, ARCHIVE_AT);
  assert.equal(typeof receipt.receipt_id, "string");
  assert.equal(receipt.receipt_id.length > 0, true);
  assert.equal(result.output.receipt.receipt_id, receipt.receipt_id);
  assert.equal(result.output.history.entries.at(-1).history_id, entry.history_id);
  assert.equal(result.output.workflow_audit_id.startsWith("W6-BATCH-C-WORKFLOW-AUDIT-"), true);
  assert.equal(authorization.action, "archive_observation");
  assert.equal(authorization.phase, "observation");
  assert.equal(harness.authorizer.calls.length, beforeAuthorizationCalls + 1);
  assert.equal(harness.aiRunner.calls.length, beforeAiCalls);
  assert.equal(harness.catalogProvider.calls.length, beforeCatalogCalls);
  assert.equal(validation.calls, 0);
});

test("W6 Batch E archive maps missing checkpoints, wrong cycle, early time, wrong clock, and repository failure exactly with zero writes", async () => {
  const setups = [
    ["missing_checkpoints", async () => {
      const harness = await highLevelObservingHarness();
      const cycle = (await harness.repository.getW6History(CLUSTER_ID)).observation_cycles[0];
      harness.clock.set(ARCHIVE_AT);
      return { harness, command: archiveCommand(cycle.cycle_id, { event_id: "SYN-EVENT-BATCH-E-ARCHIVE-MISSING-CHECKPOINTS" }), errorClass: "invalid_state" };
    }],
    ["missing_day_30", async () => {
      const harness = await day30ReadyHarness();
      harness.clock.set(ARCHIVE_AT);
      return { harness, command: archiveCommand(harness.cycle.cycle_id, { event_id: "SYN-EVENT-BATCH-E-ARCHIVE-MISSING-DAY-30" }), errorClass: "invalid_state" };
    }],
    ["wrong_cycle", async () => {
      const harness = await archiveReadyHarness();
      return { harness, command: archiveCommand("SYN-CYCLE-BATCH-E-WRONG", { event_id: "SYN-EVENT-BATCH-E-ARCHIVE-WRONG-CYCLE" }), errorClass: "invalid_state" };
    }],
    ["before_day_30", async () => {
      const harness = await archiveReadyHarness();
      harness.clock.set("2026-09-02T23:59:59.999Z");
      return { harness, command: archiveCommand(harness.cycle.cycle_id, { event_id: "SYN-EVENT-BATCH-E-ARCHIVE-EARLY" }), errorClass: "invalid_state" };
    }],
    ["wrong_clock", async () => {
      const harness = await archiveReadyHarness();
      harness.clock.source = "synthetic_history";
      return { harness, command: archiveCommand(harness.cycle.cycle_id, { event_id: "SYN-EVENT-BATCH-E-ARCHIVE-WRONG-CLOCK" }), errorClass: "invalid_state" };
    }],
    ["repository_failure", async () => {
      const harness = await archiveReadyHarness();
      const target = harness.repository;
      const repository = new Proxy(target, {
        get(inner, property) {
          if (property === "findW6ImprovementById") {
            return async () => { throw new Error("synthetic archive repository read failure"); };
          }
          const value = Reflect.get(inner, property, inner);
          return typeof value === "function" ? value.bind(inner) : value;
        },
      });
      return {
        harness,
        ports: { ...harness.ports, repository },
        command: archiveCommand(harness.cycle.cycle_id, { event_id: "SYN-EVENT-BATCH-E-ARCHIVE-REPOSITORY-FAILURE" }),
        errorClass: "repository_failure",
      };
    }],
  ];

  for (const [label, setup] of setups) {
    const { harness, ports = harness.ports, command, errorClass } = await setup();
    const before = await highLevelDurableState(harness.repository);
    const aiCalls = harness.aiRunner.calls.length;
    const catalogCalls = harness.catalogProvider.calls.length;
    const authorizationCalls = harness.authorizer.calls.length;
    const result = await runW6Improvement(command, ports);
    assert.equal(result.status, "failed", `${label}: ${JSON.stringify(result)}`);
    assert.equal(result.output.error_class, errorClass, label);
    assert.deepEqual(await highLevelDurableState(harness.repository), before, label);
    assert.equal(harness.aiRunner.calls.length, aiCalls, label);
    assert.equal(harness.catalogProvider.calls.length, catalogCalls, label);
    assert.equal(harness.authorizer.calls.length, authorizationCalls, label);
  }
});

test("W6 Batch E archive rejects denied, malformed, and wrong-channel authorization with exact classes and no partial write", async () => {
  const setups = [
    ["denied", "authorization_failure", (harness) => createAuthorizer(harness.w6Channel.issuer, { denied: true })],
    ["malformed", "authorization_port_failure", () => {
      const calls = [];
      return {
        calls,
        async authorize(input) {
          calls.push(structuredClone(input));
          return { allowed: true, principal: PRINCIPAL, policy_version: POLICY_VERSION };
        },
      };
    }],
    ["wrong_grant", "authorization_capability_invalid", () => {
      const channel = createW6AuthorizationGrantChannel();
      return createAuthorizer(channel.issuer);
    }],
  ];

  for (const [label, errorClass, buildAuthorizer] of setups) {
    const harness = await archiveReadyHarness();
    const authorizer = buildAuthorizer(harness);
    harness.ports.action_authorizer = authorizer;
    const validation = instrumentBatchEValidationGrants(harness);
    const before = await highLevelDurableState(harness.repository);
    const aiCalls = harness.aiRunner.calls.length;
    const catalogCalls = harness.catalogProvider.calls.length;
    const result = await runW6Improvement(archiveCommand(harness.cycle.cycle_id, {
      event_id: `SYN-EVENT-BATCH-E-ARCHIVE-AUTH-${label}`,
    }), harness.ports);
    assert.equal(result.status, "failed", `${label}: ${JSON.stringify(result)}`);
    assert.equal(result.output.error_class, errorClass, label);
    assert.deepEqual(await highLevelDurableState(harness.repository), before, label);
    assert.equal(authorizer.calls.length, 1, label);
    assert.equal(harness.aiRunner.calls.length, aiCalls, label);
    assert.equal(harness.catalogProvider.calls.length, catalogCalls, label);
    assert.equal(validation.calls, 0, label);
  }
});

test("W6 Batch E archive waits for authorization without resource locks and loses a stale CAS race", async () => {
  const harness = await archiveReadyHarness();
  const originalExclusive = harness.repository.runW6ResourcesExclusive.bind(harness.repository);
  let activeResourceSections = 0;
  let authorizationObservedUnlocked = null;
  harness.repository.runW6ResourcesExclusive = (resourceSet, operation) =>
    originalExclusive(resourceSet, async () => {
      activeResourceSections += 1;
      try {
        return await operation();
      } finally {
        activeResourceSections -= 1;
      }
    });
  const authorizer = createAuthorizer(harness.w6Channel.issuer, {
    async onAuthorize() {
      authorizationObservedUnlocked = activeResourceSections === 0;
      await commitWinningArchiveDuringAuthorization(harness);
    },
  });
  harness.ports.action_authorizer = authorizer;
  const aiCalls = harness.aiRunner.calls.length;
  const catalogCalls = harness.catalogProvider.calls.length;
  const result = await runW6Improvement(archiveCommand(harness.cycle.cycle_id, {
    event_id: "SYN-EVENT-BATCH-E-ARCHIVE-STALE-CAS",
  }), harness.ports);
  const history = await harness.repository.getW6History(CLUSTER_ID);

  assert.equal(result.status, "failed", JSON.stringify(result));
  assert.equal(result.output.error_class, "concurrency_conflict");
  assert.equal(authorizationObservedUnlocked, true);
  assert.equal(activeResourceSections, 0);
  assert.equal(authorizer.calls.length, 1);
  assert.equal(harness.aiRunner.calls.length, aiCalls);
  assert.equal(harness.catalogProvider.calls.length, catalogCalls);
  assert.equal(history.entries.filter((entry) => entry.action === "archive_observation").length, 1);
  assert.equal((await harness.repository.findW6ClusterById(CLUSTER_ID)).status, "已归档");
  assert.equal((await harness.repository.findW6ImprovementById(IMPROVEMENT_ID)).status, "已完成");
});

test("W6 Batch E archive revalidates its exact trusted clock inside the lock after authorization", async () => {
  const harness = await archiveReadyHarness();
  const authorizer = createAuthorizer(harness.w6Channel.issuer, {
    onAuthorize() {
      harness.clock.set("2026-09-04T00:00:00.001Z");
    },
  });
  harness.ports.action_authorizer = authorizer;
  const before = await highLevelDurableState(harness.repository);
  const aiCalls = harness.aiRunner.calls.length;
  const result = await runW6Improvement(archiveCommand(harness.cycle.cycle_id, {
    event_id: "SYN-EVENT-BATCH-E-ARCHIVE-CLOCK-DRIFT",
  }), harness.ports);

  assert.equal(result.status, "failed", JSON.stringify(result));
  assert.equal(result.output.error_class, "invalid_state");
  assert.deepEqual(await highLevelDurableState(harness.repository), before);
  assert.equal(authorizer.calls.length, 1);
  assert.equal(harness.aiRunner.calls.length, aiCalls);
});

test("W6 Batch E archive replay repairs only its compatible audit and a changed payload conflicts", async () => {
  const harness = await archiveReadyHarness();
  const originalCommit = harness.repository.commitW6Transition.bind(harness.repository);
  let commitCalls = 0;
  harness.repository.commitW6Transition = (transition) => {
    commitCalls += 1;
    return originalCommit(transition);
  };
  const auditAttempts = [];
  harness.ports.audit = {
    async append(record) {
      auditAttempts.push(structuredClone(record));
      if (auditAttempts.length === 1) throw new Error("synthetic first Batch E archive audit failure");
    },
  };
  const command = archiveCommand(harness.cycle.cycle_id, {
    event_id: "SYN-EVENT-BATCH-E-ARCHIVE-AUDIT-REPAIR",
  });
  const aiCalls = harness.aiRunner.calls.length;
  const catalogCalls = harness.catalogProvider.calls.length;
  const authorizationCalls = harness.authorizer.calls.length;

  const first = await runW6Improvement(command, harness.ports);
  const idsAfterFirst = harness.ids.current;
  const replay = await runW6Improvement(command, harness.ports);
  const conflict = await runW6Improvement({
    ...command,
    human_conclusion: "同一事件不同的合成人工结论。",
  }, harness.ports);
  const history = await harness.repository.getW6History(CLUSTER_ID);

  assert.equal(first.status, "completed", JSON.stringify(first));
  assert.equal(first.output.audit_state, "pending");
  assert.equal(first.output.workflow_audit_id.startsWith("W6-BATCH-C-WORKFLOW-AUDIT-"), true);
  assert.equal(replay.status, "idempotent");
  assert.equal(replay.output.audit_state, "recorded");
  assert.equal(replay.output.event_replayed, true);
  assert.equal(replay.actions.includes("return_existing_W6_observation_batch_e_result"), true);
  assert.equal(replay.actions.includes("do_not_repeat_W6_observation_effects"), true);
  assert.equal(replay.actions.includes("return_existing_W6_observation_batch_d_result"), false);
  assert.equal(replay.actions.includes("return_existing_W6_batch_c_result"), false);
  assert.equal(conflict.status, "failed");
  assert.equal(conflict.output.error_class, "event_conflict");
  assert.equal(auditAttempts.length, 3);
  assert.equal(auditAttempts[0].audit_id, auditAttempts[1].audit_id);
  assert.equal(harness.authorizer.calls.length, authorizationCalls + 1);
  assert.equal(harness.aiRunner.calls.length, aiCalls);
  assert.equal(harness.catalogProvider.calls.length, catalogCalls);
  assert.equal(commitCalls, 1);
  assert.equal(harness.ids.current, idsAfterFirst);
  assert.equal(history.entries.filter((entry) => entry.action === "archive_observation").length, 1);
});

test("W6 Batch E reopens an archived improvement from one legal W5 closure without mutating case ownership or prior observation facts", async () => {
  const harness = await directArchivedHarness();
  const command = reopenCommand();
  const beforeOperational = highLevelOperationalState(harness.repository);
  const beforeHistory = await harness.repository.getW6History(CLUSTER_ID);
  const beforeCluster = await harness.repository.findW6ClusterById(CLUSTER_ID);
  const beforeAiCalls = harness.aiRunner.calls.length;
  const beforeCatalogCalls = harness.catalogProvider.calls.length;
  const beforeAuthorizationCalls = harness.authorizer.calls.length;
  const validation = instrumentBatchEValidationGrants(harness);

  const result = await runW6Improvement(command, harness.ports);
  const cluster = await harness.repository.findW6ClusterById(CLUSTER_ID);
  const improvement = await harness.repository.findW6ImprovementById(IMPROVEMENT_ID);
  const history = await harness.repository.getW6History(CLUSTER_ID);
  const cycle = history.observation_cycles.at(-1);
  const entry = history.entries.at(-1);
  const receipt = history.receipts.at(-1);
  const authorization = harness.authorizer.calls.at(-1);

  assert.equal(result.status, "completed", JSON.stringify(result));
  assert.equal(result.previous_state, "已归档");
  assert.equal(result.next_state, "观察中");
  assert.equal(cluster.status, "观察中");
  assert.equal(improvement.status, "观察中");
  assert.deepEqual(cluster.member_case_ids, [CASE_A, CASE_B, CASE_C]);
  assert.equal(cluster.recurrence_count, beforeCluster.recurrence_count + 1);
  assert.equal(improvement.human_conclusion, null);
  assert.equal(history.observation_cycles.length, beforeHistory.observation_cycles.length + 1);
  assert.deepEqual(
    history.observation_cycles.slice(0, beforeHistory.observation_cycles.length),
    beforeHistory.observation_cycles,
  );
  assert.deepEqual(history.observation_checkpoints, beforeHistory.observation_checkpoints);
  assert.equal(cycle.ordinal, beforeHistory.observation_cycles.length + 1);
  assert.equal(cycle.trigger, "recurrence_reopen");
  assert.deepEqual(cycle.triggering_case_ids, [CASE_C]);
  assert.equal(cycle.clock_source, "test");
  assert.equal(cycle.opened_at, REOPEN_AT);
  assert.deepEqual(cycle.opened_by, PRINCIPAL);
  assert.equal(cycle.authorization_policy_version, POLICY_VERSION);
  assert.equal(improvement.current_observation_cycle_id, cycle.cycle_id);
  assert.notEqual(cycle.cycle_id, beforeHistory.observation_cycles.at(-1).cycle_id);
  assert.equal(typeof cycle.cycle_id, "string");
  assert.equal(cycle.cycle_id.length > 0, true);
  assert.deepEqual(highLevelOperationalState(harness.repository), beforeOperational);
  assert.deepEqual(entry, {
    history_id: entry.history_id,
    event_id: command.event_id,
    phase: "recurrence",
    action: "reopen_recurrence",
    case_ids: command.case_ids,
    cluster_id: CLUSTER_ID,
    improvement_id: IMPROVEMENT_ID,
    cycle_id: cycle.cycle_id,
    previous_cluster_status: "已归档",
    next_cluster_status: "观察中",
    previous_improvement_status: "已完成",
    next_improvement_status: "观察中",
    reason: command.reason,
    principal: PRINCIPAL,
    authorization_policy_version: POLICY_VERSION,
    occurred_at: REOPEN_AT,
  });
  assert.equal(receipt.event_id, command.event_id);
  assert.equal(receipt.phase, "recurrence");
  assert.equal(receipt.action, "reopen_recurrence");
  assert.deepEqual(receipt.case_ids, command.case_ids);
  assert.equal(receipt.target_fingerprint, authorization.target_fingerprint);
  assert.equal(receipt.command_fingerprint, fingerprintW6ImprovementCommand(command));
  assert.equal(receipt.history_id, entry.history_id);
  assert.equal(receipt.cycle_id, cycle.cycle_id);
  assert.equal(receipt.checkpoint_id, null);
  assert.equal(receipt.committed_at, REOPEN_AT);
  assert.match(receipt.state_fingerprint, /^[a-f0-9]{64}$/u);
  assert.equal(result.output.observation_cycle.cycle_id, cycle.cycle_id);
  assert.equal(result.output.receipt.receipt_id, receipt.receipt_id);
  assert.equal(authorization.action, "reopen_recurrence");
  assert.equal(authorization.phase, "recurrence");
  assert.equal(harness.authorizer.calls.length, beforeAuthorizationCalls + 1);
  assert.equal(harness.aiRunner.calls.length, beforeAiCalls);
  assert.equal(harness.catalogProvider.calls.length, beforeCatalogCalls);
  assert.equal(validation.calls, 0);
});

test("W6 Batch E recurrence reopen rejects denied, malformed, and wrong-channel authorization without partial writes", async () => {
  const setups = [
    ["denied", "authorization_failure", (harness) => createAuthorizer(harness.w6Channel.issuer, { denied: true })],
    ["malformed", "authorization_port_failure", () => {
      const calls = [];
      return {
        calls,
        async authorize(input) {
          calls.push(structuredClone(input));
          return { allowed: true, principal: PRINCIPAL, policy_version: POLICY_VERSION, grant: null };
        },
      };
    }],
    ["wrong_grant", "authorization_capability_invalid", () => {
      const channel = createW6AuthorizationGrantChannel();
      return createAuthorizer(channel.issuer);
    }],
  ];

  for (const [label, errorClass, buildAuthorizer] of setups) {
    const harness = await directArchivedHarness();
    const authorizer = buildAuthorizer(harness);
    harness.ports.action_authorizer = authorizer;
    const before = await highLevelDurableState(harness.repository);
    const aiCalls = harness.aiRunner.calls.length;
    const result = await runW6Improvement(reopenCommand({
      event_id: `SYN-EVENT-BATCH-E-REOPEN-AUTH-${label}`,
    }), harness.ports);
    assert.equal(result.status, "failed", `${label}: ${JSON.stringify(result)}`);
    assert.equal(result.output.error_class, errorClass, label);
    assert.deepEqual(await highLevelDurableState(harness.repository), before, label);
    assert.equal(authorizer.calls.length, 1, label);
    assert.equal(harness.aiRunner.calls.length, aiCalls, label);
  }
});

test("W6 Batch E recurrence reopen enforces archive_at < closed_at at the exact millisecond boundary", async () => {
  const scenarios = [
    ["minus_1ms", "2026-09-03T23:59:59.999Z", false],
    ["equal", ARCHIVE_AT, false],
    ["plus_1ms", "2026-09-04T00:00:00.001Z", true],
  ];
  for (const [label, closedAt, shouldComplete] of scenarios) {
    const harness = await directArchivedHarness({
      triggerClosures: [{ caseId: CASE_C, ordinal: 3, closedAt }],
    });
    const before = await highLevelDurableState(harness.repository);
    const aiCalls = harness.aiRunner.calls.length;
    const result = await runW6Improvement(reopenCommand({
      event_id: `SYN-EVENT-BATCH-E-REOPEN-TIME-${label}`,
    }), harness.ports);
    if (shouldComplete) {
      assert.equal(result.status, "completed", `${label}: ${JSON.stringify(result)}`);
      assert.equal((await harness.repository.findW6ClusterById(CLUSTER_ID)).status, "观察中");
      assert.equal(harness.authorizer.calls.at(-1).phase, "recurrence");
    } else {
      assert.equal(result.status, "failed", `${label}: ${JSON.stringify(result)}`);
      assert.equal(result.output.error_class, "invalid_state", label);
      assert.deepEqual(await highLevelDurableState(harness.repository), before, label);
    }
    assert.equal(harness.aiRunner.calls.length, aiCalls, label);
  }
});

test("W6 Batch E recurrence reopen rejects future closure, wrong clock, old member, missing W5 provenance, non-exact union, and cross-cluster ownership with zero writes", async () => {
  const setups = [
    ["closed_after_reopen", async () => {
      const harness = await directArchivedHarness({
        triggerClosures: [{ caseId: CASE_C, ordinal: 3, closedAt: "2026-09-05T00:00:00.001Z" }],
      });
      return { harness, command: reopenCommand({ event_id: "SYN-EVENT-BATCH-E-REOPEN-FUTURE-CLOSURE" }), errorClass: "invalid_state" };
    }],
    ["wrong_clock", async () => {
      const harness = await directArchivedHarness();
      harness.clock.source = "synthetic_history";
      return { harness, command: reopenCommand({ event_id: "SYN-EVENT-BATCH-E-REOPEN-WRONG-CLOCK" }), errorClass: "invalid_state" };
    }],
    ["old_member", async () => {
      const harness = await directArchivedHarness();
      return {
        harness,
        command: reopenCommand({
          event_id: "SYN-EVENT-BATCH-E-REOPEN-OLD-MEMBER",
          case_ids: [CASE_A, CASE_B],
          triggering_case_ids: [CASE_A],
        }),
        errorClass: "invalid_state",
      };
    }],
    ["missing_w5_provenance", async () => {
      const harness = await directArchivedHarness({ triggerClosures: [] });
      await seedUnprovenancedClosedCase(
        harness.repository,
        CASE_C,
        3,
        "2026-09-04T00:00:00.001Z",
      );
      return { harness, command: reopenCommand({ event_id: "SYN-EVENT-BATCH-E-REOPEN-MISSING-W5" }), errorClass: "w5_closure_provenance_failure" };
    }],
    ["non_exact_union", async () => {
      const harness = await directArchivedHarness({
        triggerClosures: [
          { caseId: CASE_C, ordinal: 3, closedAt: "2026-09-04T00:00:00.001Z" },
          { caseId: CASE_D, ordinal: 4, closedAt: "2026-09-04T00:00:00.002Z" },
        ],
      });
      return {
        harness,
        command: reopenCommand({
          event_id: "SYN-EVENT-BATCH-E-REOPEN-NON-EXACT-UNION",
          case_ids: [CASE_A, CASE_B, CASE_C, CASE_D],
          triggering_case_ids: [CASE_C],
        }),
        errorClass: "invalid_state",
      };
    }],
    ["cross_cluster", async () => {
      const harness = await directArchivedHarness({
        triggerClosures: [
          { caseId: CASE_C, ordinal: 3, closedAt: "2026-09-04T00:00:00.001Z" },
          { caseId: CASE_D, ordinal: 4, closedAt: "2026-09-04T00:00:00.002Z" },
        ],
      });
      const other = await runW6Improvement(createCommand({
        event_id: "SYN-EVENT-BATCH-E-CROSS-CLUSTER-SEED",
        case_ids: [CASE_C, CASE_D],
        cluster_id: "SYN-CLUSTER-BATCH-E-OTHER",
        name: "合成跨簇占用候选",
      }), harness.ports);
      assert.equal(other.status, "needs_human", JSON.stringify(other));
      return { harness, command: reopenCommand({ event_id: "SYN-EVENT-BATCH-E-REOPEN-CROSS-CLUSTER" }), errorClass: "concurrency_conflict" };
    }],
  ];

  for (const [label, setup] of setups) {
    const { harness, command, errorClass } = await setup();
    const before = await highLevelDurableState(harness.repository);
    const aiCalls = harness.aiRunner.calls.length;
    const catalogCalls = harness.catalogProvider.calls.length;
    const validation = instrumentBatchEValidationGrants(harness);
    const result = await runW6Improvement(command, harness.ports);
    assert.equal(result.status, "failed", `${label}: ${JSON.stringify(result)}`);
    assert.equal(result.output.error_class, errorClass, label);
    assert.deepEqual(await highLevelDurableState(harness.repository), before, label);
    assert.equal(harness.aiRunner.calls.length, aiCalls, label);
    assert.equal(harness.catalogProvider.calls.length, catalogCalls, label);
    assert.equal(validation.calls, 0, label);
  }
});

test("W6 Batch E recurrence reopen awaits authorization without locks and loses CAS to another legal trigger", async () => {
  const harness = await directArchivedHarness({
    triggerClosures: [
      { caseId: CASE_C, ordinal: 3, closedAt: "2026-09-04T00:00:00.001Z" },
      { caseId: CASE_D, ordinal: 4, closedAt: "2026-09-04T00:00:00.002Z" },
    ],
  });
  const originalExclusive = harness.repository.runW6ResourcesExclusive.bind(harness.repository);
  let activeResourceSections = 0;
  let authorizationObservedUnlocked = null;
  harness.repository.runW6ResourcesExclusive = (resourceSet, operation) =>
    originalExclusive(resourceSet, async () => {
      activeResourceSections += 1;
      try {
        return await operation();
      } finally {
        activeResourceSections -= 1;
      }
    });
  const authorizer = createAuthorizer(harness.w6Channel.issuer, {
    async onAuthorize() {
      authorizationObservedUnlocked = activeResourceSections === 0;
      await commitWinningReopenDuringAuthorization(harness);
    },
  });
  harness.ports.action_authorizer = authorizer;
  const aiCalls = harness.aiRunner.calls.length;
  const result = await runW6Improvement(reopenCommand({
    event_id: "SYN-EVENT-BATCH-E-REOPEN-STALE-CAS",
  }), harness.ports);
  const history = await harness.repository.getW6History(CLUSTER_ID);

  assert.equal(result.status, "failed", JSON.stringify(result));
  assert.equal(result.output.error_class, "concurrency_conflict");
  assert.equal(authorizationObservedUnlocked, true);
  assert.equal(activeResourceSections, 0);
  assert.equal(authorizer.calls.length, 1);
  assert.equal(harness.aiRunner.calls.length, aiCalls);
  assert.equal(history.observation_cycles.filter((cycle) => cycle.trigger === "recurrence_reopen").length, 1);
  assert.deepEqual((await harness.repository.findW6ClusterById(CLUSTER_ID)).member_case_ids, [
    CASE_A,
    CASE_B,
    CASE_D,
  ]);
});

test("W6 Batch E recurrence reopen revalidates trusted time and source inside the post-authorization lock", async () => {
  const scenarios = [
    ["time_drift", (harness) => harness.clock.set("2026-09-05T00:00:00.001Z")],
    ["source_drift", (harness) => { harness.clock.source = "synthetic_history"; }],
  ];
  for (const [label, drift] of scenarios) {
    const harness = await directArchivedHarness();
    const authorizer = createAuthorizer(harness.w6Channel.issuer);
    harness.ports.action_authorizer = authorizer;
    const originalExclusive = harness.repository.runW6ResourcesExclusive.bind(harness.repository);
    let injected = false;
    harness.repository.runW6ResourcesExclusive = (resources, operation) =>
      originalExclusive(resources, async () => {
        if (!injected) {
          injected = true;
          drift(harness);
        }
        return operation();
      });
    const before = await highLevelDurableState(harness.repository);
    const aiCalls = harness.aiRunner.calls.length;
    const result = await runW6Improvement(reopenCommand({
      event_id: `SYN-EVENT-BATCH-E-REOPEN-${label}`,
    }), harness.ports);
    assert.equal(result.status, "failed", `${label}: ${JSON.stringify(result)}`);
    assert.equal(result.output.error_class, "invalid_state", label);
    assert.deepEqual(await highLevelDurableState(harness.repository), before, label);
    assert.equal(authorizer.calls.length, 1, label);
    assert.equal(harness.aiRunner.calls.length, aiCalls, label);
  }
});

test("W6 Batch E denied exact near and miss requests are indistinguishable before private replay lookup", async () => {
  const harness = await publicArchivedHarness({
    triggerClosures: [
      { caseId: CASE_C, ordinal: 3, closedAt: "2026-09-04T00:00:00.001Z" },
      { caseId: CASE_D, ordinal: 4, closedAt: "2026-09-04T00:00:00.002Z" },
    ],
  });
  const originalCommand = reopenCommand({ event_id: "SYN-EVENT-R9-DENIAL-ORIGINAL" });
  assert.equal((await runW6Improvement(originalCommand, harness.ports)).status, "completed");
  const before = await highLevelDurableState(harness.repository);
  const idsBefore = harness.ids.current;
  const originalLookup = harness.repository.findW6RecurrenceReplayCandidate.bind(harness.repository);
  let privateLookupCalls = 0;
  harness.repository.findW6RecurrenceReplayCandidate = async (input) => {
    privateLookupCalls += 1;
    return originalLookup(input);
  };
  const lookupCallsAtAuthorization = [];
  const deniedAuthorizer = createAuthorizer(harness.w6Channel.issuer, {
    denied: true,
    onAuthorize() {
      lookupCallsAtAuthorization.push(privateLookupCalls);
    },
  });
  harness.ports.action_authorizer = deniedAuthorizer;
  const variants = [
    ["exact", {}],
    ["actor", { actor: { ...ACTOR, actor_id: "SYN-ACTOR-R9-NEAR" } }],
    ["reason", { reason: "合成近似理由不得在授权前暴露命中差异。" }],
    ["case_union", { case_ids: [CASE_A, CASE_B, CASE_C, CASE_D] }],
    ["trigger_miss", { triggering_case_ids: [CASE_D] }],
  ];
  const results = [];
  const deniedEventIds = [];
  for (const [label, changes] of variants) {
    const eventId = `SYN-EVENT-R9-DENIAL-${label}`;
    const result = await runW6Improvement({
      ...originalCommand,
      ...changes,
      event_id: eventId,
    }, harness.ports);
    assert.equal(result.status, "failed", label);
    assert.equal(result.output.error_class, "authorization_failure", label);
    assertNoReplaySecrets(result);
    results.push(normalizedReplayFailure(result));
    deniedEventIds.push(eventId);
  }
  assert.equal(deniedAuthorizer.calls.length, variants.length);
  assert.deepEqual(lookupCallsAtAuthorization, [0, 0, 0, 0, 0]);
  assert.equal(privateLookupCalls, 0);
  for (const result of results.slice(1)) assert.deepEqual(result, results[0]);
  for (const eventId of deniedEventIds) {
    const audit = harness.audit.records.find((record) => record.payload.event_id === eventId);
    assertNoReplaySecrets(audit, [PRINCIPAL.principal_id, POLICY_VERSION]);
  }
  assert.deepEqual(await highLevelDurableState(harness.repository), before);
  assert.equal(harness.ids.current, idsBefore);

  const authorizationsBeforeSameEvent = deniedAuthorizer.calls.length;
  const auditsBeforeSameEvent = harness.audit.records.length;
  const sameEvent = await runW6Improvement({
    ...originalCommand,
    event_id: "SYN-EVENT-R9-DENIAL-exact",
  }, harness.ports);
  assert.equal(sameEvent.status, "failed");
  assert.equal(sameEvent.output.event_replayed, true);
  assert.equal(deniedAuthorizer.calls.length, authorizationsBeforeSameEvent);
  assert.equal(privateLookupCalls, 0);
  assert.equal(harness.audit.records.length, auditsBeforeSameEvent);
});

test("W6 Batch E public late recurrence replay reauthorizes before lookup and returns one redacted artifact", async () => {
  const harness = await publicArchivedHarness({
    triggerClosures: [
      { caseId: CASE_C, ordinal: 3, closedAt: "2026-09-04T00:00:00.001Z" },
      { caseId: CASE_D, ordinal: 4, closedAt: "2026-09-04T00:00:00.002Z" },
    ],
  });
  const originalCommand = reopenCommand({ event_id: "SYN-EVENT-BATCH-E-PUBLIC-REOPEN-ORIGINAL" });
  const original = await runW6Improvement(originalCommand, harness.ports);
  assert.equal(original.status, "completed", JSON.stringify(original));
  const originalCycle = original.output.observation_cycle;

  harness.clock.set("2026-09-12T00:00:00.000Z");
  assert.equal((await runW6Improvement(day7Command(originalCycle.cycle_id, {
    event_id: "SYN-EVENT-BATCH-E-PUBLIC-REOPEN-DAY-7",
    case_ids: originalCommand.case_ids,
    related_task_volume: 1,
  }), harness.ports)).status, "completed");
  harness.clock.set("2026-10-05T00:00:00.000Z");
  assert.equal((await runW6Improvement(day30Command(originalCycle.cycle_id, {
    event_id: "SYN-EVENT-BATCH-E-PUBLIC-REOPEN-DAY-30",
    case_ids: originalCommand.case_ids,
    related_task_volume: 1,
  }), harness.ports)).status, "completed");
  harness.clock.set("2026-10-05T01:00:00.000Z");
  assert.equal((await runW6Improvement(archiveCommand(originalCycle.cycle_id, {
    event_id: "SYN-EVENT-BATCH-E-PUBLIC-REOPEN-REARCHIVE",
    case_ids: originalCommand.case_ids,
    human_conclusion: "合成复发观察周期已完成二次人工归档。",
  }), harness.ports)).status, "completed");

  const beforeReplay = await highLevelDurableState(harness.repository);
  const idsBeforeReplay = harness.ids.current;
  const auditsBeforeReplay = harness.audit.records.length;

  const deniedAuthorizer = createAuthorizer(harness.w6Channel.issuer, { denied: true });
  harness.ports.action_authorizer = deniedAuthorizer;
  const deniedCommand = { ...originalCommand, event_id: "SYN-EVENT-BATCH-E-PUBLIC-REOPEN-DENIED-REPLAY" };
  const denied = await runW6Improvement(deniedCommand, harness.ports);
  assert.equal(denied.status, "failed", JSON.stringify(denied));
  assert.equal(denied.output.error_class, "authorization_failure");
  assert.equal(deniedAuthorizer.calls.length, 1);
  assert.equal(harness.ids.current, idsBeforeReplay);
  assert.deepEqual(await highLevelDurableState(harness.repository), beforeReplay);
  assertNoReplaySecrets(denied);
  const auditsAfterDenied = harness.audit.records.length;
  const deniedSameEventReplay = await runW6Improvement(deniedCommand, harness.ports);
  assert.equal(deniedSameEventReplay.status, "failed");
  assert.equal(deniedSameEventReplay.output.event_replayed, true);
  assert.equal(deniedAuthorizer.calls.length, 1);
  assert.equal(harness.audit.records.length, auditsAfterDenied);
  assert.equal(harness.ids.current, idsBeforeReplay);
  assert.deepEqual(await highLevelDurableState(harness.repository), beforeReplay);

  const replayAuthorizer = createAuthorizer(harness.w6Channel.issuer);
  harness.ports.action_authorizer = replayAuthorizer;
  const replayCommand = { ...originalCommand, event_id: "SYN-EVENT-BATCH-E-PUBLIC-REOPEN-AUTHORIZED-REPLAY" };
  const replay = await runW6Improvement(replayCommand, harness.ports);
  assert.equal(replay.status, "idempotent", JSON.stringify(replay));
  assert.equal(replay.output.commit_outcome, "idempotent");
  assert.equal(replay.output.semantic_replayed, true);
  assert.deepEqual(replay.output.existing_result, {
    cluster_id: CLUSTER_ID,
    cluster_status: "已归档",
    improvement_id: IMPROVEMENT_ID,
    improvement_status: "已完成",
  });
  assert.equal(replayAuthorizer.calls.length, 1);
  assert.equal(harness.ids.current, idsBeforeReplay);
  assert.deepEqual(await highLevelDurableState(harness.repository), beforeReplay);
  const afterReplayHistory = await harness.repository.getW6History(CLUSTER_ID);
  assert.equal(afterReplayHistory.entries.filter((entry) => entry.action === "reopen_recurrence").length, 1);
  assert.equal(afterReplayHistory.receipts.filter((receipt) => receipt.action === "reopen_recurrence").length, 1);
  assert.equal(harness.audit.records.length, auditsBeforeReplay + 2);
  assert.equal(harness.audit.records.filter((record) => record.payload.event_id === deniedCommand.event_id).length, 1);
  assert.equal(harness.audit.records.filter((record) => record.payload.event_id === replayCommand.event_id).length, 1);
  assert.equal(harness.audit.records.filter((record) => record.payload.event_id === originalCommand.event_id).length, 1);
  const replayAudit = harness.audit.records.find((record) => record.payload.event_id === replayCommand.event_id);
  const committedBusinessIds = afterReplayHistory.entries.map((entry) => entry.history_id)
    .concat(afterReplayHistory.observation_cycles.map((cycle) => cycle.cycle_id))
    .concat(afterReplayHistory.receipts.map((receipt) => receipt.receipt_id));
  assertMinimalSemanticReplayResult(replay);
  assertMinimalSemanticReplayAudit(replayAudit);
  assertNoReplaySecrets(replay, [
    ...committedBusinessIds,
    PRINCIPAL.principal_id,
    POLICY_VERSION,
    replayAuthorizer.calls[0].target_fingerprint,
    "denied_or_indeterminate",
    "synthetic authorization denied",
  ]);
  assertNoReplaySecrets(replayAudit, [
    ...committedBusinessIds,
    PRINCIPAL.principal_id,
    POLICY_VERSION,
    replayAuthorizer.calls[0].target_fingerprint,
    "denied_or_indeterminate",
    "synthetic authorization denied",
  ]);

  const authorizationsBeforeSameEventReplay = replayAuthorizer.calls.length;
  const auditsBeforeSameEventReplay = harness.audit.records.length;
  const sameEventReplay = await runW6Improvement(replayCommand, harness.ports);
  assert.equal(sameEventReplay.status, "idempotent");
  assert.equal(sameEventReplay.output.event_replayed, true);
  assertMinimalSemanticReplayResult(sameEventReplay, { eventReplayed: true });
  assert.equal(replayAuthorizer.calls.length, authorizationsBeforeSameEventReplay);
  assert.equal(harness.audit.records.length, auditsBeforeSameEventReplay);
  assert.equal(harness.ids.current, idsBeforeReplay);

  const mismatches = [
    ["actor", { ...originalCommand.actor, actor_id: "SYN-ACTOR-BATCH-E-DIFFERENT" }, "event_conflict"],
    ["reason", "不同的合成重开理由不得命中旧结果。", "event_conflict"],
    ["case_ids", [CASE_A, CASE_B, CASE_C, CASE_D], "event_conflict"],
    ["triggering_case_ids", [CASE_D], "invalid_state"],
    ["cluster_id", "SYN-CLUSTER-BATCH-E-DIFFERENT", "repository_failure"],
    ["improvement_id", "SYN-IMPROVEMENT-BATCH-E-DIFFERENT", "event_conflict"],
  ];
  const authorizationsBeforeMismatches = replayAuthorizer.calls.length;
  for (const [field, value, expectedErrorClass] of mismatches) {
    const result = await runW6Improvement({
      ...originalCommand,
      event_id: `SYN-EVENT-BATCH-E-PUBLIC-REOPEN-MISMATCH-${field}`,
      [field]: value,
    }, harness.ports);
    assert.equal(result.status, "failed", `${field}: ${JSON.stringify(result)}`);
    assert.equal(result.output.error_class, expectedErrorClass, field);
    assert.notEqual(result.status, "idempotent", field);
    assert.deepEqual(await highLevelDurableState(harness.repository), beforeReplay, field);
    assert.equal(harness.ids.current, idsBeforeReplay, field);
  }
  assert.equal(replayAuthorizer.calls.length, authorizationsBeforeMismatches + mismatches.length);
});

test("W6 Batch E authorized miss creates a new recurrence while an old semantic replay resolves its exact private cycle", async () => {
  const harness = await publicArchivedHarness();
  const firstCommand = reopenCommand({ event_id: "SYN-EVENT-R9-OLD-CYCLE-FIRST-REOPEN" });
  const first = await runW6Improvement(firstCommand, harness.ports);
  assert.equal(first.status, "completed", JSON.stringify(first));
  const firstCycle = first.output.observation_cycle;

  harness.clock.set("2026-09-12T00:00:00.000Z");
  assert.equal((await runW6Improvement(day7Command(firstCycle.cycle_id, {
    event_id: "SYN-EVENT-R9-OLD-CYCLE-FIRST-DAY-7",
    case_ids: firstCommand.case_ids,
    related_task_volume: 1,
  }), harness.ports)).status, "completed");
  harness.clock.set("2026-10-05T00:00:00.000Z");
  assert.equal((await runW6Improvement(day30Command(firstCycle.cycle_id, {
    event_id: "SYN-EVENT-R9-OLD-CYCLE-FIRST-DAY-30",
    case_ids: firstCommand.case_ids,
    related_task_volume: 1,
  }), harness.ports)).status, "completed");
  harness.clock.set("2026-10-05T01:00:00.000Z");
  assert.equal((await runW6Improvement(archiveCommand(firstCycle.cycle_id, {
    event_id: "SYN-EVENT-R9-OLD-CYCLE-FIRST-ARCHIVE",
    case_ids: firstCommand.case_ids,
  }), harness.ports)).status, "completed");

  await seedClosedCase(harness.repository, harness.w5Channel.issuer, CASE_D, 4, {
    closed_at: "2026-10-05T01:00:00.001Z",
    updated_at: "2026-10-05T01:00:00.001Z",
  });
  harness.clock.set("2026-10-06T00:00:00.000Z");
  const beforeSecondRecurrence = await harness.repository.getW6History(CLUSTER_ID);
  const secondCommand = reopenCommand({
    event_id: "SYN-EVENT-R9-OLD-CYCLE-LEGAL-MISS",
    case_ids: [CASE_A, CASE_B, CASE_C, CASE_D],
    triggering_case_ids: [CASE_D],
    reason: "前一观察周期归档后出现新的合成复发案，允许建立下一周期。",
  });
  const authorizationsBeforeMiss = harness.authorizer.calls.length;
  const second = await runW6Improvement(secondCommand, harness.ports);
  assert.equal(second.status, "completed", JSON.stringify(second));
  assert.equal(harness.authorizer.calls.length, authorizationsBeforeMiss + 1);
  const secondCycle = second.output.observation_cycle;
  assert.notEqual(secondCycle.cycle_id, firstCycle.cycle_id);
  const afterSecondRecurrence = await harness.repository.getW6History(CLUSTER_ID);
  assert.equal(
    afterSecondRecurrence.observation_cycles.length,
    beforeSecondRecurrence.observation_cycles.length + 1,
  );
  assert.equal(afterSecondRecurrence.entries.length, beforeSecondRecurrence.entries.length + 1);
  assert.equal(afterSecondRecurrence.receipts.length, beforeSecondRecurrence.receipts.length + 1);
  assert.equal(afterSecondRecurrence.entries.at(-1).event_id, secondCommand.event_id);
  assert.equal(afterSecondRecurrence.receipts.at(-1).event_id, secondCommand.event_id);

  const afterLegalMiss = await highLevelDurableState(harness.repository);
  const idsAfterLegalMiss = harness.ids.current;
  const authorizationsAfterLegalMiss = harness.authorizer.calls.length;
  const auditsAfterLegalMiss = harness.audit.records.length;
  const sameEventLegalMissReplay = await runW6Improvement(secondCommand, harness.ports);
  assert.equal(sameEventLegalMissReplay.status, "idempotent");
  assert.equal(sameEventLegalMissReplay.output.event_replayed, true);
  assert.equal(harness.authorizer.calls.length, authorizationsAfterLegalMiss);
  assert.equal(harness.audit.records.length, auditsAfterLegalMiss);
  assert.equal(harness.ids.current, idsAfterLegalMiss);
  assert.deepEqual(await highLevelDurableState(harness.repository), afterLegalMiss);

  harness.clock.set("2026-10-13T00:00:00.000Z");
  assert.equal((await runW6Improvement(day7Command(secondCycle.cycle_id, {
    event_id: "SYN-EVENT-R9-OLD-CYCLE-SECOND-DAY-7",
    case_ids: secondCommand.case_ids,
    related_task_volume: 1,
  }), harness.ports)).status, "completed");
  harness.clock.set("2026-11-05T00:00:00.000Z");
  assert.equal((await runW6Improvement(day30Command(secondCycle.cycle_id, {
    event_id: "SYN-EVENT-R9-OLD-CYCLE-SECOND-DAY-30",
    case_ids: secondCommand.case_ids,
    related_task_volume: 1,
  }), harness.ports)).status, "completed");
  harness.clock.set("2026-11-05T01:00:00.000Z");
  assert.equal((await runW6Improvement(archiveCommand(secondCycle.cycle_id, {
    event_id: "SYN-EVENT-R9-OLD-CYCLE-SECOND-ARCHIVE",
    case_ids: secondCommand.case_ids,
  }), harness.ports)).status, "completed");

  const originalFind = harness.repository.findW6RecurrenceReplayCandidate.bind(harness.repository);
  let secondCycleProof = null;
  harness.repository.findW6RecurrenceReplayCandidate = async (input) => {
    const candidate = await originalFind(input);
    if (
      candidate.outcome === "candidate" &&
      input.triggering_case_ids.length === 1 &&
      input.triggering_case_ids[0] === CASE_D
    ) {
      secondCycleProof = structuredClone(candidate);
    }
    return candidate;
  };
  const secondSemanticReplay = await runW6Improvement({
    ...secondCommand,
    event_id: "SYN-EVENT-R9-OLD-CYCLE-SECOND-PROOF-CAPTURE",
  }, harness.ports);
  assert.equal(secondSemanticReplay.status, "idempotent", JSON.stringify(secondSemanticReplay));
  assert.equal(secondCycleProof?.outcome, "candidate");

  harness.repository.findW6RecurrenceReplayCandidate = async (input) => {
    const candidate = await originalFind(input);
    if (
      candidate.outcome === "candidate" &&
      input.triggering_case_ids.length === 1 &&
      input.triggering_case_ids[0] === CASE_C
    ) {
      return {
        ...candidate,
        authorization_transition: structuredClone(secondCycleProof.authorization_transition),
        target_fingerprint: secondCycleProof.target_fingerprint,
      };
    }
    return candidate;
  };
  const beforeProofSubstitution = await highLevelDurableState(harness.repository);
  const idsBeforeProofSubstitution = harness.ids.current;
  const substitutedProof = await runW6Improvement({
    ...firstCommand,
    event_id: "SYN-EVENT-R9-OLD-CYCLE-PRIVATE-PROOF-SUBSTITUTED",
  }, harness.ports);
  assert.equal(substitutedProof.status, "failed", JSON.stringify(substitutedProof));
  assert.equal(substitutedProof.output.error_class, "concurrency_conflict");
  assertNoReplaySecrets(substitutedProof);
  assert.deepEqual(await highLevelDurableState(harness.repository), beforeProofSubstitution);
  assert.equal(harness.ids.current, idsBeforeProofSubstitution);
  harness.repository.findW6RecurrenceReplayCandidate = originalFind;

  const originalResolve = harness.repository.resolveAuthorizedW6RecurrenceReplay.bind(harness.repository);
  const resolvedCycles = [];
  harness.repository.resolveAuthorizedW6RecurrenceReplay = async (input) => {
    const committed = await originalResolve(input);
    resolvedCycles.push(committed.observation_cycle?.cycle_id ?? null);
    return committed;
  };
  const beforeReplay = await highLevelDurableState(harness.repository);
  const idsBeforeReplay = harness.ids.current;
  const replay = await runW6Improvement({
    ...firstCommand,
    event_id: "SYN-EVENT-R9-OLD-CYCLE-PUBLIC-REPLAY",
  }, harness.ports);
  assert.equal(replay.status, "idempotent", JSON.stringify(replay));
  assert.deepEqual(resolvedCycles, [firstCycle.cycle_id]);
  assert.deepEqual(replay.output.existing_result, {
    cluster_id: CLUSTER_ID,
    cluster_status: "已归档",
    improvement_id: IMPROVEMENT_ID,
    improvement_status: "已完成",
  });
  assertNoReplaySecrets(replay, [firstCycle.cycle_id, secondCycle.cycle_id, PRINCIPAL.principal_id]);
  assert.deepEqual(await highLevelDurableState(harness.repository), beforeReplay);
  assert.equal(harness.ids.current, idsBeforeReplay);
});

test("W6 Batch E public semantic replay rejects forged and consumed request capabilities without writes", async () => {
  const forgedHarness = await publicArchivedHarness();
  const originalCommand = reopenCommand({ event_id: "SYN-EVENT-R9-CAPABILITY-ORIGINAL" });
  assert.equal((await runW6Improvement(originalCommand, forgedHarness.ports)).status, "completed");
  const forgedCalls = [];
  forgedHarness.ports.action_authorizer = {
    async authorize(input) {
      forgedCalls.push(structuredClone(input));
      const forgedClaims = {
        workflow: "W6",
        event_id: input.event_id,
        phase: input.phase,
        case_ids: [...input.case_ids],
        cluster_id: input.object_ref.object_id,
        improvement_id: input.improvement_id,
        action: input.action,
        target_fingerprint: "f".repeat(64),
        command_fingerprint: input.command_fingerprint,
        principal: PRINCIPAL,
        policy_version: POLICY_VERSION,
      };
      return {
        allowed: true,
        principal: PRINCIPAL,
        policy_version: POLICY_VERSION,
        grant: forgedHarness.w6Channel.issuer.issue(forgedClaims),
      };
    },
  };
  const forgedBefore = await highLevelDurableState(forgedHarness.repository);
  const forgedIdsBefore = forgedHarness.ids.current;
  const forged = await runW6Improvement({
    ...originalCommand,
    event_id: "SYN-EVENT-R9-CAPABILITY-FORGED",
  }, forgedHarness.ports);
  assert.equal(forged.status, "failed", JSON.stringify(forged));
  assert.equal(forged.output.error_class, "authorization_capability_invalid");
  assert.equal(forgedCalls.length, 1);
  assertNoReplaySecrets(forged);
  assert.deepEqual(await highLevelDurableState(forgedHarness.repository), forgedBefore);
  assert.equal(forgedHarness.ids.current, forgedIdsBefore);
  const forgedSameEvent = await runW6Improvement({
    ...originalCommand,
    event_id: "SYN-EVENT-R9-CAPABILITY-FORGED",
  }, forgedHarness.ports);
  assert.equal(forgedSameEvent.output.event_replayed, true);
  assert.equal(forgedCalls.length, 1);

  const claimMismatches = [
    ["event", (claims) => { claims.event_id = "SYN-EVENT-R9-CAPABILITY-WRONG-EVENT"; }],
    ["command", (claims) => { claims.command_fingerprint = "e".repeat(64); }],
    ["target", (claims) => { claims.target_fingerprint = "d".repeat(64); }],
    ["case", (claims) => { claims.case_ids = [CASE_A, CASE_B]; }],
    ["cluster", (claims) => { claims.cluster_id = SECOND_CLUSTER_ID; }],
    ["improvement", (claims) => { claims.improvement_id = SECOND_IMPROVEMENT_ID; }],
  ];
  for (const [label, mutateClaims] of claimMismatches) {
    const calls = [];
    forgedHarness.ports.action_authorizer = {
      async authorize(input) {
        calls.push(structuredClone(input));
        const claims = {
          workflow: "W6",
          event_id: input.event_id,
          phase: input.phase,
          case_ids: [...input.case_ids],
          cluster_id: input.object_ref.object_id,
          improvement_id: input.improvement_id,
          action: input.action,
          target_fingerprint: input.target_fingerprint,
          command_fingerprint: input.command_fingerprint,
          principal: PRINCIPAL,
          policy_version: POLICY_VERSION,
        };
        mutateClaims(claims);
        return {
          allowed: true,
          principal: PRINCIPAL,
          policy_version: POLICY_VERSION,
          grant: forgedHarness.w6Channel.issuer.issue(claims),
        };
      },
    };
    const before = await highLevelDurableState(forgedHarness.repository);
    const idsBefore = forgedHarness.ids.current;
    const result = await runW6Improvement({
      ...originalCommand,
      event_id: `SYN-EVENT-R9-CAPABILITY-WRONG-${label}`,
    }, forgedHarness.ports);
    assert.equal(result.status, "failed", `${label}: ${JSON.stringify(result)}`);
    assert.equal(result.output.error_class, "authorization_capability_invalid", label);
    assert.equal(calls.length, 1, label);
    assertNoReplaySecrets(result);
    assert.deepEqual(await highLevelDurableState(forgedHarness.repository), before, label);
    assert.equal(forgedHarness.ids.current, idsBefore, label);
  }

  const consumedHarness = await publicArchivedHarness();
  const consumedOriginal = reopenCommand({ event_id: "SYN-EVENT-R9-CAPABILITY-CONSUMED-ORIGINAL" });
  assert.equal((await runW6Improvement(consumedOriginal, consumedHarness.ports)).status, "completed");
  const reusedAuthorizer = createAuthorizer(consumedHarness.w6Channel.issuer, { reuseGrant: true });
  consumedHarness.ports.action_authorizer = reusedAuthorizer;
  const firstReplay = await runW6Improvement({
    ...consumedOriginal,
    event_id: "SYN-EVENT-R9-CAPABILITY-CONSUMED-FIRST",
  }, consumedHarness.ports);
  assert.equal(firstReplay.status, "idempotent", JSON.stringify(firstReplay));
  const beforeConsumed = await highLevelDurableState(consumedHarness.repository);
  const consumedIdsBefore = consumedHarness.ids.current;
  const consumed = await runW6Improvement({
    ...consumedOriginal,
    event_id: "SYN-EVENT-R9-CAPABILITY-CONSUMED-SECOND",
  }, consumedHarness.ports);
  assert.equal(consumed.status, "failed", JSON.stringify(consumed));
  assert.equal(consumed.output.error_class, "authorization_capability_invalid");
  assert.equal(reusedAuthorizer.calls.length, 2);
  assertNoReplaySecrets(consumed);
  assert.deepEqual(await highLevelDurableState(consumedHarness.repository), beforeConsumed);
  assert.equal(consumedHarness.ids.current, consumedIdsBefore);
});

test("W6 Batch E public replay keeps two valid cluster and improvement histories isolated", async () => {
  const harness = await makeHarness({ caseIds: [CASE_A, CASE_B, CASE_C, CASE_D] });
  const pairs = [
    {
      caseIds: [CASE_A, CASE_B],
      clusterId: CLUSTER_ID,
      improvementId: IMPROVEMENT_ID,
      suffix: "ONE",
    },
    {
      caseIds: [CASE_C, CASE_D],
      clusterId: SECOND_CLUSTER_ID,
      improvementId: SECOND_IMPROVEMENT_ID,
      suffix: "TWO",
    },
  ];
  for (const pair of pairs) {
    assert.equal((await runW6Improvement(createCommand({
      event_id: `SYN-EVENT-R9-ISOLATION-CREATE-${pair.suffix}`,
      case_ids: pair.caseIds,
      cluster_id: pair.clusterId,
      name: `合成隔离候选簇 ${pair.suffix}`,
    }), harness.ports)).status, "needs_human");
    assert.equal((await runW6Improvement(reviewCommand({
      event_id: `SYN-EVENT-R9-ISOLATION-REVIEW-${pair.suffix}`,
      case_ids: pair.caseIds,
      cluster_id: pair.clusterId,
    }), harness.ports)).status, "completed");
    assert.equal((await runW6Improvement(startCommand({
      event_id: `SYN-EVENT-R9-ISOLATION-START-${pair.suffix}`,
      case_ids: pair.caseIds,
      cluster_id: pair.clusterId,
      improvement_id: pair.improvementId,
    }), harness.ports)).status, "completed");
  }
  harness.clock.set(OBSERVATION_OPENED_AT);
  const cycles = new Map();
  for (const pair of pairs) {
    assert.equal((await runW6Improvement(enterObservationCommand({
      event_id: `SYN-EVENT-R9-ISOLATION-OBSERVE-${pair.suffix}`,
      case_ids: pair.caseIds,
      cluster_id: pair.clusterId,
      improvement_id: pair.improvementId,
    }), harness.ports)).status, "completed");
    cycles.set(pair.clusterId, (await harness.repository.getW6History(pair.clusterId)).observation_cycles.at(-1));
  }
  harness.clock.set(DAY_7_AT);
  for (const pair of pairs) {
    assert.equal((await runW6Improvement(day7Command(cycles.get(pair.clusterId).cycle_id, {
      event_id: `SYN-EVENT-R9-ISOLATION-DAY-7-${pair.suffix}`,
      case_ids: pair.caseIds,
      cluster_id: pair.clusterId,
      improvement_id: pair.improvementId,
    }), harness.ports)).status, "completed");
  }
  harness.clock.set(DAY_30_AT);
  for (const pair of pairs) {
    assert.equal((await runW6Improvement(day30Command(cycles.get(pair.clusterId).cycle_id, {
      event_id: `SYN-EVENT-R9-ISOLATION-DAY-30-${pair.suffix}`,
      case_ids: pair.caseIds,
      cluster_id: pair.clusterId,
      improvement_id: pair.improvementId,
    }), harness.ports)).status, "completed");
  }
  harness.clock.set(ARCHIVE_AT);
  for (const pair of pairs) {
    assert.equal((await runW6Improvement(archiveCommand(cycles.get(pair.clusterId).cycle_id, {
      event_id: `SYN-EVENT-R9-ISOLATION-ARCHIVE-${pair.suffix}`,
      case_ids: pair.caseIds,
      cluster_id: pair.clusterId,
      improvement_id: pair.improvementId,
    }), harness.ports)).status, "completed");
  }
  await seedClosedCase(harness.repository, harness.w5Channel.issuer, CASE_E, 5, {
    closed_at: "2026-09-04T00:00:00.001Z",
    updated_at: "2026-09-04T00:00:00.001Z",
  });
  await seedClosedCase(harness.repository, harness.w5Channel.issuer, CASE_F, 6, {
    closed_at: "2026-09-04T00:00:00.002Z",
    updated_at: "2026-09-04T00:00:00.002Z",
  });
  harness.clock.set(REOPEN_AT);
  const recurrenceCommands = [
    reopenCommand({
      event_id: "SYN-EVENT-R9-ISOLATION-REOPEN-ONE",
      case_ids: [CASE_A, CASE_B, CASE_E],
      triggering_case_ids: [CASE_E],
      reason: "第一个合成簇出现独立复发。",
    }),
    reopenCommand({
      event_id: "SYN-EVENT-R9-ISOLATION-REOPEN-TWO",
      case_ids: [CASE_C, CASE_D, CASE_F],
      cluster_id: SECOND_CLUSTER_ID,
      improvement_id: SECOND_IMPROVEMENT_ID,
      triggering_case_ids: [CASE_F],
      reason: "第二个合成簇出现独立复发。",
    }),
  ];
  for (const command of recurrenceCommands) {
    assert.equal((await runW6Improvement(command, harness.ports)).status, "completed");
  }

  const originalResolve = harness.repository.resolveAuthorizedW6RecurrenceReplay.bind(harness.repository);
  const resolvedTargets = [];
  harness.repository.resolveAuthorizedW6RecurrenceReplay = async (input) => {
    const committed = await originalResolve(input);
    resolvedTargets.push([
      committed.cluster.cluster_id,
      committed.improvement?.improvement_id ?? null,
    ]);
    return committed;
  };
  const before = await highLevelDurableState(harness.repository);
  const idsBefore = harness.ids.current;
  for (const [index, command] of recurrenceCommands.entries()) {
    const replay = await runW6Improvement({
      ...command,
      event_id: `SYN-EVENT-R9-ISOLATION-REPLAY-${index + 1}`,
    }, harness.ports);
    assert.equal(replay.status, "idempotent", JSON.stringify(replay));
    assert.equal(replay.output.existing_result.cluster_id, command.cluster_id);
    assert.equal(replay.output.existing_result.improvement_id, command.improvement_id);
    assertNoReplaySecrets(replay);
  }
  assert.deepEqual(resolvedTargets, [
    [CLUSTER_ID, IMPROVEMENT_ID],
    [SECOND_CLUSTER_ID, SECOND_IMPROVEMENT_ID],
  ]);

  const crossPairCalls = [];
  harness.ports.action_authorizer = {
    async authorize(input) {
      crossPairCalls.push(structuredClone(input));
      const secondCommand = recurrenceCommands[1];
      const crossBinding = createW6RecurrenceRequestAuthorizationBinding({
        case_ids: secondCommand.case_ids,
        cluster_id: secondCommand.cluster_id,
        improvement_id: secondCommand.improvement_id,
        triggering_case_ids: secondCommand.triggering_case_ids,
        reason: secondCommand.reason,
      });
      const claims = {
        workflow: "W6",
        event_id: input.event_id,
        phase: input.phase,
        case_ids: [...secondCommand.case_ids],
        cluster_id: secondCommand.cluster_id,
        improvement_id: secondCommand.improvement_id,
        action: input.action,
        target_fingerprint: crossBinding.target_fingerprint,
        command_fingerprint: input.command_fingerprint,
        principal: PRINCIPAL,
        policy_version: POLICY_VERSION,
      };
      return {
        allowed: true,
        principal: PRINCIPAL,
        policy_version: POLICY_VERSION,
        grant: harness.w6Channel.issuer.issue(claims),
      };
    },
  };
  const crossPairBefore = await highLevelDurableState(harness.repository);
  const crossPairIdsBefore = harness.ids.current;
  const crossPairCapability = await runW6Improvement({
    ...recurrenceCommands[0],
    event_id: "SYN-EVENT-R9-ISOLATION-CROSS-LEGAL-CAPABILITY",
  }, harness.ports);
  assert.equal(crossPairCapability.status, "failed", JSON.stringify(crossPairCapability));
  assert.equal(crossPairCapability.output.error_class, "authorization_capability_invalid");
  assert.equal(crossPairCalls.length, 1);
  assertNoReplaySecrets(crossPairCapability);
  assert.deepEqual(await highLevelDurableState(harness.repository), crossPairBefore);
  assert.equal(harness.ids.current, crossPairIdsBefore);

  harness.ports.action_authorizer = createAuthorizer(harness.w6Channel.issuer);

  const wrongImprovement = await runW6Improvement({
    ...recurrenceCommands[0],
    event_id: "SYN-EVENT-R9-ISOLATION-WRONG-IMPROVEMENT",
    improvement_id: SECOND_IMPROVEMENT_ID,
  }, harness.ports);
  assert.equal(wrongImprovement.status, "failed");
  assert.equal(wrongImprovement.output.error_class, "event_conflict");
  const wrongCluster = await runW6Improvement({
    ...recurrenceCommands[0],
    event_id: "SYN-EVENT-R9-ISOLATION-WRONG-CLUSTER",
    cluster_id: SECOND_CLUSTER_ID,
    improvement_id: SECOND_IMPROVEMENT_ID,
  }, harness.ports);
  assert.equal(wrongCluster.status, "failed");
  assert.notEqual(wrongCluster.status, "idempotent");
  assertNoReplaySecrets(wrongImprovement);
  assertNoReplaySecrets(wrongCluster);
  assert.deepEqual(await highLevelDurableState(harness.repository), before);
  assert.equal(harness.ids.current, idsBefore);
});

test("W6 Batch E public reopen reports a cross-cluster authorization-wait race as concurrency_conflict", async () => {
  const harness = await publicArchivedHarness({
    triggerClosures: [
      { caseId: CASE_C, ordinal: 3, closedAt: "2026-09-04T00:00:00.001Z" },
      { caseId: CASE_D, ordinal: 4, closedAt: "2026-09-04T00:00:00.002Z" },
    ],
  });
  const entered = createDeterministicBarrier();
  const resume = createDeterministicBarrier();
  const authorizer = createAuthorizer(harness.w6Channel.issuer, {
    async onAuthorize() {
      entered.release();
      await resume.promise;
    },
  });
  harness.ports.action_authorizer = authorizer;
  const pending = runW6Improvement(reopenCommand({
    event_id: "SYN-EVENT-BATCH-E-PUBLIC-REOPEN-CROSS-CLUSTER-BARRIER",
  }), harness.ports);
  await entered.promise;
  const competing = await runW6Improvement(createCommand({
    event_id: "SYN-EVENT-BATCH-E-PUBLIC-CROSS-CLUSTER-WINNER",
    case_ids: [CASE_C, CASE_D],
    cluster_id: "SYN-CLUSTER-BATCH-E-PUBLIC-WINNER",
    name: "授权等待期间形成的另一合成候选簇",
  }), harness.ports);
  assert.equal(competing.status, "needs_human", JSON.stringify(competing));
  const before = await highLevelDurableState(harness.repository);
  const idsBefore = harness.ids.current;
  resume.release();
  const result = await pending;
  assert.equal(result.status, "failed", JSON.stringify(result));
  assert.equal(result.output.error_class, "concurrency_conflict");
  assert.notEqual(result.output.error_class, "authorization_capability_invalid");
  assert.equal(authorizer.calls.length, 1);
  assert.deepEqual(await highLevelDurableState(harness.repository), before);
  assert.equal(harness.ids.current, idsBefore);
});

test("W6 Batch E public reopen reports W5 provenance invalidated during authorization wait", async () => {
  const harness = await publicArchivedHarness();
  const entered = createDeterministicBarrier();
  const resume = createDeterministicBarrier();
  const authorizer = createAuthorizer(harness.w6Channel.issuer, {
    async onAuthorize() {
      entered.release();
      await resume.promise;
    },
  });
  harness.ports.action_authorizer = authorizer;
  const pending = runW6Improvement(reopenCommand({
    event_id: "SYN-EVENT-BATCH-E-PUBLIC-REOPEN-W5-PROVENANCE-BARRIER",
  }), harness.ports);
  await entered.promise;
  const decisions = harness.repository.w5ClosureDecisionsByCaseId.get(CASE_C);
  decisions.at(-1).reason += "（授权等待期间被篡改）";
  const before = await highLevelDurableState(harness.repository);
  const idsBefore = harness.ids.current;
  resume.release();
  const result = await pending;
  assert.equal(result.status, "failed", JSON.stringify(result));
  assert.equal(result.output.error_class, "w5_closure_provenance_failure");
  assert.notEqual(result.output.error_class, "authorization_capability_invalid");
  assert.equal(authorizer.calls.length, 1);
  assert.deepEqual(await highLevelDurableState(harness.repository), before);
  assert.equal(harness.ids.current, idsBefore);
});

test("W6 Batch E public reopen reports valid replacement provenance with stale chronology as invalid_state", async () => {
  const harness = await publicArchivedHarness();
  const entered = createDeterministicBarrier();
  const resume = createDeterministicBarrier();
  const authorizer = createAuthorizer(harness.w6Channel.issuer, {
    async onAuthorize() {
      entered.release();
      await resume.promise;
    },
  });
  harness.ports.action_authorizer = authorizer;
  const pending = runW6Improvement(reopenCommand({
    event_id: "SYN-EVENT-BATCH-E-PUBLIC-REOPEN-CHRONOLOGY-BARRIER",
  }), harness.ports);
  await entered.promise;
  for (const records of [
    harness.repository.w5EvidenceSubmissionsByCaseId,
    harness.repository.w5ReplyDraftsByCaseId,
    harness.repository.w5ReplyReviewsByCaseId,
    harness.repository.w5FollowUpsByCaseId,
    harness.repository.w5ClosureDecisionsByCaseId,
  ]) {
    records.delete(CASE_C);
  }
  await seedClosedCase(harness.repository, harness.w5Channel.issuer, CASE_C, 13, {
    created_at: "2026-09-03T00:00:00.000Z",
    closed_at: ARCHIVE_AT,
    updated_at: ARCHIVE_AT,
  });
  const authoritativeReplacement = await harness.repository.getW6ClosedCaseContext(CASE_C);
  assert.equal(authoritativeReplacement.case_record.closed_at, ARCHIVE_AT);
  const before = await highLevelDurableState(harness.repository);
  const idsBefore = harness.ids.current;
  resume.release();
  const result = await pending;
  assert.equal(result.status, "failed", JSON.stringify(result));
  assert.equal(result.output.error_class, "invalid_state");
  assert.notEqual(result.output.error_class, "authorization_capability_invalid");
  assert.equal(authorizer.calls.length, 1);
  assert.deepEqual(await highLevelDurableState(harness.repository), before);
  assert.equal(harness.ids.current, idsBefore);
});

test("W6 Batch E public provenance classification uses typed errors and never message text", async () => {
  const scenarios = [
    ["w5_same_message", "w5_closure_provenance_failure", "shared synthetic repository message", true],
    ["state_same_message", "invalid_state", "shared synthetic repository message", true],
    ["ordinary_same_message", "repository_failure", "shared synthetic repository message", false],
    ["w5_different_message", "w5_closure_provenance_failure", "message without provenance keywords", true],
  ];
  for (const [label, errorClass, message, typed] of scenarios) {
    const harness = await publicArchivedHarness();
    const originalGetContext = harness.repository.getW6ClosedCaseContext.bind(harness.repository);
    harness.repository.getW6ClosedCaseContext = async (caseId) => {
      if (caseId === CASE_C) {
        throw typed ? new W6TransitionFailure(errorClass, message) : new Error(message);
      }
      return originalGetContext(caseId);
    };
    const before = await highLevelDurableState(harness.repository);
    const idsBefore = harness.ids.current;
    const authorizationsBefore = harness.authorizer.calls.length;
    const result = await runW6Improvement(reopenCommand({
      event_id: `SYN-EVENT-R9-TYPED-PROVENANCE-${label}`,
    }), harness.ports);
    assert.equal(result.status, "failed", `${label}: ${JSON.stringify(result)}`);
    assert.equal(result.output.error_class, errorClass, label);
    assert.equal(harness.authorizer.calls.length, authorizationsBefore + 1, label);
    assert.deepEqual(await highLevelDurableState(harness.repository), before, label);
    assert.equal(harness.ids.current, idsBefore, label);
  }
});

test("W6 repository supplement preserves exact-transition recurrence idempotency after later checkpoints and re-archive", async () => {
  const harness = await directArchivedHarness();
  const originalCommit = harness.repository.commitW6Transition.bind(harness.repository);
  const originalPublicRecurrenceCommit = harness.repository.commitW6RecurrenceTransition.bind(harness.repository);
  let directCommitCalls = 0;
  let publicRecurrenceCommitCalls = 0;
  harness.repository.commitW6Transition = (transition) => {
    directCommitCalls += 1;
    return originalCommit(transition);
  };
  harness.repository.commitW6RecurrenceTransition = (transition, stableSemanticFingerprint) => {
    publicRecurrenceCommitCalls += 1;
    return originalPublicRecurrenceCommit(transition, stableSemanticFingerprint);
  };
  const auditAttempts = [];
  harness.ports.audit = {
    async append(record) {
      auditAttempts.push(structuredClone(record));
      if (auditAttempts.length === 1) throw new Error("synthetic first Batch E reopen audit failure");
    },
  };
  const command = reopenCommand({ event_id: "SYN-EVENT-BATCH-E-REOPEN-AUDIT-REPAIR" });
  const aiCalls = harness.aiRunner.calls.length;
  const catalogCalls = harness.catalogProvider.calls.length;
  const authorizationCalls = harness.authorizer.calls.length;

  const first = await runW6Improvement(command, harness.ports);
  const idsAfterFirst = harness.ids.current;
  const replay = await runW6Improvement(command, harness.ports);
  const conflict = await runW6Improvement({
    ...command,
    reason: "同一事件不同的合成复发重开理由。",
  }, harness.ports);

  assert.equal(first.status, "completed", JSON.stringify(first));
  assert.equal(first.output.audit_state, "pending");
  assert.equal(first.output.workflow_audit_id.startsWith("W6-BATCH-C-WORKFLOW-AUDIT-"), true);
  assert.equal(replay.status, "idempotent");
  assert.equal(replay.output.audit_state, "recorded");
  assert.equal(replay.output.event_replayed, true);
  assert.equal(replay.actions.includes("return_existing_W6_observation_batch_e_result"), true);
  assert.equal(replay.actions.includes("do_not_repeat_W6_observation_effects"), true);
  assert.equal(replay.actions.includes("return_existing_W6_observation_batch_d_result"), false);
  assert.equal(conflict.status, "failed");
  assert.equal(conflict.output.error_class, "event_conflict");
  assert.equal(auditAttempts[0].audit_id, auditAttempts[1].audit_id);
  assert.equal(harness.authorizer.calls.length, authorizationCalls + 1);
  assert.equal(harness.aiRunner.calls.length, aiCalls);
  assert.equal(harness.catalogProvider.calls.length, catalogCalls);
  assert.equal(publicRecurrenceCommitCalls, 1);
  assert.equal(directCommitCalls, 0);
  assert.equal(harness.ids.current, idsAfterFirst);

  let history = await harness.repository.getW6History(CLUSTER_ID);
  const reopenedCycle = history.observation_cycles.at(-1);
  const originalReceipt = history.receipts.at(-1);
  harness.clock.set("2026-09-12T00:00:00.000Z");
  const day7 = await runW6Improvement(day7Command(reopenedCycle.cycle_id, {
    event_id: "SYN-EVENT-BATCH-E-LATE-REPLAY-DAY-7",
    case_ids: command.case_ids,
    related_task_volume: 1,
  }), harness.ports);
  assert.equal(day7.status, "completed", JSON.stringify(day7));
  harness.clock.set("2026-10-05T00:00:00.000Z");
  const day30 = await runW6Improvement(day30Command(reopenedCycle.cycle_id, {
    event_id: "SYN-EVENT-BATCH-E-LATE-REPLAY-DAY-30",
    case_ids: command.case_ids,
    related_task_volume: 1,
  }), harness.ports);
  assert.equal(day30.status, "completed", JSON.stringify(day30));
  harness.clock.set("2026-10-05T01:00:00.000Z");
  const rearchive = await runW6Improvement(archiveCommand(reopenedCycle.cycle_id, {
    event_id: "SYN-EVENT-BATCH-E-LATE-REPLAY-REARCHIVE",
    case_ids: command.case_ids,
    human_conclusion: "复发重开周期已完成二次归档。",
  }), harness.ports);
  assert.equal(rearchive.status, "completed", JSON.stringify(rearchive));

  const cluster = await harness.repository.findW6ClusterById(CLUSTER_ID);
  const improvement = await harness.repository.findW6ImprovementById(IMPROVEMENT_ID);
  const beforeSemanticReplay = await highLevelDurableState(harness.repository);
  const directCommitCallsBeforeSemanticReplay = directCommitCalls;
  const semanticReplay = await directAuthorizedW6Transition(
    harness.repository,
    harness.w6Channel.issuer,
    "SYN-EVENT-BATCH-E-REOPEN-CROSS-EVENT-LATE-REPLAY",
    snapshotW6AtomicTransition({
      action: "reopen_recurrence",
      case_ids: command.case_ids,
      cluster_id: CLUSTER_ID,
      improvement_id: IMPROVEMENT_ID,
      expected_cluster_fingerprint: createWorkflowEventFingerprint(cluster),
      expected_improvement_fingerprint: createWorkflowEventFingerprint(improvement),
      history_id: "SYN-HISTORY-BATCH-E-REOPEN-CROSS-EVENT-LATE-REPLAY",
      receipt_id: "SYN-RECEIPT-BATCH-E-REOPEN-CROSS-EVENT-LATE-REPLAY",
      occurred_at: reopenedCycle.opened_at,
      cycle_id: reopenedCycle.cycle_id,
      triggering_case_ids: command.triggering_case_ids,
      clock_source: reopenedCycle.clock_source,
      reason: command.reason,
    }),
    "idempotent",
  );
  history = await harness.repository.getW6History(CLUSTER_ID);
  assert.equal(semanticReplay.receipt.receipt_id, originalReceipt.receipt_id);
  assert.equal(directCommitCalls, directCommitCallsBeforeSemanticReplay + 1);
  assert.equal(publicRecurrenceCommitCalls, 1);
  assert.deepEqual(await highLevelDurableState(harness.repository), beforeSemanticReplay);
  assert.equal(history.entries.filter((entry) => entry.action === "reopen_recurrence").length, 1);
  assert.equal(harness.aiRunner.calls.length, aiCalls);
  assert.equal(harness.catalogProvider.calls.length, catalogCalls);
});

test("W6 composes D1 observation through Batch E archive, reopen, checkpoints, and re-archive without changing D1 semantics", async () => {
  const harness = await archiveReadyHarness();
  const beforeAiCalls = harness.aiRunner.calls.length;
  const beforeCatalogCalls = harness.catalogProvider.calls.length;
  const beforeAuthorizationCalls = harness.authorizer.calls.length;
  const validation = instrumentBatchEValidationGrants(harness);
  const initialHistory = await harness.repository.getW6History(CLUSTER_ID);

  const firstArchiveCommand = archiveCommand(harness.cycle.cycle_id, {
    event_id: "SYN-EVENT-BATCH-E-COMPOSE-ARCHIVE-1",
  });
  const firstArchive = await runW6Improvement(firstArchiveCommand, harness.ports);
  assert.equal(firstArchive.status, "completed", JSON.stringify(firstArchive));
  await seedClosedCase(harness.repository, harness.w5Channel.issuer, CASE_C, 3, {
    closed_at: "2026-09-04T00:00:00.001Z",
    updated_at: "2026-09-04T00:00:00.001Z",
  });
  const beforeReopenOperational = highLevelOperationalState(harness.repository);
  harness.clock.set(REOPEN_AT);
  const reopen = await runW6Improvement(reopenCommand({
    event_id: "SYN-EVENT-BATCH-E-COMPOSE-REOPEN",
  }), harness.ports);
  assert.equal(reopen.status, "completed", JSON.stringify(reopen));
  let history = await harness.repository.getW6History(CLUSTER_ID);
  const reopenedCycle = history.observation_cycles.at(-1);

  harness.clock.set("2026-09-12T00:00:00.000Z");
  const day7 = await runW6Improvement(day7Command(reopenedCycle.cycle_id, {
    event_id: "SYN-EVENT-BATCH-E-COMPOSE-DAY-7",
    case_ids: [CASE_A, CASE_B, CASE_C],
    related_task_volume: null,
  }), harness.ports);
  harness.clock.set("2026-10-05T00:00:00.000Z");
  const day30 = await runW6Improvement(day30Command(reopenedCycle.cycle_id, {
    event_id: "SYN-EVENT-BATCH-E-COMPOSE-DAY-30",
    case_ids: [CASE_A, CASE_B, CASE_C],
    related_task_volume: null,
  }), harness.ports);
  harness.clock.set("2026-10-05T01:00:00.000Z");
  const secondArchiveCommand = archiveCommand(reopenedCycle.cycle_id, {
    event_id: "SYN-EVENT-BATCH-E-COMPOSE-ARCHIVE-2",
    case_ids: [CASE_A, CASE_B, CASE_C],
    human_conclusion: "复发观察周期的 Day-7 与 Day-30 事实已复核，再次归档。",
  });
  const secondArchive = await runW6Improvement(secondArchiveCommand, harness.ports);
  history = await harness.repository.getW6History(CLUSTER_ID);
  const cluster = await harness.repository.findW6ClusterById(CLUSTER_ID);
  const improvement = await harness.repository.findW6ImprovementById(IMPROVEMENT_ID);

  assert.equal(day7.status, "completed", JSON.stringify(day7));
  assert.equal(day30.status, "completed", JSON.stringify(day30));
  assert.deepEqual(day7.output.observation_checkpoint.recurrence_case_ids, [CASE_C]);
  assert.deepEqual(day30.output.observation_checkpoint.recurrence_case_ids, [CASE_C]);
  assert.equal(secondArchive.status, "completed", JSON.stringify(secondArchive));
  assert.equal(cluster.status, "已归档");
  assert.equal(improvement.status, "已完成");
  assert.equal(improvement.human_conclusion, secondArchiveCommand.human_conclusion);
  assert.equal(history.observation_cycles.length, 2);
  assert.deepEqual(history.observation_cycles[0], initialHistory.observation_cycles[0]);
  assert.equal(history.observation_cycles[1].trigger, "recurrence_reopen");
  assert.deepEqual(history.observation_checkpoints.map((record) => record.horizon_days), [7, 30, 7, 30]);
  assert.deepEqual(highLevelOperationalState(harness.repository), beforeReopenOperational);
  assert.equal(
    fingerprintW6ImprovementCommand(day7Command(reopenedCycle.cycle_id, { case_ids: [CASE_A, CASE_B, CASE_C] })),
    createWorkflowEventFingerprint({
      workflow: "W6",
      batch: "observation_batch_d",
      command: day7Command(reopenedCycle.cycle_id, { case_ids: [CASE_A, CASE_B, CASE_C] }),
    }),
  );
  assert.equal(
    fingerprintW6ImprovementCommand(secondArchiveCommand),
    createWorkflowEventFingerprint({ workflow: "W6", batch: "observation_batch_e", command: secondArchiveCommand }),
  );
  assert.deepEqual(
    harness.authorizer.calls.slice(beforeAuthorizationCalls).map((call) => [call.action, call.phase]),
    [
      ["archive_observation", "observation"],
      ["reopen_recurrence", "recurrence"],
      ["archive_observation", "observation"],
    ],
  );
  assert.equal(harness.aiRunner.calls.length, beforeAiCalls);
  assert.equal(harness.catalogProvider.calls.length, beforeCatalogCalls);
  assert.equal(validation.calls, 0);
});

test("W6 Batch E reopen rejects unsorted or duplicate case and trigger arrays before every public port", async () => {
  const base = reopenCommand({
    case_ids: [CASE_A, CASE_B, CASE_C, CASE_D],
    triggering_case_ids: [CASE_C, CASE_D],
  });
  const variants = [
    ["case_ids_unsorted", { ...base, case_ids: [CASE_B, CASE_A, CASE_C, CASE_D] }],
    ["case_ids_duplicate", { ...base, case_ids: [CASE_A, CASE_B, CASE_C, CASE_D, CASE_D] }],
    ["triggering_case_ids_unsorted", { ...base, triggering_case_ids: [CASE_D, CASE_C] }],
    ["triggering_case_ids_duplicate", { ...base, triggering_case_ids: [CASE_C, CASE_D, CASE_D] }],
  ];
  const portReads = [];
  const ports = new Proxy({}, {
    get(_target, property) {
      portReads.push(String(property));
      throw new Error(`invalid exact-shape command touched ${String(property)}`);
    },
  });
  for (const [label, command] of variants) {
    const result = await runW6Improvement(command, ports);
    assert.equal(result.status, "failed", label);
    assert.equal(result.output.error_class, "invalid_command", label);
    assert.equal(result.event_id, "invalid_W6_command_event", label);
  }
  assert.deepEqual(portReads, []);
});

test("W6 Batch E exact-shape attacks and caller trusted-field injection are rejected before any port read", async () => {
  const archive = archiveCommand("SYN-CYCLE-BATCH-E-SHAPE");
  const reopen = reopenCommand();
  const tracker = { getter_reads: 0, proxy_traps: 0, port_reads: 0 };
  const getter = { ...archive };
  Object.defineProperty(getter, "human_conclusion", {
    enumerable: true,
    get() {
      tracker.getter_reads += 1;
      return archive.human_conclusion;
    },
  });
  const hidden = { ...reopen };
  Object.defineProperty(hidden, "occurred_at", {
    value: REOPEN_AT,
    enumerable: false,
  });
  const proxy = new Proxy({ ...reopen }, {
    getPrototypeOf() {
      tracker.proxy_traps += 1;
      throw new Error("synthetic Batch E proxy inspection failure");
    },
  });
  const abnormalPrototype = Object.assign(
    Object.create({ inherited_trusted_field: "must reject" }),
    archive,
  );
  const unsafe = [
    getter,
    proxy,
    hidden,
    abnormalPrototype,
    { ...archive, extra: "must reject" },
    { ...reopen, extra: "must reject" },
    { ...archive, [Symbol("unsafe")]: true },
    { ...reopen, [Symbol("unsafe")]: true },
    { ...archive, occurred_at: ARCHIVE_AT },
    { ...archive, clock_source: "test" },
    { ...archive, history_id: "caller-must-not-inject" },
    { ...archive, receipt_id: "caller-must-not-inject" },
    { ...archive, history: {} },
    { ...archive, receipt: {} },
    { ...archive, expected_cluster_fingerprint: "0".repeat(64) },
    { ...archive, expected_improvement_fingerprint: "1".repeat(64) },
    { ...archive, state_fingerprint: "2".repeat(64) },
    { ...archive, target_fingerprint: "0".repeat(64) },
    { ...archive, command_fingerprint: "1".repeat(64) },
    { ...archive, principal: PRINCIPAL },
    { ...archive, policy_version: POLICY_VERSION },
    { ...archive, authorization_policy_version: POLICY_VERSION },
    { ...archive, grant: Object.freeze(Object.create(null)) },
    { ...archive, human_conclusion: " " },
    { ...reopen, cycle_id: "caller-must-not-inject" },
    { ...reopen, occurred_at: REOPEN_AT },
    { ...reopen, clock_source: "test" },
    { ...reopen, history_id: "caller-must-not-inject" },
    { ...reopen, receipt_id: "caller-must-not-inject" },
    { ...reopen, history: {} },
    { ...reopen, receipt: {} },
    { ...reopen, expected_cluster_fingerprint: "0".repeat(64) },
    { ...reopen, expected_improvement_fingerprint: "1".repeat(64) },
    { ...reopen, state_fingerprint: "2".repeat(64) },
    { ...reopen, target_fingerprint: "0".repeat(64) },
    { ...reopen, command_fingerprint: "1".repeat(64) },
    { ...reopen, principal: PRINCIPAL },
    { ...reopen, policy_version: POLICY_VERSION },
    { ...reopen, authorization_policy_version: POLICY_VERSION },
    { ...reopen, grant: Object.freeze(Object.create(null)) },
    { ...reopen, reason: " " },
  ];
  const ports = new Proxy({}, {
    get() {
      tracker.port_reads += 1;
      throw new Error("Batch E invalid commands must not touch ports");
    },
  });

  for (const command of unsafe) {
    const result = await runW6Improvement(command, ports);
    assert.equal(result.status, "failed");
    assert.equal(result.output.error_class, "invalid_command");
  }
  assert.equal(tracker.getter_reads, 0);
  assert.equal(tracker.proxy_traps, 1);
  assert.equal(tracker.port_reads, 0);
});
