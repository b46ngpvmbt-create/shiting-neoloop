import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";

export const EXPECTED_LARK_CLI_VERSION = "1.0.84";
export const FIXED_LARK_CLI_PROFILE = "neoloop-r10-probe";
export const P12_TARGET_SCOPE = "bitable:app:readonly";
export const P12_RUNNER_TIMEOUT_MS = 12_000;
export const P12_RUNNER_MAX_OUTPUT_BYTES = 256 * 1024;

const TARGETS = Object.freeze({
  cases: Object.freeze({ table: "SYN_Cases", field: "case_id", prefix: "SYN-CASE-" }),
  clusters: Object.freeze({ table: "SYN_Clusters", field: "cluster_id", prefix: "SYN-CLUSTER-" }),
  improvements: Object.freeze({
    table: "SYN_Improvements",
    field: "improvement_id",
    prefix: "SYN-IMPROVEMENT-",
  }),
});

const CREDENTIAL_KEYS = new Set([
  "accesstoken",
  "authorization",
  "clientsecret",
  "cookie",
  "devicecode",
  "refreshtoken",
  "setcookie",
  "tenantaccesstoken",
  "token",
  "appsecret",
  "verificationuri",
  "verificationurl",
]);

const ISSUE_CODES = new Set([
  "auth_scope_missing",
  "auth_user_unverified",
  "cli_version_mismatch",
  "command_failed",
  "command_timeout",
  "discovery_cardinality_invalid",
  "input_contract_invalid",
  "provider_output_unsafe",
  "record_result_invalid",
  "url_resolution_invalid",
  "zero_match_check_failed",
]);

const CLASSIFICATIONS = new Set([
  "exact_single_match",
  "projection_conflict",
  "projection_dependency_failure",
]);

const URL_INPUT_TYPES = new Set(["base_url", "wiki_url"]);

class StrictJsonError extends Error {}

const emptyCounters = () => ({
  cli_command_count: 0,
  auth_command_count: 0,
  base_read_command_count: 0,
  discovery_read_count: 0,
  zero_match_check_count: 0,
  business_write_count: 0,
});

function report(hitCount, classification, counters, issueCodes = []) {
  const safeIssues = [...new Set(issueCodes)]
    .filter((code) => ISSUE_CODES.has(code))
    .sort((left, right) => left.localeCompare(right));
  return {
    hit_count: [0, 1, 2].includes(hitCount) ? hitCount : null,
    classification: CLASSIFICATIONS.has(classification)
      ? classification
      : "projection_dependency_failure",
    counters: {
      cli_command_count: counters.cli_command_count,
      auth_command_count: counters.auth_command_count,
      base_read_command_count: counters.base_read_command_count,
      discovery_read_count: counters.discovery_read_count,
      zero_match_check_count: counters.zero_match_check_count,
      business_write_count: 0,
    },
    issue_codes: safeIssues,
  };
}

function failure(counters, issueCode) {
  return report(null, "projection_dependency_failure", counters, [issueCode]);
}

function officialHost(hostname) {
  const lower = hostname.toLowerCase();
  return ["feishu.cn", "larksuite.com", "larkoffice.com"]
    .some((suffix) => lower === suffix || lower.endsWith(`.${suffix}`));
}

function opaque(value) {
  return typeof value === "string"
    && value.length >= 8
    && value.length <= 160
    && /^[A-Za-z0-9_-]+$/.test(value);
}

export function isApprovedBaseEntryUrl(value) {
  if (typeof value !== "string" || value.length > 4_096 || value.trim() !== value) return false;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:"
      || !officialHost(parsed.hostname)
      || parsed.port !== ""
      || parsed.username !== ""
      || parsed.password !== ""
      || parsed.hash !== "") return false;
    if (!/^\/(?:base|wiki)\/[A-Za-z0-9_-]{8,160}$/.test(parsed.pathname)) return false;

    const keys = [...parsed.searchParams.keys()];
    if (keys.some((key) => !["table", "view"].includes(key))) return false;
    if (parsed.searchParams.getAll("table").length !== 1
      || !opaque(parsed.searchParams.get("table"))) return false;
    if (parsed.searchParams.getAll("view").length > 1) return false;
    const view = parsed.searchParams.get("view");
    if (view !== null && !opaque(view)) return false;
    return true;
  } catch {
    return false;
  }
}

function directBaseTokenFromApprovedEntryUrl(value) {
  try {
    const match = /^\/base\/([A-Za-z0-9_-]{8,160})$/.exec(new URL(value).pathname);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

function validBusinessId(target, value) {
  const config = TARGETS[target];
  return config !== undefined
    && typeof value === "string"
    && value.startsWith(config.prefix)
    && value.length <= 128
    && /^[A-Z0-9_-]+$/.test(value);
}

function inspectJsonForDuplicateKeys(text) {
  let index = 0;
  const fail = () => { throw new StrictJsonError(); };
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
        if (keys.has(key)) fail();
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

function decode(value) {
  if (typeof value === "string") {
    if (Buffer.byteLength(value) > P12_RUNNER_MAX_OUTPUT_BYTES) throw new StrictJsonError();
    return value;
  }
  if (!Buffer.isBuffer(value) || value.length > P12_RUNNER_MAX_OUTPUT_BYTES) {
    throw new StrictJsonError();
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(value);
  } catch {
    throw new StrictJsonError();
  }
}

function parseStrictJson(value) {
  const text = decode(value);
  inspectJsonForDuplicateKeys(text);
  const parsed = JSON.parse(text);
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) throw new StrictJsonError();
  return parsed;
}

function containsCredentialKey(value) {
  if (Array.isArray(value)) return value.some(containsCredentialKey);
  if (value === null || typeof value !== "object") return false;
  return Object.entries(value).some(([key, child]) => CREDENTIAL_KEYS.has(
    key.toLowerCase().replaceAll(/[^a-z0-9]/g, ""),
  )
    || containsCredentialKey(child));
}

function safeEnvironment() {
  const result = { NO_COLOR: "1" };
  for (const key of ["PATH", "HOME", "TMPDIR", "LANG", "LC_ALL"]) {
    if (typeof process.env[key] === "string") result[key] = process.env[key];
  }
  return result;
}

function defaultExecuteProcess(executable, args, options) {
  return new Promise((resolve) => {
    execFile(executable, args, options, (error, stdout, stderr) => {
      resolve({
        exitCode: error === null ? 0 : (typeof error.code === "number" ? error.code : null),
        processError: error !== null,
        timedOut: error?.killed === true || error?.code === "ETIMEDOUT",
        stdout: stdout ?? Buffer.alloc(0),
        stderr: stderr ?? Buffer.alloc(0),
      });
    });
  });
}

async function invoke(executeProcess, args) {
  try {
    const attempt = await executeProcess("lark-cli", args, {
      encoding: "buffer",
      timeout: P12_RUNNER_TIMEOUT_MS,
      maxBuffer: P12_RUNNER_MAX_OUTPUT_BYTES,
      windowsHide: true,
      shell: false,
      env: safeEnvironment(),
    });
    if (attempt === null || typeof attempt !== "object" || Array.isArray(attempt)) {
      return { ok: false, issue: "command_failed" };
    }
    if (attempt.timedOut === true) return { ok: false, issue: "command_timeout" };

    let stdout;
    let stderr;
    try {
      stdout = decode(attempt.stdout);
      stderr = decode(attempt.stderr);
    } catch {
      return { ok: false, issue: "provider_output_unsafe" };
    }
    if (stderr.trim() !== "") return { ok: false, issue: "command_failed" };
    return {
      ok: attempt.exitCode === 0 && attempt.processError !== true,
      exitCode: attempt.exitCode,
      stdout,
    };
  } catch {
    return { ok: false, issue: "command_failed" };
  }
}

function parseJsonAttempt(attempt, { allowNonzero = false } = {}) {
  if (attempt.issue) return { ok: false, issue: attempt.issue };
  if (!attempt.ok && !allowNonzero) return { ok: false, issue: "command_failed" };
  try {
    const value = parseStrictJson(attempt.stdout);
    if (containsCredentialKey(value)) return { ok: false, issue: "provider_output_unsafe" };
    return { ok: true, value };
  } catch {
    return { ok: false, issue: "provider_output_unsafe" };
  }
}

function parseSuccessEnvelope(attempt) {
  const parsed = parseJsonAttempt(attempt);
  if (!parsed.ok) return parsed;
  if (parsed.value.ok !== true
    || parsed.value.identity !== "user"
    || parsed.value.data === null
    || typeof parsed.value.data !== "object"
    || Array.isArray(parsed.value.data)) return { ok: false, issue: "provider_output_unsafe" };
  return { ok: true, data: parsed.value.data };
}

function validFields(fields, expectedField, expectedValue) {
  return fields !== null
    && typeof fields === "object"
    && !Array.isArray(fields)
    && Object.keys(fields).length === 1
    && Object.hasOwn(fields, expectedField)
    && fields[expectedField] === expectedValue;
}

function recordListArgs({ baseToken, targetConfig, filterValue }) {
  const args = [
    "--profile", FIXED_LARK_CLI_PROFILE,
    "base", "+record-list",
    "--base-token", baseToken,
    "--table-id", targetConfig.table,
    "--field-id", targetConfig.field,
  ];
  if (filterValue !== undefined) {
    args.push("--filter-json", JSON.stringify({
      logic: "and",
      conditions: [[targetConfig.field, "==", filterValue]],
    }));
  }
  args.push(
    "--limit", "2",
    "--as", "user",
    "--format", "json",
  );
  return args;
}

async function listProjectedRecords(executeProcess, counters, args, counterKind) {
  counters.cli_command_count += 1;
  counters.base_read_command_count += 1;
  if (counterKind === "discovery") counters.discovery_read_count += 1;
  if (counterKind === "zero_match") counters.zero_match_check_count += 1;
  const attempt = await invoke(executeProcess, args);
  const parsed = parseSuccessEnvelope(attempt);
  if (!parsed.ok) return parsed;
  if (!Array.isArray(parsed.data.items) || parsed.data.has_more === true) {
    return { ok: false, issue: "record_result_invalid" };
  }
  return { ok: true, items: parsed.data.items };
}

export async function runRedactedP12LiveProbe({
  baseEntryUrl,
  target,
  businessId,
  executeProcess = defaultExecuteProcess,
} = {}) {
  const counters = emptyCounters();
  const targetConfig = TARGETS[target];
  if (!isApprovedBaseEntryUrl(baseEntryUrl)
    || targetConfig === undefined
    || !(businessId === null || validBusinessId(target, businessId))
    || typeof executeProcess !== "function") return failure(counters, "input_contract_invalid");

  counters.cli_command_count += 1;
  const versionAttempt = await invoke(executeProcess, ["--version"]);
  if (versionAttempt.issue) return failure(counters, versionAttempt.issue);
  if (!versionAttempt.ok) return failure(counters, "command_failed");
  const versionMatch = /^lark-cli version (\d+\.\d+\.\d+)\s*$/.exec(versionAttempt.stdout);
  if (versionMatch === null) return failure(counters, "provider_output_unsafe");
  if (versionMatch[1] !== EXPECTED_LARK_CLI_VERSION) return failure(counters, "cli_version_mismatch");

  counters.cli_command_count += 1;
  counters.auth_command_count += 1;
  const statusAttempt = await invoke(executeProcess, [
    "--profile", FIXED_LARK_CLI_PROFILE,
    "auth", "status",
    "--json",
    "--verify",
  ]);
  const status = parseJsonAttempt(statusAttempt);
  if (!status.ok) return failure(counters, status.issue);
  if (status.value.identity !== "user" || status.value.verified !== true) {
    return failure(counters, "auth_user_unverified");
  }

  counters.cli_command_count += 1;
  counters.auth_command_count += 1;
  const checkAttempt = await invoke(executeProcess, [
    "--profile", FIXED_LARK_CLI_PROFILE,
    "auth", "check",
    "--scope", P12_TARGET_SCOPE,
    "--json",
  ]);
  const check = parseJsonAttempt(checkAttempt, { allowNonzero: true });
  if (!check.ok) return failure(counters, check.issue);
  const missing = check.value.missing;
  if (check.value.ok !== true
    || !Array.isArray(check.value.granted)
    || check.value.granted.length !== 1
    || check.value.granted[0] !== P12_TARGET_SCOPE
    || !(missing === null || (Array.isArray(missing) && missing.length === 0))) {
    if (check.value.ok === false
      && Array.isArray(missing)
      && missing.includes(P12_TARGET_SCOPE)) return failure(counters, "auth_scope_missing");
    return failure(counters, checkAttempt.ok ? "provider_output_unsafe" : "command_failed");
  }
  if (!checkAttempt.ok) return failure(counters, "auth_scope_missing");

  let privateBaseToken = directBaseTokenFromApprovedEntryUrl(baseEntryUrl);
  if (privateBaseToken === null) {
    counters.cli_command_count += 1;
    counters.base_read_command_count += 1;
    const resolveAttempt = await invoke(executeProcess, [
      "--profile", FIXED_LARK_CLI_PROFILE,
      "base", "+url-resolve",
      "--url", baseEntryUrl,
      "--as", "user",
      "--format", "json",
    ]);
    const resolved = parseSuccessEnvelope(resolveAttempt);
    if (!resolved.ok) return failure(counters, resolved.issue);
    if (!URL_INPUT_TYPES.has(resolved.data.input_type)
      || resolved.data.resource_type !== "bitable"
      || !opaque(resolved.data.base_token)) return failure(counters, "url_resolution_invalid");
    privateBaseToken = resolved.data.base_token;
  }

  let exactBusinessId = businessId;
  if (exactBusinessId === null) {
    const discovered = await listProjectedRecords(
      executeProcess,
      counters,
      recordListArgs({ baseToken: privateBaseToken, targetConfig }),
      "discovery",
    );
    if (!discovered.ok) return failure(counters, discovered.issue);
    if (discovered.items.length !== 1) {
      return failure(counters, "discovery_cardinality_invalid");
    }
    const [item] = discovered.items;
    const candidate = item?.fields?.[targetConfig.field];
    if (item === null
      || typeof item !== "object"
      || Array.isArray(item)
      || !validFields(item.fields, targetConfig.field, candidate)
      || !validBusinessId(target, candidate)) {
      return failure(counters, "record_result_invalid");
    }
    exactBusinessId = candidate;
  }

  const listed = await listProjectedRecords(
    executeProcess,
    counters,
    recordListArgs({
      baseToken: privateBaseToken,
      targetConfig,
      filterValue: exactBusinessId,
    }),
    "exact",
  );
  if (!listed.ok) return failure(counters, listed.issue);
  if (listed.items.length > 2
    || listed.items.some((item) => item === null
      || typeof item !== "object"
      || Array.isArray(item)
      || !validFields(item.fields, targetConfig.field, exactBusinessId))) {
    return failure(counters, "record_result_invalid");
  }

  const hitCount = listed.items.length;
  if (hitCount !== 1) {
    return report(hitCount, "projection_conflict", counters);
  }

  const internalMiss = `${targetConfig.prefix}P12-MISS-${randomBytes(16).toString("hex").toUpperCase()}`;
  const missed = await listProjectedRecords(
    executeProcess,
    counters,
    recordListArgs({
      baseToken: privateBaseToken,
      targetConfig,
      filterValue: internalMiss,
    }),
    "zero_match",
  );
  if (!missed.ok) return failure(counters, missed.issue);
  if (missed.items.length !== 0) return failure(counters, "zero_match_check_failed");

  return report(
    hitCount,
    "exact_single_match",
    counters,
  );
}
