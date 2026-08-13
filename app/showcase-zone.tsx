"use client";

import {
  ArrowDown,
  ArrowRight,
  ArrowsClockwise,
  Calculator,
  Database,
  ShieldCheck,
  Sparkle,
  WarningCircle,
} from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import { improvementRows, mainStory, problemRows } from "./public-snapshot";

type LoopKind = "case" | "improvement";
type StepKind = "workflow" | "ai" | "rule" | "human" | "evidence";

type ShowcaseStep = {
  id: string;
  loop: LoopKind;
  code: string;
  title: string;
  kind: StepKind;
  input: string;
  aiRole: string;
  evidence: string;
  humanGate: string;
  output: string;
};

const channels = [
  { id: "app", label: "App 评价", mode: "官方接口 / Webhook" },
  { id: "service", label: "客服记录", mode: "客服系统事件" },
  { id: "hotline", label: "热线转写", mode: "经授权语音转写" },
  { id: "email", label: "服务邮件", mode: "授权邮箱接入" },
  { id: "feishu", label: "飞书", mode: "群 / 表单 / 机器人" },
  { id: "public", label: "经授权公开平台", mode: "仅使用授权 API" },
] as const;

const showcaseSteps: ShowcaseStep[] = [
  {
    id: "case-ingest",
    loop: "case",
    code: "W1",
    title: "接入幂等",
    kind: "workflow",
    input: "授权渠道事件、原文、来源记录号与接收时间",
    aiRole: "本步不依赖 AI；先完成签名、授权范围和幂等检查。",
    evidence: "原文不可覆盖；同键同内容回放已有记录，同键异内容拒绝覆盖。",
    humanGate: "授权范围异常或来源信息不完整时停止接入。",
    output: "一条可追溯的原始反馈记录",
  },
  {
    id: "case-triage",
    loop: "case",
    code: "W2 · N1-N3",
    title: "AI 分诊",
    kind: "ai",
    input: "不可变原文与业务规则版本",
    aiRole: "抽取事实、建议业务分类与风险等级，每条结论回指原文。",
    evidence: "证据片段、置信度、缺失字段、输入哈希和校验结果。",
    humanGate: "P0/P1 硬规则优先；AI 只能提高风险，不能降低。",
    output: "待关联案件草稿",
  },
  {
    id: "case-link",
    loop: "case",
    code: "W3 · N4",
    title: "实体关联",
    kind: "evidence",
    input: "车辆、任务、站点线索与合法可读业务快照",
    aiRole: "只生成车辆、任务和站点候选，不写入正式关系。",
    evidence: "每个候选分别展示依据、缺失项与置信度。",
    humanGate: "低置信度或 ID 缺失时转人工补充，不强行匹配。",
    output: "带证据的实体候选列表",
  },
  {
    id: "case-confirm",
    loop: "case",
    code: "W3 · N6",
    title: "人工确认",
    kind: "human",
    input: "实体候选、责任矩阵与责任路由候选",
    aiRole: "N6 只建议责任团队，并解释路由依据。",
    evidence: "实体确认和责任确认分别留下人员、时间与版本记录。",
    humanGate: "正式实体与正式责任是两个独立关口，不能一次点击替代。",
    output: "可创建工单的确认记录",
  },
  {
    id: "case-sla",
    loop: "case",
    code: "W4",
    title: "工单与 SLA",
    kind: "workflow",
    input: "确认后的实体、责任与 SLA 规则版本",
    aiRole: "AI 不控制工单状态；工作流执行确定性提醒和升级。",
    evidence: "原 SLA 起点、到期时间、接单、提醒、升级和改派轨迹。",
    humanGate: "通知失败或超时时保留原状态与原计时，进入人工接管。",
    output: "可审计的处置工单",
  },
  {
    id: "case-close",
    loop: "case",
    code: "W5 · N7",
    title: "回访关闭",
    kind: "human",
    input: "处置证据、验证清单和客户沟通上下文",
    aiRole: "只起草回复、知识与洞察，不自动发送或发布。",
    evidence: "处置证据、审核记录、回访结果和关闭决定。",
    humanGate: "回复发布、回访结论和案件关闭全部由授权人员确认。",
    output: "关闭案件，并进入跨事件观察",
  },
  {
    id: "improvement-cluster",
    loop: "improvement",
    code: "W6 · N5",
    title: "跨事件聚类",
    kind: "ai",
    input: "多个已保留独立 ID 的不同事件",
    aiRole: "识别同类问题并产生问题簇候选，不自动合并案件。",
    evidence: "成员案件、聚类版本、共同特征与反例。",
    humanGate: "同事件并案与跨事件聚类严格分开。",
    output: "SYN-CLUSTER-001 问题簇候选",
  },
  {
    id: "improvement-hypothesis",
    loop: "improvement",
    code: "N6",
    title: "根因假设",
    kind: "ai",
    input: "问题簇成员、处置证据和版本/站点等共同特征",
    aiRole: "提出可验证的根因假设，同时保留支持证据与反证。",
    evidence: "假设、支持证据、反证和待补充验证项。",
    humanGate: "AI 不确认最终技术根因，也不自动判定责任。",
    output: "待审核的证据化假设",
  },
  {
    id: "improvement-project",
    loop: "improvement",
    code: "H1",
    title: "人工立项",
    kind: "human",
    input: "问题簇、根因假设、影响范围与建议措施",
    aiRole: "可提供措施草案和验收指标建议。",
    evidence: "立项人、措施、责任角色、指标公式和版本。",
    humanGate: "问题负责人审核后才能形成改进项目。",
    output: "SYN-IMPROVEMENT-001 改进项目",
  },
  {
    id: "improvement-observe",
    loop: "improvement",
    code: "T7 / T30",
    title: "7/30 天观察",
    kind: "evidence",
    input: "改进措施、观察窗和同口径任务量分母",
    aiRole: "生成观察摘要，但不替代人工结论。",
    evidence: "时钟来源、观察窗、复发案件数和业务量分母。",
    humanGate: "缺少任务量分母时只报告复发数，不计算复发率。",
    output: "可比较的观察证据",
  },
  {
    id: "improvement-reopen",
    loop: "improvement",
    code: "W6",
    title: "归档或复发重开",
    kind: "rule",
    input: "7/30 天观察证据与人工复核结果",
    aiRole: "只提示复发信号和相关案件。",
    evidence: "归档/重开决定、依据、操作者和时间。",
    humanGate: "归档、知识发布和复发重开均需授权人员确认。",
    output: "归档，或回到处置与改进循环",
  },
];

const kindLabels: Record<StepKind, string> = {
  workflow: "确定性工作流",
  ai: "AI 候选",
  rule: "硬规则",
  human: "人工关口",
  evidence: "证据状态",
};

function boundedNumber(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

export function ShowcaseZone() {
  const [activeStepId, setActiveStepId] = useState(showcaseSteps[0].id);
  const [channelId, setChannelId] = useState<(typeof channels)[number]["id"]>("feishu");
  const [monthlyVolume, setMonthlyVolume] = useState(1000);
  const [manualMinutes, setManualMinutes] = useState(8);
  const [assistedMinutes, setAssistedMinutes] = useState(3);

  const activeStep = showcaseSteps.find((step) => step.id === activeStepId) ?? showcaseSteps[0];
  const selectedChannel = channels.find((channel) => channel.id === channelId) ?? channels[0];
  const cluster = problemRows.find((row) => row.cluster_id === "SYN-CLUSTER-001")?.clusterRecord ?? null;
  const improvement = improvementRows.find((row) => row.improvement_id === "SYN-IMPROVEMENT-001")?.improvementRecord ?? null;
  const theoreticalHours = useMemo(
    () => (monthlyVolume * Math.max(manualMinutes - assistedMinutes, 0)) / 60,
    [monthlyVolume, manualMinutes, assistedMinutes],
  );

  return (
    <>
      <section className="showcase-section section-shell" id="dual-loop" aria-labelledby="dual-loop-title">
        <div className="section-heading">
          <div>
            <p className="section-kicker">自由展示 · 90 秒可点击体验</p>
            <h2 id="dual-loop-title">两条循环，共用一条证据链</h2>
          </div>
          <p>从全渠道接入一条合成反馈，先完成个案闭环，再把不同事件送入改进闭环。所有点击只改变当前浏览器状态。</p>
        </div>

        <div className="showcase-boundary" role="note">
          <ShieldCheck size={20} weight="fill" aria-hidden="true" />
          <span><b>合成设计回放</b>不写数据 · 不调用真实接口 · 不触发飞书工作流 · 不控制车辆</span>
        </div>

        <div className="channel-stage" aria-labelledby="channel-stage-title">
          <div className="channel-stage-head">
            <div><p className="micro-label">统一接入层</p><h3 id="channel-stage-title">反馈自动汇入，而不是依赖人工逐条填写</h3></div>
            <span className="showcase-status">固定故事来源：{mainStory.replay_input.channel}</span>
          </div>
          <div className="channel-grid" aria-label="可配置反馈渠道">
            {channels.map((channel) => (
              <button
                key={channel.id}
                type="button"
                className={channel.id === channelId ? "active" : ""}
                aria-pressed={channel.id === channelId}
                onClick={() => setChannelId(channel.id)}
              >
                <span>{channel.label}</span>
                <small>{channel.mode}</small>
              </button>
            ))}
          </div>
          <div className="channel-contract">
            <Database size={22} weight="duotone" aria-hidden="true" />
            <div><small>当前查看接入合同</small><b>{selectedChannel.label} · {selectedChannel.mode}</b></div>
            <ArrowRight size={20} aria-hidden="true" />
            <div><small>不可变原始反馈池</small><b>{mainStory.replay_input.feedback_id}</b></div>
          </div>
          <p className="channel-footnote">渠道按钮只解释适配方式；冻结主故事的来源字段不会被改写。真实接入仍以企业授权、官方 API 和字段确认结果为前置条件。</p>
        </div>

        <div className="loop-stage">
          <article className="loop-lane loop-lane-case">
            <div className="loop-lane-head">
              <div><span>循环 01</span><h3>个案闭环</h3></div>
              <p>解决一次反馈</p>
            </div>
            <ol>
              {showcaseSteps.filter((step) => step.loop === "case").map((step, index) => (
                <li key={step.id}>
                  <button
                    type="button"
                    className={`loop-step step-${step.kind} ${activeStepId === step.id ? "active" : ""}`}
                    aria-current={activeStepId === step.id ? "step" : undefined}
                    onClick={() => setActiveStepId(step.id)}
                  >
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    <b>{step.title}</b>
                    <small>{step.code}</small>
                  </button>
                </li>
              ))}
            </ol>
          </article>

          <div className="loop-bridge" aria-label="个案关闭后进入改进观察">
            <ArrowDown size={22} weight="bold" aria-hidden="true" />
            <span>关闭后进入观察</span>
            <ArrowRight size={22} weight="bold" aria-hidden="true" />
          </div>

          <article className="loop-lane loop-lane-improvement">
            <div className="loop-lane-head">
              <div><span>循环 02</span><h3>改进闭环</h3></div>
              <p>减少同类问题复发</p>
            </div>
            <ol>
              {showcaseSteps.filter((step) => step.loop === "improvement").map((step, index) => (
                <li key={step.id}>
                  <button
                    type="button"
                    className={`loop-step step-${step.kind} ${activeStepId === step.id ? "active" : ""}`}
                    aria-current={activeStepId === step.id ? "step" : undefined}
                    onClick={() => setActiveStepId(step.id)}
                  >
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    <b>{step.title}</b>
                    <small>{step.code}</small>
                  </button>
                </li>
              ))}
            </ol>
            <div className="recurrence-route"><ArrowsClockwise size={18} weight="bold" aria-hidden="true" /><span>复发时返回处置与改进，不覆盖旧记录</span></div>
          </article>
        </div>

        <article className={`showcase-detail detail-${activeStep.kind}`} aria-live="polite">
          <div className="showcase-detail-head">
            <div><span>{activeStep.code}</span><h3>{activeStep.title}</h3></div>
            <span className={`legend-chip legend-${activeStep.kind}`}>{kindLabels[activeStep.kind]}</span>
          </div>
          <div className="showcase-detail-grid">
            <div><small>输入</small><p>{activeStep.input}</p></div>
            <div><small>AI 作用</small><p>{activeStep.aiRole}</p></div>
            <div><small>证据</small><p>{activeStep.evidence}</p></div>
            <div><small>人工关口</small><p>{activeStep.humanGate}</p></div>
          </div>
          <div className="showcase-output"><Sparkle size={18} weight="fill" aria-hidden="true" /><span><small>预期输出</small><b>{activeStep.output}</b></span></div>
        </article>

        <div className="story-evidence-chain" aria-label="固定合成故事证据链">
          <div><small>个案</small><b>{mainStory.source_case_id}</b><span>{mainStory.execution_status === "not_run" ? "设计路径 · 未运行" : mainStory.execution_status}</span></div>
          <ArrowRight size={18} aria-hidden="true" />
          <div><small>问题簇</small><b>{cluster?.cluster_id ?? "SYN-CLUSTER-001"}</b><span>{cluster?.name ?? "舱门解锁失败"}</span></div>
          <ArrowRight size={18} aria-hidden="true" />
          <div><small>改进项目</small><b>{improvement?.improvement_id ?? "SYN-IMPROVEMENT-001"}</b><span>{improvement?.status ?? "观察中"} · 结果为空</span></div>
        </div>
      </section>

      <section className="value-lab section-shell" id="value-lab" aria-labelledby="value-lab-title">
        <div className="section-heading">
          <div><p className="section-kicker">业务价值 · 参数化测算</p><h2 id="value-lab-title">把价值假设变成可复核公式</h2></div>
          <p>评委可以修改三项参数。结果只说明理论时间释放，不代表新石器真实业务基线、成本节省或经营成效。</p>
        </div>
        <div className="value-lab-grid">
          <form className="value-inputs" onSubmit={(event) => event.preventDefault()} aria-describedby="value-lab-note">
            <label>
              <span>月反馈量</span>
              <input type="number" min={0} max={1000000} step={100} value={monthlyVolume} onChange={(event) => setMonthlyVolume(boundedNumber(Number(event.currentTarget.value), 0, 1000000))} />
              <small>条 / 月</small>
            </label>
            <label>
              <span>当前人工分诊耗时</span>
              <input type="number" min={0} max={1440} step={0.5} value={manualMinutes} onChange={(event) => setManualMinutes(boundedNumber(Number(event.currentTarget.value), 0, 1440))} />
              <small>分钟 / 条</small>
            </label>
            <label>
              <span>辅助后分诊耗时</span>
              <input type="number" min={0} max={1440} step={0.5} value={assistedMinutes} onChange={(event) => setAssistedMinutes(boundedNumber(Number(event.currentTarget.value), 0, 1440))} />
              <small>分钟 / 条</small>
            </label>
          </form>
          <article className="value-result">
            <div className="value-result-label"><Calculator size={22} weight="duotone" aria-hidden="true" /><span>月度理论释放时间</span></div>
            <strong>{theoreticalHours.toLocaleString("zh-CN", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}<small>小时 / 月</small></strong>
            <p>公式：月反馈量 × max（当前耗时 - 辅助后耗时，0）÷ 60</p>
            <div className="value-assumption"><WarningCircle size={18} weight="fill" aria-hidden="true" /><span>参数化测算，不是新石器真实业务成效。当前数值是可修改的合成假设。</span></div>
          </article>
        </div>
        <p id="value-lab-note" className="value-note">真实复测还需企业确认反馈量、计时起点、责任矩阵、SLA 和人工金标准。没有这些前置条件，不发布成本、收入、复发率或 ROI。</p>
      </section>
    </>
  );
}
