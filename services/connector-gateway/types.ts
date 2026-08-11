import type { Clock, IdGenerator } from "../../src/neoloop/contracts/ports.js";
import type {
  AiNodeEnvelope,
  AuditRecord,
  JsonValue,
  StoredRawFeedback,
} from "../../src/neoloop/contracts/model.js";

export const CONNECTOR_TRANSPORTS = ["webhook", "polling", "batch", "manual"] as const;
export type ConnectorTransport = (typeof CONNECTOR_TRANSPORTS)[number];

export const FEEDBACK_SOURCE_TYPES = [
  "service_rating",
  "vehicle_event",
  "fault_report",
  "service_ticket",
  "customer_group",
  "hotline_transcript",
  "email",
  "partner_feedback",
  "public_review",
  "manual_note",
] as const;
export type FeedbackSourceType = (typeof FEEDBACK_SOURCE_TYPES)[number];

export interface ConnectorManifestV1 {
  contract: "neoloop.connector.v1";
  connector_id: string;
  display_name: string;
  provider: string;
  transport: ConnectorTransport;
  source_type: FeedbackSourceType;
  source_tenant_scope: string;
  authorization_scope: string;
  field_map_version: string;
  data_scope: "synthetic_experiment";
  enabled: boolean;
}

export interface AttachmentMetadataV1 {
  name: string;
  media_type: string;
  byte_length: number;
  source_locator: string;
  sha256: string;
}

export interface NormalizedFeedbackV1 {
  contract: "neoloop.source-feedback.v1";
  connector_id: string;
  provider: string;
  transport: ConnectorTransport;
  source_type: FeedbackSourceType;
  source_name: string;
  source_record_id: string;
  source_tenant_scope: string;
  source_locator: string;
  source_event_at: string;
  source_timezone: string;
  channel: string;
  sender_role: string;
  original_text: string;
  authorization_scope: string;
  attachments: AttachmentMetadataV1[];
  data_scope?: "synthetic_experiment";
}

export interface NormalizedFeedbackBatchV1 {
  contract: "neoloop.source-feedback.batch.v1";
  connector_id: string;
  items: NormalizedFeedbackV1[];
}

export interface StoredConnector {
  manifest: ConnectorManifestV1;
  sealed_secret: string;
  secret_version: number;
  created_at: string;
  updated_at: string;
}

export type ReceiptState =
  | "prepared"
  | "writing"
  | "committed"
  | "conflicted"
  | "dead_lettered"
  | "reconciliation_required";

export interface GatewayReceipt {
  receipt_id: string;
  connector_id: string;
  idempotency_key: string;
  content_fingerprint: string;
  body_sha256: string;
  state: ReceiptState;
  feedback_id: string | null;
  error_code: string | null;
  attempt_count: number;
  created_at: string;
  updated_at: string;
}

export interface AnalysisAttemptReceipt {
  record_id: string;
  profile_id: "n1-default" | "n2-default" | "n3-default";
  node: "N1" | "N2" | "N3";
  attempt: 1 | 2;
  candidate_sha256: string;
  response_json: string;
  created_at: string;
}

export interface DeadLetter {
  dead_letter_id: string;
  connector_id: string;
  receipt_id: string | null;
  idempotency_key: string | null;
  body_sha256: string;
  error_code: string;
  created_at: string;
}

export interface ConnectorStats {
  committed: number;
  conflicts: number;
  dead_lettered: number;
  reconciliation_required: number;
  last_received_at: string | null;
}

export interface GatewayStore {
  initialize(): Promise<void>;
  createConnector(connector: StoredConnector): Promise<boolean>;
  getConnector(connectorId: string): Promise<StoredConnector | null>;
  listConnectors(): Promise<StoredConnector[]>;
  updateConnector(connector: StoredConnector): Promise<void>;
  consumeNonce(connectorId: string, nonce: string, expiresAt: Date, now: Date): Promise<boolean>;
  createReceiptIfAbsent(receipt: GatewayReceipt): Promise<{ inserted: boolean; receipt: GatewayReceipt }>;
  getReceipt(receiptId: string): Promise<GatewayReceipt | null>;
  updateReceipt(receipt: GatewayReceipt): Promise<void>;
  getAnalysisAttempt(
    recordId: string,
    profileId: AnalysisAttemptReceipt["profile_id"],
    attempt: 1 | 2,
  ): Promise<AnalysisAttemptReceipt | null>;
  createAnalysisAttemptIfAbsent(
    receipt: AnalysisAttemptReceipt,
  ): Promise<{ inserted: boolean; receipt: AnalysisAttemptReceipt }>;
  appendDeadLetter(deadLetter: DeadLetter): Promise<void>;
  connectorStats(connectorId: string): Promise<ConnectorStats>;
}

export interface SecretProtector {
  seal(secret: string, context: string): Promise<string>;
  open(sealedSecret: string, context: string): Promise<string>;
}

export type OwnerAuthorization =
  | { ok: true; subject: string }
  | { ok: false; code: "owner_auth_unconfigured" | "owner_unauthorized" };

export interface OwnerAuthPort {
  authorize(request: Request): Promise<OwnerAuthorization>;
}

export interface FeishuRawFeedbackAdapter {
  findByIdempotencyKey(idempotencyKey: string): Promise<StoredRawFeedback | null>;
  createRawFeedback(record: StoredRawFeedback): Promise<{ record_id: string }>;
  readRawFeedback(recordId: string): Promise<StoredRawFeedback | null>;
}

export interface FeishuAnalysisPort {
  readRawFeedbackByRecordId(recordId: string): Promise<StoredRawFeedback | null>;
  findLatestSuccessfulAiEnvelope(
    objectId: string,
    node: "N1" | "N2" | "N3",
  ): Promise<AiNodeEnvelope<JsonValue> | null>;
  appendAiAudit(record: AuditRecord, operationKey: string): Promise<void>;
}

export interface GatewayDependencies {
  store: GatewayStore;
  feishu: FeishuRawFeedbackAdapter;
  analysis?: FeishuAnalysisPort;
  analysisAuth?: OwnerAuthPort;
  ownerAuth: OwnerAuthPort;
  secretProtector: SecretProtector;
  secretGenerator: () => string;
  ids: IdGenerator;
  clock: Clock;
}
