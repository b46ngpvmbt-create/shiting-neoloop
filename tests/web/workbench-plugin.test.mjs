import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const pluginRoot = new URL("../../feishu/workbench-plugin/", import.meta.url);
const pluginPath = fileURLToPath(pluginRoot);

async function source(file) {
  return readFile(new URL(file, pluginRoot), "utf8");
}

async function importCompiledPolicy() {
  const outputRoot = await mkdtemp(path.join(os.tmpdir(), "neoloop-workbench-policy-"));
  const tsc = path.join(pluginPath, "node_modules/typescript/bin/tsc");
  await execFileAsync(process.execPath, [
    tsc,
    path.join(pluginPath, "src/policy.ts"),
    "--target", "ES2022",
    "--module", "ES2022",
    "--moduleResolution", "bundler",
    "--outDir", outputRoot,
    "--skipLibCheck",
  ]);
  return import(pathToFileURL(path.join(outputRoot, "policy.js")).href);
}

async function importCompiledLiveActions() {
  const outputRoot = await mkdtemp(path.join(os.tmpdir(), "neoloop-workbench-live-actions-"));
  const tsc = path.join(pluginPath, "node_modules/typescript/bin/tsc");
  await execFileAsync(process.execPath, [
    tsc,
    path.join(pluginPath, "src/live-actions.ts"),
    "--target", "ES2022",
    "--module", "ES2022",
    "--moduleResolution", "bundler",
    "--outDir", outputRoot,
    "--skipLibCheck",
  ]);
  return import(pathToFileURL(path.join(outputRoot, "live-actions.js")).href);
}

test("workbench package is isolated and builds without root manifest changes", async () => {
  const manifest = JSON.parse(await source("package.json"));
  assert.equal(manifest.private, true);
  assert.equal(manifest.type, "module");
  assert.match(manifest.scripts.build, /vite build/);
  assert.match(manifest.scripts.check, /tsc/);
  assert.deepEqual(manifest.dependencies, { "@lark-base-open/js-sdk": "1.0.2" });
});

test("workbench exposes six tabs, ten Base tables, and only synthetic samples", async () => {
  const policy = await importCompiledPolicy();
  assert.equal(policy.WORKBENCH_TABS.length, 6);
  assert.equal(policy.BASE_TABLES.length, 10);
  assert.equal(new Set(policy.BASE_TABLES.map((table) => table.key)).size, 10);
  assert.ok(policy.SAMPLE_FEEDBACK.every((item) => item.dataScope === "synthetic_experiment"));
  assert.ok(policy.PLATFORM_CARDS.every((item) => item.status === "unconfigured"));
});

test("role policy is deny-by-default and high-risk controls stay owner-only", async () => {
  const { canPerform } = await importCompiledPolicy();

  assert.equal(canPerform("owner", "connector:create"), true);
  assert.equal(canPerform("owner", "connector:rotate"), true);
  assert.equal(canPerform("operations", "feedback:create_manual"), true);
  assert.equal(canPerform("operations", "connector:rotate"), false);
  assert.equal(canPerform("reviewer", "review:decide"), true);
  assert.equal(canPerform("reviewer", "feedback:create_manual"), false);
  assert.equal(canPerform("judge", "record:view"), true);
  assert.equal(canPerform("judge", "review:decide"), false);
  assert.equal(canPerform("owner", "vehicle:control"), false);
  assert.equal(canPerform("owner", "unknown:action"), false);
});

test("demo mode selects the dedicated SYN-LIVE-DEMO chain without mutating source records", async () => {
  const { applyWorkbenchFilters, SAMPLE_FEEDBACK } = await importCompiledPolicy();
  const before = structuredClone(SAMPLE_FEEDBACK);
  const result = applyWorkbenchFilters(SAMPLE_FEEDBACK, {
    mode: "demo",
    source: "all",
    timeRange: "all",
    risk: "all",
    status: "all",
    query: "",
  });

  assert.ok(result.length > 0);
  assert.ok(result.every((item) => item.id.startsWith("SYN-LIVE-DEMO-")));
  assert.deepEqual(SAMPLE_FEEDBACK, before);
});

test("SDK and connector boundaries keep tokens and one-time secrets out of persistence", async () => {
  const [main, lifecycle, adapter, api, session, app, html] = await Promise.all([
    source("src/main.ts"),
    source("src/dashboard-lifecycle.ts"),
    source("src/base-adapter.ts"),
    source("src/connector-client.ts"),
    source("src/feishu-session.ts"),
    source("src/workbench.ts"),
    source("index.html"),
  ]);
  const combined = `${main}\n${lifecycle}\n${adapter}\n${api}\n${session}\n${app}\n${html}`;

  assert.match(adapter, /WorkbenchBaseAdapter/);
  assert.match(adapter, /createLarkBaseAdapter/);
  assert.match(adapter, /createOfficialLarkBaseAdapter/);
  assert.match(adapter, /from "@lark-base-open\/js-sdk"/);
  assert.match(adapter, /getTableMetaList/);
  assert.match(adapter, /getRecordsByPage/);
  assert.match(adapter, /listRecords/);
  assert.match(adapter, /getFieldMetaList/);
  assert.match(adapter, /stringValue:\s*true/);
  assert.match(app, /reloadRecords/);
  assert.match(app, /context\?\.mode === "standalone-preview"/);
  assert.match(app, /NEUTRAL_ESCALATION_LEVELS/);
  assert.match(main, /createMockBaseAdapter/);
  assert.match(main, /import\.meta\.env\.DEV/);
  assert.match(main, /createUnavailableConnectorClient/);
  assert.match(main, /mountDashboardLifecycle/);
  assert.match(main, /Owner 短期会话未建立·连接器保持只读/);
  assert.match(main, /验证 Owner 身份/);
  assert.match(main, /createBrowserFeishuWorkbenchSession/);
  assert.match(main, /auth_code_rejected/);
  assert.match(lifecycle, /dashboard\.saveConfig\(WORKBENCH_DASHBOARD_CONFIG\)/);
  assert.match(lifecycle, /dashboard\.setRendered\(\)/);
  assert.match(lifecycle, /dataConditions:\s*\[\]/);
  assert.match(lifecycle, /neoloop\.workbench\.dashboard\.v1/);
  assert.match(session, /requestAccess/);
  assert.match(session, /scopeList:\s*\[\]/);
  assert.ok(session.indexOf("if (sdk.requestAccess)") < session.indexOf("else if (sdk.requestAuthCode)"));
  assert.match(session, /if \(window\.tt\) return resolve\(window\.tt\)/);
  assert.match(session, /\/api\/v1\/session\/exchange/);
  assert.match(session, /\/api\/v1\/session\/prepare/);
  assert.match(session, /\/api\/v1\/session\/result/);
  assert.match(session, /workbench-session-ticket\.v1/);
  assert.match(session, /workbench-session-result\.v1/);
  assert.match(session, /popupClosedAt/);
  assert.doesNotMatch(session, /if \(popup\.closed\) finish/);
  assert.match(session, /event\.origin !== origin/);
  assert.match(session, /new BroadcastChannel\("neoloop-owner-oauth-v1"\)/);
  assert.match(html, /h5-js-sdk-1\.5\.44\.js/);
  assert.doesNotMatch(main, /__NEOLOOP_LARK_BASE_SDK__/);
  assert.match(api, /Authorization/);
  assert.match(api, /Session/);
  assert.match(api, /credentials:\s*"omit"/);
  assert.doesNotMatch(combined, /localStorage|sessionStorage|indexedDB/i);
  assert.doesNotMatch(combined, /tenant_access_token|user_access_token|app_secret/i);
  assert.doesNotMatch(combined, /SYN[-_][A-Z0-9_-]*SECRET/i);
});

test("production paths never silently fall back to mock Base or connector data", async () => {
  const [main, adapter, api] = await Promise.all([
    source("src/main.ts"),
    source("src/base-adapter.ts"),
    source("src/connector-client.ts"),
  ]);
  assert.match(main, /if \(isLocalPreview\)/);
  assert.match(main, /createMockBaseAdapter\("owner"\)/);
  assert.match(main, /createMockConnectorClient\(\)/);
  assert.match(main, /createOfficialLarkBaseAdapter\(role\)/);
  assert.match(main, /createUnavailableConnectorClient\(\)/);
  assert.match(api, /throw new Error\("连接器会话未就绪/);
  assert.match(adapter, /Production binding\. This never falls back to synthetic data/);
});

test("markup and styles preserve keyboard, dialog, live-region, and mobile affordances", async () => {
  const [app, styles] = await Promise.all([
    source("src/workbench.ts"),
    source("src/styles.css"),
  ]);

  assert.match(app, /role="tablist"/);
  assert.match(app, /aria-selected=/);
  assert.match(app, /aria-live="polite"/);
  assert.match(app, /role="dialog"/);
  assert.match(app, /aria-modal="true"/);
  assert.match(app, /event\.key === "ArrowRight"/);
  assert.match(app, /event\.key === "Escape"/);
  assert.match(styles, /:focus-visible/);
  assert.match(styles, /@media \(max-width:\s*760px\)/);
  assert.match(styles, /@media \(prefers-reduced-motion:\s*reduce\)/);
});

test("workbench header reads live workflow status and never falls back to a fabricated count", async () => {
  const [app, client] = await Promise.all([
    source("src/workbench.ts"),
    source("src/connector-client.ts"),
  ]);

  assert.match(client, /\/api\/v1\/workflows\/status/);
  assert.match(app, /this\.connectors\.workflowStatus\(\)\.catch\(\(\) => null\)/);
  assert.match(app, /workflow\.enabled/);
  assert.match(app, /状态待同步/);
  assert.doesNotMatch(app, /<b>6<\/b> 条工作流 <em>6 启用 \/ 0 停用<\/em>/);
});

test("AI audit validation is rendered as a clear result instead of raw JSON", async () => {
  const app = await source("src/workbench.ts");

  assert.match(app, /function auditValidationLabel/);
  assert.match(app, /result\.valid === true\) return "验证通过"/);
  assert.match(app, /result\.valid === false\) return "验证失败"/);
  assert.match(app, /value === "needs_human"\) return "需人工处理"/);
  assert.match(app, /auditValidationLabel\(row\.fields\.validation \?\? row\.fields\.status\)/);
});

test("embedded Windows and anonymous sessions use persistent custom filter menus", async () => {
  const [app, styles] = await Promise.all([
    source("src/workbench.ts"),
    source("src/styles.css"),
  ]);

  assert.doesNotMatch(app, /<select data-filter=/);
  assert.match(app, /openFilter: FilterKey \| null/);
  assert.match(app, /role="combobox" aria-haspopup="listbox" aria-expanded="\$\{open\}"/);
  assert.match(app, /class="filter-menu" role="listbox"/);
  assert.match(app, /role="option" aria-selected="\$\{value === current\}"/);
  assert.match(app, /data-action="filter-toggle"/);
  assert.match(app, /data-action="filter-select"/);
  assert.match(app, /data-action="filter-close"/);
  assert.match(app, /event\.key === "ArrowDown"/);
  assert.match(app, /event\.key === "Escape" \|\| event\.key === "Tab"/);
  assert.match(app, /this\.state\.openFilter = this\.state\.openFilter === key \? null : key/);
  assert.match(styles, /\.filter-menu-scrim\s*\{/);
  assert.match(styles, /\.filter-menu\s*\{[^}]*position:\s*absolute/s);
});

test("six tabs expose an unmistakable active module and move focus into its panel", async () => {
  const [app, styles] = await Promise.all([
    source("src/workbench.ts"),
    source("src/styles.css"),
  ]);

  assert.match(app, /class="\$\{tab\.key === this\.state\.tab \? "active" : ""\}"/);
  assert.match(app, /aria-selected="\$\{tab\.key === this\.state\.tab\}"/);
  assert.match(app, /class="tab-panel tab-panel-\$\{this\.state\.tab\}"/);
  assert.match(app, /data-active-module="\$\{this\.state\.tab\}"/);
  assert.match(app, /class="module-context-strip"/);
  assert.match(app, /<span>当前模块<\/span>/);
  assert.match(app, /tabindex="-1"[^>]*role="tabpanel"|role="tabpanel"[^>]*tabindex="-1"/);

  const changeTab = app.slice(app.indexOf("private changeTab"), app.indexOf("private handleTabKey"));
  assert.match(changeTab, /#panel-\$\{tab\}/);
  assert.match(changeTab, /panel\?\.focus\(\)/);

  const activeRule = styles.match(/\.workbench-tabs button\.active\s*\{(?<body>[^}]*)\}/s);
  assert.ok(activeRule?.groups?.body, "active tab needs its own visual rule");
  assert.match(activeRule.groups.body, /background(?:-color)?\s*:/);
  assert.match(activeRule.groups.body, /border(?:-color)?\s*:/);
  assert.match(activeRule.groups.body, /color\s*:/);
  assert.match(styles, /\.workbench-tabs button\.active span\s*\{/);
});

test("intake and case panels preview five rows and expose full filtered lists in separate drawers", async () => {
  const app = await source("src/workbench.ts");

  assert.match(app, /type DrawerState\s*=/);
  assert.match(app, /modal:\s*ModalState;/);
  assert.match(app, /drawer:\s*DrawerState;/);
  assert.match(app, /const visiblePreview = visible\.slice\(0, 5\);/);
  assert.match(app, /const casePreview = cases\.slice\(0, 5\);/);
  assert.match(app, /visiblePreview\.map\(\(item\)/);
  assert.match(app, /casePreview\.map\(\(item\)/);
  assert.match(app, /visible\.length > 5[\s\S]*?data-action="feedback-drawer-open"[\s\S]*?查看全部（\$\{visible\.length\}）/);
  assert.match(app, /cases\.length > 5[\s\S]*?data-action="case-drawer-open"[\s\S]*?查看全部（\$\{cases\.length\}）/);

  const drawer = app.slice(app.indexOf("private renderDrawer"), app.indexOf("private renderConnectorForm"));
  assert.match(drawer, /const visible = this\.visibleFeedback\(\);/);
  assert.match(drawer, /const cases = this\.caseItems\(\);/);
  assert.match(drawer, /class="list-drawer" role="dialog" aria-modal="true"/);
  assert.match(drawer, /class="drawer-feedback-list feedback-list"/);
  assert.match(drawer, /visible\.map\(\(item\)/);
  assert.match(drawer, /class="compact-table drawer-case-table"/);
  assert.match(drawer, /cases\.map\(\(item\)/);
});

test("list drawers close by button, scrim, or Escape, restore focus, and fit narrow screens", async () => {
  const [app, styles] = await Promise.all([
    source("src/workbench.ts"),
    source("src/styles.css"),
  ]);

  assert.match(app, /class="drawer-scrim" data-action="drawer-close"/);
  assert.match(app, /class="icon-button" data-action="drawer-close" aria-label="关闭"/);
  assert.match(app, /action === "feedback-drawer-open"[\s\S]*?\[data-action="feedback-drawer-open"\][\s\S]*?kind: "feedback-list"/);
  assert.match(app, /action === "case-drawer-open"[\s\S]*?\[data-action="case-drawer-open"\][\s\S]*?kind: "case-list"/);
  assert.match(app, /action === "drawer-close"[\s\S]*?this\.state\.drawer = null/);
  assert.match(app, /event\.key === "Escape" && \(this\.state\.modal \|\| this\.state\.drawer\)/);
  assert.match(app, /querySelector<HTMLElement>\(returnFocusSelector\)\?\.focus\(\)/);
  assert.match(app, /\.list-drawer button:not\(\[disabled\]\)/);

  assert.match(styles, /\.drawer-layer\s*\{/);
  assert.match(styles, /\.list-drawer\s*\{[^}]*width\s*:\s*min\([^;}]*100vw[^;}]*\);/s);
  assert.match(styles, /\.drawer-content\s*\{[^}]*overflow[^;}]*:/s);
  const mobileStart = styles.indexOf("@media (max-width: 760px)");
  const mobileEnd = styles.indexOf("@media (max-width: 480px)", mobileStart);
  assert.ok(mobileStart >= 0 && mobileEnd > mobileStart, "760px mobile style block must exist");
  const mobileStyles = styles.slice(mobileStart, mobileEnd);
  assert.match(mobileStyles, /\.list-drawer\s*\{[^}]*width\s*:\s*100%/s);
  assert.match(styles, /@media \(prefers-reduced-motion:\s*reduce\)[\s\S]*?transition-duration:\s*0\.01ms\s*!important/);
});

test("every enabled workbench button has a navigation, dialog, form, or business action contract", async () => {
  const app = await source("src/workbench.ts");

  const buttonOpenings = app.match(/<button\b[^>]*>/gs) ?? [];
  assert.ok(buttonOpenings.length >= 30, "button inventory unexpectedly shrank");
  for (const opening of buttonOpenings) {
    assert.match(
      opening,
      /data-(?:action|table|tab|mode|feedback)=|type="submit"|\$\{buttonState\([^)]*false|disabled/,
      `button must have an action route, submit contract, or explicit disabled state: ${opening}`,
    );
  }

  for (const orphanLabel of [
    "更新安全字段</button>",
    "人工确认</button>",
    "审核</button>",
    "确认候选</button>",
    "退回补证</button>",
    "驳回候选</button>",
    "审核知识草稿</button>",
  ]) {
    const occurrence = app.indexOf(orphanLabel);
    if (occurrence < 0) continue;
    const opening = app.lastIndexOf("<button", occurrence);
    const markup = app.slice(opening, occurrence + orphanLabel.length);
    assert.match(markup, /data-(?:action|table|tab|mode)=|type="submit"/u, `${orphanLabel} must be wired`);
  }

  assert.match(app, /data-action="case-action-open"/);
  assert.match(app, /data-action="work-order-action-open"/);
  assert.match(app, /data-action="improvement-action-open"/);
  assert.match(app, /data-action="audit-action-open"/);
  assert.match(app, /data-action="knowledge-action-open"/);
  assert.match(app, /#business-action-form/);
  assert.match(app, /submitBusinessAction/);
  assert.match(app, /kind: "connector-confirm"/);
  assert.match(app, /#connector-confirm-form/);
  assert.match(app, /submitConnectorConfirmation/);
  assert.match(app, /我理解影响并确认\$\{rotating \? "轮换" : "停用"\}/);
});

test("Base adapter performs allowlisted synthetic-only compare-and-set with readback", async () => {
  const adapter = await source("src/base-adapter.ts");

  assert.match(adapter, /updateSyntheticRecord/);
  assert.match(adapter, /SYNTHETIC_UPDATE_FIELDS/);
  assert.match(adapter, /data_scope/);
  assert.match(adapter, /synthetic_experiment/);
  assert.match(adapter, /getFieldByName/);
  assert.match(adapter, /getCellString/);
  assert.match(adapter, /setRecord/);
  assert.match(adapter, /getValue/);
  assert.match(adapter, /record_changed_before_commit/);
  assert.match(adapter, /write_readback_mismatch/);
});

test("live action plans deny non-synthetic data and preserve prohibited safety fields", async () => {
  const actions = await source("src/live-actions.ts");

  assert.match(actions, /synthetic_experiment/);
  assert.match(actions, /case-safe/);
  assert.match(actions, /work-order-safe/);
  assert.match(actions, /improvement-review/);
  assert.match(actions, /ai-review/);
  assert.match(actions, /knowledge-review/);
  assert.doesNotMatch(actions, /sla_started_at\s*:/);
  assert.doesNotMatch(actions, /sla_due_at\s*:/);
  assert.doesNotMatch(actions, /sla_reset_count\s*:/);
  assert.doesNotMatch(actions, /formal_entity\s*:/);
  assert.doesNotMatch(actions, /final_root_cause\s*:/);
  assert.doesNotMatch(actions, /changes:\s*\{[^}]*note\s*:/s);
});

test("live action plans enforce role, scope, CAS preimages, and exact safe changes", async () => {
  const { createLiveActionPlan } = await importCompiledLiveActions();
  const baseTarget = {
    recordId: "rec_synthetic_01",
    businessId: "SYN-LIVE-DEMO-CASE-01",
    dataScope: "synthetic_experiment",
  };
  const clock = { actorId: "ou_owner", observedAt: "2026-08-13T12:00:00.000Z" };
  const casePlan = createLiveActionPlan("operations", {
    ...baseTarget,
    kind: "case-safe",
    tableKey: "cases",
    fields: { status: "待补充", evidence_summary: "原证据" },
  }, { ...clock, status: "处理中", note: "已核对合成来源证据" });
  assert.deepEqual(casePlan.expected, { status: "待补充", evidence_summary: "原证据" });
  assert.deepEqual(casePlan.changes, { status: "处理中", evidence_summary: "已核对合成来源证据" });
  assert.deepEqual(Object.keys(casePlan.changes).sort(), ["evidence_summary", "status"]);

  assert.throws(() => createLiveActionPlan("reviewer", {
    ...baseTarget,
    kind: "work-order-safe",
    tableKey: "work_orders",
    fields: { status: "待接单", disposition_evidence: "等待补齐证据" },
  }, { ...clock, status: "处理中", note: "已上传合成处置证据" }), /不能更新案件或工单/);

  assert.throws(() => createLiveActionPlan("owner", {
    ...baseTarget,
    dataScope: "production",
    kind: "case-safe",
    tableKey: "cases",
    fields: { status: "待补充", evidence_summary: "原证据" },
  }, { ...clock, status: "处理中", note: "不得写入" }), /仅允许处理 synthetic_experiment/);

  const auditPlan = createLiveActionPlan("reviewer", {
    ...baseTarget,
    businessId: "SYN-LIVE-DEMO-RUN-01",
    kind: "ai-review",
    tableKey: "ai_audit",
    fields: { review_action: "pending", reviewed_by: "", reviewed_at: "", human_revision: "", validation: '{"valid":true,"errors":[]}' },
  }, { ...clock, decision: "approved", note: "证据与原文绑定一致" });
  assert.deepEqual(Object.keys(auditPlan.changes).sort(), ["human_revision", "review_action", "reviewed_at", "reviewed_by"]);
  assert.equal(auditPlan.changes.review_action, "approved");
  assert.equal(auditPlan.changes.reviewed_by, "ou_owner");
  assert.deepEqual(JSON.parse(auditPlan.changes.human_revision), { state: "accepted", note: "证据与原文绑定一致" });

  assert.throws(() => createLiveActionPlan("reviewer", {
    ...baseTarget,
    businessId: "SYN-LIVE-DEMO-RUN-INVALID-01",
    kind: "ai-review",
    tableKey: "ai_audit",
    fields: { review_action: "pending", reviewed_by: "", reviewed_at: "", human_revision: "", validation: '{"valid":false,"errors":["candidate_invalid"]}' },
  }, { ...clock, decision: "approved", note: "不得批准" }), /确定性验证未通过的 AI 审计不得批准/);
});

test("live action dialogs show target, current values, explicit confirmation, and readback result", async () => {
  const [app, styles] = await Promise.all([
    source("src/workbench.ts"),
    source("src/styles.css"),
  ]);

  assert.match(app, /LIVE SYNTHETIC ACTION/);
  assert.match(app, /class="action-target"/);
  assert.match(app, /class="action-current-values"/);
  assert.match(app, /select name="confirmed" required/);
  assert.match(app, /option value="yes">我已核对对象和变更；写入飞书后立即读回/);
  assert.match(app, /form\.get\("confirmed"\).*?!== "yes"/s);
  assert.match(app, /已关闭案件不可从工作台倒退状态/);
  assert.match(app, /\["等待补齐证据", "已上传合成处置证据"\]/);
  assert.doesNotMatch(app, /pendingKnowledge[^\n]*\?\? this\.rows\("knowledge_index"\)\[0\]/);
  assert.match(app, /确认写入飞书/);
  assert.match(app, /await this\.base\.updateSyntheticRecord/);
  assert.match(app, /await this\.reloadRecords\(\)/);
  assert.match(app, /个字段已写入并读回通过/);
  assert.match(styles, /\.business-action-dialog/);
  assert.match(styles, /\.action-current-values/);
  assert.match(styles, /\.confirm-write/);
});

test("production bundle compiles", async () => {
  const vite = path.join(pluginPath, "node_modules/vite/bin/vite.js");
  const outputRoot = await mkdtemp(path.join(os.tmpdir(), "neoloop-workbench-dist-"));
  const { stderr } = await execFileAsync(process.execPath, [
    vite,
    "build",
    "--config",
    path.join(pluginPath, "vite.config.ts"),
    "--outDir",
    outputRoot,
    "--emptyOutDir",
  ], { cwd: pluginPath });
  assert.equal(stderr, "");
  const builtHtml = await readFile(path.join(outputRoot, "index.html"), "utf8");
  assert.match(builtHtml, /<script[^>]+src="\.\/assets\//);
  assert.match(builtHtml, /<link[^>]+href="\.\/assets\//);
});
