import assert from "node:assert/strict";
import test from "node:test";

import {
  assertFiniteWorkbookValue,
  excelSerialCandidatesFromDate,
  excelSerialFromDateInstant,
  matchExactExcelDateSerialCandidate,
  validateDataValidationContracts,
  verifyExactEntryWhitelist,
} from "../../scripts/neoloop-data/workbook-atomic-publish.mjs";

const RAW_RECORD_VALIDATIONS = [
  { sqref: "C6:C45", type: "list", operator: null, formula1: '"AB,BA"', formula2: null },
  { sqref: "D6:D45", type: "list", operator: null, formula1: '"人工 SOP,NeoLoop"', formula2: null },
  { sqref: "N6:N45", type: "list", operator: null, formula1: '"待录入,进行中,已完成,作废"', formula2: null },
  { sqref: "J6:M45", type: "whole", operator: "between", formula1: "0", formula2: "100000" },
];

function worksheetXml(validations) {
  const nodes = validations.map((item) => {
    const operator = item.operator == null ? "" : ` operator="${item.operator}"`;
    const formula1 = item.formula1 == null ? "" : `<x:formula1>${item.formula1}</x:formula1>`;
    const formula2 = item.formula2 == null ? "" : `<x:formula2>${item.formula2}</x:formula2>`;
    return `<x:dataValidation type="${item.type}"${operator} sqref="${item.sqref}">${formula1}${formula2}</x:dataValidation>`;
  }).join("");
  return `<x:worksheet><x:dataValidations count="${validations.length}">${nodes}</x:dataValidations></x:worksheet>`;
}

test("原始记录精确绑定 4 条 dataValidation 契约", () => {
  const result = validateDataValidationContracts(worksheetXml(RAW_RECORD_VALIDATIONS), RAW_RECORD_VALIDATIONS);
  assert.equal(result.exact, true);
  assert.equal(result.actual.length, 4);
  assert.deepEqual(result.actual, RAW_RECORD_VALIDATIONS);
});

test("dataValidation 契约不只比数量，sqref/type/operator/formula1/formula2 任一改动都失败", () => {
  const mutations = [
    { field: "sqref", value: "J7:M45" },
    { field: "type", value: "decimal" },
    { field: "operator", value: "greaterThan" },
    { field: "formula1", value: "1" },
    { field: "formula2", value: "99999" },
  ];
  for (const mutation of mutations) {
    const actual = structuredClone(RAW_RECORD_VALIDATIONS);
    actual[3][mutation.field] = mutation.value;
    const result = validateDataValidationContracts(worksheetXml(actual), RAW_RECORD_VALIDATIONS);
    assert.equal(result.exact, false, `${mutation.field} mutation must fail`);
    assert.ok(result.missing.length > 0 || result.unexpected.length > 0);
  }
  const missing = validateDataValidationContracts(worksheetXml(RAW_RECORD_VALIDATIONS.slice(0, 3)), RAW_RECORD_VALIDATIONS);
  assert.equal(missing.exact, false);
});

test("OOXML 白名单只允许精确 workbook/worksheet 元数据变化", () => {
  const before = new Map([
    ["xl/workbook.xml", Buffer.from("<workbook><sheets /></workbook>")],
    ["xl/worksheets/sheet1.xml", Buffer.from("<worksheet><sheetView /></worksheet>")],
    ["xl/styles.xml", Buffer.from("styles-v1")],
  ]);
  const expectedAfter = new Map([
    ["xl/workbook.xml", Buffer.from("<workbook><sheets /><definedNames /></workbook>")],
    ["xl/worksheets/sheet1.xml", Buffer.from("<worksheet><sheetView><pane /><selection /></sheetView></worksheet>")],
  ]);
  const repaired = new Map([
    ...before,
    ...expectedAfter,
  ]);
  const pass = verifyExactEntryWhitelist(before, repaired, expectedAfter);
  assert.equal(pass.passed, true);
  assert.equal(pass.all_other_entries_byte_identical, true);
  assert.equal(pass.allowed_entries_exact, true);
  assert.deepEqual(pass.actual_changed_entries, [...expectedAfter.keys()].sort());

  const unexpectedStyleChange = new Map(repaired);
  unexpectedStyleChange.set("xl/styles.xml", Buffer.from("styles-v2"));
  assert.equal(verifyExactEntryWhitelist(before, unexpectedStyleChange, expectedAfter).passed, false);

  const wrongAllowedChange = new Map(repaired);
  wrongAllowedChange.set("xl/workbook.xml", Buffer.from("<workbook>wrong</workbook>"));
  assert.equal(verifyExactEntryWhitelist(before, wrongAllowedChange, expectedAfter).passed, false);

  const extraEntry = new Map(repaired);
  extraEntry.set("xl/evil.xml", Buffer.from("unexpected"));
  assert.equal(verifyExactEntryWhitelist(before, extraEntry, expectedAfter).passed, false);
});

test("语义 used-range 指纹在归一化前拒绝所有非有限数", () => {
  assert.doesNotThrow(() => assertFiniteWorkbookValue([[0, 1.25, -9], [null, "text", true]]));
  for (const value of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
    assert.throws(
      () => assertFiniteWorkbookValue([[{ nested: [value] }]], "values"),
      /non-finite workbook number/i,
    );
  }
});

test("Date 归一化使用 UTC instant，不把本地时区再叠加到 Excel serial", () => {
  const instant = new Date("2026-07-10T16:35:00.000Z");
  const expected = (instant.getTime() / 86_400_000) + 25_569;
  assert.equal(excelSerialFromDateInstant(instant), Number(expected.toPrecision(15)));
});

test("Date 语义候选同时记录 instant 与本地墙上时间，且两者均为有限数", () => {
  const value = new Date("2026-08-01T00:00:00+08:00");
  const candidates = excelSerialCandidatesFromDate(value);
  assert.ok(Number.isFinite(candidates.utc_instant));
  assert.ok(Number.isFinite(candidates.local_fields));
  assert.ok(Math.abs((candidates.local_fields - candidates.utc_instant) - (1 / 3)) < 1e-9);
});

test("Date serial 只允许 original 的两个 exact 候选，拒绝 7:59、8:01 和任意偏移", () => {
  const candidates = excelSerialCandidatesFromDate(new Date("2026-08-01T00:00:00+08:00"));
  assert.equal(matchExactExcelDateSerialCandidate(candidates.utc_instant, candidates), "utc_instant");
  assert.equal(matchExactExcelDateSerialCandidate(candidates.local_fields, candidates), "local_fields");
  assert.equal(matchExactExcelDateSerialCandidate(candidates.utc_instant + (479 / 1440), candidates), null);
  assert.equal(matchExactExcelDateSerialCandidate(candidates.utc_instant + (481 / 1440), candidates), null);
  assert.equal(matchExactExcelDateSerialCandidate(candidates.utc_instant + (3 / 24), candidates), null);
  assert.equal(matchExactExcelDateSerialCandidate(candidates.utc_instant + 1, candidates), null);
});

test("错误 Date 与非有限 serial 坚决拒绝", () => {
  assert.throws(() => excelSerialCandidatesFromDate(new Date("invalid")), /valid Date/i);
  const candidates = excelSerialCandidatesFromDate(new Date("2026-08-01T00:00:00+08:00"));
  for (const serial of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
    assert.throws(
      () => matchExactExcelDateSerialCandidate(serial, candidates),
      /non-finite workbook number/i,
    );
  }
});
