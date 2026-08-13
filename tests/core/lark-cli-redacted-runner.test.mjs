import test from "node:test";
import assert from "node:assert/strict";

import {
  EXPECTED_LARK_CLI_VERSION,
  FIXED_LARK_CLI_PROFILE,
  P12_RUNNER_MAX_OUTPUT_BYTES,
  P12_TARGET_SCOPE,
  runRedactedP12LiveProbe,
} from "../../feishu/scripts/lib/lark-cli-redacted-runner.mjs";

const BASE_ENTRY_URL = "https://larkcommunity.feishu.cn/base/bascnPrivate?table=tblPrivate";
const WIKI_ENTRY_URL = "https://larkcommunity.feishu.cn/wiki/wikicnPrivate?table=tblPrivate";
const DIRECT_BASE_TOKEN = "bascnPrivate";
const BUSINESS_ID = "SYN-CLUSTER-P12-001";
const PRIVATE_BASE_TOKEN = "bascnPrivateLocator";
const PRIVATE_RECORD_ID = "recPrivateLocator";

const json = (value) => `${JSON.stringify(value)}\n`;

const gateResponses = () => [
  { stdout: `lark-cli version ${EXPECTED_LARK_CLI_VERSION}\n` },
  { stdout: json({ identity: "user", verified: true, appId: "cli_private_app" }) },
  { stdout: json({ ok: true, granted: [P12_TARGET_SCOPE], missing: null }) },
];

const urlResolutionResponse = ({ inputType = "wiki_url" } = {}) => ({
  stdout: json({
    ok: true,
    identity: "user",
    data: {
      input_type: inputType,
      resource_type: "bitable",
      base_token: PRIVATE_BASE_TOKEN,
      table_id: "tblIgnoredPrivateLocator",
    },
  }),
});

const listResponse = (items) => ({
  stdout: json({ ok: true, identity: "user", data: { items } }),
});

const responsesFor = (items) => [
  ...gateResponses(),
  listResponse(items),
  ...(items.length === 1 ? [listResponse([])] : []),
];

function fakeProcess(responses) {
  const calls = [];
  const executeProcess = async (executable, args, options) => {
    calls.push({ executable, args: [...args], options: { ...options } });
    const next = responses[calls.length - 1];
    if (next instanceof Error) throw next;
    if (next === undefined) throw new Error("unexpected process call");
    return {
      exitCode: 0,
      processError: false,
      timedOut: false,
      stdout: "",
      stderr: "",
      ...next,
    };
  };
  return { calls, executeProcess };
}

const runInput = (overrides = {}) => ({
  baseEntryUrl: BASE_ENTRY_URL,
  target: "clusters",
  businessId: BUSINESS_ID,
  ...overrides,
});

const safeCounters = (overrides = {}) => ({
  cli_command_count: 5,
  auth_command_count: 2,
  base_read_command_count: 2,
  discovery_read_count: 0,
  zero_match_check_count: 1,
  business_write_count: 0,
  ...overrides,
});

test("direct Base entry derives its token locally and never invokes URL resolution", async () => {
  const cli = fakeProcess([
    ...gateResponses(),
    listResponse([{ record_id: PRIVATE_RECORD_ID, fields: { cluster_id: BUSINESS_ID } }]),
    listResponse([]),
  ]);

  const report = await runRedactedP12LiveProbe({
    ...runInput(),
    executeProcess: cli.executeProcess,
  });

  assert.deepEqual(report, {
    hit_count: 1,
    classification: "exact_single_match",
    counters: safeCounters({
      cli_command_count: 5,
      base_read_command_count: 2,
    }),
    issue_codes: [],
  });
  assert.equal(cli.calls.length, 5);
  assert.equal(cli.calls.some(({ args }) => args.includes("+url-resolve")), false);
  const exactArgs = cli.calls[3].args;
  assert.equal(exactArgs[exactArgs.indexOf("--base-token") + 1], DIRECT_BASE_TOKEN);
  const serialized = JSON.stringify(report);
  for (const privateValue of [
    BASE_ENTRY_URL,
    DIRECT_BASE_TOKEN,
    PRIVATE_RECORD_ID,
    BUSINESS_ID,
  ]) {
    assert.equal(serialized.includes(privateValue), false);
  }
});

test("live runner executes only the fixed version, auth gates and direct record lists", async () => {
  const cli = fakeProcess(responsesFor([
    { record_id: PRIVATE_RECORD_ID, fields: { cluster_id: BUSINESS_ID } },
  ]));

  const report = await runRedactedP12LiveProbe({
    ...runInput(),
    executeProcess: cli.executeProcess,
  });

  assert.deepEqual(report, {
    hit_count: 1,
    classification: "exact_single_match",
    counters: safeCounters(),
    issue_codes: [],
  });
  const calls = cli.calls.map(({ args }) => args);
  assert.deepEqual(calls.slice(0, 4), [
    ["--version"],
    ["--profile", FIXED_LARK_CLI_PROFILE, "auth", "status", "--json", "--verify"],
    ["--profile", FIXED_LARK_CLI_PROFILE, "auth", "check", "--scope", P12_TARGET_SCOPE, "--json"],
    [
      "--profile", FIXED_LARK_CLI_PROFILE,
      "base", "+record-list",
      "--base-token", DIRECT_BASE_TOKEN,
      "--table-id", "SYN_Clusters",
      "--field-id", "cluster_id",
      "--filter-json", JSON.stringify({ logic: "and", conditions: [["cluster_id", "==", BUSINESS_ID]] }),
      "--limit", "2",
      "--as", "user",
      "--format", "json",
    ],
  ]);
  assert.equal(calls.length, 5);
  assert.deepEqual(calls[4].slice(0, 11), [
    "--profile", FIXED_LARK_CLI_PROFILE,
    "base", "+record-list",
    "--base-token", DIRECT_BASE_TOKEN,
    "--table-id", "SYN_Clusters",
    "--field-id", "cluster_id",
    "--filter-json",
  ]);
  const missFilter = JSON.parse(calls[4][11]);
  assert.equal(missFilter.logic, "and");
  assert.equal(missFilter.conditions[0][0], "cluster_id");
  assert.equal(missFilter.conditions[0][1], "==");
  assert.match(missFilter.conditions[0][2], /^SYN-CLUSTER-P12-MISS-[A-F0-9]+$/);
  assert.notEqual(missFilter.conditions[0][2], BUSINESS_ID);
  for (const { executable, options } of cli.calls) {
    assert.equal(executable, "lark-cli");
    assert.equal(options.shell, false);
    assert.equal(options.windowsHide, true);
    assert.equal(options.maxBuffer, P12_RUNNER_MAX_OUTPUT_BYTES);
    assert.equal(Number.isInteger(options.timeout) && options.timeout > 0, true);
  }
  const allArgs = cli.calls.flatMap(({ args }) => args);
  assert.equal(allArgs.includes("scopes"), false);
  assert.equal(allArgs.includes("+url-resolve"), false);
  assert.equal(allArgs.includes(BASE_ENTRY_URL), false);
  assert.equal(allArgs.some((value) => /create|update|delete|upsert|batch|api/i.test(value)), false);
  assert.equal(JSON.stringify(report).includes(DIRECT_BASE_TOKEN), false);
  assert.equal(JSON.stringify(report).includes("tblIgnoredPrivateLocator"), false);
  assert.equal(JSON.stringify(report).includes(PRIVATE_RECORD_ID), false);
  assert.equal(JSON.stringify(report).includes(BUSINESS_ID), false);
  assert.equal(JSON.stringify(report).includes("P12-MISS"), false);
  assert.deepEqual(Object.keys(report), ["hit_count", "classification", "counters", "issue_codes"]);
});

test("0, 1 and 2 exact matches produce resolver-compatible classifications without writes", async (t) => {
  for (const [count, expected] of [
    [0, "projection_conflict"],
    [1, "exact_single_match"],
    [2, "projection_conflict"],
  ]) {
    await t.test(`${count} hit`, async () => {
      const items = Array.from({ length: count }, (_, index) => ({
        record_id: `${PRIVATE_RECORD_ID}${index}`,
        fields: { cluster_id: BUSINESS_ID },
      }));
      const cli = fakeProcess(responsesFor(items));

      const report = await runRedactedP12LiveProbe({ ...runInput(), executeProcess: cli.executeProcess });

      assert.equal(report.hit_count, count);
      assert.equal(report.classification, expected);
      assert.equal(report.counters.business_write_count, 0);
      assert.equal(report.counters.zero_match_check_count, count === 1 ? 1 : 0);
      assert.deepEqual(report.issue_codes, []);
      assert.equal(cli.calls.some(({ args }) => args.includes("+url-resolve")), false);
      const listArgs = cli.calls[3].args;
      assert.equal(listArgs[listArgs.indexOf("--base-token") + 1], DIRECT_BASE_TOKEN);
    });
  }
});

test("improvement target derives the only allowed business field and exact synthetic prefix", async () => {
  const improvementId = "SYN-IMPROVEMENT-P12-001";
  const cli = fakeProcess(responsesFor([
    { record_id: PRIVATE_RECORD_ID, fields: { improvement_id: improvementId } },
  ]));

  const report = await runRedactedP12LiveProbe({
    ...runInput({ target: "improvements", businessId: improvementId }),
    executeProcess: cli.executeProcess,
  });

  assert.equal(report.classification, "exact_single_match");
  const args = cli.calls[3].args;
  assert.equal(args[args.indexOf("--table-id") + 1], "SYN_Improvements");
  assert.equal(args[args.indexOf("--field-id") + 1], "improvement_id");
  assert.equal(args[args.indexOf("--filter-json") + 1], JSON.stringify({
    logic: "and",
    conditions: [["improvement_id", "==", improvementId]],
  }));
});

test("null business key uses one projection-only discovery, then exact one-hit and internal zero-hit", async () => {
  const cli = fakeProcess([
    ...gateResponses(),
    listResponse([{ record_id: PRIVATE_RECORD_ID, fields: { cluster_id: BUSINESS_ID } }]),
    listResponse([{ record_id: PRIVATE_RECORD_ID, fields: { cluster_id: BUSINESS_ID } }]),
    listResponse([]),
  ]);

  const report = await runRedactedP12LiveProbe({
    ...runInput({ businessId: null }),
    executeProcess: cli.executeProcess,
  });

  assert.equal(report.classification, "exact_single_match");
  assert.deepEqual(report.counters, safeCounters({
    cli_command_count: 6,
    base_read_command_count: 3,
    discovery_read_count: 1,
  }));
  const discoveryArgs = cli.calls[3].args;
  assert.equal(discoveryArgs.includes("--filter-json"), false);
  assert.equal(discoveryArgs[discoveryArgs.indexOf("--table-id") + 1], "SYN_Clusters");
  assert.equal(discoveryArgs[discoveryArgs.indexOf("--field-id") + 1], "cluster_id");
  assert.equal(discoveryArgs[discoveryArgs.indexOf("--limit") + 1], "2");
  const exactArgs = cli.calls[4].args;
  assert.equal(exactArgs[exactArgs.indexOf("--filter-json") + 1], JSON.stringify({
    logic: "and",
    conditions: [["cluster_id", "==", BUSINESS_ID]],
  }));
  assert.equal(JSON.stringify(report).includes(BUSINESS_ID), false);
});

test("discovery cardinality 0 or 2 stops before any exact query", async (t) => {
  for (const count of [0, 2]) {
    await t.test(String(count), async () => {
      const items = Array.from({ length: count }, (_, index) => ({
        record_id: `${PRIVATE_RECORD_ID}${index}`,
        fields: { cluster_id: `${BUSINESS_ID}-${index}` },
      }));
      const cli = fakeProcess([...gateResponses(), listResponse(items)]);

      const report = await runRedactedP12LiveProbe({
        ...runInput({ businessId: null }),
        executeProcess: cli.executeProcess,
      });

      assert.equal(report.classification, "projection_dependency_failure");
      assert.deepEqual(report.issue_codes, ["discovery_cardinality_invalid"]);
      assert.equal(report.counters.discovery_read_count, 1);
      assert.equal(report.counters.zero_match_check_count, 0);
      assert.equal(cli.calls.length, 4);
    });
  }
});

test("each live attempt reruns status and the one exact scope check", async () => {
  const cli = fakeProcess([...responsesFor([]), ...responsesFor([])]);

  await runRedactedP12LiveProbe({ ...runInput(), executeProcess: cli.executeProcess });
  await runRedactedP12LiveProbe({ ...runInput(), executeProcess: cli.executeProcess });

  const calls = cli.calls.map(({ args }) => args.join(" "));
  assert.equal(calls.filter((value) => value.includes("auth status --json --verify")).length, 2);
  assert.equal(calls.filter((value) => value.includes(`auth check --scope ${P12_TARGET_SCOPE} --json`)).length, 2);
  assert.equal(calls.some((value) => value.includes("auth scopes")), false);
});

test("version, user verification and exact scope gates stop before Base reads", async (t) => {
  const cases = [
    {
      name: "version drift",
      responses: [{ stdout: "lark-cli version 1.0.85\n" }],
      calls: 1,
      issue: "cli_version_mismatch",
    },
    {
      name: "user unverified",
      responses: [
        { stdout: `lark-cli version ${EXPECTED_LARK_CLI_VERSION}\n` },
        { stdout: json({ identity: "user", verified: false, appId: "cli_private_app" }) },
      ],
      calls: 2,
      issue: "auth_user_unverified",
    },
    {
      name: "scope missing",
      responses: [
        { stdout: `lark-cli version ${EXPECTED_LARK_CLI_VERSION}\n` },
        { stdout: json({ identity: "user", verified: true, appId: "cli_private_app" }) },
        { exitCode: 1, processError: true, stdout: json({ ok: false, granted: [], missing: [P12_TARGET_SCOPE] }) },
      ],
      calls: 3,
      issue: "auth_scope_missing",
    },
  ];

  for (const fixture of cases) {
    await t.test(fixture.name, async () => {
      const cli = fakeProcess(fixture.responses);
      const report = await runRedactedP12LiveProbe({ ...runInput(), executeProcess: cli.executeProcess });

      assert.equal(report.classification, "projection_dependency_failure");
      assert.equal(report.hit_count, null);
      assert.deepEqual(report.issue_codes, [fixture.issue]);
      assert.equal(cli.calls.length, fixture.calls);
      assert.equal(report.counters.base_read_command_count, 0);
      assert.equal(report.counters.business_write_count, 0);
    });
  }
});

test("case target derives the fixed table and field without accepting a locator", async () => {
  const caseId = "SYN-CASE-P12-001";
  const cli = fakeProcess(responsesFor([
    { record_id: PRIVATE_RECORD_ID, fields: { case_id: caseId } },
  ]));

  const report = await runRedactedP12LiveProbe({
    ...runInput({ target: "cases", businessId: caseId }),
    executeProcess: cli.executeProcess,
  });

  assert.equal(report.classification, "exact_single_match");
  const args = cli.calls[3].args;
  assert.equal(args[args.indexOf("--table-id") + 1], "SYN_Cases");
  assert.equal(args[args.indexOf("--field-id") + 1], "case_id");
});

test("an approved Wiki entry resolves through the same redacted read-only path", async () => {
  const cli = fakeProcess([
    ...gateResponses(),
    urlResolutionResponse({ inputType: "wiki_url" }),
    listResponse([{ record_id: PRIVATE_RECORD_ID, fields: { cluster_id: BUSINESS_ID } }]),
    listResponse([]),
  ]);

  const report = await runRedactedP12LiveProbe({
    ...runInput({ baseEntryUrl: WIKI_ENTRY_URL }),
    executeProcess: cli.executeProcess,
  });

  assert.equal(report.classification, "exact_single_match");
  assert.deepEqual(report.issue_codes, []);
  assert.deepEqual(report.counters, safeCounters({
    cli_command_count: 6,
    base_read_command_count: 3,
  }));
  assert.equal(cli.calls[3].args[cli.calls[3].args.indexOf("--url") + 1], WIKI_ENTRY_URL);
  const serialized = JSON.stringify(report);
  for (const privateValue of [
    WIKI_ENTRY_URL,
    PRIVATE_BASE_TOKEN,
    PRIVATE_RECORD_ID,
    BUSINESS_ID,
  ]) {
    assert.equal(serialized.includes(privateValue), false);
  }
});

test("unknown URL resolution types and Wiki dependency failures stop without scope expansion", async (t) => {
  await t.test("unknown input type", async () => {
    const cli = fakeProcess([
      ...gateResponses(),
      urlResolutionResponse({ inputType: "doc_url" }),
    ]);
    const report = await runRedactedP12LiveProbe({
      ...runInput({ baseEntryUrl: WIKI_ENTRY_URL }),
      executeProcess: cli.executeProcess,
    });

    assert.deepEqual(report.issue_codes, ["url_resolution_invalid"]);
    assert.equal(cli.calls.length, 4);
  });

  await t.test("Wiki resolver permission failure", async () => {
    const cli = fakeProcess([
      ...gateResponses(),
      {
        exitCode: 1,
        processError: true,
        stdout: json({ ok: false, code: 99991672 }),
      },
    ]);
    const report = await runRedactedP12LiveProbe({
      ...runInput({ baseEntryUrl: WIKI_ENTRY_URL }),
      executeProcess: cli.executeProcess,
    });

    assert.deepEqual(report.issue_codes, ["command_failed"]);
    assert.equal(cli.calls.length, 4);
    assert.equal(cli.calls.some(({ args }) => args.includes("scopes")), false);
    assert.equal(report.counters.auth_command_count, 2);
    assert.equal(report.counters.base_read_command_count, 1);
  });
});

test("unknown targets, non-synthetic IDs and invalid Base entry URLs fail before any command", async (t) => {
  const fixtures = [
    runInput({ target: "vehicles" }),
    runInput({ businessId: "REAL-CLUSTER-001" }),
    runInput({ baseEntryUrl: undefined, directBaseUrl: BASE_ENTRY_URL }),
    runInput({ baseEntryUrl: "http://larkcommunity.feishu.cn/base/bascnPrivate?table=tblPrivate" }),
    runInput({ baseEntryUrl: "https://example.invalid/base/bascnPrivate?table=tblPrivate" }),
    runInput({ baseEntryUrl: "https://user@larkcommunity.feishu.cn/base/bascnPrivate?table=tblPrivate" }),
    runInput({ baseEntryUrl: "https://larkcommunity.feishu.cn:8443/base/bascnPrivate?table=tblPrivate" }),
    runInput({ baseEntryUrl: "https://larkcommunity.feishu.cn/Base/bascnPrivate?table=tblPrivate" }),
    runInput({ baseEntryUrl: "https://larkcommunity.feishu.cn/base/bascnPrivate%2Fhidden?table=tblPrivate" }),
    runInput({ baseEntryUrl: "https://larkcommunity.feishu.cn/base/bascnPrivate/?table=tblPrivate" }),
    runInput({ baseEntryUrl: "https://larkcommunity.feishu.cn/base/bascnPrivate?table=one&table=two" }),
    runInput({ baseEntryUrl: "https://larkcommunity.feishu.cn/base/bascnPrivate?table=tblPrivate&view=oneView&view=twoViews" }),
    runInput({ baseEntryUrl: "https://larkcommunity.feishu.cn/base/bascnPrivate?table=tblPrivate&extra=value" }),
    runInput({ baseEntryUrl: "https://larkcommunity.feishu.cn/wiki/wikicnPrivate" }),
    runInput({ baseEntryUrl: "https://larkcommunity.feishu.cn/base/bascnPrivate?record=recPrivate" }),
    runInput({ baseEntryUrl: "https://larkcommunity.feishu.cn/wiki/wikicnPrivate?table=one&table=two" }),
    runInput({ baseEntryUrl: "https://larkcommunity.feishu.cn/wiki/wikicnPrivate?table=tblPrivate&view=oneView&view=twoViews" }),
    runInput({ baseEntryUrl: "https://larkcommunity.feishu.cn/wiki/wikicnPrivate?table=tblPrivate&extra=value" }),
    runInput({ baseEntryUrl: "https://larkcommunity.feishu.cn/wiki/wikicnPrivate?table=tblPrivate#fragment" }),
  ];

  for (const fixture of fixtures) {
    await t.test(JSON.stringify(Object.keys(fixture)), async () => {
      const cli = fakeProcess([]);
      const report = await runRedactedP12LiveProbe({ ...fixture, executeProcess: cli.executeProcess });

      assert.equal(report.classification, "projection_dependency_failure");
      assert.deepEqual(report.issue_codes, ["input_contract_invalid"]);
      assert.equal(report.counters.cli_command_count, 0);
      assert.equal(cli.calls.length, 0);
    });
  }
});

test("unknown, duplicate-key, oversized and invalid UTF-8 provider output fail closed without raw leakage", async (t) => {
  const sentinel = "SYN-SENSITIVE-PROVIDER-RAW";
  const badOutputs = [
    `{"identity":"user","verified":true,"verified":false,"raw":"${sentinel}"}`,
    "x".repeat(P12_RUNNER_MAX_OUTPUT_BYTES + 1),
    Buffer.from([0xc3, 0x28]),
    json({ identity: "user", verified: true, access_token: sentinel }),
    json({ identity: "user", verified: true, clientSecret: sentinel }),
  ];

  for (const stdout of badOutputs) {
    await t.test(Buffer.isBuffer(stdout) ? "invalid utf8" : String(stdout.length), async () => {
      const cli = fakeProcess([
        { stdout: `lark-cli version ${EXPECTED_LARK_CLI_VERSION}\n` },
        { stdout },
      ]);
      const report = await runRedactedP12LiveProbe({ ...runInput(), executeProcess: cli.executeProcess });
      const serialized = JSON.stringify(report);

      assert.equal(report.classification, "projection_dependency_failure");
      assert.deepEqual(report.issue_codes, ["provider_output_unsafe"]);
      assert.equal(serialized.includes(sentinel), false);
      assert.equal(serialized.includes("access_token"), false);
      assert.equal(cli.calls.length, 2);
    });
  }
});

test("a timeout is not retried and raw stderr is never returned", async () => {
  const sentinel = "SYN-PRIVATE-UPSTREAM-ERROR";
  const cli = fakeProcess([{
    exitCode: null,
    processError: true,
    timedOut: true,
    stderr: sentinel,
  }]);

  const report = await runRedactedP12LiveProbe({ ...runInput(), executeProcess: cli.executeProcess });

  assert.equal(cli.calls.length, 1);
  assert.deepEqual(report.issue_codes, ["command_timeout"]);
  assert.equal(JSON.stringify(report).includes(sentinel), false);
  assert.equal(report.counters.business_write_count, 0);
});

test("record output must contain at most two exact projected business-key matches", async (t) => {
  const fixtures = [
    [{ record_id: PRIVATE_RECORD_ID, fields: { cluster_id: "SYN-CLUSTER-WRONG" } }],
    [{ record_id: PRIVATE_RECORD_ID, fields: { cluster_id: BUSINESS_ID, unexpected: "value" } }],
    Array.from({ length: 3 }, (_, index) => ({
      record_id: `${PRIVATE_RECORD_ID}${index}`,
      fields: { cluster_id: BUSINESS_ID },
    })),
  ];

  for (const items of fixtures) {
    await t.test(String(items.length), async () => {
      const cli = fakeProcess(responsesFor(items));
      const report = await runRedactedP12LiveProbe({ ...runInput(), executeProcess: cli.executeProcess });

      assert.equal(report.classification, "projection_dependency_failure");
      assert.deepEqual(report.issue_codes, ["record_result_invalid"]);
      assert.equal(report.counters.business_write_count, 0);
    });
  }
});

test("record pagination cannot be hidden behind a one-item response", async () => {
  const cli = fakeProcess([
    ...gateResponses(),
    {
      stdout: json({
        ok: true,
        identity: "user",
        data: {
          has_more: true,
          items: [{ record_id: PRIVATE_RECORD_ID, fields: { cluster_id: BUSINESS_ID } }],
        },
      }),
    },
  ]);

  const report = await runRedactedP12LiveProbe({ ...runInput(), executeProcess: cli.executeProcess });

  assert.equal(report.classification, "projection_dependency_failure");
  assert.deepEqual(report.issue_codes, ["record_result_invalid"]);
  assert.equal(report.counters.zero_match_check_count, 0);
});

test("the internal zero-match check fails closed if the miss unexpectedly resolves", async () => {
  const cli = fakeProcess([
    ...gateResponses(),
    listResponse([{ record_id: PRIVATE_RECORD_ID, fields: { cluster_id: BUSINESS_ID } }]),
    listResponse([{ record_id: "recUnexpected", fields: { cluster_id: "SYN-CLUSTER-P12-MISS-UNEXPECTED" } }]),
  ]);

  const report = await runRedactedP12LiveProbe({ ...runInput(), executeProcess: cli.executeProcess });

  assert.equal(report.classification, "projection_dependency_failure");
  assert.deepEqual(report.issue_codes, ["zero_match_check_failed"]);
  assert.equal(report.counters.zero_match_check_count, 1);
  assert.equal(report.counters.business_write_count, 0);
  assert.equal(JSON.stringify(report).includes("recUnexpected"), false);
  assert.equal(JSON.stringify(report).includes("P12-MISS"), false);
});
