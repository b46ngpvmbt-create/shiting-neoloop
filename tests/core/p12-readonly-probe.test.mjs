import test from "node:test";
import assert from "node:assert/strict";
import {
  chmodSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  renameSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  LOCAL_INPUT_MAX_BYTES,
  initializeP12LocalInput,
  parseP12CliArgs,
  runP12ReadonlyProbe,
  serializeP12InitReport,
  serializeP12Report,
} from "../../feishu/scripts/run-p12-readonly-probe.mjs";

const BASE_ENTRY_URL = "https://larkcommunity.feishu.cn/base/bascnPrivate?table=tblPrivate";
const WIKI_ENTRY_URL = "https://larkcommunity.feishu.cn/wiki/wikicnPrivate?table=tblPrivate";
const BUSINESS_ID = "SYN-CLUSTER-P12-001";

const mapping = (overrides = {}) => ({
  schema_version: "neoloop.p12.mapping.v1",
  data_scope: "synthetic_experiment",
  auth_mode: "user_readonly",
  approved_base_entry_url: BASE_ENTRY_URL,
  ...overrides,
});

const filter = (overrides = {}) => ({
  schema_version: "neoloop.p12.filter.v1",
  target: "clusters",
  business_id: BUSINESS_ID,
  ...overrides,
});

async function fixture(t, { mappingValue = mapping(), filterValue = filter() } = {}) {
  const root = await mkdtemp(join(tmpdir(), "neoloop-p12-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const configDir = join(root, "feishu", "config");
  mkdirSync(configDir, { recursive: true });
  const mappingPath = join(configDir, "p12-mapping.local.json");
  const filterPath = join(configDir, "p12-filter.local.json");
  writeFileSync(mappingPath, typeof mappingValue === "string" ? mappingValue : JSON.stringify(mappingValue));
  writeFileSync(filterPath, typeof filterValue === "string" ? filterValue : JSON.stringify(filterValue));
  chmodSync(mappingPath, 0o600);
  chmodSync(filterPath, 0o600);
  return { root, configDir, mappingPath, filterPath };
}

const ignored = async () => true;

const zeroCounters = () => ({
  cli_command_count: 0,
  auth_command_count: 0,
  base_read_command_count: 0,
  discovery_read_count: 0,
  zero_match_check_count: 0,
  business_write_count: 0,
});

test("default plan validates private inputs without invoking CLI or OpenAPI", async (t) => {
  const files = await fixture(t);
  let liveCalls = 0;

  const result = await runP12ReadonlyProbe({
    mappingPath: files.mappingPath,
    filterPath: files.filterPath,
    repoRoot: files.root,
    checkIgnored: ignored,
    runLiveProbe: async () => {
      liveCalls += 1;
      throw new Error("must not run");
    },
  });

  assert.equal(result.exitCode, 0);
  assert.equal(liveCalls, 0);
  assert.deepEqual(result.report, {
    hit_count: null,
    classification: "plan_ready",
    counters: zeroCounters(),
    issue_codes: [],
  });
});

test("live mode is explicit and passes private values only in memory to the redacted runner", async (t) => {
  const files = await fixture(t);
  let privateInput = null;
  const expected = {
    hit_count: 1,
    classification: "exact_single_match",
    counters: {
      cli_command_count: 6,
      auth_command_count: 2,
      base_read_command_count: 3,
      discovery_read_count: 0,
      zero_match_check_count: 1,
      business_write_count: 0,
    },
    issue_codes: [],
  };

  const result = await runP12ReadonlyProbe({
    mode: "live",
    mappingPath: files.mappingPath,
    filterPath: files.filterPath,
    repoRoot: files.root,
    checkIgnored: ignored,
    runLiveProbe: async (input) => {
      privateInput = input;
      return expected;
    },
  });

  assert.deepEqual(privateInput, {
    baseEntryUrl: BASE_ENTRY_URL,
    target: "clusters",
    businessId: BUSINESS_ID,
  });
  assert.deepEqual(result, { exitCode: 0, report: expected });
  assert.equal(serializeP12Report(result.report).includes(BASE_ENTRY_URL), false);
  assert.equal(serializeP12Report(result.report).includes(BUSINESS_ID), false);
});

test("mapping and filter must be regular, owner-only, git-ignored local files under feishu/config", async (t) => {
  const cases = [
    {
      name: "not ignored",
      mutate: () => {},
      checkIgnored: async () => false,
      issue: "input_not_git_ignored",
    },
    {
      name: "unsafe permissions",
      mutate: ({ mappingPath }) => chmodSync(mappingPath, 0o644),
      checkIgnored: ignored,
      issue: "input_permissions_unsafe",
    },
    {
      name: "symlink",
      mutate: ({ configDir, mappingPath }) => {
        const target = join(configDir, "target.local.json");
        writeFileSync(target, JSON.stringify(mapping()));
        chmodSync(target, 0o600);
        unlinkSync(mappingPath);
        symlinkSync(target, mappingPath);
      },
      checkIgnored: ignored,
      issue: "input_symlink_rejected",
    },
    {
      name: "symlinked config directory",
      mutate: ({ root, configDir }) => {
        const realConfig = join(root, "private-config");
        renameSync(configDir, realConfig);
        symlinkSync(realConfig, configDir);
      },
      checkIgnored: ignored,
      issue: "input_symlink_rejected",
    },
  ];

  for (const entry of cases) {
    await t.test(entry.name, async (t2) => {
      const files = await fixture(t2);
      entry.mutate(files);
      const result = await runP12ReadonlyProbe({
        mappingPath: files.mappingPath,
        filterPath: files.filterPath,
        repoRoot: files.root,
        checkIgnored: entry.checkIgnored,
      });

      assert.equal(result.exitCode, 1);
      assert.equal(result.report.classification, "projection_dependency_failure");
      assert.deepEqual(result.report.issue_codes, [entry.issue]);
      assert.deepEqual(result.report.counters, zeroCounters());
    });
  }
});

test("transport and JSON parsing reject oversize, invalid UTF-8 and duplicate keys", async (t) => {
  const cases = [
    ["oversize", Buffer.alloc(LOCAL_INPUT_MAX_BYTES + 1, 0x20), "input_too_large"],
    ["invalid utf8", Buffer.from([0xc3, 0x28]), "input_utf8_invalid"],
    [
      "duplicate key",
      `{"schema_version":"neoloop.p12.mapping.v1","data_scope":"synthetic_experiment","auth_mode":"user_readonly","approved_base_entry_url":"${BASE_ENTRY_URL}","approved_base_entry_url":"${BASE_ENTRY_URL}"}`,
      "input_duplicate_key",
    ],
  ];

  for (const [name, value, issue] of cases) {
    await t.test(name, async (t2) => {
      const files = await fixture(t2);
      writeFileSync(files.mappingPath, value);
      chmodSync(files.mappingPath, 0o600);
      const result = await runP12ReadonlyProbe({
        mappingPath: files.mappingPath,
        filterPath: files.filterPath,
        repoRoot: files.root,
        checkIgnored: ignored,
      });

      assert.equal(result.exitCode, 1);
      assert.deepEqual(result.report.issue_codes, [issue]);
    });
  }
});

test("exact schemas reject old aliases, extra keys, target mismatch and invalid entry URLs", async (t) => {
  const cases = [
    [mapping({ extra: true }), filter(), "input_schema_invalid"],
    [mapping({ approved_direct_base_url: BASE_ENTRY_URL }), filter(), "input_schema_invalid"],
    [mapping({ data_scope: "real_business_data" }), filter(), "input_schema_invalid"],
    [mapping({ approved_base_entry_url: "https://larkcommunity.feishu.cn/docx/doccnPrivate?table=tblPrivate" }), filter(), "input_schema_invalid"],
    [mapping({ approved_base_entry_url: "https://larkcommunity.feishu.cn/wiki/wikicnPrivate?table=tblPrivate&extra=value" }), filter(), "input_schema_invalid"],
    [mapping(), filter({ business_id: "REAL-CLUSTER-001" }), "input_schema_invalid"],
    [mapping(), filter({ target: "vehicles" }), "input_schema_invalid"],
  ];

  for (const [mappingValue, filterValue, issue] of cases) {
    await t.test(issue, async (t2) => {
      const files = await fixture(t2, { mappingValue, filterValue });
      const result = await runP12ReadonlyProbe({
        mappingPath: files.mappingPath,
        filterPath: files.filterPath,
        repoRoot: files.root,
        checkIgnored: ignored,
      });

      assert.equal(result.exitCode, 1);
      assert.deepEqual(result.report.issue_codes, [issue]);
    });
  }
});

test("the exact mapping schema accepts an approved Wiki entry without exposing it", async (t) => {
  const files = await fixture(t, {
    mappingValue: mapping({ approved_base_entry_url: WIKI_ENTRY_URL }),
  });

  const result = await runP12ReadonlyProbe({
    mappingPath: files.mappingPath,
    filterPath: files.filterPath,
    repoRoot: files.root,
    checkIgnored: ignored,
  });

  assert.equal(result.exitCode, 0);
  assert.equal(result.report.classification, "plan_ready");
  assert.equal(serializeP12Report(result.report).includes(WIKI_ENTRY_URL), false);
});

test("stdin initializer creates a git-ignored mapping with mode 0600 and never overwrites", async (t) => {
  const files = await fixture(t);
  const outPath = join(files.configDir, "p12-new-mapping.local.json");
  const input = Buffer.from(JSON.stringify(mapping()));

  const first = await initializeP12LocalInput({
    kind: "mapping",
    outputPath: outPath,
    stdinBuffer: input,
    repoRoot: files.root,
    checkIgnored: ignored,
  });

  assert.deepEqual(first, {
    exitCode: 0,
    report: { initialized: true, input_count: 1, write_count: 1, issue_codes: [] },
  });
  assert.equal(lstatSync(outPath).mode & 0o777, 0o600);
  assert.deepEqual(JSON.parse(readFileSync(outPath, "utf8")), mapping());

  const second = await initializeP12LocalInput({
    kind: "mapping",
    outputPath: outPath,
    stdinBuffer: Buffer.from(JSON.stringify(mapping({ approved_base_entry_url: "https://tenant.feishu.cn/base/otherBase?table=otherTable" }))),
    repoRoot: files.root,
    checkIgnored: ignored,
  });

  assert.equal(second.exitCode, 1);
  assert.deepEqual(second.report.issue_codes, ["local_init_conflict"]);
  assert.deepEqual(JSON.parse(readFileSync(outPath, "utf8")), mapping());
  assert.equal(serializeP12InitReport(first.report).includes(BASE_ENTRY_URL), false);
});

test("stdin initializer supports the exact filter schema and rejects sensitive ordinary arguments", async (t) => {
  const files = await fixture(t);
  const outPath = join(files.configDir, "p12-new-filter.local.json");

  const result = await initializeP12LocalInput({
    kind: "filter",
    outputPath: outPath,
    stdinBuffer: Buffer.from(JSON.stringify(filter())),
    repoRoot: files.root,
    checkIgnored: ignored,
  });

  assert.equal(result.exitCode, 0);
  assert.deepEqual(JSON.parse(readFileSync(outPath, "utf8")), filter());
  assert.throws(() => parseP12CliArgs(["--url", BASE_ENTRY_URL]), /invalid arguments/i);
  assert.throws(() => parseP12CliArgs(["live", "--mapping", files.mappingPath, "--filter", files.filterPath, BUSINESS_ID]), /invalid arguments/i);
});

test("a null filter key selects discover_then_exact without persisting a discovered value", async (t) => {
  const files = await fixture(t, { filterValue: filter({ business_id: null }) });
  let privateInput = null;
  const result = await runP12ReadonlyProbe({
    mode: "live",
    mappingPath: files.mappingPath,
    filterPath: files.filterPath,
    repoRoot: files.root,
    checkIgnored: ignored,
    runLiveProbe: async (input) => {
      privateInput = input;
      return {
        hit_count: 1,
        classification: "exact_single_match",
        counters: {
          cli_command_count: 7,
          auth_command_count: 2,
          base_read_command_count: 4,
          discovery_read_count: 1,
          zero_match_check_count: 1,
          business_write_count: 0,
        },
        issue_codes: [],
      };
    },
  });

  assert.equal(result.exitCode, 0);
  assert.deepEqual(privateInput, {
    baseEntryUrl: BASE_ENTRY_URL,
    target: "clusters",
    businessId: null,
  });
  assert.equal(JSON.parse(readFileSync(files.filterPath, "utf8")).business_id, null);
});

test("CLI argument parser defaults to plan and accepts only local paths plus explicit live/init modes", async (t) => {
  const files = await fixture(t);

  assert.deepEqual(parseP12CliArgs(["--mapping", files.mappingPath, "--filter", files.filterPath]), {
    mode: "plan",
    mappingPath: files.mappingPath,
    filterPath: files.filterPath,
  });
  assert.deepEqual(parseP12CliArgs(["live", "--mapping", files.mappingPath, "--filter", files.filterPath]), {
    mode: "live",
    mappingPath: files.mappingPath,
    filterPath: files.filterPath,
  });
  assert.deepEqual(parseP12CliArgs(["init-mapping", "--out", files.mappingPath]), {
    mode: "init",
    kind: "mapping",
    outputPath: files.mappingPath,
  });
  assert.deepEqual(parseP12CliArgs(["init-filter", "--out", files.filterPath]), {
    mode: "init",
    kind: "filter",
    outputPath: files.filterPath,
  });
});

test("serializers expose closed redacted schemas and sorted issue codes only", () => {
  const serialized = serializeP12Report({
    hit_count: 1,
    classification: "exact_single_match",
    counters: {
      cli_command_count: 5,
      auth_command_count: 2,
      base_read_command_count: 2,
      discovery_read_count: 0,
      zero_match_check_count: 0,
      business_write_count: 0,
    },
    issue_codes: ["provider_output_unsafe", "command_timeout", "provider_output_unsafe"],
    locator: BASE_ENTRY_URL,
    account: "private-account",
    token: "private-token",
  });

  assert.deepEqual(JSON.parse(serialized), {
    hit_count: 1,
    classification: "projection_dependency_failure",
    counters: {
      cli_command_count: 5,
      auth_command_count: 2,
      base_read_command_count: 2,
      discovery_read_count: 0,
      zero_match_check_count: 0,
      business_write_count: 0,
    },
    issue_codes: ["command_timeout", "provider_output_unsafe"],
  });
  assert.equal(serialized.includes(BASE_ENTRY_URL), false);
  assert.equal(serialized.includes("private-account"), false);
  assert.equal(serialized.includes("private-token"), false);
});
