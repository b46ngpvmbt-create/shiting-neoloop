import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const projectRoot = resolve(import.meta.dirname, "../..");
const localOnly = process.argv.includes("--local-only");
const crossOnly = process.argv.includes("--cross-only");

if (localOnly && crossOnly) {
  throw new Error("Use either --local-only or --cross-only, not both");
}

const buildRoot = mkdtempSync(join(tmpdir(), "neoloop-t3-core-"));

function collectTypeScriptFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? collectTypeScriptFiles(path) : path.endsWith(".ts") ? [path] : [];
  });
}

try {
  const sources = [
    ...collectTypeScriptFiles(join(projectRoot, "src/neoloop")),
    ...collectTypeScriptFiles(join(projectRoot, "services/openapi-ingest")),
  ];
  const tsc = spawnSync(
    join(projectRoot, "node_modules/.bin/tsc"),
    [
      "--outDir", buildRoot,
      "--rootDir", projectRoot,
      "--noEmit", "false",
      "--incremental", "false",
      "--module", "NodeNext",
      "--moduleResolution", "NodeNext",
      "--target", "ES2022",
      "--lib", "ES2022,DOM",
      "--types", "node",
      "--strict",
      "--skipLibCheck",
      ...sources,
    ],
    { cwd: projectRoot, encoding: "utf8" },
  );
  if (tsc.status !== 0) {
    process.stderr.write(tsc.stdout);
    process.stderr.write(tsc.stderr);
    process.exitCode = tsc.status ?? 1;
  } else {
    writeFileSync(join(buildRoot, "package.json"), '{"type":"module"}\n', "utf8");
    const tests = readdirSync(import.meta.dirname)
      .filter((name) => name.endsWith(".test.mjs"))
      .filter((name) => {
        if (localOnly) return name !== "cross-contract.test.mjs";
        if (crossOnly) return name === "cross-contract.test.mjs";
        return true;
      })
      .map((name) => join(import.meta.dirname, name));
    const nodeTest = spawnSync(
      process.execPath,
      ["--test", "--test-concurrency=1", ...tests],
      {
        cwd: projectRoot,
        encoding: "utf8",
        env: { ...process.env, NEOLOOP_T3_BUILD_ROOT: buildRoot },
      },
    );
    process.stdout.write(nodeTest.stdout);
    process.stderr.write(nodeTest.stderr);
    process.exitCode = nodeTest.status ?? 1;
  }
} finally {
  rmSync(buildRoot, { recursive: true, force: true });
}
