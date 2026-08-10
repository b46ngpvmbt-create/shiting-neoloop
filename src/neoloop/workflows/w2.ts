import type {
  AiNodeEnvelope,
  JsonValue,
  WorkflowResult,
} from "../contracts/model.js";
import type {
  AiNodeRunRequest,
  AiNodeRunner,
  AuditSink,
  Clock,
  IdGenerator,
} from "../contracts/ports.js";
import {
  AI_NODE_DEFINITIONS,
  type N1Payload,
  type N2Payload,
  type N3Payload,
} from "../ai/definitions.js";
import { selectFinalRisk } from "../domain/rules.js";
import { transitionFeedback } from "../domain/state-machine.js";
import { appendWorkflowAudit } from "./audit.js";
import { evaluateHardRuleRisk } from "./hard-rules.js";
import type { FrontHalfCase } from "./model.js";
import type { FrontHalfRepository } from "./repository.js";

export interface W2Ports {
  clock: Clock;
  ids: IdGenerator;
  repository: FrontHalfRepository;
  audit: AuditSink;
  ai_runner: AiNodeRunner;
}

function asJson(value: unknown): JsonValue {
  return value as JsonValue;
}

async function auditAndReturn(
  result: WorkflowResult<JsonValue>,
  ports: W2Ports,
): Promise<WorkflowResult<JsonValue>> {
  await appendWorkflowAudit(result, ports);
  return result;
}

async function routeToHuman(
  feedbackId: string,
  eventId: string,
  reason: string,
  ports: W2Ports,
): Promise<WorkflowResult<JsonValue>> {
  transitionFeedback("待分诊", "人工处理", "workflow");
  let update: Awaited<ReturnType<W2Ports["repository"]["updateRawFeedbackStatus"]>>;
  try {
    update = await ports.repository.updateRawFeedbackStatus(feedbackId, "待分诊", "人工处理");
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown repository error";
    return auditAndReturn(
      {
        workflow: "W2",
        event_id: eventId,
        status: "failed",
        object_ref: { object_type: "raw_feedback", object_id: feedbackId },
        actions: ["preserve_existing_state", "stop_node_chain", "do_not_create_case"],
        errors: [reason, `human routing repository error: ${message}`],
        output: { case: null, human_takeover_required: true },
      },
      ports,
    );
  }
  const routed = update.updated || update.record?.processing_status === "人工处理";
  return auditAndReturn(
    {
      workflow: "W2",
      event_id: eventId,
      status: routed ? "needs_human" : "failed",
      object_ref: { object_type: "raw_feedback", object_id: feedbackId },
      previous_state: update.updated ? "待分诊" : update.record?.processing_status,
      next_state: routed ? "人工处理" : update.record?.processing_status,
      actions: routed
        ? ["preserve_original_feedback", "route_to_human", "stop_node_chain", "do_not_create_case"]
        : ["preserve_original_feedback", "stop_node_chain", "do_not_create_case"],
      errors: [reason],
      output: { case: null, human_takeover_required: true },
    },
    ports,
  );
}

function isSuccessful(envelope: AiNodeEnvelope<JsonValue>): boolean {
  return envelope.status === "ok" && envelope.validation.valid && envelope.payload !== null;
}

export async function runW2(feedbackId: string, ports: W2Ports): Promise<WorkflowResult<JsonValue>> {
  const eventId = ports.ids.nextId("event");
  try {
  const existingCase = await ports.repository.findCaseByFeedbackId(feedbackId);
  if (existingCase) {
    return auditAndReturn(
      {
        workflow: "W2",
        event_id: eventId,
        status: "idempotent",
        object_ref: { object_type: "case", object_id: existingCase.case_id },
        previous_state: existingCase.status,
        next_state: existingCase.status,
        actions: ["return_existing_case"],
        errors: [],
        output: { case: asJson(existingCase) },
      },
      ports,
    );
  }

  const feedback = await ports.repository.findRawFeedbackById(feedbackId);
  if (!feedback) {
    return auditAndReturn(
      {
        workflow: "W2",
        event_id: eventId,
        status: "failed",
        object_ref: { object_type: "raw_feedback", object_id: feedbackId },
        actions: ["stop_node_chain", "do_not_create_case"],
        errors: [`Raw feedback ${feedbackId} does not exist`],
        output: { case: null },
      },
      ports,
    );
  }
  if (feedback.processing_status === "人工处理") {
    return auditAndReturn(
      {
        workflow: "W2",
        event_id: eventId,
        status: "needs_human",
        object_ref: { object_type: "raw_feedback", object_id: feedbackId },
        previous_state: "人工处理",
        next_state: "人工处理",
        actions: ["preserve_original_feedback", "await_human_takeover", "do_not_create_case"],
        errors: ["feedback already requires human handling"],
        output: { case: null, human_takeover_required: true },
      },
      ports,
    );
  }
  if (feedback.processing_status !== "待分诊") {
    return auditAndReturn(
      {
        workflow: "W2",
        event_id: eventId,
        status: "failed",
        object_ref: { object_type: "raw_feedback", object_id: feedbackId },
        previous_state: feedback.processing_status,
        next_state: feedback.processing_status,
        actions: ["preserve_existing_state", "stop_node_chain"],
        errors: [`feedback state ${feedback.processing_status} cannot start W2`],
        output: { case: null },
      },
      ports,
    );
  }

  const hardRule = evaluateHardRuleRisk(feedback.request.original_text);
  const n1Request: AiNodeRunRequest<JsonValue> = {
    node: "N1",
    mode: AI_NODE_DEFINITIONS.N1.mode,
    version: AI_NODE_DEFINITIONS.N1.version,
    object_ref: { object_type: "raw_feedback", object_id: feedbackId },
    input: {
      original_text: feedback.request.original_text,
      channel_metadata: {
        channel: feedback.request.channel,
        source_record_id: feedback.request.source_record_id ?? null,
      },
    },
  };

    const n1 = await ports.ai_runner.run<JsonValue, JsonValue>(n1Request);
    if (!isSuccessful(n1)) {
      return routeToHuman(feedbackId, eventId, `N1 stopped with status ${n1.status}`, ports);
    }
    const n1Payload = n1.payload as unknown as N1Payload;

    const n2Request: AiNodeRunRequest<JsonValue> = {
      node: "N2",
      mode: AI_NODE_DEFINITIONS.N2.mode,
      version: AI_NODE_DEFINITIONS.N2.version,
      object_ref: { object_type: "raw_feedback", object_id: feedbackId },
      input: {
        n1_output: asJson(n1Payload),
        taxonomy: {
          domains: ["车辆运维", "任务履约", "站点服务", "其他"],
          subcategories: {
            "车辆运维": ["舱门解锁异常", "自动驾驶/道路安全", "网络连接"],
            "任务履约": ["配送时效", "任务中断"],
            "站点服务": ["路线/地图点位", "现场交接"],
            "其他": ["待人工分类"],
          },
          tags: ["舱门", "延误", "道路安全", "网络", "任务", "站点", "其他"],
        },
        taxonomy_version: "taxonomy-synthetic-v1",
      },
    };
    const n2 = await ports.ai_runner.run<JsonValue, JsonValue>(n2Request);
    if (!isSuccessful(n2)) {
      return routeToHuman(feedbackId, eventId, `N2 stopped with status ${n2.status}`, ports);
    }
    const n2Payload = n2.payload as unknown as N2Payload;

    const n3Request: AiNodeRunRequest<JsonValue> = {
      node: "N3",
      mode: AI_NODE_DEFINITIONS.N3.mode,
      version: AI_NODE_DEFINITIONS.N3.version,
      object_ref: { object_type: "raw_feedback", object_id: feedbackId },
      input: {
        original_text: feedback.request.original_text,
        n1_output: asJson(n1Payload),
        hard_rule_result: asJson(hardRule),
      },
    };
    const n3 = await ports.ai_runner.run<JsonValue, JsonValue>(n3Request);
    if (!isSuccessful(n3)) {
      return routeToHuman(feedbackId, eventId, `N3 stopped with status ${n3.status}`, ports);
    }
    const n3Payload = n3.payload as unknown as N3Payload;

    const missingFields = [...new Set([...n1.missing_fields, ...n2.missing_fields, ...n3.missing_fields])].sort();
    const caseStatus = missingFields.length > 0 ? "待补充" : "待关联";
    const finalRisk = selectFinalRisk(hardRule.risk_level, n3Payload.risk_suggestion);
    const now = ports.clock.now().toISOString();
    const facts = n1Payload.fact_spans.map((entry) => entry.fact);
    const summary = facts.join("；");
    const caseRecord: FrontHalfCase = {
      schema_version: feedback.request.schema_version,
      data_scope: feedback.request.data_scope,
      evidence_class: feedback.request.evidence_class,
      created_at: now,
      updated_at: now,
      source_kind: "scenario_runtime",
      case_id: ports.ids.nextId("case"),
      legacy_id: "not_applicable_scenario_runtime",
      title: facts[0] ?? "待人工补充的合成反馈案件",
      summary,
      category_domain: n2Payload.business_domain,
      category_detail: n2Payload.subcategory,
      rule_risk: hardRule.risk_level,
      ai_risk: n3Payload.risk_suggestion,
      final_risk: finalRisk,
      status: caseStatus,
      missing_fields: missingFields,
      entity_candidates: {
        vehicle_ids: [...n1Payload.entity_clues.vehicle_ids],
        task_ids: [...n1Payload.entity_clues.task_ids],
        station_names: [...n1Payload.entity_clues.station_names],
        confidence: n1.confidence,
      },
      formal_entity: null,
      formal_entity_confirmation_status: "待人工确认",
      evidence_completeness: missingFields.length === 0 ? "complete" : "partial",
      evidence_summary: summary,
      sla_started_at: null,
      sla_due_at: null,
      sla_rule_version: "pending_human_confirmation",
      candidate_generation_mode: "AI",
      suggested_team: "pending_human_confirmation",
      routing_rule_candidate_id: null,
      cluster_id: null,
      pending_confirmation_items: ["formal_entity", "responsibility_owner", "sla_rule_version"],
      closed_at: null,
      record_mode: "scenario_runtime",
      workflow_readiness: "awaiting_same_event_check",
      legacy_association_mode: "not_applicable",
      legacy_reviewer: "not_applicable",
      legacy_status: "not_applicable",
      migration_note: null,
      source_name: "synthetic_experiment",
      source_locator: feedback.request.source_record_id ?? feedbackId,
      source_sha256: feedback.content_fingerprint,
    };

    transitionFeedback("待分诊", "已建案", "workflow");
    const creation = await ports.repository.createCaseAndMarkFeedback(feedbackId, caseRecord);
    return auditAndReturn(
      {
        workflow: "W2",
        event_id: eventId,
        status: creation.created ? "completed" : "idempotent",
        object_ref: { object_type: "case", object_id: creation.record.case_id },
        previous_state: "待分诊",
        next_state: creation.record.status,
        actions: creation.created
          ? ["run_hard_rules", "run_N1", "run_N2", "run_N3", "create_case", "mark_feedback_已建案"]
          : ["return_existing_case"],
        errors: [],
        output: {
          case: asJson(creation.record),
          feedback_status: creation.feedback.processing_status,
        },
      },
      ports,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown W2 error";
    return auditAndReturn(
      {
        workflow: "W2",
        event_id: eventId,
        status: "failed",
        object_ref: { object_type: "raw_feedback", object_id: feedbackId },
        actions: ["preserve_existing_state", "stop_node_chain", "do_not_create_case"],
        errors: [`W2 infrastructure error: ${message}`],
        output: { case: null, human_takeover_required: true },
      },
      ports,
    );
  }
}
