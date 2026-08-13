import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { validateCanonical } from "../../scripts/neoloop-data/validate-canonical.mjs";

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(TEST_DIR, "../..");
const CANONICAL = resolve(REPO, "data/canonical");
const DEFAULT_SOURCE_XLSX = resolve(REPO, "../../石听NeoLoop_报名提交包/01_直接提交/石听_NeoLoop_报名数据样例.xlsx");

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

test("canonical migration keeps fixed counts and referential integrity", async () => {
  const report = await validateCanonical();

  assert.equal(report.ok, true, JSON.stringify(report.errors, null, 2));
  assert.deepEqual(
    {
      raw_feedback: report.counts.raw_feedback,
      cases: report.counts.cases,
      work_orders: report.counts.work_orders,
      clusters: report.counts.clusters,
    },
    { raw_feedback: 30, cases: 20, work_orders: 27, clusters: 10 },
  );
  assert.equal(report.duplicate_primary_keys, 0);
  assert.equal(report.orphan_foreign_keys, 0);
  assert.equal(report.unmapped_statuses, 0);
  assert.equal(report.relationship_invariant_violations, 0);
  assert.equal(report.contract_invariant_violations, 0);
});

test("legacy-to-canonical mapping is complete and one-to-one", async () => {
  const report = await validateCanonical();

  assert.equal(report.ok, true, JSON.stringify(report.errors, null, 2));
  assert.equal(report.migration_mappings, 107);
});

test("migrated cases use missing_fields and remain non-runnable legacy snapshots", async () => {
  const cases = await readJson(resolve(CANONICAL, "tables/cases.json"));

  assert.equal(cases.length, 20);
  for (const record of cases) {
    assert.equal(Array.isArray(record.missing_fields), true, record.case_id);
    assert.equal(Object.hasOwn(record, "missing_items"), false, record.case_id);
    assert.equal(record.record_mode, "legacy_snapshot", record.case_id);
    if (record.status === "已关闭" && record.formal_entity_confirmation_status === "待人工确认") {
      assert.equal(record.workflow_readiness, "requires_replay_reset", record.case_id);
    }
  }

  const incomplete = cases.filter((record) => ["DEMO-C-011", "DEMO-C-015", "DEMO-C-018"].includes(record.legacy_id));
  assert.equal(incomplete.length, 3);
  for (const record of incomplete) {
    assert.equal(record.status, "待补充", record.case_id);
    assert.deepEqual(record.missing_fields, ["车辆ID", "任务ID"], record.case_id);
  }
});

test("improvement status is derived from the related cluster status", async () => {
  const manifest = await readJson(resolve(CANONICAL, "manifest.json"));
  const clusters = await readJson(resolve(CANONICAL, "tables/clusters.json"));
  const improvements = await readJson(resolve(CANONICAL, "tables/improvements.json"));
  const clusterById = new Map(clusters.map((cluster) => [cluster.cluster_id, cluster]));
  const relationship = manifest.relationship_invariants.improvement_status_by_cluster_status;

  assert.deepEqual(relationship, {
    "候选": "待立项",
    "待审核": "待立项",
    "改进中": "执行中",
    "观察中": "观察中",
    "已归档": "已完成",
    "已驳回": "已终止",
  });
  const statusCounts = improvements.reduce((counts, improvement) => {
    counts[improvement.status] = (counts[improvement.status] ?? 0) + 1;
    return counts;
  }, {});
  assert.deepEqual(statusCounts, { "观察中": 2, "执行中": 2, "待立项": 6 });
  for (const improvement of improvements) {
    const cluster = clusterById.get(improvement.cluster_id);
    assert.ok(cluster, improvement.improvement_id);
    assert.equal(improvement.status, relationship[cluster.status], improvement.improvement_id);
  }
});

test("explicit source workbook validation has zero warnings", async (t) => {
  const sourceWorkbookPath = process.env.NEOLOOP_SOURCE_XLSX ?? DEFAULT_SOURCE_XLSX;
  try {
    await access(sourceWorkbookPath);
  } catch {
    t.skip(`source workbook unavailable: ${sourceWorkbookPath}`);
    return;
  }

  const report = await validateCanonical({ sourceWorkbookPath });
  assert.equal(report.ok, true, JSON.stringify(report.errors, null, 2));
  assert.deepEqual(report.warnings, []);
});
