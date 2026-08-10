import type { WorkOrderStatus } from "../contracts/model.js";

export interface SlaTrackedWorkOrder {
  work_order_id: string;
  team: string;
  assignee_id: string | null;
  status: WorkOrderStatus;
  sla_started_at: string;
  due_at: string;
  sla_rule_version: string;
  escalation_level: number;
}

export function createSlaTrackedWorkOrder(input: {
  work_order_id: string;
  team: string;
  assignee_id?: string | null;
  sla_started_at: string;
  duration_ms: number;
  sla_rule_version: string;
}): SlaTrackedWorkOrder {
  if (!Number.isFinite(input.duration_ms) || input.duration_ms <= 0) {
    throw new Error("SLA duration must be a positive finite number");
  }
  const startedAt = new Date(input.sla_started_at);
  if (Number.isNaN(startedAt.getTime())) {
    throw new Error("Invalid SLA start time");
  }

  return {
    work_order_id: input.work_order_id,
    team: input.team,
    assignee_id: input.assignee_id ?? null,
    status: "待接单",
    sla_started_at: startedAt.toISOString(),
    due_at: new Date(startedAt.getTime() + input.duration_ms).toISOString(),
    sla_rule_version: input.sla_rule_version,
    escalation_level: 0,
  };
}

export function reassignWorkOrder(
  workOrder: SlaTrackedWorkOrder,
  assignment: { team: string; assignee_id: string | null },
): SlaTrackedWorkOrder {
  return {
    ...workOrder,
    team: assignment.team,
    assignee_id: assignment.assignee_id,
  };
}

export function escalateWorkOrder(workOrder: SlaTrackedWorkOrder): SlaTrackedWorkOrder {
  return { ...workOrder, escalation_level: workOrder.escalation_level + 1 };
}
