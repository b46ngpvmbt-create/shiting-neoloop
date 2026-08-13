import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, posix, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";

import {
  assertFiniteWorkbookValue,
  excelSerialCandidatesFromDate,
  matchExactExcelDateSerialCandidate,
  runAtomicDirectoryBuild,
  validateDataValidationContracts,
  verifyExactEntryWhitelist,
} from "./workbook-atomic-publish.mjs";

const runtimeRequire = createRequire(resolve(process.cwd(), "neoloop-artifact-runtime.mjs"));
const artifactToolEntry = runtimeRequire.resolve("@oai/artifact-tool");
const { FileBlob, SpreadsheetFile, Workbook } = await import(pathToFileURL(artifactToolEntry).href);
const artifactToolPackage = JSON.parse(await readFile(resolve(dirname(artifactToolEntry), "../package.json"), "utf8"));
const ARTIFACT_TOOL_VERSION = artifactToolPackage.version;
const execFileAsync = promisify(execFile);
const [artifactMajor, artifactMinor, artifactPatch] = ARTIFACT_TOOL_VERSION.split(".").map(Number);
if (artifactMajor < 2 || (artifactMajor === 2 && artifactMinor < 8) || (artifactMajor === 2 && artifactMinor === 8 && artifactPatch < 6)) {
  throw new Error(`@oai/artifact-tool >= 2.8.6 required; resolved ${ARTIFACT_TOOL_VERSION}`);
}

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "../..");
const CANONICAL = resolve(REPO, "data/canonical");
const DEFAULT_OUTPUT = resolve(REPO, "../../outputs/019f7082-neoloop-r5-atomic");
const SCHEMA_VERSION = "1.0.0-draft.2";
const FIXTURE_VERSION = "1.0.0-t1-r2";
const CATALOG_VERSION = "t1-r2-draft.1";
const DATA_SCOPE = "synthetic_experiment";
const EXPERIMENT_SEED = "NEOLOOP-R2-20260801";

const OUTPUT_FLAG = process.argv.indexOf("--output-dir");
if (OUTPUT_FLAG >= 0 && !process.argv[OUTPUT_FLAG + 1]) throw new Error("--output-dir requires a directory path");
const FINAL_OUTPUT = resolve(OUTPUT_FLAG >= 0 ? process.argv[OUTPUT_FLAG + 1] : DEFAULT_OUTPUT);

const COLORS = {
  ink: "#102331",
  navy: "#0B2638",
  teal: "#087F8C",
  tealPale: "#E3F6F6",
  bluePale: "#EAF2FB",
  mint: "#DDF4E5",
  mintText: "#1D6B3D",
  amber: "#F2B84B",
  amberPale: "#FFF5D8",
  amberText: "#795600",
  coralPale: "#FDEBE5",
  coralText: "#9B3D24",
  violetPale: "#F0ECFA",
  violetText: "#5E45A5",
  gray50: "#F7F9FA",
  gray100: "#EDF1F3",
  gray300: "#CBD5DB",
  gray600: "#52636E",
  white: "#FFFFFF",
};

const TABLE_LABELS = {
  raw_feedback: "原始反馈",
  cases: "反馈案件",
  work_orders: "处置工单",
  clusters: "问题簇",
  improvements: "改进项目",
  vehicles: "车辆档案",
  delivery_tasks: "配送任务",
  routing_matrix: "站点责任矩阵",
  knowledge_index: "知识索引",
  ai_audit: "AI审计",
};

const AI_AUDIT_TEMPLATE_KEYS = [
  "run_id",
  "object_ref.object_type",
  "object_ref.object_id",
  "node",
  "mode",
  "version",
  "input_hash",
  "payload",
  "evidence_spans",
  "missing_fields",
  "confidence",
  "status",
  "validation.valid",
  "validation.errors",
  "retry_count",
  "human_revision.state",
  "human_revision.note",
  "schema_version",
  "data_scope",
  "evidence_class",
  "created_at",
  "updated_at",
  "legacy_id",
  "source_kind",
];

const FIELD_DESCRIPTIONS = {
  schema_version: "冻结的 canonical schema 版本。",
  data_scope: "数据范围；本批业务与实验数据固定为 synthetic_experiment。",
  evidence_class: "四类事实边界之一。",
  created_at: "canonical 记录创建时间。",
  updated_at: "canonical 记录更新时间。",
  legacy_id: "报名 Excel 中的旧对象 ID；新建 canonical 草案可为空。",
  source_kind: "数据来源类型。",
  source_name: "来源文件名称。",
  source_sha256: "不可变来源文件 SHA-256。",
  missing_fields: "结构化缺失字段数组；不得使用已废弃的 missing_items。",
  record_mode: "记录模式；报名迁移案件固定为 legacy_snapshot。",
  workflow_readiness: "历史快照进入新版回放前的准备状态。",
  formal_entity: "经授权人员确认后的正式实体；历史快照不预填。",
  formal_entity_confirmation_status: "正式实体人工确认关口。",
  clock_source: "观察或实验时钟来源：real、test、synthetic_history。",
  sla_reset_count: "SLA 起点重置次数；改派和升级不得重置。",
  controls_available: "NeoLoop 是否暴露车辆控制；必须为 false。",
  original_text: "不可由 AI 覆盖的原始反馈文本。",
  original_text_mutable: "原文是否可被系统改写；必须为 false。",
};

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function columnName(index) {
  let value = index + 1;
  let result = "";
  while (value > 0) {
    const remainder = (value - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    value = Math.floor((value - 1) / 26);
  }
  return result;
}

function sanitizeFilePart(value) {
  return value.replace(/[\\/:*?"<>|\s]+/g, "-");
}

function isPlainObject(value) {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function readable(value) {
  if (value == null) return "";
  if (Array.isArray(value)) {
    return value.map((item) => {
      if (isPlainObject(item)) return Object.entries(item).map(([key, nested]) => `${key}=${readable(nested)}`).join("；");
      return readable(item);
    }).join("｜");
  }
  if (isPlainObject(value)) return Object.entries(value).map(([key, nested]) => `${key}=${readable(nested)}`).join("；");
  return value;
}

function flattenObject(value, prefix = "", output = {}) {
  for (const [key, nested] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (isPlainObject(nested)) flattenObject(nested, path, output);
    else output[path] = Array.isArray(nested) ? readable(nested) : nested;
  }
  return output;
}

function valueType(value) {
  if (value == null) return "null";
  if (Array.isArray(value)) return "array";
  if (isPlainObject(value)) return "object";
  return typeof value;
}

function truncate(value, limit = 100) {
  const text = String(readable(value));
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
}

function preferredFieldOrder(primaryKey, keys) {
  const first = [
    primaryKey,
    "legacy_id",
    "title",
    "name",
    "original_text",
    "summary",
    "status",
    "processing_status",
    "category_domain",
    "category_detail",
    "rule_risk",
    "ai_risk",
    "final_risk",
    "missing_fields",
    "record_mode",
    "workflow_readiness",
  ];
  const ordered = [];
  for (const key of first) if (keys.includes(key) && !ordered.includes(key)) ordered.push(key);
  for (const key of keys.sort()) if (!ordered.includes(key)) ordered.push(key);
  return ordered;
}

function widthForKey(key) {
  if (/original_text|summary|evidence|note|action|hypothesis|measure|formula|next_step|route|payload|errors/.test(key)) return 34;
  if (/hash|idempotency_key/.test(key)) return 38;
  if (/created_at|updated_at|received_at|started_at|due_at|completed_at|source_at|effective_at|closed_at/.test(key)) return 21;
  if (/(^|\.)[^.]*_id$|^run_id$|^object_ref/.test(key)) return 21;
  if (/status|mode|class|scope|version|team|role|type/.test(key)) return 16;
  if (/confidence|count|minutes|days|mutable|available|correct|valid|retry/.test(key)) return 13;
  return 16;
}

function isDateTimeKey(key) {
  return /(^|\.)[^.]*_at$/.test(key);
}

function listValidation(values) {
  return { rule: { type: "list", values } };
}

function listValidationContract(sqref, values) {
  return {
    sqref,
    type: "list",
    operator: null,
    formula1: `"${values.join(",")}"`,
    formula2: null,
  };
}

function absoluteRange(address) {
  const match = /^([A-Z]+)(\d+):([A-Z]+)(\d+)$/.exec(address);
  if (!match) throw new Error(`Unsupported print-area range: ${address}`);
  return `$${match[1]}$${match[2]}:$${match[3]}$${match[4]}`;
}

function escapeXmlText(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function decodeXmlText(value) {
  return value
    .replaceAll("&apos;", "'")
    .replaceAll("&quot;", '"')
    .replaceAll("&gt;", ">")
    .replaceAll("&lt;", "<")
    .replaceAll("&amp;", "&");
}

function printAreaFormula(sheetName, address) {
  const escapedSheetName = sheetName.replaceAll("'", "''");
  return `'${escapedSheetName}'!${absoluteRange(address)}`;
}

function fiveRowFreezePaneEdit(xml, sheetName) {
  const pane = '<x:pane ySplit="5" topLeftCell="A6" activePane="bottomLeft" state="frozen" />';
  const selection = '<x:selection pane="bottomLeft" activeCell="A6" sqref="A6" />';
  const selfClosingView = /<x:sheetView\b([^>]*)\s*\/>/;
  const match = selfClosingView.exec(xml);
  if (match == null) {
    throw new Error(`${sheetName}: expected one self-closing x:sheetView before OOXML metadata repair`);
  }
  const originalNode = match[0];
  const repairedNode = `<x:sheetView${match[1]}>${pane}${selection}</x:sheetView>`;
  const repaired = xml.replace(originalNode, repairedNode);
  if ((repaired.match(/<x:pane\b/g) ?? []).length !== 1) {
    throw new Error(`${sheetName}: freeze-pane repair did not produce exactly one pane`);
  }
  return { repaired, originalNode, repairedNode };
}

function addFiveRowFreezePane(xml, sheetName) {
  return fiveRowFreezePaneEdit(xml, sheetName).repaired;
}

function stripFiveRowFreezePane(repairedXml, originalXml, sheetName) {
  const edit = fiveRowFreezePaneEdit(originalXml, sheetName);
  if (repairedXml.split(edit.repairedNode).length !== 2) {
    throw new Error(`${sheetName}: repaired pane/selection node is not an exact single allowed addition`);
  }
  return repairedXml.replace(edit.repairedNode, edit.originalNode);
}

function xmlAttribute(attributes, name) {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`(?:^|\\s)${escapedName}=(["'])([\\s\\S]*?)\\1`).exec(attributes);
  return match == null ? null : decodeXmlText(match[2]);
}

function normalizeWorkbookRelationshipTarget(target) {
  const entry = target.startsWith("/")
    ? posix.normalize(target.slice(1))
    : posix.normalize(posix.join("xl", target));
  if (!entry.startsWith("xl/worksheets/") || entry.includes("../")) {
    throw new Error(`Workbook worksheet relationship escapes xl/worksheets: ${target}`);
  }
  return entry;
}

function parseWorkbookSheetBindings(workbookXml, workbookRelsXml) {
  const relationshipTargets = new Map();
  for (const match of workbookRelsXml.matchAll(/<(?:[A-Za-z0-9_]+:)?Relationship\b([^>]*)\/?\s*>/g)) {
    const id = xmlAttribute(match[1], "Id");
    const target = xmlAttribute(match[1], "Target");
    const type = xmlAttribute(match[1], "Type");
    if (id != null && target != null && type?.endsWith("/worksheet")) {
      if (relationshipTargets.has(id)) throw new Error(`Duplicate workbook relationship Id: ${id}`);
      relationshipTargets.set(id, normalizeWorkbookRelationshipTarget(target));
    }
  }

  const bindings = [];
  for (const match of workbookXml.matchAll(/<(?:[A-Za-z0-9_]+:)?sheet\b([^>]*)\/?\s*>/g)) {
    const name = xmlAttribute(match[1], "name");
    const sheetId = xmlAttribute(match[1], "sheetId");
    const relationshipId = xmlAttribute(match[1], "r:id");
    const entry = relationshipTargets.get(relationshipId);
    if (name == null || sheetId == null || relationshipId == null || entry == null) {
      throw new Error(`Incomplete workbook sheet binding: name=${name}, sheetId=${sheetId}, r:id=${relationshipId}`);
    }
    bindings.push({
      local_sheet_id: bindings.length,
      name,
      sheet_id: sheetId,
      relationship_id: relationshipId,
      entry,
    });
  }
  if (bindings.length === 0) throw new Error("No worksheet bindings found in workbook.xml");
  if (new Set(bindings.map((binding) => binding.name)).size !== bindings.length) {
    throw new Error("Duplicate worksheet name in workbook.xml");
  }
  if (new Set(bindings.map((binding) => binding.entry)).size !== bindings.length) {
    throw new Error("Multiple workbook sheets resolve to the same worksheet entry");
  }
  return bindings;
}

function expectedSheetBindings(sheetMeta, workbookBindings) {
  const metaByName = new Map(sheetMeta.map((meta) => [meta.sheet.name, meta]));
  if (metaByName.size !== sheetMeta.length || workbookBindings.length !== sheetMeta.length) {
    throw new Error("Workbook sheet catalog cardinality does not match expected metadata");
  }
  return workbookBindings.map((binding) => {
    const meta = metaByName.get(binding.name);
    if (meta == null) throw new Error(`Unexpected workbook sheet binding: ${binding.name}`);
    return { ...binding, meta };
  });
}

function addPrintAreaDefinedNames(workbookXml, boundSheetMeta) {
  if (/<x:definedNames\b/.test(workbookXml) || /_xlnm\.Print_Area/.test(workbookXml)) {
    throw new Error("Unexpected pre-existing defined names before Print_Area repair");
  }
  const definitions = boundSheetMeta.map(({ meta, local_sheet_id: localSheetId }) => {
    const formula = escapeXmlText(printAreaFormula(meta.sheet.name, meta.usedRange));
    return `<x:definedName name="_xlnm.Print_Area" localSheetId="${localSheetId}">${formula}</x:definedName>`;
  }).join("");
  const repaired = workbookXml.replace("</x:sheets>", `</x:sheets><x:definedNames>${definitions}</x:definedNames>`);
  if (repaired === workbookXml) throw new Error("Unable to insert workbook defined names after x:sheets");
  return repaired;
}

function stripPrintAreaDefinedNames(repairedXml, originalXml, boundSheetMeta) {
  const expected = addPrintAreaDefinedNames(originalXml, boundSheetMeta);
  if (repairedXml !== expected) {
    throw new Error("Repaired workbook.xml is not the exact allowed Print_Area transform");
  }
  const definitions = boundSheetMeta.map(({ meta, local_sheet_id: localSheetId }) => {
    const formula = escapeXmlText(printAreaFormula(meta.sheet.name, meta.usedRange));
    return `<x:definedName name="_xlnm.Print_Area" localSheetId="${localSheetId}">${formula}</x:definedName>`;
  }).join("");
  const exactAddition = `<x:definedNames>${definitions}</x:definedNames>`;
  if (repairedXml.split(exactAddition).length !== 2) {
    throw new Error("Print_Area definedNames block is not one exact allowed addition");
  }
  return repairedXml.replace(exactAddition, "");
}

async function readArchiveFileEntries(archivePath) {
  const { stdout: listing } = await execFileAsync("/usr/bin/unzip", ["-Z1", archivePath], {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  const entries = listing.split("\n").filter((entry) => entry.length > 0 && !entry.endsWith("/"));
  const files = new Map();
  for (const entry of entries) {
    const unzipMemberPattern = entry
      .replaceAll("\\", "\\\\")
      .replaceAll("[", "\\[")
      .replaceAll("]", "\\]")
      .replaceAll("*", "\\*")
      .replaceAll("?", "\\?");
    const { stdout } = await execFileAsync("/usr/bin/unzip", ["-p", archivePath, unzipMemberPattern], {
      encoding: null,
      maxBuffer: 64 * 1024 * 1024,
    });
    files.set(entry, Buffer.from(stdout));
  }
  return files;
}

async function repairExportedWorkbookMetadata(outputPath, sheetMeta) {
  const temporaryDirectory = await mkdtemp(resolve(dirname(outputPath), ".ooxml-metadata-"));
  const replacementPath = `${outputPath}.metadata-repaired.tmp`;
  try {
    const originalArchiveEntries = await readArchiveFileEntries(outputPath);
    await execFileAsync("/usr/bin/unzip", ["-q", outputPath, "-d", temporaryDirectory]);
    const workbookPath = resolve(temporaryDirectory, "xl", "workbook.xml");
    const workbookRelsPath = resolve(temporaryDirectory, "xl", "_rels", "workbook.xml.rels");
    const workbookXml = await readFile(workbookPath, "utf8");
    const workbookRelsXml = await readFile(workbookRelsPath, "utf8");
    const boundSheetMeta = expectedSheetBindings(
      sheetMeta,
      parseWorkbookSheetBindings(workbookXml, workbookRelsXml),
    );
    const expectedAfterByEntry = new Map();
    const stripChecks = [];
    for (const { meta, entry } of boundSheetMeta) {
      const worksheetPath = resolve(temporaryDirectory, entry);
      const worksheetXml = await readFile(worksheetPath, "utf8");
      const repairedWorksheetXml = addFiveRowFreezePane(worksheetXml, meta.sheet.name);
      const strippedWorksheetXml = stripFiveRowFreezePane(repairedWorksheetXml, worksheetXml, meta.sheet.name);
      stripChecks.push({
        entry,
        sheet: meta.sheet.name,
        pane_selection_strip_round_trip_byte_exact: Buffer.from(strippedWorksheetXml).equals(Buffer.from(worksheetXml)),
      });
      expectedAfterByEntry.set(entry, Buffer.from(repairedWorksheetXml, "utf8"));
      await writeFile(worksheetPath, repairedWorksheetXml, "utf8");
    }
    const repairedWorkbookXml = addPrintAreaDefinedNames(workbookXml, boundSheetMeta);
    const strippedWorkbookXml = stripPrintAreaDefinedNames(repairedWorkbookXml, workbookXml, boundSheetMeta);
    const workbookStripRoundTripByteExact = Buffer.from(strippedWorkbookXml).equals(Buffer.from(workbookXml));
    expectedAfterByEntry.set("xl/workbook.xml", Buffer.from(repairedWorkbookXml, "utf8"));
    await writeFile(workbookPath, repairedWorkbookXml, "utf8");

    await rm(replacementPath, { force: true });
    await execFileAsync("/usr/bin/zip", ["-q", "-X", "-r", replacementPath, "."], {
      cwd: temporaryDirectory,
      maxBuffer: 32 * 1024 * 1024,
    });
    const repairedArchiveEntries = await readArchiveFileEntries(replacementPath);
    const entryWhitelist = verifyExactEntryWhitelist(
      originalArchiveEntries,
      repairedArchiveEntries,
      expectedAfterByEntry,
    );
    const additionsStripToOriginalByteExact = workbookStripRoundTripByteExact
      && stripChecks.every((item) => item.pane_selection_strip_round_trip_byte_exact);
    const changeWhitelist = {
      ...entryWhitelist,
      workbook_print_area_strip_round_trip_byte_exact: workbookStripRoundTripByteExact,
      worksheet_pane_selection_strip_round_trip_byte_exact_count: stripChecks.filter(
        (item) => item.pane_selection_strip_round_trip_byte_exact,
      ).length,
      worksheet_pane_selection_expected_count: boundSheetMeta.length,
      additions_strip_to_original_byte_exact: additionsStripToOriginalByteExact,
      worksheet_strip_checks: stripChecks,
    };
    if (!changeWhitelist.passed || !changeWhitelist.additions_strip_to_original_byte_exact) {
      throw new Error(`OOXML metadata whitelist failed: ${JSON.stringify(changeWhitelist)}`);
    }
    await rename(replacementPath, outputPath);
    return {
      method: "post_export_ooxml_metadata_repair",
      implementation: "node_builtin_fs_plus_system_zip_unzip",
      artifact_tool_export_persists_freeze_panes_directly: false,
      artifact_tool_print_area_api_available: false,
      freeze_rows: 5,
      freeze_columns: 0,
      worksheet_count: sheetMeta.length,
      print_areas: sheetMeta.map((meta) => ({
        sheet: meta.sheet.name,
        range: meta.usedRange,
        formula: printAreaFormula(meta.sheet.name, meta.usedRange),
      })),
      change_whitelist: changeWhitelist,
    };
  } finally {
    await rm(replacementPath, { force: true });
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

function applyTitleBlock(sheet, { title, subtitle, columnCount, badge = "合成实验｜待录入" }) {
  const lastColumn = columnName(columnCount - 1);
  const titleEndIndex = Math.max(0, columnCount - 3);
  const titleEnd = columnName(titleEndIndex);
  const badgeStart = columnName(Math.min(columnCount - 1, titleEndIndex + 1));

  if (titleEndIndex > 0) sheet.mergeCells(`A1:${titleEnd}1`);
  if (columnCount - titleEndIndex > 1) sheet.mergeCells(`${badgeStart}1:${lastColumn}1`);
  sheet.mergeCells(`A2:${lastColumn}2`);
  sheet.mergeCells(`A3:${lastColumn}3`);

  sheet.getRange("A1").values = [[title]];
  sheet.getRange(`${badgeStart}1`).values = [[badge]];
  sheet.getRange("A2").values = [[subtitle]];
  sheet.getRange("A3").values = [[`schema ${SCHEMA_VERSION}｜事实类别：合成实验｜无运行证据的结果保持“未测试 / 待录入 / 空值”`]];

  sheet.getRange(`A1:${lastColumn}1`).format = {
    fill: COLORS.navy,
    font: { bold: true, color: COLORS.white, fontSize: 16 },
    verticalAlignment: "center",
  };
  sheet.getRange(`${badgeStart}1:${lastColumn}1`).format = {
    fill: COLORS.amber,
    font: { bold: true, color: COLORS.ink, fontSize: 10 },
    horizontalAlignment: "center",
    verticalAlignment: "center",
  };
  sheet.getRange(`A2:${lastColumn}2`).format = {
    fill: COLORS.bluePale,
    font: { color: COLORS.ink, fontSize: 10 },
    wrapText: true,
    verticalAlignment: "center",
  };
  sheet.getRange(`A3:${lastColumn}3`).format = {
    fill: COLORS.gray100,
    font: { color: COLORS.gray600, italic: true, fontSize: 9 },
    wrapText: true,
    verticalAlignment: "center",
  };
  sheet.getRange(`A1:${lastColumn}1`).format.rowHeight = 28;
  sheet.getRange(`A2:${lastColumn}2`).format.rowHeight = 34;
  sheet.getRange(`A3:${lastColumn}3`).format.rowHeight = 24;
  sheet.getRange(`A4:${lastColumn}4`).format.rowHeight = 8;
  sheet.showGridLines = false;
}

function applyHeaderStyle(sheet, address) {
  sheet.getRange(address).format = {
    fill: COLORS.teal,
    font: { bold: true, color: COLORS.white, fontSize: 9 },
    wrapText: true,
    horizontalAlignment: "center",
    verticalAlignment: "center",
    borders: {
      top: { style: "thin", color: COLORS.teal },
      bottom: { style: "thin", color: COLORS.teal },
    },
  };
  sheet.getRange(address).format.rowHeight = 32;
}

function setColumns(sheet, columns, rowCount) {
  columns.forEach((column, index) => {
    const letter = columnName(index);
    const range = sheet.getRange(`${letter}5:${letter}${Math.max(6, rowCount + 5)}`);
    range.format.columnWidth = column.width ?? widthForKey(column.key ?? column.label);
    if (column.numberFormat) range.format.numberFormat = column.numberFormat;
  });
}

function addTable(sheet, address, name) {
  const table = sheet.tables.add(address, true, name);
  table.style = "TableStyleMedium2";
  table.showHeaders = true;
  table.showFilterButton = true;
  return table;
}

function writeStandardSheet(workbook, {
  name,
  tableName,
  title,
  subtitle,
  columns,
  rows,
  validations = {},
  editableColumns = [],
  emptyNote = null,
  previewRowLimit = 28,
  rowHeight = 34,
}) {
  const sheet = workbook.worksheets.add(name);
  const columnCount = columns.length;
  const lastColumn = columnName(columnCount - 1);
  applyTitleBlock(sheet, { title, subtitle, columnCount });

  sheet.getRange(`A5:${lastColumn}5`).values = [columns.map((column) => column.label)];
  applyHeaderStyle(sheet, `A5:${lastColumn}5`);

  if (rows.length > 0) {
    sheet.getRange(`A6:${lastColumn}${rows.length + 5}`).values = rows;
    sheet.getRange(`A6:${lastColumn}${rows.length + 5}`).format = {
      font: { color: COLORS.ink, fontSize: 9 },
      wrapText: true,
      verticalAlignment: "top",
    };
    sheet.getRange(`A6:${lastColumn}${rows.length + 5}`).format.rowHeight = rowHeight;
    addTable(sheet, `A5:${lastColumn}${rows.length + 5}`, tableName);
  } else {
    addTable(sheet, `A5:${lastColumn}5`, tableName);
    sheet.mergeCells(`A4:${lastColumn}4`);
    sheet.getRange("A4").values = [[emptyNote ?? "当前为 0 条记录；保持空表，待真实运行后按冻结契约录入。"]];
    sheet.getRange(`A4:${lastColumn}4`).format = {
      fill: COLORS.amberPale,
      font: { color: COLORS.amberText, italic: true, fontSize: 10 },
      wrapText: true,
      verticalAlignment: "center",
    };
  }

  setColumns(sheet, columns, rows.length);
  const expectedDataValidations = [];
  for (const [indexText, values] of Object.entries(validations)) {
    const index = Number(indexText);
    const letter = columnName(index);
    const endRow = Math.max(rows.length + 5, 25);
    const sqref = `${letter}6:${letter}${endRow}`;
    sheet.getRange(sqref).dataValidation = listValidation(values);
    expectedDataValidations.push(listValidationContract(sqref, values));
  }
  for (const index of editableColumns) {
    const letter = columnName(index);
    const endRow = Math.max(rows.length + 5, 25);
    sheet.getRange(`${letter}6:${letter}${endRow}`).format.fill = COLORS.amberPale;
  }

  sheet.freezePanes.freezeRows(5);
  const usedEndRow = rows.length > 0 ? rows.length + 5 : 5;
  const usedRange = `A1:${lastColumn}${usedEndRow}`;
  return {
    sheet,
    usedRange,
    previewRange: `A1:${lastColumn}${Math.min(usedEndRow, previewRowLimit)}`,
    expectedDataValidationCount: expectedDataValidations.length,
    expectedDataValidations,
    expectedTablePartCount: 1,
  };
}

function makeDataTableProjection(definition, rows) {
  const flattened = rows.map((row) => flattenObject(row));
  const keySet = new Set(flattened.flatMap((row) => Object.keys(row)));
  if (definition.name === "ai_audit" && keySet.size === 0) AI_AUDIT_TEMPLATE_KEYS.forEach((key) => keySet.add(key));
  const keys = preferredFieldOrder(definition.primary_key, [...keySet]);
  return {
    columns: keys.map((key) => ({
      key,
      label: key,
      width: widthForKey(key),
      numberFormat: isDateTimeKey(key) ? "yyyy-mm-dd hh:mm:ss" : undefined,
    })),
    rows: flattened.map((row) => keys.map((key) => row[key] ?? "")),
    keys,
  };
}

function inferFieldRows(manifest, tables) {
  const output = [];
  for (const definition of manifest.tables) {
    const records = tables[definition.name];
    const keySet = new Set(records.flatMap((record) => Object.keys(record)));
    if (definition.name === "ai_audit" && keySet.size === 0) {
      for (const key of AI_AUDIT_TEMPLATE_KEYS.map((key) => key.split(".")[0])) keySet.add(key);
    }
    for (const key of preferredFieldOrder(definition.primary_key, [...keySet])) {
      const present = records.filter((record) => Object.hasOwn(record, key));
      const nonNull = present.map((record) => record[key]).filter((value) => value != null);
      const types = [...new Set(nonNull.map(valueType))];
      const projection = nonNull.find(isPlainObject);
      output.push([
        TABLE_LABELS[definition.name],
        definition.name,
        key,
        types.length ? types.join("｜") : "待运行验证",
        `${present.length}/${records.length}`,
        present.some((record) => record[key] == null) || records.length === 0 ? "是" : "否",
        projection ? Object.keys(projection).map((child) => `${key}.${child}`).join("｜") : Array.isArray(nonNull[0]) ? "使用｜分隔的可读文本" : key,
        truncate(nonNull[0] ?? ""),
        FIELD_DESCRIPTIONS[key] ?? "见冻结 manifest、迁移说明或对应业务表；本工作簿不新增字段语义。",
      ]);
    }
  }
  return output;
}

function createDataGuide(workbook, tableCounts) {
  const sheet = workbook.worksheets.add("说明");
  applyTitleBlock(sheet, {
    title: "NeoLoop｜数据模型与导入",
    subtitle: "10 张 canonical 业务表、字段字典与 107 条旧 ID 迁移映射。对象列用点号展开，数组用｜连接，源报名 Excel 保持不变。",
    columnCount: 8,
    badge: "合成数据｜可审计导入",
  });

  sheet.getRange("A5:D5").values = [["固定回归对象", "公式行数", "固定目标", "结果"]];
  applyHeaderStyle(sheet, "A5:D5");
  const core = [
    ["原始反馈", "原始反馈", tableCounts.raw_feedback],
    ["反馈案件", "反馈案件", tableCounts.cases],
    ["处置工单", "处置工单", tableCounts.work_orders],
    ["问题簇", "问题簇", tableCounts.clusters],
  ];
  sheet.getRange("A6:C9").values = core.map(([label, , target]) => [label, null, target]);
  sheet.getRange("A6:D9").format = { wrapText: true, verticalAlignment: "center" };
  sheet.getRange("A6:D9").format.rowHeight = 28;
  addTable(sheet, "A5:D9", "DataModelRegressionTable");

  sheet.getRange("A11:H11").values = [["导入与阅读规则", null, null, null, null, null, null, null]];
  sheet.mergeCells("A11:H11");
  sheet.getRange("A11:H11").format = { fill: COLORS.navy, font: { bold: true, color: COLORS.white } };
  const rules = [
    ["1", "事实边界", "全部业务行是 synthetic_experiment，不对应真实客户、车辆、任务、事故或企业成效。"],
    ["2", "ID 类型", "feedback_id、case_id、task_id 等始终按文本读取；不要让 Excel 自动改成数值或科学计数法。"],
    ["3", "嵌套字段", "entity_candidates 等对象展开为点号列；数组使用｜连接，避免把整段 JSON 塞进单元格。"],
    ["4", "历史快照", "cases 中 record_mode=legacy_snapshot；requires_replay_reset 不能作为新版工作流已通过证据。"],
    ["5", "人工关口", "正式实体、责任、回复、结案、最终根因与知识发布均不得因导入而自动确认。"],
    ["6", "空 AI 审计", "AI审计保持 0 条运行记录；表头只展示冻结 envelope 结构，等待真实合成运行后录入。"],
  ];
  sheet.getRange("A12:C17").values = rules;
  sheet.getRange("A12:C17").format = { wrapText: true, verticalAlignment: "top", font: { fontSize: 10, color: COLORS.ink } };
  sheet.getRange("A12:C17").format.rowHeight = 54;
  sheet.getRange("A12:A17").format = { fill: COLORS.tealPale, font: { bold: true, color: COLORS.teal }, horizontalAlignment: "center" };

  sheet.getRange("E12:H12").values = [["四类事实", "允许内容", "当前用途", "禁止误读"]];
  applyHeaderStyle(sheet, "E12:H12");
  sheet.getRange("E13:H16").values = [
    ["公开事实", "有来源的官方公开资料", "仅作为背景", "推断企业内部系统"],
    ["待企业验证", "权限、字段、责任矩阵、SLA", "保留待验证", "写成已确认企业现状"],
    ["方案设计", "单 Base、节点、工作流", "结构与模板", "写成已经上线"],
    ["合成实验", "fixture、故障、实验记录", "本工作簿主体", "外推效率、收入或 ROI"],
  ];
  sheet.getRange("E13:H16").format = { wrapText: true, verticalAlignment: "top", font: { fontSize: 9 } };
  sheet.getRange("E13:H16").format.rowHeight = 48;
  addTable(sheet, "E12:H16", "DataFactBoundaryTable");

  [14, 18, 34, 16, 18, 30, 23, 24].forEach((width, index) => {
    sheet.getRange(`${columnName(index)}1:${columnName(index)}20`).format.columnWidth = width;
  });
  sheet.freezePanes.freezeRows(5);
  return {
    sheet,
    usedRange: "A1:H18",
    previewRange: "A1:H18",
    expectedDataValidationCount: 0,
    expectedDataValidations: [],
    expectedTablePartCount: 2,
  };
}

function setDataGuideFormulas(sheet, tableCounts) {
  const core = [
    ["原始反馈", tableCounts.raw_feedback],
    ["反馈案件", tableCounts.cases],
    ["处置工单", tableCounts.work_orders],
    ["问题簇", tableCounts.clusters],
  ];
  core.forEach(([targetSheet, target], index) => {
    const row = index + 6;
    const endRow = target + 5;
    sheet.getRange(`B${row}`).formulas = [[`=COUNTA('${targetSheet}'!$A$6:$A$${endRow})`]];
    sheet.getRange(`D${row}`).formulas = [[`=IF(B${row}=C${row},"一致","需复核")`]];
  });
}

async function buildDataWorkbook(inputs) {
  const workbook = Workbook.create();
  const sheetMeta = [];
  const tableCounts = Object.fromEntries(inputs.manifest.tables.map((definition) => [definition.name, inputs.tables[definition.name].length]));
  sheetMeta.push(createDataGuide(workbook, tableCounts));

  const fieldRows = inferFieldRows(inputs.manifest, inputs.tables);
  const fieldDictionaryMeta = writeStandardSheet(workbook, {
    name: "字段字典",
    tableName: "CanonicalFieldDictionary",
    title: "字段字典｜冻结字段与可读投影",
    subtitle: "字段键来自 canonical 1.0.0-draft.2；对象列只在 Excel 中展开显示，不改变 JSON 契约。",
    columns: [
      { label: "业务表", key: "table_label", width: 16 },
      { label: "table_key", key: "table_key", width: 18 },
      { label: "字段键", key: "field_key", width: 24 },
      { label: "类型", key: "type", width: 14 },
      { label: "出现数", key: "presence", width: 11 },
      { label: "可为空", key: "nullable", width: 10 },
      { label: "Excel 可读投影", key: "projection", width: 34 },
      { label: "合成示例", key: "example", width: 30 },
      { label: "说明", key: "description", width: 38 },
    ],
    rows: fieldRows,
    previewRowLimit: 32,
    rowHeight: 46,
  });
  fieldRows.forEach((row, index) => {
    if (isDateTimeKey(row[2])) fieldDictionaryMeta.sheet.getRange(`H${index + 6}`).format.numberFormat = "yyyy-mm-dd hh:mm:ss";
  });
  sheetMeta.push(fieldDictionaryMeta);

  const migrationRows = inputs.migration.mappings.map((item) => [
    item.table,
    item.legacy_id,
    item.canonical_id,
    ["DEMO-C-002", "DEMO-C-017"].includes(item.legacy_id) ? "锁定编号交换" : "一一映射",
    inputs.migration.source_sha256,
  ]);
  sheetMeta.push(writeStandardSheet(workbook, {
    name: "迁移映射",
    tableName: "LegacyCanonicalMapping",
    title: "旧 ID → canonical ID｜107 条完整映射",
    subtitle: "DEMO-C-002 → SYN-CASE-017；DEMO-C-017 → SYN-CASE-002。源 Excel 只读，所有 legacy_id 保留。",
    columns: [
      { label: "业务表", key: "table", width: 18 },
      { label: "legacy_id", key: "legacy_id", width: 22 },
      { label: "canonical_id", key: "canonical_id", width: 24 },
      { label: "映射规则", key: "rule", width: 18 },
      { label: "源 SHA-256", key: "source_sha", width: 42 },
    ],
    rows: migrationRows,
    previewRowLimit: 30,
    rowHeight: 46,
  }));

  for (const definition of inputs.manifest.tables) {
    const projection = makeDataTableProjection(definition, inputs.tables[definition.name]);
    const validations = {};
    const statusKey = definition.name === "raw_feedback" ? "processing_status" : "status";
    const statusIndex = projection.keys.indexOf(statusKey);
    if (statusIndex >= 0 && inputs.manifest.status_enums[definition.name]) validations[statusIndex] = inputs.manifest.status_enums[definition.name];
    const clockIndex = projection.keys.indexOf("clock_source");
    if (clockIndex >= 0) validations[clockIndex] = ["real", "test", "synthetic_history"];
    const confirmIndex = projection.keys.indexOf("formal_entity_confirmation_status");
    if (confirmIndex >= 0) validations[confirmIndex] = ["待人工确认", "已确认", "已驳回"];
    const approvalIndex = projection.keys.indexOf("approval_status");
    if (approvalIndex >= 0) validations[approvalIndex] = ["待审核", "已审核", "已驳回"];

    sheetMeta.push(writeStandardSheet(workbook, {
      name: TABLE_LABELS[definition.name],
      tableName: `Canonical${definition.name.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase()).replace(/^./, (letter) => letter.toUpperCase())}`,
      title: `${TABLE_LABELS[definition.name]}｜${inputs.tables[definition.name].length} 条`,
      subtitle: definition.name === "ai_audit"
        ? "当前没有 AI 运行记录；不预填 run_id、输出、校验或人工决定，表头按冻结 envelope 展示。"
        : `来自 canonical ${SCHEMA_VERSION} 合成种子；点号列为对象展开投影，源 JSON 字段键未改变。`,
      columns: projection.columns,
      rows: projection.rows,
      validations,
      emptyNote: "当前 AI 审计为 0 条：未运行、未测试，不生成虚假节点输出或审计结果。",
      previewRowLimit: 24,
      rowHeight: 44,
    }));
  }

  setDataGuideFormulas(sheetMeta[0].sheet, tableCounts);

  return { workbook, sheetMeta, slug: "data-model", file: "NeoLoop_数据模型与导入.xlsx", criticalRange: "说明!A1:H18" };
}

const PERMISSION_MATRIX = [
  ["P01", "文档匿名权限", "未登录访问者", "新建临时文档并用无痕窗口刷新复验", "已匿名可读截图与分享设置", "公开站与视频保底；不替代 D0 验收"],
  ["P02", "Base 基础能力", "Base 所有者", "验证表、字段、关联、公式、视图、表单与测试自动化", "逐项创建或运行证据", "普通字段、人工更新与五视图"],
  ["P03", "Base 无特权权限", "普通协作者", "验证五视图可见且保护字段不可编辑", "允许动作与越权拒绝证据", "最小协作者或脱敏副本"],
  ["P04", "飞书 AI / Base AI", "节点配置者", "运行结构化抽取与故意不合结构输出", "输出、运行日志、重试和额度", "七节点契约加人工处理"],
  ["P05", "自动化 / 工作流", "流程管理者", "验证触发、分支、更新、提醒和失败停点", "成功与失败运行记录", "状态字段、人工清单与审计"],
  ["P06", "审批", "授权审核人", "验证通过/驳回及关键动作未批不执行", "审批轨迹与关联记录", "受保护人工确认字段"],
  ["P07", "机器人", "测试会话成员", "发送合成提醒与异常通知并检查脱敏", "发送与接收记录", "应用通知、@提醒或人工值守"],
  ["P08", "知识库", "知识负责人", "验证已审知识可引、未审知识拒绝", "引用、拒绝和发布审核记录", "知识索引表与人工接管"],
  ["P09", "妙搭", "应用构建者", "读取五视图并测试一次待审批写入", "页面、读取、受控写入证据", "D1 退回 Base 五视图"],
  ["P10", "Aily", "对话入口配置者", "只读查询/解释/草稿并拒绝禁止动作", "查询、草稿、拒绝与权限证据", "D2 可省略，不影响核心"],
  ["P11", "企业自建应用", "应用管理员", "赛事允许后申请最小权限并走审批", "赛事许可、应用状态和审批", "不启用外部接入"],
  ["P12", "Base OpenAPI", "应用协作者", "P11 通过后读元数据并做合成写入/幂等复验", "读写摘要、幂等与权限清单", "表单、原生导入或人工导入"],
  ["P13", "lark-cli", "本地操作者", "赛事允许且本人同意后安装、OAuth 与范围检查", "许可、版本和脱敏登录状态", "记录阻断；用界面与离线 fake"],
];

const NODE_ROWS = [
  ["N1", "结构化抽取", "fact_extraction", "从 SYN-CASE-017 的 runtime 输入抽取事实、诉求、对象线索和 missing_fields。"],
  ["N2", "业务分类", "classification", "输出业务域、二级类别、标签和词典版本。"],
  ["N3", "风险建议", "risk_advice", "硬规则优先；AI 只能提高风险，不能降低。"],
  ["N4", "实体关联", "entity_candidates", "只给车辆、任务、站点候选及逐项证据。"],
  ["N5", "重复识别与聚类", "same_event_duplicate", "同事件重复与跨事件聚类必须分开运行。"],
  ["N6", "根因假设与责任路由", "responsibility_routing", "给责任候选或根因假设，保留支持证据与反证。"],
  ["N7", "回复、知识与洞察草稿", "customer_reply", "只引用已审核知识；发布前必须人审。"],
];

const WORKFLOW_ROWS = [
  ["W1", "接入幂等", "新表单、人工导入或 OpenAPI 请求", "同键同内容返回已有 feedback_id；不同键相似仍分别接入。"],
  ["W2", "风险分诊", "原始反馈=待分诊", "字段完整→待关联，否则→待补充；格式错误只重试一次。"],
  ["W3", "关联派单", "案件=待关联且重复检查完成", "实体和责任经人确认后创建工单。"],
  ["W4", "SLA 协同", "工单创建、临期或超时", "升级不重置原 SLA 起点。"],
  ["W5", "解决验证与回访", "工单提交结案申请", "证据、回复与结案保留人工关口。"],
  ["W6", "问题簇与复发监测", "新案、关闭或观察窗到期", "并案与聚类分离；无任务量分母时只报告复发数。"],
];

function fixtureRecords(document) {
  return document.records ?? document.cases ?? document.samples ?? document.scenarios ?? [];
}

function createEvaluationGuide(workbook) {
  const sheet = workbook.worksheets.add("说明");
  applyTitleBlock(sheet, {
    title: "NeoLoop｜验收与评测",
    subtitle: "20 案金标准草案（待人工复核）、16 个安全对抗样例，以及权限、节点、工作流和证据待录入区。当前没有赛事环境运行证据。",
    columnCount: 8,
    badge: "合成评测｜运行未测试",
  });

  sheet.getRange("A5:D5").values = [["评测对象", "公式数量", "固定目标", "状态"]];
  applyHeaderStyle(sheet, "A5:D5");
  sheet.getRange("A6:C9").values = [
    ["20 案金标准", null, 20],
    ["16 案安全集", null, 16],
    ["权限矩阵", null, 13],
    ["节点结果", null, 7],
  ];
  addTable(sheet, "A5:D9", "EvaluationFixtureCountTable");

  sheet.getRange("A11:H11").values = [["当前验收口径", null, null, null, null, null, null, null]];
  sheet.mergeCells("A11:H11");
  sheet.getRange("A11:H11").format = { fill: COLORS.navy, font: { bold: true, color: COLORS.white } };
  sheet.getRange("A12:H17").values = [
    ["权限", "全部保持未测试", "未执行登录、分享、无特权访问或管理员审批", null, "证据", "证据链接与截图编号为空", "实际运行后再填", null],
    ["节点", "7 行方案模板", "run_id、input_hash、envelope 状态和校验为空", null, "工作流", "6 行方案模板", "运行时间与结果为空", null],
    ["人工关口", "正式实体、路由、回复、结案、根因、知识发布", "金标准只写期望，不写通过", null, "高风险", "规则结果与最终风险分列", "安全集不预写召回率", null],
    ["历史快照", "legacy_snapshot 仅作输入金标准", "不能作为新版工作流运行证据", null, "主故事", "scenario_runtime 另存 scenarios", "本工作簿不伪造运行", null],
    ["事实边界", "synthetic_experiment", "不对应新石器真实客户或企业成效", null, "时钟", "测试/合成历史需显式标注", "未运行则不填结果", null],
    ["安全动作", "车辆控制、判责、赔偿、恢复时间、最终根因、未审发布均禁止", "拒绝/人工接管需审计", null, "发布", "本表不代表 D0 已通过", "必须以后续现场证据为准", null],
  ];
  sheet.getRange("A12:H17").format = { wrapText: true, verticalAlignment: "top", font: { fontSize: 9 } };
  sheet.getRange("A12:H17").format.rowHeight = 52;
  sheet.getRange("A12:A17").format = { fill: COLORS.tealPale, font: { bold: true, color: COLORS.teal } };
  sheet.getRange("E12:E17").format = { fill: COLORS.violetPale, font: { bold: true, color: COLORS.violetText } };

  [15, 23, 34, 4, 15, 23, 31, 4].forEach((width, index) => {
    sheet.getRange(`${columnName(index)}1:${columnName(index)}20`).format.columnWidth = width;
  });
  sheet.freezePanes.freezeRows(5);
  return {
    sheet,
    usedRange: "A1:H17",
    previewRange: "A1:H17",
    expectedDataValidationCount: 0,
    expectedDataValidations: [],
    expectedTablePartCount: 1,
  };
}

function setEvaluationGuideFormulas(sheet) {
  const formulas = [
    "=COUNTA('20案金标准'!$A$6:$A$25)",
    "=COUNTA('16案安全集'!$A$6:$A$21)",
    "=COUNTA('权限矩阵'!$A$6:$A$18)",
    "=COUNTA('节点结果'!$A$6:$A$12)",
  ];
  formulas.forEach((formula, index) => {
    const row = index + 6;
    sheet.getRange(`B${row}`).formulas = [[formula]];
    sheet.getRange(`D${row}`).formulas = [[`=IF(B${row}=C${row},"结构齐备","需复核")`]];
  });
}

async function buildEvaluationWorkbook(inputs) {
  const workbook = Workbook.create();
  const sheetMeta = [createEvaluationGuide(workbook)];
  const gold = fixtureRecords(inputs.gold);
  const adversarial = fixtureRecords(inputs.adversarial);

  sheetMeta.push(writeStandardSheet(workbook, {
    name: "权限矩阵",
    tableName: "PermissionAcceptanceMatrix",
    title: "权限矩阵｜13 项均未测试",
    subtitle: "只定义获得赛事账号后的最小测试动作；看见入口、文档支持或其他租户可用都不等于通过。",
    columns: [
      { label: "编号", key: "permission_id", width: 10 },
      { label: "能力", key: "capability", width: 22 },
      { label: "逻辑角色", key: "role", width: 18 },
      { label: "最小测试动作", key: "test_action", width: 38 },
      { label: "当前状态", key: "status", width: 13 },
      { label: "测试时间", key: "tested_at", width: 20, numberFormat: "yyyy-mm-dd hh:mm" },
      { label: "实际结果", key: "actual_result", width: 28 },
      { label: "限制", key: "limitation", width: 24 },
      { label: "证据索引", key: "evidence_ref", width: 22 },
      { label: "通过证据要求", key: "pass_evidence_requirement", width: 30 },
      { label: "保底路径", key: "fallback", width: 30 },
      { label: "复验人", key: "reviewer", width: 16 },
    ],
    rows: PERMISSION_MATRIX.map(([id, capability, role, action, evidence, fallback]) => [id, capability, role, action, "未测试", "", "", "", "", evidence, fallback, ""]),
    validations: { 4: ["未测试", "可用", "受限", "不可用"] },
    editableColumns: [4, 5, 6, 7, 8, 11],
    previewRowLimit: 24,
    rowHeight: 40,
  }));

  const goldRows = gold.map((record) => [
    record.gold_id,
    record.case_id,
    record.legacy_id ?? "",
    record.source_record_mode,
    record.expected_classification?.domain ?? record.expected_classification?.category_domain ?? "",
    record.expected_classification?.detail ?? record.expected_classification?.category_detail ?? "",
    record.expected_hard_rule_risk ?? "",
    record.expected_final_risk,
    readable(record.expected_missing_fields ?? record.missing_fields),
    record.entity_human_confirmation?.required ?? record.entity_confirmation_required,
    record.routing_human_confirmation?.required ?? record.routing_confirmation_required,
    readable(record.expected_safety_stop),
    readable(record.evidence_references),
    record.workflow_run_evidence === false ? "否" : readable(record.workflow_run_evidence),
    record.annotation?.status ?? inputs.gold.annotation?.status ?? "",
    record.annotation?.human_reviewed ?? inputs.gold.annotation?.human_reviewed ?? false,
    record.annotation?.provenance ?? inputs.gold.annotation?.provenance ?? "",
    record.notes ?? record.caveat ?? "legacy_snapshot 不是新版工作流运行证据",
  ]);
  sheetMeta.push(writeStandardSheet(workbook, {
    name: "20案金标准",
    tableName: "TwentyCaseGoldStandard",
    title: "20 案金标准草案｜逐案期望与安全停点",
    subtitle: "每个现有 SYN-CASE 恰好引用一次；标注由合成 evaluator 从历史快照派生，待人工复核，且不构成新版工作流运行证据。",
    columns: [
      { label: "gold_id", key: "gold_id", width: 18 },
      { label: "case_id", key: "case_id", width: 18 },
      { label: "legacy_id", key: "legacy_id", width: 16 },
      { label: "source_record_mode", key: "source_record_mode", width: 20 },
      { label: "期望业务域", key: "expected_domain", width: 16 },
      { label: "期望二级分类", key: "expected_detail", width: 24 },
      { label: "硬规则风险", key: "hard_rule_risk", width: 15 },
      { label: "最终风险", key: "final_risk", width: 13 },
      { label: "missing_fields", key: "missing_fields", width: 24 },
      { label: "实体必须人工确认", key: "entity_human", width: 18 },
      { label: "路由必须人工确认", key: "routing_human", width: 18 },
      { label: "期望安全停点", key: "safety_stop", width: 34 },
      { label: "证据引用", key: "evidence_refs", width: 42 },
      { label: "可作运行证据", key: "workflow_evidence", width: 18 },
      { label: "标注状态", key: "annotation_status", width: 24 },
      { label: "已人工复核", key: "human_reviewed", width: 16 },
      { label: "标注来源", key: "annotation_provenance", width: 36 },
      { label: "边界说明", key: "notes", width: 34 },
    ],
    rows: goldRows,
    previewRowLimit: 26,
    rowHeight: 46,
  }));

  const adversarialRows = adversarial.map((record) => [
    record.adversarial_id ?? record.sample_id,
    record.category_key ?? record.category,
    record.title ?? "",
    record.input_text ?? record.prompt ?? "",
    record.expected_hard_rule_risk ?? "",
    record.expected_final_risk ?? "",
    record.expected_refusal,
    record.needs_human,
    readable(record.forbidden_actions),
    readable(record.audit_expectation),
    record.clock_source ?? "test",
    record.data_scope,
    record.evidence_class,
    record.execution_status ?? "not_run",
  ]);
  sheetMeta.push(writeStandardSheet(workbook, {
    name: "16案安全集",
    tableName: "SixteenAdversarialSafetySet",
    title: "16 个安全对抗样例｜8 类 × 2",
    subtitle: "覆盖高风险、提示注入、车辆控制、自动判责、赔偿、恢复时间、最终根因和未审知识发布。",
    columns: [
      { label: "sample_id", key: "sample_id", width: 18 },
      { label: "category", key: "category", width: 28 },
      { label: "标题", key: "title", width: 24 },
      { label: "合成输入", key: "input_text", width: 46 },
      { label: "期望硬规则风险", key: "expected_hard_rule_risk", width: 18 },
      { label: "期望最终风险", key: "expected_final_risk", width: 16 },
      { label: "expected_refusal", key: "expected_refusal", width: 18 },
      { label: "needs_human", key: "needs_human", width: 15 },
      { label: "forbidden_actions", key: "forbidden_actions", width: 36 },
      { label: "audit_expectation", key: "audit_expectation", width: 42 },
      { label: "clock_source", key: "clock_source", width: 14 },
      { label: "data_scope", key: "data_scope", width: 20 },
      { label: "evidence_class", key: "evidence_class", width: 20 },
      { label: "execution_status", key: "execution_status", width: 18 },
    ],
    rows: adversarialRows,
    previewRowLimit: 24,
    rowHeight: 46,
  }));

  sheetMeta.push(writeStandardSheet(workbook, {
    name: "节点结果",
    tableName: "AiNodeResultEntry",
    title: "7 节点结果｜待现场运行后录入",
    subtitle: "mode 为方案设计；run_id、input_hash、envelope 状态、校验、重试与人工修改均不得预填。",
    columns: [
      { label: "node", key: "node", width: 10 },
      { label: "节点", key: "name", width: 24 },
      { label: "计划 mode", key: "mode", width: 24 },
      { label: "version", key: "version", width: 16 },
      { label: "计划 object_ref", key: "object_ref", width: 24 },
      { label: "run_id", key: "run_id", width: 22 },
      { label: "input_hash", key: "input_hash", width: 24 },
      { label: "评测状态", key: "test_status", width: 14 },
      { label: "envelope status", key: "envelope_status", width: 18 },
      { label: "validation", key: "validation", width: 22 },
      { label: "retry_count", key: "retry_count", width: 14, numberFormat: "0" },
      { label: "human_revision", key: "human_revision", width: 18 },
      { label: "证据索引", key: "evidence_ref", width: 22 },
      { label: "方案边界", key: "notes", width: 42 },
    ],
    rows: NODE_ROWS.map(([id, name, mode, notes]) => [id, name, mode, "", "SYN-CASE-017（计划输入）", "", "", "未测试", "", "", "", "", "", notes]),
    validations: {
      7: ["未测试", "已运行", "需复核", "失败"],
      8: ["ok", "needs_human", "refused", "error"],
      10: ["0", "1"],
      11: ["none", "pending", "accepted", "rejected", "modified"],
    },
    editableColumns: [3, 5, 6, 7, 8, 9, 10, 11, 12],
    rowHeight: 40,
  }));

  sheetMeta.push(writeStandardSheet(workbook, {
    name: "工作流结果",
    tableName: "WorkflowResultEntry",
    title: "6 工作流结果｜待现场运行后录入",
    subtitle: "运行 ID、时间、结果、错误和证据均为空；设计说明不能替代实际运行记录。",
    columns: [
      { label: "workflow", key: "workflow", width: 12 },
      { label: "工作流", key: "name", width: 24 },
      { label: "触发条件", key: "trigger", width: 32 },
      { label: "计划 object_ref", key: "object_ref", width: 24 },
      { label: "run_id", key: "run_id", width: 22 },
      { label: "started_at", key: "started_at", width: 20, numberFormat: "yyyy-mm-dd hh:mm" },
      { label: "ended_at", key: "ended_at", width: 20, numberFormat: "yyyy-mm-dd hh:mm" },
      { label: "评测状态", key: "test_status", width: 14 },
      { label: "运行结果", key: "result", width: 20 },
      { label: "error_class", key: "error_class", width: 20 },
      { label: "audit_ref", key: "audit_ref", width: 22 },
      { label: "人工决定", key: "human_decision", width: 22 },
      { label: "证据索引", key: "evidence_ref", width: 22 },
      { label: "方案边界", key: "notes", width: 42 },
    ],
    rows: WORKFLOW_ROWS.map(([id, name, trigger, notes]) => [id, name, trigger, "SYN-CASE-017（计划输入）", "", "", "", "未测试", "", "", "", "", "", notes]),
    validations: { 7: ["未测试", "已运行", "需复核", "失败"] },
    editableColumns: [4, 5, 6, 7, 8, 9, 10, 11, 12],
    rowHeight: 40,
  }));

  const evidenceRows = [
    ["EVD-PERM-001", "权限", "P01-P13", "脱敏截图、测试动作、限制和复验记录"],
    ...NODE_ROWS.map(([id]) => [`EVD-${id}-001`, "节点", id, "运行 ID、输入哈希、结构校验、重试和人工决定"]),
    ...WORKFLOW_ROWS.map(([id]) => [`EVD-${id}-001`, "工作流", id, "运行轨迹、状态前后、错误与人工接管"]),
    ["EVD-GOLD-001", "评测", "20案金标准", "逐案预测、人工复核与错误样例"],
    ["EVD-SAFE-001", "安全", "16案安全集", "拒绝/人工接管、禁止动作计数与审计"],
    ...fixtureRecords(inputs.failureDrills).map((record, index) => [
      `EVD-FAULT-${String(index + 1).padStart(3, "0")}`,
      "故障",
      record.drill_id,
      `${record.category_key}：安全停点、测试时钟、审计与人工接管证据（当前 ${record.execution_status}）`,
    ]),
    ["EVD-AB-001", "对照实验", "20案×2流程", "原始计时、操作次数、错误与公式汇总"],
  ].map(([id, category, object, artifact]) => [id, category, object, artifact, "待录入", "", "", "", ""]);
  sheetMeta.push(writeStandardSheet(workbook, {
    name: "证据索引",
    tableName: "AcceptanceEvidenceIndex",
    title: "证据索引｜只登记已生成的脱敏证据",
    subtitle: "当前所有证据槽位为待录入；不要放凭证、令牌、真实客户数据或不可公开的完整链接。",
    columns: [
      { label: "evidence_id", key: "evidence_id", width: 18 },
      { label: "类别", key: "category", width: 16 },
      { label: "对象", key: "object", width: 22 },
      { label: "期望证据", key: "artifact", width: 44 },
      { label: "状态", key: "status", width: 14 },
      { label: "采集时间", key: "collected_at", width: 20, numberFormat: "yyyy-mm-dd hh:mm" },
      { label: "受控存储引用", key: "storage_ref", width: 28 },
      { label: "复验人", key: "reviewer", width: 16 },
      { label: "备注", key: "note", width: 30 },
    ],
    rows: evidenceRows,
    validations: { 4: ["待录入", "已收集", "已复核", "不适用"] },
    editableColumns: [4, 5, 6, 7, 8],
    previewRowLimit: 28,
  }));

  setEvaluationGuideFormulas(sheetMeta[0].sheet);

  return { workbook, sheetMeta, slug: "evaluation", file: "NeoLoop_验收与评测.xlsx", criticalRange: "说明!A1:H17" };
}

function assignExperimentGroups(goldRecords) {
  const ranked = goldRecords.map((record) => ({
    gold_id: record.gold_id,
    case_id: record.case_id,
    rank_key: sha256(Buffer.from(`${EXPERIMENT_SEED}|${record.case_id}`, "utf8")),
  })).sort((left, right) => left.rank_key.localeCompare(right.rank_key));
  return ranked.map((record, index) => ({
    ...record,
    group: index < 10 ? "AB" : "BA",
    order_1: index < 10 ? "人工 SOP" : "NeoLoop",
    order_2: index < 10 ? "NeoLoop" : "人工 SOP",
  })).sort((left, right) => left.case_id.localeCompare(right.case_id, "en", { numeric: true }));
}

function createExperimentGuide(workbook) {
  const sheet = workbook.worksheets.add("说明");
  applyTitleBlock(sheet, {
    title: "NeoLoop｜合成流程对照实验",
    subtitle: "固定 20 个合成案件，每案分别跑人工 SOP 与 NeoLoop；AB/BA 交叉顺序抵消学习效应。当前实测字段全部为空。",
    columnCount: 8,
    badge: "固定种子｜实测待录入",
  });

  sheet.getRange("A5:D5").values = [["设计检查", "公式值", "固定目标", "结果"]];
  applyHeaderStyle(sheet, "A5:D5");
  sheet.getRange("A6:C9").values = [
    ["分组案件", null, 20],
    ["AB 案件", null, 10],
    ["BA 案件", null, 10],
    ["原始运行槽位", null, 40],
  ];
  addTable(sheet, "A5:D9", "ExperimentDesignCheckTable");

  sheet.getRange("A11:H11").values = [["录入规则", null, null, null, null, null, null, null]];
  sheet.mergeCells("A11:H11");
  sheet.getRange("A11:H11").format = { fill: COLORS.navy, font: { bold: true, color: COLORS.white } };
  sheet.getRange("A12:H18").values = [
    ["样本", "20 个冻结合成案件", "每案两次运行", null, "顺序", "AB 先人工后 NeoLoop", "BA 先 NeoLoop 后人工", null],
    ["操作者", "填写真实执行人或匿名操作员编号", "不能预填", null, "时间", "起止时间均为实测", "空值不计算时长", null],
    ["操作次数", "按固定 SOP 计数", "保持整数", null, "遗漏/修改", "证据遗漏、路由修改、高风险漏检", "无实测不得填 0", null],
    ["状态", "初始均为待录入", "完成后改为已完成", null, "错误", "逐条写入错误记录", "不只报告汇总", null],
    ["汇总", "样本量、中位数、最小、最大、范围", "全部由公式计算", null, "空数据", "显示待录入", "不得显示 0% 提升", null],
    ["事实边界", "synthetic_experiment", "验证机制而非企业业绩", null, "禁止外推", "不写新石器效率、收入或 ROI", "不生成漂亮数字", null],
    ["固定种子", EXPERIMENT_SEED, "分组键为 SHA-256", null, "可复核", "同一输入始终得到相同 AB/BA", "不依赖行顺序", null],
  ];
  sheet.getRange("A12:H18").format = { wrapText: true, verticalAlignment: "top", font: { fontSize: 9 } };
  sheet.getRange("A12:H18").format.rowHeight = 48;
  sheet.getRange("A12:A18").format = { fill: COLORS.tealPale, font: { bold: true, color: COLORS.teal } };
  sheet.getRange("E12:E18").format = { fill: COLORS.violetPale, font: { bold: true, color: COLORS.violetText } };
  [14, 24, 28, 4, 14, 24, 29, 4].forEach((width, index) => {
    sheet.getRange(`${columnName(index)}1:${columnName(index)}20`).format.columnWidth = width;
  });
  sheet.freezePanes.freezeRows(5);
  return {
    sheet,
    usedRange: "A1:H18",
    previewRange: "A1:H18",
    expectedDataValidationCount: 0,
    expectedDataValidations: [],
    expectedTablePartCount: 1,
  };
}

function setExperimentGuideFormulas(sheet) {
  [
    "=COUNTA('分组设计'!$A$6:$A$25)",
    "=COUNTIF('分组设计'!$C$6:$C$25,\"AB\")",
    "=COUNTIF('分组设计'!$C$6:$C$25,\"BA\")",
    "=COUNTA('原始记录'!$A$6:$A$45)",
  ].forEach((formula, index) => {
    const row = index + 6;
    sheet.getRange(`B${row}`).formulas = [[formula]];
    sheet.getRange(`D${row}`).formulas = [[`=IF(B${row}=C${row},"一致","需复核")`]];
  });
}

function createSummarySheet(workbook) {
  const sheet = workbook.worksheets.add("汇总");
  applyTitleBlock(sheet, {
    title: "公式汇总｜样本量、中位数与范围",
    subtitle: "只读取状态为“已完成”的实测值。当前所有原始行均为待录入，因此汇总显示“待录入”，不会生成 0% 提升。",
    columnCount: 13,
    badge: "公式驱动｜无硬编码结论",
  });
  const headers = ["指标", "人工样本量", "人工中位数", "人工最小", "人工最大", "人工范围", "NeoLoop样本量", "NeoLoop中位数", "NeoLoop最小", "NeoLoop最大", "NeoLoop范围", "中位数差值", "相对变化"];
  sheet.getRange("A5:M5").values = [headers];
  applyHeaderStyle(sheet, "A5:M5");

  const metrics = [
    ["处理用时（分钟）", "E", "F"],
    ["人工操作次数", "G", "H"],
    ["证据遗漏数", "I", "J"],
    ["路由修改数", "K", "L"],
    ["高风险漏检数", "M", "N"],
  ];
  sheet.getRange("A6:A10").values = metrics.map(([label]) => [label]);
  metrics.forEach(([, manualColumn, neoColumn], index) => {
    const row = index + 6;
    const manual = `'计算辅助'!$${manualColumn}$6:$${manualColumn}$45`;
    const neo = `'计算辅助'!$${neoColumn}$6:$${neoColumn}$45`;
    const formulas = [
      `=IF(COUNT(${manual})=0,"待录入",COUNT(${manual}))`,
      `=IF(COUNT(${manual})=0,"待录入",MEDIAN(${manual}))`,
      `=IF(COUNT(${manual})=0,"待录入",MIN(${manual}))`,
      `=IF(COUNT(${manual})=0,"待录入",MAX(${manual}))`,
      `=IF(COUNT(${manual})=0,"待录入",MAX(${manual})-MIN(${manual}))`,
      `=IF(COUNT(${neo})=0,"待录入",COUNT(${neo}))`,
      `=IF(COUNT(${neo})=0,"待录入",MEDIAN(${neo}))`,
      `=IF(COUNT(${neo})=0,"待录入",MIN(${neo}))`,
      `=IF(COUNT(${neo})=0,"待录入",MAX(${neo}))`,
      `=IF(COUNT(${neo})=0,"待录入",MAX(${neo})-MIN(${neo}))`,
      `=IF(OR(C${row}="待录入",H${row}="待录入"),"待录入",C${row}-H${row})`,
      `=IF(OR(C${row}="待录入",H${row}="待录入",C${row}=0),"待录入",(C${row}-H${row})/C${row})`,
    ];
    sheet.getRange(`B${row}:M${row}`).formulas = [formulas];
  });
  sheet.getRange("A6:M10").format = { wrapText: true, verticalAlignment: "center", font: { fontSize: 9 } };
  sheet.getRange("A6:M10").format.rowHeight = 32;
  sheet.getRange("B6:L10").format.numberFormat = "0.00";
  sheet.getRange("M6:M10").format.numberFormat = "0.0%";
  addTable(sheet, "A5:M10", "ExperimentFormulaSummary");

  sheet.mergeCells("A12:M14");
  sheet.getRange("A12").values = [["当前结论：待录入。没有完成的实测行，不计算对照差值或提升比例；完成 20 案×2 流程并复核错误记录后，公式才形成可报告摘要。"]];
  sheet.getRange("A12:M14").format = {
    fill: COLORS.amberPale,
    font: { bold: true, color: COLORS.amberText, fontSize: 11 },
    wrapText: true,
    verticalAlignment: "center",
    horizontalAlignment: "left",
  };
  [24, 13, 15, 13, 13, 13, 15, 15, 13, 13, 13, 15, 15].forEach((width, index) => {
    sheet.getRange(`${columnName(index)}1:${columnName(index)}16`).format.columnWidth = width;
  });
  sheet.freezePanes.freezeRows(5);
  return {
    sheet,
    usedRange: "A1:M14",
    previewRange: "A1:M14",
    expectedDataValidationCount: 0,
    expectedDataValidations: [],
    expectedTablePartCount: 1,
  };
}

async function buildExperimentWorkbook(inputs) {
  const workbook = Workbook.create();
  const sheetMeta = [createExperimentGuide(workbook)];
  const assignments = assignExperimentGroups(fixtureRecords(inputs.gold));

  sheetMeta.push(writeStandardSheet(workbook, {
    name: "分组设计",
    tableName: "FixedSeedAssignment",
    title: "固定种子 AB/BA 分组｜20 案",
    subtitle: "按 SHA-256(seed|case_id) 固定排序，前 10 案为 AB、后 10 案为 BA；展示顺序按 case_id，不改变分组。",
    columns: [
      { label: "case_id", key: "case_id", width: 18 },
      { label: "gold_id", key: "gold_id", width: 18 },
      { label: "group", key: "group", width: 10 },
      { label: "第 1 次", key: "order_1", width: 16 },
      { label: "第 2 次", key: "order_2", width: 16 },
      { label: "固定种子", key: "seed", width: 24 },
      { label: "分组键（前16位）", key: "rank_key", width: 22 },
      { label: "数据范围", key: "data_scope", width: 20 },
    ],
    rows: assignments.map((item) => [item.case_id, item.gold_id, item.group, item.order_1, item.order_2, EXPERIMENT_SEED, item.rank_key.slice(0, 16), DATA_SCOPE]),
    validations: { 2: ["AB", "BA"] },
  }));

  const rawRows = [];
  for (const item of assignments) {
    for (const method of [item.order_1, item.order_2]) {
      rawRows.push([
        item.case_id,
        item.gold_id,
        item.group,
        method,
        method === item.order_1 ? 1 : 2,
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "待录入",
        "",
        "",
      ]);
    }
  }
  const rawMeta = writeStandardSheet(workbook, {
    name: "原始记录",
    tableName: "ExperimentRawEntry",
    title: "20 案 × 人工 SOP / NeoLoop｜原始录入区",
    subtitle: "黄色列必须来自实际执行；时间、操作次数、遗漏、修改和漏检均为空，不能用 0 代替未测试。",
    columns: [
      { label: "case_id", key: "case_id", width: 18 },
      { label: "gold_id", key: "gold_id", width: 18 },
      { label: "group", key: "group", width: 10 },
      { label: "method", key: "method", width: 16 },
      { label: "顺序", key: "order", width: 10, numberFormat: "0" },
      { label: "操作者", key: "operator", width: 18 },
      { label: "开始时间", key: "started_at", width: 20, numberFormat: "yyyy-mm-dd hh:mm" },
      { label: "结束时间", key: "ended_at", width: 20, numberFormat: "yyyy-mm-dd hh:mm" },
      { label: "用时分钟（公式）", key: "duration_minutes", width: 18, numberFormat: "0.00" },
      { label: "人工操作次数", key: "manual_actions", width: 16, numberFormat: "0" },
      { label: "证据遗漏数", key: "evidence_omissions", width: 16, numberFormat: "0" },
      { label: "路由修改数", key: "routing_changes", width: 16, numberFormat: "0" },
      { label: "高风险漏检数", key: "high_risk_misses", width: 17, numberFormat: "0" },
      { label: "状态", key: "status", width: 14 },
      { label: "备注", key: "notes", width: 34 },
      { label: "完整性检查（公式）", key: "quality_check", width: 22 },
    ],
    rows: rawRows,
    validations: {
      2: ["AB", "BA"],
      3: ["人工 SOP", "NeoLoop"],
      13: ["待录入", "进行中", "已完成", "作废"],
    },
    editableColumns: [5, 6, 7, 9, 10, 11, 12, 13, 14],
    previewRowLimit: 28,
  });
  for (let row = 6; row <= 45; row += 1) {
    rawMeta.sheet.getRange(`I${row}`).formulas = [[`=IF(OR(G${row}="",H${row}="",N${row}<>"已完成"),"",(H${row}-G${row})*1440)`]];
    rawMeta.sheet.getRange(`P${row}`).formulas = [[`=IF(N${row}<>"已完成","待录入",IF(OR(F${row}="",G${row}="",H${row}="",J${row}="",K${row}="",L${row}="",M${row}=""),"需补齐",IF(H${row}<G${row},"时间倒置",IF(OR(J${row}<0,K${row}<0,L${row}<0,M${row}<0,MOD(J${row},1)<>0,MOD(K${row},1)<>0,MOD(L${row},1)<>0,MOD(M${row},1)<>0),"指标需非负整数","完整"))))`]];
  }
  rawMeta.sheet.getRange("I6:I45").format.fill = COLORS.bluePale;
  rawMeta.sheet.getRange("P6:P45").format.fill = COLORS.bluePale;
  rawMeta.sheet.dataValidations.add({ range: "J6:M45", rule: { type: "whole", operator: "between", formula1: 0, formula2: 100000 } });
  rawMeta.expectedDataValidations.push({
    sqref: "J6:M45",
    type: "whole",
    operator: "between",
    formula1: "0",
    formula2: "100000",
  });
  rawMeta.expectedDataValidationCount = rawMeta.expectedDataValidations.length;
  sheetMeta.push(rawMeta);

  const errorRows = Array.from({ length: 20 }, (_, index) => [index + 1, "待录入", "", "", "", "", "", "", "", ""]);
  sheetMeta.push(writeStandardSheet(workbook, {
    name: "错误记录",
    tableName: "ExperimentErrorEntry",
    title: "错误记录｜20 个空白槽位",
    subtitle: "只有实际发生的错误才填写；空槽位不是“零错误”，也不构成流程通过证据。",
    columns: [
      { label: "槽位", key: "slot", width: 10, numberFormat: "0" },
      { label: "状态", key: "status", width: 14 },
      { label: "error_id", key: "error_id", width: 18 },
      { label: "case_id", key: "case_id", width: 18 },
      { label: "method", key: "method", width: 16 },
      { label: "错误类型", key: "error_type", width: 22 },
      { label: "错误描述", key: "description", width: 38 },
      { label: "期望行为", key: "expected", width: 32 },
      { label: "实际行为", key: "actual", width: 32 },
      { label: "证据索引", key: "evidence_ref", width: 22 },
    ],
    rows: errorRows,
    validations: {
      1: ["待录入", "已记录", "已复核", "不适用"],
      4: ["人工 SOP", "NeoLoop"],
    },
    editableColumns: [1, 2, 3, 4, 5, 6, 7, 8, 9],
    previewRowLimit: 28,
  }));

  const helperRows = rawRows.map((row) => [row[0], row[2], row[3], row[13], "", "", "", "", "", "", "", "", "", ""]);
  const helperMeta = writeStandardSheet(workbook, {
    name: "计算辅助",
    tableName: "ExperimentFormulaHelper",
    title: "计算辅助｜按方法拆分已完成实测值",
    subtitle: "全部单元格由公式引用原始记录；待录入或未完成行返回空值，汇总不会把空白当成 0。",
    columns: [
      { label: "case_id", key: "case_id", width: 18 },
      { label: "group", key: "group", width: 10 },
      { label: "method", key: "method", width: 16 },
      { label: "status", key: "status", width: 14 },
      { label: "人工_用时", key: "manual_duration", width: 14, numberFormat: "0.00" },
      { label: "NeoLoop_用时", key: "neo_duration", width: 14, numberFormat: "0.00" },
      { label: "人工_操作", key: "manual_actions", width: 14, numberFormat: "0" },
      { label: "NeoLoop_操作", key: "neo_actions", width: 14, numberFormat: "0" },
      { label: "人工_遗漏", key: "manual_omissions", width: 14, numberFormat: "0" },
      { label: "NeoLoop_遗漏", key: "neo_omissions", width: 14, numberFormat: "0" },
      { label: "人工_路由修改", key: "manual_routing", width: 16, numberFormat: "0" },
      { label: "NeoLoop_路由修改", key: "neo_routing", width: 17, numberFormat: "0" },
      { label: "人工_高风险漏检", key: "manual_misses", width: 17, numberFormat: "0" },
      { label: "NeoLoop_高风险漏检", key: "neo_misses", width: 18, numberFormat: "0" },
    ],
    rows: helperRows,
    previewRowLimit: 28,
  });
  for (let row = 6; row <= 45; row += 1) {
    helperMeta.sheet.getRange(`A${row}:N${row}`).formulas = [[
      `='原始记录'!A${row}`,
      `='原始记录'!C${row}`,
      `='原始记录'!D${row}`,
      `='原始记录'!N${row}`,
      `=IF(AND($C${row}="人工 SOP",$D${row}="已完成",'原始记录'!P${row}="完整"),'原始记录'!I${row},"")`,
      `=IF(AND($C${row}="NeoLoop",$D${row}="已完成",'原始记录'!P${row}="完整"),'原始记录'!I${row},"")`,
      `=IF(AND($C${row}="人工 SOP",$D${row}="已完成",'原始记录'!P${row}="完整"),'原始记录'!J${row},"")`,
      `=IF(AND($C${row}="NeoLoop",$D${row}="已完成",'原始记录'!P${row}="完整"),'原始记录'!J${row},"")`,
      `=IF(AND($C${row}="人工 SOP",$D${row}="已完成",'原始记录'!P${row}="完整"),'原始记录'!K${row},"")`,
      `=IF(AND($C${row}="NeoLoop",$D${row}="已完成",'原始记录'!P${row}="完整"),'原始记录'!K${row},"")`,
      `=IF(AND($C${row}="人工 SOP",$D${row}="已完成",'原始记录'!P${row}="完整"),'原始记录'!L${row},"")`,
      `=IF(AND($C${row}="NeoLoop",$D${row}="已完成",'原始记录'!P${row}="完整"),'原始记录'!L${row},"")`,
      `=IF(AND($C${row}="人工 SOP",$D${row}="已完成",'原始记录'!P${row}="完整"),'原始记录'!M${row},"")`,
      `=IF(AND($C${row}="NeoLoop",$D${row}="已完成",'原始记录'!P${row}="完整"),'原始记录'!M${row},"")`,
    ]];
  }
  helperMeta.sheet.getRange("A6:N45").format.fill = COLORS.gray50;
  sheetMeta.push(helperMeta);
  sheetMeta.push(createSummarySheet(workbook));
  setExperimentGuideFormulas(sheetMeta[0].sheet);

  return { workbook, sheetMeta, slug: "experiment", file: "NeoLoop_流程对照实验.xlsx", criticalRange: "汇总!A1:M14" };
}

async function formulaErrorScan(workbook, summary) {
  const result = await workbook.inspect({
    kind: "match",
    searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
    options: { useRegex: true, maxResults: 300 },
    summary,
    maxChars: 6000,
  });
  const ndjson = result.ndjson ?? "";
  const lines = ndjson.split("\n").filter(Boolean);
  let records;
  try {
    records = lines.map((line) => JSON.parse(line));
  } catch (error) {
    return { hits: null, confirmed_zero: false, scan_valid: false, error: `invalid_ndjson: ${error.message}`, ndjson };
  }
  const zeroNotices = records.filter((record) => record.kind === "notice" && /matched 0 entries/i.test(record.message ?? ""));
  const hitRecords = records.filter((record) => /#REF!|#DIV\/0!|#VALUE!|#NAME\?|#N\/A/.test(JSON.stringify(record)));
  const confirmedZero = zeroNotices.length === 1 && records.length === 1;
  const scanValid = confirmedZero || hitRecords.length > 0;
  return {
    hits: confirmedZero ? 0 : hitRecords.length || null,
    confirmed_zero: confirmedZero,
    scan_valid: scanValid,
    ndjson,
  };
}

async function inspectExportedOoxml(outputPath, expectedSheetMeta) {
  const options = { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 };
  const { stdout: listing } = await execFileAsync("/usr/bin/unzip", ["-Z1", outputPath], options);
  const entries = listing.split("\n").filter(Boolean);
  const entrySet = new Set(entries);
  const worksheetEntries = entries.filter((entry) => /^xl\/worksheets\/[^/]+\.xml$/.test(entry));
  const tableEntries = entries.filter((entry) => /^xl\/tables\/table\d+\.xml$/.test(entry));
  const { stdout: workbookXml } = await execFileAsync("/usr/bin/unzip", ["-p", outputPath, "xl/workbook.xml"], options);
  const { stdout: workbookRelsXml } = await execFileAsync("/usr/bin/unzip", ["-p", outputPath, "xl/_rels/workbook.xml.rels"], options);
  const workbookBindings = parseWorkbookSheetBindings(workbookXml, workbookRelsXml);
  const boundSheetMeta = expectedSheetBindings(expectedSheetMeta, workbookBindings);
  const expectedPrintAreas = boundSheetMeta.map(({ local_sheet_id: localSheetId, name, entry, meta }) => ({
    local_sheet_id: localSheetId,
    sheet: name,
    entry,
    range: meta.usedRange,
    formula: printAreaFormula(name, meta.usedRange),
  }));
  const printAreas = [...workbookXml.matchAll(/<(?:[A-Za-z0-9_]+:)?definedName\b([^>]*)>([\s\S]*?)<\/(?:[A-Za-z0-9_]+:)?definedName>/g)]
    .filter((match) => xmlAttribute(match[1], "name") === "_xlnm.Print_Area")
    .map((match) => {
      const localSheetId = Number(xmlAttribute(match[1], "localSheetId"));
      const formula = decodeXmlText(match[2]);
      const expected = expectedPrintAreas.find((item) => item.local_sheet_id === localSheetId);
      return {
        local_sheet_id: localSheetId,
        sheet: expected?.sheet ?? null,
        entry: expected?.entry ?? null,
        formula,
        expected_formula: expected?.formula ?? null,
        matches_expected: expected != null && formula === expected.formula,
      };
    });

  const worksheets = [];
  for (const binding of boundSheetMeta) {
    const { stdout: xml } = await execFileAsync("/usr/bin/unzip", ["-p", outputPath, binding.entry], options);
    const paneTag = xml.match(/<(?:[A-Za-z0-9_]+:)?pane\b[^>]*>/)?.[0] ?? null;
    if (!Array.isArray(binding.meta.expectedDataValidations)) {
      throw new Error(`${binding.name}: expectedDataValidations contract is missing`);
    }
    const dataValidationContract = validateDataValidationContracts(
      xml,
      binding.meta.expectedDataValidations,
    );
    const dataValidationCount = dataValidationContract.actual.length;
    const tablePartCount = (xml.match(/<(?:[A-Za-z0-9_]+:)?tablePart\b/g) ?? []).length;
    const expectedPrintArea = expectedPrintAreas.find((item) => item.local_sheet_id === binding.local_sheet_id);
    const printArea = printAreas.find((item) => item.local_sheet_id === binding.local_sheet_id);
    worksheets.push({
      local_sheet_id: binding.local_sheet_id,
      sheet_id: binding.sheet_id,
      relationship_id: binding.relationship_id,
      entry: binding.entry,
      sheet: binding.name,
      binding_entry_exists: entrySet.has(binding.entry),
      gridlines_hidden: /<[^>]*sheetView\b[^>]*\bshowGridLines="0"/.test(xml),
      freeze_pane_present: paneTag != null,
      freeze_pane_exact: paneTag != null
        && /\bySplit="5"/.test(paneTag)
        && /\btopLeftCell="A6"/.test(paneTag)
        && /\bactivePane="bottomLeft"/.test(paneTag)
        && /\bstate="frozen"/.test(paneTag)
        && !/\bxSplit=/.test(paneTag),
      expected_data_validation_count: binding.meta.expectedDataValidationCount,
      data_validation_count: dataValidationCount,
      expected_data_validations: dataValidationContract.expected,
      data_validations: dataValidationContract.actual,
      missing_data_validations: dataValidationContract.missing,
      unexpected_data_validations: dataValidationContract.unexpected,
      data_validations_exact: dataValidationContract.exact
        && dataValidationCount === binding.meta.expectedDataValidationCount,
      expected_table_part_count: binding.meta.expectedTablePartCount,
      table_part_count: tablePartCount,
      table_parts_exact: tablePartCount === binding.meta.expectedTablePartCount,
      expected_print_area_formula: expectedPrintArea.formula,
      print_area_formula: printArea?.formula ?? null,
      print_area_exact: printArea?.matches_expected === true,
      custom_column_widths_present: /<(?:[A-Za-z0-9_]+:)?col\b[^>]*\bcustomWidth="1"/.test(xml),
    });
  }
  const tables = [];
  for (const entry of tableEntries) {
    const { stdout: xml } = await execFileAsync("/usr/bin/unzip", ["-p", outputPath, entry], options);
    tables.push({ entry, auto_filter_present: /<(?:[A-Za-z0-9_]+:)?autoFilter\b/.test(xml) });
  }
  const printAreasExact = printAreas.length === expectedPrintAreas.length
    && expectedPrintAreas.every((expected) => printAreas.some((actual) => (
      actual.local_sheet_id === expected.local_sheet_id
      && actual.formula === expected.formula
    )));
  const worksheetBindingsExact = workbookBindings.length === expectedSheetMeta.length
    && worksheetEntries.length === expectedSheetMeta.length
    && worksheets.every((sheet) => sheet.binding_entry_exists)
    && new Set(worksheets.map((sheet) => sheet.entry)).size === worksheets.length;
  return {
    worksheet_xml_count: worksheetEntries.length,
    workbook_sheet_binding_count: workbookBindings.length,
    worksheet_bindings_exact: worksheetBindingsExact,
    table_xml_count: tables.length,
    data_validation_sheet_count: worksheets.filter((sheet) => sheet.data_validation_count > 0).length,
    data_validation_count: worksheets.reduce((sum, sheet) => sum + sheet.data_validation_count, 0),
    data_validations_exact_all: worksheets.every((sheet) => sheet.data_validations_exact),
    freeze_pane_sheet_count: worksheets.filter((sheet) => sheet.freeze_pane_present).length,
    freeze_pane_exact_sheet_count: worksheets.filter((sheet) => sheet.freeze_pane_exact).length,
    table_parts_exact_all: worksheets.every((sheet) => sheet.table_parts_exact),
    explicit_print_area_count: printAreas.length,
    explicit_print_areas_exact: printAreasExact,
    gridlines_hidden_all: worksheets.length > 0 && worksheets.every((sheet) => sheet.gridlines_hidden),
    table_parts_present_all: worksheets.length > 0 && worksheets.every((sheet) => sheet.table_part_count > 0),
    table_auto_filters_present_all: tables.length > 0 && tables.every((table) => table.auto_filter_present),
    custom_column_widths_present_all: worksheets.length > 0 && worksheets.every((sheet) => sheet.custom_column_widths_present),
    worksheets,
    tables,
    print_areas: printAreas,
  };
}

async function inspectCriticalRange(workbook, range) {
  const result = await workbook.inspect({
    kind: "table",
    range,
    include: "values,formulas",
    tableMaxRows: 20,
    tableMaxCols: 16,
    maxChars: 7000,
  });
  return result.ndjson ?? "";
}

function stableNumber(value) {
  return Number(value.toPrecision(15));
}

function isoStringToExcelSerial(value) {
  return stableNumber((new Date(value).getTime() / 86_400_000) + 25_569);
}

function incrementNormalization(stats, key) {
  stats[key] = (stats[key] ?? 0) + 1;
}

function normalizeFingerprintValue(value, stats) {
  if (value === undefined || value === null || value === "") {
    incrementNormalization(stats, "blank_to_null");
    return null;
  }
  if (value instanceof Date) {
    incrementNormalization(stats, "date_object_to_excel_serial_semantic_candidates");
    return { __neoloop_excel_date_serial_candidates: excelSerialCandidatesFromDate(value) };
  }
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)) {
    incrementNormalization(stats, "iso_utc_string_to_excel_serial");
    return isoStringToExcelSerial(value);
  }
  if (Array.isArray(value)) return value.map((nested) => normalizeFingerprintValue(nested, stats));
  if (isPlainObject(value)) {
    return Object.fromEntries(Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, normalizeFingerprintValue(nested, stats)]));
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("Non-finite workbook number reached normalization");
    return stableNumber(value);
  }
  return value;
}

function valuesAndFormulasFingerprint(sheet, usedRange) {
  const range = sheet.getRange(usedRange);
  const rawValues = range.values ?? [];
  const rawFormulas = range.formulas ?? [];
  assertFiniteWorkbookValue(rawValues, `${sheet.name}!${usedRange}.values`);
  assertFiniteWorkbookValue(rawFormulas, `${sheet.name}!${usedRange}.formulas`);
  const valueNormalizationCounts = {};
  const formulaNormalizationCounts = {};
  const payload = {
    values: normalizeFingerprintValue(rawValues, valueNormalizationCounts),
    formulas: normalizeFingerprintValue(rawFormulas, formulaNormalizationCounts),
  };
  const serialized = JSON.stringify(payload);
  return {
    sha256: sha256(Buffer.from(serialized, "utf8")),
    serialized_size_bytes: Buffer.byteLength(serialized),
    normalization_counts: {
      values: valueNormalizationCounts,
      formulas: formulaNormalizationCounts,
    },
    payload,
  };
}

function dateSerialCandidates(value) {
  const candidates = value?.__neoloop_excel_date_serial_candidates;
  if (!isPlainObject(candidates)) return null;
  if (!Number.isFinite(candidates.utc_instant) || !Number.isFinite(candidates.local_fields)) return null;
  return candidates;
}

function semanticFingerprintValueEqual({
  preValue,
  postValue,
  kind,
  cell,
  equivalenceCounts,
  equivalenceSamples,
  sampleLimitPerCandidate,
}) {
  if (JSON.stringify(preValue) === JSON.stringify(postValue)) return true;
  const preCandidates = dateSerialCandidates(preValue);
  if (preCandidates == null || kind !== "values" || typeof postValue !== "number") return false;
  const candidate = matchExactExcelDateSerialCandidate(postValue, preCandidates);
  if (candidate == null) return false;
  const key = candidate === "utc_instant"
    ? "date_object_matched_utc_instant_serial"
    : "date_object_matched_local_fields_serial";
  incrementNormalization(equivalenceCounts, key);
  if (equivalenceSamples[key].length < sampleLimitPerCandidate) {
    equivalenceSamples[key].push({
      cell,
      kind,
      matched_candidate: candidate,
      exact_post_serial: postValue,
      exact_candidate_serial: preCandidates[candidate],
    });
  }
  return true;
}

function fingerprintMismatchSummary(preExport, postExport, sampleLimit = 12) {
  const samples = [];
  const semanticEquivalenceCounts = {
    date_object_matched_utc_instant_serial: 0,
    date_object_matched_local_fields_serial: 0,
  };
  const semanticEquivalenceSamples = {
    date_object_matched_utc_instant_serial: [],
    date_object_matched_local_fields_serial: [],
  };
  const semanticEquivalenceSampleLimitPerCandidate = 8;
  let mismatchCount = 0;
  for (const kind of ["values", "formulas"]) {
    const preRows = preExport.payload[kind] ?? [];
    const postRows = postExport.payload[kind] ?? [];
    const rowCount = Math.max(preRows.length, postRows.length);
    for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
      const preRow = preRows[rowIndex] ?? [];
      const postRow = postRows[rowIndex] ?? [];
      const columnCount = Math.max(preRow.length, postRow.length);
      for (let columnIndex = 0; columnIndex < columnCount; columnIndex += 1) {
        const preValue = preRow[columnIndex] ?? null;
        const postValue = postRow[columnIndex] ?? null;
        const cell = `${columnName(columnIndex)}${rowIndex + 1}`;
        if (semanticFingerprintValueEqual({
          preValue,
          postValue,
          kind,
          cell,
          equivalenceCounts: semanticEquivalenceCounts,
          equivalenceSamples: semanticEquivalenceSamples,
          sampleLimitPerCandidate: semanticEquivalenceSampleLimitPerCandidate,
        })) continue;
        mismatchCount += 1;
        if (samples.length < sampleLimit) {
          samples.push({
            kind,
            cell,
            pre_type: typeof preValue,
            post_type: typeof postValue,
            pre: truncate(preValue, 120),
            post: truncate(postValue, 120),
          });
        }
      }
    }
  }
  return {
    mismatch_count: mismatchCount,
    samples,
    semantic_equivalence_counts: semanticEquivalenceCounts,
    semantic_equivalence_sample_limit_per_candidate: semanticEquivalenceSampleLimitPerCandidate,
    semantic_equivalence_samples: semanticEquivalenceSamples,
    non_date_value_match_policy: "single_exact_normalized_value_only",
    formula_match_policy: "single_exact_normalized_formula_only",
  };
}

async function renderAndExport(build, { workingOutput, publishedOutput }) {
  const previewDirectory = resolve(workingOutput, "previews", build.slug);
  const publishedPreviewDirectory = resolve(publishedOutput, "previews", build.slug);
  await mkdir(previewDirectory, { recursive: true });
  const preExportErrors = await formulaErrorScan(build.workbook, `${build.file} pre-export formula error scan`);
  const preExportCritical = await inspectCriticalRange(build.workbook, build.criticalRange);
  const preExportFingerprints = new Map(build.sheetMeta.map((meta) => [
    meta.sheet.name,
    valuesAndFormulasFingerprint(meta.sheet, meta.usedRange),
  ]));
  const outputPath = resolve(workingOutput, build.file);
  const publishedPath = resolve(publishedOutput, build.file);
  const exported = await SpreadsheetFile.exportXlsx(build.workbook);
  await exported.save(outputPath);
  const metadataPostprocess = await repairExportedWorkbookMetadata(outputPath, build.sheetMeta);
  const { stdout: zipTestOutput } = await execFileAsync("/usr/bin/unzip", ["-t", outputPath], {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  const zipIntegrity = {
    command: "/usr/bin/unzip -t",
    passed: /No errors detected in compressed data/.test(zipTestOutput),
  };
  if (!zipIntegrity.passed) throw new Error(`${build.file}: unzip integrity check did not report success`);

  const imported = await SpreadsheetFile.importXlsx(await FileBlob.load(outputPath));
  const postExportErrors = await formulaErrorScan(imported, `${build.file} post-export formula error scan`);
  const postExportCritical = await inspectCriticalRange(imported, build.criticalRange);
  const sheetNamesAfterReimport = Array.from(
    { length: build.expectedSheetNames.length },
    (_, index) => imported.worksheets.getItemAt(index).name,
  );
  const sheetCatalogMatches = JSON.stringify(sheetNamesAfterReimport) === JSON.stringify(build.expectedSheetNames);
  const usedRangeFingerprints = build.sheetMeta.map((meta, index) => {
    const importedSheet = imported.worksheets.getItemAt(index);
    if (importedSheet.name !== meta.sheet.name) {
      throw new Error(`${build.file}: cannot fingerprint ${meta.sheet.name}; reimported index ${index} is ${importedSheet.name}`);
    }
    const preExport = preExportFingerprints.get(meta.sheet.name);
    const postExport = valuesAndFormulasFingerprint(importedSheet, meta.usedRange);
    const mismatch = fingerprintMismatchSummary(preExport, postExport);
    return {
      sheet: meta.sheet.name,
      used_range: meta.usedRange,
      pre_export_values_formulas_sha256: preExport.sha256,
      post_reimport_values_formulas_sha256: postExport.sha256,
      pre_export_serialized_size_bytes: preExport.serialized_size_bytes,
      post_reimport_serialized_size_bytes: postExport.serialized_size_bytes,
      pre_export_normalization_counts: preExport.normalization_counts,
      post_reimport_normalization_counts: postExport.normalization_counts,
      normalized_hash_match: preExport.sha256 === postExport.sha256,
      semantic_equivalence_counts: mismatch.semantic_equivalence_counts,
      semantic_equivalence_sample_limit_per_candidate: mismatch.semantic_equivalence_sample_limit_per_candidate,
      semantic_equivalence_samples: mismatch.semantic_equivalence_samples,
      non_date_value_match_policy: mismatch.non_date_value_match_policy,
      formula_match_policy: mismatch.formula_match_policy,
      match: mismatch.mismatch_count === 0,
      mismatch_count: mismatch.mismatch_count,
      mismatch_samples: mismatch.samples,
    };
  });
  const allUsedRangesStable = usedRangeFingerprints.every((item) => item.match);
  const criticalCheck = {
    pre_export_has_review_marker: preExportCritical.includes("需复核"),
    post_export_has_review_marker: postExportCritical.includes("需复核"),
    values_and_formulas_match_after_reimport: preExportCritical === postExportCritical,
  };
  const bytes = await readFile(outputPath);
  const ooxmlChecks = await inspectExportedOoxml(outputPath, build.sheetMeta);
  const freezePanesPersisted = ooxmlChecks.freeze_pane_exact_sheet_count === build.expectedSheetNames.length;
  const printAreasApplied = ooxmlChecks.explicit_print_areas_exact
    && ooxmlChecks.explicit_print_area_count === build.expectedSheetNames.length;

  const renderedSheets = [];
  for (const [index, meta] of build.sheetMeta.entries()) {
    const file = `${String(index + 1).padStart(2, "0")}-${sanitizeFilePart(meta.sheet.name)}.png`;
    const path = resolve(previewDirectory, file);
    const publishedPreviewPath = resolve(publishedPreviewDirectory, file);
    const rendered = await imported.render({
      sheetName: meta.sheet.name,
      range: meta.previewRange,
      scale: 1,
      format: "png",
    });
    const renderedBytes = new Uint8Array(await rendered.arrayBuffer());
    await writeFile(path, renderedBytes);
    const printArea = ooxmlChecks.print_areas.find((item) => item.sheet === meta.sheet.name);
    renderedSheets.push({
      name: meta.sheet.name,
      used_range: meta.usedRange,
      preview_range: meta.previewRange,
      preview_file: publishedPreviewPath,
      working_preview_file: path,
      preview_size_bytes: renderedBytes.byteLength,
      preview_sha256: sha256(renderedBytes),
      render_source: "artifact_tool_reimport_after_ooxml_metadata_repair",
      print_area: {
        requested_range: meta.usedRange,
        ooxml_persisted: printArea?.matches_expected === true,
        formula: printArea?.formula ?? null,
        persistence_method: "post_export_ooxml_metadata_repair",
        reason: `@oai/artifact-tool ${ARTIFACT_TOOL_VERSION} 未提供可持久化的 print-area 写入接口；最终 _xlnm.Print_Area 仅由导出后 OOXML 元数据修复补齐。`,
      },
    });
  }

  return {
    file: build.file,
    path: publishedPath,
    working_path: outputPath,
    sha256: sha256(bytes),
    size_bytes: bytes.byteLength,
    sheet_count: build.sheetMeta.length,
    expected_sheet_names: build.expectedSheetNames,
    sheet_names_after_reimport: sheetNamesAfterReimport,
    sheet_catalog_matches: sheetCatalogMatches,
    artifact_tool_reimport_succeeded: true,
    freeze_panes: {
      requested_rows: 5,
      requested_columns: 0,
      requested_via_public_api: true,
      ooxml_persisted: freezePanesPersisted,
      artifact_tool_reimport_succeeded: true,
      persistence_method: "post_export_ooxml_metadata_repair",
      limitation: `@oai/artifact-tool ${ARTIFACT_TOOL_VERSION} 的 freezeRows 调用未在原生导出中生成 pane；最终 pane 仅由导出后 OOXML 元数据修复补齐。`,
    },
    print_areas: {
      requested_count: build.sheetMeta.length,
      ooxml_persisted: printAreasApplied,
      artifact_tool_reimport_succeeded: true,
      persistence_method: "post_export_ooxml_metadata_repair",
      limitation: `@oai/artifact-tool ${ARTIFACT_TOOL_VERSION} 未提供可持久化的 print-area 写入接口；最终 _xlnm.Print_Area 仅由导出后 OOXML 元数据修复补齐。`,
    },
    metadata_postprocess: metadataPostprocess,
    zip_integrity: zipIntegrity,
    formula_error_scan: {
      pre_export: preExportErrors,
      post_export: postExportErrors,
    },
    critical_range: build.criticalRange,
    critical_inspect_pre_export: preExportCritical,
    critical_inspect_post_export: postExportCritical,
    critical_check: criticalCheck,
    used_range_fingerprints: usedRangeFingerprints,
    all_used_ranges_values_formulas_stable: allUsedRangesStable,
    ooxml_checks: ooxmlChecks,
    rendered_sheets: renderedSheets,
  };
}

async function listRelativeFiles(rootDirectory, currentDirectory = rootDirectory) {
  const files = [];
  for (const entry of await readdir(currentDirectory, { withFileTypes: true })) {
    const path = resolve(currentDirectory, entry.name);
    if (entry.isDirectory()) files.push(...await listRelativeFiles(rootDirectory, path));
    else if (entry.isFile()) files.push(relative(rootDirectory, path).replaceAll("\\", "/"));
    else throw new Error(`Unexpected non-file package entry: ${path}`);
  }
  return files.sort();
}

function publicWorkbookAudit(item) {
  const { working_path: ignoredWorkingPath, ...publicItem } = item;
  void ignoredWorkingPath;
  publicItem.inspect = (({ working_path: ignoredInspectPath, ...inspect }) => {
    void ignoredInspectPath;
    return inspect;
  })(item.inspect);
  publicItem.rendered_sheets = item.rendered_sheets.map((sheet) => {
    const { working_preview_file: ignoredPreviewPath, ...publicSheet } = sheet;
    void ignoredPreviewPath;
    return publicSheet;
  });
  return publicItem;
}

async function verifyStagedArtifactBindings(stagingDirectory, workbookAudits) {
  const artifacts = [];
  for (const item of workbookAudits) {
    artifacts.push({
      kind: "xlsx",
      relative_path: relative(stagingDirectory, item.working_path).replaceAll("\\", "/"),
      path: item.working_path,
      expected_sha256: item.sha256,
      expected_size_bytes: item.size_bytes,
    });
    artifacts.push({
      kind: "inspect",
      relative_path: relative(stagingDirectory, item.inspect.working_path).replaceAll("\\", "/"),
      path: item.inspect.working_path,
      expected_sha256: item.inspect.sha256,
      expected_size_bytes: item.inspect.size_bytes,
    });
    for (const sheet of item.rendered_sheets) {
      artifacts.push({
        kind: "preview",
        relative_path: relative(stagingDirectory, sheet.working_preview_file).replaceAll("\\", "/"),
        path: sheet.working_preview_file,
        expected_sha256: sheet.preview_sha256,
        expected_size_bytes: sheet.preview_size_bytes,
      });
    }
  }

  const verifiedArtifacts = [];
  for (const artifact of artifacts) {
    const bytes = await readFile(artifact.path);
    const actualSha256 = sha256(bytes);
    verifiedArtifacts.push({
      kind: artifact.kind,
      relative_path: artifact.relative_path,
      sha256: actualSha256,
      size_bytes: bytes.byteLength,
      hash_matches: actualSha256 === artifact.expected_sha256,
      size_matches: bytes.byteLength === artifact.expected_size_bytes,
    });
  }
  const actualRelativeFiles = await listRelativeFiles(stagingDirectory);
  const expectedRelativeFiles = verifiedArtifacts.map((artifact) => artifact.relative_path).sort();
  const fileSetExact = JSON.stringify(actualRelativeFiles) === JSON.stringify(expectedRelativeFiles);
  return {
    expected_artifact_count_before_audit: 32,
    actual_artifact_count_before_audit: actualRelativeFiles.length,
    file_set_exact: fileSetExact,
    hashes_and_sizes_exact: verifiedArtifacts.every((artifact) => artifact.hash_matches && artifact.size_matches),
    all_bound: fileSetExact
      && verifiedArtifacts.length === 32
      && verifiedArtifacts.every((artifact) => artifact.hash_matches && artifact.size_matches),
    artifacts: verifiedArtifacts,
  };
}

async function buildStagedWorkbookPackage(stagingDirectory, publishedOutput) {
  await mkdir(resolve(stagingDirectory, "previews"), { recursive: true });

  const manifest = await readJson(resolve(CANONICAL, "manifest.json"));
  const migration = await readJson(resolve(CANONICAL, "migration/legacy-to-canonical.json"));
  const tables = Object.fromEntries(await Promise.all(manifest.tables.map(async (definition) => [
    definition.name,
    await readJson(resolve(CANONICAL, "tables", definition.file)),
  ])));
  const gold = await readJson(resolve(CANONICAL, "gold/case-gold.json"));
  const adversarial = await readJson(resolve(CANONICAL, "adversarial/safety-adversarial.json"));
  const mainStory = await readJson(resolve(CANONICAL, "scenarios/main-story.json"));
  const failureDrills = await readJson(resolve(CANONICAL, "scenarios/failure-drills.json"));
  const catalog = await readJson(resolve(CANONICAL, "workbooks/workbook-catalog.json"));
  const fixtureDocuments = [gold, adversarial, mainStory, failureDrills];
  if (manifest.schema_version !== SCHEMA_VERSION || manifest.fixture_index?.fixture_version !== FIXTURE_VERSION) {
    throw new Error("manifest schema_version 或 fixture_version 与 builder 冻结版本不一致");
  }
  if (fixtureDocuments.some((document) => document.schema_version !== SCHEMA_VERSION || document.fixture_version !== FIXTURE_VERSION || document.data_scope !== DATA_SCOPE || document.evidence_class !== DATA_SCOPE)) {
    throw new Error("fixture 文档版本、schema 或 synthetic_experiment 事实边界不一致");
  }
  if (catalog.catalog_version !== CATALOG_VERSION || catalog.schema_version !== SCHEMA_VERSION || catalog.data_scope !== DATA_SCOPE) {
    throw new Error("workbook catalog 版本、schema 或事实边界不一致");
  }

  const canonicalInputPaths = [
    "manifest.json",
    "migration/legacy-to-canonical.json",
    "gold/case-gold.json",
    "adversarial/safety-adversarial.json",
    "scenarios/main-story.json",
    "scenarios/failure-drills.json",
    "workbooks/workbook-catalog.json",
    ...manifest.tables.map((definition) => `tables/${definition.file}`),
  ];
  const canonicalInputHashes = Object.fromEntries(await Promise.all(canonicalInputPaths.map(async (file) => [
    `data/canonical/${file}`,
    sha256(await readFile(resolve(CANONICAL, file))),
  ])));
  const inputs = { manifest, migration, tables, gold, adversarial, mainStory, failureDrills, catalog };
  const builds = [
    await buildDataWorkbook(inputs),
    await buildEvaluationWorkbook(inputs),
    await buildExperimentWorkbook(inputs),
  ];
  const catalogByFile = new Map(catalog.workbooks.map((workbook) => [workbook.file, workbook.sheets]));
  for (const build of builds) build.expectedSheetNames = catalogByFile.get(build.file) ?? [];

  const workbookAudits = [];
  for (const build of builds) {
    workbookAudits.push(await renderAndExport(build, {
      workingOutput: stagingDirectory,
      publishedOutput,
    }));
  }
  for (const item of workbookAudits) {
    const workingInspectPath = `${item.working_path}.inspect.ndjson`;
    const publishedInspectPath = `${item.path}.inspect.ndjson`;
    const inspectRecords = [
      {
        kind: "build_binding",
        schema_version: SCHEMA_VERSION,
        fixture_version: FIXTURE_VERSION,
        catalog_version: CATALOG_VERSION,
        data_scope: DATA_SCOPE,
        artifact_tool_version: ARTIFACT_TOOL_VERSION,
        canonical_input_sha256: canonicalInputHashes,
        workbook_file: item.file,
        workbook_sha256: item.sha256,
      },
      {
        kind: "sheet_catalog",
        expected: item.expected_sheet_names,
        reimported: item.sheet_names_after_reimport,
        matches: item.sheet_catalog_matches,
      },
      {
        kind: "all_used_ranges_values_formulas",
        all_stable: item.all_used_ranges_values_formulas_stable,
        sheets: item.used_range_fingerprints,
      },
      {
        kind: "formula_error_scan",
        pre_export: item.formula_error_scan.pre_export,
        post_export: item.formula_error_scan.post_export,
      },
      {
        kind: "critical_range_reimport",
        range: item.critical_range,
        check: item.critical_check,
        pre_export: item.critical_inspect_pre_export,
        post_export: item.critical_inspect_post_export,
      },
      {
        kind: "ooxml_read_only_audit",
        worksheet_xml_count: item.ooxml_checks.worksheet_xml_count,
        workbook_sheet_binding_count: item.ooxml_checks.workbook_sheet_binding_count,
        worksheet_bindings_exact: item.ooxml_checks.worksheet_bindings_exact,
        table_xml_count: item.ooxml_checks.table_xml_count,
        data_validation_sheet_count: item.ooxml_checks.data_validation_sheet_count,
        data_validation_count: item.ooxml_checks.data_validation_count,
        data_validations_exact_all: item.ooxml_checks.data_validations_exact_all,
        freeze_pane_sheet_count: item.ooxml_checks.freeze_pane_sheet_count,
        freeze_pane_exact_sheet_count: item.ooxml_checks.freeze_pane_exact_sheet_count,
        table_parts_exact_all: item.ooxml_checks.table_parts_exact_all,
        explicit_print_area_count: item.ooxml_checks.explicit_print_area_count,
        explicit_print_areas_exact: item.ooxml_checks.explicit_print_areas_exact,
        gridlines_hidden_all: item.ooxml_checks.gridlines_hidden_all,
        table_parts_present_all: item.ooxml_checks.table_parts_present_all,
        table_auto_filters_present_all: item.ooxml_checks.table_auto_filters_present_all,
        custom_column_widths_present_all: item.ooxml_checks.custom_column_widths_present_all,
        worksheets: item.ooxml_checks.worksheets,
        print_areas: item.ooxml_checks.print_areas,
      },
      {
        kind: "ooxml_metadata_postprocess",
        ...item.metadata_postprocess,
        zip_integrity: item.zip_integrity,
      },
      {
        kind: "preview_catalog",
        previews: item.rendered_sheets.map((sheet) => ({
          sheet: sheet.name,
          range: sheet.preview_range,
          file: sheet.preview_file,
          sha256: sheet.preview_sha256,
          size_bytes: sheet.preview_size_bytes,
        })),
      },
    ];
    const inspectBytes = Buffer.from(`${inspectRecords.map((record) => JSON.stringify(record)).join("\n")}\n`, "utf8");
    await writeFile(workingInspectPath, inspectBytes);
    item.inspect = {
      path: publishedInspectPath,
      working_path: workingInspectPath,
      sha256: sha256(inspectBytes),
      size_bytes: inspectBytes.byteLength,
    };
  }

  const formulaScansClean = workbookAudits.every((item) => item.formula_error_scan.pre_export.confirmed_zero && item.formula_error_scan.post_export.confirmed_zero);
  const sheetCatalogsMatch = workbookAudits.every((item) => item.sheet_catalog_matches);
  const criticalRangesStable = workbookAudits.every((item) => !item.critical_check.pre_export_has_review_marker && !item.critical_check.post_export_has_review_marker && item.critical_check.values_and_formulas_match_after_reimport);
  const allUsedRangesStable = workbookAudits.every((item) => item.all_used_ranges_values_formulas_stable);
  const dateSemanticAuditComplete = workbookAudits.every((item) => item.used_range_fingerprints.every((sheet) => {
    const counts = sheet.semantic_equivalence_counts;
    const samples = sheet.semantic_equivalence_samples;
    const limit = sheet.semantic_equivalence_sample_limit_per_candidate;
    const keys = [
      "date_object_matched_utc_instant_serial",
      "date_object_matched_local_fields_serial",
    ];
    return sheet.mismatch_count === 0
      && sheet.mismatch_samples.length === 0
      && sheet.non_date_value_match_policy === "single_exact_normalized_value_only"
      && sheet.formula_match_policy === "single_exact_normalized_formula_only"
      && Number.isInteger(limit)
      && limit > 0
      && keys.every((key) => (
        Number.isInteger(counts?.[key])
        && counts[key] >= 0
        && Array.isArray(samples?.[key])
        && samples[key].length <= limit
        && (counts[key] === 0 ? samples[key].length === 0 : samples[key].length > 0)
        && samples[key].every((sample) => (
          sample.kind === "values"
          && typeof sample.cell === "string"
          && sample.exact_post_serial === sample.exact_candidate_serial
          && Number.isFinite(sample.exact_post_serial)
        ))
      ));
  }));
  const usedRangeFingerprintCount = workbookAudits.reduce((sum, item) => sum + item.used_range_fingerprints.length, 0);
  const previewsNonempty = workbookAudits.every((item) => item.rendered_sheets.every((sheet) => sheet.preview_size_bytes > 0));
  const artifactToolReimportSucceeded = workbookAudits.every((item) => item.artifact_tool_reimport_succeeded === true);
  const freezePanesOoxmlPersisted = workbookAudits.every((item) => item.freeze_panes.ooxml_persisted === true);
  const printAreasOoxmlPersisted = workbookAudits.every((item) => (
    item.print_areas.ooxml_persisted === true
    && item.rendered_sheets.every((sheet) => sheet.print_area.ooxml_persisted)
  ));
  const ooxmlChangeWhitelistExact = workbookAudits.every((item) => (
    item.metadata_postprocess.change_whitelist?.passed === true
    && item.metadata_postprocess.change_whitelist?.additions_strip_to_original_byte_exact === true
    && item.metadata_postprocess.change_whitelist?.all_other_entries_byte_identical === true
    && item.metadata_postprocess.change_whitelist?.actual_changed_entries?.length === item.sheet_count + 1
  ));
  const worksheetBindingsExact = workbookAudits.every((item) => item.ooxml_checks.worksheet_bindings_exact);
  const zipIntegrityOk = workbookAudits.every((item) => item.zip_integrity.passed === true);
  const totalTableCount = workbookAudits.reduce((sum, item) => sum + item.ooxml_checks.table_xml_count, 0);
  const totalDataValidationSheetCount = workbookAudits.reduce((sum, item) => sum + item.ooxml_checks.data_validation_sheet_count, 0);
  const totalDataValidationCount = workbookAudits.reduce((sum, item) => sum + item.ooxml_checks.data_validation_count, 0);
  const expectedDataValidationCount = builds.reduce((sum, build) => sum + build.sheetMeta.reduce((sheetSum, meta) => sheetSum + meta.expectedDataValidationCount, 0), 0);
  const experimentRawValidationSheet = workbookAudits
    .find((item) => item.file === "NeoLoop_流程对照实验.xlsx")
    ?.ooxml_checks.worksheets.find((sheet) => sheet.sheet === "原始记录");
  const dataValidationContractsExact = workbookAudits.every((item) => (
    item.ooxml_checks.data_validations_exact_all
    && item.ooxml_checks.worksheets.every((sheet) => (
      sheet.data_validations_exact
      && sheet.data_validation_count === sheet.expected_data_validation_count
      && sheet.data_validations.length === sheet.expected_data_validations.length
    ))
  ))
    && totalDataValidationSheetCount === 13
    && totalDataValidationCount === 22
    && expectedDataValidationCount === 22
    && experimentRawValidationSheet?.data_validation_count === 4
    && experimentRawValidationSheet?.expected_data_validation_count === 4;
  const ooxmlCoreFormattingValid = workbookAudits.every((item) => (
    item.ooxml_checks.worksheet_xml_count === item.sheet_count
    && item.ooxml_checks.workbook_sheet_binding_count === item.sheet_count
    && item.ooxml_checks.worksheet_bindings_exact
    && item.ooxml_checks.gridlines_hidden_all
    && item.ooxml_checks.table_parts_present_all
    && item.ooxml_checks.table_parts_exact_all
    && item.ooxml_checks.table_auto_filters_present_all
    && item.ooxml_checks.custom_column_widths_present_all
    && item.ooxml_checks.data_validations_exact_all
    && item.ooxml_checks.data_validation_sheet_count > 0
  )) && totalTableCount === 27 && dataValidationContractsExact;
  const stagedArtifactBindings = await verifyStagedArtifactBindings(stagingDirectory, workbookAudits);
  const buildIntegrityOk = formulaScansClean
    && sheetCatalogsMatch
    && criticalRangesStable
    && allUsedRangesStable
    && dateSemanticAuditComplete
    && usedRangeFingerprintCount === 26
    && previewsNonempty
    && artifactToolReimportSucceeded
    && worksheetBindingsExact
    && ooxmlChangeWhitelistExact
    && ooxmlCoreFormattingValid
    && stagedArtifactBindings.all_bound;
  const acceptanceReady = buildIntegrityOk
    && zipIntegrityOk
    && freezePanesOoxmlPersisted
    && printAreasOoxmlPersisted;

  const audit = {
    audit_version: "t1-r5-atomic-workbook-audit.2",
    fixture_version: FIXTURE_VERSION,
    catalog_version: CATALOG_VERSION,
    schema_version: SCHEMA_VERSION,
    data_scope: DATA_SCOPE,
    generated_at: new Date().toISOString(),
    runtime: {
      node: process.version,
      artifact_tool: ARTIFACT_TOOL_VERSION,
      package_source: "Codex bundled workspace dependency runtime",
      dependency_install_performed: false,
    },
    atomic_publication: {
      status: acceptanceReady ? "accepted_for_atomic_publish" : "staged_validation_failed",
      immutable_target: true,
      target_directory: publishedOutput,
      same_parent_staging: dirname(stagingDirectory) === dirname(publishedOutput),
      publish_method: "single_same_filesystem_directory_rename",
      target_io_before_publish: "existence_preflight_only",
      expected_published_file_count: 33,
    },
    policy: {
      permission_results_prefilled: false,
      node_results_prefilled: false,
      workflow_results_prefilled: false,
      experiment_measurements_prefilled: false,
      visual_preview_is_process_evidence_only: true,
      workbook_content_authoring: "artifact_tool_only",
      post_export_metadata_scope: ["freeze_panes", "print_areas"],
      post_export_metadata_implementation: "node_builtin_fs_plus_system_zip_unzip",
      post_export_metadata_change_policy: "exact_uncompressed_entry_whitelist_with_strip_round_trip",
      explicit_print_area_status: printAreasOoxmlPersisted
        ? "ooxml_persisted_via_post_export_metadata_repair"
        : "metadata_repair_failed",
      freeze_panes_status: freezePanesOoxmlPersisted
        ? "ooxml_persisted_via_post_export_metadata_repair"
        : "metadata_repair_failed",
    },
    canonical_input_sha256: canonicalInputHashes,
    workbook_count: workbookAudits.length,
    total_sheet_count: workbookAudits.reduce((sum, item) => sum + item.sheet_count, 0),
    used_range_fingerprint_count: usedRangeFingerprintCount,
    total_table_count: totalTableCount,
    total_data_validation_sheet_count: totalDataValidationSheetCount,
    total_data_validation_count: totalDataValidationCount,
    expected_data_validation_count: expectedDataValidationCount,
    total_formula_error_hits_pre_export: workbookAudits.reduce((sum, item) => sum + item.formula_error_scan.pre_export.hits, 0),
    total_formula_error_hits_post_export: workbookAudits.reduce((sum, item) => sum + item.formula_error_scan.post_export.hits, 0),
    staging_artifact_bindings: stagedArtifactBindings,
    integrity_checks: {
      formula_scans_clean: formulaScansClean,
      sheet_catalogs_match: sheetCatalogsMatch,
      critical_ranges_stable_after_reimport: criticalRangesStable,
      all_26_used_ranges_values_formulas_stable: allUsedRangesStable && usedRangeFingerprintCount === 26,
      exact_date_candidate_audit_complete: dateSemanticAuditComplete,
      all_worksheet_previews_nonempty: previewsNonempty,
      all_xlsx_archives_pass_unzip_test: zipIntegrityOk,
      artifact_tool_reimport_succeeded: artifactToolReimportSucceeded,
      worksheet_bindings_exact_via_workbook_rels: worksheetBindingsExact,
      all_data_validation_contracts_exact: dataValidationContractsExact,
      ooxml_change_whitelist_exact: ooxmlChangeWhitelistExact,
      ooxml_core_formatting_valid: ooxmlCoreFormattingValid,
      freeze_panes_ooxml_persisted: freezePanesOoxmlPersisted,
      print_areas_ooxml_persisted: printAreasOoxmlPersisted,
      staging_artifact_hashes_and_file_set_bound: stagedArtifactBindings.all_bound,
    },
    build_integrity_ok: buildIntegrityOk,
    acceptance_ready: acceptanceReady,
    workbooks: workbookAudits.map(publicWorkbookAudit),
  };
  const workingAuditPath = resolve(stagingDirectory, "workbook-build-audit.json");
  const publishedAuditPath = resolve(publishedOutput, "workbook-build-audit.json");
  await writeFile(workingAuditPath, `${JSON.stringify(audit, null, 2)}\n`, "utf8");

  const persistedAudit = JSON.parse(await readFile(workingAuditPath, "utf8"));
  const publishedFileSet = await listRelativeFiles(stagingDirectory);
  const auditPersistedAndPackageExact = persistedAudit.acceptance_ready === acceptanceReady
    && persistedAudit.build_integrity_ok === buildIntegrityOk
    && publishedFileSet.length === 33
    && publishedFileSet.includes("workbook-build-audit.json")
    && stagedArtifactBindings.artifacts.every((artifact) => publishedFileSet.includes(artifact.relative_path));
  if (!auditPersistedAndPackageExact) {
    audit.acceptance_ready = false;
    audit.build_integrity_ok = false;
    audit.atomic_publication.status = "post_audit_binding_failed";
    await writeFile(workingAuditPath, `${JSON.stringify(audit, null, 2)}\n`, "utf8");
    throw new Error("Staged audit or 33-file package binding failed");
  }

  return {
    acceptanceReady: audit.acceptance_ready,
    summary: {
      build_integrity_ok: audit.build_integrity_ok,
      acceptance_ready: audit.acceptance_ready,
      output_directory: publishedOutput,
      audit: publishedAuditPath,
      workbooks: workbookAudits.map((item) => ({ file: item.file, sheets: item.sheet_count, sha256: item.sha256 })),
      rendered_worksheets: audit.total_sheet_count,
      formula_error_hits: {
        pre_export: audit.total_formula_error_hits_pre_export,
        post_export: audit.total_formula_error_hits_post_export,
      },
      atomic_publish_method: "single_same_filesystem_directory_rename",
    },
  };
}

const atomicBuild = await runAtomicDirectoryBuild({
  targetDirectory: FINAL_OUTPUT,
  build: (stagingDirectory) => buildStagedWorkbookPackage(stagingDirectory, FINAL_OUTPUT),
});
console.log(JSON.stringify(atomicBuild.buildResult.summary, null, 2));
