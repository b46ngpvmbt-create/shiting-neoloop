import { pathToFileURL } from "node:url";

const buildRoot = process.env.NEOLOOP_T3_BUILD_ROOT;
if (!buildRoot) {
  throw new Error("Run core tests with: node tests/core/run-core-tests.mjs");
}

export function importBuilt(relativePath) {
  return import(pathToFileURL(`${buildRoot}/${relativePath}`).href);
}

export class MemoryRepository {
  records = new Map();

  async findRawFeedbackByIdempotencyKey(idempotencyKey) {
    return this.records.get(idempotencyKey) ?? null;
  }

  async insertRawFeedbackIfAbsent(record) {
    const existing = this.records.get(record.idempotency_key);
    if (existing) {
      return { inserted: false, record: existing };
    }
    this.records.set(record.idempotency_key, record);
    return { inserted: true, record };
  }
}

export class SequenceIds {
  current = 0;

  nextId(namespace) {
    this.current += 1;
    return `SYN-${namespace.toUpperCase()}-${String(this.current).padStart(3, "0")}`;
  }
}

export class MemoryNonceStore {
  seen = new Set();

  async consume(nonce) {
    if (this.seen.has(nonce)) {
      return false;
    }
    this.seen.add(nonce);
    return true;
  }
}

export class MemoryAuditSink {
  records = [];

  async append(record) {
    this.records.push(structuredClone(record));
  }
}

export function n1Candidate(originalText, overrides = {}) {
  const quote = overrides.quote ?? originalText;
  const startOffset = originalText.indexOf(quote);
  const entityClues = overrides.entity_clues ?? {
    vehicle_ids: [],
    task_ids: [],
    station_names: originalText.includes("A 站") ? ["A 站"] : [],
  };
  return {
    payload: {
      fact_spans: [{ fact: quote, evidence_span_index: 0 }],
      request: quote,
      request_evidence_span_index: 0,
      entity_clues: entityClues,
      ...overrides.payload,
    },
    evidence_spans: [{
      source_ref: overrides.source_ref ?? "SYN-FEEDBACK-001",
      quote,
      start_offset: startOffset,
      end_offset: startOffset + quote.length,
    }],
    missing_fields: overrides.missing_fields ?? [],
    confidence: overrides.confidence ?? 0.92,
    status: overrides.status ?? "ok",
    ...overrides.candidate,
  };
}

export function n2Candidate(overrides = {}) {
  return {
    payload: {
      business_domain: "车辆运维",
      subcategory: "舱门解锁异常",
      tags: ["舱门", "延误"],
      taxonomy_version: "taxonomy-synthetic-v1",
      ...overrides.payload,
    },
    evidence_spans: [],
    missing_fields: overrides.missing_fields ?? [],
    confidence: overrides.confidence ?? 0.88,
    status: overrides.status ?? "ok",
    ...overrides.candidate,
  };
}

export function n3Candidate(originalText, riskSuggestion = "P2", overrides = {}) {
  const quote = overrides.quote ?? originalText;
  const startOffset = originalText.indexOf(quote);
  return {
    payload: {
      risk_suggestion: riskSuggestion,
      trigger_evidence: [0],
      explanation: "仅依据已引用原文片段给出风险建议；最终风险由硬规则与该建议取较高值。",
      ...overrides.payload,
    },
    evidence_spans: [{
      source_ref: overrides.source_ref ?? "SYN-FEEDBACK-001",
      quote,
      start_offset: startOffset,
      end_offset: startOffset + quote.length,
    }],
    missing_fields: overrides.missing_fields ?? [],
    confidence: overrides.confidence ?? 0.84,
    status: overrides.status ?? "ok",
    ...overrides.candidate,
  };
}

export function n5SameEventCandidate(candidateCaseId = null, overrides = {}) {
  return {
    payload: {
      duplicate_candidate: candidateCaseId === null ? null : {
        candidate_case_id: candidateCaseId,
        similarity: 0.96,
        evidence_span_indices: [0, 1],
      },
      human_confirmation_required: candidateCaseId !== null,
      automatic_merge: false,
      automatic_relink: false,
      ...overrides.payload,
    },
    evidence_spans: candidateCaseId === null ? [] : [
      {
        source_ref: overrides.current_source_ref ?? "SYN-CASE-CURRENT",
        quote: overrides.current_quote ?? "舱门连续两次无法解锁",
      },
      {
        source_ref: overrides.source_ref ?? "SYN-CASE-EXISTING",
        quote: overrides.quote ?? "舱门连续两次无法解锁",
      },
    ],
    missing_fields: [],
    confidence: candidateCaseId === null ? 0.8 : 0.96,
    status: "ok",
    ...overrides.candidate,
  };
}

export function scriptedN1Candidate(originalText, overrides = {}) {
  return (invocation) => n1Candidate(originalText, {
    ...overrides,
    source_ref: invocation.object_ref.object_id,
  });
}

export function scriptedN3Candidate(originalText, riskSuggestion = "P2", overrides = {}) {
  return (invocation) => n3Candidate(originalText, riskSuggestion, {
    ...overrides,
    source_ref: invocation.object_ref.object_id,
  });
}

export function sampleIngestRequest(overrides = {}) {
  return {
    schema_version: "1.0.0-draft.2",
    data_scope: "synthetic_experiment",
    evidence_class: "synthetic_experiment",
    source_tenant_scope: "competition-synthetic",
    channel: "synthetic-form",
    source_record_id: "SYN-SOURCE-017",
    original_text: "A 站取货时舱门连续两次无法解锁，任务已经延误。",
    received_at: "2026-08-01T02:00:00.000Z",
    authorization_scope: "synthetic_demo_only",
    idempotency_key: "competition-synthetic:synthetic-form:SYN-SOURCE-017",
    metadata: { fixture: "SYN-CASE-017" },
    ...overrides,
  };
}
