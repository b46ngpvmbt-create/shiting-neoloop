import { access, cp, mkdir, rm, writeFile } from "node:fs/promises";

const siteUrl = "https://shiting-neoloop-demo.netlify.app";
const clientDirectory = new URL("../dist/client/", import.meta.url);
const outputDirectory = new URL("../netlify-dist/", import.meta.url);
const workerUrl = new URL("../dist/server/index.js", import.meta.url);
workerUrl.searchParams.set("netlify-export", `${Date.now()}`);

await rm(outputDirectory, { recursive: true, force: true });
await cp(clientDirectory, outputDirectory, { recursive: true });

const { default: worker } = await import(workerUrl.href);
const routes = [
  {
    path: "/",
    output: "index.html",
    requiredText: ["石听 NeoLoop", "让每条反馈都找到", "全部业务数据均为合成样例", "刘肖蔚然", "闫紫豪", "进入软件工作台"],
  },
  {
    path: "/software",
    output: "software/index.html",
    requiredText: ["运营工作台", "合成只读", "未连接企业系统", "来源系统", "本地沙盘", "SYN-CASE-017", "SYN-CLUSTER-001", "SYN-IMPROVEMENT-001"],
  },
];
const emittedPages = [];

for (const route of routes) {
  const response = await worker.fetch(
    new Request(`${siteUrl}${route.path}`, {
      headers: {
        accept: "text/html",
        host: "shiting-neoloop-demo.netlify.app",
        "x-forwarded-host": "shiting-neoloop-demo.netlify.app",
        "x-forwarded-proto": "https",
      },
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

  if (!response.ok) {
    throw new Error(`Static render failed for ${route.path} with HTTP ${response.status}`);
  }

  const html = await response.text();
  for (const requiredText of route.requiredText) {
    if (!html.includes(requiredText)) {
      throw new Error(`Static render for ${route.path} is missing required text: ${requiredText}`);
    }
  }

  const outputUrl = new URL(route.output, outputDirectory);
  await mkdir(new URL("./", outputUrl), { recursive: true });
  await writeFile(outputUrl, html, "utf8");
  emittedPages.push({ route, html });
}

for (const { route, html } of emittedPages) {
  if (!html.includes(`${siteUrl}/og.png`)) {
    throw new Error(`Static render for ${route.path} contains an incorrect social-card URL`);
  }
}

const localAssetPaths = emittedPages.flatMap(({ html }) => [...html.matchAll(/(?:href|src)="(\/(?!\/)[^"]+)"/g)]
  .map((match) => match[1].split(/[?#]/, 1)[0])
  .filter((path) => path !== "/" && path !== "/software"));

for (const assetPath of new Set(localAssetPaths)) {
  await access(new URL(`.${assetPath}`, outputDirectory));
}

console.log(`Netlify static export ready: ${outputDirectory.pathname}`);
