import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render(path = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(`http://localhost${path}`, {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the frozen public snapshot experience", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  const pageSource = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(html, /石听 NeoLoop/);
  assert.match(html, /让每条反馈都找到/);
  assert.match(html, /一辆车、一个任务、一个责任人和一次改进。/);
  assert.match(html, /反馈收件箱/);
  assert.match(html, /案件驾驶舱/);
  assert.match(html, /SLA 协同板/);
  assert.match(html, /问题地图/);
  assert.match(html, /改进追踪/);
  assert.match(html, /SYN-CASE-017/);
  assert.match(html, /neoloop-concept-hero-v1\.webp/);
  assert.match(html, /方案场景插画｜非真实车型或运行现场/);
  assert.match(html, /合成公开演示/);
  assert.match(html, /1\.0\.0-t1-r3-public\.1/);
  assert.match(html, /1\.0\.0-draft\.2/);
  assert.match(html, /1\.0\.0-t1-r2/);
  assert.match(html, /合成实验/);
  assert.match(html, /未连接赛事 Base/);
  assert.match(html, /未运行/);
  assert.match(html, /公开事实/);
  assert.match(html, /待企业验证/);
  assert.match(html, /方案设计/);
  assert.match(html, /DRILL-IDEMPOTENCY-001/);
  assert.match(html, /DRILL-MISSING-ENTITY-IDS-001/);
  assert.match(html, /DRILL-INVALID-AI-SCHEMA-001/);
  assert.match(html, /DRILL-SLA-TIMEOUT-001/);
  assert.match(html, /仅浏览器本地回放/);
  assert.match(html, /两条循环，共用一条证据链/);
  assert.match(html, /反馈自动汇入，而不是依赖人工逐条填写/);
  assert.match(html, /App 评价/);
  assert.match(html, /热线转写/);
  assert.match(html, /经授权公开平台/);
  assert.match(html, /个案闭环/);
  assert.match(html, /改进闭环/);
  assert.match(html, /SYN-CLUSTER-001/);
  assert.match(html, /SYN-IMPROVEMENT-001/);
  assert.match(html, /把价值假设变成可复核公式/);
  assert.match(html, /83\.3/);
  assert.match(html, /参数化测算，不是新石器真实业务成效/);
  assert.match(html, /不写数据，不控制车辆/);
  assert.match(html, /不等于获得真实权限/);
  assert.match(html, /查看全部 30 条合成记录/);
  assert.match(html, /参赛团队 \/ 联系方式/);
  assert.match(html, /刘肖蔚然/);
  assert.match(html, /闫紫豪/);
  assert.match(html, /青岛农业大学｜风景园林（虚拟现实技术设计）/);
  assert.match(html, /2718275274@qq\.com/);
  assert.match(html, /https:\/\/github\.com\/b46ngpvmbt-create/);
  assert.match(html, /https:\/\/github\.com\/b46ngpvmbt-create\/shiting-neoloop/);
  assert.match(html, /参赛成员不等于演示中的企业角色/);
  assert.match(pageSource, /public-snapshot/);
  assert.match(pageSource, /aria-controls="active-view-records"/);
  assert.match(pageSource, /scrollIntoView\(\{ block: "center" \}\)/);
  assert.match(pageSource, /key === "Escape"/);
  assert.match(pageSource, /aria-modal="true"/);
  assert.doesNotMatch(html, /DEMO-/);
  assert.doesNotMatch(html, /本系统已经上线/);
  assert.doesNotMatch(html, /本系统已接入新石器真实数据/);
  assert.doesNotMatch(html, /已获得赛事飞书权限/);
  assert.doesNotMatch(html, /四类故障均已通过/);
  assert.doesNotMatch(html, /来自真实客户的成功案例/);
  assert.doesNotMatch(html, /以下为真实运行结果/);
  assert.doesNotMatch(html, /新石器真实业务成效为/);
  assert.doesNotMatch(pageSource, /data\/demo-cases\.json/);
  assert.doesNotMatch(html, /react-loading-skeleton/);
});

test("server-renders the readonly operations console", async () => {
  const response = await render("/software");
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  const source = await readFile(new URL("../app/software/page.tsx", import.meta.url), "utf8");
  const dataSource = await readFile(new URL("../app/software/workbench-data.ts", import.meta.url), "utf8");
  assert.match(html, /运营工作台/);
  assert.match(html, /合成只读/);
  assert.match(html, /未连接企业系统/);
  assert.match(html, /反馈收件箱/);
  assert.match(html, /案件驾驶舱/);
  assert.match(html, /SLA 协同板/);
  assert.match(html, /问题地图/);
  assert.match(html, /改进追踪/);
  assert.match(html, /SYN-CASE-017/);
  assert.match(html, /SYN-CLUSTER-001/);
  assert.match(html, /SYN-IMPROVEMENT-001/);
  assert.match(html, /来源系统/);
  assert.match(html, /合成授权范围/);
  assert.match(html, /本地沙盘/);
  assert.match(source, /from "\.\.\/public-snapshot"/);
  assert.match(dataSource, /from "\.\.\/public-snapshot"/);
  assert.match(dataSource, /合成显示字段/);
  assert.match(dataSource, /接收合成反馈并校验幂等键/);
  assert.equal((dataSource.match(/actionId: "sandbox\./g) ?? []).length, 10);
  assert.equal((dataSource.match(/intent: "/g) ?? []).length, 10);
  assert.equal((dataSource.match(/reviewContract:/g) ?? []).length, 4);
  const buttonTags = source.match(/<button\b[\s\S]*?>/g) ?? [];
  assert.ok(buttonTags.length >= 20, "工作台应包含可操作按钮");
  assert.equal(buttonTags.filter((tag) => !tag.includes("data-action-id=")).length, 0, "每个工作台按钮都必须声明稳定动作 ID");
  const linkTags = source.match(/<Link\b[\s\S]*?>/g) ?? [];
  assert.equal(linkTags.filter((tag) => !tag.includes("href=") || !tag.includes("data-action-id=")).length, 0, "每个工作台链接都必须声明导航目标和动作 ID");
  assert.match(source, /当前操作指引/);
  assert.match(source, /最近操作结果/);
  assert.match(source, /aria-live="polite"/);
  assert.match(source, /本步预期输出/);
  assert.match(source, /filterConsoleRecords/);
  assert.match(source, /reportAction/);
  assert.match(source, /刷新即重置/);
  assert.match(source, /退回补证/);
  assert.match(source, /驳回候选/);
  assert.match(source, /退回原因/);
  assert.match(source, /模拟补证并重新提交/);
  assert.match(source, /role="alert"/);
  assert.match(source, /aria-modal="true"/);
  assert.match(source, /event\.key === "Escape"/);
  assert.doesNotMatch(source, /\bfetch\s*\(/);
  assert.doesNotMatch(source, /method\s*:\s*["'](?:POST|PUT|PATCH|DELETE)["']/i);
  assert.doesNotMatch(dataSource, /\bfetch\s*\(/);
  assert.doesNotMatch(source, /localStorage/);
  assert.doesNotMatch(html, /真实数据已接入/);
  assert.doesNotMatch(html, /AI 自动判责/);
  assert.doesNotMatch(html, /最终根因已确认/);
});

test("static GitHub Pages entry keeps the public-data boundary", async () => {
  const [html, dataBoundary] = await Promise.all([
    readFile(new URL("../docs/index.html", import.meta.url), "utf8"),
    readFile(new URL("../docs/DATA_BOUNDARY.md", import.meta.url), "utf8"),
  ]);

  assert.match(html, /全部业务数据均为合成样例/);
  assert.match(html, /强制人工关口/);
  assert.match(dataBoundary, /不控制车辆/);
  assert.match(dataBoundary, /不表示已获得上述权限或已进行真实数据接入/);
});
