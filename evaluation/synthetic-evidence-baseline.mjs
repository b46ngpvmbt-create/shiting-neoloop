import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  constants as fsConstants,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { mkdir, open, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import {
  dirname,
  isAbsolute,
  join,
  parse,
  relative,
  resolve,
  sep,
} from "node:path";
import { pathToFileURL } from "node:url";

export const FIXTURE_BUNDLE_SHA256 = "4f0583613736dc60f25f3632d3b734583caf995242de21c22b86c2ccc144b26e";

const REPORT_SCHEMA_VERSION = "neoloop.synthetic_evidence_baseline.v1";
const DATA_SCOPE = "synthetic_experiment";
const EVIDENCE_CLASS = "synthetic_experiment";
const OUTPUT_FILE_NAME = "synthetic-evidence-baseline-v1.json";
const DIGEST_CONTRACT = "sha256_canonical_json_without_report_digest";
const FIXTURE_SCHEMA_VERSION = "1.0.0-draft.2";
const FIXTURE_VERSION = "1.0.0-t1-r2";
const NODE_ENGINE_CONTRACT = ">=22.13.0";
const TYPESCRIPT_VERSION = "5.9.3";
const NODE_TYPES_VERSION = "22.19.19";
const UNDICI_TYPES_VERSION = "6.21.0";
const RESOLVER_SOURCE_FILE_COUNT = 44;
const RESOLVER_SOURCE_DIGEST_SHA256 = "b16078ca1baaa2495db987185cca7424560d24b79c39b0975d3b6ee6a5f16ca7";
const COMPILER_AND_TYPE_INPUT_FILE_COUNT = 214;
const COMPILER_AND_TYPE_INPUTS_DIGEST_SHA256 = "da36230a8372f0bae5d2614874b1923df7c46cb658e2fc93a3f48e456679c457";
const PROJECT_PACKAGE_METADATA_SHA256 = "f1f6fff1d246c206e5fc80eb18c1377481c99a968b82d1531370014509a542f6";
const COMPILER_ENTRY_SHA256 = "2cffde0b8c6760dfb0b5b0382bbb7e00ba6a8b2d981b9205b256a700a481d983";
const COMPILER_BUNDLE_SHA256 = "e8f349eabd48486bdb2bf9dc1a00c89d58297270c54b745838879e2859194419";
const TYPESCRIPT_PACKAGE_METADATA_SHA256 = "822ef7ca6452205657b6288b066481ecf508bfbf43455d715cf7d3ec457561e6";
const NODE_TYPES_PACKAGE_METADATA_SHA256 = "ba8f6326a685af9e7dce89a99f55e0dc3cef450046acf00a20f7cb673562f581";
const UNDICI_TYPES_PACKAGE_METADATA_SHA256 = "11f873b423b96a5ad444a099685ca6b9de1379dcd83fd8d368e757ddb53658e4";
const RESOLVER_BUILD_INPUT_DIGEST_SHA256 = "3f48badb34428ea98d9cab4e262c55b2a0bf9435249fa7f49e3dc35c37cd13c3";
const EMITTED_JS_FILE_COUNT = 44;
const EMITTED_JS_BUNDLE_SHA256 = "2835690c5a760280f87187e956370642948ce4d5d5c11c933b563009f6231b13";
const RESOLVER_EMITTED_JS_SHA256 = "71a62593a4c5706b8d192f21434c748de6e680dd6d3b167b9da837c3964ba755";
const RESOLVER_COMPILER_MODE = "typescript_nodenext_es2022_strict";
const RESOLVER_INPUT_BINDING_CONTRACT = "captured_source_compiler_types_and_emitted_js.v1";
const COMPILER_TIMEOUT_MS = 30_000;
const COMPILER_MAX_BUFFER_BYTES = 1_048_576;
const RESOLVER_COMPILER_OPTIONS = Object.freeze([
  "--module=NodeNext",
  "--moduleResolution=NodeNext",
  "--target=ES2022",
  "--lib=ES2022,DOM",
  "--types=node",
  "--strict",
  "--skipLibCheck",
  "--incremental=false",
]);

const FIXTURE_FILES = Object.freeze([
  Object.freeze({
    path: "data/canonical/adversarial/safety-adversarial.json",
    sha256: "b02653a5c1998412ab69ea0e6e85947aaafa60e6cd26ceb33c95a8e94f7ec8c9",
  }),
  Object.freeze({
    path: "data/canonical/gold/case-gold.json",
    sha256: "8416d7b21ea165865fbe86802ee9e7d1b3845b7b6f43b0df20f2d26ba9dc5e9d",
  }),
  Object.freeze({
    path: "data/canonical/scenarios/failure-drills.json",
    sha256: "c8893a7a706f1b3a8051d16b855a35372690bbc780ca060cb8768219dbc0312a",
  }),
  Object.freeze({
    path: "data/canonical/scenarios/main-story.json",
    sha256: "1584fceecbfbbf4d63eee9ac69ed998505985d0f51a4a1b508d28976dcce690c",
  }),
]);

const RESOLVER_SCENARIOS = Object.freeze([
  Object.freeze({ target: "clusters", scenario: "zero_match", expectedMatchCount: 0 }),
  Object.freeze({ target: "clusters", scenario: "single_match", expectedMatchCount: 1 }),
  Object.freeze({ target: "clusters", scenario: "multiple_match", expectedMatchCount: 2 }),
  Object.freeze({ target: "improvements", scenario: "zero_match", expectedMatchCount: 0 }),
  Object.freeze({ target: "improvements", scenario: "single_match", expectedMatchCount: 1 }),
  Object.freeze({ target: "improvements", scenario: "multiple_match", expectedMatchCount: 2 }),
]);

const UNMEASURED_METRICS = Object.freeze([
  Object.freeze({
    metric: "p0_p1_risk_recall",
    status: "not_measured",
    value: null,
    unit: "ratio",
    reason_code: "gold_pending_human_review_and_runtime_predictions_absent",
  }),
  Object.freeze({
    metric: "failure_drill_safe_path_rate",
    status: "not_measured",
    value: null,
    unit: "ratio",
    reason_code: "failure_drills_not_run",
  }),
  Object.freeze({
    metric: "crossover_20x2_elapsed_seconds",
    status: "not_measured",
    value: null,
    unit: "seconds",
    reason_code: "crossover_not_run",
  }),
  ...[
    "efficiency_improvement_ratio",
    "cost_reduction_ratio",
    "quality_improvement_ratio",
    "revenue_uplift_ratio",
    "roi",
  ].map((metric) => Object.freeze({
    metric,
    status: "not_measured",
    value: null,
    unit: "ratio",
    reason_code: "real_business_measurement_absent",
  })),
]);

const TOP_LEVEL_KEYS = Object.freeze([
  "schema_version",
  "data_scope",
  "evidence_class",
  "artifact_scope",
  "fixture",
  "populations",
  "resolver_matrix",
  "run_contract",
  "measured_checks",
  "unmeasured_metrics",
  "safety_boundaries",
  "digest_contract",
  "report_digest_sha256",
]);

export class SyntheticEvidenceBaselineError extends Error {
  constructor(code) {
    super("Synthetic evidence baseline was rejected");
    this.name = "SyntheticEvidenceBaselineError";
    this.code = code;
  }
}

function fail(code) {
  throw new SyntheticEvidenceBaselineError(code);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function isPlainObject(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function requireExactKeys(value, keys, errorCode) {
  if (!isPlainObject(value)) fail(errorCode);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    fail(errorCode);
  }
}

function canonicalJson(value) {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) fail("invalid_report_schema");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalJson(entry)).join(",")}]`;
  }
  if (!isPlainObject(value)) fail("invalid_report_schema");
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
    .join(",")}}`;
}

function deepFreeze(value) {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const entry of Object.values(value)) deepFreeze(entry);
    Object.freeze(value);
  }
  return value;
}

function assertFixtureWrapper(document) {
  if (
    !isPlainObject(document)
    || document.schema_version !== FIXTURE_SCHEMA_VERSION
    || document.fixture_version !== FIXTURE_VERSION
    || document.data_scope !== DATA_SCOPE
    || document.evidence_class !== EVIDENCE_CLASS
    || !Array.isArray(document.records)
  ) {
    fail("fixture_truth_mismatch");
  }
}

async function inspectFixtures(projectRoot) {
  const loaded = new Map();
  const observedFiles = [];

  for (const expected of FIXTURE_FILES) {
    let bytes;
    try {
      bytes = await readFile(resolve(projectRoot, expected.path));
    } catch {
      fail("fixture_bundle_mismatch");
    }
    const observedSha256 = sha256(bytes);
    if (observedSha256 !== expected.sha256) fail("fixture_bundle_mismatch");
    observedFiles.push({ path: expected.path, sha256: observedSha256 });
    try {
      loaded.set(expected.path, JSON.parse(bytes.toString("utf8")));
    } catch {
      fail("fixture_truth_mismatch");
    }
  }

  const bundleMaterial = observedFiles
    .map(({ path, sha256: fileSha256 }) => `${path}\0${fileSha256}\n`)
    .join("");
  if (sha256(bundleMaterial) !== FIXTURE_BUNDLE_SHA256) fail("fixture_bundle_mismatch");

  const adversarial = loaded.get(FIXTURE_FILES[0].path);
  const gold = loaded.get(FIXTURE_FILES[1].path);
  const failureDrills = loaded.get(FIXTURE_FILES[2].path);
  const mainStory = loaded.get(FIXTURE_FILES[3].path);
  for (const document of [adversarial, gold, failureDrills, mainStory]) {
    assertFixtureWrapper(document);
  }

  const goldHumanReviewedRecords = gold.records.filter(
    (record) => record?.annotation?.human_reviewed === true,
  ).length;
  const mainStoryRunRecords = mainStory.records.filter(
    (record) => record?.execution_status !== "not_run",
  ).length;
  const failureDrillsRun = failureDrills.records.filter(
    (record) => record?.execution_status !== "not_run",
  ).length;

  if (
    gold.records.length !== 20
    || gold.annotation?.status !== "draft_pending_human_review"
    || gold.annotation?.human_reviewed !== false
    || goldHumanReviewedRecords !== 0
    || gold.records.some((record) => record?.annotation?.human_reviewed !== false)
    || adversarial.records.length !== 16
    || adversarial.records.some(
      (record) => record?.data_scope !== DATA_SCOPE || record?.evidence_class !== EVIDENCE_CLASS,
    )
    || mainStory.records.length !== 1
    || mainStoryRunRecords !== 0
    || failureDrills.records.length !== 4
    || failureDrillsRun !== 0
  ) {
    fail("fixture_truth_mismatch");
  }

  return {
    fixture: {
      schema_version: FIXTURE_SCHEMA_VERSION,
      fixture_version: FIXTURE_VERSION,
      bundle_sha256: FIXTURE_BUNDLE_SHA256,
      files: observedFiles,
    },
    populations: {
      gold_records: gold.records.length,
      gold_human_reviewed_records: goldHumanReviewedRecords,
      adversarial_records: adversarial.records.length,
      main_story_records: mainStory.records.length,
      main_story_run_records: mainStoryRunRecords,
      failure_drills: failureDrills.records.length,
      failure_drills_run: failureDrillsRun,
      crossover_planned_inputs: gold.records.length,
      crossover_planned_arms_per_input: 2,
      crossover_completed_runs: 0,
    },
  };
}

function collectFiles(directory, predicate, errorCode) {
  let entries;
  try {
    entries = readdirSync(directory, { withFileTypes: true }).sort((left, right) => (
      left.name.localeCompare(right.name, "en")
    ));
  } catch {
    fail(errorCode);
  }
  return entries.flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isSymbolicLink()) fail(errorCode);
    return entry.isDirectory() ? collectFiles(path, predicate, errorCode) : predicate(path) ? [path] : [];
  });
}

function captureFile(projectRoot, path, errorCode) {
  const projectRelativePath = relative(projectRoot, path);
  if (
    projectRelativePath === ""
    || projectRelativePath === ".."
    || projectRelativePath.startsWith(`..${sep}`)
    || isAbsolute(projectRelativePath)
  ) {
    fail(errorCode);
  }
  let current = projectRoot;
  for (const component of projectRelativePath.split(sep)) {
    let names;
    try {
      names = readdirSync(current);
    } catch {
      fail(errorCode);
    }
    if (!names.includes(component)) fail(errorCode);
    current = join(current, component);
    let componentStat;
    try {
      componentStat = lstatSync(current);
    } catch {
      fail(errorCode);
    }
    if (componentStat.isSymbolicLink()) fail(errorCode);
  }

  let before;
  let bytes;
  let after;
  try {
    before = lstatSync(path);
    bytes = readFileSync(path);
    after = lstatSync(path);
  } catch {
    fail(errorCode);
  }
  if (
    !before.isFile()
    || !after.isFile()
    || before.dev !== after.dev
    || before.ino !== after.ino
    || before.size !== after.size
    || bytes.length !== after.size
  ) {
    fail(errorCode);
  }
  return {
    path: projectRelativePath.replaceAll("\\", "/"),
    bytes,
    sha256: sha256(bytes),
  };
}

function rowsDigest(rows) {
  return sha256(rows.map((row) => `${row.path}\0${row.sha256}\n`).join(""));
}

function parseCapturedJson(rows, path, errorCode) {
  const row = rows.find((candidate) => candidate.path === path);
  if (!row) fail(errorCode);
  try {
    return JSON.parse(row.bytes.toString("utf8"));
  } catch {
    fail(errorCode);
  }
}

function inspectResolverBuildInputs(projectRoot) {
  let canonicalProjectRoot;
  try {
    canonicalProjectRoot = realpathSync.native(resolve(projectRoot));
  } catch {
    fail("invalid_project_root");
  }
  const sourcePaths = collectFiles(
    resolve(canonicalProjectRoot, "src/neoloop"),
    (path) => path.endsWith(".ts"),
    "resolver_build_input_mismatch",
  ).sort();
  const compilerAndTypePaths = [
    resolve(canonicalProjectRoot, "package.json"),
    resolve(canonicalProjectRoot, "node_modules/typescript/lib/tsc.js"),
    resolve(canonicalProjectRoot, "node_modules/typescript/lib/_tsc.js"),
    resolve(canonicalProjectRoot, "node_modules/typescript/package.json"),
    ...collectFiles(
      resolve(canonicalProjectRoot, "node_modules/typescript/lib"),
      (path) => /^lib[^/]*\.d\.ts$/u.test(parse(path).base),
      "compiler_integrity_mismatch",
    ),
    resolve(canonicalProjectRoot, "node_modules/@types/node/package.json"),
    ...collectFiles(
      resolve(canonicalProjectRoot, "node_modules/@types/node"),
      (path) => path.endsWith(".d.ts"),
      "compiler_integrity_mismatch",
    ),
    resolve(canonicalProjectRoot, "node_modules/undici-types/package.json"),
    ...collectFiles(
      resolve(canonicalProjectRoot, "node_modules/undici-types"),
      (path) => path.endsWith(".d.ts"),
      "compiler_integrity_mismatch",
    ),
  ].filter((path, index, values) => values.indexOf(path) === index).sort();
  const sourceRows = sourcePaths.map((path) => (
    captureFile(canonicalProjectRoot, path, "resolver_build_input_mismatch")
  ));
  const compilerAndTypeRows = compilerAndTypePaths.map((path) => (
    captureFile(canonicalProjectRoot, path, "compiler_integrity_mismatch")
  ));
  const sourceDigestSha256 = rowsDigest(sourceRows);
  const compilerAndTypeInputsDigestSha256 = rowsDigest(compilerAndTypeRows);

  const projectDocument = parseCapturedJson(compilerAndTypeRows, "package.json", "compiler_integrity_mismatch");
  const typescriptDocument = parseCapturedJson(
    compilerAndTypeRows,
    "node_modules/typescript/package.json",
    "compiler_integrity_mismatch",
  );
  const nodeTypesDocument = parseCapturedJson(
    compilerAndTypeRows,
    "node_modules/@types/node/package.json",
    "compiler_integrity_mismatch",
  );
  const undiciTypesDocument = parseCapturedJson(
    compilerAndTypeRows,
    "node_modules/undici-types/package.json",
    "compiler_integrity_mismatch",
  );
  const capturedSha256 = (path) => {
    const row = compilerAndTypeRows.find((candidate) => candidate.path === path);
    if (!row) fail("compiler_integrity_mismatch");
    return row.sha256;
  };
  const nodeEngineContract = projectDocument?.engines?.node;
  const typescriptVersion = typescriptDocument?.version;
  const nodeTypesVersion = nodeTypesDocument?.version;
  const undiciTypesVersion = undiciTypesDocument?.version;
  const buildInput = {
    source_digest_sha256: sourceDigestSha256,
    source_file_count: sourceRows.length,
    compiler_and_type_inputs_digest_sha256: compilerAndTypeInputsDigestSha256,
    compiler_and_type_input_file_count: compilerAndTypeRows.length,
    project_package_metadata_sha256: capturedSha256("package.json"),
    compiler_entry_sha256: capturedSha256("node_modules/typescript/lib/tsc.js"),
    compiler_bundle_sha256: capturedSha256("node_modules/typescript/lib/_tsc.js"),
    typescript_package_metadata_sha256: capturedSha256("node_modules/typescript/package.json"),
    node_types_package_metadata_sha256: capturedSha256("node_modules/@types/node/package.json"),
    undici_types_package_metadata_sha256: capturedSha256("node_modules/undici-types/package.json"),
    typescript_version: typescriptVersion,
    node_types_version: nodeTypesVersion,
    undici_types_version: undiciTypesVersion,
    node_engine_contract: nodeEngineContract,
    compiler_options: [...RESOLVER_COMPILER_OPTIONS],
  };
  const inputDigestSha256 = sha256(canonicalJson(buildInput));
  if (
    sourceRows.length !== RESOLVER_SOURCE_FILE_COUNT
    || sourceDigestSha256 !== RESOLVER_SOURCE_DIGEST_SHA256
  ) {
    fail("resolver_build_input_mismatch");
  }
  if (
    compilerAndTypeRows.length !== COMPILER_AND_TYPE_INPUT_FILE_COUNT
    || compilerAndTypeInputsDigestSha256 !== COMPILER_AND_TYPE_INPUTS_DIGEST_SHA256
    || buildInput.project_package_metadata_sha256 !== PROJECT_PACKAGE_METADATA_SHA256
    || buildInput.compiler_entry_sha256 !== COMPILER_ENTRY_SHA256
    || buildInput.compiler_bundle_sha256 !== COMPILER_BUNDLE_SHA256
    || buildInput.typescript_package_metadata_sha256 !== TYPESCRIPT_PACKAGE_METADATA_SHA256
    || buildInput.node_types_package_metadata_sha256 !== NODE_TYPES_PACKAGE_METADATA_SHA256
    || buildInput.undici_types_package_metadata_sha256 !== UNDICI_TYPES_PACKAGE_METADATA_SHA256
    || nodeEngineContract !== NODE_ENGINE_CONTRACT
    || typescriptVersion !== TYPESCRIPT_VERSION
    || nodeTypesVersion !== NODE_TYPES_VERSION
    || undiciTypesVersion !== UNDICI_TYPES_VERSION
    || inputDigestSha256 !== RESOLVER_BUILD_INPUT_DIGEST_SHA256
  ) {
    fail("compiler_integrity_mismatch");
  }

  return {
    canonicalProjectRoot,
    sourceRows,
    compilerAndTypeRows,
    runtimeInput: {
      node_engine_contract: nodeEngineContract,
      typescript_version: typescriptVersion,
      node_types_version: nodeTypesVersion,
      undici_types_version: undiciTypesVersion,
    },
    resolverBuildInput: {
      compiler_mode: RESOLVER_COMPILER_MODE,
      input_binding_contract: RESOLVER_INPUT_BINDING_CONTRACT,
      source_file_count: sourceRows.length,
      source_digest_sha256: sourceDigestSha256,
      compiler_and_type_input_file_count: compilerAndTypeRows.length,
      compiler_and_type_inputs_digest_sha256: compilerAndTypeInputsDigestSha256,
      project_package_metadata_sha256: buildInput.project_package_metadata_sha256,
      compiler_entry_sha256: buildInput.compiler_entry_sha256,
      compiler_bundle_sha256: buildInput.compiler_bundle_sha256,
      typescript_package_metadata_sha256: buildInput.typescript_package_metadata_sha256,
      node_types_package_metadata_sha256: buildInput.node_types_package_metadata_sha256,
      undici_types_package_metadata_sha256: buildInput.undici_types_package_metadata_sha256,
      input_digest_sha256: inputDigestSha256,
    },
  };
}

function writeCapturedRows(snapshotRoot, rows) {
  for (const row of rows) {
    const target = resolve(snapshotRoot, row.path);
    mkdirSync(dirname(target), { recursive: true, mode: 0o700 });
    writeFileSync(target, row.bytes, { flag: "wx", mode: 0o600 });
  }
}

function expandCompilerOptions(options) {
  return options.flatMap((option) => {
    const separatorIndex = option.indexOf("=");
    if (separatorIndex === -1) return [option];
    if (separatorIndex === 0 || separatorIndex === option.length - 1) {
      fail("resolver_build_failed");
    }
    return [option.slice(0, separatorIndex), option.slice(separatorIndex + 1)];
  });
}

function captureEmittedJavaScript(outputRoot) {
  const paths = collectFiles(
    outputRoot,
    (path) => path.endsWith(".js"),
    "resolver_build_failed",
  ).sort();
  const rows = paths.map((path) => {
    const before = lstatSync(path);
    const bytes = readFileSync(path);
    const after = lstatSync(path);
    if (
      !before.isFile()
      || before.dev !== after.dev
      || before.ino !== after.ino
      || before.size !== after.size
      || bytes.length !== after.size
    ) {
      fail("resolver_build_failed");
    }
    return {
      path: relative(outputRoot, path).replaceAll("\\", "/"),
      sha256: sha256(bytes),
      dev: after.dev,
      ino: after.ino,
      size: after.size,
    };
  });
  const publicRows = rows.map(({ path, sha256: fileSha256 }) => ({ path, sha256: fileSha256 }));
  const bundleSha256 = rowsDigest(publicRows);
  const resolverRow = rows.find(
    (row) => row.path === "src/neoloop/adapters/feishu/w6-business-selector-resolver.js",
  );
  if (
    rows.length !== EMITTED_JS_FILE_COUNT
    || bundleSha256 !== EMITTED_JS_BUNDLE_SHA256
    || resolverRow?.sha256 !== RESOLVER_EMITTED_JS_SHA256
  ) {
    fail("resolver_build_output_mismatch");
  }
  return { rows, bundleSha256, resolverSha256: resolverRow.sha256 };
}

function assertSameEmittedSnapshot(before, after) {
  if (
    before.bundleSha256 !== after.bundleSha256
    || before.rows.length !== after.rows.length
    || before.rows.some((row, index) => (
      row.path !== after.rows[index].path
      || row.sha256 !== after.rows[index].sha256
      || row.dev !== after.rows[index].dev
      || row.ino !== after.rows[index].ino
      || row.size !== after.rows[index].size
    ))
  ) {
    fail("resolver_build_output_mismatch");
  }
}

async function withBuiltResolver(buildInputs, callback) {
  const buildRoot = mkdtempSync(join(realpathSync.native(tmpdir()), "neoloop-evidence-resolver-"));
  try {
    const snapshotRoot = resolve(buildRoot, "snapshot");
    const outputRoot = resolve(buildRoot, "emitted");
    writeCapturedRows(snapshotRoot, [
      ...buildInputs.sourceRows,
      ...buildInputs.compilerAndTypeRows,
    ]);
    const compiler = resolve(snapshotRoot, "node_modules/typescript/lib/tsc.js");
    const sourceFiles = buildInputs.sourceRows.map((row) => resolve(snapshotRoot, row.path));
    const result = spawnSync(
      process.execPath,
      [
        compiler,
        "--outDir", outputRoot,
        "--rootDir", snapshotRoot,
        "--noEmit", "false",
        "--typeRoots", resolve(snapshotRoot, "node_modules/@types"),
        ...expandCompilerOptions(RESOLVER_COMPILER_OPTIONS),
        ...sourceFiles,
      ],
      {
        cwd: snapshotRoot,
        encoding: "utf8",
        env: {
          LANG: "C",
          LC_ALL: "C",
          NODE_OPTIONS: "",
          NO_COLOR: "1",
          PATH: "",
          TZ: "UTC",
        },
        timeout: COMPILER_TIMEOUT_MS,
        maxBuffer: COMPILER_MAX_BUFFER_BYTES,
      },
    );
    if (result.error || result.signal || result.status !== 0) fail("resolver_build_failed");
    writeFileSync(
      resolve(outputRoot, "package.json"),
      "{\"type\":\"module\"}\n",
      { encoding: "utf8", flag: "wx", mode: 0o600 },
    );
    const emittedBeforeImport = captureEmittedJavaScript(outputRoot);

    let resolverModule;
    try {
      resolverModule = await import(pathToFileURL(resolve(
        outputRoot,
        "src/neoloop/adapters/feishu/w6-business-selector-resolver.js",
      )).href);
    } catch {
      fail("resolver_build_failed");
    }
    if (typeof resolverModule.resolveW6BusinessSelector !== "function") {
      fail("resolver_build_failed");
    }
    const callbackResult = await callback(resolverModule.resolveW6BusinessSelector);
    const emittedAfterImport = captureEmittedJavaScript(outputRoot);
    assertSameEmittedSnapshot(emittedBeforeImport, emittedAfterImport);
    return {
      callbackResult,
      emittedBuild: {
        emitted_js_file_count: emittedBeforeImport.rows.length,
        emitted_js_bundle_sha256: emittedBeforeImport.bundleSha256,
        resolver_emitted_js_sha256: emittedBeforeImport.resolverSha256,
      },
    };
  } finally {
    rmSync(buildRoot, { recursive: true, force: true });
  }
}

function expectedClassification(matchCount) {
  return matchCount === 1 ? "exact_single_match" : "projection_conflict";
}

async function evaluateResolverScenario(resolveBusinessSelector, definition) {
  const field = definition.target === "clusters" ? "cluster_id" : "improvement_id";
  const businessId = definition.target === "clusters"
    ? `SYN-CLUSTER-EVAL-${definition.expectedMatchCount}`
    : `SYN-IMPROVEMENT-EVAL-${definition.expectedMatchCount}`;
  const privateSentinels = Array.from(
    { length: definition.expectedMatchCount },
    (_, index) => `PRIVATE-SYN-${definition.target.toUpperCase()}-${definition.scenario}-${index + 1}`,
  );
  const matches = privateSentinels.map((sentinel) => ({
    locator: {
      opaque_reference: sentinel,
      nested: { synthetic_revision: `${sentinel}-REVISION` },
    },
  }));
  const providerQueries = [];

  let resolution;
  try {
    resolution = await resolveBusinessSelector(
      { target: definition.target, business_id: businessId },
      {
        async findByBusinessKey(query) {
          providerQueries.push(structuredClone(query));
          return { matches };
        },
      },
    );
  } catch {
    fail("resolver_matrix_failed");
  }

  const expectedQuery = {
    target: definition.target,
    field,
    value: businessId,
    limit: 2,
  };
  if (
    providerQueries.length !== 1
    || canonicalJson(providerQueries[0]) !== canonicalJson(expectedQuery)
    || Object.keys(providerQueries[0]).length !== 4
  ) {
    fail("resolver_matrix_failed");
  }

  let privateConsumerCallCount = 0;
  const consumerResult = resolution.consumePrivateLocator(() => {
    privateConsumerCallCount += 1;
    return "consumed_without_public_serialization";
  });
  const expectedConsumerResult = definition.expectedMatchCount === 1
    ? "consumed_without_public_serialization"
    : undefined;
  const evidence = resolution.evidence;
  const publicResolution = JSON.stringify(resolution);
  const expectedEvidence = {
    target: definition.target,
    match_count: definition.expectedMatchCount,
    classification: expectedClassification(definition.expectedMatchCount),
    business_write_count: 0,
  };
  const leakedPrivateMaterial = privateSentinels.some(
    (sentinel) => publicResolution.includes(sentinel),
  );
  if (
    !isPlainObject(evidence)
    || canonicalJson(evidence) !== canonicalJson(expectedEvidence)
    || Reflect.ownKeys(resolution).length !== 1
    || Reflect.ownKeys(resolution)[0] !== "evidence"
    || privateConsumerCallCount !== (definition.expectedMatchCount === 1 ? 1 : 0)
    || consumerResult !== expectedConsumerResult
    || leakedPrivateMaterial
  ) {
    fail("resolver_matrix_failed");
  }

  return {
    target: definition.target,
    scenario: definition.scenario,
    expected_match_count: definition.expectedMatchCount,
    observed_match_count: evidence.match_count,
    classification: evidence.classification,
    business_write_count: evidence.business_write_count,
    private_consumer_call_count: privateConsumerCallCount,
    executor_call_count: 0,
    public_sensitive_material_count: 0,
    passed: true,
  };
}

async function evaluateResolverMatrix(buildInputs) {
  const result = await withBuiltResolver(buildInputs, async (resolveBusinessSelector) => {
    const rows = [];
    for (const scenario of RESOLVER_SCENARIOS) {
      rows.push(await evaluateResolverScenario(resolveBusinessSelector, scenario));
    }
    return rows;
  });
  return {
    rows: result.callbackResult,
    emittedBuild: result.emittedBuild,
  };
}

function isSupportedNodeVersion(value) {
  if (typeof value !== "string") return false;
  const match = /^v(\d+)\.(\d+)\.(\d+)$/u.exec(value);
  if (!match) return false;
  const major = Number(match[1]);
  const minor = Number(match[2]);
  return major > 22 || (major === 22 && minor >= 13);
}

function validateRunContract(value) {
  requireExactKeys(value, [
    "run_kind",
    "command_class",
    "evaluation_status",
    "exit_code",
    "runtime",
    "resolver_build",
    "clock_policy",
    "matrix_sample_count",
    "output_directory_bound_to_digest",
  ], "invalid_run_contract");
  requireExactKeys(value.runtime, [
    "node_version",
    "node_runtime_supported",
    "node_engine_contract",
    "typescript_version",
    "node_types_version",
    "undici_types_version",
    "toolchain_digest_sha256",
  ], "invalid_run_contract");
  requireExactKeys(value.resolver_build, [
    "compiler_mode",
    "input_binding_contract",
    "source_file_count",
    "source_digest_sha256",
    "compiler_and_type_input_file_count",
    "compiler_and_type_inputs_digest_sha256",
    "project_package_metadata_sha256",
    "compiler_entry_sha256",
    "compiler_bundle_sha256",
    "typescript_package_metadata_sha256",
    "node_types_package_metadata_sha256",
    "undici_types_package_metadata_sha256",
    "input_digest_sha256",
    "emitted_js_file_count",
    "emitted_js_bundle_sha256",
    "resolver_emitted_js_sha256",
  ], "invalid_run_contract");
  requireExactKeys(value.clock_policy, [
    "clock_mode",
    "observed_at",
    "execution_time_claimed",
  ], "invalid_run_contract");
  const expectedToolchainDigest = sha256(canonicalJson({
    node_version: value.runtime.node_version,
    node_runtime_supported: value.runtime.node_runtime_supported,
    node_engine_contract: value.runtime.node_engine_contract,
    typescript_version: value.runtime.typescript_version,
    node_types_version: value.runtime.node_types_version,
    undici_types_version: value.runtime.undici_types_version,
    resolver_build_input_digest_sha256: value.resolver_build.input_digest_sha256,
    emitted_js_bundle_sha256: value.resolver_build.emitted_js_bundle_sha256,
  }));
  if (
    value.run_kind !== "local_synthetic_reproducible"
    || value.command_class !== "local_readonly_evaluation"
    || value.evaluation_status !== "completed"
    || value.exit_code !== 0
    || !isSupportedNodeVersion(value.runtime.node_version)
    || value.runtime.node_runtime_supported !== true
    || value.runtime.node_engine_contract !== NODE_ENGINE_CONTRACT
    || value.runtime.typescript_version !== TYPESCRIPT_VERSION
    || value.runtime.node_types_version !== NODE_TYPES_VERSION
    || value.runtime.undici_types_version !== UNDICI_TYPES_VERSION
    || value.runtime.toolchain_digest_sha256 !== expectedToolchainDigest
    || value.resolver_build.compiler_mode !== RESOLVER_COMPILER_MODE
    || value.resolver_build.input_binding_contract !== RESOLVER_INPUT_BINDING_CONTRACT
    || value.resolver_build.source_file_count !== RESOLVER_SOURCE_FILE_COUNT
    || value.resolver_build.source_digest_sha256 !== RESOLVER_SOURCE_DIGEST_SHA256
    || value.resolver_build.compiler_and_type_input_file_count !== COMPILER_AND_TYPE_INPUT_FILE_COUNT
    || value.resolver_build.compiler_and_type_inputs_digest_sha256
      !== COMPILER_AND_TYPE_INPUTS_DIGEST_SHA256
    || value.resolver_build.project_package_metadata_sha256 !== PROJECT_PACKAGE_METADATA_SHA256
    || value.resolver_build.compiler_entry_sha256 !== COMPILER_ENTRY_SHA256
    || value.resolver_build.compiler_bundle_sha256 !== COMPILER_BUNDLE_SHA256
    || value.resolver_build.typescript_package_metadata_sha256
      !== TYPESCRIPT_PACKAGE_METADATA_SHA256
    || value.resolver_build.node_types_package_metadata_sha256
      !== NODE_TYPES_PACKAGE_METADATA_SHA256
    || value.resolver_build.undici_types_package_metadata_sha256
      !== UNDICI_TYPES_PACKAGE_METADATA_SHA256
    || value.resolver_build.input_digest_sha256 !== RESOLVER_BUILD_INPUT_DIGEST_SHA256
    || value.resolver_build.emitted_js_file_count !== EMITTED_JS_FILE_COUNT
    || value.resolver_build.emitted_js_bundle_sha256 !== EMITTED_JS_BUNDLE_SHA256
    || value.resolver_build.resolver_emitted_js_sha256 !== RESOLVER_EMITTED_JS_SHA256
    || value.clock_policy.clock_mode !== "excluded_from_digest"
    || value.clock_policy.observed_at !== null
    || value.clock_policy.execution_time_claimed !== false
    || value.matrix_sample_count !== RESOLVER_SCENARIOS.length
    || value.output_directory_bound_to_digest !== false
  ) {
    fail("invalid_run_contract");
  }
}

function validateFixture(value) {
  requireExactKeys(
    value,
    ["schema_version", "fixture_version", "bundle_sha256", "files"],
    "invalid_fixture_contract",
  );
  if (
    value.schema_version !== FIXTURE_SCHEMA_VERSION
    || value.fixture_version !== FIXTURE_VERSION
    || value.bundle_sha256 !== FIXTURE_BUNDLE_SHA256
    || !Array.isArray(value.files)
    || value.files.length !== FIXTURE_FILES.length
  ) {
    fail("invalid_fixture_contract");
  }
  for (let index = 0; index < FIXTURE_FILES.length; index += 1) {
    requireExactKeys(value.files[index], ["path", "sha256"], "invalid_fixture_contract");
    if (
      value.files[index].path !== FIXTURE_FILES[index].path
      || value.files[index].sha256 !== FIXTURE_FILES[index].sha256
    ) {
      fail("invalid_fixture_contract");
    }
  }
}

function validatePopulations(value) {
  const expected = {
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
  };
  requireExactKeys(value, Object.keys(expected), "invalid_population_truth");
  if (canonicalJson(value) !== canonicalJson(expected)) fail("invalid_population_truth");
}

function validateResolverMatrix(value) {
  if (!Array.isArray(value) || value.length !== RESOLVER_SCENARIOS.length) {
    fail("invalid_resolver_matrix");
  }
  const keys = [
    "target",
    "scenario",
    "expected_match_count",
    "observed_match_count",
    "classification",
    "business_write_count",
    "private_consumer_call_count",
    "executor_call_count",
    "public_sensitive_material_count",
    "passed",
  ];
  for (let index = 0; index < RESOLVER_SCENARIOS.length; index += 1) {
    const row = value[index];
    const definition = RESOLVER_SCENARIOS[index];
    requireExactKeys(row, keys, "invalid_resolver_matrix");
    if (
      row.target !== definition.target
      || row.scenario !== definition.scenario
      || row.expected_match_count !== definition.expectedMatchCount
      || row.observed_match_count !== definition.expectedMatchCount
      || row.classification !== expectedClassification(definition.expectedMatchCount)
      || row.business_write_count !== 0
      || row.private_consumer_call_count !== (definition.expectedMatchCount === 1 ? 1 : 0)
      || row.executor_call_count !== 0
      || row.public_sensitive_material_count !== 0
      || row.passed !== true
    ) {
      fail("invalid_resolver_matrix");
    }
  }
}

function validateMeasuredChecks(value) {
  requireExactKeys(value, ["fixture_integrity", "resolver_safe_matrix"], "invalid_measured_checks");
  requireExactKeys(value.fixture_integrity, ["status", "value"], "invalid_measured_checks");
  requireExactKeys(
    value.resolver_safe_matrix,
    ["status", "value", "passed", "total"],
    "invalid_measured_checks",
  );
  if (
    value.fixture_integrity.status !== "measured"
    || value.fixture_integrity.value !== true
    || value.resolver_safe_matrix.status !== "measured"
    || value.resolver_safe_matrix.value !== true
    || value.resolver_safe_matrix.passed !== 6
    || value.resolver_safe_matrix.total !== 6
  ) {
    fail("invalid_measured_checks");
  }
}

function validateUnmeasuredMetrics(value) {
  if (!Array.isArray(value) || value.length !== UNMEASURED_METRICS.length) {
    fail("invalid_unmeasured_metric");
  }
  for (let index = 0; index < UNMEASURED_METRICS.length; index += 1) {
    requireExactKeys(
      value[index],
      ["metric", "status", "value", "unit", "reason_code"],
      "invalid_unmeasured_metric",
    );
    if (canonicalJson(value[index]) !== canonicalJson(UNMEASURED_METRICS[index])) {
      fail("invalid_unmeasured_metric");
    }
  }
}

function validateSafetyBoundaries(value) {
  const expected = {
    enterprise_data_used: false,
    live_feishu_used: false,
    live_openapi_used: false,
    vehicle_control_executed: false,
    automatic_liability_decision: false,
    automatic_compensation_decision: false,
    final_root_cause_confirmed: false,
    business_outcome_claimed: false,
  };
  requireExactKeys(value, Object.keys(expected), "invalid_safety_boundaries");
  if (canonicalJson(value) !== canonicalJson(expected)) fail("invalid_safety_boundaries");
}

function assertNoSensitivePublicMaterial(value) {
  const forbiddenKeys = new Set([
    "locator",
    "record_id",
    "base_id",
    "table_id",
    "app_id",
    "field_id",
    "provider",
    "message",
    "stack",
  ]);
  const visit = (entry) => {
    if (Array.isArray(entry)) {
      for (const item of entry) visit(item);
      return;
    }
    if (!isPlainObject(entry)) {
      if (
        typeof entry === "string"
        && (/PRIVATE-/u.test(entry) || /https?:\/\//u.test(entry) || /[\w.+-]+@[\w.-]+/u.test(entry))
      ) {
        fail("sensitive_output_rejected");
      }
      return;
    }
    for (const [key, nested] of Object.entries(entry)) {
      if (forbiddenKeys.has(key)) fail("sensitive_output_rejected");
      visit(nested);
    }
  };
  visit(value);
}

function validateReport(value) {
  requireExactKeys(value, TOP_LEVEL_KEYS, "invalid_report_schema");
  if (
    value.schema_version !== REPORT_SCHEMA_VERSION
    || value.data_scope !== DATA_SCOPE
    || value.evidence_class !== EVIDENCE_CLASS
    || value.artifact_scope !== "local_synthetic_contract_evidence"
    || value.digest_contract !== DIGEST_CONTRACT
    || typeof value.report_digest_sha256 !== "string"
    || !/^[a-f0-9]{64}$/u.test(value.report_digest_sha256)
  ) {
    fail("invalid_report_schema");
  }
  validateFixture(value.fixture);
  validatePopulations(value.populations);
  validateResolverMatrix(value.resolver_matrix);
  validateRunContract(value.run_contract);
  validateMeasuredChecks(value.measured_checks);
  validateUnmeasuredMetrics(value.unmeasured_metrics);
  validateSafetyBoundaries(value.safety_boundaries);
  assertNoSensitivePublicMaterial(value);

  const { report_digest_sha256: reportDigestSha256, ...digestInput } = value;
  if (sha256(canonicalJson(digestInput)) !== reportDigestSha256) {
    fail("invalid_report_digest");
  }
}

export async function buildSyntheticEvidenceBaseline(options = {}) {
  requireExactKeys(options, ["projectRoot"], "invalid_project_root");
  const { projectRoot } = options;
  if (typeof projectRoot !== "string" || !isAbsolute(projectRoot)) {
    fail("invalid_project_root");
  }
  let canonicalProjectRoot;
  try {
    canonicalProjectRoot = realpathSync.native(resolve(projectRoot));
  } catch {
    fail("invalid_project_root");
  }
  const fixtureTruth = await inspectFixtures(canonicalProjectRoot);
  const resolverBuildInputs = inspectResolverBuildInputs(projectRoot);
  if (!isSupportedNodeVersion(process.version)) fail("unsupported_node_runtime");

  const resolverEvaluation = await evaluateResolverMatrix(resolverBuildInputs);
  const resolverBuild = {
    ...resolverBuildInputs.resolverBuildInput,
    ...resolverEvaluation.emittedBuild,
  };
  const runtime = {
    node_version: process.version,
    node_runtime_supported: true,
    ...resolverBuildInputs.runtimeInput,
  };
  runtime.toolchain_digest_sha256 = sha256(canonicalJson({
    ...runtime,
    resolver_build_input_digest_sha256: resolverBuild.input_digest_sha256,
    emitted_js_bundle_sha256: resolverBuild.emitted_js_bundle_sha256,
  }));
  const digestInput = {
    schema_version: REPORT_SCHEMA_VERSION,
    data_scope: DATA_SCOPE,
    evidence_class: EVIDENCE_CLASS,
    artifact_scope: "local_synthetic_contract_evidence",
    fixture: fixtureTruth.fixture,
    populations: fixtureTruth.populations,
    resolver_matrix: resolverEvaluation.rows,
    run_contract: {
      run_kind: "local_synthetic_reproducible",
      command_class: "local_readonly_evaluation",
      evaluation_status: "completed",
      exit_code: 0,
      runtime,
      resolver_build: resolverBuild,
      clock_policy: {
        clock_mode: "excluded_from_digest",
        observed_at: null,
        execution_time_claimed: false,
      },
      matrix_sample_count: resolverEvaluation.rows.length,
      output_directory_bound_to_digest: false,
    },
    measured_checks: {
      fixture_integrity: { status: "measured", value: true },
      resolver_safe_matrix: { status: "measured", value: true, passed: 6, total: 6 },
    },
    unmeasured_metrics: UNMEASURED_METRICS.map((metric) => ({ ...metric })),
    safety_boundaries: {
      enterprise_data_used: false,
      live_feishu_used: false,
      live_openapi_used: false,
      vehicle_control_executed: false,
      automatic_liability_decision: false,
      automatic_compensation_decision: false,
      final_root_cause_confirmed: false,
      business_outcome_claimed: false,
    },
    digest_contract: DIGEST_CONTRACT,
  };
  const report = {
    ...digestInput,
    report_digest_sha256: sha256(canonicalJson(digestInput)),
  };
  validateReport(report);
  return deepFreeze(report);
}

export function serializeSyntheticEvidenceBaseline(report) {
  validateReport(report);
  return `${JSON.stringify(report, null, 2)}\n`;
}

function inspectExactExistingPath(path, expectedType, errorCode) {
  if (typeof path !== "string" || !isAbsolute(path)) fail(errorCode);
  const resolvedPath = resolve(path);
  const root = parse(resolvedPath).root;
  let current = root;
  const components = relative(root, resolvedPath).split(sep).filter(Boolean);
  try {
    for (const component of components) {
      const exactNames = readdirSync(current);
      if (!exactNames.includes(component)) fail(errorCode);
      current = join(current, component);
      if (lstatSync(current).isSymbolicLink()) fail(errorCode);
    }
    const stat = lstatSync(resolvedPath);
    if (
      (expectedType === "directory" && !stat.isDirectory())
      || (expectedType === "file" && !stat.isFile())
      || realpathSync.native(resolvedPath) !== resolvedPath
    ) {
      fail(errorCode);
    }
    return { path: resolvedPath, stat };
  } catch (error) {
    if (error instanceof SyntheticEvidenceBaselineError) throw error;
    fail(errorCode);
  }
}

function isInsideOrEqual(parentPath, candidatePath) {
  const relationship = relative(parentPath, candidatePath);
  return relationship === "" || (
    relationship !== ".."
    && !relationship.startsWith(`..${sep}`)
    && !isAbsolute(relationship)
  );
}

function sameIdentity(left, right) {
  return left.dev === right.dev && left.ino === right.ino;
}

function inspectOutputDestination({ projectRoot, trustedOutputRoot, outputDirectory }) {
  if (typeof outputDirectory !== "string" || !isAbsolute(outputDirectory)) {
    fail("invalid_output_directory");
  }
  const project = inspectExactExistingPath(projectRoot, "directory", "invalid_project_root");
  const resolvedOutputDirectory = resolve(outputDirectory);
  if (isInsideOrEqual(project.path, resolvedOutputDirectory)) {
    fail("output_directory_inside_project");
  }
  const trustedRoot = inspectExactExistingPath(
    trustedOutputRoot,
    "directory",
    "untrusted_output_root",
  );
  if (
    resolvedOutputDirectory === trustedRoot.path
    || dirname(resolvedOutputDirectory) !== trustedRoot.path
  ) {
    fail("invalid_output_directory");
  }
  let existingOutput;
  try {
    existingOutput = lstatSync(resolvedOutputDirectory);
  } catch (error) {
    if (error?.code !== "ENOENT") fail("invalid_output_directory");
  }
  if (existingOutput) fail("output_write_failed");
  return {
    outputDirectory: resolvedOutputDirectory,
    trustedRoot,
  };
}

async function writeVerifiedArtifact(destination, serialized) {
  const artifactBytes = Buffer.from(serialized, "utf8");
  const trustedRootBeforeMkdir = inspectExactExistingPath(
    destination.trustedRoot.path,
    "directory",
    "output_write_failed",
  );
  if (!sameIdentity(destination.trustedRoot.stat, trustedRootBeforeMkdir.stat)) {
    fail("output_write_failed");
  }
  try {
    await mkdir(destination.outputDirectory, { recursive: false, mode: 0o700 });
  } catch {
    fail("output_write_failed");
  }
  const output = inspectExactExistingPath(
    destination.outputDirectory,
    "directory",
    "output_write_failed",
  );
  const trustedRootAfterMkdir = inspectExactExistingPath(
    destination.trustedRoot.path,
    "directory",
    "output_write_failed",
  );
  if (
    !sameIdentity(destination.trustedRoot.stat, trustedRootAfterMkdir.stat)
    || dirname(output.path) !== destination.trustedRoot.path
  ) {
    fail("output_write_failed");
  }

  const artifactPath = resolve(output.path, OUTPUT_FILE_NAME);
  const noFollow = fsConstants.O_NOFOLLOW;
  if (!Number.isInteger(noFollow)) fail("output_write_failed");
  let handle;
  let openedStat;
  try {
    handle = await open(
      artifactPath,
      fsConstants.O_RDWR | fsConstants.O_CREAT | fsConstants.O_EXCL | noFollow,
      0o600,
    );
    let writeOffset = 0;
    while (writeOffset < artifactBytes.length) {
      const { bytesWritten } = await handle.write(
        artifactBytes,
        writeOffset,
        artifactBytes.length - writeOffset,
        writeOffset,
      );
      if (bytesWritten <= 0) fail("output_write_failed");
      writeOffset += bytesWritten;
    }
    await handle.sync();
    openedStat = await handle.stat();
    const observedBytes = Buffer.alloc(artifactBytes.length);
    let readOffset = 0;
    while (readOffset < observedBytes.length) {
      const { bytesRead } = await handle.read(
        observedBytes,
        readOffset,
        observedBytes.length - readOffset,
        readOffset,
      );
      if (bytesRead <= 0) fail("output_write_failed");
      readOffset += bytesRead;
    }
    if (!observedBytes.equals(artifactBytes)) fail("output_write_failed");
  } catch (error) {
    if (error instanceof SyntheticEvidenceBaselineError) throw error;
    fail("output_write_failed");
  } finally {
    if (handle) await handle.close().catch(() => {});
  }

  const artifact = inspectExactExistingPath(artifactPath, "file", "output_write_failed");
  const outputAfterWrite = inspectExactExistingPath(
    destination.outputDirectory,
    "directory",
    "output_write_failed",
  );
  const trustedRootAfterWrite = inspectExactExistingPath(
    destination.trustedRoot.path,
    "directory",
    "output_write_failed",
  );
  const verifiedArtifactBytes = readFileSync(artifact.path);
  const artifactAfterRead = inspectExactExistingPath(
    artifactPath,
    "file",
    "output_write_failed",
  );
  const outputAfterRead = inspectExactExistingPath(
    destination.outputDirectory,
    "directory",
    "output_write_failed",
  );
  const trustedRootAfterRead = inspectExactExistingPath(
    destination.trustedRoot.path,
    "directory",
    "output_write_failed",
  );
  if (
    !openedStat
    || !sameIdentity(openedStat, artifact.stat)
    || !sameIdentity(artifact.stat, artifactAfterRead.stat)
    || openedStat.size !== artifactBytes.length
    || openedStat.nlink !== 1
    || !sameIdentity(output.stat, outputAfterWrite.stat)
    || !sameIdentity(outputAfterWrite.stat, outputAfterRead.stat)
    || !sameIdentity(destination.trustedRoot.stat, trustedRootAfterWrite.stat)
    || !sameIdentity(trustedRootAfterWrite.stat, trustedRootAfterRead.stat)
    || sha256(verifiedArtifactBytes) !== sha256(artifactBytes)
  ) {
    fail("output_write_failed");
  }
  return sha256(artifactBytes);
}

export async function writeSyntheticEvidenceBaseline({
  projectRoot,
  trustedOutputRoot,
  outputDirectory,
} = {}) {
  const destination = inspectOutputDestination({
    projectRoot,
    trustedOutputRoot,
    outputDirectory,
  });
  const report = await buildSyntheticEvidenceBaseline({ projectRoot });
  const serialized = serializeSyntheticEvidenceBaseline(report);
  const artifactSha256 = await writeVerifiedArtifact(destination, serialized);
  return deepFreeze({
    output_location_class: "trusted_outputs_direct_child",
    artifact_file: OUTPUT_FILE_NAME,
    report_digest_sha256: report.report_digest_sha256,
    artifact_sha256: artifactSha256,
  });
}

function parseCliArguments(argv) {
  if (argv.length !== 2 || argv[0] !== "--output-dir" || !isAbsolute(argv[1])) {
    fail("invalid_cli_arguments");
  }
  return { outputDirectory: argv[1] };
}

const isMain = process.argv[1]
  && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;

if (isMain) {
  try {
    const { outputDirectory } = parseCliArguments(process.argv.slice(2));
    const projectRoot = resolve(import.meta.dirname, "..");
    const trustedOutputRoot = resolve(projectRoot, "../..", "outputs");
    const result = await writeSyntheticEvidenceBaseline({
      projectRoot,
      trustedOutputRoot,
      outputDirectory,
    });
    process.stdout.write(`${JSON.stringify({
      status: "local_synthetic_baseline_written",
      output_location_class: "workspace_outputs_direct_child",
      artifact_file: result.artifact_file,
      report_digest_sha256: result.report_digest_sha256,
      artifact_sha256: result.artifact_sha256,
    })}\n`);
  } catch (error) {
    const code = error instanceof SyntheticEvidenceBaselineError ? error.code : "unexpected_failure";
    process.stderr.write(`${JSON.stringify({ status: "failed", code })}\n`);
    process.exitCode = 1;
  }
}
