import type {
  AnalysisAttemptReceipt,
  ConnectorStats,
  DeadLetter,
  GatewayReceipt,
  GatewayStore,
  StoredConnector,
} from "./types.js";

export class MemoryGatewayStore implements GatewayStore {
  readonly connectors = new Map<string, StoredConnector>();
  readonly nonces = new Map<string, number>();
  readonly receipts = new Map<string, GatewayReceipt>();
  readonly analysisAttempts = new Map<string, AnalysisAttemptReceipt>();
  readonly deadLetters: DeadLetter[] = [];

  async initialize(): Promise<void> {}

  async createConnector(connector: StoredConnector): Promise<boolean> {
    if (this.connectors.has(connector.manifest.connector_id)) return false;
    this.connectors.set(connector.manifest.connector_id, structuredClone(connector));
    return true;
  }

  async getConnector(connectorId: string): Promise<StoredConnector | null> {
    const connector = this.connectors.get(connectorId);
    return connector ? structuredClone(connector) : null;
  }

  async listConnectors(): Promise<StoredConnector[]> {
    return [...this.connectors.values()]
      .map((connector) => structuredClone(connector))
      .sort((left, right) => left.manifest.connector_id.localeCompare(right.manifest.connector_id));
  }

  async updateConnector(connector: StoredConnector): Promise<void> {
    if (!this.connectors.has(connector.manifest.connector_id)) {
      throw new Error("connector_not_found");
    }
    this.connectors.set(connector.manifest.connector_id, structuredClone(connector));
  }

  async consumeNonce(connectorId: string, nonce: string, expiresAt: Date, now: Date): Promise<boolean> {
    for (const [key, expiration] of this.nonces) {
      if (expiration <= now.getTime()) this.nonces.delete(key);
    }
    const key = `${connectorId}\u0000${nonce}`;
    if (this.nonces.has(key)) return false;
    this.nonces.set(key, expiresAt.getTime());
    return true;
  }

  async createReceiptIfAbsent(receipt: GatewayReceipt): Promise<{ inserted: boolean; receipt: GatewayReceipt }> {
    const existing = this.receipts.get(receipt.receipt_id);
    if (existing) return { inserted: false, receipt: structuredClone(existing) };
    this.receipts.set(receipt.receipt_id, structuredClone(receipt));
    return { inserted: true, receipt: structuredClone(receipt) };
  }

  async getReceipt(receiptId: string): Promise<GatewayReceipt | null> {
    const receipt = this.receipts.get(receiptId);
    return receipt ? structuredClone(receipt) : null;
  }

  async updateReceipt(receipt: GatewayReceipt): Promise<void> {
    if (!this.receipts.has(receipt.receipt_id)) throw new Error("receipt_not_found");
    this.receipts.set(receipt.receipt_id, structuredClone(receipt));
  }

  private analysisAttemptKey(
    recordId: string,
    profileId: AnalysisAttemptReceipt["profile_id"],
    attempt: 1 | 2,
  ): string {
    return `${recordId}\u0000${profileId}\u0000${attempt}`;
  }

  async getAnalysisAttempt(
    recordId: string,
    profileId: AnalysisAttemptReceipt["profile_id"],
    attempt: 1 | 2,
  ): Promise<AnalysisAttemptReceipt | null> {
    const receipt = this.analysisAttempts.get(this.analysisAttemptKey(recordId, profileId, attempt));
    return receipt ? structuredClone(receipt) : null;
  }

  async createAnalysisAttemptIfAbsent(
    receipt: AnalysisAttemptReceipt,
  ): Promise<{ inserted: boolean; receipt: AnalysisAttemptReceipt }> {
    const key = this.analysisAttemptKey(receipt.record_id, receipt.profile_id, receipt.attempt);
    const existing = this.analysisAttempts.get(key);
    if (existing) return { inserted: false, receipt: structuredClone(existing) };
    this.analysisAttempts.set(key, structuredClone(receipt));
    return { inserted: true, receipt: structuredClone(receipt) };
  }

  async appendDeadLetter(deadLetter: DeadLetter): Promise<void> {
    this.deadLetters.push(structuredClone(deadLetter));
  }

  async connectorStats(connectorId: string): Promise<ConnectorStats> {
    const receipts = [...this.receipts.values()].filter((receipt) => receipt.connector_id === connectorId);
    const lastReceivedAt = receipts.map((receipt) => receipt.created_at).sort().at(-1) ?? null;
    return {
      committed: receipts.filter((receipt) => receipt.state === "committed").length,
      conflicts: receipts.filter((receipt) => receipt.state === "conflicted").length,
      dead_lettered: this.deadLetters.filter((entry) => entry.connector_id === connectorId).length,
      reconciliation_required: receipts.filter((receipt) => receipt.state === "reconciliation_required").length,
      last_received_at: lastReceivedAt,
    };
  }
}
