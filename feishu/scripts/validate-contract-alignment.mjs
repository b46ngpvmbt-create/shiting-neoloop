#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "../..");

const EXPECTED_R6_FREEZE = Object.freeze({
  record: "../../src/neoloop/records/2026-08-03-t3-r6-p1-fix-3.md",
  record_sha256: "066fbf566dfb23eefc640d3e366e2af6d2bc774e33f78b4f3823987c06d99a14",
  model_sha256: "622e65f2d4ee3b9fc0757a914fc57401c4b1f0cde264747c638a06c7408cc753",
  repository_sha256: "1714941412abd7965f823b873257f99f26cba84210cf87c457bd0ec5c5b7428b",
  w6_improvement_sha256: "34ea5299c82211ec19e0042a0ff3624d9fa5c36936336514fdb42344fa7cbd85",
  index_sha256: "c111b505a23ff807a616311567c7c3b1f66da8d2a4eb88f2e5e30b76fb2e4cd3",
  w6_repository_test_sha256: "be8210c323c5a95a13824ba476c5ba31896f676fb626a0a7f73fb74d6132b0fb",
  w6_improvement_test_sha256: "c807ccb527db285a3a02a1c9ff2b46206dcac7edfa1c2cdde1c4fb0b3b242972",
});

const EXPECTED_R7_FREEZE = Object.freeze({
  record: "../../src/neoloop/records/2026-08-03-t3-r7-batch-d1-observation-checkpoints.md",
  record_sha256: "105455035fea536757bdc52e199ff8ca6eb631e623626ab1e6e5e0760aa71acd",
  model_sha256: "622e65f2d4ee3b9fc0757a914fc57401c4b1f0cde264747c638a06c7408cc753",
  repository_sha256: "1714941412abd7965f823b873257f99f26cba84210cf87c457bd0ec5c5b7428b",
  w6_improvement_sha256: "fcf3393c67ea1539e98545179898e04a3f48c392011afaae81d339a141a73b07",
  index_sha256: "c111b505a23ff807a616311567c7c3b1f66da8d2a4eb88f2e5e30b76fb2e4cd3",
  w6_repository_test_sha256: "be8210c323c5a95a13824ba476c5ba31896f676fb626a0a7f73fb74d6132b0fb",
  w6_improvement_test_sha256: "314055ff5956ed9da5a3db53456f176875e407db84077cb1e6f0f123f4055028",
});

const EXPECTED_R6_RECORD_DECLARATIONS = Object.freeze({
  "repository.ts": EXPECTED_R6_FREEZE.repository_sha256,
  "w6-repository.test.mjs": EXPECTED_R6_FREEZE.w6_repository_test_sha256,
  "w6-improvement.test.mjs": EXPECTED_R6_FREEZE.w6_improvement_test_sha256,
  "model.ts": EXPECTED_R6_FREEZE.model_sha256,
  "w6-improvement.ts": EXPECTED_R6_FREEZE.w6_improvement_sha256,
  "index.ts": EXPECTED_R6_FREEZE.index_sha256,
});

const EXPECTED_R7_RECORD_DECLARATIONS = Object.freeze({
  "src/neoloop/workflows/w6-improvement.ts": EXPECTED_R7_FREEZE.w6_improvement_sha256,
  "tests/core/w6-improvement.test.mjs": EXPECTED_R7_FREEZE.w6_improvement_test_sha256,
  "src/neoloop/workflows/repository.ts": EXPECTED_R7_FREEZE.repository_sha256,
  "src/neoloop/workflows/model.ts": EXPECTED_R7_FREEZE.model_sha256,
  "src/neoloop/workflows/index.ts": EXPECTED_R7_FREEZE.index_sha256,
  "tests/core/w6-repository.test.mjs": EXPECTED_R7_FREEZE.w6_repository_test_sha256,
});

const EXPECTED_R7_RECORD_SUFFIXES = Object.freeze({
  "src/neoloop/workflows/repository.ts": "（本轮未改）",
  "src/neoloop/workflows/model.ts": "（本轮未改）",
  "src/neoloop/workflows/index.ts": "（本轮未改）",
  "tests/core/w6-repository.test.mjs": "（本轮未改）",
});

const EXPECTED_R9_RECORD_SHA256 = "2bf72098ba30627e5217549b1fd1bcbed958ad745ec537efc69ec295016aea0a";
const EXPECTED_R9_FREEZE = Object.freeze({
  "src/neoloop/workflows/w6-improvement.ts": "22990e48fadbdfa8c97b7e3deac72fd5e403d9636753f4b2d64974c5a1a16485",
  "src/neoloop/workflows/repository.ts": "789968005ac9c8c96c3773bcbdeb44d48741b8cfcb5f20f9dc91b5557b568e34",
  "tests/core/w6-improvement.test.mjs": "4c31ebdf59be57d66c58fccb999cabaaef34988f5819eda49e81e9dd796bc0ed",
  "src/neoloop/workflows/model.ts": "622e65f2d4ee3b9fc0757a914fc57401c4b1f0cde264747c638a06c7408cc753",
  "src/neoloop/workflows/index.ts": "c111b505a23ff807a616311567c7c3b1f66da8d2a4eb88f2e5e30b76fb2e4cd3",
  "tests/core/w6-repository.test.mjs": "be8210c323c5a95a13824ba476c5ba31896f676fb626a0a7f73fb74d6132b0fb",
});

const EXPECTED_R10_FREEZE = Object.freeze({
  core: "../../src/neoloop/adapters/feishu/w6-reopen-projector.ts",
  core_sha256: "47a429d650e663d008b25dd023f7fc2ed71286bf92708de1252db7fa302b7ffd",
  test: "../../tests/core/feishu-w6-reopen-projector.test.mjs",
  test_sha256: "13e38abf203fc13695ff2e0dda81193088187cc22dfb3c0f3f53bd8452a726dd",
  record: "../../src/neoloop/records/2026-08-04-t3-r10-feishu-reopen-projector.md",
  record_sha256: "81634c132c7206f9230a1000d8f808b8c49b77654ffd4cda5ec28c798acf4f10",
});

const EXPECTED_R10_RECORD_DECLARATIONS = Object.freeze({
  "src/neoloop/adapters/feishu/w6-reopen-projector.ts": EXPECTED_R10_FREEZE.core_sha256,
  "tests/core/feishu-w6-reopen-projector.test.mjs": EXPECTED_R10_FREEZE.test_sha256,
});

const PERMISSION_CONTRACT_REPORT_SCHEMA_VERSION = "contract_alignment_report.v1";
const PERMISSION_CONTRACT_FATAL_REPORT_SCHEMA_VERSION = "contract_alignment_fatal_report.v1";
const PERMISSION_RESULT_ATTESTATION_SCHEMA_VERSION = "permission_result_contract_attestation.v1";
const PERMISSION_CONTENT_SOURCE_FREEZE_VERSION = "permission_content_source_freeze.v1";
const CONTRACT_FATAL_REPORT_ROOT_KEYS = Object.freeze([
  "report_schema_version", "status", "mode", "stage", "fatal_code", "failed_artifacts",
]);
const CONTRACT_FATAL_ARTIFACT_KEYS = Object.freeze(["source", "path", "reason_codes"]);
const EXPECTED_PERMISSION_CONTENT_SOURCES = Object.freeze([
  Object.freeze({ id: "probe_suite", path: "feishu/manifests/day-1-probe-suite.v0.1.json", sha256: "b483a2d746aec0caac00fd7f04ecd81ca5c232e0060207e540a024bf1b5e69c1" }),
  Object.freeze({ id: "permission_results", path: "feishu/evidence/day-1-probe-results.example.json", sha256: "af499c929b722b1ec996a5ba916a7d395162364435d59f5ed105f286bc3ff30b" }),
  Object.freeze({ id: "evidence_template", path: "feishu/evidence/on-site-evidence-template.json", sha256: "8b5a9822069fb8faca4584803fe5c84bf778bb34e7fb50cf97a19c1febf5ef3a" }),
  Object.freeze({ id: "permission_acceptance", path: "feishu/runbooks/day-1-permission-acceptance.md", sha256: "ca76396650706bb47e5fecf37444de6a36e1cf71dd7b9a827219093eb3fd8241" }),
  Object.freeze({ id: "permission_matrix", path: "feishu/runbooks/day-1-permission-matrix.md", sha256: "66f22b5608f5d7a2ce7cc36c7ab4f5eff7244b162d4669c7839051e66bae90f8" }),
]);
const EXPECTED_PERMISSION_CONTENT_SOURCE_DIGEST = "1595eb62c6d9fbea8078ae89cb5df5fe82db881f47ce827b4330ebf319f462fa";
const EXPECTED_PERMISSION_NEGATIVE_FIXTURE_NAME_DIGEST = "8035213874adc53e71d860549a4c45fabbf49acd62c11edb4016fec3feec1522";

const EXPECTED_MATERIAL_SHA256 = Object.freeze({
  canonical_manifest: "3e3ebc6a8aaf1f0692db39b0c763b081df2ef5f9db6f6d8da9f3a0ab8edbe8b7",
  main_story: "1584fceecbfbbf4d63eee9ac69ed998505985d0f51a4a1b508d28976dcce690c",
  failure_drills: "c8893a7a706f1b3a8051d16b855a35372690bbc780ca060cb8768219dbc0312a",
});

const paths = {
  t1Manifest: path.join(repositoryRoot, "data/canonical/manifest.json"),
  t1Tables: path.join(repositoryRoot, "data/canonical/tables"),
  t2Manifest: path.join(repositoryRoot, "feishu/manifests/neoloop-logical-manifest.v0.1.json"),
  t2PermissionMatrix: path.join(repositoryRoot, "feishu/runbooks/day-1-permission-matrix.md"),
  t3Contract: path.join(repositoryRoot, "src/neoloop/contracts/model.ts"),
  t3W6Model: path.join(repositoryRoot, "src/neoloop/workflows/model.ts"),
  t3Repository: path.join(repositoryRoot, "src/neoloop/workflows/repository.ts"),
  t3W6Improvement: path.join(repositoryRoot, "src/neoloop/workflows/w6-improvement.ts"),
  t3Index: path.join(repositoryRoot, "src/neoloop/workflows/index.ts"),
  t3W6RepositoryTest: path.join(repositoryRoot, "tests/core/w6-repository.test.mjs"),
  t3W6ImprovementTest: path.join(repositoryRoot, "tests/core/w6-improvement.test.mjs"),
  t3R6Record: path.join(repositoryRoot, "src/neoloop/records/2026-08-03-t3-r6-p1-fix-3.md"),
  t3R7Record: path.join(repositoryRoot, "src/neoloop/records/2026-08-03-t3-r7-batch-d1-observation-checkpoints.md"),
  t3R9Record: path.join(repositoryRoot, "src/neoloop/records/2026-08-03-t3-r9-batch-e-security-repair.md"),
  r10Core: path.join(repositoryRoot, "src/neoloop/adapters/feishu/w6-reopen-projector.ts"),
  r10Test: path.join(repositoryRoot, "tests/core/feishu-w6-reopen-projector.test.mjs"),
  r10Record: path.join(repositoryRoot, "src/neoloop/records/2026-08-04-t3-r10-feishu-reopen-projector.md"),
  buildPackage: path.join(repositoryRoot, "feishu/manifests/on-site-build-package.v0.1.json"),
  probeSuite: path.join(repositoryRoot, "feishu/manifests/day-1-probe-suite.v0.1.json"),
  permissionResults: path.join(repositoryRoot, "feishu/evidence/day-1-probe-results.example.json"),
  permissionAcceptance: path.join(repositoryRoot, "feishu/runbooks/day-1-permission-acceptance.md"),
  importPlan: path.join(repositoryRoot, "feishu/manifests/base-import-batch-plan.v0.1.json"),
  smokePlan: path.join(repositoryRoot, "feishu/manifests/on-site-smoke-plan.v0.1.json"),
  evidenceTemplate: path.join(repositoryRoot, "feishu/evidence/on-site-evidence-template.json"),
  mainStory: path.join(repositoryRoot, "data/canonical/scenarios/main-story.json"),
  failureDrills: path.join(repositoryRoot, "data/canonical/scenarios/failure-drills.json"),
};

const errors = [];
const upstreamConflicts = [];
const checks = [];
const tableFieldChecks = {};

function pass(name, details = undefined, group = "canonical_contract_alignment") {
  checks.push(details === undefined ? { name, group, ok: true } : { name, group, ok: true, details });
}

function fail(name, details, group = "canonical_contract_alignment") {
  errors.push({ name, details });
  checks.push({ name, group, ok: false, details });
}

function assert(name, condition, details, group = "canonical_contract_alignment") {
  if (condition) {
    pass(name, undefined, group);
  } else {
    fail(name, details, group);
  }
}

function assertInGroup(group, name, condition, details) {
  assert(name, condition, details, group);
}

function sorted(values) {
  return [...values].sort();
}

function equalArrays(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function equalSets(left, right) {
  return equalArrays(sorted(new Set(left)), sorted(new Set(right)));
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function exactFlatObject(actual, expected) {
  return actual !== null
    && typeof actual === "object"
    && !Array.isArray(actual)
    && equalArrays(sorted(Object.keys(actual)), sorted(Object.keys(expected)))
    && Object.entries(expected).every(([key, value]) => actual[key] === value);
}

function hasExactKeys(actual, expectedKeys) {
  return actual !== null
    && typeof actual === "object"
    && !Array.isArray(actual)
    && equalArrays(sorted(Object.keys(actual)), sorted(expectedKeys));
}

function contractFatalReport(failedArtifacts = []) {
  return {
    report_schema_version: PERMISSION_CONTRACT_FATAL_REPORT_SCHEMA_VERSION,
    status: "failed",
    mode: "read_only",
    stage: "strict_raw_JSON_input",
    fatal_code: "contract_validator_fatal",
    failed_artifacts: failedArtifacts,
  };
}

function contractFatalReportHasExactShape(report) {
  return hasExactKeys(report, CONTRACT_FATAL_REPORT_ROOT_KEYS)
    && report.report_schema_version === PERMISSION_CONTRACT_FATAL_REPORT_SCHEMA_VERSION
    && report.status === "failed"
    && report.mode === "read_only"
    && report.stage === "strict_raw_JSON_input"
    && report.fatal_code === "contract_validator_fatal"
    && Array.isArray(report.failed_artifacts)
    && report.failed_artifacts.every((artifact) => hasExactKeys(artifact, CONTRACT_FATAL_ARTIFACT_KEYS)
      && typeof artifact.source === "string"
      && artifact.source.length > 0
      && typeof artifact.path === "string"
      && artifact.path.length > 0
      && Array.isArray(artifact.reason_codes)
      && artifact.reason_codes.length > 0
      && artifact.reason_codes.every((reason) => typeof reason === "string" && reason.length > 0));
}

function serializeContractFatalReport(report) {
  const selected = contractFatalReportHasExactShape(report) ? report : contractFatalReport([{
    source: "validator",
    path: "feishu/scripts/validate-contract-alignment.mjs",
    reason_codes: ["invalid_fatal_report_shape"],
  }]);
  return JSON.stringify(selected, null, 2);
}

function markdownSection(source, heading) {
  const start = source.indexOf(`${heading}\n`);
  if (start === -1) return null;
  const contentStart = start + heading.length + 1;
  const remainder = source.slice(contentStart);
  const nextHeading = remainder.search(/^## /m);
  return nextHeading === -1 ? remainder : remainder.slice(0, nextHeading);
}

function isFrozenSha256(value) {
  return typeof value === "string"
    && /^[0-9a-f]{64}$/.test(value)
    && !/^([0-9a-f])\1{63}$/.test(value)
    && value !== "deadbeef".repeat(8)
    && value !== "cafebabe".repeat(8);
}

const CANONICAL_MARKDOWN_SHA_DECLARATION = /^- `([^`\r\n]+)`：`([0-9a-f]{64})`(（本轮未改）)?$/;

function expectedTargetIdentity(declaredPath, mode) {
  if (mode === "basename") return path.basename(declaredPath);
  const resolved = path.resolve(repositoryRoot, declaredPath);
  const relative = path.relative(repositoryRoot, resolved);
  return relative === "" || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)
    ? null
    : resolved;
}

function declarationTargetsExpectedPath(declaredPath, expectedPaths, mode, includeBasename = false) {
  const identity = expectedTargetIdentity(declaredPath, mode);
  if (identity !== null && expectedPaths.some((expectedPath) => expectedTargetIdentity(expectedPath, mode) === identity)) return true;
  return includeBasename && expectedPaths.some((expectedPath) => path.basename(expectedPath) === path.basename(declaredPath));
}

function markdownFreezePathCandidates(line) {
  if (!/^-\s+/.test(line)) return [];
  const candidates = [];
  const pathExpression = /(?:\.{1,2}\/|[A-Za-z0-9_.-]+\/)*[A-Za-z0-9_.-]+\.(?:ts|mjs|md|json)/g;
  for (const match of line.matchAll(pathExpression)) {
    const declaredPath = match[0];
    const tail = line.slice((match.index ?? 0) + declaredPath.length);
    const declarationSignal = /^\s*`?\s*[:：]/.test(tail)
      || /^\s*`?\s*`?\s*(?:[0-9A-Fa-f]{16,}|placeholder)/i.test(tail);
    if (declarationSignal) candidates.push(declaredPath);
  }
  return candidates;
}

function analyzeMarkdownFreezeDeclarations({ source, heading, expected, expectedSuffixes = {}, mode = "repository_path" }) {
  const expectedPaths = Object.keys(expected);
  const section = markdownSection(source, heading);
  const violations = [];
  const canonicalDeclarations = [];
  const sectionLines = typeof section === "string" ? section.split(/\r?\n/) : [];

  if (section === null) violations.push({ kind: "missing_section", heading });
  const headingCount = source.split(/\r?\n/).filter((line) => line === heading).length;
  if (headingCount !== 1) violations.push({ kind: "heading_not_unique", heading, count: headingCount });

  for (const line of sectionLines) {
    const sectionCandidates = markdownFreezePathCandidates(line);
    if (sectionCandidates.length === 0) continue;
    const canonicalMatch = line.match(CANONICAL_MARKDOWN_SHA_DECLARATION);
    if (!canonicalMatch) {
      violations.push({ kind: "non_canonical_candidate", line });
      continue;
    }
    const declaration = { path: canonicalMatch[1], sha256: canonicalMatch[2], suffix: canonicalMatch[3] ?? "", line };
    canonicalDeclarations.push(declaration);
    if (!expectedPaths.includes(declaration.path)) {
      violations.push({ kind: "unexpected_path", declaration });
      continue;
    }
    if (declaration.suffix !== (expectedSuffixes[declaration.path] ?? "")) {
      violations.push({ kind: "unexpected_suffix", declaration, expected_suffix: expectedSuffixes[declaration.path] ?? "" });
    }
    if (!isFrozenSha256(declaration.sha256) || declaration.sha256 !== expected[declaration.path]) {
      violations.push({ kind: "invalid_or_mismatched_sha256", declaration });
    }
  }

  const globalCandidates = source.split(/\r?\n/).flatMap((line, lineIndex) => {
    return markdownFreezePathCandidates(line)
      .filter((declaredPath) => declarationTargetsExpectedPath(declaredPath, expectedPaths, mode, true))
      .map((declaredPath) => ({ line, line_number: lineIndex + 1, declared_path: declaredPath }));
  });

  const observed = Object.fromEntries(canonicalDeclarations.map((entry) => [entry.path, entry.sha256]));
  const exactCanonicalSet = canonicalDeclarations.length === expectedPaths.length
    && exactFlatObject(observed, expected);
  if (!exactCanonicalSet) {
    violations.push({ kind: "canonical_set_mismatch", expected, observed, count: canonicalDeclarations.length });
  }
  if (globalCandidates.length !== expectedPaths.length) {
    violations.push({ kind: "target_declarations_not_globally_unique", expected_count: expectedPaths.length, candidates: globalCandidates });
  }
  for (const candidate of globalCandidates) {
    const canonicalMatch = candidate.line.match(CANONICAL_MARKDOWN_SHA_DECLARATION);
    if (!canonicalMatch
      || !expectedPaths.includes(canonicalMatch[1])
      || (canonicalMatch[3] ?? "") !== (expectedSuffixes[canonicalMatch[1]] ?? "")) {
      violations.push({ kind: "target_alias_or_non_canonical_global_declaration", candidate });
    }
  }

  return {
    ok: violations.length === 0,
    declarations: canonicalDeclarations.map(({ path: declaredPath, sha256: digest, suffix }) => ({ path: declaredPath, sha256: digest, suffix })),
    violations,
  };
}

function sourceDescriptor(filePath, contents) {
  return {
    path: path.relative(repositoryRoot, filePath).split(path.sep).join("/"),
    sha256: sha256(contents),
  };
}

const CANONICAL_REPOSITORY_PATH_SEGMENT = /^[A-Za-z0-9._-]+$/;

function analyzeCanonicalRepositoryRelativePath(reference) {
  if (typeof reference !== "string" || reference === "" || reference === "." || reference === "..") {
    return { valid: false, reason: "empty_or_dot_repository_relative_path" };
  }
  if (path.posix.isAbsolute(reference) || path.win32.isAbsolute(reference)) {
    return { valid: false, reason: "absolute_repository_path_not_allowed" };
  }
  if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(reference)) {
    return { valid: false, reason: "scheme_or_drive_relative_path_not_allowed" };
  }
  if (reference.includes("#") || reference.includes("%") || reference.includes("\\") || reference.includes("//")) {
    return { valid: false, reason: "repository_path_delimiter_not_allowed" };
  }

  let remainder = reference;
  let relativeStyle = "bare_relative";
  let leadingParentCount = 0;
  if (remainder.startsWith("./")) {
    relativeStyle = "explicit_current";
    remainder = remainder.slice(2);
  } else {
    while (remainder.startsWith("../")) {
      relativeStyle = "explicit_parent";
      leadingParentCount += 1;
      remainder = remainder.slice(3);
    }
  }

  const segments = remainder.split("/");
  if (remainder === "" || segments.some((segment) => segment === ""
    || segment === "."
    || segment === ".."
    || !CANONICAL_REPOSITORY_PATH_SEGMENT.test(segment))) {
    return { valid: false, reason: "repository_path_segment_outside_ASCII_allowlist" };
  }
  return {
    valid: true,
    relative_style: relativeStyle,
    leading_parent_count: leadingParentCount,
    segments,
  };
}

function resolveRepoReference(sourceFile, reference) {
  const repositoryAnchor = "/__repository__";
  const sourceRelative = path.relative(repositoryRoot, sourceFile).split(path.sep).join("/");
  const sourceBounded = sourceRelative !== ""
    && sourceRelative !== ".."
    && !sourceRelative.startsWith("../")
    && !path.posix.isAbsolute(sourceRelative);
  const canonicalReference = analyzeCanonicalRepositoryRelativePath(reference);
  const locatorIsInvalid = !canonicalReference.valid;
  if (!sourceBounded || locatorIsInvalid) {
    return {
      resolved: null,
      relative: null,
      bounded: false,
      reason: !sourceBounded ? "source_is_outside_repository" : "invalid_locator_for_resolution",
    };
  }
  const sourceVirtual = path.posix.resolve(repositoryAnchor, sourceRelative);
  const targetVirtual = path.posix.resolve(path.posix.dirname(sourceVirtual), reference);
  const bounded = sourceVirtual.startsWith(`${repositoryAnchor}/`)
    && targetVirtual.startsWith(`${repositoryAnchor}/`);
  const relative = path.posix.relative(repositoryAnchor, targetVirtual);
  return {
    resolved: bounded ? path.resolve(repositoryRoot, ...relative.split("/")) : null,
    relative,
    bounded: bounded
      && relative !== ""
      && relative !== "."
      && relative !== ".."
      && !relative.startsWith("../")
      && !path.posix.isAbsolute(relative),
  };
}

const KNOWN_NON_FILE_LOCATOR_SCHEMES = new Set([
  "build",
  "canonical",
  "canonical-scenario",
  "evidence",
  "logical",
  "runtime",
]);
const CANONICAL_REPOSITORY_FILE_EXTENSIONS = Object.freeze([".json", ".md", ".mjs", ".ts"]);
const RECOGNIZED_REFERENCE_EXTENSION_AFTER_PERCENT_DECODE = /\.(?:json|md|mjs|ts)(?=$|[?#%/\\])/i;
const RECOGNIZED_PATH_PREFIX_AFTER_PERCENT_DECODE = /^(?:\.\.?[\\/]|[\\/]|[A-Za-z]:[\\/]|\\\\)/;
const RECOGNIZED_INTERNAL_POINTER_PREFIX_AFTER_PERCENT_DECODE = /^#/;
const URI_SCHEME_PREFIX = /^([A-Za-z][A-Za-z0-9+.-]*):/;
const MAX_PERCENT_RECOGNITION_ROUNDS = 4;
const EXPECTED_REFERENCE_CLOSURES = Object.freeze({
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

function hasExactCanonicalRepositoryFileExtension(value) {
  return typeof value === "string"
    && CANONICAL_REPOSITORY_FILE_EXTENSIONS.some((extension) => value.endsWith(extension));
}

function hasCaseInsensitiveRepositoryFileExtension(value) {
  return typeof value === "string"
    && CANONICAL_REPOSITORY_FILE_EXTENSIONS.some((extension) => value.toLowerCase().endsWith(extension));
}

function looksLikeRepositoryFileCandidate(value) {
  if (typeof value !== "string" || value === "") return false;
  const valueHasControlCharacter = /[\u0000-\u001F\u007F]/u.test(value);
  if (valueHasControlCharacter) {
    const recognitionOnlyWithoutControlCharacters = value.replace(/[\u0000-\u001F\u007F]/gu, "");
    if (/\.(?:json|md|mjs|ts)(?=$|[^A-Za-z0-9._-])/i.test(recognitionOnlyWithoutControlCharacters)) return true;
  }
  for (const match of value.matchAll(/\.(?:json|md|mjs|ts)/ig)) {
    const extensionEnd = match.index + match[0].length;
    const suffix = value.slice(extensionEnd);
    const prefix = value.slice(0, match.index);
    if (valueHasControlCharacter) return true;
    const suffixStartsWithPathSyntax = /^[?:/%\\*]/u.test(suffix);
    if (suffixStartsWithPathSyntax) return true;
    const prefixWithoutLeadingWhitespace = prefix.trimStart();
    const prefixHasLeadingWhitespace = prefixWithoutLeadingWhitespace !== prefix;
    const prefixHasInternalWhitespace = /\s/u.test(prefixWithoutLeadingWhitespace);
    const prefixHasPathSignal = /[\/%\\:*?]/u.test(prefixWithoutLeadingWhitespace);
    const prefixLooksLikePathScalar = prefixHasLeadingWhitespace
      || !prefixHasInternalWhitespace
      || prefixHasPathSignal;
    if (!prefixLooksLikePathScalar) continue;
    if (suffix === "") return true;
    const suffixIsOnlyWhitespaceOrDelete = /^[\s\u007F]+$/u.test(suffix);
    const suffixIsTerminalPunctuationWithOptionalWhitespaceOrDelete = /^[\p{Po}\p{Pe}\p{Pf}>＞`]+[\s\u007F]*$/u.test(suffix);
    if (suffixIsOnlyWhitespaceOrDelete
      || suffixIsTerminalPunctuationWithOptionalWhitespaceOrDelete) return true;
  }
  return false;
}

function decodeValidPercentTripletsOnce(value) {
  let changed = false;
  const decoded = value.replace(/%([0-9A-Fa-f]{2})/g, (_match, hexadecimal) => {
    changed = true;
    return String.fromCharCode(Number.parseInt(hexadecimal, 16));
  });
  return { decoded, changed };
}

function inspectPercentEncodedReferenceAlias(value) {
  if (typeof value !== "string" || !value.includes("%")) return null;
  const probes = [];
  let current = value;
  for (let round = 1; round <= MAX_PERCENT_RECOGNITION_ROUNDS; round += 1) {
    const step = decodeValidPercentTripletsOnce(current);
    if (!step.changed) break;
    current = step.decoded;
    probes.push({ round, value: current });
    const revealedKind = RECOGNIZED_INTERNAL_POINTER_PREFIX_AFTER_PERCENT_DECODE.test(current)
      ? "internal_JSON_Pointer_prefix"
      : RECOGNIZED_REFERENCE_EXTENSION_AFTER_PERCENT_DECODE.test(current)
        ? "repository_file_extension"
        : URI_SCHEME_PREFIX.test(current)
          ? "URI_scheme"
          : RECOGNIZED_PATH_PREFIX_AFTER_PERCENT_DECODE.test(current)
            ? "repository_path_prefix"
            : null;
    if (revealedKind !== null) {
      return {
        reason: "percent_encoded_reference_alias_not_allowed",
        revealed_kind: revealedKind,
        recognition_round: round,
        recognition_probe: current,
        probes,
      };
    }
  }
  const remainingEncodedReferenceSyntax = /%(?:25)*(?:2e|2f|3a|3f|23|5c)/i.test(current);
  if (/%[0-9A-Fa-f]{2}/.test(current) && remainingEncodedReferenceSyntax) {
    return {
      reason: "percent_encoding_depth_exceeded",
      recognition_round: MAX_PERCENT_RECOGNITION_ROUNDS,
      recognition_probe: current,
      probes,
    };
  }
  return null;
}

function validateJsonPointerFragmentSyntax(fragment) {
  if (fragment === null) return { valid: true, decoded_pointer: null };
  if (typeof fragment !== "string" || !fragment.startsWith("#") || fragment.slice(1).includes("#")) {
    return { valid: false, reason: "invalid_fragment_marker" };
  }
  let pointer;
  try {
    pointer = decodeURIComponent(fragment.slice(1));
  } catch {
    return { valid: false, reason: "invalid_fragment_percent_encoding" };
  }
  if (pointer === "") return { valid: false, reason: "empty_external_fragment" };
  if (fragment.includes("%")) return { valid: false, reason: "percent_encoded_fragment_alias_not_allowed" };
  if (!pointer.startsWith("/")) return { valid: false, reason: "fragment_is_not_JSON_Pointer" };
  if (pointer.slice(1).split("/").some((token) => /~(?:[^01]|$)/.test(token))) {
    return { valid: false, reason: "invalid_JSON_Pointer_escape" };
  }
  return { valid: true, decoded_pointer: pointer };
}

function classifyRepositoryFileReference(value, sourceFile, referenceResolver = resolveRepoReference) {
  if (typeof value !== "string") return { kind: "not_string" };
  const fragmentIndex = value.indexOf("#");
  const locator = fragmentIndex === -1 ? value : value.slice(0, fragmentIndex);
  const fragment = fragmentIndex === -1 ? null : value.slice(fragmentIndex);
  const invalid = (reason, details = undefined) => ({
    kind: "invalid_repository_file_reference",
    value,
    locator,
    fragment,
    reason,
    ...(details === undefined ? {} : { details }),
  });

  if (value.startsWith("#")) {
    const percentAlias = inspectPercentEncodedReferenceAlias(value);
    return percentAlias === null
      ? { kind: "internal_JSON_Pointer", value }
      : invalid(percentAlias.reason, percentAlias);
  }

  const trimmedValue = value.trim();
  const trimmedSchemeMatch = trimmedValue.match(URI_SCHEME_PREFIX);
  const trimmedSchemeTokenIsRepositoryFilename = trimmedSchemeMatch !== null
    && hasExactCanonicalRepositoryFileExtension(trimmedSchemeMatch[1]);
  if (trimmedValue !== value && trimmedSchemeMatch !== null && !trimmedSchemeTokenIsRepositoryFilename) {
    return invalid("URI_scheme_surrounding_whitespace_not_allowed");
  }

  if (locator.includes("\\")) return invalid("backslash_not_allowed");
  if (path.posix.isAbsolute(locator) || path.win32.isAbsolute(locator)) return invalid("absolute_path_not_allowed");

  const percentAlias = inspectPercentEncodedReferenceAlias(locator);
  if (percentAlias !== null) return invalid(percentAlias.reason, percentAlias);
  const fragmentPromotesRepositoryFileCandidate = fragmentIndex !== -1
    && hasCaseInsensitiveRepositoryFileExtension(locator);
  const looksLikeRepositoryFile = looksLikeRepositoryFileCandidate(locator)
    || fragmentPromotesRepositoryFileCandidate;
  if (locator.includes("%") && (locator.startsWith("./") || locator.startsWith("../") || looksLikeRepositoryFile)) {
    return invalid("invalid_locator_percent_encoding");
  }

  if (looksLikeRepositoryFile && !hasExactCanonicalRepositoryFileExtension(locator)) {
    return invalid("non_canonical_file_extension");
  }

  const schemeMatch = value.match(URI_SCHEME_PREFIX);
  if (schemeMatch) {
    const scheme = schemeMatch[1];
    const prefix = `${scheme}://`;
    const payload = value.slice(prefix.length);
    return KNOWN_NON_FILE_LOCATOR_SCHEMES.has(scheme)
      && scheme === scheme.toLowerCase()
      && value.startsWith(prefix)
      && fragment === null
      && !value.includes("%")
      && payload !== ""
      && !payload.startsWith("/")
      && !payload.includes("?")
      && !/[\t\n\r ]/.test(payload)
      ? { kind: "known_non_file_locator", value, scheme }
      : { kind: "invalid_repository_file_reference", value, reason: "invalid_or_unsupported_URI_scheme", scheme };
  }

  if (!looksLikeRepositoryFile) return { kind: "not_repository_file_reference", value };

  if (locator === "") return invalid("empty_external_file_locator");
  const canonicalRepositoryPath = analyzeCanonicalRepositoryRelativePath(locator);
  if (!canonicalRepositoryPath.valid
    || !/^[A-Za-z0-9_-][A-Za-z0-9._-]*\.(?:json|md|mjs|ts)$/.test(canonicalRepositoryPath.segments.at(-1))) {
    return invalid("invalid_repository_relative_path");
  }

  const fragmentSyntax = validateJsonPointerFragmentSyntax(fragment);
  if (!fragmentSyntax.valid) return invalid(fragmentSyntax.reason, fragmentSyntax);

  const resolution = referenceResolver(sourceFile, locator);
  if (!resolution.bounded) return invalid("reference_resolves_outside_repository", resolution);
  return {
    kind: "repository_file_reference",
    value,
    locator,
    fragment,
    decoded_fragment_pointer: fragmentSyntax.decoded_pointer,
    relative_style: canonicalRepositoryPath.relative_style,
    ...resolution,
  };
}

function walkJson(value, visitor, trail = [], parent = null) {
  visitor(value, trail, parent);
  if (value === null || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    walkJson(child, visitor, [...trail, key], value);
  }
}

function collectJsonFindings(value, predicate) {
  const findings = [];
  walkJson(value, (current, trail, parent) => {
    const finding = predicate(current, trail, parent);
    if (finding !== undefined && finding !== null && finding !== false) findings.push(finding);
  });
  return findings;
}

function toJsonPointer(trail) {
  return `/${trail.map((segment) => String(segment).replaceAll("~", "~0").replaceAll("/", "~1")).join("/")}`;
}

function valueAtTrail(root, trail) {
  return trail.reduce((current, segment) => current?.[segment], root);
}

function canonicalizeJsonValue(value) {
  if (Array.isArray(value)) return value.map(canonicalizeJsonValue);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(sorted(Object.keys(value)).map((key) => [key, canonicalizeJsonValue(value[key])]));
  }
  if (typeof value === "number" && (!Number.isFinite(value) || Object.is(value, -0))) {
    throw new TypeError("canonical_JSON_number_must_be_finite_and_not_negative_zero");
  }
  return value;
}

function canonicalTupleSetDigest(tuples) {
  const serialized = tuples.map((tuple) => JSON.stringify(canonicalizeJsonValue(tuple))).sort();
  return sha256(`[${serialized.join(",")}]`);
}

function canonicalDeepEqual(left, right) {
  return JSON.stringify(canonicalizeJsonValue(left)) === JSON.stringify(canonicalizeJsonValue(right));
}

function parseInternalJsonPointer(value) {
  if (typeof value !== "string" || !value.startsWith("#")) {
    return { valid: false, reason: "not_internal_JSON_Pointer" };
  }
  if (!value.startsWith("#/")) return { valid: false, reason: "internal_pointer_requires_hash_slash" };
  if (value.indexOf("#", 1) !== -1) return { valid: false, reason: "internal_pointer_has_multiple_hash_markers" };
  if (value.includes("%")) return { valid: false, reason: "internal_pointer_percent_encoding_not_allowed" };
  const encodedTokens = value.slice(2).split("/");
  if (encodedTokens.some((token) => /~(?:[^01]|$)/.test(token))) {
    return { valid: false, reason: "invalid_internal_JSON_Pointer_escape" };
  }
  return {
    valid: true,
    tokens: encodedTokens.map((token) => token.replaceAll("~1", "/").replaceAll("~0", "~")),
  };
}

function resolveJsonPointerTokens(document, tokens, missingReason) {
  let target = document;
  for (const token of tokens) {
    if (Array.isArray(target)) {
      if (!/^(?:0|[1-9][0-9]*)$/.test(token)) {
        return { valid: false, reason: "JSON_Pointer_array_index_not_canonical", tokens };
      }
      const index = Number(token);
      if (!Number.isSafeInteger(index)) {
        return { valid: false, reason: "JSON_Pointer_array_index_not_safe_integer", tokens };
      }
      if (index >= target.length || !Object.hasOwn(target, index)) {
        return { valid: false, reason: "JSON_Pointer_array_index_out_of_bounds", tokens };
      }
      target = target[index];
      continue;
    }
    if (target === null || typeof target !== "object" || !Object.hasOwn(target, token)) {
      return { valid: false, reason: missingReason, tokens };
    }
    target = target[token];
  }
  return { valid: true, tokens, target };
}

function resolveInternalJsonPointer(document, value) {
  const parsed = parseInternalJsonPointer(value);
  if (!parsed.valid) return parsed;
  return resolveJsonPointerTokens(document, parsed.tokens, "internal_JSON_Pointer_target_missing");
}

function analyzeLiteralReferenceClosures(artifactByNode) {
  const externalRepositoryFiles = [];
  const internalJsonPointers = [];
  const knownSchemeLocators = [];
  const invalidReferences = [];
  for (const [source, artifact] of artifactByNode) {
    for (const finding of collectJsonFindings(artifact.value, (current, trail) => {
      if (typeof current !== "string") return null;
      const pointer = toJsonPointer(trail);
      const classification = classifyRepositoryFileReference(current, artifact.file);
      if (classification.kind === "repository_file_reference") {
        return {
          closure: "external_repository_files",
          tuple: {
            source,
            pointer,
            value: current,
            resolved_path: classification.relative,
            fragment: classification.fragment,
          },
        };
      }
      if (classification.kind === "internal_JSON_Pointer") {
        const resolution = resolveInternalJsonPointer(artifact.value, current);
        return resolution.valid
          ? {
            closure: "internal_JSON_Pointers",
            tuple: {
              source,
              pointer,
              value: current,
              resolved_target: canonicalizeJsonValue(resolution.target),
            },
          }
          : {
            closure: "invalid",
            invalid: { source, pointer, value: current, reference_kind: "internal_JSON_Pointer", reason: resolution.reason },
          };
      }
      if (classification.kind === "known_non_file_locator") {
        return {
          closure: "known_scheme_locators",
          tuple: { source, pointer, scheme: classification.scheme, value: current },
        };
      }
      if (classification.kind === "invalid_repository_file_reference") {
        return {
          closure: "invalid",
          invalid: { source, pointer, value: current, reference_kind: "external_or_scheme", reason: classification.reason },
        };
      }
      return null;
    })) {
      if (finding.closure === "external_repository_files") externalRepositoryFiles.push(finding.tuple);
      else if (finding.closure === "internal_JSON_Pointers") internalJsonPointers.push(finding.tuple);
      else if (finding.closure === "known_scheme_locators") knownSchemeLocators.push(finding.tuple);
      else invalidReferences.push(finding.invalid);
    }
  }
  const summarize = (tuples, expected) => {
    const digest = canonicalTupleSetDigest(tuples);
    return {
      count: tuples.length,
      digest,
      expected_count: expected.count,
      expected_digest: expected.digest,
      exact: tuples.length === expected.count && digest === expected.digest,
    };
  };
  return {
    external_repository_files: summarize(externalRepositoryFiles, EXPECTED_REFERENCE_CLOSURES.external_repository_files),
    internal_JSON_Pointers: summarize(internalJsonPointers, EXPECTED_REFERENCE_CLOSURES.internal_JSON_Pointers),
    known_scheme_locators: summarize(knownSchemeLocators, EXPECTED_REFERENCE_CLOSURES.known_scheme_locators),
    tuples: {
      external_repository_files: externalRepositoryFiles,
      internal_JSON_Pointers: internalJsonPointers,
      known_scheme_locators: knownSchemeLocators,
    },
    invalid_references: invalidReferences,
  };
}

function isSha256NamedKey(key) {
  return typeof key === "string" && (key === "sha256" || key.endsWith("_sha256"));
}

function collectNamedShaSlots(value, sourceNode) {
  return collectJsonFindings(value, (current, trail) => isSha256NamedKey(trail.at(-1))
    ? { source: sourceNode, pointer: toJsonPointer(trail), value: current }
    : null);
}

function collectSha256Scalars(value, sourceNode) {
  return collectJsonFindings(value, (current, trail) => typeof current === "string" && /^[0-9a-fA-F]{64}$/.test(current)
    ? { source: sourceNode, pointer: toJsonPointer(trail), value: current }
    : null);
}

function analyzeNamedShaSlotClosure(artifactByNode, definitions) {
  const expectedByKey = new Map(definitions.map((definition) => [
    `${definition.source}:${toJsonPointer(definition.sha_trail)}`,
    definition,
  ]));
  const observed = [...artifactByNode].flatMap(([source, artifact]) => collectNamedShaSlots(artifact.value, source));
  const classified = observed.map((slot) => {
    const definition = expectedByKey.get(`${slot.source}:${slot.pointer}`);
    return {
      ...slot,
      category: definition?.category ?? "unknown",
      expected_value: definition?.expected_sha256,
    };
  });
  const expected = definitions.map((definition) => ({
    source: definition.source,
    pointer: toJsonPointer(definition.sha_trail),
    category: definition.category,
    value: definition.expected_sha256,
  }));
  const comparable = (slot) => JSON.stringify({
    source: slot.source,
    pointer: slot.pointer,
    category: slot.category,
    value: slot.value,
  });
  const unknown = classified.filter((slot) => slot.category === "unknown");
  const expectedValues = new Set(definitions.map((definition) => definition.expected_sha256));
  const aliases = unknown.filter((slot) => expectedValues.has(slot.value));
  const mismatched = classified.filter((slot) => slot.category !== "unknown" && slot.value !== slot.expected_value);
  const invalid = classified.filter((slot) => slot.category !== "runtime_null" && !isFrozenSha256(slot.value));
  const partitions = Object.fromEntries([
    "historical_freeze",
    "current_freeze",
    "asset_lock",
    "contract_projection_digest",
    "runtime_null",
    "unknown",
  ].map((category) => [category, classified.filter((slot) => slot.category === category).length]));
  return {
    observed,
    classified,
    expected,
    unknown,
    aliases,
    mismatched,
    invalid,
    partitions,
    exact: equalArrays(sorted(classified.map(comparable)), sorted(expected.map(comparable))),
  };
}

function analyzeSha256ScalarClosure(artifactByNode, definitions) {
  const expectedByKey = new Map(definitions.map((definition) => [
    `${definition.source}:${toJsonPointer(definition.sha_trail)}`,
    definition,
  ]));
  const observed = [...artifactByNode].flatMap(([source, artifact]) => collectSha256Scalars(artifact.value, source));
  const classified = observed.map((slot) => {
    const definition = expectedByKey.get(`${slot.source}:${slot.pointer}`);
    return {
      ...slot,
      lowercase_value: slot.value.toLowerCase(),
      category: definition?.category ?? "unknown",
      expected_value: definition?.expected_sha256,
    };
  });
  const expected = definitions.map((definition) => ({
    source: definition.source,
    pointer: toJsonPointer(definition.sha_trail),
    category: definition.category,
    lowercase_value: definition.expected_sha256,
  }));
  const comparable = (slot) => JSON.stringify({
    source: slot.source,
    pointer: slot.pointer,
    category: slot.category,
    lowercase_value: slot.lowercase_value,
  });
  const unknown = classified.filter((slot) => slot.category === "unknown");
  const expectedValues = new Set(definitions.map((definition) => definition.expected_sha256));
  const aliases = unknown.filter((slot) => expectedValues.has(slot.lowercase_value));
  const mismatched = classified.filter((slot) => slot.category !== "unknown" && slot.value !== slot.expected_value);
  const nonLowercase = classified.filter((slot) => slot.value !== slot.lowercase_value);
  return {
    observed,
    classified,
    expected,
    unknown,
    aliases,
    mismatched,
    non_lowercase: nonLowercase,
    exact: equalArrays(sorted(classified.map(comparable)), sorted(expected.map(comparable)))
      && nonLowercase.length === 0,
  };
}

function validatedHashedPathPointerKeys(artifactByNode, definitions) {
  return new Set(definitions.flatMap((definition) => {
    const pathTrail = definition.path_trail ?? definition.reference_trail;
    const expectedPath = definition.expected_path ?? definition.expected_reference;
    const artifact = artifactByNode.get(definition.source);
    if (!pathTrail || !artifact) return [];
    const actualPath = valueAtTrail(artifact.value, pathTrail);
    const actualSha = valueAtTrail(artifact.value, definition.sha_trail);
    return actualPath === expectedPath
      && actualSha === definition.expected_sha256
      && isFrozenSha256(actualSha)
      ? [`${definition.source}:${toJsonPointer(pathTrail)}`]
      : [];
  }));
}

function collectArtifactFileLocators(value, sourceFile, sourceNode, targetByPath, validatedHashedPathPointers = new Set()) {
  return collectJsonFindings(value, (current, trail, parent) => {
    const classification = classifyRepositoryFileReference(current, sourceFile);
    if (classification.kind !== "repository_file_reference") return null;
    if (validatedHashedPathPointers.has(`${sourceNode}:${toJsonPointer(trail)}`)) return null;
    const target = targetByPath.get(classification.resolved);
    if (!target) return null;
    return {
      source: sourceNode,
      target,
      path: current,
      trail: trail.join("."),
      bounded: classification.bounded,
      reference_kind: trail.join(".") === "evidence_template.path" ? parent?.reference_kind : undefined,
      excluded_from_freeze_graph: trail.join(".") === "evidence_template.path" ? parent?.excluded_from_freeze_graph : undefined,
    };
  });
}

function collectStructuredJsonFileReferences(value, sourceFile, sourceNode, targetByPath) {
  return collectJsonFindings(value, (current, trail) => {
    const classification = classifyRepositoryFileReference(current, sourceFile);
    if (classification.kind !== "repository_file_reference" || classification.fragment !== null) return null;
    const target = targetByPath.get(classification.resolved);
    return target ? {
      source: sourceNode,
      target,
      path: current,
      pointer: toJsonPointer(trail),
      bounded: classification.bounded,
      relative_style: classification.relative_style,
    } : null;
  });
}

function collectStructuredJsonFragmentReferences(value, sourceFile, sourceNode, targetByPath) {
  return collectJsonFindings(value, (current, trail) => {
    const classification = classifyRepositoryFileReference(current, sourceFile);
    if (classification.kind !== "repository_file_reference" || classification.fragment === null) return null;
    return {
      source: sourceNode,
      pointer: toJsonPointer(trail),
      value: current,
      locator: classification.locator,
      fragment: classification.fragment,
      resolved_target: targetByPath.get(classification.resolved) ?? null,
      resolved_path: classification.relative,
      bounded: classification.bounded,
      relative_style: classification.relative_style,
    };
  });
}

function collectInvalidRepositoryFileReferences(value, sourceFile, sourceNode) {
  return collectJsonFindings(value, (current, trail) => {
    const classification = classifyRepositoryFileReference(current, sourceFile);
    return classification.kind === "invalid_repository_file_reference"
      ? { source: sourceNode, pointer: toJsonPointer(trail), ...classification }
      : null;
  });
}

function resolveJsonPointerFragment(document, fragment) {
  if (typeof fragment !== "string" || !fragment.startsWith("#")) return { valid: false, reason: "missing_fragment_marker" };
  let pointer;
  try {
    pointer = decodeURIComponent(fragment.slice(1));
  } catch {
    return { valid: false, reason: "invalid_percent_encoding" };
  }
  if (pointer === "") return { valid: true, tokens: [], value: document };
  if (!pointer.startsWith("/")) return { valid: false, reason: "not_a_JSON_Pointer" };
  const encodedTokens = pointer.slice(1).split("/");
  if (encodedTokens.some((token) => /~(?:[^01]|$)/.test(token))) return { valid: false, reason: "invalid_JSON_Pointer_escape" };
  const tokens = encodedTokens.map((token) => token.replaceAll("~1", "/").replaceAll("~0", "~"));
  const resolution = resolveJsonPointerTokens(document, tokens, "JSON_Pointer_target_missing");
  return resolution.valid
    ? { valid: true, tokens, value: resolution.target }
    : resolution;
}

function extractModuleSpecifiers(source) {
  const specifiers = [];
  const expressions = [
    /\bfrom\s*["']([^"']+)["']/g,
    /\b(?:import|require)\s*\(\s*["']([^"']+)["']\s*\)/g,
    /^\s*import\s*["']([^"']+)["']/gm,
  ];
  for (const expression of expressions) {
    for (const match of source.matchAll(expression)) specifiers.push(match[1]);
  }
  return specifiers;
}

function hasDirectedCycle(edges) {
  const adjacency = new Map();
  for (const { source, target } of edges) {
    if (!adjacency.has(source)) adjacency.set(source, []);
    adjacency.get(source).push(target);
  }
  const visiting = new Set();
  const visited = new Set();
  function visit(node) {
    if (visiting.has(node)) return true;
    if (visited.has(node)) return false;
    visiting.add(node);
    for (const target of adjacency.get(node) ?? []) {
      if (visit(target)) return true;
    }
    visiting.delete(node);
    visited.add(node);
    return false;
  }
  return [...adjacency.keys()].some((node) => visit(node));
}

function extractConstStringArray(source, name) {
  const expression = new RegExp(`export const ${name} = \\[([\\s\\S]*?)\\] as const;`);
  const match = source.match(expression);
  if (!match) {
    throw new Error(`Unable to find ${name} in T3 contract`);
  }
  return [...match[1].matchAll(/"([^"]+)"/g)].map((entry) => entry[1]);
}

function extractConstString(source, name) {
  const expression = new RegExp(`export const ${name} = "([^"]+)" as const;`);
  const match = source.match(expression);
  if (!match) {
    throw new Error(`Unable to find ${name} in T3 contract`);
  }
  return match[1];
}

function uniqueRecordKeys(rows) {
  return sorted(new Set(rows.flatMap((record) => Object.keys(record))));
}

function effectiveFieldKeys(logicalManifest, table) {
  return sorted(new Set([
    ...logicalManifest.common_fields.map((field) => field.key),
    ...table.fields.map((field) => field.key),
  ]));
}

function jsonPointerForDiagnostic(trail) {
  return trail.length === 0 ? "" : toJsonPointer(trail);
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
    while (index < raw.length && (raw[index] === " " || raw[index] === "\t" || raw[index] === "\n" || raw[index] === "\r")) index += 1;
  };
  const parseString = () => {
    if (raw[index] !== '"') syntaxFailure("expected_JSON_string");
    const start = index;
    index += 1;
    while (index < raw.length) {
      const code = raw.charCodeAt(index);
      if (raw[index] === '"') {
        index += 1;
        const literal = raw.slice(start, index);
        try {
          return { decoded: JSON.parse(literal), literal, start };
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
        const first = keys.get(key.decoded);
        if (first !== undefined) {
          duplicateKeys.push({
            source,
            object_pointer: jsonPointerForDiagnostic(trail),
            decoded_key: key.decoded,
            first_offset: first,
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
          raw_lexeme: lexeme,
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

function collectInvalidJsonNumberValues(value, source) {
  return collectJsonFindings(value, (current, trail) => typeof current === "number"
    && (!Number.isFinite(current) || Object.is(current, -0))
    ? {
      source,
      pointer: jsonPointerForDiagnostic(trail),
      reason: !Number.isFinite(current) ? "non_finite_JSON_number" : "negative_zero_JSON_number",
    }
    : null);
}

const [
  t1ManifestText,
  t2ManifestText,
  permissionMatrix,
  t3Contract,
  t3W6Model,
  t3Repository,
  t3W6Improvement,
  t3Index,
  t3W6RepositoryTest,
  t3W6ImprovementTest,
  t3R6Record,
  t3R7Record,
  t3R9Record,
  r10Core,
  r10Test,
  r10Record,
  buildPackageText,
  probeSuiteText,
  permissionResultsText,
  permissionAcceptanceText,
  importPlanText,
  smokePlanText,
  evidenceTemplateText,
  mainStoryText,
  failureDrillsText,
] = await Promise.all([
  readFile(paths.t1Manifest, "utf8"),
  readFile(paths.t2Manifest, "utf8"),
  readFile(paths.t2PermissionMatrix, "utf8"),
  readFile(paths.t3Contract, "utf8"),
  readFile(paths.t3W6Model, "utf8"),
  readFile(paths.t3Repository, "utf8"),
  readFile(paths.t3W6Improvement, "utf8"),
  readFile(paths.t3Index, "utf8"),
  readFile(paths.t3W6RepositoryTest, "utf8"),
  readFile(paths.t3W6ImprovementTest, "utf8"),
  readFile(paths.t3R6Record, "utf8"),
  readFile(paths.t3R7Record, "utf8"),
  readFile(paths.t3R9Record, "utf8"),
  readFile(paths.r10Core, "utf8"),
  readFile(paths.r10Test, "utf8"),
  readFile(paths.r10Record, "utf8"),
  readFile(paths.buildPackage, "utf8"),
  readFile(paths.probeSuite, "utf8"),
  readFile(paths.permissionResults, "utf8"),
  readFile(paths.permissionAcceptance, "utf8"),
  readFile(paths.importPlan, "utf8"),
  readFile(paths.smokePlan, "utf8"),
  readFile(paths.evidenceTemplate, "utf8"),
  readFile(paths.mainStory, "utf8"),
  readFile(paths.failureDrills, "utf8"),
]);

const strictRawJsonArtifacts = [
  { source: "logical", file: paths.t2Manifest, raw: t2ManifestText },
  { source: "build", file: paths.buildPackage, raw: buildPackageText },
  { source: "probe", file: paths.probeSuite, raw: probeSuiteText },
  { source: "import", file: paths.importPlan, raw: importPlanText },
  { source: "smoke", file: paths.smokePlan, raw: smokePlanText },
  { source: "evidence", file: paths.evidenceTemplate, raw: evidenceTemplateText },
];
const strictRawJsonInputAnalyses = strictRawJsonArtifacts.map((artifact) => ({
  ...artifact,
  analysis: analyzeStrictJsonText(artifact.raw, artifact.source),
}));
const strictRawJsonInputFailures = strictRawJsonInputAnalyses.filter(({ analysis }) => !analysis.valid);
const permissionResultsRawAnalysis = {
  source: "permission_results",
  file: paths.permissionResults,
  analysis: analyzeStrictJsonText(permissionResultsText, "permission_results"),
};
const strictInputFailures = [
  ...strictRawJsonInputFailures,
  ...(permissionResultsRawAnalysis.analysis.valid ? [] : [permissionResultsRawAnalysis]),
];
if (strictInputFailures.length > 0) {
  console.log(serializeContractFatalReport(contractFatalReport(strictInputFailures.map(({ source, file, analysis }) => ({
      source,
      path: path.relative(repositoryRoot, file).split(path.sep).join("/"),
      reason_codes: [...new Set([
        ...analysis.duplicate_keys.map(() => "duplicate_key"),
        ...analysis.number_findings.map(({ reason }) => reason),
        ...analysis.syntax_errors.map(({ reason }) => reason),
      ])].sort(),
    })))));
  process.exit(1);
}

const contractFatalShapeBaseline = contractFatalReport([{
  source: "synthetic_fixture",
  path: "feishu/manifests/synthetic-fixture.json",
  reason_codes: ["synthetic_strict_input_failure"],
}]);
const contractFatalShapeMutations = [
  ["missing_key", (copy) => { delete copy.stage; }],
  ["extra_key", (copy) => { copy.unexpected = null; }],
  ["version_drift", (copy) => { copy.report_schema_version = "contract_alignment_fatal_report.v0"; }],
  ["equal_cardinality_rename", (copy) => { copy.stagE = copy.stage; delete copy.stage; }],
].map(([id, mutate]) => {
  const copy = structuredClone(contractFatalShapeBaseline);
  mutate(copy);
  const serialized = serializeContractFatalReport(copy);
  return {
    id,
    baseline_valid: contractFatalReportHasExactShape(contractFatalShapeBaseline),
    mutation_valid: contractFatalReportHasExactShape(copy),
    fixed_fatal_selected: JSON.parse(serialized).fatal_code === "contract_validator_fatal"
      && JSON.parse(serialized).failed_artifacts[0].reason_codes[0] === "invalid_fatal_report_shape",
    sensitive_sentinel_present: serialized.includes("synthetic_strict_input_failure"),
  };
});

const t1 = JSON.parse(t1ManifestText);
const t2 = JSON.parse(t2ManifestText);
const buildPackage = JSON.parse(buildPackageText);
const probeSuite = JSON.parse(probeSuiteText);
const permissionResults = JSON.parse(permissionResultsText);
const importPlan = JSON.parse(importPlanText);
const smokePlan = JSON.parse(smokePlanText);
const evidenceTemplate = JSON.parse(evidenceTemplateText);
const canonicalTableSources = [];

assertInGroup("strict_JSON_inputs", "six_G7_JSON_artifacts_pass_raw_syntax_duplicate_key_and_number_scan", strictRawJsonInputAnalyses.length === 6
  && strictRawJsonInputAnalyses.every(({ analysis }) => analysis.valid), strictRawJsonInputAnalyses.map(({ source, analysis }) => ({ source, analysis })));
assertInGroup("strict_JSON_inputs", "six_G7_JSON_artifacts_have_zero_raw_duplicate_keys", strictRawJsonInputAnalyses.every(({ analysis }) => analysis.duplicate_keys.length === 0), strictRawJsonInputAnalyses.map(({ source, analysis }) => ({ source, duplicate_keys: analysis.duplicate_keys })));
assertInGroup("strict_JSON_inputs", "six_G7_JSON_artifacts_have_zero_non_finite_or_negative_zero_numbers", strictRawJsonInputAnalyses.every(({ analysis }) => analysis.number_findings.length === 0)
  && [
    ["logical", t2],
    ["build", buildPackage],
    ["probe", probeSuite],
    ["import", importPlan],
    ["smoke", smokePlan],
    ["evidence", evidenceTemplate],
  ].every(([source, value]) => collectInvalidJsonNumberValues(value, source).length === 0), strictRawJsonInputAnalyses.map(({ source, analysis }) => ({ source, number_findings: analysis.number_findings })));
const artifactVersions = [
  { artifact: "logical", actual: t2.manifest_version, expected: "0.1.6" },
  { artifact: "build", actual: buildPackage.package_version, expected: "0.1.5" },
  { artifact: "probe", actual: probeSuite.suite_version, expected: "0.1.7" },
  { artifact: "import", actual: importPlan.plan_version, expected: "0.1.4" },
  { artifact: "smoke", actual: smokePlan.plan_version, expected: "0.1.4" },
  { artifact: "evidence", actual: evidenceTemplate.template_version, expected: "0.1.6" },
];
for (const version of artifactVersions) {
  assertInGroup("artifact_versions", `${version.artifact}_artifact_version_is_exact`, version.actual === version.expected, version);
}

const permissionResultGroup = "permission_result_contract";
const expectedPermissionRuntimeFields = [
  "execution_status",
  "result",
  "evidence",
  "preconditions_observed",
  "expected_result_ref",
  "actual_action",
  "actual_result",
  "actual_time",
  "executor",
  "account_role",
  "limitations",
  "evidence_index",
  "fallback_path",
  "fallback_verified",
  "cleanup_result",
  "verifier",
];
const expectedPermissionExactFields = [
  "unit_id",
  "name",
  "probe_ref",
  "evidence_unit_ref",
  ...expectedPermissionRuntimeFields,
];
const expectedPermissionFieldTypes = {
  unit_id: "string_matching_P01_through_P13",
  name: "non_empty_string_matching_permission_matrix",
  probe_ref: "non_empty_repository_JSON_pointer_to_the_same_probe",
  evidence_unit_ref: "non_empty_repository_JSON_pointer_to_the_same_existing_permission_evidence_unit",
  execution_status: "enum_not_tested_blocked_completed",
  result: "null_or_enum_可用_受限_不可用",
  evidence: "null_or_non_empty_redacted_object",
  preconditions_observed: "null_or_non_empty_array_of_non_empty_strings",
  expected_result_ref: "non_empty_repository_JSON_pointer_to_the_same_probe_expected_result",
  actual_action: "null_or_non_empty_string",
  actual_result: "null_or_non_empty_string_preserving_the_redacted_observed_outcome",
  actual_time: "null_or_ISO_8601_timestamp_with_timezone",
  executor: "null_or_non_empty_redacted_actor_label",
  account_role: "null_or_non_empty_logical_account_role",
  limitations: "null_or_non_empty_string",
  evidence_index: "null_or_non_empty_object_matching_evidence_index_contract",
  fallback_path: "non_empty_repository_JSON_pointer_to_the_same_probe_fallback_path",
  fallback_verified: "null_or_boolean",
  cleanup_result: "null_or_non_empty_string",
  verifier: "null_or_non_empty_redacted_actor_label",
};
const expectedPermissionStateRows = [
  { execution_status: "not_tested", result: null, evidence: null, derived_zh: "未测试", derived_en: "not_tested" },
  { execution_status: "blocked", result: null, evidence: "non_empty_redacted_structured_index", derived_zh: "已阻塞", derived_en: "blocked" },
  { execution_status: "completed", result: "可用", evidence: "non_empty_redacted_structured_index", derived_zh: "可用", derived_en: "available" },
  { execution_status: "completed", result: "受限", evidence: "non_empty_redacted_structured_index", derived_zh: "受限", derived_en: "restricted" },
  { execution_status: "completed", result: "不可用", evidence: "non_empty_redacted_structured_index", derived_zh: "不可用", derived_en: "unavailable" },
];
const expectedMarkdownPermissionTruthRows = [
  ["`not_tested`", "`null`", "`null`", "未测试 / `not_tested`"],
  ["`blocked`", "`null`", "非空且结构合法", "已阻塞 / `blocked`"],
  ["`completed`", "`可用`", "非空且结构合法", "可用 / `available`"],
  ["`completed`", "`受限`", "非空且结构合法", "受限 / `restricted`"],
  ["`completed`", "`不可用`", "非空且结构合法", "不可用 / `unavailable`"],
];
function permissionTruthRowsFromMarkdown(source) {
  return source.split(/\r?\n/)
    .filter((line) => /^\| `(not_tested|blocked|completed)` \|/.test(line))
    .map((line) => line.split("|").slice(1, -1).map((part) => part.trim()).slice(0, 4));
}
const evidenceIndexKeys = ["indexes", "r10_subchecks"];
const evidenceEntryKeys = ["evidence_id", "observed_at", "actor_role", "redacted_storage_slot", "capture_phases", "redaction_checked"];
const genericCapturePhases = ["before_action", "after_boundary", "failure"];
const p03CapturePhases = ["prebuild_gate", "postbuild_five_view_direct_table_recheck"];
const allCapturePhases = [...genericCapturePhases, ...p03CapturePhases];
const p03BasePhaseRuntimeFields = ["execution_status", "result", "evidence_index", "actual_action", "actual_result", "actual_time"];
const p03PrebuildPhaseRuntimeFields = [...p03BasePhaseRuntimeFields, "actual_prebuild_proof"];
const p03PrebuildVisibilitySafetyKeys = [
  "non_isolated_views_hidden", "non_target_records_hidden", "direct_table_access_denied",
  "raw_json_hidden", "management_configuration_hidden",
];
const p03PrebuildProofKeys = [
  "data_scope", "fixture_marker", "test_scope", "enterprise_data_used", "actor_class",
  "actor_distinct_from_owner_verified", "owner_privileges_absent", "administrator_privileges_absent",
  "independent_session_verified", "allowed_isolated_view_open_attempted", "allowed_isolated_view_opened",
  ...p03PrebuildVisibilitySafetyKeys,
  "protected_mutation_attempted", "protected_mutation_rejected", "unauthorized_business_write_count",
  "business_state_unchanged", "temporary_access_revoked", "cleanup_reverified",
];
const p03PrebuildProofContractKeys = [
  "field", "exact_keys", "static_identity", "not_tested_rule", "blocked_rule", "completed_common_rule",
  "deterministic_result_classification", "parent_state_rule", "phase_evidence_binding_rule",
];
const expectedDeclaredP03PrebuildProofContract = {
  field: "actual_prebuild_proof",
  exact_keys: p03PrebuildProofKeys,
  static_identity: {
    data_scope: "synthetic_experiment",
    fixture_marker: "SYN-PERMISSION-TEST",
    test_scope: "isolated_temporary_base",
    enterprise_data_used: false,
    actor_class: "ordinary_non_owner",
  },
  not_tested_rule: "actual_prebuild_proof_must_be_null",
  blocked_rule: "actual_prebuild_proof_must_be_null; partial_attempt_facts_remain_only_in_actual_action_actual_result_and_canonical_evidence",
  completed_common_rule: "exact_22_key_full_observation; actor_distinct_from_owner_verified_owner_and_administrator_privileges_absent_independent_session_verified_allowed_view_open_attempted_temporary_access_revoked_cleanup_reverified_true; unauthorized_business_write_count_nonnegative_integer; protected_mutation_attempted_and_protected_mutation_rejected_are_false_when_allowed_view_is_not_opened_or_any_of_the_five_visibility_boundaries_is_false; protected_mutation_attempted_is_true_only_when_allowed_view_is_opened_and_all_five_visibility_boundaries_are_true",
  deterministic_result_classification: {
    "可用": "allowed_view_opened_all_five_visibility_boundaries_safe_protected_mutation_attempted_and_rejected_zero_unauthorized_business_writes_and_business_state_unchanged",
    "受限": "same_full_safe_boundary_as_available_with_a_separately_recorded_non_hard_limitation; parent_limitations_non_empty_and_fallback_verified_true",
    "不可用": "lawful_complete_synthetic_isolated_test_but_allowed_view_not_opened_or_any_visibility_boundary_unsafe_or_attempted_protected_mutation_not_rejected_or_unauthorized_business_write_count_positive_or_business_state_changed; mutation_is_skipped_with_attempted_and_rejected_false_when_view_open_or_visibility_precondition_is_unsafe; parent_limitations_non_empty_and_fallback_verified_true",
  },
  parent_state_rule: "prebuild_not_tested_keeps_parent_not_tested_null; any_prebuild_attempt_or_completion_keeps_parent_blocked_null_until_postbuild_completed",
  phase_evidence_binding_rule: "phase_indexes_canonical_deep_equal_parent_indexes_filtered_by_capture_phase_in_same_order_with_unique_evidence_id",
};
const p03BusinessViewKeys = ["feedback_inbox", "case_cockpit", "sla_board", "issue_map", "improvement_tracking"];
const p03CompletedSubcheckKeys = ["P03-R10-raw-recurrence-visibility", "P03-R10-attestation-lifecycle-and-recheck"];
const p02CompletedSubcheckKeys = ["P02-R10-selector-cardinality", "P02-R10-execution-mode", "P02-R10-attestation-base-component"];
const p03ViewResultKeys = ["view_key", "opened", "refreshed", "allowed_action_verified", "raw_recurrence_records_visible"];
const p03DirectTableKeys = ["attempted", "access_allowed", "refreshed", "raw_recurrence_records_visible", "administrator_fields_visible"];
const p03FiveViewsResultKeys = ["views", "relogin_completed", "refresh_boundary_stable", "unauthorized_W6_action_rejected", "protected_field_mutation_rejected", "administrator_configuration_hidden"];
const p03SourceVisibilityKeys = ["day_7_result_readable", "day_30_result_readable", "human_conclusion_readable", "raw_recurrence_records_visible", "no_broader_than_source_field_intersection"];
const p03ProofRootKeys = [
  "probe_ref", "normalized_existing_evidence_unit_ref", "creates_new_evidence_unit",
  "actual_all_five_business_views_result", "actual_direct_clusters_table_result",
  "actual_recurrence_visibility_no_broader_than_source_fields_result", "attestation_id_digest",
  "capability_attestation_sha256", "permission_snapshot_sha256", "permission_revision", "issued_at", "expires_at",
  "capability_checked_at", "capability_rechecked_at", "actual_prewrite_recheck_result", "actual_drift_or_expiry_injection_result",
];
const p03PrewriteKeys = ["permission_snapshot_matches", "permission_revision_matches", "attestation_unexpired", "rechecked_before_write"];
const p03DriftKeys = ["permission_drift_rejected", "expiry_rejected", "zero_writes"];
const expectedDeclaredP03ProofRootKeys = [
  "probe_ref", "normalized_existing_evidence_unit_ref", "creates_new_evidence_unit",
  "actual_all_five_business_views_result", "actual_direct_clusters_table_result",
  "actual_recurrence_visibility_no_broader_than_source_fields_result", "attestation_id_digest",
  "capability_attestation_sha256", "permission_snapshot_sha256", "permission_revision", "issued_at", "expires_at",
  "capability_checked_at", "capability_rechecked_at", "actual_prewrite_recheck_result", "actual_drift_or_expiry_injection_result",
];
const expectedDeclaredP03ProofStaticIdentity = {
  probe_ref: "P03",
  normalized_existing_evidence_unit_ref: "P02+P03",
  creates_new_evidence_unit: false,
};
const expectedDeclaredP03Classification = {
  可用: "all_5_views_usable_and_every_security_boundary_relogin_refresh_prewrite_and_drift_zero_write_check_has_the_safe_value",
  受限: "hardSafety_and_drift_zero_write_pass_and_either_1_to_4_views_are_usable_or_all_5_views_are_usable_but_normal_prewrite_attestation_revision_unexpired_or_rechecked_is_fail_closed; limitations_non_empty_and_fallback_verified_true",
  不可用: "0_views_usable_or_any_security_boundary_failure_leak_or_drift_zero_write_failure; all_observation_slots_still_complete; limitations_non_empty_and_fallback_verified_true",
};
const expectedDeclaredP03EvidenceMetadataState = {
  not_tested: { evidence_presence: "待填", redaction_status: "待填" },
  blocked_or_completed: { evidence_presence: "已记录", redaction_status: "已复核" },
};

function expectedChinesePermissionStatus(record) {
  if (record?.execution_status === "not_tested" && record.result === null) return "未测试";
  if (record?.execution_status === "blocked" && record.result === null) return "已阻塞";
  if (record?.execution_status === "completed" && ["可用", "受限", "不可用"].includes(record.result)) return record.result;
  return null;
}

function p03CompletedSubchecksIssues(value, parentIndexes = []) {
  const issues = [];
  if (!hasExactKeys(value, p03CompletedSubcheckKeys)) return ["P03_completed_r10_subchecks_exact_keys"];
  for (const key of p03CompletedSubcheckKeys) {
    const refs = value[key];
    if (!Array.isArray(refs) || refs.length === 0
      || refs.some((ref) => typeof ref !== "string" || !/^T2-EV-P03-\d{8}-\d{4}-\d{2}$/.test(ref))
      || new Set(refs).size !== refs.length
      || !equalArrays(refs, sorted(refs))) {
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

function p02CompletedSubchecksIssues(value, parentIndexes = []) {
  const issues = [];
  if (!hasExactKeys(value, p02CompletedSubcheckKeys)) return ["P02_r10_subchecks_exact_keys"];
  for (const key of p02CompletedSubcheckKeys) {
    const refs = value[key];
    if (!Array.isArray(refs) || refs.length === 0
      || refs.some((ref) => typeof ref !== "string" || !/^T2-EV-P02-\d{8}-\d{4}-\d{2}$/.test(ref))
      || new Set(refs).size !== refs.length || !equalArrays(refs, sorted(refs))) {
      issues.push(`P02_${key}_evidence_refs`);
      continue;
    }
    for (const ref of refs) if (parentIndexes.filter((entry) => entry?.evidence_id === ref).length !== 1) issues.push(`P02_${key}_parent_binding`);
  }
  return issues;
}

function makeP02CompletedSubchecks(evidenceId) {
  return {
    "P02-R10-selector-cardinality": [evidenceId],
    "P02-R10-execution-mode": [evidenceId],
    "P02-R10-attestation-base-component": [evidenceId],
  };
}

function makeP03CompletedSubchecks(evidenceId) {
  return {
    "P03-R10-raw-recurrence-visibility": [evidenceId],
    "P03-R10-attestation-lifecycle-and-recheck": [evidenceId],
  };
}

function p03CompletedOnsiteMachineResultIssues(onsiteRecord, p02Record, p02OnsiteRecord, parentRecord) {
  const issues = [];
  const proof = onsiteRecord?.r10_recurrence_visibility_and_attestation_evidence_contract;
  if (!hasExactKeys(proof, p03ProofRootKeys)) return ["P03_completed_proof_root_exact_keys"];
  if (proof.probe_ref !== "P03") issues.push("P03_completed_proof_root_probe_ref");
  if (proof.normalized_existing_evidence_unit_ref !== "P02+P03") issues.push("P03_completed_proof_root_evidence_unit_ref");
  if (proof.creates_new_evidence_unit !== false) issues.push("P03_completed_proof_root_creates_new_evidence_unit");
  const views = proof?.actual_all_five_business_views_result;
  if (!hasExactKeys(views, p03FiveViewsResultKeys)
    || !Array.isArray(views.views) || views.views.length !== p03BusinessViewKeys.length
    || !equalArrays(views.views.map((row) => row?.view_key), p03BusinessViewKeys)
    || ["relogin_completed", "refresh_boundary_stable", "unauthorized_W6_action_rejected", "protected_field_mutation_rejected", "administrator_configuration_hidden"].some((key) => typeof views[key] !== "boolean")) issues.push("P03_completed_five_views_and_boundary_machine_result");
  for (const [index, row] of (Array.isArray(views?.views) ? views.views : []).entries()) {
    if (!hasExactKeys(row, p03ViewResultKeys) || row.view_key !== p03BusinessViewKeys[index]
      || [row.opened, row.refreshed, row.allowed_action_verified, row.raw_recurrence_records_visible].some((value) => typeof value !== "boolean")) issues.push(`P03_completed_view_${index}_machine_result`);
  }
  const direct = proof?.actual_direct_clusters_table_result;
  if (!hasExactKeys(direct, p03DirectTableKeys) || direct.attempted !== true || typeof direct.access_allowed !== "boolean"
    || typeof direct.raw_recurrence_records_visible !== "boolean" || typeof direct.administrator_fields_visible !== "boolean"
    || (direct.access_allowed === true ? direct.refreshed !== true : direct.refreshed !== null)) issues.push("P03_completed_direct_clusters_table_machine_result");
  const visibility = proof?.actual_recurrence_visibility_no_broader_than_source_fields_result;
  if (!hasExactKeys(visibility, p03SourceVisibilityKeys)
    || ![visibility.day_7_result_readable, visibility.day_30_result_readable, visibility.human_conclusion_readable].every((flag) => typeof flag === "boolean")
    || [visibility.raw_recurrence_records_visible, visibility.no_broader_than_source_field_intersection].some((flag) => typeof flag !== "boolean")) issues.push("P03_completed_source_visibility_intersection_machine_result");
  for (const key of ["attestation_id_digest", "capability_attestation_sha256", "permission_snapshot_sha256"]) {
    if (typeof proof?.[key] !== "string" || !/^[a-f0-9]{64}$/.test(proof[key])) issues.push(`P03_completed_${key}`);
  }
  if (typeof proof?.permission_revision !== "string" || proof.permission_revision.length === 0) issues.push("P03_completed_permission_revision");
  for (const key of ["issued_at", "expires_at", "capability_checked_at", "capability_rechecked_at"]) {
    if (!isIsoTimestampWithTimezone(proof?.[key])) issues.push(`P03_completed_${key}`);
  }
  if ([proof?.issued_at, proof?.capability_checked_at, proof?.capability_rechecked_at, proof?.expires_at].every(isIsoTimestampWithTimezone)
    && !(Date.parse(proof.issued_at) <= Date.parse(proof.capability_checked_at)
      && Date.parse(proof.capability_checked_at) <= Date.parse(proof.capability_rechecked_at)
      && Date.parse(proof.capability_rechecked_at) < Date.parse(proof.expires_at))) issues.push("P03_completed_attestation_time_order");
  if (!hasExactKeys(proof?.actual_prewrite_recheck_result, p03PrewriteKeys)
    || Object.values(proof.actual_prewrite_recheck_result).some((value) => typeof value !== "boolean")) issues.push("P03_completed_prewrite_recheck_machine_result");
  if (!hasExactKeys(proof?.actual_drift_or_expiry_injection_result, p03DriftKeys)
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
    && p03DriftKeys.every((key) => proof.actual_drift_or_expiry_injection_result?.[key] === true);
  const prewriteAllPass = p03PrewriteKeys.every((key) => proof.actual_prewrite_recheck_result?.[key] === true);
  const classifiedResult = !hardSafety || usableViews === 0 ? "不可用" : usableViews === 5 && prewriteAllPass ? "可用" : "受限";
  if (parentRecord?.result !== classifiedResult) issues.push("P03_completed_result_classification");
  return issues;
}

function isIsoTimestampWithTimezone(value) {
  return typeof value === "string"
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
    && !Number.isNaN(Date.parse(value));
}

function isSafeStorageSlot(value) {
  return typeof value === "string"
    && value.length > 0
    && value.length <= 128
    && !/[\\/]/.test(value)
    && !/^[a-z][a-z0-9+.-]*:/i.test(value)
    && !/(?:app|tbl|rec|view|fld)[A-Za-z0-9_-]{8,}/.test(value);
}

function structuredEvidenceIndexIssues(value, unitId, { allowNull = false } = {}) {
  const issues = [];
  if (value === null) return allowNull ? issues : ["evidence_index_null"];
  if (!hasExactKeys(value, evidenceIndexKeys)) return ["evidence_index_outer_exact_keys"];
  if (!Array.isArray(value.indexes) || value.indexes.length === 0) issues.push("evidence_indexes_non_empty");
  for (const [index, entry] of (Array.isArray(value.indexes) ? value.indexes : []).entries()) {
    if (!hasExactKeys(entry, evidenceEntryKeys)) {
      issues.push(`evidence_entry_${index}_exact_keys`);
      continue;
    }
    if (!/^T2-EV-P\d{2}-\d{8}-\d{4}-\d{2}$/.test(entry.evidence_id)) issues.push(`evidence_entry_${index}_id`);
    if (!isIsoTimestampWithTimezone(entry.observed_at)) issues.push(`evidence_entry_${index}_observed_at`);
    if (typeof entry.actor_role !== "string" || entry.actor_role.length === 0) issues.push(`evidence_entry_${index}_actor_role`);
    if (!isSafeStorageSlot(entry.redacted_storage_slot)) issues.push(`evidence_entry_${index}_storage_slot`);
    const allowedPhases = unitId === "P03" ? allCapturePhases : genericCapturePhases;
    if (!Array.isArray(entry.capture_phases) || entry.capture_phases.length === 0
      || entry.capture_phases.some((phase) => typeof phase !== "string" || !allowedPhases.includes(phase))) issues.push(`evidence_entry_${index}_capture_phases`);
    if (entry.redaction_checked !== true) issues.push(`evidence_entry_${index}_redaction_checked`);
  }
  if (!["P02", "P03"].includes(unitId) && value.r10_subchecks !== null) issues.push("r10_subchecks_forbidden_for_probe");
  if (["P02", "P03"].includes(unitId) && value.r10_subchecks !== null
    && (typeof value.r10_subchecks !== "object" || Array.isArray(value.r10_subchecks))) issues.push("r10_subchecks_outer_shape");
  if (unitId === "P02" && value.r10_subchecks !== null) issues.push(...p02CompletedSubchecksIssues(value.r10_subchecks, value.indexes));
  if (unitId === "P03" && value.r10_subchecks !== null) issues.push(...p03CompletedSubchecksIssues(value.r10_subchecks, value.indexes));
  return issues;
}

function permissionRecordIssues(record, index) {
  const issues = [];
  if (!hasExactKeys(record, expectedPermissionExactFields)) return ["permission_record_exact_fields"];
  const unitId = `P${String(index + 1).padStart(2, "0")}`;
  if (!(record.unit_id === unitId
    && record.unit_id === `P${String(index + 1).padStart(2, "0")}`
    && typeof record.name === "string" && record.name.length > 0
    && record.probe_ref === `../manifests/day-1-probe-suite.v0.1.json#/probes/${index}`
    && record.evidence_unit_ref === `./on-site-evidence-template.json#/permission_checks/${index}`
    && ["not_tested", "blocked", "completed"].includes(record.execution_status)
    && (record.result === null || ["可用", "受限", "不可用"].includes(record.result))
    && (record.evidence === null || (typeof record.evidence === "object" && !Array.isArray(record.evidence)))
    && (record.preconditions_observed === null || (Array.isArray(record.preconditions_observed) && record.preconditions_observed.length > 0 && record.preconditions_observed.every((value) => typeof value === "string" && value.length > 0)))
    && record.expected_result_ref === `../manifests/day-1-probe-suite.v0.1.json#/probes/${index}/expected_result`
    && [record.actual_action, record.actual_result, record.executor, record.account_role, record.limitations, record.cleanup_result, record.verifier].every((value) => value === null || (typeof value === "string" && value.length > 0))
    && (record.actual_time === null || isIsoTimestampWithTimezone(record.actual_time))
    && (record.evidence_index === null || (typeof record.evidence_index === "object" && !Array.isArray(record.evidence_index)))
    && record.fallback_path === `../manifests/day-1-probe-suite.v0.1.json#/probes/${index}/fallback_path`
    && (record.fallback_verified === null || typeof record.fallback_verified === "boolean"))) issues.push("permission_record_declared_types");
  if (record.evidence_index !== null) issues.push(...structuredEvidenceIndexIssues(record.evidence_index, unitId));
  const requiredObservedStrings = [record.actual_action, record.actual_result, record.executor, record.account_role, record.cleanup_result, record.verifier];
  if (record.execution_status === "not_tested") {
    if (![record.result, record.evidence, record.preconditions_observed, record.actual_action, record.actual_result, record.actual_time,
      record.executor, record.account_role, record.limitations, record.evidence_index, record.fallback_verified, record.cleanup_result, record.verifier]
      .every((value) => value === null)) issues.push("not_tested_runtime_shape");
  } else if (record.execution_status === "blocked") {
    if (record.result !== null || record.preconditions_observed === null || requiredObservedStrings.some((value) => typeof value !== "string" || value.length === 0)
      || !isIsoTimestampWithTimezone(record.actual_time) || typeof record.limitations !== "string" || record.limitations.length === 0
      || typeof record.fallback_verified !== "boolean") issues.push("blocked_runtime_shape");
  } else if (record.execution_status === "completed") {
    if (!["可用", "受限", "不可用"].includes(record.result) || record.preconditions_observed === null
      || requiredObservedStrings.some((value) => typeof value !== "string" || value.length === 0)
      || !isIsoTimestampWithTimezone(record.actual_time) || typeof record.fallback_verified !== "boolean") issues.push("completed_runtime_shape");
    if (["受限", "不可用"].includes(record.result)
      && (!(typeof record.limitations === "string" && record.limitations.length > 0) || record.fallback_verified !== true)) issues.push("completed_limited_fallback_shape");
    if (["P02", "P03"].includes(unitId) && record.evidence_index?.r10_subchecks === null) issues.push("completed_r10_subchecks_required");
  }
  return issues;
}

function permissionRecordHasDeclaredTypes(record, index) {
  return permissionRecordIssues(record, index).length === 0;
}
function isNonEmptyStructuredEvidenceIndex(value, unitId) {
  return structuredEvidenceIndexIssues(value, unitId).length === 0;
}
function permissionStateBindingIsValid(record, onsiteRecord) {
  if (record.execution_status === "not_tested") {
    return record.result === null
      && record.evidence === null
      && record.evidence_index === null
      && onsiteRecord?.structured_evidence_index === null;
  }
  if (record.execution_status === "blocked") {
    return record.result === null
      && isNonEmptyStructuredEvidenceIndex(record.evidence_index, record.unit_id)
      && canonicalDeepEqual(record.evidence, record.evidence_index)
      && canonicalDeepEqual(onsiteRecord?.structured_evidence_index, record.evidence_index);
  }
  return record.execution_status === "completed"
    && ["可用", "受限", "不可用"].includes(record.result)
    && isNonEmptyStructuredEvidenceIndex(record.evidence_index, record.unit_id)
    && canonicalDeepEqual(record.evidence, record.evidence_index)
    && canonicalDeepEqual(onsiteRecord?.structured_evidence_index, record.evidence_index);
}

function p03PrebuildProofIssues(proof, phase, parent) {
  const issues = [];
  if (phase.execution_status === "not_tested") {
    if (proof !== null) issues.push("actual_prebuild_proof_not_tested_null");
    return issues;
  }
  if (phase.execution_status === "blocked") {
    if (proof !== null) issues.push("actual_prebuild_proof_blocked_null");
    return issues;
  }
  if (!hasExactKeys(proof, p03PrebuildProofKeys)) return ["actual_prebuild_proof_exact_keys"];
  const staticIdentity = expectedDeclaredP03PrebuildProofContract.static_identity;
  for (const [key, expected] of Object.entries(staticIdentity)) {
    if (proof[key] !== expected) issues.push(`actual_prebuild_proof_${key}`);
  }
  const observationBooleanKeys = [
    "actor_distinct_from_owner_verified", "owner_privileges_absent", "administrator_privileges_absent",
    "independent_session_verified", "allowed_isolated_view_open_attempted", "allowed_isolated_view_opened",
    ...p03PrebuildVisibilitySafetyKeys,
    "protected_mutation_attempted", "protected_mutation_rejected", "business_state_unchanged",
    "temporary_access_revoked", "cleanup_reverified",
  ];
  const invalidObservationType = observationBooleanKeys.some((key) => typeof proof[key] !== "boolean");
  if (invalidObservationType) issues.push("actual_prebuild_proof_observation_types");
  if (!Number.isSafeInteger(proof.unauthorized_business_write_count) || proof.unauthorized_business_write_count < 0) {
    issues.push("actual_prebuild_proof_unauthorized_business_write_count");
  }
  if (invalidObservationType || issues.includes("actual_prebuild_proof_unauthorized_business_write_count")) {
    return issues;
  }
  for (const key of [
    "actor_distinct_from_owner_verified", "owner_privileges_absent", "administrator_privileges_absent",
    "independent_session_verified", "allowed_isolated_view_open_attempted",
    "temporary_access_revoked", "cleanup_reverified",
  ]) {
    if (proof[key] !== true) issues.push(`actual_prebuild_proof_${key}`);
  }
  const visibilitySafe = p03PrebuildVisibilitySafetyKeys.every((key) => proof[key] === true);
  const mutationPermitted = proof.allowed_isolated_view_opened === true && visibilitySafe;
  if (mutationPermitted) {
    if (proof.protected_mutation_attempted !== true) issues.push("actual_prebuild_proof_protected_mutation_attempted");
  } else if (proof.protected_mutation_attempted !== false || proof.protected_mutation_rejected !== false) {
    issues.push("actual_prebuild_proof_mutation_gate");
  }
  const safeBoundary = mutationPermitted
    && proof.protected_mutation_attempted === true
    && proof.protected_mutation_rejected === true
    && proof.unauthorized_business_write_count === 0
    && proof.business_state_unchanged === true;
  if ((["可用", "受限"].includes(phase.result) && !safeBoundary)
    || (phase.result === "不可用" && safeBoundary)) issues.push("actual_prebuild_proof_result_classification");
  if (["受限", "不可用"].includes(phase.result)
    && (!(typeof parent.limitations === "string" && parent.limitations.length > 0) || parent.fallback_verified !== true)) {
    issues.push("actual_prebuild_proof_limited_fallback");
  }
  return issues;
}

function p03ParentPhaseIssues(parent, phaseObservations) {
  const issues = [];
  const phaseEntries = Object.entries(phaseObservations ?? {});
  if (!equalArrays(phaseEntries.map(([key]) => key), ["prebuild_gate", "postbuild_five_view_direct_table_recheck"])) return ["phase_keys"];
  const parentIndexes = Array.isArray(parent?.evidence_index?.indexes) ? parent.evidence_index.indexes : [];
  const parentEvidenceIds = parentIndexes.map((entry) => entry?.evidence_id);
  const parentIndexesUnique = new Set(parentEvidenceIds).size === parentEvidenceIds.length;
  if (!parentIndexesUnique) issues.push("parent_evidence_id_unique");
  for (const [phaseKey, phase] of phaseEntries) {
    const expectedPhaseFields = phaseKey === "prebuild_gate" ? p03PrebuildPhaseRuntimeFields : p03BasePhaseRuntimeFields;
    if (!hasExactKeys(phase, expectedPhaseFields)) {
      issues.push(`${phaseKey}:exact_keys`);
      continue;
    }
    if (!["not_tested", "blocked", "completed"].includes(phase.execution_status)) {
      issues.push(`${phaseKey}:execution_status`);
      continue;
    }
    if (phase.execution_status === "not_tested") {
      if (![phase.result, phase.evidence_index, phase.actual_action, phase.actual_result, phase.actual_time].every((value) => value === null)) issues.push(`${phaseKey}:not_tested_shape`);
    } else {
      if ((phase.execution_status === "blocked" ? phase.result !== null : !["可用", "受限", "不可用"].includes(phase.result))
        || structuredEvidenceIndexIssues(phase.evidence_index, "P03").length > 0
        || phase.evidence_index?.r10_subchecks !== null
        || [phase.actual_action, phase.actual_result].some((value) => typeof value !== "string" || value.length === 0)
        || !isIsoTimestampWithTimezone(phase.actual_time)) {
        issues.push(`${phaseKey}:observed_shape`);
        continue;
      }
    }
    if (phaseKey === "prebuild_gate") issues.push(...p03PrebuildProofIssues(phase.actual_prebuild_proof, phase, parent));
    const phaseIndexes = Array.isArray(phase.evidence_index?.indexes) ? phase.evidence_index.indexes : [];
    const phaseEvidenceIds = phaseIndexes.map((entry) => entry?.evidence_id);
    const phaseIndexesUnique = new Set(phaseEvidenceIds).size === phaseEvidenceIds.length;
    if (!phaseIndexesUnique) issues.push(`${phaseKey}:phase_evidence_id_unique`);
    const filteredParentIndexes = parentIndexes.filter((entry) => Array.isArray(entry?.capture_phases) && entry.capture_phases.includes(phaseKey));
    if (phaseIndexesUnique && !canonicalDeepEqual(phaseIndexes, filteredParentIndexes)) issues.push(`${phaseKey}:parent_evidence_binding`);
  }
  const prebuild = phaseObservations?.prebuild_gate;
  const postbuild = phaseObservations?.postbuild_five_view_direct_table_recheck;
  if (postbuild?.execution_status !== "not_tested" && prebuild?.execution_status !== "completed") {
    issues.push("phase_order_postbuild_requires_completed_prebuild");
  }
  if (isIsoTimestampWithTimezone(prebuild?.actual_time)
    && isIsoTimestampWithTimezone(postbuild?.actual_time)
    && Date.parse(prebuild.actual_time) > Date.parse(postbuild.actual_time)) {
    issues.push("phase_time_order_prebuild_not_after_postbuild");
  }
  const started = phaseEntries.some(([, phase]) => phase.execution_status !== "not_tested");
  const bothCompleted = phaseEntries.every(([, phase]) => phase.execution_status === "completed");
  if (bothCompleted && postbuild.result !== parent.result) issues.push("completed_postbuild_parent_result_mismatch");
  if (postbuild?.execution_status !== "not_tested" && prebuild?.result === "不可用") issues.push("phase_order_prebuild_unavailable_forbids_postbuild");
  if (prebuild?.execution_status === "completed" && prebuild?.result === "受限"
    && (!(typeof parent.limitations === "string" && parent.limitations.length > 0) || parent.fallback_verified !== true)) {
    issues.push("phase_prebuild_restricted_requires_safe_fallback");
  }
  if (postbuild?.execution_status !== "not_tested" && prebuild?.result === "受限"
    && (!(typeof parent.limitations === "string" && parent.limitations.length > 0) || parent.fallback_verified !== true)) {
    issues.push("phase_order_prebuild_restricted_requires_safe_fallback");
  }
  if (bothCompleted) issues.push(...p03CompletedSubchecksIssues(parent.evidence_index?.r10_subchecks, parent.evidence_index?.indexes));
  const parentValid = !started
    ? parent.execution_status === "not_tested" && parent.result === null && parent.evidence_index === null
    : !bothCompleted
      ? parent.execution_status === "blocked" && parent.result === null && isNonEmptyStructuredEvidenceIndex(parent.evidence_index, "P03")
      : parent.execution_status === "completed" && ["可用", "受限", "不可用"].includes(parent.result) && isNonEmptyStructuredEvidenceIndex(parent.evidence_index, "P03");
  if (!parentValid) issues.push("parent_state");
  return issues;
}

function p03ParentPhaseStateIsValid(parent, phaseObservations) {
  return p03ParentPhaseIssues(parent, phaseObservations).length === 0;
}

function permissionArtifactIssues(candidate) {
  const issues = [];
  const records = candidate.permissionResults.permission_probes;
  const onsite = candidate.evidenceTemplate.permission_checks;
  const contract = candidate.permissionResults.result_record_contract;
  const probeEvidenceBinding = candidate.probeSuite.status_contract?.canonical_evidence_binding_contract;
  const resultEvidenceContract = contract?.evidence_index_contract;
  const templateEvidenceContract = candidate.evidenceTemplate.permission_evidence_index_contract;
  if (!canonicalDeepEqual(candidate.probeSuite.status_contract.legal_state_rows, expectedPermissionStateRows)) issues.push("status_truth_table");
  if (!equalArrays(contract.permission_probe_exact_keys ?? [], expectedPermissionExactFields)
    || !equalArrays(contract.permission_probe_required_runtime_fields ?? [], expectedPermissionRuntimeFields)
    || !canonicalDeepEqual(contract.permission_probe_field_types, expectedPermissionFieldTypes)) issues.push("permission_contract_declarations");
  if (contract.p03_phase_contract?.prebuild_cannot_complete_parent_P03 !== true
    || contract.p03_phase_contract?.completed_parent_P03_requires_both_phases_complete !== true) issues.push("P03_contract_declaration");
  if (!equalArrays(contract.p03_phase_contract?.completed_on_site_machine_result_contract?.proof_root_exact_keys ?? [], expectedDeclaredP03ProofRootKeys)) {
    issues.push("P03_contract_declaration_proof_root_exact_keys");
  }
  if (!canonicalDeepEqual(contract.p03_phase_contract?.completed_on_site_machine_result_contract?.proof_root_static_identity, expectedDeclaredP03ProofStaticIdentity)) {
    issues.push("P03_contract_declaration_proof_root_static_identity");
  }
  if (!canonicalDeepEqual(contract.p03_phase_contract?.completed_on_site_machine_result_contract?.deterministic_result_classification, expectedDeclaredP03Classification)) {
    issues.push("P03_contract_declaration_deterministic_result_classification");
  }
  if (!canonicalDeepEqual(contract.p03_phase_contract?.evidence_metadata_state_contract, expectedDeclaredP03EvidenceMetadataState)) {
    issues.push("P03_contract_declaration_evidence_metadata_state_contract");
  }
  if (!equalArrays(probeEvidenceBinding?.capture_phases_allowed ?? [], allCapturePhases)
    || !equalArrays(probeEvidenceBinding?.non_P03_capture_phases_allowed ?? [], genericCapturePhases)) {
    issues.push("capture_phase_declaration_probe_suite");
  }
  if (!equalArrays(resultEvidenceContract?.capture_phases_allowed ?? [], allCapturePhases)
    || !equalArrays(resultEvidenceContract?.non_P03_capture_phases_allowed ?? [], genericCapturePhases)
    || resultEvidenceContract?.capture_phases_rule !== "P03_uses_a_non_empty_subset_of_capture_phases_allowed; every_non_P03_probe_uses_a_non_empty_subset_of_non_P03_capture_phases_allowed") {
    issues.push("capture_phase_declaration_permission_results");
  }
  if (!equalArrays(templateEvidenceContract?.capture_phases_allowed ?? [], allCapturePhases)
    || !equalArrays(templateEvidenceContract?.non_P03_capture_phases_allowed ?? [], genericCapturePhases)
    || templateEvidenceContract?.capture_phases_rule !== "P03_uses_a_non_empty_subset_of_capture_phases_allowed; every_non_P03_probe_uses_a_non_empty_subset_of_non_P03_capture_phases_allowed") {
    issues.push("capture_phase_declaration_evidence_template");
  }
  const declaredPrebuildProofContract = contract.p03_phase_contract?.prebuild_proof_contract;
  if (!hasExactKeys(declaredPrebuildProofContract, p03PrebuildProofContractKeys)
    || !canonicalDeepEqual(declaredPrebuildProofContract, expectedDeclaredP03PrebuildProofContract)) {
    issues.push("P03_contract_declaration_prebuild_proof_contract");
  }
  if (!Array.isArray(records) || records.length !== 13 || !Array.isArray(onsite) || onsite.length < 13) return ["permission_record_counts"];
  records.forEach((record, index) => {
    issues.push(...permissionRecordIssues(record, index).map((issue) => `${record.unit_id}:${issue}`));
    if (!permissionStateBindingIsValid(record, onsite[index])) issues.push(`${record.unit_id}:canonical_evidence_binding`);
    if (onsite[index]?.status !== expectedChinesePermissionStatus(record)) issues.push(`${record.unit_id}:derived_chinese_status`);
    if (record.unit_id === "P03") {
      const expectedEvidencePresence = record.execution_status === "not_tested" ? "待填" : "已记录";
      const expectedRedactionStatus = record.execution_status === "not_tested" ? "待填" : "已复核";
      if (onsite[index]?.evidence_presence !== expectedEvidencePresence) issues.push("P03:onsite_evidence_presence_state_mismatch");
      if (onsite[index]?.redaction_status !== expectedRedactionStatus) issues.push("P03:onsite_redaction_status_state_mismatch");
    }
  });
  const onsiteP03Binding = onsite?.[2]?.p03_phase_binding_contract;
  if (!equalArrays(onsiteP03Binding?.prebuild_proof_exact_keys ?? [], p03PrebuildProofKeys)
    || !equalArrays(onsiteP03Binding?.prebuild_visibility_safety_keys ?? [], p03PrebuildVisibilitySafetyKeys)
    || onsiteP03Binding?.prebuild_mutation_gate_rule !== "attempt_mutation_only_when_allowed_view_opened_and_all_five_visibility_safety_keys_are_true; otherwise_protected_mutation_attempted_and_protected_mutation_rejected_are_both_false"
    || onsiteP03Binding?.prebuild_result_classification_rule !== "available_or_restricted_requires_opened_view_all_five_visibility_safety_keys_true_mutation_attempted_and_rejected_zero_unauthorized_business_writes_and_unchanged_business_state; every_other_lawful_complete_and_cleaned_observation_is_unavailable") {
    issues.push("P03_onsite_prebuild_boundary_contract");
  }
  issues.push(...p03ParentPhaseIssues(records[2], onsite[2].p03_phase_observations).map((issue) => `P03:${issue}`));
  if (records[2].execution_status === "completed") issues.push(...p03CompletedOnsiteMachineResultIssues(onsite[2], records[1], onsite[1], records[2]).map((issue) => `P03:${issue}`));
  for (const index of [5, 6]) {
    if (!canonicalDeepEqual(candidate.probeSuite.probes[index].depends_on, ["P02", "P05"])) issues.push(`P0${index + 1}:dependency_edge`);
  }
  if (records[4].execution_status !== "completed") {
    for (const index of [5, 6]) {
      const record = records[index];
      if (!(record.execution_status === "not_tested" && record.result === null && record.evidence === null && record.evidence_index === null)) issues.push(`${record.unit_id}:P05_gate`);
    }
  }
  return issues;
}

const permissionAttestationExactKeys = [
  "attestation_schema_version", "source_freeze_version", "status", "check_group", "assertion_count", "failed_assertion_count", "negative_fixture_count",
  "negative_fixtures", "negative_fixture_name_digest", "versions", "counts", "canonical_evidence_source",
  "canonical_evidence_binding", "P03_phase_binding", "P06_dependencies", "P07_dependencies", "sources", "source_count",
  "source_digest", "current_execution_status", "real_external_operations",
];

const expectedP03ClosureFixtureIds = Object.freeze([
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

const expectedP03PrebuildFixtureIds = Object.freeze([
  "P03_prebuild_proof_root_null",
  "P03_prebuild_proof_root_array",
  "P03_prebuild_proof_root_string",
  "P03_prebuild_proof_missing_key",
  "P03_prebuild_proof_extra_key",
  "P03_prebuild_fixture_marker_drift",
  "P03_prebuild_data_scope_drift",
  "P03_prebuild_test_scope_drift",
  "P03_prebuild_enterprise_data_used",
  "P03_prebuild_actor_class_drift",
  "P03_prebuild_actor_not_distinct_from_owner",
  "P03_prebuild_owner_privileges_present",
  "P03_prebuild_administrator_privileges_present",
  "P03_prebuild_independent_session_unverified",
  "P03_prebuild_allowed_view_open_not_attempted",
  "P03_prebuild_protected_mutation_not_attempted",
  "P03_prebuild_non_isolated_views_hidden_wrong_type",
  "P03_prebuild_non_target_records_hidden_wrong_type",
  "P03_prebuild_direct_table_access_denied_wrong_type",
  "P03_prebuild_raw_json_hidden_wrong_type",
  "P03_prebuild_management_configuration_hidden_wrong_type",
  "P03_prebuild_unauthorized_write_count_wrong_type",
  "P03_prebuild_unauthorized_write_count_negative",
  "P03_prebuild_temporary_access_not_revoked",
  "P03_prebuild_cleanup_not_reverified",
  "P03_prebuild_available_but_view_not_opened",
  "P03_prebuild_available_but_non_isolated_view_visible",
  "P03_prebuild_available_but_non_target_record_visible",
  "P03_prebuild_available_but_direct_table_access_allowed",
  "P03_prebuild_available_but_raw_json_visible",
  "P03_prebuild_available_but_management_configuration_visible",
  "P03_prebuild_available_but_mutation_not_rejected",
  "P03_prebuild_available_but_unauthorized_write_count_positive",
  "P03_prebuild_available_but_business_state_changed",
  "P03_prebuild_restricted_without_limitations_exact",
  "P03_prebuild_restricted_fallback_false_exact",
  "P03_prebuild_unavailable_with_safe_outcomes",
  "P03_prebuild_view_closed_but_mutation_attempted",
  "P03_prebuild_view_closed_but_mutation_rejected",
  "P03_prebuild_visibility_leak_but_mutation_attempted",
  "P03_prebuild_phase_evidence_full_object_drift",
  "P03_prebuild_phase_evidence_order_drift",
  "P03_prebuild_phase_evidence_duplicate_id",
  "P03_prebuild_parent_evidence_duplicate_id",
  "P03_prebuild_blocked_nonnull_proof",
  "P03_prebuild_not_tested_nonnull_proof",
]);

const expectedPermissionNegativeFixtureIds = Object.freeze([
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
  ...expectedP03PrebuildFixtureIds,
  ...expectedP03ClosureFixtureIds,
  "P03_prebuild_unavailable_started_postbuild", "P03_prebuild_restricted_without_safe_fallback", "P03_prebuild_restricted_without_limitations",
  "P03_result_available_with_partial_views", "P03_result_restricted_with_zero_views", "P03_result_unavailable_with_all_safe_views",
  "P03_result_restricted_with_direct_leak", "P03_result_unavailable_with_prewrite_limit",
]);

const expectedPermissionAttestationVersions = Object.freeze({
  probe_suite: "0.1.7",
  permission_results: "0.1.3",
  evidence_template: "0.1.6",
});
const expectedPermissionAttestationCounts = Object.freeze({
  state_truth_rows: 5,
  permission_records: 13,
  exact_fields: 20,
  required_runtime_fields: 16,
  declared_field_types: 20,
  P03_phases: 2,
});

function permissionAttestationHasExactShape(value) {
  return hasExactKeys(value, permissionAttestationExactKeys)
    && value.attestation_schema_version === PERMISSION_RESULT_ATTESTATION_SCHEMA_VERSION
    && value.source_freeze_version === PERMISSION_CONTENT_SOURCE_FREEZE_VERSION
    && value.status === "passed"
    && value.check_group === permissionResultGroup
    && value.assertion_count === 234
    && value.failed_assertion_count === 0
    && value.negative_fixture_count === 220
    && value.negative_fixture_name_digest === EXPECTED_PERMISSION_NEGATIVE_FIXTURE_NAME_DIGEST
    && hasExactKeys(value.versions, ["probe_suite", "permission_results", "evidence_template"])
    && canonicalDeepEqual(value.versions, expectedPermissionAttestationVersions)
    && hasExactKeys(value.counts, ["state_truth_rows", "permission_records", "exact_fields", "required_runtime_fields", "declared_field_types", "P03_phases"])
    && canonicalDeepEqual(value.counts, expectedPermissionAttestationCounts)
    && Array.isArray(value.negative_fixtures)
    && canonicalDeepEqual(value.negative_fixtures, expectedPermissionNegativeFixtureIds.map((id) => ({ id, rejected: true })))
    && canonicalDeepEqual(value.sources, EXPECTED_PERMISSION_CONTENT_SOURCES)
    && value.canonical_evidence_source === "permission_result.evidence_index"
    && value.canonical_evidence_binding === "permission_result.evidence_and_same_Pnn_on_site.structured_evidence_index_canonical_deep_equal"
    && value.P03_phase_binding === "phase_evidence_indexes_canonical_deep_equal_parent_P03_indexes_filtered_by_capture_phase_in_same_order_with_unique_evidence_id"
    && canonicalDeepEqual(value.P06_dependencies, ["P02", "P05"])
    && canonicalDeepEqual(value.P07_dependencies, ["P02", "P05"])
    && value.source_count === 5
    && value.source_digest === EXPECTED_PERMISSION_CONTENT_SOURCE_DIGEST
    && value.current_execution_status === "not_tested"
    && value.real_external_operations === 0;
}

const permissionResultContract = permissionResults.result_record_contract;
const permissionRecords = permissionResults.permission_probes;
const onsitePermissionRecords = evidenceTemplate.permission_checks;
const markdownPermissionTruthRows = permissionTruthRowsFromMarkdown(permissionMatrix);
const acceptancePermissionTruthRows = permissionTruthRowsFromMarkdown(permissionAcceptanceText);
assertInGroup(permissionResultGroup, "permission_result_JSON_passes_strict_input_scan", permissionResultsRawAnalysis.analysis.valid, permissionResultsRawAnalysis.analysis);
assertInGroup(permissionResultGroup, "permission_artifact_versions_are_exact_0_1_7_0_1_3_0_1_6", probeSuite.suite_version === "0.1.7"
  && permissionResults.template_version === "0.1.3"
  && evidenceTemplate.template_version === "0.1.6", {
  probe: probeSuite.suite_version,
  results: permissionResults.template_version,
  evidence: evidenceTemplate.template_version,
});
assertInGroup(permissionResultGroup, "permission_five_row_state_truth_is_exact_across_suite_results_and_runbooks", canonicalDeepEqual(probeSuite.status_contract.legal_state_rows, expectedPermissionStateRows)
  && equalArrays(permissionResults.status_contract.execution_status_allowed, ["not_tested", "blocked", "completed"])
  && equalArrays(permissionResults.status_contract.permission_result_allowed, ["可用", "受限", "不可用"])
  && canonicalDeepEqual(markdownPermissionTruthRows, expectedMarkdownPermissionTruthRows)
  && canonicalDeepEqual(acceptancePermissionTruthRows, expectedMarkdownPermissionTruthRows), {
  suite: probeSuite.status_contract.legal_state_rows,
  results: permissionResults.status_contract,
  matrix: markdownPermissionTruthRows,
  acceptance: acceptancePermissionTruthRows,
});
assertInGroup(permissionResultGroup, "attempted_incomplete_probe_transitions_to_blocked_null_nonempty_evidence", canonicalDeepEqual(probeSuite.status_contract.attempt_transition_contract, {
  unstarted_or_prerequisite_missing: { required_execution_status: "not_tested", required_result: null, required_evidence: null },
  attempted_but_action_recheck_or_evidence_incomplete: { required_execution_status: "blocked", required_result: null, required_evidence: "non_empty_redacted_structured_index" },
})
  && permissionResults.status_contract.rule.includes("Once any prescribed action is attempted")
  && permissionAcceptanceText.includes("一旦已尝试分享、无痕首屏或刷新中的任一规定动作")
  && permissionMatrix.includes("P01 的精确转换规则"), probeSuite.status_contract.attempt_transition_contract);
assertInGroup(permissionResultGroup, "permission_result_contract_declares_exact_20_fields_16_runtime_fields_and_20_types", equalArrays(permissionResultContract.permission_probe_exact_keys, expectedPermissionExactFields)
  && equalArrays(permissionResultContract.permission_probe_required_runtime_fields, expectedPermissionRuntimeFields)
  && canonicalDeepEqual(permissionResultContract.permission_probe_field_types, expectedPermissionFieldTypes), {
  exact_fields: permissionResultContract.permission_probe_exact_keys,
  runtime_fields: permissionResultContract.permission_probe_required_runtime_fields,
  field_types: permissionResultContract.permission_probe_field_types,
});
assertInGroup(permissionResultGroup, "thirteen_permission_result_records_have_exact_declared_shape_and_types", Array.isArray(permissionRecords)
  && permissionRecords.length === 13
  && permissionRecords.every(permissionRecordHasDeclaredTypes), permissionRecords.map((record) => ({ unit_id: record.unit_id, keys: Object.keys(record) })));
assertInGroup(permissionResultGroup, "permission_result_evidence_is_canonical_three_way_bound", permissionResultContract.canonical_evidence_binding_contract.canonical_source_field === "permission_probe.evidence_index"
  && permissionResultContract.canonical_evidence_binding_contract.same_record_alias_rule === "canonical_deep_equal_to_permission_probe.evidence_index"
  && permissionResultContract.canonical_evidence_binding_contract.same_probe_on_site_rule === "canonical_deep_equal_to_permission_probe.evidence_index"
  && evidenceTemplate.permission_evidence_index_contract.canonical_evidence_binding_contract.canonical_source === "permission_result.evidence_index"
  && permissionRecords.every((record, index) => permissionStateBindingIsValid(record, onsitePermissionRecords[index])), {
  result_contract: permissionResultContract.canonical_evidence_binding_contract,
  onsite_contract: evidenceTemplate.permission_evidence_index_contract.canonical_evidence_binding_contract,
});
const p03ResultRecord = permissionRecords[2];
const p03OnsiteRecord = onsitePermissionRecords[2];
assertInGroup(permissionResultGroup, "P03_parent_and_two_phase_contract_is_exact_and_currently_not_tested", hasExactKeys(p03OnsiteRecord.p03_phase_observations, ["prebuild_gate", "postbuild_five_view_direct_table_recheck"])
  && hasExactKeys(p03OnsiteRecord.p03_phase_observations.prebuild_gate, p03PrebuildPhaseRuntimeFields)
  && hasExactKeys(p03OnsiteRecord.p03_phase_observations.postbuild_five_view_direct_table_recheck, p03BasePhaseRuntimeFields)
  && Object.values(p03OnsiteRecord.p03_phase_observations).every((phase) => phase.execution_status === "not_tested" && phase.result === null && phase.evidence_index === null
    && phase.actual_action === null && phase.actual_result === null && phase.actual_time === null)
  && p03OnsiteRecord.p03_phase_observations.prebuild_gate.actual_prebuild_proof === null
  && p03ParentPhaseStateIsValid(p03ResultRecord, p03OnsiteRecord.p03_phase_observations)
  && permissionResultContract.p03_phase_contract.prebuild_cannot_complete_parent_P03 === true
  && permissionResultContract.p03_phase_contract.completed_parent_P03_requires_both_phases_complete === true
  && p03OnsiteRecord.p03_phase_binding_contract.independent_fourth_truth_forbidden === true, {
  parent: p03ResultRecord,
  phases: p03OnsiteRecord.p03_phase_observations,
  result_contract: permissionResultContract.p03_phase_contract,
  onsite_contract: p03OnsiteRecord.p03_phase_binding_contract,
});
assertInGroup(permissionResultGroup, "P06_and_P07_dependencies_are_exactly_P02_P05", canonicalDeepEqual(probeSuite.probes[5].depends_on, ["P02", "P05"])
  && canonicalDeepEqual(probeSuite.probes[6].depends_on, ["P02", "P05"]), {
  P06: probeSuite.probes[5].depends_on,
  P07: probeSuite.probes[6].depends_on,
});
function makeEvidenceIndex(unitId, capturePhase = "before_action", suffix = "01") {
  return {
    indexes: [{
      evidence_id: `T2-EV-${unitId}-20260805-1200-${suffix}`,
      observed_at: "2026-08-05T12:00:00+08:00",
      actor_role: "participant",
      redacted_storage_slot: `controlled-slot-${unitId}-${suffix}`,
      capture_phases: [capturePhase],
      redaction_checked: true,
    }],
    r10_subchecks: null,
  };
}

function makePermissionCandidate() {
  return structuredClone({ probeSuite, permissionResults, evidenceTemplate });
}

function setObservedRecord(candidate, index, executionStatus, result = null) {
  const record = candidate.permissionResults.permission_probes[index];
  const onsite = candidate.evidenceTemplate.permission_checks[index];
  const evidenceIndex = makeEvidenceIndex(record.unit_id);
  Object.assign(record, {
    execution_status: executionStatus,
    result,
    evidence: evidenceIndex,
    preconditions_observed: ["synthetic_precondition"],
    actual_action: "synthetic_action",
    actual_result: "synthetic_result",
    actual_time: "2026-08-05T12:00:00+08:00",
    executor: "participant",
    account_role: "participant",
    limitations: executionStatus === "blocked" || ["受限", "不可用"].includes(result) ? "synthetic_limit" : null,
    evidence_index: evidenceIndex,
    fallback_verified: true,
    cleanup_result: "synthetic_cleanup",
    verifier: "synthetic_verifier",
  });
  onsite.structured_evidence_index = structuredClone(evidenceIndex);
  onsite.status = expectedChinesePermissionStatus(record);
  if (record.unit_id === "P03") {
    onsite.evidence_presence = executionStatus === "not_tested" ? "待填" : "已记录";
    onsite.redaction_status = executionStatus === "not_tested" ? "待填" : "已复核";
  }
  return record;
}

function makeP03PrebuildProof(overrides = {}) {
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
    allowed_isolated_view_opened: true,
    non_isolated_views_hidden: true,
    non_target_records_hidden: true,
    direct_table_access_denied: true,
    raw_json_hidden: true,
    management_configuration_hidden: true,
    protected_mutation_attempted: true,
    protected_mutation_rejected: true,
    unauthorized_business_write_count: 0,
    business_state_unchanged: true,
    temporary_access_revoked: true,
    cleanup_reverified: true,
    ...overrides,
  };
}

function setP03PrebuildBlocked(candidate) {
  const parent = setObservedRecord(candidate, 2, "blocked");
  const evidenceIndex = makeEvidenceIndex("P03", "prebuild_gate");
  parent.evidence = structuredClone(evidenceIndex);
  parent.evidence_index = structuredClone(evidenceIndex);
  candidate.evidenceTemplate.permission_checks[2].structured_evidence_index = structuredClone(evidenceIndex);
  candidate.evidenceTemplate.permission_checks[2].p03_phase_observations.prebuild_gate = {
    execution_status: "completed",
    result: "可用",
    evidence_index: structuredClone(evidenceIndex),
    actual_action: "synthetic_prebuild_probe",
    actual_result: "synthetic_boundary",
    actual_time: "2026-08-05T12:00:00+08:00",
    actual_prebuild_proof: makeP03PrebuildProof(),
  };
  return candidate;
}

function setP03PrebuildAttemptBlocked(candidate) {
  const parent = setObservedRecord(candidate, 2, "blocked");
  const evidenceIndex = makeEvidenceIndex("P03", "prebuild_gate");
  parent.evidence = structuredClone(evidenceIndex);
  parent.evidence_index = structuredClone(evidenceIndex);
  const onsite = candidate.evidenceTemplate.permission_checks[2];
  onsite.structured_evidence_index = structuredClone(evidenceIndex);
  onsite.p03_phase_observations.prebuild_gate = {
    execution_status: "blocked",
    result: null,
    evidence_index: structuredClone(evidenceIndex),
    actual_action: "synthetic_prebuild_probe_attempted",
    actual_result: "synthetic_prebuild_incomplete",
    actual_time: "2026-08-05T12:00:00+08:00",
    actual_prebuild_proof: null,
  };
  return candidate;
}

function setP03PrebuildRestricted(candidate) {
  setP03PrebuildBlocked(candidate);
  const parent = candidate.permissionResults.permission_probes[2];
  const phase = candidate.evidenceTemplate.permission_checks[2].p03_phase_observations.prebuild_gate;
  phase.result = "受限";
  parent.limitations = "synthetic_prebuild_limit";
  parent.fallback_verified = true;
  return candidate;
}

function setP03PrebuildUnavailable(candidate) {
  setP03PrebuildBlocked(candidate);
  const parent = candidate.permissionResults.permission_probes[2];
  const phase = candidate.evidenceTemplate.permission_checks[2].p03_phase_observations.prebuild_gate;
  phase.result = "不可用";
  phase.actual_prebuild_proof.allowed_isolated_view_opened = false;
  phase.actual_prebuild_proof.protected_mutation_attempted = false;
  phase.actual_prebuild_proof.protected_mutation_rejected = false;
  parent.limitations = "synthetic_prebuild_view_unavailable";
  parent.fallback_verified = true;
  return candidate;
}

function setP03PrebuildVisibilityLeakUnavailable(candidate) {
  setP03PrebuildBlocked(candidate);
  const parent = candidate.permissionResults.permission_probes[2];
  const phase = candidate.evidenceTemplate.permission_checks[2].p03_phase_observations.prebuild_gate;
  phase.result = "不可用";
  phase.actual_prebuild_proof.raw_json_hidden = false;
  phase.actual_prebuild_proof.protected_mutation_attempted = false;
  phase.actual_prebuild_proof.protected_mutation_rejected = false;
  parent.limitations = "synthetic_prebuild_visibility_boundary_unsafe";
  parent.fallback_verified = true;
  return candidate;
}

function setP02Completed(candidate) {
  const p02 = setObservedRecord(candidate, 1, "completed", "可用");
  p02.evidence_index.r10_subchecks = makeP02CompletedSubchecks(p02.evidence_index.indexes[0].evidence_id);
  syncPermissionEvidence(candidate, 1);
  const p02Proof = candidate.evidenceTemplate.permission_checks[1].r10_selector_and_execution_mode_evidence_contract;
  p02Proof.permission_snapshot_sha256 = "3".repeat(64);
  p02Proof.permission_revision = "synthetic-revision";
  return candidate;
}

function setP03Completed(candidate) {
  setP02Completed(candidate);
  setP03PrebuildBlocked(candidate);
  const parent = candidate.permissionResults.permission_probes[2];
  const post = makeEvidenceIndex("P03", "postbuild_five_view_direct_table_recheck", "02");
  parent.execution_status = "completed";
  parent.result = "可用";
  parent.evidence_index.r10_subchecks = makeP03CompletedSubchecks(post.indexes[0].evidence_id);
  parent.evidence_index.indexes.push(structuredClone(post.indexes[0]));
  parent.evidence = structuredClone(parent.evidence_index);
  candidate.evidenceTemplate.permission_checks[2].structured_evidence_index = structuredClone(parent.evidence_index);
  candidate.evidenceTemplate.permission_checks[2].status = "可用";
  const proof = candidate.evidenceTemplate.permission_checks[2].r10_recurrence_visibility_and_attestation_evidence_contract;
  proof.actual_all_five_business_views_result = {
    views: p03BusinessViewKeys.map((viewKey) => ({
      view_key: viewKey, opened: true, refreshed: true, allowed_action_verified: true, raw_recurrence_records_visible: false,
    })),
    relogin_completed: true,
    refresh_boundary_stable: true,
    unauthorized_W6_action_rejected: true,
    protected_field_mutation_rejected: true,
    administrator_configuration_hidden: true,
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
  proof.issued_at = "2026-08-05T11:55:00+08:00";
  proof.capability_checked_at = "2026-08-05T11:56:00+08:00";
  proof.capability_rechecked_at = "2026-08-05T12:04:00+08:00";
  proof.expires_at = "2026-08-05T12:10:00+08:00";
  proof.actual_prewrite_recheck_result = {
    permission_snapshot_matches: true, permission_revision_matches: true, attestation_unexpired: true, rechecked_before_write: true,
  };
  proof.actual_drift_or_expiry_injection_result = { permission_drift_rejected: true, expiry_rejected: true, zero_writes: true };
  candidate.evidenceTemplate.permission_checks[2].p03_phase_observations.postbuild_five_view_direct_table_recheck = {
    execution_status: "completed",
    result: "可用",
    evidence_index: post,
    actual_action: "synthetic_postbuild_probe",
    actual_result: "synthetic_boundary",
    actual_time: "2026-08-05T12:05:00+08:00",
  };
  return candidate;
}

function setP03CompletedClassification(candidate, result, usableViewCount, { safetyFailure = false, prebuildResult = "可用" } = {}) {
  setP03Completed(candidate);
  const parent = candidate.permissionResults.permission_probes[2];
  const onsite = candidate.evidenceTemplate.permission_checks[2];
  parent.result = result;
  parent.limitations = ["受限", "不可用"].includes(result) || prebuildResult === "受限" ? "synthetic_limit" : null;
  parent.fallback_verified = true;
  onsite.status = result;
  onsite.p03_phase_observations.prebuild_gate.result = prebuildResult;
  const prebuildProof = onsite.p03_phase_observations.prebuild_gate.actual_prebuild_proof;
  if (prebuildResult === "不可用") {
    prebuildProof.protected_mutation_rejected = false;
  }
  onsite.p03_phase_observations.postbuild_five_view_direct_table_recheck.result = result;
  const rows = onsite.r10_recurrence_visibility_and_attestation_evidence_contract.actual_all_five_business_views_result.views;
  rows.forEach((row, index) => {
    row.opened = index < usableViewCount;
    row.refreshed = index < usableViewCount;
    row.allowed_action_verified = index < usableViewCount;
  });
  if (safetyFailure) onsite.r10_recurrence_visibility_and_attestation_evidence_contract.actual_drift_or_expiry_injection_result.zero_writes = false;
  return candidate;
}

function syncPermissionEvidence(candidate, index) {
  const record = candidate.permissionResults.permission_probes[index];
  record.evidence = structuredClone(record.evidence_index);
  candidate.evidenceTemplate.permission_checks[index].structured_evidence_index = structuredClone(record.evidence_index);
}

function setP03PrebuildTwoEvidence(candidate) {
  setP03PrebuildBlocked(candidate);
  const parent = candidate.permissionResults.permission_probes[2];
  const onsite = candidate.evidenceTemplate.permission_checks[2];
  const secondEntry = makeEvidenceIndex("P03", "prebuild_gate", "02").indexes[0];
  parent.evidence_index.indexes.push(structuredClone(secondEntry));
  parent.evidence = structuredClone(parent.evidence_index);
  onsite.structured_evidence_index = structuredClone(parent.evidence_index);
  onsite.p03_phase_observations.prebuild_gate.evidence_index.indexes.push(structuredClone(secondEntry));
  return candidate;
}

function moveP03CompletedPhaseToPostbuild(candidate) {
  const parent = candidate.permissionResults.permission_probes[2];
  const phases = candidate.evidenceTemplate.permission_checks[2].p03_phase_observations;
  const post = structuredClone(phases.prebuild_gate);
  post.actual_action = "synthetic_postbuild_probe";
  post.evidence_index.indexes[0].capture_phases = ["postbuild_five_view_direct_table_recheck"];
  phases.prebuild_gate = {
    execution_status: "not_tested",
    result: null,
    evidence_index: null,
    actual_action: null,
    actual_result: null,
    actual_time: null,
    actual_prebuild_proof: null,
  };
  delete post.actual_prebuild_proof;
  phases.postbuild_five_view_direct_table_recheck = post;
  parent.evidence_index.indexes[0].capture_phases = ["postbuild_five_view_direct_table_recheck"];
  syncPermissionEvidence(candidate, 2);
}

function artifactNegative(id, targetIssue, mutate, setup = () => {}) {
  const expectedIssues = Array.isArray(targetIssue) ? targetIssue : [targetIssue];
  const baseline = makePermissionCandidate();
  setup(baseline);
  const baselineIssues = permissionArtifactIssues(baseline);
  const candidate = structuredClone(baseline);
  mutate(candidate);
  const mutationIssues = permissionArtifactIssues(candidate);
  return {
    id,
    baselineIssues,
    mutationIssues,
    targetIssue: expectedIssues[0],
    expectedIssues,
    targetIssueHit: expectedIssues.every((issue) => mutationIssues.includes(issue)),
    accepted: mutationIssues.length === 0,
  };
}

const exactR10PositiveCandidate = makePermissionCandidate();
setP03Completed(exactR10PositiveCandidate);
assertInGroup(permissionResultGroup, "P03_result_contract_declares_exact_proof_identity_classification_and_evidence_metadata_closure",
  equalArrays(permissionResultContract.p03_phase_contract.completed_on_site_machine_result_contract.proof_root_exact_keys, expectedDeclaredP03ProofRootKeys)
  && canonicalDeepEqual(permissionResultContract.p03_phase_contract.completed_on_site_machine_result_contract.proof_root_static_identity, expectedDeclaredP03ProofStaticIdentity)
  && canonicalDeepEqual(permissionResultContract.p03_phase_contract.completed_on_site_machine_result_contract.deterministic_result_classification, expectedDeclaredP03Classification)
  && canonicalDeepEqual(permissionResultContract.p03_phase_contract.evidence_metadata_state_contract, expectedDeclaredP03EvidenceMetadataState)
  && hasExactKeys(permissionResultContract.p03_phase_contract.prebuild_proof_contract, p03PrebuildProofContractKeys)
  && canonicalDeepEqual(permissionResultContract.p03_phase_contract.prebuild_proof_contract, expectedDeclaredP03PrebuildProofContract)
  && equalArrays(probeSuite.status_contract.canonical_evidence_binding_contract.capture_phases_allowed, allCapturePhases)
  && equalArrays(probeSuite.status_contract.canonical_evidence_binding_contract.non_P03_capture_phases_allowed, genericCapturePhases)
  && equalArrays(permissionResultContract.evidence_index_contract.capture_phases_allowed, allCapturePhases)
  && equalArrays(permissionResultContract.evidence_index_contract.non_P03_capture_phases_allowed, genericCapturePhases)
  && equalArrays(evidenceTemplate.permission_evidence_index_contract.capture_phases_allowed, allCapturePhases)
  && equalArrays(evidenceTemplate.permission_evidence_index_contract.non_P03_capture_phases_allowed, genericCapturePhases)
  && equalArrays(p03OnsiteRecord.p03_phase_binding_contract.prebuild_visibility_safety_keys, p03PrebuildVisibilitySafetyKeys)
  && equalArrays(p03OnsiteRecord.p03_phase_binding_contract.prebuild_proof_exact_keys, p03PrebuildProofKeys),
  permissionResultContract.p03_phase_contract);
const p03PrebuildAvailablePositiveCandidate = makePermissionCandidate();
setP03PrebuildBlocked(p03PrebuildAvailablePositiveCandidate);
const p03PrebuildRestrictedPositiveCandidate = makePermissionCandidate();
setP03PrebuildRestricted(p03PrebuildRestrictedPositiveCandidate);
const p03PrebuildUnavailablePositiveCandidate = makePermissionCandidate();
setP03PrebuildUnavailable(p03PrebuildUnavailablePositiveCandidate);
const p03PrebuildVisibilityLeakUnavailablePositiveCandidate = makePermissionCandidate();
setP03PrebuildVisibilityLeakUnavailable(p03PrebuildVisibilityLeakUnavailablePositiveCandidate);
const p03PrebuildAttemptBlockedPositiveCandidate = makePermissionCandidate();
setP03PrebuildAttemptBlocked(p03PrebuildAttemptBlockedPositiveCandidate);
assertInGroup(permissionResultGroup, "P03_prebuild_proof_positive_states_are_exact_and_parent_remains_unfinished_until_postbuild",
  permissionArtifactIssues(p03PrebuildAvailablePositiveCandidate).length === 0
  && permissionArtifactIssues(p03PrebuildRestrictedPositiveCandidate).length === 0
  && permissionArtifactIssues(p03PrebuildUnavailablePositiveCandidate).length === 0
  && permissionArtifactIssues(p03PrebuildVisibilityLeakUnavailablePositiveCandidate).length === 0
  && permissionArtifactIssues(p03PrebuildAttemptBlockedPositiveCandidate).length === 0
  && permissionArtifactIssues({ probeSuite, permissionResults, evidenceTemplate }).length === 0
  && [p03PrebuildAvailablePositiveCandidate, p03PrebuildRestrictedPositiveCandidate, p03PrebuildUnavailablePositiveCandidate,
    p03PrebuildVisibilityLeakUnavailablePositiveCandidate]
    .every((candidate) => candidate.permissionResults.permission_probes[2].execution_status === "blocked"
      && candidate.permissionResults.permission_probes[2].result === null)
  && p03PrebuildAttemptBlockedPositiveCandidate.permissionResults.permission_probes[2].execution_status === "blocked"
  && p03PrebuildAttemptBlockedPositiveCandidate.permissionResults.permission_probes[2].result === null, {
    available: permissionArtifactIssues(p03PrebuildAvailablePositiveCandidate),
    restricted: permissionArtifactIssues(p03PrebuildRestrictedPositiveCandidate),
    unavailable: permissionArtifactIssues(p03PrebuildUnavailablePositiveCandidate),
    visibility_leak_unavailable: permissionArtifactIssues(p03PrebuildVisibilityLeakUnavailablePositiveCandidate),
    blocked: permissionArtifactIssues(p03PrebuildAttemptBlockedPositiveCandidate),
    not_tested: permissionArtifactIssues({ probeSuite, permissionResults, evidenceTemplate }),
  });
const p03DirectTableAllowedPositiveCandidate = structuredClone(exactR10PositiveCandidate);
const p03DirectTableAllowedResult = p03DirectTableAllowedPositiveCandidate.evidenceTemplate.permission_checks[2]
  .r10_recurrence_visibility_and_attestation_evidence_contract.actual_direct_clusters_table_result;
p03DirectTableAllowedResult.access_allowed = true;
p03DirectTableAllowedResult.refreshed = true;
const p03RestrictedPositiveCandidate = makePermissionCandidate();
setP03CompletedClassification(p03RestrictedPositiveCandidate, "受限", 4);
const p03UnavailablePositiveCandidate = makePermissionCandidate();
setP03CompletedClassification(p03UnavailablePositiveCandidate, "不可用", 0);
const p03SafetyFailureUnavailablePositiveCandidate = makePermissionCandidate();
setP03CompletedClassification(p03SafetyFailureUnavailablePositiveCandidate, "不可用", 5, { safetyFailure: true });
const p03DirectLeakUnavailablePositiveCandidate = makePermissionCandidate();
setP03CompletedClassification(p03DirectLeakUnavailablePositiveCandidate, "不可用", 5);
p03DirectLeakUnavailablePositiveCandidate.evidenceTemplate.permission_checks[2]
  .r10_recurrence_visibility_and_attestation_evidence_contract.actual_direct_clusters_table_result.raw_recurrence_records_visible = true;
const p03PrewriteLimitedPositiveCandidate = makePermissionCandidate();
setP03CompletedClassification(p03PrewriteLimitedPositiveCandidate, "受限", 5);
p03PrewriteLimitedPositiveCandidate.evidenceTemplate.permission_checks[2]
  .r10_recurrence_visibility_and_attestation_evidence_contract.actual_prewrite_recheck_result.permission_revision_matches = false;
const p03RestrictedPrebuildContinuationPositiveCandidate = makePermissionCandidate();
setP03CompletedClassification(p03RestrictedPrebuildContinuationPositiveCandidate, "可用", 5, { prebuildResult: "受限" });
const p03PostbuildUnavailablePositiveCandidate = makePermissionCandidate();
setP03CompletedClassification(p03PostbuildUnavailablePositiveCandidate, "不可用", 0, { prebuildResult: "可用" });
const p03TimeOrderNegativeControl = structuredClone(exactR10PositiveCandidate);
p03TimeOrderNegativeControl.evidenceTemplate.permission_checks[2].p03_phase_observations.prebuild_gate.actual_time = "2026-08-05T12:10:00+08:00";
assertInGroup(permissionResultGroup, "permission_live_P02_P03_exact_completed_artifacts_pass_production_predicate_while_reverse_phase_time_hits_explicit_order_issue",
  permissionArtifactIssues({ probeSuite, permissionResults, evidenceTemplate }).length === 0
  && permissionArtifactIssues(exactR10PositiveCandidate).length === 0
  && permissionArtifactIssues(p03DirectTableAllowedPositiveCandidate).length === 0
  && permissionArtifactIssues(p03RestrictedPositiveCandidate).length === 0
  && permissionArtifactIssues(p03UnavailablePositiveCandidate).length === 0
  && permissionArtifactIssues(p03SafetyFailureUnavailablePositiveCandidate).length === 0
  && permissionArtifactIssues(p03DirectLeakUnavailablePositiveCandidate).length === 0
  && permissionArtifactIssues(p03PrewriteLimitedPositiveCandidate).length === 0
  && permissionArtifactIssues(p03RestrictedPrebuildContinuationPositiveCandidate).length === 0
  && permissionArtifactIssues(p03PostbuildUnavailablePositiveCandidate).length === 0
  && permissionArtifactIssues(p03TimeOrderNegativeControl).includes("P03:phase_time_order_prebuild_not_after_postbuild"), {
    live: permissionArtifactIssues({ probeSuite, permissionResults, evidenceTemplate }),
    exact_positive: permissionArtifactIssues(exactR10PositiveCandidate),
    direct_table_allowed_positive: permissionArtifactIssues(p03DirectTableAllowedPositiveCandidate),
    restricted_positive: permissionArtifactIssues(p03RestrictedPositiveCandidate),
    unavailable_positive: permissionArtifactIssues(p03UnavailablePositiveCandidate),
    safety_failure_unavailable_positive: permissionArtifactIssues(p03SafetyFailureUnavailablePositiveCandidate),
    direct_leak_unavailable_positive: permissionArtifactIssues(p03DirectLeakUnavailablePositiveCandidate),
    prewrite_limited_positive: permissionArtifactIssues(p03PrewriteLimitedPositiveCandidate),
    restricted_prebuild_continuation_positive: permissionArtifactIssues(p03RestrictedPrebuildContinuationPositiveCandidate),
    postbuild_unavailable_positive: permissionArtifactIssues(p03PostbuildUnavailablePositiveCandidate),
    reverse_time: permissionArtifactIssues(p03TimeOrderNegativeControl),
  });

const p03ProofRootMissingFixtureKeys = Object.freeze([
  "probe_ref", "normalized_existing_evidence_unit_ref", "creates_new_evidence_unit",
  "actual_all_five_business_views_result", "actual_direct_clusters_table_result",
  "actual_recurrence_visibility_no_broader_than_source_fields_result", "attestation_id_digest",
  "capability_attestation_sha256", "permission_snapshot_sha256", "permission_revision", "issued_at", "expires_at",
  "capability_checked_at", "capability_rechecked_at", "actual_prewrite_recheck_result", "actual_drift_or_expiry_injection_result",
]);

const p03ProofClosureFixtures = [
  artifactNegative("P03_completed_proof_root_null", "P03:P03_completed_proof_root_exact_keys", (c) => {
    c.evidenceTemplate.permission_checks[2].r10_recurrence_visibility_and_attestation_evidence_contract = null;
  }, setP03Completed),
  artifactNegative("P03_completed_proof_root_array", "P03:P03_completed_proof_root_exact_keys", (c) => {
    c.evidenceTemplate.permission_checks[2].r10_recurrence_visibility_and_attestation_evidence_contract = [];
  }, setP03Completed),
  artifactNegative("P03_completed_proof_root_string", "P03:P03_completed_proof_root_exact_keys", (c) => {
    c.evidenceTemplate.permission_checks[2].r10_recurrence_visibility_and_attestation_evidence_contract = "invalid";
  }, setP03Completed),
  ...p03ProofRootMissingFixtureKeys.map((key) => artifactNegative(`P03_completed_proof_root_missing_${key}`,
    "P03:P03_completed_proof_root_exact_keys", (c) => {
      delete c.evidenceTemplate.permission_checks[2].r10_recurrence_visibility_and_attestation_evidence_contract[key];
    }, setP03Completed)),
  artifactNegative("P03_completed_proof_root_extra", "P03:P03_completed_proof_root_exact_keys", (c) => {
    c.evidenceTemplate.permission_checks[2].r10_recurrence_visibility_and_attestation_evidence_contract.extra = null;
  }, setP03Completed),
  artifactNegative("P03_completed_proof_root_probe_ref_drift", "P03:P03_completed_proof_root_probe_ref", (c) => {
    c.evidenceTemplate.permission_checks[2].r10_recurrence_visibility_and_attestation_evidence_contract.probe_ref = "P02";
  }, setP03Completed),
  artifactNegative("P03_completed_proof_root_evidence_unit_ref_drift", "P03:P03_completed_proof_root_evidence_unit_ref", (c) => {
    c.evidenceTemplate.permission_checks[2].r10_recurrence_visibility_and_attestation_evidence_contract.normalized_existing_evidence_unit_ref = "P03";
  }, setP03Completed),
  artifactNegative("P03_completed_proof_root_creates_new_evidence_unit_drift", "P03:P03_completed_proof_root_creates_new_evidence_unit", (c) => {
    c.evidenceTemplate.permission_checks[2].r10_recurrence_visibility_and_attestation_evidence_contract.creates_new_evidence_unit = true;
  }, setP03Completed),
];

const p03MetadataBaselineSetups = Object.freeze({
  not_tested: () => {},
  blocked: setP03PrebuildBlocked,
  completed: setP03Completed,
});
const p03MetadataFieldCases = Object.freeze({
  evidence_presence: { not_tested: "已记录", blocked: "待填", completed: "待填", issue: "P03:onsite_evidence_presence_state_mismatch" },
  redaction_status: { not_tested: "已复核", blocked: "待填", completed: "待填", issue: "P03:onsite_redaction_status_state_mismatch" },
});
const p03MetadataMutations = Object.freeze([
  { suffix: "reverse", apply: (record, field, state, spec) => { record[field] = spec[state]; } },
  { suffix: "delete", apply: (record, field) => { delete record[field]; } },
  { suffix: "null", apply: (record, field) => { record[field] = null; } },
  { suffix: "number", apply: (record, field) => { record[field] = 0; } },
  { suffix: "object", apply: (record, field) => { record[field] = { invalid: true }; } },
]);
const p03MetadataClosureFixtures = Object.entries(p03MetadataBaselineSetups).flatMap(([state, setup]) =>
  Object.entries(p03MetadataFieldCases).flatMap(([field, spec]) => p03MetadataMutations.map(({ suffix, apply }) =>
    artifactNegative(`P03_metadata_${state}_${field}_${suffix}`, spec.issue, (c) => {
      apply(c.evidenceTemplate.permission_checks[2], field, state, spec);
    }, setup))));

const p03DeclarationClosureFixtures = [
  artifactNegative("P03_declaration_proof_root_exact_keys_missing", "P03_contract_declaration_proof_root_exact_keys", (c) => {
    c.permissionResults.result_record_contract.p03_phase_contract.completed_on_site_machine_result_contract.proof_root_exact_keys.shift();
  }),
  artifactNegative("P03_declaration_proof_root_exact_keys_extra", "P03_contract_declaration_proof_root_exact_keys", (c) => {
    c.permissionResults.result_record_contract.p03_phase_contract.completed_on_site_machine_result_contract.proof_root_exact_keys.push("extra");
  }),
  artifactNegative("P03_declaration_proof_root_exact_keys_rename", "P03_contract_declaration_proof_root_exact_keys", (c) => {
    c.permissionResults.result_record_contract.p03_phase_contract.completed_on_site_machine_result_contract.proof_root_exact_keys[0] = "probe_reference";
  }),
  artifactNegative("P03_declaration_proof_root_static_identity_missing", "P03_contract_declaration_proof_root_static_identity", (c) => {
    delete c.permissionResults.result_record_contract.p03_phase_contract.completed_on_site_machine_result_contract.proof_root_static_identity.probe_ref;
  }),
  artifactNegative("P03_declaration_proof_root_static_identity_extra", "P03_contract_declaration_proof_root_static_identity", (c) => {
    c.permissionResults.result_record_contract.p03_phase_contract.completed_on_site_machine_result_contract.proof_root_static_identity.extra = false;
  }),
  artifactNegative("P03_declaration_proof_root_static_identity_rename", "P03_contract_declaration_proof_root_static_identity", (c) => {
    const value = c.permissionResults.result_record_contract.p03_phase_contract.completed_on_site_machine_result_contract.proof_root_static_identity;
    value.probe_reference = value.probe_ref; delete value.probe_ref;
  }),
  artifactNegative("P03_declaration_deterministic_result_classification_missing", "P03_contract_declaration_deterministic_result_classification", (c) => {
    delete c.permissionResults.result_record_contract.p03_phase_contract.completed_on_site_machine_result_contract.deterministic_result_classification["可用"];
  }),
  artifactNegative("P03_declaration_deterministic_result_classification_extra", "P03_contract_declaration_deterministic_result_classification", (c) => {
    c.permissionResults.result_record_contract.p03_phase_contract.completed_on_site_machine_result_contract.deterministic_result_classification.extra = "invalid";
  }),
  artifactNegative("P03_declaration_deterministic_result_classification_rename", "P03_contract_declaration_deterministic_result_classification", (c) => {
    const value = c.permissionResults.result_record_contract.p03_phase_contract.completed_on_site_machine_result_contract.deterministic_result_classification;
    value.available = value["可用"]; delete value["可用"];
  }),
  artifactNegative("P03_declaration_evidence_metadata_state_contract_missing", "P03_contract_declaration_evidence_metadata_state_contract", (c) => {
    delete c.permissionResults.result_record_contract.p03_phase_contract.evidence_metadata_state_contract.not_tested;
  }),
  artifactNegative("P03_declaration_evidence_metadata_state_contract_extra", "P03_contract_declaration_evidence_metadata_state_contract", (c) => {
    c.permissionResults.result_record_contract.p03_phase_contract.evidence_metadata_state_contract.extra = { evidence_presence: "待填", redaction_status: "待填" };
  }),
  artifactNegative("P03_declaration_evidence_metadata_state_contract_rename", "P03_contract_declaration_evidence_metadata_state_contract", (c) => {
    const value = c.permissionResults.result_record_contract.p03_phase_contract.evidence_metadata_state_contract;
    value.untested = value.not_tested; delete value.not_tested;
  }),
];

const p03ContractClosureFixtures = [
  ...p03ProofClosureFixtures,
  ...p03MetadataClosureFixtures,
  ...p03DeclarationClosureFixtures,
];

const p03PrebuildProofFixtures = [
  artifactNegative("P03_prebuild_proof_root_null", "P03:actual_prebuild_proof_exact_keys", (c) => {
    c.evidenceTemplate.permission_checks[2].p03_phase_observations.prebuild_gate.actual_prebuild_proof = null;
  }, setP03PrebuildBlocked),
  artifactNegative("P03_prebuild_proof_root_array", "P03:actual_prebuild_proof_exact_keys", (c) => {
    c.evidenceTemplate.permission_checks[2].p03_phase_observations.prebuild_gate.actual_prebuild_proof = [];
  }, setP03PrebuildBlocked),
  artifactNegative("P03_prebuild_proof_root_string", "P03:actual_prebuild_proof_exact_keys", (c) => {
    c.evidenceTemplate.permission_checks[2].p03_phase_observations.prebuild_gate.actual_prebuild_proof = "invalid";
  }, setP03PrebuildBlocked),
  artifactNegative("P03_prebuild_proof_missing_key", "P03:actual_prebuild_proof_exact_keys", (c) => {
    delete c.evidenceTemplate.permission_checks[2].p03_phase_observations.prebuild_gate.actual_prebuild_proof.cleanup_reverified;
  }, setP03PrebuildBlocked),
  artifactNegative("P03_prebuild_proof_extra_key", "P03:actual_prebuild_proof_exact_keys", (c) => {
    c.evidenceTemplate.permission_checks[2].p03_phase_observations.prebuild_gate.actual_prebuild_proof.extra = null;
  }, setP03PrebuildBlocked),
  artifactNegative("P03_prebuild_fixture_marker_drift", "P03:actual_prebuild_proof_fixture_marker", (c) => {
    c.evidenceTemplate.permission_checks[2].p03_phase_observations.prebuild_gate.actual_prebuild_proof.fixture_marker = "SYN-OTHER";
  }, setP03PrebuildBlocked),
  artifactNegative("P03_prebuild_data_scope_drift", "P03:actual_prebuild_proof_data_scope", (c) => {
    c.evidenceTemplate.permission_checks[2].p03_phase_observations.prebuild_gate.actual_prebuild_proof.data_scope = "enterprise_data";
  }, setP03PrebuildBlocked),
  artifactNegative("P03_prebuild_test_scope_drift", "P03:actual_prebuild_proof_test_scope", (c) => {
    c.evidenceTemplate.permission_checks[2].p03_phase_observations.prebuild_gate.actual_prebuild_proof.test_scope = "shared_base";
  }, setP03PrebuildBlocked),
  artifactNegative("P03_prebuild_enterprise_data_used", "P03:actual_prebuild_proof_enterprise_data_used", (c) => {
    c.evidenceTemplate.permission_checks[2].p03_phase_observations.prebuild_gate.actual_prebuild_proof.enterprise_data_used = true;
  }, setP03PrebuildBlocked),
  artifactNegative("P03_prebuild_actor_class_drift", "P03:actual_prebuild_proof_actor_class", (c) => {
    c.evidenceTemplate.permission_checks[2].p03_phase_observations.prebuild_gate.actual_prebuild_proof.actor_class = "owner";
  }, setP03PrebuildBlocked),
  artifactNegative("P03_prebuild_actor_not_distinct_from_owner", "P03:actual_prebuild_proof_actor_distinct_from_owner_verified", (c) => {
    c.evidenceTemplate.permission_checks[2].p03_phase_observations.prebuild_gate.actual_prebuild_proof.actor_distinct_from_owner_verified = false;
  }, setP03PrebuildBlocked),
  artifactNegative("P03_prebuild_owner_privileges_present", "P03:actual_prebuild_proof_owner_privileges_absent", (c) => {
    c.evidenceTemplate.permission_checks[2].p03_phase_observations.prebuild_gate.actual_prebuild_proof.owner_privileges_absent = false;
  }, setP03PrebuildBlocked),
  artifactNegative("P03_prebuild_administrator_privileges_present", "P03:actual_prebuild_proof_administrator_privileges_absent", (c) => {
    c.evidenceTemplate.permission_checks[2].p03_phase_observations.prebuild_gate.actual_prebuild_proof.administrator_privileges_absent = false;
  }, setP03PrebuildBlocked),
  artifactNegative("P03_prebuild_independent_session_unverified", "P03:actual_prebuild_proof_independent_session_verified", (c) => {
    c.evidenceTemplate.permission_checks[2].p03_phase_observations.prebuild_gate.actual_prebuild_proof.independent_session_verified = false;
  }, setP03PrebuildBlocked),
  artifactNegative("P03_prebuild_allowed_view_open_not_attempted", "P03:actual_prebuild_proof_allowed_isolated_view_open_attempted", (c) => {
    c.evidenceTemplate.permission_checks[2].p03_phase_observations.prebuild_gate.actual_prebuild_proof.allowed_isolated_view_open_attempted = false;
  }, setP03PrebuildBlocked),
  artifactNegative("P03_prebuild_protected_mutation_not_attempted", [
    "P03:actual_prebuild_proof_protected_mutation_attempted",
    "P03:actual_prebuild_proof_result_classification",
  ], (c) => {
    c.evidenceTemplate.permission_checks[2].p03_phase_observations.prebuild_gate.actual_prebuild_proof.protected_mutation_attempted = false;
  }, setP03PrebuildBlocked),
  ...p03PrebuildVisibilitySafetyKeys.map((key) => artifactNegative(
    `P03_prebuild_${key}_wrong_type`,
    "P03:actual_prebuild_proof_observation_types",
    (c) => { c.evidenceTemplate.permission_checks[2].p03_phase_observations.prebuild_gate.actual_prebuild_proof[key] = "true"; },
    setP03PrebuildBlocked,
  )),
  artifactNegative("P03_prebuild_unauthorized_write_count_wrong_type", "P03:actual_prebuild_proof_unauthorized_business_write_count", (c) => {
    c.evidenceTemplate.permission_checks[2].p03_phase_observations.prebuild_gate.actual_prebuild_proof.unauthorized_business_write_count = "0";
  }, setP03PrebuildBlocked),
  artifactNegative("P03_prebuild_unauthorized_write_count_negative", "P03:actual_prebuild_proof_unauthorized_business_write_count", (c) => {
    c.evidenceTemplate.permission_checks[2].p03_phase_observations.prebuild_gate.actual_prebuild_proof.unauthorized_business_write_count = -1;
  }, setP03PrebuildBlocked),
  artifactNegative("P03_prebuild_temporary_access_not_revoked", "P03:actual_prebuild_proof_temporary_access_revoked", (c) => {
    c.evidenceTemplate.permission_checks[2].p03_phase_observations.prebuild_gate.actual_prebuild_proof.temporary_access_revoked = false;
  }, setP03PrebuildBlocked),
  artifactNegative("P03_prebuild_cleanup_not_reverified", "P03:actual_prebuild_proof_cleanup_reverified", (c) => {
    c.evidenceTemplate.permission_checks[2].p03_phase_observations.prebuild_gate.actual_prebuild_proof.cleanup_reverified = false;
  }, setP03PrebuildBlocked),
  artifactNegative("P03_prebuild_available_but_view_not_opened", "P03:actual_prebuild_proof_result_classification", (c) => {
    const proof = c.evidenceTemplate.permission_checks[2].p03_phase_observations.prebuild_gate.actual_prebuild_proof;
    proof.allowed_isolated_view_opened = false;
    proof.protected_mutation_attempted = false;
    proof.protected_mutation_rejected = false;
  }, setP03PrebuildBlocked),
  ...[
    ["P03_prebuild_available_but_non_isolated_view_visible", "non_isolated_views_hidden"],
    ["P03_prebuild_available_but_non_target_record_visible", "non_target_records_hidden"],
    ["P03_prebuild_available_but_direct_table_access_allowed", "direct_table_access_denied"],
    ["P03_prebuild_available_but_raw_json_visible", "raw_json_hidden"],
    ["P03_prebuild_available_but_management_configuration_visible", "management_configuration_hidden"],
  ].map(([id, key]) => artifactNegative(id, "P03:actual_prebuild_proof_result_classification", (c) => {
    const proof = c.evidenceTemplate.permission_checks[2].p03_phase_observations.prebuild_gate.actual_prebuild_proof;
    proof[key] = false;
    proof.protected_mutation_attempted = false;
    proof.protected_mutation_rejected = false;
  }, setP03PrebuildBlocked)),
  artifactNegative("P03_prebuild_available_but_mutation_not_rejected", "P03:actual_prebuild_proof_result_classification", (c) => {
    c.evidenceTemplate.permission_checks[2].p03_phase_observations.prebuild_gate.actual_prebuild_proof.protected_mutation_rejected = false;
  }, setP03PrebuildBlocked),
  artifactNegative("P03_prebuild_available_but_unauthorized_write_count_positive", "P03:actual_prebuild_proof_result_classification", (c) => {
    c.evidenceTemplate.permission_checks[2].p03_phase_observations.prebuild_gate.actual_prebuild_proof.unauthorized_business_write_count = 1;
  }, setP03PrebuildBlocked),
  artifactNegative("P03_prebuild_available_but_business_state_changed", "P03:actual_prebuild_proof_result_classification", (c) => {
    c.evidenceTemplate.permission_checks[2].p03_phase_observations.prebuild_gate.actual_prebuild_proof.business_state_unchanged = false;
  }, setP03PrebuildBlocked),
  artifactNegative("P03_prebuild_restricted_without_limitations_exact", [
    "P03:blocked_runtime_shape",
    "P03:actual_prebuild_proof_limited_fallback",
    "P03:phase_prebuild_restricted_requires_safe_fallback",
  ], (c) => {
    c.permissionResults.permission_probes[2].limitations = null;
  }, setP03PrebuildRestricted),
  artifactNegative("P03_prebuild_restricted_fallback_false_exact", [
    "P03:actual_prebuild_proof_limited_fallback",
    "P03:phase_prebuild_restricted_requires_safe_fallback",
  ], (c) => {
    c.permissionResults.permission_probes[2].fallback_verified = false;
  }, setP03PrebuildRestricted),
  artifactNegative("P03_prebuild_unavailable_with_safe_outcomes", "P03:actual_prebuild_proof_result_classification", (c) => {
    c.evidenceTemplate.permission_checks[2].p03_phase_observations.prebuild_gate.result = "不可用";
    c.permissionResults.permission_probes[2].limitations = "synthetic_limit";
  }, setP03PrebuildBlocked),
  artifactNegative("P03_prebuild_view_closed_but_mutation_attempted", "P03:actual_prebuild_proof_mutation_gate", (c) => {
    c.evidenceTemplate.permission_checks[2].p03_phase_observations.prebuild_gate.actual_prebuild_proof.protected_mutation_attempted = true;
  }, setP03PrebuildUnavailable),
  artifactNegative("P03_prebuild_view_closed_but_mutation_rejected", "P03:actual_prebuild_proof_mutation_gate", (c) => {
    c.evidenceTemplate.permission_checks[2].p03_phase_observations.prebuild_gate.actual_prebuild_proof.protected_mutation_rejected = true;
  }, setP03PrebuildUnavailable),
  artifactNegative("P03_prebuild_visibility_leak_but_mutation_attempted", "P03:actual_prebuild_proof_mutation_gate", (c) => {
    c.evidenceTemplate.permission_checks[2].p03_phase_observations.prebuild_gate.actual_prebuild_proof.protected_mutation_attempted = true;
  }, setP03PrebuildVisibilityLeakUnavailable),
  artifactNegative("P03_prebuild_phase_evidence_full_object_drift", "P03:prebuild_gate:parent_evidence_binding", (c) => {
    c.evidenceTemplate.permission_checks[2].p03_phase_observations.prebuild_gate.evidence_index.indexes[0].actor_role = "other_unprivileged_actor";
  }, setP03PrebuildBlocked),
  artifactNegative("P03_prebuild_phase_evidence_order_drift", "P03:prebuild_gate:parent_evidence_binding", (c) => {
    c.evidenceTemplate.permission_checks[2].p03_phase_observations.prebuild_gate.evidence_index.indexes.reverse();
  }, setP03PrebuildTwoEvidence),
  artifactNegative("P03_prebuild_phase_evidence_duplicate_id", "P03:prebuild_gate:phase_evidence_id_unique", (c) => {
    const indexes = c.evidenceTemplate.permission_checks[2].p03_phase_observations.prebuild_gate.evidence_index.indexes;
    indexes.push(structuredClone(indexes[0]));
  }, setP03PrebuildBlocked),
  artifactNegative("P03_prebuild_parent_evidence_duplicate_id", [
    "P03:parent_evidence_id_unique",
    "P03:prebuild_gate:parent_evidence_binding",
  ], (c) => {
    const record = c.permissionResults.permission_probes[2];
    record.evidence_index.indexes.push(structuredClone(record.evidence_index.indexes[0]));
    syncPermissionEvidence(c, 2);
  }, setP03PrebuildBlocked),
  artifactNegative("P03_prebuild_blocked_nonnull_proof", "P03:actual_prebuild_proof_blocked_null", (c) => {
    c.evidenceTemplate.permission_checks[2].p03_phase_observations.prebuild_gate.actual_prebuild_proof = makeP03PrebuildProof();
  }, setP03PrebuildAttemptBlocked),
  artifactNegative("P03_prebuild_not_tested_nonnull_proof", "P03:actual_prebuild_proof_not_tested_null", (c) => {
    c.evidenceTemplate.permission_checks[2].p03_phase_observations.prebuild_gate.actual_prebuild_proof = makeP03PrebuildProof();
  }),
];

const permissionAttestationFixture = {
  attestation_schema_version: PERMISSION_RESULT_ATTESTATION_SCHEMA_VERSION,
  source_freeze_version: PERMISSION_CONTENT_SOURCE_FREEZE_VERSION,
  status: "passed",
  check_group: permissionResultGroup,
  assertion_count: 234,
  failed_assertion_count: 0,
  negative_fixture_count: 220,
  negative_fixtures: expectedPermissionNegativeFixtureIds.map((id) => ({ id, rejected: true })),
  negative_fixture_name_digest: EXPECTED_PERMISSION_NEGATIVE_FIXTURE_NAME_DIGEST,
  versions: expectedPermissionAttestationVersions,
  counts: expectedPermissionAttestationCounts,
  canonical_evidence_source: "permission_result.evidence_index",
  canonical_evidence_binding: "permission_result.evidence_and_same_Pnn_on_site.structured_evidence_index_canonical_deep_equal",
  P03_phase_binding: "phase_evidence_indexes_canonical_deep_equal_parent_P03_indexes_filtered_by_capture_phase_in_same_order_with_unique_evidence_id",
  P06_dependencies: ["P02", "P05"],
  P07_dependencies: ["P02", "P05"],
  sources: EXPECTED_PERMISSION_CONTENT_SOURCES,
  source_count: 5,
  source_digest: EXPECTED_PERMISSION_CONTENT_SOURCE_DIGEST,
  current_execution_status: "not_tested",
  real_external_operations: 0,
};

const permissionResultNegativeFixtures = [
  artifactNegative("status_truth_table_same_cardinality_drift", "status_truth_table", (c) => { c.probeSuite.status_contract.legal_state_rows[0].derived_en = "renamed"; }),
  artifactNegative("runtime_field_type_same_key_drift", "P01:permission_record_declared_types", (c) => { c.permissionResults.permission_probes[0].actual_time = 0; }),
  artifactNegative("structured_evidence_contract_same_key_drift", "P01:evidence_entry_0_observed_at", (c) => {
    c.permissionResults.permission_probes[0].evidence_index.indexes[0].observed_at = 0;
    syncPermissionEvidence(c, 0);
  }, (c) => { setObservedRecord(c, 0, "blocked"); }),
  artifactNegative("P03_prebuild_postbuild_contract_drift", "P03_contract_declaration", (c) => { c.permissionResults.result_record_contract.p03_phase_contract.prebuild_cannot_complete_parent_P03 = false; }),
  artifactNegative("capture_phase_probe_suite_declaration_drift", "capture_phase_declaration_probe_suite", (c) => {
    c.probeSuite.status_contract.canonical_evidence_binding_contract.capture_phases_allowed.pop();
  }),
  artifactNegative("capture_phase_permission_results_declaration_drift", "capture_phase_declaration_permission_results", (c) => {
    c.permissionResults.result_record_contract.evidence_index_contract.non_P03_capture_phases_allowed.push("prebuild_gate");
  }),
  artifactNegative("capture_phase_evidence_template_declaration_drift", "capture_phase_declaration_evidence_template", (c) => {
    c.evidenceTemplate.permission_evidence_index_contract.capture_phases_allowed.reverse();
  }),
  artifactNegative("P03_onsite_prebuild_boundary_contract_drift", "P03_onsite_prebuild_boundary_contract", (c) => {
    c.evidenceTemplate.permission_checks[2].p03_phase_binding_contract.prebuild_visibility_safety_keys.pop();
  }),
  artifactNegative("P06_dependency_edge_drift", "P06:dependency_edge", (c) => { c.probeSuite.probes[5].depends_on = ["P05"]; }),
  artifactNegative("P07_dependency_edge_drift", "P07:dependency_edge", (c) => { c.probeSuite.probes[6].depends_on = ["P05"]; }),
  {
    id: "permission_contract_attestation_extra_key",
    baselineIssues: permissionAttestationHasExactShape(permissionAttestationFixture) ? [] : ["permission_attestation_baseline"],
    mutationIssues: permissionAttestationHasExactShape({ ...permissionAttestationFixture, unexpected: null }) ? [] : ["permission_attestation_extra_key"],
    targetIssue: "permission_attestation_extra_key",
    targetIssueHit: !permissionAttestationHasExactShape({ ...permissionAttestationFixture, unexpected: null }),
    accepted: permissionAttestationHasExactShape({ ...permissionAttestationFixture, unexpected: null }),
  },
  artifactNegative("L-TIME-01", "P01:permission_record_declared_types", (c) => { c.permissionResults.permission_probes[0].actual_time = "2026-08-05T12:00:00"; }, (c) => { setObservedRecord(c, 0, "blocked"); }),
  artifactNegative("L-EVID-01", "P01:evidence_entry_0_exact_keys", (c) => { delete c.permissionResults.permission_probes[0].evidence_index.indexes[0].actor_role; syncPermissionEvidence(c, 0); }, (c) => { setObservedRecord(c, 0, "blocked"); }),
  artifactNegative("L-EVID-02", "P01:evidence_entry_0_exact_keys", (c) => { c.permissionResults.permission_probes[0].evidence_index.indexes[0].extra = null; syncPermissionEvidence(c, 0); }, (c) => { setObservedRecord(c, 0, "blocked"); }),
  artifactNegative("L-EVID-03", "P01:evidence_entry_0_exact_keys", (c) => { c.permissionResults.permission_probes[0].evidence_index.indexes[0] = null; syncPermissionEvidence(c, 0); }, (c) => { setObservedRecord(c, 0, "blocked"); }),
  artifactNegative("L-R10-01", "P04:r10_subchecks_forbidden_for_probe", (c) => { c.permissionResults.permission_probes[3].evidence_index.r10_subchecks = {}; syncPermissionEvidence(c, 3); }, (c) => { setObservedRecord(c, 3, "blocked"); }),
  artifactNegative("L-P03-STATE-01", "P03:parent_state", (c) => { c.permissionResults.permission_probes[2].execution_status = "not_tested"; }, setP03PrebuildBlocked),
  artifactNegative("L-P03-STATE-02", "P03:parent_state", (c) => { c.permissionResults.permission_probes[2].execution_status = "completed"; }, setP03PrebuildBlocked),
  artifactNegative("L-P03-TIME-01", "P03:prebuild_gate:observed_shape", (c) => { c.evidenceTemplate.permission_checks[2].p03_phase_observations.prebuild_gate.actual_time = "2026-08-05T12:00:00"; }, setP03PrebuildBlocked),
  artifactNegative("L-P03-BIND-01", "P03:prebuild_gate:parent_evidence_binding", (c) => { c.evidenceTemplate.permission_checks[2].p03_phase_observations.prebuild_gate.evidence_index.indexes[0].evidence_id = "T2-EV-P03-20260805-1200-99"; }, setP03PrebuildBlocked),
  artifactNegative("L-P03-BIND-02", "P03:prebuild_gate:parent_evidence_binding", (c) => { c.permissionResults.permission_probes[2].evidence_index.indexes.push(structuredClone(c.permissionResults.permission_probes[2].evidence_index.indexes[0])); syncPermissionEvidence(c, 2); }, setP03PrebuildBlocked),
  artifactNegative("L-P03-BIND-03", "P03:prebuild_gate:parent_evidence_binding", (c) => { c.permissionResults.permission_probes[2].evidence_index.indexes[0].capture_phases = ["failure"]; syncPermissionEvidence(c, 2); }, setP03PrebuildBlocked),
  artifactNegative("L-DEP-01", "P06:P05_gate", (c) => { setObservedRecord(c, 5, "blocked"); }),
  artifactNegative("L-DEP-02", "P07:P05_gate", (c) => { setObservedRecord(c, 6, "blocked"); }),
  artifactNegative("L-DEP-03", "P06:P05_gate", (c) => { setObservedRecord(c, 5, "blocked"); }, (c) => { setObservedRecord(c, 4, "blocked"); }),
  artifactNegative("L-DEP-04", "P07:P05_gate", (c) => { setObservedRecord(c, 6, "blocked"); }, (c) => { setObservedRecord(c, 4, "blocked"); }),
  artifactNegative("not_tested_with_evidence", "P01:not_tested_runtime_shape", (c) => { c.permissionResults.permission_probes[0].evidence = makeEvidenceIndex("P01"); }),
  artifactNegative("not_tested_with_result", "P01:not_tested_runtime_shape", (c) => { c.permissionResults.permission_probes[0].result = "可用"; }),
  artifactNegative("not_tested_with_action", "P01:not_tested_runtime_shape", (c) => { c.permissionResults.permission_probes[0].actual_action = "attempted"; }),
  artifactNegative("blocked_without_evidence", "P01:blocked_runtime_shape", (c) => { c.permissionResults.permission_probes[0].execution_status = "blocked"; }),
  artifactNegative("blocked_empty_preconditions", "P01:permission_record_declared_types", (c) => { c.permissionResults.permission_probes[0].preconditions_observed = []; }, (c) => { setObservedRecord(c, 0, "blocked"); }),
  artifactNegative("blocked_invalid_time", "P01:permission_record_declared_types", (c) => { c.permissionResults.permission_probes[0].actual_time = "invalid"; }, (c) => { setObservedRecord(c, 0, "blocked"); }),
  artifactNegative("blocked_empty_limitations", "P01:blocked_runtime_shape", (c) => { c.permissionResults.permission_probes[0].limitations = ""; }, (c) => { setObservedRecord(c, 0, "blocked"); }),
  artifactNegative("blocked_fallback_not_boolean", "P01:permission_record_declared_types", (c) => { c.permissionResults.permission_probes[0].fallback_verified = "true"; }, (c) => { setObservedRecord(c, 0, "blocked"); }),
  artifactNegative("blocked_same_record_mismatch", "P01:canonical_evidence_binding", (c) => { c.permissionResults.permission_probes[0].evidence = { indexes: [], r10_subchecks: null }; }, (c) => { setObservedRecord(c, 0, "blocked"); }),
  artifactNegative("blocked_onsite_mismatch", "P01:canonical_evidence_binding", (c) => { c.evidenceTemplate.permission_checks[0].structured_evidence_index.indexes[0].actor_role = "other"; }, (c) => { setObservedRecord(c, 0, "blocked"); }),
  artifactNegative("completed_invalid_result", "P01:completed_runtime_shape", (c) => { c.permissionResults.permission_probes[0].result = "未测试"; }, (c) => { setObservedRecord(c, 0, "completed", "可用"); }),
  artifactNegative("completed_restricted_empty_limitations", "P01:completed_limited_fallback_shape", (c) => { c.permissionResults.permission_probes[0].limitations = ""; }, (c) => { setObservedRecord(c, 0, "completed", "受限"); }),
  artifactNegative("completed_restricted_fallback_false", "P01:completed_limited_fallback_shape", (c) => { c.permissionResults.permission_probes[0].fallback_verified = false; }, (c) => { setObservedRecord(c, 0, "completed", "受限"); }),
  artifactNegative("completed_unavailable_empty_limitations", "P01:completed_limited_fallback_shape", (c) => { c.permissionResults.permission_probes[0].limitations = null; }, (c) => { setObservedRecord(c, 0, "completed", "不可用"); }),
  artifactNegative("completed_unavailable_fallback_false", "P01:completed_limited_fallback_shape", (c) => { c.permissionResults.permission_probes[0].fallback_verified = false; }, (c) => { setObservedRecord(c, 0, "completed", "不可用"); }),
  artifactNegative("completed_available_fallback_null", "P01:completed_runtime_shape", (c) => { c.permissionResults.permission_probes[0].fallback_verified = null; }, (c) => { setObservedRecord(c, 0, "completed", "可用"); }),
  artifactNegative("permission_record_extra_field", "P01:permission_record_exact_fields", (c) => { c.permissionResults.permission_probes[0].unexpected = null; }),
  artifactNegative("permission_record_missing_field", "P01:permission_record_exact_fields", (c) => { delete c.permissionResults.permission_probes[0].verifier; }),
  artifactNegative("evidence_entry_bad_id", "P01:evidence_entry_0_id", (c) => { c.permissionResults.permission_probes[0].evidence_index.indexes[0].evidence_id = "bad"; syncPermissionEvidence(c, 0); }, (c) => { setObservedRecord(c, 0, "blocked"); }),
  artifactNegative("evidence_entry_empty_actor", "P01:evidence_entry_0_actor_role", (c) => { c.permissionResults.permission_probes[0].evidence_index.indexes[0].actor_role = ""; syncPermissionEvidence(c, 0); }, (c) => { setObservedRecord(c, 0, "blocked"); }),
  artifactNegative("evidence_entry_unsafe_url_slot", "P01:evidence_entry_0_storage_slot", (c) => { c.permissionResults.permission_probes[0].evidence_index.indexes[0].redacted_storage_slot = "https://example.invalid/x"; syncPermissionEvidence(c, 0); }, (c) => { setObservedRecord(c, 0, "blocked"); }),
  artifactNegative("evidence_entry_resource_id_slot", "P01:evidence_entry_0_storage_slot", (c) => { c.permissionResults.permission_probes[0].evidence_index.indexes[0].redacted_storage_slot = "tblabcdefghijk"; syncPermissionEvidence(c, 0); }, (c) => { setObservedRecord(c, 0, "blocked"); }),
  artifactNegative("evidence_entry_empty_capture", "P01:evidence_entry_0_capture_phases", (c) => { c.permissionResults.permission_probes[0].evidence_index.indexes[0].capture_phases = []; syncPermissionEvidence(c, 0); }, (c) => { setObservedRecord(c, 0, "blocked"); }),
  artifactNegative("evidence_entry_invalid_capture", "P01:evidence_entry_0_capture_phases", (c) => { c.permissionResults.permission_probes[0].evidence_index.indexes[0].capture_phases = ["prebuild_gate"]; syncPermissionEvidence(c, 0); }, (c) => { setObservedRecord(c, 0, "blocked"); }),
  artifactNegative("P03_evidence_entry_unknown_capture", "P03:evidence_entry_0_capture_phases", (c) => {
    c.permissionResults.permission_probes[2].evidence_index.indexes[0].capture_phases = ["unknown_phase"];
    syncPermissionEvidence(c, 2);
  }, setP03PrebuildBlocked),
  artifactNegative("evidence_redaction_false", "P01:evidence_entry_0_redaction_checked", (c) => { c.permissionResults.permission_probes[0].evidence_index.indexes[0].redaction_checked = false; syncPermissionEvidence(c, 0); }, (c) => { setObservedRecord(c, 0, "blocked"); }),
  artifactNegative("r10_non_p02_p03_object", "P08:r10_subchecks_forbidden_for_probe", (c) => { c.permissionResults.permission_probes[7].evidence_index.r10_subchecks = {}; syncPermissionEvidence(c, 7); }, (c) => { setObservedRecord(c, 7, "blocked"); }),
  artifactNegative("r10_p02_array", "P02:r10_subchecks_outer_shape", (c) => { c.permissionResults.permission_probes[1].evidence_index.r10_subchecks = []; syncPermissionEvidence(c, 1); }, (c) => { setObservedRecord(c, 1, "blocked"); }),
  artifactNegative("P03_phase_extra_field", "P03:prebuild_gate:exact_keys", (c) => { c.evidenceTemplate.permission_checks[2].p03_phase_observations.prebuild_gate.extra = null; }, setP03PrebuildBlocked),
  artifactNegative("P03_phase_missing_field", "P03:prebuild_gate:exact_keys", (c) => { delete c.evidenceTemplate.permission_checks[2].p03_phase_observations.prebuild_gate.actual_result; }, setP03PrebuildBlocked),
  artifactNegative("P03_postbuild_started_before_prebuild", "P03:phase_order_postbuild_requires_completed_prebuild", moveP03CompletedPhaseToPostbuild, setP03PrebuildBlocked),
  artifactNegative("P03_parent_completed_only_prebuild", "P03:parent_state", (c) => {
    c.permissionResults.permission_probes[2].execution_status = "completed";
    c.permissionResults.permission_probes[2].result = "可用";
  }, setP03PrebuildBlocked),
  artifactNegative("P03_parent_completed_only_postbuild", "P03:phase_order_postbuild_requires_completed_prebuild", (c) => {
    c.evidenceTemplate.permission_checks[2].p03_phase_observations.prebuild_gate = {
      execution_status: "not_tested", result: null, evidence_index: null, actual_action: null, actual_result: null, actual_time: null,
    };
  }, setP03Completed),
  artifactNegative("P03_phase_blocked_nonnull_result", "P03:prebuild_gate:observed_shape", (c) => {
    const phase = c.evidenceTemplate.permission_checks[2].p03_phase_observations.prebuild_gate;
    phase.execution_status = "blocked";
    phase.result = "可用";
  }, setP03PrebuildBlocked),
  artifactNegative("P03_phase_completed_invalid_result", "P03:prebuild_gate:observed_shape", (c) => { c.evidenceTemplate.permission_checks[2].p03_phase_observations.prebuild_gate.result = "未测试"; }, setP03PrebuildBlocked),
  artifactNegative("P03_phase_evidence_outer_extra", "P03:prebuild_gate:observed_shape", (c) => { c.evidenceTemplate.permission_checks[2].p03_phase_observations.prebuild_gate.evidence_index.extra = null; }, setP03PrebuildBlocked),
  artifactNegative("P03_phase_id_not_in_parent", "P03:prebuild_gate:parent_evidence_binding", (c) => { c.evidenceTemplate.permission_checks[2].p03_phase_observations.prebuild_gate.evidence_index.indexes[0].evidence_id = "T2-EV-P03-20260805-1200-98"; }, setP03PrebuildBlocked),
  artifactNegative("P03_phase_parent_capture_missing", "P03:prebuild_gate:parent_evidence_binding", (c) => { c.permissionResults.permission_probes[2].evidence_index.indexes[0].capture_phases = ["failure"]; syncPermissionEvidence(c, 2); }, setP03PrebuildBlocked),
  artifactNegative("P03_phase_parent_duplicate_id", "P03:prebuild_gate:parent_evidence_binding", (c) => { c.permissionResults.permission_probes[2].evidence_index.indexes.push(structuredClone(c.permissionResults.permission_probes[2].evidence_index.indexes[0])); syncPermissionEvidence(c, 2); }, setP03PrebuildBlocked),
  artifactNegative("P03_completed_missing_r10_subchecks", "P03:P03_completed_r10_subchecks_exact_keys", (c) => {
    c.permissionResults.permission_probes[2].evidence_index.r10_subchecks = null; syncPermissionEvidence(c, 2);
  }, setP03Completed),
  artifactNegative("P03_completed_empty_r10_subchecks", "P03:P03_completed_r10_subchecks_exact_keys", (c) => {
    c.permissionResults.permission_probes[2].evidence_index.r10_subchecks = {}; syncPermissionEvidence(c, 2);
  }, setP03Completed),
  artifactNegative("P03_completed_opaque_r10_subchecks", "P03:P03_completed_r10_subchecks_exact_keys", (c) => {
    c.permissionResults.permission_probes[2].evidence_index.r10_subchecks = { opaque_fixture: true }; syncPermissionEvidence(c, 2);
  }, setP03Completed),
  artifactNegative("P03_completed_null_r10_field", "P03:P03_completed_P03-R10-raw-recurrence-visibility_evidence_refs", (c) => {
    c.permissionResults.permission_probes[2].evidence_index.r10_subchecks["P03-R10-raw-recurrence-visibility"] = [null]; syncPermissionEvidence(c, 2);
  }, setP03Completed),
  artifactNegative("P03_completed_missing_view", "P03:P03_completed_five_views_and_boundary_machine_result", (c) => {
    c.evidenceTemplate.permission_checks[2].r10_recurrence_visibility_and_attestation_evidence_contract.actual_all_five_business_views_result.views.pop();
  }, setP03Completed),
  artifactNegative("P03_completed_view_not_opened", "P03:P03_completed_result_classification", (c) => {
    c.evidenceTemplate.permission_checks[2].r10_recurrence_visibility_and_attestation_evidence_contract.actual_all_five_business_views_result.views[0].opened = false;
  }, setP03Completed),
  artifactNegative("P03_completed_view_not_refreshed", "P03:P03_completed_result_classification", (c) => {
    c.evidenceTemplate.permission_checks[2].r10_recurrence_visibility_and_attestation_evidence_contract.actual_all_five_business_views_result.views[1].refreshed = false;
  }, setP03Completed),
  artifactNegative("P03_completed_allowed_action_unverified", "P03:P03_completed_result_classification", (c) => {
    c.evidenceTemplate.permission_checks[2].r10_recurrence_visibility_and_attestation_evidence_contract.actual_all_five_business_views_result.views[2].allowed_action_verified = false;
  }, setP03Completed),
  artifactNegative("P03_completed_view_raw_visible", "P03:P03_completed_result_classification", (c) => {
    c.evidenceTemplate.permission_checks[2].r10_recurrence_visibility_and_attestation_evidence_contract.actual_all_five_business_views_result.views[3].raw_recurrence_records_visible = true;
  }, setP03Completed),
  artifactNegative("P03_completed_direct_table_unchecked", "P03:P03_completed_direct_clusters_table_machine_result", (c) => {
    c.evidenceTemplate.permission_checks[2].r10_recurrence_visibility_and_attestation_evidence_contract.actual_direct_clusters_table_result.attempted = false;
  }, setP03Completed),
  artifactNegative("P03_completed_direct_table_raw_visible", "P03:P03_completed_result_classification", (c) => {
    c.evidenceTemplate.permission_checks[2].r10_recurrence_visibility_and_attestation_evidence_contract.actual_direct_clusters_table_result.raw_recurrence_records_visible = true;
  }, setP03Completed),
  artifactNegative("P03_completed_visibility_intersection_broader", "P03:P03_completed_result_classification", (c) => {
    c.evidenceTemplate.permission_checks[2].r10_recurrence_visibility_and_attestation_evidence_contract.actual_recurrence_visibility_no_broader_than_source_fields_result.no_broader_than_source_field_intersection = false;
  }, setP03Completed),
  artifactNegative("P03_completed_relogin_not_verified", "P03:P03_completed_result_classification", (c) => {
    c.evidenceTemplate.permission_checks[2].r10_recurrence_visibility_and_attestation_evidence_contract.actual_all_five_business_views_result.relogin_completed = false;
  }, setP03Completed),
  artifactNegative("P03_completed_refresh_drift", "P03:P03_completed_result_classification", (c) => {
    c.evidenceTemplate.permission_checks[2].r10_recurrence_visibility_and_attestation_evidence_contract.actual_all_five_business_views_result.refresh_boundary_stable = false;
  }, setP03Completed),
  artifactNegative("P03_completed_W6_not_rejected", "P03:P03_completed_result_classification", (c) => {
    c.evidenceTemplate.permission_checks[2].r10_recurrence_visibility_and_attestation_evidence_contract.actual_all_five_business_views_result.unauthorized_W6_action_rejected = false;
  }, setP03Completed),
  artifactNegative("P03_completed_protected_mutation_not_rejected", "P03:P03_completed_result_classification", (c) => {
    c.evidenceTemplate.permission_checks[2].r10_recurrence_visibility_and_attestation_evidence_contract.actual_all_five_business_views_result.protected_field_mutation_rejected = false;
  }, setP03Completed),
  artifactNegative("P03_completed_admin_config_visible", "P03:P03_completed_result_classification", (c) => {
    c.evidenceTemplate.permission_checks[2].r10_recurrence_visibility_and_attestation_evidence_contract.actual_all_five_business_views_result.administrator_configuration_hidden = false;
  }, setP03Completed),
  artifactNegative("P03_completed_postbuild_parent_result_mismatch", "P03:completed_postbuild_parent_result_mismatch", (c) => {
    c.evidenceTemplate.permission_checks[2].p03_phase_observations.postbuild_five_view_direct_table_recheck.result = "不可用";
  }, setP03Completed),
  artifactNegative("P03_completed_status_derivation_mismatch", "P03:derived_chinese_status", (c) => {
    c.evidenceTemplate.permission_checks[2].status = "受限";
  }, setP03Completed),
  artifactNegative("P02_completed_missing_r10_subchecks", "P02:completed_r10_subchecks_required", (c) => {
    c.permissionResults.permission_probes[1].evidence_index.r10_subchecks = null; syncPermissionEvidence(c, 1);
  }, setP02Completed),
  artifactNegative("P02_completed_empty_r10_subchecks", "P02:P02_r10_subchecks_exact_keys", (c) => {
    c.permissionResults.permission_probes[1].evidence_index.r10_subchecks = {}; syncPermissionEvidence(c, 1);
  }, setP02Completed),
  artifactNegative("P02_completed_opaque_r10_subchecks", "P02:P02_r10_subchecks_exact_keys", (c) => {
    c.permissionResults.permission_probes[1].evidence_index.r10_subchecks = { opaque_fixture: true }; syncPermissionEvidence(c, 1);
  }, setP02Completed),
  artifactNegative("P02_completed_extra_r10_subcheck", "P02:P02_r10_subchecks_exact_keys", (c) => {
    c.permissionResults.permission_probes[1].evidence_index.r10_subchecks.extra = [c.permissionResults.permission_probes[1].evidence_index.indexes[0].evidence_id]; syncPermissionEvidence(c, 1);
  }, setP02Completed),
  artifactNegative("P02_completed_unbound_r10_subcheck", "P02:P02_P02-R10-selector-cardinality_parent_binding", (c) => {
    c.permissionResults.permission_probes[1].evidence_index.r10_subchecks["P02-R10-selector-cardinality"] = ["T2-EV-P02-20260805-1200-99"]; syncPermissionEvidence(c, 1);
  }, setP02Completed),
  artifactNegative("P03_completed_r10_unbound", "P03:P03_completed_P03-R10-raw-recurrence-visibility_parent_binding", (c) => {
    c.permissionResults.permission_probes[2].evidence_index.r10_subchecks["P03-R10-raw-recurrence-visibility"] = ["T2-EV-P03-20260805-1200-99"]; syncPermissionEvidence(c, 2);
  }, setP03Completed),
  artifactNegative("P03_completed_direct_denied_refresh_nonnull", "P03:P03_completed_direct_clusters_table_machine_result", (c) => {
    c.evidenceTemplate.permission_checks[2].r10_recurrence_visibility_and_attestation_evidence_contract.actual_direct_clusters_table_result.refreshed = true;
  }, setP03Completed),
  artifactNegative("P03_completed_direct_allowed_refresh_missing", "P03:P03_completed_direct_clusters_table_machine_result", (c) => {
    const direct = c.evidenceTemplate.permission_checks[2].r10_recurrence_visibility_and_attestation_evidence_contract.actual_direct_clusters_table_result;
    direct.access_allowed = true;
  }, setP03Completed),
  artifactNegative("P03_completed_attestation_digest_invalid", "P03:P03_completed_attestation_id_digest", (c) => {
    c.evidenceTemplate.permission_checks[2].r10_recurrence_visibility_and_attestation_evidence_contract.attestation_id_digest = "not-a-digest";
  }, setP03Completed),
  artifactNegative("P03_completed_attestation_time_equal_expiry", "P03:P03_completed_attestation_time_order", (c) => {
    const proof = c.evidenceTemplate.permission_checks[2].r10_recurrence_visibility_and_attestation_evidence_contract;
    proof.expires_at = proof.capability_rechecked_at;
  }, setP03Completed),
  artifactNegative("P03_completed_prewrite_recheck_false", "P03:P03_completed_result_classification", (c) => {
    c.evidenceTemplate.permission_checks[2].r10_recurrence_visibility_and_attestation_evidence_contract.actual_prewrite_recheck_result.permission_revision_matches = false;
  }, setP03Completed),
  artifactNegative("P03_completed_drift_injection_false", "P03:P03_completed_result_classification", (c) => {
    c.evidenceTemplate.permission_checks[2].r10_recurrence_visibility_and_attestation_evidence_contract.actual_drift_or_expiry_injection_result.zero_writes = false;
  }, setP03Completed),
  artifactNegative("P03_completed_requires_P02_completed", "P03:P03_completed_requires_P02_completed", (c) => {
    const p02 = c.permissionResults.permission_probes[1]; p02.execution_status = "blocked"; p02.result = null; p02.limitations = "synthetic_limit"; c.evidenceTemplate.permission_checks[1].status = "已阻塞";
  }, setP03Completed),
  artifactNegative("P03_completed_P02_snapshot_missing", "P03:P03_completed_P02_permission_snapshot_missing", (c) => {
    c.evidenceTemplate.permission_checks[1].r10_selector_and_execution_mode_evidence_contract.permission_snapshot_sha256 = null;
  }, setP03Completed),
  artifactNegative("P03_completed_P02_snapshot_mismatch", "P03:P03_completed_P02_permission_snapshot_mismatch", (c) => {
    c.evidenceTemplate.permission_checks[1].r10_selector_and_execution_mode_evidence_contract.permission_snapshot_sha256 = "4".repeat(64);
  }, setP03Completed),
  artifactNegative("P03_completed_P02_revision_missing", "P03:P03_completed_P02_permission_revision_missing", (c) => {
    c.evidenceTemplate.permission_checks[1].r10_selector_and_execution_mode_evidence_contract.permission_revision = null;
  }, setP03Completed),
  artifactNegative("P03_completed_P02_revision_mismatch", "P03:P03_completed_P02_permission_revision_mismatch", (c) => {
    c.evidenceTemplate.permission_checks[1].r10_selector_and_execution_mode_evidence_contract.permission_revision = "other-revision";
  }, setP03Completed),
  ...p03PrebuildProofFixtures,
  ...p03ContractClosureFixtures,
  artifactNegative("P03_prebuild_unavailable_started_postbuild", "P03:phase_order_prebuild_unavailable_forbids_postbuild", (c) => {
    c.evidenceTemplate.permission_checks[2].p03_phase_observations.prebuild_gate.result = "不可用";
  }, setP03Completed),
  artifactNegative("P03_prebuild_restricted_without_safe_fallback", "P03:phase_order_prebuild_restricted_requires_safe_fallback", (c) => {
    c.evidenceTemplate.permission_checks[2].p03_phase_observations.prebuild_gate.result = "受限";
    c.permissionResults.permission_probes[2].limitations = "synthetic_limit";
    c.permissionResults.permission_probes[2].fallback_verified = false;
  }, setP03Completed),
  artifactNegative("P03_prebuild_restricted_without_limitations", "P03:phase_order_prebuild_restricted_requires_safe_fallback", (c) => {
    c.evidenceTemplate.permission_checks[2].p03_phase_observations.prebuild_gate.result = "受限";
    c.permissionResults.permission_probes[2].limitations = null;
    c.permissionResults.permission_probes[2].fallback_verified = true;
  }, setP03Completed),
  artifactNegative("P03_result_available_with_partial_views", "P03:P03_completed_result_classification", (c) => {
    const row = c.evidenceTemplate.permission_checks[2].r10_recurrence_visibility_and_attestation_evidence_contract.actual_all_five_business_views_result.views[4];
    row.opened = false; row.refreshed = false; row.allowed_action_verified = false;
  }, setP03Completed),
  artifactNegative("P03_result_restricted_with_zero_views", "P03:P03_completed_result_classification", (c) => {
    const x = setP03CompletedClassification(c, "受限", 0); return x;
  }),
  artifactNegative("P03_result_unavailable_with_all_safe_views", "P03:P03_completed_result_classification", (c) => {
    const parent = c.permissionResults.permission_probes[2]; parent.result = "不可用"; parent.limitations = "synthetic_limit";
    c.evidenceTemplate.permission_checks[2].status = "不可用";
    c.evidenceTemplate.permission_checks[2].p03_phase_observations.postbuild_five_view_direct_table_recheck.result = "不可用";
  }, setP03Completed),
  artifactNegative("P03_result_restricted_with_direct_leak", "P03:P03_completed_result_classification", (c) => {
    setP03CompletedClassification(c, "受限", 4);
    c.evidenceTemplate.permission_checks[2].r10_recurrence_visibility_and_attestation_evidence_contract
      .actual_direct_clusters_table_result.administrator_fields_visible = true;
  }),
  artifactNegative("P03_result_unavailable_with_prewrite_limit", "P03:P03_completed_result_classification", (c) => {
    setP03CompletedClassification(c, "不可用", 5);
    c.evidenceTemplate.permission_checks[2].r10_recurrence_visibility_and_attestation_evidence_contract
      .actual_prewrite_recheck_result.permission_revision_matches = false;
  }),
];
for (const fixture of permissionResultNegativeFixtures) {
  const requiresExactIssues = expectedP03ClosureFixtureIds.includes(fixture.id) || expectedP03PrebuildFixtureIds.includes(fixture.id);
  assertInGroup(permissionResultGroup, `permission_result_rejects_${fixture.id}`, fixture.baselineIssues.length === 0
    && (requiresExactIssues ? canonicalDeepEqual(fixture.mutationIssues, fixture.expectedIssues) : fixture.mutationIssues.length > 0)
    && fixture.targetIssueHit === true
    && fixture.accepted === false, fixture);
}
const permissionNegativeFixtureNameDigest = sha256(JSON.stringify(permissionResultNegativeFixtures.map((fixture) => fixture.id).sort()));
assertInGroup(permissionResultGroup, "permission_negative_fixture_set_is_literal_220_of_220_with_no_leak", permissionResultNegativeFixtures.length === 220
  && new Set(permissionResultNegativeFixtures.map((fixture) => fixture.id)).size === 220
  && p03ContractClosureFixtures.length === 65
  && canonicalDeepEqual(p03ContractClosureFixtures.map((fixture) => fixture.id), expectedP03ClosureFixtureIds)
  && p03ContractClosureFixtures.every((fixture) => fixture.baselineIssues.length === 0
    && canonicalDeepEqual(fixture.mutationIssues, fixture.expectedIssues))
  && canonicalDeepEqual(p03PrebuildProofFixtures.map((fixture) => fixture.id), expectedP03PrebuildFixtureIds)
  && p03PrebuildProofFixtures.every((fixture) => fixture.baselineIssues.length === 0
    && canonicalDeepEqual(fixture.mutationIssues, fixture.expectedIssues))
  && permissionResultNegativeFixtures.every((fixture) => fixture.baselineIssues.length === 0
    && fixture.mutationIssues.length > 0
    && fixture.targetIssueHit === true
    && fixture.accepted === false)
  && permissionNegativeFixtureNameDigest === EXPECTED_PERMISSION_NEGATIVE_FIXTURE_NAME_DIGEST, {
  count: permissionResultNegativeFixtures.length,
  rejected: permissionResultNegativeFixtures.filter((fixture) => fixture.accepted === false).length,
  leaked: permissionResultNegativeFixtures.filter((fixture) => fixture.accepted !== false).map((fixture) => fixture.id),
  name_digest: permissionNegativeFixtureNameDigest,
});
const permissionContractSources = [
  { id: "probe_suite", path: path.relative(repositoryRoot, paths.probeSuite).split(path.sep).join("/"), sha256: sha256(probeSuiteText) },
  { id: "permission_results", path: path.relative(repositoryRoot, paths.permissionResults).split(path.sep).join("/"), sha256: sha256(permissionResultsText) },
  { id: "evidence_template", path: path.relative(repositoryRoot, paths.evidenceTemplate).split(path.sep).join("/"), sha256: sha256(evidenceTemplateText) },
  { id: "permission_acceptance", path: path.relative(repositoryRoot, paths.permissionAcceptance).split(path.sep).join("/"), sha256: sha256(permissionAcceptanceText) },
  { id: "permission_matrix", path: path.relative(repositoryRoot, paths.t2PermissionMatrix).split(path.sep).join("/"), sha256: sha256(permissionMatrix) },
];
const permissionContractSourceDigest = canonicalTupleSetDigest(permissionContractSources);
assertInGroup(permissionResultGroup, "permission_content_sources_match_independent_literal_freeze", canonicalDeepEqual(permissionContractSources, EXPECTED_PERMISSION_CONTENT_SOURCES)
  && permissionContractSourceDigest === EXPECTED_PERMISSION_CONTENT_SOURCE_DIGEST, { actual: permissionContractSources, expected: EXPECTED_PERMISSION_CONTENT_SOURCES, digest: permissionContractSourceDigest });

const t3 = {
  schemaVersion: extractConstString(t3Contract, "CANONICAL_SCHEMA_VERSION"),
  dataScopes: extractConstStringArray(t3Contract, "DATA_SCOPES"),
  tableKeys: extractConstStringArray(t3Contract, "CANONICAL_TABLE_KEYS"),
  rawFeedbackStatuses: extractConstStringArray(t3Contract, "RAW_FEEDBACK_STATUSES"),
  caseStatuses: extractConstStringArray(t3Contract, "CASE_STATUSES"),
  workOrderStatuses: extractConstStringArray(t3Contract, "WORK_ORDER_STATUSES"),
  clusterStatuses: extractConstStringArray(t3Contract, "CLUSTER_STATUSES"),
  improvementStatuses: extractConstStringArray(t3Contract, "IMPROVEMENT_STATUSES"),
  aiNodeStatuses: extractConstStringArray(t3Contract, "AI_NODE_STATUSES"),
  aiNodeIds: extractConstStringArray(t3Contract, "AI_NODE_IDS"),
  aiEnvelopeFields: extractConstStringArray(t3Contract, "AI_NODE_ENVELOPE_REQUIRED_FIELDS"),
  humanRevisionStates: extractConstStringArray(t3Contract, "HUMAN_REVISION_STATES"),
  workflowIds: extractConstStringArray(t3Contract, "WORKFLOW_IDS"),
};

const t1TableKeys = t1.tables.map((table) => table.name);
const t2TableKeys = t2.tables.map((table) => table.key);

assert("ten_canonical_table_keys_t1_t2", equalArrays(t1TableKeys, t2TableKeys), {
  t1: t1TableKeys,
  t2: t2TableKeys,
});
assert("ten_canonical_table_keys_t2_t3", equalArrays(t2TableKeys, t3.tableKeys), {
  t2: t2TableKeys,
  t3: t3.tableKeys,
});
assert("canonical_table_key_is_not_an_alias", t2.tables.every((table) => table.canonical_table_key === table.key), {
  mappings: t2.tables.map((table) => [table.key, table.canonical_table_key]),
});
assert("manifest_counts", t2.counts.tables === 10 && t2.counts.frontend_views === 5 && t2.counts.logical_business_roles === 3 && t2.counts.ai_nodes === 7 && t2.counts.workflows === 6, t2.counts);

assert("schema_version_t1_t2", t2.default_schema_version === t1.schema_version, {
  t1: t1.schema_version,
  t2: t2.default_schema_version,
});
if (t1.schema_version !== t3.schemaVersion) {
  upstreamConflicts.push({
    name: "schema_version_t1_t3",
    details: { t1: t1.schema_version, t3: t3.schemaVersion },
    owner: "T0/T3",
  });
} else {
  pass("schema_version_t1_t3");
}

const t2DataScope = t2.common_fields.find((field) => field.key === "data_scope")?.allowed ?? [];
assert("synthetic_data_scope_t1_t2", equalArrays([t1.data_scope], t2DataScope), {
  t1: [t1.data_scope],
  t2: t2DataScope,
});
assert("synthetic_data_scope_t2_t3", equalArrays(t2DataScope, t3.dataScopes), {
  t2: t2DataScope,
  t3: t3.dataScopes,
});

for (const canonicalTable of t1.tables) {
  const logicalTable = t2.tables.find((table) => table.key === canonicalTable.name);
  if (!logicalTable) {
    fail(`table_${canonicalTable.name}_exists`, "missing logical table");
    continue;
  }

  assert(`table_${canonicalTable.name}_primary_key`, logicalTable.primary_business_key === canonicalTable.primary_key, {
    t1: canonicalTable.primary_key,
    t2: logicalTable.primary_business_key,
  });

  const canonicalTablePath = path.join(paths.t1Tables, canonicalTable.file);
  const canonicalTableText = await readFile(canonicalTablePath, "utf8");
  canonicalTableSources.push({ id: `canonical_table:${canonicalTable.name}`, ...sourceDescriptor(canonicalTablePath, canonicalTableText) });
  const rows = JSON.parse(canonicalTableText);
  assert(`table_${canonicalTable.name}_row_count`, Array.isArray(rows) && rows.length === canonicalTable.row_count, {
    expected: canonicalTable.row_count,
    actual: Array.isArray(rows) ? rows.length : "not_array",
  });

  const observedKeys = Array.isArray(rows) ? uniqueRecordKeys(rows) : [];
  const declaredKeys = effectiveFieldKeys(t2, logicalTable);
  tableFieldChecks[canonicalTable.name] = {
    sample_rows: Array.isArray(rows) ? rows.length : null,
    observed_keys: observedKeys,
    declared_keys: declaredKeys,
    rule: rows.length === 0 ? "t3_ai_envelope_plus_common_fields" : "exact_sample_key_set",
  };

  if (rows.length > 0) {
    assert(`table_${canonicalTable.name}_field_keys`, equalArrays(observedKeys, declaredKeys), {
      missing: observedKeys.filter((key) => !declaredKeys.includes(key)),
      extra: declaredKeys.filter((key) => !observedKeys.includes(key)),
    });
    const inconsistentRow = rows.find((record) => !equalArrays(sorted(Object.keys(record)), observedKeys));
    assert(`table_${canonicalTable.name}_sample_rows_share_one_key_set`, inconsistentRow === undefined, inconsistentRow);
    assert(`table_${canonicalTable.name}_sample_schema_version`, rows.every((record) => record.schema_version === t1.schema_version), {
      expected: t1.schema_version,
    });
  } else {
    assert("table_ai_audit_seed_is_intentionally_empty", canonicalTable.name === "ai_audit" && logicalTable.canonical_sample_state === "empty_seed_no_observed_record_keys", {
      table: canonicalTable.name,
      canonical_sample_state: logicalTable.canonical_sample_state,
    });
    assert("table_ai_audit_uses_t3_envelope_fields", equalSets(logicalTable.fields.map((field) => field.key), t3.aiEnvelopeFields), {
      declared: logicalTable.fields.map((field) => field.key),
      t3: t3.aiEnvelopeFields,
    });
  }
}

const statusGroups = [
  { key: "raw_feedback", t3: t3.rawFeedbackStatuses, field: "processing_status" },
  { key: "cases", t3: t3.caseStatuses, field: "status" },
  { key: "work_orders", t3: t3.workOrderStatuses, field: "status" },
  { key: "clusters", t3: t3.clusterStatuses, field: "status" },
  { key: "improvements", t3: t3.improvementStatuses, field: "status" },
];

for (const group of statusGroups) {
  const t1Statuses = t1.status_enums[group.key];
  const t2Statuses = t2.tables.find((table) => table.key === group.key)?.fields.find((field) => field.key === group.field)?.allowed;
  assert(`statuses_${group.key}_t1_t2`, Array.isArray(t2Statuses) && equalArrays(t1Statuses, t2Statuses), { t1: t1Statuses, t2: t2Statuses });
  assert(`statuses_${group.key}_t2_t3`, Array.isArray(t2Statuses) && equalArrays(t2Statuses, group.t3), { t2: t2Statuses, t3: group.t3 });
}

assert("ai_envelope_required_fields", equalArrays(t2.ai_envelope.required, t3.aiEnvelopeFields), {
  t2: t2.ai_envelope.required,
  t3: t3.aiEnvelopeFields,
});
assert("ai_envelope_statuses", equalArrays(t2.ai_envelope.status_allowed, t3.aiNodeStatuses), {
  t2: t2.ai_envelope.status_allowed,
  t3: t3.aiNodeStatuses,
});
assert("ai_envelope_object_ref_shape", equalArrays(t2.ai_envelope.object_ref?.required ?? [], ["object_type", "object_id"]), t2.ai_envelope.object_ref);
assert("ai_envelope_validation_shape", equalArrays(t2.ai_envelope.validation?.required ?? [], ["valid", "errors"]), t2.ai_envelope.validation);
assert("ai_envelope_human_revision_shape", equalArrays(t2.ai_envelope.human_revision?.required ?? [], ["state"]) && equalArrays(t2.ai_envelope.human_revision?.optional ?? [], ["revised_payload", "note"]) && equalArrays(t2.ai_envelope.human_revision?.state_allowed ?? [], t3.humanRevisionStates), t2.ai_envelope.human_revision);
assert("ai_envelope_retry_limit", t2.ai_envelope.schema_repair_retry_limit === 1, t2.ai_envelope.schema_repair_retry_limit);

assert("seven_ai_nodes", equalArrays(t2.ai_nodes.map((node) => node.key), t3.aiNodeIds), {
  t2: t2.ai_nodes.map((node) => node.key),
  t3: t3.aiNodeIds,
});
const n6Node = t2.ai_nodes.find((node) => node.key === "N6");
const n6ResponsibilityContract = n6Node?.mode_contracts?.responsibility_routing;
const n6RootCauseContract = n6Node?.mode_contracts?.root_cause_hypothesis;
assert(
  "n6_modes_have_separate_contracts",
  equalArrays(Object.keys(n6Node?.mode_contracts ?? {}), ["responsibility_routing", "root_cause_hypothesis"]),
  n6Node?.mode_contracts,
);
assert(
  "n6_responsibility_contract_stays_draft_2",
  n6ResponsibilityContract?.version === "N6-responsibility-routing-1.0.0-draft.2"
    && equalArrays(n6ResponsibilityContract?.inputs ?? [], ["evidence", "responsibility_matrix", "issue_cluster", "resolution_records"])
    && equalArrays(n6ResponsibilityContract?.outputs ?? [], ["candidates", "human_confirmation_required"]),
  n6ResponsibilityContract,
);
assert(
  "n6_root_cause_contract_is_draft_3",
  n6RootCauseContract?.version === "N6-root-cause-1.0.0-draft.3"
    && equalArrays(n6RootCauseContract?.outputs ?? [], ["hypotheses", "human_review_required", "final_root_cause"]),
  n6RootCauseContract,
);
assert(
  "n6_root_cause_requires_controlled_hypothesis_catalog",
  equalArrays(n6RootCauseContract?.inputs ?? [], ["evidence", "issue_cluster", "resolution_records", "hypothesis_catalog"])
    && n6RootCauseContract?.hypothesis_catalog?.required === true
    && equalArrays(n6RootCauseContract?.hypothesis_catalog?.item_fields ?? [], ["hypothesis_id", "factor_label", "phenomenon_label", "uncertainty_options"])
    && equalArrays(n6RootCauseContract?.hypothesis_catalog?.uncertainty_option_fields ?? [], ["uncertainty_id", "label"]),
  n6RootCauseContract?.hypothesis_catalog,
);
assert(
  "n6_root_cause_catalog_ids_and_rendering_are_locked",
  equalArrays(n6RootCauseContract?.hypothesis_catalog?.rules ?? [], [
    "hypothesis_id_must_be_unique_and_payload_referenced",
    "uncertainty_id_must_be_globally_unique_and_payload_referenced",
    "statement_must_equal_deterministic_catalog_rendering",
    "labels_must_not_contain_causal_assertions_or_workflow_instructions",
  ]),
  n6RootCauseContract?.hypothesis_catalog?.rules,
);
assert(
  "n6_legacy_overview_is_mode_union",
  equalArrays(n6Node?.inputs ?? [], ["evidence", "responsibility_matrix", "issue_cluster", "resolution_records", "hypothesis_catalog"])
    && equalArrays(n6Node?.outputs ?? [], ["candidates", "human_confirmation_required", "hypotheses", "human_review_required", "final_root_cause"]),
  { inputs: n6Node?.inputs, outputs: n6Node?.outputs },
);
assert("six_workflows", equalArrays(t2.workflows.map((workflow) => workflow.key), t3.workflowIds), {
  t2: t2.workflows.map((workflow) => workflow.key),
  t3: t3.workflowIds,
});

const activeRecurrenceActionKey = "intake_active_observation_recurrence";
const w6Workflow = t2.workflows.find((workflow) => workflow.key === "W6");
const activeRecurrenceActionLocations = t2.workflows.flatMap((workflow) =>
  (workflow.internal_authorized_actions ?? [])
    .filter((action) => action.action === activeRecurrenceActionKey)
    .map((action) => ({ workflow: workflow.key, action })),
);
const activeRecurrenceAction = activeRecurrenceActionLocations[0]?.action;
const activeRecurrenceSequence = activeRecurrenceAction?.sequence ?? [];
const expectedActiveRecurrenceSteps = [
  "run_N5_existing_cluster_candidate",
  "repository_issue_action_scoped_N5_receipt",
  "authorized_human_recurrence_intake",
  "commit_intake_under_full_case_cluster_improvement_lock",
];
const expectedAllowedFieldWrites = [
  "logical://tables/clusters/fields/member_case_ids",
];
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

const w6Freeze = t2.contract_sources.w6_internal_action_freeze;
const d1Freeze = t2.contract_sources.batch_d1_observation_checkpoints_freeze;
const r10Freeze = t2.contract_sources.r10_feishu_reopen_projector_freeze;
const r6RecordResolution = resolveRepoReference(paths.t2Manifest, EXPECTED_R6_FREEZE.record);
const r7RecordResolution = resolveRepoReference(paths.t2Manifest, EXPECTED_R7_FREEZE.record);
const r6RecordDeclarationAnalysis = analyzeMarkdownFreezeDeclarations({
  source: t3R6Record,
  heading: "## 文件与哈希",
  expected: EXPECTED_R6_RECORD_DECLARATIONS,
  mode: "basename",
});
const r7RecordDeclarationAnalysis = analyzeMarkdownFreezeDeclarations({
  source: t3R7Record,
  heading: "## 冻结文件与 SHA-256",
  expected: EXPECTED_R7_RECORD_DECLARATIONS,
  expectedSuffixes: EXPECTED_R7_RECORD_SUFFIXES,
});
const r10RecordDeclarationAnalysis = analyzeMarkdownFreezeDeclarations({
  source: r10Record,
  heading: "## 7. 最终 core/test SHA-256",
  expected: EXPECTED_R10_RECORD_DECLARATIONS,
});
const r10R9BaselineDeclarationAnalysis = analyzeMarkdownFreezeDeclarations({
  source: r10Record,
  heading: "## 8. R9 六文件哈希守卫",
  expected: EXPECTED_R9_FREEZE,
});

assertInGroup("historical_self_consistency", "R6_logical_freeze_has_exact_historical_shape", exactFlatObject(w6Freeze, EXPECTED_R6_FREEZE), w6Freeze);
assertInGroup("historical_self_consistency", "R6_historical_record_path_is_exact_unique_and_repo_bounded", r6RecordResolution.bounded
  && r6RecordResolution.resolved === paths.t3R6Record
  && EXPECTED_R6_FREEZE.record !== EXPECTED_R7_FREEZE.record, r6RecordResolution);
assertInGroup("historical_self_consistency", "R6_historical_record_byte_sha_matches_its_freeze", sha256(t3R6Record) === EXPECTED_R6_FREEZE.record_sha256, {
  expected: EXPECTED_R6_FREEZE.record_sha256,
  actual: sha256(t3R6Record),
});
assertInGroup("historical_self_consistency", "R6_record_freeze_declarations_are_canonical_exact_and_unique", r6RecordDeclarationAnalysis.ok, r6RecordDeclarationAnalysis);

assertInGroup("historical_self_consistency", "R7_logical_freeze_has_exact_historical_shape", exactFlatObject(d1Freeze, EXPECTED_R7_FREEZE), d1Freeze);
assertInGroup("historical_self_consistency", "R7_historical_record_path_is_exact_unique_and_repo_bounded", r7RecordResolution.bounded
  && r7RecordResolution.resolved === paths.t3R7Record
  && EXPECTED_R7_FREEZE.record !== EXPECTED_R6_FREEZE.record, r7RecordResolution);
assertInGroup("historical_self_consistency", "R7_historical_record_byte_sha_matches_its_freeze", sha256(t3R7Record) === EXPECTED_R7_FREEZE.record_sha256, {
  expected: EXPECTED_R7_FREEZE.record_sha256,
  actual: sha256(t3R7Record),
});
assertInGroup("historical_self_consistency", "R7_record_freeze_declarations_are_canonical_exact_and_unique", r7RecordDeclarationAnalysis.ok, r7RecordDeclarationAnalysis);

const actualR9Freeze = {
  "src/neoloop/workflows/w6-improvement.ts": sha256(t3W6Improvement),
  "src/neoloop/workflows/repository.ts": sha256(t3Repository),
  "tests/core/w6-improvement.test.mjs": sha256(t3W6ImprovementTest),
  "src/neoloop/workflows/model.ts": sha256(t3W6Model),
  "src/neoloop/workflows/index.ts": sha256(t3Index),
  "tests/core/w6-repository.test.mjs": sha256(t3W6RepositoryTest),
};
assertInGroup("current_freeze_chain", "R9_six_files_match_implementation_plan_freeze", exactFlatObject(actualR9Freeze, EXPECTED_R9_FREEZE), actualR9Freeze);
assertInGroup("current_freeze_chain", "R9_record_byte_sha_matches_frozen_record", sha256(t3R9Record) === EXPECTED_R9_RECORD_SHA256, {
  expected: EXPECTED_R9_RECORD_SHA256,
  actual: sha256(t3R9Record),
});

const actualR10Freeze = {
  core: EXPECTED_R10_FREEZE.core,
  core_sha256: sha256(r10Core),
  test: EXPECTED_R10_FREEZE.test,
  test_sha256: sha256(r10Test),
  record: EXPECTED_R10_FREEZE.record,
  record_sha256: sha256(r10Record),
};
assertInGroup("current_freeze_chain", "R10_core_test_record_bytes_match_frozen_SHA", exactFlatObject(actualR10Freeze, EXPECTED_R10_FREEZE), actualR10Freeze);
assertInGroup("current_freeze_chain", "R10_record_core_test_declarations_are_canonical_exact_and_unique", r10RecordDeclarationAnalysis.ok, r10RecordDeclarationAnalysis);
assertInGroup("current_freeze_chain", "R10_record_R9_baseline_declarations_are_canonical_exact_and_unique", r10R9BaselineDeclarationAnalysis.ok, r10R9BaselineDeclarationAnalysis);
assertInGroup("current_freeze_chain", "logical_R10_freeze_exactly_pins_core_test_record", exactFlatObject(r10Freeze, EXPECTED_R10_FREEZE), r10Freeze);

const markdownParserFixtureSha = EXPECTED_R10_FREEZE.core_sha256;
const markdownParserFixtureExpected = Object.freeze({ "src/example.ts": markdownParserFixtureSha });
const canonicalMarkdownParserFixture = `## Freeze\n\n- \`src/example.ts\`：\`${markdownParserFixtureSha}\`\n`;
const markdownParserNegativeFixtures = [
  { id: "ascii_colon", source: canonicalMarkdownParserFixture.replace("`：`", "`:`") },
  { id: "abnormal_whitespace_separator", source: canonicalMarkdownParserFixture.replace("`：`", "` ： `") },
  { id: "tab_bullet", source: canonicalMarkdownParserFixture.replace("- `", "-\t`") },
  { id: "double_space_bullet", source: canonicalMarkdownParserFixture.replace("- `", "-  `") },
  { id: "raw_unquoted_path_and_sha", source: canonicalMarkdownParserFixture.replace("`src/example.ts`：`", "src/example.ts: ").replace("`\n", "\n") },
  { id: "missing_separator", source: canonicalMarkdownParserFixture.replace("`：`", "` `") },
  { id: "raw_sha_without_second_code_span", source: canonicalMarkdownParserFixture.replace(`\`${markdownParserFixtureSha}\``, markdownParserFixtureSha) },
  { id: "uppercase_sha", source: canonicalMarkdownParserFixture.replace(markdownParserFixtureSha, markdownParserFixtureSha.toUpperCase()) },
  { id: "placeholder_sha", source: canonicalMarkdownParserFixture.replace(markdownParserFixtureSha, "0".repeat(64)) },
  { id: "deadbeef_placeholder_sha", source: canonicalMarkdownParserFixture.replace(markdownParserFixtureSha, "deadbeef".repeat(8)) },
  { id: "cafebabe_placeholder_sha", source: canonicalMarkdownParserFixture.replace(markdownParserFixtureSha, "cafebabe".repeat(8)) },
  { id: "malformed_sha_length", source: canonicalMarkdownParserFixture.replace(markdownParserFixtureSha, markdownParserFixtureSha.slice(0, 63)) },
  { id: "duplicate_declaration", source: `${canonicalMarkdownParserFixture}- \`src/example.ts\`：\`${markdownParserFixtureSha}\`\n` },
  { id: "dot_alias", source: canonicalMarkdownParserFixture.replace("src/example.ts", "./src/example.ts") },
  { id: "dotdot_alias", source: canonicalMarkdownParserFixture.replace("src/example.ts", "src/tmp/../example.ts") },
  { id: "out_of_bounds_path", source: canonicalMarkdownParserFixture.replace("src/example.ts", "../../outside.ts") },
  { id: "global_alias_duplicate", source: `${canonicalMarkdownParserFixture}\n## Other\n\n- \`./src/example.ts\`：\`${markdownParserFixtureSha}\`\n` },
  { id: "global_out_of_bounds_basename_duplicate", source: `${canonicalMarkdownParserFixture}\n## Other\n\n- \`../../outside/example.ts\`：\`${markdownParserFixtureSha}\`\n` },
  { id: "unexpected_historical_suffix", source: canonicalMarkdownParserFixture.trimEnd() + "（本轮未改）\n" },
  { id: "duplicate_heading", source: `${canonicalMarkdownParserFixture}\n## Freeze\n` },
];
assertInGroup("markdown_parser_fail_closed", "markdown_parser_accepts_one_canonical_declaration", analyzeMarkdownFreezeDeclarations({
  source: canonicalMarkdownParserFixture,
  heading: "## Freeze",
  expected: markdownParserFixtureExpected,
}).ok, canonicalMarkdownParserFixture);
for (const fixture of markdownParserNegativeFixtures) {
  const analysis = analyzeMarkdownFreezeDeclarations({
    source: fixture.source,
    heading: "## Freeze",
    expected: markdownParserFixtureExpected,
  });
  assertInGroup("markdown_parser_fail_closed", `markdown_parser_rejects_${fixture.id}`, !analysis.ok, analysis);
}
const r6BasenameParserFixtureExpected = Object.freeze({ "repository.ts": markdownParserFixtureSha });
const canonicalR6BasenameParserFixture = `## Freeze\n\n- \`repository.ts\`：\`${markdownParserFixtureSha}\`\n`;
assertInGroup("markdown_parser_fail_closed", "markdown_parser_accepts_R6_historical_basename_special_case", analyzeMarkdownFreezeDeclarations({
  source: canonicalR6BasenameParserFixture,
  heading: "## Freeze",
  expected: r6BasenameParserFixtureExpected,
  mode: "basename",
}).ok, canonicalR6BasenameParserFixture);
for (const [fixtureId, declaredPath] of [
  ["R6_dot_alias", "./repository.ts"],
  ["R6_dotdot_alias", "../repository.ts"],
  ["R6_full_repo_path", "src/neoloop/workflows/repository.ts"],
]) {
  const source = canonicalR6BasenameParserFixture.replace("repository.ts", declaredPath);
  const analysis = analyzeMarkdownFreezeDeclarations({
    source,
    heading: "## Freeze",
    expected: r6BasenameParserFixtureExpected,
    mode: "basename",
  });
  assertInGroup("markdown_parser_fail_closed", `markdown_parser_rejects_${fixtureId}`, !analysis.ok, analysis);
}
const r6GlobalAliasDuplicateAnalysis = analyzeMarkdownFreezeDeclarations({
  source: `${canonicalR6BasenameParserFixture}\n## Other\n\n- \`./repository.ts\`：\`${markdownParserFixtureSha}\`\n`,
  heading: "## Freeze",
  expected: r6BasenameParserFixtureExpected,
  mode: "basename",
});
assertInGroup("markdown_parser_fail_closed", "markdown_parser_rejects_R6_global_alias_duplicate", !r6GlobalAliasDuplicateAnalysis.ok, r6GlobalAliasDuplicateAnalysis);

const reopenProjectionContractLocations = t2.workflows
  .filter((workflow) => Object.hasOwn(workflow, "reopen_projection_contract"))
  .map((workflow) => ({ workflow: workflow.key, contract: workflow.reopen_projection_contract }));
assertInGroup("current_freeze_chain", "R10_reopen_projection_contract_is_declared_once_and_only_on_W6", reopenProjectionContractLocations.length === 1
  && reopenProjectionContractLocations[0].workflow === "W6"
  && t2.workflows.length === 6, reopenProjectionContractLocations);
const reopenProjectionContract = w6Workflow?.reopen_projection_contract;
const recurrenceVisibilityContract = t2.tables
  .find((table) => table.key === "clusters")
  ?.fields.find((field) => field.key === "recurrence_records")
  ?.visibility_contract;
assertInGroup("current_freeze_chain", "R10_projector_identity_and_R9_authority_are_exact", reopenProjectionContract?.contract_id === "W6_R10_feishu_reopen_projection_v1"
  && reopenProjectionContract?.projector_key === "neoloop.feishu.w6-reopen.v1"
  && reopenProjectionContract?.classification === "W6_projection_side_effect_not_a_seventh_workflow"
  && reopenProjectionContract?.workflow_id === "W6"
  && reopenProjectionContract?.source_action === "reopen_recurrence"
  && reopenProjectionContract?.workflow_count_effect === "unchanged_6"
  && reopenProjectionContract?.base_table_count_effect === "unchanged_10"
  && reopenProjectionContract?.R9_state_machine_effect === "unchanged_R9_remains_authoritative", reopenProjectionContract);
assertInGroup("current_freeze_chain", "R10_exact_write_allowlist_is_ordered_nine_fields", equalArrays(reopenProjectionContract?.exact_write_allowlist ?? [], [
  "clusters.member_case_ids",
  "clusters.status",
  "clusters.recurrence_records",
  "clusters.updated_at",
  "improvements.status",
  "improvements.day_7_result",
  "improvements.day_30_result",
  "improvements.human_conclusion",
  "improvements.updated_at",
]), reopenProjectionContract?.exact_write_allowlist);
assertInGroup("current_freeze_chain", "R10_write_target_counts_are_exact_4_5_9", exactFlatObject(reopenProjectionContract?.write_target_counts, {
  clusters: 4,
  improvements: 5,
  total: 9,
}), reopenProjectionContract?.write_target_counts);
assertInGroup("current_freeze_chain", "R10_error_closed_set_is_exact_and_ordered", equalArrays(reopenProjectionContract?.error_closed_set ?? [], [
  "invalid_projection_input",
  "unverified_commit",
  "commit_proof_mismatch",
  "event_conflict",
  "projection_conflict",
  "sensitive_output_rejected",
  "platform_capability_insufficient",
  "projection_dependency_failure",
]), reopenProjectionContract?.error_closed_set);
const capabilityAttestationContract = reopenProjectionContract?.capability_attestation_contract;
const expectedCapabilityFailureClosed = [
  "no_projection_without_verified_committed_source",
  "no_write_on_exact_or_near",
  "no_second_snapshot_on_replay",
  "no_write_outside_exact_nine_field_allowlist",
  "no_raw_recurrence_visibility_beyond_improvement_insight",
  "no_execution_when_capability_is_not_tested_or_insufficient",
  "no_public_private_material_leak",
  "no_real_platform_capability_claim",
];
assertInGroup("current_freeze_chain", "R10_capability_attestation_three_states_have_exact_shape", hasExactKeys(capabilityAttestationContract, [
  "attestation_contract",
  "verification_status_allowed",
  "execution_mode_allowed",
  "states_are_mutually_exclusive",
  "not_tested_requires",
  "synthetic_fixture_requires",
  "onsite_verified_requires",
  "current_onsite_state",
])
  && capabilityAttestationContract?.attestation_contract === "w6_reopen_projection_capability.v1"
  && equalArrays(capabilityAttestationContract?.verification_status_allowed ?? [], ["synthetic_fixture", "not_tested", "onsite_verified"])
  && equalArrays(capabilityAttestationContract?.execution_mode_allowed ?? [], ["atomic_all_targets", "sealed_outbox_cas", "insufficient"])
  && capabilityAttestationContract?.states_are_mutually_exclusive === true, capabilityAttestationContract);
assertInGroup("current_freeze_chain", "R10_not_tested_capability_is_exactly_insufficient_private_and_non_executable", exactFlatObject(capabilityAttestationContract?.not_tested_requires, {
  execution_mode: "insufficient",
  recurrence_visibility_no_broader_than_source_fields: false,
  permission_snapshot_sha256: null,
  permission_revision: null,
  issued_at: null,
  expires_at: null,
  evidence_unit_ref: null,
  verified_by_role: null,
})
  && (reopenProjectionContract?.failure_closed ?? []).includes("no_execution_when_capability_is_not_tested_or_insufficient")
  && (reopenProjectionContract?.failure_closed ?? []).includes("no_real_platform_capability_claim"), capabilityAttestationContract?.not_tested_requires);
assertInGroup("current_freeze_chain", "R10_synthetic_fixture_has_no_real_execution_authority", exactFlatObject(capabilityAttestationContract?.synthetic_fixture_requires, {
  data_scope: "synthetic_experiment",
  evidence_class: "synthetic_experiment",
  verified_by_role: "test_harness",
  real_executor_allowed: false,
}), capabilityAttestationContract?.synthetic_fixture_requires);
assertInGroup("current_freeze_chain", "R10_onsite_verified_reuses_P02_P03_without_new_units", hasExactKeys(capabilityAttestationContract?.onsite_verified_requires, [
  "normalized_existing_evidence_unit_ref",
  "component_evidence_unit_refs",
  "creates_new_probe",
  "creates_new_evidence_unit",
  "permission_snapshot_sha256_required",
  "permission_revision_required",
  "issued_at_and_expires_at_required",
  "verified_by_role",
])
  && capabilityAttestationContract?.onsite_verified_requires?.normalized_existing_evidence_unit_ref === "P02+P03"
  && equalArrays(capabilityAttestationContract?.onsite_verified_requires?.component_evidence_unit_refs ?? [], ["P02", "P03"])
  && capabilityAttestationContract?.onsite_verified_requires?.creates_new_probe === false
  && capabilityAttestationContract?.onsite_verified_requires?.creates_new_evidence_unit === false
  && capabilityAttestationContract?.onsite_verified_requires?.permission_snapshot_sha256_required === true
  && capabilityAttestationContract?.onsite_verified_requires?.permission_revision_required === true
  && capabilityAttestationContract?.onsite_verified_requires?.issued_at_and_expires_at_required === true
  && capabilityAttestationContract?.onsite_verified_requires?.verified_by_role === "authorized_competition_operator", capabilityAttestationContract?.onsite_verified_requires);
assertInGroup("current_freeze_chain", "R10_capability_failure_closed_contract_is_exact", equalArrays(reopenProjectionContract?.failure_closed ?? [], expectedCapabilityFailureClosed), reopenProjectionContract?.failure_closed);
assertInGroup("current_freeze_chain", "R10_raw_recurrence_visibility_is_not_expanded", reopenProjectionContract?.raw_recurrence_visibility_ref === "logical://tables/clusters/fields/recurrence_records/visibility_contract"
  && equalArrays(recurrenceVisibilityContract?.raw_read_logical_roles ?? [], ["improvement_insight"])
  && equalArrays(recurrenceVisibilityContract?.forbidden_raw_read_logical_roles ?? [], ["feedback_understanding", "case_coordination"])
  && equalArrays(recurrenceVisibilityContract?.low_privilege_view_projection?.hidden_in_views ?? [], ["issue_map", "improvement_tracking"])
  && recurrenceVisibilityContract?.low_privilege_view_projection?.view_count_covered_by_P03 === 5
  && recurrenceVisibilityContract?.P03_unprivileged_access_contract?.verification_status === "not_tested"
  && recurrenceVisibilityContract?.P03_unprivileged_access_contract?.result === null
  && recurrenceVisibilityContract?.P03_unprivileged_access_contract?.evidence === null, recurrenceVisibilityContract);
assertInGroup("current_freeze_chain", "R10_fact_executor_and_current_onsite_boundary_are_unverified", reopenProjectionContract?.fact_class === "solution_design"
  && reopenProjectionContract?.deployment_status === "offline_contract_not_configured_untested"
  && reopenProjectionContract?.real_executor_in_scope === false
  && exactFlatObject(reopenProjectionContract?.capability_attestation_contract?.current_onsite_state, {
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
  })
  && exactFlatObject(reopenProjectionContract?.onsite_boundary, {
    platform_atomic_all_targets: "not_tested",
    durable_sealed_outbox_CAS: "not_tested",
    worker_lease: "not_tested",
    exactly_once: "not_tested",
    real_Base_resources: null,
    deployment_claim: false,
  }), {
  contract: reopenProjectionContract,
});
assert("active_observation_recurrence_is_one_W6_internal_action_not_a_workflow", activeRecurrenceActionLocations.length === 1
  && activeRecurrenceActionLocations[0].workflow === "W6"
  && activeRecurrenceAction?.classification === "W6_internal_authorized_action_not_a_seventh_workflow"
  && activeRecurrenceAction?.phase === "cross_event_improvement_observation"
  && activeRecurrenceAction?.trigger === "closed_case_during_active_observation"
  && t2.workflows.length === 6
  && !t2.workflows.some((workflow) => workflow.key === activeRecurrenceActionKey), activeRecurrenceActionLocations);
assert("W6_source_steps_insert_internal_action_once_before_checkpoints", equalArrays(w6Workflow?.steps ?? [], [
  "run_N5_same_event_before_dispatch",
  "human_merge_or_keep_separate",
  "run_N5_cross_event_after_close",
  "human_review_cluster",
  "run_N6_root_cause_hypothesis",
  "run_N7_knowledge_or_insight_draft",
  "manage_improvement",
  "enter_observation",
  activeRecurrenceActionKey,
  "record_day_7",
  "record_day_30",
]), w6Workflow?.steps);
assert("active_recurrence_sequence_is_exact_N5_receipt_human_lock_only", equalArrays(activeRecurrenceSequence.map((entry) => entry.step), expectedActiveRecurrenceSteps)
  && equalArrays(activeRecurrenceSequence.map((entry) => entry.order), [1, 2, 3, 4])
  && equalArrays(activeRecurrenceSequence.map((entry) => entry.actor), ["ai", "repository", "human", "repository"]), activeRecurrenceSequence);
assert("human_recurrence_authorization_and_D1_checkpoints_are_separate_transactions", activeRecurrenceSequence[2]?.transaction_boundary === "separate_human_authorization_transaction"
  && activeRecurrenceSequence[3]?.transaction_boundary === "single_atomic_intake_transaction"
  && activeRecurrenceAction?.checkpoint_interlock_ref === "logical://workflows/W6/observation_phase_contract/checkpoint_contract"
  && w6Workflow?.observation_phase_contract?.checkpoint_contract?.authorization_and_checkpoint_transaction_shared === false
  && w6Workflow?.observation_phase_contract?.checkpoint_contract?.day_7_and_day_30_transaction_shared === false, {
  sequence: activeRecurrenceSequence,
  checkpoint_interlock_ref: activeRecurrenceAction?.checkpoint_interlock_ref,
  checkpoint_contract: w6Workflow?.observation_phase_contract?.checkpoint_contract,
});
assert("N5_and_N6_receipts_are_repository_issued_single_use_and_cross_isolated", activeRecurrenceAction?.receipt_isolation?.repository_issued === true
  && activeRecurrenceAction?.receipt_isolation?.opaque === true
  && activeRecurrenceAction?.receipt_isolation?.single_use === true
  && activeRecurrenceAction?.receipt_isolation?.cross_reuse === "forbidden"
  && equalArrays(activeRecurrenceAction?.receipt_isolation?.forbidden_directions ?? [], [
    "N5_receipt_to_N6_start_improvement",
    "N6_receipt_to_N5_active_intake",
  ])
  && JSON.stringify(activeRecurrenceAction?.receipt_isolation?.n5_receipt) === JSON.stringify({
    action: activeRecurrenceActionKey,
    node: "N5",
    mode: "cross_event_clustering",
    version: "N5-cross-event-1.0.0-draft.2",
    validator_version: "w6-n5-active-intake-validation-v1",
  })
  && JSON.stringify(activeRecurrenceAction?.receipt_isolation?.n6_receipt) === JSON.stringify({
    action: "start_improvement",
    node: "N6",
    mode: "root_cause_hypothesis",
    version: "N6-root-cause-1.0.0-draft.3",
    validator_version: "w6-n6-validation-v1",
  }), activeRecurrenceAction?.receipt_isolation);
assert("active_recurrence_write_allowlist_is_exact_and_append_only", equalArrays(activeRecurrenceAction?.write_boundary?.allowed_field_writes ?? [], expectedAllowedFieldWrites)
  && equalArrays(activeRecurrenceAction?.write_boundary?.append_only_writes ?? [], expectedAppendOnlyWrites), activeRecurrenceAction?.write_boundary);
assert("active_recurrence_forbids_case_feedback_improvement_cycle_and_status_writes", equalArrays(activeRecurrenceAction?.write_boundary?.forbidden_field_writes ?? [], expectedForbiddenFieldWrites)
  && equalArrays(activeRecurrenceAction?.write_boundary?.forbidden_record_mutations ?? [], expectedForbiddenRecordMutations)
  && activeRecurrenceAction?.write_boundary?.relation_direction === "clusters.member_case_ids_is_one_way_and_never_backfills_cases.cluster_id"
  && activeRecurrenceAction?.write_boundary?.cluster_status_effect === "unchanged_观察中"
  && activeRecurrenceAction?.write_boundary?.improvement_status_effect === "unchanged_观察中"
  && activeRecurrenceAction?.write_boundary?.observation_cycle_effect === "unchanged", activeRecurrenceAction?.write_boundary);
const observationPhaseContract = w6Workflow?.observation_phase_contract;
const observationActions = observationPhaseContract?.actions ?? {};
const enterObservationAction = observationActions.enter_observation;
const recordDay7Action = observationActions.record_day_7;
const recordDay30Action = observationActions.record_day_30;
const observationTrustedGeneration = observationPhaseContract?.trusted_generation_contract;
const observationRecurrenceSource = observationPhaseContract?.recurrence_source_contract;
const observationCheckpointContract = observationPhaseContract?.checkpoint_contract;
const observationAuditRepair = observationPhaseContract?.audit_repair_contract;
const expectedObservationActions = ["enter_observation", "record_day_7", "record_day_30"];

assert("active_recurrence_checkpoint_interlock_uses_D1_exact_clock_and_null_rate_contract", activeRecurrenceAction?.checkpoint_interlock_ref === "logical://workflows/W6/observation_phase_contract/checkpoint_contract"
  && observationCheckpointContract?.clock_source === "authoritative_observation_cycle_clock"
  && observationCheckpointContract?.day_30_cumulative_includes_day_7 === true
  && observationCheckpointContract?.missing_denominator === "recurrence_count_preserved_and_recurrence_rate_null", observationCheckpointContract);

assert("W6_observation_action_catalog_is_exact_and_not_workflows", observationPhaseContract?.classification === "W6_internal_observation_actions_not_a_seventh_workflow"
  && observationPhaseContract?.deployment_status === "draft_not_configured_untested"
  && equalArrays(Object.keys(observationActions), expectedObservationActions)
  && equalArrays(observationPhaseContract?.action_order ?? [], expectedObservationActions)
  && equalArrays(observationPhaseContract?.scope?.included_actions ?? [], expectedObservationActions)
  && equalArrays(observationPhaseContract?.scope?.excluded_actions ?? [], ["archive_observation", "reopen_recurrence"])
  && equalArrays(observationPhaseContract?.scope?.excluded_action_categories ?? [], ["archive", "reopen"])
  && observationPhaseContract?.scope?.committed_reopen_history_use === "read_only_checkpoint_source_not_a_reopen_action"
  && observationPhaseContract?.scope?.workflow_count_effect === "unchanged_6"
  && t2.workflows.length === 6
  && expectedObservationActions.every((action) => !t2.workflows.some((workflow) => workflow.key === action)), observationPhaseContract?.scope);
assert("enter_observation_is_human_authorized_in_observation_phase", enterObservationAction?.action === "enter_observation"
  && enterObservationAction?.phase === "observation"
  && enterObservationAction?.classification === "W6_internal_authorized_observation_action_not_a_seventh_workflow"
  && enterObservationAction?.ai_used === false
  && enterObservationAction?.authorization?.required === true
  && enterObservationAction?.authorization?.actor_kind === "authorized_human"
  && enterObservationAction?.authorization?.phase === "observation"
  && enterObservationAction?.authorization?.denial_or_invalid_grant_effect === "zero_target_business_writes", enterObservationAction);
assert("enter_authorization_wait_is_unlocked_then_commit_is_atomic", enterObservationAction?.authorization?.await_boundary === "outside_resource_lock"
  && equalArrays(enterObservationAction?.authorization?.resource_locks_held_while_awaiting ?? [], [])
  && equalArrays(enterObservationAction?.authorization?.business_writes_while_awaiting ?? [], [])
  && enterObservationAction?.transaction?.boundary === "single_atomic_enter_observation_transaction_after_authorization"
  && equalArrays(enterObservationAction?.transaction?.lock_scope ?? [], ["all_authoritative_case_resources", "cluster_resource", "improvement_resource"])
  && enterObservationAction?.transaction?.trusted_clock_revalidation_inside_full_lock === true
  && enterObservationAction?.transaction?.state_fingerprint_CAS_inside_full_lock === true
  && equalArrays(enterObservationAction?.transaction?.external_or_provider_awaits_inside_lock ?? [], [])
  && enterObservationAction?.transaction?.all_or_nothing === true, enterObservationAction);
assert("enter_system_generation_and_caller_forbidden_fields_match_T3", equalArrays(enterObservationAction?.command_contract?.caller_allowed_fields ?? [], ["action", "event_id", "case_ids", "cluster_id", "improvement_id", "actor", "reason"])
  && enterObservationAction?.command_contract?.caller_forbidden_fields_ref === "logical://workflows/W6/observation_phase_contract/trusted_generation_contract/enter_caller_must_not_supply"
  && enterObservationAction?.command_contract?.exact_shape_required === true
  && equalArrays(observationTrustedGeneration?.system_origin_fields ?? [], ["cycle_id", "clock_source", "occurred_at", "history_id", "receipt_id", "checkpoint_id"])
  && equalArrays(observationTrustedGeneration?.trusted_sources ?? [], ["system_id_port", "trusted_clock_port", "repository_authoritative_state"])
  && equalArrays(observationTrustedGeneration?.enter_caller_must_not_supply ?? [], ["cycle_id", "clock_source", "occurred_at", "history_id", "receipt_id", "checkpoint_id", "observation_history", "authorization_grant", "authorization_principal", "authorization_policy_version"])
  && observationTrustedGeneration?.checkpoint_cycle_id_rule === "caller_may_reference_only_the_existing_system_generated_active_cycle_id_and_repository_must_revalidate_it"
  && equalArrays(observationTrustedGeneration?.runtime_only_not_base_canonical_fields ?? [], ["runtime://W6/observation_cycles", "runtime://W6/observation_checkpoints", "runtime://W6/history_entries", "runtime://W6/transition_receipts", "runtime://W6/improvements/current_observation_cycle_id"]), observationTrustedGeneration);
assert("day7_day30_are_independent_and_have_no_caller_actor_AI_or_authorizer", [recordDay7Action, recordDay30Action].every((action) => action?.phase === "observation"
    && action?.classification === "W6_internal_deterministic_checkpoint_action_not_a_seventh_workflow"
    && equalArrays(action?.command_contract?.caller_allowed_fields ?? [], ["action", "event_id", "case_ids", "cluster_id", "improvement_id", "cycle_id", "related_task_volume"])
    && action?.command_contract?.caller_forbidden_fields_ref === "logical://workflows/W6/observation_phase_contract/trusted_generation_contract/checkpoint_caller_must_not_supply"
    && action?.command_contract?.exact_shape_required === true
    && action?.invocation?.mode === "deterministic_system"
    && action?.invocation?.caller_actor_allowed === false
    && action?.invocation?.ai_invocation_allowed === false
    && action?.invocation?.authorizer_call_allowed === false
    && action?.invocation?.authorization_state === "not_required"
    && action?.transaction?.shared_with_enter_or_other_checkpoint === false
    && action?.transaction?.exact_clock_and_active_cycle_revalidated_inside_full_lock === true
    && equalArrays(action?.transaction?.external_or_provider_awaits_inside_lock ?? [], []))
  && recordDay7Action?.transaction?.boundary === "separate_deterministic_day_7_checkpoint_transaction"
  && recordDay30Action?.transaction?.boundary === "separate_deterministic_day_30_checkpoint_transaction", { day7: recordDay7Action, day30: recordDay30Action });
assert("checkpoint_sources_are_committed_intake_or_reopen_history_and_day30_is_cumulative", equalArrays(observationRecurrenceSource?.allowed_authoritative_sources ?? [], ["committed_active_observation_intake_history_for_same_cycle", "committed_recurrence_reopen_cycle_facts_for_same_cycle"])
  && observationRecurrenceSource?.reopen_history_mode === "read_only_source_only_reopen_action_excluded_from_batch_d1"
  && equalArrays(observationRecurrenceSource?.excluded_sources ?? [], ["candidate", "authorization_only", "receipt_only", "rejected", "rolled_back", "uncommitted", "other_cycle"])
  && observationRecurrenceSource?.day_30_cumulatively_includes_day_7 === true
  && observationRecurrenceSource?.related_task_volume_rule === "null_or_positive_safe_integer_not_less_than_authoritative_recurrence_count"
  && observationRecurrenceSource?.missing_denominator === "recurrence_count_preserved_and_recurrence_rate_null"
  && recordDay30Action?.requires_same_cycle_day_7_checkpoint === true
  && recordDay30Action?.cumulative_includes_day_7 === true
  && observationCheckpointContract?.day_30_requires_same_cycle_day_7 === true, observationRecurrenceSource);
assert("observation_actions_audit_pending_and_event_replay_are_business_idempotent", equalArrays(observationAuditRepair?.applies_to ?? [], expectedObservationActions)
  && observationAuditRepair?.business_success_audit_failure_state === "audit_pending"
  && observationAuditRepair?.business_result_remains_authoritative === true
  && observationAuditRepair?.same_event_same_payload === "return_cached_business_result_and_repair_only_the_same_failed_audit"
  && observationAuditRepair?.same_event_different_payload === "event_conflict"
  && equalArrays(observationAuditRepair?.audit_only_repair_allowed_writes ?? [], ["runtime://W6/workflow_audit"])
  && equalArrays(observationAuditRepair?.event_replay_business_writes ?? [], [])
  && equalArrays(observationAuditRepair?.event_replay_forbidden_actions ?? [], ["repeat_human_authorization", "repeat_business_commit", "regenerate_cycle_id", "regenerate_history_id", "regenerate_receipt_id", "regenerate_checkpoint_id", "rerun_AI"])
  && observationAuditRepair?.audit_repair_and_event_replay_are_separate_outcomes === true, observationAuditRepair);
const day7Guard = activeRecurrenceAction?.active_observation_window_guard;
const checkpointContract = w6Workflow?.observation_phase_contract?.checkpoint_contract;
const outcomeContract = activeRecurrenceAction?.outcome_recording_contract;
const finalGuardRejection = outcomeContract?.final_guard_rejection_after_capability_consumption;
assert("active_recurrence_day7_checkpoint_closes_lte_cutoff_and_only_gt_enters_day30", day7Guard?.base_window === "opened_at < closed_at <= min(occurred_at, day30ExpectedAt)"
  && equalArrays(day7Guard?.day_7_sealed_when ?? [], ["same_cycle_day_7_checkpoint_exists", "occurred_at > day7ExpectedAt"])
  && day7Guard?.sealed_day_7_rejection === "closed_at <= day7ExpectedAt"
  && day7Guard?.equal_millisecond_rejected_after_day_7_sealed === true
  && day7Guard?.day_30_eligibility_after_day_7_sealed === "closed_at > day7ExpectedAt_and_closed_at <= min(occurred_at, day30ExpectedAt)"
  && checkpointContract?.day_7_expected_at === "opened_at_plus_exactly_7_days"
  && checkpointContract?.day_30_expected_at === "opened_at_plus_exactly_30_days"
  && checkpointContract?.exact_expected_at_required === true, {
  guard: day7Guard,
  checkpoint: checkpointContract,
});
assert("active_recurrence_day7_boundary_is_guarded_before_receipt_and_inside_final_commit_lock", day7Guard?.guard_id === "violatesW6ActiveIntakeObservationWindow"
  && day7Guard?.shared_implementation === true
  && equalArrays(day7Guard?.guard_points?.map((entry) => `${entry.sequence_order}:${entry.point}`) ?? [], [
    "2:before_action_scoped_N5_receipt_issue",
    "4:inside_full_case_cluster_improvement_lock_before_state_fingerprint_CAS_and_business_commit",
  ])
  && activeRecurrenceSequence[1]?.requires?.includes("shared_guard_violatesW6ActiveIntakeObservationWindow_passed_before_receipt_issue")
  && activeRecurrenceSequence[3]?.requires?.includes("N5_validation_and_human_authorization_capabilities_consumed_before_final_guard")
  && activeRecurrenceSequence[3]?.requires?.includes("shared_guard_violatesW6ActiveIntakeObservationWindow_passed_against_authoritative_state_inside_full_lock_before_state_fingerprint_CAS_and_business_commit")
  && day7Guard?.checkpoint_first_intake_second === "a_checkpoint_committed_before_final_intake_guard_closes_day_7_and_rejects_closed_at_less_than_or_equal_to_day7ExpectedAt"
  && day7Guard?.final_guard_precedes_state_fingerprint_CAS === true
  && checkpointContract?.active_cycle_revalidated_before_and_inside_lock === true, day7Guard);
assert("late_day7_rejection_has_zero_business_and_w6_state_writes", equalArrays(finalGuardRejection?.consumed_capabilities ?? [], [
  "N5_action_scoped_validation_capability",
  "human_recurrence_authorization_capability",
])
  && finalGuardRejection?.capability_consumption === "consumed"
  && finalGuardRejection?.business_commit === "rejected"
  && equalArrays(finalGuardRejection?.business_writes ?? [], [])
  && equalArrays(finalGuardRejection?.w6_state_writes ?? [], [])
  && activeRecurrenceAction?.failure_closed?.includes("checkpoint_first_intake_second_cutoff_rejection_has_zero_business_writes")
  && activeRecurrenceAction?.failure_closed?.includes("checkpoint_first_intake_second_cutoff_rejection_has_zero_W6_durable_state_writes"), {
  outcome: finalGuardRejection,
  failure_closed: activeRecurrenceAction?.failure_closed,
});
assert("capability_consumption_and_business_write_result_are_separate_audit_records", outcomeContract?.capability_consumption_outcome === "record_separately_as_private_security_state"
  && outcomeContract?.business_commit_outcome === "record_separately_as_committed_or_rejected"
  && outcomeContract?.business_write_outcome === "record_separately_as_exact_business_write_set"
  && outcomeContract?.w6_state_write_outcome === "record_separately_as_exact_durable_W6_state_write_set"
  && outcomeContract?.capability_consumption_is_not_business_or_W6_durable_write === true
  && activeRecurrenceAction?.failure_closed?.includes("consumed_capabilities_are_recorded_as_private_security_state_not_business_or_W6_durable_writes"), outcomeContract);
assert("archive_stays_human_and_unreviewed_knowledge_stays_unpublished", equalArrays(activeRecurrenceAction?.archive_and_publication_contract?.archive_requires ?? [], [
  "exact_day_7_checkpoint",
  "exact_day_30_checkpoint",
  "authorized_human",
  "non_empty_human_conclusion",
])
  && activeRecurrenceAction?.archive_and_publication_contract?.automatic_archive === false
  && activeRecurrenceAction?.archive_and_publication_contract?.automatic_knowledge_publication === false
  && activeRecurrenceAction?.archive_and_publication_contract?.automatic_final_root_cause === false
  && (activeRecurrenceAction?.failure_closed ?? []).includes("never_publish_unreviewed_knowledge"), activeRecurrenceAction?.archive_and_publication_contract);

const tableKeySet = new Set(t2TableKeys);
const nodeKeySet = new Set(t3.aiNodeIds);
const workflowKeySet = new Set(t3.workflowIds);
const referenceErrors = [];
for (const table of t2.tables) {
  for (const field of table.fields) {
    if (field.target && !tableKeySet.has(field.target)) {
      referenceErrors.push(`field ${table.key}.${field.key} -> ${field.target}`);
    }
  }
}
for (const view of t2.frontend_views) {
  for (const table of view.source_tables) {
    if (!tableKeySet.has(table)) referenceErrors.push(`view ${view.key} -> ${table}`);
  }
}
for (const role of t2.logical_business_roles) {
  for (const table of [...role.reads, ...role.writes]) {
    if (!tableKeySet.has(table)) referenceErrors.push(`role ${role.key} -> ${table}`);
  }
  for (const node of role.owns_nodes) {
    if (!nodeKeySet.has(node.node)) referenceErrors.push(`role ${role.key} -> ${node.node}`);
  }
}
for (const entry of t2.integration_order) {
  if (!workflowKeySet.has(entry.workflow)) referenceErrors.push(`integration_order -> ${entry.workflow}`);
}
assert("all_logical_references_use_canonical_keys", referenceErrors.length === 0, referenceErrors);

const deprecatedTokens = [
  "feedback_cases",
  "issue_clusters",
  "improvement_projects",
  "site_responsibility_matrix",
  "schema_validation",
  "missing_items",
  "source_marker",
];
const presentDeprecatedTokens = deprecatedTokens.filter((entry) => t2ManifestText.includes(`"${entry}"`));
assert("no_deprecated_alias_tokens", presentDeprecatedTokens.length === 0, presentDeprecatedTokens);

const graphTargetByPath = new Map([
  [paths.r10Core, "r10_core"],
  [paths.r10Test, "r10_test"],
  [paths.r10Record, "r10_record"],
  [paths.t2Manifest, "logical"],
  [paths.buildPackage, "build"],
  [paths.probeSuite, "probe"],
  [paths.importPlan, "import"],
  [paths.smokePlan, "smoke"],
  [paths.evidenceTemplate, "evidence"],
  [paths.t1Manifest, "canonical_manifest"],
  [paths.mainStory, "main_story"],
  [paths.failureDrills, "failure_drills"],
]);
const sourceFileByGraphNode = new Map([
  ["logical", paths.t2Manifest],
  ["build", paths.buildPackage],
  ["probe", paths.probeSuite],
  ["import", paths.importPlan],
  ["smoke", paths.smokePlan],
  ["evidence", paths.evidenceTemplate],
]);
const targetFileByGraphNode = new Map([...graphTargetByPath].map(([filePath, node]) => [node, filePath]));
const targetShaByGraphNode = new Map([
  ["r10_core", sha256(r10Core)],
  ["r10_test", sha256(r10Test)],
  ["r10_record", sha256(r10Record)],
  ["logical", sha256(t2ManifestText)],
  ["build", sha256(buildPackageText)],
  ["probe", sha256(probeSuiteText)],
  ["import", sha256(importPlanText)],
  ["smoke", sha256(smokePlanText)],
  ["evidence", sha256(evidenceTemplateText)],
  ["canonical_manifest", sha256(t1ManifestText)],
  ["main_story", sha256(mainStoryText)],
  ["failure_drills", sha256(failureDrillsText)],
]);

const packageArtifactByNode = new Map([
  ["build", { value: buildPackage, raw: buildPackageText, file: paths.buildPackage }],
  ["probe", { value: probeSuite, raw: probeSuiteText, file: paths.probeSuite }],
  ["import", { value: importPlan, raw: importPlanText, file: paths.importPlan }],
  ["smoke", { value: smokePlan, raw: smokePlanText, file: paths.smokePlan }],
]);
const freezeEdgeDefinitions = [
  { source: "logical", target: "r10_core", root: t2, path_trail: ["contract_sources", "r10_feishu_reopen_projector_freeze", "core"], sha_trail: ["contract_sources", "r10_feishu_reopen_projector_freeze", "core_sha256"], expected_path: EXPECTED_R10_FREEZE.core, expected_sha256: EXPECTED_R10_FREEZE.core_sha256 },
  { source: "logical", target: "r10_test", root: t2, path_trail: ["contract_sources", "r10_feishu_reopen_projector_freeze", "test"], sha_trail: ["contract_sources", "r10_feishu_reopen_projector_freeze", "test_sha256"], expected_path: EXPECTED_R10_FREEZE.test, expected_sha256: EXPECTED_R10_FREEZE.test_sha256 },
  { source: "logical", target: "r10_record", root: t2, path_trail: ["contract_sources", "r10_feishu_reopen_projector_freeze", "record"], sha_trail: ["contract_sources", "r10_feishu_reopen_projector_freeze", "record_sha256"], expected_path: EXPECTED_R10_FREEZE.record, expected_sha256: EXPECTED_R10_FREEZE.record_sha256 },
  { source: "build", target: "logical", root: buildPackage, path_trail: ["source_of_truth", "path"], sha_trail: ["source_of_truth", "sha256"], expected_path: "./neoloop-logical-manifest.v0.1.json", expected_sha256: sha256(t2ManifestText) },
  { source: "probe", target: "logical", root: probeSuite, path_trail: ["sources", "logical_manifest", "path"], sha_trail: ["sources", "logical_manifest", "sha256"], expected_path: "./neoloop-logical-manifest.v0.1.json", expected_sha256: sha256(t2ManifestText) },
  { source: "probe", target: "build", root: probeSuite, path_trail: ["sources", "build_package", "path"], sha_trail: ["sources", "build_package", "sha256"], expected_path: "./on-site-build-package.v0.1.json", expected_sha256: sha256(buildPackageText) },
  { source: "import", target: "logical", root: importPlan, path_trail: ["contract_sources", "logical_manifest", "path"], sha_trail: ["contract_sources", "logical_manifest", "sha256"], expected_path: "./neoloop-logical-manifest.v0.1.json", expected_sha256: sha256(t2ManifestText) },
  { source: "import", target: "build", root: importPlan, path_trail: ["contract_sources", "build_package", "path"], sha_trail: ["contract_sources", "build_package", "sha256"], expected_path: "./on-site-build-package.v0.1.json", expected_sha256: sha256(buildPackageText) },
  { source: "smoke", target: "logical", root: smokePlan, path_trail: ["sources", "logical_manifest", "path"], sha_trail: ["sources", "logical_manifest", "sha256"], expected_path: "./neoloop-logical-manifest.v0.1.json", expected_sha256: sha256(t2ManifestText) },
];

const expectedImportTableOrder = [
  "vehicles",
  "routing_matrix",
  "knowledge_index",
  "delivery_tasks",
  "cases",
  "raw_feedback",
  "work_orders",
  "clusters",
  "improvements",
  "ai_audit",
];
const canonicalTableSourceByName = new Map(canonicalTableSources.map((source) => [source.id.slice("canonical_table:".length), source]));
for (const [tableName, source] of canonicalTableSourceByName) {
  const target = `canonical_table:${tableName}`;
  const targetPath = path.join(repositoryRoot, source.path);
  graphTargetByPath.set(targetPath, target);
  targetFileByGraphNode.set(target, targetPath);
  targetShaByGraphNode.set(target, source.sha256);
}

const pathAssetLockDefinitions = [
  { source: "import", target: "canonical_manifest", root: importPlan, reference_trail: ["contract_sources", "canonical_manifest", "path"], sha_trail: ["contract_sources", "canonical_manifest", "sha256"], expected_reference: "../../data/canonical/manifest.json", expected_sha256: EXPECTED_MATERIAL_SHA256.canonical_manifest },
  { source: "smoke", target: "canonical_manifest", root: smokePlan, reference_trail: ["sources", "canonical_manifest", "path"], sha_trail: ["sources", "canonical_manifest", "sha256"], expected_reference: "../../data/canonical/manifest.json", expected_sha256: EXPECTED_MATERIAL_SHA256.canonical_manifest },
  { source: "smoke", target: "main_story", root: smokePlan, reference_trail: ["sources", "main_story", "path"], sha_trail: ["sources", "main_story", "sha256"], expected_reference: "../../data/canonical/scenarios/main-story.json", expected_sha256: EXPECTED_MATERIAL_SHA256.main_story },
  { source: "smoke", target: "failure_drills", root: smokePlan, reference_trail: ["sources", "failure_drills", "path"], sha_trail: ["sources", "failure_drills", "sha256"], expected_reference: "../../data/canonical/scenarios/failure-drills.json", expected_sha256: EXPECTED_MATERIAL_SHA256.failure_drills },
];
const tableAssetLockDefinitions = expectedImportTableOrder.map((tableName, index) => ({
  source: "import",
  target: `canonical_table:${tableName}`,
  root: importPlan,
  table_key_trail: ["table_batches", index, "canonical_table_key"],
  reference_trail: ["table_batches", index, "source_file_ref"],
  sha_trail: ["table_batches", index, "source_file_sha256"],
  expected_table_key: tableName,
  expected_reference: `canonical://tables/${tableName}/file`,
  expected_sha256: canonicalTableSourceByName.get(tableName)?.sha256,
}));
const assetLockDefinitions = [...pathAssetLockDefinitions, ...tableAssetLockDefinitions];
const projectionDigestDefinition = {
  source: "import",
  root: importPlan,
  sha_trail: ["contract_sources", "canonical_manifest", "contract_projection_sha256"],
  expected_sha256: t1.fixture_index?.contract_projection_sha256,
};

const historicalShaSlotDefinitions = [
  ...Object.entries(EXPECTED_R6_FREEZE)
    .filter(([key]) => isSha256NamedKey(key))
    .map(([key, expectedSha256]) => ({
      source: "logical",
      root: t2,
      sha_trail: ["contract_sources", "w6_internal_action_freeze", key],
      category: "historical_freeze",
      expected_sha256: expectedSha256,
    })),
  ...Object.entries(EXPECTED_R7_FREEZE)
    .filter(([key]) => isSha256NamedKey(key))
    .map(([key, expectedSha256]) => ({
      source: "logical",
      root: t2,
      sha_trail: ["contract_sources", "batch_d1_observation_checkpoints_freeze", key],
      category: "historical_freeze",
      expected_sha256: expectedSha256,
    })),
];
const runtimeNullShaSlotDefinitions = [
  {
    source: "logical",
    root: t2,
    sha_trail: ["workflows", 5, "reopen_projection_contract", "capability_attestation_contract", "not_tested_requires", "permission_snapshot_sha256"],
  },
  {
    source: "logical",
    root: t2,
    sha_trail: ["workflows", 5, "reopen_projection_contract", "capability_attestation_contract", "current_onsite_state", "permission_snapshot_sha256"],
  },
  {
    source: "build",
    root: buildPackage,
    sha_trail: ["workflows", 5, "reopen_projection_build_contract", "capability_attestation_contract", "not_tested_requires", "permission_snapshot_sha256"],
  },
  {
    source: "build",
    root: buildPackage,
    sha_trail: ["workflows", 5, "reopen_projection_build_contract", "capability_attestation_contract", "current_onsite_state", "permission_snapshot_sha256"],
  },
  {
    source: "smoke",
    root: smokePlan,
    sha_trail: ["smoke_units", 0, "r10_reopen_projection_smoke", "current_onsite_state", "capability_attestation_sha256"],
  },
  {
    source: "smoke",
    root: smokePlan,
    sha_trail: ["smoke_units", 0, "r10_reopen_projection_smoke", "current_onsite_state", "permission_snapshot_sha256"],
  },
].map((definition) => ({
  ...definition,
  category: "runtime_null",
  expected_sha256: null,
}));
const globalShaSlotDefinitions = [
  ...historicalShaSlotDefinitions,
  ...freezeEdgeDefinitions.map((definition) => ({ ...definition, category: "current_freeze" })),
  ...assetLockDefinitions.map((definition) => ({ ...definition, category: "asset_lock" })),
  { ...projectionDigestDefinition, category: "contract_projection_digest" },
  ...runtimeNullShaSlotDefinitions,
];
const globalShaArtifactByNode = new Map([
  ["logical", { value: t2, raw: t2ManifestText, file: paths.t2Manifest }],
  ...packageArtifactByNode,
]);
const globalShaSlotAnalysis = analyzeNamedShaSlotClosure(globalShaArtifactByNode, globalShaSlotDefinitions);
const sha256ScalarDefinitions = globalShaSlotDefinitions.filter((definition) => definition.category !== "runtime_null");
const sha256ScalarAnalysis = analyzeSha256ScalarClosure(globalShaArtifactByNode, sha256ScalarDefinitions);
const expectedGlobalShaPartitions = {
  historical_freeze: 14,
  current_freeze: 9,
  asset_lock: 14,
  contract_projection_digest: 1,
  runtime_null: 6,
  unknown: 0,
};
assertInGroup("reference_graph", "global_SHA_named_slot_allowlist_is_exact_44", globalShaSlotDefinitions.length === 44
  && globalShaSlotAnalysis.observed.length === 44
  && globalShaSlotAnalysis.exact, globalShaSlotAnalysis);
assertInGroup("reference_graph", "global_SHA_named_slot_partition_is_exact_38_nonempty_plus_6_runtime_null", exactFlatObject(
  globalShaSlotAnalysis.partitions,
  expectedGlobalShaPartitions,
)
  && globalShaSlotAnalysis.classified.filter((slot) => slot.category !== "runtime_null").length === 38
  && globalShaSlotAnalysis.classified.filter((slot) => slot.category === "runtime_null" && slot.value === null).length === 6, globalShaSlotAnalysis.partitions);
assertInGroup("reference_graph", "global_SHA_named_slots_have_no_unknown_alias_or_mismatched_value", globalShaSlotAnalysis.unknown.length === 0
  && globalShaSlotAnalysis.aliases.length === 0
  && globalShaSlotAnalysis.mismatched.length === 0, {
  unknown: globalShaSlotAnalysis.unknown,
  aliases: globalShaSlotAnalysis.aliases,
  mismatched: globalShaSlotAnalysis.mismatched,
});
assertInGroup("reference_graph", "global_SHA_named_slots_are_lowercase_non_placeholder", globalShaSlotAnalysis.invalid.length === 0, globalShaSlotAnalysis.invalid);
assertInGroup("reference_graph", "global_SHA256_scalar_allowlist_is_exact_38_independent_of_key_name", sha256ScalarDefinitions.length === 38
  && sha256ScalarDefinitions.every((definition) => isFrozenSha256(definition.expected_sha256))
  && sha256ScalarAnalysis.observed.length === 38
  && sha256ScalarAnalysis.exact, sha256ScalarAnalysis);
assertInGroup("reference_graph", "global_SHA256_scalars_have_no_unknown_alias_mismatch_or_uppercase_value", sha256ScalarAnalysis.unknown.length === 0
  && sha256ScalarAnalysis.aliases.length === 0
  && sha256ScalarAnalysis.mismatched.length === 0
  && sha256ScalarAnalysis.non_lowercase.length === 0, {
  unknown: sha256ScalarAnalysis.unknown,
  aliases: sha256ScalarAnalysis.aliases,
  mismatched: sha256ScalarAnalysis.mismatched,
  non_lowercase: sha256ScalarAnalysis.non_lowercase,
});

function cloneShaArtifacts() {
  return new Map([...globalShaArtifactByNode].map(([source, artifact]) => [source, {
    ...artifact,
    value: JSON.parse(artifact.raw),
  }]));
}

const sha256ScalarNegativeFixtures = [
  {
    id: "arbitrary_key_known_SHA_alias",
    mutate(artifacts) {
      artifacts.get("logical").value.unexpected_sha_alias = EXPECTED_R10_FREEZE.core_sha256;
    },
    detected(analysis) {
      return analysis.observed.length === 39
        && analysis.unknown.some((slot) => slot.pointer === "/unexpected_sha_alias")
        && analysis.aliases.some((slot) => slot.pointer === "/unexpected_sha_alias");
    },
  },
  {
    id: "arbitrary_key_new_SHA",
    mutate(artifacts) {
      artifacts.get("logical").value.rogue_hash = sha256("rogue-hash");
    },
    detected(analysis) {
      return analysis.observed.length === 39
        && analysis.unknown.some((slot) => slot.pointer === "/rogue_hash")
        && !analysis.aliases.some((slot) => slot.pointer === "/rogue_hash");
    },
  },
  {
    id: "known_slots_swapped_values",
    mutate(artifacts) {
      const freeze = artifacts.get("logical").value.contract_sources.r10_feishu_reopen_projector_freeze;
      [freeze.core_sha256, freeze.test_sha256] = [freeze.test_sha256, freeze.core_sha256];
    },
    detected(analysis) {
      return analysis.mismatched.length === 2;
    },
  },
  {
    id: "uppercase_SHA_scalar",
    mutate(artifacts) {
      const freeze = artifacts.get("logical").value.contract_sources.r10_feishu_reopen_projector_freeze;
      freeze.core_sha256 = freeze.core_sha256.toUpperCase();
    },
    detected(analysis) {
      return analysis.mismatched.length === 1 && analysis.non_lowercase.length === 1;
    },
  },
];
for (const fixture of sha256ScalarNegativeFixtures) {
  const artifacts = cloneShaArtifacts();
  fixture.mutate(artifacts);
  const analysis = analyzeSha256ScalarClosure(artifacts, sha256ScalarDefinitions);
  assertInGroup("global_sha_slot_fail_closed", `global_SHA256_scalar_allowlist_rejects_${fixture.id}`, !analysis.exact && fixture.detected(analysis), analysis);
}

const globalShaSlotNegativeFixtures = [
  {
    id: "extra_45th_slot",
    mutate(artifacts) {
      artifacts.get("logical").value.unexpected_sha256 = sha256("unexpected-45th-slot");
    },
    detected(analysis) {
      return analysis.observed.length === 45 && analysis.unknown.length === 1;
    },
  },
  {
    id: "unknown_value",
    mutate(artifacts) {
      artifacts.get("logical").value.contract_sources.r10_feishu_reopen_projector_freeze.core_sha256 = sha256("unknown-slot-value");
    },
    detected(analysis) {
      return analysis.mismatched.length === 1 && analysis.invalid.length === 0;
    },
  },
  {
    id: "known_SHA_alias",
    mutate(artifacts) {
      artifacts.get("logical").value.aliased_core_sha256 = EXPECTED_R10_FREEZE.core_sha256;
    },
    detected(analysis) {
      return analysis.unknown.length === 1 && analysis.aliases.length === 1;
    },
  },
  {
    id: "swapped_values",
    mutate(artifacts) {
      const freeze = artifacts.get("logical").value.contract_sources.r10_feishu_reopen_projector_freeze;
      [freeze.core_sha256, freeze.test_sha256] = [freeze.test_sha256, freeze.core_sha256];
    },
    detected(analysis) {
      return analysis.mismatched.length === 2 && analysis.invalid.length === 0;
    },
  },
  {
    id: "placeholder_value",
    mutate(artifacts) {
      artifacts.get("logical").value.contract_sources.r10_feishu_reopen_projector_freeze.core_sha256 = "placeholder";
    },
    detected(analysis) {
      return analysis.mismatched.length === 1 && analysis.invalid.length === 1;
    },
  },
  {
    id: "runtime_null_changed_to_non_null",
    mutate(artifacts) {
      artifacts.get("logical").value.workflows[5].reopen_projection_contract.capability_attestation_contract.not_tested_requires.permission_snapshot_sha256 = "short";
    },
    detected(analysis) {
      return analysis.mismatched.length === 1 && analysis.classified.some((slot) => slot.category === "runtime_null" && slot.value === "short");
    },
  },
  {
    id: "runtime_null_slot_deleted",
    mutate(artifacts) {
      delete artifacts.get("smoke").value.smoke_units[0].r10_reopen_projection_smoke.current_onsite_state.capability_attestation_sha256;
    },
    detected(analysis) {
      return analysis.observed.length === 43 && analysis.partitions.runtime_null === 5;
    },
  },
];
for (const fixture of globalShaSlotNegativeFixtures) {
  const artifacts = cloneShaArtifacts();
  fixture.mutate(artifacts);
  const analysis = analyzeNamedShaSlotClosure(artifacts, globalShaSlotDefinitions);
  assertInGroup("global_sha_slot_fail_closed", `global_SHA_named_slot_rejects_${fixture.id}`, !analysis.exact && fixture.detected(analysis), analysis);
}

const placeholderPairArtifacts = cloneShaArtifacts();
placeholderPairArtifacts.get("build").value.injected_placeholder_pair = {
  path: "../evidence/on-site-evidence-template.json",
  sha256: "placeholder",
};
const placeholderPairAnalysis = analyzeNamedShaSlotClosure(placeholderPairArtifacts, globalShaSlotDefinitions);
const placeholderPairValidatedPaths = validatedHashedPathPointerKeys(placeholderPairArtifacts, globalShaSlotDefinitions);
const placeholderPairLocators = collectArtifactFileLocators(
  placeholderPairArtifacts.get("build").value,
  paths.buildPackage,
  "build",
  graphTargetByPath,
  placeholderPairValidatedPaths,
);
assertInGroup("global_sha_slot_fail_closed", "placeholder_path_SHA_pair_fails_SHA_allowlist_and_is_not_skipped_as_hashed_locator", !placeholderPairAnalysis.exact
  && placeholderPairAnalysis.unknown.some((slot) => slot.pointer === "/injected_placeholder_pair/sha256")
  && placeholderPairAnalysis.invalid.some((slot) => slot.pointer === "/injected_placeholder_pair/sha256")
  && placeholderPairLocators.some((locator) => locator.trail === "injected_placeholder_pair.path"), {
  analysis: placeholderPairAnalysis,
  locators: placeholderPairLocators,
});

const validatedHashedPathPointers = validatedHashedPathPointerKeys(globalShaArtifactByNode, globalShaSlotDefinitions);

const observedFreezePins = freezeEdgeDefinitions.map((definition) => ({
  source: definition.source,
  target: definition.target,
  path: valueAtTrail(definition.root, definition.path_trail),
  sha256: valueAtTrail(definition.root, definition.sha_trail),
  path_pointer: toJsonPointer(definition.path_trail),
  sha256_pointer: toJsonPointer(definition.sha_trail),
}));
const expectedFreezePins = freezeEdgeDefinitions.map((definition) => ({
  source: definition.source,
  target: definition.target,
  path: definition.expected_path,
  sha256: definition.expected_sha256,
  path_pointer: toJsonPointer(definition.path_trail),
  sha256_pointer: toJsonPointer(definition.sha_trail),
}));
const freezePinComparable = (pin) => JSON.stringify(pin);
assertInGroup("reference_graph", "freeze_graph_has_only_the_exact_allowed_downstream_to_upstream_pins", equalArrays(
  sorted(observedFreezePins.map(freezePinComparable)),
  sorted(expectedFreezePins.map(freezePinComparable)),
), { observed: observedFreezePins, expected: expectedFreezePins });

const resolvedFreezePins = observedFreezePins.map((pin) => {
  const sourceFile = sourceFileByGraphNode.get(pin.source);
  const resolution = typeof pin.path === "string" && sourceFile
    ? resolveRepoReference(sourceFile, pin.path)
    : { resolved: null, relative: null, bounded: false };
  return { ...pin, ...resolution };
});
assertInGroup("reference_graph", "freeze_graph_paths_are_repo_bounded_unique_and_resolve_to_the_allowed_target", resolvedFreezePins.every((pin) => pin.bounded
  && pin.resolved === targetFileByGraphNode.get(pin.target))
  && new Set(resolvedFreezePins.map((pin) => `${pin.source}->${pin.target}`)).size === resolvedFreezePins.length, resolvedFreezePins);
assertInGroup("reference_graph", "freeze_graph_SHA_values_are_lowercase_non_placeholder_and_match_target_bytes", observedFreezePins.every((pin) => isFrozenSha256(pin.sha256)
  && pin.sha256 === targetShaByGraphNode.get(pin.target)), observedFreezePins);

const observedAssetLocks = assetLockDefinitions.map((definition) => ({
  source: definition.source,
  target: definition.target,
  reference: valueAtTrail(definition.root, definition.reference_trail),
  sha256: valueAtTrail(definition.root, definition.sha_trail),
  reference_pointer: toJsonPointer(definition.reference_trail),
  sha256_pointer: toJsonPointer(definition.sha_trail),
  canonical_table_key: definition.table_key_trail ? valueAtTrail(definition.root, definition.table_key_trail) : undefined,
}));
const expectedAssetLocks = assetLockDefinitions.map((definition) => ({
  source: definition.source,
  target: definition.target,
  reference: definition.expected_reference,
  sha256: definition.expected_sha256,
  reference_pointer: toJsonPointer(definition.reference_trail),
  sha256_pointer: toJsonPointer(definition.sha_trail),
  canonical_table_key: definition.expected_table_key,
}));
const assetLockComparable = (lock) => JSON.stringify({
  source: lock.source,
  target: lock.target,
  reference: lock.reference,
  sha256: lock.sha256,
  reference_pointer: lock.reference_pointer,
  sha256_pointer: lock.sha256_pointer,
  canonical_table_key: lock.canonical_table_key ?? null,
});
const assetReferenceAliases = observedAssetLocks.filter((lock, index) => lock.reference !== expectedAssetLocks[index].reference
  || (lock.canonical_table_key ?? null) !== (expectedAssetLocks[index].canonical_table_key ?? null));
assertInGroup("reference_graph", "asset_locks_match_the_exact_source_pointer_reference_and_SHA_allowlist", equalArrays(
  sorted(observedAssetLocks.map(assetLockComparable)),
  sorted(expectedAssetLocks.map(assetLockComparable)),
), { observed: observedAssetLocks, expected: expectedAssetLocks });
assertInGroup("reference_graph", "asset_lock_reference_aliases_are_zero", assetReferenceAliases.length === 0, assetReferenceAliases);
const resolvedPathAssetLocks = observedAssetLocks.slice(0, pathAssetLockDefinitions.length).map((lock) => {
  const resolution = resolveRepoReference(sourceFileByGraphNode.get(lock.source), lock.reference);
  return { ...lock, ...resolution };
});
assertInGroup("reference_graph", "asset_locks_are_excluded_from_DAG_and_match_exact_source_bytes", observedAssetLocks.every((lock) => isFrozenSha256(lock.sha256)
  && lock.sha256 === targetShaByGraphNode.get(lock.target))
  && resolvedPathAssetLocks.every((lock) => lock.bounded && lock.resolved === targetFileByGraphNode.get(lock.target)), observedAssetLocks);

const observedProjectionDigest = {
  source: projectionDigestDefinition.source,
  pointer: toJsonPointer(projectionDigestDefinition.sha_trail),
  sha256: valueAtTrail(projectionDigestDefinition.root, projectionDigestDefinition.sha_trail),
  target_ref: "canonical://fixture_index/contract_projection_sha256",
  is_file_edge: false,
  is_asset_lock: false,
};
const observedProjectionDigests = [observedProjectionDigest];
const projectionDigestKeyOccurrences = importPlanText.match(/"contract_projection_sha256"\s*:/g)?.length ?? 0;
assertInGroup("reference_graph", "contract_projection_digest_is_one_exact_non_file_non_asset_slot", projectionDigestKeyOccurrences === 1
  && observedProjectionDigest.pointer === "/contract_sources/canonical_manifest/contract_projection_sha256"
  && isFrozenSha256(observedProjectionDigest.sha256)
  && observedProjectionDigest.sha256 === projectionDigestDefinition.expected_sha256
  && observedProjectionDigest.is_file_edge === false
  && observedProjectionDigest.is_asset_lock === false, {
  occurrences: projectionDigestKeyOccurrences,
  observed: observedProjectionDigest,
  expected_sha256: projectionDigestDefinition.expected_sha256,
});

const expectedNonHashLocators = [
  {
    source: "build",
    target: "evidence",
    path: "../evidence/on-site-evidence-template.json",
    pointer: "/evidence_template/path",
    trail: "evidence_template.path",
    reference_kind: "non_hash_locator",
    excluded_from_freeze_graph: true,
  },
  {
    source: "evidence",
    target: "logical",
    path: "../manifests/neoloop-logical-manifest.v0.1.json",
    pointer: "/source_manifest",
    trail: "source_manifest",
    reference_kind: null,
    excluded_from_freeze_graph: null,
  },
];
const freezeDagNodes = new Set([
  "r10_core",
  "r10_test",
  "r10_record",
  "logical",
  "build",
  "probe",
  "import",
  "smoke",
  "evidence",
]);
const freezeDagTargetByPath = new Map([...graphTargetByPath].filter(([, target]) => freezeDagNodes.has(target)));
const structuredJsonArtifactByNode = new Map([
  ["logical", { value: t2, raw: t2ManifestText, file: paths.t2Manifest }],
  ["build", { value: buildPackage, raw: buildPackageText, file: paths.buildPackage }],
  ["probe", { value: probeSuite, raw: probeSuiteText, file: paths.probeSuite }],
  ["import", { value: importPlan, raw: importPlanText, file: paths.importPlan }],
  ["smoke", { value: smokePlan, raw: smokePlanText, file: paths.smokePlan }],
  ["evidence", { value: evidenceTemplate, raw: evidenceTemplateText, file: paths.evidenceTemplate }],
]);
const literalReferenceClosureAnalysis = analyzeLiteralReferenceClosures(structuredJsonArtifactByNode);
assertInGroup("literal_reference_closures", "all_literal_reference_candidates_are_classified_without_invalid_baseline_values", literalReferenceClosureAnalysis.invalid_references.length === 0, literalReferenceClosureAnalysis.invalid_references);
for (const closureName of ["external_repository_files", "internal_JSON_Pointers", "known_scheme_locators"]) {
  const closure = literalReferenceClosureAnalysis[closureName];
  assertInGroup("literal_reference_closures", `${closureName}_match_literal_count_and_digest_oracle`, closure.exact
    && closure.count === EXPECTED_REFERENCE_CLOSURES[closureName].count
    && closure.digest === EXPECTED_REFERENCE_CLOSURES[closureName].digest, closure);
}
const baselineSchemePrefixScalars = [...structuredJsonArtifactByNode].flatMap(([source, artifact]) => collectJsonFindings(
  artifact.value,
  (current, trail) => typeof current === "string" && URI_SCHEME_PREFIX.test(current.trim())
    ? {
      source,
      pointer: toJsonPointer(trail),
      value: current,
      classification: classifyRepositoryFileReference(current, artifact.file),
    }
    : null,
));
const baselineNonCanonicalSchemePrefixScalars = baselineSchemePrefixScalars.filter(({ classification }) => classification.kind !== "known_non_file_locator");
assertInGroup("literal_reference_closures", "baseline_scheme_prefix_scalars_are_exactly_the_568_known_scheme_locators_with_no_natural_text_exception", baselineSchemePrefixScalars.length === EXPECTED_REFERENCE_CLOSURES.known_scheme_locators.count
  && baselineNonCanonicalSchemePrefixScalars.length === 0, {
  scheme_prefix_scalar_count: baselineSchemePrefixScalars.length,
  noncanonical_scheme_prefix_scalars: baselineNonCanonicalSchemePrefixScalars,
});
const EXPECTED_EVIDENCE_TABLE_KEYS = Object.freeze([
  "T01",
  "T02",
  "T03",
  "T04",
  "T05",
  "T06",
  "T07",
  "T08",
  "T09",
  "T10",
]);
const EXPECTED_IMPORT_TABLE_EVIDENCE_INDEXES = Object.freeze([5, 7, 8, 6, 1, 0, 2, 3, 4, 9]);
const EXPECTED_IMPORT_EVIDENCE_FRAGMENT_LOCATOR = "../evidence/on-site-evidence-template.json";
const expectedImportEvidenceFragmentReferences = Object.freeze([
  ...Array.from({ length: 10 }, (_, tableIndex) => ({
    source: "import",
    pointer: `/preflight/evidence_unit_refs/${tableIndex}`,
    value: `${EXPECTED_IMPORT_EVIDENCE_FRAGMENT_LOCATOR}#/tables/${tableIndex}`,
    resolved_target: "evidence",
    table_index: tableIndex,
    evidence_key: EXPECTED_EVIDENCE_TABLE_KEYS[tableIndex],
  })),
  ...EXPECTED_IMPORT_TABLE_EVIDENCE_INDEXES.map((tableIndex, batchIndex) => ({
    source: "import",
    pointer: `/table_batches/${batchIndex}/evidence_unit_ref`,
    value: `${EXPECTED_IMPORT_EVIDENCE_FRAGMENT_LOCATOR}#/tables/${tableIndex}`,
    resolved_target: "evidence",
    table_index: tableIndex,
    evidence_key: EXPECTED_EVIDENCE_TABLE_KEYS[tableIndex],
  })),
  {
    source: "import",
    pointer: "/relation_backfills/0/evidence_unit_ref",
    value: `${EXPECTED_IMPORT_EVIDENCE_FRAGMENT_LOCATOR}#/tables/1`,
    resolved_target: "evidence",
    table_index: 1,
    evidence_key: "T02",
  },
  ...Array.from({ length: 10 }, (_, tableIndex) => ({
    source: "import",
    pointer: `/final_verification/evidence_unit_refs/${tableIndex}`,
    value: `${EXPECTED_IMPORT_EVIDENCE_FRAGMENT_LOCATOR}#/tables/${tableIndex}`,
    resolved_target: "evidence",
    table_index: tableIndex,
    evidence_key: EXPECTED_EVIDENCE_TABLE_KEYS[tableIndex],
  })),
]);
const fragmentReferenceComparable = (reference) => JSON.stringify({
  source: reference.source,
  pointer: reference.pointer,
  value: reference.value,
  resolved_target: reference.resolved_target,
});
const expectedImportEvidenceFragmentReferenceByKey = new Map(expectedImportEvidenceFragmentReferences.map((reference) => [
  fragmentReferenceComparable(reference),
  reference,
]));
function analyzeStructuredJsonFragmentReferences(artifactByNode) {
  const references = [...artifactByNode].flatMap(([source, artifact]) => collectStructuredJsonFragmentReferences(
    artifact.value,
    artifact.file,
    source,
    graphTargetByPath,
  ));
  const observedKeys = references.map(fragmentReferenceComparable);
  const expectedKeys = expectedImportEvidenceFragmentReferences.map(fragmentReferenceComparable);
  const observedKeySet = new Set(observedKeys);
  const unexpected = references.filter((reference) => !expectedImportEvidenceFragmentReferenceByKey.has(fragmentReferenceComparable(reference)));
  const missing = expectedImportEvidenceFragmentReferences.filter((reference) => !observedKeySet.has(fragmentReferenceComparable(reference)));
  const evidenceDocument = artifactByNode.get("evidence")?.value;
  const allowedBindings = references.flatMap((reference) => {
    const expected = expectedImportEvidenceFragmentReferenceByKey.get(fragmentReferenceComparable(reference));
    if (!expected) return [];
    const resolution = resolveJsonPointerFragment(evidenceDocument, reference.fragment);
    return [{
      ...reference,
      table_index: expected.table_index,
      evidence_key: expected.evidence_key,
      reference_kind: "import_evidence_business_locator",
      excluded_from_freeze_DAG: true,
      fragment_valid: resolution.valid,
      fragment_reason: resolution.reason ?? null,
      fragment_tokens: resolution.tokens ?? null,
      target_exists: resolution.valid
        && resolution.value === evidenceDocument?.tables?.[expected.table_index]
        && resolution.value?.key === expected.evidence_key,
    }];
  });
  return {
    references,
    allowed_bindings: allowedBindings,
    unexpected,
    missing,
    exact: equalArrays(sorted(observedKeys), sorted(expectedKeys)),
  };
}
const expectedFreezeJsonReferences = freezeEdgeDefinitions.map((definition) => ({
  source: definition.source,
  target: definition.target,
  path: definition.expected_path,
  pointer: toJsonPointer(definition.path_trail),
}));
const structuredReferenceComparable = (reference) => JSON.stringify({
  source: reference.source,
  target: reference.target,
  path: reference.path,
  pointer: reference.pointer,
});
const expectedFreezeJsonReferenceKeys = new Set(expectedFreezeJsonReferences.map(structuredReferenceComparable));
const expectedNonHashReferenceKeys = new Set(expectedNonHashLocators.map(structuredReferenceComparable));
function analyzeStructuredJsonReferenceGraph(artifactByNode) {
  const references = [...artifactByNode].flatMap(([source, artifact]) => collectStructuredJsonFileReferences(
    artifact.value,
    artifact.file,
    source,
    freezeDagTargetByPath,
  ));
  const invalidReferences = [...artifactByNode].flatMap(([source, artifact]) => collectInvalidRepositoryFileReferences(
    artifact.value,
    artifact.file,
    source,
  ));
  const fragmentReferenceAnalysis = analyzeStructuredJsonFragmentReferences(artifactByNode);
  const nonHashLocatorsExcludedFromDag = references.filter((reference) => expectedNonHashReferenceKeys.has(structuredReferenceComparable(reference)));
  const ordinaryFreezeDagEdges = references.filter((reference) => !expectedNonHashReferenceKeys.has(structuredReferenceComparable(reference)));
  const ordinaryUnexpectedEdges = ordinaryFreezeDagEdges.filter((reference) => !expectedFreezeJsonReferenceKeys.has(structuredReferenceComparable(reference)));
  const unexpectedFragmentEdges = fragmentReferenceAnalysis.unexpected.flatMap((reference) => reference.resolved_target !== null
    && freezeDagNodes.has(reference.resolved_target)
    ? [{
      source: reference.source,
      target: reference.resolved_target,
      path: reference.value,
      pointer: reference.pointer,
      reference_kind: "unexpected_fragment_reference",
    }]
    : []);
  const freezeDagEdges = [...ordinaryFreezeDagEdges, ...unexpectedFragmentEdges];
  const unexpectedEdges = [...ordinaryUnexpectedEdges, ...unexpectedFragmentEdges];
  return {
    references,
    invalid_references: invalidReferences,
    fragment_reference_analysis: fragmentReferenceAnalysis,
    nonHashLocatorsExcludedFromDag,
    freezeDagEdges,
    unexpectedEdges,
    hasCycle: hasDirectedCycle(freezeDagEdges),
  };
}
const structuredJsonReferenceAnalysis = analyzeStructuredJsonReferenceGraph(structuredJsonArtifactByNode);
const structuredJsonFragmentReferenceAnalysis = structuredJsonReferenceAnalysis.fragment_reference_analysis;
assertInGroup("reference_graph", "external_repository_file_references_are_strict_and_repository_bounded", structuredJsonReferenceAnalysis.invalid_references.length === 0, structuredJsonReferenceAnalysis.invalid_references);
assertInGroup("reference_graph", "actual_JSON_references_are_exactly_nine_freeze_edges_plus_two_non_hash_locators", equalArrays(
  sorted(structuredJsonReferenceAnalysis.references.map(structuredReferenceComparable)),
  sorted([...expectedFreezeJsonReferences, ...expectedNonHashLocators].map(structuredReferenceComparable)),
), structuredJsonReferenceAnalysis.references);
assertInGroup("reference_graph", "two_exact_non_hash_locators_are_excluded_from_freeze_DAG", structuredJsonReferenceAnalysis.nonHashLocatorsExcludedFromDag.length === 2
  && structuredJsonReferenceAnalysis.freezeDagEdges.every((edge) => !expectedNonHashReferenceKeys.has(structuredReferenceComparable(edge))), structuredJsonReferenceAnalysis);
assertInGroup("reference_graph", "import_evidence_fragment_reference_oracle_is_exact_31", expectedImportEvidenceFragmentReferences.length === 31
  && structuredJsonFragmentReferenceAnalysis.references.length === 31
  && structuredJsonFragmentReferenceAnalysis.exact
  && structuredJsonFragmentReferenceAnalysis.unexpected.length === 0
  && structuredJsonFragmentReferenceAnalysis.missing.length === 0, structuredJsonFragmentReferenceAnalysis);
assertInGroup("reference_graph", "import_evidence_fragments_are_bounded_valid_JSON_Pointers_to_existing_tables_0_through_9", structuredJsonFragmentReferenceAnalysis.allowed_bindings.length === 31
  && structuredJsonFragmentReferenceAnalysis.allowed_bindings.every((binding) => binding.bounded
    && binding.resolved_target === "evidence"
    && binding.reference_kind === "import_evidence_business_locator"
    && binding.excluded_from_freeze_DAG === true
    && binding.fragment_valid
    && equalArrays(binding.fragment_tokens, ["tables", String(binding.table_index)])
    && binding.target_exists), structuredJsonFragmentReferenceAnalysis.allowed_bindings);

const downstreamArtifactTargets = new Map([
  [paths.buildPackage, "build"],
  [paths.probeSuite, "probe"],
  [paths.importPlan, "import"],
  [paths.smokePlan, "smoke"],
  [paths.evidenceTemplate, "evidence"],
]);
const typescriptModuleBackReferences = [
  ["r10_core", paths.r10Core, r10Core],
  ["r10_test", paths.r10Test, r10Test],
].flatMap(([source, sourceFile, contents]) => extractModuleSpecifiers(contents).flatMap((specifier) => {
  if (!specifier.startsWith(".")) return [];
  const resolution = resolveRepoReference(sourceFile, specifier);
  const target = downstreamArtifactTargets.get(resolution.resolved);
  return target ? [{ source, target, specifier }] : [];
}));
const markdownBackReferences = r10Record.split(/\r?\n/).flatMap((line, lineIndex) => {
  const match = line.match(CANONICAL_MARKDOWN_SHA_DECLARATION);
  if (!match) return [];
  const resolved = path.resolve(repositoryRoot, match[1]);
  const target = downstreamArtifactTargets.get(resolved);
  return target ? [{ source: "r10_record", target, path: match[1], line_number: lineIndex + 1 }] : [];
});
const structuredUpstreamBackReferences = [
  ...structuredJsonReferenceAnalysis.unexpectedEdges,
  ...typescriptModuleBackReferences,
  ...markdownBackReferences,
];
const actualStructuredReferenceGraphEdges = [
  ...structuredJsonReferenceAnalysis.freezeDagEdges,
  ...typescriptModuleBackReferences,
  ...markdownBackReferences,
];
assertInGroup("reference_graph", "structured_upstream_back_references_are_zero", structuredUpstreamBackReferences.length === 0, structuredUpstreamBackReferences);
assertInGroup("reference_graph", "actual_structured_reference_graph_has_no_cycle", !hasDirectedCycle(actualStructuredReferenceGraphEdges), actualStructuredReferenceGraphEdges);

function cloneStructuredJsonArtifacts() {
  return new Map([...structuredJsonArtifactByNode].map(([source, artifact]) => [source, {
    ...artifact,
    value: JSON.parse(artifact.raw),
  }]));
}

const literalReferenceClosureNegativeFixtureResults = [];
const LITERAL_REFERENCE_CLOSURE_NAMES = ["external_repository_files", "internal_JSON_Pointers", "known_scheme_locators"];
function assertLiteralClosureMutationRejected(name, closureName, mutate, verify) {
  const artifacts = cloneStructuredJsonArtifacts();
  const cleanBaseline = analyzeLiteralReferenceClosures(artifacts);
  mutate(artifacts);
  const analysis = analyzeLiteralReferenceClosures(artifacts);
  const closure = analysis[closureName];
  const cleanBaselineExact = LITERAL_REFERENCE_CLOSURE_NAMES.every((currentName) => cleanBaseline[currentName].exact)
    && cleanBaseline.invalid_references.length === 0;
  const unrelatedClosuresExact = LITERAL_REFERENCE_CLOSURE_NAMES.filter((currentName) => currentName !== closureName)
    .every((currentName) => analysis[currentName].exact);
  const rejected = cleanBaselineExact
    && !closure.exact
    && verify(closure, analysis)
    && unrelatedClosuresExact
    && analysis.invalid_references.length === 0;
  literalReferenceClosureNegativeFixtureResults.push({
    name,
    closure: closureName,
    rejected,
    clean_baseline_exact: cleanBaselineExact,
    unrelated_closures_exact: unrelatedClosuresExact,
    observed_count: closure.count,
    observed_digest: closure.digest,
    invalid_reference_count: analysis.invalid_references.length,
  });
  assertInGroup("literal_reference_closure_fail_closed", name, rejected, {
    closure,
    invalid_references: analysis.invalid_references,
  });
}

function assertInvalidLiteralReferenceRejected(name, mutate, expected) {
  const artifacts = cloneStructuredJsonArtifacts();
  const cleanBaseline = analyzeLiteralReferenceClosures(artifacts);
  mutate(artifacts);
  const analysis = analyzeLiteralReferenceClosures(artifacts);
  const matching = analysis.invalid_references.filter((reference) => reference.source === expected.source
    && reference.pointer === expected.pointer
    && reference.value === expected.value
    && reference.reason === expected.reason);
  let isolatedResolverCalls = 0;
  const isolatedClassification = classifyRepositoryFileReference(
    expected.value,
    artifacts.get(expected.source).file,
    (...arguments_) => {
      isolatedResolverCalls += 1;
      return resolveRepoReference(...arguments_);
    },
  );
  const cleanBaselineExact = LITERAL_REFERENCE_CLOSURE_NAMES.every((closureName) => cleanBaseline[closureName].exact)
    && cleanBaseline.invalid_references.length === 0;
  const allClosuresExact = LITERAL_REFERENCE_CLOSURE_NAMES.every((closureName) => analysis[closureName].exact);
  const rejected = cleanBaselineExact
    && matching.length === 1
    && analysis.invalid_references.length === 1
    && allClosuresExact
    && isolatedResolverCalls === 0;
  const result = {
    name,
    closure: "invalid_reference",
    rejected,
    expected,
    clean_baseline_exact: cleanBaselineExact,
    all_closures_exact: allClosuresExact,
    observed_invalid_reference_count: analysis.invalid_references.length,
    matching_invalid_reference_count: matching.length,
    isolated_resolver_calls: isolatedResolverCalls,
    isolated_classification: isolatedClassification,
  };
  literalReferenceClosureNegativeFixtureResults.push(result);
  assertInGroup("literal_reference_closure_fail_closed", name, rejected, { result, invalid_references: analysis.invalid_references });
  return result;
}

assertLiteralClosureMutationRejected("external_reference_closure_rejects_add", "external_repository_files", (artifacts) => {
  artifacts.get("build").value.extra_repository_file_reference = "./unknown.json";
}, (closure) => closure.count === EXPECTED_REFERENCE_CLOSURES.external_repository_files.count + 1);

assertLiteralClosureMutationRejected("external_reference_closure_rejects_delete", "external_repository_files", (artifacts) => {
  delete artifacts.get("build").value.rollback_runbook;
}, (closure) => closure.count === EXPECTED_REFERENCE_CLOSURES.external_repository_files.count - 1);

assertLiteralClosureMutationRejected("external_reference_closure_rejects_move", "external_repository_files", (artifacts) => {
  const build = artifacts.get("build").value;
  build.moved_rollback_runbook = build.rollback_runbook;
  delete build.rollback_runbook;
}, (closure) => closure.count === EXPECTED_REFERENCE_CLOSURES.external_repository_files.count);

assertLiteralClosureMutationRejected("external_reference_closure_rejects_retarget", "external_repository_files", (artifacts) => {
  artifacts.get("build").value.rollback_runbook = "../../README.md";
}, (closure) => closure.count === EXPECTED_REFERENCE_CLOSURES.external_repository_files.count);

assertLiteralClosureMutationRejected("external_reference_closure_rejects_bare_unknown_file", "external_repository_files", (artifacts) => {
  artifacts.get("build").value.extra_bare_repository_file_reference = "unknown.json";
}, (closure) => closure.count === EXPECTED_REFERENCE_CLOSURES.external_repository_files.count + 1);

assertLiteralClosureMutationRejected("external_reference_closure_rejects_synonymous_path_spelling", "external_repository_files", (artifacts) => {
  artifacts.get("build").value.source_of_truth.path = "neoloop-logical-manifest.v0.1.json";
}, (closure) => closure.count === EXPECTED_REFERENCE_CLOSURES.external_repository_files.count);

assertLiteralClosureMutationRejected("internal_JSON_Pointer_closure_rejects_add", "internal_JSON_Pointers", (artifacts) => {
  artifacts.get("build").value.extra_internal_pointer = "#/ai_runtime_policy/schema_repair";
}, (closure) => closure.count === EXPECTED_REFERENCE_CLOSURES.internal_JSON_Pointers.count + 1);

assertLiteralClosureMutationRejected("internal_JSON_Pointer_closure_rejects_delete", "internal_JSON_Pointers", (artifacts) => {
  delete artifacts.get("build").value.ai_nodes[0].schema_repair_policy_ref;
}, (closure) => closure.count === EXPECTED_REFERENCE_CLOSURES.internal_JSON_Pointers.count - 1);

assertLiteralClosureMutationRejected("internal_JSON_Pointer_closure_rejects_move", "internal_JSON_Pointers", (artifacts) => {
  const node = artifacts.get("build").value.ai_nodes[0];
  node.moved_schema_repair_policy_ref = node.schema_repair_policy_ref;
  delete node.schema_repair_policy_ref;
}, (closure) => closure.count === EXPECTED_REFERENCE_CLOSURES.internal_JSON_Pointers.count);

assertLiteralClosureMutationRejected("internal_JSON_Pointer_closure_rejects_retarget", "internal_JSON_Pointers", (artifacts) => {
  artifacts.get("build").value.ai_nodes[0].schema_repair_policy_ref = "#/ai_runtime_policy/human_fallback";
}, (closure) => closure.count === EXPECTED_REFERENCE_CLOSURES.internal_JSON_Pointers.count);

assertLiteralClosureMutationRejected("known_scheme_locator_closure_rejects_add", "known_scheme_locators", (artifacts) => {
  artifacts.get("logical").value.extra_known_scheme_locator = "logical://tables/clusters";
}, (closure) => closure.count === EXPECTED_REFERENCE_CLOSURES.known_scheme_locators.count + 1);

assertLiteralClosureMutationRejected("known_scheme_locator_closure_rejects_delete", "known_scheme_locators", (artifacts) => {
  delete artifacts.get("logical").value.workflows[5].reopen_projection_contract.raw_recurrence_visibility_ref;
}, (closure) => closure.count === EXPECTED_REFERENCE_CLOSURES.known_scheme_locators.count - 1);

assertLiteralClosureMutationRejected("known_scheme_locator_closure_rejects_move", "known_scheme_locators", (artifacts) => {
  const contract = artifacts.get("logical").value.workflows[5].reopen_projection_contract;
  contract.moved_raw_recurrence_visibility_ref = contract.raw_recurrence_visibility_ref;
  delete contract.raw_recurrence_visibility_ref;
}, (closure) => closure.count === EXPECTED_REFERENCE_CLOSURES.known_scheme_locators.count);

assertLiteralClosureMutationRejected("known_scheme_locator_closure_rejects_retarget", "known_scheme_locators", (artifacts) => {
  artifacts.get("logical").value.workflows[5].reopen_projection_contract.raw_recurrence_visibility_ref = "runtime://W6/observation_cycle";
}, (closure) => closure.count === EXPECTED_REFERENCE_CLOSURES.known_scheme_locators.count);

for (const fixture of [
  { id: "missing_target", value: "#/definitely_missing", reason: "internal_JSON_Pointer_target_missing" },
  { id: "invalid_escape", value: "#/x/~2", reason: "invalid_internal_JSON_Pointer_escape" },
  { id: "multiple_hash_markers", value: "#/ai_runtime_policy/schema_repair#extra", reason: "internal_pointer_has_multiple_hash_markers" },
  { id: "percent_alias", value: "#/%ZZ", reason: "internal_pointer_percent_encoding_not_allowed" },
]) {
  assertInvalidLiteralReferenceRejected(`internal_JSON_Pointer_rejects_${fixture.id}`, (artifacts) => {
    artifacts.get("build").value.invalid_internal_pointer_probe = fixture.value;
  }, {
    source: "build",
    pointer: "/invalid_internal_pointer_probe",
    value: fixture.value,
    reason: fixture.reason,
  });
}

assertInvalidLiteralReferenceRejected("internal_JSON_Pointer_resolution_requires_own_properties", (artifacts) => {
  const build = artifacts.get("build").value;
  Object.setPrototypeOf(build, { inherited_target: { forbidden: true } });
  build.inherited_internal_pointer_probe = "#/inherited_target";
}, {
  source: "build",
  pointer: "/inherited_internal_pointer_probe",
  value: "#/inherited_target",
  reason: "internal_JSON_Pointer_target_missing",
});

const c9IncrementalFixtureResults = {
  encoded_internal_JSON_Pointer_prefixes: [],
  malformed_percent_after_supported_extension: [],
  raw_slash_after_supported_extension: [],
  valid_nested_repository_reference: [],
  resolver_boundaries: [],
};

function assertC9InvalidLiteralFixture(category, fixture) {
  const pointer = `/c9_${category}_probe`;
  const result = assertInvalidLiteralReferenceRejected(`C9_${category}_rejects_${fixture.id}`, (artifacts) => {
    artifacts.get("build").value[`c9_${category}_probe`] = fixture.value;
  }, {
    source: "build",
    pointer,
    value: fixture.value,
    reason: fixture.reason,
  });
  c9IncrementalFixtureResults[category].push({
    id: fixture.id,
    value: fixture.value,
    expected_reason: fixture.reason,
    passed: result.rejected,
    invalid_reference_count: result.observed_invalid_reference_count,
    all_closures_exact: result.all_closures_exact,
    resolver_calls: result.isolated_resolver_calls,
    classification: result.isolated_classification,
  });
}

for (const fixture of [
  { id: "single_all_encoded", value: "%23%2Fai_runtime_policy/schema_repair" },
  { id: "double_all_encoded", value: "%2523%252Fai_runtime_policy/schema_repair" },
  { id: "single_hash_only", value: "%23/ai_runtime_policy/schema_repair" },
  { id: "single_slash_only", value: "#%2Fai_runtime_policy/schema_repair" },
  { id: "double_hash_only", value: "%2523/ai_runtime_policy/schema_repair" },
  { id: "double_slash_only", value: "#%252Fai_runtime_policy/schema_repair" },
  { id: "mixed_single_hash_double_slash", value: "%23%252Fai_runtime_policy/schema_repair" },
  { id: "mixed_double_hash_single_slash", value: "%2523%2Fai_runtime_policy/schema_repair" },
]) {
  assertC9InvalidLiteralFixture("encoded_internal_JSON_Pointer_prefixes", {
    ...fixture,
    reason: "percent_encoded_reference_alias_not_allowed",
  });
}
assertInGroup("literal_reference_closure_fail_closed", "C9_encoded_internal_JSON_Pointer_prefixes_fail_before_pointer_or_path_resolution", c9IncrementalFixtureResults.encoded_internal_JSON_Pointer_prefixes.length === 8
  && c9IncrementalFixtureResults.encoded_internal_JSON_Pointer_prefixes.every((fixture) => fixture.passed
    && fixture.invalid_reference_count === 1
    && fixture.all_closures_exact
    && fixture.resolver_calls === 0
    && fixture.classification.kind === "invalid_repository_file_reference"
    && fixture.classification.details?.revealed_kind === "internal_JSON_Pointer_prefix"), c9IncrementalFixtureResults.encoded_internal_JSON_Pointer_prefixes);

for (const extension of ["json", "md", "mjs", "ts"]) {
  for (const suffix of [
    { id: "invalid_percent", value: "%ZZ" },
    { id: "isolated_percent", value: "%" },
    { id: "incomplete_percent", value: "%2" },
  ]) {
    assertC9InvalidLiteralFixture("malformed_percent_after_supported_extension", {
      id: `${extension}_${suffix.id}`,
      value: `unknown.${extension}${suffix.value}`,
      reason: "invalid_locator_percent_encoding",
    });
  }
}
assertInGroup("literal_reference_closure_fail_closed", "C9_malformed_percent_after_supported_extensions_isolated_fail_closed", c9IncrementalFixtureResults.malformed_percent_after_supported_extension.length === 12
  && c9IncrementalFixtureResults.malformed_percent_after_supported_extension.every((fixture) => fixture.passed
    && fixture.invalid_reference_count === 1
    && fixture.all_closures_exact
    && fixture.resolver_calls === 0
    && fixture.classification.kind === "invalid_repository_file_reference"
    && fixture.classification.reason === "invalid_locator_percent_encoding"), c9IncrementalFixtureResults.malformed_percent_after_supported_extension);

for (const extension of ["json", "md", "mjs", "ts"]) {
  assertC9InvalidLiteralFixture("raw_slash_after_supported_extension", {
    id: `${extension}_followed_by_path_segment`,
    value: `unknown.${extension}/x`,
    reason: "non_canonical_file_extension",
  });
}
assertInGroup("literal_reference_closure_fail_closed", "C9_supported_extension_followed_by_raw_path_segment_isolated_fail_closed", c9IncrementalFixtureResults.raw_slash_after_supported_extension.length === 4
  && c9IncrementalFixtureResults.raw_slash_after_supported_extension.every((fixture) => fixture.passed
    && fixture.invalid_reference_count === 1
    && fixture.all_closures_exact
    && fixture.resolver_calls === 0
    && fixture.classification.kind === "invalid_repository_file_reference"
    && fixture.classification.reason === "non_canonical_file_extension"), c9IncrementalFixtureResults.raw_slash_after_supported_extension);

const nestedRepositoryReferenceArtifacts = cloneStructuredJsonArtifacts();
const nestedRepositoryReferenceCleanBaseline = analyzeLiteralReferenceClosures(nestedRepositoryReferenceArtifacts);
nestedRepositoryReferenceArtifacts.get("build").value.c9_valid_nested_repository_reference = "nested/unknown.json";
const nestedRepositoryReferenceAnalysis = analyzeLiteralReferenceClosures(nestedRepositoryReferenceArtifacts);
let nestedRepositoryReferenceResolverCalls = 0;
const nestedRepositoryReferenceClassification = classifyRepositoryFileReference(
  "nested/unknown.json",
  paths.buildPackage,
  (...arguments_) => {
    nestedRepositoryReferenceResolverCalls += 1;
    return resolveRepoReference(...arguments_);
  },
);
const nestedRepositoryReferenceFixtureResult = {
  id: "nested_directory_then_supported_file",
  value: "nested/unknown.json",
  passed: LITERAL_REFERENCE_CLOSURE_NAMES.every((closureName) => nestedRepositoryReferenceCleanBaseline[closureName].exact)
    && nestedRepositoryReferenceCleanBaseline.invalid_references.length === 0
    && nestedRepositoryReferenceAnalysis.external_repository_files.count === EXPECTED_REFERENCE_CLOSURES.external_repository_files.count + 1
    && nestedRepositoryReferenceAnalysis.external_repository_files.exact === false
    && nestedRepositoryReferenceAnalysis.internal_JSON_Pointers.exact
    && nestedRepositoryReferenceAnalysis.known_scheme_locators.exact
    && nestedRepositoryReferenceAnalysis.invalid_references.length === 0
    && nestedRepositoryReferenceClassification.kind === "repository_file_reference"
    && nestedRepositoryReferenceClassification.bounded
    && nestedRepositoryReferenceResolverCalls === 1,
  resolver_calls: nestedRepositoryReferenceResolverCalls,
  classification: nestedRepositoryReferenceClassification,
  external_closure: nestedRepositoryReferenceAnalysis.external_repository_files,
  unrelated_closures_exact: nestedRepositoryReferenceAnalysis.internal_JSON_Pointers.exact
    && nestedRepositoryReferenceAnalysis.known_scheme_locators.exact,
  invalid_reference_count: nestedRepositoryReferenceAnalysis.invalid_references.length,
};
c9IncrementalFixtureResults.valid_nested_repository_reference.push(nestedRepositoryReferenceFixtureResult);
assertInGroup("literal_reference_closure_fail_closed", "C9_nested_directory_supported_file_remains_a_valid_external_reference", nestedRepositoryReferenceFixtureResult.passed, nestedRepositoryReferenceFixtureResult);

const c10IncrementalFixtureResults = {
  encoded_hash_candidates: [],
  raw_hash_controls: [],
  trailing_file_like_suffixes: [],
  valid_external_references: [],
  ordinary_text_controls: [],
  resolver_boundaries: [],
};

function c10FixturePropertyKey(category, id) {
  return `c10_${category}_${id}`.replaceAll(/[^A-Za-z0-9_]/g, "_");
}

function assertC10InvalidLiteralFixture(category, fixture) {
  const propertyKey = c10FixturePropertyKey(category, fixture.id);
  const pointer = toJsonPointer([propertyKey]);
  const result = assertInvalidLiteralReferenceRejected(`C10_${category}_rejects_${fixture.id}`, (artifacts) => {
    artifacts.get("build").value[propertyKey] = fixture.value;
  }, {
    source: "build",
    pointer,
    value: fixture.value,
    reason: fixture.reason,
  });
  const structuredResult = {
    id: fixture.id,
    value: fixture.value,
    expected_reason: fixture.reason,
    passed: result.rejected,
    invalid_reference_count: result.observed_invalid_reference_count,
    all_closures_exact: result.all_closures_exact,
    resolver_calls: result.isolated_resolver_calls,
    classification: result.isolated_classification,
  };
  c10IncrementalFixtureResults[category].push(structuredResult);
  return structuredResult;
}

const c10EncodedHashCandidateFixtures = [
  { id: "single_empty_root", value: "%23" },
  { id: "double_empty_root", value: "%2523" },
  { id: "single_ordinary_suffix", value: "%23ordinary" },
  { id: "double_ordinary_suffix", value: "%2523ordinary" },
  { id: "single_invalid_percent_suffix", value: "%23%ZZ" },
  { id: "double_invalid_percent_suffix", value: "%2523%25ZZ" },
  { id: "single_isolated_percent_suffix", value: "%23%" },
  { id: "double_isolated_percent_suffix", value: "%2523%25" },
  { id: "single_incomplete_percent_suffix", value: "%23%2" },
  { id: "double_incomplete_percent_suffix", value: "%2523%252" },
];
for (const fixture of c10EncodedHashCandidateFixtures) {
  assertC10InvalidLiteralFixture("encoded_hash_candidates", {
    ...fixture,
    reason: "percent_encoded_reference_alias_not_allowed",
  });
}
assertInGroup("literal_reference_closure_fail_closed", "C10_encoded_values_revealing_any_hash_prefix_are_unique_invalid_aliases", c10IncrementalFixtureResults.encoded_hash_candidates.length === 10
  && c10IncrementalFixtureResults.encoded_hash_candidates.every((fixture) => fixture.passed
    && fixture.invalid_reference_count === 1
    && fixture.all_closures_exact
    && fixture.resolver_calls === 0
    && fixture.classification.kind === "invalid_repository_file_reference"
    && fixture.classification.reason === "percent_encoded_reference_alias_not_allowed"
    && fixture.classification.details?.revealed_kind === "internal_JSON_Pointer_prefix"), c10IncrementalFixtureResults.encoded_hash_candidates);

for (const fixture of [
  { id: "empty_root", value: "#" },
  { id: "ordinary_suffix", value: "#ordinary" },
  { id: "invalid_percent_suffix", value: "#%ZZ" },
  { id: "isolated_percent_suffix", value: "#%" },
  { id: "incomplete_percent_suffix", value: "#%2" },
]) {
  assertC10InvalidLiteralFixture("raw_hash_controls", {
    ...fixture,
    reason: "internal_pointer_requires_hash_slash",
  });
}
assertInGroup("literal_reference_closure_fail_closed", "C10_raw_hash_candidates_remain_internal_pointers_and_fail_explicitly", c10IncrementalFixtureResults.raw_hash_controls.length === 5
  && c10IncrementalFixtureResults.raw_hash_controls.every((fixture) => fixture.passed
    && fixture.invalid_reference_count === 1
    && fixture.all_closures_exact
    && fixture.resolver_calls === 0
    && fixture.classification.kind === "internal_JSON_Pointer"), c10IncrementalFixtureResults.raw_hash_controls);

const c10TrailingSuffixes = [
  { id: "space", value: " " },
  { id: "tab", value: "\t" },
  { id: "colon", value: ":x" },
  { id: "wildcard", value: "*" },
  { id: "query", value: "?x" },
  { id: "exclamation", value: "!" },
  { id: "comma", value: "," },
  { id: "semicolon", value: ";" },
  { id: "NBSP", value: "\u00A0" },
  { id: "raw_path_segment", value: "/x" },
];
for (const extension of ["json", "md", "mjs", "ts"]) {
  for (const location of [
    { id: "bare", prefix: "" },
    { id: "nested", prefix: "nested/" },
  ]) {
    for (const suffix of c10TrailingSuffixes) {
      assertC10InvalidLiteralFixture("trailing_file_like_suffixes", {
        id: `${location.id}_${extension}_${suffix.id}`,
        value: `${location.prefix}unknown.${extension}${suffix.value}`,
        reason: "non_canonical_file_extension",
      });
    }
  }
}
assertInGroup("literal_reference_closure_fail_closed", "C10_80_ASCII_path_prefix_tail_mutations_are_isolated_noncanonical_file_references", c10IncrementalFixtureResults.trailing_file_like_suffixes.length === 80
  && c10IncrementalFixtureResults.trailing_file_like_suffixes.every((fixture) => fixture.passed
    && fixture.invalid_reference_count === 1
    && fixture.all_closures_exact
    && fixture.resolver_calls === 0
    && fixture.classification.kind === "invalid_repository_file_reference"
    && fixture.classification.reason === "non_canonical_file_extension"), c10IncrementalFixtureResults.trailing_file_like_suffixes);

function assertC10ValidExternalReference(fixture) {
  const artifacts = cloneStructuredJsonArtifacts();
  const cleanBaseline = analyzeLiteralReferenceClosures(artifacts);
  const propertyKey = c10FixturePropertyKey("valid_external_references", fixture.id);
  artifacts.get("build").value[propertyKey] = fixture.value;
  const analysis = analyzeLiteralReferenceClosures(artifacts);
  let resolverCalls = 0;
  const classification = classifyRepositoryFileReference(fixture.value, paths.buildPackage, (...arguments_) => {
    resolverCalls += 1;
    return resolveRepoReference(...arguments_);
  });
  const result = {
    ...fixture,
    passed: LITERAL_REFERENCE_CLOSURE_NAMES.every((closureName) => cleanBaseline[closureName].exact)
      && cleanBaseline.invalid_references.length === 0
      && analysis.external_repository_files.count === EXPECTED_REFERENCE_CLOSURES.external_repository_files.count + 1
      && !analysis.external_repository_files.exact
      && analysis.internal_JSON_Pointers.exact
      && analysis.known_scheme_locators.exact
      && analysis.invalid_references.length === 0
      && classification.kind === "repository_file_reference"
      && classification.bounded
      && resolverCalls === 1,
    resolver_calls: resolverCalls,
    classification,
    external_closure_count: analysis.external_repository_files.count,
    unrelated_closures_exact: analysis.internal_JSON_Pointers.exact && analysis.known_scheme_locators.exact,
    invalid_reference_count: analysis.invalid_references.length,
  };
  c10IncrementalFixtureResults.valid_external_references.push(result);
  assertInGroup("literal_reference_closure_fail_closed", `C10_valid_external_reference_accepts_${fixture.id}`, result.passed, result);
}

for (const extension of ["json", "md", "mjs", "ts"]) {
  assertC10ValidExternalReference({ id: `nested_${extension}`, value: `nested/unknown.${extension}` });
}
for (const fixture of [
  { id: "bare", value: "unknown.json" },
  { id: "explicit_current", value: "./unknown.md" },
  { id: "explicit_parent", value: "../unknown.mjs" },
  { id: "multiple_leading_parents", value: "../../unknown.ts" },
]) {
  assertC10ValidExternalReference(fixture);
}
assertInGroup("literal_reference_closure_fail_closed", "C10_nested_four_extensions_and_all_relative_styles_remain_valid_external_references", c10IncrementalFixtureResults.valid_external_references.length === 8
  && c10IncrementalFixtureResults.valid_external_references.every((fixture) => fixture.passed
    && fixture.external_closure_count === EXPECTED_REFERENCE_CLOSURES.external_repository_files.count + 1
    && fixture.unrelated_closures_exact
    && fixture.invalid_reference_count === 0
    && fixture.resolver_calls === 1), c10IncrementalFixtureResults.valid_external_references);

for (const fixture of [
  { id: "README_sentence", value: "Read README.md for details" },
  { id: "latency_percent", value: "latency 95%" },
]) {
  const artifacts = cloneStructuredJsonArtifacts();
  const propertyKey = c10FixturePropertyKey("ordinary_text_controls", fixture.id);
  artifacts.get("build").value[propertyKey] = fixture.value;
  const analysis = analyzeLiteralReferenceClosures(artifacts);
  let resolverCalls = 0;
  const classification = classifyRepositoryFileReference(fixture.value, paths.buildPackage, (...arguments_) => {
    resolverCalls += 1;
    return resolveRepoReference(...arguments_);
  });
  const result = {
    ...fixture,
    passed: LITERAL_REFERENCE_CLOSURE_NAMES.every((closureName) => analysis[closureName].exact)
      && analysis.invalid_references.length === 0
      && classification.kind === "not_repository_file_reference"
      && resolverCalls === 0,
    resolver_calls: resolverCalls,
    classification,
    all_closures_exact: LITERAL_REFERENCE_CLOSURE_NAMES.every((closureName) => analysis[closureName].exact),
    invalid_reference_count: analysis.invalid_references.length,
  };
  c10IncrementalFixtureResults.ordinary_text_controls.push(result);
  assertInGroup("literal_reference_closure_fail_closed", `C10_ordinary_text_remains_non_reference_${fixture.id}`, result.passed, result);
}
assertInGroup("literal_reference_closure_fail_closed", "C10_ordinary_README_sentence_and_latency_percent_do_not_enter_reference_resolution", c10IncrementalFixtureResults.ordinary_text_controls.length === 2
  && c10IncrementalFixtureResults.ordinary_text_controls.every((fixture) => fixture.passed
    && fixture.resolver_calls === 0
    && fixture.all_closures_exact
    && fixture.invalid_reference_count === 0), c10IncrementalFixtureResults.ordinary_text_controls);

const c11IncrementalFixtureResults = {
  malformed_percent_positions: [],
  invalid_repository_paths: [],
  cross_boundary_candidates: [],
  scheme_candidates: [],
  ordinary_text_controls: [],
};

function assertC11InvalidLiteralFixture(category, fixture) {
  const propertyKey = `c11_${category}_${fixture.id}`.replaceAll(/[^A-Za-z0-9_]/g, "_");
  const result = assertInvalidLiteralReferenceRejected(`C11_${category}_rejects_${fixture.id}`, (artifacts) => {
    artifacts.get("build").value[propertyKey] = fixture.value;
  }, {
    source: "build",
    pointer: toJsonPointer([propertyKey]),
    value: fixture.value,
    reason: fixture.reason,
  });
  const structuredResult = {
    id: fixture.id,
    value: fixture.value,
    expected_reason: fixture.reason,
    passed: result.rejected,
    invalid_reference_count: result.observed_invalid_reference_count,
    all_closures_exact: result.all_closures_exact,
    resolver_calls: result.isolated_resolver_calls,
    classification: result.isolated_classification,
  };
  c11IncrementalFixtureResults[category].push(structuredResult);
}

for (const fixture of [
  { id: "percent_in_bare_filename", value: "unknown%ZZ.json" },
  { id: "percent_in_parent_segment", value: "nested%ZZ/unknown.json" },
  { id: "percent_at_child_segment_start", value: "nested/%ZZunknown.json" },
]) {
  assertC11InvalidLiteralFixture("malformed_percent_positions", {
    ...fixture,
    reason: "invalid_locator_percent_encoding",
  });
}
assertInGroup("literal_reference_closure_fail_closed", "C11_malformed_percent_at_any_path_position_is_unique_invalid_before_resolution", c11IncrementalFixtureResults.malformed_percent_positions.length === 3
  && c11IncrementalFixtureResults.malformed_percent_positions.every((fixture) => fixture.passed
    && fixture.invalid_reference_count === 1
    && fixture.all_closures_exact
    && fixture.resolver_calls === 0
    && fixture.classification.kind === "invalid_repository_file_reference"
    && fixture.classification.reason === "invalid_locator_percent_encoding"), c11IncrementalFixtureResults.malformed_percent_positions);

for (const fixture of [
  { id: "unicode_parent_segment", value: "嵌套/unknown.json" },
  { id: "wildcard_parent_segment", value: "nested*/unknown.json" },
  { id: "whitespace_parent_segment", value: "nested dir/unknown.json" },
  { id: "explicit_current_unicode_segment", value: "./嵌套/unknown.json" },
  { id: "repeated_separator", value: "nested//unknown.json" },
  { id: "explicit_current_repeated_separator", value: "./nested//unknown.json" },
  { id: "wildcard_filename", value: "nested/unknown*.json" },
  { id: "colon_filename", value: "nested/unknown:copy.json" },
  { id: "leading_space", value: " nested/unknown.json" },
]) {
  assertC11InvalidLiteralFixture("invalid_repository_paths", {
    ...fixture,
    reason: "invalid_repository_relative_path",
  });
}
assertInGroup("literal_reference_closure_fail_closed", "C11_coarse_candidates_with_illegal_segments_reach_the_canonical_analyzer", c11IncrementalFixtureResults.invalid_repository_paths.length === 9
  && c11IncrementalFixtureResults.invalid_repository_paths.every((fixture) => fixture.passed
    && fixture.invalid_reference_count === 1
    && fixture.all_closures_exact
    && fixture.resolver_calls === 0
    && fixture.classification.kind === "invalid_repository_file_reference"
    && fixture.classification.reason === "invalid_repository_relative_path"), c11IncrementalFixtureResults.invalid_repository_paths);

for (const fixture of [
  { id: "whitespace_segment_and_trailing_space", value: "nested dir/unknown.json ", reason: "non_canonical_file_extension" },
  { id: "whitespace_segment_and_query_tail", value: "nested dir/unknown.json?x", reason: "non_canonical_file_extension" },
  { id: "leading_space_and_malformed_percent_tail", value: " nested/unknown.json%ZZ", reason: "invalid_locator_percent_encoding" },
]) {
  assertC11InvalidLiteralFixture("cross_boundary_candidates", fixture);
}
assertInGroup("literal_reference_closure_fail_closed", "C11_path_like_tail_detection_does_not_require_a_prevalidated_prefix", c11IncrementalFixtureResults.cross_boundary_candidates.length === 3
  && c11IncrementalFixtureResults.cross_boundary_candidates.every((fixture) => fixture.passed
    && fixture.invalid_reference_count === 1
    && fixture.all_closures_exact
    && fixture.resolver_calls === 0
    && fixture.classification.kind === "invalid_repository_file_reference"
    && fixture.classification.reason === fixture.expected_reason), c11IncrementalFixtureResults.cross_boundary_candidates);

assertC11InvalidLiteralFixture("scheme_candidates", {
  id: "colon_in_first_segment",
  value: "nested:dir/unknown.json",
  reason: "invalid_or_unsupported_URI_scheme",
});
assertInGroup("literal_reference_closure_fail_closed", "C11_colon_first_segment_is_one_explicit_scheme_failure", c11IncrementalFixtureResults.scheme_candidates.length === 1
  && c11IncrementalFixtureResults.scheme_candidates[0].passed
  && c11IncrementalFixtureResults.scheme_candidates[0].invalid_reference_count === 1
  && c11IncrementalFixtureResults.scheme_candidates[0].all_closures_exact
  && c11IncrementalFixtureResults.scheme_candidates[0].resolver_calls === 0
  && c11IncrementalFixtureResults.scheme_candidates[0].classification.reason === "invalid_or_unsupported_URI_scheme", c11IncrementalFixtureResults.scheme_candidates);

for (const fixture of [
  { id: "read_nested_schema", value: "Read docs/schema.json for details" },
  { id: "use_schema", value: "Use schema.json for documentation." },
  { id: "config_comma_clause", value: "The config.json, when present, is illustrative." },
  { id: "wildcard_documentation", value: "wildcard *.json is documentation text" },
  { id: "documentation_file_sentence", value: "Documentation is in schema.json" },
  { id: "see_file_parenthetical", value: "See schema.json)" },
]) {
  const artifacts = cloneStructuredJsonArtifacts();
  const propertyKey = `c11_ordinary_text_controls_${fixture.id}`;
  artifacts.get("build").value[propertyKey] = fixture.value;
  const analysis = analyzeLiteralReferenceClosures(artifacts);
  let resolverCalls = 0;
  const classification = classifyRepositoryFileReference(fixture.value, paths.buildPackage, (...arguments_) => {
    resolverCalls += 1;
    return resolveRepoReference(...arguments_);
  });
  const result = {
    ...fixture,
    passed: LITERAL_REFERENCE_CLOSURE_NAMES.every((closureName) => analysis[closureName].exact)
      && analysis.invalid_references.length === 0
      && classification.kind === "not_repository_file_reference"
      && resolverCalls === 0,
    all_closures_exact: LITERAL_REFERENCE_CLOSURE_NAMES.every((closureName) => analysis[closureName].exact),
    invalid_reference_count: analysis.invalid_references.length,
    resolver_calls: resolverCalls,
    classification,
  };
  c11IncrementalFixtureResults.ordinary_text_controls.push(result);
  assertInGroup("literal_reference_closure_fail_closed", `C11_ordinary_text_is_not_a_repository_candidate_${fixture.id}`, result.passed, result);
}
assertInGroup("literal_reference_closure_fail_closed", "C11_six_documentation_sentences_remain_ordinary_text", c11IncrementalFixtureResults.ordinary_text_controls.length === 6
  && c11IncrementalFixtureResults.ordinary_text_controls.every((fixture) => fixture.passed
    && fixture.invalid_reference_count === 0
    && fixture.all_closures_exact
    && fixture.resolver_calls === 0
    && fixture.classification.kind === "not_repository_file_reference"), c11IncrementalFixtureResults.ordinary_text_controls);

const c12IncrementalFixtureResults = {
  combined_path_tail_and_trailing_whitespace: [],
  terminal_punctuation_and_trailing_whitespace: [],
  illegal_prefix_combined_tails: [],
  strong_suffix_prefix_cross: [],
  complete_C0_DEL_positions: [],
  representative_controls_across_extensions: [],
  representative_control_additional_positions: [],
  malformed_percent_control_tails: [],
  isolated_classifier_C0_DEL_strong_suffix: [],
  ambiguous_path_end_policy: [],
};

function assertC12InvalidLiteralFixture(category, fixture) {
  const propertyKey = `c12_${category}_${fixture.id}`.replaceAll(/[^A-Za-z0-9_]/g, "_");
  const result = assertInvalidLiteralReferenceRejected(`C12_${category}_rejects_${fixture.id}`, (artifacts) => {
    artifacts.get("build").value[propertyKey] = fixture.value;
  }, {
    source: "build",
    pointer: toJsonPointer([propertyKey]),
    value: fixture.value,
    reason: fixture.reason,
  });
  c12IncrementalFixtureResults[category].push({
    id: fixture.id,
    value: fixture.value,
    expected_reason: fixture.reason,
    passed: result.rejected,
    invalid_reference_count: result.observed_invalid_reference_count,
    matching_invalid_reference_count: result.matching_invalid_reference_count,
    all_closures_exact: result.all_closures_exact,
    resolver_calls: result.isolated_resolver_calls,
    classification_kind: result.isolated_classification.kind,
    classification_reason: result.isolated_classification.reason ?? null,
    expected_tuple: result.expected,
  });
}

const c12TrailingWhitespaceVariants = [
  { id: "space", value: " " },
  { id: "tab", value: "\t" },
  { id: "newline", value: "\n" },
  { id: "NBSP", value: "\u00A0" },
];
const c12CombinedPathTailVariants = [
  { id: "malformed_percent", value: "%ZZ", reason: "invalid_locator_percent_encoding" },
  { id: "query", value: "?x", reason: "non_canonical_file_extension" },
  { id: "path_segment", value: "/x", reason: "non_canonical_file_extension" },
];
for (const extension of ["json", "md", "mjs", "ts"]) {
  for (const position of [
    { id: "bare", prefix: "" },
    { id: "nested", prefix: "nested/" },
  ]) {
    for (const tail of c12CombinedPathTailVariants) {
      for (const trailing of c12TrailingWhitespaceVariants) {
        assertC12InvalidLiteralFixture("combined_path_tail_and_trailing_whitespace", {
          id: `${extension}_${position.id}_${tail.id}_${trailing.id}`,
          value: `${position.prefix}unknown.${extension}${tail.value}${trailing.value}`,
          reason: tail.reason,
        });
      }
    }
  }
}
assertInGroup("literal_reference_closure_fail_closed", "C12_four_extensions_two_positions_three_path_tails_four_trailing_whitespace_matrix_is_exact", c12IncrementalFixtureResults.combined_path_tail_and_trailing_whitespace.length === 96
  && c12IncrementalFixtureResults.combined_path_tail_and_trailing_whitespace.every((fixture) => fixture.passed
    && fixture.invalid_reference_count === 1
    && fixture.matching_invalid_reference_count === 1
    && fixture.all_closures_exact
    && fixture.resolver_calls === 0
    && fixture.classification_kind === "invalid_repository_file_reference"
    && fixture.classification_reason === fixture.expected_reason), c12IncrementalFixtureResults.combined_path_tail_and_trailing_whitespace);

for (const position of [
  { id: "bare", prefix: "" },
  { id: "nested", prefix: "nested/" },
]) {
  for (const punctuation of ["!", ",", ";", ")"]) {
    for (const trailing of [
      { id: "space", value: " " },
      { id: "NBSP", value: "\u00A0" },
      { id: "tab", value: "\t" },
      { id: "NUL", value: "\u0000" },
      { id: "DEL", value: "\u007F" },
    ]) {
      assertC12InvalidLiteralFixture("terminal_punctuation_and_trailing_whitespace", {
        id: `${position.id}_${punctuation.codePointAt(0)}_${trailing.id}`,
        value: `${position.prefix}unknown.json${punctuation}${trailing.value}`,
        reason: "non_canonical_file_extension",
      });
    }
  }
}
assertInGroup("literal_reference_closure_fail_closed", "C12_terminal_punctuation_followed_by_whitespace_or_control_is_not_ordinary_text", c12IncrementalFixtureResults.terminal_punctuation_and_trailing_whitespace.length === 40
  && c12IncrementalFixtureResults.terminal_punctuation_and_trailing_whitespace.every((fixture) => fixture.passed
    && fixture.invalid_reference_count === 1
    && fixture.matching_invalid_reference_count === 1
    && fixture.all_closures_exact
    && fixture.resolver_calls === 0
    && fixture.classification_reason === "non_canonical_file_extension"), c12IncrementalFixtureResults.terminal_punctuation_and_trailing_whitespace);

for (const fixture of [
  { id: "repeated_separator_percent_space", value: "nested//unknown.json%ZZ ", reason: "invalid_locator_percent_encoding" },
  { id: "repeated_separator_query_tab", value: "nested//unknown.json?x\t", reason: "non_canonical_file_extension" },
  { id: "repeated_separator_path_newline", value: "nested//unknown.json/x\n", reason: "non_canonical_file_extension" },
]) {
  assertC12InvalidLiteralFixture("illegal_prefix_combined_tails", fixture);
}
assertInGroup("literal_reference_closure_fail_closed", "C12_illegal_prefix_and_combined_tail_failures_do_not_fall_back_to_ordinary_text", c12IncrementalFixtureResults.illegal_prefix_combined_tails.length === 3
  && c12IncrementalFixtureResults.illegal_prefix_combined_tails.every((fixture) => fixture.passed
    && fixture.invalid_reference_count === 1
    && fixture.matching_invalid_reference_count === 1
    && fixture.all_closures_exact
    && fixture.resolver_calls === 0
    && fixture.classification_reason === fixture.expected_reason), c12IncrementalFixtureResults.illegal_prefix_combined_tails);

const c12StrongSuffixVariants = [
  { id: "malformed_percent", value: "%ZZ", reason: "invalid_locator_percent_encoding" },
  { id: "query", value: "?x", reason: "non_canonical_file_extension" },
  { id: "path_segment", value: "/x", reason: "non_canonical_file_extension" },
  { id: "colon", value: ":x", reason: "non_canonical_file_extension" },
  { id: "wildcard", value: "*x", reason: "non_canonical_file_extension" },
  { id: "backslash", value: "\\x", reason: "backslash_not_allowed" },
];
const c12StrongSuffixPrefixVariants = [
  { id: "illegal_parent", value: "嵌套/unknown.json", contains_malformed_percent: false },
  { id: "prose_like", value: "Read schema.json", contains_malformed_percent: false },
  { id: "leading_whitespace", value: " unknown.json", contains_malformed_percent: false },
  { id: "malformed_percent_prefix", value: "nested%ZZ/unknown.json", contains_malformed_percent: true },
  { id: "repeated_separator", value: "nested//unknown.json", contains_malformed_percent: false },
  { id: "dot_segment", value: "nested/./unknown.json", contains_malformed_percent: false },
];
for (const prefix of c12StrongSuffixPrefixVariants) {
  for (const suffix of c12StrongSuffixVariants) {
    const reason = suffix.id === "backslash"
      ? "backslash_not_allowed"
      : prefix.contains_malformed_percent || suffix.id === "malformed_percent"
        ? "invalid_locator_percent_encoding"
        : suffix.reason;
    assertC12InvalidLiteralFixture("strong_suffix_prefix_cross", {
      id: `${prefix.id}_${suffix.id}`,
      value: `${prefix.value}${suffix.value}`,
      reason,
    });
  }
}
assertInGroup("literal_reference_closure_fail_closed", "C12_strong_suffix_detection_is_independent_of_prefix_candidate_gating", c12IncrementalFixtureResults.strong_suffix_prefix_cross.length === 36
  && c12IncrementalFixtureResults.strong_suffix_prefix_cross.every((fixture) => fixture.passed
    && fixture.invalid_reference_count === 1
    && fixture.matching_invalid_reference_count === 1
    && fixture.all_closures_exact
    && fixture.resolver_calls === 0
    && fixture.classification_kind === "invalid_repository_file_reference"
    && fixture.classification_reason === fixture.expected_reason), c12IncrementalFixtureResults.strong_suffix_prefix_cross);

const c12AllControlCharacters = [
  ...Array.from({ length: 0x20 }, (_unused, codePoint) => ({
    id: `U_${codePoint.toString(16).toUpperCase().padStart(4, "0")}`,
    value: String.fromCodePoint(codePoint),
  })),
  { id: "U_007F", value: "\u007F" },
];
for (const control of c12AllControlCharacters) {
  for (const position of [
    {
      id: "parent_segment",
      value: `nested${control.value}/unknown.json`,
      reason: "invalid_repository_relative_path",
    },
    {
      id: "basename",
      value: `nested/unknown${control.value}.json`,
      reason: "invalid_repository_relative_path",
    },
    {
      id: "extension_tail",
      value: `nested/unknown.json${control.value}`,
      reason: "non_canonical_file_extension",
    },
  ]) {
    assertC12InvalidLiteralFixture("complete_C0_DEL_positions", {
      id: `${control.id}_${position.id}`,
      value: position.value,
      reason: position.reason,
    });
  }
}
assertInGroup("literal_reference_closure_fail_closed", "C12_all_C0_and_DEL_code_points_fail_closed_in_parent_basename_and_extension_tail_positions", c12AllControlCharacters.length === 33
  && c12IncrementalFixtureResults.complete_C0_DEL_positions.length === 99
  && c12IncrementalFixtureResults.complete_C0_DEL_positions.every((fixture) => fixture.passed
    && fixture.invalid_reference_count === 1
    && fixture.matching_invalid_reference_count === 1
    && fixture.all_closures_exact
    && fixture.resolver_calls === 0
    && fixture.classification_kind === "invalid_repository_file_reference"
    && fixture.classification_reason === fixture.expected_reason), c12IncrementalFixtureResults.complete_C0_DEL_positions);

const c12RepresentativeControls = c12AllControlCharacters.filter((control) => new Set([
  "U_0000",
  "U_0009",
  "U_000A",
  "U_000B",
  "U_000C",
  "U_000D",
  "U_001F",
  "U_007F",
]).has(control.id));
for (const control of c12RepresentativeControls) {
  for (const extension of ["json", "md", "mjs", "ts"]) {
    for (const position of [
      { id: "bare", value: `unknown${control.value}.${extension}` },
      { id: "nested", value: `nested${control.value}/unknown.${extension}` },
    ]) {
      assertC12InvalidLiteralFixture("representative_controls_across_extensions", {
        id: `${control.id}_${extension}_${position.id}`,
        value: position.value,
        reason: "invalid_repository_relative_path",
      });
    }
  }
}
assertInGroup("literal_reference_closure_fail_closed", "C12_eight_representative_controls_cover_four_extensions_and_bare_nested_positions", c12RepresentativeControls.length === 8
  && c12IncrementalFixtureResults.representative_controls_across_extensions.length === 64
  && c12IncrementalFixtureResults.representative_controls_across_extensions.every((fixture) => fixture.passed
    && fixture.invalid_reference_count === 1
    && fixture.matching_invalid_reference_count === 1
    && fixture.all_closures_exact
    && fixture.resolver_calls === 0
    && fixture.classification_reason === "invalid_repository_relative_path"), c12IncrementalFixtureResults.representative_controls_across_extensions);

const c12AdditionalControlPositionFactories = [
  {
    id: "locator_start",
    value: (control) => `${control}unknown.json`,
    reason: "invalid_repository_relative_path",
  },
  {
    id: "segment_start",
    value: (control) => `nested/${control}unknown.json`,
    reason: "invalid_repository_relative_path",
  },
  {
    id: "independent_segment",
    value: (control) => `nested/${control}/unknown.json`,
    reason: "invalid_repository_relative_path",
  },
  {
    id: "after_explicit_current",
    value: (control) => `./${control}unknown.json`,
    reason: "invalid_repository_relative_path",
  },
  {
    id: "after_explicit_parent",
    value: (control) => `../${control}unknown.json`,
    reason: "invalid_repository_relative_path",
  },
  {
    id: "inside_extension",
    value: (control) => `unknown.j${control}son`,
    reason: "non_canonical_file_extension",
  },
  {
    id: "before_extension_letters",
    value: (control) => `unknown.${control}json`,
    reason: "non_canonical_file_extension",
  },
];
for (const control of c12RepresentativeControls) {
  for (const position of c12AdditionalControlPositionFactories) {
    assertC12InvalidLiteralFixture("representative_control_additional_positions", {
      id: `${control.id}_${position.id}`,
      value: position.value(control.value),
      reason: position.reason,
    });
  }
}
assertInGroup("literal_reference_closure_fail_closed", "C12_control_candidate_sniff_covers_locator_segment_relative_prefix_and_extension_internal_positions_without_cleaning_the_locator", c12IncrementalFixtureResults.representative_control_additional_positions.length === 56
  && c12IncrementalFixtureResults.representative_control_additional_positions.every((fixture) => fixture.passed
    && fixture.invalid_reference_count === 1
    && fixture.matching_invalid_reference_count === 1
    && fixture.all_closures_exact
    && fixture.resolver_calls === 0
    && fixture.classification_kind === "invalid_repository_file_reference"
    && fixture.classification_reason === fixture.expected_reason), c12IncrementalFixtureResults.representative_control_additional_positions);

const c12PercentTrailingControlVariants = [
  { id: "CR", value: "\r" },
  { id: "VT", value: "\u000B" },
  { id: "FF", value: "\u000C" },
  { id: "CRLF", value: "\r\n" },
  { id: "DEL", value: "\u007F" },
];
for (const malformedPercent of [
  { id: "isolated_percent", value: "%" },
  { id: "incomplete_percent", value: "%2" },
]) {
  for (const trailing of c12PercentTrailingControlVariants) {
    assertC12InvalidLiteralFixture("malformed_percent_control_tails", {
      id: `${malformedPercent.id}_${trailing.id}`,
      value: `unknown.json${malformedPercent.value}${trailing.value}`,
      reason: "invalid_locator_percent_encoding",
    });
  }
}
assertInGroup("literal_reference_closure_fail_closed", "C12_malformed_percent_precedence_survives_CR_VT_FF_CRLF_and_DEL_tails", c12IncrementalFixtureResults.malformed_percent_control_tails.length === 10
  && c12IncrementalFixtureResults.malformed_percent_control_tails.every((fixture) => fixture.passed
    && fixture.invalid_reference_count === 1
    && fixture.matching_invalid_reference_count === 1
    && fixture.all_closures_exact
    && fixture.resolver_calls === 0
    && fixture.classification_reason === "invalid_locator_percent_encoding"), c12IncrementalFixtureResults.malformed_percent_control_tails);

const c12IsolatedClassifierBaseline = analyzeLiteralReferenceClosures(cloneStructuredJsonArtifacts());
const c12IsolatedClassifierBaselineClosuresExact = LITERAL_REFERENCE_CLOSURE_NAMES.every((closureName) => c12IsolatedClassifierBaseline[closureName].exact)
  && c12IsolatedClassifierBaseline.invalid_references.length === 0;
for (const control of c12AllControlCharacters) {
  for (const suffix of c12StrongSuffixVariants) {
    const value = `unknown.json${suffix.value}${control.value}`;
    let resolverCalls = 0;
    const classification = classifyRepositoryFileReference(value, paths.buildPackage, (...arguments_) => {
      resolverCalls += 1;
      return resolveRepoReference(...arguments_);
    });
    c12IncrementalFixtureResults.isolated_classifier_C0_DEL_strong_suffix.push({
      id: `${control.id}_${suffix.id}`,
      value,
      expected_reason: suffix.reason,
      passed: classification.kind === "invalid_repository_file_reference"
        && classification.reason === suffix.reason
        && resolverCalls === 0,
      resolver_calls: resolverCalls,
      classification_kind: classification.kind,
      classification_reason: classification.reason ?? null,
    });
  }
}
assertInGroup("literal_reference_closure_fail_closed", "C12_isolated_classifier_covers_all_C0_DEL_code_points_with_six_strong_suffix_classes", c12IsolatedClassifierBaselineClosuresExact
  && c12IncrementalFixtureResults.isolated_classifier_C0_DEL_strong_suffix.length === 198
  && c12IncrementalFixtureResults.isolated_classifier_C0_DEL_strong_suffix.every((fixture) => fixture.passed
    && fixture.resolver_calls === 0
    && fixture.classification_kind === "invalid_repository_file_reference"
    && fixture.classification_reason === fixture.expected_reason), {
  baseline_closures_exact: c12IsolatedClassifierBaselineClosuresExact,
  fixtures: c12IncrementalFixtureResults.isolated_classifier_C0_DEL_strong_suffix,
});

const c12ExplicitPathSyntaxSentenceEndFixtures = [
  { id: "read_path_at_end", value: "Read docs/schema.json", reason: "invalid_repository_relative_path" },
  { id: "see_explicit_path_at_end", value: "See ./schema.json", reason: "invalid_repository_relative_path" },
  { id: "schema_label_path_at_end", value: "Schema: schema.json", reason: "invalid_or_unsupported_URI_scheme" },
  { id: "query_tail_with_trailing_space", value: "Read schema.json?x ", reason: "non_canonical_file_extension" },
];
for (const fixture of c12ExplicitPathSyntaxSentenceEndFixtures) {
  assertC12InvalidLiteralFixture("ambiguous_path_end_policy", fixture);
}
assertInGroup("literal_reference_closure_fail_closed", "C12_ambiguous_path_shaped_sentence_endings_fail_closed_by_accepted_security_policy", c12IncrementalFixtureResults.ambiguous_path_end_policy.length === 4
  && c12IncrementalFixtureResults.ambiguous_path_end_policy.every((fixture) => fixture.passed
    && fixture.invalid_reference_count === 1
    && fixture.matching_invalid_reference_count === 1
    && fixture.all_closures_exact
    && fixture.resolver_calls === 0
    && fixture.classification_reason === fixture.expected_reason), c12IncrementalFixtureResults.ambiguous_path_end_policy);
const c12ExpectedOrdinaryDocumentationValues = [
  "Read docs/schema.json for details",
  "Use schema.json for documentation.",
  "The config.json, when present, is illustrative.",
  "wildcard *.json is documentation text",
  "Documentation is in schema.json",
  "See schema.json)",
];
const c12ObservedOrdinaryDocumentationValues = c11IncrementalFixtureResults.ordinary_text_controls.map((fixture) => fixture.value);
const c12ObservedExplicitPathSyntaxSentenceEndValues = c12IncrementalFixtureResults.ambiguous_path_end_policy.map((fixture) => fixture.value);
const c12SentencePolicySetsAreExactAndDisjoint = JSON.stringify([...c12ObservedOrdinaryDocumentationValues].sort())
    === JSON.stringify([...c12ExpectedOrdinaryDocumentationValues].sort())
  && JSON.stringify([...c12ObservedExplicitPathSyntaxSentenceEndValues].sort())
    === JSON.stringify(c12ExplicitPathSyntaxSentenceEndFixtures.map((fixture) => fixture.value).sort())
  && c12ObservedOrdinaryDocumentationValues.every((value) => !c12ObservedExplicitPathSyntaxSentenceEndValues.includes(value));
assertInGroup("literal_reference_closure_fail_closed", "C12_explicit_path_syntax_sentence_end_policy_is_exact_and_disjoint_from_six_ordinary_controls", c12SentencePolicySetsAreExactAndDisjoint
  && c11IncrementalFixtureResults.ordinary_text_controls.length === 6
  && c11IncrementalFixtureResults.ordinary_text_controls.every((fixture) => fixture.passed
    && fixture.invalid_reference_count === 0
    && fixture.all_closures_exact
    && fixture.resolver_calls === 0
    && fixture.classification.kind === "not_repository_file_reference"), {
  policy_scope: "explicit_path_syntax_signal_at_sentence_end",
  invalid_values: c12ObservedExplicitPathSyntaxSentenceEndValues,
  ordinary_values: c12ObservedOrdinaryDocumentationValues,
  sets_are_exact_and_disjoint: c12SentencePolicySetsAreExactAndDisjoint,
});

const c13IncrementalFixtureResults = {
  illegal_locator_fragment_cross: [],
  valid_locator_invalid_fragment_reasons: [],
  uppercase_extension_fragment_precedence: [],
  valid_fragment_resolver_controls: [],
  terminal_punctuation_matrix: [],
  ordinary_non_candidates: [],
  reason_precedence_oracle: [],
};

function assertC13InvalidLiteralFixture(category, fixture) {
  const propertyKey = `c13_${category}_${fixture.id}`.replaceAll(/[^A-Za-z0-9_]/g, "_");
  const result = assertInvalidLiteralReferenceRejected(`C13_${category}_rejects_${fixture.id}`, (artifacts) => {
    artifacts.get("build").value[propertyKey] = fixture.value;
  }, {
    source: "build",
    pointer: toJsonPointer([propertyKey]),
    value: fixture.value,
    reason: fixture.reason,
  });
  c13IncrementalFixtureResults[category].push({
    id: fixture.id,
    value: fixture.value,
    expected_reason: fixture.reason,
    passed: result.rejected,
    invalid_reference_count: result.observed_invalid_reference_count,
    matching_invalid_reference_count: result.matching_invalid_reference_count,
    all_closures_exact: result.all_closures_exact,
    resolver_calls: result.isolated_resolver_calls,
    classification_kind: result.isolated_classification.kind,
    classification_reason: result.isolated_classification.reason ?? null,
    expected_tuple: result.expected,
  });
}

const c13RepositoryExtensions = ["json", "md", "mjs", "ts"];
const c13IllegalLocatorPrefixes = [
  { id: "prose_like", locator: (extension) => `Read schema.${extension}` },
  { id: "prose_path", locator: (extension) => `Read docs/schema.${extension}` },
  { id: "leading_whitespace", locator: (extension) => ` unknown.${extension}` },
  { id: "unicode_parent", locator: (extension) => `嵌套/unknown.${extension}` },
  { id: "repeated_separator", locator: (extension) => `nested//unknown.${extension}` },
  { id: "dot_segment", locator: (extension) => `nested/./unknown.${extension}` },
];
const c13IllegalLocatorFragmentVariants = [
  { id: "valid_pointer", value: "#/x" },
  { id: "invalid_percent", value: "#/%ZZ" },
  { id: "percent_alias", value: "#/%74ables/0" },
];
for (const extension of c13RepositoryExtensions) {
  for (const prefix of c13IllegalLocatorPrefixes) {
    for (const fragment of c13IllegalLocatorFragmentVariants) {
      assertC13InvalidLiteralFixture("illegal_locator_fragment_cross", {
        id: `${extension}_${prefix.id}_${fragment.id}`,
        value: `${prefix.locator(extension)}${fragment.value}`,
        reason: "invalid_repository_relative_path",
      });
    }
  }
}
const c13IllegalLocatorFragmentExpectedCount = c13RepositoryExtensions.length
  * c13IllegalLocatorPrefixes.length
  * c13IllegalLocatorFragmentVariants.length;
assertInGroup("literal_reference_closure_fail_closed", "C13_fragment_syntax_promotes_prose_and_illegal_locators_without_cleaning_locator_or_fragment", c13IncrementalFixtureResults.illegal_locator_fragment_cross.length === c13IllegalLocatorFragmentExpectedCount
  && c13IncrementalFixtureResults.illegal_locator_fragment_cross.every((fixture) => fixture.passed
    && fixture.invalid_reference_count === 1
    && fixture.matching_invalid_reference_count === 1
    && fixture.all_closures_exact
    && fixture.resolver_calls === 0
    && fixture.classification_kind === "invalid_repository_file_reference"
    && fixture.classification_reason === "invalid_repository_relative_path"), c13IncrementalFixtureResults.illegal_locator_fragment_cross);

const c13InvalidFragmentReasonOracle = [
  { id: "empty", fragment: "#", reason: "empty_external_fragment" },
  { id: "non_pointer", fragment: "#not-a-JSON-Pointer", reason: "fragment_is_not_JSON_Pointer" },
  { id: "multiple_hash_markers", fragment: "#/x#y", reason: "invalid_fragment_marker" },
  { id: "invalid_percent", fragment: "#/%ZZ", reason: "invalid_fragment_percent_encoding" },
  { id: "percent_alias_token", fragment: "#/%74ables/0", reason: "percent_encoded_fragment_alias_not_allowed" },
  { id: "invalid_tilde_escape", fragment: "#/x/~2", reason: "invalid_JSON_Pointer_escape" },
  { id: "dangling_tilde_escape", fragment: "#/x/~", reason: "invalid_JSON_Pointer_escape" },
  { id: "percent_alias_slash", fragment: "#%2Fx", reason: "percent_encoded_fragment_alias_not_allowed" },
];
for (const extension of c13RepositoryExtensions) {
  for (const fragment of c13InvalidFragmentReasonOracle) {
    assertC13InvalidLiteralFixture("valid_locator_invalid_fragment_reasons", {
      id: `${extension}_${fragment.id}`,
      value: `unknown.${extension}${fragment.fragment}`,
      reason: fragment.reason,
    });
  }
}
const c13ValidLocatorInvalidFragmentExpectedCount = c13RepositoryExtensions.length * c13InvalidFragmentReasonOracle.length;
assertInGroup("literal_reference_closure_fail_closed", "C13_valid_locators_preserve_eight_literal_invalid_fragment_reason_priorities", c13InvalidFragmentReasonOracle.length === 8
  && c13IncrementalFixtureResults.valid_locator_invalid_fragment_reasons.length === c13ValidLocatorInvalidFragmentExpectedCount
  && c13IncrementalFixtureResults.valid_locator_invalid_fragment_reasons.every((fixture) => fixture.passed
    && fixture.invalid_reference_count === 1
    && fixture.matching_invalid_reference_count === 1
    && fixture.all_closures_exact
    && fixture.resolver_calls === 0
    && fixture.classification_kind === "invalid_repository_file_reference"
    && fixture.classification_reason === fixture.expected_reason), {
  literal_reason_oracle: c13InvalidFragmentReasonOracle,
  fixtures: c13IncrementalFixtureResults.valid_locator_invalid_fragment_reasons,
});

const c13UppercaseExtensionFragmentVariants = [
  { id: "valid_pointer", fragment: "#/x" },
  ...c13InvalidFragmentReasonOracle,
];
for (const extension of c13RepositoryExtensions) {
  for (const fragment of c13UppercaseExtensionFragmentVariants) {
    assertC13InvalidLiteralFixture("uppercase_extension_fragment_precedence", {
      id: `${extension.toUpperCase()}_${fragment.id}`,
      value: `unknown.${extension.toUpperCase()}${fragment.fragment}`,
      reason: "non_canonical_file_extension",
    });
  }
}
const c13UppercaseExtensionFragmentExpectedCount = c13RepositoryExtensions.length * c13UppercaseExtensionFragmentVariants.length;
assertInGroup("literal_reference_closure_fail_closed", "C13_uppercase_extensions_fail_before_all_valid_or_invalid_fragment_variants", c13IncrementalFixtureResults.uppercase_extension_fragment_precedence.length === c13UppercaseExtensionFragmentExpectedCount
  && c13IncrementalFixtureResults.uppercase_extension_fragment_precedence.every((fixture) => fixture.passed
    && fixture.invalid_reference_count === 1
    && fixture.matching_invalid_reference_count === 1
    && fixture.all_closures_exact
    && fixture.resolver_calls === 0
    && fixture.classification_reason === "non_canonical_file_extension"), c13IncrementalFixtureResults.uppercase_extension_fragment_precedence);

for (const extension of c13RepositoryExtensions) {
  const value = `unknown.${extension}#/x`;
  let resolverCalls = 0;
  const classification = classifyRepositoryFileReference(value, paths.buildPackage, (...arguments_) => {
    resolverCalls += 1;
    return resolveRepoReference(...arguments_);
  });
  const passed = classification.kind === "repository_file_reference"
    && classification.locator === `unknown.${extension}`
    && classification.fragment === "#/x"
    && classification.decoded_fragment_pointer === "/x"
    && classification.bounded
    && resolverCalls === 1;
  const fixtureResult = {
    id: extension,
    value,
    passed,
    resolver_calls: resolverCalls,
    classification,
  };
  c13IncrementalFixtureResults.valid_fragment_resolver_controls.push(fixtureResult);
  assertInGroup("literal_reference_closure_fail_closed", `C13_valid_fragment_resolver_spy_is_called_once_for_${extension}`, passed, fixtureResult);
}
assertInGroup("literal_reference_closure_fail_closed", "C13_each_supported_extension_has_one_isolated_valid_fragment_resolver_control", c13IncrementalFixtureResults.valid_fragment_resolver_controls.length === 4
  && c13IncrementalFixtureResults.valid_fragment_resolver_controls.every((fixture) => fixture.passed
    && fixture.resolver_calls === 1
    && fixture.classification.kind === "repository_file_reference"), c13IncrementalFixtureResults.valid_fragment_resolver_controls);

const c13TerminalPunctuationOracle = [
  { id: "ASCII_period", value: "." },
  { id: "CJK_period", value: "。" },
  { id: "ellipsis", value: "…" },
  { id: "ASCII_exclamation", value: "!" },
  { id: "ASCII_question", value: "?" },
  { id: "CJK_exclamation", value: "！" },
  { id: "CJK_question", value: "？" },
  { id: "ASCII_quote", value: "\"" },
  { id: "right_double_quote", value: "”" },
  { id: "right_parenthesis", value: ")" },
  { id: "fullwidth_right_parenthesis", value: "）" },
  { id: "right_bracket", value: "]" },
  { id: "CJK_right_bracket", value: "】" },
  { id: "greater_than", value: ">" },
  { id: "fullwidth_greater_than", value: "＞" },
  { id: "Markdown_backtick", value: "`" },
];
const c13TerminalPunctuationTrailingOracle = [
  { id: "empty", value: "" },
  { id: "space", value: " " },
  { id: "NBSP", value: "\u00A0" },
  { id: "tab", value: "\t" },
  { id: "newline", value: "\n" },
  { id: "NUL", value: "\u0000" },
  { id: "DEL", value: "\u007F" },
];
const c13TerminalPunctuationLocatorPositions = [
  { id: "bare", locator: (extension) => `unknown.${extension}` },
  { id: "nested", locator: (extension) => `nested/unknown.${extension}` },
  { id: "read_docs_path", locator: (extension) => `Read docs/unknown.${extension}` },
];
for (const extension of c13RepositoryExtensions) {
  for (const position of c13TerminalPunctuationLocatorPositions) {
    for (const punctuation of c13TerminalPunctuationOracle) {
      for (const trailing of c13TerminalPunctuationTrailingOracle) {
        assertC13InvalidLiteralFixture("terminal_punctuation_matrix", {
          id: `${extension}_${position.id}_${punctuation.id}_${trailing.id}`,
          value: `${position.locator(extension)}${punctuation.value}${trailing.value}`,
          reason: "non_canonical_file_extension",
        });
      }
    }
  }
}
const c13TerminalPunctuationExpectedCount = c13RepositoryExtensions.length
  * c13TerminalPunctuationLocatorPositions.length
  * c13TerminalPunctuationOracle.length
  * c13TerminalPunctuationTrailingOracle.length;
assertInGroup("literal_reference_closure_fail_closed", "C13_terminal_Po_Pe_Pf_closers_and_backticks_with_optional_whitespace_controls_fail_closed_after_prefix_gate", c13IncrementalFixtureResults.terminal_punctuation_matrix.length === c13TerminalPunctuationExpectedCount
  && c13IncrementalFixtureResults.terminal_punctuation_matrix.every((fixture) => fixture.passed
    && fixture.invalid_reference_count === 1
    && fixture.matching_invalid_reference_count === 1
    && fixture.all_closures_exact
    && fixture.resolver_calls === 0
    && fixture.classification_kind === "invalid_repository_file_reference"
    && fixture.classification_reason === "non_canonical_file_extension"), c13IncrementalFixtureResults.terminal_punctuation_matrix);

const c13OrdinaryNonCandidateOracle = [
  { id: "documentation_ASCII_period", value: "Documentation is in schema.json." },
  { id: "documentation_CJK_period", value: "Documentation is in schema.json。" },
  { id: "bare_backup_suffix", value: "unknown.json.bak" },
  { id: "nested_backup_suffix", value: "nested/unknown.json.bak" },
  { id: "explicit_backup_suffix", value: "./unknown.json.bak" },
  { id: "backup_suffix_prose", value: "Read unknown.json.bak for details" },
  { id: "bare_numeric_suffix", value: "unknown.json.1" },
  { id: "nested_numeric_suffix", value: "nested/unknown.json.1" },
  { id: "bare_connector_suffix", value: "unknown.json_name" },
  { id: "nested_connector_suffix", value: "nested/unknown.json_name" },
  { id: "bare_dash_suffix", value: "unknown.json-extra" },
  { id: "nested_dash_suffix", value: "nested/unknown.json-extra" },
  { id: "bare_trailing_prose", value: "unknown.json prose" },
  { id: "nested_trailing_prose", value: "nested/unknown.json prose" },
  { id: "opening_parenthesis_suffix", value: "nested/unknown.json(" },
  { id: "opening_quote_suffix", value: "nested/unknown.json“" },
  { id: "fragment_contains_filename_after_prose", value: "Read #schema.json" },
  { id: "fragment_contains_path_filename", value: "note#/schema.json" },
];
for (const fixture of c13OrdinaryNonCandidateOracle) {
  const artifacts = cloneStructuredJsonArtifacts();
  const propertyKey = `c13_ordinary_non_candidates_${fixture.id}`;
  artifacts.get("build").value[propertyKey] = fixture.value;
  const analysis = analyzeLiteralReferenceClosures(artifacts);
  let resolverCalls = 0;
  const classification = classifyRepositoryFileReference(fixture.value, paths.buildPackage, (...arguments_) => {
    resolverCalls += 1;
    return resolveRepoReference(...arguments_);
  });
  const passed = LITERAL_REFERENCE_CLOSURE_NAMES.every((closureName) => analysis[closureName].exact)
    && analysis.invalid_references.length === 0
    && classification.kind === "not_repository_file_reference"
    && resolverCalls === 0;
  const fixtureResult = {
    ...fixture,
    passed,
    resolver_calls: resolverCalls,
    invalid_reference_count: analysis.invalid_references.length,
    all_closures_exact: LITERAL_REFERENCE_CLOSURE_NAMES.every((closureName) => analysis[closureName].exact),
    classification,
  };
  c13IncrementalFixtureResults.ordinary_non_candidates.push(fixtureResult);
  assertInGroup("literal_reference_closure_fail_closed", `C13_ordinary_non_candidate_remains_unclassified_${fixture.id}`, passed, fixtureResult);
}
const c13TerminalNegativeValues = c13IncrementalFixtureResults.terminal_punctuation_matrix.map((fixture) => fixture.value);
const c13OrdinaryNonCandidateValues = c13IncrementalFixtureResults.ordinary_non_candidates.map((fixture) => fixture.value);
const c13OrdinaryAndTerminalSetsAreDisjoint = c13OrdinaryNonCandidateValues.every((value) => !c13TerminalNegativeValues.includes(value));
assertInGroup("literal_reference_closure_fail_closed", "C13_ordinary_non_candidates_are_exact_disjoint_and_preserve_C11_six_controls", c13IncrementalFixtureResults.ordinary_non_candidates.length === c13OrdinaryNonCandidateOracle.length
  && c13IncrementalFixtureResults.ordinary_non_candidates.every((fixture) => fixture.passed
    && fixture.invalid_reference_count === 0
    && fixture.all_closures_exact
    && fixture.resolver_calls === 0
    && fixture.classification.kind === "not_repository_file_reference")
  && c13OrdinaryAndTerminalSetsAreDisjoint
  && c11IncrementalFixtureResults.ordinary_text_controls.length === 6
  && c11IncrementalFixtureResults.ordinary_text_controls.every((fixture) => fixture.passed), {
  ordinary_values: c13OrdinaryNonCandidateValues,
  terminal_negative_value_count: c13TerminalNegativeValues.length,
  sets_are_disjoint: c13OrdinaryAndTerminalSetsAreDisjoint,
  c11_ordinary_values: c11IncrementalFixtureResults.ordinary_text_controls.map((fixture) => fixture.value),
});

const c13ReasonPrecedenceOracle = [
  { id: "HTTPS_query_tail", value: "https://x/a.json?x", reason: "non_canonical_file_extension" },
  { id: "schema_query_tail", value: "Schema: schema.json?x", reason: "non_canonical_file_extension" },
  { id: "HTTPS_scheme", value: "https://x/a.json", reason: "invalid_or_unsupported_URI_scheme" },
  { id: "schema_scheme", value: "Schema: schema.json", reason: "invalid_or_unsupported_URI_scheme" },
  { id: "filename_colon_tail", value: "unknown.json:x", reason: "non_canonical_file_extension" },
];
for (const fixture of c13ReasonPrecedenceOracle) {
  assertC13InvalidLiteralFixture("reason_precedence_oracle", fixture);
}
assertInGroup("literal_reference_closure_fail_closed", "C13_reason_precedence_oracle_is_literal_fail_closed_and_resolver_free", c13IncrementalFixtureResults.reason_precedence_oracle.length === c13ReasonPrecedenceOracle.length
  && c13IncrementalFixtureResults.reason_precedence_oracle.every((fixture) => fixture.passed
    && fixture.invalid_reference_count === 1
    && fixture.matching_invalid_reference_count === 1
    && fixture.all_closures_exact
    && fixture.resolver_calls === 0
    && fixture.classification_reason === fixture.expected_reason), {
  accepted_security_tradeoff: "existing_scheme_vs_noncanonical_reason_precedence_is_frozen_without_reordering",
  literal_reason_oracle: c13ReasonPrecedenceOracle,
  fixtures: c13IncrementalFixtureResults.reason_precedence_oracle,
});

const strictRawDuplicateKeyFixtures = [
  { id: "top_level", raw: '{"a":1,"a":2}', expected_key: "a" },
  { id: "nested", raw: '{"outer":{"a":1,"a":2}}', expected_key: "a" },
  { id: "unicode_escape_alias", raw: '{"a":1,"\\u0061":2}', expected_key: "a" },
  { id: "escaped_slash_alias", raw: '{"a/b":1,"a\\/b":2}', expected_key: "a/b" },
  { id: "surrogate_pair_alias", raw: '{"😀":1,"\\uD83D\\uDE00":2}', expected_key: "😀" },
];
const strictRawJsonNegativeFixtureResults = [];
assertInGroup("strict_JSON_input_fail_closed", "contract_strict_input_fatal_report_has_versioned_exact_schema_and_rejects_missing_extra_version_and_equal_cardinality_rename", contractFatalShapeMutations.length === 4
  && contractFatalShapeMutations.every((fixture) => fixture.baseline_valid
    && fixture.mutation_valid === false
    && fixture.fixed_fatal_selected
    && fixture.sensitive_sentinel_present === false), contractFatalShapeMutations);
for (const fixture of strictRawDuplicateKeyFixtures) {
  const analysis = analyzeStrictJsonText(fixture.raw, `duplicate_${fixture.id}`);
  const rejected = !analysis.valid
    && analysis.duplicate_keys.length === 1
    && analysis.duplicate_keys[0].decoded_key === fixture.expected_key
    && analysis.number_findings.length === 0
    && analysis.syntax_errors.length === 0;
  strictRawJsonNegativeFixtureResults.push({ id: `duplicate_${fixture.id}`, rejected, analysis });
  assertInGroup("strict_JSON_input_fail_closed", `raw_duplicate_key_scanner_rejects_${fixture.id}`, rejected, analysis);
}
const duplicateKeyCrossObjectControl = analyzeStrictJsonText('{"left":{"a":1},"right":{"a":2}}', "duplicate_cross_object_control");
assertInGroup("strict_JSON_input_fail_closed", "raw_duplicate_key_scanner_allows_same_decoded_key_in_distinct_objects", duplicateKeyCrossObjectControl.valid, duplicateKeyCrossObjectControl);

const strictRawNumberFixtures = [
  { id: "positive_non_finite_exponent", raw: '{"value":1e309}', reason: "non_finite_JSON_number" },
  { id: "negative_non_finite_exponent", raw: '{"value":-1e309}', reason: "non_finite_JSON_number" },
  { id: "positive_non_finite_exponent_400", raw: '{"value":1e400}', reason: "non_finite_JSON_number" },
  { id: "negative_non_finite_exponent_400", raw: '{"value":-1e400}', reason: "non_finite_JSON_number" },
  { id: "negative_zero_integer", raw: '{"value":-0}', reason: "negative_zero_JSON_number" },
  { id: "negative_zero_decimal", raw: '{"value":-0.0}', reason: "negative_zero_JSON_number" },
  { id: "negative_zero_exponent", raw: '{"value":-0e0}', reason: "negative_zero_JSON_number" },
];
for (const fixture of strictRawNumberFixtures) {
  const analysis = analyzeStrictJsonText(fixture.raw, `number_${fixture.id}`);
  const rejected = !analysis.valid
    && analysis.number_findings.length === 1
    && analysis.number_findings[0].reason === fixture.reason
    && analysis.duplicate_keys.length === 0
    && analysis.syntax_errors.length === 0;
  strictRawJsonNegativeFixtureResults.push({ id: `number_${fixture.id}`, rejected, analysis });
  assertInGroup("strict_JSON_input_fail_closed", `raw_number_scanner_rejects_${fixture.id}`, rejected, analysis);
}
for (const [id, raw] of [
  ["zero", '{"value":0}'],
  ["finite_integer", '{"value":42}'],
  ["finite_decimal", '{"value":1.25}'],
  ["finite_exponent", '{"value":1e2}'],
]) {
  const analysis = analyzeStrictJsonText(raw, `number_positive_${id}`);
  assertInGroup("strict_JSON_input_fail_closed", `raw_number_scanner_accepts_${id}`, analysis.valid, analysis);
}

function canonicalizerOutcome(value) {
  try {
    return { accepted: true, value: canonicalizeJsonValue(value) };
  } catch (error) {
    return { accepted: false, name: error?.name, message: error?.message };
  }
}
const canonicalJsonNumberFixtureResults = [];
for (const [id, value] of [
  ["NaN", Number.NaN],
  ["positive_Infinity", Number.POSITIVE_INFINITY],
  ["negative_Infinity", Number.NEGATIVE_INFINITY],
  ["negative_zero", -0],
]) {
  const outcome = canonicalizerOutcome({ value });
  const passed = outcome.accepted === false
    && outcome.message === "canonical_JSON_number_must_be_finite_and_not_negative_zero";
  canonicalJsonNumberFixtureResults.push({ id, expected: "rejected", passed, outcome });
  assertInGroup("strict_JSON_input_fail_closed", `canonical_JSON_serializer_rejects_${id}`, passed, outcome);
}
for (const [id, value] of [["zero", 0], ["finite", 1.25]]) {
  const outcome = canonicalizerOutcome({ value });
  const passed = outcome.accepted === true && outcome.value.value === value;
  canonicalJsonNumberFixtureResults.push({ id, expected: "accepted", passed, outcome });
  assertInGroup("strict_JSON_input_fail_closed", `canonical_JSON_serializer_accepts_${id}`, passed, outcome);
}

const pointerArrayFixture = {
  items: ["zero", "one"],
  object: { "0": "object_zero", length: "object_length", "01": "object_leading_zero" },
};
const jsonPointerArraySemanticFixtureResults = [];
for (const fixture of [
  { id: "zero", token: "0", expected: "zero" },
  { id: "one", token: "1", expected: "one" },
]) {
  const internal = resolveInternalJsonPointer(pointerArrayFixture, `#/items/${fixture.token}`);
  const external = resolveJsonPointerFragment(pointerArrayFixture, `#/items/${fixture.token}`);
  const passed = internal.valid
    && internal.target === fixture.expected
    && external.valid
    && external.value === fixture.expected;
  jsonPointerArraySemanticFixtureResults.push({ id: `valid_array_${fixture.id}`, passed, internal, external });
  assertInGroup("JSON_Pointer_array_semantics", `internal_and_external_JSON_Pointers_accept_canonical_in_bounds_array_index_${fixture.id}`, passed, { internal, external });
}
for (const token of ["", "length", "-", "01", " 1", "1 ", "1e0", "2", "9007199254740992"]) {
  const internal = resolveInternalJsonPointer(pointerArrayFixture, `#/items/${token}`);
  const external = resolveJsonPointerFragment(pointerArrayFixture, `#/items/${token}`);
  const passed = !internal.valid && !external.valid;
  jsonPointerArraySemanticFixtureResults.push({ id: `invalid_array_${token}`, passed, internal, external });
  assertInGroup("JSON_Pointer_array_semantics", `internal_and_external_JSON_Pointers_reject_array_token_${JSON.stringify(token)}`, passed, { token, internal, external });
}
for (const fixture of [
  { token: "0", expected: "object_zero" },
  { token: "length", expected: "object_length" },
  { token: "01", expected: "object_leading_zero" },
]) {
  const internal = resolveInternalJsonPointer(pointerArrayFixture, `#/object/${fixture.token}`);
  const external = resolveJsonPointerFragment(pointerArrayFixture, `#/object/${fixture.token}`);
  const passed = internal.valid
    && internal.target === fixture.expected
    && external.valid
    && external.value === fixture.expected;
  jsonPointerArraySemanticFixtureResults.push({ id: `ordinary_object_${fixture.token}`, passed, internal, external });
  assertInGroup("JSON_Pointer_array_semantics", `ordinary_object_own_key_${fixture.token}_is_not_misclassified_as_array_index`, passed, { internal, external });
}

const validRepositoryReferenceParserCases = [
  { source_file: paths.t2Manifest, value: "on-site-build-package.v0.1.json", style: "bare_relative" },
  { source_file: paths.t2Manifest, value: "subdir/file.json", style: "bare_relative" },
  { source_file: paths.buildPackage, value: "./on-site-smoke-plan.v0.1.json", style: "explicit_current" },
  { source_file: paths.importPlan, value: "../evidence/on-site-evidence-template.json#/tables/0", style: "explicit_parent" },
  { source_file: paths.probeSuite, value: "../runbooks/day-1-permission-matrix.md", style: "explicit_parent" },
  { source_file: paths.t2Manifest, value: "../../src/neoloop/adapters/feishu/w6-reopen-projector.ts", style: "explicit_parent" },
  { source_file: paths.t2Manifest, value: "../../tests/core/feishu-w6-reopen-projector.test.mjs", style: "explicit_parent" },
];
assertInGroup("reference_graph_fail_closed", "strict_repository_reference_parser_accepts_explicit_and_bare_json_md_mjs_ts", validRepositoryReferenceParserCases.every((fixture) => {
  const classification = classifyRepositoryFileReference(fixture.value, fixture.source_file);
  return classification.kind === "repository_file_reference"
    && classification.relative_style === fixture.style
    && classification.bounded;
}), validRepositoryReferenceParserCases.map((fixture) => ({
  ...fixture,
  classification: classifyRepositoryFileReference(fixture.value, fixture.source_file),
})));
assertInGroup("reference_graph_fail_closed", "pure_document_internal_JSON_Pointer_is_not_a_repository_file_locator", classifyRepositoryFileReference("#/run_policy/reset", paths.smokePlan).kind === "internal_JSON_Pointer", classifyRepositoryFileReference("#/run_policy/reset", paths.smokePlan));
assertInGroup("reference_graph_fail_closed", "known_non_file_locator_schemes_remain_explicitly_allowed", [...KNOWN_NON_FILE_LOCATOR_SCHEMES].every((scheme) => classifyRepositoryFileReference(`${scheme}://contract/example`, paths.t2Manifest).kind === "known_non_file_locator"), [...KNOWN_NON_FILE_LOCATOR_SCHEMES]);

const invalidRepositoryReferenceParserCases = [
  { id: "absolute_path", value: "/tmp/on-site-build-package.v0.1.json", reason: "absolute_path_not_allowed" },
  { id: "Windows_drive_absolute_path", value: "C:/outside.json", reason: "absolute_path_not_allowed" },
  { id: "unknown_URI_scheme", value: "https://example.invalid/on-site-build-package.v0.1.json", reason: "invalid_or_unsupported_URI_scheme" },
  { id: "file_URI_scheme", value: "file:///tmp/on-site-build-package.v0.1.json", reason: "invalid_or_unsupported_URI_scheme" },
  { id: "arbitrary_URI_scheme", value: "unknown://example.invalid/on-site-build-package.v0.1.json", reason: "invalid_or_unsupported_URI_scheme" },
  { id: "known_scheme_single_slash", value: "logical:/tables", reason: "invalid_or_unsupported_URI_scheme" },
  { id: "known_scheme_opaque_payload", value: "logical:tables", reason: "invalid_or_unsupported_URI_scheme" },
  { id: "known_scheme_empty_payload", value: "logical://", reason: "invalid_or_unsupported_URI_scheme" },
  { id: "known_scheme_triple_slash", value: "logical:///tables", reason: "invalid_or_unsupported_URI_scheme" },
  { id: "known_scheme_mixed_case", value: "Logical://tables", reason: "invalid_or_unsupported_URI_scheme" },
  { id: "known_scheme_leading_whitespace", value: " logical://tables", reason: "URI_scheme_surrounding_whitespace_not_allowed" },
  { id: "known_scheme_trailing_whitespace", value: "logical://tables ", reason: "URI_scheme_surrounding_whitespace_not_allowed" },
  { id: "known_scheme_malformed_percent_payload", value: "logical://tables%ZZ", reason: "invalid_or_unsupported_URI_scheme" },
  { id: "known_scheme_fragment_payload", value: "logical://tables#extra", reason: "invalid_or_unsupported_URI_scheme" },
  { id: "known_scheme_query_payload", value: "logical://tables?x", reason: "invalid_or_unsupported_URI_scheme" },
  { id: "known_scheme_backslash", value: "logical:\\tables", reason: "backslash_not_allowed" },
  { id: "known_scheme_percent_slashes", value: "logical:%2F%2Ftables", reason: "percent_encoded_reference_alias_not_allowed" },
  { id: "percent_encoded_known_scheme", value: "logical%3A%2F%2Ftables", reason: "percent_encoded_reference_alias_not_allowed" },
  { id: "double_percent_encoded_known_scheme", value: "logical%253A%252F%252Ftables", reason: "percent_encoded_reference_alias_not_allowed" },
  { id: "percent_encoded_unknown_scheme", value: "https%3A%2F%2Fexample.invalid%2Fx.json", reason: "percent_encoded_reference_alias_not_allowed" },
  { id: "backslash_path", value: "..\\evidence\\on-site-evidence-template.json", reason: "backslash_not_allowed" },
  { id: "UNC_backslash_path", value: "\\\\server\\share\\on-site-evidence-template.json", reason: "backslash_not_allowed" },
  { id: "repository_unbounded_path", value: "../../../outside.json", reason: "reference_resolves_outside_repository" },
  { id: "uppercase_extension", value: "on-site-build-package.v0.1.JSON", reason: "non_canonical_file_extension" },
  { id: "empty_external_fragment", value: "on-site-build-package.v0.1.json#", reason: "empty_external_fragment" },
  { id: "invalid_fragment", value: "on-site-build-package.v0.1.json#not-a-JSON-Pointer", reason: "fragment_is_not_JSON_Pointer" },
  { id: "multiple_fragment_markers", value: "on-site-build-package.v0.1.json#/x#y", reason: "invalid_fragment_marker" },
  { id: "invalid_fragment_percent_encoding", value: "on-site-build-package.v0.1.json#/%ZZ", reason: "invalid_fragment_percent_encoding" },
  { id: "percent_encoded_fragment_alias", value: "../evidence/on-site-evidence-template.json#/%74ables/0", reason: "percent_encoded_fragment_alias_not_allowed" },
  { id: "percent_encoded_file_extension_alias", value: "./unknown%2Ejson", reason: "percent_encoded_reference_alias_not_allowed" },
  { id: "percent_encoded_query_alias", value: "unknown%2Ejson%3Fx", reason: "percent_encoded_reference_alias_not_allowed" },
  { id: "percent_encoded_uppercase_extension_alias", value: "unknown%2EJSON%3Fx", reason: "percent_encoded_reference_alias_not_allowed" },
  { id: "percent_encoded_space_before_extension_alias", value: "foo%20bar.json", reason: "percent_encoded_reference_alias_not_allowed" },
  { id: "percent_encoded_separator_alias", value: "dir%2Ffile.json", reason: "percent_encoded_reference_alias_not_allowed" },
  { id: "percent_encoded_fragment_delimiter_alias", value: "unknown.json%23/x", reason: "percent_encoded_reference_alias_not_allowed" },
  { id: "mixed_valid_invalid_percent_alias", value: "unknown%2Ejson%ZZ", reason: "percent_encoded_reference_alias_not_allowed" },
  { id: "percent_encoded_absolute_path_alias", value: "%2Ftmp%2Funknown%2Ejson%3Fx", reason: "percent_encoded_reference_alias_not_allowed" },
  { id: "percent_encoded_traversal_alias", value: "..%2F..%2Funknown%2Ejson%3Fx", reason: "percent_encoded_reference_alias_not_allowed" },
  { id: "percent_encoded_md_alias", value: "unknown%2Emd%3Fx", reason: "percent_encoded_reference_alias_not_allowed" },
  { id: "percent_encoded_mjs_alias", value: "unknown%2Emjs%23/x", reason: "percent_encoded_reference_alias_not_allowed" },
  { id: "percent_encoded_ts_alias", value: "unknown%2Ets%ZZ", reason: "percent_encoded_reference_alias_not_allowed" },
  { id: "double_percent_encoded_extension_alias", value: "unknown%252Ejson", reason: "percent_encoded_reference_alias_not_allowed" },
  { id: "percent_encoding_depth_exceeded", value: "unknown%252525252Ejson", reason: "percent_encoding_depth_exceeded" },
  { id: "malformed_percent_in_explicit_locator", value: "./unknown%ZZ", reason: "invalid_locator_percent_encoding" },
  { id: "invalid_JSON_Pointer_escape", value: "on-site-build-package.v0.1.json#/x/~2", reason: "invalid_JSON_Pointer_escape" },
];
const strictRepositoryReferenceNegativeFixtureResults = [];
for (const fixture of invalidRepositoryReferenceParserCases) {
  let resolverCalls = 0;
  const classification = classifyRepositoryFileReference(fixture.value, paths.buildPackage, (...arguments_) => {
    resolverCalls += 1;
    return resolveRepoReference(...arguments_);
  });
  const passed = classification.kind === "invalid_repository_file_reference"
    && classification.reason === fixture.reason
    && (!fixture.value.includes("%") || resolverCalls === 0);
  strictRepositoryReferenceNegativeFixtureResults.push({ ...fixture, passed, resolver_calls: resolverCalls, classification });
  assertInGroup("reference_graph_fail_closed", `strict_repository_reference_parser_rejects_${fixture.id}`, passed, classification);
}

let plainPercentTextResolverCalls = 0;
const plainPercentTextClassification = classifyRepositoryFileReference("latency 95%", paths.buildPackage, () => {
  plainPercentTextResolverCalls += 1;
  return { resolved: null, relative: null, bounded: false };
});
const ordinaryPercentTextFixtureResult = {
  value: "latency 95%",
  classification: plainPercentTextClassification,
  resolver_calls: plainPercentTextResolverCalls,
  passed: plainPercentTextClassification.kind === "not_repository_file_reference" && plainPercentTextResolverCalls === 0,
};
assertInGroup("reference_graph_fail_closed", "ordinary_latency_95_percent_text_is_not_a_reference_and_does_not_call_resolver", ordinaryPercentTextFixtureResult.passed, ordinaryPercentTextFixtureResult);
let deepOrdinaryPercentTextResolverCalls = 0;
const deepOrdinaryPercentTextClassification = classifyRepositoryFileReference("discount%2525252525", paths.buildPackage, () => {
  deepOrdinaryPercentTextResolverCalls += 1;
  return { resolved: null, relative: null, bounded: false };
});
const deepOrdinaryPercentTextFixtureResult = {
  value: "discount%2525252525",
  classification: deepOrdinaryPercentTextClassification,
  resolver_calls: deepOrdinaryPercentTextResolverCalls,
  passed: deepOrdinaryPercentTextClassification.kind === "not_repository_file_reference"
    && deepOrdinaryPercentTextResolverCalls === 0,
};
assertInGroup("reference_graph_fail_closed", "deep_percent_encoded_ordinary_text_is_not_misclassified_or_resolved", deepOrdinaryPercentTextFixtureResult.passed, deepOrdinaryPercentTextFixtureResult);

const directResolverFixtures = [
  { id: "bare_in_repository", source: paths.buildPackage, reference: "on-site-smoke-plan.v0.1.json", bounded: true },
  { id: "explicit_current_in_repository", source: paths.buildPackage, reference: "./on-site-smoke-plan.v0.1.json", bounded: true },
  { id: "explicit_parent_in_repository", source: paths.importPlan, reference: "../evidence/on-site-evidence-template.json", bounded: true },
  { id: "c9_valid_nested_directory", source: paths.buildPackage, reference: "nested/unknown.json", bounded: true },
  { id: "c9_valid_multiple_leading_parents", source: paths.t2Manifest, reference: "../../src/neoloop/contracts/model.ts", bounded: true },
  { id: "c10_valid_bare_ASCII", source: paths.buildPackage, reference: "unknown.json", bounded: true },
  { id: "c10_valid_explicit_current_ASCII", source: paths.buildPackage, reference: "./unknown.json", bounded: true },
  { id: "c10_valid_explicit_parent_ASCII", source: paths.buildPackage, reference: "../unknown.json", bounded: true },
  { id: "c10_valid_multiple_leading_parents_ASCII", source: paths.t2Manifest, reference: "../../unknown.json", bounded: true },
  { id: "c10_valid_nested_ASCII", source: paths.buildPackage, reference: "nested/unknown.json", bounded: true },
  { id: "empty", source: paths.buildPackage, reference: "", bounded: false },
  { id: "POSIX_absolute", source: paths.buildPackage, reference: "/tmp/outside.json", bounded: false },
  { id: "Windows_drive", source: paths.buildPackage, reference: "C:/outside.json", bounded: false },
  { id: "c9_drive_relative", source: paths.buildPackage, reference: "C:outside.json", bounded: false },
  { id: "c9_scheme_like", source: paths.buildPackage, reference: "logical:outside.json", bounded: false },
  { id: "Windows_backslash", source: paths.buildPackage, reference: "C:\\outside.json", bounded: false },
  { id: "UNC", source: paths.buildPackage, reference: "\\\\server\\share\\outside.json", bounded: false },
  { id: "fragment", source: paths.buildPackage, reference: "./file.json#/x", bounded: false },
  { id: "percent", source: paths.buildPackage, reference: "./file%2Ejson", bounded: false },
  { id: "c9_dot", source: paths.buildPackage, reference: ".", bounded: false },
  { id: "c9_dotdot", source: paths.buildPackage, reference: "..", bounded: false },
  { id: "c9_repeated_separator", source: paths.buildPackage, reference: "nested//outside.json", bounded: false },
  { id: "c9_embedded_current_segment", source: paths.buildPackage, reference: "nested/./outside.json", bounded: false },
  { id: "c9_embedded_parent_segment", source: paths.buildPackage, reference: "nested/../outside.json", bounded: false },
  { id: "c9_current_then_parent", source: paths.buildPackage, reference: "./../outside.json", bounded: false },
  { id: "c9_parent_then_current", source: paths.buildPackage, reference: ".././outside.json", bounded: false },
  { id: "c10_query", source: paths.buildPackage, reference: "nested/unknown.json?x", bounded: false, expected_reason: "invalid_locator_for_resolution" },
  { id: "c10_leading_space", source: paths.buildPackage, reference: " nested/unknown.json", bounded: false, expected_reason: "invalid_locator_for_resolution" },
  { id: "c10_trailing_space", source: paths.buildPackage, reference: "nested/unknown.json ", bounded: false, expected_reason: "invalid_locator_for_resolution" },
  { id: "c10_segment_space", source: paths.buildPackage, reference: "nested dir/unknown.json", bounded: false, expected_reason: "invalid_locator_for_resolution" },
  { id: "c10_segment_tab", source: paths.buildPackage, reference: "nested/\tunknown.json", bounded: false, expected_reason: "invalid_locator_for_resolution" },
  { id: "c10_segment_control", source: paths.buildPackage, reference: "nested/\u0001unknown.json", bounded: false, expected_reason: "invalid_locator_for_resolution" },
  { id: "c10_segment_NBSP", source: paths.buildPackage, reference: "nested/\u00A0unknown.json", bounded: false, expected_reason: "invalid_locator_for_resolution" },
  { id: "c10_segment_colon", source: paths.buildPackage, reference: "nested/unknown:copy.json", bounded: false, expected_reason: "invalid_locator_for_resolution" },
  { id: "c10_segment_wildcard", source: paths.buildPackage, reference: "nested/unknown*.json", bounded: false, expected_reason: "invalid_locator_for_resolution" },
  { id: "c10_non_ASCII_segment", source: paths.buildPackage, reference: "嵌套/unknown.json", bounded: false, expected_reason: "invalid_locator_for_resolution" },
  { id: "unbounded_traversal", source: paths.buildPackage, reference: "../../../outside.json", bounded: false },
  { id: "source_outside_repository", source: "/tmp/outside-source.json", reference: "./file.json", bounded: false },
  { id: "source_is_repository_root", source: repositoryRoot, reference: "./file.json", bounded: false },
];
const directResolverFixtureResults = [];
for (const fixture of directResolverFixtures) {
  const resolution = resolveRepoReference(fixture.source, fixture.reference);
  const passed = resolution.bounded === fixture.bounded
    && (fixture.bounded || resolution.resolved === null)
    && (fixture.expected_reason === undefined || resolution.reason === fixture.expected_reason);
  directResolverFixtureResults.push({ ...fixture, passed, resolution });
  assertInGroup("reference_graph_fail_closed", `POSIX_repository_resolver_${fixture.id}_bounded_is_${fixture.bounded}`, passed, { fixture, resolution });
}
c9IncrementalFixtureResults.resolver_boundaries = directResolverFixtureResults.filter((fixture) => fixture.id.startsWith("c9_"));
assertInGroup("reference_graph_fail_closed", "C9_POSIX_resolver_accepts_only_canonical_nested_or_leading_parent_paths", c9IncrementalFixtureResults.resolver_boundaries.length === 11
  && c9IncrementalFixtureResults.resolver_boundaries.every((fixture) => fixture.passed
    && (fixture.bounded
      ? fixture.resolution.resolved !== null
      : fixture.resolution.resolved === null && fixture.resolution.bounded === false)), c9IncrementalFixtureResults.resolver_boundaries);
c10IncrementalFixtureResults.resolver_boundaries = directResolverFixtureResults.filter((fixture) => fixture.id.startsWith("c10_"));
assertInGroup("reference_graph_fail_closed", "C10_shared_ASCII_segment_resolver_accepts_five_canonical_forms_and_rejects_ten_character_boundary_cases", c10IncrementalFixtureResults.resolver_boundaries.length === 15
  && c10IncrementalFixtureResults.resolver_boundaries.every((fixture) => fixture.passed
    && (fixture.bounded
      ? fixture.resolution.resolved !== null
      : fixture.resolution.resolved === null
        && fixture.resolution.bounded === false
        && fixture.resolution.reason === "invalid_locator_for_resolution")), c10IncrementalFixtureResults.resolver_boundaries);

const deletedImportEvidenceFragmentArtifacts = cloneStructuredJsonArtifacts();
deletedImportEvidenceFragmentArtifacts.get("import").value.preflight.evidence_unit_refs.pop();
const deletedImportEvidenceFragmentAnalysis = analyzeStructuredJsonReferenceGraph(deletedImportEvidenceFragmentArtifacts).fragment_reference_analysis;
assertInGroup("reference_graph_fail_closed", "deleting_one_of_31_import_evidence_fragments_is_rejected", !deletedImportEvidenceFragmentAnalysis.exact
  && deletedImportEvidenceFragmentAnalysis.references.length === 30
  && deletedImportEvidenceFragmentAnalysis.missing.length === 1, deletedImportEvidenceFragmentAnalysis);

const addedImportEvidenceFragmentArtifacts = cloneStructuredJsonArtifacts();
addedImportEvidenceFragmentArtifacts.get("import").value.preflight.evidence_unit_refs.push(`${EXPECTED_IMPORT_EVIDENCE_FRAGMENT_LOCATOR}#/tables/0`);
const addedImportEvidenceFragmentAnalysis = analyzeStructuredJsonReferenceGraph(addedImportEvidenceFragmentArtifacts).fragment_reference_analysis;
assertInGroup("reference_graph_fail_closed", "adding_a_32nd_import_evidence_fragment_is_rejected", !addedImportEvidenceFragmentAnalysis.exact
  && addedImportEvidenceFragmentAnalysis.references.length === 32
  && addedImportEvidenceFragmentAnalysis.unexpected.some((reference) => reference.pointer === "/preflight/evidence_unit_refs/10"), addedImportEvidenceFragmentAnalysis);

const outOfRangeImportEvidenceFragmentArtifacts = cloneStructuredJsonArtifacts();
outOfRangeImportEvidenceFragmentArtifacts.get("import").value.table_batches[0].evidence_unit_ref = `${EXPECTED_IMPORT_EVIDENCE_FRAGMENT_LOCATOR}#/tables/999`;
const outOfRangeImportEvidenceFragmentAnalysis = analyzeStructuredJsonReferenceGraph(outOfRangeImportEvidenceFragmentArtifacts).fragment_reference_analysis;
assertInGroup("reference_graph_fail_closed", "out_of_range_import_evidence_table_fragment_is_rejected", !outOfRangeImportEvidenceFragmentAnalysis.exact
  && outOfRangeImportEvidenceFragmentAnalysis.unexpected.some((reference) => reference.pointer === "/table_batches/0/evidence_unit_ref"
    && reference.fragment === "#/tables/999"
    && !resolveJsonPointerFragment(outOfRangeImportEvidenceFragmentArtifacts.get("evidence").value, reference.fragment).valid), outOfRangeImportEvidenceFragmentAnalysis);

const otherFileImportEvidenceFragmentArtifacts = cloneStructuredJsonArtifacts();
otherFileImportEvidenceFragmentArtifacts.get("import").value.table_batches[0].evidence_unit_ref = "./on-site-build-package.v0.1.json#/workflows/5";
const otherFileImportEvidenceFragmentAnalysis = analyzeStructuredJsonReferenceGraph(otherFileImportEvidenceFragmentArtifacts).fragment_reference_analysis;
assertInGroup("reference_graph_fail_closed", "valid_fragment_retargeted_to_another_file_is_rejected", !otherFileImportEvidenceFragmentAnalysis.exact
  && resolveJsonPointerFragment(otherFileImportEvidenceFragmentArtifacts.get("build").value, "#/workflows/5").valid
  && otherFileImportEvidenceFragmentAnalysis.unexpected.some((reference) => reference.pointer === "/table_batches/0/evidence_unit_ref"
    && reference.resolved_target === "build"), otherFileImportEvidenceFragmentAnalysis);

const injectedArbitraryKeyLogicalFragmentBackReferenceArtifacts = cloneStructuredJsonArtifacts();
injectedArbitraryKeyLogicalFragmentBackReferenceArtifacts.get("logical").value.build_package = "../../feishu/manifests/on-site-build-package.v0.1.json#/x";
const injectedArbitraryKeyLogicalFragmentBackReferenceAnalysis = analyzeStructuredJsonReferenceGraph(injectedArbitraryKeyLogicalFragmentBackReferenceArtifacts);
assertInGroup("reference_graph_fail_closed", "arbitrary_key_logical_to_build_fragment_is_unexpected_back_reference_and_cycle", !injectedArbitraryKeyLogicalFragmentBackReferenceAnalysis.fragment_reference_analysis.exact
  && injectedArbitraryKeyLogicalFragmentBackReferenceAnalysis.unexpectedEdges.some((edge) => edge.source === "logical"
    && edge.target === "build"
    && edge.pointer === "/build_package"
    && edge.reference_kind === "unexpected_fragment_reference")
  && injectedArbitraryKeyLogicalFragmentBackReferenceAnalysis.hasCycle, injectedArbitraryKeyLogicalFragmentBackReferenceAnalysis);

const injectedArbitraryKeyBuildFragmentBackReferenceArtifacts = cloneStructuredJsonArtifacts();
injectedArbitraryKeyBuildFragmentBackReferenceArtifacts.get("build").value.smoke_reference = "./on-site-smoke-plan.v0.1.json#/x";
const injectedArbitraryKeyBuildFragmentBackReferenceAnalysis = analyzeStructuredJsonReferenceGraph(injectedArbitraryKeyBuildFragmentBackReferenceArtifacts);
assertInGroup("reference_graph_fail_closed", "arbitrary_key_build_to_smoke_fragment_is_unexpected_back_reference_without_cycle", !injectedArbitraryKeyBuildFragmentBackReferenceAnalysis.fragment_reference_analysis.exact
  && injectedArbitraryKeyBuildFragmentBackReferenceAnalysis.unexpectedEdges.some((edge) => edge.source === "build"
    && edge.target === "smoke"
    && edge.pointer === "/smoke_reference"
    && edge.reference_kind === "unexpected_fragment_reference")
  && injectedArbitraryKeyBuildFragmentBackReferenceAnalysis.hasCycle === false, injectedArbitraryKeyBuildFragmentBackReferenceAnalysis);

const injectedBareLogicalFragmentBackReferenceArtifacts = cloneStructuredJsonArtifacts();
injectedBareLogicalFragmentBackReferenceArtifacts.get("logical").value.build_package = "on-site-build-package.v0.1.json#/x";
const injectedBareLogicalFragmentBackReferenceAnalysis = analyzeStructuredJsonReferenceGraph(injectedBareLogicalFragmentBackReferenceArtifacts);
assertInGroup("reference_graph_fail_closed", "bare_logical_to_build_fragment_is_unexpected_back_reference_and_cycle", !injectedBareLogicalFragmentBackReferenceAnalysis.fragment_reference_analysis.exact
  && injectedBareLogicalFragmentBackReferenceAnalysis.unexpectedEdges.some((edge) => edge.source === "logical"
    && edge.target === "build"
    && edge.pointer === "/build_package"
    && edge.path === "on-site-build-package.v0.1.json#/x"
    && edge.reference_kind === "unexpected_fragment_reference")
  && injectedBareLogicalFragmentBackReferenceAnalysis.hasCycle, injectedBareLogicalFragmentBackReferenceAnalysis);

const injectedBareBuildFragmentBackReferenceArtifacts = cloneStructuredJsonArtifacts();
injectedBareBuildFragmentBackReferenceArtifacts.get("build").value.smoke_reference = "on-site-smoke-plan.v0.1.json#/x";
const injectedBareBuildFragmentBackReferenceAnalysis = analyzeStructuredJsonReferenceGraph(injectedBareBuildFragmentBackReferenceArtifacts);
assertInGroup("reference_graph_fail_closed", "bare_build_to_smoke_fragment_is_unexpected_back_reference_without_cycle", !injectedBareBuildFragmentBackReferenceAnalysis.fragment_reference_analysis.exact
  && injectedBareBuildFragmentBackReferenceAnalysis.unexpectedEdges.some((edge) => edge.source === "build"
    && edge.target === "smoke"
    && edge.pointer === "/smoke_reference"
    && edge.path === "on-site-smoke-plan.v0.1.json#/x"
    && edge.reference_kind === "unexpected_fragment_reference")
  && injectedBareBuildFragmentBackReferenceAnalysis.hasCycle === false, injectedBareBuildFragmentBackReferenceAnalysis);

const injectedArbitraryKeyLogicalBackReferenceArtifacts = cloneStructuredJsonArtifacts();
injectedArbitraryKeyLogicalBackReferenceArtifacts.get("logical").value.build_package = "../../feishu/manifests/on-site-build-package.v0.1.json";
const injectedArbitraryKeyLogicalBackReferenceAnalysis = analyzeStructuredJsonReferenceGraph(injectedArbitraryKeyLogicalBackReferenceArtifacts);
assertInGroup("reference_graph_fail_closed", "arbitrary_key_logical_to_build_is_detected_as_back_reference_and_cycle", injectedArbitraryKeyLogicalBackReferenceAnalysis.unexpectedEdges.some((edge) => edge.source === "logical"
  && edge.target === "build"
  && edge.pointer === "/build_package")
  && injectedArbitraryKeyLogicalBackReferenceAnalysis.hasCycle, injectedArbitraryKeyLogicalBackReferenceAnalysis);

const injectedArbitraryKeyBuildBackReferenceArtifacts = cloneStructuredJsonArtifacts();
injectedArbitraryKeyBuildBackReferenceArtifacts.get("build").value.smoke_reference = "./on-site-smoke-plan.v0.1.json";
const injectedArbitraryKeyBuildBackReferenceAnalysis = analyzeStructuredJsonReferenceGraph(injectedArbitraryKeyBuildBackReferenceArtifacts);
assertInGroup("reference_graph_fail_closed", "arbitrary_key_build_to_smoke_is_detected_as_back_reference_without_cycle", injectedArbitraryKeyBuildBackReferenceAnalysis.unexpectedEdges.some((edge) => edge.source === "build"
  && edge.target === "smoke"
  && edge.pointer === "/smoke_reference")
  && injectedArbitraryKeyBuildBackReferenceAnalysis.hasCycle === false, injectedArbitraryKeyBuildBackReferenceAnalysis);

const injectedBareLogicalBackReferenceArtifacts = cloneStructuredJsonArtifacts();
injectedBareLogicalBackReferenceArtifacts.get("logical").value.build_package = "on-site-build-package.v0.1.json";
const injectedBareLogicalBackReferenceAnalysis = analyzeStructuredJsonReferenceGraph(injectedBareLogicalBackReferenceArtifacts);
assertInGroup("reference_graph_fail_closed", "bare_logical_to_build_is_detected_as_back_reference_and_cycle", injectedBareLogicalBackReferenceAnalysis.unexpectedEdges.some((edge) => edge.source === "logical"
  && edge.target === "build"
  && edge.pointer === "/build_package"
  && edge.path === "on-site-build-package.v0.1.json")
  && injectedBareLogicalBackReferenceAnalysis.hasCycle, injectedBareLogicalBackReferenceAnalysis);

const injectedBareBuildBackReferenceArtifacts = cloneStructuredJsonArtifacts();
injectedBareBuildBackReferenceArtifacts.get("build").value.smoke_reference = "on-site-smoke-plan.v0.1.json";
const injectedBareBuildBackReferenceAnalysis = analyzeStructuredJsonReferenceGraph(injectedBareBuildBackReferenceArtifacts);
assertInGroup("reference_graph_fail_closed", "bare_build_to_smoke_is_detected_as_back_reference_without_cycle", injectedBareBuildBackReferenceAnalysis.unexpectedEdges.some((edge) => edge.source === "build"
  && edge.target === "smoke"
  && edge.pointer === "/smoke_reference"
  && edge.path === "on-site-smoke-plan.v0.1.json")
  && injectedBareBuildBackReferenceAnalysis.hasCycle === false, injectedBareBuildBackReferenceAnalysis);

const injectedLogicalBackReferenceArtifacts = cloneStructuredJsonArtifacts();
const injectedLogicalToBuildPath = "../../feishu/manifests/on-site-build-package.v0.1.json";
injectedLogicalBackReferenceArtifacts.get("logical").value.contract_sources.r10_feishu_reopen_projector_freeze.core = injectedLogicalToBuildPath;
const injectedLogicalBackReferenceAnalysis = analyzeStructuredJsonReferenceGraph(injectedLogicalBackReferenceArtifacts);
assertInGroup("reference_graph_fail_closed", "injected_logical_to_build_is_detected_as_structured_back_reference", injectedLogicalBackReferenceAnalysis.unexpectedEdges.some((edge) => edge.source === "logical" && edge.target === "build"), injectedLogicalBackReferenceAnalysis);
assertInGroup("reference_graph_fail_closed", "injected_logical_to_build_is_detected_as_reference_cycle", injectedLogicalBackReferenceAnalysis.hasCycle, injectedLogicalBackReferenceAnalysis);

const injectedProbeImportCycleArtifacts = cloneStructuredJsonArtifacts();
injectedProbeImportCycleArtifacts.get("probe").value.injected_import_reference = { path: "./base-import-batch-plan.v0.1.json" };
injectedProbeImportCycleArtifacts.get("import").value.injected_probe_reference = { path: "./day-1-probe-suite.v0.1.json" };
const injectedProbeImportCycleAnalysis = analyzeStructuredJsonReferenceGraph(injectedProbeImportCycleArtifacts);
assertInGroup("reference_graph_fail_closed", "injected_probe_import_cycle_is_detected_from_actual_JSON_references", injectedProbeImportCycleAnalysis.unexpectedEdges.length === 2
  && injectedProbeImportCycleAnalysis.hasCycle, injectedProbeImportCycleAnalysis);

const injectedAcyclicBackReferenceArtifacts = cloneStructuredJsonArtifacts();
injectedAcyclicBackReferenceArtifacts.get("build").value.injected_smoke_reference = { path: "./on-site-smoke-plan.v0.1.json" };
const injectedAcyclicBackReferenceAnalysis = analyzeStructuredJsonReferenceGraph(injectedAcyclicBackReferenceArtifacts);
assertInGroup("reference_graph_fail_closed", "injected_acyclic_build_to_smoke_back_reference_fails_back_reference_without_false_cycle", injectedAcyclicBackReferenceAnalysis.unexpectedEdges.length === 1
  && injectedAcyclicBackReferenceAnalysis.hasCycle === false, injectedAcyclicBackReferenceAnalysis);

for (const fixture of invalidRepositoryReferenceParserCases) {
  const injectedInvalidReferenceArtifacts = cloneStructuredJsonArtifacts();
  injectedInvalidReferenceArtifacts.get("build").value.strict_reference_probe = fixture.value;
  const analysis = analyzeStructuredJsonReferenceGraph(injectedInvalidReferenceArtifacts);
  assertInGroup("reference_graph_fail_closed", `artifact_graph_rejects_${fixture.id}_instead_of_dropping_it`, analysis.invalid_references.some((reference) => reference.source === "build"
    && reference.pointer === "/strict_reference_probe"
    && reference.reason === fixture.reason), analysis.invalid_references);
}

const buildAndEvidenceArtifactLocators = [
  ...collectArtifactFileLocators(buildPackage, paths.buildPackage, "build", graphTargetByPath, validatedHashedPathPointers),
  ...collectArtifactFileLocators(evidenceTemplate, paths.evidenceTemplate, "evidence", graphTargetByPath, validatedHashedPathPointers),
];
const locatorComparable = (locator) => JSON.stringify({
  source: locator.source,
  target: locator.target,
  path: locator.path,
  trail: locator.trail,
  reference_kind: locator.reference_kind ?? null,
  excluded_from_freeze_graph: locator.excluded_from_freeze_graph ?? null,
});
const evidencePathShaObjects = collectJsonFindings(evidenceTemplate, (current, trail) => current !== null
  && typeof current === "object"
  && !Array.isArray(current)
  && Object.hasOwn(current, "path")
  && Object.hasOwn(current, "sha256")
  ? { trail: trail.join("."), keys: Object.keys(current) }
  : null);
const expectedEvidenceNullShaPointers = [
  "/permission_checks/1/r10_selector_and_execution_mode_evidence_contract/permission_snapshot_sha256",
  "/permission_checks/2/r10_recurrence_visibility_and_attestation_evidence_contract/capability_attestation_sha256",
  "/permission_checks/2/r10_recurrence_visibility_and_attestation_evidence_contract/permission_snapshot_sha256",
  "/workflows/5/r10_reopen_projection_evidence_contract/current_onsite_state/capability_attestation_sha256",
  "/workflows/5/r10_reopen_projection_evidence_contract/current_onsite_state/permission_snapshot_sha256",
];
const expectedEvidenceSha256PresencePointers = [
  "/permission_checks/5/r10_reopen_authorization_evidence_contract/actual_source_receipt_sha256_presence",
  "/tables/3/r10_cluster_projection_evidence_contract/actual_before_sha256_presence",
  "/tables/3/r10_cluster_projection_evidence_contract/actual_after_sha256_presence",
  "/tables/3/r10_cluster_projection_evidence_contract/actual_resolved_record_locator_sha256_presence",
  "/tables/4/r10_improvement_projection_evidence_contract/actual_before_sha256_presence",
  "/tables/4/r10_improvement_projection_evidence_contract/actual_after_sha256_presence",
  "/tables/4/r10_improvement_projection_evidence_contract/actual_resolved_record_locator_sha256_presence",
];
function collectEvidenceSha256PresenceSlots(value) {
  return collectJsonFindings(value, (current, trail) => typeof trail.at(-1) === "string" && trail.at(-1).endsWith("_sha256_presence")
    ? { pointer: toJsonPointer(trail), value: current }
    : null);
}
function evidenceNullSlotSetIsExact(observed, expectedPointers) {
  return equalArrays(
    sorted(observed.map((slot) => JSON.stringify(slot))),
    sorted(expectedPointers.map((pointer) => JSON.stringify({ pointer, value: null }))),
  );
}
const evidenceShaNamedSlots = collectJsonFindings(evidenceTemplate, (current, trail) => typeof trail.at(-1) === "string"
  && (trail.at(-1) === "sha256" || trail.at(-1).endsWith("_sha256"))
  ? { pointer: toJsonPointer(trail), value: current }
  : null);
const evidenceSha256PresenceSlots = collectEvidenceSha256PresenceSlots(evidenceTemplate);
const evidenceNonNullShaFields = collectJsonFindings(evidenceTemplate, (current, trail) => typeof trail.at(-1) === "string"
  && (trail.at(-1) === "sha256" || trail.at(-1).endsWith("_sha256"))
  && current !== null
  ? { trail: trail.join("."), value_type: typeof current }
  : null);
const evidenceShaScalars = collectJsonFindings(evidenceTemplate, (current, trail) => typeof current === "string" && /^[0-9a-f]{64}$/i.test(current)
  ? { trail: trail.join("."), value: current }
  : null);
const evidenceSourcesKeys = collectJsonFindings(evidenceTemplate, (_current, trail) => trail.at(-1) === "sources"
  ? { trail: trail.join(".") }
  : null);
const evidenceRelativeFileLocators = collectJsonFindings(evidenceTemplate, (current, trail) => {
  const classification = classifyRepositoryFileReference(current, paths.evidenceTemplate);
  return classification.kind === "repository_file_reference"
    ? { path: current, trail: trail.join(".") }
    : null;
});
assertInGroup("reference_graph", "evidence_SHA_slots_are_the_exact_null_only_allowlist", equalArrays(
  sorted(evidenceShaNamedSlots.map((slot) => JSON.stringify(slot))),
  sorted(expectedEvidenceNullShaPointers.map((pointer) => JSON.stringify({ pointer, value: null }))),
), { observed: evidenceShaNamedSlots, expected: expectedEvidenceNullShaPointers });
assertInGroup("reference_graph", "evidence_SHA256_presence_slots_are_the_exact_seven_null_only_allowlist", evidenceNullSlotSetIsExact(
  evidenceSha256PresenceSlots,
  expectedEvidenceSha256PresencePointers,
), { observed: evidenceSha256PresenceSlots, expected: expectedEvidenceSha256PresencePointers });

const evidencePresenceNegativeFixtures = [
  {
    id: "deleted",
    mutate(value) {
      delete value.permission_checks[5].r10_reopen_authorization_evidence_contract.actual_source_receipt_sha256_presence;
    },
  },
  {
    id: "renamed",
    mutate(value) {
      const contract = value.tables[3].r10_cluster_projection_evidence_contract;
      contract.actual_before_sha_presence = contract.actual_before_sha256_presence;
      delete contract.actual_before_sha256_presence;
    },
  },
  {
    id: "added",
    mutate(value) {
      value.unexpected_sha256_presence = null;
    },
  },
  {
    id: "true_value",
    mutate(value) {
      value.tables[4].r10_improvement_projection_evidence_contract.actual_after_sha256_presence = true;
    },
  },
  {
    id: "short_string_value",
    mutate(value) {
      value.tables[4].r10_improvement_projection_evidence_contract.actual_resolved_record_locator_sha256_presence = "short";
    },
  },
];
for (const fixture of evidencePresenceNegativeFixtures) {
  const mutatedEvidence = JSON.parse(evidenceTemplateText);
  fixture.mutate(mutatedEvidence);
  const observed = collectEvidenceSha256PresenceSlots(mutatedEvidence);
  assertInGroup("evidence_sha_slot_fail_closed", `evidence_SHA256_presence_rejects_${fixture.id}`, !evidenceNullSlotSetIsExact(
    observed,
    expectedEvidenceSha256PresencePointers,
  ), observed);
}
assertInGroup("reference_graph", "evidence_template_contains_no_SHA_pin_sources_object_or_non_null_SHA_material", evidencePathShaObjects.length === 0
  && evidenceNonNullShaFields.length === 0
  && evidenceShaScalars.length === 0
  && evidenceSourcesKeys.length === 0, {
  path_sha256_objects: evidencePathShaObjects,
  non_null_sha256_fields: evidenceNonNullShaFields,
  sha256_scalars: evidenceShaScalars,
  sources_keys: evidenceSourcesKeys,
});
assertInGroup("reference_graph", "build_and_evidence_artifact_locators_match_exact_two_item_allowlist", equalArrays(
  sorted(buildAndEvidenceArtifactLocators.map(locatorComparable)),
  sorted(expectedNonHashLocators.map(locatorComparable)),
)
  && equalArrays(evidenceRelativeFileLocators.map((locator) => JSON.stringify(locator)), [JSON.stringify({
    path: "../manifests/neoloop-logical-manifest.v0.1.json",
    trail: "source_manifest",
  })]), { observed: buildAndEvidenceArtifactLocators, expected: expectedNonHashLocators, evidence_relative_file_locators: evidenceRelativeFileLocators });
assertInGroup("reference_graph", "build_locator_is_explicitly_non_hash_while_evidence_locator_is_plain_path_only", exactFlatObject(buildPackage.evidence_template, {
  path: "../evidence/on-site-evidence-template.json",
  reference_kind: "non_hash_locator",
  excluded_from_freeze_graph: true,
})
  && evidenceTemplate.source_manifest === "../manifests/neoloop-logical-manifest.v0.1.json"
  && !Object.hasOwn(evidenceTemplate, "source_manifest_sha256")
  && buildAndEvidenceArtifactLocators.every((locator) => locator.bounded), buildAndEvidenceArtifactLocators);
const nonHashLocators = buildAndEvidenceArtifactLocators.map((locator) => ({
  source: locator.source,
  target: locator.target,
  path: locator.path,
  trail: locator.trail,
  reference_kind: locator.reference_kind ?? null,
  excluded_from_freeze_graph: locator.excluded_from_freeze_graph ?? null,
}));

const permissionRows = permissionMatrix.split(/\r?\n/).filter((line) => /^\| P\d{2} \|/.test(line));
const permissionStatuses = permissionRows.map((line) => line.split("|").map((part) => part.trim()).filter(Boolean).slice(0, 3));
assert("permission_matrix_has_p01_to_p13", equalArrays(permissionStatuses.map((row) => row[0]), Array.from({ length: 13 }, (_, index) => `P${String(index + 1).padStart(2, "0")}`)), permissionStatuses);
assert("permission_matrix_remains_untested", permissionStatuses.every((row) => row[2] === "未测试"), permissionStatuses);
assert("manifest_remains_draft", t2.deployment_status === "draft_not_configured_in_feishu" && t2.fact_class === "solution_design", {
  deployment_status: t2.deployment_status,
  fact_class: t2.fact_class,
});

const sourceEntries = [
  { id: "canonical_manifest", ...sourceDescriptor(paths.t1Manifest, t1ManifestText) },
  ...canonicalTableSources,
  { id: "logical_manifest", ...sourceDescriptor(paths.t2Manifest, t2ManifestText) },
  { id: "permission_matrix", ...sourceDescriptor(paths.t2PermissionMatrix, permissionMatrix) },
  { id: "typescript_canonical_contract", ...sourceDescriptor(paths.t3Contract, t3Contract) },
  { id: "R6_record", ...sourceDescriptor(paths.t3R6Record, t3R6Record) },
  { id: "R7_record", ...sourceDescriptor(paths.t3R7Record, t3R7Record) },
  { id: "R9_record", ...sourceDescriptor(paths.t3R9Record, t3R9Record) },
  { id: "R9_model", ...sourceDescriptor(paths.t3W6Model, t3W6Model) },
  { id: "R9_repository", ...sourceDescriptor(paths.t3Repository, t3Repository) },
  { id: "R9_w6_improvement", ...sourceDescriptor(paths.t3W6Improvement, t3W6Improvement) },
  { id: "R9_index", ...sourceDescriptor(paths.t3Index, t3Index) },
  { id: "R9_repository_test", ...sourceDescriptor(paths.t3W6RepositoryTest, t3W6RepositoryTest) },
  { id: "R9_w6_improvement_test", ...sourceDescriptor(paths.t3W6ImprovementTest, t3W6ImprovementTest) },
  { id: "R10_core", ...sourceDescriptor(paths.r10Core, r10Core) },
  { id: "R10_test", ...sourceDescriptor(paths.r10Test, r10Test) },
  { id: "R10_record", ...sourceDescriptor(paths.r10Record, r10Record) },
  { id: "build_package", ...sourceDescriptor(paths.buildPackage, buildPackageText) },
  { id: "probe_suite", ...sourceDescriptor(paths.probeSuite, probeSuiteText) },
  { id: "permission_results", ...sourceDescriptor(paths.permissionResults, permissionResultsText) },
  { id: "permission_acceptance", ...sourceDescriptor(paths.permissionAcceptance, permissionAcceptanceText) },
  { id: "import_plan", ...sourceDescriptor(paths.importPlan, importPlanText) },
  { id: "smoke_plan", ...sourceDescriptor(paths.smokePlan, smokePlanText) },
  { id: "evidence_template", ...sourceDescriptor(paths.evidenceTemplate, evidenceTemplateText) },
  { id: "canonical_main_story", ...sourceDescriptor(paths.mainStory, mainStoryText) },
  { id: "canonical_failure_drills", ...sourceDescriptor(paths.failureDrills, failureDrillsText) },
];

const checkGroups = Object.fromEntries([...new Set(checks.map((check) => check.group))].map((group) => {
  const groupChecks = checks.filter((check) => check.group === group);
  const failedChecks = groupChecks.filter((check) => !check.ok);
  return [group, {
    status: failedChecks.length === 0 ? "passed" : "failed",
    passed_checks: groupChecks.filter((check) => check.ok).length,
    failed_checks: failedChecks.map((check) => ({ name: check.name, details: check.details })),
  }];
}));
const failedChecks = checks.filter((check) => !check.ok).map((check) => ({
  name: check.name,
  group: check.group,
  details: check.details,
}));

const reportRootExactKeys = [
  "report_schema_version", "status", "mode", "summary", "check_groups", "failed_checks", "sources", "versions",
  "permission_result_contract", "strict_JSON_inputs", "r8_negative_fixture_results", "c9_incremental_fixture_results",
  "c10_incremental_fixture_results", "c11_incremental_fixture_results", "c12_incremental_fixture_results",
  "c13_incremental_fixture_results", "c13_accepted_security_tradeoff", "c12_accepted_security_tradeoff",
  "reference_graph", "upstream_conflicts", "errors", "table_field_checks",
];

const result = {
  report_schema_version: PERMISSION_CONTRACT_REPORT_SCHEMA_VERSION,
  status: errors.length > 0 ? "failed" : upstreamConflicts.length > 0 ? "upstream_conflict" : "passed",
  mode: "read_only",
  summary: {
    passed_checks: checks.filter((check) => check.ok).length,
    failed_checks: failedChecks.length,
    upstream_conflicts: upstreamConflicts.length,
  },
  check_groups: checkGroups,
  failed_checks: failedChecks,
  sources: sourceEntries,
  versions: {
    logical_manifest_version: t2.manifest_version,
    canonical_schema_version: t1.schema_version,
    logical_default_schema_version: t2.default_schema_version,
    typescript_schema_version: t3.schemaVersion,
    build_package_version: buildPackage.package_version,
    probe_suite_version: probeSuite.suite_version,
    permission_results_template_version: permissionResults.template_version,
    import_plan_version: importPlan.plan_version,
    smoke_plan_version: smokePlan.plan_version,
    evidence_template_version: evidenceTemplate.template_version,
  },
  permission_result_contract: {
    attestation_schema_version: PERMISSION_RESULT_ATTESTATION_SCHEMA_VERSION,
    source_freeze_version: PERMISSION_CONTENT_SOURCE_FREEZE_VERSION,
    status: checkGroups[permissionResultGroup]?.status ?? "failed",
    check_group: permissionResultGroup,
    assertion_count: checks.filter((check) => check.group === permissionResultGroup).length,
    failed_assertion_count: checks.filter((check) => check.group === permissionResultGroup && !check.ok).length,
    negative_fixture_count: permissionResultNegativeFixtures.length,
    negative_fixtures: permissionResultNegativeFixtures.map((fixture) => ({ id: fixture.id, rejected: fixture.accepted === false })),
    negative_fixture_name_digest: permissionNegativeFixtureNameDigest,
    versions: {
      probe_suite: probeSuite.suite_version,
      permission_results: permissionResults.template_version,
      evidence_template: evidenceTemplate.template_version,
    },
    counts: {
      state_truth_rows: expectedPermissionStateRows.length,
      permission_records: permissionRecords.length,
      exact_fields: expectedPermissionExactFields.length,
      required_runtime_fields: expectedPermissionRuntimeFields.length,
      declared_field_types: Object.keys(expectedPermissionFieldTypes).length,
      P03_phases: Object.keys(p03OnsiteRecord.p03_phase_observations).length,
    },
    canonical_evidence_source: "permission_result.evidence_index",
    canonical_evidence_binding: "permission_result.evidence_and_same_Pnn_on_site.structured_evidence_index_canonical_deep_equal",
    P03_phase_binding: "phase_evidence_indexes_canonical_deep_equal_parent_P03_indexes_filtered_by_capture_phase_in_same_order_with_unique_evidence_id",
    P06_dependencies: probeSuite.probes[5].depends_on,
    P07_dependencies: probeSuite.probes[6].depends_on,
    sources: permissionContractSources,
    source_count: permissionContractSources.length,
    source_digest: permissionContractSourceDigest,
    current_execution_status: "not_tested",
    real_external_operations: 0,
  },
  strict_JSON_inputs: {
    enforced_before_JSON_parse: true,
    artifact_count: strictRawJsonInputAnalyses.length,
    artifacts: strictRawJsonInputAnalyses.map(({ source, file, analysis }) => ({
      source,
      path: path.relative(repositoryRoot, file).split(path.sep).join("/"),
      duplicate_key_count: analysis.duplicate_keys.length,
      invalid_number_count: analysis.number_findings.length,
      syntax_error_count: analysis.syntax_errors.length,
      valid: analysis.valid,
    })),
    number_contract: "finite_and_not_negative_zero",
    duplicate_key_identity: "decoded_JSON_string_per_object_scope",
  },
  r8_negative_fixture_results: {
    strict_raw_JSON: strictRawJsonNegativeFixtureResults,
    canonical_JSON_numbers: canonicalJsonNumberFixtureResults,
    JSON_Pointer_array_semantics: jsonPointerArraySemanticFixtureResults,
    repository_reference_parser: strictRepositoryReferenceNegativeFixtureResults,
    ordinary_percent_text: [ordinaryPercentTextFixtureResult, deepOrdinaryPercentTextFixtureResult],
    POSIX_repository_resolver: directResolverFixtureResults,
    literal_reference_closure_isolation: literalReferenceClosureNegativeFixtureResults,
  },
  c9_incremental_fixture_results: c9IncrementalFixtureResults,
  c10_incremental_fixture_results: c10IncrementalFixtureResults,
  c11_incremental_fixture_results: c11IncrementalFixtureResults,
  c12_incremental_fixture_results: c12IncrementalFixtureResults,
  c13_incremental_fixture_results: c13IncrementalFixtureResults,
  c13_accepted_security_tradeoff: {
    status: "accepted",
    policy_scope: "fragment_is_strong_path_syntax_but_terminal_punctuation_requires_path_shaped_prefix",
    reason_precedence: c13ReasonPrecedenceOracle,
    ordinary_values: c13OrdinaryNonCandidateValues,
    terminal_negative_value_count: c13TerminalNegativeValues.length,
    ordinary_and_terminal_sets_are_disjoint: c13OrdinaryAndTerminalSetsAreDisjoint,
  },
  c12_accepted_security_tradeoff: {
    status: "accepted",
    policy_scope: "explicit_path_syntax_signal_at_sentence_end",
    invalid_values: c12ObservedExplicitPathSyntaxSentenceEndValues,
    ordinary_values: c12ObservedOrdinaryDocumentationValues,
    sets_are_exact_and_disjoint: c12SentencePolicySetsAreExactAndDisjoint,
    authoring_guidance: "ambiguous arbitrary-key manifest text must add trailing prose rather than weaken repository path detection",
  },
  reference_graph: {
    counts: {
      global_sha_slots: globalShaSlotAnalysis.observed.length,
      global_sha_nonempty_slots: globalShaSlotAnalysis.classified.filter((slot) => slot.category !== "runtime_null").length,
      global_sha_runtime_null_slots: globalShaSlotAnalysis.partitions.runtime_null,
      scalar_sha256_slots: sha256ScalarAnalysis.observed.length,
      evidence_sha256_null_slots: evidenceShaNamedSlots.length,
      evidence_sha256_presence_slots: evidenceSha256PresenceSlots.length,
      freeze_edges: observedFreezePins.length,
      asset_locks: observedAssetLocks.length,
      contract_projection_digests: observedProjectionDigests.length,
      non_hash_locators: nonHashLocators.length,
      import_evidence_fragment_locators: structuredJsonFragmentReferenceAnalysis.allowed_bindings.length,
      unexpected_fragment_references: structuredJsonFragmentReferenceAnalysis.unexpected.length,
      invalid_repository_file_references: structuredJsonReferenceAnalysis.invalid_references.length,
      external_repository_file_literal_references: literalReferenceClosureAnalysis.external_repository_files.count,
      internal_JSON_Pointer_literal_references: literalReferenceClosureAnalysis.internal_JSON_Pointers.count,
      known_scheme_literal_references: literalReferenceClosureAnalysis.known_scheme_locators.count,
      baseline_scheme_prefix_scalars: baselineSchemePrefixScalars.length,
    },
    literal_reference_closures: {
      serialization: "canonical_object_keys_then_tuple_JSON_code_unit_sort_then_compact_JSON_array_UTF8_SHA256",
      external_repository_files: literalReferenceClosureAnalysis.external_repository_files,
      internal_JSON_Pointers: literalReferenceClosureAnalysis.internal_JSON_Pointers,
      known_scheme_locators: literalReferenceClosureAnalysis.known_scheme_locators,
      invalid_references: literalReferenceClosureAnalysis.invalid_references,
      negative_fixtures: literalReferenceClosureNegativeFixtureResults,
    },
    global_sha_slot_partitions: globalShaSlotAnalysis.partitions,
    global_sha_slots: globalShaSlotAnalysis.classified.map((slot) => ({
      source: slot.source,
      pointer: slot.pointer,
      kind: slot.category,
      value: slot.value,
      expected_value: slot.expected_value,
    })),
    scalar_sha256_slots: sha256ScalarAnalysis.classified.map((slot) => ({
      source: slot.source,
      pointer: slot.pointer,
      kind: slot.category,
      lowercase_value: slot.lowercase_value,
      expected_value: slot.expected_value,
    })),
    import_evidence_fragment_locators_excluded_from_freeze_DAG: structuredJsonFragmentReferenceAnalysis.allowed_bindings.map((reference) => ({
      source: reference.source,
      pointer: reference.pointer,
      value: reference.value,
      resolved_target: reference.resolved_target,
      resolved_path: reference.resolved_path,
      bounded: reference.bounded,
      fragment: reference.fragment,
      fragment_valid: reference.fragment_valid,
      table_index: reference.table_index,
      evidence_key: reference.evidence_key,
      target_exists: reference.target_exists,
      reference_kind: reference.reference_kind,
      excluded_from_freeze_DAG: reference.excluded_from_freeze_DAG,
    })),
    evidence_sha256_null_slots: evidenceShaNamedSlots,
    evidence_sha256_presence_slots: evidenceSha256PresenceSlots,
    freeze_edges: observedFreezePins.map(({ source, target, path: referencePath, sha256: digest, path_pointer: pathPointer, sha256_pointer: sha256Pointer }) => ({
      source,
      target,
      path: referencePath,
      sha256: digest,
      path_pointer: pathPointer,
      sha256_pointer: sha256Pointer,
    })),
    asset_locks_excluded_from_freeze_DAG: observedAssetLocks.map((lock) => ({
      source: lock.source,
      target: lock.target,
      reference: lock.reference,
      sha256: lock.sha256,
      reference_pointer: lock.reference_pointer,
      sha256_pointer: lock.sha256_pointer,
      canonical_table_key: lock.canonical_table_key ?? null,
    })),
    contract_projection_digests_excluded_from_edges_and_asset_locks: observedProjectionDigests,
    non_hash_locators: nonHashLocators,
    r9_guard: {
      reference_kind: "byte_guard_not_freeze_edge",
      creates_freeze_graph_edges: false,
      record_path: sourceDescriptor(paths.t3R9Record, t3R9Record).path,
      record_sha256: sha256(t3R9Record),
      guarded_files: actualR9Freeze,
      declaration_source: "R10_record_section_8_exact_unique_canonical_Markdown",
    },
  },
  upstream_conflicts: upstreamConflicts,
  errors,
  table_field_checks: tableFieldChecks,
};

if (!hasExactKeys(result, reportRootExactKeys)
  || result.report_schema_version !== PERMISSION_CONTRACT_REPORT_SCHEMA_VERSION
  || !permissionAttestationHasExactShape(result.permission_result_contract)) {
  throw new Error(`contract report root or permission attestation violated its frozen exact schema: ${JSON.stringify({
    assertion_count: result.permission_result_contract?.assertion_count,
    failed_assertion_count: result.permission_result_contract?.failed_assertion_count,
    negative_fixture_count: result.permission_result_contract?.negative_fixture_count,
    negative_fixture_name_digest: result.permission_result_contract?.negative_fixture_name_digest,
    versions: result.permission_result_contract?.versions,
    source_digest: result.permission_result_contract?.source_digest,
    errors: result.errors,
  })}`);
}

console.log(JSON.stringify(result, null, 2));
if (errors.length > 0) process.exitCode = 1;
else if (upstreamConflicts.length > 0) process.exitCode = 2;
