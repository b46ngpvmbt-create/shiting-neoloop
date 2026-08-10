import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const buildRoot = process.env.NEOLOOP_T3_BUILD_ROOT;
if (!buildRoot) throw new Error("Run core tests with: node tests/core/run-core-tests.mjs");
const cliPath = resolve(buildRoot, "src/neoloop/cli/owner-first-node-preview.js");
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

function frame(value) {
  return Buffer.concat([
    Buffer.from([0x1e]),
    Buffer.from(JSON.stringify(value), "utf8"),
    Buffer.from("\n", "utf8"),
  ]);
}

function run(profileId, input, extraArgs = []) {
  return spawnSync(process.execPath, [cliPath, profileId, ...extraArgs], {
    cwd: projectRoot,
    input,
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
  });
}

function reports(execution) {
  assert.equal(execution.stderr, "");
  return execution.stdout.trimEnd().split("\n").filter(Boolean).map((line) => {
    assert.equal(JSON.stringify(JSON.parse(line)), line);
    return JSON.parse(line);
  });
}

function sourceImportGraph(entryPath) {
  const visited = new Set();
  const imports = [];
  const visit = (sourcePath) => {
    const canonicalPath = resolve(sourcePath);
    if (visited.has(canonicalPath)) return;
    visited.add(canonicalPath);
    const source = readFileSync(canonicalPath, "utf8");
    const pattern = /(?:import|export)\s+(?:type\s+)?(?:[^"']*?\sfrom\s*)?["']([^"']+)["']/gu;
    for (const match of source.matchAll(pattern)) {
      const specifier = match[1];
      imports.push(specifier);
      if (!specifier.startsWith(".")) continue;
      const resolvedJs = resolve(dirname(canonicalPath), specifier);
      visit(resolvedJs.endsWith(".js") ? `${resolvedJs.slice(0, -3)}.ts` : `${resolvedJs}.ts`);
    }
  };
  visit(entryPath);
  return imports;
}

test("shared owner-first CLI accepts one fixed profile and emits only redacted compact reports", () => {
  const candidate = {
    payload: {
      business_domain: "车辆运维",
      subcategory: "舱门解锁异常",
      tags: ["舱门", "延误"],
      taxonomy_version: "taxonomy-owner-synthetic-v1",
    },
    evidence_spans: [],
    missing_fields: [],
    confidence: 0.88,
    status: "ok",
  };
  const execution = run("n2-default", frame(candidate));
  assert.equal(execution.status, 0);
  assert.deepEqual(reports(execution), [{
    profile_id: "n2-default",
    node: "N2",
    mode: "default",
    classification: "exact_candidate_validated",
    attempt_count: 1,
    candidate_top_level_keys: ["payload", "evidence_spans", "missing_fields", "confidence", "status"],
    exact_14_generated: true,
    issue_codes: [],
  }]);
});

test("shared owner-first CLI rejects unknown profiles, extra args, duplicate keys, and a third frame", () => {
  const unknown = run("../../secret", frame({}));
  assert.equal(unknown.status, 1);
  assert.deepEqual(reports(unknown)[0].issue_codes, ["profile_not_allowed"]);

  const extra = run("n2-default", frame({}), ["unexpected"]);
  assert.equal(extra.status, 1);
  assert.deepEqual(reports(extra)[0].issue_codes, ["input_frame_invalid"]);

  const duplicate = run(
    "n2-default",
    Buffer.from(`${String.fromCharCode(0x1e)}{"payload":{},"payload":{}}\n`, "utf8"),
  );
  assert.equal(duplicate.status, 1);
  assert.deepEqual(reports(duplicate)[0].issue_codes, ["input_duplicate_key"]);

  const third = run("n2-default", Buffer.concat([frame({}), frame({}), frame({})]));
  assert.equal(third.status, 1);
  assert.deepEqual(reports(third), [{
    profile_id: "n2-default",
    node: "N2",
    mode: "default",
    classification: "needs_human",
    attempt_count: 2,
    candidate_top_level_keys: null,
    exact_14_generated: false,
    issue_codes: ["attempt_limit_reached"],
  }]);
});

test("shared owner-first CLI import graph exposes no network, filesystem-write, or child-process capability", () => {
  const imports = sourceImportGraph(resolve(
    projectRoot,
    "src/neoloop/cli/owner-first-node-preview.ts",
  ));
  for (const forbidden of [
    "node:child_process",
    "node:http",
    "node:https",
    "node:http2",
    "node:net",
    "node:tls",
    "node:dns",
    "node:fs",
    "node:fs/promises",
    "node:worker_threads",
  ]) {
    assert.equal(imports.includes(forbidden), false, forbidden);
  }
});
