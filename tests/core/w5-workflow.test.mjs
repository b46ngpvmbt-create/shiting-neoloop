import assert from "node:assert/strict";
import test from "node:test";

import {
  MemoryAuditSink,
  SequenceIds,
  importBuilt,
} from "./_runtime.mjs";

const {
  AI_NODE_DEFINITIONS,
  AuditedAiNodeRunner,
  ScriptedAiNodeInvoker,
} = await importBuilt("src/neoloop/ai/index.js");
const { TestClock } = await importBuilt("src/neoloop/domain/test-clock.js");
const {
  createW5AuthorizationGrantChannel,
  InMemoryFrontHalfRepository,
  runW4,
  runW5,
} = await importBuilt("src/neoloop/workflows/index.js");

const CASE_ID = "SYN-CASE-017";
const WORK_ORDER_ID = "SYN-WORK-017";
const SLA_STARTED_AT = "2026-08-01T02:00:00.000Z";
const SLA_DUE_AT = "2026-08-01T02:30:00.000Z";
const SOURCE_HASH = "a".repeat(64);
const ACTOR = {
  type: "authorized_human",
  actor_id: "SYN-HUMAN-CASE-REVIEWER",
  role: "合成案件审核角色",
};
const PRINCIPAL = {
  principal_id: "SYN-PRINCIPAL-CASE-REVIEWER",
  principal_type: "synthetic_human",
  canonical_role: "规范化合成案件审核角色",
  authority_source: "synthetic_allowlist",
};
const KNOWLEDGE = {
  knowledge_id: "SYN-KNOWLEDGE-APPROVED-001",
  version: "approved.1",
  approval_status: "已审核",
  effective_at: "2026-08-01T01:00:00.000Z",
  citation_allowed_for_n7: true,
  source_ref: "knowledge:SYN-KNOWLEDGE-APPROVED-001",
  text: "回复应说明核验已经完成，并邀请客户确认当前体验。",
};

function processingCase(overrides = {}) {
  return {
    schema_version: "1.0.0-draft.2",
    data_scope: "synthetic_experiment",
    evidence_class: "synthetic_experiment",
    created_at: "2026-08-01T02:05:00.000Z",
    updated_at: "2026-08-01T02:10:00.000Z",
    source_kind: "scenario_runtime",
    case_id: CASE_ID,
    legacy_id: "not_applicable_scenario_runtime",
    title: "舱门连续两次无法解锁",
    summary: "SYN-CASE-017 的舱门解锁异常已由授权人员核对。",
    category_domain: "车辆运维",
    category_detail: "舱门解锁异常",
    rule_risk: "P2",
    ai_risk: "P2",
    final_risk: "P2",
    status: "处理中",
    missing_fields: [],
    entity_candidates: {
      vehicle_ids: ["SYN-VEHICLE-017"],
      task_ids: ["SYN-TASK-017"],
      station_names: ["SYN-STATION-A"],
      confidence: 0.91,
    },
    formal_entity: {
      vehicle_id: "SYN-VEHICLE-017",
      task_id: "SYN-TASK-017",
      station_id: "SYN-STATION-A",
    },
    formal_entity_confirmation_status: "已人工确认",
    evidence_completeness: "complete",
    evidence_summary: "实体和责任路由已经人工确认。",
    sla_started_at: SLA_STARTED_AT,
    sla_due_at: SLA_DUE_AT,
    sla_rule_version: "SYN-SLA-v1",
    candidate_generation_mode: "AI",
    suggested_team: "车辆运维",
    routing_rule_candidate_id: "SYN-ROUTING-002",
    cluster_id: null,
    pending_confirmation_items: [],
    closed_at: null,
    record_mode: "scenario_runtime",
    workflow_readiness: "dispatched",
    legacy_association_mode: "not_applicable",
    legacy_reviewer: "not_applicable",
    legacy_status: "not_applicable",
    migration_note: null,
    source_name: "synthetic_experiment",
    source_locator: "SYN-SOURCE-017",
    source_sha256: SOURCE_HASH,
    ...overrides,
  };
}

function processingWorkOrder(overrides = {}) {
  return {
    schema_version: "1.0.0-draft.2",
    data_scope: "synthetic_experiment",
    evidence_class: "synthetic_experiment",
    created_at: "2026-08-01T02:05:00.000Z",
    updated_at: "2026-08-01T02:10:00.000Z",
    source_kind: "scenario_runtime",
    work_order_id: WORK_ORDER_ID,
    legacy_id: "not_applicable_scenario_runtime",
    case_id: CASE_ID,
    team: "车辆运维",
    assignee_role: "合成处置角色",
    action: "核查舱门解锁链路并补充处置证据",
    accepted_at: "2026-08-01T02:10:00.000Z",
    due_at: SLA_DUE_AT,
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
    source_locator: "W3:SYN-EVENT-DISPATCH-017",
    source_sha256: SOURCE_HASH,
    ...overrides,
  };
}

function completeEvidence(overrides = {}) {
  return {
    submission_id: "SYN-EVIDENCE-SUBMISSION-001",
    source_ref: `work_order:${WORK_ORDER_ID}`,
    text: "处置证据已验证，合成场景中的连续解锁测试通过。",
    artifact_refs: ["synthetic://evidence/SYN-WORK-017/unlock-check"],
    reviewed_facts: [
      {
        source_ref: `case:${CASE_ID}`,
        text: "SYN-CASE-017 的舱门解锁异常已由授权人员核对。",
        review_status: "approved",
        review_ref: "SYN-FACT-REVIEW-001",
      },
    ],
    ...overrides,
  };
}

function submitCommand(overrides = {}) {
  return {
    action: "submit_closure_request",
    event_id: "SYN-EVENT-W5-SUBMIT-001",
    case_id: CASE_ID,
    work_order_id: WORK_ORDER_ID,
    actor: ACTOR,
    evidence: completeEvidence(),
    reviewed_knowledge_index: [KNOWLEDGE],
    ...overrides,
  };
}

function supplementCommand(replacesSubmissionId, overrides = {}) {
  return {
    ...submitCommand({
      action: "supplement_evidence",
      event_id: "SYN-EVENT-W5-SUPPLEMENT-001",
      replaces_submission_id: replacesSubmissionId,
      evidence: completeEvidence({ submission_id: "SYN-EVIDENCE-SUBMISSION-002" }),
    }),
    ...overrides,
  };
}

function reviewCommand(draftId, overrides = {}) {
  return {
    action: "review_reply",
    event_id: "SYN-EVENT-W5-REVIEW-001",
    case_id: CASE_ID,
    work_order_id: WORK_ORDER_ID,
    actor: ACTOR,
    draft_id: draftId,
    decision: "approve_for_manual_delivery",
    reason: "已核对事实、处置结果和引用。",
    manual_delivery_reference: "synthetic://manual-reply/SYN-CASE-017/001",
    ...overrides,
  };
}

function followUpCommand(overrides = {}) {
  return {
    action: "record_follow_up",
    event_id: "SYN-EVENT-W5-FOLLOWUP-001",
    case_id: CASE_ID,
    work_order_id: WORK_ORDER_ID,
    actor: ACTOR,
    outcome: "resolved",
    summary: "客户在合成回访中确认当前体验正常。",
    follow_up_reference: "synthetic://follow-up/SYN-CASE-017/001",
    ...overrides,
  };
}

function closureCommand(overrides = {}) {
  return {
    action: "decide_closure",
    event_id: "SYN-EVENT-W5-CLOSE-001",
    case_id: CASE_ID,
    work_order_id: WORK_ORDER_ID,
    actor: ACTOR,
    decision: "close",
    reason: "处置验证、人工回复确认和回访记录均已完成。",
    ...overrides,
  };
}

function n7CustomerReply(invocation) {
  const fact = invocation.input.reviewed_facts[0];
  const resolution = invocation.input.resolution_result;
  const knowledge = invocation.input.reviewed_knowledge_index[0];
  return {
    payload: {
      draft_kind: "customer_reply",
      draft: "您好，我们已完成本次问题核验。请您确认当前体验；本回复由人工审核后处理。",
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
    confidence: 0.87,
    status: "ok",
  };
}

class FlakyWorkflowAuditSink extends MemoryAuditSink {
  failuresRemaining = 1;

  async append(record) {
    if (record.category === "workflow" && this.failuresRemaining > 0) {
      this.failuresRemaining -= 1;
      throw new Error("synthetic workflow audit outage");
    }
    await super.append(record);
  }
}

function makeHarness({
  aiSteps = [{ kind: "return", value: n7CustomerReply }],
  audit = new MemoryAuditSink(),
  authorize = async () => ({
    allowed: true,
    principal: PRINCIPAL,
    policy_version: "synthetic-w5-allowlist-v1",
  }),
} = {}) {
  const grantChannel = createW5AuthorizationGrantChannel();
  const repository = new InMemoryFrontHalfRepository({
    w5_authorization_grant_consumer: grantChannel.consumer,
  });
  repository.casesById.set(CASE_ID, processingCase());
  repository.workOrdersById.set(WORK_ORDER_ID, processingWorkOrder());
  repository.workOrderByCaseId.set(CASE_ID, WORK_ORDER_ID);
  const invoker = new ScriptedAiNodeInvoker({
    data_scope: "synthetic_experiment",
    scripts: { N7: aiSteps },
  });
  const clock = new TestClock("2026-08-01T04:00:00.000Z");
  const ids = new SequenceIds();
  const aiRunner = new AuditedAiNodeRunner({
    invoker,
    audit,
    clock,
    ids,
    data_scope: "synthetic_experiment",
  });
  const authorizationCalls = [];
  const ports = {
    clock,
    ids,
    repository,
    audit,
    ai_runner: aiRunner,
    action_authorizer: {
      async authorize(input) {
        authorizationCalls.push(structuredClone(input));
        const decision = await authorize(input);
        if (decision.allowed !== true) return decision;
        return {
          allowed: true,
          principal: decision.principal,
          policy_version: decision.policy_version,
          grant: decision.grant ?? grantChannel.issuer.issue({
            workflow: "W5",
            event_id: input.event_id,
            case_id: input.object_ref.object_id,
            work_order_id: input.work_order_id,
            action: input.action,
            target_fingerprint: input.target_fingerprint,
            command_fingerprint: input.command_fingerprint,
            principal: decision.principal,
            policy_version: decision.policy_version,
          }),
        };
      },
    },
  };
  return { repository, invoker, audit, authorizationCalls, grantChannel, ports };
}

function assertSlaPreserved(snapshot) {
  assert.equal(snapshot.case.sla_started_at, SLA_STARTED_AT);
  assert.equal(snapshot.case.sla_due_at, SLA_DUE_AT);
  assert.equal(snapshot.case.sla_rule_version, "SYN-SLA-v1");
  assert.equal(snapshot.work_order.due_at, SLA_DUE_AT);
  assert.equal(snapshot.work_order.sla_reset_count, 0);
}

async function runToReplyReview(harness) {
  const submitted = await runW5(submitCommand(), harness.ports);
  assert.equal(submitted.status, "completed");
  const draftId = submitted.output.current_draft.draft_id;
  const reviewed = await runW5(reviewCommand(draftId), harness.ports);
  assert.equal(reviewed.status, "completed");
  return { submitted, reviewed, draftId };
}

function deferred() {
  let resolve;
  const promise = new Promise((next) => { resolve = next; });
  return { promise, resolve };
}

function grantedDecision(input, issuer, claimOverrides = {}) {
  const policyVersion = "synthetic-w5-allowlist-v1";
  return {
    allowed: true,
    principal: PRINCIPAL,
    policy_version: policyVersion,
    grant: issuer.issue({
      workflow: "W5",
      event_id: input.event_id,
      case_id: input.object_ref.object_id,
      work_order_id: input.work_order_id,
      action: input.action,
      target_fingerprint: input.target_fingerprint,
      command_fingerprint: input.command_fingerprint,
      principal: PRINCIPAL,
      policy_version: policyVersion,
      ...claimOverrides,
    }),
  };
}

test("W5 incomplete evidence remains auditable and a later supplement reaches the reply-review gate", async () => {
  const harness = makeHarness();
  const incomplete = submitCommand({
    evidence: completeEvidence({ artifact_refs: [] }),
  });
  const first = await runW5(incomplete, harness.ports);

  assert.equal(first.status, "needs_human");
  assert.equal(first.output.error_class, "insufficient_evidence");
  assert.equal(first.output.case.status, "处理中");
  assert.equal(first.output.work_order.status, "处理中");
  assert.equal(first.output.history.evidence_submissions.length, 1);
  assert.equal(first.output.history.evidence_submissions[0].completeness, "incomplete");
  assert.equal(harness.invoker.calls.length, 0);
  assertSlaPreserved(first.output);

  const supplemented = await runW5(
    supplementCommand(first.output.history.evidence_submissions[0].submission_id),
    harness.ports,
  );
  assert.equal(supplemented.status, "completed");
  assert.equal(supplemented.output.case.status, "待验证");
  assert.equal(supplemented.output.work_order.status, "待验证");
  assert.equal(supplemented.output.history.evidence_submissions.length, 2);
  assert.equal(supplemented.output.history.evidence_submissions[1].completeness, "complete");
  assert.equal(supplemented.output.current_draft.publication_state, "draft_unpublished");
  assert.equal(harness.invoker.calls.length, 1);
  assertSlaPreserved(supplemented.output);
});

test("W5 runs validation, authorized reply approval, follow-up, and authorized human closure", async () => {
  const harness = makeHarness();
  const { submitted, draftId } = await runToReplyReview(harness);
  assert.equal(submitted.output.current_draft.node_version, AI_NODE_DEFINITIONS.N7_CUSTOMER_REPLY.version);

  const followUp = await runW5(followUpCommand(), harness.ports);
  assert.equal(followUp.status, "completed");
  assert.equal(followUp.output.case.status, "待回访");
  assert.equal(followUp.output.history.follow_ups.at(-1).outcome, "resolved");

  const closed = await runW5(closureCommand(), harness.ports);
  assert.equal(closed.status, "completed");
  assert.equal(closed.output.case.status, "已关闭");
  assert.equal(closed.output.work_order.status, "已完成");
  assert.equal(closed.output.work_order.validation_result, "passed");
  assert.equal(closed.output.case.closed_at, "2026-08-01T04:00:00.000Z");
  assert.equal(closed.output.work_order.completed_at, "2026-08-01T04:00:00.000Z");
  assert.equal(closed.output.history.reply_reviews.at(-1).draft_id, draftId);
  assert.deepEqual(closed.output.history.reply_reviews.at(-1).principal, PRINCIPAL);
  assert.deepEqual(closed.output.history.closure_decisions.at(-1).principal, PRINCIPAL);
  assert.equal(closed.output.external_effects.reply_sent_by_workflow, false);
  assert.equal(closed.output.external_effects.knowledge_published_by_workflow, false);
  assert.equal(closed.output.external_effects.case_closed_without_human, false);
  assertSlaPreserved(closed.output);
  assert.equal(harness.invoker.calls.length, 1);
  assert.equal(harness.authorizationCalls.length, 4);
  assert.equal(harness.audit.records.filter((record) => record.category === "ai").length, 1);
  assert.equal(harness.audit.records.filter((record) => record.category === "workflow").length, 4);
});

test("W5 denied or self-declared actors cannot approve a formal reply or close a case", async () => {
  let allowCount = 1;
  const harness = makeHarness({
    authorize: async () => {
      allowCount -= 1;
      return allowCount >= 0
        ? { allowed: true, principal: PRINCIPAL, policy_version: "synthetic-w5-allowlist-v1" }
        : { allowed: false, reason: "not allowlisted" };
    },
  });
  const submitted = await runW5(submitCommand(), harness.ports);
  const denied = await runW5(reviewCommand(submitted.output.current_draft.draft_id), harness.ports);
  assert.equal(denied.status, "failed");
  assert.equal(denied.output.error_class, "authorization_failure");
  assert.equal(denied.output.case.status, "待验证");
  assert.equal(denied.output.history.reply_reviews.length, 0);

  const selfDeclared = await runW5(
    reviewCommand(submitted.output.current_draft.draft_id, {
      event_id: "SYN-EVENT-W5-SELF-DECLARED",
      actor: { ...ACTOR, is_authorized: true },
    }),
    harness.ports,
  );
  assert.equal(selfDeclared.status, "failed");
  assert.equal(selfDeclared.output.error_class, "invalid_command");
  assert.equal(harness.authorizationCalls.length, 2);
});

test("W5 reply rejection and abnormal follow-up return to processing without discarding evidence or SLA", async () => {
  const rejectedHarness = makeHarness();
  const submitted = await runW5(submitCommand(), rejectedHarness.ports);
  const rejected = await runW5(reviewCommand(submitted.output.current_draft.draft_id, {
    decision: "return_to_processing",
    reason: "回复事实仍需补充。",
    manual_delivery_reference: null,
  }), rejectedHarness.ports);
  assert.equal(rejected.status, "completed");
  assert.equal(rejected.output.case.status, "处理中");
  assert.equal(rejected.output.work_order.status, "处理中");
  assert.equal(rejected.output.history.reply_reviews.at(-1).decision, "return_to_processing");
  assert.equal(rejected.output.history.evidence_submissions.length, 1);
  assert.equal(rejected.output.history.reply_drafts.length, 1);
  assertSlaPreserved(rejected.output);

  const abnormalHarness = makeHarness();
  await runToReplyReview(abnormalHarness);
  const abnormal = await runW5(followUpCommand({
    outcome: "abnormal",
    summary: "合成回访记录显示问题仍存在。",
  }), abnormalHarness.ports);
  assert.equal(abnormal.status, "completed");
  assert.equal(abnormal.output.case.status, "处理中");
  assert.equal(abnormal.output.work_order.status, "处理中");
  assert.equal(abnormal.output.work_order.validation_result, "failed");
  assert.equal(abnormal.output.history.follow_ups.at(-1).outcome, "abnormal");
  assertSlaPreserved(abnormal.output);
});

test("W5 authorized closure return reopens processing without erasing the verified history or original SLA", async () => {
  const harness = makeHarness();
  await runToReplyReview(harness);
  await runW5(followUpCommand(), harness.ports);

  const returned = await runW5(closureCommand({
    decision: "return_to_processing",
    reason: "关单前人工复核发现仍需补充一次处置验证。",
  }), harness.ports);

  assert.equal(returned.status, "completed");
  assert.equal(returned.output.case.status, "处理中");
  assert.equal(returned.output.case.workflow_readiness, "awaiting_resolution_evidence");
  assert.equal(returned.output.case.closed_at, null);
  assert.equal(returned.output.work_order.status, "处理中");
  assert.equal(returned.output.work_order.validation_result, "failed");
  assert.equal(returned.output.work_order.completed_at, null);
  assert.equal(returned.output.history.evidence_submissions.length, 1);
  assert.equal(returned.output.history.reply_drafts.length, 1);
  assert.equal(returned.output.history.reply_reviews.length, 1);
  assert.equal(returned.output.history.follow_ups.length, 1);
  assert.equal(returned.output.history.closure_decisions.at(-1).decision, "return_to_processing");
  assert.deepEqual(returned.output.history.closure_decisions.at(-1).principal, PRINCIPAL);
  assertSlaPreserved(returned.output);
});

test("W5 denied closure remains at the human closure gate and records no closure decision", async () => {
  const harness = makeHarness({
    authorize: async (input) => input.action === "decide_closure"
      ? { allowed: false, reason: "closure role is not allowlisted" }
      : { allowed: true, principal: PRINCIPAL, policy_version: "synthetic-w5-allowlist-v1" },
  });
  await runToReplyReview(harness);
  await runW5(followUpCommand(), harness.ports);

  const denied = await runW5(closureCommand(), harness.ports);

  assert.equal(denied.status, "failed");
  assert.equal(denied.output.error_class, "authorization_failure");
  assert.equal(denied.output.action_authorization.state, "denied");
  assert.equal(denied.output.case.status, "待回访");
  assert.equal(denied.output.case.workflow_readiness, "awaiting_closure_decision");
  assert.equal(denied.output.case.closed_at, null);
  assert.equal(denied.output.work_order.status, "待验证");
  assert.equal(denied.output.history.closure_decisions.length, 0);
  assertSlaPreserved(denied.output);
});

test("W5 rejects phase-incoherent records before evidence, reply review, or follow-up mutation", async () => {
  const evidenceHarness = makeHarness();
  evidenceHarness.repository.casesById.set(CASE_ID, processingCase({
    workflow_readiness: "awaiting_reply_review",
  }));
  const evidence = await runW5(submitCommand(), evidenceHarness.ports);
  assert.equal(evidence.status, "failed");
  assert.equal(evidence.output.error_class, "invalid_state");
  assert.equal(evidence.output.history.evidence_submissions.length, 0);
  assert.equal(evidenceHarness.invoker.calls.length, 0);

  const reviewHarness = makeHarness();
  const submitted = await runW5(submitCommand(), reviewHarness.ports);
  reviewHarness.repository.casesById.set(CASE_ID, {
    ...reviewHarness.repository.casesById.get(CASE_ID),
    workflow_readiness: "awaiting_resolution_evidence",
  });
  const review = await runW5(
    reviewCommand(submitted.output.current_draft.draft_id),
    reviewHarness.ports,
  );
  assert.equal(review.status, "failed");
  assert.equal(review.output.error_class, "invalid_state");
  assert.equal(review.output.history.reply_reviews.length, 0);

  const followUpHarness = makeHarness();
  await runToReplyReview(followUpHarness);
  followUpHarness.repository.casesById.set(CASE_ID, {
    ...followUpHarness.repository.casesById.get(CASE_ID),
    workflow_readiness: "awaiting_closure_decision",
  });
  const followUp = await runW5(followUpCommand(), followUpHarness.ports);
  assert.equal(followUp.status, "failed");
  assert.equal(followUp.output.error_class, "invalid_state");
  assert.equal(followUp.output.history.follow_ups.length, 0);
});

test("W5 cannot close before an approved reply and resolved follow-up", async () => {
  const harness = makeHarness();
  const direct = await runW5(closureCommand(), harness.ports);
  assert.equal(direct.status, "failed");
  assert.equal(direct.output.error_class, "invalid_state");
  assert.equal(direct.output.case.status, "处理中");
  assert.equal(direct.output.case.closed_at, null);

  const submitted = await runW5(submitCommand({ event_id: "SYN-EVENT-W5-SUBMIT-002" }), harness.ports);
  const reviewed = await runW5(reviewCommand(submitted.output.current_draft.draft_id, {
    event_id: "SYN-EVENT-W5-REVIEW-002",
  }), harness.ports);
  assert.equal(reviewed.output.case.status, "待回访");
  const noFollowUp = await runW5(closureCommand({ event_id: "SYN-EVENT-W5-CLOSE-002" }), harness.ports);
  assert.equal(noFollowUp.status, "failed");
  assert.equal(noFollowUp.output.error_class, "invalid_state");
  assert.equal(noFollowUp.output.case.closed_at, null);
});

test("W5 N7 schema failure retries once, preserves processing state, and leaves an auditable evidence submission", async () => {
  const invalid = (invocation) => ({
    ...n7CustomerReply(invocation),
    payload: { ...n7CustomerReply(invocation).payload, publication_state: "published" },
  });
  const harness = makeHarness({
    aiSteps: [
      { kind: "return", value: invalid },
      { kind: "return", value: invalid },
    ],
  });
  const result = await runW5(submitCommand(), harness.ports);
  assert.equal(result.status, "needs_human");
  assert.equal(result.output.error_class, "n7_failure");
  assert.equal(result.output.case.status, "处理中");
  assert.equal(result.output.work_order.status, "处理中");
  assert.equal(result.output.current_draft, null);
  assert.equal(result.output.history.evidence_submissions.length, 1);
  assert.equal(harness.invoker.calls.length, 2);
  assert.equal(harness.audit.records.filter((record) => record.category === "ai").length, 2);
  assert.equal(harness.audit.records.filter((record) => record.category === "workflow").length, 1);
  assertSlaPreserved(result.output);
});

test("W5 retries a failed post-commit workflow audit without repeating AI, authorization, or state changes", async () => {
  const audit = new FlakyWorkflowAuditSink();
  const harness = makeHarness({ audit });
  const command = submitCommand();
  const first = await runW5(command, harness.ports);
  assert.equal(first.status, "completed");
  assert.equal(first.output.audit_state, "pending");
  assert.equal(first.output.audit_error_class, "audit_failure_after_commit");
  assert.equal(first.output.history.evidence_submissions.length, 1);
  assert.equal(first.output.history.reply_drafts.length, 1);

  const replay = await runW5(command, harness.ports);
  assert.equal(replay.status, "idempotent");
  assert.equal(replay.output.event_replayed, true);
  assert.equal(replay.output.audit_state, "recorded");
  assert.equal(replay.output.history.evidence_submissions.length, 1);
  assert.equal(replay.output.history.reply_drafts.length, 1);
  assert.equal(harness.invoker.calls.length, 1);
  assert.equal(harness.authorizationCalls.length, 1);
  assert.equal(audit.records.filter((record) => record.category === "ai").length, 1);
  assert.equal(audit.records.filter((record) => record.category === "workflow").length, 1);
});

test("W5 same-event conflicts fail closed and do not overwrite the first result", async () => {
  const harness = makeHarness();
  const command = submitCommand();
  const first = await runW5(command, harness.ports);
  assert.equal(first.status, "completed");
  const conflict = await runW5({
    ...command,
    evidence: { ...command.evidence, text: "同事件 ID 下被篡改的另一份证据。" },
  }, harness.ports);
  assert.equal(conflict.status, "failed");
  assert.equal(conflict.output.error_class, "event_conflict");
  assert.equal(conflict.output.case.status, "待验证");
  assert.equal(conflict.output.history.evidence_submissions.length, 1);
  assert.equal(harness.invoker.calls.length, 1);
  assertSlaPreserved(conflict.output);
});

test("W5 invalid commands fail before authorization and do not mutate workflow state", async () => {
  const harness = makeHarness();
  const invalid = await runW5({
    ...submitCommand(),
    action: "publish_reply",
  }, harness.ports);
  assert.equal(invalid.status, "failed");
  assert.equal(invalid.output.error_class, "invalid_command");
  assert.equal(invalid.output.case, null);
  assert.equal(invalid.output.work_order, null);
  assert.equal(harness.authorizationCalls.length, 0);
  assert.equal(harness.invoker.calls.length, 0);
  assert.equal(harness.repository.casesById.get(CASE_ID).status, "处理中");
  assert.equal(harness.repository.workOrdersById.get(WORK_ORDER_ID).status, "处理中");
});

test("W5 binds an asynchronous execution to the immutable command snapshot used for its event fingerprint", async () => {
  const authorizerEntered = deferred();
  const releaseAuthorizer = deferred();
  const harness = makeHarness({
    authorize: async () => {
      authorizerEntered.resolve();
      await releaseAuthorizer.promise;
      return {
        allowed: true,
        principal: PRINCIPAL,
        policy_version: "synthetic-w5-allowlist-v1",
      };
    },
  });
  const command = submitCommand({ event_id: "SYN-EVENT-W5-ASYNC-SNAPSHOT" });
  const original = structuredClone(command);
  const mutatedEvidenceText = "授权等待期间被外部替换的处置证据，不属于事件指纹快照。";
  const mutatedKnowledgeText = "授权等待期间被外部替换的知识内容。";

  const pending = runW5(command, harness.ports);
  await authorizerEntered.promise;
  command.evidence.source_ref = "forged:after-fingerprint";
  command.evidence.text = mutatedEvidenceText;
  command.evidence.reviewed_facts[0].text = "授权等待期间被外部替换的事实。";
  command.reviewed_knowledge_index[0].text = mutatedKnowledgeText;
  releaseAuthorizer.resolve();

  const first = await pending;
  const replay = await runW5(original, harness.ports);
  const persisted = await harness.repository.getW5History(CASE_ID);
  const serializedBusinessState = JSON.stringify({ first: first.output, replay: replay.output, persisted });
  const violations = [];
  if (serializedBusinessState.includes(mutatedEvidenceText)) {
    violations.push("mutated evidence text was committed or replayed under the original event fingerprint");
  }
  if (serializedBusinessState.includes("forged:after-fingerprint")) {
    violations.push("mutated evidence source was committed or replayed under the original event fingerprint");
  }
  if (serializedBusinessState.includes(mutatedKnowledgeText)) {
    violations.push("mutated reviewed knowledge reached N7 or the replayed business result");
  }

  assert.deepEqual(violations, [], `W5 asynchronous snapshot boundary violations: ${violations.join("; ")}`);
});

test("W5 repository rejects a structurally valid human reply approval without trusted W5 authorization provenance", async () => {
  const harness = makeHarness();
  const seeded = await runW5(
    submitCommand({ event_id: "SYN-EVENT-W5-REPOSITORY-SEED" }),
    harness.ports,
  );
  assert.equal(seeded.status, "completed");
  const authorizationCallsBeforeBypass = harness.authorizationCalls.length;
  const eventId = "SYN-EVENT-W5-REPOSITORY-BYPASS";
  const expectedCase = await harness.repository.findCaseById(CASE_ID);
  const expectedWorkOrder = await harness.repository.findWorkOrderById(WORK_ORDER_ID);
  const decidedAt = "2026-08-01T04:05:00.000Z";
  const transition = {
    transition: "reply_approved",
    expected_case: expectedCase,
    expected_work_order: expectedWorkOrder,
    next_case: {
      ...expectedCase,
      status: "待回访",
      workflow_readiness: "awaiting_follow_up",
      updated_at: decidedAt,
      closed_at: null,
    },
    next_work_order: {
      ...expectedWorkOrder,
      status: "待验证",
      validation_result: "pending",
      updated_at: decidedAt,
      completed_at: null,
    },
    append: {
      reply_review: {
        review_id: "SYN-REPLY-REVIEW-FORGED-DIRECT",
        event_id: eventId,
        case_id: CASE_ID,
        work_order_id: WORK_ORDER_ID,
        draft_id: seeded.output.current_draft.draft_id,
        decision: "approve_for_manual_delivery",
        reason: "结构完整但未经过 W5 action_authorizer 的直接写入。",
        manual_delivery_reference: "synthetic://manual-reply/direct-bypass",
        principal: PRINCIPAL,
        authorization_policy_version: "synthetic-w5-allowlist-v1",
        decided_at: decidedAt,
      },
    },
  };

  let boundaryError = null;
  try {
    await harness.repository.runWorkflowEvent(eventId, "f".repeat(64), () =>
      harness.repository.runCaseExclusive(CASE_ID, () =>
        harness.repository.commitW5Transition(transition)
      )
    );
  } catch (error) {
    boundaryError = error;
  }

  const storedCase = await harness.repository.findCaseById(CASE_ID);
  const storedHistory = await harness.repository.getW5History(CASE_ID);
  assert.equal(
    harness.authorizationCalls.length,
    authorizationCallsBeforeBypass,
    "the direct repository path must not be mistaken for an action_authorizer call",
  );
  assert.ok(
    boundaryError,
    `repository accepted an unauthenticated human reply approval: case=${storedCase.status}, reply_reviews=${storedHistory.reply_reviews.length}`,
  );
  assert.match(boundaryError.message, /W5.*authorization|authorization.*W5|capability|provenance/i);
});

test("W5 rejects wrong-channel, mismatched, and replayed opaque authorization grants without domain writes", async () => {
  const wrongChannelHarness = makeHarness();
  const wrongChannel = createW5AuthorizationGrantChannel();
  wrongChannelHarness.ports.action_authorizer = {
    async authorize(input) {
      return grantedDecision(input, wrongChannel.issuer);
    },
  };
  const wrongChannelResult = await runW5(
    submitCommand({ event_id: "SYN-EVENT-W5-WRONG-GRANT-CHANNEL" }),
    wrongChannelHarness.ports,
  );
  assert.equal(wrongChannelResult.status, "failed");
  assert.equal(wrongChannelResult.output.error_class, "authorization_capability_invalid");
  assert.equal(wrongChannelResult.output.action_authorization.state, "indeterminate");
  assert.equal((await wrongChannelHarness.repository.getW5History(CASE_ID)).evidence_submissions.length, 0);

  const mismatchedClaims = [
    ["case", { case_id: "SYN-CASE-OTHER" }],
    ["work-order", { work_order_id: "SYN-WORK-OTHER" }],
    ["action", { action: "review_reply" }],
    ["target", { target_fingerprint: "b".repeat(64) }],
    ["command", { command_fingerprint: "c".repeat(64) }],
    ["principal", { principal: { ...PRINCIPAL, principal_id: "SYN-PRINCIPAL-OTHER" } }],
    ["policy", { policy_version: "synthetic-w5-allowlist-other" }],
  ];
  for (const [label, claimOverrides] of mismatchedClaims) {
    const mismatchedHarness = makeHarness();
    mismatchedHarness.ports.action_authorizer = {
      async authorize(input) {
        return grantedDecision(input, mismatchedHarness.grantChannel.issuer, claimOverrides);
      },
    };
    const mismatchedResult = await runW5(
      submitCommand({
        event_id: `SYN-EVENT-W5-MISMATCHED-GRANT-${label}`,
        evidence: completeEvidence({ submission_id: `SYN-EVIDENCE-MISMATCHED-GRANT-${label}` }),
      }),
      mismatchedHarness.ports,
    );
    assert.equal(mismatchedResult.status, "failed", label);
    assert.equal(mismatchedResult.output.error_class, "authorization_capability_invalid", label);
    assert.equal(mismatchedResult.output.action_authorization.state, "indeterminate", label);
    assert.equal(
      (await mismatchedHarness.repository.getW5History(CASE_ID)).evidence_submissions.length,
      0,
      label,
    );
    assert.equal((await mismatchedHarness.repository.findCaseById(CASE_ID)).status, "处理中", label);
    assert.equal(
      (await mismatchedHarness.repository.findWorkOrderById(WORK_ORDER_ID)).status,
      "处理中",
      label,
    );
  }

  const replayHarness = makeHarness();
  let sharedGrant = null;
  let authorizationCallCount = 0;
  replayHarness.ports.action_authorizer = {
    async authorize(input) {
      authorizationCallCount += 1;
      if (sharedGrant === null) {
        sharedGrant = grantedDecision(input, replayHarness.grantChannel.issuer).grant;
      }
      return {
        allowed: true,
        principal: PRINCIPAL,
        policy_version: "synthetic-w5-allowlist-v1",
        grant: sharedGrant,
      };
    },
  };
  const first = await runW5(submitCommand({
    event_id: "SYN-EVENT-W5-GRANT-FIRST-USE",
    evidence: completeEvidence({
      submission_id: "SYN-EVIDENCE-GRANT-FIRST",
      artifact_refs: [],
    }),
  }), replayHarness.ports);
  assert.equal(first.status, "needs_human");
  assert.equal(first.output.history.evidence_submissions.length, 1);

  const replayedGrant = await runW5(submitCommand({
    event_id: "SYN-EVENT-W5-GRANT-SECOND-USE",
    evidence: completeEvidence({
      submission_id: "SYN-EVIDENCE-GRANT-SECOND",
      artifact_refs: [],
    }),
  }), replayHarness.ports);
  assert.equal(replayedGrant.status, "failed");
  assert.equal(replayedGrant.output.error_class, "authorization_capability_invalid");
  assert.equal(authorizationCallCount, 2);
  assert.equal((await replayHarness.repository.getW5History(CASE_ID)).evidence_submissions.length, 1);
});

test("W5 commit cannot overwrite a W4 reassign across the former asynchronous history-read window", async () => {
  const harness = makeHarness();
  const originalGetW5History = harness.repository.getW5History.bind(harness.repository);
  const formerWindowEntered = deferred();
  const releaseFormerWindow = deferred();
  let historyReadCount = 0;
  let observeFormerWindow = true;
  harness.repository.getW5History = async (caseId) => {
    const history = await originalGetW5History(caseId);
    historyReadCount += 1;
    if (observeFormerWindow && historyReadCount === 2) {
      formerWindowEntered.resolve("former_window");
      await releaseFormerWindow.promise;
    }
    return history;
  };

  const w5Command = submitCommand({
    event_id: "SYN-EVENT-W5-W4-ATOMIC-COMMIT",
    evidence: completeEvidence({
      submission_id: "SYN-EVIDENCE-W5-W4-ATOMIC-COMMIT",
      artifact_refs: [],
    }),
  });
  const w5Pending = runW5(w5Command, harness.ports);
  const schedulingPoint = await Promise.race([
    formerWindowEntered.promise,
    w5Pending.then(() => "atomic_commit"),
  ]);
  observeFormerWindow = false;
  const w4Command = {
    action: "reassign",
    event_id: "SYN-EVENT-W4-DURING-W5-COMMIT",
    work_order_id: WORK_ORDER_ID,
    actor: ACTOR,
    team: "合成二线运维",
    assignee_role: "合成二线处置角色",
  };
  const w4 = await runW4(w4Command, {
    repository: harness.repository,
    audit: harness.audit,
    clock: harness.ports.clock,
    ids: harness.ports.ids,
    notifier: { async notify() {} },
    action_authorizer: { async authorize() { return true; } },
  });
  if (schedulingPoint === "former_window") releaseFormerWindow.resolve();
  const w5 = await w5Pending;

  assert.equal(w4.status, "completed");
  assert.equal(w5.status, "needs_human");
  assert.equal(w5.output.error_class, "insufficient_evidence");
  const storedWorkOrder = await harness.repository.findWorkOrderById(WORK_ORDER_ID);
  const storedCase = await harness.repository.findCaseById(CASE_ID);
  const storedHistory = await harness.repository.getW5History(CASE_ID);
  assert.equal(storedWorkOrder.team, w4Command.team);
  assert.equal(storedWorkOrder.assignee_role, w4Command.assignee_role);
  assert.equal(storedWorkOrder.due_at, SLA_DUE_AT);
  assert.equal(storedWorkOrder.sla_reset_count, 0);
  assert.equal(storedCase.sla_started_at, SLA_STARTED_AT);
  assert.equal(storedCase.sla_due_at, SLA_DUE_AT);
  assert.equal(storedHistory.evidence_submissions.length, 1);

  const authorizationCalls = harness.authorizationCalls.length;
  const replay = await runW5(w5Command, harness.ports);
  assert.equal(replay.status, "needs_human");
  assert.equal(replay.output.event_replayed, true);
  assert.equal(harness.authorizationCalls.length, authorizationCalls);
  assert.equal((await harness.repository.getW5History(CASE_ID)).evidence_submissions.length, 1);
});
