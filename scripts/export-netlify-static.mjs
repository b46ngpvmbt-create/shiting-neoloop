import { access, cp, readFile, rm, writeFile } from "node:fs/promises";

const siteUrl = "https://shiting-neoloop-demo.netlify.app";
const clientDirectory = new URL("../dist/client/", import.meta.url);
const outputDirectory = new URL("../netlify-dist/", import.meta.url);
const workerUrl = new URL("../dist/server/index.js", import.meta.url);
workerUrl.searchParams.set("netlify-export", `${Date.now()}`);

await rm(outputDirectory, { recursive: true, force: true });
await cp(clientDirectory, outputDirectory, { recursive: true });

const { default: worker } = await import(workerUrl.href);
const response = await worker.fetch(
  new Request(`${siteUrl}/`, {
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
  throw new Error(`Static render failed with HTTP ${response.status}`);
}

const html = await response.text();
for (const requiredText of [
  "石听 NeoLoop",
  "让每条反馈都找到",
  "全部业务数据均为合成样例",
  "刘肖蔚然",
  "闫紫豪",
]) {
  if (!html.includes(requiredText)) {
    throw new Error(`Static render is missing required text: ${requiredText}`);
  }
}

await writeFile(new URL("index.html", outputDirectory), html, "utf8");

const emittedHtml = await readFile(new URL("index.html", outputDirectory), "utf8");
if (!emittedHtml.includes(`${siteUrl}/og.png`)) {
  throw new Error("Static render contains an incorrect social-card URL");
}

const localAssetPaths = [...emittedHtml.matchAll(/(?:href|src)="(\/(?!\/)[^"]+)"/g)]
  .map((match) => match[1].split(/[?#]/, 1)[0])
  .filter((path) => path !== "/");

for (const assetPath of new Set(localAssetPaths)) {
  await access(new URL(`.${assetPath}`, outputDirectory));
}

console.log(`Netlify static export ready: ${outputDirectory.pathname}`);
