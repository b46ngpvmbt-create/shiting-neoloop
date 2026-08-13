import {
  caseRows,
  evidenceBoundaries,
  feedbackRows,
  improvementRows,
  mainStory,
  problemRows,
  slaRows,
  type EvidenceClass,
  type ViewKey,
} from "../public-snapshot";

export type FilterMode = "all" | "story" | "attention";
export type WorkbenchMode = "snapshot" | "sandbox";

export type SourceDetails = {
  channel: string;
  sourceSystem: string;
  sourceType: string;
  sourceRecordId: string;
  receivedAt: string;
  authorization: string;
  idempotencyKey: string;
  originalExcerpt: string;
  linkedCaseId: string;
};

export type ConsoleRecord = {
  id: string;
  title: string;
  eyebrow: string;
  status: string;
  evidence: EvidenceClass;
  isStory: boolean;
  attention: boolean;
  summary: string;
  relation: string;
  fields: Array<{ label: string; value: string; synthetic?: boolean }>;
  humanGate: string;
  safeBoundary: string;
  source?: SourceDetails;
};

export type SandboxStep = {
  key: string;
  actionId: `sandbox.${string}`;
  label: string;
  shortLabel: string;
  layer: "接入协议" | "硬规则" | "AI 候选" | "人工关口" | "确定性工作流" | "证据状态";
  view: ViewKey;
  objectId: string;
  description: string;
  evidence: string;
  output: string;
  intent: string;
  action: string;
  isHumanGate: boolean;
  reviewContract?: {
    returnTarget: string;
    rejectTarget: string;
    nextOwnerRole: string;
  };
};

export const viewDescriptions: Record<ViewKey, string> = {
  feedback_inbox: "核对来源、授权边界、幂等键和案件关联。",
  case_cockpit: "把分诊、实体候选、人工确认与处置进度放在同一条路径上。",
  sla_board: "查看责任候选、原 SLA 时钟和需要接管的工单。",
  problem_map: "从独立案件中识别重复模式，保留根因假设的证据边界。",
  improvement_tracker: "跟踪人工立项、7/30 天观察和归档或复发重开。",
};

export const storyTargets: Array<{ view: ViewKey; id: string; label: string; sublabel: string }> = [
  { view: "feedback_inbox", id: "SYN-FEEDBACK-003", label: "来源", sublabel: "客户群反馈" },
  { view: "case_cockpit", id: "SYN-CASE-017", label: "个案", sublabel: "一次反馈处置" },
  { view: "problem_map", id: "SYN-CLUSTER-001", label: "问题簇", sublabel: "跨事件模式" },
  { view: "improvement_tracker", id: "SYN-IMPROVEMENT-001", label: "改进", sublabel: "7/30 天观察" },
];

const sourceProfiles: Record<string, { system: string; type: string }> = {
  "客户群": { system: "客户协作渠道适配器（设计）", type: "群消息" },
  "车辆事件": { system: "车辆事件接口（设计）", type: "系统事件" },
  "运维工单": { system: "运维工单同步器（设计）", type: "工单记录" },
  "热线转录": { system: "客服热线转录器（设计）", type: "语音转写" },
  "邮件": { system: "服务邮箱接收器（设计）", type: "邮件" },
  "服务评价": { system: "App 服务评价接口（设计）", type: "评价记录" },
  "线下沟通转录": { system: "现场纪要导入器（设计）", type: "转录记录" },
};

function shortTime(value: string | null | undefined) {
  if (!value) return "—";
  return value.replace("T", " ").slice(0, 16);
}

function stableSuffix(id: string) {
  return id.replace(/^SYN-/, "").replaceAll("-", "_").toLocaleLowerCase("en-US");
}

function sourceDetails(row: (typeof feedbackRows)[number]): SourceDetails {
  const profile = sourceProfiles[row.channel] ?? {
    system: "多渠道接入适配器（设计）",
    type: "反馈记录",
  };
  const storyText = row.linked_case_id === mainStory.source_case_id
    ? mainStory.replay_input.original_text
    : `合成反馈摘要：${row.linkedCase?.summary ?? "等待人工补充上下文。"}`;

  return {
    channel: row.channel,
    sourceSystem: profile.system,
    sourceType: profile.type,
    sourceRecordId: `SYN-SOURCE-${row.feedback_id.slice(-3)}`,
    receivedAt: shortTime(row.received_at),
    authorization: "合成授权范围",
    idempotencyKey: `syn:${stableSuffix(row.feedback_id)}`,
    originalExcerpt: storyText,
    linkedCaseId: row.linked_case_id ?? "待关联",
  };
}

export function evidenceLabel(value: EvidenceClass) {
  return evidenceBoundaries.find((item) => item.evidence_class === value)?.label ?? value;
}

export function buildRecords(view: ViewKey): ConsoleRecord[] {
  if (view === "feedback_inbox") {
    return feedbackRows.map((row) => {
      const source = sourceDetails(row);
      return {
        id: row.feedback_id,
        title: row.linkedCase?.title ?? "尚未关联案件",
        eyebrow: `${source.channel} · ${source.sourceType}`,
        status: row.processing_status,
        evidence: row.evidence_class,
        isStory: row.linked_case_id === mainStory.source_case_id,
        attention: row.missing_fields.length > 0 || !row.linked_case_id,
        summary: source.originalExcerpt,
        relation: row.linked_case_id ? `关联 ${row.linked_case_id}` : "没有正式案件关系",
        source,
        fields: [
          { label: "来源系统", value: source.sourceSystem, synthetic: true },
          { label: "来源记录 ID", value: source.sourceRecordId, synthetic: true },
          { label: "幂等键", value: source.idempotencyKey, synthetic: true },
          { label: "授权状态", value: source.authorization, synthetic: true },
          { label: "缺失字段", value: row.missing_fields.join("、") || "无" },
          { label: "重复候选", value: row.duplicate_candidate_status },
        ],
        humanGate: "来源授权或关键字段异常时停止接入，由授权人员确认。",
        safeBoundary: "来源系统、记录 ID 和幂等键是合成显示字段；本页不读写真实渠道。",
      };
    });
  }

  if (view === "case_cockpit") {
    return caseRows.flatMap((row) => {
      const item = row.caseRecord;
      if (!item) return [];
      return [{
        id: item.case_id,
        title: item.title,
        eyebrow: `${item.final_risk ?? "未定级"} · ${item.category_domain}`,
        status: item.status,
        evidence: item.evidence_class,
        isStory: item.case_id === mainStory.source_case_id,
        attention: item.formal_entity_confirmation_status !== "已确认" || item.final_risk === "P0" || item.final_risk === "P1",
        summary: item.summary,
        relation: `${row.feedback_ids.length} 条反馈 · ${row.work_order_ids.length} 张工单 · ${row.cluster_id ?? "未进入问题簇"}`,
        fields: [
          { label: "车辆候选", value: item.candidate_vehicle_id ?? "无" },
          { label: "任务候选", value: item.candidate_task_id ?? "无" },
          { label: "站点候选", value: item.candidate_station_id ?? "无" },
          { label: "候选置信度", value: item.candidate_confidence === null ? "—" : `${Math.round(item.candidate_confidence * 100)}%` },
          { label: "实体确认", value: item.formal_entity_confirmation_status },
          { label: "责任确认", value: item.routing_confirmation_status },
        ],
        humanGate: "正式实体和正式责任必须分别由授权人员确认。",
        safeBoundary: "AI 只生成候选，不控制车辆，也不自动判定责任。",
      } satisfies ConsoleRecord];
    });
  }

  if (view === "sla_board") {
    return slaRows.flatMap((row) => {
      const order = row.workOrder;
      if (!order) return [];
      return [{
        id: order.work_order_id,
        title: row.caseRecord?.title ?? order.action,
        eyebrow: `${order.team} · ${order.escalation_level}`,
        status: order.status,
        evidence: order.evidence_class,
        isStory: order.case_id === mainStory.source_case_id,
        attention: order.status !== "已完成" || order.escalation_level !== "L0",
        summary: order.action,
        relation: `来自 ${order.case_id} · 责任候选 ${order.assignee_role}`,
        fields: [
          { label: "SLA 到期", value: shortTime(order.due_at) },
          { label: "首次响应目标", value: order.first_response_target_minutes === null ? "—" : `${order.first_response_target_minutes} 分钟` },
          { label: "原时钟重置", value: `${order.sla_reset_count} 次` },
          { label: "时钟来源", value: row.clock_source },
        ],
        humanGate: "超时、通知失败或改派异常时保留原时钟并转人工接管。",
        safeBoundary: "本页不改变工单状态，不发送提醒或升级通知。",
      } satisfies ConsoleRecord];
    });
  }

  if (view === "problem_map") {
    return problemRows.map((row) => ({
      id: row.cluster_id,
      title: row.name,
      eyebrow: `${row.category_domain} · ${row.member_case_count} 个独立案件`,
      status: row.clusterRecord?.status ?? "待观察",
      evidence: row.evidence_class,
      isStory: row.cluster_id === "SYN-CLUSTER-001",
      attention: row.root_cause_confirmation_status !== "confirmed" || !row.recurrence_evidence_available,
      summary: row.clusterRecord?.root_cause_hypothesis ?? "尚未形成公开根因假设。",
      relation: `成员：${row.member_case_ids.join("、")}`,
      fields: [
        { label: "合成站点", value: row.synthetic_station_ids.join("、") || "—" },
        { label: "车型", value: row.synthetic_vehicle_models.join("、") || "—" },
        { label: "版本", value: row.synthetic_vehicle_versions.join("、") || "—" },
        { label: "复发证据", value: row.recurrence_evidence_available ? "有" : "无" },
      ],
      humanGate: "问题负责人审核假设、反证和影响范围后才能立项。",
      safeBoundary: "问题簇不合并不同案件，AI 不确认最终技术根因。",
    }));
  }

  return improvementRows.flatMap((row) => {
    const item = row.improvementRecord;
    if (!item) return [];
    return [{
      id: item.improvement_id,
      title: item.measure,
      eyebrow: `${item.version} · ${item.owner_role}`,
      status: item.status,
      evidence: item.evidence_class,
      isStory: item.improvement_id === "SYN-IMPROVEMENT-001",
      attention: item.human_conclusion === null || item.day_7_result === null || item.day_30_result === null,
      summary: item.metric_formula,
      relation: `来自 ${item.cluster_id} · 观察 ${item.observation_window_days.join("/")} 天`,
      fields: [
        { label: "7 天结果", value: item.day_7_result === null ? "未运行" : String(item.day_7_result) },
        { label: "30 天结果", value: item.day_30_result === null ? "未运行" : String(item.day_30_result) },
        { label: "人工结论", value: item.human_conclusion ?? "待确认" },
        { label: "时钟来源", value: item.clock_source },
      ],
      humanGate: "立项、归档、知识发布和复发重开均由授权人员确认。",
      safeBoundary: "缺少同期任务量分母时只报告复发数，不计算复发率。",
    } satisfies ConsoleRecord];
  });
}

export const sandboxSteps: SandboxStep[] = [
  {
    key: "ingest",
    actionId: "sandbox.ingest.run",
    label: "接收合成反馈并校验幂等键",
    shortLabel: "反馈接入",
    layer: "接入协议",
    view: "feedback_inbox",
    objectId: "SYN-RUNTIME-FEEDBACK-017-MAIN",
    description: "固定输入来自合成客户群消息，原文不可覆盖。",
    evidence: "渠道、接收时间、来源记录 ID 和幂等键均为合成沙盘值。",
    output: "生成 1 条待分诊的本地反馈状态。",
    intent: "在当前浏览器内存中接收固定合成反馈，并核对幂等键。",
    action: "在本地接收反馈",
    isHumanGate: false,
  },
  {
    key: "triage",
    actionId: "sandbox.triage.run",
    label: "执行硬规则与 AI 分诊候选",
    shortLabel: "分诊候选",
    layer: "硬规则",
    view: "case_cockpit",
    objectId: "SYN-CASE-017",
    description: "先检查缺失字段和 P0/P1 不可自动降级的硬规则，再生成分类与风险候选。",
    evidence: "合成原文片段：“舱门连续两次无法解锁，任务已经延误”。",
    output: "候选：车辆运维 / 舱门柜体 / P1；不构成最终定级。",
    intent: "先执行确定性硬规则，再生成可供人工复核的分诊候选。",
    action: "生成分诊候选",
    isHumanGate: false,
  },
  {
    key: "entity-candidate",
    actionId: "sandbox.entity_candidate.run",
    label: "生成车辆、任务与站点候选",
    shortLabel: "实体候选",
    layer: "AI 候选",
    view: "case_cockpit",
    objectId: "SYN-CASE-017",
    description: "从固定合成数据中返回可追溯的关联候选。",
    evidence: "候选依据来自合成任务编号、站点和车辆标识的一致性。",
    output: "SYN-VEHICLE-X6-107 / SYN-TASK-8458 / SYN-STATION-A，候选置信度 97%。",
    intent: "使用固定合成证据生成车辆、任务和站点关联候选。",
    action: "生成实体候选",
    isHumanGate: false,
  },
  {
    key: "entity-confirm",
    actionId: "sandbox.entity_confirm.review",
    label: "人工确认正式实体关系",
    shortLabel: "实体确认",
    layer: "人工关口",
    view: "case_cockpit",
    objectId: "SYN-CASE-017",
    description: "授权角色核对候选和证据，再决定是否建立正式关联。",
    evidence: "页面只演示确认动作，不伪造真实审核人或企业账号。",
    output: "本地沙盘将候选标记为“已人工确认（演示）”。",
    intent: "核对候选与证据后，选择确认通过、退回补证或驳回候选。",
    action: "人工确认实体",
    isHumanGate: true,
    reviewContract: {
      returnTarget: "实体证据补全",
      rejectTarget: "实体候选重新生成",
      nextOwnerRole: "数据校验角色",
    },
  },
  {
    key: "routing-confirm",
    actionId: "sandbox.routing_confirm.review",
    label: "人工确认责任路由",
    shortLabel: "责任确认",
    layer: "人工关口",
    view: "case_cockpit",
    objectId: "SYN-CASE-017",
    description: "系统只建议责任团队，由人确认是否进入车辆运维队列。",
    evidence: "候选来自类别与站点责任矩阵的设计映射。",
    output: "责任候选：车辆运维；不等于事故责任或赔付判定。",
    intent: "核对责任矩阵候选后，由人工决定是否进入车辆运维队列。",
    action: "人工确认路由",
    isHumanGate: true,
    reviewContract: {
      returnTarget: "责任路由依据补全",
      rejectTarget: "责任候选重新生成",
      nextOwnerRole: "路由管理角色",
    },
  },
  {
    key: "work-order",
    actionId: "sandbox.work_order.run",
    label: "建立本地工单状态并启动原 SLA 时钟",
    shortLabel: "工单协同",
    layer: "确定性工作流",
    view: "sla_board",
    objectId: "SYN-WO-003",
    description: "沙盘使用固定时钟，改派或重试不重置原 SLA 起点。",
    evidence: "时钟来源为合成沙盘，不是飞书工作流运行日志。",
    output: "生成本地工单 SYN-WO-003，原时钟重置次数为 0。",
    intent: "在浏览器内存中建立工单状态，并保留固定的原 SLA 起点。",
    action: "创建本地工单状态",
    isHumanGate: false,
  },
  {
    key: "close-case",
    actionId: "sandbox.close_case.review",
    label: "核对处置证据、回访并人工关闭",
    shortLabel: "回访关闭",
    layer: "人工关口",
    view: "case_cockpit",
    objectId: "SYN-CASE-017",
    description: "处置证据和对外回复草稿都需审核，回访结果由人决定是否关闭。",
    evidence: "本沙盘不发送回复，不记录真实满意度。",
    output: "个案闭环标记为“已关闭（演示）”，随后进入重复问题观察。",
    intent: "核对处置与回访证据后，由人工决定是否关闭本地演示个案。",
    action: "人工确认关闭",
    isHumanGate: true,
    reviewContract: {
      returnTarget: "处置证据或回访记录补全",
      rejectTarget: "结案候选撤销并继续处理",
      nextOwnerRole: "工单处理角色",
    },
  },
  {
    key: "cluster",
    actionId: "sandbox.cluster.run",
    label: "生成跨事件问题簇候选",
    shortLabel: "问题簇候选",
    layer: "AI 候选",
    view: "problem_map",
    objectId: "SYN-CLUSTER-001",
    description: "保留四个独立案件，只建议它们共享“舱门解锁失败”模式。",
    evidence: "聚类特征包括类别、车型、版本和站点；仍缺真实复发运行证据。",
    output: "候选问题簇 SYN-CLUSTER-001；根因仅为假设。",
    intent: "保留独立案件，仅生成跨事件重复模式和根因假设候选。",
    action: "生成问题簇候选",
    isHumanGate: false,
  },
  {
    key: "improvement",
    actionId: "sandbox.improvement.review",
    label: "人工立项并安排 7/30 天观察",
    shortLabel: "改进立项",
    layer: "人工关口",
    view: "improvement_tracker",
    objectId: "SYN-IMPROVEMENT-001",
    description: "问题负责人审核假设和反证后，才决定是否进入改进观察。",
    evidence: "本项目尚无真实 7/30 天结果，页面只展示设计时钟。",
    output: "改进项目 SYN-IMPROVEMENT-001 进入观察计划，结果保持“未运行”。",
    intent: "审核问题簇证据和反证后，由人工决定是否进入改进观察。",
    action: "人工确认立项",
    isHumanGate: true,
    reviewContract: {
      returnTarget: "问题簇证据与反证补全",
      rejectTarget: "立项候选撤销并重新评估",
      nextOwnerRole: "问题管理角色",
    },
  },
  {
    key: "observe",
    actionId: "sandbox.observe.run",
    label: "进入归档或复发重开的预期路径",
    shortLabel: "观察与重开",
    layer: "证据状态",
    view: "improvement_tracker",
    objectId: "SYN-IMPROVEMENT-001",
    description: "7/30 天结果未运行；沙盘只展示有证据时的两条后续路径。",
    evidence: "无运行证据，因此不计算复发率，不生成最终根因结论。",
    output: "设计路径：无复发且证据充足时由人归档；复发时重开案件与改进。",
    intent: "查看有证据时的归档或复发重开分支，不生成未运行结果。",
    action: "查看预期分支",
    isHumanGate: false,
  },
];
