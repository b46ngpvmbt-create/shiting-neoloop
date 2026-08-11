import "./styles.css";
import {
  createMockBaseAdapter,
  createOfficialLarkBaseAdapter,
} from "./base-adapter";
import {
  createMockConnectorClient,
  createUnavailableConnectorClient,
  HttpConnectorClient,
} from "./connector-client";
import type { WorkbenchRole } from "./policy";
import { NeoLoopWorkbench } from "./workbench";

type RuntimeConnectorSession = {
  baseUrl: string;
  requestProof: () => Promise<{
    timestamp: string;
    nonce: string;
    signature: string;
  }>;
};

declare global {
  interface Window {
    __NEOLOOP_CONNECTOR_SESSION__?: RuntimeConnectorSession;
    __NEOLOOP_WORKBENCH_ROLE__?: WorkbenchRole;
  }
}

const root = document.querySelector<HTMLElement>("#app");
if (!root) throw new Error("Missing #app mount point");

const isLocalPreview = import.meta.env.DEV
  && (window.location.hostname === "127.0.0.1" || window.location.hostname === "localhost");
const role = window.__NEOLOOP_WORKBENCH_ROLE__ ?? (isLocalPreview ? "owner" : "judge");
const baseAdapter = isLocalPreview
  ? createMockBaseAdapter(role)
  : createOfficialLarkBaseAdapter(role);

// Live connector management is fail-closed. The host may inject a short-lived,
// session-only proof callback after authenticating the current Feishu user.
// Only the local Vite development preview uses synthetic in-memory data. A
// production build without an authenticated session is visibly unavailable and
// cannot perform connector mutations.
const connectorClient = window.__NEOLOOP_CONNECTOR_SESSION__
  ? new HttpConnectorClient(
      window.__NEOLOOP_CONNECTOR_SESSION__.baseUrl,
      window.__NEOLOOP_CONNECTOR_SESSION__.requestProof,
    )
  : isLocalPreview
    ? createMockConnectorClient()
    : createUnavailableConnectorClient();

const workbench = new NeoLoopWorkbench(root, baseAdapter, connectorClient, role);
window.addEventListener("keydown", (event) => workbench.handleGlobalKeydown(event));
void workbench.start();
