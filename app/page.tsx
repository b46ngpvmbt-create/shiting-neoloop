"use client";

import {
  ArrowLeft,
  ArrowRight,
  CheckCircle,
  ClipboardText,
  Database,
  FileText,
  Link as LinkIcon,
  MapPin,
  ShieldCheck,
  Sparkle,
  WarningCircle,
} from "@phosphor-icons/react";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import {
  caseRows,
  evidenceBoundaries,
  failureDrills,
  feedbackRows,
  fiveViews,
  improvementRows,
  mainStory,
  mainStoryCase,
  problemRows,
  slaRows,
  snapshotMeta,
  type EvidenceClass,
  type FailureDrill,
  type ViewKey,
} from "./public-snapshot";
import { ShowcaseZone } from "./showcase-zone";

const visibleRowLimit = 8;

function shortTime(value: string | null | undefined) {
  if (!value) return "—";
  return value.replace("T", " ").slice(5, 16);
}

function executionLabel(value: string) {
  return value === "not_run" ? "未运行" : value;
}

function evidenceLabel(value: EvidenceClass) {
  return evidenceBoundaries.find((item) => item.evidence_class === value)?.label ?? value;
}

function EvidenceTag({ value }: { value: EvidenceClass }) {
  return <span className={`evidence-tag evidence-${value}`}>{evidenceLabel(value)}</span>;
}

function ViewIcon({ view }: { view: ViewKey }) {
  const props = { size: 20, weight: "duotone" as const, "aria-hidden": true };
  if (view === "feedback_inbox") return <FileText {...props} />;
  if (view === "case_cockpit") return <ClipboardText {...props} />;
  if (view === "sla_board") return <CheckCircle {...props} />;
  if (view === "problem_map") return <MapPin {...props} />;
  return <Sparkle {...props} />;
}

function LegacyNotice() {
  return (
    <div className="legacy-notice">
      <WarningCircle size={18} weight="fill" aria-hidden="true" />
      <span>列表状态来自冻结合成历史快照，不是新版工作流的运行结果。</span>
    </div>
  );
}

function EmptyValue({ value }: { value: string | number | null }) {
  return <>{value === null ? <span className="not-run-text">未运行</span> : value}</>;
}

function ReplayDialog({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    restoreFocusRef.current = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.querySelector<HTMLElement>("[data-dialog-close]")?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !panelRef.current) return;

      const focusable = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
        ),
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      restoreFocusRef.current?.focus();
    };
  }, [onClose]);

  return (
    <div
      className="dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="replay-dialog"
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="replay-dialog-title"
      >
        <div className="dialog-head">
          <div>
            <p className="micro-label">只读故障卡</p>
            <h2 id="replay-dialog-title">{title}</h2>
          </div>
          <button className="icon-button" type="button" onClick={onClose} data-dialog-close aria-label="关闭故障详情">
            <span aria-hidden="true">×</span>
          </button>
        </div>
        {children}
        <div className="dialog-actions">
          <button className="secondary-button" type="button" onClick={onClose}>关闭</button>
        </div>
      </div>
    </div>
  );
}

function FeedbackView({ expanded }: { expanded: boolean }) {
  const rows = expanded ? feedbackRows : feedbackRows.slice(0, visibleRowLimit);
  return (
    <>
      <LegacyNotice />
      <div className="data-table feedback-table" role="table" aria-label="反馈收件箱合成快照">
        <div className="table-row table-head" role="row">
          <span role="columnheader">反馈</span><span role="columnheader">进入方式</span>
          <span role="columnheader">关联案件</span><span role="columnheader">快照状态</span>
        </div>
        {rows.map((row) => (
          <article className="table-row" role="row" key={row.feedback_id}>
            <div role="cell" data-label="反馈">
              <code>{row.feedback_id}</code>
              <EvidenceTag value={row.evidence_class} />
            </div>
            <div role="cell" data-label="进入方式">
              <strong>{row.channel}</strong>
              <small>{shortTime(row.received_at)}</small>
            </div>
            <div role="cell" data-label="关联案件">
              <strong>{row.linked_case_id ?? "未关联"}</strong>
              <small>{row.linkedCase?.title ?? "没有公开案件摘要"}</small>
            </div>
            <div role="cell" data-label="快照状态">
              <span className="status-dot"><i aria-hidden="true" />历史快照：{row.processing_status}</span>
              <small>运行证据：无</small>
            </div>
          </article>
        ))}
      </div>
    </>
  );
}

function CaseView({ expanded }: { expanded: boolean }) {
  const rows = expanded ? caseRows : caseRows.slice(0, visibleRowLimit);
  return (
    <>
      <LegacyNotice />
      <div className="data-table case-table" role="table" aria-label="案件驾驶舱合成快照">
        <div className="table-row table-head" role="row">
          <span role="columnheader">案件</span><span role="columnheader">候选实体</span>
          <span role="columnheader">关系</span><span role="columnheader">人工关口</span>
        </div>
        {rows.map((row) => {
          const item = row.caseRecord;
          if (!item) return null;
          return (
            <article className={`table-row ${item.case_id === mainStory.source_case_id ? "featured-row" : ""}`} role="row" key={item.case_id}>
              <div role="cell" data-label="案件">
                <span className="id-line"><code>{item.case_id}</code>{item.final_risk && <b className={`risk risk-${item.final_risk.toLowerCase()}`}>{item.final_risk}</b>}</span>
                <strong>{item.title}</strong>
                <small>历史快照：{item.status}</small>
              </div>
              <div role="cell" data-label="候选实体">
                <strong>{item.candidate_vehicle_id ?? "未提供车辆候选"}</strong>
                <small>{item.candidate_task_id ?? "未提供任务候选"}</small>
              </div>
              <div role="cell" data-label="关系">
                <strong>{row.feedback_ids.length} 条反馈 · {row.work_order_ids.length} 张工单</strong>
                <small>{row.cluster_id ?? "未进入问题簇"}</small>
              </div>
              <div role="cell" data-label="人工关口">
                <EvidenceTag value={item.routing_evidence_class} />
                <small>{item.formal_entity_confirmation_status} · {item.routing_confirmation_status}</small>
              </div>
            </article>
          );
        })}
      </div>
    </>
  );
}

function SlaView({ expanded }: { expanded: boolean }) {
  const rows = expanded ? slaRows : slaRows.slice(0, visibleRowLimit);
  return (
    <>
      <LegacyNotice />
      <div className="data-table sla-table" role="table" aria-label="SLA 协同板合成快照">
        <div className="table-row table-head" role="row">
          <span role="columnheader">工单</span><span role="columnheader">责任候选</span>
          <span role="columnheader">合成时钟</span><span role="columnheader">快照状态</span>
        </div>
        {rows.map((row) => {
          const order = row.workOrder;
          if (!order) return null;
          return (
            <article className="table-row" role="row" key={row.work_order_id}>
              <div role="cell" data-label="工单">
                <code>{order.work_order_id}</code>
                <strong>{order.case_id}</strong>
                <small>{row.caseRecord?.title ?? "未找到公开案件摘要"}</small>
              </div>
              <div role="cell" data-label="责任候选">
                <strong>{order.team}</strong>
                <small>{order.assignee_role}</small>
              </div>
              <div role="cell" data-label="合成时钟">
                <strong>到期 {shortTime(order.due_at)}</strong>
                <small>{row.clock_source} · 重置 {order.sla_reset_count} 次</small>
              </div>
              <div role="cell" data-label="快照状态">
                <span className="status-dot"><i aria-hidden="true" />历史快照：{order.status}</span>
                <small>本版运行证据：无</small>
              </div>
            </article>
          );
        })}
      </div>
    </>
  );
}

function ProblemView({ expanded }: { expanded: boolean }) {
  const rows = expanded ? problemRows : problemRows.slice(0, visibleRowLimit);
  return (
    <>
      <LegacyNotice />
      <div className="problem-grid" aria-label="问题地图合成快照">
        {rows.map((row) => (
          <article className="problem-card" key={row.cluster_id}>
            <div className="card-topline">
              <code>{row.cluster_id}</code>
              {row.clusterRecord?.highest_risk && <b className={`risk risk-${row.clusterRecord.highest_risk.toLowerCase()}`}>{row.clusterRecord.highest_risk}</b>}
            </div>
            <h3>{row.name}</h3>
            <p>{row.clusterRecord?.root_cause_hypothesis ?? "没有公开根因假设"}</p>
            <dl className="compact-facts">
              <div><dt>合成案件</dt><dd>{row.member_case_count} 件</dd></div>
              <div><dt>合成站点</dt><dd>{row.synthetic_station_ids.length} 个</dd></div>
              <div><dt>车型</dt><dd>{row.synthetic_vehicle_models.join("、") || "—"}</dd></div>
              <div><dt>复发证据</dt><dd>{row.recurrence_evidence_available ? "有" : "无"}</dd></div>
            </dl>
            <div className="card-foot">
              <EvidenceTag value={row.evidence_class} />
              <span>最终根因未确认</span>
            </div>
          </article>
        ))}
      </div>
    </>
  );
}

function ImprovementView({ expanded }: { expanded: boolean }) {
  const rows = expanded ? improvementRows : improvementRows.slice(0, visibleRowLimit);
  return (
    <>
      <LegacyNotice />
      <div className="improvement-list" aria-label="改进追踪合成快照">
        {rows.map((row) => {
          const item = row.improvementRecord;
          if (!item) return null;
          return (
            <article className="improvement-card" key={row.improvement_id}>
              <div className="improvement-index"><Sparkle size={19} weight="fill" aria-hidden="true" /></div>
              <div className="improvement-copy">
                <div className="card-topline"><code>{item.improvement_id}</code><EvidenceTag value={item.owner_evidence_class} /></div>
                <h3>{row.clusterRecord?.name ?? item.cluster_id}</h3>
                <p>{item.measure}</p>
                <small>{item.metric_formula}</small>
              </div>
              <dl className="observation-grid">
                <div><dt>7 天</dt><dd><EmptyValue value={item.day_7_result} /></dd></div>
                <div><dt>30 天</dt><dd><EmptyValue value={item.day_30_result} /></dd></div>
                <div><dt>负责人</dt><dd>{item.owner_role}</dd></div>
              </dl>
            </article>
          );
        })}
      </div>
    </>
  );
}

function WorkspacePanel({ view, expanded }: { view: ViewKey; expanded: boolean }) {
  if (view === "feedback_inbox") return <FeedbackView expanded={expanded} />;
  if (view === "case_cockpit") return <CaseView expanded={expanded} />;
  if (view === "sla_board") return <SlaView expanded={expanded} />;
  if (view === "problem_map") return <ProblemView expanded={expanded} />;
  return <ImprovementView expanded={expanded} />;
}

export default function Home() {
  const [activeView, setActiveView] = useState<ViewKey>("feedback_inbox");
  const [expanded, setExpanded] = useState(false);
  const [storyStep, setStoryStep] = useState(0);
  const [activeDrill, setActiveDrill] = useState<FailureDrill | null>(null);
  const expandButtonRef = useRef<HTMLButtonElement>(null);
  const closeDrill = useCallback(() => setActiveDrill(null), []);

  const currentView = useMemo(
    () => fiveViews.find((view) => view.key === activeView) ?? fiveViews[0],
    [activeView],
  );
  const currentStoryStep = mainStory.planned_workflow_path[storyStep];

  function chooseView(view: ViewKey) {
    setActiveView(view);
    setExpanded(false);
  }

  function handleTabKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>, index: number) {
    let nextIndex = index;
    if (event.key === "ArrowRight") nextIndex = (index + 1) % fiveViews.length;
    else if (event.key === "ArrowLeft") nextIndex = (index - 1 + fiveViews.length) % fiveViews.length;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = fiveViews.length - 1;
    else return;
    event.preventDefault();
    const nextView = fiveViews[nextIndex];
    chooseView(nextView.key);
    document.getElementById(`view-tab-${nextView.key}`)?.focus();
  }

  function jumpToView(view: ViewKey) {
    chooseView(view);
    document.getElementById("five-views")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function toggleExpanded() {
    const isCollapsing = expanded;
    setExpanded((value) => !value);
    if (isCollapsing) {
      requestAnimationFrame(() => {
        expandButtonRef.current?.focus();
        expandButtonRef.current?.scrollIntoView({ block: "center" });
      });
    }
  }

  return (
    <main id="top" className="site-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="石听 NeoLoop 首页">
          <span className="brand-mark">石听</span>
          <span className="brand-name">NeoLoop</span>
        </a>
        <nav className="anchor-nav" aria-label="页面导航">
          <a href="#dual-loop">双循环</a>
          <a href="#five-views">五视图</a>
          <a href="#main-story">主故事</a>
          <a href="#failure-drills">故障演练</a>
          <a href="#evidence-boundary">证据边界</a>
        </nav>
        <span className="read-only-pill"><ShieldCheck size={16} weight="fill" aria-hidden="true" />只读公开快照</span>
      </header>

      <section className="hero" aria-labelledby="hero-title">
        <div className="hero-copy">
          <div className="eyebrow"><span>石听未来 · A+ 方案</span><span>公开回放</span></div>
          <h1 id="hero-title">客户的声音，<br />不该停在聊天记录里。</h1>
          <p className="value-statement">{snapshotMeta.valueStatement}</p>
          <p className="hero-text">从一条合成反馈出发，把证据、案件、工单和改进串成可审阅的闭环。这里展示的是方案结构与固定样例，不是企业现场运行结果。</p>
          <ul className="hero-boundaries" aria-label="公开演示边界">
            <li><strong>合成公开演示</strong><span>不是企业现场数据</span></li>
            <li><strong>未连接赛事 Base</strong><span>不持有赛事凭证</span></li>
            <li><strong>预期回放 · 未运行</strong><span>主故事与四类故障均无运行结果</span></li>
            <li><strong>只读 · 无车辆控制</strong><span>不写数据，不触发外部工作流</span></li>
          </ul>
          <div className="hero-actions">
            <Link className="primary-button" href="/software">进入软件工作台 <ArrowRight size={18} weight="bold" aria-hidden="true" /></Link>
            <button className="secondary-button" type="button" onClick={() => jumpToView("feedback_inbox")}>查看五个只读视图</button>
          </div>
        </div>

        <div className="hero-stage">
          <figure className="hero-visual">
            {/* Static 90 KB WebP keeps the same public asset path in local and Netlify builds. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/visuals/neoloop-concept-hero-v1.webp"
              width="1672"
              height="941"
              alt="用于说明反馈闭环的无人配送场景概念插画"
              fetchPriority="high"
            />
            <figcaption>方案场景插画｜非真实车型或运行现场</figcaption>
          </figure>

          <article className="hero-story-card" aria-label="SYN-CASE-017 主故事证据摘要">
            <div className="story-card-head">
              <span className="live-dot" aria-hidden="true" />
              <span>主故事 · {executionLabel(mainStory.execution_status)}</span>
              <EvidenceTag value={mainStory.evidence_class} />
            </div>
            <code>{mainStory.source_case_id}</code>
            <h2>{mainStoryCase?.title ?? mainStory.replay_input.original_text}</h2>
            <p>{mainStory.replay_input.original_text}</p>
            <div className="entity-chain" aria-label="合成候选实体">
              <span><small>车辆候选</small>{mainStory.replay_input.vehicle_id}</span>
              <i aria-hidden="true" />
              <span><small>任务候选</small>{mainStory.replay_input.task_id}</span>
              <i aria-hidden="true" />
              <span><small>案件</small>{mainStory.runtime_case_id}</span>
            </div>
            <p className="card-boundary">预期路径尚未执行；正式实体、责任、回复和结案均保留人工关口。</p>
          </article>
        </div>
      </section>

      <section className="status-rail" aria-label="公开站状态边界">
        <div><Database size={20} weight="duotone" aria-hidden="true" /><span><b>合成实验</b><small>{snapshotMeta.dataScope}</small></span></div>
        <div><LinkIcon size={20} weight="duotone" aria-hidden="true" /><span><b>未连接赛事 Base</b><small>不持有赛事凭证</small></span></div>
        <div><WarningCircle size={20} weight="duotone" aria-hidden="true" /><span><b>主故事与故障未运行</b><small>没有运行结果</small></span></div>
        <div><ShieldCheck size={20} weight="duotone" aria-hidden="true" /><span><b>仅浏览器本地回放</b><small>不写数据，不控制车辆</small></span></div>
      </section>

      <ShowcaseZone />

      <section className="workspace section-shell" id="five-views" aria-labelledby="views-title">
        <div className="section-heading">
          <div><p className="section-kicker">一套关系，五个观察面</p><h2 id="views-title">把反馈闭环摊开来看</h2></div>
          <p>五个视图读取同一份冻结公开快照。切换标签、翻页和回放步骤只改变当前浏览器状态，不等于获得真实权限，也不会触发工作流。</p>
        </div>

        <div className="view-tabs" role="tablist" aria-label="五个只读业务视图">
          {fiveViews.map((view, index) => (
            <button
              id={`view-tab-${view.key}`}
              key={view.key}
              type="button"
              role="tab"
              aria-selected={activeView === view.key}
              aria-controls="active-view-panel"
              tabIndex={activeView === view.key ? 0 : -1}
              className={activeView === view.key ? "active" : ""}
              onClick={() => chooseView(view.key)}
              onKeyDown={(event) => handleTabKeyDown(event, index)}
            >
              <ViewIcon view={view.key} />
              <span>{view.label}<small>{view.count} 条</small></span>
            </button>
          ))}
        </div>

        <div className="view-panel" id="active-view-panel" role="tabpanel" aria-labelledby={`view-tab-${activeView}`} tabIndex={0}>
          <div className="view-panel-head">
            <div><p className="micro-label">{currentView.key}</p><h3>{currentView.label}</h3></div>
            <span className="snapshot-chip">只读 · {currentView.count} 条合成记录</span>
          </div>
          <div id="active-view-records">
            <WorkspacePanel view={activeView} expanded={expanded} />
          </div>
          {currentView.count > visibleRowLimit && (
            <>
              <p className="record-count-note" aria-live="polite">
                当前显示 {expanded ? currentView.count : visibleRowLimit} / {currentView.count} 条合成记录
              </p>
              <button
                ref={expandButtonRef}
                className="expand-button"
                type="button"
                onClick={toggleExpanded}
                aria-controls="active-view-records"
                aria-expanded={expanded}
              >
                {expanded ? `收起，显示前 ${visibleRowLimit} 条` : `查看全部 ${currentView.count} 条合成记录`}
                <ArrowRight size={16} aria-hidden="true" />
              </button>
            </>
          )}
        </div>
      </section>

      <section className="story-section section-shell" id="main-story" aria-labelledby="story-title">
        <div className="section-heading">
          <div><p className="section-kicker">主故事 · SYN-CASE-017</p><h2 id="story-title">七步预期路径，不伪装成一次实跑</h2></div>
          <p>固定输入、测试时钟、预期输出和人工关口都来自公开快照。当前执行状态为“未运行”，因此页面不展示通过率、耗时或收益。</p>
        </div>

        <div className="story-layout">
          <article className="story-input">
            <div className="story-input-top"><span>输入</span><EvidenceTag value={mainStory.evidence_class} /></div>
            <blockquote>{mainStory.replay_input.original_text}</blockquote>
            <dl>
              <div><dt>渠道</dt><dd>{mainStory.replay_input.channel}</dd></div>
              <div><dt>测试时钟</dt><dd>{shortTime(mainStory.clock.anchor)}</dd></div>
              <div><dt>车辆候选</dt><dd>{mainStory.replay_input.vehicle_id}</dd></div>
              <div><dt>任务候选</dt><dd>{mainStory.replay_input.task_id}</dd></div>
              <div><dt>初始案件状态</dt><dd>{mainStory.expected_case_draft.case_status}</dd></div>
              <div><dt>运行证据</dt><dd>无</dd></div>
            </dl>
            <button className="text-button" type="button" onClick={() => jumpToView("case_cockpit")}>在案件驾驶舱查看源快照 <ArrowRight size={15} aria-hidden="true" /></button>
          </article>

          <div className="replay-console">
            <div className="replay-head">
              <div><span>浏览器本地回放</span><strong>{storyStep + 1} / {mainStory.planned_workflow_path.length}</strong></div>
              <div className="progress-track" aria-hidden="true"><i style={{ width: `${((storyStep + 1) / mainStory.planned_workflow_path.length) * 100}%` }} /></div>
            </div>
            <ol className="workflow-steps" aria-label="主故事预期工作流">
              {mainStory.planned_workflow_path.map((step, index) => (
                <li key={`${step.workflow}-${step.order}`} className={index === storyStep ? "active" : index < storyStep ? "passed" : ""}>
                  <button type="button" onClick={() => setStoryStep(index)} aria-current={index === storyStep ? "step" : undefined}>
                    <span>{index < storyStep ? "✓" : step.order}</span>
                    <b>{step.workflow}</b>
                    <small>{step.mode ?? "预期节点"}</small>
                  </button>
                </li>
              ))}
            </ol>
            <div className="step-detail" aria-live="polite">
              <div><span>当前查看</span><b>{currentStoryStep.workflow}</b></div>
              <p>{currentStoryStep.expectation}</p>
              <small>这是一条规格预期，不是运行日志。</small>
            </div>
            <div className="replay-actions">
              <button className="secondary-button" type="button" disabled={storyStep === 0} onClick={() => setStoryStep((step) => Math.max(0, step - 1))}><ArrowLeft size={17} aria-hidden="true" />上一步</button>
              <button className="primary-button" type="button" disabled={storyStep === mainStory.planned_workflow_path.length - 1} onClick={() => setStoryStep((step) => Math.min(mainStory.planned_workflow_path.length - 1, step + 1))}>下一步<ArrowRight size={17} aria-hidden="true" /></button>
            </div>
          </div>
        </div>
      </section>

      <section className="failure-section section-shell" id="failure-drills" aria-labelledby="failure-title">
        <div className="section-heading">
          <div><p className="section-kicker">安全降级</p><h2 id="failure-title">四类故障，先定义停在哪里</h2></div>
          <p>四张卡全部为未运行的故障规格。打开详情只能查看预期安全路径，不会把卡片标成“已通过”。</p>
        </div>
        <div className="failure-grid">
          {failureDrills.map((drill, index) => (
            <article className="failure-card" key={drill.drill_id}>
              <div className="failure-number">0{index + 1}</div>
              <div className="failure-copy">
                <div className="card-topline"><code>{drill.drill_id}</code><span className="not-run-chip">{executionLabel(drill.execution_status)}</span></div>
                <h3>{drill.fault_summary}</h3>
                <p><b>预期安全停点：</b>{drill.expected_safe_path}</p>
                <button className="text-button" type="button" onClick={() => setActiveDrill(drill)} aria-haspopup="dialog">查看边界与人工关口 <ArrowRight size={15} aria-hidden="true" /></button>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="evidence-section section-shell" id="evidence-boundary" aria-labelledby="evidence-title">
        <div className="section-heading">
          <div><p className="section-kicker">声明先于结论</p><h2 id="evidence-title">四类证据，分开说清楚</h2></div>
          <p>标签来自公开声明文件。它们约束页面如何描述事实、验证问题、设计规格和合成结果。</p>
        </div>
        <div className="evidence-grid">
          {evidenceBoundaries.map((boundary, index) => (
            <article className={`evidence-card evidence-card-${index + 1}`} key={boundary.evidence_class}>
              <div><span>0{index + 1}</span><EvidenceTag value={boundary.evidence_class} /></div>
              <h3>{boundary.requirement}</h3>
              <p>不得：{boundary.forbidden_practice}</p>
              <code>{boundary.public_status}</code>
            </article>
          ))}
        </div>
      </section>

      <section className="team-strip" aria-labelledby="team-title">
        <div className="team-summary">
          <p className="section-kicker">参赛团队 / 联系方式</p>
          <h2 id="team-title">石听未来</h2>
          <p>参赛成员不等于演示中的企业角色。这里仅展示团队身份与公开联系方式。</p>
        </div>

        <div className="team-people">
          <p className="micro-label">成员</p>
          <ul className="team-member-list" aria-label="参赛成员">
            <li><strong>刘肖蔚然</strong><span>队长</span></li>
            <li><strong>闫紫豪</strong><span>队员</span></li>
          </ul>
          <p className="team-school">青岛农业大学｜风景园林（虚拟现实技术设计）</p>
        </div>

        <div className="team-contact">
          <p className="micro-label">联系与源码</p>
          <div className="contact-links">
            <a className="contact-link" href="mailto:2718275274@qq.com">
              <span><small>邮箱</small><b>2718275274@qq.com</b></span>
              <ArrowRight size={16} aria-hidden="true" />
            </a>
            <a
              className="contact-link"
              href="https://github.com/b46ngpvmbt-create"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="打开 GitHub 个人主页（新窗口）"
            >
              <span><small>GitHub 个人主页</small><b>github.com/b46ngpvmbt-create</b></span>
              <ArrowRight size={16} aria-hidden="true" />
            </a>
            <a
              className="contact-link"
              href="https://github.com/b46ngpvmbt-create/shiting-neoloop"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="打开石听 NeoLoop 项目仓库（新窗口）"
            >
              <span><small>项目仓库</small><b>github.com/b46ngpvmbt-create/shiting-neoloop</b></span>
              <ArrowRight size={16} aria-hidden="true" />
            </a>
          </div>
        </div>
      </section>

      <footer className="site-footer">
        <div className="footer-brand"><span className="brand-mark">石听</span><span><b>{snapshotMeta.productName}</b><small>{snapshotMeta.teamName}</small></span></div>
        <p>{snapshotMeta.disclaimer}</p>
        <dl className="version-list">
          <div><dt>snapshot</dt><dd>{snapshotMeta.snapshotVersion}</dd></div>
          <div><dt>schema</dt><dd>{snapshotMeta.schemaVersion}</dd></div>
          <div><dt>fixture</dt><dd>{snapshotMeta.fixtureVersion}</dd></div>
        </dl>
      </footer>

      {activeDrill && (
        <ReplayDialog title={activeDrill.drill_id} onClose={closeDrill}>
          <div className="dialog-status"><span className="not-run-chip">{executionLabel(activeDrill.execution_status)}</span><EvidenceTag value={activeDrill.evidence_class} /></div>
          <p className="dialog-summary">{activeDrill.fault_summary}</p>
          <section className="dialog-block"><h3>预期安全路径</h3><p>{activeDrill.expected_safe_path}</p></section>
          <div className="dialog-grid">
            <section className="dialog-block"><h3>人工关口</h3><ul>{activeDrill.human_gate_keys.map((item) => <li key={item}>{item}</li>)}</ul></section>
            <section className="dialog-block"><h3>禁止动作</h3><ul>{activeDrill.forbidden_actions.map((item) => <li key={item}>{item}</li>)}</ul></section>
          </div>
          <p className="dialog-footnote">状态仍为未运行；关闭弹窗不会保存状态、触发重试、升级或任何车辆动作。</p>
        </ReplayDialog>
      )}
    </main>
  );
}
