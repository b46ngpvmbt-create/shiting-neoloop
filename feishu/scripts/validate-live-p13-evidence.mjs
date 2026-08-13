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

export const LIVE_P13_MAX_BYTES = 128 * 1024;

const RESULT_LIVE_URL = new URL(
  "../evidence/live/2026-08-07-day-1-probe-results.redacted.json",
  import.meta.url,
);
const ONSITE_LIVE_URL = new URL(
  "../evidence/live/2026-08-07-on-site-evidence.redacted.json",
  import.meta.url,
);

const REPORT_SCHEMA_VERSION = "live_p12_p13_evidence_report.v3";
const REPORT_SCOPE = "P12_P13_redacted_live_evidence_only";

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

const RESULT_PERMISSION_KEYS = Object.freeze([
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

const ONSITE_PERMISSION_KEYS = Object.freeze([
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

const EVIDENCE_OUTER_KEYS = Object.freeze(["indexes", "r10_subchecks"]);
const EVIDENCE_ENTRY_KEYS = Object.freeze([
  "evidence_id",
  "observed_at",
  "actor_role",
  "redacted_storage_slot",
  "capture_phases",
  "redaction_checked",
]);

const EVIDENCE_IDENTITIES = Object.freeze({
  P12: Object.freeze({
    evidence_id: "T2-EV-P12-20260808-0328-01",
    observed_at: "2026-08-08T03:28:50+08:00",
    actor_role: "controller_operator",
    redacted_storage_slot: "controlled-slot-P12-wiki-url-resolve-failure-01",
    capture_phases: Object.freeze(["before_action", "failure", "after_boundary"]),
  }),
  P13: Object.freeze({
    evidence_id: "T2-EV-P13-20260808-0101-01",
    observed_at: "2026-08-08T01:01:44+08:00",
    actor_role: "participant_operator",
    redacted_storage_slot: "controlled-slot-P13-cli-auth-boundary-01",
    capture_phases: Object.freeze(["before_action", "after_boundary", "failure"]),
  }),
});

const RESULT_IDENTITIES = Object.freeze({
  P12: Object.freeze({
    name: "Base OpenAPI",
    probe_ref: "../manifests/day-1-probe-suite.v0.1.json#/probes/11",
    evidence_unit_ref: "./on-site-evidence-template.json#/permission_checks/11",
    expected_result_ref: "../manifests/day-1-probe-suite.v0.1.json#/probes/11/expected_result",
    fallback_path: "../manifests/day-1-probe-suite.v0.1.json#/probes/11/fallback_path",
  }),
  P13: Object.freeze({
    name: "lark-cli",
    probe_ref: "../manifests/day-1-probe-suite.v0.1.json#/probes/12",
    evidence_unit_ref: "./on-site-evidence-template.json#/permission_checks/12",
    expected_result_ref: "../manifests/day-1-probe-suite.v0.1.json#/probes/12/expected_result",
    fallback_path: "../manifests/day-1-probe-suite.v0.1.json#/probes/12/fallback_path",
  }),
});

const P12_LATEST_FACT_MARKERS = Object.freeze([
  Object.freeze({ field: "actual_action", marker: "三份 plan 均为 plan_ready" }),
  Object.freeze({ field: "actual_action", marker: "计划阶段所有计数均为 0" }),
  Object.freeze({ field: "actual_action", marker: "只对 cases 串行执行 1 次 explicit live" }),
  Object.freeze({ field: "actual_action", marker: "未重试" }),
  Object.freeze({ field: "actual_action", marker: "未运行 auth scopes" }),
  Object.freeze({ field: "actual_action", marker: "未扩大权限" }),
  Object.freeze({ field: "actual_action", marker: "仅为本轮脱敏证据落盘时间" }),
  Object.freeze({ field: "actual_result", marker: "exit=1" }),
  Object.freeze({ field: "actual_result", marker: "classification=projection_dependency_failure" }),
  Object.freeze({ field: "actual_result", marker: "issue_codes=[command_failed]" }),
  Object.freeze({ field: "actual_result", marker: "cli_command_count=4" }),
  Object.freeze({ field: "actual_result", marker: "auth_command_count=2" }),
  Object.freeze({ field: "actual_result", marker: "base_read_command_attempt_count=1" }),
  Object.freeze({ field: "actual_result", marker: "record_discovery_count=0" }),
  Object.freeze({ field: "actual_result", marker: "zero_match_query_count=0" }),
  Object.freeze({ field: "actual_result", marker: "record_list_command_count=0" }),
  Object.freeze({ field: "actual_result", marker: "business_write_count=0" }),
  Object.freeze({ field: "actual_result", marker: "version、status 与 bitable:app:readonly 精确 auth check 已完成" }),
  Object.freeze({ field: "actual_result", marker: "failure_stage=wiki_url_resolve_command_failed" }),
  Object.freeze({ field: "limitations", marker: "不推断 provider HTTP/OpenAPI 是否实际到达" }),
  Object.freeze({ field: "cleanup_result", marker: "未产生需清理的业务记录" }),
]);

const P12_EXPECTED_RUNTIME = Object.freeze({
  preconditions_observed: Object.freeze([
    "赛事与用户已允许官方 CLI/OpenAPI 只读探测，P11 已按受限状态闭环",
    "P13 共享 CLI 用户身份、专用应用绑定与 bitable:app:readonly 精确 scope 门已机器复验",
    "三份目标执行计划均为 plan_ready，且进入 live 前全部计数为 0",
    "本轮只允许 cases 的单次串行只读入口动作，不允许 record-list 之后的动作或任何业务写入",
    "URL、应用与资源标识、账号、token、code、locator 和 provider raw 不得进入证据",
  ]),
  actual_action: "总控先生成三份只读执行计划；三份 plan 均为 plan_ready，且计划阶段所有计数均为 0。随后只对 cases 串行执行 1 次 explicit live：命令顺序为版本核验、auth status、bitable:app:readonly 精确 auth check、唯一 +url-resolve Wiki 入口动作。收到非零退出后立即停止，未进入 record-list，未重试、未运行 auth scopes、未扩大权限。2026-08-08T03:28:50+08:00 仅为本轮脱敏证据落盘时间，不是命令调用的精确发生时间。",
  actual_result: "本次 explicit live exit=1，classification=projection_dependency_failure，issue_codes=[command_failed]。脱敏计数为 cli_command_count=4、auth_command_count=2、base_read_command_attempt_count=1、record_discovery_count=0、zero_match_query_count=0、record_list_command_count=0、business_write_count=0。按固定命令顺序，version、status 与 bitable:app:readonly 精确 auth check 已完成；失败发生在唯一 +url-resolve Wiki 入口命令，failure_stage=wiki_url_resolve_command_failed。未进入 record-list，也未产生合成记录或业务写入。P12 因规定动作未闭环保持 blocked/null。",
  actual_time: "2026-08-08T03:28:50+08:00",
  executor: "controller_redacted_cli_operator",
  account_role: "application_owner_authorizing_user",
  limitations: "仅能确认 CLI 命令在 Wiki URL 解析步骤非零退出；不推断 provider HTTP/OpenAPI 是否实际到达，不猜测授权、网络、资源或产品内部原因，也不保存 provider raw、URL、App ID、Base/record ID 或 locator。P12 未完成 schema/list/zero-match/写入/清理验证，不能判为可用、受限或不可用；未获新证据前不得自动重试或扩权。",
  cleanup_result: "本轮没有进入 record-list、没有合成记录或业务写入，未产生需清理的业务记录；未重试、未运行 auth scopes、未扩大权限。三份 plan 仅为零计数计划，失败后未继续下游动作。",
  verifier: "controller_redacted_machine_result_verification",
  fallback_actual_result: "P02 已验证临时合成 Base 的人工 UI 路径；P12 blocked 期间继续使用飞书界面、表单、原生导入和离线工具，不启用 OpenAPI 写入。",
});

const P13_LATEST_FACT_MARKERS = Object.freeze([
  Object.freeze({ field: "actual_result", marker: "user_attested" }),
  Object.freeze({ field: "actual_action", marker: "完成新二维码授权动作" }),
  Object.freeze({ field: "actual_result", marker: "同一新交易 completion exit=0" }),
  Object.freeze({ field: "actual_result", marker: "user available=true" }),
  Object.freeze({ field: "actual_result", marker: "user verified=true" }),
  Object.freeze({ field: "actual_result", marker: "overall verified=true" }),
  Object.freeze({ field: "actual_result", marker: "auth check ok=true" }),
  Object.freeze({ field: "actual_result", marker: "missing=null" }),
  Object.freeze({ field: "actual_result", marker: "granted_count=1" }),
  Object.freeze({ field: "actual_result", marker: "未运行 auth scopes" }),
  Object.freeze({ field: "actual_result", marker: "application_binding_check=machine_verified" }),
  Object.freeze({ field: "actual_result", marker: "候选应用数=1" }),
  Object.freeze({ field: "actual_result", marker: "对外标识暴露数为 0" }),
  Object.freeze({ field: "cleanup_result", marker: "pending device request 已清除" }),
  Object.freeze({ field: "cleanup_result", marker: "二维码临时 PNG 与临时目录已删除" }),
  Object.freeze({ field: "actual_result", marker: "认证状态写入数为 1" }),
  Object.freeze({ field: "actual_result", marker: "P12 已转为 blocked/null" }),
]);

const ISSUE_CODE_ORDER = Object.freeze([
  "input_transport",
  "duplicate_json_key",
  "invalid_json",
  "document_shape",
  "p12_record_shape",
  "p13_record_shape",
  "onsite_record_shape",
  "p12_state",
  "p13_state",
  "p12_evidence_identity",
  "p12_evidence_binding",
  "p13_evidence_identity",
  "p13_evidence_binding",
  "p12_onsite_alignment",
  "p13_onsite_alignment",
  "p12_latest_fact",
  "p13_latest_fact",
  "sensitive_value",
  "completion_claim",
  "cli_arguments_forbidden",
  "report_shape",
]);
const ISSUE_CODE_SET = new Set(ISSUE_CODE_ORDER);

const REPORT_KEYS = Object.freeze([
  "schema_version",
  "scope",
  "validation_status",
  "p12_state_verified",
  "p12_attempt_verified",
  "p12_completion_verified",
  "p12_evidence_binding_verified",
  "p12_evidence_identity_verified",
  "p12_evidence_entry_count",
  "p12_plan_ready_count",
  "p12_live_execution_count",
  "cli_command_count",
  "auth_command_count",
  "base_read_command_attempt_count",
  "record_discovery_count",
  "zero_match_query_count",
  "record_list_command_count",
  "p12_failure_classification",
  "p12_runtime_issue_codes",
  "p12_failure_stage",
  "p12_retry_count",
  "auth_scopes_command_count",
  "permission_expansion_count",
  "business_write_count",
  "p13_state_verified",
  "p13_auth_gate_verified",
  "p13_completion_verified",
  "p13_evidence_binding_verified",
  "p13_evidence_identity_verified",
  "p13_evidence_entry_count",
  "application_binding_verified",
  "application_binding_candidate_count",
  "external_identifier_exposure_count",
  "auth_state_write_count",
  "p12_latest_facts_verified",
  "p13_latest_facts_verified",
  "redaction_verified",
  "issue_codes",
]);

const SENSITIVE_VALUE_PATTERNS = Object.freeze([
  /https?:\/\//i,
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
  /\bbearer\s+\S+/i,
  /\b(?:access|refresh)[_ -]?token\s*[:=]\s*\S+/i,
  /\b(?:app|client)[_ -]?secret\s*[:=]\s*\S+/i,
  /\bdevice[_ -]?code\s*[:=]\s*\S+/i,
  /\b(?:ou_|on_|oc_|cli_)[A-Za-z0-9]{8,}\b/,
  /\b(?:app|tbl|rec|view|fld)(?=[A-Za-z0-9]{8,}\b)(?=[A-Za-z0-9]*[A-Z0-9])[A-Za-z0-9]+\b/,
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i,
  /\b1[3-9]\d{9}\b/,
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
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  }
  return value;
}

function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

function sortedIssueCodes(codes) {
  const present = new Set(codes);
  return ISSUE_CODE_ORDER.filter((code) => present.has(code));
}

function emptyMetrics() {
  return {
    p12_state_verified: false,
    p12_attempt_verified: false,
    p12_completion_verified: false,
    p12_evidence_binding_verified: false,
    p12_evidence_identity_verified: false,
    p12_evidence_entry_count: null,
    p12_plan_ready_count: null,
    p12_live_execution_count: null,
    cli_command_count: null,
    auth_command_count: null,
    base_read_command_attempt_count: null,
    record_discovery_count: null,
    zero_match_query_count: null,
    record_list_command_count: null,
    p12_failure_classification: null,
    p12_runtime_issue_codes: null,
    p12_failure_stage: null,
    p12_retry_count: null,
    auth_scopes_command_count: null,
    permission_expansion_count: null,
    business_write_count: null,
    p13_state_verified: false,
    p13_auth_gate_verified: false,
    p13_completion_verified: false,
    p13_evidence_binding_verified: false,
    p13_evidence_identity_verified: false,
    p13_evidence_entry_count: null,
    application_binding_verified: false,
    application_binding_candidate_count: null,
    external_identifier_exposure_count: null,
    auth_state_write_count: null,
    p12_latest_facts_verified: false,
    p13_latest_facts_verified: false,
    redaction_verified: false,
  };
}

function makeReport(metrics, issueCodes) {
  const issues = sortedIssueCodes(issueCodes);
  return {
    schema_version: REPORT_SCHEMA_VERSION,
    scope: REPORT_SCOPE,
    validation_status: issues.length === 0 ? "passed" : "failed",
    p12_state_verified: metrics.p12_state_verified,
    p12_attempt_verified: metrics.p12_attempt_verified,
    p12_completion_verified: metrics.p12_completion_verified,
    p12_evidence_binding_verified: metrics.p12_evidence_binding_verified,
    p12_evidence_identity_verified: metrics.p12_evidence_identity_verified,
    p12_evidence_entry_count: metrics.p12_evidence_entry_count,
    p12_plan_ready_count: metrics.p12_plan_ready_count,
    p12_live_execution_count: metrics.p12_live_execution_count,
    cli_command_count: metrics.cli_command_count,
    auth_command_count: metrics.auth_command_count,
    base_read_command_attempt_count: metrics.base_read_command_attempt_count,
    record_discovery_count: metrics.record_discovery_count,
    zero_match_query_count: metrics.zero_match_query_count,
    record_list_command_count: metrics.record_list_command_count,
    p12_failure_classification: metrics.p12_failure_classification,
    p12_runtime_issue_codes: metrics.p12_runtime_issue_codes,
    p12_failure_stage: metrics.p12_failure_stage,
    p12_retry_count: metrics.p12_retry_count,
    auth_scopes_command_count: metrics.auth_scopes_command_count,
    permission_expansion_count: metrics.permission_expansion_count,
    business_write_count: metrics.business_write_count,
    p13_state_verified: metrics.p13_state_verified,
    p13_auth_gate_verified: metrics.p13_auth_gate_verified,
    p13_completion_verified: metrics.p13_completion_verified,
    p13_evidence_binding_verified: metrics.p13_evidence_binding_verified,
    p13_evidence_identity_verified: metrics.p13_evidence_identity_verified,
    p13_evidence_entry_count: metrics.p13_evidence_entry_count,
    application_binding_verified: metrics.application_binding_verified,
    application_binding_candidate_count: metrics.application_binding_candidate_count,
    external_identifier_exposure_count: metrics.external_identifier_exposure_count,
    auth_state_write_count: metrics.auth_state_write_count,
    p12_latest_facts_verified: metrics.p12_latest_facts_verified,
    p13_latest_facts_verified: metrics.p13_latest_facts_verified,
    redaction_verified: metrics.redaction_verified,
    issue_codes: issues,
  };
}

function fixedFailure(issueCode) {
  return makeReport(emptyMetrics(), [issueCode]);
}

function isNonemptyString(value) {
  return typeof value === "string" && value.length > 0;
}

function isIsoTimestampWithTimezone(value) {
  return typeof value === "string"
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
    && !Number.isNaN(Date.parse(value));
}

function resultIdentityMatches(record, unitId) {
  const expected = RESULT_IDENTITIES[unitId];
  return exactOwnKeys(record, RESULT_PERMISSION_KEYS)
    && record.unit_id === unitId
    && record.name === expected.name
    && record.probe_ref === expected.probe_ref
    && record.evidence_unit_ref === expected.evidence_unit_ref
    && record.expected_result_ref === expected.expected_result_ref
    && record.fallback_path === expected.fallback_path;
}

function onsiteIdentityMatches(record, key) {
  return exactOwnKeys(record, ONSITE_PERMISSION_KEYS)
    && record.key === key
    && record.name === RESULT_IDENTITIES[key].name;
}

function blockedStateMatches(record) {
  return record?.execution_status === "blocked"
    && record.result === null
    && isPlainObject(record.evidence)
    && Array.isArray(record.preconditions_observed)
    && record.preconditions_observed.length > 0
    && record.preconditions_observed.every(isNonemptyString)
    && isNonemptyString(record.actual_action)
    && isNonemptyString(record.actual_result)
    && isIsoTimestampWithTimezone(record.actual_time)
    && isNonemptyString(record.executor)
    && isNonemptyString(record.account_role)
    && isNonemptyString(record.limitations)
    && isPlainObject(record.evidence_index)
    && record.fallback_verified === true
    && isNonemptyString(record.cleanup_result)
    && isNonemptyString(record.verifier);
}

function p12StateMatches(record) {
  return blockedStateMatches(record)
    && canonicalJson(record.preconditions_observed) === canonicalJson(P12_EXPECTED_RUNTIME.preconditions_observed)
    && record.actual_action === P12_EXPECTED_RUNTIME.actual_action
    && record.actual_result === P12_EXPECTED_RUNTIME.actual_result
    && record.actual_time === P12_EXPECTED_RUNTIME.actual_time
    && record.executor === P12_EXPECTED_RUNTIME.executor
    && record.account_role === P12_EXPECTED_RUNTIME.account_role
    && record.limitations === P12_EXPECTED_RUNTIME.limitations
    && record.cleanup_result === P12_EXPECTED_RUNTIME.cleanup_result
    && record.verifier === P12_EXPECTED_RUNTIME.verifier;
}

function p13StateMatches(record) {
  return blockedStateMatches(record);
}

function evidenceIdentityMatches(evidenceIndex, unitId) {
  if (!exactOwnKeys(evidenceIndex, EVIDENCE_OUTER_KEYS)
    || !Array.isArray(evidenceIndex.indexes)
    || evidenceIndex.indexes.length !== 1
    || evidenceIndex.r10_subchecks !== null) return false;

  const entry = evidenceIndex.indexes[0];
  const expected = EVIDENCE_IDENTITIES[unitId];
  return exactOwnKeys(entry, EVIDENCE_ENTRY_KEYS)
    && entry.evidence_id === expected.evidence_id
    && entry.observed_at === expected.observed_at
    && entry.actor_role === expected.actor_role
    && entry.redacted_storage_slot === expected.redacted_storage_slot
    && canonicalJson(entry.capture_phases) === canonicalJson(expected.capture_phases)
    && entry.redaction_checked === true;
}

function onsiteP12Matches(resultRecord, onsiteRecord) {
  return onsiteRecord?.status === "已阻塞"
    && onsiteRecord.actual_action === resultRecord?.actual_action
    && onsiteRecord.actual_time === resultRecord?.actual_time
    && onsiteRecord.executor === resultRecord?.executor
    && onsiteRecord.platform_account_role === resultRecord?.account_role
    && onsiteRecord.logical_business_role === "participant_operator"
    && onsiteRecord.platform_role_mapping_status === "已核对"
    && onsiteRecord.actual_result === resultRecord?.actual_result
    && onsiteRecord.limitations === resultRecord?.limitations
    && onsiteRecord.fallback_verification_status === "已复核"
    && onsiteRecord.fallback_actual_result === P12_EXPECTED_RUNTIME.fallback_actual_result
    && onsiteRecord.verifier === resultRecord?.verifier
    && onsiteRecord.evidence_presence === "已记录"
    && Array.isArray(onsiteRecord.screenshot_indexes)
    && onsiteRecord.screenshot_indexes.length === 0
    && Array.isArray(onsiteRecord.run_indexes)
    && onsiteRecord.run_indexes.length === 0
    && onsiteRecord.redaction_status === "已复核";
}

function onsiteP13Matches(resultRecord, onsiteRecord) {
  return onsiteRecord?.status === "已阻塞"
    && onsiteRecord.actual_action === resultRecord?.actual_action
    && onsiteRecord.actual_time === resultRecord?.actual_time
    && onsiteRecord.executor === resultRecord?.executor
    && onsiteRecord.platform_account_role === resultRecord?.account_role
    && onsiteRecord.logical_business_role === "participant_operator"
    && onsiteRecord.platform_role_mapping_status === "已核对"
    && onsiteRecord.actual_result === resultRecord?.actual_result
    && onsiteRecord.limitations === resultRecord?.limitations
    && onsiteRecord.fallback_verification_status === "已复核"
    && isNonemptyString(onsiteRecord.fallback_actual_result)
    && onsiteRecord.verifier === resultRecord?.verifier
    && onsiteRecord.evidence_presence === "已记录"
    && Array.isArray(onsiteRecord.screenshot_indexes)
    && onsiteRecord.screenshot_indexes.length === 0
    && Array.isArray(onsiteRecord.run_indexes)
    && onsiteRecord.run_indexes.length === 0
    && onsiteRecord.redaction_status === "已复核";
}

function p12LatestFactsMatch(record) {
  return record?.actual_action === P12_EXPECTED_RUNTIME.actual_action
    && record.actual_result === P12_EXPECTED_RUNTIME.actual_result
    && record.limitations === P12_EXPECTED_RUNTIME.limitations
    && record.cleanup_result === P12_EXPECTED_RUNTIME.cleanup_result
    && P12_LATEST_FACT_MARKERS.every(({ field, marker }) => (
      typeof record?.[field] === "string" && record[field].includes(marker)
    ));
}

function p13LatestFactsMatch(record) {
  const markersPresent = P13_LATEST_FACT_MARKERS.every(({ field, marker }) => (
    typeof record?.[field] === "string" && record[field].includes(marker)
  ));
  const attestedPrecondition = record?.preconditions_observed?.some((value) => (
    typeof value === "string"
      && value.includes("bitable:app:readonly")
      && value.includes("user_attested")
      && value.includes("machine_verified")
  ));
  const noScopeEscalation = record?.actual_result?.includes(
    "未为受限诊断增加 application:application:self_manage",
  ) === true;
  return markersPresent && attestedPrecondition && noScopeEscalation;
}

function containsSensitiveValue(...roots) {
  const pending = [...roots];
  const seen = new WeakSet();
  while (pending.length > 0) {
    const value = pending.pop();
    if (typeof value === "string") {
      if (SENSITIVE_VALUE_PATTERNS.some((pattern) => pattern.test(value))) return true;
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

function internalValidate(resultDocument, onsiteDocument) {
  const issues = [];
  const metrics = emptyMetrics();

  const resultRootShape = exactOwnKeys(resultDocument, RESULT_ROOT_KEYS)
    && resultDocument.project === "石听 NeoLoop"
    && resultDocument.fact_class === "synthetic_experiment"
    && resultDocument.deployment_status === "temporary_base_probe_suite_in_progress"
    && resultDocument.execution_status === "blocked"
    && resultDocument.result === null
    && Array.isArray(resultDocument.permission_probes);
  const onsiteRootShape = exactOwnKeys(onsiteDocument, ONSITE_ROOT_KEYS)
    && onsiteDocument.project === "石听 NeoLoop"
    && onsiteDocument.team === "石听未来"
    && onsiteDocument.fact_class === "synthetic_experiment"
    && Array.isArray(onsiteDocument.permission_checks);
  if (!resultRootShape || !onsiteRootShape) issues.push("document_shape");
  if (!Array.isArray(resultDocument?.permission_probes)
    || !Array.isArray(onsiteDocument?.permission_checks)) return makeReport(metrics, issues);

  const resultP13Matches = resultDocument.permission_probes.filter((record) => record?.unit_id === "P13");
  const resultP12Matches = resultDocument.permission_probes.filter((record) => record?.unit_id === "P12");
  const onsiteP13MatchesList = onsiteDocument.permission_checks.filter((record) => record?.key === "P13");
  const onsiteP12MatchesList = onsiteDocument.permission_checks.filter((record) => record?.key === "P12");

  const resultP13 = resultP13Matches[0];
  const resultP12 = resultP12Matches[0];
  const onsiteP13 = onsiteP13MatchesList[0];
  const onsiteP12 = onsiteP12MatchesList[0];

  const p13RecordShape = resultP13Matches.length === 1 && resultIdentityMatches(resultP13, "P13");
  const p12RecordShape = resultP12Matches.length === 1 && resultIdentityMatches(resultP12, "P12");
  if (!p12RecordShape) issues.push("p12_record_shape");
  if (!p13RecordShape) issues.push("p13_record_shape");

  const onsiteShape = onsiteP13MatchesList.length === 1
    && onsiteP12MatchesList.length === 1
    && onsiteIdentityMatches(onsiteP13, "P13")
    && onsiteIdentityMatches(onsiteP12, "P12");
  if (!onsiteShape) issues.push("onsite_record_shape");

  metrics.p12_state_verified = p12RecordShape && p12StateMatches(resultP12);
  if (!metrics.p12_state_verified) issues.push("p12_state");

  metrics.p13_state_verified = p13RecordShape && p13StateMatches(resultP13);
  if (!metrics.p13_state_verified) issues.push("p13_state");

  metrics.p12_evidence_entry_count = Array.isArray(resultP12?.evidence_index?.indexes)
    ? resultP12.evidence_index.indexes.length
    : null;
  metrics.p12_evidence_identity_verified = evidenceIdentityMatches(resultP12?.evidence_index, "P12");
  if (!metrics.p12_evidence_identity_verified) issues.push("p12_evidence_identity");

  metrics.p12_evidence_binding_verified = isPlainObject(resultP12?.evidence_index)
    && canonicalJson(resultP12.evidence) === canonicalJson(resultP12.evidence_index)
    && canonicalJson(onsiteP12?.structured_evidence_index) === canonicalJson(resultP12.evidence_index);
  if (!metrics.p12_evidence_binding_verified) issues.push("p12_evidence_binding");

  metrics.p13_evidence_entry_count = Array.isArray(resultP13?.evidence_index?.indexes)
    ? resultP13.evidence_index.indexes.length
    : null;
  metrics.p13_evidence_identity_verified = evidenceIdentityMatches(resultP13?.evidence_index, "P13");
  if (!metrics.p13_evidence_identity_verified) issues.push("p13_evidence_identity");

  metrics.p13_evidence_binding_verified = isPlainObject(resultP13?.evidence_index)
    && canonicalJson(resultP13.evidence) === canonicalJson(resultP13.evidence_index)
    && canonicalJson(onsiteP13?.structured_evidence_index) === canonicalJson(resultP13.evidence_index);
  if (!metrics.p13_evidence_binding_verified) issues.push("p13_evidence_binding");

  if (!onsiteShape || !onsiteP12Matches(resultP12, onsiteP12)) issues.push("p12_onsite_alignment");
  if (!onsiteShape || !onsiteP13Matches(resultP13, onsiteP13)) issues.push("p13_onsite_alignment");

  metrics.p12_latest_facts_verified = p12LatestFactsMatch(resultP12);
  if (!metrics.p12_latest_facts_verified) issues.push("p12_latest_fact");
  if (metrics.p12_latest_facts_verified) {
    metrics.p12_plan_ready_count = 3;
    metrics.p12_live_execution_count = 1;
    metrics.cli_command_count = 4;
    metrics.auth_command_count = 2;
    metrics.base_read_command_attempt_count = 1;
    metrics.record_discovery_count = 0;
    metrics.zero_match_query_count = 0;
    metrics.record_list_command_count = 0;
    metrics.p12_failure_classification = "projection_dependency_failure";
    metrics.p12_runtime_issue_codes = ["command_failed"];
    metrics.p12_failure_stage = "wiki_url_resolve_command_failed";
    metrics.p12_retry_count = 0;
    metrics.auth_scopes_command_count = 0;
    metrics.permission_expansion_count = 0;
    metrics.business_write_count = 0;
  }

  metrics.p13_latest_facts_verified = p13LatestFactsMatch(resultP13);
  if (!metrics.p13_latest_facts_verified) issues.push("p13_latest_fact");
  if (metrics.p13_latest_facts_verified) {
    metrics.auth_state_write_count = 1;
    metrics.application_binding_verified = true;
    metrics.application_binding_candidate_count = 1;
    metrics.external_identifier_exposure_count = 0;
  }

  metrics.redaction_verified = !containsSensitiveValue(resultDocument, onsiteDocument);
  if (!metrics.redaction_verified) issues.push("sensitive_value");

  metrics.p12_attempt_verified = metrics.p12_state_verified
    && metrics.p12_evidence_binding_verified
    && metrics.p12_evidence_identity_verified
    && metrics.p12_latest_facts_verified
    && metrics.redaction_verified
    && issues.length === 0;
  metrics.p12_completion_verified = false;

  metrics.p13_auth_gate_verified = metrics.p13_state_verified
    && metrics.p12_state_verified
    && metrics.p13_evidence_binding_verified
    && metrics.p13_evidence_identity_verified
    && metrics.p13_latest_facts_verified
    && metrics.redaction_verified
    && issues.length === 0;
  metrics.p13_completion_verified = false;
  if (resultP12?.execution_status === "completed"
    || resultP12?.result !== null
    || resultP13?.execution_status === "completed"
    || resultP13?.result !== null) {
    metrics.p12_attempt_verified = false;
    metrics.p13_auth_gate_verified = false;
    issues.push("completion_claim");
  }

  return makeReport(metrics, issues);
}

export function validateLiveP13EvidenceDocuments(resultDocument, onsiteDocument) {
  try {
    return internalValidate(resultDocument, onsiteDocument);
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
          if (!/^[0-9a-fA-F]{4}$/.test(codePoint)) fail();
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
    const match = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(text.slice(index));
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

export function validateLiveP13EvidenceTexts(resultText, onsiteText) {
  if (typeof resultText !== "string"
    || typeof onsiteText !== "string"
    || Buffer.byteLength(resultText) > LIVE_P13_MAX_BYTES
    || Buffer.byteLength(onsiteText) > LIVE_P13_MAX_BYTES) return fixedFailure("input_transport");

  try {
    inspectJsonForDuplicateKeys(resultText);
    inspectJsonForDuplicateKeys(onsiteText);
    const resultDocument = JSON.parse(resultText);
    const onsiteDocument = JSON.parse(onsiteText);
    if (containsNonfiniteNumber(resultDocument) || containsNonfiniteNumber(onsiteDocument)) {
      return fixedFailure("invalid_json");
    }
    return validateLiveP13EvidenceDocuments(resultDocument, onsiteDocument);
  } catch (error) {
    return fixedFailure(error instanceof JsonInspectionError ? error.code : "invalid_json");
  }
}

export function validateLiveP13EvidenceBuffers(resultBuffer, onsiteBuffer) {
  if (!Buffer.isBuffer(resultBuffer)
    || !Buffer.isBuffer(onsiteBuffer)
    || resultBuffer.length > LIVE_P13_MAX_BYTES
    || onsiteBuffer.length > LIVE_P13_MAX_BYTES) return fixedFailure("input_transport");
  try {
    const decoder = new TextDecoder("utf-8", { fatal: true });
    const resultText = decoder.decode(resultBuffer);
    const onsiteText = decoder.decode(onsiteBuffer);
    return validateLiveP13EvidenceTexts(resultText, onsiteText);
  } catch {
    return fixedFailure("input_transport");
  }
}

function secureReadRedactedFile(pathArgument) {
  if (typeof pathArgument !== "string" || !pathArgument.endsWith(".redacted.json")) {
    throw new JsonInspectionError("input_transport");
  }

  const path = resolve(pathArgument);
  const entry = lstatSync(path);
  if (!entry.isFile() || entry.isSymbolicLink() || entry.size > LIVE_P13_MAX_BYTES) {
    throw new JsonInspectionError("input_transport");
  }

  let descriptor;
  try {
    descriptor = openSync(path, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
    const opened = fstatSync(descriptor);
    if (!opened.isFile()
      || opened.size > LIVE_P13_MAX_BYTES
      || opened.dev !== entry.dev
      || opened.ino !== entry.ino) throw new JsonInspectionError("input_transport");
    return readFileSync(descriptor);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

export function validateLiveP13EvidenceFiles(resultPath, onsitePath) {
  try {
    return validateLiveP13EvidenceBuffers(
      secureReadRedactedFile(resultPath),
      secureReadRedactedFile(onsitePath),
    );
  } catch {
    return fixedFailure("input_transport");
  }
}

function reportShapeValid(report) {
  if (!exactOwnKeys(report, REPORT_KEYS)
    || report.schema_version !== REPORT_SCHEMA_VERSION
    || report.scope !== REPORT_SCOPE
    || !["passed", "failed"].includes(report.validation_status)
    || typeof report.p12_state_verified !== "boolean"
    || typeof report.p12_attempt_verified !== "boolean"
    || typeof report.p12_completion_verified !== "boolean"
    || typeof report.p12_evidence_binding_verified !== "boolean"
    || typeof report.p12_evidence_identity_verified !== "boolean"
    || !(report.p12_evidence_entry_count === null
      || (Number.isSafeInteger(report.p12_evidence_entry_count)
        && report.p12_evidence_entry_count >= 0))
    || ![3, null].includes(report.p12_plan_ready_count)
    || ![1, null].includes(report.p12_live_execution_count)
    || ![4, null].includes(report.cli_command_count)
    || ![2, null].includes(report.auth_command_count)
    || ![1, null].includes(report.base_read_command_attempt_count)
    || ![0, null].includes(report.record_discovery_count)
    || ![0, null].includes(report.zero_match_query_count)
    || ![0, null].includes(report.record_list_command_count)
    || !["projection_dependency_failure", null].includes(report.p12_failure_classification)
    || !(report.p12_runtime_issue_codes === null
      || canonicalJson(report.p12_runtime_issue_codes) === canonicalJson(["command_failed"]))
    || !["wiki_url_resolve_command_failed", null].includes(report.p12_failure_stage)
    || ![0, null].includes(report.p12_retry_count)
    || ![0, null].includes(report.auth_scopes_command_count)
    || ![0, null].includes(report.permission_expansion_count)
    || ![0, null].includes(report.business_write_count)
    || typeof report.p13_state_verified !== "boolean"
    || typeof report.p13_auth_gate_verified !== "boolean"
    || typeof report.p13_completion_verified !== "boolean"
    || typeof report.p13_evidence_binding_verified !== "boolean"
    || typeof report.p13_evidence_identity_verified !== "boolean"
    || !(report.p13_evidence_entry_count === null
      || (Number.isSafeInteger(report.p13_evidence_entry_count)
        && report.p13_evidence_entry_count >= 0))
    || typeof report.application_binding_verified !== "boolean"
    || ![1, null].includes(report.application_binding_candidate_count)
    || ![0, null].includes(report.external_identifier_exposure_count)
    || ![1, null].includes(report.auth_state_write_count)
    || typeof report.p12_latest_facts_verified !== "boolean"
    || typeof report.p13_latest_facts_verified !== "boolean"
    || typeof report.redaction_verified !== "boolean"
    || !Array.isArray(report.issue_codes)
    || report.issue_codes.some((code) => !ISSUE_CODE_SET.has(code))
    || report.issue_codes.length !== new Set(report.issue_codes).size
    || canonicalJson(report.issue_codes) !== canonicalJson(sortedIssueCodes(report.issue_codes))) return false;

  if (report.validation_status === "passed") {
    return report.p12_state_verified === true
      && report.p12_attempt_verified === true
      && report.p12_completion_verified === false
      && report.p12_evidence_binding_verified === true
      && report.p12_evidence_identity_verified === true
      && report.p12_evidence_entry_count === 1
      && report.p12_plan_ready_count === 3
      && report.p12_live_execution_count === 1
      && report.cli_command_count === 4
      && report.auth_command_count === 2
      && report.base_read_command_attempt_count === 1
      && report.record_discovery_count === 0
      && report.zero_match_query_count === 0
      && report.record_list_command_count === 0
      && report.p12_failure_classification === "projection_dependency_failure"
      && canonicalJson(report.p12_runtime_issue_codes) === canonicalJson(["command_failed"])
      && report.p12_failure_stage === "wiki_url_resolve_command_failed"
      && report.p12_retry_count === 0
      && report.auth_scopes_command_count === 0
      && report.permission_expansion_count === 0
      && report.business_write_count === 0
      && report.p13_state_verified === true
      && report.p13_auth_gate_verified === true
      && report.p13_completion_verified === false
      && report.p13_evidence_binding_verified === true
      && report.p13_evidence_identity_verified === true
      && report.p13_evidence_entry_count === 1
      && report.application_binding_verified === true
      && report.application_binding_candidate_count === 1
      && report.external_identifier_exposure_count === 0
      && report.auth_state_write_count === 1
      && report.p12_latest_facts_verified === true
      && report.p13_latest_facts_verified === true
      && report.redaction_verified === true
      && report.issue_codes.length === 0;
  }
  return report.p12_attempt_verified === false
    && report.p12_completion_verified === false
    && report.p13_auth_gate_verified === false
    && report.p13_completion_verified === false
    && report.issue_codes.length > 0;
}

export function serializeLiveP13EvidenceReport(report) {
  const selected = reportShapeValid(report) ? report : fixedFailure("report_shape");
  return JSON.stringify(Object.fromEntries(REPORT_KEYS.map((key) => [key, selected[key]])), null, 2);
}

function main() {
  const report = process.argv.length === 2
    ? validateLiveP13EvidenceFiles(fileURLToPath(RESULT_LIVE_URL), fileURLToPath(ONSITE_LIVE_URL))
    : fixedFailure("cli_arguments_forbidden");
  process.stdout.write(`${serializeLiveP13EvidenceReport(report)}\n`);
  process.exitCode = report.validation_status === "passed" ? 0 : 1;
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isCli) main();
