import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import type { OwnerAuthorization } from "./types.js";

const SESSION_AUDIENCE = "neoloop-owner-workbench";
const BROWSER_STATE_AUDIENCE = "neoloop-owner-workbench-browser-oauth";
const SESSION_TTL_MS = 5 * 60 * 1000;
const BROWSER_STATE_TTL_MS = 5 * 60 * 1000;
const FEISHU_OAUTH_AUTHORIZE_URL = "https://accounts.feishu.cn/open-apis/authen/v1/authorize";
const FEISHU_OAUTH_TOKEN_URL = "https://open.feishu.cn/open-apis/authen/v2/oauth/token";
const FEISHU_USER_INFO_URL = "https://open.feishu.cn/open-apis/authen/v1/user_info";

type SessionPayload = {
  aud: typeof SESSION_AUDIENCE;
  sub: string;
  role: "owner";
  iat: number;
  exp: number;
  jti: string;
};

type BrowserStatePayload = {
  aud: typeof BROWSER_STATE_AUDIENCE;
  redirect_uri: string;
  ticket: string;
  iat: number;
  exp: number;
  jti: string;
};

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

function base64url(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function decodeBase64url(value: string): string {
  return Buffer.from(value, "base64url").toString("utf8");
}

function ownerSubject(openId: string): string {
  return createHash("sha256").update(`neoloop-workbench-owner-v1\n${openId}`, "utf8").digest("hex");
}

function sign(encodedPayload: string, signingKey: string): string {
  return createHmac("sha256", signingKey).update(encodedPayload, "utf8").digest("base64url");
}

function issueBrowserState(input: {
  signingKey: string;
  redirectUri: string;
  ticket: string;
  now: Date;
}): string {
  if (input.signingKey.length < 32) throw new Error("workbench_session_unconfigured");
  const redirect = new URL(input.redirectUri);
  if (redirect.protocol !== "https:" || redirect.pathname !== "/api/v1/session/callback") {
    throw new Error("invalid_oauth_redirect");
  }
  if (!/^[A-Za-z0-9_-]{32,128}$/u.test(input.ticket)) throw new Error("invalid_oauth_ticket");
  const issuedAt = input.now.getTime();
  const payload: BrowserStatePayload = {
    aud: BROWSER_STATE_AUDIENCE,
    redirect_uri: redirect.toString(),
    ticket: input.ticket,
    iat: issuedAt,
    exp: issuedAt + BROWSER_STATE_TTL_MS,
    jti: crypto.randomUUID(),
  };
  const encoded = base64url(JSON.stringify(payload));
  return `${encoded}.${sign(encoded, input.signingKey)}`;
}

function parseBrowserState(input: {
  state: string;
  signingKey: string;
  redirectUri: string;
  now: Date;
}): BrowserStatePayload | null {
  const [encoded, suppliedSignature, extra] = input.state.split(".");
  if (!encoded || !suppliedSignature || extra !== undefined || input.signingKey.length < 32) return null;
  const expected = Buffer.from(sign(encoded, input.signingKey), "utf8");
  const supplied = Buffer.from(suppliedSignature, "utf8");
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return null;
  try {
    const payload = JSON.parse(decodeBase64url(encoded)) as Partial<BrowserStatePayload>;
    const valid = payload.aud === BROWSER_STATE_AUDIENCE &&
      payload.redirect_uri === input.redirectUri &&
      typeof payload.ticket === "string" &&
      /^[A-Za-z0-9_-]{32,128}$/u.test(payload.ticket) &&
      Number.isSafeInteger(payload.iat) &&
      Number.isSafeInteger(payload.exp) &&
      payload.exp! - payload.iat! === BROWSER_STATE_TTL_MS &&
      input.now.getTime() >= payload.iat! - 30_000 &&
      input.now.getTime() < payload.exp! &&
      typeof payload.jti === "string" &&
      payload.jti.length >= 16;
    return valid ? payload as BrowserStatePayload : null;
  } catch {
    return null;
  }
}

export function issueWorkbenchSession(input: {
  signingKey: string;
  ownerOpenId: string;
  now: Date;
}): string {
  if (input.signingKey.length < 32 || input.ownerOpenId.length < 3) {
    throw new Error("workbench_session_unconfigured");
  }
  const issuedAt = input.now.getTime();
  const payload: SessionPayload = {
    aud: SESSION_AUDIENCE,
    sub: ownerSubject(input.ownerOpenId),
    role: "owner",
    iat: issuedAt,
    exp: issuedAt + SESSION_TTL_MS,
    jti: crypto.randomUUID(),
  };
  const encoded = base64url(JSON.stringify(payload));
  return `${encoded}.${sign(encoded, input.signingKey)}`;
}

export function verifyWorkbenchSession(token: string, signingKey: string, now: Date): OwnerAuthorization {
  if (signingKey.length < 32) return { ok: false, code: "owner_auth_unconfigured" };
  const [encoded, suppliedSignature, extra] = token.split(".");
  if (!encoded || !suppliedSignature || extra !== undefined) {
    return { ok: false, code: "owner_unauthorized" };
  }
  const expected = Buffer.from(sign(encoded, signingKey), "utf8");
  const supplied = Buffer.from(suppliedSignature, "utf8");
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) {
    return { ok: false, code: "owner_unauthorized" };
  }
  try {
    const payload = JSON.parse(decodeBase64url(encoded)) as Partial<SessionPayload>;
    if (
      payload.aud !== SESSION_AUDIENCE ||
      payload.role !== "owner" ||
      typeof payload.sub !== "string" ||
      !/^[0-9a-f]{64}$/u.test(payload.sub) ||
      !Number.isSafeInteger(payload.iat) ||
      !Number.isSafeInteger(payload.exp) ||
      typeof payload.jti !== "string" ||
      payload.jti.length < 16 ||
      payload.exp! - payload.iat! !== SESSION_TTL_MS ||
      now.getTime() < payload.iat! - 30_000 ||
      now.getTime() >= payload.exp!
    ) return { ok: false, code: "owner_unauthorized" };
    return { ok: true, subject: "workbench-owner" };
  } catch {
    return { ok: false, code: "owner_unauthorized" };
  }
}

export class FeishuWorkbenchSessionService {
  constructor(private readonly config: {
    appId: string;
    appSecret: string;
    ownerOpenId: string;
    sessionSigningKey: string;
    now: () => Date;
    fetch?: FetchLike;
  }) {}

  publicConfig(): { contract: "neoloop.workbench-session-config.v1"; app_id: string } {
    if (!this.isConfigured()) throw new Error("workbench_session_unconfigured");
    return { contract: "neoloop.workbench-session-config.v1", app_id: this.config.appId };
  }

  browserAuthorizationUrl(redirectUri: string, ticket = crypto.randomUUID().replaceAll("-", "")): string {
    if (!this.isConfigured()) throw new Error("workbench_session_unconfigured");
    const state = issueBrowserState({
      signingKey: this.config.sessionSigningKey,
      redirectUri,
      ticket,
      now: this.config.now(),
    });
    const url = new URL(FEISHU_OAUTH_AUTHORIZE_URL);
    url.searchParams.set("client_id", this.config.appId);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("state", state);
    return url.toString();
  }

  verifyBrowserCallback(state: string, redirectUri: string): boolean {
    return this.browserCallbackTicket(state, redirectUri) !== null;
  }

  browserCallbackTicket(state: string, redirectUri: string): string | null {
    return parseBrowserState({
      state,
      signingKey: this.config.sessionSigningKey,
      redirectUri,
      now: this.config.now(),
    })?.ticket ?? null;
  }

  async exchange(code: string, redirectUri?: string): Promise<{
    contract: "neoloop.workbench-session.v1";
    authorization: string;
    expires_at: string;
    role: "owner";
  }> {
    if (!this.isConfigured()) throw new Error("workbench_session_unconfigured");
    if (!/^[A-Za-z0-9._~-]{16,2048}$/u.test(code)) throw new Error("invalid_authorization_code");
    const fetcher = this.config.fetch ?? fetch;
    const tokenResponse = await fetcher(FEISHU_OAUTH_TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        grant_type: "authorization_code",
        client_id: this.config.appId,
        client_secret: this.config.appSecret,
        code,
        ...(redirectUri ? { redirect_uri: redirectUri } : {}),
      }),
    });
    const tokenPayload = await tokenResponse.json() as Record<string, unknown>;
    const userToken = typeof tokenPayload.access_token === "string" ? tokenPayload.access_token : null;
    if (!tokenResponse.ok || (tokenPayload.code !== undefined && tokenPayload.code !== 0) || !userToken) {
      const upstreamCode = Number.isSafeInteger(tokenPayload.code) ? String(tokenPayload.code) : "http";
      throw new Error(`feishu_code_exchange_failed_${upstreamCode}`);
    }

    const userResponse = await fetcher(FEISHU_USER_INFO_URL, {
      headers: {
        authorization: `Bearer ${userToken}`,
        "content-type": "application/json; charset=utf-8",
      },
    });
    const userPayload = await userResponse.json() as {
      code?: unknown;
      data?: { open_id?: unknown };
    };
    if (
      !userResponse.ok ||
      userPayload.code !== 0 ||
      userPayload.data?.open_id !== this.config.ownerOpenId
    ) {
      const upstreamCode = Number.isSafeInteger(userPayload.code) ? String(userPayload.code) : "http";
      if (!userResponse.ok || userPayload.code !== 0) throw new Error(`feishu_user_info_failed_${upstreamCode}`);
      throw new Error("workbench_owner_not_allowed");
    }

    const now = this.config.now();
    const token = issueWorkbenchSession({
      signingKey: this.config.sessionSigningKey,
      ownerOpenId: this.config.ownerOpenId,
      now,
    });
    return {
      contract: "neoloop.workbench-session.v1",
      authorization: `Session ${token}`,
      expires_at: new Date(now.getTime() + SESSION_TTL_MS).toISOString(),
      role: "owner",
    };
  }

  private isConfigured(): boolean {
    return this.config.appId.length >= 8 &&
      this.config.appSecret.length >= 16 &&
      this.config.ownerOpenId.length >= 3 &&
      this.config.sessionSigningKey.length >= 32;
  }
}
