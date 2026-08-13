import "./styles.css";
import {
  createMockBaseAdapter,
  createOfficialLarkBaseAdapter,
  createPublicPreviewBaseAdapter,
} from "./base-adapter";
import {
  createMockConnectorClient,
  createUnavailableConnectorClient,
  HttpConnectorClient,
} from "./connector-client";
import { bitable } from "@lark-base-open/js-sdk";
import { mountDashboardLifecycle } from "./dashboard-lifecycle";
import {
  createBrowserFeishuWorkbenchSession,
  createFeishuWorkbenchSession,
  type FeishuWorkbenchSession,
} from "./feishu-session";
import { NeoLoopWorkbench } from "./workbench";

const root = document.querySelector<HTMLElement>("#app");
if (!root) throw new Error("Missing #app mount point");
const mount = root;

const isLocalPreview = import.meta.env.DEV
  && (window.location.hostname === "127.0.0.1" || window.location.hostname === "localhost");
const isLikelyFeishuHost = window.self !== window.top || Boolean(window.tt);

async function loadFeishuH5Sdk(): Promise<void> {
  if (window.tt || !isLikelyFeishuHost) return;
  await new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://lf-scm-cn.feishucdn.com/lark/op/h5-js-sdk-1.5.44.js";
    script.addEventListener("load", () => resolve(), { once: true });
    script.addEventListener("error", () => reject(new Error("SDK 未加载")), { once: true });
    document.head.append(script);
  });
}

let activeWorkbench: NeoLoopWorkbench | null = null;
window.addEventListener("keydown", (event) => activeWorkbench?.handleGlobalKeydown(event));

function sessionFailureCode(error: unknown): string {
  const message = error instanceof Error ? error.message : "未知错误";
  return message.includes("SDK 未加载") ? "sdk_missing"
    : message.includes("SDK 就绪超时") ? "sdk_timeout"
      : message.includes("授权 API 不可用") ? "auth_api_unavailable"
        : message.includes("未完成工作台授权") ? "auth_code_rejected"
          : message.includes("登录窗口") ? "browser_oauth_unavailable"
            : message.includes("Owner 浏览器登录失败:") ? message.split(":").at(-1) ?? "session_unavailable"
            : message.match(/\((401|403|503)\)/u)?.[1] ? `exchange_${message.match(/\((401|403|503)\)/u)?.[1]}`
              : "session_unavailable";
}

async function bootstrap(): Promise<void> {
  if (isLocalPreview) {
    const workbench = new NeoLoopWorkbench(mount, createMockBaseAdapter("owner"), createMockConnectorClient(), "owner");
    activeWorkbench = workbench;
    await workbench.start();
    return;
  }

  const sessionHost = document.createElement("div");
  const workbenchHost = document.createElement("div");
  mount.replaceChildren(sessionHost, workbenchHost);

  const renderWorkbench = async (
    session: FeishuWorkbenchSession | null,
    sessionState: string,
  ): Promise<void> => {
    const role = session?.role ?? "judge";
    const connectorClient = session
      ? new HttpConnectorClient(window.location.origin, () => session.authorization)
      : createUnavailableConnectorClient();
    workbenchHost.replaceChildren();
    const baseAdapter = session ? createOfficialLarkBaseAdapter(role) : createPublicPreviewBaseAdapter("judge");
    const workbench = new NeoLoopWorkbench(workbenchHost, baseAdapter, connectorClient, role);
    activeWorkbench = workbench;
    await workbench.start();

    const sessionNotice = document.createElement("div");
    sessionNotice.className = `owner-session-notice ${session ? "ready" : "blocked"}`;
    const label = document.createElement("span");
    label.textContent = session
      ? "Owner 短期会话已建立·连接器操作已开放"
      : `Owner 短期会话未建立·连接器保持只读·${sessionState}`;
    sessionNotice.append(label);
    if (!session) {
      const login = document.createElement("button");
      login.type = "button";
      login.textContent = "验证 Owner 身份";
      login.addEventListener("click", async () => {
        login.disabled = true;
        login.textContent = "等待飞书授权…";
        try {
          const browserSession = await createBrowserFeishuWorkbenchSession();
          await renderWorkbench(browserSession, "owner_session_ready");
        } catch (error) {
          login.disabled = false;
          login.textContent = "重新验证 Owner 身份";
          label.textContent = `Owner 短期会话未建立·连接器保持只读·${sessionFailureCode(error)}`;
        }
      });
      sessionNotice.append(login);
    }
    sessionHost.replaceChildren(sessionNotice);
  };

  let automaticSession: FeishuWorkbenchSession | null = null;
  let sessionState = "browser_oauth_required";
  if (isLikelyFeishuHost) {
    try {
      await loadFeishuH5Sdk();
    } catch (error) {
      sessionState = sessionFailureCode(error);
    }
  }
  if (window.tt) {
    try {
      automaticSession = await createFeishuWorkbenchSession();
      sessionState = "owner_session_ready";
    } catch (error) {
      sessionState = sessionFailureCode(error);
    }
  }
  await renderWorkbench(automaticSession, sessionState);
  await mountDashboardLifecycle(mount, bitable.dashboard);
}

void bootstrap();
