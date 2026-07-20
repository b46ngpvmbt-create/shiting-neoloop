import { createHash } from "node:crypto";

const target = process.argv[2];
if (!target) {
  throw new Error("Usage: npm run verify:deploy -- https://example.netlify.app/");
}

const targetUrl = new URL(target);
if (targetUrl.protocol !== "https:") {
  throw new Error("Deployment verification requires an absolute HTTPS URL");
}

const timeout = () => AbortSignal.timeout(20_000);
const pageResponse = await fetch(targetUrl, { redirect: "follow", signal: timeout() });
if (!pageResponse.ok) {
  throw new Error(`Page returned HTTP ${pageResponse.status}: ${pageResponse.url}`);
}
if (!(pageResponse.headers.get("content-type") ?? "").toLowerCase().startsWith("text/html")) {
  throw new Error(`Page did not return HTML: ${pageResponse.headers.get("content-type")}`);
}

const html = await pageResponse.text();
for (const requiredText of [
  "石听 NeoLoop",
  "全部业务数据均为合成样例",
  "刘肖蔚然",
  "闫紫豪",
  "参赛身份与企业业务执行角色相互独立",
]) {
  if (!html.includes(requiredText)) {
    throw new Error(`Deployment is missing required text: ${requiredText}`);
  }
}

const baseUrl = new URL(pageResponse.url);
const candidateValues = [...html.matchAll(/(?:href|src|content)="([^"]+)"/g)].map((match) => match[1]);
const assetUrls = new Set();
for (const value of candidateValues) {
  if (!value.startsWith("/") && !value.startsWith("http://") && !value.startsWith("https://")) {
    continue;
  }
  let assetUrl;
  try {
    assetUrl = new URL(value, baseUrl);
  } catch {
    continue;
  }
  if (assetUrl.origin !== baseUrl.origin || assetUrl.pathname === "/") {
    continue;
  }
  assetUrl.search = "";
  assetUrl.hash = "";
  assetUrls.add(assetUrl.href);
}

if (assetUrls.size > 64) {
  throw new Error(`Unexpected asset count: ${assetUrls.size}`);
}

const assets = await Promise.all([...assetUrls].sort().map(async (url) => {
  let response = await fetch(url, { method: "HEAD", redirect: "follow", signal: timeout() });
  if (response.status === 403 || response.status === 405) {
    response = await fetch(url, {
      headers: { range: "bytes=0-0" },
      redirect: "follow",
      signal: timeout(),
    });
  }
  if (!response.ok) {
    throw new Error(`Asset returned HTTP ${response.status}: ${url}`);
  }
  return {
    url,
    status: response.status,
    contentType: response.headers.get("content-type") ?? "",
  };
}));

console.log(JSON.stringify({
  url: pageResponse.url,
  status: pageResponse.status,
  htmlSha256: createHash("sha256").update(html).digest("hex"),
  requiredTextCount: 5,
  assetCount: assets.length,
  assets,
}, null, 2));
