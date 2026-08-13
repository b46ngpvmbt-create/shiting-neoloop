import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

import {
  P03_EVENT_TRACE_MAX_BYTES,
  serializeP03EventTraceReport,
  validateP03EventTrace,
  validateP03EventTraceBuffer,
  validateP03EventTraceText,
} from "../../feishu/scripts/validate-live-p03-event-trace.mjs";

const reportKeys = [
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
];

function validTrace() {
  return {
    schema_version: "p03_event_trace.v2",
    fact_class: "synthetic_experiment",
    capture_phase: "prebuild_gate",
    events: [
      {
        sequence: 1,
        event_type: "owner_baseline",
        actor_class: "owner",
        session_class: "owner_session",
        evidence_id: "P03-EV-01",
        source_class: "owner_visual_observation",
        capture_time_class: "owner_baseline_before_permission",
        observations: {
          baseline_frozen: true,
          synthetic_fixture_only: true,
          enterprise_data_used: false,
          automation_disabled: true,
        },
      },
      {
        sequence: 2,
        event_type: "first_permission_action",
        actor_class: "owner",
        session_class: "owner_session",
        evidence_id: "P03-EV-02",
        source_class: "owner_visual_observation",
        capture_time_class: "owner_permission_action",
        observations: {
          minimum_temporary_scope_only: true,
          formal_resource_shared: false,
          parent_blocked_transition_recorded: true,
        },
      },
      {
        sequence: 3,
        event_type: "second_identity_boundary_check",
        actor_class: "second_non_owner_non_admin",
        session_class: "independent_mobile_session",
        evidence_id: "P03-EV-03",
        source_class: "second_identity_mobile_user_attested",
        capture_time_class: "second_identity_mobile_pre_revoke",
        observations: {
          actor_distinct_from_owner_verified: true,
          owner_privileges_absent: true,
          administrator_privileges_absent: true,
          independent_mobile_session_verified: true,
          allowed_view_open_attempted: true,
          allowed_view_opened: true,
          other_views_visible: false,
          other_records_visible: false,
          direct_table_access_allowed: false,
          protected_mutation_attempted: true,
          protected_mutation_rejected: true,
          unauthorized_business_write_count: 0,
          raw_json_visible: false,
          management_config_visible: false,
        },
      },
      {
        sequence: 4,
        event_type: "owner_equivalence_recheck",
        actor_class: "owner",
        session_class: "owner_session",
        evidence_id: "P03-EV-04",
        source_class: "owner_visual_observation",
        capture_time_class: "owner_equivalence_before_revoke",
        observations: {
          business_state_unchanged: true,
          feedback_ownership_unchanged: true,
          relations_unchanged: true,
          automation_disabled: true,
          audit_or_version_evidence_checked: true,
          unauthorized_business_write_count: 0,
        },
      },
      {
        sequence: 5,
        event_type: "temporary_access_revoked",
        actor_class: "owner",
        session_class: "owner_session",
        evidence_id: "P03-EV-05",
        source_class: "owner_visual_observation",
        capture_time_class: "owner_revocation_action",
        observations: {
          temporary_access_revoked: true,
          permission_mapping_removed: true,
        },
      },
      {
        sequence: 6,
        event_type: "post_revoke_denial_recheck",
        actor_class: "second_non_owner_non_admin",
        session_class: "independent_mobile_session",
        evidence_id: "P03-EV-06",
        source_class: "second_identity_mobile_user_attested",
        capture_time_class: "second_identity_mobile_post_revoke",
        observations: {
          same_second_identity_as_pre_revoke_attested: true,
          refresh_completed: true,
          relogin_completed: true,
          access_denied: true,
          other_views_visible: false,
          other_records_visible: false,
          direct_table_access_allowed: false,
          raw_json_visible: false,
          management_config_visible: false,
          unauthorized_business_write_count: 0,
        },
      },
      {
        sequence: 7,
        event_type: "final_owner_equivalence_recheck",
        actor_class: "owner",
        session_class: "owner_session",
        evidence_id: "P03-EV-07",
        source_class: "owner_visual_observation",
        capture_time_class: "owner_final_equivalence_after_revoke",
        observations: {
          business_state_unchanged: true,
          feedback_ownership_unchanged: true,
          relations_unchanged: true,
          automation_disabled: true,
          audit_or_version_evidence_checked: true,
          temporary_access_remains_revoked: true,
          unauthorized_business_write_count: 0,
        },
      },
    ],
  };
}

function issueSet(report) {
  return new Set(report.issue_codes);
}

test("a complete ordered prebuild trace is eligible without deriving parent P03 completion", () => {
  const report = validateP03EventTrace(validTrace());

  assert.deepEqual(Object.keys(report), reportKeys);
  assert.equal(report.validation_status, "passed");
  assert.equal(report.completion_gate, "eligible");
  assert.equal(report.capability_result, "available");
  assert.equal(report.scope, "p03_event_trace_structure_and_provenance_only");
  assert.match(report.input_digest, /^sha256:[0-9a-f]{64}$/);
  assert.equal(report.validation_source_class, "machine_redacted_validator");
  assert.equal(report.observation_truth_machine_verified, false);
  assert.equal(report.onsite_fact_status_derived, false);
  assert.equal(report.capture_phase, "prebuild_gate");
  assert.equal(report.parent_p03_completion_derived, false);
  assert.equal(report.event_count, 7);
  assert.equal(report.order_verified, true);
  assert.equal(report.provenance_verified, true);
  assert.equal(report.owner_visual_observation_count, 5);
  assert.equal(report.second_identity_mobile_user_attested_count, 2);
  assert.equal(report.second_identity_verified, true);
  assert.equal(report.allowed_view_opened, true);
  assert.equal(report.owner_equivalence_verified, true);
  assert.equal(report.final_owner_equivalence_verified, true);
  assert.equal(report.refresh_relogin_verified, true);
  assert.equal(report.revocation_verified, true);
  assert.equal(report.unauthorized_business_write_count, 0);
  assert.equal(report.other_views_hidden, true);
  assert.equal(report.other_records_hidden, true);
  assert.equal(report.direct_table_access_denied, true);
  assert.equal(report.raw_json_hidden, true);
  assert.equal(report.management_configuration_hidden, true);
  assert.deepEqual(report.issue_codes, []);
});

test("a denied allowed-view probe can complete as unavailable after cleanup but cannot open the safe-build gate", () => {
  const trace = validTrace();
  trace.events[2].observations.allowed_view_opened = false;
  trace.events[2].observations.protected_mutation_attempted = false;
  trace.events[2].observations.protected_mutation_rejected = false;

  const report = validateP03EventTrace(trace);

  assert.equal(report.validation_status, "passed");
  assert.equal(report.capability_result, "unavailable");
  assert.equal(report.completion_gate, "ineligible");
  assert.equal(report.allowed_view_opened, false);
  assert.equal(report.revocation_verified, true);
  assert.deepEqual(report.issue_codes, []);
  assert.equal(report.parent_p03_completion_derived, false);
});

test("postbuild capture is accepted only as a phase trace and never opens the prebuild safe-build gate", () => {
  const trace = validTrace();
  trace.capture_phase = "postbuild_five_view_direct_table_recheck";

  const report = validateP03EventTrace(trace);

  assert.equal(report.validation_status, "passed");
  assert.equal(report.capture_phase, "postbuild_five_view_direct_table_recheck");
  assert.equal(report.completion_gate, "not_applicable");
  assert.equal(report.parent_p03_completion_derived, false);
});

test("unknown capture phases and missing explicit boundary fields fail closed", async (t) => {
  await t.test("unknown_capture_phase", () => {
    const trace = validTrace();
    trace.capture_phase = "unknown_phase";
    const report = validateP03EventTrace(trace);

    assert.equal(report.validation_status, "failed");
    assert.deepEqual(report.issue_codes, ["document_shape"]);
  });

  await t.test("missing_boundary_field", () => {
    const trace = validTrace();
    delete trace.events[2].observations.other_records_visible;
    const report = validateP03EventTrace(trace);

    assert.equal(report.validation_status, "failed");
    assert.equal(issueSet(report).has("event_shape"), true);
  });
});

test("event order, duplicate event types, and missing steps fail closed", async (t) => {
  const fixtures = [
    ["out_of_order", (trace) => {
      [trace.events[2], trace.events[3]] = [trace.events[3], trace.events[2]];
    }, ["event_order"]],
    ["duplicate", (trace) => {
      trace.events[3] = structuredClone(trace.events[2]);
      trace.events[3].sequence = 4;
    }, ["duplicate_event", "event_order"]],
    ["missing", (trace) => {
      trace.events.splice(3, 1);
    }, ["event_count", "event_order"]],
  ];

  for (const [name, mutate, expectedIssues] of fixtures) {
    await t.test(name, () => {
      const trace = validTrace();
      mutate(trace);
      const report = validateP03EventTrace(trace);

      assert.equal(report.validation_status, "failed");
      assert.equal(report.completion_gate, "ineligible");
      for (const issue of expectedIssues) assert.equal(issueSet(report).has(issue), true);
      assert.equal(report.parent_p03_completion_derived, false);
    });
  }
});

test("owner preview or a non-independent session cannot substitute for a second identity", async (t) => {
  const fixtures = [
    ["owner_actor", (event) => { event.actor_class = "owner"; }],
    ["owner_preview", (event) => { event.session_class = "owner_preview"; }],
    ["desktop_session", (event) => { event.session_class = "independent_session"; }],
    ["same_identity", (event) => { event.observations.actor_distinct_from_owner_verified = false; }],
    ["owner_privilege", (event) => { event.observations.owner_privileges_absent = false; }],
    ["administrator_privilege", (event) => { event.observations.administrator_privileges_absent = false; }],
  ];

  for (const [name, mutate] of fixtures) {
    await t.test(name, () => {
      const trace = validTrace();
      mutate(trace.events[2]);
      const report = validateP03EventTrace(trace);

      assert.equal(report.validation_status, "failed");
      assert.equal(report.second_identity_verified, false);
      assert.equal(issueSet(report).has("second_identity_invalid"), true);
      if (["owner_actor", "owner_preview"].includes(name)) {
        assert.equal(issueSet(report).has("owner_preview_substitution"), true);
      }
    });
  }
});

test("event provenance is an exact closed contract and machine validation is not an input observation source", async (t) => {
  const fixtures = [
    ["evidence_id", (trace) => { trace.events[2].evidence_id = "P03-EV-99"; }],
    ["duplicate_evidence_id", (trace) => { trace.events[5].evidence_id = trace.events[2].evidence_id; }],
    ["owner_source", (trace) => { trace.events[0].source_class = "second_identity_mobile_user_attested"; }],
    ["second_identity_source", (trace) => { trace.events[2].source_class = "owner_visual_observation"; }],
    ["machine_source_in_event", (trace) => { trace.events[2].source_class = "machine_redacted_validator"; }],
    ["capture_time", (trace) => { trace.events[5].capture_time_class = "wall_clock_timestamp"; }],
  ];

  for (const [name, mutate] of fixtures) {
    await t.test(name, () => {
      const trace = validTrace();
      mutate(trace);
      const report = validateP03EventTrace(trace);

      assert.equal(report.validation_status, "failed");
      assert.equal(report.provenance_verified, false);
      assert.equal(issueSet(report).has("event_provenance_invalid"), true);
      assert.equal(report.parent_p03_completion_derived, false);
      assert.equal(report.onsite_fact_status_derived, false);
    });
  }
});

test("the report binds the exact input digest without echoing event provenance or claims", () => {
  const trace = validTrace();
  const text = JSON.stringify(trace, null, 2);
  const expectedDigest = `sha256:${createHash("sha256").update(text, "utf8").digest("hex")}`;
  const report = validateP03EventTraceText(text);
  const serialized = serializeP03EventTraceReport(report);

  assert.equal(report.input_digest, expectedDigest);
  assert.equal(serialized.includes(trace.events[0].evidence_id), false);
  assert.equal(serialized.includes(trace.events[0].capture_time_class), false);
  assert.equal(serialized.includes('"source_class"'), false);
  assert.equal(serialized.includes("business_state_unchanged"), false);

  const changed = structuredClone(trace);
  changed.events[0].observations.baseline_frozen = false;
  assert.notEqual(validateP03EventTraceText(JSON.stringify(changed, null, 2)).input_digest, expectedDigest);
});

test("buffer validation binds the digest to the exact accepted bytes", () => {
  const payload = Buffer.concat([
    Buffer.from([0xef, 0xbb, 0xbf]),
    Buffer.from(JSON.stringify(validTrace()), "utf8"),
  ]);
  const expectedDigest = `sha256:${createHash("sha256").update(payload).digest("hex")}`;

  const report = validateP03EventTraceBuffer(payload);

  assert.equal(report.validation_status, "passed");
  assert.equal(report.input_digest, expectedDigest);
});

test("v1 traces fail closed instead of bypassing the provenance contract", () => {
  const trace = validTrace();
  trace.schema_version = "p03_event_trace.v1";

  const report = validateP03EventTrace(trace);

  assert.equal(report.validation_status, "failed");
  assert.deepEqual(report.issue_codes, ["document_shape"]);
  assert.equal(report.provenance_verified, false);
});

test("any unauthorized business write makes the trace ineligible", async (t) => {
  for (const eventIndex of [2, 3, 5, 6]) {
    await t.test(`event_${eventIndex + 1}`, () => {
      const trace = validTrace();
      trace.events[eventIndex].observations.unauthorized_business_write_count = 1;
      const report = validateP03EventTrace(trace);

      assert.equal(report.completion_gate, "ineligible");
      assert.equal(issueSet(report).has("unauthorized_business_write"), true);
      assert.equal(report.unauthorized_business_write_count, 1);
    });
  }
});

test("all five second-identity visibility boundaries must remain closed", async (t) => {
  const fixtures = [
    ["other_views_before_revoke", 2, "other_views_visible", "other_views_exposure"],
    ["other_views_after_revoke", 5, "other_views_visible", "other_views_exposure"],
    ["other_records_before_revoke", 2, "other_records_visible", "other_records_exposure"],
    ["other_records_after_revoke", 5, "other_records_visible", "other_records_exposure"],
    ["direct_table_before_revoke", 2, "direct_table_access_allowed", "direct_table_access_exposure"],
    ["direct_table_after_revoke", 5, "direct_table_access_allowed", "direct_table_access_exposure"],
    ["raw_before_revoke", 2, "raw_json_visible", "raw_json_exposure"],
    ["raw_after_revoke", 5, "raw_json_visible", "raw_json_exposure"],
    ["management_before_revoke", 2, "management_config_visible", "management_configuration_exposure"],
    ["management_after_revoke", 5, "management_config_visible", "management_configuration_exposure"],
  ];

  for (const [name, eventIndex, key, expectedIssue] of fixtures) {
    await t.test(name, () => {
      const trace = validTrace();
      trace.events[eventIndex].observations[key] = true;
      const report = validateP03EventTrace(trace);

      assert.equal(report.completion_gate, "ineligible");
      assert.equal(issueSet(report).has(expectedIssue), true);
    });
  }
});

test("refresh, relogin, revocation, and post-revoke denial are mandatory", async (t) => {
  const fixtures = [
    ["post_revoke_owner_preview", (trace) => {
      trace.events[5].actor_class = "owner";
      trace.events[5].session_class = "owner_preview";
    }, "owner_preview_substitution"],
    ["same_second_identity", (trace) => { trace.events[5].observations.same_second_identity_as_pre_revoke_attested = false; }, "post_revoke_identity_invalid"],
    ["refresh", (trace) => { trace.events[5].observations.refresh_completed = false; }, "refresh_relogin_missing"],
    ["relogin", (trace) => { trace.events[5].observations.relogin_completed = false; }, "refresh_relogin_missing"],
    ["access_revoke", (trace) => { trace.events[4].observations.temporary_access_revoked = false; }, "revocation_failed"],
    ["mapping_revoke", (trace) => { trace.events[4].observations.permission_mapping_removed = false; }, "revocation_failed"],
    ["denial", (trace) => { trace.events[5].observations.access_denied = false; }, "post_revoke_access_not_denied"],
  ];

  for (const [name, mutate, expectedIssue] of fixtures) {
    await t.test(name, () => {
      const trace = validTrace();
      mutate(trace);
      const report = validateP03EventTrace(trace);

      assert.equal(report.completion_gate, "ineligible");
      assert.equal(issueSet(report).has(expectedIssue), true);
    });
  }
});

test("owner baseline, first permission action, protected mutation, and owner equivalence are hard gates", async (t) => {
  const fixtures = [
    ["baseline", (trace) => { trace.events[0].observations.baseline_frozen = false; }, "owner_baseline_invalid"],
    ["permission", (trace) => { trace.events[1].observations.formal_resource_shared = true; }, "first_permission_action_invalid"],
    ["mutation", (trace) => { trace.events[2].observations.protected_mutation_rejected = false; }, "protected_mutation_boundary_failed"],
    ["equivalence", (trace) => { trace.events[3].observations.business_state_unchanged = false; }, "owner_equivalence_failed"],
    ["audit", (trace) => { trace.events[3].observations.audit_or_version_evidence_checked = false; }, "owner_equivalence_failed"],
    ["final_equivalence", (trace) => { trace.events[6].observations.business_state_unchanged = false; }, "final_owner_equivalence_failed"],
    ["final_revocation", (trace) => { trace.events[6].observations.temporary_access_remains_revoked = false; }, "final_owner_equivalence_failed"],
  ];

  for (const [name, mutate, expectedIssue] of fixtures) {
    await t.test(name, () => {
      const trace = validTrace();
      mutate(trace);
      const report = validateP03EventTrace(trace);

      assert.equal(report.completion_gate, "ineligible");
      assert.equal(issueSet(report).has(expectedIssue), true);
    });
  }
});

test("protected mutation is conditional on the allowed view actually opening", async (t) => {
  const fixtures = [
    ["opened_but_not_attempted", (observations) => { observations.protected_mutation_attempted = false; }, "protected_mutation_boundary_failed"],
    ["denied_but_attempted", (observations) => {
      observations.allowed_view_opened = false;
      observations.protected_mutation_attempted = true;
      observations.protected_mutation_rejected = true;
    }, "mutation_after_view_denied"],
    ["denied_without_attempt_but_false_rejection_claim_missing", (observations) => {
      observations.allowed_view_opened = false;
      observations.protected_mutation_attempted = false;
      observations.protected_mutation_rejected = true;
    }, "mutation_after_view_denied"],
  ];

  for (const [name, mutate, expectedIssue] of fixtures) {
    await t.test(name, () => {
      const trace = validTrace();
      mutate(trace.events[2].observations);
      const report = validateP03EventTrace(trace);

      assert.equal(report.validation_status, "failed");
      assert.equal(issueSet(report).has(expectedIssue), true);
      assert.equal(report.completion_gate, "ineligible");
    });
  }
});

test("a pre-revoke hard-boundary leak always stops protected mutation", async (t) => {
  await t.test("leak_with_mutation_attempt", () => {
    const trace = validTrace();
    trace.events[2].observations.raw_json_visible = true;
    const report = validateP03EventTrace(trace);

    assert.equal(report.validation_status, "failed");
    assert.equal(issueSet(report).has("raw_json_exposure"), true);
    assert.equal(issueSet(report).has("mutation_after_boundary_leak"), true);
    assert.equal(report.completion_gate, "ineligible");
  });

  const stoppedFixtures = [
    ["other_views", "other_views_visible", "other_views_exposure"],
    ["other_records", "other_records_visible", "other_records_exposure"],
    ["direct_table", "direct_table_access_allowed", "direct_table_access_exposure"],
    ["raw_json", "raw_json_visible", "raw_json_exposure"],
    ["management", "management_config_visible", "management_configuration_exposure"],
  ];
  for (const [name, key, exposureIssue] of stoppedFixtures) {
    await t.test(`leak_without_mutation_${name}`, () => {
      const trace = validTrace();
      trace.events[2].observations[key] = true;
      trace.events[2].observations.protected_mutation_attempted = false;
      trace.events[2].observations.protected_mutation_rejected = false;
      const report = validateP03EventTrace(trace);

      assert.equal(report.validation_status, "failed");
      assert.equal(issueSet(report).has(exposureIssue), true);
      assert.equal(issueSet(report).has("mutation_after_boundary_leak"), false);
      assert.equal(issueSet(report).has("protected_mutation_boundary_failed"), false);
      assert.equal(report.revocation_verified, true);
      assert.equal(report.refresh_relogin_verified, true);
    });
  }

  await t.test("leak_with_false_attempt_but_rejection_claim", () => {
    const trace = validTrace();
    trace.events[2].observations.raw_json_visible = true;
    trace.events[2].observations.protected_mutation_attempted = false;
    trace.events[2].observations.protected_mutation_rejected = true;
    const report = validateP03EventTrace(trace);

    assert.equal(issueSet(report).has("mutation_after_boundary_leak"), true);
  });
});

test("sensitive input patterns are rejected without being echoed", async (t) => {
  const fixtures = [
    ["url", "source_url", "https://example.invalid/private"],
    ["account", "account", "person@example.invalid"],
    ["credential", "credential", "access_token=SYN-SENSITIVE-VALUE"],
    ["resource", "locator", "tblSYNTHETIC123"],
  ];

  for (const [name, key, sentinel] of fixtures) {
    await t.test(name, () => {
      const trace = validTrace();
      trace.events[2][key] = sentinel;
      const report = validateP03EventTrace(trace);
      const serialized = serializeP03EventTraceReport(report);

      assert.equal(report.validation_status, "failed");
      assert.equal(issueSet(report).has("sensitive_input"), true);
      assert.equal(serialized.includes(sentinel), false);
      assert.equal(serialized.includes(key), false);
    });
  }
});

test("duplicate JSON keys, malformed JSON, oversized input, and non-UTF-8 input fail closed", async (t) => {
  const validText = JSON.stringify(validTrace());
  const fixtures = [
    ["duplicate_root_key", () => validateP03EventTraceText(`{"schema_version":"p03_event_trace.v2","schema_version":"p03_event_trace.v2","fact_class":"synthetic_experiment","capture_phase":"prebuild_gate","events":[]}`), "duplicate_json_key"],
    ["duplicate_nested_key", () => validateP03EventTraceText(validText.replace('"sequence":1', '"sequence":1,"sequence":1')), "duplicate_json_key"],
    ["malformed", () => validateP03EventTraceText("{"), "invalid_json"],
    ["oversized", () => validateP03EventTraceBuffer(Buffer.alloc(P03_EVENT_TRACE_MAX_BYTES + 1, 0x20)), "input_transport"],
    ["non_utf8", () => validateP03EventTraceBuffer(Buffer.from([0xc3, 0x28])), "input_transport"],
  ];

  for (const [name, validate, expectedIssue] of fixtures) {
    await t.test(name, () => {
      const report = validate();
      assert.equal(report.validation_status, "failed");
      assert.deepEqual(report.issue_codes, [expectedIssue]);
    });
  }
});

test("issue codes are unique and follow the fixed closed-set order", () => {
  const trace = validTrace();
  trace.events[2].actor_class = "owner";
  trace.events[2].observations.unauthorized_business_write_count = 1;
  trace.events[2].observations.raw_json_visible = true;
  trace.events[5].observations.refresh_completed = false;
  const report = validateP03EventTrace(trace);

  assert.deepEqual(report.issue_codes, [
    "second_identity_invalid",
    "owner_preview_substitution",
    "mutation_after_boundary_leak",
    "unauthorized_business_write",
    "raw_json_exposure",
    "refresh_relogin_missing",
  ]);
  assert.equal(new Set(report.issue_codes).size, report.issue_codes.length);
});

test("serializer replaces an untrusted report with a fixed redacted failure", () => {
  const sentinel = "SYN-SENSITIVE-REPORT-VALUE";
  const serialized = serializeP03EventTraceReport({
    validation_status: "passed",
    completion_gate: "eligible",
    locator: sentinel,
  });
  const report = JSON.parse(serialized);

  assert.deepEqual(Object.keys(report), reportKeys);
  assert.equal(report.validation_status, "failed");
  assert.equal(report.completion_gate, "ineligible");
  assert.deepEqual(report.issue_codes, ["report_shape"]);
  assert.equal(serialized.includes(sentinel), false);
});

test("CLI rejects a symlinked fixture without reading or echoing its target", () => {
  const directory = mkdtempSync(join(tmpdir(), "neoloop-p03-trace-"));
  const target = join(directory, "target.redacted.json");
  const link = join(directory, "trace.redacted.json");
  const script = resolve(import.meta.dirname, "../../feishu/scripts/validate-live-p03-event-trace.mjs");

  try {
    writeFileSync(target, JSON.stringify(validTrace()), "utf8");
    symlinkSync(target, link);
    const result = spawnSync(process.execPath, [script, link], { encoding: "utf8" });
    const report = JSON.parse(result.stdout);

    assert.equal(result.status, 1);
    assert.equal(result.stderr, "");
    assert.equal(report.validation_status, "failed");
    assert.deepEqual(report.issue_codes, ["input_transport"]);
    assert.equal(result.stdout.includes(target), false);
    assert.equal(result.stdout.includes(link), false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("CLI exit codes distinguish safe-build eligibility from a valid unavailable trace", async (t) => {
  const directory = mkdtempSync(join(tmpdir(), "neoloop-p03-trace-cli-"));
  const script = resolve(import.meta.dirname, "../../feishu/scripts/validate-live-p03-event-trace.mjs");

  try {
    await t.test("eligible", () => {
      const path = join(directory, "eligible.redacted.json");
      writeFileSync(path, JSON.stringify(validTrace()), "utf8");
      const result = spawnSync(process.execPath, [script, path], { encoding: "utf8" });
      const report = JSON.parse(result.stdout);

      assert.equal(result.status, 0);
      assert.equal(report.validation_status, "passed");
      assert.equal(report.completion_gate, "eligible");
    });

    await t.test("valid_but_unavailable", () => {
      const trace = validTrace();
      trace.events[2].observations.allowed_view_opened = false;
      trace.events[2].observations.protected_mutation_attempted = false;
      trace.events[2].observations.protected_mutation_rejected = false;
      const path = join(directory, "unavailable.redacted.json");
      writeFileSync(path, JSON.stringify(trace), "utf8");
      const result = spawnSync(process.execPath, [script, path], { encoding: "utf8" });
      const report = JSON.parse(result.stdout);

      assert.equal(result.status, 2);
      assert.equal(report.validation_status, "passed");
      assert.equal(report.capability_result, "unavailable");
      assert.equal(report.completion_gate, "ineligible");
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
