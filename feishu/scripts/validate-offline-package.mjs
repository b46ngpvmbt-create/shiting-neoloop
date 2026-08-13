#!/usr/bin/env node

import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "../..");

const FROZEN_BASELINE_VALIDATOR_SHA256 = "d953ba017d64f88426b7388b6f3d886fd8bfdffd31eab37bec92789b0159a826";
const REPORT_SCHEMA_VERSION = "neoloop.offline-validator-report.v1";
const BASELINE_TIMEOUT_MS = 45_000;
const BASELINE_MAX_BUFFER = 10 * 1024 * 1024;
const EXPECTED_BASELINE_GROUP_COUNTS = Object.freeze({
  strict_JSON_inputs: 3,
  artifact_versions: 6,
  permission_result_contract: 234,
  canonical_contract_alignment: 106,
  historical_self_consistency: 8,
  current_freeze_chain: 18,
  markdown_parser_fail_closed: 26,
  reference_graph: 25,
  global_sha_slot_fail_closed: 12,
  literal_reference_closures: 5,
  literal_reference_closure_fail_closed: 2121,
  strict_JSON_input_fail_closed: 24,
  JSON_Pointer_array_semantics: 14,
  reference_graph_fail_closed: 152,
  evidence_sha_slot_fail_closed: 5,
});
const EXPECTED_BASELINE_ASSERTION_COUNT = Object.values(EXPECTED_BASELINE_GROUP_COUNTS)
  .reduce((count, value) => count + value, 0);
const EXPECTED_P03_CLOSURE_FIXTURE_IDS = Object.freeze([
  "P03_completed_proof_root_null", "P03_completed_proof_root_array", "P03_completed_proof_root_string",
  "P03_completed_proof_root_missing_probe_ref", "P03_completed_proof_root_missing_normalized_existing_evidence_unit_ref",
  "P03_completed_proof_root_missing_creates_new_evidence_unit", "P03_completed_proof_root_missing_actual_all_five_business_views_result",
  "P03_completed_proof_root_missing_actual_direct_clusters_table_result",
  "P03_completed_proof_root_missing_actual_recurrence_visibility_no_broader_than_source_fields_result",
  "P03_completed_proof_root_missing_attestation_id_digest", "P03_completed_proof_root_missing_capability_attestation_sha256",
  "P03_completed_proof_root_missing_permission_snapshot_sha256", "P03_completed_proof_root_missing_permission_revision",
  "P03_completed_proof_root_missing_issued_at", "P03_completed_proof_root_missing_expires_at",
  "P03_completed_proof_root_missing_capability_checked_at", "P03_completed_proof_root_missing_capability_rechecked_at",
  "P03_completed_proof_root_missing_actual_prewrite_recheck_result", "P03_completed_proof_root_missing_actual_drift_or_expiry_injection_result",
  "P03_completed_proof_root_extra", "P03_completed_proof_root_probe_ref_drift",
  "P03_completed_proof_root_evidence_unit_ref_drift", "P03_completed_proof_root_creates_new_evidence_unit_drift",
  "P03_metadata_not_tested_evidence_presence_reverse", "P03_metadata_not_tested_evidence_presence_delete",
  "P03_metadata_not_tested_evidence_presence_null", "P03_metadata_not_tested_evidence_presence_number",
  "P03_metadata_not_tested_evidence_presence_object", "P03_metadata_not_tested_redaction_status_reverse",
  "P03_metadata_not_tested_redaction_status_delete", "P03_metadata_not_tested_redaction_status_null",
  "P03_metadata_not_tested_redaction_status_number", "P03_metadata_not_tested_redaction_status_object",
  "P03_metadata_blocked_evidence_presence_reverse", "P03_metadata_blocked_evidence_presence_delete",
  "P03_metadata_blocked_evidence_presence_null", "P03_metadata_blocked_evidence_presence_number",
  "P03_metadata_blocked_evidence_presence_object", "P03_metadata_blocked_redaction_status_reverse",
  "P03_metadata_blocked_redaction_status_delete", "P03_metadata_blocked_redaction_status_null",
  "P03_metadata_blocked_redaction_status_number", "P03_metadata_blocked_redaction_status_object",
  "P03_metadata_completed_evidence_presence_reverse", "P03_metadata_completed_evidence_presence_delete",
  "P03_metadata_completed_evidence_presence_null", "P03_metadata_completed_evidence_presence_number",
  "P03_metadata_completed_evidence_presence_object", "P03_metadata_completed_redaction_status_reverse",
  "P03_metadata_completed_redaction_status_delete", "P03_metadata_completed_redaction_status_null",
  "P03_metadata_completed_redaction_status_number", "P03_metadata_completed_redaction_status_object",
  "P03_declaration_proof_root_exact_keys_missing", "P03_declaration_proof_root_exact_keys_extra",
  "P03_declaration_proof_root_exact_keys_rename", "P03_declaration_proof_root_static_identity_missing",
  "P03_declaration_proof_root_static_identity_extra", "P03_declaration_proof_root_static_identity_rename",
  "P03_declaration_deterministic_result_classification_missing", "P03_declaration_deterministic_result_classification_extra",
  "P03_declaration_deterministic_result_classification_rename", "P03_declaration_evidence_metadata_state_contract_missing",
  "P03_declaration_evidence_metadata_state_contract_extra", "P03_declaration_evidence_metadata_state_contract_rename",
]);
const EXPECTED_P03_PREBUILD_FIXTURE_IDS = Object.freeze([
  "P03_prebuild_proof_root_null", "P03_prebuild_proof_root_array", "P03_prebuild_proof_root_string",
  "P03_prebuild_proof_missing_key", "P03_prebuild_proof_extra_key", "P03_prebuild_fixture_marker_drift",
  "P03_prebuild_data_scope_drift", "P03_prebuild_test_scope_drift", "P03_prebuild_enterprise_data_used",
  "P03_prebuild_actor_class_drift", "P03_prebuild_actor_not_distinct_from_owner", "P03_prebuild_owner_privileges_present",
  "P03_prebuild_administrator_privileges_present", "P03_prebuild_independent_session_unverified",
  "P03_prebuild_allowed_view_open_not_attempted", "P03_prebuild_protected_mutation_not_attempted",
  "P03_prebuild_non_isolated_views_hidden_wrong_type", "P03_prebuild_non_target_records_hidden_wrong_type",
  "P03_prebuild_direct_table_access_denied_wrong_type", "P03_prebuild_raw_json_hidden_wrong_type",
  "P03_prebuild_management_configuration_hidden_wrong_type",
  "P03_prebuild_unauthorized_write_count_wrong_type", "P03_prebuild_unauthorized_write_count_negative",
  "P03_prebuild_temporary_access_not_revoked", "P03_prebuild_cleanup_not_reverified",
  "P03_prebuild_available_but_view_not_opened", "P03_prebuild_available_but_non_isolated_view_visible",
  "P03_prebuild_available_but_non_target_record_visible", "P03_prebuild_available_but_direct_table_access_allowed",
  "P03_prebuild_available_but_raw_json_visible", "P03_prebuild_available_but_management_configuration_visible",
  "P03_prebuild_available_but_mutation_not_rejected",
  "P03_prebuild_available_but_unauthorized_write_count_positive", "P03_prebuild_available_but_business_state_changed",
  "P03_prebuild_restricted_without_limitations_exact", "P03_prebuild_restricted_fallback_false_exact",
  "P03_prebuild_unavailable_with_safe_outcomes", "P03_prebuild_view_closed_but_mutation_attempted",
  "P03_prebuild_view_closed_but_mutation_rejected", "P03_prebuild_visibility_leak_but_mutation_attempted",
  "P03_prebuild_phase_evidence_full_object_drift",
  "P03_prebuild_phase_evidence_order_drift", "P03_prebuild_phase_evidence_duplicate_id",
  "P03_prebuild_parent_evidence_duplicate_id", "P03_prebuild_blocked_nonnull_proof",
  "P03_prebuild_not_tested_nonnull_proof",
]);
const EXPECTED_PERMISSION_NEGATIVE_FIXTURE_IDS = Object.freeze([
  "status_truth_table_same_cardinality_drift", "runtime_field_type_same_key_drift", "structured_evidence_contract_same_key_drift",
  "P03_prebuild_postbuild_contract_drift", "capture_phase_probe_suite_declaration_drift",
  "capture_phase_permission_results_declaration_drift", "capture_phase_evidence_template_declaration_drift",
  "P03_onsite_prebuild_boundary_contract_drift", "P06_dependency_edge_drift", "P07_dependency_edge_drift",
  "permission_contract_attestation_extra_key", "L-TIME-01", "L-EVID-01", "L-EVID-02", "L-EVID-03", "L-R10-01",
  "L-P03-STATE-01", "L-P03-STATE-02", "L-P03-TIME-01", "L-P03-BIND-01", "L-P03-BIND-02", "L-P03-BIND-03",
  "L-DEP-01", "L-DEP-02", "L-DEP-03", "L-DEP-04", "not_tested_with_evidence", "not_tested_with_result",
  "not_tested_with_action", "blocked_without_evidence", "blocked_empty_preconditions", "blocked_invalid_time",
  "blocked_empty_limitations", "blocked_fallback_not_boolean", "blocked_same_record_mismatch", "blocked_onsite_mismatch",
  "completed_invalid_result", "completed_restricted_empty_limitations", "completed_restricted_fallback_false",
  "completed_unavailable_empty_limitations", "completed_unavailable_fallback_false", "completed_available_fallback_null",
  "permission_record_extra_field", "permission_record_missing_field", "evidence_entry_bad_id", "evidence_entry_empty_actor",
  "evidence_entry_unsafe_url_slot", "evidence_entry_resource_id_slot", "evidence_entry_empty_capture", "evidence_entry_invalid_capture",
  "P03_evidence_entry_unknown_capture",
  "evidence_redaction_false", "r10_non_p02_p03_object", "r10_p02_array", "P03_phase_extra_field", "P03_phase_missing_field",
  "P03_postbuild_started_before_prebuild", "P03_parent_completed_only_prebuild", "P03_parent_completed_only_postbuild",
  "P03_phase_blocked_nonnull_result", "P03_phase_completed_invalid_result", "P03_phase_evidence_outer_extra",
  "P03_phase_id_not_in_parent", "P03_phase_parent_capture_missing", "P03_phase_parent_duplicate_id",
  "P03_completed_missing_r10_subchecks", "P03_completed_empty_r10_subchecks", "P03_completed_opaque_r10_subchecks",
  "P03_completed_null_r10_field", "P03_completed_missing_view", "P03_completed_view_not_opened",
  "P03_completed_view_not_refreshed", "P03_completed_allowed_action_unverified", "P03_completed_view_raw_visible",
  "P03_completed_direct_table_unchecked", "P03_completed_direct_table_raw_visible", "P03_completed_visibility_intersection_broader",
  "P03_completed_relogin_not_verified", "P03_completed_refresh_drift", "P03_completed_W6_not_rejected",
  "P03_completed_protected_mutation_not_rejected", "P03_completed_admin_config_visible",
  "P03_completed_postbuild_parent_result_mismatch", "P03_completed_status_derivation_mismatch",
  "P02_completed_missing_r10_subchecks", "P02_completed_empty_r10_subchecks", "P02_completed_opaque_r10_subchecks",
  "P02_completed_extra_r10_subcheck", "P02_completed_unbound_r10_subcheck", "P03_completed_r10_unbound",
  "P03_completed_direct_denied_refresh_nonnull", "P03_completed_direct_allowed_refresh_missing",
  "P03_completed_attestation_digest_invalid", "P03_completed_attestation_time_equal_expiry",
  "P03_completed_prewrite_recheck_false", "P03_completed_drift_injection_false", "P03_completed_requires_P02_completed",
  "P03_completed_P02_snapshot_missing", "P03_completed_P02_snapshot_mismatch",
  "P03_completed_P02_revision_missing", "P03_completed_P02_revision_mismatch",
  ...EXPECTED_P03_PREBUILD_FIXTURE_IDS,
  ...EXPECTED_P03_CLOSURE_FIXTURE_IDS,
  "P03_prebuild_unavailable_started_postbuild", "P03_prebuild_restricted_without_safe_fallback", "P03_prebuild_restricted_without_limitations",
  "P03_result_available_with_partial_views", "P03_result_restricted_with_zero_views", "P03_result_unavailable_with_all_safe_views",
  "P03_result_restricted_with_direct_leak", "P03_result_unavailable_with_prewrite_limit",
]);
const EXPECTED_PERMISSION_RESULT_CONTRACT = Object.freeze({
  attestation_schema_version: "permission_result_contract_attestation.v1",
  source_freeze_version: "permission_content_source_freeze.v1",
  assertion_count: 234,
  negative_fixture_count: 220,
  negative_fixture_name_digest: "8035213874adc53e71d860549a4c45fabbf49acd62c11edb4016fec3feec1522",
  negative_fixture_digest: "79288309c9ea47f60958895a8d600f3f8dd88a1893d941378c070fbbfee98a6f",
  source_count: 5,
  source_digest: "1595eb62c6d9fbea8078ae89cb5df5fe82db881f47ce827b4330ebf319f462fa",
  versions: Object.freeze({
    probe_suite: "0.1.7",
    permission_results: "0.1.3",
    evidence_template: "0.1.6",
  }),
  counts: Object.freeze({
    state_truth_rows: 5,
    permission_records: 13,
    exact_fields: 20,
    required_runtime_fields: 16,
    declared_field_types: 20,
    P03_phases: 2,
  }),
});
const EXPECTED_PERMISSION_CONTENT_FREEZE = Object.freeze([
  Object.freeze({ id: "r10_plan", snapshot_key: "r10Plan", path: "docs/superpowers/plans/2026-08-04-shiting-neoloop-r10-implementation-plan.md", sha256: "29e768b96276cc544fefc133a211959b6226f82ea48b02af527afcd84f536f2f" }),
  Object.freeze({ id: "probe_suite", snapshot_key: "probeSuite", path: "feishu/manifests/day-1-probe-suite.v0.1.json", sha256: "b483a2d746aec0caac00fd7f04ecd81ca5c232e0060207e540a024bf1b5e69c1" }),
  Object.freeze({ id: "permission_results", snapshot_key: "permissionResults", path: "feishu/evidence/day-1-probe-results.example.json", sha256: "af499c929b722b1ec996a5ba916a7d395162364435d59f5ed105f286bc3ff30b" }),
  Object.freeze({ id: "evidence_template", snapshot_key: "evidenceTemplate", path: "feishu/evidence/on-site-evidence-template.json", sha256: "8b5a9822069fb8faca4584803fe5c84bf778bb34e7fb50cf97a19c1febf5ef3a" }),
  Object.freeze({ id: "permission_acceptance", snapshot_key: "permissionRunbook", path: "feishu/runbooks/day-1-permission-acceptance.md", sha256: "ca76396650706bb47e5fecf37444de6a36e1cf71dd7b9a827219093eb3fd8241" }),
  Object.freeze({ id: "permission_matrix", snapshot_key: "permissionMatrix", path: "feishu/runbooks/day-1-permission-matrix.md", sha256: "66f22b5608f5d7a2ce7cc36c7ab4f5eff7244b162d4669c7839051e66bae90f8" }),
]);
const EXPECTED_PERMISSION_CONTENT_FREEZE_DIGEST = "da7cf50b8e116da5f077b65a97024715d3ac00a18888b1c9462710a1506f716e";
const EXPECTED_CONTRACT_REPORT_ROOT_KEYS = Object.freeze([
  "report_schema_version", "status", "mode", "summary", "check_groups", "failed_checks", "sources", "versions",
  "permission_result_contract", "strict_JSON_inputs", "r8_negative_fixture_results", "c9_incremental_fixture_results",
  "c10_incremental_fixture_results", "c11_incremental_fixture_results", "c12_incremental_fixture_results",
  "c13_incremental_fixture_results", "c13_accepted_security_tradeoff", "c12_accepted_security_tradeoff",
  "reference_graph", "upstream_conflicts", "errors", "table_field_checks",
]);
const EXPECTED_PERMISSION_ATTESTATION_KEYS = Object.freeze([
  "attestation_schema_version", "source_freeze_version", "status", "check_group", "assertion_count", "failed_assertion_count",
  "negative_fixture_count", "negative_fixtures", "negative_fixture_name_digest", "versions", "counts", "canonical_evidence_source",
  "canonical_evidence_binding", "P03_phase_binding", "P06_dependencies", "P07_dependencies", "sources", "source_count",
  "source_digest", "current_execution_status", "real_external_operations",
]);
const EXPECTED_C13_GROUP_LENGTHS = Object.freeze({
  illegal_locator_fragment_cross: 72,
  valid_locator_invalid_fragment_reasons: 32,
  uppercase_extension_fragment_precedence: 36,
  valid_fragment_resolver_controls: 4,
  terminal_punctuation_matrix: 1344,
  ordinary_non_candidates: 18,
  reason_precedence_oracle: 5,
});
const EXPECTED_LITERAL_CLOSURES = Object.freeze({
  external_repository_files: Object.freeze({
    count: 60,
    digest: "aec9fc8c186ee9b29dac1e7e6df4b2671e990d2ecc8d3a7781147d1af9121e80",
  }),
  internal_JSON_Pointers: Object.freeze({
    count: 32,
    digest: "0d611a5d59056240f50c4faaafee66a230901732ae1be4737cd78e023be5b921",
  }),
  known_scheme_locators: Object.freeze({
    count: 568,
    digest: "d55ada37978fb3c90c3fb4358350e4e060c407cc67aa9ea5a54f7bd6b1461721",
  }),
});
const CHECK_GROUP_ORDER = Object.freeze([
  "legacy",
  "baseline_integrity",
  "strict_input_snapshot",
  "current_version_chain",
  "r10_build_projection",
  "r10_onsite_evidence",
  "report_fail_closed_redaction",
]);
const REDACTION_SENTINEL = "NEOLOOP_DO_NOT_EMIT_SECRET_9f7c3b2a";
const EXPECTED_R10_BUILD_BUNDLE_SHA256 = "71b2db37c5d538d1e4e4e759e04ba1a52e160efc69f0bcacde4428d63829f270";
const EXPECTED_R10_EVIDENCE_BUNDLE_SHA256 = "e44ee48c8a9880d0713062113b369578592dbc88b17f14ee88d1b87afa6528f6";
const BASELINE_EXECUTION_BYTE_BINDING_SCOPE = "path_reopen_with_pre_and_post_SHA_compensation";
const BASELINE_EXECUTION_RESIDUAL_RISK = "same_user_transient_swap_between_final_hash_and_exec_open";
const REPORT_CORE_KEYS = Object.freeze([
  "report_schema_version",
  "status",
  "mode",
  "fatal",
  "contract_attestation",
  "sources",
  "summary",
  "check_groups",
  "negative_test_matrix",
  "onsite_status",
  "protection_category_counts",
  "errors",
]);
const REPORT_SUMMARY_KEYS = Object.freeze([
  "baseline_passed_checks",
  "offline_passed_checks",
  "total_passed_checks",
  "failed_checks",
  "offline_total_checks",
  "offline_failed_checks",
  "effective_fields",
  "relations",
  "runbook_step_rows",
]);
const REPORT_ONSITE_STATUS_KEYS = Object.freeze([
  "required_evidence_units",
  "required_evidence_units_untested",
  "logical_role_platform_mappings_untested",
  "P01_to_P13",
  "R10_verification_status",
  "R10_execution_mode",
  "R10_automatic_projection_enabled",
  "real_feishu_operations_performed_by_validator",
  "lark_cli_login_operations_performed_by_validator",
  "openapi_calls_performed_by_validator",
  "base_write_attempts_performed_by_validator",
]);
const REPORT_PROTECTION_CATEGORY_KEYS = Object.freeze([
  "controlled_workflow_write",
  "authorized_human_write",
  "automation_system_write",
  "ai_candidate_write",
  "immutable_or_snapshot_read_only",
  "append_only_audit",
]);
const CONTRACT_ATTESTATION_KEYS = Object.freeze([
  "status",
  "execution_byte_binding_scope",
  "residual_risk",
  "validator_path",
  "validator_sha256",
  "timeout_ms",
  "max_buffer_bytes",
  "report_status",
  "report_mode",
  "passed_checks",
  "failed_checks",
  "upstream_conflicts",
  "check_group_count",
  "check_group_counts",
  "c13_fixture_group_counts",
  "c13_fixture_total",
  "literal_reference_closures",
  "accepted_security_tradeoffs",
  "versions",
  "selected_source_attestations",
  "expected",
  "observed",
  "comparisons",
]);
const REPORT_NEGATIVE_TEST_MATRIX_KEYS = Object.freeze([
  "total", "passed", "failed", "categories", "expected_name_digest", "observed_name_digest",
]);
const REPORT_NEGATIVE_CATEGORY_KEYS = Object.freeze(["total", "passed", "failed"]);
const CONTRACT_ATTESTATION_EXPECTED_KEYS = Object.freeze([
  "validator_sha256", "report_envelope", "check_group_counts", "c13", "literal_reference_closures",
  "c12_tradeoff_digest", "c13_tradeoff_digest", "versions", "selected_source_attestations",
  "permission_result_contract", "permission_content_freeze",
]);
const CONTRACT_ATTESTATION_OBSERVED_KEYS = Object.freeze([
  "validator_sha256_pre", "validator_sha256_pre_spawn", "validator_sha256_post", "process", "report_envelope",
  "check_group_counts", "c13", "literal_reference_closures", "tradeoffs", "versions",
  "permission_result_contract", "permission_content_freeze", "selected_sources",
]);
const CONTRACT_ATTESTATION_COMPARISON_KEYS = Object.freeze([
  "validator_sha", "transport", "envelope", "groups", "c13_fixture_profile", "closures", "c12_tradeoff",
  "c13_tradeoff", "versions", "sources", "permission_result_contract", "permission_content_freeze", "all",
]);
const REPORT_SOURCE_KEYS = Object.freeze([
  "baselineValidator", "r10Plan", "logicalManifest", "buildPackage", "probeSuite", "permissionResults",
  "resourceMapping", "evidenceTemplate", "permissionMatrix", "buildRunbook", "rollbackRunbook",
  "permissionRunbook", "t3Contract",
]);
const REPORT_ENVELOPE_KEYS = Object.freeze(["status", "mode", "passed_checks", "failed_checks", "upstream_conflicts", "check_group_count"]);
const C13_ATTESTATION_KEYS = Object.freeze(["groups", "profile_digest"]);
const COUNT_DIGEST_KEYS = Object.freeze(["count", "digest"]);
const PERMISSION_CONTENT_FREEZE_KEYS = Object.freeze(["source_count", "source_digest", "sources"]);
const SOURCE_ENTRY_KEYS = Object.freeze(["id", "path", "sha256"]);
const PUBLIC_SOURCE_ENTRY_KEYS = Object.freeze(["path", "sha256"]);
const PERMISSION_RESULT_VERSIONS_KEYS = Object.freeze(["probe_suite", "permission_results", "evidence_template"]);
const PERMISSION_RESULT_COUNTS_KEYS = Object.freeze([
  "state_truth_rows", "permission_records", "exact_fields", "required_runtime_fields", "declared_field_types", "P03_phases",
]);
const PERMISSION_NEGATIVE_FIXTURE_ENTRY_KEYS = Object.freeze(["id", "rejected"]);
const TRUSTED_OBSERVED_TRADEOFF_C12_KEYS = Object.freeze([
  "status", "policy_scope", "invalid_value_count", "ordinary_value_count", "digest", "exact_and_disjoint_recomputed", "reported_disjoint",
]);
const TRUSTED_OBSERVED_TRADEOFF_C13_KEYS = Object.freeze([
  "status", "policy_scope", "reason_precedence_count", "ordinary_value_count", "terminal_negative_value_count", "digest",
  "ordinary_and_terminal_disjoint_recomputed", "reported_disjoint",
]);
const UNTRUSTED_OBSERVED_TRADEOFF_C12_KEYS = Object.freeze([
  "status", "policy_scope", "invalid_value_count", "ordinary_value_count", "digest", "computed_disjoint", "reported_disjoint",
]);
const UNTRUSTED_OBSERVED_TRADEOFF_C13_KEYS = Object.freeze([
  "status", "policy_scope", "reason_precedence_count", "ordinary_value_count", "terminal_negative_value_count", "digest",
  "computed_disjoint", "reported_disjoint",
]);
const ACCEPTED_TRADEOFF_C12_KEYS = Object.freeze([
  "status", "policy_scope", "invalid_value_count", "ordinary_value_count", "digest", "exact_and_disjoint_recomputed",
]);
const ACCEPTED_TRADEOFF_C13_KEYS = Object.freeze([
  "status", "policy_scope", "reason_precedence_count", "ordinary_value_count", "terminal_negative_value_count", "digest",
  "ordinary_and_terminal_disjoint_recomputed",
]);
const SENSITIVE_EMISSION_KEYS = new Set([
  "authorization",
  "cookie",
  "password",
  "token",
  "secret",
  "app_secret",
  "client_secret",
  "secret_key",
  "private_key",
  "api_key",
  "access_key",
  "access_token",
  "refresh_token",
  "session_token",
  "app_token",
  "document_token",
  "folder_token",
  "node_token",
  "tenant_access_token",
  "user_access_token",
  "verification_token",
  "encrypt_key",
  "webhook_url",
  "base_url",
  "app_id",
  "bot_id",
  "table_id",
  "view_id",
  "record_id",
  "node_id",
  "automation_id",
  "platform_role_id",
  "approval_id",
  "approval_code",
  "space_id",
  "release_id",
  "agent_id",
  "credential",
  "credential_store_reference",
]);
const EXPECTED_NEGATIVE_TEST_COUNTS = Object.freeze({
  strict_JSON: 7,
  baseline_process: 11,
  snapshot: 1,
  baseline_profile: 23,
  r10_projection: 11,
  r10_evidence: 8,
  redaction: 8,
  report_schema: 56,
});
const EXPECTED_NEGATIVE_TEST_NAMES_BY_CATEGORY = Object.freeze({
  strict_JSON: Object.freeze([
    "duplicate_key",
    "decoded_unicode_alias",
    "decoded_escape_alias",
    "negative_zero",
    "non_finite_exponent",
    "invalid_JSON",
    "multiple_JSON_values",
  ]),
  baseline_process: Object.freeze([
    "nonzero_with_fake_passed_stdout",
    "signal",
    "empty_stdout",
    "invalid_stdout",
    "multiple_JSON_stdout",
    "stderr",
    "timeout_event",
    "ENOENT",
    "maxBuffer",
    "timeout_configuration",
    "stable_SHA_mismatch_zero_spawn",
  ]),
  snapshot: Object.freeze(["byte_sha_mismatch"]),
  baseline_profile: Object.freeze([
    "report_count",
    "report_group",
    "C13_length",
    "closure_digest",
    "mode",
    "tradeoff",
    "C13_invalid_value_and_tuple_same_length",
    "C13_invalid_reason_triplet_same_length",
    "C13_invalid_pointer_same_length",
    "C13_invalid_count_same_cardinality",
    "C13_valid_control_locator_same_length",
    "C13_ordinary_value_and_classification_same_length",
    "C13_terminal_duplicate_same_cardinality",
    "C12_invalid_tradeoff_replacement_same_length",
    "C12_ordinary_tradeoff_replacement_same_length",
    "C13_precedence_tradeoff_replacement_same_cardinality",
    "C13_ordinary_tradeoff_replacement_same_length",
    "permission_result_contract_count",
    "permission_result_contract_source_digest",
    "permission_result_contract_dependency",
    "permission_contract_attestation_extra_key",
    "permission_contract_attestation_missing_key",
    "permission_contract_attestation_same_cardinality_rename",
  ]),
  r10_projection: Object.freeze([
    "logical_allowlist",
    "build_selector",
    "found_execution_right",
    "truth_table_repair",
    "build_gate_automatic_projection",
    "build_projector_key",
    "build_snapshot_source",
    "build_receipt_storage",
    "build_found_execution_right",
    "build_synthetic_executor",
    "build_root_extra_key",
  ]),
  r10_evidence: Object.freeze([
    "onsite_actual_slot",
    "component_ref",
    "P02_selector_one",
    "P03_attestation_digest",
    "P05_durable_status",
    "P06_private_storage",
    "W6_forbidden_storage",
    "component_extra_key",
  ]),
  redaction: Object.freeze([
    "sensitive_sentinel",
    "sensitive_key_with_nonsecret_marker",
    "complete_URL",
    "Bearer_authorization",
    "Feishu_resource_ID",
    "ordinary_token_like_value",
    "normal_report_emits_once_without_sentinel",
    "fixed_fatal_is_schema_valid_and_scanner_safe",
  ]),
  report_schema: Object.freeze([
    "malicious_baseline_status_and_mode",
    "missing_core_key",
    "schema_version_drift",
    "negative_matrix_extra_key",
    "negative_category_missing_key",
    "negative_category_equal_cardinality_rename",
    "contract_expected_extra_key",
    "contract_observed_missing_key",
    "contract_comparisons_equal_cardinality_rename",
    "sources_extra_key",
    "negative_name_digest_drift",
    "contract_expected_permission_root_missing_key",
    "contract_expected_permission_root_extra_key",
    "contract_expected_permission_root_equal_cardinality_rename",
    "contract_expected_permission_versions_missing_key",
    "contract_expected_permission_versions_extra_key",
    "contract_expected_permission_versions_equal_cardinality_rename",
    "contract_expected_permission_counts_missing_key",
    "contract_expected_permission_counts_extra_key",
    "contract_expected_permission_counts_equal_cardinality_rename",
    "contract_expected_permission_fixture_entry_missing_key",
    "contract_expected_permission_fixture_entry_extra_key",
    "contract_expected_permission_fixture_entry_equal_cardinality_rename",
    "contract_expected_permission_source_entry_missing_key",
    "contract_expected_permission_source_entry_extra_key",
    "contract_expected_permission_source_entry_equal_cardinality_rename",
    "contract_observed_permission_root_missing_key",
    "contract_observed_permission_root_extra_key",
    "contract_observed_permission_root_equal_cardinality_rename",
    "contract_observed_permission_versions_missing_key",
    "contract_observed_permission_versions_extra_key",
    "contract_observed_permission_versions_equal_cardinality_rename",
    "contract_observed_permission_counts_missing_key",
    "contract_observed_permission_counts_extra_key",
    "contract_observed_permission_counts_equal_cardinality_rename",
    "contract_observed_permission_fixture_entry_missing_key",
    "contract_observed_permission_fixture_entry_extra_key",
    "contract_observed_permission_fixture_entry_equal_cardinality_rename",
    "contract_observed_permission_source_entry_missing_key",
    "contract_observed_permission_source_entry_extra_key",
    "contract_observed_permission_source_entry_equal_cardinality_rename",
    "contract_observed_tradeoffs_root_missing_key",
    "contract_observed_tradeoffs_root_extra_key",
    "contract_observed_tradeoffs_root_equal_cardinality_rename",
    "contract_observed_tradeoffs_c12_missing_key",
    "contract_observed_tradeoffs_c12_extra_key",
    "contract_observed_tradeoffs_c12_equal_cardinality_rename",
    "contract_observed_tradeoffs_c13_missing_key",
    "contract_observed_tradeoffs_c13_extra_key",
    "contract_observed_tradeoffs_c13_equal_cardinality_rename",
    "contract_accepted_tradeoffs_c12_missing_key",
    "contract_accepted_tradeoffs_c12_extra_key",
    "contract_accepted_tradeoffs_c12_equal_cardinality_rename",
    "contract_accepted_tradeoffs_c13_missing_key",
    "contract_accepted_tradeoffs_c13_extra_key",
    "contract_accepted_tradeoffs_c13_equal_cardinality_rename",
  ]),
});
const EXPECTED_NEGATIVE_TEST_NAME_DIGEST = "c7ef7d7686397238bed49672078f198085ed56784b3b9a1037999728c4f591c9";

const paths = {
  baselineValidator: path.join(scriptDirectory, "validate-contract-alignment.mjs"),
  r10Plan: path.join(repositoryRoot, "docs/superpowers/plans/2026-08-04-shiting-neoloop-r10-implementation-plan.md"),
  logicalManifest: path.join(repositoryRoot, "feishu/manifests/neoloop-logical-manifest.v0.1.json"),
  buildPackage: path.join(repositoryRoot, "feishu/manifests/on-site-build-package.v0.1.json"),
  probeSuite: path.join(repositoryRoot, "feishu/manifests/day-1-probe-suite.v0.1.json"),
  permissionResults: path.join(repositoryRoot, "feishu/evidence/day-1-probe-results.example.json"),
  resourceMapping: path.join(repositoryRoot, "feishu/config/resource-mapping.example.json"),
  evidenceTemplate: path.join(repositoryRoot, "feishu/evidence/on-site-evidence-template.json"),
  permissionMatrix: path.join(repositoryRoot, "feishu/runbooks/day-1-permission-matrix.md"),
  buildRunbook: path.join(repositoryRoot, "feishu/runbooks/on-site-build-runbook.md"),
  rollbackRunbook: path.join(repositoryRoot, "feishu/runbooks/rollback-and-cleanup.md"),
  permissionRunbook: path.join(repositoryRoot, "feishu/runbooks/day-1-permission-acceptance.md"),
  t3Contract: path.join(repositoryRoot, "src/neoloop/contracts/model.ts"),
};

const checks = [];
const errors = [];
const negativeTests = [];

function pass(name, details = undefined, group = "legacy") {
  void details;
  checks.push({ name, ok: true, group });
}

function summarizeDiagnostic(value) {
  if (value === null) return { type: "null" };
  if (value === undefined) return { type: "undefined" };
  if (typeof value === "string") return { type: "string", byte_length: Buffer.byteLength(value) };
  if (typeof value === "number") return { type: "number", finite: Number.isFinite(value), negative_zero: Object.is(value, -0) };
  if (typeof value === "boolean") return { type: "boolean" };
  if (Array.isArray(value)) return { type: "array", count: value.length };
  if (typeof value === "object") return { type: "object", key_count: Object.keys(value).length };
  return { type: typeof value };
}

function fail(name, details, group = "legacy") {
  const summarized = summarizeDiagnostic(details);
  checks.push({ name, ok: false, group });
  errors.push({ name, group, details: summarized });
}

function assert(name, condition, details) {
  if (condition) pass(name);
  else fail(name, details);
}

function assertInGroup(group, name, condition, details) {
  if (condition) pass(name, undefined, group);
  else fail(name, details, group);
}

function recordNegativeTest(category, name, passed) {
  negativeTests.push({ category, name, passed: passed === true });
  return passed === true;
}

function sorted(values) {
  return [...values].sort();
}

function codeUnitCompare(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value)
      .sort(codeUnitCompare)
      .map((key) => [key, canonicalize(value[key])]));
  }
  return value;
}

function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

function canonicalSha256(value) {
  return sha256(canonicalJson(value));
}

function canonicalTupleSetDigest(tuples) {
  const serialized = tuples.map((tuple) => canonicalJson(tuple)).sort(codeUnitCompare);
  return sha256(`[${serialized.join(",")}]`);
}

function exactOwnKeys(value, expectedKeys) {
  return value !== null
    && !Array.isArray(value)
    && typeof value === "object"
    && equalArrays(Object.keys(value).sort(codeUnitCompare), [...expectedKeys].sort(codeUnitCompare));
}

function equalArrays(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function equalSets(left, right) {
  return equalArrays(sorted(new Set(left)), sorted(new Set(right)));
}

function deepEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function extractConstStringArray(source, name) {
  const expression = new RegExp(`export const ${name} = \\[([\\s\\S]*?)\\] as const;`);
  const match = source.match(expression);
  if (!match) throw new Error(`Unable to find ${name} in T3 contract`);
  return [...match[1].matchAll(/"([^"]+)"/g)].map((entry) => entry[1]);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function jsonPointerForDiagnostic(trail) {
  if (trail.length === 0) return "";
  return `/${trail.map((token) => String(token).replaceAll("~", "~0").replaceAll("/", "~1")).join("/")}`;
}

function analyzeStrictJsonText(raw, source) {
  const duplicateKeys = [];
  const numberFindings = [];
  const syntaxErrors = [];
  let index = 0;

  const syntaxFailure = (reason) => {
    const error = new SyntaxError(reason);
    error.reason = reason;
    error.index = index;
    throw error;
  };
  const skipWhitespace = () => {
    while (index < raw.length && [" ", "\t", "\n", "\r"].includes(raw[index])) index += 1;
  };
  const parseString = () => {
    if (raw[index] !== '"') syntaxFailure("expected_JSON_string");
    const start = index;
    index += 1;
    while (index < raw.length) {
      const code = raw.charCodeAt(index);
      if (raw[index] === '"') {
        index += 1;
        try {
          return { decoded: JSON.parse(raw.slice(start, index)), start };
        } catch {
          syntaxFailure("invalid_JSON_string_escape");
        }
      }
      if (code <= 0x1f) syntaxFailure("unescaped_control_character_in_JSON_string");
      if (raw[index] === "\\") {
        index += 1;
        if (index >= raw.length) syntaxFailure("unterminated_JSON_string_escape");
      }
      index += 1;
    }
    syntaxFailure("unterminated_JSON_string");
  };
  const parseValue = (trail) => {
    skipWhitespace();
    if (raw[index] === "{") {
      index += 1;
      skipWhitespace();
      const keys = new Map();
      if (raw[index] === "}") {
        index += 1;
        return;
      }
      while (index < raw.length) {
        const key = parseString();
        if (keys.has(key.decoded)) {
          duplicateKeys.push({
            source,
            object_pointer: jsonPointerForDiagnostic(trail),
            decoded_key: key.decoded,
            first_offset: keys.get(key.decoded),
            duplicate_offset: key.start,
          });
        } else {
          keys.set(key.decoded, key.start);
        }
        skipWhitespace();
        if (raw[index] !== ":") syntaxFailure("expected_colon_after_JSON_object_key");
        index += 1;
        parseValue([...trail, key.decoded]);
        skipWhitespace();
        if (raw[index] === "}") {
          index += 1;
          return;
        }
        if (raw[index] !== ",") syntaxFailure("expected_comma_or_end_of_JSON_object");
        index += 1;
        skipWhitespace();
      }
      syntaxFailure("unterminated_JSON_object");
    }
    if (raw[index] === "[") {
      index += 1;
      skipWhitespace();
      if (raw[index] === "]") {
        index += 1;
        return;
      }
      let arrayIndex = 0;
      while (index < raw.length) {
        parseValue([...trail, String(arrayIndex)]);
        arrayIndex += 1;
        skipWhitespace();
        if (raw[index] === "]") {
          index += 1;
          return;
        }
        if (raw[index] !== ",") syntaxFailure("expected_comma_or_end_of_JSON_array");
        index += 1;
        skipWhitespace();
      }
      syntaxFailure("unterminated_JSON_array");
    }
    if (raw[index] === '"') {
      parseString();
      return;
    }
    for (const literal of ["true", "false", "null"]) {
      if (raw.startsWith(literal, index)) {
        index += literal.length;
        return;
      }
    }
    const numberMatch = raw.slice(index).match(/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/);
    if (numberMatch) {
      const lexeme = numberMatch[0];
      const numericValue = Number(lexeme);
      if (!Number.isFinite(numericValue) || Object.is(numericValue, -0)) {
        numberFindings.push({
          source,
          pointer: jsonPointerForDiagnostic(trail),
          reason: !Number.isFinite(numericValue) ? "non_finite_JSON_number" : "negative_zero_JSON_number",
        });
      }
      index += lexeme.length;
      return;
    }
    syntaxFailure("unexpected_JSON_value_token");
  };

  try {
    skipWhitespace();
    parseValue([]);
    skipWhitespace();
    if (index !== raw.length) syntaxFailure("trailing_content_after_JSON_value");
  } catch (error) {
    syntaxErrors.push({
      source,
      reason: error?.reason ?? "strict_JSON_scanner_failure",
      offset: Number.isInteger(error?.index) ? error.index : index,
    });
  }
  return {
    source,
    duplicate_keys: duplicateKeys,
    number_findings: numberFindings,
    syntax_errors: syntaxErrors,
    valid: duplicateKeys.length === 0 && numberFindings.length === 0 && syntaxErrors.length === 0,
  };
}

function parseStrictJsonObject(raw, source) {
  const analysis = analyzeStrictJsonText(raw, source);
  if (!analysis.valid) return { ok: false, reason: "strict_JSON_rejected", analysis };
  try {
    const value = JSON.parse(raw);
    if (value === null || Array.isArray(value) || typeof value !== "object") {
      return { ok: false, reason: "JSON_top_level_must_be_object", analysis };
    }
    return { ok: true, value, analysis };
  } catch {
    return { ok: false, reason: "JSON_parse_rejected", analysis };
  }
}

function assessBaselineAttempt(attempt, options = {}) {
  const timeoutMs = options.timeoutMs;
  const maxBuffer = options.maxBuffer;
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > 60_000) return { ok: false, reason: "invalid_timeout_configuration" };
  if (maxBuffer !== BASELINE_MAX_BUFFER) return { ok: false, reason: "invalid_maxBuffer_configuration" };
  if (attempt.maxBufferExceeded === true || attempt.errorCode === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER") return { ok: false, reason: "maxBuffer_exceeded" };
  if (attempt.timedOut === true) return { ok: false, reason: "process_timeout" };
  if (attempt.signal !== null && attempt.signal !== undefined) return { ok: false, reason: "process_signal" };
  if (attempt.errorCode === "ENOENT") return { ok: false, reason: "spawn_ENOENT" };
  if (attempt.processError === true && !Number.isInteger(attempt.exitCode)) return { ok: false, reason: "spawn_or_process_error" };
  if (attempt.exitCode !== 0) return { ok: false, reason: "nonzero_exit" };
  if (typeof attempt.stderr !== "string" || attempt.stderr.length !== 0) return { ok: false, reason: "stderr_not_empty" };
  if (typeof attempt.stdout !== "string") return { ok: false, reason: "stdout_not_string" };
  const parsed = parseStrictJsonObject(attempt.stdout, "baseline_stdout");
  if (!parsed.ok) return { ok: false, reason: "stdout_not_single_JSON_object" };
  return { ok: true, report: parsed.value };
}

function executeBaselineProcess() {
  return new Promise((resolve) => {
    execFile(process.execPath, [paths.baselineValidator], {
      cwd: repositoryRoot,
      encoding: "utf8",
      timeout: BASELINE_TIMEOUT_MS,
      maxBuffer: BASELINE_MAX_BUFFER,
      windowsHide: true,
      env: { PATH: path.dirname(process.execPath) },
    }, (error, stdout, stderr) => {
      const errorCode = typeof error?.code === "string" ? error.code : null;
      resolve({
        processError: error !== null,
        exitCode: error === null ? 0 : (Number.isInteger(error?.code) ? error.code : null),
        signal: error?.signal ?? null,
        timedOut: error?.killed === true,
        errorCode,
        maxBufferExceeded: errorCode === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER",
        stdout: typeof stdout === "string" ? stdout : "",
        stderr: typeof stderr === "string" ? stderr : "",
      });
    });
  });
}

async function runBaselineValidator(expectedSnapshotSha256, dependencies = {}) {
  const readValidatorBytes = dependencies.readValidatorBytes ?? (() => readFile(paths.baselineValidator));
  const execute = dependencies.execute ?? executeBaselineProcess;
  let preSpawnSha256;
  try {
    preSpawnSha256 = sha256(await readValidatorBytes());
  } catch {
    return { ok: false, reason: "pre_spawn_read_failure", invocation_count: 0, pre_spawn_sha256: null };
  }
  if (preSpawnSha256 !== FROZEN_BASELINE_VALIDATOR_SHA256 || preSpawnSha256 !== expectedSnapshotSha256) {
    return { ok: false, reason: "pre_spawn_SHA_mismatch", invocation_count: 0, pre_spawn_sha256: preSpawnSha256 };
  }
  const attempt = await execute();
  const assessment = assessBaselineAttempt(attempt, { timeoutMs: BASELINE_TIMEOUT_MS, maxBuffer: BASELINE_MAX_BUFFER });
  return { ...assessment, invocation_count: 1, pre_spawn_sha256: preSpawnSha256 };
}

async function readSnapshot() {
  const entries = await Promise.all(Object.entries(paths).map(async ([key, absolutePath]) => {
    const bytes = await readFile(absolutePath);
    return [key, {
      path: path.relative(repositoryRoot, absolutePath),
      sha256: sha256(bytes),
      byte_length: bytes.length,
      bytes,
    }];
  }));
  return Object.fromEntries(entries);
}

function snapshotsEqual(left, right) {
  return equalArrays(Object.keys(left), Object.keys(right))
    && Object.keys(left).every((key) => left[key].path === right[key].path
      && left[key].sha256 === right[key].sha256
      && left[key].byte_length === right[key].byte_length);
}

function publicSnapshotSources(snapshot) {
  return Object.fromEntries(Object.entries(snapshot).map(([key, value]) => [key, {
    path: value.path,
    sha256: value.sha256,
  }]));
}

const C12_INVALID_TRADEOFF_VALUES = Object.freeze([
  "Read docs/schema.json",
  "See ./schema.json",
  "Schema: schema.json",
  "Read schema.json?x ",
]);
const C12_ORDINARY_TRADEOFF_VALUES = Object.freeze([
  "Read docs/schema.json for details",
  "Use schema.json for documentation.",
  "The config.json, when present, is illustrative.",
  "wildcard *.json is documentation text",
  "Documentation is in schema.json",
  "See schema.json)",
]);
const C13_REPOSITORY_EXTENSIONS = Object.freeze(["json", "md", "mjs", "ts"]);
const C13_INVALID_FRAGMENT_ORACLE = Object.freeze([
  Object.freeze({ id: "empty", fragment: "#", reason: "empty_external_fragment" }),
  Object.freeze({ id: "non_pointer", fragment: "#not-a-JSON-Pointer", reason: "fragment_is_not_JSON_Pointer" }),
  Object.freeze({ id: "multiple_hash_markers", fragment: "#/x#y", reason: "invalid_fragment_marker" }),
  Object.freeze({ id: "invalid_percent", fragment: "#/%ZZ", reason: "invalid_fragment_percent_encoding" }),
  Object.freeze({ id: "percent_alias_token", fragment: "#/%74ables/0", reason: "percent_encoded_fragment_alias_not_allowed" }),
  Object.freeze({ id: "invalid_tilde_escape", fragment: "#/x/~2", reason: "invalid_JSON_Pointer_escape" }),
  Object.freeze({ id: "dangling_tilde_escape", fragment: "#/x/~", reason: "invalid_JSON_Pointer_escape" }),
  Object.freeze({ id: "percent_alias_slash", fragment: "#%2Fx", reason: "percent_encoded_fragment_alias_not_allowed" }),
]);
const C13_TERMINAL_PUNCTUATION = Object.freeze([
  Object.freeze({ id: "ASCII_period", value: "." }),
  Object.freeze({ id: "CJK_period", value: "。" }),
  Object.freeze({ id: "ellipsis", value: "…" }),
  Object.freeze({ id: "ASCII_exclamation", value: "!" }),
  Object.freeze({ id: "ASCII_question", value: "?" }),
  Object.freeze({ id: "CJK_exclamation", value: "！" }),
  Object.freeze({ id: "CJK_question", value: "？" }),
  Object.freeze({ id: "ASCII_quote", value: "\"" }),
  Object.freeze({ id: "right_double_quote", value: "”" }),
  Object.freeze({ id: "right_parenthesis", value: ")" }),
  Object.freeze({ id: "fullwidth_right_parenthesis", value: "）" }),
  Object.freeze({ id: "right_bracket", value: "]" }),
  Object.freeze({ id: "CJK_right_bracket", value: "】" }),
  Object.freeze({ id: "greater_than", value: ">" }),
  Object.freeze({ id: "fullwidth_greater_than", value: "＞" }),
  Object.freeze({ id: "Markdown_backtick", value: "`" }),
]);
const C13_TERMINAL_TRAILING = Object.freeze([
  Object.freeze({ id: "empty", value: "" }),
  Object.freeze({ id: "space", value: " " }),
  Object.freeze({ id: "NBSP", value: "\u00A0" }),
  Object.freeze({ id: "tab", value: "\t" }),
  Object.freeze({ id: "newline", value: "\n" }),
  Object.freeze({ id: "NUL", value: "\u0000" }),
  Object.freeze({ id: "DEL", value: "\u007F" }),
]);
const C13_ORDINARY_ORACLE = Object.freeze([
  Object.freeze({ id: "documentation_ASCII_period", value: "Documentation is in schema.json." }),
  Object.freeze({ id: "documentation_CJK_period", value: "Documentation is in schema.json。" }),
  Object.freeze({ id: "bare_backup_suffix", value: "unknown.json.bak" }),
  Object.freeze({ id: "nested_backup_suffix", value: "nested/unknown.json.bak" }),
  Object.freeze({ id: "explicit_backup_suffix", value: "./unknown.json.bak" }),
  Object.freeze({ id: "backup_suffix_prose", value: "Read unknown.json.bak for details" }),
  Object.freeze({ id: "bare_numeric_suffix", value: "unknown.json.1" }),
  Object.freeze({ id: "nested_numeric_suffix", value: "nested/unknown.json.1" }),
  Object.freeze({ id: "bare_connector_suffix", value: "unknown.json_name" }),
  Object.freeze({ id: "nested_connector_suffix", value: "nested/unknown.json_name" }),
  Object.freeze({ id: "bare_dash_suffix", value: "unknown.json-extra" }),
  Object.freeze({ id: "nested_dash_suffix", value: "nested/unknown.json-extra" }),
  Object.freeze({ id: "bare_trailing_prose", value: "unknown.json prose" }),
  Object.freeze({ id: "nested_trailing_prose", value: "nested/unknown.json prose" }),
  Object.freeze({ id: "opening_parenthesis_suffix", value: "nested/unknown.json(" }),
  Object.freeze({ id: "opening_quote_suffix", value: "nested/unknown.json“" }),
  Object.freeze({ id: "fragment_contains_filename_after_prose", value: "Read #schema.json" }),
  Object.freeze({ id: "fragment_contains_path_filename", value: "note#/schema.json" }),
]);
const C13_REASON_PRECEDENCE_ORACLE = Object.freeze([
  Object.freeze({ id: "HTTPS_query_tail", value: "https://x/a.json?x", reason: "non_canonical_file_extension" }),
  Object.freeze({ id: "schema_query_tail", value: "Schema: schema.json?x", reason: "non_canonical_file_extension" }),
  Object.freeze({ id: "HTTPS_scheme", value: "https://x/a.json", reason: "invalid_or_unsupported_URI_scheme" }),
  Object.freeze({ id: "schema_scheme", value: "Schema: schema.json", reason: "invalid_or_unsupported_URI_scheme" }),
  Object.freeze({ id: "filename_colon_tail", value: "unknown.json:x", reason: "non_canonical_file_extension" }),
]);
const EXPECTED_C13_GROUP_DIGESTS = Object.freeze({
  illegal_locator_fragment_cross: "9a89df6bc661403d25b1140875f787b5475fb6f1e78c3f8ec677a195118077c1",
  valid_locator_invalid_fragment_reasons: "ce4c827b78d41c3e9bf6cd10220d7d285c0019dea7a675257012d31b5aaa52a1",
  uppercase_extension_fragment_precedence: "9ddb577db06c63269867dd884cc05790117a490b30cff9a874ac0722dcee93c3",
  valid_fragment_resolver_controls: "1a6560e62de0533faea79482b0e0e029b4016a872dd6e7144d97bd76f11bd5b5",
  terminal_punctuation_matrix: "46b6862ba3ac97cf79d3d174a9fd10a621df8a3ee5d37178b6ee6a702ade411b",
  ordinary_non_candidates: "b5f559aa0b5eb5a06c5707a6f9db0750f17e1162f0febdea9551dfb33af8cc43",
  reason_precedence_oracle: "08a4f6aa57588f87134549bb7171230cd7a5dcd11a966ce89b5b86f2941f3958",
});
const EXPECTED_C13_PROFILE_DIGEST = "29f88b2e67a2aa16484fa5720adf572d7098fe0c0ed6b37be25696cb0bdb90e4";
const EXPECTED_C12_TRADEOFF_DIGEST = "b19d3f019e680376a3f978da4c18add20fe8e0ed86874da7927e250f192861f7";
const EXPECTED_C13_TRADEOFF_DIGEST = "dcc0658681cc2a837daa1290c5875581e0657ba88c7fb5dbf0d8e09d9a800d23";

function buildC13FixtureOracle() {
  const illegalPrefixes = [
    { id: "prose_like", locator: (extension) => `Read schema.${extension}` },
    { id: "prose_path", locator: (extension) => `Read docs/schema.${extension}` },
    { id: "leading_whitespace", locator: (extension) => ` unknown.${extension}` },
    { id: "unicode_parent", locator: (extension) => `嵌套/unknown.${extension}` },
    { id: "repeated_separator", locator: (extension) => `nested//unknown.${extension}` },
    { id: "dot_segment", locator: (extension) => `nested/./unknown.${extension}` },
  ];
  const illegalFragments = [
    { id: "valid_pointer", fragment: "#/x" },
    { id: "invalid_percent", fragment: "#/%ZZ" },
    { id: "percent_alias", fragment: "#/%74ables/0" },
  ];
  const illegal = [];
  for (const extension of C13_REPOSITORY_EXTENSIONS) {
    for (const prefix of illegalPrefixes) {
      for (const fragment of illegalFragments) {
        illegal.push({
          id: `${extension}_${prefix.id}_${fragment.id}`,
          value: `${prefix.locator(extension)}${fragment.fragment}`,
          reason: "invalid_repository_relative_path",
        });
      }
    }
  }

  const invalidFragments = [];
  for (const extension of C13_REPOSITORY_EXTENSIONS) {
    for (const fragment of C13_INVALID_FRAGMENT_ORACLE) {
      invalidFragments.push({
        id: `${extension}_${fragment.id}`,
        value: `unknown.${extension}${fragment.fragment}`,
        reason: fragment.reason,
      });
    }
  }

  const uppercase = [];
  for (const extension of C13_REPOSITORY_EXTENSIONS) {
    for (const fragment of [{ id: "valid_pointer", fragment: "#/x" }, ...C13_INVALID_FRAGMENT_ORACLE]) {
      uppercase.push({
        id: `${extension.toUpperCase()}_${fragment.id}`,
        value: `unknown.${extension.toUpperCase()}${fragment.fragment}`,
        reason: "non_canonical_file_extension",
      });
    }
  }

  const terminalPositions = [
    { id: "bare", locator: (extension) => `unknown.${extension}` },
    { id: "nested", locator: (extension) => `nested/unknown.${extension}` },
    { id: "read_docs_path", locator: (extension) => `Read docs/unknown.${extension}` },
  ];
  const terminal = [];
  for (const extension of C13_REPOSITORY_EXTENSIONS) {
    for (const position of terminalPositions) {
      for (const punctuation of C13_TERMINAL_PUNCTUATION) {
        for (const trailing of C13_TERMINAL_TRAILING) {
          terminal.push({
            id: `${extension}_${position.id}_${punctuation.id}_${trailing.id}`,
            value: `${position.locator(extension)}${punctuation.value}${trailing.value}`,
            reason: "non_canonical_file_extension",
          });
        }
      }
    }
  }

  return Object.freeze({
    illegal_locator_fragment_cross: Object.freeze(illegal),
    valid_locator_invalid_fragment_reasons: Object.freeze(invalidFragments),
    uppercase_extension_fragment_precedence: Object.freeze(uppercase),
    valid_fragment_resolver_controls: Object.freeze(C13_REPOSITORY_EXTENSIONS.map((extension) => ({
      id: extension,
      value: `unknown.${extension}#/x`,
      locator: `unknown.${extension}`,
      fragment: "#/x",
      decoded_fragment_pointer: "/x",
    }))),
    terminal_punctuation_matrix: Object.freeze(terminal),
    ordinary_non_candidates: C13_ORDINARY_ORACLE,
    reason_precedence_oracle: C13_REASON_PRECEDENCE_ORACLE,
  });
}

const C13_FIXTURE_ORACLE = buildC13FixtureOracle();

function c13InvalidFixturePointer(category, id) {
  const propertyKey = `c13_${category}_${id}`.replaceAll(/[^A-Za-z0-9_]/g, "_");
  return `/${propertyKey.replaceAll("~", "~0").replaceAll("/", "~1")}`;
}

function normalizeC13FixtureForDigest(category, fixture) {
  if (category === "valid_fragment_resolver_controls") {
    const classification = fixture?.classification;
    return {
      id: fixture?.id,
      value: fixture?.value,
      passed: fixture?.passed,
      resolver_calls: fixture?.resolver_calls,
      classification: {
        kind: classification?.kind,
        value: classification?.value,
        locator: classification?.locator,
        fragment: classification?.fragment,
        decoded_fragment_pointer: classification?.decoded_fragment_pointer,
        relative_style: classification?.relative_style,
        relative: classification?.relative,
        bounded: classification?.bounded,
      },
    };
  }
  if (category === "ordinary_non_candidates") {
    return {
      id: fixture?.id,
      value: fixture?.value,
      passed: fixture?.passed,
      resolver_calls: fixture?.resolver_calls,
      invalid_reference_count: fixture?.invalid_reference_count,
      all_closures_exact: fixture?.all_closures_exact,
      classification: {
        kind: fixture?.classification?.kind,
        value: fixture?.classification?.value,
      },
    };
  }
  return {
    id: fixture?.id,
    value: fixture?.value,
    expected_reason: fixture?.expected_reason,
    passed: fixture?.passed,
    invalid_reference_count: fixture?.invalid_reference_count,
    matching_invalid_reference_count: fixture?.matching_invalid_reference_count,
    all_closures_exact: fixture?.all_closures_exact,
    resolver_calls: fixture?.resolver_calls,
    classification_kind: fixture?.classification_kind,
    classification_reason: fixture?.classification_reason,
    expected_tuple: fixture?.expected_tuple,
  };
}

function expectedC13FixtureRows(category, includeResolved = false) {
  if (category === "valid_fragment_resolver_controls") {
    return C13_FIXTURE_ORACLE[category].map((fixture) => ({
      id: fixture.id,
      value: fixture.value,
      passed: true,
      resolver_calls: 1,
      classification: {
        kind: "repository_file_reference",
        value: fixture.value,
        locator: fixture.locator,
        fragment: fixture.fragment,
        decoded_fragment_pointer: fixture.decoded_fragment_pointer,
        relative_style: "bare_relative",
        ...(includeResolved ? { resolved: path.resolve(path.dirname(paths.buildPackage), fixture.locator) } : {}),
        relative: `feishu/manifests/${fixture.locator}`,
        bounded: true,
      },
    }));
  }
  if (category === "ordinary_non_candidates") {
    return C13_FIXTURE_ORACLE[category].map((fixture) => ({
      id: fixture.id,
      value: fixture.value,
      passed: true,
      resolver_calls: 0,
      invalid_reference_count: 0,
      all_closures_exact: true,
      classification: {
        kind: "not_repository_file_reference",
        value: fixture.value,
      },
    }));
  }
  return C13_FIXTURE_ORACLE[category].map((fixture) => ({
    id: fixture.id,
    value: fixture.value,
    expected_reason: fixture.reason,
    passed: true,
    invalid_reference_count: 1,
    matching_invalid_reference_count: 1,
    all_closures_exact: true,
    resolver_calls: 0,
    classification_kind: "invalid_repository_file_reference",
    classification_reason: fixture.reason,
    expected_tuple: {
      source: "build",
      pointer: c13InvalidFixturePointer(category, fixture.id),
      value: fixture.value,
      reason: fixture.reason,
    },
  }));
}

function c13RowsSortedById(rows) {
  return [...rows].sort((left, right) => codeUnitCompare(left.id, right.id));
}

function validateC13FixtureOracle(report) {
  const issues = [];
  const observedCounts = {};
  const expectedDigests = {};
  const observedDigests = {};
  const groups = report?.c13_incremental_fixture_results;
  if (!groups || !equalArrays(Object.keys(groups), Object.keys(C13_FIXTURE_ORACLE))) issues.push("C13_exact_group_keys");
  for (const category of Object.keys(C13_FIXTURE_ORACLE)) {
    const actual = groups?.[category];
    const expectedRows = expectedC13FixtureRows(category, true);
    const expectedDigestRows = expectedC13FixtureRows(category, false);
    observedCounts[category] = Array.isArray(actual) ? actual.length : -1;
    expectedDigests[category] = canonicalSha256(c13RowsSortedById(expectedDigestRows));
    const observedRows = Array.isArray(actual) ? actual.map((fixture) => normalizeC13FixtureForDigest(category, fixture)) : [];
    observedDigests[category] = canonicalSha256(c13RowsSortedById(observedRows));
    const expectedIds = expectedRows.map((fixture) => fixture.id);
    const expectedValues = expectedRows.map((fixture) => fixture.value);
    const actualIds = Array.isArray(actual) ? actual.map((fixture) => fixture?.id) : [];
    const actualValues = Array.isArray(actual) ? actual.map((fixture) => fixture?.value) : [];
    if (new Set(expectedIds).size !== expectedIds.length || new Set(expectedValues).size !== expectedValues.length) issues.push(`C13_oracle_uniqueness:${category}`);
    if (!Array.isArray(actual)
      || actual.length !== expectedRows.length
      || new Set(actualIds).size !== actualIds.length
      || new Set(actualValues).size !== actualValues.length
      || canonicalJson(c13RowsSortedById(actual)) !== canonicalJson(c13RowsSortedById(expectedRows))) issues.push(`C13_fixture_oracle:${category}`);
    if (expectedDigests[category] !== EXPECTED_C13_GROUP_DIGESTS[category]
      || observedDigests[category] !== EXPECTED_C13_GROUP_DIGESTS[category]) issues.push(`C13_fixture_digest:${category}`);
  }
  const expectedProfile = Object.fromEntries(Object.keys(C13_FIXTURE_ORACLE).map((category) => [category, {
    count: C13_FIXTURE_ORACLE[category].length,
    digest: expectedDigests[category],
  }]));
  const observedProfile = Object.fromEntries(Object.keys(C13_FIXTURE_ORACLE).map((category) => [category, {
    count: observedCounts[category],
    digest: observedDigests[category],
  }]));
  const expectedProfileDigest = canonicalSha256(expectedProfile);
  const observedProfileDigest = canonicalSha256(observedProfile);
  if (expectedProfileDigest !== EXPECTED_C13_PROFILE_DIGEST || observedProfileDigest !== EXPECTED_C13_PROFILE_DIGEST) issues.push("C13_fixture_profile_digest");
  return {
    issues,
    observed: {
      group_counts: observedCounts,
      group_digests: observedDigests,
      profile_digest: observedProfileDigest,
    },
    expected: {
      group_counts: Object.fromEntries(Object.entries(C13_FIXTURE_ORACLE).map(([key, value]) => [key, value.length])),
      group_digests: expectedDigests,
      profile_digest: expectedProfileDigest,
    },
  };
}

function validateAcceptedTradeoffs(report) {
  const issues = [];
  const c12 = report?.c12_accepted_security_tradeoff;
  const c12ExpectedInvalid = [...C12_INVALID_TRADEOFF_VALUES].sort(codeUnitCompare);
  const c12ExpectedOrdinary = [...C12_ORDINARY_TRADEOFF_VALUES].sort(codeUnitCompare);
  const c12ObservedInvalid = (report?.c12_incremental_fixture_results?.ambiguous_path_end_policy?.map((fixture) => fixture?.value) ?? []).sort(codeUnitCompare);
  const c12ObservedOrdinary = (report?.c11_incremental_fixture_results?.ordinary_text_controls?.map((fixture) => fixture?.value) ?? []).sort(codeUnitCompare);
  const c12TradeoffInvalid = [...(c12?.invalid_values ?? [])].sort(codeUnitCompare);
  const c12TradeoffOrdinary = [...(c12?.ordinary_values ?? [])].sort(codeUnitCompare);
  const c12RecomputedExactAndDisjoint = equalArrays(c12ObservedInvalid, c12ExpectedInvalid)
    && equalArrays(c12ObservedOrdinary, c12ExpectedOrdinary)
    && c12ObservedInvalid.every((value) => !c12ObservedOrdinary.includes(value));
  const c12Normalized = {
    status: c12?.status,
    policy_scope: c12?.policy_scope,
    invalid_values: c12TradeoffInvalid,
    ordinary_values: c12TradeoffOrdinary,
    sets_are_exact_and_disjoint: c12?.sets_are_exact_and_disjoint,
  };
  const c12Digest = canonicalSha256(c12Normalized);
  if (c12?.status !== "accepted"
    || c12?.policy_scope !== "explicit_path_syntax_signal_at_sentence_end"
    || !equalArrays(c12TradeoffInvalid, c12ExpectedInvalid)
    || !equalArrays(c12TradeoffOrdinary, c12ExpectedOrdinary)
    || !equalArrays(c12TradeoffInvalid, c12ObservedInvalid)
    || !equalArrays(c12TradeoffOrdinary, c12ObservedOrdinary)
    || c12?.sets_are_exact_and_disjoint !== true
    || c12Digest !== EXPECTED_C12_TRADEOFF_DIGEST
    || !c12RecomputedExactAndDisjoint) issues.push("C12_tradeoff_exact_sets");

  const c13 = report?.c13_accepted_security_tradeoff;
  const c13Fixtures = report?.c13_incremental_fixture_results;
  const c13ExpectedReasons = [...C13_REASON_PRECEDENCE_ORACLE].sort((left, right) => codeUnitCompare(left.id, right.id));
  const c13ObservedReasons = (c13Fixtures?.reason_precedence_oracle?.map((fixture) => ({
    id: fixture?.id,
    value: fixture?.value,
    reason: fixture?.expected_reason,
  })) ?? []).sort((left, right) => codeUnitCompare(left.id, right.id));
  const c13ObservedOrdinary = (c13Fixtures?.ordinary_non_candidates?.map((fixture) => fixture?.value) ?? []).sort(codeUnitCompare);
  const c13ObservedTerminal = c13Fixtures?.terminal_punctuation_matrix?.map((fixture) => fixture?.value) ?? [];
  const c13TradeoffReasons = [...(c13?.reason_precedence ?? [])].sort((left, right) => codeUnitCompare(left.id, right.id));
  const c13TradeoffOrdinary = [...(c13?.ordinary_values ?? [])].sort(codeUnitCompare);
  const c13ExpectedOrdinary = C13_ORDINARY_ORACLE.map((fixture) => fixture.value).sort(codeUnitCompare);
  const c13RecomputedDisjoint = c13ObservedOrdinary.every((value) => !c13ObservedTerminal.includes(value));
  const c13Normalized = {
    status: c13?.status,
    policy_scope: c13?.policy_scope,
    reason_precedence: c13TradeoffReasons,
    ordinary_values: c13TradeoffOrdinary,
    terminal_negative_value_count: c13?.terminal_negative_value_count,
    ordinary_and_terminal_sets_are_disjoint: c13?.ordinary_and_terminal_sets_are_disjoint,
  };
  const c13Digest = canonicalSha256(c13Normalized);
  if (c13?.status !== "accepted"
    || c13?.policy_scope !== "fragment_is_strong_path_syntax_but_terminal_punctuation_requires_path_shaped_prefix"
    || canonicalJson(c13TradeoffReasons) !== canonicalJson(c13ExpectedReasons)
    || canonicalJson(c13TradeoffReasons) !== canonicalJson(c13ObservedReasons)
    || !equalArrays(c13TradeoffOrdinary, c13ExpectedOrdinary)
    || !equalArrays(c13TradeoffOrdinary, c13ObservedOrdinary)
    || c13?.terminal_negative_value_count !== C13_FIXTURE_ORACLE.terminal_punctuation_matrix.length
    || c13?.terminal_negative_value_count !== c13ObservedTerminal.length
    || c13?.ordinary_and_terminal_sets_are_disjoint !== true
    || c13Digest !== EXPECTED_C13_TRADEOFF_DIGEST
    || !c13RecomputedDisjoint) issues.push("C13_tradeoff_exact_sets");
  return {
    issues,
    observed: {
      c12: {
        status: c12?.status,
        policy_scope: c12?.policy_scope,
        invalid_value_count: c12ObservedInvalid.length,
        ordinary_value_count: c12ObservedOrdinary.length,
        digest: c12Digest,
        exact_and_disjoint_recomputed: c12RecomputedExactAndDisjoint,
      },
      c13: {
        status: c13?.status,
        policy_scope: c13?.policy_scope,
        reason_precedence_count: c13ObservedReasons.length,
        ordinary_value_count: c13ObservedOrdinary.length,
        terminal_negative_value_count: c13ObservedTerminal.length,
        digest: c13Digest,
        ordinary_and_terminal_disjoint_recomputed: c13RecomputedDisjoint,
      },
    },
  };
}

function validateBaselineProfile(report) {
  const issues = [];
  if (!report || Array.isArray(report) || typeof report !== "object") return ["report_shape"];
  if (!exactOwnKeys(report, EXPECTED_CONTRACT_REPORT_ROOT_KEYS) || report.report_schema_version !== "contract_alignment_report.v1") issues.push("report_root_exact_schema");
  if (report.status !== "passed") issues.push("status");
  if (report.mode !== "read_only") issues.push("mode");
  if (report.summary?.passed_checks !== EXPECTED_BASELINE_ASSERTION_COUNT || report.summary?.failed_checks !== 0 || report.summary?.upstream_conflicts !== 0) issues.push("summary");
  if (!Array.isArray(report.failed_checks) || report.failed_checks.length !== 0) issues.push("failed_checks");
  if (!Array.isArray(report.upstream_conflicts) || report.upstream_conflicts.length !== 0) issues.push("upstream_conflicts");
  if (!Array.isArray(report.errors) || report.errors.length !== 0) issues.push("errors");

  const groupKeys = Object.keys(report.check_groups ?? {});
  if (!equalArrays(groupKeys, Object.keys(EXPECTED_BASELINE_GROUP_COUNTS))) issues.push("check_group_keys");
  const expectedGroupTotal = Object.values(EXPECTED_BASELINE_GROUP_COUNTS).reduce((count, value) => count + value, 0);
  const reportedGroupTotal = Object.values(report.check_groups ?? {}).reduce((count, group) => count + (group?.passed_checks ?? 0), 0);
  if (expectedGroupTotal !== EXPECTED_BASELINE_ASSERTION_COUNT || reportedGroupTotal !== EXPECTED_BASELINE_ASSERTION_COUNT) issues.push("check_group_total");
  for (const [key, expectedCount] of Object.entries(EXPECTED_BASELINE_GROUP_COUNTS)) {
    const group = report.check_groups?.[key];
    if (group?.status !== "passed" || group?.passed_checks !== expectedCount || !Array.isArray(group?.failed_checks) || group.failed_checks.length !== 0) issues.push(`check_group:${key}`);
  }

  const c13 = report.c13_incremental_fixture_results;
  if (!c13 || !equalArrays(Object.keys(c13), Object.keys(EXPECTED_C13_GROUP_LENGTHS))) issues.push("c13_group_keys");
  for (const [key, expectedLength] of Object.entries(EXPECTED_C13_GROUP_LENGTHS)) {
    if (!Array.isArray(c13?.[key]) || c13[key].length !== expectedLength) issues.push(`c13_group:${key}`);
  }
  const c13OracleValidation = validateC13FixtureOracle(report);
  if (c13OracleValidation.issues.length > 0) issues.push(...c13OracleValidation.issues);

  const closures = report.reference_graph?.literal_reference_closures;
  for (const [key, expected] of Object.entries(EXPECTED_LITERAL_CLOSURES)) {
    const closure = closures?.[key];
    if (closure?.count !== expected.count || closure?.expected_count !== expected.count
      || closure?.digest !== expected.digest || closure?.expected_digest !== expected.digest || closure?.exact !== true) issues.push(`closure:${key}`);
  }
  if (report.reference_graph?.counts?.external_repository_file_literal_references !== 60
    || report.reference_graph?.counts?.internal_JSON_Pointer_literal_references !== 32
    || report.reference_graph?.counts?.known_scheme_literal_references !== 568) issues.push("closure_reference_graph_counts");
  if (!Array.isArray(closures?.invalid_references) || closures.invalid_references.length !== 0) issues.push("closure_invalid_references");

  const c12 = report.c12_accepted_security_tradeoff;
  if (c12?.status !== "accepted"
    || c12?.policy_scope !== "explicit_path_syntax_signal_at_sentence_end"
    || c12?.invalid_values?.length !== 4
    || c12?.ordinary_values?.length !== 6
    || c12?.sets_are_exact_and_disjoint !== true) issues.push("c12_tradeoff");
  const c13Tradeoff = report.c13_accepted_security_tradeoff;
  if (c13Tradeoff?.status !== "accepted"
    || c13Tradeoff?.policy_scope !== "fragment_is_strong_path_syntax_but_terminal_punctuation_requires_path_shaped_prefix"
    || c13Tradeoff?.reason_precedence?.length !== 5
    || c13Tradeoff?.ordinary_values?.length !== 18
    || c13Tradeoff?.terminal_negative_value_count !== 1344
    || c13Tradeoff?.ordinary_and_terminal_sets_are_disjoint !== true) issues.push("c13_tradeoff");
  const acceptedTradeoffValidation = validateAcceptedTradeoffs(report);
  if (acceptedTradeoffValidation.issues.length > 0) issues.push(...acceptedTradeoffValidation.issues);
  if (report.versions?.logical_manifest_version !== "0.1.6" || report.versions?.build_package_version !== "0.1.5") issues.push("versions");
  issues.push(...validatePermissionResultContractAttestation(report));
  return issues;
}

function validatePermissionResultContractAttestation(report) {
  const issues = [];
  const attestation = report?.permission_result_contract;
  const expectedSourceRows = EXPECTED_PERMISSION_CONTENT_FREEZE
    .filter((source) => source.id !== "r10_plan")
    .map(({ id, path: sourcePath, sha256 }) => ({ id, path: sourcePath, sha256 }));
  if (!exactOwnKeys(attestation, EXPECTED_PERMISSION_ATTESTATION_KEYS)
    || attestation?.attestation_schema_version !== EXPECTED_PERMISSION_RESULT_CONTRACT.attestation_schema_version
    || attestation?.source_freeze_version !== EXPECTED_PERMISSION_RESULT_CONTRACT.source_freeze_version
    || attestation?.status !== "passed"
    || attestation?.check_group !== "permission_result_contract"
    || attestation?.assertion_count !== EXPECTED_PERMISSION_RESULT_CONTRACT.assertion_count
    || attestation?.failed_assertion_count !== 0
    || attestation?.negative_fixture_count !== EXPECTED_PERMISSION_RESULT_CONTRACT.negative_fixture_count
    || attestation?.negative_fixture_name_digest !== EXPECTED_PERMISSION_RESULT_CONTRACT.negative_fixture_name_digest
    || !exactOwnKeys(attestation?.versions, ["probe_suite", "permission_results", "evidence_template"])
    || !exactOwnKeys(attestation?.counts, ["state_truth_rows", "permission_records", "exact_fields", "required_runtime_fields", "declared_field_types", "P03_phases"])
    || canonicalJson(attestation?.versions) !== canonicalJson(EXPECTED_PERMISSION_RESULT_CONTRACT.versions)
    || canonicalJson(attestation?.counts) !== canonicalJson(EXPECTED_PERMISSION_RESULT_CONTRACT.counts)
    || attestation?.canonical_evidence_source !== "permission_result.evidence_index"
    || attestation?.canonical_evidence_binding !== "permission_result.evidence_and_same_Pnn_on_site.structured_evidence_index_canonical_deep_equal"
    || attestation?.P03_phase_binding !== "phase_evidence_indexes_canonical_deep_equal_parent_P03_indexes_filtered_by_capture_phase_in_same_order_with_unique_evidence_id"
    || canonicalJson(attestation?.P06_dependencies) !== canonicalJson(["P02", "P05"])
    || canonicalJson(attestation?.P07_dependencies) !== canonicalJson(["P02", "P05"])
    || attestation?.source_count !== EXPECTED_PERMISSION_RESULT_CONTRACT.source_count
    || attestation?.source_digest !== EXPECTED_PERMISSION_RESULT_CONTRACT.source_digest
    || attestation?.current_execution_status !== "not_tested"
    || attestation?.real_external_operations !== 0) issues.push("permission_result_contract_shape");
  const negativeFixtures = attestation?.negative_fixtures;
  if (!Array.isArray(negativeFixtures)
    || negativeFixtures.length !== EXPECTED_PERMISSION_NEGATIVE_FIXTURE_IDS.length
    || canonicalJson(negativeFixtures.map((fixture) => fixture?.id)) !== canonicalJson(EXPECTED_PERMISSION_NEGATIVE_FIXTURE_IDS)
    || canonicalSha256(negativeFixtures.map((fixture) => fixture?.id).sort(codeUnitCompare)) !== EXPECTED_PERMISSION_RESULT_CONTRACT.negative_fixture_name_digest
    || canonicalSha256(negativeFixtures) !== EXPECTED_PERMISSION_RESULT_CONTRACT.negative_fixture_digest
    || negativeFixtures.some((fixture) => !exactOwnKeys(fixture, ["id", "rejected"]) || fixture.rejected !== true)) issues.push("permission_result_contract_negative_fixtures");
  if (canonicalJson(attestation?.sources) !== canonicalJson(expectedSourceRows)
    || canonicalTupleSetDigest(attestation?.sources ?? []) !== EXPECTED_PERMISSION_RESULT_CONTRACT.source_digest) issues.push("permission_result_contract_sources");
  return issues;
}

function permissionContentFreezeFromSnapshot(snapshot) {
  return EXPECTED_PERMISSION_CONTENT_FREEZE.map(({ id, snapshot_key: snapshotKey }) => ({
    id,
    path: snapshot?.[snapshotKey]?.path,
    sha256: snapshot?.[snapshotKey]?.sha256,
  }));
}

function expectedPermissionContentFreezeRows() {
  return EXPECTED_PERMISSION_CONTENT_FREEZE.map(({ id, path: sourcePath, sha256 }) => ({ id, path: sourcePath, sha256 }));
}

function expectedObservedPermissionResultContract() {
  return {
    attestation_schema_version: EXPECTED_PERMISSION_RESULT_CONTRACT.attestation_schema_version,
    source_freeze_version: EXPECTED_PERMISSION_RESULT_CONTRACT.source_freeze_version,
    status: "passed",
    check_group: "permission_result_contract",
    assertion_count: EXPECTED_PERMISSION_RESULT_CONTRACT.assertion_count,
    failed_assertion_count: 0,
    negative_fixture_count: EXPECTED_PERMISSION_RESULT_CONTRACT.negative_fixture_count,
    negative_fixtures: EXPECTED_PERMISSION_NEGATIVE_FIXTURE_IDS.map((id) => ({ id, rejected: true })),
    negative_fixture_name_digest: EXPECTED_PERMISSION_RESULT_CONTRACT.negative_fixture_name_digest,
    versions: EXPECTED_PERMISSION_RESULT_CONTRACT.versions,
    counts: EXPECTED_PERMISSION_RESULT_CONTRACT.counts,
    canonical_evidence_source: "permission_result.evidence_index",
    canonical_evidence_binding: "permission_result.evidence_and_same_Pnn_on_site.structured_evidence_index_canonical_deep_equal",
    P03_phase_binding: "phase_evidence_indexes_canonical_deep_equal_parent_P03_indexes_filtered_by_capture_phase_in_same_order_with_unique_evidence_id",
    P06_dependencies: ["P02", "P05"],
    P07_dependencies: ["P02", "P05"],
    sources: EXPECTED_PERMISSION_CONTENT_FREEZE
      .filter((source) => source.id !== "r10_plan")
      .map(({ id, path: sourcePath, sha256 }) => ({ id, path: sourcePath, sha256 })),
    source_count: EXPECTED_PERMISSION_RESULT_CONTRACT.source_count,
    source_digest: EXPECTED_PERMISSION_RESULT_CONTRACT.source_digest,
    current_execution_status: "not_tested",
    real_external_operations: 0,
  };
}

function validateBaselineSources(report, snapshot) {
  const expected = {
    logical_manifest: "logicalManifest",
    build_package: "buildPackage",
    evidence_template: "evidenceTemplate",
    permission_matrix: "permissionMatrix",
    typescript_canonical_contract: "t3Contract",
  };
  if (!Array.isArray(report?.sources)) return ["sources_shape"];
  const issues = [];
  for (const [id, snapshotKey] of Object.entries(expected)) {
    const matches = report.sources.filter((source) => source?.id === id);
    if (matches.length !== 1) {
      issues.push(`source_cardinality:${id}`);
      continue;
    }
    if (!exactOwnKeys(matches[0], ["id", "path", "sha256"])
      || matches[0].path !== snapshot[snapshotKey].path
      || matches[0].sha256 !== snapshot[snapshotKey].sha256) issues.push(`source_attestation:${id}`);
  }
  return issues;
}

function valuesAreNull(value) {
  if (value === null) return true;
  if (Array.isArray(value)) return value.every(valuesAreNull);
  if (typeof value === "object") return Object.values(value).every(valuesAreNull);
  return false;
}

async function main() {
const snapshotA = await readSnapshot();

const strictJsonFixtures = [
  { name: "duplicate_key", raw: '{"a":1,"a":2}', rejected: (analysis) => analysis.duplicate_keys.length === 1 },
  { name: "decoded_unicode_alias", raw: '{"a":1,"\\u0061":2}', rejected: (analysis) => analysis.duplicate_keys.length === 1 },
  { name: "decoded_escape_alias", raw: '{"a/b":1,"a\\/b":2}', rejected: (analysis) => analysis.duplicate_keys.length === 1 },
  { name: "negative_zero", raw: '{"value":-0}', rejected: (analysis) => analysis.number_findings.some((finding) => finding.reason === "negative_zero_JSON_number") },
  { name: "non_finite_exponent", raw: '{"value":1e309}', rejected: (analysis) => analysis.number_findings.some((finding) => finding.reason === "non_finite_JSON_number") },
  { name: "invalid_JSON", raw: '{"value":}', rejected: (analysis) => analysis.syntax_errors.length === 1 },
  { name: "multiple_JSON_values", raw: '{}{}', rejected: (analysis) => analysis.syntax_errors.length === 1 },
];
const strictJsonFixtureResults = strictJsonFixtures.map((fixture) => recordNegativeTest(
  "strict_JSON",
  fixture.name,
  fixture.rejected(analyzeStrictJsonText(fixture.raw, fixture.name)),
));
assertInGroup("strict_input_snapshot", "strict_JSON_negative_matrix_rejects_duplicate_alias_negative_zero_nonfinite_and_syntax", strictJsonFixtureResults.every(Boolean), strictJsonFixtureResults);

const validTransport = {
  processError: false,
  exitCode: 0,
  signal: null,
  timedOut: false,
  errorCode: null,
  maxBufferExceeded: false,
  stdout: '{"status":"passed"}',
  stderr: "",
};
const processFixtures = [
  { name: "nonzero_with_fake_passed_stdout", attempt: { ...validTransport, processError: true, exitCode: 7 }, expected: "nonzero_exit" },
  { name: "signal", attempt: { ...validTransport, processError: true, exitCode: null, signal: "SIGTERM" }, expected: "process_signal" },
  { name: "empty_stdout", attempt: { ...validTransport, stdout: "" }, expected: "stdout_not_single_JSON_object" },
  { name: "invalid_stdout", attempt: { ...validTransport, stdout: "{" }, expected: "stdout_not_single_JSON_object" },
  { name: "multiple_JSON_stdout", attempt: { ...validTransport, stdout: "{}{}" }, expected: "stdout_not_single_JSON_object" },
  { name: "stderr", attempt: { ...validTransport, stderr: "provider detail" }, expected: "stderr_not_empty" },
  { name: "timeout_event", attempt: { ...validTransport, processError: true, exitCode: null, timedOut: true, signal: "SIGTERM" }, expected: "process_timeout" },
  { name: "ENOENT", attempt: { ...validTransport, processError: true, exitCode: null, errorCode: "ENOENT" }, expected: "spawn_ENOENT" },
  { name: "maxBuffer", attempt: { ...validTransport, processError: true, exitCode: null, errorCode: "ERR_CHILD_PROCESS_STDIO_MAXBUFFER", maxBufferExceeded: true }, expected: "maxBuffer_exceeded" },
];
const processFixtureResults = processFixtures.map((fixture) => {
  const assessment = assessBaselineAttempt(fixture.attempt, { timeoutMs: BASELINE_TIMEOUT_MS, maxBuffer: BASELINE_MAX_BUFFER });
  return recordNegativeTest("baseline_process", fixture.name, assessment.ok === false && assessment.reason === fixture.expected);
});
const timeoutConfigRejected = assessBaselineAttempt(validTransport, { timeoutMs: 60_001, maxBuffer: BASELINE_MAX_BUFFER });
processFixtureResults.push(recordNegativeTest("baseline_process", "timeout_configuration", timeoutConfigRejected.ok === false && timeoutConfigRejected.reason === "invalid_timeout_configuration"));
let blockedSpawnInvocationCount = 0;
const preSpawnMismatchAssessment = await runBaselineValidator(FROZEN_BASELINE_VALIDATOR_SHA256, {
  readValidatorBytes: async () => Buffer.from("stable_SHA_mismatch_fixture", "utf8"),
  execute: async () => {
    blockedSpawnInvocationCount += 1;
    return validTransport;
  },
});
let initialMismatchInvocationCount = 0;
const initialSnapshotMismatchAssessment = await runBaselineValidator("0".repeat(64), {
  readValidatorBytes: async () => snapshotA.baselineValidator.bytes,
  execute: async () => {
    initialMismatchInvocationCount += 1;
    return validTransport;
  },
});
processFixtureResults.push(recordNegativeTest(
  "baseline_process",
  "stable_SHA_mismatch_zero_spawn",
  preSpawnMismatchAssessment.ok === false
    && preSpawnMismatchAssessment.reason === "pre_spawn_SHA_mismatch"
    && preSpawnMismatchAssessment.invocation_count === 0
    && blockedSpawnInvocationCount === 0
    && initialSnapshotMismatchAssessment.ok === false
    && initialSnapshotMismatchAssessment.reason === "pre_spawn_SHA_mismatch"
    && initialSnapshotMismatchAssessment.pre_spawn_sha256 === FROZEN_BASELINE_VALIDATOR_SHA256
    && initialSnapshotMismatchAssessment.invocation_count === 0
    && initialMismatchInvocationCount === 0,
));
assertInGroup("baseline_integrity", "baseline_process_negative_matrix_rejects_untrusted_transport_before_stdout", processFixtureResults.every(Boolean), processFixtureResults);
assertInGroup("baseline_integrity", "baseline_exec_configuration_is_bounded", BASELINE_TIMEOUT_MS > 0 && BASELINE_TIMEOUT_MS <= 60_000 && BASELINE_MAX_BUFFER === 10 * 1024 * 1024, {
  timeout_ms: BASELINE_TIMEOUT_MS,
  max_buffer: BASELINE_MAX_BUFFER,
});

const snapshotMutationRejected = !snapshotsEqual(
  { input: { path: "fixture", sha256: "a", byte_length: 1 } },
  { input: { path: "fixture", sha256: "b", byte_length: 1 } },
);
recordNegativeTest("snapshot", "byte_sha_mismatch", snapshotMutationRejected);
assertInGroup("strict_input_snapshot", "snapshot_negative_control_rejects_byte_SHA_mismatch", snapshotMutationRejected, snapshotMutationRejected);

const logicalManifestText = snapshotA.logicalManifest.bytes.toString("utf8");
const buildPackageText = snapshotA.buildPackage.bytes.toString("utf8");
const resourceMappingText = snapshotA.resourceMapping.bytes.toString("utf8");
const evidenceTemplateText = snapshotA.evidenceTemplate.bytes.toString("utf8");
const permissionMatrix = snapshotA.permissionMatrix.bytes.toString("utf8");
const buildRunbook = snapshotA.buildRunbook.bytes.toString("utf8");
const rollbackRunbook = snapshotA.rollbackRunbook.bytes.toString("utf8");
const permissionRunbook = snapshotA.permissionRunbook.bytes.toString("utf8");
const t3Contract = snapshotA.t3Contract.bytes.toString("utf8");

const strictInputs = {
  logical: parseStrictJsonObject(logicalManifestText, "logical"),
  build: parseStrictJsonObject(buildPackageText, "build"),
  resource: parseStrictJsonObject(resourceMappingText, "resource"),
  evidence: parseStrictJsonObject(evidenceTemplateText, "evidence"),
};
assertInGroup("strict_input_snapshot", "four_offline_JSON_inputs_pass_raw_strict_object_validation", Object.values(strictInputs).every((entry) => entry.ok), Object.fromEntries(Object.entries(strictInputs).map(([key, entry]) => [key, entry.analysis])));
if (!Object.values(strictInputs).every((entry) => entry.ok)) throw new Error("offline_input_rejected");

const logical = strictInputs.logical.value;
const build = strictInputs.build.value;
const resource = strictInputs.resource.value;
const evidence = strictInputs.evidence.value;

const baselineShaMatches = snapshotA.baselineValidator.sha256 === FROZEN_BASELINE_VALIDATOR_SHA256;
assertInGroup("baseline_integrity", "R10_contract_validator_SHA_is_frozen_before_spawn", baselineShaMatches, snapshotA.baselineValidator);
const baselineAssessment = await runBaselineValidator(snapshotA.baselineValidator.sha256);
assertInGroup("baseline_integrity", "R10_contract_validator_SHA_is_rechecked_immediately_before_path_spawn", baselineAssessment.pre_spawn_sha256 === FROZEN_BASELINE_VALIDATOR_SHA256
  && baselineAssessment.invocation_count === 1, baselineAssessment);
assertInGroup("baseline_integrity", "R10_contract_validator_exit0_empty_stderr_and_single_JSON_object", baselineAssessment.ok === true, baselineAssessment);
const baseline = baselineAssessment.ok ? baselineAssessment.report : null;

const baselineProfileIssues = validateBaselineProfile(baseline);
const baselineC13OracleValidation = validateC13FixtureOracle(baseline);
const baselineTradeoffValidation = validateAcceptedTradeoffs(baseline);
assertInGroup("baseline_integrity", "R10_contract_report_matches_frozen_profile", baselineProfileIssues.length === 0, baselineProfileIssues);

const baselineMutationCases = baseline ? [
  { name: "report_count", mutate: (copy) => { copy.summary.passed_checks -= 1; } },
  { name: "report_group", mutate: (copy) => { delete copy.check_groups.artifact_versions; } },
  { name: "C13_length", mutate: (copy) => { copy.c13_incremental_fixture_results.reason_precedence_oracle.pop(); } },
  { name: "closure_digest", mutate: (copy) => { copy.reference_graph.literal_reference_closures.external_repository_files.digest = "0".repeat(64); } },
  { name: "mode", mutate: (copy) => { copy.mode = "write"; } },
  { name: "tradeoff", mutate: (copy) => { copy.c12_accepted_security_tradeoff.status = "pending"; } },
  { name: "C13_invalid_value_and_tuple_same_length", mutate: (copy) => {
    const fixture = copy.c13_incremental_fixture_results.illegal_locator_fragment_cross[0];
    fixture.value = `${fixture.value.slice(0, -1)}y`;
    fixture.expected_tuple.value = fixture.value;
  } },
  { name: "C13_invalid_reason_triplet_same_length", mutate: (copy) => {
    const fixture = copy.c13_incremental_fixture_results.valid_locator_invalid_fragment_reasons[0];
    const replacement = "x".repeat(fixture.expected_reason.length);
    fixture.expected_reason = replacement;
    fixture.classification_reason = replacement;
    fixture.expected_tuple.reason = replacement;
  } },
  { name: "C13_invalid_pointer_same_length", mutate: (copy) => {
    const tuple = copy.c13_incremental_fixture_results.uppercase_extension_fragment_precedence[0].expected_tuple;
    tuple.pointer = `${tuple.pointer.slice(0, -1)}x`;
  } },
  { name: "C13_invalid_count_same_cardinality", mutate: (copy) => {
    copy.c13_incremental_fixture_results.reason_precedence_oracle[0].invalid_reference_count = 2;
  } },
  { name: "C13_valid_control_locator_same_length", mutate: (copy) => {
    copy.c13_incremental_fixture_results.valid_fragment_resolver_controls[0].classification.locator = "unknown.mson";
  } },
  { name: "C13_ordinary_value_and_classification_same_length", mutate: (copy) => {
    const fixture = copy.c13_incremental_fixture_results.ordinary_non_candidates[0];
    fixture.value = `${fixture.value.slice(0, -1)}!`;
    fixture.classification.value = fixture.value;
  } },
  { name: "C13_terminal_duplicate_same_cardinality", mutate: (copy) => {
    const fixtures = copy.c13_incremental_fixture_results.terminal_punctuation_matrix;
    fixtures[fixtures.length - 1] = structuredClone(fixtures[0]);
  } },
  { name: "C12_invalid_tradeoff_replacement_same_length", mutate: (copy) => {
    const value = copy.c12_accepted_security_tradeoff.invalid_values[0];
    copy.c12_accepted_security_tradeoff.invalid_values[0] = `${value.slice(0, -1)}x`;
  } },
  { name: "C12_ordinary_tradeoff_replacement_same_length", mutate: (copy) => {
    const value = copy.c12_accepted_security_tradeoff.ordinary_values[0];
    copy.c12_accepted_security_tradeoff.ordinary_values[0] = `${value.slice(0, -1)}x`;
  } },
  { name: "C13_precedence_tradeoff_replacement_same_cardinality", mutate: (copy) => {
    const fixture = copy.c13_accepted_security_tradeoff.reason_precedence[0];
    fixture.value = `${fixture.value.slice(0, -1)}y`;
    fixture.reason = "x".repeat(fixture.reason.length);
  } },
  { name: "C13_ordinary_tradeoff_replacement_same_length", mutate: (copy) => {
    const values = copy.c13_accepted_security_tradeoff.ordinary_values;
    values[0] = `${values[0].slice(0, -1)}!`;
  } },
  { name: "permission_result_contract_count", mutate: (copy) => {
    copy.permission_result_contract.assertion_count -= 1;
  } },
  { name: "permission_result_contract_source_digest", mutate: (copy) => {
    copy.permission_result_contract.source_digest = "0".repeat(64);
  } },
  { name: "permission_result_contract_dependency", mutate: (copy) => {
    copy.permission_result_contract.P06_dependencies = ["P05"];
  } },
  { name: "permission_contract_attestation_extra_key", mutate: (copy) => {
    copy.permission_result_contract.unexpected = null;
  } },
  { name: "permission_contract_attestation_missing_key", mutate: (copy) => {
    delete copy.permission_result_contract.source_freeze_version;
  } },
  { name: "permission_contract_attestation_same_cardinality_rename", mutate: (copy) => {
    copy.permission_result_contract.source_freeze_versioN = copy.permission_result_contract.source_freeze_version;
    delete copy.permission_result_contract.source_freeze_version;
  } },
] : [];
const baselineMutationResults = baselineMutationCases.map(({ name, mutate }) => {
  const copy = structuredClone(baseline);
  mutate(copy);
  return recordNegativeTest("baseline_profile", name, validateBaselineProfile(copy).length > 0);
});
assertInGroup("baseline_integrity", "baseline_profile_mutation_matrix_rejects_shape_content_digest_tradeoff_and_permission_contract_drift", baselineMutationResults.length === 23 && baselineMutationResults.every(Boolean), baselineMutationResults);

const baselineSourceIssues = validateBaselineSources(baseline, snapshotA);
assertInGroup("current_version_chain", "baseline_selected_source_path_and_SHA_attest_snapshot_A", baselineSourceIssues.length === 0, baselineSourceIssues);
const expectedPermissionContentFreeze = expectedPermissionContentFreezeRows();
const observedPermissionContentFreezeA = permissionContentFreezeFromSnapshot(snapshotA);
const permissionContentFreezeDigest = canonicalSha256(expectedPermissionContentFreeze);
assertInGroup("current_version_chain", "R10_plan_and_five_permission_content_files_match_frozen_paths_SHAs_and_digest", canonicalJson(observedPermissionContentFreezeA) === canonicalJson(expectedPermissionContentFreeze)
  && permissionContentFreezeDigest === EXPECTED_PERMISSION_CONTENT_FREEZE_DIGEST
  && canonicalSha256(observedPermissionContentFreezeA) === EXPECTED_PERMISSION_CONTENT_FREEZE_DIGEST, observedPermissionContentFreezeA);
const baselinePermissionContractIssues = validatePermissionResultContractAttestation(baseline);
assertInGroup("baseline_integrity", "contract_permission_result_attestation_is_exact_and_fail_closed", baselinePermissionContractIssues.length === 0, baselinePermissionContractIssues);

const snapshotB = await readSnapshot();
assertInGroup("strict_input_snapshot", "all_baseline_and_offline_input_bytes_are_stable_between_snapshot_A_and_B", snapshotsEqual(snapshotA, snapshotB), {
  snapshot_a: publicSnapshotSources(snapshotA),
  snapshot_b: publicSnapshotSources(snapshotB),
});
assertInGroup("baseline_integrity", "R10_contract_validator_terminal_SHA_remains_frozen", snapshotB.baselineValidator.sha256 === FROZEN_BASELINE_VALIDATOR_SHA256, snapshotB.baselineValidator);

assert("R10_contract_alignment_baseline_passes", baseline?.status === "passed" && baseline?.summary?.failed_checks === 0 && baseline?.summary?.upstream_conflicts === 0, baseline?.summary);
assert("R10_contract_alignment_has_exact_frozen_count", baseline?.summary?.passed_checks === EXPECTED_BASELINE_ASSERTION_COUNT, baseline?.summary);

const logicalTableByKey = new Map(logical.tables.map((table) => [table.key, table]));
const logicalViewByKey = new Map(logical.frontend_views.map((view) => [view.key, view]));
const logicalRoleByKey = new Map(logical.logical_business_roles.map((role) => [role.key, role]));
const logicalNodeByKey = new Map(logical.ai_nodes.map((node) => [node.key, node]));
const logicalWorkflowByKey = new Map(logical.workflows.map((workflow) => [workflow.key, workflow]));
const commonFieldByKey = new Map(logical.common_fields.map((field) => [field.key, field]));

function effectiveFields(tableKey) {
  const table = logicalTableByKey.get(tableKey);
  if (!table) return [];
  return [...logical.common_fields, ...table.fields];
}

function resolveLogicalRef(ref) {
  if (typeof ref !== "string" || !ref.startsWith("logical://") || ref.includes("{")) return undefined;
  const parts = ref.slice("logical://".length).split("/");
  const [collection, key, ...propertyPath] = parts;

  function resolvePropertyPath(value, segments) {
    return segments.reduce((resolved, segment) => {
      if (resolved === undefined || resolved === null || typeof resolved !== "object") return undefined;
      return resolved[segment];
    }, value);
  }

  if (collection === "common_fields") {
    if (!key) return logical.common_fields;
    return commonFieldByKey.get(key);
  }
  if (collection === "effective_fields") return effectiveFields(key);
  if (collection === "tables") {
    const table = logicalTableByKey.get(key);
    if (!table) return undefined;
    if (propertyPath.length === 0) return table;
    if (propertyPath[0] === "fields") {
      if (!propertyPath[1]) return table.fields;
      const field = table.fields.find((entry) => entry.key === propertyPath[1]);
      return resolvePropertyPath(field, propertyPath.slice(2));
    }
    return resolvePropertyPath(table, propertyPath);
  }

  const keyedCollections = {
    frontend_views: logicalViewByKey,
    logical_business_roles: logicalRoleByKey,
    ai_nodes: logicalNodeByKey,
    workflows: logicalWorkflowByKey,
  };
  if (collection in keyedCollections) {
    const item = keyedCollections[collection].get(key);
    if (!item) return undefined;
    if (collection === "workflows" && propertyPath[0] === "internal_authorized_actions") {
      if (!propertyPath[1]) return item.internal_authorized_actions;
      const matchingActions = (item.internal_authorized_actions ?? []).filter((action) => action.action === propertyPath[1]);
      if (matchingActions.length !== 1) return undefined;
      return resolvePropertyPath(matchingActions[0], propertyPath.slice(2));
    }
    return resolvePropertyPath(item, propertyPath);
  }
  if (collection === "ai_envelope") return key ? logical.ai_envelope[key] : logical.ai_envelope;
  if (collection === "human_gates") return logical.human_gates;
  if (collection === "forbidden_automatic_actions") return logical.forbidden_automatic_actions;
  if (collection === "integration_order") return logical.integration_order;
  return undefined;
}

function collectLogicalRefs(value, destination = []) {
  if (typeof value === "string" && value.startsWith("logical://") && !value.includes("{")) {
    destination.push(value);
  } else if (Array.isArray(value)) {
    for (const item of value) collectLogicalRefs(item, destination);
  } else if (value && typeof value === "object") {
    for (const item of Object.values(value)) collectLogicalRefs(item, destination);
  }
  return destination;
}

function parseFieldRef(ref) {
  const commonMatch = ref.match(/^logical:\/\/common_fields\/([^/]+)$/);
  if (commonMatch) return { tableKey: null, fieldKey: commonMatch[1], field: commonFieldByKey.get(commonMatch[1]) };
  const tableMatch = ref.match(/^logical:\/\/tables\/([^/]+)\/fields\/([^/]+)$/);
  if (!tableMatch) return null;
  return {
    tableKey: tableMatch[1],
    fieldKey: tableMatch[2],
    field: logicalTableByKey.get(tableMatch[1])?.fields.find((entry) => entry.key === tableMatch[2]),
  };
}

const allLogicalRefs = collectLogicalRefs(build);
const unresolvedRefs = allLogicalRefs.filter((ref) => resolveLogicalRef(ref) === undefined);
assert("all_materialized_source_refs_resolve", unresolvedRefs.length === 0, unresolvedRefs);
assert("source_refs_point_only_to_unique_logical_manifest", build.source_of_truth.second_field_contract_allowed === false && allLogicalRefs.length > 0, build.source_of_truth);

assert("logical_manifest_sha256_is_pinned", build.source_of_truth.sha256 === sha256(logicalManifestText), {
  expected: sha256(logicalManifestText),
  actual: build.source_of_truth.sha256,
});
assert("draft_schema_and_fact_class_are_preserved", build.schema_version === logical.default_schema_version && build.fact_class === logical.fact_class && build.fact_class === "solution_design", {
  logical_schema: logical.default_schema_version,
  build_schema: build.schema_version,
  logical_fact_class: logical.fact_class,
  build_fact_class: build.fact_class,
});
assert("build_package_remains_unconfigured_and_untested", build.deployment_status === "offline_draft_not_configured_in_feishu" && build.permission_status === "P01-P13_all_untested", {
  deployment_status: build.deployment_status,
  permission_status: build.permission_status,
});

const expectedTableKeys = logical.tables.map((table) => table.key);
const expectedViewKeys = logical.frontend_views.map((view) => view.key);
const expectedRoleKeys = logical.logical_business_roles.map((role) => role.key);
const expectedNodeKeys = logical.ai_nodes.map((node) => node.key);
const expectedWorkflowKeys = logical.workflows.map((workflow) => workflow.key);

assert("package_counts_are_10_5_3_7_6", build.counts.tables === 10 && build.counts.business_views === 5 && build.counts.logical_roles === 3 && build.counts.ai_nodes === 7 && build.counts.workflows === 6, build.counts);
assert("package_table_keys_match_logical", equalArrays(build.tables.map((table) => table.canonical_table_key), expectedTableKeys), build.tables.map((table) => table.canonical_table_key));
assert("package_view_keys_match_logical", equalArrays(build.business_views.map((view) => view.view_id), expectedViewKeys), build.business_views.map((view) => view.view_id));
assert("package_role_keys_match_logical", equalArrays(build.logical_roles.map((role) => role.role_id), expectedRoleKeys), build.logical_roles.map((role) => role.role_id));
assert("package_node_keys_match_logical", equalArrays(build.ai_nodes.map((node) => node.node_id), expectedNodeKeys), build.ai_nodes.map((node) => node.node_id));
assert("package_workflow_keys_match_logical", equalArrays(build.workflows.map((workflow) => workflow.workflow_id), expectedWorkflowKeys), build.workflows.map((workflow) => workflow.workflow_id));

const totalEffectiveFields = logical.tables.reduce((count, table) => count + effectiveFields(table.key).length, 0);
assert("effective_field_count_is_240", totalEffectiveFields === 240, totalEffectiveFields);
assert("build_package_does_not_inline_field_contract", build.tables.every((table) => !("field_order" in table) && typeof table.field_sequence_ref === "string"), build.tables);

const tableProjectionErrors = [];
for (const tablePlan of build.tables) {
  const key = tablePlan.canonical_table_key;
  const logicalTable = logicalTableByKey.get(key);
  if (!logicalTable) {
    tableProjectionErrors.push(`missing logical table ${key}`);
    continue;
  }
  if (!deepEqual(tablePlan.field_contract_refs, ["logical://common_fields", `logical://tables/${key}/fields`])) tableProjectionErrors.push(`${key}: field_contract_refs`);
  if (tablePlan.primary_business_key_ref !== `logical://tables/${key}/primary_business_key`) tableProjectionErrors.push(`${key}: primary_business_key_ref`);
  if (tablePlan.field_sequence_ref !== `logical://effective_fields/${key}`) tableProjectionErrors.push(`${key}: field_sequence_ref`);
  const protectionFields = [
    ...(tablePlan.protection.read_only_fields ?? []),
    ...(tablePlan.protection.human_confirmation_fields ?? []),
  ];
  const effectiveKeys = new Set(effectiveFields(key).map((field) => field.key));
  for (const fieldKey of protectionFields) {
    if (!effectiveKeys.has(fieldKey)) tableProjectionErrors.push(`${key}: unknown protection field ${fieldKey}`);
  }
  const expectedHumanFields = logicalTable.fields.filter((field) => field.human_confirmed === true).map((field) => field.key);
  if (!equalSets(tablePlan.protection.human_confirmation_fields ?? [], expectedHumanFields)) tableProjectionErrors.push(`${key}: human_confirmation_fields`);
}
assert("table_projections_and_protection_fields_resolve", tableProjectionErrors.length === 0, tableProjectionErrors);

const expectedBuildOrder = ["vehicles", "delivery_tasks", "routing_matrix", "knowledge_index", "raw_feedback", "cases", "work_orders", "clusters", "improvements", "ai_audit"];
const actualBuildOrder = build.table_build_order.map((entry) => entry.table_ref.replace("logical://tables/", ""));
assert("table_shell_order_is_explicit_and_complete", equalArrays(actualBuildOrder, expectedBuildOrder) && equalArrays(build.table_build_order.map((entry) => entry.order), Array.from({ length: 10 }, (_, index) => index + 1)), build.table_build_order);
assert("every_table_shell_creates_business_primary_field_first", build.table_build_order.every((entry) => {
  const key = entry.table_ref.replace("logical://tables/", "");
  return entry.primary_business_key_ref === `logical://tables/${key}/primary_business_key` && typeof resolveLogicalRef(entry.primary_business_key_ref) === "string";
}), build.table_build_order);

const phaseIds = build.build_phases.map((phase) => phase.id);
const phaseOrders = build.build_phases.map((phase) => phase.order);
assert("build_phase_order_is_contiguous", equalArrays(phaseOrders, Array.from({ length: build.build_phases.length }, (_, index) => index + 1)), phaseOrders);
assert("table_shells_precede_relations_and_formula_precedes_views", phaseIds.indexOf("create_table_shells") < phaseIds.indexOf("create_relations") && phaseIds.indexOf("create_relations") < phaseIds.indexOf("verify_zero_formula_contract") && phaseIds.indexOf("verify_zero_formula_contract") < phaseIds.indexOf("create_views"), phaseIds);
assert("formula_stage_is_explicit_zero_and_schema_additions_are_blocked", Array.isArray(build.formula_and_dependency_policy.canonical_formula_fields) && build.formula_and_dependency_policy.canonical_formula_fields.length === 0 && build.formula_and_dependency_policy.decision.includes("Do not add"), build.formula_and_dependency_policy);

const logicalRelationRefs = logical.tables.flatMap((table) => table.fields.filter((field) => field.target).map((field) => `logical://tables/${table.key}/fields/${field.key}`));
const buildRelationRefs = build.relation_build_order.map((entry) => entry.field_ref);
assert("all_nine_relations_are_referenced_once", buildRelationRefs.length === 9 && equalSets(buildRelationRefs, logicalRelationRefs) && new Set(buildRelationRefs).size === 9, { logicalRelationRefs, buildRelationRefs });
assert("relation_order_entries_resolve_to_relation_fields", build.relation_build_order.every((entry, index) => entry.order === index + 1 && ["relation_one", "relation_many"].includes(resolveLogicalRef(entry.field_ref)?.type) && typeof resolveLogicalRef(entry.field_ref)?.target === "string"), build.relation_build_order);

const logicalTypes = sorted(new Set(logical.tables.flatMap((table) => effectiveFields(table.key).map((field) => field.type))));
const proposedTypes = sorted(Object.keys(build.physical_field_mapping_draft.source_type_to_proposed_feishu_type));
assert("physical_type_draft_covers_every_logical_type", equalArrays(logicalTypes, proposedTypes), { logicalTypes, proposedTypes });
assert("physical_type_and_required_mapping_remain_P02_untested", build.physical_field_mapping_draft.verification_status === "未测试" && build.physical_field_mapping_draft.permission_gate === "P02" && build.physical_field_mapping_draft.required_enforcement.includes("record P02 as limited"), build.physical_field_mapping_draft);

const protection = build.field_protection_resolution;
const requiredProtectionCategories = ["controlled_workflow_write", "authorized_human_write", "automation_system_write", "ai_candidate_write", "immutable_or_snapshot_read_only", "append_only_audit"];
assert("field_protection_has_six_writer_categories", equalSets(protection.categories, requiredProtectionCategories), protection.categories);
assert("field_protection_has_all_table_defaults", equalSets(Object.keys(protection.table_defaults), expectedTableKeys) && Object.values(protection.table_defaults).every((category) => protection.categories.includes(category)), protection.table_defaults);
assert("field_protection_has_all_common_overrides", equalSets(Object.keys(protection.common_field_overrides), logical.common_fields.map((field) => field.key)) && Object.values(protection.common_field_overrides).every((category) => protection.categories.includes(category)), protection.common_field_overrides);

const exactOverrideByRef = new Map();
const exactOverrideErrors = [];
for (const override of protection.exact_field_overrides) {
  if (exactOverrideByRef.has(override.field_ref)) exactOverrideErrors.push(`duplicate ${override.field_ref}`);
  exactOverrideByRef.set(override.field_ref, override.category);
  if (!parseFieldRef(override.field_ref)?.field) exactOverrideErrors.push(`unresolved ${override.field_ref}`);
  if (!protection.categories.includes(override.category)) exactOverrideErrors.push(`unknown category ${override.category}`);
}
assert("field_protection_exact_overrides_are_valid", exactOverrideErrors.length === 0, exactOverrideErrors);

const resolvedProtection = [];
for (const table of logical.tables) {
  for (const field of effectiveFields(table.key)) {
    const tableFieldRef = `logical://tables/${table.key}/fields/${field.key}`;
    let category = exactOverrideByRef.get(tableFieldRef);
    if (!category && commonFieldByKey.has(field.key)) category = protection.common_field_overrides[field.key];
    if (!category) category = protection.table_defaults[table.key];
    if (!category) category = protection.global_default;
    resolvedProtection.push({ table: table.key, field: field.key, category });
  }
}
const protectionCategoryCounts = Object.fromEntries(requiredProtectionCategories.map((category) => [category, resolvedProtection.filter((entry) => entry.category === category).length]));
assert("all_240_effective_fields_resolve_to_one_protection_category", resolvedProtection.length === 240 && resolvedProtection.every((entry) => protection.categories.includes(entry.category)), protectionCategoryCounts);
assert("all_six_protection_categories_are_exercised", Object.values(protectionCategoryCounts).every((count) => count > 0), protectionCategoryCounts);
assert("state_transition_overlays_reference_existing_fields_and_humans", protection.state_action_overlays.every((overlay) => parseFieldRef(overlay.field_ref)?.field && overlay.actor.includes("human")), protection.state_action_overlays);

const viewErrors = [];
for (const viewPlan of build.business_views) {
  const logicalView = logicalViewByKey.get(viewPlan.view_id);
  const hostTable = viewPlan.host_table_ref.replace("logical://tables/", "");
  if (!logicalView) {
    viewErrors.push(`unknown view ${viewPlan.view_id}`);
    continue;
  }
  if (viewPlan.definition_ref !== `logical://frontend_views/${viewPlan.view_id}`) viewErrors.push(`${viewPlan.view_id}: definition_ref`);
  if (!logicalView.source_tables.includes(hostTable)) viewErrors.push(`${viewPlan.view_id}: host ${hostTable} not in sources`);
  if (!deepEqual(resolveLogicalRef(viewPlan.hidden_policy_ref), logicalView.hides)) viewErrors.push(`${viewPlan.view_id}: hidden policy`);

  const directRefs = [
    ...viewPlan.visible_field_refs,
    ...viewPlan.filter.all.map((condition) => condition.field_ref),
    ...viewPlan.sort.map((sortEntry) => sortEntry.field_ref),
  ];
  for (const ref of directRefs) {
    const parsed = parseFieldRef(ref);
    if (!parsed?.field || (parsed.tableKey !== null && parsed.tableKey !== hostTable)) viewErrors.push(`${viewPlan.view_id}: invalid host field ${ref}`);
  }
  for (const condition of viewPlan.filter.all) {
    const allowed = parseFieldRef(condition.field_ref)?.field?.allowed;
    const values = Array.isArray(condition.value) ? condition.value : [condition.value];
    if (Array.isArray(allowed) && !values.every((value) => allowed.includes(value))) viewErrors.push(`${viewPlan.view_id}: filter value outside enum`);
  }
  for (const sortEntry of viewPlan.sort) {
    const allowed = parseFieldRef(sortEntry.field_ref)?.field?.allowed;
    if (Array.isArray(sortEntry.value_order) && Array.isArray(allowed) && !sortEntry.value_order.every((value) => allowed.includes(value))) viewErrors.push(`${viewPlan.view_id}: sort value outside enum`);
  }

  const displayedFieldKeys = viewPlan.visible_field_refs.map((ref) => parseFieldRef(ref)?.fieldKey);
  for (const drillDown of viewPlan.linked_drill_down) {
    const relationRef = drillDown.relation_field_ref ?? drillDown.reverse_relation_field_ref;
    const relation = parseFieldRef(relationRef);
    if (!relation?.field?.target) viewErrors.push(`${viewPlan.view_id}: invalid relation ${relationRef}`);
    if (drillDown.relation_field_ref && (relation.tableKey !== hostTable || relation.field.target !== drillDown.target_table)) viewErrors.push(`${viewPlan.view_id}: forward relation mismatch ${relationRef}`);
    if (drillDown.reverse_relation_field_ref && (relation.tableKey !== drillDown.target_table || relation.field.target !== hostTable)) viewErrors.push(`${viewPlan.view_id}: reverse relation mismatch ${relationRef}`);
    if (!logicalView.source_tables.includes(drillDown.target_table)) viewErrors.push(`${viewPlan.view_id}: drill table ${drillDown.target_table} not in sources`);
    for (const fieldRef of drillDown.visible_field_refs) {
      const parsed = parseFieldRef(fieldRef);
      if (!parsed?.field || (parsed.tableKey !== null && parsed.tableKey !== drillDown.target_table)) viewErrors.push(`${viewPlan.view_id}: invalid drill field ${fieldRef}`);
      displayedFieldKeys.push(parsed?.fieldKey);
    }
  }
  for (const fieldKey of logicalView.shows) {
    if (!displayedFieldKeys.includes(fieldKey)) viewErrors.push(`${viewPlan.view_id}: missing logical show ${fieldKey}`);
  }
  if (!viewPlan.allowed_actions.length || !viewPlan.empty_state.trim()) viewErrors.push(`${viewPlan.view_id}: actions or empty state missing`);
}
assert("five_views_have_resolvable_fields_filters_sorts_actions_and_empty_states", viewErrors.length === 0, viewErrors);

const roleErrors = [];
for (const rolePlan of build.logical_roles) {
  const logicalRole = logicalRoleByKey.get(rolePlan.role_id);
  if (!logicalRole) {
    roleErrors.push(`unknown role ${rolePlan.role_id}`);
    continue;
  }
  const expectedVisibility = [...logicalRole.reads, ...logicalRole.writes];
  if (!equalSets(rolePlan.visible_tables, expectedVisibility)) roleErrors.push(`${rolePlan.role_id}: visibility`);
  if (!equalSets(rolePlan.owned_views, logicalRole.owns_views)) roleErrors.push(`${rolePlan.role_id}: views`);
  if (rolePlan.platform_role_id !== null || rolePlan.permission_mapping_status !== "未测试" || rolePlan.platform_role_claim !== false) roleErrors.push(`${rolePlan.role_id}: platform mapping claim`);
  if (!rolePlan.human_gate_boundaries.every((gate) => logical.human_gates.includes(gate))) roleErrors.push(`${rolePlan.role_id}: unknown human gate`);
}
assert("three_logical_roles_have_visibility_gates_and_no_platform_claim", roleErrors.length === 0, roleErrors);

const nodeErrors = [];
for (const nodePlan of build.ai_nodes) {
  const logicalNode = logicalNodeByKey.get(nodePlan.node_id);
  if (!logicalNode) {
    nodeErrors.push(`unknown node ${nodePlan.node_id}`);
    continue;
  }
  if (!equalArrays(nodePlan.modes, logicalNode.modes)) nodeErrors.push(`${nodePlan.node_id}: modes`);
  if (nodePlan.definition_ref !== `logical://ai_nodes/${nodePlan.node_id}` || nodePlan.inputs_ref !== `logical://ai_nodes/${nodePlan.node_id}/inputs` || nodePlan.payload_outputs_ref !== `logical://ai_nodes/${nodePlan.node_id}/outputs`) nodeErrors.push(`${nodePlan.node_id}: source refs`);
  if (nodePlan.output_envelope_ref !== "logical://ai_envelope" || nodePlan.schema_repair_policy_ref !== "#/ai_runtime_policy/schema_repair") nodeErrors.push(`${nodePlan.node_id}: envelope or retry ref`);
  if (nodePlan.audit_write !== "ai_audit" || nodePlan.forbidden_actions_ref !== "logical://forbidden_automatic_actions") nodeErrors.push(`${nodePlan.node_id}: audit or forbidden ref`);
  if (nodePlan.runtime_status !== "not_configured_untested") nodeErrors.push(`${nodePlan.node_id}: runtime status`);
}
assert("seven_nodes_and_eleven_modes_match_logical_contract", nodeErrors.length === 0 && build.ai_nodes.reduce((count, node) => count + node.modes.length, 0) === 11, nodeErrors);
assert("node_retry_and_manual_fallback_are_safe", build.ai_runtime_policy.schema_repair.same_version_retry_limit === logical.ai_envelope.schema_repair_retry_limit && build.ai_runtime_policy.schema_repair.after_limit === logical.ai_envelope.on_second_schema_failure && build.ai_runtime_policy.human_fallback.includes("never fabricate"), build.ai_runtime_policy);

const t3Envelope = extractConstStringArray(t3Contract, "AI_NODE_ENVELOPE_REQUIRED_FIELDS");
assert("logical_envelope_still_matches_T3", equalArrays(logical.ai_envelope.required, t3Envelope) && logical.ai_envelope.required.includes("missing_fields") && logical.ai_envelope.required.includes("validation") && logical.ai_envelope.required.includes("human_revision"), { logical: logical.ai_envelope.required, t3: t3Envelope });

const workflowErrors = [];
for (const workflowPlan of build.workflows) {
  const logicalWorkflow = logicalWorkflowByKey.get(workflowPlan.workflow_id);
  if (!logicalWorkflow) {
    workflowErrors.push(`unknown workflow ${workflowPlan.workflow_id}`);
    continue;
  }
  if (workflowPlan.definition_ref !== `logical://workflows/${workflowPlan.workflow_id}` || workflowPlan.trigger_ref !== `logical://workflows/${workflowPlan.workflow_id}/triggers` || workflowPlan.source_steps_ref !== `logical://workflows/${workflowPlan.workflow_id}/steps`) workflowErrors.push(`${workflowPlan.workflow_id}: source refs`);
  const boundSteps = workflowPlan.step_bindings.map((binding) => binding.source_step);
  if (!equalArrays(boundSteps, logicalWorkflow.steps) || new Set(boundSteps).size !== logicalWorkflow.steps.length) workflowErrors.push(`${workflowPlan.workflow_id}: step partition`);
  for (const binding of workflowPlan.step_bindings) {
    if (!["deterministic", "ai", "human"].includes(binding.actor)) workflowErrors.push(`${workflowPlan.workflow_id}: actor ${binding.actor}`);
    if (binding.source_step.startsWith("run_N") && binding.actor !== "ai") workflowErrors.push(`${workflowPlan.workflow_id}: ${binding.source_step} is not ai`);
    if ((binding.source_step.startsWith("human_") || binding.source_step.startsWith("authorized_human")) && binding.actor !== "human") workflowErrors.push(`${workflowPlan.workflow_id}: ${binding.source_step} is not human`);
    if (binding.actor === "deterministic" && (binding.source_step.startsWith("run_N") || binding.source_step.includes("human"))) workflowErrors.push(`${workflowPlan.workflow_id}: automatic human/AI step ${binding.source_step}`);
  }
  if (!workflowPlan.preconditions.length || !workflowPlan.error_stop.trim() || !workflowPlan.rollback.trim()) workflowErrors.push(`${workflowPlan.workflow_id}: missing stop or rollback`);
  if (!workflowPlan.audit_sinks.length || !workflowPlan.audit_sinks.every((sink) => sink.adds_canonical_fields === false)) workflowErrors.push(`${workflowPlan.workflow_id}: audit sink schema leak`);
  if (workflowPlan.step_bindings.some((binding) => binding.actor === "ai") && !workflowPlan.audit_sinks.some((sink) => sink.sink === "ai_audit")) workflowErrors.push(`${workflowPlan.workflow_id}: missing ai audit sink`);
  if (workflowPlan.runtime_status !== "not_configured_untested") workflowErrors.push(`${workflowPlan.workflow_id}: runtime status`);
}
assert("six_workflows_partition_every_source_step_once", workflowErrors.length === 0, workflowErrors);

const materializedIntegrationOrder = build.integration_order.map(({ workflow, phase }) => ({ workflow, phase }));
assert("workflow_integration_order_matches_W1_W2_W6_W3_W4_W5_W6", build.integration_order_ref === "logical://integration_order" && deepEqual(materializedIntegrationOrder, logical.integration_order) && equalArrays(build.integration_order.map((entry) => entry.order), Array.from({ length: 7 }, (_, index) => index + 1)), build.integration_order);
assert("W6_is_one_workflow_with_two_integration_phases", build.workflows.filter((workflow) => workflow.workflow_id === "W6").length === 1 && build.integration_order.filter((entry) => entry.workflow === "W6").length === 2, build.integration_order);

const activeRecurrenceActionKey = "intake_active_observation_recurrence";
const logicalActiveRecurrenceActions = logical.workflows.flatMap((workflow) =>
  (workflow.internal_authorized_actions ?? [])
    .filter((action) => action.action === activeRecurrenceActionKey)
    .map((action) => ({ workflow_id: workflow.key, action })),
);
const logicalActiveRecurrenceAction = logicalActiveRecurrenceActions[0]?.action;
const buildW6 = build.workflows.find((workflow) => workflow.workflow_id === "W6");
const buildActiveRecurrenceBindings = build.workflows.flatMap((workflow) =>
  (workflow.internal_action_bindings ?? [])
    .filter((binding) => binding.action === activeRecurrenceActionKey)
    .map((binding) => ({ workflow_id: workflow.workflow_id, binding })),
);
const buildActiveRecurrenceBinding = buildActiveRecurrenceBindings[0]?.binding;
const activeRecurrenceStepBinding = buildW6?.step_bindings.find((binding) => binding.source_step === activeRecurrenceActionKey);
const actionScopedWriteContracts = build.field_protection_resolution.action_scoped_write_contracts ?? [];
const activeRecurrenceWriteContracts = actionScopedWriteContracts.filter((contract) => contract.action === activeRecurrenceActionKey);
const activeRecurrenceWriteContract = activeRecurrenceWriteContracts[0];
const logicalDay7Guard = logicalActiveRecurrenceAction?.active_observation_window_guard;
const logicalOutcomeContract = logicalActiveRecurrenceAction?.outcome_recording_contract;
const buildDay7Boundary = buildActiveRecurrenceBinding?.day_7_boundary;
const buildOutcomeRecording = buildActiveRecurrenceBinding?.outcome_recording;
const buildFinalGuardRejection = buildOutcomeRecording?.final_guard_rejection;
const expectedActiveRecurrenceSequence = [
  "run_N5_existing_cluster_candidate",
  "repository_issue_action_scoped_N5_receipt",
  "authorized_human_recurrence_intake",
  "commit_intake_under_full_case_cluster_improvement_lock",
];
const expectedAllowedFieldWrites = ["logical://tables/clusters/fields/member_case_ids"];
const expectedAppendOnlyWrites = [
  "logical://tables/clusters/fields/recurrence_records",
  "logical://tables/ai_audit",
];
const expectedForbiddenFieldWrites = [
  "logical://tables/cases/fields/cluster_id",
  "logical://tables/cases/fields/status",
  "logical://tables/raw_feedback/fields/linked_case_id",
  "logical://tables/raw_feedback/fields/processing_status",
  "logical://tables/clusters/fields/status",
  "logical://tables/improvements/fields/status",
  "logical://tables/improvements/fields/day_7_result",
  "logical://tables/improvements/fields/day_30_result",
  "logical://tables/improvements/fields/human_conclusion",
];
const expectedForbiddenRecordMutations = [
  "logical://tables/cases",
  "logical://tables/raw_feedback",
  "logical://tables/improvements",
  "runtime://W6/observation_cycle",
];
const logicalObservationPhase = logicalWorkflowByKey.get("W6")?.observation_phase_contract;
const expectedObservationActionKeys = ["enter_observation", "record_day_7", "record_day_30"];
const buildObservationActionBindings = (buildW6?.internal_action_bindings ?? []).filter((binding) => expectedObservationActionKeys.includes(binding.action));
const observationWriteContracts = actionScopedWriteContracts.filter((contract) => expectedObservationActionKeys.includes(contract.action));
const observationBindingByAction = new Map(buildObservationActionBindings.map((binding) => [binding.action, binding]));
const observationWriteContractByAction = new Map(observationWriteContracts.map((contract) => [contract.action, contract]));
const observationStepBindingByAction = new Map((buildW6?.step_bindings ?? [])
  .filter((binding) => expectedObservationActionKeys.includes(binding.source_step))
  .map((binding) => [binding.source_step, binding]));

assert("R10_package_0_1_5_materializes_logical_0_1_6", build.package_version === "0.1.5"
  && logical.manifest_version === "0.1.6"
  && build.source_of_truth.manifest_version === logical.manifest_version, {
  build: build.package_version,
  logical: logical.manifest_version,
  pinned_logical: build.source_of_truth.manifest_version,
});
assert("active_recurrence_is_bound_once_inside_W6_without_seventh_workflow", logicalActiveRecurrenceActions.length === 1
  && logicalActiveRecurrenceActions[0].workflow_id === "W6"
  && buildActiveRecurrenceBindings.length === 1
  && buildActiveRecurrenceBindings[0].workflow_id === "W6"
  && build.workflows.length === 6
  && !build.workflows.some((workflow) => workflow.workflow_id === activeRecurrenceActionKey), {
  logical_locations: logicalActiveRecurrenceActions.map((entry) => entry.workflow_id),
  build_locations: buildActiveRecurrenceBindings.map((entry) => entry.workflow_id),
});
assert("active_recurrence_step_binding_is_human_authorized_composite", activeRecurrenceStepBinding?.actor === "human"
  && activeRecurrenceStepBinding?.execution_mode === "composite_authorized_internal_action"
  && activeRecurrenceStepBinding?.internal_action_ref === `logical://workflows/W6/internal_authorized_actions/${activeRecurrenceActionKey}`
  && activeRecurrenceStepBinding?.sequence_ref === `logical://workflows/W6/internal_authorized_actions/${activeRecurrenceActionKey}/sequence`
  && activeRecurrenceStepBinding?.write_contract_ref === `build://field_protection_resolution/action_scoped_write_contracts/${activeRecurrenceActionKey}`
  && buildW6?.step_bindings.filter((binding) => binding.source_step === activeRecurrenceActionKey).length === 1, activeRecurrenceStepBinding);
assert("active_recurrence_nested_logical_refs_resolve_to_exact_action_and_sequence", resolveLogicalRef(activeRecurrenceStepBinding?.internal_action_ref) === logicalActiveRecurrenceAction
  && resolveLogicalRef(activeRecurrenceStepBinding?.sequence_ref) === logicalActiveRecurrenceAction?.sequence
  && resolveLogicalRef(`${activeRecurrenceStepBinding?.sequence_ref}/unexpected`) === undefined, {
  internal_action_ref: activeRecurrenceStepBinding?.internal_action_ref,
  sequence_ref: activeRecurrenceStepBinding?.sequence_ref,
});
assert("active_recurrence_binding_keeps_separate_authorization_full_lock_and_untested_runtime", buildActiveRecurrenceBinding?.classification === "W6_internal_authorized_action_not_a_seventh_workflow"
  && buildActiveRecurrenceBinding?.trigger === "closed_case_during_active_observation"
  && buildActiveRecurrenceBinding?.phase === "cross_event_improvement_observation"
  && buildActiveRecurrenceBinding?.authorization_transaction === "separate_from_day_7_and_day_30_checkpoint_transactions"
  && equalArrays(buildActiveRecurrenceBinding?.atomic_commit_scope ?? [], ["all_trigger_and_member_cases", "cluster", "improvement"])
  && buildActiveRecurrenceBinding?.runtime_status === "not_configured_untested", buildActiveRecurrenceBinding);
assert("build_active_recurrence_day7_cutoff_mirrors_logical_exactly", activeRecurrenceWriteContract?.active_observation_window_guard_ref === `logical://workflows/W6/internal_authorized_actions/${activeRecurrenceActionKey}/active_observation_window_guard`
  && buildActiveRecurrenceBinding?.active_observation_window_guard_ref === activeRecurrenceWriteContract?.active_observation_window_guard_ref
  && activeRecurrenceWriteContract?.guard_rule?.base_window === logicalDay7Guard?.base_window
  && equalArrays(activeRecurrenceWriteContract?.guard_rule?.day_7_sealed_when ?? [], logicalDay7Guard?.day_7_sealed_when ?? [])
  && activeRecurrenceWriteContract?.guard_rule?.sealed_day_7_rejection === "closed_at <= day7ExpectedAt"
  && activeRecurrenceWriteContract?.guard_rule?.equal_millisecond_rejected_after_day_7_sealed === true
  && activeRecurrenceWriteContract?.guard_rule?.post_day_7_day_30_eligibility === "closed_at > day7ExpectedAt_and_closed_at <= min(occurred_at, day30ExpectedAt)"
  && equalArrays(buildDay7Boundary?.sealed_when ?? [], logicalDay7Guard?.day_7_sealed_when ?? [])
  && buildDay7Boundary?.reject_when_sealed === "closed_at <= day7ExpectedAt"
  && buildDay7Boundary?.equal_millisecond_rejected === true
  && buildDay7Boundary?.day_30_eligible_when === "closed_at > day7ExpectedAt_and_closed_at <= min(occurred_at, day30ExpectedAt)", {
  logical: logicalDay7Guard,
  write_contract: activeRecurrenceWriteContract?.guard_rule,
  binding: buildDay7Boundary,
});
assert("build_active_recurrence_has_pre_receipt_and_final_full_lock_shared_guards", equalArrays(activeRecurrenceWriteContract?.guard_points?.map((entry) => `${entry.sequence_order}:${entry.point}`) ?? [], [
  "2:before_action_scoped_N5_receipt_issue",
  "4:inside_full_case_cluster_improvement_lock_before_state_fingerprint_CAS_and_business_commit",
])
  && equalArrays(buildActiveRecurrenceBinding?.guard_points?.map((entry) => `${entry.sequence_order}:${entry.point}`) ?? [], [
    "2:before_action_scoped_N5_receipt_issue",
    "4:inside_full_case_cluster_improvement_lock_before_state_fingerprint_CAS_and_business_commit",
  ])
  && activeRecurrenceWriteContract?.guard_points?.[0]?.requires === "shared_guard_violatesW6ActiveIntakeObservationWindow_passed_before_receipt_issue"
  && activeRecurrenceWriteContract?.guard_points?.[1]?.requires === "N5_validation_and_human_authorization_capabilities_consumed_then_shared_guard_violatesW6ActiveIntakeObservationWindow_passed_against_latest_authoritative_state"
  && buildActiveRecurrenceBinding?.guard_points?.[1]?.capability_state_at_guard === "N5_validation_and_human_authorization_capabilities_consumed"
  && buildDay7Boundary?.checkpoint_first_intake_second === "final_full_lock_guard_rejects_day_7_or_earlier_closure", {
  write_contract: activeRecurrenceWriteContract?.guard_points,
  binding: buildActiveRecurrenceBinding?.guard_points,
});
assert("build_late_day7_rejection_preserves_durable_state_with_zero_business_writes", equalArrays(activeRecurrenceWriteContract?.cutoff_rejection_outcome?.consumed_capabilities ?? [], [
  "N5_action_scoped_validation_capability",
  "human_recurrence_authorization_capability",
])
  && activeRecurrenceWriteContract?.cutoff_rejection_outcome?.business_commit === "rejected"
  && equalArrays(activeRecurrenceWriteContract?.cutoff_rejection_outcome?.business_writes ?? [], [])
  && equalArrays(activeRecurrenceWriteContract?.cutoff_rejection_outcome?.w6_state_writes ?? [], [])
  && buildFinalGuardRejection?.capability_consumption === "consumed"
  && buildFinalGuardRejection?.business_commit === "rejected"
  && equalArrays(buildFinalGuardRejection?.business_writes ?? [], [])
  && equalArrays(buildFinalGuardRejection?.w6_state_writes ?? [], [])
  && buildW6?.day_7_cutoff_error_stop?.checkpoint_first_intake_second === "reject_when_latest_same_cycle_day_7_checkpoint_exists_and_closed_at <= day7ExpectedAt"
  && buildW6?.day_7_cutoff_error_stop?.business_commit === "rejected"
  && equalArrays(buildW6?.day_7_cutoff_error_stop?.business_writes ?? [], [])
  && equalArrays(buildW6?.day_7_cutoff_error_stop?.w6_state_writes ?? [], []), {
  write_contract: activeRecurrenceWriteContract?.cutoff_rejection_outcome,
  binding: buildFinalGuardRejection,
  error_stop: buildW6?.day_7_cutoff_error_stop,
});
assert("build_records_capability_consumption_and_business_outcomes_separately", activeRecurrenceWriteContract?.outcome_recording === "capability_consumption_business_commit_business_writes_and_w6_state_writes_are_recorded_separately"
  && buildOutcomeRecording?.capability_consumption === "separate_private_security_outcome"
  && buildOutcomeRecording?.business_commit === "separate_committed_or_rejected_outcome"
  && buildOutcomeRecording?.business_writes === "separate_exact_write_set"
  && buildOutcomeRecording?.w6_state_writes === "separate_exact_durable_state_write_set"
  && logicalOutcomeContract?.capability_consumption_is_not_business_or_W6_durable_write === true
  && buildW6?.audit_sinks.some((sink) => sink.sink === "platform_run_log"
    && ["pre_receipt_window_guard_result", "final_full_lock_window_guard_result", "capability_consumption_outcome", "business_commit_outcome", "business_writes", "w6_state_writes"].every((field) => sink.capture.includes(field)))
  && buildW6?.audit_sinks.some((sink) => sink.sink === "evidence_template"
    && ["pre_receipt_window_guard_result", "final_full_lock_window_guard_result", "capability_consumption_outcome", "business_commit_outcome", "business_writes", "w6_state_writes"].every((field) => sink.capture.includes(field))), {
  outcome: buildOutcomeRecording,
  audit_sinks: buildW6?.audit_sinks,
});
assert("active_recurrence_exact_sequence_is_N5_receipt_human_full_lock_only", equalArrays(logicalActiveRecurrenceAction?.sequence?.map((entry) => entry.step) ?? [], expectedActiveRecurrenceSequence)
  && equalArrays(logicalActiveRecurrenceAction?.sequence?.map((entry) => entry.order) ?? [], [1, 2, 3, 4])
  && logicalActiveRecurrenceAction?.sequence?.[2]?.transaction_boundary === "separate_human_authorization_transaction"
  && logicalActiveRecurrenceAction?.sequence?.[3]?.transaction_boundary === "single_atomic_intake_transaction"
  && logicalActiveRecurrenceAction?.checkpoint_interlock_ref === "logical://workflows/W6/observation_phase_contract/checkpoint_contract", logicalActiveRecurrenceAction?.sequence);
assert("active_recurrence_action_write_contract_is_exact_allow_append_deny_projection", activeRecurrenceWriteContracts.length === 1
  && activeRecurrenceWriteContract?.workflow_id === "W6"
  && activeRecurrenceWriteContract?.phase === "cross_event_improvement_observation"
  && equalArrays(activeRecurrenceWriteContract?.allowed_field_writes ?? [], expectedAllowedFieldWrites)
  && equalArrays(activeRecurrenceWriteContract?.append_only_writes ?? [], expectedAppendOnlyWrites)
  && equalArrays(activeRecurrenceWriteContract?.forbidden_field_writes ?? [], expectedForbiddenFieldWrites)
  && equalArrays(activeRecurrenceWriteContract?.forbidden_record_mutations ?? [], expectedForbiddenRecordMutations)
  && activeRecurrenceWriteContract?.verification_status === "not_configured_untested"
  && equalArrays(activeRecurrenceWriteContract?.allowed_field_writes ?? [], logicalActiveRecurrenceAction?.write_boundary?.allowed_field_writes ?? [])
  && equalArrays(activeRecurrenceWriteContract?.append_only_writes ?? [], logicalActiveRecurrenceAction?.write_boundary?.append_only_writes ?? [])
  && equalArrays(activeRecurrenceWriteContract?.forbidden_field_writes ?? [], logicalActiveRecurrenceAction?.write_boundary?.forbidden_field_writes ?? [])
  && equalArrays(activeRecurrenceWriteContract?.forbidden_record_mutations ?? [], logicalActiveRecurrenceAction?.write_boundary?.forbidden_record_mutations ?? []), activeRecurrenceWriteContract);
assert("active_recurrence_write_boundary_never_backfills_cases_or_mutates_feedback_improvement_cycle_status", activeRecurrenceWriteContract?.relation_direction === "clusters.member_case_ids_is_one_way_and_never_backfills_cases.cluster_id"
  && activeRecurrenceWriteContract?.cluster_status_effect === "unchanged_观察中"
  && activeRecurrenceWriteContract?.improvement_status_effect === "unchanged_观察中"
  && activeRecurrenceWriteContract?.observation_cycle_effect === "unchanged"
  && /preserve cases\.cluster_id\/status, raw_feedback ownership\/status, cluster\/improvement status, the improvement record and observation cycle/.test(buildW6?.rollback ?? ""), {
  write_contract: activeRecurrenceWriteContract,
  rollback: buildW6?.rollback,
});
assert("N5_intake_and_N6_start_receipts_are_bidirectionally_isolated", logicalActiveRecurrenceAction?.receipt_isolation?.repository_issued === true
  && logicalActiveRecurrenceAction?.receipt_isolation?.single_use === true
  && logicalActiveRecurrenceAction?.receipt_isolation?.cross_reuse === "forbidden"
  && equalArrays(logicalActiveRecurrenceAction?.receipt_isolation?.forbidden_directions ?? [], [
    "N5_receipt_to_N6_start_improvement",
    "N6_receipt_to_N5_active_intake",
  ])
  && logicalActiveRecurrenceAction?.receipt_isolation?.n5_receipt?.action === activeRecurrenceActionKey
  && logicalActiveRecurrenceAction?.receipt_isolation?.n5_receipt?.node === "N5"
  && logicalActiveRecurrenceAction?.receipt_isolation?.n5_receipt?.mode === "cross_event_clustering"
  && logicalActiveRecurrenceAction?.receipt_isolation?.n5_receipt?.version === "N5-cross-event-1.0.0-draft.2"
  && logicalActiveRecurrenceAction?.receipt_isolation?.n5_receipt?.validator_version === "w6-n5-active-intake-validation-v1"
  && logicalActiveRecurrenceAction?.receipt_isolation?.n6_receipt?.action === "start_improvement"
  && logicalActiveRecurrenceAction?.receipt_isolation?.n6_receipt?.node === "N6"
  && logicalActiveRecurrenceAction?.receipt_isolation?.n6_receipt?.mode === "root_cause_hypothesis"
  && logicalActiveRecurrenceAction?.receipt_isolation?.n6_receipt?.version === "N6-root-cause-1.0.0-draft.3"
  && logicalActiveRecurrenceAction?.receipt_isolation?.n6_receipt?.validator_version === "w6-n6-validation-v1", logicalActiveRecurrenceAction?.receipt_isolation);
assert("checkpoint_denominator_archive_and_publication_fail_closed", logical.workflows.find((workflow) => workflow.key === "W6")?.observation_phase_contract?.checkpoint_contract?.authorization_and_checkpoint_transaction_shared === false
  && logical.workflows.find((workflow) => workflow.key === "W6")?.observation_phase_contract?.checkpoint_contract?.day_30_cumulative_includes_day_7 === true
  && logical.workflows.find((workflow) => workflow.key === "W6")?.observation_phase_contract?.checkpoint_contract?.missing_denominator === "recurrence_count_preserved_and_recurrence_rate_null"
  && logicalActiveRecurrenceAction?.archive_and_publication_contract?.archive_requires?.includes("authorized_human")
  && logicalActiveRecurrenceAction?.archive_and_publication_contract?.archive_requires?.includes("non_empty_human_conclusion")
  && logicalActiveRecurrenceAction?.archive_and_publication_contract?.automatic_archive === false
  && logicalActiveRecurrenceAction?.archive_and_publication_contract?.automatic_knowledge_publication === false
  && logicalActiveRecurrenceAction?.archive_and_publication_contract?.automatic_final_root_cause === false, {
  checkpoint: logicalActiveRecurrenceAction?.checkpoint_contract,
  archive: logicalActiveRecurrenceAction?.archive_and_publication_contract,
});
assert("active_recurrence_audit_and_rollback_capture_atomic_receipts_without_completion_claim", buildW6?.audit_sinks.some((sink) => sink.sink === "ai_audit"
    && sink.capture.includes("N5_action_scoped_receipt_ref"))
  && buildW6?.audit_sinks.some((sink) => sink.sink === "platform_run_log"
    && ["internal_action", "human_decision_refs", "intake_receipt_ref", "checkpoint_source_refs", "before_after_business_snapshots", "workflow_audit_id", "audit_state", "audit_pending", "event_result_cached"].every((field) => sink.capture.includes(field)))
  && buildW6?.audit_sinks.some((sink) => sink.sink === "evidence_template"
    && ["N5_receipt_ref", "human_recurrence_decision_ref", "intake_receipt_ref", "failure_rollback_result"].every((field) => sink.capture.includes(field)))
  && equalArrays(activeRecurrenceWriteContract?.business_atomic_commit_writes ?? [], [
    "logical://tables/clusters/fields/member_case_ids",
    "logical://tables/clusters/fields/recurrence_records",
  ])
  && activeRecurrenceWriteContract?.workflow_audit_compensation === "outside_business_atomic_commit_same_workflow_audit_id_repair_only"
  && buildActiveRecurrenceBinding?.audit_compensation === "business_commit_may_complete_with_audit_pending_then_same_audit_id_repair_only_without_N5_authorization_or_business_replay"
  && /business commit succeeds while workflow audit append fails, keep the committed business result with audit_pending/.test(buildW6?.rollback ?? "")
  && /replay the same workflow_audit_id to repair only the audit and never repeat N5, human authorization or business writes/.test(buildW6?.rollback ?? "")
  && buildW6?.runtime_status === "not_configured_untested", buildW6?.audit_sinks);

assert("build_observation_action_bindings_are_exactly_three_inside_W6", equalArrays(Object.keys(logicalObservationPhase?.actions ?? {}), expectedObservationActionKeys)
  && equalArrays(buildObservationActionBindings.map((binding) => binding.action), expectedObservationActionKeys)
  && equalArrays(observationWriteContracts.map((contract) => contract.action), expectedObservationActionKeys)
  && equalArrays([...observationStepBindingByAction.keys()], expectedObservationActionKeys)
  && equalArrays(buildW6?.observation_phase_scope?.included_actions ?? [], expectedObservationActionKeys)
  && equalArrays(buildW6?.observation_phase_scope?.excluded_actions ?? [], ["archive_observation", "reopen_recurrence"])
  && buildW6?.observation_phase_scope?.committed_reopen_history_use === "read_only_checkpoint_source_not_a_reopen_action"
  && buildW6?.observation_phase_scope?.workflow_count_effect === "unchanged_6"
  && build.workflows.length === 6
  && expectedObservationActionKeys.every((action) => !build.workflows.some((workflow) => workflow.workflow_id === action)), {
  bindings: buildObservationActionBindings,
  write_contracts: observationWriteContracts,
  scope: buildW6?.observation_phase_scope,
});
const logicalEnterObservation = logicalObservationPhase?.actions?.enter_observation;
const buildEnterObservationBinding = observationBindingByAction.get("enter_observation");
const buildEnterObservationWriteContract = observationWriteContractByAction.get("enter_observation");
assert("build_enter_generation_contract_mirrors_logical", buildW6?.trusted_generation_contract_ref === "logical://workflows/W6/observation_phase_contract/trusted_generation_contract"
  && resolveLogicalRef(buildW6?.trusted_generation_contract_ref) === logicalObservationPhase?.trusted_generation_contract
  && buildEnterObservationBinding?.system_generated_fields_ref === "logical://workflows/W6/observation_phase_contract/trusted_generation_contract/system_origin_fields"
  && resolveLogicalRef(buildEnterObservationBinding?.system_generated_fields_ref) === logicalObservationPhase?.trusted_generation_contract?.system_origin_fields
  && equalArrays(buildEnterObservationBinding?.caller_allowed_fields ?? [], logicalEnterObservation?.command_contract?.caller_allowed_fields ?? [])
  && equalArrays(buildEnterObservationWriteContract?.caller_allowed_fields ?? [], logicalEnterObservation?.command_contract?.caller_allowed_fields ?? [])
  && buildEnterObservationWriteContract?.caller_forbidden_fields_ref === logicalEnterObservation?.command_contract?.caller_forbidden_fields_ref
  && resolveLogicalRef(buildEnterObservationWriteContract?.caller_forbidden_fields_ref) === logicalObservationPhase?.trusted_generation_contract?.enter_caller_must_not_supply
  && equalArrays(buildEnterObservationWriteContract?.runtime_state_writes ?? [], logicalEnterObservation?.write_boundary?.runtime_state_writes ?? [])
  && equalArrays(buildEnterObservationWriteContract?.runtime_append_only_writes ?? [], logicalEnterObservation?.write_boundary?.runtime_append_only_writes ?? [])
  && buildEnterObservationWriteContract?.runtime_refs_never_create_base_canonical_fields === true, buildEnterObservationWriteContract);
assert("build_enter_waits_unlocked_then_commits_under_one_atomic_lock", buildEnterObservationBinding?.human_authorization?.required === true
  && buildEnterObservationBinding?.human_authorization?.phase === "observation"
  && buildEnterObservationBinding?.human_authorization?.await_boundary === "outside_resource_lock"
  && equalArrays(buildEnterObservationBinding?.human_authorization?.resource_locks_held_while_awaiting ?? [], [])
  && deepEqual(buildEnterObservationWriteContract?.human_authorization, logicalEnterObservation?.authorization && {
    required: logicalEnterObservation.authorization.required,
    phase: logicalEnterObservation.authorization.phase,
    await_boundary: logicalEnterObservation.authorization.await_boundary,
    resource_locks_held_while_awaiting: logicalEnterObservation.authorization.resource_locks_held_while_awaiting,
    business_writes_while_awaiting: logicalEnterObservation.authorization.business_writes_while_awaiting,
  })
  && buildEnterObservationWriteContract?.transaction?.boundary === logicalEnterObservation?.transaction?.boundary
  && equalArrays(buildEnterObservationWriteContract?.transaction?.full_lock_scope ?? [], logicalEnterObservation?.transaction?.lock_scope ?? [])
  && buildEnterObservationWriteContract?.transaction?.trusted_clock_revalidation_inside_full_lock === true
  && buildEnterObservationWriteContract?.transaction?.state_fingerprint_CAS_inside_full_lock === true
  && equalArrays(buildEnterObservationWriteContract?.transaction?.external_or_provider_awaits_inside_lock ?? [], [])
  && buildEnterObservationWriteContract?.transaction?.all_or_nothing === true
  && buildEnterObservationBinding?.full_lock_commit === "trusted_clock_revalidation_then_state_fingerprint_CAS_then_single_atomic_commit"
  && buildW6?.observation_phase_error_stop?.enter_observation?.authorization_wait === "zero_resource_locks_and_zero_business_writes"
  && equalArrays(buildW6?.observation_phase_rollback?.enter_observation_failure?.business_writes ?? [], [])
  && equalArrays(buildW6?.observation_phase_rollback?.enter_observation_failure?.runtime_state_writes ?? [], []), {
  binding: buildEnterObservationBinding,
  write_contract: buildEnterObservationWriteContract,
});
const logicalCheckpointActions = [logicalObservationPhase?.actions?.record_day_7, logicalObservationPhase?.actions?.record_day_30];
const buildCheckpointBindings = [observationBindingByAction.get("record_day_7"), observationBindingByAction.get("record_day_30")];
const buildCheckpointWriteContracts = [observationWriteContractByAction.get("record_day_7"), observationWriteContractByAction.get("record_day_30")];
assert("build_day7_day30_are_deterministic_without_caller_AI_or_authorizer", buildCheckpointBindings.every((binding, index) => binding?.caller_actor_allowed === false
    && binding?.ai_invocation_allowed === false
    && binding?.authorizer_call_allowed === false
    && binding?.transaction === logicalCheckpointActions[index]?.transaction?.boundary
    && binding?.definition_ref === `logical://workflows/W6/observation_phase_contract/actions/${binding.action}`
    && resolveLogicalRef(binding?.definition_ref) === logicalCheckpointActions[index])
  && buildCheckpointWriteContracts.every((contract, index) => deepEqual(contract?.invocation, logicalCheckpointActions[index]?.invocation)
    && deepEqual(contract?.transaction, logicalCheckpointActions[index]?.transaction)
    && equalArrays(contract?.caller_allowed_fields ?? [], logicalCheckpointActions[index]?.command_contract?.caller_allowed_fields ?? [])
    && resolveLogicalRef(contract?.caller_forbidden_fields_ref) === logicalObservationPhase?.trusted_generation_contract?.checkpoint_caller_must_not_supply)
  && expectedObservationActionKeys.slice(1).every((action) => {
    const step = observationStepBindingByAction.get(action);
    return step?.actor === "deterministic"
      && step?.actor_semantics === "internal_executor_metadata_not_a_caller_actor"
      && step?.execution_mode === "independent_deterministic_checkpoint_transaction"
      && step?.caller_actor_allowed === false
      && step?.ai_invocation_allowed === false
      && step?.authorizer_call_allowed === false;
  }), { bindings: buildCheckpointBindings, write_contracts: buildCheckpointWriteContracts });
assert("build_checkpoint_history_cumulative_and_null_rate_mirror_logical", buildW6?.recurrence_source_contract_ref === "logical://workflows/W6/observation_phase_contract/recurrence_source_contract"
  && resolveLogicalRef(buildW6?.recurrence_source_contract_ref) === logicalObservationPhase?.recurrence_source_contract
  && buildW6?.checkpoint_contract_ref === "logical://workflows/W6/observation_phase_contract/checkpoint_contract"
  && resolveLogicalRef(buildW6?.checkpoint_contract_ref) === logicalObservationPhase?.checkpoint_contract
  && equalArrays(logicalObservationPhase?.recurrence_source_contract?.allowed_authoritative_sources ?? [], ["committed_active_observation_intake_history_for_same_cycle", "committed_recurrence_reopen_cycle_facts_for_same_cycle"])
  && logicalObservationPhase?.recurrence_source_contract?.reopen_history_mode === "read_only_source_only_reopen_action_excluded_from_batch_d1"
  && logicalObservationPhase?.recurrence_source_contract?.day_30_cumulatively_includes_day_7 === true
  && logicalObservationPhase?.recurrence_source_contract?.missing_denominator === "recurrence_count_preserved_and_recurrence_rate_null"
  && observationBindingByAction.get("record_day_30")?.requires_same_cycle_day_7_checkpoint === true
  && observationBindingByAction.get("record_day_30")?.day_30_cumulative_includes_day_7 === true
  && observationWriteContractByAction.get("record_day_30")?.requires_same_cycle_day_7_checkpoint === true
  && observationWriteContractByAction.get("record_day_30")?.day_30_cumulative_includes_day_7 === true
  && buildW6?.observation_phase_error_stop?.denominator === "null_preserves_recurrence_count_and_sets_recurrence_rate_null", logicalObservationPhase?.recurrence_source_contract);
const platformRunAudit = buildW6?.audit_sinks.find((sink) => sink.sink === "platform_run_log");
const evidenceAudit = buildW6?.audit_sinks.find((sink) => sink.sink === "evidence_template");
const requiredD1AuditFields = ["batch_d1_action", "system_generated_cycle_id", "system_generated_clock_source", "system_generated_occurred_at", "system_generated_history_id", "system_generated_receipt_id", "system_generated_checkpoint_id", "authorization_wait_resource_lock_count", "enter_atomic_commit_outcome", "checkpoint_transaction_id", "checkpoint_expected_at", "recurrence_source_classes", "related_task_volume", "recurrence_count", "recurrence_rate", "audit_repair_outcome", "event_replay_outcome", "business_replay_count"];
assert("build_observation_audit_pending_and_replay_are_repair_only", buildW6?.audit_repair_contract_ref === "logical://workflows/W6/observation_phase_contract/audit_repair_contract"
  && resolveLogicalRef(buildW6?.audit_repair_contract_ref) === logicalObservationPhase?.audit_repair_contract
  && requiredD1AuditFields.every((field) => platformRunAudit?.capture.includes(field))
  && ["batch_d1_action", "authorization_wait_resource_lock_count", "system_generated_cycle_clock_timestamp_history_receipt_refs", "checkpoint_transaction_id", "checkpoint_expected_at", "committed_recurrence_source_refs", "related_task_volume", "recurrence_count", "recurrence_rate", "audit_repair_outcome", "event_replay_outcome", "business_replay_count"].every((field) => evidenceAudit?.capture.includes(field))
  && buildW6?.observation_phase_error_stop?.audit_pending === "business_result_remains_authoritative_and_only_same_audit_id_may_be_repaired"
  && buildW6?.observation_phase_error_stop?.event_replay === "same_payload_returns_cached_business_result_without_ID_authorization_AI_or_business_replay"
  && buildW6?.observation_phase_error_stop?.event_conflict === "same_event_different_payload_stops_without_writes"
  && buildW6?.observation_phase_rollback?.audit_failure_after_business_success?.business_rollback === false
  && buildW6?.observation_phase_rollback?.audit_failure_after_business_success?.audit_state === "audit_pending"
  && equalArrays(buildW6?.observation_phase_rollback?.audit_failure_after_business_success?.repair_scope ?? [], ["runtime://W6/workflow_audit"])
  && buildW6?.observation_phase_rollback?.audit_failure_after_business_success?.business_replay === false, buildW6?.observation_phase_rollback);
assert("build_observation_bindings_are_untested_and_fail_closed", actionScopedWriteContracts.length === 4
  && observationWriteContracts.length === 3
  && observationWriteContracts.every((contract) => contract.verification_status === "not_configured_untested")
  && buildObservationActionBindings.every((binding) => binding.runtime_status === "not_configured_untested")
  && buildW6?.runtime_status === "not_configured_untested"
  && buildW6?.observation_phase_scope?.deployment_effect === "offline_contract_only_not_configured_untested"
  && equalArrays(buildW6?.observation_phase_error_stop?.preserve ?? [], ["cases", "raw_feedback", "work_orders", "prior_cluster_state", "prior_improvement_state", "prior_observation_runtime_state"])
  && equalArrays(buildW6?.observation_phase_rollback?.checkpoint_failure?.business_writes ?? [], [])
  && equalArrays(buildW6?.observation_phase_rollback?.checkpoint_failure?.runtime_append_only_writes ?? [], [])
  && buildW6?.observation_phase_rollback?.archive_or_reopen_action === "excluded_from_batch_d1"
  && buildW6?.observation_phase_rollback?.automatic_knowledge_publication === false
  && build.workflows.length === 6, {
  write_contracts: actionScopedWriteContracts,
  bindings: buildObservationActionBindings,
  error_stop: buildW6?.observation_phase_error_stop,
  rollback: buildW6?.observation_phase_rollback,
});

const humanGateCoverage = new Set([
  ...build.logical_roles.flatMap((role) => role.human_gate_boundaries),
  ...build.business_views.flatMap((view) => view.human_gate_actions),
  ...build.workflows.flatMap((workflow) => workflow.human_confirmations),
]);
assert("all_seven_human_gates_are_covered", logical.human_gates.every((gate) => humanGateCoverage.has(gate)), {
  required: logical.human_gates,
  covered: [...humanGateCoverage],
});
assert("all_seven_forbidden_actions_are_source_locked", logical.forbidden_automatic_actions.length === 7 && build.forbidden_automatic_actions_ref === "logical://forbidden_automatic_actions" && build.ai_nodes.every((node) => node.forbidden_actions_ref === "logical://forbidden_automatic_actions"), logical.forbidden_automatic_actions);
assert("no_forbidden_action_is_bound_as_workflow_step", build.workflows.every((workflow) => workflow.step_bindings.every((binding) => !logical.forbidden_automatic_actions.includes(binding.source_step))), build.workflows.map((workflow) => workflow.step_bindings));
assert("workflow_failures_preserve_status_sla_or_evidence", build.workflows.every((workflow) => /preserve|keep|retain|保留/i.test(`${workflow.error_stop} ${workflow.rollback}`)) && /SLA|sla_started_at/.test(`${build.workflows.find((workflow) => workflow.workflow_id === "W3").rollback} ${build.workflows.find((workflow) => workflow.workflow_id === "W4").error_stop} ${build.workflows.find((workflow) => workflow.workflow_id === "W5").rollback}`), build.workflows.map((workflow) => ({ id: workflow.workflow_id, error_stop: workflow.error_stop, rollback: workflow.rollback })));

const resourceTableErrors = [];
for (const logicalTable of logical.tables) {
  const mapped = resource.resources.base.tables.find((table) => table.logical_key === logicalTable.key);
  if (!mapped) {
    resourceTableErrors.push(`missing ${logicalTable.key}`);
    continue;
  }
  const expectedFields = effectiveFields(logicalTable.key).map((field) => field.key);
  if (mapped.name !== logicalTable.name || mapped.table_id !== null) resourceTableErrors.push(`${logicalTable.key}: name or table_id`);
  if (!equalArrays(Object.keys(mapped.field_ids), expectedFields)) resourceTableErrors.push(`${logicalTable.key}: field key order`);
  if (!valuesAreNull(mapped.field_ids)) resourceTableErrors.push(`${logicalTable.key}: non-null field id`);
}
assert("resource_mapping_has_10_tables_and_240_null_field_ids", resource.resources.base.tables.length === 10 && resource.resources.base.tables.reduce((count, table) => count + Object.keys(table.field_ids).length, 0) === 240 && resourceTableErrors.length === 0, resourceTableErrors);
assert("resource_mapping_has_five_null_view_ids", equalArrays(resource.resources.base.views.map((view) => view.logical_key), expectedViewKeys) && resource.resources.base.views.every((view) => view.view_id === null), resource.resources.base.views);
assert("resource_mapping_has_three_unmapped_logical_roles", equalArrays(resource.resources.logical_roles.map((role) => role.logical_key), expectedRoleKeys) && resource.resources.logical_roles.every((role) => role.platform_role_id === null && role.mapping_status === "未测试"), resource.resources.logical_roles);
assert("resource_mapping_has_seven_null_node_ids", equalArrays(resource.resources.ai_nodes.map((node) => node.logical_key), expectedNodeKeys) && resource.resources.ai_nodes.every((node) => node.node_id === null), resource.resources.ai_nodes);
assert("resource_mapping_has_six_null_workflow_automation_slots", equalArrays(resource.resources.workflows.map((workflow) => workflow.logical_key), expectedWorkflowKeys) && resource.resources.workflows.every((workflow) => workflow.automation_id === null && valuesAreNull(workflow.automation_id_by_phase)) && equalSets(Object.keys(resource.resources.workflows.find((workflow) => workflow.logical_key === "W6").automation_id_by_phase), ["same_event_duplicate", "cross_event_improvement_observation"]), resource.resources.workflows);

const sensitiveResourceKeys = new Set([
  "app_token",
  "table_id",
  "view_id",
  "node_id",
  "automation_id",
  "platform_role_id",
  "document_token",
  "folder_token",
  "approval_id",
  "approval_code",
  "bot_id",
  "webhook_url",
  "space_id",
  "node_token",
  "app_id",
  "release_id",
  "agent_id",
  "app_secret",
  "verification_token",
  "encrypt_key",
  "base_url",
  "tenant_access_token",
  "user_access_token",
  "profile",
  "credential_store_reference",
]);
const nonNullSensitiveResources = [];
function inspectSensitiveResources(value, location = "resources") {
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    const childLocation = `${location}.${key}`;
    if (sensitiveResourceKeys.has(key) && child !== null) nonNullSensitiveResources.push(childLocation);
    if (key === "field_ids" && !valuesAreNull(child)) nonNullSensitiveResources.push(childLocation);
    if (key === "automation_id_by_phase" && !valuesAreNull(child)) nonNullSensitiveResources.push(childLocation);
    inspectSensitiveResources(child, childLocation);
  }
}
inspectSensitiveResources(resource.resources);
assert("resource_template_has_no_non_null_credentials_or_resource_ids", nonNullSensitiveResources.length === 0 && resource.resources.base.app_token === null, nonNullSensitiveResources);
assert("resource_template_has_no_complete_url", !/https?:\/\//i.test(resourceMappingText), "complete URL detected");
assert("resource_mapping_remains_example_unconfigured", resource.fact_class === "solution_design" && resource.mapping_status === "example_unconfigured" && resource.permission_status === "P01-P13_all_untested", {
  fact_class: resource.fact_class,
  mapping_status: resource.mapping_status,
  permission_status: resource.permission_status,
});

const evidenceGroups = [evidence.permission_checks, evidence.tables, evidence.views, evidence.ai_nodes, evidence.workflows];
const evidenceUnits = evidenceGroups.flat();
const evidenceNullFields = ["actual_action", "actual_time", "executor", "platform_account_role", "logical_business_role", "actual_result", "limitations", "fallback_actual_result", "verifier"];
assert("evidence_template_has_41_required_units", evidenceUnits.length === 41 && evidence.permission_checks.length === 13 && evidence.tables.length === 10 && evidence.views.length === 5 && evidence.ai_nodes.length === 7 && evidence.workflows.length === 6, {
  permissions: evidence.permission_checks.length,
  tables: evidence.tables.length,
  views: evidence.views.length,
  ai_nodes: evidence.ai_nodes.length,
  workflows: evidence.workflows.length,
});
assert("evidence_permission_ids_are_P01_to_P13", equalArrays(evidence.permission_checks.map((unit) => unit.key), Array.from({ length: 13 }, (_, index) => `P${String(index + 1).padStart(2, "0")}`)), evidence.permission_checks.map((unit) => unit.key));
assert("evidence_table_ids_map_canonical_order", equalArrays(evidence.tables.map((unit) => unit.key), Array.from({ length: 10 }, (_, index) => `T${String(index + 1).padStart(2, "0")}`)) && equalArrays(evidence.tables.map((unit) => unit.logical_key), expectedTableKeys), evidence.tables.map((unit) => [unit.key, unit.logical_key]));
assert("evidence_view_ids_map_logical_views", equalArrays(evidence.views.map((unit) => unit.key), Array.from({ length: 5 }, (_, index) => `V${String(index + 1).padStart(2, "0")}`)) && equalArrays(evidence.views.map((unit) => unit.logical_key), expectedViewKeys), evidence.views.map((unit) => [unit.key, unit.logical_key]));
assert("evidence_node_and_workflow_ids_are_canonical", equalArrays(evidence.ai_nodes.map((unit) => unit.key), expectedNodeKeys) && equalArrays(evidence.workflows.map((unit) => unit.key), expectedWorkflowKeys), {
  nodes: evidence.ai_nodes.map((unit) => unit.key),
  workflows: evidence.workflows.map((unit) => unit.key),
});
assert("all_41_evidence_units_remain_untested", evidenceUnits.every((unit) => unit.status === "未测试" && unit.platform_role_mapping_status === "未测试" && unit.fallback_verification_status === "未测试"), evidenceUnits.filter((unit) => unit.status !== "未测试"));
assert("all_actual_evidence_fields_are_empty", evidenceUnits.every((unit) => evidenceNullFields.every((field) => unit[field] === null)), evidenceUnits.filter((unit) => !evidenceNullFields.every((field) => unit[field] === null)).map((unit) => unit.key));
assert("all_evidence_indexes_and_redaction_states_are_unfilled", evidenceUnits.every((unit) => unit.evidence_presence === "待填" && unit.redaction_status === "待填" && Array.isArray(unit.screenshot_indexes) && unit.screenshot_indexes.length === 0 && Array.isArray(unit.run_indexes) && unit.run_indexes.length === 0), evidenceUnits.filter((unit) => unit.evidence_presence !== "待填" || unit.redaction_status !== "待填").map((unit) => unit.key));
assert("P01_and_P03_have_independent_evidence_units", evidence.permission_checks.find((unit) => unit.key === "P01") !== evidence.permission_checks.find((unit) => unit.key === "P03"), "P01/P03 unit collision");

const permissionRows = permissionMatrix.split(/\r?\n/).filter((line) => /^\| P\d{2} \|/.test(line));
const permissionStatuses = permissionRows.map((line) => line.split("|").map((part) => part.trim()).filter(Boolean).slice(0, 3));
assert("permission_matrix_P01_to_P13_still_all_untested", equalArrays(permissionStatuses.map((row) => row[0]), Array.from({ length: 13 }, (_, index) => `P${String(index + 1).padStart(2, "0")}`)) && permissionStatuses.every((row) => row[2] === "未测试"), permissionStatuses);

const permissionBranchIds = [...buildRunbook.matchAll(/^\| P(\d{2}) \|/gm)].map((match) => `P${match[1]}`);
assert("build_runbook_has_P01_to_P13_branches", equalArrays(permissionBranchIds, Array.from({ length: 13 }, (_, index) => `P${String(index + 1).padStart(2, "0")}`)), permissionBranchIds);
assert("build_runbook_has_required_step_columns", buildRunbook.includes("创建动作") && buildRunbook.includes("预期") && buildRunbook.includes("最小通过条件") && buildRunbook.includes("证据编号") && buildRunbook.includes("失败分类") && buildRunbook.includes("回退动作"), "missing required runbook column");
assert("permission_and_build_runbooks_use_one_evidence_prefix", permissionRunbook.includes("T2-EV-Pnn-YYYYMMDD-HHmm-seq") && !permissionRunbook.includes("T2-D1-") && !buildRunbook.includes("T2-D1-"), "evidence prefix drift");
const buildStepRows = buildRunbook.split(/\r?\n/).filter((line) => /^\| S-[A-Z0-9]+-\d{2} \|/.test(line));
assert("build_runbook_steps_have_expected_minimum_evidence_failure_and_rollback", buildStepRows.length >= 50 && buildStepRows.every((line) => line.includes("预期：") && line.includes("最小通过：") && line.includes("T2-EV-") && /F\d{2}/.test(line) && line.split("|").filter((part) => part.trim()).length >= 6), { step_rows: buildStepRows.length });
assert("local_resource_ignore_rules_are_documented_without_gitignore_change", buildRunbook.includes("/feishu/config/*.local.json") && buildRunbook.includes("/feishu/.local/") && buildRunbook.includes("不要修改仓库 `.gitignore`"), "local ignore instructions missing");
assert("anonymous_document_and_unprivileged_Base_are_separate", buildRunbook.includes("P01 匿名文档与 P03 Base 无特权访问始终分开验收") && buildRunbook.includes("P01 必须单独复验"), "P01/P03 separation missing");
assert("D1_D2_tools_do_not_replace_D0", buildRunbook.includes("妙搭、Aily、OpenAPI、`lark-cli` 任何结果都不能替代 P02/P03") && buildRunbook.includes("不能替代七节点和六工作流"), "D1/D2 replacement guard missing");

const rollbackRequiredPhrases = [
  "原状态",
  "sla_started_at",
  "AI 审计",
  "SYN-PERMISSION-TEST",
  "不删除正式证据",
  "不扩大权限",
  "停用本轮临时自动化",
  "撤销临时分享",
  "精确主键",
];
assert("rollback_runbook_preserves_state_sla_audit_and_formal_evidence", rollbackRequiredPhrases.every((phrase) => rollbackRunbook.includes(phrase)), rollbackRequiredPhrases.filter((phrase) => !rollbackRunbook.includes(phrase)));
assert("rollback_runbook_bans_broad_cleanup_and_vehicle_actions", rollbackRunbook.includes("禁止按整表、整个 Base、“全部记录”或通配条件清理") && rollbackRunbook.includes("不执行车辆控制、发车、调度"), "broad cleanup or vehicle action guard missing");

const requiredSafetyPhrases = ["车辆控制", "自动判责", "自动赔偿", "恢复时间", "最终根因", "未审知识"];
assert("runbooks_cover_all_prohibited_business_actions", requiredSafetyPhrases.every((phrase) => `${buildRunbook}\n${rollbackRunbook}`.includes(phrase)), requiredSafetyPhrases.filter((phrase) => !`${buildRunbook}\n${rollbackRunbook}`.includes(phrase)));

const expectedR10WriteAllowlist = [
  "clusters.member_case_ids",
  "clusters.status",
  "clusters.recurrence_records",
  "clusters.updated_at",
  "improvements.status",
  "improvements.day_7_result",
  "improvements.day_30_result",
  "improvements.human_conclusion",
  "improvements.updated_at",
];
const expectedR10Selectors = [
  { target: "clusters", field: "cluster_id" },
  { target: "improvements", field: "improvement_id" },
];
const expectedR10Errors = [
  "invalid_projection_input",
  "unverified_commit",
  "commit_proof_mismatch",
  "event_conflict",
  "projection_conflict",
  "sensitive_output_rejected",
  "platform_capability_insufficient",
  "projection_dependency_failure",
];
const expectedSnapshotFields = [
  "improvements.day_7_result",
  "improvements.day_30_result",
  "improvements.human_conclusion",
];
const expectedSnapshotRecordFields = [
  "projection_contract",
  "data_scope",
  "evidence_class",
  "source_receipt_sha256",
  "projection_idempotency_key",
  "committed_at",
  "previous_projection",
  "previous_projection_sha256",
];
const expectedPreviousProjectionFields = ["day_7_result", "day_30_result", "human_conclusion"];
const expectedR10BuildRootKeys = [
  "projector_key",
  "classification",
  "workflow_id",
  "workflow_count_effect",
  "base_table_count_effect",
  "real_executor_in_scope",
  "runtime_status",
  "logical_contract_ref",
  "contract_layers",
  "recurrence_record_union",
  "snapshot_and_clear_contract",
  "exact_write_allowlist",
  "write_target_counts",
  "business_key_selectors",
  "selector_and_locator_contract",
  "base_receipt_storage_contract",
  "found_binding_recheck_contract",
  "existing_same_contract",
  "sealed_plan_contract",
  "capability_attestation_contract",
  "capability_mode_branches",
  "execution_preflight_recheck",
  "observed_state_truth_table",
  "raw_recurrence_visibility_contract",
  "manual_stop_and_rollback_contract",
  "error_closed_set_ref",
];
const expectedR10OnsiteEntryGate = {
  existing_capability_evidence_ref: "P02+P03",
  component_evidence_units: ["P02", "P03"],
  automation_permission_gate: "P05",
  approval_or_protected_field_gate: "P06",
  verification_status: "not_tested",
  execution_mode: "insufficient",
  automatic_projection_enabled: false,
  manual_stop_required: true,
  result: null,
  evidence: null,
};
const expectedLogicalR10ContractLayers = {
  trusted_source: "verified_w6_reopen_projection_source.v1",
  base_before: "w6_reopen_projection_before.v1",
  trusted_capability: "w6_reopen_projection_capability.v1",
  private_sealed_plan: "w6_reopen_projection_plan.v1",
  trusted_execution_evidence: "w6_reopen_projection_execution_evidence.v1",
  base_observed: "w6_reopen_projection_observed.v1",
  planning_order: ["trusted_source", "base_before", "trusted_capability", "private_sealed_plan"],
  redelivery_order: ["trusted_source", "private_sealed_plan", "found_binding_recheck_via_existing_sealPlanIfAbsent", "trusted_execution_evidence", "base_observed"],
};
const expectedBuildR10ContractLayers = {
  trusted_source: "verified_w6_reopen_projection_source.v1",
  base_before: "w6_reopen_projection_before.v1",
  trusted_capability: "w6_reopen_projection_capability.v1",
  private_sealed_plan: "w6_reopen_projection_plan.v1",
  trusted_execution_evidence: "w6_reopen_projection_execution_evidence.v1",
  base_observed: "w6_reopen_projection_observed.v1",
  redelivery_order: ["trusted_source", "private_sealed_plan", "found_binding_recheck_via_existing_sealPlanIfAbsent", "trusted_execution_evidence", "base_observed"],
};
const expectedBaseReceiptStorageContract = {
  source_receipt_id_allowed_in_Base: false,
  source_receipt_sha256_allowed_only_in_reopen_snapshot: true,
  canonical_receipt_material_is_private_outbox_only: true,
};
const expectedCapabilityNotTested = {
  execution_mode: "insufficient",
  recurrence_visibility_no_broader_than_source_fields: false,
  permission_snapshot_sha256: null,
  permission_revision: null,
  issued_at: null,
  expires_at: null,
  evidence_unit_ref: null,
  verified_by_role: null,
};
const expectedCapabilitySynthetic = {
  data_scope: "synthetic_experiment",
  evidence_class: "synthetic_experiment",
  verified_by_role: "test_harness",
  real_executor_allowed: false,
};
const expectedCapabilityOnsiteVerified = {
  normalized_existing_evidence_unit_ref: "P02+P03",
  component_evidence_unit_refs: ["P02", "P03"],
  creates_new_probe: false,
  creates_new_evidence_unit: false,
  permission_snapshot_sha256_required: true,
  permission_revision_required: true,
  issued_at_and_expires_at_required: true,
  verified_by_role: "authorized_competition_operator",
};
const expectedCurrentCapability = {
  verification_status: "not_tested",
  execution_mode: "insufficient",
  permission_snapshot_sha256: null,
  permission_revision: null,
  evidence_unit_ref: null,
  result: null,
  evidence: null,
  real_feishu_operations: 0,
  lark_cli_login_operations: 0,
  openapi_calls: 0,
};
const expectedCapabilityModeBranches = {
  atomic_all_targets: {
    verification_status: "not_tested",
    requires_onsite_failure_injection_proof: true,
    automatic_execution_enabled: false,
  },
  sealed_outbox_cas: {
    verification_status: "not_tested",
    requires_durable_outbox_per_target_CAS_ack_and_crash_resume_proof: true,
    automatic_execution_enabled: false,
  },
  insufficient: {
    verification_status: "not_tested",
    decision: "manual_stop",
    base_writes: [],
  },
};
const expectedTruthTableRows = [
  {
    cluster: "B",
    improvement: "B",
    trusted_evidence: "sealed_plan_ack0_and_future_valid_unexpired_single_owner_private_worker_lease",
    decision: "apply_once",
    execution_targets: ["clusters", "improvements"],
  },
  {
    cluster: "B",
    improvement: "B",
    trusted_evidence: "no_valid_single_owner_private_worker_lease",
    decision: "reject",
    error: "projection_conflict",
    base_writes: [],
  },
  {
    cluster: "A",
    improvement: "A",
    trusted_evidence: "two_target_acks_and_cluster_marker_all_match_original_sealed_plan",
    decision: "already_applied",
    base_writes: [],
  },
  {
    cluster: "A",
    improvement: "B",
    trusted_evidence: "cluster_ack_and_cluster_marker_match_original_sealed_plan",
    decision: "repair",
    repair_target: "improvements",
  },
  {
    cluster: "B",
    improvement: "A",
    trusted_evidence: "improvement_ack_matches_original_sealed_plan",
    decision: "repair",
    repair_target: "clusters",
  },
  {
    cluster: "X",
    improvement: "any",
    trusted_evidence: "any",
    decision: "reject",
    error: "projection_conflict",
    base_writes: [],
  },
  {
    cluster: "any",
    improvement: "X",
    trusted_evidence: "any",
    decision: "reject",
    error: "projection_conflict",
    base_writes: [],
  },
  {
    cluster: "A_or_B",
    improvement: "A_or_B",
    trusted_evidence: "required_ack_or_marker_missing_or_mismatched",
    decision: "reject",
    error: "projection_conflict",
    base_writes: [],
  },
];

function collectR10ProjectionIssues(logicalContract, buildContract, onsiteEntryGate) {
  const issues = [];
  const buildBundleDigest = canonicalSha256({
    onsite_entry_gate: onsiteEntryGate,
    workflow_contract: buildContract,
  });
  if (buildBundleDigest !== EXPECTED_R10_BUILD_BUNDLE_SHA256) issues.push("build_bundle_digest");
  if (!exactOwnKeys(buildContract, expectedR10BuildRootKeys)) issues.push("build_root_keys");
  if (!deepEqual(onsiteEntryGate, expectedR10OnsiteEntryGate)
    || !exactOwnKeys(onsiteEntryGate, Object.keys(expectedR10OnsiteEntryGate))) issues.push("onsite_entry_gate");
  if (logical.counts?.tables !== 10 || logical.counts?.workflows !== 6
    || build.counts?.tables !== 10 || build.counts?.workflows !== 6
    || logicalContract?.projector_key !== "neoloop.feishu.w6-reopen.v1"
    || buildContract?.projector_key !== "neoloop.feishu.w6-reopen.v1"
    || logicalContract?.classification !== "W6_projection_side_effect_not_a_seventh_workflow"
    || buildContract?.classification !== logicalContract?.classification
    || logicalContract?.workflow_id !== "W6"
    || buildContract?.workflow_id !== "W6"
    || logicalContract?.workflow_count_effect !== "unchanged_6"
    || buildContract?.workflow_count_effect !== "unchanged_6"
    || logicalContract?.base_table_count_effect !== "unchanged_10"
    || buildContract?.base_table_count_effect !== "unchanged_10"
    || logicalContract?.deployment_status !== "offline_contract_not_configured_untested"
    || logicalContract?.real_executor_in_scope !== false
    || buildContract?.real_executor_in_scope !== false
    || buildContract?.runtime_status !== "not_configured_untested"
    || buildContract?.logical_contract_ref !== "logical://workflows/W6/reopen_projection_contract") issues.push("identity_counts_boundary");

  if (!deepEqual(logicalContract?.contract_layers, expectedLogicalR10ContractLayers)
    || !deepEqual(buildContract?.contract_layers, expectedBuildR10ContractLayers)) issues.push("contract_layers");

  if (!deepEqual(logicalContract?.semantic_replay_contract, {
    exact: {
      source_semantics: "authorized_exact_semantic_replay",
      decision: "no_op",
      projection_plan_count: 0,
      base_write_count: 0,
    },
    near: {
      source_semantics: "authorized_near_semantic_conflict",
      decision: "reject",
      error: "event_conflict",
      projection_plan_count: 0,
      base_write_count: 0,
    },
    miss: {
      source_semantics: "authorized_committed_new_reopen",
      decision: "apply_once",
      maximum_projection_plan_count: 1,
      requires_first_committed_reopen_receipt: true,
    },
  })) issues.push("semantic_replay");

  if (!equalArrays(logicalContract?.exact_write_allowlist ?? [], expectedR10WriteAllowlist)
    || !equalArrays(buildContract?.exact_write_allowlist ?? [], expectedR10WriteAllowlist)
    || !deepEqual(logicalContract?.write_target_counts, { clusters: 4, improvements: 5, total: 9 })
    || !deepEqual(buildContract?.write_target_counts, { clusters: 4, improvements: 5, total: 9 })) issues.push("allowlist_counts");

  if (!deepEqual(logicalContract?.business_key_selectors, expectedR10Selectors)
    || !deepEqual(buildContract?.business_key_selectors, expectedR10Selectors)
    || logicalContract?.selector_contract?.exact_single_record_required !== true
    || logicalContract?.selector_contract?.zero_or_multiple_matches !== "projection_conflict_zero_write"
    || logicalContract?.selector_contract?.business_id_is_not_feishu_record_id !== true
    || logicalContract?.selector_contract?.real_resource_identifiers_in_manifest !== false
    || logicalContract?.selector_contract?.opaque_locator_is_private_executor_material !== true
    || buildContract?.selector_and_locator_contract?.exact_single_record_required !== true
    || buildContract?.selector_and_locator_contract?.zero_or_multiple_matches !== "manual_stop_projection_conflict_zero_write"
    || buildContract?.selector_and_locator_contract?.real_resource_identifiers_in_build_package !== false) issues.push("selectors");

  const logicalUnion = logicalContract?.recurrence_record_union;
  const buildUnion = buildContract?.recurrence_record_union;
  const logicalSnapshot = logicalContract?.snapshot_and_clear_contract;
  const buildSnapshot = buildContract?.snapshot_and_clear_contract;
  if (!equalArrays(logicalUnion?.variants ?? [], ["preserved_non_R10_plain_JSON_record", "reopen_snapshot.v1"])
    || logicalUnion?.preserved_non_R10_record?.descriptor_safe_plain_JSON_required !== true
    || logicalUnion?.preserved_non_R10_record?.preserve_original_order !== true
    || logicalUnion?.preserved_non_R10_record?.preserve_exact_own_keys_and_values !== true
    || logicalUnion?.preserved_non_R10_record?.interpret_or_rewrite !== false
    || !equalArrays(logicalUnion?.reopen_snapshot_v1?.exact_fields ?? [], expectedSnapshotRecordFields)
    || !equalArrays(logicalUnion?.reopen_snapshot_v1?.previous_projection_exact_fields ?? [], expectedPreviousProjectionFields)
    || logicalUnion?.reopen_snapshot_v1?.append_only !== true
    || !equalArrays(buildUnion?.variants ?? [], ["preserved_non_R10_plain_JSON_record", "reopen_snapshot.v1"])
    || buildUnion?.preserved_non_R10_record !== "preserve_exact_descriptor_safe_own_keys_values_and_order_without_interpretation_or_rewrite"
    || !equalArrays(buildUnion?.reopen_snapshot_v1_exact_fields ?? [], expectedSnapshotRecordFields)
    || !equalArrays(buildUnion?.previous_projection_exact_fields ?? [], expectedPreviousProjectionFields)
    || buildUnion?.append_only !== true
    || !equalArrays(logicalSnapshot?.snapshot_previous_projection_fields ?? [], expectedSnapshotFields)
    || logicalSnapshot?.snapshot_source !== "trusted_Base_before_not_runtime_inference"
    || logicalSnapshot?.snapshot_destination !== "clusters.recurrence_records.reopen_snapshot.v1.previous_projection"
    || !equalArrays(logicalSnapshot?.clear_current_projection_fields_to_null ?? [], expectedSnapshotFields)
    || !equalArrays(buildSnapshot?.snapshot_previous_projection_fields ?? [], expectedSnapshotFields)
    || buildSnapshot?.snapshot_source !== "trusted_Base_before_not_runtime_inference"
    || buildSnapshot?.snapshot_destination !== "clusters.recurrence_records.reopen_snapshot.v1.previous_projection"
    || !equalArrays(buildSnapshot?.clear_current_projection_fields_to_null ?? [], expectedSnapshotFields)
    || logicalSnapshot?.same_sealed_plan_required !== true
    || buildSnapshot?.same_sealed_plan_required !== true
    || logicalSnapshot?.legal_miss_snapshot_append_count !== 1
    || logicalSnapshot?.semantic_replay_snapshot_append_count !== 0
    || buildSnapshot?.legal_miss_snapshot_append_count !== 1
    || buildSnapshot?.semantic_replay_snapshot_append_count !== 0
    || logicalSnapshot?.onsite_atomicity_status !== "not_tested"
    || buildSnapshot?.onsite_atomicity_status !== "not_tested") issues.push("snapshot_recurrence_preservation");

  if (!deepEqual(logicalContract?.base_receipt_storage_contract, expectedBaseReceiptStorageContract)
    || !deepEqual(buildContract?.base_receipt_storage_contract, expectedBaseReceiptStorageContract)) issues.push("base_receipt_storage");

  const found = logicalContract?.found_binding_recheck_contract;
  const buildFound = buildContract?.found_binding_recheck_contract;
  const existing = buildContract?.existing_same_contract;
  const sealed = buildContract?.sealed_plan_contract;
  if (found?.continue_only_when !== "existing_same_and_returned_plan_exactly_matches_lookup_authoritative_plan"
    || found?.new_initial_execution_owner_granted !== false
    || found?.new_execution_directive_granted !== false
    || found?.new_execution_right_granted !== false
    || logicalContract?.plan_directive_artifact_boundary?.found_binding_recheck_may_create_execution_directive !== false
    || logicalContract?.plan_directive_artifact_boundary?.ordinary_facade_found_or_existing_same_execution_right !== "none"
    || buildFound?.manual_stop_on_any_noncontinuation !== true
    || !Array.isArray(buildFound?.stopped_base_writes) || buildFound.stopped_base_writes.length !== 0
    || buildFound?.new_initial_execution_owner_granted !== false
    || buildFound?.new_execution_directive_granted !== false
    || buildFound?.new_execution_right_granted !== false
    || existing?.returned_plan_is_authoritative !== true
    || existing?.discard_local_plan_and_directive !== true
    || existing?.new_initial_execution_owner_granted !== false
    || existing?.new_execution_directive_granted !== false
    || existing?.B_B_ack0_without_valid_private_worker_lease !== "reject_projection_conflict_zero_write"
    || sealed?.complete_two_target_plan_required !== true
    || sealed?.seal_before_any_Base_write !== true
    || sealed?.repair_reuses_original_sealed_plan !== true
    || sealed?.ordinary_sequential_double_write_is_sealed_outbox_cas !== false
    || sealed?.current_durable_outbox_status !== "not_tested"
    || sealed?.current_worker_lease_status !== "not_tested") issues.push("owner_existing_same_sealed");

  const logicalCapability = logicalContract?.capability_attestation_contract;
  const buildCapability = buildContract?.capability_attestation_contract;
  if (logicalCapability?.attestation_contract !== "w6_reopen_projection_capability.v1"
    || buildCapability?.source_ref !== "logical://workflows/W6/reopen_projection_contract/capability_attestation_contract"
    || buildCapability?.attestation_contract !== "w6_reopen_projection_capability.v1"
    || !equalArrays(logicalCapability?.verification_status_allowed ?? [], ["synthetic_fixture", "not_tested", "onsite_verified"])
    || !equalArrays(buildCapability?.verification_status_allowed ?? [], ["synthetic_fixture", "not_tested", "onsite_verified"])
    || !equalArrays(logicalCapability?.execution_mode_allowed ?? [], ["atomic_all_targets", "sealed_outbox_cas", "insufficient"])
    || !equalArrays(buildCapability?.execution_mode_allowed ?? [], ["atomic_all_targets", "sealed_outbox_cas", "insufficient"])
    || logicalCapability?.states_are_mutually_exclusive !== true
    || buildCapability?.states_are_mutually_exclusive !== true
    || !deepEqual(logicalCapability?.not_tested_requires, expectedCapabilityNotTested)
    || !deepEqual(buildCapability?.not_tested_requires, expectedCapabilityNotTested)
    || !deepEqual(logicalCapability?.synthetic_fixture_requires, expectedCapabilitySynthetic)
    || !deepEqual(buildCapability?.synthetic_fixture_requires, expectedCapabilitySynthetic)
    || !deepEqual(logicalCapability?.onsite_verified_requires, expectedCapabilityOnsiteVerified)
    || !deepEqual(buildCapability?.onsite_verified_requires, expectedCapabilityOnsiteVerified)
    || !deepEqual(logicalCapability?.current_onsite_state, expectedCurrentCapability)
    || !deepEqual(buildCapability?.current_onsite_state, expectedCurrentCapability)
    || !deepEqual(buildContract?.capability_mode_branches, expectedCapabilityModeBranches)) issues.push("capability_not_tested_insufficient");

  const truth = buildContract?.observed_state_truth_table;
  if (!deepEqual(truth?.symbols, { B: "exact_expected_before", A: "exact_expected_after", X: "neither_expected_before_nor_expected_after" })
    || !deepEqual(truth?.rows, expectedTruthTableRows)
    || truth?.repair_reuses_original_sealed_plan !== true
    || truth?.repair_reauthorization_allowed !== false
    || truth?.repair_semantic_lookup_allowed !== false) issues.push("truth_table_repair");

  const manual = buildContract?.manual_stop_and_rollback_contract;
  const preflight = buildContract?.execution_preflight_recheck;
  if (manual?.automatic_projection_enabled !== false
    || !equalArrays(manual?.stop_when ?? [], [
      "capability_not_tested",
      "execution_mode_insufficient",
      "permission_or_attestation_revision_drift",
      "selector_zero_or_multiple_match",
      "before_CAS_mismatch",
      "ack_or_marker_missing_or_mismatched",
      "no_valid_single_owner_private_worker_lease",
    ])
    || !Array.isArray(manual?.stopped_base_writes) || manual.stopped_base_writes.length !== 0
    || !equalArrays(manual?.preserve ?? [], [
      "original_cluster_record",
      "original_improvement_record",
      "original_recurrence_records_order",
      "sealed_plan_and_private_audit_if_any",
    ])
    || manual?.broad_permission_fallback_allowed !== false
    || manual?.ordinary_sequential_double_write_fallback_allowed !== false
    || !equalArrays(preflight?.before_initial_write_and_each_repair ?? [], [
      "onsite_verified_attestation",
      "attestation_id_and_sha",
      "attestation_expiry_at_capability_rechecked_at",
      "permission_snapshot_sha256",
      "permission_revision",
      "selector_exact_single_match",
      "resolved_locator_binding",
      "expected_before_CAS",
    ])
    || preflight?.trusted_execution_evidence_and_ack_record_capability_rechecked_at !== true
    || preflight?.not_tested_or_insufficient !== "manual_stop_zero_write"
    || preflight?.permission_or_attestation_revision_drift !== "manual_stop_platform_capability_insufficient_zero_write"
    || preflight?.selector_zero_or_multiple_match !== "manual_stop_projection_conflict_zero_write"
    || preflight?.before_CAS_mismatch !== "manual_stop_projection_conflict_zero_write") issues.push("manual_stop_rollback");

  const rawVisibility = buildContract?.raw_recurrence_visibility_contract;
  if (rawVisibility?.source_ref !== "logical://tables/clusters/fields/recurrence_records/visibility_contract"
    || !equalArrays(rawVisibility?.raw_read_logical_roles ?? [], ["improvement_insight"])
    || !equalArrays(rawVisibility?.hidden_in_business_views ?? [], ["issue_map", "improvement_tracking"])
    || !equalArrays(rawVisibility?.P03_unprivileged_access_surfaces ?? [], ["all_five_business_views", "direct_clusters_table_access"])
    || rawVisibility?.verification_status !== "not_tested"
    || rawVisibility?.result !== null
    || rawVisibility?.evidence !== null) issues.push("raw_recurrence_visibility");

  if (!equalArrays(logicalContract?.error_closed_set ?? [], expectedR10Errors)
    || buildContract?.error_closed_set_ref !== "logical://workflows/W6/reopen_projection_contract/error_closed_set") issues.push("error_closed_set");
  return issues;
}

const logicalR10 = logicalWorkflowByKey.get("W6")?.reopen_projection_contract;
const buildR10 = buildW6?.reopen_projection_build_contract;
const r10OnsiteEntryGate = build?.onsite_entry_gate?.r10_reopen_projection;
const r10ProjectionIssues = collectR10ProjectionIssues(logicalR10, buildR10, r10OnsiteEntryGate);
for (const [name, issue] of [
  ["R10_build_bundle_matches_exact_reviewed_canonical_digest", "build_bundle_digest"],
  ["R10_build_contract_root_key_set_is_exact", "build_root_keys"],
  ["R10_top_level_onsite_entry_gate_is_exact_and_untested", "onsite_entry_gate"],
  ["R10_projection_stays_inside_W6_10_tables_with_no_real_executor", "identity_counts_boundary"],
  ["R10_logical_and_build_contract_layers_are_exact", "contract_layers"],
  ["R10_exact_near_and_committed_miss_projection_semantics_are_fail_closed", "semantic_replay"],
  ["R10_logical_and_build_use_exact_4_plus_5_nine_field_allowlist", "allowlist_counts"],
  ["R10_business_selectors_require_exact_single_match_and_private_locators", "selectors"],
  ["R10_snapshot_clear_and_non_R10_recurrence_preservation_are_mirrored", "snapshot_recurrence_preservation"],
  ["R10_receipt_material_storage_stays_private_and_digest_only_in_Base", "base_receipt_storage"],
  ["R10_found_existing_same_and_sealed_states_grant_no_new_execution_right", "owner_existing_same_sealed"],
  ["R10_not_tested_capability_forces_insufficient_and_zero_write", "capability_not_tested_insufficient"],
  ["R10_truth_table_and_repairs_reuse_the_original_sealed_plan", "truth_table_repair"],
  ["R10_manual_stop_preserves_state_and_bans_sequential_double_write", "manual_stop_rollback"],
  ["R10_raw_recurrence_visibility_stays_limited_and_onsite_untested", "raw_recurrence_visibility"],
  ["R10_logical_and_build_error_closed_set_is_exact", "error_closed_set"],
]) {
  assertInGroup("r10_build_projection", name, !r10ProjectionIssues.includes(issue), r10ProjectionIssues);
}

assertInGroup("current_version_chain", "R10_package_0_1_5_pins_logical_0_1_6_by_exact_snapshot_SHA", logical.manifest_version === "0.1.6"
  && build.package_version === "0.1.5"
  && build.source_of_truth?.manifest_version === "0.1.6"
  && build.source_of_truth?.path === "./neoloop-logical-manifest.v0.1.json"
  && build.source_of_truth?.sha256 === snapshotA.logicalManifest.sha256, {
  logical_version: logical.manifest_version,
  build_version: build.package_version,
  pinned_version: build.source_of_truth?.manifest_version,
  pinned_sha: build.source_of_truth?.sha256,
});
assertInGroup("current_version_chain", "baseline_version_attestation_matches_R10_current_chain", baseline?.versions?.logical_manifest_version === logical.manifest_version
  && baseline?.versions?.build_package_version === build.package_version, baseline?.versions);
assertInGroup("current_version_chain", "R10_offline_derivative_versions_remain_evidence_0_1_6_and_resource_example_0_1_0", evidence.template_version === "0.1.6"
  && resource.mapping_version === "0.1.0-example", {
  evidence_version: evidence.template_version,
  resource_version: resource.mapping_version,
});

function resolveJsonPointer(document, pointer) {
  if (typeof pointer !== "string" || !pointer.startsWith("#/")) return undefined;
  return pointer.slice(2).split("/").reduce((value, token) => {
    if (value === null || value === undefined || typeof value !== "object") return undefined;
    const decoded = token.replaceAll("~1", "/").replaceAll("~0", "~");
    return Object.prototype.hasOwnProperty.call(value, decoded) ? value[decoded] : undefined;
  }, document);
}

function collectActualSlots(value, destination = []) {
  if (!value || typeof value !== "object") return destination;
  for (const [key, child] of Object.entries(value)) {
    if (key.startsWith("actual_")) destination.push(child);
    collectActualSlots(child, destination);
  }
  return destination;
}

const expectedEvidenceComponentRefs = {
  P02: "#/permission_checks/1/r10_selector_and_execution_mode_evidence_contract",
  P03: "#/permission_checks/2/r10_recurrence_visibility_and_attestation_evidence_contract",
  P05: "#/permission_checks/4/r10_outbox_cas_execution_evidence_contract",
  P06: "#/permission_checks/5/r10_reopen_authorization_evidence_contract",
  T04: "#/tables/3/r10_cluster_projection_evidence_contract",
  T05: "#/tables/4/r10_improvement_projection_evidence_contract",
  V04: "#/views/3/r10_raw_recurrence_visibility_evidence_contract",
  V05: "#/views/4/r10_raw_recurrence_visibility_evidence_contract",
};
const expectedEvidenceOnsiteState = {
  verification_status: "not_tested",
  execution_mode: "insufficient",
  automatic_projection_enabled: false,
  attestation_id_digest: null,
  capability_attestation_sha256: null,
  permission_snapshot_sha256: null,
  permission_revision: null,
  issued_at: null,
  expires_at: null,
  capability_checked_at: null,
  capability_rechecked_at: null,
  evidence_unit_ref: null,
  trusted_execution_evidence_ref: null,
  target_ack_evidence_ref: null,
  worker_lease_evidence_ref: null,
  real_feishu_operations: 0,
  lark_cli_login_operations: 0,
  openapi_calls: 0,
  base_write_attempts: 0,
};

const expectedR10EvidenceBundle = {
  P02: {
    probe_ref: "P02",
    normalized_existing_evidence_unit_ref: "P02+P03",
    creates_new_probe: false,
    creates_new_evidence_unit: false,
    selector_case_results: {
      clusters: { one: null, zero: null, many: null },
      improvements: { one: null, zero: null, many: null },
    },
    actual_execution_mode: null,
    actual_atomic_all_targets_fault_injection_result: null,
    actual_sealed_outbox_cas_fault_injection_result: null,
    permission_snapshot_sha256: null,
    permission_revision: null,
  },
  P03: {
    probe_ref: "P03",
    normalized_existing_evidence_unit_ref: "P02+P03",
    creates_new_evidence_unit: false,
    actual_all_five_business_views_result: null,
    actual_direct_clusters_table_result: null,
    actual_recurrence_visibility_no_broader_than_source_fields_result: null,
    attestation_id_digest: null,
    capability_attestation_sha256: null,
    permission_snapshot_sha256: null,
    permission_revision: null,
    issued_at: null,
    expires_at: null,
    capability_checked_at: null,
    capability_rechecked_at: null,
    actual_prewrite_recheck_result: null,
    actual_drift_or_expiry_injection_result: null,
  },
  P05: {
    probe_ref: "P05",
    actual_seal_before_any_Base_write_result: null,
    actual_single_initial_owner_result: null,
    actual_concurrent_same_receipt_one_sealed_rest_existing_same_result: null,
    actual_atomic_all_targets_fault_injection_result: null,
    actual_sealed_outbox_cas_fault_injection_result: null,
    actual_target_ack_order_and_binding_result: null,
    actual_worker_lease_result: null,
    actual_repair_reuses_original_plan_result: null,
    actual_after_without_ack_rejection_result: null,
    actual_dependency_safe_error: null,
    actual_manual_stop_zero_write_result: null,
    current_durable_outbox_status: "not_tested",
    current_worker_lease_status: "not_tested",
  },
  P06: {
    probe_ref: "P06",
    source_action: "reopen_recurrence",
    expected_initial_authorization_source: "committed_R9_human_authorization",
    expected_repair_authorization_call_count: 0,
    expected_semantic_replay_authorization_call_count: 0,
    actual_committed_authorization_result: null,
    actual_source_receipt_sha256_presence: null,
    actual_initial_authorization_call_count: null,
    actual_repair_authorization_call_count: null,
    actual_semantic_replay_authorization_call_count: null,
    actual_manual_stop_result: null,
    private_authorization_material_storage_allowed: false,
  },
  T04: {
    target: "clusters",
    selector_field: "cluster_id",
    actual_selector_match_count: null,
    actual_before_sha256_presence: null,
    actual_after_sha256_presence: null,
    actual_observed_state: null,
    actual_write_field_keys: null,
    actual_member_case_union_result: null,
    actual_snapshot_append_count: null,
    actual_non_R10_record_preservation_result: null,
    actual_recurrence_record_order_preservation_result: null,
    actual_member_case_order_preservation_result: null,
    actual_target_ack_binding_result: null,
    actual_resolved_record_locator_sha256_presence: null,
    actual_rollback_preservation_result: null,
    actual_direct_table_raw_recurrence_visibility: null,
  },
  T05: {
    target: "improvements",
    selector_field: "improvement_id",
    actual_selector_match_count: null,
    actual_before_sha256_presence: null,
    actual_after_sha256_presence: null,
    actual_observed_state: null,
    actual_write_field_keys: null,
    actual_snapshot_source_result: null,
    actual_day_7_result_cleared_to_null: null,
    actual_day_30_result_cleared_to_null: null,
    actual_human_conclusion_cleared_to_null: null,
    actual_target_ack_binding_result: null,
    actual_resolved_record_locator_sha256_presence: null,
    actual_rollback_preservation_result: null,
  },
  V04: {
    view_key: "issue_map",
    probe_ref: "P03",
    actual_unprivileged_open_result: null,
    actual_refresh_result: null,
    actual_relogin_result: null,
    actual_raw_recurrence_records_visible: null,
    actual_source_permission_intersection_result: null,
  },
  V05: {
    view_key: "improvement_tracking",
    probe_ref: "P03",
    actual_unprivileged_open_result: null,
    actual_refresh_result: null,
    actual_relogin_result: null,
    actual_raw_recurrence_records_visible: null,
    actual_source_permission_intersection_result: null,
  },
  W6: {
    identity: {
      workflow_id: "W6",
      projector_key: "neoloop.feishu.w6-reopen.v1",
      classification: "W6_projection_side_effect_not_a_seventh_workflow",
      source_action: "reopen_recurrence",
      required_probe_gates: ["P02", "P03", "P05", "P06"],
      normalized_existing_evidence_unit_ref: "P02+P03",
      creates_new_evidence_unit: false,
      creates_new_result_unit: false,
      workflow_count_effect: "unchanged_6",
      real_executor_in_scope: false,
    },
    component_evidence_unit_refs: expectedEvidenceComponentRefs,
    semantic_replay_and_committed_miss_requirements: [
      "exact_is_no_op_with_zero_total_port_calls_and_zero_writes",
      "near_is_event_conflict_with_zero_total_port_calls_and_zero_writes",
      "committed_miss_is_apply_once_with_one_complete_two_target_plan",
    ],
    sealed_owner_and_existing_same_requirements: [
      "complete_two_target_plan_is_sealed_before_any_Base_write",
      "same_receipt_different_trusted_clock_ticks_keep_one_stable_plan",
      "concurrent_same_receipt_has_one_sealed_and_all_others_existing_same",
      "existing_same_returned_plan_is_authoritative",
      "existing_same_discards_local_plan_and_directive",
      "existing_same_grants_no_new_owner_directive_or_execution_right",
      "existing_same_continues_in_trusted_execution_evidence_then_Base_observed_then_reconcile_order",
    ],
    found_binding_recheck_requirements: [
      "recheck_source_receipt_id",
      "recheck_source_receipt_sha256_digest_owner",
      "recheck_canonical_receipt_material",
      "recheck_sealed_plan",
      "receipt_conflict_maps_to_commit_proof_mismatch",
      "digest_plan_or_returned_plan_mismatch_maps_to_projection_conflict",
      "sealed_after_found_maps_to_projection_dependency_failure",
      "non_existing_same_or_returned_plan_mismatch_stops_before_evidence_observed_capability_or_clock_reads",
    ],
    snapshot_and_write_boundary_requirements: [
      "snapshot_trusted_Base_before_day_7_day_30_and_human_conclusion_into_one_tail_reopen_snapshot_v1",
      "clear_current_day_7_day_30_and_human_conclusion_in_the_same_sealed_plan",
      "preserve_non_R10_recurrence_records_and_member_case_order",
      "write_only_clusters_4_plus_improvements_5_exact_nine_field_allowlist",
      "write_no_other_field_or_table",
    ],
    observed_state_ack_lease_and_repair_requirements: [
      "B_B_with_valid_private_single_owner_lease_apply_once",
      "B_B_without_valid_private_single_owner_lease_reject_zero_write",
      "A_A_with_two_matching_acks_and_cluster_marker_is_already_applied",
      "A_B_with_matching_cluster_ack_and_marker_repairs_improvements_only",
      "B_A_with_matching_improvement_ack_repairs_clusters_only",
      "X_or_ack_marker_mismatch_rejects_zero_write",
      "after_without_corresponding_ack_never_fabricates_ack_or_repairs",
      "repair_reuses_original_sealed_plan_without_reauthorization_or_semantic_lookup",
    ],
    execution_preflight_requirements: [
      "recheck_onsite_attestation_and_expiry_before_initial_write_and_each_repair",
      "recheck_permission_snapshot_and_revision_before_initial_write_and_each_repair",
      "recheck_selector_exact_single_match_and_private_locator_binding",
      "recheck_expected_before_CAS",
      "not_tested_insufficient_expired_drifted_zero_or_many_selector_or_CAS_mismatch_manual_stops_zero_write",
      "capability_rechecked_at_is_recorded_only_in_trusted_execution_evidence_and_ack_not_plan_identity",
    ],
    dependency_and_redaction_requirements: [
      "source_Base_capability_clock_outbox_or_hasher_failure_maps_to_projection_dependency_failure",
      "redaction_scan_failure_maps_to_sensitive_output_rejected",
      "public_artifact_and_public_logs_are_recursively_scanned",
      "recursive_sensitive_sentinel_hit_count_must_be_zero",
    ],
    manual_stop_and_rollback_requirements: [
      "manual_stop_preserves_original_cluster_and_improvement",
      "manual_stop_preserves_original_recurrence_and_member_order",
      "manual_stop_preserves_existing_sealed_plan_and_private_audit_if_any",
      "manual_stop_disables_only_named_temporary_automation",
      "manual_stop_never_uses_broad_permission_or_sequential_double_write_fallback",
    ],
    current_onsite_state: expectedEvidenceOnsiteState,
    onsite_actual_slots: {
      actual_exact_total_port_calls: null,
      actual_exact_write_count: null,
      actual_near_total_port_calls: null,
      actual_near_write_count: null,
      actual_near_safe_error: null,
      actual_miss_decision: null,
      actual_miss_plan_count: null,
      actual_public_artifact_key_count: null,
      actual_public_artifact_sensitive_hit_count: null,
      actual_public_log_sensitive_hit_count: null,
      actual_redaction_safe_error: null,
      actual_human_stop_triggered: null,
    },
    r10_evidence_indexes: [],
    forbidden_storage: [
      "source_receipt_id",
      "canonical_receipt_material",
      "receipt_history_or_cycle_raw_values",
      "day_7_result_day_30_result_or_human_conclusion_raw_text",
      "raw_recurrence_records",
      "internal_plan_patch_or_execution_directive",
      "business_key_selector",
      "raw_record_locator",
      "worker_lease_token",
      "complete_target_ack",
      "principal_grant_claims_or_policy",
      "attestation_credential",
      "provider_error_object_message_cause_or_stack",
      "rejection_raw_text",
      "real_resource_ids",
      "enterprise_data",
    ],
    allowed_storage: [
      "boolean_results",
      "numeric_counts",
      "domain_separated_digest_presence",
      "existing_redacted_screenshot_and_run_indexes",
    ],
  },
};

function selectR10EvidenceBundle(evidenceDocument) {
  return {
    P02: evidenceDocument?.permission_checks?.[1]?.r10_selector_and_execution_mode_evidence_contract,
    P03: evidenceDocument?.permission_checks?.[2]?.r10_recurrence_visibility_and_attestation_evidence_contract,
    P05: evidenceDocument?.permission_checks?.[4]?.r10_outbox_cas_execution_evidence_contract,
    P06: evidenceDocument?.permission_checks?.[5]?.r10_reopen_authorization_evidence_contract,
    T04: evidenceDocument?.tables?.[3]?.r10_cluster_projection_evidence_contract,
    T05: evidenceDocument?.tables?.[4]?.r10_improvement_projection_evidence_contract,
    V04: evidenceDocument?.views?.[3]?.r10_raw_recurrence_visibility_evidence_contract,
    V05: evidenceDocument?.views?.[4]?.r10_raw_recurrence_visibility_evidence_contract,
    W6: evidenceDocument?.workflows?.[5]?.r10_reopen_projection_evidence_contract,
  };
}

function collectR10EvidenceIssues(evidenceDocument) {
  const issues = [];
  const workflowUnit = evidenceDocument?.workflows?.find((unit) => unit?.key === "W6");
  const contract = workflowUnit?.r10_reopen_projection_evidence_contract;
  const evidenceBundle = selectR10EvidenceBundle(evidenceDocument);
  const expectedBundleDigest = canonicalSha256(expectedR10EvidenceBundle);
  const observedBundleDigest = canonicalSha256(evidenceBundle);
  if (expectedBundleDigest !== EXPECTED_R10_EVIDENCE_BUNDLE_SHA256
    || observedBundleDigest !== EXPECTED_R10_EVIDENCE_BUNDLE_SHA256
    || canonicalJson(evidenceBundle) !== canonicalJson(expectedR10EvidenceBundle)) issues.push("evidence_bundle_digest");
  if (!exactOwnKeys(evidenceBundle, Object.keys(expectedR10EvidenceBundle))
    || Object.keys(expectedR10EvidenceBundle).some((key) => !exactOwnKeys(evidenceBundle[key], Object.keys(expectedR10EvidenceBundle[key])))) issues.push("evidence_component_keys");
  if (evidenceDocument?.permission_checks?.length !== 13
    || evidenceDocument?.tables?.length !== 10
    || evidenceDocument?.views?.length !== 5
    || evidenceDocument?.ai_nodes?.length !== 7
    || evidenceDocument?.workflows?.length !== 6
    || contract?.identity?.workflow_id !== "W6"
    || contract?.identity?.projector_key !== "neoloop.feishu.w6-reopen.v1"
    || !equalArrays(contract?.identity?.required_probe_gates ?? [], ["P02", "P03", "P05", "P06"])
    || contract?.identity?.normalized_existing_evidence_unit_ref !== "P02+P03"
    || contract?.identity?.creates_new_evidence_unit !== false
    || contract?.identity?.creates_new_result_unit !== false
    || contract?.identity?.workflow_count_effect !== "unchanged_6"
    || contract?.identity?.real_executor_in_scope !== false
    || !exactOwnKeys(contract?.identity, Object.keys(expectedR10EvidenceBundle.W6.identity))
    || canonicalJson(contract?.identity) !== canonicalJson(expectedR10EvidenceBundle.W6.identity)) issues.push("evidence_identity_counts");

  if (!deepEqual(contract?.component_evidence_unit_refs, expectedEvidenceComponentRefs)
    || Object.entries(expectedEvidenceComponentRefs).some(([component, pointer]) => {
      const resolved = resolveJsonPointer(evidenceDocument, pointer);
      return resolved === undefined
        || resolved === null
        || Array.isArray(resolved)
        || typeof resolved !== "object"
        || canonicalJson(resolved) !== canonicalJson(expectedR10EvidenceBundle[component]);
    })) issues.push("evidence_component_refs");

  const requirementKeys = [
    "semantic_replay_and_committed_miss_requirements",
    "sealed_owner_and_existing_same_requirements",
    "found_binding_recheck_requirements",
    "snapshot_and_write_boundary_requirements",
    "observed_state_ack_lease_and_repair_requirements",
    "execution_preflight_requirements",
    "dependency_and_redaction_requirements",
    "manual_stop_and_rollback_requirements",
  ];
  if (!exactOwnKeys(contract, Object.keys(expectedR10EvidenceBundle.W6))
    || requirementKeys.some((key) => !equalArrays(contract?.[key] ?? [], expectedR10EvidenceBundle.W6[key]))
    || !equalArrays(contract?.forbidden_storage ?? [], expectedR10EvidenceBundle.W6.forbidden_storage)
    || !equalArrays(contract?.allowed_storage ?? [], expectedR10EvidenceBundle.W6.allowed_storage)) issues.push("evidence_requirements_storage");

  const actualSlots = collectActualSlots(evidenceDocument);
  if (!deepEqual(contract?.current_onsite_state, expectedEvidenceOnsiteState)
    || !deepEqual(contract?.onsite_actual_slots, expectedR10EvidenceBundle.W6.onsite_actual_slots)
    || !exactOwnKeys(contract?.onsite_actual_slots, Object.keys(expectedR10EvidenceBundle.W6.onsite_actual_slots))
    || !Array.isArray(contract?.r10_evidence_indexes) || contract.r10_evidence_indexes.length !== 0
    || actualSlots.some((value) => value !== null)
    || workflowUnit?.status !== "未测试") issues.push("evidence_onsite_slots");
  return issues;
}

const r10EvidenceIssues = collectR10EvidenceIssues(evidence);
for (const [name, issue] of [
  ["R10_evidence_bundle_matches_exact_reviewed_canonical_digest", "evidence_bundle_digest"],
  ["R10_evidence_component_root_key_sets_are_exact", "evidence_component_keys"],
  ["R10_evidence_reuses_P02_P03_P05_P06_T04_T05_V04_V05_without_new_units", "evidence_identity_counts"],
  ["R10_evidence_component_refs_resolve_to_existing_exact_units", "evidence_component_refs"],
  ["R10_evidence_requirement_and_storage_arrays_are_exact", "evidence_requirements_storage"],
  ["R10_W6_onsite_state_and_all_actual_slots_refs_and_indexes_remain_empty", "evidence_onsite_slots"],
]) {
  assertInGroup("r10_onsite_evidence", name, !r10EvidenceIssues.includes(issue), r10EvidenceIssues);
}
assertInGroup("r10_onsite_evidence", "R10_current_boundary_is_not_tested_insufficient_with_zero_real_operations", logicalR10?.onsite_boundary?.platform_atomic_all_targets === "not_tested"
  && logicalR10?.onsite_boundary?.durable_sealed_outbox_CAS === "not_tested"
  && logicalR10?.onsite_boundary?.worker_lease === "not_tested"
  && logicalR10?.onsite_boundary?.exactly_once === "not_tested"
  && logicalR10?.onsite_boundary?.real_Base_resources === null
  && logicalR10?.onsite_boundary?.deployment_claim === false
  && expectedEvidenceOnsiteState.verification_status === "not_tested"
  && expectedEvidenceOnsiteState.execution_mode === "insufficient"
  && expectedEvidenceOnsiteState.automatic_projection_enabled === false
  && expectedEvidenceOnsiteState.real_feishu_operations === 0
  && expectedEvidenceOnsiteState.lark_cli_login_operations === 0
  && expectedEvidenceOnsiteState.openapi_calls === 0
  && expectedEvidenceOnsiteState.base_write_attempts === 0, logicalR10?.onsite_boundary);

const projectionMutationCases = [
  { name: "logical_allowlist", expectedIssues: ["allowlist_counts"], mutate: (copy) => { copy.logical.exact_write_allowlist[0] = "clusters.unexpected"; } },
  { name: "build_selector", expectedIssues: ["build_bundle_digest", "selectors"], mutate: (copy) => { copy.build.business_key_selectors[0].field = "record_id"; } },
  { name: "found_execution_right", expectedIssues: ["owner_existing_same_sealed"], mutate: (copy) => { copy.logical.found_binding_recheck_contract.new_execution_right_granted = true; } },
  { name: "truth_table_repair", expectedIssues: ["build_bundle_digest", "truth_table_repair"], mutate: (copy) => { copy.build.observed_state_truth_table.rows[3].repair_target = "clusters"; } },
  { name: "build_gate_automatic_projection", expectedIssues: ["build_bundle_digest", "onsite_entry_gate"], mutate: (copy) => { copy.gate.automatic_projection_enabled = true; } },
  { name: "build_projector_key", expectedIssues: ["build_bundle_digest", "identity_counts_boundary"], mutate: (copy) => { copy.build.projector_key = "neoloop.feishu.w6-reopen.v2"; } },
  { name: "build_snapshot_source", expectedIssues: ["build_bundle_digest", "snapshot_recurrence_preservation"], mutate: (copy) => { copy.build.snapshot_and_clear_contract.snapshot_source = "runtime_inference"; } },
  { name: "build_receipt_storage", expectedIssues: ["build_bundle_digest", "base_receipt_storage"], mutate: (copy) => { copy.build.base_receipt_storage_contract.source_receipt_id_allowed_in_Base = true; } },
  { name: "build_found_execution_right", expectedIssues: ["build_bundle_digest", "owner_existing_same_sealed"], mutate: (copy) => { copy.build.found_binding_recheck_contract.new_execution_right_granted = true; } },
  { name: "build_synthetic_executor", expectedIssues: ["build_bundle_digest", "capability_not_tested_insufficient"], mutate: (copy) => { copy.build.capability_attestation_contract.synthetic_fixture_requires.real_executor_allowed = true; } },
  { name: "build_root_extra_key", expectedIssues: ["build_bundle_digest", "build_root_keys"], mutate: (copy) => { copy.build.synthetic_extra_key = false; } },
];
const projectionMutationResults = projectionMutationCases.map(({ name, expectedIssues, mutate }) => {
  const copy = structuredClone({ logical: logicalR10, build: buildR10, gate: r10OnsiteEntryGate });
  mutate(copy);
  const observedIssues = collectR10ProjectionIssues(copy.logical, copy.build, copy.gate);
  return recordNegativeTest("r10_projection", name, equalArrays(observedIssues, expectedIssues));
});
assertInGroup("r10_build_projection", "R10_projection_key_field_mutation_matrix_fails_closed", projectionMutationResults.length === 11 && projectionMutationResults.every(Boolean), projectionMutationResults);

const evidenceMutationCases = [
  { name: "onsite_actual_slot", expectedIssues: ["evidence_bundle_digest", "evidence_onsite_slots"], mutate: (copy) => { copy.workflows[5].r10_reopen_projection_evidence_contract.onsite_actual_slots.actual_miss_plan_count = 1; } },
  { name: "component_ref", expectedIssues: ["evidence_bundle_digest", "evidence_component_refs"], mutate: (copy) => { copy.workflows[5].r10_reopen_projection_evidence_contract.component_evidence_unit_refs.P02 = "#/permission_checks/0"; } },
  { name: "P02_selector_one", expectedIssues: ["evidence_bundle_digest", "evidence_component_refs"], mutate: (copy) => { copy.permission_checks[1].r10_selector_and_execution_mode_evidence_contract.selector_case_results.clusters.one = 1; } },
  { name: "P03_attestation_digest", expectedIssues: ["evidence_bundle_digest", "evidence_component_refs"], mutate: (copy) => { copy.permission_checks[2].r10_recurrence_visibility_and_attestation_evidence_contract.attestation_id_digest = "synthetic_safe_marker"; } },
  { name: "P05_durable_status", expectedIssues: ["evidence_bundle_digest", "evidence_component_refs"], mutate: (copy) => { copy.permission_checks[4].r10_outbox_cas_execution_evidence_contract.current_durable_outbox_status = "onsite_verified"; } },
  { name: "P06_private_storage", expectedIssues: ["evidence_bundle_digest", "evidence_component_refs"], mutate: (copy) => { copy.permission_checks[5].r10_reopen_authorization_evidence_contract.private_authorization_material_storage_allowed = true; } },
  { name: "W6_forbidden_storage", expectedIssues: ["evidence_bundle_digest", "evidence_requirements_storage"], mutate: (copy) => { copy.workflows[5].r10_reopen_projection_evidence_contract.forbidden_storage.pop(); } },
  { name: "component_extra_key", expectedIssues: ["evidence_bundle_digest", "evidence_component_keys", "evidence_component_refs"], mutate: (copy) => { copy.tables[3].r10_cluster_projection_evidence_contract.synthetic_extra_key = null; } },
];
const evidenceMutationResults = evidenceMutationCases.map(({ name, expectedIssues, mutate }) => {
  const copy = structuredClone(evidence);
  mutate(copy);
  const observedIssues = collectR10EvidenceIssues(copy);
  return recordNegativeTest("r10_evidence", name, equalArrays(observedIssues, expectedIssues));
});
assertInGroup("r10_onsite_evidence", "R10_evidence_slot_and_reference_mutation_matrix_fails_closed", evidenceMutationResults.length === 8 && evidenceMutationResults.every(Boolean), evidenceMutationResults);

const redactionProbe = summarizeDiagnostic({
  tenant_access_token: REDACTION_SENTINEL,
  webhook_url: `https://example.invalid/${REDACTION_SENTINEL}`,
  raw_input: { receipt_id: REDACTION_SENTINEL },
});
const redactionProbeText = JSON.stringify(redactionProbe);
const redactionSentinelRejected = !redactionProbeText.includes(REDACTION_SENTINEL)
  && !redactionProbeText.includes("https://example.invalid/")
  && !redactionProbeText.includes("tenant_access_token")
  && !redactionProbeText.includes("webhook_url")
  && !redactionProbeText.includes("raw_input")
  && !redactionProbeText.includes("receipt_id");
recordNegativeTest("redaction", "sensitive_sentinel", redactionSentinelRejected);
assertInGroup("report_fail_closed_redaction", "failure_diagnostics_redactor_never_echoes_values_or_sensitive_sentinel", redactionSentinelRejected, redactionProbe);

const denylistedKeyValueFixtures = [
  { value: "synthetic_safe_marker", forbidden: ["Tenant_Access_Token", "synthetic_safe_marker"] },
  { value: 424242424242, forbidden: ["Tenant_Access_Token", "424242424242"] },
  { value: { raw: "opaque_object_marker" }, forbidden: ["Tenant_Access_Token", "opaque_object_marker"] },
  { value: ["opaque_array_marker"], forbidden: ["Tenant_Access_Token", "opaque_array_marker"] },
  { value: null, forbidden: ["Tenant_Access_Token"] },
];
const denylistedKeyValueResults = denylistedKeyValueFixtures.map((fixture) => {
  const report = serializerTestReport();
  report.sources.fixture = { Tenant_Access_Token: fixture.value };
  return emissionIsFixedFatal(serializeReportForEmission(report), fixture.forbidden);
});
const denylistedKeyValuePassed = recordNegativeTest(
  "redaction",
  "sensitive_key_with_nonsecret_marker",
  denylistedKeyValueResults.length === 5 && denylistedKeyValueResults.every(Boolean),
);

const emitterSensitiveFixtures = [
  {
    name: "complete_URL",
    forbidden: "https://example.invalid/private",
    mutate: (report) => { report.sources.fixture = { location: "https://example.invalid/private" }; },
  },
  {
    name: "Bearer_authorization",
    forbidden: "Bearer AbCdEf0123456789.secret",
    mutate: (report) => { report.sources.fixture = { note: "Bearer AbCdEf0123456789.secret" }; },
  },
  {
    name: "Feishu_resource_ID",
    forbidden: "recA1B2C3D4E5F6G7H8",
    mutate: (report) => { report.sources.fixture = { resource: "recA1B2C3D4E5F6G7H8" }; },
  },
  {
    name: "ordinary_token_like_value",
    forbidden: "tok_live_A1B2C3D4E5F6G7H8",
    mutate: (report) => { report.sources.fixture = { note: "tok_live_A1B2C3D4E5F6G7H8" }; },
  },
];
const emitterSensitiveResults = [denylistedKeyValuePassed, ...emitterSensitiveFixtures.map((fixture) => {
  const report = serializerTestReport();
  fixture.mutate(report);
  return recordNegativeTest("redaction", fixture.name, emissionIsFixedFatal(
    serializeReportForEmission(report),
    [fixture.forbidden, fixture.forbiddenKey].filter(Boolean),
  ));
})];
const validEmitterReport = serializerTestReport();
const validEmitterEmission = serializeReportForEmission(validEmitterReport);
let validEmitterParsed = null;
try {
  validEmitterParsed = JSON.parse(validEmitterEmission.text);
} catch {
  validEmitterParsed = null;
}
const validEmitterPassed = validEmitterEmission.exitCode === 0
  && validEmitterEmission.text === JSON.stringify(validEmitterReport, null, 2)
  && canonicalJson(validEmitterParsed) === canonicalJson(validEmitterReport)
  && validEmitterParsed?.status === "passed"
  && validEmitterParsed?.fatal === null
  && !validEmitterEmission.text.includes(REDACTION_SENTINEL);
recordNegativeTest("redaction", "normal_report_emits_once_without_sentinel", validEmitterPassed);
const fatalEmitterEmission = serializeReportForEmission(fatalReport());
const nearFatal = fatalReport();
nearFatal.contract_attestation.validator_path = "fixture";
const nearFatalRejected = !emissionIsFixedFatal({ text: JSON.stringify(nearFatal, null, 2), exitCode: 1 });
const fatalEmitterSelfSafe = emissionIsFixedFatal(fatalEmitterEmission)
  && nearFatalRejected
  && !serializedContainsSensitiveEmission(fatalEmitterEmission.text);
recordNegativeTest("redaction", "fixed_fatal_is_schema_valid_and_scanner_safe", fatalEmitterSelfSafe);
assertInGroup("report_fail_closed_redaction", "production_serializer_rejects_sensitive_keys_for_all_value_types_URL_auth_Feishu_ID_and_token_values", emitterSensitiveResults.length === 5
  && emitterSensitiveResults.every(Boolean)
  && validEmitterPassed
  && fatalEmitterSelfSafe, emitterSensitiveResults);

const maliciousStatus = "malicious_status_fixture";
const maliciousMode = "malicious_mode_fixture";
const maliciousEnvelopeReport = serializerTestReport();
maliciousEnvelopeReport.contract_attestation.report_status = maliciousStatus;
maliciousEnvelopeReport.contract_attestation.report_mode = maliciousMode;
const maliciousEnvelopeRejected = emissionIsFixedFatal(serializeReportForEmission(maliciousEnvelopeReport), [maliciousStatus, maliciousMode]);
recordNegativeTest("report_schema", "malicious_baseline_status_and_mode", maliciousEnvelopeRejected);
const missingCoreReport = serializerTestReport();
delete missingCoreReport.protection_category_counts;
const missingCoreRejected = emissionIsFixedFatal(serializeReportForEmission(missingCoreReport));
recordNegativeTest("report_schema", "missing_core_key", missingCoreRejected);
const wrongSchemaReport = serializerTestReport();
wrongSchemaReport.report_schema_version = "neoloop.offline-validator-report.v0";
const wrongSchemaRejected = emissionIsFixedFatal(serializeReportForEmission(wrongSchemaReport));
recordNegativeTest("report_schema", "schema_version_drift", wrongSchemaRejected);
const nestedExactSchemaBaseline = serializerTestReport();
nestedExactSchemaBaseline.negative_test_matrix.categories = {
  fixture: { total: 0, passed: 0, failed: 0 },
};
const nestedExactSchemaMutationResults = [
  ["negative_matrix_extra_key", (copy) => { copy.negative_test_matrix.unexpected = null; }],
  ["negative_category_missing_key", (copy) => { delete copy.negative_test_matrix.categories.fixture.failed; }],
  ["negative_category_equal_cardinality_rename", (copy) => {
    copy.negative_test_matrix.categories.fixture.failEd = copy.negative_test_matrix.categories.fixture.failed;
    delete copy.negative_test_matrix.categories.fixture.failed;
  }],
  ["contract_expected_extra_key", (copy) => { copy.contract_attestation.expected.unexpected = null; }],
  ["contract_observed_missing_key", (copy) => { delete copy.contract_attestation.observed.process; }],
  ["contract_comparisons_equal_cardinality_rename", (copy) => {
    copy.contract_attestation.comparisons.transporT = copy.contract_attestation.comparisons.transport;
    delete copy.contract_attestation.comparisons.transport;
  }],
  ["sources_extra_key", (copy) => { copy.sources.unexpected = { path: "unexpected", sha256: null }; }],
  ["negative_name_digest_drift", (copy) => { copy.negative_test_matrix.observed_name_digest = "0".repeat(64); }],
].map(([name, mutate]) => {
  const copy = structuredClone(nestedExactSchemaBaseline);
  mutate(copy);
  return recordNegativeTest("report_schema", name, emissionIsFixedFatal(serializeReportForEmission(copy)));
});
assertInGroup("report_fail_closed_redaction", "report_schema_and_nested_exact_shape_mutations_return_fixed_fatal", validateReportConsistency(nestedExactSchemaBaseline)
  && maliciousEnvelopeRejected
  && missingCoreRejected
  && wrongSchemaRejected
  && nestedExactSchemaMutationResults.every(Boolean), {
  maliciousEnvelopeRejected,
  missingCoreRejected,
  wrongSchemaRejected,
  nestedExactSchemaMutationResults,
});

const trustedNestedSchemaBaseline = trustedNestedSerializerTestReport();
const trustedNestedExactLayers = [
  { id: "contract_expected_permission_root", keys: EXPECTED_PERMISSION_ATTESTATION_KEYS, get: (report) => report.contract_attestation.expected.permission_result_contract },
  { id: "contract_expected_permission_versions", keys: PERMISSION_RESULT_VERSIONS_KEYS, get: (report) => report.contract_attestation.expected.permission_result_contract.versions },
  { id: "contract_expected_permission_counts", keys: PERMISSION_RESULT_COUNTS_KEYS, get: (report) => report.contract_attestation.expected.permission_result_contract.counts },
  { id: "contract_expected_permission_fixture_entry", keys: PERMISSION_NEGATIVE_FIXTURE_ENTRY_KEYS, get: (report) => report.contract_attestation.expected.permission_result_contract.negative_fixtures[0] },
  { id: "contract_expected_permission_source_entry", keys: SOURCE_ENTRY_KEYS, get: (report) => report.contract_attestation.expected.permission_result_contract.sources[0] },
  { id: "contract_observed_permission_root", keys: EXPECTED_PERMISSION_ATTESTATION_KEYS, get: (report) => report.contract_attestation.observed.permission_result_contract },
  { id: "contract_observed_permission_versions", keys: PERMISSION_RESULT_VERSIONS_KEYS, get: (report) => report.contract_attestation.observed.permission_result_contract.versions },
  { id: "contract_observed_permission_counts", keys: PERMISSION_RESULT_COUNTS_KEYS, get: (report) => report.contract_attestation.observed.permission_result_contract.counts },
  { id: "contract_observed_permission_fixture_entry", keys: PERMISSION_NEGATIVE_FIXTURE_ENTRY_KEYS, get: (report) => report.contract_attestation.observed.permission_result_contract.negative_fixtures[0] },
  { id: "contract_observed_permission_source_entry", keys: SOURCE_ENTRY_KEYS, get: (report) => report.contract_attestation.observed.permission_result_contract.sources[0] },
  { id: "contract_observed_tradeoffs_root", keys: ["c12", "c13"], get: (report) => report.contract_attestation.observed.tradeoffs },
  { id: "contract_observed_tradeoffs_c12", keys: TRUSTED_OBSERVED_TRADEOFF_C12_KEYS, get: (report) => report.contract_attestation.observed.tradeoffs.c12 },
  { id: "contract_observed_tradeoffs_c13", keys: TRUSTED_OBSERVED_TRADEOFF_C13_KEYS, get: (report) => report.contract_attestation.observed.tradeoffs.c13 },
  { id: "contract_accepted_tradeoffs_c12", keys: ACCEPTED_TRADEOFF_C12_KEYS, get: (report) => report.contract_attestation.accepted_security_tradeoffs.c12 },
  { id: "contract_accepted_tradeoffs_c13", keys: ACCEPTED_TRADEOFF_C13_KEYS, get: (report) => report.contract_attestation.accepted_security_tradeoffs.c13 },
];
const trustedNestedExactMutationResults = trustedNestedExactLayers.flatMap((layer) => [
  ["missing_key", (target) => { delete target[layer.keys[0]]; }],
  ["extra_key", (target) => { target.unexpected = null; }],
  ["equal_cardinality_rename", (target) => { target[`${layer.keys[0]}_renamed`] = target[layer.keys[0]]; delete target[layer.keys[0]]; }],
].map(([variant, mutate]) => {
  const copy = structuredClone(trustedNestedSchemaBaseline);
  mutate(layer.get(copy));
  return recordNegativeTest("report_schema", `${layer.id}_${variant}`, emissionIsFixedFatal(serializeReportForEmission(copy)));
}));
assertInGroup("report_fail_closed_redaction", "trusted_contract_attestation_nested_layers_reject_missing_extra_and_equal_cardinality_rename_via_production_serializer", validateReportConsistency(trustedNestedSchemaBaseline)
  && trustedNestedExactMutationResults.length === 45
  && trustedNestedExactMutationResults.every(Boolean), trustedNestedExactMutationResults);

const negativeNameKeys = negativeTests.map((test) => `${test.category}:${test.name}`);
const expectedNegativeNameKeys = Object.entries(EXPECTED_NEGATIVE_TEST_NAMES_BY_CATEGORY)
  .flatMap(([category, names]) => names.map((name) => `${category}:${name}`));
const sortedNegativeNameKeys = [...negativeNameKeys].sort(codeUnitCompare);
const sortedExpectedNegativeNameKeys = [...expectedNegativeNameKeys].sort(codeUnitCompare);
const expectedNegativeNameDigest = canonicalSha256(sortedExpectedNegativeNameKeys);
const observedNegativeNameDigest = canonicalSha256(sortedNegativeNameKeys);
const negativeNameSetMatchesFrozenProfile = (keys) => {
  const sortedKeys = [...keys].sort(codeUnitCompare);
  return keys.length === expectedNegativeNameKeys.length
    && new Set(keys).size === keys.length
    && equalArrays(sortedKeys, sortedExpectedNegativeNameKeys)
    && canonicalSha256(sortedKeys) === EXPECTED_NEGATIVE_TEST_NAME_DIGEST;
};
const equalLengthReplacementNameKeys = [...negativeNameKeys];
equalLengthReplacementNameKeys[0] = "strict_JSON:duplicate_kex";
const negativeNameMutationControlsReject = !negativeNameSetMatchesFrozenProfile(negativeNameKeys.slice(1))
  && !negativeNameSetMatchesFrozenProfile([...negativeNameKeys, negativeNameKeys[0]])
  && !negativeNameSetMatchesFrozenProfile(equalLengthReplacementNameKeys);
const observedNegativeCounts = Object.fromEntries(Object.keys(EXPECTED_NEGATIVE_TEST_COUNTS).map((category) => [
  category,
  negativeTests.filter((test) => test.category === category).length,
]));
const negativeMatrixProfileExact = equalArrays([...new Set(negativeTests.map((test) => test.category))], Object.keys(EXPECTED_NEGATIVE_TEST_COUNTS))
  && equalArrays(Object.keys(EXPECTED_NEGATIVE_TEST_NAMES_BY_CATEGORY), Object.keys(EXPECTED_NEGATIVE_TEST_COUNTS))
  && Object.entries(EXPECTED_NEGATIVE_TEST_COUNTS).every(([category, count]) => EXPECTED_NEGATIVE_TEST_NAMES_BY_CATEGORY[category]?.length === count)
  && canonicalJson(observedNegativeCounts) === canonicalJson(EXPECTED_NEGATIVE_TEST_COUNTS)
  && negativeTests.length === Object.values(EXPECTED_NEGATIVE_TEST_COUNTS).reduce((count, value) => count + value, 0)
  && new Set(negativeNameKeys).size === negativeNameKeys.length
  && new Set(expectedNegativeNameKeys).size === expectedNegativeNameKeys.length
  && equalArrays(sortedNegativeNameKeys, sortedExpectedNegativeNameKeys)
  && expectedNegativeNameDigest === EXPECTED_NEGATIVE_TEST_NAME_DIGEST
  && observedNegativeNameDigest === EXPECTED_NEGATIVE_TEST_NAME_DIGEST
  && negativeNameSetMatchesFrozenProfile(negativeNameKeys)
  && negativeNameMutationControlsReject
  && negativeTests.every((test) => test.passed === true);
assertInGroup("report_fail_closed_redaction", "negative_test_categories_counts_names_and_results_match_frozen_profile", negativeMatrixProfileExact, {
  category_count: Object.keys(observedNegativeCounts).length,
  total: negativeTests.length,
  failed: negativeTests.filter((test) => !test.passed).length,
});

const prospectiveUniqueName = "offline_check_names_are_unique";
const existingNames = checks.map((check) => check.name);
assertInGroup("report_fail_closed_redaction", prospectiveUniqueName, new Set([...existingNames, prospectiveUniqueName]).size === existingNames.length + 1, existingNames);

const baselineValidatorShaComparison = baselineShaMatches
  && baselineAssessment.pre_spawn_sha256 === FROZEN_BASELINE_VALIDATOR_SHA256
  && snapshotB.baselineValidator.sha256 === FROZEN_BASELINE_VALIDATOR_SHA256;
const baselineTransportComparison = baselineAssessment.ok === true && baselineAssessment.invocation_count === 1;
const baselineEnvelopeComparison = baseline?.status === "passed"
  && baseline?.mode === "read_only"
  && baseline?.summary?.passed_checks === EXPECTED_BASELINE_ASSERTION_COUNT
  && baseline?.summary?.failed_checks === 0
  && baseline?.summary?.upstream_conflicts === 0
  && Array.isArray(baseline?.failed_checks) && baseline.failed_checks.length === 0
  && Array.isArray(baseline?.upstream_conflicts) && baseline.upstream_conflicts.length === 0
  && Array.isArray(baseline?.errors) && baseline.errors.length === 0;
const baselineGroupsComparison = equalArrays(Object.keys(baseline?.check_groups ?? {}), Object.keys(EXPECTED_BASELINE_GROUP_COUNTS))
  && Object.entries(EXPECTED_BASELINE_GROUP_COUNTS).every(([key, count]) => baseline?.check_groups?.[key]?.status === "passed"
    && baseline.check_groups[key].passed_checks === count
    && Array.isArray(baseline.check_groups[key].failed_checks)
    && baseline.check_groups[key].failed_checks.length === 0);
const baselineC13Comparison = baselineC13OracleValidation.issues.length === 0;
const baselineClosuresComparison = Object.entries(EXPECTED_LITERAL_CLOSURES).every(([key, expected]) => {
  const observed = baseline?.reference_graph?.literal_reference_closures?.[key];
  return observed?.count === expected.count
    && observed?.expected_count === expected.count
    && observed?.digest === expected.digest
    && observed?.expected_digest === expected.digest
    && observed?.exact === true;
}) && Array.isArray(baseline?.reference_graph?.literal_reference_closures?.invalid_references)
  && baseline.reference_graph.literal_reference_closures.invalid_references.length === 0;
const baselineC12TradeoffComparison = !baselineTradeoffValidation.issues.includes("C12_tradeoff_exact_sets");
const baselineC13TradeoffComparison = !baselineTradeoffValidation.issues.includes("C13_tradeoff_exact_sets");
const baselineVersionsComparison = baseline?.versions?.logical_manifest_version === "0.1.6"
  && baseline?.versions?.build_package_version === "0.1.5"
  && logical.manifest_version === "0.1.6"
  && build.package_version === "0.1.5"
  && build.source_of_truth?.manifest_version === "0.1.6";
const baselineSourcesComparison = baselineSourceIssues.length === 0 && snapshotsEqual(snapshotA, snapshotB);
const baselinePermissionContractComparison = baselinePermissionContractIssues.length === 0;
const observedPermissionContentFreezeB = permissionContentFreezeFromSnapshot(snapshotB);
const permissionContentFreezeComparison = canonicalJson(observedPermissionContentFreezeA) === canonicalJson(expectedPermissionContentFreeze)
  && canonicalJson(observedPermissionContentFreezeB) === canonicalJson(expectedPermissionContentFreeze)
  && canonicalSha256(observedPermissionContentFreezeA) === permissionContentFreezeDigest
  && canonicalSha256(observedPermissionContentFreezeB) === permissionContentFreezeDigest;
const attestationComparisons = {
  validator_sha: baselineValidatorShaComparison,
  transport: baselineTransportComparison,
  envelope: baselineEnvelopeComparison,
  groups: baselineGroupsComparison,
  c13_fixture_profile: baselineC13Comparison,
  closures: baselineClosuresComparison,
  c12_tradeoff: baselineC12TradeoffComparison,
  c13_tradeoff: baselineC13TradeoffComparison,
  versions: baselineVersionsComparison,
  sources: baselineSourcesComparison,
  permission_result_contract: baselinePermissionContractComparison,
  permission_content_freeze: permissionContentFreezeComparison,
  all: false,
};
attestationComparisons.all = Object.entries(attestationComparisons).every(([key, value]) => key === "all" || value === true);
const baselineTrusted = attestationComparisons.all && baselineProfileIssues.length === 0;
const baselinePassedChecks = baselineTrusted ? EXPECTED_BASELINE_ASSERTION_COUNT : 0;
const offlinePassedChecks = checks.filter((check) => check.ok).length;
const offlineFailedChecks = checks.length - offlinePassedChecks;
const checkGroups = Object.fromEntries(CHECK_GROUP_ORDER.map((group) => {
  const groupChecks = checks.filter((check) => check.group === group);
  const failed = groupChecks.filter((check) => !check.ok).map((check) => check.name);
  return [group, {
    status: failed.length === 0 ? "passed" : "failed",
    passed_checks: groupChecks.length - failed.length,
    failed_checks: failed,
  }];
}));
const negativeTestsByCategory = Object.fromEntries([...new Set(negativeTests.map((test) => test.category))].map((category) => {
  const categoryTests = negativeTests.filter((test) => test.category === category);
  return [category, {
    total: categoryTests.length,
    passed: categoryTests.filter((test) => test.passed).length,
    failed: categoryTests.filter((test) => !test.passed).length,
  }];
}));

const compactObservedClosures = baselineClosuresComparison
  ? Object.fromEntries(Object.keys(EXPECTED_LITERAL_CLOSURES).map((key) => [key, {
    count: baseline.reference_graph.literal_reference_closures[key].count,
    digest: baseline.reference_graph.literal_reference_closures[key].digest,
  }]))
  : {};
const compactObservedC13Groups = baselineC13Comparison
  ? Object.fromEntries(Object.keys(EXPECTED_C13_GROUP_LENGTHS).map((key) => [key, {
    count: baselineC13OracleValidation.observed.group_counts[key],
    digest: baselineC13OracleValidation.observed.group_digests[key],
  }]))
  : {};
const trustedTradeoffSummary = baselineC12TradeoffComparison && baselineC13TradeoffComparison ? {
  c12: {
    ...baselineTradeoffValidation.observed.c12,
    reported_disjoint: baseline.c12_accepted_security_tradeoff.sets_are_exact_and_disjoint,
  },
  c13: {
    ...baselineTradeoffValidation.observed.c13,
    reported_disjoint: baseline.c13_accepted_security_tradeoff.ordinary_and_terminal_sets_are_disjoint,
  },
} : untrustedObservedAttestation().tradeoffs;
const observedAttestation = untrustedObservedAttestation();
observedAttestation.validator_sha256_pre = /^[0-9a-f]{64}$/.test(snapshotA.baselineValidator.sha256) ? snapshotA.baselineValidator.sha256 : null;
observedAttestation.validator_sha256_pre_spawn = /^[0-9a-f]{64}$/.test(baselineAssessment.pre_spawn_sha256 ?? "") ? baselineAssessment.pre_spawn_sha256 : null;
observedAttestation.validator_sha256_post = /^[0-9a-f]{64}$/.test(snapshotB.baselineValidator.sha256) ? snapshotB.baselineValidator.sha256 : null;
observedAttestation.process = {
  status: baselineTransportComparison ? "passed" : "untrusted",
  invocation_count: Number.isInteger(baselineAssessment.invocation_count) ? baselineAssessment.invocation_count : 0,
};
if (baselineTrusted) {
  observedAttestation.report_envelope = {
    status: baseline.status,
    mode: baseline.mode,
    passed_checks: baseline.summary.passed_checks,
    failed_checks: baseline.summary.failed_checks,
    upstream_conflicts: baseline.summary.upstream_conflicts,
    check_group_count: Object.keys(baseline.check_groups).length,
  };
  observedAttestation.check_group_counts = Object.fromEntries(Object.entries(baseline.check_groups).map(([key, group]) => [key, group.passed_checks]));
  observedAttestation.c13 = {
    groups: compactObservedC13Groups,
    profile_digest: baselineC13OracleValidation.observed.profile_digest,
  };
  observedAttestation.literal_reference_closures = compactObservedClosures;
  observedAttestation.tradeoffs = trustedTradeoffSummary;
  observedAttestation.versions = {
    logical_manifest: baseline.versions.logical_manifest_version,
    build_package: baseline.versions.build_package_version,
    pinned_logical_manifest: build.source_of_truth.manifest_version,
  };
  observedAttestation.permission_result_contract = baseline.permission_result_contract;
  observedAttestation.permission_content_freeze = {
    source_count: observedPermissionContentFreezeA.length,
    source_digest: canonicalSha256(observedPermissionContentFreezeA),
    sources: observedPermissionContentFreezeA,
  };
  observedAttestation.selected_sources = baseline.sources
    .filter((source) => ["logical_manifest", "build_package", "evidence_template", "permission_matrix", "typescript_canonical_contract"].includes(source.id))
    .map((source) => ({ id: source.id, path: source.path, sha256: source.sha256 }));
}

const attestedVersions = baselineVersionsComparison ? {
  logical_manifest: "0.1.6",
  build_package: "0.1.5",
  pinned_logical_manifest: "0.1.6",
} : { logical_manifest: "untrusted", build_package: "untrusted", pinned_logical_manifest: "untrusted" };
const attestedTradeoffs = baselineC12TradeoffComparison && baselineC13TradeoffComparison ? {
  c12: {
    status: baselineTradeoffValidation.observed.c12.status,
    policy_scope: baselineTradeoffValidation.observed.c12.policy_scope,
    invalid_value_count: baselineTradeoffValidation.observed.c12.invalid_value_count,
    ordinary_value_count: baselineTradeoffValidation.observed.c12.ordinary_value_count,
    digest: baselineTradeoffValidation.observed.c12.digest,
    exact_and_disjoint_recomputed: baselineTradeoffValidation.observed.c12.exact_and_disjoint_recomputed,
  },
  c13: {
    status: baselineTradeoffValidation.observed.c13.status,
    policy_scope: baselineTradeoffValidation.observed.c13.policy_scope,
    reason_precedence_count: baselineTradeoffValidation.observed.c13.reason_precedence_count,
    ordinary_value_count: baselineTradeoffValidation.observed.c13.ordinary_value_count,
    terminal_negative_value_count: baselineTradeoffValidation.observed.c13.terminal_negative_value_count,
    digest: baselineTradeoffValidation.observed.c13.digest,
    ordinary_and_terminal_disjoint_recomputed: baselineTradeoffValidation.observed.c13.ordinary_and_terminal_disjoint_recomputed,
  },
} : fatalReport().contract_attestation.accepted_security_tradeoffs;

return {
  report_schema_version: REPORT_SCHEMA_VERSION,
  status: errors.length === 0 ? "passed" : "failed",
  mode: "read_only",
  fatal: null,
  contract_attestation: {
    status: baselineTrusted ? "trusted" : "untrusted",
    execution_byte_binding_scope: BASELINE_EXECUTION_BYTE_BINDING_SCOPE,
    residual_risk: BASELINE_EXECUTION_RESIDUAL_RISK,
    validator_path: snapshotA.baselineValidator.path,
    validator_sha256: snapshotA.baselineValidator.sha256,
    timeout_ms: BASELINE_TIMEOUT_MS,
    max_buffer_bytes: BASELINE_MAX_BUFFER,
    report_status: baselineTrusted ? baseline.status : "untrusted",
    report_mode: baselineTrusted ? baseline.mode : "untrusted",
    passed_checks: baselinePassedChecks,
    failed_checks: baselineTrusted ? 0 : 1,
    upstream_conflicts: baselineTrusted ? 0 : 1,
    check_group_count: baselineTrusted ? Object.keys(baseline.check_groups).length : 0,
    check_group_counts: baselineTrusted ? observedAttestation.check_group_counts : {},
    c13_fixture_group_counts: baselineC13Comparison ? baselineC13OracleValidation.observed.group_counts : {},
    c13_fixture_total: baselineC13Comparison ? Object.values(baselineC13OracleValidation.observed.group_counts).reduce((count, value) => count + value, 0) : 0,
    literal_reference_closures: compactObservedClosures,
    accepted_security_tradeoffs: attestedTradeoffs,
    versions: attestedVersions,
    selected_source_attestations: baselineTrusted ? observedAttestation.selected_sources.length : 0,
    expected: expectedContractAttestation(),
    observed: observedAttestation,
    comparisons: attestationComparisons,
  },
  sources: publicSnapshotSources(snapshotA),
  summary: {
    baseline_passed_checks: baselinePassedChecks,
    offline_passed_checks: offlinePassedChecks,
    total_passed_checks: baselinePassedChecks + offlinePassedChecks,
    failed_checks: offlineFailedChecks,
    offline_total_checks: checks.length,
    offline_failed_checks: offlineFailedChecks,
    effective_fields: totalEffectiveFields,
    relations: logicalRelationRefs.length,
    runbook_step_rows: buildStepRows.length,
  },
  check_groups: checkGroups,
  negative_test_matrix: {
    total: negativeTests.length,
    passed: negativeTests.filter((test) => test.passed).length,
    failed: negativeTests.filter((test) => !test.passed).length,
    categories: negativeTestsByCategory,
    expected_name_digest: EXPECTED_NEGATIVE_TEST_NAME_DIGEST,
    observed_name_digest: observedNegativeNameDigest,
  },
  onsite_status: {
    required_evidence_units: 41,
    required_evidence_units_untested: evidenceUnits.filter((unit) => unit.status === "未测试").length,
    logical_role_platform_mappings_untested: build.logical_roles.filter((role) => role.permission_mapping_status === "未测试").length,
    P01_to_P13: "全部未测试",
    R10_verification_status: "not_tested",
    R10_execution_mode: "insufficient",
    R10_automatic_projection_enabled: false,
    real_feishu_operations_performed_by_validator: 0,
    lark_cli_login_operations_performed_by_validator: 0,
    openapi_calls_performed_by_validator: 0,
    base_write_attempts_performed_by_validator: 0,
  },
  protection_category_counts: protectionCategoryCounts,
  errors,
};
}

function countDigestMapHasExactShape(value, expectedKeys, { allowEmpty = false } = {}) {
  if (allowEmpty && exactOwnKeys(value, [])) return true;
  return exactOwnKeys(value, expectedKeys)
    && expectedKeys.every((key) => exactOwnKeys(value[key], COUNT_DIGEST_KEYS));
}

function permissionResultContractHasExactNestedShape(value) {
  return exactOwnKeys(value, EXPECTED_PERMISSION_ATTESTATION_KEYS)
    && exactOwnKeys(value.versions, PERMISSION_RESULT_VERSIONS_KEYS)
    && exactOwnKeys(value.counts, PERMISSION_RESULT_COUNTS_KEYS)
    && Array.isArray(value.negative_fixtures)
    && value.negative_fixtures.every((fixture) => exactOwnKeys(fixture, PERMISSION_NEGATIVE_FIXTURE_ENTRY_KEYS))
    && Array.isArray(value.sources)
    && value.sources.every((source) => exactOwnKeys(source, SOURCE_ENTRY_KEYS));
}

function observedTradeoffsHaveExactShape(tradeoffs, trusted) {
  return exactOwnKeys(tradeoffs, ["c12", "c13"])
    && exactOwnKeys(tradeoffs.c12, trusted ? TRUSTED_OBSERVED_TRADEOFF_C12_KEYS : UNTRUSTED_OBSERVED_TRADEOFF_C12_KEYS)
    && exactOwnKeys(tradeoffs.c13, trusted ? TRUSTED_OBSERVED_TRADEOFF_C13_KEYS : UNTRUSTED_OBSERVED_TRADEOFF_C13_KEYS);
}

function acceptedTradeoffsHaveExactShape(tradeoffs) {
  return exactOwnKeys(tradeoffs, ["c12", "c13"])
    && exactOwnKeys(tradeoffs.c12, ACCEPTED_TRADEOFF_C12_KEYS)
    && exactOwnKeys(tradeoffs.c13, ACCEPTED_TRADEOFF_C13_KEYS);
}

function contractAttestationNestedHasExactShape(attestation) {
  const expected = attestation?.expected;
  const observed = attestation?.observed;
  const comparisons = attestation?.comparisons;
  if (!exactOwnKeys(expected, CONTRACT_ATTESTATION_EXPECTED_KEYS)
    || !exactOwnKeys(observed, CONTRACT_ATTESTATION_OBSERVED_KEYS)
    || !exactOwnKeys(comparisons, CONTRACT_ATTESTATION_COMPARISON_KEYS)
    || !exactOwnKeys(expected.report_envelope, REPORT_ENVELOPE_KEYS)
    || !exactOwnKeys(observed.report_envelope, REPORT_ENVELOPE_KEYS)
    || !exactOwnKeys(observed.process, ["status", "invocation_count"])
    || !exactOwnKeys(expected.c13, C13_ATTESTATION_KEYS)
    || !exactOwnKeys(observed.c13, C13_ATTESTATION_KEYS)
    || !exactOwnKeys(expected.versions, ["logical_manifest", "build_package", "pinned_logical_manifest"])
    || !exactOwnKeys(observed.versions, ["logical_manifest", "build_package", "pinned_logical_manifest"])
    || !exactOwnKeys(expected.permission_content_freeze, PERMISSION_CONTENT_FREEZE_KEYS)
    || !exactOwnKeys(observed.permission_content_freeze, PERMISSION_CONTENT_FREEZE_KEYS)
    || !Array.isArray(expected.permission_content_freeze.sources)
    || !expected.permission_content_freeze.sources.every((source) => exactOwnKeys(source, SOURCE_ENTRY_KEYS))
    || !Array.isArray(observed.permission_content_freeze.sources)
    || !observed.permission_content_freeze.sources.every((source) => exactOwnKeys(source, SOURCE_ENTRY_KEYS))
    || !Array.isArray(observed.selected_sources)
    || !observed.selected_sources.every((source) => exactOwnKeys(source, SOURCE_ENTRY_KEYS))
    || !permissionResultContractHasExactNestedShape(expected.permission_result_contract)
    || canonicalJson(expected.permission_result_contract) !== canonicalJson(expectedObservedPermissionResultContract())) return false;
  const trusted = attestation.status === "trusted";
  if (!observedTradeoffsHaveExactShape(observed.tradeoffs, trusted)
    || !acceptedTradeoffsHaveExactShape(attestation.accepted_security_tradeoffs)) return false;
  if (!(exactOwnKeys(expected.check_group_counts, Object.keys(EXPECTED_BASELINE_GROUP_COUNTS))
    && countDigestMapHasExactShape(expected.c13.groups, Object.keys(EXPECTED_C13_GROUP_LENGTHS))
    && countDigestMapHasExactShape(expected.literal_reference_closures, Object.keys(EXPECTED_LITERAL_CLOSURES)))) return false;
  if (trusted) {
    if (!exactOwnKeys(observed.check_group_counts, Object.keys(EXPECTED_BASELINE_GROUP_COUNTS))
      || !countDigestMapHasExactShape(observed.c13.groups, Object.keys(EXPECTED_C13_GROUP_LENGTHS))
      || !countDigestMapHasExactShape(observed.literal_reference_closures, Object.keys(EXPECTED_LITERAL_CLOSURES))
      || !permissionResultContractHasExactNestedShape(observed.permission_result_contract)
      || canonicalJson(observed.permission_result_contract) !== canonicalJson(expectedObservedPermissionResultContract())) return false;
  } else if (!exactOwnKeys(observed.check_group_counts, [])
    || !countDigestMapHasExactShape(observed.c13.groups, [], { allowEmpty: true })
    || !countDigestMapHasExactShape(observed.literal_reference_closures, [], { allowEmpty: true })
    || observed.permission_result_contract !== null) return false;
  return exactOwnKeys(attestation.check_group_counts, trusted ? Object.keys(EXPECTED_BASELINE_GROUP_COUNTS) : [])
    && exactOwnKeys(attestation.c13_fixture_group_counts, trusted ? Object.keys(EXPECTED_C13_GROUP_LENGTHS) : [])
    && countDigestMapHasExactShape(attestation.literal_reference_closures, trusted ? Object.keys(EXPECTED_LITERAL_CLOSURES) : [], { allowEmpty: !trusted })
    && exactOwnKeys(attestation.versions, ["logical_manifest", "build_package", "pinned_logical_manifest"]);
}

function validateReportConsistency(report) {
  if (!report || typeof report !== "object" || Array.isArray(report)) return false;
  if (!exactOwnKeys(report, REPORT_CORE_KEYS)
    || report.report_schema_version !== REPORT_SCHEMA_VERSION
    || !exactOwnKeys(report.contract_attestation, CONTRACT_ATTESTATION_KEYS)
    || !exactOwnKeys(report.summary, REPORT_SUMMARY_KEYS)
    || !exactOwnKeys(report.onsite_status, REPORT_ONSITE_STATUS_KEYS)
    || !exactOwnKeys(report.protection_category_counts, REPORT_PROTECTION_CATEGORY_KEYS)
    || !exactOwnKeys(report.sources, REPORT_SOURCE_KEYS)
    || !Object.values(report.sources).every((source) => exactOwnKeys(source, PUBLIC_SOURCE_ENTRY_KEYS))
    || !Array.isArray(report.errors)
    || !report.check_groups || Array.isArray(report.check_groups) || typeof report.check_groups !== "object"
    || !exactOwnKeys(report.negative_test_matrix, REPORT_NEGATIVE_TEST_MATRIX_KEYS)
    || !contractAttestationNestedHasExactShape(report.contract_attestation)) return false;
  const groups = Object.values(report.check_groups ?? {});
  if (groups.length === 0 || groups.some((group) => !exactOwnKeys(group, ["status", "passed_checks", "failed_checks"])
    || !Number.isInteger(group.passed_checks)
    || group.passed_checks < 0
    || !Array.isArray(group.failed_checks))) return false;
  const groupPassed = groups.reduce((count, group) => count + (group.passed_checks ?? 0), 0);
  const groupFailedNames = groups.flatMap((group) => Array.isArray(group.failed_checks) ? group.failed_checks : []);
  const errorNames = (report.errors ?? []).map((error) => error.name);
  const categoryMap = report.negative_test_matrix.categories ?? {};
  const categories = Object.values(categoryMap);
  if (!categories.every((category) => exactOwnKeys(category, REPORT_NEGATIVE_CATEGORY_KEYS))) return false;
  const categoryTotal = categories.reduce((count, category) => count + (category.total ?? 0), 0);
  const categoryPassed = categories.reduce((count, category) => count + (category.passed ?? 0), 0);
  const categoryFailed = categories.reduce((count, category) => count + (category.failed ?? 0), 0);
  const isProductionProfile = exactOwnKeys(report.check_groups, CHECK_GROUP_ORDER);
  const productionNegativeProfileValid = !isProductionProfile
    || (exactOwnKeys(report.negative_test_matrix.categories, Object.keys(EXPECTED_NEGATIVE_TEST_COUNTS))
      && Object.entries(EXPECTED_NEGATIVE_TEST_COUNTS).every(([category, expectedCount]) => {
        const observed = report.negative_test_matrix.categories[category];
        return observed?.total === expectedCount && observed?.passed === expectedCount && observed?.failed === 0;
      }));
  const fatalShapeValid = report.fatal === null
    || (report.status === "failed"
      && exactOwnKeys(report.fatal, ["code"])
      && report.fatal.code === "offline_validator_fatal");
  const negativeNameDigestShapeValid = report.fatal === null
    ? report.negative_test_matrix.expected_name_digest === EXPECTED_NEGATIVE_TEST_NAME_DIGEST
      && report.negative_test_matrix.observed_name_digest === EXPECTED_NEGATIVE_TEST_NAME_DIGEST
    : report.negative_test_matrix.expected_name_digest === null
      && report.negative_test_matrix.observed_name_digest === null;
  return report.mode === "read_only"
    && ["passed", "failed"].includes(report.status)
    && fatalShapeValid
    && report.status === (report.errors.length === 0 ? "passed" : "failed")
    && groups.every((group) => group.status === (group.failed_checks.length === 0 ? "passed" : "failed"))
    && groupFailedNames.every((name) => typeof name === "string")
    && new Set(groupFailedNames).size === groupFailedNames.length
    && groupPassed === report.summary.offline_passed_checks
    && groupPassed + groupFailedNames.length === report.summary.offline_total_checks
    && groupFailedNames.length === report.summary.offline_failed_checks
    && groupFailedNames.length === report.summary.failed_checks
    && errorNames.length === groupFailedNames.length
    && equalSets(errorNames, groupFailedNames)
    && report.errors.every((error) => report.check_groups?.[error.group]?.failed_checks?.includes(error.name))
    && report.summary.total_passed_checks === report.summary.baseline_passed_checks + report.summary.offline_passed_checks
    && report.negative_test_matrix.total === report.negative_test_matrix.passed + report.negative_test_matrix.failed
    && report.negative_test_matrix.total === categoryTotal
    && report.negative_test_matrix.passed === categoryPassed
    && report.negative_test_matrix.failed === categoryFailed
    && negativeNameDigestShapeValid
    && productionNegativeProfileValid
    && categories.every((category) => Number.isInteger(category.total)
      && Number.isInteger(category.passed)
      && Number.isInteger(category.failed)
      && category.total >= 0
      && category.passed >= 0
      && category.failed >= 0
      && category.total === category.passed + category.failed)
    && (report.status !== "passed" || report.negative_test_matrix.failed === 0)
    && ["trusted", "untrusted"].includes(report.contract_attestation.status)
    && ["passed", "untrusted"].includes(report.contract_attestation.report_status)
    && ["read_only", "untrusted"].includes(report.contract_attestation.report_mode);
}

function expectedContractAttestation() {
  return {
    validator_sha256: FROZEN_BASELINE_VALIDATOR_SHA256,
    report_envelope: {
      status: "passed",
      mode: "read_only",
      passed_checks: EXPECTED_BASELINE_ASSERTION_COUNT,
      failed_checks: 0,
      upstream_conflicts: 0,
      check_group_count: Object.keys(EXPECTED_BASELINE_GROUP_COUNTS).length,
    },
    check_group_counts: EXPECTED_BASELINE_GROUP_COUNTS,
    c13: {
      groups: Object.fromEntries(Object.keys(EXPECTED_C13_GROUP_LENGTHS).map((key) => [key, {
        count: EXPECTED_C13_GROUP_LENGTHS[key],
        digest: EXPECTED_C13_GROUP_DIGESTS[key],
      }])),
      profile_digest: EXPECTED_C13_PROFILE_DIGEST,
    },
    literal_reference_closures: EXPECTED_LITERAL_CLOSURES,
    c12_tradeoff_digest: EXPECTED_C12_TRADEOFF_DIGEST,
    c13_tradeoff_digest: EXPECTED_C13_TRADEOFF_DIGEST,
    versions: {
      logical_manifest: "0.1.6",
      build_package: "0.1.5",
      pinned_logical_manifest: "0.1.6",
    },
    selected_source_attestations: 5,
    permission_result_contract: expectedObservedPermissionResultContract(),
    permission_content_freeze: {
      source_count: EXPECTED_PERMISSION_CONTENT_FREEZE.length,
      source_digest: EXPECTED_PERMISSION_CONTENT_FREEZE_DIGEST,
      sources: expectedPermissionContentFreezeRows(),
    },
  };
}

function untrustedObservedAttestation() {
  return {
    validator_sha256_pre: null,
    validator_sha256_pre_spawn: null,
    validator_sha256_post: null,
    process: { status: "untrusted", invocation_count: 0 },
    report_envelope: {
      status: "untrusted",
      mode: "untrusted",
      passed_checks: null,
      failed_checks: null,
      upstream_conflicts: null,
      check_group_count: null,
    },
    check_group_counts: {},
    c13: { groups: {}, profile_digest: "untrusted" },
    literal_reference_closures: {},
    tradeoffs: {
      c12: { status: "untrusted", policy_scope: "untrusted", invalid_value_count: 0, ordinary_value_count: 0, digest: "untrusted", computed_disjoint: false, reported_disjoint: false },
      c13: { status: "untrusted", policy_scope: "untrusted", reason_precedence_count: 0, ordinary_value_count: 0, terminal_negative_value_count: 0, digest: "untrusted", computed_disjoint: false, reported_disjoint: false },
    },
    versions: { logical_manifest: "untrusted", build_package: "untrusted", pinned_logical_manifest: "untrusted" },
    permission_result_contract: null,
    permission_content_freeze: { source_count: 0, source_digest: "untrusted", sources: [] },
    selected_sources: [],
  };
}

function falseAttestationComparisons() {
  return {
    validator_sha: false,
    transport: false,
    envelope: false,
    groups: false,
    c13_fixture_profile: false,
    closures: false,
    c12_tradeoff: false,
    c13_tradeoff: false,
    versions: false,
    sources: false,
    permission_result_contract: false,
    permission_content_freeze: false,
    all: false,
  };
}

function fatalReport() {
  return {
    report_schema_version: REPORT_SCHEMA_VERSION,
    status: "failed",
    mode: "read_only",
    fatal: { code: "offline_validator_fatal" },
    contract_attestation: {
      status: "untrusted",
      execution_byte_binding_scope: BASELINE_EXECUTION_BYTE_BINDING_SCOPE,
      residual_risk: BASELINE_EXECUTION_RESIDUAL_RISK,
      validator_path: "feishu/scripts/validate-contract-alignment.mjs",
      validator_sha256: FROZEN_BASELINE_VALIDATOR_SHA256,
      timeout_ms: BASELINE_TIMEOUT_MS,
      max_buffer_bytes: BASELINE_MAX_BUFFER,
      report_status: "untrusted",
      report_mode: "untrusted",
      passed_checks: 0,
      failed_checks: 1,
      upstream_conflicts: 1,
      check_group_count: 0,
      check_group_counts: {},
      c13_fixture_group_counts: {},
      c13_fixture_total: 0,
      literal_reference_closures: {},
      accepted_security_tradeoffs: {
        c12: { status: "untrusted", policy_scope: "untrusted", invalid_value_count: 0, ordinary_value_count: 0, digest: "untrusted", exact_and_disjoint_recomputed: false },
        c13: { status: "untrusted", policy_scope: "untrusted", reason_precedence_count: 0, ordinary_value_count: 0, terminal_negative_value_count: 0, digest: "untrusted", ordinary_and_terminal_disjoint_recomputed: false },
      },
      versions: { logical_manifest: "untrusted", build_package: "untrusted", pinned_logical_manifest: "untrusted" },
      selected_source_attestations: 0,
      expected: expectedContractAttestation(),
      observed: untrustedObservedAttestation(),
      comparisons: falseAttestationComparisons(),
    },
    sources: Object.fromEntries(REPORT_SOURCE_KEYS.map((key) => [key, {
      path: path.relative(repositoryRoot, paths[key]),
      sha256: null,
    }])),
    summary: {
      baseline_passed_checks: 0,
      offline_passed_checks: 0,
      total_passed_checks: 0,
      failed_checks: 1,
      offline_total_checks: 1,
      offline_failed_checks: 1,
      effective_fields: 0,
      relations: 0,
      runbook_step_rows: 0,
    },
    check_groups: {
      fatal: {
        status: "failed",
        passed_checks: 0,
        failed_checks: ["offline_validator_fatal"],
      },
    },
    negative_test_matrix: {
      total: 0,
      passed: 0,
      failed: 0,
      categories: {},
      expected_name_digest: null,
      observed_name_digest: null,
    },
    onsite_status: {
      required_evidence_units: 0,
      required_evidence_units_untested: 0,
      logical_role_platform_mappings_untested: 0,
      P01_to_P13: "untrusted",
      R10_verification_status: "not_tested",
      R10_execution_mode: "insufficient",
      R10_automatic_projection_enabled: false,
      real_feishu_operations_performed_by_validator: 0,
      lark_cli_login_operations_performed_by_validator: 0,
      openapi_calls_performed_by_validator: 0,
      base_write_attempts_performed_by_validator: 0,
    },
    protection_category_counts: Object.fromEntries(REPORT_PROTECTION_CATEGORY_KEYS.map((key) => [key, 0])),
    errors: [{
      name: "offline_validator_fatal",
      group: "fatal",
      details: { type: "fixed_code", code: "offline_validator_fatal" },
    }],
  };
}

function serializerTestReport() {
  const report = structuredClone(fatalReport());
  report.status = "passed";
  report.fatal = null;
  report.contract_attestation.status = "untrusted";
  report.contract_attestation.report_status = "passed";
  report.contract_attestation.report_mode = "read_only";
  report.contract_attestation.passed_checks = 0;
  report.contract_attestation.failed_checks = 0;
  report.contract_attestation.upstream_conflicts = 0;
  report.contract_attestation.comparisons = Object.fromEntries(Object.keys(report.contract_attestation.comparisons).map((key) => [key, true]));
  report.summary = {
    baseline_passed_checks: 0,
    offline_passed_checks: 1,
    total_passed_checks: 1,
    failed_checks: 0,
    offline_total_checks: 1,
    offline_failed_checks: 0,
    effective_fields: 0,
    relations: 0,
    runbook_step_rows: 0,
  };
  report.check_groups = {
    serializer_fixture: { status: "passed", passed_checks: 1, failed_checks: [] },
  };
  report.negative_test_matrix = {
    total: 0,
    passed: 0,
    failed: 0,
    categories: {},
    expected_name_digest: EXPECTED_NEGATIVE_TEST_NAME_DIGEST,
    observed_name_digest: EXPECTED_NEGATIVE_TEST_NAME_DIGEST,
  };
  report.errors = [];
  return report;
}

function trustedNestedSerializerTestReport() {
  const report = serializerTestReport();
  const observed = untrustedObservedAttestation();
  observed.check_group_counts = structuredClone(EXPECTED_BASELINE_GROUP_COUNTS);
  observed.c13 = {
    groups: Object.fromEntries(Object.keys(EXPECTED_C13_GROUP_LENGTHS).map((key) => [key, { count: 0, digest: "fixture" }])),
    profile_digest: "fixture",
  };
  observed.literal_reference_closures = Object.fromEntries(Object.keys(EXPECTED_LITERAL_CLOSURES).map((key) => [key, { count: 0, digest: "fixture" }]));
  observed.tradeoffs = {
    c12: {
      status: "accepted", policy_scope: "fixture", invalid_value_count: 0, ordinary_value_count: 0,
      digest: "fixture", exact_and_disjoint_recomputed: true, reported_disjoint: true,
    },
    c13: {
      status: "accepted", policy_scope: "fixture", reason_precedence_count: 0, ordinary_value_count: 0,
      terminal_negative_value_count: 0, digest: "fixture", ordinary_and_terminal_disjoint_recomputed: true, reported_disjoint: true,
    },
  };
  observed.permission_result_contract = expectedObservedPermissionResultContract();
  observed.permission_content_freeze = {
    source_count: EXPECTED_PERMISSION_CONTENT_FREEZE.length,
    source_digest: EXPECTED_PERMISSION_CONTENT_FREEZE_DIGEST,
    sources: expectedPermissionContentFreezeRows(),
  };
  observed.selected_sources = expectedPermissionContentFreezeRows().slice(0, 5);
  report.contract_attestation.status = "trusted";
  report.contract_attestation.check_group_counts = structuredClone(EXPECTED_BASELINE_GROUP_COUNTS);
  report.contract_attestation.c13_fixture_group_counts = Object.fromEntries(Object.keys(EXPECTED_C13_GROUP_LENGTHS).map((key) => [key, 0]));
  report.contract_attestation.literal_reference_closures = Object.fromEntries(Object.keys(EXPECTED_LITERAL_CLOSURES).map((key) => [key, { count: 0, digest: "fixture" }]));
  report.contract_attestation.versions = { logical_manifest: "0.1.6", build_package: "0.1.5", pinned_logical_manifest: "0.1.6" };
  report.contract_attestation.expected = expectedContractAttestation();
  report.contract_attestation.observed = observed;
  return report;
}

function emissionIsFixedFatal(emission, forbiddenValues = []) {
  const expectedFatal = fatalReport();
  const expectedText = JSON.stringify(expectedFatal, null, 2);
  try {
    const parsed = JSON.parse(emission.text);
    return emission.exitCode === 1
      && emission.text === expectedText
      && canonicalJson(parsed) === canonicalJson(expectedFatal)
      && parsed?.fatal?.code === "offline_validator_fatal"
      && exactOwnKeys(parsed, REPORT_CORE_KEYS)
      && forbiddenValues.every((value) => !emission.text.includes(value));
  } catch {
    return false;
  }
}

function emissionValueIsSensitive(value) {
  if (typeof value !== "string") return false;
  return value.includes(REDACTION_SENTINEL)
    || /https?:\/\//i.test(value)
    || /\bBearer\s+[A-Za-z0-9._~+/=-]+/i.test(value)
    || /\b(?:bascn|tbl|vew|rec|fld|doccn|shtcn|wikcn|boxcn)(?=[A-Za-z0-9_-]{6,}\b)(?=[A-Za-z0-9_-]*\d)[A-Za-z0-9_-]+\b/i.test(value)
    || /\b(?:ou_|oc_|om_|on_|cli_)[A-Za-z0-9_-]{8,}\b/i.test(value)
    || /\b(?:tkn|tok|sk|pat|api)[_-](?:live|test|prod)?[_-]?[A-Za-z0-9]{10,}\b/i.test(value);
}

function reportContainsSensitiveEmission(value) {
  if (emissionValueIsSensitive(value)) return true;
  if (Array.isArray(value)) return value.some(reportContainsSensitiveEmission);
  if (!value || typeof value !== "object") return false;
  return Object.entries(value).some(([key, child]) => SENSITIVE_EMISSION_KEYS.has(key.toLowerCase())
    || emissionValueIsSensitive(key)
    || reportContainsSensitiveEmission(child));
}

function serializedContainsSensitiveEmission(text) {
  return emissionValueIsSensitive(text);
}

function serializeReportForEmission(report) {
  const safe = validateReportConsistency(report) && !reportContainsSensitiveEmission(report);
  const selected = safe ? report : fatalReport();
  const text = JSON.stringify(selected, null, 2);
  if (!validateReportConsistency(selected) || reportContainsSensitiveEmission(selected) || serializedContainsSensitiveEmission(text)) {
    return { text: JSON.stringify(fatalReport(), null, 2), exitCode: 1 };
  }
  return { text, exitCode: selected.status === "passed" ? 0 : 1 };
}

function emitReport(report) {
  const emission = serializeReportForEmission(report);
  console.log(emission.text);
  process.exitCode = emission.exitCode;
}

main()
  .then(emitReport)
  .catch(() => {
    emitReport(fatalReport());
  });
