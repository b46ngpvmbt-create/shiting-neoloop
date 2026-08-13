import test from "node:test";
import assert from "node:assert/strict";

import {
  EXPECTED_CLI_VERSION,
  PREFLIGHT_MAX_OUTPUT_BYTES,
  runLarkCliPreflight,
  serializePreflightReport,
} from "../../feishu/scripts/check-lark-cli-preflight.mjs";

const safeReport = (profileExists, cliVersion = EXPECTED_CLI_VERSION) => ({
  profile_name_exists: profileExists,
  profile_application_binding_check: "not_performed",
  cli_version: cliVersion,
  auth_command_count: 0,
  api_call_count: 0,
  write_command_count: 0,
});

function fakeCli(responses) {
  const calls = [];
  const runCommand = async (args) => {
    calls.push([...args]);
    const key = args.join(" ");
    const response = responses[key];
    if (response instanceof Error) throw response;
    if (response === undefined) throw new Error("unexpected fake CLI command");
    return {
      processError: false,
      exitCode: 0,
      stdout: "",
      stderr: "",
      ...response,
    };
  };
  return { calls, runCommand };
}

test("preflight confirms only the exact profile name and leaves application binding unverified", async () => {
  const cli = fakeCli({
    "--version": { stdout: `lark-cli version ${EXPECTED_CLI_VERSION}\n` },
    "profile list": { stdout: "Profiles\n* neoloop-r10-probe\n  unrelated-profile\n" },
  });

  const result = await runLarkCliPreflight({ runCommand: cli.runCommand });

  assert.equal(result.exitCode, 0);
  assert.deepEqual(result.report, safeReport(true));
  assert.equal(result.report.profile_application_binding_check, "not_performed");
  assert.deepEqual(cli.calls, [["--version"], ["profile", "list"]]);
  assert.deepEqual(Object.keys(result.report), [
    "profile_name_exists",
    "profile_application_binding_check",
    "cli_version",
    "auth_command_count",
    "api_call_count",
    "write_command_count",
  ]);
});

test("preflight returns init-required when the exact target profile name is absent", async () => {
  const cli = fakeCli({
    "--version": { stdout: `lark-cli version ${EXPECTED_CLI_VERSION}\n` },
    "profile list": { stdout: "Profiles\n* unrelated-profile\n  neoloop-r10-probe-shadow\n" },
  });

  const result = await runLarkCliPreflight({ runCommand: cli.runCommand });

  assert.equal(result.exitCode, 2);
  assert.deepEqual(result.report, safeReport(false));
  assert.deepEqual(cli.calls, [["--version"], ["profile", "list"]]);
});

test("version drift fails closed before profile inspection", async () => {
  const cli = fakeCli({
    "--version": { stdout: "lark-cli version 1.0.85\n" },
  });

  const result = await runLarkCliPreflight({ runCommand: cli.runCommand });

  assert.equal(result.exitCode, 1);
  assert.deepEqual(result.report, safeReport(null, "1.0.85"));
  assert.deepEqual(cli.calls, [["--version"]]);
});

test("a missing CLI fails closed without echoing the process error", async () => {
  const sentinel = "SYN-SENSITIVE-PROCESS-DETAIL";
  const cli = fakeCli({
    "--version": new Error(sentinel),
  });

  const result = await runLarkCliPreflight({ runCommand: cli.runCommand });
  const serialized = serializePreflightReport(result.report);

  assert.equal(result.exitCode, 1);
  assert.deepEqual(result.report, safeReport(null, null));
  assert.equal(serialized.includes(sentinel), false);
  assert.deepEqual(cli.calls, [["--version"]]);
});

test("sensitive profile output fails closed and cannot enter the serialized report", async () => {
  const sentinel = "SYN-SENSITIVE-VALUE";
  const cli = fakeCli({
    "--version": { stdout: `lark-cli version ${EXPECTED_CLI_VERSION}\n` },
    "profile list": { stdout: `Profiles\nneoloop-r10-probe\naccess_token=${sentinel}\n` },
  });

  const result = await runLarkCliPreflight({ runCommand: cli.runCommand });
  const serialized = serializePreflightReport(result.report);

  assert.equal(result.exitCode, 1);
  assert.deepEqual(result.report, safeReport(null));
  assert.equal(serialized.includes(sentinel), false);
  assert.equal(serialized.includes("access_token"), false);
});

test("sensitive or malformed version output fails before profile inspection", async (t) => {
  const fixtures = [
    ["sensitive", `lark-cli version ${EXPECTED_CLI_VERSION}\ndevice_code=SYN-SENSITIVE-VALUE\n`],
    ["malformed", `version ${EXPECTED_CLI_VERSION}\n`],
  ];

  for (const [name, stdout] of fixtures) {
    await t.test(name, async () => {
      const cli = fakeCli({ "--version": { stdout } });

      const result = await runLarkCliPreflight({ runCommand: cli.runCommand });

      assert.equal(result.exitCode, 1);
      assert.deepEqual(result.report, safeReport(null, null));
      assert.deepEqual(cli.calls, [["--version"]]);
    });
  }
});

test("stderr, nonzero exit, empty profile output, and oversized output all fail closed", async (t) => {
  const fixtures = [
    ["stderr", { stderr: "unexpected diagnostic" }],
    ["nonzero", { processError: true, exitCode: 7 }],
    ["empty", { stdout: "" }],
    ["oversized", { stdout: "x".repeat(PREFLIGHT_MAX_OUTPUT_BYTES + 1) }],
  ];

  for (const [name, profileResponse] of fixtures) {
    await t.test(name, async () => {
      const cli = fakeCli({
        "--version": { stdout: `lark-cli version ${EXPECTED_CLI_VERSION}\n` },
        "profile list": profileResponse,
      });

      const result = await runLarkCliPreflight({ runCommand: cli.runCommand });

      assert.equal(result.exitCode, 1);
      assert.deepEqual(result.report, safeReport(null));
      assert.deepEqual(cli.calls, [["--version"], ["profile", "list"]]);
    });
  }
});

test("serializer exposes only the fixed redacted schema", () => {
  const serialized = serializePreflightReport({
    ...safeReport(true),
    profile_application_binding_check: "verified",
    raw_output: "must-not-appear",
    app_secret: "must-not-appear",
    cli_version: "not-a-semver",
    auth_command_count: 99,
  });

  assert.deepEqual(JSON.parse(serialized), safeReport(true, null));
  assert.equal(serialized.includes("must-not-appear"), false);
  assert.equal(serialized.includes("app_secret"), false);
  assert.equal(serialized.includes("raw_output"), false);
  assert.equal(serialized.includes("verified"), false);
});
