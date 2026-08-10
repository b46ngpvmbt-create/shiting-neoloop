import { createHash } from "node:crypto";

import type {
  JsonValue,
  Notification,
  WorkflowResult,
} from "../contracts/model.js";
import type {
  AuditSink,
  Clock,
  IdGenerator,
  Notifier,
} from "../contracts/ports.js";
import { appendWorkflowAudit } from "./audit.js";
import type {
  AuthorizedHumanActor,
  FrontHalfCase,
  RuntimeWorkOrder,
} from "./model.js";

interface W4CommandBase {
  event_id: string;
  work_order_id: string;
  actor: W4Actor;
}

export interface W4AutomationActor {
  type: "workflow";
  actor_id: string;
  role: string;
}

export type W4Actor = AuthorizedHumanActor | W4AutomationActor;

export interface W4AcceptCommand extends W4CommandBase {
  action: "accept";
}

export interface W4ReassignCommand extends W4CommandBase {
  action: "reassign";
  team: string;
  assignee_role: string;
}

export interface W4ReminderCommand extends W4CommandBase {
  action: "remind";
  message: string;
}

export interface W4EscalateOverdueCommand extends W4CommandBase {
  action: "escalate_overdue";
  next_escalation_level: string;
  message: string;
}

export type W4Command =
  | W4AcceptCommand
  | W4ReassignCommand
  | W4ReminderCommand
  | W4EscalateOverdueCommand;

export interface W4CompareAndSetInput {
  expected_case: FrontHalfCase;
  expected_work_order: RuntimeWorkOrder;
  next_case: FrontHalfCase;
  next_work_order: RuntimeWorkOrder;
}

export interface W4Repository {
  findCaseById(caseId: string): Promise<FrontHalfCase | null>;
  findWorkOrderById(workOrderId: string): Promise<RuntimeWorkOrder | null>;
  runWorkflowEvent(
    eventId: string,
    fingerprint: string,
    operation: () => Promise<WorkflowResult<JsonValue>>,
  ): Promise<{ replayed: boolean; result: WorkflowResult<JsonValue> }>;
  runWorkOrderExclusive<T>(workOrderId: string, operation: () => Promise<T>): Promise<T>;
  compareAndSetCaseAndWorkOrder(input: W4CompareAndSetInput): Promise<{
    updated: boolean;
    case: FrontHalfCase | null;
    work_order: RuntimeWorkOrder | null;
  }>;
  compareAndSetCaseAndWorkOrderWithEffect(
    input: W4CompareAndSetInput,
    effect: () => Promise<void>,
  ): Promise<{
    updated: boolean;
    case: FrontHalfCase | null;
    work_order: RuntimeWorkOrder | null;
    effect_performed: boolean;
  }>;
}

export interface W4ActionAuthorizer {
  authorize(input: {
    actor: W4Actor;
    action: W4Command["action"];
    object_ref: { object_type: "work_order"; object_id: string };
  }): Promise<boolean>;
}

export interface W4Ports {
  clock: Clock;
  ids: IdGenerator;
  repository: W4Repository;
  audit: AuditSink;
  notifier: Notifier;
  action_authorizer: W4ActionAuthorizer;
}

type W4ErrorClass =
  | "none"
  | "event_conflict"
  | "authorization_failure"
  | "authorization_port_failure"
  | "invalid_command"
  | "record_not_found"
  | "invalid_state"
  | "invalid_sla"
  | "not_overdue"
  | "invalid_escalation_transition"
  | "notification_failure"
  | "concurrency_conflict"
  | "concurrency_conflict_after_notification"
  | "repository_failure_after_notification"
  | "repository_failure";

interface W4Snapshot {
  case: FrontHalfCase | null;
  work_order: RuntimeWorkOrder | null;
  notification: Notification | null;
  error_class: W4ErrorClass;
  notification_delivery?: "not_applicable" | "not_attempted" | "acknowledged" | "not_acknowledged" | "unknown";
  authorization_state?: "not_checked" | "authorized" | "denied" | "indeterminate";
}

const ACTIVE_WORK_ORDER_STATUSES = new Set(["待接单", "处理中"]);
const ACTIVE_CASE_STATUSES = new Set(["待派单", "处理中"]);
const W4_ACTIONS = ["accept", "reassign", "remind", "escalate_overdue"] as const;
const R3_APPROVED_ESCALATION_TRANSITIONS: Readonly<Record<string, string>> = {
  none: "L1",
};

function canonicalize(value: JsonValue): JsonValue {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalize(entry)]),
    );
  }
  return value;
}

function commandMaterial(command: W4Command): JsonValue {
  const actor = command.actor as AuthorizedHumanActor | undefined;
  const base: Record<string, JsonValue> = {
    action: command.action,
    work_order_id: command.work_order_id,
    actor: actor
      ? { type: actor.type, actor_id: actor.actor_id, role: actor.role }
      : null,
  };
  if (command.action === "reassign") {
    return { ...base, team: command.team, assignee_role: command.assignee_role };
  }
  if (command.action === "remind") {
    return { ...base, message: command.message };
  }
  if (command.action === "escalate_overdue") {
    return {
      ...base,
      next_escalation_level: command.next_escalation_level,
      message: command.message,
    };
  }
  return base;
}

export function fingerprintW4Command(command: W4Command): string {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(commandMaterial(command))))
    .digest("hex");
}

function jsonSnapshot(command: W4Command, snapshot: W4Snapshot): JsonValue {
  const notificationDelivery = snapshot.notification_delivery ?? (
    snapshot.notification === null
      ? "not_applicable"
      : snapshot.error_class === "notification_failure"
        ? "not_acknowledged"
        : snapshot.error_class === "repository_failure"
          ? "unknown"
          : "acknowledged"
  );
  const authorizationState = snapshot.authorization_state ?? (
    snapshot.error_class === "authorization_failure"
      ? "denied"
      : snapshot.error_class === "authorization_port_failure"
        ? "indeterminate"
        : snapshot.error_class === "event_conflict"
          ? "not_checked"
          : "authorized"
  );
  return {
    ...snapshot,
    notification_delivery: notificationDelivery,
    action_authorization: {
      actor: { ...command.actor },
      action: command.action,
      state: authorizationState,
      authorized: authorizationState === "authorized",
    },
  } as unknown as JsonValue;
}

function result(
  command: W4Command,
  status: WorkflowResult["status"],
  actions: string[],
  errors: string[],
  snapshot: W4Snapshot,
  states?: { previous: string; next: string },
): WorkflowResult<JsonValue> {
  return {
    workflow: "W4",
    event_id: command.event_id,
    status,
    object_ref: {
      object_type: "work_order",
      object_id: isNonBlank(command.work_order_id) ? command.work_order_id : "unknown_work_order",
    },
    ...(states ? { previous_state: states.previous, next_state: states.next } : {}),
    ...(snapshot.case?.sla_started_at
      ? { preserved_sla_started_at: snapshot.case.sla_started_at }
      : {}),
    actions,
    errors,
    output: jsonSnapshot(command, snapshot),
  };
}

function failed(
  command: W4Command,
  errorClass: Exclude<W4ErrorClass, "none">,
  message: string,
  caseRecord: FrontHalfCase | null,
  workOrder: RuntimeWorkOrder | null,
  notification: Notification | null = null,
  notificationDelivery?: W4Snapshot["notification_delivery"],
  authorizationState?: W4Snapshot["authorization_state"],
): WorkflowResult<JsonValue> {
  const preservationActions = [
    caseRecord ? "preserve_case_snapshot" : "case_snapshot_unavailable",
    workOrder ? "preserve_work_order_snapshot" : "work_order_snapshot_unavailable",
    caseRecord?.sla_started_at ? "preserve_sla" : "sla_snapshot_unavailable",
    "stop_W4",
  ];
  return result(
    command,
    "failed",
    preservationActions,
    [message],
    {
      case: caseRecord,
      work_order: workOrder,
      notification,
      error_class: errorClass,
      ...(notificationDelivery ? { notification_delivery: notificationDelivery } : {}),
      ...(authorizationState ? { authorization_state: authorizationState } : {}),
    },
  );
}

function isNonBlank(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function validateCommandBoundary(command: W4Command): string | null {
  if (!W4_ACTIONS.includes(command.action)) return "W4 action is not implemented";
  if (!isNonBlank(command.event_id) || !isNonBlank(command.work_order_id)) {
    return "W4 event_id and work_order_id are required";
  }
  if (command.action === "reassign" && (!isNonBlank(command.team) || !isNonBlank(command.assignee_role))) {
    return "W4 reassign requires a candidate team and logical role";
  }
  if (command.action === "remind" && !isNonBlank(command.message)) {
    return "W4 reminder message is required";
  }
  if (
    command.action === "escalate_overdue"
    && (!isNonBlank(command.next_escalation_level) || !isNonBlank(command.message))
  ) {
    return "W4 escalation level and message are required";
  }
  return null;
}

async function validateActor(command: W4Command, ports: W4Ports): Promise<string | null> {
  if (
    !command.actor
    || (command.actor.type !== "authorized_human" && command.actor.type !== "workflow")
    || !isNonBlank(command.actor.actor_id)
    || !isNonBlank(command.actor.role)
  ) {
    return "W4 requires an explicitly typed and authorized action actor";
  }
  const humanAction = command.action === "accept" || command.action === "reassign";
  if (humanAction && command.actor.type !== "authorized_human") {
    return `W4 ${command.action} requires an authorized human actor`;
  }
  if (!humanAction && command.actor.type !== "workflow") {
    return `W4 ${command.action} requires the authorized SLA workflow actor`;
  }
  const authorized = await ports.action_authorizer.authorize({
    actor: command.actor,
    action: command.action,
    object_ref: { object_type: "work_order", object_id: command.work_order_id },
  });
  if (!authorized) return "W4 actor is not allowlisted for this action and work order";
  return null;
}

class NotificationAcknowledgementError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotificationAcknowledgementError";
  }
}

function validateRecords(
  command: W4Command,
  caseRecord: FrontHalfCase,
  workOrder: RuntimeWorkOrder,
): { errorClass: Exclude<W4ErrorClass, "none">; message: string } | null {
  if (
    caseRecord.data_scope !== "synthetic_experiment"
    || workOrder.data_scope !== "synthetic_experiment"
  ) {
    return {
      errorClass: "invalid_state",
      message: "W4 v1 accepts synthetic_experiment records only",
    };
  }
  if (workOrder.case_id !== caseRecord.case_id) {
    return {
      errorClass: "invalid_state",
      message: `Work order ${command.work_order_id} is not linked to case ${caseRecord.case_id}`,
    };
  }
  if (!ACTIVE_WORK_ORDER_STATUSES.has(workOrder.status) || !ACTIVE_CASE_STATUSES.has(caseRecord.status)) {
    return {
      errorClass: "invalid_state",
      message: `W4 action ${command.action} is not allowed from ${caseRecord.status}/${workOrder.status}`,
    };
  }
  const startedAt = caseRecord.sla_started_at ? Date.parse(caseRecord.sla_started_at) : Number.NaN;
  const dueAt = caseRecord.sla_due_at ? Date.parse(caseRecord.sla_due_at) : Number.NaN;
  const workOrderDueAt = Date.parse(workOrder.due_at);
  if (
    !Number.isFinite(startedAt)
    || !Number.isFinite(dueAt)
    || !Number.isFinite(workOrderDueAt)
    || startedAt > dueAt
    || caseRecord.sla_due_at !== workOrder.due_at
    || !isNonBlank(caseRecord.sla_rule_version)
    || workOrder.sla_reset_count !== 0
  ) {
    return {
      errorClass: "invalid_sla",
      message: "W4 requires one consistent, human-confirmed SLA anchor with reset count zero",
    };
  }
  return null;
}

function makeNotification(
  kind: "reminder" | "escalation",
  command: W4ReminderCommand | W4EscalateOverdueCommand,
  ports: W4Ports,
): Notification {
  return {
    notification_id: ports.ids.nextId("notification"),
    kind,
    object_ref: { object_type: "work_order", object_id: command.work_order_id },
    message: command.message,
    created_at: ports.clock.now().toISOString(),
  };
}

async function compareAndSet(
  command: W4Command,
  expectedCase: FrontHalfCase,
  expectedWorkOrder: RuntimeWorkOrder,
  nextCase: FrontHalfCase,
  nextWorkOrder: RuntimeWorkOrder,
  ports: W4Ports,
  notification: Notification | null = null,
): Promise<WorkflowResult<JsonValue> | null> {
  try {
    const updated = await ports.repository.compareAndSetCaseAndWorkOrder({
      expected_case: expectedCase,
      expected_work_order: expectedWorkOrder,
      next_case: nextCase,
      next_work_order: nextWorkOrder,
    });
    if (!updated.updated) {
      return failed(
        command,
        "concurrency_conflict",
        "W4 records changed concurrently; no stale state was written",
        updated.case,
        updated.work_order,
        notification,
      );
    }
    return null;
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown W4 repository write failure";
    return failed(
      command,
      "repository_failure",
      message,
      expectedCase,
      expectedWorkOrder,
      notification,
    );
  }
}

async function executeCommand(command: W4Command, ports: W4Ports): Promise<WorkflowResult<JsonValue>> {
  let actorError: string | null;
  try {
    actorError = await validateActor(command, ports);
  } catch (error) {
    return failed(
      command,
      "authorization_port_failure",
      error instanceof Error ? error.message : "unknown W4 authorization port failure",
      null,
      null,
      null,
      undefined,
      "indeterminate",
    );
  }
  if (actorError) {
    return failed(command, "authorization_failure", actorError, null, null, null, undefined, "denied");
  }
  let workOrder: RuntimeWorkOrder | null;
  let caseRecord: FrontHalfCase | null;
  try {
    workOrder = await ports.repository.findWorkOrderById(command.work_order_id);
    caseRecord = workOrder ? await ports.repository.findCaseById(workOrder.case_id) : null;
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown W4 repository read failure";
    return failed(command, "repository_failure", message, null, null);
  }
  if (!workOrder || !caseRecord) {
    return failed(
      command,
      "record_not_found",
      `W4 records for work order ${command.work_order_id} were not found`,
      caseRecord,
      workOrder,
    );
  }

  const recordsError = validateRecords(command, caseRecord, workOrder);
  if (recordsError) {
    return failed(command, recordsError.errorClass, recordsError.message, caseRecord, workOrder);
  }

  const now = ports.clock.now().toISOString();
  if (command.action === "accept") {
    if (caseRecord.status !== "待派单" || workOrder.status !== "待接单") {
      return failed(
        command,
        "invalid_state",
        "W4 accept requires 待派单/待接单",
        caseRecord,
        workOrder,
      );
    }
    const nextCase: FrontHalfCase = { ...caseRecord, status: "处理中", updated_at: now };
    const nextWorkOrder: RuntimeWorkOrder = {
      ...workOrder,
      status: "处理中",
      accepted_at: now,
      updated_at: now,
    };
    const conflict = await compareAndSet(
      command,
      caseRecord,
      workOrder,
      nextCase,
      nextWorkOrder,
      ports,
    );
    if (conflict) return conflict;
    return result(
      command,
      "completed",
      ["accept_work_order", "transition_case_to_processing", "preserve_sla"],
      [],
      { case: nextCase, work_order: nextWorkOrder, notification: null, error_class: "none" },
      { previous: "待接单", next: "处理中" },
    );
  }

  if (command.action === "reassign") {
    if (!isNonBlank(command.team) || !isNonBlank(command.assignee_role)) {
      return failed(
        command,
        "invalid_command",
        "W4 reassign requires a candidate team and logical role",
        caseRecord,
        workOrder,
      );
    }
    const nextWorkOrder: RuntimeWorkOrder = {
      ...workOrder,
      team: command.team,
      assignee_role: command.assignee_role,
      updated_at: now,
    };
    const conflict = await compareAndSet(
      command,
      caseRecord,
      workOrder,
      caseRecord,
      nextWorkOrder,
      ports,
    );
    if (conflict) return conflict;
    return result(
      command,
      "completed",
      ["reassign_candidate_team_and_logical_role", "preserve_state", "preserve_sla"],
      [],
      { case: caseRecord, work_order: nextWorkOrder, notification: null, error_class: "none" },
    );
  }

  if (command.action === "remind") {
    if (!isNonBlank(command.message)) {
      return failed(command, "invalid_command", "W4 reminder message is required", caseRecord, workOrder);
    }
    const notification = makeNotification("reminder", command, ports);
    try {
      await ports.notifier.notify(notification);
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown W4 notification failure";
      return failed(
        command,
        "notification_failure",
        message,
        caseRecord,
        workOrder,
        notification,
      );
    }
    return result(
      command,
      "completed",
      ["send_synthetic_reminder", "preserve_state", "preserve_sla"],
      [],
      { case: caseRecord, work_order: workOrder, notification, error_class: "none" },
    );
  }

  if (!isNonBlank(command.next_escalation_level) || !isNonBlank(command.message)) {
    return failed(
      command,
      "invalid_command",
      "W4 escalation level and message are required",
      caseRecord,
      workOrder,
    );
  }
  if (R3_APPROVED_ESCALATION_TRANSITIONS[workOrder.escalation_level] !== command.next_escalation_level) {
    return failed(
      command,
      "invalid_escalation_transition",
      "W4 escalation must follow the approved R3 transition none -> L1; later levels require a frozen path",
      caseRecord,
      workOrder,
    );
  }
  if (ports.clock.now().getTime() <= Date.parse(caseRecord.sla_due_at as string)) {
    return failed(
      command,
      "not_overdue",
      "W4 escalation is allowed only after the confirmed SLA due time",
      caseRecord,
      workOrder,
    );
  }
  const notification = makeNotification("escalation", command, ports);
  const nextWorkOrder: RuntimeWorkOrder = {
    ...workOrder,
    escalation_level: command.next_escalation_level,
    updated_at: now,
  };
  const delivery: { state: "not_attempted" | "acknowledged" | "not_acknowledged" } = {
    state: "not_attempted",
  };
  try {
    const updated = await ports.repository.compareAndSetCaseAndWorkOrderWithEffect(
      {
        expected_case: caseRecord,
        expected_work_order: workOrder,
        next_case: caseRecord,
        next_work_order: nextWorkOrder,
      },
      async () => {
        try {
          await ports.notifier.notify(notification);
          delivery.state = "acknowledged";
        } catch (error) {
          delivery.state = "not_acknowledged";
          throw new NotificationAcknowledgementError(
            error instanceof Error ? error.message : "unknown W4 notification failure",
          );
        }
      },
    );
    if (!updated.updated) {
      const acknowledged = updated.effect_performed || delivery.state === "acknowledged";
      return failed(
        command,
        acknowledged ? "concurrency_conflict_after_notification" : "concurrency_conflict",
        acknowledged
          ? "The escalation notifier acknowledged the effect, but a concurrent record change prevented the escalation level write"
          : "W4 records changed concurrently before the notifier was called",
        updated.case,
        updated.work_order,
        notification,
        acknowledged ? "acknowledged" : "not_attempted",
      );
    }
  } catch (error) {
    if (error instanceof NotificationAcknowledgementError) {
      return failed(command, "notification_failure", error.message, caseRecord, workOrder, notification, "not_acknowledged");
    }
    const acknowledged = delivery.state === "acknowledged";
    return failed(
      command,
      acknowledged ? "repository_failure_after_notification" : "repository_failure",
      acknowledged
        ? `The escalation notifier acknowledged the effect, but persistence failed: ${error instanceof Error ? error.message : "unknown W4 repository write failure"}`
        : error instanceof Error ? error.message : "unknown W4 repository write failure",
      caseRecord,
      workOrder,
      notification,
      acknowledged ? "acknowledged" : "not_attempted",
    );
  }
  return result(
    command,
    "completed",
    ["send_synthetic_escalation", "record_escalation_level", "preserve_state", "preserve_sla"],
    [],
    {
      case: caseRecord,
      work_order: nextWorkOrder,
      notification,
      error_class: "none",
      notification_delivery: "acknowledged",
    },
  );
}

function replayResult(stored: WorkflowResult<JsonValue>): WorkflowResult<JsonValue> {
  const storedOutput = stored.output && typeof stored.output === "object" && !Array.isArray(stored.output)
    ? stored.output
    : {};
  return {
    ...stored,
    status: stored.status === "completed" ? "idempotent" : stored.status,
    actions: ["return_existing_W4_result", ...stored.actions],
    output: { ...storedOutput, event_replayed: true },
  };
}

function isWorkflowEventConflict(error: unknown): boolean {
  return error instanceof Error && error.name === "WorkflowEventConflictError";
}

export async function runW4(
  command: W4Command,
  ports: W4Ports,
): Promise<WorkflowResult<JsonValue>> {
  const commandError = validateCommandBoundary(command);
  if (commandError) {
    const invalid = failed(
      command,
      "invalid_command",
      commandError,
      null,
      null,
      null,
      undefined,
      "not_checked",
    );
    await appendWorkflowAudit(invalid, ports);
    return invalid;
  }
  const fingerprint = fingerprintW4Command(command);
  let workflowResult: WorkflowResult<JsonValue>;
  try {
    const event = await ports.repository.runWorkflowEvent(
      command.event_id,
      fingerprint,
      () => ports.repository.runWorkOrderExclusive(
        command.work_order_id,
        () => executeCommand(command, ports),
      ),
    );
    workflowResult = event.replayed ? replayResult(event.result) : event.result;
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown W4 event repository failure";
    workflowResult = failed(
      command,
      isWorkflowEventConflict(error) ? "event_conflict" : "repository_failure",
      message,
      null,
      null,
      null,
      undefined,
      "not_checked",
    );
  }
  await appendWorkflowAudit(workflowResult, ports);
  return workflowResult;
}
