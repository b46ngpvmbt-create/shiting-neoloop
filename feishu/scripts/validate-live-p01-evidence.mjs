import { createHash } from "node:crypto";
import {
  closeSync,
  constants as fsConstants,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
  readdirSync,
} from "node:fs";
import { isAbsolute, join, parse, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { types as utilTypes } from "node:util";

export const LIVE_P01_EVIDENCE_MAX_BYTES = 128 * 1024;

const REPORT_SCHEMA_VERSION = "live_p01_evidence_report.v1";
const REPORT_SCOPE = "P01_redacted_live_evidence_only";
const FACT_CLASS = "synthetic_experiment";
const RESULT_SNAPSHOT_SHA256 = "4a85ff72b26042771919ea58096730be27573f8f381cb50145075cfd296b8a6b";
const ONSITE_SNAPSHOT_SHA256 = "dbb4ff1254f3471c22b921e836f24fe54c5ceecc2daf7edb42841acfab7389ad";
const RESULT_ROOT_TRUTH = Object.freeze({
  project: "石听 NeoLoop",
  fact_class: FACT_CLASS,
});
const RESULT_ROOT_STATE = Object.freeze({
  deployment_status: "temporary_base_probe_suite_in_progress",
  execution_status: "blocked",
  result: null,
});
const ONSITE_ROOT_TRUTH = Object.freeze({
  project: "石听 NeoLoop",
  team: "石听未来",
  fact_class: FACT_CLASS,
});

const REPORT_KEYS = Object.freeze([
  "schema_version",
  "scope",
  "fact_class",
  "result_input_sha256",
  "onsite_input_sha256",
  "p01_result_snapshot_sha256",
  "p01_onsite_snapshot_sha256",
  "validation_status",
  "p01_state_verified",
  "p01_result_null_verified",
  "p01_attempt_verified",
  "p01_evidence_identity_verified",
  "p01_evidence_binding_verified",
  "p01_evidence_entry_count",
  "historical_user_attestation_bound",
  "current_browser_metadata_bound",
  "reference_strings_bound",
  "reference_resolution_verified",
  "current_session_logged_out_verified",
  "refresh_completion_verified",
  "body_readability_after_refresh_verified",
  "edit_entry_absence_verified",
  "screenshot_evidence_count",
  "run_evidence_count",
  "fallback_verified",
  "p01_completion_verified",
  "anonymous_document_access_derived",
  "observation_truth_machine_verified",
  "business_write_count",
  "redaction_verified",
  "issue_codes",
]);

const ISSUE_CODES = Object.freeze([
  "input_transport",
  "duplicate_json_key",
  "invalid_json",
  "document_shape",
  "p01_record_shape",
  "onsite_record_shape",
  "p01_state",
  "p01_evidence_identity",
  "p01_evidence_binding",
  "p01_onsite_alignment",
  "p01_snapshot_drift",
  "p01_reference_binding",
  "p01_latest_fact",
  "sensitive_value",
  "completion_claim",
  "cli_arguments_forbidden",
  "report_shape",
]);

const RESULT_ROOT_KEYS = Object.freeze([
  "template_version",
  "project",
  "fact_class",
  "deployment_status",
  "execution_status",
  "result",
  "evidence",
  "status_contract",
  "result_record_contract",
  "resource_slots",
  "permission_probes",
  "business_views",
  "ai_nodes",
  "workflows",
  "logical_roles",
  "access_checks",
]);

const ONSITE_ROOT_KEYS = Object.freeze([
  "template_version",
  "project",
  "team",
  "source_manifest",
  "fact_class",
  "instructions",
  "machine_status_contract",
  "permission_evidence_index_contract",
  "permission_checks",
  "tables",
  "views",
  "ai_nodes",
  "workflows",
]);

const RESULT_P01_KEYS = Object.freeze([
  "unit_id",
  "name",
  "probe_ref",
  "evidence_unit_ref",
  "execution_status",
  "result",
  "evidence",
  "preconditions_observed",
  "expected_result_ref",
  "actual_action",
  "actual_result",
  "actual_time",
  "executor",
  "account_role",
  "limitations",
  "evidence_index",
  "fallback_path",
  "fallback_verified",
  "cleanup_result",
  "verifier",
]);

const ONSITE_P01_KEYS = Object.freeze([
  "key",
  "name",
  "status",
  "actual_action",
  "actual_time",
  "executor",
  "platform_account_role",
  "logical_business_role",
  "platform_role_mapping_status",
  "actual_result",
  "limitations",
  "fallback_verification_status",
  "fallback_actual_result",
  "verifier",
  "evidence_presence",
  "structured_evidence_index",
  "screenshot_indexes",
  "run_indexes",
  "redaction_status",
]);

const EVIDENCE_ROOT_KEYS = Object.freeze(["indexes", "r10_subchecks"]);
const EVIDENCE_ENTRY_KEYS = Object.freeze([
  "evidence_id",
  "observed_at",
  "actor_role",
  "redacted_storage_slot",
  "capture_phases",
  "redaction_checked",
]);
const EXPECTED_EVIDENCE_ENTRY = Object.freeze({
  evidence_id: "T2-EV-P01-20260808-1903-01",
  observed_at: "2026-08-08T19:03:33+08:00",
  actor_role: "participant_attestation_plus_controller_browser_operator",
  redacted_storage_slot: "controlled-slot-P01-anonymous-readonly-incomplete-01",
  capture_phases: Object.freeze(["before_action", "failure", "after_boundary"]),
  redaction_checked: true,
});

const EXPECTED_REFS = Object.freeze({
  probe_ref: "../manifests/day-1-probe-suite.v0.1.json#/probes/0",
  evidence_unit_ref: "./on-site-evidence-template.json#/permission_checks/0",
  expected_result_ref: "../manifests/day-1-probe-suite.v0.1.json#/probes/0/expected_result",
  fallback_path: "../manifests/day-1-probe-suite.v0.1.json#/probes/0/fallback_path",
});

const REQUIRED_RESULT_MARKERS = Object.freeze([
  "user_attested",
  "页面成功打开且刷新后的页面地址与标题稳定",
  "refresh_completion=unverified",
  "body_readability_after_refresh=unverified",
  "edit_entry_absence=unverified",
  "screenshot_capture=unavailable",
  "browser_secondary_session_navigation=not_established",
  "P01 固定 blocked/null",
  "不外推 completed/可用",
]);
const REQUIRED_CLEANUP_MARKERS = Object.freeze([
  "未更改分享设置",
  "无业务写",
  "无需飞书资源清理",
]);
const REQUIRED_ONSITE_INSTRUCTION_MARKERS = Object.freeze([
  "P01 历史匿名只读人工观察与本轮机器复验不完整停点",
  "P01、P03、P12、P13 均保持 blocked/null",
  "不代表匿名文档",
]);
const COMPLETION_PATTERNS = Object.freeze([
  /P01\s+completed/iu,
  /P01\s*(?:已完成|已通过)/u,
  /capability\s+(?:available|restricted|unavailable)/iu,
  /anonymous_document_access_derived\s*=\s*true/iu,
  /business_write_count\s*=\s*0/iu,
  /匿名访问已机器验证/u,
  /飞书作品文档已公开发布/u,
  /已接入新石器真实数据/u,
  /refresh_completion=verified/iu,
  /body_readability_after_refresh=verified/iu,
  /edit_entry_absence=verified/iu,
  /current_session_logged_out_verified/iu,
  /machine_verified/iu,
]);
const P01_DOCUMENT_COMPLETION_PATTERNS = Object.freeze([
  /P01\s*(?:=|:|：|-)?\s*(?:completed|machine_verified)\b/iu,
  /P01\s*(?:已完成|已通过)/u,
  /anonymous_document_access_derived\s*=\s*true/iu,
  /匿名(?:文档)?访问[^\n。；;]{0,24}(?:已机器验证|已验证|已完成|可用)/u,
  /refresh_completion=verified/iu,
  /body_readability_after_refresh=verified/iu,
  /edit_entry_absence=verified/iu,
]);
const SENSITIVE_RESOURCE_SLOTS = Object.freeze([
  "base_app_token",
  "anonymous_document_token",
  "self_built_app_id",
  "openapi_credential_ref",
  "unprivileged_account_ref",
  "lark_cli_profile",
]);
const CREDENTIAL_KEYS = new Set([
  "access_token",
  "refresh_token",
  "tenant_access_token",
  "user_access_token",
  "token",
  "authorization",
  "app_secret",
  "client_secret",
  "client_id",
  "app_id",
  "device_code",
  "qr_code",
  "cookie",
  "password",
  "credential",
]);
const SENSITIVE_VALUE_PATTERNS = Object.freeze([
  /(?:https?|feishu):\/\//iu,
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/iu,
  /\b(?:token|secret|authorization|bearer|cookie|password|credential)\s*[=:]/iu,
  /\b(?:(?:app|client|base|table|view|record|field)_?id|(?:device|qr)_?(?:id|code))\s*[=:]/iu,
  /\blocator\s*(?:[=:]|\()/iu,
  /\bprovider\s+raw(?:\s+error)?\s+[A-Z0-9_-]{6,}/iu,
  /\b(?:ou_|on_|oc_|cli_)[A-Za-z0-9]{8,}\b/u,
  /\bdoxcn[A-Za-z0-9]{8,}\b/u,
  /\b(?:app|bascn|tbl|rec|view|fld)(?=[A-Za-z0-9]{8,}\b)(?=[A-Za-z0-9]*[A-Z0-9])[A-Za-z0-9]+\b/u,
  /(?<![A-Za-z0-9])(?:\+?86[- ]?)?1[3-9][0-9]{9}(?![A-Za-z0-9])/u,
  /(?:^|\s)\/(?:Users|home|private|var|tmp)\//u,
]);

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const REPOSITORY_ROOT = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const FIXED_RESULT_PATH = resolve(
  REPOSITORY_ROOT,
  "feishu/evidence/live/2026-08-07-day-1-probe-results.redacted.json",
);
const FIXED_ONSITE_PATH = resolve(
  REPOSITORY_ROOT,
  "feishu/evidence/live/2026-08-07-on-site-evidence.redacted.json",
);

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function isPlainRecord(value) {
  return value !== null
    && typeof value === "object"
    && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}

function hasExactKeys(value, expectedKeys) {
  return isPlainRecord(value)
    && Object.getOwnPropertySymbols(value).length === 0
    && Object.keys(value).length === expectedKeys.length
    && expectedKeys.every((key) => Object.hasOwn(value, key));
}

function cloneDescriptorSafe(value, seen = new Set()) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value) || Object.is(value, -0)) throw new Error("invalid json value");
    return value;
  }
  if (typeof value !== "object" || utilTypes.isProxy(value) || seen.has(value)) {
    throw new Error("invalid json value");
  }
  const prototype = Object.getPrototypeOf(value);
  if (Array.isArray(value)) {
    if (prototype !== Array.prototype) throw new Error("invalid json value");
  } else if (prototype !== Object.prototype) {
    throw new Error("invalid json value");
  }
  if (Object.getOwnPropertySymbols(value).length !== 0) throw new Error("invalid json value");
  seen.add(value);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Object.keys(value);
  if (Array.isArray(value)) {
    if (Object.keys(descriptors).length !== keys.length + 1
      || !Object.hasOwn(descriptors, "length")) throw new Error("invalid json value");
    if (keys.length !== value.length || keys.some((key, index) => key !== String(index))) {
      throw new Error("invalid json value");
    }
    const output = [];
    for (const key of keys) {
      const descriptor = descriptors[key];
      if (!("value" in descriptor) || !descriptor.enumerable) throw new Error("invalid json value");
      output.push(cloneDescriptorSafe(descriptor.value, seen));
    }
    seen.delete(value);
    return output;
  }
  if (Object.keys(descriptors).length !== keys.length) throw new Error("invalid json value");
  const output = {};
  for (const key of keys) {
    const descriptor = descriptors[key];
    if (!("value" in descriptor) || !descriptor.enumerable) throw new Error("invalid json value");
    Object.defineProperty(output, key, {
      value: cloneDescriptorSafe(descriptor.value, seen),
      enumerable: true,
      writable: true,
      configurable: true,
    });
  }
  seen.delete(value);
  return output;
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    const output = {};
    for (const key of Object.keys(value).sort()) {
      Object.defineProperty(output, key, {
        value: canonicalize(value[key]),
        enumerable: true,
        writable: true,
        configurable: true,
      });
    }
    return output;
  }
  return value;
}

function canonicalSha256(value) {
  return sha256(Buffer.from(JSON.stringify(canonicalize(value)), "utf8"));
}

function deepEqual(left, right) {
  return JSON.stringify(canonicalize(left)) === JSON.stringify(canonicalize(right));
}

function addIssue(issues, code) {
  if (!issues.has(code)) issues.add(code);
}

function orderedIssues(issues) {
  return ISSUE_CODES.filter((code) => issues.has(code));
}

function makeReport({ resultInputSha256 = null, onsiteInputSha256 = null, issues = [] } = {}) {
  const passed = issues.length === 0;
  return {
    schema_version: REPORT_SCHEMA_VERSION,
    scope: REPORT_SCOPE,
    fact_class: FACT_CLASS,
    result_input_sha256: resultInputSha256,
    onsite_input_sha256: onsiteInputSha256,
    p01_result_snapshot_sha256: passed ? RESULT_SNAPSHOT_SHA256 : null,
    p01_onsite_snapshot_sha256: passed ? ONSITE_SNAPSHOT_SHA256 : null,
    validation_status: passed ? "passed" : "failed",
    p01_state_verified: passed,
    p01_result_null_verified: passed,
    p01_attempt_verified: passed,
    p01_evidence_identity_verified: passed,
    p01_evidence_binding_verified: passed,
    p01_evidence_entry_count: passed ? 1 : null,
    historical_user_attestation_bound: passed,
    current_browser_metadata_bound: passed,
    reference_strings_bound: passed,
    reference_resolution_verified: false,
    current_session_logged_out_verified: false,
    refresh_completion_verified: false,
    body_readability_after_refresh_verified: false,
    edit_entry_absence_verified: false,
    screenshot_evidence_count: passed ? 0 : null,
    run_evidence_count: passed ? 0 : null,
    fallback_verified: false,
    p01_completion_verified: false,
    anonymous_document_access_derived: false,
    observation_truth_machine_verified: false,
    business_write_count: null,
    redaction_verified: passed,
    issue_codes: issues,
  };
}

function failedReport(issue, resultInputSha256 = null, onsiteInputSha256 = null) {
  return makeReport({ resultInputSha256, onsiteInputSha256, issues: [issue] });
}

function scanSensitive(value) {
  if (Array.isArray(value)) return value.some(scanSensitive);
  if (isPlainRecord(value)) {
    return Object.entries(value).some(([key, child]) => (
      CREDENTIAL_KEYS.has(key.toLowerCase()) || scanSensitive(child)
    ));
  }
  return typeof value === "string" && SENSITIVE_VALUE_PATTERNS.some((pattern) => pattern.test(value));
}

function scanStringPatterns(value, patterns) {
  if (Array.isArray(value)) return value.some((entry) => scanStringPatterns(entry, patterns));
  if (isPlainRecord(value)) {
    return Object.values(value).some((entry) => scanStringPatterns(entry, patterns));
  }
  return typeof value === "string" && patterns.some((pattern) => pattern.test(value));
}

function scanCompletionClaim(value) {
  return scanStringPatterns(value, COMPLETION_PATTERNS);
}

function scanP01DocumentCompletionClaim(value) {
  return scanStringPatterns(value, P01_DOCUMENT_COMPLETION_PATTERNS);
}

function hasExactValues(value, expectedValues) {
  return isPlainRecord(value)
    && Object.entries(expectedValues).every(([key, expected]) => (
      Object.hasOwn(value, key) && value[key] === expected
    ));
}

function sensitiveResourceSlotsSafe(result) {
  const slots = isPlainRecord(result) ? result.resource_slots : null;
  return isPlainRecord(slots) && SENSITIVE_RESOURCE_SLOTS.every((key) => (
    Object.hasOwn(slots, key) && slots[key] === null
  ));
}

function evidenceShapeValid(value) {
  return hasExactKeys(value, EVIDENCE_ROOT_KEYS)
    && Array.isArray(value.indexes)
    && value.indexes.length === 1
    && value.r10_subchecks === null
    && hasExactKeys(value.indexes[0], EVIDENCE_ENTRY_KEYS);
}

function evidenceIdentityValid(value) {
  if (!evidenceShapeValid(value)) return false;
  return deepEqual(value.indexes[0], EXPECTED_EVIDENCE_ENTRY);
}

function stringIncludesAll(value, markers) {
  return typeof value === "string" && markers.every((marker) => value.includes(marker));
}

function allStrings(value) {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function resultP01ShapeValid(value) {
  return hasExactKeys(value, RESULT_P01_KEYS)
    && [
      value.unit_id,
      value.name,
      value.probe_ref,
      value.evidence_unit_ref,
      value.execution_status,
      value.expected_result_ref,
      value.actual_action,
      value.actual_result,
      value.actual_time,
      value.executor,
      value.account_role,
      value.limitations,
      value.fallback_path,
      value.cleanup_result,
      value.verifier,
    ].every((entry) => typeof entry === "string")
    && (value.result === null || typeof value.result === "string")
    && isPlainRecord(value.evidence)
    && isPlainRecord(value.evidence_index)
    && allStrings(value.preconditions_observed)
    && typeof value.fallback_verified === "boolean";
}

function onsiteP01ShapeValid(value) {
  return hasExactKeys(value, ONSITE_P01_KEYS)
    && [
      value.key,
      value.name,
      value.status,
      value.actual_action,
      value.actual_time,
      value.executor,
      value.platform_account_role,
      value.logical_business_role,
      value.platform_role_mapping_status,
      value.actual_result,
      value.limitations,
      value.fallback_verification_status,
      value.verifier,
      value.evidence_presence,
      value.redaction_status,
    ].every((entry) => typeof entry === "string")
    && value.fallback_actual_result === null
    && isPlainRecord(value.structured_evidence_index)
    && allStrings(value.screenshot_indexes)
    && allStrings(value.run_indexes);
}

function validateDocumentsInternal(resultDocument, onsiteDocument, inputDigests) {
  const issues = new Set();
  let result;
  let onsite;
  try {
    result = cloneDescriptorSafe(resultDocument);
    onsite = cloneDescriptorSafe(onsiteDocument);
  } catch {
    return failedReport("invalid_json", inputDigests.result, inputDigests.onsite);
  }

  if (!hasExactKeys(result, RESULT_ROOT_KEYS) || !hasExactKeys(onsite, ONSITE_ROOT_KEYS)) {
    addIssue(issues, "document_shape");
  }
  if (!hasExactValues(result, RESULT_ROOT_TRUTH) || !hasExactValues(onsite, ONSITE_ROOT_TRUTH)) {
    addIssue(issues, "document_shape");
  }
  if (!hasExactValues(result, RESULT_ROOT_STATE)) addIssue(issues, "p01_state");
  if (!stringIncludesAll(onsite?.instructions, REQUIRED_ONSITE_INSTRUCTION_MARKERS)) {
    addIssue(issues, "p01_latest_fact");
  }

  const resultCandidates = isPlainRecord(result) && Array.isArray(result.permission_probes)
    ? result.permission_probes.filter((entry) => isPlainRecord(entry) && entry.unit_id === "P01")
    : [];
  const onsiteCandidates = isPlainRecord(onsite) && Array.isArray(onsite.permission_checks)
    ? onsite.permission_checks.filter((entry) => isPlainRecord(entry) && entry.key === "P01")
    : [];
  if (resultCandidates.length !== 1 || !resultP01ShapeValid(resultCandidates[0])) {
    addIssue(issues, "p01_record_shape");
  }
  if (onsiteCandidates.length !== 1 || !onsiteP01ShapeValid(onsiteCandidates[0])) {
    addIssue(issues, "onsite_record_shape");
  }

  const p01 = resultCandidates.length === 1 ? resultCandidates[0] : null;
  const onsiteP01 = onsiteCandidates.length === 1 ? onsiteCandidates[0] : null;
  if (p01 && canonicalSha256(p01) !== RESULT_SNAPSHOT_SHA256) addIssue(issues, "p01_snapshot_drift");
  if (onsiteP01 && canonicalSha256(onsiteP01) !== ONSITE_SNAPSHOT_SHA256) addIssue(issues, "p01_snapshot_drift");

  if (p01 && onsiteP01) {
    if (p01.execution_status !== "blocked" || p01.result !== null || onsiteP01.status !== "已阻塞") {
      addIssue(issues, "p01_state");
    }
    if (
      typeof p01.actual_action !== "string" || p01.actual_action.length === 0
      || typeof p01.actual_result !== "string" || p01.actual_result.length === 0
      || typeof p01.actual_time !== "string" || p01.actual_time.length === 0
      || typeof p01.executor !== "string" || p01.executor.length === 0
      || typeof p01.account_role !== "string" || p01.account_role.length === 0
      || typeof p01.limitations !== "string" || p01.limitations.length === 0
      || typeof p01.cleanup_result !== "string" || p01.cleanup_result.length === 0
      || typeof p01.verifier !== "string" || p01.verifier.length === 0
    ) addIssue(issues, "p01_latest_fact");
    if (!stringIncludesAll(p01.actual_result, REQUIRED_RESULT_MARKERS)
      || !stringIncludesAll(p01.cleanup_result, REQUIRED_CLEANUP_MARKERS)) {
      addIssue(issues, "p01_latest_fact");
    }

    const evidenceSurfaces = [p01.evidence, p01.evidence_index, onsiteP01.structured_evidence_index];
    if (!evidenceSurfaces.every(evidenceShapeValid)
      || !deepEqual(evidenceSurfaces[0], evidenceSurfaces[1])
      || !deepEqual(evidenceSurfaces[1], evidenceSurfaces[2])) {
      addIssue(issues, "p01_evidence_binding");
    }
    if (!evidenceSurfaces.every(evidenceIdentityValid)) addIssue(issues, "p01_evidence_identity");

    const aligned = p01.actual_action === onsiteP01.actual_action
      && p01.actual_result === onsiteP01.actual_result
      && p01.actual_time === onsiteP01.actual_time
      && p01.executor === onsiteP01.executor
      && p01.account_role === onsiteP01.platform_account_role
      && p01.limitations === onsiteP01.limitations
      && p01.verifier === onsiteP01.verifier
      && p01.fallback_verified === false
      && onsiteP01.fallback_verification_status === "未测试"
      && onsiteP01.fallback_actual_result === null;
    if (!aligned) addIssue(issues, "p01_onsite_alignment");

    if (!Object.entries(EXPECTED_REFS).every(([key, value]) => p01[key] === value)) {
      addIssue(issues, "p01_reference_binding");
    }

    if (!Array.isArray(onsiteP01.screenshot_indexes)
      || onsiteP01.screenshot_indexes.length !== 0
      || !Array.isArray(onsiteP01.run_indexes)
      || onsiteP01.run_indexes.length !== 0
      || p01.fallback_verified !== false
      || onsiteP01.fallback_verification_status !== "未测试"
      || onsiteP01.fallback_actual_result !== null) {
      addIssue(issues, "completion_claim");
    }
  }

  if (!sensitiveResourceSlotsSafe(result) || scanSensitive(result) || scanSensitive(onsite)) {
    addIssue(issues, "sensitive_value");
  }
  if ((p01 && scanCompletionClaim(p01))
    || (onsiteP01 && scanCompletionClaim(onsiteP01))
    || scanCompletionClaim(onsite?.instructions)
    || scanP01DocumentCompletionClaim(result)
    || scanP01DocumentCompletionClaim(onsite)) {
    addIssue(issues, "completion_claim");
  }

  return makeReport({
    resultInputSha256: inputDigests.result,
    onsiteInputSha256: inputDigests.onsite,
    issues: orderedIssues(issues),
  });
}

export function validateLiveP01EvidenceDocuments(resultDocument, onsiteDocument) {
  let result;
  let onsite;
  try {
    result = cloneDescriptorSafe(resultDocument);
    onsite = cloneDescriptorSafe(onsiteDocument);
  } catch {
    return failedReport("invalid_json");
  }
  return validateDocumentsInternal(result, onsite, {
    result: canonicalSha256(result),
    onsite: canonicalSha256(onsite),
  });
}

function parseJsonWithDuplicateKeyCheck(text) {
  let index = 0;
  const length = text.length;
  const skipWhitespace = () => {
    while (index < length && /\s/u.test(text[index])) index += 1;
  };
  const parseString = () => {
    if (text[index] !== '"') throw new SyntaxError("string expected");
    const start = index;
    index += 1;
    while (index < length) {
      const character = text[index];
      if (character === '"') {
        index += 1;
        return JSON.parse(text.slice(start, index));
      }
      if (character === "\\") {
        index += 1;
        if (index >= length) throw new SyntaxError("invalid escape");
        if (text[index] === "u") {
          if (!/^[0-9a-fA-F]{4}$/u.test(text.slice(index + 1, index + 5))) {
            throw new SyntaxError("invalid unicode escape");
          }
          index += 5;
          continue;
        }
        if (!/["\\/bfnrt]/u.test(text[index])) throw new SyntaxError("invalid escape");
        index += 1;
        continue;
      }
      if (character.charCodeAt(0) < 0x20) throw new SyntaxError("control character");
      index += 1;
    }
    throw new SyntaxError("unterminated string");
  };
  const parseNumber = () => {
    const match = text.slice(index).match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/u);
    if (!match) throw new SyntaxError("number expected");
    index += match[0].length;
  };
  const parseValue = () => {
    skipWhitespace();
    const character = text[index];
    if (character === "{") return parseObject();
    if (character === "[") return parseArray();
    if (character === '"') { parseString(); return; }
    if (character === "-" || /\d/u.test(character ?? "")) { parseNumber(); return; }
    for (const literal of ["true", "false", "null"]) {
      if (text.startsWith(literal, index)) { index += literal.length; return; }
    }
    throw new SyntaxError("value expected");
  };
  const parseObject = () => {
    index += 1;
    const keys = new Set();
    skipWhitespace();
    if (text[index] === "}") { index += 1; return; }
    while (index < length) {
      skipWhitespace();
      const key = parseString();
      if (keys.has(key)) {
        const error = new SyntaxError("duplicate key");
        error.code = "DUPLICATE_JSON_KEY";
        throw error;
      }
      keys.add(key);
      skipWhitespace();
      if (text[index] !== ":") throw new SyntaxError("colon expected");
      index += 1;
      parseValue();
      skipWhitespace();
      if (text[index] === "}") { index += 1; return; }
      if (text[index] !== ",") throw new SyntaxError("comma expected");
      index += 1;
    }
    throw new SyntaxError("unterminated object");
  };
  const parseArray = () => {
    index += 1;
    skipWhitespace();
    if (text[index] === "]") { index += 1; return; }
    while (index < length) {
      parseValue();
      skipWhitespace();
      if (text[index] === "]") { index += 1; return; }
      if (text[index] !== ",") throw new SyntaxError("comma expected");
      index += 1;
    }
    throw new SyntaxError("unterminated array");
  };
  parseValue();
  skipWhitespace();
  if (index !== length) throw new SyntaxError("trailing content");
  return JSON.parse(text);
}

function validateTextsInternal(resultText, onsiteText, inputDigests) {
  let result;
  let onsite;
  try {
    result = parseJsonWithDuplicateKeyCheck(resultText);
    onsite = parseJsonWithDuplicateKeyCheck(onsiteText);
  } catch (error) {
    return failedReport(
      error?.code === "DUPLICATE_JSON_KEY" ? "duplicate_json_key" : "invalid_json",
      inputDigests.result,
      inputDigests.onsite,
    );
  }
  try {
    return validateDocumentsInternal(result, onsite, inputDigests);
  } catch {
    return failedReport("invalid_json", inputDigests.result, inputDigests.onsite);
  }
}

export function validateLiveP01EvidenceTexts(resultText, onsiteText) {
  if (typeof resultText !== "string" || typeof onsiteText !== "string") {
    return failedReport("input_transport");
  }
  const resultBuffer = Buffer.from(resultText, "utf8");
  const onsiteBuffer = Buffer.from(onsiteText, "utf8");
  if (resultBuffer.length > LIVE_P01_EVIDENCE_MAX_BYTES || onsiteBuffer.length > LIVE_P01_EVIDENCE_MAX_BYTES) {
    return failedReport("input_transport");
  }
  return validateTextsInternal(resultText, onsiteText, {
    result: sha256(resultBuffer),
    onsite: sha256(onsiteBuffer),
  });
}

export function validateLiveP01EvidenceBuffers(resultBuffer, onsiteBuffer) {
  if (!Buffer.isBuffer(resultBuffer) || !Buffer.isBuffer(onsiteBuffer)
    || resultBuffer.length > LIVE_P01_EVIDENCE_MAX_BYTES
    || onsiteBuffer.length > LIVE_P01_EVIDENCE_MAX_BYTES) {
    return failedReport("input_transport");
  }
  const inputDigests = {
    result: sha256(resultBuffer),
    onsite: sha256(onsiteBuffer),
  };
  try {
    const decoder = new TextDecoder("utf-8", { fatal: true });
    const resultText = decoder.decode(resultBuffer);
    const onsiteText = new TextDecoder("utf-8", { fatal: true }).decode(onsiteBuffer);
    return validateTextsInternal(resultText, onsiteText, inputDigests);
  } catch {
    return failedReport("input_transport", inputDigests.result, inputDigests.onsite);
  }
}

function statSignature(stat) {
  return [
    stat.dev,
    stat.ino,
    stat.mode,
    stat.size,
    stat.mtimeMs,
    stat.ctimeMs,
  ].join(":");
}

function componentsFromFilesystemRoot(path) {
  const parsed = parse(path);
  const remainder = path.slice(parsed.root.length).split(sep).filter(Boolean);
  const components = [parsed.root];
  let current = parsed.root;
  for (const part of remainder) {
    current = join(current, part);
    components.push(current);
  }
  return components;
}

function inspectExactChain(path) {
  if (!isAbsolute(path)) throw new Error("absolute path required");
  const components = componentsFromFilesystemRoot(path);
  const signatures = [];
  for (let index = 0; index < components.length; index += 1) {
    const current = components[index];
    const stat = lstatSync(current);
    if (stat.isSymbolicLink()) throw new Error("symlink rejected");
    if (index > 0) {
      const parent = components[index - 1];
      const name = current.slice(parent === sep ? 1 : parent.length + 1);
      if (!readdirSync(parent).includes(name)) throw new Error("case mismatch");
    }
    signatures.push(statSignature(stat));
  }
  return signatures;
}

function secureRead(path, trustedRoot) {
  const absolutePath = resolve(path);
  const absoluteRoot = resolve(trustedRoot);
  const relation = relative(absoluteRoot, absolutePath);
  if (relation === "" || relation === ".." || relation.startsWith(`..${sep}`) || isAbsolute(relation)) {
    throw new Error("path outside trusted root");
  }
  const rootBefore = inspectExactChain(absoluteRoot);
  const pathBefore = inspectExactChain(absolutePath);
  let descriptor;
  try {
    descriptor = openSync(absolutePath, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
    const before = fstatSync(descriptor);
    if (!before.isFile()
      || before.size > LIVE_P01_EVIDENCE_MAX_BYTES
      || statSignature(before) !== pathBefore.at(-1)) throw new Error("invalid file");
    const buffer = readFileSync(descriptor);
    const after = fstatSync(descriptor);
    if (statSignature(before) !== statSignature(after) || buffer.length !== after.size) {
      throw new Error("file changed while reading");
    }
    const rootAfter = inspectExactChain(absoluteRoot);
    const pathAfter = inspectExactChain(absolutePath);
    if (!deepEqual(rootBefore, rootAfter) || !deepEqual(pathBefore, pathAfter)) {
      throw new Error("path changed while reading");
    }
    return buffer;
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

export function validateLiveP01EvidenceFiles(resultPath, onsitePath, trustedRoot) {
  if (typeof resultPath !== "string" || typeof onsitePath !== "string" || typeof trustedRoot !== "string") {
    return failedReport("input_transport");
  }
  try {
    const resultBuffer = secureRead(resultPath, trustedRoot);
    const onsiteBuffer = secureRead(onsitePath, trustedRoot);
    return validateLiveP01EvidenceBuffers(resultBuffer, onsiteBuffer);
  } catch {
    return failedReport("input_transport");
  }
}

function reportShapeValid(report) {
  if (!hasExactKeys(report, REPORT_KEYS)
    || !deepEqual(Object.keys(report), REPORT_KEYS)
    || report.schema_version !== REPORT_SCHEMA_VERSION
    || report.scope !== REPORT_SCOPE
    || report.fact_class !== FACT_CLASS
    || ![report.result_input_sha256, report.onsite_input_sha256].every((value) => (
      value === null || (typeof value === "string" && /^[0-9a-f]{64}$/u.test(value))
    ))
    || !Array.isArray(report.issue_codes)
    || new Set(report.issue_codes).size !== report.issue_codes.length
    || report.issue_codes.some((code) => !ISSUE_CODES.includes(code))
    || !deepEqual(report.issue_codes, orderedIssues(new Set(report.issue_codes)))) {
    return false;
  }
  const passed = report.validation_status === "passed";
  if (!passed && report.validation_status !== "failed") return false;
  if (passed) {
    return [report.result_input_sha256, report.onsite_input_sha256].every((value) => (
      typeof value === "string" && /^[0-9a-f]{64}$/u.test(value)
    ))
      && report.issue_codes.length === 0
      && report.p01_result_snapshot_sha256 === RESULT_SNAPSHOT_SHA256
      && report.p01_onsite_snapshot_sha256 === ONSITE_SNAPSHOT_SHA256
      && report.p01_state_verified === true
      && report.p01_result_null_verified === true
      && report.p01_attempt_verified === true
      && report.p01_evidence_identity_verified === true
      && report.p01_evidence_binding_verified === true
      && report.p01_evidence_entry_count === 1
      && report.historical_user_attestation_bound === true
      && report.current_browser_metadata_bound === true
      && report.reference_strings_bound === true
      && report.reference_resolution_verified === false
      && report.current_session_logged_out_verified === false
      && report.refresh_completion_verified === false
      && report.body_readability_after_refresh_verified === false
      && report.edit_entry_absence_verified === false
      && report.screenshot_evidence_count === 0
      && report.run_evidence_count === 0
      && report.fallback_verified === false
      && report.p01_completion_verified === false
      && report.anonymous_document_access_derived === false
      && report.observation_truth_machine_verified === false
      && report.business_write_count === null
      && report.redaction_verified === true;
  }
  return report.issue_codes.length > 0
    && report.p01_result_snapshot_sha256 === null
    && report.p01_onsite_snapshot_sha256 === null
    && report.p01_state_verified === false
    && report.p01_result_null_verified === false
    && report.p01_attempt_verified === false
    && report.p01_evidence_identity_verified === false
    && report.p01_evidence_binding_verified === false
    && report.p01_evidence_entry_count === null
    && report.historical_user_attestation_bound === false
    && report.current_browser_metadata_bound === false
    && report.reference_strings_bound === false
    && report.reference_resolution_verified === false
    && report.current_session_logged_out_verified === false
    && report.refresh_completion_verified === false
    && report.body_readability_after_refresh_verified === false
    && report.edit_entry_absence_verified === false
    && report.screenshot_evidence_count === null
    && report.run_evidence_count === null
    && report.fallback_verified === false
    && report.p01_completion_verified === false
    && report.anonymous_document_access_derived === false
    && report.observation_truth_machine_verified === false
    && report.business_write_count === null
    && report.redaction_verified === false;
}

export function serializeLiveP01EvidenceReport(report) {
  let snapshot;
  try {
    snapshot = cloneDescriptorSafe(report);
  } catch {
    throw new TypeError("invalid report");
  }
  if (!reportShapeValid(snapshot) || scanSensitive(snapshot)) throw new TypeError("invalid report");
  return `${JSON.stringify(snapshot)}\n`;
}

function runCli() {
  const report = process.argv.length === 2
    ? validateLiveP01EvidenceFiles(FIXED_RESULT_PATH, FIXED_ONSITE_PATH, REPOSITORY_ROOT)
    : failedReport("cli_arguments_forbidden");
  process.stdout.write(serializeLiveP01EvidenceReport(report));
  process.exitCode = report.validation_status === "passed" ? 0 : 1;
}

if (resolve(process.argv[1] ?? "") === resolve(SCRIPT_PATH)) runCli();
