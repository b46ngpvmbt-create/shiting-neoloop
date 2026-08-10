import type { AuditRecord, JsonValue, WorkflowResult } from "../contracts/model.js";
import type { AuditSink, Clock, IdGenerator } from "../contracts/ports.js";

export interface WorkflowAuditPorts {
  audit: AuditSink;
  clock: Clock;
  ids: IdGenerator;
}

export async function appendWorkflowAudit(
  result: WorkflowResult,
  ports: WorkflowAuditPorts,
): Promise<void> {
  const payload: JsonValue = {
    workflow: result.workflow,
    event_id: result.event_id,
    result: result as unknown as JsonValue,
  };
  const record: AuditRecord = {
    audit_id: ports.ids.nextId("audit"),
    object_ref: { ...result.object_ref },
    category: "workflow",
    occurred_at: ports.clock.now().toISOString(),
    clock_source: ports.clock.source,
    payload,
  };
  await ports.audit.append(record);
}
