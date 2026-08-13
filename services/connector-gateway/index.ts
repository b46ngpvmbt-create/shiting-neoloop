import { GatewayController } from "./controller.js";
import { FeishuOpenApiAdapter } from "./feishu-openapi-adapter.js";
import { UnconfiguredFeishuRawFeedbackAdapter } from "./feishu-adapter.js";
import { SqliteGatewayStore, type SqliteDurableStorageLike } from "./sqlite-store.js";
import { CompositeOwnerAuth, StaticBearerOwnerAuth, WorkbenchSessionOwnerAuth } from "./auth.js";
import { AesGcmSecretProtector, generateConnectorSecret } from "./secrets.js";
import { FeishuWorkbenchSessionService } from "./session.js";
import type { FeishuAnalysisPort, FeishuRawFeedbackAdapter, FeishuWorkflowPort } from "./types.js";

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
  PUBLIC_ORIGIN?: string;
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
  FEISHU_OWNER_OPEN_ID?: string;
  WORKBENCH_SESSION_SIGNING_KEY?: string;
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
  workflow?: FeishuWorkflowPort;
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
  return { ingest: adapter, analysis: adapter, workflow: adapter };
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

export function popupResponse(
  origin: string,
  payload: Record<string, unknown>,
  status = 200,
): Response {
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const nonce = crypto.randomUUID().replaceAll("-", "");
  const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>石听 NeoLoop Owner 登录</title></head><body><p>正在返回石听 NeoLoop 工作台…</p><script nonce="${nonce}">const raw="${encoded}".replaceAll("-","+").replaceAll("_","/");const bytes=Uint8Array.from(atob(raw),c=>c.charCodeAt(0));const message=JSON.parse(new TextDecoder().decode(bytes));if(typeof BroadcastChannel==="function"){const channel=new BroadcastChannel("neoloop-owner-oauth-v1");channel.postMessage(message);channel.close();}if(window.opener)window.opener.postMessage(message,${JSON.stringify(origin)});window.setTimeout(()=>window.close(),700);</script></body></html>`;
  return new Response(html, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "referrer-policy": "no-referrer",
      "content-security-policy": `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'none'; base-uri 'none'; frame-ancestors 'none'`,
    },
  });
}

export class GatewayDurableObject {
  private controller: GatewayController | null = null;
  private store: SqliteGatewayStore | null = null;

  constructor(state: DurableObjectStateLike, env: GatewayEnv) {
    state.blockConcurrencyWhile(async () => {
      try {
        if (!env.CONNECTOR_MASTER_KEY) return;
        const store = new SqliteGatewayStore(state.storage);
        await store.initialize();
        this.store = store;
        const feishu = makeFeishuAdapter(env);
        this.controller = new GatewayController({
          store,
          feishu: feishu.ingest,
          analysis: feishu.analysis,
          workflow: feishu.workflow,
          ownerAuth: new CompositeOwnerAuth([
            new StaticBearerOwnerAuth(env.OWNER_API_TOKEN ?? ""),
            new WorkbenchSessionOwnerAuth(env.WORKBENCH_SESSION_SIGNING_KEY ?? "", new RealClock()),
          ]),
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

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/internal/session/")) return this.handleSessionTicket(request, url);
    return this.controller ? this.controller.handle(request) : configurationUnavailable();
  }

  private async handleSessionTicket(request: Request, url: URL): Promise<Response> {
    if (!this.store) return configurationUnavailable();
    const now = new Date();
    if (url.pathname === "/internal/session/result") {
      if (request.method !== "GET") return Response.json({ error: "method_not_allowed" }, { status: 405 });
      const ticket = url.searchParams.get("ticket") ?? "";
      if (!/^[A-Za-z0-9_-]{32,128}$/u.test(ticket)) return Response.json({ error: "invalid_oauth_ticket" }, { status: 400 });
      const result = await this.store.consumeWorkbenchOauthTicket(ticket, now);
      if (result.status === "missing") {
        return Response.json({ contract: "neoloop.workbench-session-result.v1", status: "missing" }, {
          status: 410,
          headers: { "cache-control": "no-store" },
        });
      }
      if (result.status === "pending") {
        return Response.json({ contract: "neoloop.workbench-session-result.v1", status: "pending" }, {
          status: 202,
          headers: { "cache-control": "no-store" },
        });
      }
      return Response.json({ contract: "neoloop.workbench-session-result.v1", status: "ready", result: result.result }, {
        headers: { "cache-control": "no-store" },
      });
    }
    if (request.method !== "POST" || !(request.headers.get("content-type") ?? "").startsWith("application/json")) {
      return Response.json({ error: "invalid_internal_session_request" }, { status: 400 });
    }
    const body = await request.json() as Record<string, unknown>;
    const ticket = typeof body.ticket === "string" ? body.ticket : "";
    if (!/^[A-Za-z0-9_-]{32,128}$/u.test(ticket)) return Response.json({ error: "invalid_oauth_ticket" }, { status: 400 });
    if (url.pathname === "/internal/session/prepare") {
      if (typeof body.expires_at !== "string" || !Number.isFinite(Date.parse(body.expires_at))) {
        return Response.json({ error: "invalid_oauth_expiry" }, { status: 400 });
      }
      const inserted = await this.store.prepareWorkbenchOauthTicket(ticket, new Date(body.expires_at), now);
      return inserted ? Response.json({ ok: true }) : Response.json({ error: "oauth_ticket_conflict" }, { status: 409 });
    }
    if (url.pathname === "/internal/session/complete") {
      if (!body.result || typeof body.result !== "object" || Array.isArray(body.result)) {
        return Response.json({ error: "invalid_oauth_result" }, { status: 400 });
      }
      const completed = await this.store.completeWorkbenchOauthTicket(ticket, body.result as Record<string, unknown>, now);
      return completed ? Response.json({ ok: true }) : Response.json({ error: "oauth_ticket_unavailable" }, { status: 410 });
    }
    return new Response("Not found", { status: 404 });
  }
}

function gatewayStub(env: GatewayEnv): DurableObjectStubLike | null {
  if (!env.CONNECTOR_GATEWAY || !env.TARGET_BASE_KEY) return null;
  const id = env.CONNECTOR_GATEWAY.idFromName(`neoloop-base-v1:${env.TARGET_BASE_KEY}`);
  return env.CONNECTOR_GATEWAY.get(id);
}

function browserSessionOrigin(requestUrl: URL, configuredOrigin: string | undefined): string | null {
  if (configuredOrigin === undefined) return requestUrl.origin;
  if (configuredOrigin !== configuredOrigin.trim()) return null;
  try {
    const parsed = new URL(configuredOrigin);
    if (
      parsed.protocol !== "https:"
      || parsed.username !== ""
      || parsed.password !== ""
      || parsed.pathname !== "/"
      || parsed.search !== ""
      || parsed.hash !== ""
      || configuredOrigin !== parsed.origin
    ) return null;
    return parsed.origin;
  } catch {
    return null;
  }
}

const worker = {
  async fetch(request: Request, env: GatewayEnv): Promise<Response> {
    const requestUrl = new URL(request.url);
    const pathname = requestUrl.pathname;
    const sessionPaths = new Set([
      "/api/v1/session/config",
      "/api/v1/session/exchange",
      "/api/v1/session/prepare",
      "/api/v1/session/result",
      "/api/v1/session/start",
      "/api/v1/session/callback",
    ]);
    if (sessionPaths.has(pathname)) {
      const publicOrigin = browserSessionOrigin(requestUrl, env.PUBLIC_ORIGIN);
      if (!publicOrigin) return Response.json({ error: "public_origin_invalid" }, {
        status: 503,
        headers: { "cache-control": "no-store" },
      });
      const service = new FeishuWorkbenchSessionService({
        appId: env.FEISHU_APP_ID ?? "",
        appSecret: env.FEISHU_APP_SECRET ?? "",
        ownerOpenId: env.FEISHU_OWNER_OPEN_ID ?? "",
        sessionSigningKey: env.WORKBENCH_SESSION_SIGNING_KEY ?? "",
        now: () => new Date(),
      });
      try {
        const redirectUri = new URL("/api/v1/session/callback", publicOrigin).toString();
        if (pathname === "/api/v1/session/config") {
          if (request.method !== "GET") return new Response(JSON.stringify({ error: "method_not_allowed" }), { status: 405 });
          return Response.json(service.publicConfig(), { headers: { "cache-control": "no-store" } });
        }
        if (pathname === "/api/v1/session/prepare") {
          if (request.method !== "POST") return Response.json({ error: "method_not_allowed" }, { status: 405 });
          const stub = gatewayStub(env);
          if (!stub) return configurationUnavailable();
          const ticket = `${crypto.randomUUID().replaceAll("-", "")}${crypto.randomUUID().replaceAll("-", "")}`;
          const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
          const prepared = await stub.fetch(new Request(new URL("/internal/session/prepare", publicOrigin), {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ ticket, expires_at: expiresAt }),
          }));
          if (!prepared.ok) return configurationUnavailable();
          return Response.json({
            contract: "neoloop.workbench-session-ticket.v1",
            ticket,
            authorization_url: service.browserAuthorizationUrl(redirectUri, ticket),
            expires_at: expiresAt,
          }, { headers: { "cache-control": "no-store" } });
        }
        if (pathname === "/api/v1/session/result") {
          if (request.method !== "GET") return Response.json({ error: "method_not_allowed" }, { status: 405 });
          const stub = gatewayStub(env);
          if (!stub) return configurationUnavailable();
          const ticket = requestUrl.searchParams.get("ticket") ?? "";
          return stub.fetch(new Request(new URL(`/internal/session/result?ticket=${encodeURIComponent(ticket)}`, publicOrigin)));
        }
        if (pathname === "/api/v1/session/start") {
          if (request.method !== "GET") return new Response(JSON.stringify({ error: "method_not_allowed" }), { status: 405 });
          const stub = gatewayStub(env);
          if (!stub) return configurationUnavailable();
          const ticket = `${crypto.randomUUID().replaceAll("-", "")}${crypto.randomUUID().replaceAll("-", "")}`;
          const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
          const prepared = await stub.fetch(new Request(new URL("/internal/session/prepare", publicOrigin), {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ ticket, expires_at: expiresAt }),
          }));
          if (!prepared.ok) return configurationUnavailable();
          return new Response(null, {
            status: 302,
            headers: {
              location: service.browserAuthorizationUrl(redirectUri, ticket),
              "cache-control": "no-store",
              "referrer-policy": "no-referrer",
            },
          });
        }
        if (pathname === "/api/v1/session/callback") {
          if (request.method !== "GET") return new Response(JSON.stringify({ error: "method_not_allowed" }), { status: 405 });
          const code = requestUrl.searchParams.get("code") ?? "";
          const state = requestUrl.searchParams.get("state") ?? "";
          const ticket = service.browserCallbackTicket(state, redirectUri);
          if (!ticket) throw new Error("invalid_oauth_state");
          const result = await service.exchange(code, redirectUri);
          const stub = gatewayStub(env);
          if (!stub) throw new Error("workbench_session_unconfigured");
          const completed = await stub.fetch(new Request(new URL("/internal/session/complete", publicOrigin), {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ ticket, result }),
          }));
          if (!completed.ok) throw new Error("oauth_ticket_unavailable");
          return popupResponse(publicOrigin, {
            contract: "neoloop.workbench-session-popup.v1",
            status: "complete",
          });
        }
        if (request.method !== "POST") return new Response(JSON.stringify({ error: "method_not_allowed" }), { status: 405 });
        if (!(request.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) {
          return new Response(JSON.stringify({ error: "unsupported_media_type" }), { status: 415 });
        }
        const raw = await request.text();
        if (Buffer.byteLength(raw, "utf8") > 4096) return new Response(JSON.stringify({ error: "payload_too_large" }), { status: 413 });
        const body = JSON.parse(raw) as Record<string, unknown>;
        if (JSON.stringify(Object.keys(body).sort()) !== JSON.stringify(["code"])) {
          return new Response(JSON.stringify({ error: "invalid_session_request" }), { status: 400 });
        }
        const result = await service.exchange(typeof body.code === "string" ? body.code : "");
        return Response.json(result, { headers: { "cache-control": "no-store" } });
      } catch (error) {
        const code = error instanceof Error ? error.message : "workbench_session_failed";
        if (pathname === "/api/v1/session/callback") {
          console.error(JSON.stringify({
            event: "workbench_session_callback_failed",
            code,
          }));
          return popupResponse(publicOrigin, {
            contract: "neoloop.workbench-session-popup.v1",
            error: code === "workbench_owner_not_allowed"
              ? "owner_not_allowed"
              : /^(feishu_code_exchange_failed|feishu_user_info_failed)(?:_[A-Za-z0-9_-]+)?$/u.test(code)
                ? code
                : "oauth_failed",
          }, 200);
        }
        const status = code === "workbench_owner_not_allowed" ? 403 : code === "workbench_session_unconfigured" ? 503 : 401;
        return new Response(JSON.stringify({ error: code }), {
          status,
          headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
        });
      }
    }
    if (!pathname.startsWith("/api/")) {
      if (env.ASSETS) {
        const asset = await env.ASSETS.fetch(request);
        const headers = new Headers(asset.headers);
        headers.set("cache-control", "no-store, max-age=0");
        return new Response(asset.body, { status: asset.status, statusText: asset.statusText, headers });
      }
      return new Response("Not found", { status: 404 });
    }
    const stub = gatewayStub(env);
    return stub ? stub.fetch(request) : configurationUnavailable();
  },
};

export default worker;
