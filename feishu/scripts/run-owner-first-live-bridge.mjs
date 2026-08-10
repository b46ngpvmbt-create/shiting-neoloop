import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

function failure(issueCode) {
  return {
    schema_version: "owner_first_live_bridge_report.v1",
    profile_id: null,
    classification: "needs_human",
    request_sha256: null,
    input_hash: null,
    attempt_count: 0,
    envelope: null,
    write_plan: null,
    planned_business_write_count: 0,
    planned_audit_write_count: 0,
    issue_codes: [issueCode],
  };
}

function collectTypeScriptFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory()
      ? collectTypeScriptFiles(path)
      : path.endsWith(".ts") ? [path] : [];
  });
}

function writeFailure(issueCode) {
  process.stdout.write(`${JSON.stringify(failure(issueCode))}\n`);
  process.exitCode = 1;
}

if (process.argv.length !== 2) {
  writeFailure("input_frame_invalid");
} else {
  const projectRoot = resolve(import.meta.dirname, "../..");
  const buildRoot = mkdtempSync(join(tmpdir(), "neoloop-owner-first-live-bridge-"));
  try {
    const sources = collectTypeScriptFiles(resolve(projectRoot, "src/neoloop"));
    const compiled = spawnSync(
      process.execPath,
      [
        resolve(projectRoot, "node_modules/typescript/lib/tsc.js"),
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
      {
        cwd: projectRoot,
        encoding: "utf8",
        env: { ...process.env, NO_COLOR: "1" },
        timeout: 30_000,
        maxBuffer: 1024 * 1024,
      },
    );
    if (compiled.error || compiled.signal || compiled.status !== 0) {
      writeFailure("internal_validation_error");
    } else {
      writeFileSync(join(buildRoot, "package.json"), "{\"type\":\"module\"}\n", {
        encoding: "utf8",
        flag: "wx",
        mode: 0o600,
      });
      const executed = spawnSync(
        process.execPath,
        [resolve(buildRoot, "src/neoloop/cli/owner-first-live-bridge.js")],
        {
          cwd: projectRoot,
          stdio: "inherit",
          env: { ...process.env, NO_COLOR: "1" },
        },
      );
      process.exitCode = executed.status ?? 1;
    }
  } catch {
    writeFailure("internal_validation_error");
  } finally {
    rmSync(buildRoot, { recursive: true, force: true });
  }
}
