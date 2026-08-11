import type { Repository } from "../../src/neoloop/contracts/ports.js";
import type { StoredRawFeedback } from "../../src/neoloop/contracts/model.js";
import type { FeishuRawFeedbackAdapter } from "./types.js";

export type FeishuWriteCertainty = "not_written" | "unknown";

export class FeishuAdapterError extends Error {
  constructor(
    readonly code: string,
    readonly certainty: FeishuWriteCertainty,
  ) {
    super(code);
    this.name = "FeishuAdapterError";
  }
}
export class FeishuBackedRepository implements Repository {
  constructor(private readonly adapter: FeishuRawFeedbackAdapter) {}

  findRawFeedbackByIdempotencyKey(idempotencyKey: string): Promise<StoredRawFeedback | null> {
    return this.adapter.findByIdempotencyKey(idempotencyKey);
  }

  async insertRawFeedbackIfAbsent(
    record: StoredRawFeedback,
  ): Promise<{ inserted: boolean; record: StoredRawFeedback }> {
    const existing = await this.adapter.findByIdempotencyKey(record.idempotency_key);
    if (existing) {
      return { inserted: false, record: existing };
    }

    const created = await this.adapter.createRawFeedback(record);
    const readBack = await this.adapter.readRawFeedback(created.record_id);
    if (!readBack) {
      throw new FeishuAdapterError("readback_missing", "unknown");
    }
    if (
      readBack.idempotency_key !== record.idempotency_key
      || readBack.content_fingerprint !== record.content_fingerprint
      || readBack.feedback_id !== record.feedback_id
    ) {
      throw new FeishuAdapterError("readback_mismatch", "unknown");
    }
    return { inserted: true, record: readBack };
  }
}

export class UnconfiguredFeishuRawFeedbackAdapter implements FeishuRawFeedbackAdapter {
  async findByIdempotencyKey(): Promise<StoredRawFeedback | null> {
    throw new FeishuAdapterError("feishu_adapter_unconfigured", "not_written");
  }

  async createRawFeedback(): Promise<{ record_id: string }> {
    throw new FeishuAdapterError("feishu_adapter_unconfigured", "not_written");
  }

  async readRawFeedback(): Promise<StoredRawFeedback | null> {
    throw new FeishuAdapterError("feishu_adapter_unconfigured", "not_written");
  }
}
