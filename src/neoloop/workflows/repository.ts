import { AsyncLocalStorage } from "node:async_hooks";

import {
  CANONICAL_SCHEMA_VERSION,
  type AiNodeEnvelope,
  type EvidenceSpan,
  type JsonValue,
  type RawFeedbackStatus,
  type StoredRawFeedback,
  type WorkflowResult,
} from "../contracts/model.js";
import type { AiNodeRunRequest, Repository } from "../contracts/ports.js";
import {
  AI_NODE_DEFINITIONS,
  type N5CrossEventPayload,
  type N6RootCausePayload,
} from "../ai/definitions.js";
import { createAiInputHash } from "../ai/runner.js";
import { validateNodeCandidate, validateNodeRequestDefinition } from "../ai/validation.js";
import { validateAiNodeEnvelope } from "../contracts/validation.js";
import { transitionCluster, transitionImprovement } from "../domain/state-machine.js";
import { createWorkflowEventFingerprint } from "./event-idempotency.js";
import type {
  FrontHalfCase,
  R3DeliveryTaskReference,
  R3ReferenceData,
  R3RoutingRuleReference,
  R3SlaTargetReference,
  R3StationReference,
  R3VehicleReference,
  RuntimeWorkOrder,
  SameEventCheck,
  SameEventHumanResolution,
  W3EntityProposal,
  W3FormalEntityDecision,
  W3RoutingDecision,
  W3RoutingProposal,
  W3AuthorizedPrincipal,
  W5AtomicTransition,
  W5ClosureProvenance,
  W5ClosureDecision,
  W5EvidenceSubmission,
  W5FollowUp,
  W5History,
  W5ReplyDraft,
  W5ReplyReview,
  RuntimeImprovementProject,
  RuntimeProblemCluster,
  W6AtomicTransition,
  W6ActiveObservationRecurrenceIntake,
  W6AuthorizedAction,
  W6CaseMembershipSnapshot,
  W6ClosedCaseContext,
  W6CommitReceipt,
  W6CommitResult,
  W6CrossEventProposal,
  W6History,
  W6HistoryEntry,
  W6ObservationCheckpoint,
  W6ObservationCycle,
  W6Phase,
  W6RecurrenceCaseSnapshot,
} from "./model.js";

declare const W3_AUTHORIZATION_GRANT_BRAND: unique symbol;

export type W3AuthorizationGrant = object & {
  readonly [W3_AUTHORIZATION_GRANT_BRAND]: never;
};

export type W3AuthorizedAction = "resolve_same_event" | "confirm_formal_entity" | "confirm_routing";

export interface W3AuthorizationGrantClaims {
  workflow: "W3";
  event_id: string;
  case_id: string;
  action: W3AuthorizedAction;
  target_fingerprint: string;
  command_fingerprint: string;
  principal: W3AuthorizedPrincipal;
  policy_version: string;
}

export interface W3AuthorizationGrantIssuer {
  issue(claims: W3AuthorizationGrantClaims): W3AuthorizationGrant;
}

export interface W3AuthorizationGrantConsumer {
  consume(grant: W3AuthorizationGrant): W3AuthorizationGrantClaims | null;
}

declare const W5_AUTHORIZATION_GRANT_BRAND: unique symbol;

export type W5AuthorizationGrant = object & {
  readonly [W5_AUTHORIZATION_GRANT_BRAND]: never;
};

export type W5AuthorizedAction =
  | "submit_closure_request"
  | "supplement_evidence"
  | "review_reply"
  | "record_follow_up"
  | "decide_closure";

export interface W5AuthorizationGrantClaims {
  workflow: "W5";
  event_id: string;
  case_id: string;
  work_order_id: string;
  action: W5AuthorizedAction;
  target_fingerprint: string;
  command_fingerprint: string;
  principal: W3AuthorizedPrincipal;
  policy_version: string;
}

export interface W5AuthorizationGrantIssuer {
  issue(claims: W5AuthorizationGrantClaims): W5AuthorizationGrant;
}

export interface W5AuthorizationGrantConsumer {
  consume(grant: W5AuthorizationGrant): W5AuthorizationGrantClaims | null;
}

declare const W6_AUTHORIZATION_GRANT_BRAND: unique symbol;

export type W6AuthorizationGrant = object & {
  readonly [W6_AUTHORIZATION_GRANT_BRAND]: never;
};

export interface W6AuthorizationGrantClaims {
  workflow: "W6";
  event_id: string;
  phase: W6Phase;
  case_ids: string[];
  cluster_id: string;
  improvement_id: string | null;
  action: W6AuthorizedAction;
  target_fingerprint: string;
  command_fingerprint: string;
  principal: W3AuthorizedPrincipal;
  policy_version: string;
}

export interface W6AuthorizationGrantIssuer {
  issue(claims: W6AuthorizationGrantClaims): W6AuthorizationGrant;
}

export interface W6AuthorizationGrantConsumer {
  consume(grant: W6AuthorizationGrant): W6AuthorizationGrantClaims | null;
}

declare const W6_AI_VALIDATION_GRANT_BRAND: unique symbol;

export type W6AiValidationGrant = object & {
  readonly [W6_AI_VALIDATION_GRANT_BRAND]: never;
};

interface W6AiValidationGrantClaimsBase {
  workflow: "W6";
  event_id: string;
  command_fingerprint: string;
  case_ids: string[];
  cluster_id: string;
  improvement_id: string;
  expected_cluster_fingerprint: string;
  expected_improvement_fingerprint: string | null;
  authorization_target_fingerprint: string;
  transition_fingerprint: string;
  request_fingerprint: string;
  envelope_fingerprint: string;
  node_run_id: string;
  input_hash: string;
}

export interface W6N6ValidationGrantClaims extends W6AiValidationGrantClaimsBase {
  phase: "improvement";
  action: "start_improvement";
  node: "N6";
  mode: "root_cause_hypothesis";
  version: "N6-root-cause-1.0.0-draft.3";
  catalog_fingerprint: string;
  root_cause_fingerprint: string;
  n5_candidate_fingerprint: null;
  validator_version: "w6-n6-validation-v1";
}

export interface W6N5IntakeValidationGrantClaims extends W6AiValidationGrantClaimsBase {
  phase: "recurrence";
  action: "intake_active_observation_recurrence";
  node: "N5";
  mode: "cross_event_clustering";
  version: "N5-cross-event-1.0.0-draft.2";
  catalog_fingerprint: null;
  root_cause_fingerprint: null;
  n5_candidate_fingerprint: string;
  validator_version: "w6-n5-active-intake-validation-v1";
}

export type W6AiValidationGrantClaims =
  | W6N6ValidationGrantClaims
  | W6N5IntakeValidationGrantClaims;

export interface W6AiValidationGrantIssueInput {
  event_id: string;
  command_fingerprint: string;
  transition: W6AtomicTransition;
  request: AiNodeRunRequest<JsonValue>;
  envelope: AiNodeEnvelope<JsonValue>;
}


export type W3VerifiedArtifact =
  | "same_event_check"
  | "same_event_resolution"
  | "entity_proposal"
  | "formal_entity_decision"
  | "routing_proposal"
  | "routing_decision"
  | "dispatch_snapshot";

export function createW3AuthorizationGrantChannel(): {
  issuer: W3AuthorizationGrantIssuer;
  consumer: W3AuthorizationGrantConsumer;
} {
  const grants = new WeakMap<object, { claims: W3AuthorizationGrantClaims; consumed: boolean }>();
  return {
    issuer: {
      issue(claims) {
        const grant = Object.freeze(Object.create(null)) as W3AuthorizationGrant;
        grants.set(grant, { claims: cloneAuthorizationClaims(claims), consumed: false });
        return grant;
      },
    },
    consumer: {
      consume(grant) {
        if (typeof grant !== "object" || grant === null) return null;
        const entry = grants.get(grant);
        if (!entry || entry.consumed) return null;
        entry.consumed = true;
        return cloneAuthorizationClaims(entry.claims);
      },
    },
  };
}

export function createW5AuthorizationGrantChannel(): {
  issuer: W5AuthorizationGrantIssuer;
  consumer: W5AuthorizationGrantConsumer;
} {
  const grants = new WeakMap<object, { claims: W5AuthorizationGrantClaims; consumed: boolean }>();
  return {
    issuer: {
      issue(claims) {
        const grant = Object.freeze(Object.create(null)) as W5AuthorizationGrant;
        grants.set(grant, { claims: cloneW5AuthorizationClaims(claims), consumed: false });
        return grant;
      },
    },
    consumer: {
      consume(grant) {
        if (typeof grant !== "object" || grant === null) return null;
        const entry = grants.get(grant);
        if (!entry || entry.consumed) return null;
        entry.consumed = true;
        return cloneW5AuthorizationClaims(entry.claims);
      },
    },
  };
}

export function createW6AuthorizationGrantChannel(): {
  issuer: W6AuthorizationGrantIssuer;
  consumer: W6AuthorizationGrantConsumer;
} {
  const grants = new WeakMap<object, { claims: W6AuthorizationGrantClaims; consumed: boolean }>();
  return {
    issuer: {
      issue(claims) {
        const grant = Object.freeze(Object.create(null)) as W6AuthorizationGrant;
        grants.set(grant, { claims: cloneW6AuthorizationClaims(claims), consumed: false });
        return grant;
      },
    },
    consumer: {
      consume(grant) {
        if (typeof grant !== "object" || grant === null) return null;
        const entry = grants.get(grant);
        if (!entry || entry.consumed) return null;
        entry.consumed = true;
        return cloneW6AuthorizationClaims(entry.claims);
      },
    },
  };
}

export interface FrontHalfRepository extends Repository {
  findRawFeedbackById(feedbackId: string): Promise<StoredRawFeedback | null>;
  updateRawFeedbackStatus(
    feedbackId: string,
    expected: RawFeedbackStatus,
    next: RawFeedbackStatus,
  ): Promise<{ updated: boolean; record: StoredRawFeedback | null }>;
  findCaseByFeedbackId(feedbackId: string): Promise<FrontHalfCase | null>;
  findCaseById(caseId: string): Promise<FrontHalfCase | null>;
  listCases(): Promise<FrontHalfCase[]>;
  createCaseAndMarkFeedback(
    feedbackId: string,
    record: FrontHalfCase,
  ): Promise<{ created: boolean; record: FrontHalfCase; feedback: StoredRawFeedback }>;
  findSameEventCheckByCaseId(caseId: string): Promise<SameEventCheck | null>;
  insertSameEventCheckIfAbsent(
    record: SameEventCheck,
  ): Promise<{ inserted: boolean; record: SameEventCheck }>;
}

export interface R3CaseReferenceBundle {
  case_record: FrontHalfCase;
  raw_feedback: StoredRawFeedback;
  vehicles: R3VehicleReference[];
  delivery_tasks: R3DeliveryTaskReference[];
  stations: R3StationReference[];
}

export interface W6ResourceSet {
  case_ids: string[];
  cluster_id: string;
  improvement_id: string | null;
}

export interface W6ClusterCandidateInput {
  cluster_id: string;
  name: string;
  category_domain: string;
  proposal_id: string;
  history_id: string;
  receipt_id: string;
  created_at: string;
  request: AiNodeRunRequest<JsonValue>;
  envelope: AiNodeEnvelope<JsonValue>;
}

export interface W6ClusterCandidateResult {
  outcome: "created" | "idempotent";
  cluster: RuntimeProblemCluster;
  proposal: W6CrossEventProposal;
  history: W6History;
  receipt: W6CommitReceipt;
}

export interface W6RecurrenceReplayQuery {
  stable_semantic_fingerprint: string;
  command_fingerprint: string;
  case_ids: string[];
  cluster_id: string;
  improvement_id: string;
  triggering_case_ids: string[];
  reason: string;
}

export interface W6RecurrenceRequestAuthorizationInput {
  case_ids: string[];
  cluster_id: string;
  improvement_id: string;
  triggering_case_ids: string[];
  reason: string;
}

export type W6RecurrenceReplayCandidate =
  | { outcome: "not_found" }
  | { outcome: "conflict" }
  | {
      outcome: "candidate";
      authorization_transition: JsonValue;
      target_fingerprint: string;
    };

interface W6RecurrenceReplayArtifacts {
  authorization_transition: JsonValue;
  target_fingerprint: string;
  receipt: W6CommitReceipt;
  cycle: W6ObservationCycle;
}

export type W6TransitionFailureClass =
  | "concurrency_conflict"
  | "w5_closure_provenance_failure"
  | "invalid_state";

export class W6AuthorizationCapabilityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "W6AuthorizationCapabilityError";
  }
}

export class W6TransitionFailure extends Error {
  constructor(
    readonly error_class: W6TransitionFailureClass,
    message: string,
  ) {
    super(message);
    this.name = "W6TransitionFailure";
  }
}

export interface R3WorkflowRepository extends FrontHalfRepository {
  hasVerifiedW3Artifact(caseId: string, artifact: W3VerifiedArtifact): boolean;
  runAuthorizedW3Action<T>(
    input: {
      grant: W3AuthorizationGrant;
      claims: W3AuthorizationGrantClaims;
    },
    operation: (authorization: W3AuthorizationGrantClaims) => Promise<T>,
  ): Promise<T>;
  runAuthorizedW5Action<T>(
    input: {
      grant: W5AuthorizationGrant;
      claims: W5AuthorizationGrantClaims;
    },
    operation: (authorization: W5AuthorizationGrantClaims) => Promise<T>,
  ): Promise<T>;
  runAuthorizedW6Action<T>(
    input: {
      grant: W6AuthorizationGrant;
      claims: W6AuthorizationGrantClaims;
    },
    operation: (authorization: W6AuthorizationGrantClaims) => Promise<T>,
  ): Promise<T>;
  runValidatedW6AiAction<T>(
    input: {
      grant: W6AiValidationGrant;
      claims: W6AiValidationGrantClaims;
    },
    operation: (validation: W6AiValidationGrantClaims) => Promise<T>,
  ): Promise<T>;
  validateAndIssueW6AiAction(input: W6AiValidationGrantIssueInput): {
    grant: W6AiValidationGrant;
    claims: W6AiValidationGrantClaims;
  };
  findRawFeedbackByCaseId(caseId: string): Promise<StoredRawFeedback | null>;
  findR3ReferenceDataForCase(caseId: string): Promise<R3CaseReferenceBundle | null>;
  findRoutingRulesForEntity(stationId: string, issueType: string): Promise<R3RoutingRuleReference[]>;
  findSlaTargetReferences(
    routingRuleId: string,
    slaRuleVersion: string,
  ): Promise<R3SlaTargetReference[]>;
  findSameEventResolutionByCaseId(caseId: string): Promise<SameEventHumanResolution | null>;
  resolveSameEventCheck(input: {
    resolution_id: string;
    event_id: string;
    case_id: string;
    check_id: string;
    decision: SameEventHumanResolution["decision"];
    principal: W3AuthorizedPrincipal;
    authorization_policy_version: string;
    reason: string;
    decided_at: string;
  }): Promise<{ created: boolean; record: SameEventHumanResolution }>;
  findEntityProposalByCaseId(caseId: string): Promise<W3EntityProposal | null>;
  saveEntityProposalIfAbsent(
    proposal: W3EntityProposal,
  ): Promise<{ created: boolean; record: W3EntityProposal }>;
  findFormalEntityDecisionByCaseId(caseId: string): Promise<W3FormalEntityDecision | null>;
  confirmFormalEntity(input: {
    decision: W3FormalEntityDecision;
  }): Promise<
    | { outcome: "created"; record: FrontHalfCase; decision: W3FormalEntityDecision }
    | { outcome: "idempotent"; record: FrontHalfCase; decision: W3FormalEntityDecision }
    | { outcome: "human_decision_conflict"; record: FrontHalfCase; decision: W3FormalEntityDecision }
  >;
  markCaseNeedsSupplement(
    caseId: string,
    missingFields: string[],
    updatedAt: string,
  ): Promise<{ updated: boolean; record: FrontHalfCase }>;
  findRoutingProposalByCaseId(caseId: string): Promise<W3RoutingProposal | null>;
  saveRoutingProposalIfAbsent(
    proposal: W3RoutingProposal,
  ): Promise<{ created: boolean; record: W3RoutingProposal }>;
  findRoutingDecisionByCaseId(caseId: string): Promise<W3RoutingDecision | null>;
  createDispatchIfAbsent(input: {
    expected_case: FrontHalfCase;
    next_case: FrontHalfCase;
    work_order: RuntimeWorkOrder;
    decision: W3RoutingDecision;
  }): Promise<
    | {
        outcome: "created" | "idempotent";
        case: FrontHalfCase;
        work_order: RuntimeWorkOrder;
        decision: W3RoutingDecision;
      }
    | {
        outcome: "human_decision_conflict";
        case: FrontHalfCase;
        work_order: RuntimeWorkOrder;
        decision: W3RoutingDecision;
      }
    | {
        outcome: "concurrency_conflict";
        case: FrontHalfCase;
        work_order: RuntimeWorkOrder | null;
        decision: W3RoutingDecision | null;
      }
  >;
  findWorkOrderById(workOrderId: string): Promise<RuntimeWorkOrder | null>;
  findWorkOrderByCaseId(caseId: string): Promise<RuntimeWorkOrder | null>;
  compareAndSetCaseAndWorkOrder(input: {
    expected_case: FrontHalfCase;
    expected_work_order: RuntimeWorkOrder;
    next_case: FrontHalfCase;
    next_work_order: RuntimeWorkOrder;
  }): Promise<{ updated: boolean; case: FrontHalfCase; work_order: RuntimeWorkOrder }>;
  compareAndSetCaseAndWorkOrderWithEffect(
    input: {
      expected_case: FrontHalfCase;
      expected_work_order: RuntimeWorkOrder;
      next_case: FrontHalfCase;
      next_work_order: RuntimeWorkOrder;
    },
    effect: () => Promise<void>,
  ): Promise<{
    updated: boolean;
    case: FrontHalfCase | null;
    work_order: RuntimeWorkOrder | null;
    effect_performed: boolean;
  }>;
  getW5History(caseId: string): Promise<W5History>;
  commitW5Transition(input: W5AtomicTransition): Promise<{
    updated: boolean;
    case: FrontHalfCase;
    work_order: RuntimeWorkOrder;
    history: W5History;
  }>;
  getW6ClosedCaseContext(caseId: string): Promise<W6ClosedCaseContext>;
  findW6ClusterById(clusterId: string): Promise<RuntimeProblemCluster | null>;
  listW6Clusters(): Promise<RuntimeProblemCluster[]>;
  findW6ImprovementById(improvementId: string): Promise<RuntimeImprovementProject | null>;
  getW6History(clusterId: string): Promise<W6History>;
  createW6ClusterCandidateIfAbsent(input: W6ClusterCandidateInput): Promise<W6ClusterCandidateResult>;
  commitW6Transition(input: W6AtomicTransition): Promise<W6CommitResult>;
  commitW6RecurrenceTransition(
    input: Extract<W6AtomicTransition, { action: "reopen_recurrence" }>,
    stableSemanticFingerprint: string,
  ): Promise<W6CommitResult>;
  findW6RecurrenceReplayCandidate(
    input: W6RecurrenceReplayQuery,
  ): Promise<W6RecurrenceReplayCandidate>;
  resolveAuthorizedW6RecurrenceReplay(
    input: W6RecurrenceReplayQuery & {
      target_fingerprint: string;
      private_proof_fingerprint: string;
    },
  ): Promise<W6CommitResult>;
  runW6ResourcesExclusive<T>(resources: W6ResourceSet, operation: () => Promise<T>): Promise<T>;
  runWorkOrderExclusive<T>(workOrderId: string, operation: () => Promise<T>): Promise<T>;
  runCaseExclusive<T>(caseId: string, operation: () => Promise<T>): Promise<T>;
  runWorkflowAuditExclusive<T>(eventId: string, operation: () => Promise<T>): Promise<T>;
  runWorkflowEvent(
    eventId: string,
    fingerprint: string,
    operation: () => Promise<WorkflowResult<JsonValue>>,
  ): Promise<{ replayed: boolean; result: WorkflowResult<JsonValue> }>;
}

export class WorkflowEventConflictError extends Error {
  constructor(readonly event_id: string) {
    super(`Workflow event ${event_id} conflicts with an existing payload`);
    this.name = "WorkflowEventConflictError";
  }
}

function cloneRaw(record: StoredRawFeedback): StoredRawFeedback {
  return {
    ...record,
    request: {
      ...record.request,
      metadata: record.request.metadata ? { ...record.request.metadata } : undefined,
    },
  };
}

function cloneCase(record: FrontHalfCase): FrontHalfCase {
  return {
    ...record,
    missing_fields: [...record.missing_fields],
    entity_candidates: {
      ...record.entity_candidates,
      vehicle_ids: [...record.entity_candidates.vehicle_ids],
      task_ids: [...record.entity_candidates.task_ids],
      station_names: [...record.entity_candidates.station_names],
    },
    formal_entity: record.formal_entity ? { ...record.formal_entity } : null,
    pending_confirmation_items: [...record.pending_confirmation_items],
  };
}

function cloneCheck(record: SameEventCheck): SameEventCheck {
  return {
    ...record,
    candidate: record.candidate ? { ...record.candidate } : null,
    evidence_spans: record.evidence_spans.map((span) => ({ ...span })),
  };
}

function clonePrincipal(record: W3AuthorizedPrincipal): W3AuthorizedPrincipal {
  return { ...record };
}

function cloneAuthorizationClaims(record: W3AuthorizationGrantClaims): W3AuthorizationGrantClaims {
  return {
    ...record,
    principal: clonePrincipal(record.principal),
  };
}

function cloneW5AuthorizationClaims(record: W5AuthorizationGrantClaims): W5AuthorizationGrantClaims {
  return {
    ...record,
    principal: clonePrincipal(record.principal),
  };
}

function cloneW6AuthorizationClaims(record: W6AuthorizationGrantClaims): W6AuthorizationGrantClaims {
  return {
    ...record,
    case_ids: [...record.case_ids],
    principal: clonePrincipal(record.principal),
  };
}

function cloneW6AiValidationClaims<T extends W6AiValidationGrantClaims>(record: T): T {
  return {
    ...record,
    case_ids: [...record.case_ids],
  } as T;
}

function cloneResolution(record: SameEventHumanResolution): SameEventHumanResolution {
  return { ...record, principal: clonePrincipal(record.principal) };
}

function cloneEntityProposal(record: W3EntityProposal): W3EntityProposal {
  return {
    ...record,
    candidates: record.candidates.map((candidate) => ({
      ...candidate,
      evidence_span_indices: [...candidate.evidence_span_indices],
    })),
    evidence_spans: record.evidence_spans.map((span) => ({ ...span })),
  };
}

function cloneRoutingProposal(record: W3RoutingProposal): W3RoutingProposal {
  return {
    ...record,
    candidates: record.candidates.map((candidate) => ({
      ...candidate,
      supporting_evidence_indices: [...candidate.supporting_evidence_indices],
      counter_evidence_indices: [...candidate.counter_evidence_indices],
      uncertainties: [...candidate.uncertainties],
    })),
    evidence_spans: record.evidence_spans.map((span) => ({ ...span })),
  };
}

function cloneVehicle(record: R3VehicleReference): R3VehicleReference {
  return { ...record };
}

function cloneTask(record: R3DeliveryTaskReference): R3DeliveryTaskReference {
  return { ...record };
}

function cloneStation(record: R3StationReference): R3StationReference {
  return { ...record };
}

function cloneRoutingRule(record: R3RoutingRuleReference): R3RoutingRuleReference {
  return { ...record, escalation_path: [...record.escalation_path] };
}

function cloneSlaPolicy(record: R3SlaTargetReference): R3SlaTargetReference {
  return { ...record };
}

function cloneFormalEntityDecision(record: W3FormalEntityDecision): W3FormalEntityDecision {
  return {
    ...record,
    principal: clonePrincipal(record.principal),
    proposal_ref: { ...record.proposal_ref },
    formal_entity: { ...record.formal_entity },
    evidence_spans: record.evidence_spans.map((span) => ({ ...span })),
  };
}

function cloneRoutingDecision(record: W3RoutingDecision): W3RoutingDecision {
  return {
    ...record,
    principal: clonePrincipal(record.principal),
    proposal_ref: { ...record.proposal_ref },
    rule_ref: { ...record.rule_ref },
    supporting_evidence_indices: [...record.supporting_evidence_indices],
    counter_evidence_indices: [...record.counter_evidence_indices],
    uncertainties: [...record.uncertainties],
    evidence_spans: record.evidence_spans.map((span) => ({ ...span })),
  };
}

function cloneWorkOrder(record: RuntimeWorkOrder): RuntimeWorkOrder {
  return { ...record };
}

function cloneW5EvidenceSubmission(record: W5EvidenceSubmission): W5EvidenceSubmission {
  return {
    ...record,
    artifact_refs: [...record.artifact_refs],
    reviewed_facts: record.reviewed_facts.map((fact) => ({ ...fact })),
    missing_fields: [...record.missing_fields],
    principal: clonePrincipal(record.principal),
  };
}

function cloneW5ReplyDraft(record: W5ReplyDraft): W5ReplyDraft {
  return {
    ...record,
    citations: record.citations.map((citation) => ({
      ...citation,
      evidence_span_indices: [...citation.evidence_span_indices],
    })),
    supporting_evidence_indices: [...record.supporting_evidence_indices],
    evidence_spans: record.evidence_spans.map((span) => ({ ...span })),
  };
}

function cloneW5ReplyReview(record: W5ReplyReview): W5ReplyReview {
  return { ...record, principal: clonePrincipal(record.principal) };
}

function cloneW5FollowUp(record: W5FollowUp): W5FollowUp {
  return { ...record, principal: clonePrincipal(record.principal) };
}

function cloneW5ClosureDecision(record: W5ClosureDecision): W5ClosureDecision {
  return { ...record, principal: clonePrincipal(record.principal) };
}

function cloneW5ClosureProvenance(record: W5ClosureProvenance): W5ClosureProvenance {
  return { ...record };
}

function cloneW6MembershipSnapshot(record: W6CaseMembershipSnapshot): W6CaseMembershipSnapshot {
  return {
    ...record,
    feedback_links: record.feedback_links.map((entry) => ({ ...entry })),
  };
}

function cloneW6RootCauseHypothesis(
  record: NonNullable<RuntimeProblemCluster["root_cause_hypothesis"]>,
): NonNullable<RuntimeProblemCluster["root_cause_hypothesis"]> {
  return {
    ...record,
    supporting_evidence: record.supporting_evidence.map((entry) => ({ ...entry })),
    counter_evidence: record.counter_evidence.map((entry) => ({ ...entry })),
    uncertainties: [...record.uncertainties],
  };
}

function cloneW6Proposal(record: W6CrossEventProposal): W6CrossEventProposal {
  return {
    ...record,
    member_case_snapshots: record.member_case_snapshots.map(cloneW6MembershipSnapshot),
    evidence_spans: record.evidence_spans.map((entry) => ({ ...entry })),
  };
}

function cloneW6Cluster(record: RuntimeProblemCluster): RuntimeProblemCluster {
  return {
    ...record,
    member_case_ids: [...record.member_case_ids],
    root_cause_hypothesis: record.root_cause_hypothesis
      ? cloneW6RootCauseHypothesis(record.root_cause_hypothesis)
      : null,
  };
}

function cloneW6Improvement(record: RuntimeImprovementProject): RuntimeImprovementProject {
  return {
    ...record,
    observation_window_days: [...record.observation_window_days] as [7, 30],
  };
}

function cloneW6Cycle(record: W6ObservationCycle): W6ObservationCycle {
  return {
    ...record,
    triggering_case_ids: [...record.triggering_case_ids],
    triggering_case_snapshots: record.triggering_case_snapshots.map(cloneW6MembershipSnapshot),
    opened_by: clonePrincipal(record.opened_by),
  };
}

function cloneW6ActiveRecurrenceIntake(
  record: W6ActiveObservationRecurrenceIntake,
): W6ActiveObservationRecurrenceIntake {
  return {
    ...record,
    triggering_case_ids: [...record.triggering_case_ids],
    triggering_case_snapshots: record.triggering_case_snapshots.map(cloneW6MembershipSnapshot),
    authorized_by: clonePrincipal(record.authorized_by),
  };
}

function cloneW6RecurrenceCaseSnapshot(record: W6RecurrenceCaseSnapshot): W6RecurrenceCaseSnapshot {
  return {
    ...cloneW6MembershipSnapshot(record),
    observed_at: record.observed_at,
    time_source: record.time_source,
  };
}

function cloneW6Checkpoint(record: W6ObservationCheckpoint): W6ObservationCheckpoint {
  return {
    ...record,
    recurrence_case_ids: [...record.recurrence_case_ids],
    recurrence_case_snapshots: record.recurrence_case_snapshots.map(cloneW6RecurrenceCaseSnapshot),
  };
}

function cloneW6HistoryEntry(record: W6HistoryEntry): W6HistoryEntry {
  return {
    ...record,
    case_ids: [...record.case_ids],
    principal: record.principal ? clonePrincipal(record.principal) : null,
  };
}

function cloneW6Receipt(record: W6CommitReceipt): W6CommitReceipt {
  return { ...record, case_ids: [...record.case_ids] };
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isIsoTimestamp(value: unknown): value is string {
  return isNonEmptyString(value) && Number.isFinite(Date.parse(value));
}

const MAX_W6_TRANSITION_JSON_DEPTH = 24;

class W6TransitionPlainJsonBoundaryError extends Error {}

function rejectW6TransitionPlainJson(reason: string): never {
  throw new W6TransitionPlainJsonBoundaryError(reason);
}

function w6EnumerableDataValue(descriptor: PropertyDescriptor | undefined): unknown {
  if (!descriptor || descriptor.enumerable !== true) {
    return rejectW6TransitionPlainJson("only enumerable own string data properties are allowed");
  }
  if (!Object.prototype.hasOwnProperty.call(descriptor, "value")) {
    return rejectW6TransitionPlainJson("accessor properties are not allowed");
  }
  return descriptor.value;
}

function snapshotW6TransitionJsonValue(
  value: unknown,
  depth: number,
  ancestors: WeakSet<object>,
): JsonValue {
  if (depth > MAX_W6_TRANSITION_JSON_DEPTH) {
    return rejectW6TransitionPlainJson("maximum nesting depth exceeded");
  }
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return rejectW6TransitionPlainJson("non-finite numbers are not allowed");
    return value;
  }
  if (typeof value !== "object") {
    return rejectW6TransitionPlainJson("functions, symbols, bigint, and undefined are not allowed");
  }
  if (ancestors.has(value)) return rejectW6TransitionPlainJson("cyclic references are not allowed");

  let arrayValue: boolean;
  let prototype: object | null;
  let descriptors: PropertyDescriptorMap;
  try {
    arrayValue = Array.isArray(value);
    prototype = Object.getPrototypeOf(value) as object | null;
    descriptors = Object.getOwnPropertyDescriptors(value);
  } catch {
    return rejectW6TransitionPlainJson("descriptor inspection failed");
  }
  const keys = Reflect.ownKeys(descriptors);
  if (keys.some((key) => typeof key === "symbol")) {
    return rejectW6TransitionPlainJson("symbol properties are not allowed");
  }

  ancestors.add(value);
  try {
    if (arrayValue) {
      if (prototype !== Array.prototype) return rejectW6TransitionPlainJson("array prototype is not allowed");
      const lengthDescriptor = descriptors.length;
      if (
        !lengthDescriptor ||
        !Object.prototype.hasOwnProperty.call(lengthDescriptor, "value") ||
        !Number.isSafeInteger(lengthDescriptor.value) ||
        lengthDescriptor.value < 0
      ) {
        return rejectW6TransitionPlainJson("array length descriptor is invalid");
      }
      const length = lengthDescriptor.value as number;
      if (keys.length !== length + 1) {
        return rejectW6TransitionPlainJson("sparse arrays and non-index array properties are not allowed");
      }
      for (const key of keys) {
        if (key === "length") continue;
        if (
          typeof key !== "string" ||
          !/^(?:0|[1-9]\d*)$/u.test(key) ||
          !Number.isSafeInteger(Number(key)) ||
          Number(key) >= length
        ) {
          return rejectW6TransitionPlainJson("array contains a non-index property");
        }
      }
      const snapshot: JsonValue[] = [];
      for (let index = 0; index < length; index += 1) {
        const descriptor = descriptors[String(index)];
        if (!descriptor) return rejectW6TransitionPlainJson("sparse arrays are not allowed");
        snapshot.push(snapshotW6TransitionJsonValue(
          w6EnumerableDataValue(descriptor),
          depth + 1,
          ancestors,
        ));
      }
      return snapshot;
    }

    if (prototype !== Object.prototype && prototype !== null) {
      return rejectW6TransitionPlainJson("object prototype and inherited properties are not allowed");
    }
    const snapshot = Object.create(null) as Record<string, JsonValue>;
    for (const key of keys as string[]) {
      const entry = snapshotW6TransitionJsonValue(
        w6EnumerableDataValue(descriptors[key]),
        depth + 1,
        ancestors,
      );
      Object.defineProperty(snapshot, key, {
        value: entry,
        enumerable: true,
        configurable: true,
        writable: true,
      });
    }
    return snapshot;
  } finally {
    ancestors.delete(value);
  }
}

function hasExactKeys(value: object, keys: string[]): boolean {
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  if (!Reflect.ownKeys(value).every((key) => typeof key === "string")) return false;
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || !actual.every((key, index) => key === expected[index])) return false;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  return actual.every((key) => {
    const descriptor = descriptors[key];
    return descriptor !== undefined && descriptor.enumerable && !("get" in descriptor) && !("set" in descriptor);
  });
}

function hasTrustedPrincipal(record: W3AuthorizedPrincipal): boolean {
  return typeof record === "object" && record !== null &&
    hasExactKeys(record, ["principal_id", "principal_type", "canonical_role", "authority_source"]) &&
    isNonEmptyString(record.principal_id) &&
    record.principal_type === "synthetic_human" &&
    isNonEmptyString(record.canonical_role) &&
    record.authority_source === "synthetic_allowlist";
}

function hasValidAuthorizationClaims(record: W3AuthorizationGrantClaims): boolean {
  return hasExactKeys(record, [
    "workflow",
    "event_id",
    "case_id",
    "action",
    "target_fingerprint",
    "command_fingerprint",
    "principal",
    "policy_version",
  ]) &&
    record.workflow === "W3" &&
    isNonEmptyString(record.event_id) &&
    isNonEmptyString(record.case_id) &&
    ["resolve_same_event", "confirm_formal_entity", "confirm_routing"].includes(record.action) &&
    /^[a-f0-9]{64}$/iu.test(record.target_fingerprint) &&
    /^[a-f0-9]{64}$/iu.test(record.command_fingerprint) &&
    hasTrustedPrincipal(record.principal) &&
    isNonEmptyString(record.policy_version);
}

function hasValidW5AuthorizationClaims(record: W5AuthorizationGrantClaims): boolean {
  return hasExactKeys(record, [
    "workflow",
    "event_id",
    "case_id",
    "work_order_id",
    "action",
    "target_fingerprint",
    "command_fingerprint",
    "principal",
    "policy_version",
  ]) &&
    record.workflow === "W5" &&
    isNonEmptyString(record.event_id) &&
    isNonEmptyString(record.case_id) &&
    isNonEmptyString(record.work_order_id) &&
    [
      "submit_closure_request",
      "supplement_evidence",
      "review_reply",
      "record_follow_up",
      "decide_closure",
    ].includes(record.action) &&
    /^[a-f0-9]{64}$/iu.test(record.target_fingerprint) &&
    /^[a-f0-9]{64}$/iu.test(record.command_fingerprint) &&
    hasTrustedPrincipal(record.principal) &&
    isNonEmptyString(record.policy_version);
}

const W6_AUTHORIZED_ACTIONS: readonly W6AuthorizedAction[] = [
  "review_candidate",
  "start_improvement",
  "enter_observation",
  "archive_observation",
  "reopen_recurrence",
  "intake_active_observation_recurrence",
];

function sortedUniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function isSortedUniqueNonEmptyStrings(values: unknown): values is string[] {
  return Array.isArray(values) &&
    values.length > 0 &&
    values.every(isNonEmptyString) &&
    sameJson(values, sortedUniqueStrings(values));
}

function isSortedUniqueNonEmptyStringsOrEmpty(values: unknown): values is string[] {
  return Array.isArray(values) &&
    values.every(isNonEmptyString) &&
    sameJson(values, sortedUniqueStrings(values));
}

function w6PhaseForAction(action: W6AtomicTransition["action"]): W6Phase {
  if (action === "review_candidate") return "cluster_review";
  if (action === "start_improvement") return "improvement";
  if (
    action === "reopen_recurrence" ||
    action === "intake_active_observation_recurrence"
  ) return "recurrence";
  return "observation";
}

const W6_TRANSITION_COMMON_FIELDS = [
  "action",
  "case_ids",
  "cluster_id",
  "improvement_id",
  "expected_cluster_fingerprint",
  "expected_improvement_fingerprint",
  "history_id",
  "receipt_id",
  "occurred_at",
];

function hasExactW6TransitionShape(input: W6AtomicTransition): boolean {
  const actionFields: Partial<Record<W6AtomicTransition["action"], string[]>> = {
    review_candidate: ["decision", "reason"],
    start_improvement: ["improvement", "root_cause_hypothesis", "reason"],
    enter_observation: ["cycle_id", "clock_source", "reason"],
    record_day_7: [
      "cycle_id",
      "clock_source",
      "recurrence_case_ids",
      "related_task_volume",
      "checkpoint_id",
    ],
    record_day_30: [
      "cycle_id",
      "clock_source",
      "recurrence_case_ids",
      "related_task_volume",
      "checkpoint_id",
    ],
    archive_observation: ["cycle_id", "human_conclusion", "reason"],
    reopen_recurrence: ["cycle_id", "triggering_case_ids", "clock_source", "reason"],
    intake_active_observation_recurrence: [
      "expected_w6_state_fingerprint",
      "cycle_id",
      "triggering_case_ids",
      "intake_id",
      "clock_source",
      "n5_validation_fingerprint",
      "reason",
    ],
  };
  const fields = actionFields[input.action];
  if (!fields || !hasExactKeys(input, [...W6_TRANSITION_COMMON_FIELDS, ...fields])) return false;
  if (input.action !== "start_improvement") return true;
  if (
    typeof input.improvement !== "object" ||
    input.improvement === null ||
    Array.isArray(input.improvement) ||
    typeof input.root_cause_hypothesis !== "object" ||
    input.root_cause_hypothesis === null ||
    Array.isArray(input.root_cause_hypothesis)
  ) {
    return false;
  }
  const hasExactImprovement = hasExactKeys(input.improvement, [
    "version",
    "owner_role",
    "measure",
    "observation_window_days",
    "clock_source",
    "metric_formula",
  ]);
  const hypothesis = input.root_cause_hypothesis;
  const evidenceHasExactShape = (value: unknown): boolean => {
    if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
    const keys = Object.keys(value);
    if (
      !keys.includes("source_ref") ||
      !keys.includes("quote") ||
      !keys.every((key) => ["source_ref", "quote", "start_offset", "end_offset"].includes(key)) ||
      !hasExactKeys(value, keys)
    ) {
      return false;
    }
    const span = value as { start_offset?: unknown; end_offset?: unknown };
    if (
      (span.start_offset !== undefined && (!Number.isInteger(span.start_offset) || (span.start_offset as number) < 0)) ||
      (span.end_offset !== undefined && (!Number.isInteger(span.end_offset) || (span.end_offset as number) < 0)) ||
      (
        Number.isInteger(span.start_offset) &&
        Number.isInteger(span.end_offset) &&
        (span.end_offset as number) < (span.start_offset as number)
      )
    ) {
      return false;
    }
    return true;
  };
  const hasExactHypothesis = hasExactKeys(hypothesis, [
    "hypothesis_id",
    "node_run_id",
    "node_version",
    "input_hash",
    "statement",
    "supporting_evidence",
    "counter_evidence",
    "uncertainties",
    "final_root_cause",
  ]) &&
    Array.isArray(hypothesis.supporting_evidence) &&
    hypothesis.supporting_evidence.every(evidenceHasExactShape) &&
    Array.isArray(hypothesis.counter_evidence) &&
    hypothesis.counter_evidence.every(evidenceHasExactShape);
  return hasExactImprovement && hasExactHypothesis;
}

export function snapshotW6AtomicTransition(input: unknown): W6AtomicTransition {
  let snapshot: JsonValue;
  try {
    snapshot = snapshotW6TransitionJsonValue(input, 0, new WeakSet<object>());
  } catch (error) {
    const reason = error instanceof W6TransitionPlainJsonBoundaryError
      ? error.message
      : "snapshot failed";
    throw new Error(`W6 transition plain JSON boundary rejected: ${reason}`);
  }
  if (typeof snapshot !== "object" || snapshot === null || Array.isArray(snapshot)) {
    throw new Error("W6 transition plain JSON boundary rejected: command must be a plain object");
  }
  const transition = snapshot as unknown as W6AtomicTransition;
  if (!hasExactW6TransitionShape(transition)) {
    throw new Error("W6 closed transition command is invalid, including its exact nested shapes");
  }
  return transition;
}

function snapshotW6ValidationJson(input: unknown, label: string): JsonValue {
  try {
    return snapshotW6TransitionJsonValue(input, 0, new WeakSet<object>());
  } catch (error) {
    const reason = error instanceof W6TransitionPlainJsonBoundaryError
      ? error.message
      : "snapshot failed";
    throw new Error(`W6 ${label} plain JSON boundary rejected: ${reason}`);
  }
}

export function createW6N5ValidationFingerprint(
  request: AiNodeRunRequest<JsonValue>,
  envelope: AiNodeEnvelope<JsonValue>,
): string {
  const requestSnapshot = snapshotW6ValidationJson(request, "N5 request");
  const envelopeSnapshot = snapshotW6ValidationJson(envelope, "N5 envelope");
  return createWorkflowEventFingerprint({
    node: "N5",
    mode: "cross_event_clustering",
    request: requestSnapshot,
    envelope: envelopeSnapshot,
  });
}

function expectedN6RootCauseRecord(
  envelope: AiNodeEnvelope<N6RootCausePayload>,
): NonNullable<RuntimeProblemCluster["root_cause_hypothesis"]> {
  const payload = envelope.payload;
  if (
    !payload ||
    payload.hypotheses.length !== 1 ||
    payload.human_review_required !== true ||
    payload.final_root_cause !== false
  ) {
    throw new Error("W6 N6 validation requires exactly one controlled non-final hypothesis");
  }
  const hypothesis = payload.hypotheses[0];
  const selectEvidence = (indices: number[]): EvidenceSpan[] => indices.map((index) => {
    const span = envelope.evidence_spans[index];
    if (!span) throw new Error(`W6 N6 validation references missing evidence ${index}`);
    return { ...span };
  });
  return {
    hypothesis_id: hypothesis.hypothesis_id,
    node_run_id: envelope.run_id,
    node_version: AI_NODE_DEFINITIONS.N6_ROOT_CAUSE.version,
    input_hash: envelope.input_hash,
    statement: hypothesis.statement,
    supporting_evidence: selectEvidence(hypothesis.supporting_evidence_indices),
    counter_evidence: selectEvidence(hypothesis.counter_evidence_indices),
    uncertainties: [...hypothesis.uncertainties],
    final_root_cause: false,
  };
}

function validateW6AiValidationGrantIssue(
  rawInput: W6AiValidationGrantIssueInput,
  approvedN6CatalogFingerprint: string,
): W6AiValidationGrantClaims {
  const issueSnapshot = snapshotW6ValidationJson(rawInput, "AI validation issue") as Record<string, JsonValue>;
  if (
    typeof issueSnapshot !== "object" ||
    issueSnapshot === null ||
    Array.isArray(issueSnapshot) ||
    !hasExactKeys(issueSnapshot, [
      "event_id",
      "command_fingerprint",
      "transition",
      "request",
      "envelope",
    ]) ||
    !isNonEmptyString(issueSnapshot.event_id) ||
    !/^[a-f0-9]{64}$/iu.test(String(issueSnapshot.command_fingerprint))
  ) {
    throw new Error("W6 AI validation issue has an invalid exact boundary");
  }
  const transition = snapshotW6AtomicTransition(issueSnapshot.transition);
  const request = issueSnapshot.request as unknown as AiNodeRunRequest<JsonValue>;
  const requestValidation = validateNodeRequestDefinition(request);
  if (!requestValidation.valid) {
    throw new Error(`W6 AI request is invalid: ${requestValidation.errors.join("; ")}`);
  }
  const envelopeBoundary = validateAiNodeEnvelope(issueSnapshot.envelope);
  if (!envelopeBoundary.valid) {
    throw new Error(`W6 AI envelope is invalid: ${envelopeBoundary.errors.join("; ")}`);
  }
  const envelope = envelopeBoundary.value as AiNodeEnvelope<JsonValue>;
  const candidate = validateNodeCandidate(request, {
    payload: envelope.payload,
    evidence_spans: envelope.evidence_spans,
    missing_fields: envelope.missing_fields,
    confidence: envelope.confidence,
    status: envelope.status,
  });
  if (
    !candidate.valid ||
    envelope.node !== request.node ||
    envelope.mode !== request.mode ||
    envelope.version !== request.version ||
    !sameJson(envelope.object_ref, request.object_ref) ||
    envelope.input_hash !== createAiInputHash(request) ||
    envelope.status !== "ok" ||
    envelope.validation.valid !== true ||
    envelope.validation.errors.length !== 0 ||
    envelope.human_revision.state !== "none" ||
    envelope.payload === null
  ) {
    throw new Error(`W6 AI validation did not produce one exact bound result: ${candidate.errors.join("; ")}`);
  }
  const binding = createW6AuthorizationBinding(transition);
  const base = {
    workflow: "W6" as const,
    event_id: issueSnapshot.event_id as string,
    command_fingerprint: issueSnapshot.command_fingerprint as string,
    case_ids: [...transition.case_ids],
    cluster_id: transition.cluster_id,
    improvement_id: transition.improvement_id as string,
    expected_cluster_fingerprint: transition.expected_cluster_fingerprint,
    expected_improvement_fingerprint: transition.expected_improvement_fingerprint,
    authorization_target_fingerprint: binding.target_fingerprint,
    transition_fingerprint: createWorkflowEventFingerprint(transition as unknown as JsonValue),
    request_fingerprint: createWorkflowEventFingerprint(request as unknown as JsonValue),
    envelope_fingerprint: createWorkflowEventFingerprint(envelope as unknown as JsonValue),
    node_run_id: envelope.run_id,
    input_hash: envelope.input_hash,
  };

  if (transition.action === "start_improvement") {
    if (
      request.node !== "N6" ||
      request.mode !== AI_NODE_DEFINITIONS.N6_ROOT_CAUSE.mode ||
      request.version !== AI_NODE_DEFINITIONS.N6_ROOT_CAUSE.version ||
      request.object_ref.object_type !== "cluster" ||
      request.object_ref.object_id !== transition.cluster_id ||
      binding.phase !== "improvement" ||
      binding.action !== "start_improvement" ||
      transition.improvement_id === null ||
      transition.expected_improvement_fingerprint !== null
    ) {
      throw new Error("W6 N6 validation is not bound to start_improvement");
    }
    const input = asPlainRecord(request.input);
    const issueCluster = asPlainRecord(input?.issue_cluster);
    if (
      !issueCluster ||
      issueCluster.cluster_id !== transition.cluster_id ||
      issueCluster.status !== "待审核" ||
      !sameJson(issueCluster.member_case_ids, transition.case_ids)
    ) {
      throw new Error("W6 N6 request is not bound to the reviewed cluster membership");
    }
    const catalog = input?.hypothesis_catalog as JsonValue;
    const catalogFingerprint = createWorkflowEventFingerprint(catalog);
    if (catalogFingerprint !== approvedN6CatalogFingerprint) {
      throw new Error("W6 N6 request does not use the approved controlled hypothesis catalog");
    }
    const expectedRootCause = expectedN6RootCauseRecord(
      envelope as AiNodeEnvelope<N6RootCausePayload>,
    );
    if (!sameJson(expectedRootCause, transition.root_cause_hypothesis)) {
      throw new Error("W6 N6 transition root cause is not the deterministic validated envelope projection");
    }
    return {
      ...base,
      phase: "improvement",
      action: "start_improvement",
      node: "N6",
      mode: "root_cause_hypothesis",
      version: AI_NODE_DEFINITIONS.N6_ROOT_CAUSE.version,
      catalog_fingerprint: catalogFingerprint,
      root_cause_fingerprint: createWorkflowEventFingerprint(expectedRootCause as unknown as JsonValue),
      n5_candidate_fingerprint: null,
      validator_version: "w6-n6-validation-v1",
    };
  }

  if (transition.action !== "intake_active_observation_recurrence") {
    throw new Error("W6 AI validation grant is action-scoped to N6 start or N5 active intake");
  }
  const payload = envelope.payload as N5CrossEventPayload;
  const selected = payload.cluster_candidate;
  const memberCaseIds = selected.member_cases
    .map((entry) => entry.case_id)
    .sort((left, right) => left.localeCompare(right));
  const n5ValidationFingerprint = createW6N5ValidationFingerprint(request, envelope);
  if (
    request.node !== "N5" ||
    request.mode !== AI_NODE_DEFINITIONS.N5_CROSS_EVENT.mode ||
    request.version !== AI_NODE_DEFINITIONS.N5_CROSS_EVENT.version ||
    request.object_ref.object_type !== "case" ||
    !transition.triggering_case_ids.includes(request.object_ref.object_id) ||
    binding.phase !== "recurrence" ||
    binding.action !== "intake_active_observation_recurrence" ||
    transition.improvement_id === null ||
    selected.candidate_kind !== "existing_cluster" ||
    selected.suggested_cluster_id !== transition.cluster_id ||
    !sameJson(memberCaseIds, transition.case_ids) ||
    payload.human_review_required !== true ||
    payload.automatic_merge !== false ||
    payload.automatic_case_relink !== false ||
    transition.n5_validation_fingerprint !== n5ValidationFingerprint
  ) {
    throw new Error("W6 N5 active-intake validation is not bound to the exact existing cluster union");
  }
  return {
    ...base,
    phase: "recurrence",
    action: "intake_active_observation_recurrence",
    node: "N5",
    mode: "cross_event_clustering",
    version: AI_NODE_DEFINITIONS.N5_CROSS_EVENT.version,
    catalog_fingerprint: null,
    root_cause_fingerprint: null,
    n5_candidate_fingerprint: n5ValidationFingerprint,
    validator_version: "w6-n5-active-intake-validation-v1",
  };
}

export function createW6AuthorizationBinding(input: unknown): {
  phase: W6Phase;
  case_ids: string[];
  cluster_id: string;
  improvement_id: string | null;
  action: W6AuthorizedAction;
  target_fingerprint: string;
} {
  const transition = snapshotW6AtomicTransition(input);
  if (!W6_AUTHORIZED_ACTIONS.includes(transition.action as W6AuthorizedAction)) {
    throw new Error(
      `W6 ${transition.action} is a deterministic clock action and has no human authorization binding`,
    );
  }
  const action = transition.action as W6AuthorizedAction;
  const caseIds = sortedUniqueStrings(transition.case_ids);
  const phase = w6PhaseForAction(action);
  return {
    phase,
    case_ids: caseIds,
    cluster_id: transition.cluster_id,
    improvement_id: transition.improvement_id,
    action,
    target_fingerprint: createWorkflowEventFingerprint({
      phase,
      action,
      case_ids: caseIds,
      cluster_id: transition.cluster_id,
      improvement_id: transition.improvement_id,
      transition: transition as unknown as JsonValue,
    }),
  };
}

export function createW6RecurrenceRequestAuthorizationBinding(
  input: W6RecurrenceRequestAuthorizationInput,
): {
  phase: "recurrence";
  case_ids: string[];
  cluster_id: string;
  improvement_id: string;
  action: "reopen_recurrence";
  authorization_target: JsonValue;
  target_fingerprint: string;
} {
  const caseIds = sortedUniqueStrings(input.case_ids);
  const triggeringCaseIds = sortedUniqueStrings(input.triggering_case_ids);
  if (
    caseIds.length === 0 ||
    triggeringCaseIds.length === 0 ||
    !isNonEmptyString(input.cluster_id) ||
    !isNonEmptyString(input.improvement_id) ||
    !isNonEmptyString(input.reason)
  ) {
    throw new Error("W6 recurrence request authorization binding is invalid");
  }
  const authorizationTarget: JsonValue = {
    action: "reopen_recurrence",
    authorization_kind: "new_recurrence_request",
    case_ids: caseIds,
    cluster_id: input.cluster_id,
    improvement_id: input.improvement_id,
    triggering_case_ids: triggeringCaseIds,
    reason: input.reason,
  };
  return {
    phase: "recurrence",
    case_ids: caseIds,
    cluster_id: input.cluster_id,
    improvement_id: input.improvement_id,
    action: "reopen_recurrence",
    authorization_target: authorizationTarget,
    target_fingerprint: createWorkflowEventFingerprint(authorizationTarget),
  };
}

function hasValidW6AuthorizationClaims(record: W6AuthorizationGrantClaims): boolean {
  return hasExactKeys(record, [
    "workflow",
    "event_id",
    "phase",
    "case_ids",
    "cluster_id",
    "improvement_id",
    "action",
    "target_fingerprint",
    "command_fingerprint",
    "principal",
    "policy_version",
  ]) &&
    record.workflow === "W6" &&
    isNonEmptyString(record.event_id) &&
    ["cluster_review", "improvement", "observation", "recurrence"].includes(record.phase) &&
    isSortedUniqueNonEmptyStrings(record.case_ids) &&
    isNonEmptyString(record.cluster_id) &&
    (record.improvement_id === null || isNonEmptyString(record.improvement_id)) &&
    W6_AUTHORIZED_ACTIONS.includes(record.action) &&
    /^[a-f0-9]{64}$/iu.test(record.target_fingerprint) &&
    /^[a-f0-9]{64}$/iu.test(record.command_fingerprint) &&
    hasTrustedPrincipal(record.principal) &&
    isNonEmptyString(record.policy_version);
}

function hasValidW6AiValidationClaims(record: W6AiValidationGrantClaims): boolean {
  if (!hasExactKeys(record, [
    "workflow",
    "event_id",
    "command_fingerprint",
    "phase",
    "action",
    "case_ids",
    "cluster_id",
    "improvement_id",
    "expected_cluster_fingerprint",
    "expected_improvement_fingerprint",
    "authorization_target_fingerprint",
    "transition_fingerprint",
    "request_fingerprint",
    "envelope_fingerprint",
    "catalog_fingerprint",
    "node",
    "mode",
    "version",
    "node_run_id",
    "input_hash",
    "root_cause_fingerprint",
    "n5_candidate_fingerprint",
    "validator_version",
  ])) return false;
  const fingerprints = [
    record.command_fingerprint,
    record.expected_cluster_fingerprint,
    record.authorization_target_fingerprint,
    record.transition_fingerprint,
    record.request_fingerprint,
    record.envelope_fingerprint,
    record.input_hash,
  ];
  if (
    record.workflow !== "W6" ||
    !isNonEmptyString(record.event_id) ||
    !isSortedUniqueNonEmptyStrings(record.case_ids) ||
    !isNonEmptyString(record.cluster_id) ||
    !isNonEmptyString(record.improvement_id) ||
    !isNonEmptyString(record.node_run_id) ||
    fingerprints.some((value) => !/^[a-f0-9]{64}$/iu.test(value)) ||
    (
      record.expected_improvement_fingerprint !== null &&
      !/^[a-f0-9]{64}$/iu.test(record.expected_improvement_fingerprint)
    )
  ) return false;
  if (record.action === "start_improvement") {
    return record.phase === "improvement" &&
      record.node === "N6" &&
      record.mode === "root_cause_hypothesis" &&
      record.version === AI_NODE_DEFINITIONS.N6_ROOT_CAUSE.version &&
      record.expected_improvement_fingerprint === null &&
      typeof record.catalog_fingerprint === "string" &&
      /^[a-f0-9]{64}$/iu.test(record.catalog_fingerprint) &&
      typeof record.root_cause_fingerprint === "string" &&
      /^[a-f0-9]{64}$/iu.test(record.root_cause_fingerprint) &&
      record.n5_candidate_fingerprint === null &&
      record.validator_version === "w6-n6-validation-v1";
  }
  return record.action === "intake_active_observation_recurrence" &&
    record.phase === "recurrence" &&
    record.node === "N5" &&
    record.mode === "cross_event_clustering" &&
    record.version === AI_NODE_DEFINITIONS.N5_CROSS_EVENT.version &&
    typeof record.expected_improvement_fingerprint === "string" &&
    /^[a-f0-9]{64}$/iu.test(record.expected_improvement_fingerprint) &&
    record.catalog_fingerprint === null &&
    record.root_cause_fingerprint === null &&
    typeof record.n5_candidate_fingerprint === "string" &&
    /^[a-f0-9]{64}$/iu.test(record.n5_candidate_fingerprint) &&
    record.validator_version === "w6-n5-active-intake-validation-v1";
}

function authorizationTargetFingerprint(value: JsonValue): string {
  return createWorkflowEventFingerprint(value);
}

function hasSyntheticCaseBoundary(record: FrontHalfCase): boolean {
  return record.schema_version === CANONICAL_SCHEMA_VERSION &&
    record.data_scope === "synthetic_experiment" &&
    record.evidence_class === "synthetic_experiment" &&
    record.source_kind === "scenario_runtime" &&
    record.record_mode === "scenario_runtime" &&
    record.source_name === "synthetic_experiment" &&
    record.legacy_id === "not_applicable_scenario_runtime";
}

function hasSyntheticFeedbackBoundary(record: StoredRawFeedback): boolean {
  return record.processing_status === "已建案" &&
    record.request.schema_version === CANONICAL_SCHEMA_VERSION &&
    record.request.data_scope === "synthetic_experiment" &&
    record.request.evidence_class === "synthetic_experiment" &&
    record.request.source_tenant_scope === "competition-synthetic" &&
    record.request.authorization_scope === "synthetic_demo_only" &&
    record.idempotency_key === record.request.idempotency_key &&
    isIsoTimestamp(record.request.received_at);
}

function hasSyntheticWorkOrderBoundary(record: RuntimeWorkOrder): boolean {
  return record.schema_version === CANONICAL_SCHEMA_VERSION &&
    record.data_scope === "synthetic_experiment" &&
    record.evidence_class === "synthetic_experiment" &&
    record.source_kind === "scenario_runtime" &&
    record.source_name === "synthetic_experiment" &&
    record.legacy_id === "not_applicable_scenario_runtime" &&
    record.legacy_recorded_at === null &&
    record.sla_reset_count === 0 &&
    isIsoTimestamp(record.due_at);
}

function hasSyntheticW6ClusterBoundary(record: RuntimeProblemCluster): boolean {
  return record.schema_version === CANONICAL_SCHEMA_VERSION &&
    record.data_scope === "synthetic_experiment" &&
    record.evidence_class === "synthetic_experiment" &&
    record.source_kind === "scenario_runtime" &&
    record.source_name === "synthetic_experiment" &&
    isNonEmptyString(record.cluster_id) &&
    isNonEmptyString(record.name) &&
    isNonEmptyString(record.category_domain) &&
    isSortedUniqueNonEmptyStrings(record.member_case_ids) &&
    record.member_case_ids.length >= 2 &&
    record.clustering_mode === "cross_event" &&
    record.clustering_version === "N5-cross-event-1.0.0-draft.2" &&
    isNonEmptyString(record.proposal_id) &&
    Number.isInteger(record.recurrence_count) &&
    record.recurrence_count >= 0 &&
    isIsoTimestamp(record.created_at) &&
    isIsoTimestamp(record.updated_at);
}

function hasSyntheticW6ImprovementBoundary(record: RuntimeImprovementProject): boolean {
  return record.schema_version === CANONICAL_SCHEMA_VERSION &&
    record.data_scope === "synthetic_experiment" &&
    record.evidence_class === "synthetic_experiment" &&
    record.source_kind === "scenario_runtime" &&
    record.source_name === "synthetic_experiment" &&
    isNonEmptyString(record.improvement_id) &&
    isNonEmptyString(record.cluster_id) &&
    isNonEmptyString(record.version) &&
    isNonEmptyString(record.owner_role) &&
    isNonEmptyString(record.measure) &&
    sameJson(record.observation_window_days, [7, 30]) &&
    ["real", "test", "synthetic_history"].includes(record.clock_source) &&
    isNonEmptyString(record.metric_formula) &&
    isIsoTimestamp(record.created_at) &&
    isIsoTimestamp(record.updated_at);
}

function hasValidW6RootCauseHypothesis(
  record: RuntimeProblemCluster["root_cause_hypothesis"],
): record is NonNullable<RuntimeProblemCluster["root_cause_hypothesis"]> {
  return record !== null &&
    isNonEmptyString(record.hypothesis_id) &&
    isNonEmptyString(record.node_run_id) &&
    record.node_version === "N6-root-cause-1.0.0-draft.3" &&
    /^[a-f0-9]{64}$/iu.test(record.input_hash) &&
    isNonEmptyString(record.statement) &&
    record.supporting_evidence.length >= 2 &&
    record.supporting_evidence.every((entry) => isNonEmptyString(entry.source_ref) && isNonEmptyString(entry.quote)) &&
    record.counter_evidence.length >= 1 &&
    record.counter_evidence.every((entry) => isNonEmptyString(entry.source_ref) && isNonEmptyString(entry.quote)) &&
    record.uncertainties.length >= 1 &&
    record.uncertainties.every(isNonEmptyString) &&
    record.final_root_cause === false;
}

function w6ClusterFingerprint(record: RuntimeProblemCluster): string {
  return createWorkflowEventFingerprint(record as unknown as JsonValue);
}

function w6ImprovementFingerprint(record: RuntimeImprovementProject): string {
  return createWorkflowEventFingerprint(record as unknown as JsonValue);
}

function w6MembershipKey(caseIds: readonly string[]): string {
  return createWorkflowEventFingerprint({ case_ids: sortedUniqueStrings(caseIds) });
}

function w6RecurrenceSemanticFingerprint(
  input: Extract<W6AtomicTransition, { action: "reopen_recurrence" }>,
): string {
  return createWorkflowEventFingerprint({
    action: input.action,
    case_ids: sortedUniqueStrings(input.case_ids),
    cluster_id: input.cluster_id,
    improvement_id: input.improvement_id,
    cycle_id: input.cycle_id,
    triggering_case_ids: sortedUniqueStrings(input.triggering_case_ids),
    clock_source: input.clock_source,
    occurred_at: input.occurred_at,
    reason: input.reason,
  });
}

function exactWindowTimestamp(openedAt: string, days: 7 | 30): string {
  return new Date(Date.parse(openedAt) + days * 24 * 60 * 60 * 1000).toISOString();
}

function violatesW6ActiveIntakeObservationWindow(input: {
  opened_at: string;
  occurred_at: string;
  case_closed_at: string;
  day7_checkpoint_exists: boolean;
}): boolean {
  const openedAt = Date.parse(input.opened_at);
  const occurredAt = Date.parse(input.occurred_at);
  const closedAt = Date.parse(input.case_closed_at);
  const day7ExpectedAt = Date.parse(exactWindowTimestamp(input.opened_at, 7));
  const day30ExpectedAt = Date.parse(exactWindowTimestamp(input.opened_at, 30));
  const day7IsSealed = input.day7_checkpoint_exists || occurredAt > day7ExpectedAt;
  return closedAt <= openedAt ||
    closedAt > Math.min(occurredAt, day30ExpectedAt) ||
    (day7IsSealed && closedAt <= day7ExpectedAt);
}

function asPlainRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null
    ? value as Record<string, unknown>
    : null;
}

function w6CaseSnapshot(
  caseRecord: FrontHalfCase,
  workOrder: RuntimeWorkOrder,
  closureProvenance: W5ClosureProvenance,
  feedbackRecords: StoredRawFeedback[],
): W6CaseMembershipSnapshot {
  return {
    case_id: caseRecord.case_id,
    case_fingerprint: createWorkflowEventFingerprint(caseRecord as unknown as JsonValue),
    work_order_id: workOrder.work_order_id,
    work_order_fingerprint: createWorkflowEventFingerprint(workOrder as unknown as JsonValue),
    w5_closure_fingerprint: closureProvenance.w5_closure_fingerprint,
    feedback_links: feedbackRecords
      .map((feedback) => ({
        feedback_id: feedback.feedback_id,
        feedback_fingerprint: createWorkflowEventFingerprint(feedback as unknown as JsonValue),
      }))
      .sort((left, right) => left.feedback_id.localeCompare(right.feedback_id)),
  };
}

function w5CaseImmutableMaterial(record: FrontHalfCase): JsonValue {
  const mutableFields = new Set(["status", "updated_at", "workflow_readiness", "closed_at"]);
  return Object.fromEntries(
    Object.entries(record).filter(([field]) => !mutableFields.has(field)),
  ) as JsonValue;
}

function w5WorkOrderImmutableMaterial(record: RuntimeWorkOrder): JsonValue {
  const mutableFields = new Set([
    "status",
    "updated_at",
    "completed_at",
    "disposition_evidence",
    "validation_result",
  ]);
  return Object.fromEntries(
    Object.entries(record).filter(([field]) => !mutableFields.has(field)),
  ) as JsonValue;
}

interface W5ClosureChain {
  evidence: W5EvidenceSubmission;
  draft: W5ReplyDraft;
  review: W5ReplyReview;
  follow_up: W5FollowUp;
  closure: W5ClosureDecision;
}

function resolveW5ClosureChain(
  history: W5History,
  caseId: string,
  workOrderId: string,
): W5ClosureChain | null {
  const closure = history.closure_decisions.at(-1);
  const followUp = history.follow_ups.at(-1);
  const review = history.reply_reviews.at(-1);
  const draft = review
    ? history.reply_drafts.find((record) => record.draft_id === review.draft_id)
    : undefined;
  const evidence = draft
    ? [...history.evidence_submissions]
        .reverse()
        .find((record) => record.event_id === draft.event_id && record.completeness === "complete")
    : undefined;
  if (
    !evidence ||
    !draft ||
    !review ||
    !followUp ||
    !closure ||
    evidence.case_id !== caseId ||
    evidence.work_order_id !== workOrderId ||
    draft.case_id !== caseId ||
    draft.work_order_id !== workOrderId ||
    review.case_id !== caseId ||
    review.work_order_id !== workOrderId ||
    followUp.case_id !== caseId ||
    followUp.work_order_id !== workOrderId ||
    closure.case_id !== caseId ||
    closure.work_order_id !== workOrderId ||
    review.decision !== "approve_for_manual_delivery" ||
    !isNonEmptyString(review.manual_delivery_reference) ||
    followUp.outcome !== "resolved" ||
    closure.decision !== "close" ||
    Date.parse(evidence.submitted_at) > Date.parse(draft.created_at) ||
    Date.parse(draft.created_at) > Date.parse(review.decided_at) ||
    Date.parse(review.decided_at) > Date.parse(followUp.recorded_at) ||
    Date.parse(followUp.recorded_at) > Date.parse(closure.decided_at)
  ) {
    return null;
  }
  return { evidence, draft, review, follow_up: followUp, closure };
}

function w5ClosureProvenanceFingerprint(
  record: Omit<W5ClosureProvenance, "w5_closure_fingerprint">,
): string {
  return createWorkflowEventFingerprint({
    transition: "closure_closed",
    ...record,
  } as unknown as JsonValue);
}

function createW5ClosureProvenance(
  caseRecord: FrontHalfCase,
  workOrder: RuntimeWorkOrder,
  history: W5History,
): W5ClosureProvenance {
  const chain = resolveW5ClosureChain(history, caseRecord.case_id, workOrder.work_order_id);
  if (
    !chain ||
    caseRecord.status !== "已关闭" ||
    caseRecord.workflow_readiness !== "closed" ||
    workOrder.status !== "已完成" ||
    workOrder.validation_result !== "passed" ||
    workOrder.disposition_evidence !== chain.evidence.text ||
    caseRecord.closed_at === null ||
    workOrder.completed_at === null ||
    caseRecord.closed_at !== chain.closure.decided_at ||
    workOrder.completed_at !== chain.closure.decided_at ||
    caseRecord.updated_at !== chain.closure.decided_at ||
    workOrder.updated_at !== chain.closure.decided_at
  ) {
    throw new Error(
      "W5 closure provenance requires the complete evidence, approved reply, resolved follow-up, human-close chain, and one authoritative closure timestamp",
    );
  }
  const material: Omit<W5ClosureProvenance, "w5_closure_fingerprint"> = {
    case_id: caseRecord.case_id,
    work_order_id: workOrder.work_order_id,
    evidence_submission_id: chain.evidence.submission_id,
    reply_draft_id: chain.draft.draft_id,
    reply_review_id: chain.review.review_id,
    follow_up_id: chain.follow_up.follow_up_id,
    closure_decision_id: chain.closure.decision_id,
    closure_event_id: chain.closure.event_id,
    closed_at: chain.closure.decided_at,
    case_fingerprint: createWorkflowEventFingerprint(caseRecord as unknown as JsonValue),
    work_order_fingerprint: createWorkflowEventFingerprint(workOrder as unknown as JsonValue),
    w5_history_fingerprint: createWorkflowEventFingerprint(history as unknown as JsonValue),
  };
  return {
    ...material,
    w5_closure_fingerprint: w5ClosureProvenanceFingerprint(material),
  };
}

function hasValidW5AuthorizationEvidence(
  record: { principal: W3AuthorizedPrincipal; authorization_policy_version: string },
): boolean {
  return hasTrustedPrincipal(record.principal) && isNonEmptyString(record.authorization_policy_version);
}

interface W5TransitionAuthorizationBinding {
  action: W5AuthorizedAction;
  target: JsonValue;
  authorization_record: {
    principal: W3AuthorizedPrincipal;
    authorization_policy_version: string;
  };
}

function w5TransitionAuthorizationBinding(
  input: W5AtomicTransition,
): W5TransitionAuthorizationBinding | null {
  if (["evidence_incomplete", "evidence_ready", "n7_failed"].includes(input.transition)) {
    const evidence = input.append.evidence_submission;
    if (!evidence) return null;
    if (evidence.kind === "evidence_supplement") {
      return {
        action: "supplement_evidence",
        target: {
          evidence_submission_id: evidence.submission_id,
          replaces_submission_id: evidence.replaces_submission_id,
        },
        authorization_record: evidence,
      };
    }
    return {
      action: "submit_closure_request",
      target: { evidence_submission_id: evidence.submission_id },
      authorization_record: evidence,
    };
  }
  if (input.transition === "reply_approved" || input.transition === "reply_returned") {
    const review = input.append.reply_review;
    return review
      ? {
          action: "review_reply",
          target: { draft_id: review.draft_id, decision: review.decision },
          authorization_record: review,
        }
      : null;
  }
  if (input.transition === "follow_up_resolved" || input.transition === "follow_up_abnormal") {
    const followUp = input.append.follow_up;
    return followUp
      ? {
          action: "record_follow_up",
          target: { outcome: followUp.outcome, follow_up_reference: followUp.follow_up_reference },
          authorization_record: followUp,
        }
      : null;
  }
  if (input.transition === "closure_closed" || input.transition === "closure_returned") {
    const closure = input.append.closure_decision;
    return closure
      ? {
          action: "decide_closure",
          target: { decision: closure.decision },
          authorization_record: closure,
        }
      : null;
  }
  return null;
}

function hasValidW5EvidenceSubmission(record: W5EvidenceSubmission): boolean {
  return isNonEmptyString(record.submission_id) &&
    isNonEmptyString(record.event_id) &&
    isNonEmptyString(record.case_id) &&
    isNonEmptyString(record.work_order_id) &&
    (record.kind === "closure_request" || record.kind === "evidence_supplement") &&
    (record.replaces_submission_id === null || isNonEmptyString(record.replaces_submission_id)) &&
    isNonEmptyString(record.source_ref) &&
    typeof record.text === "string" &&
    record.artifact_refs.every(isNonEmptyString) &&
    record.reviewed_facts.every((fact) =>
      isNonEmptyString(fact.source_ref) &&
      isNonEmptyString(fact.text) &&
      fact.review_status === "approved" &&
      isNonEmptyString(fact.review_ref)
    ) &&
    (record.completeness === "complete" || record.completeness === "incomplete") &&
    record.missing_fields.every(isNonEmptyString) &&
    hasValidW5AuthorizationEvidence(record) &&
    isIsoTimestamp(record.submitted_at);
}

function hasValidW5ReplyDraft(record: W5ReplyDraft): boolean {
  return isNonEmptyString(record.draft_id) &&
    isNonEmptyString(record.event_id) &&
    isNonEmptyString(record.case_id) &&
    isNonEmptyString(record.work_order_id) &&
    isNonEmptyString(record.node_run_id) &&
    record.node_version === AI_NODE_DEFINITIONS.N7_CUSTOMER_REPLY.version &&
    /^[a-f0-9]{64}$/iu.test(record.input_hash) &&
    record.draft_kind === "customer_reply" &&
    isNonEmptyString(record.draft) &&
    record.citations.length > 0 &&
    record.citations.every((citation) =>
      isNonEmptyString(citation.knowledge_id) &&
      isNonEmptyString(citation.version) &&
      citation.evidence_span_indices.length > 0 &&
      citation.evidence_span_indices.every((index) => Number.isInteger(index) && index >= 0)
    ) &&
    record.supporting_evidence_indices.length > 0 &&
    record.supporting_evidence_indices.every((index) =>
      Number.isInteger(index) && index >= 0 && index < record.evidence_spans.length
    ) &&
    record.evidence_spans.every((span) => isNonEmptyString(span.source_ref) && isNonEmptyString(span.quote)) &&
    record.publication_state === "draft_unpublished" &&
    record.human_review_required === true &&
    record.automatic_publication === false &&
    isIsoTimestamp(record.created_at);
}

function hasSyntheticVehicleBoundary(record: R3VehicleReference | undefined): record is R3VehicleReference {
  return record !== undefined &&
    record.data_scope === "synthetic_experiment" &&
    record.evidence_class === "synthetic_experiment" &&
    record.source_kind === "scenario_runtime" &&
    record.controls_available === false &&
    isNonEmptyString(record.vehicle_id) &&
    isNonEmptyString(record.station_id) &&
    isNonEmptyString(record.source_ref) &&
    isNonEmptyString(record.evidence_text);
}

function hasSyntheticTaskBoundary(record: R3DeliveryTaskReference | undefined): record is R3DeliveryTaskReference {
  return record !== undefined &&
    record.data_scope === "synthetic_experiment" &&
    record.evidence_class === "synthetic_experiment" &&
    record.source_kind === "scenario_runtime" &&
    record.state_mutable_by_neoloop === false &&
    isNonEmptyString(record.task_id) &&
    isNonEmptyString(record.vehicle_id) &&
    isNonEmptyString(record.station_id) &&
    isNonEmptyString(record.source_ref) &&
    isNonEmptyString(record.evidence_text);
}

function hasSyntheticStationBoundary(record: R3StationReference | undefined): record is R3StationReference {
  return record !== undefined &&
    record.data_scope === "synthetic_experiment" &&
    record.evidence_class === "synthetic_experiment" &&
    record.source_kind === "scenario_runtime" &&
    isNonEmptyString(record.station_id) &&
    isNonEmptyString(record.source_ref) &&
    isNonEmptyString(record.evidence_text);
}

function sameFormalDecisionMaterial(
  left: W3FormalEntityDecision,
  right: W3FormalEntityDecision,
): boolean {
  return left.action === right.action &&
    left.authorization_state === right.authorization_state &&
    left.authorization_policy_version === right.authorization_policy_version &&
    sameJson(left.principal, right.principal) &&
    sameJson(left.proposal_ref, right.proposal_ref) &&
    sameJson(left.formal_entity, right.formal_entity) &&
    sameJson(left.evidence_spans, right.evidence_spans);
}

function sameRoutingDecisionMaterial(
  left: W3RoutingDecision,
  right: W3RoutingDecision,
): boolean {
  return left.action === right.action &&
    left.authorization_state === right.authorization_state &&
    left.authorization_policy_version === right.authorization_policy_version &&
    sameJson(left.principal, right.principal) &&
    sameJson(left.proposal_ref, right.proposal_ref) &&
    sameJson(left.rule_ref, right.rule_ref) &&
    left.candidate_team === right.candidate_team &&
    left.candidate_logical_role === right.candidate_logical_role &&
    sameJson(left.supporting_evidence_indices, right.supporting_evidence_indices) &&
    sameJson(left.counter_evidence_indices, right.counter_evidence_indices) &&
    sameJson(left.uncertainties, right.uncertainties) &&
    sameJson(left.evidence_spans, right.evidence_spans);
}

function expectedFormalDecisionFingerprint(decision: W3FormalEntityDecision): string {
  return createWorkflowEventFingerprint({
    action: "confirm_formal_entity",
    case_id: decision.case_id,
    authorization_policy_version: decision.authorization_policy_version,
    principal: decision.principal as unknown as JsonValue,
    proposal_ref: decision.proposal_ref as unknown as JsonValue,
    formal_entity: decision.formal_entity as unknown as JsonValue,
  });
}

function expectedRoutingDecisionFingerprint(decision: W3RoutingDecision): string {
  return createWorkflowEventFingerprint({
    action: "confirm_routing",
    case_id: decision.case_id,
    authorization_policy_version: decision.authorization_policy_version,
    principal: decision.principal as unknown as JsonValue,
    proposal_ref: decision.proposal_ref as unknown as JsonValue,
    rule_ref: decision.rule_ref as unknown as JsonValue,
    candidate_team: decision.candidate_team,
    candidate_logical_role: decision.candidate_logical_role,
  });
}

interface InMemoryFrontHalfRepositoryOptions {
  reference_data?: Partial<R3ReferenceData>;
  w3_authorization_grant_consumer?: W3AuthorizationGrantConsumer;
  w5_authorization_grant_consumer?: W5AuthorizationGrantConsumer;
  w6_authorization_grant_consumer?: W6AuthorizationGrantConsumer;
  approved_n6_catalog?: JsonValue;
}

interface EventEntry {
  fingerprint: string;
  promise: Promise<WorkflowResult<JsonValue>>;
}

export class InMemoryFrontHalfRepository implements R3WorkflowRepository {
  readonly rawFeedbackByKey = new Map<string, StoredRawFeedback>();
  readonly rawFeedbackById = new Map<string, StoredRawFeedback>();
  readonly casesById = new Map<string, FrontHalfCase>();
  readonly caseByFeedbackId = new Map<string, string>();
  readonly sameEventChecksByCaseId = new Map<string, SameEventCheck>();
  readonly sameEventResolutionsByCaseId = new Map<string, SameEventHumanResolution>();
  readonly entityProposalsByCaseId = new Map<string, W3EntityProposal>();
  readonly formalEntityDecisionsByCaseId = new Map<string, W3FormalEntityDecision>();
  readonly routingProposalsByCaseId = new Map<string, W3RoutingProposal>();
  readonly routingDecisionsByCaseId = new Map<string, W3RoutingDecision>();
  readonly workOrdersById = new Map<string, RuntimeWorkOrder>();
  readonly workOrderByCaseId = new Map<string, string>();
  readonly w5EvidenceSubmissionsByCaseId = new Map<string, W5EvidenceSubmission[]>();
  readonly w5ReplyDraftsByCaseId = new Map<string, W5ReplyDraft[]>();
  readonly w5ReplyReviewsByCaseId = new Map<string, W5ReplyReview[]>();
  readonly w5FollowUpsByCaseId = new Map<string, W5FollowUp[]>();
  readonly w5ClosureDecisionsByCaseId = new Map<string, W5ClosureDecision[]>();
  readonly #w5ClosureProvenanceByCaseId = new Map<string, W5ClosureProvenance>();
  readonly #w6ClustersById = new Map<string, RuntimeProblemCluster>();
  readonly #w6ClusterIdByMembershipKey = new Map<string, string>();
  readonly #w6ClusterIdByCaseId = new Map<string, string>();
  readonly #w6ProposalsByClusterId = new Map<string, W6CrossEventProposal>();
  readonly #w6ImprovementsById = new Map<string, RuntimeImprovementProject>();
  readonly #w6HistoryEntriesByClusterId = new Map<string, W6HistoryEntry[]>();
  readonly #w6ObservationCyclesByClusterId = new Map<string, W6ObservationCycle[]>();
  readonly #w6ActiveRecurrenceIntakesByClusterId = new Map<
    string,
    W6ActiveObservationRecurrenceIntake[]
  >();
  readonly #w6ObservationCheckpointsByClusterId = new Map<string, W6ObservationCheckpoint[]>();
  readonly #w6ReceiptsByClusterId = new Map<string, W6CommitReceipt[]>();
  readonly #w6LatestReceiptIdByClusterId = new Map<string, string>();
  readonly #w6RecurrenceReceiptByKey = new Map<string, {
    receipt_id: string;
    semantic_fingerprint: string;
    stable_semantic_fingerprint: string | null;
  }>();
  readonly #w6AiValidationGrants = new WeakMap<object, {
    claims: W6AiValidationGrantClaims;
    consumed: boolean;
  }>();
  readonly vehiclesById = new Map<string, R3VehicleReference>();
  readonly deliveryTasksById = new Map<string, R3DeliveryTaskReference>();
  readonly stationsById = new Map<string, R3StationReference>();
  readonly routingRulesById = new Map<string, R3RoutingRuleReference>();
  readonly slaPoliciesById = new Map<string, R3SlaTargetReference>();
  private readonly workflowEventsById = new Map<string, EventEntry>();
  readonly #verifiedW3ArtifactFingerprints = new Map<string, string>();
  private readonly workflowEventContext = new AsyncLocalStorage<{
    event_id: string;
    fingerprint: string;
    owner: symbol;
  }>();
  private readonly caseLockContext = new AsyncLocalStorage<ReadonlyMap<string, symbol>>();
  private readonly workflowAuditLockContext = new AsyncLocalStorage<ReadonlyMap<string, symbol>>();
  private readonly w3AuthorizationContext = new AsyncLocalStorage<{
    claims: W3AuthorizationGrantClaims;
    owner: symbol;
  }>();
  private readonly w5AuthorizationContext = new AsyncLocalStorage<{
    claims: W5AuthorizationGrantClaims;
    owner: symbol;
  }>();
  private readonly w6AuthorizationContext = new AsyncLocalStorage<{
    claims: W6AuthorizationGrantClaims;
    owner: symbol;
  }>();
  private readonly w6AiValidationContext = new AsyncLocalStorage<{
    claims: W6AiValidationGrantClaims;
    owner: symbol;
  }>();
  private readonly w6ResourceLockContext = new AsyncLocalStorage<ReadonlyMap<string, symbol>>();
  private readonly activeW3AuthorizationOwners = new Set<symbol>();
  private readonly activeW5AuthorizationOwners = new Set<symbol>();
  private readonly activeW6AuthorizationOwners = new Set<symbol>();
  private readonly activeW6AiValidationOwners = new Set<symbol>();
  private readonly activeWorkflowEventOwners = new Map<string, symbol>();
  private readonly activeCaseLockOwners = new Map<string, symbol>();
  private readonly activeWorkflowAuditLockOwners = new Map<string, symbol>();
  private readonly caseTailsById = new Map<string, Promise<void>>();
  private readonly workflowAuditTailsByEventId = new Map<string, Promise<void>>();
  private readonly workOrderTailsById = new Map<string, Promise<void>>();
  private readonly w6ResourceTailsById = new Map<string, Promise<void>>();
  private readonly activeW6ResourceLockOwners = new Map<string, symbol>();
  private readonly w3AuthorizationGrantConsumer: W3AuthorizationGrantConsumer;
  private readonly w5AuthorizationGrantConsumer: W5AuthorizationGrantConsumer;
  private readonly w6AuthorizationGrantConsumer: W6AuthorizationGrantConsumer;
  private readonly approvedN6CatalogFingerprint: string | null;

  constructor(options: InMemoryFrontHalfRepositoryOptions = {}) {
    this.w3AuthorizationGrantConsumer = options.w3_authorization_grant_consumer ?? {
      consume: () => null,
    };
    this.w5AuthorizationGrantConsumer = options.w5_authorization_grant_consumer ?? {
      consume: () => null,
    };
    this.w6AuthorizationGrantConsumer = options.w6_authorization_grant_consumer ?? {
      consume: () => null,
    };
    this.approvedN6CatalogFingerprint = options.approved_n6_catalog === undefined
      ? null
      : createWorkflowEventFingerprint(
          snapshotW6ValidationJson(options.approved_n6_catalog, "approved N6 catalog"),
        );
    for (const record of options.reference_data?.vehicles ?? []) {
      this.vehiclesById.set(record.vehicle_id, cloneVehicle(record));
    }
    for (const record of options.reference_data?.delivery_tasks ?? []) {
      this.deliveryTasksById.set(record.task_id, cloneTask(record));
    }
    for (const record of options.reference_data?.stations ?? []) {
      this.stationsById.set(record.station_id, cloneStation(record));
    }
    for (const record of options.reference_data?.routing_rules ?? []) {
      this.routingRulesById.set(record.routing_rule_id, cloneRoutingRule(record));
    }
    for (const record of options.reference_data?.sla_policies ?? []) {
      this.slaPoliciesById.set(record.policy_id, cloneSlaPolicy(record));
    }
  }

  private storedFeedbackForCase(caseId: string): StoredRawFeedback | null {
    for (const [feedbackId, linkedCaseId] of this.caseByFeedbackId.entries()) {
      if (linkedCaseId !== caseId) continue;
      return this.rawFeedbackById.get(feedbackId) ?? null;
    }
    return null;
  }

  private hasSyntheticReferenceSet(caseRecord: FrontHalfCase): boolean {
    return caseRecord.entity_candidates.vehicle_ids.every((id) =>
      hasSyntheticVehicleBoundary(this.vehiclesById.get(id))
    ) && caseRecord.entity_candidates.task_ids.every((id) =>
      hasSyntheticTaskBoundary(this.deliveryTasksById.get(id))
    ) && caseRecord.entity_candidates.station_names.every((id) =>
      hasSyntheticStationBoundary(this.stationsById.get(id))
    );
  }

  private hasConsistentSyntheticEntity(
    formalEntity: NonNullable<FrontHalfCase["formal_entity"]>,
  ): boolean {
    const vehicle = this.vehiclesById.get(formalEntity.vehicle_id);
    const task = this.deliveryTasksById.get(formalEntity.task_id);
    const station = this.stationsById.get(formalEntity.station_id);
    return hasSyntheticVehicleBoundary(vehicle) &&
      hasSyntheticTaskBoundary(task) &&
      hasSyntheticStationBoundary(station) &&
      vehicle.station_id === station.station_id &&
      task.vehicle_id === vehicle.vehicle_id &&
      task.station_id === station.station_id;
  }

  private w3ArtifactKey(caseId: string, artifact: W3VerifiedArtifact): string {
    return `${artifact}:${caseId}`;
  }

  private currentW3ArtifactValue(caseId: string, artifact: W3VerifiedArtifact): JsonValue | null {
    const sameEventCheck = this.sameEventChecksByCaseId.get(caseId);
    const resolution = this.sameEventResolutionsByCaseId.get(caseId);
    const entityProposal = this.entityProposalsByCaseId.get(caseId);
    const formalDecision = this.formalEntityDecisionsByCaseId.get(caseId);
    const routingProposal = this.routingProposalsByCaseId.get(caseId);
    const routingDecision = this.routingDecisionsByCaseId.get(caseId);
    if (artifact === "same_event_check") return sameEventCheck ? sameEventCheck as unknown as JsonValue : null;
    if (artifact === "same_event_resolution") {
      return resolution && sameEventCheck
        ? {
            resolution: resolution as unknown as JsonValue,
            same_event_check: sameEventCheck as unknown as JsonValue,
          }
        : null;
    }
    if (artifact === "entity_proposal") return entityProposal ? entityProposal as unknown as JsonValue : null;
    if (artifact === "formal_entity_decision") return formalDecision ? formalDecision as unknown as JsonValue : null;
    if (artifact === "routing_proposal") return routingProposal ? routingProposal as unknown as JsonValue : null;
    if (artifact === "routing_decision") return routingDecision ? routingDecision as unknown as JsonValue : null;

    const caseRecord = this.casesById.get(caseId);
    const workOrderId = this.workOrderByCaseId.get(caseId);
    const workOrder = workOrderId ? this.workOrdersById.get(workOrderId) : undefined;
    const feedback = this.storedFeedbackForCase(caseId);
    if (
      !caseRecord ||
      !workOrder ||
      !entityProposal ||
      !formalDecision ||
      !routingProposal ||
      !routingDecision ||
      !feedback
    ) {
      return null;
    }
    const vehicles = caseRecord.entity_candidates.vehicle_ids.map((id) => this.vehiclesById.get(id) ?? null);
    const tasks = caseRecord.entity_candidates.task_ids.map((id) => this.deliveryTasksById.get(id) ?? null);
    const stations = caseRecord.entity_candidates.station_names.map((id) => this.stationsById.get(id) ?? null);
    const routingRules = caseRecord.formal_entity === null
      ? []
      : [...this.routingRulesById.values()]
          .filter((rule) =>
            rule.station_id === caseRecord.formal_entity?.station_id &&
            rule.issue_type === caseRecord.category_detail
          )
          .sort((left, right) => left.routing_rule_id.localeCompare(right.routing_rule_id));
    const slaPolicy = this.slaPoliciesById.get(routingDecision.rule_ref.sla_policy_id) ?? null;
    return {
      case_commit: {
        schema_version: caseRecord.schema_version,
        data_scope: caseRecord.data_scope,
        evidence_class: caseRecord.evidence_class,
        source_kind: caseRecord.source_kind,
        record_mode: caseRecord.record_mode,
        source_name: caseRecord.source_name,
        source_locator: caseRecord.source_locator,
        source_sha256: caseRecord.source_sha256,
        legacy_id: caseRecord.legacy_id,
        case_id: caseRecord.case_id,
        formal_entity: caseRecord.formal_entity as unknown as JsonValue,
        formal_entity_confirmation_status: caseRecord.formal_entity_confirmation_status,
        workflow_readiness: caseRecord.workflow_readiness,
        sla_started_at: caseRecord.sla_started_at,
        sla_due_at: caseRecord.sla_due_at,
        sla_rule_version: caseRecord.sla_rule_version,
        routing_rule_candidate_id: caseRecord.routing_rule_candidate_id,
        suggested_team: caseRecord.suggested_team,
      },
      work_order_commit: {
        schema_version: workOrder.schema_version,
        data_scope: workOrder.data_scope,
        evidence_class: workOrder.evidence_class,
        source_kind: workOrder.source_kind,
        source_name: workOrder.source_name,
        source_locator: workOrder.source_locator,
        source_sha256: workOrder.source_sha256,
        legacy_id: workOrder.legacy_id,
        work_order_id: workOrder.work_order_id,
        case_id: workOrder.case_id,
        action: workOrder.action,
        created_at: workOrder.created_at,
        due_at: workOrder.due_at,
        first_response_target_minutes: workOrder.first_response_target_minutes,
        sla_reset_count: workOrder.sla_reset_count,
      },
      raw_feedback: feedback as unknown as JsonValue,
      entity_proposal: entityProposal as unknown as JsonValue,
      formal_entity_decision: formalDecision as unknown as JsonValue,
      routing_proposal: routingProposal as unknown as JsonValue,
      routing_decision: routingDecision as unknown as JsonValue,
      vehicle_references: vehicles as unknown as JsonValue,
      task_references: tasks as unknown as JsonValue,
      station_references: stations as unknown as JsonValue,
      routing_rules: routingRules as unknown as JsonValue,
      sla_policy: slaPolicy as unknown as JsonValue,
    };
  }

  #recordVerifiedW3Artifact(caseId: string, artifact: W3VerifiedArtifact): void {
    const value = this.currentW3ArtifactValue(caseId, artifact);
    if (value === null) throw new Error(`W3 ${artifact} receipt cannot be created from an incomplete snapshot`);
    this.#verifiedW3ArtifactFingerprints.set(
      this.w3ArtifactKey(caseId, artifact),
      createWorkflowEventFingerprint(value),
    );
  }

  #hasVerifiedW3Artifact(caseId: string, artifact: W3VerifiedArtifact): boolean {
    const value = this.currentW3ArtifactValue(caseId, artifact);
    const receipt = this.#verifiedW3ArtifactFingerprints.get(this.w3ArtifactKey(caseId, artifact));
    return value !== null && receipt !== undefined && createWorkflowEventFingerprint(value) === receipt;
  }

  hasVerifiedW3Artifact(caseId: string, artifact: W3VerifiedArtifact): boolean {
    return this.#hasVerifiedW3Artifact(caseId, artifact);
  }

  #requireActiveW6Resources(
    caseIds: readonly string[],
    clusterId: string,
    improvementId: string | null,
  ): { event_id: string; fingerprint: string } {
    const eventContext = this.workflowEventContext.getStore();
    const caseOwners = this.caseLockContext.getStore();
    const resourceOwners = this.w6ResourceLockContext.getStore();
    const clusterKey = `cluster:${clusterId}`;
    const clusterOwner = resourceOwners?.get(clusterKey);
    const improvementKey = improvementId === null ? null : `improvement:${improvementId}`;
    const improvementOwner = improvementKey === null ? null : resourceOwners?.get(improvementKey);
    if (
      !eventContext ||
      this.activeWorkflowEventOwners.get(eventContext.event_id) !== eventContext.owner ||
      !isSortedUniqueNonEmptyStrings(caseIds) ||
      !caseIds.every((caseId) => {
        const owner = caseOwners?.get(caseId);
        return owner !== undefined && this.activeCaseLockOwners.get(caseId) === owner;
      }) ||
      !clusterOwner ||
      this.activeW6ResourceLockOwners.get(clusterKey) !== clusterOwner ||
      (
        improvementKey !== null &&
        (!improvementOwner || this.activeW6ResourceLockOwners.get(improvementKey) !== improvementOwner)
      )
    ) {
      throw new Error("W6 provenance invariant requires an active event and every stable case/cluster/improvement lock");
    }
    return { event_id: eventContext.event_id, fingerprint: eventContext.fingerprint };
  }

  #snapshotW6History(clusterId: string): W6History {
    const proposal = this.#w6ProposalsByClusterId.get(clusterId);
    if (!proposal) throw new Error(`W6 cluster ${clusterId} has no verified N5 proposal`);
    return {
      proposal: cloneW6Proposal(proposal),
      entries: (this.#w6HistoryEntriesByClusterId.get(clusterId) ?? []).map(cloneW6HistoryEntry),
      observation_cycles: (this.#w6ObservationCyclesByClusterId.get(clusterId) ?? []).map(cloneW6Cycle),
      active_recurrence_intakes: (this.#w6ActiveRecurrenceIntakesByClusterId.get(clusterId) ?? [])
        .map(cloneW6ActiveRecurrenceIntake),
      observation_checkpoints: (this.#w6ObservationCheckpointsByClusterId.get(clusterId) ?? [])
        .map(cloneW6Checkpoint),
      receipts: (this.#w6ReceiptsByClusterId.get(clusterId) ?? []).map(cloneW6Receipt),
    };
  }

  #w6StateFingerprint(clusterId: string): string {
    const cluster = this.#w6ClustersById.get(clusterId);
    const proposal = this.#w6ProposalsByClusterId.get(clusterId);
    if (!cluster || !proposal) throw new Error(`W6 cluster ${clusterId} has an incomplete state`);
    const improvement = cluster.active_improvement_id === null
      ? null
      : this.#w6ImprovementsById.get(cluster.active_improvement_id) ?? null;
    return createWorkflowEventFingerprint({
      cluster: cluster as unknown as JsonValue,
      improvement: improvement as unknown as JsonValue,
      proposal: proposal as unknown as JsonValue,
      entries: (this.#w6HistoryEntriesByClusterId.get(clusterId) ?? []) as unknown as JsonValue,
      observation_cycles: (this.#w6ObservationCyclesByClusterId.get(clusterId) ?? []) as unknown as JsonValue,
      active_recurrence_intakes: (this.#w6ActiveRecurrenceIntakesByClusterId.get(clusterId) ?? []) as unknown as JsonValue,
      observation_checkpoints: (this.#w6ObservationCheckpointsByClusterId.get(clusterId) ?? []) as unknown as JsonValue,
    });
  }

  #verifyW6State(clusterId: string): void {
    const cluster = this.#w6ClustersById.get(clusterId);
    const latestReceiptId = this.#w6LatestReceiptIdByClusterId.get(clusterId);
    const receipts = this.#w6ReceiptsByClusterId.get(clusterId) ?? [];
    const latestReceipt = receipts.at(-1);
    const currentMembershipKey = cluster ? w6MembershipKey(cluster.member_case_ids) : null;
    const membershipKeysForCluster = [...this.#w6ClusterIdByMembershipKey.entries()]
      .filter(([, ownerClusterId]) => ownerClusterId === clusterId)
      .map(([key]) => key);
    if (
      !cluster ||
      !latestReceiptId ||
      !latestReceipt ||
      latestReceipt.receipt_id !== latestReceiptId ||
      latestReceipt.state_fingerprint !== this.#w6StateFingerprint(clusterId) ||
      currentMembershipKey === null ||
      !sameJson(membershipKeysForCluster, [currentMembershipKey]) ||
      this.#w6ClusterIdByMembershipKey.get(currentMembershipKey) !== clusterId ||
      cluster.member_case_ids.some((caseId) => this.#w6ClusterIdByCaseId.get(caseId) !== clusterId)
    ) {
      throw new Error("W6 immutable commit receipt is missing or stale");
    }
    this.#assertW6MembershipSnapshotsUnchanged(clusterId);
  }

  #latestW6Receipt(clusterId: string): W6CommitReceipt {
    this.#verifyW6State(clusterId);
    const receipt = this.#w6ReceiptsByClusterId.get(clusterId)?.at(-1);
    if (!receipt) throw new Error("W6 immutable commit receipt is missing");
    return cloneW6Receipt(receipt);
  }

  #appendW6Receipt(input: Omit<W6CommitReceipt, "state_fingerprint">): W6CommitReceipt {
    for (const receipts of this.#w6ReceiptsByClusterId.values()) {
      if (receipts.some((record) => record.receipt_id === input.receipt_id)) {
        throw new Error(`W6 receipt id ${input.receipt_id} already exists`);
      }
    }
    const receipt: W6CommitReceipt = {
      ...input,
      case_ids: [...input.case_ids],
      state_fingerprint: this.#w6StateFingerprint(input.cluster_id),
    };
    this.#w6ReceiptsByClusterId.set(input.cluster_id, [
      ...(this.#w6ReceiptsByClusterId.get(input.cluster_id) ?? []),
      receipt,
    ]);
    this.#w6LatestReceiptIdByClusterId.set(input.cluster_id, receipt.receipt_id);
    return cloneW6Receipt(receipt);
  }

  #authoritativeW6MembershipSnapshots(clusterId: string): W6CaseMembershipSnapshot[] {
    const proposal = this.#w6ProposalsByClusterId.get(clusterId);
    if (!proposal) throw new Error("W6 cluster has no N5 proposal snapshot");
    const records = [
      ...proposal.member_case_snapshots,
      ...(this.#w6ObservationCyclesByClusterId.get(clusterId) ?? [])
        .filter((cycle) => cycle.trigger === "recurrence_reopen")
        .flatMap((cycle) => cycle.triggering_case_snapshots),
      ...(this.#w6ActiveRecurrenceIntakesByClusterId.get(clusterId) ?? [])
        .flatMap((intake) => intake.triggering_case_snapshots),
    ];
    const byCaseId = new Map(records.map((record) => [record.case_id, record]));
    return [...byCaseId.values()].sort((left, right) => left.case_id.localeCompare(right.case_id));
  }

  #assertW6MembershipSnapshotsUnchanged(clusterId: string): void {
    const cluster = this.#w6ClustersById.get(clusterId);
    if (!cluster) throw new Error("W6 cluster does not exist");
    const snapshots = this.#authoritativeW6MembershipSnapshots(clusterId);
    if (!sameJson(snapshots.map((entry) => entry.case_id), cluster.member_case_ids)) {
      throw new Error("W6 cluster membership is not bound to its immutable case snapshots");
    }
    for (const snapshot of snapshots) {
      let currentSnapshot: W6CaseMembershipSnapshot;
      try {
        currentSnapshot = this.#requireW6IndependentClosedCase(snapshot.case_id);
      } catch {
        throw new Error(
          "W6 cross-event membership lost its authoritative W5 closure provenance",
        );
      }
      if (!sameJson(currentSnapshot, snapshot)) {
        throw new Error("W6 cross-event membership cannot alter case state, merged semantics, or feedback ownership");
      }
    }
  }

  #requireW6IndependentClosedCase(caseId: string): W6CaseMembershipSnapshot {
    const closedContext = this.#validatedW6ClosedCaseContext(caseId);
    const caseRecord = closedContext.case_record;
    const feedbackRecords = [...this.caseByFeedbackId.entries()]
      .filter(([, linkedCaseId]) => linkedCaseId === caseId)
      .flatMap(([feedbackId]) => {
        const feedback = this.rawFeedbackById.get(feedbackId);
        return feedback ? [feedback] : [];
      })
      .sort((left, right) => left.feedback_id.localeCompare(right.feedback_id));
    const sameEventCheck = this.sameEventChecksByCaseId.get(caseId);
    const sameEventResolution = this.sameEventResolutionsByCaseId.get(caseId);
    const independentlyCleared = (
      sameEventCheck !== undefined &&
      this.#hasVerifiedW3Artifact(caseId, "same_event_check") &&
      (
        (
          sameEventCheck.candidate === null &&
          sameEventCheck.review_state === "not_required" &&
          sameEventCheck.node_status === "ok"
        ) ||
        (
          sameEventResolution?.decision === "keep_separate" &&
          this.#hasVerifiedW3Artifact(caseId, "same_event_resolution")
        )
      )
    );
    if (
      feedbackRecords.length === 0 ||
      !hasSyntheticCaseBoundary(caseRecord) ||
      !feedbackRecords.every(hasSyntheticFeedbackBoundary) ||
      caseRecord.status !== "已关闭" ||
      caseRecord.workflow_readiness !== "closed" ||
      caseRecord.closed_at === null ||
      !isIsoTimestamp(caseRecord.closed_at) ||
      caseRecord.formal_entity === null ||
      caseRecord.formal_entity_confirmation_status !== "已人工确认" ||
      caseRecord.cluster_id !== null ||
      !independentlyCleared
    ) {
      throw new Error(`W6 case ${caseId} lacks an authoritative independent closed snapshot`);
    }
    return w6CaseSnapshot(
      caseRecord,
      closedContext.work_order,
      closedContext.closure_provenance,
      feedbackRecords,
    );
  }

  #w6AuthorizedRecurrenceSources(
    cycle: W6ObservationCycle,
    expectedAt: string,
  ): W6RecurrenceCaseSnapshot[] {
    const sources = new Map<string, W6RecurrenceCaseSnapshot>();
    if (cycle.trigger === "recurrence_reopen") {
      for (const authorizedSnapshot of cycle.triggering_case_snapshots) {
        const current = this.#requireW6IndependentClosedCase(authorizedSnapshot.case_id);
        if (!sameJson(authorizedSnapshot, current)) {
          throw new Error("W6 recurrence checkpoint lacks its immutable authorized-reopen case snapshot");
        }
        sources.set(authorizedSnapshot.case_id, {
          ...cloneW6MembershipSnapshot(authorizedSnapshot),
          observed_at: cycle.opened_at,
          time_source: "authorized_reopen",
        });
      }
    }
    const intakes = (this.#w6ActiveRecurrenceIntakesByClusterId.get(cycle.cluster_id) ?? [])
      .filter((record) => record.cycle_id === cycle.cycle_id);
    for (const intake of intakes) {
      for (const authorizedSnapshot of intake.triggering_case_snapshots) {
        const current = this.#requireW6IndependentClosedCase(authorizedSnapshot.case_id);
        const caseRecord = this.casesById.get(authorizedSnapshot.case_id);
        if (
          !caseRecord ||
          !sameJson(authorizedSnapshot, current) ||
          caseRecord.closed_at === null ||
          !isIsoTimestamp(caseRecord.closed_at) ||
          Date.parse(caseRecord.closed_at) <= Date.parse(cycle.opened_at)
        ) {
          throw new Error("W6 recurrence checkpoint lacks its immutable active-intake case snapshot");
        }
        if (Date.parse(caseRecord.closed_at) <= Date.parse(expectedAt)) {
          sources.set(authorizedSnapshot.case_id, {
            ...cloneW6MembershipSnapshot(authorizedSnapshot),
            observed_at: caseRecord.closed_at,
            time_source: "case_closed_at",
          });
        }
      }
    }
    return [...sources.values()].sort((left, right) => left.case_id.localeCompare(right.case_id));
  }

  #validateW6N6AuthoritativeRequest(issue: W6AiValidationGrantIssueInput): void {
    const transition = snapshotW6AtomicTransition(issue.transition);
    if (transition.action !== "start_improvement") {
      throw new Error("W6 N6 authoritative request validation requires start_improvement");
    }
    const requestInput = asPlainRecord(issue.request.input);
    if (!requestInput) throw new Error("W6 N6 request input is not a plain record");
    const expectedEvidence: JsonValue[] = [];
    const expectedResolutionRecords: JsonValue[] = [];
    for (const caseId of transition.case_ids) {
      const context = this.#validatedW6ClosedCaseContext(caseId);
      const provenance = context.closure_provenance;
      const submission = context.w5_history.evidence_submissions.find((record) =>
        record.submission_id === provenance.evidence_submission_id
      );
      const closure = context.w5_history.closure_decisions.find((record) =>
        record.decision_id === provenance.closure_decision_id
      );
      if (!submission || !closure) {
        throw new Error(`W6 N6 request lacks authoritative W5 evidence for ${caseId}`);
      }
      expectedEvidence.push(
        {
          case_id: caseId,
          source_ref: `case:${caseId}:summary`,
          text: context.case_record.summary,
        },
        {
          case_id: caseId,
          source_ref: `w5:evidence:${provenance.evidence_submission_id}`,
          text: submission.text,
        },
      );
      expectedResolutionRecords.push({
        case_id: caseId,
        source_ref: `w5:closure:${provenance.closure_decision_id}`,
        text: closure.reason,
        review_status: "approved",
      });
    }
    if (
      !sameJson(requestInput.evidence, expectedEvidence) ||
      !sameJson(requestInput.resolution_records, expectedResolutionRecords)
    ) {
      throw new Error(
        "W6 N6 validation receipt requires request evidence and resolution records bound to repository-authoritative W5 provenance",
      );
    }
  }

  #validateW6N5ActiveIntakeIssue(
    issue: W6AiValidationGrantIssueInput,
    claims: W6N5IntakeValidationGrantClaims,
  ): void {
    const transition = snapshotW6AtomicTransition(issue.transition);
    if (transition.action !== "intake_active_observation_recurrence") {
      throw new Error("W6 N5 active-intake receipt requires the active-intake transition");
    }
    const cluster = this.#w6ClustersById.get(transition.cluster_id);
    const improvement = this.#w6ImprovementsById.get(transition.improvement_id);
    const cycles = this.#w6ObservationCyclesByClusterId.get(transition.cluster_id) ?? [];
    const cycle = cycles.find((record) => record.cycle_id === transition.cycle_id);
    const checkpoints = this.#w6ObservationCheckpointsByClusterId.get(transition.cluster_id) ?? [];
    const day7Checkpoint = checkpoints.find((record) =>
      record.cycle_id === transition.cycle_id && record.horizon_days === 7
    );
    const day30Checkpoint = checkpoints.find((record) =>
      record.cycle_id === transition.cycle_id && record.horizon_days === 30
    );
    const expectedUnion = cluster
      ? sortedUniqueStrings([...cluster.member_case_ids, ...transition.triggering_case_ids])
      : [];
    if (
      !cluster ||
      !improvement ||
      !cycle ||
      cluster.status !== "观察中" ||
      improvement.status !== "观察中" ||
      cluster.active_improvement_id !== improvement.improvement_id ||
      improvement.current_observation_cycle_id !== cycle.cycle_id ||
      cycles.at(-1)?.cycle_id !== cycle.cycle_id ||
      day30Checkpoint !== undefined ||
      transition.clock_source !== cycle.clock_source ||
      !isNonEmptyString(transition.intake_id) ||
      !isNonEmptyString(transition.reason) ||
      !/^[a-f0-9]{64}$/iu.test(transition.n5_validation_fingerprint) ||
      !isSortedUniqueNonEmptyStrings(transition.triggering_case_ids) ||
      !isIsoTimestamp(transition.occurred_at) ||
      Date.parse(transition.occurred_at) <= Date.parse(cycle.opened_at) ||
      Date.parse(transition.occurred_at) > Date.parse(exactWindowTimestamp(cycle.opened_at, 30)) ||
      !sameJson(transition.case_ids, expectedUnion) ||
      transition.triggering_case_ids.some((caseId) => cluster.member_case_ids.includes(caseId)) ||
      transition.expected_cluster_fingerprint !== w6ClusterFingerprint(cluster) ||
      transition.expected_improvement_fingerprint !== w6ImprovementFingerprint(improvement) ||
      transition.expected_w6_state_fingerprint !== this.#w6StateFingerprint(cluster.cluster_id) ||
      claims.n5_candidate_fingerprint !== transition.n5_validation_fingerprint
    ) {
      throw new Error("W6 N5 active-intake receipt is not bound to the authoritative observing state");
    }
    this.#verifyW6State(cluster.cluster_id);
    const input = asPlainRecord(issue.request.input);
    const facts = asPlainRecord(input?.case_facts);
    const times = asPlainRecord(input?.time);
    const entities = asPlainRecord(input?.confirmed_entities);
    const sources = asPlainRecord(input?.source_reference);
    const flatten = (group: Record<string, unknown> | null): Record<string, unknown>[] => {
      const current = asPlainRecord(group?.current);
      const candidates = Array.isArray(group?.candidates)
        ? group.candidates.flatMap((value) => {
            const record = asPlainRecord(value);
            return record ? [record] : [];
          })
        : [];
      return current ? [current, ...candidates] : candidates;
    };
    const factById = new Map(flatten(facts).map((record) => [record.case_id, record]));
    const timeById = new Map(flatten(times).map((record) => [record.case_id, record]));
    const entityById = new Map(flatten(entities).map((record) => [record.case_id, record]));
    const sourceById = new Map(flatten(sources).map((record) => [record.case_id, record]));
    for (const caseId of transition.case_ids) {
      this.#requireW6IndependentClosedCase(caseId);
      const caseRecord = this.casesById.get(caseId)!;
      const fact = factById.get(caseId);
      const expectedClusterId = cluster.member_case_ids.includes(caseId) ? cluster.cluster_id : null;
      const sameEventCheck = this.sameEventChecksByCaseId.get(caseId);
      const sameEventResolution = this.sameEventResolutionsByCaseId.get(caseId);
      const expectedResolution = sameEventResolution?.decision === "keep_separate"
        ? "keep_separate"
        : sameEventCheck?.candidate === null ? "not_required" : null;
      if (
        !fact ||
        fact.status !== caseRecord.status ||
        fact.workflow_readiness !== caseRecord.workflow_readiness ||
        fact.summary !== caseRecord.summary ||
        fact.same_event_resolution !== expectedResolution ||
        fact.cluster_id !== expectedClusterId ||
        timeById.get(caseId)?.closed_at !== caseRecord.closed_at ||
        !sameJson(entityById.get(caseId)?.formal_entity, caseRecord.formal_entity) ||
        sourceById.get(caseId)?.source_ref !== `case:${caseId}`
      ) {
        throw new Error(`W6 N5 active-intake request is not bound to authoritative case ${caseId}`);
      }
      const privateOwner = this.#w6ClusterIdByCaseId.get(caseId);
      if (
        (cluster.member_case_ids.includes(caseId) && privateOwner !== cluster.cluster_id) ||
        (transition.triggering_case_ids.includes(caseId) && privateOwner !== undefined)
      ) {
        throw new Error(`W6 N5 active-intake request conflicts with private cluster ownership for ${caseId}`);
      }
      if (transition.triggering_case_ids.includes(caseId)) {
        if (
          caseRecord.closed_at === null ||
          !isIsoTimestamp(caseRecord.closed_at) ||
          violatesW6ActiveIntakeObservationWindow({
            opened_at: cycle.opened_at,
            occurred_at: transition.occurred_at,
            case_closed_at: caseRecord.closed_at,
            day7_checkpoint_exists: day7Checkpoint !== undefined,
          })
        ) {
          throw new Error(`W6 N5 active-intake trigger ${caseId} violates the authorized observation window`);
        }
      }
    }
    if (
      issue.request.object_ref.object_type !== "case" ||
      !transition.triggering_case_ids.includes(issue.request.object_ref.object_id)
    ) {
      throw new Error("W6 N5 active-intake request object_ref must identify a triggering case");
    }
  }

  #validateW6CandidateSnapshot(input: W6ClusterCandidateInput): {
    case_ids: string[];
    proposal: W6CrossEventProposal;
  } {
    const requestValidation = validateNodeRequestDefinition(input.request);
    if (!requestValidation.valid) {
      throw new Error(`W6 N5 request is invalid: ${requestValidation.errors.join("; ")}`);
    }
    if (
      input.request.node !== "N5" ||
      input.request.mode !== "cross_event_clustering" ||
      input.request.version !== "N5-cross-event-1.0.0-draft.2" ||
      input.envelope.node !== input.request.node ||
      input.envelope.mode !== input.request.mode ||
      input.envelope.version !== input.request.version ||
      !sameJson(input.envelope.object_ref, input.request.object_ref) ||
      input.envelope.input_hash !== createAiInputHash(input.request) ||
      input.envelope.status !== "ok" ||
      input.envelope.validation.valid !== true ||
      input.envelope.validation.errors.length !== 0 ||
      input.envelope.human_revision.state !== "none" ||
      input.envelope.payload === null
    ) {
      throw new Error("W6 N5 envelope does not match its validated cross-event request and input hash");
    }
    const candidateValidation = validateNodeCandidate(input.request, {
      payload: input.envelope.payload,
      evidence_spans: input.envelope.evidence_spans,
      missing_fields: input.envelope.missing_fields,
      confidence: input.envelope.confidence,
      status: input.envelope.status,
    });
    if (!candidateValidation.valid) {
      throw new Error(`W6 N5 envelope candidate is invalid: ${candidateValidation.errors.join("; ")}`);
    }
    const payload = asPlainRecord(input.envelope.payload);
    const candidate = asPlainRecord(payload?.cluster_candidate);
    if (
      !payload ||
      !candidate ||
      candidate.candidate_kind !== "new_cluster" ||
      candidate.suggested_cluster_id !== null ||
      !Array.isArray(candidate.member_cases) ||
      payload.automatic_merge !== false ||
      payload.automatic_case_relink !== false
    ) {
      throw new Error("W6 candidate creation rejects existing-cluster injection and all automatic merge/relink fields");
    }
    const caseIds = sortedUniqueStrings(candidate.member_cases.flatMap((value) => {
      const member = asPlainRecord(value);
      return isNonEmptyString(member?.case_id) ? [member.case_id] : [];
    }));
    if (caseIds.length < 2 || caseIds.length !== candidate.member_cases.length) {
      throw new Error("W6 N5 proposal must contain at least two distinct case ids");
    }
    this.#requireActiveW6Resources(caseIds, input.cluster_id, null);

    const caseFacts = asPlainRecord(asPlainRecord(input.request.input)?.case_facts);
    const times = asPlainRecord(asPlainRecord(input.request.input)?.time);
    const entities = asPlainRecord(asPlainRecord(input.request.input)?.confirmed_entities);
    const sources = asPlainRecord(asPlainRecord(input.request.input)?.source_reference);
    const flattenRecords = (group: Record<string, unknown> | null): Record<string, unknown>[] => {
      if (!group) return [];
      const current = asPlainRecord(group.current);
      const candidates = Array.isArray(group.candidates)
        ? group.candidates.flatMap((entry) => {
            const record = asPlainRecord(entry);
            return record ? [record] : [];
          })
        : [];
      return current ? [current, ...candidates] : candidates;
    };
    const factById = new Map(flattenRecords(caseFacts).map((record) => [record.case_id, record]));
    const timeById = new Map(flattenRecords(times).map((record) => [record.case_id, record]));
    const entityById = new Map(flattenRecords(entities).map((record) => [record.case_id, record]));
    const sourceById = new Map(flattenRecords(sources).map((record) => [record.case_id, record]));
    const snapshots = caseIds.map((caseId) => {
      const snapshot = this.#requireW6IndependentClosedCase(caseId);
      const caseRecord = this.casesById.get(caseId)!;
      const fact = factById.get(caseId);
      const time = timeById.get(caseId);
      const entity = entityById.get(caseId);
      const source = sourceById.get(caseId);
      const sameEventCheck = this.sameEventChecksByCaseId.get(caseId);
      const sameEventResolution = this.sameEventResolutionsByCaseId.get(caseId);
      const authoritativeResolution = sameEventResolution?.decision === "keep_separate"
        ? "keep_separate"
        : sameEventCheck?.candidate === null ? "not_required" : null;
      if (
        !fact ||
        fact.status !== caseRecord.status ||
        fact.workflow_readiness !== caseRecord.workflow_readiness ||
        fact.summary !== caseRecord.summary ||
        fact.cluster_id !== caseRecord.cluster_id ||
        fact.same_event_resolution !== authoritativeResolution ||
        time?.closed_at !== caseRecord.closed_at ||
        !sameJson(entity?.formal_entity, caseRecord.formal_entity) ||
        source?.source_ref !== `case:${caseId}`
      ) {
        throw new Error(`W6 N5 request does not match repository-authoritative case snapshot ${caseId}`);
      }
      return snapshot;
    });
    if (
      input.request.object_ref.object_type !== "case" ||
      !caseIds.includes(input.request.object_ref.object_id) ||
      (() => {
        const feedbackIds = snapshots.flatMap((entry) => entry.feedback_links.map((link) => link.feedback_id));
        return new Set(feedbackIds).size !== feedbackIds.length;
      })()
    ) {
      throw new Error("W6 N5 request is not bound to distinct authoritative cases and feedback records");
    }
    const envelopeFingerprint = createWorkflowEventFingerprint(input.envelope as unknown as JsonValue);
    const proposal: W6CrossEventProposal = {
      proposal_id: input.proposal_id,
      cluster_id: input.cluster_id,
      node_run_id: input.envelope.run_id,
      node_version: "N5-cross-event-1.0.0-draft.2",
      input_hash: input.envelope.input_hash,
      envelope_fingerprint: envelopeFingerprint,
      proposal_fingerprint: createWorkflowEventFingerprint({
        request: input.request as unknown as JsonValue,
        envelope: input.envelope as unknown as JsonValue,
        member_case_snapshots: snapshots as unknown as JsonValue,
      }),
      member_case_snapshots: snapshots,
      similarity: candidate.similarity as number,
      evidence_spans: input.envelope.evidence_spans.map((entry) => ({ ...entry })),
      automatic_merge: false,
      automatic_case_relink: false,
      created_at: input.created_at,
    };
    if (
      !isNonEmptyString(proposal.proposal_id) ||
      !isNonEmptyString(proposal.node_run_id) ||
      typeof proposal.similarity !== "number" ||
      !Number.isFinite(proposal.similarity) ||
      !isIsoTimestamp(proposal.created_at)
    ) {
      throw new Error("W6 N5 proposal metadata is invalid");
    }
    return { case_ids: caseIds, proposal };
  }

  async findW6ClusterById(clusterId: string): Promise<RuntimeProblemCluster | null> {
    const record = this.#w6ClustersById.get(clusterId);
    if (!record) return null;
    this.#verifyW6State(clusterId);
    return cloneW6Cluster(record);
  }

  async listW6Clusters(): Promise<RuntimeProblemCluster[]> {
    return [...this.#w6ClustersById.keys()]
      .sort((left, right) => left.localeCompare(right))
      .map((clusterId) => {
        this.#verifyW6State(clusterId);
        return cloneW6Cluster(this.#w6ClustersById.get(clusterId)!);
      });
  }

  async findW6ImprovementById(improvementId: string): Promise<RuntimeImprovementProject | null> {
    const record = this.#w6ImprovementsById.get(improvementId);
    if (!record) return null;
    this.#verifyW6State(record.cluster_id);
    return cloneW6Improvement(record);
  }

  async getW6History(clusterId: string): Promise<W6History> {
    this.#verifyW6State(clusterId);
    return this.#snapshotW6History(clusterId);
  }

  async createW6ClusterCandidateIfAbsent(
    input: W6ClusterCandidateInput,
  ): Promise<W6ClusterCandidateResult> {
    const snapshot = structuredClone(input);
    return this.#createW6ClusterCandidateAtomically(snapshot);
  }

  #createW6ClusterCandidateAtomically(input: W6ClusterCandidateInput): W6ClusterCandidateResult {
    // Process-local only: authoritative validation, membership uniqueness, history,
    // and receipt writes below contain no asynchronous suspension point.
    const validated = this.#validateW6CandidateSnapshot(input);
    const eventContext = this.#requireActiveW6Resources(validated.case_ids, input.cluster_id, null);
    const membershipKey = w6MembershipKey(validated.case_ids);
    const existingClusterId = this.#w6ClusterIdByMembershipKey.get(membershipKey);
    if (existingClusterId) {
      this.#verifyW6State(existingClusterId);
      const cluster = this.#w6ClustersById.get(existingClusterId)!;
      const proposal = this.#w6ProposalsByClusterId.get(existingClusterId)!;
      return {
        outcome: "idempotent",
        cluster: cloneW6Cluster(cluster),
        proposal: cloneW6Proposal(proposal),
        history: this.#snapshotW6History(existingClusterId),
        receipt: this.#latestW6Receipt(existingClusterId),
      };
    }
    const overlappingClusterId = validated.case_ids
      .map((caseId) => this.#w6ClusterIdByCaseId.get(caseId))
      .find((clusterId): clusterId is string => clusterId !== undefined);
    const overlappingCluster = overlappingClusterId
      ? this.#w6ClustersById.get(overlappingClusterId)
      : [...this.#w6ClustersById.values()].find((record) =>
          record.member_case_ids.some((caseId) => validated.case_ids.includes(caseId))
        );
    if (overlappingCluster) {
      throw new Error(
        `W6 case membership already belongs to cluster ${overlappingCluster.cluster_id}; use the authorized recurrence path`,
      );
    }
    if (this.#w6ClustersById.has(input.cluster_id)) {
      throw new Error(`W6 cluster id ${input.cluster_id} already belongs to different membership`);
    }
    if (
      [...this.#w6ProposalsByClusterId.values()].some((entry) => entry.proposal_id === input.proposal_id) ||
      [...this.#w6HistoryEntriesByClusterId.values()].flat().some((entry) => entry.history_id === input.history_id) ||
      [...this.#w6ReceiptsByClusterId.values()].flat().some((entry) => entry.receipt_id === input.receipt_id)
    ) {
      throw new Error("W6 candidate proposal, history, and receipt ids must be globally unique");
    }
    if (!isNonEmptyString(input.name) || !isNonEmptyString(input.category_domain) || !isIsoTimestamp(input.created_at)) {
      throw new Error("W6 candidate cluster metadata is invalid");
    }
    const cluster: RuntimeProblemCluster = {
      schema_version: CANONICAL_SCHEMA_VERSION,
      data_scope: "synthetic_experiment",
      evidence_class: "synthetic_experiment",
      source_kind: "scenario_runtime",
      source_name: "synthetic_experiment",
      source_locator: `W6:${eventContext.event_id}`,
      source_sha256: validated.proposal.envelope_fingerprint,
      cluster_id: input.cluster_id,
      name: input.name,
      category_domain: input.category_domain,
      member_case_ids: validated.case_ids,
      clustering_mode: "cross_event",
      clustering_version: "N5-cross-event-1.0.0-draft.2",
      proposal_id: input.proposal_id,
      root_cause_hypothesis: null,
      active_improvement_id: null,
      recurrence_count: 0,
      status: "候选",
      created_at: input.created_at,
      updated_at: input.created_at,
    };
    if (!hasSyntheticW6ClusterBoundary(cluster)) throw new Error("W6 candidate cluster boundary is invalid");
    const historyEntry: W6HistoryEntry = {
      history_id: input.history_id,
      event_id: eventContext.event_id,
      phase: "cluster_review",
      action: "create_cluster_candidate",
      case_ids: [...validated.case_ids],
      cluster_id: cluster.cluster_id,
      improvement_id: null,
      cycle_id: null,
      previous_cluster_status: null,
      next_cluster_status: "候选",
      previous_improvement_status: null,
      next_improvement_status: null,
      reason: "Validated N5 cross-event candidate; authorized human review is still required.",
      principal: null,
      authorization_policy_version: null,
      occurred_at: input.created_at,
    };
    this.#w6ClustersById.set(cluster.cluster_id, cloneW6Cluster(cluster));
    this.#w6ClusterIdByMembershipKey.set(membershipKey, cluster.cluster_id);
    for (const caseId of cluster.member_case_ids) {
      this.#w6ClusterIdByCaseId.set(caseId, cluster.cluster_id);
    }
    this.#w6ProposalsByClusterId.set(cluster.cluster_id, cloneW6Proposal(validated.proposal));
    this.#w6HistoryEntriesByClusterId.set(cluster.cluster_id, [cloneW6HistoryEntry(historyEntry)]);
    this.#w6ObservationCyclesByClusterId.set(cluster.cluster_id, []);
    this.#w6ActiveRecurrenceIntakesByClusterId.set(cluster.cluster_id, []);
    this.#w6ObservationCheckpointsByClusterId.set(cluster.cluster_id, []);
    this.#w6ReceiptsByClusterId.set(cluster.cluster_id, []);
    const receipt = this.#appendW6Receipt({
      receipt_id: input.receipt_id,
      event_id: eventContext.event_id,
      phase: "cluster_review",
      action: "create_cluster_candidate",
      case_ids: validated.case_ids,
      cluster_id: cluster.cluster_id,
      improvement_id: null,
      target_fingerprint: null,
      command_fingerprint: eventContext.fingerprint,
      history_id: historyEntry.history_id,
      cycle_id: null,
      checkpoint_id: null,
      committed_at: input.created_at,
    });
    return {
      outcome: "created",
      cluster: cloneW6Cluster(cluster),
      proposal: cloneW6Proposal(validated.proposal),
      history: this.#snapshotW6History(cluster.cluster_id),
      receipt,
    };
  }

  #requireW6TransitionAuthorization(
    input: W6AtomicTransition,
    event: { event_id: string; fingerprint: string },
  ): W6AuthorizationGrantClaims | null {
    if (!W6_AUTHORIZED_ACTIONS.includes(input.action as W6AuthorizedAction)) return null;
    const context = this.w6AuthorizationContext.getStore();
    const claims = context?.claims;
    const binding = createW6AuthorizationBinding(input);
    const recurrenceRequestBinding = input.action === "reopen_recurrence"
      ? createW6RecurrenceRequestAuthorizationBinding(input)
      : null;
    const targetMatches = claims?.target_fingerprint === binding.target_fingerprint ||
      (
        recurrenceRequestBinding !== null &&
        claims?.target_fingerprint === recurrenceRequestBinding.target_fingerprint
      );
    if (
      !context ||
      !claims ||
      !this.activeW6AuthorizationOwners.has(context.owner) ||
      claims.workflow !== "W6" ||
      claims.event_id !== event.event_id ||
      claims.phase !== binding.phase ||
      !sameJson(claims.case_ids, binding.case_ids) ||
      claims.cluster_id !== binding.cluster_id ||
      claims.improvement_id !== binding.improvement_id ||
      claims.action !== binding.action ||
      !targetMatches ||
      claims.command_fingerprint !== event.fingerprint
    ) {
      throw new W6AuthorizationCapabilityError(
        "W6 authorization provenance invariant requires exact grant and transition binding",
      );
    }
    return cloneW6AuthorizationClaims(claims);
  }

  #requireW6TransitionAiValidation(
    input: W6AtomicTransition,
    event: { event_id: string; fingerprint: string },
  ): W6AiValidationGrantClaims | null {
    if (
      input.action !== "start_improvement" &&
      input.action !== "intake_active_observation_recurrence"
    ) return null;
    const context = this.w6AiValidationContext.getStore();
    const claims = context?.claims;
    const binding = createW6AuthorizationBinding(input);
    if (
      !context ||
      !claims ||
      !this.activeW6AiValidationOwners.has(context.owner) ||
      !hasValidW6AiValidationClaims(claims) ||
      claims.event_id !== event.event_id ||
      claims.command_fingerprint !== event.fingerprint ||
      claims.action !== input.action ||
      claims.phase !== binding.phase ||
      !sameJson(claims.case_ids, input.case_ids) ||
      claims.cluster_id !== input.cluster_id ||
      claims.improvement_id !== input.improvement_id ||
      claims.expected_cluster_fingerprint !== input.expected_cluster_fingerprint ||
      claims.expected_improvement_fingerprint !== input.expected_improvement_fingerprint ||
      claims.authorization_target_fingerprint !== binding.target_fingerprint ||
      claims.transition_fingerprint !== createWorkflowEventFingerprint(input as unknown as JsonValue)
    ) {
      throw new Error("W6 AI validation provenance requires one exact action-scoped receipt");
    }
    if (
      input.action === "start_improvement" &&
      (
        claims.action !== "start_improvement" ||
        claims.root_cause_fingerprint !== createWorkflowEventFingerprint(
          input.root_cause_hypothesis as unknown as JsonValue,
        )
      )
    ) {
      throw new Error("W6 N6 validation receipt does not bind the persisted root-cause hypothesis");
    }
    if (
      input.action === "intake_active_observation_recurrence" &&
      (
        claims.action !== "intake_active_observation_recurrence" ||
        claims.n5_candidate_fingerprint !== input.n5_validation_fingerprint
      )
    ) {
      throw new Error("W6 N5 validation receipt does not bind the active recurrence intake");
    }
    return cloneW6AiValidationClaims(claims);
  }

  #w6CommitResult(
    outcome: W6CommitResult["outcome"],
    clusterId: string,
    observationCycle: W6ObservationCycle | null,
    observationCheckpoint: W6ObservationCheckpoint | null,
    receipt?: W6CommitReceipt,
    activeRecurrenceIntake: W6ActiveObservationRecurrenceIntake | null = null,
  ): W6CommitResult {
    const cluster = this.#w6ClustersById.get(clusterId);
    if (!cluster) throw new Error("W6 cluster does not exist");
    const improvement = cluster.active_improvement_id === null
      ? null
      : this.#w6ImprovementsById.get(cluster.active_improvement_id) ?? null;
    return {
      outcome,
      cluster: cloneW6Cluster(cluster),
      improvement: improvement ? cloneW6Improvement(improvement) : null,
      observation_cycle: observationCycle ? cloneW6Cycle(observationCycle) : null,
      active_recurrence_intake: activeRecurrenceIntake
        ? cloneW6ActiveRecurrenceIntake(activeRecurrenceIntake)
        : null,
      observation_checkpoint: observationCheckpoint ? cloneW6Checkpoint(observationCheckpoint) : null,
      history: this.#snapshotW6History(clusterId),
      receipt: receipt ? cloneW6Receipt(receipt) : this.#latestW6Receipt(clusterId),
    };
  }

  #inspectW6RecurrenceReplay(
    input: W6RecurrenceReplayQuery,
  ): { outcome: "not_found" | "conflict" } | {
    outcome: "candidate";
    artifacts: W6RecurrenceReplayArtifacts;
  } {
    if (
      !/^[a-f0-9]{64}$/iu.test(input.stable_semantic_fingerprint) ||
      !/^[a-f0-9]{64}$/iu.test(input.command_fingerprint) ||
      !isSortedUniqueNonEmptyStrings(input.case_ids) ||
      !isNonEmptyString(input.cluster_id) ||
      !isNonEmptyString(input.improvement_id) ||
      !isSortedUniqueNonEmptyStrings(input.triggering_case_ids) ||
      !isNonEmptyString(input.reason)
    ) {
      throw new Error("W6 recurrence replay query is invalid");
    }
    const recurrenceKey = `${input.cluster_id}:${w6MembershipKey(input.triggering_case_ids)}`;
    const idempotencyRecord = this.#w6RecurrenceReceiptByKey.get(recurrenceKey);
    if (!idempotencyRecord || idempotencyRecord.stable_semantic_fingerprint === null) {
      return { outcome: "not_found" };
    }
    if (idempotencyRecord.stable_semantic_fingerprint !== input.stable_semantic_fingerprint) {
      return { outcome: "conflict" };
    }
    this.#verifyW6State(input.cluster_id);
    const receipt = this.#w6ReceiptsByClusterId.get(input.cluster_id)
      ?.find((record) => record.receipt_id === idempotencyRecord.receipt_id);
    const cycle = receipt?.cycle_id
      ? this.#w6ObservationCyclesByClusterId.get(input.cluster_id)
        ?.find((record) => record.cycle_id === receipt.cycle_id)
      : undefined;
    const historyEntry = receipt
      ? this.#w6HistoryEntriesByClusterId.get(input.cluster_id)
        ?.find((record) => record.history_id === receipt.history_id)
      : undefined;
    if (
      !receipt ||
      !cycle ||
      !historyEntry ||
      receipt.action !== "reopen_recurrence" ||
      receipt.cluster_id !== input.cluster_id ||
      receipt.improvement_id !== input.improvement_id ||
      !sameJson(receipt.case_ids, input.case_ids) ||
      cycle.cluster_id !== input.cluster_id ||
      cycle.improvement_id !== input.improvement_id ||
      cycle.trigger !== "recurrence_reopen" ||
      !sameJson(cycle.triggering_case_ids, input.triggering_case_ids) ||
      historyEntry.action !== "reopen_recurrence" ||
      historyEntry.reason !== input.reason ||
      historyEntry.cycle_id !== cycle.cycle_id ||
      historyEntry.event_id !== receipt.event_id
    ) {
      throw new Error("W6 recurrence replay receipt, history, and cycle proof is incomplete");
    }
    const authorizationTransition: JsonValue = {
      action: "reopen_recurrence",
      replay_kind: "committed_semantic_replay",
      stable_semantic_fingerprint: input.stable_semantic_fingerprint,
      case_ids: [...input.case_ids],
      cluster_id: input.cluster_id,
      improvement_id: input.improvement_id,
      triggering_case_ids: [...input.triggering_case_ids],
      reason: input.reason,
      original_history_id: historyEntry.history_id,
      original_cycle_id: cycle.cycle_id,
      original_receipt_id: receipt.receipt_id,
    };
    return {
      outcome: "candidate",
      artifacts: {
        authorization_transition: authorizationTransition,
        target_fingerprint: createWorkflowEventFingerprint(authorizationTransition),
        receipt: cloneW6Receipt(receipt),
        cycle: cloneW6Cycle(cycle),
      },
    };
  }

  async findW6RecurrenceReplayCandidate(
    input: W6RecurrenceReplayQuery,
  ): Promise<W6RecurrenceReplayCandidate> {
    const inspected = this.#inspectW6RecurrenceReplay(structuredClone(input));
    if (inspected.outcome !== "candidate") return inspected;
    return {
      outcome: "candidate",
      authorization_transition: structuredClone(inspected.artifacts.authorization_transition),
      target_fingerprint: inspected.artifacts.target_fingerprint,
    };
  }

  async resolveAuthorizedW6RecurrenceReplay(
    input: W6RecurrenceReplayQuery & {
      target_fingerprint: string;
      private_proof_fingerprint: string;
    },
  ): Promise<W6CommitResult> {
    const snapshot = structuredClone(input);
    const event = this.#requireActiveW6Resources(
      snapshot.case_ids,
      snapshot.cluster_id,
      snapshot.improvement_id,
    );
    const context = this.w6AuthorizationContext.getStore();
    const claims = context?.claims;
    const inspected = this.#inspectW6RecurrenceReplay(snapshot);
    const requestBinding = createW6RecurrenceRequestAuthorizationBinding(snapshot);
    if (
      inspected.outcome !== "candidate" ||
      requestBinding.target_fingerprint !== snapshot.target_fingerprint ||
      inspected.artifacts.target_fingerprint !== snapshot.private_proof_fingerprint
    ) {
      throw new W6TransitionFailure(
        "concurrency_conflict",
        "W6 recurrence replay proof changed during authorization",
      );
    }
    if (
      !context ||
      !claims ||
      !this.activeW6AuthorizationOwners.has(context.owner) ||
      event.event_id !== claims.event_id ||
      event.fingerprint !== snapshot.command_fingerprint ||
      claims.workflow !== "W6" ||
      claims.phase !== "recurrence" ||
      claims.action !== "reopen_recurrence" ||
      claims.cluster_id !== snapshot.cluster_id ||
      claims.improvement_id !== snapshot.improvement_id ||
      !sameJson(claims.case_ids, snapshot.case_ids) ||
      claims.target_fingerprint !== requestBinding.target_fingerprint ||
      claims.command_fingerprint !== snapshot.command_fingerprint
    ) {
      throw new W6AuthorizationCapabilityError(
        "W6 recurrence replay authorization is not bound to its private committed proof",
      );
    }
    return this.#w6CommitResult(
      "idempotent",
      snapshot.cluster_id,
      inspected.artifacts.cycle,
      null,
      inspected.artifacts.receipt,
    );
  }

  async commitW6Transition(input: W6AtomicTransition): Promise<W6CommitResult> {
    const snapshot = snapshotW6AtomicTransition(input);
    return this.#commitW6TransitionAtomically(snapshot);
  }

  async commitW6RecurrenceTransition(
    input: Extract<W6AtomicTransition, { action: "reopen_recurrence" }>,
    stableSemanticFingerprint: string,
  ): Promise<W6CommitResult> {
    const snapshot = snapshotW6AtomicTransition(input);
    if (
      snapshot.action !== "reopen_recurrence" ||
      !/^[a-f0-9]{64}$/iu.test(stableSemanticFingerprint)
    ) {
      throw new Error("W6 public recurrence transition semantic binding is invalid");
    }
    return this.#commitW6TransitionAtomically(snapshot, stableSemanticFingerprint);
  }

  #commitW6TransitionAtomically(
    input: W6AtomicTransition,
    stableRecurrenceSemanticFingerprint: string | null = null,
  ): W6CommitResult {
    // Process-local only: CAS validation, the cluster/improvement double write,
    // append-only observation records, history, and receipt have no await here.
    if (
      !hasExactW6TransitionShape(input) ||
      ![
        "review_candidate",
        "start_improvement",
        "enter_observation",
        "record_day_7",
        "record_day_30",
        "archive_observation",
        "reopen_recurrence",
        "intake_active_observation_recurrence",
      ].includes(input.action) ||
      !isSortedUniqueNonEmptyStrings(input.case_ids) ||
      !isNonEmptyString(input.cluster_id) ||
      (input.improvement_id !== null && !isNonEmptyString(input.improvement_id)) ||
      !/^[a-f0-9]{64}$/iu.test(input.expected_cluster_fingerprint) ||
      (
        input.expected_improvement_fingerprint !== null &&
        !/^[a-f0-9]{64}$/iu.test(input.expected_improvement_fingerprint)
      ) ||
      !isNonEmptyString(input.history_id) ||
      !isNonEmptyString(input.receipt_id) ||
      !isIsoTimestamp(input.occurred_at)
    ) {
      throw new Error("W6 closed transition command is invalid");
    }
    const event = this.#requireActiveW6Resources(input.case_ids, input.cluster_id, input.improvement_id);
    const authorization = this.#requireW6TransitionAuthorization(input, event);
    const aiValidation = this.#requireW6TransitionAiValidation(input, event);
    const cluster = this.#w6ClustersById.get(input.cluster_id);
    if (!cluster) throw new Error("W6 cluster does not exist");
    this.#verifyW6State(cluster.cluster_id);
    this.#assertW6MembershipSnapshotsUnchanged(cluster.cluster_id);
    const improvement = input.improvement_id === null
      ? null
      : this.#w6ImprovementsById.get(input.improvement_id) ?? null;
    const cycles = this.#w6ObservationCyclesByClusterId.get(cluster.cluster_id) ?? [];
    const checkpoints = this.#w6ObservationCheckpointsByClusterId.get(cluster.cluster_id) ?? [];
    const activeImprovement = cluster.active_improvement_id === null
      ? null
      : this.#w6ImprovementsById.get(cluster.active_improvement_id) ?? null;

    if (input.action === "reopen_recurrence") {
      const recurrenceKey = `${cluster.cluster_id}:${w6MembershipKey(input.triggering_case_ids)}`;
      const semanticFingerprint = w6RecurrenceSemanticFingerprint(input);
      const idempotencyRecord = this.#w6RecurrenceReceiptByKey.get(recurrenceKey);
      if (idempotencyRecord) {
        if (idempotencyRecord.semantic_fingerprint !== semanticFingerprint) {
          throw new Error("W6 recurrence idempotency conflict: the same trigger key has different semantic input");
        }
        const receipt = this.#w6ReceiptsByClusterId.get(cluster.cluster_id)
          ?.find((record) => record.receipt_id === idempotencyRecord.receipt_id);
        const cycle = receipt?.cycle_id
          ? cycles.find((record) => record.cycle_id === receipt.cycle_id) ?? null
          : null;
        if (!receipt || !cycle) throw new Error("W6 recurrence idempotency receipt is incomplete");
        return this.#w6CommitResult("idempotent", cluster.cluster_id, cycle, null, receipt);
      }
    }
    if (input.action === "intake_active_observation_recurrence") {
      const existingIntake = (this.#w6ActiveRecurrenceIntakesByClusterId.get(cluster.cluster_id) ?? [])
        .find((record) =>
          record.cycle_id === input.cycle_id &&
          record.triggering_case_ids.some((caseId) => input.triggering_case_ids.includes(caseId))
        );
      if (existingIntake) {
        throw new Error(
          "W6 active recurrence intake conflicts with an already authorized case in the same cycle",
        );
      }
    }
    if (input.action === "record_day_7" || input.action === "record_day_30") {
      const horizon = input.action === "record_day_7" ? 7 : 30;
      const existing = checkpoints.find((record) =>
        record.cycle_id === input.cycle_id && record.horizon_days === horizon
      );
      if (existing) {
        if (
          existing.clock_source !== input.clock_source ||
          existing.recorded_at !== input.occurred_at ||
          !sameJson(existing.recurrence_case_ids, input.recurrence_case_ids) ||
          existing.related_task_volume !== input.related_task_volume
        ) {
          throw new Error(`W6 day-${horizon} checkpoint conflicts with an immutable existing observation`);
        }
        const receipt = this.#w6ReceiptsByClusterId.get(cluster.cluster_id)
          ?.find((record) => record.checkpoint_id === existing.checkpoint_id);
        const cycle = cycles.find((record) => record.cycle_id === input.cycle_id) ?? null;
        if (!receipt || !cycle) throw new Error("W6 observation checkpoint receipt is incomplete");
        return this.#w6CommitResult("idempotent", cluster.cluster_id, cycle, existing, receipt);
      }
    }

    if (input.action === "record_day_7" || input.action === "record_day_30") {
      const authoritativeUpdatedAt = Math.max(
        Date.parse(cluster.updated_at),
        improvement ? Date.parse(improvement.updated_at) : Number.NEGATIVE_INFINITY,
      );
      if (Date.parse(input.occurred_at) < authoritativeUpdatedAt) {
        throw new Error(
          `W6 ${input.action} new checkpoint occurred_at cannot be earlier than repository-authoritative cluster/improvement updated_at`,
        );
      }
    }

    if (W6_AUTHORIZED_ACTIONS.includes(input.action as W6AuthorizedAction)) {
      const occurredAt = Date.parse(input.occurred_at);
      const authoritativeUpdatedAt = Math.max(
        Date.parse(cluster.updated_at),
        activeImprovement ? Date.parse(activeImprovement.updated_at) : Number.NEGATIVE_INFINITY,
      );
      if (occurredAt < authoritativeUpdatedAt) {
        throw new Error(
          "W6 authorized transition occurred_at cannot be earlier than repository-authoritative cluster/improvement updated_at",
        );
      }
    }

    if (
      w6ClusterFingerprint(cluster) !== input.expected_cluster_fingerprint ||
      (
        improvement === null
          ? input.expected_improvement_fingerprint !== null
          : w6ImprovementFingerprint(improvement) !== input.expected_improvement_fingerprint
      )
    ) {
      return this.#w6CommitResult("concurrency_conflict", cluster.cluster_id, cycles.at(-1) ?? null, null);
    }
    if (
      [...this.#w6HistoryEntriesByClusterId.values()].flat().some((entry) => entry.history_id === input.history_id) ||
      [...this.#w6ReceiptsByClusterId.values()].flat().some((entry) => entry.receipt_id === input.receipt_id)
    ) {
      throw new Error("W6 history and receipt ids must be globally unique");
    }

    const regularCaseIds = cluster.member_case_ids;
    if (
      input.action !== "reopen_recurrence" &&
      input.action !== "intake_active_observation_recurrence" &&
      !sameJson(input.case_ids, regularCaseIds)
    ) {
      throw new Error("W6 transition case_ids must equal the repository-authoritative cluster membership");
    }
    const nextCluster = cloneW6Cluster(cluster);
    let nextImprovement = improvement ? cloneW6Improvement(improvement) : null;
    let appendedCycle: W6ObservationCycle | null = null;
    let appendedCheckpoint: W6ObservationCheckpoint | null = null;
    let appendedIntake: W6ActiveObservationRecurrenceIntake | null = null;
    let writeImprovement = nextImprovement !== null;
    let reason: string;
    let previousImprovementStatus = improvement?.status ?? null;

    if (input.action === "review_candidate") {
      if (
        input.improvement_id !== null ||
        input.expected_improvement_fingerprint !== null ||
        cluster.status !== "候选" ||
        (input.decision !== "submit_for_review" && input.decision !== "reject") ||
        !isNonEmptyString(input.reason)
      ) {
        throw new Error("W6 candidate review transition is invalid");
      }
      nextCluster.status = transitionCluster(
        cluster.status,
        input.decision === "submit_for_review" ? "待审核" : "已驳回",
        "authorized_human",
      );
      nextCluster.updated_at = input.occurred_at;
      reason = input.reason;
    } else if (input.action === "start_improvement") {
      if (
        cluster.status !== "待审核" ||
        cluster.active_improvement_id !== null ||
        improvement !== null ||
        this.#w6ImprovementsById.has(input.improvement_id) ||
        !hasValidW6RootCauseHypothesis(input.root_cause_hypothesis) ||
        !isNonEmptyString(input.improvement.version) ||
        !isNonEmptyString(input.improvement.owner_role) ||
        !isNonEmptyString(input.improvement.measure) ||
        !sameJson(input.improvement.observation_window_days, [7, 30]) ||
        !["real", "test", "synthetic_history"].includes(input.improvement.clock_source) ||
        !isNonEmptyString(input.improvement.metric_formula) ||
        !isNonEmptyString(input.reason)
      ) {
        throw new Error("W6 start-improvement transition is invalid");
      }
      nextCluster.status = transitionCluster(cluster.status, "改进中", "authorized_human");
      nextCluster.active_improvement_id = input.improvement_id;
      nextCluster.root_cause_hypothesis = cloneW6RootCauseHypothesis(input.root_cause_hypothesis);
      nextCluster.updated_at = input.occurred_at;
      const project: RuntimeImprovementProject = {
        schema_version: CANONICAL_SCHEMA_VERSION,
        data_scope: "synthetic_experiment",
        evidence_class: "synthetic_experiment",
        source_kind: "scenario_runtime",
        source_name: "synthetic_experiment",
        source_locator: `W6:${event.event_id}`,
        source_sha256: createWorkflowEventFingerprint(input.root_cause_hypothesis as unknown as JsonValue),
        improvement_id: input.improvement_id,
        cluster_id: cluster.cluster_id,
        version: input.improvement.version,
        owner_role: input.improvement.owner_role,
        measure: input.improvement.measure,
        observation_window_days: [...input.improvement.observation_window_days] as [7, 30],
        clock_source: input.improvement.clock_source,
        metric_formula: input.improvement.metric_formula,
        current_observation_cycle_id: null,
        human_conclusion: null,
        status: transitionImprovement("待立项", "执行中", "authorized_human"),
        created_at: input.occurred_at,
        updated_at: input.occurred_at,
      };
      if (!hasSyntheticW6ImprovementBoundary(project)) {
        throw new Error("W6 improvement boundary is invalid");
      }
      nextImprovement = project;
      writeImprovement = true;
      previousImprovementStatus = null;
      reason = input.reason;
    } else if (input.action === "enter_observation") {
      const memberCaseClosedAfterOpen = cluster.member_case_ids.some((caseId) => {
        const caseRecord = this.casesById.get(caseId);
        return !caseRecord ||
          caseRecord.closed_at === null ||
          !isIsoTimestamp(caseRecord.closed_at) ||
          Date.parse(caseRecord.closed_at) >= Date.parse(input.occurred_at);
      });
      if (memberCaseClosedAfterOpen) {
        throw new Error(
          "W6 enter-observation requires every authoritative member closed_at to be strictly earlier than opened_at",
        );
      }
      if (
        cluster.status !== "改进中" ||
        !improvement ||
        improvement.status !== "执行中" ||
        cluster.active_improvement_id !== improvement.improvement_id ||
        input.clock_source !== improvement.clock_source ||
        !isNonEmptyString(input.cycle_id) ||
        cycles.some((record) => record.cycle_id === input.cycle_id) ||
        !isNonEmptyString(input.reason) ||
        !authorization
      ) {
        throw new Error("W6 enter-observation transition is invalid");
      }
      nextCluster.status = transitionCluster(cluster.status, "观察中", "authorized_human");
      nextCluster.updated_at = input.occurred_at;
      nextImprovement = cloneW6Improvement(improvement);
      nextImprovement.status = transitionImprovement(improvement.status, "观察中", "authorized_human");
      nextImprovement.current_observation_cycle_id = input.cycle_id;
      nextImprovement.updated_at = input.occurred_at;
      appendedCycle = {
        cycle_id: input.cycle_id,
        cluster_id: cluster.cluster_id,
        improvement_id: improvement.improvement_id,
        ordinal: 1,
        trigger: "initial_observation",
        triggering_case_ids: [...cluster.member_case_ids],
        triggering_case_snapshots: this.#authoritativeW6MembershipSnapshots(cluster.cluster_id)
          .map(cloneW6MembershipSnapshot),
        clock_source: input.clock_source,
        opened_at: input.occurred_at,
        opened_by: clonePrincipal(authorization.principal),
        authorization_policy_version: authorization.policy_version,
      };
      reason = input.reason;
    } else if (input.action === "record_day_7" || input.action === "record_day_30") {
      const horizon = input.action === "record_day_7" ? 7 : 30;
      const cycle = cycles.find((record) => record.cycle_id === input.cycle_id);
      const expectedAt = cycle ? exactWindowTimestamp(cycle.opened_at, horizon) : null;
      const authorizedRecurrenceSources = cycle && expectedAt
        ? this.#w6AuthorizedRecurrenceSources(cycle, expectedAt)
        : [];
      const expectedRecurrenceCaseIds = authorizedRecurrenceSources.map((record) => record.case_id);
      const day7Checkpoint = checkpoints.find((record) =>
        record.cycle_id === input.cycle_id && record.horizon_days === 7
      );
      const hasValidRecurrenceCaseIds = isSortedUniqueNonEmptyStringsOrEmpty(input.recurrence_case_ids);
      if (
        horizon === 30 &&
        day7Checkpoint &&
        hasValidRecurrenceCaseIds &&
        day7Checkpoint.recurrence_case_ids.some((caseId) => !input.recurrence_case_ids.includes(caseId))
      ) {
        throw new Error("W6 day-30 recurrence checkpoint must cumulatively include every day-7 recurrence case");
      }
      if (
        cluster.status !== "观察中" ||
        !improvement ||
        improvement.status !== "观察中" ||
        improvement.current_observation_cycle_id !== input.cycle_id ||
        !cycle ||
        expectedAt === null ||
        input.clock_source !== cycle.clock_source ||
        input.occurred_at !== expectedAt ||
        !hasValidRecurrenceCaseIds ||
        !sameJson(input.recurrence_case_ids, expectedRecurrenceCaseIds) ||
        (
          input.related_task_volume !== null &&
          (
            !Number.isInteger(input.related_task_volume) ||
            input.related_task_volume <= 0 ||
            input.related_task_volume < input.recurrence_case_ids.length
          )
        ) ||
        !isNonEmptyString(input.checkpoint_id) ||
        checkpoints.some((record) => record.checkpoint_id === input.checkpoint_id) ||
        (
          horizon === 30 &&
          !day7Checkpoint
        )
      ) {
        throw new Error(`W6 day-${horizon} checkpoint requires the exact clock/window and coherent observation state`);
      }
      const recurrenceCaseSnapshots = authorizedRecurrenceSources;
      appendedCycle = cycle;
      appendedCheckpoint = {
        checkpoint_id: input.checkpoint_id,
        event_id: event.event_id,
        cluster_id: cluster.cluster_id,
        improvement_id: improvement.improvement_id,
        cycle_id: cycle.cycle_id,
        horizon_days: horizon,
        clock_source: cycle.clock_source,
        window_opened_at: cycle.opened_at,
        expected_at: expectedAt,
        recorded_at: input.occurred_at,
        recurrence_case_ids: [...input.recurrence_case_ids],
        recurrence_case_snapshots: recurrenceCaseSnapshots,
        recurrence_count: input.recurrence_case_ids.length,
        related_task_volume: input.related_task_volume,
        recurrence_rate: input.related_task_volume === null
          ? null
          : input.recurrence_case_ids.length / input.related_task_volume,
      };
      reason = `Deterministic day-${horizon} observation checkpoint using ${cycle.clock_source} clock.`;
    } else if (input.action === "archive_observation") {
      const cycle = cycles.find((record) => record.cycle_id === input.cycle_id);
      const cycleCheckpoints = checkpoints.filter((record) => record.cycle_id === input.cycle_id);
      const day7Checkpoint = cycleCheckpoints.find((record) => record.horizon_days === 7);
      const day30Checkpoint = cycleCheckpoints.find((record) => record.horizon_days === 30);
      const checkpointsUseExactClock = cycle !== undefined &&
        day7Checkpoint !== undefined &&
        day30Checkpoint !== undefined &&
        day7Checkpoint.clock_source === cycle.clock_source &&
        day30Checkpoint.clock_source === cycle.clock_source &&
        day7Checkpoint.window_opened_at === cycle.opened_at &&
        day30Checkpoint.window_opened_at === cycle.opened_at &&
        day7Checkpoint.expected_at === exactWindowTimestamp(cycle.opened_at, 7) &&
        day30Checkpoint.expected_at === exactWindowTimestamp(cycle.opened_at, 30) &&
        day7Checkpoint.recorded_at === day7Checkpoint.expected_at &&
        day30Checkpoint.recorded_at === day30Checkpoint.expected_at;
      if (
        cluster.status !== "观察中" ||
        !improvement ||
        improvement.status !== "观察中" ||
        improvement.current_observation_cycle_id !== input.cycle_id ||
        !cycle ||
        !checkpointsUseExactClock ||
        !day30Checkpoint ||
        Date.parse(input.occurred_at) < Date.parse(day30Checkpoint.recorded_at) ||
        !isNonEmptyString(input.human_conclusion) ||
        !isNonEmptyString(input.reason)
      ) {
        throw new Error(
          "W6 archive requires exact day-7/day-30 checkpoint clocks, occurred_at no earlier than day-30 recorded_at, and a non-empty authorized human conclusion",
        );
      }
      nextCluster.status = transitionCluster(cluster.status, "已归档", "authorized_human");
      nextCluster.updated_at = input.occurred_at;
      nextImprovement = cloneW6Improvement(improvement);
      nextImprovement.status = transitionImprovement(improvement.status, "已完成", "authorized_human");
      nextImprovement.human_conclusion = input.human_conclusion;
      nextImprovement.updated_at = input.occurred_at;
      appendedCycle = cycle;
      reason = input.human_conclusion;
    } else if (input.action === "intake_active_observation_recurrence") {
      const cycle = cycles.find((record) => record.cycle_id === input.cycle_id);
      const triggerIds = sortedUniqueStrings(input.triggering_case_ids);
      const unionCaseIds = sortedUniqueStrings([...cluster.member_case_ids, ...triggerIds]);
      const day7Checkpoint = checkpoints.find((record) =>
        record.cycle_id === input.cycle_id && record.horizon_days === 7
      );
      const day30Checkpoint = checkpoints.find((record) =>
        record.cycle_id === input.cycle_id && record.horizon_days === 30
      );
      const conflictingClusterId = triggerIds
        .map((caseId) => this.#w6ClusterIdByCaseId.get(caseId))
        .find((clusterId) => clusterId !== undefined && clusterId !== cluster.cluster_id);
      if (conflictingClusterId) {
        throw new Error(`W6 active recurrence case already belongs to another cluster ${conflictingClusterId}`);
      }
      if (
        cluster.status !== "观察中" ||
        !improvement ||
        improvement.status !== "观察中" ||
        cluster.active_improvement_id !== improvement.improvement_id ||
        improvement.current_observation_cycle_id !== input.cycle_id ||
        cycles.at(-1)?.cycle_id !== input.cycle_id ||
        !cycle ||
        day30Checkpoint !== undefined ||
        triggerIds.length === 0 ||
        !sameJson(triggerIds, input.triggering_case_ids) ||
        triggerIds.some((caseId) => cluster.member_case_ids.includes(caseId)) ||
        !sameJson(input.case_ids, unionCaseIds) ||
        input.clock_source !== cycle.clock_source ||
        !isNonEmptyString(input.intake_id) ||
        [...this.#w6ActiveRecurrenceIntakesByClusterId.values()].flat()
          .some((record) => record.intake_id === input.intake_id) ||
        !/^[a-f0-9]{64}$/iu.test(input.n5_validation_fingerprint) ||
        !isNonEmptyString(input.reason) ||
        !authorization ||
        !aiValidation ||
        aiValidation.action !== "intake_active_observation_recurrence" ||
        aiValidation.n5_candidate_fingerprint !== input.n5_validation_fingerprint ||
        Date.parse(input.occurred_at) <= Date.parse(cycle.opened_at) ||
        Date.parse(input.occurred_at) > Date.parse(exactWindowTimestamp(cycle.opened_at, 30))
      ) {
        throw new Error("W6 active-observation recurrence intake command is invalid");
      }
      const triggerSnapshots = triggerIds.map((caseId) => {
        const snapshot = this.#requireW6IndependentClosedCase(caseId);
        const caseRecord = this.casesById.get(caseId)!;
        if (
          caseRecord.closed_at === null ||
          !isIsoTimestamp(caseRecord.closed_at) ||
          violatesW6ActiveIntakeObservationWindow({
            opened_at: cycle.opened_at,
            occurred_at: input.occurred_at,
            case_closed_at: caseRecord.closed_at,
            day7_checkpoint_exists: day7Checkpoint !== undefined,
          })
        ) {
          throw new Error(
            "W6 active recurrence trigger closed_at must be inside the current authorized observation horizon",
          );
        }
        return snapshot;
      });
      if (input.expected_w6_state_fingerprint !== this.#w6StateFingerprint(cluster.cluster_id)) {
        throw new Error("W6 active-observation recurrence intake command is invalid");
      }
      nextCluster.member_case_ids = unionCaseIds;
      nextCluster.recurrence_count += triggerIds.length;
      nextCluster.updated_at = input.occurred_at;
      writeImprovement = false;
      appendedCycle = cycle;
      appendedIntake = {
        intake_id: input.intake_id,
        event_id: event.event_id,
        cluster_id: cluster.cluster_id,
        improvement_id: improvement.improvement_id,
        cycle_id: cycle.cycle_id,
        triggering_case_ids: triggerIds,
        triggering_case_snapshots: triggerSnapshots,
        n5_validation_fingerprint: input.n5_validation_fingerprint,
        clock_source: input.clock_source,
        observed_at: input.occurred_at,
        authorized_by: clonePrincipal(authorization.principal),
        authorization_policy_version: authorization.policy_version,
      };
      reason = input.reason;
    } else if (input.action === "reopen_recurrence") {
      const triggerIds = sortedUniqueStrings(input.triggering_case_ids);
      const unionCaseIds = sortedUniqueStrings([...cluster.member_case_ids, ...triggerIds]);
      const cycleExists = cycles.some((record) => record.cycle_id === input.cycle_id);
      const lastArchiveReceipt = (this.#w6ReceiptsByClusterId.get(cluster.cluster_id) ?? [])
        .filter((record) =>
          record.action === "archive_observation" &&
          record.improvement_id === input.improvement_id
        )
        .at(-1);
      const conflictingClusterId = triggerIds
        .map((caseId) => this.#w6ClusterIdByCaseId.get(caseId))
        .find((clusterId) => clusterId !== undefined && clusterId !== cluster.cluster_id);
      if (conflictingClusterId) {
        throw new W6TransitionFailure(
          "concurrency_conflict",
          `W6 recurrence case already belongs to another cluster ${conflictingClusterId}`,
        );
      }
      if (
        cluster.status !== "已归档" ||
        !improvement ||
        improvement.status !== "已完成" ||
        improvement.current_observation_cycle_id !== cycles.at(-1)?.cycle_id ||
        !lastArchiveReceipt ||
        triggerIds.length === 0 ||
        !sameJson(triggerIds, input.triggering_case_ids) ||
        triggerIds.some((caseId) => cluster.member_case_ids.includes(caseId)) ||
        !sameJson(input.case_ids, unionCaseIds) ||
        !isNonEmptyString(input.cycle_id) ||
        cycleExists ||
        input.clock_source !== improvement.clock_source ||
        !isNonEmptyString(input.reason) ||
        !authorization
      ) {
        throw new Error("W6 recurrence reopen command is invalid");
      }
      const triggerSnapshots = triggerIds.map((caseId) => {
        let snapshot: W6CaseMembershipSnapshot;
        try {
          snapshot = this.#requireW6IndependentClosedCase(caseId);
        } catch {
          throw new W6TransitionFailure(
            "w5_closure_provenance_failure",
            `W6 recurrence case ${caseId} lost its repository-issued W5 closure provenance`,
          );
        }
        const caseRecord = this.casesById.get(caseId)!;
        if (
          caseRecord.closed_at === null ||
          !isIsoTimestamp(caseRecord.closed_at) ||
          Date.parse(caseRecord.closed_at) <= Date.parse(lastArchiveReceipt.committed_at) ||
          Date.parse(caseRecord.closed_at) > Date.parse(input.occurred_at)
        ) {
          throw new W6TransitionFailure(
            "invalid_state",
            "W6 recurrence trigger closed_at must be strictly later than the previous archive and no later than reopen occurred_at",
          );
        }
        return snapshot;
      });
      nextCluster.status = transitionCluster(cluster.status, "观察中", "authorized_human");
      nextCluster.member_case_ids = unionCaseIds;
      nextCluster.recurrence_count += triggerIds.length;
      nextCluster.updated_at = input.occurred_at;
      nextImprovement = cloneW6Improvement(improvement);
      nextImprovement.status = transitionImprovement(improvement.status, "观察中", "authorized_human");
      nextImprovement.current_observation_cycle_id = input.cycle_id;
      nextImprovement.human_conclusion = null;
      nextImprovement.updated_at = input.occurred_at;
      appendedCycle = {
        cycle_id: input.cycle_id,
        cluster_id: cluster.cluster_id,
        improvement_id: improvement.improvement_id,
        ordinal: cycles.length + 1,
        trigger: "recurrence_reopen",
        triggering_case_ids: triggerIds,
        triggering_case_snapshots: triggerSnapshots,
        clock_source: input.clock_source,
        opened_at: input.occurred_at,
        opened_by: clonePrincipal(authorization.principal),
        authorization_policy_version: authorization.policy_version,
      };
      reason = input.reason;
    } else {
      throw new Error("W6 transition action is unsupported");
    }

    if (!hasSyntheticW6ClusterBoundary(nextCluster)) {
      throw new Error("W6 next cluster boundary is invalid");
    }
    if (nextImprovement && !hasSyntheticW6ImprovementBoundary(nextImprovement)) {
      throw new Error("W6 next improvement boundary is invalid");
    }
    const phase = w6PhaseForAction(input.action);
    const historyEntry: W6HistoryEntry = {
      history_id: input.history_id,
      event_id: event.event_id,
      phase,
      action: input.action,
      case_ids: [...input.case_ids],
      cluster_id: cluster.cluster_id,
      improvement_id: input.improvement_id,
      cycle_id: appendedCycle?.cycle_id ?? null,
      previous_cluster_status: cluster.status,
      next_cluster_status: nextCluster.status,
      previous_improvement_status: previousImprovementStatus,
      next_improvement_status: nextImprovement?.status ?? null,
      reason,
      principal: authorization ? clonePrincipal(authorization.principal) : null,
      authorization_policy_version: authorization?.policy_version ?? null,
      occurred_at: input.occurred_at,
    };

    this.#w6ClustersById.set(cluster.cluster_id, cloneW6Cluster(nextCluster));
    if (
      input.action === "reopen_recurrence" ||
      input.action === "intake_active_observation_recurrence"
    ) {
      const previousMembershipKey = w6MembershipKey(cluster.member_case_ids);
      if (this.#w6ClusterIdByMembershipKey.get(previousMembershipKey) === cluster.cluster_id) {
        this.#w6ClusterIdByMembershipKey.delete(previousMembershipKey);
      }
      this.#w6ClusterIdByMembershipKey.set(w6MembershipKey(nextCluster.member_case_ids), cluster.cluster_id);
      for (const caseId of nextCluster.member_case_ids) {
        this.#w6ClusterIdByCaseId.set(caseId, cluster.cluster_id);
      }
    }
    if (nextImprovement && writeImprovement) {
      this.#w6ImprovementsById.set(nextImprovement.improvement_id, cloneW6Improvement(nextImprovement));
    }
    if (appendedCycle && !cycles.some((record) => record.cycle_id === appendedCycle?.cycle_id)) {
      this.#w6ObservationCyclesByClusterId.set(cluster.cluster_id, [...cycles, cloneW6Cycle(appendedCycle)]);
    }
    if (appendedCheckpoint) {
      this.#w6ObservationCheckpointsByClusterId.set(cluster.cluster_id, [
        ...checkpoints,
        cloneW6Checkpoint(appendedCheckpoint),
      ]);
    }
    if (appendedIntake) {
      this.#w6ActiveRecurrenceIntakesByClusterId.set(cluster.cluster_id, [
        ...(this.#w6ActiveRecurrenceIntakesByClusterId.get(cluster.cluster_id) ?? []),
        cloneW6ActiveRecurrenceIntake(appendedIntake),
      ]);
    }
    this.#w6HistoryEntriesByClusterId.set(cluster.cluster_id, [
      ...(this.#w6HistoryEntriesByClusterId.get(cluster.cluster_id) ?? []),
      cloneW6HistoryEntry(historyEntry),
    ]);
    const receipt = this.#appendW6Receipt({
      receipt_id: input.receipt_id,
      event_id: event.event_id,
      phase,
      action: input.action,
      case_ids: [...input.case_ids],
      cluster_id: cluster.cluster_id,
      improvement_id: input.improvement_id,
      target_fingerprint: authorization?.target_fingerprint ?? null,
      command_fingerprint: event.fingerprint,
      history_id: historyEntry.history_id,
      cycle_id: appendedCycle?.cycle_id ?? null,
      checkpoint_id: appendedCheckpoint?.checkpoint_id ?? null,
      committed_at: input.occurred_at,
    });
    if (input.action === "reopen_recurrence") {
      this.#w6RecurrenceReceiptByKey.set(
        `${cluster.cluster_id}:${w6MembershipKey(input.triggering_case_ids)}`,
        {
          receipt_id: receipt.receipt_id,
          semantic_fingerprint: w6RecurrenceSemanticFingerprint(input),
          stable_semantic_fingerprint: stableRecurrenceSemanticFingerprint,
        },
      );
    }
    return this.#w6CommitResult(
      "committed",
      cluster.cluster_id,
      appendedCycle,
      appendedCheckpoint,
      receipt,
      appendedIntake,
    );
  }

  #requireActiveW3Write(caseId: string): void {
    const eventContext = this.workflowEventContext.getStore();
    const caseOwner = this.caseLockContext.getStore()?.get(caseId);
    if (
      !eventContext ||
      this.activeWorkflowEventOwners.get(eventContext.event_id) !== eventContext.owner ||
      !caseOwner ||
      this.activeCaseLockOwners.get(caseId) !== caseOwner
    ) {
      throw new Error("W3 proposal provenance invariant requires an active workflow event and case lock");
    }
  }

  #requireActiveW5Write(input: W5AtomicTransition): W5AuthorizationGrantClaims {
    const caseId = input.expected_case.case_id;
    const eventContext = this.workflowEventContext.getStore();
    const caseOwner = this.caseLockContext.getStore()?.get(caseId);
    const authorizationContext = this.w5AuthorizationContext.getStore();
    const authorization = authorizationContext?.claims;
    const binding = w5TransitionAuthorizationBinding(input);
    if (
      !eventContext ||
      this.activeWorkflowEventOwners.get(eventContext.event_id) !== eventContext.owner ||
      !caseOwner ||
      this.activeCaseLockOwners.get(caseId) !== caseOwner ||
      !authorizationContext ||
      !authorization ||
      !this.activeW5AuthorizationOwners.has(authorizationContext.owner) ||
      !binding ||
      authorization.workflow !== "W5" ||
      authorization.event_id !== eventContext.event_id ||
      authorization.case_id !== caseId ||
      authorization.work_order_id !== input.expected_work_order.work_order_id ||
      authorization.action !== binding.action ||
      authorization.target_fingerprint !== createWorkflowEventFingerprint(binding.target) ||
      authorization.command_fingerprint !== eventContext.fingerprint ||
      !sameJson(authorization.principal, binding.authorization_record.principal) ||
      authorization.policy_version !== binding.authorization_record.authorization_policy_version
    ) {
      throw new Error(
        "W5 authorization provenance invariant requires an active event, case lock, and matching trusted capability",
      );
    }
    return cloneW5AuthorizationClaims(authorization);
  }

  private requireAuthorizedW3Action(input: {
    event_id: string;
    case_id: string;
    action: W3AuthorizedAction;
    target: JsonValue;
  }): W3AuthorizationGrantClaims {
    const authorizationContext = this.w3AuthorizationContext.getStore();
    const authorization = authorizationContext?.claims;
    if (
      !authorizationContext ||
      !authorization ||
      !this.activeW3AuthorizationOwners.has(authorizationContext.owner) ||
      authorization.workflow !== "W3" ||
      authorization.event_id !== input.event_id ||
      authorization.case_id !== input.case_id ||
      authorization.action !== input.action ||
      authorization.target_fingerprint !== authorizationTargetFingerprint(input.target)
    ) {
      throw new Error("W3 authorization capability invariant violation");
    }
    return cloneAuthorizationClaims(authorization);
  }

  async runAuthorizedW3Action<T>(
    input: {
      grant: W3AuthorizationGrant;
      claims: W3AuthorizationGrantClaims;
    },
    operation: (authorization: W3AuthorizationGrantClaims) => Promise<T>,
  ): Promise<T> {
    const trustedClaims = this.w3AuthorizationGrantConsumer.consume(input.grant);
    if (!trustedClaims) {
      throw new Error("W3 authorization capability is unknown or already consumed");
    }
    const eventContext = this.workflowEventContext.getStore();
    const caseOwner = this.caseLockContext.getStore()?.get(trustedClaims.case_id);
    if (
      !hasValidAuthorizationClaims(trustedClaims) ||
      !sameJson(trustedClaims, input.claims) ||
      eventContext?.event_id !== trustedClaims.event_id ||
      eventContext.fingerprint !== trustedClaims.command_fingerprint ||
      !caseOwner ||
      this.activeCaseLockOwners.get(trustedClaims.case_id) !== caseOwner
    ) {
      throw new Error("W3 authorization capability claims or execution context are invalid");
    }
    const owner = Symbol(`${trustedClaims.event_id}:${trustedClaims.action}`);
    this.activeW3AuthorizationOwners.add(owner);
    try {
      return await this.w3AuthorizationContext.run(
        { claims: cloneAuthorizationClaims(trustedClaims), owner },
        () => operation(cloneAuthorizationClaims(trustedClaims)),
      );
    } finally {
      this.activeW3AuthorizationOwners.delete(owner);
    }
  }

  async runAuthorizedW5Action<T>(
    input: {
      grant: W5AuthorizationGrant;
      claims: W5AuthorizationGrantClaims;
    },
    operation: (authorization: W5AuthorizationGrantClaims) => Promise<T>,
  ): Promise<T> {
    const trustedClaims = this.w5AuthorizationGrantConsumer.consume(input.grant);
    if (!trustedClaims) {
      throw new Error("W5 authorization capability is unknown or already consumed");
    }
    const eventContext = this.workflowEventContext.getStore();
    const caseOwner = this.caseLockContext.getStore()?.get(trustedClaims.case_id);
    if (
      !hasValidW5AuthorizationClaims(trustedClaims) ||
      !sameJson(trustedClaims, input.claims) ||
      eventContext?.event_id !== trustedClaims.event_id ||
      eventContext.fingerprint !== trustedClaims.command_fingerprint ||
      this.activeWorkflowEventOwners.get(trustedClaims.event_id) !== eventContext.owner ||
      !caseOwner ||
      this.activeCaseLockOwners.get(trustedClaims.case_id) !== caseOwner
    ) {
      throw new Error("W5 authorization capability claims or execution context are invalid");
    }
    const owner = Symbol(`${trustedClaims.event_id}:${trustedClaims.action}`);
    this.activeW5AuthorizationOwners.add(owner);
    try {
      return await this.w5AuthorizationContext.run(
        { claims: cloneW5AuthorizationClaims(trustedClaims), owner },
        () => operation(cloneW5AuthorizationClaims(trustedClaims)),
      );
    } finally {
      this.activeW5AuthorizationOwners.delete(owner);
    }
  }

  async runAuthorizedW6Action<T>(
    input: {
      grant: W6AuthorizationGrant;
      claims: W6AuthorizationGrantClaims;
    },
    operation: (authorization: W6AuthorizationGrantClaims) => Promise<T>,
  ): Promise<T> {
    const trustedClaims = this.w6AuthorizationGrantConsumer.consume(input.grant);
    if (!trustedClaims) {
      throw new W6AuthorizationCapabilityError(
        "W6 authorization capability is unknown or already consumed",
      );
    }
    const eventContext = this.workflowEventContext.getStore();
    const heldW6Resources = this.w6ResourceLockContext.getStore();
    const hasEveryCaseLock = trustedClaims.case_ids.every((caseId) => {
      const owner = this.caseLockContext.getStore()?.get(caseId);
      return owner !== undefined && this.activeCaseLockOwners.get(caseId) === owner;
    });
    const clusterKey = `cluster:${trustedClaims.cluster_id}`;
    const clusterOwner = heldW6Resources?.get(clusterKey);
    const improvementKey = trustedClaims.improvement_id === null
      ? null
      : `improvement:${trustedClaims.improvement_id}`;
    const improvementOwner = improvementKey === null ? null : heldW6Resources?.get(improvementKey);
    if (
      !hasValidW6AuthorizationClaims(trustedClaims) ||
      !sameJson(trustedClaims, input.claims) ||
      eventContext?.event_id !== trustedClaims.event_id ||
      eventContext.fingerprint !== trustedClaims.command_fingerprint ||
      this.activeWorkflowEventOwners.get(trustedClaims.event_id) !== eventContext.owner ||
      !hasEveryCaseLock ||
      !clusterOwner ||
      this.activeW6ResourceLockOwners.get(clusterKey) !== clusterOwner ||
      (
        improvementKey !== null &&
        (!improvementOwner || this.activeW6ResourceLockOwners.get(improvementKey) !== improvementOwner)
      )
    ) {
      throw new W6AuthorizationCapabilityError(
        "W6 authorization capability claims or execution context are invalid",
      );
    }
    const owner = Symbol(`${trustedClaims.event_id}:${trustedClaims.action}`);
    this.activeW6AuthorizationOwners.add(owner);
    try {
      return await this.w6AuthorizationContext.run(
        { claims: cloneW6AuthorizationClaims(trustedClaims), owner },
        () => operation(cloneW6AuthorizationClaims(trustedClaims)),
      );
    } finally {
      this.activeW6AuthorizationOwners.delete(owner);
    }
  }

  async runValidatedW6AiAction<T>(
    input: {
      grant: W6AiValidationGrant;
      claims: W6AiValidationGrantClaims;
    },
    operation: (validation: W6AiValidationGrantClaims) => Promise<T>,
  ): Promise<T> {
    const stored = typeof input.grant === "object" && input.grant !== null
      ? this.#w6AiValidationGrants.get(input.grant)
      : undefined;
    const trustedClaims = stored && !stored.consumed
      ? cloneW6AiValidationClaims(stored.claims)
      : null;
    if (!trustedClaims) {
      throw new Error("W6 AI validation capability is unknown or already consumed");
    }
    stored!.consumed = true;
    const eventContext = this.workflowEventContext.getStore();
    const authorizationContext = this.w6AuthorizationContext.getStore();
    const authorization = authorizationContext?.claims;
    const heldW6Resources = this.w6ResourceLockContext.getStore();
    const hasEveryCaseLock = trustedClaims.case_ids.every((caseId) => {
      const owner = this.caseLockContext.getStore()?.get(caseId);
      return owner !== undefined && this.activeCaseLockOwners.get(caseId) === owner;
    });
    const clusterKey = `cluster:${trustedClaims.cluster_id}`;
    const improvementKey = `improvement:${trustedClaims.improvement_id}`;
    const clusterOwner = heldW6Resources?.get(clusterKey);
    const improvementOwner = heldW6Resources?.get(improvementKey);
    if (
      !hasValidW6AiValidationClaims(trustedClaims) ||
      !sameJson(trustedClaims, input.claims) ||
      eventContext?.event_id !== trustedClaims.event_id ||
      eventContext.fingerprint !== trustedClaims.command_fingerprint ||
      this.activeWorkflowEventOwners.get(trustedClaims.event_id) !== eventContext.owner ||
      !authorizationContext ||
      !authorization ||
      !this.activeW6AuthorizationOwners.has(authorizationContext.owner) ||
      authorization.action !== trustedClaims.action ||
      authorization.phase !== trustedClaims.phase ||
      authorization.event_id !== trustedClaims.event_id ||
      authorization.command_fingerprint !== trustedClaims.command_fingerprint ||
      authorization.target_fingerprint !== trustedClaims.authorization_target_fingerprint ||
      !sameJson(authorization.case_ids, trustedClaims.case_ids) ||
      authorization.cluster_id !== trustedClaims.cluster_id ||
      authorization.improvement_id !== trustedClaims.improvement_id ||
      !hasEveryCaseLock ||
      !clusterOwner ||
      this.activeW6ResourceLockOwners.get(clusterKey) !== clusterOwner ||
      !improvementOwner ||
      this.activeW6ResourceLockOwners.get(improvementKey) !== improvementOwner
    ) {
      throw new Error("W6 AI validation capability claims or execution context are invalid");
    }
    const owner = Symbol(`${trustedClaims.event_id}:${trustedClaims.action}:${trustedClaims.node}`);
    this.activeW6AiValidationOwners.add(owner);
    try {
      return await this.w6AiValidationContext.run(
        { claims: cloneW6AiValidationClaims(trustedClaims), owner },
        () => operation(cloneW6AiValidationClaims(trustedClaims)),
      );
    } finally {
      this.activeW6AiValidationOwners.delete(owner);
    }
  }

  validateAndIssueW6AiAction(input: W6AiValidationGrantIssueInput): {
    grant: W6AiValidationGrant;
    claims: W6AiValidationGrantClaims;
  } {
    const eventContext = this.workflowEventContext.getStore();
    if (
      !eventContext ||
      this.activeWorkflowEventOwners.get(eventContext.event_id) !== eventContext.owner ||
      eventContext.event_id !== input.event_id ||
      eventContext.fingerprint !== input.command_fingerprint
    ) {
      throw new Error("W6 AI validation receipt can be issued only inside its active workflow event");
    }
    const transition = snapshotW6AtomicTransition(input.transition);
    if (transition.action === "start_improvement" && this.approvedN6CatalogFingerprint === null) {
      throw new Error("W6 N6 validation requires one configured approved hypothesis catalog");
    }
    const claims = validateW6AiValidationGrantIssue(
      input,
      this.approvedN6CatalogFingerprint ?? "",
    );
    const cluster = this.#w6ClustersById.get(transition.cluster_id);
    if (!cluster) throw new Error("W6 AI validation target cluster does not exist");
    this.#verifyW6State(cluster.cluster_id);
    if (transition.action === "start_improvement") {
      if (
        cluster.status !== "待审核" ||
        cluster.active_improvement_id !== null ||
        !sameJson(cluster.member_case_ids, transition.case_ids) ||
        w6ClusterFingerprint(cluster) !== transition.expected_cluster_fingerprint ||
        transition.expected_improvement_fingerprint !== null
      ) {
        throw new Error("W6 N6 validation target is not the authoritative reviewed cluster");
      }
      this.#assertW6MembershipSnapshotsUnchanged(cluster.cluster_id);
      this.#validateW6N6AuthoritativeRequest(input);
    } else {
      this.#validateW6N5ActiveIntakeIssue(
        input,
        claims as W6N5IntakeValidationGrantClaims,
      );
    }
    const grant = Object.freeze(Object.create(null)) as W6AiValidationGrant;
    this.#w6AiValidationGrants.set(grant, {
      claims: cloneW6AiValidationClaims(claims),
      consumed: false,
    });
    return { grant, claims: cloneW6AiValidationClaims(claims) };
  }

  async findRawFeedbackByIdempotencyKey(idempotencyKey: string): Promise<StoredRawFeedback | null> {
    const record = this.rawFeedbackByKey.get(idempotencyKey);
    return record ? cloneRaw(record) : null;
  }

  async insertRawFeedbackIfAbsent(
    record: StoredRawFeedback,
  ): Promise<{ inserted: boolean; record: StoredRawFeedback }> {
    const existing = this.rawFeedbackByKey.get(record.idempotency_key);
    if (existing) {
      return { inserted: false, record: cloneRaw(existing) };
    }
    const stored = cloneRaw(record);
    this.rawFeedbackByKey.set(stored.idempotency_key, stored);
    this.rawFeedbackById.set(stored.feedback_id, stored);
    return { inserted: true, record: cloneRaw(stored) };
  }

  async findRawFeedbackById(feedbackId: string): Promise<StoredRawFeedback | null> {
    const record = this.rawFeedbackById.get(feedbackId);
    return record ? cloneRaw(record) : null;
  }

  async updateRawFeedbackStatus(
    feedbackId: string,
    expected: RawFeedbackStatus,
    next: RawFeedbackStatus,
  ): Promise<{ updated: boolean; record: StoredRawFeedback | null }> {
    const existing = this.rawFeedbackById.get(feedbackId);
    if (!existing || existing.processing_status !== expected) {
      return { updated: false, record: existing ? cloneRaw(existing) : null };
    }
    const updated = cloneRaw({ ...existing, processing_status: next });
    this.rawFeedbackById.set(feedbackId, updated);
    this.rawFeedbackByKey.set(updated.idempotency_key, updated);
    return { updated: true, record: cloneRaw(updated) };
  }

  async findCaseByFeedbackId(feedbackId: string): Promise<FrontHalfCase | null> {
    const caseId = this.caseByFeedbackId.get(feedbackId);
    if (!caseId) return null;
    const record = this.casesById.get(caseId);
    return record ? cloneCase(record) : null;
  }

  async findCaseById(caseId: string): Promise<FrontHalfCase | null> {
    const record = this.casesById.get(caseId);
    return record ? cloneCase(record) : null;
  }

  async findRawFeedbackByCaseId(caseId: string): Promise<StoredRawFeedback | null> {
    for (const [feedbackId, linkedCaseId] of this.caseByFeedbackId.entries()) {
      if (linkedCaseId !== caseId) continue;
      const record = this.rawFeedbackById.get(feedbackId);
      return record ? cloneRaw(record) : null;
    }
    return null;
  }

  async findR3ReferenceDataForCase(caseId: string): Promise<R3CaseReferenceBundle | null> {
    const caseRecord = this.casesById.get(caseId);
    const rawFeedback = await this.findRawFeedbackByCaseId(caseId);
    if (!caseRecord || !rawFeedback) return null;

    const vehicles = caseRecord.entity_candidates.vehicle_ids.flatMap((vehicleId) => {
      const record = this.vehiclesById.get(vehicleId);
      return record ? [cloneVehicle(record)] : [];
    });
    const deliveryTasks = caseRecord.entity_candidates.task_ids.flatMap((taskId) => {
      const record = this.deliveryTasksById.get(taskId);
      return record ? [cloneTask(record)] : [];
    });
    const relatedStationIds = new Set<string>([
      ...caseRecord.entity_candidates.station_names,
      ...vehicles.map((record) => record.station_id),
      ...deliveryTasks.map((record) => record.station_id),
    ]);
    const stations = [...relatedStationIds].flatMap((stationId) => {
      const record = this.stationsById.get(stationId);
      return record ? [cloneStation(record)] : [];
    });
    return {
      case_record: cloneCase(caseRecord),
      raw_feedback: rawFeedback,
      vehicles,
      delivery_tasks: deliveryTasks,
      stations,
    };
  }

  async findRoutingRulesForEntity(
    stationId: string,
    issueType: string,
  ): Promise<R3RoutingRuleReference[]> {
    return [...this.routingRulesById.values()]
      .filter((record) => record.station_id === stationId && record.issue_type === issueType)
      .map(cloneRoutingRule);
  }

  async findSlaTargetReferences(
    routingRuleId: string,
    slaRuleVersion: string,
  ): Promise<R3SlaTargetReference[]> {
    return [...this.slaPoliciesById.values()]
      .filter((record) =>
        record.routing_rule_id === routingRuleId && record.sla_rule_version === slaRuleVersion
      )
      .map(cloneSlaPolicy);
  }

  async listCases(): Promise<FrontHalfCase[]> {
    return [...this.casesById.values()].map(cloneCase);
  }

  async createCaseAndMarkFeedback(
    feedbackId: string,
    record: FrontHalfCase,
  ): Promise<{ created: boolean; record: FrontHalfCase; feedback: StoredRawFeedback }> {
    const existingCase = await this.findCaseByFeedbackId(feedbackId);
    const feedback = this.rawFeedbackById.get(feedbackId);
    if (!feedback) {
      throw new Error(`Raw feedback ${feedbackId} does not exist`);
    }
    if (existingCase) {
      return { created: false, record: existingCase, feedback: cloneRaw(feedback) };
    }
    if (feedback.processing_status !== "待分诊") {
      throw new Error(`Raw feedback ${feedbackId} is not 待分诊`);
    }
    if (this.casesById.has(record.case_id)) {
      throw new Error(`Case id ${record.case_id} already exists`);
    }

    const storedCase = cloneCase(record);
    const updatedFeedback = cloneRaw({ ...feedback, processing_status: "已建案" });
    this.casesById.set(storedCase.case_id, storedCase);
    this.caseByFeedbackId.set(feedbackId, storedCase.case_id);
    this.rawFeedbackById.set(updatedFeedback.feedback_id, updatedFeedback);
    this.rawFeedbackByKey.set(updatedFeedback.idempotency_key, updatedFeedback);
    return {
      created: true,
      record: cloneCase(storedCase),
      feedback: cloneRaw(updatedFeedback),
    };
  }

  async findSameEventCheckByCaseId(caseId: string): Promise<SameEventCheck | null> {
    const record = this.sameEventChecksByCaseId.get(caseId);
    return record ? cloneCheck(record) : null;
  }

  async insertSameEventCheckIfAbsent(
    record: SameEventCheck,
  ): Promise<{ inserted: boolean; record: SameEventCheck }> {
    const existing = this.sameEventChecksByCaseId.get(record.case_id);
    if (existing) {
      if (!this.#hasVerifiedW3Artifact(record.case_id, "same_event_check")) {
        throw new Error("same-event check invariant violation: verified W6 commit receipt is missing or stale");
      }
      return { inserted: false, record: cloneCheck(existing) };
    }
    const stored = cloneCheck(record);
    this.sameEventChecksByCaseId.set(stored.case_id, stored);
    this.#recordVerifiedW3Artifact(stored.case_id, "same_event_check");
    return { inserted: true, record: cloneCheck(stored) };
  }

  async findSameEventResolutionByCaseId(caseId: string): Promise<SameEventHumanResolution | null> {
    const record = this.sameEventResolutionsByCaseId.get(caseId);
    return record ? cloneResolution(record) : null;
  }

  async resolveSameEventCheck(input: {
    resolution_id: string;
    event_id: string;
    case_id: string;
    check_id: string;
    decision: SameEventHumanResolution["decision"];
    principal: W3AuthorizedPrincipal;
    authorization_policy_version: string;
    reason: string;
    decided_at: string;
  }): Promise<{ created: boolean; record: SameEventHumanResolution }> {
    const caseRecord = this.casesById.get(input.case_id);
    if (
      !caseRecord ||
      !hasSyntheticCaseBoundary(caseRecord) ||
      !isNonEmptyString(input.resolution_id) ||
      !isNonEmptyString(input.event_id) ||
      !isNonEmptyString(input.case_id) ||
      !isNonEmptyString(input.check_id) ||
      (input.decision !== "keep_separate" && input.decision !== "confirmed_duplicate") ||
      !hasTrustedPrincipal(input.principal) ||
      !isNonEmptyString(input.authorization_policy_version) ||
      !isNonEmptyString(input.reason) ||
      !isIsoTimestamp(input.decided_at)
    ) {
      throw new Error("same-event decision or authorization evidence violates the W3 invariant");
    }
    const check = this.sameEventChecksByCaseId.get(input.case_id);
    if (
      !check ||
      !this.#hasVerifiedW3Artifact(input.case_id, "same_event_check") ||
      check.check_id !== input.check_id ||
      check.candidate === null ||
      check.review_state !== "pending"
    ) {
      throw new Error("same-event resolution must reference a pending persisted duplicate candidate");
    }
    const authorization = this.requireAuthorizedW3Action({
      event_id: input.event_id,
      case_id: input.case_id,
      action: "resolve_same_event",
      target: {
        kind: "same_event_resolution",
        check_id: input.check_id,
        decision: input.decision,
        candidate_case_id: check.candidate.candidate_case_id,
        check_fingerprint: createWorkflowEventFingerprint(check as unknown as JsonValue),
      },
    });
    if (
      !sameJson(authorization.principal, input.principal) ||
      authorization.policy_version !== input.authorization_policy_version
    ) {
      throw new Error("same-event decision does not match the trusted authorization capability");
    }
    const existing = this.sameEventResolutionsByCaseId.get(input.case_id);
    if (existing) {
      if (!this.#hasVerifiedW3Artifact(input.case_id, "same_event_resolution")) {
        throw new Error("same-event resolution invariant violation: verified commit receipt is missing or stale");
      }
      if (
        existing.check_id !== input.check_id ||
        existing.decision !== input.decision ||
        !sameJson(existing.principal, input.principal) ||
        existing.authorization_policy_version !== input.authorization_policy_version ||
        existing.reason !== input.reason
      ) {
        throw new Error("same-event resolution conflicts with the existing human decision");
      }
      return { created: false, record: cloneResolution(existing) };
    }
    const stored: SameEventHumanResolution = {
      resolution_id: input.resolution_id,
      event_id: input.event_id,
      case_id: input.case_id,
      check_id: input.check_id,
      decision: input.decision,
      principal: clonePrincipal(authorization.principal),
      authorization_policy_version: authorization.policy_version,
      reason: input.reason,
      decided_at: input.decided_at,
    };
    this.sameEventResolutionsByCaseId.set(input.case_id, stored);
    this.#recordVerifiedW3Artifact(input.case_id, "same_event_resolution");
    return { created: true, record: cloneResolution(stored) };
  }

  async findEntityProposalByCaseId(caseId: string): Promise<W3EntityProposal | null> {
    const record = this.entityProposalsByCaseId.get(caseId);
    return record ? cloneEntityProposal(record) : null;
  }

  async saveEntityProposalIfAbsent(
    proposal: W3EntityProposal,
  ): Promise<{ created: boolean; record: W3EntityProposal }> {
    this.#requireActiveW3Write(proposal.case_id);
    const existing = this.entityProposalsByCaseId.get(proposal.case_id);
    if (existing) {
      if (!this.#hasVerifiedW3Artifact(proposal.case_id, "entity_proposal")) {
        throw new Error("entity proposal invariant violation: verified commit receipt is missing or stale");
      }
      if (!sameJson(existing, proposal)) {
        throw new Error("entity proposal conflicts with the persisted N4 proposal");
      }
      return { created: false, record: cloneEntityProposal(existing) };
    }
    const caseRecord = this.casesById.get(proposal.case_id);
    const check = this.sameEventChecksByCaseId.get(proposal.case_id);
    const resolution = this.sameEventResolutionsByCaseId.get(proposal.case_id);
    const candidateTypes = proposal.candidates.map((candidate) => candidate.object_type);
    const candidatesValid =
      proposal.candidates.length === 3 &&
      new Set(candidateTypes).size === 3 &&
      ["vehicle", "delivery_task", "station"].every((type) => candidateTypes.includes(type as typeof candidateTypes[number])) &&
      proposal.candidates.every((candidate) => {
        const allowedIds = candidate.object_type === "vehicle"
          ? caseRecord?.entity_candidates.vehicle_ids
          : candidate.object_type === "delivery_task"
            ? caseRecord?.entity_candidates.task_ids
            : caseRecord?.entity_candidates.station_names;
        return allowedIds?.includes(candidate.object_id) === true &&
          candidate.evidence_span_indices.length > 0 &&
          candidate.evidence_span_indices.every((index) =>
            Number.isInteger(index) && index >= 0 && index < proposal.evidence_spans.length
          );
      });
    const selectedVehicle = proposal.candidates.find((candidate) => candidate.object_type === "vehicle")?.object_id;
    const selectedTask = proposal.candidates.find((candidate) => candidate.object_type === "delivery_task")?.object_id;
    const selectedStation = proposal.candidates.find((candidate) => candidate.object_type === "station")?.object_id;
    const entityReferencesValid = caseRecord !== undefined &&
      this.hasSyntheticReferenceSet(caseRecord) &&
      selectedVehicle !== undefined &&
      selectedTask !== undefined &&
      selectedStation !== undefined &&
      this.hasConsistentSyntheticEntity({
        vehicle_id: selectedVehicle,
        task_id: selectedTask,
        station_id: selectedStation,
      });
    const duplicateGateSatisfied = check !== undefined && (
      check.candidate === null ||
      (resolution !== undefined && resolution.check_id === check.check_id && resolution.decision === "keep_separate")
    );
    const request = caseRecord === undefined ? null : {
        node: AI_NODE_DEFINITIONS.N4.node,
        mode: AI_NODE_DEFINITIONS.N4.mode,
        version: AI_NODE_DEFINITIONS.N4.version,
        object_ref: { object_type: "case", object_id: proposal.case_id },
        input: {
          case_facts: {
            source_ref: caseRecord.source_locator,
            facts: [caseRecord.summary],
          },
          vehicle_candidates: caseRecord.entity_candidates.vehicle_ids.flatMap((vehicleId) => {
            const record = this.vehiclesById.get(vehicleId);
            return record ? [{
              vehicle_id: record.vehicle_id,
              station_id: record.station_id,
              source_ref: record.source_ref,
              evidence_text: record.evidence_text,
            }] : [];
          }),
          task_candidates: caseRecord.entity_candidates.task_ids.flatMap((taskId) => {
            const record = this.deliveryTasksById.get(taskId);
            return record ? [{
              task_id: record.task_id,
              vehicle_id: record.vehicle_id,
              station_id: record.station_id,
              source_ref: record.source_ref,
              evidence_text: record.evidence_text,
            }] : [];
          }),
          site_candidates: caseRecord.entity_candidates.station_names.flatMap((stationId) => {
            const record = this.stationsById.get(stationId);
            return record ? [{
              station_id: record.station_id,
              source_ref: record.source_ref,
              evidence_text: record.evidence_text,
            }] : [];
          }),
        },
      } satisfies AiNodeRunRequest<JsonValue>;
    const requestDefinitionValid = request !== null && validateNodeRequestDefinition(request).valid;
    const inputHashValid = request !== null && proposal.input_hash === createAiInputHash(request);
    const candidateBoundaryValid = request !== null && validateNodeCandidate(
      request,
      {
        payload: {
          candidate_objects: proposal.candidates,
          human_confirmation_required: true,
        },
        evidence_spans: proposal.evidence_spans,
        missing_fields: [],
        confidence: null,
        status: "ok",
      },
    ).valid;
    if (
      !caseRecord ||
      !hasSyntheticCaseBoundary(caseRecord) ||
      caseRecord.status !== "待关联" ||
      caseRecord.formal_entity !== null ||
      caseRecord.formal_entity_confirmation_status !== "待人工确认" ||
      caseRecord.workflow_readiness !== "awaiting_same_event_check" ||
      !check ||
      check.mode !== "same_event_duplicate" ||
      check.node_status !== "ok" ||
      !duplicateGateSatisfied ||
      proposal.node_version !== AI_NODE_DEFINITIONS.N4.version ||
      !isNonEmptyString(proposal.proposal_id) ||
      !isNonEmptyString(proposal.node_run_id) ||
      !requestDefinitionValid ||
      !inputHashValid ||
      !isIsoTimestamp(proposal.created_at) ||
      !candidatesValid ||
      !entityReferencesValid ||
      !candidateBoundaryValid
    ) {
      throw new Error("entity proposal violates the W3 case, same-event, or synthetic gate invariant");
    }
    const stored = cloneEntityProposal(proposal);
    this.entityProposalsByCaseId.set(stored.case_id, stored);
    this.casesById.set(stored.case_id, cloneCase({
      ...caseRecord,
      updated_at: stored.created_at,
      workflow_readiness: "awaiting_formal_entity_confirmation",
    }));
    this.#recordVerifiedW3Artifact(stored.case_id, "entity_proposal");
    return { created: true, record: cloneEntityProposal(stored) };
  }

  async findFormalEntityDecisionByCaseId(caseId: string): Promise<W3FormalEntityDecision | null> {
    const record = this.formalEntityDecisionsByCaseId.get(caseId);
    return record ? cloneFormalEntityDecision(record) : null;
  }

  async confirmFormalEntity(input: { decision: W3FormalEntityDecision }): Promise<
    | { outcome: "created"; record: FrontHalfCase; decision: W3FormalEntityDecision }
    | { outcome: "idempotent"; record: FrontHalfCase; decision: W3FormalEntityDecision }
    | { outcome: "human_decision_conflict"; record: FrontHalfCase; decision: W3FormalEntityDecision }
  > {
    const { decision } = input;
    const caseRecord = this.casesById.get(decision.case_id);
    const proposal = this.entityProposalsByCaseId.get(decision.case_id);
    const entityProposalVerified = this.#hasVerifiedW3Artifact(decision.case_id, "entity_proposal");
    if (
      !caseRecord ||
      !proposal ||
      !entityProposalVerified ||
      !hasSyntheticCaseBoundary(caseRecord) ||
      decision.action !== "confirm_formal_entity" ||
      decision.authorization_state !== "authorized" ||
      !isNonEmptyString(decision.decision_id) ||
      decision.decision_fingerprint !== expectedFormalDecisionFingerprint(decision) ||
      !isNonEmptyString(decision.event_id) ||
      !isNonEmptyString(decision.authorization_policy_version) ||
      !hasTrustedPrincipal(decision.principal) ||
      !isIsoTimestamp(decision.decided_at) ||
      decision.proposal_ref.proposal_type !== "entity_proposal" ||
      proposal.proposal_id !== decision.proposal_ref.proposal_id ||
      proposal.node_run_id !== decision.proposal_ref.node_run_id ||
      proposal.input_hash !== decision.proposal_ref.input_hash ||
      !sameJson(proposal.evidence_spans, decision.evidence_spans)
    ) {
      throw new Error("formal-entity decision must reference the persisted N4 proposal");
    }
    const selected = [
      ["vehicle", decision.formal_entity.vehicle_id],
      ["delivery_task", decision.formal_entity.task_id],
      ["station", decision.formal_entity.station_id],
    ] as const;
    if (!selected.every(([type, id]) => proposal.candidates.some((candidate) => candidate.object_type === type && candidate.object_id === id))) {
      throw new Error("formal entity must select the exact evidence-backed N4 candidates");
    }
    if (
      !this.hasSyntheticReferenceSet(caseRecord) ||
      !this.hasConsistentSyntheticEntity(decision.formal_entity)
    ) {
      throw new Error("formal entity references violate the synthetic read-only boundary");
    }
    const authorization = this.requireAuthorizedW3Action({
      event_id: decision.event_id,
      case_id: decision.case_id,
      action: "confirm_formal_entity",
      target: {
        kind: "formal_entity_confirmation",
        entity_proposal_id: decision.proposal_ref.proposal_id,
        formal_entity: { ...decision.formal_entity },
      },
    });
    if (
      !sameJson(authorization.principal, decision.principal) ||
      authorization.policy_version !== decision.authorization_policy_version
    ) {
      throw new Error("formal-entity decision does not match the trusted authorization capability");
    }
    const existingDecision = this.formalEntityDecisionsByCaseId.get(decision.case_id);
    if (existingDecision) {
      const existingSnapshotValid =
        this.#hasVerifiedW3Artifact(decision.case_id, "formal_entity_decision") &&
        existingDecision.decision_fingerprint === expectedFormalDecisionFingerprint(existingDecision) &&
        sameJson(caseRecord.formal_entity, existingDecision.formal_entity) &&
        caseRecord.formal_entity_confirmation_status === "已人工确认" &&
        (
          (
            caseRecord.status === "待关联" &&
            ["awaiting_responsibility_routing", "awaiting_routing_confirmation"].includes(
              caseRecord.workflow_readiness,
            ) &&
            caseRecord.sla_started_at === null &&
            caseRecord.sla_due_at === null
          ) ||
          (
            (caseRecord.status === "待派单" || caseRecord.status === "处理中") &&
            caseRecord.workflow_readiness === "dispatched" &&
            isIsoTimestamp(caseRecord.sla_started_at) &&
            isIsoTimestamp(caseRecord.sla_due_at)
          )
        );
      if (!existingSnapshotValid) {
        throw new Error("formal-entity decision invariant violation: persisted case or verified commit receipt is inconsistent");
      }
      return existingDecision.decision_fingerprint === decision.decision_fingerprint &&
        sameFormalDecisionMaterial(existingDecision, decision)
        ? {
            outcome: "idempotent",
            record: cloneCase(caseRecord),
            decision: cloneFormalEntityDecision(existingDecision),
          }
        : {
            outcome: "human_decision_conflict",
            record: cloneCase(caseRecord),
            decision: cloneFormalEntityDecision(existingDecision),
          };
    }
    if (
      caseRecord.status !== "待关联" ||
      caseRecord.formal_entity !== null ||
      caseRecord.formal_entity_confirmation_status !== "待人工确认" ||
      caseRecord.workflow_readiness !== "awaiting_formal_entity_confirmation" ||
      caseRecord.sla_started_at !== null ||
      caseRecord.sla_due_at !== null
    ) {
      throw new Error("formal-entity decision violates the W3 state or human gate invariant");
    }
    const updated = cloneCase({
      ...caseRecord,
      formal_entity: { ...decision.formal_entity },
      formal_entity_confirmation_status: "已人工确认",
      updated_at: decision.decided_at,
      workflow_readiness: "awaiting_responsibility_routing",
      pending_confirmation_items: caseRecord.pending_confirmation_items.filter((item) => item !== "formal_entity"),
    });
    const storedDecision = cloneFormalEntityDecision({
      ...decision,
      principal: clonePrincipal(authorization.principal),
      authorization_policy_version: authorization.policy_version,
    });
    this.casesById.set(decision.case_id, updated);
    this.formalEntityDecisionsByCaseId.set(decision.case_id, storedDecision);
    this.#recordVerifiedW3Artifact(decision.case_id, "formal_entity_decision");
    return {
      outcome: "created",
      record: cloneCase(updated),
      decision: cloneFormalEntityDecision(storedDecision),
    };
  }

  async markCaseNeedsSupplement(
    caseId: string,
    missingFields: string[],
    updatedAt: string,
  ): Promise<{ updated: boolean; record: FrontHalfCase }> {
    const caseRecord = this.casesById.get(caseId);
    if (!caseRecord) throw new Error(`Case ${caseId} does not exist`);
    if (caseRecord.status === "待补充") return { updated: false, record: cloneCase(caseRecord) };
    if (caseRecord.status !== "待关联" || caseRecord.formal_entity !== null) {
      throw new Error("only an unconfirmed 待关联 case can return to 待补充");
    }
    const updated = cloneCase({
      ...caseRecord,
      status: "待补充",
      missing_fields: [...new Set([...caseRecord.missing_fields, ...missingFields])].sort(),
      evidence_completeness: "partial",
      updated_at: updatedAt,
      workflow_readiness: "awaiting_formal_entity_confirmation",
    });
    this.casesById.set(caseId, updated);
    return { updated: true, record: cloneCase(updated) };
  }

  async findRoutingProposalByCaseId(caseId: string): Promise<W3RoutingProposal | null> {
    const record = this.routingProposalsByCaseId.get(caseId);
    return record ? cloneRoutingProposal(record) : null;
  }

  async saveRoutingProposalIfAbsent(
    proposal: W3RoutingProposal,
  ): Promise<{ created: boolean; record: W3RoutingProposal }> {
    this.#requireActiveW3Write(proposal.case_id);
    const existing = this.routingProposalsByCaseId.get(proposal.case_id);
    if (existing) {
      if (!this.#hasVerifiedW3Artifact(proposal.case_id, "routing_proposal")) {
        throw new Error("routing proposal invariant violation: verified commit receipt is missing or stale");
      }
      if (!sameJson(existing, proposal)) {
        throw new Error("routing proposal conflicts with the persisted N6 proposal");
      }
      return { created: false, record: cloneRoutingProposal(existing) };
    }
    const caseRecord = this.casesById.get(proposal.case_id);
    const formalDecision = this.formalEntityDecisionsByCaseId.get(proposal.case_id);
    const entityProposal = this.entityProposalsByCaseId.get(proposal.case_id);
    const entityProposalVerified = this.#hasVerifiedW3Artifact(proposal.case_id, "entity_proposal");
    const formalDecisionVerified = this.#hasVerifiedW3Artifact(proposal.case_id, "formal_entity_decision");
    const formalDecisionValid =
      caseRecord !== undefined &&
      formalDecision !== undefined &&
      entityProposal !== undefined &&
      entityProposalVerified &&
      formalDecisionVerified &&
      formalDecision.authorization_state === "authorized" &&
      formalDecision.decision_fingerprint === expectedFormalDecisionFingerprint(formalDecision) &&
      hasTrustedPrincipal(formalDecision.principal) &&
      formalDecision.proposal_ref.proposal_id === entityProposal.proposal_id &&
      formalDecision.proposal_ref.node_run_id === entityProposal.node_run_id &&
      formalDecision.proposal_ref.input_hash === entityProposal.input_hash &&
      sameJson(formalDecision.formal_entity, caseRecord.formal_entity) &&
      sameJson(formalDecision.evidence_spans, entityProposal.evidence_spans);
    const candidatesValid = proposal.candidates.length > 0 && proposal.candidates.every((candidate) => {
      const rule = this.routingRulesById.get(candidate.routing_rule_id);
      const support = candidate.supporting_evidence_indices;
      const counter = candidate.counter_evidence_indices;
      return rule !== undefined &&
        rule.data_scope === "synthetic_experiment" &&
        rule.evidence_class === "enterprise_pending" &&
        rule.source_kind === "registration_workbook" &&
        rule.status === "待企业验证" &&
        rule.station_id === caseRecord?.formal_entity?.station_id &&
        rule.issue_type === caseRecord?.category_detail &&
        rule.rule_version === candidate.rule_version &&
        rule.default_team === candidate.candidate_team &&
        rule.reviewer_role === candidate.candidate_logical_role &&
        rule.sla_rule_version === candidate.sla_rule_version &&
        support.length > 0 &&
        counter.length > 0 &&
        !support.some((index) => counter.includes(index)) &&
        [...support, ...counter].every((index) =>
          Number.isInteger(index) && index >= 0 && index < proposal.evidence_spans.length
        ) &&
        candidate.uncertainties.length > 0 &&
        candidate.uncertainties.every(isNonEmptyString);
    });
    const matchingRules = caseRecord?.formal_entity === null || caseRecord === undefined
      ? []
      : [...this.routingRulesById.values()].filter((rule) =>
          rule.station_id === caseRecord.formal_entity?.station_id &&
          rule.issue_type === caseRecord.category_detail
        );
    const request = caseRecord === undefined || caseRecord.formal_entity === null ? null : {
          node: AI_NODE_DEFINITIONS.N6_RESPONSIBILITY_ROUTING.node,
          mode: AI_NODE_DEFINITIONS.N6_RESPONSIBILITY_ROUTING.mode,
          version: AI_NODE_DEFINITIONS.N6_RESPONSIBILITY_ROUTING.version,
          object_ref: { object_type: "case", object_id: proposal.case_id },
          input: {
            evidence: [
              {
                source_ref: `case:${caseRecord.case_id}`,
                text: `${caseRecord.formal_entity.station_id}|${caseRecord.category_detail}|${caseRecord.formal_entity.vehicle_id}|${caseRecord.formal_entity.task_id}`,
              },
              ...matchingRules.map((rule) => ({ source_ref: rule.source_ref, text: rule.evidence_text })),
            ],
            responsibility_matrix: matchingRules.map((rule) => ({
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
        } satisfies AiNodeRunRequest<JsonValue>;
    const requestDefinitionValid = request !== null && validateNodeRequestDefinition(request).valid;
    const inputHashValid = request !== null && proposal.input_hash === createAiInputHash(request);
    const candidateBoundaryValid = request !== null && validateNodeCandidate(
        request,
        {
          payload: {
            candidates: proposal.candidates,
            human_confirmation_required: true,
          },
          evidence_spans: proposal.evidence_spans,
          missing_fields: [],
          confidence: null,
          status: "ok",
        },
      ).valid;
    if (
      !caseRecord ||
      !hasSyntheticCaseBoundary(caseRecord) ||
      caseRecord.status !== "待关联" ||
      caseRecord.formal_entity === null ||
      caseRecord.formal_entity_confirmation_status !== "已人工确认" ||
      caseRecord.workflow_readiness !== "awaiting_responsibility_routing" ||
      caseRecord.sla_started_at !== null ||
      caseRecord.sla_due_at !== null ||
      !formalDecisionValid ||
      proposal.node_version !== AI_NODE_DEFINITIONS.N6_RESPONSIBILITY_ROUTING.version ||
      !isNonEmptyString(proposal.proposal_id) ||
      !isNonEmptyString(proposal.node_run_id) ||
      !requestDefinitionValid ||
      !inputHashValid ||
      !isIsoTimestamp(proposal.created_at) ||
      !candidatesValid ||
      !candidateBoundaryValid
    ) {
      throw new Error("routing proposal violates the W3 formal-decision, state, or synthetic gate invariant");
    }
    const stored = cloneRoutingProposal(proposal);
    this.routingProposalsByCaseId.set(stored.case_id, stored);
    this.casesById.set(stored.case_id, cloneCase({
      ...caseRecord,
      updated_at: stored.created_at,
      workflow_readiness: "awaiting_routing_confirmation",
    }));
    this.#recordVerifiedW3Artifact(stored.case_id, "routing_proposal");
    return { created: true, record: cloneRoutingProposal(stored) };
  }

  async findRoutingDecisionByCaseId(caseId: string): Promise<W3RoutingDecision | null> {
    const record = this.routingDecisionsByCaseId.get(caseId);
    return record ? cloneRoutingDecision(record) : null;
  }

  async createDispatchIfAbsent(input: {
    expected_case: FrontHalfCase;
    next_case: FrontHalfCase;
    work_order: RuntimeWorkOrder;
    decision: W3RoutingDecision;
  }): Promise<
    | {
        outcome: "created" | "idempotent";
        case: FrontHalfCase;
        work_order: RuntimeWorkOrder;
        decision: W3RoutingDecision;
      }
    | {
        outcome: "human_decision_conflict";
        case: FrontHalfCase;
        work_order: RuntimeWorkOrder;
        decision: W3RoutingDecision;
      }
    | {
        outcome: "concurrency_conflict";
        case: FrontHalfCase;
        work_order: RuntimeWorkOrder | null;
        decision: W3RoutingDecision | null;
      }
  > {
    const caseId = input.expected_case.case_id;
    const current = this.casesById.get(caseId);
    if (!current) {
      throw new Error("dispatch invariant violation: persisted case is missing");
    }
    const caseIds = new Set([
      caseId,
      input.next_case.case_id,
      input.work_order.case_id,
      input.decision.case_id,
    ]);
    if (caseIds.size !== 1) {
      throw new Error("dispatch invariant violation: case identifiers do not match");
    }
    const formalDecision = this.formalEntityDecisionsByCaseId.get(caseId);
    const entityProposal = this.entityProposalsByCaseId.get(caseId);
    const feedback = this.storedFeedbackForCase(caseId);
    const proposal = this.routingProposalsByCaseId.get(caseId);
    const verifiedPrerequisites =
      this.#hasVerifiedW3Artifact(caseId, "entity_proposal") &&
      this.#hasVerifiedW3Artifact(caseId, "formal_entity_decision") &&
      this.#hasVerifiedW3Artifact(caseId, "routing_proposal");
    const selected = proposal?.candidates.find((candidate) =>
      candidate.routing_rule_id === input.decision.rule_ref.routing_rule_id &&
      candidate.rule_version === input.decision.rule_ref.rule_version &&
      candidate.sla_rule_version === input.decision.rule_ref.sla_rule_version &&
      candidate.candidate_team === input.decision.candidate_team &&
      candidate.candidate_logical_role === input.decision.candidate_logical_role &&
      sameJson(candidate.supporting_evidence_indices, input.decision.supporting_evidence_indices) &&
      sameJson(candidate.counter_evidence_indices, input.decision.counter_evidence_indices) &&
      sameJson(candidate.uncertainties, input.decision.uncertainties)
    );
    const routingRule = this.routingRulesById.get(input.decision.rule_ref.routing_rule_id);
    if (
      !proposal ||
      !selected ||
      !verifiedPrerequisites ||
      !routingRule ||
      routingRule.data_scope !== "synthetic_experiment" ||
      routingRule.evidence_class !== "enterprise_pending" ||
      routingRule.source_kind !== "registration_workbook" ||
      routingRule.status !== "待企业验证" ||
      routingRule.rule_version !== input.decision.rule_ref.rule_version ||
      routingRule.sla_rule_version !== input.decision.rule_ref.sla_rule_version ||
      routingRule.default_team !== input.decision.candidate_team ||
      routingRule.reviewer_role !== input.decision.candidate_logical_role ||
      routingRule.station_id !== input.expected_case.formal_entity?.station_id ||
      routingRule.issue_type !== input.expected_case.category_detail ||
      !formalDecision ||
      !entityProposal ||
      !feedback ||
      !hasSyntheticFeedbackBoundary(feedback) ||
      !hasSyntheticCaseBoundary(input.expected_case) ||
      !hasSyntheticCaseBoundary(input.next_case) ||
      input.expected_case.status !== "待关联" ||
      input.expected_case.formal_entity === null ||
      !this.hasSyntheticReferenceSet(input.expected_case) ||
      !this.hasConsistentSyntheticEntity(input.expected_case.formal_entity) ||
      input.expected_case.formal_entity_confirmation_status !== "已人工确认" ||
      input.expected_case.workflow_readiness !== "awaiting_routing_confirmation" ||
      input.expected_case.sla_started_at !== null ||
      input.expected_case.sla_due_at !== null ||
      formalDecision.action !== "confirm_formal_entity" ||
      formalDecision.authorization_state !== "authorized" ||
      !isNonEmptyString(formalDecision.decision_id) ||
      !/^[a-f0-9]{64}$/iu.test(formalDecision.decision_fingerprint) ||
      !isNonEmptyString(formalDecision.event_id) ||
      !isNonEmptyString(formalDecision.authorization_policy_version) ||
      !isIsoTimestamp(formalDecision.decided_at) ||
      !hasTrustedPrincipal(formalDecision.principal) ||
      formalDecision.proposal_ref.proposal_type !== "entity_proposal" ||
      formalDecision.proposal_ref.proposal_id !== entityProposal.proposal_id ||
      formalDecision.proposal_ref.node_run_id !== entityProposal.node_run_id ||
      formalDecision.proposal_ref.input_hash !== entityProposal.input_hash ||
      !sameJson(formalDecision.formal_entity, input.expected_case.formal_entity) ||
      !sameJson(formalDecision.evidence_spans, entityProposal.evidence_spans) ||
      input.decision.action !== "confirm_routing" ||
      input.decision.authorization_state !== "authorized" ||
      !isNonEmptyString(input.decision.decision_id) ||
      input.decision.decision_fingerprint !== expectedRoutingDecisionFingerprint(input.decision) ||
      !isNonEmptyString(input.decision.event_id) ||
      !isNonEmptyString(input.decision.authorization_policy_version) ||
      !hasTrustedPrincipal(input.decision.principal) ||
      !isIsoTimestamp(input.decision.decided_at) ||
      input.decision.proposal_ref.proposal_type !== "routing_proposal" ||
      input.decision.proposal_ref.proposal_id !== proposal.proposal_id ||
      input.decision.proposal_ref.node_run_id !== proposal.node_run_id ||
      input.decision.proposal_ref.input_hash !== proposal.input_hash ||
      !sameJson(input.decision.evidence_spans, proposal.evidence_spans)
    ) {
      throw new Error("dispatch invariant violation: routing decision is not bound to the persisted N6 proposal");
    }
    const policy = this.slaPoliciesById.get(input.decision.rule_ref.sla_policy_id);
    if (
      !policy ||
      policy.data_scope !== "synthetic_experiment" ||
      policy.evidence_class !== "enterprise_pending" ||
      policy.source_kind !== "registration_workbook" ||
      policy.status !== "待企业验证" ||
      !isNonEmptyString(policy.source_ref) ||
      !isNonEmptyString(policy.evidence_text) ||
      policy.policy_version !== input.decision.rule_ref.sla_policy_version ||
      policy.routing_rule_id !== input.decision.rule_ref.routing_rule_id ||
      policy.sla_rule_version !== input.decision.rule_ref.sla_rule_version ||
      policy.first_response_target_minutes !== input.decision.rule_ref.first_response_target_minutes
    ) {
      throw new Error("dispatch invariant violation: routing decision is not bound to the synthetic SLA policy");
    }
    const targetMinutes = input.decision.rule_ref.first_response_target_minutes;
    const expectedSlaStartedAt = new Date(feedback.request.received_at).toISOString();
    const expectedDueAt = Number.isSafeInteger(targetMinutes) && targetMinutes > 0 && targetMinutes <= 1_440
      ? new Date(Date.parse(expectedSlaStartedAt) + targetMinutes * 60_000).toISOString()
      : null;
    if (
      expectedDueAt === null ||
      input.next_case.status !== "待派单" ||
      input.next_case.workflow_readiness !== "dispatched" ||
      input.next_case.formal_entity_confirmation_status !== "已人工确认" ||
      !sameJson(input.next_case.formal_entity, input.expected_case.formal_entity) ||
      input.next_case.sla_started_at !== expectedSlaStartedAt ||
      input.next_case.routing_rule_candidate_id !== input.decision.rule_ref.routing_rule_id ||
      input.next_case.sla_rule_version !== input.decision.rule_ref.sla_rule_version ||
      input.next_case.suggested_team !== input.decision.candidate_team ||
      input.next_case.sla_due_at !== expectedDueAt ||
      input.work_order.team !== input.decision.candidate_team ||
      input.work_order.assignee_role !== input.decision.candidate_logical_role ||
      input.work_order.first_response_target_minutes !== input.decision.rule_ref.first_response_target_minutes ||
      input.work_order.due_at !== input.next_case.sla_due_at ||
      input.work_order.status !== "待接单" ||
      input.work_order.schema_version !== CANONICAL_SCHEMA_VERSION ||
      input.work_order.data_scope !== "synthetic_experiment" ||
      input.work_order.evidence_class !== "synthetic_experiment" ||
      input.work_order.source_kind !== "scenario_runtime" ||
      input.work_order.source_name !== "synthetic_experiment" ||
      input.work_order.legacy_id !== "not_applicable_scenario_runtime" ||
      input.work_order.sla_reset_count !== 0 ||
      input.work_order.source_locator !== `W3:${input.decision.event_id}` ||
      input.work_order.source_sha256 !== input.next_case.source_sha256 ||
      input.next_case.source_sha256 !== input.expected_case.source_sha256 ||
      input.expected_case.source_sha256 !== feedback.content_fingerprint
    ) {
      throw new Error("dispatch invariant violation: case, work order, decision, and SLA snapshots disagree");
    }
    const authorization = this.requireAuthorizedW3Action({
      event_id: input.decision.event_id,
      case_id: input.decision.case_id,
      action: "confirm_routing",
      target: {
        kind: "routing_confirmation",
        routing_proposal_id: input.decision.proposal_ref.proposal_id,
        routing_rule_id: input.decision.rule_ref.routing_rule_id,
        candidate_team: input.decision.candidate_team,
        candidate_logical_role: input.decision.candidate_logical_role,
        sla_rule_version: input.decision.rule_ref.sla_rule_version,
        first_response_target_minutes: input.decision.rule_ref.first_response_target_minutes,
      },
    });
    if (
      !sameJson(authorization.principal, input.decision.principal) ||
      authorization.policy_version !== input.decision.authorization_policy_version
    ) {
      throw new Error("routing decision does not match the trusted authorization capability");
    }
    const existingId = this.workOrderByCaseId.get(caseId);
    if (existingId) {
      const existing = this.workOrdersById.get(existingId);
      const existingDecision = this.routingDecisionsByCaseId.get(caseId);
      if (!existing || !existingDecision) {
        throw new Error("dispatch invariant violation: work-order index or routing decision is inconsistent");
      }
      if (
        !this.#hasVerifiedW3Artifact(caseId, "routing_decision") ||
        !this.#hasVerifiedW3Artifact(caseId, "dispatch_snapshot") ||
        existingDecision.decision_fingerprint !== expectedRoutingDecisionFingerprint(existingDecision)
      ) {
        throw new Error("dispatch invariant violation: verified commit receipt is missing or stale");
      }
      return existingDecision.decision_fingerprint === input.decision.decision_fingerprint &&
        sameRoutingDecisionMaterial(existingDecision, input.decision)
        ? {
            outcome: "idempotent",
            case: cloneCase(current),
            work_order: cloneWorkOrder(existing),
            decision: cloneRoutingDecision(existingDecision),
          }
        : {
            outcome: "human_decision_conflict",
            case: cloneCase(current),
            work_order: cloneWorkOrder(existing),
            decision: cloneRoutingDecision(existingDecision),
          };
    }
    const orphanOrder = [...this.workOrdersById.values()].find((record) => record.case_id === caseId);
    const orphanDecision = this.routingDecisionsByCaseId.get(caseId);
    if (orphanOrder || orphanDecision) {
      throw new Error("dispatch invariant violation: work order or decision exists without its case index");
    }
    if (!sameJson(current, input.expected_case)) {
      return {
        outcome: "concurrency_conflict",
        case: cloneCase(current),
        work_order: null,
        decision: null,
      };
    }
    if (this.workOrdersById.has(input.work_order.work_order_id)) {
      throw new Error(`Work order id ${input.work_order.work_order_id} already exists`);
    }
    const nextCase = cloneCase(input.next_case);
    const workOrder = cloneWorkOrder(input.work_order);
    const decision = cloneRoutingDecision({
      ...input.decision,
      principal: clonePrincipal(authorization.principal),
      authorization_policy_version: authorization.policy_version,
    });
    this.casesById.set(nextCase.case_id, nextCase);
    this.workOrdersById.set(workOrder.work_order_id, workOrder);
    this.workOrderByCaseId.set(workOrder.case_id, workOrder.work_order_id);
    this.routingDecisionsByCaseId.set(decision.case_id, decision);
    this.#recordVerifiedW3Artifact(caseId, "routing_decision");
    this.#recordVerifiedW3Artifact(caseId, "dispatch_snapshot");
    return {
      outcome: "created",
      case: cloneCase(nextCase),
      work_order: cloneWorkOrder(workOrder),
      decision: cloneRoutingDecision(decision),
    };
  }

  async findWorkOrderById(workOrderId: string): Promise<RuntimeWorkOrder | null> {
    const record = this.workOrdersById.get(workOrderId);
    return record ? cloneWorkOrder(record) : null;
  }

  async findWorkOrderByCaseId(caseId: string): Promise<RuntimeWorkOrder | null> {
    const workOrderId = this.workOrderByCaseId.get(caseId);
    if (!workOrderId) return null;
    return this.findWorkOrderById(workOrderId);
  }

  #snapshotW5History(caseId: string): W5History {
    return {
      evidence_submissions: (this.w5EvidenceSubmissionsByCaseId.get(caseId) ?? [])
        .map(cloneW5EvidenceSubmission),
      reply_drafts: (this.w5ReplyDraftsByCaseId.get(caseId) ?? []).map(cloneW5ReplyDraft),
      reply_reviews: (this.w5ReplyReviewsByCaseId.get(caseId) ?? []).map(cloneW5ReplyReview),
      follow_ups: (this.w5FollowUpsByCaseId.get(caseId) ?? []).map(cloneW5FollowUp),
      closure_decisions: (this.w5ClosureDecisionsByCaseId.get(caseId) ?? [])
        .map(cloneW5ClosureDecision),
    };
  }

  #validatedW6ClosedCaseContext(caseId: string): W6ClosedCaseContext {
    const caseRecord = this.casesById.get(caseId);
    const workOrderId = this.workOrderByCaseId.get(caseId);
    const workOrder = workOrderId ? this.workOrdersById.get(workOrderId) : undefined;
    const provenance = this.#w5ClosureProvenanceByCaseId.get(caseId);
    if (
      !caseRecord ||
      !workOrderId ||
      !workOrder ||
      !provenance ||
      workOrder.case_id !== caseId ||
      provenance.case_id !== caseId ||
      provenance.work_order_id !== workOrderId ||
      !hasSyntheticCaseBoundary(caseRecord) ||
      !hasSyntheticWorkOrderBoundary(workOrder)
    ) {
      throw new W6TransitionFailure(
        "w5_closure_provenance_failure",
        `W6 case ${caseId} lacks repository-issued W5 closure provenance`,
      );
    }
    const history = this.#snapshotW5History(caseId);
    let expected: W5ClosureProvenance;
    try {
      expected = createW5ClosureProvenance(caseRecord, workOrder, history);
    } catch {
      throw new W6TransitionFailure(
        "w5_closure_provenance_failure",
        `W6 case ${caseId} has an incomplete or stale W5 closure chain`,
      );
    }
    if (!sameJson(expected, provenance)) {
      throw new W6TransitionFailure(
        "w5_closure_provenance_failure",
        `W6 case ${caseId} W5 closure provenance is stale`,
      );
    }
    return {
      case_record: cloneCase(caseRecord),
      work_order: cloneWorkOrder(workOrder),
      w5_history: history,
      closure_provenance: cloneW5ClosureProvenance(provenance),
    };
  }

  async getW5History(caseId: string): Promise<W5History> {
    return this.#snapshotW5History(caseId);
  }

  async getW6ClosedCaseContext(caseId: string): Promise<W6ClosedCaseContext> {
    return this.#validatedW6ClosedCaseContext(caseId);
  }

  async commitW5Transition(input: W5AtomicTransition): Promise<{
    updated: boolean;
    case: FrontHalfCase;
    work_order: RuntimeWorkOrder;
    history: W5History;
  }> {
    return this.#commitW5TransitionAtomically(input);
  }

  #commitW5TransitionAtomically(input: W5AtomicTransition): {
    updated: boolean;
    case: FrontHalfCase;
    work_order: RuntimeWorkOrder;
    history: W5History;
  } {
    // Process-local only: this segment has no asynchronous suspension point, so the
    // current-value check, transition validation, history append, and receipt
    // snapshot cannot be interleaved by another JavaScript task.
    const caseId = input.expected_case.case_id;
    this.#requireActiveW5Write(input);
    const currentCase = this.casesById.get(caseId);
    const currentWorkOrder = this.workOrdersById.get(input.expected_work_order.work_order_id);
    if (!currentCase || !currentWorkOrder) {
      throw new Error("W5 case or work order does not exist");
    }
    if (
      this.workOrderByCaseId.get(caseId) !== currentWorkOrder.work_order_id ||
      currentWorkOrder.case_id !== caseId
    ) {
      throw new Error("W5 work-order index invariant violation");
    }
    if (!sameJson(currentCase, input.expected_case) || !sameJson(currentWorkOrder, input.expected_work_order)) {
      return {
        updated: false,
        case: cloneCase(currentCase),
        work_order: cloneWorkOrder(currentWorkOrder),
        history: this.#snapshotW5History(caseId),
      };
    }
    if (
      input.next_case.case_id !== caseId ||
      input.next_work_order.work_order_id !== currentWorkOrder.work_order_id ||
      input.next_work_order.case_id !== caseId ||
      !hasSyntheticCaseBoundary(currentCase) ||
      !hasSyntheticCaseBoundary(input.next_case) ||
      !hasSyntheticWorkOrderBoundary(currentWorkOrder) ||
      !hasSyntheticWorkOrderBoundary(input.next_work_order) ||
      !sameJson(w5CaseImmutableMaterial(currentCase), w5CaseImmutableMaterial(input.next_case)) ||
      !sameJson(w5WorkOrderImmutableMaterial(currentWorkOrder), w5WorkOrderImmutableMaterial(input.next_work_order)) ||
      currentCase.sla_started_at === null ||
      currentCase.sla_due_at === null ||
      !isIsoTimestamp(currentCase.sla_started_at) ||
      !isIsoTimestamp(currentCase.sla_due_at) ||
      input.next_case.sla_started_at !== currentCase.sla_started_at ||
      input.next_case.sla_due_at !== currentCase.sla_due_at ||
      input.next_case.sla_rule_version !== currentCase.sla_rule_version ||
      input.next_work_order.due_at !== currentWorkOrder.due_at ||
      input.next_work_order.sla_reset_count !== 0 ||
      !isIsoTimestamp(input.next_case.updated_at) ||
      !isIsoTimestamp(input.next_work_order.updated_at)
    ) {
      throw new Error("W5 transition must preserve the synthetic record boundary and original SLA anchors");
    }

    const history = this.#snapshotW5History(caseId);
    const appendKeys = Object.entries(input.append)
      .filter(([, value]) => value !== undefined)
      .map(([key]) => key)
      .sort();
    const expectAppendKeys = (keys: string[]): void => {
      const expected = [...keys].sort();
      if (!sameJson(appendKeys, expected)) {
        throw new Error(`W5 ${input.transition} append set is invalid`);
      }
    };
    const evidence = input.append.evidence_submission;
    const draft = input.append.reply_draft;
    const review = input.append.reply_review;
    const followUp = input.append.follow_up;
    const closure = input.append.closure_decision;
    const assertRecordIdentity = (record: { event_id: string; case_id: string; work_order_id: string }): void => {
      const eventContext = this.workflowEventContext.getStore();
      if (
        record.event_id !== eventContext?.event_id ||
        record.case_id !== caseId ||
        record.work_order_id !== currentWorkOrder.work_order_id
      ) {
        throw new Error("W5 appended record is not bound to the active event, case, and work order");
      }
    };

    if (evidence) {
      assertRecordIdentity(evidence);
      if (!hasValidW5EvidenceSubmission(evidence)) {
        throw new Error("W5 evidence submission is invalid");
      }
      if (history.evidence_submissions.some((record) => record.submission_id === evidence.submission_id)) {
        throw new Error("W5 evidence submission id already exists");
      }
      const calculatedMissing = [
        ...(evidence.text.trim().length === 0 ? ["resolution_text"] : []),
        ...(evidence.artifact_refs.length === 0 ? ["artifact_refs"] : []),
        ...(evidence.reviewed_facts.length === 0 ? ["reviewed_facts"] : []),
      ].sort();
      if (
        !sameJson([...evidence.missing_fields].sort(), calculatedMissing) ||
        evidence.completeness !== (calculatedMissing.length === 0 ? "complete" : "incomplete")
      ) {
        throw new Error("W5 evidence completeness does not match its required fields");
      }
      if (evidence.kind === "closure_request" && evidence.replaces_submission_id !== null) {
        throw new Error("W5 initial closure request cannot replace another evidence submission");
      }
      if (
        evidence.kind === "evidence_supplement" &&
        !history.evidence_submissions.some((record) =>
          record.submission_id === evidence.replaces_submission_id && record.completeness === "incomplete"
        )
      ) {
        throw new Error("W5 evidence supplement must replace a persisted incomplete submission");
      }
    }
    if (draft) {
      assertRecordIdentity(draft);
      if (
        !hasValidW5ReplyDraft(draft) ||
        draft.citations.some((citation) =>
          citation.evidence_span_indices.some((index) => index >= draft.evidence_spans.length)
        ) ||
        history.reply_drafts.some((record) => record.draft_id === draft.draft_id)
      ) {
        throw new Error("W5 N7 draft record is invalid or duplicated");
      }
    }
    if (review) {
      assertRecordIdentity(review);
      const currentDraft = history.reply_drafts.at(-1);
      if (
        !isNonEmptyString(review.review_id) ||
        !isNonEmptyString(review.reason) ||
        !hasValidW5AuthorizationEvidence(review) ||
        !isIsoTimestamp(review.decided_at) ||
        !currentDraft ||
        review.draft_id !== currentDraft.draft_id ||
        history.reply_reviews.some((record) => record.draft_id === review.draft_id) ||
        (
          review.decision === "approve_for_manual_delivery"
            ? !isNonEmptyString(review.manual_delivery_reference)
            : review.decision !== "return_to_processing" || review.manual_delivery_reference !== null
        )
      ) {
        throw new Error("W5 reply review must be an authorized decision on the current unpublished draft");
      }
    }
    if (followUp) {
      assertRecordIdentity(followUp);
      const approvedReview = history.reply_reviews.at(-1);
      if (
        !isNonEmptyString(followUp.follow_up_id) ||
        (followUp.outcome !== "resolved" && followUp.outcome !== "abnormal") ||
        !isNonEmptyString(followUp.summary) ||
        !isNonEmptyString(followUp.follow_up_reference) ||
        !hasValidW5AuthorizationEvidence(followUp) ||
        !isIsoTimestamp(followUp.recorded_at) ||
        approvedReview?.decision !== "approve_for_manual_delivery"
      ) {
        throw new Error("W5 follow-up must follow an authorized reply approval");
      }
    }
    if (closure) {
      assertRecordIdentity(closure);
      const approvedReview = history.reply_reviews.at(-1);
      const resolvedFollowUp = history.follow_ups.at(-1);
      if (
        !isNonEmptyString(closure.decision_id) ||
        (closure.decision !== "close" && closure.decision !== "return_to_processing") ||
        !isNonEmptyString(closure.reason) ||
        !hasValidW5AuthorizationEvidence(closure) ||
        !isIsoTimestamp(closure.decided_at) ||
        approvedReview?.decision !== "approve_for_manual_delivery" ||
        resolvedFollowUp?.outcome !== "resolved"
      ) {
        throw new Error("W5 closure decision requires approved reply and resolved follow-up evidence");
      }
    }

    const sameState = (
      expectedCaseStatus: FrontHalfCase["status"],
      expectedWorkOrderStatus: RuntimeWorkOrder["status"],
      expectedReadiness: readonly FrontHalfCase["workflow_readiness"][],
      nextCaseStatus: FrontHalfCase["status"],
      nextWorkOrderStatus: RuntimeWorkOrder["status"],
      readiness: FrontHalfCase["workflow_readiness"],
      validation: RuntimeWorkOrder["validation_result"],
    ): boolean => currentCase.status === expectedCaseStatus &&
      currentWorkOrder.status === expectedWorkOrderStatus &&
      expectedReadiness.includes(currentCase.workflow_readiness) &&
      input.next_case.status === nextCaseStatus &&
      input.next_work_order.status === nextWorkOrderStatus &&
      input.next_case.workflow_readiness === readiness &&
      input.next_work_order.validation_result === validation;

    if (input.transition === "evidence_incomplete") {
      expectAppendKeys(["evidence_submission"]);
      if (!evidence || evidence.completeness !== "incomplete" || !sameState(
        "处理中", "处理中", ["dispatched", "awaiting_resolution_evidence"],
        "处理中", "处理中", "awaiting_resolution_evidence", "pending",
      )) throw new Error("W5 incomplete-evidence transition is invalid");
    } else if (input.transition === "evidence_ready") {
      expectAppendKeys(["evidence_submission", "reply_draft"]);
      if (
        !evidence || evidence.completeness !== "complete" || !draft ||
        evidence.event_id !== draft.event_id ||
        input.next_work_order.disposition_evidence !== evidence.text ||
        !sameState(
          "处理中", "处理中", ["dispatched", "awaiting_resolution_evidence"],
          "待验证", "待验证", "awaiting_reply_review", "pending",
        )
      ) throw new Error("W5 evidence-ready transition is invalid");
    } else if (input.transition === "n7_failed") {
      expectAppendKeys(["evidence_submission"]);
      if (!evidence || evidence.completeness !== "complete" || !sameState(
        "处理中", "处理中", ["dispatched", "awaiting_resolution_evidence"],
        "处理中", "处理中", "awaiting_resolution_evidence", "pending",
      )) throw new Error("W5 N7-failure transition is invalid");
    } else if (input.transition === "reply_approved") {
      expectAppendKeys(["reply_review"]);
      if (!review || review.decision !== "approve_for_manual_delivery" || !sameState(
        "待验证", "待验证", ["awaiting_reply_review"],
        "待回访", "待验证", "awaiting_follow_up", "pending",
      )) throw new Error("W5 reply-approval transition is invalid");
    } else if (input.transition === "reply_returned") {
      expectAppendKeys(["reply_review"]);
      if (!review || review.decision !== "return_to_processing" || !sameState(
        "待验证", "待验证", ["awaiting_reply_review"],
        "处理中", "处理中", "awaiting_resolution_evidence", "failed",
      )) throw new Error("W5 reply-return transition is invalid");
    } else if (input.transition === "follow_up_resolved") {
      expectAppendKeys(["follow_up"]);
      if (!followUp || followUp.outcome !== "resolved" || !sameState(
        "待回访", "待验证", ["awaiting_follow_up"],
        "待回访", "待验证", "awaiting_closure_decision", "pending",
      )) throw new Error("W5 resolved-follow-up transition is invalid");
    } else if (input.transition === "follow_up_abnormal") {
      expectAppendKeys(["follow_up"]);
      if (!followUp || followUp.outcome !== "abnormal" || !sameState(
        "待回访", "待验证", ["awaiting_follow_up"],
        "处理中", "处理中", "awaiting_resolution_evidence", "failed",
      )) throw new Error("W5 abnormal-follow-up transition is invalid");
    } else if (input.transition === "closure_closed") {
      expectAppendKeys(["closure_decision"]);
      if (
        !closure || closure.decision !== "close" ||
        !sameState(
          "待回访", "待验证", ["awaiting_closure_decision"],
          "已关闭", "已完成", "closed", "passed",
        ) ||
        !isIsoTimestamp(input.next_case.closed_at) ||
        !isIsoTimestamp(input.next_work_order.completed_at)
      ) throw new Error("W5 closure transition is invalid");
    } else if (input.transition === "closure_returned") {
      expectAppendKeys(["closure_decision"]);
      if (!closure || closure.decision !== "return_to_processing" || !sameState(
        "待回访", "待验证", ["awaiting_closure_decision"],
        "处理中", "处理中", "awaiting_resolution_evidence", "failed",
      )) throw new Error("W5 closure-return transition is invalid");
    } else {
      throw new Error("W5 transition kind is not implemented");
    }

    if (input.transition !== "closure_closed" && (
      input.next_case.closed_at !== null || input.next_work_order.completed_at !== null
    )) {
      throw new Error("W5 non-closure transition cannot write closure timestamps");
    }

    const storedCase = cloneCase(input.next_case);
    const storedWorkOrder = cloneWorkOrder(input.next_work_order);
    const resultingHistory: W5History = {
      evidence_submissions: [
        ...history.evidence_submissions.map(cloneW5EvidenceSubmission),
        ...(evidence ? [cloneW5EvidenceSubmission(evidence)] : []),
      ],
      reply_drafts: [
        ...history.reply_drafts.map(cloneW5ReplyDraft),
        ...(draft ? [cloneW5ReplyDraft(draft)] : []),
      ],
      reply_reviews: [
        ...history.reply_reviews.map(cloneW5ReplyReview),
        ...(review ? [cloneW5ReplyReview(review)] : []),
      ],
      follow_ups: [
        ...history.follow_ups.map(cloneW5FollowUp),
        ...(followUp ? [cloneW5FollowUp(followUp)] : []),
      ],
      closure_decisions: [
        ...history.closure_decisions.map(cloneW5ClosureDecision),
        ...(closure ? [cloneW5ClosureDecision(closure)] : []),
      ],
    };
    const closureProvenance = input.transition === "closure_closed"
      ? createW5ClosureProvenance(storedCase, storedWorkOrder, resultingHistory)
      : null;
    this.casesById.set(caseId, storedCase);
    this.workOrdersById.set(storedWorkOrder.work_order_id, storedWorkOrder);
    if (evidence) {
      this.w5EvidenceSubmissionsByCaseId.set(caseId, [
        ...(this.w5EvidenceSubmissionsByCaseId.get(caseId) ?? []),
        cloneW5EvidenceSubmission(evidence),
      ]);
    }
    if (draft) {
      this.w5ReplyDraftsByCaseId.set(caseId, [
        ...(this.w5ReplyDraftsByCaseId.get(caseId) ?? []),
        cloneW5ReplyDraft(draft),
      ]);
    }
    if (review) {
      this.w5ReplyReviewsByCaseId.set(caseId, [
        ...(this.w5ReplyReviewsByCaseId.get(caseId) ?? []),
        cloneW5ReplyReview(review),
      ]);
    }
    if (followUp) {
      this.w5FollowUpsByCaseId.set(caseId, [
        ...(this.w5FollowUpsByCaseId.get(caseId) ?? []),
        cloneW5FollowUp(followUp),
      ]);
    }
    if (closure) {
      this.w5ClosureDecisionsByCaseId.set(caseId, [
        ...(this.w5ClosureDecisionsByCaseId.get(caseId) ?? []),
        cloneW5ClosureDecision(closure),
      ]);
    }
    if (closureProvenance) {
      this.#w5ClosureProvenanceByCaseId.set(
        caseId,
        Object.freeze(cloneW5ClosureProvenance(closureProvenance)),
      );
    }
    return {
      updated: true,
      case: cloneCase(storedCase),
      work_order: cloneWorkOrder(storedWorkOrder),
      history: this.#snapshotW5History(caseId),
    };
  }

  async compareAndSetCaseAndWorkOrder(input: {
    expected_case: FrontHalfCase;
    expected_work_order: RuntimeWorkOrder;
    next_case: FrontHalfCase;
    next_work_order: RuntimeWorkOrder;
  }): Promise<{ updated: boolean; case: FrontHalfCase; work_order: RuntimeWorkOrder }> {
    const currentCase = this.casesById.get(input.expected_case.case_id);
    const currentWorkOrder = this.workOrdersById.get(input.expected_work_order.work_order_id);
    if (!currentCase || !currentWorkOrder) {
      throw new Error("case or work order does not exist");
    }
    if (!sameJson(currentCase, input.expected_case) || !sameJson(currentWorkOrder, input.expected_work_order)) {
      return {
        updated: false,
        case: cloneCase(currentCase),
        work_order: cloneWorkOrder(currentWorkOrder),
      };
    }
    const nextCase = cloneCase(input.next_case);
    const nextWorkOrder = cloneWorkOrder(input.next_work_order);
    this.casesById.set(nextCase.case_id, nextCase);
    this.workOrdersById.set(nextWorkOrder.work_order_id, nextWorkOrder);
    return { updated: true, case: cloneCase(nextCase), work_order: cloneWorkOrder(nextWorkOrder) };
  }

  async compareAndSetCaseAndWorkOrderWithEffect(
    input: {
      expected_case: FrontHalfCase;
      expected_work_order: RuntimeWorkOrder;
      next_case: FrontHalfCase;
      next_work_order: RuntimeWorkOrder;
    },
    effect: () => Promise<void>,
  ): Promise<{
    updated: boolean;
    case: FrontHalfCase | null;
    work_order: RuntimeWorkOrder | null;
    effect_performed: boolean;
  }> {
    const currentCase = this.casesById.get(input.expected_case.case_id);
    const currentWorkOrder = this.workOrdersById.get(input.expected_work_order.work_order_id);
    if (!currentCase || !currentWorkOrder) throw new Error("case or work order does not exist");
    if (!sameJson(currentCase, input.expected_case) || !sameJson(currentWorkOrder, input.expected_work_order)) {
      return {
        updated: false,
        case: cloneCase(currentCase),
        work_order: cloneWorkOrder(currentWorkOrder),
        effect_performed: false,
      };
    }
    await effect();
    const recheckedCase = this.casesById.get(input.expected_case.case_id);
    const recheckedWorkOrder = this.workOrdersById.get(input.expected_work_order.work_order_id);
    if (!recheckedCase || !recheckedWorkOrder) {
      return {
        updated: false,
        case: recheckedCase ? cloneCase(recheckedCase) : null,
        work_order: recheckedWorkOrder ? cloneWorkOrder(recheckedWorkOrder) : null,
        effect_performed: true,
      };
    }
    if (
      !sameJson(recheckedCase, input.expected_case) ||
      !sameJson(recheckedWorkOrder, input.expected_work_order)
    ) {
      return {
        updated: false,
        case: cloneCase(recheckedCase),
        work_order: cloneWorkOrder(recheckedWorkOrder),
        effect_performed: true,
      };
    }
    const nextCase = cloneCase(input.next_case);
    const nextWorkOrder = cloneWorkOrder(input.next_work_order);
    this.casesById.set(nextCase.case_id, nextCase);
    this.workOrdersById.set(nextWorkOrder.work_order_id, nextWorkOrder);
    return {
      updated: true,
      case: cloneCase(nextCase),
      work_order: cloneWorkOrder(nextWorkOrder),
      effect_performed: true,
    };
  }

  async runW6ResourcesExclusive<T>(resources: W6ResourceSet, operation: () => Promise<T>): Promise<T> {
    if (
      !Array.isArray(resources.case_ids) ||
      resources.case_ids.length === 0 ||
      resources.case_ids.some((caseId) => !isNonEmptyString(caseId)) ||
      !isNonEmptyString(resources.cluster_id) ||
      (resources.improvement_id !== null && !isNonEmptyString(resources.improvement_id))
    ) {
      throw new Error("W6 resources must identify cases, one cluster, and an optional improvement");
    }
    const caseIds = sortedUniqueStrings(resources.case_ids);
    const keys = [
      ...caseIds.map((caseId) => `case:${caseId}`),
      `cluster:${resources.cluster_id}`,
      ...(resources.improvement_id === null ? [] : [`improvement:${resources.improvement_id}`]),
    ].sort((left, right) => left.localeCompare(right));
    const inheritedCases = this.caseLockContext.getStore();
    const inheritedResources = this.w6ResourceLockContext.getStore();
    for (const key of keys) {
      if (key.startsWith("case:")) {
        const caseId = key.slice("case:".length);
        const inheritedOwner = inheritedCases?.get(caseId);
        if (inheritedOwner && this.activeCaseLockOwners.get(caseId) === inheritedOwner) {
          throw new Error(`Reentrant access to active W6 case lock ${caseId} is not allowed`);
        }
      } else {
        const inheritedOwner = inheritedResources?.get(key);
        if (inheritedOwner && this.activeW6ResourceLockOwners.get(key) === inheritedOwner) {
          throw new Error(`Reentrant access to active W6 resource lock ${key} is not allowed`);
        }
      }
    }

    const acquired: Array<{
      key: string;
      owner: symbol;
      gate: Promise<void>;
      release: () => void;
      tail: Promise<void>;
    }> = [];
    try {
      for (const key of keys) {
        const isCase = key.startsWith("case:");
        const id = isCase ? key.slice("case:".length) : key;
        const tails = isCase ? this.caseTailsById : this.w6ResourceTailsById;
        const previous = tails.get(id) ?? Promise.resolve();
        let release!: () => void;
        const gate = new Promise<void>((resolve) => { release = resolve; });
        const tail = previous.catch(() => undefined).then(() => gate);
        tails.set(id, tail);
        await previous.catch(() => undefined);
        const owner = Symbol(key);
        if (isCase) this.activeCaseLockOwners.set(id, owner);
        else this.activeW6ResourceLockOwners.set(id, owner);
        acquired.push({ key, owner, gate, release, tail });
      }

      const caseOwners = new Map(inheritedCases ?? []);
      const resourceOwners = new Map(inheritedResources ?? []);
      for (const lock of acquired) {
        if (lock.key.startsWith("case:")) {
          caseOwners.set(lock.key.slice("case:".length), lock.owner);
        } else {
          resourceOwners.set(lock.key, lock.owner);
        }
      }
      return await this.caseLockContext.run(caseOwners, () =>
        this.w6ResourceLockContext.run(resourceOwners, operation)
      );
    } finally {
      for (const lock of [...acquired].reverse()) {
        if (lock.key.startsWith("case:")) {
          const id = lock.key.slice("case:".length);
          if (this.activeCaseLockOwners.get(id) === lock.owner) this.activeCaseLockOwners.delete(id);
          lock.release();
          if (this.caseTailsById.get(id) === lock.tail) this.caseTailsById.delete(id);
        } else {
          if (this.activeW6ResourceLockOwners.get(lock.key) === lock.owner) {
            this.activeW6ResourceLockOwners.delete(lock.key);
          }
          lock.release();
          if (this.w6ResourceTailsById.get(lock.key) === lock.tail) {
            this.w6ResourceTailsById.delete(lock.key);
          }
        }
      }
    }
  }

  async runWorkOrderExclusive<T>(workOrderId: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.workOrderTailsById.get(workOrderId) ?? Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const tail = previous.catch(() => undefined).then(() => gate);
    this.workOrderTailsById.set(workOrderId, tail);
    await previous.catch(() => undefined);
    try {
      return await operation();
    } finally {
      release();
      if (this.workOrderTailsById.get(workOrderId) === tail) {
        this.workOrderTailsById.delete(workOrderId);
      }
    }
  }

  async runCaseExclusive<T>(caseId: string, operation: () => Promise<T>): Promise<T> {
    const heldLocks = this.caseLockContext.getStore();
    const inheritedOwner = heldLocks?.get(caseId);
    if (inheritedOwner && this.activeCaseLockOwners.get(caseId) === inheritedOwner) {
      throw new Error(`Reentrant access to active case lock ${caseId} is not allowed`);
    }
    const previous = this.caseTailsById.get(caseId) ?? Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const tail = previous.catch(() => undefined).then(() => gate);
    this.caseTailsById.set(caseId, tail);
    await previous.catch(() => undefined);
    const owner = Symbol(caseId);
    this.activeCaseLockOwners.set(caseId, owner);
    try {
      return await this.caseLockContext.run(
        new Map([...(heldLocks ?? []), [caseId, owner]]),
        operation,
      );
    } finally {
      if (this.activeCaseLockOwners.get(caseId) === owner) {
        this.activeCaseLockOwners.delete(caseId);
      }
      release();
      if (this.caseTailsById.get(caseId) === tail) {
        this.caseTailsById.delete(caseId);
      }
    }
  }

  async runWorkflowAuditExclusive<T>(eventId: string, operation: () => Promise<T>): Promise<T> {
    const heldLocks = this.workflowAuditLockContext.getStore();
    const inheritedOwner = heldLocks?.get(eventId);
    if (inheritedOwner && this.activeWorkflowAuditLockOwners.get(eventId) === inheritedOwner) {
      throw new Error(`Reentrant access to active workflow-audit lock ${eventId} is not allowed`);
    }
    const previous = this.workflowAuditTailsByEventId.get(eventId) ?? Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const tail = previous.catch(() => undefined).then(() => gate);
    this.workflowAuditTailsByEventId.set(eventId, tail);
    await previous.catch(() => undefined);
    const owner = Symbol(eventId);
    this.activeWorkflowAuditLockOwners.set(eventId, owner);
    try {
      return await this.workflowAuditLockContext.run(
        new Map([...(heldLocks ?? []), [eventId, owner]]),
        operation,
      );
    } finally {
      if (this.activeWorkflowAuditLockOwners.get(eventId) === owner) {
        this.activeWorkflowAuditLockOwners.delete(eventId);
      }
      release();
      if (this.workflowAuditTailsByEventId.get(eventId) === tail) {
        this.workflowAuditTailsByEventId.delete(eventId);
      }
    }
  }

  async runWorkflowEvent(
    eventId: string,
    fingerprint: string,
    operation: () => Promise<WorkflowResult<JsonValue>>,
  ): Promise<{ replayed: boolean; result: WorkflowResult<JsonValue> }> {
    const inheritedContext = this.workflowEventContext.getStore();
    if (
      inheritedContext?.event_id === eventId &&
      this.activeWorkflowEventOwners.get(eventId) === inheritedContext.owner
    ) {
      throw new Error(`Reentrant access to active workflow event ${eventId} is not allowed`);
    }
    const existing = this.workflowEventsById.get(eventId);
    if (existing) {
      if (existing.fingerprint !== fingerprint) throw new WorkflowEventConflictError(eventId);
      return { replayed: true, result: await existing.promise };
    }
    const owner = Symbol(eventId);
    this.activeWorkflowEventOwners.set(eventId, owner);
    const promise = Promise.resolve().then(() => this.workflowEventContext.run(
      { event_id: eventId, fingerprint, owner },
      operation,
    ));
    this.workflowEventsById.set(eventId, { fingerprint, promise });
    try {
      return { replayed: false, result: await promise };
    } catch (error) {
      if (this.workflowEventsById.get(eventId)?.promise === promise) {
        this.workflowEventsById.delete(eventId);
      }
      throw error;
    } finally {
      if (this.activeWorkflowEventOwners.get(eventId) === owner) {
        this.activeWorkflowEventOwners.delete(eventId);
      }
    }
  }
}
