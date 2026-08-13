import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "../..");
const publicRoot = resolve(repositoryRoot, "data/canonical/public");
const outputPath = resolve(repositoryRoot, "docs/competition/visual-appendix.html");

function readJson(relativePath) {
  return JSON.parse(readFileSync(resolve(publicRoot, relativePath), "utf8"));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const declarations = readJson("declarations.json");
const manifestBytes = readFileSync(resolve(publicRoot, "manifest.json"));
const manifest = JSON.parse(manifestBytes.toString("utf8"));
const mainStory = readJson("main-story.json");
const failureDrills = readJson("failure-drills.json");
const cases = readJson("cases.json");
const workOrders = readJson("work-orders.json");
const clusters = readJson("clusters.json");
const improvements = readJson("improvements.json");
const views = [
  readJson("views/feedback-inbox.json"),
  readJson("views/case-cockpit.json"),
  readJson("views/sla-board.json"),
  readJson("views/problem-map.json"),
  readJson("views/improvement-tracker.json"),
];
const integrationRecord = readFileSync(
  resolve(repositoryRoot, "docs/superpowers/records/2026-08-01-round-3-integration.md"),
  "utf8",
);
const r4CoreRecord = readFileSync(
  resolve(repositoryRoot, "src/neoloop/records/2026-08-01-t3-r4-n7-w5.md"),
  "utf8",
);

const manifestSha256 = createHash("sha256").update(manifestBytes).digest("hex");
const manifestShaFromRecord = integrationRecord.match(/public manifest SHA-256：`([a-f0-9]{64})`/)?.[1];

assert(manifest.snapshot_version === declarations.snapshot_version, "snapshot version mismatch");
assert(manifest.schema_version === declarations.schema_version, "schema version mismatch");
assert(manifest.fixture_version === declarations.fixture_version, "fixture version mismatch");
assert(manifestSha256 === manifestShaFromRecord, "public manifest hash mismatch");
assert(mainStory.record_count === 1, "main story count must be 1");
assert(mainStory.records.every((record) => record.execution_status === "not_run"), "main story must remain not_run");
assert(failureDrills.record_count === 4, "failure drill count must be 4");
assert(failureDrills.records.every((record) => record.execution_status === "not_run"), "all failure drills must remain not_run");
assert(views.length === 5 && views.every((view) => view.read_only === true), "five read-only views required");
assert(Object.values(declarations.claims).every((value) => value === false), "public claims must remain false");
assert(integrationRecord.includes("23/23"), "23/23 data evidence missing");
assert(r4CoreRecord.includes("N7、W5"), "R4 N7/W5 evidence record missing");
assert(r4CoreRecord.includes("单案集成证据"), "R4 single-case evidence record missing");
assert(integrationRecord.includes("213/213"), "213/213 offline Feishu evidence missing");

const story = mainStory.records[0];
const fileCount = manifest.outputs.length + 1;
const snapshotStats = [
  { value: views[0].record_count, label: "反馈索引" },
  { value: cases.record_count, label: "案件" },
  { value: workOrders.record_count, label: "工单" },
  { value: clusters.record_count, label: "问题簇" },
  { value: improvements.record_count, label: "改进项目" },
];

const tables = [
  "原始反馈",
  "反馈案件",
  "处置工单",
  "问题簇",
  "改进项目",
  "车辆档案",
  "配送任务",
  "站点责任矩阵",
  "知识索引",
  "AI 审计",
];

const nodes = [
  ["N1", "结构化抽取"],
  ["N2", "业务分类"],
  ["N3", "风险建议"],
  ["N4", "实体关联"],
  ["N5", "重复与聚类"],
  ["N6", "根因与路由"],
  ["N7", "回复与知识草稿"],
];

const workflows = [
  ["W1", "接入幂等"],
  ["W2", "风险分诊"],
  ["W3", "关联派单"],
  ["W4", "SLA 协同"],
  ["W5", "验证与回访"],
  ["W6", "同事件检查 / 跨事件聚类与观察"],
];

const failureTitles = {
  same_key_retry_and_different_key_similar: "幂等边界",
  missing_vehicle_and_task_ids: "实体 ID 缺失",
  invalid_ai_schema_retry_once_then_human: "AI 结构错误",
  sla_timeout_escalation_preserves_clock: "SLA 超时",
};

const failureForbidden = {
  same_key_retry_and_different_key_similar: "禁止覆盖旧记录、按文本哈希吞反馈、自动并案",
  missing_vehicle_and_task_ids: "禁止编造车辆或任务 ID，禁止无证据确认正式实体",
  invalid_ai_schema_retry_once_then_human: "禁止跨版本重试、重试超过一次或失败后继续链路",
  sla_timeout_escalation_preserves_clock: "禁止重置 SLA、隐藏超时或在升级失败后推进状态",
};

const viewDescriptions = {
  feedback_inbox: ["新反馈与缺失项", "重复候选", "分诊状态"],
  case_cockpit: ["案件关系", "工单与反馈", "人工关口摘要"],
  sla_board: ["责任与到期时间", "提醒与升级", "原时钟留存"],
  problem_map: ["问题簇成员", "站点与车型", "根因仅为假设"],
  improvement_tracker: ["改进版本", "观察窗与时钟", "人工结论"],
};

function evidencePill(kind, label) {
  return `<span class="evidence-pill evidence-${kind}">${escapeHtml(label)}</span>`;
}

function statusPill(kind, label) {
  return `<span class="status-pill status-${kind}">${escapeHtml(label)}</span>`;
}

function pageHeader(index, title, subtitle) {
  return `
    <header class="page-header">
      <div>
        <p class="kicker">石听 NeoLoop | 视觉附录</p>
        <h2 class="page-title">${escapeHtml(title)}</h2>
        <p class="page-subtitle">${escapeHtml(subtitle)}</p>
      </div>
      <div class="header-index">${String(index).padStart(2, "0")}</div>
    </header>`;
}

function pageFooter(index, label) {
  return `
    <footer class="page-footer">
      <div class="footer-left"><span class="footer-rule"></span><span>${escapeHtml(label)}</span></div>
      <span class="page-number">${String(index).padStart(2, "0")} / 10</span>
    </footer>`;
}

const tableCards = tables
  .map((table, index) => `<div class="table-chip"><strong>T${String(index + 1).padStart(2, "0")}</strong><span>${escapeHtml(table)}</span></div>`)
  .join("");

const nodeCards = nodes
  .map(([code, label]) => `<div class="node-chip"><strong>${code}</strong><span>${escapeHtml(label)}</span></div>`)
  .join("");

const workflowRows = workflows
  .map(([code, label]) => `<div class="workflow-row"><strong>${code}</strong><span>${escapeHtml(label)}</span></div>`)
  .join("");

const storySteps = story.planned_workflow_path
  .map(
    (step) => `
      <div class="story-step">
        <strong>${escapeHtml(step.workflow)}${step.mode ? ` · ${escapeHtml(step.mode === "same_event_duplicate" ? "同事件" : "跨事件")}` : ""}</strong>
        <span>${escapeHtml(step.expectation)}</span>
      </div>`,
  )
  .join("");

const failureCards = failureDrills.records
  .map(
    (drill) => `
      <article class="failure-card">
        <div class="failure-head">
          <h3>${escapeHtml(failureTitles[drill.category_key])}</h3>
          ${statusPill("not-run", drill.execution_status)}
        </div>
        <div class="failure-flow">
          <div class="failure-box"><strong>注入</strong><br>${escapeHtml(drill.fault_summary)}</div>
          <div class="failure-arrow">→</div>
          <div class="failure-box safe"><strong>预期安全停点</strong><br>${escapeHtml(drill.expected_safe_path)}</div>
        </div>
        <div class="forbidden-line">${escapeHtml(failureForbidden[drill.category_key])}</div>
      </article>`,
  )
  .join("");

const viewCards = views
  .map(
    (view) => `
      <article class="view-card">
        <h3>${escapeHtml(view.label)}</h3>
        <span class="view-count">${view.record_count} 条只读记录</span>
        <div class="mini-ui" aria-hidden="true">
          <div class="mini-row"></div><div class="mini-row"></div><div class="mini-row"></div><div class="mini-row"></div>
        </div>
        <ul class="view-list">${viewDescriptions[view.view_key].map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
      </article>`,
  )
  .join("");

const html = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light">
  <title>${escapeHtml(declarations.product_name)} | 视觉附录</title>
  <link rel="icon" href="data:,">
  <link rel="stylesheet" href="visual-appendix.css">
</head>
<body>
  <section class="page page-cover" data-page="1" data-page-title="封面与事实边界">
    <div class="cover-grid">
      <div class="cover-copy">
        <div class="cover-brand">40 强赛 · 新石器企业命题 · 石听未来</div>
        <p class="kicker">无人配送客户之声闭环方案</p>
        <h1 class="cover-title">${escapeHtml(declarations.product_name)}</h1>
        <p class="cover-value">${escapeHtml(declarations.value_statement)}</p>
        <div class="cover-meta">
          ${evidencePill("public", "公开事实")}
          ${evidencePill("pending", "待企业验证")}
          ${evidencePill("design", "方案设计")}
          ${evidencePill("synthetic", "合成实验")}
        </div>
      </div>
      <div class="cover-visual">
        <img class="cover-hero" src="../../public/visuals/neoloop-concept-hero-v1.png" alt="无人配送反馈闭环方案场景插画">
        <div class="cover-illustration-note">方案场景插画｜非真实车型或运行现场</div>
        <div class="cover-stats">
          <div class="cover-stat"><strong>${fileCount}</strong><span>public 文件</span></div>
          <div class="cover-stat"><strong>5</strong><span>只读视图</span></div>
          <div class="cover-stat"><strong>1 + 4</strong><span>主故事与故障</span></div>
          <div class="cover-stat"><strong>not_run</strong><span>公开执行状态</span></div>
        </div>
      </div>
    </div>
    ${pageFooter(1, `public snapshot ${declarations.snapshot_version} | 全部业务数据为合成样例`)}
  </section>

  <section class="page" data-page="2" data-page-title="命题切入与 Before After">
    ${pageHeader(2, "从反馈进入企业后的协同环节切入", "公开资料只说明相关入口和能力公开存在，企业内部现状留待现场验证。")}
    <div class="fact-grid">
      <article class="card card-pad fact-card">
        <div class="panel-label"><h3>公开资料能支持什么</h3>${evidencePill("public", "公开事实")}</div>
        <div class="compact-columns">
          <div class="compact-point"><span class="point-index">01</span><div><strong>准时达公开版本记录</strong><div class="small muted">车辆事件、故障与运维工单、任务、服务质量评价；NeoClaw 版本说明出现车队管理、日常运营和智能客服。</div></div></div>
          <div class="compact-point"><span class="point-index">02</span><div><strong>经开区政府报道</strong><div class="small muted">查车、发车、批量车辆控制、充电调度、数据查询和经营分析；物理控制需要身份、权限和车辆唯一性校验。</div></div></div>
        </div>
      </article>
      <article class="card card-pad pending-card">
        <div class="panel-label"><h3>现场必须回答什么</h3>${evidencePill("pending", "待企业验证")}</div>
        <div class="compact-columns">
          <div class="compact-point"><span class="point-index">A</span><div class="small">入口是否共用案件编号与原文规则</div></div>
          <div class="compact-point"><span class="point-index">B</span><div class="small">哪些车辆、任务、站点字段可合法读取</div></div>
          <div class="compact-point"><span class="point-index">C</span><div class="small">责任矩阵、SLA 与升级路径如何定义</div></div>
          <div class="compact-point"><span class="point-index">D</span><div class="small">结案后是否进入问题簇与复发观察</div></div>
        </div>
      </article>
    </div>
    <div class="before-after">
      <div class="ba-row"><div class="ba-cell ba-before"><strong>Before · 待核验</strong><br>反馈入口是否共用统一案件编号和原文留存规则</div><div class="ba-arrow">→</div><div class="ba-cell ba-after"><strong>After · 方案目标</strong><br>原文、来源、授权范围和幂等键先留存，再进入案件</div></div>
      <div class="ba-row"><div class="ba-cell ba-before">车辆、任务、站点与反馈之间是否有稳定关联字段</div><div class="ba-arrow">→</div><div class="ba-cell ba-after">N4 只给候选、逐项证据和缺失项，由授权人员确认正式关系</div></div>
      <div class="ba-row"><div class="ba-cell ba-before">多团队是否已有责任矩阵、SLA 与升级记录</div><div class="ba-arrow">→</div><div class="ba-cell ba-after">N6 给责任候选，W3 与 W4 在人工确认后创建工单并保留原 SLA 起点</div></div>
      <div class="ba-row"><div class="ba-cell ba-before">案件关闭后是否进入长期问题分析</div><div class="ba-arrow">→</div><div class="ba-cell ba-after">不同事件进入问题簇候选，经人审核后建立改进项目并注明观察时钟</div></div>
    </div>
    ${pageFooter(2, "公开事实不推断企业内部架构 | Before 均为现场核验问题")}
  </section>

  <section class="page" data-page="3" data-page-title="双闭环总览">
    ${pageHeader(3, "两条循环，共用一条证据链", "六类授权渠道进入个案闭环，关闭后进入改进观察；复发时返回处置与改进。")}
    <div class="channel-ribbon">
      <div><strong>App 评价</strong><span>官方接口 / Webhook</span></div>
      <div><strong>客服记录</strong><span>客服系统事件</span></div>
      <div><strong>热线转写</strong><span>经授权语音转写</span></div>
      <div><strong>服务邮件</strong><span>授权邮箱接入</span></div>
      <div class="channel-active"><strong>飞书</strong><span>群 / 表单 / 机器人</span></div>
      <div><strong>经授权公开平台</strong><span>仅使用授权 API</span></div>
    </div>
    <div class="intake-contract"><span>不可变原始反馈池</span><strong>SYN-RUNTIME-FEEDBACK-017-MAIN</strong><em>来源 · 授权范围 · 接收时间 · 幂等键</em></div>
    <div class="loop-layout">
      <article class="card loop-panel single">
        <div class="loop-title"><h3>个案闭环 · 解决一次反馈</h3>${evidencePill("design", "方案设计")}</div>
        <div class="step-stack">
          <div class="step-row"><span class="step-code">01</span><span>接入幂等 · W1</span><span class="step-gate">原文不可覆盖</span></div>
          <div class="step-row"><span class="step-code">02</span><span>AI 分诊 · W2 / N1-N3</span><span class="step-gate">硬规则优先</span></div>
          <div class="step-row"><span class="step-code">03</span><span>实体关联 · W3 / N4</span><span class="step-gate">候选需证据</span></div>
          <div class="step-row"><span class="step-code">04</span><span>人工确认 · 实体 / 责任</span><span class="step-gate">两个独立关口</span></div>
          <div class="step-row"><span class="step-code">05</span><span>工单与 SLA · W4</span><span class="step-gate">原时钟保留</span></div>
          <div class="step-row"><span class="step-code">06</span><span>回访关闭 · W5 / N7</span><span class="step-gate">人审发布和结案</span></div>
        </div>
      </article>
      <div class="loop-bridge"><strong>→</strong><span>关闭后进入观察</span></div>
      <article class="card loop-panel improve">
        <div class="loop-title"><h3>改进闭环 · 减少同类问题复发</h3>${evidencePill("design", "方案设计")}</div>
        <div class="step-stack improve">
          <div class="step-row"><span class="step-code">01</span><span>跨事件聚类 · W6 / N5</span><span class="step-gate">不同事件不并案</span></div>
          <div class="step-row"><span class="step-code">02</span><span>根因假设 · N6</span><span class="step-gate">证据 + 反证</span></div>
          <div class="step-row"><span class="step-code">03</span><span>人工立项 · H1</span><span class="step-gate">不确认最终根因</span></div>
          <div class="step-row"><span class="step-code">04</span><span>7/30 天观察 · T7 / T30</span><span class="step-gate">标注时钟来源</span></div>
          <div class="step-row"><span class="step-code">05</span><span>归档或复发重开 · W6</span><span class="step-gate">不覆盖旧记录</span></div>
        </div>
        <div class="recurrence-note">↺ 复发时返回处置与改进；没有同期任务量分母时只报告复发案件数。</div>
      </article>
    </div>
    <div class="fixed-story-chain"><span>固定合成故事链</span><strong>SYN-CASE-017</strong><b>→</b><strong>SYN-CLUSTER-001</strong><b>→</b><strong>SYN-IMPROVEMENT-001</strong></div>
    ${pageFooter(3, "AI 候选 · 确定性工作流 · 硬规则 · 人工关口 · 证据状态")}
  </section>

  <section class="page" data-page="4" data-page-title="10 表 7 节点 6 工作流架构">
    ${pageHeader(4, "一个 Base，承载数据、AI 与确定性流程", "三个 Agent 只是业务编排视角，不是三个独立服务；赛事平台配置仍待现场验收。")}
    <div class="architecture-topline">
      <div class="arch-stage">1 个 Base</div>
      <div class="arch-stage">10 张关联表</div>
      <div class="arch-stage">3 个逻辑角色</div>
      <div class="arch-stage">7 个 AI 节点</div>
      <div class="arch-stage">6 条工作流</div>
      <div class="arch-stage">5 个前台视图</div>
    </div>
    <div class="architecture-body">
      <article class="card base-panel">
        <div class="panel-label"><h3>单 Base 数据模型</h3>${evidencePill("design", "方案设计")}</div>
        <div class="table-grid">${tableCards}</div>
        <div class="architecture-note">每张表只承担一种主要职责。公开演示只读取脱敏 public 快照，不连接赛事 Base。</div>
      </article>
      <article class="card logic-panel">
        <div class="panel-label"><h3>逻辑编排</h3>${evidencePill("design", "方案设计")}</div>
        <div class="role-strip"><div class="role-chip">反馈理解</div><div class="role-chip">案件协同</div><div class="role-chip">改进洞察</div></div>
        <div class="node-grid">${nodeCards}</div>
        <div class="workflow-chain">${workflowRows}</div>
      </article>
    </div>
    ${pageFooter(4, "AI 只产出候选、证据和草稿 | 工作流只执行满足条件的确定性动作")}
  </section>

  <section class="page" data-page="5" data-page-title="SYN-CASE-017 预期路径">
    ${pageHeader(5, "SYN-CASE-017：七步预期路径", "公开快照仍为 not_run；R4 另有本地 scripted fake 单案证据，两者不混写。")}
    <div class="story-quote">
      <span class="case-id">${escapeHtml(story.source_case_id)}</span>
      <blockquote>“${escapeHtml(story.replay_input.original_text.replace(/^合成场景：/, ""))}”</blockquote>
      ${statusPill("not-run", story.execution_status)}
    </div>
    <div class="story-timeline">${storySteps}</div>
    <div class="gate-grid">
      <div class="gate-card"><strong>人工关口 01</strong><span>正式实体与责任候选分别确认</span></div>
      <div class="gate-card"><strong>人工关口 02</strong><span>处置证据、对外回复与结案</span></div>
      <div class="gate-card"><strong>人工关口 03</strong><span>问题簇审核与最终根因判断</span></div>
      <div class="gate-card"><strong>人工关口 04</strong><span>知识发布、改进归档或复发重开</span></div>
    </div>
    <div class="clock-strip">
      ${evidencePill("synthetic", "合成实验")}
      <span>本地单案：W1-W5 + W6 同事件检查 / scripted in-memory / 130/130</span>
      <span>主链时钟：${escapeHtml(story.clock.source)} / ${escapeHtml(story.clock.timezone)} / ${escapeHtml(story.clock.advancement)}</span>
      <span>W6 跨事件观察：${escapeHtml(story.observation_clock.source)} / 7 天与 30 天 / ${escapeHtml(story.observation_clock.execution_status)}</span>
    </div>
    ${pageFooter(5, `fixture ${declarations.fixture_version} | runtime_evidence_available = false`)}
  </section>

  <section class="page" data-page="6" data-page-title="四类故障安全停点">
    ${pageHeader(6, "四类故障，四个明确停点", "故障定义已经冻结，公开状态全部为 not_run；本页不展示假运行截图。")}
    <div class="failure-grid">${failureCards}</div>
    ${pageFooter(6, "失败时保留原状态、原时钟、错误分类与人工接管信息")}
  </section>

  <section class="page" data-page="7" data-page-title="五视图与公开快照">
    ${pageHeader(7, "五个前台视图，共用一份只读快照", "记录数量用于固定回归输入，不代表企业业务量、故障频率或经营成效。")}
    <div class="snapshot-strip">
      ${snapshotStats.map((stat) => `<div class="snapshot-stat"><strong>${stat.value}</strong><span>${escapeHtml(stat.label)}</span></div>`).join("")}
    </div>
    <div class="view-grid">${viewCards}</div>
    <div class="snapshot-version">
      <span>snapshot ${escapeHtml(declarations.snapshot_version)}</span>
      <span>schema ${escapeHtml(declarations.schema_version)}</span>
      <span>fixture ${escapeHtml(declarations.fixture_version)}</span>
      <span>manifest sha256 ${manifestSha256.slice(0, 12)}...</span>
    </div>
    ${pageFooter(7, `${fileCount} 个 public 文件 | data_scope = ${declarations.data_scope}`)}
  </section>

  <section class="page" data-page="8" data-page-title="业务验证与合成对照方法">
    ${pageHeader(8, "先验证机制，再讨论企业收益", "本地测试、飞书离线结构检查和企业现场复测是三种不同证据。")}
    <div class="evidence-ladder">
      <div class="evidence-card"><strong>23/23</strong><span>canonical 与 public 数据测试。只证明数据契约、关系和脱敏快照。</span></div>
      <div class="evidence-card"><strong>130/130</strong><span>local 126/126 + cross 4/4。W5 并发边界只覆盖单进程同步原子段。</span></div>
      <div class="evidence-card"><strong>213/213</strong><span>飞书离线探针包结构检查。P01 到 P13 仍为 not_tested。</span></div>
    </div>
    <div class="experiment-layout">
      <article class="card experiment-card">
        <div class="panel-label"><h3>20 案交叉顺序实验</h3>${evidencePill("synthetic", "合成实验")}</div>
        <div class="crossover">
          <div class="sequence"><div class="sequence-box manual">A 组先人工 SOP</div><div class="sequence-box">再运行 NeoLoop</div></div>
          <div class="cross-icon">⇄</div>
          <div class="sequence"><div class="sequence-box">B 组先运行 NeoLoop</div><div class="sequence-box manual">再跑人工 SOP</div></div>
        </div>
        <ul class="clean-list small muted">
          <li>固定随机种子，减少先后顺序造成的学习影响</li>
          <li>每案保留操作者、顺序、起止时间和原始记录</li>
          <li>报告样本量、中位数、范围和错误样例</li>
        </ul>
      </article>
      <article class="card metric-card">
        <div class="panel-label"><h3>记录什么，何时能发布</h3>${evidencePill("pending", "结果待运行")}</div>
        <div class="metric-grid">
          <div class="metric-item"><strong>处理用时</strong><span>起止时间可回算</span></div>
          <div class="metric-item"><strong>人工操作次数</strong><span>逐步记录，不估算</span></div>
          <div class="metric-item"><strong>证据遗漏</strong><span>回到必填证据清单</span></div>
          <div class="metric-item"><strong>路由修改</strong><span>需要人工金标准</span></div>
          <div class="metric-item"><strong>高风险漏检</strong><span>P0/P1 单独报告</span></div>
          <div class="metric-item"><strong>错误样例</strong><span>与汇总数字一并保留</span></div>
        </div>
        <div class="empty-result"><strong>当前结果栏保持空白。</strong>没有完整原始记录前，不填效率提升、成本、收入、复发率或 ROI。</div>
      </article>
    </div>
    ${pageFooter(8, "合成流程实验只验证方案机制 | 企业真实成效需要合法数据与统一基线复测")}
  </section>

  <section class="page" data-page="9" data-page-title="推广映射">
    ${pageHeader(9, "保持数据骨架，替换行业配置", "推广性来自稳定契约、状态机和人工关口，不来自复制一套固定字段。")}
    <table class="mapping-table">
      <thead><tr><th>保持不变的结构</th><th>无人配送配置</th><th>制造售后示例</th><th>园区服务示例</th></tr></thead>
      <tbody>
        <tr><td>业务对象关系</td><td>车辆、配送任务、站点</td><td>设备、服务单、工厂或服务点</td><td>设施、巡检任务、园区区域</td></tr>
        <tr><td>责任与计时</td><td>站点责任矩阵、配送 SLA</td><td>售后团队、服务 SLA</td><td>物业团队、处置 SLA</td></tr>
        <tr><td>问题闭环</td><td>案件、工单、问题簇、改进项目</td><td>报修、服务单、缺陷簇、改进批次</td><td>上报、处置单、问题簇、整改项目</td></tr>
        <tr><td>故障方法</td><td>ID 缺失、重复反馈、节点错误、超时</td><td>设备编号缺失、重复报修、路由错误</td><td>设施编号缺失、重复上报、升级失败</td></tr>
      </tbody>
    </table>
    <div class="mapping-bottom">
      <article class="card fixed-card"><h3>保持不变</h3><p class="small muted">原文留存、案件与工单关系、问题簇与改进项目、状态守卫、人工关口、审计字段和评测方法。</p></article>
      <article class="card replace-card"><h3>按行业替换</h3><p class="small muted">渠道适配器、分类词典、实体字典、知识索引、责任矩阵、SLA、风险规则和升级路径。</p></article>
    </div>
    <div class="architecture-note">制造售后与园区服务只用于说明结构可配置，不表示已经落地或取得行业成效。</div>
    ${pageFooter(9, "推广边界：替换配置，不复制企业结论")}
  </section>

  <section class="page" data-page="10" data-page-title="交付状态与来源">
    ${pageHeader(10, "哪些已有证据，哪些仍需现场完成", "截至 2026.08.13 的自由展示候选；公开快照、飞书录屏与企业真实运行分层陈述。")}
    <div class="status-columns">
      <article class="card status-card">
        <h3>本地已有证据 ${statusPill("local", "LOCAL")}</h3>
        <ul><li>public 快照 ${escapeHtml(declarations.snapshot_version)}，manifest 哈希已复算</li><li>26 张工作表原生预览、冻结窗格、打印区域与压缩包结构复核通过</li><li>双循环与价值测算正式构建、桌面和 390px 浏览器验收通过</li><li>总演示视频 3 分 54 秒，包含飞书操作教程、Web 合成回放与证据边界</li><li>本轮文件未推送，公开站未部署新版</li></ul>
      </article>
      <article class="card status-card">
        <h3>设计与合成回放 ${statusPill("not-run", "NOT_RUN")}</h3>
        <ul><li>${escapeHtml(story.source_case_id)} 公开运行状态仍为 not_run</li><li>四类公开故障卡均为 not_run</li><li>跨事件聚类、根因假设和观察链在 Web 中按设计路径展示</li><li>20 案合成对照结果尚无可发布原始记录</li></ul>
      </article>
      <article class="card status-card">
        <h3>飞书录屏与服务器回读 ${statusPill("pending", "EVIDENCE")}</h3>
        <ul><li>录屏可见 Base 工作台、案件关联、人工确认、工单与改进观察等操作</li><li>冻结回读为 10 表、240 字段、141 条合成记录、9 条关联和 5 个视图</li><li>工作流回读为 6 条、启用 0、停用 6；录屏画面只代表录制时界面</li><li>AI 审计运行记录为 0；企业真实数据、正式收益与业务上线均未主张</li></ul>
      </article>
    </div>
    <article class="card sources-card">
      <div class="panel-label"><h3>来源与核验入口</h3><span class="small muted">公开资料核查日期：2026.08.01</span></div>
      <div class="source-grid">
        <a class="source-item" href="https://apps.apple.com/cn/app/%E6%96%B0%E7%9F%B3%E5%99%A8%E5%87%86%E6%97%B6%E8%BE%BE/id1634537493"><span class="source-index">01</span><div><strong>新石器准时达 App Store 公开版本记录</strong><span class="source-url">apps.apple.com/cn/app/id1634537493</span></div></a>
        <a class="source-item" href="https://kfqgw.beijing.gov.cn/ywdt/gdcyfzgd/zncx/202604/t20260413_4580756.html"><span class="source-index">02</span><div><strong>北京经济技术开发区政府官网 NeoClaw 报道</strong><span class="source-url">kfqgw.beijing.gov.cn/ywdt/gdcyfzgd/zncx/202604/t20260413_4580756.html</span></div></a>
        <a class="source-item" href="https://www.neolix.cn/cooperative"><span class="source-index">03</span><div><strong>新石器城市合伙人合作方案</strong><span class="source-url">neolix.cn/cooperative</span></div></a>
        <a class="source-item" href="https://www.neolix.ai/en/news/tuhu-partnership/"><span class="source-index">04</span><div><strong>新石器与途虎售后维保合作公告</strong><span class="source-url">neolix.ai/en/news/tuhu-partnership/</span></div></a>
        <div class="source-item"><span class="source-index">05</span><div><strong>冻结 public manifest</strong><span class="source-url">data/canonical/public/manifest.json · sha256 ${manifestSha256}</span></div></div>
        <div class="source-item"><span class="source-index">06</span><div><strong>R4 N7/W5 与单案内核记录</strong><span class="source-url">src/neoloop/records/2026-08-01-t3-r4-n7-w5.md</span></div></div>
        <a class="source-item" href="https://github.com/b46ngpvmbt-create"><span class="source-index">07</span><div><strong>队长 GitHub 个人主页</strong><span class="source-url">github.com/b46ngpvmbt-create</span></div></a>
      </div>
    </article>
    <div class="final-boundary"><strong>${escapeHtml(declarations.value_statement)}</strong><span>不含真实企业数据、赛事凭证或现场运行结果</span></div>
    ${pageFooter(10, "作品链接与附件仍需匿名复验；企业真实运行必须以合法数据和现场证据另行验收")}
  </section>
</body>
</html>
`;

const renderedHtml = html.replace(/[ \t]+\n/g, "\n");
const invalidUnicodeDash = /[\u2011\u2013\u2014]/u;
const placeholderTokens = ["T" + "BD", "TO" + "DO", "PLACE" + "HOLDER", "待" + "填写", "待" + "补图"];
const placeholderPattern = new RegExp(placeholderTokens.join("|"), "iu");
const externalAssetPattern = /<(?:script|img|link)[^>]+(?:src|href)=["']https?:/iu;
const absolutePathPattern = /\/Users\/|\/home\/|[A-Z]:\\/u;
const pageCount = (renderedHtml.match(/<section class="page(?: |")/g) ?? []).length;

assert(pageCount === 10, `expected 10 pages, got ${pageCount}`);
assert(!invalidUnicodeDash.test(renderedHtml), "Unicode dash found in generated HTML");
assert(!placeholderPattern.test(renderedHtml), "placeholder found in generated HTML");
assert(!externalAssetPattern.test(renderedHtml), "external asset found in generated HTML");
assert(!absolutePathPattern.test(renderedHtml), "absolute local path found in generated HTML");
assert(renderedHtml.includes(declarations.team_name), "team name missing");
assert(renderedHtml.includes(declarations.product_name), "product name missing");
assert(renderedHtml.includes(declarations.value_statement), "value statement missing");

writeFileSync(outputPath, renderedHtml, "utf8");

process.stdout.write(`${JSON.stringify({
  status: "ok",
  output: "docs/competition/visual-appendix.html",
  pages: pageCount,
  snapshot_version: declarations.snapshot_version,
  schema_version: declarations.schema_version,
  fixture_version: declarations.fixture_version,
  manifest_sha256: manifestSha256,
  main_story_status: story.execution_status,
  failure_drill_statuses: failureDrills.records.map((record) => record.execution_status),
  data_tests: "23/23",
  core_tests: "130/130",
  feishu_offline_structure: "213/213",
}, null, 2)}\n`);
