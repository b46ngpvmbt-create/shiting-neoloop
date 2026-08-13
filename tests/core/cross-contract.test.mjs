import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { importBuilt } from "./_runtime.mjs";

const contracts = await importBuilt("src/neoloop/contracts/model.js");

async function readJson(relativePath) {
  return JSON.parse(await readFile(new URL(`../../${relativePath}`, import.meta.url), "utf8"));
}

const [canonicalManifest, logicalManifest] = await Promise.all([
  readJson("data/canonical/manifest.json"),
  readJson("feishu/manifests/neoloop-logical-manifest.v0.1.json"),
]);

function sorted(values) {
  return [...values].sort();
}

function collectStatusMismatch(failures, location, actual, expected) {
  try {
    assert.deepEqual(actual, expected);
  } catch {
    failures.push(
      `${location}\n  expected: ${JSON.stringify(expected)}\n  actual: ${JSON.stringify(actual)}`,
    );
  }
}

test("T1 and T2 expose exactly the ten canonical table keys", () => {
  const expected = [...contracts.CANONICAL_TABLE_KEYS];
  assert.deepEqual(canonicalManifest.tables.map((table) => table.name), expected, "T1 table keys drifted");
  assert.deepEqual(logicalManifest.tables.map((table) => table.key), expected, "T2 table keys drifted");
});

test("T1, T2, and T3 use one schema version and the v1 synthetic-only scope", () => {
  assert.equal(canonicalManifest.schema_version, contracts.CANONICAL_SCHEMA_VERSION, "T1 schema_version drifted");
  assert.equal(logicalManifest.default_schema_version, contracts.CANONICAL_SCHEMA_VERSION, "T2 schema_version drifted");
  assert.deepEqual([canonicalManifest.data_scope], [...contracts.DATA_SCOPES], "T1 data_scope drifted");

  const t2DataScope = logicalManifest.common_fields.find((field) => field.key === "data_scope");
  assert.deepEqual(t2DataScope?.allowed, [...contracts.DATA_SCOPES], "T2 data_scope drifted");
});

test("T1, T2, and T3 preserve all five fixed status groups", () => {
  const groups = [
    {
      table: "raw_feedback",
      field: "processing_status",
      expected: contracts.RAW_FEEDBACK_STATUSES,
    },
    {
      table: "cases",
      field: "status",
      expected: contracts.CASE_STATUSES,
    },
    {
      table: "work_orders",
      field: "status",
      expected: contracts.WORK_ORDER_STATUSES,
    },
    {
      table: "clusters",
      field: "status",
      expected: contracts.CLUSTER_STATUSES,
    },
    {
      table: "improvements",
      field: "status",
      expected: contracts.IMPROVEMENT_STATUSES,
    },
  ];

  const failures = [];

  for (const group of groups) {
    const expected = [...group.expected];
    collectStatusMismatch(
      failures,
      `data/canonical/manifest.json#status_enums.${group.table}`,
      canonicalManifest.status_enums[group.table],
      expected,
    );
    const logicalTable = logicalManifest.tables.find((table) => table.key === group.table);
    const logicalStatus = logicalTable?.fields.find((field) => field.key === group.field)?.allowed;
    collectStatusMismatch(
      failures,
      `feishu/manifests/neoloop-logical-manifest.v0.1.json#tables.${group.table}.fields.${group.field}.allowed`,
      logicalStatus,
      expected,
    );
  }

  assert.equal(failures.length, 0, `Fixed status contract drift:\n${failures.join("\n")}`);
});

test("T2 AI envelope uses T3 authoritative fields and status values", () => {
  assert.deepEqual(
    sorted(logicalManifest.ai_envelope.required),
    sorted(contracts.AI_NODE_ENVELOPE_REQUIRED_FIELDS),
    "T2 AI envelope fields drifted",
  );
  assert.deepEqual(
    logicalManifest.ai_envelope.status_allowed,
    [...contracts.AI_NODE_STATUSES],
    "T2 AI envelope statuses drifted",
  );
  assert.equal(logicalManifest.ai_envelope.schema_repair_retry_limit, 1);
});
