import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const PROFILE_IDS = new Set([
  "n2-default",
  "n3-default",
  "n4-default",
  "n5-same-event",
  "n5-cross-event",
  "n6-responsibility",
  "n6-root-cause",
  "n7-customer-reply",
  "n7-knowledge-draft",
  "n7-insight-summary",
]);

const profileId = process.argv[2];

function failure(issueCode) {
  return {
    profile_id: PROFILE_IDS.has(profileId) ? profileId : null,
    node: null,
    mode: null,
    classification: "needs_human",
    attempt_count: 0,
    candidate_top_level_keys: null,
    exact_14_generated: false,
    issue_codes: [issueCode],
  };
}

function writeFailure(issueCode) {
  process.stdout.write(`${JSON.stringify(failure(issueCode))}\n`);
  process.exitCode = 1;
}

function collectTypeScriptFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory()
      ? collectTypeScriptFiles(path)
      : path.endsWith(".ts") ? [path] : [];
  });
}

if (process.argv.length !== 3) {
  writeFailure("input_frame_invalid");
} else if (!PROFILE_IDS.has(profileId)) {
  writeFailure("profile_not_allowed");
} else {
  const projectRoot = resolve(import.meta.dirname, "../..");
  const buildRoot = mkdtempSync(join(tmpdir(), "neoloop-owner-first-preview-"));
  try {
    const sources = collectTypeScriptFiles(resolve(projectRoot, "src/neoloop"));
    const compiler = resolve(projectRoot, "node_modules/typescript/lib/tsc.js");
    const compiled = spawnSync(
      process.execPath,
      [
        compiler,
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
        env: {
          ...process.env,
          NO_COLOR: "1",
        },
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
        [resolve(buildRoot, "src/neoloop/cli/owner-first-node-preview.js"), profileId],
        {
          cwd: projectRoot,
          stdio: "inherit",
          env: {
            ...process.env,
            NO_COLOR: "1",
          },
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
