#!/usr/bin/env node

import { execFile } from "node:child_process";
import {
  closeSync,
  constants as fsConstants,
  fchmodSync,
  fstatSync,
  fsyncSync,
  lstatSync,
  openSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  isApprovedBaseEntryUrl,
  runRedactedP12LiveProbe,
} from "./lib/lark-cli-redacted-runner.mjs";

export const LOCAL_INPUT_MAX_BYTES = 64 * 1024;

const REPORT_CLASSIFICATIONS = new Set([
  "plan_ready",
  "exact_single_match",
  "projection_conflict",
  "projection_dependency_failure",
]);

const REPORT_ISSUE_CODES = new Set([
  "arguments_invalid",
  "auth_scope_missing",
  "auth_user_unverified",
  "cli_version_mismatch",
  "command_failed",
  "command_timeout",
  "discovery_cardinality_invalid",
  "input_contract_invalid",
  "input_duplicate_key",
  "input_json_invalid",
  "input_not_git_ignored",
  "input_path_invalid",
  "input_permissions_unsafe",
  "input_schema_invalid",
  "input_symlink_rejected",
  "input_too_large",
  "input_utf8_invalid",
  "local_init_conflict",
  "local_init_failed",
  "provider_output_unsafe",
  "record_result_invalid",
  "runner_report_invalid",
  "url_resolution_invalid",
  "zero_match_check_failed",
]);

const COUNTER_KEYS = Object.freeze([
  "cli_command_count",
  "auth_command_count",
  "base_read_command_count",
  "discovery_read_count",
  "zero_match_check_count",
  "business_write_count",
]);

const TARGETS = Object.freeze({
  cases: "SYN-CASE-",
  clusters: "SYN-CLUSTER-",
  improvements: "SYN-IMPROVEMENT-",
});

class InputError extends Error {
  constructor(issueCode) {
    super("P12 private input rejected");
    this.issueCode = REPORT_ISSUE_CODES.has(issueCode) ? issueCode : "input_json_invalid";
  }
}

const zeroCounters = () => ({
  cli_command_count: 0,
  auth_command_count: 0,
  base_read_command_count: 0,
  discovery_read_count: 0,
  zero_match_check_count: 0,
  business_write_count: 0,
});

function sortedIssues(issueCodes) {
  if (!Array.isArray(issueCodes)) return ["runner_report_invalid"];
  if (issueCodes.some((code) => typeof code !== "string" || !REPORT_ISSUE_CODES.has(code))) {
    return ["runner_report_invalid"];
  }
  return [...new Set(issueCodes)].sort((left, right) => left.localeCompare(right));
}

function safeCounters(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  const counters = {};
  for (const key of COUNTER_KEYS) {
    const count = value[key];
    if (!Number.isSafeInteger(count) || count < 0) return null;
    counters[key] = count;
  }
  if (counters.business_write_count !== 0) return null;
  return counters;
}

function sanitizeReport(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return {
      hit_count: null,
      classification: "projection_dependency_failure",
      counters: zeroCounters(),
      issue_codes: ["runner_report_invalid"],
    };
  }

  const issues = sortedIssues(value.issue_codes);
  const counters = safeCounters(value.counters);
  const hitCount = [null, 0, 1, 2].includes(value.hit_count) ? value.hit_count : null;
  const classification = REPORT_CLASSIFICATIONS.has(value.classification)
    ? value.classification
    : "projection_dependency_failure";
  const shapeValid = counters !== null
    && [null, 0, 1, 2].includes(value.hit_count)
    && REPORT_CLASSIFICATIONS.has(value.classification)
    && !(classification === "plan_ready" && hitCount !== null)
    && !(classification === "exact_single_match" && hitCount !== 1)
    && !(classification === "projection_conflict" && ![0, 2].includes(hitCount));

  if (!shapeValid || issues.includes("runner_report_invalid")) {
    return {
      hit_count: null,
      classification: "projection_dependency_failure",
      counters: zeroCounters(),
      issue_codes: ["runner_report_invalid"],
    };
  }

  return {
    hit_count: hitCount,
    classification: issues.length === 0 ? classification : "projection_dependency_failure",
    counters,
    issue_codes: issues,
  };
}

export function serializeP12Report(value) {
  return `${JSON.stringify(sanitizeReport(value), null, 2)}\n`;
}

function sanitizeInitReport(value) {
  const issues = sortedIssues(value?.issue_codes);
  const initialized = value?.initialized === true;
  const inputCount = Number.isSafeInteger(value?.input_count) && value.input_count >= 0
    ? value.input_count
    : 0;
  const writeCount = Number.isSafeInteger(value?.write_count) && value.write_count >= 0
    ? value.write_count
    : 0;
  if (issues.includes("runner_report_invalid")
    || writeCount > 1
    || inputCount > 1
    || initialized !== (issues.length === 0 && writeCount === 1 && inputCount === 1)) {
    return {
      initialized: false,
      input_count: 0,
      write_count: 0,
      issue_codes: ["local_init_failed"],
    };
  }
  return {
    initialized,
    input_count: inputCount,
    write_count: writeCount,
    issue_codes: issues,
  };
}

export function serializeP12InitReport(value) {
  return `${JSON.stringify(sanitizeInitReport(value), null, 2)}\n`;
}

function exactKeys(value, expected) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index]);
}

function validBusinessId(target, value) {
  const prefix = TARGETS[target];
  return prefix !== undefined
    && typeof value === "string"
    && value.startsWith(prefix)
    && value.length <= 128
    && /^[A-Z0-9_-]+$/.test(value);
}

function validateMapping(value) {
  if (!exactKeys(value, [
    "schema_version",
    "data_scope",
    "auth_mode",
    "approved_base_entry_url",
  ])
    || value.schema_version !== "neoloop.p12.mapping.v1"
    || value.data_scope !== "synthetic_experiment"
    || value.auth_mode !== "user_readonly"
    || !isApprovedBaseEntryUrl(value.approved_base_entry_url)) {
    throw new InputError("input_schema_invalid");
  }
  return value;
}

function validateFilter(value) {
  if (!exactKeys(value, ["schema_version", "target", "business_id"])
    || value.schema_version !== "neoloop.p12.filter.v1"
    || !Object.hasOwn(TARGETS, value.target)
    || !(value.business_id === null || validBusinessId(value.target, value.business_id))) {
    throw new InputError("input_schema_invalid");
  }
  return value;
}

function inspectJson(text) {
  let index = 0;
  const fail = (issue = "input_json_invalid") => { throw new InputError(issue); };
  const skipWhitespace = () => {
    while (/\s/u.test(text[index] ?? "")) index += 1;
  };
  const parseString = () => {
    if (text[index] !== '"') fail();
    const start = index;
    index += 1;
    while (index < text.length) {
      const character = text[index];
      if (character === '"') {
        index += 1;
        try {
          return JSON.parse(text.slice(start, index));
        } catch {
          fail();
        }
      }
      if (character === "\\") {
        index += 1;
        const escape = text[index];
        if (escape === "u") {
          if (!/^[0-9a-fA-F]{4}$/.test(text.slice(index + 1, index + 5))) fail();
          index += 5;
          continue;
        }
        if (!['"', "\\", "/", "b", "f", "n", "r", "t"].includes(escape)) fail();
        index += 1;
        continue;
      }
      if (character.charCodeAt(0) < 0x20) fail();
      index += 1;
    }
    fail();
  };
  const parseLiteral = (literal) => {
    if (text.slice(index, index + literal.length) !== literal) fail();
    index += literal.length;
  };
  const parseNumber = () => {
    const match = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(text.slice(index));
    if (match === null) fail();
    index += match[0].length;
  };
  const parseValue = () => {
    skipWhitespace();
    const character = text[index];
    if (character === "{") {
      index += 1;
      skipWhitespace();
      const keys = new Set();
      if (text[index] === "}") {
        index += 1;
        return;
      }
      while (index < text.length) {
        const key = parseString();
        if (keys.has(key)) fail("input_duplicate_key");
        keys.add(key);
        skipWhitespace();
        if (text[index] !== ":") fail();
        index += 1;
        parseValue();
        skipWhitespace();
        if (text[index] === "}") {
          index += 1;
          return;
        }
        if (text[index] !== ",") fail();
        index += 1;
        skipWhitespace();
      }
      fail();
    }
    if (character === "[") {
      index += 1;
      skipWhitespace();
      if (text[index] === "]") {
        index += 1;
        return;
      }
      while (index < text.length) {
        parseValue();
        skipWhitespace();
        if (text[index] === "]") {
          index += 1;
          return;
        }
        if (text[index] !== ",") fail();
        index += 1;
      }
      fail();
    }
    if (character === '"') {
      parseString();
      return;
    }
    if (character === "t") return parseLiteral("true");
    if (character === "f") return parseLiteral("false");
    if (character === "n") return parseLiteral("null");
    parseNumber();
  };

  skipWhitespace();
  parseValue();
  skipWhitespace();
  if (index !== text.length) fail();
}

function parsePrivateJson(buffer) {
  if (!Buffer.isBuffer(buffer)) buffer = Buffer.from(buffer ?? "");
  if (buffer.length > LOCAL_INPUT_MAX_BYTES) throw new InputError("input_too_large");
  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    throw new InputError("input_utf8_invalid");
  }
  inspectJson(text);
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    throw new InputError("input_json_invalid");
  }
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new InputError("input_json_invalid");
  }
  return value;
}

function resolveLocalPath(inputPath, repoRoot) {
  if (typeof inputPath !== "string" || inputPath === "" || inputPath.includes("\0")) {
    throw new InputError("input_path_invalid");
  }
  const root = resolve(repoRoot);
  const configRoot = join(root, "feishu", "config");
  try {
    const configStat = lstatSync(configRoot);
    if (configStat.isSymbolicLink()) throw new InputError("input_symlink_rejected");
    if (!configStat.isDirectory()) throw new InputError("input_path_invalid");
  } catch (error) {
    if (error instanceof InputError) throw error;
    throw new InputError("input_path_invalid");
  }
  const candidate = isAbsolute(inputPath) ? resolve(inputPath) : resolve(root, inputPath);
  if (!candidate.startsWith(`${configRoot}${sep}`)
    || dirname(candidate) !== configRoot
    || !basename(candidate).endsWith(".local.json")) {
    throw new InputError("input_path_invalid");
  }
  return { candidate, root };
}

function defaultCheckIgnored(inputPath, repoRoot) {
  return new Promise((resolveCheck) => {
    const pathFromRoot = relative(repoRoot, inputPath);
    execFile(
      "git",
      ["-C", repoRoot, "check-ignore", "-q", "--", pathFromRoot],
      { shell: false, windowsHide: true },
      (error) => resolveCheck(error === null),
    );
  });
}

async function requireIgnored(candidate, root, checkIgnored) {
  let ignored = false;
  try {
    ignored = await checkIgnored(candidate, root);
  } catch {
    ignored = false;
  }
  if (ignored !== true) throw new InputError("input_not_git_ignored");
}

async function loadPrivateInput(inputPath, repoRoot, checkIgnored) {
  const { candidate, root } = resolveLocalPath(inputPath, repoRoot);
  await requireIgnored(candidate, root, checkIgnored);

  let before;
  try {
    before = lstatSync(candidate);
  } catch {
    throw new InputError("input_path_invalid");
  }
  if (before.isSymbolicLink()) throw new InputError("input_symlink_rejected");
  if (!before.isFile()) throw new InputError("input_path_invalid");
  if ((before.mode & 0o077) !== 0
    || (typeof process.getuid === "function" && before.uid !== process.getuid())) {
    throw new InputError("input_permissions_unsafe");
  }
  if (before.size > LOCAL_INPUT_MAX_BYTES) throw new InputError("input_too_large");

  let descriptor;
  try {
    descriptor = openSync(candidate, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
    const after = fstatSync(descriptor);
    if (!after.isFile() || before.dev !== after.dev || before.ino !== after.ino) {
      throw new InputError("input_path_invalid");
    }
    return parsePrivateJson(readFileSync(descriptor));
  } catch (error) {
    if (error instanceof InputError) throw error;
    throw new InputError("input_path_invalid");
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function failureResult(issueCode) {
  return {
    exitCode: 1,
    report: sanitizeReport({
      hit_count: null,
      classification: "projection_dependency_failure",
      counters: zeroCounters(),
      issue_codes: [REPORT_ISSUE_CODES.has(issueCode) ? issueCode : "runner_report_invalid"],
    }),
  };
}

export async function runP12ReadonlyProbe({
  mode = "plan",
  mappingPath,
  filterPath,
  repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../.."),
  checkIgnored = defaultCheckIgnored,
  runLiveProbe = runRedactedP12LiveProbe,
} = {}) {
  if (!["plan", "live"].includes(mode)
    || typeof checkIgnored !== "function"
    || typeof runLiveProbe !== "function") return failureResult("arguments_invalid");

  try {
    const mapping = validateMapping(await loadPrivateInput(
      mappingPath,
      repoRoot,
      checkIgnored,
    ));
    const filter = validateFilter(await loadPrivateInput(
      filterPath,
      repoRoot,
      checkIgnored,
    ));

    if (mode === "plan") {
      return {
        exitCode: 0,
        report: {
          hit_count: null,
          classification: "plan_ready",
          counters: zeroCounters(),
          issue_codes: [],
        },
      };
    }

    let rawReport;
    try {
      rawReport = await runLiveProbe({
        baseEntryUrl: mapping.approved_base_entry_url,
        target: filter.target,
        businessId: filter.business_id,
      });
    } catch {
      return failureResult("command_failed");
    }
    const report = sanitizeReport(rawReport);
    return {
      exitCode: report.issue_codes.length === 0 ? 0 : 1,
      report,
    };
  } catch (error) {
    return failureResult(error instanceof InputError ? error.issueCode : "input_path_invalid");
  }
}

function initFailure(issueCode) {
  return {
    exitCode: 1,
    report: {
      initialized: false,
      input_count: 0,
      write_count: 0,
      issue_codes: [REPORT_ISSUE_CODES.has(issueCode) ? issueCode : "local_init_failed"],
    },
  };
}

export async function initializeP12LocalInput({
  kind,
  outputPath,
  stdinBuffer,
  repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../.."),
  checkIgnored = defaultCheckIgnored,
} = {}) {
  if (![
    "mapping",
    "filter",
  ].includes(kind) || typeof checkIgnored !== "function") return initFailure("arguments_invalid");

  let descriptor;
  let created = false;
  let candidate;
  try {
    const resolvedPath = resolveLocalPath(outputPath, repoRoot);
    candidate = resolvedPath.candidate;
    await requireIgnored(candidate, resolvedPath.root, checkIgnored);
    try {
      const existing = lstatSync(candidate);
      if (existing.isSymbolicLink()) throw new InputError("input_symlink_rejected");
      throw new InputError("local_init_conflict");
    } catch (error) {
      if (error instanceof InputError) throw error;
      if (error?.code !== "ENOENT") throw new InputError("local_init_failed");
    }

    const parsed = parsePrivateJson(stdinBuffer);
    const validated = kind === "mapping" ? validateMapping(parsed) : validateFilter(parsed);
    const content = Buffer.from(`${JSON.stringify(validated, null, 2)}\n`, "utf8");
    if (content.length > LOCAL_INPUT_MAX_BYTES) throw new InputError("input_too_large");

    descriptor = openSync(
      candidate,
      fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_NOFOLLOW,
      0o600,
    );
    created = true;
    fchmodSync(descriptor, 0o600);
    writeFileSync(descriptor, content);
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = undefined;

    return {
      exitCode: 0,
      report: { initialized: true, input_count: 1, write_count: 1, issue_codes: [] },
    };
  } catch (error) {
    if (descriptor !== undefined) {
      closeSync(descriptor);
      descriptor = undefined;
    }
    if (created && candidate !== undefined) {
      try {
        unlinkSync(candidate);
      } catch {
        // The only cleanup target is the exact file this invocation created.
      }
    }
    return initFailure(error instanceof InputError ? error.issueCode : "local_init_failed");
  }
}

export function parseP12CliArgs(argv) {
  if (!Array.isArray(argv)) throw new Error("invalid arguments");
  const args = [...argv];
  if (["init-mapping", "init-filter"].includes(args[0])) {
    if (args.length !== 3 || args[1] !== "--out" || typeof args[2] !== "string") {
      throw new Error("invalid arguments");
    }
    return {
      mode: "init",
      kind: args[0] === "init-mapping" ? "mapping" : "filter",
      outputPath: args[2],
    };
  }

  let mode = "plan";
  if (args[0] === "live") {
    mode = "live";
    args.shift();
  }
  if (args.length !== 4
    || args[0] !== "--mapping"
    || typeof args[1] !== "string"
    || args[2] !== "--filter"
    || typeof args[3] !== "string") {
    throw new Error("invalid arguments");
  }
  return { mode, mappingPath: args[1], filterPath: args[3] };
}

async function readPrivateStdin() {
  const chunks = [];
  let length = 0;
  for await (const chunk of process.stdin) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    length += buffer.length;
    if (length > LOCAL_INPUT_MAX_BYTES) throw new InputError("input_too_large");
    chunks.push(buffer);
  }
  return Buffer.concat(chunks, length);
}

async function main() {
  let parsed;
  try {
    parsed = parseP12CliArgs(process.argv.slice(2));
  } catch {
    const result = failureResult("arguments_invalid");
    process.stdout.write(serializeP12Report(result.report));
    process.exitCode = result.exitCode;
    return;
  }

  if (parsed.mode === "init") {
    let input;
    try {
      input = await readPrivateStdin();
    } catch (error) {
      const result = initFailure(error instanceof InputError ? error.issueCode : "local_init_failed");
      process.stdout.write(serializeP12InitReport(result.report));
      process.exitCode = result.exitCode;
      return;
    }
    const result = await initializeP12LocalInput({
      kind: parsed.kind,
      outputPath: parsed.outputPath,
      stdinBuffer: input,
    });
    process.stdout.write(serializeP12InitReport(result.report));
    process.exitCode = result.exitCode;
    return;
  }

  const result = await runP12ReadonlyProbe(parsed);
  process.stdout.write(serializeP12Report(result.report));
  process.exitCode = result.exitCode;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
