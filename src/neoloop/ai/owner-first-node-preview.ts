import type {
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
import { snapshotPlainJsonData } from "../io/plain-json.js";
import { AI_NODE_CANDIDATE_REQUIRED_FIELDS } from "./definitions.js";
import type { AiNodeInvocation, AiNodeInvoker } from "./invoker.js";
import { AuditedAiNodeRunner } from "./runner.js";
import {
  validateNodeCandidate,
  validateNodeRequestDefinition,
} from "./validation.js";

export const OWNER_FIRST_NODE_PROFILE_IDS = [
  "n2-default",
  "n3-default",
  "n4-default",
  "n5-same-event",
  "n5-cross-event",
  "n6-responsibility",
  "n6-root-cause",
  "n7-customer-reply",
  "n7-knowledge-draft",
  "n7-insight-summary",
] as const;

export type OwnerFirstNodeProfileId = (typeof OWNER_FIRST_NODE_PROFILE_IDS)[number];

export const OWNER_FIRST_NODE_ISSUE_CODES = [
  "profile_not_allowed",
  "input_invalid_utf8",
  "input_too_large",
  "input_frame_invalid",
  "input_not_json_object",
  "input_duplicate_key",
  "candidate_missing_required_key",
  "candidate_extra_top_level_key",
  "candidate_invalid_top_level_key_order",
  "candidate_invalid_payload_shape",
  "candidate_invalid_evidence_binding",
  "candidate_invalid_scalar",
  "candidate_injection_boundary_violation",
  "attempt_limit_reached",
  "internal_validation_error",
] as const;

export type OwnerFirstNodeIssueCode = (typeof OWNER_FIRST_NODE_ISSUE_CODES)[number];
export type OwnerFirstNodeClassification = "exact_candidate_validated" | "needs_human";

export interface OwnerFirstNodePreviewReport {
  profile_id: OwnerFirstNodeProfileId | null;
  node: string | null;
  mode: string | null;
  classification: OwnerFirstNodeClassification;
  attempt_count: number;
  candidate_top_level_keys: typeof AI_NODE_CANDIDATE_REQUIRED_FIELDS | null;
  exact_14_generated: boolean;
  issue_codes: OwnerFirstNodeIssueCode[];
}

export interface OwnerFirstNodePreviewDiagnostics {
  invocation_count: number;
  audit_count: number;
  consistent_request_identity: boolean;
  consistent_input_hash: boolean;
  retained_candidate_count: number;
  retained_audit_record_count: number;
  disposed: boolean;
}

export interface OwnerFirstNodePreviewSession {
  readonly request: AiNodeRunRequest<JsonValue>;
  readonly diagnostics: OwnerFirstNodePreviewDiagnostics;
  submit(candidate: unknown): Promise<OwnerFirstNodePreviewReport>;
  dispose(): void;
}

const DATA_SCOPE = "synthetic_experiment" as const;
const FEEDBACK_ID = "SYN-FEEDBACK-OWNER-001";
const ORIGINAL_TEXT = "A 站取货时舱门连续两次无法解锁，任务已经延误。";
const CASE_ID = "SYN-CASE-OWNER-017";
const VEHICLE_ID = "SYN-VEHICLE-OWNER-107";
const TASK_ID = "SYN-TASK-OWNER-8458";
const STATION_ID = "SYN-STATION-OWNER-YZ";
const CURRENT_CASE_ID = "SYN-CASE-OWNER-CURRENT";
const PEER_CASE_ID = "SYN-CASE-OWNER-PEER";
const COUNTER_CASE_ID = "SYN-CASE-OWNER-COUNTER";
const CLUSTER_ID = "SYN-CLUSTER-OWNER-001";
const CURRENT_SUMMARY = "A 站舱门无法解锁，任务发生延误。";
const PEER_SUMMARY = "B 站另一任务出现舱门无法解锁，涉及相同部件批次。";
const KNOWLEDGE_ID = "SYN-KNOWLEDGE-OWNER-APPROVED-001";
const ROUTING_VERSION = "routing-matrix-owner@1.0.0-draft.2";

function n1Output(): JsonValue {
  return {
    fact_spans: [{ fact: ORIGINAL_TEXT, evidence_span_index: 0 }],
    request: ORIGINAL_TEXT,
    request_evidence_span_index: 0,
    entity_clues: {
      vehicle_ids: [],
      task_ids: [],
      station_names: ["A 站"],
    },
  };
}

function n4Input(): JsonValue {
  return {
    case_facts: {
      source_ref: CASE_ID,
      facts: [
        `车辆 ${VEHICLE_ID} 正在执行任务 ${TASK_ID}。`,
        `异常发生在站点 ${STATION_ID}。`,
      ],
    },
    vehicle_candidates: [{
      vehicle_id: VEHICLE_ID,
      station_id: STATION_ID,
      source_ref: VEHICLE_ID,
      evidence_text: `车辆 ${VEHICLE_ID} 当前站点为 ${STATION_ID}。`,
    }],
    task_candidates: [{
      task_id: TASK_ID,
      vehicle_id: VEHICLE_ID,
      station_id: STATION_ID,
      source_ref: TASK_ID,
      evidence_text: `任务 ${TASK_ID} 由车辆 ${VEHICLE_ID} 从站点 ${STATION_ID} 执行。`,
    }],
    site_candidates: [{
      station_id: STATION_ID,
      source_ref: STATION_ID,
      evidence_text: `站点 ${STATION_ID} 为合成场景站点。`,
    }],
  };
}

function n5Input(crossEvent: boolean): JsonValue {
  return {
    case_facts: {
      current: crossEvent
        ? {
            case_id: CURRENT_CASE_ID,
            status: "已关闭",
            workflow_readiness: "closed",
            summary: CURRENT_SUMMARY,
            same_event_resolution: "not_required",
            cluster_id: null,
          }
        : { case_id: CURRENT_CASE_ID, facts: [CURRENT_SUMMARY] },
      candidates: [crossEvent
        ? {
            case_id: PEER_CASE_ID,
            status: "已关闭",
            workflow_readiness: "closed",
            summary: PEER_SUMMARY,
            same_event_resolution: "keep_separate",
            cluster_id: null,
          }
        : { case_id: PEER_CASE_ID, facts: [PEER_SUMMARY] }],
    },
    time: {
      current: crossEvent
        ? { case_id: CURRENT_CASE_ID, closed_at: "2026-08-01T02:00:00.000Z" }
        : { case_id: CURRENT_CASE_ID, occurred_at: "2026-08-01T02:00:00.000Z" },
      candidates: [crossEvent
        ? { case_id: PEER_CASE_ID, closed_at: "2026-07-25T02:00:00.000Z" }
        : { case_id: PEER_CASE_ID, occurred_at: "2026-08-01T02:03:00.000Z" }],
    },
    confirmed_entities: {
      current: {
        case_id: CURRENT_CASE_ID,
        formal_entity: crossEvent
          ? { vehicle_id: "SYN-VEHICLE-A", task_id: "SYN-TASK-A", station_id: "SYN-STATION-A" }
          : null,
      },
      candidates: [{
        case_id: PEER_CASE_ID,
        formal_entity: crossEvent
          ? { vehicle_id: "SYN-VEHICLE-B", task_id: "SYN-TASK-B", station_id: "SYN-STATION-B" }
          : null,
      }],
    },
    source_reference: {
      current: { case_id: CURRENT_CASE_ID, source_ref: `case:${CURRENT_CASE_ID}` },
      candidates: [{ case_id: PEER_CASE_ID, source_ref: `case:${PEER_CASE_ID}` }],
    },
  };
}

function n6ResponsibilityInput(): JsonValue {
  return {
    evidence: [
      { source_ref: CASE_ID, text: `站点 ${STATION_ID} 的问题分类为舱门/柜体。` },
      {
        source_ref: "SYN-ROUTING-OWNER-002",
        text: "SYN-ROUTING-OWNER-002 将该组合候选路由至车辆运维，状态为待企业验证。",
      },
      {
        source_ref: "SYN-ROUTING-OWNER-014",
        text: "SYN-ROUTING-OWNER-014 将该组合候选路由至车辆运维+产品，状态为待企业验证。",
      },
    ],
    responsibility_matrix: [
      {
        routing_rule_id: "SYN-ROUTING-OWNER-002",
        rule_version: ROUTING_VERSION,
        station_id: STATION_ID,
        issue_type: "舱门/柜体",
        default_team: "车辆运维",
        reviewer_role: "待企业确认",
        sla_rule_version: "legacy-registration-demo-v1",
        status: "待企业验证",
        evidence_class: "enterprise_pending",
      },
      {
        routing_rule_id: "SYN-ROUTING-OWNER-014",
        rule_version: ROUTING_VERSION,
        station_id: STATION_ID,
        issue_type: "舱门/柜体",
        default_team: "车辆运维+产品",
        reviewer_role: "待企业确认",
        sla_rule_version: "legacy-registration-demo-v1",
        status: "待企业验证",
        evidence_class: "enterprise_pending",
      },
    ],
    issue_cluster: { station_id: STATION_ID, issue_type: "舱门/柜体" },
    resolution_records: [],
  };
}

function n6RootCauseInput(): JsonValue {
  return {
    evidence: [
      {
        case_id: CURRENT_CASE_ID,
        source_ref: `case:${CURRENT_CASE_ID}`,
        text: "A 站舱门无法解锁，部件批次为 B-17。",
      },
      {
        case_id: PEER_CASE_ID,
        source_ref: `case:${PEER_CASE_ID}`,
        text: "B 站舱门无法解锁，部件批次同为 B-17。",
      },
      {
        case_id: COUNTER_CASE_ID,
        source_ref: `case:${COUNTER_CASE_ID}`,
        text: "同批次车辆在 C 站的合成复测中未复现该现象。",
      },
    ],
    issue_cluster: {
      cluster_id: CLUSTER_ID,
      member_case_ids: [CURRENT_CASE_ID, PEER_CASE_ID, COUNTER_CASE_ID],
      status: "待审核",
    },
    resolution_records: [
      {
        case_id: CURRENT_CASE_ID,
        source_ref: `resolution:${CURRENT_CASE_ID}`,
        text: "更换锁体后恢复，但现有证据不足以确认最终技术根因。",
        review_status: "approved",
      },
      {
        case_id: PEER_CASE_ID,
        source_ref: `resolution:${PEER_CASE_ID}`,
        text: "重启后短暂恢复，仍需拆检证据。",
        review_status: "approved",
      },
    ],
    hypothesis_catalog: [{
      hypothesis_id: "HYP-OWNER-001",
      factor_label: "锁体部件批次差异",
      phenomenon_label: "舱门无法解锁",
      uncertainty_options: [
        { uncertainty_id: "UNC-OWNER-SAMPLE", label: "样本数量有限" },
        { uncertainty_id: "UNC-OWNER-TEARDOWN", label: "尚缺少拆检报告" },
      ],
    }],
  };
}

function n7Input(): JsonValue {
  return {
    reviewed_facts: [{
      source_ref: `case:${CASE_ID}`,
      text: `${CASE_ID} 的舱门解锁异常已由授权人员核对。`,
      review_status: "approved",
      review_ref: "SYN-FACT-REVIEW-OWNER-001",
    }],
    resolution_result: {
      source_ref: "work_order:SYN-WORK-OWNER-017",
      text: "处置证据已验证，合成场景中的连续解锁测试通过。",
      validation_status: "verified",
      review_ref: "SYN-RESOLUTION-REVIEW-OWNER-001",
    },
    reviewed_knowledge_index: [{
      knowledge_id: KNOWLEDGE_ID,
      version: "approved.1",
      approval_status: "已审核",
      effective_at: "2026-08-01T03:00:00.000Z",
      citation_allowed_for_n7: true,
      source_ref: `knowledge:${KNOWLEDGE_ID}`,
      text: "回复应说明已完成核验，并邀请客户确认当前体验。",
    }],
  };
}

const PROFILE_REQUESTS: Record<OwnerFirstNodeProfileId, AiNodeRunRequest<JsonValue>> = {
  "n2-default": {
    node: "N2",
    mode: "default",
    version: "N2-1.0.0-draft.2",
    object_ref: { object_type: "raw_feedback", object_id: FEEDBACK_ID },
    input: {
      n1_output: n1Output(),
      taxonomy: {
        domains: ["车辆运维"],
        subcategories: { "车辆运维": ["舱门解锁异常"] },
        tags: ["舱门", "延误"],
      },
      taxonomy_version: "taxonomy-owner-synthetic-v1",
    },
  },
  "n3-default": {
    node: "N3",
    mode: "default",
    version: "N3-1.0.0-draft.2",
    object_ref: { object_type: "raw_feedback", object_id: FEEDBACK_ID },
    input: {
      original_text: ORIGINAL_TEXT,
      n1_output: n1Output(),
      hard_rule_result: { risk_level: "P1", rule_version: "hard-rule-owner-synthetic-v1" },
    },
  },
  "n4-default": {
    node: "N4",
    mode: "default",
    version: "N4-1.0.0-draft.2",
    object_ref: { object_type: "case", object_id: CASE_ID },
    input: n4Input(),
  },
  "n5-same-event": {
    node: "N5",
    mode: "same_event_duplicate",
    version: "N5-same-event-1.0.0-draft.2",
    object_ref: { object_type: "case", object_id: CURRENT_CASE_ID },
    input: n5Input(false),
  },
  "n5-cross-event": {
    node: "N5",
    mode: "cross_event_clustering",
    version: "N5-cross-event-1.0.0-draft.2",
    object_ref: { object_type: "case", object_id: CURRENT_CASE_ID },
    input: n5Input(true),
  },
  "n6-responsibility": {
    node: "N6",
    mode: "responsibility_routing",
    version: "N6-responsibility-routing-1.0.0-draft.2",
    object_ref: { object_type: "case", object_id: CASE_ID },
    input: n6ResponsibilityInput(),
  },
  "n6-root-cause": {
    node: "N6",
    mode: "root_cause_hypothesis",
    version: "N6-root-cause-1.0.0-draft.3",
    object_ref: { object_type: "cluster", object_id: CLUSTER_ID },
    input: n6RootCauseInput(),
  },
  "n7-customer-reply": {
    node: "N7",
    mode: "customer_reply",
    version: "N7-1.0.0-draft.2",
    object_ref: { object_type: "case", object_id: CASE_ID },
    input: n7Input(),
  },
  "n7-knowledge-draft": {
    node: "N7",
    mode: "knowledge_draft",
    version: "N7-1.0.0-draft.2",
    object_ref: { object_type: "case", object_id: CASE_ID },
    input: n7Input(),
  },
  "n7-insight-summary": {
    node: "N7",
    mode: "insight_summary",
    version: "N7-1.0.0-draft.2",
    object_ref: { object_type: "case", object_id: CASE_ID },
    input: n7Input(),
  },
};

const PROFILE_ID_SET = new Set<string>(OWNER_FIRST_NODE_PROFILE_IDS);
const ISSUE_CODE_SET = new Set<string>(OWNER_FIRST_NODE_ISSUE_CODES);

export function isOwnerFirstNodeProfileId(value: unknown): value is OwnerFirstNodeProfileId {
  return typeof value === "string" && PROFILE_ID_SET.has(value);
}

export function getOwnerFirstNodePreviewRequest(
  profileId: unknown,
): AiNodeRunRequest<JsonValue> | null {
  if (!isOwnerFirstNodeProfileId(profileId)) return null;
  return structuredClone(PROFILE_REQUESTS[profileId]);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sortIssueCodes(codes: Iterable<OwnerFirstNodeIssueCode>): OwnerFirstNodeIssueCode[] {
  const present = new Set(codes);
  return OWNER_FIRST_NODE_ISSUE_CODES.filter((code) => present.has(code));
}

function classifyValidationError(error: string): OwnerFirstNodeIssueCode {
  if (/prompt-injection|prohibited automatic output|prohibited final decision|automatic_(?:merge|relink|case_relink|publication)|tool_calls/iu.test(error)) {
    return "candidate_injection_boundary_violation";
  }
  if (/^candidate\.(?:payload|evidence_spans|missing_fields|confidence|status) is required$/u.test(error)) {
    return "candidate_missing_required_key";
  }
  if (/^candidate\.(?!evidence_spans(?:\.|\[))[^\[]+ is not allowed$/u.test(error)) {
    return "candidate_extra_top_level_key";
  }
  if (/evidence|source_ref|quote|span|supporting|counter/iu.test(error)) {
    return "candidate_invalid_evidence_binding";
  }
  if (/candidate\.(?:missing_fields|confidence|status)|missing_field/iu.test(error)) {
    return "candidate_invalid_scalar";
  }
  return "candidate_invalid_payload_shape";
}

export function classifyOwnerFirstNodeValidationErrors(
  errors: readonly string[],
): OwnerFirstNodeIssueCode[] {
  const classified = sortIssueCodes(errors.map(classifyValidationError));
  if (!classified.includes("candidate_missing_required_key")) return classified;
  return classified.filter((code) => (
    code === "candidate_missing_required_key"
    || code === "candidate_extra_top_level_key"
  ));
}

function sanitizedAttemptCount(value: number): number {
  if (!Number.isInteger(value) || value < 0) return 0;
  return Math.min(value, 2);
}

function makeReport(
  profileId: OwnerFirstNodeProfileId | null,
  classification: OwnerFirstNodeClassification,
  attemptCount: number,
  candidateTopLevelKeys: typeof AI_NODE_CANDIDATE_REQUIRED_FIELDS | null,
  exact14Generated: boolean,
  issueCodes: readonly OwnerFirstNodeIssueCode[],
): OwnerFirstNodePreviewReport {
  const request = profileId === null ? null : PROFILE_REQUESTS[profileId];
  return {
    profile_id: profileId,
    node: request?.node ?? null,
    mode: request?.mode ?? null,
    classification,
    attempt_count: sanitizedAttemptCount(attemptCount),
    candidate_top_level_keys: candidateTopLevelKeys,
    exact_14_generated: exact14Generated,
    issue_codes: sortIssueCodes(issueCodes),
  };
}

export function makeOwnerFirstNodeFailureReport(
  profileId: unknown,
  issueCode: unknown,
  attemptCount: number,
): OwnerFirstNodePreviewReport {
  const safeProfileId = isOwnerFirstNodeProfileId(profileId) ? profileId : null;
  const safeIssueCode = typeof issueCode === "string" && ISSUE_CODE_SET.has(issueCode)
    ? issueCode as OwnerFirstNodeIssueCode
    : "internal_validation_error";
  return makeReport(safeProfileId, "needs_human", attemptCount, null, false, [safeIssueCode]);
}

function exactCandidateTopLevelKeys(
  candidate: unknown,
): typeof AI_NODE_CANDIDATE_REQUIRED_FIELDS | null {
  if (!isObject(candidate)) return null;
  const actual = Object.keys(candidate);
  if (
    actual.length !== AI_NODE_CANDIDATE_REQUIRED_FIELDS.length
    || !AI_NODE_CANDIDATE_REQUIRED_FIELDS.every((field, index) => actual[index] === field)
  ) {
    return null;
  }
  return AI_NODE_CANDIDATE_REQUIRED_FIELDS;
}

function hasExactCandidateTopLevelKeySet(candidate: unknown): boolean {
  if (!isObject(candidate)) return false;
  const actual = Object.keys(candidate);
  return actual.length === AI_NODE_CANDIDATE_REQUIRED_FIELDS.length
    && AI_NODE_CANDIDATE_REQUIRED_FIELDS.every((field) => actual.includes(field));
}

class PreviewAuditSink implements AuditSink {
  count = 0;

  async append(record: AuditRecord): Promise<void> {
    const envelope = isObject(record.payload) ? record.payload.envelope : undefined;
    if (record.category !== "ai" || !validateAiNodeEnvelope(envelope).valid) {
      throw new Error("invalid in-memory audit envelope");
    }
    this.count += 1;
  }
}

class PreviewIds implements IdGenerator {
  private current = 0;

  constructor(private readonly profileId: OwnerFirstNodeProfileId) {}

  nextId(namespace: string): string {
    this.current += 1;
    const profileToken = this.profileId.toUpperCase().replaceAll("-", "_");
    return `SYN-OWNER-${profileToken}-${namespace.toUpperCase()}-${String(this.current).padStart(3, "0")}`;
  }
}

const PREVIEW_CLOCK: Clock = Object.freeze({
  source: "test",
  now: () => new Date("2026-08-10T00:00:00.000Z"),
});

class PreviewSession implements OwnerFirstNodePreviewSession {
  private readonly authoritativeRequest: AiNodeRunRequest<JsonValue>;
  private readonly audit = new PreviewAuditSink();
  private readonly ids: PreviewIds;
  private queuedCandidates: unknown[] = [];
  private pendingCandidate: unknown | null = null;
  private attempts = 0;
  private invocations = 0;
  private terminal = false;
  private disposed = false;
  private consistentRequestIdentity = true;
  private consistentInputHash = true;
  private firstInputHash: string | null = null;

  constructor(private readonly profileId: OwnerFirstNodeProfileId) {
    this.authoritativeRequest = structuredClone(PROFILE_REQUESTS[profileId]);
    this.ids = new PreviewIds(profileId);
  }

  get request(): AiNodeRunRequest<JsonValue> {
    return structuredClone(this.authoritativeRequest);
  }

  get diagnostics(): OwnerFirstNodePreviewDiagnostics {
    return {
      invocation_count: this.invocations,
      audit_count: this.audit.count,
      consistent_request_identity: this.consistentRequestIdentity,
      consistent_input_hash: this.consistentInputHash,
      retained_candidate_count: this.queuedCandidates.length + (this.pendingCandidate === null ? 0 : 1),
      retained_audit_record_count: 0,
      disposed: this.disposed,
    };
  }

  private readonly invoker: AiNodeInvoker = {
    invoke: async (invocation: AiNodeInvocation): Promise<unknown> => {
      this.invocations += 1;
      const expected = this.authoritativeRequest;
      this.consistentRequestIdentity = this.consistentRequestIdentity
        && invocation.node === expected.node
        && invocation.mode === expected.mode
        && invocation.version === expected.version
        && invocation.object_ref.object_type === expected.object_ref.object_type
        && invocation.object_ref.object_id === expected.object_ref.object_id;
      if (this.firstInputHash === null) {
        this.firstInputHash = invocation.input_hash;
      } else if (this.firstInputHash !== invocation.input_hash) {
        this.consistentInputHash = false;
      }
      if (this.queuedCandidates.length === 0) {
        throw new Error("candidate queue exhausted");
      }
      return this.queuedCandidates.shift();
    },
  };

  private freshRequest(): AiNodeRunRequest<JsonValue> {
    return structuredClone(this.authoritativeRequest);
  }

  private releaseReferences(): void {
    this.queuedCandidates.length = 0;
    this.pendingCandidate = null;
    this.firstInputHash = null;
    this.disposed = true;
  }

  dispose(): void {
    this.terminal = true;
    this.releaseReferences();
  }

  private terminalFailure(
    issueCodes: readonly OwnerFirstNodeIssueCode[],
    candidateTopLevelKeys: typeof AI_NODE_CANDIDATE_REQUIRED_FIELDS | null,
  ): OwnerFirstNodePreviewReport {
    this.terminal = true;
    const report = makeReport(
      this.profileId,
      "needs_human",
      this.attempts,
      candidateTopLevelKeys,
      false,
      issueCodes,
    );
    this.releaseReferences();
    return report;
  }

  private async runCandidates(
    candidates: unknown[],
    currentCandidateValid: boolean,
    issueCodes: readonly OwnerFirstNodeIssueCode[],
    candidateTopLevelKeys: typeof AI_NODE_CANDIDATE_REQUIRED_FIELDS | null,
  ): Promise<OwnerFirstNodePreviewReport> {
    this.queuedCandidates = candidates;
    this.terminal = true;
    try {
      const runner = new AuditedAiNodeRunner({
        invoker: this.invoker,
        audit: this.audit,
        clock: PREVIEW_CLOCK,
        ids: this.ids,
        data_scope: DATA_SCOPE,
      });
      const envelope = await runner.run<JsonValue, JsonValue>(this.freshRequest());
      const publicValidation = validateAiNodeEnvelope(envelope);
      if (!publicValidation.valid) {
        return makeOwnerFirstNodeFailureReport(
          this.profileId,
          "internal_validation_error",
          this.attempts,
        );
      }
      if (currentCandidateValid && envelope.validation.valid) {
        return makeReport(
          this.profileId,
          envelope.status === "ok" ? "exact_candidate_validated" : "needs_human",
          this.attempts,
          candidateTopLevelKeys,
          true,
          [],
        );
      }
      if (currentCandidateValid !== envelope.validation.valid) {
        return makeOwnerFirstNodeFailureReport(
          this.profileId,
          "internal_validation_error",
          this.attempts,
        );
      }
      return makeReport(
        this.profileId,
        "needs_human",
        this.attempts,
        candidateTopLevelKeys,
        false,
        issueCodes,
      );
    } catch {
      return makeOwnerFirstNodeFailureReport(
        this.profileId,
        "internal_validation_error",
        this.attempts,
      );
    } finally {
      this.releaseReferences();
    }
  }

  async submit(candidate: unknown): Promise<OwnerFirstNodePreviewReport> {
    if (this.terminal || this.disposed) {
      throw new Error("owner-first node preview session is terminal or disposed");
    }
    if (this.attempts >= 2) {
      this.terminal = true;
      this.releaseReferences();
      return makeOwnerFirstNodeFailureReport(this.profileId, "attempt_limit_reached", 2);
    }

    this.attempts += 1;
    const boundary = snapshotPlainJsonData(candidate);
    if (!boundary.ok) {
      return this.terminalFailure(["internal_validation_error"], null);
    }
    const candidateSnapshot = boundary.value;
    const candidateTopLevelKeys = exactCandidateTopLevelKeys(candidateSnapshot);
    const hasExactTopLevelKeySet = hasExactCandidateTopLevelKeySet(candidateSnapshot);
    let validation: ReturnType<typeof validateNodeCandidate>;
    try {
      validation = validateNodeCandidate(this.freshRequest(), candidateSnapshot);
    } catch {
      return this.terminalFailure(["internal_validation_error"], candidateTopLevelKeys);
    }

    const issueCodes = sortIssueCodes([
      ...(validation.valid ? [] : classifyOwnerFirstNodeValidationErrors(validation.errors)),
      ...(hasExactTopLevelKeySet && candidateTopLevelKeys === null
        ? ["candidate_invalid_top_level_key_order" as const]
        : []),
    ]);
    if (hasExactTopLevelKeySet && candidateTopLevelKeys === null) {
      if (this.attempts === 1) {
        return makeReport(
          this.profileId,
          "needs_human",
          this.attempts,
          null,
          false,
          issueCodes,
        );
      }
      return this.terminalFailure(issueCodes, null);
    }
    if (this.attempts === 1 && !validation.valid) {
      this.pendingCandidate = candidateSnapshot;
      return makeReport(
        this.profileId,
        "needs_human",
        this.attempts,
        candidateTopLevelKeys,
        false,
        issueCodes,
      );
    }

    const candidates = this.pendingCandidate === null
      ? [candidateSnapshot]
      : [this.pendingCandidate, candidateSnapshot];
    this.pendingCandidate = null;
    return this.runCandidates(
      candidates,
      validation.valid,
      issueCodes,
      candidateTopLevelKeys,
    );
  }
}

export function createOwnerFirstNodePreviewSession(
  profileId: unknown,
): OwnerFirstNodePreviewSession {
  if (!isOwnerFirstNodeProfileId(profileId)) {
    throw new Error("owner-first node profile is not allowed");
  }
  return new PreviewSession(profileId);
}

export {
  validateNodeCandidate,
  validateNodeRequestDefinition,
};
