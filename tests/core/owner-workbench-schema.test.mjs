import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import test from "node:test";

import {
  planOwnerWorkbenchSchema,
  serializeOwnerWorkbenchSchemaPlan,
} from "../../feishu/scripts/plan-owner-workbench-schema.mjs";

const projectRoot = resolve(import.meta.dirname, "../..");
const cliPath = resolve(projectRoot, "feishu/scripts/plan-owner-workbench-schema.mjs");

const TABLES = [
  ["raw_feedback", 25, 33],
  ["cases", 40, 32],
  ["work_orders", 27, 32],
  ["clusters", 26, 13],
  ["improvements", 23, 10],
  ["vehicles", 19, 8],
  ["delivery_tasks", 20, 12],
  ["routing_matrix", 21, 20],
  ["knowledge_index", 19, 5],
  ["ai_audit", 20, 13],
];

const VIEW_KEYS = [
  "feedback_inbox",
  "case_cockpit",
  "sla_board",
  "issue_map",
  "improvement_tracking",
];

export function ownerWorkbenchBaselineReadback() {
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
      ...VIEW_KEYS.map((view_key) => ({ view_key, view_class: "named_business" })),
    ],
    workflows: Array.from({ length: 6 }, (_, index) => ({
      workflow_key: `W${index + 1}`,
      enabled: false,
    })),
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

test("schema planner emits exactly nine additive field operations and no record writes", () => {
  const plan = planOwnerWorkbenchSchema(ownerWorkbenchBaselineReadback());

  assert.equal(plan.status, "ready");
  assert.equal(plan.mode, "plan_only");
  assert.equal(plan.writes_executed, false);
  assert.deepEqual(plan.issue_codes, []);
  assert.deepEqual(plan.observed, {
    table_count: 10,
    field_count: 240,
    view_count: 5,
    physical_view_count: 15,
    record_count: 178,
    workflow_counts: { total: 6, enabled: 0, disabled: 6 },
  });
  assert.equal(plan.operations.length, 9);
  assert.deepEqual(
    plan.operations.map(({ table_ref, field_name }) => [table_ref, field_name]),
    [
      ["logical://tables/raw_feedback", "connector_id"],
      ["logical://tables/raw_feedback", "connector_transport"],
      ["logical://tables/raw_feedback", "source_type"],
      ["logical://tables/raw_feedback", "attachment_manifest"],
      ["logical://tables/ai_audit", "object_type"],
      ["logical://tables/ai_audit", "object_id"],
      ["logical://tables/ai_audit", "review_action"],
      ["logical://tables/ai_audit", "reviewed_by"],
      ["logical://tables/ai_audit", "reviewed_at"],
    ],
  );
  assert.ok(plan.operations.every((operation) => operation.kind === "create_field"));
  assert.ok(plan.operations.every((operation) => operation.backfill === "none"));
  assert.deepEqual(plan.record_mutations, []);
  assert.deepEqual(plan.expected_post_state, {
    table_count: 10,
    field_count: 249,
    view_count: 5,
    view_count_semantics: "named_business_views_only",
    physical_view_count: 15,
    record_count: 178,
    workflow_counts: { total: 6, enabled: 0, disabled: 6 },
    existing_records_unchanged: true,
  });
  assert.equal(plan.rollback.strategy, "retain_additive_fields");
});

test("schema planner fails closed on drift or a pre-existing target field", async (t) => {
  const fixtures = [
    ["table count", (readback) => readback.tables.pop(), "baseline_table_count_mismatch"],
    ["field count", (readback) => readback.tables[0].field_names.pop(), "baseline_field_count_mismatch"],
    ["view count", (readback) => readback.views.pop(), "baseline_view_count_mismatch"],
    ["record count", (readback) => { readback.tables[0].record_count += 1; }, "baseline_record_count_mismatch"],
    ["workflow state", (readback) => { readback.workflows[1].enabled = true; }, "baseline_workflow_state_mismatch"],
    ["field already exists", (readback) => {
      readback.tables[0].field_names[0] = "connector_id";
    }, "target_field_already_exists"],
  ];

  for (const [name, mutate, expectedIssue] of fixtures) {
    await t.test(name, () => {
      const readback = ownerWorkbenchBaselineReadback();
      mutate(readback);
      const plan = planOwnerWorkbenchSchema(readback);
      assert.equal(plan.status, "blocked");
      assert.equal(plan.writes_executed, false);
      assert.ok(plan.issue_codes.includes(expectedIssue), plan.issue_codes.join(","));
      assert.deepEqual(plan.operations, []);
      assert.deepEqual(plan.record_mutations, []);
      assert.equal(plan.expected_post_state, null);
    });
  }
});

test("schema planner never echoes unknown or sensitive readback values", () => {
  const readback = ownerWorkbenchBaselineReadback();
  readback.credentials = {
    access_token: "SYN-SENSITIVE-ACCESS-MATERIAL",
    base_resource_id: "SYN-SENSITIVE-RESOURCE-MATERIAL",
    endpoint: "https://sensitive.invalid/write",
  };

  const serialized = serializeOwnerWorkbenchSchemaPlan(planOwnerWorkbenchSchema(readback));

  assert.equal(serialized.includes("SYN-SENSITIVE"), false);
  assert.equal(serialized.includes("sensitive.invalid"), false);
  assert.equal(serialized.includes("access_token"), false);
  assert.equal(serialized.includes("base_resource_id"), false);

  const readyPlan = planOwnerWorkbenchSchema(ownerWorkbenchBaselineReadback());
  readyPlan.observed.unsafe_note = "SYN-SENSITIVE-SERIALIZER-MATERIAL";
  readyPlan.operations[0].unsafe_note = "SYN-SENSITIVE-SERIALIZER-MATERIAL";
  const projected = serializeOwnerWorkbenchSchemaPlan(readyPlan);
  assert.equal(projected.includes("SYN-SENSITIVE-SERIALIZER-MATERIAL"), false);
  assert.equal(projected.includes("unsafe_note"), false);
});

test("schema CLI is stdin-only, compact, deterministic, and rejects execution flags", () => {
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

  const forbidden = spawnSync(process.execPath, [cliPath, "--apply"], {
    cwd: projectRoot,
    input,
    encoding: "utf8",
  });
  assert.equal(forbidden.status, 1);
  assert.equal(forbidden.stderr, "");
  assert.deepEqual(JSON.parse(forbidden.stdout).issue_codes, ["execution_flag_forbidden"]);
  assert.deepEqual(JSON.parse(forbidden.stdout).operations, []);
});
