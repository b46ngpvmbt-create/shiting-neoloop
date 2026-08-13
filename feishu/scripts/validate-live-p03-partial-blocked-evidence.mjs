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
import {
  isAbsolute,
  join,
  parse,
  relative,
  resolve,
  sep,
} from "node:path";
import { fileURLToPath } from "node:url";

export const LIVE_P03_PARTIAL_BLOCKED_MAX_BYTES = 128 * 1024;

const RESULT_LIVE_URL = new URL(
  "../evidence/live/2026-08-07-day-1-probe-results.redacted.json",
  import.meta.url,
);
const ONSITE_LIVE_URL = new URL(
  "../evidence/live/2026-08-07-on-site-evidence.redacted.json",
  import.meta.url,
);
const TRUSTED_PROJECT_ROOT_URL = new URL("../../", import.meta.url);

const REPORT_SCHEMA_VERSION = "live_p03_partial_blocked_evidence_report.v1";
const REPORT_SCOPE = "P03_partial_blocked_redacted_live_evidence_only";
const FACT_CLASS = "synthetic_experiment";

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

const RESULT_P03_KEYS = Object.freeze([
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

const RESULT_A02_KEYS = Object.freeze([
  "unit_id",
  "logical_key",
  "name",
  "probe_ref",
  "execution_status",
  "result",
  "evidence",
  "actual_action",
  "actual_time",
  "executor",
  "account_role",
  "limitations",
  "cleanup_result",
  "verifier",
]);

const ONSITE_P03_KEYS = Object.freeze([
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
  "p03_phase_observations",
  "p03_phase_binding_contract",
  "screenshot_indexes",
  "run_indexes",
  "redaction_status",
  "r10_recurrence_visibility_and_attestation_evidence_contract",
]);

const PHASE_KEYS = Object.freeze([
  "prebuild_gate",
  "postbuild_five_view_direct_table_recheck",
]);
const PREBUILD_KEYS = Object.freeze([
  "execution_status",
  "result",
  "evidence_index",
  "actual_action",
  "actual_result",
  "actual_time",
  "actual_prebuild_proof",
]);
const POSTBUILD_KEYS = Object.freeze([
  "execution_status",
  "result",
  "evidence_index",
  "actual_action",
  "actual_result",
  "actual_time",
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

const EXPECTED_EVIDENCE_IDENTITY = Object.freeze({
  evidence_id: "T2-EV-P03-20260808-1126-01",
  observed_at: "2026-08-08T11:26:07+08:00",
  actor_role: "owner_operator",
  redacted_storage_slot: "controlled-slot-P03-first-permission-action-01",
  capture_phases: Object.freeze(["prebuild_gate"]),
});
const EXPECTED_PRECONDITIONS_SHA256 = "c3f8e21b88fb4cd2e376bf2dd5c3dbba6a8aea9926f821b6320fb00a5cd0368a";
const EXPECTED_RESULT_P03_SNAPSHOT_SHA256 = "842fcdcacd1febb0a510e3aa88d7f15939185fc62559bf93048e214e326619b5";
const EXPECTED_ONSITE_P03_SNAPSHOT_SHA256 = "36d4f18d156ccb9a896507ce6986cce913213fae7ddc66637c47502c95c8fbba";
const EXPECTED_RESULT_A02_SNAPSHOT_SHA256 = "0078573142e1b36ea0b752c025b87484ad48233abacdacff18662c3fc7e6af97";

const RECURRENCE_NULL_FIELDS = Object.freeze([
  "actual_all_five_business_views_result",
  "actual_direct_clusters_table_result",
  "actual_recurrence_visibility_no_broader_than_source_fields_result",
  "attestation_id_digest",
  "capability_attestation_sha256",
  "permission_snapshot_sha256",
  "permission_revision",
  "issued_at",
  "expires_at",
  "capability_checked_at",
  "capability_rechecked_at",
  "actual_prewrite_recheck_result",
  "actual_drift_or_expiry_injection_result",
]);

const SAFE_STOP_MARKERS = Object.freeze([
  Object.freeze({ field: "actual_result", marker: "已回退" }),
  Object.freeze({ field: "actual_result", marker: "保持关闭" }),
  Object.freeze({ field: "actual_result", marker: "未复制" }),
  Object.freeze({ field: "cleanup_result", marker: "未发送" }),
  Object.freeze({ field: "actual_result", marker: "未邀请" }),
  Object.freeze({ field: "actual_result", marker: "未建立" }),
  Object.freeze({ field: "actual_result", marker: "外部访问" }),
  Object.freeze({ field: "actual_result", marker: "业务字段" }),
  Object.freeze({ field: "actual_result", marker: "反馈归属" }),
  Object.freeze({ field: "actual_result", marker: "关联关系" }),
  Object.freeze({ field: "actual_result", marker: "等值" }),
  Object.freeze({ field: "limitations", marker: "未完成" }),
  Object.freeze({ field: "actual_result", marker: "第二身份" }),
  Object.freeze({ field: "actual_result", marker: "受保护" }),
  Object.freeze({ field: "actual_result", marker: "修改" }),
  Object.freeze({ field: "actual_result", marker: "撤权" }),
  Object.freeze({ field: "actual_result", marker: "刷新" }),
  Object.freeze({ field: "actual_result", marker: "重登" }),
  Object.freeze({ field: "actual_result", marker: "未执行" }),
]);

const ISSUE_CODE_ORDER = Object.freeze([
  "a02_snapshot_drift",
  "a02_state",
  "cli_arguments_forbidden",
  "document_shape",
  "downstream_projection_claim",
  "duplicate_json_key",
  "input_transport",
  "invalid_json",
  "onsite_record_shape",
  "p03_completion_claim",
  "p03_evidence_binding",
  "p03_evidence_identity",
  "p03_onsite_alignment",
  "p03_parent_state",
  "p03_phase_state",
  "p03_record_shape",
  "p03_snapshot_drift",
  "postbuild_claim",
  "prebuild_proof_claim",
  "report_shape",
  "safe_stop_claims",
  "sensitive_value",
]);
const ISSUE_CODE_SET = new Set(ISSUE_CODE_ORDER);

const REPORT_KEYS = Object.freeze([
  "schema_version",
  "scope",
  "fact_class",
  "result_input_sha256",
  "onsite_input_sha256",
  "validation_status",
  "p03_parent_blocked_verified",
  "p03_prebuild_blocked_verified",
  "p03_partial_attempt_verified",
  "p03_full_event_trace_verified",
  "p03_full_prebuild_proof_verified",
  "p03_postbuild_not_tested_verified",
  "p03_completion_verified",
  "p03_evidence_identity_verified",
  "p03_evidence_binding_verified",
  "p03_evidence_entry_count",
  "safe_stop_claims_bound",
  "a02_not_tested_verified",
  "unprivileged_access_capability_derived",
  "formal_build_gate_open",
  "automatic_retry_allowed",
  "observation_truth_machine_verified",
  "business_write_count",
  "redaction_verified",
  "issue_codes",
]);

const SENSITIVE_VALUE_PATTERNS = Object.freeze([
  /https?:\/\//iu,
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/iu,
  /\bbearer\s+\S+/iu,
  /\b(?:access|refresh)[_ -]?token\s*[:=]\s*\S+/iu,
  /\btoken\s*[:=]\s*\S+/iu,
  /\b(?:app|client)[_ -]?secret\s*[:=]\s*\S+/iu,
  /\bapp[_ -]?id\s*[:=]\s*\S+/iu,
  /\bdevice[_ -]?code\s*[:=]\s*\S+/iu,
  /\b(?:base|table|view|record|field)[_ -]?id\s*[:=]\s*\S+/iu,
  /\blocator\s*[:=]\s*\S+/iu,
  /provider\s+raw\s+error\s+\S+/iu,
  /\b(?:ou_|on_|oc_|cli_)[A-Za-z0-9]{8,}\b/u,
  /\b(?:app|tbl|rec|view|fld)(?=[A-Za-z0-9]{8,}\b)(?=[A-Za-z0-9]*[A-Z0-9])[A-Za-z0-9]+\b/u,
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/iu,
  /\b1[3-9]\d{9}\b/u,
]);

const FORBIDDEN_PROJECTION_PATTERNS = Object.freeze([
  /\bP03\s+completed\b/iu,
  /\bcapability\s+(?:available|restricted|unavailable)\b/iu,
  /\bbusiness_write_count\s*=\s*0\b/iu,
  /\bformal_build_gate_open\s*=\s*true\b/iu,
  /\bunprivileged_access_capability_derived\s*=\s*true\b/iu,
  /(?:无特权访问|第二身份).{0,12}(?:已通过|已验证|可用)/u,
  /零业务写.{0,12}(?:已确认|已验证|为\s*0)/u,
  /正式建设门.{0,12}(?:已打开|已通过|开放)/u,
  /已接入企业真实数据/u,
  /系统已生产上线/u,
  /OpenAPI\s*调用成功/iu,
  /真实业务收益已验证/u,
]);

class JsonInspectionError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

function isPlainObject(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function exactOwnKeys(value, keys) {
  return isPlainObject(value)
    && Object.getOwnPropertySymbols(value).length === 0
    && Object.keys(value).length === keys.length
    && keys.every((key) => Object.hasOwn(value, key));
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]),
    );
  }
  return value;
}

function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

function inputSha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function snapshotDigestMatches(value, expectedDigest) {
  return isPlainObject(value)
    && inputSha256(Buffer.from(canonicalJson(value), "utf8")) === expectedDigest;
}

function sortedIssueCodes(codes) {
  return [...new Set(codes)].filter((code) => ISSUE_CODE_SET.has(code)).sort();
}

function emptyMetrics() {
  return {
    p03_parent_blocked_verified: false,
    p03_prebuild_blocked_verified: false,
    p03_partial_attempt_verified: false,
    p03_full_event_trace_verified: false,
    p03_full_prebuild_proof_verified: false,
    p03_postbuild_not_tested_verified: false,
    p03_completion_verified: false,
    p03_evidence_identity_verified: false,
    p03_evidence_binding_verified: false,
    p03_evidence_entry_count: null,
    safe_stop_claims_bound: false,
    a02_not_tested_verified: false,
    unprivileged_access_capability_derived: false,
    formal_build_gate_open: false,
    automatic_retry_allowed: false,
    observation_truth_machine_verified: false,
    business_write_count: null,
    redaction_verified: false,
  };
}

function makeReport(metrics, issueCodes, digests = {}) {
  const issues = sortedIssueCodes(issueCodes);
  return {
    schema_version: REPORT_SCHEMA_VERSION,
    scope: REPORT_SCOPE,
    fact_class: FACT_CLASS,
    result_input_sha256: digests.result ?? null,
    onsite_input_sha256: digests.onsite ?? null,
    validation_status: issues.length === 0 ? "passed" : "failed",
    p03_parent_blocked_verified: metrics.p03_parent_blocked_verified,
    p03_prebuild_blocked_verified: metrics.p03_prebuild_blocked_verified,
    p03_partial_attempt_verified: metrics.p03_partial_attempt_verified,
    p03_full_event_trace_verified: false,
    p03_full_prebuild_proof_verified: false,
    p03_postbuild_not_tested_verified: metrics.p03_postbuild_not_tested_verified,
    p03_completion_verified: false,
    p03_evidence_identity_verified: metrics.p03_evidence_identity_verified,
    p03_evidence_binding_verified: metrics.p03_evidence_binding_verified,
    p03_evidence_entry_count: metrics.p03_evidence_entry_count,
    safe_stop_claims_bound: metrics.safe_stop_claims_bound,
    a02_not_tested_verified: metrics.a02_not_tested_verified,
    unprivileged_access_capability_derived: false,
    formal_build_gate_open: false,
    automatic_retry_allowed: false,
    observation_truth_machine_verified: false,
    business_write_count: null,
    redaction_verified: metrics.redaction_verified,
    issue_codes: issues,
  };
}

function fixedFailure(issueCode, digests = {}) {
  return makeReport(emptyMetrics(), [issueCode], digests);
}

function isNonemptyString(value) {
  return typeof value === "string" && value.length > 0;
}

function isIsoTimestampWithTimezone(value) {
  return typeof value === "string"
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/u.test(value)
    && !Number.isNaN(Date.parse(value));
}

function evidenceIdentityMatches(evidenceIndex) {
  if (!exactOwnKeys(evidenceIndex, EVIDENCE_OUTER_KEYS)
    || !Array.isArray(evidenceIndex.indexes)
    || evidenceIndex.indexes.length !== 1
    || evidenceIndex.r10_subchecks !== null) return false;

  const entry = evidenceIndex.indexes[0];
  return exactOwnKeys(entry, EVIDENCE_ENTRY_KEYS)
    && entry.evidence_id === EXPECTED_EVIDENCE_IDENTITY.evidence_id
    && entry.observed_at === EXPECTED_EVIDENCE_IDENTITY.observed_at
    && entry.actor_role === EXPECTED_EVIDENCE_IDENTITY.actor_role
    && entry.redacted_storage_slot === EXPECTED_EVIDENCE_IDENTITY.redacted_storage_slot
    && canonicalJson(entry.capture_phases)
      === canonicalJson(EXPECTED_EVIDENCE_IDENTITY.capture_phases)
    && entry.redaction_checked === true;
}

function preconditionsMatch(values) {
  return Array.isArray(values)
    && values.length === 4
    && values.every(isNonemptyString)
    && inputSha256(Buffer.from(canonicalJson(values), "utf8"))
      === EXPECTED_PRECONDITIONS_SHA256;
}

function parentBlockedMatches(record) {
  return exactOwnKeys(record, RESULT_P03_KEYS)
    && record.unit_id === "P03"
    && record.execution_status === "blocked"
    && record.result === null
    && isPlainObject(record.evidence)
    && preconditionsMatch(record.preconditions_observed)
    && isNonemptyString(record.actual_action)
    && isNonemptyString(record.actual_result)
    && isIsoTimestampWithTimezone(record.actual_time)
    && isNonemptyString(record.executor)
    && isNonemptyString(record.account_role)
    && isNonemptyString(record.limitations)
    && isPlainObject(record.evidence_index)
    && record.fallback_verified === false
    && isNonemptyString(record.cleanup_result)
    && isNonemptyString(record.verifier);
}

function a02NotTestedMatches(record) {
  return exactOwnKeys(record, RESULT_A02_KEYS)
    && record.unit_id === "A02"
    && isNonemptyString(record.logical_key)
    && record.execution_status === "not_tested"
    && record.result === null
    && record.evidence === null
    && record.actual_action === null
    && record.actual_time === null
    && record.executor === null
    && record.account_role === null
    && record.limitations === null
    && record.cleanup_result === null
    && record.verifier === null;
}

function recurrenceRemainsUntested(contract) {
  return isPlainObject(contract)
    && contract.creates_new_evidence_unit === false
    && RECURRENCE_NULL_FIELDS.every((field) => (
      Object.hasOwn(contract, field) && contract[field] === null
    ));
}

function onsiteRecordShapeMatches(record) {
  return exactOwnKeys(record, ONSITE_P03_KEYS)
    && record.key === "P03"
    && exactOwnKeys(record.p03_phase_observations, PHASE_KEYS)
    && isPlainObject(record.p03_phase_binding_contract)
    && record.p03_phase_binding_contract.independent_fourth_truth_forbidden === true
    && recurrenceRemainsUntested(
      record.r10_recurrence_visibility_and_attestation_evidence_contract,
    );
}

function prebuildBlockedMatches(phase) {
  return exactOwnKeys(phase, PREBUILD_KEYS)
    && phase.execution_status === "blocked"
    && phase.result === null
    && isPlainObject(phase.evidence_index)
    && isNonemptyString(phase.actual_action)
    && isNonemptyString(phase.actual_result)
    && isIsoTimestampWithTimezone(phase.actual_time)
    && phase.actual_prebuild_proof === null;
}

function postbuildNotTestedMatches(phase) {
  return exactOwnKeys(phase, POSTBUILD_KEYS)
    && phase.execution_status === "not_tested"
    && phase.result === null
    && phase.evidence_index === null
    && phase.actual_action === null
    && phase.actual_result === null
    && phase.actual_time === null;
}

function onsiteAlignmentMatches(resultRecord, onsiteRecord) {
  return onsiteRecord?.status === "已阻塞"
    && onsiteRecord.actual_action === resultRecord?.actual_action
    && onsiteRecord.actual_result === resultRecord?.actual_result
    && onsiteRecord.actual_time === resultRecord?.actual_time
    && onsiteRecord.executor === resultRecord?.executor
    && onsiteRecord.platform_account_role === resultRecord?.account_role
    && onsiteRecord.logical_business_role === null
    && isNonemptyString(onsiteRecord.platform_role_mapping_status)
    && onsiteRecord.limitations === resultRecord?.limitations
    && onsiteRecord.fallback_verification_status === "未测试"
    && onsiteRecord.fallback_actual_result === null
    && onsiteRecord.verifier === resultRecord?.verifier
    && onsiteRecord.evidence_presence === "已记录"
    && Array.isArray(onsiteRecord.screenshot_indexes)
    && onsiteRecord.screenshot_indexes.length === 0
    && Array.isArray(onsiteRecord.run_indexes)
    && onsiteRecord.run_indexes.length === 0
    && onsiteRecord.redaction_status === "已复核";
}

function safeStopClaimsMatch(record) {
  return SAFE_STOP_MARKERS.every(({ field, marker }) => (
    typeof record?.[field] === "string" && record[field].includes(marker)
  ));
}

function containsPattern(roots, patterns) {
  const pending = [...roots];
  const seen = new WeakSet();
  while (pending.length > 0) {
    const value = pending.pop();
    if (typeof value === "string") {
      if (patterns.some((pattern) => pattern.test(value))) return true;
      continue;
    }
    if (value === null || typeof value !== "object") continue;
    if (seen.has(value)) continue;
    seen.add(value);
    if (Array.isArray(value)) {
      for (const child of value) pending.push(child);
      continue;
    }
    for (const child of Object.values(value)) pending.push(child);
  }
  return false;
}

function internalValidate(resultDocument, onsiteDocument, digests = {}) {
  const issues = [];
  const metrics = emptyMetrics();

  const resultRootShape = exactOwnKeys(resultDocument, RESULT_ROOT_KEYS)
    && resultDocument.project === "石听 NeoLoop"
    && resultDocument.fact_class === FACT_CLASS
    && resultDocument.execution_status === "blocked"
    && resultDocument.result === null
    && Array.isArray(resultDocument.permission_probes)
    && Array.isArray(resultDocument.access_checks);
  const onsiteRootShape = exactOwnKeys(onsiteDocument, ONSITE_ROOT_KEYS)
    && onsiteDocument.project === "石听 NeoLoop"
    && onsiteDocument.team === "石听未来"
    && onsiteDocument.fact_class === FACT_CLASS
    && Array.isArray(onsiteDocument.permission_checks);
  if (!resultRootShape || !onsiteRootShape) issues.push("document_shape");
  if (!Array.isArray(resultDocument?.permission_probes)
    || !Array.isArray(resultDocument?.access_checks)
    || !Array.isArray(onsiteDocument?.permission_checks)) {
    return makeReport(metrics, issues, digests);
  }

  const resultP03Matches = resultDocument.permission_probes.filter(
    (record) => record?.unit_id === "P03",
  );
  const resultA02Matches = resultDocument.access_checks.filter(
    (record) => record?.unit_id === "A02",
  );
  const onsiteP03Matches = onsiteDocument.permission_checks.filter(
    (record) => record?.key === "P03",
  );
  const resultP03 = resultP03Matches[0];
  const resultA02 = resultA02Matches[0];
  const onsiteP03 = onsiteP03Matches[0];

  const resultP03SnapshotMatches = snapshotDigestMatches(
    resultP03,
    EXPECTED_RESULT_P03_SNAPSHOT_SHA256,
  );
  const onsiteP03SnapshotMatches = snapshotDigestMatches(
    onsiteP03,
    EXPECTED_ONSITE_P03_SNAPSHOT_SHA256,
  );
  if (!resultP03SnapshotMatches || !onsiteP03SnapshotMatches) {
    issues.push("p03_snapshot_drift");
  }
  const resultA02SnapshotMatches = snapshotDigestMatches(
    resultA02,
    EXPECTED_RESULT_A02_SNAPSHOT_SHA256,
  );
  if (!resultA02SnapshotMatches) issues.push("a02_snapshot_drift");

  const resultP03Shape = resultP03Matches.length === 1
    && exactOwnKeys(resultP03, RESULT_P03_KEYS);
  if (!resultP03Shape) issues.push("p03_record_shape");
  const onsiteP03Shape = onsiteP03Matches.length === 1
    && onsiteRecordShapeMatches(onsiteP03);
  if (!onsiteP03Shape) issues.push("onsite_record_shape");

  metrics.p03_parent_blocked_verified = resultP03Shape
    && resultP03SnapshotMatches
    && parentBlockedMatches(resultP03);
  if (!metrics.p03_parent_blocked_verified) issues.push("p03_parent_state");

  const prebuild = onsiteP03?.p03_phase_observations?.prebuild_gate;
  const postbuild = onsiteP03?.p03_phase_observations
    ?.postbuild_five_view_direct_table_recheck;
  metrics.p03_prebuild_blocked_verified = onsiteP03Shape
    && onsiteP03SnapshotMatches
    && prebuildBlockedMatches(prebuild);
  if (!metrics.p03_prebuild_blocked_verified) issues.push("p03_phase_state");
  if (prebuild?.actual_prebuild_proof !== null) issues.push("prebuild_proof_claim");

  metrics.p03_postbuild_not_tested_verified = onsiteP03Shape
    && onsiteP03SnapshotMatches
    && postbuildNotTestedMatches(postbuild);
  if (!metrics.p03_postbuild_not_tested_verified) issues.push("postbuild_claim");

  metrics.a02_not_tested_verified = resultA02Matches.length === 1
    && resultA02SnapshotMatches
    && a02NotTestedMatches(resultA02);
  if (!metrics.a02_not_tested_verified) issues.push("a02_state");

  metrics.p03_evidence_entry_count = Array.isArray(resultP03?.evidence_index?.indexes)
    ? resultP03.evidence_index.indexes.length
    : null;
  metrics.p03_evidence_identity_verified = evidenceIdentityMatches(resultP03?.evidence_index)
    && evidenceIdentityMatches(resultP03?.evidence)
    && evidenceIdentityMatches(onsiteP03?.structured_evidence_index)
    && evidenceIdentityMatches(prebuild?.evidence_index);
  if (!metrics.p03_evidence_identity_verified) issues.push("p03_evidence_identity");

  const parentEvidence = resultP03?.evidence_index;
  const expectedPrebuildEvidence = isPlainObject(parentEvidence)
    && Array.isArray(parentEvidence.indexes)
    ? {
        indexes: parentEvidence.indexes.filter((entry) => (
          Array.isArray(entry?.capture_phases)
            && entry.capture_phases.includes("prebuild_gate")
        )),
        r10_subchecks: null,
      }
    : null;
  metrics.p03_evidence_binding_verified = isPlainObject(parentEvidence)
    && canonicalJson(resultP03?.evidence) === canonicalJson(parentEvidence)
    && canonicalJson(onsiteP03?.structured_evidence_index) === canonicalJson(parentEvidence)
    && canonicalJson(prebuild?.evidence_index) === canonicalJson(expectedPrebuildEvidence)
    && parentEvidence.r10_subchecks === null
    && prebuild?.evidence_index?.r10_subchecks === null;
  if (!metrics.p03_evidence_binding_verified) issues.push("p03_evidence_binding");

  if (!onsiteP03Shape || !onsiteAlignmentMatches(resultP03, onsiteP03)) {
    issues.push("p03_onsite_alignment");
  }

  metrics.safe_stop_claims_bound = safeStopClaimsMatch(resultP03);
  if (!metrics.safe_stop_claims_bound) issues.push("safe_stop_claims");

  const relevantRecords = [resultP03, onsiteP03, resultA02];
  if (containsPattern(relevantRecords, FORBIDDEN_PROJECTION_PATTERNS)) {
    issues.push("downstream_projection_claim");
  }
  if (resultP03?.execution_status === "completed"
    || resultP03?.result !== null
    || prebuild?.execution_status === "completed"
    || postbuild?.execution_status === "completed") {
    issues.push("p03_completion_claim");
  }

  metrics.redaction_verified = !containsPattern(
    [resultDocument, onsiteDocument],
    SENSITIVE_VALUE_PATTERNS,
  );
  if (!metrics.redaction_verified) issues.push("sensitive_value");

  metrics.p03_partial_attempt_verified = metrics.p03_parent_blocked_verified
    && metrics.p03_prebuild_blocked_verified
    && metrics.p03_postbuild_not_tested_verified
    && metrics.p03_evidence_identity_verified
    && metrics.p03_evidence_binding_verified
    && metrics.safe_stop_claims_bound
    && metrics.a02_not_tested_verified
    && metrics.redaction_verified
    && issues.length === 0;

  return makeReport(metrics, issues, digests);
}

export function validateLiveP03PartialBlockedEvidenceDocuments(
  resultDocument,
  onsiteDocument,
) {
  try {
    if (containsNonfiniteNumber(resultDocument) || containsNonfiniteNumber(onsiteDocument)) {
      return fixedFailure("invalid_json");
    }
    const digests = {
      result: inputSha256(Buffer.from(canonicalJson(resultDocument) ?? "", "utf8")),
      onsite: inputSha256(Buffer.from(canonicalJson(onsiteDocument) ?? "", "utf8")),
    };
    return internalValidate(resultDocument, onsiteDocument, digests);
  } catch {
    return fixedFailure("document_shape");
  }
}

function inspectJsonForDuplicateKeys(text) {
  let index = 0;

  const fail = (code = "invalid_json") => {
    throw new JsonInspectionError(code);
  };
  const skipWhitespace = () => {
    while (/\s/u.test(text[index] ?? "")) index += 1;
  };
  const parseString = () => {
    if (text[index] !== '"') fail();
    const start = index;
    index += 1;
    while (index < text.length) {
      const character = text[index];
      if (character === '"') {
        index += 1;
        try {
          return JSON.parse(text.slice(start, index));
        } catch {
          fail();
        }
      }
      if (character === "\\") {
        index += 1;
        const escape = text[index];
        if (escape === "u") {
          const codePoint = text.slice(index + 1, index + 5);
          if (!/^[0-9a-fA-F]{4}$/u.test(codePoint)) fail();
          index += 5;
          continue;
        }
        if (!['"', "\\", "/", "b", "f", "n", "r", "t"].includes(escape)) fail();
        index += 1;
        continue;
      }
      if (character.charCodeAt(0) < 0x20) fail();
      index += 1;
    }
    fail();
  };
  const parseLiteral = (literal) => {
    if (text.slice(index, index + literal.length) !== literal) fail();
    index += literal.length;
  };
  const parseNumber = () => {
    const match = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/u.exec(text.slice(index));
    if (match === null) fail();
    index += match[0].length;
  };
  const parseValue = () => {
    skipWhitespace();
    const character = text[index];
    if (character === "{") {
      index += 1;
      skipWhitespace();
      const keys = new Set();
      if (text[index] === "}") {
        index += 1;
        return;
      }
      while (index < text.length) {
        const key = parseString();
        if (keys.has(key)) fail("duplicate_json_key");
        keys.add(key);
        skipWhitespace();
        if (text[index] !== ":") fail();
        index += 1;
        parseValue();
        skipWhitespace();
        if (text[index] === "}") {
          index += 1;
          return;
        }
        if (text[index] !== ",") fail();
        index += 1;
        skipWhitespace();
      }
      fail();
    }
    if (character === "[") {
      index += 1;
      skipWhitespace();
      if (text[index] === "]") {
        index += 1;
        return;
      }
      while (index < text.length) {
        parseValue();
        skipWhitespace();
        if (text[index] === "]") {
          index += 1;
          return;
        }
        if (text[index] !== ",") fail();
        index += 1;
      }
      fail();
    }
    if (character === '"') {
      parseString();
      return;
    }
    if (character === "t") return parseLiteral("true");
    if (character === "f") return parseLiteral("false");
    if (character === "n") return parseLiteral("null");
    parseNumber();
  };

  skipWhitespace();
  parseValue();
  skipWhitespace();
  if (index !== text.length) fail();
}

function containsNonfiniteNumber(root) {
  const pending = [root];
  const seen = new WeakSet();
  while (pending.length > 0) {
    const value = pending.pop();
    if (typeof value === "number" && !Number.isFinite(value)) return true;
    if (value === null || typeof value !== "object") continue;
    if (seen.has(value)) return true;
    seen.add(value);
    for (const child of Object.values(value)) pending.push(child);
  }
  return false;
}

export function validateLiveP03PartialBlockedEvidenceTexts(resultText, onsiteText) {
  if (typeof resultText !== "string"
    || typeof onsiteText !== "string"
    || Buffer.byteLength(resultText) > LIVE_P03_PARTIAL_BLOCKED_MAX_BYTES
    || Buffer.byteLength(onsiteText) > LIVE_P03_PARTIAL_BLOCKED_MAX_BYTES) {
    return fixedFailure("input_transport");
  }
  const digests = {
    result: inputSha256(Buffer.from(resultText, "utf8")),
    onsite: inputSha256(Buffer.from(onsiteText, "utf8")),
  };

  try {
    inspectJsonForDuplicateKeys(resultText);
    inspectJsonForDuplicateKeys(onsiteText);
    const resultDocument = JSON.parse(resultText);
    const onsiteDocument = JSON.parse(onsiteText);
    if (containsNonfiniteNumber(resultDocument) || containsNonfiniteNumber(onsiteDocument)) {
      return fixedFailure("invalid_json", digests);
    }
    return internalValidate(resultDocument, onsiteDocument, digests);
  } catch (error) {
    return fixedFailure(
      error instanceof JsonInspectionError ? error.code : "invalid_json",
      digests,
    );
  }
}

export function validateLiveP03PartialBlockedEvidenceBuffers(resultBuffer, onsiteBuffer) {
  if (!Buffer.isBuffer(resultBuffer)
    || !Buffer.isBuffer(onsiteBuffer)
    || resultBuffer.length > LIVE_P03_PARTIAL_BLOCKED_MAX_BYTES
    || onsiteBuffer.length > LIVE_P03_PARTIAL_BLOCKED_MAX_BYTES) {
    return fixedFailure("input_transport");
  }
  try {
    const decoder = new TextDecoder("utf-8", { fatal: true });
    const resultText = decoder.decode(resultBuffer);
    const onsiteText = decoder.decode(onsiteBuffer);
    return validateLiveP03PartialBlockedEvidenceTexts(resultText, onsiteText);
  } catch {
    return fixedFailure("input_transport");
  }
}

function pathEntryIdentity(path, entry) {
  return Object.freeze({
    path,
    dev: entry.dev,
    ino: entry.ino,
    mode: entry.mode,
    size: entry.size,
    mtimeMs: entry.mtimeMs,
    ctimeMs: entry.ctimeMs,
    isDirectory: entry.isDirectory(),
    isFile: entry.isFile(),
  });
}

function pathEntryMatches(identity, entry) {
  return !entry.isSymbolicLink()
    && entry.dev === identity.dev
    && entry.ino === identity.ino
    && entry.mode === identity.mode
    && entry.size === identity.size
    && entry.mtimeMs === identity.mtimeMs
    && entry.ctimeMs === identity.ctimeMs
    && entry.isDirectory() === identity.isDirectory
    && entry.isFile() === identity.isFile;
}

function inspectTrustedPath(pathArgument, trustedRootArgument) {
  if (typeof pathArgument !== "string"
    || typeof trustedRootArgument !== "string"
    || !pathArgument.endsWith(".redacted.json")) {
    throw new JsonInspectionError("input_transport");
  }

  const path = resolve(pathArgument);
  const trustedRoot = resolve(trustedRootArgument);
  const relativePath = relative(trustedRoot, path);
  if (relativePath.length === 0
    || relativePath === ".."
    || relativePath.startsWith(`..${sep}`)
    || isAbsolute(relativePath)) {
    throw new JsonInspectionError("input_transport");
  }

  const identities = [];
  const filesystemRoot = parse(path).root;
  const rootEntry = lstatSync(filesystemRoot);
  if (!rootEntry.isDirectory() || rootEntry.isSymbolicLink()) {
    throw new JsonInspectionError("input_transport");
  }
  identities.push(pathEntryIdentity(filesystemRoot, rootEntry));

  const components = relative(filesystemRoot, path).split(sep);
  let currentPath = filesystemRoot;
  for (const [index, component] of components.entries()) {
    if (component.length === 0 || component === "." || component === "..") {
      throw new JsonInspectionError("input_transport");
    }
    if (!readdirSync(currentPath, { encoding: "utf8" }).includes(component)) {
      throw new JsonInspectionError("input_transport");
    }
    currentPath = join(currentPath, component);
    const entry = lstatSync(currentPath);
    const isFinal = index === components.length - 1;
    if (entry.isSymbolicLink()
      || (isFinal && !entry.isFile())
      || (!isFinal && !entry.isDirectory())
      || (isFinal && entry.size > LIVE_P03_PARTIAL_BLOCKED_MAX_BYTES)) {
      throw new JsonInspectionError("input_transport");
    }
    identities.push(pathEntryIdentity(currentPath, entry));
  }

  return Object.freeze({
    path,
    identities: Object.freeze(identities),
    finalIdentity: identities.at(-1),
  });
}

function pathSnapshotUnchanged(snapshot) {
  try {
    return snapshot.identities.every((identity) => (
      pathEntryMatches(identity, lstatSync(identity.path))
    ));
  } catch {
    return false;
  }
}

function secureReadRedactedFile(pathArgument, trustedRootArgument) {
  const snapshot = inspectTrustedPath(pathArgument, trustedRootArgument);

  let descriptor;
  try {
    descriptor = openSync(snapshot.path, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
    const afterOpen = fstatSync(descriptor);
    if (!pathEntryMatches(snapshot.finalIdentity, afterOpen)
      || afterOpen.size > LIVE_P03_PARTIAL_BLOCKED_MAX_BYTES) {
      throw new JsonInspectionError("input_transport");
    }
    const buffer = readFileSync(descriptor);
    const afterRead = fstatSync(descriptor);
    if (!pathEntryMatches(snapshot.finalIdentity, afterRead)
      || !pathSnapshotUnchanged(snapshot)) {
      throw new JsonInspectionError("input_transport");
    }
    return buffer;
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function validateFilesInternal(resultPath, onsitePath, trustedRoot) {
  try {
    return validateLiveP03PartialBlockedEvidenceBuffers(
      secureReadRedactedFile(resultPath, trustedRoot),
      secureReadRedactedFile(onsitePath, trustedRoot),
    );
  } catch {
    return fixedFailure("input_transport");
  }
}

export function validateLiveP03PartialBlockedEvidenceFiles(
  resultPath,
  onsitePath,
  trustedRoot,
) {
  return validateFilesInternal(resultPath, onsitePath, trustedRoot);
}

function digestShape(value) {
  return value === null || (typeof value === "string" && /^[0-9a-f]{64}$/u.test(value));
}

function reportShapeValid(report) {
  if (!exactOwnKeys(report, REPORT_KEYS)
    || report.schema_version !== REPORT_SCHEMA_VERSION
    || report.scope !== REPORT_SCOPE
    || report.fact_class !== FACT_CLASS
    || !digestShape(report.result_input_sha256)
    || !digestShape(report.onsite_input_sha256)
    || !["passed", "failed"].includes(report.validation_status)
    || typeof report.p03_parent_blocked_verified !== "boolean"
    || typeof report.p03_prebuild_blocked_verified !== "boolean"
    || typeof report.p03_partial_attempt_verified !== "boolean"
    || report.p03_full_event_trace_verified !== false
    || report.p03_full_prebuild_proof_verified !== false
    || typeof report.p03_postbuild_not_tested_verified !== "boolean"
    || report.p03_completion_verified !== false
    || typeof report.p03_evidence_identity_verified !== "boolean"
    || typeof report.p03_evidence_binding_verified !== "boolean"
    || !(report.p03_evidence_entry_count === null
      || (Number.isSafeInteger(report.p03_evidence_entry_count)
        && report.p03_evidence_entry_count >= 0))
    || typeof report.safe_stop_claims_bound !== "boolean"
    || typeof report.a02_not_tested_verified !== "boolean"
    || report.unprivileged_access_capability_derived !== false
    || report.formal_build_gate_open !== false
    || report.automatic_retry_allowed !== false
    || report.observation_truth_machine_verified !== false
    || report.business_write_count !== null
    || typeof report.redaction_verified !== "boolean"
    || !Array.isArray(report.issue_codes)
    || report.issue_codes.some((code) => !ISSUE_CODE_SET.has(code))
    || report.issue_codes.length !== new Set(report.issue_codes).size
    || canonicalJson(report.issue_codes) !== canonicalJson([...report.issue_codes].sort())) {
    return false;
  }

  if (report.validation_status === "passed") {
    return typeof report.result_input_sha256 === "string"
      && typeof report.onsite_input_sha256 === "string"
      && report.p03_parent_blocked_verified === true
      && report.p03_prebuild_blocked_verified === true
      && report.p03_partial_attempt_verified === true
      && report.p03_postbuild_not_tested_verified === true
      && report.p03_evidence_identity_verified === true
      && report.p03_evidence_binding_verified === true
      && report.p03_evidence_entry_count === 1
      && report.safe_stop_claims_bound === true
      && report.a02_not_tested_verified === true
      && report.redaction_verified === true
      && report.issue_codes.length === 0;
  }
  return report.p03_partial_attempt_verified === false && report.issue_codes.length > 0;
}

export function serializeLiveP03PartialBlockedEvidenceReport(report) {
  if (!reportShapeValid(report)) throw new TypeError("invalid report");
  return JSON.stringify(Object.fromEntries(REPORT_KEYS.map((key) => [key, report[key]])), null, 2);
}

function main() {
  const report = process.argv.length === 2
      ? validateLiveP03PartialBlockedEvidenceFiles(
        fileURLToPath(RESULT_LIVE_URL),
        fileURLToPath(ONSITE_LIVE_URL),
        fileURLToPath(TRUSTED_PROJECT_ROOT_URL),
      )
    : fixedFailure("cli_arguments_forbidden");
  process.stdout.write(`${serializeLiveP03PartialBlockedEvidenceReport(report)}\n`);
  process.exitCode = report.validation_status === "passed" ? 0 : 1;
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isCli) main();
