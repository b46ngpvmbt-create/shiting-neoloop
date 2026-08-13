import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

import {
  LIVE_P12_P13_COMPLETION_MAX_BYTES,
  serializeLiveP12P13CompletionReport,
  validateLiveP12P13CompletionBuffers,
  validateLiveP12P13CompletionDocuments,
  validateLiveP12P13CompletionFiles,
  validateLiveP12P13CompletionTexts,
} from "../../feishu/scripts/validate-live-p12-p13-completion.mjs";

const resultPath = resolve(
  import.meta.dirname,
  "../../feishu/evidence/live/2026-08-10-p12-p13-completion.redacted.json",
);
const onsitePath = resolve(
  import.meta.dirname,
  "../../feishu/evidence/live/2026-08-10-p12-p13-onsite.redacted.json",
);
const scriptPath = resolve(
  import.meta.dirname,
  "../../feishu/scripts/validate-live-p12-p13-completion.mjs",
);

function documents() {
  return {
    result: JSON.parse(readFileSync(resultPath, "utf8")),
    onsite: JSON.parse(readFileSync(onsitePath, "utf8")),
  };
}

function mutateBoth(unitId, mutate) {
  const docs = documents();
  for (const doc of [docs.result, docs.onsite]) {
    mutate(doc.records.find((record) => record.unit_id === unitId));
  }
  return validateLiveP12P13CompletionDocuments(docs.result, docs.onsite);
}

function assertFailed(report, code) {
  assert.equal(report.validation_status, "failed");
  assert.equal(report.p12_completion_verified, false);
  assert.equal(report.p13_completion_verified, false);
  assert.equal(report.issue_codes.includes(code), true);
}

test("fixed P12/P13 completion evidence passes with exact restricted metrics", () => {
  const docs = documents();
  const report = validateLiveP12P13CompletionDocuments(docs.result, docs.onsite);
  assert.equal(report.validation_status, "passed");
  assert.equal(report.p12_completion_verified, true);
  assert.equal(report.p13_completion_verified, true);
  assert.equal(report.p12_result, "受限");
  assert.equal(report.p13_result, "受限");
  assert.equal(report.oauth_completion_count, 3);
  assert.equal(report.exact_scope_check_count, 9);
  assert.equal(report.field_count, 40);
  assert.equal(report.record_create_count, 1);
  assert.equal(report.record_readback_count, 1);
  assert.equal(report.record_delete_count, 1);
  assert.equal(report.cleanup_zero_count, 1);
  assert.equal(report.business_write_count, 2);
  assert.equal(report.business_record_remaining_count, 0);
  assert.equal(report.application_binding_verified, true);
  assert.equal(report.evidence_binding_verified, true);
  assert.equal(report.redaction_verified, true);
  assert.deepEqual(report.issue_codes, []);
  assert.deepEqual(Object.keys(JSON.parse(serializeLiveP12P13CompletionReport(report))), Object.keys(report));
});

test("the two evidence surfaces must remain identical", () => {
  const docs = documents();
  docs.onsite.records[0].cleanup_result += " drift";
  assertFailed(validateLiveP12P13CompletionDocuments(docs.result, docs.onsite), "evidence_binding");
});

test("P12 and P13 completion states fail closed", async (t) => {
  for (const unitId of ["P12", "P13"]) {
    await t.test(`${unitId}_status`, () => {
      const report = mutateBoth(unitId, (record) => { record.execution_status = "blocked"; });
      assertFailed(report, unitId === "P12" ? "p12_state" : "p13_state");
    });
    await t.test(`${unitId}_result`, () => {
      const report = mutateBoth(unitId, (record) => { record.result = "可用"; });
      assertFailed(report, unitId === "P12" ? "p12_state" : "p13_state");
    });
  }
});

test("evidence identities are frozen", async (t) => {
  for (const unitId of ["P12", "P13"]) {
    await t.test(unitId, () => {
      const report = mutateBoth(unitId, (record) => {
        record.evidence_index.indexes[0].evidence_id += "-drift";
      });
      assertFailed(report, unitId === "P12" ? "p12_evidence_identity" : "p13_evidence_identity");
    });
  }
});

test("required runtime facts cannot be removed", () => {
  const report = mutateBoth("P12", (record) => {
    record.actual_result = record.actual_result.replace("field_count=40", "field_count=39");
  });
  assertFailed(report, "p12_runtime_facts");
});

test("sensitive values fail redaction and never echo in the report", () => {
  const sentinel = "https://example.invalid/private?access_token=super-secret-value";
  const docs = documents();
  for (const doc of [docs.result, docs.onsite]) doc.records[0].actual_action += ` ${sentinel}`;
  const report = validateLiveP12P13CompletionDocuments(docs.result, docs.onsite);
  assertFailed(report, "redaction");
  assert.equal(serializeLiveP12P13CompletionReport(report).includes(sentinel), false);
});

test("duplicate keys, invalid UTF-8 and oversized input fail at transport", () => {
  const text = readFileSync(resultPath, "utf8");
  const duplicate = text.replace("{", '{"schema_version":"duplicate",');
  assertFailed(validateLiveP12P13CompletionTexts(duplicate, text), "duplicate_json_key");
  assertFailed(
    validateLiveP12P13CompletionBuffers(Buffer.from([0xc3, 0x28]), Buffer.from(text)),
    "input_transport",
  );
  assertFailed(
    validateLiveP12P13CompletionTexts("x".repeat(LIVE_P12_P13_COMPLETION_MAX_BYTES + 1), text),
    "input_transport",
  );
});

test("secure file reads reject symlinks", () => {
  const directory = mkdtempSync(join(tmpdir(), "neoloop-live-completion-"));
  try {
    const target = join(directory, "target.redacted.json");
    const link = join(directory, "link.redacted.json");
    writeFileSync(target, readFileSync(resultPath));
    symlinkSync(target, link);
    assertFailed(validateLiveP12P13CompletionFiles(link, onsitePath), "input_transport");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("CLI accepts no input paths and rejects every extra argument", () => {
  const success = spawnSync(process.execPath, [scriptPath], { encoding: "utf8" });
  assert.equal(success.status, 0, success.stderr || success.stdout);
  assert.equal(JSON.parse(success.stdout).validation_status, "passed");

  const rejected = spawnSync(process.execPath, [scriptPath, resultPath], { encoding: "utf8" });
  assert.equal(rejected.status, 1);
  assert.deepEqual(JSON.parse(rejected.stdout).issue_codes, ["cli_arguments_forbidden"]);
});
