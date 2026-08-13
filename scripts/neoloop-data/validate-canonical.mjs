import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "../..");
const DEFAULT_CANONICAL = resolve(REPO, "data/canonical");

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

function addError(errors, condition, code, detail) {
  if (!condition) errors.push({ code, detail });
}

function checkUnique(errors, rows, key, table) {
  const values = rows.map((row) => row[key]);
  addError(errors, values.every(Boolean), "missing_primary_key", { table, key });
  addError(errors, new Set(values).size === values.length, "duplicate_primary_key", { table, key });
}

function checkReferences(errors, sourceTable, sourceKey, values, targetTable, targetIds) {
  for (const value of values.flat().filter(Boolean)) {
    addError(errors, targetIds.has(value), "orphan_foreign_key", { source_table: sourceTable, source_key: sourceKey, value, target_table: targetTable });
  }
}

function mapValues(rows, getter) {
  return rows.map(getter).flat().filter(Boolean);
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function contractProjectionHash(manifest) {
  const projection = {
    schema_version: manifest.schema_version,
    data_scope: manifest.data_scope,
    evidence_classes: manifest.evidence_classes,
    fixed_regression_counts: manifest.fixed_regression_counts,
    tables: manifest.tables,
    status_enums: manifest.status_enums,
    relationship_invariants: manifest.relationship_invariants,
    contract_notes: manifest.contract_notes,
  };
  return createHash("sha256").update(stableJson(projection), "utf8").digest("hex");
}

function fixtureRecords(document) {
  return document?.records ?? [];
}

function checkFixtureWrapper(errors, document, label, manifest) {
  addError(errors, Boolean(document), "fixture_document_missing", { fixture: label });
  if (!document) return;
  addError(errors, document.fixture_version === manifest.fixture_index.fixture_version, "fixture_version_mismatch", { fixture: label, expected: manifest.fixture_index.fixture_version, actual: document.fixture_version });
  addError(errors, document.schema_version === manifest.schema_version, "fixture_schema_version_mismatch", { fixture: label, expected: manifest.schema_version, actual: document.schema_version });
  addError(errors, document.data_scope === "synthetic_experiment", "fixture_non_synthetic_scope", { fixture: label, actual: document.data_scope });
  addError(errors, document.evidence_class === "synthetic_experiment", "fixture_fact_boundary_mismatch", { fixture: label, actual: document.evidence_class });
  addError(errors, typeof document.disclaimer === "string" && document.disclaimer.length > 20, "fixture_disclaimer_missing", { fixture: label });
}

async function readIndexedFixture(errors, canonicalDir, file, label) {
  addError(errors, typeof file === "string" && file.length > 0, "fixture_path_missing", { fixture: label, file });
  if (typeof file !== "string" || file.length === 0) return null;
  const root = resolve(canonicalDir);
  const path = resolve(root, file);
  addError(errors, path.startsWith(`${root}/`), "fixture_path_outside_canonical", { fixture: label, file });
  if (!path.startsWith(`${root}/`)) return null;
  try {
    return await readJson(path);
  } catch (error) {
    errors.push({ code: "fixture_read_failed", detail: { fixture: label, file, message: error instanceof Error ? error.message : String(error) } });
    return null;
  }
}

export async function validateCanonical({ canonicalDir = DEFAULT_CANONICAL, sourceWorkbookPath = null } = {}) {
  const errors = [];
  const warnings = [];
  const manifest = await readJson(resolve(canonicalDir, "manifest.json"));
  const migration = await readJson(resolve(canonicalDir, "migration/legacy-to-canonical.json"));
  const sourceAudit = await readJson(resolve(canonicalDir, "migration/source-audit.json"));
  const factBoundaries = await readJson(resolve(canonicalDir, "fact-boundaries.json"));
  const tables = {};

  addError(errors, manifest.tables.length === 10, "canonical_table_count", { expected: 10, actual: manifest.tables.length });
  for (const definition of manifest.tables) {
    const rows = await readJson(resolve(canonicalDir, "tables", definition.file));
    tables[definition.name] = rows;
    addError(errors, rows.length === definition.row_count, "manifest_row_count_mismatch", { table: definition.name, manifest: definition.row_count, actual: rows.length });
    checkUnique(errors, rows, definition.primary_key, definition.name);

    const legacyIds = rows.map((row) => row.legacy_id).filter(Boolean);
    addError(errors, new Set(legacyIds).size === legacyIds.length, "duplicate_legacy_id", { table: definition.name });
    for (const [index, row] of rows.entries()) {
      for (const required of ["schema_version", "data_scope", "evidence_class", "created_at", "updated_at", "legacy_id", "source_kind"]) {
        addError(errors, Object.hasOwn(row, required), "missing_common_field", { table: definition.name, row: index, field: required });
      }
      addError(errors, row.schema_version === manifest.schema_version, "schema_version_mismatch", { table: definition.name, row: index, value: row.schema_version });
      addError(errors, row.data_scope === "synthetic_experiment", "non_synthetic_scope", { table: definition.name, row: index, value: row.data_scope });
      addError(errors, manifest.evidence_classes.includes(row.evidence_class), "unknown_evidence_class", { table: definition.name, row: index, value: row.evidence_class });
    }
  }

  for (const [table, expected] of Object.entries(manifest.fixed_regression_counts)) {
    addError(errors, tables[table]?.length === expected, "fixed_count_mismatch", { table, expected, actual: tables[table]?.length });
  }

  const ids = Object.fromEntries(manifest.tables.map((definition) => [definition.name, new Set(tables[definition.name].map((row) => row[definition.primary_key]))]));
  const allPrimaryKeys = manifest.tables.flatMap((definition) => tables[definition.name].map((row) => row[definition.primary_key]));
  addError(errors, new Set(allPrimaryKeys).size === allPrimaryKeys.length, "duplicate_primary_key_across_tables", {});

  checkReferences(errors, "raw_feedback", "linked_case_id", mapValues(tables.raw_feedback, (row) => row.linked_case_id), "cases", ids.cases);
  checkReferences(errors, "raw_feedback", "candidate_vehicle_id", mapValues(tables.raw_feedback, (row) => row.candidate_vehicle_id), "vehicles", ids.vehicles);
  checkReferences(errors, "raw_feedback", "candidate_task_id", mapValues(tables.raw_feedback, (row) => row.candidate_task_id), "delivery_tasks", ids.delivery_tasks);
  checkReferences(errors, "cases", "entity_candidates.vehicle_id", mapValues(tables.cases, (row) => row.entity_candidates?.vehicle_id), "vehicles", ids.vehicles);
  checkReferences(errors, "cases", "entity_candidates.task_id", mapValues(tables.cases, (row) => row.entity_candidates?.task_id), "delivery_tasks", ids.delivery_tasks);
  checkReferences(errors, "cases", "cluster_id", mapValues(tables.cases, (row) => row.cluster_id), "clusters", ids.clusters);
  checkReferences(errors, "cases", "routing_rule_candidate_id", mapValues(tables.cases, (row) => row.routing_rule_candidate_id), "routing_matrix", ids.routing_matrix);
  checkReferences(errors, "work_orders", "case_id", mapValues(tables.work_orders, (row) => row.case_id), "cases", ids.cases);
  checkReferences(errors, "clusters", "member_case_ids", mapValues(tables.clusters, (row) => row.member_case_ids), "cases", ids.cases);
  checkReferences(errors, "improvements", "cluster_id", mapValues(tables.improvements, (row) => row.cluster_id), "clusters", ids.clusters);
  checkReferences(errors, "delivery_tasks", "vehicle_id", mapValues(tables.delivery_tasks, (row) => row.vehicle_id), "vehicles", ids.vehicles);

  const improvementStatusByClusterStatus = manifest.relationship_invariants?.improvement_status_by_cluster_status ?? {};
  const expectedClusterStatuses = manifest.status_enums.clusters;
  addError(
    errors,
    expectedClusterStatuses.every((status) => Object.hasOwn(improvementStatusByClusterStatus, status)),
    "incomplete_improvement_status_relationship",
    { expected_cluster_statuses: expectedClusterStatuses, actual_cluster_statuses: Object.keys(improvementStatusByClusterStatus) },
  );
  const clustersById = new Map(tables.clusters.map((cluster) => [cluster.cluster_id, cluster]));
  for (const improvement of tables.improvements) {
    const cluster = clustersById.get(improvement.cluster_id);
    const expectedStatus = cluster ? improvementStatusByClusterStatus[cluster.status] : null;
    addError(errors, Boolean(expectedStatus), "unmapped_improvement_status_relationship", { improvement_id: improvement.improvement_id, cluster_id: improvement.cluster_id, cluster_status: cluster?.status });
    addError(errors, improvement.status === expectedStatus, "improvement_status_relationship_mismatch", { improvement_id: improvement.improvement_id, cluster_id: improvement.cluster_id, cluster_status: cluster?.status, expected: expectedStatus, actual: improvement.status });
  }

  for (const [table, allowedStatuses] of Object.entries(manifest.status_enums)) {
    for (const row of tables[table]) {
      addError(errors, allowedStatuses.includes(row.status ?? row.processing_status), "unmapped_canonical_status", { table, id: row[manifest.tables.find((item) => item.name === table).primary_key], value: row.status ?? row.processing_status });
    }
  }

  const statusRules = [
    ["cases", "case_statuses"],
    ["work_orders", "work_order_statuses"],
    ["clusters", "cluster_statuses"],
  ];
  for (const [table, ruleName] of statusRules) {
    const mappedLegacyStatuses = migration.rules[ruleName];
    for (const row of tables[table]) {
      if (row.legacy_status) addError(errors, Object.hasOwn(mappedLegacyStatuses, row.legacy_status), "unmapped_legacy_status", { table, legacy_id: row.legacy_id, value: row.legacy_status });
    }
  }

  const mappingLegacyIds = migration.mappings.map((item) => `${item.table}:${item.legacy_id}`);
  const mappingCanonicalIds = migration.mappings.map((item) => `${item.table}:${item.canonical_id}`);
  addError(errors, new Set(mappingLegacyIds).size === mappingLegacyIds.length, "duplicate_legacy_mapping", {});
  addError(errors, new Set(mappingCanonicalIds).size === mappingCanonicalIds.length, "duplicate_canonical_mapping", {});
  const migratedRows = manifest.tables.flatMap((definition) => tables[definition.name]
    .filter((row) => row.legacy_id)
    .map((row) => `${definition.name}:${row.legacy_id}:${row[definition.primary_key]}`));
  const mappedRows = migration.mappings.map((row) => `${row.table}:${row.legacy_id}:${row.canonical_id}`);
  addError(errors, migratedRows.length === mappedRows.length && migratedRows.every((value) => mappedRows.includes(value)), "migration_mapping_gap", { migrated_rows: migratedRows.length, mappings: mappedRows.length });

  const specialMappings = Object.fromEntries(tables.cases.map((row) => [row.legacy_id, row.case_id]));
  addError(errors, specialMappings["DEMO-C-002"] === "SYN-CASE-017", "locked_case_mapping", { legacy_id: "DEMO-C-002", actual: specialMappings["DEMO-C-002"] });
  addError(errors, specialMappings["DEMO-C-017"] === "SYN-CASE-002", "locked_case_mapping", { legacy_id: "DEMO-C-017", actual: specialMappings["DEMO-C-017"] });

  for (const feedback of tables.raw_feedback) addError(errors, feedback.original_text_mutable === false, "mutable_original_text", { feedback_id: feedback.feedback_id });
  const migratedIncompleteCaseIds = new Set(["DEMO-C-011", "DEMO-C-015", "DEMO-C-018"]);
  for (const record of tables.cases) {
    addError(errors, Array.isArray(record.missing_fields), "missing_fields_not_array", { case_id: record.case_id });
    addError(errors, !Object.hasOwn(record, "missing_items"), "deprecated_missing_items_present", { case_id: record.case_id });
    addError(errors, record.record_mode === "legacy_snapshot", "invalid_migrated_case_record_mode", { case_id: record.case_id, value: record.record_mode });
    addError(errors, record.formal_entity_confirmation_status === "待人工确认", "formal_entity_without_human_gate", { case_id: record.case_id });
    addError(errors, record.formal_entity == null, "formal_entity_preconfirmed", { case_id: record.case_id });
    if (record.status === "已关闭" && record.formal_entity_confirmation_status === "待人工确认") {
      addError(errors, record.workflow_readiness === "requires_replay_reset", "closed_snapshot_missing_replay_reset", { case_id: record.case_id, value: record.workflow_readiness });
    }
    if (record.legacy_status === "已分诊") {
      const expectedStatus = record.missing_fields.length === 0 ? "待关联" : "待补充";
      addError(errors, record.status === expectedStatus, "conditional_triage_status_mismatch", { case_id: record.case_id, missing_fields: record.missing_fields, expected: expectedStatus, actual: record.status });
    }
    if (migratedIncompleteCaseIds.has(record.legacy_id)) {
      addError(errors, record.status === "待补充", "known_incomplete_case_not_pending_supplement", { case_id: record.case_id, legacy_id: record.legacy_id, actual: record.status });
      addError(errors, record.missing_fields.includes("车辆ID") && record.missing_fields.includes("任务ID"), "known_incomplete_case_missing_field_list", { case_id: record.case_id, legacy_id: record.legacy_id, missing_fields: record.missing_fields });
    }
  }
  const triageRule = migration.rules.case_statuses?.["已分诊"];
  addError(errors, triageRule?.type === "conditional", "triage_rule_not_conditional", { rule: triageRule });
  addError(errors, triageRule?.condition === "missing_fields.length === 0", "triage_rule_wrong_condition", { rule: triageRule });
  addError(errors, triageRule?.when_complete === "待关联" && triageRule?.when_incomplete === "待补充", "triage_rule_wrong_targets", { rule: triageRule });
  for (const workOrder of tables.work_orders) addError(errors, workOrder.sla_reset_count === 0, "sla_reset_detected", { work_order_id: workOrder.work_order_id });
  for (const vehicle of tables.vehicles) addError(errors, vehicle.controls_available === false, "vehicle_control_exposed", { vehicle_id: vehicle.vehicle_id });

  const fixtureIndex = manifest.fixture_index;
  addError(errors, Boolean(fixtureIndex && typeof fixtureIndex === "object"), "fixture_index_missing", {});
  const actualContractProjectionHash = contractProjectionHash(manifest);
  if (fixtureIndex) {
    addError(errors, fixtureIndex.schema_version === manifest.schema_version, "fixture_index_schema_version_mismatch", { expected: manifest.schema_version, actual: fixtureIndex.schema_version });
    addError(errors, fixtureIndex.data_scope === "synthetic_experiment", "fixture_index_non_synthetic_scope", { actual: fixtureIndex.data_scope });
    addError(errors, fixtureIndex.contract_projection_sha256 === actualContractProjectionHash, "fixture_index_contract_projection_drift", { expected: fixtureIndex.contract_projection_sha256, actual: actualContractProjectionHash });
    addError(errors, fixtureIndex.counts?.gold === 20, "fixture_index_count_mismatch", { fixture: "gold", expected: 20, actual: fixtureIndex.counts?.gold });
    addError(errors, fixtureIndex.counts?.adversarial === 16, "fixture_index_count_mismatch", { fixture: "adversarial", expected: 16, actual: fixtureIndex.counts?.adversarial });
    addError(errors, fixtureIndex.counts?.main_stories === 1, "fixture_index_count_mismatch", { fixture: "main_stories", expected: 1, actual: fixtureIndex.counts?.main_stories });
    addError(errors, fixtureIndex.counts?.failure_drills === 4, "fixture_index_count_mismatch", { fixture: "failure_drills", expected: 4, actual: fixtureIndex.counts?.failure_drills });
    addError(errors, fixtureIndex.counts?.scenarios_total === 5, "fixture_index_count_mismatch", { fixture: "scenarios_total", expected: 5, actual: fixtureIndex.counts?.scenarios_total });
  }

  const goldDocument = fixtureIndex ? await readIndexedFixture(errors, canonicalDir, fixtureIndex.gold?.file, "gold") : null;
  const adversarialDocument = fixtureIndex ? await readIndexedFixture(errors, canonicalDir, fixtureIndex.adversarial?.file, "adversarial") : null;
  const mainStoryDocument = fixtureIndex ? await readIndexedFixture(errors, canonicalDir, fixtureIndex.scenarios?.main_story?.file, "main_story") : null;
  const failureDocument = fixtureIndex ? await readIndexedFixture(errors, canonicalDir, fixtureIndex.scenarios?.failure_drills?.file, "failure_drills") : null;
  const workbookCatalog = fixtureIndex ? await readIndexedFixture(errors, canonicalDir, fixtureIndex.workbooks?.catalog_file, "workbook_catalog") : null;

  if (fixtureIndex) {
    checkFixtureWrapper(errors, goldDocument, "gold", manifest);
    checkFixtureWrapper(errors, adversarialDocument, "adversarial", manifest);
    checkFixtureWrapper(errors, mainStoryDocument, "main_story", manifest);
    checkFixtureWrapper(errors, failureDocument, "failure_drills", manifest);
  }

  const goldRecords = fixtureRecords(goldDocument);
  if (fixtureIndex && goldDocument) {
    addError(errors, goldRecords.length === 20 && goldRecords.length === fixtureIndex.gold.record_count, "fixture_gold_count", { expected: 20, actual: goldRecords.length, indexed: fixtureIndex.gold.record_count });
    addError(errors, goldDocument.annotation?.status === "draft_pending_human_review" && goldDocument.annotation?.human_reviewed === false, "fixture_gold_annotation_boundary", { annotation: goldDocument.annotation });
    addError(errors, goldDocument.source_contract?.source_record_mode === "legacy_snapshot" && goldDocument.source_contract?.legacy_snapshots_are_workflow_run_evidence === false, "fixture_gold_legacy_boundary", { source_contract: goldDocument.source_contract });
    addError(errors, new Set(goldRecords.map((record) => record.gold_id)).size === goldRecords.length, "fixture_duplicate_gold_id", {});
    addError(errors, new Set(goldRecords.map((record) => record.case_id)).size === goldRecords.length, "fixture_duplicate_gold_case", {});
    addError(errors, tables.cases.length === goldRecords.length && tables.cases.every((record) => goldRecords.some((gold) => gold.case_id === record.case_id)), "fixture_gold_case_coverage", { case_count: tables.cases.length, gold_count: goldRecords.length });

    const caseById = new Map(tables.cases.map((record) => [record.case_id, record]));
    const feedbackByCase = Map.groupBy(tables.raw_feedback, (record) => record.linked_case_id);
    for (const record of goldRecords) {
      const source = caseById.get(record.case_id);
      addError(errors, Boolean(source), "fixture_gold_unknown_case", { gold_id: record.gold_id, case_id: record.case_id });
      if (!source) continue;
      addError(errors, record.gold_id === `GOLD-${record.case_id}`, "fixture_gold_id_rule", { gold_id: record.gold_id, case_id: record.case_id });
      addError(errors, record.legacy_id === source.legacy_id, "fixture_gold_legacy_id_mismatch", { gold_id: record.gold_id, expected: source.legacy_id, actual: record.legacy_id });
      addError(errors, record.source_record_mode === "legacy_snapshot" && record.workflow_run_evidence === false, "fixture_gold_workflow_evidence_boundary", { gold_id: record.gold_id });
      addError(errors, record.annotation?.status === "draft_pending_human_review" && record.annotation?.human_reviewed === false, "fixture_gold_record_annotation_boundary", { gold_id: record.gold_id, annotation: record.annotation });
      addError(errors, record.expected_classification?.domain === source.category_domain && record.expected_classification?.detail === source.category_detail, "fixture_gold_classification_mismatch", { gold_id: record.gold_id });
      addError(errors, Object.hasOwn(record, "expected_hard_rule_risk") && record.expected_hard_rule_risk === source.rule_risk, "fixture_gold_hard_risk_mismatch", { gold_id: record.gold_id, expected: source.rule_risk, actual: record.expected_hard_rule_risk });
      addError(errors, record.expected_final_risk === source.final_risk, "fixture_gold_final_risk_mismatch", { gold_id: record.gold_id, expected: source.final_risk, actual: record.expected_final_risk });
      addError(errors, JSON.stringify(record.missing_fields) === JSON.stringify(source.missing_fields), "fixture_gold_missing_fields_mismatch", { gold_id: record.gold_id, expected: source.missing_fields, actual: record.missing_fields });
      addError(errors, record.entity_human_confirmation?.required === true && record.entity_human_confirmation?.status === "待人工确认", "fixture_gold_entity_human_gate", { gold_id: record.gold_id, value: record.entity_human_confirmation });
      addError(errors, record.routing_human_confirmation?.required === true && record.routing_human_confirmation?.status === "待人工确认", "fixture_gold_routing_human_gate", { gold_id: record.gold_id, value: record.routing_human_confirmation });
      addError(errors, typeof record.expected_safety_stop?.required === "boolean" && typeof record.expected_safety_stop?.handoff === "string", "fixture_gold_safety_stop_missing", { gold_id: record.gold_id, value: record.expected_safety_stop });
      const expectedReferences = [
        `data/canonical/tables/cases.json#${record.case_id}`,
        ...(feedbackByCase.get(record.case_id) ?? []).map((feedback) => `data/canonical/tables/raw-feedback.json#${feedback.feedback_id}`),
      ].sort();
      const actualReferences = Array.isArray(record.evidence_references) ? [...record.evidence_references].sort() : [];
      addError(errors, JSON.stringify(actualReferences) === JSON.stringify(expectedReferences), "fixture_gold_evidence_reference_mismatch", { gold_id: record.gold_id, expected: expectedReferences, actual: actualReferences });
    }

    const highRiskPopulation = goldRecords.filter((record) => ["P0", "P1"].includes(record.expected_final_risk)).map((record) => record.gold_id).sort();
    const indexedHighRiskPopulation = [...(fixtureIndex.gold.p0_p1_metric_population ?? [])].sort();
    addError(errors, JSON.stringify(highRiskPopulation) === JSON.stringify(indexedHighRiskPopulation), "fixture_gold_metric_population_mismatch", { expected: highRiskPopulation, actual: indexedHighRiskPopulation });
  }

  const adversarialRecords = fixtureRecords(adversarialDocument);
  if (fixtureIndex && adversarialDocument) {
    const categoryCounts = fixtureIndex.adversarial.category_counts ?? {};
    addError(errors, adversarialRecords.length === 16 && adversarialRecords.length === fixtureIndex.adversarial.record_count, "fixture_adversarial_count", { expected: 16, actual: adversarialRecords.length, indexed: fixtureIndex.adversarial.record_count });
    addError(errors, new Set(adversarialRecords.map((record) => record.adversarial_id)).size === adversarialRecords.length, "fixture_duplicate_adversarial_id", {});
    addError(errors, JSON.stringify([...(adversarialDocument.category_keys ?? [])].sort()) === JSON.stringify(Object.keys(categoryCounts).sort()), "fixture_adversarial_category_catalog_mismatch", { wrapper: adversarialDocument.category_keys, manifest: Object.keys(categoryCounts) });
    for (const [category, expected] of Object.entries(categoryCounts)) {
      const actual = adversarialRecords.filter((record) => record.category_key === category).length;
      addError(errors, actual === expected && expected === 2, "fixture_adversarial_category_count", { category, expected, actual });
    }
    for (const record of adversarialRecords) {
      addError(errors, Object.hasOwn(categoryCounts, record.category_key), "fixture_adversarial_unknown_category", { adversarial_id: record.adversarial_id, category: record.category_key });
      addError(errors, record.data_scope === "synthetic_experiment" && record.evidence_class === "synthetic_experiment", "fixture_adversarial_fact_boundary", { adversarial_id: record.adversarial_id });
      addError(errors, typeof record.input_text === "string" && record.input_text.startsWith("合成测试："), "fixture_adversarial_input_boundary", { adversarial_id: record.adversarial_id });
      addError(errors, record.expected_refusal === true && record.needs_human === true, "fixture_adversarial_safe_handoff", { adversarial_id: record.adversarial_id, expected_refusal: record.expected_refusal, needs_human: record.needs_human });
      addError(errors, Array.isArray(record.forbidden_actions) && record.forbidden_actions.length > 0 && new Set(record.forbidden_actions).size === record.forbidden_actions.length, "fixture_adversarial_forbidden_actions", { adversarial_id: record.adversarial_id, actions: record.forbidden_actions });
      addError(errors, record.audit_expectation?.required === true && record.audit_expectation?.expected_status === "refused" && record.audit_expectation?.preserve_original_input === true, "fixture_adversarial_audit_expectation", { adversarial_id: record.adversarial_id, expectation: record.audit_expectation });
    }
    const highRiskRecords = adversarialRecords.filter((record) => record.category_key === "high_risk");
    addError(errors, highRiskRecords.every((record) => ["P0", "P1"].includes(record.expected_hard_rule_risk) && ["P0", "P1"].includes(record.expected_final_risk)), "fixture_adversarial_high_risk_labels", { records: highRiskRecords.map((record) => ({ id: record.adversarial_id, hard: record.expected_hard_rule_risk, final: record.expected_final_risk })) });
    const indexedHighRiskIds = [...(fixtureIndex.adversarial.p0_p1_metric_population ?? [])].sort();
    addError(errors, JSON.stringify(highRiskRecords.map((record) => record.adversarial_id).sort()) === JSON.stringify(indexedHighRiskIds), "fixture_adversarial_high_risk_population", { expected: highRiskRecords.map((record) => record.adversarial_id).sort(), actual: indexedHighRiskIds });
  }

  const mainStoryRecords = fixtureRecords(mainStoryDocument);
  if (fixtureIndex && mainStoryDocument) {
    addError(errors, mainStoryRecords.length === 1 && mainStoryRecords.length === fixtureIndex.scenarios.main_story.record_count, "fixture_main_story_count", { expected: 1, actual: mainStoryRecords.length });
    const scenario = mainStoryRecords[0];
    const source = tables.cases.find((record) => record.case_id === "SYN-CASE-017");
    addError(errors, scenario?.source_case_id === "SYN-CASE-017" && scenario?.source_record_mode === "legacy_snapshot", "fixture_main_story_source", { scenario });
    addError(errors, scenario?.record_mode === "scenario_runtime" && scenario?.runtime_case_id !== scenario?.source_case_id, "fixture_main_story_runtime_isolation", { scenario_id: scenario?.scenario_id, runtime_case_id: scenario?.runtime_case_id });
    addError(errors, scenario?.execution_status === "not_run" && scenario?.run_evidence?.length === 0 && scenario?.observed_results?.length === 0, "fixture_main_story_false_run_evidence", { scenario_id: scenario?.scenario_id });
    addError(errors, scenario?.isolation?.runtime_copy_is_independent === true && scenario?.isolation?.source_snapshot_mutation_allowed === false && scenario?.isolation?.legacy_snapshot_is_workflow_run_evidence === false && scenario?.isolation?.replay_reset?.required === true, "fixture_main_story_isolation_contract", { isolation: scenario?.isolation });
    addError(errors, scenario?.clock?.source === "test" && scenario?.observation_clock?.source === "synthetic_history" && scenario?.observation_clock?.execution_status === "not_run", "fixture_main_story_clock_boundary", { clock: scenario?.clock, observation_clock: scenario?.observation_clock });
    const input = scenario?.input_fixture;
    const requiredInputFields = ["schema_version", "data_scope", "evidence_class", "feedback_id", "source_kind", "source_name", "source_record_id", "source_tenant_scope", "authorization_scope", "source_timezone", "received_at", "idempotency_key", "channel", "sender_role", "original_text", "original_text_mutable", "vehicle_id", "task_id", "station_id"];
    addError(errors, requiredInputFields.every((field) => Object.hasOwn(input ?? {}, field) && input[field] !== "" && input[field] != null), "fixture_main_story_input_incomplete", { missing: requiredInputFields.filter((field) => !Object.hasOwn(input ?? {}, field) || input[field] === "" || input[field] == null) });
    addError(errors, input?.schema_version === manifest.schema_version && input?.data_scope === "synthetic_experiment" && input?.evidence_class === "synthetic_experiment" && input?.authorization_scope === "synthetic_demo_only" && input?.original_text_mutable === false, "fixture_main_story_input_boundary", { input });
    const expectedInputKey = input ? createHash("sha256").update(`${input.source_tenant_scope}|${input.channel}|${input.source_record_id}`).digest("hex") : null;
    addError(errors, input?.idempotency_key === expectedInputKey && /^[a-f0-9]{64}$/.test(input?.idempotency_key ?? ""), "fixture_main_story_idempotency_key", { expected: expectedInputKey, actual: input?.idempotency_key });
    addError(errors, Number.isFinite(Date.parse(input?.received_at ?? "")) && input?.source_timezone === scenario?.clock?.timezone, "fixture_main_story_input_clock", { received_at: input?.received_at, source_timezone: input?.source_timezone, scenario_timezone: scenario?.clock?.timezone });
    addError(errors, scenario?.expected_case_draft?.case_status === "待关联" && Array.isArray(scenario?.expected_case_draft?.missing_fields) && scenario.expected_case_draft.missing_fields.length === 0, "fixture_main_story_initial_case_expectation", { expected_case_draft: scenario?.expected_case_draft });
    addError(errors, JSON.stringify(scenario?.planned_workflow_path?.map((step) => step.workflow)) === JSON.stringify(["W1", "W2", "W6", "W3", "W4", "W5", "W6"]), "fixture_main_story_workflow_order", { path: scenario?.planned_workflow_path });
    addError(errors, scenario?.station_lineage?.source_station_id === source?.entity_candidates?.station_id && scenario?.station_lineage?.runtime_station_id === scenario?.input_fixture?.station_id, "fixture_main_story_station_lineage", { station_lineage: scenario?.station_lineage });
    addError(errors, Array.isArray(scenario?.human_gates) && scenario.human_gates.length >= 8 && scenario.human_gates.every((gate) => gate.required === true) && new Set(scenario.human_gates.map((gate) => gate.gate_key)).size === scenario.human_gates.length, "fixture_main_story_human_gates", { gates: scenario?.human_gates });
    addError(errors, Array.isArray(scenario?.forbidden_actions) && scenario.forbidden_actions.length > 0, "fixture_main_story_forbidden_actions", { actions: scenario?.forbidden_actions });
  }

  const failureRecords = fixtureRecords(failureDocument);
  if (fixtureIndex && failureDocument) {
    const expectedFailureCategories = [
      "same_key_retry_and_different_key_similar",
      "missing_vehicle_and_task_ids",
      "invalid_ai_schema_retry_once_then_human",
      "sla_timeout_escalation_preserves_clock",
    ];
    addError(errors, failureRecords.length === 4 && failureRecords.length === fixtureIndex.scenarios.failure_drills.record_count, "fixture_failure_count", { expected: 4, actual: failureRecords.length });
    addError(errors, JSON.stringify(failureRecords.map((record) => record.category_key).sort()) === JSON.stringify(expectedFailureCategories.sort()), "fixture_failure_category_coverage", { actual: failureRecords.map((record) => record.category_key) });
    addError(errors, new Set(failureRecords.map((record) => record.drill_id)).size === failureRecords.length && new Set(failureRecords.map((record) => record.runtime_case_id)).size === failureRecords.length, "fixture_failure_duplicate_id", {});
    for (const drill of failureRecords) {
      addError(errors, drill.source_case_id === "SYN-CASE-017" && drill.source_record_mode === "legacy_snapshot" && drill.record_mode === "scenario_runtime", "fixture_failure_runtime_isolation", { drill_id: drill.drill_id });
      addError(errors, drill.execution_status === "not_run" && drill.run_evidence?.length === 0 && drill.observed_results?.length === 0, "fixture_failure_false_run_evidence", { drill_id: drill.drill_id });
      addError(errors, drill.clock?.source === "test", "fixture_failure_clock_source", { drill_id: drill.drill_id, clock: drill.clock });
      addError(errors, Array.isArray(drill.human_gates) && drill.human_gates.length > 0 && drill.human_gates.every((gate) => gate.required === true), "fixture_failure_human_gate", { drill_id: drill.drill_id, gates: drill.human_gates });
      addError(errors, Array.isArray(drill.forbidden_actions) && drill.forbidden_actions.length > 0, "fixture_failure_forbidden_actions", { drill_id: drill.drill_id, actions: drill.forbidden_actions });
    }

    const idempotency = failureRecords.find((record) => record.category_key === "same_key_retry_and_different_key_similar");
    const originalAttempt = idempotency?.input_attempts?.find((attempt) => attempt.attempt_key === "original");
    const sameKeyAttempt = idempotency?.input_attempts?.find((attempt) => attempt.attempt_key === "same_key_retry");
    const differentKeyAttempt = idempotency?.input_attempts?.find((attempt) => attempt.attempt_key === "different_key_similar");
    addError(errors, originalAttempt?.idempotency_key === sameKeyAttempt?.idempotency_key && originalAttempt?.source_record_id === sameKeyAttempt?.source_record_id && originalAttempt?.original_text === sameKeyAttempt?.original_text, "fixture_failure_same_key_semantics", { drill_id: idempotency?.drill_id });
    addError(errors, differentKeyAttempt?.idempotency_key !== originalAttempt?.idempotency_key && differentKeyAttempt?.source_record_id !== originalAttempt?.source_record_id, "fixture_failure_different_key_semantics", { drill_id: idempotency?.drill_id });
    addError(errors, idempotency?.input_attempts?.every((attempt) => attempt.idempotency_key === createHash("sha256").update(`${attempt.source_tenant_scope}|${attempt.channel}|${attempt.source_record_id}`).digest("hex") && /^[a-f0-9]{64}$/.test(attempt.idempotency_key) && attempt.authorization_scope === "synthetic_demo_only"), "fixture_failure_idempotency_key_derivation", { drill_id: idempotency?.drill_id });
    addError(errors, ["A站", "舱门", "延误"].every((token) => originalAttempt?.original_text?.includes(token) && differentKeyAttempt?.original_text?.includes(token)), "fixture_failure_similar_text_semantics", { drill_id: idempotency?.drill_id });
    addError(errors, idempotency?.expected_semantics?.same_key_retry?.new_raw_feedback_count === 0 && idempotency?.expected_semantics?.same_key_retry?.new_case_count === 0 && idempotency?.expected_semantics?.different_key_similar?.new_raw_feedback_count === 1 && idempotency?.expected_semantics?.different_key_similar?.new_case_count === 1 && idempotency?.expected_semantics?.different_key_similar?.automatic_merge === false, "fixture_failure_idempotency_expected_counts", { semantics: idempotency?.expected_semantics });

    const missingIds = failureRecords.find((record) => record.category_key === "missing_vehicle_and_task_ids");
    addError(errors, JSON.stringify(missingIds?.fault_injection?.remove_fields) === JSON.stringify(["vehicle_id", "task_id"]) && JSON.stringify(missingIds?.expected_semantics?.missing_fields) === JSON.stringify(["车辆ID", "任务ID"]) && missingIds?.expected_semantics?.next_case_status === "待补充" && missingIds?.expected_semantics?.fabricated_ids === false && missingIds?.expected_semantics?.formal_entity_written === false, "fixture_failure_missing_entity_semantics", { drill_id: missingIds?.drill_id });

    const invalidSchema = failureRecords.find((record) => record.category_key === "invalid_ai_schema_retry_once_then_human");
    addError(errors, invalidSchema?.fault_injection?.node === "N4" && invalidSchema?.fault_injection?.mode === "entity_candidates" && invalidSchema?.fault_injection?.invalid_output_kind === "missing_required_envelope_fields" && invalidSchema?.retry_policy?.max_retries === 1 && invalidSchema?.retry_policy?.same_node_version_required === true && invalidSchema?.retry_policy?.on_retry_failure === "stop_node_chain_and_handoff_to_human", "fixture_failure_ai_retry_policy", { drill_id: invalidSchema?.drill_id, fault_injection: invalidSchema?.fault_injection, policy: invalidSchema?.retry_policy });
    addError(errors, invalidSchema?.expected_semantics?.audit_each_attempt === true && invalidSchema?.expected_semantics?.last_invalid_node_status === "error" && invalidSchema?.expected_semantics?.chain_handoff_status === "needs_human" && invalidSchema?.expected_semantics?.continue_downstream_nodes === false && invalidSchema?.expected_semantics?.preserve_existing_state === true, "fixture_failure_ai_safe_handoff", { drill_id: invalidSchema?.drill_id, semantics: invalidSchema?.expected_semantics });

    const slaTimeout = failureRecords.find((record) => record.category_key === "sla_timeout_escalation_preserves_clock");
    addError(errors, slaTimeout?.sla_clock?.reset_count === 0 && slaTimeout?.sla_clock?.original_started_at === slaTimeout?.sla_clock?.expected_after_escalation_started_at && slaTimeout?.sla_clock?.original_due_at === slaTimeout?.sla_clock?.expected_after_escalation_due_at, "fixture_failure_sla_clock_reset", { drill_id: slaTimeout?.drill_id, sla_clock: slaTimeout?.sla_clock });
    addError(errors, Date.parse(slaTimeout?.sla_clock?.original_started_at ?? "") < Date.parse(slaTimeout?.sla_clock?.original_due_at ?? "") && Date.parse(slaTimeout?.sla_clock?.original_due_at ?? "") < Date.parse(slaTimeout?.fault_injection?.simulated_at ?? "") && Date.parse(slaTimeout?.fault_injection?.simulated_at ?? "") === Date.parse(slaTimeout?.clock?.anchor ?? ""), "fixture_failure_sla_clock_order", { drill_id: slaTimeout?.drill_id, clock: slaTimeout?.clock, fault_injection: slaTimeout?.fault_injection, sla_clock: slaTimeout?.sla_clock });
    addError(errors, slaTimeout?.expected_semantics?.escalation_notification_required === true && slaTimeout?.expected_semantics?.administrator_notification_on_failure === true && slaTimeout?.expected_semantics?.preserve_original_clock === true && slaTimeout?.expected_semantics?.preserve_original_status === true, "fixture_failure_sla_escalation_semantics", { drill_id: slaTimeout?.drill_id, semantics: slaTimeout?.expected_semantics });

    const allRuntimeCaseIds = [...mainStoryRecords, ...failureRecords].map((record) => record.runtime_case_id);
    addError(errors, new Set(allRuntimeCaseIds).size === allRuntimeCaseIds.length, "fixture_scenario_runtime_id_collision", { runtime_case_ids: allRuntimeCaseIds });
  }

  if (fixtureIndex && workbookCatalog) {
    addError(errors, workbookCatalog.schema_version === manifest.schema_version && workbookCatalog.data_scope === "synthetic_experiment", "fixture_workbook_catalog_boundary", { schema_version: workbookCatalog.schema_version, data_scope: workbookCatalog.data_scope });
    addError(errors, workbookCatalog.builder === "scripts/neoloop-data/build-r2-workbooks.mjs", "fixture_workbook_builder_path", { builder: workbookCatalog.builder });
    addError(errors, Array.isArray(workbookCatalog.workbooks) && workbookCatalog.workbooks.length === 3 && workbookCatalog.workbooks.length === fixtureIndex.workbooks.workbook_count, "fixture_workbook_count", { expected: 3, actual: workbookCatalog.workbooks?.length });
    const sheetCounts = workbookCatalog.workbooks?.map((workbook) => workbook.sheets.length) ?? [];
    addError(errors, JSON.stringify(sheetCounts) === JSON.stringify(fixtureIndex.workbooks.sheet_counts), "fixture_workbook_sheet_counts", { expected: fixtureIndex.workbooks.sheet_counts, actual: sheetCounts });
    addError(errors, workbookCatalog.workbooks?.every((workbook) => new Set(workbook.sheets).size === workbook.sheets.length), "fixture_workbook_duplicate_sheet", {});
    addError(errors, workbookCatalog.build_policy?.artifact_tool_only === true && workbookCatalog.build_policy?.runtime_results_prefilled === false && workbookCatalog.build_policy?.permission_results_prefilled === false && workbookCatalog.build_policy?.experiment_measurements_prefilled === false && workbookCatalog.build_policy?.render_every_worksheet === true && workbookCatalog.build_policy?.post_export_reimport_required === true, "fixture_workbook_policy", { policy: workbookCatalog.build_policy });
  }

  addError(errors, Object.keys(factBoundaries.classes).sort().join("|") === manifest.evidence_classes.slice().sort().join("|"), "fact_boundary_catalog_mismatch", {});
  addError(errors, sourceAudit.sha256 === manifest.source.sha256, "source_hash_manifest_mismatch", { audit: sourceAudit.sha256, manifest: manifest.source.sha256 });
  if (sourceWorkbookPath) {
    const bytes = await readFile(sourceWorkbookPath);
    const actualHash = createHash("sha256").update(bytes).digest("hex");
    addError(errors, actualHash === manifest.source.sha256, "source_workbook_hash_mismatch", { expected: manifest.source.sha256, actual: actualHash, path: sourceWorkbookPath });
  } else {
    warnings.push({ code: "source_workbook_hash_not_rechecked", detail: "Pass --source-xlsx <path> to verify the immutable source file bytes." });
  }

  const report = {
    ok: errors.length === 0,
    checked_at: new Date().toISOString(),
    counts: Object.fromEntries(manifest.tables.map((definition) => [definition.name, tables[definition.name].length])),
    fixture_counts: {
      gold: goldRecords.length,
      adversarial: adversarialRecords.length,
      main_stories: mainStoryRecords.length,
      failure_drills: failureRecords.length,
      scenarios_total: mainStoryRecords.length + failureRecords.length,
    },
    workbook_catalog: {
      workbook_count: workbookCatalog?.workbooks?.length ?? 0,
      sheet_counts: workbookCatalog?.workbooks?.map((workbook) => workbook.sheets.length) ?? [],
    },
    contract_projection_sha256: actualContractProjectionHash,
    migration_mappings: migration.mappings.length,
    duplicate_primary_keys: errors.filter((item) => item.code.includes("duplicate_primary_key")).length,
    orphan_foreign_keys: errors.filter((item) => item.code === "orphan_foreign_key").length,
    unmapped_statuses: errors.filter((item) => item.code.includes("unmapped_") && item.code.includes("status")).length,
    relationship_invariant_violations: errors.filter((item) => item.code.includes("improvement_status_relationship")).length,
    contract_invariant_violations: errors.filter((item) => [
      "missing_fields_not_array",
      "deprecated_missing_items_present",
      "invalid_migrated_case_record_mode",
      "closed_snapshot_missing_replay_reset",
      "conditional_triage_status_mismatch",
      "known_incomplete_case_not_pending_supplement",
      "known_incomplete_case_missing_field_list",
      "triage_rule_not_conditional",
      "triage_rule_wrong_condition",
      "triage_rule_wrong_targets",
    ].includes(item.code)).length,
    fixture_invariant_violations: errors.filter((item) => item.code.startsWith("fixture_")).length,
    errors,
    warnings,
  };
  return report;
}

const isCli = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  const sourceFlagIndex = process.argv.indexOf("--source-xlsx");
  const sourceWorkbookPath = sourceFlagIndex >= 0 ? process.argv[sourceFlagIndex + 1] : null;
  const report = await validateCanonical({ sourceWorkbookPath });
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exitCode = 1;
}
