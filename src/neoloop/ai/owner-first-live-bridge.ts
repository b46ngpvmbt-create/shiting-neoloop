import type {
  AiNodeEnvelope,
  AuditRecord,
  JsonValue,
} from "../contracts/model.js";
import type {
  AiNodeRunRequest,
  AuditSink,
  Clock,
  IdGenerator,
} from "../contracts/ports.js";
import { validateAiNodeEnvelope } from "../contracts/validation.js";
import {
  canonicalJsonSha256,
  snapshotPlainJsonData,
} from "../io/plain-json.js";
import type { AiNodeInvocation, AiNodeInvoker } from "./invoker.js";
import { bindOwnerFirstN1Evidence } from "./owner-first-n1-evidence-binding.js";
import { inspectUntrustedText } from "./policy.js";
import {
  createAiInputHash,
  AuditedAiNodeRunner,
  runAuditedAiNodeAttempt,
} from "./runner.js";
import {
  validateNodeCandidate,
  validateNodeRequestDefinition,
} from "./validation.js";

export const OWNER_FIRST_LIVE_PROFILE_IDS = [
  "n1-default",
  "n2-default",
  "n3-default",
  "n4-default",
  "n6-responsibility",
  "n5-cross-event",
  "n6-root-cause",
  "n7-knowledge-draft",
  "n7-insight-summary",
] as const;

export type OwnerFirstLiveProfileId = (typeof OWNER_FIRST_LIVE_PROFILE_IDS)[number];

export const OWNER_FIRST_LIVE_BRIDGE_ISSUE_CODES = [
  "input_invalid_utf8",
  "input_too_large",
  "input_frame_invalid",
  "input_not_json_object",
  "input_duplicate_key",
  "profile_not_allowed",
  "input_shape_invalid",
  "data_scope_invalid",
  "observed_at_invalid",
  "request_contract_mismatch",
  "request_definition_invalid",
  "non_synthetic_input",
  "candidate_count_invalid",
  "candidate_validation_failed",
  "candidate_injection_boundary_violation",
  "exact_14_invalid",
  "internal_validation_error",
] as const;

export type OwnerFirstLiveBridgeIssueCode =
  (typeof OWNER_FIRST_LIVE_BRIDGE_ISSUE_CODES)[number];

export type OwnerFirstLiveBridgeClassification =
  | "exact_14_ready_for_owner_confirmation"
  | "needs_human";

interface ProfileContract {
  node: "N1" | "N2" | "N3" | "N4" | "N5" | "N6" | "N7";
  mode: string;
  version: string;
  object_type: "raw_feedback" | "case" | "cluster";
}

const PROFILE_CONTRACTS: Record<OwnerFirstLiveProfileId, ProfileContract> = {
  "n1-default": {
    node: "N1",
    mode: "default",
    version: "N1-1.0.0-draft.2",
    object_type: "raw_feedback",
  },
  "n2-default": {
    node: "N2",
    mode: "default",
    version: "N2-1.0.0-draft.2",
    object_type: "raw_feedback",
  },
  "n3-default": {
    node: "N3",
    mode: "default",
    version: "N3-1.0.0-draft.2",
    object_type: "raw_feedback",
  },
  "n4-default": {
    node: "N4",
    mode: "default",
    version: "N4-1.0.0-draft.2",
    object_type: "case",
  },
  "n5-cross-event": {
    node: "N5",
    mode: "cross_event_clustering",
    version: "N5-cross-event-1.0.0-draft.2",
    object_type: "case",
  },
  "n6-responsibility": {
    node: "N6",
    mode: "responsibility_routing",
    version: "N6-responsibility-routing-1.0.0-draft.2",
    object_type: "case",
  },
  "n6-root-cause": {
    node: "N6",
    mode: "root_cause_hypothesis",
    version: "N6-root-cause-1.0.0-draft.3",
    object_type: "cluster",
  },
  "n7-knowledge-draft": {
    node: "N7",
    mode: "knowledge_draft",
    version: "N7-1.0.0-draft.2",
    object_type: "case",
  },
  "n7-insight-summary": {
    node: "N7",
    mode: "insight_summary",
    version: "N7-1.0.0-draft.2",
    object_type: "case",
  },
};

const PROFILE_ID_SET = new Set<string>(OWNER_FIRST_LIVE_PROFILE_IDS);
const SYNTHETIC_ID_PATTERN = /^SYN-[A-Z0-9][A-Z0-9_-]{2,127}$/u;
const INPUT_KEYS = [
  "profile_id",
  "data_scope",
  "observed_at",
  "request",
  "candidates",
] as const;

export interface OwnerFirstLiveBridgeInput {
  profile_id: OwnerFirstLiveProfileId;
  data_scope: "synthetic_experiment";
  observed_at: string;
  request: AiNodeRunRequest<JsonValue>;
  candidates: unknown[];
}

export interface OwnerFirstLiveAttemptInput {
  profile_id: OwnerFirstLiveProfileId;
  data_scope: "synthetic_experiment";
  observed_at: string;
  request: AiNodeRunRequest<JsonValue>;
  attempt: 1 | 2;
  candidate: unknown;
}

export interface OwnerFirstLiveAttemptReport {
  schema_version: "owner_first_live_attempt_report.v1";
  profile_id: OwnerFirstLiveProfileId | null;
  classification: "exact_14_ready_for_owner_confirmation" | "repair_required" | "needs_human";
  route: "continue" | "retry" | "stop";
  request_sha256: string | null;
  input_hash: string | null;
  attempt: 1 | 2 | null;
  envelope: AiNodeEnvelope<JsonValue> | null;
  write_plan: OwnerFirstLiveWritePlan | null;
  planned_business_write_count: 0;
  planned_audit_write_count: 0 | 1;
  issue_codes: OwnerFirstLiveBridgeIssueCode[];
}

export interface OwnerFirstLiveWritePlan {
  schema_version: "owner_first_live_write_plan.v1";
  confirmation_required: true;
  data_scope: "synthetic_experiment";
  profile_id: OwnerFirstLiveProfileId;
  request_sha256: string;
  input_hash: string;
  business_write_count: 0;
  audit_write_count: number;
  operations: Array<{
    kind: "append_ai_audit";
    operation_index: number;
    operation_key: string;
    table_alias: "ai_audit";
    audit_record: AuditRecord;
  }>;
  prohibited_effects: [
    "vehicle_control",
    "automatic_liability",
    "automatic_compensation",
    "final_root_cause",
    "notification",
  ];
}

export interface OwnerFirstLiveBridgeReport {
  schema_version: "owner_first_live_bridge_report.v1";
  profile_id: OwnerFirstLiveProfileId | null;
  classification: OwnerFirstLiveBridgeClassification;
  request_sha256: string | null;
  input_hash: string | null;
  attempt_count: number;
  envelope: AiNodeEnvelope<JsonValue> | null;
  write_plan: OwnerFirstLiveWritePlan | null;
  planned_business_write_count: 0;
  planned_audit_write_count: number;
  issue_codes: OwnerFirstLiveBridgeIssueCode[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length && keys.every((key) => actual.includes(key));
}

function isProfileId(value: unknown): value is OwnerFirstLiveProfileId {
  return typeof value === "string" && PROFILE_ID_SET.has(value);
}

function isExactObservedAt(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    return new Date(value).toISOString() === value;
  } catch {
    return false;
  }
}

function failure(
  profileId: OwnerFirstLiveProfileId | null,
  issueCode: OwnerFirstLiveBridgeIssueCode,
  options: {
    requestSha256?: string | null;
    inputHash?: string | null;
    attemptCount?: number;
  } = {},
): OwnerFirstLiveBridgeReport {
  return {
    schema_version: "owner_first_live_bridge_report.v1",
    profile_id: profileId,
    classification: "needs_human",
    request_sha256: options.requestSha256 ?? null,
    input_hash: options.inputHash ?? null,
    attempt_count: options.attemptCount ?? 0,
    envelope: null,
    write_plan: null,
    planned_business_write_count: 0,
    planned_audit_write_count: 0,
    issue_codes: [issueCode],
  };
}

export function makeOwnerFirstLiveBridgeFailureReport(
  issueCode: OwnerFirstLiveBridgeIssueCode,
): OwnerFirstLiveBridgeReport {
  return failure(null, issueCode);
}

function classifyFailure(
  envelope: AiNodeEnvelope<JsonValue>,
  n1BindingInjectionDetected: boolean,
): OwnerFirstLiveBridgeIssueCode {
  if (
    n1BindingInjectionDetected
    || envelope.validation.errors.some((error) => /prompt-injection|prohibited automatic|final root cause/iu.test(error))
  ) {
    return "candidate_injection_boundary_violation";
  }
  return "candidate_validation_failed";
}

class BridgeAuditSink implements AuditSink {
  readonly records: AuditRecord[] = [];

  async append(record: AuditRecord): Promise<void> {
    const boundary = snapshotPlainJsonData(record);
    if (!boundary.ok || !isRecord(boundary.value)) {
      throw new Error("audit record crossed the plain JSON boundary");
    }
    this.records.push(structuredClone(record));
  }
}

class BridgeIds implements IdGenerator {
  private current = 0;

  constructor(private readonly seed: string) {}

  nextId(namespace: string): string {
    this.current += 1;
    return `SYN-LIVE-DEMO-${namespace.toUpperCase()}-${this.seed}-${String(this.current).padStart(2, "0")}`;
  }
}

class CandidateInvoker implements AiNodeInvoker {
  private index = 0;

  constructor(
    private readonly request: AiNodeRunRequest<JsonValue>,
    private readonly inputHash: string,
    private readonly candidates: unknown[],
  ) {}

  async invoke(invocation: AiNodeInvocation): Promise<unknown> {
    if (
      invocation.node !== this.request.node
      || invocation.mode !== this.request.mode
      || invocation.version !== this.request.version
      || invocation.object_ref.object_type !== this.request.object_ref.object_type
      || invocation.object_ref.object_id !== this.request.object_ref.object_id
      || invocation.input_hash !== this.inputHash
      || invocation.retry_count !== this.index
      || invocation.data_scope !== "synthetic_experiment"
      || invocation.security_context.exposed_capabilities.length !== 0
    ) {
      throw new Error("bridge invocation identity mismatch");
    }
    const candidate = this.candidates[this.index];
    this.index += 1;
    return candidate;
  }
}

function makeWritePlan(
  profileId: OwnerFirstLiveProfileId,
  requestSha256: string,
  inputHash: string,
  records: AuditRecord[],
): OwnerFirstLiveWritePlan {
  return {
    schema_version: "owner_first_live_write_plan.v1",
    confirmation_required: true,
    data_scope: "synthetic_experiment",
    profile_id: profileId,
    request_sha256: requestSha256,
    input_hash: inputHash,
    business_write_count: 0,
    audit_write_count: records.length,
    operations: records.map((record, index) => ({
      kind: "append_ai_audit",
      operation_index: index,
      operation_key: canonicalJsonSha256(
        record as unknown as JsonValue,
        "neoloop:owner-first-live-audit-operation:v1",
      ),
      table_alias: "ai_audit",
      audit_record: structuredClone(record),
    })),
    prohibited_effects: [
      "vehicle_control",
      "automatic_liability",
      "automatic_compensation",
      "final_root_cause",
      "notification",
    ],
  };
}

const ATTEMPT_INPUT_KEYS = [
  "profile_id",
  "data_scope",
  "observed_at",
  "request",
  "attempt",
  "candidate",
] as const;

function attemptFailure(
  profileId: OwnerFirstLiveProfileId | null,
  issueCode: OwnerFirstLiveBridgeIssueCode,
  options: {
    requestSha256?: string | null;
    inputHash?: string | null;
    attempt?: 1 | 2 | null;
    writePlan?: OwnerFirstLiveWritePlan | null;
  } = {},
): OwnerFirstLiveAttemptReport {
  return {
    schema_version: "owner_first_live_attempt_report.v1",
    profile_id: profileId,
    classification: "needs_human",
    route: "stop",
    request_sha256: options.requestSha256 ?? null,
    input_hash: options.inputHash ?? null,
    attempt: options.attempt ?? null,
    envelope: null,
    write_plan: options.writePlan ?? null,
    planned_business_write_count: 0,
    planned_audit_write_count: options.writePlan ? 1 : 0,
    issue_codes: [issueCode],
  };
}

/**
 * Validates and audits one already-produced candidate. The caller owns the
 * durable two-attempt ledger; this function never invokes a model or advances
 * to another attempt by itself.
 */
export async function runOwnerFirstLiveAttempt(
  input: unknown,
): Promise<OwnerFirstLiveAttemptReport> {
  try {
    const boundary = snapshotPlainJsonData(input);
    if (!boundary.ok || !isRecord(boundary.value) || !hasExactKeys(boundary.value, ATTEMPT_INPUT_KEYS)) {
      return attemptFailure(null, "input_shape_invalid");
    }
    const snapshot = boundary.value;
    if (!isProfileId(snapshot.profile_id)) return attemptFailure(null, "profile_not_allowed");
    const profileId = snapshot.profile_id;
    if (snapshot.data_scope !== "synthetic_experiment") {
      return attemptFailure(profileId, "data_scope_invalid");
    }
    if (!isExactObservedAt(snapshot.observed_at)) {
      return attemptFailure(profileId, "observed_at_invalid");
    }
    if (snapshot.attempt !== 1 && snapshot.attempt !== 2) {
      return attemptFailure(profileId, "candidate_count_invalid");
    }
    const attempt = snapshot.attempt;
    if (!isRecord(snapshot.request)) {
      return attemptFailure(profileId, "request_contract_mismatch", { attempt });
    }
    const request = snapshot.request as unknown as AiNodeRunRequest<JsonValue>;
    const contract = PROFILE_CONTRACTS[profileId];
    if (
      request.node !== contract.node
      || request.mode !== contract.mode
      || request.version !== contract.version
      || !isRecord(request.object_ref)
      || request.object_ref.object_type !== contract.object_type
      || typeof request.object_ref.object_id !== "string"
    ) {
      return attemptFailure(profileId, "request_contract_mismatch", { attempt });
    }
    if (!SYNTHETIC_ID_PATTERN.test(request.object_ref.object_id)) {
      return attemptFailure(profileId, "non_synthetic_input", { attempt });
    }
    const requestValidation = validateNodeRequestDefinition(request);
    if (!requestValidation.valid) {
      return attemptFailure(profileId, "request_definition_invalid", { attempt });
    }

    const requestSha256 = canonicalJsonSha256(
      request as unknown as JsonValue,
      "neoloop:owner-first-live-request:v1",
    );
    const inputHash = createAiInputHash(request);
    let candidate: unknown = snapshot.candidate;
    let injectionDetected = false;
    if (profileId === "n1-default") {
      injectionDetected = isRecord(request.input)
        && typeof request.input.original_text === "string"
        && inspectUntrustedText(request.input.original_text).prompt_injection_detected;
      const binding = bindOwnerFirstN1Evidence(request, candidate);
      if (binding.status === "bound") {
        candidate = binding.candidate;
      } else {
        injectionDetected = injectionDetected
          || binding.issue_codes.includes("candidate_injection_boundary_violation");
        candidate = null;
      }
    }

    const audit = new BridgeAuditSink();
    const clock: Clock = {
      source: "test",
      now: () => new Date(snapshot.observed_at as string),
    };
    const envelope = await runAuditedAiNodeAttempt(
      request,
      candidate,
      attempt === 1 ? 0 : 1,
      {
        audit,
        clock,
        ids: new BridgeIds(`${requestSha256.slice(0, 10)}-A${attempt}`),
        data_scope: "synthetic_experiment",
      },
    ) as AiNodeEnvelope<JsonValue>;
    if (audit.records.length !== 1) {
      return attemptFailure(profileId, "internal_validation_error", {
        requestSha256,
        inputHash,
        attempt,
      });
    }
    const writePlan = makeWritePlan(profileId, requestSha256, inputHash, audit.records);
    const exactBoundary = validateAiNodeEnvelope(envelope);
    if (!exactBoundary.valid) {
      return attemptFailure(profileId, "exact_14_invalid", {
        requestSha256,
        inputHash,
        attempt,
        writePlan,
      });
    }
    if (envelope.status === "ok" && envelope.validation.valid === true) {
      return {
        schema_version: "owner_first_live_attempt_report.v1",
        profile_id: profileId,
        classification: "exact_14_ready_for_owner_confirmation",
        route: "continue",
        request_sha256: requestSha256,
        input_hash: inputHash,
        attempt,
        envelope: structuredClone(envelope),
        write_plan: writePlan,
        planned_business_write_count: 0,
        planned_audit_write_count: 1,
        issue_codes: [],
      };
    }

    const issueCode = classifyFailure(envelope, injectionDetected);
    if (attempt === 1 && issueCode !== "candidate_injection_boundary_violation") {
      return {
        schema_version: "owner_first_live_attempt_report.v1",
        profile_id: profileId,
        classification: "repair_required",
        route: "retry",
        request_sha256: requestSha256,
        input_hash: inputHash,
        attempt,
        envelope: null,
        write_plan: writePlan,
        planned_business_write_count: 0,
        planned_audit_write_count: 1,
        issue_codes: [issueCode],
      };
    }
    return attemptFailure(profileId, issueCode, {
      requestSha256,
      inputHash,
      attempt,
      writePlan,
    });
  } catch {
    return attemptFailure(null, "internal_validation_error");
  }
}

export async function runOwnerFirstLiveBridge(
  input: unknown,
): Promise<OwnerFirstLiveBridgeReport> {
  try {
    const boundary = snapshotPlainJsonData(input);
    if (!boundary.ok || !isRecord(boundary.value) || !hasExactKeys(boundary.value, INPUT_KEYS)) {
      return failure(null, "input_shape_invalid");
    }
    const snapshot = boundary.value;
    if (!isProfileId(snapshot.profile_id)) return failure(null, "profile_not_allowed");
    const profileId = snapshot.profile_id;
    if (snapshot.data_scope !== "synthetic_experiment") return failure(profileId, "data_scope_invalid");
    if (!isExactObservedAt(snapshot.observed_at)) return failure(profileId, "observed_at_invalid");
    if (!isRecord(snapshot.request)) return failure(profileId, "request_contract_mismatch");

    const request = snapshot.request as unknown as AiNodeRunRequest<JsonValue>;
    const contract = PROFILE_CONTRACTS[profileId];
    if (
      request.node !== contract.node
      || request.mode !== contract.mode
      || request.version !== contract.version
      || !isRecord(request.object_ref)
      || request.object_ref.object_type !== contract.object_type
      || typeof request.object_ref.object_id !== "string"
    ) {
      return failure(profileId, "request_contract_mismatch");
    }
    if (!SYNTHETIC_ID_PATTERN.test(request.object_ref.object_id)) {
      return failure(profileId, "non_synthetic_input");
    }
    const requestValidation = validateNodeRequestDefinition(request);
    if (!requestValidation.valid) return failure(profileId, "request_definition_invalid");
    if (!Array.isArray(snapshot.candidates) || snapshot.candidates.length < 1 || snapshot.candidates.length > 2) {
      return failure(profileId, "candidate_count_invalid");
    }

    const requestSha256 = canonicalJsonSha256(
      request as unknown as JsonValue,
      "neoloop:owner-first-live-request:v1",
    );
    const inputHash = createAiInputHash(request);
    let n1BindingInjectionDetected = profileId === "n1-default"
      && isRecord(request.input)
      && typeof request.input.original_text === "string"
      && inspectUntrustedText(request.input.original_text).prompt_injection_detected;
    const candidates = snapshot.candidates.map((candidate) => {
      if (profileId !== "n1-default") return candidate;
      const binding = bindOwnerFirstN1Evidence(request, candidate);
      if (binding.status === "bound") return binding.candidate;
      n1BindingInjectionDetected = n1BindingInjectionDetected
        || binding.issue_codes.includes("candidate_injection_boundary_violation");
      return null;
    });

    if (candidates.length === 1) {
      const validation = validateNodeCandidate(request, candidates[0]);
      if (!validation.valid) {
        const injectionDetected = n1BindingInjectionDetected
          || validation.errors.some((error) => /prompt-injection|prohibited automatic|final root cause/iu.test(error));
        return failure(
          profileId,
          injectionDetected
            ? "candidate_injection_boundary_violation"
            : "candidate_validation_failed",
          { requestSha256, inputHash, attemptCount: 1 },
        );
      }
    }

    const audit = new BridgeAuditSink();
    const clock: Clock = {
      source: "test",
      now: () => new Date(snapshot.observed_at as string),
    };
    const runner = new AuditedAiNodeRunner({
      invoker: new CandidateInvoker(request, inputHash, candidates),
      audit,
      clock,
      ids: new BridgeIds(requestSha256.slice(0, 12)),
      data_scope: "synthetic_experiment",
    });
    const envelope = await runner.run(request) as AiNodeEnvelope<JsonValue>;
    const envelopeBoundary = validateAiNodeEnvelope(envelope);
    const attemptCount = audit.records.length;
    if (!envelopeBoundary.valid) {
      return failure(profileId, "exact_14_invalid", { requestSha256, inputHash, attemptCount });
    }
    if (envelope.status !== "ok" || envelope.validation.valid !== true) {
      return failure(profileId, classifyFailure(envelope, n1BindingInjectionDetected), {
        requestSha256,
        inputHash,
        attemptCount,
      });
    }

    const writePlan = makeWritePlan(profileId, requestSha256, inputHash, audit.records);
    return {
      schema_version: "owner_first_live_bridge_report.v1",
      profile_id: profileId,
      classification: "exact_14_ready_for_owner_confirmation",
      request_sha256: requestSha256,
      input_hash: inputHash,
      attempt_count: attemptCount,
      envelope: structuredClone(envelope),
      write_plan: writePlan,
      planned_business_write_count: 0,
      planned_audit_write_count: writePlan.audit_write_count,
      issue_codes: [],
    };
  } catch {
    return failure(null, "internal_validation_error");
  }
}
