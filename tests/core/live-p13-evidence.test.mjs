import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

import {
  LIVE_P13_MAX_BYTES,
  serializeLiveP13EvidenceReport,
  validateLiveP13EvidenceBuffers,
  validateLiveP13EvidenceDocuments,
  validateLiveP13EvidenceFiles,
  validateLiveP13EvidenceTexts,
} from "../../feishu/scripts/validate-live-p13-evidence.mjs";

const resultLivePath = resolve(
  import.meta.dirname,
  "../../feishu/evidence/live/2026-08-07-day-1-probe-results.redacted.json",
);
const onsiteLivePath = resolve(
  import.meta.dirname,
  "../../feishu/evidence/live/2026-08-07-on-site-evidence.redacted.json",
);
const scriptPath = resolve(import.meta.dirname, "../../feishu/scripts/validate-live-p13-evidence.mjs");

const reportKeys = [
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

function p13Result(documents) {
  return documents.result.permission_probes.find((record) => record.unit_id === "P13");
}

function p12Result(documents) {
  return documents.result.permission_probes.find((record) => record.unit_id === "P12");
}

function p13Onsite(documents) {
  return documents.onsite.permission_checks.find((record) => record.key === "P13");
}

function p12Onsite(documents) {
  return documents.onsite.permission_checks.find((record) => record.key === "P12");
}

function validateMutation(mutate) {
  const documents = liveDocuments();
  mutate(documents);
  return validateLiveP13EvidenceDocuments(documents.result, documents.onsite);
}

function issueSet(report) {
  return new Set(report.issue_codes);
}

function assertFailedWith(report, issueCode) {
  assert.equal(report.validation_status, "failed");
  assert.equal(report.p12_completion_verified, false);
  assert.equal(report.p13_completion_verified, false);
  assert.equal(issueSet(report).has(issueCode), true);
}

function syncEvidence(documents, unitId, evidenceIndex) {
  const resultRecord = unitId === "P12" ? p12Result(documents) : p13Result(documents);
  const onsiteRecord = unitId === "P12" ? p12Onsite(documents) : p13Onsite(documents);
  resultRecord.evidence_index = structuredClone(evidenceIndex);
  resultRecord.evidence = structuredClone(evidenceIndex);
  onsiteRecord.structured_evidence_index = structuredClone(evidenceIndex);
}

test("the fixed live evidence verifies a blocked P12 attempt and the P13 auth gate without completing either probe", () => {
  const documents = liveDocuments();
  const report = validateLiveP13EvidenceDocuments(documents.result, documents.onsite);
  const serialized = serializeLiveP13EvidenceReport(report);

  assert.deepEqual(Object.keys(report), reportKeys);
  assert.deepEqual(Object.keys(JSON.parse(serialized)), reportKeys);
  assert.equal(report.schema_version, "live_p12_p13_evidence_report.v3");
  assert.equal(report.scope, "P12_P13_redacted_live_evidence_only");
  assert.equal(report.validation_status, "passed");
  assert.equal(report.p12_state_verified, true);
  assert.equal(report.p12_attempt_verified, true);
  assert.equal(report.p12_completion_verified, false);
  assert.equal(report.p12_evidence_binding_verified, true);
  assert.equal(report.p12_evidence_identity_verified, true);
  assert.equal(report.p12_evidence_entry_count, 1);
  assert.equal(report.p12_plan_ready_count, 3);
  assert.equal(report.p12_live_execution_count, 1);
  assert.equal(report.cli_command_count, 4);
  assert.equal(report.auth_command_count, 2);
  assert.equal(report.base_read_command_attempt_count, 1);
  assert.equal(report.record_discovery_count, 0);
  assert.equal(report.zero_match_query_count, 0);
  assert.equal(report.record_list_command_count, 0);
  assert.equal(report.p12_failure_classification, "projection_dependency_failure");
  assert.deepEqual(report.p12_runtime_issue_codes, ["command_failed"]);
  assert.equal(report.p12_failure_stage, "wiki_url_resolve_command_failed");
  assert.equal(report.p12_retry_count, 0);
  assert.equal(report.auth_scopes_command_count, 0);
  assert.equal(report.permission_expansion_count, 0);
  assert.equal(report.business_write_count, 0);
  assert.equal(report.p13_state_verified, true);
  assert.equal(report.p13_auth_gate_verified, true);
  assert.equal(report.p13_completion_verified, false);
  assert.equal(report.p13_evidence_binding_verified, true);
  assert.equal(report.p13_evidence_identity_verified, true);
  assert.equal(report.p13_evidence_entry_count, 1);
  assert.equal(report.application_binding_verified, true);
  assert.equal(report.application_binding_candidate_count, 1);
  assert.equal(report.external_identifier_exposure_count, 0);
  assert.equal(report.p12_latest_facts_verified, true);
  assert.equal(report.p13_latest_facts_verified, true);
  assert.equal(report.redaction_verified, true);
  assert.equal(report.auth_state_write_count, 1);
  assert.deepEqual(report.issue_codes, []);
});

test("every required P13 runtime field fails closed when drifted", async (t) => {
  const fixtures = [
    ["execution_status", (record) => { record.execution_status = "completed"; }],
    ["result", (record) => { record.result = "可用"; }],
    ["preconditions", (record) => { record.preconditions_observed = []; }],
    ["actual_action", (record) => { record.actual_action = null; }],
    ["actual_result", (record) => { record.actual_result = null; }],
    ["actual_time", (record) => { record.actual_time = "2026-08-08T01:14:52"; }],
    ["executor", (record) => { record.executor = null; }],
    ["account_role", (record) => { record.account_role = null; }],
    ["limitations", (record) => { record.limitations = null; }],
    ["fallback_verified", (record) => { record.fallback_verified = null; }],
    ["cleanup_result", (record) => { record.cleanup_result = null; }],
    ["verifier", (record) => { record.verifier = null; }],
  ];

  for (const [name, mutate] of fixtures) {
    await t.test(name, () => {
      const report = validateMutation((documents) => mutate(p13Result(documents)));
      assertFailedWith(report, "p13_state");
    });
  }
});

test("every exact P13 key on both live surfaces is mandatory", async (t) => {
  const resultKeys = Object.keys(p13Result(liveDocuments()));
  for (const key of resultKeys) {
    await t.test(`result_missing_${key}`, () => {
      const report = validateMutation((documents) => {
        delete p13Result(documents)[key];
      });
      assertFailedWith(report, "p13_record_shape");
    });
  }

  const onsiteKeys = Object.keys(p13Onsite(liveDocuments()));
  for (const key of onsiteKeys) {
    await t.test(`onsite_missing_${key}`, () => {
      const report = validateMutation((documents) => {
        delete p13Onsite(documents)[key];
      });
      assertFailedWith(report, "onsite_record_shape");
    });
  }
});

test("every required P12 blocked runtime field fails closed when drifted", async (t) => {
  const fixtures = [
    ["execution_status", (record) => { record.execution_status = "completed"; }],
    ["result", (record) => { record.result = "不可用"; }],
    ["preconditions", (record) => { record.preconditions_observed = []; }],
    ["actual_action", (record) => { record.actual_action = null; }],
    ["actual_result", (record) => { record.actual_result = null; }],
    ["actual_time", (record) => { record.actual_time = "2026-08-08T03:28:50"; }],
    ["executor", (record) => { record.executor = null; }],
    ["account_role", (record) => { record.account_role = null; }],
    ["limitations", (record) => { record.limitations = null; }],
    ["fallback_verified", (record) => { record.fallback_verified = null; }],
    ["cleanup_result", (record) => { record.cleanup_result = null; }],
    ["verifier", (record) => { record.verifier = null; }],
  ];

  for (const [name, mutate] of fixtures) {
    await t.test(name, () => {
      const report = validateMutation((documents) => mutate(p12Result(documents)));
      assertFailedWith(report, "p12_state");
    });
  }
});

test("every exact P12 key on both live surfaces is mandatory", async (t) => {
  const resultKeys = Object.keys(p12Result(liveDocuments()));
  for (const key of resultKeys) {
    await t.test(`result_missing_${key}`, () => {
      const report = validateMutation((documents) => {
        delete p12Result(documents)[key];
      });
      assertFailedWith(report, "p12_record_shape");
    });
  }

  const onsiteKeys = Object.keys(p12Onsite(liveDocuments()));
  for (const key of onsiteKeys) {
    await t.test(`onsite_missing_${key}`, () => {
      const report = validateMutation((documents) => {
        delete p12Onsite(documents)[key];
      });
      assertFailedWith(report, "onsite_record_shape");
    });
  }
});

test("all three canonical P12 evidence copies must remain deep-equal", async (t) => {
  const fixtures = [
    ["same_record_alias", (documents) => {
      p12Result(documents).evidence.indexes[0].actor_role = "drift";
    }],
    ["canonical_index", (documents) => {
      p12Result(documents).evidence_index.indexes[0].actor_role = "drift";
    }],
    ["onsite_copy", (documents) => {
      p12Onsite(documents).structured_evidence_index.indexes[0].actor_role = "drift";
    }],
  ];

  for (const [name, mutate] of fixtures) {
    await t.test(name, () => {
      const report = validateMutation(mutate);
      assertFailedWith(report, "p12_evidence_binding");
    });
  }
});

test("all three canonical P13 evidence copies must remain deep-equal", async (t) => {
  const fixtures = [
    ["same_record_alias", (documents) => {
      p13Result(documents).evidence.indexes[0].actor_role = "drift";
    }],
    ["canonical_index", (documents) => {
      p13Result(documents).evidence_index.indexes[0].actor_role = "drift";
    }],
    ["onsite_copy", (documents) => {
      p13Onsite(documents).structured_evidence_index.indexes[0].actor_role = "drift";
    }],
  ];

  for (const [name, mutate] of fixtures) {
    await t.test(name, () => {
      const report = validateMutation(mutate);
      assertFailedWith(report, "p13_evidence_binding");
    });
  }
});

test("the P12 redacted evidence identity and capture contract are exact", async (t) => {
  const fixtures = [
    ["missing_index", (index) => { index.indexes = []; }],
    ["duplicate_index", (index) => { index.indexes.push(structuredClone(index.indexes[0])); }],
    ["evidence_id", (index) => { index.indexes[0].evidence_id = "T2-EV-P12-20990101-0000-99"; }],
    ["observed_at", (index) => { index.indexes[0].observed_at = "2099-01-01T00:00:00+08:00"; }],
    ["actor_role", (index) => { index.indexes[0].actor_role = "participant"; }],
    ["slot", (index) => { index.indexes[0].redacted_storage_slot = "controlled-slot-P12-drift"; }],
    ["capture_phases", (index) => { index.indexes[0].capture_phases = ["failure"]; }],
    ["redaction_checked", (index) => { index.indexes[0].redaction_checked = false; }],
    ["r10_subchecks", (index) => { index.r10_subchecks = {}; }],
  ];

  for (const [name, mutate] of fixtures) {
    await t.test(name, () => {
      const report = validateMutation((documents) => {
        const index = structuredClone(p12Result(documents).evidence_index);
        mutate(index);
        syncEvidence(documents, "P12", index);
      });
      assertFailedWith(report, "p12_evidence_identity");
    });
  }
});

test("the P13 redacted evidence identity and capture contract are exact", async (t) => {
  const fixtures = [
    ["missing_index", (index) => { index.indexes = []; }],
    ["duplicate_index", (index) => { index.indexes.push(structuredClone(index.indexes[0])); }],
    ["evidence_id", (index) => { index.indexes[0].evidence_id = "T2-EV-P13-20990101-0000-99"; }],
    ["observed_at", (index) => { index.indexes[0].observed_at = "2099-01-01T00:00:00+08:00"; }],
    ["actor_role", (index) => { index.indexes[0].actor_role = "controller"; }],
    ["slot", (index) => { index.indexes[0].redacted_storage_slot = "controlled-slot-P13-drift"; }],
    ["capture_phases", (index) => { index.indexes[0].capture_phases = ["failure"]; }],
    ["redaction_checked", (index) => { index.indexes[0].redaction_checked = false; }],
    ["r10_subchecks", (index) => { index.r10_subchecks = {}; }],
  ];

  for (const [name, mutate] of fixtures) {
    await t.test(name, () => {
      const report = validateMutation((documents) => {
        const index = structuredClone(p13Result(documents).evidence_index);
        mutate(index);
        syncEvidence(documents, "P13", index);
      });
      assertFailedWith(report, "p13_evidence_identity");
    });
  }
});

test("every required P12 attempt marker is mandatory", async (t) => {
  const fixtures = [
    ["three_plans_ready", (record) => { record.actual_action = record.actual_action.replace("三份 plan 均为 plan_ready", "plan 状态未知"); }],
    ["plans_zero_count", (record) => { record.actual_action = record.actual_action.replace("计划阶段所有计数均为 0", "计划计数未知"); }],
    ["cases_live_once", (record) => { record.actual_action = record.actual_action.replace("只对 cases 串行执行 1 次 explicit live", "live 次数未知"); }],
    ["exit_one", (record) => { record.actual_result = record.actual_result.replace("exit=1", "exit=0"); }],
    ["classification", (record) => { record.actual_result = record.actual_result.replace("classification=projection_dependency_failure", "classification=unknown"); }],
    ["issue_codes", (record) => { record.actual_result = record.actual_result.replace("issue_codes=[command_failed]", "issue_codes=[]"); }],
    ["cli_count", (record) => { record.actual_result = record.actual_result.replace("cli_command_count=4", "cli_command_count=3"); }],
    ["auth_count", (record) => { record.actual_result = record.actual_result.replace("auth_command_count=2", "auth_command_count=1"); }],
    ["base_read_attempt", (record) => { record.actual_result = record.actual_result.replace("base_read_command_attempt_count=1", "base_read_command_attempt_count=0"); }],
    ["discovery_zero", (record) => { record.actual_result = record.actual_result.replace("record_discovery_count=0", "record_discovery_count=1"); }],
    ["zero_match_zero", (record) => { record.actual_result = record.actual_result.replace("zero_match_query_count=0", "zero_match_query_count=1"); }],
    ["record_list_zero", (record) => { record.actual_result = record.actual_result.replace("record_list_command_count=0", "record_list_command_count=1"); }],
    ["business_write_zero", (record) => { record.actual_result = record.actual_result.replace("business_write_count=0", "business_write_count=1"); }],
    ["auth_sequence_passed", (record) => { record.actual_result = record.actual_result.replace("version、status 与 bitable:app:readonly 精确 auth check 已完成", "认证序列状态未知"); }],
    ["failure_stage", (record) => { record.actual_result = record.actual_result.replace("failure_stage=wiki_url_resolve_command_failed", "failure_stage=unknown"); }],
    ["no_retry", (record) => { record.actual_action = record.actual_action.replace("未重试", "重试状态未知"); }],
    ["no_auth_scopes", (record) => { record.actual_action = record.actual_action.replace("未运行 auth scopes", "auth scopes 状态未知"); }],
    ["no_permission_expansion", (record) => { record.actual_action = record.actual_action.replace("未扩大权限", "权限变化未知"); }],
    ["no_provider_inference", (record) => { record.limitations = record.limitations.replace("不推断 provider HTTP/OpenAPI 是否实际到达", "推断 provider 已到达"); }],
    ["record_time_semantics", (record) => { record.actual_action = record.actual_action.replace("仅为本轮脱敏证据落盘时间", "为命令精确发生时间"); }],
    ["no_business_cleanup", (record) => { record.cleanup_result = record.cleanup_result.replace("未产生需清理的业务记录", "业务清理状态未知"); }],
    ["provider_raw_append", (record) => { record.actual_result += " provider_raw=SYN_PROVIDER_RAW"; }],
    ["provider_reach_inference_append", (record) => { record.actual_result += " provider_http_reached=true"; }],
  ];

  for (const [name, mutate] of fixtures) {
    await t.test(name, () => {
      const report = validateMutation((documents) => mutate(p12Result(documents)));
      assertFailedWith(report, "p12_latest_fact");
    });
  }
});

test("P12 provider raw and transport-reach inference are rejected without echo", () => {
  const sentinels = ["provider_raw=SYN_PROVIDER_RAW", "provider_http_reached=true"];
  for (const sentinel of sentinels) {
    const report = validateMutation((documents) => {
      p12Result(documents).actual_result += ` ${sentinel}`;
    });
    const serialized = serializeLiveP13EvidenceReport(report);
    assertFailedWith(report, "p12_latest_fact");
    assert.equal(serialized.includes(sentinel), false);
  }
});

test("every required P13 auth-gate marker is mandatory", async (t) => {
  const fixtures = [
    ["user_attested_online_scope", (record) => { record.actual_result = record.actual_result.replace("user_attested", "unverified"); }],
    ["qr_action", (record) => { record.actual_action = record.actual_action.replace("完成新二维码授权动作", "未确认二维码动作"); }],
    ["completion_exit_zero", (record) => { record.actual_result = record.actual_result.replace("同一新交易 completion exit=0", "completion 状态未知"); }],
    ["status_user_available", (record) => { record.actual_result = record.actual_result.replace("user available=true", "user available=false"); }],
    ["status_user_verified", (record) => { record.actual_result = record.actual_result.replace("user verified=true", "user verified=false"); }],
    ["status_total_verified", (record) => { record.actual_result = record.actual_result.replace("overall verified=true", "overall verified=false"); }],
    ["target_scope_ok", (record) => { record.actual_result = record.actual_result.replace("auth check ok=true", "auth check ok=false"); }],
    ["target_scope_missing_null", (record) => { record.actual_result = record.actual_result.replace("missing=null", "missing=present"); }],
    ["target_scope_granted_count", (record) => { record.actual_result = record.actual_result.replace("granted_count=1", "granted_count=0"); }],
    ["auth_scopes_not_run", (record) => { record.actual_result = record.actual_result.replace("未运行 auth scopes", "auth scopes 状态未知"); }],
    ["application_binding", (record) => { record.actual_result = record.actual_result.replace("application_binding_check=machine_verified", "application_binding_check=unverified"); }],
    ["application_candidate_count", (record) => { record.actual_result = record.actual_result.replace("候选应用数=1", "候选应用数=2"); }],
    ["identifier_exposure_zero", (record) => { record.actual_result = record.actual_result.replace("对外标识暴露数为 0", "对外标识暴露数为 1"); }],
    ["pending_cleaned", (record) => { record.cleanup_result = record.cleanup_result.replace("pending device request 已清除", "pending 状态未知"); }],
    ["qr_cleaned", (record) => { record.cleanup_result = record.cleanup_result.replace("二维码临时 PNG 与临时目录已删除", "二维码清理未知"); }],
    ["auth_state_write_one", (record) => { record.actual_result = record.actual_result.replace("认证状态写入数为 1", "认证状态写入数为 0"); }],
    ["P12_blocked", (record) => { record.actual_result = record.actual_result.replace("P12 已转为 blocked/null", "P12 状态未知"); }],
  ];

  for (const [name, mutate] of fixtures) {
    await t.test(name, () => {
      const report = validateMutation((documents) => mutate(p13Result(documents)));
      assertFailedWith(report, "p13_latest_fact");
    });
  }
});

test("on-site P12 metadata and runtime fields cannot drift", async (t) => {
  const fixtures = [
    ["status", (record) => { record.status = "不可用"; }],
    ["actual_action", (record) => { record.actual_action = "drift"; }],
    ["actual_time", (record) => { record.actual_time = "2099-01-01T00:00:00+08:00"; }],
    ["executor", (record) => { record.executor = "drift"; }],
    ["platform_role", (record) => { record.platform_account_role = "drift"; }],
    ["logical_role", (record) => { record.logical_business_role = "drift"; }],
    ["role_mapping", (record) => { record.platform_role_mapping_status = "未测试"; }],
    ["actual_result", (record) => { record.actual_result = "drift"; }],
    ["limitations", (record) => { record.limitations = "drift"; }],
    ["fallback_status", (record) => { record.fallback_verification_status = "未测试"; }],
    ["fallback_result", (record) => { record.fallback_actual_result = null; }],
    ["verifier", (record) => { record.verifier = "drift"; }],
    ["evidence_presence", (record) => { record.evidence_presence = "待填"; }],
    ["screenshot_indexes", (record) => { record.screenshot_indexes = ["drift"]; }],
    ["run_indexes", (record) => { record.run_indexes = ["drift"]; }],
    ["redaction_status", (record) => { record.redaction_status = "待填"; }],
  ];

  for (const [name, mutate] of fixtures) {
    await t.test(name, () => {
      const report = validateMutation((documents) => mutate(p12Onsite(documents)));
      assertFailedWith(report, "p12_onsite_alignment");
    });
  }
});

test("on-site P13 metadata and shared runtime fields cannot drift", async (t) => {
  const fixtures = [
    ["status", (record) => { record.status = "可用"; }],
    ["actual_action", (record) => { record.actual_action = "drift"; }],
    ["actual_time", (record) => { record.actual_time = "2099-01-01T00:00:00+08:00"; }],
    ["executor", (record) => { record.executor = "drift"; }],
    ["platform_role", (record) => { record.platform_account_role = "drift"; }],
    ["logical_role", (record) => { record.logical_business_role = "drift"; }],
    ["role_mapping", (record) => { record.platform_role_mapping_status = "未测试"; }],
    ["actual_result", (record) => { record.actual_result = "drift"; }],
    ["limitations", (record) => { record.limitations = "drift"; }],
    ["fallback_status", (record) => { record.fallback_verification_status = "未测试"; }],
    ["fallback_result", (record) => { record.fallback_actual_result = null; }],
    ["verifier", (record) => { record.verifier = "drift"; }],
    ["evidence_presence", (record) => { record.evidence_presence = "待填"; }],
    ["screenshot_indexes", (record) => { record.screenshot_indexes = ["drift"]; }],
    ["run_indexes", (record) => { record.run_indexes = ["drift"]; }],
    ["redaction_status", (record) => { record.redaction_status = "待填"; }],
  ];

  for (const [name, mutate] of fixtures) {
    await t.test(name, () => {
      const report = validateMutation((documents) => mutate(p13Onsite(documents)));
      assertFailedWith(report, "p13_onsite_alignment");
    });
  }
});

test("unknown keys fail closed at every controlled surface", async (t) => {
  const fixtures = [
    ["result_root", (documents) => { documents.result.unexpected = true; }, "document_shape"],
    ["onsite_root", (documents) => { documents.onsite.unexpected = true; }, "document_shape"],
    ["result_P12", (documents) => { p12Result(documents).unexpected = true; }, "p12_record_shape"],
    ["result_P13", (documents) => { p13Result(documents).unexpected = true; }, "p13_record_shape"],
    ["onsite_P12", (documents) => { p12Onsite(documents).unexpected = true; }, "onsite_record_shape"],
    ["onsite_P13", (documents) => { p13Onsite(documents).unexpected = true; }, "onsite_record_shape"],
    ["P12_evidence_outer", (documents) => {
      const index = structuredClone(p12Result(documents).evidence_index);
      index.unexpected = true;
      syncEvidence(documents, "P12", index);
    }, "p12_evidence_identity"],
    ["P12_evidence_entry", (documents) => {
      const index = structuredClone(p12Result(documents).evidence_index);
      index.indexes[0].unexpected = true;
      syncEvidence(documents, "P12", index);
    }, "p12_evidence_identity"],
    ["P13_evidence_outer", (documents) => {
      const index = structuredClone(p13Result(documents).evidence_index);
      index.unexpected = true;
      syncEvidence(documents, "P13", index);
    }, "p13_evidence_identity"],
    ["P13_evidence_entry", (documents) => {
      const index = structuredClone(p13Result(documents).evidence_index);
      index.indexes[0].unexpected = true;
      syncEvidence(documents, "P13", index);
    }, "p13_evidence_identity"],
  ];

  for (const [name, mutate, expectedIssue] of fixtures) {
    await t.test(name, () => {
      const report = validateMutation(mutate);
      assertFailedWith(report, expectedIssue);
    });
  }
});

test("sensitive values are rejected and never echoed", async (t) => {
  const sentinels = [
    "https://example.invalid/private",
    "Bearer SYN-SENSITIVE-VALUE",
    "access_token=SYN-SENSITIVE-VALUE",
    "device_code=SYN-SENSITIVE-VALUE",
    "cli_SYNTHETIC123456",
    "tblSYNTHETIC123",
    "person@example.invalid",
    "13800138000",
  ];

  for (const sentinel of sentinels) {
    await t.test(`P13_${sentinel.split(/[:/\s=]/u)[0]}`, () => {
      const report = validateMutation((documents) => {
        p13Result(documents).actual_action += ` ${sentinel}`;
      });
      const serialized = serializeLiveP13EvidenceReport(report);

      assertFailedWith(report, "sensitive_value");
      assert.equal(serialized.includes(sentinel), false);
    });

    await t.test(`P12_${sentinel.split(/[:/\s=]/u)[0]}`, () => {
      const report = validateMutation((documents) => {
        p12Result(documents).actual_action += ` ${sentinel}`;
      });
      const serialized = serializeLiveP13EvidenceReport(report);

      assertFailedWith(report, "sensitive_value");
      assert.equal(serialized.includes(sentinel), false);
    });
  }

  await t.test("outside_P13_is_still_scanned", () => {
    const sentinel = "https://example.invalid/outside-p13";
    const report = validateMutation((documents) => {
      const p02 = documents.result.permission_probes.find((record) => record.unit_id === "P02");
      p02.actual_action += ` ${sentinel}`;
    });
    const serialized = serializeLiveP13EvidenceReport(report);

    assertFailedWith(report, "sensitive_value");
    assert.equal(serialized.includes(sentinel), false);
  });
});

test("duplicate keys, malformed JSON, oversized input, and non-UTF-8 input fail closed", async (t) => {
  const buffers = liveBuffers();
  const resultText = buffers.result.toString("utf8");
  const onsiteText = buffers.onsite.toString("utf8");
  const fixtures = [
    ["duplicate_result", () => validateLiveP13EvidenceTexts(`{"template_version":"duplicate",${resultText.slice(1)}`, onsiteText), "duplicate_json_key"],
    ["duplicate_onsite", () => validateLiveP13EvidenceTexts(resultText, `{"template_version":"duplicate",${onsiteText.slice(1)}`), "duplicate_json_key"],
    ["malformed", () => validateLiveP13EvidenceTexts("{", onsiteText), "invalid_json"],
    ["oversized_result", () => validateLiveP13EvidenceBuffers(Buffer.alloc(LIVE_P13_MAX_BYTES + 1, 0x20), buffers.onsite), "input_transport"],
    ["oversized_onsite", () => validateLiveP13EvidenceBuffers(buffers.result, Buffer.alloc(LIVE_P13_MAX_BYTES + 1, 0x20)), "input_transport"],
    ["non_utf8", () => validateLiveP13EvidenceBuffers(Buffer.from([0xc3, 0x28]), buffers.onsite), "input_transport"],
  ];

  for (const [name, validate, expectedIssue] of fixtures) {
    await t.test(name, () => {
      const report = validate();
      assert.equal(report.validation_status, "failed");
      assert.deepEqual(report.issue_codes, [expectedIssue]);
      assert.equal(report.p12_completion_verified, false);
      assert.equal(report.p13_completion_verified, false);
    });
  }
});

test("secure file loading rejects symlinks without echoing either path", () => {
  const directory = mkdtempSync(join(tmpdir(), "neoloop-live-p13-"));
  const resultTarget = join(directory, "result-target.redacted.json");
  const resultLink = join(directory, "result-link.redacted.json");
  const onsitePath = join(directory, "onsite.redacted.json");
  const buffers = liveBuffers();

  try {
    writeFileSync(resultTarget, buffers.result);
    writeFileSync(onsitePath, buffers.onsite);
    symlinkSync(resultTarget, resultLink);
    const report = validateLiveP13EvidenceFiles(resultLink, onsitePath);
    const serialized = serializeLiveP13EvidenceReport(report);

    assert.equal(report.validation_status, "failed");
    assert.deepEqual(report.issue_codes, ["input_transport"]);
    assert.equal(serialized.includes(resultTarget), false);
    assert.equal(serialized.includes(resultLink), false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("CLI reads only the fixed live files and emits only the allowlisted report", async (t) => {
  await t.test("fixed_live_success", () => {
    const result = spawnSync(process.execPath, [scriptPath], { encoding: "utf8" });
    const report = JSON.parse(result.stdout);

    assert.equal(result.status, 0);
    assert.equal(result.stderr, "");
    assert.deepEqual(Object.keys(report), reportKeys);
    assert.equal(report.validation_status, "passed");
    assert.equal(report.p12_attempt_verified, true);
    assert.equal(report.p12_completion_verified, false);
    assert.equal(report.p13_auth_gate_verified, true);
    assert.equal(report.p13_completion_verified, false);
  });

  await t.test("arguments_forbidden_without_echo", () => {
    const sentinel = "SYN-SENSITIVE-CLI-ARGUMENT";
    const result = spawnSync(process.execPath, [scriptPath, sentinel], { encoding: "utf8" });
    const report = JSON.parse(result.stdout);

    assert.equal(result.status, 1);
    assert.equal(result.stderr, "");
    assert.deepEqual(Object.keys(report), reportKeys);
    assert.deepEqual(report.issue_codes, ["cli_arguments_forbidden"]);
    assert.equal(result.stdout.includes(sentinel), false);
  });
});

test("serializer replaces any non-allowlisted report without echoing it", () => {
  const sentinel = "SYN-SENSITIVE-REPORT-VALUE";
  const serialized = serializeLiveP13EvidenceReport({
    validation_status: "passed",
    p13_completion_verified: true,
    locator: sentinel,
  });
  const report = JSON.parse(serialized);

  assert.deepEqual(Object.keys(report), reportKeys);
  assert.equal(report.validation_status, "failed");
  assert.equal(report.p12_completion_verified, false);
  assert.equal(report.p13_completion_verified, false);
  assert.deepEqual(report.issue_codes, ["report_shape"]);
  assert.equal(serialized.includes(sentinel), false);
});
