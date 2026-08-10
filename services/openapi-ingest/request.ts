import type { DataScope, EvidenceClass, IngestRequest, JsonValue } from "../../src/neoloop/contracts/model.js";
import {
  CANONICAL_SCHEMA_VERSION,
  DATA_SCOPES,
  EVIDENCE_CLASSES,
} from "../../src/neoloop/contracts/model.js";

export class InvalidIngestRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidIngestRequestError";
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredString(body: Record<string, unknown>, field: string, maxLength: number): string {
  const value = body[field];
  if (typeof value !== "string" || value.trim().length === 0 || value.length > maxLength) {
    throw new InvalidIngestRequestError(`Invalid ${field}`);
  }
  return value;
}

function optionalString(body: Record<string, unknown>, field: string, maxLength: number): string | undefined {
  const value = body[field];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string" || value.trim().length === 0 || value.length > maxLength) {
    throw new InvalidIngestRequestError(`Invalid ${field}`);
  }
  return value;
}

function assertJsonValue(value: unknown, depth = 0): asserts value is JsonValue {
  if (depth > 8) {
    throw new InvalidIngestRequestError("metadata nesting is too deep");
  }
  if (value === null || ["string", "number", "boolean"].includes(typeof value)) {
    if (typeof value === "number" && !Number.isFinite(value)) {
      throw new InvalidIngestRequestError("metadata contains a non-finite number");
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry) => assertJsonValue(entry, depth + 1));
    return;
  }
  if (isObject(value)) {
    Object.values(value).forEach((entry) => assertJsonValue(entry, depth + 1));
    return;
  }
  throw new InvalidIngestRequestError("metadata must contain JSON values only");
}

export function parseIngestRequest(rawBody: string, idempotencyKey: string): IngestRequest {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    throw new InvalidIngestRequestError("Request body must be valid JSON");
  }
  if (!isObject(parsed)) {
    throw new InvalidIngestRequestError("Request body must be a JSON object");
  }

  const evidenceClass = requiredString(parsed, "evidence_class", 64);
  if (!EVIDENCE_CLASSES.includes(evidenceClass as EvidenceClass)) {
    throw new InvalidIngestRequestError("Invalid evidence_class");
  }
  const schemaVersion = requiredString(parsed, "schema_version", 64);
  if (schemaVersion !== CANONICAL_SCHEMA_VERSION) {
    throw new InvalidIngestRequestError("Unsupported schema_version");
  }
  const dataScope = requiredString(parsed, "data_scope", 64);
  if (!DATA_SCOPES.includes(dataScope as DataScope)) {
    throw new InvalidIngestRequestError("Unsupported data_scope for this schema_version");
  }
  const receivedAt = requiredString(parsed, "received_at", 64);
  if (Number.isNaN(new Date(receivedAt).getTime())) {
    throw new InvalidIngestRequestError("Invalid received_at");
  }

  const metadata = parsed.metadata;
  if (metadata !== undefined) {
    if (!isObject(metadata)) {
      throw new InvalidIngestRequestError("metadata must be a JSON object");
    }
    assertJsonValue(metadata);
  }

  return {
    schema_version: CANONICAL_SCHEMA_VERSION,
    data_scope: dataScope as DataScope,
    evidence_class: evidenceClass as EvidenceClass,
    source_tenant_scope: requiredString(parsed, "source_tenant_scope", 128),
    channel: requiredString(parsed, "channel", 128),
    source_record_id: optionalString(parsed, "source_record_id", 256),
    original_text: requiredString(parsed, "original_text", 32_000),
    received_at: new Date(receivedAt).toISOString(),
    authorization_scope: requiredString(parsed, "authorization_scope", 256),
    idempotency_key: idempotencyKey,
    metadata: metadata as Record<string, JsonValue> | undefined,
  };
}
