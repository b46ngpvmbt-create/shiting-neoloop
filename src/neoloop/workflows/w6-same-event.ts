import type { AiNodeStatus, JsonValue, WorkflowResult } from "../contracts/model.js";
import type { AiNodeRunner, AuditSink, Clock, IdGenerator } from "../contracts/ports.js";
import { AI_NODE_DEFINITIONS, type N5SameEventPayload } from "../ai/definitions.js";
import { appendWorkflowAudit } from "./audit.js";
import type { SameEventCheck } from "./model.js";
import type { FrontHalfRepository } from "./repository.js";

export interface W6SameEventPorts {
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
  ports: W6SameEventPorts,
): Promise<WorkflowResult<JsonValue>> {
  await appendWorkflowAudit(result, ports);
  return result;
}

function resultForCheck(
  eventId: string,
  check: SameEventCheck,
  idempotent: boolean,
): WorkflowResult<JsonValue> {
  const hasCandidate = check.candidate !== null;
  const needsHuman = check.review_state === "pending";
  const nodeFailed = check.node_status !== "ok";
  const actions = nodeFailed
    ? [
        idempotent ? "return_existing_failed_same_event_check" : "store_failed_same_event_check",
        "await_human_confirmation",
        "do_not_merge",
        "do_not_relink",
      ]
    : hasCandidate
      ? [
          idempotent ? "return_existing_duplicate_candidate" : "create_duplicate_candidate",
          "await_human_confirmation",
          "do_not_merge",
          "do_not_relink",
        ]
      : ["complete_same_event_check", "keep_case_separate"];
  return {
    workflow: "W6",
    event_id: eventId,
    status: needsHuman ? "needs_human" : idempotent ? "idempotent" : "completed",
    object_ref: { object_type: "case", object_id: check.case_id },
    actions,
    errors: nodeFailed ? [`N5 same_event_duplicate stopped with status ${check.node_status}`] : [],
    output: { check: asJson(check) },
  };
}

function buildCheck(
  caseId: string,
  nodeStatus: AiNodeStatus,
  payload: N5SameEventPayload | null,
  evidenceSpans: SameEventCheck["evidence_spans"],
  ports: W6SameEventPorts,
): SameEventCheck {
  const candidate = payload?.duplicate_candidate ?? null;
  return {
    check_id: ports.ids.nextId("same-event-check"),
    case_id: caseId,
    mode: "same_event_duplicate",
    candidate: candidate
      ? { candidate_case_id: candidate.candidate_case_id, similarity: candidate.similarity }
      : null,
    evidence_spans: evidenceSpans.map((span) => ({ ...span })),
    review_state: nodeStatus === "ok" && candidate === null ? "not_required" : "pending",
    node_status: nodeStatus,
    automatic_merge: false,
    automatic_relink: false,
    created_at: ports.clock.now().toISOString(),
  };
}

export async function runW6SameEvent(
  caseId: string,
  ports: W6SameEventPorts,
): Promise<WorkflowResult<JsonValue>> {
  const eventId = ports.ids.nextId("event");
  try {
    const existing = await ports.repository.findSameEventCheckByCaseId(caseId);
    if (existing) {
      return auditAndReturn(resultForCheck(eventId, existing, true), ports);
    }

    const currentCase = await ports.repository.findCaseById(caseId);
    if (!currentCase) {
      return auditAndReturn(
        {
          workflow: "W6",
          event_id: eventId,
          status: "failed",
          object_ref: { object_type: "case", object_id: caseId },
          actions: ["stop_same_event_check", "do_not_merge", "do_not_relink"],
          errors: [`Case ${caseId} does not exist`],
          output: { check: null },
        },
        ports,
      );
    }

    const candidates = (await ports.repository.listCases()).filter((record) => record.case_id !== caseId);
    const envelope = await ports.ai_runner.run<JsonValue, JsonValue>({
      node: "N5",
      mode: AI_NODE_DEFINITIONS.N5_SAME_EVENT.mode,
      version: AI_NODE_DEFINITIONS.N5_SAME_EVENT.version,
      object_ref: { object_type: "case", object_id: caseId },
      input: {
        case_facts: {
          current: { case_id: currentCase.case_id, facts: [currentCase.summary] },
          candidates: candidates.map((record) => ({ case_id: record.case_id, facts: [record.summary] })),
        },
        time: {
          current: { case_id: currentCase.case_id, occurred_at: currentCase.created_at },
          candidates: candidates.map((record) => ({ case_id: record.case_id, occurred_at: record.created_at })),
        },
        confirmed_entities: {
          current: { case_id: currentCase.case_id, formal_entity: currentCase.formal_entity },
          candidates: candidates.map((record) => ({
            case_id: record.case_id,
            formal_entity: record.formal_entity,
          })),
        },
        source_reference: {
          current: { case_id: currentCase.case_id, source_ref: currentCase.source_locator },
          candidates: candidates.map((record) => ({
            case_id: record.case_id,
            source_ref: record.source_locator,
          })),
        },
      },
    });

    if (envelope.status !== "ok" || !envelope.validation.valid || envelope.payload === null) {
      const failedCheck = buildCheck(caseId, envelope.status, null, envelope.evidence_spans, ports);
      const insertion = await ports.repository.insertSameEventCheckIfAbsent(failedCheck);
      return auditAndReturn(resultForCheck(eventId, insertion.record, !insertion.inserted), ports);
    }

    const payload = envelope.payload as unknown as N5SameEventPayload;
    const check = buildCheck(caseId, "ok", payload, envelope.evidence_spans, ports);
    const insertion = await ports.repository.insertSameEventCheckIfAbsent(check);
    return auditAndReturn(resultForCheck(eventId, insertion.record, !insertion.inserted), ports);
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown W6 same-event error";
    return auditAndReturn(
      {
        workflow: "W6",
        event_id: eventId,
        status: "failed",
        object_ref: { object_type: "case", object_id: caseId },
        actions: ["preserve_case_state", "stop_same_event_check", "do_not_merge", "do_not_relink"],
        errors: [message],
        output: { check: null },
      },
      ports,
    );
  }
}
