import type { EvidenceSpan, JsonValue, RiskLevel } from "../contracts/model.js";

export const AI_NODE_CANDIDATE_REQUIRED_FIELDS = [
  "payload",
  "evidence_spans",
  "missing_fields",
  "confidence",
  "status",
] as const;

export const AI_NODE_DEFINITIONS = {
  N1: {
    node: "N1",
    mode: "default",
    version: "N1-1.0.0-draft.2",
    input_fields: ["original_text", "channel_metadata"],
    payload_fields: ["fact_spans", "request", "request_evidence_span_index", "entity_clues"],
  },
  N2: {
    node: "N2",
    mode: "default",
    version: "N2-1.0.0-draft.2",
    input_fields: ["n1_output", "taxonomy", "taxonomy_version"],
    payload_fields: ["business_domain", "subcategory", "tags", "taxonomy_version"],
  },
  N3: {
    node: "N3",
    mode: "default",
    version: "N3-1.0.0-draft.2",
    input_fields: ["original_text", "n1_output", "hard_rule_result"],
    payload_fields: ["risk_suggestion", "trigger_evidence", "explanation"],
  },
  N4: {
    node: "N4",
    mode: "default",
    version: "N4-1.0.0-draft.2",
    input_fields: ["case_facts", "vehicle_candidates", "task_candidates", "site_candidates"],
    payload_fields: ["candidate_objects", "human_confirmation_required"],
  },
  N5_SAME_EVENT: {
    node: "N5",
    mode: "same_event_duplicate",
    version: "N5-same-event-1.0.0-draft.2",
    input_fields: ["case_facts", "time", "confirmed_entities", "source_reference"],
    payload_fields: [
      "duplicate_candidate",
      "human_confirmation_required",
      "automatic_merge",
      "automatic_relink",
    ],
  },
  N5_CROSS_EVENT: {
    node: "N5",
    mode: "cross_event_clustering",
    version: "N5-cross-event-1.0.0-draft.2",
    input_fields: ["case_facts", "time", "confirmed_entities", "source_reference"],
    payload_fields: [
      "cluster_candidate",
      "human_review_required",
      "automatic_merge",
      "automatic_case_relink",
    ],
  },
  N6_RESPONSIBILITY_ROUTING: {
    node: "N6",
    mode: "responsibility_routing",
    version: "N6-responsibility-routing-1.0.0-draft.2",
    input_fields: ["evidence", "responsibility_matrix", "issue_cluster", "resolution_records"],
    payload_fields: ["candidates", "human_confirmation_required"],
  },
  N6_ROOT_CAUSE: {
    node: "N6",
    mode: "root_cause_hypothesis",
    version: "N6-root-cause-1.0.0-draft.3",
    input_fields: ["evidence", "issue_cluster", "resolution_records", "hypothesis_catalog"],
    payload_fields: ["hypotheses", "human_review_required", "final_root_cause"],
  },
  N7_CUSTOMER_REPLY: {
    node: "N7",
    mode: "customer_reply",
    version: "N7-1.0.0-draft.2",
    input_fields: ["reviewed_facts", "resolution_result", "reviewed_knowledge_index"],
    payload_fields: [
      "draft_kind",
      "draft",
      "citations",
      "supporting_evidence_indices",
      "publication_state",
      "human_review_required",
      "automatic_publication",
    ],
  },
  N7_KNOWLEDGE_DRAFT: {
    node: "N7",
    mode: "knowledge_draft",
    version: "N7-1.0.0-draft.2",
    input_fields: ["reviewed_facts", "resolution_result", "reviewed_knowledge_index"],
    payload_fields: [
      "draft_kind",
      "draft",
      "citations",
      "supporting_evidence_indices",
      "publication_state",
      "human_review_required",
      "automatic_publication",
    ],
  },
  N7_INSIGHT_SUMMARY: {
    node: "N7",
    mode: "insight_summary",
    version: "N7-1.0.0-draft.2",
    input_fields: ["reviewed_facts", "resolution_result", "reviewed_knowledge_index"],
    payload_fields: [
      "draft_kind",
      "draft",
      "citations",
      "supporting_evidence_indices",
      "publication_state",
      "human_review_required",
      "automatic_publication",
    ],
  },
} as const;

export type N1Payload = {
  fact_spans: Array<{ fact: string; evidence_span_index: number }>;
  request: string | null;
  request_evidence_span_index: number | null;
  entity_clues: {
    vehicle_ids: string[];
    task_ids: string[];
    station_names: string[];
  };
};

export type N2Payload = {
  business_domain: string;
  subcategory: string;
  tags: string[];
  taxonomy_version: string;
};

export type N3Payload = {
  risk_suggestion: RiskLevel;
  trigger_evidence: number[];
  explanation: string;
};

export type N4CandidateObject = {
  object_type: "vehicle" | "delivery_task" | "station";
  object_id: string;
  evidence_span_indices: number[];
};

export type N4Payload = {
  candidate_objects: N4CandidateObject[];
  human_confirmation_required: true;
};

export type N5SameEventPayload = {
  duplicate_candidate: {
    candidate_case_id: string;
    similarity: number;
    evidence_span_indices: number[];
  } | null;
  human_confirmation_required: boolean;
  automatic_merge: false;
  automatic_relink: false;
};

export type N5CrossEventPayload = {
  cluster_candidate: {
    candidate_kind: "new_cluster" | "existing_cluster";
    suggested_cluster_id: string | null;
    member_cases: Array<{
      case_id: string;
      evidence_span_indices: number[];
    }>;
    similarity: number;
  };
  human_review_required: true;
  automatic_merge: false;
  automatic_case_relink: false;
};

export type N6ResponsibilityRoutingCandidate = {
  routing_rule_id: string;
  rule_version: string;
  candidate_team: string;
  candidate_logical_role: string;
  sla_rule_version: string;
  supporting_evidence_indices: number[];
  counter_evidence_indices: number[];
  uncertainties: string[];
};

export type N6ResponsibilityRoutingPayload = {
  candidates: N6ResponsibilityRoutingCandidate[];
  human_confirmation_required: true;
};

export type N6RootCauseHypothesis = {
  hypothesis_id: string;
  statement: string;
  supporting_evidence_indices: number[];
  counter_evidence_indices: number[];
  uncertainty_ids: string[];
  uncertainties: string[];
};

export type N6RootCauseUncertaintyCatalogItem = {
  uncertainty_id: string;
  label: string;
};

export type N6RootCauseHypothesisCatalogItem = {
  hypothesis_id: string;
  factor_label: string;
  phenomenon_label: string;
  uncertainty_options: N6RootCauseUncertaintyCatalogItem[];
};

export type N6RootCausePayload = {
  hypotheses: N6RootCauseHypothesis[];
  human_review_required: true;
  final_root_cause: false;
};

export type N7Mode = "customer_reply" | "knowledge_draft" | "insight_summary";

export type N7Citation = {
  knowledge_id: string;
  version: string;
  evidence_span_indices: number[];
};

export type N7Payload = {
  draft_kind: N7Mode;
  draft: string;
  citations: N7Citation[];
  supporting_evidence_indices: number[];
  publication_state: "draft_unpublished";
  human_review_required: true;
  automatic_publication: false;
};

export type AiNodeCandidate = {
  payload: JsonValue | null;
  evidence_spans: EvidenceSpan[];
  missing_fields: string[];
  confidence: number | null;
  status: "ok" | "needs_human" | "refused" | "error";
};
