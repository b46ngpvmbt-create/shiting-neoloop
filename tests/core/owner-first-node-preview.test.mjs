import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { importBuilt } from "./_runtime.mjs";

const PROFILE_IDS = [
  "n2-default",
  "n3-default",
  "n4-default",
  "n5-same-event",
  "n5-cross-event",
  "n6-responsibility",
  "n6-root-cause",
  "n7-customer-reply",
  "n7-knowledge-draft",
  "n7-insight-summary",
];
const CANDIDATE_KEYS = [
  "payload",
  "evidence_spans",
  "missing_fields",
  "confidence",
  "status",
];
const REPORT_KEYS = [
  "profile_id",
  "node",
  "mode",
  "classification",
  "attempt_count",
  "candidate_top_level_keys",
  "exact_14_generated",
  "issue_codes",
];
const PROMPT_BINDING_MANIFEST_URL = new URL(
  "../../feishu/manifests/owner-first-node-prompt-bindings.v1.json",
  import.meta.url,
);

const FEEDBACK_ID = "SYN-FEEDBACK-OWNER-001";
const ORIGINAL_TEXT = "A 站取货时舱门连续两次无法解锁，任务已经延误。";
const CASE_ID = "SYN-CASE-OWNER-017";
const VEHICLE_ID = "SYN-VEHICLE-OWNER-107";
const TASK_ID = "SYN-TASK-OWNER-8458";
const STATION_ID = "SYN-STATION-OWNER-YZ";
const CURRENT_CASE_ID = "SYN-CASE-OWNER-CURRENT";
const PEER_CASE_ID = "SYN-CASE-OWNER-PEER";
const COUNTER_CASE_ID = "SYN-CASE-OWNER-COUNTER";
const CURRENT_SUMMARY = "A 站舱门无法解锁，任务发生延误。";
const PEER_SUMMARY = "B 站另一任务出现舱门无法解锁，涉及相同部件批次。";
const KNOWLEDGE_ID = "SYN-KNOWLEDGE-OWNER-APPROVED-001";

function baseCandidate(payload, evidenceSpans = [], confidence = 0.86) {
  return {
    payload,
    evidence_spans: evidenceSpans,
    missing_fields: [],
    confidence,
    status: "ok",
  };
}

function validCandidate(profileId) {
  switch (profileId) {
    case "n2-default":
      return baseCandidate({
        business_domain: "车辆运维",
        subcategory: "舱门解锁异常",
        tags: ["舱门", "延误"],
        taxonomy_version: "taxonomy-owner-synthetic-v1",
      }, []);
    case "n3-default":
      return baseCandidate({
        risk_suggestion: "P2",
        trigger_evidence: [0],
        explanation: "仅依据已引用原文片段给出风险建议；最终风险由硬规则与该建议取较高值。",
      }, [{
        source_ref: FEEDBACK_ID,
        quote: ORIGINAL_TEXT,
        start_offset: 0,
        end_offset: ORIGINAL_TEXT.length,
      }]);
    case "n4-default":
      return baseCandidate({
        candidate_objects: [
          { object_type: "vehicle", object_id: VEHICLE_ID, evidence_span_indices: [0, 1] },
          { object_type: "delivery_task", object_id: TASK_ID, evidence_span_indices: [0, 2] },
          { object_type: "station", object_id: STATION_ID, evidence_span_indices: [3, 4] },
        ],
        human_confirmation_required: true,
      }, [
        { source_ref: CASE_ID, quote: `车辆 ${VEHICLE_ID} 正在执行任务 ${TASK_ID}。` },
        { source_ref: VEHICLE_ID, quote: `车辆 ${VEHICLE_ID} 当前站点为 ${STATION_ID}。` },
        { source_ref: TASK_ID, quote: `任务 ${TASK_ID} 由车辆 ${VEHICLE_ID} 从站点 ${STATION_ID} 执行。` },
        { source_ref: CASE_ID, quote: `异常发生在站点 ${STATION_ID}。` },
        { source_ref: STATION_ID, quote: `站点 ${STATION_ID} 为合成场景站点。` },
      ]);
    case "n5-same-event":
      return baseCandidate({
        duplicate_candidate: {
          candidate_case_id: PEER_CASE_ID,
          similarity: 0.96,
          evidence_span_indices: [0, 1],
        },
        human_confirmation_required: true,
        automatic_merge: false,
        automatic_relink: false,
      }, [
        { source_ref: `case:${CURRENT_CASE_ID}`, quote: CURRENT_SUMMARY },
        { source_ref: `case:${PEER_CASE_ID}`, quote: PEER_SUMMARY },
      ], 0.96);
    case "n5-cross-event":
      return baseCandidate({
        cluster_candidate: {
          candidate_kind: "new_cluster",
          suggested_cluster_id: null,
          member_cases: [
            { case_id: CURRENT_CASE_ID, evidence_span_indices: [0] },
            { case_id: PEER_CASE_ID, evidence_span_indices: [1] },
          ],
          similarity: 0.87,
        },
        human_review_required: true,
        automatic_merge: false,
        automatic_case_relink: false,
      }, [
        { source_ref: `case:${CURRENT_CASE_ID}`, quote: CURRENT_SUMMARY },
        { source_ref: `case:${PEER_CASE_ID}`, quote: PEER_SUMMARY },
      ], 0.87);
    case "n6-responsibility":
      return baseCandidate({
        candidates: [
          {
            routing_rule_id: "SYN-ROUTING-OWNER-002",
            rule_version: "routing-matrix-owner@1.0.0-draft.2",
            candidate_team: "车辆运维",
            candidate_logical_role: "待企业确认",
            sla_rule_version: "legacy-registration-demo-v1",
            supporting_evidence_indices: [0, 1],
            counter_evidence_indices: [2],
            uncertainties: ["规则状态为待企业验证，需人工确认。"],
          },
          {
            routing_rule_id: "SYN-ROUTING-OWNER-014",
            rule_version: "routing-matrix-owner@1.0.0-draft.2",
            candidate_team: "车辆运维+产品",
            candidate_logical_role: "待企业确认",
            sla_rule_version: "legacy-registration-demo-v1",
            supporting_evidence_indices: [0, 2],
            counter_evidence_indices: [1],
            uncertainties: ["规则状态为待企业验证，且存在多个匹配候选。"],
          },
        ],
        human_confirmation_required: true,
      }, [
        { source_ref: CASE_ID, quote: `站点 ${STATION_ID} 的问题分类为舱门/柜体。` },
        { source_ref: "SYN-ROUTING-OWNER-002", quote: "SYN-ROUTING-OWNER-002 将该组合候选路由至车辆运维，状态为待企业验证。" },
        { source_ref: "SYN-ROUTING-OWNER-014", quote: "SYN-ROUTING-OWNER-014 将该组合候选路由至车辆运维+产品，状态为待企业验证。" },
      ], 0.78);
    case "n6-root-cause":
      return baseCandidate({
        hypotheses: [{
          hypothesis_id: "HYP-OWNER-001",
          statement: "待验证假设：锁体部件批次差异可能与舱门无法解锁相关，需人工结合支持证据、反证和不确定项验证。",
          supporting_evidence_indices: [0, 1],
          counter_evidence_indices: [2],
          uncertainty_ids: ["UNC-OWNER-SAMPLE", "UNC-OWNER-TEARDOWN"],
          uncertainties: ["待确认：样本数量有限", "待确认：尚缺少拆检报告"],
        }],
        human_review_required: true,
        final_root_cause: false,
      }, [
        { source_ref: `case:${CURRENT_CASE_ID}`, quote: "A 站舱门无法解锁，部件批次为 B-17。" },
        { source_ref: `case:${PEER_CASE_ID}`, quote: "B 站舱门无法解锁，部件批次同为 B-17。" },
        { source_ref: `case:${COUNTER_CASE_ID}`, quote: "同批次车辆在 C 站的合成复测中未复现该现象。" },
      ], 0.72);
    case "n7-customer-reply":
    case "n7-knowledge-draft":
    case "n7-insight-summary": {
      const mode = profileId.slice(3).replaceAll("-", "_");
      const draft = mode === "customer_reply"
        ? "您好，我们已完成本次问题核验。请您确认当前使用体验；本回复仍需人工审核。"
        : mode === "knowledge_draft"
          ? "候选知识草稿：记录舱门异常的核验步骤和证据要求。"
          : "候选洞察摘要：本案验证链路完整，后续结论仍需人工复核。";
      return baseCandidate({
        draft_kind: mode,
        draft,
        citations: [{
          knowledge_id: KNOWLEDGE_ID,
          version: "approved.1",
          evidence_span_indices: [2],
        }],
        supporting_evidence_indices: [0, 1, 2],
        publication_state: "draft_unpublished",
        human_review_required: true,
        automatic_publication: false,
      }, [
        { source_ref: `case:${CASE_ID}`, quote: `${CASE_ID} 的舱门解锁异常已由授权人员核对。` },
        { source_ref: "work_order:SYN-WORK-OWNER-017", quote: "处置证据已验证，合成场景中的连续解锁测试通过。" },
        { source_ref: `knowledge:${KNOWLEDGE_ID}`, quote: "回复应说明已完成核验，并邀请客户确认当前体验。" },
      ]);
    }
    default:
      throw new Error(`unknown test profile: ${profileId}`);
  }
}

function profileSpecificFailureFixture(profileId) {
  const candidate = structuredClone(validCandidate(profileId));
  switch (profileId) {
    case "n2-default":
      candidate.payload.taxonomy_version = "forged-taxonomy-version";
      return {
        candidate,
        expectedIssueCode: "candidate_invalid_payload_shape",
        failure: "taxonomy version is not bound to the controlled catalog",
      };
    case "n3-default":
      candidate.payload.trigger_evidence = [99];
      return {
        candidate,
        expectedIssueCode: "candidate_invalid_evidence_binding",
        failure: "risk evidence points outside original_text",
      };
    case "n4-default":
      candidate.payload.candidate_objects[0].object_id = "SYN-VEHICLE-UNKNOWN";
      return {
        candidate,
        expectedIssueCode: "candidate_invalid_payload_shape",
        failure: "vehicle candidate was not returned by the bound lookup",
      };
    case "n5-same-event":
      candidate.payload.automatic_merge = true;
      return {
        candidate,
        expectedIssueCode: "candidate_injection_boundary_violation",
        failure: "same-event candidate attempts an automatic merge",
      };
    case "n5-cross-event":
      candidate.payload.automatic_case_relink = true;
      return {
        candidate,
        expectedIssueCode: "candidate_injection_boundary_violation",
        failure: "cross-event candidate attempts an automatic case relink",
      };
    case "n6-responsibility":
      candidate.payload.human_confirmation_required = false;
      return {
        candidate,
        expectedIssueCode: "candidate_invalid_payload_shape",
        failure: "responsibility route bypasses human confirmation",
      };
    case "n6-root-cause":
      candidate.payload.final_root_cause = true;
      return {
        candidate,
        expectedIssueCode: "candidate_injection_boundary_violation",
        failure: "hypothesis is promoted to a final root cause",
      };
    case "n7-customer-reply":
      candidate.payload.draft_kind = "knowledge_draft";
      return {
        candidate,
        expectedIssueCode: "candidate_invalid_payload_shape",
        failure: "customer-reply profile emits another N7 mode",
      };
    case "n7-knowledge-draft":
      candidate.payload.automatic_publication = true;
      return {
        candidate,
        expectedIssueCode: "candidate_injection_boundary_violation",
        failure: "knowledge draft attempts automatic publication",
      };
    case "n7-insight-summary":
      candidate.payload.publication_state = "published";
      return {
        candidate,
        expectedIssueCode: "candidate_invalid_payload_shape",
        failure: "insight summary claims a published state",
      };
    default:
      throw new Error(`unknown failure fixture profile: ${profileId}`);
  }
}

function assertSafeReport(report, profileId) {
  assert.deepEqual(Object.keys(report), REPORT_KEYS);
  assert.equal(report.profile_id, profileId);
  assert.equal(JSON.stringify(report).includes(ORIGINAL_TEXT), false);
  assert.equal(JSON.stringify(report).includes("draft"), profileId.includes("draft"));
  for (const forbidden of ["payload", "evidence_spans", "input_hash", "run_id", "object_ref"]) {
    assert.equal(forbidden in report, false, forbidden);
  }
}

test("owner-first N2-N7 registry freezes ten synthetic-only profiles and valid requests", async () => {
  const {
    OWNER_FIRST_NODE_PROFILE_IDS,
    getOwnerFirstNodePreviewRequest,
    validateNodeRequestDefinition,
  } = await importBuilt("src/neoloop/ai/owner-first-node-preview.js");
  assert.deepEqual(OWNER_FIRST_NODE_PROFILE_IDS, PROFILE_IDS);
  for (const profileId of PROFILE_IDS) {
    const request = getOwnerFirstNodePreviewRequest(profileId);
    assert.ok(request, profileId);
    assert.deepEqual(validateNodeRequestDefinition(request), { valid: true, errors: [] }, profileId);
    assert.match(request.object_ref.object_id, /^SYN-/u, profileId);
  }
  assert.equal(getOwnerFirstNodePreviewRequest("n1-default"), null);
  assert.equal(getOwnerFirstNodePreviewRequest("../../secret"), null);
});

test("machine-readable prompt bindings match request input order and separate Feishu tokens from controlled literals", async () => {
  const { getOwnerFirstNodePreviewRequest } = await importBuilt(
    "src/neoloop/ai/owner-first-node-preview.js",
  );
  const manifest = JSON.parse(readFileSync(PROMPT_BINDING_MANIFEST_URL, "utf8"));
  assert.deepEqual(Object.keys(manifest), [
    "schema_version",
    "data_scope",
    "candidate_top_level_key_order",
    "binding_kinds",
    "profiles",
  ]);
  assert.equal(manifest.schema_version, "owner-first-node-prompt-bindings.v1");
  assert.equal(manifest.data_scope, "synthetic_experiment");
  assert.deepEqual(manifest.candidate_top_level_key_order, CANDIDATE_KEYS);
  assert.deepEqual(manifest.binding_kinds, [
    "feishu_variable_token",
    "controlled_catalog_literal",
  ]);
  assert.deepEqual(Object.keys(manifest.profiles), PROFILE_IDS);
  assert.doesNotMatch(
    JSON.stringify(manifest),
    /\b(?:tbl|fld|rec|vew|wkf)[A-Za-z0-9]{8,}\b/u,
  );

  for (const profileId of PROFILE_IDS) {
    const profile = manifest.profiles[profileId];
    const request = getOwnerFirstNodePreviewRequest(profileId);
    assert.ok(request, profileId);
    assert.deepEqual(Object.keys(profile), [
      "prompt_path",
      "workflow",
      "ui_step",
      "node",
      "mode",
      "version",
      "input_key_order",
      "bindings",
    ], profileId);
    assert.equal(profile.node, request.node, profileId);
    assert.equal(profile.mode, request.mode, profileId);
    assert.equal(profile.version, request.version, profileId);
    assert.deepEqual(profile.input_key_order, Object.keys(request.input), profileId);
    assert.deepEqual(
      profile.bindings.map((binding) => binding.input_key),
      profile.input_key_order,
      profileId,
    );

    const prompt = readFileSync(new URL(`../../${profile.prompt_path}`, import.meta.url), "utf8");
    const promptBindingOrder = [...prompt.matchAll(/^\d+\. ([a-z][a-z0-9_]*) = /gmu)]
      .map((match) => match[1]);
    assert.deepEqual(promptBindingOrder, profile.input_key_order, profileId);

    for (const binding of profile.bindings) {
      assert.ok(manifest.binding_kinds.includes(binding.kind), profileId);
      if (binding.kind === "feishu_variable_token") {
        assert.deepEqual(Object.keys(binding), [
          "input_key",
          "kind",
          "token_name",
          "ui_source",
        ], `${profileId}:${binding.input_key}`);
        assert.match(binding.token_name, /^[A-Z][A-Z0-9_]+$/u);
        assert.ok(
          prompt.includes(
            `${binding.input_key} = FEISHU_VARIABLE_TOKEN:${binding.token_name}`,
          ),
          `${profileId}:${binding.input_key}`,
        );
      } else {
        assert.deepEqual(Object.keys(binding), [
          "input_key",
          "kind",
          "literal_id",
          "literal_value",
        ], `${profileId}:${binding.input_key}`);
        assert.ok(
          prompt.includes(
            `${binding.input_key} = CONTROLLED_CATALOG_LITERAL:${binding.literal_id} = ${JSON.stringify(binding.literal_value)}`,
          ),
          `${profileId}:${binding.input_key}`,
        );
        assert.deepEqual(
          request.input[binding.input_key],
          binding.literal_value,
          `${profileId}:${binding.input_key}`,
        );
      }
    }
  }
});

test("every owner-first N2-N7 profile validates exact-five and generates exact-14 locally", async () => {
  const {
    createOwnerFirstNodePreviewSession,
    validateNodeCandidate,
  } = await importBuilt("src/neoloop/ai/owner-first-node-preview.js");
  for (const profileId of PROFILE_IDS) {
    const session = createOwnerFirstNodePreviewSession(profileId);
    const request = session.request;
    const candidate = validCandidate(profileId);
    assert.deepEqual(validateNodeCandidate(request, candidate), { valid: true, errors: [] }, profileId);
    const report = await session.submit(candidate);
    assertSafeReport(report, profileId);
    assert.equal(report.classification, "exact_candidate_validated", profileId);
    assert.equal(report.attempt_count, 1, profileId);
    assert.deepEqual(report.candidate_top_level_keys, CANDIDATE_KEYS, profileId);
    assert.equal(report.exact_14_generated, true, profileId);
    assert.deepEqual(report.issue_codes, [], profileId);
    assert.deepEqual(session.diagnostics, {
      invocation_count: 1,
      audit_count: 1,
      consistent_request_identity: true,
      consistent_input_hash: true,
      retained_candidate_count: 0,
      retained_audit_record_count: 0,
      disposed: true,
    }, profileId);
  }
});

test("every owner-first N2-N7 profile has a profile-specific fail-closed fixture", async () => {
  const { createOwnerFirstNodePreviewSession } = await importBuilt(
    "src/neoloop/ai/owner-first-node-preview.js",
  );
  const observedFailures = new Set();
  for (const profileId of PROFILE_IDS) {
    const fixture = profileSpecificFailureFixture(profileId);
    const session = createOwnerFirstNodePreviewSession(profileId);
    const report = await session.submit(fixture.candidate);
    assertSafeReport(report, profileId);
    assert.equal(report.classification, "needs_human", fixture.failure);
    assert.equal(report.attempt_count, 1, fixture.failure);
    assert.equal(report.exact_14_generated, false, fixture.failure);
    assert.ok(
      report.issue_codes.includes(fixture.expectedIssueCode),
      `${fixture.failure}: ${report.issue_codes.join(",")}`,
    );
    observedFailures.add(`${profileId}:${fixture.failure}`);
    session.dispose();
  }
  assert.equal(observedFailures.size, PROFILE_IDS.length);
});

test("exact-five candidates with the right key set in the wrong Object.keys order require repair", async () => {
  const { createOwnerFirstNodePreviewSession } = await importBuilt(
    "src/neoloop/ai/owner-first-node-preview.js",
  );
  const valid = validCandidate("n2-default");
  const reordered = {
    status: valid.status,
    payload: valid.payload,
    evidence_spans: valid.evidence_spans,
    missing_fields: valid.missing_fields,
    confidence: valid.confidence,
  };
  assert.deepEqual(Object.keys(reordered).sort(), [...CANDIDATE_KEYS].sort());
  assert.notDeepEqual(Object.keys(reordered), CANDIDATE_KEYS);

  const session = createOwnerFirstNodePreviewSession("n2-default");
  const first = await session.submit(reordered);
  assert.equal(first.classification, "needs_human");
  assert.equal(first.attempt_count, 1);
  assert.equal(first.candidate_top_level_keys, null);
  assert.equal(first.exact_14_generated, false);
  assert.deepEqual(first.issue_codes, ["candidate_invalid_top_level_key_order"]);
  assert.equal(session.diagnostics.invocation_count, 0);
  assert.equal(session.diagnostics.audit_count, 0);

  const second = await session.submit(valid);
  assert.equal(second.classification, "exact_candidate_validated");
  assert.equal(second.attempt_count, 2);
  assert.deepEqual(second.candidate_top_level_keys, CANDIDATE_KEYS);
  assert.equal(second.exact_14_generated, true);
  assert.deepEqual(second.issue_codes, []);
  assert.equal(session.diagnostics.invocation_count, 1);
  assert.equal(session.diagnostics.audit_count, 1);
});

test("owner-first shared adapter allows one repair and then becomes terminal", async () => {
  const { createOwnerFirstNodePreviewSession } = await importBuilt(
    "src/neoloop/ai/owner-first-node-preview.js",
  );
  const session = createOwnerFirstNodePreviewSession("n6-root-cause");
  const invalid = { output: validCandidate("n6-root-cause"), run_id: "SYN-FORGED" };
  const first = await session.submit(invalid);
  assertSafeReport(first, "n6-root-cause");
  assert.equal(first.classification, "needs_human");
  assert.equal(first.attempt_count, 1);
  assert.deepEqual(first.issue_codes, [
    "candidate_missing_required_key",
    "candidate_extra_top_level_key",
  ]);
  const second = await session.submit(validCandidate("n6-root-cause"));
  assert.equal(second.classification, "exact_candidate_validated");
  assert.equal(second.attempt_count, 2);
  assert.equal(second.exact_14_generated, true);
  assert.equal(session.diagnostics.invocation_count, 2);
  assert.equal(session.diagnostics.audit_count, 2);
  await assert.rejects(() => session.submit(validCandidate("n6-root-cause")), /terminal or disposed/u);
});

test("owner-first shared adapter fails closed after two invalid candidates", async () => {
  const { createOwnerFirstNodePreviewSession } = await importBuilt(
    "src/neoloop/ai/owner-first-node-preview.js",
  );
  const session = createOwnerFirstNodePreviewSession("n7-customer-reply");
  const invalid = validCandidate("n7-customer-reply");
  invalid.payload.automatic_publication = true;
  const first = await session.submit(invalid);
  assert.equal(first.classification, "needs_human");
  assert.equal(first.exact_14_generated, false);
  const second = await session.submit(invalid);
  assert.equal(second.classification, "needs_human");
  assert.equal(second.attempt_count, 2);
  assert.equal(second.exact_14_generated, false);
  assert.deepEqual(second.issue_codes, ["candidate_injection_boundary_violation"]);
  assert.equal(session.diagnostics.invocation_count, 2);
  assert.equal(session.diagnostics.audit_count, 2);
  assert.equal(session.diagnostics.disposed, true);
});

test("N2-N7 fixed prompt files preserve exact-five, fixed mode, synthetic scope, and no-action boundaries", () => {
  for (const profileId of PROFILE_IDS) {
    const promptPath = new URL(`../../feishu/prompts/${profileId}-owner-first-exact-5.txt`, import.meta.url);
    const prompt = readFileSync(promptPath, "utf8");
    assert.match(prompt, new RegExp(`profile_id=${profileId.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}`), profileId);
    assert.match(prompt, /synthetic_experiment/u, profileId);
    assert.match(prompt, /顶层键必须且只能按以下顺序出现：[\s\S]*payload[\s\S]*evidence_spans[\s\S]*missing_fields[\s\S]*confidence[\s\S]*status/u, profileId);
    assert.match(prompt, /不得生成或猜测 node、mode、version、run_id、object_ref、input_hash、validation、retry_count、human_revision/u, profileId);
    assert.match(prompt, /不得执行工具、车辆控制、业务写入、消息通知、发布或任何外部动作/u, profileId);
    assert.match(prompt, /飞书界面的蓝色变量令牌/u, profileId);
    assert.match(prompt, /不得手输、猜测或粘贴资源 ID/u, profileId);
    assert.doesNotMatch(prompt, /\b(?:tbl|fld|rec|vew|wkf)[A-Za-z0-9]{8,}\b/u, profileId);
    assert.match(prompt, /最多只允许一次修复；第二次仍不合法时停止并转人工/u, profileId);
    assert.ok(prompt.endsWith("修复区：\n"), profileId);
  }
});
