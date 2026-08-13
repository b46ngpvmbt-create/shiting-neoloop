import {
  closeSync,
  constants as fsConstants,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
} from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const LIVE_P12_P13_COMPLETION_MAX_BYTES = 128 * 1024;

const RESULT_URL = new URL(
  "../evidence/live/2026-08-10-p12-p13-completion.redacted.json",
  import.meta.url,
);
const ONSITE_URL = new URL(
  "../evidence/live/2026-08-10-p12-p13-onsite.redacted.json",
  import.meta.url,
);

const REPORT_KEYS = Object.freeze([
  "schema_version",
  "scope",
  "validation_status",
  "p12_completion_verified",
  "p13_completion_verified",
  "p12_result",
  "p13_result",
  "oauth_completion_count",
  "exact_scope_check_count",
  "wiki_resolver_success_count",
  "table_metadata_read_success_count",
  "field_list_success_count",
  "field_count",
  "write_precheck_zero_count",
  "record_create_count",
  "record_readback_count",
  "record_delete_count",
  "cleanup_zero_count",
  "business_write_count",
  "business_record_remaining_count",
  "application_binding_verified",
  "application_binding_candidate_count",
  "external_identifier_exposure_count",
  "evidence_binding_verified",
  "redaction_verified",
  "issue_codes",
]);

const ISSUE_ORDER = Object.freeze([
  "input_transport",
  "duplicate_json_key",
  "invalid_json",
  "document_shape",
  "evidence_binding",
  "p12_record_shape",
  "p13_record_shape",
  "p12_state",
  "p13_state",
  "p12_evidence_identity",
  "p13_evidence_identity",
  "p12_runtime_facts",
  "p13_runtime_facts",
  "redaction",
  "report_shape",
  "cli_arguments_forbidden",
]);
const ISSUE_SET = new Set(ISSUE_ORDER);

const ROOT_KEYS = Object.freeze(["schema_version", "project", "team", "fact_class", "records"]);
const RECORD_KEYS = Object.freeze([
  "unit_id",
  "execution_status",
  "result",
  "actual_time",
  "executor",
  "account_role",
  "evidence_index",
  "preconditions_observed",
  "actual_action",
  "actual_result",
  "limitations",
  "cleanup_result",
  "verifier",
]);
const EVIDENCE_OUTER_KEYS = Object.freeze(["indexes", "r10_subchecks"]);
const EVIDENCE_ENTRY_KEYS = Object.freeze([
  "evidence_id",
  "observed_at",
  "actor_role",
  "redacted_storage_slot",
  "capture_phases",
  "redaction_checked",
]);

const IDENTITIES = Object.freeze({
  P12: Object.freeze({
    evidence_id: "T2-EV-P12-20260810-1853-02",
    observed_at: "2026-08-10T18:53:48+08:00",
    actor_role: "controller_operator",
    redacted_storage_slot: "controlled-slot-P12-formal-base-reversible-write-01",
    capture_phases: Object.freeze(["before_action", "after_boundary"]),
  }),
  P13: Object.freeze({
    evidence_id: "T2-EV-P13-20260810-1853-02",
    observed_at: "2026-08-10T18:53:48+08:00",
    actor_role: "participant_operator",
    redacted_storage_slot: "controlled-slot-P13-cli-granular-oauth-and-base-io-01",
    capture_phases: Object.freeze(["before_action", "after_boundary"]),
  }),
});

const REQUIRED_MARKERS = Object.freeze({
  P12: Object.freeze([
    ["actual_action", "三次增量 OAuth 交易"],
    ["actual_action", "写前精确查询为 0"],
    ["actual_action", "串行创建恰好 1 条"],
    ["actual_action", "最后按同一标记复查为 0"],
    ["actual_result", "oauth_completion_count=3"],
    ["actual_result", "exact_scope_check_count=9"],
    ["actual_result", "field_count=40"],
    ["actual_result", "record_create_count=1"],
    ["actual_result", "record_readback_count=1"],
    ["actual_result", "record_delete_count=1"],
    ["actual_result", "cleanup_zero_count=1"],
    ["actual_result", "business_write_count=2"],
    ["actual_result", "business_record_remaining_count=0"],
    ["limitations", "未验证记录更新"],
    ["limitations", "未验证"],
    ["cleanup_result", "business_record_remaining_count=0"],
  ]),
  P13: Object.freeze([
    ["actual_action", "lark-cli 固定版本"],
    ["actual_action", "9 个 scope"],
    ["actual_action", "未运行 auth scopes"],
    ["actual_result", "cli_version=1.0.84"],
    ["actual_result", "profile_name_check=passed"],
    ["actual_result", "user_available=true"],
    ["actual_result", "user_verified=true"],
    ["actual_result", "overall_verified=true"],
    ["actual_result", "exact_scope_check_pass_count=9"],
    ["actual_result", "application_binding_check=machine_verified"],
    ["actual_result", "application_binding_candidate_count=1"],
    ["actual_result", "external_identifier_exposure_count=0"],
    ["limitations", "未验证 bot 或 tenant 身份"],
  ]),
});

class EvidenceError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function exactKeys(value, keys) {
  return value !== null
    && typeof value === "object"
    && !Array.isArray(value)
    && canonical(Object.keys(value).sort()) === canonical([...keys].sort());
}

function orderedIssues(issues) {
  return [...new Set(issues)].sort((a, b) => ISSUE_ORDER.indexOf(a) - ISSUE_ORDER.indexOf(b));
}

function failure(code) {
  const report = Object.fromEntries(REPORT_KEYS.map((key) => [key, null]));
  report.schema_version = "live_p12_p13_completion_report.v1";
  report.scope = "P12_P13_completed_restricted_redacted_evidence";
  report.validation_status = "failed";
  report.p12_completion_verified = false;
  report.p13_completion_verified = false;
  report.application_binding_verified = false;
  report.evidence_binding_verified = false;
  report.redaction_verified = false;
  report.issue_codes = orderedIssues([ISSUE_SET.has(code) ? code : "document_shape"]);
  return report;
}

function evidenceIdentityValid(record) {
  const expected = IDENTITIES[record?.unit_id];
  const outer = record?.evidence_index;
  if (!expected || !exactKeys(outer, EVIDENCE_OUTER_KEYS) || outer.r10_subchecks !== null
    || !Array.isArray(outer.indexes) || outer.indexes.length !== 1) return false;
  const entry = outer.indexes[0];
  return exactKeys(entry, EVIDENCE_ENTRY_KEYS)
    && entry.redaction_checked === true
    && canonical({ ...entry, redaction_checked: undefined }) === canonical({ ...expected, redaction_checked: undefined });
}

function markersValid(record) {
  return REQUIRED_MARKERS[record.unit_id].every(([field, marker]) => (
    typeof record[field] === "string" && record[field].includes(marker)
  ));
}

function recordShapeValid(record) {
  return exactKeys(record, RECORD_KEYS)
    && ["P12", "P13"].includes(record.unit_id)
    && typeof record.actual_time === "string"
    && typeof record.executor === "string"
    && typeof record.account_role === "string"
    && Array.isArray(record.preconditions_observed)
    && record.preconditions_observed.length >= 4
    && record.preconditions_observed.every((item) => typeof item === "string" && item.length > 0)
    && ["actual_action", "actual_result", "limitations", "cleanup_result", "verifier"]
      .every((key) => typeof record[key] === "string" && record[key].length > 0);
}

function redactionValid(documents) {
  const text = canonical(documents);
  const forbidden = [
    /https?:\/\//iu,
    /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/iu,
    /\b(?:access_token|refresh_token|app_secret|client_secret|device_code)\s*[:=]\s*["']?[^\s,"'}]{4,}/iu,
    /\b(?:app_token|table_id|record_id|view_id|field_id)\s*[:=]\s*["']?[A-Za-z0-9_-]{6,}/iu,
    /\b(?:ou_|on_|oc_|cli_)[A-Za-z0-9_-]{8,}\b/u,
    /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/iu,
    /(?<!\d)1[3-9]\d{9}(?!\d)/u,
  ];
  return forbidden.every((pattern) => !pattern.test(text));
}

export function validateLiveP12P13CompletionDocuments(resultDocument, onsiteDocument) {
  try {
    const issues = [];
    if (!exactKeys(resultDocument, ROOT_KEYS)
      || resultDocument.schema_version !== "neoloop.p12_p13.live_completion.v1"
      || resultDocument.project !== "石听 NeoLoop"
      || resultDocument.team !== "石听未来"
      || resultDocument.fact_class !== "synthetic_experiment"
      || !Array.isArray(resultDocument.records)
      || resultDocument.records.length !== 2) issues.push("document_shape");

    const bound = canonical(resultDocument) === canonical(onsiteDocument);
    if (!bound) issues.push("evidence_binding");

    const p12 = resultDocument?.records?.find((record) => record?.unit_id === "P12");
    const p13 = resultDocument?.records?.find((record) => record?.unit_id === "P13");
    if (!recordShapeValid(p12)) issues.push("p12_record_shape");
    if (!recordShapeValid(p13)) issues.push("p13_record_shape");
    if (p12?.execution_status !== "completed" || p12?.result !== "受限") issues.push("p12_state");
    if (p13?.execution_status !== "completed" || p13?.result !== "受限") issues.push("p13_state");
    if (!evidenceIdentityValid(p12)) issues.push("p12_evidence_identity");
    if (!evidenceIdentityValid(p13)) issues.push("p13_evidence_identity");
    if (!p12 || !markersValid(p12)) issues.push("p12_runtime_facts");
    if (!p13 || !markersValid(p13)) issues.push("p13_runtime_facts");
    const redacted = redactionValid([resultDocument, onsiteDocument]);
    if (!redacted) issues.push("redaction");

    if (issues.length > 0) return failure(orderedIssues(issues)[0]);
    return {
      schema_version: "live_p12_p13_completion_report.v1",
      scope: "P12_P13_completed_restricted_redacted_evidence",
      validation_status: "passed",
      p12_completion_verified: true,
      p13_completion_verified: true,
      p12_result: "受限",
      p13_result: "受限",
      oauth_completion_count: 3,
      exact_scope_check_count: 9,
      wiki_resolver_success_count: 1,
      table_metadata_read_success_count: 1,
      field_list_success_count: 1,
      field_count: 40,
      write_precheck_zero_count: 1,
      record_create_count: 1,
      record_readback_count: 1,
      record_delete_count: 1,
      cleanup_zero_count: 1,
      business_write_count: 2,
      business_record_remaining_count: 0,
      application_binding_verified: true,
      application_binding_candidate_count: 1,
      external_identifier_exposure_count: 0,
      evidence_binding_verified: true,
      redaction_verified: true,
      issue_codes: [],
    };
  } catch {
    return failure("document_shape");
  }
}

function inspectJson(text) {
  let index = 0;
  const fail = (code = "invalid_json") => { throw new EvidenceError(code); };
  const ws = () => { while (/\s/u.test(text[index] ?? "")) index += 1; };
  const string = () => {
    if (text[index] !== '"') fail();
    const start = index++;
    while (index < text.length) {
      if (text[index] === '"') {
        index += 1;
        try { return JSON.parse(text.slice(start, index)); } catch { fail(); }
      }
      if (text[index] === "\\") {
        index += 1;
        if (text[index] === "u") {
          if (!/^[0-9a-fA-F]{4}$/.test(text.slice(index + 1, index + 5))) fail();
          index += 5;
        } else {
          if (!['"', "\\", "/", "b", "f", "n", "r", "t"].includes(text[index])) fail();
          index += 1;
        }
      } else {
        if (text.charCodeAt(index) < 0x20) fail();
        index += 1;
      }
    }
    fail();
  };
  const value = () => {
    ws();
    if (text[index] === "{") {
      index += 1; ws(); const keys = new Set();
      if (text[index] === "}") { index += 1; return; }
      while (index < text.length) {
        const key = string();
        if (keys.has(key)) fail("duplicate_json_key");
        keys.add(key); ws(); if (text[index++] !== ":") fail(); value(); ws();
        if (text[index] === "}") { index += 1; return; }
        if (text[index++] !== ",") fail(); ws();
      }
      fail();
    }
    if (text[index] === "[") {
      index += 1; ws(); if (text[index] === "]") { index += 1; return; }
      while (index < text.length) {
        value(); ws(); if (text[index] === "]") { index += 1; return; }
        if (text[index++] !== ",") fail(); ws();
      }
      fail();
    }
    if (text[index] === '"') { string(); return; }
    for (const literal of ["true", "false", "null"]) {
      if (text.startsWith(literal, index)) { index += literal.length; return; }
    }
    const number = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(text.slice(index));
    if (!number) fail();
    index += number[0].length;
  };
  ws(); value(); ws(); if (index !== text.length) fail();
}

export function validateLiveP12P13CompletionTexts(resultText, onsiteText) {
  if (typeof resultText !== "string" || typeof onsiteText !== "string"
    || Buffer.byteLength(resultText) > LIVE_P12_P13_COMPLETION_MAX_BYTES
    || Buffer.byteLength(onsiteText) > LIVE_P12_P13_COMPLETION_MAX_BYTES) return failure("input_transport");
  try {
    inspectJson(resultText);
    inspectJson(onsiteText);
    return validateLiveP12P13CompletionDocuments(JSON.parse(resultText), JSON.parse(onsiteText));
  } catch (error) {
    return failure(error instanceof EvidenceError ? error.code : "invalid_json");
  }
}

export function validateLiveP12P13CompletionBuffers(resultBuffer, onsiteBuffer) {
  if (!Buffer.isBuffer(resultBuffer) || !Buffer.isBuffer(onsiteBuffer)
    || resultBuffer.length > LIVE_P12_P13_COMPLETION_MAX_BYTES
    || onsiteBuffer.length > LIVE_P12_P13_COMPLETION_MAX_BYTES) return failure("input_transport");
  try {
    const decoder = new TextDecoder("utf-8", { fatal: true });
    return validateLiveP12P13CompletionTexts(decoder.decode(resultBuffer), decoder.decode(onsiteBuffer));
  } catch {
    return failure("input_transport");
  }
}

function secureRead(pathArgument) {
  if (typeof pathArgument !== "string" || !pathArgument.endsWith(".redacted.json")) {
    throw new EvidenceError("input_transport");
  }
  const path = resolve(pathArgument);
  const entry = lstatSync(path);
  if (!entry.isFile() || entry.isSymbolicLink() || entry.size > LIVE_P12_P13_COMPLETION_MAX_BYTES) {
    throw new EvidenceError("input_transport");
  }
  let descriptor;
  try {
    descriptor = openSync(path, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
    const opened = fstatSync(descriptor);
    if (!opened.isFile() || opened.size > LIVE_P12_P13_COMPLETION_MAX_BYTES
      || opened.dev !== entry.dev || opened.ino !== entry.ino) throw new EvidenceError("input_transport");
    return readFileSync(descriptor);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

export function validateLiveP12P13CompletionFiles(resultPath, onsitePath) {
  try {
    return validateLiveP12P13CompletionBuffers(secureRead(resultPath), secureRead(onsitePath));
  } catch {
    return failure("input_transport");
  }
}

function reportValid(report) {
  return exactKeys(report, REPORT_KEYS)
    && report.schema_version === "live_p12_p13_completion_report.v1"
    && report.scope === "P12_P13_completed_restricted_redacted_evidence"
    && ["passed", "failed"].includes(report.validation_status)
    && Array.isArray(report.issue_codes)
    && report.issue_codes.every((code) => ISSUE_SET.has(code));
}

export function serializeLiveP12P13CompletionReport(report) {
  const selected = reportValid(report) ? report : failure("report_shape");
  return JSON.stringify(Object.fromEntries(REPORT_KEYS.map((key) => [key, selected[key]])), null, 2);
}

function main() {
  const report = process.argv.length === 2
    ? validateLiveP12P13CompletionFiles(fileURLToPath(RESULT_URL), fileURLToPath(ONSITE_URL))
    : failure("cli_arguments_forbidden");
  process.stdout.write(`${serializeLiveP12P13CompletionReport(report)}\n`);
  process.exitCode = report.validation_status === "passed" ? 0 : 1;
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isCli) main();
