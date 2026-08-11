#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const CONTRACT_PATH = new URL("../manifests/owner-workbench-contract.v1.json", import.meta.url);
const MAX_INPUT_BYTES = 1024 * 1024;

function isObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function sameJson(actual, expected) {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

function uniqueSorted(values) {
  return [...new Set(values)].sort();
}

function exactStringSet(actual, expected) {
  if (!Array.isArray(actual) || actual.some((value) => typeof value !== "string")) return false;
  const normalized = uniqueSorted(actual);
  return normalized.length === actual.length && JSON.stringify(normalized) === JSON.stringify([...expected].sort());
}

export function loadOwnerWorkbenchContract() {
  const parsed = JSON.parse(readFileSync(CONTRACT_PATH, "utf8"));
  if (!isObject(parsed) || parsed.contract !== "neoloop.owner-workbench-contract.v1") {
    throw new Error("owner_workbench_contract_invalid");
  }
  return cloneJson(parsed);
}

function safeObserved(readback) {
  const tables = Array.isArray(readback?.tables) ? readback.tables : [];
  const views = Array.isArray(readback?.views) ? readback.views : [];
  const workflows = Array.isArray(readback?.workflows) ? readback.workflows : [];
  const fieldCount = tables.reduce(
    (total, table) => total + (Array.isArray(table?.field_names) ? table.field_names.length : 0),
    0,
  );
  const recordCount = tables.reduce(
    (total, table) => total + (Number.isInteger(table?.record_count) && table.record_count >= 0 ? table.record_count : 0),
    0,
  );
  const enabled = workflows.filter((workflow) => workflow?.enabled === true).length;
  const disabled = workflows.filter((workflow) => workflow?.enabled === false).length;
  return {
    table_count: tables.length,
    field_count: fieldCount,
    view_count: views.filter((view) => view?.view_class === "named_business").length,
    physical_view_count: views.length,
    record_count: recordCount,
    workflow_counts: { total: workflows.length, enabled, disabled },
  };
}

function projectObserved(observed) {
  if (!isObject(observed) || !isObject(observed.workflow_counts)) return null;
  const projected = {
    table_count: observed.table_count,
    field_count: observed.field_count,
    view_count: observed.view_count,
    physical_view_count: observed.physical_view_count,
    record_count: observed.record_count,
    workflow_counts: {
      total: observed.workflow_counts.total,
      enabled: observed.workflow_counts.enabled,
      disabled: observed.workflow_counts.disabled,
    },
  };
  return Object.values(projected).every((value) => (
    isObject(value)
      ? Object.values(value).every((count) => Number.isInteger(count) && count >= 0)
      : Number.isInteger(value) && value >= 0
  )) ? projected : null;
}

function buildSchemaOperations(contract) {
  return contract.schema_migration.field_additions.map((addition, index) => ({
    sequence: index + 1,
    kind: "create_field",
    table_ref: `logical://tables/${addition.table_key}`,
    field_name: addition.field_name,
    field_type: addition.field_type,
    ...(addition.allowed_values ? { allowed_values: cloneJson(addition.allowed_values) } : {}),
    required_for_new_ingest: addition.required_for_new_ingest,
    hidden_by_default: addition.hidden_by_default,
    backfill: addition.backfill,
    writer: addition.writer,
    execute: false,
  }));
}

function buildExistingRecordGuard(contract) {
  return {
    before_record_count: contract.baseline.record_count,
    expected_after_record_count: contract.baseline.record_count,
    existing_record_updates_allowed: false,
    existing_record_deletes_allowed: false,
  };
}

function buildSchemaRollback(contract) {
  return { ...cloneJson(contract.schema_migration.rollback), execute: false };
}

export function inspectOwnerWorkbenchReadback(readback, contract = loadOwnerWorkbenchContract()) {
  const issues = [];
  const baseline = contract.baseline;
  const observed = safeObserved(readback);

  if (!isObject(readback)) {
    return { valid: false, issue_codes: ["readback_shape_invalid"], observed };
  }

  const topLevelKeys = Object.keys(readback);
  if (!exactStringSet(topLevelKeys, contract.readback_contract.exact_top_level_keys)) {
    issues.push("readback_shape_invalid");
  }
  if (readback.contract !== contract.readback_contract.contract) issues.push("readback_contract_invalid");
  if (readback.redacted !== true) issues.push("readback_not_redacted");

  const tablesShapeValid = Array.isArray(readback.tables) && readback.tables.every((table) => (
    isObject(table) &&
    exactStringSet(Object.keys(table), ["table_key", "field_names", "record_count"]) &&
    typeof table.table_key === "string" &&
    Array.isArray(table.field_names) &&
    table.field_names.every((fieldName) => typeof fieldName === "string" && fieldName.length > 0) &&
    new Set(table.field_names).size === table.field_names.length &&
    Number.isInteger(table.record_count) &&
    table.record_count >= 0
  ));
  if (!tablesShapeValid) issues.push("table_readback_shape_invalid");

  const viewsShapeValid = Array.isArray(readback.views) && readback.views.every((view) => (
    isObject(view) &&
    exactStringSet(Object.keys(view), ["view_key", "view_class"]) &&
    typeof view.view_key === "string" &&
    ["default_table", "named_business"].includes(view.view_class)
  ));
  if (!viewsShapeValid) issues.push("view_readback_shape_invalid");

  const workflowsShapeValid = Array.isArray(readback.workflows) && readback.workflows.every((workflow) => (
    isObject(workflow) &&
    exactStringSet(Object.keys(workflow), ["workflow_key", "enabled"]) &&
    typeof workflow.workflow_key === "string" &&
    typeof workflow.enabled === "boolean"
  ));
  if (!workflowsShapeValid) issues.push("workflow_readback_shape_invalid");

  const w2ReadbackShapeValid = (
    isObject(readback.w2_readback) &&
    exactStringSet(Object.keys(readback.w2_readback), ["workflow_key", "title", "status", "step_types"]) &&
    typeof readback.w2_readback.workflow_key === "string" &&
    typeof readback.w2_readback.title === "string" &&
    typeof readback.w2_readback.status === "string" &&
    Array.isArray(readback.w2_readback.step_types) &&
    readback.w2_readback.step_types.every((stepType) => typeof stepType === "string")
  );
  if (!w2ReadbackShapeValid) issues.push("w2_readback_shape_invalid");

  if (observed.table_count !== baseline.table_count) issues.push("baseline_table_count_mismatch");
  if (observed.field_count !== baseline.field_count) issues.push("baseline_field_count_mismatch");
  if (observed.view_count !== baseline.view_count) issues.push("baseline_view_count_mismatch");
  if (observed.physical_view_count !== baseline.physical_view_count) {
    issues.push("baseline_physical_view_count_mismatch");
  }
  if (observed.record_count !== baseline.record_count) issues.push("baseline_record_count_mismatch");
  if (
    observed.workflow_counts.total !== baseline.workflow_counts.total ||
    observed.workflow_counts.enabled !== baseline.workflow_counts.enabled ||
    observed.workflow_counts.disabled !== baseline.workflow_counts.disabled
  ) {
    issues.push("baseline_workflow_state_mismatch");
  }

  if (tablesShapeValid) {
    const tableKeys = readback.tables.map(({ table_key }) => table_key);
    const expectedTableKeys = baseline.tables.map(({ table_key }) => table_key);
    if (!exactStringSet(tableKeys, expectedTableKeys)) issues.push("baseline_table_set_mismatch");

    const byKey = new Map(readback.tables.map((table) => [table.table_key, table]));
    if (baseline.tables.some((expected) => (
      byKey.get(expected.table_key)?.field_names.length !== expected.field_count
    ))) {
      issues.push("baseline_table_field_count_mismatch");
    }
    if (baseline.tables.some((expected) => (
      byKey.get(expected.table_key)?.record_count !== expected.record_count
    ))) {
      issues.push("baseline_table_record_count_mismatch");
    }

    const targetFieldExists = contract.schema_migration.field_additions.some((addition) => (
      byKey.get(addition.table_key)?.field_names.includes(addition.field_name)
    ));
    if (targetFieldExists) issues.push("target_field_already_exists");
  }

  if (viewsShapeValid) {
    const businessViewKeys = readback.views
      .filter(({ view_class }) => view_class === "named_business")
      .map(({ view_key }) => view_key);
    const defaultViewKeys = readback.views
      .filter(({ view_class }) => view_class === "default_table")
      .map(({ view_key }) => view_key);
    if (!exactStringSet(businessViewKeys, baseline.view_keys)) issues.push("baseline_view_set_mismatch");
    if (!exactStringSet(defaultViewKeys, baseline.default_view_keys)) issues.push("baseline_default_view_set_mismatch");
  }

  if (workflowsShapeValid) {
    const workflowKeys = readback.workflows.map(({ workflow_key }) => workflow_key);
    if (!exactStringSet(workflowKeys, baseline.workflow_keys)) issues.push("baseline_workflow_set_mismatch");
  }
  if (w2ReadbackShapeValid && JSON.stringify(readback.w2_readback) !== JSON.stringify(baseline.w2_readback)) {
    issues.push("baseline_w2_readback_mismatch");
  }

  const issueCodes = uniqueSorted(issues);
  return { valid: issueCodes.length === 0, issue_codes: issueCodes, observed };
}

export function blockedOwnerWorkbenchSchemaPlan(issueCodes, observed = null) {
  return {
    contract: "neoloop.owner-workbench.schema-plan.v1",
    mode: "plan_only",
    writes_executed: false,
    status: "blocked",
    issue_codes: uniqueSorted(issueCodes),
    observed: projectObserved(observed),
    operations: [],
    record_mutations: [],
    existing_record_guard: null,
    expected_post_state: null,
    rollback: { strategy: "no_action", execute: false },
  };
}

export function planOwnerWorkbenchSchema(readback) {
  let contract;
  try {
    contract = loadOwnerWorkbenchContract();
  } catch {
    return blockedOwnerWorkbenchSchemaPlan(["owner_workbench_contract_invalid"]);
  }
  const inspection = inspectOwnerWorkbenchReadback(readback, contract);
  if (!inspection.valid) {
    return blockedOwnerWorkbenchSchemaPlan(inspection.issue_codes, inspection.observed);
  }

  return {
    contract: "neoloop.owner-workbench.schema-plan.v1",
    mode: "plan_only",
    writes_executed: false,
    status: "ready",
    issue_codes: [],
    observed: inspection.observed,
    operations: buildSchemaOperations(contract),
    record_mutations: [],
    existing_record_guard: buildExistingRecordGuard(contract),
    expected_post_state: cloneJson(contract.schema_migration.expected_post_state),
    rollback: buildSchemaRollback(contract),
  };
}

function projectSchemaPlan(plan) {
  if (!isObject(plan)) return blockedOwnerWorkbenchSchemaPlan(["schema_plan_shape_invalid"]);
  if (plan.status !== "ready") {
    return blockedOwnerWorkbenchSchemaPlan(
      Array.isArray(plan.issue_codes) ? plan.issue_codes.filter((code) => typeof code === "string") : ["schema_plan_shape_invalid"],
      projectObserved(plan.observed),
    );
  }
  let contract;
  try {
    contract = loadOwnerWorkbenchContract();
  } catch {
    return blockedOwnerWorkbenchSchemaPlan(["owner_workbench_contract_invalid"]);
  }
  const expectedOperations = buildSchemaOperations(contract);
  const expectedGuard = buildExistingRecordGuard(contract);
  const expectedPostState = contract.schema_migration.expected_post_state;
  const expectedRollback = buildSchemaRollback(contract);
  if (
    !sameJson(plan.operations, expectedOperations) ||
    !sameJson(plan.record_mutations, []) ||
    !sameJson(plan.existing_record_guard, expectedGuard) ||
    !sameJson(plan.expected_post_state, expectedPostState) ||
    !sameJson(plan.rollback, expectedRollback)
  ) {
    return blockedOwnerWorkbenchSchemaPlan(["schema_plan_shape_invalid"], projectObserved(plan.observed));
  }
  return {
    contract: "neoloop.owner-workbench.schema-plan.v1",
    mode: "plan_only",
    writes_executed: false,
    status: "ready",
    issue_codes: [],
    observed: projectObserved(plan.observed),
    operations: expectedOperations,
    record_mutations: [],
    existing_record_guard: expectedGuard,
    expected_post_state: cloneJson(expectedPostState),
    rollback: expectedRollback,
  };
}

export function serializeOwnerWorkbenchSchemaPlan(plan) {
  return JSON.stringify(projectSchemaPlan(plan));
}

function parseStdin() {
  const input = readFileSync(0);
  if (input.byteLength === 0 || input.byteLength > MAX_INPUT_BYTES) {
    return { ok: false, issue: "input_size_invalid" };
  }
  try {
    return { ok: true, value: JSON.parse(input.toString("utf8")) };
  } catch {
    return { ok: false, issue: "input_json_invalid" };
  }
}

export function runOwnerWorkbenchSchemaPlannerCli(args = process.argv.slice(2)) {
  if (args.length > 0) {
    return { exitCode: 1, plan: blockedOwnerWorkbenchSchemaPlan(["execution_flag_forbidden"]) };
  }
  const parsed = parseStdin();
  if (!parsed.ok) {
    return { exitCode: 1, plan: blockedOwnerWorkbenchSchemaPlan([parsed.issue]) };
  }
  const plan = planOwnerWorkbenchSchema(parsed.value);
  return { exitCode: plan.status === "ready" ? 0 : 1, plan };
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const result = runOwnerWorkbenchSchemaPlannerCli();
  process.stdout.write(`${serializeOwnerWorkbenchSchemaPlan(result.plan)}\n`);
  process.exitCode = result.exitCode;
}
