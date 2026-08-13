import {
  closeSync,
  constants as fsConstants,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const P03_EVENT_TRACE_MAX_BYTES = 64 * 1024;

const INPUT_SCHEMA_VERSION = "p03_event_trace.v2";
const REPORT_SCHEMA_VERSION = "p03_event_trace_report.v2";
const REPORT_SCOPE = "p03_event_trace_structure_and_provenance_only";
const FACT_CLASS = "synthetic_experiment";
const VALIDATION_SOURCE_CLASS = "machine_redacted_validator";
const CAPTURE_PHASES = Object.freeze([
  "prebuild_gate",
  "postbuild_five_view_direct_table_recheck",
]);

const ROOT_KEYS = Object.freeze(["schema_version", "fact_class", "capture_phase", "events"]);
const EVENT_KEYS = Object.freeze([
  "sequence",
  "event_type",
  "actor_class",
  "session_class",
  "evidence_id",
  "source_class",
  "capture_time_class",
  "observations",
]);
const EVENT_DEFINITIONS = Object.freeze([
  Object.freeze({
    eventType: "owner_baseline",
    actorClass: "owner",
    sessionClass: "owner_session",
    evidenceId: "P03-EV-01",
    sourceClass: "owner_visual_observation",
    captureTimeClass: "owner_baseline_before_permission",
    observationKeys: Object.freeze([
      "baseline_frozen",
      "synthetic_fixture_only",
      "enterprise_data_used",
      "automation_disabled",
    ]),
  }),
  Object.freeze({
    eventType: "first_permission_action",
    actorClass: "owner",
    sessionClass: "owner_session",
    evidenceId: "P03-EV-02",
    sourceClass: "owner_visual_observation",
    captureTimeClass: "owner_permission_action",
    observationKeys: Object.freeze([
      "minimum_temporary_scope_only",
      "formal_resource_shared",
      "parent_blocked_transition_recorded",
    ]),
  }),
  Object.freeze({
    eventType: "second_identity_boundary_check",
    actorClass: "second_non_owner_non_admin",
    sessionClass: "independent_mobile_session",
    evidenceId: "P03-EV-03",
    sourceClass: "second_identity_mobile_user_attested",
    captureTimeClass: "second_identity_mobile_pre_revoke",
    observationKeys: Object.freeze([
      "actor_distinct_from_owner_verified",
      "owner_privileges_absent",
      "administrator_privileges_absent",
      "independent_mobile_session_verified",
      "allowed_view_open_attempted",
      "allowed_view_opened",
      "other_views_visible",
      "other_records_visible",
      "direct_table_access_allowed",
      "protected_mutation_attempted",
      "protected_mutation_rejected",
      "unauthorized_business_write_count",
      "raw_json_visible",
      "management_config_visible",
    ]),
  }),
  Object.freeze({
    eventType: "owner_equivalence_recheck",
    actorClass: "owner",
    sessionClass: "owner_session",
    evidenceId: "P03-EV-04",
    sourceClass: "owner_visual_observation",
    captureTimeClass: "owner_equivalence_before_revoke",
    observationKeys: Object.freeze([
      "business_state_unchanged",
      "feedback_ownership_unchanged",
      "relations_unchanged",
      "automation_disabled",
      "audit_or_version_evidence_checked",
      "unauthorized_business_write_count",
    ]),
  }),
  Object.freeze({
    eventType: "temporary_access_revoked",
    actorClass: "owner",
    sessionClass: "owner_session",
    evidenceId: "P03-EV-05",
    sourceClass: "owner_visual_observation",
    captureTimeClass: "owner_revocation_action",
    observationKeys: Object.freeze([
      "temporary_access_revoked",
      "permission_mapping_removed",
    ]),
  }),
  Object.freeze({
    eventType: "post_revoke_denial_recheck",
    actorClass: "second_non_owner_non_admin",
    sessionClass: "independent_mobile_session",
    evidenceId: "P03-EV-06",
    sourceClass: "second_identity_mobile_user_attested",
    captureTimeClass: "second_identity_mobile_post_revoke",
    observationKeys: Object.freeze([
      "same_second_identity_as_pre_revoke_attested",
      "refresh_completed",
      "relogin_completed",
      "access_denied",
      "other_views_visible",
      "other_records_visible",
      "direct_table_access_allowed",
      "raw_json_visible",
      "management_config_visible",
      "unauthorized_business_write_count",
    ]),
  }),
  Object.freeze({
    eventType: "final_owner_equivalence_recheck",
    actorClass: "owner",
    sessionClass: "owner_session",
    evidenceId: "P03-EV-07",
    sourceClass: "owner_visual_observation",
    captureTimeClass: "owner_final_equivalence_after_revoke",
    observationKeys: Object.freeze([
      "business_state_unchanged",
      "feedback_ownership_unchanged",
      "relations_unchanged",
      "automation_disabled",
      "audit_or_version_evidence_checked",
      "temporary_access_remains_revoked",
      "unauthorized_business_write_count",
    ]),
  }),
]);

const ISSUE_CODE_ORDER = Object.freeze([
  "input_transport",
  "duplicate_json_key",
  "invalid_json",
  "sensitive_input",
  "document_shape",
  "event_count",
  "duplicate_event",
  "event_order",
  "event_shape",
  "event_provenance_invalid",
  "owner_baseline_invalid",
  "first_permission_action_invalid",
  "second_identity_invalid",
  "owner_preview_substitution",
  "allowed_view_check_missing",
  "protected_mutation_boundary_failed",
  "mutation_after_boundary_leak",
  "mutation_after_view_denied",
  "unauthorized_business_write",
  "other_views_exposure",
  "other_records_exposure",
  "direct_table_access_exposure",
  "raw_json_exposure",
  "management_configuration_exposure",
  "owner_equivalence_failed",
  "revocation_failed",
  "post_revoke_identity_invalid",
  "refresh_relogin_missing",
  "post_revoke_access_not_denied",
  "final_owner_equivalence_failed",
  "report_shape",
]);
const ISSUE_CODE_SET = new Set(ISSUE_CODE_ORDER);

const REPORT_KEYS = Object.freeze([
  "schema_version",
  "scope",
  "fact_class",
  "input_digest",
  "validation_source_class",
  "observation_truth_machine_verified",
  "onsite_fact_status_derived",
  "capture_phase",
  "validation_status",
  "completion_gate",
  "capability_result",
  "parent_p03_completion_derived",
  "event_count",
  "order_verified",
  "provenance_verified",
  "owner_visual_observation_count",
  "second_identity_mobile_user_attested_count",
  "second_identity_verified",
  "allowed_view_opened",
  "owner_equivalence_verified",
  "final_owner_equivalence_verified",
  "refresh_relogin_verified",
  "revocation_verified",
  "unauthorized_business_write_count",
  "other_views_hidden",
  "other_records_hidden",
  "direct_table_access_denied",
  "raw_json_hidden",
  "management_configuration_hidden",
  "issue_codes",
]);

const SENSITIVE_KEY_PATTERN = /(?:^|_)(?:url|uri|locator|account|email|phone|app_id|record_id|table_id|field_id|view_id|base_token|access_token|refresh_token|secret|password|cookie|open_id|union_id|tenant_key|provider_error|raw_payload)(?:$|_)/i;
const SENSITIVE_VALUE_PATTERNS = Object.freeze([
  /https?:\/\//i,
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
  /\bbearer\s+\S+/i,
  /\b(?:access|refresh)[_ -]?token\s*[:=]/i,
  /\b(?:app|client)[_ -]?secret\s*[:=]/i,
  /\bdevice[_ -]?code\s*[:=]/i,
  /\b(?:ou_|on_|oc_|cli_)[A-Za-z0-9]{8,}\b/,
  /\b(?:app|tbl|rec|view|fld)(?=[A-Za-z0-9_-]{8,}\b)(?=[A-Za-z0-9_-]*[A-Z0-9])[A-Za-z0-9_-]+\b/,
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

function sortedIssueCodes(codes) {
  const present = new Set(codes);
  return ISSUE_CODE_ORDER.filter((code) => present.has(code));
}

function emptyMetrics() {
  return {
    input_digest: null,
    capture_phase: null,
    capability_result: null,
    event_count: null,
    order_verified: false,
    provenance_verified: false,
    owner_visual_observation_count: null,
    second_identity_mobile_user_attested_count: null,
    second_identity_verified: false,
    allowed_view_opened: null,
    owner_equivalence_verified: false,
    final_owner_equivalence_verified: false,
    refresh_relogin_verified: false,
    revocation_verified: false,
    unauthorized_business_write_count: null,
    other_views_hidden: null,
    other_records_hidden: null,
    direct_table_access_denied: null,
    raw_json_hidden: null,
    management_configuration_hidden: null,
  };
}

function makeReport(metrics, issueCodes) {
  const issues = sortedIssueCodes(issueCodes);
  const passed = issues.length === 0;
  const capabilityResult = passed ? metrics.capability_result : null;
  const completionGate = !passed
    ? "ineligible"
    : metrics.capture_phase === "postbuild_five_view_direct_table_recheck"
      ? "not_applicable"
      : capabilityResult === "available" ? "eligible" : "ineligible";
  return {
    schema_version: REPORT_SCHEMA_VERSION,
    scope: REPORT_SCOPE,
    fact_class: FACT_CLASS,
    input_digest: metrics.input_digest,
    validation_source_class: VALIDATION_SOURCE_CLASS,
    observation_truth_machine_verified: false,
    onsite_fact_status_derived: false,
    capture_phase: metrics.capture_phase,
    validation_status: passed ? "passed" : "failed",
    completion_gate: completionGate,
    capability_result: capabilityResult,
    parent_p03_completion_derived: false,
    event_count: metrics.event_count,
    order_verified: metrics.order_verified,
    provenance_verified: metrics.provenance_verified,
    owner_visual_observation_count: metrics.owner_visual_observation_count,
    second_identity_mobile_user_attested_count: metrics.second_identity_mobile_user_attested_count,
    second_identity_verified: metrics.second_identity_verified,
    allowed_view_opened: metrics.allowed_view_opened,
    owner_equivalence_verified: metrics.owner_equivalence_verified,
    final_owner_equivalence_verified: metrics.final_owner_equivalence_verified,
    refresh_relogin_verified: metrics.refresh_relogin_verified,
    revocation_verified: metrics.revocation_verified,
    unauthorized_business_write_count: metrics.unauthorized_business_write_count,
    other_views_hidden: metrics.other_views_hidden,
    other_records_hidden: metrics.other_records_hidden,
    direct_table_access_denied: metrics.direct_table_access_denied,
    raw_json_hidden: metrics.raw_json_hidden,
    management_configuration_hidden: metrics.management_configuration_hidden,
    issue_codes: issues,
  };
}

function fixedFailure(issueCode, inputDigest = null) {
  const metrics = emptyMetrics();
  metrics.input_digest = inputDigest;
  return makeReport(metrics, [issueCode]);
}

function containsSensitiveInput(root) {
  const pending = [root];
  const seen = new WeakSet();

  while (pending.length > 0) {
    const value = pending.pop();
    if (typeof value === "string") {
      if (SENSITIVE_VALUE_PATTERNS.some((pattern) => pattern.test(value))) return true;
      continue;
    }
    if (value === null || typeof value !== "object") continue;
    if (seen.has(value)) return true;
    seen.add(value);
    if (Array.isArray(value)) {
      for (const child of value) pending.push(child);
      continue;
    }
    for (const key of Object.keys(value)) {
      if (SENSITIVE_KEY_PATTERN.test(key)) return true;
      pending.push(value[key]);
    }
  }
  return false;
}

function allTrue(object, keys) {
  return keys.every((key) => object?.[key] === true);
}

function isNonnegativeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function digestBytes(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function digestObject(value) {
  return digestBytes(Buffer.from(JSON.stringify(value), "utf8"));
}

function internalValidate(root, inputDigest) {
  const issues = [];
  const metrics = emptyMetrics();
  metrics.input_digest = inputDigest;

  if (containsSensitiveInput(root)) issues.push("sensitive_input");
  if (!exactOwnKeys(root, ROOT_KEYS)
    || root.schema_version !== INPUT_SCHEMA_VERSION
    || root.fact_class !== FACT_CLASS
    || !CAPTURE_PHASES.includes(root.capture_phase)
    || !Array.isArray(root.events)) {
    issues.push("document_shape");
    return makeReport(metrics, issues);
  }

  metrics.capture_phase = root.capture_phase;
  const events = root.events;
  metrics.event_count = events.length;
  if (events.length !== EVENT_DEFINITIONS.length) issues.push("event_count");

  const eventTypes = events.map((event) => event?.event_type);
  if (eventTypes.filter((eventType) => typeof eventType === "string").length !== new Set(eventTypes).size) {
    issues.push("duplicate_event");
  }

  const orderValid = events.length === EVENT_DEFINITIONS.length
    && events.every((event, index) => isPlainObject(event)
      && event.sequence === index + 1
      && event.event_type === EVENT_DEFINITIONS[index].eventType);
  metrics.order_verified = orderValid;
  if (!orderValid) issues.push("event_order");

  const shapeValid = EVENT_DEFINITIONS.map((definition, index) => {
    const event = events[index];
    return exactOwnKeys(event, EVENT_KEYS) && exactOwnKeys(event.observations, definition.observationKeys);
  });
  if (events.length !== EVENT_DEFINITIONS.length || shapeValid.some((value) => !value)) issues.push("event_shape");

  if (!orderValid || shapeValid.some((value) => !value)) return makeReport(metrics, issues);

  metrics.owner_visual_observation_count = events
    .filter((event) => event.source_class === "owner_visual_observation").length;
  metrics.second_identity_mobile_user_attested_count = events
    .filter((event) => event.source_class === "second_identity_mobile_user_attested").length;
  metrics.provenance_verified = events.every((event, index) => {
    const definition = EVENT_DEFINITIONS[index];
    return event.evidence_id === definition.evidenceId
      && event.source_class === definition.sourceClass
      && event.capture_time_class === definition.captureTimeClass;
  });
  if (!metrics.provenance_verified) issues.push("event_provenance_invalid");

  const [
    baseline,
    permission,
    secondIdentity,
    ownerRecheck,
    revocation,
    postRevoke,
    finalOwnerRecheck,
  ] = events;
  const baselineObservations = baseline.observations;
  const permissionObservations = permission.observations;
  const secondObservations = secondIdentity.observations;
  const ownerObservations = ownerRecheck.observations;
  const revocationObservations = revocation.observations;
  const postRevokeObservations = postRevoke.observations;
  const finalOwnerObservations = finalOwnerRecheck.observations;

  const baselineValid = baseline.actor_class === "owner"
    && baseline.session_class === "owner_session"
    && baselineObservations.baseline_frozen === true
    && baselineObservations.synthetic_fixture_only === true
    && baselineObservations.enterprise_data_used === false
    && baselineObservations.automation_disabled === true;
  if (!baselineValid) issues.push("owner_baseline_invalid");

  const permissionValid = permission.actor_class === "owner"
    && permission.session_class === "owner_session"
    && permissionObservations.minimum_temporary_scope_only === true
    && permissionObservations.formal_resource_shared === false
    && permissionObservations.parent_blocked_transition_recorded === true;
  if (!permissionValid) issues.push("first_permission_action_invalid");

  metrics.second_identity_verified = secondIdentity.actor_class === "second_non_owner_non_admin"
    && secondIdentity.session_class === "independent_mobile_session"
    && allTrue(secondObservations, [
      "actor_distinct_from_owner_verified",
      "owner_privileges_absent",
      "administrator_privileges_absent",
      "independent_mobile_session_verified",
    ]);
  if (!metrics.second_identity_verified) issues.push("second_identity_invalid");
  if (secondIdentity.actor_class === "owner"
    || /owner|preview/i.test(secondIdentity.session_class)
    || postRevoke.actor_class === "owner"
    || /owner|preview/i.test(postRevoke.session_class)) {
    issues.push("owner_preview_substitution");
  }

  const preRevokeHardBoundaryKeys = [
    "other_views_visible",
    "other_records_visible",
    "direct_table_access_allowed",
    "raw_json_visible",
    "management_config_visible",
  ];
  const preRevokeHardBoundarySafe = preRevokeHardBoundaryKeys
    .every((key) => secondObservations[key] === false);

  const allowedViewCheckValid = secondObservations.allowed_view_open_attempted === true
    && typeof secondObservations.allowed_view_opened === "boolean";
  if (!allowedViewCheckValid) {
    issues.push("allowed_view_check_missing");
  } else {
    metrics.allowed_view_opened = secondObservations.allowed_view_opened;
    metrics.capability_result = metrics.allowed_view_opened ? "available" : "unavailable";
  }

  if (!preRevokeHardBoundarySafe) {
    if (secondObservations.protected_mutation_attempted !== false
      || secondObservations.protected_mutation_rejected !== false) {
      issues.push("mutation_after_boundary_leak");
    }
  } else if (allowedViewCheckValid && metrics.allowed_view_opened) {
    if (secondObservations.protected_mutation_attempted !== true
      || secondObservations.protected_mutation_rejected !== true) {
      issues.push("protected_mutation_boundary_failed");
    }
  } else if (secondObservations.protected_mutation_attempted !== false
    || secondObservations.protected_mutation_rejected !== false) {
    issues.push("mutation_after_view_denied");
  }

  const writeCounts = [
    secondObservations.unauthorized_business_write_count,
    ownerObservations.unauthorized_business_write_count,
    postRevokeObservations.unauthorized_business_write_count,
    finalOwnerObservations.unauthorized_business_write_count,
  ];
  if (writeCounts.every(isNonnegativeInteger)) {
    metrics.unauthorized_business_write_count = writeCounts.reduce((sum, value) => sum + value, 0);
  }
  if (metrics.unauthorized_business_write_count !== 0) issues.push("unauthorized_business_write");

  const visibilityChecks = [
    ["other_views_hidden", "other_views_exposure", "other_views_visible"],
    ["other_records_hidden", "other_records_exposure", "other_records_visible"],
    ["direct_table_access_denied", "direct_table_access_exposure", "direct_table_access_allowed"],
    ["raw_json_hidden", "raw_json_exposure", "raw_json_visible"],
    ["management_configuration_hidden", "management_configuration_exposure", "management_config_visible"],
  ];
  for (const [metricKey, issueCode, observationKey] of visibilityChecks) {
    const visibility = [secondObservations[observationKey], postRevokeObservations[observationKey]];
    if (visibility.every((value) => typeof value === "boolean")) {
      metrics[metricKey] = visibility.every((value) => value === false);
    }
    if (metrics[metricKey] !== true) issues.push(issueCode);
  }

  metrics.owner_equivalence_verified = ownerRecheck.actor_class === "owner"
    && ownerRecheck.session_class === "owner_session"
    && allTrue(ownerObservations, [
      "business_state_unchanged",
      "feedback_ownership_unchanged",
      "relations_unchanged",
      "automation_disabled",
      "audit_or_version_evidence_checked",
    ])
    && ownerObservations.unauthorized_business_write_count === 0;
  if (!metrics.owner_equivalence_verified) issues.push("owner_equivalence_failed");

  metrics.revocation_verified = revocation.actor_class === "owner"
    && revocation.session_class === "owner_session"
    && revocationObservations.temporary_access_revoked === true
    && revocationObservations.permission_mapping_removed === true;
  if (!metrics.revocation_verified) issues.push("revocation_failed");

  const postRevokeIdentityValid = postRevoke.actor_class === "second_non_owner_non_admin"
    && postRevoke.session_class === "independent_mobile_session"
    && postRevokeObservations.same_second_identity_as_pre_revoke_attested === true;
  if (!postRevokeIdentityValid) issues.push("post_revoke_identity_invalid");

  metrics.refresh_relogin_verified = postRevokeIdentityValid
    && postRevokeObservations.refresh_completed === true
    && postRevokeObservations.relogin_completed === true;
  if (!metrics.refresh_relogin_verified) issues.push("refresh_relogin_missing");
  if (postRevokeObservations.access_denied !== true) issues.push("post_revoke_access_not_denied");

  metrics.final_owner_equivalence_verified = finalOwnerRecheck.actor_class === "owner"
    && finalOwnerRecheck.session_class === "owner_session"
    && allTrue(finalOwnerObservations, [
      "business_state_unchanged",
      "feedback_ownership_unchanged",
      "relations_unchanged",
      "automation_disabled",
      "audit_or_version_evidence_checked",
      "temporary_access_remains_revoked",
    ])
    && finalOwnerObservations.unauthorized_business_write_count === 0;
  if (!metrics.final_owner_equivalence_verified) issues.push("final_owner_equivalence_failed");

  return makeReport(metrics, issues);
}

export function validateP03EventTrace(root) {
  try {
    return internalValidate(root, digestObject(root));
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

function validateP03EventTraceTextWithDigest(text, inputDigest) {
  try {
    inspectJsonForDuplicateKeys(text);
  } catch (error) {
    return fixedFailure(error instanceof JsonInspectionError ? error.code : "invalid_json", inputDigest);
  }
  let root;
  try {
    root = JSON.parse(text);
  } catch {
    return fixedFailure("invalid_json", inputDigest);
  }
  try {
    return internalValidate(root, inputDigest);
  } catch {
    return fixedFailure("document_shape", inputDigest);
  }
}

export function validateP03EventTraceText(text) {
  if (typeof text !== "string" || Buffer.byteLength(text) > P03_EVENT_TRACE_MAX_BYTES) {
    return fixedFailure("input_transport");
  }
  return validateP03EventTraceTextWithDigest(
    text,
    digestBytes(Buffer.from(text, "utf8")),
  );
}

export function validateP03EventTraceBuffer(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length > P03_EVENT_TRACE_MAX_BYTES) {
    return fixedFailure("input_transport");
  }
  const inputDigest = digestBytes(buffer);
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
    return validateP03EventTraceTextWithDigest(text, inputDigest);
  } catch {
    return fixedFailure("input_transport", inputDigest);
  }
}

function reportShapeValid(report) {
  if (!exactOwnKeys(report, REPORT_KEYS)
    || report.schema_version !== REPORT_SCHEMA_VERSION
    || report.scope !== REPORT_SCOPE
    || report.fact_class !== FACT_CLASS
    || !(report.input_digest === null || /^sha256:[0-9a-f]{64}$/.test(report.input_digest))
    || report.validation_source_class !== VALIDATION_SOURCE_CLASS
    || report.observation_truth_machine_verified !== false
    || report.onsite_fact_status_derived !== false
    || !(report.capture_phase === null || CAPTURE_PHASES.includes(report.capture_phase))
    || report.parent_p03_completion_derived !== false
    || !["passed", "failed"].includes(report.validation_status)
    || !["eligible", "ineligible", "not_applicable"].includes(report.completion_gate)
    || !["available", "unavailable", null].includes(report.capability_result)
    || !(report.event_count === null || isNonnegativeInteger(report.event_count))
    || typeof report.order_verified !== "boolean"
    || typeof report.provenance_verified !== "boolean"
    || !(report.owner_visual_observation_count === null
      || isNonnegativeInteger(report.owner_visual_observation_count))
    || !(report.second_identity_mobile_user_attested_count === null
      || isNonnegativeInteger(report.second_identity_mobile_user_attested_count))
    || typeof report.second_identity_verified !== "boolean"
    || ![true, false, null].includes(report.allowed_view_opened)
    || typeof report.owner_equivalence_verified !== "boolean"
    || typeof report.final_owner_equivalence_verified !== "boolean"
    || typeof report.refresh_relogin_verified !== "boolean"
    || typeof report.revocation_verified !== "boolean"
    || !(report.unauthorized_business_write_count === null
      || isNonnegativeInteger(report.unauthorized_business_write_count))
    || ![true, false, null].includes(report.other_views_hidden)
    || ![true, false, null].includes(report.other_records_hidden)
    || ![true, false, null].includes(report.direct_table_access_denied)
    || ![true, false, null].includes(report.raw_json_hidden)
    || ![true, false, null].includes(report.management_configuration_hidden)
    || !Array.isArray(report.issue_codes)
    || report.issue_codes.some((code) => !ISSUE_CODE_SET.has(code))
    || report.issue_codes.length !== new Set(report.issue_codes).size
    || JSON.stringify(report.issue_codes) !== JSON.stringify(sortedIssueCodes(report.issue_codes))) return false;

  if (report.validation_status === "passed") {
    const expectedGate = report.capture_phase === "postbuild_five_view_direct_table_recheck"
      ? "not_applicable"
      : report.capability_result === "available" ? "eligible" : "ineligible";
    return report.completion_gate === expectedGate
      && /^sha256:[0-9a-f]{64}$/.test(report.input_digest)
      && CAPTURE_PHASES.includes(report.capture_phase)
      && ["available", "unavailable"].includes(report.capability_result)
      && report.allowed_view_opened === (report.capability_result === "available")
      && report.event_count === EVENT_DEFINITIONS.length
      && report.order_verified === true
      && report.provenance_verified === true
      && report.owner_visual_observation_count === 5
      && report.second_identity_mobile_user_attested_count === 2
      && report.second_identity_verified === true
      && report.owner_equivalence_verified === true
      && report.final_owner_equivalence_verified === true
      && report.refresh_relogin_verified === true
      && report.revocation_verified === true
      && report.unauthorized_business_write_count === 0
      && report.other_views_hidden === true
      && report.other_records_hidden === true
      && report.direct_table_access_denied === true
      && report.raw_json_hidden === true
      && report.management_configuration_hidden === true
      && report.issue_codes.length === 0;
  }
  return report.capability_result === null
    && report.completion_gate === "ineligible"
    && report.issue_codes.length > 0;
}

export function serializeP03EventTraceReport(report) {
  const selected = reportShapeValid(report) ? report : fixedFailure("report_shape");
  return JSON.stringify(Object.fromEntries(REPORT_KEYS.map((key) => [key, selected[key]])), null, 2);
}

function loadExplicitRedactedFixture(pathArgument) {
  if (typeof pathArgument !== "string" || !pathArgument.endsWith(".redacted.json")) {
    return fixedFailure("input_transport");
  }

  let descriptor;
  try {
    const path = resolve(pathArgument);
    const entry = lstatSync(path);
    if (!entry.isFile() || entry.isSymbolicLink() || entry.size > P03_EVENT_TRACE_MAX_BYTES) {
      return fixedFailure("input_transport");
    }
    descriptor = openSync(path, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
    const opened = fstatSync(descriptor);
    if (!opened.isFile() || opened.size > P03_EVENT_TRACE_MAX_BYTES) {
      return fixedFailure("input_transport");
    }
    return validateP03EventTraceBuffer(readFileSync(descriptor));
  } catch {
    return fixedFailure("input_transport");
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function main() {
  const report = process.argv.length === 3
    ? loadExplicitRedactedFixture(process.argv[2])
    : fixedFailure("input_transport");
  process.stdout.write(`${serializeP03EventTraceReport(report)}\n`);
  process.exitCode = report.validation_status !== "passed"
    ? 1
    : report.completion_gate === "eligible" ? 0 : 2;
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isCli) main();
