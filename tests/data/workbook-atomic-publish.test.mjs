import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { promisify } from "node:util";

import { runAtomicDirectoryBuild } from "../../scripts/neoloop-data/workbook-atomic-publish.mjs";

const execFileAsync = promisify(execFile);
const atomicHelperUrl = pathToFileURL(join(process.cwd(), "scripts/neoloop-data/workbook-atomic-publish.mjs")).href;

async function makeSandbox(t) {
  const directory = await mkdtemp(join(tmpdir(), "neoloop-atomic-publish-test-"));
  t.after(async () => rm(directory, { recursive: true, force: true }));
  return directory;
}

async function pathExists(path) {
  try {
    await access(path);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

async function writeSyntheticPackage(stagingDirectory, marker, acceptanceReady = true) {
  await mkdir(join(stagingDirectory, "previews"), { recursive: true });
  await writeFile(join(stagingDirectory, "workbook.xlsx"), `xlsx:${marker}`, "utf8");
  await writeFile(join(stagingDirectory, "previews", "sheet.png"), `png:${marker}`, "utf8");
  await writeFile(join(stagingDirectory, "workbook.xlsx.inspect.ndjson"), `{"marker":"${marker}"}\n`, "utf8");
  await writeFile(join(stagingDirectory, "workbook-build-audit.json"), `${JSON.stringify({ acceptance_ready: acceptanceReady, marker })}\n`, "utf8");
}

test("existing immutable target fails closed and preserves its sentinel", async (t) => {
  const parent = await makeSandbox(t);
  const targetDirectory = join(parent, "release");
  await mkdir(targetDirectory);
  await writeFile(join(targetDirectory, "sentinel.txt"), "accepted-v1", "utf8");
  let buildCalled = false;

  await assert.rejects(
    runAtomicDirectoryBuild({
      targetDirectory,
      build: async (stagingDirectory) => {
        buildCalled = true;
        await writeSyntheticPackage(stagingDirectory, "must-not-run");
        return { acceptanceReady: true };
      },
    }),
    (error) => error?.code === "target_exists" && error?.failedStagingDirectory?.includes(".failed-staging-"),
  );

  assert.equal(buildCalled, false);
  assert.equal(await readFile(join(targetDirectory, "sentinel.txt"), "utf8"), "accepted-v1");
});

test("build failure keeps its audit in one unique failed-staging directory", async (t) => {
  const parent = await makeSandbox(t);
  const targetDirectory = join(parent, "release");

  let failure;
  try {
    await runAtomicDirectoryBuild({
      targetDirectory,
      build: async (stagingDirectory) => {
        await writeSyntheticPackage(stagingDirectory, "failed-build", false);
        throw new Error("synthetic build failure");
      },
    });
  } catch (error) {
    failure = error;
  }

  assert.equal(failure?.code, "build_failed");
  assert.match(failure?.failedStagingDirectory ?? "", /\.failed-staging-/);
  assert.equal(await pathExists(targetDirectory), false);
  assert.equal(JSON.parse(await readFile(join(failure.failedStagingDirectory, "workbook-build-audit.json"), "utf8")).acceptance_ready, false);
  assert.equal(JSON.parse(await readFile(join(failure.failedStagingDirectory, "atomic-publish-failure.json"), "utf8")).code, "build_failed");
});

test("acceptance_ready false never publishes and exits through failed staging", async (t) => {
  const parent = await makeSandbox(t);
  const targetDirectory = join(parent, "release");

  await assert.rejects(
    runAtomicDirectoryBuild({
      targetDirectory,
      build: async (stagingDirectory) => {
        await writeSyntheticPackage(stagingDirectory, "false-acceptance", false);
        return { acceptanceReady: false };
      },
    }),
    (error) => error?.code === "acceptance_not_ready" && error?.failedStagingDirectory?.includes(".failed-staging-"),
  );

  assert.equal(await pathExists(targetDirectory), false);
});

test("two concurrent builds for one target produce exactly one winner without mixed files", async (t) => {
  const parent = await makeSandbox(t);
  const targetDirectory = join(parent, "release");
  const build = (marker) => runAtomicDirectoryBuild({
    targetDirectory,
    build: async (stagingDirectory) => {
      await writeSyntheticPackage(stagingDirectory, marker, true);
      return { acceptanceReady: true, marker };
    },
  });

  const outcomes = await Promise.allSettled([build("alpha"), build("beta")]);
  assert.equal(outcomes.filter((outcome) => outcome.status === "fulfilled").length, 1);
  assert.equal(outcomes.filter((outcome) => outcome.status === "rejected").length, 1);

  const winner = (await readFile(join(targetDirectory, "workbook.xlsx"), "utf8")).slice("xlsx:".length);
  assert.ok(["alpha", "beta"].includes(winner));
  assert.equal(await readFile(join(targetDirectory, "previews", "sheet.png"), "utf8"), `png:${winner}`);
  assert.equal(JSON.parse(await readFile(join(targetDirectory, "workbook-build-audit.json"), "utf8")).marker, winner);
});

test("successful build appears only through one same-parent directory rename", async (t) => {
  const parent = await makeSandbox(t);
  const targetDirectory = join(parent, "release");
  let observedStagingDirectory;

  const result = await runAtomicDirectoryBuild({
    targetDirectory,
    build: async (stagingDirectory) => {
      observedStagingDirectory = stagingDirectory;
      assert.equal(dirname(stagingDirectory), parent);
      assert.match(basename(stagingDirectory), /^release\.staging-/);
      assert.equal(await pathExists(targetDirectory), false);
      await writeSyntheticPackage(stagingDirectory, "accepted-v2", true);
      assert.equal(await pathExists(targetDirectory), false);
      return { acceptanceReady: true, marker: "accepted-v2" };
    },
  });

  assert.equal(result.targetDirectory, targetDirectory);
  assert.equal(result.publishMethod, "single_same_filesystem_directory_rename");
  assert.equal(await pathExists(observedStagingDirectory), false);
  assert.equal(await readFile(join(targetDirectory, "workbook.xlsx"), "utf8"), "xlsx:accepted-v2");
});

test("CLI process exits nonzero and leaves final target absent for acceptance false and build error", async (t) => {
  const parent = await makeSandbox(t);
  const runner = join(parent, "atomic-runner.mjs");
  await writeFile(runner, `
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { runAtomicDirectoryBuild } from ${JSON.stringify(atomicHelperUrl)};
const [targetDirectory, mode] = process.argv.slice(2);
await runAtomicDirectoryBuild({
  targetDirectory,
  build: async (stagingDirectory) => {
    await mkdir(stagingDirectory, { recursive: true });
    await writeFile(join(stagingDirectory, "workbook-build-audit.json"), JSON.stringify({ acceptance_ready: false }));
    if (mode === "throw") throw new Error("synthetic build error");
    return { acceptanceReady: false };
  },
});
`, "utf8");

  for (const mode of ["false", "throw"]) {
    const targetDirectory = join(parent, `release-${mode}`);
    let error;
    try {
      await execFileAsync(process.execPath, [runner, targetDirectory, mode], { encoding: "utf8" });
    } catch (caught) {
      error = caught;
    }
    assert.ok(error, `${mode} must exit nonzero`);
    assert.notEqual(error.code, 0);
    assert.equal(await pathExists(targetDirectory), false);
  }
});
