import type { WorkbenchBaseAdapter, BaseContext, BaseRecordRow } from "./base-adapter";
import type {
  ConnectorClient,
  ConnectorSummary,
  OneTimeSecretResult,
  WorkflowStatus,
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
  WORKBENCH_TABS,
  WORK_ORDER_SAMPLES,
  type FeedbackItem,
  type TabKey,
  type WorkbenchFilters,
  type WorkbenchMode,
  type WorkbenchRole,
} from "./policy";
import {
  createLiveActionPlan,
  type LiveActionInput,
  type LiveActionTarget,
} from "./live-actions";

type ModalState =
  | { kind: "connector" }
  | { kind: "manual" }
  | { kind: "secret"; result: OneTimeSecretResult }
  | { kind: "connector-confirm"; operation: "disable" | "rotate"; connectorId: string; connectorName: string }
  | { kind: "business"; target: LiveActionTarget }
  | null;

type DrawerState =
  | { kind: "feedback-list" }
  | { kind: "case-list" }
  | null;

type FilterKey = "source" | "timeRange" | "risk" | "status";

type WorkbenchState = {
  tab: TabKey;
  role: WorkbenchRole;
  mode: WorkbenchMode;
  filters: WorkbenchFilters;
  openFilter: FilterKey | null;
  selectedFeedbackId: string;
  connectors: ConnectorSummary[];
  workflowStatus: WorkflowStatus | null;
  context: BaseContext | null;
  records: Record<string, BaseRecordRow[]>;
  modal: ModalState;
  drawer: DrawerState;
  busy: boolean;
  notice: string;
  noticeTone: "neutral" | "success" | "error";
};

type CaseItem = { id: string; recordId: string; fields: Record<string, unknown>; title: string; risk: "P0" | "P1" | "P2" | "P3"; status: string; evidence: string; relation: string };
type WorkOrderItem = { id: string; recordId: string; fields: Record<string, unknown>; title: string; owner: string; due: string; level: string; status: string };
type ImprovementItem = { id: string; recordId: string; fields: Record<string, unknown>; target: "cluster" | "improvement"; title: string; count: number; risk: "P0" | "P1" | "P2" | "P3"; status: string; next: string };
type AuditItem = { runId: string; recordId: string; fields: Record<string, unknown>; node: string; object: string; validation: string; retry: number; review: string };

const NEUTRAL_ESCALATION_LEVELS = new Set(["", "L0", "未升级", "无", "none"]);

function auditValidationLabel(value: unknown): string {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const result = value as Record<string, unknown>;
    if (result.valid === true) return "验证通过";
    if (result.valid === false) return "验证失败";
  }
  if (typeof value === "string") {
    try {
      return auditValidationLabel(JSON.parse(value) as unknown);
    } catch {
      if (value === "needs_human") return "需人工处理";
      if (value.trim()) return value;
    }
  }
  return "未验证";
}

const sourceTypes = [
  ["all", "全部来源"],
  ["service_rating", "服务评价"],
  ["vehicle_event", "车辆事件"],
  ["fault_report", "故障上报"],
  ["service_ticket", "服务工单"],
  ["customer_group", "客户群"],
  ["partner_feedback", "合作方"],
  ["hotline_transcript", "热线转录"],
  ["email", "服务邮箱"],
  ["public_review", "公开评价"],
  ["manual_note", "手工备用"],
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

function cellText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(cellText).filter(Boolean).join(", ");
  if (typeof value === "object") {
    const candidate = value as Record<string, unknown>;
    for (const key of ["text", "name", "id", "value"]) {
      if (candidate[key] !== undefined) return cellText(candidate[key]);
    }
  }
  return "";
}

function normalizeRisk(value: unknown): FeedbackItem["risk"] {
  const text = cellText(value);
  return text === "P0" || text === "P1" || text === "P2" || text === "P3" ? text : "P3";
}

function normalizeFeedbackStatus(value: unknown): FeedbackItem["status"] {
  const text = cellText(value);
  return text === "待分诊" || text === "人工处理" || text === "已建案" || text === "已忽略" ? text : "人工处理";
}

function parseAttachments(value: unknown): FeedbackItem["attachments"] {
  const text = cellText(value);
  if (!text) return [];
  try {
    const parsed = JSON.parse(text) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
      const item = entry as Record<string, unknown>;
      const name = cellText(item.name);
      const mediaType = cellText(item.media_type ?? item.mediaType);
      const sourceLocator = cellText(item.source_locator ?? item.sourceLocator);
      const sha256 = cellText(item.sha256);
      const byteLength = Number(item.byte_length ?? item.byteLength);
      if (!name || !mediaType || !sourceLocator || !/^[a-f0-9]{64}$/u.test(sha256) || !Number.isSafeInteger(byteLength) || byteLength < 0) return [];
      return [{ name, mediaType, sourceLocator, sha256, byteLength }];
    });
  } catch {
    return [];
  }
}

function titleFromText(text: string): string {
  const compact = text.replace(/^【合成反馈】/u, "").trim();
  return compact.length > 34 ? `${compact.slice(0, 34)}…` : compact || "未填写反馈原文";
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
      openFilter: null,
      selectedFeedbackId: "",
      connectors: [],
      workflowStatus: null,
      context: null,
      records: {},
      modal: null,
      drawer: null,
      busy: false,
      notice: "工作台仅展示和写入 synthetic_experiment 合成数据。",
      noticeTone: "neutral",
    };
  }

  async start(): Promise<void> {
    this.render();
    try {
      const [context, connectorList, workflowStatus] = await Promise.all([
        this.base.getContext(),
        this.connectors.list(),
        this.connectors.workflowStatus().catch(() => null),
      ]);
      this.state.context = context;
      this.state.role = context.role;
      this.state.connectors = connectorList;
      this.state.workflowStatus = workflowStatus;
      if (context.mode === "lark") {
        await this.reloadRecords();
      }
      this.state.notice = context.mode === "lark"
        ? "已连接当前 Base；所有写操作仍经过角色与合成数据边界。"
        : "当前为独立合成预览；接入飞书 SDK 后会读回真实 Base 元数据。";
      this.render();
    } catch (error) {
      this.setNotice(error instanceof Error ? error.message : "工作台初始化失败", "error");
    }
  }

  private async reloadRecords(): Promise<void> {
    const recordSets = await Promise.all(BASE_TABLES.map(async (table) => [table.key, await this.base.listRecords(table.key)] as const));
    this.state.records = Object.fromEntries(recordSets);
  }

  private visibleFeedback(): FeedbackItem[] {
    return applyWorkbenchFilters(this.feedbackItems(), this.state.filters);
  }

  private rows(tableKey: string): BaseRecordRow[] {
    return this.state.records[tableKey] ?? [];
  }

  private feedbackItems(): FeedbackItem[] {
    if (this.state.context?.mode === "standalone-preview") return [...SAMPLE_FEEDBACK];
    if (this.state.context?.mode !== "lark") return [];
    const caseRisk = new Map(this.rows("cases").map((row) => [cellText(row.fields.case_id), normalizeRisk(row.fields.final_risk || row.fields.ai_risk || row.fields.rule_risk)]));
    return this.rows("raw_feedback").flatMap((row) => {
      const id = cellText(row.fields.feedback_id);
      const dataScope = cellText(row.fields.data_scope);
      const originalText = cellText(row.fields.original_text);
      if (!id || dataScope !== "synthetic_experiment" || !originalText) return [];
      const linkedCaseId = cellText(row.fields.linked_case_id) || null;
      return [{
        id,
        dataScope: "synthetic_experiment" as const,
        title: titleFromText(originalText),
        source: cellText(row.fields.connector_id) || cellText(row.fields.source_name) || "未配置连接器",
        sourceType: cellText(row.fields.source_type) || "manual_note",
        sourceName: cellText(row.fields.source_name) || "未填写来源",
        sourceRecordId: cellText(row.fields.source_record_id),
        sourceTenantScope: cellText(row.fields.source_tenant_scope),
        sourceLocator: cellText(row.fields.source_locator),
        sourceTimezone: cellText(row.fields.source_timezone),
        authorizationScope: cellText(row.fields.authorization_scope),
        idempotencyKey: cellText(row.fields.idempotency_key),
        sha256: cellText(row.fields.source_sha256),
        channel: cellText(row.fields.channel) || "未填写渠道",
        senderRole: cellText(row.fields.sender_role),
        receivedAt: cellText(row.fields.received_at),
        risk: linkedCaseId ? caseRisk.get(linkedCaseId) ?? "P3" : "P3",
        status: normalizeFeedbackStatus(row.fields.processing_status),
        originalText,
        linkedCaseId,
        candidateVehicleId: cellText(row.fields.candidate_vehicle_id) || null,
        candidateTaskId: cellText(row.fields.candidate_task_id) || null,
        attachments: parseAttachments(row.fields.attachment_manifest),
      }];
    });
  }

  private caseItems(): CaseItem[] {
    if (this.state.context?.mode === "standalone-preview") return CASE_SAMPLES.map((item) => ({ ...item, recordId: item.id, fields: { ...item, data_scope: "synthetic_experiment", evidence_summary: item.evidence }, risk: normalizeRisk(item.risk) }));
    return this.rows("cases").map((row) => ({
      id: cellText(row.fields.case_id) || row.recordId,
      recordId: row.recordId,
      fields: row.fields,
      title: cellText(row.fields.title) || cellText(row.fields.summary) || "未填写案件标题",
      risk: normalizeRisk(row.fields.final_risk || row.fields.ai_risk || row.fields.rule_risk),
      status: cellText(row.fields.status) || "未填写",
      evidence: cellText(row.fields.evidence_completeness) || "待补证",
      relation: cellText(row.fields.linked_feedback_ids || row.fields.raw_feedback_ids) || "关系见 Base",
    }));
  }

  private workOrderItems(): WorkOrderItem[] {
    if (this.state.context?.mode === "standalone-preview") return WORK_ORDER_SAMPLES.map((item) => ({ ...item, recordId: item.id, fields: { ...item, data_scope: "synthetic_experiment", disposition_evidence: item.title } }));
    return this.rows("work_orders").map((row) => ({
      id: cellText(row.fields.work_order_id) || row.recordId,
      recordId: row.recordId,
      fields: row.fields,
      title: cellText(row.fields.action) || "未填写处置动作",
      owner: cellText(row.fields.assignee_role) || "待人工分派",
      due: cellText(row.fields.due_at) || "未设置",
      level: cellText(row.fields.escalation_level) || "L0",
      status: cellText(row.fields.status) || "未填写",
    }));
  }

  private improvementItems(): ImprovementItem[] {
    if (this.state.context?.mode === "standalone-preview") return IMPROVEMENT_SAMPLES.map((item) => ({ ...item, recordId: item.id, fields: { ...item, data_scope: "synthetic_experiment" }, target: "improvement", risk: normalizeRisk(item.risk) }));
    const clusters = this.rows("clusters").map((row) => ({
      id: cellText(row.fields.cluster_id) || row.recordId,
      recordId: row.recordId,
      fields: row.fields,
      target: "cluster" as const,
      title: cellText(row.fields.name) || "未填写问题簇",
      count: Number(row.fields.member_count) || 0,
      risk: normalizeRisk(row.fields.highest_risk),
      status: cellText(row.fields.status) || "未填写",
      next: cellText(row.fields.next_step) || "待人工审核",
    }));
    const improvements = this.rows("improvements").map((row) => ({
      id: cellText(row.fields.improvement_id) || row.recordId,
      recordId: row.recordId,
      fields: row.fields,
      target: "improvement" as const,
      title: cellText(row.fields.measure) || "未填写改进措施",
      count: 0,
      risk: "P3" as const,
      status: cellText(row.fields.status) || "未填写",
      next: cellText(row.fields.human_conclusion) || cellText(row.fields.day_7_result) || "观察结论待填写",
    }));
    return [...clusters, ...improvements];
  }

  private auditItems(): AuditItem[] {
    if (this.state.context?.mode === "standalone-preview") return AUDIT_SAMPLES.map((item) => ({ ...item, recordId: item.runId, fields: { ...item, data_scope: "synthetic_experiment", review_action: item.review, human_revision: "" } }));
    return this.rows("ai_audit").map((row) => ({
      runId: cellText(row.fields.run_id) || row.recordId,
      recordId: row.recordId,
      fields: row.fields,
      node: cellText(row.fields.node) || "未填写节点",
      object: cellText(row.fields.object_id) || "未填写对象",
      validation: auditValidationLabel(row.fields.validation ?? row.fields.status),
      retry: Number(row.fields.retry_count) || 0,
      review: cellText(row.fields.review_action) || "待审核",
    }));
  }

  private selectedFeedback(): FeedbackItem | null {
    const visible = this.visibleFeedback();
    return visible.find((item) => item.id === this.state.selectedFeedbackId) ?? visible[0] ?? null;
  }

  private feedbackTrend(records: ReadonlyArray<FeedbackItem>): Array<{ label: string; height: number }> {
    const days = Array.from({ length: 7 }, (_, index) => {
      const date = new Date();
      date.setHours(0, 0, 0, 0);
      date.setDate(date.getDate() - (6 - index));
      return date;
    });
    const counts = days.map((day) => records.filter((item) => {
      const timestamp = Date.parse(item.receivedAt);
      return Number.isFinite(timestamp) && timestamp >= day.getTime() && timestamp < day.getTime() + 86_400_000;
    }).length);
    const maximum = Math.max(1, ...counts);
    return days.map((day, index) => ({
      label: `${day.getMonth() + 1}/${day.getDate()}`,
      height: Math.max(4, Math.round(((counts[index] ?? 0) / maximum) * 100)),
    }));
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
        ${this.renderDrawer()}
      </div>
    `;
    this.root.setAttribute("aria-busy", String(this.state.busy));
    this.bindEvents();
  }

  private renderHeader(): string {
    const connected = this.state.context?.mode === "lark";
    const workflow = this.state.workflowStatus;
    const workflowLabel = workflow
      ? `<b>${workflow.total}</b> 条工作流 <em>${workflow.enabled} 启用 / ${workflow.disabled} 停用</em>`
      : `<b>—</b> 条工作流 <em>状态待同步</em>`;
    return `
      <header class="workbench-header">
        <div class="brand-lockup">
          <span class="brand-mark" aria-hidden="true">N</span>
          <span><b>石听 NeoLoop</b><small>飞书多维表格工作台</small></span>
        </div>
        <div class="header-boundaries" aria-label="运行边界">
          <span class="scope-pill"><i aria-hidden="true"></i>synthetic_experiment</span>
          <span class="workflow-pill">${workflowLabel}</span>
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
    const filterGroups: ReadonlyArray<{
      key: FilterKey;
      label: string;
      options: ReadonlyArray<readonly [string, string]>;
    }> = [
      { key: "source", label: "来源", options: sourceTypes },
      { key: "timeRange", label: "时间", options: [["all", "全部时间"], ["today", "今天"], ["7d", "近 7 天"], ["30d", "近 30 天"]] },
      { key: "risk", label: "风险", options: riskOptions.map((value) => [value, value === "all" ? "全部风险" : value] as const) },
      { key: "status", label: "状态", options: statusOptions.map((value) => [value, value === "all" ? "全部状态" : value] as const) },
    ];
    return `
      <section class="global-filterbar" aria-label="全局筛选器">
        <form id="search-form" class="global-search" role="search">
          <label for="global-search-input" class="sr-only">搜索 ID、反馈、来源或正文</label>
          <span aria-hidden="true">⌕</span>
          <input id="global-search-input" name="query" value="${escapeHtml(this.state.filters.query)}" placeholder="搜索 ID、反馈、来源或正文" autocomplete="off" />
          <button type="submit">搜索</button>
        </form>
        <div class="filter-selects">
          ${filterGroups.map((group) => {
            const current = String(this.state.filters[group.key]);
            const currentLabel = group.options.find(([value]) => value === current)?.[1] ?? current;
            const open = this.state.openFilter === group.key;
            return `<div class="filter-control" data-filter-control="${group.key}">
              <span id="filter-label-${group.key}">${group.label}</span>
              <button type="button" class="filter-trigger" data-action="filter-toggle" data-filter-key="${group.key}" role="combobox" aria-haspopup="listbox" aria-expanded="${open}" aria-labelledby="filter-label-${group.key} filter-value-${group.key}" aria-controls="filter-options-${group.key}">
                <b id="filter-value-${group.key}">${escapeHtml(currentLabel)}</b><i aria-hidden="true">⌄</i>
              </button>
              ${open ? `<div id="filter-options-${group.key}" class="filter-menu" role="listbox" aria-labelledby="filter-label-${group.key}">
                ${group.options.map(([value, label]) => `<button type="button" role="option" aria-selected="${value === current}" data-action="filter-select" data-filter-key="${group.key}" data-filter-value="${escapeHtml(value)}">${escapeHtml(label)}${value === current ? `<span aria-hidden="true">✓</span>` : ""}</button>`).join("")}
              </div>` : ""}
            </div>`;
          }).join("")}
        </div>
        ${this.state.openFilter ? `<button type="button" class="filter-menu-scrim" data-action="filter-close" data-filter-key="${this.state.openFilter}" aria-label="关闭筛选菜单"></button>` : ""}
        <button class="clear-filters" type="button" data-action="clear-filters">清除筛选</button>
      </section>
    `;
  }

  private renderCurrentTab(): string {
    const activeTabIndex = WORKBENCH_TABS.findIndex((tab) => tab.key === this.state.tab);
    const activeTab = WORKBENCH_TABS[activeTabIndex] ?? WORKBENCH_TABS[0];
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
    return `<div id="panel-${this.state.tab}" class="tab-panel tab-panel-${this.state.tab}" data-active-module="${this.state.tab}" role="tabpanel" aria-labelledby="tab-${this.state.tab}" tabindex="-1">
      <div class="module-context-strip" aria-hidden="true"><span>当前模块</span><b>${String(activeTabIndex + 1).padStart(2, "0")} ${escapeHtml(activeTab.label)}</b></div>
      ${panel}
    </div>`;
  }

  private renderOverview(): string {
    const visible = this.visibleFeedback();
    const feedback = this.feedbackItems();
    const cases = this.caseItems();
    const orders = this.workOrderItems();
    const audits = this.auditItems();
    const sourceCounts = sourceTypes.slice(1).map(([value, label]) => ({
      label,
      value: feedback.filter((item) => item.sourceType === value).length,
    })).filter((item) => item.value > 0);
    const metrics = [
      { key: "feedback", label: "合成反馈", value: visible.length, detail: "当前 Base 服务端读回", tone: "mint" },
      { key: "attention", label: "待人工关注", value: feedback.filter((item) => item.status === "待分诊" || item.status === "人工处理").length, detail: "待分诊或人工处理", tone: "amber" },
      { key: "cases", label: "案件总数", value: cases.length, detail: "AI 不直接创建案件", tone: "cyan" },
      { key: "sla", label: "SLA 关注", value: orders.filter((item) => !NEUTRAL_ESCALATION_LEVELS.has(item.level)).length, detail: "已进入升级级别", tone: "rose" },
      { key: "audit", label: "AI 审计", value: audits.length, detail: "服务端审计记录", tone: "violet" },
    ];
    return `
      <section class="section-heading overview-heading">
        <div><span>OWNER-FIRST WORKBENCH</span><h1>一屏看清反馈闭环</h1></div>
        <p>从来源接入、案件协同、SLA 到 AI 审计，全部沿用同一套 10 表数据关系。</p>
      </section>
      <section class="metric-grid" aria-label="关键指标">
        ${metrics.map((metric) => `
          <article class="metric-card ${metric.tone}">
            <span>${escapeHtml(metric.label)}</span>
            <strong>${escapeHtml(metric.value)}</strong>
            <small>${escapeHtml(metric.detail)}</small>
          </article>
        `).join("")}
      </section>
      <section class="overview-grid">
        <article class="panel source-chart">
          <header><div><span>来源分布</span><h2>全渠道合成反馈</h2></div><small>当前筛选 ${visible.length} 条</small></header>
          <div class="donut-wrap">
            <div class="donut" aria-label="来源分布"><span><b>${feedback.length}</b>条合成</span></div>
            <ul>${sourceCounts.map((item, index) => `<li><i class="swatch s${index + 1}"></i><span>${escapeHtml(item.label)}</span><b>${item.value}</b></li>`).join("")}</ul>
          </div>
        </article>
        <article class="panel trend-chart">
          <header><div><span>接入趋势</span><h2>最近 7 天</h2></div><small>当前 Base 读回</small></header>
          <div class="bar-chart" aria-label="七天合成反馈趋势">
            ${this.feedbackTrend(feedback).map((point) => `<div><i style="--bar:${point.height}%"></i><small>${point.label}</small></div>`).join("")}
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
    const visiblePreview = visible.slice(0, 5);
    const cases = this.caseItems();
    const casePreview = cases.slice(0, 5);
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
          <header><div><span>原始反馈</span><h2>收件箱</h2></div><div class="panel-header-actions"><small>${visible.length} 条结果</small>${visible.length > 5 ? `<button type="button" class="text-button" data-action="feedback-drawer-open">查看全部（${visible.length}）</button>` : ""}</div></header>
          ${visible.length ? `<div class="feedback-list" role="list" aria-label="合成原始反馈">
            ${visiblePreview.map((item) => `
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
        <header><div><span>反馈案件</span><h2>人工确认后的协同对象</h2></div><div class="panel-header-actions"><small>${cases.length} 条 · AI 不直接创建案件</small>${cases.length > 5 ? `<button type="button" class="text-button" data-action="case-drawer-open">查看全部（${cases.length}）</button>` : ""}</div></header>
        <div class="compact-table" role="table" aria-label="合成案件">
          <div role="row" class="table-head"><span>ID</span><span>案件</span><span>风险</span><span>证据</span><span>关系 / 状态</span></div>
          ${casePreview.map((item) => this.renderCaseRow(item)).join("")}
        </div>
      </section>
    `;
  }

  private renderCaseRow(item: CaseItem): string {
    const canUpdate = canPerform(this.state.role, "case:update_safe");
    const live = this.state.context?.mode === "lark";
    const editable = ["待补充", "待关联", "处理中", "待验证", "待回访"].includes(item.status);
    const disabledReason = !live
      ? "真实写入仅在飞书 Base 中开放"
      : !editable
        ? "已关闭案件不可从工作台倒退状态"
        : "当前角色不可更新案件";
    return `<div role="row"><code>${escapeHtml(item.id)}</code><b>${escapeHtml(item.title)}</b><span class="risk risk-${item.risk.toLocaleLowerCase("en-US")}">${item.risk}</span><span>${escapeHtml(item.evidence)}</span><span>${escapeHtml(item.relation)} · ${escapeHtml(item.status)} <button type="button" data-action="case-action-open" data-id="${escapeHtml(item.recordId)}"${buttonState(canUpdate && live && editable, disabledReason)}>详情与更新</button></span></div>`;
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
    const live = this.state.context?.mode === "lark";
    const workOrders = this.workOrderItems();
    return `
      <section class="section-heading split-heading"><div><span>OPERATIONS & SLA</span><h1>处置队列与原时钟</h1></div><p>改派、重试和升级都不重置最初 SLA 起点。</p></section>
      <section class="sla-board">
        ${[
          ["需要关注", workOrders.filter((item) => !NEUTRAL_ESCALATION_LEVELS.has(item.level))],
          ["进行中", workOrders.filter((item) => item.status === "处理中" || item.status === "待接单")],
          ["待验证", workOrders.filter((item) => item.status === "待验证")],
        ].map(([label, items]) => `
          <article class="sla-column panel">
            <header><h2>${label as string}</h2><span>${(items as WorkOrderItem[]).length}</span></header>
            ${(items as WorkOrderItem[]).map((item) => `<div class="order-card">
              <div><code>${item.id}</code><span class="level">${item.level}</span></div>
              <h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.owner)}</p>
              <footer><span>到期 ${escapeHtml(item.due)}</span><button type="button" data-action="work-order-action-open" data-id="${escapeHtml(item.recordId)}"${buttonState(canUpdate && live, live ? "当前角色不可更新工单" : "真实写入仅在飞书 Base 中开放")}>更新安全字段</button></footer>
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
    const live = this.state.context?.mode === "lark";
    const items = this.improvementItems();
    const clusterCount = this.rows("clusters").length || (this.state.context?.mode === "standalone-preview" ? 2 : 0);
    const improvementCount = this.rows("improvements").length || (this.state.context?.mode === "standalone-preview" ? 1 : 0);
    return `
      <section class="section-heading split-heading"><div><span>ISSUE & IMPROVEMENT</span><h1>问题地图与观察窗</h1></div><p>聚类只是候选；最终根因、立项和归档都需要人工确认。</p></section>
      <section class="issue-layout">
        <article class="panel issue-map">
          <header><div><span>跨事件关系</span><h2>问题簇服务端快照</h2></div><small>${clusterCount} 个问题簇</small></header>
          <div class="map-canvas" aria-label="问题簇关系概览">
            <span class="map-core"><b>${clusterCount} 个问题簇</b><small>候选关系，需人工审核</small></span>
            <span class="map-node n1">案件 ${this.rows("cases").length}</span><span class="map-node n2">工单 ${this.rows("work_orders").length}</span><span class="map-node n3">改进 ${improvementCount}</span><span class="map-node n4">审计 ${this.rows("ai_audit").length}</span>
          </div>
          <p class="guard-note">关系线只表示可追溯的候选相似性，不表示同一事故或已确认根因。</p>
        </article>
        <article class="panel observation-card">
          <header><div><span>改进观察</span><h2>${improvementCount} 个合成改进项目</h2></div><small>Base 服务端读回</small></header>
          <ol class="observation-timeline"><li class="done"><i>✓</i><b>人工立项</b><small>保留审核证据</small></li><li class="current"><i>7</i><b>7 天观察</b><small>不自动下结论</small></li><li><i>30</i><b>30 天观察</b><small>沿用原时钟</small></li><li><i>↗</i><b>归档 / 重开</b><small>待人工结论</small></li></ol>
        </article>
      </section>
      <section class="panel improvement-list">
        <header><div><span>问题与改进对象</span><h2>候选、证据和人工关口</h2></div></header>
        ${items.map((item) => `<article><span class="risk risk-${item.risk.toLocaleLowerCase("en-US")}">${item.risk}</span><span><code>${escapeHtml(item.id)}</code><b>${escapeHtml(item.title)}</b><small>${escapeHtml(item.next)}</small></span><em>${escapeHtml(item.status)}</em>${item.target === "improvement" ? `<button type="button" data-action="improvement-action-open" data-id="${escapeHtml(item.recordId)}"${buttonState(canReview && live, live ? "仅 Owner 或审核角色可确认" : "真实写入仅在飞书 Base 中开放")}>人工确认</button>` : `<button type="button" data-table="clusters">查看问题簇</button>`}</article>`).join("")}
      </section>
    `;
  }

  private renderAiAudit(): string {
    const canReview = canPerform(this.state.role, "review:decide");
    const live = this.state.context?.mode === "lark";
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
          ${this.auditItems().map((item) => `<div role="row"><code>${escapeHtml(item.runId)}</code><span><b>${escapeHtml(item.node)}</b><small>${escapeHtml(item.object)}</small></span><em class="validation ${item.validation === "验证失败" || item.validation === "需人工处理" ? "needs-human" : ""}">${escapeHtml(item.validation)}</em><span>${item.retry}/1</span><span>${escapeHtml(item.review)}</span><button type="button" data-action="audit-action-open" data-id="${escapeHtml(item.recordId)}"${buttonState(canReview && live, live ? "当前角色不可提交审核结论" : "真实写入仅在飞书 Base 中开放")}>审核</button></div>`).join("")}
        </div>
      </section>
      <section class="review-actions panel"><div><span>角色策略</span><h2>${ROLE_LABELS[this.state.role]} 当前处理步骤</h2></div><ol><li>在上方选定一条 AI 审计</li><li>点“审核”查看原值和影响</li><li>选择确认、退回补证或驳回</li><li>写入后精确读回</li></ol><p>人工修订只追加 human_revision 与审核字段，不覆盖原始模型输出。</p></section>
    `;
  }

  private renderMasterData(): string {
    const tableCount = (key: string, fallback: number) => this.state.context?.tables.find((table) => table.key === key)?.count ?? fallback;
    const compactRows = (key: string, fields: [string, string, string]): string[][] => this.rows(key).slice(0, 4).map((row) => [
      cellText(row.fields[fields[0]]) || row.recordId,
      cellText(row.fields[fields[1]]) || "未填写",
      cellText(row.fields[fields[2]]) || "未填写",
    ]);
    const groups = [
      { title: "车辆档案", key: "vehicles", count: tableCount("vehicles", 8), boundary: "只读业务快照，不提供控制动作", rows: this.state.context?.mode === "standalone-preview" ? [["SYN-VEHICLE-X6-107", "X6 · 4.0-demo", "合成站点 A"]] : compactRows("vehicles", ["vehicle_id", "model_version", "site_owner"]) },
      { title: "配送任务", key: "delivery_tasks", count: tableCount("delivery_tasks", 12), boundary: "只用于证据关联，不改变任务状态", rows: this.state.context?.mode === "standalone-preview" ? [["SYN-TASK-8458", "合成路线 A-17", "延误候选"]] : compactRows("delivery_tasks", ["task_id", "route_summary", "status"]) },
      { title: "站点责任矩阵", key: "routing_matrix", count: tableCount("routing_matrix", 20), boundary: "版本化规则；启用需 Owner 人工确认", rows: this.state.context?.mode === "standalone-preview" ? [["SYN-ROUTE-DOOR-01", "舱门柜体", "车辆运维候选"]] : compactRows("routing_matrix", ["routing_rule_id", "category_detail", "responsible_team"]) },
      { title: "知识索引", key: "knowledge_index", count: tableCount("knowledge_index", 5), boundary: "草稿审核后才可发布", rows: this.state.context?.mode === "standalone-preview" ? [["SYN-KNOW-001", "舱门异常核查清单", "待审核"]] : compactRows("knowledge_index", ["knowledge_id", "title", "approval_status"]) },
    ];
    const canPublish = canPerform(this.state.role, "knowledge:publish");
    const live = this.state.context?.mode === "lark";
    const pendingKnowledge = this.rows("knowledge_index").find((row) => cellText(row.fields.approval_status) === "待审核");
    return `
      <section class="section-heading split-heading"><div><span>MASTER DATA & KNOWLEDGE</span><h1>关联证据，不接管业务状态</h1></div><p>车辆、任务和规则用于核对候选；知识发布保留人工审核。</p></section>
      <section class="master-grid">${groups.map((group) => `<article class="panel master-card"><header><div><span>${group.count} 条</span><h2>${group.title}</h2></div><button type="button" data-table="${group.key}">打开表</button></header><p>${group.boundary}</p>${group.rows.map((row) => `<div class="master-row"><code>${row[0]}</code><b>${row[1]}</b><small>${row[2]}</small></div>`).join("")}${group.key === "knowledge_index" ? `<button class="full-action" type="button" data-action="knowledge-action-open" data-id="${escapeHtml(pendingKnowledge?.recordId ?? "")}"${buttonState(canPublish && Boolean(pendingKnowledge) && live, !live ? "真实写入仅在飞书 Base 中开放" : pendingKnowledge ? "仅 Owner 或审核角色可审核知识" : "当前没有可审核的知识记录")}>审核知识草稿</button>` : ""}</article>`).join("")}</section>
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
    if (this.state.modal.kind === "connector-confirm") return this.renderConnectorConfirmation(this.state.modal);
    if (this.state.modal.kind === "business") return this.renderBusinessActionDialog(this.state.modal.target);
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

  private renderBusinessActionDialog(target: LiveActionTarget): string {
    const title = target.kind === "case-safe" ? "案件详情与安全更新"
      : target.kind === "work-order-safe" ? "工单安全字段更新"
        : target.kind === "improvement-review" ? "改进项目人工确认"
          : target.kind === "ai-review" ? "AI 审计人工决策"
            : "知识草稿审核";
    const current = target.kind === "case-safe"
      ? [["状态", target.fields.status], ["证据摘要", target.fields.evidence_summary]]
      : target.kind === "work-order-safe"
        ? [["状态", target.fields.status], ["处置证据", target.fields.disposition_evidence]]
        : target.kind === "improvement-review"
          ? [["状态", target.fields.status], ["7 天结果", target.fields.day_7_result], ["30 天结果", target.fields.day_30_result], ["人工结论", target.fields.human_conclusion]]
          : target.kind === "ai-review"
            ? [["审核状态", target.fields.review_action], ["人工修订", target.fields.human_revision]]
            : [["审核状态", target.fields.approval_status], ["N7 可引用", target.fields.citation_allowed_for_n7], ["备注", target.fields.note]];
    const controls = target.kind === "case-safe" ? `
      <label>新状态<select name="status" required>${["待补充", "待关联", "处理中", "待验证", "待回访"].map((value) => option(value, value, cellText(target.fields.status))).join("")}</select></label>
      <label class="wide">证据摘要<textarea name="note" required minlength="4" maxlength="2000">${escapeHtml(cellText(target.fields.evidence_summary))}</textarea></label>`
      : target.kind === "work-order-safe" ? `
        <label>新状态<select name="status" required>${["待接单", "处理中"].map((value) => option(value, value, cellText(target.fields.status))).join("")}</select></label>
        <label class="wide">处置证据<select name="note" required>${["等待补齐证据", "已上传合成处置证据"].map((value) => option(value, value, cellText(target.fields.disposition_evidence))).join("")}</select></label>`
        : target.kind === "improvement-review" ? `
          <label>人工决策<select name="decision" required><option value="keep_observing">记录观察结论（状态不变）</option></select></label>
          <label class="wide">人工结论<textarea name="note" required minlength="4" maxlength="2000">${escapeHtml(cellText(target.fields.human_conclusion))}</textarea></label>`
          : target.kind === "ai-review" ? `
            <label>审核决策<select name="decision" required><option value="approved">确认候选</option><option value="revision_requested">退回补证</option><option value="rejected">驳回候选</option></select></label>
            <label class="wide">审核说明<textarea name="note" required minlength="4" maxlength="2000" placeholder="说明依据，不覆盖模型原始输出"></textarea></label>`
            : `
              <label>审核决策<select name="decision" required><option value="approved">审核通过并允许 N7 引用</option><option value="rejected">驳回草稿</option></select></label>
              <label class="wide">审核说明<textarea name="note" required minlength="4" maxlength="2000">${escapeHtml(cellText(target.fields.note))}</textarea></label>`;
    return `<div class="dialog-layer">
      <button type="button" class="dialog-scrim" data-action="modal-close" aria-label="关闭操作小页面"></button>
      <section class="dialog business-action-dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title">
        <header><div><span>LIVE SYNTHETIC ACTION</span><h2 id="dialog-title">${title}</h2></div><button type="button" class="icon-button" data-action="modal-close" aria-label="关闭">×</button></header>
        <div class="action-target"><span>操作对象</span><code>${escapeHtml(target.businessId)}</code><em>synthetic_experiment</em></div>
        <dl class="action-current-values">${current.map(([label, value]) => `<div><dt>${label}</dt><dd>${escapeHtml(cellText(value)) || "空"}</dd></div>`).join("")}</dl>
        <form id="business-action-form" class="dialog-form">
          <div class="form-grid">${controls}</div>
          <label class="confirm-write">写入确认
            <select name="confirmed" required>
              <option value="">请选择</option>
              <option value="yes">我已核对对象和变更；写入飞书后立即读回</option>
            </select>
          </label>
          <footer><button type="button" class="secondary-button" data-action="modal-close">取消</button><button type="submit" class="primary-button"${this.state.busy ? " disabled" : ""}>${this.state.busy ? "正在写入并读回…" : "确认写入飞书"}</button></footer>
        </form>
      </section>
    </div>`;
  }

  private renderConnectorConfirmation(modal: Extract<NonNullable<ModalState>, { kind: "connector-confirm" }>): string {
    const rotating = modal.operation === "rotate";
    return `<div class="dialog-layer">
      <button type="button" class="dialog-scrim" data-action="modal-close" aria-label="关闭连接器确认"></button>
      <section class="dialog connector-confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title">
        <header><div><span>CONNECTOR SAFETY</span><h2 id="dialog-title">${rotating ? "确认轮换密钥" : "确认停用连接器"}</h2></div><button type="button" class="icon-button" data-action="modal-close" aria-label="关闭">×</button></header>
        <p>对象：<b>${escapeHtml(modal.connectorName)}</b></p>
        <p class="form-boundary">${rotating ? "轮换后旧密钥会立即失效；新密钥只显示一次。" : "停用后新请求会被拒绝；既有反馈和审计不会删除。"}</p>
        <form id="connector-confirm-form" class="dialog-form" data-operation="${modal.operation}" data-id="${escapeHtml(modal.connectorId)}">
          <label>操作确认<select name="confirmed" required><option value="">请选择</option><option value="yes">我理解影响并确认${rotating ? "轮换" : "停用"}</option></select></label>
          <footer><button type="button" class="secondary-button" data-action="modal-close">取消</button><button type="submit" class="primary-button">确认${rotating ? "轮换" : "停用"}</button></footer>
        </form>
      </section>
    </div>`;
  }

  private renderDrawer(): string {
    if (!this.state.drawer) return "";
    const feedbackDrawer = this.state.drawer.kind === "feedback-list";
    const visible = this.visibleFeedback();
    const cases = this.caseItems();
    const selected = this.selectedFeedback();
    return `
      <div class="drawer-layer">
        <button type="button" class="drawer-scrim" data-action="drawer-close" aria-label="关闭小页面"></button>
        <section class="list-drawer" role="dialog" aria-modal="true" aria-labelledby="drawer-title">
          <header>
            <div><span>${feedbackDrawer ? "RAW FEEDBACK" : "CASES"}</span><h2 id="drawer-title">${feedbackDrawer ? `全部收件箱（${visible.length}）` : `全部反馈案件（${cases.length}）`}</h2></div>
            <button type="button" class="icon-button" data-action="drawer-close" aria-label="关闭">×</button>
          </header>
          <div class="drawer-content ${feedbackDrawer ? "feedback-drawer-content" : "case-drawer-content"}">
            ${feedbackDrawer ? `
              <div class="drawer-feedback-list feedback-list" role="list" aria-label="全部合成原始反馈">
                ${visible.map((item) => `
                  <button type="button" role="listitem" class="feedback-row ${selected?.id === item.id ? "selected" : ""}" data-feedback="${escapeHtml(item.id)}">
                    <span class="source-avatar">${escapeHtml(item.channel.slice(0, 1))}</span>
                    <span class="feedback-copy"><b>${escapeHtml(item.title)}</b><small>${escapeHtml(item.channel)} · ${escapeHtml(formatTime(item.receivedAt))}</small></span>
                    <span class="risk risk-${item.risk.toLocaleLowerCase("en-US")}">${item.risk}</span>
                    <span class="row-status">${escapeHtml(item.status)}</span>
                    <span aria-hidden="true">›</span>
                  </button>
                `).join("")}
              </div>
              <div class="drawer-feedback-detail">${this.renderFeedbackDetail(selected)}</div>
            ` : `
              <div class="compact-table drawer-case-table" role="table" aria-label="全部合成案件">
                <div role="row" class="table-head"><span>ID</span><span>案件</span><span>风险</span><span>证据</span><span>关系 / 状态</span></div>
                ${cases.map((item) => this.renderCaseRow(item)).join("")}
              </div>
            `}
          </div>
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
    this.root.querySelectorAll<HTMLButtonElement>('.filter-trigger, .filter-menu [role="option"]').forEach((button) => {
      button.addEventListener("keydown", (event) => this.handleFilterKeydown(event, button));
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
    this.root.querySelector<HTMLFormElement>("#business-action-form")?.addEventListener("submit", (event) => void this.submitBusinessAction(event));
    this.root.querySelector<HTMLFormElement>("#connector-confirm-form")?.addEventListener("submit", (event) => void this.submitConnectorConfirmation(event));
    if (this.state.modal || this.state.drawer) {
      requestAnimationFrame(() => {
        const initial = this.root.querySelector<HTMLElement>("[data-initial-focus]")
          ?? this.root.querySelector<HTMLElement>(".dialog button, .list-drawer button");
        initial?.focus();
      });
    }
  }

  private changeTab(tab: TabKey): void {
    this.state.tab = tab;
    this.state.drawer = null;
    this.render();
    requestAnimationFrame(() => {
      const panel = this.root.querySelector<HTMLElement>(`#panel-${tab}`);
      panel?.scrollIntoView({ block: "start", behavior: "smooth" });
      panel?.focus();
    });
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

  private handleFilterKeydown(event: KeyboardEvent, button: HTMLButtonElement): void {
    const key = button.dataset.filterKey as FilterKey | undefined;
    if (!key) return;
    if (button.classList.contains("filter-trigger")) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        this.state.openFilter = key;
        this.render();
        requestAnimationFrame(() => this.root.querySelector<HTMLButtonElement>(`.filter-menu [data-filter-key="${key}"]`)?.focus());
      }
      if (event.key === "Escape" && this.state.openFilter) {
        event.preventDefault();
        this.closeFilterMenu(key);
      }
      return;
    }
    const options = Array.from(this.root.querySelectorAll<HTMLButtonElement>(`.filter-menu [data-filter-key="${key}"]`));
    const current = options.indexOf(button);
    const next = event.key === "ArrowDown" ? (current + 1) % options.length
      : event.key === "ArrowUp" ? (current - 1 + options.length) % options.length
        : event.key === "Home" ? 0
          : event.key === "End" ? options.length - 1
            : -1;
    if (next >= 0) {
      event.preventDefault();
      options[next]?.focus();
    }
    if (event.key === "Escape" || event.key === "Tab") {
      if (event.key === "Escape") event.preventDefault();
      this.closeFilterMenu(key, event.key === "Escape");
    }
  }

  private closeFilterMenu(key: FilterKey, restoreFocus = true): void {
    this.state.openFilter = null;
    this.render();
    if (restoreFocus) requestAnimationFrame(() => this.root.querySelector<HTMLButtonElement>(`[data-action="filter-toggle"][data-filter-key="${key}"]`)?.focus());
  }

  private async handleAction(button: HTMLButtonElement): Promise<void> {
    const action = button.dataset.action;
    let returnFocusSelector: string | null = null;
    if (action === "clear-filters") {
      this.state.filters = { mode: this.state.mode, source: "all", timeRange: "all", risk: "all", status: "all", query: "" };
      this.state.openFilter = null;
      this.render();
      return;
    }
    if (action === "filter-toggle") {
      const key = button.dataset.filterKey as FilterKey;
      this.state.openFilter = this.state.openFilter === key ? null : key;
    }
    if (action === "filter-select") {
      const key = button.dataset.filterKey as FilterKey;
      const value = button.dataset.filterValue ?? "all";
      this.state.filters = { ...this.state.filters, [key]: value } as WorkbenchFilters;
      this.state.openFilter = null;
      this.state.notice = `筛选已更新：${button.textContent?.replace("✓", "").trim() ?? value}`;
      this.state.noticeTone = "neutral";
      returnFocusSelector = `[data-action="filter-toggle"][data-filter-key="${key}"]`;
    }
    if (action === "filter-close") {
      const key = button.dataset.filterKey as FilterKey;
      this.state.openFilter = null;
      returnFocusSelector = `[data-action="filter-toggle"][data-filter-key="${key}"]`;
    }
    if (action === "connector-open") {
      this.modalReturnFocusSelector = '[data-action="connector-open"]';
      this.state.modal = { kind: "connector" };
    }
    if (action === "manual-open") {
      this.modalReturnFocusSelector = '[data-action="manual-open"]';
      this.state.modal = { kind: "manual" };
    }
    if (action === "feedback-drawer-open") {
      this.modalReturnFocusSelector = '[data-action="feedback-drawer-open"]';
      this.state.drawer = { kind: "feedback-list" };
    }
    if (action === "case-drawer-open") {
      this.modalReturnFocusSelector = '[data-action="case-drawer-open"]';
      this.state.drawer = { kind: "case-list" };
    }
    const businessTarget = action === "case-action-open" ? this.caseActionTarget(button.dataset.id ?? "")
      : action === "work-order-action-open" ? this.workOrderActionTarget(button.dataset.id ?? "")
        : action === "improvement-action-open" ? this.improvementActionTarget(button.dataset.id ?? "")
          : action === "audit-action-open" ? this.auditActionTarget(button.dataset.id ?? "")
            : action === "knowledge-action-open" ? this.knowledgeActionTarget(button.dataset.id ?? "")
              : null;
    if (businessTarget) {
      this.modalReturnFocusSelector = `[data-action="${action}"][data-id="${CSS.escape(button.dataset.id ?? "")}"]`;
      this.state.modal = { kind: "business", target: businessTarget };
    }
    if (action === "drawer-close") {
      returnFocusSelector = this.modalReturnFocusSelector;
      this.state.drawer = null;
      this.modalReturnFocusSelector = null;
    }
    if (action === "modal-close") {
      returnFocusSelector = this.modalReturnFocusSelector;
      this.state.modal = null;
      this.state.busy = false;
      this.modalReturnFocusSelector = null;
      this.state.notice = "一次性内容已从工作台内存中清除。";
      this.state.noticeTone = "neutral";
    }
    if (action === "connector-disable" || action === "connector-rotate") {
      const connectorId = button.dataset.id ?? "";
      const connector = this.state.connectors.find((item) => item.id === connectorId);
      if (connector) {
        this.modalReturnFocusSelector = `[data-action="${action}"][data-id="${CSS.escape(connectorId)}"]`;
        this.state.modal = {
          kind: "connector-confirm",
          operation: action === "connector-rotate" ? "rotate" : "disable",
          connectorId,
          connectorName: connector.displayName,
        };
      }
    }
    if (action === "secret-copy") await this.copySecret();
    this.render();
    if (returnFocusSelector) {
      requestAnimationFrame(() => this.root.querySelector<HTMLElement>(returnFocusSelector)?.focus());
    }
  }

  private rowTarget(
    kind: LiveActionTarget["kind"],
    tableKey: LiveActionTarget["tableKey"],
    row: BaseRecordRow | undefined,
    businessField: string,
  ): LiveActionTarget | null {
    if (!row) return null;
    return {
      kind,
      tableKey,
      recordId: row.recordId,
      businessId: cellText(row.fields[businessField]) || row.recordId,
      dataScope: cellText(row.fields.data_scope),
      fields: row.fields,
    };
  }

  private caseActionTarget(recordId: string): LiveActionTarget | null {
    return this.rowTarget("case-safe", "cases", this.rows("cases").find((row) => row.recordId === recordId), "case_id");
  }

  private workOrderActionTarget(recordId: string): LiveActionTarget | null {
    return this.rowTarget("work-order-safe", "work_orders", this.rows("work_orders").find((row) => row.recordId === recordId), "work_order_id");
  }

  private improvementActionTarget(recordId: string): LiveActionTarget | null {
    return this.rowTarget("improvement-review", "improvements", this.rows("improvements").find((row) => row.recordId === recordId), "improvement_id");
  }

  private auditActionTarget(recordId: string): LiveActionTarget | null {
    return this.rowTarget("ai-review", "ai_audit", this.rows("ai_audit").find((row) => row.recordId === recordId), "run_id");
  }

  private knowledgeActionTarget(recordId: string): LiveActionTarget | null {
    return this.rowTarget("knowledge-review", "knowledge_index", this.rows("knowledge_index").find((row) => row.recordId === recordId), "knowledge_id");
  }

  private async submitBusinessAction(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    const modal = this.state.modal;
    if (modal?.kind !== "business" || this.state.context?.mode !== "lark") {
      this.setNotice("真实写入只能在已连接的飞书 Base 中执行。", "error");
      return;
    }
    const form = new FormData(event.currentTarget as HTMLFormElement);
    if (String(form.get("confirmed") ?? "") !== "yes") {
      this.setNotice("请先明确确认本次写入。", "error");
      return;
    }
    const input = {
      actorId: this.state.context.actorId,
      observedAt: new Date().toISOString(),
      status: String(form.get("status") ?? ""),
      decision: String(form.get("decision") ?? ""),
      note: String(form.get("note") ?? ""),
    } satisfies LiveActionInput;
    this.state.busy = true;
    this.render();
    try {
      const plan = createLiveActionPlan(this.state.role, modal.target, input);
      const receipt = await this.base.updateSyntheticRecord({
        tableKey: plan.tableKey,
        recordId: plan.recordId,
        expected: plan.expected,
        changes: plan.changes,
      });
      await this.reloadRecords();
      this.state.modal = null;
      this.state.notice = `${plan.summary}；${receipt.changedFields.length} 个字段已写入并读回通过。`;
      this.state.noticeTone = "success";
    } catch (error) {
      this.state.notice = error instanceof Error ? error.message : "业务操作失败";
      this.state.noticeTone = "error";
    } finally {
      this.state.busy = false;
      this.render();
    }
  }

  private async submitConnectorConfirmation(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    const modal = this.state.modal;
    if (modal?.kind !== "connector-confirm") return;
    const form = new FormData(event.currentTarget as HTMLFormElement);
    if (String(form.get("confirmed") ?? "") !== "yes") {
      this.setNotice("请先明确确认连接器操作。", "error");
      return;
    }
    this.state.modal = null;
    if (modal.operation === "rotate") await this.rotateConnector(modal.connectorId);
    else await this.disableConnector(modal.connectorId);
    this.render();
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
      if (this.state.context?.mode === "lark") await this.reloadRecords();
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
    if (event.key === "Escape" && this.state.openFilter) {
      const key = this.state.openFilter;
      this.closeFilterMenu(key);
      return;
    }
    if (event.key === "Escape" && (this.state.modal || this.state.drawer)) {
      const returnFocusSelector = this.modalReturnFocusSelector;
      this.state.modal = null;
      this.state.drawer = null;
      this.state.busy = false;
      this.modalReturnFocusSelector = null;
      this.state.notice = "一次性内容已从工作台内存中清除。";
      this.state.noticeTone = "neutral";
      this.render();
      if (returnFocusSelector) {
        requestAnimationFrame(() => this.root.querySelector<HTMLElement>(returnFocusSelector)?.focus());
      }
    }
    if (event.key === "Tab" && (this.state.modal || this.state.drawer)) {
      const focusable = Array.from(this.root.querySelectorAll<HTMLElement>(
        '.dialog button:not([disabled]), .dialog input:not([disabled]), .dialog select:not([disabled]), .dialog textarea:not([disabled]), .dialog summary, .dialog [tabindex]:not([tabindex="-1"]), .list-drawer button:not([disabled]), .list-drawer summary, .list-drawer [tabindex]:not([tabindex="-1"])',
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
