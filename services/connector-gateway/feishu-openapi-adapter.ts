import type { AiNodeEnvelope, AuditRecord, JsonValue, StoredRawFeedback } from "../../src/neoloop/contracts/model.js";
import { FeishuAdapterError } from "./feishu-adapter.js";
import type {
  FeishuAnalysisPort,
  FeishuRawFeedbackAdapter,
  FeishuWorkflowPort,
  WorkflowStatus,
} from "./types.js";

const TOKEN_PATH = "/open-apis/auth/v3/tenant_access_token/internal/";

export const RAW_FEEDBACK_FIELD_KEYS = [
  "feedback_id",
  "legacy_id",
  "schema_version",
  "data_scope",
  "evidence_class",
  "created_at",
  "updated_at",
  "source_kind",
  "channel",
  "sender_role",
  "original_text",
  "original_text_mutable",
  "received_at",
  "source_tenant_scope",
  "source_record_id",
  "source_timezone",
  "source_name",
  "source_locator",
  "source_sha256",
  "authorization_scope",
  "idempotency_key",
  "processing_status",
  "connector_id",
  "connector_transport",
  "source_type",
  "attachment_manifest",
] as const;

export type RawFeedbackFieldKey = (typeof RAW_FEEDBACK_FIELD_KEYS)[number];
export type RawFeedbackFieldMap = Record<RawFeedbackFieldKey, string>;

export const AI_AUDIT_FIELD_KEYS = [
  "node",
  "mode",
  "version",
  "run_id",
  "object_ref",
  "object_type",
  "object_id",
  "input_hash",
  "payload",
  "evidence_spans",
  "missing_fields",
  "confidence",
  "status",
  "validation",
  "retry_count",
  "human_revision",
  "created_at",
  "updated_at",
  "schema_version",
  "data_scope",
  "evidence_class",
  "source_kind",
] as const;

export type AiAuditFieldKey = (typeof AI_AUDIT_FIELD_KEYS)[number];
export type AiAuditFieldMap = Record<AiAuditFieldKey, string>;

export interface FeishuOpenApiAdapterConfig {
  app_id: string;
  app_secret: string;
  app_token: string;
  raw_feedback_table_id: string;
  ai_audit_table_id: string;
  raw_feedback_fields: RawFeedbackFieldMap;
  ai_audit_fields: AiAuditFieldMap;
  api_origin?: string;
  request_timeout_ms?: number;
  audit_readback_delays_ms?: readonly number[];
  fetch_impl?: typeof fetch;
  now?: () => Date;
}

interface FeishuRecordWire {
  record_id: string;
  fields: Record<string, unknown>;
}

interface SearchResult {
  record_id: string;
  record: StoredRawFeedback;
}

type FeishuApiOperation =
  | "raw_search"
  | "raw_create"
  | "raw_read"
  | "audit_search"
  | "audit_create"
  | "audit_read"
  | "audit_latest_search"
  | "workflow_list";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function scalarText(value: unknown): string | null {
  const normalized = Array.isArray(value) && value.length === 1 ? value[0] : value;
  if (typeof normalized === "string") return normalized;
  if (isObject(normalized)) {
    for (const key of ["text", "value", "name"] as const) {
      if (typeof normalized[key] === "string") return normalized[key];
    }
  }
  return null;
}

function requiredString(value: unknown, code: string): string {
  const normalized = scalarText(value);
  if (typeof normalized !== "string" || normalized.length === 0) throw new FeishuAdapterError(code, "unknown");
  return normalized;
}

function jsonText(value: unknown): string {
  return JSON.stringify(value);
}

function parseJsonText(value: unknown, fallback: JsonValue): JsonValue {
  const normalized = scalarText(value);
  if (normalized === null) return fallback;
  try {
    return JSON.parse(normalized) as JsonValue;
  } catch {
    return fallback;
  }
}

function iso(value: unknown): string {
  const date = typeof value === "number" ? new Date(value) : new Date(String(value));
  if (Number.isNaN(date.getTime())) throw new FeishuAdapterError("invalid_datetime_readback", "unknown");
  return date.toISOString();
}

function value(fields: Record<string, unknown>, map: Record<string, string>, key: string): unknown {
  return fields[map[key]];
}

function assertFieldMap(keys: readonly string[], map: Record<string, string>, label: string): void {
  const names = keys.map((key) => map[key]);
  if (names.some((name) => typeof name !== "string" || name.trim().length === 0)) {
    throw new Error(`${label} must map every canonical field to a non-empty Base field name`);
  }
  if (new Set(names).size !== names.length) {
    throw new Error(`${label} must not map multiple canonical fields to the same Base field name`);
  }
}

function clientToken(idempotencyKey: string): string {
  const hex = idempotencyKey.slice(0, 32).padEnd(32, "0");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function classifyNetworkFailure(error: unknown): string {
  if (error instanceof DOMException && error.name === "AbortError") {
    return "feishu_network_timeout";
  }
  if (error instanceof Error) {
    const description = `${error.name}:${error.message}`.toLowerCase();
    if (description.includes("illegal invocation")) return "feishu_fetch_invocation_error";
    if (description.includes("network connection lost")) return "feishu_network_connection_lost";
    if (description.includes("dns")) return "feishu_network_dns_error";
    if (description.includes("tls") || description.includes("certificate")) {
      return "feishu_network_tls_error";
    }
  }
  return "feishu_network_error";
}

export class FeishuOpenApiAdapter implements FeishuRawFeedbackAdapter, FeishuAnalysisPort, FeishuWorkflowPort {
  private readonly injectedFetch: typeof fetch | null;
  private readonly apiOrigin: string;
  private readonly timeoutMs: number;
  private readonly auditReadbackDelaysMs: readonly number[];
  private readonly now: () => Date;
  private cachedToken: { value: string; expires_at_ms: number } | null = null;

  constructor(private readonly config: FeishuOpenApiAdapterConfig) {
    for (const [name, entry] of Object.entries({
      app_id: config.app_id,
      app_secret: config.app_secret,
      app_token: config.app_token,
      raw_feedback_table_id: config.raw_feedback_table_id,
      ai_audit_table_id: config.ai_audit_table_id,
    })) {
      if (entry.trim().length === 0) throw new Error(`Missing Feishu adapter ${name}`);
    }
    assertFieldMap(RAW_FEEDBACK_FIELD_KEYS, config.raw_feedback_fields, "raw_feedback_fields");
    assertFieldMap(AI_AUDIT_FIELD_KEYS, config.ai_audit_fields, "ai_audit_fields");
    this.injectedFetch = config.fetch_impl ?? null;
    this.apiOrigin = (config.api_origin ?? "https://open.feishu.cn").replace(/\/$/u, "");
    this.timeoutMs = config.request_timeout_ms ?? 8_000;
    this.auditReadbackDelaysMs = config.audit_readback_delays_ms ?? [0, 250, 750, 1_500];
    if (
      this.auditReadbackDelaysMs.length === 0
      || this.auditReadbackDelaysMs.some((delay) => !Number.isSafeInteger(delay) || delay < 0 || delay > 5_000)
    ) {
      throw new Error("audit_readback_delays_ms must contain one or more safe delays between 0 and 5000 ms");
    }
    this.now = config.now ?? (() => new Date());
  }

  private async request(url: string, init: RequestInit, write: boolean): Promise<Response> {
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), this.timeoutMs);
    try {
      const requestInit = { ...init, signal: abort.signal };
      return this.injectedFetch
        ? await this.injectedFetch(url, requestInit)
        : await fetch(url, requestInit);
    } catch (error) {
      throw new FeishuAdapterError(classifyNetworkFailure(error), write ? "unknown" : "not_written");
    } finally {
      clearTimeout(timer);
    }
  }

  private async token(): Promise<string> {
    if (this.cachedToken && this.cachedToken.expires_at_ms - this.now().getTime() > 30 * 60 * 1000) {
      return this.cachedToken.value;
    }
    const response = await this.request(`${this.apiOrigin}${TOKEN_PATH}`, {
      method: "POST",
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify({ app_id: this.config.app_id, app_secret: this.config.app_secret }),
    }, false);
    if (!response.ok) throw new FeishuAdapterError("tenant_token_http_error", "not_written");
    const payload: unknown = await response.json();
    if (!isObject(payload) || payload.code !== 0) {
      throw new FeishuAdapterError("tenant_token_api_error", "not_written");
    }
    const token = requiredString(payload.tenant_access_token, "tenant_token_missing");
    const expire = typeof payload.expire === "number" && payload.expire > 0 ? payload.expire : 7_140;
    this.cachedToken = { value: token, expires_at_ms: this.now().getTime() + expire * 1000 };
    return token;
  }

  private recordsPath(tableId: string): string {
    return `${this.apiOrigin}/open-apis/bitable/v1/apps/${encodeURIComponent(this.config.app_token)}/tables/${encodeURIComponent(tableId)}/records`;
  }

  async listWorkflowStatus(): Promise<WorkflowStatus> {
    const { response, payload } = await this.authorizedJson(
      `${this.apiOrigin}/open-apis/base/v3/bases/${encodeURIComponent(this.config.app_token)}/workflows/list`,
      { method: "POST", body: JSON.stringify({ page_size: 100 }) },
      false,
    );
    this.ensureSuccess(response, payload, false, "workflow_list");
    const data = payload.data;
    if (!isObject(data) || !Array.isArray(data.items)) {
      throw new FeishuAdapterError("invalid_workflow_list", "not_written");
    }
    if (data.has_more === true || data.items.length > 100) {
      throw new FeishuAdapterError("workflow_list_not_complete", "not_written");
    }
    const ids = new Set<string>();
    let enabled = 0;
    let disabled = 0;
    for (const item of data.items) {
      if (!isObject(item) || typeof item.workflow_id !== "string" || !/^wkf[A-Za-z0-9]+$/u.test(item.workflow_id)) {
        throw new FeishuAdapterError("invalid_workflow_identity", "not_written");
      }
      if (ids.has(item.workflow_id)) {
        throw new FeishuAdapterError("duplicate_workflow_identity", "not_written");
      }
      ids.add(item.workflow_id);
      if (item.status === "enabled") enabled += 1;
      else if (item.status === "disabled") disabled += 1;
      else throw new FeishuAdapterError("invalid_workflow_status", "not_written");
    }
    if (typeof data.total !== "number" || !Number.isSafeInteger(data.total) || data.total !== data.items.length) {
      throw new FeishuAdapterError("workflow_total_mismatch", "not_written");
    }
    return { total: data.total, enabled, disabled };
  }

  private async authorizedJson(
    url: string,
    init: RequestInit,
    write: boolean,
  ): Promise<{ response: Response; payload: Record<string, unknown> }> {
    const response = await this.request(url, {
      ...init,
      headers: {
        authorization: `Bearer ${await this.token()}`,
        "content-type": "application/json; charset=utf-8",
        ...(init.headers ?? {}),
      },
    }, write);
    let payload: unknown = null;
    try {
      payload = await response.json();
    } catch {
      throw new FeishuAdapterError("feishu_invalid_json", write ? "unknown" : "not_written");
    }
    if (!isObject(payload)) throw new FeishuAdapterError("feishu_invalid_response", write ? "unknown" : "not_written");
    return { response, payload };
  }

  private ensureSuccess(
    response: Response,
    payload: Record<string, unknown>,
    write: boolean,
    operation: FeishuApiOperation,
  ): void {
    if (response.ok && payload.code === 0) return;
    const unknown = write && (response.status >= 500 || response.status === 408 || response.status === 429);
    const apiCode = (
      typeof payload.code === "number" && Number.isSafeInteger(payload.code)
    ) || (
      typeof payload.code === "string" && /^[0-9]{1,12}$/u.test(payload.code)
    ) ? String(payload.code) : "unknown";
    throw new FeishuAdapterError(
      `feishu_api_${operation}_${apiCode}`,
      unknown ? "unknown" : "not_written",
    );
  }

  private rawFields(record: StoredRawFeedback): Record<string, unknown> {
    const map = this.config.raw_feedback_fields;
    const metadata = record.request.metadata ?? {};
    return {
      [map.feedback_id]: record.feedback_id,
      [map.legacy_id]: "not_applicable_scenario_runtime",
      [map.schema_version]: record.request.schema_version,
      [map.data_scope]: record.request.data_scope,
      [map.evidence_class]: record.request.evidence_class,
      [map.created_at]: Date.parse(record.created_at),
      [map.updated_at]: Date.parse(record.created_at),
      [map.source_kind]: "scenario_runtime",
      [map.channel]: record.request.channel,
      [map.sender_role]: metadata.sender_role ?? "unknown_synthetic_sender",
      [map.original_text]: record.request.original_text,
      [map.original_text_mutable]: "false",
      [map.received_at]: Date.parse(record.request.received_at),
      [map.source_tenant_scope]: record.request.source_tenant_scope,
      [map.source_record_id]: record.request.source_record_id ?? "",
      [map.source_timezone]: metadata.source_timezone ?? "UTC",
      [map.source_name]: metadata.source_name ?? record.request.channel,
      [map.source_locator]: metadata.source_locator ?? "synthetic://unavailable",
      [map.source_sha256]: record.content_fingerprint,
      [map.authorization_scope]: record.request.authorization_scope,
      [map.idempotency_key]: record.idempotency_key,
      [map.processing_status]: record.processing_status,
      [map.connector_id]: metadata.connector_id ?? "unknown_synthetic_connector",
      [map.connector_transport]: metadata.connector_transport ?? "webhook",
      [map.source_type]: metadata.source_type ?? "manual_note",
      [map.attachment_manifest]: jsonText(metadata.attachment_manifest ?? []),
    };
  }

  private parseRawRecord(wire: FeishuRecordWire): StoredRawFeedback {
    const map = this.config.raw_feedback_fields;
    const fields = wire.fields;
    const feedbackId = requiredString(value(fields, map, "feedback_id"), "feedback_id_missing");
    const idempotencyKey = requiredString(value(fields, map, "idempotency_key"), "idempotency_key_missing");
    const contentFingerprint = requiredString(value(fields, map, "source_sha256"), "source_sha256_missing");
    return {
      feedback_id: feedbackId,
      idempotency_key: idempotencyKey,
      content_fingerprint: contentFingerprint,
      processing_status: requiredString(value(fields, map, "processing_status"), "processing_status_missing") as StoredRawFeedback["processing_status"],
      created_at: iso(value(fields, map, "created_at")),
      request: {
        schema_version: requiredString(value(fields, map, "schema_version"), "schema_version_missing") as StoredRawFeedback["request"]["schema_version"],
        data_scope: requiredString(value(fields, map, "data_scope"), "data_scope_missing") as StoredRawFeedback["request"]["data_scope"],
        evidence_class: requiredString(value(fields, map, "evidence_class"), "evidence_class_missing") as StoredRawFeedback["request"]["evidence_class"],
        source_tenant_scope: requiredString(value(fields, map, "source_tenant_scope"), "source_tenant_scope_missing"),
        channel: requiredString(value(fields, map, "channel"), "channel_missing"),
        source_record_id: requiredString(value(fields, map, "source_record_id"), "source_record_id_missing"),
        original_text: requiredString(value(fields, map, "original_text"), "original_text_missing"),
        received_at: iso(value(fields, map, "received_at")),
        authorization_scope: requiredString(value(fields, map, "authorization_scope"), "authorization_scope_missing"),
        idempotency_key: idempotencyKey,
        metadata: {
          connector_id: requiredString(value(fields, map, "connector_id"), "connector_id_missing"),
          connector_transport: requiredString(value(fields, map, "connector_transport"), "connector_transport_missing"),
          source_type: requiredString(value(fields, map, "source_type"), "source_type_missing"),
          source_name: requiredString(value(fields, map, "source_name"), "source_name_missing"),
          source_locator: requiredString(value(fields, map, "source_locator"), "source_locator_missing"),
          source_timezone: requiredString(value(fields, map, "source_timezone"), "source_timezone_missing"),
          sender_role: requiredString(value(fields, map, "sender_role"), "sender_role_missing"),
          attachment_manifest: parseJsonText(value(fields, map, "attachment_manifest"), []),
        },
      },
    };
  }

  private wireRecord(value: unknown): FeishuRecordWire {
    if (!isObject(value) || typeof value.record_id !== "string" || !isObject(value.fields)) {
      throw new FeishuAdapterError("invalid_record_readback", "unknown");
    }
    return { record_id: value.record_id, fields: value.fields };
  }

  private async searchRaw(idempotencyKey: string): Promise<SearchResult | null> {
    const map = this.config.raw_feedback_fields;
    const { response, payload } = await this.authorizedJson(
      `${this.recordsPath(this.config.raw_feedback_table_id)}/search?page_size=2`,
      {
        method: "POST",
        body: JSON.stringify({
          field_names: RAW_FEEDBACK_FIELD_KEYS.map((key) => map[key]),
          filter: {
            conjunction: "and",
            conditions: [{ field_name: map.idempotency_key, operator: "is", value: [idempotencyKey] }],
          },
        }),
      },
      false,
    );
    this.ensureSuccess(response, payload, false, "raw_search");
    const data = payload.data;
    const items = isObject(data) && Array.isArray(data.items) ? data.items : [];
    if (items.length === 0) return null;
    if (items.length !== 1) throw new FeishuAdapterError("duplicate_idempotency_records", "unknown");
    const wire = this.wireRecord(items[0]);
    return { record_id: wire.record_id, record: this.parseRawRecord(wire) };
  }

  async findByIdempotencyKey(idempotencyKey: string): Promise<StoredRawFeedback | null> {
    return (await this.searchRaw(idempotencyKey))?.record ?? null;
  }

  private async createAttempt(record: StoredRawFeedback): Promise<{ record_id: string }> {
    const url = new URL(this.recordsPath(this.config.raw_feedback_table_id));
    url.searchParams.set("client_token", clientToken(record.idempotency_key));
    url.searchParams.set("ignore_consistency_check", "false");
    const { response, payload } = await this.authorizedJson(url.toString(), {
      method: "POST",
      body: JSON.stringify({ fields: this.rawFields(record) }),
    }, true);
    this.ensureSuccess(response, payload, true, "raw_create");
    const data = payload.data;
    const wire = this.wireRecord(isObject(data) ? data.record : null);
    return { record_id: wire.record_id };
  }

  async createRawFeedback(record: StoredRawFeedback): Promise<{ record_id: string }> {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        return await this.createAttempt(record);
      } catch (error) {
        if (!(error instanceof FeishuAdapterError) || error.certainty !== "unknown") throw error;
        const found = await this.searchRaw(record.idempotency_key);
        if (found) {
          if (found.record.content_fingerprint !== record.content_fingerprint) {
            throw new FeishuAdapterError("idempotency_conflict_after_ambiguous_write", "not_written");
          }
          return { record_id: found.record_id };
        }
        if (attempt === 1) throw error;
      }
    }
    throw new FeishuAdapterError("feishu_write_unresolved", "unknown");
  }

  async readRawFeedback(recordId: string): Promise<StoredRawFeedback | null> {
    const { response, payload } = await this.authorizedJson(
      `${this.recordsPath(this.config.raw_feedback_table_id)}/${encodeURIComponent(recordId)}`,
      { method: "GET" },
      false,
    );
    if (response.status === 404) return null;
    this.ensureSuccess(response, payload, false, "raw_read");
    const data = payload.data;
    const wire = this.wireRecord(isObject(data) ? data.record : null);
    return this.parseRawRecord(wire);
  }

  async readRawFeedbackByRecordId(recordId: string): Promise<StoredRawFeedback | null> {
    return this.readRawFeedback(recordId);
  }

  private auditFields(record: AuditRecord): Record<string, unknown> {
    const map = this.config.ai_audit_fields;
    const payload = isObject(record.payload) ? record.payload : {};
    const envelope = isObject(payload.envelope) ? payload.envelope as unknown as AiNodeEnvelope<JsonValue> : null;
    if (!envelope) throw new FeishuAdapterError("invalid_audit_record", "not_written");
    return {
      [map.node]: envelope.node,
      [map.mode]: envelope.mode,
      [map.version]: envelope.version,
      [map.run_id]: envelope.run_id,
      [map.object_ref]: jsonText(envelope.object_ref),
      [map.object_type]: envelope.object_ref.object_type,
      [map.object_id]: envelope.object_ref.object_id,
      [map.input_hash]: envelope.input_hash,
      [map.payload]: jsonText(envelope.payload),
      [map.evidence_spans]: jsonText(envelope.evidence_spans),
      [map.missing_fields]: jsonText(envelope.missing_fields),
      [map.confidence]: String(envelope.confidence ?? 0),
      [map.status]: envelope.status,
      [map.validation]: jsonText(envelope.validation),
      [map.retry_count]: String(envelope.retry_count),
      [map.human_revision]: jsonText(envelope.human_revision),
      [map.created_at]: record.occurred_at,
      [map.updated_at]: record.occurred_at,
      [map.schema_version]: "1.0.0-draft.2",
      [map.data_scope]: "synthetic_experiment",
      [map.evidence_class]: "synthetic_experiment",
      [map.source_kind]: "scenario_runtime",
    };
  }

  private async searchAuditRun(runId: unknown): Promise<FeishuRecordWire | null> {
    const map = this.config.ai_audit_fields;
    const { response, payload } = await this.authorizedJson(
      `${this.recordsPath(this.config.ai_audit_table_id)}/search?page_size=2`,
      {
        method: "POST",
        body: JSON.stringify({
          field_names: AI_AUDIT_FIELD_KEYS.map((key) => map[key]),
          filter: {
            conjunction: "and",
            conditions: [{ field_name: map.run_id, operator: "is", value: [runId] }],
          },
        }),
      },
      false,
    );
    this.ensureSuccess(response, payload, false, "audit_search");
    const searchData = payload.data;
    const existing = isObject(searchData) && Array.isArray(searchData.items) ? searchData.items : [];
    if (existing.length === 0) return null;
    if (existing.length > 1) throw new FeishuAdapterError("duplicate_ai_audit_run", "unknown");
    return this.wireRecord(existing[0]);
  }

  private async awaitAuditReadback(runId: unknown): Promise<FeishuRecordWire | null> {
    for (const delay of this.auditReadbackDelaysMs) {
      if (delay > 0) {
        await new Promise<void>((resolve) => setTimeout(resolve, delay));
      }
      const readBack = await this.searchAuditRun(runId);
      if (readBack) return readBack;
    }
    return null;
  }

  private async readAuditRecord(recordId: string): Promise<FeishuRecordWire | null> {
    const { response, payload } = await this.authorizedJson(
      `${this.recordsPath(this.config.ai_audit_table_id)}/${encodeURIComponent(recordId)}`,
      { method: "GET" },
      false,
    );
    if (response.status === 404) return null;
    this.ensureSuccess(response, payload, false, "audit_read");
    const data = payload.data;
    return this.wireRecord(isObject(data) ? data.record : null);
  }

  private async awaitAuditRecordReadback(recordId: string): Promise<FeishuRecordWire | null> {
    for (const delay of this.auditReadbackDelaysMs) {
      if (delay > 0) {
        await new Promise<void>((resolve) => setTimeout(resolve, delay));
      }
      const readBack = await this.readAuditRecord(recordId);
      if (readBack) return readBack;
    }
    return null;
  }

  private assertAuditEquivalent(actual: Record<string, unknown>, expected: Record<string, unknown>): void {
    const map = this.config.ai_audit_fields;
    const mismatched = AI_AUDIT_FIELD_KEYS.find((key) => {
      const actualValue = actual[map[key]];
      const expectedValue = expected[map[key]];
      if (
        key === "object_type"
        && Array.isArray(actualValue)
        && actualValue.length === 1
      ) {
        return JSON.stringify(actualValue[0]) !== JSON.stringify(expectedValue);
      }
      return JSON.stringify(actualValue) !== JSON.stringify(expectedValue);
    });
    if (mismatched) throw new FeishuAdapterError("ai_audit_idempotency_conflict", "not_written");
  }

  private async createAuditAttempt(fields: Record<string, unknown>, operationKey: string): Promise<string> {
    const url = new URL(this.recordsPath(this.config.ai_audit_table_id));
    url.searchParams.set("client_token", clientToken(operationKey));
    url.searchParams.set("ignore_consistency_check", "false");
    const { response, payload } = await this.authorizedJson(
      url.toString(),
      { method: "POST", body: JSON.stringify({ fields }) },
      true,
    );
    this.ensureSuccess(response, payload, true, "audit_create");
    const data = payload.data;
    return this.wireRecord(isObject(data) ? data.record : null).record_id;
  }

  async appendAiAudit(record: AuditRecord, operationKey: string): Promise<void> {
    if (!/^[0-9a-f]{64}$/u.test(operationKey)) {
      throw new FeishuAdapterError("invalid_ai_audit_operation_key", "not_written");
    }
    const fields = this.auditFields(record);
    const runId = fields[this.config.ai_audit_fields.run_id];
    const before = await this.searchAuditRun(runId);
    if (before) {
      this.assertAuditEquivalent(before.fields, fields);
      return;
    }
    for (let attempt = 0; attempt < 2; attempt += 1) {
      let createdRecordId: string;
      try {
        createdRecordId = await this.createAuditAttempt(fields, operationKey);
      } catch (error) {
        if (!(error instanceof FeishuAdapterError) || error.certainty !== "unknown") throw error;
        const recovered = await this.awaitAuditReadback(runId);
        if (recovered) {
          this.assertAuditEquivalent(recovered.fields, fields);
          return;
        }
        if (attempt === 1) throw error;
        continue;
      }
      const readBack = await this.awaitAuditRecordReadback(createdRecordId);
      if (!readBack) throw new FeishuAdapterError("ai_audit_readback_missing", "unknown");
      this.assertAuditEquivalent(readBack.fields, fields);
      return;
    }
  }

  async findLatestSuccessfulAiEnvelope(
    objectId: string,
    node: "N1" | "N2" | "N3",
  ): Promise<AiNodeEnvelope<JsonValue> | null> {
    const map = this.config.ai_audit_fields;
    const { response, payload } = await this.authorizedJson(
      `${this.recordsPath(this.config.ai_audit_table_id)}/search?page_size=1`,
      {
        method: "POST",
        body: JSON.stringify({
          field_names: AI_AUDIT_FIELD_KEYS.map((key) => map[key]),
          filter: {
            conjunction: "and",
            conditions: [
              { field_name: map.object_id, operator: "is", value: [objectId] },
              { field_name: map.node, operator: "is", value: [node] },
              { field_name: map.status, operator: "is", value: ["ok"] },
            ],
          },
        }),
      },
      false,
    );
    this.ensureSuccess(response, payload, false, "audit_latest_search");
    const data = payload.data;
    const items = isObject(data) && Array.isArray(data.items) ? data.items : [];
    if (items.length === 0) return null;
    const wire = this.wireRecord(items[0]);
    const fields = wire.fields;
    const confidence = fields[map.confidence];
    return {
      node: requiredString(fields[map.node], "audit_node_missing") as AiNodeEnvelope<JsonValue>["node"],
      mode: requiredString(fields[map.mode], "audit_mode_missing"),
      version: requiredString(fields[map.version], "audit_version_missing"),
      run_id: requiredString(fields[map.run_id], "audit_run_id_missing"),
      object_ref: parseJsonText(fields[map.object_ref], {}) as unknown as AiNodeEnvelope<JsonValue>["object_ref"],
      input_hash: requiredString(fields[map.input_hash], "audit_input_hash_missing"),
      payload: parseJsonText(fields[map.payload], null),
      evidence_spans: parseJsonText(fields[map.evidence_spans], []) as unknown as AiNodeEnvelope<JsonValue>["evidence_spans"],
      missing_fields: parseJsonText(fields[map.missing_fields], []) as unknown as string[],
      confidence: typeof confidence === "number"
        ? confidence
        : scalarText(confidence) !== null && Number.isFinite(Number(scalarText(confidence)))
          ? Number(scalarText(confidence))
          : null,
      status: requiredString(fields[map.status], "audit_status_missing") as AiNodeEnvelope<JsonValue>["status"],
      validation: parseJsonText(fields[map.validation], { valid: false, errors: ["invalid readback"] }) as AiNodeEnvelope<JsonValue>["validation"],
      retry_count: Number(fields[map.retry_count]) === 1 ? 1 : 0,
      human_revision: parseJsonText(fields[map.human_revision], { state: "pending" }) as AiNodeEnvelope<JsonValue>["human_revision"],
    };
  }
}
