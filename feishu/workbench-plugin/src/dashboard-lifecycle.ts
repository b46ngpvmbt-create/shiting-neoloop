import type { IConfig, IDashboard } from "@lark-base-open/js-sdk";

export type DashboardSdkLike = Pick<IDashboard, "state" | "saveConfig" | "setRendered">;

export const WORKBENCH_DASHBOARD_CONFIG: IConfig = {
  dataConditions: [],
  customConfig: {
    schema_version: "neoloop.workbench.dashboard.v1",
    product: "石听 NeoLoop",
    data_scope: "synthetic_experiment",
  },
};

function createSaveButton(dashboard: DashboardSdkLike): HTMLButtonElement {
  const button = document.createElement("button");
  button.id = "neoloop-dashboard-save";
  button.type = "button";
  button.className = "dashboard-save-button";
  button.textContent = dashboard.state === "Create" ? "添加到仪表盘" : "保存工作台配置";
  button.setAttribute("aria-label", button.textContent);

  button.addEventListener("click", async () => {
    button.disabled = true;
    button.textContent = "正在保存…";
    try {
      const saved = await dashboard.saveConfig(WORKBENCH_DASHBOARD_CONFIG);
      if (!saved) throw new Error("dashboard_save_rejected");
      button.textContent = "已保存";
      button.dataset.saved = "true";
    } catch {
      button.disabled = false;
      button.textContent = "保存失败，请重试";
      button.dataset.saved = "false";
    }
  });
  return button;
}

/**
 * Complete the Feishu dashboard-plugin lifecycle.
 *
 * The host opens a custom plugin in Create/Config state first. Rendering the
 * workbench alone is only a preview; saveConfig is the persistent commit.
 */
export async function mountDashboardLifecycle(
  mount: HTMLElement,
  dashboard: DashboardSdkLike,
): Promise<void> {
  if (dashboard.state === "Create" || dashboard.state === "Config") {
    mount.prepend(createSaveButton(dashboard));
  }
  await dashboard.setRendered();
}
