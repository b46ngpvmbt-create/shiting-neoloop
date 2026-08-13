import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { validateCanonical } from "./validate-canonical.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "../..");
const DEFAULT_CANONICAL = resolve(REPO, "data/canonical");
const DEFAULT_PUBLIC = resolve(DEFAULT_CANONICAL, "public");

export const PUBLIC_SNAPSHOT_VERSION = "1.0.0-t1-r3-public.1";
export const PUBLIC_GENERATOR_VERSION = "t1-r3-public-builder-v1";
export const PUBLIC_SCHEMA_VERSION = "1.0.0-draft.2";
export const PUBLIC_FIXTURE_VERSION = "1.0.0-t1-r2";
export const PUBLIC_DATA_SCOPE = "synthetic_experiment";
export const PUBLIC_SNAPSHOT_AT = "2026-08-01T00:00:00+08:00";

export const PUBLIC_INPUT_FILES = Object.freeze([
  "manifest.json",
  "fact-boundaries.json",
  "gold/case-gold.json",
  "adversarial/safety-adversarial.json",
  "tables/raw-feedback.json",
  "tables/cases.json",
  "tables/work-orders.json",
  "tables/clusters.json",
  "tables/improvements.json",
  "tables/vehicles.json",
  "scenarios/main-story.json",
  "scenarios/failure-drills.json",
]);

const RECORD_WRAPPER_FIELDS = Object.freeze([
  "snapshot_version",
  "schema_version",
  "fixture_version",
  "data_scope",
  "evidence_class",
  "snapshot_at",
  "disclaimer",
  "record_count",
  "records",
]);

const VIEW_WRAPPER_FIELDS = Object.freeze([
  "snapshot_version",
  "schema_version",
  "fixture_version",
  "data_scope",
  "evidence_class",
  "snapshot_at",
  "disclaimer",
  "view_key",
  "label",
  "read_only",
  "derived_from_public_files",
  "record_count",
  "records",
]);

export const PUBLIC_FILE_CONTRACTS = Object.freeze({
  "declarations.json": {
    kind: "document",
    document_allowed_fields: [
      "snapshot_version",
      "schema_version",
      "fixture_version",
      "snapshot_at",
      "data_scope",
      "team_name",
      "product_name",
      "value_statement",
      "disclaimer",
      "fact_boundaries",
      "fixture_counts",
      "public_contract",
      "claims",
    ],
    nested_allowed_fields: {
      "fact_boundaries[]": ["evidence_class", "label", "requirement", "forbidden_practice", "public_status"],
      fixture_counts: ["gold", "adversarial", "main_stories", "failure_drills", "scenarios_total"],
      public_contract: ["consumer", "entrypoint", "read_root", "read_only", "direct_canonical_reads_allowed", "required_view_keys", "denied_read_roots"],
      claims: [
        "enterprise_data_included",
        "enterprise_system_connected",
        "credentials_included",
        "runtime_results_included",
        "measured_efficiency_included",
        "measured_revenue_included",
        "measured_roi_included",
      ],
    },
  },
  "cases.json": {
    kind: "records",
    wrapper_allowed_fields: RECORD_WRAPPER_FIELDS,
    record_allowed_fields: [
      "schema_version",
      "data_scope",
      "evidence_class",
      "created_at",
      "updated_at",
      "case_id",
      "record_mode",
      "workflow_readiness",
      "workflow_run_evidence",
      "title",
      "summary",
      "category_domain",
      "category_detail",
      "rule_risk",
      "ai_risk",
      "final_risk",
      "status",
      "missing_fields",
      "candidate_vehicle_id",
      "candidate_task_id",
      "candidate_station_id",
      "candidate_confidence",
      "formal_entity_confirmation_status",
      "formal_entity",
      "evidence_completeness",
      "pending_confirmation_items",
      "cluster_id",
      "routing_rule_candidate_id",
      "suggested_team",
      "routing_confirmation_status",
      "routing_evidence_class",
      "sla_started_at",
      "sla_due_at",
      "sla_rule_version",
    ],
  },
  "work-orders.json": {
    kind: "records",
    wrapper_allowed_fields: RECORD_WRAPPER_FIELDS,
    record_allowed_fields: [
      "schema_version",
      "data_scope",
      "evidence_class",
      "created_at",
      "updated_at",
      "work_order_id",
      "case_id",
      "record_mode",
      "workflow_run_evidence",
      "team",
      "assignee_role",
      "action",
      "status",
      "accepted_at",
      "due_at",
      "completed_at",
      "first_response_target_minutes",
      "escalation_level",
      "sla_reset_count",
    ],
  },
  "clusters.json": {
    kind: "records",
    wrapper_allowed_fields: RECORD_WRAPPER_FIELDS,
    record_allowed_fields: [
      "schema_version",
      "data_scope",
      "evidence_class",
      "created_at",
      "updated_at",
      "cluster_id",
      "record_mode",
      "workflow_run_evidence",
      "name",
      "category_domain",
      "member_case_ids",
      "clustering_mode",
      "clustering_version",
      "root_cause_hypothesis",
      "root_cause_confirmation_status",
      "status",
      "highest_risk",
      "next_step",
    ],
  },
  "improvements.json": {
    kind: "records",
    wrapper_allowed_fields: RECORD_WRAPPER_FIELDS,
    record_allowed_fields: [
      "schema_version",
      "data_scope",
      "evidence_class",
      "created_at",
      "updated_at",
      "improvement_id",
      "cluster_id",
      "record_mode",
      "workflow_run_evidence",
      "runtime_evidence_available",
      "enterprise_confirmation_status",
      "owner_evidence_class",
      "status_basis",
      "version",
      "owner_role",
      "measure",
      "observation_window_days",
      "clock_source",
      "metric_formula",
      "day_7_result",
      "day_30_result",
      "human_conclusion",
      "status",
    ],
  },
  "main-story.json": {
    kind: "records",
    wrapper_allowed_fields: RECORD_WRAPPER_FIELDS,
    record_allowed_fields: [
      "schema_version",
      "data_scope",
      "evidence_class",
      "scenario_id",
      "scenario_key",
      "source_case_id",
      "source_record_mode",
      "record_mode",
      "runtime_case_id",
      "execution_status",
      "runtime_evidence_available",
      "clock",
      "observation_clock",
      "replay_input",
      "initial_state",
      "expected_case_draft",
      "planned_workflow_path",
      "human_gate_keys",
      "all_human_gates_required",
      "forbidden_actions",
      "source_snapshot_mutation_allowed",
      "runtime_copy_is_independent",
      "legacy_snapshot_is_workflow_run_evidence",
      "replay_reset_required",
      "replay_reset_status",
    ],
    nested_allowed_fields: {
      clock: ["source", "timezone", "anchor", "advancement"],
      observation_clock: ["source", "timezone", "planned_offsets_days", "execution_status"],
      replay_input: [
        "schema_version",
        "data_scope",
        "evidence_class",
        "feedback_id",
        "received_at",
        "timezone",
        "channel",
        "sender_role",
        "original_text",
        "original_text_mutable",
        "vehicle_id",
        "task_id",
        "station_id",
      ],
      initial_state: ["raw_feedback_status", "case_status", "formal_entity", "responsibility_owner", "sla_started_at"],
      expected_case_draft: ["missing_fields", "case_status"],
      "planned_workflow_path[]": ["order", "workflow", "mode", "expectation"],
    },
  },
  "failure-drills.json": {
    kind: "records",
    wrapper_allowed_fields: [...RECORD_WRAPPER_FIELDS, "category_keys"],
    record_allowed_fields: [
      "schema_version",
      "data_scope",
      "evidence_class",
      "drill_id",
      "category_key",
      "source_case_id",
      "source_record_mode",
      "record_mode",
      "runtime_case_id",
      "execution_status",
      "runtime_evidence_available",
      "clock_source",
      "clock_timezone",
      "clock_anchor",
      "clock_advancement",
      "fault_summary",
      "expected_safe_path",
      "expected_same_key_new_feedback_count",
      "expected_different_key_new_feedback_count",
      "automatic_merge_allowed",
      "expected_retry_limit",
      "expected_case_status",
      "expected_missing_fields",
      "preserve_original_clock",
      "sla_started_at",
      "sla_due_at",
      "simulated_at",
      "human_gate_keys",
      "all_human_gates_required",
      "forbidden_actions",
    ],
  },
  "views/feedback-inbox.json": {
    kind: "view",
    wrapper_allowed_fields: VIEW_WRAPPER_FIELDS,
    record_allowed_fields: [
      "schema_version",
      "data_scope",
      "evidence_class",
      "feedback_id",
      "record_mode",
      "workflow_run_evidence",
      "channel",
      "received_at",
      "processing_status",
      "linked_case_id",
      "missing_fields",
      "duplicate_candidate_status",
      "duplicate_evidence_available",
      "duplicate_candidate_case_ids",
    ],
  },
  "views/case-cockpit.json": {
    kind: "view",
    wrapper_allowed_fields: VIEW_WRAPPER_FIELDS,
    record_allowed_fields: [
      "schema_version",
      "data_scope",
      "evidence_class",
      "case_id",
      "record_mode",
      "workflow_run_evidence",
      "cluster_id",
      "feedback_ids",
      "work_order_ids",
      "audit_evidence_available",
      "follow_up_evidence_available",
    ],
  },
  "views/sla-board.json": {
    kind: "view",
    wrapper_allowed_fields: VIEW_WRAPPER_FIELDS,
    record_allowed_fields: [
      "schema_version",
      "data_scope",
      "evidence_class",
      "work_order_id",
      "record_mode",
      "workflow_run_evidence",
      "clock_source",
    ],
  },
  "views/problem-map.json": {
    kind: "view",
    wrapper_allowed_fields: VIEW_WRAPPER_FIELDS,
    record_allowed_fields: [
      "schema_version",
      "data_scope",
      "evidence_class",
      "cluster_id",
      "record_mode",
      "workflow_run_evidence",
      "name",
      "category_domain",
      "member_case_ids",
      "member_case_count",
      "synthetic_station_ids",
      "synthetic_vehicle_models",
      "synthetic_vehicle_versions",
      "synthetic_sla_window_start",
      "synthetic_sla_window_end",
      "clock_source",
      "root_cause_confirmation_status",
      "recurrence_evidence_available",
    ],
  },
  "views/improvement-tracker.json": {
    kind: "view",
    wrapper_allowed_fields: VIEW_WRAPPER_FIELDS,
    record_allowed_fields: [
      "schema_version",
      "data_scope",
      "evidence_class",
      "improvement_id",
      "cluster_id",
      "record_mode",
      "workflow_run_evidence",
      "runtime_evidence_available",
      "clock_source",
    ],
  },
});

export const PUBLIC_FORBIDDEN_KEYS = Object.freeze([
  "source_locator",
  "source_sha256",
  "source_kind",
  "source_name",
  "legacy_id",
  "legacy_reviewer",
  "legacy_status",
  "legacy_recorded_at",
  "legacy_routing_correct",
  "legacy_association_mode",
  "legacy_association_correct",
  "source_record_id",
  "source_tenant_scope",
  "authorization_scope",
  "authorization_details",
  "idempotency_key",
  "source_snapshot_ref",
  "deterministic_fingerprint",
  "migration_note",
  "migration_review_required",
  "derived_from_legacy_case_id",
  "derived_from_legacy_cluster_id",
  "input_attempts",
  "station_lineage",
  "evidence_references",
  "source_contract",
  "input_text",
  "access_token",
  "refresh_token",
  "api_key",
  "client_secret",
  "app_secret",
  "password",
  "credential",
  "cookie",
  "email",
  "phone",
  "mobile",
  "member_id",
  "user_id",
  "open_id",
  "union_id",
  "tenant_key",
  "platform_resource_id",
  "app_token",
  "base_id",
  "table_id",
  "field_id",
  "record_id",
  "document_id",
  "spreadsheet_id",
  "folder_id",
  "run_evidence",
  "observed_results",
  "validation_result",
  "disposition_evidence",
]);

export const PUBLIC_SENSITIVE_PATTERNS = Object.freeze([
  { id: "private_key", expression: /-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/iu },
  { id: "bearer_token", expression: /\bBearer\s+[A-Za-z0-9._~+/=-]{12,}/iu },
  { id: "named_secret", expression: /\b(?:access|refresh|api|client|app)[_-]?(?:token|key|secret)\s*[:=]\s*["']?[A-Za-z0-9._~+/=-]{12,}/iu },
  { id: "email", expression: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/iu },
  { id: "mainland_phone", expression: /\b1[3-9]\d{9}\b/u },
  { id: "identity_number", expression: /\b\d{17}[\dX]\b/iu },
  { id: "absolute_posix_path", expression: /(?:^|["'\s])\/(?:Users|home|private|var|opt|etc|tmp)\//u },
  { id: "absolute_windows_path", expression: /\b[A-Z]:\\(?:Users|Windows|Program Files)\\/iu },
  { id: "feishu_resource_id", expression: /\b(?:bascn|tbl|fld|vew|rec)[A-Za-z0-9]{8,}\b/u },
  { id: "feishu_member_id", expression: /\b(?:ou|oc|on|om)_[A-Za-z0-9_-]{8,}\b/u },
]);

export const PUBLIC_OUTPUT_FILES = Object.freeze([
  "README.md",
  ...Object.keys(PUBLIC_FILE_CONTRACTS),
  "manifest.json",
].sort());

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function jsonBytes(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

async function readCanonicalInputs(canonicalDir) {
  const entries = await Promise.all(PUBLIC_INPUT_FILES.map(async (file) => {
    const bytes = await readFile(resolve(canonicalDir, file));
    return [file, { bytes, document: JSON.parse(bytes.toString("utf8")), sha256: sha256(bytes) }];
  }));
  return Object.fromEntries(entries);
}

function uniqueSorted(values) {
  return [...new Set(values.filter((value) => value != null))].sort();
}

function projectCase(record, publicStationByPrivateId) {
  return {
    schema_version: record.schema_version,
    data_scope: record.data_scope,
    evidence_class: record.evidence_class,
    created_at: record.created_at,
    updated_at: record.updated_at,
    case_id: record.case_id,
    record_mode: record.record_mode,
    workflow_readiness: record.workflow_readiness,
    workflow_run_evidence: false,
    title: record.title,
    summary: record.summary,
    category_domain: record.category_domain,
    category_detail: record.category_detail,
    rule_risk: record.rule_risk,
    ai_risk: record.ai_risk,
    final_risk: record.final_risk,
    status: record.status,
    missing_fields: [...record.missing_fields],
    candidate_vehicle_id: record.entity_candidates?.vehicle_id ?? null,
    candidate_task_id: record.entity_candidates?.task_id ?? null,
    candidate_station_id: publicStationByPrivateId.get(record.entity_candidates?.station_id) ?? null,
    candidate_confidence: record.entity_candidates?.confidence ?? null,
    formal_entity_confirmation_status: record.formal_entity_confirmation_status,
    formal_entity: record.formal_entity,
    evidence_completeness: record.evidence_completeness,
    pending_confirmation_items: [...record.pending_confirmation_items],
    cluster_id: record.cluster_id,
    routing_rule_candidate_id: record.routing_rule_candidate_id,
    suggested_team: record.suggested_team,
    routing_confirmation_status: "待人工确认",
    routing_evidence_class: "enterprise_pending",
    sla_started_at: record.sla_started_at,
    sla_due_at: record.sla_due_at,
    sla_rule_version: record.sla_rule_version,
  };
}

function projectWorkOrder(record, caseById) {
  return {
    schema_version: record.schema_version,
    data_scope: record.data_scope,
    evidence_class: record.evidence_class,
    created_at: record.created_at,
    updated_at: record.updated_at,
    work_order_id: record.work_order_id,
    case_id: record.case_id,
    record_mode: caseById.get(record.case_id)?.record_mode ?? null,
    workflow_run_evidence: false,
    team: record.team,
    assignee_role: record.assignee_role,
    action: record.action,
    status: record.status,
    accepted_at: record.accepted_at,
    due_at: record.due_at,
    completed_at: record.completed_at,
    first_response_target_minutes: record.first_response_target_minutes,
    escalation_level: record.escalation_level,
    sla_reset_count: record.sla_reset_count,
  };
}

function projectCluster(record) {
  return {
    schema_version: record.schema_version,
    data_scope: record.data_scope,
    evidence_class: record.evidence_class,
    created_at: record.created_at,
    updated_at: record.updated_at,
    cluster_id: record.cluster_id,
    record_mode: "legacy_snapshot",
    workflow_run_evidence: false,
    name: record.name,
    category_domain: record.category_domain,
    member_case_ids: [...record.member_case_ids],
    clustering_mode: record.clustering_mode,
    clustering_version: record.clustering_version,
    root_cause_hypothesis: record.root_cause_hypothesis,
    root_cause_confirmation_status: "hypothesis_only_not_confirmed",
    status: record.status,
    highest_risk: record.highest_risk,
    next_step: record.next_step,
  };
}

function projectImprovement(record) {
  return {
    schema_version: record.schema_version,
    data_scope: record.data_scope,
    evidence_class: record.evidence_class,
    created_at: record.created_at,
    updated_at: record.updated_at,
    improvement_id: record.improvement_id,
    cluster_id: record.cluster_id,
    record_mode: "synthetic_design_snapshot",
    workflow_run_evidence: false,
    runtime_evidence_available: false,
    enterprise_confirmation_status: "pending_validation",
    owner_evidence_class: "enterprise_pending",
    status_basis: "derived_from_synthetic_cluster_status",
    version: record.version,
    owner_role: record.owner_role,
    measure: record.measure,
    observation_window_days: [...record.observation_window_days],
    clock_source: record.clock_source,
    metric_formula: record.metric_formula,
    day_7_result: record.day_7_result,
    day_30_result: record.day_30_result,
    human_conclusion: record.human_conclusion,
    status: record.status,
  };
}

function projectMainStory(document) {
  const source = document.records[0];
  return {
    schema_version: document.schema_version,
    data_scope: document.data_scope,
    evidence_class: document.evidence_class,
    scenario_id: source.scenario_id,
    scenario_key: source.scenario_key,
    source_case_id: source.source_case_id,
    source_record_mode: source.source_record_mode,
    record_mode: source.record_mode,
    runtime_case_id: source.runtime_case_id,
    execution_status: source.execution_status,
    runtime_evidence_available: false,
    clock: {
      source: source.clock.source,
      timezone: source.clock.timezone,
      anchor: source.clock.anchor,
      advancement: source.clock.advancement,
    },
    observation_clock: {
      source: source.observation_clock.source,
      timezone: source.observation_clock.timezone,
      planned_offsets_days: [...source.observation_clock.planned_offsets_days],
      execution_status: source.observation_clock.execution_status,
    },
    replay_input: {
      schema_version: source.input_fixture.schema_version,
      data_scope: source.input_fixture.data_scope,
      evidence_class: source.input_fixture.evidence_class,
      feedback_id: source.input_fixture.feedback_id,
      received_at: source.input_fixture.received_at,
      timezone: source.input_fixture.source_timezone,
      channel: source.input_fixture.channel,
      sender_role: source.input_fixture.sender_role,
      original_text: source.input_fixture.original_text,
      original_text_mutable: source.input_fixture.original_text_mutable,
      vehicle_id: source.input_fixture.vehicle_id,
      task_id: source.input_fixture.task_id,
      station_id: source.input_fixture.station_id,
    },
    initial_state: {
      raw_feedback_status: source.initial_state.raw_feedback_status,
      case_status: source.initial_state.case_status,
      formal_entity: source.initial_state.formal_entity,
      responsibility_owner: source.initial_state.responsibility_owner,
      sla_started_at: source.initial_state.sla_started_at,
    },
    expected_case_draft: {
      missing_fields: [...source.expected_case_draft.missing_fields],
      case_status: source.expected_case_draft.case_status,
    },
    planned_workflow_path: source.planned_workflow_path.map((step) => ({
      order: step.order,
      workflow: step.workflow,
      ...(step.mode ? { mode: step.mode } : {}),
      expectation: step.expectation,
    })),
    human_gate_keys: source.human_gates.map((gate) => gate.gate_key),
    all_human_gates_required: source.human_gates.every((gate) => gate.required === true),
    forbidden_actions: [...source.forbidden_actions],
    source_snapshot_mutation_allowed: source.isolation.source_snapshot_mutation_allowed,
    runtime_copy_is_independent: source.isolation.runtime_copy_is_independent,
    legacy_snapshot_is_workflow_run_evidence: source.isolation.legacy_snapshot_is_workflow_run_evidence,
    replay_reset_required: source.isolation.replay_reset.required,
    replay_reset_status: source.isolation.replay_reset.status,
  };
}

const FAILURE_PUBLIC_SEMANTICS = Object.freeze({
  same_key_retry_and_different_key_similar: {
    fault_summary: "对同一合成幂等键重试，同时提交一条异键但文本相似的合成反馈。",
    expected_safe_path: "同键只回放既有结果；异键创建独立记录，并保留人工并案关口。",
  },
  missing_vehicle_and_task_ids: {
    fault_summary: "从合成输入中删除车辆 ID 和任务 ID。",
    expected_safe_path: "案件停在待补充，不编造实体 ID，也不写入正式实体关系。",
  },
  invalid_ai_schema_retry_once_then_human: {
    fault_summary: "向 N4 注入缺少必需 envelope 字段的合成 AI 输出。",
    expected_safe_path: "同版本节点最多重试一次；再次失败即停止节点链并交由人工。",
  },
  sla_timeout_escalation_preserves_clock: {
    fault_summary: "用测试时钟模拟 W4 SLA 超时。",
    expected_safe_path: "触发升级与人工接管，但保持原状态、原 SLA 起点和原到期时间。",
  },
});

function projectFailureDrill(document, record) {
  const semantics = FAILURE_PUBLIC_SEMANTICS[record.category_key];
  const sameKey = record.expected_semantics?.same_key_retry;
  const differentKey = record.expected_semantics?.different_key_similar;
  return {
    schema_version: document.schema_version,
    data_scope: document.data_scope,
    evidence_class: document.evidence_class,
    drill_id: record.drill_id,
    category_key: record.category_key,
    source_case_id: record.source_case_id,
    source_record_mode: record.source_record_mode,
    record_mode: record.record_mode,
    runtime_case_id: record.runtime_case_id,
    execution_status: record.execution_status,
    runtime_evidence_available: false,
    clock_source: record.clock.source,
    clock_timezone: record.clock.timezone,
    clock_anchor: record.clock.anchor,
    clock_advancement: record.clock.advancement,
    fault_summary: semantics.fault_summary,
    expected_safe_path: semantics.expected_safe_path,
    expected_same_key_new_feedback_count: sameKey?.new_raw_feedback_count ?? null,
    expected_different_key_new_feedback_count: differentKey?.new_raw_feedback_count ?? null,
    automatic_merge_allowed: differentKey ? differentKey.automatic_merge : null,
    expected_retry_limit: record.retry_policy?.max_retries ?? null,
    expected_case_status: record.expected_semantics?.next_case_status ?? record.expected_semantics?.case_status ?? null,
    expected_missing_fields: [...(record.expected_semantics?.missing_fields ?? [])],
    preserve_original_clock: record.expected_semantics?.preserve_original_clock ?? null,
    sla_started_at: record.sla_clock?.original_started_at ?? null,
    sla_due_at: record.sla_clock?.original_due_at ?? null,
    simulated_at: record.fault_injection?.simulated_at ?? null,
    human_gate_keys: record.human_gates.map((gate) => gate.gate_key),
    all_human_gates_required: record.human_gates.every((gate) => gate.required === true),
    forbidden_actions: [...record.forbidden_actions],
  };
}

function makeWrapper({ evidenceClass = "synthetic_experiment", disclaimer, records, extra = {} }) {
  return {
    snapshot_version: PUBLIC_SNAPSHOT_VERSION,
    schema_version: PUBLIC_SCHEMA_VERSION,
    fixture_version: PUBLIC_FIXTURE_VERSION,
    data_scope: PUBLIC_DATA_SCOPE,
    evidence_class: evidenceClass,
    snapshot_at: PUBLIC_SNAPSHOT_AT,
    disclaimer,
    ...extra,
    record_count: records.length,
    records,
  };
}

function makeView({ viewKey, label, derivedFrom, records }) {
  return makeWrapper({
    disclaimer: "只读合成视图索引；状态和时间来自固定历史快照，不是企业现场运行或验收结果。",
    records,
    extra: {
      view_key: viewKey,
      label,
      read_only: true,
      derived_from_public_files: derivedFrom,
    },
  });
}

function buildDeclarations(canonicalManifest, factBoundaries) {
  const publicStatuses = {
    public_fact: "reference_only_no_enterprise_inference",
    enterprise_pending: "pending_validation",
    solution_design: "specified_not_verified_without_evidence",
    synthetic_experiment: "synthetic_only_no_real_world_generalization",
  };
  return {
    snapshot_version: PUBLIC_SNAPSHOT_VERSION,
    schema_version: PUBLIC_SCHEMA_VERSION,
    fixture_version: PUBLIC_FIXTURE_VERSION,
    snapshot_at: PUBLIC_SNAPSHOT_AT,
    data_scope: PUBLIC_DATA_SCOPE,
    team_name: "石听未来",
    product_name: "石听 NeoLoop",
    value_statement: "让每条反馈都找到一辆车、一个任务、一个责任人和一次改进。",
    disclaimer: "本目录只含确定性合成演示快照，不含真实企业客户、车辆、任务、事故、经营数据或现场运行结果。",
    fact_boundaries: canonicalManifest.evidence_classes.map((evidenceClass) => ({
      evidence_class: evidenceClass,
      label: factBoundaries.classes[evidenceClass].label,
      requirement: factBoundaries.classes[evidenceClass].requirement,
      forbidden_practice: factBoundaries.classes[evidenceClass].forbidden,
      public_status: publicStatuses[evidenceClass],
    })),
    fixture_counts: {
      gold: canonicalManifest.fixture_index.counts.gold,
      adversarial: canonicalManifest.fixture_index.counts.adversarial,
      main_stories: canonicalManifest.fixture_index.counts.main_stories,
      failure_drills: canonicalManifest.fixture_index.counts.failure_drills,
      scenarios_total: canonicalManifest.fixture_index.counts.scenarios_total,
    },
    public_contract: {
      consumer: "T4",
      entrypoint: "data/canonical/public/manifest.json",
      read_root: "data/canonical/public",
      read_only: true,
      direct_canonical_reads_allowed: false,
      required_view_keys: ["feedback_inbox", "case_cockpit", "sla_board", "problem_map", "improvement_tracker"],
      denied_read_roots: [
        "data/canonical/tables",
        "data/canonical/gold",
        "data/canonical/adversarial",
        "data/canonical/scenarios",
        "data/canonical/workbooks",
        "data/demo-cases.json",
      ],
    },
    claims: {
      enterprise_data_included: false,
      enterprise_system_connected: false,
      credentials_included: false,
      runtime_results_included: false,
      measured_efficiency_included: false,
      measured_revenue_included: false,
      measured_roi_included: false,
    },
  };
}

function buildDocuments(inputs) {
  const canonicalManifest = inputs["manifest.json"].document;
  const factBoundaries = inputs["fact-boundaries.json"].document;
  const rawFeedback = inputs["tables/raw-feedback.json"].document;
  const sourceCases = inputs["tables/cases.json"].document;
  const sourceWorkOrders = inputs["tables/work-orders.json"].document;
  const sourceClusters = inputs["tables/clusters.json"].document;
  const sourceImprovements = inputs["tables/improvements.json"].document;
  const sourceVehicles = inputs["tables/vehicles.json"].document;
  const mainStoryDocument = inputs["scenarios/main-story.json"].document;
  const failureDocument = inputs["scenarios/failure-drills.json"].document;

  if (canonicalManifest.schema_version !== PUBLIC_SCHEMA_VERSION || canonicalManifest.fixture_index.fixture_version !== PUBLIC_FIXTURE_VERSION) {
    throw new Error("The canonical schema or fixture version is not the frozen T1-R3 input contract.");
  }
  if (canonicalManifest.generated_at !== PUBLIC_SNAPSHOT_AT || canonicalManifest.data_scope !== PUBLIC_DATA_SCOPE) {
    throw new Error("The canonical snapshot time or data scope drifted from the frozen public contract.");
  }

  const privateStationIds = uniqueSorted(sourceCases.map((record) => record.entity_candidates?.station_id));
  const publicStationByPrivateId = new Map(privateStationIds.map((stationId, index) => [stationId, `SYN-STATION-${String(index + 1).padStart(3, "0")}`]));
  const cases = sourceCases.map((record) => projectCase(record, publicStationByPrivateId));
  const caseById = new Map(cases.map((record) => [record.case_id, record]));
  const workOrders = sourceWorkOrders.map((record) => projectWorkOrder(record, caseById));
  const clusters = sourceClusters.map(projectCluster);
  const improvements = sourceImprovements.map(projectImprovement);
  const vehicleById = new Map(sourceVehicles.map((record) => [record.vehicle_id, record]));
  const workOrdersByCase = new Map();
  const feedbackByCase = new Map();
  for (const workOrder of workOrders) {
    const existing = workOrdersByCase.get(workOrder.case_id) ?? [];
    existing.push(workOrder);
    workOrdersByCase.set(workOrder.case_id, existing);
  }
  for (const feedback of rawFeedback) {
    const existing = feedbackByCase.get(feedback.linked_case_id) ?? [];
    existing.push(feedback.feedback_id);
    feedbackByCase.set(feedback.linked_case_id, existing);
  }

  const feedbackInbox = rawFeedback.map((feedback) => {
    const linkedCase = caseById.get(feedback.linked_case_id);
    return {
      schema_version: feedback.schema_version,
      data_scope: feedback.data_scope,
      evidence_class: feedback.evidence_class,
      feedback_id: feedback.feedback_id,
      record_mode: "legacy_snapshot",
      workflow_run_evidence: false,
      channel: feedback.channel,
      received_at: feedback.received_at,
      processing_status: feedback.processing_status,
      linked_case_id: feedback.linked_case_id,
      missing_fields: [...(linkedCase?.missing_fields ?? [])],
      duplicate_candidate_status: "not_evaluated_in_legacy_snapshot",
      duplicate_evidence_available: false,
      duplicate_candidate_case_ids: [],
    };
  });

  const caseCockpit = cases.map((record) => {
    const relatedOrders = workOrdersByCase.get(record.case_id) ?? [];
    return {
      schema_version: record.schema_version,
      data_scope: record.data_scope,
      evidence_class: record.evidence_class,
      case_id: record.case_id,
      record_mode: record.record_mode,
      workflow_run_evidence: record.workflow_run_evidence,
      cluster_id: record.cluster_id,
      feedback_ids: [...(feedbackByCase.get(record.case_id) ?? [])],
      work_order_ids: relatedOrders.map((workOrder) => workOrder.work_order_id),
      audit_evidence_available: false,
      follow_up_evidence_available: false,
    };
  });

  const slaBoard = workOrders.map((record) => ({
    schema_version: record.schema_version,
    data_scope: record.data_scope,
    evidence_class: record.evidence_class,
    work_order_id: record.work_order_id,
    record_mode: record.record_mode,
    workflow_run_evidence: record.workflow_run_evidence,
    clock_source: "synthetic_history",
  }));

  const problemMap = clusters.map((record) => {
    const memberCases = record.member_case_ids.map((caseId) => caseById.get(caseId)).filter(Boolean);
    const vehicles = memberCases.map((item) => vehicleById.get(item.candidate_vehicle_id)).filter(Boolean);
    const starts = memberCases.map((item) => item.sla_started_at).filter(Boolean).sort();
    return {
      schema_version: record.schema_version,
      data_scope: record.data_scope,
      evidence_class: record.evidence_class,
      cluster_id: record.cluster_id,
      record_mode: record.record_mode,
      workflow_run_evidence: record.workflow_run_evidence,
      name: record.name,
      category_domain: record.category_domain,
      member_case_ids: [...record.member_case_ids],
      member_case_count: record.member_case_ids.length,
      synthetic_station_ids: uniqueSorted(memberCases.map((item) => item.candidate_station_id)),
      synthetic_vehicle_models: uniqueSorted(vehicles.map((vehicle) => vehicle.model)),
      synthetic_vehicle_versions: uniqueSorted(vehicles.map((vehicle) => vehicle.version)),
      synthetic_sla_window_start: starts.at(0) ?? null,
      synthetic_sla_window_end: starts.at(-1) ?? null,
      clock_source: "synthetic_history",
      root_cause_confirmation_status: record.root_cause_confirmation_status,
      recurrence_evidence_available: false,
    };
  });

  const improvementTracker = improvements.map((record) => ({
    schema_version: record.schema_version,
    data_scope: record.data_scope,
    evidence_class: record.evidence_class,
    improvement_id: record.improvement_id,
    cluster_id: record.cluster_id,
    record_mode: record.record_mode,
    workflow_run_evidence: record.workflow_run_evidence,
    runtime_evidence_available: record.runtime_evidence_available,
    clock_source: record.clock_source,
  }));

  const mainStory = projectMainStory(mainStoryDocument);
  const failureDrills = failureDocument.records.map((record) => projectFailureDrill(failureDocument, record));

  return {
    "declarations.json": buildDeclarations(canonicalManifest, factBoundaries),
    "cases.json": makeWrapper({
      disclaimer: "20 条案件均为报名合成历史快照；正式实体仍待人工确认，历史关闭状态不构成新版工作流运行证据。",
      records: cases,
    }),
    "work-orders.json": makeWrapper({
      disclaimer: "27 张工单均为固定合成历史快照；状态和时间仅用于结构回放，不是企业现场处置或 SLA 验收结果。",
      records: workOrders,
    }),
    "clusters.json": makeWrapper({
      disclaimer: "10 个问题簇均为合成历史投影；根因字段只保留假设，不代表最终技术根因。",
      records: clusters,
    }),
    "improvements.json": makeWrapper({
      disclaimer: "10 个改进项目均为合成设计快照；观察结果和人工结论为空，不代表企业立项或执行成效。",
      records: improvements,
    }),
    "main-story.json": makeWrapper({
      disclaimer: "SYN-CASE-017 公开回放仍未运行；只展示固定输入、预期路径与人工关口，不展示运行结果。",
      records: [mainStory],
    }),
    "failure-drills.json": makeWrapper({
      disclaimer: "四类故障均未运行；只公开故障定义和预期安全停点，不能解释为已经通过。",
      records: failureDrills,
      extra: { category_keys: failureDrills.map((record) => record.category_key) },
    }),
    "views/feedback-inbox.json": makeView({
      viewKey: "feedback_inbox",
      label: "反馈收件箱",
      derivedFrom: ["cases.json"],
      records: feedbackInbox,
    }),
    "views/case-cockpit.json": makeView({
      viewKey: "case_cockpit",
      label: "案件驾驶舱",
      derivedFrom: ["cases.json", "work-orders.json"],
      records: caseCockpit,
    }),
    "views/sla-board.json": makeView({
      viewKey: "sla_board",
      label: "SLA 协同板",
      derivedFrom: ["cases.json", "work-orders.json"],
      records: slaBoard,
    }),
    "views/problem-map.json": makeView({
      viewKey: "problem_map",
      label: "问题地图",
      derivedFrom: ["cases.json", "clusters.json"],
      records: problemMap,
    }),
    "views/improvement-tracker.json": makeView({
      viewKey: "improvement_tracker",
      label: "改进追踪",
      derivedFrom: ["clusters.json", "improvements.json"],
      records: improvementTracker,
    }),
  };
}

function collectKeyHits(value, forbiddenKeys, path = "$", hits = []) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectKeyHits(item, forbiddenKeys, `${path}[${index}]`, hits));
    return hits;
  }
  if (!value || typeof value !== "object") return hits;
  for (const [key, child] of Object.entries(value)) {
    const childPath = `${path}.${key}`;
    if (forbiddenKeys.has(key)) hits.push({ path: childPath, key });
    collectKeyHits(child, forbiddenKeys, childPath, hits);
  }
  return hits;
}

function unknownKeys(value, allowedFields) {
  const allowed = new Set(allowedFields);
  return Object.keys(value).filter((key) => !allowed.has(key));
}

function missingKeys(value, requiredFields) {
  return requiredFields.filter((key) => !Object.hasOwn(value, key));
}

function nestedValues(root, path) {
  if (path.endsWith("[]")) {
    const value = root[path.slice(0, -2)];
    return Array.isArray(value) ? value : [];
  }
  return root[path] && typeof root[path] === "object" ? [root[path]] : [];
}

export function assertPublicDocumentContracts(documents) {
  for (const [file, contract] of Object.entries(PUBLIC_FILE_CONTRACTS)) {
    const document = documents[file];
    if (!document) throw new Error(`Missing projected public document: ${file}`);
    if (contract.document_allowed_fields) {
      const unknown = unknownKeys(document, contract.document_allowed_fields);
      const missing = missingKeys(document, contract.document_allowed_fields);
      if (unknown.length > 0 || missing.length > 0) throw new Error(`Document allowlist mismatch for ${file}: ${JSON.stringify({ unknown, missing })}`);
    }
    if (contract.wrapper_allowed_fields) {
      const unknown = unknownKeys(document, contract.wrapper_allowed_fields);
      const missing = missingKeys(document, contract.wrapper_allowed_fields);
      if (unknown.length > 0 || missing.length > 0) throw new Error(`Wrapper allowlist mismatch for ${file}: ${JSON.stringify({ unknown, missing })}`);
    }
    const roots = contract.kind === "document" ? [document] : document.records;
    if (contract.record_allowed_fields) {
      for (const [index, record] of roots.entries()) {
        const unknown = unknownKeys(record, contract.record_allowed_fields);
        const missing = missingKeys(record, contract.record_allowed_fields);
        if (unknown.length > 0 || missing.length > 0) throw new Error(`Record allowlist mismatch for ${file}#${index}: ${JSON.stringify({ unknown, missing })}`);
      }
    }
    for (const [path, allowedFields] of Object.entries(contract.nested_allowed_fields ?? {})) {
      for (const [index, root] of roots.entries()) {
        for (const value of nestedValues(root, path)) {
          const unknown = unknownKeys(value, allowedFields);
          if (unknown.length > 0) throw new Error(`Nested allowlist mismatch for ${file}#${index}.${path}: ${JSON.stringify({ unknown })}`);
        }
      }
    }
  }
}

export function scanPublicArtifacts(serializedFiles, documents = {}) {
  const forbiddenKeys = new Set(PUBLIC_FORBIDDEN_KEYS);
  const keyHits = Object.entries(documents).flatMap(([file, document]) => collectKeyHits(document, forbiddenKeys).map((hit) => ({ file, ...hit })));
  const patternHits = [];
  for (const [file, bytes] of Object.entries(serializedFiles)) {
    for (const pattern of PUBLIC_SENSITIVE_PATTERNS) {
      if (pattern.expression.test(bytes)) patternHits.push({ file, pattern: pattern.id });
    }
  }
  return { key_hits: keyHits, pattern_hits: patternHits };
}

function readmeText() {
  return `# 石听 NeoLoop canonical public 快照

这是供 T4 公开站只读消费的唯一脱敏快照。全部业务内容均为 \`synthetic_experiment\`，不是新石器真实客户、车辆、任务、事故、效率、收入、ROI 或现场运行记录。

- schema：\`${PUBLIC_SCHEMA_VERSION}\`
- fixture：\`${PUBLIC_FIXTURE_VERSION}\`
- public snapshot：\`${PUBLIC_SNAPSHOT_VERSION}\`
- 固定时点：\`${PUBLIC_SNAPSHOT_AT}\`
- 消费边界：T4 只能读取 \`data/canonical/public\`，不得直接读取 canonical 私有层或原始报名材料。
- 运行边界：主故事和四类故障均为 \`not_run\`；历史关闭状态不是新版工作流验收证据。
- 人工边界：正式实体、责任、风险降级、结案、最终根因和发布仍需人工确认。

本目录由 \`scripts/neoloop-data/build-public-snapshot.mjs\` 确定性生成。不要手工编辑生成文件。R2 工作簿的冻结窗格和打印区域阻断项不属于本快照验收范围，仍由主控保留。
`;
}

async function listFiles(root, prefix = "") {
  let entries;
  try {
    entries = await readdir(resolve(root, prefix), { withFileTypes: true });
  } catch (error) {
    if (error && typeof error === "object" && error.code === "ENOENT") return [];
    throw error;
  }
  const files = [];
  for (const entry of entries) {
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) files.push(...await listFiles(root, relativePath));
    else files.push(relativePath);
  }
  return files.sort();
}

function manifestFileContracts() {
  return Object.entries(PUBLIC_FILE_CONTRACTS).map(([file, contract]) => ({
    file,
    kind: contract.kind,
    ...(contract.document_allowed_fields ? { document_allowed_fields: [...contract.document_allowed_fields] } : {}),
    ...(contract.wrapper_allowed_fields ? { wrapper_allowed_fields: [...contract.wrapper_allowed_fields] } : {}),
    ...(contract.record_allowed_fields ? { record_allowed_fields: [...contract.record_allowed_fields] } : {}),
    ...(contract.nested_allowed_fields ? { nested_allowed_fields: contract.nested_allowed_fields } : {}),
  }));
}

function buildManifest({ inputs, serializedDocuments }) {
  const outputEntries = Object.entries(serializedDocuments)
    .map(([file, bytes]) => ({ file, sha256: sha256(bytes), size_bytes: Buffer.byteLength(bytes) }))
    .sort((left, right) => left.file.localeCompare(right.file));
  return {
    snapshot_version: PUBLIC_SNAPSHOT_VERSION,
    schema_version: PUBLIC_SCHEMA_VERSION,
    fixture_version: PUBLIC_FIXTURE_VERSION,
    generator_version: PUBLIC_GENERATOR_VERSION,
    generator_file: "scripts/neoloop-data/build-public-snapshot.mjs",
    snapshot_at: PUBLIC_SNAPSHOT_AT,
    data_scope: PUBLIC_DATA_SCOPE,
    hash_algorithm: "sha256",
    input_root: "data/canonical",
    inputs: PUBLIC_INPUT_FILES.map((file) => ({ file, sha256: inputs[file].sha256 })),
    outputs: outputEntries,
    manifest_hash_scope: "manifest.json is excluded from outputs to avoid a self-referential hash; validators hash it externally",
    file_contracts: manifestFileContracts(),
    policy_checks: [
      { policy: "explicit_allowlist_projection", result: "clear", hit_count: 0 },
      { policy: "sensitive_or_private_keys", result: "clear", hit_count: 0 },
      { policy: "credential_or_private_value_patterns", result: "clear", hit_count: 0 },
      { policy: "absolute_paths", result: "clear", hit_count: 0 },
      { policy: "enterprise_runtime_or_measured_outcomes", result: "clear", hit_count: 0 },
    ],
    consumer_contract: {
      consumer: "T4",
      entrypoint: "data/canonical/public/manifest.json",
      read_root: "data/canonical/public",
      read_only: true,
      direct_canonical_reads_allowed: false,
      view_index_policy: "relationship_and_safe_aggregate_only",
      allowed_files: PUBLIC_OUTPUT_FILES,
      denied_read_roots: [
        "data/canonical/tables",
        "data/canonical/gold",
        "data/canonical/adversarial",
        "data/canonical/scenarios",
        "data/canonical/workbooks",
        "data/demo-cases.json",
      ],
      required_views: [
        "views/feedback-inbox.json",
        "views/case-cockpit.json",
        "views/sla-board.json",
        "views/problem-map.json",
        "views/improvement-tracker.json",
      ],
    },
  };
}

export async function buildPublicSnapshot({ canonicalDir = DEFAULT_CANONICAL, outputDir = DEFAULT_PUBLIC } = {}) {
  const canonicalReport = await validateCanonical({ canonicalDir });
  if (!canonicalReport.ok) {
    throw new Error(`Canonical validation failed: ${JSON.stringify(canonicalReport.errors)}`);
  }

  const inputs = await readCanonicalInputs(canonicalDir);
  const documents = buildDocuments(inputs);
  assertPublicDocumentContracts(documents);
  const serializedDocuments = Object.fromEntries(Object.entries(documents).map(([file, document]) => [file, jsonBytes(document)]));
  serializedDocuments["README.md"] = readmeText();

  const projectedScan = scanPublicArtifacts(serializedDocuments, documents);
  if (projectedScan.key_hits.length > 0 || projectedScan.pattern_hits.length > 0) {
    throw new Error(`Public projection failed security checks: ${JSON.stringify(projectedScan)}`);
  }

  const manifest = buildManifest({ inputs, serializedDocuments });
  const manifestBytes = jsonBytes(manifest);
  const allSerialized = { ...serializedDocuments, "manifest.json": manifestBytes };
  const finalScan = scanPublicArtifacts(allSerialized, { ...documents, "manifest.json": manifest });
  if (finalScan.key_hits.length > 0 || finalScan.pattern_hits.length > 0) {
    throw new Error(`Public manifest failed security checks: ${JSON.stringify(finalScan)}`);
  }

  const existingFiles = await listFiles(outputDir);
  const unexpectedFiles = existingFiles.filter((file) => !PUBLIC_OUTPUT_FILES.includes(file));
  if (unexpectedFiles.length > 0) {
    throw new Error(`Refusing to overwrite a public directory with unexpected files: ${unexpectedFiles.join(", ")}`);
  }

  for (const file of PUBLIC_OUTPUT_FILES) {
    const destination = resolve(outputDir, file);
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, allSerialized[file], "utf8");
  }

  const fileHashes = Object.fromEntries(PUBLIC_OUTPUT_FILES.map((file) => [file, sha256(allSerialized[file])]));
  return {
    ok: true,
    snapshot_version: PUBLIC_SNAPSHOT_VERSION,
    schema_version: PUBLIC_SCHEMA_VERSION,
    fixture_version: PUBLIC_FIXTURE_VERSION,
    generator_version: PUBLIC_GENERATOR_VERSION,
    output_file_count: PUBLIC_OUTPUT_FILES.length,
    manifest_sha256: fileHashes["manifest.json"],
    file_hashes: fileHashes,
  };
}

function cliValue(flag) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : null;
}

const isCli = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  const canonicalDir = cliValue("--canonical-dir") ?? DEFAULT_CANONICAL;
  const outputDir = cliValue("--output-dir") ?? DEFAULT_PUBLIC;
  const report = await buildPublicSnapshot({ canonicalDir, outputDir });
  console.log(JSON.stringify(report, null, 2));
}
