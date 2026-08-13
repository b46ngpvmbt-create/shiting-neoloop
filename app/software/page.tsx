"use client";

import {
  ArrowLeft,
  ArrowRight,
  ArrowsClockwise,
  Broadcast,
  Check,
  CheckCircle,
  CirclesThreePlus,
  ClockCountdown,
  Database,
  EnvelopeSimple,
  FileText,
  Funnel,
  GitBranch,
  MagnifyingGlass,
  MapPin,
  Package,
  Phone,
  Play,
  ShieldCheck,
  Sparkle,
  UserCircleCheck,
  WarningCircle,
  X,
} from "@phosphor-icons/react";
import Link from "next/link";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { fiveViews, snapshotMeta, type ViewKey } from "../public-snapshot";
import {
  buildRecords,
  evidenceLabel,
  sandboxSteps,
  storyTargets,
  viewDescriptions,
  type ConsoleRecord,
  type FilterMode,
  type WorkbenchMode,
} from "./workbench-data";

const caseTimeline = [
  { label: "接入", detail: "3 条合成反馈", state: "done" },
  { label: "分诊", detail: "P1 候选", state: "done" },
  { label: "实体", detail: "待人工确认", state: "current" },
  { label: "路由", detail: "待人工确认", state: "waiting" },
  { label: "工单", detail: "1 张合成工单", state: "waiting" },
  { label: "回访", detail: "缺运行证据", state: "waiting" },
];

const improvementTimeline = [
  { label: "人工立项", detail: "方案路径", state: "design" },
  { label: "7 天观察", detail: "未运行", state: "empty" },
  { label: "30 天观察", detail: "未运行", state: "empty" },
  { label: "归档 / 重开", detail: "待人工结论", state: "empty" },
];

type ReviewDecision = "return_for_evidence" | "reject_candidate";

type LocalReviewEvent = {
  gateKey: string;
  gateLabel: string;
  decision: ReviewDecision | "resubmitted" | "approved";
  reason: string;
  returnTarget: string;
  nextOwnerRole: string;
  iteration: number;
};

type ActiveReview = LocalReviewEvent & {
  decision: ReviewDecision;
};

type ResubmissionState = {
  stepIndex: number;
  iteration: number;
  note: string;
};

type ActionTone = "ready" | "success" | "warning";

type ActionGuidance = {
  actionId: string;
  title: string;
  intent: string;
  nextStep: string;
};

type ActionFeedback = {
  actionId: string;
  title: string;
  target: string;
  result: string;
  nextStep: string;
  tone: ActionTone;
};

type ActionEvent = ActionFeedback & {
  sequence: number;
};

function ViewIcon({ view }: { view: ViewKey }) {
  const props = { size: 20, weight: "duotone" as const, "aria-hidden": true };
  if (view === "feedback_inbox") return <FileText {...props} />;
  if (view === "case_cockpit") return <CirclesThreePlus {...props} />;
  if (view === "sla_board") return <ClockCountdown {...props} />;
  if (view === "problem_map") return <MapPin {...props} />;
  return <Sparkle {...props} />;
}

function ChannelIcon({ channel }: { channel: string }) {
  const props = { size: 19, weight: "duotone" as const, "aria-hidden": true };
  if (channel.includes("邮件")) return <EnvelopeSimple {...props} />;
  if (channel.includes("热线") || channel.includes("转录")) return <Phone {...props} />;
  if (channel.includes("车辆")) return <Broadcast {...props} />;
  if (channel.includes("工单")) return <Package {...props} />;
  return <FileText {...props} />;
}

function BoundaryPill({ children, tone = "safe" }: { children: ReactNode; tone?: "safe" | "warn" }) {
  return (
    <span className={`workbench-boundary-pill ${tone}`}>
      {tone === "safe" ? <ShieldCheck size={16} weight="fill" aria-hidden="true" /> : <WarningCircle size={16} weight="fill" aria-hidden="true" />}
      {children}
    </span>
  );
}

function WorkbenchActionStatus({
  guidance,
  feedback,
  recentEvents,
}: {
  guidance: ActionGuidance;
  feedback: ActionFeedback;
  recentEvents: ActionEvent[];
}) {
  return (
    <section className="workbench-action-deck" aria-label="工作台操作状态">
      <article className="workbench-action-card guidance">
        <div className="workbench-action-label">
          <Play size={14} weight="fill" aria-hidden="true" />
          <span>当前操作指引</span>
          <code>{guidance.actionId}</code>
        </div>
        <h2>{guidance.title}</h2>
        <p>{guidance.intent}</p>
        <small>下一步：{guidance.nextStep}</small>
      </article>
      <article className={`workbench-action-card result ${feedback.tone}`} aria-live="polite" aria-atomic="true">
        <div className="workbench-action-label">
          {feedback.tone === "warning"
            ? <WarningCircle size={15} weight="fill" aria-hidden="true" />
            : <CheckCircle size={15} weight="duotone" aria-hidden="true" />}
          <span>最近操作结果</span>
          <code>{feedback.actionId}</code>
        </div>
        <h2>{feedback.title}</h2>
        <p><b>{feedback.target}</b>{feedback.result}</p>
        <small>下一步：{feedback.nextStep}</small>
        <span className="workbench-action-count">本页已记录 {recentEvents.length} 项本地操作</span>
        {recentEvents.length > 0 && (
          <ol className="workbench-action-log" aria-label="最近三项本地操作">
            {recentEvents.slice(-3).reverse().map((event) => (
              <li key={event.sequence}><span>{event.sequence}</span><b>{event.title}</b><small>{event.target}</small></li>
            ))}
          </ol>
        )}
      </article>
    </section>
  );
}

function filterConsoleRecords(records: ConsoleRecord[], query: string, filter: FilterMode) {
  const normalized = query.trim().toLocaleLowerCase("zh-CN");
  return records.filter((record) => {
    if (filter === "story" && !record.isStory) return false;
    if (filter === "attention" && !record.attention) return false;
    if (!normalized) return true;
    const sourceSearch = record.source ? Object.values(record.source).join(" ") : "";
    return [record.id, record.title, record.eyebrow, record.status, record.relation, sourceSearch]
      .join(" ")
      .toLocaleLowerCase("zh-CN")
      .includes(normalized);
  });
}

function StoryRoute({ onOpen }: { onOpen: (target: (typeof storyTargets)[number], trigger: HTMLButtonElement) => void }) {
  return (
    <section className="workbench-story" aria-labelledby="story-route-title">
      <div className="workbench-story-copy">
        <span>固定证据链</span>
        <h3 id="story-route-title">从来源走到一次改进</h3>
        <p>四个对象串起个案闭环和改进闭环。</p>
      </div>
      <ol>
        {storyTargets.map((target, index) => (
          <li key={target.id}>
            <button
              type="button"
              data-action-id={`snapshot.story.${target.view}`}
              onClick={(event) => onOpen(target, event.currentTarget)}
            >
              <span className="story-dot">{index + 1}</span>
              <span><b>{target.label}</b><small>{target.id}</small></span>
            </button>
            {index < storyTargets.length - 1 && <ArrowRight size={17} aria-hidden="true" />}
          </li>
        ))}
      </ol>
    </section>
  );
}

function FeedbackList({ records, selectedId, onSelect }: {
  records: ConsoleRecord[];
  selectedId: string;
  onSelect: (record: ConsoleRecord, trigger: HTMLButtonElement) => void;
}) {
  return (
    <div className="feedback-inbox-list" role="list" aria-label="合成反馈来源列表">
      <div className="feedback-list-head" aria-hidden="true">
        <span>来源</span><span>反馈与接收时间</span><span>授权 / 记录</span><span>关联</span>
      </div>
      {records.map((record) => record.source && (
        <button
          type="button"
          data-action-id={`snapshot.record.${record.id}`}
          role="listitem"
          key={record.id}
          className={`feedback-source-row ${selectedId === record.id ? "selected" : ""}`}
          onClick={(event) => onSelect(record, event.currentTarget)}
        >
          <span className="feedback-source-channel">
            <i><ChannelIcon channel={record.source.channel} /></i>
            <span><b>{record.source.channel}</b><small>{record.source.sourceType}</small></span>
          </span>
          <span className="feedback-source-copy">
            <b>{record.title}</b>
            <small>{record.source.receivedAt}</small>
          </span>
          <span className="feedback-source-contract">
            <b>{record.source.authorization}</b>
            <small>{record.source.sourceRecordId}</small>
          </span>
          <span className="feedback-source-relation">
            <b>{record.source.linkedCaseId}</b>
            <small>{record.status}</small>
          </span>
          <ArrowRight size={17} aria-hidden="true" />
        </button>
      ))}
    </div>
  );
}

function RecordList({ records, selectedId, onSelect }: {
  records: ConsoleRecord[];
  selectedId: string;
  onSelect: (record: ConsoleRecord, trigger: HTMLButtonElement) => void;
}) {
  return (
    <div className="workbench-record-list" role="list" aria-label="当前模块合成记录">
      {records.map((record) => (
        <button
          type="button"
          data-action-id={`snapshot.record.${record.id}`}
          role="listitem"
          key={record.id}
          className={`workbench-record ${selectedId === record.id ? "selected" : ""}`}
          onClick={(event) => onSelect(record, event.currentTarget)}
        >
          <span className="record-main">
            <span><code>{record.id}</code>{record.isStory && <i>固定故事</i>}</span>
            <b>{record.title}</b>
            <small>{record.eyebrow}</small>
          </span>
          <span className="record-relation">{record.relation}</span>
          <span className={`record-status ${record.attention ? "attention" : ""}`}>{record.status}</span>
          <ArrowRight size={17} aria-hidden="true" />
        </button>
      ))}
    </div>
  );
}

function ModuleHighlight({ view, records, onSelect }: {
  view: ViewKey;
  records: ConsoleRecord[];
  onSelect: (record: ConsoleRecord, trigger: HTMLButtonElement) => void;
}) {
  const story = records.find((record) => record.isStory) ?? records[0];
  if (!story || view === "feedback_inbox") return null;

  if (view === "case_cockpit") {
    return (
      <section className="module-highlight case-path" aria-labelledby="case-path-title">
        <div className="highlight-heading">
          <span>个案闭环</span>
          <h3 id="case-path-title">{story.id} 处置时间线</h3>
          <button type="button" data-action-id="snapshot.highlight.case" onClick={(event) => onSelect(story, event.currentTarget)}>查看案件证据 <ArrowRight size={15} aria-hidden="true" /></button>
        </div>
        <ol className="case-timeline">
          {caseTimeline.map((item, index) => (
            <li key={item.label} className={item.state}>
              <span>{item.state === "done" ? <Check size={13} weight="bold" aria-hidden="true" /> : index + 1}</span>
              <b>{item.label}</b>
              <small>{item.detail}</small>
            </li>
          ))}
        </ol>
      </section>
    );
  }

  if (view === "sla_board") {
    const attention = records.filter((record) => record.attention).slice(0, 3);
    const active = records.filter((record) => !record.attention && record.status !== "已完成").slice(0, 3);
    const complete = records.filter((record) => record.status === "已完成").slice(0, 3);
    return (
      <section className="module-highlight sla-preview" aria-labelledby="sla-preview-title">
        <div className="highlight-heading inline">
          <div><span>原时钟优先</span><h3 id="sla-preview-title">SLA 协同队列</h3></div>
          <p>改派和重试不重置原计时。</p>
        </div>
        <div className="sla-columns">
          {[
            ["需要关注", attention],
            ["进行中", active],
            ["已完成", complete],
          ].map(([label, items]) => (
            <div key={label as string}>
              <h4><span />{label as string}<small>{(items as ConsoleRecord[]).length}</small></h4>
              {(items as ConsoleRecord[]).map((item) => (
                <button type="button" data-action-id={`snapshot.highlight.sla.${item.id}`} key={item.id} onClick={(event) => onSelect(item, event.currentTarget)}>
                  <code>{item.id}</code><b>{item.title}</b><small>{item.eyebrow}</small>
                </button>
              ))}
              {(items as ConsoleRecord[]).length === 0 && <p>当前快照无此状态</p>}
            </div>
          ))}
        </div>
      </section>
    );
  }

  if (view === "problem_map") {
    return (
      <section className="module-highlight cluster-map" aria-labelledby="cluster-map-title">
        <div className="highlight-heading inline">
          <div><span>跨事件候选</span><h3 id="cluster-map-title">{story.id} 关系图</h3></div>
          <button type="button" data-action-id="snapshot.highlight.cluster" onClick={(event) => onSelect(story, event.currentTarget)}>查看假设边界 <ArrowRight size={15} aria-hidden="true" /></button>
        </div>
        <div className="cluster-canvas" aria-label="问题簇合成关系示意">
          <div className="cluster-center"><GitBranch size={22} weight="duotone" aria-hidden="true" /><b>SYN-CLUSTER-001</b><small>舱门解锁失败</small></div>
          <div className="cluster-node case-one"><b>SYN-CASE-017</b><small>本次个案</small></div>
          <div className="cluster-node case-two"><b>SYN-CASE-008</b><small>独立案件</small></div>
          <div className="cluster-node case-three"><b>SYN-CASE-014</b><small>独立案件</small></div>
          <div className="cluster-node case-four"><b>SYN-CASE-020</b><small>独立案件</small></div>
          <div className="cluster-node dimension"><b>X6 · 4.0-demo</b><small>合成特征</small></div>
        </div>
        <p className="cluster-boundary"><WarningCircle size={16} weight="fill" aria-hidden="true" />连线仅表示问题簇候选，不是已确认最终根因。</p>
      </section>
    );
  }

  return (
    <section className="module-highlight improvement-path" aria-labelledby="improvement-path-title">
      <div className="highlight-heading inline">
        <div><span>改进闭环</span><h3 id="improvement-path-title">{story.id} 观察路径</h3></div>
        <button type="button" data-action-id="snapshot.highlight.improvement" onClick={(event) => onSelect(story, event.currentTarget)}>查看指标口径 <ArrowRight size={15} aria-hidden="true" /></button>
      </div>
      <ol className="improvement-timeline">
        {improvementTimeline.map((item, index) => (
          <li key={item.label} className={item.state}>
            <span>{index + 1}</span><b>{item.label}</b><small>{item.detail}</small>
          </li>
        ))}
      </ol>
      <p className="improvement-note">无真实观察结果时，系统保持空状态，不生成绩效结论。</p>
    </section>
  );
}

function EvidenceDrawer({ record, open, onClose }: {
  record: ConsoleRecord | null;
  open: boolean;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) closeRef.current?.focus();
  }, [open]);

  if (!open || !record) return null;

  return (
    <div className="evidence-drawer-layer">
      <button className="evidence-drawer-scrim" type="button" data-action-id="snapshot.drawer.close_scrim" aria-label="关闭证据抽屉" onClick={onClose} />
      <aside className="evidence-drawer" role="dialog" aria-modal="true" aria-labelledby="evidence-drawer-title">
        <header>
          <div><span>证据检查器</span><h2 id="evidence-drawer-title">{record.id}</h2></div>
          <button ref={closeRef} type="button" data-action-id="snapshot.drawer.close" onClick={onClose} aria-label="关闭证据检查器"><X size={20} aria-hidden="true" /></button>
        </header>
        <div className="evidence-drawer-body">
          <span className={`evidence-tag evidence-${record.evidence}`}>{evidenceLabel(record.evidence)}</span>
          <h3>{record.title}</h3>
          <p className="drawer-summary">{record.summary}</p>

          {record.source && (
            <section className="drawer-source-card">
              <span>来源契约</span>
              <div><ChannelIcon channel={record.source.channel} /><b>{record.source.channel}</b></div>
              <p>{record.source.sourceSystem}</p>
              <small>以下来源值为合成显示字段，不是企业资源。</small>
            </section>
          )}

          <dl className="drawer-fields">
            {record.fields.map((field) => (
              <div key={field.label}>
                <dt>{field.label}{field.synthetic && <i>合成显示</i>}</dt>
                <dd>{field.value}</dd>
              </div>
            ))}
          </dl>

          <section className="drawer-block relation">
            <span><ArrowsClockwise size={18} aria-hidden="true" />对象关系</span>
            <p>{record.relation}</p>
          </section>
          <section className="drawer-block human">
            <span><UserCircleCheck size={18} aria-hidden="true" />人工关口</span>
            <p>{record.humanGate}</p>
          </section>
          <section className="drawer-block boundary">
            <span><ShieldCheck size={18} aria-hidden="true" />安全边界</span>
            <p>{record.safeBoundary}</p>
          </section>
          <p className="drawer-footnote">此面板是公开合成快照的解释层，不是审计日志或企业现场证据。</p>
        </div>
      </aside>
    </div>
  );
}

function SandboxStage({
  stepIndex,
  resetArmed,
  reviewAction,
  reviewReason,
  reviewError,
  activeReview,
  resubmission,
  reviewEvents,
  onAdvance,
  onApprove,
  onReviewStart,
  onReviewReasonChange,
  onReviewCancel,
  onReviewSubmit,
  onResubmit,
  onResetRequest,
  onResetCancel,
}: {
  stepIndex: number;
  resetArmed: boolean;
  reviewAction: ReviewDecision | null;
  reviewReason: string;
  reviewError: string;
  activeReview: ActiveReview | null;
  resubmission: ResubmissionState | null;
  reviewEvents: LocalReviewEvent[];
  onAdvance: () => void;
  onApprove: () => void;
  onReviewStart: (decision: ReviewDecision) => void;
  onReviewReasonChange: (reason: string) => void;
  onReviewCancel: () => void;
  onReviewSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onResubmit: () => void;
  onResetRequest: () => void;
  onResetCancel: () => void;
}) {
  const step = sandboxSteps[stepIndex];
  const progress = Math.round((stepIndex / sandboxSteps.length) * 100);
  const isComplete = stepIndex >= sandboxSteps.length;
  const activeStep = isComplete ? sandboxSteps[sandboxSteps.length - 1] : step;
  const reasonRef = useRef<HTMLTextAreaElement>(null);
  const resubmitRef = useRef<HTMLButtonElement>(null);
  const approveRef = useRef<HTMLButtonElement>(null);
  const returnCount = reviewEvents.filter((event) => event.decision === "return_for_evidence" || event.decision === "reject_candidate").length;
  const recentEvents = reviewEvents.slice(-3).reverse();

  useEffect(() => {
    if (reviewAction) reasonRef.current?.focus();
  }, [reviewAction]);

  useEffect(() => {
    if (activeReview) resubmitRef.current?.focus();
  }, [activeReview]);

  useEffect(() => {
    if (resubmission?.stepIndex === stepIndex) approveRef.current?.focus();
  }, [resubmission, stepIndex]);

  return (
    <section className="sandbox-stage" aria-labelledby="sandbox-title">
      <div className="sandbox-boundary-banner">
        <BoundaryPill>本地沙盘</BoundaryPill>
        <span>刷新即重置 · 不保存数据 · 不触发飞书或任何外部系统</span>
      </div>

      <header className="sandbox-head">
        <div>
          <span>双循环演示沙盘</span>
          <h2 id="sandbox-title">{isComplete ? "两次闭环已完成本地演示" : activeStep.label}</h2>
          <p>{isComplete ? "你刚才完成的是预定合成路径，不是真实业务运行。" : activeStep.description}</p>
        </div>
        <div className="sandbox-progress-copy"><b>{Math.min(stepIndex, sandboxSteps.length)} / {sandboxSteps.length}</b><small>演示步骤</small></div>
      </header>

      <div className="sandbox-progress" aria-label={`已完成 ${progress}%`}><span style={{ width: `${progress}%` }} /></div>

      <ol className="sandbox-stepper" aria-label="双循环沙盘步骤">
        {sandboxSteps.map((item, index) => (
          <li key={item.key} className={index < stepIndex ? "done" : index === stepIndex ? "current" : "waiting"}>
            <span>{index < stepIndex ? <Check size={12} weight="bold" aria-hidden="true" /> : index + 1}</span>
            <small>{item.shortLabel}</small>
          </li>
        ))}
      </ol>

      {!isComplete ? (
        <div className="sandbox-workspace">
          <section className="sandbox-current-card">
            <div className="sandbox-layer-row">
              <span className={`sandbox-layer layer-${activeStep.isHumanGate ? "human" : "system"}`}>{activeStep.layer}</span>
              <code>{activeStep.objectId}</code>
            </div>
            <h3>{activeStep.shortLabel}</h3>
            <p>{activeStep.description}</p>
            <div className="sandbox-evidence-box">
              <span><FileText size={17} aria-hidden="true" />当前证据</span>
              <p>{activeStep.evidence}</p>
              {resubmission?.stepIndex === stepIndex && (
                <div className="sandbox-resubmission-note">
                  <CheckCircle size={17} weight="duotone" aria-hidden="true" />
                  <span><b>补证批次 R{resubmission.iteration} 已重新提交</b><small>{resubmission.note}</small></span>
                </div>
              )}
            </div>

            {activeReview ? (
              <section className="sandbox-returned" aria-live="polite">
                <div className="sandbox-returned-head">
                  <WarningCircle size={20} weight="fill" aria-hidden="true" />
                  <span><b>{activeReview.decision === "return_for_evidence" ? "已退回补证" : "已驳回候选"}</b><small>本地审查支线 · R{activeReview.iteration}</small></span>
                </div>
                <dl>
                  <div><dt>原因</dt><dd>{activeReview.reason}</dd></div>
                  <div><dt>返回节点</dt><dd>{activeReview.returnTarget}</dd></div>
                  <div><dt>下一责任角色</dt><dd>{activeReview.nextOwnerRole}</dd></div>
                </dl>
                <button ref={resubmitRef} type="button" data-action-id={`${activeStep.actionId}.resubmit`} onClick={onResubmit}>
                  <ArrowsClockwise size={18} aria-hidden="true" />模拟补证并重新提交
                  <ArrowRight size={16} aria-hidden="true" />
                </button>
              </section>
            ) : reviewAction ? (
              <form className="sandbox-review-form" onSubmit={onReviewSubmit} noValidate>
                <div className="sandbox-review-form-head">
                  <span>{reviewAction === "return_for_evidence" ? "退回补证" : "驳回候选"}</span>
                  <button type="button" data-action-id={`${activeStep.actionId}.cancel_form`} onClick={onReviewCancel} aria-label="取消当前退回操作"><X size={17} aria-hidden="true" /></button>
                </div>
                <label htmlFor="sandbox-review-reason">退回原因 <i>必填</i></label>
                <textarea
                  ref={reasonRef}
                  id="sandbox-review-reason"
                  value={reviewReason}
                  onChange={(event) => onReviewReasonChange(event.target.value)}
                  aria-invalid={Boolean(reviewError)}
                  aria-describedby="sandbox-review-help sandbox-review-error"
                  placeholder={reviewAction === "return_for_evidence" ? "例：缺少任务时间与车辆标识的交叉证据" : "例：当前候选与原始反馈中的任务编号不一致"}
                  rows={3}
                  maxLength={120}
                />
                <div className="sandbox-review-form-meta">
                  <small id="sandbox-review-help">只记录在当前页面，不会发送通知。</small>
                  <small>{reviewReason.length} / 120</small>
                </div>
                {reviewError && <p id="sandbox-review-error" role="alert">{reviewError}</p>}
                <div className="sandbox-review-target">
                  <span>返回节点</span>
                  <b>{reviewAction === "return_for_evidence" ? activeStep.reviewContract?.returnTarget : activeStep.reviewContract?.rejectTarget}</b>
                  <small>下一责任角色：{activeStep.reviewContract?.nextOwnerRole}</small>
                </div>
                <div className="sandbox-review-form-actions">
                  <button type="submit" data-action-id={`${activeStep.actionId}.${reviewAction}.submit`}>{reviewAction === "return_for_evidence" ? "确认退回补证" : "确认驳回候选"}</button>
                  <button type="button" data-action-id={`${activeStep.actionId}.cancel_form`} onClick={onReviewCancel}>取消</button>
                </div>
              </form>
            ) : activeStep.isHumanGate ? (
              <div className="sandbox-review-actions" role="group" aria-label={`${activeStep.shortLabel}人工审查决策`}>
                <button ref={approveRef} className="approve" type="button" data-action-id={`${activeStep.actionId}.approve`} onClick={onApprove}>
                  <UserCircleCheck size={19} weight="duotone" aria-hidden="true" />确认通过<ArrowRight size={17} aria-hidden="true" />
                </button>
                <button className="return" type="button" data-action-id={`${activeStep.actionId}.return_for_evidence`} onClick={() => onReviewStart("return_for_evidence")}>
                  <ArrowsClockwise size={18} aria-hidden="true" />退回补证
                </button>
                <button className="reject" type="button" data-action-id={`${activeStep.actionId}.reject_candidate`} onClick={() => onReviewStart("reject_candidate")}>
                  <X size={17} aria-hidden="true" />驳回候选
                </button>
              </div>
            ) : (
              <button className="sandbox-primary" type="button" data-action-id={activeStep.actionId} onClick={onAdvance}>
                <Play size={18} weight="fill" aria-hidden="true" />
                {activeStep.action}
                <ArrowRight size={17} aria-hidden="true" />
              </button>
            )}
          </section>

          <aside className="sandbox-output-card">
            <span>本步预期输出</span>
            <h3>{activeStep.output}</h3>
            <dl>
              <div><dt>状态保存</dt><dd>仅 React 内存</dd></div>
              <div><dt>外部请求</dt><dd>0</dd></div>
              <div><dt>企业运行证据</dt><dd>无</dd></div>
            </dl>
            {recentEvents.length > 0 && (
              <section className="sandbox-review-log" aria-label="最近本地审查记录">
                <span>最近审查记录</span>
                <ol>
                  {recentEvents.map((event, index) => (
                    <li key={`${event.gateKey}-${event.decision}-${event.iteration}-${index}`}>
                      <b>{event.decision === "return_for_evidence" ? "退回补证" : event.decision === "reject_candidate" ? "驳回候选" : event.decision === "resubmitted" ? "补证重提" : "确认通过"}</b>
                      <small>{event.gateLabel} · R{event.iteration}</small>
                    </li>
                  ))}
                </ol>
              </section>
            )}
            <div className="sandbox-next">
              <span>下一步</span>
              <b>{sandboxSteps[stepIndex + 1]?.shortLabel ?? "本地演示结束"}</b>
            </div>
          </aside>
        </div>
      ) : (
        <div className="sandbox-complete">
          <CheckCircle size={42} weight="duotone" aria-hidden="true" />
          <div><h3>个案闭环 + 改进闭环</h3><p>SYN-CASE-017 → SYN-CLUSTER-001 → SYN-IMPROVEMENT-001</p></div>
          <ul>
            <li><Check size={14} weight="bold" aria-hidden="true" />AI 只产生候选</li>
            <li><Check size={14} weight="bold" aria-hidden="true" />硬规则优先</li>
            <li><Check size={14} weight="bold" aria-hidden="true" />4 个人工关口</li>
            <li><Check size={14} weight="bold" aria-hidden="true" />本地退回 {returnCount} 次</li>
            <li><Check size={14} weight="bold" aria-hidden="true" />观察结果保持空状态</li>
          </ul>
        </div>
      )}

      <footer className="sandbox-footer">
        {!resetArmed ? (
          <button type="button" data-action-id="sandbox.reset.request" onClick={onResetRequest}><ArrowsClockwise size={17} aria-hidden="true" />重置沙盘</button>
        ) : (
          <div className="sandbox-reset-confirm" role="group" aria-label="确认重置沙盘">
            <span>确认丢弃当前本地进度？</span>
            <button type="button" data-action-id="sandbox.reset.confirm" onClick={onResetRequest}>确认重置</button>
            <button type="button" data-action-id="sandbox.reset.cancel" onClick={onResetCancel}>取消</button>
          </div>
        )}
        <span>重置只影响当前页面的演示状态。</span>
      </footer>
    </section>
  );
}

export default function SoftwarePage() {
  const [mode, setMode] = useState<WorkbenchMode>("snapshot");
  const [activeView, setActiveView] = useState<ViewKey>("feedback_inbox");
  const [selectedId, setSelectedId] = useState("SYN-FEEDBACK-003");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterMode>("story");
  const [sandboxStep, setSandboxStep] = useState(0);
  const [resetArmed, setResetArmed] = useState(false);
  const [reviewAction, setReviewAction] = useState<ReviewDecision | null>(null);
  const [reviewReason, setReviewReason] = useState("");
  const [reviewError, setReviewError] = useState("");
  const [activeReview, setActiveReview] = useState<ActiveReview | null>(null);
  const [resubmission, setResubmission] = useState<ResubmissionState | null>(null);
  const [reviewEvents, setReviewEvents] = useState<LocalReviewEvent[]>([]);
  const [actionFeedback, setActionFeedback] = useState<ActionFeedback>({
    actionId: "snapshot.ready",
    title: "工作台已就绪",
    target: "反馈收件箱",
    result: "当前尚未执行操作；全部数据均为公开合成快照。",
    nextStep: "选择固定证据链、模块或记录",
    tone: "ready",
  });
  const [actionEvents, setActionEvents] = useState<ActionEvent[]>([]);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const actionSequenceRef = useRef(0);

  const currentView = fiveViews.find((view) => view.key === activeView) ?? fiveViews[0];
  const records = useMemo(() => buildRecords(activeView), [activeView]);
  const visibleRecords = useMemo(() => filterConsoleRecords(records, query, filter), [filter, query, records]);
  const selected = records.find((record) => record.id === selectedId) ?? records[0] ?? null;
  const currentGuidance: ActionGuidance = mode === "sandbox"
    ? sandboxStep >= sandboxSteps.length
      ? {
        actionId: "sandbox.complete",
        title: "本地双循环演示已完成",
        intent: "核对操作记录与证据边界；这些状态不代表真实业务运行。",
        nextStep: "检查记录，或使用两步确认重置沙盘",
      }
      : {
        actionId: sandboxSteps[sandboxStep].actionId,
        title: sandboxSteps[sandboxStep].shortLabel,
        intent: sandboxSteps[sandboxStep].intent,
        nextStep: sandboxSteps[sandboxStep].isHumanGate ? "选择确认通过、退回补证或驳回候选" : `点击“${sandboxSteps[sandboxStep].action}”`,
      }
    : {
      actionId: `snapshot.view.${activeView}`,
      title: `浏览${currentView.label}`,
      intent: viewDescriptions[activeView],
      nextStep: "选择固定证据链、高亮对象或列表记录",
    };

  function reportAction(feedback: ActionFeedback) {
    actionSequenceRef.current += 1;
    setActionFeedback(feedback);
    setActionEvents((events) => [...events, { ...feedback, sequence: actionSequenceRef.current }]);
  }

  function closeDrawer() {
    setDrawerOpen(false);
    reportAction({
      actionId: "snapshot.drawer.close",
      title: "证据检查器已关闭",
      target: selected?.id ?? "当前记录",
      result: "已返回只读快照，记录与筛选条件保持不变。",
      nextStep: "继续选择记录或切换模块",
      tone: "success",
    });
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && drawerOpen) {
        const feedback: ActionFeedback = {
          actionId: "snapshot.drawer.close",
          title: "证据检查器已关闭",
          target: selected?.id ?? "当前记录",
          result: "已返回只读快照，记录与筛选条件保持不变。",
          nextStep: "继续选择记录或切换模块",
          tone: "success",
        };
        setDrawerOpen(false);
        actionSequenceRef.current += 1;
        setActionFeedback(feedback);
        setActionEvents((events) => [...events, { ...feedback, sequence: actionSequenceRef.current }]);
        window.requestAnimationFrame(() => triggerRef.current?.focus());
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [drawerOpen, selected?.id]);

  function chooseView(view: ViewKey, shouldReport = true) {
    const nextRecords = buildRecords(view);
    const storyRecord = nextRecords.find((record) => record.isStory) ?? nextRecords[0];
    setActiveView(view);
    setSelectedId(storyRecord?.id ?? "");
    setQuery("");
    setFilter("story");
    setDrawerOpen(false);
    if (shouldReport) {
      const targetView = fiveViews.find((item) => item.key === view) ?? fiveViews[0];
      reportAction({
        actionId: `snapshot.view.${view}`,
        title: activeView === view ? `当前已在${targetView.label}` : `已切换到${targetView.label}`,
        target: storyRecord?.id ?? targetView.label,
        result: "搜索已清空，并定位到固定故事的合成记录。",
        nextStep: "查看高亮区或打开一条记录",
        tone: "success",
      });
    }
  }

  function openStoryTarget(target: (typeof storyTargets)[number], trigger: HTMLButtonElement) {
    const record = buildRecords(target.view).find((item) => item.id === target.id) ?? null;
    triggerRef.current = trigger;
    setActiveView(target.view);
    setSelectedId(target.id);
    setQuery("");
    setFilter("story");
    if (record) {
      setDrawerOpen(true);
      reportAction({
        actionId: `snapshot.story.${target.view}`,
        title: `已打开${target.label}证据`,
        target: target.id,
        result: "证据检查器展示对象关系、人工关口和安全边界。",
        nextStep: "核对字段后关闭抽屉，或继续选择其他对象",
        tone: "success",
      });
    } else {
      setDrawerOpen(false);
      reportAction({
        actionId: `snapshot.story.${target.view}`,
        title: "未找到目标对象",
        target: target.id,
        result: "当前公开合成快照中没有该记录，未打开空抽屉。",
        nextStep: "返回当前模块并选择可见记录",
        tone: "warning",
      });
    }
  }

  function openRecord(record: ConsoleRecord, trigger: HTMLButtonElement) {
    triggerRef.current = trigger;
    setSelectedId(record.id);
    setDrawerOpen(true);
    reportAction({
      actionId: `snapshot.record.${record.id}`,
      title: "已打开记录证据",
      target: record.id,
      result: `已展示“${record.title}”的解释层，不改变任何业务状态。`,
      nextStep: "核对证据分类、对象关系与人工关口",
      tone: "success",
    });
  }

  function switchMode(nextMode: WorkbenchMode) {
    setMode(nextMode);
    setDrawerOpen(false);
    setResetArmed(false);
    if (nextMode === "snapshot") chooseView("feedback_inbox", false);
    reportAction({
      actionId: `mode.${nextMode}`,
      title: mode === nextMode ? `当前已在${nextMode === "snapshot" ? "合成快照" : "本地沙盘"}` : `已进入${nextMode === "snapshot" ? "合成快照" : "本地沙盘"}`,
      target: nextMode === "snapshot" ? "反馈收件箱" : sandboxSteps[Math.min(sandboxStep, sandboxSteps.length - 1)].objectId,
      result: nextMode === "snapshot" ? "仅浏览冻结合成记录，不写入数据。" : "后续操作只保存在当前浏览器内存，刷新即清空。",
      nextStep: nextMode === "snapshot" ? "选择模块或记录" : sandboxStep >= sandboxSteps.length ? "核对完成记录或重置" : `执行步骤 ${sandboxStep + 1}：${sandboxSteps[sandboxStep].shortLabel}`,
      tone: "success",
    });
  }

  function clearCurrentReview() {
    setReviewAction(null);
    setReviewReason("");
    setReviewError("");
    setActiveReview(null);
    setResubmission(null);
  }

  function advanceSandbox(feedback?: Partial<ActionFeedback>) {
    const step = sandboxSteps[sandboxStep];
    if (!step) return;
    const nextStep = sandboxSteps[sandboxStep + 1];
    reportAction({
      actionId: feedback?.actionId ?? step.actionId,
      title: feedback?.title ?? `${step.shortLabel}已完成本地演示`,
      target: feedback?.target ?? step.objectId,
      result: feedback?.result ?? step.output,
      nextStep: feedback?.nextStep ?? (nextStep ? `继续步骤 ${sandboxStep + 2}：${nextStep.shortLabel}` : "核对双循环完成状态或重置沙盘"),
      tone: feedback?.tone ?? "success",
    });
    setSandboxStep((value) => Math.min(value + 1, sandboxSteps.length));
    setResetArmed(false);
    clearCurrentReview();
  }

  function approveCurrentGate() {
    const gate = sandboxSteps[sandboxStep];
    const iteration = resubmission?.stepIndex === sandboxStep ? resubmission.iteration : 0;
    setReviewEvents((events) => [...events, {
      gateKey: gate.key,
      gateLabel: gate.shortLabel,
      decision: "approved",
      reason: iteration > 0 ? `补证批次 R${iteration} 重审通过` : "直接审查通过",
      returnTarget: "下一主步骤",
      nextOwnerRole: "后续流程角色",
      iteration,
    }]);
    advanceSandbox({
      actionId: `${gate.actionId}.approve`,
      title: `${gate.shortLabel}已确认通过`,
      result: iteration > 0 ? `补证批次 R${iteration} 已在本地重审通过；${gate.output}` : gate.output,
    });
  }

  function startReview(decision: ReviewDecision) {
    const gate = sandboxSteps[sandboxStep];
    setReviewAction(decision);
    setReviewReason("");
    setReviewError("");
    reportAction({
      actionId: `${gate.actionId}.${decision}`,
      title: decision === "return_for_evidence" ? "退回补证表单已打开" : "驳回候选表单已打开",
      target: gate.objectId,
      result: "尚未提交决定；需要填写至少 4 个字的原因。",
      nextStep: "填写原因并确认，或取消返回人工关口",
      tone: "ready",
    });
  }

  function cancelReview() {
    const gate = sandboxSteps[sandboxStep];
    setReviewAction(null);
    setReviewReason("");
    setReviewError("");
    reportAction({
      actionId: `${gate.actionId}.cancel_form`,
      title: "已取消当前审查分支",
      target: gate.objectId,
      result: "没有写入退回或驳回记录，人工关口保持待决。",
      nextStep: "重新选择确认通过、退回补证或驳回候选",
      tone: "success",
    });
  }

  function submitReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const reason = reviewReason.trim();
    const gate = sandboxSteps[sandboxStep];
    const contract = gate.reviewContract;
    if (!reviewAction || !contract) return;
    if (reason.length < 4) {
      setReviewError("请填写至少 4 个字的退回原因。");
      reportAction({
        actionId: `${gate.actionId}.${reviewAction}.validation`,
        title: "原因尚未通过校验",
        target: gate.objectId,
        result: "退回或驳回原因不足 4 个字，没有写入审查记录。",
        nextStep: "补充具体原因后再次确认",
        tone: "warning",
      });
      return;
    }

    const iteration = reviewEvents.filter((item) => item.gateKey === gate.key && (item.decision === "return_for_evidence" || item.decision === "reject_candidate")).length + 1;
    const review: ActiveReview = {
      gateKey: gate.key,
      gateLabel: gate.shortLabel,
      decision: reviewAction,
      reason,
      returnTarget: reviewAction === "return_for_evidence" ? contract.returnTarget : contract.rejectTarget,
      nextOwnerRole: contract.nextOwnerRole,
      iteration,
    };
    setActiveReview(review);
    setReviewEvents((events) => [...events, review]);
    setReviewAction(null);
    setReviewReason("");
    setReviewError("");
    setResubmission(null);
    reportAction({
      actionId: `${gate.actionId}.${review.decision}.submit`,
      title: review.decision === "return_for_evidence" ? "已退回补证（本地演示）" : "已驳回候选（本地演示）",
      target: gate.objectId,
      result: `返回“${review.returnTarget}”，下一责任角色为${review.nextOwnerRole}；未发送外部通知。`,
      nextStep: "模拟补证并重新提交",
      tone: "warning",
    });
  }

  function resubmitReview() {
    if (!activeReview) return;
    const event: LocalReviewEvent = {
      ...activeReview,
      decision: "resubmitted",
      reason: `合成补证批次 R${activeReview.iteration} 已准备重审`,
    };
    setReviewEvents((events) => [...events, event]);
    setResubmission({
      stepIndex: sandboxStep,
      iteration: activeReview.iteration,
      note: `${activeReview.nextOwnerRole}已针对“${activeReview.returnTarget}”补充合成证据。`,
    });
    setActiveReview(null);
    reportAction({
      actionId: `${sandboxSteps[sandboxStep].actionId}.resubmit`,
      title: `补证批次 R${activeReview.iteration} 已重新提交`,
      target: sandboxSteps[sandboxStep].objectId,
      result: `${activeReview.nextOwnerRole}已补充合成证据，当前人工关口恢复待决。`,
      nextStep: "重新选择确认通过、退回补证或驳回候选",
      tone: "success",
    });
  }

  function handleReset() {
    if (!resetArmed) {
      setResetArmed(true);
      reportAction({
        actionId: "sandbox.reset.request",
        title: "重置尚未执行",
        target: `当前进度 ${Math.min(sandboxStep, sandboxSteps.length)} / ${sandboxSteps.length}`,
        result: "已进入确认状态；当前步骤和操作记录仍然保留。",
        nextStep: "确认重置，或取消并继续当前进度",
        tone: "warning",
      });
      return;
    }
    setSandboxStep(0);
    setResetArmed(false);
    clearCurrentReview();
    setReviewEvents([]);
    setActionEvents([]);
    actionSequenceRef.current = 0;
    reportAction({
      actionId: "sandbox.reset.confirm",
      title: "沙盘已重置",
      target: sandboxSteps[0].objectId,
      result: "步骤、审查支线和此前操作记录已清空；仅保留本次重置记录。",
      nextStep: `重新执行步骤 1：${sandboxSteps[0].shortLabel}`,
      tone: "success",
    });
  }

  function cancelReset() {
    setResetArmed(false);
    reportAction({
      actionId: "sandbox.reset.cancel",
      title: "已取消重置",
      target: `当前进度 ${Math.min(sandboxStep, sandboxSteps.length)} / ${sandboxSteps.length}`,
      result: "当前步骤、审查支线和操作记录均已保留。",
      nextStep: sandboxStep >= sandboxSteps.length ? "核对完成记录" : `继续${sandboxSteps[sandboxStep].shortLabel}`,
      tone: "success",
    });
  }

  function handleQueryChange(nextQuery: string) {
    setQuery(nextQuery);
    const count = filterConsoleRecords(records, nextQuery, filter).length;
    reportAction({
      actionId: "snapshot.search.change",
      title: nextQuery ? "搜索条件已应用" : "搜索条件已清除",
      target: currentView.label,
      result: `当前显示 ${count} / ${records.length} 条合成记录。`,
      nextStep: count > 0 ? "打开一条结果或继续调整筛选" : "清除条件或重置视图",
      tone: count > 0 ? "success" : "warning",
    });
  }

  function handleFilterChange(nextFilter: FilterMode) {
    setFilter(nextFilter);
    const count = filterConsoleRecords(records, query, nextFilter).length;
    const label = nextFilter === "story" ? "固定故事" : nextFilter === "attention" ? "需要关注" : "全部记录";
    reportAction({
      actionId: `snapshot.filter.${nextFilter}`,
      title: `筛选已切换为“${label}”`,
      target: currentView.label,
      result: `当前显示 ${count} / ${records.length} 条合成记录。`,
      nextStep: count > 0 ? "打开一条结果或继续搜索" : "清除条件或重置视图",
      tone: count > 0 ? "success" : "warning",
    });
  }

  function resetSnapshotView() {
    setQuery("");
    setFilter("story");
    const storyCount = records.filter((record) => record.isStory).length;
    reportAction({
      actionId: "snapshot.view.reset",
      title: "当前视图已重置",
      target: currentView.label,
      result: `搜索已清除，固定故事筛选恢复，共显示 ${storyCount} 条记录。`,
      nextStep: "打开固定故事记录",
      tone: "success",
    });
  }

  return (
    <main className="workbench-shell">
      <header className="workbench-topbar">
        <Link className="workbench-brand" href="/" data-action-id="navigate.home.brand" aria-label="返回石听 NeoLoop 展示首页">
          <span className="brand-mark">石听</span>
          <span><b>NeoLoop</b><small>反馈闭环运营台</small></span>
        </Link>

        <div className="workbench-mode-switch" role="group" aria-label="工作台模式">
          <button type="button" data-action-id="mode.snapshot" className={mode === "snapshot" ? "active" : ""} aria-pressed={mode === "snapshot"} onClick={() => switchMode("snapshot")}>
            <Database size={17} aria-hidden="true" />合成快照
          </button>
          <button type="button" data-action-id="mode.sandbox" className={mode === "sandbox" ? "active" : ""} aria-pressed={mode === "sandbox"} onClick={() => switchMode("sandbox")}>
            <Play size={16} weight="fill" aria-hidden="true" />本地沙盘
          </button>
        </div>

        <div className="workbench-top-status">
          <BoundaryPill tone={mode === "snapshot" ? "safe" : "warn"}>{mode === "snapshot" ? "合成只读" : "刷新即重置"}</BoundaryPill>
          <span>未连接企业系统</span>
        </div>

        <Link className="workbench-back" href="/" data-action-id="navigate.home.back"><ArrowLeft size={16} aria-hidden="true" />返回展示页</Link>
      </header>

      <div className="workbench-layout">
        <aside className="workbench-sidebar" aria-label="工作台导航">
          <div className="workbench-sidebar-title">
            <span>{mode === "snapshot" ? "证据快照" : "演示沙盘"}</span>
            <h1>{mode === "snapshot" ? "运营视图" : "双循环路径"}</h1>
            <p>{mode === "snapshot" ? "浏览冻结合成记录和它们的证据边界。" : "每步只修改当前页面的内存状态。"}</p>
          </div>

          {mode === "snapshot" ? (
            <nav className="workbench-nav" aria-label="五个业务模块">
              {fiveViews.map((view) => (
                <button
                  type="button"
                  data-action-id={`snapshot.view.${view.key}`}
                  key={view.key}
                  className={activeView === view.key ? "active" : ""}
                  aria-current={activeView === view.key ? "page" : undefined}
                  onClick={() => chooseView(view.key)}
                >
                  <ViewIcon view={view.key} />
                  <span><b>{view.label}</b><small>{view.count} 条合成记录</small></span>
                  <ArrowRight size={15} aria-hidden="true" />
                </button>
              ))}
            </nav>
          ) : (
            <ol className="sidebar-sandbox-steps">
              {sandboxSteps.map((step, index) => (
                <li key={step.key} className={index < sandboxStep ? "done" : index === sandboxStep ? "current" : "waiting"}>
                  <span>{index < sandboxStep ? <Check size={12} weight="bold" aria-hidden="true" /> : index + 1}</span>
                  <div><b>{step.shortLabel}</b><small>{step.layer}</small></div>
                </li>
              ))}
            </ol>
          )}

          <div className="workbench-sidebar-note">
            <ShieldCheck size={19} weight="duotone" aria-hidden="true" />
            <div><b>证据边界</b><p>不写真实数据，不控制车辆，AI 不自动判责或确认最终根因。</p></div>
          </div>
        </aside>

        <section className="workbench-main">
          <WorkbenchActionStatus guidance={currentGuidance} feedback={actionFeedback} recentEvents={actionEvents} />
          {mode === "sandbox" ? (
            <SandboxStage
              stepIndex={sandboxStep}
              resetArmed={resetArmed}
              reviewAction={reviewAction}
              reviewReason={reviewReason}
              reviewError={reviewError}
              activeReview={activeReview}
              resubmission={resubmission}
              reviewEvents={reviewEvents}
              onAdvance={() => advanceSandbox()}
              onApprove={approveCurrentGate}
              onReviewStart={startReview}
              onReviewReasonChange={(reason) => { setReviewReason(reason); if (reviewError) setReviewError(""); }}
              onReviewCancel={cancelReview}
              onReviewSubmit={submitReview}
              onResubmit={resubmitReview}
              onResetRequest={handleReset}
              onResetCancel={cancelReset}
            />
          ) : (
            <>
              <header className="workbench-main-head">
                <div>
                  <span className="workbench-kicker">运营快照 · {currentView.count} 条合成记录</span>
                  <h2>{currentView.label}</h2>
                  <p>{viewDescriptions[activeView]}</p>
                </div>
                <dl className="workbench-summary">
                  <div><dt>公开快照</dt><dd>{snapshotMeta.snapshotVersion}</dd></div>
                  <div><dt>运行结果</dt><dd>0 <small>未伪造</small></dd></div>
                </dl>
              </header>

              <StoryRoute onOpen={openStoryTarget} />
              <ModuleHighlight view={activeView} records={records} onSelect={openRecord} />

              <div className="workbench-toolbar">
                <label className="workbench-search">
                  <MagnifyingGlass size={18} aria-hidden="true" />
                  <span className="sr-only">搜索当前模块</span>
                  <input data-action-id="snapshot.search.change" value={query} onChange={(event) => handleQueryChange(event.target.value)} placeholder={activeView === "feedback_inbox" ? "搜索渠道、来源系统、ID 或案件" : "搜索 ID、标题、关系或状态"} />
                </label>
                <label className="workbench-filter">
                  <Funnel size={17} aria-hidden="true" />
                  <span className="sr-only">筛选当前模块</span>
                  <select data-action-id="snapshot.filter.change" value={filter} onChange={(event) => handleFilterChange(event.target.value as FilterMode)}>
                    <option value="story">固定故事</option>
                    <option value="attention">需要关注</option>
                    <option value="all">全部记录</option>
                  </select>
                </label>
                <span className="workbench-result-count" aria-live="polite">显示 {visibleRecords.length} / {records.length}</span>
              </div>

              {visibleRecords.length > 0 ? (
                activeView === "feedback_inbox"
                  ? <FeedbackList records={visibleRecords} selectedId={selectedId} onSelect={openRecord} />
                  : <RecordList records={visibleRecords} selectedId={selectedId} onSelect={openRecord} />
              ) : (
                <div className="workbench-empty" role="status">
                  <Database size={32} weight="duotone" aria-hidden="true" />
                  <h3>没有匹配的合成记录</h3>
                  <p>清除搜索和筛选即可恢复当前模块。</p>
                  <button type="button" data-action-id="snapshot.view.reset" onClick={resetSnapshotView}>重置视图</button>
                </div>
              )}
            </>
          )}
        </section>
      </div>

      <EvidenceDrawer record={selected} open={drawerOpen && mode === "snapshot"} onClose={closeDrawer} />
    </main>
  );
}
