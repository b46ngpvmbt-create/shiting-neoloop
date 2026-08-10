import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  access,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test, { after, before } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  FIXTURE_BUNDLE_SHA256,
  SyntheticEvidenceBaselineError,
  buildSyntheticEvidenceBaseline,
  serializeSyntheticEvidenceBaseline,
  writeSyntheticEvidenceBaseline,
} from "../../evaluation/synthetic-evidence-baseline.mjs";

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(TEST_DIR, "../..");
const BASELINE_MODULE_URL = pathToFileURL(resolve(
  REPO,
  "evaluation/synthetic-evidence-baseline.mjs",
)).href;
const EXPECTED_FIXTURE_BUNDLE_SHA256 = "4f0583613736dc60f25f3632d3b734583caf995242de21c22b86c2ccc144b26e";
const EXPECTED_TOP_LEVEL_KEYS = [
  "artifact_scope",
  "data_scope",
  "digest_contract",
  "evidence_class",
  "fixture",
  "measured_checks",
  "populations",
  "report_digest_sha256",
  "resolver_matrix",
  "run_contract",
  "safety_boundaries",
  "schema_version",
  "unmeasured_metrics",
];
const EXPECTED_METRICS = [
  "p0_p1_risk_recall",
  "failure_drill_safe_path_rate",
  "crossover_20x2_elapsed_seconds",
  "efficiency_improvement_ratio",
  "cost_reduction_ratio",
  "quality_improvement_ratio",
  "revenue_uplift_ratio",
  "roi",
];

let report;

function canonicalJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((entry) => canonicalJson(entry)).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function refreshToolchainAndReportDigests(value) {
  value.run_contract.runtime.toolchain_digest_sha256 = sha256(canonicalJson({
    node_version: value.run_contract.runtime.node_version,
    node_runtime_supported: value.run_contract.runtime.node_runtime_supported,
    node_engine_contract: value.run_contract.runtime.node_engine_contract,
    typescript_version: value.run_contract.runtime.typescript_version,
    node_types_version: value.run_contract.runtime.node_types_version,
    undici_types_version: value.run_contract.runtime.undici_types_version,
    resolver_build_input_digest_sha256: value.run_contract.resolver_build.input_digest_sha256,
    emitted_js_bundle_sha256: value.run_contract.resolver_build.emitted_js_bundle_sha256,
  }));
  const { report_digest_sha256: ignored, ...digestInput } = value;
  void ignored;
  value.report_digest_sha256 = sha256(canonicalJson(digestInput));
}

async function createIsolatedProjectCopy(context, label) {
  const root = await mkdtemp(join(resolve(tmpdir()), `neoloop-eval-${label}-`));
  context.after(async () => {
    await rm(root, { recursive: true, force: true });
  });
  await mkdir(resolve(root, "node_modules/@types"), { recursive: true });
  await Promise.all([
    cp(resolve(REPO, "src/neoloop"), resolve(root, "src/neoloop"), { recursive: true }),
    cp(resolve(REPO, "data/canonical"), resolve(root, "data/canonical"), { recursive: true }),
    cp(resolve(REPO, "node_modules/typescript"), resolve(root, "node_modules/typescript"), { recursive: true }),
    cp(resolve(REPO, "node_modules/@types/node"), resolve(root, "node_modules/@types/node"), { recursive: true }),
    cp(resolve(REPO, "node_modules/undici-types"), resolve(root, "node_modules/undici-types"), { recursive: true }),
  ]);
  await cp(resolve(REPO, "package.json"), resolve(root, "package.json"));
  return root;
}

function runMockedModuleChild(script, arguments_) {
  return spawnSync(
    process.execPath,
    [
      "--no-warnings",
      "--experimental-test-module-mocks",
      "--input-type=module",
      "-e",
      script,
      ...arguments_,
    ],
    {
      cwd: REPO,
      encoding: "utf8",
      env: {
        LANG: "C",
        LC_ALL: "C",
        NODE_OPTIONS: "",
        NO_COLOR: "1",
        PATH: "",
        TZ: "UTC",
      },
      timeout: 30_000,
      maxBuffer: 1_048_576,
    },
  );
}

before(async () => {
  report = await buildSyntheticEvidenceBaseline({ projectRoot: REPO });
});

after(() => {
  report = undefined;
});

test("baseline pins the exact synthetic fixture bundle without changing canonical data", () => {
  assert.equal(FIXTURE_BUNDLE_SHA256, EXPECTED_FIXTURE_BUNDLE_SHA256);
  assert.deepEqual(Object.keys(report).sort(), EXPECTED_TOP_LEVEL_KEYS);
  assert.equal(report.schema_version, "neoloop.synthetic_evidence_baseline.v1");
  assert.equal(report.data_scope, "synthetic_experiment");
  assert.equal(report.evidence_class, "synthetic_experiment");
  assert.equal(report.artifact_scope, "local_synthetic_contract_evidence");
  assert.equal(report.fixture.bundle_sha256, EXPECTED_FIXTURE_BUNDLE_SHA256);
  assert.deepEqual(report.fixture.files, [
    {
      path: "data/canonical/adversarial/safety-adversarial.json",
      sha256: "b02653a5c1998412ab69ea0e6e85947aaafa60e6cd26ceb33c95a8e94f7ec8c9",
    },
    {
      path: "data/canonical/gold/case-gold.json",
      sha256: "8416d7b21ea165865fbe86802ee9e7d1b3845b7b6f43b0df20f2d26ba9dc5e9d",
    },
    {
      path: "data/canonical/scenarios/failure-drills.json",
      sha256: "c8893a7a706f1b3a8051d16b855a35372690bbc780ca060cb8768219dbc0312a",
    },
    {
      path: "data/canonical/scenarios/main-story.json",
      sha256: "1584fceecbfbbf4d63eee9ac69ed998505985d0f51a4a1b508d28976dcce690c",
    },
  ]);
});

test("baseline derives population truth without treating draft labels or unrun drills as observations", () => {
  assert.deepEqual(report.populations, {
    gold_records: 20,
    gold_human_reviewed_records: 0,
    adversarial_records: 16,
    main_story_records: 1,
    main_story_run_records: 0,
    failure_drills: 4,
    failure_drills_run: 0,
    crossover_planned_inputs: 20,
    crossover_planned_arms_per_input: 2,
    crossover_completed_runs: 0,
  });
});

test("resolver matrix executes both targets across zero, one, and two matches with no business write", () => {
  assert.equal(report.resolver_matrix.length, 6);
  assert.deepEqual(
    report.resolver_matrix.map((row) => [row.target, row.scenario]),
    [
      ["clusters", "zero_match"],
      ["clusters", "single_match"],
      ["clusters", "multiple_match"],
      ["improvements", "zero_match"],
      ["improvements", "single_match"],
      ["improvements", "multiple_match"],
    ],
  );

  for (const row of report.resolver_matrix) {
    assert.deepEqual(Object.keys(row).sort(), [
      "business_write_count",
      "classification",
      "executor_call_count",
      "expected_match_count",
      "observed_match_count",
      "passed",
      "private_consumer_call_count",
      "public_sensitive_material_count",
      "scenario",
      "target",
    ]);
    assert.equal(row.expected_match_count, row.observed_match_count);
    assert.equal(row.business_write_count, 0);
    assert.equal(row.executor_call_count, 0);
    assert.equal(row.public_sensitive_material_count, 0);
    assert.equal(row.passed, true);
    assert.equal(row.private_consumer_call_count, row.scenario === "single_match" ? 1 : 0);
    assert.equal(
      row.classification,
      row.scenario === "single_match" ? "exact_single_match" : "projection_conflict",
    );
  }
  assert.deepEqual(report.measured_checks.resolver_safe_matrix, {
    status: "measured",
    value: true,
    passed: 6,
    total: 6,
  });
});

test("run contract binds the local toolchain and resolver build inputs without claiming wall-clock time", () => {
  assert.deepEqual(Object.keys(report.run_contract).sort(), [
    "clock_policy",
    "command_class",
    "evaluation_status",
    "exit_code",
    "matrix_sample_count",
    "output_directory_bound_to_digest",
    "resolver_build",
    "run_kind",
    "runtime",
  ]);
  assert.deepEqual(report.run_contract, {
    run_kind: "local_synthetic_reproducible",
    command_class: "local_readonly_evaluation",
    evaluation_status: "completed",
    exit_code: 0,
    runtime: {
      node_version: process.version,
      node_runtime_supported: true,
      node_engine_contract: ">=22.13.0",
      typescript_version: "5.9.3",
      node_types_version: "22.19.19",
      undici_types_version: "6.21.0",
      toolchain_digest_sha256: report.run_contract.runtime.toolchain_digest_sha256,
    },
    resolver_build: {
      compiler_mode: "typescript_nodenext_es2022_strict",
      input_binding_contract: "captured_source_compiler_types_and_emitted_js.v1",
      source_file_count: 42,
      source_digest_sha256: "6449d479841fde1169ec522d88c8487a06b209b795c717bed1b46bfe6e703fe0",
      compiler_and_type_input_file_count: 214,
      compiler_and_type_inputs_digest_sha256: "84d5e928f49c7a5775bd190017266d330313fb217f6bb975567c3afef2a98a7b",
      project_package_metadata_sha256: "85983a5b4558118f2d2f5f5cc8a2f351f0062b72b28e572a5d24ba7c018eef79",
      compiler_entry_sha256: "2cffde0b8c6760dfb0b5b0382bbb7e00ba6a8b2d981b9205b256a700a481d983",
      compiler_bundle_sha256: "e8f349eabd48486bdb2bf9dc1a00c89d58297270c54b745838879e2859194419",
      typescript_package_metadata_sha256: "822ef7ca6452205657b6288b066481ecf508bfbf43455d715cf7d3ec457561e6",
      node_types_package_metadata_sha256: "ba8f6326a685af9e7dce89a99f55e0dc3cef450046acf00a20f7cb673562f581",
      undici_types_package_metadata_sha256: "11f873b423b96a5ad444a099685ca6b9de1379dcd83fd8d368e757ddb53658e4",
      input_digest_sha256: "90c7f987918297ae70d0cc76cfa79522cffe521b3239e670bc2194b5f0ce246f",
      emitted_js_file_count: 42,
      emitted_js_bundle_sha256: "865addb7141a3dd80cdcefc0feeafe16bf9ffce0e573a4f98da11e9b0c126511",
      resolver_emitted_js_sha256: "71a62593a4c5706b8d192f21434c748de6e680dd6d3b167b9da837c3964ba755",
    },
    clock_policy: {
      clock_mode: "excluded_from_digest",
      observed_at: null,
      execution_time_claimed: false,
    },
    matrix_sample_count: 6,
    output_directory_bound_to_digest: false,
  });
  assert.match(report.run_contract.runtime.toolchain_digest_sha256, /^[a-f0-9]{64}$/u);
});

test("all unrun or unreviewed quality, timing, and business metrics stay not_measured and null", () => {
  assert.deepEqual(report.unmeasured_metrics.map((metric) => metric.metric), EXPECTED_METRICS);
  for (const metric of report.unmeasured_metrics) {
    assert.deepEqual(Object.keys(metric).sort(), ["metric", "reason_code", "status", "unit", "value"]);
    assert.equal(metric.status, "not_measured");
    assert.equal(metric.value, null);
    assert.equal(typeof metric.reason_code, "string");
    assert.ok(metric.reason_code.length > 0);
  }
  assert.equal(report.safety_boundaries.business_outcome_claimed, false);
});

test("same inputs produce the same report digest", async () => {
  const repeated = await buildSyntheticEvidenceBaseline({ projectRoot: REPO });
  assert.equal(repeated.report_digest_sha256, report.report_digest_sha256);
  assert.equal(serializeSyntheticEvidenceBaseline(repeated), serializeSyntheticEvidenceBaseline(report));
});

test("serializer fails closed on schema drift and any measured-value fabrication", () => {
  const withExtraKey = structuredClone(report);
  withExtraKey.extra = true;
  assert.throws(
    () => serializeSyntheticEvidenceBaseline(withExtraKey),
    (error) => error instanceof SyntheticEvidenceBaselineError && error.code === "invalid_report_schema",
  );

  const fabricatedRecall = structuredClone(report);
  fabricatedRecall.unmeasured_metrics[0].status = "measured";
  fabricatedRecall.unmeasured_metrics[0].value = 1;
  assert.throws(
    () => serializeSyntheticEvidenceBaseline(fabricatedRecall),
    (error) => error instanceof SyntheticEvidenceBaselineError && error.code === "invalid_unmeasured_metric",
  );

  const fabricatedWrite = structuredClone(report);
  fabricatedWrite.resolver_matrix[0].business_write_count = 1;
  assert.throws(
    () => serializeSyntheticEvidenceBaseline(fabricatedWrite),
    (error) => error instanceof SyntheticEvidenceBaselineError && error.code === "invalid_resolver_matrix",
  );

  for (const mutate of [
    (candidate) => { candidate.measured_checks.fixture_integrity.status = "not_measured"; },
    (candidate) => { candidate.measured_checks.fixture_integrity.value = false; },
    (candidate) => { candidate.measured_checks.resolver_safe_matrix.status = "not_measured"; },
    (candidate) => { candidate.measured_checks.resolver_safe_matrix.value = false; },
    (candidate) => { candidate.measured_checks.resolver_safe_matrix.passed = 5; },
    (candidate) => { candidate.measured_checks.resolver_safe_matrix.total = 5; },
  ]) {
    const candidate = structuredClone(report);
    mutate(candidate);
    assert.throws(
      () => serializeSyntheticEvidenceBaseline(candidate),
      (error) => error instanceof SyntheticEvidenceBaselineError && error.code === "invalid_measured_checks",
    );
  }

  for (const mutate of [
    (candidate) => { candidate.resolver_matrix[0].observed_match_count = 1; },
    (candidate) => { candidate.resolver_matrix[0].classification = "exact_single_match"; },
    (candidate) => { candidate.resolver_matrix[0].private_consumer_call_count = 1; },
    (candidate) => { candidate.resolver_matrix[0].executor_call_count = 1; },
    (candidate) => { candidate.resolver_matrix[0].public_sensitive_material_count = 1; },
    (candidate) => { candidate.resolver_matrix[0].passed = false; },
  ]) {
    const candidate = structuredClone(report);
    mutate(candidate);
    assert.throws(
      () => serializeSyntheticEvidenceBaseline(candidate),
      (error) => error instanceof SyntheticEvidenceBaselineError && error.code === "invalid_resolver_matrix",
    );
  }

  const runContractUnknownKey = structuredClone(report);
  runContractUnknownKey.run_contract.unknown = true;
  assert.throws(
    () => serializeSyntheticEvidenceBaseline(runContractUnknownKey),
    (error) => error instanceof SyntheticEvidenceBaselineError && error.code === "invalid_run_contract",
  );

  const runStatusDrift = structuredClone(report);
  runStatusDrift.run_contract.evaluation_status = "not_run";
  assert.throws(
    () => serializeSyntheticEvidenceBaseline(runStatusDrift),
    (error) => error instanceof SyntheticEvidenceBaselineError && error.code === "invalid_run_contract",
  );

  const toolchainDigestDrift = structuredClone(report);
  toolchainDigestDrift.run_contract.runtime.toolchain_digest_sha256 = "0".repeat(64);
  const {
    report_digest_sha256: ignoredToolchainDigest,
    ...toolchainDigestInput
  } = toolchainDigestDrift;
  void ignoredToolchainDigest;
  toolchainDigestDrift.report_digest_sha256 = sha256(canonicalJson(toolchainDigestInput));
  assert.throws(
    () => serializeSyntheticEvidenceBaseline(toolchainDigestDrift),
    (error) => error instanceof SyntheticEvidenceBaselineError && error.code === "invalid_run_contract",
  );

  const emittedBuildDigestDrift = structuredClone(report);
  emittedBuildDigestDrift.run_contract.resolver_build.emitted_js_bundle_sha256 = "0".repeat(64);
  refreshToolchainAndReportDigests(emittedBuildDigestDrift);
  assert.throws(
    () => serializeSyntheticEvidenceBaseline(emittedBuildDigestDrift),
    (error) => error instanceof SyntheticEvidenceBaselineError && error.code === "invalid_run_contract",
  );

  const digestDrift = structuredClone(report);
  digestDrift.report_digest_sha256 = "0".repeat(64);
  assert.throws(
    () => serializeSyntheticEvidenceBaseline(digestDrift),
    (error) => error instanceof SyntheticEvidenceBaselineError && error.code === "invalid_report_digest",
  );
});

test("runtime gate rejects Node 22.12.9 and accepts the exact lower bound 22.13.0", () => {
  const unsupported = structuredClone(report);
  unsupported.run_contract.runtime.node_version = "v22.12.9";
  unsupported.run_contract.runtime.node_runtime_supported = true;
  refreshToolchainAndReportDigests(unsupported);
  assert.throws(
    () => serializeSyntheticEvidenceBaseline(unsupported),
    (error) => error instanceof SyntheticEvidenceBaselineError && error.code === "invalid_run_contract",
  );

  const lowerBound = structuredClone(report);
  lowerBound.run_contract.runtime.node_version = "v22.13.0";
  lowerBound.run_contract.runtime.node_runtime_supported = true;
  refreshToolchainAndReportDigests(lowerBound);
  assert.doesNotThrow(() => serializeSyntheticEvidenceBaseline(lowerBound));
});

test("serialized public artifact excludes private runtime material, provider text, resource ids, accounts, and URLs", () => {
  const serialized = serializeSyntheticEvidenceBaseline(report);
  for (const forbiddenText of [
    "PRIVATE-",
    "provider_record",
    "raw_provider",
    "record_id",
    "base_id",
    "table_id",
    "app_id",
    "field_id",
    "http://",
    "https://",
    "@qq.com",
  ]) {
    assert.equal(serialized.includes(forbiddenText), false, forbiddenText);
  }
  assert.match(report.report_digest_sha256, /^[a-f0-9]{64}$/u);
});

test("fixture byte drift is rejected before resolver execution", async (context) => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "neoloop-eval-fixture-drift-"));
  context.after(async () => {
    const { rm } = await import("node:fs/promises");
    await rm(temporaryRoot, { recursive: true, force: true });
  });
  await cp(resolve(REPO, "data/canonical"), resolve(temporaryRoot, "data/canonical"), { recursive: true });
  const goldPath = resolve(temporaryRoot, "data/canonical/gold/case-gold.json");
  const gold = JSON.parse(await readFile(goldPath, "utf8"));
  gold.disclaimer = `${gold.disclaimer} drift`;
  await writeFile(goldPath, `${JSON.stringify(gold, null, 2)}\n`, "utf8");

  await assert.rejects(
    buildSyntheticEvidenceBaseline({ projectRoot: temporaryRoot }),
    (error) => error instanceof SyntheticEvidenceBaselineError && error.code === "fixture_bundle_mismatch",
  );
});

test("writer rejects project-root, internal, relative, and symlink output paths before creation", async (context) => {
  const nonexistentInternalParent = resolve(REPO, "tests/data/.forbidden-output-parent");
  const nonexistentInternalOutput = resolve(nonexistentInternalParent, "run");
  await assert.rejects(access(nonexistentInternalParent));

  for (const [trustedOutputRoot, outputDirectory, expectedCode] of [
    [resolve(REPO, ".."), REPO, "output_directory_inside_project"],
    [resolve(REPO, "tests/data"), nonexistentInternalOutput, "output_directory_inside_project"],
    [resolve(REPO, ".."), "relative-output", "invalid_output_directory"],
  ]) {
    await assert.rejects(
      writeSyntheticEvidenceBaseline({ projectRoot: REPO, trustedOutputRoot, outputDirectory }),
      (error) => error instanceof SyntheticEvidenceBaselineError && error.code === expectedCode,
    );
  }
  await assert.rejects(access(nonexistentInternalParent));

  const realTrustedRoot = await mkdtemp(resolve(REPO, "../neoloop-eval-real-root-"));
  const linkedTrustedRoot = `${realTrustedRoot}-link`;
  context.after(async () => {
    await rm(linkedTrustedRoot, { force: true });
    await rm(realTrustedRoot, { recursive: true, force: true });
  });
  await symlink(realTrustedRoot, linkedTrustedRoot);
  await assert.rejects(
    writeSyntheticEvidenceBaseline({
      projectRoot: REPO,
      trustedOutputRoot: linkedTrustedRoot,
      outputDirectory: resolve(linkedTrustedRoot, "run"),
    }),
    (error) => error instanceof SyntheticEvidenceBaselineError && error.code === "untrusted_output_root",
  );
  await assert.rejects(access(resolve(realTrustedRoot, "run")));

  const nestedOutput = resolve(realTrustedRoot, "nested/run");
  await assert.rejects(
    writeSyntheticEvidenceBaseline({
      projectRoot: REPO,
      trustedOutputRoot: realTrustedRoot,
      outputDirectory: nestedOutput,
    }),
    (error) => error instanceof SyntheticEvidenceBaselineError && error.code === "invalid_output_directory",
  );
  await assert.rejects(access(resolve(realTrustedRoot, "nested")));

  const caseParent = await mkdtemp(resolve(REPO, "../neoloop-eval-case-root-"));
  const exactCaseRoot = resolve(caseParent, "TrustedOutputs");
  const wrongCaseRoot = resolve(caseParent, "trustedoutputs");
  context.after(async () => {
    await rm(caseParent, { recursive: true, force: true });
  });
  await mkdir(exactCaseRoot);
  await assert.rejects(
    writeSyntheticEvidenceBaseline({
      projectRoot: REPO,
      trustedOutputRoot: wrongCaseRoot,
      outputDirectory: resolve(wrongCaseRoot, "run"),
    }),
    (error) => error instanceof SyntheticEvidenceBaselineError && error.code === "untrusted_output_root",
  );
  await assert.rejects(access(resolve(exactCaseRoot, "run")));
});

test("writer permits an external adjacent-prefix direct child and writes one verified artifact", async (context) => {
  const trustedOutputRoot = await mkdtemp(resolve(REPO, "../shiting-neoloop-output-root-"));
  const outputDirectory = resolve(trustedOutputRoot, "shiting-neoloop-adjacent-output");
  context.after(async () => {
    await rm(trustedOutputRoot, { recursive: true, force: true });
  });
  const result = await writeSyntheticEvidenceBaseline({
    projectRoot: REPO,
    trustedOutputRoot,
    outputDirectory,
  });
  assert.deepEqual(result, {
    output_location_class: "trusted_outputs_direct_child",
    artifact_file: "synthetic-evidence-baseline-v1.json",
    report_digest_sha256: report.report_digest_sha256,
    artifact_sha256: result.artifact_sha256,
  });
  assert.equal(
    await readFile(resolve(outputDirectory, result.artifact_file), "utf8"),
    serializeSyntheticEvidenceBaseline(report),
  );
});

test("CLI writes only below workspace outputs and never echoes a sensitive directory name", async (context) => {
  const sensitiveBasename = "PRIVATE-provider-record-2718275274@qq.com";
  const outputDirectory = resolve(REPO, "../../outputs", sensitiveBasename);
  context.after(async () => {
    await rm(outputDirectory, { recursive: true, force: true });
  });
  await rm(outputDirectory, { recursive: true, force: true });
  const result = spawnSync(
    process.execPath,
    [resolve(REPO, "evaluation/synthetic-evidence-baseline.mjs"), "--output-dir", outputDirectory],
    { cwd: REPO, encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, "");
  assert.equal(result.stdout.includes(sensitiveBasename), false);
  assert.equal(result.stdout.includes(outputDirectory), false);
  const publicResult = JSON.parse(result.stdout);
  assert.deepEqual(Object.keys(publicResult).sort(), [
    "artifact_file",
    "artifact_sha256",
    "output_location_class",
    "report_digest_sha256",
    "status",
  ]);
  assert.equal(publicResult.output_location_class, "workspace_outputs_direct_child");
  assert.equal(publicResult.artifact_file, "synthetic-evidence-baseline-v1.json");

  const outsideTrustedRoot = await mkdtemp(resolve(REPO, "../neoloop-eval-cli-outside-"));
  const outsideOutput = resolve(outsideTrustedRoot, sensitiveBasename);
  context.after(async () => {
    await rm(outsideTrustedRoot, { recursive: true, force: true });
  });
  const rejected = spawnSync(
    process.execPath,
    [resolve(REPO, "evaluation/synthetic-evidence-baseline.mjs"), "--output-dir", outsideOutput],
    { cwd: REPO, encoding: "utf8" },
  );
  assert.equal(rejected.status, 1);
  assert.equal(rejected.stdout, "");
  assert.equal(rejected.stderr.includes(sensitiveBasename), false);
  assert.deepEqual(JSON.parse(rejected.stderr), {
    status: "failed",
    code: "invalid_output_directory",
  });
  await assert.rejects(access(outsideOutput));
});

test("production builder rejects arbitrary test callbacks without invoking them", async () => {
  let callbackCalls = 0;
  await assert.rejects(
    buildSyntheticEvidenceBaseline({
      projectRoot: REPO,
      afterInputSnapshot() {
        callbackCalls += 1;
      },
    }),
    (error) => error instanceof SyntheticEvidenceBaselineError && error.code === "invalid_project_root",
  );
  assert.equal(callbackCalls, 0);
});

test("captured source bytes remain the compiled input after the original path changes", async (context) => {
  const projectRoot = await createIsolatedProjectCopy(context, "source-swap");
  const sourcePath = resolve(projectRoot, "src/neoloop/adapters/feishu/w6-business-selector-resolver.ts");
  const originalBytes = await readFile(sourcePath, "utf8");
  const child = runMockedModuleChild(String.raw`
    import { spawnSync as realSpawnSync } from "node:child_process";
    import { readFileSync, writeFileSync } from "node:fs";
    import { mock } from "node:test";

    const [moduleUrl, projectRoot, sourcePath] = process.argv.slice(1);
    let compilerCalls = 0;
    mock.module("node:child_process", {
      namedExports: {
        spawnSync(command, args, options) {
          compilerCalls += 1;
          if (compilerCalls === 1) {
            writeFileSync(
              sourcePath,
              readFileSync(sourcePath, "utf8") + "\n// post-capture source drift\n",
              "utf8",
            );
          }
          return realSpawnSync(command, args, options);
        },
      },
    });
    const { buildSyntheticEvidenceBaseline } = await import(moduleUrl);
    const report = await buildSyntheticEvidenceBaseline({ projectRoot });
    process.stdout.write(JSON.stringify({
      compiler_calls: compilerCalls,
      report_digest_sha256: report.report_digest_sha256,
      source_digest_sha256: report.run_contract.resolver_build.source_digest_sha256,
      emitted_js_bundle_sha256: report.run_contract.resolver_build.emitted_js_bundle_sha256,
    }));
  `, [BASELINE_MODULE_URL, projectRoot, sourcePath]);
  assert.equal(child.status, 0, child.stderr);
  assert.equal(child.stderr, "");
  const observed = JSON.parse(child.stdout);
  assert.deepEqual(observed, {
    compiler_calls: 1,
    report_digest_sha256: report.report_digest_sha256,
    source_digest_sha256: report.run_contract.resolver_build.source_digest_sha256,
    emitted_js_bundle_sha256: report.run_contract.resolver_build.emitted_js_bundle_sha256,
  });
  assert.equal(await readFile(sourcePath, "utf8"), `${originalBytes}\n// post-capture source drift\n`);
});

test("compiler timeout fails closed with fixed execution limits and no raw output", () => {
  const child = runMockedModuleChild(String.raw`
    import { mock } from "node:test";

    const [moduleUrl, projectRoot] = process.argv.slice(1);
    let observed;
    mock.module("node:child_process", {
      namedExports: {
        spawnSync(command, args, options) {
          observed = {
            command_is_process_exec_path: command === process.execPath,
            timeout_ms: options.timeout,
            max_buffer_bytes: options.maxBuffer,
            node_options_cleared: options.env.NODE_OPTIONS === "",
            path_cleared: options.env.PATH === "",
          };
          return {
            error: Object.assign(new Error("PRIVATE-provider-timeout"), { code: "ETIMEDOUT" }),
            signal: "SIGTERM",
            status: null,
            stdout: "PRIVATE-provider-stdout",
            stderr: "PRIVATE-provider-stderr",
          };
        },
      },
    });
    const { buildSyntheticEvidenceBaseline, SyntheticEvidenceBaselineError } = await import(moduleUrl);
    let code = "unexpected_success";
    try {
      await buildSyntheticEvidenceBaseline({ projectRoot });
    } catch (error) {
      code = error instanceof SyntheticEvidenceBaselineError ? error.code : "unexpected_error";
    }
    process.stdout.write(JSON.stringify({ code, observed }));
  `, [BASELINE_MODULE_URL, REPO]);
  assert.equal(child.status, 0, child.stderr);
  assert.equal(child.stderr, "");
  assert.equal(child.stdout.includes("PRIVATE-"), false);
  assert.deepEqual(JSON.parse(child.stdout), {
    code: "resolver_build_failed",
    observed: {
      command_is_process_exec_path: true,
      timeout_ms: 30_000,
      max_buffer_bytes: 1_048_576,
      node_options_cleared: true,
      path_cleared: true,
    },
  });
});

test("compiler byte drift is rejected before execution", async (context) => {
  const projectRoot = await createIsolatedProjectCopy(context, "fake-compiler");
  const compilerBundle = resolve(projectRoot, "node_modules/typescript/lib/_tsc.js");
  await writeFile(compilerBundle, "process.exit(0);\n", "utf8");
  await assert.rejects(
    buildSyntheticEvidenceBaseline({ projectRoot }),
    (error) => error instanceof SyntheticEvidenceBaselineError && error.code === "compiler_integrity_mismatch",
  );
});

test("captured type declaration byte drift is rejected before compiler execution", async (context) => {
  const projectRoot = await createIsolatedProjectCopy(context, "type-declaration-drift");
  const declarationPath = resolve(projectRoot, "node_modules/@types/node/index.d.ts");
  await writeFile(
    declarationPath,
    `${await readFile(declarationPath, "utf8")}\n// captured type declaration drift\n`,
    "utf8",
  );
  await assert.rejects(
    buildSyntheticEvidenceBaseline({ projectRoot }),
    (error) => error instanceof SyntheticEvidenceBaselineError && error.code === "compiler_integrity_mismatch",
  );
});

test("output parent inode replacement fails closed before the artifact opens", async (context) => {
  const trustedOutputRoot = await mkdtemp(resolve(REPO, "../neoloop-eval-parent-replacement-"));
  const displacedRoot = `${trustedOutputRoot}-displaced`;
  const outputDirectory = resolve(trustedOutputRoot, "run");
  context.after(async () => {
    await rm(trustedOutputRoot, { recursive: true, force: true });
    await rm(displacedRoot, { recursive: true, force: true });
  });
  const child = runMockedModuleChild(String.raw`
    import { lstatSync, mkdirSync, renameSync } from "node:fs";
    import {
      mkdir as realMkdir,
      open as realOpen,
      readFile as realReadFile,
    } from "node:fs/promises";
    import { resolve } from "node:path";
    import { mock } from "node:test";

    const [moduleUrl, projectRoot, trustedOutputRoot, outputDirectory, displacedRoot]
      = process.argv.slice(1);
    let parentReplacements = 0;
    let parentInodeChanged = false;
    mock.module("node:fs/promises", {
      namedExports: {
        readFile: realReadFile,
        open: realOpen,
        async mkdir(path, options) {
          const parentBefore = lstatSync(trustedOutputRoot);
          const result = await realMkdir(path, options);
          if (resolve(path) === resolve(outputDirectory)) {
            renameSync(trustedOutputRoot, displacedRoot);
            mkdirSync(trustedOutputRoot, { mode: 0o700 });
            parentReplacements += 1;
            const parentAfter = lstatSync(trustedOutputRoot);
            parentInodeChanged = parentBefore.dev !== parentAfter.dev
              || parentBefore.ino !== parentAfter.ino;
          }
          return result;
        },
      },
    });
    const { writeSyntheticEvidenceBaseline, SyntheticEvidenceBaselineError } = await import(moduleUrl);
    let code = "unexpected_success";
    try {
      await writeSyntheticEvidenceBaseline({
        projectRoot,
        trustedOutputRoot,
        outputDirectory,
      });
    } catch (error) {
      code = error instanceof SyntheticEvidenceBaselineError ? error.code : "unexpected_error";
    }
    process.stdout.write(JSON.stringify({
      code,
      parent_replacements: parentReplacements,
      parent_inode_changed: parentInodeChanged,
    }));
  `, [BASELINE_MODULE_URL, REPO, trustedOutputRoot, outputDirectory, displacedRoot]);
  assert.equal(child.status, 0, child.stderr);
  assert.equal(child.stderr, "");
  assert.deepEqual(JSON.parse(child.stdout), {
    code: "output_write_failed",
    parent_replacements: 1,
    parent_inode_changed: true,
  });
  await assert.rejects(access(outputDirectory));
  await assert.doesNotReject(access(resolve(displacedRoot, "run")));
  await assert.rejects(access(resolve(outputDirectory, "synthetic-evidence-baseline-v1.json")));
  await assert.rejects(access(resolve(
    displacedRoot,
    "run/synthetic-evidence-baseline-v1.json",
  )));
});

test("compiler execution ignores polluted PATH and NODE_OPTIONS", async () => {
  const previousPath = process.env.PATH;
  const previousNodeOptions = process.env.NODE_OPTIONS;
  process.env.PATH = "/definitely/not/a/compiler/path";
  process.env.NODE_OPTIONS = "--require=/definitely/not/a/credential-override.js";
  try {
    const isolatedReport = await buildSyntheticEvidenceBaseline({ projectRoot: REPO });
    assert.equal(isolatedReport.report_digest_sha256, report.report_digest_sha256);
  } finally {
    if (previousPath === undefined) delete process.env.PATH;
    else process.env.PATH = previousPath;
    if (previousNodeOptions === undefined) delete process.env.NODE_OPTIONS;
    else process.env.NODE_OPTIONS = previousNodeOptions;
  }
});
