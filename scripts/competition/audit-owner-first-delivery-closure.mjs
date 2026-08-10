import { createHash } from "node:crypto";
import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
} from "node:fs";
import { dirname, extname, relative, resolve, sep } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPOSITORY_ROOT = resolve(scriptDirectory, "../..");

export const OWNER_FIRST_DELIVERY_GROUPS = Object.freeze({
  n1: Object.freeze({
    entrypoints: Object.freeze([
      "src/neoloop/ai/owner-first-n1-preview.ts",
      "src/neoloop/ai/owner-first-n1-evidence-binding.ts",
      "src/neoloop/ai/owner-first-n1-binding-preview.ts",
      "src/neoloop/cli/owner-first-n1-preview.ts",
      "src/neoloop/cli/owner-first-n1-binding-preview.ts",
    ]),
    runtime_assets: Object.freeze([
      "feishu/prompts/n1-owner-first-exact-5.txt",
      "feishu/prompts/n1-owner-first-exact-5-bound.txt",
    ]),
    verification_paths: Object.freeze([
      "tests/core/owner-first-n1-preview.test.mjs",
      "tests/core/owner-first-n1-preview-cli.test.mjs",
      "tests/core/owner-first-n1-evidence-binding.test.mjs",
      "tests/core/owner-first-n1-binding-preview.test.mjs",
      "tests/core/owner-first-n1-binding-preview-cli.test.mjs",
    ]),
  }),
  n2_n7: Object.freeze({
    entrypoints: Object.freeze([
      "src/neoloop/ai/owner-first-node-preview.ts",
      "src/neoloop/cli/owner-first-node-preview.ts",
    ]),
    runtime_assets: Object.freeze([
      "feishu/scripts/run-owner-first-node-preview.mjs",
      "feishu/manifests/owner-first-node-prompt-bindings.v1.json",
      "feishu/prompts/n2-default-owner-first-exact-5.txt",
      "feishu/prompts/n3-default-owner-first-exact-5.txt",
      "feishu/prompts/n4-default-owner-first-exact-5.txt",
      "feishu/prompts/n5-same-event-owner-first-exact-5.txt",
      "feishu/prompts/n5-cross-event-owner-first-exact-5.txt",
      "feishu/prompts/n6-responsibility-owner-first-exact-5.txt",
      "feishu/prompts/n6-root-cause-owner-first-exact-5.txt",
      "feishu/prompts/n7-customer-reply-owner-first-exact-5.txt",
      "feishu/prompts/n7-knowledge-draft-owner-first-exact-5.txt",
      "feishu/prompts/n7-insight-summary-owner-first-exact-5.txt",
    ]),
    verification_paths: Object.freeze([
      "tests/core/owner-first-node-preview.test.mjs",
      "tests/core/owner-first-node-preview-cli.test.mjs",
    ]),
  }),
});

const SHARED_TOOLCHAIN_PATHS = Object.freeze([
  ".nvmrc",
  "package.json",
  "package-lock.json",
]);

const SHARED_VERIFICATION_PATHS = Object.freeze([
  "tests/core/_runtime.mjs",
  "tests/core/run-core-tests.mjs",
]);

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function normalizeRelativePath(repositoryRoot, absolutePath) {
  const normalized = relative(repositoryRoot, absolutePath).split(sep).join("/");
  if (normalized === "" || normalized === ".." || normalized.startsWith("../")) {
    throw new Error(`path_outside_repository:${absolutePath}`);
  }
  return normalized;
}

function localModuleSpecifiers(source) {
  const specifiers = new Set();
  const staticPattern = /(?:^|\n)\s*(?:import|export)\s+(?:type\s+)?(?:[\s\S]*?\s+from\s+)?["']([^"']+)["'];?/gu;
  const dynamicPattern = /\bimport\(\s*["']([^"']+)["']\s*\)/gu;
  for (const pattern of [staticPattern, dynamicPattern]) {
    for (const match of source.matchAll(pattern)) {
      if (match[1].startsWith(".")) specifiers.add(match[1]);
    }
  }
  return [...specifiers].sort();
}

function resolveLocalModule(repositoryRoot, importerPath, specifier) {
  const importerAbsolutePath = resolve(repositoryRoot, importerPath);
  const unresolved = resolve(dirname(importerAbsolutePath), specifier);
  const extension = extname(unresolved);
  const candidates = [];
  if (extension === ".js" || extension === ".mjs" || extension === ".cjs") {
    candidates.push(unresolved.slice(0, -extension.length) + ".ts", unresolved);
  } else if (extension) {
    candidates.push(unresolved);
  } else {
    candidates.push(
      `${unresolved}.ts`,
      `${unresolved}.mjs`,
      `${unresolved}.js`,
      resolve(unresolved, "index.ts"),
      resolve(unresolved, "index.mjs"),
      resolve(unresolved, "index.js"),
    );
  }
  const target = candidates.find((candidate) => existsSync(candidate) && statSync(candidate).isFile());
  if (!target) return null;
  return normalizeRelativePath(repositoryRoot, target);
}

function sourceClosure(repositoryRoot, entrypoints) {
  const pending = [...entrypoints];
  const visited = new Set();
  const unresolved = [];
  while (pending.length > 0) {
    const current = pending.pop();
    if (visited.has(current)) continue;
    const currentAbsolutePath = resolve(repositoryRoot, current);
    if (!existsSync(currentAbsolutePath) || !statSync(currentAbsolutePath).isFile()) {
      unresolved.push({ importer: null, specifier: current, reason: "entrypoint_missing" });
      continue;
    }
    visited.add(current);
    const source = readFileSync(currentAbsolutePath, "utf8");
    for (const specifier of localModuleSpecifiers(source)) {
      const target = resolveLocalModule(repositoryRoot, current, specifier);
      if (!target) {
        unresolved.push({ importer: current, specifier, reason: "local_import_missing" });
      } else if (!visited.has(target)) {
        pending.push(target);
      }
    }
  }
  return {
    paths: [...visited].sort(),
    unresolved: unresolved.sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right))),
  };
}

function gitPathSet(repositoryRoot, args) {
  const output = execFileSync("git", args, {
    cwd: repositoryRoot,
    encoding: "buffer",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return new Set(
    output.toString("utf8").split("\0").filter(Boolean),
  );
}

function pathExistsAtHead(repositoryRoot, path) {
  try {
    execFileSync("git", ["cat-file", "-e", `HEAD:${path}`], {
      cwd: repositoryRoot,
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
}

function collectFiles(directory, predicate) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return collectFiles(path, predicate);
    return entry.isFile() && predicate(path) ? [path] : [];
  });
}

function rowsDigest(rows) {
  return sha256(rows.map((row) => `${row.path}\0${row.sha256}\n`).join(""));
}

function syntheticBaselineBinding(repositoryRoot) {
  const sourceRows = collectFiles(
    resolve(repositoryRoot, "src/neoloop"),
    (path) => path.endsWith(".ts"),
  ).sort().map((path) => ({
    path: normalizeRelativePath(repositoryRoot, path),
    sha256: sha256(readFileSync(path)),
  }));
  const baselinePath = resolve(repositoryRoot, "evaluation/synthetic-evidence-baseline.mjs");
  if (!existsSync(baselinePath)) {
    return {
      current_source_file_count: sourceRows.length,
      current_source_digest_sha256: rowsDigest(sourceRows),
      configured_source_file_count: null,
      configured_source_digest_sha256: null,
      matches_current_tree: false,
      reason: "baseline_module_missing",
    };
  }
  const baseline = readFileSync(baselinePath, "utf8");
  const configuredCount = Number(
    baseline.match(/const RESOLVER_SOURCE_FILE_COUNT = (\d+);/u)?.[1] ?? Number.NaN,
  );
  const configuredDigest = baseline.match(
    /const RESOLVER_SOURCE_DIGEST_SHA256 = "([a-f0-9]{64})";/u,
  )?.[1] ?? null;
  const currentDigest = rowsDigest(sourceRows);
  return {
    current_source_file_count: sourceRows.length,
    current_source_digest_sha256: currentDigest,
    configured_source_file_count: Number.isInteger(configuredCount) ? configuredCount : null,
    configured_source_digest_sha256: configuredDigest,
    matches_current_tree: configuredCount === sourceRows.length && configuredDigest === currentDigest,
    reason: configuredDigest === null || !Number.isInteger(configuredCount)
      ? "baseline_binding_constants_missing"
      : null,
  };
}

function pathRows(repositoryRoot, paths, gitState) {
  return paths.map((path) => {
    const absolutePath = resolve(repositoryRoot, path);
    const worktreeExists = existsSync(absolutePath) && statSync(absolutePath).isFile();
    return {
      path,
      head_tracked: pathExistsAtHead(repositoryRoot, path),
      index_tracked: gitState.index.has(path),
      staged: gitState.staged.has(path),
      worktree_modified: gitState.modified.has(path),
      worktree_exists: worktreeExists,
      worktree_sha256: worktreeExists ? sha256(readFileSync(absolutePath)) : null,
    };
  });
}

export function buildOwnerFirstDeliveryAudit({
  repositoryRoot = DEFAULT_REPOSITORY_ROOT,
} = {}) {
  const canonicalRoot = resolve(repositoryRoot);
  const gitState = {
    index: gitPathSet(canonicalRoot, ["ls-files", "-z"]),
    staged: gitPathSet(canonicalRoot, ["diff", "--cached", "--name-only", "-z"]),
    modified: gitPathSet(canonicalRoot, ["diff", "--name-only", "-z"]),
  };
  const groups = {};
  for (const [groupName, group] of Object.entries(OWNER_FIRST_DELIVERY_GROUPS)) {
    const closure = sourceClosure(canonicalRoot, group.entrypoints);
    const requiredPaths = [...new Set([
      ...SHARED_TOOLCHAIN_PATHS,
      ...SHARED_VERIFICATION_PATHS,
      ...closure.paths,
      ...group.runtime_assets,
      ...group.verification_paths,
    ])].sort();
    const paths = pathRows(canonicalRoot, requiredPaths, gitState);
    groups[groupName] = {
      entrypoints: [...group.entrypoints],
      source_closure: closure.paths,
      unresolved_local_imports: closure.unresolved,
      runtime_assets: [...group.runtime_assets],
      verification_paths: [...SHARED_VERIFICATION_PATHS, ...group.verification_paths].sort(),
      toolchain_paths: [...SHARED_TOOLCHAIN_PATHS],
      required_paths: paths,
      required_but_absent_from_head: paths.filter((row) => !row.head_tracked).map((row) => row.path),
      required_but_absent_from_index: paths.filter((row) => !row.index_tracked).map((row) => row.path),
      missing_from_worktree: paths.filter((row) => !row.worktree_exists).map((row) => row.path),
      staged_required_paths: paths.filter((row) => row.staged).map((row) => row.path),
      head_reproducible: closure.unresolved.length === 0 && paths.every((row) => row.head_tracked),
      worktree_reproducible: closure.unresolved.length === 0 && paths.every((row) => row.worktree_exists),
    };
  }
  const baseline = syntheticBaselineBinding(canonicalRoot);
  return {
    schema_version: "owner_first_delivery_dependency_audit.v1",
    repository_head: execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: canonicalRoot,
      encoding: "utf8",
    }).trim(),
    staged_path_count_repository_wide: gitState.staged.size,
    groups,
    synthetic_baseline_binding: baseline,
    checks: {
      worktree_dependency_closure_complete: Object.values(groups).every(
        (group) => group.worktree_reproducible,
      ),
      head_dependency_closure_complete: Object.values(groups).every(
        (group) => group.head_reproducible,
      ),
      no_owner_first_required_paths_staged: Object.values(groups).every(
        (group) => group.staged_required_paths.length === 0,
      ),
      synthetic_baseline_covers_current_src_neoloop: baseline.matches_current_tree,
    },
  };
}

function renderMarkdown(report) {
  const lines = [
    "# Owner-first delivery dependency audit",
    "",
    `- HEAD: \`${report.repository_head}\``,
    `- Worktree closure complete: \`${report.checks.worktree_dependency_closure_complete}\``,
    `- HEAD closure complete: \`${report.checks.head_dependency_closure_complete}\``,
    `- Synthetic baseline covers current src/neoloop: \`${report.checks.synthetic_baseline_covers_current_src_neoloop}\``,
    "",
  ];
  for (const [name, group] of Object.entries(report.groups)) {
    lines.push(`## ${name}`, "", `- Source closure: ${group.source_closure.length} files`);
    lines.push(`- Required paths absent from HEAD: ${group.required_but_absent_from_head.length}`);
    for (const path of group.required_but_absent_from_head) lines.push(`  - \`${path}\``);
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}

const isMain = process.argv[1]
  && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;

if (isMain) {
  const formatArgument = process.argv.find((argument) => argument.startsWith("--format="));
  const format = formatArgument?.slice("--format=".length) ?? "json";
  if (process.argv.length > (formatArgument ? 3 : 2) || !["json", "markdown"].includes(format)) {
    process.stderr.write("usage: node audit-owner-first-delivery-closure.mjs [--format=json|markdown]\n");
    process.exitCode = 2;
  } else {
    try {
      const report = buildOwnerFirstDeliveryAudit();
      process.stdout.write(format === "markdown"
        ? renderMarkdown(report)
        : `${JSON.stringify(report, null, 2)}\n`);
      if (
        !report.checks.worktree_dependency_closure_complete
        || !report.checks.synthetic_baseline_covers_current_src_neoloop
      ) {
        process.exitCode = 1;
      }
    } catch (error) {
      process.stderr.write(`${JSON.stringify({
        status: "failed",
        code: "owner_first_delivery_audit_failed",
        message: error instanceof Error ? error.message : "unknown_error",
      })}\n`);
      process.exitCode = 1;
    }
  }
}
