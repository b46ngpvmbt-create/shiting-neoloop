import {
  CONNECTOR_TRANSPORTS,
  FEEDBACK_SOURCE_TYPES,
  type AttachmentMetadataV1,
  type ConnectorManifestV1,
  type NormalizedFeedbackBatchV1,
  type NormalizedFeedbackV1,
} from "./types.js";

export class GatewayValidationError extends Error {
  readonly code = "invalid_request";

  constructor(message: string) {
    super(message);
    this.name = "GatewayValidationError";
  }
}
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredString(value: Record<string, unknown>, field: string, maxLength: number): string {
  const entry = value[field];
  if (typeof entry !== "string" || entry.trim().length === 0 || entry.length > maxLength) {
    throw new GatewayValidationError(`Invalid ${field}`);
  }
  return entry;
}

function requiredBoolean(value: Record<string, unknown>, field: string): boolean {
  const entry = value[field];
  if (typeof entry !== "boolean") {
    throw new GatewayValidationError(`Invalid ${field}`);
  }
  return entry;
}

function oneOf<T extends string>(entry: string, allowed: readonly T[], field: string): T {
  if (!allowed.includes(entry as T)) {
    throw new GatewayValidationError(`Invalid ${field}`);
  }
  return entry as T;
}

function parseTimestamp(entry: string, field: string): string {
  const date = new Date(entry);
  if (Number.isNaN(date.getTime())) {
    throw new GatewayValidationError(`Invalid ${field}`);
  }
  return date.toISOString();
}

function parseAttachment(value: unknown): AttachmentMetadataV1 {
  if (!isObject(value)) {
    throw new GatewayValidationError("Invalid attachments");
  }
  const byteLength = value.byte_length;
  if (!Number.isSafeInteger(byteLength) || (byteLength as number) < 0) {
    throw new GatewayValidationError("Invalid attachment byte_length");
  }
  const sha256 = requiredString(value, "sha256", 64).toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(sha256)) {
    throw new GatewayValidationError("Invalid attachment sha256");
  }
  return {
    name: requiredString(value, "name", 256),
    media_type: requiredString(value, "media_type", 128),
    byte_length: byteLength as number,
    source_locator: requiredString(value, "source_locator", 2_048),
    sha256,
  };
}

export function parseJsonObject(rawBody: string): Record<string, unknown> {
  let value: unknown;
  try {
    value = JSON.parse(rawBody);
  } catch {
    throw new GatewayValidationError("Request body must be valid JSON");
  }
  if (!isObject(value)) {
    throw new GatewayValidationError("Request body must be a JSON object");
  }
  return value;
}

export function parseConnectorManifest(value: unknown): ConnectorManifestV1 {
  if (!isObject(value)) {
    throw new GatewayValidationError("Connector manifest must be an object");
  }
  if (value.contract !== "neoloop.connector.v1") {
    throw new GatewayValidationError("Unsupported connector contract");
  }
  const connectorId = requiredString(value, "connector_id", 64);
  if (!/^[a-z][a-z0-9_-]{2,63}$/.test(connectorId)) {
    throw new GatewayValidationError("Invalid connector_id");
  }
  if (value.data_scope !== "synthetic_experiment") {
    throw new GatewayValidationError("Only synthetic_experiment is allowed");
  }
  const transport = oneOf(requiredString(value, "transport", 32), CONNECTOR_TRANSPORTS, "transport");
  const sourceType = oneOf(requiredString(value, "source_type", 64), FEEDBACK_SOURCE_TYPES, "source_type");
  const fieldMapVersion = requiredString(value, "field_map_version", 128);
  if (!/^[A-Za-z0-9][A-Za-z0-9_.@:-]{0,127}$/.test(fieldMapVersion)) {
    throw new GatewayValidationError("Invalid field_map_version");
  }
  return {
    contract: "neoloop.connector.v1",
    connector_id: connectorId,
    display_name: requiredString(value, "display_name", 128),
    provider: requiredString(value, "provider", 128),
    transport,
    source_type: sourceType,
    source_tenant_scope: requiredString(value, "source_tenant_scope", 128),
    authorization_scope: requiredString(value, "authorization_scope", 256),
    field_map_version: fieldMapVersion,
    data_scope: "synthetic_experiment",
    enabled: requiredBoolean(value, "enabled"),
  };
}

export function parseNormalizedFeedback(value: unknown): NormalizedFeedbackV1 {
  if (!isObject(value)) {
    throw new GatewayValidationError("Feedback must be an object");
  }
  if (value.contract !== "neoloop.source-feedback.v1") {
    throw new GatewayValidationError("Unsupported feedback contract");
  }
  if (value.data_scope !== undefined && value.data_scope !== "synthetic_experiment") {
    throw new GatewayValidationError("Only synthetic_experiment is allowed");
  }
  const attachments = value.attachments;
  if (!Array.isArray(attachments) || attachments.length > 20) {
    throw new GatewayValidationError("Invalid attachments");
  }
  return {
    contract: "neoloop.source-feedback.v1",
    connector_id: requiredString(value, "connector_id", 64),
    provider: requiredString(value, "provider", 128),
    transport: oneOf(requiredString(value, "transport", 32), CONNECTOR_TRANSPORTS, "transport"),
    source_type: oneOf(requiredString(value, "source_type", 64), FEEDBACK_SOURCE_TYPES, "source_type"),
    source_name: requiredString(value, "source_name", 256),
    source_record_id: requiredString(value, "source_record_id", 256),
    source_tenant_scope: requiredString(value, "source_tenant_scope", 128),
    source_locator: requiredString(value, "source_locator", 2_048),
    source_event_at: parseTimestamp(requiredString(value, "source_event_at", 64), "source_event_at"),
    source_timezone: requiredString(value, "source_timezone", 64),
    channel: requiredString(value, "channel", 128),
    sender_role: requiredString(value, "sender_role", 128),
    original_text: requiredString(value, "original_text", 32_000),
    authorization_scope: requiredString(value, "authorization_scope", 256),
    attachments: attachments.map(parseAttachment),
    data_scope: "synthetic_experiment",
  };
}

export function parseNormalizedFeedbackBatch(value: unknown): NormalizedFeedbackBatchV1 {
  if (!isObject(value) || value.contract !== "neoloop.source-feedback.batch.v1") {
    throw new GatewayValidationError("Unsupported batch contract");
  }
  const items = value.items;
  if (!Array.isArray(items) || items.length === 0 || items.length > 100) {
    throw new GatewayValidationError("Batch must contain 1 to 100 items");
  }
  return {
    contract: "neoloop.source-feedback.batch.v1",
    connector_id: requiredString(value, "connector_id", 64),
    items: items.map(parseNormalizedFeedback),
  };
}

export function assertFeedbackMatchesConnector(
  feedback: NormalizedFeedbackV1,
  connector: ConnectorManifestV1,
): void {
  const checks: Array<[boolean, string]> = [
    [feedback.connector_id === connector.connector_id, "connector_id"],
    [feedback.provider === connector.provider, "provider"],
    [feedback.transport === connector.transport, "transport"],
    [feedback.source_type === connector.source_type, "source_type"],
    [feedback.source_tenant_scope === connector.source_tenant_scope, "source_tenant_scope"],
    [feedback.authorization_scope === connector.authorization_scope, "authorization_scope"],
  ];
  const mismatch = checks.find(([matches]) => !matches);
  if (mismatch) {
    throw new GatewayValidationError(`Feedback ${mismatch[1]} does not match connector`);
  }
}
