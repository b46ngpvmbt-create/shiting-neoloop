export type WorkbenchRole = "owner" | "operations" | "reviewer" | "judge";
export type WorkbenchMode = "daily" | "demo";
export type TabKey =
  | "overview"
  | "intake-cases"
  | "sla"
  | "improvement"
  | "ai-audit"
  | "master-data";

export type Action =
  | "record:view"
  | "table:open"
  | "connector:create"
  | "connector:disable"
  | "connector:rotate"
  | "feedback:create_manual"
  | "case:update_safe"
  | "work_order:update_safe"
  | "review:decide"
  | "knowledge:publish"
  | "vehicle:control";

export type FeedbackItem = {
  id: string;
  dataScope: "synthetic_experiment";
  title: string;
  source: string;
  sourceType: string;
  sourceName: string;
  sourceRecordId: string;
  sourceTenantScope: string;
  sourceLocator: string;
  sourceTimezone: string;
  authorizationScope: string;
  idempotencyKey: string;
  sha256: string;
  channel: string;
  senderRole: string;
  receivedAt: string;
  risk: "P0" | "P1" | "P2" | "P3";
  status: "待分诊" | "人工处理" | "已建案" | "已忽略";
  originalText: string;
  linkedCaseId: string | null;
  candidateVehicleId: string | null;
  candidateTaskId: string | null;
  attachments: ReadonlyArray<{
    name: string;
    mediaType: string;
    byteLength: number;
    sourceLocator: string;
    sha256: string;
  }>;
};

export type WorkbenchFilters = {
  mode: WorkbenchMode;
  source: string;
  timeRange: "all" | "today" | "7d" | "30d";
  risk: "all" | FeedbackItem["risk"];
  status: "all" | FeedbackItem["status"];
  query: string;
};

export const WORKBENCH_TABS = Object.freeze([
  { key: "overview", label: "总览", shortLabel: "总览" },
  { key: "intake-cases", label: "接入与案件", shortLabel: "接入" },
  { key: "sla", label: "处置与 SLA", shortLabel: "SLA" },
  { key: "improvement", label: "问题与改进", shortLabel: "改进" },
  { key: "ai-audit", label: "AI 与审计", shortLabel: "审计" },
  { key: "master-data", label: "主数据与知识", shortLabel: "主数据" },
] as const);

export const BASE_TABLES = Object.freeze([
  { key: "raw_feedback", name: "原始反馈", count: 33, group: "接入与案件", icon: "↓" },
  { key: "cases", name: "反馈案件", count: 32, group: "接入与案件", icon: "◇" },
  { key: "work_orders", name: "处置工单", count: 32, group: "处置与 SLA", icon: "✓" },
  { key: "clusters", name: "问题簇", count: 13, group: "问题与改进", icon: "∷" },
  { key: "improvements", name: "改进项目", count: 10, group: "问题与改进", icon: "↗" },
  { key: "ai_audit", name: "AI 审计", count: 13, group: "AI 与审计", icon: "◎" },
  { key: "vehicles", name: "车辆档案", count: 8, group: "主数据与知识", icon: "▭" },
  { key: "delivery_tasks", name: "配送任务", count: 12, group: "主数据与知识", icon: "⇄" },
  { key: "routing_matrix", name: "站点责任矩阵", count: 20, group: "主数据与知识", icon: "⌘" },
  { key: "knowledge_index", name: "知识索引", count: 5, group: "主数据与知识", icon: "≡" },
] as const);

export const PLATFORM_CARDS = Object.freeze([
  { id: "service-rating", label: "服务评价", description: "App、短信或服务完成评价", status: "unconfigured" as const, glyph: "★" },
  { id: "customer-group", label: "客户群", description: "群消息与协作渠道反馈", status: "unconfigured" as const, glyph: "○" },
  { id: "service-ticket", label: "服务工单", description: "客服与运维工单系统", status: "unconfigured" as const, glyph: "□" },
  { id: "hotline", label: "热线转录", description: "语音转写后的授权文本", status: "unconfigured" as const, glyph: "∿" },
  { id: "email", label: "服务邮箱", description: "授权邮箱的结构化转发", status: "unconfigured" as const, glyph: "@" },
  { id: "public-review", label: "公开评价", description: "具备平台授权时接入", status: "unconfigured" as const, glyph: "◉" },
] as const);

export const SAMPLE_FEEDBACK: ReadonlyArray<FeedbackItem> = Object.freeze([
  {
    id: "SYN-LIVE-DEMO-FEEDBACK-001",
    dataScope: "synthetic_experiment",
    title: "舱门连续两次无法解锁，配送任务已经延误",
    source: "generic-webhook-demo",
    sourceType: "service_rating",
    sourceName: "合成服务评价连接器",
    sourceRecordId: "SYN-SOURCE-DEMO-001",
    sourceTenantScope: "synthetic-tenant-demo",
    sourceLocator: "synthetic://service-rating/SYN-SOURCE-DEMO-001",
    sourceTimezone: "Asia/Shanghai",
    authorizationScope: "合成演示授权",
    idempotencyKey: "sha256:93c9…7bf1",
    sha256: "93c9c51b…7bf1",
    channel: "服务评价",
    senderRole: "合成客户",
    receivedAt: "2026-08-11T09:42:00+08:00",
    risk: "P1",
    status: "待分诊",
    originalText: "【合成反馈】舱门连续两次无法解锁，配送任务已经延误，请协助核对。",
    linkedCaseId: null,
    candidateVehicleId: "SYN-VEHICLE-X6-107",
    candidateTaskId: "SYN-TASK-8458",
    attachments: [
      {
        name: "synthetic-door-event.json",
        mediaType: "application/json",
        byteLength: 2840,
        sourceLocator: "synthetic://attachment/door-event-001",
        sha256: "18af3b2c…a9e4",
      },
    ],
  },
  {
    id: "SYN-LIVE-DEMO-FEEDBACK-002",
    dataScope: "synthetic_experiment",
    title: "收货点等待时间超过预计窗口",
    source: "generic-webhook-demo",
    sourceType: "customer_group",
    sourceName: "合成客户群连接器",
    sourceRecordId: "SYN-SOURCE-DEMO-002",
    sourceTenantScope: "synthetic-tenant-demo",
    sourceLocator: "synthetic://customer-group/SYN-SOURCE-DEMO-002",
    sourceTimezone: "Asia/Shanghai",
    authorizationScope: "合成演示授权",
    idempotencyKey: "sha256:7a21…a338",
    sha256: "7a2170de…a338",
    channel: "客户群",
    senderRole: "合成站点联系人",
    receivedAt: "2026-08-11T10:16:00+08:00",
    risk: "P2",
    status: "人工处理",
    originalText: "【合成反馈】今天收货点等待时间超过预计窗口，希望后续能提前提示。",
    linkedCaseId: "SYN-LIVE-DEMO-CASE-002",
    candidateVehicleId: null,
    candidateTaskId: "SYN-TASK-8461",
    attachments: [],
  },
  {
    id: "SYN-FEEDBACK-031",
    dataScope: "synthetic_experiment",
    title: "到站后未找到清晰的取货提示",
    source: "batch-demo",
    sourceType: "partner_feedback",
    sourceName: "合成合作方批量导入",
    sourceRecordId: "SYN-SOURCE-031",
    sourceTenantScope: "synthetic-tenant-baseline",
    sourceLocator: "synthetic://batch/SYN-SOURCE-031",
    sourceTimezone: "Asia/Shanghai",
    authorizationScope: "合成基线授权",
    idempotencyKey: "sha256:d84f…0d16",
    sha256: "d84f7ce0…0d16",
    channel: "合作方反馈",
    senderRole: "合成合作方",
    receivedAt: "2026-08-10T15:26:00+08:00",
    risk: "P3",
    status: "已建案",
    originalText: "【合成反馈】车辆到站后没有找到清晰的取货提示。",
    linkedCaseId: "SYN-CASE-031",
    candidateVehicleId: "SYN-VEHICLE-X3-014",
    candidateTaskId: "SYN-TASK-8431",
    attachments: [],
  },
  {
    id: "SYN-FEEDBACK-032",
    dataScope: "synthetic_experiment",
    title: "热线反馈配送状态说明不一致",
    source: "manual-demo",
    sourceType: "hotline_transcript",
    sourceName: "合成热线转录",
    sourceRecordId: "SYN-SOURCE-032",
    sourceTenantScope: "synthetic-tenant-baseline",
    sourceLocator: "synthetic://hotline/SYN-SOURCE-032",
    sourceTimezone: "Asia/Shanghai",
    authorizationScope: "合成基线授权",
    idempotencyKey: "sha256:af12…2c71",
    sha256: "af12e8aa…2c71",
    channel: "热线转录",
    senderRole: "合成客服",
    receivedAt: "2026-08-09T18:08:00+08:00",
    risk: "P2",
    status: "已忽略",
    originalText: "【合成反馈】热线中描述的配送状态与页面提示不一致。",
    linkedCaseId: null,
    candidateVehicleId: null,
    candidateTaskId: null,
    attachments: [
      {
        name: "synthetic-transcript.txt",
        mediaType: "text/plain",
        byteLength: 1620,
        sourceLocator: "synthetic://attachment/transcript-032",
        sha256: "d7742af2…bd18",
      },
    ],
  },
]);

const ROLE_ACTIONS: Readonly<Record<WorkbenchRole, ReadonlySet<Action>>> = Object.freeze({
  owner: new Set<Action>([
    "record:view",
    "table:open",
    "connector:create",
    "connector:disable",
    "connector:rotate",
    "feedback:create_manual",
    "case:update_safe",
    "work_order:update_safe",
    "review:decide",
    "knowledge:publish",
  ]),
  operations: new Set<Action>([
    "record:view",
    "table:open",
    "feedback:create_manual",
    "case:update_safe",
    "work_order:update_safe",
  ]),
  reviewer: new Set<Action>([
    "record:view",
    "table:open",
    "review:decide",
    "knowledge:publish",
  ]),
  judge: new Set<Action>(["record:view", "table:open"]),
});

export function canPerform(role: WorkbenchRole, action: string): boolean {
  return ROLE_ACTIONS[role].has(action as Action);
}

function matchesTimeRange(item: FeedbackItem, range: WorkbenchFilters["timeRange"]): boolean {
  if (range === "all") return true;
  const reference = Date.parse("2026-08-11T23:59:59+08:00");
  const timestamp = Date.parse(item.receivedAt);
  const days = range === "today" ? 1 : range === "7d" ? 7 : 30;
  return timestamp >= reference - days * 24 * 60 * 60 * 1000;
}

export function applyWorkbenchFilters(
  records: ReadonlyArray<FeedbackItem>,
  filters: WorkbenchFilters,
): FeedbackItem[] {
  const query = filters.query.trim().toLocaleLowerCase("zh-CN");
  return records.filter((item) => {
    if (filters.mode === "demo" && !item.id.startsWith("SYN-LIVE-DEMO-")) return false;
    if (filters.source !== "all" && item.sourceType !== filters.source) return false;
    if (filters.risk !== "all" && item.risk !== filters.risk) return false;
    if (filters.status !== "all" && item.status !== filters.status) return false;
    if (!matchesTimeRange(item, filters.timeRange)) return false;
    if (!query) return true;
    return [item.id, item.title, item.channel, item.sourceName, item.originalText]
      .some((value) => value.toLocaleLowerCase("zh-CN").includes(query));
  });
}

export const ROLE_LABELS: Readonly<Record<WorkbenchRole, string>> = Object.freeze({
  owner: "Owner",
  operations: "运营",
  reviewer: "审核",
  judge: "只读评委",
});

export const STATUS_METRICS = Object.freeze([
  { key: "feedback", label: "合成反馈", value: "33", detail: "自动接入为主，手工仅备用", tone: "mint" },
  { key: "attention", label: "待人工关注", value: "7", detail: "低置信、冲突或证据缺失", tone: "amber" },
  { key: "cases", label: "活跃案件", value: "12", detail: "AI 候选后必须人工确认", tone: "cyan" },
  { key: "sla", label: "SLA 关注", value: "3", detail: "改派不重置原时钟", tone: "rose" },
  { key: "audit", label: "AI 审计", value: "13", detail: "候选、校验与人工修订可追溯", tone: "violet" },
]);

export const AUDIT_SAMPLES = Object.freeze([
  {
    runId: "SYN-RUN-N1-20260811-001",
    node: "N1 事实提取",
    object: "SYN-LIVE-DEMO-FEEDBACK-001",
    validation: "candidate_validated",
    retry: 0,
    review: "待审核",
  },
  {
    runId: "SYN-RUN-N2-20260811-001",
    node: "N2 业务分类",
    object: "SYN-LIVE-DEMO-FEEDBACK-001",
    validation: "needs_human",
    retry: 1,
    review: "待补证",
  },
  {
    runId: "SYN-RUN-N3-20260811-001",
    node: "N3 风险建议",
    object: "SYN-LIVE-DEMO-FEEDBACK-002",
    validation: "candidate_validated",
    retry: 0,
    review: "已确认（合成）",
  },
]);

export const CASE_SAMPLES = Object.freeze([
  { id: "SYN-LIVE-DEMO-CASE-002", title: "收货点等待超窗", risk: "P2", status: "待关联", evidence: "2/3", relation: "2 条反馈" },
  { id: "SYN-CASE-017", title: "舱门解锁失败", risk: "P1", status: "处理中", evidence: "3/3", relation: "1 张工单" },
  { id: "SYN-CASE-031", title: "取货提示不清晰", risk: "P3", status: "待回访", evidence: "2/3", relation: "知识草稿待审" },
]);

export const WORK_ORDER_SAMPLES = Object.freeze([
  { id: "SYN-WO-017", title: "核对舱门控制链路证据", owner: "车辆运维候选", due: "11:20", level: "L1", status: "处理中" },
  { id: "SYN-WO-024", title: "补充收货点等待证据", owner: "运营支持候选", due: "15:30", level: "L0", status: "待接单" },
  { id: "SYN-WO-031", title: "复核取货提示文案", owner: "体验运营候选", due: "明日 10:00", level: "L0", status: "待验证" },
]);

export const IMPROVEMENT_SAMPLES = Object.freeze([
  { id: "SYN-CLUSTER-001", title: "舱门解锁失败模式", count: 4, risk: "P1", status: "待审核", next: "核对反证后决定是否立项" },
  { id: "SYN-CLUSTER-004", title: "到站提示不一致", count: 3, risk: "P2", status: "候选", next: "补足跨站点证据" },
  { id: "SYN-IMPROVEMENT-001", title: "解锁链路证据面板", count: 0, risk: "P1", status: "观察中", next: "7/30 天观察窗保持空值" },
]);
