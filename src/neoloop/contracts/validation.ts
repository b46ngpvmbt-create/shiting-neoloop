import {
  AI_NODE_ENVELOPE_REQUIRED_FIELDS,
  AI_NODE_IDS,
  AI_NODE_STATUSES,
  HUMAN_REVISION_STATES,
  type AiNodeEnvelope,
  type JsonValue,
} from "./model.js";

export type AiNodeEnvelopeBoundaryResult =
  | { valid: true; value: AiNodeEnvelope<JsonValue>; errors: [] }
  | { valid: false; errors: string[] };

export class ContractValidationError extends Error {
  readonly errors: string[];

  constructor(contractName: string, errors: string[]) {
    super(`${contractName} validation failed: ${errors.join("; ")}`);
    this.name = "ContractValidationError";
    this.errors = [...errors];
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function rejectUnexpectedFields(
  value: Record<string, unknown>,
  allowedFields: readonly string[],
  path: string,
  errors: string[],
): void {
  const allowed = new Set(allowedFields);
  for (const field of Object.keys(value)) {
    if (!allowed.has(field)) {
      errors.push(`${path}${path.length > 0 ? "." : ""}${field} is not allowed`);
    }
  }
}

function isJsonValue(value: unknown, depth = 0): value is JsonValue {
  if (depth > 16) {
    return false;
  }
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return true;
  }
  if (typeof value === "number") {
    return Number.isFinite(value);
  }
  if (Array.isArray(value)) {
    return value.every((entry) => isJsonValue(entry, depth + 1));
  }
  if (isObject(value)) {
    return Object.values(value).every((entry) => isJsonValue(entry, depth + 1));
  }
  return false;
}

function validateEvidenceSpan(value: unknown, path: string, errors: string[]): void {
  if (!isObject(value)) {
    errors.push(`${path} must be an object`);
    return;
  }
  if (!isNonEmptyString(value.source_ref)) {
    errors.push(`${path}.source_ref must be a non-empty string`);
  }
  if (!isNonEmptyString(value.quote)) {
    errors.push(`${path}.quote must be a non-empty string`);
  }
  for (const field of ["start_offset", "end_offset"] as const) {
    const offset = value[field];
    if (offset !== undefined && (!Number.isInteger(offset) || (offset as number) < 0)) {
      errors.push(`${path}.${field} must be a non-negative integer`);
    }
  }
  if (
    Number.isInteger(value.start_offset) &&
    Number.isInteger(value.end_offset) &&
    (value.end_offset as number) < (value.start_offset as number)
  ) {
    errors.push(`${path}.end_offset must not precede start_offset`);
  }
}

export function validateAiNodeEnvelope(value: unknown): AiNodeEnvelopeBoundaryResult {
  const errors: string[] = [];
  if (!isObject(value)) {
    return { valid: false, errors: ["envelope must be an object"] };
  }

  for (const field of AI_NODE_ENVELOPE_REQUIRED_FIELDS) {
    if (!(field in value)) {
      errors.push(`${field} is required`);
    }
  }
  rejectUnexpectedFields(value, AI_NODE_ENVELOPE_REQUIRED_FIELDS, "", errors);

  if (!AI_NODE_IDS.includes(value.node as (typeof AI_NODE_IDS)[number])) {
    errors.push("node must be one of N1-N7");
  }
  for (const field of ["mode", "version", "run_id"] as const) {
    if (!isNonEmptyString(value[field])) {
      errors.push(`${field} must be a non-empty string`);
    }
  }
  if (!isNonEmptyString(value.input_hash) || !/^[a-f0-9]{64}$/i.test(value.input_hash)) {
    errors.push("input_hash must be a 64-character hexadecimal SHA-256 value");
  }

  if (!isObject(value.object_ref)) {
    errors.push("object_ref must be an object");
  } else {
    rejectUnexpectedFields(value.object_ref, ["object_type", "object_id"], "object_ref", errors);
    if (!isNonEmptyString(value.object_ref.object_type)) {
      errors.push("object_ref.object_type must be a non-empty string");
    }
    if (!isNonEmptyString(value.object_ref.object_id)) {
      errors.push("object_ref.object_id must be a non-empty string");
    }
  }

  if (!isJsonValue(value.payload)) {
    errors.push("payload must be a finite JSON value or null");
  }

  if (!Array.isArray(value.evidence_spans)) {
    errors.push("evidence_spans must be an array");
  } else {
    value.evidence_spans.forEach((span, index) => validateEvidenceSpan(span, `evidence_spans[${index}]`, errors));
  }

  if (!Array.isArray(value.missing_fields) || !value.missing_fields.every(isNonEmptyString)) {
    errors.push("missing_fields must be an array of non-empty strings");
  }

  if (
    value.confidence !== null &&
    (typeof value.confidence !== "number" ||
      !Number.isFinite(value.confidence) ||
      value.confidence < 0 ||
      value.confidence > 1)
  ) {
    errors.push("confidence must be null or a finite number from 0 to 1");
  }

  if (!AI_NODE_STATUSES.includes(value.status as (typeof AI_NODE_STATUSES)[number])) {
    errors.push("status must be ok, needs_human, refused, or error");
  }

  if (!isObject(value.validation)) {
    errors.push("validation must be an object");
  } else {
    rejectUnexpectedFields(value.validation, ["valid", "errors"], "validation", errors);
    if (typeof value.validation.valid !== "boolean") {
      errors.push("validation.valid must be boolean");
    }
    if (!Array.isArray(value.validation.errors) || !value.validation.errors.every(isNonEmptyString)) {
      errors.push("validation.errors must be an array of non-empty strings");
    }
    if (value.status === "ok" && value.validation.valid !== true) {
      errors.push("status ok requires validation.valid=true");
    }
  }

  if (value.retry_count !== 0 && value.retry_count !== 1) {
    errors.push("retry_count must be 0 or 1");
  }

  if (!isObject(value.human_revision)) {
    errors.push("human_revision must be an object");
  } else {
    rejectUnexpectedFields(
      value.human_revision,
      ["state", "revised_payload", "note"],
      "human_revision",
      errors,
    );
    if (!HUMAN_REVISION_STATES.includes(value.human_revision.state as (typeof HUMAN_REVISION_STATES)[number])) {
      errors.push("human_revision.state is invalid");
    }
    if (value.human_revision.revised_payload !== undefined && !isJsonValue(value.human_revision.revised_payload)) {
      errors.push("human_revision.revised_payload must be a finite JSON value");
    }
    if (value.human_revision.note !== undefined && !isNonEmptyString(value.human_revision.note)) {
      errors.push("human_revision.note must be a non-empty string when present");
    }
    if (value.human_revision.state === "modified" && value.human_revision.revised_payload === undefined) {
      errors.push("modified human_revision requires revised_payload");
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }
  return { valid: true, value: value as unknown as AiNodeEnvelope<JsonValue>, errors: [] };
}

export function isAiNodeEnvelope(value: unknown): value is AiNodeEnvelope<JsonValue> {
  return validateAiNodeEnvelope(value).valid;
}

export function assertAiNodeEnvelope(value: unknown): asserts value is AiNodeEnvelope<JsonValue> {
  const result = validateAiNodeEnvelope(value);
  if (!result.valid) {
    throw new ContractValidationError("AiNodeEnvelope", result.errors);
  }
}
