import {
  AI_NODE_ENVELOPE_REQUIRED_FIELDS,
  CANONICAL_SCHEMA_VERSION,
  type AiNodeEnvelope,
  type AuditRecord,
  type JsonValue,
  type StoredRawFeedback,
  type WorkflowResult,
} from "../contracts/model.js";
import type { AiNodeRunRequest, AiNodeRunner, AuditSink, Clock, IdGenerator } from "../contracts/ports.js";
import { validateAiNodeEnvelope } from "../contracts/validation.js";
import { AI_NODE_DEFINITIONS } from "../ai/definitions.js";
import { createAiInputHash } from "../ai/runner.js";
import { validateNodeCandidate, validateNodeRequestDefinition } from "../ai/validation.js";
import { transitionCase } from "../domain/state-machine.js";
import { createWorkflowEventFingerprint } from "./event-idempotency.js";
import type {
  AuthorizedHumanActor,
  FrontHalfCase,
  R3DeliveryTaskReference,
  R3RoutingRuleReference,
  R3SlaTargetReference,
  R3StationReference,
  R3VehicleReference,
  RuntimeWorkOrder,
  SameEventCheck,
  W3AuthorizedPrincipal,
  W3EntityProposal,
  W3FormalEntityDecision,
  W3RoutingCandidate,
  W3RoutingDecision,
  W3RoutingProposal,
} from "./model.js";
import {
  WorkflowEventConflictError,
  type R3CaseReferenceBundle,
  type R3WorkflowRepository,
  type W3AuthorizationGrant,
  type W3AuthorizationGrantClaims,
} from "./repository.js";

export type W3Command =
  | {
      event_id: string;
      workflow: "W3";
      action: "advance";
      case_id: string;
    }
  | {
      event_id: string;
      workflow: "W3";
      action: "resolve_same_event";
      case_id: string;
      actor: AuthorizedHumanActor;
      check_id: string;
      decision: "keep_separate" | "confirmed_duplicate";
      reason: string;
    }
  | {
      event_id: string;
      workflow: "W3";
      action: "confirm_formal_entity";
      case_id: string;
      actor: AuthorizedHumanActor;
      entity_proposal_id: string;
      formal_entity: NonNullable<FrontHalfCase["formal_entity"]>;
    }
  | {
      event_id: string;
      workflow: "W3";
      action: "confirm_routing";
      case_id: string;
      actor: AuthorizedHumanActor;
      routing_proposal_id: string;
      routing_rule_id: string;
      candidate_team: string;
      candidate_logical_role: string;
      sla_rule_version: string;
      first_response_target_minutes: number;
    };

export type W3HumanAction = Exclude<W3Command, { action: "advance" }>["action"];

export type W3AuthorizationTarget =
  | {
      kind: "same_event_resolution";
      check_id: string;
      decision: "keep_separate" | "confirmed_duplicate";
      candidate_case_id: string;
      check_fingerprint: string;
    }
  | {
      kind: "formal_entity_confirmation";
      entity_proposal_id: string;
      formal_entity: NonNullable<FrontHalfCase["formal_entity"]>;
    }
  | {
      kind: "routing_confirmation";
      routing_proposal_id: string;
      routing_rule_id: string;
      candidate_team: string;
      candidate_logical_role: string;
      sla_rule_version: string;
      first_response_target_minutes: number;
    };

export type W3AuthorizationDecision =
  | {
      authorized: true;
      principal: W3AuthorizedPrincipal;
      policy_version: string;
      action: W3HumanAction;
      target: W3AuthorizationTarget;
      command_fingerprint: string;
      grant: W3AuthorizationGrant;
    }
  | {
      authorized: false;
      reason: string;
      policy_version: string;
    };

export interface W3ActionAuthorizer {
  authorize(input: {
    event_id: string;
    actor: AuthorizedHumanActor;
    action: W3HumanAction;
    object_ref: { object_type: "case"; object_id: string };
    target: W3AuthorizationTarget;
    target_fingerprint: string;
    command_fingerprint: string;
  }): Promise<W3AuthorizationDecision>;
}

export interface W3Ports {
  clock: Clock;
  ids: IdGenerator;
  repository: R3WorkflowRepository;
  audit: AuditSink;
  ai_runner: AiNodeRunner;
  action_authorizer: W3ActionAuthorizer;
}

const W3_ACTIONS = ["advance", "resolve_same_event", "confirm_formal_entity", "confirm_routing"] as const;
const W3_HUMAN_ACTIONS = ["resolve_same_event", "confirm_formal_entity", "confirm_routing"] as const;
const MAX_SYNTHETIC_FIRST_RESPONSE_TARGET_MINUTES = 1_440;

function asJson(value: unknown): JsonValue {
  return value as JsonValue;
}

function isObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  return Reflect.ownKeys(value).every((key) => typeof key === "string");
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function hasHumanActorShape(value: unknown): value is AuthorizedHumanActor {
  return isObject(value) &&
    hasOnlyKeys(value, ["type", "actor_id", "role"]) &&
    value.type === "authorized_human" &&
    isNonEmptyString(value.actor_id) &&
    isNonEmptyString(value.role);
}

function hasOnlyKeys(value: Record<string, unknown>, allowedKeys: readonly string[]): boolean {
  if (!isObject(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = [...allowedKeys].sort();
  if (actual.length !== expected.length || !actual.every((key, index) => key === expected[index])) {
    return false;
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  return actual.every((key) => {
    const descriptor = descriptors[key];
    return descriptor !== undefined && descriptor.enumerable && !("get" in descriptor) && !("set" in descriptor);
  });
}

function isHumanAction(action: W3Command["action"]): action is W3HumanAction {
  return W3_HUMAN_ACTIONS.includes(action as W3HumanAction);
}

type W3CommandBoundary =
  | { valid: true; command: W3Command }
  | { valid: false; reason_code: string; error: string };

function invalidBoundary(reasonCode: string, error: string): W3CommandBoundary {
  return { valid: false, reason_code: reasonCode, error };
}

function inspectCommandBoundary(value: unknown): W3CommandBoundary {
  if (!isObject(value)) return invalidBoundary("command_not_object", "W3 command must be an object");
  if (value.workflow !== "W3") return invalidBoundary("workflow_mismatch", "W3 command workflow must equal W3");
  if (!isNonEmptyString(value.event_id) || !isNonEmptyString(value.case_id)) {
    return invalidBoundary("missing_identifier", "W3 event_id and case_id are required");
  }
  if (!W3_ACTIONS.includes(value.action as W3Command["action"])) {
    return invalidBoundary("unknown_action", "W3 action is not implemented");
  }

  const baseKeys = ["event_id", "workflow", "action", "case_id"] as const;
  if (value.action === "advance") {
    if (!hasOnlyKeys(value, baseKeys)) {
      return invalidBoundary("action_field_mismatch", "W3 advance contains action-incompatible fields");
    }
    return {
      valid: true,
      command: {
        event_id: value.event_id,
        workflow: "W3",
        action: "advance",
        case_id: value.case_id,
      },
    };
  }

  if (!hasHumanActorShape(value.actor)) {
    return invalidBoundary("invalid_actor_shape", "W3 human action requires a structurally valid actor claim");
  }

  if (value.action === "resolve_same_event") {
    if (!hasOnlyKeys(value, [...baseKeys, "actor", "check_id", "decision", "reason"])) {
      return invalidBoundary("action_field_mismatch", "W3 resolve_same_event contains action-incompatible fields");
    }
    if (!isNonEmptyString(value.check_id) || !isNonEmptyString(value.reason)) {
      return invalidBoundary("missing_action_field", "W3 resolve_same_event requires check_id and reason");
    }
    if (value.decision !== "keep_separate" && value.decision !== "confirmed_duplicate") {
      return invalidBoundary("invalid_duplicate_decision", "W3 duplicate decision is not implemented");
    }
    return {
      valid: true,
      command: {
        event_id: value.event_id,
        workflow: "W3",
        action: "resolve_same_event",
        case_id: value.case_id,
        actor: { type: "authorized_human", actor_id: value.actor.actor_id, role: value.actor.role },
        check_id: value.check_id,
        decision: value.decision,
        reason: value.reason,
      },
    };
  }

  if (value.action === "confirm_formal_entity") {
    if (!hasOnlyKeys(value, [...baseKeys, "actor", "entity_proposal_id", "formal_entity"])) {
      return invalidBoundary("action_field_mismatch", "W3 confirm_formal_entity contains action-incompatible fields");
    }
    if (
      !isNonEmptyString(value.entity_proposal_id) ||
      !isObject(value.formal_entity) ||
      !hasOnlyKeys(value.formal_entity, ["vehicle_id", "task_id", "station_id"]) ||
      !isNonEmptyString(value.formal_entity.vehicle_id) ||
      !isNonEmptyString(value.formal_entity.task_id) ||
      !isNonEmptyString(value.formal_entity.station_id)
    ) {
      return invalidBoundary("missing_action_field", "W3 formal-entity confirmation is incomplete");
    }
    return {
      valid: true,
      command: {
        event_id: value.event_id,
        workflow: "W3",
        action: "confirm_formal_entity",
        case_id: value.case_id,
        actor: { type: "authorized_human", actor_id: value.actor.actor_id, role: value.actor.role },
        entity_proposal_id: value.entity_proposal_id,
        formal_entity: {
          vehicle_id: value.formal_entity.vehicle_id,
          task_id: value.formal_entity.task_id,
          station_id: value.formal_entity.station_id,
        },
      },
    };
  }

  if (!hasOnlyKeys(value, [
    ...baseKeys,
    "actor",
    "routing_proposal_id",
    "routing_rule_id",
    "candidate_team",
    "candidate_logical_role",
    "sla_rule_version",
    "first_response_target_minutes",
  ])) {
    return invalidBoundary("action_field_mismatch", "W3 confirm_routing contains action-incompatible fields");
  }
  if (
    !isNonEmptyString(value.routing_proposal_id) ||
    !isNonEmptyString(value.routing_rule_id) ||
    !isNonEmptyString(value.candidate_team) ||
    !isNonEmptyString(value.candidate_logical_role) ||
    !isNonEmptyString(value.sla_rule_version) ||
    !Number.isSafeInteger(value.first_response_target_minutes) ||
    (value.first_response_target_minutes as number) <= 0 ||
    (value.first_response_target_minutes as number) > MAX_SYNTHETIC_FIRST_RESPONSE_TARGET_MINUTES
  ) {
    return invalidBoundary("invalid_sla_target", "W3 routing confirmation or synthetic SLA target is invalid");
  }
  return {
    valid: true,
    command: {
      event_id: value.event_id,
      workflow: "W3",
      action: "confirm_routing",
      case_id: value.case_id,
      actor: { type: "authorized_human", actor_id: value.actor.actor_id, role: value.actor.role },
      routing_proposal_id: value.routing_proposal_id,
      routing_rule_id: value.routing_rule_id,
      candidate_team: value.candidate_team,
      candidate_logical_role: value.candidate_logical_role,
      sla_rule_version: value.sla_rule_version,
      first_response_target_minutes: value.first_response_target_minutes as number,
    },
  };
}

function validateCommandBoundary(value: unknown): W3CommandBoundary {
  try {
    return inspectCommandBoundary(value);
  } catch {
    return invalidBoundary(
      "unsafe_object_shape",
      "W3 command object shape could not be safely inspected",
    );
  }
}

interface W3InvalidCommandRefs {
  event_id: string;
  case_id: string;
}

function safeInvalidCommandRefs(value: unknown): W3InvalidCommandRefs {
  const fallback = { event_id: "invalid_w3_event", case_id: "unknown_case" };
  if (typeof value !== "object" || value === null || Array.isArray(value)) return fallback;
  try {
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const ownDataValue = (key: "event_id" | "case_id"): unknown => {
      const descriptor = descriptors[key];
      return descriptor?.enumerable === true && "value" in descriptor ? descriptor.value : undefined;
    };
    const safeSyntheticRef = (candidate: unknown, defaultValue: string): string =>
      isNonEmptyString(candidate) && /^SYN-[A-Za-z0-9._:-]{1,124}$/u.test(candidate)
        ? candidate
        : defaultValue;
    return {
      event_id: safeSyntheticRef(ownDataValue("event_id"), fallback.event_id),
      case_id: safeSyntheticRef(ownDataValue("case_id"), fallback.case_id),
    };
  } catch {
    return fallback;
  }
}

function result(
  command: W3Command,
  status: WorkflowResult["status"],
  actions: string[],
  errors: string[],
  output: Record<string, JsonValue>,
  state?: { previous?: string; next?: string; preserved_sla_started_at?: string },
): WorkflowResult<JsonValue> {
  return {
    workflow: "W3",
    event_id: command.event_id,
    status,
    object_ref: { object_type: "case", object_id: command.case_id },
    ...(state?.previous === undefined ? {} : { previous_state: state.previous }),
    ...(state?.next === undefined ? {} : { next_state: state.next }),
    ...(state?.preserved_sla_started_at === undefined
      ? {}
      : { preserved_sla_started_at: state.preserved_sla_started_at }),
    actions,
    errors,
    output,
  };
}

function failure(
  command: W3Command,
  errorClass: string,
  message: string,
  actions: string[] = ["preserve_existing_state", "stop_W3", "do_not_create_work_order"],
): WorkflowResult<JsonValue> {
  return result(command, "failed", actions, [message], {
    error_class: errorClass,
    human_takeover_required: true,
  });
}

type W3AuthorizationState = "authorized" | "denied" | "indeterminate";

interface W3GrantedAuthorization {
  principal: W3AuthorizedPrincipal;
  policy_version: string;
  action: W3HumanAction;
  target: W3AuthorizationTarget;
  command_fingerprint: string;
  grant: W3AuthorizationGrant;
}

type W3AuthorizationOutcome =
  | { granted: true; authorization: W3GrantedAuthorization | null }
  | { granted: false; result: WorkflowResult<JsonValue> };

function authorizationTarget(
  command: Exclude<W3Command, { action: "advance" }>,
  sameEventCheck: SameEventCheck | null = null,
): W3AuthorizationTarget {
  if (command.action === "resolve_same_event") {
    return {
      kind: "same_event_resolution",
      check_id: command.check_id,
      decision: command.decision,
      candidate_case_id: sameEventCheck?.candidate?.candidate_case_id ?? "unverified_same_event_candidate",
      check_fingerprint: sameEventCheck === null
        ? "unverified_same_event_check"
        : createWorkflowEventFingerprint(asJson(sameEventCheck)),
    };
  }
  if (command.action === "confirm_formal_entity") {
    return {
      kind: "formal_entity_confirmation",
      entity_proposal_id: command.entity_proposal_id,
      formal_entity: { ...command.formal_entity },
    };
  }
  return {
    kind: "routing_confirmation",
    routing_proposal_id: command.routing_proposal_id,
    routing_rule_id: command.routing_rule_id,
    candidate_team: command.candidate_team,
    candidate_logical_role: command.candidate_logical_role,
    sla_rule_version: command.sla_rule_version,
    first_response_target_minutes: command.first_response_target_minutes,
  };
}

function hasTrustedPrincipalShape(value: unknown): value is W3AuthorizedPrincipal {
  return isObject(value) &&
    hasOnlyKeys(value, ["principal_id", "principal_type", "canonical_role", "authority_source"]) &&
    isNonEmptyString(value.principal_id) &&
    value.principal_type === "synthetic_human" &&
    isNonEmptyString(value.canonical_role) &&
    value.authority_source === "synthetic_allowlist";
}

function sameCanonicalValue(left: unknown, right: unknown): boolean {
  return createWorkflowEventFingerprint(asJson(left)) === createWorkflowEventFingerprint(asJson(right));
}

function withActionAuthorization(
  workflowResult: WorkflowResult<JsonValue>,
  command: Exclude<W3Command, { action: "advance" }>,
  state: W3AuthorizationState,
  authorization: W3GrantedAuthorization | null = null,
  policyVersion: string | null = null,
): WorkflowResult<JsonValue> {
  const output = isObject(workflowResult.output) ? workflowResult.output : {};
  return {
    ...workflowResult,
    output: {
      ...output,
      action_authorization: {
        action: command.action,
        object_ref: { ...workflowResult.object_ref },
        target: authorization?.target ?? authorizationTarget(command),
        state,
        authorized: state === "authorized",
        principal: authorization ? { ...authorization.principal } : null,
        policy_version: authorization?.policy_version ?? policyVersion,
        command_fingerprint: authorization?.command_fingerprint ?? null,
      },
    },
  };
}

function invalidCommandResult(
  refs: W3InvalidCommandRefs,
  reasonCode: string,
  message: string,
  securityAuditState: "recorded" | "failed",
): WorkflowResult<JsonValue> {
  return {
    workflow: "W3",
    event_id: refs.event_id,
    status: "failed",
    object_ref: { object_type: "case", object_id: refs.case_id },
    actions: [
      "reject_invalid_command",
      "do_not_access_event_repository",
      "do_not_authorize",
      "do_not_run_AI",
      "do_not_write_domain_records",
    ],
    errors: [message],
    output: {
      error_class: "invalid_command",
      reason_code: reasonCode,
      human_takeover_required: true,
      security_audit_state: securityAuditState,
      validation: { valid: false, errors: [reasonCode] },
    },
  };
}

async function appendInvalidCommandSecurityAudit(
  refs: W3InvalidCommandRefs,
  reasonCode: string,
  ports: W3Ports,
): Promise<"recorded" | "failed"> {
  try {
    const record: AuditRecord = {
      audit_id: ports.ids.nextId("security-audit"),
      object_ref: { object_type: "case", object_id: refs.case_id },
      category: "security",
      occurred_at: ports.clock.now().toISOString(),
      clock_source: ports.clock.source,
      payload: {
        workflow: "W3",
        error_class: "invalid_command",
        reason_code: reasonCode,
        event_ref: refs.event_id,
        case_ref: refs.case_id,
        raw_payload_recorded: false,
      },
    };
    await ports.audit.append(record);
    return "recorded";
  } catch {
    return "failed";
  }
}

async function authorizeHumanCommand(
  command: W3Command,
  ports: W3Ports,
): Promise<W3AuthorizationOutcome> {
  if (!isHumanAction(command.action)) return { granted: true, authorization: null };
  const humanCommand = command as Exclude<W3Command, { action: "advance" }>;
  let sameEventCheck: SameEventCheck | null = null;
  if (humanCommand.action === "resolve_same_event") {
    try {
      sameEventCheck = await ports.repository.findSameEventCheckByCaseId(humanCommand.case_id);
    } catch {
      sameEventCheck = null;
    }
    if (
      sameEventCheck === null ||
      sameEventCheck.check_id !== humanCommand.check_id ||
      sameEventCheck.case_id !== humanCommand.case_id ||
      sameEventCheck.candidate === null ||
      sameEventCheck.review_state !== "pending" ||
      sameEventCheck.node_status !== "ok" ||
      validateSameEventBoundary(sameEventCheck) !== null ||
      ports.repository.hasVerifiedW3Artifact(humanCommand.case_id, "same_event_check") !== true
    ) {
      return {
        granted: false,
        result: withActionAuthorization(
          failure(
            humanCommand,
            "invariant_violation",
            "W3 duplicate authorization requires an immutable verified W6 same-event check",
          ),
          humanCommand,
          "indeterminate",
        ),
      };
    }
  }
  const target = authorizationTarget(humanCommand, sameEventCheck);
  const targetFingerprint = createWorkflowEventFingerprint(asJson(target));
  const commandFingerprint = createWorkflowEventFingerprint(asJson({ workflow: "W3", command: humanCommand }));
  let decision: unknown;
  try {
    decision = await ports.action_authorizer.authorize({
      event_id: humanCommand.event_id,
      actor: humanCommand.actor,
      action: humanCommand.action,
      object_ref: { object_type: "case", object_id: humanCommand.case_id },
      target,
      target_fingerprint: targetFingerprint,
      command_fingerprint: commandFingerprint,
    });
  } catch {
    return {
      granted: false,
      result: withActionAuthorization(
        failure(
          humanCommand,
          "authorization_port_failure",
          "W3 authorization could not be established",
        ),
        humanCommand,
        "indeterminate",
      ),
    };
  }
  if (
    isObject(decision) &&
    decision.authorized === true &&
    hasOnlyKeys(decision, [
      "authorized",
      "principal",
      "policy_version",
      "action",
      "target",
      "command_fingerprint",
      "grant",
    ]) &&
    hasTrustedPrincipalShape(decision.principal) &&
    isNonEmptyString(decision.policy_version) &&
    decision.action === humanCommand.action &&
    sameCanonicalValue(decision.target, target) &&
    decision.command_fingerprint === commandFingerprint &&
    isObject(decision.grant)
  ) {
    return {
      granted: true,
      authorization: {
        principal: { ...decision.principal },
        policy_version: decision.policy_version,
        action: humanCommand.action,
        target: structuredClone(target),
        command_fingerprint: commandFingerprint,
        grant: decision.grant as W3AuthorizationGrant,
      },
    };
  }
  if (
    isObject(decision) &&
    decision.authorized === false &&
    hasOnlyKeys(decision, ["authorized", "reason", "policy_version"]) &&
    isNonEmptyString(decision.reason) &&
    isNonEmptyString(decision.policy_version)
  ) {
    return {
      granted: false,
      result: withActionAuthorization(
        failure(
          humanCommand,
          "authorization_failure",
          "W3 actor or action target is not allowlisted",
        ),
        humanCommand,
        "denied",
        null,
        decision.policy_version,
      ),
    };
  }
  return {
    granted: false,
    result: withActionAuthorization(
      failure(
        humanCommand,
        "authorization_port_failure",
        "W3 authorization port returned an invalid decision",
      ),
      humanCommand,
      "indeterminate",
    ),
  };
}

function needsHuman(
  command: W3Command,
  gate: string,
  actions: string[],
  errors: string[],
  extra: Record<string, JsonValue> = {},
): WorkflowResult<JsonValue> {
  return result(command, "needs_human", actions, errors, {
    gate,
    human_takeover_required: true,
    ...extra,
  });
}

function validateSameEventBoundary(check: SameEventCheck): string | null {
  if (!isNonEmptyString(check.check_id) || !isNonEmptyString(check.case_id)) {
    return "W6 same-event check identifiers are invalid";
  }
  if (check.mode !== "same_event_duplicate" || check.automatic_merge !== false || check.automatic_relink !== false) {
    return "W6 same-event check contains a prohibited mode or automatic action";
  }
  if (check.candidate === null && check.review_state !== "not_required" && check.node_status === "ok") {
    return "W6 same-event check without a candidate must be not_required";
  }
  if (check.candidate !== null && check.review_state !== "pending") {
    return "W6 duplicate candidate must remain pending until a persisted human decision";
  }
  return null;
}

function validateSyntheticCaseAndFeedback(
  caseRecord: FrontHalfCase,
  feedback: StoredRawFeedback,
): string | null {
  if (
    caseRecord.schema_version !== CANONICAL_SCHEMA_VERSION ||
    caseRecord.data_scope !== "synthetic_experiment" ||
    caseRecord.evidence_class !== "synthetic_experiment" ||
    caseRecord.source_kind !== "scenario_runtime" ||
    caseRecord.record_mode !== "scenario_runtime" ||
    caseRecord.source_name !== "synthetic_experiment" ||
    caseRecord.legacy_id !== "not_applicable_scenario_runtime"
  ) {
    return "case is outside the W3 synthetic scenario-runtime boundary";
  }
  const request = feedback.request;
  if (
    request.schema_version !== CANONICAL_SCHEMA_VERSION ||
    request.data_scope !== "synthetic_experiment" ||
    request.evidence_class !== "synthetic_experiment" ||
    request.source_tenant_scope !== "competition-synthetic" ||
    request.authorization_scope !== "synthetic_demo_only" ||
    feedback.idempotency_key !== request.idempotency_key ||
    caseRecord.source_sha256 !== feedback.content_fingerprint ||
    caseRecord.source_locator !== (request.source_record_id ?? feedback.feedback_id)
  ) {
    return "raw feedback is outside or inconsistent with the W3 synthetic boundary";
  }
  return null;
}

function hasSyntheticEntityReferenceBoundary(
  record: R3VehicleReference | R3DeliveryTaskReference | R3StationReference,
): boolean {
  return record.data_scope === "synthetic_experiment" &&
    record.evidence_class === "synthetic_experiment" &&
    record.source_kind === "scenario_runtime" &&
    isNonEmptyString(record.source_ref) &&
    isNonEmptyString(record.evidence_text);
}

function sameStringSet(left: string[], right: string[]): boolean {
  return sameCanonicalValue([...new Set(left)].sort(), [...new Set(right)].sort());
}

function validateSyntheticReferenceBundle(
  bundle: R3CaseReferenceBundle,
  caseRecord: FrontHalfCase,
  feedback: StoredRawFeedback,
): string | null {
  if (
    !sameCanonicalValue(bundle.case_record, caseRecord) ||
    bundle.raw_feedback.feedback_id !== feedback.feedback_id ||
    bundle.raw_feedback.content_fingerprint !== feedback.content_fingerprint
  ) {
    return "R3 reference bundle is bound to a different case or feedback snapshot";
  }
  if (
    !bundle.vehicles.every(hasSyntheticEntityReferenceBoundary) ||
    !bundle.delivery_tasks.every(hasSyntheticEntityReferenceBoundary) ||
    !bundle.stations.every(hasSyntheticEntityReferenceBoundary)
  ) {
    return "R3 entity reference provenance is outside the synthetic boundary";
  }
  if (
    !sameStringSet(bundle.vehicles.map((record) => record.vehicle_id), caseRecord.entity_candidates.vehicle_ids) ||
    !sameStringSet(bundle.delivery_tasks.map((record) => record.task_id), caseRecord.entity_candidates.task_ids) ||
    !sameStringSet(bundle.stations.map((record) => record.station_id), caseRecord.entity_candidates.station_names)
  ) {
    return "R3 entity reference IDs do not match the case candidates";
  }
  const vehicleIds = new Set(bundle.vehicles.map((record) => record.vehicle_id));
  const stationIds = new Set(bundle.stations.map((record) => record.station_id));
  if (
    bundle.vehicles.some((record) => !stationIds.has(record.station_id) || record.controls_available !== false) ||
    bundle.delivery_tasks.some((record) =>
      !vehicleIds.has(record.vehicle_id) ||
      !stationIds.has(record.station_id) ||
      record.state_mutable_by_neoloop !== false
    )
  ) {
    return "R3 vehicle, task, and station references are relationally inconsistent";
  }
  return null;
}

function validateSyntheticRoutingRules(
  rules: R3RoutingRuleReference[],
  caseRecord: FrontHalfCase,
): string | null {
  const stationId = caseRecord.formal_entity?.station_id;
  const ids = rules.map((rule) => rule.routing_rule_id);
  if (new Set(ids).size !== ids.length) return "routing references contain duplicate rule IDs";
  if (rules.some((rule) =>
    rule.data_scope !== "synthetic_experiment" ||
    rule.evidence_class !== "enterprise_pending" ||
    rule.source_kind !== "registration_workbook" ||
    rule.status !== "待企业验证" ||
    rule.station_id !== stationId ||
    rule.issue_type !== caseRecord.category_detail ||
    !isNonEmptyString(rule.source_ref) ||
    !isNonEmptyString(rule.evidence_text)
  )) {
    return "routing references are outside the synthetic enterprise-pending boundary";
  }
  return null;
}

function validateSyntheticSlaPolicy(policy: R3SlaTargetReference): string | null {
  if (
    policy.data_scope !== "synthetic_experiment" ||
    policy.evidence_class !== "enterprise_pending" ||
    policy.source_kind !== "registration_workbook" ||
    policy.status !== "待企业验证" ||
    !isNonEmptyString(policy.policy_id) ||
    !isNonEmptyString(policy.policy_version) ||
    !isNonEmptyString(policy.source_ref) ||
    !isNonEmptyString(policy.evidence_text) ||
    !Number.isSafeInteger(policy.first_response_target_minutes) ||
    policy.first_response_target_minutes <= 0 ||
    policy.first_response_target_minutes > MAX_SYNTHETIC_FIRST_RESPONSE_TARGET_MINUTES
  ) {
    return "SLA policy is outside the bounded synthetic enterprise-pending policy set";
  }
  return null;
}

async function enforceFrontHalfPreconditions(
  command: W3Command,
  ports: W3Ports,
): Promise<
  | { ready: true; case_record: FrontHalfCase; feedback: StoredRawFeedback; check: SameEventCheck }
  | { ready: false; result: WorkflowResult<JsonValue> }
> {
  const caseRecord = await ports.repository.findCaseById(command.case_id);
  if (!caseRecord) {
    return { ready: false, result: failure(command, "not_found", `Case ${command.case_id} does not exist`) };
  }
  const feedback = await ports.repository.findRawFeedbackByCaseId(command.case_id);
  if (!feedback || feedback.processing_status !== "已建案") {
    return {
      ready: false,
      result: failure(command, "front_half_incomplete", "W1 and W2 must complete before W3"),
    };
  }
  const syntheticBoundaryError = validateSyntheticCaseAndFeedback(caseRecord, feedback);
  if (syntheticBoundaryError) {
    return {
      ready: false,
      result: failure(command, "synthetic_boundary_violation", syntheticBoundaryError),
    };
  }
  const check = await ports.repository.findSameEventCheckByCaseId(command.case_id);
  if (!check) {
    return {
      ready: false,
      result: needsHuman(
        command,
        "same_event_check",
        ["await_W6_same_event_check", "do_not_run_N4", "do_not_create_work_order"],
        ["W6 same-event check is missing"],
      ),
    };
  }
  const boundaryError = validateSameEventBoundary(check);
  if (boundaryError) {
    return { ready: false, result: failure(command, "contract_violation", boundaryError) };
  }
  if (ports.repository.hasVerifiedW3Artifact(command.case_id, "same_event_check") !== true) {
    return {
      ready: false,
      result: failure(
        command,
        "invariant_violation",
        "W6 same-event check lacks a verified immutable repository commit receipt",
      ),
    };
  }
  if (check.node_status !== "ok") {
    return {
      ready: false,
      result: needsHuman(
        command,
        "same_event_check",
        ["preserve_case_state", "await_W6_human_takeover", "do_not_run_N4", "do_not_create_work_order"],
        [`W6 same-event node stopped with status ${check.node_status}`],
      ),
    };
  }
  if (check.case_id !== command.case_id) {
    return {
      ready: false,
      result: failure(command, "synthetic_boundary_violation", "same-event check is bound to another case"),
    };
  }
  return { ready: true, case_record: caseRecord, feedback, check };
}

async function enforceDuplicateDecision(
  command: W3Command,
  check: SameEventCheck,
  ports: W3Ports,
): Promise<WorkflowResult<JsonValue> | null> {
  if (check.candidate === null) return null;
  const resolution = await ports.repository.findSameEventResolutionByCaseId(command.case_id);
  if (!resolution) {
    return needsHuman(
      command,
      "same_event_duplicate_resolution",
      ["await_authorized_human_duplicate_decision", "do_not_run_N4", "do_not_merge", "do_not_relink"],
      [],
      { check: asJson(check) },
    );
  }
  if (resolution.check_id !== check.check_id) {
    return failure(command, "contract_violation", "same-event human decision references a stale check");
  }
  if (ports.repository.hasVerifiedW3Artifact(command.case_id, "same_event_resolution") !== true) {
    return failure(command, "invariant_violation", "same-event human decision lacks a verified repository commit receipt");
  }
  if (
    resolution.case_id !== command.case_id ||
    !isNonEmptyString(resolution.resolution_id) ||
    !isNonEmptyString(resolution.event_id) ||
    !isNonEmptyString(resolution.authorization_policy_version) ||
    !isNonEmptyString(resolution.decided_at) ||
    !hasTrustedPrincipalShape(resolution.principal)
  ) {
    return failure(command, "invariant_violation", "same-event human decision lacks trusted authorization evidence");
  }
  if (resolution.decision === "confirmed_duplicate") {
    return needsHuman(
      command,
      "confirmed_duplicate_follow_up",
      ["stop_W3", "do_not_run_N4", "do_not_create_work_order", "do_not_auto_merge", "do_not_auto_relink"],
      ["A human confirmed the duplicate candidate; merge handling is outside R3"],
      { resolution: asJson(resolution) },
    );
  }
  if (resolution.decision !== "keep_separate") {
    return failure(command, "invariant_violation", "same-event human decision is outside the closed decision set");
  }
  return null;
}

type FormalEntityDecisionBoundary =
  | {
      valid: true;
      decision: W3FormalEntityDecision;
      proposal: W3EntityProposal;
    }
  | { valid: false; result: WorkflowResult<JsonValue> };

async function enforceFormalEntityDecision(
  command: W3Command,
  caseRecord: FrontHalfCase,
  ports: W3Ports,
): Promise<FormalEntityDecisionBoundary> {
  const decision = await ports.repository.findFormalEntityDecisionByCaseId(command.case_id);
  const proposal = await ports.repository.findEntityProposalByCaseId(command.case_id);
  const proposalVerified = ports.repository.hasVerifiedW3Artifact(command.case_id, "entity_proposal") === true;
  const decisionVerified = ports.repository.hasVerifiedW3Artifact(command.case_id, "formal_entity_decision") === true;
  const formalEntity = caseRecord.formal_entity;
  const selected = formalEntity === null || proposal === null
    ? []
    : [
        ["vehicle", formalEntity.vehicle_id],
        ["delivery_task", formalEntity.task_id],
        ["station", formalEntity.station_id],
      ] as const;
  const valid =
    decision !== null &&
    proposal !== null &&
    proposalVerified &&
    decisionVerified &&
    formalEntity !== null &&
    caseRecord.formal_entity_confirmation_status === "已人工确认" &&
    ["awaiting_responsibility_routing", "awaiting_routing_confirmation", "dispatched"].includes(
      caseRecord.workflow_readiness,
    ) &&
    decision.action === "confirm_formal_entity" &&
    decision.authorization_state === "authorized" &&
    decision.case_id === command.case_id &&
    isNonEmptyString(decision.decision_id) &&
    decision.decision_fingerprint === decisionFingerprint({
      action: "confirm_formal_entity",
      case_id: decision.case_id,
      authorization_policy_version: decision.authorization_policy_version,
      principal: asJson(decision.principal),
      proposal_ref: asJson(decision.proposal_ref),
      formal_entity: asJson(decision.formal_entity),
    }) &&
    isNonEmptyString(decision.event_id) &&
    isNonEmptyString(decision.authorization_policy_version) &&
    Number.isFinite(Date.parse(decision.decided_at)) &&
    hasTrustedPrincipalShape(decision.principal) &&
    decision.proposal_ref.proposal_type === "entity_proposal" &&
    decision.proposal_ref.proposal_id === proposal.proposal_id &&
    decision.proposal_ref.node_run_id === proposal.node_run_id &&
    decision.proposal_ref.input_hash === proposal.input_hash &&
    proposal.case_id === command.case_id &&
    proposal.node_version === AI_NODE_DEFINITIONS.N4.version &&
    /^[a-f0-9]{64}$/iu.test(proposal.input_hash) &&
    sameCanonicalValue(decision.formal_entity, formalEntity) &&
    sameCanonicalValue(decision.evidence_spans, proposal.evidence_spans) &&
    selected.every(([objectType, objectId]) =>
      proposal.candidates.some((candidate) =>
        candidate.object_type === objectType && candidate.object_id === objectId
      )
    );
  if (!valid || !decision || !proposal) {
    return {
      valid: false,
      result: failure(
        command,
        "invariant_violation",
        "formal entity flags are not backed by a matching persisted authorized human decision",
        ["preserve_case_state", "stop_W3", "do_not_run_N6", "do_not_create_work_order"],
      ),
    };
  }
  return { valid: true, decision, proposal };
}

function entityPayload(envelope: AiNodeEnvelope<JsonValue>): W3EntityProposal["candidates"] | null {
  if (!isObject(envelope.payload) || envelope.payload.human_confirmation_required !== true) return null;
  const candidates = envelope.payload.candidate_objects;
  if (!Array.isArray(candidates) || candidates.length !== 3) return null;
  const parsed: W3EntityProposal["candidates"] = [];
  for (const candidate of candidates) {
    if (
      !isObject(candidate) ||
      !["vehicle", "delivery_task", "station"].includes(candidate.object_type as string) ||
      !isNonEmptyString(candidate.object_id) ||
      !Array.isArray(candidate.evidence_span_indices) ||
      candidate.evidence_span_indices.length === 0 ||
      !candidate.evidence_span_indices.every(Number.isInteger)
    ) {
      return null;
    }
    parsed.push({
      object_type: candidate.object_type as W3EntityProposal["candidates"][number]["object_type"],
      object_id: candidate.object_id,
      evidence_span_indices: [...candidate.evidence_span_indices] as number[],
    });
  }
  if (new Set(parsed.map((candidate) => candidate.object_type)).size !== 3) return null;
  return parsed;
}

function routingPayload(envelope: AiNodeEnvelope<JsonValue>): W3RoutingCandidate[] | null {
  if (!isObject(envelope.payload) || envelope.payload.human_confirmation_required !== true) return null;
  if (!Array.isArray(envelope.payload.candidates) || envelope.payload.candidates.length === 0) return null;
  const parsed: W3RoutingCandidate[] = [];
  for (const candidate of envelope.payload.candidates) {
    if (
      !isObject(candidate) ||
      !isNonEmptyString(candidate.routing_rule_id) ||
      !isNonEmptyString(candidate.rule_version) ||
      !isNonEmptyString(candidate.candidate_team) ||
      !isNonEmptyString(candidate.candidate_logical_role) ||
      !isNonEmptyString(candidate.sla_rule_version) ||
      !Array.isArray(candidate.supporting_evidence_indices) ||
      candidate.supporting_evidence_indices.length === 0 ||
      !candidate.supporting_evidence_indices.every(Number.isInteger) ||
      !Array.isArray(candidate.counter_evidence_indices) ||
      candidate.counter_evidence_indices.length === 0 ||
      !candidate.counter_evidence_indices.every(Number.isInteger) ||
      !Array.isArray(candidate.uncertainties) ||
      candidate.uncertainties.length === 0 ||
      !candidate.uncertainties.every(isNonEmptyString)
    ) {
      return null;
    }
    parsed.push({
      routing_rule_id: candidate.routing_rule_id,
      rule_version: candidate.rule_version,
      candidate_team: candidate.candidate_team,
      candidate_logical_role: candidate.candidate_logical_role,
      sla_rule_version: candidate.sla_rule_version,
      supporting_evidence_indices: [...candidate.supporting_evidence_indices] as number[],
      counter_evidence_indices: [...candidate.counter_evidence_indices] as number[],
      uncertainties: [...candidate.uncertainties] as string[],
    });
  }
  return parsed;
}

function n4Input(bundle: R3CaseReferenceBundle): JsonValue {
  return {
    case_facts: {
      source_ref: bundle.case_record.source_locator,
      facts: [bundle.case_record.summary],
    },
    vehicle_candidates: bundle.vehicles.map((record) => ({
      vehicle_id: record.vehicle_id,
      station_id: record.station_id,
      source_ref: record.source_ref,
      evidence_text: record.evidence_text,
    })),
    task_candidates: bundle.delivery_tasks.map((record) => ({
      task_id: record.task_id,
      vehicle_id: record.vehicle_id,
      station_id: record.station_id,
      source_ref: record.source_ref,
      evidence_text: record.evidence_text,
    })),
    site_candidates: bundle.stations.map((record) => ({
      station_id: record.station_id,
      source_ref: record.source_ref,
      evidence_text: record.evidence_text,
    })),
  };
}

type BoundAiEnvelopeResult =
  | { valid: true; envelope: AiNodeEnvelope<JsonValue> }
  | { valid: false; errors: string[] };

function validateBoundAiEnvelope(
  request: AiNodeRunRequest<JsonValue>,
  value: unknown,
): BoundAiEnvelopeResult {
  const errors: string[] = [];
  const requestValidation = validateNodeRequestDefinition(request);
  if (!requestValidation.valid) errors.push(...requestValidation.errors);

  const envelopeValidation = validateAiNodeEnvelope(value);
  if (!envelopeValidation.valid) {
    return { valid: false, errors: [...errors, ...envelopeValidation.errors] };
  }
  if (!isObject(value) || !hasOnlyKeys(value, AI_NODE_ENVELOPE_REQUIRED_FIELDS)) {
    errors.push("envelope must contain exactly the authoritative 14 fields");
  }
  const envelope = envelopeValidation.value;
  if (envelope.node !== request.node) errors.push("envelope.node is not bound to this invocation");
  if (envelope.mode !== request.mode) errors.push("envelope.mode is not bound to this invocation");
  if (envelope.version !== request.version) errors.push("envelope.version is not bound to this invocation");
  if (!sameCanonicalValue(envelope.object_ref, request.object_ref)) {
    errors.push("envelope.object_ref is not bound to this invocation");
  }
  if (envelope.input_hash !== createAiInputHash(request)) {
    errors.push("envelope.input_hash is not bound to this invocation");
  }

  const candidateValidation = validateNodeCandidate(request, {
    payload: envelope.payload,
    evidence_spans: envelope.evidence_spans,
    missing_fields: envelope.missing_fields,
    confidence: envelope.confidence,
    status: envelope.status,
  });
  if (!candidateValidation.valid) errors.push(...candidateValidation.errors);
  return errors.length === 0
    ? { valid: true, envelope }
    : { valid: false, errors };
}

function aiBindingFailure(
  command: W3Command,
  node: "N4" | "N6",
  errors: string[],
): WorkflowResult<JsonValue> {
  return failure(
    command,
    "ai_binding_error",
    `${node} output was not bound to the exact validated request: ${errors.join("; ")}`,
    [
      "preserve_case_state",
      `reject_unbound_${node}_output`,
      "do_not_persist_AI_candidate",
      "do_not_create_work_order",
    ],
  );
}

async function runN4(
  command: W3Command,
  caseRecord: FrontHalfCase,
  feedback: StoredRawFeedback,
  ports: W3Ports,
): Promise<WorkflowResult<JsonValue>> {
  const existing = await ports.repository.findEntityProposalByCaseId(command.case_id);
  if (existing) {
    if (ports.repository.hasVerifiedW3Artifact(command.case_id, "entity_proposal") !== true) {
      return failure(command, "invariant_violation", "persisted N4 proposal lacks a verified repository commit receipt");
    }
    if (
      caseRecord.status !== "待关联" ||
      caseRecord.formal_entity !== null ||
      caseRecord.formal_entity_confirmation_status !== "待人工确认" ||
      caseRecord.workflow_readiness !== "awaiting_formal_entity_confirmation"
    ) {
      return failure(command, "invariant_violation", "persisted N4 proposal is not aligned with the formal-entity gate");
    }
    return needsHuman(
      command,
      "formal_entity_confirmation",
      ["return_existing_N4_candidate", "await_authorized_human_entity_confirmation", "do_not_run_N6"],
      [],
      { entity_proposal: asJson(existing), effect_state: "existing" },
    );
  }
  const bundle = await ports.repository.findR3ReferenceDataForCase(command.case_id);
  if (!bundle) return failure(command, "repository_error", "R3 case reference bundle is unavailable");
  const bundleBoundaryError = validateSyntheticReferenceBundle(bundle, caseRecord, feedback);
  if (bundleBoundaryError) {
    return failure(command, "synthetic_boundary_violation", bundleBoundaryError);
  }

  const request: AiNodeRunRequest<JsonValue> = {
    node: AI_NODE_DEFINITIONS.N4.node,
    mode: AI_NODE_DEFINITIONS.N4.mode,
    version: AI_NODE_DEFINITIONS.N4.version,
    object_ref: { object_type: "case", object_id: command.case_id },
    input: n4Input(bundle),
  };
  const requestValidation = validateNodeRequestDefinition(request);
  if (!requestValidation.valid) return aiBindingFailure(command, "N4", requestValidation.errors);

  let rawEnvelope: unknown;
  try {
    rawEnvelope = await ports.ai_runner.run<JsonValue, JsonValue>(structuredClone(request));
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown N4 runner error";
    return needsHuman(
      command,
      "formal_entity_confirmation",
      ["preserve_case_state", "stop_N4", "do_not_write_formal_entity", "do_not_run_N6"],
      [`N4 infrastructure error: ${message}`],
      { error_class: "ai_runner_error" },
    );
  }

  const binding = validateBoundAiEnvelope(request, rawEnvelope);
  if (!binding.valid) return aiBindingFailure(command, "N4", binding.errors);
  const envelope = binding.envelope;

  if (envelope.status !== "ok" || !envelope.validation.valid || envelope.payload === null) {
    if (envelope.status === "needs_human" && envelope.missing_fields.length > 0) {
      transitionCase(caseRecord.status, "待补充", "workflow");
      const update = await ports.repository.markCaseNeedsSupplement(
        command.case_id,
        envelope.missing_fields,
        ports.clock.now().toISOString(),
      );
      return needsHuman(
        command,
        "formal_entity_confirmation",
        ["preserve_N4_missing_fields", "move_case_to_待补充", "do_not_write_formal_entity", "do_not_run_N6"],
        [`N4 stopped with status ${envelope.status}`],
        {
          case: asJson(update.record),
          error_class: "missing_entity_evidence",
          effect_state: update.updated ? "committed" : "existing",
        },
      );
    }
    return needsHuman(
      command,
      "formal_entity_confirmation",
      ["preserve_case_state", "stop_N4", "do_not_write_formal_entity", "do_not_run_N6"],
      [`N4 stopped with status ${envelope.status}`],
      { error_class: `ai_${envelope.status}` },
    );
  }
  const candidates = entityPayload(envelope);
  if (!candidates) {
    return failure(command, "ai_boundary_error", "N4 returned an invalid candidate boundary");
  }
  const proposal: W3EntityProposal = {
    proposal_id: ports.ids.nextId("entity-proposal"),
    case_id: command.case_id,
    node_run_id: envelope.run_id,
    node_version: envelope.version,
    input_hash: envelope.input_hash,
    candidates,
    evidence_spans: envelope.evidence_spans.map((span) => ({ ...span })),
    created_at: ports.clock.now().toISOString(),
  };
  const saved = await ports.repository.saveEntityProposalIfAbsent(proposal);
  return needsHuman(
    command,
    "formal_entity_confirmation",
    [
      saved.created ? "store_N4_candidate" : "return_existing_N4_candidate",
      "await_authorized_human_entity_confirmation",
      "do_not_write_formal_entity",
      "do_not_run_N6",
      "do_not_control_vehicle",
    ],
    [],
    {
      entity_proposal: asJson(saved.record),
      effect_state: saved.created ? "committed" : "existing",
    },
  );
}

async function runN6(
  command: W3Command,
  caseRecord: FrontHalfCase,
  ports: W3Ports,
): Promise<WorkflowResult<JsonValue>> {
  if (caseRecord.formal_entity === null || caseRecord.formal_entity_confirmation_status !== "已人工确认") {
    return needsHuman(
      command,
      "formal_entity_confirmation",
      ["await_authorized_human_entity_confirmation", "do_not_run_N6", "do_not_create_work_order"],
      [],
    );
  }
  const formalDecisionBoundary = await enforceFormalEntityDecision(command, caseRecord, ports);
  if (!formalDecisionBoundary.valid) return formalDecisionBoundary.result;
  const existing = await ports.repository.findRoutingProposalByCaseId(command.case_id);
  if (existing) {
    if (ports.repository.hasVerifiedW3Artifact(command.case_id, "routing_proposal") !== true) {
      return failure(command, "invariant_violation", "persisted N6 proposal lacks a verified repository commit receipt");
    }
    if (caseRecord.workflow_readiness !== "awaiting_routing_confirmation") {
      return failure(command, "invariant_violation", "persisted routing proposal is not aligned with the case routing gate");
    }
    return needsHuman(
      command,
      "responsibility_routing_confirmation",
      ["return_existing_N6_candidate", "await_authorized_human_routing_confirmation", "do_not_create_work_order"],
      [],
      { routing_proposal: asJson(existing), effect_state: "existing" },
    );
  }
  if (caseRecord.workflow_readiness !== "awaiting_responsibility_routing") {
    return failure(command, "human_gate_error", "case is not ready to run responsibility routing");
  }
  const rules = await ports.repository.findRoutingRulesForEntity(
    caseRecord.formal_entity.station_id,
    caseRecord.category_detail,
  );
  if (rules.length === 0) {
    return needsHuman(
      command,
      "responsibility_routing_confirmation",
      ["preserve_case_state", "route_matrix_gap_to_human", "do_not_create_work_order"],
      ["No frozen routing-matrix candidate matches the confirmed station and issue type"],
      { error_class: "routing_matrix_gap" },
    );
  }
  const rulesBoundaryError = validateSyntheticRoutingRules(rules, caseRecord);
  if (rulesBoundaryError) {
    return failure(command, "synthetic_boundary_violation", rulesBoundaryError);
  }
  const evidence = [
    {
      source_ref: `case:${caseRecord.case_id}`,
      text: `${caseRecord.formal_entity.station_id}|${caseRecord.category_detail}|${caseRecord.formal_entity.vehicle_id}|${caseRecord.formal_entity.task_id}`,
    },
    ...rules.map((rule) => ({ source_ref: rule.source_ref, text: rule.evidence_text })),
  ];
  const request: AiNodeRunRequest<JsonValue> = {
    node: AI_NODE_DEFINITIONS.N6_RESPONSIBILITY_ROUTING.node,
    mode: AI_NODE_DEFINITIONS.N6_RESPONSIBILITY_ROUTING.mode,
    version: AI_NODE_DEFINITIONS.N6_RESPONSIBILITY_ROUTING.version,
    object_ref: { object_type: "case", object_id: command.case_id },
    input: {
      evidence,
      responsibility_matrix: rules.map((rule) => ({
        routing_rule_id: rule.routing_rule_id,
        rule_version: rule.rule_version,
        station_id: rule.station_id,
        issue_type: rule.issue_type,
        default_team: rule.default_team,
        reviewer_role: rule.reviewer_role,
        sla_rule_version: rule.sla_rule_version,
        status: rule.status,
        evidence_class: rule.evidence_class,
      })),
      issue_cluster: {
        station_id: caseRecord.formal_entity.station_id,
        issue_type: caseRecord.category_detail,
      },
      resolution_records: [],
    },
  };
  const requestValidation = validateNodeRequestDefinition(request);
  if (!requestValidation.valid) return aiBindingFailure(command, "N6", requestValidation.errors);

  let rawEnvelope: unknown;
  try {
    rawEnvelope = await ports.ai_runner.run<JsonValue, JsonValue>(structuredClone(request));
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown N6 runner error";
    return needsHuman(
      command,
      "responsibility_routing_confirmation",
      ["preserve_case_state", "stop_N6", "do_not_create_work_order"],
      [`N6 infrastructure error: ${message}`],
      { error_class: "ai_runner_error" },
    );
  }
  const binding = validateBoundAiEnvelope(request, rawEnvelope);
  if (!binding.valid) return aiBindingFailure(command, "N6", binding.errors);
  const envelope = binding.envelope;
  if (envelope.status !== "ok" || !envelope.validation.valid || envelope.payload === null) {
    return needsHuman(
      command,
      "responsibility_routing_confirmation",
      ["preserve_case_state", "stop_N6", "do_not_create_work_order"],
      [`N6 stopped with status ${envelope.status}`],
      { error_class: `ai_${envelope.status}` },
    );
  }
  const candidates = routingPayload(envelope);
  if (!candidates) return failure(command, "ai_boundary_error", "N6 returned an invalid routing boundary");
  const proposal: W3RoutingProposal = {
    proposal_id: ports.ids.nextId("routing-proposal"),
    case_id: command.case_id,
    node_run_id: envelope.run_id,
    node_version: envelope.version,
    input_hash: envelope.input_hash,
    candidates,
    evidence_spans: envelope.evidence_spans.map((span) => ({ ...span })),
    created_at: ports.clock.now().toISOString(),
  };
  const saved = await ports.repository.saveRoutingProposalIfAbsent(proposal);
  return needsHuman(
    command,
    "responsibility_routing_confirmation",
    [
      saved.created ? "store_N6_routing_candidate" : "return_existing_N6_candidate",
      "await_authorized_human_routing_confirmation",
      "do_not_assign_final_person",
      "do_not_decide_liability",
      "do_not_create_work_order",
    ],
    [],
    {
      routing_proposal: asJson(saved.record),
      effect_state: saved.created ? "committed" : "existing",
    },
  );
}

function decisionFingerprint(value: Record<string, JsonValue>): string {
  return createWorkflowEventFingerprint(asJson(value));
}

function sameEventDecisionView(record: Awaited<ReturnType<R3WorkflowRepository["findSameEventResolutionByCaseId"]>>) {
  if (!record) return null;
  return {
    decision_id: record.resolution_id,
    action: "resolve_same_event",
    authorization_state: "authorized",
    authorization_policy_version: record.authorization_policy_version,
    principal: { ...record.principal },
    proposal_ref: { check_id: record.check_id },
    decision: record.decision,
    reason: record.reason,
    decided_at: record.decided_at,
  };
}

function humanDecisionConflict(
  command: W3Command,
  currentDecision: W3FormalEntityDecision | W3RoutingDecision,
  currentCase: FrontHalfCase,
  currentWorkOrder: RuntimeWorkOrder | null = null,
): WorkflowResult<JsonValue> {
  return result(
    command,
    "failed",
    ["preserve_committed_human_decision", "do_not_overwrite", "do_not_create_duplicate_work_order"],
    ["A different authorized human decision is already committed for this case"],
    {
      error_class: "human_decision_conflict",
      human_takeover_required: true,
      effect_state: "committed_elsewhere",
      current_human_decision: asJson(currentDecision),
      case: asJson(currentCase),
      work_order: asJson(currentWorkOrder),
    },
  );
}

function invariantFailure(
  command: W3Command,
  message: string,
  caseRecord: FrontHalfCase | null,
  workOrder: RuntimeWorkOrder | null,
): WorkflowResult<JsonValue> {
  return result(
    command,
    "failed",
    ["stop_W3", "surface_invariant_violation", "do_not_run_AI", "do_not_create_work_order"],
    [message],
    {
      error_class: "invariant_violation",
      human_takeover_required: true,
      case: asJson(caseRecord),
      work_order: asJson(workOrder),
    },
  );
}

async function executeW3Core(
  command: W3Command,
  ports: W3Ports,
  authorization: W3GrantedAuthorization | null,
): Promise<WorkflowResult<JsonValue>> {
  try {
    const precondition = await enforceFrontHalfPreconditions(command, ports);
    if (!precondition.ready) return precondition.result;
    const { case_record: caseRecord, feedback, check } = precondition;

    if (command.action === "resolve_same_event") {
      if (!authorization) return failure(command, "authorization_port_failure", "trusted authorization is missing");
      if (
        check.candidate === null ||
        check.review_state !== "pending" ||
        command.check_id !== check.check_id
      ) {
        return failure(command, "human_gate_error", "same-event decision must reference the pending duplicate candidate");
      }
      const saved = await ports.repository.resolveSameEventCheck({
        resolution_id: ports.ids.nextId("same-event-resolution"),
        event_id: command.event_id,
        case_id: command.case_id,
        check_id: command.check_id,
        decision: command.decision,
        principal: authorization.principal,
        authorization_policy_version: authorization.policy_version,
        reason: command.reason,
        decided_at: ports.clock.now().toISOString(),
      });
      const humanDecision = sameEventDecisionView(saved.record);
      return result(
        command,
        saved.created ? "completed" : "idempotent",
        [
          saved.created ? "store_authorized_human_same_event_decision" : "return_existing_same_event_decision",
          "do_not_auto_merge",
          "do_not_auto_relink",
        ],
        [],
        {
          resolution: asJson(saved.record),
          human_decision: asJson(humanDecision),
          effect_state: saved.created ? "committed" : "existing",
        },
      );
    }

    const duplicateStop = await enforceDuplicateDecision(command, check, ports);
    if (duplicateStop) return duplicateStop;

    if (command.action === "advance") {
      if (caseRecord.status === "待补充") {
        return needsHuman(
          command,
          "formal_entity_confirmation",
          ["await_missing_fields", "do_not_run_N4", "do_not_create_work_order"],
          ["Case is awaiting missing entity evidence"],
        );
      }
      if (caseRecord.status === "待派单" || caseRecord.status === "处理中") {
        const workOrder = await ports.repository.findWorkOrderByCaseId(command.case_id);
        const routingDecision = await ports.repository.findRoutingDecisionByCaseId(command.case_id);
        if (!workOrder || !routingDecision || workOrder.case_id !== caseRecord.case_id) {
          return invariantFailure(
            command,
            "dispatched or processing case is missing its persisted work order or routing decision",
            caseRecord,
            workOrder,
          );
        }
        const routingDecisionVerified =
          ports.repository.hasVerifiedW3Artifact(command.case_id, "routing_decision") === true;
        const dispatchSnapshotVerified =
          ports.repository.hasVerifiedW3Artifact(command.case_id, "dispatch_snapshot") === true;
        if (!routingDecisionVerified || !dispatchSnapshotVerified) {
          return invariantFailure(
            command,
            "persisted dispatch lacks a verified repository commit receipt or its committed snapshot has drifted",
            caseRecord,
            workOrder,
          );
        }
        const formalDecisionBoundary = await enforceFormalEntityDecision(command, caseRecord, ports);
        if (!formalDecisionBoundary.valid) return formalDecisionBoundary.result;
        const routingProposal = await ports.repository.findRoutingProposalByCaseId(command.case_id);
        const routingRules = caseRecord.formal_entity === null
          ? []
          : await ports.repository.findRoutingRulesForEntity(
              caseRecord.formal_entity.station_id,
              caseRecord.category_detail,
            );
        const routingRulesBoundaryError = validateSyntheticRoutingRules(routingRules, caseRecord);
        const selectedCandidate = routingProposal?.candidates.find((candidate) =>
          candidate.routing_rule_id === routingDecision.rule_ref.routing_rule_id &&
          candidate.rule_version === routingDecision.rule_ref.rule_version &&
          candidate.sla_rule_version === routingDecision.rule_ref.sla_rule_version &&
          candidate.candidate_team === routingDecision.candidate_team &&
          candidate.candidate_logical_role === routingDecision.candidate_logical_role &&
          sameCanonicalValue(candidate.supporting_evidence_indices, routingDecision.supporting_evidence_indices) &&
          sameCanonicalValue(candidate.counter_evidence_indices, routingDecision.counter_evidence_indices) &&
          sameCanonicalValue(candidate.uncertainties, routingDecision.uncertainties)
        ) ?? null;
        const selectedRule = routingRules.find((rule) =>
          rule.routing_rule_id === routingDecision.rule_ref.routing_rule_id &&
          rule.rule_version === routingDecision.rule_ref.rule_version &&
          rule.sla_rule_version === routingDecision.rule_ref.sla_rule_version &&
          rule.default_team === routingDecision.candidate_team &&
          rule.reviewer_role === routingDecision.candidate_logical_role
        ) ?? null;
        const expectedDecisionFingerprint = decisionFingerprint({
          action: "confirm_routing",
          case_id: caseRecord.case_id,
          authorization_policy_version: routingDecision.authorization_policy_version,
          principal: asJson(routingDecision.principal),
          proposal_ref: asJson(routingDecision.proposal_ref),
          rule_ref: asJson(routingDecision.rule_ref),
          candidate_team: routingDecision.candidate_team,
          candidate_logical_role: routingDecision.candidate_logical_role,
        });
        const policies = await ports.repository.findSlaTargetReferences(
          routingDecision.rule_ref.routing_rule_id,
          routingDecision.rule_ref.sla_rule_version,
        );
        const policy = policies.length === 1 ? policies[0] : null;
        const receivedAt = Number.isFinite(Date.parse(feedback.request.received_at))
          ? new Date(feedback.request.received_at).toISOString()
          : null;
        const expectedDueAt = receivedAt === null || !Number.isSafeInteger(routingDecision.rule_ref.first_response_target_minutes)
          ? null
          : new Date(
              Date.parse(receivedAt) + routingDecision.rule_ref.first_response_target_minutes * 60_000,
            ).toISOString();
        const dispatchSnapshotValid =
          caseRecord.workflow_readiness === "dispatched" &&
          caseRecord.formal_entity_confirmation_status === "已人工确认" &&
          routingDecision.action === "confirm_routing" &&
          routingDecision.authorization_state === "authorized" &&
          hasTrustedPrincipalShape(routingDecision.principal) &&
          routingDecision.case_id === caseRecord.case_id &&
          routingDecision.decision_fingerprint === expectedDecisionFingerprint &&
          routingProposal !== null &&
          routingDecision.proposal_ref.proposal_type === "routing_proposal" &&
          routingDecision.proposal_ref.proposal_id === routingProposal.proposal_id &&
          routingDecision.proposal_ref.node_run_id === routingProposal.node_run_id &&
          routingDecision.proposal_ref.input_hash === routingProposal.input_hash &&
          selectedCandidate !== null &&
          selectedRule !== null &&
          routingRulesBoundaryError === null &&
          sameCanonicalValue(routingDecision.evidence_spans, routingProposal.evidence_spans) &&
          policy !== null &&
          validateSyntheticSlaPolicy(policy) === null &&
          policy.policy_id === routingDecision.rule_ref.sla_policy_id &&
          policy.policy_version === routingDecision.rule_ref.sla_policy_version &&
          policy.routing_rule_id === routingDecision.rule_ref.routing_rule_id &&
          policy.sla_rule_version === routingDecision.rule_ref.sla_rule_version &&
          policy.first_response_target_minutes === routingDecision.rule_ref.first_response_target_minutes &&
          caseRecord.sla_started_at === receivedAt &&
          caseRecord.sla_due_at === expectedDueAt &&
          caseRecord.sla_rule_version === routingDecision.rule_ref.sla_rule_version &&
          caseRecord.routing_rule_candidate_id === routingDecision.rule_ref.routing_rule_id &&
          caseRecord.suggested_team === routingDecision.candidate_team &&
          workOrder.case_id === caseRecord.case_id &&
          workOrder.data_scope === "synthetic_experiment" &&
          workOrder.evidence_class === "synthetic_experiment" &&
          workOrder.source_kind === "scenario_runtime" &&
          workOrder.source_name === "synthetic_experiment" &&
          workOrder.first_response_target_minutes === routingDecision.rule_ref.first_response_target_minutes &&
          workOrder.due_at === expectedDueAt &&
          workOrder.source_sha256 === caseRecord.source_sha256 &&
          (caseRecord.status === "待派单"
            ? workOrder.status === "待接单" &&
              workOrder.team === routingDecision.candidate_team &&
              workOrder.assignee_role === routingDecision.candidate_logical_role
            : workOrder.status === "处理中" &&
              isNonEmptyString(workOrder.team) &&
              isNonEmptyString(workOrder.assignee_role));
        if (!dispatchSnapshotValid) {
          return invariantFailure(
            command,
            "persisted case, work order, routing decision, and SLA policy snapshots disagree",
            caseRecord,
            workOrder,
          );
        }
        return result(
          command,
          "idempotent",
          ["return_existing_dispatch", "do_not_create_duplicate_work_order"],
          [],
          { case: asJson(caseRecord), work_order: asJson(workOrder), effect_state: "existing" },
          {
            previous: caseRecord.status,
            next: caseRecord.status,
            ...(caseRecord.sla_started_at ? { preserved_sla_started_at: caseRecord.sla_started_at } : {}),
          },
        );
      }
      if (caseRecord.status !== "待关联") {
        return failure(command, "state_transition_error", `Case state ${caseRecord.status} cannot advance W3`);
      }
      if (caseRecord.formal_entity === null) {
        return runN4(command, caseRecord, feedback, ports);
      }
      if (
        caseRecord.formal_entity_confirmation_status !== "已人工确认" ||
        !["awaiting_responsibility_routing", "awaiting_routing_confirmation"].includes(caseRecord.workflow_readiness)
      ) {
        return failure(command, "human_gate_error", "formal entity state is not ready for responsibility routing");
      }
      return runN6(command, caseRecord, ports);
    }

    if (!authorization) return failure(command, "authorization_port_failure", "trusted authorization is missing");

    if (command.action === "confirm_formal_entity") {
      const proposal = await ports.repository.findEntityProposalByCaseId(command.case_id);
      if (!proposal || proposal.proposal_id !== command.entity_proposal_id) {
        return failure(command, "human_gate_error", "formal-entity confirmation must reference the persisted N4 proposal");
      }
      const existingDecision = await ports.repository.findFormalEntityDecisionByCaseId(command.case_id);
      if (!existingDecision && (
        caseRecord.status !== "待关联" ||
        caseRecord.formal_entity !== null ||
        caseRecord.formal_entity_confirmation_status !== "待人工确认" ||
        caseRecord.workflow_readiness !== "awaiting_formal_entity_confirmation"
      )) {
        return failure(command, "human_gate_error", "case is not at the formal-entity confirmation gate");
      }
      const selected = [
        ["vehicle", command.formal_entity.vehicle_id],
        ["delivery_task", command.formal_entity.task_id],
        ["station", command.formal_entity.station_id],
      ] as const;
      if (!selected.every(([objectType, objectId]) =>
        proposal.candidates.some((candidate) => candidate.object_type === objectType && candidate.object_id === objectId)
      )) {
        return failure(command, "human_gate_error", "formal entity must select the exact evidence-backed N4 candidates");
      }
      const proposalRef = {
        proposal_type: "entity_proposal" as const,
        proposal_id: proposal.proposal_id,
        node_run_id: proposal.node_run_id,
        input_hash: proposal.input_hash,
      };
      const fingerprint = decisionFingerprint({
        action: "confirm_formal_entity",
        case_id: command.case_id,
        authorization_policy_version: authorization.policy_version,
        principal: asJson(authorization.principal),
        proposal_ref: asJson(proposalRef),
        formal_entity: asJson(command.formal_entity),
      });
      const decision: W3FormalEntityDecision = {
        decision_id: ports.ids.nextId("human-decision"),
        decision_fingerprint: fingerprint,
        event_id: command.event_id,
        case_id: command.case_id,
        action: "confirm_formal_entity",
        authorization_state: "authorized",
        authorization_policy_version: authorization.policy_version,
        principal: { ...authorization.principal },
        proposal_ref: proposalRef,
        formal_entity: { ...command.formal_entity },
        evidence_spans: proposal.evidence_spans.map((span) => ({ ...span })),
        decided_at: ports.clock.now().toISOString(),
      };
      const confirmation = await ports.repository.confirmFormalEntity({ decision });
      if (confirmation.outcome === "human_decision_conflict") {
        return humanDecisionConflict(command, confirmation.decision, confirmation.record);
      }
      return result(
        command,
        confirmation.outcome === "created" ? "completed" : "idempotent",
        [
          confirmation.outcome === "created"
            ? "store_authorized_human_formal_entity"
            : "return_existing_formal_entity_decision",
          "stop_before_N6",
          "do_not_create_work_order",
        ],
        [],
        {
          case: asJson(confirmation.record),
          human_decision: asJson(confirmation.decision),
          next_gate: "responsibility_routing",
          effect_state: confirmation.outcome === "created" ? "committed" : "existing",
        },
        { previous: caseRecord.status, next: confirmation.record.status },
      );
    }

    if (caseRecord.formal_entity === null || caseRecord.formal_entity_confirmation_status !== "已人工确认") {
      return failure(command, "human_gate_error", "formal entity must be human-confirmed before routing confirmation");
    }
    const formalDecisionBoundary = await enforceFormalEntityDecision(command, caseRecord, ports);
    if (!formalDecisionBoundary.valid) return formalDecisionBoundary.result;
    const proposal = await ports.repository.findRoutingProposalByCaseId(command.case_id);
    if (!proposal || proposal.proposal_id !== command.routing_proposal_id) {
      return failure(command, "human_gate_error", "routing confirmation must reference the persisted N6 proposal");
    }
    const chosen = proposal.candidates.find((candidate) =>
      candidate.routing_rule_id === command.routing_rule_id &&
      candidate.candidate_team === command.candidate_team &&
      candidate.candidate_logical_role === command.candidate_logical_role &&
      candidate.sla_rule_version === command.sla_rule_version
    );
    if (!chosen) {
      return failure(command, "human_gate_error", "routing confirmation must select an exact N6 candidate");
    }
    const rules = await ports.repository.findRoutingRulesForEntity(
      caseRecord.formal_entity.station_id,
      caseRecord.category_detail,
    );
    const rulesBoundaryError = validateSyntheticRoutingRules(rules, caseRecord);
    if (rulesBoundaryError) return failure(command, "synthetic_boundary_violation", rulesBoundaryError);
    const selectedRule = rules.find((rule) =>
      rule.routing_rule_id === chosen.routing_rule_id &&
      rule.rule_version === chosen.rule_version &&
      rule.default_team === chosen.candidate_team &&
      rule.reviewer_role === chosen.candidate_logical_role &&
      rule.sla_rule_version === chosen.sla_rule_version
    );
    if (!selectedRule) {
      return failure(command, "human_gate_error", "selected routing candidate is no longer bound to the persisted rule set");
    }
    const policies = await ports.repository.findSlaTargetReferences(
      chosen.routing_rule_id,
      chosen.sla_rule_version,
    );
    if (policies.length !== 1) {
      return failure(command, "sla_policy_gap", "routing confirmation requires exactly one versioned synthetic SLA policy");
    }
    const policy = policies[0];
    const policyBoundaryError = validateSyntheticSlaPolicy(policy);
    if (
      policyBoundaryError ||
      policy.routing_rule_id !== chosen.routing_rule_id ||
      policy.sla_rule_version !== chosen.sla_rule_version
    ) {
      return failure(command, "synthetic_boundary_violation", policyBoundaryError ?? "SLA policy is bound to another routing rule");
    }
    if (command.first_response_target_minutes !== policy.first_response_target_minutes) {
      return failure(command, "sla_policy_mismatch", "first-response target does not match the versioned synthetic SLA policy");
    }

    const proposalRef = {
      proposal_type: "routing_proposal" as const,
      proposal_id: proposal.proposal_id,
      node_run_id: proposal.node_run_id,
      input_hash: proposal.input_hash,
    };
    const ruleRef = {
      routing_rule_id: selectedRule.routing_rule_id,
      rule_version: selectedRule.rule_version,
      sla_rule_version: selectedRule.sla_rule_version,
      first_response_target_minutes: policy.first_response_target_minutes,
      sla_policy_id: policy.policy_id,
      sla_policy_version: policy.policy_version,
    };
    const fingerprint = decisionFingerprint({
      action: "confirm_routing",
      case_id: command.case_id,
      authorization_policy_version: authorization.policy_version,
      principal: asJson(authorization.principal),
      proposal_ref: asJson(proposalRef),
      rule_ref: asJson(ruleRef),
      candidate_team: chosen.candidate_team,
      candidate_logical_role: chosen.candidate_logical_role,
    });

    const existingDecision = await ports.repository.findRoutingDecisionByCaseId(command.case_id);
    const existingWorkOrder = await ports.repository.findWorkOrderByCaseId(command.case_id);
    if (existingDecision || existingWorkOrder) {
      if (!existingDecision || !existingWorkOrder) {
        return invariantFailure(
          command,
          "routing decision and work order are only partially persisted",
          caseRecord,
          existingWorkOrder,
        );
      }
      const routingDecisionVerified =
        ports.repository.hasVerifiedW3Artifact(command.case_id, "routing_decision") === true;
      const dispatchSnapshotVerified =
        ports.repository.hasVerifiedW3Artifact(command.case_id, "dispatch_snapshot") === true;
      if (!routingDecisionVerified || !dispatchSnapshotVerified) {
        return invariantFailure(
          command,
          "persisted dispatch lacks a verified repository commit receipt or its committed snapshot has drifted",
          caseRecord,
          existingWorkOrder,
        );
      }
      const expectedSlaStartedAt = Number.isFinite(Date.parse(feedback.request.received_at))
        ? new Date(feedback.request.received_at).toISOString()
        : null;
      const expectedSlaDueAt = expectedSlaStartedAt === null
        ? null
        : new Date(
            Date.parse(expectedSlaStartedAt) + policy.first_response_target_minutes * 60_000,
          ).toISOString();
      const existingDispatchStateValid =
        caseRecord.workflow_readiness === "dispatched" &&
        caseRecord.formal_entity_confirmation_status === "已人工确认" &&
        caseRecord.suggested_team === existingDecision.candidate_team &&
        caseRecord.sla_started_at === expectedSlaStartedAt &&
        caseRecord.sla_due_at === expectedSlaDueAt &&
        caseRecord.sla_rule_version === existingDecision.rule_ref.sla_rule_version &&
        caseRecord.routing_rule_candidate_id === existingDecision.rule_ref.routing_rule_id &&
        existingWorkOrder.case_id === caseRecord.case_id &&
        existingWorkOrder.due_at === expectedSlaDueAt &&
        existingWorkOrder.first_response_target_minutes === policy.first_response_target_minutes &&
        existingWorkOrder.sla_reset_count === 0 &&
        (
          (caseRecord.status === "待派单" &&
            existingWorkOrder.status === "待接单" &&
            existingWorkOrder.team === existingDecision.candidate_team &&
            existingWorkOrder.assignee_role === existingDecision.candidate_logical_role) ||
          (caseRecord.status === "处理中" &&
            existingWorkOrder.status === "处理中" &&
            isNonEmptyString(existingWorkOrder.team) &&
            isNonEmptyString(existingWorkOrder.assignee_role))
        );
      if (!existingDispatchStateValid) {
        return invariantFailure(
          command,
          "persisted case and work order are not in a valid W3/W4 dispatch state pair",
          caseRecord,
          existingWorkOrder,
        );
      }
      const existingMaterialMatches =
        existingDecision.authorization_state === "authorized" &&
        existingDecision.authorization_policy_version === authorization.policy_version &&
        sameCanonicalValue(existingDecision.principal, authorization.principal) &&
        sameCanonicalValue(existingDecision.proposal_ref, proposalRef) &&
        sameCanonicalValue(existingDecision.rule_ref, ruleRef) &&
        existingDecision.candidate_team === chosen.candidate_team &&
        existingDecision.candidate_logical_role === chosen.candidate_logical_role &&
        sameCanonicalValue(existingDecision.supporting_evidence_indices, chosen.supporting_evidence_indices) &&
        sameCanonicalValue(existingDecision.counter_evidence_indices, chosen.counter_evidence_indices) &&
        sameCanonicalValue(existingDecision.uncertainties, chosen.uncertainties) &&
        sameCanonicalValue(existingDecision.evidence_spans, proposal.evidence_spans);
      if (existingDecision.decision_fingerprint !== fingerprint || !existingMaterialMatches) {
        return humanDecisionConflict(command, existingDecision, caseRecord, existingWorkOrder);
      }
      return result(
        command,
        "idempotent",
        ["return_existing_dispatch", "do_not_create_duplicate_work_order"],
        [],
        {
          case: asJson(caseRecord),
          work_order: asJson(existingWorkOrder),
          human_decision: asJson(existingDecision),
          effect_state: "existing",
        },
        {
          previous: caseRecord.status,
          next: caseRecord.status,
          ...(caseRecord.sla_started_at ? { preserved_sla_started_at: caseRecord.sla_started_at } : {}),
        },
      );
    }
    if (
      caseRecord.status !== "待关联" ||
      caseRecord.workflow_readiness !== "awaiting_routing_confirmation"
    ) {
      return failure(command, "human_gate_error", "case is not at the authorized routing confirmation gate");
    }
    if (caseRecord.sla_started_at !== null || caseRecord.sla_due_at !== null) {
      return invariantFailure(
        command,
        "unassigned case already contains SLA anchors; W3 will not overwrite or reset them",
        caseRecord,
        null,
      );
    }
    if (!Number.isFinite(Date.parse(feedback.request.received_at))) {
      return failure(command, "repository_error", "the immutable feedback received_at is unavailable");
    }

    transitionCase(caseRecord.status, "待派单", "authorized_human");
    const slaStartedAt = new Date(feedback.request.received_at).toISOString();
    const slaDueAt = new Date(
      Date.parse(slaStartedAt) + policy.first_response_target_minutes * 60_000,
    ).toISOString();
    const now = ports.clock.now().toISOString();
    const nextCase: FrontHalfCase = {
      ...caseRecord,
      formal_entity: { ...caseRecord.formal_entity },
      status: "待派单",
      updated_at: now,
      sla_started_at: slaStartedAt,
      sla_due_at: slaDueAt,
      sla_rule_version: chosen.sla_rule_version,
      suggested_team: chosen.candidate_team,
      routing_rule_candidate_id: chosen.routing_rule_id,
      pending_confirmation_items: caseRecord.pending_confirmation_items.filter(
        (item) => item !== "responsibility_owner" && item !== "sla_rule_version",
      ),
      workflow_readiness: "dispatched",
    };
    const decision: W3RoutingDecision = {
      decision_id: ports.ids.nextId("human-decision"),
      decision_fingerprint: fingerprint,
      event_id: command.event_id,
      case_id: command.case_id,
      action: "confirm_routing",
      authorization_state: "authorized",
      authorization_policy_version: authorization.policy_version,
      principal: { ...authorization.principal },
      proposal_ref: proposalRef,
      rule_ref: ruleRef,
      candidate_team: chosen.candidate_team,
      candidate_logical_role: chosen.candidate_logical_role,
      supporting_evidence_indices: [...chosen.supporting_evidence_indices],
      counter_evidence_indices: [...chosen.counter_evidence_indices],
      uncertainties: [...chosen.uncertainties],
      evidence_spans: proposal.evidence_spans.map((span) => ({ ...span })),
      decided_at: now,
    };
    const workOrder: RuntimeWorkOrder = {
      schema_version: caseRecord.schema_version,
      data_scope: caseRecord.data_scope,
      evidence_class: "synthetic_experiment",
      created_at: now,
      updated_at: now,
      source_kind: "scenario_runtime",
      work_order_id: ports.ids.nextId("work-order"),
      legacy_id: "not_applicable_scenario_runtime",
      case_id: caseRecord.case_id,
      team: chosen.candidate_team,
      assignee_role: chosen.candidate_logical_role,
      action: "human_confirmed_responsibility_routing",
      accepted_at: null,
      due_at: slaDueAt,
      completed_at: null,
      disposition_evidence: null,
      validation_result: "pending",
      escalation_level: "none",
      first_response_target_minutes: policy.first_response_target_minutes,
      sla_reset_count: 0,
      status: "待接单",
      legacy_recorded_at: null,
      legacy_routing_correct: "not_applicable",
      legacy_status: "not_applicable",
      source_name: "synthetic_experiment",
      source_locator: `W3:${command.event_id}`,
      source_sha256: caseRecord.source_sha256,
    };
    const dispatch = await ports.repository.createDispatchIfAbsent({
      expected_case: caseRecord,
      next_case: nextCase,
      work_order: workOrder,
      decision,
    });
    if (dispatch.outcome === "human_decision_conflict") {
      return humanDecisionConflict(command, dispatch.decision, dispatch.case, dispatch.work_order);
    }
    if (dispatch.outcome === "concurrency_conflict") {
      return result(
        command,
        "failed",
        ["preserve_concurrent_state", "do_not_overwrite", "do_not_create_duplicate_work_order"],
        ["case changed while the authorized routing decision was being committed"],
        {
          error_class: "concurrency_conflict",
          human_takeover_required: true,
          effect_state: "committed_elsewhere",
          case: asJson(dispatch.case),
          work_order: asJson(dispatch.work_order),
          current_human_decision: asJson(dispatch.decision),
        },
      );
    }
    return result(
      command,
      dispatch.outcome === "created" ? "completed" : "idempotent",
      [
        dispatch.outcome === "created"
          ? "store_authorized_human_routing_decision"
          : "return_existing_dispatch",
        dispatch.outcome === "created" ? "create_待接单_work_order" : "do_not_create_duplicate_work_order",
        "preserve_feedback_received_at_as_sla_start",
        "do_not_assign_final_person",
      ],
      [],
      {
        case: asJson(dispatch.case),
        work_order: asJson(dispatch.work_order),
        human_decision: asJson(dispatch.decision),
        effect_state: dispatch.outcome === "created" ? "committed" : "existing",
      },
      {
        previous: caseRecord.status,
        next: dispatch.case.status,
        preserved_sla_started_at: dispatch.case.sla_started_at ?? slaStartedAt,
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown W3 repository error";
    const normalized = message.toLowerCase();
    const errorClass = normalized.includes("invariant")
      ? "invariant_violation"
      : normalized.includes("human decision") || normalized.includes("human-decision")
        ? "human_decision_conflict"
        : "repository_error";
    return failure(command, errorClass, `W3 repository error: ${message}`);
  }
}

async function executeW3(command: W3Command, ports: W3Ports): Promise<WorkflowResult<JsonValue>> {
  const authorizationOutcome = await authorizeHumanCommand(command, ports);
  if (!authorizationOutcome.granted) return authorizationOutcome.result;
  if (!isHumanAction(command.action)) {
    return executeW3Core(command, ports, null);
  }
  const humanCommand = command as Exclude<W3Command, { action: "advance" }>;
  const authorization = authorizationOutcome.authorization;
  if (!authorization) {
    return withActionAuthorization(
      failure(humanCommand, "authorization_capability_invalid", "W3 authorization capability is missing"),
      humanCommand,
      "indeterminate",
    );
  }
  const claims: W3AuthorizationGrantClaims = {
    workflow: "W3",
    event_id: humanCommand.event_id,
    case_id: humanCommand.case_id,
    action: humanCommand.action,
    target_fingerprint: createWorkflowEventFingerprint(asJson(authorization.target)),
    command_fingerprint: authorization.command_fingerprint,
    principal: { ...authorization.principal },
    policy_version: authorization.policy_version,
  };
  try {
    return await ports.repository.runAuthorizedW3Action(
      { grant: authorization.grant, claims },
      async (trustedClaims) => {
        const trustedAuthorization: W3GrantedAuthorization = {
          ...authorization,
          principal: { ...trustedClaims.principal },
          policy_version: trustedClaims.policy_version,
        };
        const workflowResult = await executeW3Core(command, ports, trustedAuthorization);
        return withActionAuthorization(
          workflowResult,
          humanCommand,
          "authorized",
          trustedAuthorization,
        );
      },
    );
  } catch {
    return withActionAuthorization(
      failure(
        humanCommand,
        "authorization_capability_invalid",
        "W3 authorization capability could not be verified",
      ),
      humanCommand,
      "indeterminate",
    );
  }
}

function workflowAuditId(fingerprint: string): string {
  return `W3-WORKFLOW-AUDIT-${fingerprint}`;
}

function withWorkflowAuditState(
  workflowResult: WorkflowResult<JsonValue>,
  auditId: string,
  state: "recorded" | "pending",
  options: {
    event_result_cached: boolean;
    error_class?: string;
  },
): WorkflowResult<JsonValue> {
  const output = isObject(workflowResult.output) ? workflowResult.output : {};
  const pending = state === "pending";
  const actions = pending
    ? [
        ...workflowResult.actions,
        "workflow_audit_pending",
        "retry_audit_without_repeating_business_effects",
      ]
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
  ports: W3Ports,
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
  ports: W3Ports,
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
    const output = isObject(cachedResult.output) ? cachedResult.output : {};
    const errorClass = output.effect_state === "committed"
      ? "audit_failure_after_commit"
      : "audit_sink_failure_after_event_cache";
    const pending = withWorkflowAuditState(cachedResult, auditId, "pending", {
      event_result_cached: true,
      error_class: errorClass,
    });
    return replaceCachedResult(cachedResult, pending);
  }
}

async function appendTransientWorkflowAudit(
  workflowResult: WorkflowResult<JsonValue>,
  fingerprint: string,
  ports: W3Ports,
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
  const preserved = structuredClone(stored);
  const storedOutput = isObject(preserved.output) ? preserved.output : {};
  return {
    ...preserved,
    status: preserved.status === "completed" ? "idempotent" : preserved.status,
    actions: [
      "return_existing_event_result",
      "do_not_repeat_AI",
      "do_not_repeat_authorization",
      "do_not_repeat_human_decision",
      "do_not_repeat_domain_side_effects",
      ...preserved.actions,
    ],
    output: { ...storedOutput, event_replayed: true } as JsonValue,
  };
}

export async function runW3(command: W3Command, ports: W3Ports): Promise<WorkflowResult<JsonValue>> {
  const boundary = validateCommandBoundary(command);
  if (!boundary.valid) {
    const refs = safeInvalidCommandRefs(command);
    const securityAuditState = await appendInvalidCommandSecurityAudit(refs, boundary.reason_code, ports);
    return invalidCommandResult(refs, boundary.reason_code, boundary.error, securityAuditState);
  }
  const validCommand = boundary.command;
  const fingerprint = createWorkflowEventFingerprint(asJson({ workflow: "W3", command: validCommand }));
  try {
    const execution = await ports.repository.runWorkflowEvent(validCommand.event_id, fingerprint, async () => {
      return ports.repository.runCaseExclusive(validCommand.case_id, () => executeW3(validCommand, ports));
    });
    const audited = await ports.repository.runWorkflowAuditExclusive(validCommand.event_id, async () => {
      return ensureCachedWorkflowAudit(execution.result, fingerprint, ports);
    });
    return execution.replayed ? replayResult(audited) : structuredClone(audited);
  } catch (error) {
    const conflict = error instanceof WorkflowEventConflictError;
    const workflowResult = failure(
      validCommand,
      conflict ? "idempotency_conflict" : "repository_error",
      conflict ? error.message : `W3 event repository error: ${error instanceof Error ? error.message : "unknown error"}`,
    );
    return appendTransientWorkflowAudit(workflowResult, fingerprint, ports);
  }
}
