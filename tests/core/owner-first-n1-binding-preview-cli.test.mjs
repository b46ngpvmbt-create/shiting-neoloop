import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";

const projectRoot = resolve(import.meta.dirname, "../..");
const buildRoot = process.env.NEOLOOP_T3_BUILD_ROOT;
if (!buildRoot) throw new Error("Run core tests with: node tests/core/run-core-tests.mjs");

const canonicalBuildRoot = realpathSync(buildRoot);
const cliPath = join(canonicalBuildRoot, "src/neoloop/cli/owner-first-n1-binding-preview.js");
const promptPath = join(projectRoot, "feishu/prompts/n1-owner-first-exact-5-bound.txt");
const ORIGINAL_TEXT = "DEMO-X3-205 昨天的历史视频一直没有通过站点Wi-Fi回传。";
const REPORT_KEYS = [
  "schema_version",
  "classification",
  "attempt_count",
  "candidate_top_level_keys",
  "exact_14_generated",
  "issue_codes",
  "binding",
];
const BINDING_KEYS = [
  "contract_version",
  "algorithm",
  "offset_unit",
  "normalization",
  "status",
  "span_count",
  "source_sha256",
  "candidate_before_sha256",
  "candidate_after_sha256",
  "reason_codes",
];

function candidate(overrides = {}) {
  return {
    payload: {
      fact_spans: [{ fact: ORIGINAL_TEXT, evidence_span_index: 0 }],
      request: ORIGINAL_TEXT,
      request_evidence_span_index: 0,
      entity_clues: { vehicle_ids: ["DEMO-X3-205"], task_ids: [], station_names: [] },
    },
    evidence_spans: [{ source_ref: "SYN-FEEDBACK-029", quote: ORIGINAL_TEXT }],
    missing_fields: [],
    confidence: overrides.confidence ?? 0.94,
    status: "ok",
    ...overrides.candidate,
  };
}

function frame(value) {
  return Buffer.concat([
    Buffer.from([0x1e]),
    Buffer.from(JSON.stringify(value), "utf8"),
    Buffer.from("\n", "utf8"),
  ]);
}

function runCli(input, args = [], options = {}) {
  return spawnSync(process.execPath, [...(options.nodeArgs ?? []), cliPath, ...args], {
    cwd: options.cwd ?? projectRoot,
    input,
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
  });
}

function parseReports(execution) {
  assert.equal(execution.signal, null);
  assert.equal(execution.stderr, "");
  const lines = execution.stdout === "" ? [] : execution.stdout.trimEnd().split("\n");
  return lines.map((line) => {
    const report = JSON.parse(line);
    assert.equal(JSON.stringify(report), line);
    assert.deepEqual(Object.keys(report), REPORT_KEYS);
    assert.deepEqual(Object.keys(report.binding), BINDING_KEYS);
    return report;
  });
}

function listSourceImports(entryPath) {
  const visited = new Set();
  const imports = [];
  const visit = (sourcePath) => {
    const canonical = resolve(sourcePath);
    if (visited.has(canonical)) return;
    visited.add(canonical);
    const source = readFileSync(canonical, "utf8");
    const pattern = /(?:import|export)\s+(?:type\s+)?(?:[^"']*?\sfrom\s*)?["']([^"']+)["']/gu;
    for (const match of source.matchAll(pattern)) {
      const specifier = match[1];
      imports.push(specifier);
      if (!specifier.startsWith(".")) continue;
      const jsPath = resolve(dirname(canonical), specifier);
      visit(jsPath.endsWith(".js") ? `${jsPath.slice(0, -3)}.ts` : `${jsPath}.ts`);
    }
  };
  visit(entryPath);
  return imports;
}

function directoryDigest(root) {
  return readdirSync(root).sort().map((name) => {
    const path = join(root, name);
    const stat = statSync(path);
    return `${name}:${stat.size}:${createHash("sha256").update(readFileSync(path)).digest("hex")}`;
  });
}

test("v2 Prompt delegates offsets exclusively to the deterministic binder", () => {
  const prompt = readFileSync(promptPath, "utf8");
  assert.match(prompt, /顶层键必须且只能按以下顺序出现/u);
  assert.match(prompt, /每个元素必须且只能包含 source_ref、quote/u);
  assert.match(prompt, /不得输出 start_offset 或 end_offset/u);
  assert.match(prompt, /不得改写、归一化、概括或猜测 quote/u);
  assert.equal(prompt.match(/修复区：/gu)?.length, 1);
  assert.ok(prompt.endsWith("修复区：\n"));
  assert.doesNotMatch(prompt, /start_offset 从 0 开始/u);
});

test("v2 CLI emits one compact bound-success report", () => {
  const execution = runCli(frame(candidate()));
  assert.equal(execution.status, 0);
  const [report] = parseReports(execution);
  assert.equal(report.classification, "candidate_validated_after_deterministic_binding");
  assert.equal(report.attempt_count, 1);
  assert.equal(report.exact_14_generated, true);
  assert.equal(report.binding.status, "bound");
  assert.deepEqual(report.issue_codes, []);
});

test("v2 CLI permits one repair frame and stops after two refusals", () => {
  const invalid = candidate({ confidence: 2 });
  const recovered = runCli(Buffer.concat([frame(invalid), frame(candidate())]));
  assert.equal(recovered.status, 0);
  assert.deepEqual(
    parseReports(recovered).map((report) => report.classification),
    ["needs_human", "candidate_validated_after_deterministic_binding"],
  );

  const failed = runCli(Buffer.concat([frame(invalid), frame(invalid)]));
  assert.equal(failed.status, 1);
  const reports = parseReports(failed);
  assert.deepEqual(reports.map((report) => report.attempt_count), [1, 2]);
  assert.ok(reports.every((report) => report.binding.status === "refused"));
  assert.ok(reports.every((report) => report.binding.candidate_after_sha256 === null));
});

test("v2 CLI maps fatal transport and arguments to fixed redacted v2 failures", () => {
  const duplicate = Buffer.from(`${String.fromCharCode(0x1e)}{"payload":{},"payload":{}}\n`, "utf8");
  const transport = runCli(duplicate);
  assert.equal(transport.status, 1);
  assert.deepEqual(parseReports(transport)[0].issue_codes, ["input_duplicate_key"]);

  const argument = runCli(frame(candidate()), ["https://example.invalid/not-accepted"]);
  assert.equal(argument.status, 1);
  assert.deepEqual(parseReports(argument)[0].issue_codes, ["input_frame_invalid"]);
});

test("v2 CLI never emits raw candidate, quote, offsets, URL, or credential-shaped text", () => {
  const hostile = {
    payload: candidate().payload,
    evidence_spans: [{
      source_ref: "SYN-FEEDBACK-029",
      quote: ORIGINAL_TEXT,
      start_offset: 0,
      token: "SENSITIVE-TOKEN",
    }],
    missing_fields: [],
    confidence: 0.9,
    status: "ok",
    url: "https://example.invalid/private",
  };
  const execution = runCli(frame(hostile));
  assert.equal(execution.status, 1);
  parseReports(execution);
  const output = `${execution.stdout}${execution.stderr}`;
  for (const forbidden of [ORIGINAL_TEXT, "SYN-FEEDBACK-029", "start_offset", "SENSITIVE-TOKEN", "example.invalid"]) {
    assert.equal(output.includes(forbidden), false, forbidden);
  }
});

test("v2 CLI import graph has no filesystem, child, network, database, or logging dependency", () => {
  const imports = listSourceImports(join(projectRoot, "src/neoloop/cli/owner-first-n1-binding-preview.ts"));
  const forbidden = /^(?:node:)?(?:fs|fs\/promises|child_process|http|https|http2|net|tls|dgram|dns|dns\/promises|worker_threads)$/u;
  assert.deepEqual(imports.filter((specifier) => forbidden.test(specifier)), []);
  assert.deepEqual(imports.filter((specifier) => /(?:database|logger|logging)/u.test(specifier)), []);
});

test("v2 CLI succeeds in permission mode without write, network, child, or worker access", (t) => {
  const permissionFlag = process.allowedNodeEnvironmentFlags.has("--permission")
    ? "--permission"
    : process.allowedNodeEnvironmentFlags.has("--experimental-permission")
      ? "--experimental-permission"
      : null;
  if (permissionFlag === null) {
    t.skip("permission mode unavailable");
    return;
  }
  const cwd = mkdtempSync(join(tmpdir(), "neoloop-n1-binding-cli-"));
  try {
    const before = directoryDigest(cwd);
    const execution = runCli(frame(candidate()), [], {
      cwd,
      nodeArgs: ["--no-warnings", permissionFlag, `--allow-fs-read=${canonicalBuildRoot}`],
    });
    assert.equal(execution.status, 0);
    assert.equal(parseReports(execution)[0].classification, "candidate_validated_after_deterministic_binding");
    assert.deepEqual(directoryDigest(cwd), before);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});
