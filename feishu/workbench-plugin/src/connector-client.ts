export type ConnectorTransport = "webhook" | "polling" | "batch" | "manual";
export type ConnectorStatus = "active" | "disabled" | "unconfigured";

export type ConnectorSummary = {
  id: string;
  displayName: string;
  provider: string;
  transport: ConnectorTransport;
  sourceType: string;
  status: ConnectorStatus;
  lastReceivedAt: string | null;
  totals: {
    received: number;
    committed: number;
    replayed: number;
    conflicts: number;
    rejected: number;
    reconciliation: number;
  };
};

export type CreateConnectorInput = {
  displayName: string;
  provider: string;
  transport: Exclude<ConnectorTransport, "manual">;
  sourceType: string;
  sourceTenantScope: string;
  authorizationScope: string;
};

export type ManualFeedbackInput = {
  sourceName: string;
  sourceType: string;
  channel: string;
  senderRole: string;
  sourceRecordId: string;
  sourceTenantScope: string;
  sourceLocator: string;
  sourceTimezone: string;
  sourceEventAt: string;
  authorizationScope: string;
  originalText: string;
  dataScope: "synthetic_experiment";
};

export type OneTimeSecretResult = {
  connector: ConnectorSummary;
  oneTimeSecret: string;
  webhookPath: string;
};

export type IntakeReceipt = {
  feedbackId: string;
  disposition: "inserted" | "returned_existing";
};

export type WorkflowStatus = {
  total: number;
  enabled: number;
  disabled: number;
  observedAt: string;
};

export interface ConnectorClient {
  workflowStatus(): Promise<WorkflowStatus | null>;
  list(): Promise<ConnectorSummary[]>;
  create(input: CreateConnectorInput): Promise<OneTimeSecretResult>;
  disable(connectorId: string): Promise<ConnectorSummary>;
  rotate(connectorId: string): Promise<OneTimeSecretResult>;
  createManualFeedback(input: ManualFeedbackInput): Promise<IntakeReceipt>;
}

type SessionAuthorization = () => Promise<`Session ${string}`> | `Session ${string}`;

type GatewayStats = {
  committed: number;
  conflicts: number;
  dead_lettered: number;
  reconciliation_required: number;
  last_received_at: string | null;
};

type GatewayConnector = {
  connector_id: string;
  display_name: string;
  provider: string;
  transport: ConnectorTransport;
  source_type: string;
  enabled: boolean;
  stats: GatewayStats;
};

function summary(connector: GatewayConnector): ConnectorSummary {
  const totals = {
    received: connector.stats.committed + connector.stats.conflicts
      + connector.stats.dead_lettered + connector.stats.reconciliation_required,
    committed: connector.stats.committed,
    replayed: 0,
    conflicts: connector.stats.conflicts,
    rejected: connector.stats.dead_lettered,
    reconciliation: connector.stats.reconciliation_required,
  };
  return {
    id: connector.connector_id,
    displayName: connector.display_name,
    provider: connector.provider,
    transport: connector.transport,
    sourceType: connector.source_type,
    status: connector.enabled ? "active" : "disabled",
    lastReceivedAt: connector.stats.last_received_at,
    totals,
  };
}

export class HttpConnectorClient implements ConnectorClient {
  constructor(
    private readonly baseUrl: string,
    private readonly authorization: SessionAuthorization,
  ) {}

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const authorization = await this.authorization();
    const response = await fetch(new URL(path, this.baseUrl), {
      ...init,
      credentials: "omit",
      headers: {
        "Content-Type": "application/json",
        Authorization: authorization,
        ...init.headers,
      },
    });
    if (!response.ok) {
      const requestId = response.headers.get("x-request-id") ?? "unavailable";
      throw new Error(`Connector API ${response.status}; request ${requestId}`);
    }
    return response.json() as Promise<T>;
  }

  async list() {
    const result = await this.request<{ connectors: GatewayConnector[] }>("/api/v1/connectors");
    return result.connectors.map(summary);
  }

  async workflowStatus(): Promise<WorkflowStatus> {
    const result = await this.request<{
      contract: "neoloop.workflow-status.v1";
      total: number;
      enabled: number;
      disabled: number;
      observed_at: string;
    }>("/api/v1/workflows/status");
    if (
      result.contract !== "neoloop.workflow-status.v1"
      || ![result.total, result.enabled, result.disabled].every(Number.isSafeInteger)
      || result.total < 0
      || result.enabled < 0
      || result.disabled < 0
      || result.enabled + result.disabled !== result.total
      || !Number.isFinite(Date.parse(result.observed_at))
    ) {
      throw new Error("Workflow status response is invalid");
    }
    return {
      total: result.total,
      enabled: result.enabled,
      disabled: result.disabled,
      observedAt: result.observed_at,
    };
  }

  async create(input: CreateConnectorInput) {
    const suffix = crypto.randomUUID().replaceAll("-", "").slice(0, 20);
    const result = await this.request<{ connector: GatewayConnector; secret: string }>("/api/v1/connectors", {
      method: "POST",
      body: JSON.stringify({
        contract: "neoloop.connector.v1",
        connector_id: `connector_${suffix}`,
        display_name: input.displayName,
        provider: input.provider,
        transport: input.transport,
        source_type: input.sourceType,
        source_tenant_scope: input.sourceTenantScope,
        authorization_scope: input.authorizationScope,
        data_scope: "synthetic_experiment",
        field_map_version: "1",
        enabled: true,
      }),
    });
    return {
      connector: summary(result.connector),
      oneTimeSecret: result.secret,
      webhookPath: `/api/v1/connectors/${result.connector.connector_id}/feedback`,
    };
  }

  async disable(connectorId: string) {
    const result = await this.request<{ connector: GatewayConnector }>(`/api/v1/connectors/${encodeURIComponent(connectorId)}/disable`, {
      method: "POST",
    });
    return summary(result.connector);
  }

  async rotate(connectorId: string) {
    const result = await this.request<{ connector: GatewayConnector; secret: string }>(`/api/v1/connectors/${encodeURIComponent(connectorId)}/rotate-secret`, {
      method: "POST",
    });
    return {
      connector: summary(result.connector),
      oneTimeSecret: result.secret,
      webhookPath: `/api/v1/connectors/${result.connector.connector_id}/feedback`,
    };
  }

  async createManualFeedback(input: ManualFeedbackInput): Promise<IntakeReceipt> {
    const result = await this.request<{ feedback_id: string; outcome: string }>("/api/v1/manual-feedback", {
      method: "POST",
      body: JSON.stringify({
        contract: "neoloop.source-feedback.v1",
        connector_id: "manual_owner_workbench",
        provider: "neoloop",
        transport: "manual",
        source_type: "manual_note",
        source_name: input.sourceName,
        source_record_id: input.sourceRecordId,
        source_tenant_scope: "competition-synthetic",
        source_locator: input.sourceLocator,
        source_event_at: input.sourceEventAt,
        source_timezone: input.sourceTimezone,
        channel: input.channel,
        sender_role: input.senderRole,
        original_text: input.originalText,
        authorization_scope: "synthetic_demo_only",
        attachments: [],
        data_scope: "synthetic_experiment",
      }),
    });
    return {
      feedbackId: result.feedback_id,
      disposition: result.outcome === "created" ? "inserted" : "returned_existing",
    };
  }
}

export function createUnavailableConnectorClient(): ConnectorClient {
  const unavailable = async (): Promise<never> => {
    throw new Error("连接器会话未就绪；请由认证服务注入短期请求证明。");
  };
  return {
    async workflowStatus() {
      return null;
    },
    async list() {
      return [];
    },
    create: unavailable,
    disable: unavailable,
    rotate: unavailable,
    createManualFeedback: unavailable,
  };
}

function oneTimeSecret(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return `nlp_${Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("")}`;
}

function connectorId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return `con_${Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("")}`;
}

function emptyTotals(): ConnectorSummary["totals"] {
  return { received: 0, committed: 0, replayed: 0, conflicts: 0, rejected: 0, reconciliation: 0 };
}

export function createMockConnectorClient(): ConnectorClient {
  const connectors: ConnectorSummary[] = [
    {
      id: "con_synthetic_demo",
      displayName: "合成演示 Webhook",
      provider: "synthetic-fixture",
      transport: "webhook",
      sourceType: "service_rating",
      status: "active",
      lastReceivedAt: "2026-08-11T10:16:00+08:00",
      totals: { received: 4, committed: 3, replayed: 1, conflicts: 0, rejected: 0, reconciliation: 0 },
    },
  ];

  const byId = (id: string): ConnectorSummary => {
    const connector = connectors.find((item) => item.id === id);
    if (!connector) throw new Error("连接器不存在或已移除");
    return connector;
  };

  return {
    async workflowStatus() {
      return { total: 6, enabled: 0, disabled: 6, observedAt: new Date().toISOString() };
    },
    async list() {
      return structuredClone(connectors);
    },
    async create(input) {
      const connector: ConnectorSummary = {
        id: connectorId(),
        displayName: input.displayName,
        provider: input.provider,
        transport: input.transport,
        sourceType: input.sourceType,
        status: "active",
        lastReceivedAt: null,
        totals: emptyTotals(),
      };
      connectors.push(connector);
      return {
        connector: structuredClone(connector),
        oneTimeSecret: oneTimeSecret(),
        webhookPath: `/api/v1/connectors/${connector.id}/feedback`,
      };
    },
    async disable(id) {
      const connector = byId(id);
      connector.status = "disabled";
      return structuredClone(connector);
    },
    async rotate(id) {
      const connector = byId(id);
      if (connector.status !== "active") throw new Error("只能轮换启用中的连接器密钥");
      return {
        connector: structuredClone(connector),
        oneTimeSecret: oneTimeSecret(),
        webhookPath: `/api/v1/connectors/${connector.id}/feedback`,
      };
    },
    async createManualFeedback(input) {
      if (input.dataScope !== "synthetic_experiment") throw new Error("首版只允许 synthetic_experiment");
      const suffix = Date.now().toString(36).toUpperCase();
      return { feedbackId: `SYN-MANUAL-${suffix}`, disposition: "inserted" };
    },
  };
}
