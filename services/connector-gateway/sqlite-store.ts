import type {
  AnalysisAttemptReceipt,
  ConnectorStats,
  DeadLetter,
  GatewayReceipt,
  GatewayStore,
  StoredConnector,
} from "./types.js";

type SqlPrimitive = string | number | null | ArrayBuffer;

export interface SqlCursorLike<Row extends Record<string, unknown>> {
  toArray(): Row[];
}

export interface SqlStorageLike {
  exec<Row extends Record<string, unknown>>(query: string, ...bindings: SqlPrimitive[]): SqlCursorLike<Row>;
}

export interface SqliteDurableStorageLike {
  readonly sql: SqlStorageLike;
  transactionSync<T>(callback: () => T): T;
}

interface ConnectorRow extends Record<string, unknown> {
  manifest_json: string;
  sealed_secret: string;
  secret_version: number;
  created_at: string;
  updated_at: string;
}

interface ReceiptRow extends Record<string, unknown> {
  receipt_id: string;
  connector_id: string;
  idempotency_key: string;
  content_fingerprint: string;
  body_sha256: string;
  state: GatewayReceipt["state"];
  feedback_id: string | null;
  error_code: string | null;
  attempt_count: number;
  created_at: string;
  updated_at: string;
}

interface AnalysisAttemptRow extends Record<string, unknown> {
  record_id: string;
  profile_id: AnalysisAttemptReceipt["profile_id"];
  node: AnalysisAttemptReceipt["node"];
  attempt: 1 | 2;
  candidate_sha256: string;
  response_json: string;
  created_at: string;
}

function connectorFromRow(row: ConnectorRow): StoredConnector {
  return {
    manifest: JSON.parse(row.manifest_json) as StoredConnector["manifest"],
    sealed_secret: row.sealed_secret,
    secret_version: row.secret_version,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function receiptFromRow(row: ReceiptRow): GatewayReceipt {
  return { ...row };
}

export class SqliteGatewayStore implements GatewayStore {
  constructor(private readonly storage: SqliteDurableStorageLike) {}

  async initialize(): Promise<void> {
    this.storage.sql.exec(`CREATE TABLE IF NOT EXISTS connectors (
      connector_id TEXT PRIMARY KEY,
      manifest_json TEXT NOT NULL,
      sealed_secret TEXT NOT NULL,
      secret_version INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`);
    this.storage.sql.exec(`CREATE TABLE IF NOT EXISTS nonces (
      connector_id TEXT NOT NULL,
      nonce TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      PRIMARY KEY (connector_id, nonce)
    )`);
    this.storage.sql.exec(`CREATE TABLE IF NOT EXISTS receipts (
      receipt_id TEXT PRIMARY KEY,
      connector_id TEXT NOT NULL,
      idempotency_key TEXT NOT NULL UNIQUE,
      content_fingerprint TEXT NOT NULL,
      body_sha256 TEXT NOT NULL,
      state TEXT NOT NULL,
      feedback_id TEXT,
      error_code TEXT,
      attempt_count INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`);
    this.storage.sql.exec("CREATE INDEX IF NOT EXISTS receipts_connector_state ON receipts(connector_id, state)");
    this.storage.sql.exec(`CREATE TABLE IF NOT EXISTS dead_letters (
      dead_letter_id TEXT PRIMARY KEY,
      connector_id TEXT NOT NULL,
      receipt_id TEXT,
      idempotency_key TEXT,
      body_sha256 TEXT NOT NULL,
      error_code TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`);
    this.storage.sql.exec("CREATE INDEX IF NOT EXISTS dead_letters_connector ON dead_letters(connector_id)");
    this.storage.sql.exec(`CREATE TABLE IF NOT EXISTS analysis_attempts (
      record_id TEXT NOT NULL,
      profile_id TEXT NOT NULL,
      node TEXT NOT NULL,
      attempt INTEGER NOT NULL CHECK (attempt IN (1, 2)),
      candidate_sha256 TEXT NOT NULL,
      response_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (record_id, profile_id, attempt)
    )`);
  }

  async createConnector(connector: StoredConnector): Promise<boolean> {
    const result = this.storage.sql.exec(
      `INSERT OR IGNORE INTO connectors
       (connector_id, manifest_json, sealed_secret, secret_version, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       RETURNING connector_id`,
      connector.manifest.connector_id,
      JSON.stringify(connector.manifest),
      connector.sealed_secret,
      connector.secret_version,
      connector.created_at,
      connector.updated_at,
    );
    return result.toArray().length === 1;
  }

  async getConnector(connectorId: string): Promise<StoredConnector | null> {
    const row = this.storage.sql.exec<ConnectorRow>(
      "SELECT manifest_json, sealed_secret, secret_version, created_at, updated_at FROM connectors WHERE connector_id = ?",
      connectorId,
    ).toArray()[0];
    return row ? connectorFromRow(row) : null;
  }

  async listConnectors(): Promise<StoredConnector[]> {
    return this.storage.sql.exec<ConnectorRow>(
      "SELECT manifest_json, sealed_secret, secret_version, created_at, updated_at FROM connectors ORDER BY connector_id",
    ).toArray().map(connectorFromRow);
  }

  async updateConnector(connector: StoredConnector): Promise<void> {
    const result = this.storage.sql.exec(
      `UPDATE connectors SET manifest_json = ?, sealed_secret = ?, secret_version = ?, updated_at = ?
       WHERE connector_id = ?
       RETURNING connector_id`,
      JSON.stringify(connector.manifest),
      connector.sealed_secret,
      connector.secret_version,
      connector.updated_at,
      connector.manifest.connector_id,
    );
    if (result.toArray().length !== 1) throw new Error("connector_not_found");
  }

  async consumeNonce(connectorId: string, nonce: string, expiresAt: Date, now: Date): Promise<boolean> {
    return this.storage.transactionSync(() => {
      this.storage.sql.exec("DELETE FROM nonces WHERE expires_at <= ?", now.getTime());
      const result = this.storage.sql.exec(
        `INSERT OR IGNORE INTO nonces (connector_id, nonce, expires_at) VALUES (?, ?, ?)
         RETURNING nonce`,
        connectorId,
        nonce,
        expiresAt.getTime(),
      );
      return result.toArray().length === 1;
    });
  }

  async createReceiptIfAbsent(receipt: GatewayReceipt): Promise<{ inserted: boolean; receipt: GatewayReceipt }> {
    return this.storage.transactionSync(() => {
      const insertion = this.storage.sql.exec(
        `INSERT OR IGNORE INTO receipts
         (receipt_id, connector_id, idempotency_key, content_fingerprint, body_sha256, state,
          feedback_id, error_code, attempt_count, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         RETURNING receipt_id`,
        receipt.receipt_id,
        receipt.connector_id,
        receipt.idempotency_key,
        receipt.content_fingerprint,
        receipt.body_sha256,
        receipt.state,
        receipt.feedback_id,
        receipt.error_code,
        receipt.attempt_count,
        receipt.created_at,
        receipt.updated_at,
      );
      if (insertion.toArray().length === 1) return { inserted: true, receipt };
      const existing = this.storage.sql.exec<ReceiptRow>(
        "SELECT * FROM receipts WHERE receipt_id = ?",
        receipt.receipt_id,
      ).toArray()[0];
      if (!existing) throw new Error("receipt_lookup_failed");
      return { inserted: false, receipt: receiptFromRow(existing) };
    });
  }

  async getReceipt(receiptId: string): Promise<GatewayReceipt | null> {
    const row = this.storage.sql.exec<ReceiptRow>(
      "SELECT * FROM receipts WHERE receipt_id = ?",
      receiptId,
    ).toArray()[0];
    return row ? receiptFromRow(row) : null;
  }

  async updateReceipt(receipt: GatewayReceipt): Promise<void> {
    const result = this.storage.sql.exec(
      `UPDATE receipts SET state = ?, feedback_id = ?, error_code = ?, attempt_count = ?, updated_at = ?
       WHERE receipt_id = ?
       RETURNING receipt_id`,
      receipt.state,
      receipt.feedback_id,
      receipt.error_code,
      receipt.attempt_count,
      receipt.updated_at,
      receipt.receipt_id,
    );
    if (result.toArray().length !== 1) throw new Error("receipt_not_found");
  }

  async getAnalysisAttempt(
    recordId: string,
    profileId: AnalysisAttemptReceipt["profile_id"],
    attempt: 1 | 2,
  ): Promise<AnalysisAttemptReceipt | null> {
    const row = this.storage.sql.exec<AnalysisAttemptRow>(
      "SELECT * FROM analysis_attempts WHERE record_id = ? AND profile_id = ? AND attempt = ?",
      recordId,
      profileId,
      attempt,
    ).toArray()[0];
    return row ? { ...row } : null;
  }

  async createAnalysisAttemptIfAbsent(
    receipt: AnalysisAttemptReceipt,
  ): Promise<{ inserted: boolean; receipt: AnalysisAttemptReceipt }> {
    return this.storage.transactionSync(() => {
      const insertion = this.storage.sql.exec(
        `INSERT OR IGNORE INTO analysis_attempts
         (record_id, profile_id, node, attempt, candidate_sha256, response_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         RETURNING record_id`,
        receipt.record_id,
        receipt.profile_id,
        receipt.node,
        receipt.attempt,
        receipt.candidate_sha256,
        receipt.response_json,
        receipt.created_at,
      );
      if (insertion.toArray().length === 1) return { inserted: true, receipt };
      const existing = this.storage.sql.exec<AnalysisAttemptRow>(
        "SELECT * FROM analysis_attempts WHERE record_id = ? AND profile_id = ? AND attempt = ?",
        receipt.record_id,
        receipt.profile_id,
        receipt.attempt,
      ).toArray()[0];
      if (!existing) throw new Error("analysis_attempt_lookup_failed");
      return { inserted: false, receipt: { ...existing } };
    });
  }

  async appendDeadLetter(deadLetter: DeadLetter): Promise<void> {
    this.storage.sql.exec(
      `INSERT INTO dead_letters
       (dead_letter_id, connector_id, receipt_id, idempotency_key, body_sha256, error_code, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      deadLetter.dead_letter_id,
      deadLetter.connector_id,
      deadLetter.receipt_id,
      deadLetter.idempotency_key,
      deadLetter.body_sha256,
      deadLetter.error_code,
      deadLetter.created_at,
    );
  }

  async connectorStats(connectorId: string): Promise<ConnectorStats> {
    const receipts = this.storage.sql.exec<ReceiptRow>(
      "SELECT * FROM receipts WHERE connector_id = ?",
      connectorId,
    ).toArray().map(receiptFromRow);
    const deadLettered = this.storage.sql.exec<{ count: number }>(
      "SELECT COUNT(*) AS count FROM dead_letters WHERE connector_id = ?",
      connectorId,
    ).toArray()[0]?.count ?? 0;
    return {
      committed: receipts.filter((receipt) => receipt.state === "committed").length,
      conflicts: receipts.filter((receipt) => receipt.state === "conflicted").length,
      dead_lettered: deadLettered,
      reconciliation_required: receipts.filter((receipt) => receipt.state === "reconciliation_required").length,
      last_received_at: receipts.map((receipt) => receipt.created_at).sort().at(-1) ?? null,
    };
  }
}
