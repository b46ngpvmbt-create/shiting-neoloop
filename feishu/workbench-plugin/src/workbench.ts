import type { WorkbenchBaseAdapter, BaseContext } from "./base-adapter";
import type {
  ConnectorClient,
  ConnectorSummary,
  OneTimeSecretResult,
} from "./connector-client";
import {
  applyWorkbenchFilters,
  AUDIT_SAMPLES,
  BASE_TABLES,
  canPerform,
  CASE_SAMPLES,
  IMPROVEMENT_SAMPLES,
  PLATFORM_CARDS,
  ROLE_LABELS,
  SAMPLE_FEEDBACK,
  STATUS_METRICS,
  WORKBENCH_TABS,
  WORK_ORDER_SAMPLES,
  type FeedbackItem,
  type TabKey,
  type WorkbenchFilters,
  type WorkbenchMode,
  type WorkbenchRole,
} from "./policy";

type ModalState =
  | { kind: "connector" }
  | { kind: "manual" }
  | { kind: "secret"; result: OneTimeSecretResult }
  | null;

type WorkbenchState = {
  tab: TabKey;
  role: WorkbenchRole;
  mode: WorkbenchMode;
  filters: WorkbenchFilters;
  selectedFeedbackId: string;
  connectors: ConnectorSummary[];
  context: BaseContext | null;
  modal: ModalState;
  busy: boolean;
  notice: string;
  noticeTone: "neutral" | "success" | "error";
};

const sourceTypes = [
  ["all", "全部来源"],
  ["service_rating", "服务评价"],
  ["customer_group", "客户群"],
  ["partner_feedback", "合作方"],
  ["hotline_transcript", "热线转录"],
] as const;

const riskOptions = ["all", "P0", "P1", "P2", "P3"] as const;
const statusOptions = ["all", "待分诊", "人工处理", "已建案", "已忽略"] as const;

function escapeHtml(value: unknown): string {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  return `${(value / 1024).toFixed(1)} KB`;
}

function formatTime(value: string | null): string {
  if (!value) return "尚未接收";
  return value.replace("T", " ").slice(0, 16);
}

function option(value: string, label: string, selected: string): string {
  return `<option value="${escapeHtml(value)}"${value === selected ? " selected" : ""}>${escapeHtml(label)}</option>`;
}

function buttonState(allowed: boolean, reason: string): string {
  return allowed ? "" : ` disabled aria-disabled="true" title="${escapeHtml(reason)}"`;
}

export class NeoLoopWorkbench {
  private state: WorkbenchState;
  private modalReturnFocusSelector: string | null = null;

  constructor(
    private readonly root: HTMLElement,
    private readonly base: WorkbenchBaseAdapter,
    private readonly connectors: ConnectorClient,
    initialRole: WorkbenchRole = "owner",
  ) {
    this.state = {
      tab: "overview",
      role: initialRole,
      mode: "daily",
      filters: {
        mode: "daily",
        source: "all",
        timeRange: "all",
        risk: "all",
        status: "all",
        query: "",
      },
      selectedFeedbackId: SAMPLE_FEEDBACK[0]?.id ?? "",
      connectors: [],
      context: null,
      modal: null,
      busy: false,
      notice: "工作台仅展示和写入 synthetic_experiment 合成数据。",
      noticeTone: "neutral",
    };
  }

  async start(): Promise<void> {
    this.render();
    try {
      const [context, connectorList] = await Promise.all([
        this.base.getContext(),
        this.connectors.list(),
      ]);
      this.state.context = context;
      this.state.role = context.role;
      this.state.connectors = connectorList;
      this.state.notice = context.mode === "lark"
        ? "已连接当前 Base；所有写操作仍经过角色与合成数据边界。"
        : "当前为独立合成预览；接入飞书 SDK 后会读回真实 Base 元数据。";
      this.render();
    } catch (error) {
      this.setNotice(error instanceof Error ? error.message : "工作台初始化失败", "error");
    }
  }

  private visibleFeedback(): FeedbackItem[] {
    return applyWorkbenchFilters(SAMPLE_FEEDBACK, this.state.filters);
  }

  private selectedFeedback(): FeedbackItem | null {
    const visible = this.visibleFeedback();
    return visible.find((item) => item.id === this.state.selectedFeedbackId) ?? visible[0] ?? null;
  }

  private setNotice(message: string, tone: WorkbenchState["noticeTone"]): void {
    this.state.notice = message;
    this.state.noticeTone = tone;
    this.render();
  }

  private render(): void {
    const selected = this.selectedFeedback();
    if (selected && selected.id !== this.state.selectedFeedbackId) {
      this.state.selectedFeedbackId = selected.id;
    }
    this.root.innerHTML = `
      <div class="workbench-shell" data-mode="${this.state.mode}">
        ${this.renderHeader()}
        ${this.renderTabs()}
        ${this.renderFilters()}
        <div class="workbench-layout">
          <main id="workbench-main" class="workbench-main" tabindex="-1">
            ${this.renderCurrentTab()}
          </main>
          ${this.renderTableRail()}
        </div>
        <div class="live-notice ${this.state.noticeTone}" aria-live="polite" aria-atomic="true">
          <span aria-hidden="true">${this.state.noticeTone === "error" ? "!" : "•"}</span>
          ${escapeHtml(this.state.notice)}
        </div>
        ${this.renderModal()}
      </div>
    `;
    this.root.setAttribute("aria-busy", String(this.state.busy));
    this.bindEvents();
  }

  private renderHeader(): string {
    const connected = this.state.context?.mode === "lark";
    return `
      <header class="workbench-header">
        <div class="brand-lockup">
          <span class="brand-mark" aria-hidden="true">N</span>
          <span><b>石听 NeoLoop</b><small>飞书多维表格工作台</small></span>
        </div>
        <div class="header-boundaries" aria-label="运行边界">
          <span class="scope-pill"><i aria-hidden="true"></i>synthetic_experiment</span>
          <span class="workflow-pill"><b>6</b> 条工作流 <em>1 启用 / 5 停用</em></span>
          <span class="connection-pill ${connected ? "connected" : "preview"}">${connected ? "Base 已连接" : "合成预览"}</span>
        </div>
        <div class="header-controls">
          <div class="mode-switch" role="group" aria-label="工作台模式">
            <button type="button" data-mode="daily" aria-pressed="${this.state.mode === "daily"}">日常运营</button>
            <button type="button" data-mode="demo" aria-pressed="${this.state.mode === "demo"}">比赛演示</button>
          </div>
          <label class="role-preview">角色
            <select id="role-select" aria-label="角色预览">
              ${Object.entries(ROLE_LABELS).map(([value, label]) => option(value, label, this.state.role)).join("")}
            </select>
          </label>
        </div>
      </header>
    `;
  }

  private renderTabs(): string {
    return `
      <nav class="workbench-tabs" role="tablist" aria-label="工作台功能">
        ${WORKBENCH_TABS.map((tab, index) => `
          <button
            type="button"
            id="tab-${tab.key}"
            class="${tab.key === this.state.tab ? "active" : ""}"
            role="tab"
            aria-selected="${tab.key === this.state.tab}"
            aria-controls="panel-${tab.key}"
            tabindex="${tab.key === this.state.tab ? "0" : "-1"}"
            data-tab="${tab.key}"
          ><span>${String(index + 1).padStart(2, "0")}</span>${tab.label}</button>
        `).join("")}
      </nav>
    `;
  }

  private renderFilters(): string {
    return `
      <section class="global-filterbar" aria-label="全局筛选器">
        <form id="search-form" class="global-search" role="search">
          <label for="global-search-input" class="sr-only">搜索 ID、反馈、来源或正文</label>
          <span aria-hidden="true">⌕</span>
          <input id="global-search-input" name="query" value="${escapeHtml(this.state.filters.query)}" placeholder="搜索 ID、反馈、来源或正文" autocomplete="off" />
          <button type="submit">搜索</button>
        </form>
        <div class="filter-selects">
          <label>来源
            <select data-filter="source">
              ${sourceTypes.map(([value, label]) => option(value, label, this.state.filters.source)).join("")}
            </select>
          </label>
          <label>时间
            <select data-filter="timeRange">
              ${option("all", "全部时间", this.state.filters.timeRange)}
              ${option("today", "今天", this.state.filters.timeRange)}
              ${option("7d", "近 7 天", this.state.filters.timeRange)}
              ${option("30d", "近 30 天", this.state.filters.timeRange)}
            </select>
          </label>
          <label>风险
            <select data-filter="risk">
              ${riskOptions.map((value) => option(value, value === "all" ? "全部风险" : value, this.state.filters.risk)).join("")}
            </select>
          </label>
          <label>状态
            <select data-filter="status">
              ${statusOptions.map((value) => option(value, value === "all" ? "全部状态" : value, this.state.filters.status)).join("")}
            </select>
          </label>
        </div>
        <button class="clear-filters" type="button" data-action="clear-filters">清除筛选</button>
      </section>
    `;
  }

  private renderCurrentTab(): string {
    const panel = this.state.tab === "overview"
      ? this.renderOverview()
      : this.state.tab === "intake-cases"
        ? this.renderIntakeCases()
        : this.state.tab === "sla"
          ? this.renderSla()
          : this.state.tab === "improvement"
            ? this.renderImprovement()
            : this.state.tab === "ai-audit"
              ? this.renderAiAudit()
              : this.renderMasterData();
    return `<div id="panel-${this.state.tab}" role="tabpanel" aria-labelledby="tab-${this.state.tab}">${panel}</div>`;
  }

  private renderOverview(): string {
    const visible = this.visibleFeedback();
    const sourceCounts = sourceTypes.slice(1).map(([value, label]) => ({
      label,
      value: SAMPLE_FEEDBACK.filter((item) => item.sourceType === value).length,
    })).filter((item) => item.value > 0);
    return `
      <section class="section-heading overview-heading">
        <div><span>OWNER-FIRST WORKBENCH</span><h1>一屏看清反馈闭环</h1></div>
        <p>从来源接入、案件协同、SLA 到 AI 审计，全部沿用同一套 10 表数据关系。</p>
      </section>
      <section class="metric-grid" aria-label="关键指标">
        ${STATUS_METRICS.map((metric) => `
          <article class="metric-card ${metric.tone}">
            <span>${escapeHtml(metric.label)}</span>
            <strong>${metric.key === "feedback" ? visible.length : escapeHtml(metric.value)}</strong>
            <small>${escapeHtml(metric.detail)}</small>
          </article>
        `).join("")}
      </section>
      <section class="overview-grid">
        <article class="panel source-chart">
          <header><div><span>来源分布</span><h2>全渠道合成反馈</h2></div><small>当前筛选 ${visible.length} 条</small></header>
          <div class="donut-wrap">
            <div class="donut" aria-label="来源分布示意图"><span><b>${SAMPLE_FEEDBACK.length}</b>条合成</span></div>
            <ul>${sourceCounts.map((item, index) => `<li><i class="swatch s${index + 1}"></i><span>${escapeHtml(item.label)}</span><b>${item.value}</b></li>`).join("")}</ul>
          </div>
        </article>
        <article class="panel trend-chart">
          <header><div><span>接入趋势</span><h2>最近 7 天</h2></div><small>设计态统计</small></header>
          <div class="bar-chart" aria-label="七天合成反馈趋势">
            ${[38, 64, 45, 82, 58, 76, 92].map((height, index) => `<div><i style="--bar:${height}%"></i><small>${index + 5} 日</small></div>`).join("")}
          </div>
        </article>
        <article class="panel pipeline-panel">
          <header><div><span>可审计路径</span><h2>从反馈到改进</h2></div><small>不会自动建案</small></header>
          <ol class="pipeline">
            <li class="done"><span>01</span><b>原始反馈</b><small>不可覆盖原文</small></li>
            <li class="active"><span>02</span><b>N1–N3 候选</b><small>exact-5 → exact-14</small></li>
            <li><span>03</span><b>人工确认</b><small>正式实体与风险</small></li>
            <li><span>04</span><b>案件与工单</b><small>确认后才写入</small></li>
            <li><span>05</span><b>问题与改进</b><small>保留根因边界</small></li>
          </ol>
        </article>
        <article class="panel boundary-panel">
          <header><div><span>安全不变量</span><h2>自动分析，人工决策</h2></div></header>
          <ul>
            <li><i>✓</i><span><b>允许</b> 合成反馈接入、分类、风险候选与审计</span></li>
            <li><i>✓</i><span><b>允许</b> 人工确认、补证、建案与安全字段更新</span></li>
            <li class="blocked"><i>×</i><span><b>禁止</b> 车辆控制、自动判责、赔偿和最终根因</span></li>
          </ul>
        </article>
      </section>
    `;
  }

  private renderIntakeCases(): string {
    const visible = this.visibleFeedback();
    const selected = this.selectedFeedback();
    const canCreateConnector = canPerform(this.state.role, "connector:create");
    const canManual = canPerform(this.state.role, "feedback:create_manual");
    return `
      <section class="section-heading split-heading">
        <div><span>INTAKE CENTER</span><h1>来源接入与案件</h1></div>
        <div class="heading-actions">
          <button type="button" class="secondary-button" data-action="manual-open"${buttonState(canManual, "仅 Owner 与运营可手工补录")}>手工备用录入</button>
          <button type="button" class="primary-button" data-action="connector-open"${buttonState(canCreateConnector, "仅 Owner 可创建连接器")}>+ 新建连接器</button>
        </div>
      </section>
      <section class="connector-summary panel">
        <header><div><span>统一入口</span><h2>连接器健康度</h2></div><small>外部平台 → 标准化 → 幂等写入</small></header>
        ${this.renderConnectorStats()}
        ${this.renderConnectorList()}
      </section>
      <section class="platform-section">
        <header><div><span>预留适配器</span><h2>具体平台默认不宣称已接入</h2></div><small>配置授权后才可启用</small></header>
        <div class="platform-grid">
          ${PLATFORM_CARDS.map((platform) => `
            <article class="platform-card">
              <i aria-hidden="true">${platform.glyph}</i>
              <span><b>${platform.label}</b><small>${platform.description}</small></span>
              <em>未配置</em>
            </article>
          `).join("")}
        </div>
      </section>
      <section class="feedback-workspace">
        <div class="feedback-list-panel panel">
          <header><div><span>原始反馈</span><h2>收件箱</h2></div><small>${visible.length} 条结果</small></header>
          ${visible.length ? `<div class="feedback-list" role="list" aria-label="合成原始反馈">
            ${visible.map((item) => `
              <button type="button" role="listitem" class="feedback-row ${selected?.id === item.id ? "selected" : ""}" data-feedback="${escapeHtml(item.id)}">
                <span class="source-avatar">${escapeHtml(item.channel.slice(0, 1))}</span>
                <span class="feedback-copy"><b>${escapeHtml(item.title)}</b><small>${escapeHtml(item.channel)} · ${escapeHtml(formatTime(item.receivedAt))}</small></span>
                <span class="risk risk-${item.risk.toLocaleLowerCase("en-US")}">${item.risk}</span>
                <span class="row-status">${escapeHtml(item.status)}</span>
                <span aria-hidden="true">›</span>
              </button>
            `).join("")}
          </div>` : this.renderEmptyState()}
        </div>
        ${this.renderFeedbackDetail(selected)}
      </section>
      <section class="cases-panel panel">
        <header><div><span>反馈案件</span><h2>人工确认后的协同对象</h2></div><small>AI 不直接创建案件</small></header>
        <div class="compact-table" role="table" aria-label="合成案件">
          <div role="row" class="table-head"><span>ID</span><span>案件</span><span>风险</span><span>证据</span><span>关系 / 状态</span></div>
          ${CASE_SAMPLES.map((item) => `<div role="row"><code>${item.id}</code><b>${item.title}</b><span class="risk risk-${item.risk.toLocaleLowerCase("en-US")}">${item.risk}</span><span>${item.evidence}</span><span>${item.relation} · ${item.status}</span></div>`).join("")}
        </div>
      </section>
    `;
  }

  private renderConnectorStats(): string {
    const totals = this.state.connectors.reduce((acc, connector) => {
      acc.received += connector.totals.received;
      acc.committed += connector.totals.committed;
      acc.replayed += connector.totals.replayed;
      acc.conflicts += connector.totals.conflicts;
      acc.rejected += connector.totals.rejected;
      acc.reconciliation += connector.totals.reconciliation;
      return acc;
    }, { received: 0, committed: 0, replayed: 0, conflicts: 0, rejected: 0, reconciliation: 0 });
    return `<div class="connector-stats">
      ${[
        ["已接收", totals.received],
        ["已写入", totals.committed],
        ["安全重放", totals.replayed],
        ["幂等冲突", totals.conflicts],
        ["已拒绝", totals.rejected],
        ["待对账", totals.reconciliation],
      ].map(([label, value]) => `<div><b>${value}</b><span>${label}</span></div>`).join("")}
    </div>`;
  }

  private renderConnectorList(): string {
    if (!this.state.connectors.length) {
      return `<div class="inline-empty"><b>尚无启用的连接器</b><span>创建通用 Webhook、批量或轮询连接器后在此查看状态。</span></div>`;
    }
    const canDisable = canPerform(this.state.role, "connector:disable");
    const canRotate = canPerform(this.state.role, "connector:rotate");
    return `<div class="connector-list" role="list" aria-label="连接器列表">
      ${this.state.connectors.map((connector) => `
        <article role="listitem" class="connector-row">
          <span class="connector-state ${connector.status}" aria-label="${connector.status}"></span>
          <span class="connector-title"><b>${escapeHtml(connector.displayName)}</b><small>${escapeHtml(connector.provider)} · ${escapeHtml(connector.transport)} · ${escapeHtml(connector.sourceType)}</small></span>
          <span class="connector-last"><b>${connector.totals.committed} 条已写入</b><small>${escapeHtml(formatTime(connector.lastReceivedAt))}</small></span>
          <span class="connector-actions">
            <button type="button" data-action="connector-rotate" data-id="${escapeHtml(connector.id)}"${buttonState(canRotate && connector.status === "active", "仅 Owner 可轮换启用连接器的密钥")}>轮换密钥</button>
            <button type="button" data-action="connector-disable" data-id="${escapeHtml(connector.id)}"${buttonState(canDisable && connector.status === "active", "仅 Owner 可停用连接器")}>停用</button>
          </span>
        </article>
      `).join("")}
    </div>`;
  }

  private renderFeedbackDetail(item: FeedbackItem | null): string {
    if (!item) return `<aside class="feedback-detail panel">${this.renderEmptyState()}</aside>`;
    return `
      <aside class="feedback-detail panel" aria-label="来源详情">
        <header><div><span>来源详情</span><h2>${escapeHtml(item.id)}</h2></div><span class="scope-mini">合成</span></header>
        <blockquote>${escapeHtml(item.originalText)}</blockquote>
        <dl class="source-summary">
          <div><dt>渠道</dt><dd>${escapeHtml(item.channel)}</dd></div>
          <div><dt>平台名</dt><dd>${escapeHtml(item.sourceName)}</dd></div>
          <div><dt>接收时间</dt><dd>${escapeHtml(formatTime(item.receivedAt))}</dd></div>
          <div><dt>授权范围</dt><dd>${escapeHtml(item.authorizationScope)}</dd></div>
        </dl>
        <details>
          <summary>展开来源与幂等证据</summary>
          <dl class="source-evidence">
            <div><dt>来源类型</dt><dd>${escapeHtml(item.sourceType)}</dd></div>
            <div><dt>来源记录 ID</dt><dd><code>${escapeHtml(item.sourceRecordId)}</code></dd></div>
            <div><dt>租户范围</dt><dd>${escapeHtml(item.sourceTenantScope)}</dd></div>
            <div><dt>来源定位</dt><dd><code>${escapeHtml(item.sourceLocator)}</code></dd></div>
            <div><dt>时区</dt><dd>${escapeHtml(item.sourceTimezone)}</dd></div>
            <div><dt>幂等键</dt><dd><code>${escapeHtml(item.idempotencyKey)}</code></dd></div>
            <div><dt>原文摘要</dt><dd><code>${escapeHtml(item.sha256)}</code></dd></div>
          </dl>
        </details>
        <section class="attachment-summary" aria-labelledby="attachment-title">
          <h3 id="attachment-title">附件摘要 <span>${item.attachments.length}</span></h3>
          ${item.attachments.length ? item.attachments.map((attachment) => `
            <div><i aria-hidden="true">▧</i><span><b>${escapeHtml(attachment.name)}</b><small>${escapeHtml(attachment.mediaType)} · ${formatBytes(attachment.byteLength)}</small></span><code>${escapeHtml(attachment.sha256)}</code></div>
          `).join("") : `<p>没有附件；系统不会复制外部文件或保存临时签名链接。</p>`}
        </section>
        <div class="relation-strip"><span>反馈</span><i>→</i><span>${escapeHtml(item.linkedCaseId ?? "待人工建案")}</span><i>→</i><span>${escapeHtml(item.candidateTaskId ?? "待关联任务")}</span></div>
      </aside>
    `;
  }

  private renderSla(): string {
    const canUpdate = canPerform(this.state.role, "work_order:update_safe");
    return `
      <section class="section-heading split-heading"><div><span>OPERATIONS & SLA</span><h1>处置队列与原时钟</h1></div><p>改派、重试和升级都不重置最初 SLA 起点。</p></section>
      <section class="sla-board">
        ${[
          ["需要关注", WORK_ORDER_SAMPLES.filter((item) => item.level !== "L0")],
          ["进行中", WORK_ORDER_SAMPLES.filter((item) => item.status === "处理中" || item.status === "待接单")],
          ["待验证", WORK_ORDER_SAMPLES.filter((item) => item.status === "待验证")],
        ].map(([label, items]) => `
          <article class="sla-column panel">
            <header><h2>${label as string}</h2><span>${(items as typeof WORK_ORDER_SAMPLES).length}</span></header>
            ${(items as typeof WORK_ORDER_SAMPLES).map((item) => `<div class="order-card">
              <div><code>${item.id}</code><span class="level">${item.level}</span></div>
              <h3>${item.title}</h3><p>${item.owner}</p>
              <footer><span>到期 ${item.due}</span><button type="button"${buttonState(canUpdate, "当前角色不可更新工单")}>更新安全字段</button></footer>
            </div>`).join("") || `<p class="column-empty">当前合成快照无此状态</p>`}
          </article>
        `).join("")}
      </section>
      <section class="panel clock-contract">
        <div><span>时钟合同</span><h2>SLA 失败先停点，再由人接管</h2></div>
        <ol><li><b>原始起点</b><span>created_at / sla_started_at</span></li><li><b>提醒</b><span>只发送测试通知</span></li><li><b>升级</b><span>保留原时钟与失败证据</span></li><li><b>人工接管</b><span>不自动关闭或重置</span></li></ol>
      </section>
    `;
  }

  private renderImprovement(): string {
    const canReview = canPerform(this.state.role, "review:decide");
    return `
      <section class="section-heading split-heading"><div><span>ISSUE & IMPROVEMENT</span><h1>问题地图与观察窗</h1></div><p>聚类只是候选；最终根因、立项和归档都需要人工确认。</p></section>
      <section class="issue-layout">
        <article class="panel issue-map">
          <header><div><span>跨事件关系</span><h2>SYN-CLUSTER-001</h2></div><small>4 个独立案件</small></header>
          <div class="map-canvas" aria-label="合成问题簇关系图">
            <span class="map-core"><b>舱门解锁失败</b><small>候选问题簇</small></span>
            <span class="map-node n1">CASE-017</span><span class="map-node n2">CASE-008</span><span class="map-node n3">CASE-014</span><span class="map-node n4">CASE-020</span>
          </div>
          <p class="guard-note">关系线只表示可追溯的候选相似性，不表示同一事故或已确认根因。</p>
        </article>
        <article class="panel observation-card">
          <header><div><span>改进观察</span><h2>SYN-IMPROVEMENT-001</h2></div><small>方案路径</small></header>
          <ol class="observation-timeline"><li class="done"><i>✓</i><b>人工立项</b><small>合成确认</small></li><li class="current"><i>7</i><b>7 天观察</b><small>无真实结果</small></li><li><i>30</i><b>30 天观察</b><small>保持空值</small></li><li><i>↗</i><b>归档 / 重开</b><small>待人工结论</small></li></ol>
        </article>
      </section>
      <section class="panel improvement-list">
        <header><div><span>问题与改进对象</span><h2>候选、证据和人工关口</h2></div></header>
        ${IMPROVEMENT_SAMPLES.map((item) => `<article><span class="risk risk-${item.risk.toLocaleLowerCase("en-US")}">${item.risk}</span><span><code>${item.id}</code><b>${item.title}</b><small>${item.next}</small></span><em>${item.status}</em><button type="button"${buttonState(canReview, "仅 Owner 或审核角色可确认")}>人工确认</button></article>`).join("")}
      </section>
    `;
  }

  private renderAiAudit(): string {
    const canReview = canPerform(this.state.role, "review:decide");
    return `
      <section class="section-heading split-heading"><div><span>AI & AUDIT</span><h1>候选可看，验证可追</h1></div><p>模型只生成 exact-5 candidate；确定性代码生成 exact-14 envelope。</p></section>
      <section class="audit-contract-grid">
        <article class="panel"><span>模型输入</span><strong>权威原文快照</strong><small>Worker 重新读取 Base，不信任回调正文</small></article>
        <article class="panel"><span>模型输出</span><strong>exact-5 candidate</strong><small>节点最多一次修复，共两次调用</small></article>
        <article class="panel"><span>确定性输出</span><strong>exact-14 envelope</strong><small>run_id、hash、validation 由代码生成</small></article>
        <article class="panel"><span>失败出口</span><strong>needs_human</strong><small>二次失败后业务写入为 0</small></article>
      </section>
      <section class="panel audit-table-panel">
        <header><div><span>AI 审计</span><h2>N1–N3 合成运行样例</h2></div><small>不代表真实模型生产运行</small></header>
        <div class="audit-table" role="table" aria-label="AI 审计样例">
          <div role="row" class="table-head"><span>run_id</span><span>节点 / 对象</span><span>校验</span><span>重试</span><span>人工审核</span><span>动作</span></div>
          ${AUDIT_SAMPLES.map((item) => `<div role="row"><code>${item.runId}</code><span><b>${item.node}</b><small>${item.object}</small></span><em class="validation ${item.validation === "needs_human" ? "needs-human" : ""}">${item.validation}</em><span>${item.retry}/1</span><span>${item.review}</span><button type="button"${buttonState(canReview, "当前角色不可提交审核结论")}>审核</button></div>`).join("")}
        </div>
      </section>
      <section class="review-actions panel"><div><span>角色策略</span><h2>${ROLE_LABELS[this.state.role]} 当前可用动作</h2></div><div><button type="button"${buttonState(canReview, "需要审核权限")}>确认候选</button><button type="button"${buttonState(canReview, "需要审核权限")}>退回补证</button><button type="button"${buttonState(canReview, "需要审核权限")}>驳回候选</button></div><p>人工修订只追加 human_revision 与审核字段，不覆盖原始模型输出。</p></section>
    `;
  }

  private renderMasterData(): string {
    const groups = [
      { title: "车辆档案", key: "vehicles", count: 8, boundary: "只读业务快照，不提供控制动作", rows: [["SYN-VEHICLE-X6-107", "X6 · 4.0-demo", "合成站点 A"], ["SYN-VEHICLE-X3-014", "X3 · 3.2-demo", "合成站点 C"]] },
      { title: "配送任务", key: "delivery_tasks", count: 12, boundary: "只用于证据关联，不改变任务状态", rows: [["SYN-TASK-8458", "合成路线 A-17", "延误候选"], ["SYN-TASK-8461", "合成路线 B-08", "进行中快照"]] },
      { title: "站点责任矩阵", key: "routing_matrix", count: 20, boundary: "版本化规则；启用需 Owner 人工确认", rows: [["SYN-ROUTE-DOOR-01", "舱门柜体", "车辆运维候选"], ["SYN-ROUTE-CX-02", "服务体验", "体验运营候选"]] },
      { title: "知识索引", key: "knowledge_index", count: 5, boundary: "草稿审核后才可发布", rows: [["SYN-KNOW-001", "舱门异常核查清单", "待审核"], ["SYN-KNOW-004", "到站提示说明", "草稿"]] },
    ];
    const canPublish = canPerform(this.state.role, "knowledge:publish");
    return `
      <section class="section-heading split-heading"><div><span>MASTER DATA & KNOWLEDGE</span><h1>关联证据，不接管业务状态</h1></div><p>车辆、任务和规则用于核对候选；知识发布保留人工审核。</p></section>
      <section class="master-grid">${groups.map((group) => `<article class="panel master-card"><header><div><span>${group.count} 条</span><h2>${group.title}</h2></div><button type="button" data-table="${group.key}">打开表</button></header><p>${group.boundary}</p>${group.rows.map((row) => `<div class="master-row"><code>${row[0]}</code><b>${row[1]}</b><small>${row[2]}</small></div>`).join("")}${group.key === "knowledge_index" ? `<button class="full-action" type="button"${buttonState(canPublish, "仅 Owner 或审核角色可发布知识")}>审核知识草稿</button>` : ""}</article>`).join("")}</section>
      <section class="panel forbidden-actions"><div><span>永久禁止</span><h2>NeoLoop 不提供车辆控制入口</h2></div><ul><li>不开门、不发车、不调度充电</li><li>不自动判定事故责任或赔偿</li><li>不把根因假设写成最终技术根因</li><li>不覆盖企业任务原状态</li></ul></section>
    `;
  }

  private renderTableRail(): string {
    const available = new Map((this.state.context?.tables ?? []).map((table) => [table.key, table]));
    const allowed = canPerform(this.state.role, "table:open");
    return `
      <aside class="table-rail" aria-labelledby="table-rail-title">
        <header><span>BASE OBJECTS</span><h2 id="table-rail-title">10 张表</h2><small>不切底表也能看；需要时可定位</small></header>
        <nav aria-label="Base 数据表入口">
          ${BASE_TABLES.map((table) => {
            const live = available.get(table.key);
            const ready = live?.available ?? true;
            return `<button type="button" data-table="${table.key}"${buttonState(allowed && ready, ready ? "当前角色不可打开数据表" : "当前 Base 未找到该表")}><i aria-hidden="true">${table.icon}</i><span><b>${table.name}</b><small>${table.group}</small></span><em>${live?.count ?? table.count}</em></button>`;
          }).join("")}
        </nav>
        <footer><i aria-hidden="true"></i><span><b>字段目标 249</b><small>10 表 · 5 视图 · 9 关系</small></span></footer>
      </aside>
    `;
  }

  private renderEmptyState(): string {
    return `<div class="empty-state"><span aria-hidden="true">⌀</span><b>没有符合筛选条件的反馈</b><p>清除筛选即可恢复合成样例。</p><button type="button" data-action="clear-filters">清除筛选</button></div>`;
  }

  private renderModal(): string {
    if (!this.state.modal) return "";
    if (this.state.modal.kind === "secret") return this.renderSecretDialog(this.state.modal.result);
    const connector = this.state.modal.kind === "connector";
    return `
      <div class="dialog-layer">
        <button type="button" class="dialog-scrim" data-action="modal-close" aria-label="关闭对话框"></button>
        <section class="dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title">
          <header><div><span>${connector ? "CONNECTOR" : "MANUAL FALLBACK"}</span><h2 id="dialog-title">${connector ? "创建通用连接器" : "手工备用录入"}</h2></div><button type="button" class="icon-button" data-action="modal-close" aria-label="关闭">×</button></header>
          ${connector ? this.renderConnectorForm() : this.renderManualForm()}
        </section>
      </div>
    `;
  }

  private renderConnectorForm(): string {
    return `<form id="connector-form" class="dialog-form">
      <p class="form-boundary">只创建 synthetic_experiment 连接器。外部平台名称不等于已完成真实接入。</p>
      <div class="form-grid">
        <label>显示名称<input name="displayName" required maxlength="60" placeholder="例如：合成服务评价 Webhook" data-initial-focus /></label>
        <label>提供方标识<input name="provider" required pattern="[a-z0-9._-]+" placeholder="synthetic-provider" /></label>
        <label>传输方式<select name="transport" required><option value="webhook">Webhook</option><option value="batch">批量导入</option><option value="polling">轮询</option></select></label>
        <label>来源类型<select name="sourceType" required><option value="service_rating">服务评价</option><option value="customer_group">客户群</option><option value="service_ticket">服务工单</option><option value="hotline_transcript">热线转录</option><option value="email">服务邮箱</option><option value="public_review">公开评价</option></select></label>
        <label>租户范围<input name="sourceTenantScope" required value="synthetic-tenant-demo" /></label>
        <label>授权范围<input name="authorizationScope" required value="合成演示授权" /></label>
      </div>
      <footer><button type="button" class="secondary-button" data-action="modal-close">取消</button><button type="submit" class="primary-button"${this.state.busy ? " disabled" : ""}>${this.state.busy ? "创建中…" : "创建并显示一次性密钥"}</button></footer>
    </form>`;
  }

  private renderManualForm(): string {
    return `<form id="manual-form" class="dialog-form">
      <p class="form-boundary">自动平台接入是主路径；本表单只用于获得授权的合成补录。</p>
      <div class="form-grid">
        <label>来源名称<input name="sourceName" required value="Owner 工作台手工备用" data-initial-focus /></label>
        <label>来源类型<select name="sourceType" required><option value="manual_note">手工备注</option><option value="hotline_transcript">热线转录</option><option value="partner_feedback">合作方反馈</option></select></label>
        <label>渠道<input name="channel" required value="手工补录" /></label>
        <label>提交角色<input name="senderRole" required value="合成反馈提交者" /></label>
        <label>来源记录 ID<input name="sourceRecordId" required pattern="SYN-[A-Z0-9_-]+" placeholder="SYN-MANUAL-SOURCE-001" /></label>
        <label>来源时间<input name="sourceEventAt" required type="datetime-local" /></label>
        <label>租户范围<input name="sourceTenantScope" required value="synthetic-tenant-demo" /></label>
        <label>来源时区<input name="sourceTimezone" required value="Asia/Shanghai" /></label>
        <label class="wide">来源定位<input name="sourceLocator" required placeholder="synthetic://manual/SYN-MANUAL-SOURCE-001" /></label>
        <label class="wide">授权范围<input name="authorizationScope" required value="合成演示授权" /></label>
        <label class="wide">反馈原文<textarea name="originalText" required minlength="4" maxlength="4096" placeholder="请以【合成反馈】开头"></textarea></label>
      </div>
      <footer><button type="button" class="secondary-button" data-action="modal-close">取消</button><button type="submit" class="primary-button"${this.state.busy ? " disabled" : ""}>${this.state.busy ? "写入中…" : "幂等写入原始反馈"}</button></footer>
    </form>`;
  }

  private renderSecretDialog(result: OneTimeSecretResult): string {
    return `
      <div class="dialog-layer">
        <button type="button" class="dialog-scrim" data-action="modal-close" aria-label="关闭一次性密钥"></button>
        <section class="dialog secret-dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title">
          <header><div><span>ONE-TIME SECRET</span><h2 id="dialog-title">立即复制连接器密钥</h2></div><button type="button" class="icon-button" data-action="modal-close" aria-label="关闭并清除密钥">×</button></header>
          <div class="secret-warning"><b>只显示这一次</b><p>关闭后工作台会从内存中清除明文；系统不会把它写入 Base、浏览器持久存储或日志。</p></div>
          <label>连接器 ID<code>${escapeHtml(result.connector.id)}</code></label>
          <label>Webhook 路径<code>${escapeHtml(result.webhookPath)}</code></label>
          <label>一次性密钥<div class="secret-value"><code>${escapeHtml(result.oneTimeSecret)}</code><button type="button" data-action="secret-copy">复制</button></div></label>
          <footer><button type="button" class="primary-button" data-action="modal-close">我已安全保存，清除明文</button></footer>
        </section>
      </div>
    `;
  }

  private bindEvents(): void {
    this.root.querySelectorAll<HTMLButtonElement>("[data-tab]").forEach((button) => {
      button.addEventListener("click", () => this.changeTab(button.dataset.tab as TabKey));
      button.addEventListener("keydown", (event) => this.handleTabKey(event));
    });
    this.root.querySelectorAll<HTMLButtonElement>("[data-mode]").forEach((button) => {
      button.addEventListener("click", () => {
        const mode = button.dataset.mode as WorkbenchMode;
        this.state.mode = mode;
        this.state.filters = { ...this.state.filters, mode };
        this.state.notice = mode === "demo" ? "比赛演示模式只显示 SYN-LIVE-DEMO-* 合成链。" : "日常运营模式显示全部获授权合成记录。";
        this.render();
      });
    });
    this.root.querySelector<HTMLSelectElement>("#role-select")?.addEventListener("change", (event) => {
      this.state.role = (event.currentTarget as HTMLSelectElement).value as WorkbenchRole;
      this.state.notice = `已切换到${ROLE_LABELS[this.state.role]}权限预览；真实权限仍由飞书应用模式配置决定。`;
      this.render();
    });
    this.root.querySelectorAll<HTMLSelectElement>("[data-filter]").forEach((select) => {
      select.addEventListener("change", () => {
        const key = select.dataset.filter as "source" | "timeRange" | "risk" | "status";
        this.state.filters = { ...this.state.filters, [key]: select.value } as WorkbenchFilters;
        this.render();
      });
    });
    this.root.querySelector<HTMLFormElement>("#search-form")?.addEventListener("submit", (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget as HTMLFormElement);
      this.state.filters = { ...this.state.filters, query: String(form.get("query") ?? "") };
      this.render();
    });
    this.root.querySelectorAll<HTMLButtonElement>("[data-feedback]").forEach((button) => {
      button.addEventListener("click", () => {
        this.state.selectedFeedbackId = button.dataset.feedback ?? "";
        this.render();
      });
    });
    this.root.querySelectorAll<HTMLButtonElement>("[data-table]").forEach((button) => {
      button.addEventListener("click", () => void this.openTable(button.dataset.table ?? ""));
    });
    this.root.querySelectorAll<HTMLButtonElement>("[data-action]").forEach((button) => {
      button.addEventListener("click", () => void this.handleAction(button));
    });
    this.root.querySelector<HTMLFormElement>("#connector-form")?.addEventListener("submit", (event) => void this.submitConnector(event));
    this.root.querySelector<HTMLFormElement>("#manual-form")?.addEventListener("submit", (event) => void this.submitManual(event));
    if (this.state.modal) {
      requestAnimationFrame(() => {
        const initial = this.root.querySelector<HTMLElement>("[data-initial-focus]")
          ?? this.root.querySelector<HTMLElement>(".dialog button");
        initial?.focus();
      });
    }
  }

  private changeTab(tab: TabKey): void {
    this.state.tab = tab;
    this.render();
    requestAnimationFrame(() => this.root.querySelector<HTMLElement>(`#tab-${tab}`)?.focus());
  }

  private handleTabKey(event: KeyboardEvent): void {
    const current = WORKBENCH_TABS.findIndex((tab) => tab.key === this.state.tab);
    let next = current;
    if (event.key === "ArrowRight") next = (current + 1) % WORKBENCH_TABS.length;
    if (event.key === "ArrowLeft") next = (current - 1 + WORKBENCH_TABS.length) % WORKBENCH_TABS.length;
    if (event.key === "Home") next = 0;
    if (event.key === "End") next = WORKBENCH_TABS.length - 1;
    if (next !== current) {
      event.preventDefault();
      const tab = WORKBENCH_TABS[next];
      if (tab) this.changeTab(tab.key);
    }
  }

  private async handleAction(button: HTMLButtonElement): Promise<void> {
    const action = button.dataset.action;
    let returnFocusSelector: string | null = null;
    if (action === "clear-filters") {
      this.state.filters = { mode: this.state.mode, source: "all", timeRange: "all", risk: "all", status: "all", query: "" };
      this.render();
      return;
    }
    if (action === "connector-open") {
      this.modalReturnFocusSelector = '[data-action="connector-open"]';
      this.state.modal = { kind: "connector" };
    }
    if (action === "manual-open") {
      this.modalReturnFocusSelector = '[data-action="manual-open"]';
      this.state.modal = { kind: "manual" };
    }
    if (action === "modal-close") {
      returnFocusSelector = this.modalReturnFocusSelector;
      this.state.modal = null;
      this.state.busy = false;
      this.modalReturnFocusSelector = null;
      this.state.notice = "一次性内容已从工作台内存中清除。";
      this.state.noticeTone = "neutral";
    }
    if (action === "connector-disable") await this.disableConnector(button.dataset.id ?? "");
    if (action === "connector-rotate") {
      this.modalReturnFocusSelector = '[data-action="connector-rotate"]';
      await this.rotateConnector(button.dataset.id ?? "");
    }
    if (action === "secret-copy") await this.copySecret();
    this.render();
    if (returnFocusSelector) {
      requestAnimationFrame(() => this.root.querySelector<HTMLElement>(returnFocusSelector)?.focus());
    }
  }

  private async openTable(tableKey: string): Promise<void> {
    try {
      await this.base.openTable(tableKey);
      const table = BASE_TABLES.find((item) => item.key === tableKey);
      this.setNotice(`${table?.name ?? tableKey} 已通过 Base 适配器定位。`, "success");
    } catch (error) {
      this.setNotice(error instanceof Error ? error.message : "无法打开数据表", "error");
    }
  }

  private async submitConnector(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    if (!canPerform(this.state.role, "connector:create")) return;
    const form = new FormData(event.currentTarget as HTMLFormElement);
    this.state.busy = true;
    this.render();
    try {
      const result = await this.connectors.create({
        displayName: String(form.get("displayName") ?? ""),
        provider: String(form.get("provider") ?? ""),
        transport: String(form.get("transport") ?? "webhook") as "webhook" | "polling" | "batch",
        sourceType: String(form.get("sourceType") ?? "service_rating"),
        sourceTenantScope: String(form.get("sourceTenantScope") ?? ""),
        authorizationScope: String(form.get("authorizationScope") ?? ""),
      });
      this.state.connectors = await this.connectors.list();
      this.state.modal = { kind: "secret", result };
      this.state.notice = "连接器已创建；请立即安全保存一次性密钥。";
      this.state.noticeTone = "success";
    } catch (error) {
      this.state.notice = error instanceof Error ? error.message : "创建连接器失败";
      this.state.noticeTone = "error";
    } finally {
      this.state.busy = false;
      this.render();
    }
  }

  private async submitManual(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    if (!canPerform(this.state.role, "feedback:create_manual")) return;
    const form = new FormData(event.currentTarget as HTMLFormElement);
    const originalText = String(form.get("originalText") ?? "");
    if (!originalText.startsWith("【合成反馈】")) {
      this.setNotice("手工备用原文必须以【合成反馈】开头。", "error");
      return;
    }
    this.state.busy = true;
    this.render();
    try {
      const receipt = await this.connectors.createManualFeedback({
        sourceName: String(form.get("sourceName") ?? ""),
        sourceType: String(form.get("sourceType") ?? "manual_note"),
        channel: String(form.get("channel") ?? "手工补录"),
        senderRole: String(form.get("senderRole") ?? ""),
        sourceRecordId: String(form.get("sourceRecordId") ?? ""),
        sourceTenantScope: String(form.get("sourceTenantScope") ?? ""),
        sourceLocator: String(form.get("sourceLocator") ?? ""),
        sourceTimezone: String(form.get("sourceTimezone") ?? "Asia/Shanghai"),
        sourceEventAt: String(form.get("sourceEventAt") ?? ""),
        authorizationScope: String(form.get("authorizationScope") ?? ""),
        originalText,
        dataScope: "synthetic_experiment",
      });
      this.state.modal = null;
      this.state.notice = `${receipt.feedbackId} 已${receipt.disposition === "inserted" ? "幂等写入" : "返回既有记录"}。`;
      this.state.noticeTone = "success";
    } catch (error) {
      this.state.notice = error instanceof Error ? error.message : "手工备用写入失败";
      this.state.noticeTone = "error";
    } finally {
      this.state.busy = false;
      this.render();
    }
  }

  private async disableConnector(id: string): Promise<void> {
    if (!canPerform(this.state.role, "connector:disable")) return;
    try {
      await this.connectors.disable(id);
      this.state.connectors = await this.connectors.list();
      this.state.notice = "连接器已停用；既有反馈和审计未删除。";
      this.state.noticeTone = "success";
    } catch (error) {
      this.state.notice = error instanceof Error ? error.message : "停用失败";
      this.state.noticeTone = "error";
    }
  }

  private async rotateConnector(id: string): Promise<void> {
    if (!canPerform(this.state.role, "connector:rotate")) return;
    try {
      const result = await this.connectors.rotate(id);
      this.state.modal = { kind: "secret", result };
      this.state.notice = "旧密钥已失效；新密钥只显示一次。";
      this.state.noticeTone = "success";
    } catch (error) {
      this.state.notice = error instanceof Error ? error.message : "轮换失败";
      this.state.noticeTone = "error";
    }
  }

  private async copySecret(): Promise<void> {
    const modal = this.state.modal;
    if (modal?.kind !== "secret") return;
    try {
      await navigator.clipboard.writeText(modal.result.oneTimeSecret);
      this.state.notice = "一次性密钥已复制；关闭窗口后明文会被清除。";
      this.state.noticeTone = "success";
    } catch {
      this.state.notice = "浏览器阻止了复制；请在关闭前手工选择密钥。";
      this.state.noticeTone = "error";
    }
  }

  handleGlobalKeydown(event: KeyboardEvent): void {
    if (event.key === "Escape" && this.state.modal) {
      const returnFocusSelector = this.modalReturnFocusSelector;
      this.state.modal = null;
      this.state.busy = false;
      this.modalReturnFocusSelector = null;
      this.state.notice = "一次性内容已从工作台内存中清除。";
      this.state.noticeTone = "neutral";
      this.render();
      if (returnFocusSelector) {
        requestAnimationFrame(() => this.root.querySelector<HTMLElement>(returnFocusSelector)?.focus());
      }
    }
    if (event.key === "Tab" && this.state.modal) {
      const focusable = Array.from(this.root.querySelectorAll<HTMLElement>(
        '.dialog button:not([disabled]), .dialog input:not([disabled]), .dialog select:not([disabled]), .dialog textarea:not([disabled]), .dialog summary, .dialog [tabindex]:not([tabindex="-1"])',
      )).filter((element) => element.offsetParent !== null);
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && (document.activeElement === first || !this.root.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  }
}
