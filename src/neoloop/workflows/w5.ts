import type {
  AiNodeEnvelope,
  AuditRecord,
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
import { validateAiNodeEnvelope } from "../contracts/validation.js";
import {
  AI_NODE_DEFINITIONS,
  type N7Payload,
} from "../ai/definitions.js";
import { createAiInputHash } from "../ai/runner.js";
import {
  validateNodeCandidate,
  validateNodeRequestDefinition,
} from "../ai/validation.js";
import { createWorkflowEventFingerprint } from "./event-idempotency.js";
import type {
  AuthorizedHumanActor,
  FrontHalfCase,
  RuntimeWorkOrder,
  W3AuthorizedPrincipal,
  W5AtomicTransition,
  W5ClosureDecision,
  W5EvidenceSubmission,
  W5FollowUp,
  W5History,
  W5ReplyDraft,
  W5ReplyReview,
} from "./model.js";
import {
  WorkflowEventConflictError,
  type W5AuthorizationGrant,
  type W5AuthorizationGrantClaims,
} from "./repository.js";

export interface W5ReviewedFact {
  source_ref: string;
  text: string;
  review_status: "approved";
  review_ref: string;
}

export interface W5ReviewedKnowledge {
  knowledge_id: string;
  version: string;
  approval_status: "已审核";
  effective_at: string;
  citation_allowed_for_n7: true;
  source_ref: string;
  text: string;
}

export interface W5EvidenceInput {
  submission_id: string;
  source_ref: string;
  text: string;
  artifact_refs: string[];
  reviewed_facts: W5ReviewedFact[];
}

interface W5CommandBase {
  event_id: string;
  case_id: string;
  work_order_id: string;
  actor: AuthorizedHumanActor;
}

export interface W5SubmitClosureRequestCommand extends W5CommandBase {
  action: "submit_closure_request";
  evidence: W5EvidenceInput;
  reviewed_knowledge_index: W5ReviewedKnowledge[];
}

export interface W5SupplementEvidenceCommand extends W5CommandBase {
  action: "supplement_evidence";
  replaces_submission_id: string;
  evidence: W5EvidenceInput;
  reviewed_knowledge_index: W5ReviewedKnowledge[];
}

export interface W5ReviewReplyCommand extends W5CommandBase {
  action: "review_reply";
  draft_id: string;
  decision: "approve_for_manual_delivery" | "return_to_processing";
  reason: string;
  manual_delivery_reference: string | null;
}

export interface W5RecordFollowUpCommand extends W5CommandBase {
  action: "record_follow_up";
  outcome: "resolved" | "abnormal";
  summary: string;
  follow_up_reference: string;
}

export interface W5DecideClosureCommand extends W5CommandBase {
  action: "decide_closure";
  decision: "close" | "return_to_processing";
  reason: string;
}

export type W5Command =
  | W5SubmitClosureRequestCommand
  | W5SupplementEvidenceCommand
  | W5ReviewReplyCommand
  | W5RecordFollowUpCommand
  | W5DecideClosureCommand;

export interface W5AuthorizationDecision {
  allowed: true;
  principal: W3AuthorizedPrincipal;
  policy_version: string;
  grant: W5AuthorizationGrant;
}

export interface W5AuthorizationDenial {
  allowed: false;
  reason: string;
}

export interface W5ActionAuthorizer {
  authorize(input: {
    event_id: string;
    actor: AuthorizedHumanActor;
    action: W5Command["action"];
    object_ref: { object_type: "case"; object_id: string };
    work_order_id: string;
    target: JsonValue;
    target_fingerprint: string;
    command_fingerprint: string;
  }): Promise<W5AuthorizationDecision | W5AuthorizationDenial>;
}

export interface W5Repository {
  findCaseById(caseId: string): Promise<FrontHalfCase | null>;
  findWorkOrderById(workOrderId: string): Promise<RuntimeWorkOrder | null>;
  getW5History(caseId: string): Promise<W5History>;
  commitW5Transition(input: W5AtomicTransition): Promise<{
    updated: boolean;
    case: FrontHalfCase;
    work_order: RuntimeWorkOrder;
    history: W5History;
  }>;
  runAuthorizedW5Action<T>(
    input: {
      grant: W5AuthorizationGrant;
      claims: W5AuthorizationGrantClaims;
    },
    operation: (authorization: W5AuthorizationGrantClaims) => Promise<T>,
  ): Promise<T>;
  runWorkflowEvent(
    eventId: string,
    fingerprint: string,
    operation: () => Promise<WorkflowResult<JsonValue>>,
  ): Promise<{ replayed: boolean; result: WorkflowResult<JsonValue> }>;
  runCaseExclusive<T>(caseId: string, operation: () => Promise<T>): Promise<T>;
  runWorkflowAuditExclusive<T>(eventId: string, operation: () => Promise<T>): Promise<T>;
}

export interface W5Ports {
  clock: Clock;
  ids: IdGenerator;
  repository: W5Repository;
  audit: AuditSink;
  ai_runner: AiNodeRunner;
  action_authorizer: W5ActionAuthorizer;
}

type W5ErrorClass =
  | "none"
  | "invalid_command"
  | "event_conflict"
  | "authorization_failure"
  | "authorization_port_failure"
  | "authorization_capability_invalid"
  | "record_not_found"
  | "invalid_state"
  | "insufficient_evidence"
  | "n7_failure"
  | "concurrency_conflict"
  | "repository_failure";

interface W5Snapshot {
  case: FrontHalfCase | null;
  work_order: RuntimeWorkOrder | null;
  history: W5History;
  current_draft: W5ReplyDraft | null;
  error_class: W5ErrorClass;
  authorization_state: "not_checked" | "authorized" | "denied" | "indeterminate";
}

const EMPTY_HISTORY: W5History = {
  evidence_submissions: [],
  reply_drafts: [],
  reply_reviews: [],
  follow_ups: [],
  closure_decisions: [],
};
const W5_ACTIONS = [
  "submit_closure_request",
  "supplement_evidence",
  "review_reply",
  "record_follow_up",
  "decide_closure",
] as const;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isIsoTimestamp(value: unknown): value is string {
  return isNonEmptyString(value) && Number.isFinite(Date.parse(value));
}

function hasExactOwnDataKeys(value: object, expectedKeys: readonly string[]): boolean {
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  const ownKeys = Reflect.ownKeys(value);
  if (!ownKeys.every((key) => typeof key === "string")) return false;
  const actual = (ownKeys as string[]).sort();
  const expected = [...expectedKeys].sort();
  if (actual.length !== expected.length || !actual.every((key, index) => key === expected[index])) {
    return false;
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  return actual.every((key) => {
    const descriptor = descriptors[key];
    return descriptor !== undefined && descriptor.enumerable && !descriptor.get && !descriptor.set;
  });
}

function hasTrustedActor(value: unknown): value is AuthorizedHumanActor {
  return isObject(value) &&
    hasExactOwnDataKeys(value, ["type", "actor_id", "role"]) &&
    value.type === "authorized_human" &&
    isNonEmptyString(value.actor_id) &&
    isNonEmptyString(value.role);
}

function hasTrustedPrincipal(value: unknown): value is W3AuthorizedPrincipal {
  return isObject(value) &&
    hasExactOwnDataKeys(value, ["principal_id", "principal_type", "canonical_role", "authority_source"]) &&
    isNonEmptyString(value.principal_id) &&
    value.principal_type === "synthetic_human" &&
    isNonEmptyString(value.canonical_role) &&
    value.authority_source === "synthetic_allowlist";
}

function validateReviewedFact(value: unknown): value is W5ReviewedFact {
  return isObject(value) &&
    hasExactOwnDataKeys(value, ["source_ref", "text", "review_status", "review_ref"]) &&
    isNonEmptyString(value.source_ref) &&
    isNonEmptyString(value.text) &&
    value.review_status === "approved" &&
    isNonEmptyString(value.review_ref);
}

function validateKnowledge(value: unknown): value is W5ReviewedKnowledge {
  return isObject(value) &&
    hasExactOwnDataKeys(value, [
      "knowledge_id",
      "version",
      "approval_status",
      "effective_at",
      "citation_allowed_for_n7",
      "source_ref",
      "text",
    ]) &&
    isNonEmptyString(value.knowledge_id) &&
    isNonEmptyString(value.version) &&
    value.approval_status === "已审核" &&
    isIsoTimestamp(value.effective_at) &&
    value.citation_allowed_for_n7 === true &&
    isNonEmptyString(value.source_ref) &&
    isNonEmptyString(value.text);
}

function validateEvidenceShape(value: unknown): value is W5EvidenceInput {
  return isObject(value) &&
    hasExactOwnDataKeys(value, ["submission_id", "source_ref", "text", "artifact_refs", "reviewed_facts"]) &&
    isNonEmptyString(value.submission_id) &&
    isNonEmptyString(value.source_ref) &&
    typeof value.text === "string" &&
    Array.isArray(value.artifact_refs) &&
    value.artifact_refs.every(isNonEmptyString) &&
    Array.isArray(value.reviewed_facts) &&
    value.reviewed_facts.every(validateReviewedFact);
}

type CommandBoundary =
  | { valid: true; command: W5Command }
  | { valid: false; error: string };

function validateCommandBoundary(value: unknown): CommandBoundary {
  try {
    if (!isObject(value)) return { valid: false, error: "W5 command must be a plain object" };
    const action = value.action;
    if (!W5_ACTIONS.includes(action as (typeof W5_ACTIONS)[number])) {
      return { valid: false, error: "W5 action is not implemented" };
    }
    const common = ["action", "event_id", "case_id", "work_order_id", "actor"];
    const expected = action === "submit_closure_request"
      ? [...common, "evidence", "reviewed_knowledge_index"]
      : action === "supplement_evidence"
        ? [...common, "replaces_submission_id", "evidence", "reviewed_knowledge_index"]
        : action === "review_reply"
          ? [...common, "draft_id", "decision", "reason", "manual_delivery_reference"]
          : action === "record_follow_up"
            ? [...common, "outcome", "summary", "follow_up_reference"]
            : [...common, "decision", "reason"];
    if (!hasExactOwnDataKeys(value, expected)) {
      return { valid: false, error: "W5 command contains missing, inherited, accessor, symbol, or extra fields" };
    }
    if (
      !isNonEmptyString(value.event_id) ||
      !isNonEmptyString(value.case_id) ||
      !isNonEmptyString(value.work_order_id) ||
      !hasTrustedActor(value.actor)
    ) {
      return { valid: false, error: "W5 requires stable identifiers and an explicitly typed human actor" };
    }
    if (action === "submit_closure_request" || action === "supplement_evidence") {
      if (
        !validateEvidenceShape(value.evidence) ||
        !Array.isArray(value.reviewed_knowledge_index) ||
        !value.reviewed_knowledge_index.every(validateKnowledge) ||
        value.reviewed_knowledge_index.length === 0
      ) {
        return { valid: false, error: "W5 evidence and reviewed knowledge inputs violate the trusted boundary" };
      }
      if (action === "supplement_evidence" && !isNonEmptyString(value.replaces_submission_id)) {
        return { valid: false, error: "W5 evidence supplement must reference an earlier submission" };
      }
    } else if (action === "review_reply") {
      if (
        !isNonEmptyString(value.draft_id) ||
        (value.decision !== "approve_for_manual_delivery" && value.decision !== "return_to_processing") ||
        !isNonEmptyString(value.reason) ||
        (
          value.decision === "approve_for_manual_delivery"
            ? !isNonEmptyString(value.manual_delivery_reference)
            : value.manual_delivery_reference !== null
        )
      ) {
        return { valid: false, error: "W5 reply review decision is invalid" };
      }
    } else if (action === "record_follow_up") {
      if (
        (value.outcome !== "resolved" && value.outcome !== "abnormal") ||
        !isNonEmptyString(value.summary) ||
        !isNonEmptyString(value.follow_up_reference)
      ) {
        return { valid: false, error: "W5 follow-up requires a bounded outcome, summary, and reference" };
      }
    } else if (
      (value.decision !== "close" && value.decision !== "return_to_processing") ||
      !isNonEmptyString(value.reason)
    ) {
      return { valid: false, error: "W5 closure decision is invalid" };
    }
    return { valid: true, command: value as unknown as W5Command };
  } catch {
    return { valid: false, error: "W5 command could not be inspected safely" };
  }
}

function asJson(value: unknown): JsonValue {
  return value as JsonValue;
}

function commandMaterial(command: W5Command): JsonValue {
  return structuredClone(command) as unknown as JsonValue;
}

export function fingerprintW5Command(command: W5Command): string {
  return createWorkflowEventFingerprint({ workflow: "W5", command: commandMaterial(command) });
}

function cloneHistory(history: W5History): W5History {
  return structuredClone(history);
}

function outputSnapshot(snapshot: W5Snapshot): JsonValue {
  return {
    case: snapshot.case ? asJson(structuredClone(snapshot.case)) : null,
    work_order: snapshot.work_order ? asJson(structuredClone(snapshot.work_order)) : null,
    history: asJson(cloneHistory(snapshot.history)),
    current_draft: snapshot.current_draft ? asJson(structuredClone(snapshot.current_draft)) : null,
    error_class: snapshot.error_class,
    action_authorization: {
      state: snapshot.authorization_state,
      authorized: snapshot.authorization_state === "authorized",
    },
    external_effects: {
      reply_sent_by_workflow: false,
      knowledge_published_by_workflow: false,
      case_closed_without_human: false,
      vehicle_control_performed: false,
    },
  };
}

function makeResult(
  command: Pick<W5Command, "event_id" | "case_id" | "work_order_id">,
  status: WorkflowResult["status"],
  actions: string[],
  errors: string[],
  snapshot: W5Snapshot,
  states?: { previous: string; next: string },
): WorkflowResult<JsonValue> {
  return {
    workflow: "W5",
    event_id: command.event_id,
    status,
    object_ref: {
      object_type: "case",
      object_id: isNonEmptyString(command.case_id) ? command.case_id : "unknown_case",
    },
    ...(states ? { previous_state: states.previous, next_state: states.next } : {}),
    ...(snapshot.case?.sla_started_at
      ? { preserved_sla_started_at: snapshot.case.sla_started_at }
      : {}),
    actions,
    errors,
    output: outputSnapshot(snapshot),
  };
}

function failure(
  command: Pick<W5Command, "event_id" | "case_id" | "work_order_id">,
  errorClass: Exclude<W5ErrorClass, "none">,
  message: string,
  snapshot: Omit<W5Snapshot, "error_class">,
): WorkflowResult<JsonValue> {
  return makeResult(
    command,
    "failed",
    [
      snapshot.case ? "preserve_case_state" : "case_snapshot_unavailable",
      snapshot.work_order ? "preserve_work_order_state" : "work_order_snapshot_unavailable",
      snapshot.case?.sla_started_at ? "preserve_original_sla" : "sla_snapshot_unavailable",
      "preserve_W5_evidence_and_decisions",
      "stop_W5",
    ],
    [message],
    { ...snapshot, error_class: errorClass },
  );
}

async function loadSnapshot(command: Pick<W5Command, "case_id" | "work_order_id">, ports: W5Ports): Promise<W5Snapshot> {
  const caseRecord = await ports.repository.findCaseById(command.case_id);
  const workOrder = await ports.repository.findWorkOrderById(command.work_order_id);
  const history = caseRecord ? await ports.repository.getW5History(command.case_id) : cloneHistory(EMPTY_HISTORY);
  return {
    case: caseRecord,
    work_order: workOrder,
    history,
    current_draft: history.reply_drafts.at(-1) ?? null,
    error_class: "none",
    authorization_state: "not_checked",
  };
}

function validateEntrySnapshot(snapshot: W5Snapshot, command: W5Command): string | null {
  if (!snapshot.case || !snapshot.work_order) return "W5 case or work order was not found";
  if (
    snapshot.case.case_id !== command.case_id ||
    snapshot.work_order.work_order_id !== command.work_order_id ||
    snapshot.work_order.case_id !== command.case_id
  ) return "W5 command identifiers do not match the persisted case and work order";
  if (
    snapshot.case.data_scope !== "synthetic_experiment" ||
    snapshot.work_order.data_scope !== "synthetic_experiment"
  ) return "W5 v1 accepts synthetic_experiment records only";
  if (
    !isIsoTimestamp(snapshot.case.sla_started_at) ||
    !isIsoTimestamp(snapshot.case.sla_due_at) ||
    snapshot.case.sla_due_at !== snapshot.work_order.due_at ||
    snapshot.work_order.sla_reset_count !== 0
  ) return "W5 requires one stable, previously confirmed SLA anchor";
  return null;
}

function authorizationTarget(command: W5Command): JsonValue {
  if (command.action === "submit_closure_request") {
    return { evidence_submission_id: command.evidence.submission_id };
  }
  if (command.action === "supplement_evidence") {
    return {
      evidence_submission_id: command.evidence.submission_id,
      replaces_submission_id: command.replaces_submission_id,
    };
  }
  if (command.action === "review_reply") {
    return { draft_id: command.draft_id, decision: command.decision };
  }
  if (command.action === "record_follow_up") {
    return { outcome: command.outcome, follow_up_reference: command.follow_up_reference };
  }
  return { decision: command.decision };
}

async function authorize(
  command: W5Command,
  commandFingerprint: string,
  ports: W5Ports,
): Promise<
  | { granted: true; decision: W5AuthorizationDecision }
  | { granted: false; result: WorkflowResult<JsonValue> }
> {
  let raw: W5AuthorizationDecision | W5AuthorizationDenial;
  try {
    const target = authorizationTarget(command);
    raw = await ports.action_authorizer.authorize({
      event_id: command.event_id,
      actor: { ...command.actor },
      action: command.action,
      object_ref: { object_type: "case", object_id: command.case_id },
      work_order_id: command.work_order_id,
      target: structuredClone(target),
      target_fingerprint: createWorkflowEventFingerprint(target),
      command_fingerprint: commandFingerprint,
    });
  } catch {
    const snapshot = await loadSnapshot(command, ports).catch(() => ({
      case: null,
      work_order: null,
      history: cloneHistory(EMPTY_HISTORY),
      current_draft: null,
      error_class: "none" as const,
      authorization_state: "indeterminate" as const,
    }));
    return {
      granted: false,
      result: failure(command, "authorization_port_failure", "W5 authorization could not be verified", {
        ...snapshot,
        authorization_state: "indeterminate",
      }),
    };
  }
  try {
    if (
      !isObject(raw) ||
      (raw.allowed === true
        ? !hasExactOwnDataKeys(raw, ["allowed", "principal", "policy_version", "grant"]) ||
          !hasTrustedPrincipal(raw.principal) ||
          !isNonEmptyString(raw.policy_version) ||
          !isObject(raw.grant)
        : raw.allowed !== false ||
          !hasExactOwnDataKeys(raw, ["allowed", "reason"]) ||
          !isNonEmptyString(raw.reason))
    ) {
      throw new Error("invalid authorization decision");
    }
  } catch {
    const snapshot = await loadSnapshot(command, ports);
    return {
      granted: false,
      result: failure(command, "authorization_port_failure", "W5 authorization decision was malformed", {
        ...snapshot,
        authorization_state: "indeterminate",
      }),
    };
  }
  if (!raw.allowed) {
    const snapshot = await loadSnapshot(command, ports);
    return {
      granted: false,
      result: failure(command, "authorization_failure", raw.reason, {
        ...snapshot,
        authorization_state: "denied",
      }),
    };
  }
  return {
    granted: true,
    decision: {
      allowed: true,
      principal: { ...raw.principal },
      policy_version: raw.policy_version,
      grant: raw.grant,
    },
  };
}

function evidenceMissingFields(evidence: W5EvidenceInput): string[] {
  return [
    ...(evidence.text.trim().length === 0 ? ["resolution_text"] : []),
    ...(evidence.artifact_refs.length === 0 ? ["artifact_refs"] : []),
    ...(evidence.reviewed_facts.length === 0 ? ["reviewed_facts"] : []),
  ].sort();
}

function evidenceRecord(
  command: W5SubmitClosureRequestCommand | W5SupplementEvidenceCommand,
  authorization: W5AuthorizationDecision,
  now: string,
): W5EvidenceSubmission {
  const missing = evidenceMissingFields(command.evidence);
  return {
    submission_id: command.evidence.submission_id,
    event_id: command.event_id,
    case_id: command.case_id,
    work_order_id: command.work_order_id,
    kind: command.action === "supplement_evidence" ? "evidence_supplement" : "closure_request",
    replaces_submission_id: command.action === "supplement_evidence" ? command.replaces_submission_id : null,
    source_ref: command.evidence.source_ref,
    text: command.evidence.text,
    artifact_refs: [...command.evidence.artifact_refs],
    reviewed_facts: command.evidence.reviewed_facts.map((fact) => ({ ...fact })),
    completeness: missing.length === 0 ? "complete" : "incomplete",
    missing_fields: missing,
    principal: { ...authorization.principal },
    authorization_policy_version: authorization.policy_version,
    submitted_at: now,
  };
}

function buildN7Request(
  command: W5SubmitClosureRequestCommand | W5SupplementEvidenceCommand,
): AiNodeRunRequest<JsonValue> {
  return {
    node: "N7",
    mode: AI_NODE_DEFINITIONS.N7_CUSTOMER_REPLY.mode,
    version: AI_NODE_DEFINITIONS.N7_CUSTOMER_REPLY.version,
    object_ref: { object_type: "case", object_id: command.case_id },
    input: {
      reviewed_facts: command.evidence.reviewed_facts.map((fact) => ({ ...fact })),
      resolution_result: {
        source_ref: command.evidence.source_ref,
        text: command.evidence.text,
        validation_status: "verified",
        review_ref: command.evidence.submission_id,
      },
      reviewed_knowledge_index: command.reviewed_knowledge_index.map((record) => ({ ...record })),
    },
  };
}

function isBoundSuccessfulN7(
  envelope: AiNodeEnvelope<JsonValue>,
  request: AiNodeRunRequest<JsonValue>,
): envelope is AiNodeEnvelope<JsonValue> & { payload: N7Payload } {
  if (
    envelope.status !== "ok" ||
    !envelope.validation.valid ||
    envelope.payload === null ||
    envelope.node !== request.node ||
    envelope.mode !== request.mode ||
    envelope.version !== request.version ||
    envelope.object_ref.object_type !== request.object_ref.object_type ||
    envelope.object_ref.object_id !== request.object_ref.object_id ||
    envelope.input_hash !== createAiInputHash(request) ||
    !validateAiNodeEnvelope(envelope).valid ||
    !validateNodeRequestDefinition(request).valid
  ) return false;
  return validateNodeCandidate(request, {
    payload: envelope.payload,
    evidence_spans: envelope.evidence_spans,
    missing_fields: envelope.missing_fields,
    confidence: envelope.confidence,
    status: envelope.status,
  }).valid;
}

function draftRecord(
  command: W5SubmitClosureRequestCommand | W5SupplementEvidenceCommand,
  envelope: AiNodeEnvelope<JsonValue> & { payload: N7Payload },
  draftId: string,
  now: string,
): W5ReplyDraft {
  return {
    draft_id: draftId,
    event_id: command.event_id,
    case_id: command.case_id,
    work_order_id: command.work_order_id,
    node_run_id: envelope.run_id,
    node_version: envelope.version,
    input_hash: envelope.input_hash,
    draft_kind: "customer_reply",
    draft: envelope.payload.draft,
    citations: envelope.payload.citations.map((citation) => ({
      ...citation,
      evidence_span_indices: [...citation.evidence_span_indices],
    })),
    supporting_evidence_indices: [...envelope.payload.supporting_evidence_indices],
    evidence_spans: envelope.evidence_spans.map((span) => ({ ...span })),
    publication_state: "draft_unpublished",
    human_review_required: true,
    automatic_publication: false,
    created_at: now,
  };
}

async function commit(
  command: W5Command,
  transition: W5AtomicTransition,
  ports: W5Ports,
): Promise<
  | { ok: true; snapshot: W5Snapshot }
  | { ok: false; result: WorkflowResult<JsonValue> }
> {
  try {
    const committed = await ports.repository.commitW5Transition(transition);
    const snapshot: W5Snapshot = {
      case: committed.case,
      work_order: committed.work_order,
      history: committed.history,
      current_draft: committed.history.reply_drafts.at(-1) ?? null,
      error_class: committed.updated ? "none" : "concurrency_conflict",
      authorization_state: "authorized",
    };
    if (!committed.updated) {
      return {
        ok: false,
        result: failure(command, "concurrency_conflict", "W5 records changed concurrently; no stale state was written", snapshot),
      };
    }
    return { ok: true, snapshot };
  } catch {
    const snapshot = await loadSnapshot(command, ports).catch(() => ({
      case: null,
      work_order: null,
      history: cloneHistory(EMPTY_HISTORY),
      current_draft: null,
      error_class: "none" as const,
      authorization_state: "authorized" as const,
    }));
    return {
      ok: false,
      result: failure(command, "repository_failure", "W5 repository transition failed", {
        ...snapshot,
        authorization_state: "authorized",
      }),
    };
  }
}

async function executeEvidenceCommand(
  command: W5SubmitClosureRequestCommand | W5SupplementEvidenceCommand,
  authorization: W5AuthorizationDecision,
  snapshot: W5Snapshot,
  ports: W5Ports,
): Promise<WorkflowResult<JsonValue>> {
  const caseRecord = snapshot.case as FrontHalfCase;
  const workOrder = snapshot.work_order as RuntimeWorkOrder;
  if (
    caseRecord.status !== "处理中" ||
    workOrder.status !== "处理中" ||
    !["dispatched", "awaiting_resolution_evidence"].includes(caseRecord.workflow_readiness)
  ) {
    return failure(command, "invalid_state", "W5 evidence submission requires the processing evidence gate", {
      ...snapshot,
      authorization_state: "authorized",
    });
  }
  if (
    command.action === "supplement_evidence" &&
    !snapshot.history.evidence_submissions.some((record) =>
      record.submission_id === command.replaces_submission_id && record.completeness === "incomplete"
    )
  ) {
    return failure(command, "invalid_state", "W5 supplement does not reference a persisted incomplete submission", {
      ...snapshot,
      authorization_state: "authorized",
    });
  }
  const now = ports.clock.now().toISOString();
  const evidence = evidenceRecord(command, authorization, now);
  const baseNextCase: FrontHalfCase = {
    ...caseRecord,
    updated_at: now,
    closed_at: null,
  };
  const baseNextWorkOrder: RuntimeWorkOrder = {
    ...workOrder,
    updated_at: now,
    completed_at: null,
  };
  if (evidence.completeness === "incomplete") {
    const transition: W5AtomicTransition = {
      transition: "evidence_incomplete",
      expected_case: caseRecord,
      expected_work_order: workOrder,
      next_case: {
        ...baseNextCase,
        status: "处理中",
        workflow_readiness: "awaiting_resolution_evidence",
      },
      next_work_order: {
        ...baseNextWorkOrder,
        status: "处理中",
        validation_result: "pending",
      },
      append: { evidence_submission: evidence },
    };
    const committed = await commit(command, transition, ports);
    if (!committed.ok) return committed.result;
    return makeResult(
      command,
      "needs_human",
      ["record_incomplete_evidence", "return_to_processing", "preserve_original_sla", "do_not_run_N7"],
      [`resolution evidence is incomplete: ${evidence.missing_fields.join(", ")}`],
      { ...committed.snapshot, error_class: "insufficient_evidence" },
      { previous: "处理中", next: "处理中" },
    );
  }

  const request = buildN7Request(command);
  const envelope = await ports.ai_runner.run<JsonValue, JsonValue>(request);
  if (!isBoundSuccessfulN7(envelope, request)) {
    const transition: W5AtomicTransition = {
      transition: "n7_failed",
      expected_case: caseRecord,
      expected_work_order: workOrder,
      next_case: {
        ...baseNextCase,
        status: "处理中",
        workflow_readiness: "awaiting_resolution_evidence",
      },
      next_work_order: {
        ...baseNextWorkOrder,
        status: "处理中",
        disposition_evidence: evidence.text,
        validation_result: "pending",
      },
      append: { evidence_submission: evidence },
    };
    const committed = await commit(command, transition, ports);
    if (!committed.ok) return committed.result;
    return makeResult(
      command,
      "needs_human",
      ["record_resolution_evidence", "stop_after_N7", "return_to_processing", "preserve_original_sla"],
      [`N7 customer_reply stopped with status ${envelope.status}`],
      { ...committed.snapshot, error_class: "n7_failure" },
      { previous: "处理中", next: "处理中" },
    );
  }

  const draft = draftRecord(command, envelope, ports.ids.nextId("draft"), now);
  const transition: W5AtomicTransition = {
    transition: "evidence_ready",
    expected_case: caseRecord,
    expected_work_order: workOrder,
    next_case: {
      ...baseNextCase,
      status: "待验证",
      workflow_readiness: "awaiting_reply_review",
    },
    next_work_order: {
      ...baseNextWorkOrder,
      status: "待验证",
      disposition_evidence: evidence.text,
      validation_result: "pending",
    },
    append: { evidence_submission: evidence, reply_draft: draft },
  };
  const committed = await commit(command, transition, ports);
  if (!committed.ok) return committed.result;
  return makeResult(
    command,
    "completed",
    [
      "validate_resolution_evidence",
      "run_N7_customer_reply",
      "store_unpublished_reply_draft",
      "await_authorized_reply_review",
      "preserve_original_sla",
    ],
    [],
    committed.snapshot,
    { previous: "处理中", next: "待验证" },
  );
}

async function executeReview(
  command: W5ReviewReplyCommand,
  authorization: W5AuthorizationDecision,
  snapshot: W5Snapshot,
  ports: W5Ports,
): Promise<WorkflowResult<JsonValue>> {
  const caseRecord = snapshot.case as FrontHalfCase;
  const workOrder = snapshot.work_order as RuntimeWorkOrder;
  if (
    caseRecord.status !== "待验证" ||
    workOrder.status !== "待验证" ||
    caseRecord.workflow_readiness !== "awaiting_reply_review" ||
    snapshot.current_draft?.draft_id !== command.draft_id ||
    snapshot.history.reply_reviews.some((record) => record.draft_id === command.draft_id)
  ) {
    return failure(command, "invalid_state", "W5 reply review requires the current unpublished draft at 待验证", {
      ...snapshot,
      authorization_state: "authorized",
    });
  }
  const now = ports.clock.now().toISOString();
  const review: W5ReplyReview = {
    review_id: ports.ids.nextId("reply-review"),
    event_id: command.event_id,
    case_id: command.case_id,
    work_order_id: command.work_order_id,
    draft_id: command.draft_id,
    decision: command.decision,
    reason: command.reason,
    manual_delivery_reference: command.manual_delivery_reference,
    principal: { ...authorization.principal },
    authorization_policy_version: authorization.policy_version,
    decided_at: now,
  };
  const approved = command.decision === "approve_for_manual_delivery";
  const transition: W5AtomicTransition = {
    transition: approved ? "reply_approved" : "reply_returned",
    expected_case: caseRecord,
    expected_work_order: workOrder,
    next_case: {
      ...caseRecord,
      status: approved ? "待回访" : "处理中",
      workflow_readiness: approved ? "awaiting_follow_up" : "awaiting_resolution_evidence",
      updated_at: now,
      closed_at: null,
    },
    next_work_order: {
      ...workOrder,
      status: approved ? "待验证" : "处理中",
      validation_result: approved ? "pending" : "failed",
      updated_at: now,
      completed_at: null,
    },
    append: { reply_review: review },
  };
  const committed = await commit(command, transition, ports);
  if (!committed.ok) return committed.result;
  return makeResult(
    command,
    "completed",
    approved
      ? [
          "record_authorized_reply_approval",
          "record_human_manual_delivery_reference",
          "do_not_send_reply_from_workflow",
          "enter_follow_up",
          "preserve_original_sla",
        ]
      : ["record_reply_return", "return_to_processing", "preserve_draft_and_evidence", "preserve_original_sla"],
    [],
    committed.snapshot,
    { previous: "待验证", next: approved ? "待回访" : "处理中" },
  );
}

async function executeFollowUp(
  command: W5RecordFollowUpCommand,
  authorization: W5AuthorizationDecision,
  snapshot: W5Snapshot,
  ports: W5Ports,
): Promise<WorkflowResult<JsonValue>> {
  const caseRecord = snapshot.case as FrontHalfCase;
  const workOrder = snapshot.work_order as RuntimeWorkOrder;
  if (
    caseRecord.status !== "待回访" ||
    workOrder.status !== "待验证" ||
    caseRecord.workflow_readiness !== "awaiting_follow_up" ||
    snapshot.history.reply_reviews.at(-1)?.decision !== "approve_for_manual_delivery"
  ) {
    return failure(command, "invalid_state", "W5 follow-up requires an authorized reply approval and 待回访", {
      ...snapshot,
      authorization_state: "authorized",
    });
  }
  const now = ports.clock.now().toISOString();
  const followUp: W5FollowUp = {
    follow_up_id: ports.ids.nextId("follow-up"),
    event_id: command.event_id,
    case_id: command.case_id,
    work_order_id: command.work_order_id,
    outcome: command.outcome,
    summary: command.summary,
    follow_up_reference: command.follow_up_reference,
    principal: { ...authorization.principal },
    authorization_policy_version: authorization.policy_version,
    recorded_at: now,
  };
  const resolved = command.outcome === "resolved";
  const transition: W5AtomicTransition = {
    transition: resolved ? "follow_up_resolved" : "follow_up_abnormal",
    expected_case: caseRecord,
    expected_work_order: workOrder,
    next_case: {
      ...caseRecord,
      status: resolved ? "待回访" : "处理中",
      workflow_readiness: resolved ? "awaiting_closure_decision" : "awaiting_resolution_evidence",
      updated_at: now,
      closed_at: null,
    },
    next_work_order: {
      ...workOrder,
      status: resolved ? "待验证" : "处理中",
      validation_result: resolved ? "pending" : "failed",
      updated_at: now,
      completed_at: null,
    },
    append: { follow_up: followUp },
  };
  const committed = await commit(command, transition, ports);
  if (!committed.ok) return committed.result;
  return makeResult(
    command,
    "completed",
    resolved
      ? ["record_resolved_follow_up", "await_authorized_closure_decision", "preserve_original_sla"]
      : ["record_abnormal_follow_up", "return_to_processing", "preserve_original_sla"],
    [],
    committed.snapshot,
    { previous: "待回访", next: resolved ? "待回访" : "处理中" },
  );
}

async function executeClosure(
  command: W5DecideClosureCommand,
  authorization: W5AuthorizationDecision,
  snapshot: W5Snapshot,
  ports: W5Ports,
): Promise<WorkflowResult<JsonValue>> {
  const caseRecord = snapshot.case as FrontHalfCase;
  const workOrder = snapshot.work_order as RuntimeWorkOrder;
  if (
    caseRecord.status !== "待回访" ||
    caseRecord.workflow_readiness !== "awaiting_closure_decision" ||
    workOrder.status !== "待验证" ||
    snapshot.history.reply_reviews.at(-1)?.decision !== "approve_for_manual_delivery" ||
    snapshot.history.follow_ups.at(-1)?.outcome !== "resolved"
  ) {
    return failure(command, "invalid_state", "W5 closure requires approved reply, resolved follow-up, and an authorized decision", {
      ...snapshot,
      authorization_state: "authorized",
    });
  }
  const now = ports.clock.now().toISOString();
  const closure: W5ClosureDecision = {
    decision_id: ports.ids.nextId("closure-decision"),
    event_id: command.event_id,
    case_id: command.case_id,
    work_order_id: command.work_order_id,
    decision: command.decision,
    reason: command.reason,
    principal: { ...authorization.principal },
    authorization_policy_version: authorization.policy_version,
    decided_at: now,
  };
  const closes = command.decision === "close";
  const transition: W5AtomicTransition = {
    transition: closes ? "closure_closed" : "closure_returned",
    expected_case: caseRecord,
    expected_work_order: workOrder,
    next_case: {
      ...caseRecord,
      status: closes ? "已关闭" : "处理中",
      workflow_readiness: closes ? "closed" : "awaiting_resolution_evidence",
      updated_at: now,
      closed_at: closes ? now : null,
    },
    next_work_order: {
      ...workOrder,
      status: closes ? "已完成" : "处理中",
      validation_result: closes ? "passed" : "failed",
      updated_at: now,
      completed_at: closes ? now : null,
    },
    append: { closure_decision: closure },
  };
  const committed = await commit(command, transition, ports);
  if (!committed.ok) return committed.result;
  return makeResult(
    command,
    "completed",
    closes
      ? [
          "record_authorized_human_closure",
          "complete_work_order",
          "set_closed_at_from_test_clock",
          "preserve_original_sla",
          "do_not_auto_publish_knowledge",
        ]
      : ["record_closure_return", "return_to_processing", "preserve_original_sla"],
    [],
    committed.snapshot,
    { previous: "待回访", next: closes ? "已关闭" : "处理中" },
  );
}

async function executeAuthorizedW5(
  command: W5Command,
  authorization: W5AuthorizationDecision,
  ports: W5Ports,
): Promise<WorkflowResult<JsonValue>> {
  let snapshot: W5Snapshot;
  try {
    snapshot = await loadSnapshot(command, ports);
  } catch {
    return failure(command, "repository_failure", "W5 repository read failed", {
      case: null,
      work_order: null,
      history: cloneHistory(EMPTY_HISTORY),
      current_draft: null,
      authorization_state: "authorized",
    });
  }
  const entryError = validateEntrySnapshot(snapshot, command);
  if (entryError) {
    return failure(command, snapshot.case && snapshot.work_order ? "invalid_state" : "record_not_found", entryError, {
      ...snapshot,
      authorization_state: "authorized",
    });
  }
  if (command.action === "submit_closure_request" || command.action === "supplement_evidence") {
    return executeEvidenceCommand(command, authorization, snapshot, ports);
  }
  if (command.action === "review_reply") {
    return executeReview(command, authorization, snapshot, ports);
  }
  if (command.action === "record_follow_up") {
    return executeFollowUp(command, authorization, snapshot, ports);
  }
  return executeClosure(command, authorization, snapshot, ports);
}

async function executeW5(
  command: W5Command,
  commandFingerprint: string,
  ports: W5Ports,
): Promise<WorkflowResult<JsonValue>> {
  const authorization = await authorize(command, commandFingerprint, ports);
  if (!authorization.granted) return authorization.result;
  const target = authorizationTarget(command);
  const claims: W5AuthorizationGrantClaims = {
    workflow: "W5",
    event_id: command.event_id,
    case_id: command.case_id,
    work_order_id: command.work_order_id,
    action: command.action,
    target_fingerprint: createWorkflowEventFingerprint(target),
    command_fingerprint: commandFingerprint,
    principal: { ...authorization.decision.principal },
    policy_version: authorization.decision.policy_version,
  };
  try {
    return await ports.repository.runAuthorizedW5Action(
      { grant: authorization.decision.grant, claims },
      (trustedClaims) => executeAuthorizedW5(
        command,
        {
          ...authorization.decision,
          principal: { ...trustedClaims.principal },
          policy_version: trustedClaims.policy_version,
        },
        ports,
      ),
    );
  } catch {
    const snapshot = await loadSnapshot(command, ports).catch(() => ({
      case: null,
      work_order: null,
      history: cloneHistory(EMPTY_HISTORY),
      current_draft: null,
      error_class: "none" as const,
      authorization_state: "indeterminate" as const,
    }));
    return failure(
      command,
      "authorization_capability_invalid",
      "W5 authorization capability could not be verified",
      { ...snapshot, authorization_state: "indeterminate" },
    );
  }
}

function workflowAuditId(fingerprint: string): string {
  return `W5-WORKFLOW-AUDIT-${fingerprint}`;
}

function withWorkflowAuditState(
  workflowResult: WorkflowResult<JsonValue>,
  auditId: string,
  state: "recorded" | "pending",
  options: { event_result_cached: boolean; error_class?: string },
): WorkflowResult<JsonValue> {
  const output = isObject(workflowResult.output) ? workflowResult.output : {};
  const pending = state === "pending";
  const actions = pending
    ? [...workflowResult.actions, "workflow_audit_pending", "retry_audit_without_repeating_business_effects"]
    : workflowResult.actions.filter((action) =>
        action !== "workflow_audit_pending" && action !== "retry_audit_without_repeating_business_effects"
      );
  return {
    ...workflowResult,
    actions: [...new Set(actions)],
    output: {
      ...output,
      workflow_audit_id: auditId,
      audit_state: state,
      audit_pending: pending,
      audit_error_class: options.error_class ?? null,
      event_result_cached: options.event_result_cached,
      committed_result_status: workflowResult.status,
    },
  };
}

function workflowAuditRecord(
  workflowResult: WorkflowResult<JsonValue>,
  auditId: string,
  ports: W5Ports,
): AuditRecord {
  return {
    audit_id: auditId,
    object_ref: { ...workflowResult.object_ref },
    category: "workflow",
    occurred_at: ports.clock.now().toISOString(),
    clock_source: ports.clock.source,
    payload: {
      workflow: workflowResult.workflow,
      event_id: workflowResult.event_id,
      result: structuredClone(workflowResult) as unknown as JsonValue,
    },
  };
}

function replaceCachedResult(
  target: WorkflowResult<JsonValue>,
  next: WorkflowResult<JsonValue>,
): WorkflowResult<JsonValue> {
  Object.assign(target, structuredClone(next));
  return target;
}

async function ensureCachedWorkflowAudit(
  cachedResult: WorkflowResult<JsonValue>,
  fingerprint: string,
  ports: W5Ports,
): Promise<WorkflowResult<JsonValue>> {
  const currentOutput = isObject(cachedResult.output) ? cachedResult.output : {};
  if (currentOutput.audit_state === "recorded") return cachedResult;
  const auditId = isNonEmptyString(currentOutput.workflow_audit_id)
    ? currentOutput.workflow_audit_id
    : workflowAuditId(fingerprint);
  const recorded = withWorkflowAuditState(cachedResult, auditId, "recorded", {
    event_result_cached: true,
  });
  try {
    await ports.audit.append(workflowAuditRecord(recorded, auditId, ports));
    return replaceCachedResult(cachedResult, recorded);
  } catch {
    return replaceCachedResult(cachedResult, withWorkflowAuditState(cachedResult, auditId, "pending", {
      event_result_cached: true,
      error_class: "audit_failure_after_commit",
    }));
  }
}

async function appendTransientWorkflowAudit(
  workflowResult: WorkflowResult<JsonValue>,
  fingerprint: string,
  ports: W5Ports,
): Promise<WorkflowResult<JsonValue>> {
  const auditId = workflowAuditId(fingerprint);
  const recorded = withWorkflowAuditState(workflowResult, auditId, "recorded", {
    event_result_cached: false,
  });
  try {
    await ports.audit.append(workflowAuditRecord(recorded, auditId, ports));
    return recorded;
  } catch {
    return withWorkflowAuditState(workflowResult, auditId, "pending", {
      event_result_cached: false,
      error_class: "audit_sink_failure_without_event_cache",
    });
  }
}

function replayResult(stored: WorkflowResult<JsonValue>): WorkflowResult<JsonValue> {
  const cloned = structuredClone(stored);
  const output = isObject(cloned.output) ? cloned.output : {};
  return {
    ...cloned,
    status: cloned.status === "completed" ? "idempotent" : cloned.status,
    actions: [
      "return_existing_W5_result",
      "do_not_repeat_N7",
      "do_not_repeat_authorization",
      "do_not_repeat_human_decision",
      "do_not_repeat_domain_side_effects",
      ...cloned.actions,
    ],
    output: { ...output, event_replayed: true },
  };
}

function safeInvalidRefs(value: unknown): Pick<W5Command, "event_id" | "case_id" | "work_order_id"> {
  try {
    if (!isObject(value)) {
      return { event_id: "invalid_W5_event", case_id: "unknown_case", work_order_id: "unknown_work_order" };
    }
    return {
      event_id: isNonEmptyString(value.event_id) ? value.event_id : "invalid_W5_event",
      case_id: isNonEmptyString(value.case_id) ? value.case_id : "unknown_case",
      work_order_id: isNonEmptyString(value.work_order_id) ? value.work_order_id : "unknown_work_order",
    };
  } catch {
    return { event_id: "invalid_W5_event", case_id: "unknown_case", work_order_id: "unknown_work_order" };
  }
}

async function rejectInvalidCommand(
  value: unknown,
  error: string,
  ports: W5Ports,
): Promise<WorkflowResult<JsonValue>> {
  const refs = safeInvalidRefs(value);
  const invalid = failure(refs, "invalid_command", error, {
    case: null,
    work_order: null,
    history: cloneHistory(EMPTY_HISTORY),
    current_draft: null,
    authorization_state: "not_checked",
  });
  return appendTransientWorkflowAudit(invalid, createWorkflowEventFingerprint({
    workflow: "W5",
    invalid_command_ref: refs as unknown as JsonValue,
  }), ports);
}

export async function runW5(command: W5Command, ports: W5Ports): Promise<WorkflowResult<JsonValue>> {
  const boundary = validateCommandBoundary(command);
  if (!boundary.valid) {
    return rejectInvalidCommand(command, boundary.error, ports);
  }
  let clonedCommand: unknown;
  try {
    clonedCommand = structuredClone(boundary.command);
  } catch {
    return rejectInvalidCommand(command, "W5 command could not be snapshotted safely", ports);
  }
  const snapshotBoundary = validateCommandBoundary(clonedCommand);
  if (!snapshotBoundary.valid) {
    return rejectInvalidCommand(command, "W5 authoritative command snapshot failed revalidation", ports);
  }
  const validCommand = snapshotBoundary.command;
  const fingerprint = fingerprintW5Command(validCommand);
  try {
    const execution = await ports.repository.runWorkflowEvent(validCommand.event_id, fingerprint, () =>
      ports.repository.runCaseExclusive(validCommand.case_id, () => executeW5(validCommand, fingerprint, ports))
    );
    const audited = await ports.repository.runWorkflowAuditExclusive(validCommand.event_id, () =>
      ensureCachedWorkflowAudit(execution.result, fingerprint, ports)
    );
    return execution.replayed ? replayResult(audited) : structuredClone(audited);
  } catch (error) {
    const snapshot = await loadSnapshot(validCommand, ports).catch(() => ({
      case: null,
      work_order: null,
      history: cloneHistory(EMPTY_HISTORY),
      current_draft: null,
      error_class: "none" as const,
      authorization_state: "not_checked" as const,
    }));
    const conflict = error instanceof WorkflowEventConflictError;
    const failed = failure(
      validCommand,
      conflict ? "event_conflict" : "repository_failure",
      conflict ? error.message : "W5 event repository failed",
      { ...snapshot, authorization_state: "not_checked" },
    );
    return appendTransientWorkflowAudit(failed, fingerprint, ports);
  }
}
