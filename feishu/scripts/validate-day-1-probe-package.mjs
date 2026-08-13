#!/usr/bin/env node

import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "../..");

const FROZEN_OFFLINE_VALIDATOR_SHA256 = "c82dba4918a6bd11f9fef2218c439ca4cf25a0118122e7a19f783be7b46f5229";
const FROZEN_CONTRACT_VALIDATOR_SHA256 = "d953ba017d64f88426b7388b6f3d886fd8bfdffd31eab37bec92789b0159a826";
const REPORT_SCHEMA_VERSION = "neoloop.day1-validator-report.v1";
const OFFLINE_REPORT_SCHEMA_VERSION = "neoloop.offline-validator-report.v1";
const OFFLINE_ATTESTATION_SCHEMA_VERSION = "day1_offline_attestation.v1";
const EXPECTED_OFFLINE_NEGATIVE_TEST_NAME_DIGEST = "c7ef7d7686397238bed49672078f198085ed56784b3b9a1037999728c4f591c9";
const OFFLINE_TIMEOUT_MS = 45_000;
const OFFLINE_MAX_BUFFER = 10 * 1024 * 1024;
const OFFLINE_CHECK_GROUP_COUNTS = Object.freeze({
  legacy: 94,
  baseline_integrity: 9,
  strict_input_snapshot: 4,
  current_version_chain: 5,
  r10_build_projection: 17,
  r10_onsite_evidence: 8,
  report_fail_closed_redaction: 6,
});
const OFFLINE_NEGATIVE_TEST_COUNTS = Object.freeze({
  strict_JSON: 7,
  baseline_process: 11,
  snapshot: 1,
  baseline_profile: 23,
  r10_projection: 11,
  r10_evidence: 8,
  redaction: 8,
  report_schema: 56,
});
const DAY1_EXPECTED_P03_CLOSURE_FIXTURE_IDS = Object.freeze([
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
const DAY1_EXPECTED_CONTRACT_P03_PREBUILD_FIXTURE_IDS = Object.freeze([
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
const DAY1_NEGATIVE_TEST_NAMES_BY_CATEGORY = Object.freeze({
  strict_JSON: Object.freeze([
    "duplicate_key",
    "decoded_unicode_alias",
    "decoded_escape_alias",
    "negative_zero",
    "non_finite_exponent",
    "invalid_JSON",
    "multiple_JSON_values",
  ]),
  offline_process: Object.freeze([
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
    "maxBuffer_configuration",
    "stable_SHA_mismatch_zero_spawn",
  ]),
  snapshot_upstream: Object.freeze([
    "byte_sha_mismatch",
    "summary_synchronized_count",
    "group_equal_cardinality_rename",
    "negative_category_count_swap",
    "C13_expected_observed_sync",
    "source_top_selected_sync",
    "onsite_verified_and_operation",
    "offline_negative_matrix_missing_key",
    "offline_negative_matrix_extra_key",
    "offline_negative_category_equal_cardinality_rename",
    "offline_negative_name_digest_drift",
  ]),
  contract_mutations: Object.freeze([
    "success_without_evidence",
    "missing_P13",
    "missing_import_dependency",
    "source_hash_drift",
    "non_null_resource",
    "secret_and_real_URL",
    "root_execution_boundary_completed_non_null_op1",
    "permission_not_tested_with_evidence", "permission_blocked_without_evidence", "permission_same_record_evidence_mismatch",
    "permission_onsite_evidence_mismatch", "permission_completed_invalid_result", "permission_extra_field",
    "L-TIME-01", "L-EVID-01", "L-EVID-02", "L-EVID-03", "L-R10-01",
    "L-P03-STATE-01", "L-P03-STATE-02", "L-P03-TIME-01", "L-P03-BIND-01", "L-P03-BIND-02", "L-P03-BIND-03",
    "L-DEP-01", "L-DEP-02", "L-DEP-03", "L-DEP-04",
    "P03_attempted_phase_parent_not_tested", "P06_dependency_drift",
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
    "capture_phase_probe_suite_declaration_drift", "capture_phase_permission_results_declaration_drift",
    "capture_phase_evidence_template_declaration_drift", "P03_onsite_prebuild_boundary_contract_drift",
    "P03_evidence_entry_unknown_capture",
    "P03_prebuild_proof_blocked_nonnull", "P03_prebuild_proof_fixture_marker_drift",
    "P03_prebuild_proof_non_synthetic", "P03_prebuild_proof_non_isolated_temporary_scope",
    "P03_prebuild_proof_enterprise_data_used", "P03_prebuild_proof_actor_class_drift",
    "P03_prebuild_proof_actor_not_distinct", "P03_prebuild_proof_owner_privileges_present",
    "P03_prebuild_proof_administrator_privileges_present", "P03_prebuild_proof_independent_session_unverified",
    "P03_prebuild_proof_allowed_open_unattempted", "P03_prebuild_proof_protected_mutation_unattempted",
    "P03_prebuild_proof_non_isolated_views_hidden_type", "P03_prebuild_proof_non_target_records_hidden_type",
    "P03_prebuild_proof_direct_table_access_denied_type", "P03_prebuild_proof_raw_json_hidden_type",
    "P03_prebuild_proof_management_configuration_hidden_type",
    "P03_prebuild_proof_temporary_access_not_revoked", "P03_prebuild_proof_cleanup_not_reverified",
    "P03_prebuild_proof_unauthorized_count_type", "P03_prebuild_proof_unauthorized_count_negative",
    "P03_prebuild_proof_available_view_not_opened", "P03_prebuild_proof_available_non_isolated_view_visible",
    "P03_prebuild_proof_available_non_target_record_visible", "P03_prebuild_proof_available_direct_table_access_allowed",
    "P03_prebuild_proof_available_raw_json_visible", "P03_prebuild_proof_available_management_configuration_visible",
    "P03_prebuild_proof_available_mutation_not_rejected",
    "P03_prebuild_proof_available_unauthorized_write", "P03_prebuild_proof_available_business_state_changed",
    "P03_prebuild_proof_restricted_without_limitations", "P03_prebuild_proof_restricted_without_fallback",
    "P03_prebuild_view_closed_but_mutation_attempted", "P03_prebuild_view_closed_but_mutation_rejected",
    "P03_prebuild_visibility_leak_but_mutation_attempted",
    "P03_prebuild_phase_evidence_full_object_mismatch", "P03_prebuild_phase_evidence_order_mismatch",
    "P03_prebuild_declaration_missing", "P03_prebuild_declaration_extra", "P03_prebuild_declaration_rename",
    ...DAY1_EXPECTED_P03_CLOSURE_FIXTURE_IDS,
    "P03_prebuild_unavailable_started_postbuild", "P03_prebuild_restricted_without_safe_fallback", "P03_prebuild_restricted_without_limitations",
    "P03_result_available_with_partial_views", "P03_result_restricted_with_zero_views", "P03_result_unavailable_with_all_safe_views",
    "P03_result_restricted_with_direct_leak", "P03_result_unavailable_with_prewrite_limit",
  ]),
  r10_evidence: Object.freeze([
    "legacy_W6_semantic_replacement",
    "R10_component_semantic_replacement",
  ]),
  redaction: Object.freeze([
    "sensitive_diagnostic_object",
    "sensitive_key",
    "complete_URL",
    "Bearer_authorization",
    "Feishu_resource_ID",
    "open_ID",
    "token_pattern",
    "serializer_sensitive_report",
  ]),
  report_schema: Object.freeze([
    "schema_version_drift",
    "missing_nested_key",
    "extra_root_key",
    "passed_untrusted_fake_green",
  ]),
});
const EXPECTED_DAY1_NEGATIVE_TEST_NAME_DIGEST = "bfa4644a6d06d39a47c602f25aee4750d9d780ed40c31a2621df53c9b1d41591";
const EXPECTED_CANONICAL_TABLE_FILES = Object.freeze({
  raw_feedback: "raw-feedback.json",
  cases: "cases.json",
  work_orders: "work-orders.json",
  clusters: "clusters.json",
  improvements: "improvements.json",
  vehicles: "vehicles.json",
  delivery_tasks: "delivery-tasks.json",
  routing_matrix: "routing-matrix.json",
  knowledge_index: "knowledge-index.json",
  ai_audit: "ai-audit.json",
});
const PERMISSION_RESULT_EXACT_FIELDS = Object.freeze([
  "unit_id", "name", "probe_ref", "evidence_unit_ref", "execution_status", "result", "evidence",
  "preconditions_observed", "expected_result_ref", "actual_action", "actual_result", "actual_time",
  "executor", "account_role", "limitations", "evidence_index", "fallback_path", "fallback_verified",
  "cleanup_result", "verifier",
]);
const PERMISSION_RESULT_RUNTIME_FIELDS = Object.freeze([
  "execution_status", "result", "evidence", "preconditions_observed", "expected_result_ref", "actual_action",
  "actual_result", "actual_time", "executor", "account_role", "limitations", "evidence_index",
  "fallback_path", "fallback_verified", "cleanup_result", "verifier",
]);
const OFFLINE_CORE_KEYS = Object.freeze([
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
const OFFLINE_SUMMARY_KEYS = Object.freeze([
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
const OFFLINE_ONSITE_STATUS_KEYS = Object.freeze([
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
const OFFLINE_ATTESTATION_COMPARISON_KEYS = Object.freeze([
  "validator_sha",
  "transport",
  "envelope",
  "groups",
  "c13_fixture_profile",
  "closures",
  "c12_tradeoff",
  "c13_tradeoff",
  "versions",
  "sources",
  "permission_result_contract",
  "permission_content_freeze",
  "all",
]);
const OFFLINE_CONTRACT_ATTESTATION_KEYS = Object.freeze([
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
const OFFLINE_NEGATIVE_TEST_MATRIX_KEYS = Object.freeze([
  "total", "passed", "failed", "categories", "expected_name_digest", "observed_name_digest",
]);
const OFFLINE_NEGATIVE_CATEGORY_KEYS = Object.freeze(["total", "passed", "failed"]);
const OFFLINE_CONTRACT_EXPECTED_KEYS = Object.freeze([
  "validator_sha256", "report_envelope", "check_group_counts", "c13", "literal_reference_closures",
  "c12_tradeoff_digest", "c13_tradeoff_digest", "versions", "selected_source_attestations",
  "permission_result_contract", "permission_content_freeze",
]);
const OFFLINE_CONTRACT_SOURCE_KEYS = Object.freeze([
  "baselineValidator", "r10Plan", "logicalManifest", "buildPackage", "probeSuite", "permissionResults",
  "resourceMapping", "evidenceTemplate", "permissionMatrix", "buildRunbook", "rollbackRunbook",
  "permissionRunbook", "t3Contract",
]);
const OFFLINE_PUBLIC_SOURCE_ENTRY_KEYS = Object.freeze(["path", "sha256"]);
const EXPECTED_CONTRACT_GROUP_COUNTS = Object.freeze({
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
const EXPECTED_CONTRACT_C13 = Object.freeze({
  groups: {
    illegal_locator_fragment_cross: { count: 72, digest: "9a89df6bc661403d25b1140875f787b5475fb6f1e78c3f8ec677a195118077c1" },
    valid_locator_invalid_fragment_reasons: { count: 32, digest: "ce4c827b78d41c3e9bf6cd10220d7d285c0019dea7a675257012d31b5aaa52a1" },
    uppercase_extension_fragment_precedence: { count: 36, digest: "9ddb577db06c63269867dd884cc05790117a490b30cff9a874ac0722dcee93c3" },
    valid_fragment_resolver_controls: { count: 4, digest: "1a6560e62de0533faea79482b0e0e029b4016a872dd6e7144d97bd76f11bd5b5" },
    terminal_punctuation_matrix: { count: 1344, digest: "46b6862ba3ac97cf79d3d174a9fd10a621df8a3ee5d37178b6ee6a702ade411b" },
    ordinary_non_candidates: { count: 18, digest: "b5f559aa0b5eb5a06c5707a6f9db0750f17e1162f0febdea9551dfb33af8cc43" },
    reason_precedence_oracle: { count: 5, digest: "08a4f6aa57588f87134549bb7171230cd7a5dcd11a966ce89b5b86f2941f3958" },
  },
  profile_digest: "29f88b2e67a2aa16484fa5720adf572d7098fe0c0ed6b37be25696cb0bdb90e4",
});
const EXPECTED_CONTRACT_CLOSURES = Object.freeze({
  external_repository_files: { count: 60, digest: "aec9fc8c186ee9b29dac1e7e6df4b2671e990d2ecc8d3a7781147d1af9121e80" },
  internal_JSON_Pointers: { count: 32, digest: "0d611a5d59056240f50c4faaafee66a230901732ae1be4737cd78e023be5b921" },
  known_scheme_locators: { count: 568, digest: "d55ada37978fb3c90c3fb4358350e4e060c407cc67aa9ea5a54f7bd6b1461721" },
});
const EXPECTED_CONTRACT_PERMISSION_NEGATIVE_IDS = Object.freeze([
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
  ...DAY1_EXPECTED_CONTRACT_P03_PREBUILD_FIXTURE_IDS,
  ...DAY1_EXPECTED_P03_CLOSURE_FIXTURE_IDS,
  "P03_prebuild_unavailable_started_postbuild", "P03_prebuild_restricted_without_safe_fallback", "P03_prebuild_restricted_without_limitations",
  "P03_result_available_with_partial_views", "P03_result_restricted_with_zero_views", "P03_result_unavailable_with_all_safe_views",
  "P03_result_restricted_with_direct_leak", "P03_result_unavailable_with_prewrite_limit",
]);
const EXPECTED_CONTRACT_ATTESTATION = Object.freeze({
  validator_sha256: FROZEN_CONTRACT_VALIDATOR_SHA256,
  report_envelope: {
    status: "passed",
    mode: "read_only",
    passed_checks: 2759,
    failed_checks: 0,
    upstream_conflicts: 0,
    check_group_count: 15,
  },
  check_group_counts: EXPECTED_CONTRACT_GROUP_COUNTS,
  c13: EXPECTED_CONTRACT_C13,
  literal_reference_closures: EXPECTED_CONTRACT_CLOSURES,
  c12_tradeoff_digest: "b19d3f019e680376a3f978da4c18add20fe8e0ed86874da7927e250f192861f7",
  c13_tradeoff_digest: "dcc0658681cc2a837daa1290c5875581e0657ba88c7fb5dbf0d8e09d9a800d23",
  versions: {
    logical_manifest: "0.1.6",
    build_package: "0.1.5",
    pinned_logical_manifest: "0.1.6",
  },
  selected_source_attestations: 5,
  permission_result_contract: {
    attestation_schema_version: "permission_result_contract_attestation.v1",
    source_freeze_version: "permission_content_source_freeze.v1",
    status: "passed",
    check_group: "permission_result_contract",
    assertion_count: 234,
    failed_assertion_count: 0,
    negative_fixture_count: 220,
    negative_fixtures: EXPECTED_CONTRACT_PERMISSION_NEGATIVE_IDS.map((id) => ({ id, rejected: true })),
    negative_fixture_name_digest: "8035213874adc53e71d860549a4c45fabbf49acd62c11edb4016fec3feec1522",
    versions: { probe_suite: "0.1.7", permission_results: "0.1.3", evidence_template: "0.1.6" },
    counts: { state_truth_rows: 5, permission_records: 13, exact_fields: 20, required_runtime_fields: 16, declared_field_types: 20, P03_phases: 2 },
    canonical_evidence_source: "permission_result.evidence_index",
    canonical_evidence_binding: "permission_result.evidence_and_same_Pnn_on_site.structured_evidence_index_canonical_deep_equal",
    P03_phase_binding: "phase_evidence_indexes_canonical_deep_equal_parent_P03_indexes_filtered_by_capture_phase_in_same_order_with_unique_evidence_id",
    P06_dependencies: ["P02", "P05"],
    P07_dependencies: ["P02", "P05"],
    sources: [
      { id: "probe_suite", path: "feishu/manifests/day-1-probe-suite.v0.1.json", sha256: "b483a2d746aec0caac00fd7f04ecd81ca5c232e0060207e540a024bf1b5e69c1" },
      { id: "permission_results", path: "feishu/evidence/day-1-probe-results.example.json", sha256: "af499c929b722b1ec996a5ba916a7d395162364435d59f5ed105f286bc3ff30b" },
      { id: "evidence_template", path: "feishu/evidence/on-site-evidence-template.json", sha256: "8b5a9822069fb8faca4584803fe5c84bf778bb34e7fb50cf97a19c1febf5ef3a" },
      { id: "permission_acceptance", path: "feishu/runbooks/day-1-permission-acceptance.md", sha256: "ca76396650706bb47e5fecf37444de6a36e1cf71dd7b9a827219093eb3fd8241" },
      { id: "permission_matrix", path: "feishu/runbooks/day-1-permission-matrix.md", sha256: "66f22b5608f5d7a2ce7cc36c7ab4f5eff7244b162d4669c7839051e66bae90f8" },
    ],
    source_count: 5,
    source_digest: "1595eb62c6d9fbea8078ae89cb5df5fe82db881f47ce827b4330ebf319f462fa",
    current_execution_status: "not_tested",
    real_external_operations: 0,
  },
  permission_content_freeze: {
    source_count: 6,
    source_digest: "da7cf50b8e116da5f077b65a97024715d3ac00a18888b1c9462710a1506f716e",
    sources: [
      { id: "r10_plan", path: "docs/superpowers/plans/2026-08-04-shiting-neoloop-r10-implementation-plan.md", sha256: "29e768b96276cc544fefc133a211959b6226f82ea48b02af527afcd84f536f2f" },
      { id: "probe_suite", path: "feishu/manifests/day-1-probe-suite.v0.1.json", sha256: "b483a2d746aec0caac00fd7f04ecd81ca5c232e0060207e540a024bf1b5e69c1" },
      { id: "permission_results", path: "feishu/evidence/day-1-probe-results.example.json", sha256: "af499c929b722b1ec996a5ba916a7d395162364435d59f5ed105f286bc3ff30b" },
      { id: "evidence_template", path: "feishu/evidence/on-site-evidence-template.json", sha256: "8b5a9822069fb8faca4584803fe5c84bf778bb34e7fb50cf97a19c1febf5ef3a" },
      { id: "permission_acceptance", path: "feishu/runbooks/day-1-permission-acceptance.md", sha256: "ca76396650706bb47e5fecf37444de6a36e1cf71dd7b9a827219093eb3fd8241" },
      { id: "permission_matrix", path: "feishu/runbooks/day-1-permission-matrix.md", sha256: "66f22b5608f5d7a2ce7cc36c7ab4f5eff7244b162d4669c7839051e66bae90f8" },
    ],
  },
});
const EXPECTED_ACCEPTED_SECURITY_TRADEOFFS = Object.freeze({
  c12: {
    status: "accepted",
    policy_scope: "explicit_path_syntax_signal_at_sentence_end",
    invalid_value_count: 4,
    ordinary_value_count: 6,
    digest: EXPECTED_CONTRACT_ATTESTATION.c12_tradeoff_digest,
    exact_and_disjoint_recomputed: true,
  },
  c13: {
    status: "accepted",
    policy_scope: "fragment_is_strong_path_syntax_but_terminal_punctuation_requires_path_shaped_prefix",
    reason_precedence_count: 5,
    ordinary_value_count: 18,
    terminal_negative_value_count: 1344,
    digest: EXPECTED_CONTRACT_ATTESTATION.c13_tradeoff_digest,
    ordinary_and_terminal_disjoint_recomputed: true,
  },
});
const REPORT_CORE_KEYS = Object.freeze([
  "report_schema_version",
  "status",
  "mode",
  "fatal",
  "offline_attestation",
  "sources",
  "summary",
  "check_groups",
  "negative_test_matrix",
  "onsite_status",
  "errors",
]);
const REPORT_OFFLINE_ATTESTATION_KEYS = Object.freeze([
  "attestation_schema_version",
  "status",
  "execution_byte_binding_scope",
  "residual_risk",
  "validator_path",
  "validator_sha256",
  "contract_validator_sha256",
  "timeout_ms",
  "max_buffer_bytes",
  "invocation_count",
  "process_status",
  "report_schema_version",
  "report_status",
  "report_mode",
  "report_fatal",
  "baseline_passed_checks",
  "offline_passed_checks",
  "total_passed_checks",
  "check_group_count",
  "check_group_counts",
  "negative_test_count",
  "negative_test_category_counts",
  "negative_test_expected_name_digest",
  "negative_test_observed_name_digest",
  "source_count",
  "source_digest",
  "comparisons",
]);
const REPORT_OFFLINE_COMPARISON_KEYS = Object.freeze([
  "validator_sha",
  "contract_validator_sha",
  "transport",
  "snapshot",
  "envelope",
  "profile",
  "onsite",
  "negative_test_names",
  "all",
]);
const REPORT_SUMMARY_KEYS = Object.freeze([
  "baseline_contract_checks",
  "baseline_offline_checks",
  "baseline_total_checks",
  "day1_passed_checks",
  "day1_total_checks",
  "total_passed_checks",
  "failed_checks",
  "probes",
  "import_table_batches",
  "import_execution_units",
  "smoke_units",
  "result_units",
  "execution_records_untested",
  "evidence_null_values",
  "resource_null_fields",
  "onsite_evidence_units",
  "onsite_evidence_units_untested",
  "r10_probe_subchecks",
  "r10_probe_subchecks_untested",
  "r10_actual_slots_populated",
  "day1_negative_controls",
  "day1_negative_controls_passed",
]);
const REPORT_ONSITE_STATUS_KEYS = Object.freeze([
  "P01_to_P13",
  "R10_verification_status",
  "R10_execution_mode",
  "R10_automatic_projection_enabled",
  "real_feishu_operations_performed_by_validator",
  "lark_cli_install_or_login_performed_by_validator",
  "openapi_calls_performed_by_validator",
  "base_write_attempts_performed_by_validator",
]);
const REPORT_NEGATIVE_MATRIX_KEYS = Object.freeze([
  "expected",
  "observed",
  "profile_controls",
]);
const REPORT_NEGATIVE_EXPECTED_KEYS = Object.freeze([
  "total",
  "name_digest",
  "names_by_category",
]);
const REPORT_NEGATIVE_OBSERVED_KEYS = Object.freeze([
  "total",
  "passed",
  "failed",
  "name_digest",
  "names_by_category",
  "category_counts",
  "tests",
]);
const REPORT_NEGATIVE_CATEGORY_COUNT_KEYS = Object.freeze(["total", "passed", "failed"]);
const REPORT_NEGATIVE_TEST_KEYS = Object.freeze(["category", "name", "passed"]);
const REPORT_NEGATIVE_PROFILE_CONTROL_KEYS = Object.freeze([
  "omission_rejected",
  "duplicate_rejected",
  "equal_length_rename_rejected",
  "all_expected_names_observed",
]);
const OFFLINE_OBSERVED_ATTESTATION_KEYS = Object.freeze([
  "validator_sha256_pre",
  "validator_sha256_pre_spawn",
  "validator_sha256_post",
  "process",
  "report_envelope",
  "check_group_counts",
  "c13",
  "literal_reference_closures",
  "tradeoffs",
  "versions",
  "permission_result_contract",
  "permission_content_freeze",
  "selected_sources",
]);
const EXPECTED_OFFLINE_PROTECTION_CATEGORY_COUNTS = Object.freeze({
  controlled_workflow_write: 96,
  authorized_human_write: 32,
  automation_system_write: 13,
  ai_candidate_write: 1,
  immutable_or_snapshot_read_only: 84,
  append_only_audit: 14,
});
const REDACTION_SENTINEL = "NEOLOOP_DAY1_DO_NOT_EMIT_SECRET_6a1f9c2e";

const paths = {
  baselineValidator: path.join(scriptDirectory, "validate-offline-package.mjs"),
  contractValidator: path.join(scriptDirectory, "validate-contract-alignment.mjs"),
  probeSuite: path.join(repositoryRoot, "feishu/manifests/day-1-probe-suite.v0.1.json"),
  importPlan: path.join(repositoryRoot, "feishu/manifests/base-import-batch-plan.v0.1.json"),
  smokePlan: path.join(repositoryRoot, "feishu/manifests/on-site-smoke-plan.v0.1.json"),
  resultTemplate: path.join(repositoryRoot, "feishu/evidence/day-1-probe-results.example.json"),
  capabilityRunbook: path.join(repositoryRoot, "feishu/runbooks/lark-cli-openapi-capability-probe.md"),
  buildRunbook: path.join(repositoryRoot, "feishu/runbooks/on-site-build-runbook.md"),
  permissionMatrix: path.join(repositoryRoot, "feishu/runbooks/day-1-permission-matrix.md"),
  permissionRunbook: path.join(repositoryRoot, "feishu/runbooks/day-1-permission-acceptance.md"),
  rollbackRunbook: path.join(repositoryRoot, "feishu/runbooks/rollback-and-cleanup.md"),
  evidenceTemplate: path.join(repositoryRoot, "feishu/evidence/on-site-evidence-template.json"),
  resourceMappingTemplate: path.join(repositoryRoot, "feishu/config/resource-mapping.example.json"),
  canonicalManifest: path.join(repositoryRoot, "data/canonical/manifest.json"),
  canonicalTables: path.join(repositoryRoot, "data/canonical/tables"),
  mainStory: path.join(repositoryRoot, "data/canonical/scenarios/main-story.json"),
  failureDrills: path.join(repositoryRoot, "data/canonical/scenarios/failure-drills.json"),
  logicalManifest: path.join(repositoryRoot, "feishu/manifests/neoloop-logical-manifest.v0.1.json"),
  buildPackage: path.join(repositoryRoot, "feishu/manifests/on-site-build-package.v0.1.json"),
  t3Contract: path.join(repositoryRoot, "src/neoloop/contracts/model.ts"),
};

const OFFLINE_SOURCE_PATH_KEYS = Object.freeze({
  baselineValidator: "contractValidator",
  r10Plan: null,
  logicalManifest: "logicalManifest",
  buildPackage: "buildPackage",
  probeSuite: "probeSuite",
  permissionResults: "resultTemplate",
  resourceMapping: "resourceMappingTemplate",
  evidenceTemplate: "evidenceTemplate",
  permissionMatrix: "permissionMatrix",
  buildRunbook: "buildRunbook",
  rollbackRunbook: "rollbackRunbook",
  permissionRunbook: "permissionRunbook",
  t3Contract: "t3Contract",
});
const FIXED_SNAPSHOT_PATHS = Object.freeze(Object.fromEntries(
  Object.entries(paths).filter(([key]) => key !== "canonicalTables"),
));
const CANONICAL_TABLE_SNAPSHOT_PATHS = Object.freeze(Object.fromEntries(Object.entries(EXPECTED_CANONICAL_TABLE_FILES)
  .map(([tableKey, filename]) => [`canonicalTable_${tableKey}`, path.join(paths.canonicalTables, filename)])));
const SNAPSHOT_PATHS = Object.freeze({ ...FIXED_SNAPSHOT_PATHS, ...CANONICAL_TABLE_SNAPSHOT_PATHS });
const EXPECTED_SOURCE_SHA256 = Object.freeze({
  baselineValidator: FROZEN_OFFLINE_VALIDATOR_SHA256,
  contractValidator: FROZEN_CONTRACT_VALIDATOR_SHA256,
  probeSuite: "b483a2d746aec0caac00fd7f04ecd81ca5c232e0060207e540a024bf1b5e69c1",
  importPlan: "4741cef79b6bb62ec3083d7bda7a93148030c0a173a6f99513abe6b68bceb7cc",
  smokePlan: "06d202f8e6462ac5bab565fc143dc30af820fe9ec87e0a152aef8af624ef4f3c",
  resultTemplate: "af499c929b722b1ec996a5ba916a7d395162364435d59f5ed105f286bc3ff30b",
  capabilityRunbook: "b0304ae07eb418b76cbdf00964f31df69f127a9f5d15c3ccf8bdb6460920f561",
  buildRunbook: "3e80867bba5c41502ea783b744ad272dce3fe15c0ed1c40edc229b086775c759",
  permissionMatrix: "66f22b5608f5d7a2ce7cc36c7ab4f5eff7244b162d4669c7839051e66bae90f8",
  permissionRunbook: "ca76396650706bb47e5fecf37444de6a36e1cf71dd7b9a827219093eb3fd8241",
  rollbackRunbook: "5a2e13764d5a8443a8ebbf26c63a11a863c1116ab91eef7703c0817240a6b57a",
  evidenceTemplate: "8b5a9822069fb8faca4584803fe5c84bf778bb34e7fb50cf97a19c1febf5ef3a",
  resourceMappingTemplate: "a72545aa5820d54025b294bb5e96ad31d243b4eb35e648921149f18e2ea9fdb9",
  canonicalManifest: "3e3ebc6a8aaf1f0692db39b0c763b081df2ef5f9db6f6d8da9f3a0ab8edbe8b7",
  mainStory: "1584fceecbfbbf4d63eee9ac69ed998505985d0f51a4a1b508d28976dcce690c",
  failureDrills: "c8893a7a706f1b3a8051d16b855a35372690bbc780ca060cb8768219dbc0312a",
  logicalManifest: "c4e9790c724723864869365bebfc98a3d72baceb5e643386df5b1685a43d8f60",
  buildPackage: "8fe61f8f6fff7c3608bcb2a7cfc57011fc0fa21b9b9b2db9e28c2bcd38690e58",
  t3Contract: "81b5c9875ee64665c9db186f34e3bb0292ec8f652bd2bbcaab1bc4b3502e8444",
  canonicalTable_raw_feedback: "2ef2d71e14b41d8a4b7f9dce204b752ffb74ad10d4116ce173256d2033dbf7a2",
  canonicalTable_cases: "7d73cd29fd2da9c0d3c59030e34e506d78202c958f2f723b491272b315a0ceed",
  canonicalTable_work_orders: "73e235b824c45576925e5a38827b6ab2b10923509fd94d13eb6d9d13634d813c",
  canonicalTable_clusters: "602c613e77e0bfc310da6841a4f70e1138ad89f326629dd99d39fee3f4a38c52",
  canonicalTable_improvements: "9124d6a47979072c698bfc8201728736622a11135540c05bf54908433437be69",
  canonicalTable_vehicles: "d27b0e1be986cd40250faccc64f8a08e2010bca4f790f5e026160168033176bd",
  canonicalTable_delivery_tasks: "cb36e6346e3314ab0131d7d46f683470bf45928809b94f1051ca2beddbab70db",
  canonicalTable_routing_matrix: "25d686eff946651c3ca73c0fc27601bf43ca368e470d6d360552722296e457f3",
  canonicalTable_knowledge_index: "c0431e7a5bbaafaff1fe23777b1d1f10cc25810bc8c7f5e569735b53e95c103c",
  canonicalTable_ai_audit: "37517e5f3dc66819f61f5a7bb8ace1921282415f10551d2defa5c3eb0985b570",
});
const EXPECTED_DAY1_SOURCE_COUNT = 29;
const EXPECTED_DAY1_SOURCE_DIGEST = "b113cd47a29ef85f260602cecd0c65a46b59d318a9bdb3096bc09793375b617e";

const checks = [];
const errors = [];
const negativeControls = [];
const contractMutationCandidateDigests = [];

function pass(name, details = undefined) {
  void details;
  checks.push({ name, ok: true });
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

function diagnosticSummaryIsSafe(details) {
  if (!details || Array.isArray(details) || typeof details !== "object") return false;
  if (["null", "undefined", "boolean"].includes(details.type)) {
    return exactOwnKeys(details, ["type"]);
  }
  if (details.type === "string") {
    return exactOwnKeys(details, ["type", "byte_length"])
      && Number.isSafeInteger(details.byte_length)
      && details.byte_length >= 0;
  }
  if (details.type === "number") {
    return exactOwnKeys(details, ["type", "finite", "negative_zero"])
      && typeof details.finite === "boolean"
      && typeof details.negative_zero === "boolean";
  }
  if (details.type === "array") {
    return exactOwnKeys(details, ["type", "count"])
      && Number.isSafeInteger(details.count)
      && details.count >= 0;
  }
  if (details.type === "object") {
    return exactOwnKeys(details, ["type", "key_count"])
      && Number.isSafeInteger(details.key_count)
      && details.key_count >= 0;
  }
  return details.type === "fixed_code"
    && exactOwnKeys(details, ["type", "code"])
    && details.code === "day1_validator_fatal";
}

function fail(name, details) {
  const summarized = summarizeDiagnostic(details);
  checks.push({ name, ok: false });
  errors.push({ name, group: "day1", details: summarized });
}

function assert(name, condition, details) {
  if (condition) pass(name);
  else fail(name, details);
}

function recordNegativeControl(category, name, passed) {
  negativeControls.push({ category, name, passed: passed === true });
  return passed === true;
}

function recordContractMutation(name, passed, mutatedInput) {
  const candidateSnapshot = structuredClone(mutatedInput);
  contractMutationCandidateDigests.push({
    name,
    digest: canonicalSha256(candidateSnapshot),
  });
  return recordNegativeControl("contract_mutations", name, passed);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
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

function exactOwnKeys(value, expectedKeys) {
  return value !== null
    && !Array.isArray(value)
    && typeof value === "object"
    && equalArrays(Object.keys(value).sort(codeUnitCompare), [...expectedKeys].sort(codeUnitCompare));
}

function deepEqual(left, right) {
  return canonicalJson(left) === canonicalJson(right);
}

function equalArrays(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function sorted(values) {
  return [...values].sort();
}

function equalSets(left, right) {
  return equalArrays(sorted(new Set(left)), sorted(new Set(right)));
}

function expectedDay1NegativeNameKeys() {
  return Object.entries(DAY1_NEGATIVE_TEST_NAMES_BY_CATEGORY)
    .flatMap(([category, names]) => names.map((name) => `${category}:${name}`));
}

function day1NegativeProfileMatches(keys) {
  const expectedKeys = expectedDay1NegativeNameKeys();
  return equalArrays([...keys].sort(codeUnitCompare), [...expectedKeys].sort(codeUnitCompare))
    && canonicalSha256([...keys].sort(codeUnitCompare)) === EXPECTED_DAY1_NEGATIVE_TEST_NAME_DIGEST;
}

function expectedDay1NegativeProfile() {
  return {
    total: expectedDay1NegativeNameKeys().length,
    name_digest: EXPECTED_DAY1_NEGATIVE_TEST_NAME_DIGEST,
    names_by_category: Object.fromEntries(Object.entries(DAY1_NEGATIVE_TEST_NAMES_BY_CATEGORY)
      .map(([category, names]) => [category, [...names]])),
  };
}

function buildDay1NegativeTestMatrix() {
  const observedKeys = negativeControls.map((control) => `${control.category}:${control.name}`);
  const renamedKeys = [...observedKeys];
  if (renamedKeys.length > 0) renamedKeys[0] = `${renamedKeys[0].slice(0, -1)}x`;
  const tests = negativeControls
    .map(({ category, name, passed }) => ({ category, name, passed }))
    .sort((left, right) => codeUnitCompare(`${left.category}:${left.name}`, `${right.category}:${right.name}`));
  const namesByCategory = Object.fromEntries(Object.keys(DAY1_NEGATIVE_TEST_NAMES_BY_CATEGORY).map((category) => [
    category,
    negativeControls.filter((control) => control.category === category).map((control) => control.name),
  ]));
  const categoryCounts = Object.fromEntries(Object.keys(DAY1_NEGATIVE_TEST_NAMES_BY_CATEGORY).map((category) => {
    const controls = negativeControls.filter((control) => control.category === category);
    return [category, {
      total: controls.length,
      passed: controls.filter((control) => control.passed).length,
      failed: controls.filter((control) => !control.passed).length,
    }];
  }));
  const profileMatches = day1NegativeProfileMatches(observedKeys);
  return {
    expected: expectedDay1NegativeProfile(),
    observed: {
      total: negativeControls.length,
      passed: negativeControls.filter((control) => control.passed).length,
      failed: negativeControls.filter((control) => !control.passed).length,
      name_digest: canonicalSha256([...observedKeys].sort(codeUnitCompare)),
      names_by_category: namesByCategory,
      category_counts: categoryCounts,
      tests,
    },
    profile_controls: {
      omission_rejected: !day1NegativeProfileMatches(observedKeys.slice(1)),
      duplicate_rejected: !day1NegativeProfileMatches([...observedKeys, observedKeys[0]]),
      equal_length_rename_rejected: !day1NegativeProfileMatches(renamedKeys),
      all_expected_names_observed: profileMatches,
    },
  };
}

function fatalDay1NegativeTestMatrix() {
  return {
    expected: expectedDay1NegativeProfile(),
    observed: {
      total: null,
      passed: null,
      failed: null,
      name_digest: null,
      names_by_category: null,
      category_counts: null,
      tests: null,
    },
    profile_controls: {
      omission_rejected: null,
      duplicate_rejected: null,
      equal_length_rename_rejected: null,
      all_expected_names_observed: null,
    },
  };
}

function passingDay1NegativeTestMatrix() {
  const expected = expectedDay1NegativeProfile();
  const tests = Object.entries(DAY1_NEGATIVE_TEST_NAMES_BY_CATEGORY)
    .flatMap(([category, names]) => names.map((name) => ({ category, name, passed: true })))
    .sort((left, right) => codeUnitCompare(`${left.category}:${left.name}`, `${right.category}:${right.name}`));
  return {
    expected,
    observed: {
      total: expected.total,
      passed: expected.total,
      failed: 0,
      name_digest: expected.name_digest,
      names_by_category: structuredClone(expected.names_by_category),
      category_counts: Object.fromEntries(Object.entries(DAY1_NEGATIVE_TEST_NAMES_BY_CATEGORY).map(([category, names]) => [category, {
        total: names.length,
        passed: names.length,
        failed: 0,
      }])),
      tests,
    },
    profile_controls: {
      omission_rejected: true,
      duplicate_rejected: true,
      equal_length_rename_rejected: true,
      all_expected_names_observed: true,
    },
  };
}

function normalDay1NegativeTestMatrixMatches(matrix) {
  const expected = expectedDay1NegativeProfile();
  if (!exactOwnKeys(matrix, REPORT_NEGATIVE_MATRIX_KEYS)
    || !exactOwnKeys(matrix.expected, REPORT_NEGATIVE_EXPECTED_KEYS)
    || !deepEqual(matrix.expected, expected)
    || !exactOwnKeys(matrix.observed, REPORT_NEGATIVE_OBSERVED_KEYS)
    || !exactOwnKeys(matrix.profile_controls, REPORT_NEGATIVE_PROFILE_CONTROL_KEYS)
    || !deepEqual(matrix.observed.names_by_category, expected.names_by_category)
    || !exactOwnKeys(matrix.observed.category_counts, Object.keys(DAY1_NEGATIVE_TEST_NAMES_BY_CATEGORY))
    || !Array.isArray(matrix.observed.tests)
    || matrix.observed.total !== expected.total
    || matrix.observed.passed !== expected.total
    || matrix.observed.failed !== 0
    || matrix.observed.name_digest !== expected.name_digest
    || !Object.values(matrix.profile_controls).every((value) => value === true)) return false;

  const expectedTests = Object.entries(DAY1_NEGATIVE_TEST_NAMES_BY_CATEGORY)
    .flatMap(([category, names]) => names.map((name) => ({ category, name, passed: true })))
    .sort((left, right) => codeUnitCompare(`${left.category}:${left.name}`, `${right.category}:${right.name}`));
  return deepEqual(matrix.observed.tests, expectedTests)
    && matrix.observed.tests.every((test) => exactOwnKeys(test, REPORT_NEGATIVE_TEST_KEYS))
    && Object.entries(DAY1_NEGATIVE_TEST_NAMES_BY_CATEGORY).every(([category, names]) => {
      const count = matrix.observed.category_counts[category];
      return exactOwnKeys(count, REPORT_NEGATIVE_CATEGORY_COUNT_KEYS)
        && count.total === names.length
        && count.passed === names.length
        && count.failed === 0;
    });
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
      const numericValue = Number(numberMatch[0]);
      if (!Number.isFinite(numericValue) || Object.is(numericValue, -0)) {
        numberFindings.push({
          source,
          pointer: jsonPointerForDiagnostic(trail),
          reason: !Number.isFinite(numericValue) ? "non_finite_JSON_number" : "negative_zero_JSON_number",
        });
      }
      index += numberMatch[0].length;
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
    duplicate_keys: duplicateKeys,
    number_findings: numberFindings,
    syntax_errors: syntaxErrors,
    valid: duplicateKeys.length === 0 && numberFindings.length === 0 && syntaxErrors.length === 0,
  };
}

function parseStrictJsonObject(raw, source) {
  const analysis = analyzeStrictJsonText(raw, source);
  if (!analysis.valid) return { ok: false, reason: "strict_JSON_rejected" };
  try {
    const value = JSON.parse(raw);
    if (value === null || Array.isArray(value) || typeof value !== "object") {
      return { ok: false, reason: "JSON_top_level_must_be_object" };
    }
    return { ok: true, value };
  } catch {
    return { ok: false, reason: "JSON_parse_rejected" };
  }
}

function parseStrictJsonArray(raw, source) {
  const analysis = analyzeStrictJsonText(raw, source);
  if (!analysis.valid) return { ok: false, reason: "strict_JSON_rejected" };
  try {
    const value = JSON.parse(raw);
    if (!Array.isArray(value)) return { ok: false, reason: "JSON_top_level_must_be_array" };
    return { ok: true, value };
  } catch {
    return { ok: false, reason: "JSON_parse_rejected" };
  }
}

function extractConstStringArray(source, name) {
  const expression = new RegExp(`export const ${name} = \\[([\\s\\S]*?)\\] as const;`);
  const match = source.match(expression);
  if (!match) throw new Error(`Unable to find ${name} in T3 contract`);
  return [...match[1].matchAll(/"([^"]+)"/g)].map((entry) => entry[1]);
}

function collectNullLeafPaths(value, prefix = [], destination = []) {
  if (value === null) {
    destination.push(prefix.join("."));
    return destination;
  }
  if (Array.isArray(value)) {
    value.forEach((child, index) => collectNullLeafPaths(child, [...prefix, String(index)], destination));
    return destination;
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) collectNullLeafPaths(child, [...prefix, key], destination);
  }
  return destination;
}

function graphDiagnostics(units, idKey) {
  const byId = new Map(units.map((unit) => [unit[idKey], unit]));
  const missingDependencies = [];
  const dependencyOrderErrors = [];
  const visiting = new Set();
  const visited = new Set();
  const cycles = [];

  for (const unit of units) {
    for (const dependency of unit.depends_on ?? []) {
      const dependencyUnit = byId.get(dependency);
      if (!dependencyUnit) missingDependencies.push(`${unit[idKey]} -> ${dependency}`);
      else if (Number.isFinite(unit.order) && Number.isFinite(dependencyUnit.order) && dependencyUnit.order >= unit.order) {
        dependencyOrderErrors.push(`${unit[idKey]} (${unit.order}) -> ${dependency} (${dependencyUnit.order})`);
      }
    }
  }

  function visit(id, trail) {
    if (visiting.has(id)) {
      cycles.push([...trail, id].join(" -> "));
      return;
    }
    if (visited.has(id) || !byId.has(id)) return;
    visiting.add(id);
    const unit = byId.get(id);
    for (const dependency of unit.depends_on ?? []) visit(dependency, [...trail, id]);
    visiting.delete(id);
    visited.add(id);
  }

  for (const id of byId.keys()) visit(id, []);
  return { missingDependencies, dependencyOrderErrors, cycles };
}

function hasDependencyPath(units, idKey, startId, targetId, visited = new Set()) {
  if (startId === targetId) return true;
  if (visited.has(startId)) return false;
  visited.add(startId);
  const byId = new Map(units.map((unit) => [unit[idKey], unit]));
  const unit = byId.get(startId);
  return (unit?.depends_on ?? []).some((dependency) => dependency === targetId
    || hasDependencyPath(units, idKey, dependency, targetId, visited));
}

function stronglyConnectedComponents(keys, edges) {
  const adjacency = new Map(keys.map((key) => [key, []]));
  for (const [source, target] of edges) adjacency.get(source)?.push(target);
  let nextIndex = 0;
  const stack = [];
  const onStack = new Set();
  const indexByKey = new Map();
  const lowLinkByKey = new Map();
  const components = [];

  function visit(key) {
    indexByKey.set(key, nextIndex);
    lowLinkByKey.set(key, nextIndex);
    nextIndex += 1;
    stack.push(key);
    onStack.add(key);

    for (const target of adjacency.get(key) ?? []) {
      if (!indexByKey.has(target)) {
        visit(target);
        lowLinkByKey.set(key, Math.min(lowLinkByKey.get(key), lowLinkByKey.get(target)));
      } else if (onStack.has(target)) {
        lowLinkByKey.set(key, Math.min(lowLinkByKey.get(key), indexByKey.get(target)));
      }
    }

    if (lowLinkByKey.get(key) === indexByKey.get(key)) {
      const component = [];
      let member;
      do {
        member = stack.pop();
        onStack.delete(member);
        component.push(member);
      } while (member !== key);
      components.push(sorted(component));
    }
  }

  for (const key of keys) if (!indexByKey.has(key)) visit(key);
  return components;
}

function collectResultRecordIssues(record, allowedResults) {
  const issues = [];
  if (record.execution_status === "not_tested") {
    if (record.result !== null || record.evidence !== null) issues.push("not_tested_record_non_null");
    return issues;
  }
  if (record.execution_status === "blocked") {
    if (record.result !== null || record.evidence === null || typeof record.evidence !== "object" || Array.isArray(record.evidence)) issues.push("blocked_record_invalid");
    return issues;
  }
  if (record.execution_status !== "completed") return ["execution_status_invalid"];
  const runtimeFields = ["actual_action", "actual_time", "executor", "account_role", "cleanup_result", "verifier"];
  if (!allowedResults.includes(record.result)
    || record.evidence === null
    || runtimeFields.some((field) => record[field] === null || record[field] === "")) issues.push("completed_record_incomplete");
  return issues;
}

const DAY1_EVIDENCE_OUTER_KEYS = Object.freeze(["indexes", "r10_subchecks"]);
const DAY1_EVIDENCE_ENTRY_KEYS = Object.freeze(["evidence_id", "observed_at", "actor_role", "redacted_storage_slot", "capture_phases", "redaction_checked"]);
const DAY1_GENERIC_CAPTURE_PHASES = Object.freeze(["before_action", "after_boundary", "failure"]);
const DAY1_P03_CAPTURE_PHASES = Object.freeze(["prebuild_gate", "postbuild_five_view_direct_table_recheck"]);
const DAY1_ALL_CAPTURE_PHASES = Object.freeze([...DAY1_GENERIC_CAPTURE_PHASES, ...DAY1_P03_CAPTURE_PHASES]);
const DAY1_P03_PHASE_RUNTIME_KEYS = Object.freeze(["execution_status", "result", "evidence_index", "actual_action", "actual_result", "actual_time"]);
const DAY1_P03_PREBUILD_PHASE_RUNTIME_KEYS = Object.freeze([...DAY1_P03_PHASE_RUNTIME_KEYS, "actual_prebuild_proof"]);
const DAY1_P03_PREBUILD_VISIBILITY_SAFETY_KEYS = Object.freeze([
  "non_isolated_views_hidden", "non_target_records_hidden", "direct_table_access_denied",
  "raw_json_hidden", "management_configuration_hidden",
]);
const DAY1_P03_PREBUILD_PROOF_KEYS = Object.freeze([
  "data_scope", "fixture_marker", "test_scope", "enterprise_data_used", "actor_class",
  "actor_distinct_from_owner_verified", "owner_privileges_absent", "administrator_privileges_absent",
  "independent_session_verified", "allowed_isolated_view_open_attempted", "allowed_isolated_view_opened",
  ...DAY1_P03_PREBUILD_VISIBILITY_SAFETY_KEYS,
  "protected_mutation_attempted", "protected_mutation_rejected", "unauthorized_business_write_count",
  "business_state_unchanged", "temporary_access_revoked", "cleanup_reverified",
]);
const DAY1_EXPECTED_P03_PREBUILD_PROOF_CONTRACT = Object.freeze({
  field: "actual_prebuild_proof",
  exact_keys: DAY1_P03_PREBUILD_PROOF_KEYS,
  static_identity: Object.freeze({
    data_scope: "synthetic_experiment",
    fixture_marker: "SYN-PERMISSION-TEST",
    test_scope: "isolated_temporary_base",
    enterprise_data_used: false,
    actor_class: "ordinary_non_owner",
  }),
  not_tested_rule: "actual_prebuild_proof_must_be_null",
  blocked_rule: "actual_prebuild_proof_must_be_null; partial_attempt_facts_remain_only_in_actual_action_actual_result_and_canonical_evidence",
  completed_common_rule: "exact_22_key_full_observation; actor_distinct_from_owner_verified_owner_and_administrator_privileges_absent_independent_session_verified_allowed_view_open_attempted_temporary_access_revoked_cleanup_reverified_true; unauthorized_business_write_count_nonnegative_integer; protected_mutation_attempted_and_protected_mutation_rejected_are_false_when_allowed_view_is_not_opened_or_any_of_the_five_visibility_boundaries_is_false; protected_mutation_attempted_is_true_only_when_allowed_view_is_opened_and_all_five_visibility_boundaries_are_true",
  deterministic_result_classification: Object.freeze({
    可用: "allowed_view_opened_all_five_visibility_boundaries_safe_protected_mutation_attempted_and_rejected_zero_unauthorized_business_writes_and_business_state_unchanged",
    受限: "same_full_safe_boundary_as_available_with_a_separately_recorded_non_hard_limitation; parent_limitations_non_empty_and_fallback_verified_true",
    不可用: "lawful_complete_synthetic_isolated_test_but_allowed_view_not_opened_or_any_visibility_boundary_unsafe_or_attempted_protected_mutation_not_rejected_or_unauthorized_business_write_count_positive_or_business_state_changed; mutation_is_skipped_with_attempted_and_rejected_false_when_view_open_or_visibility_precondition_is_unsafe; parent_limitations_non_empty_and_fallback_verified_true",
  }),
  parent_state_rule: "prebuild_not_tested_keeps_parent_not_tested_null; any_prebuild_attempt_or_completion_keeps_parent_blocked_null_until_postbuild_completed",
  phase_evidence_binding_rule: "phase_indexes_canonical_deep_equal_parent_indexes_filtered_by_capture_phase_in_same_order_with_unique_evidence_id",
});
const DAY1_P03_VIEW_KEYS = Object.freeze(["feedback_inbox", "case_cockpit", "sla_board", "issue_map", "improvement_tracking"]);
const DAY1_P03_COMPLETED_SUBCHECK_KEYS = Object.freeze(["P03-R10-raw-recurrence-visibility", "P03-R10-attestation-lifecycle-and-recheck"]);
const DAY1_P02_COMPLETED_SUBCHECK_KEYS = Object.freeze(["P02-R10-selector-cardinality", "P02-R10-execution-mode", "P02-R10-attestation-base-component"]);
const DAY1_P03_VIEW_RESULT_KEYS = Object.freeze(["view_key", "opened", "refreshed", "allowed_action_verified", "raw_recurrence_records_visible"]);
const DAY1_P03_DIRECT_TABLE_KEYS = Object.freeze(["attempted", "access_allowed", "refreshed", "raw_recurrence_records_visible", "administrator_fields_visible"]);
const DAY1_P03_FIVE_VIEWS_RESULT_KEYS = Object.freeze(["views", "relogin_completed", "refresh_boundary_stable", "unauthorized_W6_action_rejected", "protected_field_mutation_rejected", "administrator_configuration_hidden"]);
const DAY1_P03_SOURCE_VISIBILITY_KEYS = Object.freeze(["day_7_result_readable", "day_30_result_readable", "human_conclusion_readable", "raw_recurrence_records_visible", "no_broader_than_source_field_intersection"]);
const DAY1_P03_PROOF_ROOT_KEYS = Object.freeze([
  "probe_ref", "normalized_existing_evidence_unit_ref", "creates_new_evidence_unit",
  "actual_all_five_business_views_result", "actual_direct_clusters_table_result",
  "actual_recurrence_visibility_no_broader_than_source_fields_result", "attestation_id_digest",
  "capability_attestation_sha256", "permission_snapshot_sha256", "permission_revision", "issued_at", "expires_at",
  "capability_checked_at", "capability_rechecked_at", "actual_prewrite_recheck_result", "actual_drift_or_expiry_injection_result",
]);
const DAY1_P03_PREWRITE_KEYS = Object.freeze(["permission_snapshot_matches", "permission_revision_matches", "attestation_unexpired", "rechecked_before_write"]);
const DAY1_P03_DRIFT_KEYS = Object.freeze(["permission_drift_rejected", "expiry_rejected", "zero_writes"]);
const DAY1_EXPECTED_DECLARED_P03_PROOF_ROOT_KEYS = Object.freeze([
  "probe_ref", "normalized_existing_evidence_unit_ref", "creates_new_evidence_unit",
  "actual_all_five_business_views_result", "actual_direct_clusters_table_result",
  "actual_recurrence_visibility_no_broader_than_source_fields_result", "attestation_id_digest",
  "capability_attestation_sha256", "permission_snapshot_sha256", "permission_revision", "issued_at", "expires_at",
  "capability_checked_at", "capability_rechecked_at", "actual_prewrite_recheck_result", "actual_drift_or_expiry_injection_result",
]);
const DAY1_EXPECTED_DECLARED_P03_PROOF_STATIC_IDENTITY = Object.freeze({
  probe_ref: "P03", normalized_existing_evidence_unit_ref: "P02+P03", creates_new_evidence_unit: false,
});
const DAY1_EXPECTED_DECLARED_P03_CLASSIFICATION = Object.freeze({
  可用: "all_5_views_usable_and_every_security_boundary_relogin_refresh_prewrite_and_drift_zero_write_check_has_the_safe_value",
  受限: "hardSafety_and_drift_zero_write_pass_and_either_1_to_4_views_are_usable_or_all_5_views_are_usable_but_normal_prewrite_attestation_revision_unexpired_or_rechecked_is_fail_closed; limitations_non_empty_and_fallback_verified_true",
  不可用: "0_views_usable_or_any_security_boundary_failure_leak_or_drift_zero_write_failure; all_observation_slots_still_complete; limitations_non_empty_and_fallback_verified_true",
});
const DAY1_EXPECTED_DECLARED_P03_EVIDENCE_METADATA_STATE = Object.freeze({
  not_tested: { evidence_presence: "待填", redaction_status: "待填" },
  blocked_or_completed: { evidence_presence: "已记录", redaction_status: "已复核" },
});

function day1ExpectedChineseStatus(record) {
  if (record?.execution_status === "not_tested" && record.result === null) return "未测试";
  if (record?.execution_status === "blocked" && record.result === null) return "已阻塞";
  if (record?.execution_status === "completed" && ["可用", "受限", "不可用"].includes(record.result)) return record.result;
  return null;
}

function day1P03CompletedSubchecksIssues(value, parentIndexes = []) {
  const issues = [];
  if (!exactOwnKeys(value, DAY1_P03_COMPLETED_SUBCHECK_KEYS)) return ["P03_completed_r10_subchecks_exact_keys"];
  for (const key of DAY1_P03_COMPLETED_SUBCHECK_KEYS) {
    const refs = value[key];
    if (!Array.isArray(refs) || refs.length === 0
      || refs.some((ref) => typeof ref !== "string" || !/^T2-EV-P03-\d{8}-\d{4}-\d{2}$/.test(ref))
      || new Set(refs).size !== refs.length || !deepEqual(refs, [...refs].sort(codeUnitCompare))) {
      issues.push(`P03_completed_${key}_evidence_refs`);
      continue;
    }
    for (const ref of refs) {
      const matches = parentIndexes.filter((entry) => entry?.evidence_id === ref);
      if (matches.length !== 1 || !matches[0].capture_phases.includes("postbuild_five_view_direct_table_recheck")) issues.push(`P03_completed_${key}_parent_binding`);
    }
  }
  return issues;
}

function makeDay1P03CompletedSubchecks(evidenceId) {
  return {
    "P03-R10-raw-recurrence-visibility": [evidenceId],
    "P03-R10-attestation-lifecycle-and-recheck": [evidenceId],
  };
}

function day1P02CompletedSubchecksIssues(value, parentIndexes = []) {
  const issues = [];
  if (!exactOwnKeys(value, DAY1_P02_COMPLETED_SUBCHECK_KEYS)) return ["P02_r10_subchecks_exact_keys"];
  for (const key of DAY1_P02_COMPLETED_SUBCHECK_KEYS) {
    const refs = value[key];
    if (!Array.isArray(refs) || refs.length === 0
      || refs.some((ref) => typeof ref !== "string" || !/^T2-EV-P02-\d{8}-\d{4}-\d{2}$/.test(ref))
      || new Set(refs).size !== refs.length || !deepEqual(refs, [...refs].sort(codeUnitCompare))) {
      issues.push(`P02_${key}_evidence_refs`);
      continue;
    }
    for (const ref of refs) if (parentIndexes.filter((entry) => entry?.evidence_id === ref).length !== 1) issues.push(`P02_${key}_parent_binding`);
  }
  return issues;
}

function makeDay1P02CompletedSubchecks(evidenceId) {
  return {
    "P02-R10-selector-cardinality": [evidenceId],
    "P02-R10-execution-mode": [evidenceId],
    "P02-R10-attestation-base-component": [evidenceId],
  };
}

function day1P03CompletedOnsiteMachineResultIssues(onsiteRecord, p02Record, p02OnsiteRecord, parentRecord) {
  const issues = [];
  const proof = onsiteRecord?.r10_recurrence_visibility_and_attestation_evidence_contract;
  if (!exactOwnKeys(proof, DAY1_P03_PROOF_ROOT_KEYS)) return ["P03_completed_proof_root_exact_keys"];
  if (proof.probe_ref !== "P03") issues.push("P03_completed_proof_root_probe_ref");
  if (proof.normalized_existing_evidence_unit_ref !== "P02+P03") issues.push("P03_completed_proof_root_evidence_unit_ref");
  if (proof.creates_new_evidence_unit !== false) issues.push("P03_completed_proof_root_creates_new_evidence_unit");
  const views = proof?.actual_all_five_business_views_result;
  if (!exactOwnKeys(views, DAY1_P03_FIVE_VIEWS_RESULT_KEYS)
    || !Array.isArray(views.views) || views.views.length !== DAY1_P03_VIEW_KEYS.length
    || !deepEqual(views.views.map((row) => row?.view_key), DAY1_P03_VIEW_KEYS)
    || ["relogin_completed", "refresh_boundary_stable", "unauthorized_W6_action_rejected", "protected_field_mutation_rejected", "administrator_configuration_hidden"].some((key) => typeof views[key] !== "boolean")) issues.push("P03_completed_five_views_and_boundary_machine_result");
  for (const [index, row] of (Array.isArray(views?.views) ? views.views : []).entries()) {
    if (!exactOwnKeys(row, DAY1_P03_VIEW_RESULT_KEYS) || row.view_key !== DAY1_P03_VIEW_KEYS[index]
      || [row.opened, row.refreshed, row.allowed_action_verified, row.raw_recurrence_records_visible].some((value) => typeof value !== "boolean")) issues.push(`P03_completed_view_${index}_machine_result`);
  }
  const direct = proof?.actual_direct_clusters_table_result;
  if (!exactOwnKeys(direct, DAY1_P03_DIRECT_TABLE_KEYS) || direct.attempted !== true || typeof direct.access_allowed !== "boolean"
    || typeof direct.raw_recurrence_records_visible !== "boolean" || typeof direct.administrator_fields_visible !== "boolean"
    || (direct.access_allowed === true ? direct.refreshed !== true : direct.refreshed !== null)) issues.push("P03_completed_direct_clusters_table_machine_result");
  const visibility = proof?.actual_recurrence_visibility_no_broader_than_source_fields_result;
  if (!exactOwnKeys(visibility, DAY1_P03_SOURCE_VISIBILITY_KEYS)
    || ![visibility.day_7_result_readable, visibility.day_30_result_readable, visibility.human_conclusion_readable].every((flag) => typeof flag === "boolean")
    || [visibility.raw_recurrence_records_visible, visibility.no_broader_than_source_field_intersection].some((flag) => typeof flag !== "boolean")) issues.push("P03_completed_source_visibility_intersection_machine_result");
  for (const key of ["attestation_id_digest", "capability_attestation_sha256", "permission_snapshot_sha256"]) {
    if (typeof proof?.[key] !== "string" || !/^[a-f0-9]{64}$/.test(proof[key])) issues.push(`P03_completed_${key}`);
  }
  if (typeof proof?.permission_revision !== "string" || proof.permission_revision.length === 0) issues.push("P03_completed_permission_revision");
  for (const key of ["issued_at", "expires_at", "capability_checked_at", "capability_rechecked_at"]) if (!isIsoTimestampWithTimezone(proof?.[key])) issues.push(`P03_completed_${key}`);
  if ([proof?.issued_at, proof?.capability_checked_at, proof?.capability_rechecked_at, proof?.expires_at].every(isIsoTimestampWithTimezone)
    && !(Date.parse(proof.issued_at) <= Date.parse(proof.capability_checked_at)
      && Date.parse(proof.capability_checked_at) <= Date.parse(proof.capability_rechecked_at)
      && Date.parse(proof.capability_rechecked_at) < Date.parse(proof.expires_at))) issues.push("P03_completed_attestation_time_order");
  if (!exactOwnKeys(proof?.actual_prewrite_recheck_result, DAY1_P03_PREWRITE_KEYS)
    || Object.values(proof.actual_prewrite_recheck_result).some((value) => typeof value !== "boolean")) issues.push("P03_completed_prewrite_recheck_machine_result");
  if (!exactOwnKeys(proof?.actual_drift_or_expiry_injection_result, DAY1_P03_DRIFT_KEYS)
    || Object.values(proof.actual_drift_or_expiry_injection_result).some((value) => typeof value !== "boolean")) issues.push("P03_completed_drift_or_expiry_machine_result");
  const p02Proof = p02OnsiteRecord?.r10_selector_and_execution_mode_evidence_contract;
  if (p02Record?.execution_status !== "completed") issues.push("P03_completed_requires_P02_completed");
  if (typeof p02Proof?.permission_snapshot_sha256 !== "string" || p02Proof.permission_snapshot_sha256.length === 0) issues.push("P03_completed_P02_permission_snapshot_missing");
  else if (proof?.permission_snapshot_sha256 !== p02Proof.permission_snapshot_sha256) issues.push("P03_completed_P02_permission_snapshot_mismatch");
  if (typeof p02Proof?.permission_revision !== "string" || p02Proof.permission_revision.length === 0) issues.push("P03_completed_P02_permission_revision_missing");
  else if (proof?.permission_revision !== p02Proof.permission_revision) issues.push("P03_completed_P02_permission_revision_mismatch");
  const viewRows = Array.isArray(views?.views) ? views.views : [];
  const usableViews = viewRows.filter((row) => row?.opened === true && row.refreshed === true && row.allowed_action_verified === true).length;
  const hardSafety = viewRows.length === 5
    && viewRows.every((row) => row?.raw_recurrence_records_visible === false)
    && [views?.relogin_completed, views?.refresh_boundary_stable, views?.unauthorized_W6_action_rejected,
      views?.protected_field_mutation_rejected, views?.administrator_configuration_hidden].every((value) => value === true)
    && direct?.raw_recurrence_records_visible === false && direct?.administrator_fields_visible === false
    && visibility?.raw_recurrence_records_visible === false && visibility?.no_broader_than_source_field_intersection === true
    && DAY1_P03_DRIFT_KEYS.every((key) => proof.actual_drift_or_expiry_injection_result?.[key] === true);
  const prewriteAllPass = DAY1_P03_PREWRITE_KEYS.every((key) => proof.actual_prewrite_recheck_result?.[key] === true);
  const classifiedResult = !hardSafety || usableViews === 0 ? "不可用" : usableViews === 5 && prewriteAllPass ? "可用" : "受限";
  if (parentRecord?.result !== classifiedResult) issues.push("P03_completed_result_classification");
  return issues;
}

function isIsoTimestampWithTimezone(value) {
  return typeof value === "string"
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
    && !Number.isNaN(Date.parse(value));
}

function structuredEvidenceIssues(value, unitId, allowNull = false) {
  const issues = [];
  if (value === null) return allowNull ? issues : ["evidence_index_null"];
  if (!exactOwnKeys(value, DAY1_EVIDENCE_OUTER_KEYS)) return ["evidence_outer_exact_keys"];
  if (!Array.isArray(value.indexes) || value.indexes.length === 0) issues.push("evidence_indexes_non_empty");
  for (const [index, entry] of (Array.isArray(value.indexes) ? value.indexes : []).entries()) {
    if (!exactOwnKeys(entry, DAY1_EVIDENCE_ENTRY_KEYS)) {
      issues.push(`evidence_entry_${index}_exact_keys`);
      continue;
    }
    if (!/^T2-EV-P\d{2}-\d{8}-\d{4}-\d{2}$/.test(entry.evidence_id)) issues.push(`evidence_entry_${index}_id`);
    if (!isIsoTimestampWithTimezone(entry.observed_at)) issues.push(`evidence_entry_${index}_time`);
    if (typeof entry.actor_role !== "string" || entry.actor_role.length === 0) issues.push(`evidence_entry_${index}_actor`);
    if (typeof entry.redacted_storage_slot !== "string" || entry.redacted_storage_slot.length === 0
      || /[\\/]/.test(entry.redacted_storage_slot) || /^[a-z][a-z0-9+.-]*:/i.test(entry.redacted_storage_slot)
      || /(?:app|tbl|rec|view|fld)[A-Za-z0-9_-]{8,}/.test(entry.redacted_storage_slot)) issues.push(`evidence_entry_${index}_storage`);
    const allowedCapturePhases = unitId === "P03" ? DAY1_ALL_CAPTURE_PHASES : DAY1_GENERIC_CAPTURE_PHASES;
    if (!Array.isArray(entry.capture_phases) || entry.capture_phases.length === 0
      || entry.capture_phases.some((phase) => !allowedCapturePhases.includes(phase))) issues.push(`evidence_entry_${index}_capture_phases`);
    if (entry.redaction_checked !== true) issues.push(`evidence_entry_${index}_redaction`);
  }
  if (!["P02", "P03"].includes(unitId) && value.r10_subchecks !== null) issues.push("r10_subchecks_applicability");
  if (["P02", "P03"].includes(unitId) && value.r10_subchecks !== null
    && (typeof value.r10_subchecks !== "object" || Array.isArray(value.r10_subchecks))) issues.push("r10_subchecks_outer_shape");
  if (unitId === "P02" && value.r10_subchecks !== null) issues.push(...day1P02CompletedSubchecksIssues(value.r10_subchecks, value.indexes));
  if (unitId === "P03" && value.r10_subchecks !== null) issues.push(...day1P03CompletedSubchecksIssues(value.r10_subchecks, value.indexes));
  return issues;
}

function permissionResultRecordIssues(record, onsiteRecord, allowedResults) {
  const issues = [];
  if (!exactOwnKeys(record, PERMISSION_RESULT_EXACT_FIELDS)) issues.push("exact_fields");
  if (typeof record?.unit_id !== "string" || !/^P(?:0[1-9]|1[0-3])$/.test(record.unit_id)) issues.push("unit_id");
  for (const field of ["name", "probe_ref", "evidence_unit_ref", "expected_result_ref", "fallback_path"]) {
    if (typeof record?.[field] !== "string" || record[field].length === 0) issues.push(`static_string:${field}`);
  }
  const unitId = record?.unit_id;
  const unitIndex = /^P(?:0[1-9]|1[0-3])$/.test(unitId ?? "") ? Number(unitId.slice(1)) - 1 : -1;
  if (unitIndex >= 0 && (record.probe_ref !== `../manifests/day-1-probe-suite.v0.1.json#/probes/${unitIndex}`
    || record.evidence_unit_ref !== `./on-site-evidence-template.json#/permission_checks/${unitIndex}`
    || record.expected_result_ref !== `../manifests/day-1-probe-suite.v0.1.json#/probes/${unitIndex}/expected_result`
    || record.fallback_path !== `../manifests/day-1-probe-suite.v0.1.json#/probes/${unitIndex}/fallback_path`)) issues.push("static_reference_binding");
  if (record?.evidence_index !== null) issues.push(...structuredEvidenceIssues(record.evidence_index, unitId));
  const evidenceBound = record?.evidence_index !== null
    && record?.evidence !== null
    && onsiteRecord?.structured_evidence_index !== null
    && canonicalJson(record.evidence_index) === canonicalJson(record.evidence)
    && canonicalJson(record.evidence_index) === canonicalJson(onsiteRecord.structured_evidence_index);
  const runtimeFields = ["preconditions_observed", "actual_action", "actual_result", "actual_time", "executor", "account_role", "limitations", "fallback_verified", "cleanup_result", "verifier"];
  if (record?.execution_status === "not_tested") {
    if (record.result !== null || record.evidence !== null || record.evidence_index !== null
      || runtimeFields.some((field) => record[field] !== null)
      || onsiteRecord?.structured_evidence_index !== null) issues.push("not_tested_shape");
  } else if (record?.execution_status === "blocked") {
    if (record.result !== null || !evidenceBound || !Array.isArray(record.preconditions_observed) || record.preconditions_observed.length === 0
      || [record.actual_action, record.actual_result, record.executor, record.account_role, record.limitations, record.cleanup_result, record.verifier].some((value) => typeof value !== "string" || value.length === 0)
      || !isIsoTimestampWithTimezone(record.actual_time) || typeof record.fallback_verified !== "boolean") issues.push("blocked_shape");
  } else if (record?.execution_status === "completed") {
    if (!allowedResults.includes(record.result) || !evidenceBound
      || !Array.isArray(record.preconditions_observed) || record.preconditions_observed.length === 0
      || [record.actual_action, record.actual_result, record.executor, record.account_role, record.cleanup_result, record.verifier].some((value) => typeof value !== "string" || value.length === 0)
      || !isIsoTimestampWithTimezone(record.actual_time) || typeof record.fallback_verified !== "boolean"
      || (["受限", "不可用"].includes(record.result) && (!(typeof record.limitations === "string" && record.limitations.length > 0) || record.fallback_verified !== true))) issues.push("completed_shape");
    if (["P02", "P03"].includes(unitId) && record.evidence_index?.r10_subchecks === null) issues.push("completed_r10_subchecks_required");
  } else {
    issues.push("execution_status");
  }
  return issues;
}

function day1P03PrebuildProofIssues(phase, parent) {
  const issues = [];
  const proof = phase?.actual_prebuild_proof;
  if (phase?.execution_status === "not_tested") {
    if (proof !== null) issues.push("prebuild_gate:actual_prebuild_proof_not_tested_null");
    return issues;
  }
  if (phase?.execution_status === "blocked") {
    if (proof !== null) issues.push("prebuild_gate:actual_prebuild_proof_blocked_null");
    return issues;
  }
  if (proof === null) {
    issues.push("prebuild_gate:actual_prebuild_proof_exact_keys");
    return issues;
  }
  if (!exactOwnKeys(proof, DAY1_P03_PREBUILD_PROOF_KEYS)) return ["prebuild_gate:actual_prebuild_proof_exact_keys"];
  for (const [key, expected] of Object.entries(DAY1_EXPECTED_P03_PREBUILD_PROOF_CONTRACT.static_identity)) {
    if (proof[key] !== expected) issues.push(`prebuild_gate:actual_prebuild_proof_${key}`);
  }
  const booleanKeys = [
    "actor_distinct_from_owner_verified", "owner_privileges_absent", "administrator_privileges_absent",
    "independent_session_verified", "allowed_isolated_view_open_attempted", "allowed_isolated_view_opened",
    ...DAY1_P03_PREBUILD_VISIBILITY_SAFETY_KEYS,
    "protected_mutation_attempted", "protected_mutation_rejected", "business_state_unchanged",
    "temporary_access_revoked", "cleanup_reverified",
  ];
  for (const key of booleanKeys) {
    if (typeof proof[key] !== "boolean") issues.push(`prebuild_gate:actual_prebuild_proof_${key}_type`);
  }
  if (!Number.isSafeInteger(proof.unauthorized_business_write_count)) {
    issues.push("prebuild_gate:actual_prebuild_proof_unauthorized_business_write_count_type");
  } else if (proof.unauthorized_business_write_count < 0) {
    issues.push("prebuild_gate:actual_prebuild_proof_unauthorized_business_write_count_nonnegative");
  }
  if (issues.some((issue) => issue.endsWith("_type")
    || issue === "prebuild_gate:actual_prebuild_proof_unauthorized_business_write_count_nonnegative")) return issues;
  const completionRequirements = {
    actor_distinct_from_owner_verified: true,
    owner_privileges_absent: true,
    administrator_privileges_absent: true,
    independent_session_verified: true,
    allowed_isolated_view_open_attempted: true,
    temporary_access_revoked: true,
    cleanup_reverified: true,
  };
  for (const [key, expected] of Object.entries(completionRequirements)) {
    if (proof[key] !== expected) issues.push(`prebuild_gate:actual_prebuild_proof_${key}`);
  }
  const visibilitySafe = DAY1_P03_PREBUILD_VISIBILITY_SAFETY_KEYS.every((key) => proof[key] === true);
  const mutationPermitted = proof.allowed_isolated_view_opened === true && visibilitySafe;
  if (mutationPermitted) {
    if (proof.protected_mutation_attempted !== true) issues.push("prebuild_gate:actual_prebuild_proof_protected_mutation_attempted");
  } else if (proof.protected_mutation_attempted !== false || proof.protected_mutation_rejected !== false) {
    issues.push("prebuild_gate:actual_prebuild_proof_mutation_gate");
  }
  const safeBoundary = mutationPermitted
    && proof.protected_mutation_attempted === true
    && proof.protected_mutation_rejected === true
    && proof.unauthorized_business_write_count === 0
    && proof.business_state_unchanged === true;
  if (safeBoundary ? !["可用", "受限"].includes(phase.result) : phase.result !== "不可用") {
    issues.push("prebuild_gate:actual_prebuild_proof_result_classification");
  }
  if (["受限", "不可用"].includes(phase.result)
    && (!(typeof parent?.limitations === "string" && parent.limitations.length > 0) || parent.fallback_verified !== true)) {
    issues.push("prebuild_gate:actual_prebuild_proof_limited_result_fallback");
  }
  return issues;
}

function p03PhaseContractIssues(parent, onsiteRecord, allowedResults) {
  const issues = [];
  const phases = onsiteRecord?.p03_phase_observations;
  const phaseKeys = ["prebuild_gate", "postbuild_five_view_direct_table_recheck"];
  if (!exactOwnKeys(phases, phaseKeys)) return ["P03_phase_outer_shape"];
  for (const phaseKey of phaseKeys) {
    const phase = phases[phaseKey];
    const phaseRuntimeKeys = phaseKey === "prebuild_gate" ? DAY1_P03_PREBUILD_PHASE_RUNTIME_KEYS : DAY1_P03_PHASE_RUNTIME_KEYS;
    if (!exactOwnKeys(phase, phaseRuntimeKeys)) {
      issues.push(`${phaseKey}:exact_fields`);
      continue;
    }
    if (phase.execution_status === "not_tested") {
      if (![phase.result, phase.evidence_index, phase.actual_action, phase.actual_result, phase.actual_time].every((value) => value === null)) issues.push(`${phaseKey}:not_tested_shape`);
    } else if (["blocked", "completed"].includes(phase.execution_status)) {
      if ((phase.execution_status === "blocked" ? phase.result !== null : !allowedResults.includes(phase.result))
        || structuredEvidenceIssues(phase.evidence_index, "P03").length > 0
        || phase.evidence_index?.r10_subchecks !== null
        || [phase.actual_action, phase.actual_result].some((value) => typeof value !== "string" || value.length === 0)
        || !isIsoTimestampWithTimezone(phase.actual_time)) issues.push(`${phaseKey}:observed_shape`);
      for (const phaseEntry of phase.evidence_index?.indexes ?? []) {
        const matches = (parent.evidence_index?.indexes ?? []).filter((entry) => entry.evidence_id === phaseEntry.evidence_id);
        if (matches.length !== 1) issues.push(`${phaseKey}:parent_identity_cardinality`);
        else if (!matches[0].capture_phases.includes(phaseKey)) issues.push(`${phaseKey}:parent_capture_phase`);
      }
      const parentIndexes = parent.evidence_index?.indexes ?? [];
      const phaseIndexes = phase.evidence_index?.indexes ?? [];
      const filteredParentIndexes = parentIndexes.filter((entry) => entry?.capture_phases?.includes(phaseKey));
      const parentIds = parentIndexes.map((entry) => entry?.evidence_id);
      const phaseIds = phaseIndexes.map((entry) => entry?.evidence_id);
      if (new Set(parentIds).size !== parentIds.length || new Set(phaseIds).size !== phaseIds.length
        || !deepEqual(phaseIndexes, filteredParentIndexes)) issues.push(`${phaseKey}:parent_filtered_deep_binding`);
    } else issues.push(`${phaseKey}:execution_status`);
    if (phaseKey === "prebuild_gate") issues.push(...day1P03PrebuildProofIssues(phase, parent));
  }
  const preStarted = phases.prebuild_gate.execution_status !== "not_tested";
  const postStarted = phases.postbuild_five_view_direct_table_recheck.execution_status !== "not_tested";
  const bothCompleted = phaseKeys.every((key) => phases[key].execution_status === "completed");
  if (bothCompleted && phases.postbuild_five_view_direct_table_recheck.result !== parent.result) issues.push("P03_completed_postbuild_parent_result_mismatch");
  if (bothCompleted) issues.push(...day1P03CompletedSubchecksIssues(parent.evidence_index?.r10_subchecks, parent.evidence_index?.indexes));
  if (postStarted && phases.prebuild_gate.execution_status !== "completed") issues.push("P03_postbuild_requires_completed_prebuild");
  if (postStarted && phases.prebuild_gate.result === "不可用") issues.push("P03_prebuild_unavailable_forbids_postbuild");
  if (postStarted && phases.prebuild_gate.result === "受限"
    && (!(typeof parent.limitations === "string" && parent.limitations.length > 0) || parent.fallback_verified !== true)) {
    issues.push("P03_prebuild_restricted_requires_safe_fallback");
  }
  if (isIsoTimestampWithTimezone(phases.prebuild_gate.actual_time)
    && isIsoTimestampWithTimezone(phases.postbuild_five_view_direct_table_recheck.actual_time)
    && Date.parse(phases.prebuild_gate.actual_time) > Date.parse(phases.postbuild_five_view_direct_table_recheck.actual_time)) {
    issues.push("P03_prebuild_time_after_postbuild_time");
  }
  if (!preStarted && !postStarted && !(parent.execution_status === "not_tested" && parent.result === null && parent.evidence_index === null)) issues.push("P03_parent_prebuild_unstarted");
  if (preStarted && !bothCompleted && !(parent.execution_status === "blocked" && parent.result === null && parent.evidence_index !== null)) issues.push("P03_parent_incomplete");
  if (bothCompleted && !(parent.execution_status === "completed" && allowedResults.includes(parent.result) && parent.evidence_index !== null)) issues.push("P03_parent_completed");
  return issues;
}

function day1PermissionArtifactIssues(candidate, allowedResults) {
  const issues = [];
  const records = candidate.resultTemplate.permission_probes;
  const onsite = candidate.evidenceTemplate.permission_checks;
  const p03PhaseContract = candidate.resultTemplate.result_record_contract?.p03_phase_contract;
  const p03MachineContract = p03PhaseContract?.completed_on_site_machine_result_contract;
  const probeEvidenceBinding = candidate.probeSuite.status_contract?.canonical_evidence_binding_contract;
  const resultEvidenceContract = candidate.resultTemplate.result_record_contract?.evidence_index_contract;
  const templateEvidenceContract = candidate.evidenceTemplate.permission_evidence_index_contract;
  if (!deepEqual(p03MachineContract?.proof_root_exact_keys, DAY1_EXPECTED_DECLARED_P03_PROOF_ROOT_KEYS)) {
    issues.push("P03_contract_declaration_proof_root_exact_keys");
  }
  if (!deepEqual(p03MachineContract?.proof_root_static_identity, DAY1_EXPECTED_DECLARED_P03_PROOF_STATIC_IDENTITY)) {
    issues.push("P03_contract_declaration_proof_root_static_identity");
  }
  if (!deepEqual(p03MachineContract?.deterministic_result_classification, DAY1_EXPECTED_DECLARED_P03_CLASSIFICATION)) {
    issues.push("P03_contract_declaration_deterministic_result_classification");
  }
  if (!deepEqual(p03PhaseContract?.evidence_metadata_state_contract, DAY1_EXPECTED_DECLARED_P03_EVIDENCE_METADATA_STATE)) {
    issues.push("P03_contract_declaration_evidence_metadata_state_contract");
  }
  if (!deepEqual(p03PhaseContract?.prebuild_proof_contract, DAY1_EXPECTED_P03_PREBUILD_PROOF_CONTRACT)) {
    issues.push("P03_contract_declaration_prebuild_proof_contract");
  }
  if (!deepEqual(probeEvidenceBinding?.capture_phases_allowed, DAY1_ALL_CAPTURE_PHASES)
    || !deepEqual(probeEvidenceBinding?.non_P03_capture_phases_allowed, DAY1_GENERIC_CAPTURE_PHASES)) {
    issues.push("capture_phase_declaration_probe_suite");
  }
  if (!deepEqual(resultEvidenceContract?.capture_phases_allowed, DAY1_ALL_CAPTURE_PHASES)
    || !deepEqual(resultEvidenceContract?.non_P03_capture_phases_allowed, DAY1_GENERIC_CAPTURE_PHASES)
    || resultEvidenceContract?.capture_phases_rule !== "P03_uses_a_non_empty_subset_of_capture_phases_allowed; every_non_P03_probe_uses_a_non_empty_subset_of_non_P03_capture_phases_allowed") {
    issues.push("capture_phase_declaration_permission_results");
  }
  if (!deepEqual(templateEvidenceContract?.capture_phases_allowed, DAY1_ALL_CAPTURE_PHASES)
    || !deepEqual(templateEvidenceContract?.non_P03_capture_phases_allowed, DAY1_GENERIC_CAPTURE_PHASES)
    || templateEvidenceContract?.capture_phases_rule !== "P03_uses_a_non_empty_subset_of_capture_phases_allowed; every_non_P03_probe_uses_a_non_empty_subset_of_non_P03_capture_phases_allowed") {
    issues.push("capture_phase_declaration_evidence_template");
  }
  if (!Array.isArray(records) || records.length !== 13 || !Array.isArray(onsite) || onsite.length < 13) return ["permission_counts"];
  records.forEach((record, index) => {
    issues.push(...permissionResultRecordIssues(record, onsite[index], allowedResults).map((issue) => `${record.unit_id}:${issue}`));
    if (onsite[index]?.status !== day1ExpectedChineseStatus(record)) issues.push(`${record.unit_id}:derived_chinese_status`);
    if (record.unit_id === "P03") {
      const expectedEvidencePresence = record.execution_status === "not_tested" ? "待填" : "已记录";
      const expectedRedactionStatus = record.execution_status === "not_tested" ? "待填" : "已复核";
      if (onsite[index]?.evidence_presence !== expectedEvidencePresence) issues.push("P03:onsite_evidence_presence_state_mismatch");
      if (onsite[index]?.redaction_status !== expectedRedactionStatus) issues.push("P03:onsite_redaction_status_state_mismatch");
    }
  });
  const onsiteP03Binding = onsite?.[2]?.p03_phase_binding_contract;
  if (!deepEqual(onsiteP03Binding?.prebuild_proof_exact_keys, DAY1_P03_PREBUILD_PROOF_KEYS)
    || !deepEqual(onsiteP03Binding?.prebuild_visibility_safety_keys, DAY1_P03_PREBUILD_VISIBILITY_SAFETY_KEYS)
    || onsiteP03Binding?.prebuild_mutation_gate_rule !== "attempt_mutation_only_when_allowed_view_opened_and_all_five_visibility_safety_keys_are_true; otherwise_protected_mutation_attempted_and_protected_mutation_rejected_are_both_false"
    || onsiteP03Binding?.prebuild_result_classification_rule !== "available_or_restricted_requires_opened_view_all_five_visibility_safety_keys_true_mutation_attempted_and_rejected_zero_unauthorized_business_writes_and_unchanged_business_state; every_other_lawful_complete_and_cleaned_observation_is_unavailable") {
    issues.push("P03_onsite_prebuild_boundary_contract");
  }
  issues.push(...p03PhaseContractIssues(records[2], onsite[2], allowedResults));
  if (records[2].execution_status === "completed") issues.push(...day1P03CompletedOnsiteMachineResultIssues(onsite[2], records[1], onsite[1], records[2]));
  for (const index of [5, 6]) {
    if (!deepEqual(candidate.probeSuite.probes[index].depends_on, ["P02", "P05"])) issues.push(`P0${index + 1}:dependency_edge`);
  }
  if (records[4].execution_status !== "completed") {
    for (const index of [5, 6]) {
      const record = records[index];
      if (!(record.execution_status === "not_tested" && record.result === null && record.evidence === null && record.evidence_index === null)) issues.push(`${record.unit_id}:P05_gate`);
    }
  }
  return issues;
}

function containsSensitiveValue(text) {
  const sensitivePatterns = [
    /Bearer\s+[A-Za-z0-9._~-]{8,}/i,
    /"(?:app_secret|tenant_access_token|user_access_token|refresh_token|verification_token|encrypt_key)"\s*:\s*"[^"]+"/i,
    /"(?:app_token|table_id|field_id|view_id|automation_id|platform_role_id)"\s*:\s*"[^"]+"/i,
    /(?:cli|tnt|u|app)_[A-Za-z0-9]{20,}/,
  ];
  return sensitivePatterns.some((pattern) => pattern.test(text));
}

function assessOfflineAttempt(attempt, options = {}) {
  if (options.maxBuffer !== OFFLINE_MAX_BUFFER) return { ok: false, reason: "invalid_maxBuffer_configuration" };
  if (!Number.isInteger(options.timeoutMs) || options.timeoutMs <= 0 || options.timeoutMs > 60_000) {
    return { ok: false, reason: "invalid_timeout_configuration" };
  }
  if (attempt.maxBufferExceeded === true || attempt.errorCode === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER") {
    return { ok: false, reason: "maxBuffer_exceeded" };
  }
  if (attempt.timedOut === true) return { ok: false, reason: "process_timeout" };
  if (attempt.signal !== null && attempt.signal !== undefined) return { ok: false, reason: "process_signal" };
  if (attempt.errorCode === "ENOENT") return { ok: false, reason: "spawn_ENOENT" };
  if (attempt.processError === true && !Number.isInteger(attempt.exitCode)) return { ok: false, reason: "spawn_or_process_error" };
  if (attempt.exitCode !== 0) return { ok: false, reason: "nonzero_exit" };
  if (typeof attempt.stderr !== "string" || attempt.stderr.length !== 0) return { ok: false, reason: "stderr_not_empty" };
  if (typeof attempt.stdout !== "string" || attempt.stdout.length === 0) return { ok: false, reason: "stdout_not_single_JSON_object" };
  const parsed = parseStrictJsonObject(attempt.stdout, "offline_stdout");
  if (!parsed.ok) return { ok: false, reason: "stdout_not_single_JSON_object" };
  return { ok: true, report: parsed.value };
}

function executeOfflineProcess() {
  return new Promise((resolve) => {
    execFile(process.execPath, [paths.baselineValidator], {
      cwd: repositoryRoot,
      encoding: "utf8",
      timeout: OFFLINE_TIMEOUT_MS,
      maxBuffer: OFFLINE_MAX_BUFFER,
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

async function runOfflineValidator(expectedSnapshotSha256, dependencies = {}) {
  const readValidatorBytes = dependencies.readValidatorBytes ?? (() => readFile(paths.baselineValidator));
  const execute = dependencies.execute ?? executeOfflineProcess;
  let preSpawnSha256;
  try {
    preSpawnSha256 = sha256(await readValidatorBytes());
  } catch {
    return { ok: false, reason: "pre_spawn_read_failure", invocation_count: 0, pre_spawn_sha256: null };
  }
  if (preSpawnSha256 !== FROZEN_OFFLINE_VALIDATOR_SHA256 || preSpawnSha256 !== expectedSnapshotSha256) {
    return { ok: false, reason: "pre_spawn_SHA_mismatch", invocation_count: 0, pre_spawn_sha256: preSpawnSha256 };
  }
  const assessment = assessOfflineAttempt(await execute(), {
    timeoutMs: OFFLINE_TIMEOUT_MS,
    maxBuffer: OFFLINE_MAX_BUFFER,
  });
  return { ...assessment, invocation_count: 1, pre_spawn_sha256: preSpawnSha256 };
}

async function readSnapshot(fileInventory) {
  const decoder = new TextDecoder("utf-8", { fatal: true });
  const entries = await Promise.all(Object.entries(fileInventory).map(async ([key, absolutePath]) => {
    const bytes = await readFile(absolutePath);
    return [key, {
      path: path.relative(repositoryRoot, absolutePath),
      sha256: sha256(bytes),
      byte_length: bytes.length,
      bytes,
      text: decoder.decode(bytes),
    }];
  }));
  return Object.fromEntries(entries);
}

async function createSnapshotInventory() {
  const bootstrap = await readSnapshot({ canonicalManifest: paths.canonicalManifest });
  const parsed = parseStrictJsonObject(bootstrap.canonicalManifest.text, "canonicalManifest");
  if (!parsed.ok || !Array.isArray(parsed.value.tables)) throw new Error("day1_input_snapshot_rejected");
  const observedFiles = Object.fromEntries(parsed.value.tables.map((table) => [table?.name, table?.file]));
  if (!deepEqual(observedFiles, EXPECTED_CANONICAL_TABLE_FILES)) throw new Error("day1_input_snapshot_rejected");
  return SNAPSHOT_PATHS;
}

function snapshotsEqual(left, right) {
  return equalArrays(Object.keys(left), Object.keys(right))
    && Object.keys(left).every((key) => left[key].path === right[key].path
      && left[key].sha256 === right[key].sha256
      && left[key].byte_length === right[key].byte_length
      && left[key].bytes.equals(right[key].bytes));
}

function publicSnapshotSources(snapshot) {
  return Object.fromEntries(Object.keys(SNAPSHOT_PATHS).map((key) => [key, {
    path: snapshot[key].path,
    sha256: snapshot[key].sha256,
  }]));
}

function requireSnapshotJson(snapshot, key) {
  const parsed = parseStrictJsonObject(snapshot[key]?.text ?? "", key);
  if (!parsed.ok) throw new Error("day1_strict_JSON_rejected");
  return parsed.value;
}

function requireSnapshotJsonArray(snapshot, key) {
  const parsed = parseStrictJsonArray(snapshot[key]?.text ?? "", key);
  if (!parsed.ok) throw new Error("day1_strict_JSON_rejected");
  return parsed.value;
}

function offlineSourceProfileMatches(report, snapshot) {
  if (!exactOwnKeys(report?.sources, Object.keys(OFFLINE_SOURCE_PATH_KEYS))) return false;
  return Object.entries(OFFLINE_SOURCE_PATH_KEYS).every(([sourceKey, snapshotKey]) => {
    const expected = sourceKey === "r10Plan"
      ? EXPECTED_CONTRACT_ATTESTATION.permission_content_freeze.sources[0]
      : snapshot[snapshotKey];
    const observed = report.sources[sourceKey];
    return exactOwnKeys(observed, ["path", "sha256"])
      && observed.path === expected.path
      && observed.sha256 === expected.sha256;
  });
}

function expectedSelectedContractSources(snapshot) {
  return [
    { id: "logical_manifest", snapshotKey: "logicalManifest" },
    { id: "permission_matrix", snapshotKey: "permissionMatrix" },
    { id: "typescript_canonical_contract", snapshotKey: "t3Contract" },
    { id: "build_package", snapshotKey: "buildPackage" },
    { id: "evidence_template", snapshotKey: "evidenceTemplate" },
  ].map(({ id, snapshotKey }) => ({
    id,
    path: snapshot[snapshotKey].path,
    sha256: snapshot[snapshotKey].sha256,
  }));
}

function expectedPermissionResultContractObserved() {
  return {
    attestation_schema_version: "permission_result_contract_attestation.v1",
    source_freeze_version: "permission_content_source_freeze.v1",
    status: "passed",
    check_group: "permission_result_contract",
    assertion_count: 234,
    failed_assertion_count: 0,
    negative_fixture_count: 220,
    negative_fixtures: EXPECTED_CONTRACT_PERMISSION_NEGATIVE_IDS.map((id) => ({ id, rejected: true })),
    negative_fixture_name_digest: EXPECTED_CONTRACT_ATTESTATION.permission_result_contract.negative_fixture_name_digest,
    versions: EXPECTED_CONTRACT_ATTESTATION.permission_result_contract.versions,
    counts: EXPECTED_CONTRACT_ATTESTATION.permission_result_contract.counts,
    canonical_evidence_source: "permission_result.evidence_index",
    canonical_evidence_binding: "permission_result.evidence_and_same_Pnn_on_site.structured_evidence_index_canonical_deep_equal",
    P03_phase_binding: "phase_evidence_indexes_canonical_deep_equal_parent_P03_indexes_filtered_by_capture_phase_in_same_order_with_unique_evidence_id",
    P06_dependencies: ["P02", "P05"],
    P07_dependencies: ["P02", "P05"],
    sources: EXPECTED_CONTRACT_ATTESTATION.permission_content_freeze.sources.filter((source) => source.id !== "r10_plan"),
    source_count: 5,
    source_digest: EXPECTED_CONTRACT_ATTESTATION.permission_result_contract.source_digest,
    current_execution_status: "not_tested",
    real_external_operations: 0,
  };
}

function expectedObservedContractAttestation(snapshot) {
  return {
    validator_sha256_pre: FROZEN_CONTRACT_VALIDATOR_SHA256,
    validator_sha256_pre_spawn: FROZEN_CONTRACT_VALIDATOR_SHA256,
    validator_sha256_post: FROZEN_CONTRACT_VALIDATOR_SHA256,
    process: { status: "passed", invocation_count: 1 },
    report_envelope: EXPECTED_CONTRACT_ATTESTATION.report_envelope,
    check_group_counts: EXPECTED_CONTRACT_GROUP_COUNTS,
    c13: EXPECTED_CONTRACT_C13,
    literal_reference_closures: EXPECTED_CONTRACT_CLOSURES,
    tradeoffs: {
      c12: { ...EXPECTED_ACCEPTED_SECURITY_TRADEOFFS.c12, reported_disjoint: true },
      c13: { ...EXPECTED_ACCEPTED_SECURITY_TRADEOFFS.c13, reported_disjoint: true },
    },
    versions: EXPECTED_CONTRACT_ATTESTATION.versions,
    permission_result_contract: expectedPermissionResultContractObserved(),
    permission_content_freeze: EXPECTED_CONTRACT_ATTESTATION.permission_content_freeze,
    selected_sources: expectedSelectedContractSources(snapshot),
  };
}

function offlineContractAttestationMatches(attestation, snapshot) {
  const observed = attestation?.observed;
  const expected = attestation?.expected;
  const expectedC13Counts = Object.fromEntries(Object.entries(EXPECTED_CONTRACT_C13.groups).map(([key, value]) => [key, value.count]));
  return exactOwnKeys(attestation, OFFLINE_CONTRACT_ATTESTATION_KEYS)
    && attestation.status === "trusted"
    && attestation.execution_byte_binding_scope === "path_reopen_with_pre_and_post_SHA_compensation"
    && attestation.residual_risk === "same_user_transient_swap_between_final_hash_and_exec_open"
    && attestation.validator_path === snapshot.contractValidator.path
    && attestation.validator_sha256 === FROZEN_CONTRACT_VALIDATOR_SHA256
    && attestation.timeout_ms === 45_000
    && attestation.max_buffer_bytes === OFFLINE_MAX_BUFFER
    && attestation.report_status === "passed"
    && attestation.report_mode === "read_only"
    && attestation.passed_checks === 2759
    && attestation.failed_checks === 0
    && attestation.upstream_conflicts === 0
    && attestation.check_group_count === 15
    && deepEqual(attestation.check_group_counts, EXPECTED_CONTRACT_GROUP_COUNTS)
    && deepEqual(attestation.c13_fixture_group_counts, expectedC13Counts)
    && attestation.c13_fixture_total === Object.values(expectedC13Counts).reduce((count, value) => count + value, 0)
    && deepEqual(attestation.literal_reference_closures, EXPECTED_CONTRACT_CLOSURES)
    && deepEqual(attestation.accepted_security_tradeoffs, EXPECTED_ACCEPTED_SECURITY_TRADEOFFS)
    && deepEqual(attestation.versions, EXPECTED_CONTRACT_ATTESTATION.versions)
    && attestation.selected_source_attestations === 5
    && exactOwnKeys(expected, OFFLINE_CONTRACT_EXPECTED_KEYS)
    && deepEqual(expected, EXPECTED_CONTRACT_ATTESTATION)
    && exactOwnKeys(observed, OFFLINE_OBSERVED_ATTESTATION_KEYS)
    && deepEqual(observed, expectedObservedContractAttestation(snapshot))
    && exactOwnKeys(attestation.comparisons, OFFLINE_ATTESTATION_COMPARISON_KEYS)
    && Object.values(attestation.comparisons).every((value) => value === true);
}

function offlineProfileShapeMatches(report, snapshot) {
  if (!exactOwnKeys(report, OFFLINE_CORE_KEYS)
    || report.report_schema_version !== OFFLINE_REPORT_SCHEMA_VERSION
    || report.status !== "passed"
    || report.mode !== "read_only"
    || report.fatal !== null
    || !Array.isArray(report.errors)
    || report.errors.length !== 0
    || !exactOwnKeys(report.summary, OFFLINE_SUMMARY_KEYS)
    || report.summary.baseline_passed_checks !== 2759
    || report.summary.offline_passed_checks !== 143
    || report.summary.total_passed_checks !== 2902
    || report.summary.failed_checks !== 0
    || report.summary.offline_total_checks !== 143
    || report.summary.offline_failed_checks !== 0
    || report.summary.effective_fields !== 240
    || report.summary.relations !== 9
    || report.summary.runbook_step_rows !== 60) return false;

  if (!equalArrays(Object.keys(report.check_groups ?? {}), Object.keys(OFFLINE_CHECK_GROUP_COUNTS))) return false;
  if (!Object.entries(OFFLINE_CHECK_GROUP_COUNTS).every(([key, expectedCount]) => {
    const group = report.check_groups[key];
    return exactOwnKeys(group, ["status", "passed_checks", "failed_checks"])
      && group.status === "passed"
      && group.passed_checks === expectedCount
      && Array.isArray(group.failed_checks)
      && group.failed_checks.length === 0;
  })) return false;

  const negative = report.negative_test_matrix;
  if (!exactOwnKeys(negative, OFFLINE_NEGATIVE_TEST_MATRIX_KEYS)
    || negative.total !== 125
    || negative.passed !== 125
    || negative.failed !== 0
    || negative.expected_name_digest !== EXPECTED_OFFLINE_NEGATIVE_TEST_NAME_DIGEST
    || negative.observed_name_digest !== EXPECTED_OFFLINE_NEGATIVE_TEST_NAME_DIGEST
    || !equalArrays(Object.keys(negative.categories ?? {}), Object.keys(OFFLINE_NEGATIVE_TEST_COUNTS))) return false;
  if (!Object.entries(OFFLINE_NEGATIVE_TEST_COUNTS).every(([key, expectedCount]) => {
    const category = negative.categories[key];
    return exactOwnKeys(category, OFFLINE_NEGATIVE_CATEGORY_KEYS)
      && category.total === expectedCount
      && category.passed === expectedCount
      && category.failed === 0;
  })) return false;

  const onsite = report.onsite_status;
  if (!exactOwnKeys(onsite, OFFLINE_ONSITE_STATUS_KEYS)
    || onsite.required_evidence_units !== 41
    || onsite.required_evidence_units_untested !== 41
    || onsite.logical_role_platform_mappings_untested !== 3
    || onsite.P01_to_P13 !== "全部未测试"
    || onsite.R10_verification_status !== "not_tested"
    || onsite.R10_execution_mode !== "insufficient"
    || onsite.R10_automatic_projection_enabled !== false
    || onsite.real_feishu_operations_performed_by_validator !== 0
    || onsite.lark_cli_login_operations_performed_by_validator !== 0
    || onsite.openapi_calls_performed_by_validator !== 0
    || onsite.base_write_attempts_performed_by_validator !== 0) return false;

  if (!exactOwnKeys(report.protection_category_counts, Object.keys(EXPECTED_OFFLINE_PROTECTION_CATEGORY_COUNTS))
    || !deepEqual(report.protection_category_counts, EXPECTED_OFFLINE_PROTECTION_CATEGORY_COUNTS)) return false;

  return exactOwnKeys(report.sources, OFFLINE_CONTRACT_SOURCE_KEYS)
    && Object.values(report.sources).every((source) => exactOwnKeys(source, OFFLINE_PUBLIC_SOURCE_ENTRY_KEYS))
    && offlineContractAttestationMatches(report.contract_attestation, snapshot)
    && offlineSourceProfileMatches(report, snapshot);
}

function collectOfflineProfileIssues(report, snapshot) {
  const issues = [];
  const expectedSummary = {
    baseline_passed_checks: 2759,
    offline_passed_checks: 143,
    total_passed_checks: 2902,
    failed_checks: 0,
    offline_total_checks: 143,
    offline_failed_checks: 0,
    effective_fields: 240,
    relations: 9,
    runbook_step_rows: 60,
  };
  for (const [key, expected] of Object.entries(expectedSummary)) {
    if (report?.summary?.[key] !== expected) issues.push(`summary.${key}`);
  }

  if (!equalArrays(Object.keys(report?.check_groups ?? {}), Object.keys(OFFLINE_CHECK_GROUP_COUNTS))) {
    issues.push("check_groups.keys");
  } else {
    for (const [key, passedChecks] of Object.entries(OFFLINE_CHECK_GROUP_COUNTS)) {
      if (!deepEqual(report.check_groups[key], { status: "passed", passed_checks: passedChecks, failed_checks: [] })) {
        issues.push(`check_groups.${key}`);
      }
    }
  }

  const negative = report?.negative_test_matrix;
  if (!exactOwnKeys(negative, OFFLINE_NEGATIVE_TEST_MATRIX_KEYS)) {
    issues.push("negative_test_matrix.keys");
  }
  if (negative?.total !== 125 || negative?.passed !== 125 || negative?.failed !== 0) {
    issues.push("negative_test_matrix.counts");
  }
  if (negative?.expected_name_digest !== EXPECTED_OFFLINE_NEGATIVE_TEST_NAME_DIGEST) {
    issues.push("negative_test_matrix.expected_name_digest");
  }
  if (negative?.observed_name_digest !== EXPECTED_OFFLINE_NEGATIVE_TEST_NAME_DIGEST) {
    issues.push("negative_test_matrix.observed_name_digest");
  }
  if (!equalArrays(Object.keys(negative?.categories ?? {}), Object.keys(OFFLINE_NEGATIVE_TEST_COUNTS))) {
    issues.push("negative_test_matrix.categories.keys");
  } else {
    for (const [key, count] of Object.entries(OFFLINE_NEGATIVE_TEST_COUNTS)) {
      if (!exactOwnKeys(negative.categories[key], OFFLINE_NEGATIVE_CATEGORY_KEYS)
        || !deepEqual(negative.categories[key], { total: count, passed: count, failed: 0 })) {
        issues.push(`negative_test_matrix.categories.${key}`);
      }
    }
  }

  for (const [key, expected] of Object.entries({
    required_evidence_units: 41,
    required_evidence_units_untested: 41,
    logical_role_platform_mappings_untested: 3,
    P01_to_P13: "全部未测试",
    R10_verification_status: "not_tested",
    R10_execution_mode: "insufficient",
    R10_automatic_projection_enabled: false,
    real_feishu_operations_performed_by_validator: 0,
    lark_cli_login_operations_performed_by_validator: 0,
    openapi_calls_performed_by_validator: 0,
    base_write_attempts_performed_by_validator: 0,
  })) {
    if (report?.onsite_status?.[key] !== expected) issues.push(`onsite_status.${key}`);
  }

  if (!deepEqual(report?.protection_category_counts, EXPECTED_OFFLINE_PROTECTION_CATEGORY_COUNTS)) {
    issues.push("protection_category_counts");
  }

  for (const [sourceKey, snapshotKey] of Object.entries(OFFLINE_SOURCE_PATH_KEYS)) {
    const expected = sourceKey === "r10Plan"
      ? EXPECTED_CONTRACT_ATTESTATION.permission_content_freeze.sources[0]
      : snapshot[snapshotKey];
    const source = report?.sources?.[sourceKey];
    if (source?.path !== expected.path) issues.push(`sources.${sourceKey}.path`);
    if (source?.sha256 !== expected.sha256) issues.push(`sources.${sourceKey}.sha256`);
  }

  const attestation = report?.contract_attestation;
  if (!exactOwnKeys(attestation?.expected, OFFLINE_CONTRACT_EXPECTED_KEYS)) {
    issues.push("contract_attestation.expected.keys");
  }
  if (attestation?.expected?.c13?.profile_digest !== EXPECTED_CONTRACT_C13.profile_digest) {
    issues.push("contract_attestation.expected.c13.profile_digest");
  }
  if (attestation?.observed?.c13?.profile_digest !== EXPECTED_CONTRACT_C13.profile_digest) {
    issues.push("contract_attestation.observed.c13.profile_digest");
  }
  if (!deepEqual(attestation?.accepted_security_tradeoffs, EXPECTED_ACCEPTED_SECURITY_TRADEOFFS)) {
    issues.push("contract_attestation.accepted_security_tradeoffs");
  }
  const expectedObserved = expectedObservedContractAttestation(snapshot);
  if (!exactOwnKeys(attestation?.observed, OFFLINE_OBSERVED_ATTESTATION_KEYS)) {
    issues.push("contract_attestation.observed.keys");
  } else {
    for (const key of OFFLINE_OBSERVED_ATTESTATION_KEYS) {
      if (key === "c13") continue;
      if (!deepEqual(attestation.observed[key], expectedObserved[key])) {
        issues.push(`contract_attestation.observed.${key}`);
      }
    }
  }

  if (!exactOwnKeys(report?.sources, OFFLINE_CONTRACT_SOURCE_KEYS)
    || !Object.values(report?.sources ?? {}).every((source) => exactOwnKeys(source, OFFLINE_PUBLIC_SOURCE_ENTRY_KEYS))) {
    issues.push("sources.keys");
  }

  if (!offlineProfileShapeMatches(report, snapshot) && issues.length === 0) issues.push("offline_profile");
  return issues;
}

function offlineProfileMatches(report, snapshot) {
  return collectOfflineProfileIssues(report, snapshot).length === 0;
}

async function main() {
const snapshotInventory = await createSnapshotInventory();
const snapshotA = await readSnapshot(snapshotInventory);
if (!exactOwnKeys(snapshotA, Object.keys(EXPECTED_SOURCE_SHA256))
  || !Object.entries(EXPECTED_SOURCE_SHA256).every(([key, expectedSha256]) => snapshotA[key]?.sha256 === expectedSha256)) {
  throw new Error("day1_frozen_validator_SHA_mismatch");
}
if (Object.keys(publicSnapshotSources(snapshotA)).length !== EXPECTED_DAY1_SOURCE_COUNT
  || canonicalSha256(publicSnapshotSources(snapshotA)) !== EXPECTED_DAY1_SOURCE_DIGEST) {
  throw new Error("day1_source_snapshot_digest_mismatch");
}

const probeSuite = requireSnapshotJson(snapshotA, "probeSuite");
const importPlan = requireSnapshotJson(snapshotA, "importPlan");
const smokePlan = requireSnapshotJson(snapshotA, "smokePlan");
const resultTemplate = requireSnapshotJson(snapshotA, "resultTemplate");
const evidenceTemplate = requireSnapshotJson(snapshotA, "evidenceTemplate");
const resourceMappingTemplate = requireSnapshotJson(snapshotA, "resourceMappingTemplate");
void resourceMappingTemplate;
const canonical = requireSnapshotJson(snapshotA, "canonicalManifest");
if (!deepEqual(Object.fromEntries((canonical.tables ?? []).map((table) => [table?.name, table?.file])), EXPECTED_CANONICAL_TABLE_FILES)) {
  throw new Error("day1_canonical_table_inventory_drift");
}
const mainStory = requireSnapshotJson(snapshotA, "mainStory");
const failureDrills = requireSnapshotJson(snapshotA, "failureDrills");
const logical = requireSnapshotJson(snapshotA, "logicalManifest");
const buildPackage = requireSnapshotJson(snapshotA, "buildPackage");
for (const tableKey of Object.keys(EXPECTED_CANONICAL_TABLE_FILES)) requireSnapshotJsonArray(snapshotA, `canonicalTable_${tableKey}`);

const probeSuiteText = snapshotA.probeSuite.text;
const importPlanText = snapshotA.importPlan.text;
const smokePlanText = snapshotA.smokePlan.text;
const resultTemplateText = snapshotA.resultTemplate.text;
const capabilityRunbook = snapshotA.capabilityRunbook.text;
const buildRunbook = snapshotA.buildRunbook.text;
const resourceMappingTemplateText = snapshotA.resourceMappingTemplate.text;
const canonicalManifestText = snapshotA.canonicalManifest.text;
const mainStoryText = snapshotA.mainStory.text;
const failureDrillsText = snapshotA.failureDrills.text;
const logicalManifestText = snapshotA.logicalManifest.text;
const buildPackageText = snapshotA.buildPackage.text;
const t3Contract = snapshotA.t3Contract.text;

const strictJsonFixtures = [
  ["duplicate_key", "duplicate_key", '{"a":1,"a":2}'],
  ["decoded_unicode_alias", "duplicate_key", '{"a":1,"\\u0061":2}'],
  ["decoded_escape_alias", "duplicate_key", '{"a/b":1,"a\\/b":2}'],
  ["negative_zero", "negative_zero_JSON_number", '{"value":-0}'],
  ["non_finite_exponent", "non_finite_JSON_number", '{"value":1e309}'],
  ["invalid_JSON", "unexpected_JSON_value_token", '{"value":}'],
  ["multiple_JSON_values", "trailing_content_after_JSON_value", '{} {}'],
];
const strictJsonFixtureResults = strictJsonFixtures.map(([name, expectedIssue, raw]) => {
  const analysis = analyzeStrictJsonText(raw, "fixture");
  const observedIssues = [
    ...analysis.duplicate_keys.map(() => "duplicate_key"),
    ...analysis.number_findings.map((finding) => finding.reason),
    ...analysis.syntax_errors.map((finding) => finding.reason),
  ];
  return recordNegativeControl("strict_JSON", name, !parseStrictJsonObject(raw, "fixture").ok
    && equalArrays(observedIssues, [expectedIssue]));
});
assert("strict_JSON_negative_matrix_rejects_duplicate_alias_negative_zero_nonfinite_syntax_and_multiple_values", strictJsonFixtureResults.every(Boolean), strictJsonFixtureResults);

const acceptedAttempt = {
  processError: false,
  exitCode: 0,
  signal: null,
  timedOut: false,
  errorCode: null,
  maxBufferExceeded: false,
  stdout: "{}",
  stderr: "",
};
const processNegativeFixtures = [
  ["nonzero_with_fake_passed_stdout", "nonzero_exit", { ...acceptedAttempt, processError: true, exitCode: 1, stdout: '{"status":"passed"}' }],
  ["signal", "process_signal", { ...acceptedAttempt, processError: true, exitCode: null, signal: "SIGTERM" }],
  ["empty_stdout", "stdout_not_single_JSON_object", { ...acceptedAttempt, stdout: "" }],
  ["invalid_stdout", "stdout_not_single_JSON_object", { ...acceptedAttempt, stdout: "not JSON" }],
  ["multiple_JSON_stdout", "stdout_not_single_JSON_object", { ...acceptedAttempt, stdout: "{} {}" }],
  ["stderr", "stderr_not_empty", { ...acceptedAttempt, stderr: "diagnostic" }],
  ["timeout_event", "process_timeout", { ...acceptedAttempt, processError: true, exitCode: null, timedOut: true }],
  ["ENOENT", "spawn_ENOENT", { ...acceptedAttempt, processError: true, exitCode: null, errorCode: "ENOENT" }],
  ["maxBuffer", "maxBuffer_exceeded", { ...acceptedAttempt, processError: true, exitCode: null, errorCode: "ERR_CHILD_PROCESS_STDIO_MAXBUFFER", maxBufferExceeded: true }],
];
const processNegativeResults = processNegativeFixtures.map(([name, expectedReason, attempt]) => {
  const assessment = assessOfflineAttempt(attempt, { timeoutMs: OFFLINE_TIMEOUT_MS, maxBuffer: OFFLINE_MAX_BUFFER });
  return recordNegativeControl("offline_process", name, assessment.ok === false && assessment.reason === expectedReason);
});
const timeoutConfigurationAssessment = assessOfflineAttempt(acceptedAttempt, { timeoutMs: 60_001, maxBuffer: OFFLINE_MAX_BUFFER });
processNegativeResults.push(recordNegativeControl("offline_process", "timeout_configuration", timeoutConfigurationAssessment.ok === false
  && timeoutConfigurationAssessment.reason === "invalid_timeout_configuration"));
const maxBufferConfigurationAssessment = assessOfflineAttempt(acceptedAttempt, { timeoutMs: OFFLINE_TIMEOUT_MS, maxBuffer: OFFLINE_MAX_BUFFER - 1 });
processNegativeResults.push(recordNegativeControl("offline_process", "maxBuffer_configuration", maxBufferConfigurationAssessment.ok === false
  && maxBufferConfigurationAssessment.reason === "invalid_maxBuffer_configuration"));
assert("offline_process_negative_matrix_rejects_nonzero_signal_empty_invalid_multiple_stderr_timeout_ENOENT_and_maxBuffer", processNegativeResults.every(Boolean)
  && assessOfflineAttempt(acceptedAttempt, { timeoutMs: OFFLINE_TIMEOUT_MS, maxBuffer: OFFLINE_MAX_BUFFER }).ok, processNegativeFixtures);
let initialShaMismatchSpawnCount = 0;
const initialShaMismatchAssessment = await runOfflineValidator("0".repeat(64), {
  readValidatorBytes: async () => snapshotA.baselineValidator.bytes,
  execute: async () => { initialShaMismatchSpawnCount += 1; return acceptedAttempt; },
});
let preSpawnShaMismatchSpawnCount = 0;
const preSpawnShaMismatchAssessment = await runOfflineValidator(snapshotA.baselineValidator.sha256, {
  readValidatorBytes: async () => Buffer.from("equal-length-but-different-offline-validator"),
  execute: async () => { preSpawnShaMismatchSpawnCount += 1; return acceptedAttempt; },
});
const zeroSpawnRejected = recordNegativeControl("offline_process", "stable_SHA_mismatch_zero_spawn",
  initialShaMismatchAssessment.ok === false
  && initialShaMismatchAssessment.reason === "pre_spawn_SHA_mismatch"
  && initialShaMismatchAssessment.invocation_count === 0
  && initialShaMismatchSpawnCount === 0
  && preSpawnShaMismatchAssessment.ok === false
  && preSpawnShaMismatchAssessment.reason === "pre_spawn_SHA_mismatch"
  && preSpawnShaMismatchAssessment.invocation_count === 0
  && preSpawnShaMismatchSpawnCount === 0);
assert("offline_validator_initial_and_pre_spawn_SHA_mismatches_are_independent_zero_invocation_controls", zeroSpawnRejected, {
  initial: initialShaMismatchAssessment,
  initial_spawn_count: initialShaMismatchSpawnCount,
  pre_spawn: preSpawnShaMismatchAssessment,
  pre_spawn_count: preSpawnShaMismatchSpawnCount,
});

const baselineAssessment = await runOfflineValidator(snapshotA.baselineValidator.sha256);
if (!baselineAssessment.ok) {
  throw new Error("day1_offline_transport_untrusted");
}
const baseline = baselineAssessment.report;
const snapshotB = await readSnapshot(snapshotInventory);
let snapshotComparison = snapshotsEqual(snapshotA, snapshotB);
if (!snapshotComparison || snapshotB.baselineValidator.sha256 !== FROZEN_OFFLINE_VALIDATOR_SHA256) {
  throw new Error("day1_snapshot_drift");
}
const offlineProfileComparison = offlineProfileMatches(baseline, snapshotA);
if (!offlineProfileComparison) {
  throw new Error("day1_offline_profile_untrusted");
}
assert("R10_offline_validator_profile_is_exact_and_trusted", offlineProfileComparison, baseline);
assert("R10_snapshot_A_pre_spawn_and_snapshot_B_are_byte_identical", snapshotComparison
  && baselineAssessment.pre_spawn_sha256 === snapshotA.baselineValidator.sha256, snapshotComparison);

const expectedProbeIds = Array.from({ length: 13 }, (_, index) => `P${String(index + 1).padStart(2, "0")}`);
const expectedProbeNames = evidenceTemplate.permission_checks.map((unit) => unit.name);
const expectedTableKeys = canonical.tables.map((table) => table.name);
const expectedViewKeys = logical.frontend_views.map((view) => view.key);
const expectedRoleKeys = logical.logical_business_roles.map((role) => role.key);
const expectedNodeIds = logical.ai_nodes.map((node) => node.key);
const expectedWorkflowIds = logical.workflows.map((workflow) => workflow.key);
const allowedCapabilityResults = ["可用", "受限", "不可用"];

assert("all_R10_machine_artifacts_remain_solution_design", [probeSuite, importPlan, smokePlan, resultTemplate].every((artifact) => artifact.fact_class === "solution_design"), {
  probe: probeSuite.fact_class,
  import: importPlan.fact_class,
  smoke: smokePlan.fact_class,
  result: resultTemplate.fact_class,
});
assert("all_R10_artifacts_state_not_executed", probeSuite.deployment_status === "offline_probe_plan_not_executed"
  && importPlan.deployment_status === "offline_import_plan_not_executed"
  && smokePlan.deployment_status === "offline_smoke_plan_not_executed"
  && resultTemplate.deployment_status === "result_template_not_executed", {
  probe: probeSuite.deployment_status,
  import: importPlan.deployment_status,
  smoke: smokePlan.deployment_status,
  result: resultTemplate.deployment_status,
});
assert("R10_artifact_versions_are_probe_0_1_7_results_0_1_3_evidence_0_1_6_import_smoke_0_1_4_logical_0_1_6_build_0_1_5", probeSuite.suite_version === "0.1.7"
  && importPlan.plan_version === "0.1.4"
  && smokePlan.plan_version === "0.1.4"
  && evidenceTemplate.template_version === "0.1.6"
  && resultTemplate.template_version === "0.1.3"
  && logical.manifest_version === "0.1.6"
  && buildPackage.package_version === "0.1.5", {
  probe: probeSuite.suite_version,
  import: importPlan.plan_version,
  smoke: smokePlan.plan_version,
  evidence: evidenceTemplate.template_version,
  logical: logical.manifest_version,
  build: buildPackage.package_version,
});

assert("probe_catalog_is_exact_P01_to_P13", probeSuite.counts.probes === 13
  && equalArrays(probeSuite.probe_order, expectedProbeIds)
  && equalArrays(probeSuite.probes.map((probe) => probe.probe_id), expectedProbeIds), probeSuite.probe_order);
assert("probe_names_match_existing_evidence_catalog", equalArrays(probeSuite.probes.map((probe) => probe.capability), expectedProbeNames), {
  probe: probeSuite.probes.map((probe) => probe.capability),
  evidence: expectedProbeNames,
});
assert("probe_capability_status_contract_uses_frozen_Chinese_values", equalArrays(probeSuite.status_contract.capability_result_allowed, allowedCapabilityResults)
  && probeSuite.status_contract.initial_execution_status === "not_tested"
  && probeSuite.status_contract.initial_result === null, probeSuite.status_contract);

const logicalRoleSet = new Set(expectedRoleKeys);
const probeShapeErrors = [];
for (const probe of probeSuite.probes) {
  if (!Array.isArray(probe.preconditions) || probe.preconditions.length === 0) probeShapeErrors.push(`${probe.probe_id}: preconditions`);
  if (!Array.isArray(probe.required_logical_roles) || !probe.required_logical_roles.every((role) => logicalRoleSet.has(role))) probeShapeErrors.push(`${probe.probe_id}: roles`);
  if (!Array.isArray(probe.required_actors) || probe.required_actors.length === 0) probeShapeErrors.push(`${probe.probe_id}: actors`);
  if (typeof probe.operation_category !== "string" || !probe.operation_category) probeShapeErrors.push(`${probe.probe_id}: operation_category`);
  if (typeof probe.writes !== "boolean" || typeof probe.reversible !== "boolean") probeShapeErrors.push(`${probe.probe_id}: write/reversible`);
  if (!Array.isArray(probe.minimum_test_action) || probe.minimum_test_action.length === 0) probeShapeErrors.push(`${probe.probe_id}: minimum_test_action`);
  if (!Array.isArray(probe.expected_result) || probe.expected_result.length === 0) probeShapeErrors.push(`${probe.probe_id}: expected_result`);
  if (!Array.isArray(probe.failure_criteria) || probe.failure_criteria.length === 0) probeShapeErrors.push(`${probe.probe_id}: failure_criteria`);
  if (!Array.isArray(probe.failure_class_refs) || probe.failure_class_refs.length === 0) probeShapeErrors.push(`${probe.probe_id}: failure_class_refs`);
  if (!Array.isArray(probe.cleanup_rollback) || probe.cleanup_rollback.length === 0) probeShapeErrors.push(`${probe.probe_id}: cleanup_rollback`);
  if (typeof probe.fallback_path !== "string" || !probe.fallback_path) probeShapeErrors.push(`${probe.probe_id}: fallback_path`);
  if (probe.evidence_unit_ref !== `evidence://on-site/${probe.probe_id}`) probeShapeErrors.push(`${probe.probe_id}: evidence_unit_ref`);
}
assert("all_13_probes_have_required_executable_shape", probeShapeErrors.length === 0, probeShapeErrors);

const failureClassIds = [...buildRunbook.matchAll(/^\| (F\d{2}) \|/gm)].map((match) => match[1]);
assert("probe_failure_classes_resolve_to_F01_F12", equalArrays(failureClassIds, Array.from({ length: 12 }, (_, index) => `F${String(index + 1).padStart(2, "0")}`))
  && probeSuite.probes.every((probe) => probe.failure_class_refs.every((failureClass) => failureClassIds.includes(failureClass))), {
  failureClassIds,
  probeFailureClasses: probeSuite.probes.map((probe) => [probe.probe_id, probe.failure_class_refs]),
});

const probeGraph = graphDiagnostics(probeSuite.probes.map((probe, index) => ({ ...probe, order: index + 1 })), "probe_id");
assert("probe_dependency_graph_is_acyclic_and_forward_ordered", probeGraph.missingDependencies.length === 0
  && probeGraph.dependencyOrderErrors.length === 0
  && probeGraph.cycles.length === 0, probeGraph);
assert("P01_and_P03_are_independent_evidence_paths", probeSuite.probes[0].evidence_unit_ref !== probeSuite.probes[2].evidence_unit_ref
  && probeSuite.global_gates.includes("document_anonymous_access_and_base_unprivileged_access_are_independent"), probeSuite.global_gates);
assert("P03_breaks_prebuild_postbuild_cycle_without_completing_early", probeSuite.probes[2].phase_contract?.pre_build_capability_check?.allowed_decision.includes("cannot complete P03")
  && probeSuite.probes[2].phase_contract?.post_build_five_view_recheck?.minimum_actions.includes("open_and_refresh_all_five_business_views")
  && probeSuite.probes[2].phase_contract?.post_build_five_view_recheck?.allowed_decision.includes("Only this phase"), probeSuite.probes[2].phase_contract);
assert("P02_temporary_formula_does_not_enter_frozen_contract", probeSuite.probes[1].contract_boundary.includes("not part of the frozen 10-table contract")
  && buildPackage.formula_and_dependency_policy.canonical_formula_fields.length === 0, probeSuite.probes[1].contract_boundary);
assert("P04_P05_capability_is_not_runtime_evidence", probeSuite.global_gates.includes("P04_and_P05_capability_probes_are_not_N1_N7_or_W1_W6_runtime_evidence")
  && probeSuite.probes[3].fallback_path.includes("does not count as node runtime evidence")
  && probeSuite.probes[4].fallback_path.includes("do not claim six workflow runtime evidence"), probeSuite.global_gates);
const p02 = probeSuite.probes.find((probe) => probe.probe_id === "P02");
const p03 = probeSuite.probes.find((probe) => probe.probe_id === "P03");
const p04 = probeSuite.probes.find((probe) => probe.probe_id === "P04");
const p05 = probeSuite.probes.find((probe) => probe.probe_id === "P05");
const p06 = probeSuite.probes.find((probe) => probe.probe_id === "P06");
assert("P02_P06_cover_W6_internal_action_permissions_receipts_atomicity_and_separate_checkpoints", p02?.failure_criteria.includes("relation_probe_writes_cases_cluster_id_or_status")
  && p02?.failure_criteria.includes("relation_probe_changes_feedback_ownership")
  && p03?.minimum_test_action.includes("attempt_unprivileged_intake_active_observation_recurrence")
  && p03?.expected_result.includes("unprivileged_internal_W6_action_is_rejected")
  && p04?.minimum_test_action.includes("run_N5_existing_cluster_candidate_and_capture_repository_issued_receipt")
  && p04?.minimum_test_action.includes("attempt_N5_receipt_reuse_for_N6_action")
  && p04?.expected_result.includes("N5_receipt_is_rejected_for_N6_action")
  && p05?.minimum_test_action.includes("run_authorized_intake_active_observation_recurrence_inside_full_resource_lock")
  && p05?.minimum_test_action.includes("run_deliberate_intake_failure_and_verify_atomic_rollback")
  && p05?.minimum_test_action.includes("run_record_day_7_as_an_independent_deterministic_transaction_without_caller_actor_AI_or_authorizer")
  && p05?.minimum_test_action.includes("run_record_day_30_as_an_independent_deterministic_transaction_after_committed_Day7")
  && p05?.expected_result.includes("intake_does_not_write_cases_cluster_id_or_status_feedback_ownership_or_improvement_cycle_or_status")
  && p05?.expected_result.includes("successful_business_commit_with_audit_failure_keeps_commit_and_marks_audit_pending")
  && p05?.expected_result.includes("same_workflow_audit_id_replay_repairs_only_audit_without_repeating_N5_authorization_or_business_write")
  && p05?.failure_criteria.includes("audit_failure_rolls_back_a_successful_business_commit")
  && p05?.failure_criteria.includes("audit_repair_repeats_N5_authorization_or_business_write")
  && p06?.minimum_test_action.includes("exercise_recurrence_approve_and_deny")
  && p06?.minimum_test_action.includes("verify_Day7_Day30_checkpoint_is_not_part_of_the_human_authorization_transaction")
  && p06?.failure_criteria.includes("recurrence_intake_runs_without_explicit_human_approval"), {
  P02: p02,
  P03: p03,
  P04: p04,
  P05: p05,
  P06: p06,
});
assert("P04_rejects_closed_Day7_boundary_before_receipt_issue", p04?.minimum_test_action.includes("before_receipt_issue_evaluate_shared_window_opened_at_less_than_closed_at_less_than_or_equal_to_min_occurred_at_day30ExpectedAt")
  && p04?.minimum_test_action.includes("when_day7_is_sealed_by_existing_checkpoint_or_occurred_at_greater_than_day7ExpectedAt_reject_closed_at_less_than_or_equal_to_day7ExpectedAt_before_receipt_issue")
  && p04?.expected_result.includes("pre_receipt_guard_rejects_both_closed_at_less_than_day7ExpectedAt_and_equal_millisecond_when_day7_is_sealed")
  && p04?.expected_result.includes("only_closed_at_greater_than_day7ExpectedAt_and_inside_the_shared_window_can_remain_Day30_eligible")
  && p04?.expected_result.includes("N5_capability_consumption_outcome_is_recorded_independently_from_receipt_issue_and_business_commit_write_outcomes"), p04);
const p05Day7Edge = p05?.day7_edge_contract;
assert("P05_covers_checkpoint_first_intake_second_lte_race_and_dual_guards", p05?.minimum_test_action.includes("exercise_pre_receipt_and_final_full_lock_shared_Day7_closed_window_guards")
  && p05?.minimum_test_action.includes("run_checkpoint_first_then_intake_second_race_after_receipt_and_human_authorization")
  && p05Day7Edge?.shared_window === "opened_at < closed_at <= min(occurred_at, day30ExpectedAt)"
  && equalArrays(p05Day7Edge?.day7_sealed_if ?? [], ["day7_checkpoint_exists", "occurred_at > day7ExpectedAt"])
  && equalArrays(p05Day7Edge?.guard_points ?? [], ["before_repository_receipt_issue", "inside_full_resource_lock_immediately_before_business_commit"])
  && equalArrays(p05Day7Edge?.checkpoint_first_intake_second_race?.order ?? [], [
    "N5_receipt_issued",
    "human_recurrence_authorization_recorded",
    "Day7_checkpoint_committed",
    "final_guard_rechecked_inside_full_resource_lock",
  ])
  && p05Day7Edge?.checkpoint_first_intake_second_race?.closed_at_condition === "closed_at <= day7ExpectedAt"
  && p05Day7Edge?.checkpoint_first_intake_second_race?.expected_decision === "reject", p05Day7Edge);
assert("P05_Day7_boundary_matrix_and_rejection_are_exact_zero_write", equalArrays(p05Day7Edge?.sealed_boundary_matrix?.map((entry) => `${entry.closed_at_relation}:${entry.expected_decision}`) ?? [], [
  "closed_at < day7ExpectedAt:reject",
  "closed_at == day7ExpectedAt:reject",
  "closed_at > day7ExpectedAt:Day30_eligible_not_committed_by_this_check",
])
  && p05Day7Edge?.sealed_boundary_matrix?.slice(0, 2).every((entry) => entry.business_durable_writes === 0 && entry.W6_durable_state_writes === 0)
  && p05Day7Edge?.checkpoint_first_intake_second_race?.business_durable_writes === 0
  && p05Day7Edge?.checkpoint_first_intake_second_race?.W6_durable_state_writes === 0
  && p05Day7Edge?.independent_outcomes?.business_commit === "not_committed_on_guard_rejection"
  && p05Day7Edge?.independent_outcomes?.business_write_count === 0, p05Day7Edge);
assert("P06_records_consumed_authorization_separately_from_rejected_business_commit", p06?.minimum_test_action.includes("after_approve_exercise_receipt_then_checkpoint_then_final_guard_race_with_closed_at_less_than_or_equal_to_day7ExpectedAt")
  && p06?.minimum_test_action.includes("capture_human_authorization_capability_consumption_separately_from_business_commit_and_write_outcomes")
  && p06?.expected_result.includes("approved_human_capability_may_be_consumed_before_a_final_guard_rejection_without_any_business_or_W6_durable_state_write")
  && p06?.expected_result.includes("approval_outcome_does_not_imply_business_commit_or_Day30_eligibility")
  && p06?.failure_criteria.includes("approval_is_reported_as_business_commit_when_the_final_Day7_guard_rejects")
  && p06?.failure_criteria.includes("checkpoint_first_intake_second_rejection_mutates_business_or_W6_durable_state"), p06);
const p05D1Observation = p05?.batch_d1_observation_action_contract;
const p06D1Approval = p06?.batch_d1_approval_contract;
const expectedD1ObservationActions = ["enter_observation", "record_day_7", "record_day_30"];
assert("P05_P06_cover_enter_unlocked_authorization_and_atomic_commit", p05D1Observation?.workflow_id === "W6"
  && p05D1Observation?.workflow_count_after_extension === 6
  && equalArrays(p05D1Observation?.actions ?? [], expectedD1ObservationActions)
  && p05D1Observation?.enter_observation?.phase === "observation"
  && p05D1Observation?.enter_observation?.human_authorization_required === true
  && equalArrays(p05D1Observation?.enter_observation?.authorization_wait_resource_locks_held ?? [], [])
  && equalArrays(p05D1Observation?.enter_observation?.authorization_wait_business_writes ?? [], [])
  && p05D1Observation?.enter_observation?.commit_boundary === "single_atomic_commit_inside_full_case_cluster_improvement_resource_lock_after_trusted_clock_recheck"
  && p05D1Observation?.enter_observation?.AI_used === false
  && equalArrays(p06D1Approval?.scope_actions ?? [], expectedD1ObservationActions)
  && p06D1Approval?.human_authorized_action === "enter_observation"
  && p06D1Approval?.authorization_phase === "observation"
  && equalArrays(p06D1Approval?.authorization_wait_resource_locks_held ?? [], [])
  && p06D1Approval?.deny_boundary === "stop_before_business_lock_and_business_commit_with_zero_business_writes"
  && p06D1Approval?.approve_boundary === "bind_the_exact_enter_observation_transition_then_recheck_trusted_clock_and_commit_once_inside_the_full_resource_lock", {
  P05: p05D1Observation?.enter_observation,
  P06: p06D1Approval,
});
assert("P05_covers_system_generated_cycle_clock_timestamp_and_receipt", equalArrays(p05D1Observation?.enter_observation?.caller_allowed_fields ?? [], ["action", "event_id", "case_ids", "cluster_id", "improvement_id", "actor", "reason"])
  && equalArrays(p05D1Observation?.enter_observation?.system_generated_fields ?? [], ["cycle_id", "history_id", "receipt_id", "occurred_at", "clock_source"])
  && equalArrays(p05D1Observation?.enter_observation?.caller_forbidden_fields ?? [], ["cycle_id", "history_id", "receipt_id", "occurred_at", "clock_source", "grant", "principal", "policy_version"])
  && p05?.minimum_test_action.includes("attempt_to_inject_cycle_clock_timestamp_history_receipt_grant_principal_and_policy_fields")
  && p05?.expected_result.includes("cycle_history_receipt_occurrence_time_and_clock_source_are_generated_by_trusted_system_ports_and_repository_state")
  && p05?.failure_criteria.includes("enter_observation_commits_outside_one_full_resource_lock_or_accepts_caller_generated_trusted_fields"), p05D1Observation?.enter_observation);
const p05D1Day7 = p05D1Observation?.record_day_7;
const p05D1Day30 = p05D1Observation?.record_day_30;
assert("P05_covers_day7_day30_without_caller_actor_AI_or_authorizer", [p05D1Day7, p05D1Day30].every((action) => equalArrays(action?.caller_allowed_fields ?? [], ["action", "event_id", "case_ids", "cluster_id", "improvement_id", "cycle_id", "related_task_volume"])
    && action?.caller_actor_allowed === false
    && action?.AI_used === false
    && action?.human_authorizer_called === false
    && action?.transaction_boundary === "separate_deterministic_checkpoint_transaction_at_exact_expected_at_with_clock_source_match_and_lock_wait_recheck"
    && equalArrays(action?.system_generated_fields ?? [], ["history_id", "receipt_id", "occurred_at", "clock_source", "recurrence_case_ids", "checkpoint_id"])
    && equalArrays(action?.caller_forbidden_fields ?? [], ["actor", "AI", "authorizer", "history_id", "receipt_id", "occurred_at", "clock_source", "recurrence_case_ids", "checkpoint_id"]))
  && p05D1Day30?.committed_day_7_required === true
  && p05D1Day30?.cumulative_includes_day_7 === true
  && equalArrays(p06D1Approval?.deterministic_actions_without_human_authorization ?? [], ["record_day_7", "record_day_30"])
  && p06D1Approval?.separate_transaction_rule === "No Day7 or Day30 checkpoint is created or committed in the enter_observation authorization transaction.", { day7: p05D1Day7, day30: p05D1Day30 });
assert("P05_checkpoint_sources_are_committed_and_day30_is_cumulative_with_null_rate", equalArrays(p05D1Observation?.recurrence_source_contract?.allowed_authoritative_sources ?? [], ["committed_active_observation_intake_history_for_same_cycle", "committed_recurrence_reopen_cycle_facts_for_same_cycle"])
  && equalArrays(p05D1Observation?.recurrence_source_contract?.excluded_sources ?? [], ["candidate", "authorization_only", "receipt_only", "rejected", "rolled_back", "uncommitted", "other_cycle"])
  && p05D1Observation?.recurrence_source_contract?.Day30_is_cumulative === true
  && p05D1Observation?.rate_contract?.related_task_volume_allowed === "null_or_positive_safe_integer_not_below_authoritative_recurrence_count"
  && p05D1Observation?.rate_contract?.null_denominator_result === "preserve_recurrence_count_and_set_recurrence_rate_null"
  && p05?.expected_result.includes("only_committed_active_intake_and_committed_recurrence_reopen_history_for_the_same_cycle_are_checkpoint_sources")
  && p05?.expected_result.includes("record_day_30_requires_committed_Day7_and_cumulatively_contains_all_Day7_recurrence_sources")
  && p05?.expected_result.includes("null_related_task_volume_preserves_recurrence_count_and_sets_recurrence_rate_null"), {
  source: p05D1Observation?.recurrence_source_contract,
  rate: p05D1Observation?.rate_contract,
});
assert("P05_separates_audit_repair_from_cached_event_replay", p05D1Observation?.audit_repair_and_event_replay_contract?.audit_pending === "business_result_remains_authoritative_and_only_the_same_audit_identity_may_be_repaired"
  && p05D1Observation?.audit_repair_and_event_replay_contract?.same_event_same_payload === "return_cached_business_result_and_repair_pending_audit_only"
  && p05D1Observation?.audit_repair_and_event_replay_contract?.same_event_different_payload === "event_conflict"
  && equalArrays(p05D1Observation?.audit_repair_and_event_replay_contract?.forbidden_on_replay ?? [], ["regenerate_ids", "repeat_authorization", "repeat_business_commit", "repeat_business_write", "rerun_AI"])
  && p05?.minimum_test_action.includes("force_audit_pending_then_replay_the_same_event_and_verify_audit_only_repair_without_business_reexecution")
  && p05?.expected_result.includes("audit_pending_repair_and_same_event_replay_return_the_cached_business_result_without_regenerating_IDs_authorizing_or_committing_business")
  && p05?.failure_criteria.includes("audit_only_repair_or_same_event_replay_reauthorizes_regenerates_IDs_or_repeats_business_writes"), p05D1Observation?.audit_repair_and_event_replay_contract);
assert("P11_P12_P13_keep_rules_OAuth_and_admin_gates", probeSuite.probes[11].depends_on.includes("P11")
  && probeSuite.probes[12].depends_on.includes("P11")
  && [probeSuite.probes[10], probeSuite.probes[11], probeSuite.probes[12]].every((probe) => probe.required_actors.some((actor) => actor.includes("participant")) && probe.required_actors.some((actor) => actor.includes("administrator"))), {
  P11: probeSuite.probes[10],
  P12: probeSuite.probes[11],
  P13: probeSuite.probes[12],
});
const expectedP13MinimumActions = [
  "record_official_version_and_help",
  "participant_runs_config_and_OAuth",
  "run_auth_status_verify",
  "run_exact_auth_check_for_bitable_app_readonly",
  "machine_verify_dedicated_application_binding_without_persisting_identifiers",
  "perform_read_only_Base_schema_probe_before_any_write",
];
assert("P13_auth_scope_gate_is_exact_and_auth_scopes_diagnostic_never_expands_permission",
  equalArrays(probeSuite.probes[12].minimum_test_action, expectedP13MinimumActions)
  && !probeSuite.probes[12].minimum_test_action.includes("run_auth_scopes")
  && probeSuite.probes[12].expected_result.includes("auth_scopes_is_optional_limited_diagnostic_and_never_requires_application_self_manage")
  && probeSuite.probes[12].failure_criteria.includes("auth_scopes_diagnostic_is_treated_as_a_hard_gate_or_application_self_manage_is_requested")
  && probeSuite.probes[12].failure_criteria.includes("P13_is_completed_before_the_P12_read_only_Base_schema_probe_has_a_real_result"),
probeSuite.probes[12]);

assert("probe_source_hashes_match_frozen_logical_and_build_packages", probeSuite.sources.logical_manifest.sha256 === sha256(logicalManifestText)
  && probeSuite.sources.logical_manifest.manifest_version === "0.1.6"
  && probeSuite.sources.build_package.sha256 === sha256(buildPackageText)
  && probeSuite.sources.build_package.package_version === "0.1.5", probeSuite.sources);
assert("import_source_hashes_match_frozen_contracts", importPlan.contract_sources.canonical_manifest.sha256 === sha256(canonicalManifestText)
  && importPlan.contract_sources.logical_manifest.sha256 === sha256(logicalManifestText)
  && importPlan.contract_sources.build_package.sha256 === sha256(buildPackageText)
  && importPlan.contract_sources.canonical_manifest.contract_projection_sha256 === canonical.fixture_index.contract_projection_sha256, importPlan.contract_sources);
assert("canonical_schema_fixture_and_scope_remain_frozen", canonical.schema_version === "1.0.0-draft.2"
  && canonical.fixture_index.fixture_version === "1.0.0-t1-r2"
  && canonical.data_scope === "synthetic_experiment"
  && logical.default_schema_version === canonical.schema_version, {
  schema: canonical.schema_version,
  fixture: canonical.fixture_index.fixture_version,
  scope: canonical.data_scope,
});

const canonicalTableByKey = new Map(canonical.tables.map((table) => [table.name, table]));
const batchByTable = new Map(importPlan.table_batches.map((batch) => [batch.canonical_table_key, batch]));
assert("import_plan_has_exact_10_canonical_table_keys", importPlan.counts.table_batches === 10
  && importPlan.table_batches.length === 10
  && equalSets(importPlan.table_batches.map((batch) => batch.canonical_table_key), expectedTableKeys)
  && importPlan.table_batches.every((batch) => batch.source_table_ref === `canonical://tables/${batch.canonical_table_key}`
    && batch.field_contract_ref === `logical://effective_fields/${batch.canonical_table_key}`), importPlan.table_batches.map((batch) => batch.canonical_table_key));

const tableSourceErrors = [];
for (const batch of importPlan.table_batches) {
  const canonicalTable = canonicalTableByKey.get(batch.canonical_table_key);
  if (!canonicalTable) {
    tableSourceErrors.push(`${batch.canonical_table_key}: missing canonical table`);
    continue;
  }
  const sourceText = snapshotA[`canonicalTable_${batch.canonical_table_key}`]?.text;
  if (batch.source_file_sha256 !== sha256(sourceText)) tableSourceErrors.push(`${batch.canonical_table_key}: sha256`);
  if (batch.source_file_ref !== `canonical://tables/${batch.canonical_table_key}/file`) tableSourceErrors.push(`${batch.canonical_table_key}: file ref`);
  if (batch.primary_key_ref !== `canonical://tables/${batch.canonical_table_key}/primary_key`) tableSourceErrors.push(`${batch.canonical_table_key}: primary ref`);
  if (batch.expected_row_count_ref !== `canonical://tables/${batch.canonical_table_key}/row_count`) tableSourceErrors.push(`${batch.canonical_table_key}: row ref`);
  if ("fields" in batch || "field_order" in batch || "enum_values" in batch) tableSourceErrors.push(`${batch.canonical_table_key}: copied field contract`);
}
assert("all_10_import_sources_are_hash_locked_without_contract_copy", tableSourceErrors.length === 0, tableSourceErrors);

const importUnits = [importPlan.preflight, ...importPlan.table_batches, ...importPlan.relation_backfills, importPlan.final_verification];
const importGraph = graphDiagnostics(importUnits, "unit_id");
assert("import_execution_graph_has_13_ordered_acyclic_units", importPlan.counts.execution_units === 13
  && importUnits.length === 13
  && equalArrays(importPlan.execution_order, importUnits.slice().sort((left, right) => left.order - right.order).map((unit) => unit.unit_id))
  && equalArrays(importUnits.map((unit) => unit.order).sort((left, right) => left - right), Array.from({ length: 13 }, (_, index) => index + 1))
  && importGraph.missingDependencies.length === 0
  && importGraph.dependencyOrderErrors.length === 0
  && importGraph.cycles.length === 0, importGraph);
assert("import_policy_has_dry_run_small_serial_batches_and_resume", importPlan.batch_policy.planned_batch_size === 25
  && importPlan.batch_policy.single_Base_write_concurrency === 1
  && importPlan.batch_policy.dry_run_required === true
  && importPlan.batch_policy.checkpoint.after_each_committed_chunk === true
  && importPlan.batch_policy.resume.allowed_from_last_committed_checkpoint === true
  && importPlan.batch_policy.idempotency.unknown_commit_state.includes("read_back"), importPlan.batch_policy);
assert("import_environment_keeps_nodes_automation_and_sharing_off", importPlan.batch_policy.execution_environment.includes("keep_all_AI_nodes_automations_bots_and_sharing_disabled_during_import")
  && importPlan.batch_policy.execution_environment.includes("do_not_enable_any_trigger_until_final_reconciliation_and_independent_review"), importPlan.batch_policy.execution_environment);
assert("live_import_bindings_fail_closed_on_git_ignore", importPlan.runtime_binding.fail_closed_gate.includes("git check-ignore")
  && importPlan.runtime_binding.fail_closed_gate.includes("stop without loading a resource value"), importPlan.runtime_binding);

const logicalRelations = logical.tables.flatMap((table) => table.fields
  .filter((field) => typeof field.target === "string")
  .map((field) => ({ source: table.key, target: field.target, ref: `logical://tables/${table.key}/fields/${field.key}` })));
const inlineRelationRefs = importPlan.table_batches.flatMap((batch) => batch.inline_relation_refs);
const deferredRelationRefs = importPlan.table_batches.flatMap((batch) => batch.deferred_relation_refs);
assert("import_relation_partition_is_exactly_8_inline_plus_1_deferred", logicalRelations.length === 9
  && importPlan.counts.logical_relations === 9
  && inlineRelationRefs.length === 8
  && deferredRelationRefs.length === 1
  && equalSets([...inlineRelationRefs, ...deferredRelationRefs], logicalRelations.map((relation) => relation.ref))
  && deferredRelationRefs[0] === "logical://tables/cases/fields/cluster_id", {
  inlineRelationRefs,
  deferredRelationRefs,
});

const inlineDependencyErrors = [];
for (const batch of importPlan.table_batches) {
  for (const relationRef of batch.inline_relation_refs) {
    const relation = logicalRelations.find((entry) => entry.ref === relationRef);
    const targetBatch = batchByTable.get(relation?.target);
    if (!relation || !targetBatch || targetBatch.order >= batch.order || !hasDependencyPath(importUnits, "unit_id", batch.unit_id, targetBatch.unit_id)) {
      inlineDependencyErrors.push(`${batch.unit_id}: ${relationRef}`);
    }
  }
}
assert("every_inline_relation_target_precedes_and_is_a_dependency", inlineDependencyErrors.length === 0, inlineDependencyErrors);

const deferredBackfill = importPlan.relation_backfills[0];
assert("cases_clusters_cycle_is_split_by_one_safe_backfill", importPlan.relation_backfills.length === 1
  && deferredBackfill.field_ref === deferredRelationRefs[0]
  && deferredBackfill.source_table_key === "cases"
  && deferredBackfill.target_table_key === "clusters"
  && deferredBackfill.depends_on.includes(batchByTable.get("cases").unit_id)
  && deferredBackfill.depends_on.includes(batchByTable.get("clusters").unit_id)
  && deferredBackfill.dry_run.includes("report_zero_orphan_and_zero_ambiguous_target"), deferredBackfill);
const multiNodeComponents = stronglyConnectedComponents(expectedTableKeys, logicalRelations.map((relation) => [relation.source, relation.target])).filter((component) => component.length > 1);
assert("canonical_relation_graph_has_only_cases_clusters_SCC", multiNodeComponents.length === 1 && equalArrays(multiNodeComponents[0], ["cases", "clusters"]), multiNodeComponents);
assert("final_import_reconciliation_is_zero_delta_and_zero_orphan", importPlan.final_verification.checks.includes("zero_orphan_or_ambiguous_relations_across_all_nine_relation_refs")
  && importPlan.final_verification.checks.includes("second_identical_dry_run_plans_zero_creates_zero_updates_and_zero_deletes")
  && importPlan.final_verification.checks.includes("ai_audit_seed_import_count_is_zero"), importPlan.final_verification.checks);

const expectedEvidenceRefByTable = new Map(evidenceTemplate.tables.map((unit, index) => [unit.logical_key, `../evidence/on-site-evidence-template.json#/tables/${index}`]));
assert("import_batches_reuse_existing_T01_T10_evidence_units", importPlan.table_batches.every((batch) => batch.evidence_unit_ref === expectedEvidenceRefByTable.get(batch.canonical_table_key))
  && deferredBackfill.evidence_unit_ref === expectedEvidenceRefByTable.get("cases")
  && equalSets(importPlan.preflight.evidence_unit_refs, [...expectedEvidenceRefByTable.values()])
  && equalSets(importPlan.final_verification.evidence_unit_refs, [...expectedEvidenceRefByTable.values()]), importPlan.table_batches.map((batch) => [batch.canonical_table_key, batch.evidence_unit_ref]));

assert("smoke_sources_are_hash_locked", smokePlan.sources.canonical_manifest.sha256 === sha256(canonicalManifestText)
  && smokePlan.sources.main_story.sha256 === sha256(mainStoryText)
  && smokePlan.sources.failure_drills.sha256 === sha256(failureDrillsText)
  && smokePlan.sources.logical_manifest.sha256 === sha256(logicalManifestText), smokePlan.sources);
const expectedSmokeIds = ["SMK-01", "SMK-02", "SMK-03", "SMK-04", "SMK-05"];
const expectedFailureIds = [
  "DRILL-IDEMPOTENCY-001",
  "DRILL-MISSING-ENTITY-IDS-001",
  "DRILL-INVALID-AI-SCHEMA-001",
  "DRILL-SLA-TIMEOUT-001",
];
assert("smoke_plan_has_SYN_CASE_017_plus_four_exact_failures", smokePlan.counts.main_stories === 1
  && smokePlan.counts.failure_drills === 4
  && smokePlan.counts.smoke_units === 5
  && equalArrays(smokePlan.smoke_units.map((unit) => unit.smoke_id), expectedSmokeIds)
  && smokePlan.smoke_units[0].fixture_id_assertion === "SCN-SYN-CASE-017-MAIN-001"
  && equalArrays(smokePlan.smoke_units.slice(1).map((unit) => unit.fixture_id_assertion), expectedFailureIds)
  && smokePlan.smoke_units.every((unit) => unit.source_case_id_assertion === "SYN-CASE-017"), smokePlan.smoke_units);
assert("smoke_sequence_is_strict_and_reset_between_units", equalArrays(smokePlan.run_policy.strict_sequence, expectedSmokeIds)
  && smokePlan.run_policy.one_unit_at_a_time === true
  && smokePlan.run_policy.reset_between_units === true
  && smokePlan.run_policy.stop_on_first_unexpected_result === true, smokePlan.run_policy);
assert("scenario_fixtures_remain_not_run_and_empty", mainStory.records.length === 1
  && mainStory.records[0].execution_status === "not_run"
  && mainStory.records[0].run_evidence.length === 0
  && mainStory.records[0].observed_results.length === 0
  && failureDrills.records.every((record) => record.execution_status === "not_run" && record.run_evidence.length === 0 && record.observed_results.length === 0), {
  main: mainStory.records[0].execution_status,
  failures: failureDrills.records.map((record) => record.execution_status),
});
assert("scenario_fixture_is_not_runtime_evidence_or_mutation_target", smokePlan.seed_policy.fixture_is_run_evidence === false
  && smokePlan.seed_policy.source_snapshot_mutation_allowed === false
  && smokePlan.seed_policy.runtime_copy_required === true
  && smokePlan.seed_policy.replay_reset_required === true
  && smokePlan.run_policy.never_use_expected_fixture_fields_as_observed_result === true, smokePlan.seed_policy);
assert("invalid_AI_schema_smoke_keeps_one_retry_and_human_stop", failureDrills.records[2].drill_id === "DRILL-INVALID-AI-SCHEMA-001"
  && failureDrills.records[2].retry_policy.max_retries === 1
  && failureDrills.records[2].retry_policy.same_node_version_required === true
  && smokePlan.smoke_units[3].retry_policy_ref.endsWith("/retry_policy")
  && smokePlan.smoke_units[3].failure_stop.includes("second retry"), smokePlan.smoke_units[3]);
assert("smoke_plan_preserves_human_gates_evidence_and_failure_stops", smokePlan.smoke_units.every((unit) => typeof unit.human_gates_ref === "string"
  && unit.evidence_capture_ref === "#/run_policy/evidence_capture"
  && unit.reset_ref === "#/run_policy/reset"
  && typeof unit.failure_stop === "string" && unit.failure_stop.length > 0)
  && smokePlan.run_policy.human_gate_rule.includes("authorized human decision")
  && smokePlan.run_policy.failure_stop.includes("preserve_original_state_sla_audit_and_actual_envelopes"), smokePlan.run_policy);
assert("smoke_workflow_refs_resolve_to_frozen_order", smokePlan.smoke_units[0].workflow_sequence_ref === "logical://integration_order"
  && smokePlan.smoke_units.slice(1).every((unit) => unit.workflow_phase_refs.every((ref) => {
    const match = ref.match(/^logical:\/\/integration_order\/(\d+)$/);
    return match && Number(match[1]) < logical.integration_order.length;
  })), smokePlan.smoke_units.map((unit) => unit.workflow_phase_refs ?? unit.workflow_sequence_ref));

const activeRecurrenceActionKey = "intake_active_observation_recurrence";
const activeRecurrenceActionLocations = logical.workflows.flatMap((workflow) =>
  (workflow.internal_authorized_actions ?? [])
    .filter((action) => action.action === activeRecurrenceActionKey)
    .map(() => workflow.key),
);
const w6InternalActionSmoke = smokePlan.smoke_units[0].w6_internal_action_smoke;
assert("smoke_keeps_internal_action_only_in_W6_and_workflow_count_six", equalArrays(activeRecurrenceActionLocations, ["W6"])
  && logical.workflows.length === 6
  && w6InternalActionSmoke?.action === activeRecurrenceActionKey
  && w6InternalActionSmoke?.workflow_id === "W6"
  && w6InternalActionSmoke?.workflow_count_after_extension === 6, {
  logical_locations: activeRecurrenceActionLocations,
  smoke: w6InternalActionSmoke,
});
assert("smoke_active_intake_sequence_stops_at_N5_receipt_human_full_lock", equalArrays(w6InternalActionSmoke?.strict_sequence ?? [], [
  "N5_existing_cluster",
  "repository_issued_N5_action_scoped_receipt",
  "human_recurrence_approve_or_deny",
  "atomic_intake_inside_full_resource_lock",
])
  && equalArrays(w6InternalActionSmoke?.human_decision_checks ?? [], [
    "deny_stops_before_intake",
    "approve_is_recorded_before_intake",
    "authorization_and_checkpoint_do_not_share_a_transaction",
  ]), w6InternalActionSmoke);
assert("smoke_write_set_allows_only_cluster_membership_and_append_only_recurrence_audit", equalArrays(w6InternalActionSmoke?.allowed_writes ?? [], [
  "clusters.member_case_ids",
  "append_clusters.recurrence_records",
  "append_ai_audit",
])
  && equalArrays(w6InternalActionSmoke?.forbidden_writes ?? [], [
    "cases.cluster_id",
    "cases.status",
    "feedback_ownership",
    "clusters.status",
    "improvements.*",
    "observation_cycle.*",
  ]), w6InternalActionSmoke);
assert("smoke_covers_bidirectional_single_use_receipt_isolation", equalArrays(w6InternalActionSmoke?.receipt_isolation_checks ?? [], [
  "N5_receipt_cannot_authorize_N6",
  "N6_receipt_cannot_authorize_intake_active_observation_recurrence",
  "receipt_is_single_use_and_bound_to_the_authorized_action",
]), w6InternalActionSmoke?.receipt_isolation_checks);
assert("smoke_fails_closed_on_atomicity_denominator_archive_and_knowledge_publication", equalArrays(w6InternalActionSmoke?.atomic_failure_checks ?? [], [
  "no_partial_member_case_id_write",
  "no_partial_recurrence_record",
  "failed_result_has_failure_audit_or_audit_pending",
  "successful_business_commit_survives_audit_failure_with_audit_pending",
  "same_workflow_audit_id_repair_only_does_not_repeat_N5_authorization_or_business_write",
  "preserve_observation_clock_and_pre_intake_snapshot",
  "Day7_guard_rejection_keeps_business_durable_writes_zero",
  "Day7_guard_rejection_keeps_W6_durable_state_writes_zero",
])
  && equalArrays(w6InternalActionSmoke?.checkpoint_checks ?? [], [
    "read_only_committed_intake",
    "no_denominator_means_rate_null",
    "Day7_and_Day30_are_deterministic",
    "archive_requires_human_conclusion",
    "knowledge_is_not_auto_published",
  ]), w6InternalActionSmoke);
const smokeDay7Edge = w6InternalActionSmoke?.day7_edge_matrix;
assert("smoke_covers_Day7_lte_cutoff_dual_guard_race_zero_write_and_separate_outcomes", smokeDay7Edge?.shared_window === "opened_at < closed_at <= min(occurred_at, day30ExpectedAt)"
  && equalArrays(smokeDay7Edge?.day7_sealed_if ?? [], ["day7_checkpoint_exists", "occurred_at > day7ExpectedAt"])
  && equalArrays(smokeDay7Edge?.guard_points ?? [], ["before_repository_receipt_issue", "inside_full_resource_lock_immediately_before_business_commit"])
  && equalArrays(smokeDay7Edge?.pre_receipt_cases?.map((entry) => `${entry.closed_at_relation}:${entry.expected_decision}`) ?? [], [
    "closed_at < day7ExpectedAt:reject",
    "closed_at == day7ExpectedAt:reject",
    "closed_at > day7ExpectedAt:Day30_eligible_not_committed_by_this_check",
  ])
  && smokeDay7Edge?.pre_receipt_cases?.slice(0, 2).every((entry) => entry.receipt_issued === false && entry.business_durable_writes === 0 && entry.W6_durable_state_writes === 0)
  && equalArrays(smokeDay7Edge?.checkpoint_first_intake_second_race?.order ?? [], [
    "N5_receipt_issued",
    "human_recurrence_authorization_consumed",
    "Day7_checkpoint_committed",
    "final_guard_rechecked_inside_full_resource_lock",
  ])
  && smokeDay7Edge?.checkpoint_first_intake_second_race?.closed_at_condition === "closed_at <= day7ExpectedAt"
  && smokeDay7Edge?.checkpoint_first_intake_second_race?.expected_decision === "reject"
  && smokeDay7Edge?.checkpoint_first_intake_second_race?.capability_consumption_outcome?.N5 === "consumed"
  && smokeDay7Edge?.checkpoint_first_intake_second_race?.capability_consumption_outcome?.human_authorization === "consumed"
  && smokeDay7Edge?.checkpoint_first_intake_second_race?.business_commit_outcome === "not_committed"
  && smokeDay7Edge?.checkpoint_first_intake_second_race?.business_durable_writes === 0
  && smokeDay7Edge?.checkpoint_first_intake_second_race?.W6_durable_state_writes === 0, smokeDay7Edge);
const d1ObservationSmoke = smokePlan.smoke_units[0].batch_d1_observation_action_smoke;
assert("smoke_observation_actions_are_exact_three_and_fail_closed", d1ObservationSmoke?.workflow_id === "W6"
  && d1ObservationSmoke?.workflow_count_after_extension === 6
  && equalArrays(d1ObservationSmoke?.actions ?? [], expectedD1ObservationActions)
  && equalArrays(d1ObservationSmoke?.excluded_actions ?? [], ["archive_observation", "reopen_recurrence"])
  && equalArrays(d1ObservationSmoke?.excluded_action_categories ?? [], ["archive", "reopen"])
  && equalArrays(d1ObservationSmoke?.enter_observation?.order ?? [], ["load_authoritative_executing_improvement", "wait_for_human_authorization_with_zero_resource_locks", "recheck_trusted_clock_inside_full_resource_lock", "validate_authorization_capability_and_CAS", "atomically_commit_observation_cycle_history_and_receipt"])
  && equalArrays(d1ObservationSmoke?.enter_observation?.authorization_wait_resource_locks_held ?? [], [])
  && equalArrays(d1ObservationSmoke?.enter_observation?.authorization_wait_business_writes ?? [], [])
  && d1ObservationSmoke?.enter_observation?.AI_calls === 0
  && [d1ObservationSmoke?.record_day_7, d1ObservationSmoke?.record_day_30].every((action) => action?.transaction === "independent_deterministic_checkpoint_transaction"
    && action?.caller_actor_allowed === false
    && action?.AI_calls === 0
    && action?.human_authorizer_calls === 0
    && action?.lock_wait_recheck_required === true)
  && d1ObservationSmoke?.record_day_30?.committed_Day7_required === true
  && d1ObservationSmoke?.record_day_30?.cumulative_source_rule === "Day30_recurrence_case_ids_include_every_committed_Day7_source"
  && equalArrays(d1ObservationSmoke?.checkpoint_history_checks?.allowed_sources ?? [], ["committed_active_observation_intake_history_for_same_cycle", "committed_recurrence_reopen_cycle_facts_for_same_cycle"])
  && equalArrays(d1ObservationSmoke?.checkpoint_history_checks?.excluded_sources ?? [], ["candidate", "authorization_only", "receipt_only", "rejected", "rolled_back", "uncommitted", "other_cycle"])
  && d1ObservationSmoke?.checkpoint_history_checks?.null_denominator_rule === "preserve_authoritative_recurrence_count_and_set_recurrence_rate_null"
  && equalArrays(d1ObservationSmoke?.audit_repair_and_replay_checks?.business_reexecution_forbidden ?? [], ["regenerate_ids", "repeat_authorization", "repeat_business_commit", "repeat_business_write", "rerun_AI"])
  && /preserve the full prior durable state and actual trace/.test(d1ObservationSmoke?.failure_stop ?? ""), d1ObservationSmoke);

const w6EvidenceUnit = evidenceTemplate.workflows.find((unit) => unit.key === "W6");
assert("W6_evidence_unit_requires_receipts_boundaries_snapshots_null_rate_and_D1_actions", evidenceTemplate.template_version === "0.1.6"
  && w6EvidenceUnit?.status === "未测试"
  && w6EvidenceUnit?.actual_result === null
  && equalArrays(w6EvidenceUnit?.required_evidence_items ?? [], [
    "N5_existing_cluster_repository_receipt_with_action_and_validation_fingerprint",
    "human_recurrence_approve_or_deny_decision_with_actor_and_time",
    "atomic_intake_receipt_bound_to_intake_active_observation_recurrence",
    "pre_intake_cluster_case_feedback_improvement_and_observation_snapshots",
    "post_intake_cluster_case_feedback_improvement_and_observation_snapshots",
    "Day7_or_Day30_checkpoint_source_points_to_committed_intake_and_original_observation_clock",
    "failed_intake_rollback_proves_no_partial_membership_or_recurrence_record",
    "failure_result_audit_or_audit_pending_with_workflow_audit_id",
    "successful_business_commit_with_audit_pending_and_same_audit_id_repair_without_N5_authorization_or_business_replay",
    "receipt_cross_reuse_rejection_for_N5_to_N6_and_N6_to_intake_active_observation_recurrence",
    "no_denominator_rate_null_result_when_applicable",
    "human_archive_conclusion_and_no_automatic_knowledge_publication",
    "Day7_shared_window_values_opened_at_closed_at_occurred_at_day7ExpectedAt_day30ExpectedAt",
    "pre_receipt_Day7_guard_decision_and_receipt_not_issued_proof",
    "final_full_lock_Day7_guard_decision_after_checkpoint_first_intake_second_race",
    "closed_at_less_than_equal_to_and_greater_than_day7ExpectedAt_matrix_results",
    "before_after_business_and_W6_durable_state_snapshots_proving_zero_writes_on_rejection",
    "capability_consumption_outcome_captured_separately_from_business_commit_and_write_outcomes",
    "enter_observation_human_authorization_in_observation_phase_and_zero_resource_locks_while_waiting",
    "enter_observation_system_generated_cycle_history_receipt_occurred_at_and_clock_source_provenance",
    "enter_observation_atomic_commit_before_after_snapshot_and_trusted_clock_recheck",
    "record_day_7_has_no_caller_actor_AI_or_authorizer_and_uses_an_independent_transaction",
    "record_day_30_has_no_caller_actor_AI_or_authorizer_and_uses_an_independent_transaction",
    "checkpoint_committed_active_intake_and_committed_recurrence_reopen_history_source_refs",
    "Day30_cumulative_source_superset_of_committed_Day7_with_related_task_volume_and_recurrence_rate_pair",
    "audit_pending_same_identity_repair_and_same_event_replay_with_zero_business_reexecution",
    "D1_archive_and_reopen_actions_not_invoked_while_committed_reopen_history_remains_read_only",
  ]), w6EvidenceUnit);
const w6Day7Evidence = w6EvidenceUnit?.day7_edge_evidence_contract;
assert("W6_evidence_separates_guard_capability_business_and_zero_write_proof", w6Day7Evidence?.shared_window === "opened_at < closed_at <= min(occurred_at, day30ExpectedAt)"
  && equalArrays(w6Day7Evidence?.day7_sealed_evidence ?? [], ["day7_checkpoint_exists", "occurred_at > day7ExpectedAt"])
  && equalArrays(w6Day7Evidence?.guard_evidence?.map((entry) => entry.guard_point) ?? [], [
    "before_repository_receipt_issue",
    "inside_full_resource_lock_immediately_before_business_commit",
  ])
  && equalArrays(w6Day7Evidence?.boundary_matrix_evidence ?? [], [
    "closed_at < day7ExpectedAt_rejected",
    "closed_at == day7ExpectedAt_rejected",
    "closed_at > day7ExpectedAt_and_shared_window_passes_Day30_eligible",
  ])
  && equalArrays(w6Day7Evidence?.race_order_evidence ?? [], [
    "N5_receipt_issued",
    "human_recurrence_authorization_consumed",
    "Day7_checkpoint_committed",
    "final_guard_rejected",
  ])
  && w6Day7Evidence?.zero_write_evidence?.business_durable_writes === 0
  && w6Day7Evidence?.zero_write_evidence?.W6_durable_state_writes === 0
  && equalArrays(w6Day7Evidence?.independent_outcome_evidence ?? [], [
    "N5_capability_consumption",
    "N5_receipt_consumption",
    "human_authorization_capability_consumption",
    "business_commit_outcome",
    "business_write_count",
    "W6_durable_state_write_count",
  ]), w6Day7Evidence);
const d1ObservationEvidence = w6EvidenceUnit?.batch_d1_observation_evidence_contract;
assert("W6_evidence_requires_enter_checkpoint_and_replay_provenance", d1ObservationEvidence?.workflow_id === "W6"
  && equalArrays(d1ObservationEvidence?.actions ?? [], expectedD1ObservationActions)
  && equalArrays(d1ObservationEvidence?.scope_exclusions ?? [], ["archive", "reopen"])
  && equalArrays(d1ObservationEvidence?.scope_excluded_actions ?? [], ["archive_observation", "reopen_recurrence"])
  && ["authorization_phase_observation", "resource_locks_held_while_waiting", "business_writes_while_waiting", "trusted_clock_inside_full_resource_lock", "cycle_id_generation_provenance", "history_id_generation_provenance", "receipt_id_generation_provenance", "occurred_at_generation_provenance", "clock_source_generation_provenance", "before_durable_state", "after_durable_state", "commit_outcome", "AI_call_count"].every((field) => d1ObservationEvidence?.enter_observation_required_values?.includes(field))
  && ["expected_at", "actual_trusted_time", "cycle_clock_source", "actual_clock_source", "resource_lock_wait_recheck", "caller_actor_present", "AI_call_count", "human_authorizer_call_count", "checkpoint_id_generation_provenance", "recurrence_source_refs", "recurrence_rate", "before_durable_state", "after_durable_state", "commit_outcome"].every((field) => d1ObservationEvidence?.checkpoint_required_values?.includes(field))
  && equalArrays(d1ObservationEvidence?.record_day_30_required_comparison ?? [], ["committed_Day7_checkpoint_ref", "Day7_recurrence_case_ids", "Day30_recurrence_case_ids", "Day30_contains_all_Day7_sources", "same_cycle_proof", "related_task_volume_and_rate_pair"])
  && equalArrays(d1ObservationEvidence?.history_source_contract?.allowed ?? [], ["committed_active_observation_intake_history_for_same_cycle", "committed_recurrence_reopen_cycle_facts_for_same_cycle"])
  && equalArrays(d1ObservationEvidence?.history_source_contract?.excluded ?? [], ["candidate", "authorization_only", "receipt_only", "rejected", "rolled_back", "uncommitted", "other_cycle"])
  && equalArrays(d1ObservationEvidence?.null_denominator_required_values ?? [], ["authoritative_recurrence_case_ids", "recurrence_count_preserved", "related_task_volume_null", "recurrence_rate_null"])
  && ["ID_generation_count_before_after", "authorization_call_count_before_after", "business_commit_count_before_after", "business_write_count_before_after", "AI_call_count_before_after"].every((field) => d1ObservationEvidence?.replay_required_values?.includes(field))
  && ["resource_lock_during_enter_observation_authorization_wait", "caller_actor_for_record_day_7_or_record_day_30", "AI_call_for_any_D1_observation_action", "human_authorizer_call_for_record_day_7_or_record_day_30", "archive_action_invocation", "reopen_action_invocation", "business_reexecution_during_audit_only_repair_or_same_event_replay"].every((field) => d1ObservationEvidence?.expected_absence?.includes(field)), d1ObservationEvidence);

const legacyW6EvidenceResponsibilities = {
  required_evidence_items: w6EvidenceUnit?.required_evidence_items,
  day7_edge_evidence_contract: w6EvidenceUnit?.day7_edge_evidence_contract,
  batch_d1_observation_evidence_contract: w6EvidenceUnit?.batch_d1_observation_evidence_contract,
};
assert("W6_legacy_Day1_evidence_responsibilities_match_frozen_canonical_digest", canonicalSha256(legacyW6EvidenceResponsibilities) === "63a5bda74d86abdf5fba4774ea58a21e68eab73ca8843f6311ecf9bebf097080", legacyW6EvidenceResponsibilities);

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

const expectedR10EvidenceComponentRefs = {
  P02: "#/permission_checks/1/r10_selector_and_execution_mode_evidence_contract",
  P03: "#/permission_checks/2/r10_recurrence_visibility_and_attestation_evidence_contract",
  P05: "#/permission_checks/4/r10_outbox_cas_execution_evidence_contract",
  P06: "#/permission_checks/5/r10_reopen_authorization_evidence_contract",
  T04: "#/tables/3/r10_cluster_projection_evidence_contract",
  T05: "#/tables/4/r10_improvement_projection_evidence_contract",
  V04: "#/views/3/r10_raw_recurrence_visibility_evidence_contract",
  V05: "#/views/4/r10_raw_recurrence_visibility_evidence_contract",
};
const r10EvidenceBundle = {
  P02: evidenceTemplate.permission_checks[1]?.r10_selector_and_execution_mode_evidence_contract,
  P03: evidenceTemplate.permission_checks[2]?.r10_recurrence_visibility_and_attestation_evidence_contract,
  P05: evidenceTemplate.permission_checks[4]?.r10_outbox_cas_execution_evidence_contract,
  P06: evidenceTemplate.permission_checks[5]?.r10_reopen_authorization_evidence_contract,
  T04: evidenceTemplate.tables[3]?.r10_cluster_projection_evidence_contract,
  T05: evidenceTemplate.tables[4]?.r10_improvement_projection_evidence_contract,
  V04: evidenceTemplate.views[3]?.r10_raw_recurrence_visibility_evidence_contract,
  V05: evidenceTemplate.views[4]?.r10_raw_recurrence_visibility_evidence_contract,
  W6: w6EvidenceUnit?.r10_reopen_projection_evidence_contract,
};
const r10W6Evidence = r10EvidenceBundle.W6;
assert("R10_evidence_bundle_matches_frozen_nine_component_digest", canonicalSha256(r10EvidenceBundle) === "e44ee48c8a9880d0713062113b369578592dbc88b17f14ee88d1b87afa6528f6"
  && equalArrays(Object.keys(r10EvidenceBundle), ["P02", "P03", "P05", "P06", "T04", "T05", "V04", "V05", "W6"]), r10EvidenceBundle);
assert("R10_W6_is_projection_side_effect_with_existing_gates_and_no_new_unit_or_executor", r10W6Evidence?.identity?.workflow_id === "W6"
  && r10W6Evidence?.identity?.projector_key === "neoloop.feishu.w6-reopen.v1"
  && r10W6Evidence?.identity?.classification === "W6_projection_side_effect_not_a_seventh_workflow"
  && r10W6Evidence?.identity?.source_action === "reopen_recurrence"
  && equalArrays(r10W6Evidence?.identity?.required_probe_gates ?? [], ["P02", "P03", "P05", "P06"])
  && r10W6Evidence?.identity?.normalized_existing_evidence_unit_ref === "P02+P03"
  && r10W6Evidence?.identity?.creates_new_evidence_unit === false
  && r10W6Evidence?.identity?.creates_new_result_unit === false
  && r10W6Evidence?.identity?.workflow_count_effect === "unchanged_6"
  && r10W6Evidence?.identity?.real_executor_in_scope === false, r10W6Evidence?.identity);
assert("R10_component_refs_resolve_to_exact_existing_P02_P03_P05_P06_T04_T05_V04_V05_contracts", deepEqual(r10W6Evidence?.component_evidence_unit_refs, expectedR10EvidenceComponentRefs)
  && Object.entries(expectedR10EvidenceComponentRefs).every(([key, pointer]) => canonicalJson(resolveJsonPointer(evidenceTemplate, pointer)) === canonicalJson(r10EvidenceBundle[key])), r10W6Evidence?.component_evidence_unit_refs);
const expectedR10OnsiteState = {
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
const r10ActualSlots = collectActualSlots(r10EvidenceBundle);
assert("R10_all_component_actual_slots_and_W6_indexes_remain_empty_not_tested_insufficient_zero_operation", deepEqual(r10W6Evidence?.current_onsite_state, expectedR10OnsiteState)
  && r10ActualSlots.length > 0
  && r10ActualSlots.every((value) => value === null)
  && Array.isArray(r10W6Evidence?.r10_evidence_indexes)
  && r10W6Evidence.r10_evidence_indexes.length === 0
  && r10EvidenceBundle.P05?.current_durable_outbox_status === "not_tested"
  && r10EvidenceBundle.P05?.current_worker_lease_status === "not_tested", r10ActualSlots);

const p02R10Subchecks = p02?.r10_subchecks;
const p03R10Subchecks = p03?.r10_subchecks;
const r10ProbeSubchecks = [...(p02R10Subchecks?.checks ?? []), ...(p03R10Subchecks?.checks ?? [])];
const r10ProbeRoot = probeSuite.r10_existing_evidence_unit_contract;
const r10ProbeBundle = { root: r10ProbeRoot, P02: p02R10Subchecks, P03: p03R10Subchecks };
const expectedR10ProbeRoot = {
  normalized_existing_evidence_unit_ref: "P02+P03",
  component_probe_ids: ["P02", "P03"],
  component_evidence_unit_refs: ["evidence://on-site/P02", "evidence://on-site/P03"],
  creates_new_probe: false,
  creates_new_evidence_unit: false,
  execution_status: "not_tested",
  result: null,
  evidence: null,
  real_feishu_operations: 0,
};
function collectR10ProbeBundleIssues(bundle) {
  const issues = [];
  if (canonicalSha256(bundle) !== "1c4cb6def5a91348c4e24b8921e763be8d72d442207bff80606f5ee3b52c5e1b") issues.push("probe_bundle_digest");
  if (!exactOwnKeys(bundle?.root, Object.keys(expectedR10ProbeRoot))) issues.push("root.keys");
  if (bundle?.root?.normalized_existing_evidence_unit_ref !== "P02+P03"
    || !equalArrays(bundle?.root?.component_probe_ids ?? [], ["P02", "P03"])
    || !equalArrays(bundle?.root?.component_evidence_unit_refs ?? [], ["evidence://on-site/P02", "evidence://on-site/P03"])) issues.push("root.selector_and_refs");
  if (bundle?.root?.creates_new_probe !== false || bundle?.root?.creates_new_evidence_unit !== false) issues.push("root.no_new_unit");
  if (bundle?.root?.execution_status !== "not_tested") issues.push("root.execution_status");
  if (bundle?.root?.result !== null || bundle?.root?.evidence !== null) issues.push("root.result_or_evidence");
  if (bundle?.root?.real_feishu_operations !== 0) issues.push("root.real_feishu_operations");
  if (!deepEqual(bundle?.P02, p02R10Subchecks) || !deepEqual(bundle?.P03, p03R10Subchecks)) issues.push("component_contracts");
  return issues;
}
assert("R10_probe_root_P02_P03_bundle_matches_local_frozen_canonical_digest", equalArrays(collectR10ProbeBundleIssues(r10ProbeBundle), []), r10ProbeBundle);
assert("R10_probe_bundle_reuses_P02_plus_P03_with_five_blank_subchecks", p02R10Subchecks?.existing_evidence_unit_ref === "evidence://on-site/P02"
  && p03R10Subchecks?.existing_evidence_unit_ref === "evidence://on-site/P03"
  && p02R10Subchecks?.creates_new_probe === false
  && p02R10Subchecks?.creates_new_evidence_unit === false
  && p03R10Subchecks?.creates_new_probe === false
  && p03R10Subchecks?.creates_new_evidence_unit === false
  && deepEqual(r10ProbeRoot, expectedR10ProbeRoot)
  && equalArrays(r10ProbeSubchecks.map((check) => check.subcheck_id), [
    "P02-R10-selector-cardinality",
    "P02-R10-execution-mode",
    "P02-R10-attestation-base-component",
    "P03-R10-raw-recurrence-visibility",
    "P03-R10-attestation-lifecycle-and-recheck",
  ])
  && r10ProbeSubchecks.every((check) => check.execution_status === "not_tested" && check.result === null && check.evidence === null), r10ProbeSubchecks);
const r10Smoke = smokePlan.smoke_units[0]?.r10_reopen_projection_smoke;
assert("R10_SMK_01_contract_matches_frozen_digest_and_covers_sealed_plan_CAS_repair_redaction_and_manual_stop", canonicalSha256(r10Smoke) === "bf1cde883c8a9336993f7b72a5578106ff27a42b42edf9915aadd23a917fcbd9"
  && r10Smoke?.projector_key === "neoloop.feishu.w6-reopen.v1"
  && r10Smoke?.workflow_id === "W6"
  && r10Smoke?.classification === "W6_projection_side_effect_not_a_seventh_workflow"
  && equalArrays(r10Smoke?.required_probe_gate_contract?.required_probe_gates ?? [], ["P02", "P03", "P05", "P06"])
  && r10Smoke?.current_onsite_state?.verification_status === "not_tested"
  && r10Smoke?.current_onsite_state?.execution_mode === "insufficient"
  && r10Smoke?.current_onsite_state?.automatic_projection_enabled === false
  && r10Smoke?.sealed_plan_assertions?.complete_two_target_plan_required === true
  && r10Smoke?.sealed_plan_assertions?.seal_before_any_Base_write === true
  && r10Smoke?.snapshot_and_clear_assertions?.legal_miss_snapshot_append_count === 1
  && r10Smoke?.write_target_counts?.total === 9
  && r10Smoke?.observed_state_truth_table_assertions?.repair_reuses_original_sealed_plan === true
  && r10Smoke?.execution_preflight_recheck_assertions?.not_tested_or_insufficient === "manual_stop_zero_write"
  && r10Smoke?.dependency_failure_and_public_artifact_assertions?.normalized_safe_error === "projection_dependency_failure"
  && r10Smoke?.dependency_failure_and_public_artifact_assertions?.redaction_scan_failure_safe_error === "sensitive_output_rejected"
  && r10Smoke?.manual_stop_and_rollback_assertions?.automatic_projection_enabled === false, r10Smoke);
const logicalR10OnsiteBoundary = logical.workflows.find((workflow) => workflow.key === "W6")?.reopen_projection_contract?.onsite_boundary;
assert("R10_logical_onsite_boundary_remains_not_tested_with_no_resource_or_deployment_claim", logicalR10OnsiteBoundary?.platform_atomic_all_targets === "not_tested"
  && logicalR10OnsiteBoundary?.durable_sealed_outbox_CAS === "not_tested"
  && logicalR10OnsiteBoundary?.worker_lease === "not_tested"
  && logicalR10OnsiteBoundary?.exactly_once === "not_tested"
  && logicalR10OnsiteBoundary?.real_Base_resources === null
  && logicalR10OnsiteBoundary?.deployment_claim === false, logicalR10OnsiteBoundary);

const resultGroups = [
  resultTemplate.permission_probes,
  resultTemplate.business_views,
  resultTemplate.ai_nodes,
  resultTemplate.workflows,
  resultTemplate.logical_roles,
  resultTemplate.access_checks,
];
const resultUnits = resultGroups.flat();
assert("result_template_counts_are_13_5_7_6_3_2", resultTemplate.permission_probes.length === 13
  && resultTemplate.business_views.length === 5
  && resultTemplate.ai_nodes.length === 7
  && resultTemplate.workflows.length === 6
  && resultTemplate.logical_roles.length === 3
  && resultTemplate.access_checks.length === 2
  && resultUnits.length === 36, {
  permission: resultTemplate.permission_probes.length,
  views: resultTemplate.business_views.length,
  nodes: resultTemplate.ai_nodes.length,
  workflows: resultTemplate.workflows.length,
  roles: resultTemplate.logical_roles.length,
  access: resultTemplate.access_checks.length,
});
assert("result_template_keys_match_frozen_contract", equalArrays(resultTemplate.permission_probes.map((unit) => unit.unit_id), expectedProbeIds)
  && equalArrays(resultTemplate.business_views.map((unit) => unit.logical_key), expectedViewKeys)
  && equalArrays(resultTemplate.ai_nodes.map((unit) => unit.unit_id), expectedNodeIds)
  && equalArrays(resultTemplate.workflows.map((unit) => unit.unit_id), expectedWorkflowIds)
  && equalArrays(resultTemplate.logical_roles.map((unit) => unit.logical_key), expectedRoleKeys), {
  probes: resultTemplate.permission_probes.map((unit) => unit.unit_id),
  views: resultTemplate.business_views.map((unit) => unit.logical_key),
  nodes: resultTemplate.ai_nodes.map((unit) => unit.unit_id),
  workflows: resultTemplate.workflows.map((unit) => unit.unit_id),
  roles: resultTemplate.logical_roles.map((unit) => unit.logical_key),
});
const requiredRuntimeFields = resultTemplate.result_record_contract.required_runtime_fields;
const permissionResultContract = resultTemplate.result_record_contract;
const expectedStatusRows = [
  { execution_status: "not_tested", result: null, evidence: null, derived_zh: "未测试", derived_en: "not_tested" },
  { execution_status: "blocked", result: null, evidence: "non_empty_redacted_structured_index", derived_zh: "已阻塞", derived_en: "blocked" },
  { execution_status: "completed", result: "可用", evidence: "non_empty_redacted_structured_index", derived_zh: "可用", derived_en: "available" },
  { execution_status: "completed", result: "受限", evidence: "non_empty_redacted_structured_index", derived_zh: "受限", derived_en: "restricted" },
  { execution_status: "completed", result: "不可用", evidence: "non_empty_redacted_structured_index", derived_zh: "不可用", derived_en: "unavailable" },
];
assert("permission_result_contract_has_exact_20_fields_16_runtime_fields_types_and_five_state_rows", equalArrays(permissionResultContract.permission_probe_exact_keys ?? [], PERMISSION_RESULT_EXACT_FIELDS)
  && equalArrays(permissionResultContract.permission_probe_required_runtime_fields ?? [], PERMISSION_RESULT_RUNTIME_FIELDS)
  && equalArrays(Object.keys(permissionResultContract.permission_probe_field_types ?? {}), PERMISSION_RESULT_EXACT_FIELDS)
  && deepEqual(probeSuite.status_contract.legal_state_rows, expectedStatusRows)
  && deepEqual(resultTemplate.status_contract.display_status_mapping, {
    not_tested: "未测试",
    blocked: "已阻塞",
    completed_available: "可用",
    completed_restricted: "受限",
    completed_unavailable: "不可用",
  }), permissionResultContract);
const onsitePermissionByKey = new Map(evidenceTemplate.permission_checks.map((record) => [record.key, record]));
const permissionRecordIssues = resultTemplate.permission_probes.flatMap((record) => permissionResultRecordIssues(
  record,
  onsitePermissionByKey.get(record.unit_id),
  allowedCapabilityResults,
).map((issue) => `${record.unit_id}:${issue}`));
assert("all_13_permission_results_match_exact_runtime_shape_and_canonical_three_way_evidence_binding", permissionRecordIssues.length === 0, permissionRecordIssues);
const permissionArtifactIssues = day1PermissionArtifactIssues({ resultTemplate, evidenceTemplate, probeSuite }, allowedCapabilityResults);
assert("live_permission_artifacts_pass_the_same_production_predicate_used_by_Day1_mutation_controls", permissionArtifactIssues.length === 0, permissionArtifactIssues);
const p03Result = resultTemplate.permission_probes[2];
const p03Onsite = evidenceTemplate.permission_checks[2];
assert("P03_parent_phase_contract_is_fail_closed_and_currently_unstarted", p03Result.execution_status === "not_tested"
  && p03Result.result === null
  && p03Result.evidence === null
  && p03Result.evidence_index === null
  && p03Onsite.structured_evidence_index === null
  && p03Onsite.p03_phase_observations.prebuild_gate.execution_status === "not_tested"
  && p03Onsite.p03_phase_observations.postbuild_five_view_direct_table_recheck.execution_status === "not_tested"
  && Object.values(p03Onsite.p03_phase_observations).every((phase) => phase.result === null && phase.evidence_index === null)
  && p03Onsite.p03_phase_binding_contract.prebuild_attempted_parent_state.required_execution_status === "blocked"
  && p03Onsite.p03_phase_binding_contract.postbuild_incomplete_parent_state.required_execution_status === "blocked"
  && p03Onsite.p03_phase_binding_contract.parent_completed_requires_both_phase_execution_status_completed === true, p03Onsite.p03_phase_binding_contract);
assert("P06_and_P07_depend_exactly_on_P02_and_P05", deepEqual(probeSuite.probes[5].depends_on, ["P02", "P05"])
  && deepEqual(probeSuite.probes[6].depends_on, ["P02", "P05"]), { P06: probeSuite.probes[5].depends_on, P07: probeSuite.probes[6].depends_on });
assert("every_result_unit_has_complete_blank_runtime_shape", resultUnits.every((unit) => requiredRuntimeFields.every((field) => Object.hasOwn(unit, field))
  && unit.execution_status === "not_tested"
  && unit.result === null
  && unit.evidence === null
  && requiredRuntimeFields.filter((field) => !["execution_status", "result", "evidence"].includes(field)).every((field) => unit[field] === null)), resultUnits.filter((unit) => !requiredRuntimeFields.every((field) => Object.hasOwn(unit, field))).map((unit) => unit.unit_id));
assert("result_permission_and_evidence_refs_are_exact", resultTemplate.permission_probes.every((unit, index) => unit.probe_ref === `../manifests/day-1-probe-suite.v0.1.json#/probes/${index}`
  && unit.evidence_unit_ref === `./on-site-evidence-template.json#/permission_checks/${index}`)
  && resultTemplate.business_views.every((unit, index) => unit.evidence_unit_ref === `./on-site-evidence-template.json#/views/${index}`)
  && resultTemplate.ai_nodes.every((unit, index) => unit.evidence_unit_ref === `./on-site-evidence-template.json#/ai_nodes/${index}`)
  && resultTemplate.workflows.every((unit, index) => unit.evidence_unit_ref === `./on-site-evidence-template.json#/workflows/${index}`), "result reference mismatch");
assert("anonymous_and_unprivileged_access_results_are_distinct", equalArrays(resultTemplate.access_checks.map((unit) => unit.unit_id), ["A01", "A02"])
  && resultTemplate.access_checks[0].probe_ref.endsWith("#/probes/0")
  && resultTemplate.access_checks[1].probe_ref.endsWith("#/probes/2")
  && resultTemplate.access_checks[0] !== resultTemplate.access_checks[1], resultTemplate.access_checks);
assert("logical_roles_are_unmapped_and_untested", resultTemplate.logical_roles.every((unit) => unit.platform_mapping_status === "not_tested"), resultTemplate.logical_roles);

const t3EnvelopeFields = extractConstStringArray(t3Contract, "AI_NODE_ENVELOPE_REQUIRED_FIELDS");
const t3NodeIds = extractConstStringArray(t3Contract, "AI_NODE_IDS");
const t3WorkflowIds = extractConstStringArray(t3Contract, "WORKFLOW_IDS");
assert("AI_envelope_is_exact_14_field_T3_contract", logical.ai_envelope.required.length === 14
  && equalArrays(logical.ai_envelope.required, t3EnvelopeFields)
  && logical.ai_envelope.required.includes("missing_fields")
  && logical.ai_envelope.required.includes("validation")
  && logical.ai_envelope.required.includes("human_revision")
  && !logical.ai_envelope.required.includes("missing_items")
  && !logical.ai_envelope.required.includes("schema_validation"), logical.ai_envelope.required);
assert("seven_nodes_and_six_workflows_match_T3", equalArrays(expectedNodeIds, t3NodeIds)
  && equalArrays(expectedWorkflowIds, t3WorkflowIds)
  && logical.ai_envelope.schema_repair_retry_limit === 1, {
  logicalNodes: expectedNodeIds,
  t3Nodes: t3NodeIds,
  logicalWorkflows: expectedWorkflowIds,
  t3Workflows: t3WorkflowIds,
});
assert("workflow_order_is_W1_W2_W6_W3_W4_W5_W6", equalArrays(logical.integration_order.map((entry) => `${entry.workflow}.${entry.phase}`), [
  "W1.default",
  "W2.default",
  "W6.same_event_duplicate",
  "W3.default",
  "W4.default",
  "W5.default",
  "W6.cross_event_improvement_observation",
]), logical.integration_order);
assert("seven_forbidden_actions_remain_source_locked", logical.forbidden_automatic_actions.length === 7
  && smokePlan.sources.logical_manifest.forbidden_actions_ref === "logical://forbidden_automatic_actions"
  && probeSuite.probes[3].failure_criteria.includes("forbidden_action_is_available"), logical.forbidden_automatic_actions);

const executionRecords = [
  ...probeSuite.probes,
  importPlan,
  ...importUnits,
  smokePlan,
  ...smokePlan.smoke_units,
  resultTemplate,
  ...resultUnits,
];
assert("all_70_R10_execution_records_are_not_tested_with_empty_result_and_evidence", executionRecords.length === 70
  && executionRecords.every((record) => record.execution_status === "not_tested" && record.result === null && record.evidence === null), {
  count: executionRecords.length,
  nonBlank: executionRecords.filter((record) => record.execution_status !== "not_tested" || record.result !== null || record.evidence !== null).map((record) => record.unit_id ?? record.probe_id ?? record.smoke_id ?? record.plan_version ?? record.template_version),
});
const onsiteEvidenceUnits = [
  ...evidenceTemplate.permission_checks,
  ...evidenceTemplate.tables,
  ...evidenceTemplate.views,
  ...evidenceTemplate.ai_nodes,
  ...evidenceTemplate.workflows,
];
const onsiteEvidenceActualFields = [
  "actual_action",
  "actual_time",
  "executor",
  "platform_account_role",
  "logical_business_role",
  "actual_result",
  "limitations",
  "fallback_actual_result",
  "verifier",
];
assert("all_41_onsite_evidence_units_remain_untested_and_empty", onsiteEvidenceUnits.length === 41
  && onsiteEvidenceUnits.every((unit) => unit.status === "未测试"
    && unit.platform_role_mapping_status === "未测试"
    && unit.fallback_verification_status === "未测试"
    && unit.evidence_presence === "待填"
    && unit.redaction_status === "待填"
    && onsiteEvidenceActualFields.every((field) => unit[field] === null)
    && Array.isArray(unit.screenshot_indexes) && unit.screenshot_indexes.length === 0
    && Array.isArray(unit.run_indexes) && unit.run_indexes.length === 0), {
  count: onsiteEvidenceUnits.length,
  non_empty: onsiteEvidenceUnits.filter((unit) => unit.status !== "未测试"
    || onsiteEvidenceActualFields.some((field) => unit[field] !== null)
    || unit.screenshot_indexes.length > 0
    || unit.run_indexes.length > 0).map((unit) => unit.key),
});
assert("offline_package_records_zero_real_operations", executionRecords.filter((record) => record.execution_status === "completed").length === 0
  && onsiteEvidenceUnits.filter((unit) => unit.status !== "未测试").length === 0, {
  completed_execution_records: executionRecords.filter((record) => record.execution_status === "completed").length,
  tested_onsite_evidence_units: onsiteEvidenceUnits.filter((unit) => unit.status !== "未测试").length,
});

const resultResourceNullPaths = collectNullLeafPaths(resultTemplate.resource_slots);
const importResourceValues = [importPlan.runtime_binding.app_token, ...importPlan.table_batches.map((batch) => batch.table_id)];
assert("all_48_R10_resource_fields_are_null", resultResourceNullPaths.length === 37
  && importResourceValues.length === 11
  && importResourceValues.every((value) => value === null), {
  result_template_null_resource_fields: resultResourceNullPaths.length,
  import_null_resource_fields: importResourceValues.filter((value) => value === null).length,
});
assert("legacy_Batch_D1_three_actions_exclude_archive_reopen_while_R10_reopen_projection_is_separately_frozen", equalArrays(p05D1Observation?.excluded_actions ?? [], ["archive_observation", "reopen_recurrence"])
  && equalArrays(d1ObservationSmoke?.excluded_actions ?? [], ["archive_observation", "reopen_recurrence"])
  && equalArrays(d1ObservationEvidence?.scope_excluded_actions ?? [], ["archive_observation", "reopen_recurrence"])
  && p05D1Observation?.excluded_action_history_rule.includes("read as an authoritative checkpoint source")
  && !logical.workflows.some((workflow) => ["archive_observation", "reopen_recurrence"].includes(workflow.key))
  && r10W6Evidence?.identity?.source_action === "reopen_recurrence"
  && r10W6Evidence?.identity?.classification === "W6_projection_side_effect_not_a_seventh_workflow"
  && r10W6Evidence?.identity?.real_executor_in_scope === false
  && r10Smoke?.source_action === "reopen_recurrence"
  && r10Smoke?.classification === "W6_projection_side_effect_not_a_seventh_workflow"
  && r10Smoke?.real_executor_in_scope === false
  && logical.workflows.length === 6
  && probeSuite.probes.length === 13
  && smokePlan.smoke_units.length === 5
  && onsiteEvidenceUnits.length === 41
  && resultUnits.length === 36
  && executionRecords.length === 70
  && resultResourceNullPaths.length + importResourceValues.filter((value) => value === null).length === 48
  && executionRecords.every((record) => record.execution_status === "not_tested" && record.result === null && record.evidence === null)
  && onsiteEvidenceUnits.every((unit) => unit.status === "未测试" && onsiteEvidenceActualFields.every((field) => unit[field] === null))
  && sha256(resultTemplateText) === "af499c929b722b1ec996a5ba916a7d395162364435d59f5ed105f286bc3ff30b", {
  workflows: logical.workflows.length,
  probes: probeSuite.probes.length,
  smoke: smokePlan.smoke_units.length,
  evidence: onsiteEvidenceUnits.length,
  results: resultUnits.length,
  execution_records: executionRecords.length,
  resource_nulls: resultResourceNullPaths.length + importResourceValues.filter((value) => value === null).length,
  result_template_sha256: sha256(resultTemplateText),
});

const machineTexts = [probeSuiteText, importPlanText, smokePlanText, resultTemplateText];
assert("machine_artifacts_have_no_complete_URL", machineTexts.every((text) => !/https?:\/\//i.test(text)), "complete URL detected in machine artifact");
assert("R10_artifacts_have_no_sensitive_value", !containsSensitiveValue([...machineTexts, capabilityRunbook, resourceMappingTemplateText].join("\n")), "credential or resource value pattern detected");
const runbookUrls = [...capabilityRunbook.matchAll(/https?:\/\/[^\s)]+/g)].map((match) => match[0]);
const allowedOfficialUrls = [
  "https://github.com/larksuite/cli",
  "https://open.feishu.cn/document/server-docs/docs/bitable-v1/bitable-overview?lang=zh-CN",
  "https://open.feishu.cn/document/server-docs/api-call-guide/frequency-control?lang=zh-CN",
];
assert("runbook_contains_only_allowlisted_official_documentation_URLs", equalSets(runbookUrls, allowedOfficialUrls)
  && !/feishu\.cn\/(?:base|docx|wiki|sheets)\//i.test(capabilityRunbook), runbookUrls);
assert("R10_has_no_deployment_or_integration_claim", !/(已上线|已通过|已接入)/.test([...machineTexts, capabilityRunbook].join("\n")), "prohibited completion claim detected");

const requiredRunbookPhrases = [
  "先核对赛事规则",
  "参赛者本人",
  "管理员",
  "OAuth",
  "auth status",
  "auth scopes",
  "auth check",
  "bitable:app",
  "git check-ignore",
  "只读探测",
  "SYN-PERMISSION-TEST",
  "99991400",
  "1254290",
  "1254291",
  "1255040",
  "未知提交状态",
];
assert("official_CLI_OpenAPI_runbook_has_required_gates_probes_and_errors", requiredRunbookPhrases.every((phrase) => capabilityRunbook.includes(phrase)), requiredRunbookPhrases.filter((phrase) => !capabilityRunbook.includes(phrase)));
assert("runbook_records_verified_auth_gate_and_P12_command_failure_without_completing_P13", capabilityRunbook.includes("P11 已记录为 `completed + 受限 + 非空脱敏证据`")
  && capabilityRunbook.includes("P12 与 P13 均保持 `blocked + result=null`")
  && capabilityRunbook.includes("P03 保持 `not_tested + result=null`")
  && capabilityRunbook.includes("`base_read_command_attempt_count=1`")
  && capabilityRunbook.includes("`record_list_command_count=0`")
  && capabilityRunbook.includes("`failure_stage=wiki_url_resolve_command_failed`")
  && capabilityRunbook.includes("不推断 provider HTTP/OpenAPI 是否实际到达")
  && capabilityRunbook.includes("`auth scopes` 未运行，仅作受限诊断")
  && capabilityRunbook.includes("不申请 `application:application:self_manage`")
  && capabilityRunbook.includes("以下是固定命令模板")
  && capabilityRunbook.includes("不得用 CLI 创建正式 Base、批量导入、开启自动化、变更权限或执行车辆控制"), "execution boundary phrase missing");

const mutatedCompletedResult = { ...resultTemplate.permission_probes[0], execution_status: "completed", result: "可用" };
assert("failure_closed_selftest_rejects_success_without_evidence", recordContractMutation("success_without_evidence", equalArrays(
  collectResultRecordIssues(mutatedCompletedResult, allowedCapabilityResults), ["completed_record_incomplete"]), mutatedCompletedResult), mutatedCompletedResult);
const missingP13ProbeSuite = structuredClone(probeSuite);
missingP13ProbeSuite.probes = missingP13ProbeSuite.probes.slice(0, 12);
const missingP13Issues = equalArrays(missingP13ProbeSuite.probes.map((probe) => probe.probe_id), expectedProbeIds) ? [] : ["probe_catalog.P13"];
assert("failure_closed_selftest_rejects_missing_P13", recordContractMutation("missing_P13", equalArrays(missingP13Issues, ["probe_catalog.P13"]), missingP13ProbeSuite), missingP13Issues);
const brokenImportUnits = importUnits.map((unit) => ({ ...unit, depends_on: [...(unit.depends_on ?? [])] }));
brokenImportUnits.find((unit) => unit.unit_id === "IMP-B04").depends_on = ["IMP-MISSING"];
const brokenImportGraph = graphDiagnostics(brokenImportUnits, "unit_id");
const brokenImportIssues = brokenImportGraph.missingDependencies.map((dependency) => `missing_dependency:${dependency}`);
assert("failure_closed_selftest_rejects_missing_import_dependency", recordContractMutation("missing_import_dependency", equalArrays(brokenImportIssues, ["missing_dependency:IMP-B04 -> IMP-MISSING"]), brokenImportUnits), brokenImportGraph);
const sourceDriftImportPlan = structuredClone(importPlan);
sourceDriftImportPlan.contract_sources.canonical_manifest.sha256 = `${sourceDriftImportPlan.contract_sources.canonical_manifest.sha256}x`;
const sourceDriftIssues = sourceDriftImportPlan.contract_sources.canonical_manifest.sha256 === sha256(canonicalManifestText) ? [] : ["contract_sources.canonical_manifest.sha256"];
assert("failure_closed_selftest_rejects_source_hash_drift", recordContractMutation("source_hash_drift", equalArrays(sourceDriftIssues, ["contract_sources.canonical_manifest.sha256"]), sourceDriftImportPlan), sourceDriftIssues);
const nonNullResourceSlots = { ...resultTemplate.resource_slots, base_app_token: "synthetic-non-null-selftest" };
const nonNullResourceIssues = collectNullLeafPaths(nonNullResourceSlots).length === 37 ? [] : ["resource_slots.base_app_token"];
assert("failure_closed_selftest_rejects_non_null_resource", recordContractMutation("non_null_resource", equalArrays(nonNullResourceIssues, ["resource_slots.base_app_token"]), nonNullResourceSlots), nonNullResourceIssues);
const secretAndUrlInputs = {
  diagnostic: "Bearer synthetic_value_1234567890",
  url: "https://example.feishu.cn/base/synthetic",
};
const secretAndUrlIssues = [
  containsSensitiveValue(secretAndUrlInputs.diagnostic) ? "sensitive_value" : null,
  /feishu\.cn\/(?:base|docx|wiki|sheets)\//i.test(secretAndUrlInputs.url) ? "real_feishu_URL" : null,
].filter(Boolean);
assert("failure_closed_selftest_rejects_secret_and_real_URL", recordContractMutation("secret_and_real_URL", equalArrays(secretAndUrlIssues, ["sensitive_value", "real_feishu_URL"]), secretAndUrlInputs), secretAndUrlIssues);
const r10RootBoundaryMutationResults = [
  ["completed", ["probe_bundle_digest", "root.execution_status"], (copy) => { copy.root.execution_status = "completed"; }],
  ["result", ["probe_bundle_digest", "root.result_or_evidence"], (copy) => { copy.root.result = "synthetic-result"; }],
  ["evidence", ["probe_bundle_digest", "root.result_or_evidence"], (copy) => { copy.root.evidence = { type: "synthetic" }; }],
  ["operation", ["probe_bundle_digest", "root.real_feishu_operations"], (copy) => { copy.root.real_feishu_operations = 1; }],
  ["selector", ["probe_bundle_digest", "root.selector_and_refs"], (copy) => { copy.root.normalized_existing_evidence_unit_ref = "P02"; }],
  ["component_ref", ["probe_bundle_digest", "root.selector_and_refs"], (copy) => { copy.root.component_evidence_unit_refs[1] = "evidence://on-site/P02"; }],
].map(([name, expectedIssues, mutate]) => {
  const copy = structuredClone(r10ProbeBundle);
  mutate(copy);
  return { name, candidate: copy, passed: equalArrays(collectR10ProbeBundleIssues(copy), expectedIssues) };
});
assert("failure_closed_selftest_rejects_R10_root_completed_non_null_operation_and_selector_mutations", recordContractMutation(
  "root_execution_boundary_completed_non_null_op1",
  r10RootBoundaryMutationResults.every((result) => result.passed),
  r10RootBoundaryMutationResults.map(({ candidate }) => candidate),
), r10RootBoundaryMutationResults);

function makeDay1Evidence(unitId, phase = "before_action", suffix = "01") {
  return { indexes: [{
    evidence_id: `T2-EV-${unitId}-20990101-0000-${suffix}`,
    observed_at: "2099-01-01T00:00:00+08:00",
    actor_role: "synthetic_role",
    redacted_storage_slot: `controlled-slot-${unitId}-${suffix}`,
    capture_phases: [phase],
    redaction_checked: true,
  }], r10_subchecks: null };
}
function makeDay1PermissionCandidate() {
  return structuredClone({ resultTemplate, evidenceTemplate, probeSuite });
}
function setDay1Observed(candidate, index, status = "blocked", result = null) {
  const record = candidate.resultTemplate.permission_probes[index];
  const evidenceIndex = makeDay1Evidence(record.unit_id);
  Object.assign(record, {
    execution_status: status, result, evidence: evidenceIndex, preconditions_observed: ["synthetic_observed"],
    actual_action: "synthetic_action", actual_result: "synthetic_result", actual_time: "2099-01-01T00:00:00+08:00",
    executor: "synthetic_executor", account_role: "synthetic_role", limitations: status === "blocked" ? "synthetic_limit" : null,
    evidence_index: evidenceIndex, fallback_verified: true, cleanup_result: "synthetic_cleanup", verifier: "synthetic_verifier",
  });
  candidate.evidenceTemplate.permission_checks[index].structured_evidence_index = structuredClone(evidenceIndex);
  candidate.evidenceTemplate.permission_checks[index].status = day1ExpectedChineseStatus(record);
  if (record.unit_id === "P03") {
    candidate.evidenceTemplate.permission_checks[index].evidence_presence = status === "not_tested" ? "待填" : "已记录";
    candidate.evidenceTemplate.permission_checks[index].redaction_status = status === "not_tested" ? "待填" : "已复核";
  }
  return record;
}
function makeDay1P03PrebuildProof({
  allowed = true,
  visibilitySafe = true,
  mutationAttempted = allowed && visibilitySafe,
  mutationRejected = mutationAttempted,
  unauthorizedWriteCount = 0,
  businessUnchanged = true,
} = {}) {
  return {
    data_scope: "synthetic_experiment",
    fixture_marker: "SYN-PERMISSION-TEST",
    test_scope: "isolated_temporary_base",
    enterprise_data_used: false,
    actor_class: "ordinary_non_owner",
    actor_distinct_from_owner_verified: true,
    owner_privileges_absent: true,
    administrator_privileges_absent: true,
    independent_session_verified: true,
    allowed_isolated_view_open_attempted: true,
    allowed_isolated_view_opened: allowed,
    non_isolated_views_hidden: visibilitySafe,
    non_target_records_hidden: visibilitySafe,
    direct_table_access_denied: visibilitySafe,
    raw_json_hidden: visibilitySafe,
    management_configuration_hidden: visibilitySafe,
    protected_mutation_attempted: mutationAttempted,
    protected_mutation_rejected: mutationRejected,
    unauthorized_business_write_count: unauthorizedWriteCount,
    business_state_unchanged: businessUnchanged,
    temporary_access_revoked: true,
    cleanup_reverified: true,
  };
}
function setDay1P03Prebuild(candidate) {
  const parent = setDay1Observed(candidate, 2);
  const evidenceIndex = makeDay1Evidence("P03", "prebuild_gate");
  parent.evidence = structuredClone(evidenceIndex);
  parent.evidence_index = structuredClone(evidenceIndex);
  candidate.evidenceTemplate.permission_checks[2].structured_evidence_index = structuredClone(evidenceIndex);
  candidate.evidenceTemplate.permission_checks[2].p03_phase_observations.prebuild_gate = {
    execution_status: "completed", result: "可用", evidence_index: structuredClone(evidenceIndex),
    actual_action: "synthetic_prebuild", actual_result: "synthetic_result", actual_time: "2099-01-01T00:00:00+08:00",
    actual_prebuild_proof: makeDay1P03PrebuildProof(),
  };
  return candidate;
}
function setDay1P03PrebuildBlockedPhase(candidate) {
  const parent = setDay1Observed(candidate, 2);
  const evidenceIndex = makeDay1Evidence("P03", "prebuild_gate");
  parent.evidence = structuredClone(evidenceIndex);
  parent.evidence_index = structuredClone(evidenceIndex);
  const onsite = candidate.evidenceTemplate.permission_checks[2];
  onsite.structured_evidence_index = structuredClone(evidenceIndex);
  onsite.p03_phase_observations.prebuild_gate = {
    execution_status: "blocked",
    result: null,
    evidence_index: structuredClone(evidenceIndex),
    actual_action: "synthetic_prebuild_attempt",
    actual_result: "synthetic_incomplete_observation",
    actual_time: "2099-01-01T00:00:00+08:00",
    actual_prebuild_proof: null,
  };
  return candidate;
}
function setDay1P03PrebuildRestricted(candidate) {
  setDay1P03Prebuild(candidate);
  const parent = candidate.resultTemplate.permission_probes[2];
  const phase = candidate.evidenceTemplate.permission_checks[2].p03_phase_observations.prebuild_gate;
  parent.limitations = "synthetic_prebuild_limit";
  parent.fallback_verified = true;
  phase.result = "受限";
  phase.actual_prebuild_proof = makeDay1P03PrebuildProof();
  return candidate;
}
function setDay1P03PrebuildUnavailable(candidate) {
  setDay1P03Prebuild(candidate);
  const parent = candidate.resultTemplate.permission_probes[2];
  const phase = candidate.evidenceTemplate.permission_checks[2].p03_phase_observations.prebuild_gate;
  parent.limitations = "synthetic_prebuild_unsafe_boundary";
  parent.fallback_verified = true;
  phase.result = "不可用";
  phase.actual_prebuild_proof = makeDay1P03PrebuildProof({ allowed: false });
  return candidate;
}
function setDay1P03PrebuildVisibilityLeakUnavailable(candidate) {
  setDay1P03Prebuild(candidate);
  const parent = candidate.resultTemplate.permission_probes[2];
  const phase = candidate.evidenceTemplate.permission_checks[2].p03_phase_observations.prebuild_gate;
  parent.limitations = "synthetic_prebuild_visibility_boundary_unsafe";
  parent.fallback_verified = true;
  phase.result = "不可用";
  phase.actual_prebuild_proof = makeDay1P03PrebuildProof({ visibilitySafe: false });
  return candidate;
}
function setDay1P03PrebuildWithTwoEvidence(candidate) {
  setDay1P03Prebuild(candidate);
  const parent = candidate.resultTemplate.permission_probes[2];
  const onsite = candidate.evidenceTemplate.permission_checks[2];
  const phase = onsite.p03_phase_observations.prebuild_gate;
  const second = makeDay1Evidence("P03", "prebuild_gate", "02").indexes[0];
  parent.evidence_index.indexes.push(structuredClone(second));
  parent.evidence = structuredClone(parent.evidence_index);
  onsite.structured_evidence_index = structuredClone(parent.evidence_index);
  phase.evidence_index.indexes.push(structuredClone(second));
  return candidate;
}
function setDay1P03PostbuildWithoutPrebuild(candidate) {
  const parent = setDay1Observed(candidate, 2);
  const evidenceIndex = makeDay1Evidence("P03", "postbuild_five_view_direct_table_recheck");
  parent.evidence = structuredClone(evidenceIndex);
  parent.evidence_index = structuredClone(evidenceIndex);
  candidate.evidenceTemplate.permission_checks[2].structured_evidence_index = structuredClone(evidenceIndex);
  candidate.evidenceTemplate.permission_checks[2].p03_phase_observations.postbuild_five_view_direct_table_recheck = {
    execution_status: "completed", result: "可用", evidence_index: structuredClone(evidenceIndex),
    actual_action: "synthetic_postbuild", actual_result: "synthetic_result", actual_time: "2099-01-01T00:00:01+08:00",
  };
  return candidate;
}
function setDay1P02Completed(candidate) {
  const p02 = setDay1Observed(candidate, 1, "completed", "可用");
  p02.evidence_index.r10_subchecks = makeDay1P02CompletedSubchecks(p02.evidence_index.indexes[0].evidence_id);
  p02.evidence = structuredClone(p02.evidence_index);
  candidate.evidenceTemplate.permission_checks[1].structured_evidence_index = structuredClone(p02.evidence_index);
  const p02Proof = candidate.evidenceTemplate.permission_checks[1].r10_selector_and_execution_mode_evidence_contract;
  p02Proof.permission_snapshot_sha256 = "3".repeat(64);
  p02Proof.permission_revision = "synthetic-revision";
  return candidate;
}
function setDay1P03Completed(candidate) {
  setDay1P02Completed(candidate);
  setDay1P03Prebuild(candidate);
  const parent = candidate.resultTemplate.permission_probes[2];
  const onsite = candidate.evidenceTemplate.permission_checks[2];
  const postEvidence = makeDay1Evidence("P03", "postbuild_five_view_direct_table_recheck", "02");
  const combinedEvidence = {
    indexes: [...parent.evidence_index.indexes, ...postEvidence.indexes],
    r10_subchecks: makeDay1P03CompletedSubchecks(postEvidence.indexes[0].evidence_id),
  };
  Object.assign(parent, {
    execution_status: "completed",
    result: "可用",
    evidence: structuredClone(combinedEvidence),
    evidence_index: structuredClone(combinedEvidence),
    limitations: null,
  });
  onsite.structured_evidence_index = structuredClone(combinedEvidence);
  onsite.status = "可用";
  const proof = onsite.r10_recurrence_visibility_and_attestation_evidence_contract;
  proof.actual_all_five_business_views_result = {
    views: DAY1_P03_VIEW_KEYS.map((viewKey) => ({
      view_key: viewKey, opened: true, refreshed: true, allowed_action_verified: true, raw_recurrence_records_visible: false,
    })),
    relogin_completed: true, refresh_boundary_stable: true, unauthorized_W6_action_rejected: true,
    protected_field_mutation_rejected: true, administrator_configuration_hidden: true,
  };
  proof.actual_direct_clusters_table_result = {
    attempted: true, access_allowed: false, refreshed: null, raw_recurrence_records_visible: false, administrator_fields_visible: false,
  };
  proof.actual_recurrence_visibility_no_broader_than_source_fields_result = {
    day_7_result_readable: true, day_30_result_readable: true, human_conclusion_readable: true,
    raw_recurrence_records_visible: false, no_broader_than_source_field_intersection: true,
  };
  proof.attestation_id_digest = "1".repeat(64);
  proof.capability_attestation_sha256 = "2".repeat(64);
  proof.permission_snapshot_sha256 = "3".repeat(64);
  proof.permission_revision = "synthetic-revision";
  proof.issued_at = "2099-01-01T00:00:00+08:00";
  proof.capability_checked_at = "2099-01-01T00:00:00+08:00";
  proof.capability_rechecked_at = "2099-01-01T00:00:01+08:00";
  proof.expires_at = "2099-01-01T00:10:00+08:00";
  proof.actual_prewrite_recheck_result = {
    permission_snapshot_matches: true, permission_revision_matches: true, attestation_unexpired: true, rechecked_before_write: true,
  };
  proof.actual_drift_or_expiry_injection_result = { permission_drift_rejected: true, expiry_rejected: true, zero_writes: true };
  onsite.p03_phase_observations.postbuild_five_view_direct_table_recheck = {
    execution_status: "completed", result: "可用", evidence_index: structuredClone(postEvidence),
    actual_action: "synthetic_postbuild", actual_result: "synthetic_result", actual_time: "2099-01-01T00:00:01+08:00",
  };
  return candidate;
}
function setDay1P03CompletedClassification(candidate, result, usableViewCount, { safetyFailure = false, prebuildResult = "可用" } = {}) {
  setDay1P03Completed(candidate);
  const parent = candidate.resultTemplate.permission_probes[2];
  const onsite = candidate.evidenceTemplate.permission_checks[2];
  parent.result = result;
  parent.limitations = ["受限", "不可用"].includes(result) || prebuildResult === "受限" ? "synthetic_limit" : null;
  parent.fallback_verified = true;
  onsite.status = result;
  onsite.p03_phase_observations.prebuild_gate.result = prebuildResult;
  onsite.p03_phase_observations.prebuild_gate.actual_prebuild_proof = prebuildResult === "受限"
    ? makeDay1P03PrebuildProof()
    : prebuildResult === "不可用"
      ? makeDay1P03PrebuildProof({ allowed: false })
      : makeDay1P03PrebuildProof();
  onsite.p03_phase_observations.postbuild_five_view_direct_table_recheck.result = result;
  onsite.r10_recurrence_visibility_and_attestation_evidence_contract.actual_all_five_business_views_result.views
    .forEach((row, index) => {
      row.opened = index < usableViewCount;
      row.refreshed = index < usableViewCount;
      row.allowed_action_verified = index < usableViewCount;
    });
  if (safetyFailure) onsite.r10_recurrence_visibility_and_attestation_evidence_contract.actual_drift_or_expiry_injection_result.zero_writes = false;
  return candidate;
}
const day1P03ClassificationPositiveCandidates = [
  setDay1P03CompletedClassification(makeDay1PermissionCandidate(), "受限", 4),
  setDay1P03CompletedClassification(makeDay1PermissionCandidate(), "不可用", 0),
  setDay1P03CompletedClassification(makeDay1PermissionCandidate(), "不可用", 5, { safetyFailure: true }),
  setDay1P03CompletedClassification(makeDay1PermissionCandidate(), "可用", 5, { prebuildResult: "受限" }),
];
assert("P03_result_contract_declarations_match_the_independent_literal_proof_classification_and_metadata_oracle",
  deepEqual(resultTemplate.result_record_contract.p03_phase_contract.completed_on_site_machine_result_contract.proof_root_exact_keys, DAY1_EXPECTED_DECLARED_P03_PROOF_ROOT_KEYS)
  && deepEqual(resultTemplate.result_record_contract.p03_phase_contract.completed_on_site_machine_result_contract.proof_root_static_identity, DAY1_EXPECTED_DECLARED_P03_PROOF_STATIC_IDENTITY)
  && deepEqual(resultTemplate.result_record_contract.p03_phase_contract.completed_on_site_machine_result_contract.deterministic_result_classification, DAY1_EXPECTED_DECLARED_P03_CLASSIFICATION)
  && deepEqual(resultTemplate.result_record_contract.p03_phase_contract.evidence_metadata_state_contract, DAY1_EXPECTED_DECLARED_P03_EVIDENCE_METADATA_STATE)
  && deepEqual(resultTemplate.result_record_contract.p03_phase_contract.prebuild_proof_contract, DAY1_EXPECTED_P03_PREBUILD_PROOF_CONTRACT)
  && deepEqual(probeSuite.status_contract.canonical_evidence_binding_contract.capture_phases_allowed, DAY1_ALL_CAPTURE_PHASES)
  && deepEqual(probeSuite.status_contract.canonical_evidence_binding_contract.non_P03_capture_phases_allowed, DAY1_GENERIC_CAPTURE_PHASES)
  && deepEqual(resultTemplate.result_record_contract.evidence_index_contract.capture_phases_allowed, DAY1_ALL_CAPTURE_PHASES)
  && deepEqual(resultTemplate.result_record_contract.evidence_index_contract.non_P03_capture_phases_allowed, DAY1_GENERIC_CAPTURE_PHASES)
  && deepEqual(evidenceTemplate.permission_evidence_index_contract.capture_phases_allowed, DAY1_ALL_CAPTURE_PHASES)
  && deepEqual(evidenceTemplate.permission_evidence_index_contract.non_P03_capture_phases_allowed, DAY1_GENERIC_CAPTURE_PHASES)
  && deepEqual(evidenceTemplate.permission_checks[2].p03_phase_binding_contract.prebuild_visibility_safety_keys, DAY1_P03_PREBUILD_VISIBILITY_SAFETY_KEYS)
  && deepEqual(evidenceTemplate.permission_checks[2].p03_phase_binding_contract.prebuild_proof_exact_keys, DAY1_P03_PREBUILD_PROOF_KEYS),
  resultTemplate.result_record_contract.p03_phase_contract);
const day1P03DirectLeakUnavailablePositive = setDay1P03CompletedClassification(makeDay1PermissionCandidate(), "不可用", 5);
day1P03DirectLeakUnavailablePositive.evidenceTemplate.permission_checks[2].r10_recurrence_visibility_and_attestation_evidence_contract
  .actual_direct_clusters_table_result.raw_recurrence_records_visible = true;
const day1P03PrewriteLimitedPositive = setDay1P03CompletedClassification(makeDay1PermissionCandidate(), "受限", 5);
day1P03PrewriteLimitedPositive.evidenceTemplate.permission_checks[2].r10_recurrence_visibility_and_attestation_evidence_contract
  .actual_prewrite_recheck_result.permission_revision_matches = false;
assert("P03_available_restricted_unavailable_and_safe_direct_table_outcomes_are_classified_by_the_production_predicate",
  [...day1P03ClassificationPositiveCandidates, day1P03DirectLeakUnavailablePositive, day1P03PrewriteLimitedPositive]
    .every((candidate) => day1PermissionArtifactIssues(candidate, allowedCapabilityResults).length === 0),
  [...day1P03ClassificationPositiveCandidates, day1P03DirectLeakUnavailablePositive, day1P03PrewriteLimitedPositive]
    .map((candidate) => day1PermissionArtifactIssues(candidate, allowedCapabilityResults)));
const day1P03PrebuildPositiveCandidates = [
  setDay1P03Prebuild(makeDay1PermissionCandidate()),
  setDay1P03PrebuildRestricted(makeDay1PermissionCandidate()),
  setDay1P03PrebuildUnavailable(makeDay1PermissionCandidate()),
  setDay1P03PrebuildVisibilityLeakUnavailable(makeDay1PermissionCandidate()),
  setDay1P03PrebuildBlockedPhase(makeDay1PermissionCandidate()),
  makeDay1PermissionCandidate(),
];
assert("P03_prebuild_available_restricted_unavailable_blocked_and_not_tested_follow_the_exact_machine_proof_contract",
  day1P03PrebuildPositiveCandidates.every((candidate) => day1PermissionArtifactIssues(candidate, allowedCapabilityResults).length === 0)
  && day1P03PrebuildPositiveCandidates.slice(0, 4).every((candidate) => {
    const parent = candidate.resultTemplate.permission_probes[2];
    return parent.execution_status === "blocked" && parent.result === null;
  }),
day1P03PrebuildPositiveCandidates.map((candidate) => day1PermissionArtifactIssues(candidate, allowedCapabilityResults)));

const DAY1_P03_PROOF_ROOT_MISSING_KEYS = Object.freeze([
  "probe_ref", "normalized_existing_evidence_unit_ref", "creates_new_evidence_unit",
  "actual_all_five_business_views_result", "actual_direct_clusters_table_result",
  "actual_recurrence_visibility_no_broader_than_source_fields_result", "attestation_id_digest",
  "capability_attestation_sha256", "permission_snapshot_sha256", "permission_revision", "issued_at", "expires_at",
  "capability_checked_at", "capability_rechecked_at", "actual_prewrite_recheck_result", "actual_drift_or_expiry_injection_result",
]);
const setupDay1PermissionBaseline = () => {};
const day1P03ProofClosureMutationCases = [
  ["P03_completed_proof_root_null", ["P03_completed_proof_root_exact_keys"], setDay1P03Completed, (c) => {
    c.evidenceTemplate.permission_checks[2].r10_recurrence_visibility_and_attestation_evidence_contract = null;
  }],
  ["P03_completed_proof_root_array", ["P03_completed_proof_root_exact_keys"], setDay1P03Completed, (c) => {
    c.evidenceTemplate.permission_checks[2].r10_recurrence_visibility_and_attestation_evidence_contract = [];
  }],
  ["P03_completed_proof_root_string", ["P03_completed_proof_root_exact_keys"], setDay1P03Completed, (c) => {
    c.evidenceTemplate.permission_checks[2].r10_recurrence_visibility_and_attestation_evidence_contract = "invalid";
  }],
  ...DAY1_P03_PROOF_ROOT_MISSING_KEYS.map((key) => [
    `P03_completed_proof_root_missing_${key}`,
    ["P03_completed_proof_root_exact_keys"],
    setDay1P03Completed,
    (c) => { delete c.evidenceTemplate.permission_checks[2].r10_recurrence_visibility_and_attestation_evidence_contract[key]; },
  ]),
  ["P03_completed_proof_root_extra", ["P03_completed_proof_root_exact_keys"], setDay1P03Completed, (c) => {
    c.evidenceTemplate.permission_checks[2].r10_recurrence_visibility_and_attestation_evidence_contract.extra = null;
  }],
  ["P03_completed_proof_root_probe_ref_drift", ["P03_completed_proof_root_probe_ref"], setDay1P03Completed, (c) => {
    c.evidenceTemplate.permission_checks[2].r10_recurrence_visibility_and_attestation_evidence_contract.probe_ref = "P02";
  }],
  ["P03_completed_proof_root_evidence_unit_ref_drift", ["P03_completed_proof_root_evidence_unit_ref"], setDay1P03Completed, (c) => {
    c.evidenceTemplate.permission_checks[2].r10_recurrence_visibility_and_attestation_evidence_contract.normalized_existing_evidence_unit_ref = "P03";
  }],
  ["P03_completed_proof_root_creates_new_evidence_unit_drift", ["P03_completed_proof_root_creates_new_evidence_unit"], setDay1P03Completed, (c) => {
    c.evidenceTemplate.permission_checks[2].r10_recurrence_visibility_and_attestation_evidence_contract.creates_new_evidence_unit = true;
  }],
];
const day1P03MetadataBaselineSetups = Object.freeze({
  not_tested: () => {},
  blocked: setDay1P03Prebuild,
  completed: setDay1P03Completed,
});
const day1P03MetadataFieldCases = Object.freeze({
  evidence_presence: { not_tested: "已记录", blocked: "待填", completed: "待填", issue: "P03:onsite_evidence_presence_state_mismatch" },
  redaction_status: { not_tested: "已复核", blocked: "待填", completed: "待填", issue: "P03:onsite_redaction_status_state_mismatch" },
});
const day1P03MetadataMutations = Object.freeze([
  { suffix: "reverse", apply: (record, field, state, spec) => { record[field] = spec[state]; } },
  { suffix: "delete", apply: (record, field) => { delete record[field]; } },
  { suffix: "null", apply: (record, field) => { record[field] = null; } },
  { suffix: "number", apply: (record, field) => { record[field] = 0; } },
  { suffix: "object", apply: (record, field) => { record[field] = { invalid: true }; } },
]);
const day1P03MetadataClosureMutationCases = Object.entries(day1P03MetadataBaselineSetups).flatMap(([state, setup]) =>
  Object.entries(day1P03MetadataFieldCases).flatMap(([field, spec]) => day1P03MetadataMutations.map(({ suffix, apply }) => [
    `P03_metadata_${state}_${field}_${suffix}`,
    [spec.issue],
    setup,
    (c) => {
      apply(c.evidenceTemplate.permission_checks[2], field, state, spec);
    },
  ])));
const day1P03DeclarationClosureMutationCases = [
  ["P03_declaration_proof_root_exact_keys_missing", ["P03_contract_declaration_proof_root_exact_keys"], setupDay1PermissionBaseline, (c) => {
    c.resultTemplate.result_record_contract.p03_phase_contract.completed_on_site_machine_result_contract.proof_root_exact_keys.shift();
  }],
  ["P03_declaration_proof_root_exact_keys_extra", ["P03_contract_declaration_proof_root_exact_keys"], setupDay1PermissionBaseline, (c) => {
    c.resultTemplate.result_record_contract.p03_phase_contract.completed_on_site_machine_result_contract.proof_root_exact_keys.push("extra");
  }],
  ["P03_declaration_proof_root_exact_keys_rename", ["P03_contract_declaration_proof_root_exact_keys"], setupDay1PermissionBaseline, (c) => {
    c.resultTemplate.result_record_contract.p03_phase_contract.completed_on_site_machine_result_contract.proof_root_exact_keys[0] = "probe_reference";
  }],
  ["P03_declaration_proof_root_static_identity_missing", ["P03_contract_declaration_proof_root_static_identity"], setupDay1PermissionBaseline, (c) => {
    delete c.resultTemplate.result_record_contract.p03_phase_contract.completed_on_site_machine_result_contract.proof_root_static_identity.probe_ref;
  }],
  ["P03_declaration_proof_root_static_identity_extra", ["P03_contract_declaration_proof_root_static_identity"], setupDay1PermissionBaseline, (c) => {
    c.resultTemplate.result_record_contract.p03_phase_contract.completed_on_site_machine_result_contract.proof_root_static_identity.extra = false;
  }],
  ["P03_declaration_proof_root_static_identity_rename", ["P03_contract_declaration_proof_root_static_identity"], setupDay1PermissionBaseline, (c) => {
    const value = c.resultTemplate.result_record_contract.p03_phase_contract.completed_on_site_machine_result_contract.proof_root_static_identity;
    value.probe_reference = value.probe_ref; delete value.probe_ref;
  }],
  ["P03_declaration_deterministic_result_classification_missing", ["P03_contract_declaration_deterministic_result_classification"], setupDay1PermissionBaseline, (c) => {
    delete c.resultTemplate.result_record_contract.p03_phase_contract.completed_on_site_machine_result_contract.deterministic_result_classification["可用"];
  }],
  ["P03_declaration_deterministic_result_classification_extra", ["P03_contract_declaration_deterministic_result_classification"], setupDay1PermissionBaseline, (c) => {
    c.resultTemplate.result_record_contract.p03_phase_contract.completed_on_site_machine_result_contract.deterministic_result_classification.extra = "invalid";
  }],
  ["P03_declaration_deterministic_result_classification_rename", ["P03_contract_declaration_deterministic_result_classification"], setupDay1PermissionBaseline, (c) => {
    const value = c.resultTemplate.result_record_contract.p03_phase_contract.completed_on_site_machine_result_contract.deterministic_result_classification;
    value.available = value["可用"]; delete value["可用"];
  }],
  ["P03_declaration_evidence_metadata_state_contract_missing", ["P03_contract_declaration_evidence_metadata_state_contract"], setupDay1PermissionBaseline, (c) => {
    delete c.resultTemplate.result_record_contract.p03_phase_contract.evidence_metadata_state_contract.not_tested;
  }],
  ["P03_declaration_evidence_metadata_state_contract_extra", ["P03_contract_declaration_evidence_metadata_state_contract"], setupDay1PermissionBaseline, (c) => {
    c.resultTemplate.result_record_contract.p03_phase_contract.evidence_metadata_state_contract.extra = { evidence_presence: "待填", redaction_status: "待填" };
  }],
  ["P03_declaration_evidence_metadata_state_contract_rename", ["P03_contract_declaration_evidence_metadata_state_contract"], setupDay1PermissionBaseline, (c) => {
    const value = c.resultTemplate.result_record_contract.p03_phase_contract.evidence_metadata_state_contract;
    value.untested = value.not_tested; delete value.not_tested;
  }],
];
const day1P03ClosureMutationCases = [
  ...day1P03ProofClosureMutationCases,
  ...day1P03MetadataClosureMutationCases,
  ...day1P03DeclarationClosureMutationCases,
];
const DAY1_PERMISSION_MUTATION_EXPECTED_ISSUES = Object.freeze({
  permission_not_tested_with_evidence: Object.freeze(["P01:not_tested_shape"]),
  permission_blocked_without_evidence: Object.freeze(["P01:blocked_shape", "P01:derived_chinese_status"]),
  permission_same_record_evidence_mismatch: Object.freeze(["P01:blocked_shape"]),
  permission_onsite_evidence_mismatch: Object.freeze(["P01:blocked_shape"]),
  permission_completed_invalid_result: Object.freeze(["P01:completed_shape"]),
  permission_extra_field: Object.freeze(["P01:exact_fields"]),
  "L-TIME-01": Object.freeze(["P01:blocked_shape"]),
  "L-EVID-01": Object.freeze(["P01:evidence_entry_0_exact_keys"]),
  "L-EVID-02": Object.freeze(["P01:evidence_entry_0_exact_keys"]),
  "L-EVID-03": Object.freeze(["P01:evidence_entry_0_exact_keys"]),
  "L-R10-01": Object.freeze(["P04:r10_subchecks_applicability"]),
  "L-P03-STATE-01": Object.freeze(["P03_postbuild_requires_completed_prebuild"]),
  "L-P03-STATE-02": Object.freeze([
    "P03:completed_r10_subchecks_required", "P03:derived_chinese_status", "P03_parent_incomplete",
    "P03_completed_five_views_and_boundary_machine_result", "P03_completed_direct_clusters_table_machine_result",
    "P03_completed_source_visibility_intersection_machine_result", "P03_completed_attestation_id_digest",
    "P03_completed_capability_attestation_sha256", "P03_completed_permission_snapshot_sha256",
    "P03_completed_permission_revision", "P03_completed_issued_at", "P03_completed_expires_at",
    "P03_completed_capability_checked_at", "P03_completed_capability_rechecked_at",
    "P03_completed_prewrite_recheck_machine_result", "P03_completed_drift_or_expiry_machine_result",
    "P03_completed_requires_P02_completed", "P03_completed_P02_permission_snapshot_missing",
    "P03_completed_P02_permission_revision_missing", "P03_completed_result_classification",
  ]),
  "L-P03-TIME-01": Object.freeze(["prebuild_gate:observed_shape"]),
  "L-P03-BIND-01": Object.freeze(["prebuild_gate:parent_identity_cardinality", "prebuild_gate:parent_filtered_deep_binding"]),
  "L-P03-BIND-02": Object.freeze(["prebuild_gate:parent_identity_cardinality", "prebuild_gate:parent_filtered_deep_binding"]),
  "L-P03-BIND-03": Object.freeze(["prebuild_gate:parent_capture_phase", "prebuild_gate:parent_filtered_deep_binding"]),
  "L-DEP-01": Object.freeze(["P06:P05_gate"]),
  "L-DEP-02": Object.freeze(["P07:P05_gate"]),
  "L-DEP-03": Object.freeze(["P06:P05_gate"]),
  "L-DEP-04": Object.freeze(["P07:P05_gate"]),
  P03_attempted_phase_parent_not_tested: Object.freeze([
    "P03:not_tested_shape", "P03:derived_chinese_status", "P03:onsite_evidence_presence_state_mismatch",
    "P03:onsite_redaction_status_state_mismatch", "P03_parent_incomplete",
  ]),
  P06_dependency_drift: Object.freeze(["P06:dependency_edge"]),
  P03_completed_missing_r10_subchecks: Object.freeze(["P03:completed_r10_subchecks_required", "P03_completed_r10_subchecks_exact_keys"]),
  P03_completed_empty_r10_subchecks: Object.freeze(["P03:P03_completed_r10_subchecks_exact_keys", "P03_completed_r10_subchecks_exact_keys"]),
  P03_completed_opaque_r10_subchecks: Object.freeze(["P03:P03_completed_r10_subchecks_exact_keys", "P03_completed_r10_subchecks_exact_keys"]),
  P03_completed_null_r10_field: Object.freeze([
    "P03:P03_completed_P03-R10-raw-recurrence-visibility_evidence_refs",
    "P03_completed_P03-R10-raw-recurrence-visibility_evidence_refs",
  ]),
  P03_completed_missing_view: Object.freeze(["P03_completed_five_views_and_boundary_machine_result", "P03_completed_result_classification"]),
  P03_completed_view_not_opened: Object.freeze(["P03_completed_result_classification"]),
  P03_completed_view_not_refreshed: Object.freeze(["P03_completed_result_classification"]),
  P03_completed_allowed_action_unverified: Object.freeze(["P03_completed_result_classification"]),
  P03_completed_view_raw_visible: Object.freeze(["P03_completed_result_classification"]),
  P03_completed_direct_table_unchecked: Object.freeze(["P03_completed_direct_clusters_table_machine_result"]),
  P03_completed_direct_table_raw_visible: Object.freeze(["P03_completed_result_classification"]),
  P03_completed_visibility_intersection_broader: Object.freeze(["P03_completed_result_classification"]),
  P03_completed_relogin_not_verified: Object.freeze(["P03_completed_result_classification"]),
  P03_completed_refresh_drift: Object.freeze(["P03_completed_result_classification"]),
  P03_completed_W6_not_rejected: Object.freeze(["P03_completed_result_classification"]),
  P03_completed_protected_mutation_not_rejected: Object.freeze(["P03_completed_result_classification"]),
  P03_completed_admin_config_visible: Object.freeze(["P03_completed_result_classification"]),
  P03_completed_postbuild_parent_result_mismatch: Object.freeze(["P03_completed_postbuild_parent_result_mismatch"]),
  P03_completed_status_derivation_mismatch: Object.freeze(["P03:derived_chinese_status"]),
  P02_completed_missing_r10_subchecks: Object.freeze(["P02:completed_r10_subchecks_required"]),
  P02_completed_empty_r10_subchecks: Object.freeze(["P02:P02_r10_subchecks_exact_keys"]),
  P02_completed_opaque_r10_subchecks: Object.freeze(["P02:P02_r10_subchecks_exact_keys"]),
  P02_completed_extra_r10_subcheck: Object.freeze(["P02:P02_r10_subchecks_exact_keys"]),
  P02_completed_unbound_r10_subcheck: Object.freeze(["P02:P02_P02-R10-selector-cardinality_parent_binding"]),
  P03_completed_r10_unbound: Object.freeze([
    "P03:P03_completed_P03-R10-raw-recurrence-visibility_parent_binding",
    "P03_completed_P03-R10-raw-recurrence-visibility_parent_binding",
  ]),
  P03_completed_direct_denied_refresh_nonnull: Object.freeze(["P03_completed_direct_clusters_table_machine_result"]),
  P03_completed_direct_allowed_refresh_missing: Object.freeze(["P03_completed_direct_clusters_table_machine_result"]),
  P03_completed_attestation_digest_invalid: Object.freeze(["P03_completed_attestation_id_digest"]),
  P03_completed_attestation_time_equal_expiry: Object.freeze(["P03_completed_attestation_time_order"]),
  P03_completed_prewrite_recheck_false: Object.freeze(["P03_completed_result_classification"]),
  P03_completed_drift_injection_false: Object.freeze(["P03_completed_result_classification"]),
  P03_completed_requires_P02_completed: Object.freeze(["P03_completed_requires_P02_completed"]),
  P03_completed_P02_snapshot_missing: Object.freeze(["P03_completed_P02_permission_snapshot_missing"]),
  P03_completed_P02_snapshot_mismatch: Object.freeze(["P03_completed_P02_permission_snapshot_mismatch"]),
  P03_completed_P02_revision_missing: Object.freeze(["P03_completed_P02_permission_revision_missing"]),
  P03_completed_P02_revision_mismatch: Object.freeze(["P03_completed_P02_permission_revision_mismatch"]),
  capture_phase_probe_suite_declaration_drift: Object.freeze(["capture_phase_declaration_probe_suite"]),
  capture_phase_permission_results_declaration_drift: Object.freeze(["capture_phase_declaration_permission_results"]),
  capture_phase_evidence_template_declaration_drift: Object.freeze(["capture_phase_declaration_evidence_template"]),
  P03_onsite_prebuild_boundary_contract_drift: Object.freeze(["P03_onsite_prebuild_boundary_contract"]),
  P03_evidence_entry_unknown_capture: Object.freeze([
    "P03:evidence_entry_0_capture_phases", "prebuild_gate:parent_capture_phase", "prebuild_gate:parent_filtered_deep_binding",
  ]),
  P03_prebuild_proof_blocked_nonnull: Object.freeze(["prebuild_gate:actual_prebuild_proof_blocked_null"]),
  P03_prebuild_proof_fixture_marker_drift: Object.freeze(["prebuild_gate:actual_prebuild_proof_fixture_marker"]),
  P03_prebuild_proof_non_synthetic: Object.freeze(["prebuild_gate:actual_prebuild_proof_data_scope"]),
  P03_prebuild_proof_non_isolated_temporary_scope: Object.freeze(["prebuild_gate:actual_prebuild_proof_test_scope"]),
  P03_prebuild_proof_enterprise_data_used: Object.freeze(["prebuild_gate:actual_prebuild_proof_enterprise_data_used"]),
  P03_prebuild_proof_actor_class_drift: Object.freeze(["prebuild_gate:actual_prebuild_proof_actor_class"]),
  P03_prebuild_proof_actor_not_distinct: Object.freeze(["prebuild_gate:actual_prebuild_proof_actor_distinct_from_owner_verified"]),
  P03_prebuild_proof_owner_privileges_present: Object.freeze(["prebuild_gate:actual_prebuild_proof_owner_privileges_absent"]),
  P03_prebuild_proof_administrator_privileges_present: Object.freeze(["prebuild_gate:actual_prebuild_proof_administrator_privileges_absent"]),
  P03_prebuild_proof_independent_session_unverified: Object.freeze(["prebuild_gate:actual_prebuild_proof_independent_session_verified"]),
  P03_prebuild_proof_allowed_open_unattempted: Object.freeze(["prebuild_gate:actual_prebuild_proof_allowed_isolated_view_open_attempted"]),
  P03_prebuild_proof_protected_mutation_unattempted: Object.freeze([
    "prebuild_gate:actual_prebuild_proof_protected_mutation_attempted",
    "prebuild_gate:actual_prebuild_proof_result_classification",
  ]),
  P03_prebuild_proof_non_isolated_views_hidden_type: Object.freeze(["prebuild_gate:actual_prebuild_proof_non_isolated_views_hidden_type"]),
  P03_prebuild_proof_non_target_records_hidden_type: Object.freeze(["prebuild_gate:actual_prebuild_proof_non_target_records_hidden_type"]),
  P03_prebuild_proof_direct_table_access_denied_type: Object.freeze(["prebuild_gate:actual_prebuild_proof_direct_table_access_denied_type"]),
  P03_prebuild_proof_raw_json_hidden_type: Object.freeze(["prebuild_gate:actual_prebuild_proof_raw_json_hidden_type"]),
  P03_prebuild_proof_management_configuration_hidden_type: Object.freeze(["prebuild_gate:actual_prebuild_proof_management_configuration_hidden_type"]),
  P03_prebuild_proof_temporary_access_not_revoked: Object.freeze(["prebuild_gate:actual_prebuild_proof_temporary_access_revoked"]),
  P03_prebuild_proof_cleanup_not_reverified: Object.freeze(["prebuild_gate:actual_prebuild_proof_cleanup_reverified"]),
  P03_prebuild_proof_unauthorized_count_type: Object.freeze(["prebuild_gate:actual_prebuild_proof_unauthorized_business_write_count_type"]),
  P03_prebuild_proof_unauthorized_count_negative: Object.freeze(["prebuild_gate:actual_prebuild_proof_unauthorized_business_write_count_nonnegative"]),
  P03_prebuild_proof_available_view_not_opened: Object.freeze(["prebuild_gate:actual_prebuild_proof_result_classification"]),
  P03_prebuild_proof_available_non_isolated_view_visible: Object.freeze(["prebuild_gate:actual_prebuild_proof_result_classification"]),
  P03_prebuild_proof_available_non_target_record_visible: Object.freeze(["prebuild_gate:actual_prebuild_proof_result_classification"]),
  P03_prebuild_proof_available_direct_table_access_allowed: Object.freeze(["prebuild_gate:actual_prebuild_proof_result_classification"]),
  P03_prebuild_proof_available_raw_json_visible: Object.freeze(["prebuild_gate:actual_prebuild_proof_result_classification"]),
  P03_prebuild_proof_available_management_configuration_visible: Object.freeze(["prebuild_gate:actual_prebuild_proof_result_classification"]),
  P03_prebuild_proof_available_mutation_not_rejected: Object.freeze(["prebuild_gate:actual_prebuild_proof_result_classification"]),
  P03_prebuild_proof_available_unauthorized_write: Object.freeze(["prebuild_gate:actual_prebuild_proof_result_classification"]),
  P03_prebuild_proof_available_business_state_changed: Object.freeze(["prebuild_gate:actual_prebuild_proof_result_classification"]),
  P03_prebuild_phase_evidence_full_object_mismatch: Object.freeze(["prebuild_gate:parent_filtered_deep_binding"]),
  P03_prebuild_phase_evidence_order_mismatch: Object.freeze(["prebuild_gate:parent_filtered_deep_binding"]),
  P03_prebuild_proof_restricted_without_limitations: Object.freeze([
    "P03:blocked_shape",
    "prebuild_gate:actual_prebuild_proof_limited_result_fallback",
  ]),
  P03_prebuild_proof_restricted_without_fallback: Object.freeze(["prebuild_gate:actual_prebuild_proof_limited_result_fallback"]),
  P03_prebuild_view_closed_but_mutation_attempted: Object.freeze(["prebuild_gate:actual_prebuild_proof_mutation_gate"]),
  P03_prebuild_view_closed_but_mutation_rejected: Object.freeze(["prebuild_gate:actual_prebuild_proof_mutation_gate"]),
  P03_prebuild_visibility_leak_but_mutation_attempted: Object.freeze(["prebuild_gate:actual_prebuild_proof_mutation_gate"]),
  P03_prebuild_declaration_missing: Object.freeze(["P03_contract_declaration_prebuild_proof_contract"]),
  P03_prebuild_declaration_extra: Object.freeze(["P03_contract_declaration_prebuild_proof_contract"]),
  P03_prebuild_declaration_rename: Object.freeze(["P03_contract_declaration_prebuild_proof_contract"]),
  P03_prebuild_unavailable_started_postbuild: Object.freeze([
    "prebuild_gate:actual_prebuild_proof_result_classification",
    "prebuild_gate:actual_prebuild_proof_limited_result_fallback",
    "P03_prebuild_unavailable_forbids_postbuild",
  ]),
  P03_prebuild_restricted_without_safe_fallback: Object.freeze([
    "prebuild_gate:actual_prebuild_proof_limited_result_fallback", "P03_prebuild_restricted_requires_safe_fallback",
  ]),
  P03_prebuild_restricted_without_limitations: Object.freeze([
    "prebuild_gate:actual_prebuild_proof_limited_result_fallback", "P03_prebuild_restricted_requires_safe_fallback",
  ]),
  P03_result_available_with_partial_views: Object.freeze(["P03_completed_result_classification"]),
  P03_result_restricted_with_zero_views: Object.freeze(["P03_completed_result_classification"]),
  P03_result_unavailable_with_all_safe_views: Object.freeze(["P03_completed_result_classification"]),
  P03_result_restricted_with_direct_leak: Object.freeze(["P03_completed_result_classification"]),
  P03_result_unavailable_with_prewrite_limit: Object.freeze(["P03_completed_result_classification"]),
});
const permissionMutationCandidateDigests = [];
function permissionMutationMatchesExpectedIssues(baselineIssues, mutationIssues, expectedIssues) {
  return baselineIssues.length === 0
    && Array.isArray(expectedIssues)
    && expectedIssues.length > 0
    && deepEqual(mutationIssues, expectedIssues);
}
function permissionMutationRejected(name, expectedIssues, setup, mutate) {
  const baseline = makeDay1PermissionCandidate();
  setup(baseline);
  const baselineIssues = day1PermissionArtifactIssues(baseline, allowedCapabilityResults);
  const candidate = structuredClone(baseline);
  mutate(candidate);
  const mutationIssues = day1PermissionArtifactIssues(candidate, allowedCapabilityResults);
  permissionMutationCandidateDigests.push({ name, digest: canonicalSha256(candidate) });
  return recordContractMutation(name, permissionMutationMatchesExpectedIssues(baselineIssues, mutationIssues, expectedIssues), candidate);
}
const permissionNegativeResults = [
  ["permission_not_tested_with_evidence", (c) => { c.resultTemplate.permission_probes[0].evidence = makeDay1Evidence("P01"); }],
  ["permission_blocked_without_evidence", (c) => { c.resultTemplate.permission_probes[0].execution_status = "blocked"; }],
  ["permission_same_record_evidence_mismatch", (c) => { const r = setDay1Observed(c, 0); r.evidence = { indexes: [], r10_subchecks: null }; }],
  ["permission_onsite_evidence_mismatch", (c) => { setDay1Observed(c, 0); c.evidenceTemplate.permission_checks[0].structured_evidence_index.indexes[0].actor_role = "other"; }],
  ["permission_completed_invalid_result", (c) => { const r = setDay1Observed(c, 0, "completed", "未测试"); r.limitations = null; }],
  ["permission_extra_field", (c) => { c.resultTemplate.permission_probes[0].unexpected = null; }],
  ["L-TIME-01", (c) => { setDay1Observed(c, 0).actual_time = "2099-01-01T00:00:00"; }],
  ["L-EVID-01", (c) => { const r = setDay1Observed(c, 0); delete r.evidence_index.indexes[0].actor_role; r.evidence = structuredClone(r.evidence_index); c.evidenceTemplate.permission_checks[0].structured_evidence_index = structuredClone(r.evidence_index); }],
  ["L-EVID-02", (c) => { const r = setDay1Observed(c, 0); r.evidence_index.indexes[0].extra = null; r.evidence = structuredClone(r.evidence_index); c.evidenceTemplate.permission_checks[0].structured_evidence_index = structuredClone(r.evidence_index); }],
  ["L-EVID-03", (c) => { const r = setDay1Observed(c, 0); r.evidence_index.indexes[0] = null; r.evidence = structuredClone(r.evidence_index); c.evidenceTemplate.permission_checks[0].structured_evidence_index = structuredClone(r.evidence_index); }],
  ["L-R10-01", (c) => { const r = setDay1Observed(c, 3); r.evidence_index.r10_subchecks = {}; r.evidence = structuredClone(r.evidence_index); c.evidenceTemplate.permission_checks[3].structured_evidence_index = structuredClone(r.evidence_index); }],
  ["L-P03-STATE-01", (c) => { setDay1P03PostbuildWithoutPrebuild(c); }],
  ["L-P03-STATE-02", (c) => { const x = setDay1P03Prebuild(c); x.resultTemplate.permission_probes[2].execution_status = "completed"; x.resultTemplate.permission_probes[2].result = "可用"; }],
  ["L-P03-TIME-01", (c) => { setDay1P03Prebuild(c).evidenceTemplate.permission_checks[2].p03_phase_observations.prebuild_gate.actual_time = "2099-01-01T00:00:00"; }],
  ["L-P03-BIND-01", (c) => { setDay1P03Prebuild(c).evidenceTemplate.permission_checks[2].p03_phase_observations.prebuild_gate.evidence_index.indexes[0].evidence_id = "T2-EV-P03-20990101-0000-99"; }],
  ["L-P03-BIND-02", (c) => { const x = setDay1P03Prebuild(c); const r = x.resultTemplate.permission_probes[2]; r.evidence_index.indexes.push(structuredClone(r.evidence_index.indexes[0])); r.evidence = structuredClone(r.evidence_index); x.evidenceTemplate.permission_checks[2].structured_evidence_index = structuredClone(r.evidence_index); }],
  ["L-P03-BIND-03", (c) => { const x = setDay1P03Prebuild(c); const r = x.resultTemplate.permission_probes[2]; r.evidence_index.indexes[0].capture_phases = ["failure"]; r.evidence = structuredClone(r.evidence_index); x.evidenceTemplate.permission_checks[2].structured_evidence_index = structuredClone(r.evidence_index); }],
  ["L-DEP-01", (c) => { setDay1Observed(c, 5); }],
  ["L-DEP-02", (c) => { setDay1Observed(c, 6); }],
  ["L-DEP-03", (c) => { setDay1Observed(c, 4); setDay1Observed(c, 5); }],
  ["L-DEP-04", (c) => { setDay1Observed(c, 4); setDay1Observed(c, 6); }],
  ["P03_attempted_phase_parent_not_tested", (c) => { setDay1P03Prebuild(c).resultTemplate.permission_probes[2].execution_status = "not_tested"; }],
  ["P06_dependency_drift", (c) => { c.probeSuite.probes[5].depends_on = ["P05"]; }],
  ["P03_completed_missing_r10_subchecks", (c) => { const x = setDay1P03Completed(c); const r = x.resultTemplate.permission_probes[2]; r.evidence_index.r10_subchecks = null; r.evidence = structuredClone(r.evidence_index); x.evidenceTemplate.permission_checks[2].structured_evidence_index = structuredClone(r.evidence_index); }],
  ["P03_completed_empty_r10_subchecks", (c) => { const x = setDay1P03Completed(c); const r = x.resultTemplate.permission_probes[2]; r.evidence_index.r10_subchecks = {}; r.evidence = structuredClone(r.evidence_index); x.evidenceTemplate.permission_checks[2].structured_evidence_index = structuredClone(r.evidence_index); }],
  ["P03_completed_opaque_r10_subchecks", (c) => { const x = setDay1P03Completed(c); const r = x.resultTemplate.permission_probes[2]; r.evidence_index.r10_subchecks = { opaque_fixture: true }; r.evidence = structuredClone(r.evidence_index); x.evidenceTemplate.permission_checks[2].structured_evidence_index = structuredClone(r.evidence_index); }],
  ["P03_completed_null_r10_field", (c) => { const x = setDay1P03Completed(c); const r = x.resultTemplate.permission_probes[2]; r.evidence_index.r10_subchecks["P03-R10-raw-recurrence-visibility"] = [null]; r.evidence = structuredClone(r.evidence_index); x.evidenceTemplate.permission_checks[2].structured_evidence_index = structuredClone(r.evidence_index); }],
  ["P03_completed_missing_view", (c) => { setDay1P03Completed(c).evidenceTemplate.permission_checks[2].r10_recurrence_visibility_and_attestation_evidence_contract.actual_all_five_business_views_result.views.pop(); }],
  ["P03_completed_view_not_opened", (c) => { setDay1P03Completed(c).evidenceTemplate.permission_checks[2].r10_recurrence_visibility_and_attestation_evidence_contract.actual_all_five_business_views_result.views[0].opened = false; }],
  ["P03_completed_view_not_refreshed", (c) => { setDay1P03Completed(c).evidenceTemplate.permission_checks[2].r10_recurrence_visibility_and_attestation_evidence_contract.actual_all_five_business_views_result.views[1].refreshed = false; }],
  ["P03_completed_allowed_action_unverified", (c) => { setDay1P03Completed(c).evidenceTemplate.permission_checks[2].r10_recurrence_visibility_and_attestation_evidence_contract.actual_all_five_business_views_result.views[2].allowed_action_verified = false; }],
  ["P03_completed_view_raw_visible", (c) => { setDay1P03Completed(c).evidenceTemplate.permission_checks[2].r10_recurrence_visibility_and_attestation_evidence_contract.actual_all_five_business_views_result.views[3].raw_recurrence_records_visible = true; }],
  ["P03_completed_direct_table_unchecked", (c) => { setDay1P03Completed(c).evidenceTemplate.permission_checks[2].r10_recurrence_visibility_and_attestation_evidence_contract.actual_direct_clusters_table_result.attempted = false; }],
  ["P03_completed_direct_table_raw_visible", (c) => { setDay1P03Completed(c).evidenceTemplate.permission_checks[2].r10_recurrence_visibility_and_attestation_evidence_contract.actual_direct_clusters_table_result.raw_recurrence_records_visible = true; }],
  ["P03_completed_visibility_intersection_broader", (c) => { setDay1P03Completed(c).evidenceTemplate.permission_checks[2].r10_recurrence_visibility_and_attestation_evidence_contract.actual_recurrence_visibility_no_broader_than_source_fields_result.no_broader_than_source_field_intersection = false; }],
  ["P03_completed_relogin_not_verified", (c) => { setDay1P03Completed(c).evidenceTemplate.permission_checks[2].r10_recurrence_visibility_and_attestation_evidence_contract.actual_all_five_business_views_result.relogin_completed = false; }],
  ["P03_completed_refresh_drift", (c) => { setDay1P03Completed(c).evidenceTemplate.permission_checks[2].r10_recurrence_visibility_and_attestation_evidence_contract.actual_all_five_business_views_result.refresh_boundary_stable = false; }],
  ["P03_completed_W6_not_rejected", (c) => { setDay1P03Completed(c).evidenceTemplate.permission_checks[2].r10_recurrence_visibility_and_attestation_evidence_contract.actual_all_five_business_views_result.unauthorized_W6_action_rejected = false; }],
  ["P03_completed_protected_mutation_not_rejected", (c) => { setDay1P03Completed(c).evidenceTemplate.permission_checks[2].r10_recurrence_visibility_and_attestation_evidence_contract.actual_all_five_business_views_result.protected_field_mutation_rejected = false; }],
  ["P03_completed_admin_config_visible", (c) => { setDay1P03Completed(c).evidenceTemplate.permission_checks[2].r10_recurrence_visibility_and_attestation_evidence_contract.actual_all_five_business_views_result.administrator_configuration_hidden = false; }],
  ["P03_completed_postbuild_parent_result_mismatch", (c) => { setDay1P03Completed(c).evidenceTemplate.permission_checks[2].p03_phase_observations.postbuild_five_view_direct_table_recheck.result = "不可用"; }],
  ["P03_completed_status_derivation_mismatch", (c) => { setDay1P03Completed(c).evidenceTemplate.permission_checks[2].status = "受限"; }],
  ["P02_completed_missing_r10_subchecks", (c) => { const x = setDay1P02Completed(c); const r = x.resultTemplate.permission_probes[1]; r.evidence_index.r10_subchecks = null; r.evidence = structuredClone(r.evidence_index); x.evidenceTemplate.permission_checks[1].structured_evidence_index = structuredClone(r.evidence_index); }],
  ["P02_completed_empty_r10_subchecks", (c) => { const x = setDay1P02Completed(c); const r = x.resultTemplate.permission_probes[1]; r.evidence_index.r10_subchecks = {}; r.evidence = structuredClone(r.evidence_index); x.evidenceTemplate.permission_checks[1].structured_evidence_index = structuredClone(r.evidence_index); }],
  ["P02_completed_opaque_r10_subchecks", (c) => { const x = setDay1P02Completed(c); const r = x.resultTemplate.permission_probes[1]; r.evidence_index.r10_subchecks = { opaque_fixture: true }; r.evidence = structuredClone(r.evidence_index); x.evidenceTemplate.permission_checks[1].structured_evidence_index = structuredClone(r.evidence_index); }],
  ["P02_completed_extra_r10_subcheck", (c) => { const x = setDay1P02Completed(c); const r = x.resultTemplate.permission_probes[1]; r.evidence_index.r10_subchecks.extra = [r.evidence_index.indexes[0].evidence_id]; r.evidence = structuredClone(r.evidence_index); x.evidenceTemplate.permission_checks[1].structured_evidence_index = structuredClone(r.evidence_index); }],
  ["P02_completed_unbound_r10_subcheck", (c) => { const x = setDay1P02Completed(c); const r = x.resultTemplate.permission_probes[1]; r.evidence_index.r10_subchecks["P02-R10-selector-cardinality"] = ["T2-EV-P02-20990101-0000-99"]; r.evidence = structuredClone(r.evidence_index); x.evidenceTemplate.permission_checks[1].structured_evidence_index = structuredClone(r.evidence_index); }],
  ["P03_completed_r10_unbound", (c) => { const x = setDay1P03Completed(c); const r = x.resultTemplate.permission_probes[2]; r.evidence_index.r10_subchecks["P03-R10-raw-recurrence-visibility"] = ["T2-EV-P03-20990101-0000-99"]; r.evidence = structuredClone(r.evidence_index); x.evidenceTemplate.permission_checks[2].structured_evidence_index = structuredClone(r.evidence_index); }],
  ["P03_completed_direct_denied_refresh_nonnull", (c) => { setDay1P03Completed(c).evidenceTemplate.permission_checks[2].r10_recurrence_visibility_and_attestation_evidence_contract.actual_direct_clusters_table_result.refreshed = true; }],
  ["P03_completed_direct_allowed_refresh_missing", (c) => { setDay1P03Completed(c).evidenceTemplate.permission_checks[2].r10_recurrence_visibility_and_attestation_evidence_contract.actual_direct_clusters_table_result.access_allowed = true; }],
  ["P03_completed_attestation_digest_invalid", (c) => { setDay1P03Completed(c).evidenceTemplate.permission_checks[2].r10_recurrence_visibility_and_attestation_evidence_contract.attestation_id_digest = "bad"; }],
  ["P03_completed_attestation_time_equal_expiry", (c) => { const p = setDay1P03Completed(c).evidenceTemplate.permission_checks[2].r10_recurrence_visibility_and_attestation_evidence_contract; p.expires_at = p.capability_rechecked_at; }],
  ["P03_completed_prewrite_recheck_false", (c) => { setDay1P03Completed(c).evidenceTemplate.permission_checks[2].r10_recurrence_visibility_and_attestation_evidence_contract.actual_prewrite_recheck_result.permission_revision_matches = false; }],
  ["P03_completed_drift_injection_false", (c) => { setDay1P03Completed(c).evidenceTemplate.permission_checks[2].r10_recurrence_visibility_and_attestation_evidence_contract.actual_drift_or_expiry_injection_result.zero_writes = false; }],
  ["P03_completed_requires_P02_completed", (c) => { const x = setDay1P03Completed(c); const r = x.resultTemplate.permission_probes[1]; r.execution_status = "blocked"; r.result = null; r.limitations = "synthetic_limit"; x.evidenceTemplate.permission_checks[1].status = "已阻塞"; }],
  ["P03_completed_P02_snapshot_missing", (c) => { setDay1P03Completed(c).evidenceTemplate.permission_checks[1].r10_selector_and_execution_mode_evidence_contract.permission_snapshot_sha256 = null; }],
  ["P03_completed_P02_snapshot_mismatch", (c) => { setDay1P03Completed(c).evidenceTemplate.permission_checks[1].r10_selector_and_execution_mode_evidence_contract.permission_snapshot_sha256 = "4".repeat(64); }],
  ["P03_completed_P02_revision_missing", (c) => { setDay1P03Completed(c).evidenceTemplate.permission_checks[1].r10_selector_and_execution_mode_evidence_contract.permission_revision = null; }],
  ["P03_completed_P02_revision_mismatch", (c) => { setDay1P03Completed(c).evidenceTemplate.permission_checks[1].r10_selector_and_execution_mode_evidence_contract.permission_revision = "other-revision"; }],
  ["capture_phase_probe_suite_declaration_drift", (c) => {
    c.probeSuite.status_contract.canonical_evidence_binding_contract.capture_phases_allowed.pop();
  }],
  ["capture_phase_permission_results_declaration_drift", (c) => {
    c.resultTemplate.result_record_contract.evidence_index_contract.non_P03_capture_phases_allowed.push("prebuild_gate");
  }],
  ["capture_phase_evidence_template_declaration_drift", (c) => {
    c.evidenceTemplate.permission_evidence_index_contract.capture_phases_allowed.reverse();
  }],
  ["P03_onsite_prebuild_boundary_contract_drift", (c) => {
    c.evidenceTemplate.permission_checks[2].p03_phase_binding_contract.prebuild_visibility_safety_keys.pop();
  }],
  ["P03_evidence_entry_unknown_capture", (c) => {
    const x = setDay1P03Prebuild(c);
    const parent = x.resultTemplate.permission_probes[2];
    const onsite = x.evidenceTemplate.permission_checks[2];
    parent.evidence_index.indexes[0].capture_phases = ["unknown_phase"];
    parent.evidence = structuredClone(parent.evidence_index);
    onsite.structured_evidence_index = structuredClone(parent.evidence_index);
  }],
  ["P03_prebuild_proof_blocked_nonnull", ["prebuild_gate:actual_prebuild_proof_blocked_null"], setDay1P03PrebuildBlockedPhase, (c) => {
    c.evidenceTemplate.permission_checks[2].p03_phase_observations.prebuild_gate.actual_prebuild_proof = makeDay1P03PrebuildProof();
  }],
  ["P03_prebuild_proof_fixture_marker_drift", ["prebuild_gate:actual_prebuild_proof_fixture_marker"], setDay1P03Prebuild, (c) => {
    c.evidenceTemplate.permission_checks[2].p03_phase_observations.prebuild_gate.actual_prebuild_proof.fixture_marker = "OTHER";
  }],
  ["P03_prebuild_proof_non_synthetic", ["prebuild_gate:actual_prebuild_proof_data_scope"], setDay1P03Prebuild, (c) => {
    c.evidenceTemplate.permission_checks[2].p03_phase_observations.prebuild_gate.actual_prebuild_proof.data_scope = "enterprise_data";
  }],
  ["P03_prebuild_proof_non_isolated_temporary_scope", ["prebuild_gate:actual_prebuild_proof_test_scope"], setDay1P03Prebuild, (c) => {
    c.evidenceTemplate.permission_checks[2].p03_phase_observations.prebuild_gate.actual_prebuild_proof.test_scope = "shared_base";
  }],
  ["P03_prebuild_proof_enterprise_data_used", ["prebuild_gate:actual_prebuild_proof_enterprise_data_used"], setDay1P03Prebuild, (c) => {
    c.evidenceTemplate.permission_checks[2].p03_phase_observations.prebuild_gate.actual_prebuild_proof.enterprise_data_used = true;
  }],
  ["P03_prebuild_proof_actor_class_drift", ["prebuild_gate:actual_prebuild_proof_actor_class"], setDay1P03Prebuild, (c) => {
    c.evidenceTemplate.permission_checks[2].p03_phase_observations.prebuild_gate.actual_prebuild_proof.actor_class = "owner";
  }],
  ["P03_prebuild_proof_actor_not_distinct", ["prebuild_gate:actual_prebuild_proof_actor_distinct_from_owner_verified"], setDay1P03Prebuild, (c) => {
    c.evidenceTemplate.permission_checks[2].p03_phase_observations.prebuild_gate.actual_prebuild_proof.actor_distinct_from_owner_verified = false;
  }],
  ["P03_prebuild_proof_owner_privileges_present", ["prebuild_gate:actual_prebuild_proof_owner_privileges_absent"], setDay1P03Prebuild, (c) => {
    c.evidenceTemplate.permission_checks[2].p03_phase_observations.prebuild_gate.actual_prebuild_proof.owner_privileges_absent = false;
  }],
  ["P03_prebuild_proof_administrator_privileges_present", ["prebuild_gate:actual_prebuild_proof_administrator_privileges_absent"], setDay1P03Prebuild, (c) => {
    c.evidenceTemplate.permission_checks[2].p03_phase_observations.prebuild_gate.actual_prebuild_proof.administrator_privileges_absent = false;
  }],
  ["P03_prebuild_proof_independent_session_unverified", ["prebuild_gate:actual_prebuild_proof_independent_session_verified"], setDay1P03Prebuild, (c) => {
    c.evidenceTemplate.permission_checks[2].p03_phase_observations.prebuild_gate.actual_prebuild_proof.independent_session_verified = false;
  }],
  ["P03_prebuild_proof_allowed_open_unattempted", ["prebuild_gate:actual_prebuild_proof_allowed_isolated_view_open_attempted"], setDay1P03Prebuild, (c) => {
    c.evidenceTemplate.permission_checks[2].p03_phase_observations.prebuild_gate.actual_prebuild_proof.allowed_isolated_view_open_attempted = false;
  }],
  ["P03_prebuild_proof_protected_mutation_unattempted", [
    "prebuild_gate:actual_prebuild_proof_protected_mutation_attempted",
    "prebuild_gate:actual_prebuild_proof_result_classification",
  ], setDay1P03Prebuild, (c) => {
    c.evidenceTemplate.permission_checks[2].p03_phase_observations.prebuild_gate.actual_prebuild_proof.protected_mutation_attempted = false;
  }],
  ...DAY1_P03_PREBUILD_VISIBILITY_SAFETY_KEYS.map((key) => [
    `P03_prebuild_proof_${key}_type`,
    [`prebuild_gate:actual_prebuild_proof_${key}_type`],
    setDay1P03Prebuild,
    (c) => { c.evidenceTemplate.permission_checks[2].p03_phase_observations.prebuild_gate.actual_prebuild_proof[key] = "true"; },
  ]),
  ["P03_prebuild_proof_temporary_access_not_revoked", ["prebuild_gate:actual_prebuild_proof_temporary_access_revoked"], setDay1P03Prebuild, (c) => {
    c.evidenceTemplate.permission_checks[2].p03_phase_observations.prebuild_gate.actual_prebuild_proof.temporary_access_revoked = false;
  }],
  ["P03_prebuild_proof_cleanup_not_reverified", ["prebuild_gate:actual_prebuild_proof_cleanup_reverified"], setDay1P03Prebuild, (c) => {
    c.evidenceTemplate.permission_checks[2].p03_phase_observations.prebuild_gate.actual_prebuild_proof.cleanup_reverified = false;
  }],
  ["P03_prebuild_proof_unauthorized_count_type", ["prebuild_gate:actual_prebuild_proof_unauthorized_business_write_count_type"], setDay1P03Prebuild, (c) => {
    c.evidenceTemplate.permission_checks[2].p03_phase_observations.prebuild_gate.actual_prebuild_proof.unauthorized_business_write_count = "0";
  }],
  ["P03_prebuild_proof_unauthorized_count_negative", ["prebuild_gate:actual_prebuild_proof_unauthorized_business_write_count_nonnegative"], setDay1P03Prebuild, (c) => {
    c.evidenceTemplate.permission_checks[2].p03_phase_observations.prebuild_gate.actual_prebuild_proof.unauthorized_business_write_count = -1;
  }],
  ["P03_prebuild_proof_available_view_not_opened", ["prebuild_gate:actual_prebuild_proof_result_classification"], setDay1P03Prebuild, (c) => {
    const proof = c.evidenceTemplate.permission_checks[2].p03_phase_observations.prebuild_gate.actual_prebuild_proof;
    proof.allowed_isolated_view_opened = false;
    proof.protected_mutation_attempted = false;
    proof.protected_mutation_rejected = false;
  }],
  ...[
    ["P03_prebuild_proof_available_non_isolated_view_visible", "non_isolated_views_hidden"],
    ["P03_prebuild_proof_available_non_target_record_visible", "non_target_records_hidden"],
    ["P03_prebuild_proof_available_direct_table_access_allowed", "direct_table_access_denied"],
    ["P03_prebuild_proof_available_raw_json_visible", "raw_json_hidden"],
    ["P03_prebuild_proof_available_management_configuration_visible", "management_configuration_hidden"],
  ].map(([name, key]) => [name, ["prebuild_gate:actual_prebuild_proof_result_classification"], setDay1P03Prebuild, (c) => {
    const proof = c.evidenceTemplate.permission_checks[2].p03_phase_observations.prebuild_gate.actual_prebuild_proof;
    proof[key] = false;
    proof.protected_mutation_attempted = false;
    proof.protected_mutation_rejected = false;
  }]),
  ["P03_prebuild_proof_available_mutation_not_rejected", ["prebuild_gate:actual_prebuild_proof_result_classification"], setDay1P03Prebuild, (c) => {
    c.evidenceTemplate.permission_checks[2].p03_phase_observations.prebuild_gate.actual_prebuild_proof.protected_mutation_rejected = false;
  }],
  ["P03_prebuild_proof_available_unauthorized_write", ["prebuild_gate:actual_prebuild_proof_result_classification"], setDay1P03Prebuild, (c) => {
    c.evidenceTemplate.permission_checks[2].p03_phase_observations.prebuild_gate.actual_prebuild_proof.unauthorized_business_write_count = 1;
  }],
  ["P03_prebuild_proof_available_business_state_changed", ["prebuild_gate:actual_prebuild_proof_result_classification"], setDay1P03Prebuild, (c) => {
    c.evidenceTemplate.permission_checks[2].p03_phase_observations.prebuild_gate.actual_prebuild_proof.business_state_unchanged = false;
  }],
  ["P03_prebuild_proof_restricted_without_limitations", ["P03:blocked_shape", "prebuild_gate:actual_prebuild_proof_limited_result_fallback"], setDay1P03PrebuildRestricted, (c) => {
    c.resultTemplate.permission_probes[2].limitations = null;
  }],
  ["P03_prebuild_proof_restricted_without_fallback", ["prebuild_gate:actual_prebuild_proof_limited_result_fallback"], setDay1P03PrebuildRestricted, (c) => {
    c.resultTemplate.permission_probes[2].fallback_verified = false;
  }],
  ["P03_prebuild_view_closed_but_mutation_attempted", ["prebuild_gate:actual_prebuild_proof_mutation_gate"], setDay1P03PrebuildUnavailable, (c) => {
    c.evidenceTemplate.permission_checks[2].p03_phase_observations.prebuild_gate.actual_prebuild_proof.protected_mutation_attempted = true;
  }],
  ["P03_prebuild_view_closed_but_mutation_rejected", ["prebuild_gate:actual_prebuild_proof_mutation_gate"], setDay1P03PrebuildUnavailable, (c) => {
    c.evidenceTemplate.permission_checks[2].p03_phase_observations.prebuild_gate.actual_prebuild_proof.protected_mutation_rejected = true;
  }],
  ["P03_prebuild_visibility_leak_but_mutation_attempted", ["prebuild_gate:actual_prebuild_proof_mutation_gate"], setDay1P03PrebuildVisibilityLeakUnavailable, (c) => {
    c.evidenceTemplate.permission_checks[2].p03_phase_observations.prebuild_gate.actual_prebuild_proof.protected_mutation_attempted = true;
  }],
  ["P03_prebuild_phase_evidence_full_object_mismatch", ["prebuild_gate:parent_filtered_deep_binding"], setDay1P03Prebuild, (c) => {
    c.evidenceTemplate.permission_checks[2].p03_phase_observations.prebuild_gate.evidence_index.indexes[0].actor_role = "different_unprivileged_actor";
  }],
  ["P03_prebuild_phase_evidence_order_mismatch", ["prebuild_gate:parent_filtered_deep_binding"], setDay1P03PrebuildWithTwoEvidence, (c) => {
    c.evidenceTemplate.permission_checks[2].p03_phase_observations.prebuild_gate.evidence_index.indexes.reverse();
  }],
  ["P03_prebuild_declaration_missing", ["P03_contract_declaration_prebuild_proof_contract"], setupDay1PermissionBaseline, (c) => {
    delete c.resultTemplate.result_record_contract.p03_phase_contract.prebuild_proof_contract;
  }],
  ["P03_prebuild_declaration_extra", ["P03_contract_declaration_prebuild_proof_contract"], setupDay1PermissionBaseline, (c) => {
    c.resultTemplate.result_record_contract.p03_phase_contract.prebuild_proof_contract.extra = null;
  }],
  ["P03_prebuild_declaration_rename", ["P03_contract_declaration_prebuild_proof_contract"], setupDay1PermissionBaseline, (c) => {
    const contract = c.resultTemplate.result_record_contract.p03_phase_contract.prebuild_proof_contract;
    contract.proof_field = contract.field;
    delete contract.field;
  }],
  ...day1P03ClosureMutationCases,
  ["P03_prebuild_unavailable_started_postbuild", (c) => { setDay1P03Completed(c).evidenceTemplate.permission_checks[2].p03_phase_observations.prebuild_gate.result = "不可用"; }],
  ["P03_prebuild_restricted_without_safe_fallback", (c) => { const x = setDay1P03Completed(c); x.evidenceTemplate.permission_checks[2].p03_phase_observations.prebuild_gate.result = "受限"; x.resultTemplate.permission_probes[2].limitations = "synthetic_limit"; x.resultTemplate.permission_probes[2].fallback_verified = false; }],
  ["P03_prebuild_restricted_without_limitations", (c) => { const x = setDay1P03Completed(c); x.evidenceTemplate.permission_checks[2].p03_phase_observations.prebuild_gate.result = "受限"; x.resultTemplate.permission_probes[2].limitations = null; x.resultTemplate.permission_probes[2].fallback_verified = true; }],
  ["P03_result_available_with_partial_views", (c) => { const rows = setDay1P03Completed(c).evidenceTemplate.permission_checks[2].r10_recurrence_visibility_and_attestation_evidence_contract.actual_all_five_business_views_result.views; Object.assign(rows[4], { opened: false, refreshed: false, allowed_action_verified: false }); }],
  ["P03_result_restricted_with_zero_views", (c) => { setDay1P03CompletedClassification(c, "受限", 0); }],
  ["P03_result_unavailable_with_all_safe_views", (c) => { setDay1P03CompletedClassification(c, "不可用", 5); }],
  ["P03_result_restricted_with_direct_leak", (c) => { setDay1P03CompletedClassification(c, "受限", 4).evidenceTemplate.permission_checks[2].r10_recurrence_visibility_and_attestation_evidence_contract.actual_direct_clusters_table_result.administrator_fields_visible = true; }],
  ["P03_result_unavailable_with_prewrite_limit", (c) => { setDay1P03CompletedClassification(c, "不可用", 5).evidenceTemplate.permission_checks[2].r10_recurrence_visibility_and_attestation_evidence_contract.actual_prewrite_recheck_result.permission_revision_matches = false; }],
].map(([name, expectedIssuesOrMutate, setupOrUndefined, mutateOrUndefined]) => mutateOrUndefined
  ? permissionMutationRejected(name, expectedIssuesOrMutate, setupOrUndefined, mutateOrUndefined)
  : permissionMutationRejected(name, DAY1_PERMISSION_MUTATION_EXPECTED_ISSUES[name], setupDay1PermissionBaseline, expectedIssuesOrMutate));
assert("permission_mutation_expected_issue_oracle_covers_every_non_closure_fixture", Object.keys(DAY1_PERMISSION_MUTATION_EXPECTED_ISSUES).length === 112
  && permissionNegativeResults.length === 177
  && day1P03ProofClosureMutationCases.length === 23
  && day1P03MetadataClosureMutationCases.length === 30
  && day1P03DeclarationClosureMutationCases.length === 12
  && day1P03ClosureMutationCases.length === 65
  && day1P03ClosureMutationCases.every((entry) => entry.length === 4
    && typeof entry[0] === "string"
    && Array.isArray(entry[1])
    && entry[1].length > 0
    && typeof entry[2] === "function"
    && typeof entry[3] === "function")
  && deepEqual(day1P03ClosureMutationCases.map(([name]) => name), DAY1_EXPECTED_P03_CLOSURE_FIXTURE_IDS)
  && new Set(day1P03ClosureMutationCases.map(([name]) => name)).size === 65
  && Object.keys(DAY1_PERMISSION_MUTATION_EXPECTED_ISSUES).every((name) => DAY1_NEGATIVE_TEST_NAMES_BY_CATEGORY.contract_mutations.includes(name))
  && DAY1_EXPECTED_P03_CLOSURE_FIXTURE_IDS.every((name) => !(name in DAY1_PERMISSION_MUTATION_EXPECTED_ISSUES)),
DAY1_PERMISSION_MUTATION_EXPECTED_ISSUES);
assert("permission_mutation_runner_rejects_non_target_errors_instead_of_accepting_any_issue", !permissionMutationMatchesExpectedIssues(
  [], ["P01:not_tested_shape"], ["synthetic_nonexistent_target_issue"],
));
const validP03CompletedCandidate = setDay1P03Completed(makeDay1PermissionCandidate());
const validP03DirectTableAllowedCandidate = structuredClone(validP03CompletedCandidate);
const validP03DirectTableAllowedResult = validP03DirectTableAllowedCandidate.evidenceTemplate.permission_checks[2]
  .r10_recurrence_visibility_and_attestation_evidence_contract.actual_direct_clusters_table_result;
validP03DirectTableAllowedResult.access_allowed = true;
validP03DirectTableAllowedResult.refreshed = true;
const reverseTimeP03Candidate = structuredClone(validP03CompletedCandidate);
reverseTimeP03Candidate.evidenceTemplate.permission_checks[2].p03_phase_observations.prebuild_gate.actual_time = "2099-01-01T00:00:02+08:00";
assert("permission_result_negative_matrix_rejects_timezone_evidence_P03_order_time_and_P05_gate_mutations", permissionNegativeResults.every(Boolean)
  && day1PermissionArtifactIssues(validP03CompletedCandidate, allowedCapabilityResults).length === 0
  && day1PermissionArtifactIssues(validP03DirectTableAllowedCandidate, allowedCapabilityResults).length === 0
  && deepEqual(day1PermissionArtifactIssues(reverseTimeP03Candidate, allowedCapabilityResults), ["P03_prebuild_time_after_postbuild_time"]), {
  mutation_results: permissionNegativeResults,
  direct_table_allowed_positive_issues: day1PermissionArtifactIssues(validP03DirectTableAllowedCandidate, allowedCapabilityResults),
  reverse_time_issues: day1PermissionArtifactIssues(reverseTimeP03Candidate, allowedCapabilityResults),
});
assert("permission_result_negative_matrix_has_unique_canonical_mutation_candidates", permissionMutationCandidateDigests.length === permissionNegativeResults.length
  && new Set(permissionMutationCandidateDigests.map(({ digest }) => digest)).size === permissionMutationCandidateDigests.length,
permissionMutationCandidateDigests);
const registeredContractMutationControls = negativeControls.filter(({ category }) => category === "contract_mutations");
assert("contract_mutations_all_184_register_unique_canonical_real_input_snapshots", registeredContractMutationControls.length === 184
  && contractMutationCandidateDigests.length === 184
  && equalArrays(
    contractMutationCandidateDigests.map(({ name }) => name),
    registeredContractMutationControls.map(({ name }) => name),
  )
  && new Set(contractMutationCandidateDigests.map(({ digest }) => digest)).size === 184,
contractMutationCandidateDigests);

const snapshotMutation = { ...snapshotB, probeSuite: { ...snapshotB.probeSuite, sha256: "0".repeat(64) } };
assert("failure_closed_selftest_rejects_snapshot_byte_SHA_drift", recordNegativeControl("snapshot_upstream", "byte_sha_mismatch", !snapshotsEqual(snapshotA, snapshotMutation)), snapshotMutation);
const offlineProfileMutationResults = [
  ["summary_synchronized_count", ["summary.baseline_passed_checks", "summary.total_passed_checks"], (copy) => {
    copy.summary.baseline_passed_checks = 2634;
    copy.summary.total_passed_checks = 2777;
  }],
  ["group_equal_cardinality_rename", ["check_groups.keys"], (copy) => {
    const groups = Object.entries(copy.check_groups);
    groups[0][0] = "legacy_equal_cardinality_rename";
    copy.check_groups = Object.fromEntries(groups);
  }],
  ["negative_category_count_swap", ["negative_test_matrix.categories.strict_JSON", "negative_test_matrix.categories.baseline_process"], (copy) => {
    copy.negative_test_matrix.categories.strict_JSON.total = 11;
    copy.negative_test_matrix.categories.strict_JSON.passed = 11;
    copy.negative_test_matrix.categories.baseline_process.total = 7;
    copy.negative_test_matrix.categories.baseline_process.passed = 7;
  }],
  ["C13_expected_observed_sync", ["contract_attestation.expected.c13.profile_digest", "contract_attestation.observed.c13.profile_digest"], (copy) => {
    copy.contract_attestation.expected.c13.profile_digest = "0".repeat(64);
    copy.contract_attestation.observed.c13.profile_digest = "0".repeat(64);
  }],
  ["source_top_selected_sync", ["sources.logicalManifest.sha256", "contract_attestation.observed.selected_sources"], (copy) => {
    copy.sources.logicalManifest.sha256 = "0".repeat(64);
    copy.contract_attestation.observed.selected_sources[0].sha256 = "0".repeat(64);
  }],
  ["onsite_verified_and_operation", ["onsite_status.R10_verification_status", "onsite_status.real_feishu_operations_performed_by_validator"], (copy) => {
    copy.onsite_status.R10_verification_status = "onsite_verified";
    copy.onsite_status.real_feishu_operations_performed_by_validator = 1;
  }],
  ["offline_negative_matrix_missing_key", ["negative_test_matrix.keys", "negative_test_matrix.observed_name_digest"], (copy) => {
    delete copy.negative_test_matrix.observed_name_digest;
  }],
  ["offline_negative_matrix_extra_key", ["negative_test_matrix.keys"], (copy) => {
    copy.negative_test_matrix.synthetic_extra = null;
  }],
  ["offline_negative_category_equal_cardinality_rename", ["negative_test_matrix.categories.keys"], (copy) => {
    const categories = Object.entries(copy.negative_test_matrix.categories);
    categories[0][0] = "strict_JSON_equal_cardinality_rename";
    copy.negative_test_matrix.categories = Object.fromEntries(categories);
  }],
  ["offline_negative_name_digest_drift", ["negative_test_matrix.observed_name_digest"], (copy) => {
    copy.negative_test_matrix.observed_name_digest = "0".repeat(64);
  }],
].map(([name, expectedIssues, mutate]) => {
  const copy = structuredClone(baseline);
  mutate(copy);
  return recordNegativeControl("snapshot_upstream", name, equalArrays(collectOfflineProfileIssues(copy, snapshotA), expectedIssues));
});
assert("failure_closed_selftest_rejects_synchronized_offline_summary_group_negative_C13_source_and_onsite_mutations", offlineProfileMutationResults.every(Boolean), offlineProfileMutationResults);
const offlineProfileShapeMutationResults = [
  ["accepted_tradeoff_sync", ["contract_attestation.accepted_security_tradeoffs", "contract_attestation.observed.tradeoffs"], (copy) => {
    copy.contract_attestation.accepted_security_tradeoffs.c12.digest = "0".repeat(64);
    copy.contract_attestation.observed.tradeoffs.c12.digest = "0".repeat(64);
  }],
  ["protection_count_swap", ["protection_category_counts"], (copy) => {
    copy.protection_category_counts.controlled_workflow_write = 95;
    copy.protection_category_counts.authorized_human_write = 33;
  }],
  ["observed_extra_key", ["contract_attestation.observed.keys"], (copy) => {
    copy.contract_attestation.observed.synthetic_extra = null;
  }],
  ["observed_missing_key", ["contract_attestation.observed.keys"], (copy) => {
    delete copy.contract_attestation.observed.versions;
  }],
  ["observed_process_shape", ["contract_attestation.observed.process"], (copy) => {
    copy.contract_attestation.observed.process.synthetic_extra = null;
  }],
].map(([name, expectedIssues, mutate]) => {
  const copy = structuredClone(baseline);
  mutate(copy);
  return { name, issues: collectOfflineProfileIssues(copy, snapshotA), expectedIssues };
});
assert("offline_profile_rejects_tradeoff_protection_and_observed_shape_mutations_with_exact_issues", offlineProfileShapeMutationResults.every((result) => equalArrays(result.issues, result.expectedIssues)), offlineProfileShapeMutationResults);
const legacyW6Mutation = structuredClone(legacyW6EvidenceResponsibilities);
legacyW6Mutation.required_evidence_items[0] = "equal_length_semantic_replacement_for_negative_control";
const r10EvidenceMutation = structuredClone(r10EvidenceBundle);
r10EvidenceMutation.P06.expected_repair_authorization_call_count = 1;
function collectFrozenR10EvidenceIssues(legacyEvidence, componentEvidence) {
  const issues = [];
  if (canonicalSha256(legacyEvidence) !== "63a5bda74d86abdf5fba4774ea58a21e68eab73ca8843f6311ecf9bebf097080") issues.push("legacy_W6_digest");
  if (canonicalSha256(componentEvidence) !== "e44ee48c8a9880d0713062113b369578592dbc88b17f14ee88d1b87afa6528f6") issues.push("R10_evidence_bundle_digest");
  return issues;
}
const legacyW6MutationRejected = recordNegativeControl("r10_evidence", "legacy_W6_semantic_replacement", equalArrays(
  collectFrozenR10EvidenceIssues(legacyW6Mutation, r10EvidenceBundle),
  ["legacy_W6_digest"],
));
const r10EvidenceMutationRejected = recordNegativeControl("r10_evidence", "R10_component_semantic_replacement", equalArrays(
  collectFrozenR10EvidenceIssues(legacyW6EvidenceResponsibilities, r10EvidenceMutation),
  ["R10_evidence_bundle_digest"],
));
assert("failure_closed_selftest_rejects_legacy_and_R10_evidence_semantic_mutations", legacyW6MutationRejected && r10EvidenceMutationRejected, [legacyW6Mutation, r10EvidenceMutation]);

const summarizedRedactionProbe = summarizeDiagnostic({
  tenant_access_token: REDACTION_SENTINEL,
  webhook_url: `https://example.invalid/${REDACTION_SENTINEL}`,
  record_id: `rec${REDACTION_SENTINEL}`,
});
assert("failure_diagnostics_reduce_objects_to_type_and_key_count_without_values_keys_URLs_or_tokens", recordNegativeControl("redaction", "sensitive_diagnostic_object", deepEqual(summarizedRedactionProbe, { type: "object", key_count: 3 })
  && !JSON.stringify(summarizedRedactionProbe).includes(REDACTION_SENTINEL)
  && !reportContainsSensitiveEmission(summarizedRedactionProbe)
  && equalArrays(collectSensitiveEmissionIssues({ value: REDACTION_SENTINEL }), ["token_pattern"])), summarizedRedactionProbe);
const redactionMutationResults = [
  ["sensitive_key", "sensitive_key", [
    { app_token: "synthetic-marker" },
    { app_token: 1 },
    { app_token: { ordinary: true } },
    { app_token: ["ordinary"] },
    { app_token: null },
  ]],
  ["complete_URL", "complete_URL", { value: "https://example.invalid/path" }],
  ["Bearer_authorization", "Bearer_authorization", { value: "Bearer synthetic_credential_value" }],
  ["Feishu_resource_ID", "Feishu_resource_ID", { value: "tblSynthetic123456" }],
  ["open_ID", "open_ID", { value: "ou_synthetic12345678" }],
  ["token_pattern", "token_pattern", { value: "api_live_synthetic123456" }],
].map(([name, expectedIssue, value]) => recordNegativeControl("redaction", name, Array.isArray(value)
  ? value.every((candidate) => equalArrays(collectSensitiveEmissionIssues(candidate), [expectedIssue]))
  : equalArrays(collectSensitiveEmissionIssues(value), [expectedIssue])));
assert("recursive_redaction_scanner_rejects_sensitive_keys_URL_Bearer_resource_ID_and_token_patterns", redactionMutationResults.every(Boolean)
  && equalArrays(collectSensitiveEmissionIssues({ value: "ordinary_tokenization_text_without_credential_material" }), []), "redaction matrix rejected");
const fixedFatal = fatalReport();
const fixedFatalEmission = serializeReportForEmission(fixedFatal);
assert("fixed_fatal_is_schema_valid_scanner_safe_and_emits_exactly_one_JSON_object", validateReportConsistency(fixedFatal)
  && !reportContainsSensitiveEmission(fixedFatal)
  && fixedFatalEmission.exitCode === 1
  && fixedFatalEmission.selection_reason === "accepted"
  && fixedFatalEmission.text === JSON.stringify(fixedFatal, null, 2)
  && parseStrictJsonObject(fixedFatalEmission.text, "fixed_fatal").ok, fixedFatalEmission);
const fatalSchemaMutations = [
  ["schema_version_drift", ["report_schema_version"], (copy) => { copy.report_schema_version = "neoloop.day1-validator-report.v2"; }],
  ["missing_nested_key", ["summary.keys"], (copy) => { delete copy.summary.day1_total_checks; }],
  ["extra_root_key", ["root.keys"], (copy) => { copy.synthetic_extra_root_key = null; }],
];
assert("report_schema_negative_matrix_rejects_version_missing_nested_key_and_extra_root_key", fatalSchemaMutations.every(([name, expectedIssues, mutate]) => {
  const copy = structuredClone(fixedFatal);
  mutate(copy);
  return recordNegativeControl("report_schema", name, equalArrays(collectReportConsistencyIssues(copy), expectedIssues));
}), fatalSchemaMutations);
const maliciousFatal = structuredClone(fixedFatal);
maliciousFatal.errors[0].details = { app_token: REDACTION_SENTINEL };
assert("serializer_replaces_sensitive_report_with_exact_fixed_fatal", recordNegativeControl("redaction", "serializer_sensitive_report", serializeReportForEmission(maliciousFatal).text === JSON.stringify(fixedFatal, null, 2)
  && serializeReportForEmission(maliciousFatal).exitCode === 1
  && serializeReportForEmission(maliciousFatal).selection_reason === "sensitive_emission"), maliciousFatal);

const baselineTotal = baseline.summary.total_passed_checks;
function buildNormalReport(negativeTestMatrix, reportErrors = errors) {
  const day1PassedChecks = checks.filter((check) => check.ok).length;
  const day1TotalChecks = day1PassedChecks + reportErrors.length;
  const reportStatus = reportErrors.length === 0 ? "passed" : "failed";
  return {
  report_schema_version: REPORT_SCHEMA_VERSION,
  status: reportStatus,
  mode: "read_only_offline_fail_closed",
  fatal: null,
  offline_attestation: {
    attestation_schema_version: OFFLINE_ATTESTATION_SCHEMA_VERSION,
    status: "trusted",
    execution_byte_binding_scope: "path_reopen_with_pre_spawn_and_post_snapshot_SHA_compensation",
    residual_risk: "same_user_transient_swap_between_final_hash_and_exec_open",
    validator_path: snapshotA.baselineValidator.path,
    validator_sha256: snapshotA.baselineValidator.sha256,
    contract_validator_sha256: snapshotA.contractValidator.sha256,
    timeout_ms: OFFLINE_TIMEOUT_MS,
    max_buffer_bytes: OFFLINE_MAX_BUFFER,
    invocation_count: baselineAssessment.invocation_count,
    process_status: "passed",
    report_schema_version: baseline.report_schema_version,
    report_status: baseline.status,
    report_mode: baseline.mode,
    report_fatal: baseline.fatal,
    baseline_passed_checks: baseline.summary.baseline_passed_checks,
    offline_passed_checks: baseline.summary.offline_passed_checks,
    total_passed_checks: baseline.summary.total_passed_checks,
    check_group_count: Object.keys(baseline.check_groups).length,
    check_group_counts: structuredClone(OFFLINE_CHECK_GROUP_COUNTS),
    negative_test_count: baseline.negative_test_matrix.total,
    negative_test_category_counts: structuredClone(OFFLINE_NEGATIVE_TEST_COUNTS),
    negative_test_expected_name_digest: baseline.negative_test_matrix.expected_name_digest,
    negative_test_observed_name_digest: baseline.negative_test_matrix.observed_name_digest,
    source_count: Object.keys(publicSnapshotSources(snapshotA)).length,
    source_digest: canonicalSha256(publicSnapshotSources(snapshotA)),
    comparisons: {
      validator_sha: snapshotA.baselineValidator.sha256 === FROZEN_OFFLINE_VALIDATOR_SHA256,
      contract_validator_sha: snapshotA.contractValidator.sha256 === FROZEN_CONTRACT_VALIDATOR_SHA256,
      transport: baselineAssessment.ok === true && baselineAssessment.invocation_count === 1,
      snapshot: snapshotComparison,
      envelope: baseline.report_schema_version === OFFLINE_REPORT_SCHEMA_VERSION && baseline.status === "passed" && baseline.mode === "read_only" && baseline.fatal === null,
      profile: offlineProfileComparison,
      onsite: baseline.onsite_status.R10_verification_status === "not_tested" && baseline.onsite_status.base_write_attempts_performed_by_validator === 0,
      negative_test_names: baseline.negative_test_matrix.expected_name_digest === EXPECTED_OFFLINE_NEGATIVE_TEST_NAME_DIGEST
        && baseline.negative_test_matrix.observed_name_digest === EXPECTED_OFFLINE_NEGATIVE_TEST_NAME_DIGEST,
      all: true,
    },
  },
  sources: publicSnapshotSources(snapshotA),
  summary: {
    baseline_contract_checks: baseline.summary.baseline_passed_checks,
    baseline_offline_checks: baseline.summary.offline_passed_checks,
    baseline_total_checks: baselineTotal,
    day1_passed_checks: day1PassedChecks,
    day1_total_checks: day1TotalChecks,
    total_passed_checks: baselineTotal + day1PassedChecks,
    failed_checks: errors.length,
    probes: probeSuite.probes.length,
    import_table_batches: importPlan.table_batches.length,
    import_execution_units: importUnits.length,
    smoke_units: smokePlan.smoke_units.length,
    result_units: resultUnits.length,
    execution_records_untested: executionRecords.filter((record) => record.execution_status === "not_tested").length,
    evidence_null_values: executionRecords.filter((record) => record.evidence === null).length,
    resource_null_fields: resultResourceNullPaths.length + importResourceValues.filter((value) => value === null).length,
    onsite_evidence_units: onsiteEvidenceUnits.length,
    onsite_evidence_units_untested: onsiteEvidenceUnits.filter((unit) => unit.status === "未测试").length,
    r10_probe_subchecks: r10ProbeSubchecks.length,
    r10_probe_subchecks_untested: r10ProbeSubchecks.filter((unit) => unit.execution_status === "not_tested").length,
    r10_actual_slots_populated: r10ActualSlots.filter((value) => value !== null).length,
    day1_negative_controls: negativeTestMatrix.observed.total,
    day1_negative_controls_passed: negativeTestMatrix.observed.passed,
  },
  check_groups: {
    day1: {
      status: reportStatus,
      passed_checks: day1PassedChecks,
      failed_checks: reportErrors.map((error) => error.name),
    },
  },
  negative_test_matrix: negativeTestMatrix,
  onsite_status: {
    P01_to_P13: "全部未测试",
    R10_verification_status: "not_tested",
    R10_execution_mode: "insufficient",
    R10_automatic_projection_enabled: false,
    real_feishu_operations_performed_by_validator: 0,
    lark_cli_install_or_login_performed_by_validator: 0,
    openapi_calls_performed_by_validator: 0,
    base_write_attempts_performed_by_validator: 0,
  },
  errors: reportErrors,
  };
}

const snapshotC = await readSnapshot(snapshotInventory);
const snapshotCMatchesFrozenSources = exactOwnKeys(snapshotC, Object.keys(EXPECTED_SOURCE_SHA256))
  && Object.entries(EXPECTED_SOURCE_SHA256).every(([key, expectedSha256]) => snapshotC[key]?.sha256 === expectedSha256)
  && Object.keys(publicSnapshotSources(snapshotC)).length === EXPECTED_DAY1_SOURCE_COUNT
  && canonicalSha256(publicSnapshotSources(snapshotC)) === EXPECTED_DAY1_SOURCE_DIGEST;
snapshotComparison = snapshotComparison && snapshotCMatchesFrozenSources
  && snapshotsEqual(snapshotA, snapshotC) && snapshotsEqual(snapshotB, snapshotC);
const snapshotCMutation = {
  ...snapshotC,
  probeSuite: {
    ...snapshotC.probeSuite,
    bytes: Buffer.from(snapshotC.probeSuite.bytes),
    sha256: "0".repeat(64),
  },
};
assert("snapshot_C_post_validation_reread_matches_A_and_B_and_real_drift_is_rejected", snapshotComparison
  && !snapshotsEqual(snapshotA, snapshotCMutation), {
  snapshot_C_matches_frozen_sources: snapshotCMatchesFrozenSources,
  snapshot_A_B_C_equal: snapshotComparison,
  drift_rejected: !snapshotsEqual(snapshotA, snapshotCMutation),
});
if (!snapshotComparison) throw new Error("day1_snapshot_C_drift");

const normalFixture = buildNormalReport(passingDay1NegativeTestMatrix(), []);
const normalFixtureEmission = serializeReportForEmission(normalFixture);
const parsedNormalFixtureEmission = parseStrictJsonObject(normalFixtureEmission.text, "normal_fixture");
const passedUntrustedFixture = structuredClone(normalFixture);
passedUntrustedFixture.offline_attestation.status = "untrusted";
const comparisonFalseFixture = structuredClone(normalFixture);
comparisonFalseFixture.offline_attestation.comparisons.snapshot = false;
comparisonFalseFixture.offline_attestation.comparisons.all = false;
const sourceNullFixture = structuredClone(normalFixture);
sourceNullFixture.sources.logicalManifest.sha256 = null;
const passedUntrustedEmission = serializeReportForEmission(passedUntrustedFixture);
const passedUntrustedRejected = recordNegativeControl("report_schema", "passed_untrusted_fake_green",
  equalArrays(collectReportConsistencyIssues(passedUntrustedFixture), ["passed_requires_trusted_offline_attestation"])
  && passedUntrustedEmission.exitCode === 1
  && passedUntrustedEmission.text === JSON.stringify(fixedFatal, null, 2));
const normalSelftestDiagnostics = {
  consistency: validateReportConsistency(normalFixture),
  exit_code: normalFixtureEmission.exitCode === 0,
  selection_reason: normalFixtureEmission.selection_reason === "accepted",
  exact_text: normalFixtureEmission.text === JSON.stringify(normalFixture, null, 2),
  parsed: parsedNormalFixtureEmission.ok,
  canonical: parsedNormalFixtureEmission.ok && canonicalJson(parsedNormalFixtureEmission.value) === canonicalJson(normalFixture),
  passed_untrusted: passedUntrustedRejected,
  passed_untrusted_reason: passedUntrustedEmission.selection_reason === "report_consistency",
  comparison_issue: equalArrays(collectReportConsistencyIssues(comparisonFalseFixture), ["offline_attestation.comparisons"]),
  source_issue: equalArrays(collectReportConsistencyIssues(sourceNullFixture), ["sources.logicalManifest.sha256"]),
  fatal_canonical: canonicalJson(JSON.parse(fixedFatalEmission.text)) === canonicalJson(fixedFatal),
};
assert("normal_and_fatal_emissions_are_exact_canonical_and_normal_trust_mutations_fail_closed", Object.values(normalSelftestDiagnostics).every(Boolean), {
  normal_exit_code: normalFixtureEmission.exitCode,
  passed_untrusted_exit_code: passedUntrustedEmission.exitCode,
});

const unsummarizedDetailsFixture = structuredClone(normalFixture);
unsummarizedDetailsFixture.status = "failed";
unsummarizedDetailsFixture.errors = [{ name: "synthetic_unsummarized_details", group: "day1", details: { foo: "ordinary" } }];
unsummarizedDetailsFixture.check_groups.day1.status = "failed";
unsummarizedDetailsFixture.check_groups.day1.failed_checks = ["synthetic_unsummarized_details"];
unsummarizedDetailsFixture.summary.failed_checks = 1;
unsummarizedDetailsFixture.summary.day1_total_checks = unsummarizedDetailsFixture.summary.day1_passed_checks + 1;
assert("report_error_details_reject_unsummarized_safe_object", equalArrays(collectReportConsistencyIssues(unsummarizedDetailsFixture), ["errors.details"])
  && diagnosticSummaryIsSafe({ type: "object", key_count: 1 })
  && !diagnosticSummaryIsSafe({ foo: "ordinary" }), unsummarizedDetailsFixture.errors[0].details);

assert("fixed_fatal_unknown_observations_are_null", fixedFatal.offline_attestation.invocation_count === null
  && fixedFatal.offline_attestation.report_schema_version === null
  && fixedFatal.offline_attestation.report_status === null
  && fixedFatal.offline_attestation.report_mode === null
  && fixedFatal.offline_attestation.report_fatal === null
  && fixedFatal.offline_attestation.baseline_passed_checks === null
  && fixedFatal.offline_attestation.offline_passed_checks === null
  && fixedFatal.offline_attestation.total_passed_checks === null
  && fixedFatal.offline_attestation.check_group_count === null
  && fixedFatal.offline_attestation.negative_test_count === null
  && Object.values(fixedFatal.negative_test_matrix.observed).every((value) => value === null), fixedFatal.offline_attestation);

const expectedNegativeKeys = expectedDay1NegativeNameKeys();
const observedNegativeKeys = negativeControls.map((control) => `${control.category}:${control.name}`);
const day1NegativeCategoryCountsExact = Object.entries(DAY1_NEGATIVE_TEST_NAMES_BY_CATEGORY).every(([category, expectedNames]) => negativeControls.filter((control) => control.category === category).length === expectedNames.length);
const day1NegativeTestMatrix = buildDay1NegativeTestMatrix();
assert("day1_negative_names_categories_counts_and_rejection_results_match_frozen_profile", expectedNegativeKeys.length === 228
  && canonicalSha256([...expectedNegativeKeys].sort(codeUnitCompare)) === EXPECTED_DAY1_NEGATIVE_TEST_NAME_DIGEST
  && negativeControls.length === 228
  && new Set(observedNegativeKeys).size === observedNegativeKeys.length
  && day1NegativeCategoryCountsExact
  && day1NegativeProfileMatches(observedNegativeKeys)
  && negativeControls.every((control) => control.passed === true)
  && normalDay1NegativeTestMatrixMatches(day1NegativeTestMatrix), negativeControls);

return buildNormalReport(day1NegativeTestMatrix);
}

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

function emissionValueSensitivityIssue(value) {
  if (typeof value !== "string") return false;
  if (value.includes(REDACTION_SENTINEL)) return "token_pattern";
  if (/https?:\/\//i.test(value)) return "complete_URL";
  if (/\bBearer\s+[A-Za-z0-9._~+/=-]+/i.test(value)) return "Bearer_authorization";
  if (/\b(?:bascn|tbl|vew|rec|fld|doccn|shtcn|wikcn|boxcn)(?=[A-Za-z0-9_-]{6,}\b)(?=[A-Za-z0-9_-]*\d)[A-Za-z0-9_-]+\b/i.test(value)) return "Feishu_resource_ID";
  if (/\b(?:ou_|oc_|om_|on_|cli_)[A-Za-z0-9_-]{8,}\b/i.test(value)) return "open_ID";
  if (/\b(?:tkn|tok|sk|pat|api)[_-](?:live|test|prod)?[_-]?[A-Za-z0-9]{10,}\b/i.test(value)) return "token_pattern";
  return null;
}

function emissionValueIsSensitive(value) {
  return emissionValueSensitivityIssue(value) !== null && emissionValueSensitivityIssue(value) !== false;
}

function collectSensitiveEmissionIssues(value, issues = []) {
  const valueIssue = emissionValueSensitivityIssue(value);
  if (valueIssue) issues.push(valueIssue);
  if (Array.isArray(value)) {
    value.forEach((child) => collectSensitiveEmissionIssues(child, issues));
    return issues;
  }
  if (!value || typeof value !== "object") return issues;
  for (const [key, child] of Object.entries(value)) {
    if (SENSITIVE_EMISSION_KEYS.has(key.toLowerCase())) issues.push("sensitive_key");
    const keyIssue = emissionValueSensitivityIssue(key);
    if (keyIssue) issues.push(keyIssue);
    collectSensitiveEmissionIssues(child, issues);
  }
  return [...new Set(issues)];
}

function reportContainsSensitiveEmission(value) {
  return collectSensitiveEmissionIssues(value).length > 0;
}

function fatalSources() {
  return Object.fromEntries(Object.entries(SNAPSHOT_PATHS).map(([key, absolutePath]) => [key, {
    path: path.relative(repositoryRoot, absolutePath),
    sha256: null,
  }]));
}

function falseOfflineComparisons() {
  return Object.fromEntries(REPORT_OFFLINE_COMPARISON_KEYS.map((key) => [key, false]));
}

function fatalReport() {
  return {
    report_schema_version: REPORT_SCHEMA_VERSION,
    status: "failed",
    mode: "read_only_offline_fail_closed",
    fatal: { code: "day1_validator_fatal" },
    offline_attestation: {
      attestation_schema_version: OFFLINE_ATTESTATION_SCHEMA_VERSION,
      status: "untrusted",
      execution_byte_binding_scope: "path_reopen_with_pre_spawn_and_post_snapshot_SHA_compensation",
      residual_risk: "same_user_transient_swap_between_final_hash_and_exec_open",
      validator_path: path.relative(repositoryRoot, paths.baselineValidator),
      validator_sha256: null,
      contract_validator_sha256: null,
      timeout_ms: OFFLINE_TIMEOUT_MS,
      max_buffer_bytes: OFFLINE_MAX_BUFFER,
      invocation_count: null,
      process_status: null,
      report_schema_version: null,
      report_status: null,
      report_mode: null,
      report_fatal: null,
      baseline_passed_checks: null,
      offline_passed_checks: null,
      total_passed_checks: null,
      check_group_count: null,
      check_group_counts: {},
      negative_test_count: null,
      negative_test_category_counts: {},
      negative_test_expected_name_digest: null,
      negative_test_observed_name_digest: null,
      source_count: null,
      source_digest: null,
      comparisons: falseOfflineComparisons(),
    },
    sources: fatalSources(),
    summary: {
      baseline_contract_checks: null,
      baseline_offline_checks: null,
      baseline_total_checks: null,
      day1_passed_checks: null,
      day1_total_checks: null,
      total_passed_checks: null,
      failed_checks: 1,
      probes: null,
      import_table_batches: null,
      import_execution_units: null,
      smoke_units: null,
      result_units: null,
      execution_records_untested: null,
      evidence_null_values: null,
      resource_null_fields: null,
      onsite_evidence_units: null,
      onsite_evidence_units_untested: null,
      r10_probe_subchecks: null,
      r10_probe_subchecks_untested: null,
      r10_actual_slots_populated: null,
      day1_negative_controls: null,
      day1_negative_controls_passed: null,
    },
    check_groups: {
      day1: {
        status: "failed",
        passed_checks: null,
        failed_checks: ["day1_validator_fatal"],
      },
    },
    negative_test_matrix: fatalDay1NegativeTestMatrix(),
    onsite_status: {
      P01_to_P13: "untrusted",
      R10_verification_status: "not_tested",
      R10_execution_mode: "insufficient",
      R10_automatic_projection_enabled: false,
      real_feishu_operations_performed_by_validator: 0,
      lark_cli_install_or_login_performed_by_validator: 0,
      openapi_calls_performed_by_validator: 0,
      base_write_attempts_performed_by_validator: 0,
    },
    errors: [{
      name: "day1_validator_fatal",
      group: "day1",
      details: { type: "fixed_code", code: "day1_validator_fatal" },
    }],
  };
}

function reportConsistencyMatches(report) {
  if (!exactOwnKeys(report, REPORT_CORE_KEYS)
    || report.report_schema_version !== REPORT_SCHEMA_VERSION
    || report.mode !== "read_only_offline_fail_closed"
    || !["passed", "failed"].includes(report.status)) return false;

  if (report.fatal !== null) {
    return report.status === "failed"
      && canonicalJson(report) === canonicalJson(fatalReport());
  }

  if (!exactOwnKeys(report.offline_attestation, REPORT_OFFLINE_ATTESTATION_KEYS)
    || !exactOwnKeys(report.offline_attestation.comparisons, REPORT_OFFLINE_COMPARISON_KEYS)
    || !exactOwnKeys(report.summary, REPORT_SUMMARY_KEYS)
    || !exactOwnKeys(report.onsite_status, REPORT_ONSITE_STATUS_KEYS)
    || !exactOwnKeys(report.check_groups, ["day1"])
    || !exactOwnKeys(report.check_groups.day1, ["status", "passed_checks", "failed_checks"])
    || !Array.isArray(report.check_groups.day1.failed_checks)
    || !Array.isArray(report.errors)
    || !exactOwnKeys(report.sources, Object.keys(SNAPSHOT_PATHS))) return false;
  if (!Object.entries(SNAPSHOT_PATHS).every(([key, absolutePath]) => exactOwnKeys(report.sources[key], ["path", "sha256"])
    && report.sources[key].path === path.relative(repositoryRoot, absolutePath)
    && report.sources[key].sha256 === EXPECTED_SOURCE_SHA256[key])) return false;
  const errorNames = report.errors.map((error) => error?.name);
  const group = report.check_groups.day1;
  const expectedStatus = errorNames.length === 0 ? "passed" : "failed";
  const comparisons = report.offline_attestation.comparisons;
  return report.status === expectedStatus
    && group.status === expectedStatus
    && Number.isSafeInteger(group.passed_checks)
    && group.passed_checks >= 0
    && equalArrays(group.failed_checks, errorNames)
    && new Set(errorNames).size === errorNames.length
    && report.errors.every((error) => exactOwnKeys(error, ["name", "group", "details"])
      && error.group === "day1"
      && typeof error.name === "string"
      && error.name.length > 0
      && diagnosticSummaryIsSafe(error.details))
    && report.summary.day1_passed_checks === group.passed_checks
    && report.summary.day1_total_checks === group.passed_checks + errorNames.length
    && report.summary.failed_checks === errorNames.length
    && report.summary.total_passed_checks === report.summary.baseline_total_checks + report.summary.day1_passed_checks
    && report.summary.baseline_contract_checks === 2759
    && report.summary.baseline_offline_checks === 143
    && report.summary.baseline_total_checks === 2902
    && report.summary.probes === 13
    && report.summary.import_table_batches === 10
    && report.summary.import_execution_units === 13
    && report.summary.smoke_units === 5
    && report.summary.result_units === 36
    && report.summary.execution_records_untested === 70
    && report.summary.evidence_null_values === 70
    && report.summary.resource_null_fields === 48
    && report.summary.onsite_evidence_units === 41
    && report.summary.onsite_evidence_units_untested === 41
    && report.summary.r10_probe_subchecks === 5
    && report.summary.r10_probe_subchecks_untested === 5
    && report.summary.r10_actual_slots_populated === 0
    && report.summary.day1_negative_controls === 228
    && report.summary.day1_negative_controls_passed === 228
    && normalDay1NegativeTestMatrixMatches(report.negative_test_matrix)
    && report.offline_attestation.status === "trusted"
    && report.offline_attestation.attestation_schema_version === OFFLINE_ATTESTATION_SCHEMA_VERSION
    && report.offline_attestation.execution_byte_binding_scope === "path_reopen_with_pre_spawn_and_post_snapshot_SHA_compensation"
    && report.offline_attestation.residual_risk === "same_user_transient_swap_between_final_hash_and_exec_open"
    && report.offline_attestation.validator_path === path.relative(repositoryRoot, paths.baselineValidator)
    && report.offline_attestation.validator_sha256 === FROZEN_OFFLINE_VALIDATOR_SHA256
    && report.offline_attestation.contract_validator_sha256 === FROZEN_CONTRACT_VALIDATOR_SHA256
    && report.offline_attestation.timeout_ms === OFFLINE_TIMEOUT_MS
    && report.offline_attestation.max_buffer_bytes === OFFLINE_MAX_BUFFER
    && report.offline_attestation.invocation_count === 1
    && report.offline_attestation.process_status === "passed"
    && report.offline_attestation.report_schema_version === OFFLINE_REPORT_SCHEMA_VERSION
    && report.offline_attestation.report_status === "passed"
    && report.offline_attestation.report_mode === "read_only"
    && report.offline_attestation.report_fatal === null
    && report.offline_attestation.baseline_passed_checks === 2759
    && report.offline_attestation.offline_passed_checks === 143
    && report.offline_attestation.total_passed_checks === 2902
    && report.offline_attestation.check_group_count === 7
    && deepEqual(report.offline_attestation.check_group_counts, OFFLINE_CHECK_GROUP_COUNTS)
    && report.offline_attestation.negative_test_count === 125
    && deepEqual(report.offline_attestation.negative_test_category_counts, OFFLINE_NEGATIVE_TEST_COUNTS)
    && report.offline_attestation.negative_test_expected_name_digest === EXPECTED_OFFLINE_NEGATIVE_TEST_NAME_DIGEST
    && report.offline_attestation.negative_test_observed_name_digest === EXPECTED_OFFLINE_NEGATIVE_TEST_NAME_DIGEST
    && report.offline_attestation.source_count === EXPECTED_DAY1_SOURCE_COUNT
    && report.offline_attestation.source_digest === EXPECTED_DAY1_SOURCE_DIGEST
    && Object.values(comparisons).every((value) => value === true)
    && comparisons.all === true
    && report.onsite_status.P01_to_P13 === "全部未测试"
    && report.onsite_status.R10_verification_status === "not_tested"
    && report.onsite_status.R10_execution_mode === "insufficient"
    && report.onsite_status.R10_automatic_projection_enabled === false
    && report.onsite_status.real_feishu_operations_performed_by_validator === 0
    && report.onsite_status.lark_cli_install_or_login_performed_by_validator === 0
    && report.onsite_status.openapi_calls_performed_by_validator === 0
      && report.onsite_status.base_write_attempts_performed_by_validator === 0;
}

function collectReportConsistencyIssues(report) {
  const issues = [];
  if (!exactOwnKeys(report, REPORT_CORE_KEYS)) issues.push("root.keys");
  if (report?.report_schema_version !== REPORT_SCHEMA_VERSION) issues.push("report_schema_version");
  if (!exactOwnKeys(report?.summary, REPORT_SUMMARY_KEYS)) issues.push("summary.keys");
  if (report?.fatal !== null) {
    if (!reportConsistencyMatches(report) && issues.length === 0) issues.push("fatal_report.canonical");
    return issues;
  }
  if (report?.status === "passed" && report?.offline_attestation?.status !== "trusted") {
    issues.push("passed_requires_trusted_offline_attestation");
  } else if (report?.offline_attestation?.status !== "trusted") {
    issues.push("normal_report_requires_trusted_offline_attestation");
  }
  if (!exactOwnKeys(report?.offline_attestation?.comparisons, REPORT_OFFLINE_COMPARISON_KEYS)
    || !Object.values(report.offline_attestation.comparisons).every((value) => value === true)) {
    issues.push("offline_attestation.comparisons");
  }
  for (const [key, expectedSha256] of Object.entries(EXPECTED_SOURCE_SHA256)) {
    if (report?.sources?.[key]?.sha256 !== expectedSha256) issues.push(`sources.${key}.sha256`);
  }
  if (Array.isArray(report?.errors) && report.errors.some((error) => !diagnosticSummaryIsSafe(error?.details))) {
    issues.push("errors.details");
  }
  if (!reportConsistencyMatches(report) && issues.length === 0) issues.push("report_consistency");
  return issues;
}

function validateReportConsistency(report) {
  return collectReportConsistencyIssues(report).length === 0;
}

function serializeReportForEmission(report) {
  const sensitive = reportContainsSensitiveEmission(report);
  const consistent = validateReportConsistency(report);
  const selectionReason = sensitive ? "sensitive_emission" : (consistent ? "accepted" : "report_consistency");
  const selected = consistent && !sensitive ? report : fatalReport();
  const text = JSON.stringify(selected, null, 2);
  if (!validateReportConsistency(selected) || reportContainsSensitiveEmission(selected) || emissionValueIsSensitive(text)) {
    const fixed = fatalReport();
    return { text: JSON.stringify(fixed, null, 2), exitCode: 1, selection_reason: "emission_guard" };
  }
  return { text, exitCode: selected.status === "passed" ? 0 : 1, selection_reason: selectionReason };
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
