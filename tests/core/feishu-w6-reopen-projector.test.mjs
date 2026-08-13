import assert from "node:assert/strict";
import test from "node:test";
import { isDeepStrictEqual } from "node:util";

import { importBuilt } from "./_runtime.mjs";

const {
  W6_REOPEN_BEFORE_CONTRACT,
  W6_REOPEN_CAPABILITY_ATTESTATION_HASH_CONTRACT,
  W6_REOPEN_CAPABILITY_CONTRACT,
  W6_REOPEN_CLUSTER_AFTER_HASH_CONTRACT,
  W6_REOPEN_CLUSTER_BEFORE_HASH_CONTRACT,
  W6_REOPEN_IMPROVEMENT_AFTER_HASH_CONTRACT,
  W6_REOPEN_IMPROVEMENT_BEFORE_HASH_CONTRACT,
  W6_REOPEN_PLAN_HASH_CONTRACT,
  W6_REOPEN_PREVIOUS_PROJECTION_HASH_CONTRACT,
  W6_REOPEN_PROJECTOR_KEY,
  W6_REOPEN_RECEIPT_HASH_CONTRACT,
  W6_REOPEN_SNAPSHOT_LIMITS,
  createW6ReopenProjectionComposition,
  createW6ReopenProjectionCompositionForTest,
  createW6ReopenProjectionPlannerForTest,
  hashW6ReopenCommitReceipt,
  isW6ReopenProjectionId,
  planW6ReopenProjection,
  reconcileW6ReopenProjection,
  snapshotDescriptorSafeJsonValue,
  validateW6ReopenAuthoritativePlanBindingForTest,
  verifyW6ReopenCommitProof,
} = await importBuilt("src/neoloop/adapters/feishu/w6-reopen-projector.js");

const { createWorkflowEventFingerprint } = await importBuilt(
  "src/neoloop/workflows/event-idempotency.js",
);

const COMMITTED_AT = "2026-08-03T10:00:00.000Z";
const RECEIPT_ID = "SYN-RECEIPT-R10-001";
const HISTORY_ID = "SYN-HISTORY-R10-001";
const CYCLE_ID = "SYN-CYCLE-R10-001";
const CLUSTER_ID = "SYN-CLUSTER-R10-001";
const IMPROVEMENT_ID = "SYN-IMPROVEMENT-R10-001";
const CASE_IDS = ["SYN-CASE-001", "SYN-CASE-002", "SYN-CASE-017"];
const TRIGGERING_CASE_IDS = ["SYN-CASE-017"];
const SHA_A = "a".repeat(64);
const SHA_B = "b".repeat(64);
const SHA_C = "c".repeat(64);
const BEFORE_UPDATED_AT = "2026-08-03T09:00:00.000Z";
const CAPABILITY_ISSUED_AT = "2026-08-03T09:30:00.000Z";
const CAPABILITY_EXPIRES_AT = "2026-08-03T10:30:00.000Z";
const CAPABILITY_CHECKED_AT = "2026-08-03T10:05:00.000Z";

function evidenceSpan(sourceRef, quote, offsets = {}) {
  return {
    source_ref: sourceRef,
    quote,
    ...offsets,
  };
}

function rootCauseHypothesis(overrides = {}) {
  return {
    hypothesis_id: "HYP-SYN-R10-001",
    node_run_id: "SYN-RUN-N6-R10-001",
    node_version: "N6-root-cause-1.0.0-draft.3",
    input_hash: SHA_C,
    statement: "待验证假设：合成因素可能与舱门告警相关，需人工结合支持证据、反证和不确定项验证。",
    supporting_evidence: [
      evidenceSpan(CASE_IDS[0], "合成支持证据一", { start_offset: 0, end_offset: 9 }),
      evidenceSpan(CASE_IDS[1], "合成支持证据二"),
    ],
    counter_evidence: [evidenceSpan(CASE_IDS[2], "合成反证")],
    uncertainties: ["待确认：合成样例边界"],
    final_root_cause: false,
    ...overrides,
  };
}

function membershipSnapshot(caseId) {
  return {
    case_id: caseId,
    case_fingerprint: SHA_A,
    work_order_id: `SYN-WORK-ORDER-${caseId}`,
    work_order_fingerprint: SHA_B,
    w5_closure_fingerprint: SHA_C,
    feedback_links: [{
      feedback_id: `SYN-FEEDBACK-${caseId}`,
      feedback_fingerprint: SHA_A,
    }],
  };
}

function cycle(overrides = {}) {
  const triggeringCaseIds = overrides.triggering_case_ids ?? TRIGGERING_CASE_IDS;
  return {
    cycle_id: CYCLE_ID,
    cluster_id: CLUSTER_ID,
    improvement_id: IMPROVEMENT_ID,
    ordinal: 2,
    trigger: "recurrence_reopen",
    triggering_case_ids: [...triggeringCaseIds],
    triggering_case_snapshots: triggeringCaseIds.map(membershipSnapshot),
    clock_source: "test",
    opened_at: COMMITTED_AT,
    opened_by: {
      principal_id: "SYN-PRINCIPAL-R10-001",
      principal_type: "synthetic_human",
      canonical_role: "improvement_insight",
      authority_source: "synthetic_allowlist",
    },
    authorization_policy_version: "synthetic-w6-policy-v1",
    ...overrides,
  };
}

function historyEntry(overrides = {}) {
  return {
    history_id: HISTORY_ID,
    event_id: "SYN-EVENT-R10-001",
    phase: "recurrence",
    action: "reopen_recurrence",
    case_ids: [...CASE_IDS],
    cluster_id: CLUSTER_ID,
    improvement_id: IMPROVEMENT_ID,
    cycle_id: CYCLE_ID,
    previous_cluster_status: "已归档",
    next_cluster_status: "观察中",
    previous_improvement_status: "已完成",
    next_improvement_status: "观察中",
    reason: "合成复发重开验证",
    principal: cycle().opened_by,
    authorization_policy_version: "synthetic-w6-policy-v1",
    occurred_at: COMMITTED_AT,
    ...overrides,
  };
}

function receipt(overrides = {}) {
  return {
    receipt_id: RECEIPT_ID,
    event_id: "SYN-EVENT-R10-001",
    phase: "recurrence",
    action: "reopen_recurrence",
    case_ids: [...CASE_IDS],
    cluster_id: CLUSTER_ID,
    improvement_id: IMPROVEMENT_ID,
    target_fingerprint: SHA_A,
    command_fingerprint: SHA_B,
    history_id: HISTORY_ID,
    cycle_id: CYCLE_ID,
    checkpoint_id: null,
    state_fingerprint: SHA_C,
    committed_at: COMMITTED_AT,
    ...overrides,
  };
}

function clusterAfter(overrides = {}) {
  return {
    schema_version: "1.0.0-draft.2",
    data_scope: "synthetic_experiment",
    evidence_class: "synthetic_experiment",
    source_kind: "scenario_runtime",
    source_name: "synthetic_experiment",
    source_locator: "tests/core/feishu-w6-reopen-projector.test.mjs",
    source_sha256: SHA_A,
    cluster_id: CLUSTER_ID,
    name: "合成舱门复发问题簇",
    category_domain: "车辆运维",
    member_case_ids: [...CASE_IDS],
    clustering_mode: "cross_event",
    clustering_version: "N5-cross-event-1.0.0-draft.2",
    proposal_id: "SYN-PROPOSAL-R10-001",
    root_cause_hypothesis: rootCauseHypothesis(),
    active_improvement_id: IMPROVEMENT_ID,
    recurrence_count: 1,
    status: "观察中",
    created_at: "2026-08-01T00:00:00.000Z",
    updated_at: COMMITTED_AT,
    ...overrides,
  };
}

function improvementAfter(overrides = {}) {
  return {
    schema_version: "1.0.0-draft.2",
    data_scope: "synthetic_experiment",
    evidence_class: "synthetic_experiment",
    source_kind: "scenario_runtime",
    source_name: "synthetic_experiment",
    source_locator: "tests/core/feishu-w6-reopen-projector.test.mjs",
    source_sha256: SHA_B,
    improvement_id: IMPROVEMENT_ID,
    cluster_id: CLUSTER_ID,
    version: "synthetic-improvement-v1",
    owner_role: "improvement_insight",
    measure: "合成验证措施",
    observation_window_days: [7, 30],
    clock_source: "test",
    metric_formula: "recurrence_count / related_task_volume",
    current_observation_cycle_id: CYCLE_ID,
    human_conclusion: null,
    status: "观察中",
    created_at: "2026-08-01T00:00:00.000Z",
    updated_at: COMMITTED_AT,
    ...overrides,
  };
}

function proof(overrides = {}) {
  const selectedCycle = cycle();
  const selectedEntry = historyEntry();
  const selectedReceipt = receipt();
  return {
    outcome: "committed",
    receipt: selectedReceipt,
    history_entries: [selectedEntry],
    observation_cycles: [selectedCycle],
    cluster_after: clusterAfter(),
    improvement_after: improvementAfter(),
    ...overrides,
  };
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function projectionSource(overrides = {}) {
  const source = cloneJson(verifyW6ReopenCommitProof(proof(), RECEIPT_ID).projection_source);
  return {
    ...source,
    ...overrides,
    cluster_after: {
      ...source.cluster_after,
      ...(overrides.cluster_after ?? {}),
    },
    improvement_after: {
      ...source.improvement_after,
      ...(overrides.improvement_after ?? {}),
    },
  };
}

function activeIntakeRecord(caseId = CASE_IDS[1], overrides = {}) {
  return {
    projection_contract: "active_observation_recurrence.v1",
    data_scope: "synthetic_experiment",
    case_id: caseId,
    marker: "SYN-OPAQUE-RECURRENCE-R10",
    evidence: ["synthetic", { retained: true }],
    ...overrides,
  };
}

function projectionBefore(overrides = {}) {
  const clusterOverrides = overrides.cluster ?? {};
  const improvementOverrides = overrides.improvement ?? {};
  const rootOverrides = { ...overrides };
  delete rootOverrides.cluster;
  delete rootOverrides.improvement;
  return {
    projection_contract: "w6_reopen_projection_before.v1",
    data_scope: "synthetic_experiment",
    evidence_class: "synthetic_experiment",
    cluster: {
      cluster_id: CLUSTER_ID,
      member_case_ids: CASE_IDS.slice(0, 2),
      status: "已归档",
      recurrence_records: [activeIntakeRecord()],
      updated_at: BEFORE_UPDATED_AT,
      ...clusterOverrides,
    },
    improvement: {
      improvement_id: IMPROVEMENT_ID,
      status: "已完成",
      day_7_result: "SYN-SENSITIVE-DAY-7-R10",
      day_30_result: "SYN-SENSITIVE-DAY-30-R10",
      human_conclusion: "SYN-SENSITIVE-HUMAN-CONCLUSION-R10",
      updated_at: BEFORE_UPDATED_AT,
      ...improvementOverrides,
    },
    ...rootOverrides,
  };
}

function capability(overrides = {}) {
  return {
    attestation_contract: "w6_reopen_projection_capability.v1",
    attestation_id: "SYN-ATTESTATION-R10-001",
    data_scope: "synthetic_experiment",
    evidence_class: "synthetic_experiment",
    verification_status: "synthetic_fixture",
    execution_mode: "sealed_outbox_cas",
    recurrence_visibility_no_broader_than_source_fields: true,
    permission_snapshot_sha256: SHA_B,
    permission_revision: "synthetic-permission-revision-v1",
    issued_at: CAPABILITY_ISSUED_AT,
    expires_at: CAPABILITY_EXPIRES_AT,
    evidence_unit_ref: "SYN-EVIDENCE-P02-P03-R10",
    verified_by_role: "test_harness",
    ...overrides,
  };
}

function notTestedCapability(overrides = {}) {
  return capability({
    evidence_class: "solution_design",
    verification_status: "not_tested",
    execution_mode: "insufficient",
    recurrence_visibility_no_broader_than_source_fields: false,
    permission_snapshot_sha256: null,
    permission_revision: null,
    issued_at: null,
    expires_at: null,
    evidence_unit_ref: null,
    verified_by_role: null,
    ...overrides,
  });
}

function onsiteShapeCapability(overrides = {}) {
  return capability({
    evidence_class: "solution_design",
    verification_status: "onsite_verified",
    execution_mode: "atomic_all_targets",
    evidence_unit_ref: "P02+P03",
    verified_by_role: "authorized_competition_operator",
    ...overrides,
  });
}

function existingReopenSnapshot(overrides = {}) {
  const previousProjection = {
    day_7_result: "SYN-OLDER-DAY-7-R10",
    day_30_result: "SYN-OLDER-DAY-30-R10",
    human_conclusion: "SYN-OLDER-CONCLUSION-R10",
  };
  return {
    projection_contract: "reopen_snapshot.v1",
    data_scope: "synthetic_experiment",
    evidence_class: "synthetic_experiment",
    source_receipt_sha256: SHA_A,
    projection_idempotency_key: SHA_A,
    committed_at: "2026-08-02T10:00:00.000Z",
    previous_projection: previousProjection,
    previous_projection_sha256: createWorkflowEventFingerprint({
      contract: "neoloop.feishu.w6-reopen.previous-projection.v1",
      ...previousProjection,
    }),
    ...overrides,
  };
}

function createCountingPlanner() {
  const preimages = [];
  const planner = createW6ReopenProjectionPlannerForTest((value) => {
    preimages.push(value);
    return createWorkflowEventFingerprint(value);
  });
  return { planner, preimages };
}

function expectPlannerRejectBeforeHash({
  source = projectionSource(),
  before = projectionBefore(),
  attestation = capability(),
  checkedAt = CAPABILITY_CHECKED_AT,
}, error) {
  const { planner, preimages } = createCountingPlanner();
  const result = planner(source, before, attestation, checkedAt);
  assert.deepEqual(Reflect.ownKeys(result).sort(), ["artifact", "decision", "execution", "plan"]);
  assert.equal(result.decision, "reject");
  assert.equal(result.plan, null);
  assert.equal(result.execution, null);
  assert.equal(result.artifact.decision, "reject");
  assert.equal(result.artifact.safe_error, error);
  assert.equal(result.artifact.projector_key, W6_REOPEN_PROJECTOR_KEY);
  assert.equal(result.artifact.data_scope, "synthetic_experiment");
  assert.equal(result.artifact.evidence_class, "synthetic_experiment");
  assert.equal(result.artifact.redaction_status, "passed");
  for (const field of [
    "projection_idempotency_key",
    "cluster_id",
    "improvement_id",
    "cluster_expected_before_sha256",
    "cluster_expected_after_sha256",
    "improvement_expected_before_sha256",
    "improvement_expected_after_sha256",
    "sealed_plan_sha256",
  ]) {
    assert.equal(result.artifact[field], null);
  }
  assert.deepEqual(result.artifact.write_targets, []);
  assert.equal(result.artifact.planned_target_count, 0);
  assert.equal(result.artifact.repair_required, false);
  assert.equal(result.artifact.repair_target, null);
  assert.equal(preimages.length, 0);
  assertDeepFrozen(result);
  return result;
}

function expectFailure(fn, error) {
  assert.throws(fn, (caught) => {
    assert.equal(caught?.error, error);
    assert.equal(caught?.message, "W6 reopen projection request was rejected");
    return true;
  });
}

function expectVerifierFailureBeforeHash(value, error, expectedReceiptId = RECEIPT_ID) {
  let hasherCalls = 0;
  expectFailure(
    () => verifyW6ReopenCommitProof(value, expectedReceiptId, () => {
      hasherCalls += 1;
      return SHA_A;
    }),
    error,
  );
  assert.equal(hasherCalls, 0);
}

function assertNoRecursiveKeyOrValue(value, forbiddenKeys, forbiddenValues) {
  if (value === null || typeof value !== "object") {
    assert.equal(forbiddenValues.has(value), false);
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    assert.equal(forbiddenKeys.has(key), false, `forbidden projection-source key: ${key}`);
    assertNoRecursiveKeyOrValue(child, forbiddenKeys, forbiddenValues);
  }
}

function assertDeepFrozen(value) {
  if (value === null || typeof value !== "object") return;
  assert.equal(Object.isFrozen(value), true);
  for (const child of Object.values(value)) assertDeepFrozen(child);
}

const PUBLIC_ARTIFACT_KEYS = [
  "cluster_expected_after_sha256",
  "cluster_expected_before_sha256",
  "cluster_id",
  "data_scope",
  "decision",
  "evidence_class",
  "improvement_expected_after_sha256",
  "improvement_expected_before_sha256",
  "improvement_id",
  "planned_target_count",
  "projection_idempotency_key",
  "projector_key",
  "redaction_status",
  "repair_required",
  "repair_target",
  "safe_error",
  "sealed_plan_sha256",
  "write_targets",
];

function committedTrigger(overrides = {}) {
  return {
    kind: "committed_new_reopen",
    receipt_id: RECEIPT_ID,
    data_scope: "synthetic_experiment",
    evidence_class: "synthetic_experiment",
    ...overrides,
  };
}

function exactReplayTrigger(overrides = {}) {
  return {
    kind: "authorized_exact_replay",
    data_scope: "synthetic_experiment",
    evidence_class: "synthetic_experiment",
    ...overrides,
  };
}

function nearConflictTrigger(overrides = {}) {
  return {
    kind: "authorized_near_conflict",
    data_scope: "synthetic_experiment",
    evidence_class: "synthetic_experiment",
    ...overrides,
  };
}

function assertPublicArtifact(artifact) {
  assert.deepEqual(Reflect.ownKeys(artifact).sort(), PUBLIC_ARTIFACT_KEYS);
  assert.equal(artifact.projector_key, W6_REOPEN_PROJECTOR_KEY);
  assert.equal(artifact.data_scope, "synthetic_experiment");
  assert.equal(artifact.evidence_class, "synthetic_experiment");
  assert.equal(artifact.redaction_status, "passed");
  assertDeepFrozen(artifact);
}

function assertG5PublicArtifactRedacted(artifact, forbiddenValues = []) {
  assertPublicArtifact(artifact);
  assertNoRecursiveKeyOrValue(
    artifact,
    new Set([
      "plan",
      "patch",
      "directive",
      "execution",
      "selector",
      "record_id",
      "opaque_locator",
      "resolved_record_locator_sha256",
      "target_acks",
      "lease",
      "worker_id",
      "lease_expires_at",
      "source_receipt_id",
      "capability_attestation_id",
      "capability_attestation_sha256",
      "permission_snapshot_sha256",
      "permission_revision",
    ]),
    new Set(forbiddenValues),
  );
}

function createCompositionHarness({
  sourceValue = proof(),
  beforeValue = projectionBefore(),
  capabilityValue = capability(),
  clockValues = [CAPABILITY_CHECKED_AT],
  initialPlan = null,
  initialCanonicalReceiptMaterial = initialPlan === null ? null : receipt(),
  executionEvidence = null,
  forcedSealOutcome = null,
  failureAt = null,
  loadBarrierSize = 0,
  artifactFault = null,
  additionalSensitiveValues = [],
  hasher = createWorkflowEventFingerprint,
  useProduction = false,
} = {}) {
  const calls = {
    source: 0,
    base: 0,
    capability: 0,
    permissionRevalidation: 0,
    clock: 0,
    outboxLoad: 0,
    outboxSeal: 0,
    executionEvidence: 0,
    hasher: 0,
  };
  const order = [];
  const sealOutcomes = [];
  const sealInputs = [];
  const hashPreimages = [];
  let authoritativePlan = initialPlan === null ? null : cloneJson(initialPlan);
  let authoritativeCanonicalReceiptMaterial = initialCanonicalReceiptMaterial === null
    ? null
    : cloneJson(initialCanonicalReceiptMaterial);
  let clockIndex = 0;
  let loadArrivals = 0;
  let releaseLoadBarrier;
  const loadBarrier = loadBarrierSize > 0
    ? new Promise((resolve) => {
      releaseLoadBarrier = resolve;
    })
    : null;

  function maybeFail(stage) {
    if (failureAt === stage) throw new Error(`SYN-SENSITIVE-${stage}-MUST-NOT-LEAK`);
  }

  const ports = {
    source: {
      async loadFirstCommittedReopenByReceiptId() {
        calls.source += 1;
        order.push("source");
        maybeFail("source");
        return cloneJson(sourceValue);
      },
    },
    base: {
      async loadProjectionStateByBusinessKeys(input) {
        calls.base += 1;
        order.push("base");
        maybeFail("base");
        const loaded = typeof beforeValue === "function"
          ? await beforeValue({
              input: cloneJson(input),
              call: calls.base,
              authoritativePlan: authoritativePlan === null ? null : cloneJson(authoritativePlan),
            })
          : beforeValue;
        return cloneJson(loaded);
      },
    },
    capability: {
      async loadCurrentAttestation() {
        calls.capability += 1;
        order.push("capability");
        maybeFail("capability");
        return cloneJson(capabilityValue);
      },
      async revalidatePermissionRevision() {
        calls.permissionRevalidation += 1;
        order.push("permissionRevalidation");
        maybeFail("permissionRevalidation");
        return true;
      },
    },
    clock: {
      nowIsoUtc() {
        calls.clock += 1;
        order.push("clock");
        maybeFail("clock");
        const value = clockValues[Math.min(clockIndex, clockValues.length - 1)];
        clockIndex += 1;
        return value;
      },
    },
    outbox: {
      async loadByReceiptId() {
        calls.outboxLoad += 1;
        order.push("outboxLoad");
        maybeFail("outboxLoad");
        if (loadBarrier !== null) {
          loadArrivals += 1;
          if (loadArrivals === loadBarrierSize) releaseLoadBarrier();
          await loadBarrier;
        }
        return authoritativePlan === null
          ? { outcome: "not_found" }
          : { outcome: "found", plan: cloneJson(authoritativePlan) };
      },
      async sealPlanIfAbsent(input) {
        calls.outboxSeal += 1;
        order.push("outboxSeal");
        maybeFail("outboxSeal");
        sealInputs.push(cloneJson(input));
        if (forcedSealOutcome !== null) {
          const forcedResult = typeof forcedSealOutcome === "function"
            ? forcedSealOutcome(input, calls.outboxSeal)
            : forcedSealOutcome;
          const outcome = typeof forcedResult === "string"
            ? forcedResult
            : forcedResult.outcome;
          sealOutcomes.push(outcome);
          if (outcome === "sealed" || outcome === "existing_same") {
            if (authoritativePlan === null) authoritativePlan = cloneJson(input.plan);
            if (authoritativeCanonicalReceiptMaterial === null) {
              authoritativeCanonicalReceiptMaterial = cloneJson(
                input.canonical_receipt_material,
              );
            }
            const returnedPlan = typeof forcedResult === "string" || forcedResult.plan === undefined
              ? authoritativePlan
              : forcedResult.plan;
            return { outcome, plan: cloneJson(returnedPlan) };
          }
          return { outcome };
        }
        if (authoritativePlan === null) {
          authoritativePlan = cloneJson(input.plan);
          authoritativeCanonicalReceiptMaterial = cloneJson(
            input.canonical_receipt_material,
          );
          sealOutcomes.push("sealed");
          return { outcome: "sealed", plan: cloneJson(authoritativePlan) };
        }
        const stableInputPlan = cloneJson(input.plan);
        const sameReceiptId = stableInputPlan.source_receipt_id === authoritativePlan.source_receipt_id;
        const sameDigest = stableInputPlan.source_receipt_sha256 === authoritativePlan.source_receipt_sha256;
        const stableCanonicalReceiptMaterial = cloneJson(
          input.canonical_receipt_material,
        );
        const sameCanonicalMaterial = isDeepStrictEqual(
          stableCanonicalReceiptMaterial,
          authoritativeCanonicalReceiptMaterial,
        );
        if (sameReceiptId && (!sameDigest || !sameCanonicalMaterial)) {
          sealOutcomes.push("receipt_conflict");
          return { outcome: "receipt_conflict" };
        }
        if (!sameReceiptId && sameDigest) {
          sealOutcomes.push("digest_conflict");
          return { outcome: "digest_conflict" };
        }
        if (!sameReceiptId || !isDeepStrictEqual(stableInputPlan, authoritativePlan)) {
          sealOutcomes.push("plan_conflict");
          return { outcome: "plan_conflict" };
        }
        sealOutcomes.push("existing_same");
        return { outcome: "existing_same", plan: cloneJson(authoritativePlan) };
      },
      async loadExecutionEvidence(sealedPlanSha256) {
        calls.executionEvidence += 1;
        order.push("executionEvidence");
        maybeFail("executionEvidence");
        const loaded = typeof executionEvidence === "function"
          ? await executionEvidence({
              sealedPlanSha256,
              call: calls.executionEvidence,
              authoritativePlan: authoritativePlan === null ? null : cloneJson(authoritativePlan),
            })
          : executionEvidence;
        return loaded === null ? null : cloneJson(loaded);
      },
    },
  };
  const testOptions = {
    hashJsonValue(value) {
      calls.hasher += 1;
      order.push(`hasher:${calls.hasher}`);
      hashPreimages.push(cloneJson(value));
      maybeFail("hasher");
      return hasher(value);
    },
    ...(artifactFault === null ? {} : { artifactFault }),
    additionalSensitiveValues,
  };
  const composition = useProduction
    ? createW6ReopenProjectionComposition(ports)
    : createW6ReopenProjectionCompositionForTest(ports, testOptions);
  return {
    calls,
    composition,
    ports,
    order,
    sealInputs,
    sealOutcomes,
    getAuthoritativePlan: () => authoritativePlan,
    getAuthoritativeCanonicalReceiptMaterial: () =>
      authoritativeCanonicalReceiptMaterial === null
        ? null
        : cloneJson(authoritativeCanonicalReceiptMaterial),
    hashPreimages,
  };
}

function resealProjectionPlan(plan) {
  const resealed = cloneJson(plan);
  const planMaterial = cloneJson(resealed);
  delete planMaterial.sealed_plan_sha256;
  resealed.sealed_plan_sha256 = createWorkflowEventFingerprint({
    contract: W6_REOPEN_PLAN_HASH_CONTRACT,
    ...planMaterial,
  });
  return resealed;
}

function executionEvidenceForPlan(plan, acknowledgedTargetCount = 0) {
  const targetAcks = plan.write_targets.slice(0, acknowledgedTargetCount).map((target) => ({
    target: target.target,
    expected_after_sha256: target.expected_after_sha256,
    applied_by_sealed_plan_sha256: plan.sealed_plan_sha256,
    capability_attestation_sha256: plan.capability_attestation_sha256,
    capability_rechecked_at: CAPABILITY_CHECKED_AT,
    permission_snapshot_sha256: plan.permission_snapshot_sha256,
    permission_revision: plan.permission_revision,
    resolved_record_locator_sha256: SHA_C,
  }));
  return {
    evidence_contract: "w6_reopen_projection_execution_evidence.v1",
    source_receipt_id: plan.source_receipt_id,
    source_receipt_sha256: plan.source_receipt_sha256,
    sealed_plan_sha256: plan.sealed_plan_sha256,
    capability_attestation_id: plan.capability_attestation_id,
    capability_attestation_sha256: plan.capability_attestation_sha256,
    capability_rechecked_at: CAPABILITY_CHECKED_AT,
    execution_mode: plan.execution_mode,
    permission_snapshot_sha256: plan.permission_snapshot_sha256,
    permission_revision: plan.permission_revision,
    exact_plan_material_match: true,
    acknowledged_target_count: acknowledgedTargetCount,
    target_acks: targetAcks,
  };
}

function executionEvidenceForTargets(plan, targets = []) {
  const targetAcks = targets.map((targetName, index) => {
    const target = plan.write_targets.find((candidate) => candidate.target === targetName);
    assert.ok(target, `missing plan target ${targetName}`);
    return {
      target: targetName,
      expected_after_sha256: target.expected_after_sha256,
      applied_by_sealed_plan_sha256: plan.sealed_plan_sha256,
      capability_attestation_sha256: plan.capability_attestation_sha256,
      capability_rechecked_at: `2026-08-03T10:10:00.00${index}Z`,
      permission_snapshot_sha256: plan.permission_snapshot_sha256,
      permission_revision: plan.permission_revision,
      resolved_record_locator_sha256: targetName === "clusters" ? SHA_C : "d".repeat(64),
    };
  });
  return {
    evidence_contract: "w6_reopen_projection_execution_evidence.v1",
    source_receipt_id: plan.source_receipt_id,
    source_receipt_sha256: plan.source_receipt_sha256,
    sealed_plan_sha256: plan.sealed_plan_sha256,
    capability_attestation_id: plan.capability_attestation_id,
    capability_attestation_sha256: plan.capability_attestation_sha256,
    capability_rechecked_at: "2026-08-03T10:10:00.009Z",
    execution_mode: plan.execution_mode,
    permission_snapshot_sha256: plan.permission_snapshot_sha256,
    permission_revision: plan.permission_revision,
    exact_plan_material_match: true,
    acknowledged_target_count: targetAcks.length,
    target_acks: targetAcks,
  };
}

function projectionObservedForPlan(plan, {
  cluster = "B",
  improvement = "B",
  root = {},
  clusterOverrides = {},
  improvementOverrides = {},
} = {}) {
  const before = projectionBefore();
  const clusterTarget = plan.write_targets[0];
  const improvementTarget = plan.write_targets[1];
  const observedCluster = cluster === "A"
    ? {
        cluster_id: clusterTarget.selector.value,
        ...cloneJson(clusterTarget.patch),
      }
    : {
        ...cloneJson(before.cluster),
        ...(cluster === "X" ? { updated_at: "2026-08-03T09:00:00.001Z" } : {}),
      };
  const observedImprovement = improvement === "A"
    ? {
        improvement_id: improvementTarget.selector.value,
        ...cloneJson(improvementTarget.patch),
      }
    : {
        ...cloneJson(before.improvement),
        ...(improvement === "X" ? { updated_at: "2026-08-03T09:00:00.001Z" } : {}),
      };
  return {
    projection_contract: "w6_reopen_projection_observed.v1",
    data_scope: "synthetic_experiment",
    evidence_class: "synthetic_experiment",
    cluster: { ...observedCluster, ...clusterOverrides },
    improvement: { ...observedImprovement, ...improvementOverrides },
    ...root,
  };
}

function assertReconcileReject(result, safeError, label) {
  assert.equal(result instanceof Promise, false, label);
  assert.deepEqual(Reflect.ownKeys(result).sort(), ["artifact", "decision", "execution", "plan"], label);
  assert.equal(result.decision, "reject", label);
  assert.equal(result.plan, null, label);
  assert.equal(result.execution, null, label);
  assertPublicArtifact(result.artifact);
  assert.equal(result.artifact.decision, "reject", label);
  assert.equal(result.artifact.safe_error, safeError, label);
  assert.deepEqual(result.artifact.write_targets, [], label);
  assert.equal(result.artifact.planned_target_count, 0, label);
  assert.equal(result.artifact.repair_required, false, label);
  assert.equal(result.artifact.repair_target, null, label);
  assertDeepFrozen(result);
  return result;
}

function assertRepairReusesOriginalPlan(result, originalPlan, repairTarget) {
  const expectedMode = repairTarget === "clusters" ? "cluster_only" : "improvement_only";
  assert.equal(result.decision, "repair");
  assert.deepEqual(result.plan, originalPlan);
  assert.equal(result.plan.sealed_plan_sha256, originalPlan.sealed_plan_sha256);
  assert.deepEqual(result.plan.write_targets, originalPlan.write_targets);
  assert.deepEqual(result.execution, {
    mode: expectedMode,
    sealed_plan_sha256: originalPlan.sealed_plan_sha256,
    capability_attestation_sha256: originalPlan.capability_attestation_sha256,
    permission_revision: originalPlan.permission_revision,
    pending_targets: [repairTarget],
  });
  assertPublicArtifact(result.artifact);
  assert.equal(result.artifact.decision, "repair");
  assert.equal(result.artifact.repair_required, true);
  assert.equal(result.artifact.repair_target, repairTarget);
  assert.deepEqual(result.artifact.write_targets, [repairTarget]);
  assert.equal(result.artifact.planned_target_count, 1);
  assert.equal(result.artifact.safe_error, null);
  assertDeepFrozen(result);
}

function assertNoPortOrHasherCalls(calls) {
  assert.deepEqual(calls, {
    source: 0,
    base: 0,
    capability: 0,
    permissionRevalidation: 0,
    clock: 0,
    outboxLoad: 0,
    outboxSeal: 0,
    executionEvidence: 0,
    hasher: 0,
  });
}

function nestedObject(depth) {
  let value = null;
  for (let index = 0; index < depth; index += 1) value = { child: value };
  return value;
}

test("R10 G1.1 public facade accepts only closed triggers and keeps trusted ports private", async () => {
  const productionHarness = createCompositionHarness({ useProduction: true });
  assert.deepEqual(Reflect.ownKeys(productionHarness.composition), ["handle"]);
  const boundaryHarness = createCompositionHarness();

  for (const injectedKey of [
    "proof",
    "before",
    "capability",
    "port",
    "lease",
    "locator",
  ]) {
    const result = await boundaryHarness.composition.handle(committedTrigger({
      [injectedKey]: { injected: true },
    }));
    assertPublicArtifact(result);
    assert.equal(result.decision, "reject");
    assert.equal(result.safe_error, "invalid_projection_input");
  }
  assertNoPortOrHasherCalls(boundaryHarness.calls);

  const brokenSource = createCompositionHarness({ sourceValue: { outcome: "committed" } });
  const brokenResult = await brokenSource.composition.handle(committedTrigger());
  assertPublicArtifact(brokenResult);
  assert.equal(brokenResult.decision, "reject");
  assert.notEqual(brokenResult.safe_error, null);
  assert.equal(brokenSource.calls.source, 1);
  assert.equal(brokenSource.calls.base, 0);
  assert.equal(brokenSource.calls.outboxLoad, 0);
  assert.equal(brokenSource.calls.outboxSeal, 0);

  const success = await createCompositionHarness().composition.handle(committedTrigger());
  assertPublicArtifact(success);
  assert.equal(success.decision, "apply_once");
  assert.equal(Object.hasOwn(success, "plan"), false);
  assert.equal(Object.hasOwn(success, "execution"), false);
  assert.equal(Object.hasOwn(success, "ports"), false);
});

test("R10 G1.2 verifier accepts only a committed reopen proof with an exact receipt", () => {
  const verified = verifyW6ReopenCommitProof(proof(), RECEIPT_ID);
  assert.deepEqual(Reflect.ownKeys(verified).sort(), [
    "canonical_receipt_material",
    "projection_source",
  ]);
  assert.deepEqual(Reflect.ownKeys(verified.projection_source).sort(), [
    "cluster_after",
    "committed_at",
    "data_scope",
    "evidence_class",
    "improvement_after",
    "source_contract",
    "source_receipt_id",
    "source_receipt_sha256",
    "triggering_case_ids",
  ]);
  assert.deepEqual(Reflect.ownKeys(verified.projection_source.cluster_after).sort(), [
    "cluster_id",
    "member_case_ids",
    "status",
    "updated_at",
  ]);
  assert.deepEqual(Reflect.ownKeys(verified.projection_source.improvement_after).sort(), [
    "improvement_id",
    "status",
    "updated_at",
  ]);
  assert.equal(verified.projection_source.source_contract, "verified_w6_reopen_projection_source.v1");
  assert.equal(verified.projection_source.data_scope, "synthetic_experiment");
  assert.equal(verified.projection_source.evidence_class, "synthetic_experiment");
  assert.equal(verified.projection_source.source_receipt_id, RECEIPT_ID);
  assert.equal(
    verified.projection_source.source_receipt_sha256,
    "14e04ed6c641c1d98df437987d0a6588148ee95f000b4fb61550e7d3472469d5",
  );
  assert.equal(verified.projection_source.committed_at, COMMITTED_AT);
  assert.deepEqual(verified.projection_source.triggering_case_ids, TRIGGERING_CASE_IDS);
  assert.deepEqual(verified.projection_source.cluster_after, {
    cluster_id: CLUSTER_ID,
    member_case_ids: CASE_IDS,
    status: "观察中",
    updated_at: COMMITTED_AT,
  });
  assert.deepEqual(verified.projection_source.improvement_after, {
    improvement_id: IMPROVEMENT_ID,
    status: "观察中",
    updated_at: COMMITTED_AT,
  });
  assert.equal(JSON.stringify(verified.canonical_receipt_material), JSON.stringify(receipt()));
  assertNoRecursiveKeyOrValue(
    verified.projection_source,
    new Set([
      "event_id",
      "history_id",
      "cycle_id",
      "checkpoint_id",
      "target_fingerprint",
      "command_fingerprint",
      "state_fingerprint",
      "principal",
      "opened_by",
      "authorization_policy_version",
      "reason",
      "triggering_case_snapshots",
      "feedback_links",
      "w5_closure_fingerprint",
    ]),
    new Set([
      "SYN-PRINCIPAL-R10-001",
      "synthetic-w6-policy-v1",
      "合成复发重开验证",
      "SYN-EVENT-R10-001",
      HISTORY_ID,
      CYCLE_ID,
    ]),
  );
  assertDeepFrozen(verified);

  let injectedHasherCalls = 0;
  const injectedDigest = verifyW6ReopenCommitProof(proof(), RECEIPT_ID, () => {
    injectedHasherCalls += 1;
    return SHA_A;
  });
  assert.equal(injectedHasherCalls, 1);
  assert.equal(injectedDigest.projection_source.source_receipt_sha256, SHA_A);

  for (const outcome of ["idempotent", "concurrency_conflict"]) {
    expectVerifierFailureBeforeHash(proof({ outcome }), "unverified_commit");
  }
  const extraReceipt = receipt({ injected: true });
  expectVerifierFailureBeforeHash(proof({ receipt: extraReceipt }), "invalid_projection_input");
  expectVerifierFailureBeforeHash(proof({ history_entries: [] }), "unverified_commit");
  expectVerifierFailureBeforeHash(proof({ observation_cycles: [] }), "unverified_commit");
  expectVerifierFailureBeforeHash(
    proof({ receipt: receipt({ phase: "observation" }) }),
    "unverified_commit",
  );
  expectVerifierFailureBeforeHash(
    proof({ receipt: receipt({ action: "archive_observation" }) }),
    "unverified_commit",
  );
  expectVerifierFailureBeforeHash(proof(), "commit_proof_mismatch", "SYN-RECEIPT-R10-OTHER");
  expectVerifierFailureBeforeHash({ ...proof(), injected: true }, "invalid_projection_input");

  const missingReceipt = proof();
  delete missingReceipt.receipt;
  expectVerifierFailureBeforeHash(missingReceipt, "invalid_projection_input");
  const missingHistoryId = proof();
  delete missingHistoryId.receipt.history_id;
  expectVerifierFailureBeforeHash(missingHistoryId, "invalid_projection_input");
  for (const receiptOverrides of [
    { improvement_id: null },
    { target_fingerprint: null },
    { cycle_id: null },
    { checkpoint_id: "SYN-CHECKPOINT-R10-001" },
  ]) {
    expectVerifierFailureBeforeHash(
      proof({ receipt: receipt(receiptOverrides) }),
      "unverified_commit",
    );
  }
  expectVerifierFailureBeforeHash(
    proof({ receipt: receipt({ case_ids: [CASE_IDS[0], CASE_IDS[0]] }) }),
    "invalid_projection_input",
  );

  for (const field of ["cluster_after", "improvement_after"]) {
    const missingAfter = proof();
    delete missingAfter[field];
    expectVerifierFailureBeforeHash(missingAfter, "unverified_commit");
    expectVerifierFailureBeforeHash(proof({ [field]: null }), "unverified_commit");
    expectVerifierFailureBeforeHash(proof({ [field]: {} }), "invalid_projection_input");
  }
});

test("R10 G1.3 verifier binds receipt-selected history, cycle, after snapshots, and sealed order", () => {
  const earlierTime = "2026-08-02T10:00:00.000Z";
  const laterTime = "2026-08-04T10:00:00.000Z";
  const earlierCycle = cycle({
    cycle_id: "SYN-CYCLE-R10-000",
    ordinal: 1,
    opened_at: earlierTime,
  });
  const laterCycle = cycle({
    cycle_id: "SYN-CYCLE-R10-002",
    ordinal: 3,
    opened_at: laterTime,
  });
  const earlierEntry = historyEntry({
    history_id: "SYN-HISTORY-R10-000",
    cycle_id: earlierCycle.cycle_id,
    occurred_at: earlierTime,
  });
  const laterEntry = historyEntry({
    history_id: "SYN-HISTORY-R10-002",
    cycle_id: laterCycle.cycle_id,
    occurred_at: laterTime,
  });
  const selected = proof();
  selected.history_entries = [earlierEntry, historyEntry(), laterEntry];
  selected.observation_cycles = [earlierCycle, cycle(), laterCycle];
  const verified = verifyW6ReopenCommitProof(selected, RECEIPT_ID);
  assert.equal(verified.projection_source.committed_at, COMMITTED_AT);

  const swappedHistory = proof();
  swappedHistory.history_entries[0].occurred_at = laterTime;
  expectVerifierFailureBeforeHash(swappedHistory, "commit_proof_mismatch");
  const swappedCycle = proof();
  swappedCycle.observation_cycles[0].cycle_id = "SYN-CYCLE-R10-OTHER";
  expectVerifierFailureBeforeHash(swappedCycle, "commit_proof_mismatch");
  const reorderedMembers = proof({
    cluster_after: clusterAfter({ member_case_ids: [...CASE_IDS].reverse() }),
  });
  expectVerifierFailureBeforeHash(reorderedMembers, "commit_proof_mismatch");
  expectVerifierFailureBeforeHash(
    proof({ improvement_after: improvementAfter({ updated_at: laterTime }) }),
    "commit_proof_mismatch",
  );
  expectVerifierFailureBeforeHash(
    proof({ cluster_after: clusterAfter({ status: "已归档" }) }),
    "commit_proof_mismatch",
  );
  const unboundTrigger = "SYN-CASE-R10-UNBOUND";
  expectVerifierFailureBeforeHash(
    proof({
      observation_cycles: [cycle({ triggering_case_ids: [unboundTrigger] })],
    }),
    "commit_proof_mismatch",
  );

  const validOrderedTriggers = [CASE_IDS[0], CASE_IDS[2]];
  const ordered = verifyW6ReopenCommitProof(proof({
    observation_cycles: [cycle({ triggering_case_ids: validOrderedTriggers })],
  }), RECEIPT_ID);
  assert.deepEqual(ordered.projection_source.triggering_case_ids, validOrderedTriggers);
  expectVerifierFailureBeforeHash(
    proof({
      observation_cycles: [cycle({ triggering_case_ids: [...validOrderedTriggers].reverse() })],
    }),
    "commit_proof_mismatch",
  );
  expectVerifierFailureBeforeHash(
    proof({ observation_cycles: [cycle({ triggering_case_ids: [] })] }),
    "invalid_projection_input",
  );
  expectVerifierFailureBeforeHash(
    proof({ observation_cycles: [cycle({ triggering_case_ids: [CASE_IDS[0], CASE_IDS[0]] })] }),
    "invalid_projection_input",
  );

  const duplicateHistory = proof();
  duplicateHistory.history_entries.push(historyEntry());
  expectVerifierFailureBeforeHash(duplicateHistory, "commit_proof_mismatch");
  const duplicateCycle = proof();
  duplicateCycle.observation_cycles.push(cycle());
  expectVerifierFailureBeforeHash(duplicateCycle, "commit_proof_mismatch");

  const fiveWayMismatches = [
    proof({ receipt: receipt({ event_id: "SYN-EVENT-R10-OTHER" }) }),
    proof({ receipt: receipt({ case_ids: [...CASE_IDS].reverse() }) }),
    proof({ history_entries: [historyEntry({ cluster_id: "SYN-CLUSTER-R10-OTHER" })] }),
    proof({ history_entries: [historyEntry({ improvement_id: "SYN-IMPROVEMENT-R10-OTHER" })] }),
    proof({ history_entries: [historyEntry({ cycle_id: "SYN-CYCLE-R10-OTHER" })] }),
    proof({ history_entries: [historyEntry({ occurred_at: laterTime })] }),
    proof({ history_entries: [historyEntry({ case_ids: [...CASE_IDS].reverse() })] }),
    proof({ observation_cycles: [cycle({ cluster_id: "SYN-CLUSTER-R10-OTHER" })] }),
    proof({ observation_cycles: [cycle({ improvement_id: "SYN-IMPROVEMENT-R10-OTHER" })] }),
    proof({ observation_cycles: [cycle({ opened_at: laterTime })] }),
    proof({ observation_cycles: [cycle({
      opened_by: { ...cycle().opened_by, principal_id: "SYN-PRINCIPAL-R10-OTHER" },
    })] }),
    proof({ observation_cycles: [cycle({ authorization_policy_version: "synthetic-w6-policy-v2" })] }),
    proof({ cluster_after: clusterAfter({ cluster_id: "SYN-CLUSTER-R10-OTHER" }) }),
    proof({ cluster_after: clusterAfter({ active_improvement_id: "SYN-IMPROVEMENT-R10-OTHER" }) }),
    proof({ cluster_after: clusterAfter({ updated_at: laterTime }) }),
    proof({ improvement_after: improvementAfter({ improvement_id: "SYN-IMPROVEMENT-R10-OTHER" }) }),
    proof({ improvement_after: improvementAfter({ cluster_id: "SYN-CLUSTER-R10-OTHER" }) }),
    proof({ improvement_after: improvementAfter({ current_observation_cycle_id: "SYN-CYCLE-R10-OTHER" }) }),
    proof({ improvement_after: improvementAfter({ status: "已完成" }) }),
    proof({ improvement_after: improvementAfter({ human_conclusion: "合成结论" }) }),
  ];
  for (const mismatch of fiveWayMismatches) {
    expectVerifierFailureBeforeHash(mismatch, "commit_proof_mismatch");
  }

  const mismatchedSnapshot = proof();
  mismatchedSnapshot.observation_cycles[0].triggering_case_snapshots[0].case_id = CASE_IDS[0];
  expectVerifierFailureBeforeHash(mismatchedSnapshot, "commit_proof_mismatch");

  const missingHypothesisField = rootCauseHypothesis();
  delete missingHypothesisField.node_run_id;
  const extraEvidence = evidenceSpan(CASE_IDS[0], "合成证据");
  extraEvidence.injected = true;
  const missingEvidenceField = evidenceSpan(CASE_IDS[0], "合成证据");
  delete missingEvidenceField.source_ref;
  const malformedHypotheses = [
    rootCauseHypothesis({ injected: true }),
    missingHypothesisField,
    rootCauseHypothesis({ node_version: "N6-root-cause-1.0.0-draft.2" }),
    rootCauseHypothesis({ input_hash: SHA_A.toUpperCase() }),
    rootCauseHypothesis({ supporting_evidence: [evidenceSpan(CASE_IDS[0], "唯一支持证据")] }),
    rootCauseHypothesis({ counter_evidence: [] }),
    rootCauseHypothesis({ uncertainties: [] }),
    rootCauseHypothesis({ final_root_cause: true }),
    rootCauseHypothesis({ supporting_evidence: [
      extraEvidence,
      evidenceSpan(CASE_IDS[1], "合成支持证据二"),
    ] }),
    rootCauseHypothesis({ counter_evidence: [missingEvidenceField] }),
    rootCauseHypothesis({ counter_evidence: [
      evidenceSpan(CASE_IDS[2], "合成反证", { start_offset: -1 }),
    ] }),
    rootCauseHypothesis({ counter_evidence: [
      evidenceSpan(CASE_IDS[2], "合成反证", { start_offset: 2, end_offset: 1 }),
    ] }),
    rootCauseHypothesis({ uncertainties: ["   "] }),
  ];
  for (const hypothesis of malformedHypotheses) {
    expectVerifierFailureBeforeHash(
      proof({ cluster_after: clusterAfter({ root_cause_hypothesis: hypothesis }) }),
      "invalid_projection_input",
    );
  }
});

test("R10 G1.4 descriptor-safe snapshot rejects hostile descriptors and enforces every G2 resource limit", () => {
  const frozen = Object.freeze({
    safe: Object.freeze(["synthetic", 7, true, null]),
  });
  const frozenSnapshot = snapshotDescriptorSafeJsonValue(frozen);
  assert.equal(JSON.stringify(frozenSnapshot), JSON.stringify(frozen));
  assertDeepFrozen(frozenSnapshot);

  const nullPrototype = Object.create(null);
  Object.defineProperty(nullPrototype, "safe", {
    value: "synthetic",
    enumerable: true,
    configurable: false,
    writable: false,
  });
  assert.equal(snapshotDescriptorSafeJsonValue(nullPrototype).safe, "synthetic");

  let getterCalls = 0;
  const accessor = {};
  Object.defineProperty(accessor, "secret", {
    enumerable: true,
    get() {
      getterCalls += 1;
      return "must-not-run";
    },
  });
  expectFailure(() => snapshotDescriptorSafeJsonValue(accessor), "invalid_projection_input");
  assert.equal(getterCalls, 0);

  let proxyTrapCalls = 0;
  const proxy = new Proxy({ safe: true }, {
    ownKeys(target) {
      proxyTrapCalls += 1;
      return Reflect.ownKeys(target);
    },
  });
  expectFailure(() => snapshotDescriptorSafeJsonValue(proxy), "invalid_projection_input");
  assert.equal(proxyTrapCalls, 0);

  const symbolObject = { safe: true };
  symbolObject[Symbol("hidden")] = true;
  const hidden = { safe: true };
  Object.defineProperty(hidden, "hidden", { value: true, enumerable: false });
  const cycleValue = {};
  cycleValue.self = cycleValue;
  const sparse = [];
  sparse.length = 1;
  const customPrototype = Object.create({ inherited: true });
  customPrototype.safe = true;
  const invalidValues = [
    symbolObject,
    hidden,
    { value: undefined },
    { value: () => null },
    { value: Symbol("value") },
    { value: Number.NaN },
    { value: Number.POSITIVE_INFINITY },
    { value: Number.NEGATIVE_INFINITY },
    { value: -0 },
    { value: 1.5 },
    { value: 1n },
    cycleValue,
    sparse,
    customPrototype,
    new Date(COMMITTED_AT),
    new Map(),
    new Set(),
    new Uint8Array([1]),
    { value: "\ud800" },
    { value: "\udc00" },
  ];
  for (const value of invalidValues) {
    expectFailure(() => snapshotDescriptorSafeJsonValue(value), "invalid_projection_input");
  }
  const aboveSafeInteger = { value: Number.MAX_SAFE_INTEGER + 1 };
  expectFailure(
    () => snapshotDescriptorSafeJsonValue(aboveSafeInteger),
    "invalid_projection_input",
  );
  const arrayWithExtraProperty = [];
  arrayWithExtraProperty.extra = true;
  expectFailure(
    () => snapshotDescriptorSafeJsonValue(arrayWithExtraProperty),
    "invalid_projection_input",
  );
  const arrayWithHiddenIndex = [true];
  Object.defineProperty(arrayWithHiddenIndex, "0", { value: true, enumerable: false });
  expectFailure(
    () => snapshotDescriptorSafeJsonValue(arrayWithHiddenIndex),
    "invalid_projection_input",
  );

  assert.doesNotThrow(() => snapshotDescriptorSafeJsonValue(nestedObject(W6_REOPEN_SNAPSHOT_LIMITS.max_depth)));
  expectFailure(
    () => snapshotDescriptorSafeJsonValue(nestedObject(W6_REOPEN_SNAPSHOT_LIMITS.max_depth + 1)),
    "invalid_projection_input",
  );
  assert.doesNotThrow(() => snapshotDescriptorSafeJsonValue(Array(1_000).fill(null)));
  expectFailure(
    () => snapshotDescriptorSafeJsonValue(Array(1_001).fill(null)),
    "invalid_projection_input",
  );
  assert.doesNotThrow(() => snapshotDescriptorSafeJsonValue({ ["k".repeat(128)]: true }));
  expectFailure(
    () => snapshotDescriptorSafeJsonValue({ ["k".repeat(129)]: true }),
    "invalid_projection_input",
  );
  assert.doesNotThrow(() => snapshotDescriptorSafeJsonValue("a".repeat(4_096)));
  expectFailure(
    () => snapshotDescriptorSafeJsonValue("a".repeat(4_097)),
    "invalid_projection_input",
  );
  const exactNodeLimit = Array.from(
    { length: 20 },
    (_, index) => Array(index === 19 ? 979 : 1_000).fill(null),
  );
  assert.doesNotThrow(() => snapshotDescriptorSafeJsonValue(exactNodeLimit));
  const overNodeLimit = [...exactNodeLimit.slice(0, -1), Array(980).fill(null)];
  expectFailure(() => snapshotDescriptorSafeJsonValue(overNodeLimit), "invalid_projection_input");
  const exactByteLimit = [
    ...Array.from({ length: 255 }, () => "a".repeat(4_096)),
    "a".repeat(3_327),
  ];
  assert.equal(Buffer.byteLength(JSON.stringify(exactByteLimit), "utf8"), 1_048_576);
  assert.doesNotThrow(() => snapshotDescriptorSafeJsonValue(exactByteLimit));
  const overByteLimit = [...exactByteLimit.slice(0, -1), "a".repeat(3_328)];
  assert.equal(Buffer.byteLength(JSON.stringify(overByteLimit), "utf8"), 1_048_577);
  expectFailure(() => snapshotDescriptorSafeJsonValue(overByteLimit), "invalid_projection_input");

  let hasherCalls = 0;
  const hostileProof = proof();
  Object.defineProperty(hostileProof.receipt, "secret", {
    enumerable: true,
    get() {
      getterCalls += 1;
      return "must-not-run";
    },
  });
  expectFailure(
    () => verifyW6ReopenCommitProof(hostileProof, RECEIPT_ID, () => {
      hasherCalls += 1;
      return SHA_A;
    }),
    "invalid_projection_input",
  );
  assert.equal(getterCalls, 0);
  assert.equal(hasherCalls, 0);
});

test("R10 G1.5 receipt hashing uses the fixed domain, complete exact material, and R9 ASCII IDs", () => {
  assert.equal(W6_REOPEN_PROJECTOR_KEY, "neoloop.feishu.w6-reopen.v1");
  assert.equal(
    W6_REOPEN_RECEIPT_HASH_CONTRACT,
    "neoloop.feishu.w6-reopen-projection-receipt.v1",
  );
  assert.equal(
    hashW6ReopenCommitReceipt(receipt()),
    "14e04ed6c641c1d98df437987d0a6588148ee95f000b4fb61550e7d3472469d5",
  );
  let capturedPreimage = null;
  assert.equal(hashW6ReopenCommitReceipt(receipt(), (value) => {
    capturedPreimage = value;
    return SHA_A;
  }), SHA_A);
  assert.equal(JSON.stringify(capturedPreimage), JSON.stringify({
    contract: W6_REOPEN_RECEIPT_HASH_CONTRACT,
    receipt: receipt(),
  }));
  assertDeepFrozen(capturedPreimage);
  for (const value of ["SYN-CASE-017", "W6-CASE-017", "BATCH-CASE-017", "case.1:part_2"]) {
    assert.equal(isW6ReopenProjectionId(value), true);
  }
  assert.equal(isW6ReopenProjectionId("a".repeat(128)), true);
  for (const value of ["", "has space", "案件-017", "a".repeat(129), null, 17]) {
    assert.equal(isW6ReopenProjectionId(value), false);
  }
  const changed = receipt({ command_fingerprint: SHA_C });
  assert.notEqual(hashW6ReopenCommitReceipt(changed), hashW6ReopenCommitReceipt(receipt()));
});

test("R10 G1.6 verifier rejects selective receipt hashes and semantic replay substitutes before hashing", () => {
  let hasherCalls = 0;
  const hasher = () => {
    hasherCalls += 1;
    return SHA_A;
  };
  const selectiveReceipt = {
    receipt_id: RECEIPT_ID,
    action: "reopen_recurrence",
    committed_at: COMMITTED_AT,
  };
  expectFailure(
    () => hashW6ReopenCommitReceipt(selectiveReceipt, hasher),
    "invalid_projection_input",
  );
  assert.equal(hasherCalls, 0);

  const missingHistoryId = receipt();
  delete missingHistoryId.history_id;
  for (const invalidReceipt of [
    missingHistoryId,
    receipt({ injected: true }),
    receipt({ case_ids: [CASE_IDS[0], CASE_IDS[0]] }),
    receipt({ improvement_id: null }),
    receipt({ target_fingerprint: null }),
    receipt({ cycle_id: null }),
    receipt({ checkpoint_id: "SYN-CHECKPOINT-R10-001" }),
  ]) {
    let invalidReceiptHasherCalls = 0;
    expectFailure(
      () => hashW6ReopenCommitReceipt(invalidReceipt, () => {
        invalidReceiptHasherCalls += 1;
        return SHA_A;
      }),
      "invalid_projection_input",
    );
    assert.equal(invalidReceiptHasherCalls, 0);
  }

  expectFailure(
    () => verifyW6ReopenCommitProof(proof({ outcome: "idempotent" }), RECEIPT_ID, hasher),
    "unverified_commit",
  );
  assert.equal(hasherCalls, 0);
  expectFailure(
    () => verifyW6ReopenCommitProof({
      workflow: "W6",
      status: "completed",
      output: { receipt: receipt() },
    }, RECEIPT_ID, hasher),
    "invalid_projection_input",
  );
  assert.equal(hasherCalls, 0);
  let throwingHasherCalls = 0;
  expectFailure(
    () => hashW6ReopenCommitReceipt(receipt(), () => {
      throwingHasherCalls += 1;
      throw new Error("SYN-SECRET-MUST-NOT-LEAK");
    }),
    "projection_dependency_failure",
  );
  assert.equal(throwingHasherCalls, 1);
  let uppercaseHasherCalls = 0;
  expectFailure(
    () => hashW6ReopenCommitReceipt(receipt(), () => {
      uppercaseHasherCalls += 1;
      return SHA_A.toUpperCase();
    }),
    "projection_dependency_failure",
  );
  assert.equal(uppercaseHasherCalls, 1);
  let coercionCalls = 0;
  let objectHasherCalls = 0;
  expectFailure(
    () => hashW6ReopenCommitReceipt(receipt(), () => {
      objectHasherCalls += 1;
      return {
        toString() {
          coercionCalls += 1;
          return SHA_A;
        },
      };
    }),
    "projection_dependency_failure",
  );
  assert.equal(objectHasherCalls, 1);
  assert.equal(coercionCalls, 0);
});

test("R10 G1.7 receipt, digest, and sealed-plan collisions map to the frozen outbox errors", async () => {
  for (const [outcome, expectedError] of [
    ["receipt_conflict", "commit_proof_mismatch"],
    ["digest_conflict", "projection_conflict"],
    ["plan_conflict", "projection_conflict"],
  ]) {
    const harness = createCompositionHarness({ forcedSealOutcome: outcome });
    const result = await harness.composition.handle(committedTrigger());
    assertPublicArtifact(result);
    assert.equal(result.decision, "reject");
    assert.equal(result.safe_error, expectedError);
    assert.equal(harness.calls.outboxSeal, 1);
    assert.equal(harness.calls.hasher, 8);
  }

  const source = projectionSource();
  const planned = planW6ReopenProjection(
    source,
    projectionBefore(),
    capability(),
    CAPABILITY_CHECKED_AT,
  );
  assert.equal(planned.decision, "apply_once");

  const canonicalMaterialSentinel = "9".repeat(64);
  const collidingReceipt = receipt({
    command_fingerprint: canonicalMaterialSentinel,
  });
  const collidingSourceProof = proof({ receipt: collidingReceipt });
  const canonicalCollisionHarness = createCompositionHarness({
    sourceValue: collidingSourceProof,
    initialPlan: planned.plan,
    initialCanonicalReceiptMaterial: receipt(),
    executionEvidence: ({ authoritativePlan }) =>
      executionEvidenceForTargets(authoritativePlan, ["clusters", "improvements"]),
    beforeValue: ({ authoritativePlan }) => projectionObservedForPlan(
      authoritativePlan,
      { cluster: "A", improvement: "A" },
    ),
    additionalSensitiveValues: [canonicalMaterialSentinel],
    hasher(value) {
      return value.contract === W6_REOPEN_RECEIPT_HASH_CONTRACT
        ? planned.plan.source_receipt_sha256
        : createWorkflowEventFingerprint(value);
    },
  });
  const canonicalCollision = await canonicalCollisionHarness.composition.handle(
    committedTrigger(),
  );
  assertG5PublicArtifactRedacted(canonicalCollision, [canonicalMaterialSentinel]);
  assert.equal(canonicalCollision.decision, "reject");
  assert.equal(canonicalCollision.safe_error, "commit_proof_mismatch");
  assert.equal(canonicalCollisionHarness.calls.source, 1);
  assert.equal(canonicalCollisionHarness.calls.hasher, 2);
  assert.equal(canonicalCollisionHarness.calls.outboxLoad, 1);
  assert.equal(canonicalCollisionHarness.calls.outboxSeal, 1);
  assert.equal(canonicalCollisionHarness.calls.executionEvidence, 0);
  assert.equal(canonicalCollisionHarness.calls.base, 0);
  assert.equal(canonicalCollisionHarness.calls.capability, 0);
  assert.equal(canonicalCollisionHarness.calls.clock, 0);
  assert.equal(canonicalCollisionHarness.calls.permissionRevalidation, 0);
  assert.deepEqual(
    canonicalCollisionHarness.getAuthoritativeCanonicalReceiptMaterial(),
    receipt(),
  );
  assert.deepEqual(
    canonicalCollisionHarness.sealInputs[0].canonical_receipt_material,
    collidingReceipt,
  );

  const exactMaterialHarness = createCompositionHarness({
    initialPlan: planned.plan,
    initialCanonicalReceiptMaterial: receipt(),
    executionEvidence: ({ authoritativePlan }) =>
      executionEvidenceForTargets(authoritativePlan, ["clusters", "improvements"]),
    beforeValue: ({ authoritativePlan }) => projectionObservedForPlan(
      authoritativePlan,
      { cluster: "A", improvement: "A" },
    ),
  });
  const exactMaterialFound = await exactMaterialHarness.composition.handle(committedTrigger());
  assert.equal(exactMaterialFound.decision, "already_applied");
  assert.equal(exactMaterialFound.safe_error, null);
  assert.equal(exactMaterialHarness.calls.outboxSeal, 1);
  assert.equal(exactMaterialHarness.calls.executionEvidence, 1);
  assert.equal(exactMaterialHarness.calls.base, 1);
  assert.equal(exactMaterialHarness.calls.capability, 0);
  assert.equal(exactMaterialHarness.calls.clock, 0);
  assert.equal(exactMaterialHarness.calls.permissionRevalidation, 0);
  assertG5PublicArtifactRedacted(exactMaterialFound);

  const returnedPlanMismatchMaterial = cloneJson(planned.plan);
  returnedPlanMismatchMaterial.permission_revision = "synthetic-permission-revision-v2";
  const returnedPlanMismatch = resealProjectionPlan(returnedPlanMismatchMaterial);
  assert.notEqual(
    returnedPlanMismatch.sealed_plan_sha256,
    planned.plan.sealed_plan_sha256,
  );
  for (const [label, forcedSealOutcome, expectedError] of [
    ["receipt conflict", "receipt_conflict", "commit_proof_mismatch"],
    ["digest conflict", "digest_conflict", "projection_conflict"],
    ["plan conflict", "plan_conflict", "projection_conflict"],
    ["found followed by sealed", "sealed", "projection_dependency_failure"],
    [
      "existing_same returned-plan mismatch",
      { outcome: "existing_same", plan: returnedPlanMismatch },
      "projection_conflict",
    ],
  ]) {
    const harness = createCompositionHarness({
      initialPlan: planned.plan,
      initialCanonicalReceiptMaterial: receipt(),
      forcedSealOutcome,
      executionEvidence: ({ authoritativePlan }) =>
        executionEvidenceForTargets(authoritativePlan, ["clusters", "improvements"]),
      beforeValue: ({ authoritativePlan }) => projectionObservedForPlan(
        authoritativePlan,
        { cluster: "A", improvement: "A" },
      ),
    });
    const artifact = await harness.composition.handle(committedTrigger());
    assert.equal(artifact.decision, "reject", label);
    assert.equal(artifact.safe_error, expectedError, label);
    assert.equal(harness.calls.outboxSeal, 1, label);
    assert.equal(harness.calls.executionEvidence, 0, label);
    assert.equal(harness.calls.base, 0, label);
    assert.equal(harness.calls.capability, 0, label);
    assert.equal(harness.calls.clock, 0, label);
    assert.equal(harness.calls.permissionRevalidation, 0, label);
    assertG5PublicArtifactRedacted(artifact);
  }

  assert.doesNotThrow(() => validateW6ReopenAuthoritativePlanBindingForTest(
    source,
    projectionBefore(),
    planned.plan,
  ));
  const corruptPlan = cloneJson(planned.plan);
  corruptPlan.source_receipt_sha256 = SHA_A;
  const foundHarness = createCompositionHarness({ initialPlan: corruptPlan });
  const foundResult = await foundHarness.composition.handle(committedTrigger());
  assertPublicArtifact(foundResult);
  assert.equal(foundResult.decision, "reject");
  assert.equal(foundResult.safe_error, "projection_conflict");
  assert.equal(foundHarness.calls.source, 1);
  assert.equal(foundHarness.calls.outboxLoad, 1);
  assert.equal(foundHarness.calls.base, 0);
  assert.equal(foundHarness.calls.capability, 0);
  assert.equal(foundHarness.calls.clock, 0);
  assert.equal(foundHarness.calls.outboxSeal, 0);

  const tamperedPlans = [];
  {
    const tampered = cloneJson(planned.plan);
    const snapshot = tampered.write_targets[0].patch.recurrence_records.at(-1);
    snapshot.previous_projection.day_7_result = "SYN-TAMPERED-PREVIOUS-DAY-7";
    snapshot.previous_projection_sha256 = createWorkflowEventFingerprint({
      contract: W6_REOPEN_PREVIOUS_PROJECTION_HASH_CONTRACT,
      ...snapshot.previous_projection,
    });
    tampered.write_targets[0].expected_after_sha256 = createWorkflowEventFingerprint({
      contract: W6_REOPEN_CLUSTER_AFTER_HASH_CONTRACT,
      data_scope: "synthetic_experiment",
      cluster_id: CLUSTER_ID,
      ...tampered.write_targets[0].patch,
    });
    tamperedPlans.push(resealProjectionPlan(tampered));
  }
  {
    const tampered = cloneJson(planned.plan);
    const snapshot = tampered.write_targets[0].patch.recurrence_records.at(-1);
    snapshot.source_receipt_sha256 = SHA_A;
    snapshot.projection_idempotency_key = SHA_A;
    tampered.write_targets[0].expected_after_sha256 = createWorkflowEventFingerprint({
      contract: W6_REOPEN_CLUSTER_AFTER_HASH_CONTRACT,
      data_scope: "synthetic_experiment",
      cluster_id: CLUSTER_ID,
      ...tampered.write_targets[0].patch,
    });
    tamperedPlans.push(resealProjectionPlan(tampered));
  }
  {
    const tampered = cloneJson(planned.plan);
    tampered.write_targets[1].expected_after_sha256 = SHA_A;
    tamperedPlans.push(resealProjectionPlan(tampered));
  }
  for (const tamperedPlan of tamperedPlans) {
    expectFailure(
      () => validateW6ReopenAuthoritativePlanBindingForTest(
        source,
        projectionBefore(),
        tamperedPlan,
      ),
      "projection_conflict",
    );
    const harness = createCompositionHarness({ initialPlan: tamperedPlan });
    const artifact = await harness.composition.handle(committedTrigger());
    assertPublicArtifact(artifact);
    assert.equal(artifact.decision, "reject");
    assert.equal(artifact.safe_error, "projection_conflict");
    assert.equal(harness.calls.executionEvidence, 1);
    assert.equal(harness.calls.base, 0);
    assert.deepEqual(harness.hashPreimages.map((value) => value.contract), [
      W6_REOPEN_RECEIPT_HASH_CONTRACT,
      W6_REOPEN_PLAN_HASH_CONTRACT,
    ]);
  }

  const sourceBoundTamper = cloneJson(planned.plan);
  sourceBoundTamper.write_targets[1].patch.updated_at = "2026-08-03T10:00:00.001Z";
  sourceBoundTamper.write_targets[1].expected_after_sha256 = createWorkflowEventFingerprint({
    contract: W6_REOPEN_IMPROVEMENT_AFTER_HASH_CONTRACT,
    data_scope: "synthetic_experiment",
    improvement_id: IMPROVEMENT_ID,
    ...sourceBoundTamper.write_targets[1].patch,
  });
  const resealedSourceBoundTamper = resealProjectionPlan(sourceBoundTamper);
  expectFailure(
    () => validateW6ReopenAuthoritativePlanBindingForTest(
      source,
      projectionBefore(),
      resealedSourceBoundTamper,
    ),
    "projection_conflict",
  );
  const sourceBoundHarness = createCompositionHarness({
    initialPlan: resealedSourceBoundTamper,
  });
  const sourceBoundRejected = await sourceBoundHarness.composition.handle(committedTrigger());
  assertPublicArtifact(sourceBoundRejected);
  assert.equal(sourceBoundRejected.decision, "reject");
  assert.equal(sourceBoundRejected.safe_error, "projection_conflict");
  assert.equal(sourceBoundHarness.calls.executionEvidence, 0);
  assert.equal(sourceBoundHarness.calls.base, 0);
});
test("R10 G1.8 planner proves before plus triggering members equals the sealed after membership", () => {
  const { planner, preimages } = createCountingPlanner();
  const result = planner(
    projectionSource(),
    projectionBefore(),
    capability(),
    CAPABILITY_CHECKED_AT,
  );
  assert.equal(result.decision, "apply_once");
  assert.equal(preimages.length, 7);
  assert.deepEqual(result.plan.write_targets[0].patch.member_case_ids, CASE_IDS);

  const reorderedAfter = [CASE_IDS[1], CASE_IDS[0], CASE_IDS[2]];
  const reorderedResult = planW6ReopenProjection(
    projectionSource({ cluster_after: { member_case_ids: reorderedAfter } }),
    projectionBefore(),
    capability(),
    CAPABILITY_CHECKED_AT,
  );
  assert.equal(reorderedResult.decision, "apply_once");
  assert.deepEqual(reorderedResult.plan.write_targets[0].patch.member_case_ids, reorderedAfter);

  const twoTriggerSource = projectionSource({
    triggering_case_ids: [CASE_IDS[1], CASE_IDS[2]],
  });
  const oneMemberBefore = projectionBefore({
    cluster: { member_case_ids: [CASE_IDS[0]] },
  });
  assert.equal(planW6ReopenProjection(
    twoTriggerSource,
    oneMemberBefore,
    capability(),
    CAPABILITY_CHECKED_AT,
  ).decision, "apply_once");
  const oneMillisecondBeforeCommit = "2026-08-03T09:59:59.999Z";
  assert.equal(planW6ReopenProjection(
    projectionSource(),
    projectionBefore({
      cluster: { updated_at: oneMillisecondBeforeCommit },
      improvement: { updated_at: oneMillisecondBeforeCommit },
    }),
    capability(),
    CAPABILITY_CHECKED_AT,
  ).decision, "apply_once");
  for (const before of [
    projectionBefore({ cluster: { updated_at: COMMITTED_AT } }),
    projectionBefore({ improvement: { updated_at: COMMITTED_AT } }),
    projectionBefore({ cluster: { updated_at: "2026-08-03T10:00:00.001Z" } }),
    projectionBefore({ improvement: { updated_at: "2026-08-03T10:00:00.001Z" } }),
  ]) {
    expectPlannerRejectBeforeHash({ before }, "commit_proof_mismatch");
  }
  expectPlannerRejectBeforeHash({
    source: projectionSource({ triggering_case_ids: [CASE_IDS[2], CASE_IDS[1]] }),
    before: oneMemberBefore,
  }, "commit_proof_mismatch");

  for (const input of [
    {
      source: projectionSource({
        cluster_after: { member_case_ids: [CASE_IDS[0], CASE_IDS[2]] },
      }),
    },
    {
      source: projectionSource({
        cluster_after: { member_case_ids: CASE_IDS.slice(0, 2) },
      }),
    },
    {
      source: projectionSource({
        cluster_after: { member_case_ids: [...CASE_IDS, "SYN-CASE-R10-OTHER"] },
      }),
    },
    {
      source: projectionSource({ triggering_case_ids: ["SYN-CASE-R10-OTHER"] }),
    },
    {
      before: projectionBefore({
        cluster: { member_case_ids: [CASE_IDS[0], CASE_IDS[2]] },
      }),
    },
    {
      before: projectionBefore({ cluster: { member_case_ids: [...CASE_IDS] } }),
    },
    {
      before: projectionBefore({ cluster: { cluster_id: "SYN-CLUSTER-R10-OTHER" } }),
    },
    {
      before: projectionBefore({
        improvement: { improvement_id: "SYN-IMPROVEMENT-R10-OTHER" },
      }),
    },
  ]) {
    expectPlannerRejectBeforeHash(input, "commit_proof_mismatch");
  }

  expectPlannerRejectBeforeHash({
    before: projectionBefore({ cluster: { member_case_ids: [CASE_IDS[0], CASE_IDS[0]] } }),
  }, "invalid_projection_input");
  expectPlannerRejectBeforeHash({
    source: projectionSource({ triggering_case_ids: [] }),
  }, "invalid_projection_input");
  expectPlannerRejectBeforeHash({
    source: projectionSource({ triggering_case_ids: [CASE_IDS[2], CASE_IDS[2]] }),
  }, "invalid_projection_input");

  const missingBeforeContract = projectionBefore();
  delete missingBeforeContract.projection_contract;
  for (const before of [
    { ...projectionBefore(), injected: true },
    missingBeforeContract,
    projectionBefore({ data_scope: "enterprise_data" }),
    projectionBefore({ cluster: { injected: true } }),
    projectionBefore({ cluster: { status: "观察中" } }),
    projectionBefore({ improvement: { status: "观察中" } }),
  ]) {
    expectPlannerRejectBeforeHash({ before }, "invalid_projection_input");
  }

  let getterCalls = 0;
  const hostileBefore = projectionBefore();
  Object.defineProperty(hostileBefore.cluster, "secret", {
    enumerable: true,
    get() {
      getterCalls += 1;
      return "must-not-run";
    },
  });
  expectPlannerRejectBeforeHash({ before: hostileBefore }, "invalid_projection_input");
  assert.equal(getterCalls, 0);
  let proxyTrapCalls = 0;
  const hostileBeforeProxy = new Proxy(projectionBefore(), {
    ownKeys(target) {
      proxyTrapCalls += 1;
      return Reflect.ownKeys(target);
    },
  });
  expectPlannerRejectBeforeHash({ before: hostileBeforeProxy }, "invalid_projection_input");
  assert.equal(proxyTrapCalls, 0);
});

test("R10 G1.9 planner emits one stable snapshot-and-clear plan with exactly nine writable fields", () => {
  assert.equal(W6_REOPEN_BEFORE_CONTRACT, "w6_reopen_projection_before.v1");
  assert.equal(W6_REOPEN_CAPABILITY_CONTRACT, "w6_reopen_projection_capability.v1");
  const source = projectionSource();
  const before = projectionBefore();
  const attestation = capability();
  const { planner, preimages } = createCountingPlanner();
  const result = planner(source, before, attestation, CAPABILITY_CHECKED_AT);
  assert.equal(result instanceof Promise, false);
  assert.deepEqual(Reflect.ownKeys(result).sort(), ["artifact", "decision", "execution", "plan"]);
  assert.equal(result.decision, "apply_once");

  const plan = result.plan;
  assert.deepEqual(Reflect.ownKeys(plan).sort(), [
    "capability_attestation_id",
    "capability_attestation_sha256",
    "data_scope",
    "evidence_class",
    "execution_mode",
    "permission_revision",
    "permission_snapshot_sha256",
    "plan_contract",
    "projection_idempotency_key",
    "projector_key",
    "sealed_plan_sha256",
    "source_receipt_id",
    "source_receipt_sha256",
    "write_targets",
  ]);
  assert.equal(plan.plan_contract, "w6_reopen_projection_plan.v1");
  assert.equal(plan.projector_key, W6_REOPEN_PROJECTOR_KEY);
  assert.equal(plan.data_scope, "synthetic_experiment");
  assert.equal(plan.evidence_class, "synthetic_experiment");
  assert.equal(plan.source_receipt_id, RECEIPT_ID);
  assert.equal(plan.source_receipt_sha256, source.source_receipt_sha256);
  assert.equal(plan.projection_idempotency_key, source.source_receipt_sha256);
  assert.equal(plan.capability_attestation_id, attestation.attestation_id);
  assert.equal(plan.execution_mode, attestation.execution_mode);
  assert.equal(plan.permission_snapshot_sha256, attestation.permission_snapshot_sha256);
  assert.equal(plan.permission_revision, attestation.permission_revision);
  assert.equal(plan.write_targets.length, 2);

  const [clusterTarget, improvementTarget] = plan.write_targets;
  assert.deepEqual(Reflect.ownKeys(clusterTarget).sort(), [
    "expected_after_sha256",
    "expected_before_sha256",
    "patch",
    "selector",
    "target",
  ]);
  assert.deepEqual(clusterTarget.selector, { field: "cluster_id", value: CLUSTER_ID });
  assert.deepEqual(Reflect.ownKeys(clusterTarget.patch).sort(), [
    "member_case_ids",
    "recurrence_records",
    "status",
    "updated_at",
  ]);
  assert.deepEqual(clusterTarget.patch.member_case_ids, CASE_IDS);
  assert.equal(clusterTarget.patch.status, "观察中");
  assert.equal(clusterTarget.patch.updated_at, COMMITTED_AT);
  assert.deepEqual(improvementTarget.selector, {
    field: "improvement_id",
    value: IMPROVEMENT_ID,
  });
  assert.deepEqual(Reflect.ownKeys(improvementTarget.patch).sort(), [
    "day_30_result",
    "day_7_result",
    "human_conclusion",
    "status",
    "updated_at",
  ]);
  assert.deepEqual(improvementTarget.patch, {
    status: "观察中",
    day_7_result: null,
    day_30_result: null,
    human_conclusion: null,
    updated_at: COMMITTED_AT,
  });
  const writableFields = [
    ...Object.keys(clusterTarget.patch).map((field) => `clusters.${field}`),
    ...Object.keys(improvementTarget.patch).map((field) => `improvements.${field}`),
  ].sort();
  assert.deepEqual(writableFields, [
    "clusters.member_case_ids",
    "clusters.recurrence_records",
    "clusters.status",
    "clusters.updated_at",
    "improvements.day_30_result",
    "improvements.day_7_result",
    "improvements.human_conclusion",
    "improvements.status",
    "improvements.updated_at",
  ]);

  const appended = clusterTarget.patch.recurrence_records.at(-1);
  const previousProjection = {
    day_7_result: before.improvement.day_7_result,
    day_30_result: before.improvement.day_30_result,
    human_conclusion: before.improvement.human_conclusion,
  };
  assert.deepEqual(Reflect.ownKeys(appended).sort(), [
    "committed_at",
    "data_scope",
    "evidence_class",
    "previous_projection",
    "previous_projection_sha256",
    "projection_contract",
    "projection_idempotency_key",
    "source_receipt_sha256",
  ]);
  assert.deepEqual(appended.previous_projection, previousProjection);
  assert.equal(appended.source_receipt_sha256, source.source_receipt_sha256);
  assert.equal(appended.projection_idempotency_key, source.source_receipt_sha256);
  assert.equal(appended.committed_at, source.committed_at);

  const expectedPreimages = [
    {
      contract: W6_REOPEN_PREVIOUS_PROJECTION_HASH_CONTRACT,
      ...previousProjection,
    },
    {
      contract: W6_REOPEN_CLUSTER_BEFORE_HASH_CONTRACT,
      data_scope: "synthetic_experiment",
      cluster_id: CLUSTER_ID,
      member_case_ids: before.cluster.member_case_ids,
      status: "已归档",
      recurrence_records: before.cluster.recurrence_records,
      updated_at: BEFORE_UPDATED_AT,
    },
    {
      contract: W6_REOPEN_CLUSTER_AFTER_HASH_CONTRACT,
      data_scope: "synthetic_experiment",
      cluster_id: CLUSTER_ID,
      member_case_ids: CASE_IDS,
      status: "观察中",
      recurrence_records: clusterTarget.patch.recurrence_records,
      updated_at: COMMITTED_AT,
    },
    {
      contract: W6_REOPEN_IMPROVEMENT_BEFORE_HASH_CONTRACT,
      data_scope: "synthetic_experiment",
      improvement_id: IMPROVEMENT_ID,
      status: "已完成",
      ...previousProjection,
      updated_at: BEFORE_UPDATED_AT,
    },
    {
      contract: W6_REOPEN_IMPROVEMENT_AFTER_HASH_CONTRACT,
      data_scope: "synthetic_experiment",
      improvement_id: IMPROVEMENT_ID,
      status: "观察中",
      day_7_result: null,
      day_30_result: null,
      human_conclusion: null,
      updated_at: COMMITTED_AT,
    },
    {
      contract: W6_REOPEN_CAPABILITY_ATTESTATION_HASH_CONTRACT,
      ...attestation,
    },
  ];
  assert.equal(preimages.length, 7);
  for (let index = 0; index < expectedPreimages.length; index += 1) {
    assert.equal(JSON.stringify(preimages[index]), JSON.stringify(expectedPreimages[index]));
  }
  assert.equal(
    appended.previous_projection_sha256,
    createWorkflowEventFingerprint(expectedPreimages[0]),
  );
  assert.equal(clusterTarget.expected_before_sha256, createWorkflowEventFingerprint(expectedPreimages[1]));
  assert.equal(clusterTarget.expected_after_sha256, createWorkflowEventFingerprint(expectedPreimages[2]));
  assert.equal(improvementTarget.expected_before_sha256, createWorkflowEventFingerprint(expectedPreimages[3]));
  assert.equal(improvementTarget.expected_after_sha256, createWorkflowEventFingerprint(expectedPreimages[4]));
  assert.equal(plan.capability_attestation_sha256, createWorkflowEventFingerprint(expectedPreimages[5]));
  const sealedPreimage = { ...plan };
  delete sealedPreimage.sealed_plan_sha256;
  const expectedSealedPreimage = {
    contract: W6_REOPEN_PLAN_HASH_CONTRACT,
    ...sealedPreimage,
  };
  assert.equal(JSON.stringify(preimages[6]), JSON.stringify(expectedSealedPreimage));
  assert.equal(plan.sealed_plan_sha256, createWorkflowEventFingerprint(expectedSealedPreimage));
  assert.equal(JSON.stringify(preimages).includes(CAPABILITY_CHECKED_AT), false);

  assert.deepEqual(result.execution, {
    mode: "both",
    sealed_plan_sha256: plan.sealed_plan_sha256,
    capability_attestation_sha256: plan.capability_attestation_sha256,
    permission_revision: plan.permission_revision,
    pending_targets: ["clusters", "improvements"],
  });
  const issuedBoundary = planW6ReopenProjection(
    source,
    before,
    attestation,
    CAPABILITY_ISSUED_AT,
  );
  const lastValidTick = planW6ReopenProjection(
    source,
    before,
    attestation,
    "2026-08-03T10:29:59.999Z",
  );
  assert.deepEqual(issuedBoundary, result);
  assert.deepEqual(lastValidTick, result);
  assertDeepFrozen(result);
});

test("R10 G1.10 planner preserves recurrence values and order and enforces the 499/500 boundary", () => {
  const opaqueOne = activeIntakeRecord(CASE_IDS[0], { marker: "SYN-OPAQUE-FIRST" });
  const previousR10 = existingReopenSnapshot();
  const opaqueTwo = { projection_contract: "legacy_recurrence.v1", nested: [3, 1, 2] };
  const before = projectionBefore({
    cluster: { recurrence_records: [opaqueOne, previousR10, opaqueTwo] },
  });
  const result = planW6ReopenProjection(
    projectionSource(),
    before,
    capability(),
    CAPABILITY_CHECKED_AT,
  );
  assert.equal(result.decision, "apply_once");
  const records = result.plan.write_targets[0].patch.recurrence_records;
  assert.equal(records.length, 4);
  assert.equal(JSON.stringify(records.slice(0, 3)), JSON.stringify(before.cluster.recurrence_records));
  assert.equal(records[3].projection_contract, "reopen_snapshot.v1");

  const records499 = Array.from({ length: 499 }, (_, sequence) => ({ sequence }));
  const boundary = planW6ReopenProjection(
    projectionSource(),
    projectionBefore({ cluster: { recurrence_records: records499 } }),
    capability(),
    CAPABILITY_CHECKED_AT,
  );
  assert.equal(boundary.decision, "apply_once");
  assert.equal(boundary.plan.write_targets[0].patch.recurrence_records.length, 500);
  expectPlannerRejectBeforeHash({
    before: projectionBefore({
      cluster: { recurrence_records: [...records499, { sequence: 499 }] },
    }),
  }, "invalid_projection_input");

  const malformedPrevious = existingReopenSnapshot();
  delete malformedPrevious.previous_projection_sha256;
  for (const invalidRecord of [
    malformedPrevious,
    existingReopenSnapshot({ injected: true }),
    existingReopenSnapshot({ source_receipt_sha256: "not-a-sha" }),
    existingReopenSnapshot({ projection_idempotency_key: SHA_B }),
    existingReopenSnapshot({ committed_at: "not-a-time" }),
    { projection_contract: "reopen_snapshot.v1" },
  ]) {
    expectPlannerRejectBeforeHash({
      before: projectionBefore({ cluster: { recurrence_records: [invalidRecord] } }),
    }, "invalid_projection_input");
  }
  const { planner: digestCheckingPlanner, preimages: digestCheckPreimages } =
    createCountingPlanner();
  const wrongButWellFormedDigest = digestCheckingPlanner(
    projectionSource(),
    projectionBefore({
      cluster: { recurrence_records: [existingReopenSnapshot({
        previous_projection_sha256: SHA_B,
      })] },
    }),
    capability(),
    CAPABILITY_CHECKED_AT,
  );
  assert.equal(wrongButWellFormedDigest.decision, "reject");
  assert.equal(wrongButWellFormedDigest.artifact.safe_error, "projection_conflict");
  assert.equal(digestCheckPreimages.length, 1);
  assert.equal(
    digestCheckPreimages[0].contract,
    W6_REOPEN_PREVIOUS_PROJECTION_HASH_CONTRACT,
  );
  expectPlannerRejectBeforeHash({
    before: projectionBefore({
      cluster: { recurrence_records: [existingReopenSnapshot({
        source_receipt_sha256: projectionSource().source_receipt_sha256,
        projection_idempotency_key: projectionSource().source_receipt_sha256,
      })] },
    }),
  }, "projection_conflict");

  for (const field of ["day_7_result", "day_30_result", "human_conclusion"]) {
    expectPlannerRejectBeforeHash({
      before: projectionBefore({ improvement: { [field]: "" } }),
    }, "invalid_projection_input");
    expectPlannerRejectBeforeHash({
      before: projectionBefore({ improvement: { [field]: "a".repeat(4_097) } }),
    }, "invalid_projection_input");
  }
  const exactTextBoundary = planW6ReopenProjection(
    projectionSource(),
    projectionBefore({
      improvement: {
        day_7_result: "a",
        day_30_result: "b".repeat(4_096),
        human_conclusion: "c",
      },
    }),
    capability(),
    CAPABILITY_CHECKED_AT,
  );
  assert.equal(exactTextBoundary.decision, "apply_once");
  expectPlannerRejectBeforeHash({
    before: projectionBefore({
      cluster: { recurrence_records: [{ value: Number.MAX_SAFE_INTEGER + 1 }] },
    }),
  }, "invalid_projection_input");
});

test("R10 G1.11 planner uses exact business-key selectors and redacts locator material", () => {
  const result = planW6ReopenProjection(
    projectionSource(),
    projectionBefore(),
    capability(),
    CAPABILITY_CHECKED_AT,
  );
  assert.equal(result.decision, "apply_once");
  assert.deepEqual(result.plan.write_targets.map(({ target, selector }) => ({ target, selector })), [
    { target: "clusters", selector: { field: "cluster_id", value: CLUSTER_ID } },
    {
      target: "improvements",
      selector: { field: "improvement_id", value: IMPROVEMENT_ID },
    },
  ]);
  for (const target of result.plan.write_targets) {
    assert.deepEqual(Reflect.ownKeys(target.selector).sort(), ["field", "value"]);
  }
  const artifact = result.artifact;
  assert.deepEqual(Reflect.ownKeys(artifact).sort(), [
    "cluster_expected_after_sha256",
    "cluster_expected_before_sha256",
    "cluster_id",
    "data_scope",
    "decision",
    "evidence_class",
    "improvement_expected_after_sha256",
    "improvement_expected_before_sha256",
    "improvement_id",
    "planned_target_count",
    "projection_idempotency_key",
    "projector_key",
    "redaction_status",
    "repair_required",
    "repair_target",
    "safe_error",
    "sealed_plan_sha256",
    "write_targets",
  ]);
  assert.deepEqual(artifact.write_targets, ["clusters", "improvements"]);
  assert.equal(artifact.projector_key, W6_REOPEN_PROJECTOR_KEY);
  assert.equal(artifact.data_scope, "synthetic_experiment");
  assert.equal(artifact.evidence_class, "synthetic_experiment");
  assert.equal(artifact.decision, "apply_once");
  assert.equal(artifact.redaction_status, "passed");
  assert.equal(artifact.planned_target_count, 2);
  assert.equal(artifact.repair_required, false);
  assert.equal(artifact.repair_target, null);
  assert.equal(artifact.safe_error, null);
  assert.equal(artifact.projection_idempotency_key, result.plan.projection_idempotency_key);
  assert.equal(artifact.cluster_id, result.plan.write_targets[0].selector.value);
  assert.equal(artifact.improvement_id, result.plan.write_targets[1].selector.value);
  assert.equal(
    artifact.cluster_expected_before_sha256,
    result.plan.write_targets[0].expected_before_sha256,
  );
  assert.equal(
    artifact.cluster_expected_after_sha256,
    result.plan.write_targets[0].expected_after_sha256,
  );
  assert.equal(
    artifact.improvement_expected_before_sha256,
    result.plan.write_targets[1].expected_before_sha256,
  );
  assert.equal(
    artifact.improvement_expected_after_sha256,
    result.plan.write_targets[1].expected_after_sha256,
  );
  assert.equal(artifact.sealed_plan_sha256, result.plan.sealed_plan_sha256);
  assertNoRecursiveKeyOrValue(
    artifact,
    new Set([
      "selector",
      "patch",
      "record_id",
      "opaque_locator",
      "base_schema_revision",
      "resolved_record_locator_sha256",
      "source_receipt_id",
      "receipt_id",
      "history_id",
      "cycle_id",
      "previous_projection",
      "opened_by",
      "principal",
      "grant",
      "claims",
      "policy",
      "w5_closure_provenance",
      "semantic_fingerprint",
    ]),
    new Set([
      RECEIPT_ID,
      HISTORY_ID,
      CYCLE_ID,
      "SYN-OPAQUE-RECURRENCE-R10",
      "SYN-SENSITIVE-DAY-7-R10",
      "SYN-SENSITIVE-DAY-30-R10",
      "SYN-SENSITIVE-HUMAN-CONCLUSION-R10",
    ]),
  );
  assert.equal(JSON.stringify(artifact).includes("locator"), false);
});
test("R10 G1.12 exact and near triggers are zero-port paths while committed redelivery revalidates source", async () => {
  const zeroPortHarness = createCompositionHarness();
  const exact = await zeroPortHarness.composition.handle(exactReplayTrigger());
  assertPublicArtifact(exact);
  assert.equal(exact.decision, "no_op");
  assert.equal(exact.safe_error, null);
  assert.equal(exact.projection_idempotency_key, null);
  assert.deepEqual(exact.write_targets, []);
  assert.equal(exact.planned_target_count, 0);
  const near = await zeroPortHarness.composition.handle(nearConflictTrigger());
  assertPublicArtifact(near);
  assert.equal(near.decision, "reject");
  assert.equal(near.safe_error, "event_conflict");
  assertNoPortOrHasherCalls(zeroPortHarness.calls);

  const harness = createCompositionHarness();
  const initial = await harness.composition.handle(committedTrigger());
  assertPublicArtifact(initial);
  assert.equal(initial.decision, "apply_once");
  assert.equal(harness.calls.hasher, 8);
  assert.deepEqual(harness.order, [
    "source",
    "hasher:1",
    "outboxLoad",
    "base",
    "capability",
    "clock",
    "hasher:2",
    "hasher:3",
    "hasher:4",
    "hasher:5",
    "hasher:6",
    "hasher:7",
    "hasher:8",
    "outboxSeal",
  ]);
  const beforeRedelivery = { ...harness.calls };
  const redelivery = await harness.composition.handle(committedTrigger());
  assertPublicArtifact(redelivery);
  assert.equal(redelivery.decision, "reject");
  assert.equal(redelivery.safe_error, "projection_conflict");
  assert.equal(harness.calls.source, beforeRedelivery.source + 1);
  assert.equal(harness.calls.outboxLoad, beforeRedelivery.outboxLoad + 1);
  assert.equal(harness.calls.executionEvidence, beforeRedelivery.executionEvidence + 1);
  assert.equal(harness.calls.base, beforeRedelivery.base);
  assert.equal(harness.calls.capability, beforeRedelivery.capability);
  assert.equal(harness.calls.clock, beforeRedelivery.clock);
  assert.equal(harness.calls.outboxSeal, beforeRedelivery.outboxSeal + 1);

  const authoritativePlan = harness.getAuthoritativePlan();
  const evidenceMutationCases = [
    {
      name: "ack count zero with one ack",
      acknowledgedTargetCount: 1,
      mutate(evidence) {
        evidence.acknowledged_target_count = 0;
      },
    },
    {
      name: "ack count one with no acks",
      acknowledgedTargetCount: 0,
      mutate(evidence) {
        evidence.acknowledged_target_count = 1;
      },
    },
    ...[-1, 3, 1.5, Number.MAX_SAFE_INTEGER + 1].map((count) => ({
      name: `invalid acknowledged target count ${count}`,
      acknowledgedTargetCount: 0,
      mutate(evidence) {
        evidence.acknowledged_target_count = count;
      },
    })),
    {
      name: "reversed target acknowledgements",
      acknowledgedTargetCount: 2,
      mutate(evidence) {
        evidence.target_acks.reverse();
      },
    },
    {
      name: "duplicate target acknowledgement",
      acknowledgedTargetCount: 2,
      mutate(evidence) {
        evidence.target_acks[1] = cloneJson(evidence.target_acks[0]);
      },
    },
    {
      name: "ack capability recheck time is not a timestamp",
      acknowledgedTargetCount: 1,
      mutationSentinels: ["SYN-INVALID-ACK-TIMESTAMP"],
      mutate(evidence) {
        evidence.target_acks[0].capability_rechecked_at = "SYN-INVALID-ACK-TIMESTAMP";
      },
    },
    {
      name: "ack resolved locator digest missing",
      acknowledgedTargetCount: 1,
      mutate(evidence) {
        delete evidence.target_acks[0].resolved_record_locator_sha256;
      },
    },
    {
      name: "resolved locator digest is extra at the evidence root",
      acknowledgedTargetCount: 1,
      mutationSentinels: ["7".repeat(64)],
      mutate(evidence) {
        evidence.resolved_record_locator_sha256 = "7".repeat(64);
      },
    },
    {
      name: "ack resolved locator digest has the wrong type",
      acknowledgedTargetCount: 1,
      mutate(evidence) {
        evidence.target_acks[0].resolved_record_locator_sha256 = 7;
      },
    },
    {
      name: "ack resolved locator digest has an invalid SHA format",
      acknowledgedTargetCount: 1,
      mutationSentinels: ["SYN-MUTATED-INVALID-LOCATOR-DIGEST"],
      mutate(evidence) {
        evidence.target_acks[0].resolved_record_locator_sha256 =
          "SYN-MUTATED-INVALID-LOCATOR-DIGEST";
      },
    },
    {
      name: "execution evidence root extra key",
      acknowledgedTargetCount: 0,
      mutationSentinels: ["SYN-MUTATED-EVIDENCE-ROOT-EXTRA"],
      mutate(evidence) {
        evidence.untrusted_extra = "SYN-MUTATED-EVIDENCE-ROOT-EXTRA";
      },
    },
    {
      name: "target acknowledgement extra key",
      acknowledgedTargetCount: 1,
      mutationSentinels: ["SYN-MUTATED-EVIDENCE-ACK-EXTRA"],
      mutate(evidence) {
        evidence.target_acks[0].untrusted_extra = "SYN-MUTATED-EVIDENCE-ACK-EXTRA";
      },
    },
    {
      name: "root capability recheck time is not a timestamp",
      acknowledgedTargetCount: 0,
      mutationSentinels: ["SYN-INVALID-ROOT-TIMESTAMP"],
      mutate(evidence) {
        evidence.capability_rechecked_at = "SYN-INVALID-ROOT-TIMESTAMP";
      },
    },
    {
      name: "exact plan material flag is not true",
      acknowledgedTargetCount: 0,
      mutate(evidence) {
        evidence.exact_plan_material_match = false;
      },
    },
  ];
  const privateEvidenceValues = [
    authoritativePlan.source_receipt_id,
    authoritativePlan.source_receipt_sha256,
    authoritativePlan.sealed_plan_sha256,
    authoritativePlan.capability_attestation_id,
    authoritativePlan.capability_attestation_sha256,
    authoritativePlan.permission_snapshot_sha256,
    authoritativePlan.permission_revision,
    CAPABILITY_CHECKED_AT,
    SHA_C,
  ];
  for (const mutationCase of evidenceMutationCases) {
    const mismatchedEvidence = executionEvidenceForPlan(
      authoritativePlan,
      mutationCase.acknowledgedTargetCount,
    );
    mutationCase.mutate(mismatchedEvidence);
    assert.equal(
      mismatchedEvidence.evidence_contract,
      "w6_reopen_projection_execution_evidence.v1",
      `${mutationCase.name} remains acceptable to a weak contract-tag-only validator`,
    );
    const mismatchHarness = createCompositionHarness({
      initialPlan: authoritativePlan,
      executionEvidence: mismatchedEvidence,
    });
    const mismatchResult = await mismatchHarness.composition.handle(committedTrigger());
    assertPublicArtifact(mismatchResult);
    assert.equal(mismatchResult.decision, "reject", mutationCase.name);
    assert.equal(
      mismatchResult.safe_error,
      "projection_dependency_failure",
      mutationCase.name,
    );
    assert.equal(mismatchHarness.calls.executionEvidence, 1, mutationCase.name);
    assert.equal(mismatchHarness.calls.outboxLoad, 1, mutationCase.name);
    assert.equal(mismatchHarness.calls.base, 0, mutationCase.name);
    assert.equal(mismatchHarness.calls.capability, 0, mutationCase.name);
    assert.equal(mismatchHarness.calls.clock, 0, mutationCase.name);
    assert.equal(mismatchHarness.calls.outboxSeal, 1, mutationCase.name);
    const publicJson = JSON.stringify(mismatchResult);
    for (const privateValue of [
      ...privateEvidenceValues,
      ...(mutationCase.mutationSentinels ?? []),
    ]) {
      assert.equal(publicJson.includes(privateValue), false, mutationCase.name);
    }
    assert.equal(publicJson.includes("locator"), false, mutationCase.name);
  }

  const nonCommittedProof = proof({ outcome: "idempotent" });
  nonCommittedProof.history_entries[0].reason = "SYN-FORGED-SOURCE-MUST-NOT-LEAK";
  const sourceFirstHarness = createCompositionHarness({
    sourceValue: nonCommittedProof,
    initialPlan: authoritativePlan,
    executionEvidence: executionEvidenceForPlan(authoritativePlan, 1),
  });
  const sourceFirstRejected = await sourceFirstHarness.composition.handle(committedTrigger());
  assertPublicArtifact(sourceFirstRejected);
  assert.equal(sourceFirstRejected.decision, "reject");
  assert.equal(sourceFirstRejected.safe_error, "unverified_commit");
  assert.equal(sourceFirstHarness.calls.source, 1);
  assert.equal(sourceFirstHarness.calls.hasher, 0);
  assert.equal(sourceFirstHarness.calls.outboxLoad, 0);
  assert.equal(sourceFirstHarness.calls.executionEvidence, 0);
  assert.equal(sourceFirstHarness.calls.base, 0);
  assert.equal(sourceFirstHarness.calls.capability, 0);
  assert.equal(sourceFirstHarness.calls.clock, 0);
  assert.equal(sourceFirstHarness.calls.outboxSeal, 0);
  const sourceFirstPublicJson = JSON.stringify(sourceFirstRejected);
  for (const privateValue of [
    "SYN-FORGED-SOURCE-MUST-NOT-LEAK",
    authoritativePlan.source_receipt_id,
    authoritativePlan.capability_attestation_id,
    authoritativePlan.permission_revision,
  ]) {
    assert.equal(sourceFirstPublicJson.includes(privateValue), false);
  }

  const mismatchedReceiptProof = proof();
  mismatchedReceiptProof.receipt.receipt_id = "SYN-RECEIPT-R10-OTHER";
  for (const [sourceValue, expectedError] of [
    [proof({ outcome: "idempotent" }), "unverified_commit"],
    [mismatchedReceiptProof, "commit_proof_mismatch"],
    [{ outcome: "committed", secret: "SYN-SOURCE-SECRET-MUST-NOT-LEAK" }, "projection_dependency_failure"],
  ]) {
    const sourceHarness = createCompositionHarness({
      sourceValue,
      initialPlan: harness.getAuthoritativePlan(),
    });
    const rejected = await sourceHarness.composition.handle(committedTrigger());
    assertPublicArtifact(rejected);
    assert.equal(rejected.decision, "reject");
    assert.equal(rejected.safe_error, expectedError);
    assert.equal(sourceHarness.calls.source, 1);
    assert.equal(sourceHarness.calls.hasher, 0);
    assert.equal(sourceHarness.calls.outboxLoad, 0);
    assert.equal(sourceHarness.calls.executionEvidence, 0);
    assert.equal(sourceHarness.calls.base, 0);
    assert.equal(sourceHarness.calls.capability, 0);
    assert.equal(sourceHarness.calls.clock, 0);
    assert.equal(sourceHarness.calls.outboxSeal, 0);
    assert.equal(JSON.stringify(rejected).includes("SYN-SOURCE-SECRET-MUST-NOT-LEAK"), false);
  }
});

test("R10 G1.13 business commit success and projection failure remain isolated", async () => {
  const committedProof = proof();
  const committedSnapshot = JSON.stringify(committedProof);
  const harness = createCompositionHarness({
    sourceValue: committedProof,
    failureAt: "outboxSeal",
  });
  const result = await harness.composition.handle(committedTrigger());
  assertPublicArtifact(result);
  assert.equal(result.decision, "reject");
  assert.equal(result.safe_error, "projection_dependency_failure");
  assert.equal(JSON.stringify(committedProof), committedSnapshot);
  assert.equal(verifyW6ReopenCommitProof(committedProof, RECEIPT_ID).projection_source.source_receipt_id, RECEIPT_ID);
  assert.equal(harness.calls.source, 1);
  assert.equal(harness.calls.outboxSeal, 1);

  const callsBeforeExactReplay = { ...harness.calls };
  const exact = await harness.composition.handle(exactReplayTrigger());
  assert.equal(exact.decision, "no_op");
  assert.deepEqual(harness.calls, callsBeforeExactReplay);
});

test("R10 G1.14 concurrent sealing has one owner and no public lease or execution recovery", async () => {
  const harness = createCompositionHarness({
    clockValues: [CAPABILITY_CHECKED_AT, "2026-08-03T10:05:00.001Z"],
    loadBarrierSize: 2,
  });
  const results = await Promise.all([
    harness.composition.handle(committedTrigger()),
    harness.composition.handle(committedTrigger()),
  ]);
  assert.deepEqual(results.map((result) => result.decision).sort(), ["apply_once", "reject"]);
  const owner = results.find((result) => result.decision === "apply_once");
  const loser = results.find((result) => result.decision === "reject");
  assert.equal(loser.safe_error, "projection_conflict");
  assertPublicArtifact(owner);
  assertPublicArtifact(loser);
  assert.deepEqual(harness.sealOutcomes.sort(), ["existing_same", "sealed"]);
  assert.equal(harness.calls.outboxSeal, 2);
  assert.equal(harness.calls.source, 2);
  assert.equal(harness.calls.base, 2);
  assert.equal(harness.calls.capability, 2);
  assert.equal(harness.calls.clock, 2);
  assert.equal(harness.calls.executionEvidence, 1);
  assert.equal(harness.sealInputs.length, 2);
  assert.deepEqual(harness.sealInputs[0].plan, harness.sealInputs[1].plan);
  assert.equal(Object.hasOwn(owner, "execution"), false);
  assert.equal(Object.hasOwn(loser, "execution"), false);
  assert.equal(Object.hasOwn(owner, "lease"), false);
  assert.equal(Object.hasOwn(loser, "lease"), false);
});
test("R10 G1.15 reconcile covers B/B, A/A, A/B, B/A, and every X branch", async () => {
  assert.equal(typeof reconcileW6ReopenProjection, "function", "G5 pure reconcile export is required");
  assert.equal(reconcileW6ReopenProjection.length, 3);

  const planned = planW6ReopenProjection(
    projectionSource(),
    projectionBefore(),
    capability(),
    CAPABILITY_CHECKED_AT,
  );
  assert.equal(planned.decision, "apply_once");
  const plan = cloneJson(planned.plan);
  const reconcile = (observed, evidence, selectedPlan = plan) =>
    reconcileW6ReopenProjection(
      cloneJson(selectedPlan),
      observed,
      evidence,
    );

  assertReconcileReject(
    reconcile(
      projectionObservedForPlan(plan),
      executionEvidenceForTargets(plan),
    ),
    "projection_conflict",
    "B/B without a private worker lease is always closed",
  );

  const alreadyApplied = reconcile(
    projectionObservedForPlan(plan, { cluster: "A", improvement: "A" }),
    executionEvidenceForTargets(plan, ["clusters", "improvements"]),
  );
  assert.equal(alreadyApplied.decision, "already_applied");
  assert.equal(alreadyApplied.plan, null);
  assert.equal(alreadyApplied.execution, null);
  assertPublicArtifact(alreadyApplied.artifact);
  assert.equal(alreadyApplied.artifact.decision, "already_applied");
  assert.deepEqual(alreadyApplied.artifact.write_targets, []);
  assert.equal(alreadyApplied.artifact.planned_target_count, 0);
  assert.equal(alreadyApplied.artifact.repair_required, false);
  assert.equal(alreadyApplied.artifact.repair_target, null);
  assert.equal(alreadyApplied.artifact.safe_error, null);
  assertDeepFrozen(alreadyApplied);

  const repairImprovement = reconcile(
    projectionObservedForPlan(plan, { cluster: "A", improvement: "B" }),
    executionEvidenceForTargets(plan, ["clusters"]),
  );
  assertRepairReusesOriginalPlan(repairImprovement, plan, "improvements");

  const repairCluster = reconcile(
    projectionObservedForPlan(plan, { cluster: "B", improvement: "A" }),
    executionEvidenceForTargets(plan, ["improvements"]),
  );
  assertRepairReusesOriginalPlan(repairCluster, plan, "clusters");

  const atomicPlanned = planW6ReopenProjection(
    projectionSource(),
    projectionBefore(),
    capability({ execution_mode: "atomic_all_targets" }),
    CAPABILITY_CHECKED_AT,
  );
  assert.equal(atomicPlanned.decision, "apply_once");
  const atomicPlan = cloneJson(atomicPlanned.plan);
  assertReconcileReject(
    reconcileW6ReopenProjection(
      cloneJson(atomicPlan),
      projectionObservedForPlan(atomicPlan),
      executionEvidenceForTargets(atomicPlan),
    ),
    "projection_conflict",
    "atomic B/B without a private worker lease is always closed",
  );
  const atomicAlreadyApplied = reconcileW6ReopenProjection(
    cloneJson(atomicPlan),
    projectionObservedForPlan(atomicPlan, { cluster: "A", improvement: "A" }),
    executionEvidenceForTargets(atomicPlan, ["clusters", "improvements"]),
  );
  assert.equal(atomicAlreadyApplied.decision, "already_applied");
  assert.equal(atomicAlreadyApplied.plan, null);
  assert.equal(atomicAlreadyApplied.execution, null);
  assertG5PublicArtifactRedacted(atomicAlreadyApplied.artifact);
  assertDeepFrozen(atomicAlreadyApplied);
  for (const [clusterState, improvementState, targets] of [
    ["A", "B", ["clusters"]],
    ["B", "A", ["improvements"]],
  ]) {
    assertReconcileReject(
      reconcileW6ReopenProjection(
        cloneJson(atomicPlan),
        projectionObservedForPlan(atomicPlan, {
          cluster: clusterState,
          improvement: improvementState,
        }),
        executionEvidenceForTargets(atomicPlan, targets),
      ),
      "projection_conflict",
      `atomic partial state ${clusterState}/${improvementState} cannot repair one target`,
    );
  }

  for (const [clusterState, improvementState] of [
    ["X", "B"],
    ["X", "A"],
    ["X", "X"],
    ["B", "X"],
    ["A", "X"],
  ]) {
    assertReconcileReject(
      reconcile(
        projectionObservedForPlan(plan, {
          cluster: clusterState,
          improvement: improvementState,
        }),
        executionEvidenceForTargets(plan),
      ),
      "projection_conflict",
      `X state ${clusterState}/${improvementState} is never repairable`,
    );
  }

  for (const [clusterState, improvementState, targets, label] of [
    ["A", "A", [], "A/A without acknowledgements"],
    ["A", "B", [], "A/B without cluster acknowledgement"],
    ["B", "A", [], "B/A without improvement acknowledgement"],
    ["B", "B", ["clusters"], "cluster acknowledgement points to B"],
    ["B", "B", ["improvements"], "improvement acknowledgement points to B"],
    ["A", "B", ["improvements"], "wrong improvement acknowledgement for A/B"],
    ["B", "A", ["clusters"], "wrong cluster acknowledgement for B/A"],
    ["A", "B", ["clusters", "improvements"], "extra improvement acknowledgement for A/B"],
    ["B", "A", ["clusters", "improvements"], "extra cluster acknowledgement for B/A"],
  ]) {
    assertReconcileReject(
      reconcile(
        projectionObservedForPlan(plan, {
          cluster: clusterState,
          improvement: improvementState,
        }),
        executionEvidenceForTargets(plan, targets),
      ),
      "projection_conflict",
      label,
    );
  }

  const missingMarker = projectionObservedForPlan(plan, { cluster: "A", improvement: "B" });
  missingMarker.cluster.recurrence_records.pop();
  const replacedMarker = projectionObservedForPlan(plan, { cluster: "A", improvement: "B" });
  const replacement = cloneJson(replacedMarker.cluster.recurrence_records.at(-1));
  replacement.source_receipt_sha256 = "e".repeat(64);
  replacement.projection_idempotency_key = "e".repeat(64);
  replacedMarker.cluster.recurrence_records[replacedMarker.cluster.recurrence_records.length - 1] =
    replacement;
  const reorderedMarker = projectionObservedForPlan(plan, { cluster: "A", improvement: "B" });
  reorderedMarker.cluster.recurrence_records.reverse();
  const extraMarker = projectionObservedForPlan(plan, { cluster: "A", improvement: "B" });
  extraMarker.cluster.recurrence_records.push(
    cloneJson(extraMarker.cluster.recurrence_records.at(-1)),
  );
  const partialImprovement = projectionObservedForPlan(plan, {
    cluster: "A",
    improvement: "A",
    improvementOverrides: { day_7_result: "SYN-PARTIAL-OLD-DAY-7" },
  });
  for (const [observed, evidence, label] of [
    [missingMarker, executionEvidenceForTargets(plan, ["clusters"]), "missing marker"],
    [replacedMarker, executionEvidenceForTargets(plan, ["clusters"]), "replaced marker"],
    [reorderedMarker, executionEvidenceForTargets(plan, ["clusters"]), "reordered marker"],
    [extraMarker, executionEvidenceForTargets(plan, ["clusters"]), "extra duplicate marker"],
    [
      partialImprovement,
      executionEvidenceForTargets(plan, ["clusters", "improvements"]),
      "mixed partial improvement patch",
    ],
  ]) {
    assertReconcileReject(
      reconcile(observed, evidence),
      "projection_conflict",
      label,
    );
  }

  const semanticObservedMismatch = projectionObservedForPlan(plan, {
    cluster: "A",
    improvement: "A",
    clusterOverrides: { cluster_id: "SYN-CLUSTER-R10-SEMANTIC-MISMATCH" },
  });
  assertReconcileReject(
    reconcile(
      semanticObservedMismatch,
      executionEvidenceForTargets(plan, ["clusters", "improvements"]),
    ),
    "projection_conflict",
    "exact-shape observed state bound to another cluster",
  );

  const semanticEvidenceMutations = [
    ["root receipt id", "SYN-RECEIPT-R10-OTHER", (evidence, value) => {
      evidence.source_receipt_id = value;
    }],
    ["root receipt hash", "3".repeat(64), (evidence, value) => {
      evidence.source_receipt_sha256 = value;
    }],
    ["root sealed plan", "4".repeat(64), (evidence, value) => {
      evidence.sealed_plan_sha256 = value;
    }],
    ["root attestation id", "SYN-CAPABILITY-R10-OTHER", (evidence, value) => {
      evidence.capability_attestation_id = value;
    }],
    ["root attestation hash", "5".repeat(64), (evidence, value) => {
      evidence.capability_attestation_sha256 = value;
    }],
    ["root execution mode", "atomic_all_targets", (evidence, value) => {
      evidence.execution_mode = value;
    }],
    ["root permission snapshot", "6".repeat(64), (evidence, value) => {
      evidence.permission_snapshot_sha256 = value;
    }],
    ["root permission revision", "synthetic-permission-revision-v2", (evidence, value) => {
      evidence.permission_revision = value;
    }],
    ["ack expected after", "7".repeat(64), (evidence, value) => {
      evidence.target_acks[0].expected_after_sha256 = value;
    }],
    ["ack applied plan", "8".repeat(64), (evidence, value) => {
      evidence.target_acks[0].applied_by_sealed_plan_sha256 = value;
    }],
    ["ack attestation", "9".repeat(64), (evidence, value) => {
      evidence.target_acks[0].capability_attestation_sha256 = value;
    }],
    ["ack permission snapshot", "1".repeat(64), (evidence, value) => {
      evidence.target_acks[0].permission_snapshot_sha256 = value;
    }],
    ["ack permission revision", "synthetic-ack-permission-revision-v2", (evidence, value) => {
      evidence.target_acks[0].permission_revision = value;
    }],
  ];
  for (const [label, sentinel, mutate] of semanticEvidenceMutations) {
    const evidence = executionEvidenceForTargets(plan, ["clusters", "improvements"]);
    mutate(evidence, sentinel);
    const rejected = assertReconcileReject(
      reconcile(
        projectionObservedForPlan(plan, { cluster: "A", improvement: "A" }),
        evidence,
      ),
      "projection_conflict",
      label,
    );
    assertG5PublicArtifactRedacted(rejected.artifact, [sentinel]);
  }

  const independentTimes = executionEvidenceForTargets(
    plan,
    ["clusters", "improvements"],
  );
  independentTimes.capability_rechecked_at = "2026-08-03T10:20:00.000Z";
  independentTimes.target_acks[0].capability_rechecked_at = "2026-08-03T10:21:00.000Z";
  independentTimes.target_acks[1].capability_rechecked_at = "2026-08-03T10:22:00.000Z";
  assert.equal(
    reconcile(
      projectionObservedForPlan(plan, { cluster: "A", improvement: "A" }),
      independentTimes,
    ).decision,
    "already_applied",
  );

  const differentLocatorEvidence = executionEvidenceForTargets(
    plan,
    ["clusters", "improvements"],
  );
  differentLocatorEvidence.target_acks[0].resolved_record_locator_sha256 = "9".repeat(64);
  const differentLocatorResult = reconcile(
    projectionObservedForPlan(plan, { cluster: "A", improvement: "A" }),
    differentLocatorEvidence,
  );
  assert.equal(differentLocatorResult.decision, "already_applied");

  const invalidInputCases = [];
  const planRootExtra = cloneJson(plan);
  planRootExtra.untrusted_extra = "SYN-PLAN-ROOT-EXTRA";
  invalidInputCases.push([
    planRootExtra,
    projectionObservedForPlan(plan),
    executionEvidenceForTargets(plan),
    "plan root extra key",
  ]);
  const planMissingRequired = cloneJson(plan);
  delete planMissingRequired.plan_contract;
  invalidInputCases.push([
    planMissingRequired,
    projectionObservedForPlan(plan),
    executionEvidenceForTargets(plan),
    "plan missing required key",
  ]);
  const planSelectorExtra = cloneJson(plan);
  planSelectorExtra.write_targets[0].selector.untrusted_extra = true;
  invalidInputCases.push([
    planSelectorExtra,
    projectionObservedForPlan(plan),
    executionEvidenceForTargets(plan),
    "plan selector extra key",
  ]);
  const planPatchExtra = cloneJson(plan);
  planPatchExtra.write_targets[0].patch.untrusted_extra = true;
  invalidInputCases.push([
    planPatchExtra,
    projectionObservedForPlan(plan),
    executionEvidenceForTargets(plan),
    "plan patch extra key",
  ]);
  const observedExtraKey = projectionObservedForPlan(plan);
  observedExtraKey.untrusted_extra = true;
  const observedClusterExtra = projectionObservedForPlan(plan);
  observedClusterExtra.cluster.untrusted_extra = true;
  const observedImprovementExtra = projectionObservedForPlan(plan);
  observedImprovementExtra.improvement.untrusted_extra = true;
  const observedMissingStatus = projectionObservedForPlan(plan);
  delete observedMissingStatus.cluster.status;
  const observedThirdStatus = projectionObservedForPlan(plan);
  observedThirdStatus.cluster.status = "处理中";
  const observed501Records = projectionObservedForPlan(plan);
  observed501Records.cluster.recurrence_records = Array.from(
    { length: 501 },
    (_, sequence) => ({ sequence }),
  );
  const reversedAcks = executionEvidenceForTargets(plan, ["clusters", "improvements"]);
  reversedAcks.target_acks.reverse();
  const duplicateAcks = executionEvidenceForTargets(plan, ["clusters", "improvements"]);
  duplicateAcks.target_acks[1] = cloneJson(duplicateAcks.target_acks[0]);
  const countMismatch = executionEvidenceForTargets(plan, ["clusters"]);
  countMismatch.acknowledged_target_count = 0;
  const evidenceRootExtra = executionEvidenceForTargets(plan);
  evidenceRootExtra.untrusted_extra = true;
  const evidenceAckExtra = executionEvidenceForTargets(plan, ["clusters"]);
  evidenceAckExtra.target_acks[0].untrusted_extra = true;
  const invalidRootTimestamp = executionEvidenceForTargets(plan);
  invalidRootTimestamp.capability_rechecked_at = "SYN-INVALID-ROOT-TIMESTAMP";
  const invalidAckTimestamp = executionEvidenceForTargets(plan, ["clusters"]);
  invalidAckTimestamp.target_acks[0].capability_rechecked_at = "SYN-INVALID-ACK-TIMESTAMP";
  const locatorMissing = executionEvidenceForTargets(plan, ["clusters"]);
  delete locatorMissing.target_acks[0].resolved_record_locator_sha256;
  const locatorWrongType = executionEvidenceForTargets(plan, ["clusters"]);
  locatorWrongType.target_acks[0].resolved_record_locator_sha256 = 7;
  const locatorInvalidSha = executionEvidenceForTargets(plan, ["clusters"]);
  locatorInvalidSha.target_acks[0].resolved_record_locator_sha256 = "SYN-INVALID-LOCATOR";
  for (const [observed, evidence, label] of [
    [observedExtraKey, executionEvidenceForTargets(plan), "observed root extra key"],
    [observedClusterExtra, executionEvidenceForTargets(plan), "observed cluster extra key"],
    [observedImprovementExtra, executionEvidenceForTargets(plan), "observed improvement extra key"],
    [observedMissingStatus, executionEvidenceForTargets(plan), "observed missing status"],
    [observedThirdStatus, executionEvidenceForTargets(plan), "observed third status"],
    [observed501Records, executionEvidenceForTargets(plan), "observed records over 500"],
    [projectionObservedForPlan(plan), reversedAcks, "reversed acknowledgements"],
    [projectionObservedForPlan(plan), duplicateAcks, "duplicate acknowledgements"],
    [projectionObservedForPlan(plan), countMismatch, "acknowledgement count mismatch"],
    [projectionObservedForPlan(plan), evidenceRootExtra, "evidence root extra key"],
    [projectionObservedForPlan(plan), evidenceAckExtra, "evidence acknowledgement extra key"],
    [projectionObservedForPlan(plan), invalidRootTimestamp, "invalid root timestamp"],
    [projectionObservedForPlan(plan), invalidAckTimestamp, "invalid acknowledgement timestamp"],
    [projectionObservedForPlan(plan), locatorMissing, "missing locator digest"],
    [projectionObservedForPlan(plan), locatorWrongType, "locator digest wrong type"],
    [projectionObservedForPlan(plan), locatorInvalidSha, "locator digest invalid SHA"],
    [projectionObservedForPlan(plan), null, "null evidence cannot fabricate acknowledgements"],
  ]) {
    invalidInputCases.push([plan, observed, evidence, label]);
  }
  for (const owner of ["plan", "observed", "evidence"]) {
    for (const [field, value] of [
      ["lease", "SYN-PRIVATE-LEASE"],
      ["worker_id", "SYN-PRIVATE-WORKER"],
      ["lease_expires_at", "2026-08-03T10:30:00.000Z"],
    ]) {
      const selectedPlan = cloneJson(plan);
      const observed = projectionObservedForPlan(plan);
      const evidence = executionEvidenceForTargets(plan);
      ({ plan: selectedPlan, observed, evidence }[owner])[field] = value;
      invalidInputCases.push([
        selectedPlan,
        observed,
        evidence,
        `${owner} rejects injected ${field}`,
      ]);
    }
  }
  for (const [selectedPlan, observed, evidence, label] of invalidInputCases) {
    assertReconcileReject(
      reconcileW6ReopenProjection(selectedPlan, observed, evidence),
      "invalid_projection_input",
      label,
    );
  }

  const observed500Records = projectionObservedForPlan(plan);
  observed500Records.cluster.recurrence_records = Array.from(
    { length: 500 },
    (_, sequence) => ({ sequence }),
  );
  assertReconcileReject(
    reconcile(observed500Records, executionEvidenceForTargets(plan)),
    "projection_conflict",
    "500 observed records are structurally valid but do not match B or A",
  );

  let getterCalls = 0;
  const hostileObserved = projectionObservedForPlan(plan);
  Object.defineProperty(hostileObserved.cluster, "status", {
    enumerable: true,
    get() {
      getterCalls += 1;
      return "已归档";
    },
  });
  assertReconcileReject(
    reconcile(hostileObserved, executionEvidenceForTargets(plan)),
    "invalid_projection_input",
    "observed accessor fails before evaluation",
  );
  assert.equal(getterCalls, 0);

  const privateValuesFor = (selectedPlan, evidence) => [
    selectedPlan.source_receipt_id,
    selectedPlan.capability_attestation_id,
    selectedPlan.capability_attestation_sha256,
    selectedPlan.permission_snapshot_sha256,
    selectedPlan.permission_revision,
    ...(evidence?.target_acks ?? []).map((ack) => ack.resolved_record_locator_sha256),
  ];
  const compositionCases = [
    ["A", "A", ["clusters", "improvements"], "already_applied", null],
    ["A", "B", ["clusters"], "repair", "improvements"],
    ["B", "A", ["improvements"], "repair", "clusters"],
  ];
  for (const origin of ["found", "existing_same"]) {
    for (const [clusterState, improvementState, targets, expectedDecision, repairTarget] of
      compositionCases) {
      const harness = createCompositionHarness({
        initialPlan: origin === "found" ? plan : null,
        forcedSealOutcome: origin === "existing_same" ? "existing_same" : null,
        executionEvidence: ({ authoritativePlan }) =>
          executionEvidenceForTargets(authoritativePlan, targets),
        beforeValue: ({ call, authoritativePlan }) =>
          origin === "existing_same" && call === 1
            ? projectionBefore()
            : projectionObservedForPlan(authoritativePlan, {
                cluster: clusterState,
                improvement: improvementState,
              }),
      });
      const artifact = await harness.composition.handle(committedTrigger());
      const authoritativePlan = harness.getAuthoritativePlan();
      const evidence = executionEvidenceForTargets(authoritativePlan, targets);
      assert.equal(artifact.decision, expectedDecision, `${origin} ${clusterState}/${improvementState}`);
      assert.equal(artifact.repair_target, repairTarget, `${origin} ${clusterState}/${improvementState}`);
      assertG5PublicArtifactRedacted(artifact, privateValuesFor(authoritativePlan, evidence));
      assert.ok(
        harness.order.lastIndexOf("executionEvidence") < harness.order.lastIndexOf("base"),
        `${origin} reads evidence before observed Base state`,
      );
      assert.equal(harness.calls.base, origin === "found" ? 1 : 2);
      assert.equal(harness.calls.capability, origin === "found" ? 0 : 1);
      assert.equal(harness.calls.clock, origin === "found" ? 0 : 1);
      assert.equal(harness.calls.outboxSeal, 1);
      assert.equal(harness.calls.executionEvidence, 1);
      assert.equal(harness.calls.permissionRevalidation, 0);
      assert.equal(Object.hasOwn(artifact, "execution"), false);
    }
  }

  for (const origin of ["found", "existing_same"]) {
    for (const [clusterState, improvementState] of [
      ["A", "A"],
      ["A", "B"],
      ["B", "A"],
    ]) {
      const harness = createCompositionHarness({
        initialPlan: origin === "found" ? plan : null,
        forcedSealOutcome: origin === "existing_same" ? "existing_same" : null,
        executionEvidence: null,
        beforeValue: ({ call, authoritativePlan }) =>
          origin === "existing_same" && call === 1
            ? projectionBefore()
            : projectionObservedForPlan(authoritativePlan, {
                cluster: clusterState,
                improvement: improvementState,
              }),
      });
      const artifact = await harness.composition.handle(committedTrigger());
      assert.equal(artifact.decision, "reject", `${origin} ${clusterState}/${improvementState} null evidence`);
      assert.equal(artifact.safe_error, "projection_conflict");
      assert.equal(harness.calls.executionEvidence, 1);
      assert.equal(harness.calls.base, origin === "found" ? 0 : 1);
      assert.equal(harness.calls.permissionRevalidation, 0);
      assertG5PublicArtifactRedacted(artifact);
    }
  }

  const malformedEvidence = {
    evidence_contract: "w6_reopen_projection_execution_evidence.v1",
    secret: "SYN-MALFORMED-G5-EVIDENCE-MUST-NOT-LEAK",
  };
  for (const origin of ["found", "existing_same"]) {
    const harness = createCompositionHarness({
      initialPlan: origin === "found" ? plan : null,
      forcedSealOutcome: origin === "existing_same" ? "existing_same" : null,
      executionEvidence: malformedEvidence,
    });
    const artifact = await harness.composition.handle(committedTrigger());
    assert.equal(artifact.decision, "reject");
    assert.equal(artifact.safe_error, "projection_dependency_failure");
    assert.equal(harness.calls.base, origin === "found" ? 0 : 1);
    assert.equal(harness.calls.permissionRevalidation, 0);
    assertG5PublicArtifactRedacted(artifact, [malformedEvidence.secret]);
  }

  for (const [label, sentinel, mutate] of semanticEvidenceMutations) {
    const evidence = executionEvidenceForTargets(plan, ["clusters", "improvements"]);
    mutate(evidence, sentinel);
    const harness = createCompositionHarness({
      initialPlan: plan,
      executionEvidence: evidence,
      beforeValue: () => {
        throw new Error("SYN-SEMANTIC-MISMATCH-MUST-NOT-READ-BASE");
      },
    });
    const artifact = await harness.composition.handle(committedTrigger());
    assert.equal(artifact.decision, "reject", label);
    assert.equal(artifact.safe_error, "projection_conflict", label);
    assert.equal(harness.calls.base, 0, label);
    assert.equal(harness.calls.permissionRevalidation, 0, label);
    assertG5PublicArtifactRedacted(artifact, [sentinel]);
  }

  const existingSemanticHarness = createCompositionHarness({
    forcedSealOutcome: "existing_same",
    executionEvidence: ({ authoritativePlan }) => {
      const evidence = executionEvidenceForTargets(
        authoritativePlan,
        ["clusters", "improvements"],
      );
      evidence.sealed_plan_sha256 = "f".repeat(64);
      return evidence;
    },
  });
  const existingSemanticArtifact = await existingSemanticHarness.composition.handle(
    committedTrigger(),
  );
  assert.equal(existingSemanticArtifact.decision, "reject");
  assert.equal(existingSemanticArtifact.safe_error, "projection_conflict");
  assert.equal(existingSemanticHarness.calls.base, 1);
  assert.equal(existingSemanticHarness.calls.permissionRevalidation, 0);
  assertG5PublicArtifactRedacted(existingSemanticArtifact, ["f".repeat(64)]);

  for (const [origin, clusterState, improvementState, targets, expectedDecision] of [
    ["found", "A", "A", ["clusters", "improvements"], "already_applied"],
    ["existing_same", "A", "B", ["clusters"], "repair"],
  ]) {
    const alternateLocator = "2".repeat(64);
    const harness = createCompositionHarness({
      initialPlan: origin === "found" ? plan : null,
      forcedSealOutcome: origin === "existing_same" ? "existing_same" : null,
      executionEvidence: ({ authoritativePlan }) => {
        const evidence = executionEvidenceForTargets(authoritativePlan, targets);
        evidence.target_acks[0].resolved_record_locator_sha256 = alternateLocator;
        return evidence;
      },
      beforeValue: ({ call, authoritativePlan }) =>
        origin === "existing_same" && call === 1
          ? projectionBefore()
          : projectionObservedForPlan(authoritativePlan, {
              cluster: clusterState,
              improvement: improvementState,
            }),
    });
    const artifact = await harness.composition.handle(committedTrigger());
    assert.equal(artifact.decision, expectedDecision, `${origin} accepts a structurally valid locator SHA`);
    assert.equal(harness.calls.base, origin === "found" ? 1 : 2);
    assert.equal(harness.calls.permissionRevalidation, 0);
    assertG5PublicArtifactRedacted(artifact, [alternateLocator]);
  }
});
test("R10 G1.16 capability validity and trusted time distinguish local fixtures from onsite-shaped attestations", () => {
  for (const attestation of [
    capability({ execution_mode: "sealed_outbox_cas" }),
    capability({ execution_mode: "atomic_all_targets" }),
    capability({ evidence_unit_ref: null }),
    onsiteShapeCapability(),
  ]) {
    const result = planW6ReopenProjection(
      projectionSource(),
      projectionBefore(),
      attestation,
      CAPABILITY_CHECKED_AT,
    );
    assert.equal(result.decision, "apply_once");
    assert.equal(result.plan.execution_mode, attestation.execution_mode);
    assert.equal(result.artifact.evidence_class, "synthetic_experiment");
  }

  const malformedMissing = capability();
  delete malformedMissing.permission_revision;
  for (const attestation of [
    { ...capability(), injected: true },
    malformedMissing,
    capability({ evidence_class: "solution_design" }),
    capability({ verified_by_role: "authorized_competition_operator" }),
    capability({ permission_snapshot_sha256: null }),
    capability({ permission_revision: null }),
    capability({ issued_at: null }),
    capability({ expires_at: null }),
    capability({ expires_at: CAPABILITY_ISSUED_AT }),
    notTestedCapability({ execution_mode: "sealed_outbox_cas" }),
    notTestedCapability({ permission_revision: "forged-revision" }),
    notTestedCapability({ recurrence_visibility_no_broader_than_source_fields: true }),
    onsiteShapeCapability({ verified_by_role: "test_harness" }),
    onsiteShapeCapability({ permission_snapshot_sha256: null }),
  ]) {
    expectPlannerRejectBeforeHash({ attestation }, "invalid_projection_input");
  }

  for (const evidenceUnitRef of [
    "P02",
    "P03",
    "P03+P02",
    "P02/P03",
    "P02,P03",
    " P02+P03",
    "P02+P03 ",
    "P02+P03+P04",
  ]) {
    expectPlannerRejectBeforeHash({
      attestation: onsiteShapeCapability({ evidence_unit_ref: evidenceUnitRef }),
    }, "invalid_projection_input");
  }

  const onsiteShapedPlan = planW6ReopenProjection(
    projectionSource(),
    projectionBefore(),
    onsiteShapeCapability(),
    CAPABILITY_CHECKED_AT,
  );
  assert.equal(onsiteShapedPlan.decision, "apply_once");
  assert.equal(JSON.stringify(onsiteShapedPlan.artifact).includes("P02+P03"), false);
  assert.equal(JSON.stringify(onsiteShapedPlan.artifact).includes("evidence_unit_ref"), false);

  for (const input of [
    { attestation: notTestedCapability() },
    { attestation: capability({ execution_mode: "insufficient" }) },
    { attestation: capability({ recurrence_visibility_no_broader_than_source_fields: false }) },
    { checkedAt: "2026-08-03T09:29:59.999Z" },
    { checkedAt: CAPABILITY_EXPIRES_AT },
    { checkedAt: "2026-08-03T10:30:00.001Z" },
  ]) {
    expectPlannerRejectBeforeHash(input, "platform_capability_insufficient");
  }
  expectPlannerRejectBeforeHash({ checkedAt: "not-a-time" }, "invalid_projection_input");

  let capabilityGetterCalls = 0;
  const hostileCapability = capability();
  Object.defineProperty(hostileCapability, "permission_revision", {
    enumerable: true,
    get() {
      capabilityGetterCalls += 1;
      return "must-not-run";
    },
  });
  expectPlannerRejectBeforeHash(
    { attestation: hostileCapability },
    "invalid_projection_input",
  );
  assert.equal(capabilityGetterCalls, 0);
  let capabilityProxyTrapCalls = 0;
  const hostileCapabilityProxy = new Proxy(capability(), {
    ownKeys(target) {
      capabilityProxyTrapCalls += 1;
      return Reflect.ownKeys(target);
    },
  });
  expectPlannerRejectBeforeHash(
    { attestation: hostileCapabilityProxy },
    "invalid_projection_input",
  );
  assert.equal(capabilityProxyTrapCalls, 0);

  const atIssued = planW6ReopenProjection(
    projectionSource(),
    projectionBefore(),
    capability(),
    CAPABILITY_ISSUED_AT,
  );
  const beforeExpires = planW6ReopenProjection(
    projectionSource(),
    projectionBefore(),
    capability(),
    "2026-08-03T10:29:59.999Z",
  );
  assert.equal(atIssued.decision, "apply_once");
  assert.deepEqual(atIssued, beforeExpires);

  const changedRevision = planW6ReopenProjection(
    projectionSource(),
    projectionBefore(),
    capability({ permission_revision: "synthetic-permission-revision-v2" }),
    CAPABILITY_CHECKED_AT,
  );
  assert.notEqual(
    changedRevision.plan.capability_attestation_sha256,
    atIssued.plan.capability_attestation_sha256,
  );
  assert.notEqual(changedRevision.plan.sealed_plan_sha256, atIssued.plan.sealed_plan_sha256);
});

test("R10 G1.17 planner capability visibility attestations fail closed and artifacts redact raw recurrence", () => {
  const before = projectionBefore();
  const beforeSnapshot = JSON.stringify(before);
  for (const attestation of [
    notTestedCapability(),
    capability({ execution_mode: "insufficient" }),
    capability({ recurrence_visibility_no_broader_than_source_fields: false }),
    onsiteShapeCapability({
      recurrence_visibility_no_broader_than_source_fields: false,
    }),
  ]) {
    const reject = expectPlannerRejectBeforeHash({ before, attestation }, "platform_capability_insufficient");
    assert.deepEqual(Reflect.ownKeys(reject.artifact).sort(), [
      "cluster_expected_after_sha256",
      "cluster_expected_before_sha256",
      "cluster_id",
      "data_scope",
      "decision",
      "evidence_class",
      "improvement_expected_after_sha256",
      "improvement_expected_before_sha256",
      "improvement_id",
      "planned_target_count",
      "projection_idempotency_key",
      "projector_key",
      "redaction_status",
      "repair_required",
      "repair_target",
      "safe_error",
      "sealed_plan_sha256",
      "write_targets",
    ]);
    assert.equal(JSON.stringify(before), beforeSnapshot);
  }

  const success = planW6ReopenProjection(
    projectionSource(),
    before,
    capability(),
    CAPABILITY_CHECKED_AT,
  );
  assert.equal(success.decision, "apply_once");
  const publicJson = JSON.stringify(success.artifact);
  for (const forbidden of [
    "recurrence_records",
    "SYN-OPAQUE-RECURRENCE-R10",
    "SYN-SENSITIVE-DAY-7-R10",
    "SYN-SENSITIVE-DAY-30-R10",
    "SYN-SENSITIVE-HUMAN-CONCLUSION-R10",
  ]) {
    assert.equal(publicJson.includes(forbidden), false);
  }
});
test("R10 G1.18 dependency failures are normalized without leaking sentinels", async () => {
  const planned = planW6ReopenProjection(
    projectionSource(),
    projectionBefore(),
    capability(),
    CAPABILITY_CHECKED_AT,
  );
  assert.equal(planned.decision, "apply_once");
  for (const stage of [
    "source",
    "outboxLoad",
    "base",
    "capability",
    "clock",
    "outboxSeal",
    "hasher",
    "executionEvidence",
  ]) {
    const harness = createCompositionHarness({
      failureAt: stage,
      ...(stage === "executionEvidence" ? { initialPlan: planned.plan } : {}),
    });
    const artifact = await harness.composition.handle(committedTrigger());
    assertPublicArtifact(artifact);
    assert.equal(artifact.decision, "reject");
    assert.equal(artifact.safe_error, "projection_dependency_failure");
    const publicJson = JSON.stringify(artifact);
    assert.equal(publicJson.includes(`SYN-SENSITIVE-${stage}-MUST-NOT-LEAK`), false);
    for (const forbidden of ["message", "stack", "cause"]) {
      assert.equal(publicJson.includes(forbidden), false);
    }
  }

  for (const malformed of [
    { option: { sourceValue: { outcome: "committed" } }, stage: "source", baseCalls: 0 },
    { option: { beforeValue: { projection_contract: W6_REOPEN_BEFORE_CONTRACT } }, stage: "base", baseCalls: 1 },
    { option: { capabilityValue: { attestation_contract: W6_REOPEN_CAPABILITY_CONTRACT } }, stage: "capability", baseCalls: 1 },
    { option: { clockValues: ["not-a-trusted-clock"] }, stage: "clock", baseCalls: 1 },
    { option: { initialPlan: { plan_contract: "w6_reopen_projection_plan.v1" } }, stage: "outbox", baseCalls: 0 },
    {
      option: {
        initialPlan: planned.plan,
        executionEvidence: {
          evidence_contract: "w6_reopen_projection_execution_evidence.v1",
          secret: "SYN-EVIDENCE-SECRET-MUST-NOT-LEAK",
        },
      },
      stage: "executionEvidenceShape",
      baseCalls: 0,
    },
  ]) {
    const harness = createCompositionHarness(malformed.option);
    const artifact = await harness.composition.handle(committedTrigger());
    assertPublicArtifact(artifact);
    assert.equal(artifact.decision, "reject", malformed.stage);
    assert.equal(artifact.safe_error, "projection_dependency_failure", malformed.stage);
    assert.equal(harness.calls.base, malformed.baseCalls, malformed.stage);
    assert.equal(
      harness.calls.outboxSeal,
      malformed.stage === "executionEvidenceShape" ? 1 : 0,
      malformed.stage,
    );
    assert.equal(JSON.stringify(artifact).includes("SYN-EVIDENCE-SECRET-MUST-NOT-LEAK"), false);
  }

});

test("R10 G1.18b malformed not_tested visibility fails at the trusted capability boundary", async () => {
  const malformedNotTestedSentinel = "SYN-NOT-TESTED-VISIBILITY-MUST-NOT-LEAK";
  const harness = createCompositionHarness({
    capabilityValue: notTestedCapability({
      attestation_id: malformedNotTestedSentinel,
      recurrence_visibility_no_broader_than_source_fields: true,
    }),
    additionalSensitiveValues: [malformedNotTestedSentinel],
  });
  const artifact = await harness.composition.handle(committedTrigger());
  assertPublicArtifact(artifact);
  assert.equal(artifact.decision, "reject");
  assert.equal(artifact.safe_error, "projection_dependency_failure");
  assert.equal(harness.calls.source, 1);
  assert.equal(harness.calls.hasher, 1);
  assert.equal(harness.calls.outboxLoad, 1);
  assert.equal(harness.calls.base, 1);
  assert.equal(harness.calls.capability, 1);
  assert.equal(harness.calls.clock, 0);
  assert.equal(harness.calls.outboxSeal, 0);
  assert.equal(harness.calls.executionEvidence, 0);
  assert.equal(harness.calls.permissionRevalidation, 0);
  assert.equal(JSON.stringify(artifact).includes(malformedNotTestedSentinel), false);
});

test("R10 G1.19 plan, directive, and artifact layers use exact allowlists and recursive redaction", async () => {
  const harness = createCompositionHarness();
  const artifact = await harness.composition.handle(committedTrigger());
  assertPublicArtifact(artifact);
  assert.equal(artifact.decision, "apply_once");
  assertNoRecursiveKeyOrValue(
    artifact,
    new Set([
      "plan",
      "patch",
      "execution",
      "selector",
      "record_id",
      "opaque_locator",
      "source_receipt_id",
      "receipt_id",
      "history_id",
      "cycle_id",
      "previous_projection",
      "opened_by",
      "principal",
      "grant",
      "claims",
      "policy",
      "w5_closure_provenance",
      "semantic_fingerprint",
      "canonical_receipt_material",
      "capability_attestation_id",
      "permission_revision",
    ]),
    new Set([
      RECEIPT_ID,
      HISTORY_ID,
      CYCLE_ID,
      "SYN-ATTESTATION-R10-001",
      "synthetic-permission-revision-v1",
      "SYN-SENSITIVE-DAY-7-R10",
      "SYN-SENSITIVE-DAY-30-R10",
      "SYN-SENSITIVE-HUMAN-CONCLUSION-R10",
    ]),
  );
  assert.equal(harness.sealInputs.length, 1);
  assert.deepEqual(Reflect.ownKeys(harness.sealInputs[0]).sort(), [
    "canonical_receipt_material",
    "plan",
  ]);
  assert.equal(Object.hasOwn(artifact, "plan"), false);
  assert.equal(Object.hasOwn(artifact, "execution"), false);

  const injectedSentinel = "SYN-FAULT-SEAM-SECRET-MUST-NOT-LEAK";
  const faultHarness = createCompositionHarness({
    artifactFault(value) {
      return {
        ...value,
        nested: {
          receipt_id: RECEIPT_ID,
          secret: injectedSentinel,
        },
      };
    },
    additionalSensitiveValues: [injectedSentinel],
  });
  const rejected = await faultHarness.composition.handle(committedTrigger());
  assertPublicArtifact(rejected);
  assert.equal(rejected.decision, "reject");
  assert.equal(rejected.safe_error, "sensitive_output_rejected");
  assert.equal(JSON.stringify(rejected).includes(injectedSentinel), false);
  assert.equal(JSON.stringify(rejected).includes(RECEIPT_ID), false);

  const sensitiveBoundId = "SYN-SENSITIVE-BOUND-ID-MUST-NOT-LEAK";
  const valueFaultHarness = createCompositionHarness({
    artifactFault(value) {
      return {
        ...value,
        cluster_id: sensitiveBoundId,
      };
    },
    additionalSensitiveValues: [sensitiveBoundId],
  });
  const valueRejected = await valueFaultHarness.composition.handle(committedTrigger());
  assertPublicArtifact(valueRejected);
  assert.equal(valueRejected.decision, "reject");
  assert.equal(valueRejected.safe_error, "sensitive_output_rejected");
  assert.equal(JSON.stringify(valueRejected).includes(sensitiveBoundId), false);

  for (const zeroPortArtifact of [
    await harness.composition.handle(exactReplayTrigger()),
    await harness.composition.handle(nearConflictTrigger()),
  ]) {
    assertPublicArtifact(zeroPortArtifact);
    assert.equal(Object.hasOwn(zeroPortArtifact, "plan"), false);
    assert.equal(Object.hasOwn(zeroPortArtifact, "execution"), false);
  }
});
test("R10 G1.20 all DTOs are deeply immutable and all R9 regression gates remain green", () => {
  assert.equal(typeof reconcileW6ReopenProjection, "function", "G5 pure reconcile export is required");

  const planned = planW6ReopenProjection(
    projectionSource(),
    projectionBefore(),
    capability(),
    CAPABILITY_CHECKED_AT,
  );
  assert.equal(planned.decision, "apply_once");
  const sourcePlan = cloneJson(planned.plan);

  const fixtureCases = [
    {
      name: "repair improvement",
      plan: cloneJson(sourcePlan),
      observed: projectionObservedForPlan(sourcePlan, { cluster: "A", improvement: "B" }),
      evidence: executionEvidenceForTargets(sourcePlan, ["clusters"]),
      expectedDecision: "repair",
      repairTarget: "improvements",
    },
    {
      name: "repair cluster",
      plan: cloneJson(sourcePlan),
      observed: projectionObservedForPlan(sourcePlan, { cluster: "B", improvement: "A" }),
      evidence: executionEvidenceForTargets(sourcePlan, ["improvements"]),
      expectedDecision: "repair",
      repairTarget: "clusters",
    },
    {
      name: "already applied",
      plan: cloneJson(sourcePlan),
      observed: projectionObservedForPlan(sourcePlan, { cluster: "A", improvement: "A" }),
      evidence: executionEvidenceForTargets(sourcePlan, ["clusters", "improvements"]),
      expectedDecision: "already_applied",
      repairTarget: null,
    },
    {
      name: "safe reject",
      plan: cloneJson(sourcePlan),
      observed: projectionObservedForPlan(sourcePlan, { cluster: "X", improvement: "B" }),
      evidence: executionEvidenceForTargets(sourcePlan),
      expectedDecision: "reject",
      repairTarget: null,
    },
  ];

  const forbiddenArtifactKeys = new Set([
    "plan",
    "patch",
    "directive",
    "execution",
    "selector",
    "record_id",
    "opaque_locator",
    "resolved_record_locator_sha256",
    "target_acks",
    "lease",
    "worker_id",
    "lease_expires_at",
    "source_receipt_id",
    "capability_attestation_id",
    "capability_attestation_sha256",
    "permission_snapshot_sha256",
    "permission_revision",
  ]);

  for (const fixture of fixtureCases) {
    const planBefore = JSON.stringify(fixture.plan);
    const observedBefore = JSON.stringify(fixture.observed);
    const evidenceBefore = JSON.stringify(fixture.evidence);
    assert.equal(Object.isFrozen(fixture.plan), false, fixture.name);
    assert.equal(Object.isFrozen(fixture.observed), false, fixture.name);
    assert.equal(Object.isFrozen(fixture.evidence), false, fixture.name);

    const result = reconcileW6ReopenProjection(
      fixture.plan,
      fixture.observed,
      fixture.evidence,
    );
    assert.equal(result instanceof Promise, false, fixture.name);
    assert.equal(result.decision, fixture.expectedDecision, fixture.name);
    assert.equal(JSON.stringify(fixture.plan), planBefore, fixture.name);
    assert.equal(JSON.stringify(fixture.observed), observedBefore, fixture.name);
    assert.equal(JSON.stringify(fixture.evidence), evidenceBefore, fixture.name);
    assert.equal(Object.isFrozen(fixture.plan), false, fixture.name);
    assert.equal(Object.isFrozen(fixture.observed), false, fixture.name);
    assert.equal(Object.isFrozen(fixture.evidence), false, fixture.name);
    assertDeepFrozen(result);
    assertPublicArtifact(result.artifact);

    if (fixture.expectedDecision === "repair") {
      assertRepairReusesOriginalPlan(result, JSON.parse(planBefore), fixture.repairTarget);
      assert.notEqual(result.plan, fixture.plan, fixture.name);
      assert.notEqual(result.plan.write_targets, fixture.plan.write_targets, fixture.name);
      assert.notEqual(
        result.plan.write_targets[0].patch,
        fixture.plan.write_targets[0].patch,
        fixture.name,
      );
    } else {
      assert.equal(result.plan, null, fixture.name);
      assert.equal(result.execution, null, fixture.name);
    }

    assertNoRecursiveKeyOrValue(
      result.artifact,
      forbiddenArtifactKeys,
      new Set([
        fixture.plan.source_receipt_id,
        fixture.plan.capability_attestation_id,
        fixture.plan.capability_attestation_sha256,
        fixture.plan.permission_snapshot_sha256,
        fixture.plan.permission_revision,
        ...fixture.evidence.target_acks.map((ack) => ack.resolved_record_locator_sha256),
      ]),
    );
    const stableResult = JSON.stringify(result);
    fixture.plan.write_targets[0].patch.status = "SYN-MUTATED-AFTER-RECONCILE";
    fixture.observed.cluster.status = "SYN-MUTATED-AFTER-RECONCILE";
    fixture.evidence.permission_revision = "SYN-MUTATED-AFTER-RECONCILE";
    assert.equal(JSON.stringify(result), stableResult, fixture.name);

    assert.throws(() => {
      result.artifact.write_targets.push("clusters");
    }, TypeError, fixture.name);
    if (result.plan !== null) {
      assert.throws(() => {
        result.plan.write_targets[0].patch.member_case_ids.push("SYN-MUTATION");
      }, TypeError, fixture.name);
      assert.throws(() => {
        result.execution.pending_targets.push("clusters");
      }, TypeError, fixture.name);
    }
  }

  const protoSentinelValue = {
    synthetic_sentinel: "SYN-OPAQUE-OWN-PROTO-R10",
    nested: { retained: "SYN-NESTED-OWN-PROTO-R10" },
  };
  const opaqueProtoRecord = {
    projection_contract: "opaque_recurrence_proto_fixture.v1",
    data_scope: "synthetic_experiment",
    marker: "SYN-OPAQUE-PROTO-RECORD-R10",
  };
  Object.defineProperty(opaqueProtoRecord, "__proto__", {
    value: protoSentinelValue,
    enumerable: true,
    writable: true,
    configurable: true,
  });
  const protoPlanned = planW6ReopenProjection(
    projectionSource(),
    projectionBefore({ cluster: { recurrence_records: [opaqueProtoRecord] } }),
    capability({ execution_mode: "sealed_outbox_cas" }),
    CAPABILITY_CHECKED_AT,
  );
  assert.equal(protoPlanned.decision, "apply_once");
  const protoInputPlan = cloneJson(protoPlanned.plan);
  const protoInputRecord = protoInputPlan.write_targets[0].patch.recurrence_records[0];
  const protoInputDescriptor = Object.getOwnPropertyDescriptor(protoInputRecord, "__proto__");
  assert.ok(protoInputDescriptor);
  assert.equal(protoInputDescriptor.enumerable, true);
  assert.equal(protoInputDescriptor.writable, true);
  assert.equal(protoInputDescriptor.configurable, true);
  assert.equal(Object.getPrototypeOf(protoInputRecord), Object.prototype);
  assert.equal(Object.isFrozen(protoInputRecord), false);
  assert.equal(Object.isFrozen(protoInputDescriptor.value), false);
  assert.equal(Object.isFrozen(protoInputDescriptor.value.nested), false);
  const protoInputJsonBefore = JSON.stringify(protoInputRecord);
  const protoInputValueBefore = cloneJson(protoInputDescriptor.value);

  const protoRepair = reconcileW6ReopenProjection(
    protoInputPlan,
    projectionObservedForPlan(protoInputPlan, { cluster: "A", improvement: "B" }),
    executionEvidenceForTargets(protoInputPlan, ["clusters"]),
  );
  assert.equal(protoRepair.decision, "repair");
  assert.equal(protoRepair.artifact.repair_target, "improvements");
  const protoOutputRecord = protoRepair.plan.write_targets[0].patch.recurrence_records[0];
  const protoOutputDescriptor = Object.getOwnPropertyDescriptor(protoOutputRecord, "__proto__");
  assert.ok(protoOutputDescriptor, "repair plan preserves own __proto__ data property");
  assert.equal(Object.hasOwn(protoOutputRecord, "__proto__"), true);
  assert.equal(Object.getPrototypeOf(protoOutputRecord), Object.prototype);
  assert.deepEqual(protoOutputDescriptor.value, protoInputValueBefore);
  assert.equal(Object.isFrozen(protoOutputRecord), true);
  assert.equal(Object.isFrozen(protoOutputDescriptor.value), true);
  assert.equal(Object.isFrozen(protoOutputDescriptor.value.nested), true);
  assert.notEqual(protoOutputRecord, protoInputRecord);
  assert.notEqual(protoOutputDescriptor.value, protoInputDescriptor.value);
  assert.notEqual(protoOutputDescriptor.value.nested, protoInputDescriptor.value.nested);

  const protoInputDescriptorAfter = Object.getOwnPropertyDescriptor(
    protoInputRecord,
    "__proto__",
  );
  assert.ok(protoInputDescriptorAfter);
  assert.equal(Object.hasOwn(protoInputRecord, "__proto__"), true);
  assert.equal(Object.getPrototypeOf(protoInputRecord), Object.prototype);
  assert.equal(protoInputDescriptorAfter.enumerable, true);
  assert.equal(protoInputDescriptorAfter.writable, true);
  assert.equal(protoInputDescriptorAfter.configurable, true);
  assert.equal(protoInputDescriptorAfter.value, protoInputDescriptor.value);
  assert.deepEqual(protoInputDescriptorAfter.value, protoInputValueBefore);
  assert.equal(JSON.stringify(protoInputRecord), protoInputJsonBefore);
  assert.equal(Object.isFrozen(protoInputRecord), false);
  assert.equal(Object.isFrozen(protoInputDescriptorAfter.value), false);
  assert.equal(Object.isFrozen(protoInputDescriptorAfter.value.nested), false);

  protoInputDescriptorAfter.value.nested.retained = "SYN-MUTATED-INPUT-AFTER-RECONCILE";
  assert.deepEqual(protoOutputDescriptor.value, protoInputValueBefore);
  const protoRoundTrip = JSON.parse(JSON.stringify(protoOutputRecord));
  const protoRoundTripDescriptor = Object.getOwnPropertyDescriptor(protoRoundTrip, "__proto__");
  assert.ok(protoRoundTripDescriptor);
  assert.equal(Object.hasOwn(protoRoundTrip, "__proto__"), true);
  assert.equal(Object.getPrototypeOf(protoRoundTrip), Object.prototype);
  assert.deepEqual(protoRoundTripDescriptor.value, protoInputValueBefore);
});
