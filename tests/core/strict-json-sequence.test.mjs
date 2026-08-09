import assert from "node:assert/strict";
import test from "node:test";

import { importBuilt } from "./_runtime.mjs";

const {
  OWNER_N1_MAX_FRAME_BYTES,
  StrictJsonSequenceParser,
  parseStrictJsonSequence,
} = await importBuilt("src/neoloop/io/strict-json-sequence.js");

const encoder = new TextEncoder();
const RS = Uint8Array.of(0x1e);
const LF = Uint8Array.of(0x0a);

function concatBytes(...parts) {
  const length = parts.reduce((sum, part) => sum + part.byteLength, 0);
  const combined = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    combined.set(part, offset);
    offset += part.byteLength;
  }
  return combined;
}

function frameText(text) {
  return concatBytes(RS, encoder.encode(text), LF);
}

function parseBytes(bytes, chunkSizes = [bytes.byteLength]) {
  const parser = new StrictJsonSequenceParser();
  const results = [];
  let offset = 0;
  let chunkIndex = 0;
  while (offset < bytes.byteLength) {
    const requested = chunkSizes[chunkIndex % chunkSizes.length];
    const end = Math.min(offset + requested, bytes.byteLength);
    results.push(...parser.push(bytes.subarray(offset, end)));
    offset = end;
    chunkIndex += 1;
  }
  results.push(...parser.finish());
  return results;
}

function success(value) {
  return { ok: true, value };
}

function failure(issueCode) {
  return { ok: false, issue_code: issueCode };
}

function assertSafeFailure(result, issueCode, sentinels = []) {
  assert.deepEqual(result, failure(issueCode));
  assert.deepEqual(Object.keys(result), ["ok", "issue_code"]);
  const serialized = JSON.stringify(result);
  for (const sentinel of sentinels) {
    assert.equal(serialized.includes(sentinel), false);
  }
  for (const forbidden of ["raw", "key", "offset", "pointer", "message", "stack", "cause"]) {
    assert.equal(Object.hasOwn(result, forbidden), false, forbidden);
  }
}

test("exports the frozen 64 KiB per-frame byte limit", () => {
  assert.equal(OWNER_N1_MAX_FRAME_BYTES, 65_536);
});

test("streams one exact RS/object/LF frame including pretty-printed JSON", () => {
  const text = "{\n  \"payload\": {\n    \"label\": \"synthetic\"\n  },\n  \"ok\": true\n}";
  assert.deepEqual(parseBytes(frameText(text)), [success({
    payload: { label: "synthetic" },
    ok: true,
  })]);
});

test("handles RS, multibyte UTF-8, escapes and terminal LF across arbitrary chunks", () => {
  const text = "{\"text\":\"石听\\u001e\\/NeoLoop\",\"nested\":{\"ok\":true}}";
  const bytes = frameText(text);

  assert.deepEqual(parseBytes(bytes, [1]), [success({
    text: "石听\u001e/NeoLoop",
    nested: { ok: true },
  })]);
  assert.deepEqual(parseBytes(bytes, [2, 1, 4, 3]), [success({
    text: "石听\u001e/NeoLoop",
    nested: { ok: true },
  })]);
});

test("rejects broken framing, empty frames, Markdown, raw RS and multiple JSON values", () => {
  const cases = [
    [encoder.encode("{\"private_key\":1}\n"), "private_key"],
    [concatBytes(RS, LF), "empty"],
    [frameText("```json\n{\"x\":1}\n```"), "Markdown"],
    [concatBytes(RS, encoder.encode("{\"x\":1"), RS, encoder.encode("}\n")), "embedded-rs"],
    [frameText("{\"x\":1} {\"y\":2}"), "second-value"],
  ];

  for (const [bytes, sentinel] of cases) {
    const results = parseBytes(bytes);
    assert.equal(results.length, 1);
    assertSafeFailure(results[0], "input_frame_invalid", [sentinel]);
  }
});

test("requires LF termination and rejects bytes after a completed frame", () => {
  const missingLf = concatBytes(RS, encoder.encode("{\"private_tail\":true}"));
  assertSafeFailure(parseBytes(missingLf)[0], "input_frame_invalid", ["private_tail"]);

  const trailing = concatBytes(frameText("{\"x\":1}"), encoder.encode(" private_trailer"));
  const results = parseBytes(trailing);
  assert.deepEqual(results[0], success({ x: 1 }));
  assertSafeFailure(results[1], "input_frame_invalid", ["private_trailer"]);
});

test("accepts only a JSON object at the top level", () => {
  for (const text of ["[]", "null", "true", "\"text\"", "42"]) {
    const results = parseBytes(frameText(text));
    assert.equal(results.length, 1);
    assertSafeFailure(results[0], "input_not_json_object", [text]);
  }
});

test("uses fatal UTF-8 decoding and rejects a UTF-8 BOM", () => {
  const invalidUtf8 = concatBytes(
    RS,
    encoder.encode("{\"private_utf8\":\""),
    Uint8Array.of(0xc3, 0x28),
    encoder.encode("\"}"),
    LF,
  );
  assertSafeFailure(parseBytes(invalidUtf8)[0], "input_invalid_utf8", ["private_utf8"]);

  const bom = concatBytes(RS, Uint8Array.of(0xef, 0xbb, 0xbf), encoder.encode("{\"x\":1}"), LF);
  assertSafeFailure(parseBytes(bom)[0], "input_frame_invalid");
});

test("counts only JSON bytes for the inclusive 65,536-byte frame limit", () => {
  const exactText = `{\"x\":\"${"a".repeat(OWNER_N1_MAX_FRAME_BYTES - 8)}\"}`;
  assert.equal(encoder.encode(exactText).byteLength, OWNER_N1_MAX_FRAME_BYTES);
  const exactResults = parseBytes(frameText(exactText));
  assert.equal(exactResults.length, 1);
  assert.equal(exactResults[0].ok, true);
  assert.equal(exactResults[0].value.x.length, OWNER_N1_MAX_FRAME_BYTES - 8);

  const oversizedText = `{\"x\":\"${"b".repeat(OWNER_N1_MAX_FRAME_BYTES - 7)}\"}`;
  assert.equal(encoder.encode(oversizedText).byteLength, OWNER_N1_MAX_FRAME_BYTES + 1);
  assertSafeFailure(parseBytes(frameText(oversizedText))[0], "input_too_large");
});

test("accepts depth 16 and rejects depth 17", () => {
  const nestedObject = (depth) => `${"{\"x\":".repeat(depth)}0${"}".repeat(depth)}`;
  const depth16 = parseBytes(frameText(nestedObject(16)));
  assert.equal(depth16.length, 1);
  assert.equal(depth16[0].ok, true);

  const depth17 = parseBytes(frameText(nestedObject(17)));
  assertSafeFailure(depth17[0], "input_frame_invalid");
});

test("detects duplicate keys after JSON escape decoding in each object scope", () => {
  const duplicates = [
    "{\"private_root\":1,\"private_root\":2}",
    "{\"nested\":{\"a\":1,\"\\u0061\":2}}",
    "{\"é\":1,\"\\u00e9\":2}",
    "{\"\\/\":1,\"/\":2}",
    "{\"😀\":1,\"\\ud83d\\ude00\":2}",
  ];

  for (const text of duplicates) {
    const results = parseBytes(frameText(text));
    assert.equal(results.length, 1);
    assertSafeFailure(results[0], "input_duplicate_key", ["private_root"]);
  }

  assert.deepEqual(parseBytes(frameText("{\"a\":1,\"nested\":{\"a\":2}}")), [
    success({ a: 1, nested: { a: 2 } }),
  ]);
});

test("rejects non-finite numeric results, negative zero and non-JSON number words", () => {
  for (const text of [
    "{\"n\":1e400}",
    "{\"n\":-0}",
    "{\"n\":-0.0}",
    "{\"n\":-1e-4000}",
    "{\"n\":NaN}",
    "{\"n\":Infinity}",
  ]) {
    assertSafeFailure(parseBytes(frameText(text))[0], "input_frame_invalid", [text]);
  }

  assert.deepEqual(parseBytes(frameText("{\"zero\":0,\"finite\":-1.25e-3}")), [
    success({ zero: 0, finite: -0.00125 }),
  ]);
});

test("preserves two-frame order and rejects a third frame in the same push", () => {
  const parser = new StrictJsonSequenceParser();
  const results = parser.push(concatBytes(
    frameText("{\"attempt\":1}"),
    frameText("{\"attempt\":2}"),
    frameText("{\"private_attempt\":3}"),
  ));

  assert.deepEqual(results.slice(0, 2), [
    success({ attempt: 1 }),
    success({ attempt: 2 }),
  ]);
  assertSafeFailure(results[2], "attempt_limit_reached", ["private_attempt"]);
  assert.deepEqual(parser.finish(), []);
});

test("batch API matches streaming results and finish is terminal without duplicate errors", () => {
  const bytes = concatBytes(frameText("{\"attempt\":1}"), frameText("{\"attempt\":2}"));
  assert.deepEqual(parseStrictJsonSequence([bytes.subarray(0, 3), bytes.subarray(3)]), [
    success({ attempt: 1 }),
    success({ attempt: 2 }),
  ]);

  const parser = new StrictJsonSequenceParser();
  parser.push(concatBytes(RS, encoder.encode("{\"private_partial\":")));
  const firstFinish = parser.finish();
  assertSafeFailure(firstFinish[0], "input_frame_invalid", ["private_partial"]);
  assert.deepEqual(parser.finish(), []);
  assert.deepEqual(parser.push(frameText("{\"ignored\":true}")), []);

  const empty = new StrictJsonSequenceParser();
  assertSafeFailure(empty.finish()[0], "input_frame_invalid");
});
