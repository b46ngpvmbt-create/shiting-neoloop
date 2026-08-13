#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  inspectOwnerWorkbenchReadback,
  loadOwnerWorkbenchContract,
} from "./plan-owner-workbench-schema.mjs";

const MAX_INPUT_BYTES = 1024 * 1024;
const EXACT_14_KEYS = [
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
];
const ATTEMPT_REQUEST_KEYS = [
  "contract",
  "operation",
  "record_id",
  "profile_id",
  "node",
  "attempt",
  "candidate",
];
const ATTEMPT_RESPONSE_KEYS = [
  "contract",
  "operation",
  "record_id",
  "profile_id",
  "node",
  "object_ref",
  "attempt",
  "route",
  "classification",
  "continue",
  "retry",
  "repair_errors",
  "envelope",
  "envelope_json",
  "hard_rule_result_json",
  "business_write_count",
  "audit_write_count",
];
const REPAIR_ERROR_CODES = [
  "candidate_validation_failed",
  "candidate_injection_boundary_violation",
  "exact_14_invalid",
  "internal_validation_error",
];
const NODE_PROFILES = {
  N1: "n1-default",
  N2: "n2-default",
  N3: "n3-default",
};
const SUPPORTED_STEP_TYPES = new Set([
  "AddRecordTrigger",
  "GenerateAiTextAction",
  "HTTPClientAction",
  "IfElseBranch",
  "SwitchBranch",
  "Delay",
]);

function isObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function uniqueSorted(values) {
  return [...new Set(values)].sort();
}

function sameJson(actual, expected) {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

function w2WireDefinitionIsFrozen(definition) {
  const action = definition?.validator_action;
  return (
    isObject(action) &&
    action.type === "HTTPClientAction" &&
    action.origin_placeholder === "{{OWNER_ANALYSIS_API_ORIGIN}}" &&
    action.authorization_placeholder === "{{OWNER_ANALYSIS_AUTHORIZATION}}" &&
    action.method === "POST" &&
    action.body_type === "raw" &&
    action.content_type === "application/json" &&
    action.request_contract === "neoloop.w2-analysis-attempt.v1" &&
    sameJson(action.request_exact_top_level_keys, ATTEMPT_REQUEST_KEYS) &&
    action.candidate_transport === "nested_exact_5_json_object" &&
    action.response_contract === "neoloop.w2-analysis-attempt-result.v1" &&
    sameJson(action.response_exact_top_level_keys, ATTEMPT_RESPONSE_KEYS) &&
    sameJson(action.route_enum, ["continue", "retry", "stop"]) &&
    sameJson(action.repair_error_codes, REPAIR_ERROR_CODES) &&
    action.syntax_invalid_transport_behavior === "feishu_http_step_fails_closed_before_gateway"
  );
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

function inspectConfiguredW2Readback(readback, contract) {
  const issues = [];
  const observed = projectObserved({
    table_count: Array.isArray(readback?.tables) ? readback.tables.length : -1,
    field_count: Array.isArray(readback?.tables)
      ? readback.tables.reduce((sum, table) => sum + (Array.isArray(table?.field_names) ? table.field_names.length : 0), 0)
      : -1,
    view_count: Array.isArray(readback?.views)
      ? readback.views.filter((view) => view?.view_class === "named_business").length
      : -1,
    physical_view_count: Array.isArray(readback?.views) ? readback.views.length : -1,
    record_count: Array.isArray(readback?.tables)
      ? readback.tables.reduce((sum, table) => sum + (Number.isInteger(table?.record_count) ? table.record_count : 0), 0)
      : -1,
    workflow_counts: {
      total: Array.isArray(readback?.workflows) ? readback.workflows.length : -1,
      enabled: Array.isArray(readback?.workflows) ? readback.workflows.filter((workflow) => workflow?.enabled === true).length : -1,
      disabled: Array.isArray(readback?.workflows) ? readback.workflows.filter((workflow) => workflow?.enabled === false).length : -1,
    },
  });
  const expected = contract.schema_migration.expected_post_state;
  if (!isObject(readback) || readback.contract !== contract.readback_contract.contract || readback.redacted !== true) {
    issues.push("configured_readback_shape_invalid");
  }
  if (!observed || observed.table_count !== expected.table_count || observed.field_count !== expected.field_count
    || observed.view_count !== expected.view_count || observed.physical_view_count !== expected.physical_view_count
    || observed.workflow_counts.total !== 6 || observed.workflow_counts.enabled !== 0 || observed.workflow_counts.disabled !== 6) {
    issues.push("configured_state_mismatch");
  }
  const tables = Array.isArray(readback?.tables) ? readback.tables : [];
  const byKey = new Map(tables.map((table) => [table?.table_key, table]));
  const additionsByTable = new Map();
  for (const addition of contract.schema_migration.field_additions) {
    const names = additionsByTable.get(addition.table_key) ?? [];
    names.push(addition.field_name);
    additionsByTable.set(addition.table_key, names);
  }
  for (const baselineTable of contract.baseline.tables) {
    const table = byKey.get(baselineTable.table_key);
    const expectedFields = baselineTable.field_count + (additionsByTable.get(baselineTable.table_key)?.length ?? 0);
    if (!table || !Array.isArray(table.field_names) || table.field_names.length !== expectedFields) {
      issues.push("configured_table_field_count_mismatch");
      continue;
    }
    if ((additionsByTable.get(baselineTable.table_key) ?? []).some((fieldName) => !table.field_names.includes(fieldName))) {
      issues.push("configured_field_missing");
    }
    const mayGrow = ["raw_feedback", "ai_audit"].includes(baselineTable.table_key);
    if (!Number.isInteger(table.record_count) || (mayGrow
      ? table.record_count < baselineTable.record_count
      : table.record_count !== baselineTable.record_count)) {
      issues.push("configured_record_count_mismatch");
    }
  }
  const businessViews = (Array.isArray(readback?.views) ? readback.views : [])
    .filter((view) => view?.view_class === "named_business").map((view) => view.view_key);
  const defaultViews = (Array.isArray(readback?.views) ? readback.views : [])
    .filter((view) => view?.view_class === "default_table").map((view) => view.view_key);
  if (!sameJson(uniqueSorted(businessViews), uniqueSorted(contract.baseline.view_keys))
    || !sameJson(uniqueSorted(defaultViews), uniqueSorted(contract.baseline.default_view_keys))) {
    issues.push("configured_view_set_mismatch");
  }
  const workflowKeys = (Array.isArray(readback?.workflows) ? readback.workflows : []).map((workflow) => workflow?.workflow_key);
  if (!sameJson(uniqueSorted(workflowKeys), uniqueSorted(contract.baseline.workflow_keys))) {
    issues.push("configured_workflow_set_mismatch");
  }
  if (!sameJson(readback?.w2_readback, contract.baseline.w2_readback)) {
    issues.push("configured_w2_readback_mismatch");
  }
  const issueCodes = uniqueSorted(issues);
  return { valid: issueCodes.length === 0, issue_codes: issueCodes, observed };
}

export function evaluateOwnerW2ValidatorRoute(response, expected) {
  const stopped = {
    route: "stop",
    classification: "invalid_validator_response",
    downstream_ai_allowed: false,
    business_writes: [],
  };
  const context = Number.isInteger(expected) ? { attempt: expected } : expected;
  if (!isObject(response) || !isObject(context) || ![1, 2].includes(context.attempt)) return stopped;
  if (!sameJson(Object.keys(response), ATTEMPT_RESPONSE_KEYS)) return stopped;
  if (
    response.contract !== "neoloop.w2-analysis-attempt-result.v1" ||
    response.operation !== "validate_candidate" ||
    response.attempt !== context.attempt ||
    typeof response.record_id !== "string" ||
    !/^[A-Za-z0-9_-]{3,128}$/u.test(response.record_id) ||
    !Object.hasOwn(NODE_PROFILES, response.node) ||
    response.profile_id !== NODE_PROFILES[response.node] ||
    (context.record_id !== undefined && response.record_id !== context.record_id) ||
    (context.profile_id !== undefined && response.profile_id !== context.profile_id) ||
    (context.node !== undefined && response.node !== context.node) ||
    !isObject(response.object_ref) ||
    response.object_ref.object_type !== "raw_feedback" ||
    typeof response.object_ref.object_id !== "string" ||
    response.object_ref.object_id.length === 0 ||
    response.business_write_count !== 0 ||
    response.audit_write_count !== 1 ||
    !Array.isArray(response.repair_errors) ||
    !response.repair_errors.every((code) => REPAIR_ERROR_CODES.includes(code)) ||
    new Set(response.repair_errors).size !== response.repair_errors.length
  ) return stopped;
  const continueEnvelopeValid = (() => {
    if (!isObject(response.envelope) || typeof response.envelope_json !== "string") return false;
    if (!sameJson(Object.keys(response.envelope), EXACT_14_KEYS)) return false;
    if (
      response.envelope.node !== response.node ||
      !sameJson(response.envelope.object_ref, response.object_ref) ||
      response.envelope.retry_count !== response.attempt - 1
    ) return false;
    try {
      return sameJson(JSON.parse(response.envelope_json), response.envelope);
    } catch {
      return false;
    }
  })();
  const hardRuleValid = response.node === "N2"
    ? typeof response.hard_rule_result_json === "string"
    : response.hard_rule_result_json === null;
  if (response.route === "continue" && response.continue === true && response.retry === false) {
    if (
      response.classification !== "exact_14_ready" ||
      response.repair_errors.length !== 0 ||
      !continueEnvelopeValid ||
      !hardRuleValid
    ) return stopped;
    if (response.node === "N2") {
      try {
        if (!isObject(JSON.parse(response.hard_rule_result_json))) return stopped;
      } catch {
        return stopped;
      }
    }
    return {
      route: "continue",
      classification: "validated",
      downstream_ai_allowed: true,
      business_writes: [],
    };
  }
  if (
    response.route === "retry" &&
    response.classification === "repair_required" &&
    response.continue === false &&
    response.retry === true &&
    context.attempt === 1 &&
    response.repair_errors.length > 0 &&
    response.envelope === null &&
    response.envelope_json === null &&
    response.hard_rule_result_json === null
  ) {
    return {
      route: "retry",
      classification: "single_repair_allowed",
      downstream_ai_allowed: true,
      business_writes: [],
    };
  }
  if (
    response.route === "stop" &&
    response.classification === "needs_human" &&
    response.continue === false &&
    response.retry === false &&
    response.repair_errors.length > 0 &&
    response.envelope === null &&
    response.envelope_json === null &&
    response.hard_rule_result_json === null
  ) {
    return {
      route: "stop",
      classification: "needs_human",
      downstream_ai_allowed: false,
      business_writes: [],
    };
  }
  return stopped;
}

function text(value) {
  return { value_type: "text", value };
}

function ref(value) {
  return { value_type: "ref", value };
}

function httpData(definition, profileId, rawBody, responseExample) {
  return {
    method: definition.validator_action.method,
    url: [text(definition.validator_action.origin_placeholder), text(`/api/v1/analysis/${profileId}`)],
    queries: [],
    headers: [
      {
        key: "Authorization",
        value: [text(definition.validator_action.authorization_placeholder)],
      },
      {
        key: "Content-Type",
        value: [text("application/json")],
      },
    ],
    body_type: definition.validator_action.body_type,
    raw_body: rawBody,
    response_type: "json",
    response_value: JSON.stringify(responseExample),
  };
}

function retryStatusCondition(stepId) {
  return {
    conjunction: "or",
    conditions: [
      {
        conjunction: "and",
        conditions: [{
          left_value: ref(`$.${stepId}.status_code`),
          operator: "is",
          right_value: [{ value_type: "number", value: 202 }],
        }],
      },
    ],
  };
}

function makeHttpStep(definition, id, title, next, profileId, rawBody, responseExample) {
  return {
    id,
    type: "HTTPClientAction",
    title,
    next,
    data: httpData(definition, profileId, rawBody, responseExample),
  };
}

function makeGenerateStep(node, attempt, next) {
  const nodeLower = node.toLowerCase();
  const prompt = [text(`{{PROMPT_${node}_EXACT5}}`)];
  if (node === "N1") {
    prompt.push(
      text("\nsource_ref="),
      ref("$.w2_trigger.{{FIELD_feedback_id}}"),
      text("\nchannel="),
      ref("$.w2_trigger.{{FIELD_channel}}"),
      text("\noriginal_text="),
      ref("$.w2_trigger.{{FIELD_original_text}}"),
      text("\nRUNTIME_INPUT_END"),
    );
  } else if (node === "N2") {
    prompt.push(
      text("\noriginal_text="),
      ref("$.w2_trigger.{{FIELD_original_text}}"),
      text("\nRUNTIME_INPUT_END"),
    );
  } else {
    prompt.push(
      text("\noriginal_text="),
      ref("$.w2_trigger.{{FIELD_original_text}}"),
      text("\nRUNTIME_INPUT_END"),
    );
  }
  if (attempt === 2) {
    prompt.push(
      text("\n唯一修复区="),
      ref(`$.w2_${nodeLower}_validate_1.body.repair_errors`),
      text("\n第一次 candidate="),
      ref(`$.w2_${nodeLower}_generate_1`),
    );
  }
  return {
    id: `w2_${nodeLower}_generate_${attempt}`,
    type: "GenerateAiTextAction",
    title: `${node} exact-5 candidate 第${attempt}次`,
    next,
    data: { prompt },
  };
}

function makeAttemptRequestBody(node, attempt) {
  const nodeLower = node.toLowerCase();
  const profileId = NODE_PROFILES[node];
  return [
    text("{\"contract\":\"neoloop.w2-analysis-attempt.v1\",\"operation\":\"validate_candidate\",\"record_id\":\""),
    ref("$.w2_trigger.recordId"),
    text(`\",\"profile_id\":\"${profileId}\",\"node\":\"${node}\",\"attempt\":${attempt},\"candidate\":`),
    ref(`$.w2_${nodeLower}_generate_${attempt}`),
    text("}"),
  ];
}

function makeEnvelopeExample(node, attempt) {
  return {
    node,
    mode: "default",
    version: `${node}-1.0.0-draft.2`,
    run_id: "SYN-RUN-W2-EXAMPLE",
    object_ref: { object_type: "raw_feedback", object_id: "SYN-FEEDBACK-W2-EXAMPLE" },
    input_hash: "0".repeat(64),
    payload: {},
    evidence_spans: [],
    missing_fields: [],
    confidence: 0.9,
    status: "ok",
    validation: { valid: true, errors: [] },
    retry_count: attempt - 1,
    human_revision: null,
  };
}

function makeAttemptResponseExample(node, attempt) {
  const envelope = makeEnvelopeExample(node, attempt);
  return {
    contract: "neoloop.w2-analysis-attempt-result.v1",
    operation: "validate_candidate",
    record_id: "synthetic_record",
    profile_id: NODE_PROFILES[node],
    node,
    object_ref: cloneJson(envelope.object_ref),
    attempt,
    route: "continue",
    classification: "exact_14_ready",
    continue: true,
    retry: false,
    repair_errors: [],
    envelope,
    envelope_json: JSON.stringify(envelope),
    hard_rule_result_json: node === "N2" ? "{}" : null,
    business_write_count: 0,
    audit_write_count: 1,
  };
}

function makeValidateStep(definition, node, attempt, next) {
  const nodeLower = node.toLowerCase();
  return makeHttpStep(
    definition,
    `w2_${nodeLower}_validate_${attempt}`,
    `${node} candidate 校验与审计 第${attempt}次`,
    next,
    NODE_PROFILES[node],
    makeAttemptRequestBody(node, attempt),
    makeAttemptResponseExample(node, attempt),
  );
}

function makeFirstAttemptRoute(node, successTarget) {
  const nodeLower = node.toLowerCase();
  const stepId = `w2_${nodeLower}_validate_1`;
  const retryTarget = `w2_${nodeLower}_generate_2`;
  return {
    id: `w2_${nodeLower}_route_1`,
    type: "IfElseBranch",
    title: `${node} 第一次校验路由`,
    children: {
      links: [
        { kind: "if_true", to: retryTarget, desc: "202 唯一修复" },
        { kind: "if_false", to: successTarget, desc: "200 校验成功" },
      ],
    },
    next: null,
    data: {
      condition: retryStatusCondition(stepId),
    },
  };
}

function makeNodeSteps(definition, node, successTarget) {
  const nodeLower = node.toLowerCase();
  const validate1 = `w2_${nodeLower}_validate_1`;
  const route1 = `w2_${nodeLower}_route_1`;
  const validate2 = `w2_${nodeLower}_validate_2`;
  return [
    makeGenerateStep(node, 1, validate1),
    makeValidateStep(definition, node, 1, route1),
    makeFirstAttemptRoute(node, successTarget),
    makeGenerateStep(node, 2, validate2),
    makeValidateStep(definition, node, 2, successTarget),
  ];
}

function makeTrigger(definition) {
  return {
    id: "w2_trigger",
    type: definition.trigger.type,
    title: "新增合成原始反馈",
    next: "w2_n1_generate_1",
    data: {
      table_name: definition.trigger.table_name,
      watched_field_name: definition.trigger.watched_field_name,
      trigger_control_list: ["pasteUpdate", "automationBatchUpdate", "syncUpdate", "appendImport"],
      condition_list: [
        {
          conjunction: "and",
          conditions: [
            {
              field_name: "data_scope",
              operator: "is",
              value: [text("synthetic_experiment")],
            },
            {
              field_name: "processing_status",
              operator: "is",
              value: [text("待分诊")],
            },
          ],
        },
      ],
    },
  };
}

function buildWorkflowSteps(definition) {
  return [
    makeTrigger(definition),
    ...makeNodeSteps(definition, "N1", "w2_n2_generate_1"),
    ...makeNodeSteps(definition, "N2", "w2_n3_generate_1"),
    ...makeNodeSteps(definition, "N3", "w2_terminal"),
    {
      id: "w2_terminal",
      type: "Delay",
      title: "停止自动业务动作，等待人工审核",
      next: null,
      data: { duration: 1 },
    },
  ];
}

function buildReplacement(contract) {
  const definition = contract.w2_analysis;
  if (!w2WireDefinitionIsFrozen(definition)) {
    return { valid: false, issue_codes: ["owner_workbench_contract_invalid"] };
  }
  return {
    kind: "full_replacement",
    workflow_ref: definition.workflow_ref,
    workflow_update_body: {
      title: definition.name,
      status: definition.replacement_state,
      steps: buildWorkflowSteps(definition),
    },
    translation: {
      state: "requires_explicit_bindings",
      target_command: "lark-cli base +workflow-update",
      update_body_path: "replacement.workflow_update_body",
      real_values_emitted: false,
      required_bindings: cloneJson(definition.required_bindings),
    },
    node_contract: {
      candidate_top_level_keys: cloneJson(definition.candidate_top_level_keys),
      envelope_top_level_keys: cloneJson(EXACT_14_KEYS),
      max_attempts_per_node: 2,
      second_failure: "terminal_branch_to_needs_human",
    },
    http_wire_contract: {
      request: {
        contract: "neoloop.w2-analysis-attempt.v1",
        exact_top_level_keys: cloneJson(ATTEMPT_REQUEST_KEYS),
      },
      response: {
        contract: "neoloop.w2-analysis-attempt-result.v1",
        exact_top_level_keys: cloneJson(ATTEMPT_RESPONSE_KEYS),
        route_enum: ["continue", "retry", "stop"],
        repair_error_codes: cloneJson(REPAIR_ERROR_CODES),
        n2_continue_hard_rule_result_json: "required_json_object_string",
        other_hard_rule_result_json: null,
      },
      candidate_transport: "raw_nested_exact_5_json_object",
      syntax_invalid_transport_behavior: "feishu_http_step_fails_closed_before_gateway",
      claims_gateway_audit_for_syntax_invalid_text: false,
    },
    rollback: cloneJson(definition.rollback),
    write_policy: cloneJson(definition.write_policy),
    forbidden_step_types: cloneJson(definition.forbidden_action_types),
  };
}

function containsExternalMaterial(value) {
  if (Array.isArray(value)) return value.some(containsExternalMaterial);
  if (isObject(value)) return Object.values(value).some(containsExternalMaterial);
  if (typeof value !== "string") return false;
  if (/https?:\/\//iu.test(value) || /\bBearer\s+[A-Za-z0-9._-]+/iu.test(value)) return true;
  if (/\b(?:app|tbl|wkf|vew|rec)_[A-Za-z0-9]{6,}\b/u.test(value)) return true;
  if (/\b(?:cli|tbl|wkf|vew|rec)[A-Za-z0-9]{10,}\b/u.test(value)) return true;
  return false;
}

function refsAreClosed(steps, stepIds) {
  const references = [];
  const visit = (value) => {
    if (Array.isArray(value)) return value.forEach(visit);
    if (isObject(value)) return Object.values(value).forEach(visit);
    if (typeof value !== "string" || !value.startsWith("$.")) return;
    references.push(value.slice(2).split(".", 1)[0]);
  };
  visit(steps);
  return references.every((stepId) => stepIds.has(stepId));
}

export function blockedOwnerW2AnalysisWorkflowCandidate(issueCodes, observed = null) {
  const normalized = uniqueSorted(issueCodes);
  return {
    contract: "neoloop.owner-w2-analysis-workflow-candidate.v1",
    mode: "plan_only",
    writes_executed: false,
    status: "blocked",
    issue_codes: normalized,
    observed: projectObserved(observed),
    replacement: null,
    activation: null,
    validation: { valid: false, issue_codes: normalized },
  };
}

export function validateOwnerW2AnalysisWorkflowCandidate(candidate) {
  const issues = [];
  let contract;
  try {
    contract = loadOwnerWorkbenchContract();
  } catch {
    return { valid: false, issue_codes: ["owner_workbench_contract_invalid"] };
  }
  const definition = contract.w2_analysis;
  if (!isObject(candidate) || candidate.status !== "ready") {
    return { valid: false, issue_codes: ["workflow_candidate_shape_invalid"] };
  }
  if (candidate.mode !== "plan_only" || candidate.writes_executed !== false) {
    issues.push("plan_only_invariant_invalid");
  }

  const replacement = candidate.replacement;
  const body = replacement?.workflow_update_body;
  const steps = body?.steps;
  if (!isObject(replacement) || replacement.kind !== "full_replacement" || !isObject(body) || !Array.isArray(steps)) {
    issues.push("replacement_shape_invalid");
  } else {
    if (!sameJson(Object.keys(body), ["title", "status", "steps"])) issues.push("workflow_update_body_shape_invalid");
    if (body.title !== definition.name) issues.push("workflow_title_invalid");
    if (body.status !== "disabled") issues.push("replacement_must_remain_disabled");

    const stepIds = new Set(steps.map((step) => step?.id).filter((id) => typeof id === "string"));
    if (stepIds.size !== steps.length) issues.push("step_id_invalid");
    if (!refsAreClosed(steps, stepIds)) issues.push("step_reference_invalid");
    for (const step of steps) {
      if (!isObject(step) || typeof step.id !== "string" || typeof step.type !== "string" || !isObject(step.data)) {
        issues.push("step_shape_invalid");
        continue;
      }
      if (!SUPPORTED_STEP_TYPES.has(step.type)) issues.push("unsupported_step_type");
      if (step.next !== null && !stepIds.has(step.next)) issues.push("step_reference_invalid");
      if (step.children?.links?.some((link) => !stepIds.has(link?.to))) issues.push("step_reference_invalid");
      if (["AddRecordTrigger", "GenerateAiTextAction", "HTTPClientAction"].includes(step.type) && "children" in step) {
        issues.push("action_children_forbidden");
      }
      if (["IfElseBranch", "SwitchBranch"].includes(step.type) && !Array.isArray(step.children?.links)) {
        issues.push("branch_children_missing");
      }
      if (step.type === "SwitchBranch" && step.data?.no_match_action !== "fail") {
        issues.push("route_fail_closed_invalid");
      }
    }

    const trigger = steps[0];
    if (
      trigger?.id !== "w2_trigger" ||
      trigger?.type !== "AddRecordTrigger" ||
      trigger?.data?.table_name !== "原始反馈" ||
      trigger?.data?.watched_field_name !== "feedback_id"
    ) {
      issues.push("trigger_invalid");
    }

    const expectedGenerateIds = ["N1", "N2", "N3"].flatMap((node) => [1, 2].map(
      (attempt) => `w2_${node.toLowerCase()}_generate_${attempt}`,
    ));
    const generateSteps = steps.filter((step) => step?.type === "GenerateAiTextAction");
    if (!sameJson(generateSteps.map(({ id }) => id).sort(), [...expectedGenerateIds].sort())) {
      issues.push("attempt_limit_invalid");
    }
    if (generateSteps.some((step) => !Array.isArray(step.data?.prompt) || Object.keys(step.data).length !== 1)) {
      issues.push("generate_ai_text_data_invalid");
    }
    if (steps.some((step) => /^w2_n[123]_generate_[3-9][0-9]*$/u.test(step?.id ?? ""))) {
      issues.push("attempt_limit_invalid");
    }

    const expectedValidateIds = ["N1", "N2", "N3"].flatMap((node) => [1, 2].map(
      (attempt) => `w2_${node.toLowerCase()}_validate_${attempt}`,
    ));
    for (const id of expectedValidateIds) {
      const step = steps.find((entry) => entry?.id === id);
      if (step?.type !== "HTTPClientAction") issues.push("validator_action_invalid");
    }
    const httpSteps = steps.filter((entry) => entry?.type === "HTTPClientAction");
    const validatorSteps = httpSteps.filter((entry) => /^w2_n[123]_validate_[12]$/u.test(entry?.id ?? ""));
    const unexpectedHttpSteps = httpSteps.filter((entry) => !/^w2_n[123]_validate_[12]$/u.test(entry?.id ?? ""));
    if (validatorSteps.length !== expectedValidateIds.length || unexpectedHttpSteps.length !== 0) {
      issues.push("validator_action_invalid");
    }
    for (const step of validatorSteps) {
      const data = step.data;
      const nodeMatch = /^w2_(n[123])_validate_([12])$/u.exec(step.id);
      const profileId = nodeMatch ? `${nodeMatch[1]}-default` : null;
      if (
        profileId === null ||
        data?.method !== "POST" ||
        !sameJson(data?.url, [
          text(definition.validator_action.origin_placeholder),
          text(`/api/v1/analysis/${profileId}`),
        ]) ||
        data?.body_type !== "raw" ||
        !Array.isArray(data?.raw_body) ||
        "form_body" in data ||
        data?.response_type !== "json" ||
        typeof data?.response_value !== "string"
      ) {
        issues.push("http_client_data_invalid");
      } else {
        try {
          const responseExample = JSON.parse(data.response_value);
          if (!sameJson(Object.keys(responseExample), ATTEMPT_RESPONSE_KEYS)) {
            issues.push("http_response_contract_invalid");
          }
        } catch {
          issues.push("http_response_contract_invalid");
        }
      }
    }
    const routeSteps = steps.filter((entry) => /^w2_n[123]_route_1$/u.test(entry?.id ?? ""));
    if (routeSteps.length !== 3 || routeSteps.some((step) => {
      const node = /^w2_(n[123])_route_1$/u.exec(step.id)?.[1];
      const successTarget = node === "n1" ? "w2_n2_generate_1" : node === "n2" ? "w2_n3_generate_1" : "w2_terminal";
      const condition = step.data?.condition?.conditions?.[0]?.conditions?.[0];
      return step.type !== "IfElseBranch"
        || step.children?.links?.length !== 2
        || step.children.links[0]?.kind !== "if_true"
        || step.children.links[0]?.to !== `w2_${node}_generate_2`
        || step.children.links[1]?.kind !== "if_false"
        || step.children.links[1]?.to !== successTarget
        || condition?.left_value?.value !== `$.${step.id.replace("route", "validate")}.status_code`
        || condition?.operator !== "is"
        || !sameJson(condition?.right_value, [{ value_type: "number", value: 202 }]);
    })) issues.push("route_fail_closed_invalid");
    const terminal = steps.find((step) => step?.id === "w2_terminal");
    if (terminal?.type !== "Delay" || terminal?.next !== null || !sameJson(terminal?.data, { duration: 1 })) {
      issues.push("terminal_stop_invalid");
    }

    const forbiddenTypes = new Set(definition.forbidden_action_types);
    if (steps.some((step) => forbiddenTypes.has(step?.type))) issues.push("forbidden_action_type");
    if (!sameJson(replacement.write_policy, definition.write_policy)) issues.push("write_policy_invalid");
    if (!sameJson(replacement.node_contract?.candidate_top_level_keys, definition.candidate_top_level_keys)) {
      issues.push("exact_5_contract_invalid");
    }
    if (!sameJson(replacement.node_contract?.envelope_top_level_keys, EXACT_14_KEYS)) {
      issues.push("exact_14_contract_invalid");
    }
    if (replacement.node_contract?.max_attempts_per_node !== 2) issues.push("attempt_limit_invalid");
    if (!sameJson(replacement.http_wire_contract, buildReplacement(contract).http_wire_contract)) {
      issues.push("http_wire_contract_invalid");
    }
    if (replacement.translation?.state !== "requires_explicit_bindings" || replacement.translation?.real_values_emitted !== false) {
      issues.push("translation_contract_invalid");
    }
    if (!sameJson(replacement.translation?.required_bindings, definition.required_bindings)) {
      issues.push("binding_contract_invalid");
    }
    if (!sameJson(replacement.rollback, definition.rollback)) issues.push("rollback_contract_invalid");

    const canonicalReplacement = buildReplacement(contract);
    if (!sameJson(replacement, canonicalReplacement)) issues.push("workflow_body_drift");
  }

  if (!sameJson(candidate.activation, definition.activation)) issues.push("activation_plan_invalid");
  if (containsExternalMaterial(candidate)) issues.push("external_material_forbidden");
  const issueCodes = uniqueSorted(issues);
  return { valid: issueCodes.length === 0, issue_codes: issueCodes };
}

export function buildOwnerW2AnalysisWorkflow(readback) {
  let contract;
  try {
    contract = loadOwnerWorkbenchContract();
  } catch {
    return blockedOwnerW2AnalysisWorkflowCandidate(["owner_workbench_contract_invalid"]);
  }
  if (!w2WireDefinitionIsFrozen(contract.w2_analysis)) {
    return blockedOwnerW2AnalysisWorkflowCandidate(["owner_workbench_contract_invalid"]);
  }
  const baselineInspection = inspectOwnerWorkbenchReadback(readback, contract);
  const configuredInspection = baselineInspection.valid
    ? null
    : inspectConfiguredW2Readback(readback, contract);
  const inspection = baselineInspection.valid
    ? baselineInspection
    : configuredInspection.valid
      ? configuredInspection
      : {
          valid: false,
          issue_codes: uniqueSorted([
            ...baselineInspection.issue_codes,
            ...configuredInspection.issue_codes,
          ]),
          observed: configuredInspection.observed,
        };
  if (!inspection.valid) {
    return blockedOwnerW2AnalysisWorkflowCandidate(inspection.issue_codes, inspection.observed);
  }
  const candidate = {
    contract: "neoloop.owner-w2-analysis-workflow-candidate.v1",
    mode: "plan_only",
    writes_executed: false,
    status: "ready",
    issue_codes: [],
    observed: inspection.observed,
    replacement: buildReplacement(contract),
    activation: cloneJson(contract.w2_analysis.activation),
    validation: null,
  };
  candidate.validation = validateOwnerW2AnalysisWorkflowCandidate(candidate);
  if (!candidate.validation.valid) {
    return blockedOwnerW2AnalysisWorkflowCandidate(candidate.validation.issue_codes, inspection.observed);
  }
  return candidate;
}

function projectCandidate(candidate) {
  if (!isObject(candidate) || candidate.status !== "ready") {
    return blockedOwnerW2AnalysisWorkflowCandidate(
      Array.isArray(candidate?.issue_codes)
        ? candidate.issue_codes.filter((code) => typeof code === "string")
        : ["workflow_candidate_shape_invalid"],
      projectObserved(candidate?.observed),
    );
  }
  const validation = validateOwnerW2AnalysisWorkflowCandidate(candidate);
  if (!validation.valid) {
    return blockedOwnerW2AnalysisWorkflowCandidate(
      validation.issue_codes,
      projectObserved(candidate.observed),
    );
  }
  return {
    contract: "neoloop.owner-w2-analysis-workflow-candidate.v1",
    mode: "plan_only",
    writes_executed: false,
    status: "ready",
    issue_codes: [],
    observed: projectObserved(candidate.observed),
    replacement: cloneJson(candidate.replacement),
    activation: cloneJson(candidate.activation),
    validation,
  };
}

export function serializeOwnerW2AnalysisWorkflowCandidate(candidate) {
  return JSON.stringify(projectCandidate(candidate));
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

export function runOwnerW2AnalysisWorkflowBuilderCli(args = process.argv.slice(2)) {
  if (args.length > 0) {
    return { exitCode: 1, candidate: blockedOwnerW2AnalysisWorkflowCandidate(["execution_flag_forbidden"]) };
  }
  const parsed = parseStdin();
  if (!parsed.ok) {
    return { exitCode: 1, candidate: blockedOwnerW2AnalysisWorkflowCandidate([parsed.issue]) };
  }
  const candidate = buildOwnerW2AnalysisWorkflow(parsed.value);
  return { exitCode: candidate.status === "ready" ? 0 : 1, candidate };
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const result = runOwnerW2AnalysisWorkflowBuilderCli();
  process.stdout.write(`${serializeOwnerW2AnalysisWorkflowCandidate(result.candidate)}\n`);
  process.exitCode = result.exitCode;
}
