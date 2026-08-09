import { createHash } from "node:crypto";

import type {
  AiNodeEnvelope,
  AiNodeStatus,
  AuditRecord,
  DataScope,
  EvidenceSpan,
  JsonValue,
} from "../contracts/model.js";
import type {
  AiNodeRunRequest,
  AiNodeRunner,
  AuditSink,
  Clock,
  IdGenerator,
} from "../contracts/ports.js";
import { validateAiNodeEnvelope } from "../contracts/validation.js";
import type { AiNodeCandidate } from "./definitions.js";
import type { AiNodeInvoker } from "./invoker.js";
import { inspectUntrustedText } from "./policy.js";
import { canonicalizeJson, snapshotPlainJsonData } from "../io/plain-json.js";
import {
  asValidatedCandidate,
  validateNodeCandidate,
  validateNodeRequestDefinition,
} from "./validation.js";

export interface AuditedAiNodeRunnerOptions {
  invoker: AiNodeInvoker;
  audit: AuditSink;
  clock: Clock;
  ids: IdGenerator;
  data_scope: DataScope;
}

export function createAiInputHash(request: AiNodeRunRequest<JsonValue>): string {
  const material: JsonValue = {
    node: request.node,
    mode: request.mode,
    version: request.version,
    object_ref: {
      object_type: request.object_ref.object_type,
      object_id: request.object_ref.object_id,
    },
    input: request.input,
  };
  return createHash("sha256").update(JSON.stringify(canonicalizeJson(material))).digest("hex");
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isJsonValue(value: unknown, depth = 0): value is JsonValue {
  if (depth > 16) return false;
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every((entry) => isJsonValue(entry, depth + 1));
  if (isObject(value)) return Object.values(value).every((entry) => isJsonValue(entry, depth + 1));
  return false;
}

function collectUntrustedInputText(value: JsonValue, depth = 0): string[] {
  if (depth > 16 || value === null || typeof value === "number" || typeof value === "boolean") return [];
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) {
    return value.flatMap((entry) => collectUntrustedInputText(entry, depth + 1));
  }
  return Object.values(value).flatMap((entry) => collectUntrustedInputText(entry, depth + 1));
}

function safeCandidateFields(value: unknown): Pick<AiNodeCandidate, "payload" | "evidence_spans" | "missing_fields" | "confidence"> {
  if (!isObject(value)) {
    return { payload: null, evidence_spans: [], missing_fields: [], confidence: null };
  }
  const payload = isJsonValue(value.payload) ? value.payload : null;
  const evidence_spans = Array.isArray(value.evidence_spans)
    ? value.evidence_spans.flatMap((span): EvidenceSpan[] => {
        if (
          !isObject(span) ||
          typeof span.source_ref !== "string" ||
          span.source_ref.trim().length === 0 ||
          typeof span.quote !== "string" ||
          span.quote.trim().length === 0
        ) {
          return [];
        }
        const start = span.start_offset;
        const end = span.end_offset;
        if (
          (start !== undefined && (!Number.isInteger(start) || (start as number) < 0)) ||
          (end !== undefined && (!Number.isInteger(end) || (end as number) < 0)) ||
          (Number.isInteger(start) && Number.isInteger(end) && (end as number) < (start as number))
        ) {
          return [];
        }
        return [{
          source_ref: span.source_ref,
          quote: span.quote,
          ...(start === undefined ? {} : { start_offset: start as number }),
          ...(end === undefined ? {} : { end_offset: end as number }),
        }];
      })
    : [];
  const missing_fields = Array.isArray(value.missing_fields)
    ? value.missing_fields.filter((field): field is string => typeof field === "string" && field.length > 0)
    : [];
  const confidence =
    typeof value.confidence === "number" &&
    Number.isFinite(value.confidence) &&
    value.confidence >= 0 &&
    value.confidence <= 1
      ? value.confidence
      : null;
  return { payload, evidence_spans, missing_fields, confidence };
}

function humanState(status: AiNodeStatus): "none" | "pending" {
  return status === "ok" ? "none" : "pending";
}

export class AuditedAiNodeRunner implements AiNodeRunner {
  private readonly invoker: AiNodeInvoker;
  private readonly audit: AuditSink;
  private readonly clock: Clock;
  private readonly ids: IdGenerator;
  private readonly dataScope: DataScope;

  constructor(options: AuditedAiNodeRunnerOptions) {
    this.invoker = options.invoker;
    this.audit = options.audit;
    this.clock = options.clock;
    this.ids = options.ids;
    this.dataScope = options.data_scope;
  }

  private async appendAudit(envelope: AiNodeEnvelope<JsonValue>): Promise<void> {
    const auditEnvelope = structuredClone(envelope);
    const payload: JsonValue = {
      attempt: auditEnvelope.retry_count,
      envelope: auditEnvelope as unknown as JsonValue,
    };
    const record: AuditRecord = {
      audit_id: this.ids.nextId("audit"),
      object_ref: { ...envelope.object_ref },
      category: "ai",
      occurred_at: this.clock.now().toISOString(),
      clock_source: this.clock.source,
      payload,
    };
    await this.audit.append(record);
  }

  private makeEnvelope(
    request: AiNodeRunRequest<JsonValue>,
    inputHash: string,
    runId: string,
    retryCount: 0 | 1,
    fields: Pick<AiNodeCandidate, "payload" | "evidence_spans" | "missing_fields" | "confidence">,
    status: AiNodeStatus,
    validation: { valid: boolean; errors: string[] },
  ): AiNodeEnvelope<JsonValue> {
    const envelope: AiNodeEnvelope<JsonValue> = {
      node: request.node,
      mode: request.mode,
      version: request.version,
      run_id: runId,
      object_ref: { ...request.object_ref },
      input_hash: inputHash,
      payload: structuredClone(fields.payload),
      evidence_spans: structuredClone(fields.evidence_spans),
      missing_fields: structuredClone(fields.missing_fields),
      confidence: fields.confidence,
      status,
      validation: { valid: validation.valid, errors: [...validation.errors] },
      retry_count: retryCount,
      human_revision: { state: humanState(status) },
    };
    const boundary = validateAiNodeEnvelope(envelope);
    if (!boundary.valid) {
      throw new Error(`Runner constructed an invalid AiNodeEnvelope: ${boundary.errors.join("; ")}`);
    }
    return envelope;
  }

  async run<TInput extends JsonValue, TOutput extends JsonValue>(
    request: AiNodeRunRequest<TInput>,
  ): Promise<AiNodeEnvelope<TOutput>> {
    const authoritativeRequest = structuredClone(request) as AiNodeRunRequest<JsonValue>;
    const inputHash = createAiInputHash(authoritativeRequest);
    const requestValidation = validateNodeRequestDefinition(authoritativeRequest);
    if (!requestValidation.valid) {
      const envelope = this.makeEnvelope(
        authoritativeRequest,
        inputHash,
        this.ids.nextId("run"),
        0,
        { payload: null, evidence_spans: [], missing_fields: [], confidence: null },
        "error",
        requestValidation,
      );
      await this.appendAudit(envelope);
      return envelope as AiNodeEnvelope<TOutput>;
    }
    const untrustedInputText = collectUntrustedInputText(authoritativeRequest.input);
    const promptInjectionDetected = untrustedInputText.some(
      (text) => inspectUntrustedText(text).prompt_injection_detected,
    );
    let repairErrors: string[] = [];

    for (const retryCount of [0, 1] as const) {
      const runId = this.ids.nextId("run");
      let raw: unknown;
      try {
        raw = await this.invoker.invoke({
          node: authoritativeRequest.node,
          mode: authoritativeRequest.mode,
          version: authoritativeRequest.version,
          run_id: runId,
          object_ref: structuredClone(authoritativeRequest.object_ref),
          input_hash: inputHash,
          input: structuredClone(authoritativeRequest.input),
          retry_count: retryCount,
          repair_errors: [...repairErrors],
          data_scope: this.dataScope,
          security_context: {
            original_text_trust: untrustedInputText.length === 0 ? "not_present" : "untrusted",
            prompt_injection_detected: promptInjectionDetected,
            instructions_are_data_only: true,
            exposed_capabilities: [],
          },
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "unknown upstream error";
        const envelope = this.makeEnvelope(
          authoritativeRequest,
          inputHash,
          runId,
          retryCount,
          { payload: null, evidence_spans: [], missing_fields: [], confidence: null },
          "error",
          { valid: false, errors: [`upstream error: ${message}`] },
        );
        await this.appendAudit(envelope);
        return envelope as AiNodeEnvelope<TOutput>;
      }

      const rawSnapshot = snapshotPlainJsonData(raw);
      if (!rawSnapshot.ok) {
        const boundaryValidation = { valid: false as const, errors: [rawSnapshot.error] };
        repairErrors = boundaryValidation.errors;
        const envelope = this.makeEnvelope(
          authoritativeRequest,
          inputHash,
          runId,
          retryCount,
          { payload: null, evidence_spans: [], missing_fields: [], confidence: null },
          retryCount === 0 ? "error" : "needs_human",
          boundaryValidation,
        );
        await this.appendAudit(envelope);
        if (retryCount === 1) return envelope as AiNodeEnvelope<TOutput>;
        continue;
      }

      const candidateSnapshot = rawSnapshot.value;
      const candidateValidation = validateNodeCandidate(authoritativeRequest, candidateSnapshot);
      if (candidateValidation.valid) {
        const candidate = asValidatedCandidate(candidateSnapshot);
        const envelope = this.makeEnvelope(
          authoritativeRequest,
          inputHash,
          runId,
          retryCount,
          candidate,
          candidate.status,
          { valid: true, errors: [] },
        );
        await this.appendAudit(envelope);
        return envelope as AiNodeEnvelope<TOutput>;
      }

      repairErrors = candidateValidation.errors;
      const envelope = this.makeEnvelope(
        authoritativeRequest,
        inputHash,
        runId,
        retryCount,
        safeCandidateFields(candidateSnapshot),
        retryCount === 0 ? "error" : "needs_human",
        { valid: false, errors: candidateValidation.errors },
      );
      await this.appendAudit(envelope);
      if (retryCount === 1) {
        return envelope as AiNodeEnvelope<TOutput>;
      }
    }

    throw new Error("Unreachable AI retry state");
  }
}
