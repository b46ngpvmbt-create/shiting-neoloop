import { readFileSync } from "node:fs";

const resultPath = new URL("../evidence/live/2026-08-07-day-1-probe-results.redacted.json", import.meta.url);
const onsitePath = new URL("../evidence/live/2026-08-07-on-site-evidence.redacted.json", import.meta.url);

const resultDocument = JSON.parse(readFileSync(resultPath, "utf8"));
const onsiteDocument = JSON.parse(readFileSync(onsitePath, "utf8"));
const issues = [];
let assertionCount = 0;

const assert = (condition, message) => {
  assertionCount += 1;
  if (!condition) issues.push(message);
};

const canonicalize = (value) => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  }
  return value;
};

const canonicalJson = (value) => JSON.stringify(canonicalize(value));
const exactKeys = (value, expected) => value !== null
  && typeof value === "object"
  && !Array.isArray(value)
  && canonicalJson(Object.keys(value).sort()) === canonicalJson([...expected].sort());

const p02 = resultDocument.permission_probes.find((record) => record.unit_id === "P02");
const onsiteP02 = onsiteDocument.permission_checks.find((record) => record.key === "P02");
const evidenceIndex = p02?.evidence_index;
const evidenceEntry = evidenceIndex?.indexes?.[0];

assert(resultDocument.fact_class === "synthetic_experiment", "result_fact_class");
assert(resultDocument.deployment_status === "temporary_base_probe_suite_in_progress", "result_deployment_status");
assert(resultDocument.execution_status === "blocked" && resultDocument.result === null, "result_suite_in_progress_state");
assert(onsiteDocument.fact_class === "synthetic_experiment", "onsite_fact_class");

assert(p02?.execution_status === "completed" && p02?.result === "受限", "P02_completed_restricted");
assert(onsiteP02?.status === "受限", "P02_onsite_status");
assert(p02?.fallback_verified === true, "P02_fallback_verified");
assert(onsiteP02?.fallback_verification_status === "已复核", "P02_onsite_fallback_verified");
assert(onsiteP02?.evidence_presence === "已记录" && onsiteP02?.redaction_status === "已复核", "P02_evidence_metadata");

assert(exactKeys(evidenceIndex, ["indexes", "r10_subchecks"]), "P02_evidence_outer_keys");
assert(Array.isArray(evidenceIndex?.indexes) && evidenceIndex.indexes.length === 1, "P02_evidence_single_index");
assert(exactKeys(evidenceEntry, [
  "evidence_id",
  "observed_at",
  "actor_role",
  "redacted_storage_slot",
  "capture_phases",
  "redaction_checked",
]), "P02_evidence_entry_keys");
assert(/^T2-EV-P02-\d{8}-\d{4}-\d{2}$/.test(evidenceEntry?.evidence_id ?? ""), "P02_evidence_id");
assert(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/.test(evidenceEntry?.observed_at ?? ""), "P02_evidence_time");
assert(evidenceEntry?.actor_role === "participant_operator", "P02_actor_role");
assert(typeof evidenceEntry?.redacted_storage_slot === "string"
  && evidenceEntry.redacted_storage_slot.length > 0
  && !/[\\/]/.test(evidenceEntry.redacted_storage_slot)
  && !/^[a-z][a-z0-9+.-]*:/i.test(evidenceEntry.redacted_storage_slot)
  && !/(?:app|tbl|rec|view|fld)[A-Za-z0-9_-]{8,}/.test(evidenceEntry.redacted_storage_slot), "P02_redacted_storage_slot");
assert(canonicalJson(evidenceEntry?.capture_phases) === canonicalJson(["before_action", "after_boundary", "failure"]), "P02_capture_phases");
assert(evidenceEntry?.redaction_checked === true, "P02_redaction_checked");

const subcheckKeys = [
  "P02-R10-selector-cardinality",
  "P02-R10-execution-mode",
  "P02-R10-attestation-base-component",
];
assert(exactKeys(evidenceIndex?.r10_subchecks, subcheckKeys), "P02_r10_subcheck_keys");
for (const key of subcheckKeys) {
  assert(canonicalJson(evidenceIndex?.r10_subchecks?.[key]) === canonicalJson([evidenceEntry?.evidence_id]), `P02_r10_subcheck_binding:${key}`);
}

assert(canonicalJson(p02?.evidence) === canonicalJson(evidenceIndex), "P02_result_evidence_deep_equal");
assert(canonicalJson(onsiteP02?.structured_evidence_index) === canonicalJson(evidenceIndex), "P02_onsite_evidence_deep_equal");
assert(canonicalJson(resultDocument.evidence) === canonicalJson(evidenceIndex), "P02_suite_evidence_alias_deep_equal");

const proof = onsiteP02?.r10_selector_and_execution_mode_evidence_contract;
assert(canonicalJson(proof?.selector_case_results?.clusters) === canonicalJson({ one: 1, zero: 0, many: 2 }), "P02_clusters_1_0_2");
assert(canonicalJson(proof?.selector_case_results?.improvements) === canonicalJson({ one: 1, zero: 0, many: 2 }), "P02_improvements_1_0_2");
assert(proof?.actual_execution_mode === "insufficient", "P02_execution_mode_insufficient");
assert(proof?.actual_atomic_all_targets_fault_injection_result === null, "P02_atomic_not_tested");
assert(proof?.actual_sealed_outbox_cas_fault_injection_result === null, "P02_outbox_cas_not_tested");
assert(proof?.permission_snapshot_sha256 === null && proof?.permission_revision === null, "P02_attestation_base_not_tested");

const actualResult = p02?.actual_result ?? "";
for (const marker of [
  "data_scope=synthetic_experiment",
  "scope=manual_ui_cardinality_only",
  "clusters_match_counts(one/zero/many)=1/0/2",
  "improvements_match_counts(one/zero/many)=1/0/2",
  "duplicate_cleanup=exact_named_duplicates_deleted_and_each_target_restored_to_one",
  "protected_baseline=Cases_status_feedback_ownership_relations_unchanged",
  "automation_final_state=disabled",
  "private_resolver_status=not_tested",
  "execution_mode=insufficient",
  "attestation_status=not_tested",
  "business_write_count=not_established_by_manual_ui",
]) assert(actualResult.includes(marker), `P02_actual_result_marker:${marker}`);
assert(!actualResult.includes("business_write_count=0"), "P02_manual_UI_must_not_claim_zero_business_writes");
assert(p02?.cleanup_result?.includes("分别删除一条") && p02.cleanup_result.includes("恢复单条"), "P02_duplicate_cleanup_exactness");

const expectedOnsiteStatus = (record) => {
  if (record.execution_status === "not_tested" && record.result === null) return "未测试";
  if (record.execution_status === "blocked" && record.result === null) return "已阻塞";
  if (record.execution_status === "completed" && ["可用", "受限", "不可用"].includes(record.result)) return record.result;
  return null;
};

const nonP02StateIsValid = (record) => {
  if (record.execution_status === "not_tested") {
    return record.result === null && record.evidence === null && record.evidence_index === null;
  }
  if (record.execution_status === "blocked") {
    return record.result === null
      && record.evidence_index !== null
      && canonicalJson(record.evidence) === canonicalJson(record.evidence_index);
  }
  if (record.execution_status === "completed") {
    return ["可用", "受限", "不可用"].includes(record.result)
      && record.evidence_index !== null
      && canonicalJson(record.evidence) === canonicalJson(record.evidence_index);
  }
  return false;
};

for (const record of resultDocument.permission_probes.filter((record) => record.unit_id !== "P02")) {
  assert(nonP02StateIsValid(record), `${record.unit_id}_non_P02_state_contract`);
}
for (const record of onsiteDocument.permission_checks.filter((record) => record.key !== "P02")) {
  const resultRecord = resultDocument.permission_probes.find((candidate) => candidate.unit_id === record.key);
  const expectedStatus = expectedOnsiteStatus(resultRecord);
  const expectedEvidence = resultRecord?.execution_status === "not_tested" ? null : resultRecord?.evidence_index;
  assert(expectedStatus !== null
    && record.status === expectedStatus
    && canonicalJson(record.structured_evidence_index) === canonicalJson(expectedEvidence), `${record.key}_onsite_matches_live_probe_state`);
}

const dynamicP02 = JSON.stringify({
  suite_evidence: resultDocument.evidence,
  result: p02,
  onsite: onsiteP02,
});
for (const [name, pattern] of [
  ["full_url", /https?:\/\//i],
  ["feishu_host", /(?:larkcommunity|open)\.feishu\.cn/i],
  ["resource_id", /\b(?:app|tbl|rec|view|fld)(?=[A-Za-z0-9_-]{8,}\b)(?=[A-Za-z0-9_-]*[A-Z0-9])[A-Za-z0-9_-]+\b/],
  ["credential", /(?:app[_ ]?secret|tenant[_ ]?key|access[_ ]?token|refresh[_ ]?token|device[_ ]?code)/i],
  ["raw_provider_error", /(?:stack trace|provider error|locator=)/i],
]) assert(!pattern.test(dynamicP02), `P02_sensitive_output:${name}`);

if (issues.length > 0) {
  console.error(JSON.stringify({ status: "failed", issue_count: issues.length, issues }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  status: "passed",
  assertions: assertionCount,
  scope: "P02_redacted_synthetic_working_copy",
  classification: "completed_restricted",
  private_resolver_status: "not_tested",
  execution_mode: "insufficient",
  attestation_status: "not_tested",
  business_write_count: "not_established_by_manual_ui",
}, null, 2));
