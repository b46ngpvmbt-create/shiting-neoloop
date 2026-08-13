import { execFile } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const EXPECTED_CLI_VERSION = "1.0.84";
export const TARGET_PROFILE = "neoloop-r10-probe";
export const PREFLIGHT_TIMEOUT_MS = 5_000;
export const PREFLIGHT_MAX_OUTPUT_BYTES = 64 * 1024;

const VERSION_ARGS = Object.freeze(["--version"]);
const PROFILE_LIST_ARGS = Object.freeze(["profile", "list"]);
const SAFE_REPORT_KEYS = Object.freeze([
  "profile_name_exists",
  "profile_application_binding_check",
  "cli_version",
  "auth_command_count",
  "api_call_count",
  "write_command_count",
]);

const SENSITIVE_OUTPUT_PATTERNS = Object.freeze([
  /https?:\/\//i,
  /\bbearer\s+\S+/i,
  /\b(?:app|client)[_ -]?secret\b/i,
  /\b(?:tenant[_ -]?)?(?:access|refresh)[_ -]?token\b/i,
  /\btenant[_ -]?key\b/i,
  /\bdevice[_ -]?code\b/i,
  /\b(?:authorization|oauth)[_ -]?(?:url|uri)\b/i,
  /\bcookie\b/i,
  /\bcli_[A-Za-z0-9]{8,}\b/,
  /\b(?:tbl|rec|view|fld)(?=[A-Za-z0-9_-]{8,}\b)(?=[A-Za-z0-9_-]*[A-Z0-9])[A-Za-z0-9_-]+\b/,
]);

const emptyReport = () => ({
  profile_name_exists: null,
  profile_application_binding_check: "not_performed",
  cli_version: null,
  auth_command_count: 0,
  api_call_count: 0,
  write_command_count: 0,
});

function exactArgs(actual, expected) {
  return Array.isArray(actual)
    && actual.length === expected.length
    && actual.every((value, index) => value === expected[index]);
}

function isAllowedCommand(args) {
  return exactArgs(args, VERSION_ARGS) || exactArgs(args, PROFILE_LIST_ARGS);
}

function decodeOutput(value) {
  if (typeof value === "string") return value;
  if (!Buffer.isBuffer(value)) return null;
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(value);
  } catch {
    return null;
  }
}

function containsSensitiveOutput(text) {
  return SENSITIVE_OUTPUT_PATTERNS.some((pattern) => pattern.test(text));
}

function assessAttempt(attempt) {
  if (attempt === null || typeof attempt !== "object" || Array.isArray(attempt)) return null;

  const stdout = decodeOutput(attempt.stdout);
  const stderr = decodeOutput(attempt.stderr);
  if (stdout === null || stderr === null) return null;
  if (Buffer.byteLength(stdout) > PREFLIGHT_MAX_OUTPUT_BYTES
    || Buffer.byteLength(stderr) > PREFLIGHT_MAX_OUTPUT_BYTES) return null;

  const combined = `${stdout}\n${stderr}`;
  if (containsSensitiveOutput(combined)) return null;
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/u.test(combined)) return null;
  if (stderr.trim() !== "") return null;
  if (attempt.processError === true || attempt.exitCode !== 0) return null;

  return { stdout };
}

function parseVersion(stdout) {
  const match = /^lark-cli version (\d+\.\d+\.\d+)\s*$/.exec(stdout);
  return match?.[1] ?? null;
}

function containsExactProfile(stdout) {
  if (stdout.trim() === "") return null;
  const escaped = TARGET_PROFILE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|[^A-Za-z0-9_-])${escaped}(?=$|[^A-Za-z0-9_-])`, "m").test(stdout);
}

function createLarkCliRunner({ executable = "lark-cli" } = {}) {
  return (args) => new Promise((resolve) => {
    if (!isAllowedCommand(args)) {
      resolve({ processError: true, exitCode: null, stdout: Buffer.alloc(0), stderr: Buffer.alloc(0) });
      return;
    }

    execFile(executable, args, {
      encoding: "buffer",
      timeout: PREFLIGHT_TIMEOUT_MS,
      maxBuffer: PREFLIGHT_MAX_OUTPUT_BYTES,
      windowsHide: true,
      shell: false,
    }, (error, stdout, stderr) => {
      resolve({
        processError: error !== null,
        exitCode: error === null ? 0 : (typeof error.code === "number" ? error.code : null),
        stdout: stdout ?? Buffer.alloc(0),
        stderr: stderr ?? Buffer.alloc(0),
      });
    });
  });
}

export function serializePreflightReport(report) {
  const candidate = report !== null && typeof report === "object" && !Array.isArray(report)
    ? report
    : emptyReport();
  const safe = emptyReport();

  safe.profile_name_exists = typeof candidate.profile_name_exists === "boolean" ? candidate.profile_name_exists : null;
  safe.cli_version = typeof candidate.cli_version === "string" && /^\d+\.\d+\.\d+$/.test(candidate.cli_version)
    ? candidate.cli_version
    : null;

  return JSON.stringify(Object.fromEntries(SAFE_REPORT_KEYS.map((key) => [key, safe[key]])), null, 2);
}

export async function runLarkCliPreflight({ runCommand = createLarkCliRunner() } = {}) {
  const report = emptyReport();

  try {
    const versionAttempt = assessAttempt(await runCommand([...VERSION_ARGS]));
    if (versionAttempt === null) return { exitCode: 1, report };

    const version = parseVersion(versionAttempt.stdout);
    if (version === null) return { exitCode: 1, report };
    report.cli_version = version;
    if (version !== EXPECTED_CLI_VERSION) return { exitCode: 1, report };

    const profileAttempt = assessAttempt(await runCommand([...PROFILE_LIST_ARGS]));
    if (profileAttempt === null) return { exitCode: 1, report };

    const profileExists = containsExactProfile(profileAttempt.stdout);
    if (profileExists === null) return { exitCode: 1, report };
    report.profile_name_exists = profileExists;

    return { exitCode: profileExists ? 0 : 2, report };
  } catch {
    return { exitCode: 1, report };
  }
}

async function main() {
  if (process.argv.length !== 2) {
    process.stdout.write(`${serializePreflightReport(emptyReport())}\n`);
    process.exitCode = 1;
    return;
  }

  const result = await runLarkCliPreflight();
  process.stdout.write(`${serializePreflightReport(result.report)}\n`);
  process.exitCode = result.exitCode;
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isCli) {
  main().catch(() => {
    process.stdout.write(`${serializePreflightReport(emptyReport())}\n`);
    process.exitCode = 1;
  });
}
