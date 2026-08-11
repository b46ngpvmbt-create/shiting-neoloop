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
  const [main, adapter, api, app, html] = await Promise.all([
    source("src/main.ts"),
    source("src/base-adapter.ts"),
    source("src/connector-client.ts"),
    source("src/workbench.ts"),
    source("index.html"),
  ]);
  const combined = `${main}\n${adapter}\n${api}\n${app}\n${html}`;

  assert.match(adapter, /WorkbenchBaseAdapter/);
  assert.match(adapter, /createLarkBaseAdapter/);
  assert.match(adapter, /createOfficialLarkBaseAdapter/);
  assert.match(adapter, /from "@lark-base-open\/js-sdk"/);
  assert.match(adapter, /getTableMetaList/);
  assert.match(adapter, /getRecordsByPage/);
  assert.match(main, /createMockBaseAdapter/);
  assert.match(main, /import\.meta\.env\.DEV/);
  assert.match(main, /createUnavailableConnectorClient/);
  assert.doesNotMatch(main, /__NEOLOOP_LARK_BASE_SDK__/);
  assert.match(api, /X-NeoLoop-Signature/);
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
  assert.match(main, /isLocalPreview\s*\?\s*createMockBaseAdapter/);
  assert.match(main, /:\s*createOfficialLarkBaseAdapter/);
  assert.match(main, /isLocalPreview\s*\?\s*createMockConnectorClient/);
  assert.match(main, /:\s*createUnavailableConnectorClient/);
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
