import type { IngestRequest, IngestResult, JsonValue, WorkflowResult } from "../contracts/model.js";
import type { AuditSink, Clock, IdGenerator } from "../contracts/ports.js";
import { ingestFeedback } from "../domain/idempotency.js";
import { appendWorkflowAudit } from "./audit.js";
import type { FrontHalfRepository } from "./repository.js";

export interface W1Ports {
  clock: Clock;
  ids: IdGenerator;
  repository: FrontHalfRepository;
  audit: AuditSink;
}

function resultOutput(ingestResult: IngestResult | null): JsonValue {
  return { ingest_result: ingestResult as unknown as JsonValue };
}

export async function runW1(request: IngestRequest, ports: W1Ports): Promise<WorkflowResult<JsonValue>> {
  const eventId = ports.ids.nextId("event");
  let result: WorkflowResult<JsonValue>;
  try {
    const ingestResult = await ingestFeedback(request, ports);
    if (ingestResult.outcome === "idempotency_conflict") {
      result = {
        workflow: "W1",
        event_id: eventId,
        status: "failed",
        object_ref: { object_type: "raw_feedback", object_id: ingestResult.existing_feedback_id },
        actions: ["preserve_existing_feedback", "stop_before_W2"],
        errors: ["idempotency key conflicts with different content"],
        output: resultOutput(ingestResult),
      };
    } else {
      result = {
        workflow: "W1",
        event_id: eventId,
        status: ingestResult.outcome === "created" ? "completed" : "idempotent",
        object_ref: { object_type: "raw_feedback", object_id: ingestResult.feedback_id },
        actions: ingestResult.outcome === "created" ? ["create_raw_feedback"] : ["return_existing_feedback"],
        errors: [],
        output: resultOutput(ingestResult),
        ...(ingestResult.outcome === "created" ? { next_state: "待分诊" } : {}),
      };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown W1 error";
    result = {
      workflow: "W1",
      event_id: eventId,
      status: "failed",
      object_ref: { object_type: "raw_feedback", object_id: request.idempotency_key },
      actions: ["preserve_existing_feedback", "stop_before_W2"],
      errors: [message],
      output: resultOutput(null),
    };
  }
  await appendWorkflowAudit(result, ports);
  return result;
}
