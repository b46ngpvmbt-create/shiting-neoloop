import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import {
  buildOwnerW2AnalysisWorkflow,
  evaluateOwnerW2ValidatorRoute,
  serializeOwnerW2AnalysisWorkflowCandidate,
  validateOwnerW2AnalysisWorkflowCandidate,
} from "../../feishu/scripts/build-owner-w2-analysis-workflow.mjs";

const projectRoot = resolve(import.meta.dirname, "../..");
const cliPath = resolve(projectRoot, "feishu/scripts/build-owner-w2-analysis-workflow.mjs");
const runtimeN1PromptPath = resolve(projectRoot, "feishu/prompts/n1-owner-w2-runtime-exact-5.txt");
const REQUEST_KEYS = ["contract", "operation", "record_id", "profile_id", "node", "attempt", "candidate"];
const RESPONSE_KEYS = [
  "contract", "operation", "record_id", "profile_id", "node", "object_ref", "attempt", "route",
  "classification", "continue", "retry", "repair_errors", "envelope", "envelope_json",
  "hard_rule_result_json", "business_write_count", "audit_write_count",
];

const TABLES = [
  ["raw_feedback", 25, 33], ["cases", 40, 32], ["work_orders", 27, 32],
  ["clusters", 26, 13], ["improvements", 23, 10], ["vehicles", 19, 8],
  ["delivery_tasks", 20, 12], ["routing_matrix", 21, 20], ["knowledge_index", 19, 5],
  ["ai_audit", 20, 13],
];

function ownerWorkbenchBaselineReadback() {
  return {
    contract: "neoloop.owner-workbench.readback.v1",
    redacted: true,
    tables: TABLES.map(([table_key, fieldCount, record_count]) => ({
      table_key,
      field_names: Array.from({ length: fieldCount }, (_, index) => `existing_${table_key}_${index + 1}`),
      record_count,
    })),
    views: [
      ...TABLES.map(([table_key]) => ({ view_key: `default_${table_key}`, view_class: "default_table" })),
      ...["feedback_inbox", "case_cockpit", "sla_board", "issue_map", "improvement_tracking"]
        .map((view_key) => ({ view_key, view_class: "named_business" })),
    ],
    workflows: Array.from({ length: 6 }, (_, index) => ({ workflow_key: `W${index + 1}`, enabled: false })),
    w2_readback: {
      workflow_key: "W2",
      title: "W2 风险分诊",
      status: "disabled",
      step_types: [
        "ChangeRecordTrigger",
        "GenerateAiTextAction",
        "GenerateAiTextAction",
        "GenerateAiTextAction",
      ],
    },
  };
}

function validExact5() {
  return {
    payload: {},
    evidence_spans: [],
    missing_fields: [],
    confidence: 0.9,
    status: "ok",
  };
}

function materializeRawBody(rawBody, refs) {
  return rawBody.map((part) => (
    part.value_type === "text" ? part.value : refs[part.value]
  )).join("");
}

function validatorResponse(overrides = {}) {
  const envelope = {
    node: "N1",
    mode: "default",
    version: "N1-1.0.0-draft.2",
    run_id: "SYN-RUN-WIRE-001",
    object_ref: { object_type: "raw_feedback", object_id: "SYN-FEEDBACK-WIRE-001" },
    input_hash: "0".repeat(64),
    payload: {},
    evidence_spans: [],
    missing_fields: [],
    confidence: 0.9,
    status: "ok",
    validation: { valid: true, errors: [] },
    retry_count: 0,
    human_revision: null,
  };
  const response = {
    contract: "neoloop.w2-analysis-attempt-result.v1",
    operation: "validate_candidate",
    record_id: "rec-synthetic-001",
    profile_id: "n1-default",
    node: "N1",
    object_ref: { object_type: "raw_feedback", object_id: "SYN-FEEDBACK-WIRE-001" },
    attempt: 1,
    route: "continue",
    classification: "exact_14_ready",
    continue: true,
    retry: false,
    repair_errors: [],
    envelope,
    envelope_json: JSON.stringify(envelope),
    hard_rule_result_json: null,
    business_write_count: 0,
    audit_write_count: 1,
  };
  return { ...response, ...overrides };
}

test("W2 builder emits a disabled, analysis-only full replacement with three exact-5 node pipelines", () => {
  const candidate = buildOwnerW2AnalysisWorkflow(ownerWorkbenchBaselineReadback());

  assert.equal(candidate.status, "ready");
  assert.equal(candidate.mode, "plan_only");
  assert.equal(candidate.writes_executed, false);
  assert.deepEqual(candidate.issue_codes, []);
  assert.equal(candidate.replacement.kind, "full_replacement");
  assert.equal(candidate.replacement.workflow_ref, "logical://workflows/W2");
  assert.deepEqual(Object.keys(candidate.replacement.workflow_update_body), ["title", "status", "steps"]);
  assert.equal(candidate.replacement.workflow_update_body.title, "W2 风险分诊");
  assert.equal(candidate.replacement.workflow_update_body.status, "disabled");
  assert.equal(candidate.replacement.translation.state, "requires_explicit_bindings");
  assert.ok(candidate.replacement.translation.required_bindings.some((binding) => (
    binding.placeholder === "{{CURRENT_W2_WORKFLOW_ID}}" &&
    binding.kind === "existing_workflow_resource" &&
    binding.preserve_existing === true
  )));
  assert.deepEqual(candidate.replacement.rollback, {
    source: "current_w2_readback",
    workflow_resource_binding: "{{CURRENT_W2_WORKFLOW_ID}}",
    title: "W2 风险分诊",
    status: "disabled",
    step_types: [
      "ChangeRecordTrigger",
      "GenerateAiTextAction",
      "GenerateAiTextAction",
      "GenerateAiTextAction",
    ],
    restore_full_definition_required: true,
    execute: false,
  });

  const steps = candidate.replacement.workflow_update_body.steps;
  const stepIds = new Set(steps.map(({ id }) => id));
  assert.equal(stepIds.size, steps.length);
  assert.equal(steps[0].type, "AddRecordTrigger");
  assert.equal(steps[0].data.table_name, "原始反馈");
  assert.equal(steps[0].data.watched_field_name, "feedback_id");
  assert.equal(steps.filter(({ type }) => type === "GenerateAiTextAction").length, 6);
  assert.equal(steps.filter(({ type }) => type === "HTTPClientAction").length, 6);
  assert.equal(steps.filter(({ type }) => type === "Delay").length, 1);
  assert.equal(steps.some(({ type }) => type === "StopAction"), false);
  assert.ok(steps.every(({ next }) => next === null || stepIds.has(next)));
  for (const step of steps.filter(({ children }) => children)) {
    assert.ok(step.children.links.every(({ to }) => stepIds.has(to)));
  }

  for (const node of ["n1", "n2", "n3"]) {
    const generated = steps.filter(({ id }) => id === `w2_${node}_generate_1` || id === `w2_${node}_generate_2`);
    const validated = steps.filter(({ id }) => id === `w2_${node}_validate_1` || id === `w2_${node}_validate_2`);
    assert.deepEqual(generated.map(({ type }) => type), ["GenerateAiTextAction", "GenerateAiTextAction"]);
    assert.deepEqual(validated.map(({ type }) => type), ["HTTPClientAction", "HTTPClientAction"]);
    assert.ok(generated.every(({ data }) => Object.keys(data).length === 1 && Array.isArray(data.prompt)));
    assert.ok(validated.every(({ data }) => (
      data.method === "POST" &&
      data.body_type === "raw" &&
      data.response_type === "json" &&
      Array.isArray(data.url) &&
      Array.isArray(data.raw_body) &&
      !("form_body" in data)
    )));
  }

  assert.ok(steps.filter(({ type }) => type === "SwitchBranch").every(({ data }) => (
    data.no_match_action === "fail"
  )));
  for (const branch of steps.filter(({ type }) => type === "SwitchBranch")) {
    for (const item of branch.data.child_branch_list) {
      const checks = item.condition.conditions[0].conditions;
      assert.equal(checks.length, 6);
      assert.deepEqual(checks.map(({ left_value }) => left_value.value.split(".").at(-1)), [
        "route", "classification", "continue", "retry", "business_write_count", "audit_write_count",
      ]);
    }
  }
  assert.deepEqual(candidate.replacement.write_policy, {
    feishu_native_business_writes: [],
    worker_allowed_tables: ["AI 审计"],
    worker_forbidden_tables: ["原始反馈", "反馈案件", "处置工单", "问题簇", "改进项目"],
    messages_or_notifications: false,
  });

  const types = steps.map(({ type }) => type);
  for (const forbidden of ["AddRecordAction", "SetRecordAction", "LarkMessageAction", "NotificationAction"]) {
    assert.equal(types.includes(forbidden), false, forbidden);
  }
  assert.deepEqual(validateOwnerW2AnalysisWorkflowCandidate(candidate), { valid: true, issue_codes: [] });
});

test("W2 HTTP steps implement the frozen JSON attempt wire contract without form fallback", () => {
  const candidate = buildOwnerW2AnalysisWorkflow(ownerWorkbenchBaselineReadback());
  const steps = candidate.replacement.workflow_update_body.steps;
  const exact5 = validExact5();

  for (const node of ["n1", "n2", "n3"]) {
    for (const attempt of [1, 2]) {
      const step = steps.find(({ id }) => id === `w2_${node}_validate_${attempt}`);
      const profile = `${node}-default`;
      const request = JSON.parse(materializeRawBody(step.data.raw_body, {
        "$.w2_trigger.recordId": "rec-synthetic-001",
        [`$.w2_${node}_generate_${attempt}`]: JSON.stringify(exact5),
      }));
      assert.deepEqual(Object.keys(request), REQUEST_KEYS);
      assert.equal(request.contract, "neoloop.w2-analysis-attempt.v1");
      assert.equal(request.operation, "validate_candidate");
      assert.equal(request.record_id, "rec-synthetic-001");
      assert.equal(request.profile_id, profile);
      assert.equal(request.node, node.toUpperCase());
      assert.equal(request.attempt, attempt);
      assert.deepEqual(request.candidate, exact5);
      assert.deepEqual(Object.keys(request.candidate), [
        "payload", "evidence_spans", "missing_fields", "confidence", "status",
      ]);
      assert.deepEqual(step.data.headers, [
        { key: "Authorization", value: [{ value_type: "text", value: "{{OWNER_ANALYSIS_AUTHORIZATION}}" }] },
        { key: "Content-Type", value: [{ value_type: "text", value: "application/json" }] },
      ]);
      assert.deepEqual(step.data.url, [
        { value_type: "text", value: "{{OWNER_ANALYSIS_API_ORIGIN}}" },
        { value_type: "text", value: `/api/v1/analysis/${profile}` },
      ]);

      const responseExample = JSON.parse(step.data.response_value);
      assert.deepEqual(Object.keys(responseExample), RESPONSE_KEYS);
      assert.equal(responseExample.contract, "neoloop.w2-analysis-attempt-result.v1");
      assert.equal(responseExample.operation, "validate_candidate");
      assert.equal(responseExample.business_write_count, 0);
      assert.equal(responseExample.audit_write_count, 1);
      assert.equal(
        responseExample.hard_rule_result_json,
        node === "n2" ? "{}" : null,
      );
    }
  }

  assert.deepEqual(candidate.replacement.http_wire_contract.request.exact_top_level_keys, REQUEST_KEYS);
  assert.deepEqual(candidate.replacement.http_wire_contract.response.exact_top_level_keys, RESPONSE_KEYS);
  assert.deepEqual(candidate.replacement.http_wire_contract.response.route_enum, ["continue", "retry", "stop"]);
  assert.equal(candidate.replacement.http_wire_contract.candidate_transport, "raw_nested_exact_5_json_object");
  assert.equal(candidate.replacement.http_wire_contract.syntax_invalid_transport_behavior, "feishu_http_step_fails_closed_before_gateway");
  assert.equal(candidate.replacement.http_wire_contract.claims_gateway_audit_for_syntax_invalid_text, false);
  assert.equal(steps.some(({ id }) => /resolve|hard_rule|finalize|eligibility/u.test(id)), false);

  const malformedBody = materializeRawBody(
    steps.find(({ id }) => id === "w2_n1_validate_1").data.raw_body,
    {
      "$.w2_trigger.recordId": "rec-synthetic-001",
      "$.w2_n1_generate_1": "not-json",
    },
  );
  assert.throws(() => JSON.parse(malformedBody), SyntaxError);
});

test("W2 N1 prompt is dynamic and contains no frozen fixture identity or body", () => {
  const prompt = readFileSync(runtimeN1PromptPath, "utf8");
  assert.match(prompt, /RUNTIME_INPUT_START/u);
  assert.match(prompt, /source_ref/u);
  assert.match(prompt, /channel/u);
  assert.match(prompt, /original_text/u);
  assert.match(prompt, /payload[\s\S]*evidence_spans[\s\S]*missing_fields[\s\S]*confidence[\s\S]*status/u);
  assert.equal(prompt.includes("SYN-FEEDBACK-029"), false);
  assert.equal(prompt.includes("DEMO-X3-205"), false);
  assert.equal(prompt.includes("昨天的历史视频一直没有通过站点Wi-Fi回传"), false);

  const candidate = buildOwnerW2AnalysisWorkflow(ownerWorkbenchBaselineReadback());
  const n1Prompt = candidate.replacement.workflow_update_body.steps
    .find(({ id }) => id === "w2_n1_generate_1")
    .data.prompt;
  assert.ok(n1Prompt.some((item) => item.value_type === "ref" && item.value === "$.w2_trigger.recordId"));
  assert.ok(n1Prompt.some((item) => item.value_type === "ref" && item.value === "$.w2_trigger.{{FIELD_channel}}"));
  assert.ok(n1Prompt.some((item) => item.value_type === "ref" && item.value === "$.w2_trigger.{{FIELD_original_text}}"));
});

test("W2 activation is represented as a separate non-executing action targeting 6/1/5", () => {
  const candidate = buildOwnerW2AnalysisWorkflow(ownerWorkbenchBaselineReadback());

  assert.deepEqual(candidate.activation, {
    kind: "enable_workflow",
    workflow_ref: "logical://workflows/W2",
    workflow_resource_binding: "{{CURRENT_W2_WORKFLOW_ID}}",
    separate_action: true,
    execute: false,
    required_pre_state: { total: 6, enabled: 0, disabled: 6 },
    expected_post_state: { total: 6, enabled: 1, disabled: 5 },
    rollback: { kind: "disable_workflow", execute: false },
  });
  assert.equal(candidate.replacement.workflow_update_body.status, "disabled");
  assert.equal(candidate.writes_executed, false);
});

test("unexpected or malformed validator routes fail closed before downstream AI or business writes", () => {
  for (const [response, expected] of [
    [validatorResponse({ route: "unexpected", continue: false, retry: false }), { attempt: 1 }],
    [validatorResponse({ route: "retry", classification: "repair_required", continue: false, retry: true, attempt: 2, envelope: null, envelope_json: null }), { attempt: 2 }],
    [validatorResponse({ continue: false }), { attempt: 1 }],
    [validatorResponse({ record_id: "rec-other" }), { attempt: 1, record_id: "rec-synthetic-001" }],
    [validatorResponse({ object_ref: { object_type: "case", object_id: "SYN-FEEDBACK-WIRE-001" } }), { attempt: 1 }],
    [validatorResponse({ repair_errors: ["private model error text"] }), { attempt: 1 }],
    [null, { attempt: 1 }],
    ["continue", { attempt: 1 }],
  ]) {
    assert.deepEqual(evaluateOwnerW2ValidatorRoute(response, expected), {
      route: "stop",
      classification: "invalid_validator_response",
      downstream_ai_allowed: false,
      business_writes: [],
    });
  }

  assert.deepEqual(evaluateOwnerW2ValidatorRoute(validatorResponse(), {
    attempt: 1,
    record_id: "rec-synthetic-001",
    profile_id: "n1-default",
    node: "N1",
  }), {
    route: "continue",
    classification: "validated",
    downstream_ai_allowed: true,
    business_writes: [],
  });

  assert.deepEqual(evaluateOwnerW2ValidatorRoute(validatorResponse({
    route: "retry",
    classification: "repair_required",
    continue: false,
    retry: true,
    repair_errors: ["candidate_validation_failed"],
    envelope: null,
    envelope_json: null,
  }), {
    attempt: 1,
    record_id: "rec-synthetic-001",
    profile_id: "n1-default",
    node: "N1",
  }), {
    route: "retry",
    classification: "single_repair_allowed",
    downstream_ai_allowed: true,
    business_writes: [],
  });

  assert.deepEqual(evaluateOwnerW2ValidatorRoute(validatorResponse({
    attempt: 2,
    route: "stop",
    classification: "needs_human",
    continue: false,
    retry: false,
    repair_errors: ["exact_14_invalid"],
    envelope: null,
    envelope_json: null,
  }), {
    attempt: 2,
    record_id: "rec-synthetic-001",
    profile_id: "n1-default",
    node: "N1",
  }), {
    route: "stop",
    classification: "needs_human",
    downstream_ai_allowed: false,
    business_writes: [],
  });
});

test("W2 candidate validator rejects unsafe mutations, a third attempt, and external material", async (t) => {
  const fixtures = [
    ["native business write", (candidate) => {
      candidate.replacement.workflow_update_body.steps.push({
        id: "w2_forbidden_write",
        type: "AddRecordAction",
        title: "forbidden",
        next: null,
        data: {},
      });
    }, "forbidden_action_type"],
    ["third attempt", (candidate) => {
      candidate.replacement.workflow_update_body.steps.push({
        id: "w2_n1_generate_3",
        type: "GenerateAiTextAction",
        title: "forbidden third attempt",
        next: null,
        data: { prompt: [{ value_type: "text", value: "forbidden" }] },
      });
    }, "attempt_limit_invalid"],
    ["wrong trigger", (candidate) => {
      candidate.replacement.workflow_update_body.steps[0].type = "ChangeRecordTrigger";
    }, "trigger_invalid"],
    ["enabled replacement", (candidate) => {
      candidate.replacement.workflow_update_body.status = "enabled";
    }, "replacement_must_remain_disabled"],
    ["notification", (candidate) => {
      candidate.replacement.workflow_update_body.steps.push({
        id: "w2_forbidden_notification",
        type: "LarkMessageAction",
        title: "forbidden",
        next: null,
        data: {},
      });
    }, "forbidden_action_type"],
    ["external URL", (candidate) => {
      candidate.replacement.workflow_update_body.steps
        .find(({ id }) => id === "w2_n1_validate_1")
        .data.url[0].value = "https://sensitive.invalid";
    }, "external_material_forbidden"],
    ["ambiguous unknown route fallback", (candidate) => {
      candidate.replacement.workflow_update_body.steps
        .find(({ id }) => id === "w2_n1_route_1")
        .data.no_match_action = "classifyToOther";
    }, "route_fail_closed_invalid"],
  ];

  for (const [name, mutate, expectedIssue] of fixtures) {
    await t.test(name, () => {
      const candidate = structuredClone(buildOwnerW2AnalysisWorkflow(ownerWorkbenchBaselineReadback()));
      mutate(candidate);
      const result = validateOwnerW2AnalysisWorkflowCandidate(candidate);
      assert.equal(result.valid, false);
      assert.ok(result.issue_codes.includes(expectedIssue), result.issue_codes.join(","));
    });
  }
});

test("W2 builder blocks on baseline drift and does not echo sensitive readback material", () => {
  const readback = ownerWorkbenchBaselineReadback();
  readback.workflows[1].enabled = true;
  readback.credentials = {
    access_token: "SYN-SENSITIVE-ACCESS-MATERIAL",
    endpoint: "https://sensitive.invalid/write",
  };

  const candidate = buildOwnerW2AnalysisWorkflow(readback);
  const serialized = serializeOwnerW2AnalysisWorkflowCandidate(candidate);

  assert.equal(candidate.status, "blocked");
  assert.deepEqual(candidate.replacement, null);
  assert.deepEqual(candidate.activation, null);
  assert.ok(candidate.issue_codes.includes("baseline_workflow_state_mismatch"));
  assert.equal(serialized.includes("SYN-SENSITIVE"), false);
  assert.equal(serialized.includes("sensitive.invalid"), false);
  assert.equal(serialized.includes("access_token"), false);

  const rollbackDrift = ownerWorkbenchBaselineReadback();
  rollbackDrift.w2_readback.step_types.pop();
  const rollbackBlocked = buildOwnerW2AnalysisWorkflow(rollbackDrift);
  assert.equal(rollbackBlocked.status, "blocked");
  assert.ok(rollbackBlocked.issue_codes.includes("baseline_w2_readback_mismatch"));

  const readyCandidate = buildOwnerW2AnalysisWorkflow(ownerWorkbenchBaselineReadback());
  readyCandidate.observed.unsafe_note = "SYN-SENSITIVE-SERIALIZER-MATERIAL";
  const projected = serializeOwnerW2AnalysisWorkflowCandidate(readyCandidate);
  assert.equal(projected.includes("SYN-SENSITIVE-SERIALIZER-MATERIAL"), false);
  assert.equal(projected.includes("unsafe_note"), false);
});

test("W2 CLI is deterministic, compact, stdin-only, and cannot enable or apply", () => {
  const input = `${JSON.stringify(ownerWorkbenchBaselineReadback())}\n`;
  const first = spawnSync(process.execPath, [cliPath], {
    cwd: projectRoot,
    input,
    encoding: "utf8",
  });
  const second = spawnSync(process.execPath, [cliPath], {
    cwd: projectRoot,
    input,
    encoding: "utf8",
  });

  assert.equal(first.status, 0);
  assert.equal(first.stderr, "");
  assert.equal(first.stdout, second.stdout);
  assert.equal(first.stdout, `${JSON.stringify(JSON.parse(first.stdout))}\n`);
  assert.equal(JSON.parse(first.stdout).status, "ready");
  assert.equal(JSON.parse(first.stdout).activation.execute, false);

  for (const flag of ["--apply", "--enable"]) {
    const forbidden = spawnSync(process.execPath, [cliPath, flag], {
      cwd: projectRoot,
      input,
      encoding: "utf8",
    });
    assert.equal(forbidden.status, 1);
    assert.equal(forbidden.stderr, "");
    assert.deepEqual(JSON.parse(forbidden.stdout).issue_codes, ["execution_flag_forbidden"]);
    assert.equal(JSON.parse(forbidden.stdout).replacement, null);
    assert.equal(JSON.parse(forbidden.stdout).activation, null);
  }
});
