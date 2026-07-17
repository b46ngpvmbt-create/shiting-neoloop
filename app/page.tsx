"use client";

import { useMemo, useState } from "react";

type Priority = "P0" | "P1" | "P2" | "P3";

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
    status: "已关闭",
    team: "车辆运维 + 现场运维",
    vehicle: "DEMO-X6-102",
    task: "DEMO-T-8452",
    summary: "任务中断时出现道路安全风险词。系统先触发硬规则，再由授权人员确认处置。",
    evidence: ["现场照片", "任务日志", "处置记录"],
    next: "保留证据链，进入安全事件复盘。",
    confidence: "0.98",
  },
  {
    id: "DEMO-C-002",
    title: "到站后舱门无法开启",
    priority: "P1",
    status: "已关闭",
    team: "车辆运维",
    vehicle: "DEMO-X6-107",
    task: "DEMO-T-8458",
    summary: "同一任务收到多渠道反馈，先并案，再关联开舱重试记录和现场视频。",
    evidence: ["错误码", "开舱重试记录", "现场视频"],
    next: "关联同版本案件，观察是否重复发生。",
    confidence: "0.97",
  },
  {
    id: "DEMO-C-003",
    title: "站点多车同时离线",
    priority: "P1",
    status: "处理中",
    team: "车辆运维 + 现场运维",
    vehicle: "DEMO-X3-205",
    task: "DEMO-T-8461",
    summary: "同一站点多辆车离线，需区分站点网络、车端通信与任务异常。",
    evidence: ["网络探测", "车辆日志", "站点信息"],
    next: "补齐网络探测与车端日志。",
    confidence: "0.72",
  },
  {
    id: "DEMO-C-005",
    title: "路线点位指向关闭入口",
    priority: "P2",
    status: "待验证",
    team: "现场运维",
    vehicle: "DEMO-X3-211",
    task: "DEMO-T-8474",
    summary: "现场入口发生变化后，既有点位仍被任务引用，需要在下一任务中复核。",
    evidence: ["新旧点位截图", "现场说明", "任务记录"],
    next: "重新采集点位并在下一任务验证。",
    confidence: "0.91",
  },
  {
    id: "DEMO-C-011",
    title: "新版搜索无法总览车辆电量",
    priority: "P3",
    status: "已分诊",
    team: "客户服务 + 产品",
    vehicle: "待补充",
    task: "待补充",
    summary: "公开评论样例只代表单个用户反馈，进入需求分诊，不外推为普遍问题。",
    evidence: ["公开评论链接", "截图", "产品需求记录"],
    next: "核对公开能力边界与企业路线图。",
    confidence: "0.86",
  },
  {
    id: "DEMO-C-017",
    title: "冷链舱温度持续告警",
    priority: "P1",
    status: "已关闭",
    team: "车辆运维 + 现场运维",
    vehicle: "DEMO-X6-145",
    task: "DEMO-T-8488",
    summary: "温度告警先保护货物，再核实传感器、制冷状态和换车记录。",
    evidence: ["温度曲线", "换车记录", "货物复核"],
    next: "回顾专项SOP并监测复发。",
    confidence: "0.97",
  },
];

const clusters = [
  { id: "DEMO-CL-001", name: "舱门解锁失败", risk: "P1", count: 4, status: "观察中", hypothesis: "待验证：版本或部件批次相关", action: "同类问题24小时达到阈值时创建改进项目" },
  { id: "DEMO-CL-002", name: "站点网络与数据回传异常", risk: "P1", count: 2, status: "处理中", hypothesis: "待验证：站点网络或车端通信链路", action: "补齐网络探测与车端日志" },
  { id: "DEMO-CL-003", name: "道路停驶安全事件", risk: "P0", count: 1, status: "已控制", hypothesis: "不得由AI确认最终根因", action: "保持硬规则告警与人工复核" },
  { id: "DEMO-CL-005", name: "地图点位与现场变化", risk: "P2", count: 2, status: "处理中", hypothesis: "待验证：地图版本或现场环境变化", action: "重新采集并在下一任务验证" },
];

const steps = ["接入", "识别", "关联", "分派", "处置", "验证", "回复与回访"];

function PriorityTag({ priority }: { priority: Priority }) {
  return <span className={`priority priority-${priority.toLowerCase()}`}>{priority}</span>;
}

export default function Home() {
  const [view, setView] = useState<"overview" | "cases" | "clusters">("overview");
  const [filter, setFilter] = useState<"全部" | Priority>("全部");
  const [selectedId, setSelectedId] = useState(cases[0].id);
  const selected = cases.find((item) => item.id === selectedId) ?? cases[0];
  const filteredCases = useMemo(
    () => (filter === "全部" ? cases : cases.filter((item) => item.priority === filter)),
    [filter],
  );

  return (
    <main className="site-shell">
      <nav className="topbar" aria-label="主导航">
        <button className="brand" onClick={() => setView("overview")} aria-label="返回首页">
          <span className="brand-mark">石听</span>
          <span>NeoLoop</span>
        </button>
        <div className="nav-links">
          <button className={view === "overview" ? "active" : ""} onClick={() => setView("overview")}>方案总览</button>
          <button className={view === "cases" ? "active" : ""} onClick={() => setView("cases")}>反馈案件</button>
          <button className={view === "clusters" ? "active" : ""} onClick={() => setView("clusters")}>问题簇</button>
        </div>
        <span className="demo-badge">DEMO｜全部为合成数据</span>
      </nav>

      {view === "overview" && (
        <>
          <section className="hero">
            <div className="hero-copy">
              <p className="eyebrow">无人配送客户之声闭环中枢</p>
              <h1>让每条反馈都找到<br />一辆车、一个任务、一个责任人和一次改进。</h1>
              <p className="hero-text">NeoLoop不重复做查车、发车或充电调度。它处理的是反馈进入后，如何补齐证据、交给正确团队，并把重复问题变成可跟踪的改进项目。</p>
              <div className="hero-actions">
                <button className="primary" onClick={() => setView("cases")}>查看案件闭环</button>
                <button className="secondary" onClick={() => setView("clusters")}>查看问题簇</button>
              </div>
            </div>
            <div className="loop-card" aria-label="反馈闭环示意">
              <div className="orbit orbit-one" /><div className="orbit orbit-two" /><div className="orbit orbit-three" />
              <div className="orbit-core">反馈<br />闭环</div>
              <span className="orbit-node n1">反馈</span><span className="orbit-node n2">证据</span>
              <span className="orbit-node n3">责任</span><span className="orbit-node n4">改进</span>
              <span className="orbit-caption">原始反馈 → 案件 → 工单 → 问题簇</span>
            </div>
          </section>

          <section className="stat-grid" aria-label="合成演示数据概览">
            <article><strong>30</strong><span>原始反馈</span><small>覆盖群消息、工单、邮件和评价</small></article>
            <article><strong>20</strong><span>反馈案件</span><small>同一事件可并案，不同事件只聚类</small></article>
            <article><strong>27</strong><span>处置工单</span><small>为案件拆解执行与验证任务</small></article>
            <article><strong>10</strong><span>问题簇</span><small>用于复发观察和改进跟踪</small></article>
          </section>

          <section className="section-block boundary-grid">
            <div className="section-heading"><p className="eyebrow mint">信息边界</p><h2>四类内容，四种说法</h2></div>
            <article className="boundary fact"><h3>公开事实</h3><p>只引用公开资料明确披露的能力与业务对象，不推断内部系统。</p></article>
            <article className="boundary verify"><h3>待企业验证</h3><p>字段、责任矩阵、SLA和真实流程必须在企业侧确认。</p></article>
            <article className="boundary design"><h3>方案设计</h3><p>单Base、七个AI节点、六条工作流和人工关口属于拟建方案。</p></article>
            <article className="boundary synthetic"><h3>合成实验</h3><p>演示车辆、任务、案件和指标只验证结构与流程，不代表真实成效。</p></article>
          </section>

          <section className="section-block">
            <div className="section-heading split"><div><p className="eyebrow mint">一条反馈如何被处理</p><h2>个案闭环</h2></div><p>模型提供建议，授权人员决定风险、责任和对外动作。</p></div>
            <div className="step-track">{steps.map((step, index) => <div className="step" key={step}><span>{String(index + 1).padStart(2, "0")}</span>{step}</div>)}</div>
            <div className="guardrail"><b>强制人工关口</b><span>车辆控制｜高风险降级｜客户回复、赔偿与恢复时间｜最终根因与知识发布</span></div>
          </section>
        </>
      )}

      {view === "cases" && (
        <section className="workspace">
          <div className="workspace-head"><div><p className="eyebrow mint">反馈案件</p><h1>从原文到可处置对象</h1><p>以下均为合成演示案例。</p></div><div className="filter-row" aria-label="按风险筛选">{(["全部", "P0", "P1", "P2", "P3"] as const).map((item) => <button key={item} className={filter === item ? "selected" : ""} onClick={() => setFilter(item)}>{item}</button>)}</div></div>
          <div className="case-layout">
            <div className="case-list" aria-label="案件列表">{filteredCases.map((item) => <button className={`case-row ${item.id === selected.id ? "chosen" : ""}`} key={item.id} onClick={() => setSelectedId(item.id)}><PriorityTag priority={item.priority} /><span className="case-row-title"><b>{item.title}</b><small>{item.id} · {item.status}</small></span><span className="chevron">›</span></button>)}</div>
            <article className="case-detail">
              <div className="detail-top"><div><PriorityTag priority={selected.priority} /><span className="status">{selected.status}</span></div><span className="case-id">{selected.id}</span></div>
              <h2>{selected.title}</h2><p className="detail-summary">{selected.summary}</p>
              <div className="detail-grid"><div><span>车辆</span><b>{selected.vehicle}</b></div><div><span>任务</span><b>{selected.task}</b></div><div><span>主责团队</span><b>{selected.team}</b></div><div><span>关联置信度</span><b>{selected.confidence}</b></div></div>
              <div className="evidence-section"><h3>已关联证据</h3><div>{selected.evidence.map((item) => <span key={item}>{item}</span>)}</div></div>
              <div className="next-action"><span>下一步</span><b>{selected.next}</b></div>
              <div className="audit-note">低置信关联不会自动写入结论。系统保留证据、建议和人工修改记录。</div>
            </article>
          </div>
        </section>
      )}

      {view === "clusters" && (
        <section className="workspace">
          <div className="workspace-head"><div><p className="eyebrow mint">重复问题</p><h1>从案件到改进项目</h1><p>同一事件可以并案。不同事件只进入同一问题簇，不合并案件。</p></div></div>
          <div className="cluster-grid">{clusters.map((cluster) => <article className="cluster-card" key={cluster.id}><div className="detail-top"><PriorityTag priority={cluster.risk as Priority} /><span className="status">{cluster.status}</span></div><p className="case-id">{cluster.id}</p><h2>{cluster.name}</h2><div className="cluster-count"><strong>{cluster.count}</strong><span>关联案件</span></div><dl><div><dt>根因假设</dt><dd>{cluster.hypothesis}</dd></div><div><dt>下一步</dt><dd>{cluster.action}</dd></div></dl></article>)}</div>
          <div className="recurrence"><div><p className="eyebrow mint">复发监测</p><h2>7天与30天观察</h2><p>改进项目关闭后，继续观察同类问题是否下降；指标只作为评测口径，不代表企业实绩。</p></div><div className="recurrence-bars"><div><span>7天</span><i style={{ width: "56%" }} /></div><div><span>30天</span><i style={{ width: "32%" }} /></div><small>示例柱形仅表示演示结构</small></div></div>
        </section>
      )}

      <footer><span>石听未来 · 石听 NeoLoop</span><span>公开演示版 · 全部数据为合成样例</span></footer>
    </main>
  );
}
