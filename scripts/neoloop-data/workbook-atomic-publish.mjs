import { access, mkdir, mkdtemp, readFile, rename, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

function decodeXmlText(value) {
  return value
    .replaceAll("&apos;", "'")
    .replaceAll("&quot;", '"')
    .replaceAll("&gt;", ">")
    .replaceAll("&lt;", "<")
    .replaceAll("&amp;", "&");
}

function xmlAttribute(attributes, name) {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`(?:^|\\s)${escapedName}=(["'])([\\s\\S]*?)\\1`).exec(attributes);
  return match == null ? null : decodeXmlText(match[2]);
}

function xmlChildText(body, localName) {
  const escapedName = localName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(
    `<(?:[A-Za-z0-9_]+:)?${escapedName}\\b[^>]*>([\\s\\S]*?)<\\/(?:[A-Za-z0-9_]+:)?${escapedName}>`,
  ).exec(body);
  return match == null ? null : decodeXmlText(match[1]);
}

function normalizedValidationContract(contract) {
  return {
    sqref: contract?.sqref ?? null,
    type: contract?.type ?? null,
    operator: contract?.operator ?? null,
    formula1: contract?.formula1 ?? null,
    formula2: contract?.formula2 ?? null,
  };
}

function contractKey(contract) {
  return JSON.stringify(normalizedValidationContract(contract));
}

function multisetDifference(left, right) {
  const remaining = new Map();
  for (const item of right) {
    const key = contractKey(item);
    remaining.set(key, (remaining.get(key) ?? 0) + 1);
  }
  const difference = [];
  for (const item of left) {
    const key = contractKey(item);
    const count = remaining.get(key) ?? 0;
    if (count === 0) difference.push(normalizedValidationContract(item));
    else remaining.set(key, count - 1);
  }
  return difference;
}

export function validateDataValidationContracts(worksheetXml, expectedContracts) {
  if (typeof worksheetXml !== "string") throw new TypeError("worksheetXml must be a string");
  if (!Array.isArray(expectedContracts)) throw new TypeError("expectedContracts must be an array");
  const actual = [];
  const nodePattern = /<(?:[A-Za-z0-9_]+:)?dataValidation\b([^>]*?)(?:\s*\/>|>([\s\S]*?)<\/(?:[A-Za-z0-9_]+:)?dataValidation>)/g;
  for (const match of worksheetXml.matchAll(nodePattern)) {
    const body = match[2] ?? "";
    actual.push(normalizedValidationContract({
      sqref: xmlAttribute(match[1], "sqref"),
      type: xmlAttribute(match[1], "type"),
      operator: xmlAttribute(match[1], "operator"),
      formula1: xmlChildText(body, "formula1"),
      formula2: xmlChildText(body, "formula2"),
    }));
  }
  const expected = expectedContracts.map(normalizedValidationContract);
  const missing = multisetDifference(expected, actual);
  const unexpected = multisetDifference(actual, expected);
  return {
    exact: missing.length === 0 && unexpected.length === 0,
    expected,
    actual,
    missing,
    unexpected,
  };
}

function asBuffer(value) {
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) return Buffer.from(value);
  if (typeof value === "string") return Buffer.from(value, "utf8");
  throw new TypeError("OOXML entry values must be Buffer, Uint8Array, or string");
}

function mapKeysExact(left, right) {
  const leftKeys = [...left.keys()].sort();
  const rightKeys = [...right.keys()].sort();
  return JSON.stringify(leftKeys) === JSON.stringify(rightKeys);
}

export function verifyExactEntryWhitelist(beforeEntries, repairedEntries, expectedAfterByEntry) {
  if (!(beforeEntries instanceof Map) || !(repairedEntries instanceof Map) || !(expectedAfterByEntry instanceof Map)) {
    throw new TypeError("OOXML entry collections must be Map instances");
  }
  const beforeKeys = [...beforeEntries.keys()].sort();
  const repairedKeys = [...repairedEntries.keys()].sort();
  const allowedKeys = [...expectedAfterByEntry.keys()].sort();
  const fileSetExact = mapKeysExact(beforeEntries, repairedEntries);
  const allowedEntriesExistBefore = allowedKeys.every((entry) => beforeEntries.has(entry));
  const allowedEntriesExistAfter = allowedKeys.every((entry) => repairedEntries.has(entry));
  const actualChangedEntries = beforeKeys.filter((entry) => (
    repairedEntries.has(entry)
    && !asBuffer(beforeEntries.get(entry)).equals(asBuffer(repairedEntries.get(entry)))
  ));
  const unexpectedChangedEntries = actualChangedEntries.filter((entry) => !expectedAfterByEntry.has(entry));
  const missingAllowedChanges = allowedKeys.filter((entry) => !actualChangedEntries.includes(entry));
  const allowedEntryMismatches = allowedKeys.filter((entry) => (
    !repairedEntries.has(entry)
    || !asBuffer(repairedEntries.get(entry)).equals(asBuffer(expectedAfterByEntry.get(entry)))
  ));
  const allOtherEntriesByteIdentical = fileSetExact && beforeKeys.every((entry) => (
    expectedAfterByEntry.has(entry)
    || asBuffer(beforeEntries.get(entry)).equals(asBuffer(repairedEntries.get(entry)))
  ));
  const allowedEntriesExact = allowedEntriesExistBefore
    && allowedEntriesExistAfter
    && missingAllowedChanges.length === 0
    && allowedEntryMismatches.length === 0;
  const passed = fileSetExact
    && allowedEntriesExact
    && allOtherEntriesByteIdentical
    && unexpectedChangedEntries.length === 0
    && JSON.stringify(actualChangedEntries) === JSON.stringify(allowedKeys);
  return {
    passed,
    file_set_exact: fileSetExact,
    original_entry_count: beforeKeys.length,
    repaired_entry_count: repairedKeys.length,
    allowed_changed_entries: allowedKeys,
    actual_changed_entries: actualChangedEntries,
    unexpected_changed_entries: unexpectedChangedEntries,
    missing_allowed_changes: missingAllowedChanges,
    allowed_entry_mismatches: allowedEntryMismatches,
    allowed_entries_exact: allowedEntriesExact,
    all_other_entries_byte_identical: allOtherEntriesByteIdentical,
  };
}

export function assertFiniteWorkbookValue(value, path = "workbook", ancestors = new WeakSet()) {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError(`Non-finite workbook number at ${path}`);
    return;
  }
  if (value == null || typeof value !== "object" || value instanceof Date) return;
  if (ancestors.has(value)) throw new TypeError(`Cyclic workbook value at ${path}`);
  ancestors.add(value);
  if (Array.isArray(value)) {
    value.forEach((nested, index) => assertFiniteWorkbookValue(nested, `${path}[${index}]`, ancestors));
  } else {
    for (const [key, nested] of Object.entries(value)) {
      assertFiniteWorkbookValue(nested, `${path}.${key}`, ancestors);
    }
  }
  ancestors.delete(value);
}

export function excelSerialFromDateInstant(value) {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    throw new TypeError("excelSerialFromDateInstant requires a valid Date");
  }
  return Number(((value.getTime() / 86_400_000) + 25_569).toPrecision(15));
}

export function excelSerialCandidatesFromDate(value) {
  const utcInstant = excelSerialFromDateInstant(value);
  const localFields = Number(((Date.UTC(
    value.getFullYear(),
    value.getMonth(),
    value.getDate(),
    value.getHours(),
    value.getMinutes(),
    value.getSeconds(),
    value.getMilliseconds(),
  ) / 86_400_000) + 25_569).toPrecision(15));
  return { utc_instant: utcInstant, local_fields: localFields };
}

export function matchExactExcelDateSerialCandidate(serial, candidates) {
  if (!Number.isFinite(serial)) throw new TypeError("Non-finite workbook number used as an Excel date serial");
  if (candidates == null
    || !Number.isFinite(candidates.utc_instant)
    || !Number.isFinite(candidates.local_fields)) {
    throw new TypeError("Exact Excel date serial candidates must both be finite numbers");
  }
  if (serial === candidates.utc_instant) return "utc_instant";
  if (serial === candidates.local_fields) return "local_fields";
  return null;
}

export class AtomicPublishError extends Error {
  constructor(message, { code, cause = null, failedStagingDirectory = null } = {}) {
    super(message);
    this.name = "AtomicPublishError";
    this.code = code;
    this.failedStagingDirectory = failedStagingDirectory;
    if (cause != null) this.cause = cause;
  }
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

function failedStagingDirectoryFor(stagingDirectory, targetDirectory) {
  const stagingName = basename(stagingDirectory);
  const prefix = `${basename(targetDirectory)}.staging-`;
  if (!stagingName.startsWith(prefix)) {
    throw new Error(`Unexpected staging directory name: ${stagingName}`);
  }
  return join(dirname(targetDirectory), `${basename(targetDirectory)}.failed-staging-${stagingName.slice(prefix.length)}`);
}

async function preserveFailedStaging(stagingDirectory, targetDirectory, failure) {
  const failedStagingDirectory = failedStagingDirectoryFor(stagingDirectory, targetDirectory);
  const auditPath = join(stagingDirectory, "workbook-build-audit.json");
  let audit = {};
  try {
    audit = JSON.parse(await readFile(auditPath, "utf8"));
  } catch (error) {
    if (error?.code !== "ENOENT" && !(error instanceof SyntaxError)) throw error;
  }
  audit.acceptance_ready = false;
  audit.build_integrity_ok = false;
  audit.atomic_publication = {
    ...(audit.atomic_publication ?? {}),
    status: "failed",
    failure_code: failure.code,
    failure_message: failure.message,
    target_directory: targetDirectory,
    publish_method: "single_same_filesystem_directory_rename",
  };
  await writeFile(auditPath, `${JSON.stringify(audit, null, 2)}\n`, "utf8");
  await writeFile(join(stagingDirectory, "atomic-publish-failure.json"), `${JSON.stringify({
    status: "failed",
    code: failure.code,
    message: failure.message,
    target_directory: targetDirectory,
    staging_directory_name: basename(stagingDirectory),
    failed_staging_directory: failedStagingDirectory,
  }, null, 2)}\n`, "utf8");
  await rename(stagingDirectory, failedStagingDirectory);
  failure.failedStagingDirectory = failedStagingDirectory;
  return failure;
}

function asAtomicFailure(error, fallbackCode) {
  if (error instanceof AtomicPublishError) return error;
  return new AtomicPublishError(error?.message ?? String(error), { code: fallbackCode, cause: error });
}

export async function runAtomicDirectoryBuild({ targetDirectory, build }) {
  if (typeof targetDirectory !== "string" || targetDirectory.length === 0) {
    throw new TypeError("targetDirectory is required");
  }
  if (typeof build !== "function") throw new TypeError("build callback is required");

  const parentDirectory = dirname(targetDirectory);
  await mkdir(parentDirectory, { recursive: true });
  const stagingDirectory = await mkdtemp(join(parentDirectory, `${basename(targetDirectory)}.staging-`));

  try {
    if (await pathExists(targetDirectory)) {
      throw new AtomicPublishError(`Immutable target already exists: ${targetDirectory}`, { code: "target_exists" });
    }

    let buildResult;
    try {
      buildResult = await build(stagingDirectory);
    } catch (error) {
      throw asAtomicFailure(error, "build_failed");
    }
    if (buildResult?.acceptanceReady !== true) {
      throw new AtomicPublishError("Staged workbook package is not acceptance-ready", { code: "acceptance_not_ready" });
    }

    try {
      await rename(stagingDirectory, targetDirectory);
    } catch (error) {
      if (["EEXIST", "ENOTEMPTY"].includes(error?.code)) {
        throw new AtomicPublishError(`Immutable target won a concurrent publish race: ${targetDirectory}`, {
          code: "target_exists",
          cause: error,
        });
      }
      throw asAtomicFailure(error, "publish_failed");
    }

    return {
      targetDirectory,
      publishMethod: "single_same_filesystem_directory_rename",
      buildResult,
    };
  } catch (error) {
    const failure = asAtomicFailure(error, "build_failed");
    throw await preserveFailedStaging(stagingDirectory, targetDirectory, failure);
  }
}
