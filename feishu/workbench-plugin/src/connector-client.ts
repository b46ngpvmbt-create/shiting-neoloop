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

export interface ConnectorClient {
  list(): Promise<ConnectorSummary[]>;
  create(input: CreateConnectorInput): Promise<OneTimeSecretResult>;
  disable(connectorId: string): Promise<ConnectorSummary>;
  rotate(connectorId: string): Promise<OneTimeSecretResult>;
  createManualFeedback(input: ManualFeedbackInput): Promise<IntakeReceipt>;
}

type RequestProof = () => Promise<{
  timestamp: string;
  nonce: string;
  signature: string;
}>;

export class HttpConnectorClient implements ConnectorClient {
  constructor(
    private readonly baseUrl: string,
    private readonly requestProof: RequestProof,
  ) {}

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const proof = await this.requestProof();
    const response = await fetch(new URL(path, this.baseUrl), {
      ...init,
      credentials: "omit",
      headers: {
        "Content-Type": "application/json",
        "X-NeoLoop-Timestamp": proof.timestamp,
        "X-NeoLoop-Nonce": proof.nonce,
        "X-NeoLoop-Signature": proof.signature,
        ...init.headers,
      },
    });
    if (!response.ok) {
      const requestId = response.headers.get("x-request-id") ?? "unavailable";
      throw new Error(`Connector API ${response.status}; request ${requestId}`);
    }
    return response.json() as Promise<T>;
  }

  list() {
    return this.request<ConnectorSummary[]>("/api/v1/connectors");
  }

  create(input: CreateConnectorInput) {
    return this.request<OneTimeSecretResult>("/api/v1/connectors", {
      method: "POST",
      body: JSON.stringify({
        contract: "neoloop.connector.v1",
        data_scope: "synthetic_experiment",
        field_map_version: "1",
        ...input,
      }),
    });
  }

  disable(connectorId: string) {
    return this.request<ConnectorSummary>(`/api/v1/connectors/${encodeURIComponent(connectorId)}/disable`, {
      method: "POST",
    });
  }

  rotate(connectorId: string) {
    return this.request<OneTimeSecretResult>(`/api/v1/connectors/${encodeURIComponent(connectorId)}/rotate-secret`, {
      method: "POST",
    });
  }

  createManualFeedback(input: ManualFeedbackInput) {
    return this.request<IntakeReceipt>("/api/v1/manual-feedback", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }
}

export function createUnavailableConnectorClient(): ConnectorClient {
  const unavailable = async (): Promise<never> => {
    throw new Error("连接器会话未就绪；请由认证服务注入短期请求证明。");
  };
  return {
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
