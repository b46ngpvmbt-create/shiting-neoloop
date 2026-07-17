import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
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

test("server-renders the NeoLoop public demo", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /石听 NeoLoop/);
  assert.match(html, /让每条反馈都找到/);
  assert.match(html, /一辆车、一个任务、一个责任人和一次改进。/);
  assert.match(html, /全部业务数据均为合成样例/);
  assert.doesNotMatch(html, /react-loading-skeleton/);
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
