import { GatewayController } from "./controller.js";
import { FeishuOpenApiAdapter } from "./feishu-openapi-adapter.js";
import { UnconfiguredFeishuRawFeedbackAdapter } from "./feishu-adapter.js";
import { SqliteGatewayStore, type SqliteDurableStorageLike } from "./sqlite-store.js";
import { StaticBearerOwnerAuth } from "./auth.js";
import { AesGcmSecretProtector, generateConnectorSecret } from "./secrets.js";
import type { FeishuAnalysisPort, FeishuRawFeedbackAdapter } from "./types.js";

type DurableObjectIdLike = object;

interface DurableObjectStubLike {
  fetch(request: Request): Promise<Response>;
}

interface DurableObjectNamespaceLike {
  idFromName(name: string): DurableObjectIdLike;
  get(id: DurableObjectIdLike): DurableObjectStubLike;
}

interface AssetFetcherLike {
  fetch(request: Request): Promise<Response>;
}

interface GatewayEnv {
  CONNECTOR_GATEWAY?: DurableObjectNamespaceLike;
  ASSETS?: AssetFetcherLike;
  TARGET_BASE_KEY?: string;
  OWNER_API_TOKEN?: string;
  ANALYSIS_API_TOKEN?: string;
  CONNECTOR_MASTER_KEY?: string;
  FEISHU_APP_ID?: string;
  FEISHU_APP_SECRET?: string;
  FEISHU_APP_TOKEN?: string;
  FEISHU_RAW_FEEDBACK_TABLE_ID?: string;
  FEISHU_AI_AUDIT_TABLE_ID?: string;
  FEISHU_RAW_FEEDBACK_FIELD_MAP?: string;
  FEISHU_AI_AUDIT_FIELD_MAP?: string;
}

interface DurableObjectStateLike {
  readonly storage: SqliteDurableStorageLike;
  blockConcurrencyWhile<T>(callback: () => Promise<T>): Promise<T>;
}

class RealClock {
  readonly source = "real" as const;
  now(): Date {
    return new Date();
  }
}

class RandomSyntheticIds {
  nextId(namespace: string): string {
    return `SYN-${namespace.toUpperCase()}-${crypto.randomUUID().toUpperCase()}`;
  }
}

function requiredFeishuValues(env: GatewayEnv): string[] | null {
  const values = [
    env.FEISHU_APP_ID,
    env.FEISHU_APP_SECRET,
    env.FEISHU_APP_TOKEN,
    env.FEISHU_RAW_FEEDBACK_TABLE_ID,
    env.FEISHU_AI_AUDIT_TABLE_ID,
    env.FEISHU_RAW_FEEDBACK_FIELD_MAP,
    env.FEISHU_AI_AUDIT_FIELD_MAP,
  ];
  return values.every((value) => typeof value === "string" && value.length > 0)
    ? values as string[]
    : null;
}

function makeFeishuAdapter(env: GatewayEnv): {
  ingest: FeishuRawFeedbackAdapter;
  analysis?: FeishuAnalysisPort;
} {
  const values = requiredFeishuValues(env);
  if (!values) return { ingest: new UnconfiguredFeishuRawFeedbackAdapter() };
  const [
    appId,
    appSecret,
    appToken,
    rawTableId,
    auditTableId,
    rawFieldMap,
    auditFieldMap,
  ] = values;
  const adapter = new FeishuOpenApiAdapter({
    app_id: appId,
    app_secret: appSecret,
    app_token: appToken,
    raw_feedback_table_id: rawTableId,
    ai_audit_table_id: auditTableId,
    raw_feedback_fields: JSON.parse(rawFieldMap),
    ai_audit_fields: JSON.parse(auditFieldMap),
  });
  return { ingest: adapter, analysis: adapter };
}

function configurationUnavailable(): Response {
  return new Response(JSON.stringify({ error: "gateway_runtime_unconfigured" }), {
    status: 503,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

export class GatewayDurableObject {
  private controller: GatewayController | null = null;

  constructor(state: DurableObjectStateLike, env: GatewayEnv) {
    state.blockConcurrencyWhile(async () => {
      try {
        if (!env.CONNECTOR_MASTER_KEY) return;
        const store = new SqliteGatewayStore(state.storage);
        await store.initialize();
        const feishu = makeFeishuAdapter(env);
        this.controller = new GatewayController({
          store,
          feishu: feishu.ingest,
          analysis: feishu.analysis,
          ownerAuth: new StaticBearerOwnerAuth(env.OWNER_API_TOKEN ?? ""),
          analysisAuth: new StaticBearerOwnerAuth(env.ANALYSIS_API_TOKEN ?? ""),
          secretProtector: new AesGcmSecretProtector(env.CONNECTOR_MASTER_KEY),
          secretGenerator: generateConnectorSecret,
          ids: new RandomSyntheticIds(),
          clock: new RealClock(),
        });
      } catch {
        this.controller = null;
      }
    });
  }

  fetch(request: Request): Promise<Response> {
    return this.controller ? this.controller.handle(request) : Promise.resolve(configurationUnavailable());
  }
}

const worker = {
  async fetch(request: Request, env: GatewayEnv): Promise<Response> {
    const pathname = new URL(request.url).pathname;
    if (!pathname.startsWith("/api/")) {
      if (env.ASSETS) return env.ASSETS.fetch(request);
      return new Response("Not found", { status: 404 });
    }
    if (!env.CONNECTOR_GATEWAY || !env.TARGET_BASE_KEY) return configurationUnavailable();
    const id = env.CONNECTOR_GATEWAY.idFromName(`neoloop-base-v1:${env.TARGET_BASE_KEY}`);
    return env.CONNECTOR_GATEWAY.get(id).fetch(request);
  },
};

export default worker;
