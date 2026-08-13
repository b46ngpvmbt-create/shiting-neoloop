export type FeishuWorkbenchSession = {
  authorization: `Session ${string}`;
  role: "owner";
  expiresAt: string;
};

type AccessResult = { code?: string };
type FeishuSdk = {
  requestAccess?: (options: {
    appID: string;
    scopeList: string[];
    success: (result: AccessResult) => void;
    fail: (error: unknown) => void;
  }) => void;
  requestAuthCode?: (options: {
    appId: string;
    success: (result: AccessResult) => void;
    fail: (error: unknown) => void;
  }) => void;
};

declare global {
  interface Window {
    h5sdk?: { ready: (callback: () => void) => void; error?: (callback: (error: unknown) => void) => void };
    tt?: FeishuSdk;
  }
}

function exactObject(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const actual = Object.keys(value as Record<string, unknown>).sort();
  return actual.length === keys.length && actual.every((key, index) => key === [...keys].sort()[index]);
}

async function json(response: Response): Promise<unknown> {
  if (!response.ok) throw new Error(`飞书工作台会话建立失败（${response.status}）`);
  return response.json();
}

function parseSession(value: unknown): FeishuWorkbenchSession {
  if (!exactObject(value, ["authorization", "contract", "expires_at", "role"])
    || value.contract !== "neoloop.workbench-session.v1"
    || typeof value.authorization !== "string"
    || !value.authorization.startsWith("Session ")
    || value.role !== "owner"
    || typeof value.expires_at !== "string"
    || Date.parse(value.expires_at) <= Date.now()) {
    throw new Error("工作台短期会话无效");
  }
  return {
    authorization: value.authorization as `Session ${string}`,
    role: "owner",
    expiresAt: value.expires_at,
  };
}

function waitForSdk(): Promise<FeishuSdk> {
  return new Promise((resolve, reject) => {
    if (window.tt) return resolve(window.tt);
    if (!window.h5sdk) return reject(new Error("飞书 H5 SDK 未加载"));
    let settled = false;
    const finish = (sdk: FeishuSdk) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      resolve(sdk);
    };
    const fail = (message: string) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      reject(new Error(message));
    };
    const timeout = window.setTimeout(() => fail("飞书 H5 SDK 就绪超时"), 5_000);
    window.h5sdk.error?.(() => fail("飞书 H5 SDK 初始化失败"));
    window.h5sdk.ready(() => window.tt ? finish(window.tt) : fail("飞书授权 API 不可用"));
  });
}

function requestCode(sdk: FeishuSdk, appId: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const success = (result: AccessResult) => {
      const code = result.code?.trim();
      if (!code) reject(new Error("飞书未返回授权码"));
      else resolve(code);
    };
    const fail = () => reject(new Error("当前飞书用户未完成工作台授权"));
    if (sdk.requestAccess) {
      sdk.requestAccess({ appID: appId, scopeList: [], success, fail });
    } else if (sdk.requestAuthCode) {
      sdk.requestAuthCode({ appId, success, fail });
    } else {
      reject(new Error("当前飞书客户端不支持免登录授权"));
    }
  });
}

export async function createFeishuWorkbenchSession(baseUrl = window.location.origin): Promise<FeishuWorkbenchSession> {
  const config = await json(await fetch(new URL("/api/v1/session/config", baseUrl), {
    credentials: "omit",
    headers: { Accept: "application/json" },
  }));
  if (!exactObject(config, ["app_id", "contract"])
    || config.contract !== "neoloop.workbench-session-config.v1"
    || typeof config.app_id !== "string"
    || config.app_id.length < 8) {
    throw new Error("工作台会话配置无效");
  }
  const sdk = await waitForSdk();
  const code = await requestCode(sdk, config.app_id);
  const exchanged = await json(await fetch(new URL("/api/v1/session/exchange", baseUrl), {
    method: "POST",
    credentials: "omit",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ code }),
  }));
  return parseSession(exchanged);
}

export function createBrowserFeishuWorkbenchSession(
  baseUrl = window.location.origin,
): Promise<FeishuWorkbenchSession> {
  return new Promise((resolve, reject) => {
    const origin = new URL(baseUrl).origin;
    const broadcast = typeof BroadcastChannel === "function"
      ? new BroadcastChannel("neoloop-owner-oauth-v1")
      : null;
    const popup = window.open(
      "about:blank",
      "neoloop-owner-oauth",
      "popup=yes,width=560,height=720",
    );
    if (!popup) {
      reject(new Error("浏览器阻止了 Owner 登录窗口"));
      return;
    }
    let settled = false;
    let ticket = "";
    let popupClosedAt: number | null = null;
    const cleanup = () => {
      window.removeEventListener("message", onMessage);
      broadcast?.close();
      window.clearTimeout(timeout);
      window.clearInterval(resultPoll);
    };
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      callback();
    };
    const acceptMessage = (message: unknown) => {
      if (!exactObject(message, ["contract", "result"])
        || message.contract !== "neoloop.workbench-session-popup.v1") {
        if (exactObject(message, ["contract", "error"])
          && message.contract === "neoloop.workbench-session-popup.v1") {
          finish(() => reject(new Error(
            typeof message.error === "string" ? `Owner 浏览器登录失败:${message.error}` : "Owner 浏览器登录失败",
          )));
        }
        return;
      }
      finish(() => {
        try {
          resolve(parseSession(message.result));
        } catch (error) {
          reject(error);
        }
      });
    };
    const onMessage = (event: MessageEvent<unknown>) => {
      if (event.origin !== origin) return;
      acceptMessage(event.data);
    };
    if (broadcast) broadcast.onmessage = (event: MessageEvent<unknown>) => acceptMessage(event.data);
    window.addEventListener("message", onMessage);
    const timeout = window.setTimeout(() => finish(() => reject(new Error("Owner 浏览器登录超时"))), 120_000);
    let polling = false;
    const resultPoll = window.setInterval(async () => {
      if (popup.closed && popupClosedAt === null) popupClosedAt = Date.now();
      if (!ticket || polling) return;
      polling = true;
      try {
        const url = new URL("/api/v1/session/result", baseUrl);
        url.searchParams.set("ticket", ticket);
        const response = await fetch(url, { credentials: "omit", headers: { Accept: "application/json" } });
        if (response.status === 202) return;
        if (response.status === 200) {
          const value = await response.json() as unknown;
          if (!exactObject(value, ["contract", "result", "status"])
            || value.contract !== "neoloop.workbench-session-result.v1"
            || value.status !== "ready") throw new Error("工作台授权结果无效");
          finish(() => resolve(parseSession(value.result)));
          return;
        }
        if (response.status === 410 || (popupClosedAt !== null && Date.now() - popupClosedAt > 10_000)) {
          finish(() => reject(new Error("Owner 登录已取消或票据已过期")));
        }
      } catch (error) {
        if (popupClosedAt !== null && Date.now() - popupClosedAt > 10_000) {
          finish(() => reject(error instanceof Error ? error : new Error("Owner 浏览器登录失败")));
        }
      } finally {
        polling = false;
      }
    }, 500);
    void (async () => {
      try {
        const prepared = await json(await fetch(new URL("/api/v1/session/prepare", baseUrl), {
          method: "POST",
          credentials: "omit",
          headers: { Accept: "application/json" },
        }));
        if (!exactObject(prepared, ["authorization_url", "contract", "expires_at", "ticket"])
          || prepared.contract !== "neoloop.workbench-session-ticket.v1"
          || typeof prepared.ticket !== "string"
          || !/^[A-Za-z0-9_-]{32,128}$/u.test(prepared.ticket)
          || typeof prepared.authorization_url !== "string"
          || new URL(prepared.authorization_url).origin !== "https://accounts.feishu.cn"
          || typeof prepared.expires_at !== "string"
          || Date.parse(prepared.expires_at) <= Date.now()) {
          throw new Error("Owner 登录票据无效");
        }
        ticket = prepared.ticket;
        popup.location.replace(prepared.authorization_url);
      } catch (error) {
        popup.close();
        finish(() => reject(error instanceof Error ? error : new Error("Owner 浏览器登录失败")));
      }
    })();
  });
}
