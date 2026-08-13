import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  PUBLIC_FILE_CONTRACTS,
  PUBLIC_FIXTURE_VERSION,
  PUBLIC_OUTPUT_FILES,
  PUBLIC_SCHEMA_VERSION,
  PUBLIC_SNAPSHOT_VERSION,
  assertPublicDocumentContracts,
  buildPublicSnapshot,
  scanPublicArtifacts,
} from "../../scripts/neoloop-data/build-public-snapshot.mjs";
import { validatePublicSnapshot } from "../../scripts/neoloop-data/validate-public-snapshot.mjs";

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(TEST_DIR, "../..");
const CANONICAL = resolve(REPO, "data/canonical");
const PUBLIC = resolve(CANONICAL, "public");
const SYNTHETIC = "synthetic_experiment";

const FAILURE_CATEGORIES = [
  "same_key_retry_and_different_key_similar",
  "missing_vehicle_and_task_ids",
  "invalid_ai_schema_retry_once_then_human",
  "sla_timeout_escalation_preserves_clock",
];

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function listFiles(root, prefix = "") {
  const files = [];
  for (const entry of await readdir(resolve(root, prefix), { withFileTypes: true })) {
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) files.push(...await listFiles(root, relativePath));
    else files.push(relativePath);
  }
  return files.sort();
}

function sorted(values) {
  return [...values].sort();
}

function hash(value) {
  return createHash("sha256").update(value).digest("hex");
}

test("public snapshot manifest binds the frozen fixture, inputs, outputs, and exact file set", async () => {
  const [report, manifest, files] = await Promise.all([
    validatePublicSnapshot(),
    readJson(resolve(PUBLIC, "manifest.json")),
    listFiles(PUBLIC),
  ]);

  assert.equal(report.ok, true, JSON.stringify(report.errors, null, 2));
  assert.deepEqual(report.warnings, []);
  assert.equal(manifest.snapshot_version, PUBLIC_SNAPSHOT_VERSION);
  assert.equal(manifest.schema_version, PUBLIC_SCHEMA_VERSION);
  assert.equal(manifest.fixture_version, PUBLIC_FIXTURE_VERSION);
  assert.equal(manifest.snapshot_at, "2026-08-01T00:00:00+08:00");
  assert.equal(manifest.data_scope, SYNTHETIC);
  assert.deepEqual(files, PUBLIC_OUTPUT_FILES);
  assert.equal(report.output_file_count, 14);
  assert.equal(report.manifest_sha256, hash(await readFile(resolve(PUBLIC, "manifest.json"))));
  assert.equal(manifest.outputs.length, 13);
  assert.ok(manifest.outputs.every((record) => /^[a-f0-9]{64}$/u.test(record.sha256)));
  assert.ok(manifest.inputs.every((record) => !record.file.startsWith("/") && /^[a-f0-9]{64}$/u.test(record.sha256)));
  assert.ok(manifest.policy_checks.every((record) => record.result === "clear" && record.hit_count === 0));
});

test("public entity projections keep fixed counts, unique IDs, and complete relationships", async () => {
  const [casesDocument, workOrdersDocument, clustersDocument, improvementsDocument] = await Promise.all([
    readJson(resolve(PUBLIC, "cases.json")),
    readJson(resolve(PUBLIC, "work-orders.json")),
    readJson(resolve(PUBLIC, "clusters.json")),
    readJson(resolve(PUBLIC, "improvements.json")),
  ]);
  const cases = casesDocument.records;
  const workOrders = workOrdersDocument.records;
  const clusters = clustersDocument.records;
  const improvements = improvementsDocument.records;

  assert.deepEqual([cases.length, workOrders.length, clusters.length, improvements.length], [20, 27, 10, 10]);
  assert.equal(new Set(cases.map((record) => record.case_id)).size, 20);
  assert.equal(new Set(workOrders.map((record) => record.work_order_id)).size, 27);
  assert.equal(new Set(clusters.map((record) => record.cluster_id)).size, 10);
  assert.equal(new Set(improvements.map((record) => record.improvement_id)).size, 10);

  const caseIds = new Set(cases.map((record) => record.case_id));
  const clusterIds = new Set(clusters.map((record) => record.cluster_id));
  assert.ok(workOrders.every((record) => caseIds.has(record.case_id)));
  assert.ok(clusters.flatMap((record) => record.member_case_ids).every((caseId) => caseIds.has(caseId)));
  assert.deepEqual(sorted(clusters.flatMap((record) => record.member_case_ids)), sorted(caseIds));
  assert.ok(improvements.every((record) => clusterIds.has(record.cluster_id)));
  assert.deepEqual(sorted(improvements.map((record) => record.cluster_id)), sorted(clusterIds));
});

test("every public document is a fail-closed explicit allowlist projection", async () => {
  const documents = {};
  for (const file of Object.keys(PUBLIC_FILE_CONTRACTS)) documents[file] = await readJson(resolve(PUBLIC, file));
  assert.doesNotThrow(() => assertPublicDocumentContracts(documents));

  const manifest = await readJson(resolve(PUBLIC, "manifest.json"));
  assert.deepEqual(sorted(manifest.file_contracts.map((record) => record.file)), sorted(Object.keys(PUBLIC_FILE_CONTRACTS)));
  for (const contract of manifest.file_contracts) {
    assert.ok(contract.document_allowed_fields || contract.record_allowed_fields, contract.file);
    assert.equal(new Set(contract.record_allowed_fields ?? contract.document_allowed_fields).size, (contract.record_allowed_fields ?? contract.document_allowed_fields).length, contract.file);
  }
});

test("public bytes contain no private keys, credentials, PII, absolute paths, internal hashes, or DEMO IDs", async () => {
  const serialized = {};
  const documents = {};
  for (const file of await listFiles(PUBLIC)) {
    serialized[file] = await readFile(resolve(PUBLIC, file));
    if (file.endsWith(".json")) documents[file] = JSON.parse(serialized[file].toString("utf8"));
  }
  const scan = scanPublicArtifacts(serialized, documents);
  assert.deepEqual(scan, { key_hits: [], pattern_hits: [] });

  for (const [file, bytes] of Object.entries(serialized)) {
    if (file === "manifest.json") continue;
    const text = bytes.toString("utf8");
    assert.doesNotMatch(text, /\bDEMO-[A-Z0-9-]+\b/u, file);
    assert.doesNotMatch(text, /\b[a-f0-9]{64}\b/u, file);
    assert.doesNotMatch(text, /data\/canonical\/(?:tables|gold|adversarial|scenarios|workbooks)\//u, file);
    assert.doesNotMatch(text, /(?:^|["'\s])\/(?:Users|home|private|var|opt|etc|tmp)\//u, file);
  }
});

test("fact boundaries remain explicit and enterprise-pending values never become confirmed", async () => {
  const [declarations, casesDocument, improvementsDocument] = await Promise.all([
    readJson(resolve(PUBLIC, "declarations.json")),
    readJson(resolve(PUBLIC, "cases.json")),
    readJson(resolve(PUBLIC, "improvements.json")),
  ]);
  assert.deepEqual(sorted(declarations.fact_boundaries.map((record) => record.evidence_class)), sorted(["public_fact", "enterprise_pending", "solution_design", "synthetic_experiment"]));
  assert.equal(declarations.fact_boundaries.find((record) => record.evidence_class === "enterprise_pending").public_status, "pending_validation");
  assert.ok(Object.values(declarations.claims).every((value) => value === false));
  assert.ok(casesDocument.records.every((record) => record.formal_entity === null && record.formal_entity_confirmation_status === "待人工确认"));
  assert.ok(casesDocument.records.every((record) => record.routing_confirmation_status === "待人工确认" && record.routing_evidence_class === "enterprise_pending"));
  assert.ok(improvementsDocument.records.every((record) => record.enterprise_confirmation_status === "pending_validation" && record.owner_role === "待企业确认" && record.owner_evidence_class === "enterprise_pending"));
});

test("legacy completed states remain snapshots and never become new workflow evidence", async () => {
  const [casesDocument, workOrdersDocument, clustersDocument] = await Promise.all([
    readJson(resolve(PUBLIC, "cases.json")),
    readJson(resolve(PUBLIC, "work-orders.json")),
    readJson(resolve(PUBLIC, "clusters.json")),
  ]);
  assert.ok(casesDocument.records.every((record) => record.record_mode === "legacy_snapshot" && record.workflow_run_evidence === false));
  const closed = casesDocument.records.filter((record) => record.status === "已关闭");
  assert.equal(closed.length, 9);
  assert.ok(closed.every((record) => record.workflow_readiness === "requires_replay_reset"));
  assert.ok(workOrdersDocument.records.every((record) => record.record_mode === "legacy_snapshot" && record.workflow_run_evidence === false));
  assert.ok(clustersDocument.records.every((record) => record.record_mode === "legacy_snapshot" && record.workflow_run_evidence === false && record.root_cause_confirmation_status === "hypothesis_only_not_confirmed"));
  assert.ok(casesDocument.records.every((record) => record.candidate_station_id == null || /^SYN-STATION-/u.test(record.candidate_station_id)));
});

test("main story and four failure drills stay isolated, unrun, and human-gated", async () => {
  const [mainStoryDocument, failureDocument] = await Promise.all([
    readJson(resolve(PUBLIC, "main-story.json")),
    readJson(resolve(PUBLIC, "failure-drills.json")),
  ]);
  assert.equal(mainStoryDocument.records.length, 1);
  const [story] = mainStoryDocument.records;
  assert.equal(story.source_case_id, "SYN-CASE-017");
  assert.equal(story.source_record_mode, "legacy_snapshot");
  assert.equal(story.record_mode, "scenario_runtime");
  assert.equal(story.execution_status, "not_run");
  assert.equal(story.runtime_evidence_available, false);
  assert.equal(story.clock.source, "test");
  assert.equal(story.observation_clock.source, "synthetic_history");
  assert.ok(story.replay_input.original_text.startsWith("合成场景："));
  assert.equal(story.all_human_gates_required, true);
  assert.ok(story.human_gate_keys.length > 0 && story.forbidden_actions.length > 0);

  assert.equal(failureDocument.records.length, 4);
  assert.deepEqual(sorted(failureDocument.records.map((record) => record.category_key)), sorted(FAILURE_CATEGORIES));
  assert.equal(new Set(failureDocument.records.map((record) => record.runtime_case_id)).size, 4);
  assert.ok(failureDocument.records.every((record) => record.record_mode === "scenario_runtime" && record.execution_status === "not_run" && record.runtime_evidence_available === false));
  assert.ok(failureDocument.records.every((record) => record.clock_source === "test" && record.all_human_gates_required === true && record.human_gate_keys.length > 0 && record.forbidden_actions.length > 0));
  assert.equal(failureDocument.records.find((record) => record.category_key === "invalid_ai_schema_retry_once_then_human").expected_retry_limit, 1);
  assert.equal(failureDocument.records.find((record) => record.category_key === "sla_timeout_escalation_preserves_clock").preserve_original_clock, true);
});

test("five read-only indexes cover public entities without duplicating a second state contract", async () => {
  const [manifest, feedback, cockpit, sla, problem, improvement] = await Promise.all([
    readJson(resolve(PUBLIC, "manifest.json")),
    readJson(resolve(PUBLIC, "views/feedback-inbox.json")),
    readJson(resolve(PUBLIC, "views/case-cockpit.json")),
    readJson(resolve(PUBLIC, "views/sla-board.json")),
    readJson(resolve(PUBLIC, "views/problem-map.json")),
    readJson(resolve(PUBLIC, "views/improvement-tracker.json")),
  ]);
  assert.deepEqual([feedback.record_count, cockpit.record_count, sla.record_count, problem.record_count, improvement.record_count], [30, 20, 27, 10, 10]);
  assert.ok([feedback, cockpit, sla, problem, improvement].every((document) => document.read_only === true));
  assert.equal(manifest.consumer_contract.consumer, "T4");
  assert.equal(manifest.consumer_contract.entrypoint, "data/canonical/public/manifest.json");
  assert.equal(manifest.consumer_contract.read_root, "data/canonical/public");
  assert.equal(manifest.consumer_contract.read_only, true);
  assert.equal(manifest.consumer_contract.direct_canonical_reads_allowed, false);
  assert.equal(manifest.consumer_contract.view_index_policy, "relationship_and_safe_aggregate_only");
  assert.deepEqual(sorted(manifest.consumer_contract.allowed_files), PUBLIC_OUTPUT_FILES);
  assert.deepEqual(sorted(manifest.consumer_contract.required_views), sorted(["views/feedback-inbox.json", "views/case-cockpit.json", "views/sla-board.json", "views/problem-map.json", "views/improvement-tracker.json"]));
  assert.ok(manifest.consumer_contract.denied_read_roots.includes("data/demo-cases.json"));
});

test("no public file claims runtime results, measured improvements, revenue, or ROI", async () => {
  const [declarations, improvementsDocument, mainStoryDocument, failureDocument, problemMap] = await Promise.all([
    readJson(resolve(PUBLIC, "declarations.json")),
    readJson(resolve(PUBLIC, "improvements.json")),
    readJson(resolve(PUBLIC, "main-story.json")),
    readJson(resolve(PUBLIC, "failure-drills.json")),
    readJson(resolve(PUBLIC, "views/problem-map.json")),
  ]);
  assert.deepEqual(declarations.claims, {
    enterprise_data_included: false,
    enterprise_system_connected: false,
    credentials_included: false,
    runtime_results_included: false,
    measured_efficiency_included: false,
    measured_revenue_included: false,
    measured_roi_included: false,
  });
  assert.ok(improvementsDocument.records.every((record) => record.day_7_result === null && record.day_30_result === null && record.human_conclusion === null && record.runtime_evidence_available === false));
  assert.ok(mainStoryDocument.records.every((record) => record.execution_status === "not_run" && record.runtime_evidence_available === false));
  assert.ok(failureDocument.records.every((record) => record.execution_status === "not_run" && record.runtime_evidence_available === false));
  assert.ok(problemMap.records.every((record) => record.recurrence_evidence_available === false && !Object.hasOwn(record, "recurrence_count")));
  assert.doesNotMatch(JSON.stringify(problemMap), /(?:0\s*次|0%)/u);
});

test("two clean builds are byte-identical, including the manifest", async (t) => {
  const first = await mkdtemp(join(tmpdir(), "neoloop-public-first-"));
  const second = await mkdtemp(join(tmpdir(), "neoloop-public-second-"));
  t.after(async () => {
    await Promise.all([rm(first, { recursive: true, force: true }), rm(second, { recursive: true, force: true })]);
  });

  const [firstReport, secondReport] = await Promise.all([
    buildPublicSnapshot({ canonicalDir: CANONICAL, outputDir: first }),
    buildPublicSnapshot({ canonicalDir: CANONICAL, outputDir: second }),
  ]);
  assert.deepEqual(firstReport.file_hashes, secondReport.file_hashes);
  assert.equal(firstReport.manifest_sha256, secondReport.manifest_sha256);
  assert.deepEqual(await listFiles(first), PUBLIC_OUTPUT_FILES);
  assert.deepEqual(await listFiles(second), PUBLIC_OUTPUT_FILES);
  for (const file of PUBLIC_OUTPUT_FILES) assert.deepEqual(await readFile(resolve(first, file)), await readFile(resolve(second, file)), file);
});

test("validator fails closed after an allowlist leak or unexpected public file", async (t) => {
  const outputDir = await mkdtemp(join(tmpdir(), "neoloop-public-tamper-"));
  t.after(async () => rm(outputDir, { recursive: true, force: true }));
  await buildPublicSnapshot({ canonicalDir: CANONICAL, outputDir });

  const casesPath = resolve(outputDir, "cases.json");
  const casesDocument = await readJson(casesPath);
  casesDocument.records[0].source_locator = "private-cell-reference";
  await writeFile(casesPath, `${JSON.stringify(casesDocument, null, 2)}\n`, "utf8");
  await writeFile(resolve(outputDir, "unexpected.json"), "{}\n", "utf8");

  const report = await validatePublicSnapshot({ publicDir: outputDir, canonicalDir: CANONICAL });
  assert.equal(report.ok, false);
  assert.ok(report.errors.some((record) => record.code === "public_file_set_mismatch"));
  assert.ok(report.errors.some((record) => record.code === "public_allowlist_violation"));
  assert.ok(report.errors.some((record) => record.code === "public_forbidden_key"));
  assert.ok(report.errors.some((record) => record.code === "public_manifest_output_hash_mismatch"));
});
