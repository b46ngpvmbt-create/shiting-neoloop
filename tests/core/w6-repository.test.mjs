import assert from "node:assert/strict";
import test from "node:test";

import { importBuilt } from "./_runtime.mjs";

const ai = await importBuilt("src/neoloop/ai/index.js");
const domain = await importBuilt("src/neoloop/domain/index.js");
const workflows = await importBuilt("src/neoloop/workflows/index.js");

const {
  createAiInputHash,
} = ai;
const {
  InvalidStateTransitionError,
  transitionCluster,
  transitionImprovement,
} = domain;
const {
  InMemoryFrontHalfRepository,
  createW5AuthorizationGrantChannel,
  createW6AuthorizationBinding,
  createW6AuthorizationGrantChannel,
  createW6N5ValidationFingerprint,
  createWorkflowEventFingerprint,
  snapshotW6AtomicTransition,
} = workflows;

const CASE_A = "SYN-CASE-W6-A";
const CASE_B = "SYN-CASE-W6-B";
const CASE_C = "SYN-CASE-W6-C";
const CASE_D = "SYN-CASE-W6-D";
const CLUSTER_ID = "SYN-CLUSTER-W6-001";
const IMPROVEMENT_ID = "SYN-IMPROVEMENT-W6-001";
const PRINCIPAL = {
  principal_id: "SYN-PRINCIPAL-PROBLEM-OWNER",
  principal_type: "synthetic_human",
  canonical_role: "合成问题负责人",
  authority_source: "synthetic_allowlist",
};
const POLICY_VERSION = "synthetic-w6-allowlist-v1";
const SOURCE_HASH = "c".repeat(64);
const T0 = "2026-08-01T00:00:00.000Z";
const OBSERVATION_OPENED_AT = "2026-08-02T00:00:00.000Z";
const DAY_7_AT = "2026-08-09T00:00:00.000Z";
const DAY_30_AT = "2026-09-01T00:00:00.000Z";
const N6_CATALOG = [{
  hypothesis_id: "HYP-DOOR-BATCH",
  factor_label: "部件批次差异",
  phenomenon_label: "舱门解锁异常",
  uncertainty_options: [
    { uncertainty_id: "UNC-SAMPLE-SIZE", label: "样本量有限" },
    { uncertainty_id: "UNC-INSPECTION", label: "缺少拆检记录" },
  ],
}];

function closedCase(caseId, ordinal, overrides = {}) {
  return {
    schema_version: "1.0.0-draft.2",
    data_scope: "synthetic_experiment",
    evidence_class: "synthetic_experiment",
    created_at: `2026-07-${String(20 + ordinal).padStart(2, "0")}T00:00:00.000Z`,
    updated_at: `2026-07-${String(21 + ordinal).padStart(2, "0")}T00:00:00.000Z`,
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
      vehicle_ids: [`SYN-VEHICLE-W6-${ordinal}`],
      task_ids: [`SYN-TASK-W6-${ordinal}`],
      station_names: [`SYN-STATION-W6-${ordinal}`],
      confidence: 0.9,
    },
    formal_entity: {
      vehicle_id: `SYN-VEHICLE-W6-${ordinal}`,
      task_id: `SYN-TASK-W6-${ordinal}`,
      station_id: `SYN-STATION-W6-${ordinal}`,
    },
    formal_entity_confirmation_status: "已人工确认",
    evidence_completeness: "complete",
    evidence_summary: "合成处置证据、回访与结案已经人工审核。",
    sla_started_at: "2026-07-20T00:00:00.000Z",
    sla_due_at: "2026-07-20T00:30:00.000Z",
    sla_rule_version: "SYN-SLA-v1",
    candidate_generation_mode: "AI",
    suggested_team: "车辆运维",
    routing_rule_candidate_id: `SYN-ROUTING-W6-${ordinal}`,
    cluster_id: null,
    pending_confirmation_items: [],
    closed_at: `2026-07-${String(21 + ordinal).padStart(2, "0")}T00:00:00.000Z`,
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
  const feedbackId = `SYN-FEEDBACK-W6-${ordinal}`;
  const idempotencyKey = `competition-synthetic:w6:${feedbackId}`;
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
      source_record_id: `SYN-SOURCE-W6-${ordinal}`,
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
    work_order_id: `SYN-WORK-W6-${ordinal}`,
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
    source_locator: `work_order:SYN-WORK-W6-${ordinal}`,
    source_sha256: SOURCE_HASH,
  };
}

function w5SeedAuthorizationBinding(transition) {
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

async function commitSeedW5Transition(repository, grantIssuer, transition) {
  const binding = w5SeedAuthorizationBinding(transition);
  const eventId = binding.authorization_record.event_id;
  const command = {
    workflow: "W5",
    event_id: eventId,
    transition: transition.transition,
    case_id: transition.expected_case.case_id,
    work_order_id: transition.expected_work_order.work_order_id,
    target: binding.target,
  };
  const commandFingerprint = createWorkflowEventFingerprint(command);
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
        policy_version: "synthetic-w5-allowlist-v1",
      };
      const grant = grantIssuer.issue(claims);
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

async function seedClosedCase(
  repository,
  w5GrantIssuer,
  caseId,
  ordinal,
  caseOverrides = {},
  closureOverrides = {},
) {
  const finalCase = closedCase(caseId, ordinal, caseOverrides);
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
    submission_id: `SYN-W6-W5-EVIDENCE-${ordinal}`,
    event_id: `SYN-W6-W5-EVIDENCE-EVENT-${ordinal}`,
    case_id: caseId,
    work_order_id: workOrder.work_order_id,
    kind: "closure_request",
    replaces_submission_id: null,
    source_ref: `case:${caseId}`,
    text: "合成处置证据已完成复核。",
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
    authorization_policy_version: "synthetic-w5-allowlist-v1",
    submitted_at: at(3),
  };
  const draft = {
    draft_id: `SYN-W6-W5-DRAFT-${ordinal}`,
    event_id: evidence.event_id,
    case_id: caseId,
    work_order_id: workOrder.work_order_id,
    node_run_id: `SYN-W6-W5-N7-RUN-${ordinal}`,
    node_version: "N7-1.0.0-draft.2",
    input_hash: "e".repeat(64),
    draft_kind: "customer_reply",
    draft: "合成回复草稿，仅供人工审核与手动发送。",
    citations: [{
      knowledge_id: "SYN-KNOWLEDGE-W6-001",
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
  let committed = await commitSeedW5Transition(repository, w5GrantIssuer, {
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
    review_id: `SYN-W6-W5-REVIEW-${ordinal}`,
    event_id: `SYN-W6-W5-REVIEW-EVENT-${ordinal}`,
    case_id: caseId,
    work_order_id: workOrder.work_order_id,
    draft_id: draft.draft_id,
    decision: "approve_for_manual_delivery",
    reason: "合成授权人员确认回复草稿可手动发送。",
    manual_delivery_reference: `synthetic:manual-delivery:${ordinal}`,
    principal: PRINCIPAL,
    authorization_policy_version: "synthetic-w5-allowlist-v1",
    decided_at: at(2),
  };
  nextCase = {
    ...caseRecord,
    status: "待回访",
    updated_at: at(2),
    workflow_readiness: "awaiting_follow_up",
  };
  nextWorkOrder = { ...workOrder, updated_at: at(2) };
  committed = await commitSeedW5Transition(repository, w5GrantIssuer, {
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
    follow_up_id: `SYN-W6-W5-FOLLOW-UP-${ordinal}`,
    event_id: `SYN-W6-W5-FOLLOW-UP-EVENT-${ordinal}`,
    case_id: caseId,
    work_order_id: workOrder.work_order_id,
    outcome: "resolved",
    summary: "合成回访已确认问题解决。",
    follow_up_reference: `synthetic:follow-up:${ordinal}`,
    principal: PRINCIPAL,
    authorization_policy_version: "synthetic-w5-allowlist-v1",
    recorded_at: at(1),
  };
  nextCase = {
    ...caseRecord,
    updated_at: at(1),
    workflow_readiness: "awaiting_closure_decision",
  };
  nextWorkOrder = { ...workOrder, updated_at: at(1) };
  committed = await commitSeedW5Transition(repository, w5GrantIssuer, {
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
    decision_id: `SYN-W6-W5-CLOSURE-${ordinal}`,
    event_id: `SYN-W6-W5-CLOSURE-EVENT-${ordinal}`,
    case_id: caseId,
    work_order_id: workOrder.work_order_id,
    decision: "close",
    reason: "合成授权人员确认完整链路后关闭案件。",
    principal: PRINCIPAL,
    authorization_policy_version: "synthetic-w5-allowlist-v1",
    decided_at: closureOverrides.decided_at ?? closedAt,
  };
  nextCase = { ...finalCase };
  nextWorkOrder = {
    ...workOrder,
    status: "已完成",
    validation_result: "passed",
    completed_at: closedAt,
    updated_at: closedAt,
  };
  committed = await commitSeedW5Transition(repository, w5GrantIssuer, {
    transition: "closure_closed",
    expected_case: caseRecord,
    expected_work_order: workOrder,
    next_case: nextCase,
    next_work_order: nextWorkOrder,
    append: { closure_decision: closure },
  });

  await repository.insertSameEventCheckIfAbsent({
    check_id: `SYN-W6-SAME-EVENT-CHECK-${ordinal}`,
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
  return { case: committed.case, work_order: committed.work_order, history: committed.history, feedback };
}

async function makeHarness({ caseIds = [CASE_A, CASE_B], caseOverridesById = {} } = {}) {
  const w5GrantChannel = createW5AuthorizationGrantChannel();
  const grantChannel = createW6AuthorizationGrantChannel();
  const repository = new InMemoryFrontHalfRepository({
    w5_authorization_grant_consumer: w5GrantChannel.consumer,
    w6_authorization_grant_consumer: grantChannel.consumer,
    approved_n6_catalog: N6_CATALOG,
  });
  for (const [index, caseId] of caseIds.entries()) {
    await seedClosedCase(
      repository,
      w5GrantChannel.issuer,
      caseId,
      index + 1,
      caseOverridesById[caseId] ?? {},
    );
  }
  return { repository, grantChannel, w5GrantChannel };
}

function n5Request(repository, caseIds = [CASE_A, CASE_B]) {
  const records = caseIds.map((caseId) => repository.casesById.get(caseId));
  const toFact = (record) => ({
    case_id: record.case_id,
    status: record.status,
    workflow_readiness: record.workflow_readiness,
    summary: record.summary,
    same_event_resolution: "not_required",
    cluster_id: record.cluster_id,
  });
  const toTime = (record) => ({ case_id: record.case_id, closed_at: record.closed_at });
  const toEntity = (record) => ({ case_id: record.case_id, formal_entity: structuredClone(record.formal_entity) });
  const toSource = (record) => ({ case_id: record.case_id, source_ref: `case:${record.case_id}` });
  return {
    node: "N5",
    mode: "cross_event_clustering",
    version: "N5-cross-event-1.0.0-draft.2",
    object_ref: { object_type: "case", object_id: records[0].case_id },
    input: {
      case_facts: { current: toFact(records[0]), candidates: records.slice(1).map(toFact) },
      time: { current: toTime(records[0]), candidates: records.slice(1).map(toTime) },
      confirmed_entities: { current: toEntity(records[0]), candidates: records.slice(1).map(toEntity) },
      source_reference: { current: toSource(records[0]), candidates: records.slice(1).map(toSource) },
    },
  };
}

function n5Envelope(repository, caseIds = [CASE_A, CASE_B], overrides = {}) {
  const request = n5Request(repository, caseIds);
  const records = caseIds.map((caseId) => repository.casesById.get(caseId));
  const evidenceSpans = records.map((record) => ({
    source_ref: `case:${record.case_id}`,
    quote: record.summary,
  }));
  return {
    request,
    envelope: {
      node: "N5",
      mode: "cross_event_clustering",
      version: "N5-cross-event-1.0.0-draft.2",
      run_id: "SYN-AI-RUN-W6-N5-001",
      object_ref: structuredClone(request.object_ref),
      input_hash: createAiInputHash(request),
      payload: {
        cluster_candidate: {
          candidate_kind: "new_cluster",
          suggested_cluster_id: null,
          member_cases: records.map((record, index) => ({
            case_id: record.case_id,
            evidence_span_indices: [index],
          })),
          similarity: 0.88,
        },
        human_review_required: true,
        automatic_merge: false,
        automatic_case_relink: false,
      },
      evidence_spans: evidenceSpans,
      missing_fields: [],
      confidence: 0.88,
      status: "ok",
      validation: { valid: true, errors: [] },
      retry_count: 0,
      human_revision: { state: "none" },
      ...overrides,
    },
  };
}

async function n6ValidationBinding(repository, caseIds = [CASE_A, CASE_B]) {
  const contexts = await Promise.all(caseIds.map((caseId) => repository.getW6ClosedCaseContext(caseId)));
  const evidence = contexts.flatMap((context) => {
    const submission = context.w5_history.evidence_submissions.find((record) =>
      record.submission_id === context.closure_provenance.evidence_submission_id
    );
    assert.ok(submission);
    return [
      {
        case_id: context.case_record.case_id,
        source_ref: `case:${context.case_record.case_id}:summary`,
        text: context.case_record.summary,
      },
      {
        case_id: context.case_record.case_id,
        source_ref: `w5:evidence:${context.closure_provenance.evidence_submission_id}`,
        text: submission.text,
      },
    ];
  });
  const resolutionRecords = contexts.map((context) => {
    const closure = context.w5_history.closure_decisions.find((record) =>
      record.decision_id === context.closure_provenance.closure_decision_id
    );
    assert.ok(closure);
    return {
      case_id: context.case_record.case_id,
      source_ref: `w5:closure:${context.closure_provenance.closure_decision_id}`,
      text: closure.reason,
      review_status: "approved",
    };
  });
  const request = {
    node: "N6",
    mode: "root_cause_hypothesis",
    version: "N6-root-cause-1.0.0-draft.3",
    object_ref: { object_type: "cluster", object_id: CLUSTER_ID },
    input: {
      evidence,
      issue_cluster: {
        cluster_id: CLUSTER_ID,
        member_case_ids: [...caseIds],
        status: "待审核",
      },
      resolution_records: resolutionRecords,
      hypothesis_catalog: structuredClone(N6_CATALOG),
    },
  };
  const evidenceSpans = evidence.map((record) => ({
    source_ref: record.source_ref,
    quote: record.text,
  }));
  const envelope = {
    node: "N6",
    mode: "root_cause_hypothesis",
    version: "N6-root-cause-1.0.0-draft.3",
    run_id: "SYN-AI-RUN-W6-N6-VALIDATED-001",
    object_ref: structuredClone(request.object_ref),
    input_hash: createAiInputHash(request),
    payload: {
      hypotheses: [{
        hypothesis_id: N6_CATALOG[0].hypothesis_id,
        statement: "待验证假设：部件批次差异可能与舱门解锁异常相关，需人工结合支持证据、反证和不确定项验证。",
        supporting_evidence_indices: [0, 2],
        counter_evidence_indices: [1, 3],
        uncertainty_ids: [N6_CATALOG[0].uncertainty_options[0].uncertainty_id],
        uncertainties: ["待确认：样本量有限"],
      }],
      human_review_required: true,
      final_root_cause: false,
    },
    evidence_spans: evidenceSpans,
    missing_fields: [],
    confidence: 0.88,
    status: "ok",
    validation: { valid: true, errors: [] },
    retry_count: 0,
    human_revision: { state: "none" },
  };
  const rootCause = {
    hypothesis_id: N6_CATALOG[0].hypothesis_id,
    node_run_id: envelope.run_id,
    node_version: envelope.version,
    input_hash: envelope.input_hash,
    statement: envelope.payload.hypotheses[0].statement,
    supporting_evidence: [evidenceSpans[0], evidenceSpans[2]],
    counter_evidence: [evidenceSpans[1], evidenceSpans[3]],
    uncertainties: [...envelope.payload.hypotheses[0].uncertainties],
    final_root_cause: false,
  };
  return { request, envelope, rootCause };
}

function n5ActiveIntakeBinding(repository, transition) {
  const triggerSet = new Set(transition.triggering_case_ids);
  const currentId = [...transition.triggering_case_ids].sort()[0];
  const orderedCaseIds = [currentId, ...transition.case_ids.filter((caseId) => caseId !== currentId)];
  const records = orderedCaseIds.map((caseId) => repository.casesById.get(caseId));
  const toFact = (record) => ({
    case_id: record.case_id,
    status: record.status,
    workflow_readiness: record.workflow_readiness,
    summary: record.summary,
    same_event_resolution: "not_required",
    cluster_id: triggerSet.has(record.case_id) ? null : transition.cluster_id,
  });
  const toTime = (record) => ({ case_id: record.case_id, closed_at: record.closed_at });
  const toEntity = (record) => ({ case_id: record.case_id, formal_entity: structuredClone(record.formal_entity) });
  const toSource = (record) => ({ case_id: record.case_id, source_ref: `case:${record.case_id}` });
  const request = {
    node: "N5",
    mode: "cross_event_clustering",
    version: "N5-cross-event-1.0.0-draft.2",
    object_ref: { object_type: "case", object_id: currentId },
    input: {
      case_facts: { current: toFact(records[0]), candidates: records.slice(1).map(toFact) },
      time: { current: toTime(records[0]), candidates: records.slice(1).map(toTime) },
      confirmed_entities: { current: toEntity(records[0]), candidates: records.slice(1).map(toEntity) },
      source_reference: { current: toSource(records[0]), candidates: records.slice(1).map(toSource) },
    },
  };
  const evidenceSpans = records.map((record) => ({
    source_ref: `case:${record.case_id}`,
    quote: record.summary,
  }));
  const envelope = {
    node: request.node,
    mode: request.mode,
    version: request.version,
    run_id: `SYN-AI-RUN-W6-N5-INTAKE-${currentId}`,
    object_ref: structuredClone(request.object_ref),
    input_hash: createAiInputHash(request),
    payload: {
      cluster_candidate: {
        candidate_kind: "existing_cluster",
        suggested_cluster_id: transition.cluster_id,
        member_cases: records.map((record, index) => ({
          case_id: record.case_id,
          evidence_span_indices: [index],
        })),
        similarity: 0.9,
      },
      human_review_required: true,
      automatic_merge: false,
      automatic_case_relink: false,
    },
    evidence_spans: evidenceSpans,
    missing_fields: [],
    confidence: 0.9,
    status: "ok",
    validation: { valid: true, errors: [] },
    retry_count: 0,
    human_revision: { state: "none" },
  };
  return { request, envelope };
}

function candidateInput(repository, overrides = {}) {
  const caseIds = overrides.case_ids ?? [CASE_A, CASE_B];
  const aiBinding = n5Envelope(repository, caseIds, overrides.envelope_overrides);
  return {
    cluster_id: overrides.cluster_id ?? CLUSTER_ID,
    name: overrides.name ?? "舱门解锁失败合成候选簇",
    category_domain: overrides.category_domain ?? "车辆运维",
    proposal_id: overrides.proposal_id ?? "SYN-W6-PROPOSAL-001",
    history_id: overrides.history_id ?? "SYN-W6-HISTORY-CANDIDATE-001",
    receipt_id: overrides.receipt_id ?? "SYN-W6-RECEIPT-CANDIDATE-001",
    created_at: overrides.created_at ?? T0,
    request: aiBinding.request,
    envelope: aiBinding.envelope,
  };
}

function resources(caseIds, clusterId = CLUSTER_ID, improvementId = null) {
  return { case_ids: caseIds, cluster_id: clusterId, improvement_id: improvementId };
}

let eventSequence = 0;
async function inEvent(repository, {
  eventId,
  command,
  lockResources,
  operation,
}) {
  eventSequence += 1;
  const resolvedEventId = eventId ?? `SYN-EVENT-W6-TEST-${String(eventSequence).padStart(3, "0")}`;
  const commandFingerprint = createWorkflowEventFingerprint(command);
  let output;
  const execution = await repository.runWorkflowEvent(resolvedEventId, commandFingerprint, async () => {
    output = await repository.runW6ResourcesExclusive(lockResources, () => operation({
      event_id: resolvedEventId,
      command_fingerprint: commandFingerprint,
    }));
    return {
      workflow: "W6",
      event_id: resolvedEventId,
      status: "completed",
      object_ref: { object_type: "cluster", object_id: lockResources.cluster_id },
      actions: ["w6_repository_test"],
      errors: [],
      output: { repository_test: true },
    };
  });
  return { output, execution, event_id: resolvedEventId, command_fingerprint: commandFingerprint };
}

function transitionBase(action, overrides = {}) {
  const improvementId = action === "review_candidate" ? null : IMPROVEMENT_ID;
  return {
    action,
    case_ids: [CASE_A, CASE_B],
    cluster_id: CLUSTER_ID,
    improvement_id: improvementId,
    expected_cluster_fingerprint: overrides.expected_cluster_fingerprint,
    expected_improvement_fingerprint: overrides.expected_improvement_fingerprint ?? null,
    history_id: overrides.history_id ?? `SYN-W6-HISTORY-${action}`,
    receipt_id: overrides.receipt_id ?? `SYN-W6-RECEIPT-${action}`,
    occurred_at: overrides.occurred_at ?? "2026-08-01T01:00:00.000Z",
    ...overrides,
  };
}

async function currentFingerprints(repository, clusterId = CLUSTER_ID, improvementId = null) {
  const cluster = await repository.findW6ClusterById(clusterId);
  const improvement = improvementId ? await repository.findW6ImprovementById(improvementId) : null;
  return {
    cluster: createWorkflowEventFingerprint(cluster),
    improvement: improvement ? createWorkflowEventFingerprint(improvement) : null,
  };
}

async function createCandidate(harness, overrides = {}) {
  const input = candidateInput(harness.repository, overrides);
  const caseIds = input.envelope.payload.cluster_candidate.member_cases
    .map((entry) => entry.case_id)
    .sort();
  return inEvent(harness.repository, {
    command: input,
    lockResources: resources(caseIds, input.cluster_id),
    operation: () => harness.repository.createW6ClusterCandidateIfAbsent(input),
  });
}

async function authorizedCommit(harness, input, options = {}) {
  const lockResources = options.lock_resources ?? resources(
    input.case_ids,
    input.cluster_id,
    input.improvement_id,
  );
  return inEvent(harness.repository, {
    eventId: options.event_id,
    command: options.command ?? input,
    lockResources,
    operation: async ({ event_id, command_fingerprint }) => {
      const binding = createW6AuthorizationBinding(input);
      const baseClaims = {
        workflow: "W6",
        event_id,
        phase: binding.phase,
        case_ids: binding.case_ids,
        cluster_id: binding.cluster_id,
        improvement_id: binding.improvement_id,
        action: binding.action,
        target_fingerprint: binding.target_fingerprint,
        command_fingerprint,
        principal: PRINCIPAL,
        policy_version: POLICY_VERSION,
      };
      const grantClaims = { ...baseClaims, ...options.grant_claim_overrides };
      const claims = { ...baseClaims, ...options.claim_overrides };
      const issuer = options.issuer ?? harness.grantChannel.issuer;
      const grant = options.grant ?? issuer.issue(grantClaims);
      return harness.repository.runAuthorizedW6Action(
        { grant, claims },
        () => harness.repository.commitW6Transition(input),
      );
    },
  });
}

async function validatedAuthorizedCommit(harness, input, options = {}) {
  const aiBinding = options.ai_binding ?? await n6ValidationBinding(harness.repository, input.case_ids);
  const lockResources = options.lock_resources ?? resources(
    input.case_ids,
    input.cluster_id,
    input.improvement_id,
  );
  return inEvent(harness.repository, {
    eventId: options.event_id,
    command: options.command ?? input,
    lockResources,
    operation: async ({ event_id, command_fingerprint }) => {
      const validation = harness.repository.validateAndIssueW6AiAction({
        event_id,
        command_fingerprint,
        transition: input,
        request: aiBinding.request,
        envelope: aiBinding.envelope,
      });
      const binding = createW6AuthorizationBinding(input);
      const claims = {
        workflow: "W6",
        event_id,
        phase: binding.phase,
        case_ids: binding.case_ids,
        cluster_id: binding.cluster_id,
        improvement_id: binding.improvement_id,
        action: binding.action,
        target_fingerprint: binding.target_fingerprint,
        command_fingerprint,
        principal: PRINCIPAL,
        policy_version: POLICY_VERSION,
      };
      const grant = harness.grantChannel.issuer.issue(claims);
      return harness.repository.runAuthorizedW6Action(
        { grant, claims },
        () => harness.repository.runValidatedW6AiAction(
          validation,
          () => harness.repository.commitW6Transition(input),
        ),
      );
    },
  });
}

async function authorizedRawCommit(harness, rawInput, safeInput) {
  return inEvent(harness.repository, {
    command: safeInput,
    lockResources: resources(
      safeInput.case_ids,
      safeInput.cluster_id,
      safeInput.improvement_id,
    ),
    operation: async ({ event_id, command_fingerprint }) => {
      const binding = createW6AuthorizationBinding(safeInput);
      const claims = {
        workflow: "W6",
        event_id,
        phase: binding.phase,
        case_ids: binding.case_ids,
        cluster_id: binding.cluster_id,
        improvement_id: binding.improvement_id,
        action: binding.action,
        target_fingerprint: binding.target_fingerprint,
        command_fingerprint,
        principal: PRINCIPAL,
        policy_version: POLICY_VERSION,
      };
      const grant = harness.grantChannel.issuer.issue(claims);
      return harness.repository.runAuthorizedW6Action(
        { grant, claims },
        () => harness.repository.commitW6Transition(rawInput),
      );
    },
  });
}

function sortedMapSnapshot(map) {
  return structuredClone(
    [...map.entries()].sort(([left], [right]) => String(left).localeCompare(String(right))),
  );
}

async function w6DurableState(repository, clusterId = CLUSTER_ID, improvementId = IMPROVEMENT_ID) {
  const clusters = await repository.listW6Clusters();
  const clusterIds = [...new Set([
    ...clusters.map((record) => record.cluster_id),
    ...(clusters.some((record) => record.cluster_id === clusterId) ? [clusterId] : []),
  ])].sort();
  const improvementIds = [...new Set([
    improvementId,
    ...clusters.flatMap((record) =>
      record.active_improvement_id === null ? [] : [record.active_improvement_id]
    ),
  ])].sort();
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

async function captureRejectedWithoutMutation({ before, operation, repository, errorPattern }) {
  let error = null;
  try {
    await operation();
  } catch (caught) {
    error = caught;
  }
  const after = await w6DurableState(repository);
  return {
    rejected: error instanceof Error,
    expected_error: error instanceof Error && errorPattern.test(error.message),
    unchanged: JSON.stringify(after) === JSON.stringify(before),
    error_message: error instanceof Error ? error.message : null,
  };
}

async function reviewedHarness(options = {}) {
  const harness = await makeHarness(options);
  await createCandidate(harness);
  const fingerprints = await currentFingerprints(harness.repository);
  const review = transitionBase("review_candidate", {
    expected_cluster_fingerprint: fingerprints.cluster,
    decision: "submit_for_review",
    reason: "合成候选簇证据进入人工审核。",
  });
  await authorizedCommit(harness, review);
  return harness;
}

function rootCauseHypothesis() {
  return {
    hypothesis_id: "SYN-HYPOTHESIS-W6-001",
    node_run_id: "SYN-AI-RUN-W6-N6-001",
    node_version: "N6-root-cause-1.0.0-draft.3",
    input_hash: "e".repeat(64),
    statement: "部件批次差异可能与舱门无法解锁相关，仍待人工验证。",
    supporting_evidence: [
      { source_ref: `case:${CASE_A}`, quote: closedCase(CASE_A, 1).summary },
      { source_ref: `case:${CASE_B}`, quote: closedCase(CASE_B, 2).summary },
    ],
    counter_evidence: [
      { source_ref: "synthetic:test:counter-evidence", quote: "同批次的合成复测未复现该现象。" },
    ],
    uncertainties: ["样本量有限", "缺少拆检记录"],
    final_root_cause: false,
  };
}

async function activeImprovementHarness(options = {}) {
  const harness = await reviewedHarness(options);
  const fingerprints = await currentFingerprints(harness.repository);
  const aiBinding = await n6ValidationBinding(harness.repository);
  const start = transitionBase("start_improvement", {
    expected_cluster_fingerprint: fingerprints.cluster,
    improvement: {
      version: "synthetic.1",
      owner_role: "合成改进负责人",
      measure: "对合成舱门解锁链路执行版本与部件批次复核。",
      observation_window_days: [7, 30],
      clock_source: "test",
      metric_formula: "观察窗内同类案件数；无任务量分母时不计算复发率",
    },
    root_cause_hypothesis: aiBinding.rootCause,
    reason: "人工审核后启动合成改进项目。",
  });
  await validatedAuthorizedCommit(harness, start, { ai_binding: aiBinding });
  return harness;
}

async function observingHarness() {
  const harness = await activeImprovementHarness();
  const fingerprints = await currentFingerprints(harness.repository, CLUSTER_ID, IMPROVEMENT_ID);
  const enter = transitionBase("enter_observation", {
    expected_cluster_fingerprint: fingerprints.cluster,
    expected_improvement_fingerprint: fingerprints.improvement,
    cycle_id: "SYN-W6-CYCLE-001",
    clock_source: "test",
    occurred_at: OBSERVATION_OPENED_AT,
    reason: "合成改进措施已执行，人工确认进入观察。",
  });
  await authorizedCommit(harness, enter);
  return harness;
}

async function activeIntakeTransition(harness, triggerIds = [CASE_C], overrides = {}) {
  const cluster = await harness.repository.findW6ClusterById(CLUSTER_ID);
  const fingerprints = await currentFingerprints(harness.repository, CLUSTER_ID, IMPROVEMENT_ID);
  const history = await harness.repository.getW6History(CLUSTER_ID);
  const transitionWithoutFingerprint = transitionBase("intake_active_observation_recurrence", {
    case_ids: [...new Set([...cluster.member_case_ids, ...triggerIds])].sort(),
    expected_cluster_fingerprint: fingerprints.cluster,
    expected_improvement_fingerprint: fingerprints.improvement,
    expected_w6_state_fingerprint: history.receipts.at(-1).state_fingerprint,
    cycle_id: history.observation_cycles.at(-1).cycle_id,
    triggering_case_ids: [...triggerIds].sort(),
    intake_id: overrides.intake_id ?? "SYN-W6-ACTIVE-INTAKE-001",
    clock_source: "test",
    n5_validation_fingerprint: "0".repeat(64),
    occurred_at: overrides.occurred_at ?? "2026-08-05T01:00:00.000Z",
    reason: overrides.reason ?? "合成观察期内新关闭复发案经 N5 建议和人工授权纳入当前簇。",
    ...overrides,
  });
  const aiBinding = n5ActiveIntakeBinding(harness.repository, transitionWithoutFingerprint);
  const transition = snapshotW6AtomicTransition({
    ...transitionWithoutFingerprint,
    n5_validation_fingerprint: createW6N5ValidationFingerprint(
      aiBinding.request,
      aiBinding.envelope,
    ),
  });
  return { transition, aiBinding };
}

async function timedCommit(harness, input, options = {}) {
  return inEvent(harness.repository, {
    eventId: options.event_id,
    command: input,
    lockResources: resources(input.case_ids, input.cluster_id, input.improvement_id),
    operation: () => harness.repository.commitW6Transition(input),
  });
}

async function observedThirtyDaysHarness() {
  const harness = await observingHarness();
  let fingerprints = await currentFingerprints(harness.repository, CLUSTER_ID, IMPROVEMENT_ID);
  await timedCommit(harness, transitionBase("record_day_7", {
    expected_cluster_fingerprint: fingerprints.cluster,
    expected_improvement_fingerprint: fingerprints.improvement,
    cycle_id: "SYN-W6-CYCLE-001",
    clock_source: "test",
    recurrence_case_ids: [],
    related_task_volume: null,
    checkpoint_id: "SYN-W6-CHECKPOINT-DAY7-001",
    occurred_at: DAY_7_AT,
  }));
  fingerprints = await currentFingerprints(harness.repository, CLUSTER_ID, IMPROVEMENT_ID);
  await timedCommit(harness, transitionBase("record_day_30", {
    expected_cluster_fingerprint: fingerprints.cluster,
    expected_improvement_fingerprint: fingerprints.improvement,
    cycle_id: "SYN-W6-CYCLE-001",
    clock_source: "test",
    recurrence_case_ids: [],
    related_task_volume: null,
    checkpoint_id: "SYN-W6-CHECKPOINT-DAY30-001",
    occurred_at: DAY_30_AT,
  }));
  return harness;
}

async function archivedHarness({ includeCaseC = false } = {}) {
  const harness = await observedThirtyDaysHarness();
  const fingerprints = await currentFingerprints(harness.repository, CLUSTER_ID, IMPROVEMENT_ID);
  await authorizedCommit(harness, transitionBase("archive_observation", {
    expected_cluster_fingerprint: fingerprints.cluster,
    expected_improvement_fingerprint: fingerprints.improvement,
    cycle_id: "SYN-W6-CYCLE-001",
    human_conclusion: "两个合成观察窗已完成，本轮未记录新的同类案件。",
    occurred_at: "2026-09-01T01:00:00.000Z",
    reason: "授权问题负责人确认归档。",
  }));
  if (includeCaseC) {
    await seedClosedCase(harness.repository, harness.w5GrantChannel.issuer, CASE_C, 3, {
      updated_at: "2026-09-01T01:00:00.001Z",
      closed_at: "2026-09-01T01:00:00.001Z",
    });
  }
  return harness;
}

test("W6 state machine allows recurrence reopening only for an authorized human and adds no status", () => {
  assert.equal(transitionCluster("已归档", "观察中", "authorized_human"), "观察中");
  assert.equal(transitionImprovement("已完成", "观察中", "authorized_human"), "观察中");
  assert.throws(() => transitionCluster("已归档", "观察中", "workflow"), InvalidStateTransitionError);
  assert.throws(() => transitionImprovement("已完成", "观察中", "workflow"), InvalidStateTransitionError);
});

test("W6 accepts only repository-issued W5 closure provenance and returns an immutable closed-case context", async () => {
  const harness = await makeHarness();
  const context = await harness.repository.getW6ClosedCaseContext(CASE_A);
  assert.equal(context.case_record.status, "已关闭");
  assert.equal(context.work_order.status, "已完成");
  assert.equal(context.work_order.validation_result, "passed");
  assert.equal(context.work_order.completed_at, context.case_record.closed_at);
  assert.equal(context.closure_provenance.closed_at, context.case_record.closed_at);
  assert.match(context.closure_provenance.w5_closure_fingerprint, /^[a-f0-9]{64}$/u);
  assert.equal(context.w5_history.evidence_submissions.at(-1).completeness, "complete");
  assert.equal(context.w5_history.reply_reviews.at(-1).decision, "approve_for_manual_delivery");
  assert.equal(context.w5_history.follow_ups.at(-1).outcome, "resolved");
  assert.equal(context.w5_history.closure_decisions.at(-1).decision, "close");

  context.case_record.summary = "tampered returned clone";
  context.work_order.disposition_evidence = "tampered returned clone";
  context.w5_history.evidence_submissions[0].text = "tampered returned clone";
  context.closure_provenance.w5_closure_fingerprint = "0".repeat(64);
  const reread = await harness.repository.getW6ClosedCaseContext(CASE_A);
  assert.notEqual(reread.case_record.summary, "tampered returned clone");
  assert.notEqual(reread.work_order.disposition_evidence, "tampered returned clone");
  assert.notEqual(reread.w5_history.evidence_submissions[0].text, "tampered returned clone");
  assert.notEqual(reread.closure_provenance.w5_closure_fingerprint, "0".repeat(64));

  const forgedChannel = createW5AuthorizationGrantChannel();
  const forgedRepository = new InMemoryFrontHalfRepository({
    w5_authorization_grant_consumer: forgedChannel.consumer,
  });
  const copyPublicMap = (target, source) => {
    for (const [key, value] of source.entries()) target.set(key, structuredClone(value));
  };
  copyPublicMap(forgedRepository.casesById, harness.repository.casesById);
  copyPublicMap(forgedRepository.workOrdersById, harness.repository.workOrdersById);
  copyPublicMap(forgedRepository.workOrderByCaseId, harness.repository.workOrderByCaseId);
  copyPublicMap(forgedRepository.rawFeedbackById, harness.repository.rawFeedbackById);
  copyPublicMap(forgedRepository.rawFeedbackByKey, harness.repository.rawFeedbackByKey);
  copyPublicMap(forgedRepository.caseByFeedbackId, harness.repository.caseByFeedbackId);
  copyPublicMap(forgedRepository.w5EvidenceSubmissionsByCaseId, harness.repository.w5EvidenceSubmissionsByCaseId);
  copyPublicMap(forgedRepository.w5ReplyDraftsByCaseId, harness.repository.w5ReplyDraftsByCaseId);
  copyPublicMap(forgedRepository.w5ReplyReviewsByCaseId, harness.repository.w5ReplyReviewsByCaseId);
  copyPublicMap(forgedRepository.w5FollowUpsByCaseId, harness.repository.w5FollowUpsByCaseId);
  copyPublicMap(forgedRepository.w5ClosureDecisionsByCaseId, harness.repository.w5ClosureDecisionsByCaseId);
  for (const caseId of [CASE_A, CASE_B]) {
    await forgedRepository.insertSameEventCheckIfAbsent(
      await harness.repository.findSameEventCheckByCaseId(caseId),
    );
  }
  await assert.rejects(
    forgedRepository.getW6ClosedCaseContext(CASE_A),
    /W5|closure|provenance|authoritative/iu,
  );
  const forgedInput = candidateInput(forgedRepository);
  await assert.rejects(
    inEvent(forgedRepository, {
      command: forgedInput,
      lockResources: resources([CASE_A, CASE_B]),
      operation: () => forgedRepository.createW6ClusterCandidateIfAbsent(forgedInput),
    }),
    /W5|closure|provenance|authoritative/iu,
  );
  assert.equal(await forgedRepository.findW6ClusterById(CLUSTER_ID), null);
});

test("W6 rejects every missing W5 closure-chain step", async () => {
  const omissions = [
    ["evidence", (repository) => repository.w5EvidenceSubmissionsByCaseId.set(CASE_A, [])],
    ["reply_draft", (repository) => repository.w5ReplyDraftsByCaseId.set(CASE_A, [])],
    ["reply_approval", (repository) => repository.w5ReplyReviewsByCaseId.set(CASE_A, [])],
    ["follow_up", (repository) => repository.w5FollowUpsByCaseId.set(CASE_A, [])],
    ["human_close", (repository) => repository.w5ClosureDecisionsByCaseId.set(CASE_A, [])],
  ];
  const failures = [];
  for (const [label, mutate] of omissions) {
    const harness = await makeHarness();
    mutate(harness.repository);
    try {
      await harness.repository.getW6ClosedCaseContext(CASE_A);
      failures.push({ label, accepted: true });
    } catch (error) {
      if (!(error instanceof Error) || !/W5|closure|chain|provenance|history/iu.test(error.message)) {
        failures.push({ label, error: error instanceof Error ? error.message : String(error) });
      }
    }
  }
  assert.deepEqual(failures, []);
});

test("W5 cannot mint closure provenance when case, work-order, and human-close timestamps disagree", async () => {
  const w5GrantChannel = createW5AuthorizationGrantChannel();
  const repository = new InMemoryFrontHalfRepository({
    w5_authorization_grant_consumer: w5GrantChannel.consumer,
  });
  await assert.rejects(
    seedClosedCase(repository, w5GrantChannel.issuer, CASE_A, 1, {}, {
      decided_at: "2026-07-21T23:59:59.000Z",
    }),
    /W5 closure provenance|closure timestamp|human-close chain/iu,
  );
  const caseRecord = await repository.findCaseById(CASE_A);
  const workOrder = await repository.findWorkOrderByCaseId(CASE_A);
  const history = await repository.getW5History(CASE_A);
  assert.equal(caseRecord.status, "待回访");
  assert.equal(caseRecord.workflow_readiness, "awaiting_closure_decision");
  assert.equal(caseRecord.closed_at, null);
  assert.equal(workOrder.status, "待验证");
  assert.equal(workOrder.completed_at, null);
  assert.equal(history.closure_decisions.length, 0);
  await assert.rejects(
    repository.getW6ClosedCaseContext(CASE_A),
    /W5|closure|provenance|authoritative/iu,
  );
});

test("W6 fails closed when case, work order, W5 evidence, or human closure changes after clustering", async () => {
  const tamperCases = [
    ["case", (repository) => {
      repository.casesById.get(CASE_A).closed_at = "2026-07-31T23:59:59.000Z";
    }],
    ["work_order", (repository) => {
      repository.workOrdersById.get("SYN-WORK-W6-1").completed_at = "2026-07-31T23:59:58.000Z";
    }],
    ["w5_history", (repository) => {
      repository.w5EvidenceSubmissionsByCaseId.get(CASE_A)[0].text = "tampered evidence";
    }],
    ["closure", (repository) => {
      repository.w5ClosureDecisionsByCaseId.get(CASE_A)[0].decided_at = "2026-07-31T23:59:57.000Z";
    }],
  ];
  const failures = [];
  for (const [label, mutate] of tamperCases) {
    const harness = await makeHarness();
    await createCandidate(harness);
    mutate(harness.repository);
    let contextRejected = false;
    let clusterRejected = false;
    try {
      await harness.repository.getW6ClosedCaseContext(CASE_A);
    } catch {
      contextRejected = true;
    }
    try {
      await harness.repository.findW6ClusterById(CLUSTER_ID);
    } catch {
      clusterRejected = true;
    }
    if (!contextRejected || !clusterRejected) failures.push({ label, contextRejected, clusterRejected });
  }
  assert.deepEqual(failures, []);
});

test("W6 atomic snapshot and authorization binding reject descriptor attacks without reading getters", async () => {
  const harness = await makeHarness();
  await createCandidate(harness);
  const fingerprints = await currentFingerprints(harness.repository);
  const safeInput = transitionBase("review_candidate", {
    expected_cluster_fingerprint: fingerprints.cluster,
    decision: "submit_for_review",
    reason: "safe atomic snapshot",
  });
  const snapshot = snapshotW6AtomicTransition(safeInput);
  const binding = createW6AuthorizationBinding(safeInput);
  assert.equal(JSON.stringify(snapshot), JSON.stringify(safeInput));
  assert.equal(binding.action, "review_candidate");
  safeInput.reason = "caller changed after snapshot";
  assert.equal(snapshot.reason, "safe atomic snapshot");

  const attacks = [
    ["getter", (input, tracker) => Object.defineProperty(input, "action", {
      get() {
        tracker.reads += 1;
        return "review_candidate";
      },
      enumerable: true,
      configurable: true,
    })],
    ["extra", (input) => { input.forbidden_extra = true; }],
    ["hidden", (input) => Object.defineProperty(input, "forbidden_hidden", {
      value: true,
      enumerable: false,
      configurable: true,
    })],
    ["symbol", (input) => { input[Symbol("forbidden")] = true; }],
    ["prototype", (input) => Object.setPrototypeOf(input, { inherited_extra: true })],
    ["cycle", (input) => { input.reason = input; }],
  ];
  const failures = [];
  for (const [label, mutate] of attacks) {
    const raw = structuredClone({ ...safeInput, reason: "safe atomic snapshot" });
    const tracker = { reads: 0 };
    mutate(raw, tracker);
    for (const [entry, operation] of [
      ["snapshot", () => snapshotW6AtomicTransition(raw)],
      ["binding", () => createW6AuthorizationBinding(raw)],
    ]) {
      try {
        operation();
        failures.push({ label, entry, accepted: true, getter_reads: tracker.reads });
      } catch (error) {
        if (
          !(error instanceof Error) ||
          !/W6|plain JSON|closed transition|exact|boundary/iu.test(error.message) ||
          tracker.reads !== 0
        ) {
          failures.push({
            label,
            entry,
            getter_reads: tracker.reads,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }
  }
  assert.deepEqual(failures, []);
});

test("W6 creates one N5-bound candidate receipt without changing case or feedback ownership", async () => {
  const harness = await makeHarness();
  const beforeCases = await Promise.all([CASE_A, CASE_B].map((id) => harness.repository.findCaseById(id)));
  const beforeLinks = [...harness.repository.caseByFeedbackId.entries()];
  const input = candidateInput(harness.repository);
  const created = await inEvent(harness.repository, {
    command: input,
    lockResources: resources([CASE_A, CASE_B]),
    operation: () => harness.repository.createW6ClusterCandidateIfAbsent(input),
  });

  assert.equal(created.output.outcome, "created");
  assert.equal(created.output.cluster.status, "候选");
  assert.deepEqual(created.output.cluster.member_case_ids, [CASE_A, CASE_B]);
  assert.equal(created.output.proposal.node_version, "N5-cross-event-1.0.0-draft.2");
  assert.match(created.output.proposal.envelope_fingerprint, /^[a-f0-9]{64}$/u);
  assert.match(created.output.receipt.state_fingerprint, /^[a-f0-9]{64}$/u);
  input.request.input.case_facts.current.summary = "tampered caller request";
  input.envelope.payload.cluster_candidate.member_cases[0].case_id = "SYN-TAMPER";
  const storedHistory = await harness.repository.getW6History(CLUSTER_ID);
  assert.equal(storedHistory.proposal.member_case_snapshots[0].case_id, CASE_A);
  assert.deepEqual(await Promise.all([CASE_A, CASE_B].map((id) => harness.repository.findCaseById(id))), beforeCases);
  assert.deepEqual([...harness.repository.caseByFeedbackId.entries()], beforeLinks);
});

test("W6 candidate persistence requires an active event and every stable case/cluster lock", async () => {
  const harness = await makeHarness();
  const input = candidateInput(harness.repository);
  await assert.rejects(
    harness.repository.createW6ClusterCandidateIfAbsent(input),
    /active event|lock|W6/u,
  );
  await assert.rejects(
    inEvent(harness.repository, {
      command: input,
      lockResources: resources([CASE_A], CLUSTER_ID),
      operation: () => harness.repository.createW6ClusterCandidateIfAbsent(input),
    }),
    /lock|case/u,
  );
  assert.equal(await harness.repository.findW6ClusterById(CLUSTER_ID), null);
});

test("W6 rejects invalid N5 envelopes and stale closed-case snapshots before candidate writes", async () => {
  const invalid = await makeHarness();
  const invalidInput = candidateInput(invalid.repository, {
    envelope_overrides: { input_hash: "0".repeat(64) },
  });
  await assert.rejects(
    inEvent(invalid.repository, {
      command: invalidInput,
      lockResources: resources([CASE_A, CASE_B]),
      operation: () => invalid.repository.createW6ClusterCandidateIfAbsent(invalidInput),
    }),
    /N5|envelope|input hash/u,
  );

  const stale = await makeHarness();
  const staleInput = candidateInput(stale.repository);
  stale.repository.casesById.get(CASE_B).summary = "授权等待期间被替换的合成摘要。";
  await assert.rejects(
    inEvent(stale.repository, {
      command: staleInput,
      lockResources: resources([CASE_A, CASE_B]),
      operation: () => stale.repository.createW6ClusterCandidateIfAbsent(staleInput),
    }),
    /snapshot|request|case/u,
  );
  assert.equal(await stale.repository.findW6ClusterById(CLUSTER_ID), null);

  const injected = await makeHarness();
  const injectedInput = candidateInput(injected.repository);
  injectedInput.request.input.case_facts.candidates[0].cluster_id = "SYN-CLUSTER-INJECTED";
  injectedInput.envelope.input_hash = createAiInputHash(injectedInput.request);
  injectedInput.envelope.payload.cluster_candidate.candidate_kind = "existing_cluster";
  injectedInput.envelope.payload.cluster_candidate.suggested_cluster_id = "SYN-CLUSTER-INJECTED";
  await assert.rejects(
    inEvent(injected.repository, {
      command: injectedInput,
      lockResources: resources([CASE_A, CASE_B]),
      operation: () => injected.repository.createW6ClusterCandidateIfAbsent(injectedInput),
    }),
    /existing-cluster|authoritative|injection/u,
  );
});

test("W6 concurrent candidate events for the same membership persist only one cluster", async () => {
  const harness = await makeHarness();
  const left = candidateInput(harness.repository);
  const right = candidateInput(harness.repository, {
    cluster_id: "SYN-CLUSTER-W6-002",
    proposal_id: "SYN-W6-PROPOSAL-002",
    history_id: "SYN-W6-HISTORY-CANDIDATE-002",
    receipt_id: "SYN-W6-RECEIPT-CANDIDATE-002",
  });
  const execute = (input) => inEvent(harness.repository, {
    command: input,
    lockResources: resources([CASE_B, CASE_A], input.cluster_id),
    operation: () => harness.repository.createW6ClusterCandidateIfAbsent(input),
  });
  const results = await Promise.all([execute(left), execute(right)]);
  assert.deepEqual(new Set(results.map((entry) => entry.output.outcome)), new Set(["created", "idempotent"]));
  assert.equal((await harness.repository.listW6Clusters()).length, 1);
  assert.equal((await harness.repository.getW6History(CLUSTER_ID)).entries.length, 1);

  await seedClosedCase(harness.repository, harness.w5GrantChannel.issuer, CASE_C, 3);
  const overlap = candidateInput(harness.repository, {
    case_ids: [CASE_B, CASE_C],
    cluster_id: "SYN-CLUSTER-W6-OVERLAP",
    proposal_id: "SYN-W6-PROPOSAL-OVERLAP",
    history_id: "SYN-W6-HISTORY-CANDIDATE-OVERLAP",
    receipt_id: "SYN-W6-RECEIPT-CANDIDATE-OVERLAP",
  });
  await assert.rejects(
    inEvent(harness.repository, {
      command: overlap,
      lockResources: resources([CASE_B, CASE_C], overlap.cluster_id),
      operation: () => harness.repository.createW6ClusterCandidateIfAbsent(overlap),
    }),
    /already belongs|recurrence path/u,
  );
});

test("W6 authorized candidate review appends immutable history and a non-serializable grant receipt", async () => {
  const harness = await makeHarness();
  await createCandidate(harness);
  const fingerprints = await currentFingerprints(harness.repository);
  const input = transitionBase("review_candidate", {
    expected_cluster_fingerprint: fingerprints.cluster,
    decision: "submit_for_review",
    reason: "人工确认证据足以进入审核。",
  });
  const committed = await authorizedCommit(harness, input);
  assert.equal(committed.output.outcome, "committed");
  assert.equal(committed.output.cluster.status, "待审核");
  assert.equal(committed.output.history.entries.at(-1).principal.principal_id, PRINCIPAL.principal_id);
  assert.equal(JSON.stringify(committed.output).includes("grant"), false);

  committed.output.history.entries[0].reason = "tampered clone";
  const persisted = await harness.repository.getW6History(CLUSTER_ID);
  assert.notEqual(persisted.entries[0].reason, "tampered clone");
});

test("W6 direct writes and forged capabilities fail without any domain mutation", async () => {
  const harness = await makeHarness();
  await createCandidate(harness);
  const fingerprints = await currentFingerprints(harness.repository);
  const input = transitionBase("review_candidate", {
    expected_cluster_fingerprint: fingerprints.cluster,
    decision: "submit_for_review",
    reason: "直写不应被接受。",
  });
  await assert.rejects(harness.repository.commitW6Transition(input), /active event|authorization|lock|W6/u);
  await assert.rejects(
    inEvent(harness.repository, {
      command: input,
      lockResources: resources(input.case_ids),
      operation: () => harness.repository.commitW6Transition(input),
    }),
    /authorization|capability/u,
  );
  await assert.rejects(
    inEvent(harness.repository, {
      command: input,
      lockResources: resources(input.case_ids),
      operation: ({ event_id, command_fingerprint }) => {
        const binding = createW6AuthorizationBinding(input);
        const claims = {
          workflow: "W6",
          event_id,
          phase: binding.phase,
          case_ids: binding.case_ids,
          cluster_id: binding.cluster_id,
          improvement_id: binding.improvement_id,
          action: binding.action,
          target_fingerprint: binding.target_fingerprint,
          command_fingerprint,
          principal: PRINCIPAL,
          policy_version: POLICY_VERSION,
        };
        return harness.repository.runAuthorizedW6Action(
          { grant: Object.freeze(Object.create(null)), claims },
          () => harness.repository.commitW6Transition(input),
        );
      },
    }),
    /unknown|consumed|capability/u,
  );
  assert.equal((await harness.repository.findW6ClusterById(CLUSTER_ID)).status, "候选");
});

test("W6 rejects extra cross-action fields for every closed transition variant", async () => {
  const variants = [
    transitionBase("review_candidate", {
      expected_cluster_fingerprint: "0".repeat(64),
      decision: "submit_for_review",
      reason: "closed review command",
    }),
    transitionBase("start_improvement", {
      expected_cluster_fingerprint: "0".repeat(64),
      improvement: {
        version: "synthetic.1",
        owner_role: "合成改进负责人",
        measure: "复核合成链路。",
        observation_window_days: [7, 30],
        clock_source: "test",
        metric_formula: "观察窗内同类案件数",
      },
      root_cause_hypothesis: rootCauseHypothesis(),
      reason: "closed start command",
    }),
    transitionBase("enter_observation", {
      expected_cluster_fingerprint: "0".repeat(64),
      expected_improvement_fingerprint: "1".repeat(64),
      cycle_id: "SYN-W6-CYCLE-CLOSED",
      clock_source: "test",
      reason: "closed observation command",
    }),
    transitionBase("record_day_7", {
      expected_cluster_fingerprint: "0".repeat(64),
      expected_improvement_fingerprint: "1".repeat(64),
      cycle_id: "SYN-W6-CYCLE-CLOSED",
      clock_source: "test",
      recurrence_case_ids: [],
      related_task_volume: null,
      checkpoint_id: "SYN-W6-CHECKPOINT-CLOSED-7",
    }),
    transitionBase("record_day_30", {
      expected_cluster_fingerprint: "0".repeat(64),
      expected_improvement_fingerprint: "1".repeat(64),
      cycle_id: "SYN-W6-CYCLE-CLOSED",
      clock_source: "test",
      recurrence_case_ids: [],
      related_task_volume: null,
      checkpoint_id: "SYN-W6-CHECKPOINT-CLOSED-30",
    }),
    transitionBase("archive_observation", {
      expected_cluster_fingerprint: "0".repeat(64),
      expected_improvement_fingerprint: "1".repeat(64),
      cycle_id: "SYN-W6-CYCLE-CLOSED",
      human_conclusion: "人工结论",
      reason: "closed archive command",
    }),
    transitionBase("reopen_recurrence", {
      expected_cluster_fingerprint: "0".repeat(64),
      expected_improvement_fingerprint: "1".repeat(64),
      case_ids: [CASE_A, CASE_B, CASE_C],
      cycle_id: "SYN-W6-CYCLE-CLOSED",
      triggering_case_ids: [CASE_C],
      clock_source: "test",
      reason: "closed recurrence command",
    }),
    transitionBase("intake_active_observation_recurrence", {
      expected_cluster_fingerprint: "0".repeat(64),
      expected_improvement_fingerprint: "1".repeat(64),
      expected_w6_state_fingerprint: "2".repeat(64),
      case_ids: [CASE_A, CASE_B, CASE_C],
      cycle_id: "SYN-W6-CYCLE-CLOSED",
      triggering_case_ids: [CASE_C],
      intake_id: "SYN-W6-ACTIVE-INTAKE-CLOSED",
      clock_source: "test",
      n5_validation_fingerprint: "3".repeat(64),
      reason: "closed active recurrence intake command",
    }),
  ];
  for (const [index, variant] of variants.entries()) {
    const harness = await makeHarness({ caseIds: [CASE_A, CASE_B, CASE_C] });
    await createCandidate(harness);
    const input = {
      ...variant,
      history_id: `SYN-W6-HISTORY-CLOSED-${index}`,
      receipt_id: `SYN-W6-RECEIPT-CLOSED-${index}`,
      unexpected_cross_action_field: "must be rejected",
    };
    await assert.rejects(
      inEvent(harness.repository, {
        command: input,
        lockResources: resources(input.case_ids, input.cluster_id, input.improvement_id),
        operation: () => harness.repository.commitW6Transition(input),
      }),
      /closed transition command|exact|field/u,
      input.action,
    );
  }
});

test("W6 rejects a wrong-channel grant and consumes a valid grant exactly once", async () => {
  const harness = await makeHarness();
  await createCandidate(harness);
  const fingerprints = await currentFingerprints(harness.repository);
  const input = transitionBase("review_candidate", {
    expected_cluster_fingerprint: fingerprints.cluster,
    decision: "submit_for_review",
    reason: "不同 capability channel 不能互通。",
  });
  const otherChannel = createW6AuthorizationGrantChannel();
  await assert.rejects(authorizedCommit(harness, input, { issuer: otherChannel.issuer }), /unknown|capability/u);

  let sharedGrant;
  await inEvent(harness.repository, {
    command: input,
    lockResources: resources(input.case_ids),
    operation: async ({ event_id, command_fingerprint }) => {
      const binding = createW6AuthorizationBinding(input);
      const claims = {
        workflow: "W6",
        event_id,
        phase: binding.phase,
        case_ids: binding.case_ids,
        cluster_id: binding.cluster_id,
        improvement_id: binding.improvement_id,
        action: binding.action,
        target_fingerprint: binding.target_fingerprint,
        command_fingerprint,
        principal: PRINCIPAL,
        policy_version: POLICY_VERSION,
      };
      sharedGrant = harness.grantChannel.issuer.issue(claims);
      await harness.repository.runAuthorizedW6Action(
        { grant: sharedGrant, claims },
        () => harness.repository.commitW6Transition(input),
      );
      await assert.rejects(
        harness.repository.runAuthorizedW6Action(
          { grant: sharedGrant, claims },
          () => harness.repository.commitW6Transition(input),
        ),
        /consumed|unknown/u,
      );
    },
  });
});

test("W6 rejects every mismatched grant claim before transition writes", async () => {
  const mutations = {
    workflow: "W5",
    event_id: "SYN-EVENT-WRONG",
    phase: "recurrence",
    case_ids: [CASE_B, CASE_A],
    cluster_id: "SYN-CLUSTER-WRONG",
    improvement_id: "SYN-IMPROVEMENT-WRONG",
    action: "archive_observation",
    target_fingerprint: "0".repeat(64),
    command_fingerprint: "1".repeat(64),
    principal: { ...PRINCIPAL, principal_id: "SYN-PRINCIPAL-WRONG" },
    policy_version: "synthetic-w6-wrong-policy",
  };
  for (const [field, value] of Object.entries(mutations)) {
    const harness = await makeHarness();
    await createCandidate(harness);
    const fingerprints = await currentFingerprints(harness.repository);
    const input = transitionBase("review_candidate", {
      expected_cluster_fingerprint: fingerprints.cluster,
      decision: "submit_for_review",
      reason: `claim mismatch: ${field}`,
      history_id: `SYN-W6-HISTORY-CLAIM-${field}`,
      receipt_id: `SYN-W6-RECEIPT-CLAIM-${field}`,
    });
    await assert.rejects(authorizedCommit(harness, input, {
      claim_overrides: { [field]: value },
    }), /claim|context|authorization|capability|invariant/u, field);
    assert.equal((await harness.repository.findW6ClusterById(CLUSTER_ID)).status, "候选", field);
  }
});

test("W6 multi-resource locks sort callers consistently, serialize overlap, and reject re-entry", async () => {
  const harness = await makeHarness({ caseIds: [CASE_A, CASE_B, CASE_C] });
  let active = 0;
  let maxActive = 0;
  const run = (caseIds, clusterId) => harness.repository.runW6ResourcesExclusive(
    resources(caseIds, clusterId, IMPROVEMENT_ID),
    async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await Promise.resolve();
      active -= 1;
    },
  );
  await Promise.all([
    run([CASE_B, CASE_A], CLUSTER_ID),
    run([CASE_A, CASE_B], CLUSTER_ID),
  ]);
  assert.equal(maxActive, 1);
  await harness.repository.runW6ResourcesExclusive(resources([CASE_A], CLUSTER_ID), async () => {
    await assert.rejects(
      harness.repository.runW6ResourcesExclusive(resources([CASE_A], CLUSTER_ID), async () => undefined),
      /Reentrant|active.*lock/u,
    );
  });
});

test("W6 start_improvement atomically moves the cluster and creates one executing project", async () => {
  const harness = await reviewedHarness();
  const fingerprints = await currentFingerprints(harness.repository);
  const aiBinding = await n6ValidationBinding(harness.repository);
  const input = transitionBase("start_improvement", {
    expected_cluster_fingerprint: fingerprints.cluster,
    improvement: {
      version: "synthetic.1",
      owner_role: "合成改进负责人",
      measure: "复核舱门解锁链路。",
      observation_window_days: [7, 30],
      clock_source: "test",
      metric_formula: "观察窗内同类案件数",
    },
    root_cause_hypothesis: aiBinding.rootCause,
    reason: "审核通过并启动改进。",
  });
  const committed = await validatedAuthorizedCommit(harness, input, { ai_binding: aiBinding });
  assert.equal(committed.output.cluster.status, "改进中");
  assert.equal(committed.output.improvement.status, "执行中");
  assert.equal(committed.output.cluster.active_improvement_id, IMPROVEMENT_ID);
  assert.equal(committed.output.improvement.cluster_id, CLUSTER_ID);
  assert.equal((await harness.repository.getW6History(CLUSTER_ID)).receipts.length, 3);
});

test("W6 enter_observation atomically moves both records and creates an immutable first cycle", async () => {
  const harness = await activeImprovementHarness();
  const fingerprints = await currentFingerprints(harness.repository, CLUSTER_ID, IMPROVEMENT_ID);
  const input = transitionBase("enter_observation", {
    expected_cluster_fingerprint: fingerprints.cluster,
    expected_improvement_fingerprint: fingerprints.improvement,
    cycle_id: "SYN-W6-CYCLE-001",
    clock_source: "test",
    occurred_at: OBSERVATION_OPENED_AT,
    reason: "措施完成后进入观察。",
  });
  const committed = await authorizedCommit(harness, input);
  assert.equal(committed.output.cluster.status, "观察中");
  assert.equal(committed.output.improvement.status, "观察中");
  assert.equal(committed.output.observation_cycle.ordinal, 1);
  assert.equal(committed.output.observation_cycle.trigger, "initial_observation");

  committed.output.observation_cycle.triggering_case_ids.push("SYN-TAMPER");
  const history = await harness.repository.getW6History(CLUSTER_ID);
  assert.deepEqual(history.observation_cycles[0].triggering_case_ids, [CASE_A, CASE_B]);
});

test("W6 day-7/day-30 checkpoints require exact test-clock windows and are idempotent without a human grant", async () => {
  const harness = await observingHarness();
  let fingerprints = await currentFingerprints(harness.repository, CLUSTER_ID, IMPROVEMENT_ID);
  const early = transitionBase("record_day_7", {
    expected_cluster_fingerprint: fingerprints.cluster,
    expected_improvement_fingerprint: fingerprints.improvement,
    cycle_id: "SYN-W6-CYCLE-001",
    clock_source: "test",
    recurrence_case_ids: [],
    related_task_volume: null,
    checkpoint_id: "SYN-W6-CHECKPOINT-EARLY",
    occurred_at: "2026-08-08T23:59:59.000Z",
  });
  await assert.rejects(timedCommit(harness, early), /7|window|clock|exact/u);

  await assert.rejects(timedCommit(harness, {
    ...early,
    recurrence_case_ids: [CASE_A],
    related_task_volume: 1,
    checkpoint_id: "SYN-W6-CHECKPOINT-PRE-WINDOW",
    history_id: "SYN-W6-HISTORY-PRE-WINDOW",
    receipt_id: "SYN-W6-RECEIPT-PRE-WINDOW",
    occurred_at: DAY_7_AT,
  }), /window|closed_at|temporal|evidence/u);

  const day7 = { ...early, checkpoint_id: "SYN-W6-CHECKPOINT-DAY7-001", occurred_at: DAY_7_AT };
  const first = await timedCommit(harness, day7);
  const replay = await timedCommit(harness, {
    ...day7,
    history_id: "SYN-W6-HISTORY-DAY7-REPLAY",
    receipt_id: "SYN-W6-RECEIPT-DAY7-REPLAY",
  });
  assert.equal(first.output.outcome, "committed");
  assert.equal(replay.output.outcome, "idempotent");
  assert.equal(first.output.observation_checkpoint.recurrence_rate, null);
  await assert.rejects(timedCommit(harness, {
    ...day7,
    related_task_volume: 10,
    history_id: "SYN-W6-HISTORY-DAY7-CONFLICT",
    receipt_id: "SYN-W6-RECEIPT-DAY7-CONFLICT",
  }), /conflict|immutable/u);

  fingerprints = await currentFingerprints(harness.repository, CLUSTER_ID, IMPROVEMENT_ID);
  const day30 = transitionBase("record_day_30", {
    expected_cluster_fingerprint: fingerprints.cluster,
    expected_improvement_fingerprint: fingerprints.improvement,
    cycle_id: "SYN-W6-CYCLE-001",
    clock_source: "test",
    recurrence_case_ids: [],
    related_task_volume: 100,
    checkpoint_id: "SYN-W6-CHECKPOINT-DAY30-001",
    occurred_at: DAY_30_AT,
  });
  const thirty = await timedCommit(harness, day30);
  assert.equal(thirty.output.observation_checkpoint.recurrence_rate, 0);
  assert.deepEqual(
    (await harness.repository.getW6History(CLUSTER_ID)).observation_checkpoints.map((entry) => entry.horizon_days),
    [7, 30],
  );
});

test("W6 archive requires both checkpoints, an authorized grant, and a non-empty human conclusion", async () => {
  const premature = await observingHarness();
  let fingerprints = await currentFingerprints(premature.repository, CLUSTER_ID, IMPROVEMENT_ID);
  const input = transitionBase("archive_observation", {
    expected_cluster_fingerprint: fingerprints.cluster,
    expected_improvement_fingerprint: fingerprints.improvement,
    cycle_id: "SYN-W6-CYCLE-001",
    human_conclusion: "人工结论",
    reason: "尝试提前归档。",
    occurred_at: "2026-08-02T01:00:00.000Z",
  });
  await assert.rejects(authorizedCommit(premature, input), /day.?7|day.?30|checkpoint|观察/u);

  const ready = await observedThirtyDaysHarness();
  fingerprints = await currentFingerprints(ready.repository, CLUSTER_ID, IMPROVEMENT_ID);
  const emptyConclusion = transitionBase("archive_observation", {
    expected_cluster_fingerprint: fingerprints.cluster,
    expected_improvement_fingerprint: fingerprints.improvement,
    cycle_id: "SYN-W6-CYCLE-001",
    human_conclusion: " ",
    reason: "结论不得为空。",
    occurred_at: "2026-09-01T01:00:00.000Z",
  });
  await assert.rejects(authorizedCommit(ready, emptyConclusion), /conclusion|结论/u);

  const archived = await authorizedCommit(ready, {
    ...emptyConclusion,
    human_conclusion: "7 天与 30 天合成观察均已复核，授权人工确认归档。",
    history_id: "SYN-W6-HISTORY-ARCHIVE-VALID",
    receipt_id: "SYN-W6-RECEIPT-ARCHIVE-VALID",
  });
  assert.equal(archived.output.cluster.status, "已归档");
  assert.equal(archived.output.improvement.status, "已完成");
});

test("W6 recurrence reopens cluster and improvement together once while preserving old cycles and case ownership", async () => {
  const harness = await archivedHarness({ includeCaseC: true });
  const beforeCases = await Promise.all([CASE_A, CASE_B, CASE_C].map((id) => harness.repository.findCaseById(id)));
  const beforeLinks = [...harness.repository.caseByFeedbackId.entries()];
  const beforeHistory = await harness.repository.getW6History(CLUSTER_ID);
  const fingerprints = await currentFingerprints(harness.repository, CLUSTER_ID, IMPROVEMENT_ID);
  const base = transitionBase("reopen_recurrence", {
    case_ids: [CASE_A, CASE_B, CASE_C],
    expected_cluster_fingerprint: fingerprints.cluster,
    expected_improvement_fingerprint: fingerprints.improvement,
    cycle_id: "SYN-W6-CYCLE-002",
    triggering_case_ids: [CASE_C],
    clock_source: "test",
    occurred_at: "2026-09-03T00:00:00.000Z",
    reason: "出现新的独立合成复发案件，授权人工确认重开观察。",
  });
  const left = authorizedCommit(harness, base, { event_id: "SYN-EVENT-W6-RECURRENCE-A" });
  const right = authorizedCommit(harness, {
    ...base,
    history_id: "SYN-W6-HISTORY-RECURRENCE-B",
    receipt_id: "SYN-W6-RECEIPT-RECURRENCE-B",
  }, { event_id: "SYN-EVENT-W6-RECURRENCE-B" });
  const results = await Promise.all([left, right]);
  assert.deepEqual(new Set(results.map((entry) => entry.output.outcome)), new Set(["committed", "idempotent"]));
  const after = await harness.repository.getW6History(CLUSTER_ID);
  assert.equal((await harness.repository.findW6ClusterById(CLUSTER_ID)).status, "观察中");
  assert.equal((await harness.repository.findW6ImprovementById(IMPROVEMENT_ID)).status, "观察中");
  assert.equal(after.observation_cycles.length, beforeHistory.observation_cycles.length + 1);
  assert.deepEqual(after.observation_cycles[0], beforeHistory.observation_cycles[0]);
  assert.equal(after.observation_cycles[1].ordinal, 2);
  assert.deepEqual(await Promise.all([CASE_A, CASE_B, CASE_C].map((id) => harness.repository.findCaseById(id))), beforeCases);
  assert.deepEqual([...harness.repository.caseByFeedbackId.entries()], beforeLinks);

  await assert.rejects(authorizedCommit(harness, {
    ...base,
    expected_cluster_fingerprint: "0".repeat(64),
    expected_improvement_fingerprint: "1".repeat(64),
    cycle_id: "SYN-W6-CYCLE-CONFLICT",
    occurred_at: "2027-12-31T23:59:59.000Z",
    reason: "同触发案件但不同的业务命令不能被当作幂等。",
    history_id: "SYN-W6-HISTORY-RECURRENCE-CONFLICT",
    receipt_id: "SYN-W6-RECEIPT-RECURRENCE-CONFLICT",
  }, { event_id: "SYN-EVENT-W6-RECURRENCE-CONFLICT" }), /idempotency|semantic|conflict/u);

  const staleSubset = candidateInput(harness.repository, {
    case_ids: [CASE_A, CASE_B],
    cluster_id: "SYN-CLUSTER-W6-STALE-SUBSET",
    proposal_id: "SYN-W6-PROPOSAL-STALE-SUBSET",
    history_id: "SYN-W6-HISTORY-CANDIDATE-STALE-SUBSET",
    receipt_id: "SYN-W6-RECEIPT-CANDIDATE-STALE-SUBSET",
  });
  await assert.rejects(
    inEvent(harness.repository, {
      command: staleSubset,
      lockResources: resources([CASE_A, CASE_B], staleSubset.cluster_id),
      operation: () => harness.repository.createW6ClusterCandidateIfAbsent(staleSubset),
    }),
    /already belongs|overlap|recurrence path/u,
  );
});

test("W6 recurrence rejects a trigger case owned by another authoritative problem cluster", async () => {
  const harness = await archivedHarness();
  await seedClosedCase(harness.repository, harness.w5GrantChannel.issuer, CASE_C, 3);
  await seedClosedCase(harness.repository, harness.w5GrantChannel.issuer, CASE_D, 4);
  await createCandidate(harness, {
    case_ids: [CASE_C, CASE_D],
    cluster_id: "SYN-CLUSTER-W6-OTHER",
    proposal_id: "SYN-W6-PROPOSAL-OTHER",
    history_id: "SYN-W6-HISTORY-CANDIDATE-OTHER",
    receipt_id: "SYN-W6-RECEIPT-CANDIDATE-OTHER",
  });
  const fingerprints = await currentFingerprints(harness.repository, CLUSTER_ID, IMPROVEMENT_ID);
  const input = transitionBase("reopen_recurrence", {
    case_ids: [CASE_A, CASE_B, CASE_C],
    expected_cluster_fingerprint: fingerprints.cluster,
    expected_improvement_fingerprint: fingerprints.improvement,
    cycle_id: "SYN-W6-CYCLE-CROSS-CLUSTER",
    triggering_case_ids: [CASE_C],
    clock_source: "test",
    occurred_at: "2026-09-03T00:00:00.000Z",
    reason: "跨簇成员不得通过复发路径重叠写入。",
  });
  await assert.rejects(authorizedCommit(harness, input), /another|other|cluster|overlap|belongs/u);
  assert.deepEqual((await harness.repository.findW6ClusterById(CLUSTER_ID)).member_case_ids, [CASE_A, CASE_B]);
  assert.deepEqual(
    (await harness.repository.findW6ClusterById("SYN-CLUSTER-W6-OTHER")).member_case_ids,
    [CASE_C, CASE_D],
  );
});

test("W6 recurrence checkpoints bind immutable temporal evidence and keep day-30 cumulative", async () => {
  const harness = await archivedHarness({ includeCaseC: true });
  await seedClosedCase(harness.repository, harness.w5GrantChannel.issuer, CASE_D, 4, {
    updated_at: "2026-09-01T01:00:00.002Z",
    closed_at: "2026-09-01T01:00:00.002Z",
  });
  let fingerprints = await currentFingerprints(harness.repository, CLUSTER_ID, IMPROVEMENT_ID);
  const reopen = transitionBase("reopen_recurrence", {
    case_ids: [CASE_A, CASE_B, CASE_C, CASE_D],
    expected_cluster_fingerprint: fingerprints.cluster,
    expected_improvement_fingerprint: fingerprints.improvement,
    cycle_id: "SYN-W6-CYCLE-002",
    triggering_case_ids: [CASE_C, CASE_D],
    clock_source: "test",
    occurred_at: "2026-09-03T00:00:00.000Z",
    reason: "授权人工以复发检测时刻开启新观察周期。",
  });
  await authorizedCommit(harness, reopen);
  fingerprints = await currentFingerprints(harness.repository, CLUSTER_ID, IMPROVEMENT_ID);
  const day7 = transitionBase("record_day_7", {
    case_ids: [CASE_A, CASE_B, CASE_C, CASE_D],
    expected_cluster_fingerprint: fingerprints.cluster,
    expected_improvement_fingerprint: fingerprints.improvement,
    cycle_id: "SYN-W6-CYCLE-002",
    clock_source: "test",
    recurrence_case_ids: [CASE_C, CASE_D],
    related_task_volume: 2,
    checkpoint_id: "SYN-W6-CHECKPOINT-RECURRENCE-DAY7",
    history_id: "SYN-W6-HISTORY-RECURRENCE-DAY7",
    receipt_id: "SYN-W6-RECEIPT-RECURRENCE-DAY7",
    occurred_at: "2026-09-10T00:00:00.000Z",
  });
  await assert.rejects(timedCommit(harness, {
    ...day7,
    related_task_volume: 1,
    checkpoint_id: "SYN-W6-CHECKPOINT-RECURRENCE-DAY7-UNDERSIZED",
    history_id: "SYN-W6-HISTORY-RECURRENCE-DAY7-UNDERSIZED",
    receipt_id: "SYN-W6-RECEIPT-RECURRENCE-DAY7-UNDERSIZED",
  }), /volume|count|coherent|window/u);
  const day7Result = await timedCommit(harness, day7);
  assert.equal(day7Result.output.observation_checkpoint.recurrence_rate, 1);
  assert.equal(day7Result.output.observation_checkpoint.window_opened_at, "2026-09-03T00:00:00.000Z");
  assert.deepEqual(
    day7Result.output.observation_checkpoint.recurrence_case_snapshots.map((entry) => ({
      case_id: entry.case_id,
      observed_at: entry.observed_at,
      time_source: entry.time_source,
    })),
    [CASE_C, CASE_D].map((case_id) => ({
      case_id,
      observed_at: "2026-09-03T00:00:00.000Z",
      time_source: "authorized_reopen",
    })),
  );
  day7Result.output.observation_checkpoint.recurrence_case_snapshots[0].feedback_links[0].feedback_id = "tampered";
  assert.notEqual(
    (await harness.repository.getW6History(CLUSTER_ID)).observation_checkpoints.at(-1)
      .recurrence_case_snapshots[0].feedback_links[0].feedback_id,
    "tampered",
  );

  fingerprints = await currentFingerprints(harness.repository, CLUSTER_ID, IMPROVEMENT_ID);
  const day30 = transitionBase("record_day_30", {
    case_ids: [CASE_A, CASE_B, CASE_C, CASE_D],
    expected_cluster_fingerprint: fingerprints.cluster,
    expected_improvement_fingerprint: fingerprints.improvement,
    cycle_id: "SYN-W6-CYCLE-002",
    clock_source: "test",
    recurrence_case_ids: [],
    related_task_volume: null,
    checkpoint_id: "SYN-W6-CHECKPOINT-RECURRENCE-DAY30",
    history_id: "SYN-W6-HISTORY-RECURRENCE-DAY30",
    receipt_id: "SYN-W6-RECEIPT-RECURRENCE-DAY30",
    occurred_at: "2026-10-03T00:00:00.000Z",
  });
  await assert.rejects(timedCommit(harness, day30), /day-7|cumulative|include|recurrence/u);
  const validDay30 = await timedCommit(harness, {
    ...day30,
    recurrence_case_ids: [CASE_C, CASE_D],
    checkpoint_id: "SYN-W6-CHECKPOINT-RECURRENCE-DAY30-VALID",
    history_id: "SYN-W6-HISTORY-RECURRENCE-DAY30-VALID",
    receipt_id: "SYN-W6-RECEIPT-RECURRENCE-DAY30-VALID",
  });
  assert.equal(validDay30.output.observation_checkpoint.recurrence_rate, null);
  assert.equal(validDay30.output.observation_checkpoint.recurrence_case_snapshots.length, 2);
});

test("W6 revalidates CAS and grant target after an authorization wait and returns only immutable clones", async () => {
  const harness = await makeHarness();
  await createCandidate(harness);
  const fingerprints = await currentFingerprints(harness.repository);
  const stale = transitionBase("review_candidate", {
    expected_cluster_fingerprint: fingerprints.cluster,
    decision: "submit_for_review",
    reason: "这个命令在授权等待后已经过期。",
  });
  const winner = { ...stale, history_id: "SYN-W6-HISTORY-WINNER", receipt_id: "SYN-W6-RECEIPT-WINNER" };
  await authorizedCommit(harness, winner);

  const staleAttempt = await authorizedCommit(harness, stale);
  assert.equal(staleAttempt.output.outcome, "concurrency_conflict");
  assert.equal(staleAttempt.output.cluster.status, "待审核");

  staleAttempt.output.cluster.name = "tampered clone";
  staleAttempt.output.receipt.state_fingerprint = "0".repeat(64);
  assert.notEqual((await harness.repository.findW6ClusterById(CLUSTER_ID)).name, "tampered clone");
  assert.notEqual(
    (await harness.repository.getW6History(CLUSTER_ID)).receipts.at(-1).state_fingerprint,
    "0".repeat(64),
  );
});

test("W6 raw transition boundary rejects root and nested descriptors before authorization without reading getters", async () => {
  const failures = [];
  const descriptorMutations = [
    ["getter", (value, tracker, field) => Object.defineProperty(value, field, {
      get() {
        tracker.reads += 1;
        return field === "reason" ? "safe review reason" : "safe improvement measure";
      },
      enumerable: true,
      configurable: true,
    })],
    ["inherited", (value) => Object.setPrototypeOf(value, { inherited_extra: "forbidden" })],
    ["non_enumerable", (value) => Object.defineProperty(value, "hidden_extra", {
      value: "forbidden",
      enumerable: false,
      configurable: true,
    })],
    ["symbol", (value) => { value[Symbol("forbidden")] = "forbidden"; }],
    ["custom_prototype", (value) => {
      class CustomBoundaryObject {}
      Object.setPrototypeOf(value, CustomBoundaryObject.prototype);
    }],
  ];

  for (const [label, mutate] of descriptorMutations) {
    const harness = await makeHarness();
    await createCandidate(harness);
    const fingerprints = await currentFingerprints(harness.repository);
    const safeInput = transitionBase("review_candidate", {
      expected_cluster_fingerprint: fingerprints.cluster,
      decision: "submit_for_review",
      reason: "safe review reason",
      history_id: `SYN-W6-HISTORY-ROOT-BOUNDARY-${label}`,
      receipt_id: `SYN-W6-RECEIPT-ROOT-BOUNDARY-${label}`,
    });
    const rawInput = structuredClone(safeInput);
    const tracker = { reads: 0 };
    mutate(rawInput, tracker, "reason");
    const before = await w6DurableState(harness.repository);
    const result = await captureRejectedWithoutMutation({
      before,
      repository: harness.repository,
      errorPattern: /W6 transition plain JSON boundary/iu,
      operation: () => authorizedRawCommit(harness, rawInput, safeInput),
    });
    if (!result.rejected || !result.expected_error || !result.unchanged || tracker.reads !== 0) {
      failures.push({ scope: "root", label, tracker_reads: tracker.reads, ...result });
    }
  }

  for (const [label, mutate] of descriptorMutations) {
    const harness = await reviewedHarness();
    const fingerprints = await currentFingerprints(harness.repository);
    const safeInput = transitionBase("start_improvement", {
      expected_cluster_fingerprint: fingerprints.cluster,
      improvement: {
        version: "synthetic.1",
        owner_role: "合成改进负责人",
        measure: "safe improvement measure",
        observation_window_days: [7, 30],
        clock_source: "test",
        metric_formula: "观察窗内同类案件数",
      },
      root_cause_hypothesis: rootCauseHypothesis(),
      reason: "safe nested boundary",
      history_id: `SYN-W6-HISTORY-NESTED-BOUNDARY-${label}`,
      receipt_id: `SYN-W6-RECEIPT-NESTED-BOUNDARY-${label}`,
    });
    const rawInput = structuredClone(safeInput);
    const tracker = { reads: 0 };
    mutate(rawInput.improvement, tracker, "measure");
    const before = await w6DurableState(harness.repository);
    const result = await captureRejectedWithoutMutation({
      before,
      repository: harness.repository,
      errorPattern: /W6 transition plain JSON boundary/iu,
      operation: () => authorizedRawCommit(harness, rawInput, safeInput),
    });
    if (!result.rejected || !result.expected_error || !result.unchanged || tracker.reads !== 0) {
      failures.push({ scope: "nested_improvement", label, tracker_reads: tracker.reads, ...result });
    }
  }
  assert.deepEqual(failures, []);
});

test("W6 raw transition boundary rejects non-JSON values, cycles, and malformed arrays before authorization", async () => {
  const failures = [];
  const invalidMutations = [
    ["function", (input) => { input.reason = () => "forbidden"; }],
    ["cycle", (input) => { input.reason = input; }],
    ["non_finite", (input) => { input.reason = Number.POSITIVE_INFINITY; }],
    ["sparse_array", (input) => {
      input.case_ids = new Array(2);
      input.case_ids[0] = CASE_A;
    }],
    ["non_index_array_property", (input) => { input.case_ids.extra = "forbidden"; }],
    ["undefined", (input) => { input.reason = undefined; }],
  ];
  for (const [label, mutate] of invalidMutations) {
    const harness = await makeHarness();
    await createCandidate(harness);
    const fingerprints = await currentFingerprints(harness.repository);
    const safeInput = transitionBase("review_candidate", {
      expected_cluster_fingerprint: fingerprints.cluster,
      decision: "submit_for_review",
      reason: "safe raw JSON boundary",
      history_id: `SYN-W6-HISTORY-JSON-BOUNDARY-${label}`,
      receipt_id: `SYN-W6-RECEIPT-JSON-BOUNDARY-${label}`,
    });
    const rawInput = structuredClone(safeInput);
    mutate(rawInput);
    const before = await w6DurableState(harness.repository);
    const result = await captureRejectedWithoutMutation({
      before,
      repository: harness.repository,
      errorPattern: /W6 transition plain JSON boundary/iu,
      operation: () => authorizedRawCommit(harness, rawInput, safeInput),
    });
    if (!result.rejected || !result.expected_error || !result.unchanged) {
      failures.push({ label, ...result });
    }
  }
  assert.deepEqual(failures, []);
});

test("W6 start-improvement boundary closes root-cause and evidence shapes before authorization", async () => {
  const failures = [];
  const exactShapeMutations = [
    ["root_cause_extra", (input) => { input.root_cause_hypothesis.final_decision = "forbidden"; }],
    ["supporting_evidence_extra", (input) => {
      input.root_cause_hypothesis.supporting_evidence[0].automatic_action = "forbidden";
    }],
    ["counter_evidence_extra", (input) => {
      input.root_cause_hypothesis.counter_evidence[0].responsibility = "forbidden";
    }],
  ];
  for (const [label, mutate] of exactShapeMutations) {
    const harness = await reviewedHarness();
    const fingerprints = await currentFingerprints(harness.repository);
    const safeInput = transitionBase("start_improvement", {
      expected_cluster_fingerprint: fingerprints.cluster,
      improvement: {
        version: "synthetic.1",
        owner_role: "合成改进负责人",
        measure: "safe exact nested shape",
        observation_window_days: [7, 30],
        clock_source: "test",
        metric_formula: "观察窗内同类案件数",
      },
      root_cause_hypothesis: rootCauseHypothesis(),
      reason: "safe exact nested shape",
      history_id: `SYN-W6-HISTORY-EXACT-NESTED-${label}`,
      receipt_id: `SYN-W6-RECEIPT-EXACT-NESTED-${label}`,
    });
    const rawInput = structuredClone(safeInput);
    mutate(rawInput);
    const before = await w6DurableState(harness.repository);
    const result = await captureRejectedWithoutMutation({
      before,
      repository: harness.repository,
      errorPattern: /W6 closed transition command.*nested|W6 closed transition command is invalid/iu,
      operation: () => authorizedRawCommit(harness, rawInput, safeInput),
    });
    if (!result.rejected || !result.expected_error || !result.unchanged) {
      failures.push({ label, ...result });
    }
  }
  assert.deepEqual(failures, []);
});

test("W6 authorized transitions reject occurred_at earlier than authoritative cluster or improvement time", async () => {
  const failures = [];
  const attempts = [
    ["review_candidate", async () => {
      const harness = await makeHarness();
      await createCandidate(harness);
      const fingerprints = await currentFingerprints(harness.repository);
      return {
        harness,
        input: transitionBase("review_candidate", {
          expected_cluster_fingerprint: fingerprints.cluster,
          decision: "submit_for_review",
          reason: "backdated review",
          occurred_at: "2026-07-01T00:00:00.000Z",
          history_id: "SYN-W6-HISTORY-BACKDATED-REVIEW",
          receipt_id: "SYN-W6-RECEIPT-BACKDATED-REVIEW",
        }),
      };
    }],
    ["start_improvement", async () => {
      const harness = await reviewedHarness();
      const fingerprints = await currentFingerprints(harness.repository);
      const aiBinding = await n6ValidationBinding(harness.repository);
      return {
        harness,
        aiBinding,
        input: transitionBase("start_improvement", {
          expected_cluster_fingerprint: fingerprints.cluster,
          improvement: {
            version: "synthetic.1",
            owner_role: "合成改进负责人",
            measure: "backdated start",
            observation_window_days: [7, 30],
            clock_source: "test",
            metric_formula: "观察窗内同类案件数",
          },
          root_cause_hypothesis: aiBinding.rootCause,
          reason: "backdated start",
          occurred_at: "2026-07-01T00:00:00.000Z",
          history_id: "SYN-W6-HISTORY-BACKDATED-START",
          receipt_id: "SYN-W6-RECEIPT-BACKDATED-START",
        }),
      };
    }],
    ["enter_observation", async () => {
      const harness = await activeImprovementHarness();
      const fingerprints = await currentFingerprints(harness.repository, CLUSTER_ID, IMPROVEMENT_ID);
      return {
        harness,
        input: transitionBase("enter_observation", {
          expected_cluster_fingerprint: fingerprints.cluster,
          expected_improvement_fingerprint: fingerprints.improvement,
          cycle_id: "SYN-W6-CYCLE-BACKDATED-ENTER",
          clock_source: "test",
          reason: "backdated enter",
          occurred_at: "2026-08-01T00:00:00.000Z",
          history_id: "SYN-W6-HISTORY-BACKDATED-ENTER",
          receipt_id: "SYN-W6-RECEIPT-BACKDATED-ENTER",
        }),
      };
    }],
    ["archive_observation", async () => {
      const harness = await observedThirtyDaysHarness();
      const fingerprints = await currentFingerprints(harness.repository, CLUSTER_ID, IMPROVEMENT_ID);
      return {
        harness,
        input: transitionBase("archive_observation", {
          expected_cluster_fingerprint: fingerprints.cluster,
          expected_improvement_fingerprint: fingerprints.improvement,
          cycle_id: "SYN-W6-CYCLE-001",
          human_conclusion: "backdated archive",
          reason: "backdated archive",
          occurred_at: "2026-08-01T00:00:00.000Z",
          history_id: "SYN-W6-HISTORY-BACKDATED-ARCHIVE",
          receipt_id: "SYN-W6-RECEIPT-BACKDATED-ARCHIVE",
        }),
      };
    }],
    ["reopen_recurrence", async () => {
      const harness = await archivedHarness({ includeCaseC: true });
      const fingerprints = await currentFingerprints(harness.repository, CLUSTER_ID, IMPROVEMENT_ID);
      return {
        harness,
        input: transitionBase("reopen_recurrence", {
          case_ids: [CASE_A, CASE_B, CASE_C],
          expected_cluster_fingerprint: fingerprints.cluster,
          expected_improvement_fingerprint: fingerprints.improvement,
          cycle_id: "SYN-W6-CYCLE-BACKDATED-REOPEN",
          triggering_case_ids: [CASE_C],
          clock_source: "test",
          reason: "backdated reopen",
          occurred_at: "2026-08-31T00:00:00.000Z",
          history_id: "SYN-W6-HISTORY-BACKDATED-REOPEN",
          receipt_id: "SYN-W6-RECEIPT-BACKDATED-REOPEN",
        }),
      };
    }],
  ];
  for (const [label, setup] of attempts) {
    const { harness, input, aiBinding } = await setup();
    const before = await w6DurableState(harness.repository);
    const result = await captureRejectedWithoutMutation({
      before,
      repository: harness.repository,
      errorPattern: /occurred_at|updated_at|chronological|monotonic|temporal|earlier/iu,
      operation: () => aiBinding
        ? validatedAuthorizedCommit(harness, input, { ai_binding: aiBinding })
        : authorizedCommit(harness, input),
    });
    if (!result.rejected || !result.expected_error || !result.unchanged) {
      failures.push({ label, ...result });
    }
  }
  assert.deepEqual(failures, []);
});

test("W6 recurrence and archive reject impossible trigger and checkpoint chronology without partial writes", async () => {
  const failures = [];

  const triggerHarness = await archivedHarness();
  await seedClosedCase(triggerHarness.repository, triggerHarness.w5GrantChannel.issuer, CASE_C, 3, {
    updated_at: "2026-09-04T00:00:00.000Z",
    closed_at: "2026-09-04T00:00:00.000Z",
  });
  let fingerprints = await currentFingerprints(triggerHarness.repository, CLUSTER_ID, IMPROVEMENT_ID);
  const triggerInput = transitionBase("reopen_recurrence", {
    case_ids: [CASE_A, CASE_B, CASE_C],
    expected_cluster_fingerprint: fingerprints.cluster,
    expected_improvement_fingerprint: fingerprints.improvement,
    cycle_id: "SYN-W6-CYCLE-FUTURE-CLOSED-TRIGGER",
    triggering_case_ids: [CASE_C],
    clock_source: "test",
    reason: "trigger closes after reopen",
    occurred_at: "2026-09-03T00:00:00.000Z",
    history_id: "SYN-W6-HISTORY-FUTURE-CLOSED-TRIGGER",
    receipt_id: "SYN-W6-RECEIPT-FUTURE-CLOSED-TRIGGER",
  });
  let before = await w6DurableState(triggerHarness.repository);
  let result = await captureRejectedWithoutMutation({
    before,
    repository: triggerHarness.repository,
    errorPattern: /closed_at|trigger|occurred_at|temporal|chronological/iu,
    operation: () => authorizedCommit(triggerHarness, triggerInput),
  });
  if (!result.rejected || !result.expected_error || !result.unchanged) {
    failures.push({ label: "trigger_closed_after_reopen", ...result });
  }

  const archiveHarness = await observedThirtyDaysHarness();
  fingerprints = await currentFingerprints(archiveHarness.repository, CLUSTER_ID, IMPROVEMENT_ID);
  const archiveInput = transitionBase("archive_observation", {
    expected_cluster_fingerprint: fingerprints.cluster,
    expected_improvement_fingerprint: fingerprints.improvement,
    cycle_id: "SYN-W6-CYCLE-001",
    human_conclusion: "archive before day-30 record",
    reason: "archive before day-30 record",
    occurred_at: "2026-08-31T00:00:00.000Z",
    history_id: "SYN-W6-HISTORY-ARCHIVE-BEFORE-DAY30",
    receipt_id: "SYN-W6-RECEIPT-ARCHIVE-BEFORE-DAY30",
  });
  before = await w6DurableState(archiveHarness.repository);
  result = await captureRejectedWithoutMutation({
    before,
    repository: archiveHarness.repository,
    errorPattern: /day.?30|recorded_at|archive|chronological|temporal/iu,
    operation: () => authorizedCommit(archiveHarness, archiveInput),
  });
  if (!result.rejected || !result.expected_error || !result.unchanged) {
    failures.push({ label: "archive_before_day30", ...result });
  }

  assert.deepEqual(failures, []);
});

test("W6 late recurrence replay remains idempotent after checkpoints and re-archive", async () => {
  const harness = await archivedHarness({ includeCaseC: true });
  let fingerprints = await currentFingerprints(harness.repository, CLUSTER_ID, IMPROVEMENT_ID);
  const reopen = transitionBase("reopen_recurrence", {
    case_ids: [CASE_A, CASE_B, CASE_C],
    expected_cluster_fingerprint: fingerprints.cluster,
    expected_improvement_fingerprint: fingerprints.improvement,
    cycle_id: "SYN-W6-CYCLE-LATE-REPLAY",
    triggering_case_ids: [CASE_C],
    clock_source: "test",
    reason: "late replay keeps the original recurrence semantics",
    occurred_at: "2026-09-03T00:00:00.000Z",
    history_id: "SYN-W6-HISTORY-LATE-REPLAY-ORIGINAL",
    receipt_id: "SYN-W6-RECEIPT-LATE-REPLAY-ORIGINAL",
  });
  const original = await authorizedCommit(harness, reopen, {
    event_id: "SYN-EVENT-W6-LATE-REPLAY-ORIGINAL",
  });
  assert.equal(original.output.outcome, "committed");

  fingerprints = await currentFingerprints(harness.repository, CLUSTER_ID, IMPROVEMENT_ID);
  await timedCommit(harness, transitionBase("record_day_7", {
    case_ids: [CASE_A, CASE_B, CASE_C],
    expected_cluster_fingerprint: fingerprints.cluster,
    expected_improvement_fingerprint: fingerprints.improvement,
    cycle_id: reopen.cycle_id,
    clock_source: "test",
    recurrence_case_ids: [CASE_C],
    related_task_volume: 1,
    checkpoint_id: "SYN-W6-CHECKPOINT-LATE-REPLAY-DAY7",
    history_id: "SYN-W6-HISTORY-LATE-REPLAY-DAY7",
    receipt_id: "SYN-W6-RECEIPT-LATE-REPLAY-DAY7",
    occurred_at: "2026-09-10T00:00:00.000Z",
  }));
  fingerprints = await currentFingerprints(harness.repository, CLUSTER_ID, IMPROVEMENT_ID);
  await timedCommit(harness, transitionBase("record_day_30", {
    case_ids: [CASE_A, CASE_B, CASE_C],
    expected_cluster_fingerprint: fingerprints.cluster,
    expected_improvement_fingerprint: fingerprints.improvement,
    cycle_id: reopen.cycle_id,
    clock_source: "test",
    recurrence_case_ids: [CASE_C],
    related_task_volume: 1,
    checkpoint_id: "SYN-W6-CHECKPOINT-LATE-REPLAY-DAY30",
    history_id: "SYN-W6-HISTORY-LATE-REPLAY-DAY30",
    receipt_id: "SYN-W6-RECEIPT-LATE-REPLAY-DAY30",
    occurred_at: "2026-10-03T00:00:00.000Z",
  }));
  fingerprints = await currentFingerprints(harness.repository, CLUSTER_ID, IMPROVEMENT_ID);
  await authorizedCommit(harness, transitionBase("archive_observation", {
    case_ids: [CASE_A, CASE_B, CASE_C],
    expected_cluster_fingerprint: fingerprints.cluster,
    expected_improvement_fingerprint: fingerprints.improvement,
    cycle_id: reopen.cycle_id,
    human_conclusion: "late replay cycle completed and was re-archived",
    reason: "late replay cycle completed and was re-archived",
    history_id: "SYN-W6-HISTORY-LATE-REPLAY-ARCHIVE",
    receipt_id: "SYN-W6-RECEIPT-LATE-REPLAY-ARCHIVE",
    occurred_at: "2026-10-03T01:00:00.000Z",
  }));

  const beforeReplay = await w6DurableState(harness.repository);
  const replay = await authorizedCommit(harness, {
    ...reopen,
    history_id: "SYN-W6-HISTORY-LATE-REPLAY-RETRY",
    receipt_id: "SYN-W6-RECEIPT-LATE-REPLAY-RETRY",
  }, {
    event_id: "SYN-EVENT-W6-LATE-REPLAY-RETRY",
  });
  assert.equal(replay.output.outcome, "idempotent");
  assert.equal(replay.output.receipt.receipt_id, original.output.receipt.receipt_id);
  assert.deepEqual(await w6DurableState(harness.repository), beforeReplay);
});

test("W6 start_improvement rejects a shape-valid free hypothesis without repository-issued N6 validation", async () => {
  const harness = await reviewedHarness();
  const fingerprints = await currentFingerprints(harness.repository);
  const input = transitionBase("start_improvement", {
    expected_cluster_fingerprint: fingerprints.cluster,
    improvement: {
      version: "synthetic.p1-red",
      owner_role: "合成改进负责人",
      measure: "不得让自由根因文本绕过受控 N6 目录。",
      observation_window_days: [7, 30],
      clock_source: "test",
      metric_formula: "观察窗内同类案件数",
    },
    root_cause_hypothesis: {
      ...rootCauseHypothesis(),
      hypothesis_id: "FREE-HYPOTHESIS-ID",
      statement: "这是未经过受控目录与确定性渲染的自由根因文本。",
    },
    reason: "直接仓储调用必须要求 repository-issued N6 validation receipt。",
    history_id: "SYN-W6-HISTORY-P1-N6-DIRECT-BYPASS",
    receipt_id: "SYN-W6-RECEIPT-P1-N6-DIRECT-BYPASS",
  });
  const before = await w6DurableState(harness.repository);
  const result = await captureRejectedWithoutMutation({
    before,
    repository: harness.repository,
    errorPattern: /N6|validation|receipt|capability/u,
    operation: () => authorizedCommit(harness, input, {
      event_id: "SYN-EVENT-W6-P1-N6-DIRECT-BYPASS",
    }),
  });
  assert.deepEqual(result, {
    rejected: true,
    expected_error: true,
    unchanged: true,
    error_message: result.error_message,
  });
});

test("W6 exposes a distinct active-observation recurrence intake transition", () => {
  const transition = snapshotW6AtomicTransition(transitionBase(
    "intake_active_observation_recurrence",
    {
      case_ids: [CASE_A, CASE_B, CASE_C],
      expected_cluster_fingerprint: "0".repeat(64),
      expected_improvement_fingerprint: "1".repeat(64),
      expected_w6_state_fingerprint: "2".repeat(64),
      cycle_id: "SYN-W6-CYCLE-001",
      triggering_case_ids: [CASE_C],
      intake_id: "SYN-W6-ACTIVE-INTAKE-001",
      clock_source: "test",
      n5_validation_fingerprint: "3".repeat(64),
      reason: "合成观察期内的新关闭案件经 N5 建议进入当前簇。",
    },
  ));
  assert.equal(transition.action, "intake_active_observation_recurrence");
});

test("W6 active-observation intake consumes N5 and human capabilities once and drives exact checkpoints", async () => {
  const harness = await observingHarness();
  await seedClosedCase(harness.repository, harness.w5GrantChannel.issuer, CASE_C, 3, {
    updated_at: "2026-08-05T00:00:00.000Z",
    closed_at: "2026-08-05T00:00:00.000Z",
  });
  const beforeCases = await Promise.all([CASE_A, CASE_B, CASE_C].map((id) =>
    harness.repository.findCaseById(id)
  ));
  const beforeLinks = [...harness.repository.caseByFeedbackId.entries()];
  const beforeImprovement = await harness.repository.findW6ImprovementById(IMPROVEMENT_ID);
  const beforeCycle = (await harness.repository.getW6History(CLUSTER_ID)).observation_cycles[0];
  const { transition, aiBinding } = await activeIntakeTransition(harness);

  const committed = await validatedAuthorizedCommit(harness, transition, {
    event_id: "SYN-EVENT-W6-ACTIVE-INTAKE-VALID",
    ai_binding: aiBinding,
  });
  assert.equal(committed.output.outcome, "committed");
  assert.equal(committed.output.active_recurrence_intake.intake_id, transition.intake_id);
  assert.deepEqual(committed.output.cluster.member_case_ids, [CASE_A, CASE_B, CASE_C]);
  assert.equal(committed.output.cluster.recurrence_count, 1);
  assert.deepEqual(await harness.repository.findW6ImprovementById(IMPROVEMENT_ID), beforeImprovement);
  assert.deepEqual(
    (await harness.repository.getW6History(CLUSTER_ID)).observation_cycles[0],
    beforeCycle,
  );
  assert.deepEqual(
    await Promise.all([CASE_A, CASE_B, CASE_C].map((id) => harness.repository.findCaseById(id))),
    beforeCases,
  );
  assert.deepEqual([...harness.repository.caseByFeedbackId.entries()], beforeLinks);

  let fingerprints = await currentFingerprints(harness.repository, CLUSTER_ID, IMPROVEMENT_ID);
  const day7 = transitionBase("record_day_7", {
    case_ids: [CASE_A, CASE_B, CASE_C],
    expected_cluster_fingerprint: fingerprints.cluster,
    expected_improvement_fingerprint: fingerprints.improvement,
    cycle_id: "SYN-W6-CYCLE-001",
    clock_source: "test",
    recurrence_case_ids: [CASE_C],
    related_task_volume: null,
    checkpoint_id: "SYN-W6-CHECKPOINT-ACTIVE-INTAKE-DAY7",
    history_id: "SYN-W6-HISTORY-ACTIVE-INTAKE-DAY7",
    receipt_id: "SYN-W6-RECEIPT-ACTIVE-INTAKE-DAY7",
    occurred_at: DAY_7_AT,
  });
  const beforeWrongCheckpoint = await w6DurableState(harness.repository);
  await assert.rejects(timedCommit(harness, {
    ...day7,
    recurrence_case_ids: [],
    checkpoint_id: "SYN-W6-CHECKPOINT-ACTIVE-INTAKE-OMITTED",
    history_id: "SYN-W6-HISTORY-ACTIVE-INTAKE-OMITTED",
    receipt_id: "SYN-W6-RECEIPT-ACTIVE-INTAKE-OMITTED",
  }), /authorized|recurrence|coherent|exact|source/u);
  assert.deepEqual(await w6DurableState(harness.repository), beforeWrongCheckpoint);

  const day7Result = await timedCommit(harness, day7);
  assert.equal(day7Result.output.observation_checkpoint.recurrence_count, 1);
  assert.equal(day7Result.output.observation_checkpoint.recurrence_rate, null);
  fingerprints = await currentFingerprints(harness.repository, CLUSTER_ID, IMPROVEMENT_ID);
  const day30Result = await timedCommit(harness, transitionBase("record_day_30", {
    case_ids: [CASE_A, CASE_B, CASE_C],
    expected_cluster_fingerprint: fingerprints.cluster,
    expected_improvement_fingerprint: fingerprints.improvement,
    cycle_id: "SYN-W6-CYCLE-001",
    clock_source: "test",
    recurrence_case_ids: [CASE_C],
    related_task_volume: 2,
    checkpoint_id: "SYN-W6-CHECKPOINT-ACTIVE-INTAKE-DAY30",
    history_id: "SYN-W6-HISTORY-ACTIVE-INTAKE-DAY30",
    receipt_id: "SYN-W6-RECEIPT-ACTIVE-INTAKE-DAY30",
    occurred_at: DAY_30_AT,
  }));
  assert.equal(day30Result.output.observation_checkpoint.recurrence_rate, 0.5);
});

test("W6 active-observation intake fails with no repository-issued N5 receipt and writes nothing", async () => {
  const harness = await observingHarness();
  await seedClosedCase(harness.repository, harness.w5GrantChannel.issuer, CASE_C, 3, {
    updated_at: "2026-08-05T00:00:00.000Z",
    closed_at: "2026-08-05T00:00:00.000Z",
  });
  const { transition } = await activeIntakeTransition(harness);
  const before = await w6DurableState(harness.repository);
  const result = await captureRejectedWithoutMutation({
    before,
    repository: harness.repository,
    errorPattern: /N5|validation|receipt|capability/u,
    operation: () => authorizedCommit(harness, transition, {
      event_id: "SYN-EVENT-W6-ACTIVE-INTAKE-NO-N5-RECEIPT",
    }),
  });
  assert.equal(result.rejected, true);
  assert.equal(result.expected_error, true);
  assert.equal(result.unchanged, true);
});

test("W6 enter_observation requires every initial member closed_at to be strictly earlier than opened_at", async () => {
  const cases = [
    ["minus_1ms", "2026-08-01T23:59:59.999Z", true],
    ["equal", OBSERVATION_OPENED_AT, false],
    ["plus_1ms", "2026-08-02T00:00:00.001Z", false],
  ];
  for (const [label, closedAt, shouldCommit] of cases) {
    const harness = await activeImprovementHarness({
      caseOverridesById: {
        [CASE_B]: { updated_at: closedAt, closed_at: closedAt },
      },
    });
    const fingerprints = await currentFingerprints(harness.repository, CLUSTER_ID, IMPROVEMENT_ID);
    const input = transitionBase("enter_observation", {
      expected_cluster_fingerprint: fingerprints.cluster,
      expected_improvement_fingerprint: fingerprints.improvement,
      cycle_id: `SYN-W6-CYCLE-ENTER-STRICT-${label}`,
      clock_source: "test",
      occurred_at: OBSERVATION_OPENED_AT,
      reason: `strict initial member boundary ${label}`,
      history_id: `SYN-W6-HISTORY-ENTER-STRICT-${label}`,
      receipt_id: `SYN-W6-RECEIPT-ENTER-STRICT-${label}`,
    });
    if (shouldCommit) {
      const result = await authorizedCommit(harness, input);
      assert.equal(result.output.outcome, "committed");
      continue;
    }
    const before = await w6DurableState(harness.repository);
    const result = await captureRejectedWithoutMutation({
      before,
      repository: harness.repository,
      errorPattern: /closed_at|strictly earlier|opened_at/u,
      operation: () => authorizedCommit(harness, input),
    });
    assert.equal(result.rejected, true, label);
    assert.equal(result.expected_error, true, label);
    assert.equal(result.unchanged, true, label);
  }
});

test("W6 reopen recurrence requires archive_at < trigger.closed_at <= reopen_at", async () => {
  const archiveAt = "2026-09-01T01:00:00.000Z";
  const scenarios = [
    ["minus_1ms", "2026-09-01T00:59:59.999Z", false],
    ["equal", archiveAt, false],
    ["plus_1ms", "2026-09-01T01:00:00.001Z", true],
  ];
  for (const [label, closedAt, shouldCommit] of scenarios) {
    const harness = await archivedHarness();
    await seedClosedCase(harness.repository, harness.w5GrantChannel.issuer, CASE_C, 3, {
      updated_at: closedAt,
      closed_at: closedAt,
    });
    const fingerprints = await currentFingerprints(harness.repository, CLUSTER_ID, IMPROVEMENT_ID);
    const input = transitionBase("reopen_recurrence", {
      case_ids: [CASE_A, CASE_B, CASE_C],
      expected_cluster_fingerprint: fingerprints.cluster,
      expected_improvement_fingerprint: fingerprints.improvement,
      cycle_id: `SYN-W6-CYCLE-REOPEN-STRICT-${label}`,
      triggering_case_ids: [CASE_C],
      clock_source: "test",
      occurred_at: "2026-09-03T00:00:00.000Z",
      reason: `strict archive lower bound ${label}`,
      history_id: `SYN-W6-HISTORY-REOPEN-STRICT-${label}`,
      receipt_id: `SYN-W6-RECEIPT-REOPEN-STRICT-${label}`,
    });
    if (shouldCommit) {
      const result = await authorizedCommit(harness, input);
      assert.equal(result.output.outcome, "committed");
      continue;
    }
    const before = await w6DurableState(harness.repository);
    const result = await captureRejectedWithoutMutation({
      before,
      repository: harness.repository,
      errorPattern: /archive|closed_at|strictly later/u,
      operation: () => authorizedCommit(harness, input),
    });
    assert.equal(result.rejected, true, label);
    assert.equal(result.expected_error, true, label);
    assert.equal(result.unchanged, true, label);
  }
});

test("W6 N6 validation receipt is repository-issued, opaque, exact-bound, and one-use", async () => {
  const modes = ["missing", "forged", "wrong_claims", "reused"];
  for (const mode of modes) {
    const harness = await reviewedHarness();
    const fingerprints = await currentFingerprints(harness.repository);
    const aiBinding = await n6ValidationBinding(harness.repository);
    const input = transitionBase("start_improvement", {
      expected_cluster_fingerprint: fingerprints.cluster,
      improvement: {
        version: `synthetic.receipt.${mode}`,
        owner_role: "合成改进负责人",
        measure: "验证一次性 N6 能力绑定。",
        observation_window_days: [7, 30],
        clock_source: "test",
        metric_formula: "观察窗内同类案件数",
      },
      root_cause_hypothesis: aiBinding.rootCause,
      reason: `N6 receipt isolation ${mode}`,
      history_id: `SYN-W6-HISTORY-N6-RECEIPT-${mode}`,
      receipt_id: `SYN-W6-RECEIPT-N6-RECEIPT-${mode}`,
    });
    const before = await w6DurableState(harness.repository);
    const eventId = `SYN-EVENT-W6-N6-RECEIPT-${mode}`;
    let operation;
    if (mode === "missing") {
      operation = () => authorizedCommit(harness, input, { event_id: eventId });
    } else {
      operation = () => inEvent(harness.repository, {
        eventId,
        command: input,
        lockResources: resources(input.case_ids, input.cluster_id, input.improvement_id),
        operation: async ({ event_id, command_fingerprint }) => {
          const authorizationBinding = createW6AuthorizationBinding(input);
          const authorizationClaims = {
            workflow: "W6",
            event_id,
            phase: authorizationBinding.phase,
            case_ids: authorizationBinding.case_ids,
            cluster_id: authorizationBinding.cluster_id,
            improvement_id: authorizationBinding.improvement_id,
            action: authorizationBinding.action,
            target_fingerprint: authorizationBinding.target_fingerprint,
            command_fingerprint,
            principal: PRINCIPAL,
            policy_version: POLICY_VERSION,
          };
          const authorizationGrant = harness.grantChannel.issuer.issue(authorizationClaims);
          const issued = mode === "forged"
            ? { grant: Object.freeze(Object.create(null)), claims: {} }
            : harness.repository.validateAndIssueW6AiAction({
                event_id,
                command_fingerprint,
                transition: input,
                request: aiBinding.request,
                envelope: aiBinding.envelope,
              });
          const presented = mode === "wrong_claims"
            ? { ...issued, claims: { ...issued.claims, event_id: `${event_id}-WRONG` } }
            : issued;
          return harness.repository.runAuthorizedW6Action(
            { grant: authorizationGrant, claims: authorizationClaims },
            async () => {
              if (mode === "reused") {
                await harness.repository.runValidatedW6AiAction(issued, async () => undefined);
                return harness.repository.runValidatedW6AiAction(issued, () =>
                  harness.repository.commitW6Transition(input)
                );
              }
              return harness.repository.runValidatedW6AiAction(presented, () =>
                harness.repository.commitW6Transition(input)
              );
            },
          );
        },
      });
    }
    const result = await captureRejectedWithoutMutation({
      before,
      repository: harness.repository,
      errorPattern: /N6|AI validation|capability|claims|consumed|unknown|receipt/u,
      operation,
    });
    assert.equal(result.rejected, true, mode);
    assert.equal(result.expected_error, true, `${mode}: ${result.error_message}`);
    assert.equal(result.unchanged, true, mode);
  }
});

test("W6 N6 receipt issuer rejects an internally valid request whose evidence is not authoritative W5 data", async () => {
  const harness = await reviewedHarness();
  const fingerprints = await currentFingerprints(harness.repository);
  const aiBinding = await n6ValidationBinding(harness.repository);
  aiBinding.request.input.evidence[0].text = "合成伪造证据：该文本不存在于权威 W5 链路。";
  aiBinding.envelope.input_hash = createAiInputHash(aiBinding.request);
  aiBinding.envelope.evidence_spans[0].quote = aiBinding.request.input.evidence[0].text;
  const rootCause = {
    ...aiBinding.rootCause,
    input_hash: aiBinding.envelope.input_hash,
    supporting_evidence: [
      structuredClone(aiBinding.envelope.evidence_spans[0]),
      structuredClone(aiBinding.envelope.evidence_spans[2]),
    ],
  };
  const input = transitionBase("start_improvement", {
    expected_cluster_fingerprint: fingerprints.cluster,
    improvement: {
      version: "synthetic.authoritative-w5-boundary",
      owner_role: "合成改进负责人",
      measure: "仅允许权威 W5 证据进入 N6 receipt。",
      observation_window_days: [7, 30],
      clock_source: "test",
      metric_formula: "观察窗内同类案件数",
    },
    root_cause_hypothesis: rootCause,
    reason: "内部自洽但非权威的证据必须失败关闭。",
    history_id: "SYN-W6-HISTORY-N6-FORGED-EVIDENCE",
    receipt_id: "SYN-W6-RECEIPT-N6-FORGED-EVIDENCE",
  });
  const before = await w6DurableState(harness.repository);
  const result = await captureRejectedWithoutMutation({
    before,
    repository: harness.repository,
    errorPattern: /authoritative W5|provenance|evidence|resolution/u,
    operation: () => validatedAuthorizedCommit(harness, input, {
      event_id: "SYN-EVENT-W6-N6-FORGED-EVIDENCE",
      ai_binding: aiBinding,
    }),
  });
  assert.equal(result.rejected, true);
  assert.equal(result.expected_error, true, result.error_message);
  assert.equal(result.unchanged, true);
});

test("W6 active intake rejects forged W5 provenance and cross-cluster ownership with zero target writes", async () => {
  const forged = await observingHarness();
  await seedClosedCase(forged.repository, forged.w5GrantChannel.issuer, CASE_C, 3, {
    updated_at: "2026-08-05T00:00:00.000Z",
    closed_at: "2026-08-05T00:00:00.000Z",
  });
  const forgedBinding = await activeIntakeTransition(forged);
  forged.repository.casesById.get(CASE_C).summary = "伪造后的案件摘要不再匹配 W5 receipt。";
  let before = await w6DurableState(forged.repository);
  let rejected = await captureRejectedWithoutMutation({
    before,
    repository: forged.repository,
    errorPattern: /W5|closure|provenance|authoritative|snapshot/u,
    operation: () => validatedAuthorizedCommit(forged, forgedBinding.transition, {
      event_id: "SYN-EVENT-W6-ACTIVE-INTAKE-FORGED-W5",
      ai_binding: forgedBinding.aiBinding,
    }),
  });
  assert.equal(rejected.rejected, true);
  assert.equal(rejected.expected_error, true, rejected.error_message);
  assert.equal(rejected.unchanged, true);

  const crossCluster = await observingHarness();
  await seedClosedCase(crossCluster.repository, crossCluster.w5GrantChannel.issuer, CASE_C, 3, {
    updated_at: "2026-08-05T00:00:00.000Z",
    closed_at: "2026-08-05T00:00:00.000Z",
  });
  await seedClosedCase(crossCluster.repository, crossCluster.w5GrantChannel.issuer, CASE_D, 4, {
    updated_at: "2026-08-05T00:00:00.001Z",
    closed_at: "2026-08-05T00:00:00.001Z",
  });
  await createCandidate(crossCluster, {
    case_ids: [CASE_C, CASE_D],
    cluster_id: "SYN-CLUSTER-W6-ACTIVE-INTAKE-OTHER",
    proposal_id: "SYN-W6-PROPOSAL-ACTIVE-INTAKE-OTHER",
    history_id: "SYN-W6-HISTORY-ACTIVE-INTAKE-OTHER",
    receipt_id: "SYN-W6-RECEIPT-ACTIVE-INTAKE-OTHER",
  });
  const otherBefore = await crossCluster.repository.getW6History(
    "SYN-CLUSTER-W6-ACTIVE-INTAKE-OTHER",
  );
  const crossBinding = await activeIntakeTransition(crossCluster);
  before = await w6DurableState(crossCluster.repository);
  rejected = await captureRejectedWithoutMutation({
    before,
    repository: crossCluster.repository,
    errorPattern: /private cluster ownership|another cluster|belongs|ownership/u,
    operation: () => validatedAuthorizedCommit(crossCluster, crossBinding.transition, {
      event_id: "SYN-EVENT-W6-ACTIVE-INTAKE-CROSS-CLUSTER",
      ai_binding: crossBinding.aiBinding,
    }),
  });
  assert.equal(rejected.rejected, true);
  assert.equal(rejected.expected_error, true, rejected.error_message);
  assert.equal(rejected.unchanged, true);
  assert.deepEqual(
    await crossCluster.repository.getW6History("SYN-CLUSTER-W6-ACTIVE-INTAKE-OTHER"),
    otherBefore,
  );
});

test("W6 active intake enforces observation horizons, late day-7 closure, and same-cycle uniqueness", async () => {
  const rejectedScenarios = [
    ["opened_equal", OBSERVATION_OPENED_AT, "2026-08-05T00:00:00.000Z", false],
    ["after_day30", "2026-09-01T00:00:00.001Z", "2026-09-01T00:00:00.001Z", false],
    ["late_day7", "2026-08-08T00:00:00.000Z", "2026-08-10T00:00:00.000Z", true],
  ];
  for (const [label, closedAt, occurredAt, recordDay7] of rejectedScenarios) {
    const harness = await observingHarness();
    if (recordDay7) {
      const fingerprints = await currentFingerprints(harness.repository, CLUSTER_ID, IMPROVEMENT_ID);
      await timedCommit(harness, transitionBase("record_day_7", {
        expected_cluster_fingerprint: fingerprints.cluster,
        expected_improvement_fingerprint: fingerprints.improvement,
        cycle_id: "SYN-W6-CYCLE-001",
        clock_source: "test",
        recurrence_case_ids: [],
        related_task_volume: null,
        checkpoint_id: `SYN-W6-CHECKPOINT-${label}`,
        history_id: `SYN-W6-HISTORY-CHECKPOINT-${label}`,
        receipt_id: `SYN-W6-RECEIPT-CHECKPOINT-${label}`,
        occurred_at: DAY_7_AT,
      }));
    }
    await seedClosedCase(harness.repository, harness.w5GrantChannel.issuer, CASE_C, 3, {
      updated_at: closedAt,
      closed_at: closedAt,
    });
    const binding = await activeIntakeTransition(harness, [CASE_C], {
      occurred_at: occurredAt,
      intake_id: `SYN-W6-ACTIVE-INTAKE-${label}`,
      history_id: `SYN-W6-HISTORY-ACTIVE-INTAKE-${label}`,
      receipt_id: `SYN-W6-RECEIPT-ACTIVE-INTAKE-${label}`,
    });
    const before = await w6DurableState(harness.repository);
    const result = await captureRejectedWithoutMutation({
      before,
      repository: harness.repository,
      errorPattern: /window|day.?7|day.?30|closed_at|observation|authoritative observing state/u,
      operation: () => validatedAuthorizedCommit(harness, binding.transition, {
        event_id: `SYN-EVENT-W6-ACTIVE-INTAKE-${label}`,
        ai_binding: binding.aiBinding,
      }),
    });
    assert.equal(result.rejected, true, label);
    assert.equal(result.expected_error, true, `${label}: ${result.error_message}`);
    assert.equal(result.unchanged, true, label);
  }

  const afterDay7 = await observingHarness();
  let fingerprints = await currentFingerprints(afterDay7.repository, CLUSTER_ID, IMPROVEMENT_ID);
  await timedCommit(afterDay7, transitionBase("record_day_7", {
    expected_cluster_fingerprint: fingerprints.cluster,
    expected_improvement_fingerprint: fingerprints.improvement,
    cycle_id: "SYN-W6-CYCLE-001",
    clock_source: "test",
    recurrence_case_ids: [],
    related_task_volume: null,
    checkpoint_id: "SYN-W6-CHECKPOINT-AFTER-DAY7-EMPTY",
    history_id: "SYN-W6-HISTORY-AFTER-DAY7-EMPTY",
    receipt_id: "SYN-W6-RECEIPT-AFTER-DAY7-EMPTY",
    occurred_at: DAY_7_AT,
  }));
  await seedClosedCase(afterDay7.repository, afterDay7.w5GrantChannel.issuer, CASE_C, 3, {
    updated_at: "2026-08-10T00:00:00.000Z",
    closed_at: "2026-08-10T00:00:00.000Z",
  });
  const valid = await activeIntakeTransition(afterDay7, [CASE_C], {
    occurred_at: "2026-08-11T00:00:00.000Z",
    intake_id: "SYN-W6-ACTIVE-INTAKE-AFTER-DAY7",
  });
  await validatedAuthorizedCommit(afterDay7, valid.transition, {
    event_id: "SYN-EVENT-W6-ACTIVE-INTAKE-AFTER-DAY7",
    ai_binding: valid.aiBinding,
  });
  const beforeDuplicate = await w6DurableState(afterDay7.repository);
  const duplicate = await activeIntakeTransition(afterDay7, [CASE_C], {
    occurred_at: "2026-08-12T00:00:00.000Z",
    intake_id: "SYN-W6-ACTIVE-INTAKE-AFTER-DAY7-DUPLICATE",
  });
  const duplicateResult = await captureRejectedWithoutMutation({
    before: beforeDuplicate,
    repository: afterDay7.repository,
    errorPattern: /already|same cycle|member|ownership|intake|conflict/u,
    operation: () => validatedAuthorizedCommit(afterDay7, duplicate.transition, {
      event_id: "SYN-EVENT-W6-ACTIVE-INTAKE-AFTER-DAY7-DUPLICATE",
      ai_binding: duplicate.aiBinding,
    }),
  });
  assert.equal(duplicateResult.rejected, true);
  assert.equal(duplicateResult.expected_error, true, duplicateResult.error_message);
  assert.equal(duplicateResult.unchanged, true);

  fingerprints = await currentFingerprints(afterDay7.repository, CLUSTER_ID, IMPROVEMENT_ID);
  const day30 = await timedCommit(afterDay7, transitionBase("record_day_30", {
    case_ids: [CASE_A, CASE_B, CASE_C],
    expected_cluster_fingerprint: fingerprints.cluster,
    expected_improvement_fingerprint: fingerprints.improvement,
    cycle_id: "SYN-W6-CYCLE-001",
    clock_source: "test",
    recurrence_case_ids: [CASE_C],
    related_task_volume: 1,
    checkpoint_id: "SYN-W6-CHECKPOINT-AFTER-DAY7-DAY30",
    history_id: "SYN-W6-HISTORY-AFTER-DAY7-DAY30",
    receipt_id: "SYN-W6-RECEIPT-AFTER-DAY7-DAY30",
    occurred_at: DAY_30_AT,
  }));
  assert.deepEqual(day30.output.observation_checkpoint.recurrence_case_ids, [CASE_C]);
});

test("W6 rejects a day-7-or-earlier closure at the exact day-7 intake time once the checkpoint exists", async () => {
  const harness = await observingHarness();
  const fingerprints = await currentFingerprints(harness.repository, CLUSTER_ID, IMPROVEMENT_ID);
  await timedCommit(harness, transitionBase("record_day_7", {
    expected_cluster_fingerprint: fingerprints.cluster,
    expected_improvement_fingerprint: fingerprints.improvement,
    cycle_id: "SYN-W6-CYCLE-001",
    clock_source: "test",
    recurrence_case_ids: [],
    related_task_volume: null,
    checkpoint_id: "SYN-W6-CHECKPOINT-EXACT-DAY7-CUTOFF",
    history_id: "SYN-W6-HISTORY-EXACT-DAY7-CUTOFF",
    receipt_id: "SYN-W6-RECEIPT-EXACT-DAY7-CUTOFF",
    occurred_at: DAY_7_AT,
  }));
  await seedClosedCase(harness.repository, harness.w5GrantChannel.issuer, CASE_C, 3, {
    updated_at: DAY_7_AT,
    closed_at: DAY_7_AT,
  });
  const binding = await activeIntakeTransition(harness, [CASE_C], {
    occurred_at: DAY_7_AT,
    intake_id: "SYN-W6-ACTIVE-INTAKE-EXACT-DAY7-CUTOFF",
    history_id: "SYN-W6-HISTORY-ACTIVE-INTAKE-EXACT-DAY7-CUTOFF",
    receipt_id: "SYN-W6-RECEIPT-ACTIVE-INTAKE-EXACT-DAY7-CUTOFF",
  });
  const before = await w6DurableState(harness.repository);
  const result = await captureRejectedWithoutMutation({
    before,
    repository: harness.repository,
    errorPattern: /day.?7|checkpoint|cutoff|closed_at|window/u,
    operation: () => validatedAuthorizedCommit(harness, binding.transition, {
      event_id: "SYN-EVENT-W6-ACTIVE-INTAKE-EXACT-DAY7-CUTOFF",
      ai_binding: binding.aiBinding,
    }),
  });
  assert.equal(result.rejected, true);
  assert.equal(result.expected_error, true, result.error_message);
  assert.equal(result.unchanged, true);
});

test("W6 final commit rechecks the day-7 seal after a validation receipt was issued", {
  timeout: 5_000,
}, async (t) => {
  const harness = await observingHarness();
  await seedClosedCase(harness.repository, harness.w5GrantChannel.issuer, CASE_C, 3, {
    updated_at: DAY_7_AT,
    closed_at: DAY_7_AT,
  });
  const intake = await activeIntakeTransition(harness, [CASE_C], {
    occurred_at: DAY_7_AT,
    intake_id: "SYN-W6-ACTIVE-INTAKE-RECEIPT-BEFORE-DAY7",
    history_id: "SYN-W6-HISTORY-ACTIVE-INTAKE-RECEIPT-BEFORE-DAY7",
    receipt_id: "SYN-W6-RECEIPT-ACTIVE-INTAKE-RECEIPT-BEFORE-DAY7",
  });
  const eventId = "SYN-EVENT-W6-ACTIVE-INTAKE-RECEIPT-BEFORE-DAY7";
  const commandFingerprint = createWorkflowEventFingerprint(intake.transition);
  let validation;
  let authorizationGrant;
  let authorizationClaims;
  let markCapabilitiesIssued;
  let resumeAfterCheckpoint;
  const capabilitiesIssued = new Promise((resolve) => {
    markCapabilitiesIssued = resolve;
  });
  const checkpointCommitted = new Promise((resolve) => {
    resumeAfterCheckpoint = resolve;
  });
  t.after(() => resumeAfterCheckpoint?.());

  const pendingIntake = harness.repository.runWorkflowEvent(
    eventId,
    commandFingerprint,
    async () => {
      validation = harness.repository.validateAndIssueW6AiAction({
        event_id: eventId,
        command_fingerprint: commandFingerprint,
        transition: intake.transition,
        request: intake.aiBinding.request,
        envelope: intake.aiBinding.envelope,
      });
      const authorizationBinding = createW6AuthorizationBinding(intake.transition);
      authorizationClaims = {
        workflow: "W6",
        event_id: eventId,
        phase: authorizationBinding.phase,
        case_ids: authorizationBinding.case_ids,
        cluster_id: authorizationBinding.cluster_id,
        improvement_id: authorizationBinding.improvement_id,
        action: authorizationBinding.action,
        target_fingerprint: authorizationBinding.target_fingerprint,
        command_fingerprint: commandFingerprint,
        principal: PRINCIPAL,
        policy_version: POLICY_VERSION,
      };
      authorizationGrant = harness.grantChannel.issuer.issue(authorizationClaims);
      markCapabilitiesIssued();
      await checkpointCommitted;

      await harness.repository.runW6ResourcesExclusive(
        resources(
          intake.transition.case_ids,
          intake.transition.cluster_id,
          intake.transition.improvement_id,
        ),
        () => harness.repository.runAuthorizedW6Action(
          { grant: authorizationGrant, claims: authorizationClaims },
          () => harness.repository.runValidatedW6AiAction(
            validation,
            () => harness.repository.commitW6Transition(intake.transition),
          ),
        ),
      );
      return {
        workflow: "W6",
        event_id: eventId,
        status: "completed",
        object_ref: { object_type: "cluster", object_id: CLUSTER_ID },
        actions: ["intake_active_observation_recurrence"],
        errors: [],
        output: { repository_test: true },
      };
    },
  );
  await capabilitiesIssued;

  const fingerprints = await currentFingerprints(harness.repository, CLUSTER_ID, IMPROVEMENT_ID);
  await timedCommit(harness, transitionBase("record_day_7", {
    expected_cluster_fingerprint: fingerprints.cluster,
    expected_improvement_fingerprint: fingerprints.improvement,
    cycle_id: "SYN-W6-CYCLE-001",
    clock_source: "test",
    recurrence_case_ids: [],
    related_task_volume: null,
    checkpoint_id: "SYN-W6-CHECKPOINT-WINS-AFTER-RECEIPT",
    history_id: "SYN-W6-HISTORY-CHECKPOINT-WINS-AFTER-RECEIPT",
    receipt_id: "SYN-W6-RECEIPT-CHECKPOINT-WINS-AFTER-RECEIPT",
    occurred_at: DAY_7_AT,
  }), {
    event_id: "SYN-EVENT-W6-CHECKPOINT-WINS-AFTER-RECEIPT",
  });
  const before = await w6DurableState(harness.repository);
  resumeAfterCheckpoint();

  let commitError = null;
  try {
    await pendingIntake;
  } catch (error) {
    commitError = error;
  }
  assert.match(
    commitError?.message ?? "",
    /active recurrence trigger closed_at must be inside the current authorized observation horizon/u,
  );
  assert.deepEqual(await w6DurableState(harness.repository), before);
  await assert.rejects(
    harness.repository.runValidatedW6AiAction(validation, async () => undefined),
    /unknown|already consumed/u,
  );
  await assert.rejects(
    harness.repository.runAuthorizedW6Action(
      { grant: authorizationGrant, claims: authorizationClaims },
      async () => undefined,
    ),
    /unknown|already consumed/u,
  );
});

test("W6 rejects a pre-day-7 closure submitted after the day-7 intake cutoff even without a checkpoint", async () => {
  const harness = await observingHarness();
  await seedClosedCase(harness.repository, harness.w5GrantChannel.issuer, CASE_C, 3, {
    updated_at: "2026-08-08T23:59:59.999Z",
    closed_at: "2026-08-08T23:59:59.999Z",
  });
  const binding = await activeIntakeTransition(harness, [CASE_C], {
    occurred_at: "2026-08-10T00:00:00.000Z",
    intake_id: "SYN-W6-ACTIVE-INTAKE-NO-DAY7-LATE-OLD-CASE",
    history_id: "SYN-W6-HISTORY-NO-DAY7-LATE-OLD-CASE",
    receipt_id: "SYN-W6-RECEIPT-NO-DAY7-LATE-OLD-CASE",
  });
  const before = await w6DurableState(harness.repository);
  const result = await captureRejectedWithoutMutation({
    before,
    repository: harness.repository,
    errorPattern: /day.?7|cutoff|horizon|closed_at|window/u,
    operation: () => validatedAuthorizedCommit(harness, binding.transition, {
      event_id: "SYN-EVENT-W6-NO-DAY7-LATE-OLD-CASE",
      ai_binding: binding.aiBinding,
    }),
  });
  assert.equal(result.rejected, true);
  assert.equal(result.expected_error, true, result.error_message);
  assert.equal(result.unchanged, true);
});

test("W6 rejects a new day-7 checkpoint backfilled after a post-day-7 recurrence intake", async () => {
  const harness = await observingHarness();
  await seedClosedCase(harness.repository, harness.w5GrantChannel.issuer, CASE_C, 3, {
    updated_at: "2026-08-10T00:00:00.000Z",
    closed_at: "2026-08-10T00:00:00.000Z",
  });
  const intake = await activeIntakeTransition(harness, [CASE_C], {
    occurred_at: "2026-08-11T00:00:00.000Z",
    intake_id: "SYN-W6-ACTIVE-INTAKE-BEFORE-BACKFILL",
    history_id: "SYN-W6-HISTORY-ACTIVE-INTAKE-BEFORE-BACKFILL",
    receipt_id: "SYN-W6-RECEIPT-ACTIVE-INTAKE-BEFORE-BACKFILL",
  });
  await validatedAuthorizedCommit(harness, intake.transition, {
    event_id: "SYN-EVENT-W6-ACTIVE-INTAKE-BEFORE-BACKFILL",
    ai_binding: intake.aiBinding,
  });
  const fingerprints = await currentFingerprints(harness.repository, CLUSTER_ID, IMPROVEMENT_ID);
  const day7 = transitionBase("record_day_7", {
    case_ids: [CASE_A, CASE_B, CASE_C],
    expected_cluster_fingerprint: fingerprints.cluster,
    expected_improvement_fingerprint: fingerprints.improvement,
    cycle_id: "SYN-W6-CYCLE-001",
    clock_source: "test",
    recurrence_case_ids: [],
    related_task_volume: null,
    checkpoint_id: "SYN-W6-CHECKPOINT-BACKFILLED-DAY7",
    history_id: "SYN-W6-HISTORY-BACKFILLED-DAY7",
    receipt_id: "SYN-W6-RECEIPT-BACKFILLED-DAY7",
    occurred_at: DAY_7_AT,
  });
  const before = await w6DurableState(harness.repository);
  const result = await captureRejectedWithoutMutation({
    before,
    repository: harness.repository,
    errorPattern: /monotonic|updated_at|day.?7|checkpoint|earlier/u,
    operation: () => timedCommit(harness, day7, {
      event_id: "SYN-EVENT-W6-BACKFILLED-DAY7",
    }),
  });
  assert.equal(result.rejected, true);
  assert.equal(result.expected_error, true, result.error_message);
  assert.equal(result.unchanged, true);
});

test("W6 replays an existing day-7 receipt before later-state monotonic checks and conflicts on changed semantics", async () => {
  const harness = await observingHarness();
  let fingerprints = await currentFingerprints(harness.repository, CLUSTER_ID, IMPROVEMENT_ID);
  const day7 = transitionBase("record_day_7", {
    expected_cluster_fingerprint: fingerprints.cluster,
    expected_improvement_fingerprint: fingerprints.improvement,
    cycle_id: "SYN-W6-CYCLE-001",
    clock_source: "test",
    recurrence_case_ids: [],
    related_task_volume: null,
    checkpoint_id: "SYN-W6-CHECKPOINT-REPLAY-AFTER-UPDATE",
    history_id: "SYN-W6-HISTORY-REPLAY-AFTER-UPDATE",
    receipt_id: "SYN-W6-RECEIPT-REPLAY-AFTER-UPDATE",
    occurred_at: DAY_7_AT,
  });
  const first = await timedCommit(harness, day7);
  const originalReceipt = structuredClone(first.output.receipt);

  await seedClosedCase(harness.repository, harness.w5GrantChannel.issuer, CASE_C, 3, {
    updated_at: "2026-08-10T00:00:00.000Z",
    closed_at: "2026-08-10T00:00:00.000Z",
  });
  const intake = await activeIntakeTransition(harness, [CASE_C], {
    occurred_at: "2026-08-11T00:00:00.000Z",
    intake_id: "SYN-W6-ACTIVE-INTAKE-AFTER-EXISTING-DAY7",
    history_id: "SYN-W6-HISTORY-ACTIVE-INTAKE-AFTER-EXISTING-DAY7",
    receipt_id: "SYN-W6-RECEIPT-ACTIVE-INTAKE-AFTER-EXISTING-DAY7",
  });
  await validatedAuthorizedCommit(harness, intake.transition, {
    event_id: "SYN-EVENT-W6-ACTIVE-INTAKE-AFTER-EXISTING-DAY7",
    ai_binding: intake.aiBinding,
  });

  const replay = await timedCommit(harness, {
    ...day7,
    history_id: "SYN-W6-HISTORY-REPLAY-AFTER-LATER-STATE",
    receipt_id: "SYN-W6-RECEIPT-REPLAY-AFTER-LATER-STATE",
  });
  assert.equal(replay.output.outcome, "idempotent");
  assert.deepEqual(replay.output.receipt, originalReceipt);

  const beforeConflict = await w6DurableState(harness.repository);
  const conflict = await captureRejectedWithoutMutation({
    before: beforeConflict,
    repository: harness.repository,
    errorPattern: /conflict|immutable/u,
    operation: () => timedCommit(harness, {
      ...day7,
      related_task_volume: 1,
      history_id: "SYN-W6-HISTORY-CONFLICT-AFTER-LATER-STATE",
      receipt_id: "SYN-W6-RECEIPT-CONFLICT-AFTER-LATER-STATE",
    }),
  });
  assert.equal(conflict.rejected, true);
  assert.equal(conflict.expected_error, true, conflict.error_message);
  assert.equal(conflict.unchanged, true);
});

test("W6 N6 and N5 validation receipts are mutually action-scoped, one-use, and zero-write", async () => {
  const n6Harness = await reviewedHarness();
  await seedClosedCase(n6Harness.repository, n6Harness.w5GrantChannel.issuer, CASE_C, 3, {
    updated_at: "2026-08-05T00:00:00.000Z",
    closed_at: "2026-08-05T00:00:00.000Z",
  });
  const n6Fingerprints = await currentFingerprints(n6Harness.repository);
  const n6Binding = await n6ValidationBinding(n6Harness.repository);
  const n6Transition = transitionBase("start_improvement", {
    expected_cluster_fingerprint: n6Fingerprints.cluster,
    improvement: {
      version: "synthetic.cross-receipt-n6",
      owner_role: "合成改进负责人",
      measure: "验证 N6 receipt 不能用于 N5 intake。",
      observation_window_days: [7, 30],
      clock_source: "test",
      metric_formula: "观察窗内同类案件数",
    },
    root_cause_hypothesis: n6Binding.rootCause,
    reason: "N6 receipt 双向隔离探针。",
    history_id: "SYN-W6-HISTORY-CROSS-RECEIPT-N6",
    receipt_id: "SYN-W6-RECEIPT-CROSS-RECEIPT-N6",
  });
  const fakeN5Transition = snapshotW6AtomicTransition(transitionBase(
    "intake_active_observation_recurrence",
    {
      case_ids: [CASE_A, CASE_B, CASE_C],
      expected_cluster_fingerprint: n6Fingerprints.cluster,
      expected_improvement_fingerprint: "f".repeat(64),
      expected_w6_state_fingerprint: "e".repeat(64),
      cycle_id: "SYN-W6-CYCLE-CROSS-RECEIPT-N6-TO-N5",
      triggering_case_ids: [CASE_C],
      intake_id: "SYN-W6-INTAKE-CROSS-RECEIPT-N6-TO-N5",
      clock_source: "test",
      n5_validation_fingerprint: "d".repeat(64),
      reason: "N6 receipt 不得用于 N5 intake。",
      history_id: "SYN-W6-HISTORY-CROSS-RECEIPT-N6-TO-N5",
      receipt_id: "SYN-W6-RECEIPT-CROSS-RECEIPT-N6-TO-N5",
    },
  ));
  let n6Receipt;
  let before = await w6DurableState(n6Harness.repository);
  let rejected = await captureRejectedWithoutMutation({
    before,
    repository: n6Harness.repository,
    errorPattern: /action|capability|claims|validation|context/u,
    operation: () => inEvent(n6Harness.repository, {
      eventId: "SYN-EVENT-W6-CROSS-RECEIPT-N6-TO-N5",
      command: n6Transition,
      lockResources: resources([CASE_A, CASE_B, CASE_C], CLUSTER_ID, IMPROVEMENT_ID),
      operation: async ({ event_id, command_fingerprint }) => {
        n6Receipt = n6Harness.repository.validateAndIssueW6AiAction({
          event_id,
          command_fingerprint,
          transition: n6Transition,
          request: n6Binding.request,
          envelope: n6Binding.envelope,
        });
        const binding = createW6AuthorizationBinding(fakeN5Transition);
        const claims = {
          workflow: "W6",
          event_id,
          phase: binding.phase,
          case_ids: binding.case_ids,
          cluster_id: binding.cluster_id,
          improvement_id: binding.improvement_id,
          action: binding.action,
          target_fingerprint: binding.target_fingerprint,
          command_fingerprint,
          principal: PRINCIPAL,
          policy_version: POLICY_VERSION,
        };
        const grant = n6Harness.grantChannel.issuer.issue(claims);
        return n6Harness.repository.runAuthorizedW6Action(
          { grant, claims },
          () => n6Harness.repository.runValidatedW6AiAction(
            n6Receipt,
            () => n6Harness.repository.commitW6Transition(fakeN5Transition),
          ),
        );
      },
    }),
  });
  assert.equal(rejected.rejected, true);
  assert.equal(rejected.expected_error, true, rejected.error_message);
  assert.equal(rejected.unchanged, true);
  await assert.rejects(
    n6Harness.repository.runValidatedW6AiAction(n6Receipt, async () => undefined),
    /unknown|already consumed/u,
  );

  const n5Harness = await observingHarness();
  await seedClosedCase(n5Harness.repository, n5Harness.w5GrantChannel.issuer, CASE_C, 3, {
    updated_at: "2026-08-05T00:00:00.000Z",
    closed_at: "2026-08-05T00:00:00.000Z",
  });
  const n5Binding = await activeIntakeTransition(n5Harness);
  const current = await currentFingerprints(n5Harness.repository, CLUSTER_ID, IMPROVEMENT_ID);
  const fakeN6Transition = snapshotW6AtomicTransition(transitionBase("start_improvement", {
    case_ids: [CASE_A, CASE_B, CASE_C],
    expected_cluster_fingerprint: current.cluster,
    expected_improvement_fingerprint: null,
    improvement: {
      version: "synthetic.cross-receipt-n5",
      owner_role: "合成改进负责人",
      measure: "验证 N5 receipt 不能用于 N6 start。",
      observation_window_days: [7, 30],
      clock_source: "test",
      metric_formula: "观察窗内同类案件数",
    },
    root_cause_hypothesis: rootCauseHypothesis(),
    reason: "N5 receipt 双向隔离探针。",
    history_id: "SYN-W6-HISTORY-CROSS-RECEIPT-N5-TO-N6",
    receipt_id: "SYN-W6-RECEIPT-CROSS-RECEIPT-N5-TO-N6",
  }));
  let n5Receipt;
  before = await w6DurableState(n5Harness.repository);
  rejected = await captureRejectedWithoutMutation({
    before,
    repository: n5Harness.repository,
    errorPattern: /action|capability|claims|validation|context/u,
    operation: () => inEvent(n5Harness.repository, {
      eventId: "SYN-EVENT-W6-CROSS-RECEIPT-N5-TO-N6",
      command: n5Binding.transition,
      lockResources: resources([CASE_A, CASE_B, CASE_C], CLUSTER_ID, IMPROVEMENT_ID),
      operation: async ({ event_id, command_fingerprint }) => {
        n5Receipt = n5Harness.repository.validateAndIssueW6AiAction({
          event_id,
          command_fingerprint,
          transition: n5Binding.transition,
          request: n5Binding.aiBinding.request,
          envelope: n5Binding.aiBinding.envelope,
        });
        const binding = createW6AuthorizationBinding(fakeN6Transition);
        const claims = {
          workflow: "W6",
          event_id,
          phase: binding.phase,
          case_ids: binding.case_ids,
          cluster_id: binding.cluster_id,
          improvement_id: binding.improvement_id,
          action: binding.action,
          target_fingerprint: binding.target_fingerprint,
          command_fingerprint,
          principal: PRINCIPAL,
          policy_version: POLICY_VERSION,
        };
        const grant = n5Harness.grantChannel.issuer.issue(claims);
        return n5Harness.repository.runAuthorizedW6Action(
          { grant, claims },
          () => n5Harness.repository.runValidatedW6AiAction(
            n5Receipt,
            () => n5Harness.repository.commitW6Transition(fakeN6Transition),
          ),
        );
      },
    }),
  });
  assert.equal(rejected.rejected, true);
  assert.equal(rejected.expected_error, true, rejected.error_message);
  assert.equal(rejected.unchanged, true);
  await assert.rejects(
    n5Harness.repository.runValidatedW6AiAction(n5Receipt, async () => undefined),
    /unknown|already consumed/u,
  );
});
