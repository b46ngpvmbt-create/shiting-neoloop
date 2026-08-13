import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));
const workbenchDist = path.join(repositoryRoot, "feishu/workbench-plugin/dist");
const edgeRoot = path.join(repositoryRoot, "services/w2-edge-proxy");

async function fileSha256(filePath) {
  return createHash("sha256").update(await readFile(filePath)).digest("hex");
}

async function relativeFiles(root, prefix = "") {
  const entries = await readdir(path.join(root, prefix), { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const relativePath = path.posix.join(prefix, entry.name);
    if (entry.isDirectory()) files.push(...await relativeFiles(root, relativePath));
    else if (entry.isFile()) files.push(relativePath);
  }
  return files.sort();
}

test("Netlify edge mirrors the current workbench build byte-for-byte", async () => {
  const expectedFiles = await relativeFiles(workbenchDist);
  const edgeFiles = (await relativeFiles(edgeRoot))
    .filter((file) => !["README.md", "_headers", "_redirects"].includes(file));

  assert.deepEqual(edgeFiles, expectedFiles);
  for (const file of expectedFiles) {
    assert.equal(
      await fileSha256(path.join(edgeRoot, file)),
      await fileSha256(path.join(workbenchDist, file)),
      file,
    );
  }
});

test("Netlify edge proxies the complete API surface without carrying credentials", async () => {
  const [redirects, headers, readme, index] = await Promise.all([
    readFile(path.join(edgeRoot, "_redirects"), "utf8"),
    readFile(path.join(edgeRoot, "_headers"), "utf8"),
    readFile(path.join(edgeRoot, "README.md"), "utf8"),
    readFile(path.join(edgeRoot, "index.html"), "utf8"),
  ]);

  assert.equal(
    redirects,
    "/api/* https://shiting-neoloop-connector-gateway.connector-gateway.workers.dev/api/:splat 200!\n",
  );
  assert.match(headers, /Cache-Control: no-store, max-age=0/u);
  assert.match(readme, /https:\/\/shiting-neoloop-w2-edge\.netlify\.app\/api\/v1\/session\/callback/u);
  assert.match(index, /石听 NeoLoop · 飞书工作台/u);

  const allText = `${redirects}\n${headers}\n${readme}\n${index}`;
  assert.doesNotMatch(
    allText,
    /(?:FEISHU_APP_SECRET|OWNER_API_TOKEN|ANALYSIS_API_TOKEN|CONNECTOR_MASTER_KEY|WORKBENCH_SESSION_SIGNING_KEY)\s*[:=]\s*["'][^"']+/u,
  );
});
