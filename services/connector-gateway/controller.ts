import { ingestFeedback, fingerprintIngestRequest } from "../../src/neoloop/domain/idempotency.js";
import type { AiNodeRunRequest } from "../../src/neoloop/contracts/ports.js";
import {
  CANONICAL_SCHEMA_VERSION,
  type IngestRequest,
  type JsonValue,
} from "../../src/neoloop/contracts/model.js";
import { AI_NODE_DEFINITIONS } from "../../src/neoloop/ai/definitions.js";
import {
  runOwnerFirstLiveAttempt,
  type OwnerFirstLiveProfileId,
} from "../../src/neoloop/ai/owner-first-live-bridge.js";
import { canonicalJsonSha256 } from "../../src/neoloop/io/plain-json.js";
import { evaluateHardRuleRisk } from "../../src/neoloop/workflows/hard-rules.js";
import { FeishuAdapterError, FeishuBackedRepository } from "./feishu-adapter.js";
import {
  BodyTooLargeError,
  InvalidUtf8BodyError,
  deriveGatewayIdempotencyKey,
  readBoundedUtf8Body,
  receiptId,
  sha256,
  verifyGatewaySignature,
} from "./security.js";
import { connectorSecretContext } from "./secrets.js";
import type {
  ConnectorStats,
  ConnectorManifestV1,
  AnalysisAttemptReceipt,
  DeadLetter,
  GatewayDependencies,
  GatewayReceipt,
  NormalizedFeedbackV1,
  StoredConnector,
} from "./types.js";
import {
  GatewayValidationError,
  assertFeedbackMatchesConnector,
  parseConnectorManifest,
  parseJsonObject,
  parseNormalizedFeedback,
  parseNormalizedFeedbackBatch,
} from "./validation.js";

interface GatewayResult {
  status: number;
  body: Record<string, unknown>;
}

const MANUAL_CONNECTOR_ID = "manual_owner_workbench";
const ANALYSIS_PROFILES = new Set<OwnerFirstLiveProfileId>(["n1-default", "n2-default", "n3-default"]);
const ANALYSIS_NODES: Record<"n1-default" | "n2-default" | "n3-default", "N1" | "N2" | "N3"> = {
  "n1-default": "N1",
  "n2-default": "N2",
  "n3-default": "N3",
};
const ANALYSIS_REQUEST_KEYS = [
  "attempt",
  "candidate",
  "contract",
  "node",
  "operation",
  "profile_id",
  "record_id",
] as const;

function analysisRouteStatus(body: Record<string, unknown>): number {
  return body.route === "continue" ? 200 : body.route === "retry" ? 202 : 409;
}

function response(result: GatewayResult): Response {
  return new Response(JSON.stringify(result.body), {
    status: result.status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function result(status: number, body: Record<string, unknown>): GatewayResult {
  return { status, body };
}

function requiredHeader(request: Request, name: string): string | null {
  const value = request.headers.get(name)?.trim();
  return value ? value : null;
}

function isJsonRequest(request: Request): boolean {
  return (request.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json");
}

function publicConnector(connector: StoredConnector, stats: ConnectorStats): Record<string, unknown> {
  return {
    ...connector.manifest,
    secret_version: connector.secret_version,
    created_at: connector.created_at,
    updated_at: connector.updated_at,
    stats,
  };
}

function toIngestRequest(feedback: NormalizedFeedbackV1): IngestRequest {
  const metadata: Record<string, JsonValue> = {
    connector_id: feedback.connector_id,
    connector_transport: feedback.transport,
    source_type: feedback.source_type,
    provider: feedback.provider,
    source_name: feedback.source_name,
    source_locator: feedback.source_locator,
    source_timezone: feedback.source_timezone,
    sender_role: feedback.sender_role,
    source_event_at: feedback.source_event_at,
    attachment_manifest: feedback.attachments.map((attachment) => ({ ...attachment })),
  };
  return {
    schema_version: CANONICAL_SCHEMA_VERSION,
    data_scope: "synthetic_experiment",
    evidence_class: "synthetic_experiment",
    source_tenant_scope: feedback.source_tenant_scope,
    channel: feedback.channel,
    source_record_id: feedback.source_record_id,
    original_text: feedback.original_text,
    received_at: feedback.source_event_at,
    authorization_scope: feedback.authorization_scope,
    idempotency_key: deriveGatewayIdempotencyKey(feedback),
    metadata,
  };
}

export class GatewayController {
  private tail: Promise<void> = Promise.resolve();

  constructor(private readonly dependencies: GatewayDependencies) {}

  handle(request: Request): Promise<Response> {
    const run = this.tail.then(
      () => this.route(request),
      () => this.route(request),
    );
    this.tail = run.then(() => undefined, () => undefined);
    return run;
  }

  private async route(request: Request): Promise<Response> {
    const url = new URL(request.url);
    try {
      if (url.pathname === "/api/v1/connectors") {
        return response(await this.handleConnectors(request));
      }

      if (url.pathname === "/api/v1/workflows/status") {
        return response(await this.handleWorkflowStatus(request));
      }

      const connectorAction = url.pathname.match(
        /^\/api\/v1\/connectors\/([a-z][a-z0-9_-]{2,63})\/(rotate-secret|disable)$/,
      );
      if (connectorAction) {
        return response(await this.handleConnectorAction(request, connectorAction[1], connectorAction[2]));
      }

      const ingest = url.pathname.match(
        /^\/api\/v1\/connectors\/([a-z][a-z0-9_-]{2,63})\/(feedback|batch)$/,
      );
      if (ingest) {
        return response(await this.handleConnectorIngest(request, ingest[1], ingest[2]));
      }

      if (url.pathname === "/api/v1/manual-feedback") {
        return response(await this.handleManualFeedback(request));
      }

      if (url.pathname === "/api/v1/analysis/terminal-stop") {
        return response(await this.handleAnalysisTerminalStop(request));
      }

      const analysis = url.pathname.match(/^\/api\/v1\/analysis\/([a-z0-9-]{3,64})$/);
      if (analysis) {
        return response(await this.handleAnalysis(request, analysis[1]));
      }

      const reconciliation = url.pathname.match(
        /^\/api\/v1\/reconciliation\/([0-9a-f]{64})\/check$/,
      );
      if (reconciliation) {
        return response(await this.handleReconciliation(request, reconciliation[1]));
      }
      return response(result(404, { error: "not_found" }));
    } catch (error) {
      if (error instanceof BodyTooLargeError) {
        return response(result(413, { error: "payload_too_large" }));
      }
      if (error instanceof InvalidUtf8BodyError) {
        return response(result(400, { error: "invalid_utf8" }));
      }
      if (error instanceof FeishuAdapterError) {
        return response(result(502, {
          error: "analysis_upstream_failed",
          upstream_error_code: error.code,
        }));
      }
      return response(result(500, { error: "internal_error" }));
    }
  }

  private async requireOwner(request: Request): Promise<GatewayResult | null> {
    const authorization = await this.dependencies.ownerAuth.authorize(request);
    if (authorization.ok) return null;
    return result(authorization.code === "owner_auth_unconfigured" ? 503 : 401, {
      error: authorization.code,
    });
  }

  private async requireAnalysis(request: Request): Promise<GatewayResult | null> {
    const authorization = await (this.dependencies.analysisAuth ?? this.dependencies.ownerAuth).authorize(request);
    if (authorization.ok) return null;
    return result(authorization.code === "owner_auth_unconfigured" ? 503 : 401, {
      error: authorization.code === "owner_auth_unconfigured"
        ? "analysis_auth_unconfigured"
        : "analysis_unauthorized",
    });
  }

  private async handleWorkflowStatus(request: Request): Promise<GatewayResult> {
    const denied = await this.requireOwner(request);
    if (denied) return denied;
    if (request.method !== "GET") return result(405, { error: "method_not_allowed" });
    if (!this.dependencies.workflow) return result(503, { error: "workflow_status_unconfigured" });
    const status = await this.dependencies.workflow.listWorkflowStatus();
    return result(200, {
      contract: "neoloop.workflow-status.v1",
      ...status,
      observed_at: this.dependencies.clock.now().toISOString(),
    });
  }

  private async handleConnectors(request: Request): Promise<GatewayResult> {
    const denied = await this.requireOwner(request);
    if (denied) return denied;

    if (request.method === "GET") {
      const connectors = await this.dependencies.store.listConnectors();
      return result(200, {
        connectors: await Promise.all(connectors.map(async (connector) => publicConnector(
          connector,
          await this.dependencies.store.connectorStats(connector.manifest.connector_id),
        ))),
      });
    }
    if (request.method !== "POST") return result(405, { error: "method_not_allowed" });
    if (!isJsonRequest(request)) return result(415, { error: "unsupported_media_type" });

    const rawBody = await readBoundedUtf8Body(request);
    try {
      const manifest = parseConnectorManifest(parseJsonObject(rawBody));
      if (manifest.connector_id === MANUAL_CONNECTOR_ID || manifest.transport === "manual") {
        return result(400, { error: "reserved_manual_connector" });
      }
      const secret = this.dependencies.secretGenerator();
      if (secret.length < 32) return result(503, { error: "invalid_secret_generator" });
      const now = this.dependencies.clock.now().toISOString();
      const connector: StoredConnector = {
        manifest,
        sealed_secret: await this.dependencies.secretProtector.seal(
          secret,
          connectorSecretContext(manifest.connector_id, 1),
        ),
        secret_version: 1,
        created_at: now,
        updated_at: now,
      };
      if (!(await this.dependencies.store.createConnector(connector))) {
        return result(409, { error: "connector_exists" });
      }
      return result(201, {
        connector: publicConnector(connector, {
          committed: 0,
          conflicts: 0,
          dead_lettered: 0,
          reconciliation_required: 0,
          last_received_at: null,
        }),
        secret,
        secret_display: "one_time_only",
      });
    } catch (error) {
      if (error instanceof GatewayValidationError) {
        return result(400, { error: error.code, message: error.message });
      }
      throw error;
    }
  }

  private async handleConnectorAction(
    request: Request,
    connectorId: string,
    action: string,
  ): Promise<GatewayResult> {
    const denied = await this.requireOwner(request);
    if (denied) return denied;
    if (request.method !== "POST") return result(405, { error: "method_not_allowed" });
    const connector = await this.dependencies.store.getConnector(connectorId);
    if (!connector) return result(404, { error: "connector_not_found" });

    if (action === "disable") {
      const updated: StoredConnector = {
        ...connector,
        manifest: { ...connector.manifest, enabled: false },
        updated_at: this.dependencies.clock.now().toISOString(),
      };
      await this.dependencies.store.updateConnector(updated);
      return result(200, {
        connector: publicConnector(updated, await this.dependencies.store.connectorStats(connectorId)),
      });
    }

    const secret = this.dependencies.secretGenerator();
    if (secret.length < 32) return result(503, { error: "invalid_secret_generator" });
    const secretVersion = connector.secret_version + 1;
    const updated: StoredConnector = {
      ...connector,
      sealed_secret: await this.dependencies.secretProtector.seal(
        secret,
        connectorSecretContext(connectorId, secretVersion),
      ),
      secret_version: secretVersion,
      updated_at: this.dependencies.clock.now().toISOString(),
    };
    await this.dependencies.store.updateConnector(updated);
    return result(200, {
      connector: publicConnector(updated, await this.dependencies.store.connectorStats(connectorId)),
      secret,
      secret_version: secretVersion,
      secret_display: "one_time_only",
    });
  }

  private async handleConnectorIngest(
    request: Request,
    connectorId: string,
    endpoint: string,
  ): Promise<GatewayResult> {
    if (request.method !== "POST") return result(405, { error: "method_not_allowed" });
    if (!isJsonRequest(request)) return result(415, { error: "unsupported_media_type" });
    const connector = await this.dependencies.store.getConnector(connectorId);
    if (!connector) return result(404, { error: "connector_not_found" });
    if (!connector.manifest.enabled) return result(403, { error: "connector_disabled" });
    if (endpoint === "batch" && connector.manifest.transport !== "batch") {
      return result(409, { error: "connector_transport_mismatch" });
    }
    if (endpoint === "feedback" && !["webhook", "polling"].includes(connector.manifest.transport)) {
      return result(409, { error: "connector_transport_mismatch" });
    }

    const timestamp = requiredHeader(request, "x-neoloop-timestamp");
    const nonce = requiredHeader(request, "x-neoloop-nonce");
    const signature = requiredHeader(request, "x-neoloop-signature");
    if (!timestamp || !nonce || !signature) return result(401, { error: "missing_security_headers" });

    const rawBody = await readBoundedUtf8Body(request);
    const secret = await this.dependencies.secretProtector.open(
      connector.sealed_secret,
      connectorSecretContext(connectorId, connector.secret_version),
    );
    const checked = verifyGatewaySignature(
      secret,
      {
        method: request.method,
        pathname: new URL(request.url).pathname,
        connectorId,
        timestamp,
        nonce,
        rawBody,
      },
      signature,
      this.dependencies.clock,
    );
    if (!checked.ok) {
      return result(checked.code === "invalid_security_configuration" ? 503 : 401, { error: checked.code });
    }
    if (!(await this.dependencies.store.consumeNonce(
      connectorId,
      nonce,
      checked.expires_at,
      this.dependencies.clock.now(),
    ))) {
      return result(401, { error: "nonce_replay" });
    }

    try {
      const parsed = parseJsonObject(rawBody);
      if (endpoint === "batch") {
        const batch = parseNormalizedFeedbackBatch(parsed);
        if (batch.connector_id !== connectorId) {
          throw new GatewayValidationError("Batch connector_id does not match route");
        }
        for (const item of batch.items) assertFeedbackMatchesConnector(item, connector.manifest);
        const results: Record<string, unknown>[] = [];
        for (const item of batch.items) {
          results.push((await this.processFeedback(item, connector.manifest)).body);
        }
        return result(207, { contract: batch.contract, results });
      }
      const feedback = parseNormalizedFeedback(parsed);
      assertFeedbackMatchesConnector(feedback, connector.manifest);
      return this.processFeedback(feedback, connector.manifest);
    } catch (error) {
      if (error instanceof GatewayValidationError) {
        await this.appendDeadLetter(connectorId, null, null, sha256(rawBody), error.code);
        return result(400, { error: error.code, message: error.message });
      }
      throw error;
    }
  }

  private async handleManualFeedback(request: Request): Promise<GatewayResult> {
    const denied = await this.requireOwner(request);
    if (denied) return denied;
    if (request.method !== "POST") return result(405, { error: "method_not_allowed" });
    if (!isJsonRequest(request)) return result(415, { error: "unsupported_media_type" });
    const rawBody = await readBoundedUtf8Body(request);
    try {
      const feedback = parseNormalizedFeedback(parseJsonObject(rawBody));
      const manualConnector: ConnectorManifestV1 = {
        contract: "neoloop.connector.v1",
        connector_id: MANUAL_CONNECTOR_ID,
        display_name: "飞书工作台手工补录",
        provider: "neoloop",
        transport: "manual",
        source_type: "manual_note",
        source_tenant_scope: "competition-synthetic",
        authorization_scope: "synthetic_demo_only",
        field_map_version: "manual-owner-workbench-v1",
        data_scope: "synthetic_experiment",
        enabled: true,
      };
      assertFeedbackMatchesConnector(feedback, manualConnector);
      return this.processFeedback(feedback, manualConnector);
    } catch (error) {
      if (error instanceof GatewayValidationError) {
        await this.appendDeadLetter(MANUAL_CONNECTOR_ID, null, null, sha256(rawBody), error.code);
        return result(400, { error: error.code, message: error.message });
      }
      throw error;
    }
  }

  private async handleAnalysis(request: Request, rawProfile: string): Promise<GatewayResult> {
    const denied = await this.requireAnalysis(request);
    if (denied) return denied;
    if (request.method !== "POST") return result(405, { error: "method_not_allowed" });
    if (!isJsonRequest(request)) return result(415, { error: "unsupported_media_type" });
    if (!ANALYSIS_PROFILES.has(rawProfile as OwnerFirstLiveProfileId)) {
      return result(404, { error: "analysis_profile_not_allowed" });
    }
    const analysis = this.dependencies.analysis;
    if (!analysis) return result(503, { error: "analysis_adapter_unconfigured" });

    const rawBody = await readBoundedUtf8Body(request);
    let parsed: Record<string, unknown>;
    try {
      parsed = parseJsonObject(rawBody);
    } catch (error) {
      if (error instanceof GatewayValidationError) {
        return result(400, { error: error.code, message: error.message });
      }
      throw error;
    }
    const keys = Object.keys(parsed).sort();
    const profile = rawProfile as "n1-default" | "n2-default" | "n3-default";
    const node = ANALYSIS_NODES[profile];
    if (
      keys.length !== ANALYSIS_REQUEST_KEYS.length
      || keys.some((key, index) => key !== ANALYSIS_REQUEST_KEYS[index])
      || parsed.contract !== "neoloop.w2-analysis-attempt.v1"
      || parsed.operation !== "validate_candidate"
      || typeof parsed.record_id !== "string"
      || !/^[A-Za-z0-9_-]{3,128}$/.test(parsed.record_id)
      || parsed.profile_id !== profile
      || parsed.node !== node
      || (parsed.attempt !== 1 && parsed.attempt !== 2)
    ) {
      return result(400, { error: "invalid_analysis_request" });
    }

    let candidate: unknown = parsed.candidate;
    if (typeof candidate === "string") {
      try {
        candidate = JSON.parse(candidate) as unknown;
      } catch {
        return result(400, {
          error: "analysis_candidate_text_invalid_json",
          business_write_count: 0,
          audit_write_count: 0,
        });
      }
    }
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
      return result(400, {
        error: "analysis_candidate_not_object",
        business_write_count: 0,
        audit_write_count: 0,
      });
    }

    const attempt = parsed.attempt;
    const candidateHash = canonicalJsonSha256(
      candidate as JsonValue,
      "neoloop:w2-analysis-candidate:v1",
    );
    const existingAttempt = await this.dependencies.store.getAnalysisAttempt(
      parsed.record_id,
      profile,
      attempt,
    );
    if (existingAttempt) {
      if (existingAttempt.candidate_sha256 !== candidateHash || existingAttempt.node !== node) {
        return result(409, {
          error: "analysis_attempt_conflict",
          business_write_count: 0,
          audit_write_count: 0,
        });
      }
      try {
        const replay = JSON.parse(existingAttempt.response_json) as Record<string, unknown>;
        return result(analysisRouteStatus(replay), replay);
      } catch {
        return result(500, {
          error: "analysis_attempt_receipt_corrupt",
          business_write_count: 0,
          audit_write_count: 0,
        });
      }
    }
    if (attempt === 2) {
      const firstAttempt = await this.dependencies.store.getAnalysisAttempt(parsed.record_id, profile, 1);
      if (!firstAttempt) {
        return result(409, {
          error: "analysis_attempt_out_of_order",
          business_write_count: 0,
          audit_write_count: 0,
        });
      }
      let firstResponse: Record<string, unknown>;
      try {
        firstResponse = JSON.parse(firstAttempt.response_json) as Record<string, unknown>;
      } catch {
        return result(500, {
          error: "analysis_attempt_receipt_corrupt",
          business_write_count: 0,
          audit_write_count: 0,
        });
      }
      if (firstResponse.route !== "retry") {
        return result(409, {
          error: "analysis_attempt_not_retryable",
          business_write_count: 0,
          audit_write_count: 0,
        });
      }
    }

    const authoritative = await analysis.readRawFeedbackByRecordId(parsed.record_id);
    if (!authoritative) return result(404, { error: "raw_feedback_not_found" });
    if (
      authoritative.request.data_scope !== "synthetic_experiment"
      || authoritative.request.evidence_class !== "synthetic_experiment"
      || !/^SYN-[A-Z0-9][A-Z0-9_-]{2,127}$/u.test(authoritative.feedback_id)
      || authoritative.processing_status !== "待分诊"
    ) {
      return result(409, { error: "raw_feedback_not_eligible_for_analysis" });
    }

    const aiRequest = await this.buildAuthoritativeAiRequest(profile, authoritative);
    if (!aiRequest) {
      return result(409, {
        error: "analysis_prerequisite_missing",
        profile_id: profile,
        business_write_count: 0,
        audit_write_count: 0,
      });
    }
    const report = await runOwnerFirstLiveAttempt({
      profile_id: profile,
      data_scope: "synthetic_experiment",
      observed_at: authoritative.created_at,
      request: aiRequest,
      attempt,
      candidate: structuredClone(candidate),
    });
    const writePlan = report.write_plan;
    if (
      !writePlan
      || writePlan.business_write_count !== 0
      || writePlan.audit_write_count !== 1
      || writePlan.operations.length !== 1
      || writePlan.operations.some((operation) => operation.kind !== "append_ai_audit")
    ) {
      return result(500, {
        error: "invalid_analysis_write_plan",
        business_write_count: 0,
        audit_write_count: 0,
      });
    }

    const readBack = await analysis.readRawFeedbackByRecordId(parsed.record_id);
    if (
      !readBack
      || readBack.feedback_id !== authoritative.feedback_id
      || readBack.idempotency_key !== authoritative.idempotency_key
      || readBack.content_fingerprint !== authoritative.content_fingerprint
      || readBack.request.original_text !== authoritative.request.original_text
      || readBack.processing_status !== authoritative.processing_status
    ) {
      return result(409, {
        error: "authoritative_record_drift",
        business_write_count: 0,
        audit_write_count: 0,
      });
    }

    try {
      const operation = writePlan.operations[0];
      await analysis.appendAiAudit(operation.audit_record, operation.operation_key);
    } catch {
      return result(503, {
        error: "audit_write_failed",
        business_write_count: 0,
        audit_write_count: 0,
      });
    }

    const continued = report.route === "continue";
    const responseBody: Record<string, unknown> = {
      contract: "neoloop.w2-analysis-attempt-result.v1",
      operation: "validate_candidate",
      record_id: parsed.record_id,
      profile_id: profile,
      node,
      object_ref: { object_type: "raw_feedback", object_id: authoritative.feedback_id },
      attempt,
      route: report.route,
      classification: report.classification === "exact_14_ready_for_owner_confirmation"
        ? "exact_14_ready"
        : report.classification,
      continue: continued,
      retry: report.route === "retry",
      repair_errors: [...report.issue_codes],
      envelope: continued ? report.envelope : null,
      envelope_json: continued ? JSON.stringify(report.envelope) : null,
      hard_rule_result_json: profile === "n2-default" && continued
        ? JSON.stringify(evaluateHardRuleRisk(authoritative.request.original_text))
        : null,
      business_write_count: 0,
      audit_write_count: 1,
    };
    const receipt: AnalysisAttemptReceipt = {
      record_id: parsed.record_id,
      profile_id: profile,
      node,
      attempt,
      candidate_sha256: candidateHash,
      response_json: JSON.stringify(responseBody),
      created_at: authoritative.created_at,
    };
    const stored = await this.dependencies.store.createAnalysisAttemptIfAbsent(receipt);
    if (!stored.inserted) {
      if (stored.receipt.candidate_sha256 !== candidateHash) {
        return result(409, {
          error: "analysis_attempt_conflict",
          business_write_count: 0,
          audit_write_count: 0,
        });
      }
      const replay = JSON.parse(stored.receipt.response_json) as Record<string, unknown>;
      return result(analysisRouteStatus(replay), replay);
    }
    return result(analysisRouteStatus(responseBody), responseBody);
  }

  private async handleAnalysisTerminalStop(request: Request): Promise<GatewayResult> {
    const denied = await this.requireAnalysis(request);
    if (denied) return denied;
    if (request.method !== "POST") return result(405, { error: "method_not_allowed" });
    if (!isJsonRequest(request)) return result(415, { error: "unsupported_media_type" });
    const rawBody = await readBoundedUtf8Body(request);
    try {
      const parsed = parseJsonObject(rawBody);
      if (
        Object.keys(parsed).length !== 1
        || !("contract" in parsed)
        || parsed.contract !== "neoloop.w2-analysis-terminal-stop.v1"
      ) return result(400, { error: "invalid_terminal_stop_request" });
      return result(409, {
        error: "needs_human",
        business_write_count: 0,
        audit_write_count: 0,
      });
    } catch (error) {
      if (error instanceof GatewayValidationError) return result(400, { error: error.code });
      throw error;
    }
  }

  private async buildAuthoritativeAiRequest(
    profile: OwnerFirstLiveProfileId,
    feedback: Awaited<ReturnType<NonNullable<GatewayDependencies["analysis"]>["readRawFeedbackByRecordId"]>> & {},
  ): Promise<AiNodeRunRequest<JsonValue> | null> {
    if (profile === "n1-default") {
      return {
        node: "N1",
        mode: AI_NODE_DEFINITIONS.N1.mode,
        version: AI_NODE_DEFINITIONS.N1.version,
        object_ref: { object_type: "raw_feedback", object_id: feedback.feedback_id },
        input: {
          original_text: feedback.request.original_text,
          channel_metadata: {
            channel: feedback.request.channel,
            source_record_id: feedback.request.source_record_id ?? null,
          },
        },
      };
    }
    const n1 = await this.dependencies.analysis?.findLatestSuccessfulAiEnvelope(feedback.feedback_id, "N1");
    if (!n1?.payload || n1.object_ref.object_id !== feedback.feedback_id) return null;
    if (profile === "n2-default") {
      return {
        node: "N2",
        mode: AI_NODE_DEFINITIONS.N2.mode,
        version: AI_NODE_DEFINITIONS.N2.version,
        object_ref: { object_type: "raw_feedback", object_id: feedback.feedback_id },
        input: {
          n1_output: structuredClone(n1.payload),
          taxonomy: {
            domains: ["车辆运维", "任务履约", "站点服务", "其他"],
            subcategories: {
              "车辆运维": ["舱门解锁异常", "自动驾驶/道路安全", "网络连接"],
              "任务履约": ["配送时效", "任务中断"],
              "站点服务": ["路线/地图点位", "现场交接"],
              "其他": ["待人工分类"],
            },
            tags: ["舱门", "延误", "道路安全", "网络", "任务", "站点", "其他"],
          },
          taxonomy_version: "taxonomy-synthetic-v1",
        },
      };
    }
    return {
      node: "N3",
      mode: AI_NODE_DEFINITIONS.N3.mode,
      version: AI_NODE_DEFINITIONS.N3.version,
      object_ref: { object_type: "raw_feedback", object_id: feedback.feedback_id },
      input: {
        original_text: feedback.request.original_text,
        n1_output: structuredClone(n1.payload),
        hard_rule_result: evaluateHardRuleRisk(feedback.request.original_text) as unknown as JsonValue,
      },
    };
  }

  private async processFeedback(
    feedback: NormalizedFeedbackV1,
    connector: ConnectorManifestV1,
  ): Promise<GatewayResult> {
    if (connector.data_scope !== "synthetic_experiment" || feedback.data_scope !== "synthetic_experiment") {
      return result(400, { error: "synthetic_scope_required" });
    }
    const request = toIngestRequest(feedback);
    const fingerprint = fingerprintIngestRequest(request);
    const currentReceiptId = receiptId(request.idempotency_key);
    const now = this.dependencies.clock.now().toISOString();
    const bodyHash = sha256(JSON.stringify(feedback));
    const prepared: GatewayReceipt = {
      receipt_id: currentReceiptId,
      connector_id: connector.connector_id,
      idempotency_key: request.idempotency_key,
      content_fingerprint: fingerprint,
      body_sha256: bodyHash,
      state: "prepared",
      feedback_id: null,
      error_code: null,
      attempt_count: 0,
      created_at: now,
      updated_at: now,
    };
    const receipt = (await this.dependencies.store.createReceiptIfAbsent(prepared)).receipt;
    if (receipt.content_fingerprint !== fingerprint) {
      return result(409, {
        error: "idempotency_conflict",
        receipt_id: receipt.receipt_id,
        idempotency_key: receipt.idempotency_key,
      });
    }
    if (receipt.state === "committed") {
      return result(200, {
        outcome: "idempotent_replay",
        receipt_id: receipt.receipt_id,
        feedback_id: receipt.feedback_id,
        idempotency_key: receipt.idempotency_key,
      });
    }
    if (receipt.state === "writing" || receipt.state === "reconciliation_required") {
      if (receipt.state === "writing") {
        receipt.state = "reconciliation_required";
        receipt.error_code = "interrupted_write";
        receipt.updated_at = now;
        await this.dependencies.store.updateReceipt(receipt);
      }
      return result(202, {
        outcome: "reconciliation_required",
        receipt_id: receipt.receipt_id,
        idempotency_key: receipt.idempotency_key,
      });
    }
    if (receipt.state === "conflicted") {
      return result(409, { error: "idempotency_conflict", receipt_id: receipt.receipt_id });
    }
    if (receipt.state === "dead_lettered") {
      return result(503, { error: "previous_delivery_failed", receipt_id: receipt.receipt_id });
    }

    receipt.state = "writing";
    receipt.attempt_count += 1;
    receipt.updated_at = now;
    await this.dependencies.store.updateReceipt(receipt);

    try {
      const ingestResult = await ingestFeedback(request, {
        clock: this.dependencies.clock,
        ids: this.dependencies.ids,
        repository: new FeishuBackedRepository(this.dependencies.feishu),
      });
      if (ingestResult.outcome === "idempotency_conflict") {
        receipt.state = "conflicted";
        receipt.error_code = "idempotency_conflict";
        receipt.updated_at = this.dependencies.clock.now().toISOString();
        await this.dependencies.store.updateReceipt(receipt);
        return result(409, {
          error: "idempotency_conflict",
          receipt_id: receipt.receipt_id,
          idempotency_key: receipt.idempotency_key,
        });
      }
      receipt.state = "committed";
      receipt.feedback_id = ingestResult.feedback_id;
      receipt.error_code = null;
      receipt.updated_at = this.dependencies.clock.now().toISOString();
      await this.dependencies.store.updateReceipt(receipt);
      return result(ingestResult.outcome === "created" ? 201 : 200, {
        outcome: ingestResult.outcome,
        receipt_id: receipt.receipt_id,
        feedback_id: ingestResult.feedback_id,
        idempotency_key: ingestResult.idempotency_key,
        created_at: ingestResult.created_at,
      });
    } catch (error) {
      if (error instanceof FeishuAdapterError && error.certainty === "unknown") {
        receipt.state = "reconciliation_required";
        receipt.error_code = error.code;
        receipt.updated_at = this.dependencies.clock.now().toISOString();
        await this.dependencies.store.updateReceipt(receipt);
        return result(202, {
          outcome: "reconciliation_required",
          receipt_id: receipt.receipt_id,
          idempotency_key: receipt.idempotency_key,
        });
      }
      const errorCode = error instanceof FeishuAdapterError ? error.code : "gateway_internal_error";
      receipt.state = "dead_lettered";
      receipt.error_code = errorCode;
      receipt.updated_at = this.dependencies.clock.now().toISOString();
      await this.dependencies.store.updateReceipt(receipt);
      await this.appendDeadLetter(
        connector.connector_id,
        receipt.receipt_id,
        receipt.idempotency_key,
        receipt.body_sha256,
        errorCode,
      );
      return result(error instanceof FeishuAdapterError ? 503 : 500, {
        error: error instanceof FeishuAdapterError ? "upstream_not_written" : "internal_error",
        ...(error instanceof FeishuAdapterError ? { upstream_error_code: errorCode } : {}),
        receipt_id: receipt.receipt_id,
      });
    }
  }

  private async handleReconciliation(request: Request, receiptIdValue: string): Promise<GatewayResult> {
    const denied = await this.requireOwner(request);
    if (denied) return denied;
    if (request.method !== "POST") return result(405, { error: "method_not_allowed" });
    const receipt = await this.dependencies.store.getReceipt(receiptIdValue);
    if (!receipt) return result(404, { error: "receipt_not_found" });
    if (receipt.state !== "reconciliation_required") {
      return result(409, { error: "invalid_reconciliation_state", state: receipt.state });
    }
    try {
      const found = await this.dependencies.feishu.findByIdempotencyKey(receipt.idempotency_key);
      if (!found) {
        return result(202, {
          outcome: "reconciliation_required",
          receipt_id: receipt.receipt_id,
          idempotency_key: receipt.idempotency_key,
        });
      }
      receipt.updated_at = this.dependencies.clock.now().toISOString();
      if (found.content_fingerprint !== receipt.content_fingerprint) {
        receipt.state = "conflicted";
        receipt.error_code = "idempotency_conflict";
        await this.dependencies.store.updateReceipt(receipt);
        return result(409, { error: "idempotency_conflict", receipt_id: receipt.receipt_id });
      }
      receipt.state = "committed";
      receipt.feedback_id = found.feedback_id;
      receipt.error_code = null;
      await this.dependencies.store.updateReceipt(receipt);
      return result(200, {
        outcome: "committed_after_readback",
        receipt_id: receipt.receipt_id,
        feedback_id: found.feedback_id,
        idempotency_key: receipt.idempotency_key,
      });
    } catch {
      return result(503, {
        error: "reconciliation_read_failed",
        receipt_id: receipt.receipt_id,
      });
    }
  }

  private async appendDeadLetter(
    connectorId: string,
    receiptIdValue: string | null,
    idempotencyKey: string | null,
    bodySha256: string,
    errorCode: string,
  ): Promise<void> {
    const deadLetter: DeadLetter = {
      dead_letter_id: this.dependencies.ids.nextId("dead-letter"),
      connector_id: connectorId,
      receipt_id: receiptIdValue,
      idempotency_key: idempotencyKey,
      body_sha256: bodySha256,
      error_code: errorCode,
      created_at: this.dependencies.clock.now().toISOString(),
    };
    await this.dependencies.store.appendDeadLetter(deadLetter);
  }
}
