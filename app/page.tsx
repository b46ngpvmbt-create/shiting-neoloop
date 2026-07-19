"use client";

/* eslint-disable @next/next/no-img-element -- Vinext does not provide Next's image optimizer; these local avatars are pre-sized raster assets. */

import {
  ArrowLeft,
  ArrowRight,
  Buildings,
  Check,
  CheckCircle,
  ClipboardText,
  Database,
  FileText,
  Link as LinkIcon,
  MapPin,
  ShieldCheck,
  Sparkle,
  Truck,
  UserCircle,
  WarningCircle,
} from "@phosphor-icons/react";
import { useMemo, useState } from "react";

type Priority = "P0" | "P1" | "P2" | "P3";
type View = "overview" | "demo" | "cases" | "clusters" | "team";
type ModalKind = "risk" | "reply" | null;

type CaseItem = {
  id: string;
  title: string;
  priority: Priority;
  status: string;
  team: string;
  vehicle: string;
  task: string;
  summary: string;
  evidence: string[];
  next: string;
  confidence: string;
};

const cases: CaseItem[] = [
  {
    id: "DEMO-C-001",
    title: "车辆停在非机动车道并出现险情",
    priority: "P0",
    status: "模拟已关闭",
    team: "企业车辆运维 + 企业现场运维",
    vehicle: "DEMO-X6-102",
    task: "DEMO-T-8452",
    summary: "任务中断时出现道路安全风险词。系统先触发硬规则，再由企业授权人员确认处置。",
    evidence: ["合成现场照片", "合成任务日志", "合成处置记录"],
    next: "保留证据链，进入安全事件复盘。",
    confidence: "合成示例值 0.98",
  },
  {
    id: "DEMO-C-002",
    title: "到站后舱门无法开启",
    priority: "P1",
    status: "模拟已关闭",
    team: "企业车辆运维",
    vehicle: "DEMO-X6-107",
    task: "DEMO-T-8458",
    summary: "同一任务收到两条合成反馈，先由企业客服确认并案，再核对车辆、任务和开舱重试证据。",
    evidence: ["合成错误码", "合成开舱重试记录", "合成现场视频"],
    next: "关联同版本独立案件，进入问题簇观察。",
    confidence: "合成示例值 0.97",
  },
  {
    id: "DEMO-C-003",
    title: "站点多车同时离线",
    priority: "P1",
    status: "模拟处理中",
    team: "企业车辆运维 + 企业现场运维",
    vehicle: "DEMO-X3-205",
    task: "DEMO-T-8461",
    summary: "同一站点多辆车出现离线描述，需区分站点网络、车端通信与任务异常。",
    evidence: ["合成网络探测", "合成车辆日志", "合成站点信息"],
    next: "等待企业角色补齐网络探测与车端日志。",
    confidence: "合成示例值 0.72",
  },
  {
    id: "DEMO-C-005",
    title: "路线点位指向关闭入口",
    priority: "P2",
    status: "模拟待验证",
    team: "企业现场运维",
    vehicle: "DEMO-X3-211",
    task: "DEMO-T-8474",
    summary: "现场入口发生变化后，既有点位仍被任务引用，需要在下一次合成任务中复核。",
    evidence: ["合成点位截图", "合成现场说明", "合成任务记录"],
    next: "重新采集点位并在下一任务验证。",
    confidence: "合成示例值 0.91",
  },
  {
    id: "DEMO-C-011",
    title: "新版搜索无法总览车辆电量",
    priority: "P3",
    status: "模拟已分诊",
    team: "企业客户服务 + 企业产品团队",
    vehicle: "待企业补充",
    task: "待企业补充",
    summary: "公开评论仅作为单个反馈样本进入需求分诊，不外推为普遍问题。",
    evidence: ["公开评论链接", "公开页面截图", "合成需求记录"],
    next: "核对公开能力边界与企业路线图。",
    confidence: "合成示例值 0.86",
  },
  {
    id: "DEMO-C-017",
    title: "冷链舱温度持续告警",
    priority: "P1",
    status: "模拟已关闭",
    team: "企业车辆运维 + 企业现场运维",
    vehicle: "DEMO-X6-145",
    task: "DEMO-T-8488",
    summary: "合成流程先保护货物，再核实传感器、制冷状态与换车记录。",
    evidence: ["合成温度曲线", "合成换车记录", "合成货物复核"],
    next: "回顾候选SOP并监测复发。",
    confidence: "合成示例值 0.97",
  },
];

const clusters = [
  {
    id: "DEMO-CL-001",
    name: "舱门解锁失败",
    risk: "P1" as Priority,
    count: 4,
    status: "模拟观察中",
    hypothesis: "待验证：可能与版本或部件批次相关",
    action: "生成待企业评审的改进项目草案",
    related: ["DEMO-C-002", "DEMO-C-008", "DEMO-C-014", "DEMO-C-020"],
  },
  {
    id: "DEMO-CL-002",
    name: "站点网络与数据回传异常",
    risk: "P1" as Priority,
    count: 2,
    status: "模拟处理中",
    hypothesis: "待验证：站点网络或车端通信链路",
    action: "补齐网络探测与车端日志",
    related: ["DEMO-C-003", "DEMO-C-013"],
  },
  {
    id: "DEMO-CL-003",
    name: "道路停驶安全事件",
    risk: "P0" as Priority,
    count: 1,
    status: "模拟已控制",
    hypothesis: "最终根因不得由AI确认",
    action: "保持硬规则告警与企业人工复核",
    related: ["DEMO-C-001"],
  },
  {
    id: "DEMO-CL-005",
    name: "地图点位与现场变化",
    risk: "P2" as Priority,
    count: 2,
    status: "模拟处理中",
    hypothesis: "待验证：地图版本或现场环境变化",
    action: "重新采集并在下一任务验证",
    related: ["DEMO-C-005", "DEMO-C-019"],
  },
];

const demoSteps = [
  { short: "并案", title: "确认同一事件", role: "企业客服专员" },
  { short: "关联", title: "核对车辆与任务证据", role: "企业运营协调员" },
  { short: "派单", title: "人工确认风险与责任", role: "企业值班经理" },
  { short: "处置", title: "提交处置记录", role: "企业车辆运维负责人" },
  { short: "验证", title: "审批回复并关闭", role: "企业授权审批人" },
  { short: "改进", title: "生成改进草案", role: "企业产品/质量负责人" },
];

function PriorityTag({ priority }: { priority: Priority }) {
  return <span className={`priority priority-${priority.toLowerCase()}`}>{priority}</span>;
}

function StateTag({ kind, children }: { kind: "synthetic" | "ai" | "pending" | "confirmed"; children: React.ReactNode }) {
  return <span className={`state-tag state-${kind}`}>{children}</span>;
}

export default function Home() {
  const [view, setView] = useState<View>("overview");
  const [filter, setFilter] = useState<"全部" | Priority>("全部");
  const [selectedId, setSelectedId] = useState("DEMO-C-002");
  const [selectedClusterId, setSelectedClusterId] = useState("DEMO-CL-001");
  const [demoStep, setDemoStep] = useState(0);
  const [modal, setModal] = useState<ModalKind>(null);
  const [notice, setNotice] = useState("演示尚未开始，所有操作只改变本地合成状态。");
  const [improvementCreated, setImprovementCreated] = useState(false);

  const filteredCases = useMemo(
    () => (filter === "全部" ? cases : cases.filter((item) => item.priority === filter)),
    [filter],
  );
  const selected = filteredCases.find((item) => item.id === selectedId) ?? filteredCases[0] ?? cases[1];
  const selectedCluster = clusters.find((item) => item.id === selectedClusterId) ?? clusters[0];

  function navigate(target: View) {
    setView(target);
    window.setTimeout(() => window.scrollTo({ top: 0, behavior: "smooth" }), 0);
  }

  function advance(message: string) {
    setDemoStep((current) => Math.min(current + 1, demoSteps.length - 1));
    setNotice(message);
  }

  function restartDemo() {
    setDemoStep(0);
    setModal(null);
    setImprovementCreated(false);
    setNotice("演示已重置。先由企业客服专员确认两条记录是否属于同一事件。");
  }

  return (
    <main className="site-shell">
      <nav className="topbar" aria-label="主导航">
        <button className="brand" onClick={() => navigate("overview")} aria-label="返回产品概览">
          <span className="brand-mark">石听</span>
          <span>NeoLoop</span>
        </button>
        <div className="nav-links">
          {([
            ["overview", "产品概览"],
            ["demo", "合成演示"],
            ["cases", "反馈案件"],
            ["clusters", "问题簇"],
            ["team", "参赛团队"],
          ] as const).map(([target, label]) => (
            <button key={target} className={view === target ? "active" : ""} onClick={() => navigate(target)}>
              {label}
            </button>
          ))}
        </div>
        <span className="demo-badge">DEMO｜全部为合成数据</span>
      </nav>

      {view === "overview" && (
        <>
          <section className="hero">
            <div className="hero-copy">
              <p className="eyebrow">无人配送客户之声闭环中枢</p>
              <h1>让每条反馈都找到<br />一辆车、一个任务、<br />一个责任人和一次改进。</h1>
              <p className="hero-text">
                NeoLoop 不重复做查车、发车或充电调度。它处理反馈进入后如何补齐证据、交给企业授权团队，
                并把重复问题变成可跟踪的改进项目。
              </p>
              <div className="hero-actions">
                <button className="primary" onClick={() => navigate("demo")}>
                  进入交互演示 <ArrowRight size={19} weight="bold" />
                </button>
                <button className="secondary" onClick={() => navigate("cases")}>查看精选案件</button>
              </div>
              <p className="hero-note">公开交互原型｜未接入新石器生产数据或赛事飞书</p>
            </div>

            <article className="workflow-preview" aria-label="合成反馈关联与人工确认预览">
              <div className="preview-steps">
                <span><FileText size={21} weight="duotone" />原始反馈</span>
                <ArrowRight className="preview-arrow" size={20} />
                <span><LinkIcon size={21} weight="duotone" />证据关联</span>
                <ArrowRight className="preview-arrow" size={20} />
                <span><UserCircle size={21} weight="duotone" />人工确认</span>
              </div>
              <div className="preview-columns">
                <section className="preview-panel feedback-panel">
                  <StateTag kind="synthetic">合成反馈</StateTag>
                  <h2>到站后舱门无法开启</h2>
                  <p>同一任务从客户群和服务记录进入，等待企业客服确认是否并案。</p>
                  <dl>
                    <div><dt>反馈渠道</dt><dd>客户群 + 服务记录</dd></div>
                    <div><dt>反馈类型</dt><dd>交付体验</dd></div>
                  </dl>
                  <div className="panel-foot"><ClipboardText size={21} /><span><b>原始记录保留</b><small>不覆盖来源与原文</small></span></div>
                </section>

                <section className="preview-panel evidence-panel">
                  <StateTag kind="ai">AI 关联建议</StateTag>
                  {[
                    [Truck, "车辆", "DEMO-X6-107"],
                    [ClipboardText, "任务", "DEMO-T-8458"],
                    [MapPin, "行程片段", "到站前后 120 秒"],
                    [Database, "系统日志", "开舱重试记录"],
                  ].map(([Icon, title, value]) => {
                    const ItemIcon = Icon as typeof Truck;
                    return (
                      <button key={String(title)} onClick={() => { setDemoStep(1); navigate("demo"); }}>
                        <ItemIcon size={20} weight="duotone" />
                        <span><b>{String(title)}</b><small>{String(value)}</small></span>
                        <span className="evidence-check"><Check size={13} weight="bold" /></span>
                      </button>
                    );
                  })}
                  <div className="evidence-complete"><CheckCircle size={22} weight="fill" /><span><b>证据完整度 4/4</b><small>仅为合成演示状态</small></span></div>
                </section>

                <section className="preview-panel decision-panel">
                  <StateTag kind="pending">待企业确认</StateTag>
                  <h2>建议派单</h2>
                  <dl>
                    <div><dt>风险建议</dt><dd>P1</dd></div>
                    <div><dt>建议责任团队</dt><dd>企业车辆运维</dd></div>
                    <div><dt>SLA</dt><dd>待企业确认</dd></div>
                  </dl>
                  <div className="suggestion"><b>处理建议</b><p>核查合成开舱记录与现场证据，由企业角色决定是否建单。</p></div>
                  <button className="panel-primary" onClick={() => { setDemoStep(2); navigate("demo"); }}>
                    进入人工关口 <ArrowRight size={17} weight="bold" />
                  </button>
                </section>
              </div>
              <div className="preview-status">
                <span className="done"><CheckCircle size={19} weight="fill" />已接收</span>
                <i />
                <span className="done"><CheckCircle size={19} weight="fill" />证据齐全</span>
                <i />
                <span><UserCircle size={19} weight="fill" />待人工确认</span>
              </div>
            </article>
          </section>

          <section className="overview-lower">
            <div className="boundary-section">
              <p className="eyebrow">证据边界</p>
              <h2>只用公开资料和明确标注的合成数据建立演示</h2>
              <div className="boundary-grid">
                <article><Database size={25} weight="duotone" /><b>公开事实</b><span>规则与公告</span></article>
                <article><Truck size={25} weight="duotone" /><b>合成业务数据</b><span>车辆与任务均为 DEMO</span></article>
                <article><MapPin size={25} weight="duotone" /><b>最小化信息</b><span>行程片段按需呈现</span></article>
                <article><ShieldCheck size={25} weight="duotone" /><b>人工审计</b><span>关键事件保留摘要</span></article>
              </div>
            </div>
            <button className="team-summary" onClick={() => navigate("team")}>
              <span className="eyebrow">参赛团队｜石听未来</span>
              <span className="team-summary-members">
                <span><img src="/avatars/liu.png" alt="刘姓氏头像" width="54" height="54" /><b>刘肖蔚然</b><small>队长</small></span>
                <span><img src="/avatars/yan.png" alt="闫姓氏头像" width="54" height="54" /><b>闫紫豪</b><small>队员</small></span>
              </span>
              <span className="school-line">青岛农业大学｜风景园林（虚拟现实技术设计）</span>
              <span className="team-boundary">参赛身份与企业业务执行角色相互独立 <ArrowRight size={16} /></span>
            </button>
          </section>

          <section className="story-strip">
            <div><p className="eyebrow">精选演示</p><h2>一条合成案例，走完整个企业闭环</h2></div>
            <div className="story-metrics">
              <span><b>30</b><small>合成原始反馈</small></span>
              <span><b>20</b><small>合成反馈案件</small></span>
              <span><b>27</b><small>合成处置工单</small></span>
              <span><b>10</b><small>合成问题簇</small></span>
            </div>
            <button className="secondary" onClick={() => navigate("demo")}>开始约 4 分钟演示</button>
          </section>
        </>
      )}

      {view === "demo" && (
        <section className="workspace demo-workspace">
          <div className="boundary-banner">
            <ShieldCheck size={20} weight="duotone" />
            <span><b>合成演示</b>｜未接入新石器生产数据或赛事飞书｜不向车辆发送任何指令</span>
          </div>
          <div className="workspace-head demo-head">
            <div><p className="eyebrow">交互式软件示例</p><h1>一条反馈如何闭环</h1><p>跟随企业授权角色完成并案、关联、派单、处置、验证和改进。</p></div>
            <button className="text-button" onClick={restartDemo}>重新开始</button>
          </div>

          <div className="demo-stepper" aria-label="演示步骤">
            {demoSteps.map((step, index) => (
              <button
                key={step.short}
                className={`${index === demoStep ? "current" : ""} ${index < demoStep ? "complete" : ""}`}
                onClick={() => setDemoStep(index)}
                aria-current={index === demoStep ? "step" : undefined}
              >
                <span>{index < demoStep ? <Check size={15} weight="bold" /> : index + 1}</span>
                <b>{step.short}</b>
              </button>
            ))}
          </div>

          <div className="role-strip">
            <span><Buildings size={20} weight="duotone" />当前模拟角色</span>
            <b>{demoSteps[demoStep].role}</b>
            <small>企业业务角色（演示名称，待企业确认）</small>
          </div>

          <div className="demo-board">
            <header className="demo-board-head">
              <div><span className="case-id">DEMO-C-002</span><h2>{demoSteps[demoStep].title}</h2></div>
              <div><PriorityTag priority="P1" /> <StateTag kind={demoStep >= 3 ? "confirmed" : "pending"}>{demoStep >= 3 ? "人工已确认" : "待人工确认"}</StateTag></div>
            </header>

            {demoStep === 0 && (
              <div className="demo-content split-content">
                <section className="content-panel"><StateTag kind="synthetic">合成记录 A</StateTag><h3>客户群反馈</h3><blockquote>“车辆到站了，但舱门一直打不开，页面提示重试。”</blockquote><dl><div><dt>时间</dt><dd>2026-07-19 10:42</dd></div><div><dt>任务线索</dt><dd>DEMO-T-8458</dd></div></dl></section>
                <section className="content-panel"><StateTag kind="synthetic">合成记录 B</StateTag><h3>服务记录</h3><blockquote>“同一任务两分钟后再次上报开舱失败。”</blockquote><dl><div><dt>时间</dt><dd>2026-07-19 10:44</dd></div><div><dt>车辆线索</dt><dd>DEMO-X6-107</dd></div></dl></section>
                <aside className="decision-aside"><Sparkle size={24} weight="duotone" /><h3>AI 并案建议</h3><p>时间、任务编号与问题描述一致，建议作为同一事件处理。原始记录仍分别保留。</p><button className="primary" onClick={() => advance("人工并案决定已记录；两条原始记录继续保留。")}>确认同一事件 <ArrowRight size={17} /></button></aside>
              </div>
            )}

            {demoStep === 1 && (
              <div className="demo-content evidence-content">
                <section className="evidence-ledger">
                  <h3>候选证据</h3>
                  {[
                    [Truck, "车辆", "DEMO-X6-107", "车辆标识与任务记录一致"],
                    [ClipboardText, "任务", "DEMO-T-8458", "到站时间与反馈时间相邻"],
                    [MapPin, "行程片段", "到站前后 120 秒", "只展示必要时间窗"],
                    [Database, "开舱日志", "合成重试记录 × 3", "不发送开舱指令"],
                  ].map(([Icon, label, value, reason]) => {
                    const EvidenceIcon = Icon as typeof Truck;
                    return <article key={String(label)}><EvidenceIcon size={23} weight="duotone" /><div><b>{String(label)}</b><span>{String(value)}</span><small>{String(reason)}</small></div><CheckCircle size={22} weight="fill" /></article>;
                  })}
                </section>
                <aside className="decision-aside"><StateTag kind="ai">AI 建议</StateTag><h3>关联置信度</h3><strong className="confidence">0.97</strong><p>该数值只用于展示界面结构，不代表真实模型评测结果。</p><button className="primary" onClick={() => advance("车辆、任务与证据已由企业运营协调员模拟确认。")}>确认关联 <ArrowRight size={17} /></button><button className="secondary" onClick={() => setNotice("已模拟退回补证；没有足够证据时不会强行关联。")}>退回补证</button></aside>
              </div>
            )}

            {demoStep === 2 && (
              <div className="demo-content gate-content">
                <section className="rule-card"><WarningCircle size={30} weight="duotone" /><div><StateTag kind="ai">AI 风险建议</StateTag><h3>P1｜交付受阻</h3><p>依据合成错误码、三次开舱重试与同任务重复反馈提出建议。</p></div></section>
                <section className="assignment-card"><h3>建议责任路由</h3><dl><div><dt>主责团队</dt><dd>企业车辆运维</dd></div><div><dt>协同角色</dt><dd>企业客服专员</dd></div><div><dt>响应目标</dt><dd>待企业确认</dd></div></dl><p><ShieldCheck size={18} /> 只创建企业协同工单；不控制车辆，不自动对外承诺。</p></section>
                <aside className="decision-aside"><StateTag kind="pending">人工关口</StateTag><h3>由企业值班经理决定</h3><p>可确认风险与责任，或退回补充证据；演示不提供风险自动降级。</p><button className="primary" onClick={() => setModal("risk")}>打开人工确认</button></aside>
              </div>
            )}

            {demoStep === 3 && (
              <div className="demo-content workorder-content">
                <section className="workorder-card"><span className="case-id">DEMO-WO-006</span><h3>舱门异常核查</h3><p className="owner-line"><Buildings size={19} />企业车辆运维负责人</p><ol><li className="done">已接单</li><li className="done">核验合成日志</li><li className="current">补充处置记录</li><li>等待验证</li></ol></section>
                <section className="content-panel"><StateTag kind="synthetic">合成处置证据</StateTag><h3>提交内容</h3><dl><div><dt>核查记录</dt><dd>已核对开舱重试与版本信息</dd></div><div><dt>现场结果</dt><dd>合成测试恢复，等待授权人员验证</dd></div><div><dt>控制指令</dt><dd>未执行</dd></div></dl></section>
                <aside className="decision-aside"><StateTag kind="pending">等待提交</StateTag><h3>处置完成不等于结案</h3><p>必须提交记录与验证证据，再由另一授权角色确认结果。</p><button className="primary" onClick={() => advance("企业车辆运维负责人已模拟提交处置证据，案件进入待验证。")}>提交处置证据 <ArrowRight size={17} /></button></aside>
              </div>
            )}

            {demoStep === 4 && (
              <div className="demo-content verify-content">
                <section className="verification-list"><h3>关闭前检查</h3>{["原始反馈与来源仍可追溯", "车辆/任务关联已人工确认", "处置记录与验证人完整", "回复草稿不含赔偿、责任或恢复时间承诺"].map((item) => <p key={item}><CheckCircle size={20} weight="fill" />{item}</p>)}</section>
                <section className="reply-draft"><StateTag kind="ai">AI 回复草稿</StateTag><blockquote>“已收到您反馈的到站开舱问题。相关记录已进入人工核查，感谢您提供线索。”</blockquote><small>仅为草稿；对外发送必须由企业授权人员确认。</small></section>
                <aside className="decision-aside"><StateTag kind="pending">人工审批</StateTag><h3>验证结果并决定结案</h3><p>AI 不判断事故责任、赔偿、恢复时间或最终技术根因。</p><button className="primary" onClick={() => setModal("reply")}>审批回复与结案</button></aside>
              </div>
            )}

            {demoStep === 5 && (
              <div className="demo-content improvement-content">
                <section className="cluster-summary"><StateTag kind="synthetic">合成问题簇</StateTag><span className="case-id">DEMO-CL-001</span><h3>舱门解锁失败</h3><strong>4</strong><small>个独立合成案件</small><p>只有同一事件才并案；不同事件仅进入同一问题簇。</p></section>
                <section className="content-panel"><StateTag kind="pending">待企业验证</StateTag><h3>改进草案</h3><dl><div><dt>根因假设</dt><dd>可能与版本或部件批次相关</dd></div><div><dt>企业责任团队</dt><dd>待确认</dd></div><div><dt>7天 / 30天复发观察</dt><dd>{improvementCreated ? "草案已建立，观察未开始" : "尚未建立"}</dd></div></dl></section>
                <aside className="decision-aside"><StateTag kind={improvementCreated ? "confirmed" : "pending"}>{improvementCreated ? "草案已生成" : "人工评审"}</StateTag><h3>{improvementCreated ? "闭环演示完成" : "由企业产品/质量负责人决定"}</h3><p>{improvementCreated ? "未确认最终根因，未发布知识；后续仍需企业数据验证。" : "生成草案不等于确认根因，也不代表改进已经产生经营成效。"}</p><button className="primary" disabled={improvementCreated} onClick={() => { setImprovementCreated(true); setNotice("已生成待企业评审的改进草案；未确认根因，未发布知识。"); }}>{improvementCreated ? <><Check size={17} /> 已生成改进草案</> : <>生成改进项目草案 <ArrowRight size={17} /></>}</button><button className="secondary" onClick={() => navigate("team")}>查看参赛团队</button></aside>
              </div>
            )}

            <footer className="demo-board-foot" aria-live="polite"><CheckCircle size={19} weight="duotone" /><span>{notice}</span></footer>
          </div>
        </section>
      )}

      {view === "cases" && (
        <section className="workspace">
          <div className="workspace-head"><div><p className="eyebrow">精选合成案件</p><h1>从原文到可处置对象</h1><p>页面精选展示 6 / 20 个合成案件；完整明细以报名 Excel 为准。</p></div><div className="filter-row" aria-label="按风险筛选">{(["全部", "P0", "P1", "P2", "P3"] as const).map((item) => <button key={item} className={filter === item ? "selected" : ""} onClick={() => setFilter(item)}>{item}</button>)}</div></div>
          <div className="case-layout">
            <div className="case-list" aria-label="案件列表">{filteredCases.map((item) => <button className={`case-row ${item.id === selected.id ? "chosen" : ""}`} key={item.id} onClick={() => setSelectedId(item.id)}><PriorityTag priority={item.priority} /><span className="case-row-title"><b>{item.title}</b><small>{item.id} · {item.status}</small></span><ArrowRight size={18} /></button>)}</div>
            <article className="case-detail"><div className="detail-top"><div><PriorityTag priority={selected.priority} /> <StateTag kind="synthetic">合成案件</StateTag></div><span className="case-id">{selected.id}</span></div><h2>{selected.title}</h2><p className="detail-summary">{selected.summary}</p><div className="detail-grid"><div><span>车辆</span><b>{selected.vehicle}</b></div><div><span>任务</span><b>{selected.task}</b></div><div><span>建议企业团队</span><b>{selected.team}</b></div><div><span>关联置信度</span><b>{selected.confidence}</b></div></div><div className="evidence-section"><h3>模拟证据类型</h3><div>{selected.evidence.map((item) => <span key={item}>{item}</span>)}</div></div><div className="next-action"><span>下一步</span><b>{selected.next}</b></div><div className="audit-note">低置信关联不会自动写入结论。系统保留证据、AI建议与人工修改记录。</div>{selected.id === "DEMO-C-002" && <button className="primary detail-cta" onClick={() => { setDemoStep(0); navigate("demo"); }}>用这个案例体验闭环 <ArrowRight size={17} /></button>}</article>
          </div>
        </section>
      )}

      {view === "clusters" && (
        <section className="workspace">
          <div className="workspace-head"><div><p className="eyebrow">重复问题</p><h1>从案件到改进草案</h1><p>页面精选展示 4 / 10 个合成问题簇；不同事件只聚类，不合并案件。</p></div></div>
          <div className="cluster-layout">
            <div className="cluster-list">{clusters.map((cluster) => <button key={cluster.id} className={cluster.id === selectedCluster.id ? "chosen" : ""} onClick={() => setSelectedClusterId(cluster.id)}><PriorityTag priority={cluster.risk} /><span><b>{cluster.name}</b><small>{cluster.id} · {cluster.count} 个合成案件</small></span><ArrowRight size={18} /></button>)}</div>
            <article className="cluster-detail"><div className="detail-top"><StateTag kind="synthetic">合成问题簇</StateTag><span className="status">{selectedCluster.status}</span></div><span className="case-id">{selectedCluster.id}</span><h2>{selectedCluster.name}</h2><div className="cluster-count"><strong>{selectedCluster.count}</strong><span>关联案件</span></div><div className="related-cases">{selectedCluster.related.map((item) => <span key={item}>{item}</span>)}</div><dl><div><dt>根因假设</dt><dd>{selectedCluster.hypothesis}</dd></div><div><dt>下一步</dt><dd>{selectedCluster.action}</dd></div><div><dt>企业责任团队</dt><dd>待企业确认</dd></div></dl>{selectedCluster.id === "DEMO-CL-001" && <button className="primary detail-cta" onClick={() => { setDemoStep(5); navigate("demo"); }}>进入改进演示 <ArrowRight size={17} /></button>}</article>
          </div>
          <div className="recurrence"><div><p className="eyebrow">复发监测口径</p><h2>7 天与 30 天观察</h2><p>合成柱形只展示界面与计算口径，不代表企业经营成效。</p></div><div className="recurrence-bars"><div><span>7天</span><i style={{ width: "56%" }} /></div><div><span>30天</span><i style={{ width: "32%" }} /></div><small>示例值｜不代表真实趋势</small></div></div>
        </section>
      )}

      {view === "team" && (
        <section className="workspace team-page">
          <div className="workspace-head"><div><p className="eyebrow">参赛团队｜石听未来</p><h1>项目由两名参赛成员共同完成</h1><p>这里仅展示参赛项目归属；两名成员不映射演示中的企业客服、运维、审批或改进角色。</p></div></div>
          <div className="team-grid">
            <article className="member-card"><img src="/avatars/liu.png" alt="刘肖蔚然的刘姓氏头像" width="118" height="118" /><div><span className="member-role">队长</span><h2>刘肖蔚然</h2><p>青岛农业大学</p><p>风景园林（虚拟现实技术设计）</p></div></article>
            <article className="member-card"><img src="/avatars/yan.png" alt="闫紫豪的闫姓氏头像" width="118" height="118" /><div><span className="member-role">队员</span><h2>闫紫豪</h2><p>青岛农业大学</p><p>风景园林（虚拟现实技术设计）</p></div></article>
          </div>
          <div className="team-clarity"><ShieldCheck size={25} weight="duotone" /><div><h2>角色边界</h2><p>参赛成员负责本项目的设计与制作。演示闭环中的接单、派单、处置、审批和改进均由“企业业务角色（演示名称，待企业确认）”执行。</p></div></div>
          <button className="primary" onClick={() => navigate("demo")}>查看企业闭环演示 <ArrowRight size={17} /></button>
        </section>
      )}

      <footer className="site-footer"><span>石听未来 · 石听 NeoLoop</span><span>公开交互原型 · 全部业务数据均为合成样例</span></footer>

      {modal && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setModal(null)}>
          <section className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-icon"><ShieldCheck size={28} weight="duotone" /></div>
            {modal === "risk" ? (
              <><StateTag kind="pending">人工关口</StateTag><h2 id="modal-title">确认 P1 并生成合成工单？</h2><p>企业值班经理确认风险与责任路由。系统只生成本地演示状态，不创建真实工单，也不向车辆发送指令。</p><ul><li>风险建议：P1｜交付受阻</li><li>主责团队：企业车辆运维</li><li>缺失证据：无（合成演示状态）</li></ul><div className="modal-actions"><button className="secondary" onClick={() => { setModal(null); setNotice("已退回补充证据；案件仍停留在人工关口。") }}><ArrowLeft size={17} />退回补证</button><button className="primary" onClick={() => { setModal(null); advance("人工决定已记录；合成工单 DEMO-WO-006 已生成。") }}>确认 P1 并生成工单 <ArrowRight size={17} /></button></div></>
            ) : (
              <><StateTag kind="pending">人工审批</StateTag><h2 id="modal-title">批准回复草稿并模拟关闭案件？</h2><p>企业授权审批人确认验证证据与回复边界。此操作不会发送真实消息。</p><ul><li>验证人：企业授权审批人（合成角色）</li><li>回复：不含赔偿、责任或恢复时间承诺</li><li>最终根因：仍为待验证</li></ul><div className="modal-actions"><button className="secondary" onClick={() => setModal(null)}>继续检查</button><button className="primary" onClick={() => { setModal(null); advance("回复草稿已模拟批准，案件已模拟关闭并进入问题簇观察。") }}>批准并模拟关闭 <ArrowRight size={17} /></button></div></>
            )}
          </section>
        </div>
      )}
    </main>
  );
}
