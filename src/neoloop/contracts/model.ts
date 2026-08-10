export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export const CANONICAL_SCHEMA_VERSION = "1.0.0-draft.2" as const;
export type CanonicalSchemaVersion = typeof CANONICAL_SCHEMA_VERSION;

export const DATA_SCOPES = ["synthetic_experiment"] as const;
export type DataScope = (typeof DATA_SCOPES)[number];

export const CANONICAL_TABLE_KEYS = [
  "raw_feedback",
  "cases",
  "work_orders",
  "clusters",
  "improvements",
  "vehicles",
  "delivery_tasks",
  "routing_matrix",
  "knowledge_index",
  "ai_audit",
] as const;
export type CanonicalTableKey = (typeof CANONICAL_TABLE_KEYS)[number];

export const RECORD_MODES = ["legacy_snapshot", "scenario_runtime"] as const;
export type RecordMode = (typeof RECORD_MODES)[number];

export type WorkflowReadiness =
  | {
      record_mode: "legacy_snapshot";
      workflow_ready: false;
      blockers: readonly string[];
    }
  | {
      record_mode: "scenario_runtime";
      workflow_ready: boolean;
      blockers: readonly string[];
    };

export const EVIDENCE_CLASSES = [
  "public_fact",
  "enterprise_pending",
  "solution_design",
  "synthetic_experiment",
] as const;

export type EvidenceClass = (typeof EVIDENCE_CLASSES)[number];

export const CLOCK_SOURCES = ["real", "test", "synthetic_history"] as const;
export type ClockSource = (typeof CLOCK_SOURCES)[number];

export const RAW_FEEDBACK_STATUSES = ["待分诊", "人工处理", "已建案", "已忽略"] as const;
export type RawFeedbackStatus = (typeof RAW_FEEDBACK_STATUSES)[number];

export const CASE_STATUSES = [
  "待补充",
  "待关联",
  "待派单",
  "处理中",
  "待验证",
  "待回访",
  "已关闭",
  "已合并",
] as const;
export type CaseStatus = (typeof CASE_STATUSES)[number];

export const CLUSTER_STATUSES = ["候选", "待审核", "改进中", "观察中", "已归档", "已驳回"] as const;
export type ClusterStatus = (typeof CLUSTER_STATUSES)[number];

export const WORK_ORDER_STATUSES = ["待接单", "处理中", "待验证", "已完成", "已取消"] as const;
export type WorkOrderStatus = (typeof WORK_ORDER_STATUSES)[number];

export const IMPROVEMENT_STATUSES = ["待立项", "执行中", "观察中", "已完成", "已终止"] as const;
export type ImprovementStatus = (typeof IMPROVEMENT_STATUSES)[number];

export const RISK_LEVELS = ["P0", "P1", "P2", "P3"] as const;
export type RiskLevel = (typeof RISK_LEVELS)[number];

export interface IngestRequest {
  schema_version: CanonicalSchemaVersion;
  data_scope: DataScope;
  evidence_class: EvidenceClass;
  source_tenant_scope: string;
  channel: string;
  source_record_id?: string;
  original_text: string;
  received_at: string;
  authorization_scope: string;
  idempotency_key: string;
  metadata?: Record<string, JsonValue>;
}

export type IngestResult =
  | {
      outcome: "created";
      feedback_id: string;
      idempotency_key: string;
      created_at: string;
    }
  | {
      outcome: "idempotent_replay";
      feedback_id: string;
      idempotency_key: string;
      created_at: string;
    }
  | {
      outcome: "idempotency_conflict";
      existing_feedback_id: string;
      idempotency_key: string;
    };

export const AI_NODE_STATUSES = ["ok", "needs_human", "refused", "error"] as const;
export type AiNodeStatus = (typeof AI_NODE_STATUSES)[number];

export const AI_NODE_IDS = ["N1", "N2", "N3", "N4", "N5", "N6", "N7"] as const;
export type AiNodeId = (typeof AI_NODE_IDS)[number];

export const HUMAN_REVISION_STATES = ["none", "pending", "accepted", "rejected", "modified"] as const;
export type HumanRevisionState = (typeof HUMAN_REVISION_STATES)[number];

export const AI_NODE_ENVELOPE_REQUIRED_FIELDS = [
  "node",
  "mode",
  "version",
  "run_id",
  "object_ref",
  "input_hash",
  "payload",
  "evidence_spans",
  "missing_fields",
  "confidence",
  "status",
  "validation",
  "retry_count",
  "human_revision",
] as const;

export interface ObjectReference {
  object_type: string;
  object_id: string;
}

export interface EvidenceSpan {
  source_ref: string;
  quote: string;
  start_offset?: number;
  end_offset?: number;
}

export interface AiNodeEnvelope<T extends JsonValue> {
  node: AiNodeId;
  mode: string;
  version: string;
  run_id: string;
  object_ref: ObjectReference;
  input_hash: string;
  payload: T | null;
  evidence_spans: EvidenceSpan[];
  missing_fields: string[];
  confidence: number | null;
  status: AiNodeStatus;
  validation: {
    valid: boolean;
    errors: string[];
  };
  retry_count: 0 | 1;
  human_revision: {
    state: HumanRevisionState;
    revised_payload?: T;
    note?: string;
  };
}

export const WORKFLOW_IDS = ["W1", "W2", "W3", "W4", "W5", "W6"] as const;
export type WorkflowId = (typeof WORKFLOW_IDS)[number];

export interface WorkflowEvent<T extends JsonValue = JsonValue> {
  event_id: string;
  workflow: WorkflowId;
  event_type: string;
  object_ref: ObjectReference;
  occurred_at: string;
  clock_source: ClockSource;
  payload: T;
}

export interface WorkflowResult<T extends JsonValue = JsonValue> {
  workflow: WorkflowId;
  event_id: string;
  status: "completed" | "idempotent" | "needs_human" | "failed";
  object_ref: ObjectReference;
  previous_state?: string;
  next_state?: string;
  preserved_sla_started_at?: string;
  actions: string[];
  errors: string[];
  output?: T;
}

export interface StoredRawFeedback {
  feedback_id: string;
  idempotency_key: string;
  content_fingerprint: string;
  request: IngestRequest;
  processing_status: RawFeedbackStatus;
  created_at: string;
}

export interface AuditRecord {
  audit_id: string;
  object_ref: ObjectReference;
  category: "ingest" | "ai" | "workflow" | "security";
  occurred_at: string;
  clock_source: ClockSource;
  payload: JsonValue;
}

export interface Notification {
  notification_id: string;
  kind: "reminder" | "escalation" | "admin_error";
  object_ref: ObjectReference;
  message: string;
  created_at: string;
}
