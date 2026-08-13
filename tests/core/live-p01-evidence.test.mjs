import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

import {
  LIVE_P01_EVIDENCE_MAX_BYTES,
  serializeLiveP01EvidenceReport,
  validateLiveP01EvidenceBuffers,
  validateLiveP01EvidenceDocuments,
  validateLiveP01EvidenceFiles,
  validateLiveP01EvidenceTexts,
} from "../../feishu/scripts/validate-live-p01-evidence.mjs";

const resultLivePath = resolve(
  import.meta.dirname,
  "../../feishu/evidence/live/2026-08-07-day-1-probe-results.redacted.json",
);
const onsiteLivePath = resolve(
  import.meta.dirname,
  "../../feishu/evidence/live/2026-08-07-on-site-evidence.redacted.json",
);
const scriptPath = resolve(
  import.meta.dirname,
  "../../feishu/scripts/validate-live-p01-evidence.mjs",
);

const reportKeys = [
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
];

const failureBooleanKeys = [
  "p01_state_verified",
  "p01_result_null_verified",
  "p01_attempt_verified",
  "p01_evidence_identity_verified",
  "p01_evidence_binding_verified",
  "historical_user_attestation_bound",
  "current_browser_metadata_bound",
  "reference_strings_bound",
  "reference_resolution_verified",
  "current_session_logged_out_verified",
  "refresh_completion_verified",
  "body_readability_after_refresh_verified",
  "edit_entry_absence_verified",
  "fallback_verified",
  "p01_completion_verified",
  "anonymous_document_access_derived",
  "observation_truth_machine_verified",
  "redaction_verified",
];

function liveBuffers() {
  return {
    result: readFileSync(resultLivePath),
    onsite: readFileSync(onsiteLivePath),
  };
}

function liveDocuments() {
  const buffers = liveBuffers();
  return {
    result: JSON.parse(buffers.result.toString("utf8")),
    onsite: JSON.parse(buffers.onsite.toString("utf8")),
  };
}

function p01Result(documents) {
  return documents.result.permission_probes.find((record) => record.unit_id === "P01");
}

function p01Onsite(documents) {
  return documents.onsite.permission_checks.find((record) => record.key === "P01");
}

function validateMutation(mutate) {
  const documents = liveDocuments();
  mutate(documents);
  return validateLiveP01EvidenceDocuments(documents.result, documents.onsite);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]),
    );
  }
  return value;
}

function canonicalSha256(value) {
  return sha256(Buffer.from(JSON.stringify(canonicalize(value)), "utf8"));
}

function assertFailedWith(report, issueCode) {
  assert.deepEqual(Object.keys(report), reportKeys);
  assert.equal(report.validation_status, "failed");
  for (const key of failureBooleanKeys) assert.equal(report[key], false, key);
  assert.equal(report.p01_result_snapshot_sha256, null);
  assert.equal(report.p01_onsite_snapshot_sha256, null);
  assert.equal(report.p01_evidence_entry_count, null);
  assert.equal(report.screenshot_evidence_count, null);
  assert.equal(report.run_evidence_count, null);
  assert.equal(report.business_write_count, null);
  assert.equal(report.issue_codes.includes(issueCode), true, issueCode);
  assert.equal(new Set(report.issue_codes).size, report.issue_codes.length);
}

function assertNoSentinel(report, sentinel) {
  assert.equal(JSON.stringify(report).includes(sentinel), false);
}

function validateFilesAfterAStableChain(resultPath, onsitePath, trustedRoot) {
  const waitState = new Int32Array(new SharedArrayBuffer(4));
  let report;
  for (let attempt = 0; attempt < 250; attempt += 1) {
    report = validateLiveP01EvidenceFiles(resultPath, onsitePath, trustedRoot);
    if (report.validation_status === "passed") return report;
    Atomics.wait(waitState, 0, 0, 2);
  }
  return report;
}

test("the fixed live snapshots validate only the honest blocked P01 evidence state", () => {
  const buffers = liveBuffers();
  const report = validateLiveP01EvidenceBuffers(buffers.result, buffers.onsite);
  const serialized = serializeLiveP01EvidenceReport(report);

  assert.deepEqual(Object.keys(report), reportKeys);
  assert.deepEqual(Object.keys(JSON.parse(serialized)), reportKeys);
  assert.equal(report.schema_version, "live_p01_evidence_report.v1");
  assert.equal(report.scope, "P01_redacted_live_evidence_only");
  assert.equal(report.fact_class, "synthetic_experiment");
  assert.equal(report.result_input_sha256, sha256(buffers.result));
  assert.equal(report.onsite_input_sha256, sha256(buffers.onsite));
  assert.equal(report.p01_result_snapshot_sha256, "4a85ff72b26042771919ea58096730be27573f8f381cb50145075cfd296b8a6b");
  assert.equal(report.p01_onsite_snapshot_sha256, "dbb4ff1254f3471c22b921e836f24fe54c5ceecc2daf7edb42841acfab7389ad");
  assert.equal(report.validation_status, "passed");
  assert.equal(report.p01_state_verified, true);
  assert.equal(report.p01_result_null_verified, true);
  assert.equal(report.p01_attempt_verified, true);
  assert.equal(report.p01_evidence_identity_verified, true);
  assert.equal(report.p01_evidence_binding_verified, true);
  assert.equal(report.p01_evidence_entry_count, 1);
  assert.equal(report.historical_user_attestation_bound, true);
  assert.equal(report.current_browser_metadata_bound, true);
  assert.equal(report.reference_strings_bound, true);
  assert.equal(report.reference_resolution_verified, false);
  assert.equal(report.current_session_logged_out_verified, false);
  assert.equal(report.refresh_completion_verified, false);
  assert.equal(report.body_readability_after_refresh_verified, false);
  assert.equal(report.edit_entry_absence_verified, false);
  assert.equal(report.screenshot_evidence_count, 0);
  assert.equal(report.run_evidence_count, 0);
  assert.equal(report.fallback_verified, false);
  assert.equal(report.p01_completion_verified, false);
  assert.equal(report.anonymous_document_access_derived, false);
  assert.equal(report.observation_truth_machine_verified, false);
  assert.equal(report.business_write_count, null);
  assert.equal(report.redaction_verified, true);
  assert.deepEqual(report.issue_codes, []);
  for (const sentinel of ["T2-EV-P01", "controlled-slot", "user_attested", "browser_operator"]) {
    assertNoSentinel(report, sentinel);
  }
});

test("document inputs use canonical digests while preserving the same fixed P01 snapshots", () => {
  const documents = liveDocuments();
  const report = validateLiveP01EvidenceDocuments(documents.result, documents.onsite);
  assert.equal(report.validation_status, "passed");
  assert.equal(report.result_input_sha256, canonicalSha256(documents.result));
  assert.equal(report.onsite_input_sha256, canonicalSha256(documents.onsite));
  assert.equal(report.p01_result_snapshot_sha256, canonicalSha256(p01Result(documents)));
  assert.equal(report.p01_onsite_snapshot_sha256, canonicalSha256(p01Onsite(documents)));
});

test("document inputs fail closed for null and non-object roots instead of throwing", async (t) => {
  const documents = liveDocuments();
  const invalidRoots = [null, [], "not-an-object", 17, false];
  for (const [index, invalidRoot] of invalidRoots.entries()) {
    await t.test(`result_root_${index}`, () => {
      assertFailedWith(
        validateLiveP01EvidenceDocuments(invalidRoot, documents.onsite),
        "document_shape",
      );
    });
    await t.test(`onsite_root_${index}`, () => {
      assertFailedWith(
        validateLiveP01EvidenceDocuments(documents.result, invalidRoot),
        "document_shape",
      );
    });
  }
});

test("P01 multiplicity, states, exact record keys, and root shapes fail closed", async (t) => {
  const fixtures = [
    ["missing_result", "p01_record_shape", (d) => { d.result.permission_probes = d.result.permission_probes.filter((r) => r.unit_id !== "P01"); }],
    ["duplicate_result", "p01_record_shape", (d) => { d.result.permission_probes.push(structuredClone(p01Result(d))); }],
    ["missing_onsite", "onsite_record_shape", (d) => { d.onsite.permission_checks = d.onsite.permission_checks.filter((r) => r.key !== "P01"); }],
    ["duplicate_onsite", "onsite_record_shape", (d) => { d.onsite.permission_checks.push(structuredClone(p01Onsite(d))); }],
    ["not_tested", "p01_state", (d) => { p01Result(d).execution_status = "not_tested"; }],
    ["completed", "p01_state", (d) => { p01Result(d).execution_status = "completed"; }],
    ["result_non_null", "p01_state", (d) => { p01Result(d).result = "available"; }],
    ["onsite_status", "p01_state", (d) => { p01Onsite(d).status = "已完成"; }],
    ["result_missing_key", "p01_record_shape", (d) => { delete p01Result(d).verifier; }],
    ["result_extra_key", "p01_record_shape", (d) => { p01Result(d).extra = true; }],
    ["onsite_missing_key", "onsite_record_shape", (d) => { delete p01Onsite(d).verifier; }],
    ["onsite_extra_key", "onsite_record_shape", (d) => { p01Onsite(d).extra = true; }],
    ["result_root_extra", "document_shape", (d) => { d.result.extra = true; }],
    ["onsite_root_missing", "document_shape", (d) => { delete d.onsite.team; }],
  ];
  for (const [name, issue, mutate] of fixtures) {
    await t.test(name, () => assertFailedWith(validateMutation(mutate), issue));
  }
});

test("the P01 live envelope binds root truth without freezing unrelated records", async (t) => {
  const staticTruthDrifts = [
    ["result_project", (d) => { d.result.project = "drift"; }],
    ["onsite_project", (d) => { d.onsite.project = "drift"; }],
    ["onsite_team", (d) => { d.onsite.team = "drift"; }],
    ["result_fact_class_only", (d) => { d.result.fact_class = "solution_design"; }],
    ["onsite_fact_class_only", (d) => { d.onsite.fact_class = "solution_design"; }],
    ["both_fact_classes", (d) => {
      d.result.fact_class = "solution_design";
      d.onsite.fact_class = "solution_design";
    }],
  ];
  for (const [name, mutate] of staticTruthDrifts) {
    await t.test(name, () => assertFailedWith(validateMutation(mutate), "document_shape"));
  }

  const resultStateDrifts = [
    ["deployment_completed", (d) => { d.result.deployment_status = "completed"; }],
    ["execution_completed", (d) => { d.result.execution_status = "completed"; }],
    ["result_completed", (d) => { d.result.result = "可用"; }],
  ];
  for (const [name, mutate] of resultStateDrifts) {
    await t.test(name, () => assertFailedWith(validateMutation(mutate), "p01_state"));
  }

  for (const [name, sentinel] of [
    ["onsite_instruction_completed", "P01 completed"],
    ["onsite_instruction_machine_verified", "machine_verified=PRIVATE-ROOT-CLAIM"],
    ["result_root_completion_claim", "P01 已完成"],
  ]) {
    await t.test(name, () => {
      const report = validateMutation((d) => {
        if (name.startsWith("onsite")) d.onsite.instructions += ` ${sentinel}`;
        else d.result.project = sentinel;
      });
      assertFailedWith(report, "completion_claim");
      assertNoSentinel(report, sentinel);
    });
  }
});

test("all three evidence surfaces remain exact, identical, ordered, and fixed to one identity", async (t) => {
  const fixtures = [
    ["missing", "p01_evidence_binding", (d) => { p01Result(d).evidence.indexes = []; }],
    ["extra", "p01_evidence_binding", (d) => { p01Result(d).evidence_index.indexes.push(structuredClone(p01Result(d).evidence_index.indexes[0])); }],
    ["not_equal", "p01_evidence_binding", (d) => { p01Onsite(d).structured_evidence_index.indexes[0].redaction_checked = false; }],
    ["id", "p01_evidence_identity", (d) => { p01Result(d).evidence.indexes[0].evidence_id += "-drift"; }],
    ["time", "p01_evidence_identity", (d) => { p01Result(d).evidence_index.indexes[0].observed_at = "2026-08-08T00:00:00+08:00"; }],
    ["actor", "p01_evidence_identity", (d) => { p01Onsite(d).structured_evidence_index.indexes[0].actor_role = "machine_verified"; }],
    ["slot", "p01_evidence_identity", (d) => { p01Result(d).evidence.indexes[0].redacted_storage_slot = "other-slot"; }],
    ["capture_order", "p01_evidence_identity", (d) => { p01Result(d).evidence_index.indexes[0].capture_phases.reverse(); }],
    ["capture_extra", "p01_evidence_identity", (d) => { p01Result(d).evidence.indexes[0].capture_phases.push("machine_verified"); }],
    ["entry_extra", "p01_evidence_identity", (d) => { p01Result(d).evidence.indexes[0].extra = true; }],
    ["r10_subchecks", "p01_evidence_identity", (d) => { p01Onsite(d).structured_evidence_index.r10_subchecks = {}; }],
  ];
  for (const [name, issue, mutate] of fixtures) {
    await t.test(name, () => assertFailedWith(validateMutation(mutate), issue));
  }
});

test("cross-document mappings, cleanup semantics, and four reference strings are frozen", async (t) => {
  const alignment = [
    ["action", (d) => { p01Onsite(d).actual_action += " drift"; }],
    ["result", (d) => { p01Onsite(d).actual_result += " drift"; }],
    ["time", (d) => { p01Onsite(d).actual_time = "2026-08-08T00:00:00+08:00"; }],
    ["executor", (d) => { p01Onsite(d).executor = "drift"; }],
    ["role", (d) => { p01Onsite(d).platform_account_role = "drift"; }],
    ["limitations", (d) => { p01Onsite(d).limitations += " drift"; }],
    ["verifier", (d) => { p01Onsite(d).verifier = "drift"; }],
    ["fallback_status", (d) => { p01Onsite(d).fallback_verification_status = "已验证"; }],
    ["fallback_result", (d) => { p01Onsite(d).fallback_actual_result = "available"; }],
  ];
  for (const [name, mutate] of alignment) {
    await t.test(`alignment_${name}`, () => assertFailedWith(
      validateMutation(mutate),
      "p01_onsite_alignment",
    ));
  }

  await t.test("cleanup_is_results_only_and_frozen", () => {
    const report = validateMutation((d) => {
      p01Result(d).cleanup_result = p01Result(d).cleanup_result.replace("无需飞书资源清理", "清理完成");
    });
    assertFailedWith(report, "p01_latest_fact");
  });

  for (const field of ["probe_ref", "evidence_unit_ref", "expected_result_ref", "fallback_path"]) {
    await t.test(`reference_${field}`, () => {
      const report = validateMutation((d) => { p01Result(d)[field] += "#drift"; });
      assertFailedWith(report, "p01_reference_binding");
      assert.equal(report.reference_resolution_verified, false);
    });
  }
});

test("synchronized semantic drift and every completion extrapolation fail closed", async (t) => {
  const synchronized = [
    ["attestation_to_machine", (d) => {
      p01Result(d).actual_result = p01Result(d).actual_result.replace("user_attested", "machine_verified");
      p01Onsite(d).actual_result = p01Result(d).actual_result;
    }],
    ["current_session_logged_out", (d) => {
      p01Result(d).account_role = "current_session_logged_out_verified";
      p01Onsite(d).platform_account_role = p01Result(d).account_role;
    }],
    ["refresh_verified", (d) => {
      p01Result(d).actual_result = p01Result(d).actual_result.replace("refresh_completion=unverified", "refresh_completion=verified");
      p01Onsite(d).actual_result = p01Result(d).actual_result;
    }],
    ["body_verified", (d) => {
      p01Result(d).actual_result = p01Result(d).actual_result.replace("body_readability_after_refresh=unverified", "body_readability_after_refresh=verified");
      p01Onsite(d).actual_result = p01Result(d).actual_result;
    }],
    ["edit_verified", (d) => {
      p01Result(d).actual_result = p01Result(d).actual_result.replace("edit_entry_absence=unverified", "edit_entry_absence=verified");
      p01Onsite(d).actual_result = p01Result(d).actual_result;
    }],
  ];
  for (const [name, mutate] of synchronized) {
    await t.test(name, () => {
      const report = validateMutation(mutate);
      assertFailedWith(report, "p01_snapshot_drift");
      assertFailedWith(report, "completion_claim");
    });
  }

  const completionClaims = [
    "P01 completed",
    "capability available",
    "capability restricted",
    "capability unavailable",
    "anonymous_document_access_derived=true",
    "business_write_count=0",
    "匿名访问已机器验证",
    "飞书作品文档已公开发布",
    "已接入新石器真实数据",
  ];
  for (const sentinel of completionClaims) {
    await t.test(`claim_${sentinel}`, () => {
      const report = validateMutation((d) => {
        p01Result(d).limitations += ` ${sentinel}`;
        p01Onsite(d).limitations = p01Result(d).limitations;
      });
      assertFailedWith(report, "completion_claim");
      assertNoSentinel(report, sentinel);
    });
  }
});

test("screenshots, run indexes, fallback, and machine observation claims stay false or empty", async (t) => {
  const fixtures = [
    ["screenshot", (d) => { p01Onsite(d).screenshot_indexes.push("PRIVATE-SCREENSHOT"); }],
    ["run", (d) => { p01Onsite(d).run_indexes.push("PRIVATE-RUN"); }],
    ["fallback_result", (d) => { p01Result(d).fallback_verified = true; }],
    ["fallback_onsite", (d) => { p01Onsite(d).fallback_verification_status = "已验证"; }],
  ];
  for (const [name, mutate] of fixtures) {
    await t.test(name, () => {
      const report = validateMutation(mutate);
      assertFailedWith(report, "completion_claim");
      assert.equal(report.screenshot_evidence_count, null);
      assert.equal(report.run_evidence_count, null);
    });
  }
});

test("credential keys and sensitive string forms fail closed without report leakage", async (t) => {
  const valueSentinels = [
    "https://sensitive.invalid/path",
    "user@example.invalid",
    "token=PRIVATE-TOKEN",
    "app_id=PRIVATE-APP-ID",
    "base_id=PRIVATE-BASE-ID",
    "table_id=PRIVATE-TABLE-ID",
    "view_id=PRIVATE-VIEW-ID",
    "record_id=PRIVATE-RECORD-ID",
    "locator=PRIVATE-LOCATOR",
    "locator(\"private-locator\")",
    "provider raw error PRIVATE-PROVIDER",
    "provider raw error private-provider",
    "qr_code=PRIVATE-QR",
    "feishu://docx/private-document",
    "doxcnprivate12345678",
    "13800138000",
    "cli_SYNTHETIC123456",
    "bascnSYNTHETIC123",
    "tblSYNTHETIC123",
    "viewSYNTHETIC123",
    "recSYNTHETIC123",
    "fldSYNTHETIC123",
    "/Users/private/secret.json",
  ];
  for (const sentinel of valueSentinels) {
    await t.test("sensitive_value", () => {
      const report = validateMutation((d) => { p01Result(d).limitations += ` ${sentinel}`; });
      assertFailedWith(report, "sensitive_value");
      assertNoSentinel(report, sentinel);
    });
  }

  await t.test("full_document_scan_is_not_limited_to_the_P01_subtree", () => {
    const report = validateMutation((d) => { d.result.project = "token=PRIVATE-ROOT-TOKEN"; });
    assertFailedWith(report, "sensitive_value");
    assertNoSentinel(report, "PRIVATE-ROOT-TOKEN");
  });

  for (const key of ["access_token", "refresh_token", "app_secret", "device_code", "cookie"]) {
    await t.test(`credential_key_${key}`, () => {
      const report = validateMutation((d) => { p01Result(d)[key] = "PRIVATE-CREDENTIAL"; });
      assertFailedWith(report, "sensitive_value");
      assertNoSentinel(report, "PRIVATE-CREDENTIAL");
    });
  }
});

test("known live resource slots stay explicitly null even for opaque values", async (t) => {
  const slots = [
    "base_app_token",
    "anonymous_document_token",
    "self_built_app_id",
    "openapi_credential_ref",
    "unprivileged_account_ref",
    "lark_cli_profile",
  ];
  for (const slot of slots) {
    await t.test(slot, () => {
      const sentinel = `opaque-private-${slot}`;
      const report = validateMutation((d) => { d.result.resource_slots[slot] = sentinel; });
      assertFailedWith(report, "sensitive_value");
      assertNoSentinel(report, sentinel);
    });
  }
  await t.test("missing_explicit_slot", () => {
    const report = validateMutation((d) => { delete d.result.resource_slots.base_app_token; });
    assertFailedWith(report, "sensitive_value");
  });
});

test("descriptor, type, escaped-duplicate, and issue-order boundaries fail closed", async (t) => {
  await t.test("result_type_drift", () => {
    const report = validateMutation((d) => { p01Result(d).actual_action = []; });
    assertFailedWith(report, "p01_record_shape");
  });
  await t.test("onsite_type_drift", () => {
    const report = validateMutation((d) => { p01Onsite(d).screenshot_indexes = "none"; });
    assertFailedWith(report, "onsite_record_shape");
  });
  await t.test("accessor_is_rejected_without_execution", () => {
    const documents = liveDocuments();
    let getterCalls = 0;
    Object.defineProperty(documents.result, "project", {
      get() { getterCalls += 1; return "should-not-run"; },
      enumerable: true,
      configurable: true,
    });
    assertFailedWith(
      validateLiveP01EvidenceDocuments(documents.result, documents.onsite),
      "invalid_json",
    );
    assert.equal(getterCalls, 0);
  });
  await t.test("proxy_is_rejected_without_traps", () => {
    const documents = liveDocuments();
    let trapCalls = 0;
    const proxy = new Proxy(documents.result, {
      ownKeys(target) { trapCalls += 1; return Reflect.ownKeys(target); },
    });
    assertFailedWith(validateLiveP01EvidenceDocuments(proxy, documents.onsite), "invalid_json");
    assert.equal(trapCalls, 0);
  });
  await t.test("escaped_duplicate_key", () => {
    const buffers = liveBuffers();
    const duplicate = buffers.result.toString("utf8").replace(
      /^\{/u,
      '{"\\u0074emplate_version":"duplicate",',
    );
    assertFailedWith(
      validateLiveP01EvidenceTexts(duplicate, buffers.onsite.toString("utf8")),
      "duplicate_json_key",
    );
  });
  await t.test("issue_codes_follow_the_closed_order", () => {
    const report = validateMutation((d) => {
      p01Result(d).execution_status = "completed";
      p01Result(d).probe_ref = "drift";
      p01Result(d).limitations += " token=PRIVATE-MULTI";
    });
    assert.deepEqual(report.issue_codes, [
      "p01_state",
      "p01_onsite_alignment",
      "p01_snapshot_drift",
      "p01_reference_binding",
      "sensitive_value",
    ]);
  });
});

test("text and buffer transports reject duplicate keys, malformed JSON, non-finite numbers, invalid UTF-8, and oversize input", () => {
  const buffers = liveBuffers();
  const resultText = buffers.result.toString("utf8");
  const onsiteText = buffers.onsite.toString("utf8");
  const duplicate = resultText.replace(/^\{/u, '{"template_version":"duplicate",');

  assertFailedWith(validateLiveP01EvidenceTexts(duplicate, onsiteText), "duplicate_json_key");
  assertFailedWith(validateLiveP01EvidenceTexts("{", onsiteText), "invalid_json");
  assertFailedWith(validateLiveP01EvidenceTexts(`${resultText} trailing`, onsiteText), "invalid_json");
  assertFailedWith(validateLiveP01EvidenceTexts('{"value":1e999}', onsiteText), "invalid_json");
  assertFailedWith(validateMutation((d) => { d.result.evidence = Number.NaN; }), "invalid_json");
  assertFailedWith(validateLiveP01EvidenceBuffers(Buffer.from([0xff]), buffers.onsite), "input_transport");
  assertFailedWith(
    validateLiveP01EvidenceBuffers(
      Buffer.alloc(LIVE_P01_EVIDENCE_MAX_BYTES + 1, 0x20),
      buffers.onsite,
    ),
    "input_transport",
  );
});

test("buffer digests bind the exact raw bytes when valid JSON has a UTF-8 BOM", () => {
  const buffers = liveBuffers();
  const bom = Buffer.from([0xef, 0xbb, 0xbf]);
  const resultWithBom = Buffer.concat([bom, buffers.result]);
  const onsiteWithBom = Buffer.concat([bom, buffers.onsite]);
  const report = validateLiveP01EvidenceBuffers(resultWithBom, onsiteWithBom);

  assert.equal(report.validation_status, "passed");
  assert.equal(report.result_input_sha256, sha256(resultWithBom));
  assert.equal(report.onsite_input_sha256, sha256(onsiteWithBom));
});

test("secure files accept an ordinary trusted root and reject final or parent symlinks", () => {
  const temporaryDirectory = realpathSync(mkdtempSync(join(import.meta.dirname, ".p01-evidence-")));
  try {
    const buffers = liveBuffers();
    const realDirectory = join(temporaryDirectory, "real");
    const linkedDirectory = join(temporaryDirectory, "linked");
    mkdirSync(realDirectory, { mode: 0o700 });
    const resultPath = join(realDirectory, "result.redacted.json");
    const onsitePath = join(realDirectory, "onsite.redacted.json");
    const resultLink = join(realDirectory, "result-link.redacted.json");
    writeFileSync(resultPath, buffers.result, { mode: 0o600 });
    writeFileSync(onsitePath, buffers.onsite, { mode: 0o600 });
    chmodSync(resultPath, 0o600);
    chmodSync(onsitePath, 0o600);
    symlinkSync(resultPath, resultLink);
    symlinkSync(realDirectory, linkedDirectory);

    assert.equal(
      validateFilesAfterAStableChain(resultPath, onsitePath, temporaryDirectory).validation_status,
      "passed",
    );
    assertFailedWith(validateLiveP01EvidenceFiles(resultPath, onsitePath), "input_transport");
    assertFailedWith(
      validateLiveP01EvidenceFiles(resultLink, onsitePath, temporaryDirectory),
      "input_transport",
    );
    assertFailedWith(
      validateLiveP01EvidenceFiles(
        join(linkedDirectory, "result.redacted.json"),
        join(linkedDirectory, "onsite.redacted.json"),
        temporaryDirectory,
      ),
      "input_transport",
    );
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
});

test("secure files reject ancestor symlinks, escapes, sibling prefixes, and casing aliases", () => {
  const temporaryDirectory = realpathSync(mkdtempSync(join(import.meta.dirname, ".p01-paths-")));
  try {
    const buffers = liveBuffers();
    const realParent = join(temporaryDirectory, "RealParent");
    const trustedRoot = join(realParent, "TrustedRoot");
    const siblingRoot = join(realParent, "TrustedRootSibling");
    const linkedParent = join(temporaryDirectory, "LinkedParent");
    mkdirSync(realParent, { mode: 0o700 });
    mkdirSync(trustedRoot, { mode: 0o700 });
    mkdirSync(siblingRoot, { mode: 0o700 });
    const resultPath = join(trustedRoot, "Result.redacted.json");
    const onsitePath = join(trustedRoot, "Onsite.redacted.json");
    const siblingResult = join(siblingRoot, "Result.redacted.json");
    const siblingOnsite = join(siblingRoot, "Onsite.redacted.json");
    writeFileSync(resultPath, buffers.result, { mode: 0o600 });
    writeFileSync(onsitePath, buffers.onsite, { mode: 0o600 });
    writeFileSync(siblingResult, buffers.result, { mode: 0o600 });
    writeFileSync(siblingOnsite, buffers.onsite, { mode: 0o600 });
    symlinkSync(realParent, linkedParent);

    const linkedRoot = join(linkedParent, "TrustedRoot");
    assertFailedWith(
      validateLiveP01EvidenceFiles(
        join(linkedRoot, "Result.redacted.json"),
        join(linkedRoot, "Onsite.redacted.json"),
        linkedRoot,
      ),
      "input_transport",
    );
    assertFailedWith(
      validateLiveP01EvidenceFiles(siblingResult, siblingOnsite, trustedRoot),
      "input_transport",
    );
    assertFailedWith(
      validateLiveP01EvidenceFiles(
        join(trustedRoot, "..", "TrustedRootSibling", "Result.redacted.json"),
        join(trustedRoot, "..", "TrustedRootSibling", "Onsite.redacted.json"),
        trustedRoot,
      ),
      "input_transport",
    );
    assertFailedWith(
      validateLiveP01EvidenceFiles(
        join(realParent, "trustedroot", "Result.redacted.json"),
        join(realParent, "trustedroot", "Onsite.redacted.json"),
        join(realParent, "trustedroot"),
      ),
      "input_transport",
    );
    assertFailedWith(
      validateLiveP01EvidenceFiles(
        join(trustedRoot, "result.redacted.json"),
        join(trustedRoot, "onsite.redacted.json"),
        trustedRoot,
      ),
      "input_transport",
    );
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
});

test("production secure reads detect file and parent inode replacement", () => {
  const childSource = String.raw`
    import * as realFs from "node:fs";
    import { join } from "node:path";
    import { pathToFileURL } from "node:url";
    import { mock } from "node:test";

    const validatorPath = process.env.P01_VALIDATOR_PATH;
    const resultBuffer = realFs.readFileSync(process.env.P01_RESULT_LIVE_PATH);
    const onsiteBuffer = realFs.readFileSync(process.env.P01_ONSITE_LIVE_PATH);
    let activeScenario = null;
    mock.module("node:fs", {
      namedExports: {
        closeSync: realFs.closeSync,
        constants: realFs.constants,
        fstatSync: realFs.fstatSync,
        lstatSync: realFs.lstatSync,
        openSync: realFs.openSync,
        readFileSync(target, ...args) {
          if (typeof target === "number" && activeScenario && !activeScenario.done) {
            activeScenario.done = true;
            activeScenario.replace();
          }
          return realFs.readFileSync(target, ...args);
        },
        readdirSync: realFs.readdirSync,
      },
    });
    const validator = await import(pathToFileURL(validatorPath).href + "?race=" + Date.now());

    function run(mode) {
      const root = realFs.realpathSync(realFs.mkdtempSync(join(process.env.P01_TEST_TEMP_PARENT, ".p01-race-")));
      try {
        const trusted = join(root, "trusted");
        const records = join(trusted, "records");
        realFs.mkdirSync(trusted, { mode: 0o700 });
        realFs.mkdirSync(records, { mode: 0o700 });
        const result = join(records, "result.redacted.json");
        const onsite = join(records, "onsite.redacted.json");
        const replacement = join(trusted, "replacement.redacted.json");
        realFs.writeFileSync(result, resultBuffer, { mode: 0o600 });
        realFs.writeFileSync(onsite, onsiteBuffer, { mode: 0o600 });
        realFs.writeFileSync(replacement, resultBuffer, { mode: 0o600 });
        activeScenario = {
          done: false,
          replace() {
            if (mode === "file") {
              realFs.renameSync(replacement, result);
              return;
            }
            const old = join(trusted, "records-old");
            realFs.renameSync(records, old);
            realFs.mkdirSync(records, { mode: 0o700 });
            realFs.writeFileSync(result, resultBuffer, { mode: 0o600 });
            realFs.writeFileSync(onsite, onsiteBuffer, { mode: 0o600 });
          },
        };
        const report = validator.validateLiveP01EvidenceFiles(result, onsite, trusted);
        return {
          replacement_performed: activeScenario.done,
          failed: report.validation_status === "failed",
          input_transport: report.issue_codes.includes("input_transport"),
        };
      } finally {
        activeScenario = null;
        realFs.rmSync(root, { recursive: true, force: true });
      }
    }
    const value = { file: run("file"), parent: run("parent") };
    process.stdout.write(JSON.stringify(value));
    process.exitCode = Object.values(value).every((entry) => (
      entry.replacement_performed && entry.failed && entry.input_transport
    )) ? 0 : 1;
  `;

  const execution = spawnSync(process.execPath, [
    "--no-warnings",
    "--experimental-test-module-mocks",
    "--input-type=module",
    "-e",
    childSource,
  ], {
    cwd: resolve(import.meta.dirname, "../.."),
    encoding: "utf8",
    env: {
      ...process.env,
      P01_VALIDATOR_PATH: scriptPath,
      P01_RESULT_LIVE_PATH: resultLivePath,
      P01_ONSITE_LIVE_PATH: onsiteLivePath,
      P01_TEST_TEMP_PARENT: import.meta.dirname,
    },
  });
  assert.equal(execution.status, 0, execution.stderr);
  assert.equal(execution.stderr, "");
  const result = JSON.parse(execution.stdout);
  assert.deepEqual(result, {
    file: { replacement_performed: true, failed: true, input_transport: true },
    parent: { replacement_performed: true, failed: true, input_transport: true },
  });
});

test("production secure reads bind the opened descriptor to the pre-open final path identity", () => {
  const childSource = String.raw`
    import * as realFs from "node:fs";
    import { join } from "node:path";
    import { pathToFileURL } from "node:url";
    import { mock } from "node:test";

    let redirectFrom = null;
    let redirectTo = null;
    let redirected = false;
    mock.module("node:fs", {
      namedExports: {
        closeSync: realFs.closeSync,
        constants: realFs.constants,
        fstatSync: realFs.fstatSync,
        lstatSync: realFs.lstatSync,
        openSync(target, ...args) {
          if (!redirected && target === redirectFrom) {
            redirected = true;
            return realFs.openSync(redirectTo, ...args);
          }
          return realFs.openSync(target, ...args);
        },
        readFileSync: realFs.readFileSync,
        readdirSync: realFs.readdirSync,
      },
    });
    const validator = await import(pathToFileURL(process.env.P01_VALIDATOR_PATH).href + "?open-race=" + Date.now());
    const root = realFs.realpathSync(realFs.mkdtempSync(join(process.env.P01_TEST_TEMP_PARENT, ".p01-open-race-")));
    try {
      const trusted = join(root, "trusted");
      realFs.mkdirSync(trusted, { mode: 0o700 });
      const result = join(trusted, "result.redacted.json");
      const onsite = join(trusted, "onsite.redacted.json");
      const replacement = join(trusted, "replacement.redacted.json");
      const resultBuffer = realFs.readFileSync(process.env.P01_RESULT_LIVE_PATH);
      realFs.writeFileSync(result, resultBuffer, { mode: 0o600 });
      realFs.writeFileSync(onsite, realFs.readFileSync(process.env.P01_ONSITE_LIVE_PATH), { mode: 0o600 });
      realFs.writeFileSync(replacement, resultBuffer, { mode: 0o600 });
      redirectFrom = result;
      redirectTo = replacement;
      const report = validator.validateLiveP01EvidenceFiles(result, onsite, trusted);
      const value = {
        replacement_opened: redirected,
        failed: report.validation_status === "failed",
        input_transport: report.issue_codes.includes("input_transport"),
      };
      process.stdout.write(JSON.stringify(value));
      process.exitCode = value.replacement_opened && value.failed && value.input_transport ? 0 : 1;
    } finally {
      realFs.rmSync(root, { recursive: true, force: true });
    }
  `;

  const execution = spawnSync(process.execPath, [
    "--no-warnings",
    "--experimental-test-module-mocks",
    "--input-type=module",
    "-e",
    childSource,
  ], {
    cwd: resolve(import.meta.dirname, "../.."),
    encoding: "utf8",
    env: {
      ...process.env,
      P01_VALIDATOR_PATH: scriptPath,
      P01_RESULT_LIVE_PATH: resultLivePath,
      P01_ONSITE_LIVE_PATH: onsiteLivePath,
      P01_TEST_TEMP_PARENT: import.meta.dirname,
    },
  });
  assert.equal(execution.status, 0, execution.stderr);
  assert.equal(execution.stderr, "");
  assert.deepEqual(JSON.parse(execution.stdout), {
    replacement_opened: true,
    failed: true,
    input_transport: true,
  });
});

test("production exports no injectable secure-read hook", async () => {
  const validator = await import("../../feishu/scripts/validate-live-p01-evidence.mjs");
  assert.equal(Object.hasOwn(validator, "validateLiveP01EvidenceFilesForTest"), false);
});

test("serializer rejects extra keys, forged values, counts, and unknown issues", () => {
  const documents = liveDocuments();
  const report = validateLiveP01EvidenceDocuments(documents.result, documents.onsite);
  for (const forged of [
    { ...report, extra: true },
    { ...report, reference_resolution_verified: true },
    { ...report, p01_completion_verified: true },
    { ...report, anonymous_document_access_derived: true },
    { ...report, observation_truth_machine_verified: true },
    { ...report, business_write_count: 0 },
    { ...report, screenshot_evidence_count: 1 },
    { ...report, result_input_sha256: null },
    { ...report, onsite_input_sha256: null },
    { ...report, issue_codes: ["unknown"] },
    Object.fromEntries(Object.entries(report).reverse()),
    Object.fromEntries([...Object.entries(report).slice(1), Object.entries(report)[0]]),
  ]) {
    assert.throws(() => serializeLiveP01EvidenceReport(forged), /report/u);
  }
});

test("the fixed-path CLI emits only the report and rejects every argument without echoing it", () => {
  const success = spawnSync(process.execPath, [scriptPath], {
    cwd: resolve(import.meta.dirname, "../.."),
    encoding: "utf8",
  });
  assert.equal(success.status, 0, success.stderr);
  assert.equal(success.stderr, "");
  const report = JSON.parse(success.stdout);
  assert.deepEqual(Object.keys(report), reportKeys);
  assert.equal(report.validation_status, "passed");
  for (const sentinel of ["T2-EV-P01", "controlled-slot", "user_attested", "https://"]) {
    assert.equal(success.stdout.includes(sentinel), false);
  }

  const sentinel = "do-not-echo-sensitive-path";
  const failure = spawnSync(process.execPath, [scriptPath, sentinel], {
    cwd: resolve(import.meta.dirname, "../.."),
    encoding: "utf8",
  });
  assert.equal(failure.status, 1);
  assert.equal(failure.stderr, "");
  const failedReport = JSON.parse(failure.stdout);
  assertFailedWith(failedReport, "cli_arguments_forbidden");
  assertNoSentinel(failedReport, sentinel);
});
