import { types as utilTypes } from "node:util";

import type { JsonValue } from "../../contracts/model.js";
import { createWorkflowEventFingerprint } from "../../workflows/event-idempotency.js";

export const W6_REOPEN_PROJECTOR_KEY = "neoloop.feishu.w6-reopen.v1" as const;
export const W6_REOPEN_SOURCE_CONTRACT = "verified_w6_reopen_projection_source.v1" as const;
export const W6_REOPEN_RECEIPT_HASH_CONTRACT =
  "neoloop.feishu.w6-reopen-projection-receipt.v1" as const;
export const W6_REOPEN_BEFORE_CONTRACT = "w6_reopen_projection_before.v1" as const;
export const W6_REOPEN_CAPABILITY_CONTRACT =
  "w6_reopen_projection_capability.v1" as const;
export const W6_REOPEN_PREVIOUS_PROJECTION_HASH_CONTRACT =
  "neoloop.feishu.w6-reopen.previous-projection.v1" as const;
export const W6_REOPEN_CLUSTER_BEFORE_HASH_CONTRACT =
  "neoloop.feishu.w6-reopen.cluster-before.v1" as const;
export const W6_REOPEN_CLUSTER_AFTER_HASH_CONTRACT =
  "neoloop.feishu.w6-reopen.cluster-after.v1" as const;
export const W6_REOPEN_IMPROVEMENT_BEFORE_HASH_CONTRACT =
  "neoloop.feishu.w6-reopen.improvement-before.v1" as const;
export const W6_REOPEN_IMPROVEMENT_AFTER_HASH_CONTRACT =
  "neoloop.feishu.w6-reopen.improvement-after.v1" as const;
export const W6_REOPEN_CAPABILITY_ATTESTATION_HASH_CONTRACT =
  "neoloop.feishu.w6-reopen.capability-attestation.v1" as const;
export const W6_REOPEN_PLAN_HASH_CONTRACT =
  "neoloop.feishu.w6-reopen.sealed-plan.v1" as const;

export const W6_REOPEN_SNAPSHOT_LIMITS = Object.freeze({
  max_depth: 24,
  max_nodes: 20_000,
  max_array_length: 1_000,
  max_property_name_scalars: 128,
  max_text_scalars: 4_096,
  max_utf8_bytes: 1_048_576,
});

export type W6ReopenProjectionError =
  | "invalid_projection_input"
  | "unverified_commit"
  | "commit_proof_mismatch"
  | "event_conflict"
  | "projection_conflict"
  | "sensitive_output_rejected"
  | "platform_capability_insufficient"
  | "projection_dependency_failure";

export class W6ReopenProjectionFailure extends Error {
  readonly error: W6ReopenProjectionError;

  constructor(error: W6ReopenProjectionError) {
    super("W6 reopen projection request was rejected");
    this.name = "W6ReopenProjectionFailure";
    this.error = error;
  }
}

export interface VerifiedW6ReopenProjectionSource {
  readonly source_contract: typeof W6_REOPEN_SOURCE_CONTRACT;
  readonly data_scope: "synthetic_experiment";
  readonly evidence_class: "synthetic_experiment";
  readonly source_receipt_id: string;
  readonly source_receipt_sha256: string;
  readonly committed_at: string;
  readonly triggering_case_ids: readonly string[];
  readonly cluster_after: Readonly<{
    cluster_id: string;
    member_case_ids: readonly string[];
    status: "观察中";
    updated_at: string;
  }>;
  readonly improvement_after: Readonly<{
    improvement_id: string;
    status: "观察中";
    updated_at: string;
  }>;
}

export interface PrivateVerifiedW6ReopenCommitEnvelope {
  readonly projection_source: VerifiedW6ReopenProjectionSource;
  readonly canonical_receipt_material: JsonValue;
}

export type W6ReopenProjectionHasher = (value: JsonValue) => string;

export interface ReopenSnapshotV1 {
  readonly projection_contract: "reopen_snapshot.v1";
  readonly data_scope: "synthetic_experiment";
  readonly evidence_class: "synthetic_experiment";
  readonly source_receipt_sha256: string;
  readonly projection_idempotency_key: string;
  readonly committed_at: string;
  readonly previous_projection: Readonly<{
    day_7_result: string;
    day_30_result: string;
    human_conclusion: string;
  }>;
  readonly previous_projection_sha256: string;
}

export type PreservedNonR10RecurrenceRecord = Readonly<Record<string, JsonValue>>;
export type ClusterRecurrenceRecord = ReopenSnapshotV1 | PreservedNonR10RecurrenceRecord;

export interface W6ReopenProjectionBefore {
  readonly projection_contract: typeof W6_REOPEN_BEFORE_CONTRACT;
  readonly data_scope: "synthetic_experiment";
  readonly evidence_class: "synthetic_experiment";
  readonly cluster: Readonly<{
    cluster_id: string;
    member_case_ids: readonly string[];
    status: "已归档";
    recurrence_records: readonly ClusterRecurrenceRecord[];
    updated_at: string;
  }>;
  readonly improvement: Readonly<{
    improvement_id: string;
    status: "已完成";
    day_7_result: string;
    day_30_result: string;
    human_conclusion: string;
    updated_at: string;
  }>;
}

export interface TrustedProjectionCapabilityAttestation {
  readonly attestation_contract: typeof W6_REOPEN_CAPABILITY_CONTRACT;
  readonly attestation_id: string;
  readonly data_scope: "synthetic_experiment";
  readonly evidence_class: "synthetic_experiment" | "solution_design";
  readonly verification_status: "synthetic_fixture" | "not_tested" | "onsite_verified";
  readonly execution_mode: "atomic_all_targets" | "sealed_outbox_cas" | "insufficient";
  readonly recurrence_visibility_no_broader_than_source_fields: boolean;
  readonly permission_snapshot_sha256: string | null;
  readonly permission_revision: string | null;
  readonly issued_at: string | null;
  readonly expires_at: string | null;
  readonly evidence_unit_ref: string | null;
  readonly verified_by_role: "test_harness" | "authorized_competition_operator" | null;
}

export interface ClusterProjectionWriteTarget {
  readonly target: "clusters";
  readonly selector: Readonly<{ field: "cluster_id"; value: string }>;
  readonly expected_before_sha256: string;
  readonly expected_after_sha256: string;
  readonly patch: Readonly<{
    member_case_ids: readonly string[];
    status: "观察中";
    recurrence_records: readonly ClusterRecurrenceRecord[];
    updated_at: string;
  }>;
}

export interface ImprovementProjectionWriteTarget {
  readonly target: "improvements";
  readonly selector: Readonly<{ field: "improvement_id"; value: string }>;
  readonly expected_before_sha256: string;
  readonly expected_after_sha256: string;
  readonly patch: Readonly<{
    status: "观察中";
    day_7_result: null;
    day_30_result: null;
    human_conclusion: null;
    updated_at: string;
  }>;
}

export interface ProjectionWritePlan {
  readonly plan_contract: "w6_reopen_projection_plan.v1";
  readonly projector_key: typeof W6_REOPEN_PROJECTOR_KEY;
  readonly data_scope: "synthetic_experiment";
  readonly evidence_class: "synthetic_experiment";
  readonly source_receipt_id: string;
  readonly source_receipt_sha256: string;
  readonly projection_idempotency_key: string;
  readonly capability_attestation_id: string;
  readonly capability_attestation_sha256: string;
  readonly execution_mode: "atomic_all_targets" | "sealed_outbox_cas";
  readonly permission_snapshot_sha256: string;
  readonly permission_revision: string;
  readonly write_targets: readonly [ClusterProjectionWriteTarget, ImprovementProjectionWriteTarget];
  readonly sealed_plan_sha256: string;
}

export interface W6ReopenProjectionObserved {
  readonly projection_contract: "w6_reopen_projection_observed.v1";
  readonly data_scope: "synthetic_experiment";
  readonly evidence_class: "synthetic_experiment";
  readonly cluster: Readonly<{
    cluster_id: string;
    member_case_ids: readonly string[];
    status: "已归档" | "观察中";
    recurrence_records: readonly ClusterRecurrenceRecord[];
    updated_at: string;
  }>;
  readonly improvement: Readonly<{
    improvement_id: string;
    status: "已完成" | "观察中";
    day_7_result: string | null;
    day_30_result: string | null;
    human_conclusion: string | null;
    updated_at: string;
  }>;
}

export interface ApplyOnceProjectionExecutionDirective {
  readonly mode: "both";
  readonly sealed_plan_sha256: string;
  readonly capability_attestation_sha256: string;
  readonly permission_revision: string;
  readonly pending_targets: readonly ["clusters", "improvements"];
}

export interface ClusterRepairProjectionExecutionDirective {
  readonly mode: "cluster_only";
  readonly sealed_plan_sha256: string;
  readonly capability_attestation_sha256: string;
  readonly permission_revision: string;
  readonly pending_targets: readonly ["clusters"];
}

export interface ImprovementRepairProjectionExecutionDirective {
  readonly mode: "improvement_only";
  readonly sealed_plan_sha256: string;
  readonly capability_attestation_sha256: string;
  readonly permission_revision: string;
  readonly pending_targets: readonly ["improvements"];
}

export interface ApplyOnceRedactedProjectionArtifact {
  readonly projector_key: typeof W6_REOPEN_PROJECTOR_KEY;
  readonly data_scope: "synthetic_experiment";
  readonly evidence_class: "synthetic_experiment";
  readonly projection_idempotency_key: string;
  readonly decision: "apply_once";
  readonly cluster_id: string;
  readonly improvement_id: string;
  readonly cluster_expected_before_sha256: string;
  readonly cluster_expected_after_sha256: string;
  readonly improvement_expected_before_sha256: string;
  readonly improvement_expected_after_sha256: string;
  readonly sealed_plan_sha256: string;
  readonly write_targets: readonly ["clusters", "improvements"];
  readonly planned_target_count: 2;
  readonly repair_required: false;
  readonly repair_target: null;
  readonly redaction_status: "passed";
  readonly safe_error: null;
}

export interface RejectRedactedProjectionArtifact {
  readonly projector_key: typeof W6_REOPEN_PROJECTOR_KEY;
  readonly data_scope: "synthetic_experiment";
  readonly evidence_class: "synthetic_experiment";
  readonly projection_idempotency_key: string | null;
  readonly decision: "reject";
  readonly cluster_id: string | null;
  readonly improvement_id: string | null;
  readonly cluster_expected_before_sha256: string | null;
  readonly cluster_expected_after_sha256: string | null;
  readonly improvement_expected_before_sha256: string | null;
  readonly improvement_expected_after_sha256: string | null;
  readonly sealed_plan_sha256: string | null;
  readonly write_targets: readonly [];
  readonly planned_target_count: 0;
  readonly repair_required: false;
  readonly repair_target: null;
  readonly redaction_status: "passed";
  readonly safe_error: W6ReopenProjectionError;
}

export interface NoOpRedactedProjectionArtifact {
  readonly projector_key: typeof W6_REOPEN_PROJECTOR_KEY;
  readonly data_scope: "synthetic_experiment";
  readonly evidence_class: "synthetic_experiment";
  readonly projection_idempotency_key: null;
  readonly decision: "no_op";
  readonly cluster_id: null;
  readonly improvement_id: null;
  readonly cluster_expected_before_sha256: null;
  readonly cluster_expected_after_sha256: null;
  readonly improvement_expected_before_sha256: null;
  readonly improvement_expected_after_sha256: null;
  readonly sealed_plan_sha256: null;
  readonly write_targets: readonly [];
  readonly planned_target_count: 0;
  readonly repair_required: false;
  readonly repair_target: null;
  readonly redaction_status: "passed";
  readonly safe_error: null;
}

export interface AlreadyAppliedRedactedProjectionArtifact
  extends Omit<ApplyOnceRedactedProjectionArtifact,
    "decision" | "write_targets" | "planned_target_count"> {
  readonly decision: "already_applied";
  readonly write_targets: readonly [];
  readonly planned_target_count: 0;
}

export interface ClusterRepairRedactedProjectionArtifact
  extends Omit<ApplyOnceRedactedProjectionArtifact,
    "decision" | "write_targets" | "planned_target_count" | "repair_required" | "repair_target"> {
  readonly decision: "repair";
  readonly write_targets: readonly ["clusters"];
  readonly planned_target_count: 1;
  readonly repair_required: true;
  readonly repair_target: "clusters";
}

export interface ImprovementRepairRedactedProjectionArtifact
  extends Omit<ApplyOnceRedactedProjectionArtifact,
    "decision" | "write_targets" | "planned_target_count" | "repair_required" | "repair_target"> {
  readonly decision: "repair";
  readonly write_targets: readonly ["improvements"];
  readonly planned_target_count: 1;
  readonly repair_required: true;
  readonly repair_target: "improvements";
}

export type RedactedProjectionArtifact =
  | ApplyOnceRedactedProjectionArtifact
  | AlreadyAppliedRedactedProjectionArtifact
  | ClusterRepairRedactedProjectionArtifact
  | ImprovementRepairRedactedProjectionArtifact
  | NoOpRedactedProjectionArtifact
  | RejectRedactedProjectionArtifact;

export type FeishuW6ReopenProjectionTrigger =
  | Readonly<{
      kind: "committed_new_reopen";
      receipt_id: string;
      data_scope: "synthetic_experiment";
      evidence_class: "synthetic_experiment";
    }>
  | Readonly<{
      kind: "authorized_exact_replay";
      data_scope: "synthetic_experiment";
      evidence_class: "synthetic_experiment";
    }>
  | Readonly<{
      kind: "authorized_near_conflict";
      data_scope: "synthetic_experiment";
      evidence_class: "synthetic_experiment";
    }>;

export interface W6ReopenCommitSourcePort {
  loadFirstCommittedReopenByReceiptId(receiptId: string): Promise<unknown>;
}

export interface W6ReopenProjectionBasePort {
  loadProjectionStateByBusinessKeys(input: Readonly<{
    cluster_id: string;
    improvement_id: string;
  }>): Promise<unknown>;
}

export interface W6ReopenProjectionCapabilityPort {
  loadCurrentAttestation(): Promise<unknown>;
  revalidatePermissionRevision(input: Readonly<{
    attestation_id: string;
    permission_revision: string;
    permission_snapshot_sha256: string;
    checked_at: string;
  }>): Promise<boolean>;
}

export interface W6ReopenProjectionTrustedClockPort {
  nowIsoUtc(): string;
}

export type ProjectionOutboxLookup =
  | Readonly<{ outcome: "not_found" }>
  | Readonly<{ outcome: "found"; plan: ProjectionWritePlan }>;

export type ProjectionOutboxSealResult =
  | Readonly<{ outcome: "sealed"; plan: ProjectionWritePlan }>
  | Readonly<{ outcome: "existing_same"; plan: ProjectionWritePlan }>
  | Readonly<{ outcome: "receipt_conflict" }>
  | Readonly<{ outcome: "digest_conflict" }>
  | Readonly<{ outcome: "plan_conflict" }>;

export interface TrustedProjectionExecutionEvidence {
  readonly evidence_contract: "w6_reopen_projection_execution_evidence.v1";
  readonly source_receipt_id: string;
  readonly source_receipt_sha256: string;
  readonly sealed_plan_sha256: string;
  readonly capability_attestation_id: string;
  readonly capability_attestation_sha256: string;
  readonly capability_rechecked_at: string;
  readonly execution_mode: "atomic_all_targets" | "sealed_outbox_cas";
  readonly permission_snapshot_sha256: string;
  readonly permission_revision: string;
  readonly exact_plan_material_match: true;
  readonly acknowledged_target_count: 0 | 1 | 2;
  readonly target_acks: readonly Readonly<{
    target: "clusters" | "improvements";
    expected_after_sha256: string;
    applied_by_sealed_plan_sha256: string;
    capability_attestation_sha256: string;
    capability_rechecked_at: string;
    permission_snapshot_sha256: string;
    permission_revision: string;
    resolved_record_locator_sha256: string;
  }>[];
}

export interface W6ReopenProjectionOutboxPort {
  loadByReceiptId(receiptId: string): Promise<ProjectionOutboxLookup>;
  sealPlanIfAbsent(input: Readonly<{
    plan: ProjectionWritePlan;
    canonical_receipt_material: JsonValue;
  }>): Promise<ProjectionOutboxSealResult>;
  loadExecutionEvidence(
    sealedPlanSha256: string,
  ): Promise<TrustedProjectionExecutionEvidence | null>;
}

export interface W6ReopenProjectionCompositionPorts {
  readonly source: W6ReopenCommitSourcePort;
  readonly base: W6ReopenProjectionBasePort;
  readonly capability: W6ReopenProjectionCapabilityPort;
  readonly clock: W6ReopenProjectionTrustedClockPort;
  readonly outbox: W6ReopenProjectionOutboxPort;
}

export interface W6ReopenProjectionComposition {
  handle(trigger: FeishuW6ReopenProjectionTrigger): Promise<RedactedProjectionArtifact>;
}

export interface W6ReopenProjectionCompositionTestOptions {
  readonly hashJsonValue: W6ReopenProjectionHasher;
  readonly artifactFault?: (artifact: RedactedProjectionArtifact) => unknown;
  readonly additionalSensitiveValues?: readonly string[];
}

export type W6G3ProjectionResult =
  | Readonly<{
      decision: "apply_once";
      plan: ProjectionWritePlan;
      execution: ApplyOnceProjectionExecutionDirective;
      artifact: ApplyOnceRedactedProjectionArtifact;
    }>
  | Readonly<{
      decision: "reject";
      plan: null;
      execution: null;
      artifact: RejectRedactedProjectionArtifact;
    }>;

export type W6ReopenProjectionReconcileResult =
  | W6G3ProjectionResult
  | Readonly<{
      decision: "already_applied";
      plan: null;
      execution: null;
      artifact: AlreadyAppliedRedactedProjectionArtifact;
    }>
  | Readonly<{
      decision: "repair";
      plan: ProjectionWritePlan;
      execution: ClusterRepairProjectionExecutionDirective;
      artifact: ClusterRepairRedactedProjectionArtifact;
    }>
  | Readonly<{
      decision: "repair";
      plan: ProjectionWritePlan;
      execution: ImprovementRepairProjectionExecutionDirective;
      artifact: ImprovementRepairRedactedProjectionArtifact;
    }>;

type JsonObject = { [key: string]: JsonValue };

interface SnapshotState {
  nodes: number;
  readonly ancestors: WeakSet<object>;
}

const PROOF_KEYS = [
  "outcome",
  "receipt",
  "history_entries",
  "observation_cycles",
  "cluster_after",
  "improvement_after",
] as const;

const RECEIPT_KEYS = [
  "receipt_id",
  "event_id",
  "phase",
  "action",
  "case_ids",
  "cluster_id",
  "improvement_id",
  "target_fingerprint",
  "command_fingerprint",
  "history_id",
  "cycle_id",
  "checkpoint_id",
  "state_fingerprint",
  "committed_at",
] as const;

const HISTORY_ENTRY_KEYS = [
  "history_id",
  "event_id",
  "phase",
  "action",
  "case_ids",
  "cluster_id",
  "improvement_id",
  "cycle_id",
  "previous_cluster_status",
  "next_cluster_status",
  "previous_improvement_status",
  "next_improvement_status",
  "reason",
  "principal",
  "authorization_policy_version",
  "occurred_at",
] as const;

const OBSERVATION_CYCLE_KEYS = [
  "cycle_id",
  "cluster_id",
  "improvement_id",
  "ordinal",
  "trigger",
  "triggering_case_ids",
  "triggering_case_snapshots",
  "clock_source",
  "opened_at",
  "opened_by",
  "authorization_policy_version",
] as const;

const PRINCIPAL_KEYS = [
  "principal_id",
  "principal_type",
  "canonical_role",
  "authority_source",
] as const;

const MEMBERSHIP_SNAPSHOT_KEYS = [
  "case_id",
  "case_fingerprint",
  "work_order_id",
  "work_order_fingerprint",
  "w5_closure_fingerprint",
  "feedback_links",
] as const;

const FEEDBACK_LINK_KEYS = ["feedback_id", "feedback_fingerprint"] as const;

const ROOT_CAUSE_HYPOTHESIS_KEYS = [
  "hypothesis_id",
  "node_run_id",
  "node_version",
  "input_hash",
  "statement",
  "supporting_evidence",
  "counter_evidence",
  "uncertainties",
  "final_root_cause",
] as const;

const EVIDENCE_SPAN_REQUIRED_KEYS = ["source_ref", "quote"] as const;
const EVIDENCE_SPAN_ALLOWED_KEYS = [
  ...EVIDENCE_SPAN_REQUIRED_KEYS,
  "start_offset",
  "end_offset",
] as const;

const CLUSTER_AFTER_KEYS = [
  "schema_version",
  "data_scope",
  "evidence_class",
  "source_kind",
  "source_name",
  "source_locator",
  "source_sha256",
  "cluster_id",
  "name",
  "category_domain",
  "member_case_ids",
  "clustering_mode",
  "clustering_version",
  "proposal_id",
  "root_cause_hypothesis",
  "active_improvement_id",
  "recurrence_count",
  "status",
  "created_at",
  "updated_at",
] as const;

const IMPROVEMENT_AFTER_KEYS = [
  "schema_version",
  "data_scope",
  "evidence_class",
  "source_kind",
  "source_name",
  "source_locator",
  "source_sha256",
  "improvement_id",
  "cluster_id",
  "version",
  "owner_role",
  "measure",
  "observation_window_days",
  "clock_source",
  "metric_formula",
  "current_observation_cycle_id",
  "human_conclusion",
  "status",
  "created_at",
  "updated_at",
] as const;

const W6_PHASES = new Set(["cluster_review", "improvement", "observation", "recurrence"]);
const W6_ACTIONS = new Set([
  "create_cluster_candidate",
  "review_candidate",
  "start_improvement",
  "enter_observation",
  "record_day_7",
  "record_day_30",
  "archive_observation",
  "reopen_recurrence",
  "intake_active_observation_recurrence",
]);
const CLOCK_SOURCES = new Set(["real", "test", "synthetic_history"]);
const ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/u;
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const ISO_UTC_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;

function fail(error: W6ReopenProjectionError): never {
  throw new W6ReopenProjectionFailure(error);
}

function unicodeScalarLength(value: string): number | null {
  let count = 0;
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      if (index + 1 >= value.length) return null;
      const next = value.charCodeAt(index + 1);
      if (next < 0xdc00 || next > 0xdfff) return null;
      index += 1;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {
      return null;
    }
    count += 1;
  }
  return count;
}

function validateString(value: string, maxScalars: number): void {
  const scalarLength = unicodeScalarLength(value);
  if (scalarLength === null || scalarLength > maxScalars) {
    fail("invalid_projection_input");
  }
}

function cloneDescriptorSafe(value: unknown, depth: number, state: SnapshotState): JsonValue {
  if (depth > W6_REOPEN_SNAPSHOT_LIMITS.max_depth) fail("invalid_projection_input");
  state.nodes += 1;
  if (state.nodes > W6_REOPEN_SNAPSHOT_LIMITS.max_nodes) fail("invalid_projection_input");

  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "string") {
    validateString(value, W6_REOPEN_SNAPSHOT_LIMITS.max_text_scalars);
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value) || Object.is(value, -0)) fail("invalid_projection_input");
    return value;
  }
  if ((typeof value !== "object" && typeof value !== "function") || value === null) {
    fail("invalid_projection_input");
  }
  if (utilTypes.isProxy(value)) fail("invalid_projection_input");
  if (typeof value === "function") fail("invalid_projection_input");
  if (state.ancestors.has(value)) fail("invalid_projection_input");

  state.ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      if (Object.getPrototypeOf(value) !== Array.prototype) fail("invalid_projection_input");
      const ownKeys = Reflect.ownKeys(value);
      if (ownKeys.some((key) => typeof key === "symbol")) fail("invalid_projection_input");
      const lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length");
      if (
        !lengthDescriptor ||
        !("value" in lengthDescriptor) ||
        !Number.isSafeInteger(lengthDescriptor.value) ||
        lengthDescriptor.value < 0 ||
        lengthDescriptor.value > W6_REOPEN_SNAPSHOT_LIMITS.max_array_length
      ) {
        fail("invalid_projection_input");
      }
      const length = lengthDescriptor.value;
      if (ownKeys.length !== length + 1) fail("invalid_projection_input");
      const output: JsonValue[] = new Array(length);
      for (let index = 0; index < length; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
        if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) {
          fail("invalid_projection_input");
        }
        output[index] = cloneDescriptorSafe(descriptor.value, depth + 1, state);
      }
      for (const key of ownKeys) {
        if (key === "length") continue;
        const index = Number(key);
        if (!Number.isInteger(index) || index < 0 || index >= length || String(index) !== key) {
          fail("invalid_projection_input");
        }
      }
      Object.freeze(output);
      return output;
    }

    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) fail("invalid_projection_input");
    const output: JsonObject = Object.create(null) as JsonObject;
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== "string") fail("invalid_projection_input");
      validateString(key, W6_REOPEN_SNAPSHOT_LIMITS.max_property_name_scalars);
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) {
        fail("invalid_projection_input");
      }
      Object.defineProperty(output, key, {
        value: cloneDescriptorSafe(descriptor.value, depth + 1, state),
        enumerable: true,
        configurable: false,
        writable: false,
      });
    }
    return Object.freeze(output);
  } finally {
    state.ancestors.delete(value);
  }
}

export function snapshotDescriptorSafeJsonValue(value: unknown): JsonValue {
  const snapshot = cloneDescriptorSafe(value, 0, {
    nodes: 0,
    ancestors: new WeakSet<object>(),
  });
  const serialized = JSON.stringify(snapshot);
  if (Buffer.byteLength(serialized, "utf8") > W6_REOPEN_SNAPSHOT_LIMITS.max_utf8_bytes) {
    fail("invalid_projection_input");
  }
  return snapshot;
}

export function isW6ReopenProjectionId(value: unknown): value is string {
  return typeof value === "string" && ID_PATTERN.test(value);
}

function isJsonObject(value: JsonValue): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requireObject(value: JsonValue): JsonObject {
  if (!isJsonObject(value)) fail("invalid_projection_input");
  return value;
}

function requireArray(value: JsonValue): JsonValue[] {
  if (!Array.isArray(value)) fail("invalid_projection_input");
  return value;
}

function requireExactKeys(record: JsonObject, expectedKeys: readonly string[]): void {
  const keys = Object.keys(record);
  if (keys.length !== expectedKeys.length || expectedKeys.some((key) => !Object.hasOwn(record, key))) {
    fail("invalid_projection_input");
  }
}

function requireId(value: JsonValue): string {
  if (!isW6ReopenProjectionId(value)) fail("invalid_projection_input");
  return value;
}

function requireNonEmptyString(value: JsonValue): string {
  if (typeof value !== "string" || value.length === 0) fail("invalid_projection_input");
  return value;
}

function requireTrimmedNonEmptyString(value: JsonValue): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    fail("invalid_projection_input");
  }
  return value;
}

function requireSha256(value: JsonValue): string {
  if (typeof value !== "string" || !SHA256_PATTERN.test(value)) fail("invalid_projection_input");
  return value;
}

function requireTimestamp(value: JsonValue): string {
  if (
    typeof value !== "string" ||
    !ISO_UTC_PATTERN.test(value) ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString() !== value
  ) {
    fail("invalid_projection_input");
  }
  return value;
}

function requireUniqueIds(value: JsonValue, allowEmpty = false): string[] {
  const values = requireArray(value).map(requireId);
  if ((!allowEmpty && values.length === 0) || new Set(values).size !== values.length) {
    fail("invalid_projection_input");
  }
  return values;
}

function sameJson(left: JsonValue, right: JsonValue): boolean {
  if (left === right) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((entry, index) => sameJson(entry, right[index]));
  }
  if (!isJsonObject(left) || !isJsonObject(right)) return false;
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  return leftKeys.length === rightKeys.length &&
    leftKeys.every((key) => Object.hasOwn(right, key) && sameJson(left[key], right[key]));
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function isOrderedSubsequence(
  sealedMemberCaseIds: readonly string[],
  triggeringCaseIds: readonly string[],
): boolean {
  let triggerIndex = 0;
  for (const memberCaseId of sealedMemberCaseIds) {
    if (memberCaseId === triggeringCaseIds[triggerIndex]) triggerIndex += 1;
  }
  return triggerIndex === triggeringCaseIds.length;
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function clonePlainJsonValue(value: JsonValue): JsonValue {
  if (Array.isArray(value)) return value.map(clonePlainJsonValue);
  if (isJsonObject(value)) {
      const output: JsonObject = {};
      for (const [key, child] of Object.entries(value)) {
        Object.defineProperty(output, key, {
          value: clonePlainJsonValue(child),
          enumerable: true,
          writable: true,
          configurable: true,
        });
      }
    return output;
  }
  return value;
}

function validatePrincipal(value: JsonValue): JsonObject {
  const record = requireObject(value);
  requireExactKeys(record, PRINCIPAL_KEYS);
  requireId(record.principal_id);
  if (record.principal_type !== "synthetic_human") fail("invalid_projection_input");
  requireNonEmptyString(record.canonical_role);
  if (record.authority_source !== "synthetic_allowlist") fail("invalid_projection_input");
  return record;
}

function validateMembershipSnapshot(value: JsonValue): JsonObject {
  const record = requireObject(value);
  requireExactKeys(record, MEMBERSHIP_SNAPSHOT_KEYS);
  requireId(record.case_id);
  requireSha256(record.case_fingerprint);
  requireId(record.work_order_id);
  requireSha256(record.work_order_fingerprint);
  requireSha256(record.w5_closure_fingerprint);
  const feedbackIds = new Set<string>();
  for (const linkValue of requireArray(record.feedback_links)) {
    const link = requireObject(linkValue);
    requireExactKeys(link, FEEDBACK_LINK_KEYS);
    const feedbackId = requireId(link.feedback_id);
    if (feedbackIds.has(feedbackId)) fail("invalid_projection_input");
    feedbackIds.add(feedbackId);
    requireSha256(link.feedback_fingerprint);
  }
  return record;
}

function validateEvidenceSpan(value: JsonValue): JsonObject {
  const record = requireObject(value);
  const keys = Object.keys(record);
  if (
    EVIDENCE_SPAN_REQUIRED_KEYS.some((key) => !Object.hasOwn(record, key)) ||
    keys.some((key) => !EVIDENCE_SPAN_ALLOWED_KEYS.includes(
      key as (typeof EVIDENCE_SPAN_ALLOWED_KEYS)[number],
    ))
  ) {
    fail("invalid_projection_input");
  }
  requireTrimmedNonEmptyString(record.source_ref);
  requireTrimmedNonEmptyString(record.quote);
  const startOffset = Object.hasOwn(record, "start_offset") ? record.start_offset : undefined;
  const endOffset = Object.hasOwn(record, "end_offset") ? record.end_offset : undefined;
  if (
    (
      startOffset !== undefined &&
      (typeof startOffset !== "number" || !Number.isSafeInteger(startOffset) || startOffset < 0)
    ) ||
    (
      endOffset !== undefined &&
      (typeof endOffset !== "number" || !Number.isSafeInteger(endOffset) || endOffset < 0)
    ) ||
    (
      typeof startOffset === "number" &&
      typeof endOffset === "number" &&
      endOffset < startOffset
    )
  ) {
    fail("invalid_projection_input");
  }
  return record;
}

function validateRootCauseHypothesis(value: JsonValue): JsonObject {
  const record = requireObject(value);
  requireExactKeys(record, ROOT_CAUSE_HYPOTHESIS_KEYS);
  requireTrimmedNonEmptyString(record.hypothesis_id);
  requireTrimmedNonEmptyString(record.node_run_id);
  if (record.node_version !== "N6-root-cause-1.0.0-draft.3") {
    fail("invalid_projection_input");
  }
  requireSha256(record.input_hash);
  requireTrimmedNonEmptyString(record.statement);
  const supportingEvidence = requireArray(record.supporting_evidence).map(validateEvidenceSpan);
  const counterEvidence = requireArray(record.counter_evidence).map(validateEvidenceSpan);
  const uncertainties = requireArray(record.uncertainties);
  if (
    supportingEvidence.length < 2 ||
    counterEvidence.length < 1 ||
    uncertainties.length < 1
  ) {
    fail("invalid_projection_input");
  }
  uncertainties.forEach(requireTrimmedNonEmptyString);
  if (record.final_root_cause !== false) fail("invalid_projection_input");
  return record;
}

function validateObservationCycle(value: JsonValue): JsonObject {
  const record = requireObject(value);
  requireExactKeys(record, OBSERVATION_CYCLE_KEYS);
  requireId(record.cycle_id);
  requireId(record.cluster_id);
  requireId(record.improvement_id);
  if (!Number.isSafeInteger(record.ordinal) || (record.ordinal as number) < 1) {
    fail("invalid_projection_input");
  }
  if (record.trigger !== "recurrence_reopen") fail("invalid_projection_input");
  const triggeringIds = requireUniqueIds(record.triggering_case_ids);
  const snapshots = requireArray(record.triggering_case_snapshots).map(validateMembershipSnapshot);
  if (
    snapshots.length !== triggeringIds.length ||
    snapshots.some((snapshot, index) => snapshot.case_id !== triggeringIds[index])
  ) {
    fail("commit_proof_mismatch");
  }
  if (typeof record.clock_source !== "string" || !CLOCK_SOURCES.has(record.clock_source)) {
    fail("invalid_projection_input");
  }
  requireTimestamp(record.opened_at);
  validatePrincipal(record.opened_by);
  requireNonEmptyString(record.authorization_policy_version);
  return record;
}

function validateHistoryEntry(value: JsonValue): JsonObject {
  const record = requireObject(value);
  requireExactKeys(record, HISTORY_ENTRY_KEYS);
  requireId(record.history_id);
  requireId(record.event_id);
  if (record.phase !== "recurrence" || record.action !== "reopen_recurrence") {
    fail("invalid_projection_input");
  }
  requireUniqueIds(record.case_ids);
  requireId(record.cluster_id);
  requireId(record.improvement_id);
  requireId(record.cycle_id);
  if (
    record.previous_cluster_status !== "已归档" ||
    record.next_cluster_status !== "观察中" ||
    record.previous_improvement_status !== "已完成" ||
    record.next_improvement_status !== "观察中"
  ) {
    fail("commit_proof_mismatch");
  }
  requireNonEmptyString(record.reason);
  validatePrincipal(record.principal);
  requireNonEmptyString(record.authorization_policy_version);
  requireTimestamp(record.occurred_at);
  return record;
}

function validateReceiptShape(value: JsonValue): JsonObject {
  const record = requireObject(value);
  requireExactKeys(record, RECEIPT_KEYS);
  requireId(record.receipt_id);
  requireId(record.event_id);
  if (typeof record.phase !== "string" || !W6_PHASES.has(record.phase)) {
    fail("invalid_projection_input");
  }
  if (typeof record.action !== "string" || !W6_ACTIONS.has(record.action)) {
    fail("invalid_projection_input");
  }
  requireUniqueIds(record.case_ids);
  requireId(record.cluster_id);
  if (record.improvement_id !== null) requireId(record.improvement_id);
  if (record.target_fingerprint !== null) requireSha256(record.target_fingerprint);
  requireSha256(record.command_fingerprint);
  requireId(record.history_id);
  if (record.cycle_id !== null) requireId(record.cycle_id);
  if (record.checkpoint_id !== null) requireId(record.checkpoint_id);
  requireSha256(record.state_fingerprint);
  requireTimestamp(record.committed_at);
  return record;
}

function requireReopenReceipt(record: JsonObject, error: W6ReopenProjectionError): void {
  if (
    record.phase !== "recurrence" ||
    record.action !== "reopen_recurrence" ||
    record.improvement_id === null ||
    record.target_fingerprint === null ||
    record.cycle_id === null ||
    record.checkpoint_id !== null
  ) {
    fail(error);
  }
}

function validateClusterAfter(value: JsonValue): JsonObject {
  const record = requireObject(value);
  requireExactKeys(record, CLUSTER_AFTER_KEYS);
  if (
    record.schema_version !== "1.0.0-draft.2" ||
    record.data_scope !== "synthetic_experiment" ||
    record.evidence_class !== "synthetic_experiment" ||
    record.source_kind !== "scenario_runtime" ||
    record.source_name !== "synthetic_experiment" ||
    record.clustering_mode !== "cross_event" ||
    record.clustering_version !== "N5-cross-event-1.0.0-draft.2"
  ) {
    fail("invalid_projection_input");
  }
  if (record.status !== "观察中") fail("commit_proof_mismatch");
  requireNonEmptyString(record.source_locator);
  requireSha256(record.source_sha256);
  requireId(record.cluster_id);
  requireNonEmptyString(record.name);
  requireNonEmptyString(record.category_domain);
  requireUniqueIds(record.member_case_ids);
  requireId(record.proposal_id);
  if (record.root_cause_hypothesis !== null) {
    validateRootCauseHypothesis(record.root_cause_hypothesis);
  }
  requireId(record.active_improvement_id);
  if (!Number.isSafeInteger(record.recurrence_count) || (record.recurrence_count as number) < 0) {
    fail("invalid_projection_input");
  }
  requireTimestamp(record.created_at);
  requireTimestamp(record.updated_at);
  return record;
}

function validateImprovementAfter(value: JsonValue): JsonObject {
  const record = requireObject(value);
  requireExactKeys(record, IMPROVEMENT_AFTER_KEYS);
  if (
    record.schema_version !== "1.0.0-draft.2" ||
    record.data_scope !== "synthetic_experiment" ||
    record.evidence_class !== "synthetic_experiment" ||
    record.source_kind !== "scenario_runtime" ||
    record.source_name !== "synthetic_experiment"
  ) {
    fail("invalid_projection_input");
  }
  if (record.status !== "观察中" || record.human_conclusion !== null) {
    fail("commit_proof_mismatch");
  }
  requireNonEmptyString(record.source_locator);
  requireSha256(record.source_sha256);
  requireId(record.improvement_id);
  requireId(record.cluster_id);
  requireNonEmptyString(record.version);
  requireNonEmptyString(record.owner_role);
  requireNonEmptyString(record.measure);
  const observationWindow = requireArray(record.observation_window_days);
  if (observationWindow.length !== 2 || observationWindow[0] !== 7 || observationWindow[1] !== 30) {
    fail("invalid_projection_input");
  }
  if (typeof record.clock_source !== "string" || !CLOCK_SOURCES.has(record.clock_source)) {
    fail("invalid_projection_input");
  }
  requireNonEmptyString(record.metric_formula);
  requireId(record.current_observation_cycle_id);
  requireTimestamp(record.created_at);
  requireTimestamp(record.updated_at);
  return record;
}

function hashValidatedReceipt(
  receipt: JsonObject,
  hashJsonValue: W6ReopenProjectionHasher,
): string {
  const preimage = deepFreeze({
    contract: W6_REOPEN_RECEIPT_HASH_CONTRACT,
    receipt,
  }) as JsonValue;
  let digest: string;
  try {
    digest = hashJsonValue(preimage);
  } catch {
    fail("projection_dependency_failure");
  }
  if (typeof digest !== "string" || !SHA256_PATTERN.test(digest)) {
    fail("projection_dependency_failure");
  }
  return digest;
}

export function hashW6ReopenCommitReceipt(
  receipt: unknown,
  hashJsonValue: W6ReopenProjectionHasher = createWorkflowEventFingerprint,
): string {
  const canonicalReceipt = validateReceiptShape(snapshotDescriptorSafeJsonValue(receipt));
  requireReopenReceipt(canonicalReceipt, "invalid_projection_input");
  return hashValidatedReceipt(canonicalReceipt, hashJsonValue);
}

function selectById(
  values: JsonValue,
  key: string,
  expectedId: string,
): JsonValue {
  const records = requireArray(values);
  if (records.length === 0) fail("unverified_commit");
  const matches = records.filter((value) => {
    const record = requireObject(value);
    return record[key] === expectedId;
  });
  if (matches.length !== 1) fail("commit_proof_mismatch");
  return matches[0];
}

export function verifyW6ReopenCommitProof(
  proof: unknown,
  expectedReceiptId: string,
  hashJsonValue: W6ReopenProjectionHasher = createWorkflowEventFingerprint,
): PrivateVerifiedW6ReopenCommitEnvelope {
  if (!isW6ReopenProjectionId(expectedReceiptId)) fail("invalid_projection_input");
  const root = requireObject(snapshotDescriptorSafeJsonValue(proof));
  const rootKeys = Object.keys(root);
  if (
    rootKeys.some((key) => !PROOF_KEYS.some((expectedKey) => expectedKey === key)) ||
    ["outcome", "receipt", "history_entries", "observation_cycles"].some(
      (key) => !Object.hasOwn(root, key),
    )
  ) {
    fail("invalid_projection_input");
  }
  if (
    !Object.hasOwn(root, "cluster_after") ||
    root.cluster_after === null ||
    !Object.hasOwn(root, "improvement_after") ||
    root.improvement_after === null
  ) {
    fail("unverified_commit");
  }
  requireExactKeys(root, PROOF_KEYS);
  if (root.outcome !== "committed") fail("unverified_commit");

  const receipt = validateReceiptShape(root.receipt);
  requireReopenReceipt(receipt, "unverified_commit");
  if (receipt.receipt_id !== expectedReceiptId) fail("commit_proof_mismatch");

  const historyEntry = validateHistoryEntry(
    selectById(root.history_entries, "history_id", receipt.history_id as string),
  );
  const observationCycle = validateObservationCycle(
    selectById(root.observation_cycles, "cycle_id", receipt.cycle_id as string),
  );
  const clusterAfter = validateClusterAfter(root.cluster_after);
  const improvementAfter = validateImprovementAfter(root.improvement_after);
  const receiptCaseIds = requireUniqueIds(receipt.case_ids);
  const historyCaseIds = requireUniqueIds(historyEntry.case_ids);
  const clusterCaseIds = requireUniqueIds(clusterAfter.member_case_ids);
  const triggeringCaseIds = requireUniqueIds(observationCycle.triggering_case_ids);

  const proofMismatch =
    historyEntry.event_id !== receipt.event_id ||
    historyEntry.phase !== receipt.phase ||
    historyEntry.action !== receipt.action ||
    historyEntry.cluster_id !== receipt.cluster_id ||
    historyEntry.improvement_id !== receipt.improvement_id ||
    historyEntry.cycle_id !== receipt.cycle_id ||
    historyEntry.occurred_at !== receipt.committed_at ||
    !sameStrings(historyCaseIds, receiptCaseIds) ||
    observationCycle.cluster_id !== receipt.cluster_id ||
    observationCycle.improvement_id !== receipt.improvement_id ||
    observationCycle.cycle_id !== receipt.cycle_id ||
    observationCycle.opened_at !== receipt.committed_at ||
    !sameJson(historyEntry.principal, observationCycle.opened_by) ||
    historyEntry.authorization_policy_version !== observationCycle.authorization_policy_version ||
    clusterAfter.cluster_id !== receipt.cluster_id ||
    clusterAfter.active_improvement_id !== receipt.improvement_id ||
    clusterAfter.updated_at !== receipt.committed_at ||
    !sameStrings(clusterCaseIds, receiptCaseIds) ||
    improvementAfter.improvement_id !== receipt.improvement_id ||
    improvementAfter.cluster_id !== receipt.cluster_id ||
    improvementAfter.current_observation_cycle_id !== receipt.cycle_id ||
    improvementAfter.updated_at !== receipt.committed_at ||
    !isOrderedSubsequence(clusterCaseIds, triggeringCaseIds);
  if (proofMismatch) fail("commit_proof_mismatch");

  const sourceReceiptSha256 = hashValidatedReceipt(receipt, hashJsonValue);
  const projectionSource: VerifiedW6ReopenProjectionSource = deepFreeze({
    source_contract: W6_REOPEN_SOURCE_CONTRACT,
    data_scope: "synthetic_experiment",
    evidence_class: "synthetic_experiment",
    source_receipt_id: receipt.receipt_id as string,
    source_receipt_sha256: sourceReceiptSha256,
    committed_at: receipt.committed_at as string,
    triggering_case_ids: [...triggeringCaseIds],
    cluster_after: {
      cluster_id: clusterAfter.cluster_id as string,
      member_case_ids: [...clusterCaseIds],
      status: "观察中",
      updated_at: clusterAfter.updated_at as string,
    },
    improvement_after: {
      improvement_id: improvementAfter.improvement_id as string,
      status: "观察中",
      updated_at: improvementAfter.updated_at as string,
    },
  });
  return deepFreeze({
    projection_source: projectionSource,
    canonical_receipt_material: receipt,
  });
}

const PROJECTION_SOURCE_KEYS = [
  "source_contract",
  "data_scope",
  "evidence_class",
  "source_receipt_id",
  "source_receipt_sha256",
  "committed_at",
  "triggering_case_ids",
  "cluster_after",
  "improvement_after",
] as const;
const PROJECTION_SOURCE_CLUSTER_KEYS = [
  "cluster_id",
  "member_case_ids",
  "status",
  "updated_at",
] as const;
const PROJECTION_SOURCE_IMPROVEMENT_KEYS = [
  "improvement_id",
  "status",
  "updated_at",
] as const;
const PROJECTION_BEFORE_KEYS = [
  "projection_contract",
  "data_scope",
  "evidence_class",
  "cluster",
  "improvement",
] as const;
const PROJECTION_BEFORE_CLUSTER_KEYS = [
  "cluster_id",
  "member_case_ids",
  "status",
  "recurrence_records",
  "updated_at",
] as const;
const PROJECTION_BEFORE_IMPROVEMENT_KEYS = [
  "improvement_id",
  "status",
  "day_7_result",
  "day_30_result",
  "human_conclusion",
  "updated_at",
] as const;
const REOPEN_SNAPSHOT_KEYS = [
  "projection_contract",
  "data_scope",
  "evidence_class",
  "source_receipt_sha256",
  "projection_idempotency_key",
  "committed_at",
  "previous_projection",
  "previous_projection_sha256",
] as const;
const PREVIOUS_PROJECTION_KEYS = [
  "day_7_result",
  "day_30_result",
  "human_conclusion",
] as const;
const CAPABILITY_KEYS = [
  "attestation_contract",
  "attestation_id",
  "data_scope",
  "evidence_class",
  "verification_status",
  "execution_mode",
  "recurrence_visibility_no_broader_than_source_fields",
  "permission_snapshot_sha256",
  "permission_revision",
  "issued_at",
  "expires_at",
  "evidence_unit_ref",
  "verified_by_role",
] as const;
const APPLY_ARTIFACT_KEYS = [
  "projector_key",
  "data_scope",
  "evidence_class",
  "projection_idempotency_key",
  "decision",
  "cluster_id",
  "improvement_id",
  "cluster_expected_before_sha256",
  "cluster_expected_after_sha256",
  "improvement_expected_before_sha256",
  "improvement_expected_after_sha256",
  "sealed_plan_sha256",
  "write_targets",
  "planned_target_count",
  "repair_required",
  "repair_target",
  "redaction_status",
  "safe_error",
] as const;

interface ValidatedProjectionSource {
  readonly sourceReceiptId: string;
  readonly sourceReceiptSha256: string;
  readonly committedAt: string;
  readonly triggeringCaseIds: string[];
  readonly clusterId: string;
  readonly memberCaseIds: string[];
  readonly improvementId: string;
}

interface ValidatedProjectionBefore {
  readonly clusterId: string;
  readonly memberCaseIds: string[];
  readonly recurrenceRecords: JsonObject[];
  readonly clusterUpdatedAt: string;
  readonly improvementId: string;
  readonly day7Result: string;
  readonly day30Result: string;
  readonly humanConclusion: string;
  readonly improvementUpdatedAt: string;
}

interface ValidatedProjectionObserved {
  readonly clusterId: string;
  readonly memberCaseIds: string[];
  readonly clusterStatus: "已归档" | "观察中";
  readonly recurrenceRecords: JsonObject[];
  readonly clusterUpdatedAt: string;
  readonly improvementId: string;
  readonly improvementStatus: "已完成" | "观察中";
  readonly day7Result: string | null;
  readonly day30Result: string | null;
  readonly humanConclusion: string | null;
  readonly improvementUpdatedAt: string;
}

interface ValidatedCapability {
  readonly record: JsonObject;
  readonly attestationId: string;
  readonly executionMode: "atomic_all_targets" | "sealed_outbox_cas" | "insufficient";
  readonly visibilityIsSufficient: boolean;
  readonly permissionSnapshotSha256: string | null;
  readonly permissionRevision: string | null;
  readonly issuedAt: string | null;
  readonly expiresAt: string | null;
}

function requireProjectionText(value: JsonValue): string {
  if (typeof value !== "string") fail("invalid_projection_input");
  const length = unicodeScalarLength(value);
  if (length === null || length < 1 || length > 4_096) fail("invalid_projection_input");
  return value;
}

function requireNullableString(value: JsonValue): string | null {
  if (value === null) return null;
  return requireNonEmptyString(value);
}

function requireNullableSha256(value: JsonValue): string | null {
  if (value === null) return null;
  return requireSha256(value);
}

function requireNullableTimestamp(value: JsonValue): string | null {
  if (value === null) return null;
  return requireTimestamp(value);
}

function validateProjectionSource(value: JsonValue): ValidatedProjectionSource {
  const source = requireObject(value);
  requireExactKeys(source, PROJECTION_SOURCE_KEYS);
  if (
    source.source_contract !== W6_REOPEN_SOURCE_CONTRACT ||
    source.data_scope !== "synthetic_experiment" ||
    source.evidence_class !== "synthetic_experiment"
  ) {
    fail("invalid_projection_input");
  }
  const sourceReceiptId = requireId(source.source_receipt_id);
  const sourceReceiptSha256 = requireSha256(source.source_receipt_sha256);
  const committedAt = requireTimestamp(source.committed_at);
  const triggeringCaseIds = requireUniqueIds(source.triggering_case_ids);

  const cluster = requireObject(source.cluster_after);
  requireExactKeys(cluster, PROJECTION_SOURCE_CLUSTER_KEYS);
  const clusterId = requireId(cluster.cluster_id);
  const memberCaseIds = requireUniqueIds(cluster.member_case_ids);
  if (cluster.status !== "观察中") fail("invalid_projection_input");
  const clusterUpdatedAt = requireTimestamp(cluster.updated_at);

  const improvement = requireObject(source.improvement_after);
  requireExactKeys(improvement, PROJECTION_SOURCE_IMPROVEMENT_KEYS);
  const improvementId = requireId(improvement.improvement_id);
  if (improvement.status !== "观察中") fail("invalid_projection_input");
  const improvementUpdatedAt = requireTimestamp(improvement.updated_at);
  if (clusterUpdatedAt !== committedAt || improvementUpdatedAt !== committedAt) {
    fail("commit_proof_mismatch");
  }
  return {
    sourceReceiptId,
    sourceReceiptSha256,
    committedAt,
    triggeringCaseIds,
    clusterId,
    memberCaseIds,
    improvementId,
  };
}

function validateReopenSnapshot(record: JsonObject): void {
  requireExactKeys(record, REOPEN_SNAPSHOT_KEYS);
  if (
    record.projection_contract !== "reopen_snapshot.v1" ||
    record.data_scope !== "synthetic_experiment" ||
    record.evidence_class !== "synthetic_experiment"
  ) {
    fail("invalid_projection_input");
  }
  const sourceReceiptSha256 = requireSha256(record.source_receipt_sha256);
  if (requireSha256(record.projection_idempotency_key) !== sourceReceiptSha256) {
    fail("invalid_projection_input");
  }
  requireTimestamp(record.committed_at);
  const previousProjection = requireObject(record.previous_projection);
  requireExactKeys(previousProjection, PREVIOUS_PROJECTION_KEYS);
  requireProjectionText(previousProjection.day_7_result);
  requireProjectionText(previousProjection.day_30_result);
  requireProjectionText(previousProjection.human_conclusion);
  requireSha256(record.previous_projection_sha256);
}

function validateProjectionBefore(value: JsonValue): ValidatedProjectionBefore {
  const before = requireObject(value);
  requireExactKeys(before, PROJECTION_BEFORE_KEYS);
  if (
    before.projection_contract !== W6_REOPEN_BEFORE_CONTRACT ||
    before.data_scope !== "synthetic_experiment" ||
    before.evidence_class !== "synthetic_experiment"
  ) {
    fail("invalid_projection_input");
  }
  const cluster = requireObject(before.cluster);
  requireExactKeys(cluster, PROJECTION_BEFORE_CLUSTER_KEYS);
  const clusterId = requireId(cluster.cluster_id);
  const memberCaseIds = requireUniqueIds(cluster.member_case_ids, true);
  if (cluster.status !== "已归档") fail("invalid_projection_input");
  const recurrenceValues = requireArray(cluster.recurrence_records);
  if (recurrenceValues.length > 499) fail("invalid_projection_input");
  const recurrenceRecords = recurrenceValues.map((entry) => {
    const record = requireObject(entry);
    if (record.projection_contract === "reopen_snapshot.v1") validateReopenSnapshot(record);
    return record;
  });
  const clusterUpdatedAt = requireTimestamp(cluster.updated_at);

  const improvement = requireObject(before.improvement);
  requireExactKeys(improvement, PROJECTION_BEFORE_IMPROVEMENT_KEYS);
  const improvementId = requireId(improvement.improvement_id);
  if (improvement.status !== "已完成") fail("invalid_projection_input");
  const day7Result = requireProjectionText(improvement.day_7_result);
  const day30Result = requireProjectionText(improvement.day_30_result);
  const humanConclusion = requireProjectionText(improvement.human_conclusion);
  const improvementUpdatedAt = requireTimestamp(improvement.updated_at);
  return {
    clusterId,
    memberCaseIds,
    recurrenceRecords,
    clusterUpdatedAt,
    improvementId,
    day7Result,
    day30Result,
    humanConclusion,
    improvementUpdatedAt,
  };
}

function validateProjectionObserved(value: JsonValue): ValidatedProjectionObserved {
  const observed = requireObject(value);
  requireExactKeys(observed, PROJECTION_BEFORE_KEYS);
  if (
    observed.projection_contract !== "w6_reopen_projection_observed.v1" ||
    observed.data_scope !== "synthetic_experiment" ||
    observed.evidence_class !== "synthetic_experiment"
  ) {
    fail("invalid_projection_input");
  }

  const cluster = requireObject(observed.cluster);
  requireExactKeys(cluster, PROJECTION_BEFORE_CLUSTER_KEYS);
  const clusterId = requireId(cluster.cluster_id);
  const memberCaseIds = requireUniqueIds(cluster.member_case_ids, true);
  if (cluster.status !== "已归档" && cluster.status !== "观察中") {
    fail("invalid_projection_input");
  }
  const recurrenceValues = requireArray(cluster.recurrence_records);
  if (recurrenceValues.length > 500) fail("invalid_projection_input");
  const recurrenceRecords = recurrenceValues.map((entry) => {
    const record = requireObject(entry);
    if (record.projection_contract === "reopen_snapshot.v1") validateReopenSnapshot(record);
    return record;
  });
  const clusterUpdatedAt = requireTimestamp(cluster.updated_at);

  const improvement = requireObject(observed.improvement);
  requireExactKeys(improvement, PROJECTION_BEFORE_IMPROVEMENT_KEYS);
  const improvementId = requireId(improvement.improvement_id);
  if (improvement.status !== "已完成" && improvement.status !== "观察中") {
    fail("invalid_projection_input");
  }
  const day7Result = improvement.day_7_result === null
    ? null
    : requireProjectionText(improvement.day_7_result);
  const day30Result = improvement.day_30_result === null
    ? null
    : requireProjectionText(improvement.day_30_result);
  const humanConclusion = improvement.human_conclusion === null
    ? null
    : requireProjectionText(improvement.human_conclusion);
  const improvementUpdatedAt = requireTimestamp(improvement.updated_at);
  return {
    clusterId,
    memberCaseIds,
    clusterStatus: cluster.status,
    recurrenceRecords,
    clusterUpdatedAt,
    improvementId,
    improvementStatus: improvement.status,
    day7Result,
    day30Result,
    humanConclusion,
    improvementUpdatedAt,
  };
}

function validateCapability(value: JsonValue): ValidatedCapability {
  const capability = requireObject(value);
  requireExactKeys(capability, CAPABILITY_KEYS);
  if (
    capability.attestation_contract !== W6_REOPEN_CAPABILITY_CONTRACT ||
    capability.data_scope !== "synthetic_experiment" ||
    (capability.evidence_class !== "synthetic_experiment" &&
      capability.evidence_class !== "solution_design")
  ) {
    fail("invalid_projection_input");
  }
  const attestationId = requireId(capability.attestation_id);
  if (
    capability.verification_status !== "synthetic_fixture" &&
    capability.verification_status !== "not_tested" &&
    capability.verification_status !== "onsite_verified"
  ) {
    fail("invalid_projection_input");
  }
  if (
    capability.execution_mode !== "atomic_all_targets" &&
    capability.execution_mode !== "sealed_outbox_cas" &&
    capability.execution_mode !== "insufficient"
  ) {
    fail("invalid_projection_input");
  }
  if (typeof capability.recurrence_visibility_no_broader_than_source_fields !== "boolean") {
    fail("invalid_projection_input");
  }
  const permissionSnapshotSha256 = requireNullableSha256(
    capability.permission_snapshot_sha256,
  );
  const permissionRevision = requireNullableString(capability.permission_revision);
  const issuedAt = requireNullableTimestamp(capability.issued_at);
  const expiresAt = requireNullableTimestamp(capability.expires_at);
  const evidenceUnitRef = requireNullableString(capability.evidence_unit_ref);
  if (
    capability.verified_by_role !== null &&
    capability.verified_by_role !== "test_harness" &&
    capability.verified_by_role !== "authorized_competition_operator"
  ) {
    fail("invalid_projection_input");
  }

  if (capability.verification_status === "not_tested") {
    if (
      capability.execution_mode !== "insufficient" ||
      capability.recurrence_visibility_no_broader_than_source_fields !== false ||
      permissionSnapshotSha256 !== null ||
      permissionRevision !== null ||
      issuedAt !== null ||
      expiresAt !== null ||
      evidenceUnitRef !== null ||
      capability.verified_by_role !== null
    ) {
      fail("invalid_projection_input");
    }
  } else {
    if (
      permissionSnapshotSha256 === null ||
      permissionRevision === null ||
      issuedAt === null ||
      expiresAt === null ||
      Date.parse(expiresAt) <= Date.parse(issuedAt)
    ) {
      fail("invalid_projection_input");
    }
    if (
      capability.verification_status === "synthetic_fixture" &&
      (
        capability.evidence_class !== "synthetic_experiment" ||
        capability.verified_by_role !== "test_harness"
      )
    ) {
      fail("invalid_projection_input");
    }
    if (
      capability.verification_status === "onsite_verified" &&
      (
        capability.verified_by_role !== "authorized_competition_operator" ||
        evidenceUnitRef !== "P02+P03"
      )
    ) {
      fail("invalid_projection_input");
    }
  }
  return {
    record: capability,
    attestationId,
    executionMode: capability.execution_mode,
    visibilityIsSufficient:
      capability.recurrence_visibility_no_broader_than_source_fields,
    permissionSnapshotSha256,
    permissionRevision,
    issuedAt,
    expiresAt,
  };
}

function validateCapabilityAvailability(
  capability: ValidatedCapability,
  checkedAtValue: JsonValue,
): asserts capability is ValidatedCapability & {
  executionMode: "atomic_all_targets" | "sealed_outbox_cas";
  permissionSnapshotSha256: string;
  permissionRevision: string;
  issuedAt: string;
  expiresAt: string;
} {
  const checkedAt = requireTimestamp(checkedAtValue);
  if (
    capability.executionMode === "insufficient" ||
    !capability.visibilityIsSufficient ||
    capability.permissionSnapshotSha256 === null ||
    capability.permissionRevision === null ||
    capability.issuedAt === null ||
    capability.expiresAt === null ||
    Date.parse(checkedAt) < Date.parse(capability.issuedAt) ||
    Date.parse(checkedAt) >= Date.parse(capability.expiresAt)
  ) {
    fail("platform_capability_insufficient");
  }
}

function validateMembershipBinding(
  source: ValidatedProjectionSource,
  before: ValidatedProjectionBefore,
): void {
  if (
    source.clusterId !== before.clusterId ||
    source.improvementId !== before.improvementId ||
    Date.parse(before.clusterUpdatedAt) >= Date.parse(source.committedAt) ||
    Date.parse(before.improvementUpdatedAt) >= Date.parse(source.committedAt)
  ) {
    fail("commit_proof_mismatch");
  }
  const beforeSet = new Set(before.memberCaseIds);
  if (
    !isOrderedSubsequence(source.memberCaseIds, source.triggeringCaseIds) ||
    source.triggeringCaseIds.some((caseId) => beforeSet.has(caseId))
  ) {
    fail("commit_proof_mismatch");
  }
  const union = new Set([...before.memberCaseIds, ...source.triggeringCaseIds]);
  if (
    union.size !== source.memberCaseIds.length ||
    source.memberCaseIds.some((caseId) => !union.has(caseId))
  ) {
    fail("commit_proof_mismatch");
  }
}

function hashProjectionValue(
  value: JsonObject,
  hashJsonValue: W6ReopenProjectionHasher,
): string {
  let digest: string;
  try {
    digest = hashJsonValue(deepFreeze(value));
  } catch {
    fail("projection_dependency_failure");
  }
  if (typeof digest !== "string" || !SHA256_PATTERN.test(digest)) {
    fail("projection_dependency_failure");
  }
  return digest;
}

function createRejectResult(error: W6ReopenProjectionError): W6G3ProjectionResult {
  const artifact: RejectRedactedProjectionArtifact = {
    projector_key: W6_REOPEN_PROJECTOR_KEY,
    data_scope: "synthetic_experiment",
    evidence_class: "synthetic_experiment",
    projection_idempotency_key: null,
    decision: "reject",
    cluster_id: null,
    improvement_id: null,
    cluster_expected_before_sha256: null,
    cluster_expected_after_sha256: null,
    improvement_expected_before_sha256: null,
    improvement_expected_after_sha256: null,
    sealed_plan_sha256: null,
    write_targets: [],
    planned_target_count: 0,
    repair_required: false,
    repair_target: null,
    redaction_status: "passed",
    safe_error: error,
  };
  return deepFreeze({
    decision: "reject" as const,
    plan: null,
    execution: null,
    artifact,
  });
}

function containsForbiddenArtifactMaterial(
  value: unknown,
  forbiddenKeys: ReadonlySet<string>,
  forbiddenValues: ReadonlySet<string>,
): boolean {
  if (typeof value === "string") return forbiddenValues.has(value);
  if (value === null || typeof value !== "object") return false;
  for (const [key, child] of Object.entries(value)) {
    if (
      forbiddenKeys.has(key) ||
      containsForbiddenArtifactMaterial(child, forbiddenKeys, forbiddenValues)
    ) {
      return true;
    }
  }
  return false;
}

function validateApplyArtifactRedaction(
  artifact: ApplyOnceRedactedProjectionArtifact,
  sourceReceiptId: string,
  previousProjection: Readonly<{
    day_7_result: string;
    day_30_result: string;
    human_conclusion: string;
  }>,
): void {
  const artifactRecord = artifact as unknown as JsonObject;
  requireExactKeys(artifactRecord, APPLY_ARTIFACT_KEYS);
  if (
    containsForbiddenArtifactMaterial(
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
      ]),
      new Set([
        sourceReceiptId,
        previousProjection.day_7_result,
        previousProjection.day_30_result,
        previousProjection.human_conclusion,
      ]),
    )
  ) {
    fail("sensitive_output_rejected");
  }
}

function buildProjectionPlan(
  verifiedSourceInput: unknown,
  projectionBeforeInput: unknown,
  capabilityInput: unknown,
  capabilityCheckedAtInput: unknown,
  hashJsonValue: W6ReopenProjectionHasher,
): W6G3ProjectionResult {
  const sourceSnapshot = snapshotDescriptorSafeJsonValue(verifiedSourceInput);
  const beforeSnapshot = snapshotDescriptorSafeJsonValue(projectionBeforeInput);
  const capabilitySnapshot = snapshotDescriptorSafeJsonValue(capabilityInput);
  const checkedAtSnapshot = snapshotDescriptorSafeJsonValue(capabilityCheckedAtInput);
  const source = validateProjectionSource(sourceSnapshot);
  const before = validateProjectionBefore(beforeSnapshot);
  const capability = validateCapability(capabilitySnapshot);
  validateCapabilityAvailability(capability, checkedAtSnapshot);
  validateMembershipBinding(source, before);
  if (
    before.recurrenceRecords.some(
      (record) =>
        record.projection_contract === "reopen_snapshot.v1" &&
        record.projection_idempotency_key === source.sourceReceiptSha256,
    )
  ) {
    fail("projection_conflict");
  }
  for (const record of before.recurrenceRecords) {
    if (record.projection_contract !== "reopen_snapshot.v1") continue;
    const previous = requireObject(record.previous_projection);
    const expectedPreviousSha256 = hashProjectionValue({
      contract: W6_REOPEN_PREVIOUS_PROJECTION_HASH_CONTRACT,
      day_7_result: previous.day_7_result,
      day_30_result: previous.day_30_result,
      human_conclusion: previous.human_conclusion,
    }, hashJsonValue);
    if (record.previous_projection_sha256 !== expectedPreviousSha256) {
      fail("projection_conflict");
    }
  }

  const previousProjection = {
    day_7_result: before.day7Result,
    day_30_result: before.day30Result,
    human_conclusion: before.humanConclusion,
  };
  const previousProjectionSha256 = hashProjectionValue({
    contract: W6_REOPEN_PREVIOUS_PROJECTION_HASH_CONTRACT,
    ...previousProjection,
  }, hashJsonValue);
  const reopenSnapshot: JsonObject = {
    projection_contract: "reopen_snapshot.v1",
    data_scope: "synthetic_experiment",
    evidence_class: "synthetic_experiment",
    source_receipt_sha256: source.sourceReceiptSha256,
    projection_idempotency_key: source.sourceReceiptSha256,
    committed_at: source.committedAt,
    previous_projection: previousProjection,
    previous_projection_sha256: previousProjectionSha256,
  };
  const recurrenceRecordsAfter: JsonValue[] = [...before.recurrenceRecords, reopenSnapshot];

  const clusterBeforeMaterial: JsonObject = {
    contract: W6_REOPEN_CLUSTER_BEFORE_HASH_CONTRACT,
    data_scope: "synthetic_experiment",
    cluster_id: before.clusterId,
    member_case_ids: [...before.memberCaseIds],
    status: "已归档",
    recurrence_records: [...before.recurrenceRecords],
    updated_at: before.clusterUpdatedAt,
  };
  const clusterAfterMaterial: JsonObject = {
    contract: W6_REOPEN_CLUSTER_AFTER_HASH_CONTRACT,
    data_scope: "synthetic_experiment",
    cluster_id: source.clusterId,
    member_case_ids: [...source.memberCaseIds],
    status: "观察中",
    recurrence_records: recurrenceRecordsAfter,
    updated_at: source.committedAt,
  };
  const improvementBeforeMaterial: JsonObject = {
    contract: W6_REOPEN_IMPROVEMENT_BEFORE_HASH_CONTRACT,
    data_scope: "synthetic_experiment",
    improvement_id: before.improvementId,
    status: "已完成",
    ...previousProjection,
    updated_at: before.improvementUpdatedAt,
  };
  const improvementAfterMaterial: JsonObject = {
    contract: W6_REOPEN_IMPROVEMENT_AFTER_HASH_CONTRACT,
    data_scope: "synthetic_experiment",
    improvement_id: source.improvementId,
    status: "观察中",
    day_7_result: null,
    day_30_result: null,
    human_conclusion: null,
    updated_at: source.committedAt,
  };
  const clusterExpectedBeforeSha256 = hashProjectionValue(
    clusterBeforeMaterial,
    hashJsonValue,
  );
  const clusterExpectedAfterSha256 = hashProjectionValue(
    clusterAfterMaterial,
    hashJsonValue,
  );
  const improvementExpectedBeforeSha256 = hashProjectionValue(
    improvementBeforeMaterial,
    hashJsonValue,
  );
  const improvementExpectedAfterSha256 = hashProjectionValue(
    improvementAfterMaterial,
    hashJsonValue,
  );
  const capabilityAttestationSha256 = hashProjectionValue({
    contract: W6_REOPEN_CAPABILITY_ATTESTATION_HASH_CONTRACT,
    ...capability.record,
  }, hashJsonValue);

  const clusterTarget: JsonObject = {
    target: "clusters",
    selector: {
      field: "cluster_id",
      value: source.clusterId,
    },
    expected_before_sha256: clusterExpectedBeforeSha256,
    expected_after_sha256: clusterExpectedAfterSha256,
    patch: {
      member_case_ids: [...source.memberCaseIds],
      status: "观察中",
      recurrence_records: recurrenceRecordsAfter,
      updated_at: source.committedAt,
    },
  };
  const improvementTarget: JsonObject = {
    target: "improvements",
    selector: {
      field: "improvement_id",
      value: source.improvementId,
    },
    expected_before_sha256: improvementExpectedBeforeSha256,
    expected_after_sha256: improvementExpectedAfterSha256,
    patch: {
      status: "观察中",
      day_7_result: null,
      day_30_result: null,
      human_conclusion: null,
      updated_at: source.committedAt,
    },
  };
  const planMaterial: JsonObject = {
    plan_contract: "w6_reopen_projection_plan.v1",
    projector_key: W6_REOPEN_PROJECTOR_KEY,
    data_scope: "synthetic_experiment",
    evidence_class: "synthetic_experiment",
    source_receipt_id: source.sourceReceiptId,
    source_receipt_sha256: source.sourceReceiptSha256,
    projection_idempotency_key: source.sourceReceiptSha256,
    capability_attestation_id: capability.attestationId,
    capability_attestation_sha256: capabilityAttestationSha256,
    execution_mode: capability.executionMode,
    permission_snapshot_sha256: capability.permissionSnapshotSha256,
    permission_revision: capability.permissionRevision,
    write_targets: [clusterTarget, improvementTarget],
  };
  const sealedPlanSha256 = hashProjectionValue({
    contract: W6_REOPEN_PLAN_HASH_CONTRACT,
    ...planMaterial,
  }, hashJsonValue);
  const plan = {
    ...planMaterial,
    sealed_plan_sha256: sealedPlanSha256,
  } as unknown as ProjectionWritePlan;
  const execution: ApplyOnceProjectionExecutionDirective = {
    mode: "both",
    sealed_plan_sha256: sealedPlanSha256,
    capability_attestation_sha256: capabilityAttestationSha256,
    permission_revision: capability.permissionRevision,
    pending_targets: ["clusters", "improvements"],
  };
  const artifact: ApplyOnceRedactedProjectionArtifact = {
    projector_key: W6_REOPEN_PROJECTOR_KEY,
    data_scope: "synthetic_experiment",
    evidence_class: "synthetic_experiment",
    projection_idempotency_key: source.sourceReceiptSha256,
    decision: "apply_once",
    cluster_id: source.clusterId,
    improvement_id: source.improvementId,
    cluster_expected_before_sha256: clusterExpectedBeforeSha256,
    cluster_expected_after_sha256: clusterExpectedAfterSha256,
    improvement_expected_before_sha256: improvementExpectedBeforeSha256,
    improvement_expected_after_sha256: improvementExpectedAfterSha256,
    sealed_plan_sha256: sealedPlanSha256,
    write_targets: ["clusters", "improvements"],
    planned_target_count: 2,
    repair_required: false,
    repair_target: null,
    redaction_status: "passed",
    safe_error: null,
  };
  validateApplyArtifactRedaction(artifact, source.sourceReceiptId, previousProjection);
  return deepFreeze({
    decision: "apply_once" as const,
    plan,
    execution,
    artifact,
  });
}

function planWithHasher(
  verifiedSource: unknown,
  projectionBefore: unknown,
  capability: unknown,
  capabilityCheckedAt: unknown,
  hashJsonValue: W6ReopenProjectionHasher,
): W6G3ProjectionResult {
  try {
    return buildProjectionPlan(
      verifiedSource,
      projectionBefore,
      capability,
      capabilityCheckedAt,
      hashJsonValue,
    );
  } catch (error) {
    if (error instanceof W6ReopenProjectionFailure) return createRejectResult(error.error);
    return createRejectResult("projection_dependency_failure");
  }
}

export function planW6ReopenProjection(
  verifiedSource: VerifiedW6ReopenProjectionSource,
  projectionBefore: W6ReopenProjectionBefore,
  capability: TrustedProjectionCapabilityAttestation,
  capabilityCheckedAt: string,
): W6G3ProjectionResult {
  return planWithHasher(
    verifiedSource,
    projectionBefore,
    capability,
    capabilityCheckedAt,
    createWorkflowEventFingerprint,
  );
}

export function createW6ReopenProjectionPlannerForTest(
  hashJsonValue: W6ReopenProjectionHasher,
): (
  verifiedSource: unknown,
  projectionBefore: unknown,
  capability: unknown,
  capabilityCheckedAt: unknown,
) => W6G3ProjectionResult {
  return (verifiedSource, projectionBefore, capability, capabilityCheckedAt) =>
    planWithHasher(
      verifiedSource,
      projectionBefore,
      capability,
      capabilityCheckedAt,
      hashJsonValue,
    );
}

const COMMITTED_TRIGGER_KEYS = [
  "kind",
  "receipt_id",
  "data_scope",
  "evidence_class",
] as const;
const REPLAY_TRIGGER_KEYS = ["kind", "data_scope", "evidence_class"] as const;
const PLAN_KEYS = [
  "plan_contract",
  "projector_key",
  "data_scope",
  "evidence_class",
  "source_receipt_id",
  "source_receipt_sha256",
  "projection_idempotency_key",
  "capability_attestation_id",
  "capability_attestation_sha256",
  "execution_mode",
  "permission_snapshot_sha256",
  "permission_revision",
  "write_targets",
  "sealed_plan_sha256",
] as const;
const WRITE_TARGET_KEYS = [
  "target",
  "selector",
  "expected_before_sha256",
  "expected_after_sha256",
  "patch",
] as const;
const SELECTOR_KEYS = ["field", "value"] as const;
const CLUSTER_PATCH_KEYS = [
  "member_case_ids",
  "status",
  "recurrence_records",
  "updated_at",
] as const;
const IMPROVEMENT_PATCH_KEYS = [
  "status",
  "day_7_result",
  "day_30_result",
  "human_conclusion",
  "updated_at",
] as const;
const OUTBOX_NOT_FOUND_KEYS = ["outcome"] as const;
const OUTBOX_PLAN_KEYS = ["outcome", "plan"] as const;
const EXECUTION_EVIDENCE_KEYS = [
  "evidence_contract",
  "source_receipt_id",
  "source_receipt_sha256",
  "sealed_plan_sha256",
  "capability_attestation_id",
  "capability_attestation_sha256",
  "capability_rechecked_at",
  "execution_mode",
  "permission_snapshot_sha256",
  "permission_revision",
  "exact_plan_material_match",
  "acknowledged_target_count",
  "target_acks",
] as const;
const TARGET_ACK_KEYS = [
  "target",
  "expected_after_sha256",
  "applied_by_sealed_plan_sha256",
  "capability_attestation_sha256",
  "capability_rechecked_at",
  "permission_snapshot_sha256",
  "permission_revision",
  "resolved_record_locator_sha256",
] as const;
const PUBLIC_ARTIFACT_ERROR_VALUES = new Set<W6ReopenProjectionError>([
  "invalid_projection_input",
  "unverified_commit",
  "commit_proof_mismatch",
  "event_conflict",
  "projection_conflict",
  "sensitive_output_rejected",
  "platform_capability_insufficient",
  "projection_dependency_failure",
]);
const PUBLIC_ARTIFACT_FORBIDDEN_KEYS = new Set([
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
  "capability_attestation_sha256",
  "permission_snapshot_sha256",
  "permission_revision",
]);

class ProjectionDependencyBoundaryFailure {}

async function callProjectionDependency<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch {
    throw new ProjectionDependencyBoundaryFailure();
  }
}

function callSynchronousProjectionDependency<T>(operation: () => T): T {
  try {
    return operation();
  } catch {
    throw new ProjectionDependencyBoundaryFailure();
  }
}

function validateTrigger(value: unknown): FeishuW6ReopenProjectionTrigger {
  const trigger = requireObject(snapshotDescriptorSafeJsonValue(value));
  if (trigger.kind === "committed_new_reopen") {
    requireExactKeys(trigger, COMMITTED_TRIGGER_KEYS);
    const receiptId = requireId(trigger.receipt_id);
    if (
      trigger.data_scope !== "synthetic_experiment" ||
      trigger.evidence_class !== "synthetic_experiment"
    ) {
      fail("invalid_projection_input");
    }
    return deepFreeze({
      kind: "committed_new_reopen",
      receipt_id: receiptId,
      data_scope: "synthetic_experiment",
      evidence_class: "synthetic_experiment",
    });
  }
  if (trigger.kind === "authorized_exact_replay" || trigger.kind === "authorized_near_conflict") {
    requireExactKeys(trigger, REPLAY_TRIGGER_KEYS);
    if (
      trigger.data_scope !== "synthetic_experiment" ||
      trigger.evidence_class !== "synthetic_experiment"
    ) {
      fail("invalid_projection_input");
    }
    return deepFreeze({
      kind: trigger.kind,
      data_scope: "synthetic_experiment",
      evidence_class: "synthetic_experiment",
    });
  }
  fail("invalid_projection_input");
}

function createPublicRejectArtifact(
  error: W6ReopenProjectionError,
): RejectRedactedProjectionArtifact {
  return createRejectResult(error).artifact as RejectRedactedProjectionArtifact;
}

function createPublicNoOpArtifact(): NoOpRedactedProjectionArtifact {
  return deepFreeze({
    projector_key: W6_REOPEN_PROJECTOR_KEY,
    data_scope: "synthetic_experiment",
    evidence_class: "synthetic_experiment",
    projection_idempotency_key: null,
    decision: "no_op",
    cluster_id: null,
    improvement_id: null,
    cluster_expected_before_sha256: null,
    cluster_expected_after_sha256: null,
    improvement_expected_before_sha256: null,
    improvement_expected_after_sha256: null,
    sealed_plan_sha256: null,
    write_targets: [],
    planned_target_count: 0,
    repair_required: false,
    repair_target: null,
    redaction_status: "passed",
    safe_error: null,
  });
}

function validateNullableArtifactBindings(record: JsonObject): void {
  if (record.projection_idempotency_key !== null) requireSha256(record.projection_idempotency_key);
  if (record.cluster_id !== null) requireId(record.cluster_id);
  if (record.improvement_id !== null) requireId(record.improvement_id);
  for (const key of [
    "cluster_expected_before_sha256",
    "cluster_expected_after_sha256",
    "improvement_expected_before_sha256",
    "improvement_expected_after_sha256",
    "sealed_plan_sha256",
  ] as const) {
    if (record[key] !== null) requireSha256(record[key]);
  }
}

function validatePublicArtifactShape(value: JsonValue): void {
  const artifact = requireObject(value);
  requireExactKeys(artifact, APPLY_ARTIFACT_KEYS);
  if (
    artifact.projector_key !== W6_REOPEN_PROJECTOR_KEY ||
    artifact.data_scope !== "synthetic_experiment" ||
    artifact.evidence_class !== "synthetic_experiment" ||
    artifact.redaction_status !== "passed"
  ) {
    fail("sensitive_output_rejected");
  }
  validateNullableArtifactBindings(artifact);
  if (
    artifact.decision === "apply_once" ||
    artifact.decision === "already_applied" ||
    artifact.decision === "repair"
  ) {
    requireSha256(artifact.projection_idempotency_key);
    requireId(artifact.cluster_id);
    requireId(artifact.improvement_id);
    requireSha256(artifact.cluster_expected_before_sha256);
    requireSha256(artifact.cluster_expected_after_sha256);
    requireSha256(artifact.improvement_expected_before_sha256);
    requireSha256(artifact.improvement_expected_after_sha256);
    requireSha256(artifact.sealed_plan_sha256);
    const targets = requireArray(artifact.write_targets);
    if (artifact.safe_error !== null) {
      fail("sensitive_output_rejected");
    }
    if (artifact.decision === "apply_once") {
      if (
        targets.length !== 2 ||
        targets[0] !== "clusters" ||
        targets[1] !== "improvements" ||
        artifact.planned_target_count !== 2 ||
        artifact.repair_required !== false ||
        artifact.repair_target !== null
      ) {
        fail("sensitive_output_rejected");
      }
      return;
    }
    if (artifact.decision === "already_applied") {
      if (
        targets.length !== 0 ||
        artifact.planned_target_count !== 0 ||
        artifact.repair_required !== false ||
        artifact.repair_target !== null
      ) {
        fail("sensitive_output_rejected");
      }
      return;
    }
    if (
      artifact.repair_required !== true ||
      (artifact.repair_target !== "clusters" && artifact.repair_target !== "improvements") ||
      targets.length !== 1 ||
      targets[0] !== artifact.repair_target ||
      artifact.planned_target_count !== 1
    ) {
      fail("sensitive_output_rejected");
    }
    return;
  }
  if (artifact.decision !== "no_op" && artifact.decision !== "reject") {
    fail("sensitive_output_rejected");
  }
  if (
    artifact.projection_idempotency_key !== null ||
    artifact.cluster_id !== null ||
    artifact.improvement_id !== null ||
    artifact.cluster_expected_before_sha256 !== null ||
    artifact.cluster_expected_after_sha256 !== null ||
    artifact.improvement_expected_before_sha256 !== null ||
    artifact.improvement_expected_after_sha256 !== null ||
    artifact.sealed_plan_sha256 !== null ||
    requireArray(artifact.write_targets).length !== 0 ||
    artifact.planned_target_count !== 0 ||
    artifact.repair_required !== false ||
    artifact.repair_target !== null
  ) {
    fail("sensitive_output_rejected");
  }
  if (artifact.decision === "no_op") {
    if (artifact.safe_error !== null) fail("sensitive_output_rejected");
    return;
  }
  if (
    typeof artifact.safe_error !== "string" ||
    !PUBLIC_ARTIFACT_ERROR_VALUES.has(artifact.safe_error as W6ReopenProjectionError)
  ) {
    fail("sensitive_output_rejected");
  }
}

function finalizePublicArtifact(
  candidate: unknown,
  forbiddenValues: ReadonlySet<string>,
): RedactedProjectionArtifact {
  try {
    const snapshot = snapshotDescriptorSafeJsonValue(candidate);
    validatePublicArtifactShape(snapshot);
    if (
      containsForbiddenArtifactMaterial(
        snapshot,
        PUBLIC_ARTIFACT_FORBIDDEN_KEYS,
        forbiddenValues,
      )
    ) {
      fail("sensitive_output_rejected");
    }
    return deepFreeze(candidate as RedactedProjectionArtifact);
  } catch {
    return createPublicRejectArtifact("sensitive_output_rejected");
  }
}

function validateClusterPlanTarget(value: JsonValue): ClusterProjectionWriteTarget {
  const target = requireObject(value);
  requireExactKeys(target, WRITE_TARGET_KEYS);
  if (target.target !== "clusters") fail("invalid_projection_input");
  const selector = requireObject(target.selector);
  requireExactKeys(selector, SELECTOR_KEYS);
  if (selector.field !== "cluster_id") fail("invalid_projection_input");
  requireId(selector.value);
  requireSha256(target.expected_before_sha256);
  requireSha256(target.expected_after_sha256);
  const patch = requireObject(target.patch);
  requireExactKeys(patch, CLUSTER_PATCH_KEYS);
  requireUniqueIds(patch.member_case_ids);
  if (patch.status !== "观察中") fail("invalid_projection_input");
  const recurrenceRecords = requireArray(patch.recurrence_records);
  if (recurrenceRecords.length > 500) fail("invalid_projection_input");
  for (const entry of recurrenceRecords) {
    const record = requireObject(entry);
    if (record.projection_contract === "reopen_snapshot.v1") validateReopenSnapshot(record);
  }
  requireTimestamp(patch.updated_at);
  return target as unknown as ClusterProjectionWriteTarget;
}

function validateImprovementPlanTarget(value: JsonValue): ImprovementProjectionWriteTarget {
  const target = requireObject(value);
  requireExactKeys(target, WRITE_TARGET_KEYS);
  if (target.target !== "improvements") fail("invalid_projection_input");
  const selector = requireObject(target.selector);
  requireExactKeys(selector, SELECTOR_KEYS);
  if (selector.field !== "improvement_id") fail("invalid_projection_input");
  requireId(selector.value);
  requireSha256(target.expected_before_sha256);
  requireSha256(target.expected_after_sha256);
  const patch = requireObject(target.patch);
  requireExactKeys(patch, IMPROVEMENT_PATCH_KEYS);
  if (
    patch.status !== "观察中" ||
    patch.day_7_result !== null ||
    patch.day_30_result !== null ||
    patch.human_conclusion !== null
  ) {
    fail("invalid_projection_input");
  }
  requireTimestamp(patch.updated_at);
  return target as unknown as ImprovementProjectionWriteTarget;
}

function validateStandaloneProjectionPlan(
  value: JsonValue,
  hashJsonValue: W6ReopenProjectionHasher,
): ProjectionWritePlan {
  const plan = requireObject(value);
  requireExactKeys(plan, PLAN_KEYS);
  if (
    plan.plan_contract !== "w6_reopen_projection_plan.v1" ||
    plan.projector_key !== W6_REOPEN_PROJECTOR_KEY ||
    plan.data_scope !== "synthetic_experiment" ||
    plan.evidence_class !== "synthetic_experiment"
  ) {
    fail("invalid_projection_input");
  }
  requireId(plan.source_receipt_id);
  const sourceReceiptSha256 = requireSha256(plan.source_receipt_sha256);
  const projectionIdempotencyKey = requireSha256(plan.projection_idempotency_key);
  requireId(plan.capability_attestation_id);
  requireSha256(plan.capability_attestation_sha256);
  if (plan.execution_mode !== "atomic_all_targets" && plan.execution_mode !== "sealed_outbox_cas") {
    fail("invalid_projection_input");
  }
  requireSha256(plan.permission_snapshot_sha256);
  requireNonEmptyString(plan.permission_revision);
  const targets = requireArray(plan.write_targets);
  if (targets.length !== 2) fail("invalid_projection_input");
  validateClusterPlanTarget(targets[0]);
  validateImprovementPlanTarget(targets[1]);
  const sealedPlanSha256 = requireSha256(plan.sealed_plan_sha256);
  const planWithoutDigest: JsonObject = {
    plan_contract: plan.plan_contract,
    projector_key: plan.projector_key,
    data_scope: plan.data_scope,
    evidence_class: plan.evidence_class,
    source_receipt_id: plan.source_receipt_id,
    source_receipt_sha256: plan.source_receipt_sha256,
    projection_idempotency_key: plan.projection_idempotency_key,
    capability_attestation_id: plan.capability_attestation_id,
    capability_attestation_sha256: plan.capability_attestation_sha256,
    execution_mode: plan.execution_mode,
    permission_snapshot_sha256: plan.permission_snapshot_sha256,
    permission_revision: plan.permission_revision,
    write_targets: plan.write_targets,
  };
  const expectedSealedPlanSha256 = hashProjectionValue({
    contract: W6_REOPEN_PLAN_HASH_CONTRACT,
    ...planWithoutDigest,
  }, hashJsonValue);
  if (
    sealedPlanSha256 !== expectedSealedPlanSha256 ||
    projectionIdempotencyKey !== sourceReceiptSha256
  ) {
    fail("projection_conflict");
  }
  return plan as unknown as ProjectionWritePlan;
}

function validateAuthoritativeProjectionPlan(
  value: JsonValue,
  source: ValidatedProjectionSource,
  hashJsonValue: W6ReopenProjectionHasher,
): ProjectionWritePlan {
  const plan = validateStandaloneProjectionPlan(value, hashJsonValue);
  const clusterTarget = plan.write_targets[0];
  const improvementTarget = plan.write_targets[1];
  if (
    plan.source_receipt_id !== source.sourceReceiptId ||
    plan.source_receipt_sha256 !== source.sourceReceiptSha256 ||
    plan.projection_idempotency_key !== source.sourceReceiptSha256 ||
    clusterTarget.selector.value !== source.clusterId ||
    improvementTarget.selector.value !== source.improvementId ||
    !sameStrings(clusterTarget.patch.member_case_ids, source.memberCaseIds) ||
    clusterTarget.patch.updated_at !== source.committedAt ||
    improvementTarget.patch.updated_at !== source.committedAt
  ) {
    fail("projection_conflict");
  }
  return plan;
}

function validateExecutionEvidenceStructure(
  value: JsonValue,
): TrustedProjectionExecutionEvidence | null {
  if (value === null) return null;
  const evidence = requireObject(value);
  requireExactKeys(evidence, EXECUTION_EVIDENCE_KEYS);
  if (evidence.evidence_contract !== "w6_reopen_projection_execution_evidence.v1") {
    fail("invalid_projection_input");
  }
  requireId(evidence.source_receipt_id);
  requireSha256(evidence.source_receipt_sha256);
  requireSha256(evidence.sealed_plan_sha256);
  requireId(evidence.capability_attestation_id);
  requireSha256(evidence.capability_attestation_sha256);
  requireTimestamp(evidence.capability_rechecked_at);
  if (
    evidence.execution_mode !== "atomic_all_targets" &&
    evidence.execution_mode !== "sealed_outbox_cas"
  ) {
    fail("invalid_projection_input");
  }
  requireSha256(evidence.permission_snapshot_sha256);
  requireNonEmptyString(evidence.permission_revision);
  if (evidence.exact_plan_material_match !== true) fail("invalid_projection_input");
  if (
    !Number.isSafeInteger(evidence.acknowledged_target_count) ||
    (evidence.acknowledged_target_count as number) < 0 ||
    (evidence.acknowledged_target_count as number) > 2
  ) {
    fail("invalid_projection_input");
  }
  const acks = requireArray(evidence.target_acks);
  if (acks.length !== evidence.acknowledged_target_count) {
    fail("invalid_projection_input");
  }
  const targetSequence = acks.map((value) => {
    const ack = requireObject(value);
    requireExactKeys(ack, TARGET_ACK_KEYS);
    if (ack.target !== "clusters" && ack.target !== "improvements") {
      fail("invalid_projection_input");
    }
    requireSha256(ack.expected_after_sha256);
    requireSha256(ack.applied_by_sealed_plan_sha256);
    requireSha256(ack.capability_attestation_sha256);
    requireTimestamp(ack.capability_rechecked_at);
    requireSha256(ack.permission_snapshot_sha256);
    requireNonEmptyString(ack.permission_revision);
    requireSha256(ack.resolved_record_locator_sha256);
    return ack.target;
  });
  if (
    (targetSequence.length === 2 &&
      (targetSequence[0] !== "clusters" || targetSequence[1] !== "improvements")) ||
    new Set(targetSequence).size !== targetSequence.length
  ) {
    fail("invalid_projection_input");
  }
  return evidence as unknown as TrustedProjectionExecutionEvidence;
}

function validateExecutionEvidenceBindings(
  evidence: TrustedProjectionExecutionEvidence,
  plan: ProjectionWritePlan,
): void {
  if (
    evidence.source_receipt_id !== plan.source_receipt_id ||
    evidence.source_receipt_sha256 !== plan.source_receipt_sha256 ||
    evidence.sealed_plan_sha256 !== plan.sealed_plan_sha256 ||
    evidence.capability_attestation_id !== plan.capability_attestation_id ||
    evidence.capability_attestation_sha256 !== plan.capability_attestation_sha256 ||
    evidence.execution_mode !== plan.execution_mode ||
    evidence.permission_snapshot_sha256 !== plan.permission_snapshot_sha256 ||
    evidence.permission_revision !== plan.permission_revision
  ) {
    fail("projection_conflict");
  }
  const targetsByName = new Map(
    plan.write_targets.map((target) => [target.target, target] as const),
  );
  for (const ack of evidence.target_acks) {
    const target = targetsByName.get(ack.target);
    if (
      target === undefined ||
      ack.expected_after_sha256 !== target.expected_after_sha256 ||
      ack.applied_by_sealed_plan_sha256 !== plan.sealed_plan_sha256 ||
      ack.capability_attestation_sha256 !== plan.capability_attestation_sha256 ||
      ack.permission_snapshot_sha256 !== plan.permission_snapshot_sha256 ||
      ack.permission_revision !== plan.permission_revision
    ) {
      fail("projection_conflict");
    }
  }
}

function validateExecutionEvidence(
  value: JsonValue,
  plan: ProjectionWritePlan,
): TrustedProjectionExecutionEvidence | null {
  const evidence = validateExecutionEvidenceStructure(value);
  if (evidence === null) return null;
  validateExecutionEvidenceBindings(evidence, plan);
  return evidence;
}

type ProjectionTargetState = "A" | "B" | "X";

function classifyObservedProjectionState(
  observed: ValidatedProjectionObserved,
  plan: ProjectionWritePlan,
  hashJsonValue: W6ReopenProjectionHasher,
): Readonly<{ cluster: ProjectionTargetState; improvement: ProjectionTargetState }> {
  const clusterTarget = plan.write_targets[0];
  const improvementTarget = plan.write_targets[1];
  const clusterMaterial: JsonObject = {
    data_scope: "synthetic_experiment",
    cluster_id: observed.clusterId,
    member_case_ids: [...observed.memberCaseIds],
    status: observed.clusterStatus,
    recurrence_records: [...observed.recurrenceRecords],
    updated_at: observed.clusterUpdatedAt,
  };
  const improvementMaterial: JsonObject = {
    data_scope: "synthetic_experiment",
    improvement_id: observed.improvementId,
    status: observed.improvementStatus,
    day_7_result: observed.day7Result,
    day_30_result: observed.day30Result,
    human_conclusion: observed.humanConclusion,
    updated_at: observed.improvementUpdatedAt,
  };
  const clusterBeforeSha256 = hashProjectionValue({
    contract: W6_REOPEN_CLUSTER_BEFORE_HASH_CONTRACT,
    ...clusterMaterial,
  }, hashJsonValue);
  const clusterAfterSha256 = hashProjectionValue({
    contract: W6_REOPEN_CLUSTER_AFTER_HASH_CONTRACT,
    ...clusterMaterial,
  }, hashJsonValue);
  const improvementBeforeSha256 = hashProjectionValue({
    contract: W6_REOPEN_IMPROVEMENT_BEFORE_HASH_CONTRACT,
    ...improvementMaterial,
  }, hashJsonValue);
  const improvementAfterSha256 = hashProjectionValue({
    contract: W6_REOPEN_IMPROVEMENT_AFTER_HASH_CONTRACT,
    ...improvementMaterial,
  }, hashJsonValue);
  return {
    cluster: clusterAfterSha256 === clusterTarget.expected_after_sha256
      ? "A"
      : clusterBeforeSha256 === clusterTarget.expected_before_sha256
        ? "B"
        : "X",
    improvement: improvementAfterSha256 === improvementTarget.expected_after_sha256
      ? "A"
      : improvementBeforeSha256 === improvementTarget.expected_before_sha256
        ? "B"
        : "X",
  };
}

function createPlanArtifactBindings(plan: ProjectionWritePlan) {
  const clusterTarget = plan.write_targets[0];
  const improvementTarget = plan.write_targets[1];
  return {
    projector_key: W6_REOPEN_PROJECTOR_KEY,
    data_scope: "synthetic_experiment",
    evidence_class: "synthetic_experiment",
    projection_idempotency_key: plan.projection_idempotency_key,
    cluster_id: clusterTarget.selector.value,
    improvement_id: improvementTarget.selector.value,
    cluster_expected_before_sha256: clusterTarget.expected_before_sha256,
    cluster_expected_after_sha256: clusterTarget.expected_after_sha256,
    improvement_expected_before_sha256: improvementTarget.expected_before_sha256,
    improvement_expected_after_sha256: improvementTarget.expected_after_sha256,
    sealed_plan_sha256: plan.sealed_plan_sha256,
    redaction_status: "passed",
    safe_error: null,
  } as const;
}

function createAlreadyAppliedResult(
  plan: ProjectionWritePlan,
): W6ReopenProjectionReconcileResult {
  const artifact: AlreadyAppliedRedactedProjectionArtifact = {
    ...createPlanArtifactBindings(plan),
    decision: "already_applied",
    write_targets: [],
    planned_target_count: 0,
    repair_required: false,
    repair_target: null,
  };
  return deepFreeze({
    decision: "already_applied" as const,
    plan: null,
    execution: null,
    artifact,
  });
}

function createRepairResult(
  plan: ProjectionWritePlan,
  repairTarget: "clusters" | "improvements",
): W6ReopenProjectionReconcileResult {
  if (repairTarget === "clusters") {
    const execution: ClusterRepairProjectionExecutionDirective = {
      mode: "cluster_only",
      sealed_plan_sha256: plan.sealed_plan_sha256,
      capability_attestation_sha256: plan.capability_attestation_sha256,
      permission_revision: plan.permission_revision,
      pending_targets: ["clusters"],
    };
    const artifact: ClusterRepairRedactedProjectionArtifact = {
      ...createPlanArtifactBindings(plan),
      decision: "repair",
      write_targets: ["clusters"],
      planned_target_count: 1,
      repair_required: true,
      repair_target: "clusters",
    };
    return deepFreeze({ decision: "repair", plan, execution, artifact });
  }
  const execution: ImprovementRepairProjectionExecutionDirective = {
    mode: "improvement_only",
    sealed_plan_sha256: plan.sealed_plan_sha256,
    capability_attestation_sha256: plan.capability_attestation_sha256,
    permission_revision: plan.permission_revision,
    pending_targets: ["improvements"],
  };
  const artifact: ImprovementRepairRedactedProjectionArtifact = {
    ...createPlanArtifactBindings(plan),
    decision: "repair",
    write_targets: ["improvements"],
    planned_target_count: 1,
    repair_required: true,
    repair_target: "improvements",
  };
  return deepFreeze({ decision: "repair", plan, execution, artifact });
}

function reconcileProjectionSnapshots(
  planSnapshot: JsonValue,
  observedSnapshot: JsonValue,
  evidenceSnapshot: JsonValue,
): W6ReopenProjectionReconcileResult {
  const plan = validateStandaloneProjectionPlan(
    planSnapshot,
    createWorkflowEventFingerprint,
  );
  const observed = validateProjectionObserved(observedSnapshot);
  const evidence = validateExecutionEvidence(evidenceSnapshot, plan);
  if (evidence === null) fail("invalid_projection_input");
  const observedState = classifyObservedProjectionState(
    observed,
    plan,
    createWorkflowEventFingerprint,
  );
  const acknowledgedTargets = evidence.target_acks.map((ack) => ack.target);
  const outputPlan = clonePlainJsonValue(planSnapshot) as unknown as ProjectionWritePlan;
  if (
    observedState.cluster === "A" &&
    observedState.improvement === "A" &&
    sameStrings(acknowledgedTargets, ["clusters", "improvements"])
  ) {
    return createAlreadyAppliedResult(outputPlan);
  }
  if (plan.execution_mode === "sealed_outbox_cas") {
    if (
      observedState.cluster === "A" &&
      observedState.improvement === "B" &&
      sameStrings(acknowledgedTargets, ["clusters"])
    ) {
      return createRepairResult(outputPlan, "improvements");
    }
    if (
      observedState.cluster === "B" &&
      observedState.improvement === "A" &&
      sameStrings(acknowledgedTargets, ["improvements"])
    ) {
      return createRepairResult(outputPlan, "clusters");
    }
  }
  fail("projection_conflict");
}

export function reconcileW6ReopenProjection(
  plan: ProjectionWritePlan,
  observed: W6ReopenProjectionObserved,
  evidence: TrustedProjectionExecutionEvidence,
): W6ReopenProjectionReconcileResult {
  try {
    return reconcileProjectionSnapshots(
      snapshotDescriptorSafeJsonValue(plan),
      snapshotDescriptorSafeJsonValue(observed),
      snapshotDescriptorSafeJsonValue(evidence),
    );
  } catch (error) {
    if (error instanceof W6ReopenProjectionFailure) return createRejectResult(error.error);
    return createRejectResult("projection_dependency_failure");
  }
}

function requireTrustedOutput<T>(operation: () => T): T {
  try {
    return operation();
  } catch (error) {
    if (
      error instanceof W6ReopenProjectionFailure &&
      (error.error === "projection_conflict" || error.error === "projection_dependency_failure")
    ) {
      throw error;
    }
    throw new ProjectionDependencyBoundaryFailure();
  }
}

function verifyTrustedCommittedSource(
  proof: unknown,
  expectedReceiptId: string,
  hashJsonValue: W6ReopenProjectionHasher,
): PrivateVerifiedW6ReopenCommitEnvelope {
  try {
    return verifyW6ReopenCommitProof(proof, expectedReceiptId, hashJsonValue);
  } catch (error) {
    if (
      error instanceof W6ReopenProjectionFailure &&
      (
        error.error === "unverified_commit" ||
        error.error === "commit_proof_mismatch" ||
        error.error === "projection_dependency_failure"
      )
    ) {
      throw error;
    }
    throw new ProjectionDependencyBoundaryFailure();
  }
}

function validateOutboxLookup(value: unknown):
  | Readonly<{ outcome: "not_found" }>
  | Readonly<{ outcome: "found"; plan: JsonValue }> {
  return requireTrustedOutput(() => {
    const lookup = requireObject(snapshotDescriptorSafeJsonValue(value));
    if (lookup.outcome === "not_found") {
      requireExactKeys(lookup, OUTBOX_NOT_FOUND_KEYS);
      return deepFreeze({ outcome: "not_found" as const });
    }
    if (lookup.outcome === "found") {
      requireExactKeys(lookup, OUTBOX_PLAN_KEYS);
      return deepFreeze({ outcome: "found" as const, plan: lookup.plan });
    }
    fail("invalid_projection_input");
  });
}

function validateOutboxSealResult(value: unknown):
  | Readonly<{ outcome: "sealed" | "existing_same"; plan: JsonValue }>
  | Readonly<{ outcome: "receipt_conflict" | "digest_conflict" | "plan_conflict" }> {
  return requireTrustedOutput(() => {
    const result = requireObject(snapshotDescriptorSafeJsonValue(value));
    if (result.outcome === "sealed" || result.outcome === "existing_same") {
      requireExactKeys(result, OUTBOX_PLAN_KEYS);
      return deepFreeze({ outcome: result.outcome, plan: result.plan });
    }
    if (
      result.outcome === "receipt_conflict" ||
      result.outcome === "digest_conflict" ||
      result.outcome === "plan_conflict"
    ) {
      requireExactKeys(result, OUTBOX_NOT_FOUND_KEYS);
      return deepFreeze({ outcome: result.outcome });
    }
    fail("invalid_projection_input");
  });
}

function validateReturnedLocalPlan(
  value: JsonValue,
  localPlan: ProjectionWritePlan,
): ProjectionWritePlan {
  const plan = requireTrustedOutput(() => snapshotDescriptorSafeJsonValue(value));
  if (!sameJson(plan, localPlan as unknown as JsonValue)) fail("projection_conflict");
  return plan as unknown as ProjectionWritePlan;
}

function addBeforeSensitiveValues(
  before: ValidatedProjectionBefore,
  forbiddenValues: Set<string>,
): void {
  forbiddenValues.add(before.day7Result);
  forbiddenValues.add(before.day30Result);
  forbiddenValues.add(before.humanConclusion);
}

function validateCurrentBeforeMatchesPlan(
  before: ValidatedProjectionBefore,
  source: ValidatedProjectionSource,
  plan: ProjectionWritePlan,
  hashJsonValue: W6ReopenProjectionHasher,
): void {
  try {
    validateMembershipBinding(source, before);
  } catch (error) {
    if (
      error instanceof W6ReopenProjectionFailure &&
      error.error === "projection_dependency_failure"
    ) {
      throw error;
    }
    fail("projection_conflict");
  }
  for (const record of before.recurrenceRecords) {
    if (record.projection_contract !== "reopen_snapshot.v1") continue;
    const previous = requireObject(record.previous_projection);
    const expectedPreviousSha256 = hashProjectionValue({
      contract: W6_REOPEN_PREVIOUS_PROJECTION_HASH_CONTRACT,
      day_7_result: previous.day_7_result,
      day_30_result: previous.day_30_result,
      human_conclusion: previous.human_conclusion,
    }, hashJsonValue);
    if (record.previous_projection_sha256 !== expectedPreviousSha256) {
      fail("projection_conflict");
    }
  }

  const previousProjection: JsonObject = {
    day_7_result: before.day7Result,
    day_30_result: before.day30Result,
    human_conclusion: before.humanConclusion,
  };
  const previousProjectionSha256 = hashProjectionValue({
    contract: W6_REOPEN_PREVIOUS_PROJECTION_HASH_CONTRACT,
    ...previousProjection,
  }, hashJsonValue);
  const reopenSnapshot: JsonObject = {
    projection_contract: "reopen_snapshot.v1",
    data_scope: "synthetic_experiment",
    evidence_class: "synthetic_experiment",
    source_receipt_sha256: source.sourceReceiptSha256,
    projection_idempotency_key: source.sourceReceiptSha256,
    committed_at: source.committedAt,
    previous_projection: previousProjection,
    previous_projection_sha256: previousProjectionSha256,
  };
  const recurrenceRecordsAfter: JsonValue[] = [...before.recurrenceRecords, reopenSnapshot];
  const clusterBeforeMaterial: JsonObject = {
    contract: W6_REOPEN_CLUSTER_BEFORE_HASH_CONTRACT,
    data_scope: "synthetic_experiment",
    cluster_id: before.clusterId,
    member_case_ids: [...before.memberCaseIds],
    status: "已归档",
    recurrence_records: [...before.recurrenceRecords],
    updated_at: before.clusterUpdatedAt,
  };
  const clusterAfterMaterial: JsonObject = {
    contract: W6_REOPEN_CLUSTER_AFTER_HASH_CONTRACT,
    data_scope: "synthetic_experiment",
    cluster_id: source.clusterId,
    member_case_ids: [...source.memberCaseIds],
    status: "观察中",
    recurrence_records: recurrenceRecordsAfter,
    updated_at: source.committedAt,
  };
  const improvementBeforeMaterial: JsonObject = {
    contract: W6_REOPEN_IMPROVEMENT_BEFORE_HASH_CONTRACT,
    data_scope: "synthetic_experiment",
    improvement_id: before.improvementId,
    status: "已完成",
    ...previousProjection,
    updated_at: before.improvementUpdatedAt,
  };
  const improvementAfterMaterial: JsonObject = {
    contract: W6_REOPEN_IMPROVEMENT_AFTER_HASH_CONTRACT,
    data_scope: "synthetic_experiment",
    improvement_id: source.improvementId,
    status: "观察中",
    day_7_result: null,
    day_30_result: null,
    human_conclusion: null,
    updated_at: source.committedAt,
  };
  const clusterBeforeSha256 = hashProjectionValue(clusterBeforeMaterial, hashJsonValue);
  const clusterAfterSha256 = hashProjectionValue(clusterAfterMaterial, hashJsonValue);
  const improvementBeforeSha256 = hashProjectionValue(
    improvementBeforeMaterial,
    hashJsonValue,
  );
  const improvementAfterSha256 = hashProjectionValue(
    improvementAfterMaterial,
    hashJsonValue,
  );
  const expectedClusterTarget: JsonObject = {
    target: "clusters",
    selector: { field: "cluster_id", value: source.clusterId },
    expected_before_sha256: clusterBeforeSha256,
    expected_after_sha256: clusterAfterSha256,
    patch: {
      member_case_ids: [...source.memberCaseIds],
      status: "观察中",
      recurrence_records: recurrenceRecordsAfter,
      updated_at: source.committedAt,
    },
  };
  const expectedImprovementTarget: JsonObject = {
    target: "improvements",
    selector: { field: "improvement_id", value: source.improvementId },
    expected_before_sha256: improvementBeforeSha256,
    expected_after_sha256: improvementAfterSha256,
    patch: {
      status: "观察中",
      day_7_result: null,
      day_30_result: null,
      human_conclusion: null,
      updated_at: source.committedAt,
    },
  };
  if (
    !sameJson(plan.write_targets[0] as unknown as JsonValue, expectedClusterTarget) ||
    !sameJson(plan.write_targets[1] as unknown as JsonValue, expectedImprovementTarget)
  ) {
    fail("projection_conflict");
  }
}

export function validateW6ReopenAuthoritativePlanBindingForTest(
  sourceInput: unknown,
  beforeInput: unknown,
  planInput: unknown,
  hashJsonValue: W6ReopenProjectionHasher = createWorkflowEventFingerprint,
): void {
  const sourceSnapshot = snapshotDescriptorSafeJsonValue(sourceInput);
  const beforeSnapshot = snapshotDescriptorSafeJsonValue(beforeInput);
  const planSnapshot = snapshotDescriptorSafeJsonValue(planInput);
  const source = validateProjectionSource(sourceSnapshot);
  const before = validateProjectionBefore(beforeSnapshot);
  const plan = validateAuthoritativeProjectionPlan(planSnapshot, source, hashJsonValue);
  validateCurrentBeforeMatchesPlan(before, source, plan, hashJsonValue);
}

async function resolveG5AuthoritativePlan(
  plan: ProjectionWritePlan,
  source: ValidatedProjectionSource,
  ports: W6ReopenProjectionCompositionPorts,
  forbiddenValues: Set<string>,
): Promise<RedactedProjectionArtifact> {
  const evidenceValue = await callProjectionDependency(
    () => ports.outbox.loadExecutionEvidence(plan.sealed_plan_sha256),
  );
  const evidenceSnapshot = requireTrustedOutput(
    () => snapshotDescriptorSafeJsonValue(evidenceValue),
  );
  const executionEvidence = requireTrustedOutput(
    () => validateExecutionEvidence(evidenceSnapshot, plan),
  );
  if (executionEvidence === null) fail("projection_conflict");
  const observedValue = await callProjectionDependency(
    () => ports.base.loadProjectionStateByBusinessKeys({
      cluster_id: source.clusterId,
      improvement_id: source.improvementId,
    }),
  );
  const observedSnapshot = requireTrustedOutput(
    () => snapshotDescriptorSafeJsonValue(observedValue),
  );
  const observed = requireTrustedOutput(
    () => validateProjectionObserved(observedSnapshot),
  );
  for (const value of [observed.day7Result, observed.day30Result, observed.humanConclusion]) {
    if (value !== null) forbiddenValues.add(value);
  }
  const reconciled = reconcileProjectionSnapshots(
    plan as unknown as JsonValue,
    observedSnapshot,
    evidenceSnapshot,
  );
  return reconciled.artifact;
}

async function handleCommittedProjection(
  trigger: Extract<FeishuW6ReopenProjectionTrigger, { kind: "committed_new_reopen" }>,
  ports: W6ReopenProjectionCompositionPorts,
  hashJsonValue: W6ReopenProjectionHasher,
  forbiddenValues: Set<string>,
): Promise<RedactedProjectionArtifact> {
  const proof = await callProjectionDependency(
    () => ports.source.loadFirstCommittedReopenByReceiptId(trigger.receipt_id),
  );
  const envelope = verifyTrustedCommittedSource(proof, trigger.receipt_id, hashJsonValue);
  const sourceSnapshot = snapshotDescriptorSafeJsonValue(envelope.projection_source);
  const source = validateProjectionSource(sourceSnapshot);
  forbiddenValues.add(source.sourceReceiptId);

  const lookupValue = await callProjectionDependency(
    () => ports.outbox.loadByReceiptId(source.sourceReceiptId),
  );
  const lookup = validateOutboxLookup(lookupValue);
  if (lookup.outcome === "found") {
    const authoritativePlan = requireTrustedOutput(
      () => validateAuthoritativeProjectionPlan(lookup.plan, source, hashJsonValue),
    );
    const bindingValue = await callProjectionDependency(
      () => ports.outbox.sealPlanIfAbsent(deepFreeze({
        plan: authoritativePlan,
        canonical_receipt_material: envelope.canonical_receipt_material,
      })),
    );
    const binding = validateOutboxSealResult(bindingValue);
    if (binding.outcome === "receipt_conflict") {
      return createPublicRejectArtifact("commit_proof_mismatch");
    }
    if (binding.outcome === "digest_conflict" || binding.outcome === "plan_conflict") {
      return createPublicRejectArtifact("projection_conflict");
    }
    if (binding.outcome === "sealed") {
      throw new ProjectionDependencyBoundaryFailure();
    }
    if (!("plan" in binding)) {
      throw new ProjectionDependencyBoundaryFailure();
    }
    const reboundPlan = validateReturnedLocalPlan(binding.plan, authoritativePlan);
    return resolveG5AuthoritativePlan(
      reboundPlan,
      source,
      ports,
      forbiddenValues,
    );
  }

  const beforeValue = await callProjectionDependency(
    () => ports.base.loadProjectionStateByBusinessKeys({
      cluster_id: source.clusterId,
      improvement_id: source.improvementId,
    }),
  );
  const beforeSnapshot = requireTrustedOutput(
    () => snapshotDescriptorSafeJsonValue(beforeValue),
  );
  const before = requireTrustedOutput(() => validateProjectionBefore(beforeSnapshot));
  addBeforeSensitiveValues(before, forbiddenValues);
  const capabilityValue = await callProjectionDependency(
    () => ports.capability.loadCurrentAttestation(),
  );
  const capabilitySnapshot = requireTrustedOutput(
    () => snapshotDescriptorSafeJsonValue(capabilityValue),
  );
  requireTrustedOutput(() => validateCapability(capabilitySnapshot));
  const checkedAtValue = callSynchronousProjectionDependency(() => ports.clock.nowIsoUtc());
  const checkedAtSnapshot = requireTrustedOutput(
    () => snapshotDescriptorSafeJsonValue(checkedAtValue),
  );
  requireTrustedOutput(() => requireTimestamp(checkedAtSnapshot));
  const planned = planWithHasher(
    sourceSnapshot,
    beforeSnapshot,
    capabilitySnapshot,
    checkedAtSnapshot,
    hashJsonValue,
  );
  if (planned.decision === "reject") {
    return planned.artifact.safe_error === "invalid_projection_input"
      ? createPublicRejectArtifact("projection_dependency_failure")
      : planned.artifact;
  }

  const sealValue = await callProjectionDependency(
    () => ports.outbox.sealPlanIfAbsent({
      plan: planned.plan,
      canonical_receipt_material: envelope.canonical_receipt_material,
    }),
  );
  const seal = validateOutboxSealResult(sealValue);
  if (seal.outcome === "receipt_conflict") {
    return createPublicRejectArtifact("commit_proof_mismatch");
  }
  if (seal.outcome === "digest_conflict" || seal.outcome === "plan_conflict") {
    return createPublicRejectArtifact("projection_conflict");
  }
  if (!("plan" in seal)) return createPublicRejectArtifact("projection_dependency_failure");
  const authoritativePlan = validateReturnedLocalPlan(seal.plan, planned.plan);
  if (seal.outcome === "sealed") return planned.artifact;
  return resolveG5AuthoritativePlan(
    authoritativePlan,
    source,
    ports,
    forbiddenValues,
  );
}

function createCompositionInternal(
  ports: W6ReopenProjectionCompositionPorts,
  hashJsonValue: W6ReopenProjectionHasher,
  artifactFault: ((artifact: RedactedProjectionArtifact) => unknown) | undefined,
  additionalSensitiveValues: readonly string[],
): W6ReopenProjectionComposition {
  const composition = {
    async handle(
      triggerValue: FeishuW6ReopenProjectionTrigger,
    ): Promise<RedactedProjectionArtifact> {
      const forbiddenValues = new Set(additionalSensitiveValues);
      let artifact: RedactedProjectionArtifact;
      try {
        const trigger = validateTrigger(triggerValue);
        if (trigger.kind === "authorized_exact_replay") {
          artifact = createPublicNoOpArtifact();
        } else if (trigger.kind === "authorized_near_conflict") {
          artifact = createPublicRejectArtifact("event_conflict");
        } else {
          artifact = await handleCommittedProjection(
            trigger,
            ports,
            hashJsonValue,
            forbiddenValues,
          );
        }
      } catch (error) {
        if (error instanceof W6ReopenProjectionFailure) {
          artifact = createPublicRejectArtifact(error.error);
        } else {
          artifact = createPublicRejectArtifact("projection_dependency_failure");
        }
      }
      let candidate: unknown = artifact;
      if (artifactFault !== undefined) {
        try {
          candidate = artifactFault(artifact);
        } catch {
          candidate = null;
        }
      }
      return finalizePublicArtifact(candidate, forbiddenValues);
    },
  };
  return Object.freeze(composition);
}

export function createW6ReopenProjectionComposition(
  ports: W6ReopenProjectionCompositionPorts,
): W6ReopenProjectionComposition {
  return createCompositionInternal(
    ports,
    createWorkflowEventFingerprint,
    undefined,
    [],
  );
}

export function createW6ReopenProjectionCompositionForTest(
  ports: W6ReopenProjectionCompositionPorts,
  options: W6ReopenProjectionCompositionTestOptions,
): W6ReopenProjectionComposition {
  return createCompositionInternal(
    ports,
    options.hashJsonValue,
    options.artifactFault,
    options.additionalSensitiveValues ?? [],
  );
}
