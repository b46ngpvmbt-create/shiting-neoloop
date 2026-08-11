import type {
  AiNodeEnvelope,
  AuditRecord,
  JsonValue,
  StoredRawFeedback,
} from "../../src/neoloop/contracts/model.js";
import { FeishuAdapterError, type FeishuWriteCertainty } from "./feishu-adapter.js";
import type { FeishuAnalysisPort, FeishuRawFeedbackAdapter } from "./types.js";

interface QueuedFailure {
  certainty: FeishuWriteCertainty;
  after_write: boolean;
  code: string;
}

export class FakeFeishuRawFeedbackAdapter implements FeishuRawFeedbackAdapter, FeishuAnalysisPort {
  readonly recordsByKey = new Map<string, StoredRawFeedback>();
  readonly recordsById = new Map<string, StoredRawFeedback>();
  createAttempts = 0;
  private readonly failures: QueuedFailure[] = [];
  readonly aiAudits: Array<{ record: AuditRecord; operation_key: string }> = [];

  queueCreateFailure(failure: QueuedFailure): void {
    this.failures.push(failure);
  }

  async findByIdempotencyKey(idempotencyKey: string): Promise<StoredRawFeedback | null> {
    const record = this.recordsByKey.get(idempotencyKey);
    return record ? structuredClone(record) : null;
  }

  async createRawFeedback(record: StoredRawFeedback): Promise<{ record_id: string }> {
    this.createAttempts += 1;
    const existing = this.recordsByKey.get(record.idempotency_key);
    if (existing) {
      return { record_id: existing.feedback_id };
    }

    const failure = this.failures.shift();
    if (!failure?.after_write) {
      if (failure) throw new FeishuAdapterError(failure.code, failure.certainty);
    }

    const stored = structuredClone(record);
    this.recordsByKey.set(record.idempotency_key, stored);
    this.recordsById.set(record.feedback_id, stored);
    if (failure) throw new FeishuAdapterError(failure.code, failure.certainty);
    return { record_id: record.feedback_id };
  }

  async readRawFeedback(recordId: string): Promise<StoredRawFeedback | null> {
    const record = this.recordsById.get(recordId);
    return record ? structuredClone(record) : null;
  }

  async readRawFeedbackByRecordId(recordId: string): Promise<StoredRawFeedback | null> {
    return this.readRawFeedback(recordId);
  }

  async findLatestSuccessfulAiEnvelope(
    objectId: string,
    node: "N1" | "N2" | "N3",
  ): Promise<AiNodeEnvelope<JsonValue> | null> {
    const match = this.aiAudits
      .map((entry) => entry.record)
      .reverse()
      .find((record) => {
        if (record.object_ref.object_id !== objectId || record.category !== "ai") return false;
        const payload = record.payload as Record<string, unknown>;
        const envelope = payload.envelope as AiNodeEnvelope<JsonValue> | undefined;
        return envelope?.node === node && envelope.status === "ok" && envelope.validation.valid;
      });
    if (!match) return null;
    return structuredClone((match.payload as Record<string, unknown>).envelope as AiNodeEnvelope<JsonValue>);
  }

  async appendAiAudit(record: AuditRecord, operationKey: string): Promise<void> {
    if (this.aiAudits.some((entry) => entry.operation_key === operationKey)) return;
    this.aiAudits.push({ record: structuredClone(record), operation_key: operationKey });
  }
}
