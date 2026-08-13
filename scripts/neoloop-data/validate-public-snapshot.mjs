import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  PUBLIC_DATA_SCOPE,
  PUBLIC_FILE_CONTRACTS,
  PUBLIC_FIXTURE_VERSION,
  PUBLIC_GENERATOR_VERSION,
  PUBLIC_INPUT_FILES,
  PUBLIC_OUTPUT_FILES,
  PUBLIC_SCHEMA_VERSION,
  PUBLIC_SNAPSHOT_AT,
  PUBLIC_SNAPSHOT_VERSION,
  assertPublicDocumentContracts,
  scanPublicArtifacts,
} from "./build-public-snapshot.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "../..");
const DEFAULT_CANONICAL = resolve(REPO, "data/canonical");
const DEFAULT_PUBLIC = resolve(DEFAULT_CANONICAL, "public");

const EVIDENCE_CLASSES = Object.freeze([
  "public_fact",
  "enterprise_pending",
  "solution_design",
  "synthetic_experiment",
]);

const FAILURE_CATEGORIES = Object.freeze([
  "same_key_retry_and_different_key_similar",
  "missing_vehicle_and_task_ids",
  "invalid_ai_schema_retry_once_then_human",
  "sla_timeout_escalation_preserves_clock",
]);

const REQUIRED_VIEW_FILES = Object.freeze([
  "views/feedback-inbox.json",
  "views/case-cockpit.json",
  "views/sla-board.json",
  "views/problem-map.json",
  "views/improvement-tracker.json",
]);

const DENIED_READ_ROOTS = Object.freeze([
  "data/canonical/tables",
  "data/canonical/gold",
  "data/canonical/adversarial",
  "data/canonical/scenarios",
  "data/canonical/workbooks",
  "data/demo-cases.json",
]);

const PRIVATE_CONTENT_PATTERNS = Object.freeze([
  { id: "private_canonical_reference", expression: /(?:\.\.\/|data\/canonical\/(?:tables|gold|adversarial|scenarios|workbooks)\/|\.json#[A-Z])/u },
  { id: "opaque_internal_hash", expression: /\b[a-f0-9]{64}\b/u },
  { id: "private_legacy_identifier", expression: /\bDEMO-[A-Z0-9-]+\b/u },
  { id: "positive_runtime_claim", expression: /(?:已经?|已)(?:上线|接入|部署|验收通过|运行通过)|企业实测|现场实测|真实运行结果|(?:效率|收入|ROI).{0,12}(?:提升|增长|达到)\s*\d/iu },
]);

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function addError(errors, condition, code, detail = {}) {
  if (!condition) errors.push({ code, detail });
}

function sorted(values) {
  return [...values].sort();
}

function sameValues(left, right) {
  return JSON.stringify(sorted(left)) === JSON.stringify(sorted(right));
}

function unique(values) {
  return new Set(values).size === values.length;
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

async function readPublicFiles(publicDir, errors) {
  const serialized = {};
  const documents = {};
  for (const file of await listFiles(publicDir)) {
    try {
      const bytes = await readFile(resolve(publicDir, file));
      serialized[file] = bytes;
      if (file.endsWith(".json")) documents[file] = JSON.parse(bytes.toString("utf8"));
    } catch (error) {
      errors.push({ code: "public_file_read_failed", detail: { file, message: error instanceof Error ? error.message : String(error) } });
    }
  }
  return { serialized, documents };
}

function expectedManifestContracts() {
  return Object.entries(PUBLIC_FILE_CONTRACTS).map(([file, contract]) => ({
    file,
    kind: contract.kind,
    ...(contract.document_allowed_fields ? { document_allowed_fields: [...contract.document_allowed_fields] } : {}),
    ...(contract.wrapper_allowed_fields ? { wrapper_allowed_fields: [...contract.wrapper_allowed_fields] } : {}),
    ...(contract.record_allowed_fields ? { record_allowed_fields: [...contract.record_allowed_fields] } : {}),
    ...(contract.nested_allowed_fields ? { nested_allowed_fields: contract.nested_allowed_fields } : {}),
  }));
}

function checkCommonRecordBoundary(errors, documents) {
  for (const [file, contract] of Object.entries(PUBLIC_FILE_CONTRACTS)) {
    if (contract.kind === "document") continue;
    for (const [index, record] of (documents[file]?.records ?? []).entries()) {
      addError(errors, record.schema_version === PUBLIC_SCHEMA_VERSION, "public_record_schema_mismatch", { file, index, actual: record.schema_version });
      addError(errors, record.data_scope === PUBLIC_DATA_SCOPE, "public_record_scope_mismatch", { file, index, actual: record.data_scope });
      addError(errors, EVIDENCE_CLASSES.includes(record.evidence_class), "public_record_evidence_class_unknown", { file, index, actual: record.evidence_class });
    }
  }
}

function collectIdentifierErrors(errors, value, path = "$") {
  if (Array.isArray(value)) {
    value.forEach((child, index) => collectIdentifierErrors(errors, child, `${path}[${index}]`));
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    const childPath = `${path}.${key}`;
    if (key.endsWith("_id") && child != null) {
      addError(errors, typeof child === "string" && /^(?:SYN|SCN|DRILL)-[A-Z0-9-]+$/u.test(child), "public_identifier_not_synthetic", { path: childPath, value: child });
    }
    if (key.endsWith("_ids") && Array.isArray(child)) {
      for (const identifier of child) addError(errors, typeof identifier === "string" && /^(?:SYN|SCN|DRILL)-[A-Z0-9-]+$/u.test(identifier), "public_identifier_not_synthetic", { path: childPath, value: identifier });
    }
    collectIdentifierErrors(errors, child, childPath);
  }
}

function checkEntityAndViewRelations(errors, documents) {
  const cases = documents["cases.json"]?.records ?? [];
  const workOrders = documents["work-orders.json"]?.records ?? [];
  const clusters = documents["clusters.json"]?.records ?? [];
  const improvements = documents["improvements.json"]?.records ?? [];
  const feedback = documents["views/feedback-inbox.json"]?.records ?? [];
  const cockpit = documents["views/case-cockpit.json"]?.records ?? [];
  const slaBoard = documents["views/sla-board.json"]?.records ?? [];
  const problemMap = documents["views/problem-map.json"]?.records ?? [];
  const improvementTracker = documents["views/improvement-tracker.json"]?.records ?? [];

  addError(errors, cases.length === 20, "public_case_count", { expected: 20, actual: cases.length });
  addError(errors, workOrders.length === 27, "public_work_order_count", { expected: 27, actual: workOrders.length });
  addError(errors, clusters.length === 10, "public_cluster_count", { expected: 10, actual: clusters.length });
  addError(errors, improvements.length === 10, "public_improvement_count", { expected: 10, actual: improvements.length });
  addError(errors, feedback.length === 30, "public_feedback_view_count", { expected: 30, actual: feedback.length });
  addError(errors, cockpit.length === 20, "public_case_view_count", { expected: 20, actual: cockpit.length });
  addError(errors, slaBoard.length === 27, "public_sla_view_count", { expected: 27, actual: slaBoard.length });
  addError(errors, problemMap.length === 10, "public_problem_view_count", { expected: 10, actual: problemMap.length });
  addError(errors, improvementTracker.length === 10, "public_improvement_view_count", { expected: 10, actual: improvementTracker.length });

  const caseIds = cases.map((record) => record.case_id);
  const workOrderIds = workOrders.map((record) => record.work_order_id);
  const clusterIds = clusters.map((record) => record.cluster_id);
  const improvementIds = improvements.map((record) => record.improvement_id);
  const feedbackIds = feedback.map((record) => record.feedback_id);
  addError(errors, unique(caseIds), "public_duplicate_case_id");
  addError(errors, unique(workOrderIds), "public_duplicate_work_order_id");
  addError(errors, unique(clusterIds), "public_duplicate_cluster_id");
  addError(errors, unique(improvementIds), "public_duplicate_improvement_id");
  addError(errors, unique(feedbackIds), "public_duplicate_feedback_id");

  const caseIdSet = new Set(caseIds);
  const workOrderIdSet = new Set(workOrderIds);
  const clusterIdSet = new Set(clusterIds);
  const feedbackIdSet = new Set(feedbackIds);
  const clusterById = new Map(clusters.map((record) => [record.cluster_id, record]));

  for (const record of cases) {
    addError(errors, record.record_mode === "legacy_snapshot" && record.workflow_run_evidence === false, "public_case_legacy_boundary", { case_id: record.case_id });
    addError(errors, record.formal_entity === null && record.formal_entity_confirmation_status === "待人工确认", "public_case_formal_entity_boundary", { case_id: record.case_id });
    addError(errors, record.routing_confirmation_status === "待人工确认" && record.routing_evidence_class === "enterprise_pending", "public_case_routing_boundary", { case_id: record.case_id });
    addError(errors, record.candidate_vehicle_id == null || /^SYN-VEHICLE-/u.test(record.candidate_vehicle_id), "public_case_vehicle_identifier", { case_id: record.case_id, value: record.candidate_vehicle_id });
    addError(errors, record.candidate_task_id == null || /^SYN-TASK-/u.test(record.candidate_task_id), "public_case_task_identifier", { case_id: record.case_id, value: record.candidate_task_id });
    addError(errors, record.candidate_station_id == null || /^SYN-STATION-/u.test(record.candidate_station_id), "public_case_station_identifier", { case_id: record.case_id, value: record.candidate_station_id });
    addError(errors, clusterIdSet.has(record.cluster_id), "public_case_cluster_orphan", { case_id: record.case_id, cluster_id: record.cluster_id });
    if (record.status === "已关闭") addError(errors, record.workflow_readiness === "requires_replay_reset", "public_closed_case_missing_replay_reset", { case_id: record.case_id });
  }
  addError(errors, cases.filter((record) => record.status === "已关闭").length === 9, "public_closed_case_regression_count", { actual: cases.filter((record) => record.status === "已关闭").length });

  for (const record of workOrders) {
    addError(errors, caseIdSet.has(record.case_id), "public_work_order_case_orphan", { work_order_id: record.work_order_id, case_id: record.case_id });
    addError(errors, record.record_mode === "legacy_snapshot" && record.workflow_run_evidence === false, "public_work_order_legacy_boundary", { work_order_id: record.work_order_id });
    addError(errors, record.sla_reset_count === 0, "public_work_order_sla_reset", { work_order_id: record.work_order_id, actual: record.sla_reset_count });
  }

  const clusterMembership = new Map(caseIds.map((caseId) => [caseId, 0]));
  for (const record of clusters) {
    addError(errors, record.record_mode === "legacy_snapshot" && record.workflow_run_evidence === false, "public_cluster_legacy_boundary", { cluster_id: record.cluster_id });
    addError(errors, record.root_cause_confirmation_status === "hypothesis_only_not_confirmed", "public_cluster_root_cause_boundary", { cluster_id: record.cluster_id });
    addError(errors, unique(record.member_case_ids), "public_cluster_duplicate_member", { cluster_id: record.cluster_id });
    for (const caseId of record.member_case_ids) {
      addError(errors, caseIdSet.has(caseId), "public_cluster_case_orphan", { cluster_id: record.cluster_id, case_id: caseId });
      if (clusterMembership.has(caseId)) clusterMembership.set(caseId, clusterMembership.get(caseId) + 1);
    }
  }
  for (const [caseId, membershipCount] of clusterMembership) addError(errors, membershipCount === 1, "public_case_cluster_membership_count", { case_id: caseId, actual: membershipCount });

  const improvementStatusByClusterStatus = {
    "候选": "待立项",
    "待审核": "待立项",
    "改进中": "执行中",
    "观察中": "观察中",
    "已归档": "已完成",
    "已驳回": "已终止",
  };
  const improvementsPerCluster = new Map(clusterIds.map((clusterId) => [clusterId, 0]));
  for (const record of improvements) {
    const cluster = clusterById.get(record.cluster_id);
    addError(errors, Boolean(cluster), "public_improvement_cluster_orphan", { improvement_id: record.improvement_id, cluster_id: record.cluster_id });
    addError(errors, record.record_mode === "synthetic_design_snapshot" && record.workflow_run_evidence === false && record.runtime_evidence_available === false, "public_improvement_runtime_boundary", { improvement_id: record.improvement_id });
    addError(errors, record.enterprise_confirmation_status === "pending_validation" && record.owner_role === "待企业确认" && record.owner_evidence_class === "enterprise_pending", "public_improvement_enterprise_boundary", { improvement_id: record.improvement_id });
    addError(errors, record.day_7_result === null && record.day_30_result === null && record.human_conclusion === null, "public_improvement_false_result", { improvement_id: record.improvement_id });
    addError(errors, cluster && record.status === improvementStatusByClusterStatus[cluster.status], "public_improvement_status_relationship", { improvement_id: record.improvement_id, cluster_status: cluster?.status, actual: record.status });
    if (improvementsPerCluster.has(record.cluster_id)) improvementsPerCluster.set(record.cluster_id, improvementsPerCluster.get(record.cluster_id) + 1);
  }
  for (const [clusterId, count] of improvementsPerCluster) addError(errors, count === 1, "public_cluster_improvement_count", { cluster_id: clusterId, actual: count });

  for (const record of feedback) {
    addError(errors, caseIdSet.has(record.linked_case_id), "public_feedback_case_orphan", { feedback_id: record.feedback_id, case_id: record.linked_case_id });
    addError(errors, record.record_mode === "legacy_snapshot" && record.workflow_run_evidence === false, "public_feedback_legacy_boundary", { feedback_id: record.feedback_id });
    addError(errors, record.duplicate_evidence_available === false && record.duplicate_candidate_case_ids.length === 0, "public_feedback_duplicate_evidence_boundary", { feedback_id: record.feedback_id });
  }

  addError(errors, sameValues(cockpit.map((record) => record.case_id), caseIds), "public_case_view_coverage");
  for (const record of cockpit) {
    addError(errors, record.record_mode === "legacy_snapshot" && record.workflow_run_evidence === false, "public_case_view_legacy_boundary", { case_id: record.case_id });
    addError(errors, clusterIdSet.has(record.cluster_id), "public_case_view_cluster_orphan", { case_id: record.case_id, cluster_id: record.cluster_id });
    addError(errors, record.feedback_ids.every((identifier) => feedbackIdSet.has(identifier)), "public_case_view_feedback_orphan", { case_id: record.case_id });
    addError(errors, record.work_order_ids.every((identifier) => workOrderIdSet.has(identifier)), "public_case_view_work_order_orphan", { case_id: record.case_id });
    addError(errors, record.audit_evidence_available === false && record.follow_up_evidence_available === false, "public_case_view_false_evidence", { case_id: record.case_id });
  }
  addError(errors, sameValues(cockpit.flatMap((record) => record.feedback_ids), feedbackIds), "public_case_view_feedback_coverage");
  addError(errors, sameValues(cockpit.flatMap((record) => record.work_order_ids), workOrderIds), "public_case_view_work_order_coverage");

  addError(errors, sameValues(slaBoard.map((record) => record.work_order_id), workOrderIds), "public_sla_view_coverage");
  for (const record of slaBoard) addError(errors, record.record_mode === "legacy_snapshot" && record.workflow_run_evidence === false && record.clock_source === "synthetic_history", "public_sla_view_boundary", { work_order_id: record.work_order_id });

  addError(errors, sameValues(problemMap.map((record) => record.cluster_id), clusterIds), "public_problem_view_coverage");
  for (const record of problemMap) {
    addError(errors, record.record_mode === "legacy_snapshot" && record.workflow_run_evidence === false, "public_problem_view_legacy_boundary", { cluster_id: record.cluster_id });
    addError(errors, record.root_cause_confirmation_status === "hypothesis_only_not_confirmed" && record.recurrence_evidence_available === false, "public_problem_view_evidence_boundary", { cluster_id: record.cluster_id });
    addError(errors, record.synthetic_station_ids.every((identifier) => /^SYN-STATION-/u.test(identifier)), "public_problem_view_station_identifier", { cluster_id: record.cluster_id });
    addError(errors, record.clock_source === "synthetic_history", "public_problem_view_clock", { cluster_id: record.cluster_id });
  }

  addError(errors, sameValues(improvementTracker.map((record) => record.improvement_id), improvementIds), "public_improvement_view_coverage");
  for (const record of improvementTracker) {
    addError(errors, clusterIdSet.has(record.cluster_id), "public_improvement_view_cluster_orphan", { improvement_id: record.improvement_id });
    addError(errors, record.record_mode === "synthetic_design_snapshot" && record.workflow_run_evidence === false && record.runtime_evidence_available === false && record.clock_source === "synthetic_history", "public_improvement_view_boundary", { improvement_id: record.improvement_id });
  }
}

function checkScenarioBoundaries(errors, documents, caseIds) {
  const mainStory = documents["main-story.json"]?.records ?? [];
  const drills = documents["failure-drills.json"]?.records ?? [];
  addError(errors, mainStory.length === 1, "public_main_story_count", { expected: 1, actual: mainStory.length });
  addError(errors, drills.length === 4, "public_failure_drill_count", { expected: 4, actual: drills.length });
  const story = mainStory[0];
  if (story) {
    addError(errors, story.source_case_id === "SYN-CASE-017" && story.source_record_mode === "legacy_snapshot", "public_main_story_source", { source_case_id: story.source_case_id });
    addError(errors, story.record_mode === "scenario_runtime" && story.execution_status === "not_run" && story.runtime_evidence_available === false, "public_main_story_runtime_boundary", { scenario_id: story.scenario_id });
    addError(errors, story.runtime_case_id !== story.source_case_id && !caseIds.has(story.runtime_case_id), "public_main_story_runtime_isolation", { runtime_case_id: story.runtime_case_id });
    addError(errors, story.clock.source === "test" && story.clock.anchor === "2026-08-01T09:00:00+08:00" && story.observation_clock.source === "synthetic_history" && story.observation_clock.execution_status === "not_run", "public_main_story_clock_boundary", { scenario_id: story.scenario_id });
    addError(errors, story.replay_input.original_text.startsWith("合成场景：") && story.replay_input.data_scope === PUBLIC_DATA_SCOPE, "public_main_story_input_boundary", { scenario_id: story.scenario_id });
    addError(errors, story.human_gate_keys.length > 0 && unique(story.human_gate_keys) && story.all_human_gates_required === true, "public_main_story_human_gates", { scenario_id: story.scenario_id });
    addError(errors, story.forbidden_actions.length > 0 && unique(story.forbidden_actions), "public_main_story_forbidden_actions", { scenario_id: story.scenario_id });
    addError(errors, story.source_snapshot_mutation_allowed === false && story.runtime_copy_is_independent === true && story.legacy_snapshot_is_workflow_run_evidence === false && story.replay_reset_required === true && story.replay_reset_status === "specified_not_executed", "public_main_story_isolation_contract", { scenario_id: story.scenario_id });
  }

  addError(errors, sameValues(drills.map((record) => record.category_key), FAILURE_CATEGORIES), "public_failure_category_coverage", { actual: drills.map((record) => record.category_key) });
  addError(errors, unique(drills.map((record) => record.drill_id)), "public_failure_duplicate_drill_id");
  addError(errors, unique(drills.map((record) => record.runtime_case_id)), "public_failure_duplicate_runtime_case_id");
  const runtimeCaseIds = new Set(story ? [story.runtime_case_id] : []);
  for (const record of drills) {
    addError(errors, record.source_case_id === "SYN-CASE-017" && record.source_record_mode === "legacy_snapshot", "public_failure_source", { drill_id: record.drill_id });
    addError(errors, record.record_mode === "scenario_runtime" && record.execution_status === "not_run" && record.runtime_evidence_available === false, "public_failure_runtime_boundary", { drill_id: record.drill_id });
    addError(errors, !caseIds.has(record.runtime_case_id) && !runtimeCaseIds.has(record.runtime_case_id), "public_failure_runtime_isolation", { drill_id: record.drill_id, runtime_case_id: record.runtime_case_id });
    runtimeCaseIds.add(record.runtime_case_id);
    addError(errors, record.clock_source === "test" && record.clock_timezone === "Asia/Shanghai", "public_failure_clock_boundary", { drill_id: record.drill_id });
    addError(errors, record.human_gate_keys.length > 0 && unique(record.human_gate_keys) && record.all_human_gates_required === true, "public_failure_human_gates", { drill_id: record.drill_id });
    addError(errors, record.forbidden_actions.length > 0 && unique(record.forbidden_actions), "public_failure_forbidden_actions", { drill_id: record.drill_id });
  }

  const idempotency = drills.find((record) => record.category_key === "same_key_retry_and_different_key_similar");
  addError(errors, idempotency?.expected_same_key_new_feedback_count === 0 && idempotency?.expected_different_key_new_feedback_count === 1 && idempotency?.automatic_merge_allowed === false, "public_failure_idempotency_semantics", { record: idempotency });
  const missingIds = drills.find((record) => record.category_key === "missing_vehicle_and_task_ids");
  addError(errors, missingIds?.expected_case_status === "待补充" && sameValues(missingIds?.expected_missing_fields ?? [], ["车辆ID", "任务ID"]), "public_failure_missing_ids_semantics", { record: missingIds });
  const invalidSchema = drills.find((record) => record.category_key === "invalid_ai_schema_retry_once_then_human");
  addError(errors, invalidSchema?.expected_retry_limit === 1, "public_failure_retry_semantics", { record: invalidSchema });
  const slaTimeout = drills.find((record) => record.category_key === "sla_timeout_escalation_preserves_clock");
  addError(errors, slaTimeout?.preserve_original_clock === true && Date.parse(slaTimeout?.sla_started_at ?? "") < Date.parse(slaTimeout?.sla_due_at ?? "") && Date.parse(slaTimeout?.sla_due_at ?? "") < Date.parse(slaTimeout?.simulated_at ?? ""), "public_failure_sla_semantics", { record: slaTimeout });
}

function checkDeclarationsAndConsumerContract(errors, documents, manifest) {
  const declarations = documents["declarations.json"];
  addError(errors, declarations?.snapshot_version === PUBLIC_SNAPSHOT_VERSION && declarations?.schema_version === PUBLIC_SCHEMA_VERSION && declarations?.fixture_version === PUBLIC_FIXTURE_VERSION && declarations?.snapshot_at === PUBLIC_SNAPSHOT_AT && declarations?.data_scope === PUBLIC_DATA_SCOPE, "public_declaration_version_boundary", {});
  addError(errors, sameValues(declarations?.fact_boundaries?.map((record) => record.evidence_class) ?? [], EVIDENCE_CLASSES), "public_fact_boundary_catalog", {});
  const enterpriseBoundary = declarations?.fact_boundaries?.find((record) => record.evidence_class === "enterprise_pending");
  addError(errors, enterpriseBoundary?.public_status === "pending_validation", "public_enterprise_pending_boundary", { value: enterpriseBoundary });
  addError(errors, Object.values(declarations?.claims ?? {}).every((value) => value === false), "public_false_claim_boundary", { claims: declarations?.claims });
  addError(errors, JSON.stringify(declarations?.fixture_counts) === JSON.stringify({ gold: 20, adversarial: 16, main_stories: 1, failure_drills: 4, scenarios_total: 5 }), "public_fixture_count_declaration", { actual: declarations?.fixture_counts });

  const contract = manifest.consumer_contract;
  addError(errors, contract?.consumer === "T4" && contract?.entrypoint === "data/canonical/public/manifest.json" && contract?.read_root === "data/canonical/public" && contract?.read_only === true && contract?.direct_canonical_reads_allowed === false, "public_t4_consumer_boundary", { contract });
  addError(errors, contract?.view_index_policy === "relationship_and_safe_aggregate_only", "public_view_index_policy", { contract });
  addError(errors, sameValues(contract?.allowed_files ?? [], PUBLIC_OUTPUT_FILES), "public_t4_allowed_files", { actual: contract?.allowed_files });
  addError(errors, sameValues(contract?.denied_read_roots ?? [], DENIED_READ_ROOTS), "public_t4_denied_roots", { actual: contract?.denied_read_roots });
  addError(errors, sameValues(contract?.required_views ?? [], REQUIRED_VIEW_FILES), "public_t4_required_views", { actual: contract?.required_views });
  addError(errors, declarations?.public_contract?.consumer === "T4" && declarations?.public_contract?.entrypoint === contract?.entrypoint && declarations?.public_contract?.read_root === contract?.read_root && declarations?.public_contract?.read_only === true && declarations?.public_contract?.direct_canonical_reads_allowed === false, "public_declaration_consumer_boundary", { value: declarations?.public_contract });
}

function checkPrivateContentPatterns(errors, serialized) {
  for (const [file, bytes] of Object.entries(serialized)) {
    if (file === "manifest.json") continue;
    const text = bytes.toString("utf8");
    for (const pattern of PRIVATE_CONTENT_PATTERNS) {
      addError(errors, !pattern.expression.test(text), "public_private_content_pattern", { file, pattern: pattern.id });
    }
  }
}

export async function validatePublicSnapshot({ publicDir = DEFAULT_PUBLIC, canonicalDir = DEFAULT_CANONICAL } = {}) {
  const errors = [];
  const warnings = [];
  const files = await listFiles(publicDir);
  addError(errors, sameValues(files, PUBLIC_OUTPUT_FILES), "public_file_set_mismatch", { expected: PUBLIC_OUTPUT_FILES, actual: files });
  const { serialized, documents } = await readPublicFiles(publicDir, errors);
  const manifest = documents["manifest.json"];
  addError(errors, Boolean(manifest), "public_manifest_missing");
  if (!manifest) return { ok: false, errors, warnings };

  addError(errors, manifest.snapshot_version === PUBLIC_SNAPSHOT_VERSION, "public_manifest_snapshot_version", { actual: manifest.snapshot_version });
  addError(errors, manifest.schema_version === PUBLIC_SCHEMA_VERSION, "public_manifest_schema_version", { actual: manifest.schema_version });
  addError(errors, manifest.fixture_version === PUBLIC_FIXTURE_VERSION, "public_manifest_fixture_version", { actual: manifest.fixture_version });
  addError(errors, manifest.generator_version === PUBLIC_GENERATOR_VERSION, "public_manifest_generator_version", { actual: manifest.generator_version });
  addError(errors, manifest.snapshot_at === PUBLIC_SNAPSHOT_AT && manifest.data_scope === PUBLIC_DATA_SCOPE, "public_manifest_time_scope", { snapshot_at: manifest.snapshot_at, data_scope: manifest.data_scope });
  addError(errors, manifest.hash_algorithm === "sha256" && manifest.input_root === "data/canonical", "public_manifest_hash_contract", { hash_algorithm: manifest.hash_algorithm, input_root: manifest.input_root });
  addError(errors, JSON.stringify(manifest.file_contracts) === JSON.stringify(expectedManifestContracts()), "public_manifest_allowlist_contract_drift", {});
  addError(errors, manifest.policy_checks?.length === 5 && manifest.policy_checks.every((record) => record.result === "clear" && record.hit_count === 0), "public_manifest_policy_result", { policy_checks: manifest.policy_checks });

  const manifestInputFiles = manifest.inputs?.map((record) => record.file) ?? [];
  addError(errors, JSON.stringify(manifestInputFiles) === JSON.stringify(PUBLIC_INPUT_FILES), "public_manifest_input_catalog", { actual: manifestInputFiles });
  const inputHashByFile = new Map((manifest.inputs ?? []).map((record) => [record.file, record.sha256]));
  for (const file of PUBLIC_INPUT_FILES) {
    try {
      const bytes = await readFile(resolve(canonicalDir, file));
      addError(errors, inputHashByFile.get(file) === sha256(bytes), "public_manifest_input_hash_mismatch", { file, expected: inputHashByFile.get(file), actual: sha256(bytes) });
    } catch (error) {
      errors.push({ code: "public_manifest_input_read_failed", detail: { file, message: error instanceof Error ? error.message : String(error) } });
    }
  }

  const expectedHashedOutputs = PUBLIC_OUTPUT_FILES.filter((file) => file !== "manifest.json");
  const outputFiles = manifest.outputs?.map((record) => record.file) ?? [];
  addError(errors, sameValues(outputFiles, expectedHashedOutputs), "public_manifest_output_catalog", { expected: expectedHashedOutputs, actual: outputFiles });
  addError(errors, unique(outputFiles), "public_manifest_duplicate_output", {});
  for (const output of manifest.outputs ?? []) {
    const bytes = serialized[output.file];
    addError(errors, Boolean(bytes), "public_manifest_output_missing", { file: output.file });
    if (bytes) {
      addError(errors, output.sha256 === sha256(bytes), "public_manifest_output_hash_mismatch", { file: output.file, expected: output.sha256, actual: sha256(bytes) });
      addError(errors, output.size_bytes === bytes.length, "public_manifest_output_size_mismatch", { file: output.file, expected: output.size_bytes, actual: bytes.length });
    }
  }

  try {
    assertPublicDocumentContracts(Object.fromEntries(Object.entries(documents).filter(([file]) => file !== "manifest.json")));
  } catch (error) {
    errors.push({ code: "public_allowlist_violation", detail: { message: error instanceof Error ? error.message : String(error) } });
  }
  const securityScan = scanPublicArtifacts(serialized, documents);
  addError(errors, securityScan.key_hits.length === 0, "public_forbidden_key", { hits: securityScan.key_hits });
  addError(errors, securityScan.pattern_hits.length === 0, "public_sensitive_pattern", { hits: securityScan.pattern_hits });
  checkPrivateContentPatterns(errors, serialized);
  checkCommonRecordBoundary(errors, documents);
  for (const [file, document] of Object.entries(documents)) {
    if (file !== "manifest.json" && PUBLIC_FILE_CONTRACTS[file]?.kind !== "document") collectIdentifierErrors(errors, document, file);
  }
  checkEntityAndViewRelations(errors, documents);
  const caseIds = new Set((documents["cases.json"]?.records ?? []).map((record) => record.case_id));
  checkScenarioBoundaries(errors, documents, caseIds);
  checkDeclarationsAndConsumerContract(errors, documents, manifest);

  return {
    ok: errors.length === 0,
    snapshot_version: manifest.snapshot_version,
    schema_version: manifest.schema_version,
    fixture_version: manifest.fixture_version,
    generator_version: manifest.generator_version,
    manifest_sha256: serialized["manifest.json"] ? sha256(serialized["manifest.json"]) : null,
    output_file_count: files.length,
    counts: {
      feedback: documents["views/feedback-inbox.json"]?.record_count ?? 0,
      cases: documents["cases.json"]?.record_count ?? 0,
      work_orders: documents["work-orders.json"]?.record_count ?? 0,
      clusters: documents["clusters.json"]?.record_count ?? 0,
      improvements: documents["improvements.json"]?.record_count ?? 0,
      main_stories: documents["main-story.json"]?.record_count ?? 0,
      failure_drills: documents["failure-drills.json"]?.record_count ?? 0,
      views: REQUIRED_VIEW_FILES.length,
    },
    input_hashes: Object.fromEntries(manifest.inputs.map((record) => [record.file, record.sha256])),
    output_hashes: Object.fromEntries((manifest.outputs ?? []).map((record) => [record.file, record.sha256])),
    policy_check_failures: errors.filter((record) => record.code.startsWith("public_") && (record.code.includes("forbidden") || record.code.includes("sensitive") || record.code.includes("private"))).length,
    errors,
    warnings,
  };
}

function cliValue(flag) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : null;
}

const isCli = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  const publicDir = cliValue("--public-dir") ?? DEFAULT_PUBLIC;
  const canonicalDir = cliValue("--canonical-dir") ?? DEFAULT_CANONICAL;
  const report = await validatePublicSnapshot({ publicDir, canonicalDir });
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exitCode = 1;
}
