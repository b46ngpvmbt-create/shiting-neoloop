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
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

import {
  LIVE_P03_PARTIAL_BLOCKED_MAX_BYTES,
  serializeLiveP03PartialBlockedEvidenceReport,
  validateLiveP03PartialBlockedEvidenceBuffers,
  validateLiveP03PartialBlockedEvidenceDocuments,
  validateLiveP03PartialBlockedEvidenceFiles,
  validateLiveP03PartialBlockedEvidenceTexts,
} from "../../feishu/scripts/validate-live-p03-partial-blocked-evidence.mjs";

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
  "../../feishu/scripts/validate-live-p03-partial-blocked-evidence.mjs",
);

const reportKeys = [
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

function p03Result(documents) {
  return documents.result.permission_probes.find((record) => record.unit_id === "P03");
}

function a02Result(documents) {
  return documents.result.access_checks.find((record) => record.unit_id === "A02");
}

function p03Onsite(documents) {
  return documents.onsite.permission_checks.find((record) => record.key === "P03");
}

function prebuild(documents) {
  return p03Onsite(documents).p03_phase_observations.prebuild_gate;
}

function postbuild(documents) {
  return p03Onsite(documents).p03_phase_observations
    .postbuild_five_view_direct_table_recheck;
}

function validateMutation(mutate) {
  const documents = liveDocuments();
  mutate(documents);
  return validateLiveP03PartialBlockedEvidenceDocuments(documents.result, documents.onsite);
}

function assertFailedWith(report, issueCode) {
  assert.equal(report.validation_status, "failed");
  assert.equal(report.p03_completion_verified, false);
  assert.equal(report.formal_build_gate_open, false);
  assert.equal(report.business_write_count, null);
  assert.equal(report.issue_codes.includes(issueCode), true);
  assert.deepEqual(report.issue_codes, [...report.issue_codes].sort());
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

test("the fixed live snapshots validate only the honest P03 partial-blocked state", () => {
  const buffers = liveBuffers();
  const report = validateLiveP03PartialBlockedEvidenceBuffers(buffers.result, buffers.onsite);
  const serialized = serializeLiveP03PartialBlockedEvidenceReport(report);

  assert.deepEqual(Object.keys(report), reportKeys);
  assert.deepEqual(Object.keys(JSON.parse(serialized)), reportKeys);
  assert.equal(report.schema_version, "live_p03_partial_blocked_evidence_report.v1");
  assert.equal(report.scope, "P03_partial_blocked_redacted_live_evidence_only");
  assert.equal(report.fact_class, "synthetic_experiment");
  assert.equal(report.result_input_sha256, sha256(buffers.result));
  assert.equal(report.onsite_input_sha256, sha256(buffers.onsite));
  assert.equal(report.validation_status, "passed");
  assert.equal(report.p03_parent_blocked_verified, true);
  assert.equal(report.p03_prebuild_blocked_verified, true);
  assert.equal(report.p03_partial_attempt_verified, true);
  assert.equal(report.p03_full_event_trace_verified, false);
  assert.equal(report.p03_full_prebuild_proof_verified, false);
  assert.equal(report.p03_postbuild_not_tested_verified, true);
  assert.equal(report.p03_completion_verified, false);
  assert.equal(report.p03_evidence_identity_verified, true);
  assert.equal(report.p03_evidence_binding_verified, true);
  assert.equal(report.p03_evidence_entry_count, 1);
  assert.equal(report.safe_stop_claims_bound, true);
  assert.equal(report.a02_not_tested_verified, true);
  assert.equal(report.unprivileged_access_capability_derived, false);
  assert.equal(report.formal_build_gate_open, false);
  assert.equal(report.automatic_retry_allowed, false);
  assert.equal(report.observation_truth_machine_verified, false);
  assert.equal(report.business_write_count, null);
  assert.equal(report.redaction_verified, true);
  assert.deepEqual(report.issue_codes, []);
  assert.equal(serialized.includes("owner_operator"), false);
  assert.equal(serialized.includes("controlled-slot"), false);
  assert.equal(serialized.includes("T2-EV-P03"), false);
  assert.equal(serialized.includes("首个权限"), false);
});

test("parent, phase, and A02 state transitions fail closed", async (t) => {
  const fixtures = [
    ["parent_status", "p03_parent_state", (d) => { p03Result(d).execution_status = "completed"; }],
    ["parent_result", "p03_parent_state", (d) => { p03Result(d).result = "available"; }],
    ["prebuild_status", "p03_phase_state", (d) => { prebuild(d).execution_status = "completed"; }],
    ["prebuild_result", "p03_phase_state", (d) => { prebuild(d).result = "restricted"; }],
    ["prebuild_proof", "prebuild_proof_claim", (d) => { prebuild(d).actual_prebuild_proof = {}; }],
    ["postbuild_status", "postbuild_claim", (d) => { postbuild(d).execution_status = "completed"; }],
    ["postbuild_result", "postbuild_claim", (d) => { postbuild(d).result = "unavailable"; }],
    ["a02_status", "a02_state", (d) => { a02Result(d).execution_status = "completed"; }],
    ["a02_result", "a02_state", (d) => { a02Result(d).result = "available"; }],
    ["a02_runtime", "a02_state", (d) => { a02Result(d).actual_action = "attempted"; }],
  ];

  for (const [name, issue, mutate] of fixtures) {
    await t.test(name, () => assertFailedWith(validateMutation(mutate), issue));
  }
});

test("all evidence surfaces must remain canonically identical and phase-bound", async (t) => {
  const fixtures = [
    ["missing", (d) => { p03Result(d).evidence.indexes = []; }],
    ["extra", (d) => { p03Result(d).evidence_index.indexes.push(structuredClone(p03Result(d).evidence_index.indexes[0])); }],
    ["identity", (d) => { p03Onsite(d).structured_evidence_index.indexes[0].evidence_id += "-drift"; }],
    ["actor", (d) => { prebuild(d).evidence_index.indexes[0].actor_role = "drift"; }],
    ["time", (d) => { prebuild(d).evidence_index.indexes[0].observed_at = "2026-08-08T00:00:00+08:00"; }],
    ["slot", (d) => { prebuild(d).evidence_index.indexes[0].redacted_storage_slot = "drift"; }],
    ["phase", (d) => { prebuild(d).evidence_index.indexes[0].capture_phases = ["postbuild_gate"]; }],
    ["r10_subchecks", (d) => { p03Result(d).evidence.r10_subchecks = {}; }],
  ];

  for (const [name, mutate] of fixtures) {
    await t.test(name, () => {
      const report = validateMutation(mutate);
      assert.equal(report.validation_status, "failed");
      assert.equal(
        report.issue_codes.includes("p03_evidence_identity")
          || report.issue_codes.includes("p03_evidence_binding"),
        true,
      );
    });
  }
});

test("cross-document facts and every safe-stop claim are bound", async (t) => {
  const alignmentMutations = [
    ["action", (d) => { p03Onsite(d).actual_action += " drift"; }],
    ["result", (d) => { p03Onsite(d).actual_result += " drift"; }],
    ["time", (d) => { p03Onsite(d).actual_time = "2026-08-08T00:00:00+08:00"; }],
    ["executor", (d) => { p03Onsite(d).executor = "drift"; }],
    ["role", (d) => { p03Onsite(d).platform_account_role = "drift"; }],
    ["limitations", (d) => { p03Onsite(d).limitations += " drift"; }],
    ["verifier", (d) => { p03Onsite(d).verifier = "drift"; }],
  ];
  for (const [name, mutate] of alignmentMutations) {
    await t.test(`alignment_${name}`, () => {
      assertFailedWith(validateMutation(mutate), "p03_onsite_alignment");
    });
  }

  const stopMarkers = [
    ["actual_result", "已回退"],
    ["actual_result", "保持关闭"],
    ["actual_result", "未复制"],
    ["cleanup_result", "未发送"],
    ["actual_result", "未邀请"],
    ["actual_result", "未建立"],
    ["actual_result", "外部访问"],
    ["actual_result", "业务字段"],
    ["actual_result", "反馈归属"],
    ["actual_result", "关联关系"],
    ["actual_result", "等值"],
    ["limitations", "未完成"],
    ["actual_result", "第二身份"],
    ["actual_result", "受保护"],
    ["actual_result", "修改"],
    ["actual_result", "撤权"],
    ["actual_result", "刷新"],
    ["actual_result", "重登"],
    ["actual_result", "未执行"],
  ];
  for (const [field, marker] of stopMarkers) {
    await t.test(`safe_stop_${field}_${marker}`, () => {
      const report = validateMutation((documents) => {
        const before = p03Result(documents)[field];
        assert.equal(before.includes(marker), true);
        p03Result(documents)[field] = before.split(marker).join("【已记录】");
        assert.equal(p03Result(documents)[field].includes(marker), false);
        if (["actual_result", "limitations"].includes(field)) {
          p03Onsite(documents)[field] = p03Result(documents)[field];
        }
      });
      assertFailedWith(report, "safe_stop_claims");
    });
  }
});

test("synchronized semantic drift cannot preserve a fixed partial-blocked snapshot", async (t) => {
  const fixtures = [
    ["result_count_and_field_count", "p03_snapshot_drift", (documents) => {
      const before = p03Result(documents).actual_result;
      const after = before.replace(/1 条/gu, "2 条").replace(/3 个?字段/gu, "4 字段");
      assert.notEqual(after, before);
      p03Result(documents).actual_result = after;
      p03Onsite(documents).actual_result = after;
    }],
    ["owner_role_to_administrator", "p03_snapshot_drift", (documents) => {
      p03Result(documents).account_role = "administrator_role";
      p03Onsite(documents).platform_account_role = "administrator_role";
    }],
    ["actual_time_detached_from_evidence", "p03_snapshot_drift", (documents) => {
      const detachedTime = "2026-08-08T11:27:07+08:00";
      p03Result(documents).actual_time = detachedTime;
      p03Onsite(documents).actual_time = detachedTime;
    }],
    ["cleanup_copy_claim_reversed", "p03_snapshot_drift", (documents) => {
      const before = p03Result(documents).cleanup_result;
      const after = before.replace("未复制", "已复制但");
      assert.notEqual(after, before);
      p03Result(documents).cleanup_result = after;
    }],
    ["a02_logical_key", "a02_snapshot_drift", (documents) => {
      a02Result(documents).logical_key = "drifted_logical_key";
    }],
  ];

  for (const [name, issue, mutate] of fixtures) {
    await t.test(name, () => assertFailedWith(validateMutation(mutate), issue));
  }
});

test("forbidden extrapolation and sensitive values fail closed recursively", async (t) => {
  const extrapolations = [
    "P03 completed",
    "capability available",
    "capability restricted",
    "capability unavailable",
    "business_write_count=0",
    "formal_build_gate_open=true",
    "已接入企业真实数据",
    "系统已生产上线",
    "OpenAPI 调用成功",
    "真实业务收益已验证",
  ];
  for (const sentinel of extrapolations) {
    await t.test(`extrapolation_${sentinel}`, () => {
      const report = validateMutation((documents) => {
        p03Result(documents).limitations += ` ${sentinel}`;
        p03Onsite(documents).limitations += ` ${sentinel}`;
      });
      assertFailedWith(report, "downstream_projection_claim");
      assert.equal(JSON.stringify(report).includes(sentinel), false);
    });
  }

  const sensitive = [
    "https://sensitive.invalid/path",
    "user@example.invalid",
    "token=secret-sentinel",
    "app_id=secret-sentinel",
    "record_id=secret-sentinel",
    "locator=secret-sentinel",
    "provider raw error secret-sentinel",
  ];
  for (const sentinel of sensitive) {
    await t.test("sensitive_value", () => {
      const report = validateMutation((documents) => {
        p03Result(documents).limitations += ` ${sentinel}`;
      });
      assertFailedWith(report, "sensitive_value");
      assert.equal(JSON.stringify(report).includes(sentinel), false);
    });
  }
});

test("text and buffer transports reject duplicate keys, malformed JSON, invalid UTF-8, and oversize input", () => {
  const buffers = liveBuffers();
  const resultText = buffers.result.toString("utf8");
  const onsiteText = buffers.onsite.toString("utf8");
  const duplicate = resultText.replace(
    /^\{/u,
    '{"template_version":"duplicate",',
  );

  assertFailedWith(
    validateLiveP03PartialBlockedEvidenceTexts(duplicate, onsiteText),
    "duplicate_json_key",
  );
  assertFailedWith(
    validateLiveP03PartialBlockedEvidenceTexts("{", onsiteText),
    "invalid_json",
  );
  assertFailedWith(
    validateLiveP03PartialBlockedEvidenceTexts(`${resultText} trailing`, onsiteText),
    "invalid_json",
  );
  assertFailedWith(
    validateMutation((documents) => { documents.result.evidence = Number.NaN; }),
    "invalid_json",
  );
  assertFailedWith(
    validateLiveP03PartialBlockedEvidenceBuffers(Buffer.from([0xff]), buffers.onsite),
    "input_transport",
  );
  assertFailedWith(
    validateLiveP03PartialBlockedEvidenceBuffers(
      Buffer.alloc(LIVE_P03_PARTIAL_BLOCKED_MAX_BYTES + 1, 0x20),
      buffers.onsite,
    ),
    "input_transport",
  );
});

test("secure file validation rejects final-component symlinks and reads ordinary files", () => {
  const temporaryDirectory = realpathSync(
    mkdtempSync(join(tmpdir(), "p03-partial-blocked-")),
  );
  try {
    const buffers = liveBuffers();
    const resultPath = join(temporaryDirectory, "result.redacted.json");
    const onsitePath = join(temporaryDirectory, "onsite.redacted.json");
    const resultLink = join(temporaryDirectory, "result-link.redacted.json");
    writeFileSync(resultPath, buffers.result, { mode: 0o600 });
    writeFileSync(onsitePath, buffers.onsite, { mode: 0o600 });
    chmodSync(resultPath, 0o600);
    chmodSync(onsitePath, 0o600);
    symlinkSync(resultPath, resultLink);

    assert.equal(
      validateLiveP03PartialBlockedEvidenceFiles(
        resultPath,
        onsitePath,
        temporaryDirectory,
      ).validation_status,
      "passed",
    );
    assertFailedWith(
      validateLiveP03PartialBlockedEvidenceFiles(resultPath, onsitePath),
      "input_transport",
    );
    assertFailedWith(
      validateLiveP03PartialBlockedEvidenceFiles(
        resultLink,
        onsitePath,
        temporaryDirectory,
      ),
      "input_transport",
    );
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
});

test("secure file validation rejects a symlink in any parent component", () => {
  const temporaryDirectory = realpathSync(
    mkdtempSync(join(tmpdir(), "p03-parent-symlink-")),
  );
  try {
    const buffers = liveBuffers();
    const realDirectory = join(temporaryDirectory, "real");
    const linkedDirectory = join(temporaryDirectory, "linked");
    mkdirSync(realDirectory, { mode: 0o700 });
    const resultPath = join(realDirectory, "result.redacted.json");
    const onsitePath = join(realDirectory, "onsite.redacted.json");
    writeFileSync(resultPath, buffers.result, { mode: 0o600 });
    writeFileSync(onsitePath, buffers.onsite, { mode: 0o600 });
    symlinkSync(realDirectory, linkedDirectory);

    const report = validateLiveP03PartialBlockedEvidenceFiles(
      join(linkedDirectory, "result.redacted.json"),
      join(linkedDirectory, "onsite.redacted.json"),
      temporaryDirectory,
    );
    assertFailedWith(report, "input_transport");
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
});

test("secure file validation rejects a symlink above the declared trusted root", () => {
  const temporaryDirectory = realpathSync(
    mkdtempSync(join(tmpdir(), "p03-root-ancestor-symlink-")),
  );
  try {
    const buffers = liveBuffers();
    const realParent = join(temporaryDirectory, "real-parent");
    const realTrustedRoot = join(realParent, "trusted-root");
    const linkedParent = join(temporaryDirectory, "linked-parent");
    mkdirSync(realParent, { mode: 0o700 });
    mkdirSync(realTrustedRoot, { mode: 0o700 });
    const realResultPath = join(realTrustedRoot, "result.redacted.json");
    const realOnsitePath = join(realTrustedRoot, "onsite.redacted.json");
    writeFileSync(realResultPath, buffers.result, { mode: 0o600 });
    writeFileSync(realOnsitePath, buffers.onsite, { mode: 0o600 });
    symlinkSync(realParent, linkedParent);

    const linkedTrustedRoot = join(linkedParent, "trusted-root");
    const report = validateLiveP03PartialBlockedEvidenceFiles(
      join(linkedTrustedRoot, "result.redacted.json"),
      join(linkedTrustedRoot, "onsite.redacted.json"),
      linkedTrustedRoot,
    );
    assertFailedWith(report, "input_transport");
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
});

test("trusted-root containment rejects relative escape and sibling-prefix paths", () => {
  const temporaryDirectory = realpathSync(
    mkdtempSync(join(tmpdir(), "p03-trusted-root-containment-")),
  );
  try {
    const buffers = liveBuffers();
    const trustedRoot = join(temporaryDirectory, "trusted");
    const siblingRoot = join(temporaryDirectory, "trusted-sibling");
    mkdirSync(trustedRoot, { mode: 0o700 });
    mkdirSync(siblingRoot, { mode: 0o700 });
    const siblingResult = join(siblingRoot, "result.redacted.json");
    const siblingOnsite = join(siblingRoot, "onsite.redacted.json");
    writeFileSync(siblingResult, buffers.result, { mode: 0o600 });
    writeFileSync(siblingOnsite, buffers.onsite, { mode: 0o600 });

    assertFailedWith(
      validateLiveP03PartialBlockedEvidenceFiles(
        join(trustedRoot, "..", "trusted-sibling", "result.redacted.json"),
        join(trustedRoot, "..", "trusted-sibling", "onsite.redacted.json"),
        trustedRoot,
      ),
      "input_transport",
    );
    assertFailedWith(
      validateLiveP03PartialBlockedEvidenceFiles(
        siblingResult,
        siblingOnsite,
        trustedRoot,
      ),
      "input_transport",
    );
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
});

test("secure file validation rejects trusted-root and target casing aliases", () => {
  const temporaryDirectory = realpathSync(
    mkdtempSync(join(tmpdir(), "p03-case-alias-")),
  );
  try {
    const buffers = liveBuffers();
    const trustedRoot = join(temporaryDirectory, "TrustedRoot");
    const resultPath = join(trustedRoot, "Result.redacted.json");
    const onsitePath = join(trustedRoot, "Onsite.redacted.json");
    mkdirSync(trustedRoot, { mode: 0o700 });
    writeFileSync(resultPath, buffers.result, { mode: 0o600 });
    writeFileSync(onsitePath, buffers.onsite, { mode: 0o600 });

    const trustedRootAlias = join(temporaryDirectory, "trustedroot");
    assertFailedWith(
      validateLiveP03PartialBlockedEvidenceFiles(
        join(trustedRootAlias, "Result.redacted.json"),
        join(trustedRootAlias, "Onsite.redacted.json"),
        trustedRootAlias,
      ),
      "input_transport",
    );
    assertFailedWith(
      validateLiveP03PartialBlockedEvidenceFiles(
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

test("production secure file validation detects file and parent inode replacement during descriptor read", () => {
  const childSource = String.raw`
    import * as realFs from "node:fs";
    import { tmpdir } from "node:os";
    import { join } from "node:path";
    import { pathToFileURL } from "node:url";
    import { mock } from "node:test";

    const validatorPath = process.env.P03_VALIDATOR_PATH;
    const resultLivePath = process.env.P03_RESULT_LIVE_PATH;
    const onsiteLivePath = process.env.P03_ONSITE_LIVE_PATH;
    const resultBuffer = realFs.readFileSync(resultLivePath);
    const onsiteBuffer = realFs.readFileSync(onsiteLivePath);
    let activeScenario = null;
    mock.module("node:fs", {
      namedExports: {
        closeSync: realFs.closeSync,
        constants: realFs.constants,
        fstatSync: realFs.fstatSync,
        lstatSync: realFs.lstatSync,
        openSync: realFs.openSync,
        readFileSync(target, ...args) {
          if (typeof target === "number"
            && activeScenario !== null
            && !activeScenario.replacementPerformed) {
            activeScenario.replacementPerformed = true;
            activeScenario.replace();
          }
          return realFs.readFileSync(target, ...args);
        },
        readdirSync: realFs.readdirSync,
      },
    });

    const validator = await import(
      pathToFileURL(validatorPath).href + "?toctou=" + Date.now()
    );

    function runScenario(mode) {
      const temporaryDirectory = realFs.realpathSync(
        realFs.mkdtempSync(join(tmpdir(), "p03-inode-replacement-")),
      );
      try {
        const trustedRoot = join(temporaryDirectory, "trusted-root");
        const recordsDirectory = join(trustedRoot, "records");
        realFs.mkdirSync(trustedRoot, { mode: 0o700 });
        realFs.mkdirSync(recordsDirectory, { mode: 0o700 });
        const resultPath = join(recordsDirectory, "result.redacted.json");
        const onsitePath = join(recordsDirectory, "onsite.redacted.json");
        const replacementPath = join(trustedRoot, "replacement.redacted.json");
        realFs.writeFileSync(resultPath, resultBuffer, { mode: 0o600 });
        realFs.writeFileSync(onsitePath, onsiteBuffer, { mode: 0o600 });
        realFs.writeFileSync(replacementPath, resultBuffer, { mode: 0o600 });
        activeScenario = {
          replacementPerformed: false,
          replace() {
            if (mode === "file") {
              realFs.renameSync(replacementPath, resultPath);
              return;
            }
            const oldRecordsDirectory = join(trustedRoot, "records-old");
            realFs.renameSync(recordsDirectory, oldRecordsDirectory);
            realFs.mkdirSync(recordsDirectory, { mode: 0o700 });
            realFs.writeFileSync(resultPath, resultBuffer, { mode: 0o600 });
            realFs.writeFileSync(onsitePath, onsiteBuffer, { mode: 0o600 });
          },
        };
        const report = validator.validateLiveP03PartialBlockedEvidenceFiles(
          resultPath,
          onsitePath,
          trustedRoot,
        );
        return {
          replacement_performed: activeScenario.replacementPerformed,
          validation_status: report.validation_status,
          input_transport: report.issue_codes.includes("input_transport"),
        };
      } finally {
        activeScenario = null;
        realFs.rmSync(temporaryDirectory, { recursive: true, force: true });
      }
    }

    const fileReplacement = runScenario("file");
    const parentReplacement = runScenario("parent");
    const passed = [fileReplacement, parentReplacement].every((result) => (
      result.replacement_performed
        && result.validation_status === "failed"
        && result.input_transport
    ));
    process.stdout.write(JSON.stringify({
      file_replacement: fileReplacement,
      parent_replacement: parentReplacement,
    }));
    process.exitCode = passed ? 0 : 1;
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
      P03_VALIDATOR_PATH: scriptPath,
      P03_RESULT_LIVE_PATH: resultLivePath,
      P03_ONSITE_LIVE_PATH: onsiteLivePath,
    },
  });
  assert.equal(execution.status, 0, execution.stderr);
  assert.equal(execution.stderr, "");
  assert.deepEqual(JSON.parse(execution.stdout), {
    file_replacement: {
      replacement_performed: true,
      validation_status: "failed",
      input_transport: true,
    },
    parent_replacement: {
      replacement_performed: true,
      validation_status: "failed",
      input_transport: true,
    },
  });
});

test("the production module exposes no injectable secure-read hook", async () => {
  const validatorModule = await import(
    "../../feishu/scripts/validate-live-p03-partial-blocked-evidence.mjs"
  );
  assert.equal(
    Object.hasOwn(
      validatorModule,
      "validateLiveP03PartialBlockedEvidenceFilesForTest",
    ),
    false,
  );
});

test("the fixed snapshot remains readable from a real trusted root", () => {
  const temporaryDirectory = realpathSync(
    mkdtempSync(join(tmpdir(), "p03-real-trusted-root-")),
  );
  try {
    const buffers = liveBuffers();
    const resultPath = join(temporaryDirectory, "result.redacted.json");
    const onsitePath = join(temporaryDirectory, "onsite.redacted.json");
    writeFileSync(resultPath, buffers.result, { mode: 0o600 });
    writeFileSync(onsitePath, buffers.onsite, { mode: 0o600 });
    const report = validateLiveP03PartialBlockedEvidenceFiles(
      resultPath,
      onsitePath,
      temporaryDirectory,
    );
    assert.equal(report.validation_status, "passed");
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
});

test("serializer rejects extra keys, forged values, and unknown issue codes", () => {
  const documents = liveDocuments();
  const report = validateLiveP03PartialBlockedEvidenceDocuments(documents.result, documents.onsite);

  assert.throws(
    () => serializeLiveP03PartialBlockedEvidenceReport({ ...report, extra: true }),
    /report/u,
  );
  assert.throws(
    () => serializeLiveP03PartialBlockedEvidenceReport({ ...report, formal_build_gate_open: true }),
    /report/u,
  );
  assert.throws(
    () => serializeLiveP03PartialBlockedEvidenceReport({ ...report, issue_codes: ["unknown"] }),
    /report/u,
  );
});

for (const [field, forgedValue] of [
  ["business_write_count", 0],
  ["observation_truth_machine_verified", true],
  ["p03_completion_verified", true],
  ["a02_not_tested_verified", false],
]) {
  test(`serializer rejects forged ${field}`, () => {
    const documents = liveDocuments();
    const report = validateLiveP03PartialBlockedEvidenceDocuments(
      documents.result,
      documents.onsite,
    );

    assert.throws(
      () => serializeLiveP03PartialBlockedEvidenceReport({
        ...report,
        [field]: forgedValue,
      }),
      /report/u,
    );
  });
}

test("the fixed-path CLI emits only the fixed report and succeeds for the live snapshots", () => {
  const execution = spawnSync(process.execPath, [scriptPath], {
    cwd: resolve(import.meta.dirname, "../.."),
    encoding: "utf8",
  });
  assert.equal(execution.status, 0, execution.stderr);
  assert.equal(execution.stderr, "");
  const report = JSON.parse(execution.stdout);
  assert.deepEqual(Object.keys(report), reportKeys);
  assert.equal(report.validation_status, "passed");
  assert.equal(execution.stdout.includes("owner_operator"), false);
  assert.equal(execution.stdout.includes("controlled-slot"), false);
});

test("the fixed-path CLI rejects every path or mode argument without echoing it", () => {
  const sentinel = "do-not-echo-sensitive-path";
  const execution = spawnSync(process.execPath, [scriptPath, sentinel], {
    cwd: resolve(import.meta.dirname, "../.."),
    encoding: "utf8",
  });
  assert.equal(execution.status, 1);
  assert.equal(execution.stderr, "");
  const report = JSON.parse(execution.stdout);
  assertFailedWith(report, "cli_arguments_forbidden");
  assert.equal(execution.stdout.includes(sentinel), false);
});
