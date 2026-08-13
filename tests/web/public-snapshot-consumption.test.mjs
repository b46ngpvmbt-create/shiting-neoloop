import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const publicRoot = new URL("../../data/canonical/public/", import.meta.url);

async function readJson(path) {
  return JSON.parse(await readFile(new URL(path, publicRoot), "utf8"));
}

test("public website contract exposes one frozen five-view snapshot", async () => {
  const [declarations, mainStory, failureDrills, ...views] = await Promise.all([
    readJson("declarations.json"),
    readJson("main-story.json"),
    readJson("failure-drills.json"),
    readJson("views/feedback-inbox.json"),
    readJson("views/case-cockpit.json"),
    readJson("views/sla-board.json"),
    readJson("views/problem-map.json"),
    readJson("views/improvement-tracker.json"),
  ]);

  assert.equal(declarations.snapshot_version, "1.0.0-t1-r3-public.1");
  assert.equal(declarations.schema_version, "1.0.0-draft.2");
  assert.equal(declarations.fixture_version, "1.0.0-t1-r2");
  assert.equal(declarations.data_scope, "synthetic_experiment");
  assert.equal(declarations.claims.enterprise_system_connected, false);
  assert.equal(declarations.claims.runtime_results_included, false);
  assert.deepEqual(
    views.map((view) => view.view_key),
    declarations.public_contract.required_view_keys,
  );
  assert.ok(views.every((view) => view.read_only === true));
  assert.equal(mainStory.records[0].source_case_id, "SYN-CASE-017");
  assert.equal(mainStory.records[0].execution_status, "not_run");
  assert.equal(failureDrills.record_count, 4);
  assert.ok(failureDrills.records.every((drill) => drill.execution_status === "not_run"));
});

test("app consumes only the canonical public snapshot", async () => {
  const [pageSource, softwareSource, workbenchDataSource, snapshotSource] = await Promise.all([
    readFile(new URL("../../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../../app/software/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../../app/software/workbench-data.ts", import.meta.url), "utf8"),
    readFile(new URL("../../app/public-snapshot.ts", import.meta.url), "utf8"),
  ]);
  const combined = `${pageSource}\n${softwareSource}\n${workbenchDataSource}\n${snapshotSource}`;

  assert.match(pageSource, /from "\.\/public-snapshot"/);
  assert.match(softwareSource, /from "\.\.\/public-snapshot"/);
  assert.match(workbenchDataSource, /from "\.\.\/public-snapshot"/);
  assert.match(snapshotSource, /data\/canonical\/public\/declarations\.json/);
  assert.match(snapshotSource, /data\/canonical\/public\/main-story\.json/);
  assert.match(snapshotSource, /data\/canonical\/public\/failure-drills\.json/);
  for (const denied of [
    "data/demo-cases.json",
    "data/canonical/tables",
    "data/canonical/gold",
    "data/canonical/adversarial",
    "data/canonical/scenarios",
    "data/canonical/workbooks",
  ]) {
    assert.doesNotMatch(combined, new RegExp(denied.replaceAll("/", "\\/")));
  }
  assert.doesNotMatch(combined, /\bDEMO-/);
  assert.doesNotMatch(pageSource, /\bfetch\s*\(/);
  assert.doesNotMatch(pageSource, /method\s*:\s*["'](?:POST|PUT|PATCH|DELETE)["']/i);
  assert.doesNotMatch(softwareSource, /\bfetch\s*\(/);
  assert.doesNotMatch(softwareSource, /method\s*:\s*["'](?:POST|PUT|PATCH|DELETE)["']/i);
  assert.doesNotMatch(workbenchDataSource, /\bfetch\s*\(/);
  assert.doesNotMatch(workbenchDataSource, /method\s*:\s*["'](?:POST|PUT|PATCH|DELETE)["']/i);
  assert.match(workbenchDataSource, /SYN-SOURCE-/);
  assert.match(workbenchDataSource, /合成显示字段/);
  assert.match(workbenchDataSource, /sandboxSteps/);
  assert.equal((workbenchDataSource.match(/reviewContract:/g) ?? []).length, 4);
  assert.match(softwareSource, /退回补证/);
  assert.match(softwareSource, /驳回候选/);
  assert.match(softwareSource, /模拟补证并重新提交/);
  assert.doesNotMatch(softwareSource, /localStorage/);
  assert.doesNotMatch(pageSource, /avatars\//);
  assert.match(pageSource, /\/visuals\/neoloop-concept-hero-v1\.webp/);
  assert.match(pageSource, /方案场景插画｜非真实车型或运行现场/);
  assert.match(pageSource, /查看全部 \$\{currentView\.count\} 条合成记录/);
  assert.match(pageSource, /aria-expanded=\{expanded\}/);
});

test("public team contact block stays inside the approved whitelist", async () => {
  const [pageSource, cssSource] = await Promise.all([
    readFile(new URL("../../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../../app/globals.css", import.meta.url), "utf8"),
  ]);

  for (const requiredText of [
    "石听未来",
    "刘肖蔚然",
    "闫紫豪",
    "青岛农业大学｜风景园林（虚拟现实技术设计）",
    "2718275274@qq.com",
    "https://github.com/b46ngpvmbt-create",
    "https://github.com/b46ngpvmbt-create/shiting-neoloop",
    "参赛成员不等于演示中的企业角色",
  ]) {
    assert.match(pageSource, new RegExp(requiredText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  const qqEmails = pageSource.match(/[A-Z0-9._%+-]+@qq\.com/gi) ?? [];
  assert.deepEqual([...new Set(qqEmails)], ["2718275274@qq.com"]);
  assert.equal((pageSource.match(/target="_blank"/g) ?? []).length, 2);
  assert.equal((pageSource.match(/rel="noopener noreferrer"/g) ?? []).length, 2);
  assert.doesNotMatch(pageSource, /avatars\//);
  assert.match(cssSource, /\.contact-link\s*\{[^}]*min-height:\s*44px;/s);
});
