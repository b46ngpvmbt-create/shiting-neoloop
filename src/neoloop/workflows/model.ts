import type {
  CanonicalSchemaVersion,
  CaseStatus,
  ClockSource,
  ClusterStatus,
  DataScope,
  EvidenceSpan,
  EvidenceClass,
  ImprovementStatus,
  IngestRequest,
  RiskLevel,
  WorkOrderStatus,
  WorkflowResult,
} from "../contracts/model.js";

export interface FrontHalfCase {
  schema_version: CanonicalSchemaVersion;
  data_scope: DataScope;
  evidence_class: EvidenceClass;
  created_at: string;
  updated_at: string;
  source_kind: "scenario_runtime";
  case_id: string;
  legacy_id: string;
  title: string;
  summary: string;
  category_domain: string;
  category_detail: string;
  rule_risk: RiskLevel;
  ai_risk: RiskLevel;
  final_risk: RiskLevel;
  status: Extract<
    CaseStatus,
    "待补充" | "待关联" | "待派单" | "处理中" | "待验证" | "待回访" | "已关闭"
  >;
  missing_fields: string[];
  entity_candidates: {
    vehicle_ids: string[];
    task_ids: string[];
    station_names: string[];
    confidence: number | null;
  };
  formal_entity: {
    vehicle_id: string;
    task_id: string;
    station_id: string;
  } | null;
  formal_entity_confirmation_status: "待人工确认" | "已人工确认";
  evidence_completeness: "complete" | "partial";
  evidence_summary: string;
  sla_started_at: string | null;
  sla_due_at: string | null;
  sla_rule_version: string;
  candidate_generation_mode: "AI";
  suggested_team: string;
  routing_rule_candidate_id: string | null;
  cluster_id: null;
  pending_confirmation_items: string[];
  closed_at: string | null;
  record_mode: "scenario_runtime";
  workflow_readiness:
    | "awaiting_same_event_check"
    | "awaiting_formal_entity_confirmation"
    | "awaiting_responsibility_routing"
    | "awaiting_routing_confirmation"
    | "dispatched"
    | "awaiting_resolution_evidence"
    | "awaiting_reply_review"
    | "awaiting_follow_up"
    | "awaiting_closure_decision"
    | "closed";
  legacy_association_mode: "not_applicable";
  legacy_reviewer: "not_applicable";
  legacy_status: "not_applicable";
  migration_note: null;
  source_name: string;
  source_locator: string;
  source_sha256: string;
}

export interface SameEventDuplicateCandidate {
  candidate_case_id: string;
  similarity: number;
}

export interface SameEventCheck {
  check_id: string;
  case_id: string;
  mode: "same_event_duplicate";
  candidate: SameEventDuplicateCandidate | null;
  evidence_spans: EvidenceSpan[];
  review_state: "pending" | "not_required";
  node_status: "ok" | "needs_human" | "refused" | "error";
  automatic_merge: false;
  automatic_relink: false;
  created_at: string;
}

export interface AuthorizedHumanActor {
  type: "authorized_human";
  actor_id: string;
  role: string;
}

export interface W3AuthorizedPrincipal {
  principal_id: string;
  principal_type: "synthetic_human";
  canonical_role: string;
  authority_source: "synthetic_allowlist";
}

export interface SameEventHumanResolution {
  resolution_id: string;
  event_id: string;
  case_id: string;
  check_id: string;
  decision: "keep_separate" | "confirmed_duplicate";
  principal: W3AuthorizedPrincipal;
  authorization_policy_version: string;
  reason: string;
  decided_at: string;
}

export interface R3VehicleReference {
  data_scope: "synthetic_experiment";
  evidence_class: "synthetic_experiment";
  source_kind: "scenario_runtime";
  vehicle_id: string;
  station_id: string;
  source_ref: string;
  evidence_text: string;
  controls_available: false;
}

export interface R3DeliveryTaskReference {
  data_scope: "synthetic_experiment";
  evidence_class: "synthetic_experiment";
  source_kind: "scenario_runtime";
  task_id: string;
  vehicle_id: string;
  station_id: string;
  source_ref: string;
  evidence_text: string;
  state_mutable_by_neoloop: false;
}

export interface R3StationReference {
  data_scope: "synthetic_experiment";
  evidence_class: "synthetic_experiment";
  source_kind: "scenario_runtime";
  station_id: string;
  source_ref: string;
  evidence_text: string;
}

export interface R3RoutingRuleReference {
  data_scope: "synthetic_experiment";
  source_kind: "registration_workbook";
  routing_rule_id: string;
  rule_version: string;
  station_id: string;
  issue_type: string;
  default_team: string;
  reviewer_role: string;
  sla_rule_version: string;
  escalation_path: string[];
  status: "待企业验证";
  evidence_class: "enterprise_pending";
  source_ref: string;
  evidence_text: string;
}

export interface R3SlaTargetReference {
  policy_id: string;
  policy_version: string;
  routing_rule_id: string;
  sla_rule_version: string;
  first_response_target_minutes: number;
  data_scope: "synthetic_experiment";
  evidence_class: "enterprise_pending";
  source_kind: "registration_workbook";
  status: "待企业验证";
  source_ref: string;
  evidence_text: string;
}

export interface R3ReferenceData {
  vehicles: R3VehicleReference[];
  delivery_tasks: R3DeliveryTaskReference[];
  stations: R3StationReference[];
  routing_rules: R3RoutingRuleReference[];
  sla_policies: R3SlaTargetReference[];
}

export interface W3EntityProposal {
  proposal_id: string;
  case_id: string;
  node_run_id: string;
  node_version: string;
  input_hash: string;
  candidates: Array<{
    object_type: "vehicle" | "delivery_task" | "station";
    object_id: string;
    evidence_span_indices: number[];
  }>;
  evidence_spans: EvidenceSpan[];
  created_at: string;
}

export interface W3RoutingCandidate {
  routing_rule_id: string;
  rule_version: string;
  candidate_team: string;
  candidate_logical_role: string;
  sla_rule_version: string;
  supporting_evidence_indices: number[];
  counter_evidence_indices: number[];
  uncertainties: string[];
}

export interface W3RoutingProposal {
  proposal_id: string;
  case_id: string;
  node_run_id: string;
  node_version: string;
  input_hash: string;
  candidates: W3RoutingCandidate[];
  evidence_spans: EvidenceSpan[];
  created_at: string;
}

export interface W3FormalEntityDecision {
  decision_id: string;
  decision_fingerprint: string;
  event_id: string;
  case_id: string;
  action: "confirm_formal_entity";
  authorization_state: "authorized";
  authorization_policy_version: string;
  principal: W3AuthorizedPrincipal;
  proposal_ref: {
    proposal_type: "entity_proposal";
    proposal_id: string;
    node_run_id: string;
    input_hash: string;
  };
  formal_entity: NonNullable<FrontHalfCase["formal_entity"]>;
  evidence_spans: EvidenceSpan[];
  decided_at: string;
}

export interface W3RoutingDecision {
  decision_id: string;
  decision_fingerprint: string;
  event_id: string;
  case_id: string;
  action: "confirm_routing";
  authorization_state: "authorized";
  authorization_policy_version: string;
  principal: W3AuthorizedPrincipal;
  proposal_ref: {
    proposal_type: "routing_proposal";
    proposal_id: string;
    node_run_id: string;
    input_hash: string;
  };
  rule_ref: {
    routing_rule_id: string;
    rule_version: string;
    sla_rule_version: string;
    first_response_target_minutes: number;
    sla_policy_id: string;
    sla_policy_version: string;
  };
  candidate_team: string;
  candidate_logical_role: string;
  supporting_evidence_indices: number[];
  counter_evidence_indices: number[];
  uncertainties: string[];
  evidence_spans: EvidenceSpan[];
  decided_at: string;
}

export interface RuntimeWorkOrder {
  schema_version: CanonicalSchemaVersion;
  data_scope: DataScope;
  evidence_class: EvidenceClass;
  created_at: string;
  updated_at: string;
  source_kind: "scenario_runtime";
  work_order_id: string;
  legacy_id: "not_applicable_scenario_runtime";
  case_id: string;
  team: string;
  assignee_role: string;
  action: string;
  accepted_at: string | null;
  due_at: string;
  completed_at: string | null;
  disposition_evidence: string | null;
  validation_result: "pending" | "passed" | "failed";
  escalation_level: string;
  first_response_target_minutes: number;
  sla_reset_count: 0;
  status: Extract<WorkOrderStatus, "待接单" | "处理中" | "待验证" | "已完成">;
  legacy_recorded_at: null;
  legacy_routing_correct: "not_applicable";
  legacy_status: "not_applicable";
  source_name: "synthetic_experiment";
  source_locator: string;
  source_sha256: string;
}

export interface W5EvidenceSubmission {
  submission_id: string;
  event_id: string;
  case_id: string;
  work_order_id: string;
  kind: "closure_request" | "evidence_supplement";
  replaces_submission_id: string | null;
  source_ref: string;
  text: string;
  artifact_refs: string[];
  reviewed_facts: Array<{
    source_ref: string;
    text: string;
    review_status: "approved";
    review_ref: string;
  }>;
  completeness: "complete" | "incomplete";
  missing_fields: string[];
  principal: W3AuthorizedPrincipal;
  authorization_policy_version: string;
  submitted_at: string;
}

export interface W5ReplyDraft {
  draft_id: string;
  event_id: string;
  case_id: string;
  work_order_id: string;
  node_run_id: string;
  node_version: string;
  input_hash: string;
  draft_kind: "customer_reply";
  draft: string;
  citations: Array<{
    knowledge_id: string;
    version: string;
    evidence_span_indices: number[];
  }>;
  supporting_evidence_indices: number[];
  evidence_spans: EvidenceSpan[];
  publication_state: "draft_unpublished";
  human_review_required: true;
  automatic_publication: false;
  created_at: string;
}

export interface W5ReplyReview {
  review_id: string;
  event_id: string;
  case_id: string;
  work_order_id: string;
  draft_id: string;
  decision: "approve_for_manual_delivery" | "return_to_processing";
  reason: string;
  manual_delivery_reference: string | null;
  principal: W3AuthorizedPrincipal;
  authorization_policy_version: string;
  decided_at: string;
}

export interface W5FollowUp {
  follow_up_id: string;
  event_id: string;
  case_id: string;
  work_order_id: string;
  outcome: "resolved" | "abnormal";
  summary: string;
  follow_up_reference: string;
  principal: W3AuthorizedPrincipal;
  authorization_policy_version: string;
  recorded_at: string;
}

export interface W5ClosureDecision {
  decision_id: string;
  event_id: string;
  case_id: string;
  work_order_id: string;
  decision: "close" | "return_to_processing";
  reason: string;
  principal: W3AuthorizedPrincipal;
  authorization_policy_version: string;
  decided_at: string;
}

export interface W5History {
  evidence_submissions: W5EvidenceSubmission[];
  reply_drafts: W5ReplyDraft[];
  reply_reviews: W5ReplyReview[];
  follow_ups: W5FollowUp[];
  closure_decisions: W5ClosureDecision[];
}

export interface W5ClosureProvenance {
  case_id: string;
  work_order_id: string;
  evidence_submission_id: string;
  reply_draft_id: string;
  reply_review_id: string;
  follow_up_id: string;
  closure_decision_id: string;
  closure_event_id: string;
  closed_at: string;
  case_fingerprint: string;
  work_order_fingerprint: string;
  w5_history_fingerprint: string;
  w5_closure_fingerprint: string;
}

export interface W6ClosedCaseContext {
  case_record: FrontHalfCase;
  work_order: RuntimeWorkOrder;
  w5_history: W5History;
  closure_provenance: W5ClosureProvenance;
}

export type W5TransitionKind =
  | "evidence_incomplete"
  | "evidence_ready"
  | "n7_failed"
  | "reply_approved"
  | "reply_returned"
  | "follow_up_resolved"
  | "follow_up_abnormal"
  | "closure_closed"
  | "closure_returned";

export interface W5AtomicTransition {
  transition: W5TransitionKind;
  expected_case: FrontHalfCase;
  expected_work_order: RuntimeWorkOrder;
  next_case: FrontHalfCase;
  next_work_order: RuntimeWorkOrder;
  append: {
    evidence_submission?: W5EvidenceSubmission;
    reply_draft?: W5ReplyDraft;
    reply_review?: W5ReplyReview;
    follow_up?: W5FollowUp;
    closure_decision?: W5ClosureDecision;
  };
}

export interface W6CaseMembershipSnapshot {
  case_id: string;
  case_fingerprint: string;
  work_order_id: string;
  work_order_fingerprint: string;
  w5_closure_fingerprint: string;
  feedback_links: Array<{
    feedback_id: string;
    feedback_fingerprint: string;
  }>;
}

export interface W6CrossEventProposal {
  proposal_id: string;
  cluster_id: string;
  node_run_id: string;
  node_version: "N5-cross-event-1.0.0-draft.2";
  input_hash: string;
  envelope_fingerprint: string;
  proposal_fingerprint: string;
  member_case_snapshots: W6CaseMembershipSnapshot[];
  similarity: number;
  evidence_spans: EvidenceSpan[];
  automatic_merge: false;
  automatic_case_relink: false;
  created_at: string;
}

export interface W6RootCauseHypothesis {
  hypothesis_id: string;
  node_run_id: string;
  node_version: "N6-root-cause-1.0.0-draft.3";
  input_hash: string;
  statement: string;
  supporting_evidence: EvidenceSpan[];
  counter_evidence: EvidenceSpan[];
  uncertainties: string[];
  final_root_cause: false;
}

export interface RuntimeProblemCluster {
  schema_version: CanonicalSchemaVersion;
  data_scope: "synthetic_experiment";
  evidence_class: "synthetic_experiment";
  source_kind: "scenario_runtime";
  source_name: "synthetic_experiment";
  source_locator: string;
  source_sha256: string;
  cluster_id: string;
  name: string;
  category_domain: string;
  member_case_ids: string[];
  clustering_mode: "cross_event";
  clustering_version: "N5-cross-event-1.0.0-draft.2";
  proposal_id: string;
  root_cause_hypothesis: W6RootCauseHypothesis | null;
  active_improvement_id: string | null;
  recurrence_count: number;
  status: ClusterStatus;
  created_at: string;
  updated_at: string;
}

export interface RuntimeImprovementProject {
  schema_version: CanonicalSchemaVersion;
  data_scope: "synthetic_experiment";
  evidence_class: "synthetic_experiment";
  source_kind: "scenario_runtime";
  source_name: "synthetic_experiment";
  source_locator: string;
  source_sha256: string;
  improvement_id: string;
  cluster_id: string;
  version: string;
  owner_role: string;
  measure: string;
  observation_window_days: [7, 30];
  clock_source: ClockSource;
  metric_formula: string;
  current_observation_cycle_id: string | null;
  human_conclusion: string | null;
  status: ImprovementStatus;
  created_at: string;
  updated_at: string;
}

export interface W6ObservationCycle {
  cycle_id: string;
  cluster_id: string;
  improvement_id: string;
  ordinal: number;
  trigger: "initial_observation" | "recurrence_reopen";
  triggering_case_ids: string[];
  triggering_case_snapshots: W6CaseMembershipSnapshot[];
  clock_source: ClockSource;
  opened_at: string;
  opened_by: W3AuthorizedPrincipal;
  authorization_policy_version: string;
}

export interface W6RecurrenceCaseSnapshot extends W6CaseMembershipSnapshot {
  observed_at: string;
  time_source: "authorized_reopen" | "case_closed_at";
}

export interface W6ObservationCheckpoint {
  checkpoint_id: string;
  event_id: string;
  cluster_id: string;
  improvement_id: string;
  cycle_id: string;
  horizon_days: 7 | 30;
  clock_source: ClockSource;
  window_opened_at: string;
  expected_at: string;
  recorded_at: string;
  recurrence_case_ids: string[];
  recurrence_case_snapshots: W6RecurrenceCaseSnapshot[];
  recurrence_count: number;
  related_task_volume: number | null;
  recurrence_rate: number | null;
}

export interface W6ActiveObservationRecurrenceIntake {
  intake_id: string;
  event_id: string;
  cluster_id: string;
  improvement_id: string;
  cycle_id: string;
  triggering_case_ids: string[];
  triggering_case_snapshots: W6CaseMembershipSnapshot[];
  n5_validation_fingerprint: string;
  clock_source: ClockSource;
  observed_at: string;
  authorized_by: W3AuthorizedPrincipal;
  authorization_policy_version: string;
}

export type W6Phase = "cluster_review" | "improvement" | "observation" | "recurrence";

export type W6AuthorizedAction =
  | "review_candidate"
  | "start_improvement"
  | "enter_observation"
  | "archive_observation"
  | "reopen_recurrence"
  | "intake_active_observation_recurrence";

export type W6TimedAction = "record_day_7" | "record_day_30";
export type W6TransitionAction = W6AuthorizedAction | W6TimedAction;

interface W6TransitionBase {
  action: W6TransitionAction;
  case_ids: string[];
  cluster_id: string;
  improvement_id: string | null;
  expected_cluster_fingerprint: string;
  expected_improvement_fingerprint: string | null;
  history_id: string;
  receipt_id: string;
  occurred_at: string;
}

export interface W6ReviewCandidateTransition extends W6TransitionBase {
  action: "review_candidate";
  improvement_id: null;
  decision: "submit_for_review" | "reject";
  reason: string;
}

export interface W6StartImprovementTransition extends W6TransitionBase {
  action: "start_improvement";
  improvement_id: string;
  improvement: {
    version: string;
    owner_role: string;
    measure: string;
    observation_window_days: [7, 30];
    clock_source: ClockSource;
    metric_formula: string;
  };
  root_cause_hypothesis: W6RootCauseHypothesis;
  reason: string;
}

export interface W6EnterObservationTransition extends W6TransitionBase {
  action: "enter_observation";
  improvement_id: string;
  cycle_id: string;
  clock_source: ClockSource;
  reason: string;
}

interface W6TimedObservationTransition extends W6TransitionBase {
  action: W6TimedAction;
  improvement_id: string;
  cycle_id: string;
  clock_source: ClockSource;
  recurrence_case_ids: string[];
  related_task_volume: number | null;
  checkpoint_id: string;
}

export interface W6Day7Transition extends W6TimedObservationTransition {
  action: "record_day_7";
}

export interface W6Day30Transition extends W6TimedObservationTransition {
  action: "record_day_30";
}

export interface W6ArchiveObservationTransition extends W6TransitionBase {
  action: "archive_observation";
  improvement_id: string;
  cycle_id: string;
  human_conclusion: string;
  reason: string;
}

export interface W6ReopenRecurrenceTransition extends W6TransitionBase {
  action: "reopen_recurrence";
  improvement_id: string;
  cycle_id: string;
  triggering_case_ids: string[];
  clock_source: ClockSource;
  reason: string;
}

export interface W6ActiveObservationRecurrenceIntakeTransition extends W6TransitionBase {
  action: "intake_active_observation_recurrence";
  improvement_id: string;
  expected_w6_state_fingerprint: string;
  cycle_id: string;
  triggering_case_ids: string[];
  intake_id: string;
  clock_source: ClockSource;
  n5_validation_fingerprint: string;
  reason: string;
}

export type W6AtomicTransition =
  | W6ReviewCandidateTransition
  | W6StartImprovementTransition
  | W6EnterObservationTransition
  | W6Day7Transition
  | W6Day30Transition
  | W6ArchiveObservationTransition
  | W6ReopenRecurrenceTransition
  | W6ActiveObservationRecurrenceIntakeTransition;

export interface W6HistoryEntry {
  history_id: string;
  event_id: string;
  phase: W6Phase;
  action: "create_cluster_candidate" | W6TransitionAction;
  case_ids: string[];
  cluster_id: string;
  improvement_id: string | null;
  cycle_id: string | null;
  previous_cluster_status: ClusterStatus | null;
  next_cluster_status: ClusterStatus;
  previous_improvement_status: ImprovementStatus | null;
  next_improvement_status: ImprovementStatus | null;
  reason: string;
  principal: W3AuthorizedPrincipal | null;
  authorization_policy_version: string | null;
  occurred_at: string;
}

export interface W6CommitReceipt {
  receipt_id: string;
  event_id: string;
  phase: W6Phase;
  action: "create_cluster_candidate" | W6TransitionAction;
  case_ids: string[];
  cluster_id: string;
  improvement_id: string | null;
  target_fingerprint: string | null;
  command_fingerprint: string;
  history_id: string;
  cycle_id: string | null;
  checkpoint_id: string | null;
  state_fingerprint: string;
  committed_at: string;
}

export interface W6History {
  proposal: W6CrossEventProposal;
  entries: W6HistoryEntry[];
  observation_cycles: W6ObservationCycle[];
  active_recurrence_intakes: W6ActiveObservationRecurrenceIntake[];
  observation_checkpoints: W6ObservationCheckpoint[];
  receipts: W6CommitReceipt[];
}

export interface W6CommitResult {
  outcome: "committed" | "idempotent" | "concurrency_conflict";
  cluster: RuntimeProblemCluster;
  improvement: RuntimeImprovementProject | null;
  observation_cycle: W6ObservationCycle | null;
  active_recurrence_intake: W6ActiveObservationRecurrenceIntake | null;
  observation_checkpoint: W6ObservationCheckpoint | null;
  history: W6History;
  receipt: W6CommitReceipt;
}

export interface FrontHalfStage {
  phase: "W1" | "W2" | "W6.same_event";
  result: WorkflowResult;
}

export interface FrontHalfRunResult {
  status: "completed" | "idempotent" | "needs_human" | "failed";
  stopped_at: "W1" | "W2" | "W6.same_event" | null;
  feedback_id: string | null;
  case_id: string | null;
  stages: FrontHalfStage[];
  request: IngestRequest;
}
