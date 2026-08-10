import { createHash } from "node:crypto";

import type { IngestPorts } from "../contracts/ports.js";
import type { IngestRequest, IngestResult, JsonValue, StoredRawFeedback } from "../contracts/model.js";

function canonicalize(value: JsonValue): JsonValue {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalize(entry)]),
    );
  }
  return value;
}

export function fingerprintIngestRequest(request: IngestRequest): string {
  const content: JsonValue = {
    schema_version: request.schema_version,
    data_scope: request.data_scope,
    evidence_class: request.evidence_class,
    source_tenant_scope: request.source_tenant_scope,
    channel: request.channel,
    source_record_id: request.source_record_id ?? null,
    original_text: request.original_text,
    received_at: request.received_at,
    authorization_scope: request.authorization_scope,
    metadata: request.metadata ?? {},
  };

  return createHash("sha256").update(JSON.stringify(canonicalize(content))).digest("hex");
}

export function resolveIdempotency(
  existing: StoredRawFeedback,
  incomingFingerprint: string,
): IngestResult {
  if (existing.content_fingerprint === incomingFingerprint) {
    return {
      outcome: "idempotent_replay",
      feedback_id: existing.feedback_id,
      idempotency_key: existing.idempotency_key,
      created_at: existing.created_at,
    };
  }

  return {
    outcome: "idempotency_conflict",
    existing_feedback_id: existing.feedback_id,
    idempotency_key: existing.idempotency_key,
  };
}

export async function ingestFeedback(request: IngestRequest, ports: IngestPorts): Promise<IngestResult> {
  const fingerprint = fingerprintIngestRequest(request);
  const existing = await ports.repository.findRawFeedbackByIdempotencyKey(request.idempotency_key);
  if (existing) {
    return resolveIdempotency(existing, fingerprint);
  }

  const record: StoredRawFeedback = {
    feedback_id: ports.ids.nextId("feedback"),
    idempotency_key: request.idempotency_key,
    content_fingerprint: fingerprint,
    request,
    processing_status: "待分诊",
    created_at: ports.clock.now().toISOString(),
  };

  const insertion = await ports.repository.insertRawFeedbackIfAbsent(record);
  if (!insertion.inserted) {
    return resolveIdempotency(insertion.record, fingerprint);
  }

  return {
    outcome: "created",
    feedback_id: record.feedback_id,
    idempotency_key: record.idempotency_key,
    created_at: record.created_at,
  };
}
