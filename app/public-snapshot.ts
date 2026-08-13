import casesDocument from "../data/canonical/public/cases.json";
import clustersDocument from "../data/canonical/public/clusters.json";
import declarationsDocument from "../data/canonical/public/declarations.json";
import failureDrillsDocument from "../data/canonical/public/failure-drills.json";
import improvementsDocument from "../data/canonical/public/improvements.json";
import mainStoryDocument from "../data/canonical/public/main-story.json";
import workOrdersDocument from "../data/canonical/public/work-orders.json";
import caseCockpitDocument from "../data/canonical/public/views/case-cockpit.json";
import feedbackInboxDocument from "../data/canonical/public/views/feedback-inbox.json";
import improvementTrackerDocument from "../data/canonical/public/views/improvement-tracker.json";
import problemMapDocument from "../data/canonical/public/views/problem-map.json";
import slaBoardDocument from "../data/canonical/public/views/sla-board.json";

export type EvidenceClass =
  | "public_fact"
  | "enterprise_pending"
  | "solution_design"
  | "synthetic_experiment";

type RecordDocument<T> = {
  snapshot_version: string;
  schema_version: string;
  fixture_version: string;
  data_scope: string;
  evidence_class: EvidenceClass;
  snapshot_at: string;
  disclaimer: string;
  record_count: number;
  records: T[];
};

type PublicViewDocument<T> = RecordDocument<T> & {
  view_key: ViewKey;
  label: string;
  read_only: boolean;
  derived_from_public_files: string[];
};

export type ViewKey =
  | "feedback_inbox"
  | "case_cockpit"
  | "sla_board"
  | "problem_map"
  | "improvement_tracker";

export type CaseRecord = {
  case_id: string;
  record_mode: string;
  workflow_readiness: string;
  workflow_run_evidence: boolean;
  title: string;
  summary: string;
  category_domain: string;
  category_detail: string;
  final_risk: string | null;
  status: string;
  missing_fields: string[];
  candidate_vehicle_id: string | null;
  candidate_task_id: string | null;
  candidate_station_id: string | null;
  candidate_confidence: number | null;
  formal_entity_confirmation_status: string;
  formal_entity: string | null;
  cluster_id: string | null;
  suggested_team: string;
  routing_confirmation_status: string;
  routing_evidence_class: EvidenceClass;
  sla_started_at: string | null;
  sla_due_at: string | null;
};

export type FeedbackRecord = {
  feedback_id: string;
  record_mode: string;
  workflow_run_evidence: boolean;
  evidence_class: EvidenceClass;
  channel: string;
  received_at: string;
  processing_status: string;
  linked_case_id: string | null;
  missing_fields: string[];
  duplicate_candidate_status: string;
  duplicate_evidence_available: boolean;
  duplicate_candidate_case_ids: string[];
};

type CaseCockpitRecord = {
  case_id: string;
  record_mode: string;
  workflow_run_evidence: boolean;
  evidence_class: EvidenceClass;
  cluster_id: string | null;
  feedback_ids: string[];
  work_order_ids: string[];
  audit_evidence_available: boolean;
  follow_up_evidence_available: boolean;
};

export type WorkOrderRecord = {
  work_order_id: string;
  case_id: string;
  record_mode: string;
  workflow_run_evidence: boolean;
  evidence_class: EvidenceClass;
  team: string;
  assignee_role: string;
  action: string;
  status: string;
  accepted_at: string | null;
  due_at: string | null;
  completed_at: string | null;
  first_response_target_minutes: number | null;
  escalation_level: string;
  sla_reset_count: number;
};

type SlaRecord = {
  work_order_id: string;
  record_mode: string;
  workflow_run_evidence: boolean;
  evidence_class: EvidenceClass;
  clock_source: string;
};

export type ClusterRecord = {
  cluster_id: string;
  record_mode: string;
  workflow_run_evidence: boolean;
  evidence_class: EvidenceClass;
  name: string;
  category_domain: string;
  member_case_ids: string[];
  root_cause_hypothesis: string;
  root_cause_confirmation_status: string;
  status: string;
  highest_risk: string | null;
  next_step: string;
};

type ProblemMapRecord = {
  cluster_id: string;
  record_mode: string;
  workflow_run_evidence: boolean;
  evidence_class: EvidenceClass;
  name: string;
  category_domain: string;
  member_case_ids: string[];
  member_case_count: number;
  synthetic_station_ids: string[];
  synthetic_vehicle_models: string[];
  synthetic_vehicle_versions: string[];
  synthetic_sla_window_start: string | null;
  synthetic_sla_window_end: string | null;
  clock_source: string;
  root_cause_confirmation_status: string;
  recurrence_evidence_available: boolean;
};

export type ImprovementRecord = {
  improvement_id: string;
  cluster_id: string;
  record_mode: string;
  workflow_run_evidence: boolean;
  runtime_evidence_available: boolean;
  evidence_class: EvidenceClass;
  enterprise_confirmation_status: string;
  owner_evidence_class: EvidenceClass;
  version: string;
  owner_role: string;
  measure: string;
  observation_window_days: number[];
  clock_source: string;
  metric_formula: string;
  day_7_result: number | null;
  day_30_result: number | null;
  human_conclusion: string | null;
  status: string;
};

type ImprovementTrackerRecord = {
  improvement_id: string;
  cluster_id: string;
  record_mode: string;
  workflow_run_evidence: boolean;
  runtime_evidence_available: boolean;
  evidence_class: EvidenceClass;
  clock_source: string;
};

type MainStory = {
  scenario_id: string;
  source_case_id: string;
  runtime_case_id: string;
  execution_status: "not_run";
  runtime_evidence_available: false;
  evidence_class: EvidenceClass;
  clock: {
    source: string;
    timezone: string;
    anchor: string;
    advancement: string;
  };
  observation_clock: {
    source: string;
    timezone: string;
    planned_offsets_days: number[];
    execution_status: "not_run";
  };
  replay_input: {
    feedback_id: string;
    received_at: string;
    channel: string;
    sender_role: string;
    original_text: string;
    original_text_mutable: boolean;
    vehicle_id: string;
    task_id: string;
    station_id: string;
  };
  expected_case_draft: {
    missing_fields: string[];
    case_status: string;
  };
  planned_workflow_path: Array<{
    order: number;
    workflow: string;
    mode?: string;
    expectation: string;
  }>;
  human_gate_keys: string[];
  forbidden_actions: string[];
  source_snapshot_mutation_allowed: false;
  runtime_copy_is_independent: true;
  legacy_snapshot_is_workflow_run_evidence: false;
  replay_reset_required: true;
  replay_reset_status: string;
};

export type FailureDrill = {
  drill_id: string;
  category_key: string;
  source_case_id: string;
  runtime_case_id: string;
  execution_status: "not_run";
  runtime_evidence_available: false;
  evidence_class: EvidenceClass;
  clock_source: string;
  clock_timezone: string;
  clock_anchor: string;
  fault_summary: string;
  expected_safe_path: string;
  expected_retry_limit: number | null;
  expected_case_status: string | null;
  expected_missing_fields: string[];
  preserve_original_clock: boolean | null;
  human_gate_keys: string[];
  forbidden_actions: string[];
};

type FactBoundary = {
  evidence_class: EvidenceClass;
  label: string;
  requirement: string;
  forbidden_practice: string;
  public_status: string;
};

const declarations = declarationsDocument as unknown as {
  snapshot_version: string;
  schema_version: string;
  fixture_version: string;
  snapshot_at: string;
  data_scope: string;
  team_name: string;
  product_name: string;
  value_statement: string;
  disclaimer: string;
  fact_boundaries: FactBoundary[];
  claims: {
    enterprise_data_included: false;
    enterprise_system_connected: false;
    runtime_results_included: false;
  };
};

const cases = (casesDocument as unknown as RecordDocument<CaseRecord>).records;
const workOrders = (workOrdersDocument as unknown as RecordDocument<WorkOrderRecord>).records;
const clusters = (clustersDocument as unknown as RecordDocument<ClusterRecord>).records;
const improvements = (improvementsDocument as unknown as RecordDocument<ImprovementRecord>).records;
const feedbackView = feedbackInboxDocument as unknown as PublicViewDocument<FeedbackRecord>;
const caseView = caseCockpitDocument as unknown as PublicViewDocument<CaseCockpitRecord>;
const slaView = slaBoardDocument as unknown as PublicViewDocument<SlaRecord>;
const problemView = problemMapDocument as unknown as PublicViewDocument<ProblemMapRecord>;
const improvementView = improvementTrackerDocument as unknown as PublicViewDocument<ImprovementTrackerRecord>;

const caseIndex = new Map(cases.map((record) => [record.case_id, record]));
const workOrderIndex = new Map(workOrders.map((record) => [record.work_order_id, record]));
const clusterIndex = new Map(clusters.map((record) => [record.cluster_id, record]));
const improvementIndex = new Map(improvements.map((record) => [record.improvement_id, record]));

export const snapshotMeta = {
  snapshotVersion: declarations.snapshot_version,
  schemaVersion: declarations.schema_version,
  fixtureVersion: declarations.fixture_version,
  snapshotAt: declarations.snapshot_at,
  dataScope: declarations.data_scope,
  teamName: declarations.team_name,
  productName: declarations.product_name,
  valueStatement: declarations.value_statement,
  disclaimer: declarations.disclaimer,
  claims: declarations.claims,
} as const;

export const evidenceBoundaries = declarations.fact_boundaries;

export const fiveViews = [
  { key: feedbackView.view_key, label: feedbackView.label, count: feedbackView.record_count },
  { key: caseView.view_key, label: caseView.label, count: caseView.record_count },
  { key: slaView.view_key, label: slaView.label, count: slaView.record_count },
  { key: problemView.view_key, label: problemView.label, count: problemView.record_count },
  { key: improvementView.view_key, label: improvementView.label, count: improvementView.record_count },
] as const;

export const feedbackRows = feedbackView.records.map((record) => ({
  ...record,
  linkedCase: record.linked_case_id ? caseIndex.get(record.linked_case_id) ?? null : null,
}));

export const caseRows = caseView.records.map((record) => ({
  ...record,
  caseRecord: caseIndex.get(record.case_id) ?? null,
  workOrders: record.work_order_ids
    .map((id) => workOrderIndex.get(id))
    .filter((item): item is WorkOrderRecord => Boolean(item)),
}));

export const slaRows = slaView.records.map((record) => {
  const workOrder = workOrderIndex.get(record.work_order_id) ?? null;
  return {
    ...record,
    workOrder,
    caseRecord: workOrder ? caseIndex.get(workOrder.case_id) ?? null : null,
  };
});

export const problemRows = problemView.records.map((record) => ({
  ...record,
  clusterRecord: clusterIndex.get(record.cluster_id) ?? null,
}));

export const improvementRows = improvementView.records.map((record) => {
  const improvementRecord = improvementIndex.get(record.improvement_id) ?? null;
  return {
    ...record,
    improvementRecord,
    clusterRecord: improvementRecord
      ? clusterIndex.get(improvementRecord.cluster_id) ?? null
      : null,
  };
});

export const mainStory = (mainStoryDocument as unknown as RecordDocument<MainStory>).records[0];
export const mainStoryCase = caseIndex.get(mainStory.source_case_id) ?? null;
export const failureDrills = (
  failureDrillsDocument as unknown as RecordDocument<FailureDrill>
).records;
